using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.Standards;

/// <summary>
/// Tier-2 step 2 (docs/standards-engine-spec.md §2): the LLM document extractor. Reads office-standards
/// documents (PDF/text/CSV), chunks them by page, and asks a local Ollama model to pull out WORKSETS and
/// required SHARED PARAMETERS as structured JSON — the same shapes the golden-model extractor produces, so
/// they flow through the identical review UI + builder. Provenance cites the file + page; confidence is
/// clamped below the golden-model tier so document-derived items are unticked-by-default in review.
///
/// Local-first (Ollama, no API key, offline) to match LocalGhostBuilder; override the endpoint/model with
/// SENTINEL_OLLAMA_URL / SENTINEL_LLM_MODEL. A frontier provider can slot in behind the same ExtractAsync.
/// Network + file I/O only — no Revit API — so it awaits safely off the API thread.
/// </summary>
public sealed class DocumentExtractor : IDisposable
{
    private const string DefaultUrl = "http://localhost:11434/api/generate";
    private const string DefaultModel = "llama3";
    private const int ChunkBudgetChars = 6000;      // ~a couple of pages per request; fits an 8B context
    private const double MaxDocConfidence = 0.85;   // keep document items below the golden-model tier

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(5) };
    private readonly string _url;
    private readonly string _model;

    public DocumentExtractor()
    {
        _url = Env("SENTINEL_OLLAMA_URL", DefaultUrl);
        _model = Env("SENTINEL_LLM_MODEL", DefaultModel);
    }

    /// Ollama constrains decoding to this exact shape (its `format` field), so the model can't drift.
    private const string Schema = @"{
  ""type"":""object"",
  ""properties"":{
    ""worksets"":{""type"":""array"",""items"":{""type"":""object"",""properties"":{
      ""name"":{""type"":""string""},""confidence"":{""type"":""number""},""page"":{""type"":""integer""}},
      ""required"":[""name""]}},
    ""shared_parameters"":{""type"":""array"",""items"":{""type"":""object"",""properties"":{
      ""name"":{""type"":""string""},
      ""type"":{""type"":""string"",""enum"":[""Text"",""Length"",""Number"",""Integer"",""YesNo"",""Area"",""Volume"",""Angle""]},
      ""binding"":{""type"":""string"",""enum"":[""instance"",""type""]},
      ""categories"":{""type"":""array"",""items"":{""type"":""string""}},
      ""confidence"":{""type"":""number""},""page"":{""type"":""integer""}},
      ""required"":[""name""]}}
  },
  ""required"":[""worksets"",""shared_parameters""]
}";

    public async Task<StandardsPack> ExtractAsync(IReadOnlyList<string> files, CancellationToken ct = default)
    {
        var worksets = new Dictionary<string, WorksetSpec>(StringComparer.OrdinalIgnoreCase);
        var parameters = new Dictionary<string, SharedParamSpec>(StringComparer.OrdinalIgnoreCase);
        string? firstError = null;
        bool anySuccess = false;

        foreach (var file in files)
        {
            string tag = (DocumentTextReader.IsPdf(file) ? "pdf:" : "doc:") + Path.GetFileName(file);
            var pages = DocumentTextReader.Read(file);

            foreach (var (text, startPage) in Chunk(pages, ChunkBudgetChars))
            {
                ExtractDto dto;
                try { dto = await QueryAsync(text, ct).ConfigureAwait(false); anySuccess = true; }
                catch (Exception ex) { firstError ??= ex.Message; continue; } // partial results survive a bad chunk

                foreach (var w in dto.Worksets)
                    MergeWorkset(worksets, w, tag, startPage);
                foreach (var p in dto.SharedParameters)
                    MergeParameter(parameters, p, tag, startPage);
            }
        }

        // Ollama unreachable / model missing on the very first call -> surface it (nothing to show otherwise).
        if (!anySuccess && firstError is not null)
            throw new InvalidOperationException(
                $"The local LLM could not be reached at {_url} (model '{_model}'). " +
                $"Start Ollama and `ollama pull {_model}`, or set SENTINEL_OLLAMA_URL.\n\n{firstError}");

        var pack = new StandardsPack
        {
            PackKey = files.Count > 0 ? Slug(Path.GetFileNameWithoutExtension(files[0])) : "docs",
            CreatedAt = DateTimeOffset.Now.ToString("o"),
        };
        pack.Provision.Worksets.AddRange(worksets.Values.OrderBy(w => w.Name, StringComparer.OrdinalIgnoreCase));
        pack.Provision.SharedParameters.AddRange(parameters.Values.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase));
        return pack;
    }

    // ---------------- LLM call ----------------
    private async Task<ExtractDto> QueryAsync(string chunkText, CancellationToken ct)
    {
        string prompt =
            "You are extracting a BIM office standard from a document. From the TEXT below, extract two things:\n" +
            "1. Revit WORKSET names (e.g. ARC_Walls, XX_STR Model).\n" +
            "2. Required SHARED PARAMETERS — with data type, whether they bind to instance or type, and the " +
            "Revit categories they apply to (e.g. Walls, Doors, Views).\n" +
            "Only include items the text actually specifies — do not invent. Prefer ISO 19650 naming. " +
            "Set 'confidence' 0..1 by how explicit the text is, and 'page' to the [page N] marker each item came from. " +
            "Return ONLY JSON matching the schema.\n\nTEXT:\n" + chunkText;

        JsonElement format = JsonSerializer.Deserialize<JsonElement>(Schema);
        string payload = JsonSerializer.Serialize(new { model = _model, prompt, stream = false, format });

        using var body = new StringContent(payload, Encoding.UTF8, "application/json");
        using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
        resp.EnsureSuccessStatusCode();

        using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        string inner = doc.RootElement.GetProperty("response").GetString()
                       ?? throw new InvalidOperationException("Empty LLM response.");
        return JsonSerializer.Deserialize<ExtractDto>(inner, JsonOpts) ?? new ExtractDto();
    }

    // ---------------- Merge (dedupe by name, keep highest confidence) ----------------
    private static void MergeWorkset(Dictionary<string, WorksetSpec> sink, WsDto w, string tag, int startPage)
    {
        if (string.IsNullOrWhiteSpace(w.Name)) return;
        double conf = Clamp(w.Confidence);
        if (sink.TryGetValue(w.Name, out var existing) && existing.Confidence >= conf) return;
        sink[w.Name] = new WorksetSpec
        {
            Name = w.Name.Trim(),
            Confidence = conf,
            Provenance = new Provenance { Source = tag, Locator = "p." + (w.Page > 0 ? w.Page : startPage) },
        };
    }

    private static void MergeParameter(Dictionary<string, SharedParamSpec> sink, SpDto p, string tag, int startPage)
    {
        if (string.IsNullOrWhiteSpace(p.Name)) return;
        double conf = Clamp(p.Confidence);
        if (sink.TryGetValue(p.Name, out var existing) && existing.Confidence >= conf) return;
        sink[p.Name] = new SharedParamSpec
        {
            Name = p.Name.Trim(),
            Type = string.IsNullOrWhiteSpace(p.Type) ? "Text" : p.Type,
            Binding = string.Equals(p.Binding, "type", StringComparison.OrdinalIgnoreCase) ? "type" : "instance",
            Categories = (p.Categories ?? new List<string>()).Where(c => !string.IsNullOrWhiteSpace(c)).ToList(),
            Confidence = conf,
            Provenance = new Provenance { Source = tag, Locator = "p." + (p.Page > 0 ? p.Page : startPage) },
        };
    }

    // A model that omits confidence -> treat as a soft 0.6; everything stays below the golden-model tier.
    private static double Clamp(double c) => Math.Min(c <= 0 ? 0.6 : c, MaxDocConfidence);

    // ---------------- Page-preserving chunking ----------------
    private static IEnumerable<(string Text, int StartPage)> Chunk(
        IReadOnlyList<DocumentTextReader.DocPage> pages, int budget)
    {
        var sb = new StringBuilder();
        int startPage = 1;
        foreach (var p in pages)
        {
            string block = $"[page {p.Number}]\n{p.Text}\n";
            if (sb.Length == 0) startPage = p.Number;
            else if (sb.Length + block.Length > budget) { yield return (sb.ToString(), startPage); sb.Clear(); startPage = p.Number; }
            sb.Append(block);
            if (sb.Length >= budget) { yield return (sb.ToString(), startPage); sb.Clear(); }
        }
        if (sb.Length > 0) yield return (sb.ToString(), startPage);
    }

    private static string Slug(string s)
    {
        var chars = (s ?? "docs").ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray();
        var slug = new string(chars).Trim('-');
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        return string.IsNullOrWhiteSpace(slug) ? "docs" : slug;
    }

    private static string Env(string name, string fallback)
    {
        string? v = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(v) ? fallback : v!;
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public void Dispose() => _http.Dispose();

    // ---- wire DTOs (match the Schema above) ----
    private sealed class ExtractDto
    {
        [JsonPropertyName("worksets")] public List<WsDto> Worksets { get; set; } = new();
        [JsonPropertyName("shared_parameters")] public List<SpDto> SharedParameters { get; set; } = new();
    }
    private sealed class WsDto
    {
        [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
        [JsonPropertyName("confidence")] public double Confidence { get; set; }
        [JsonPropertyName("page")] public int Page { get; set; }
    }
    private sealed class SpDto
    {
        [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
        [JsonPropertyName("type")] public string Type { get; set; } = "Text";
        [JsonPropertyName("binding")] public string Binding { get; set; } = "instance";
        [JsonPropertyName("categories")] public List<string>? Categories { get; set; }
        [JsonPropertyName("confidence")] public double Confidence { get; set; }
        [JsonPropertyName("page")] public int Page { get; set; }
    }
}
