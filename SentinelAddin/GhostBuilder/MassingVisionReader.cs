#nullable disable
// Ask a LOCAL vision model (Ollama) for a STRUCTURED massing estimate from the project's images —
// renders, real photos, elevations — not the free-text hint LocalVisionReader returns for the mapping
// prompt. Schema-constrained decoding, same discipline as GhostBuilder's mapping call, so the JSON always
// matches MassingEstimate. Local + offline (nothing leaves the machine); best-effort — no VLM, no images,
// or a bad response yields an all-assumed estimate the reviewer fills, never a crash.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    public sealed class MassingVisionReader : IDisposable
    {
        private static readonly string[] ImageExtensions = { ".png", ".jpg", ".jpeg", ".webp" };

        private const string Prompt =
            "You are estimating a building's MASSING from these images (photos, renders, or elevations). " +
            "Return ONLY JSON matching the schema. Give every dimension in MILLIMETRES. For each number, set " +
            "'confidence' 0..1 — LOW when you are inferring from a single view or a hidden face; a photo can " +
            "never be certain. List in 'facadesSeen' which façades the images actually show " +
            "(front/back/left/right). Put openings only on façades you can see. Do NOT guess interior layout — " +
            "this is envelope massing only.";

        // Constrain decoding to exactly what MassingPlanner reads. A value is {value, confidence, source?}.
        private const string Schema = @"{
  ""type"": ""object"",
  ""properties"": {
    ""footprintWidthMm"": {""$ref"":""#/$defs/val""},
    ""footprintDepthMm"": {""$ref"":""#/$defs/val""},
    ""storeys"":          {""$ref"":""#/$defs/val""},
    ""storeyHeightMm"":   {""$ref"":""#/$defs/val""},
    ""facadesSeen"": {""type"":""array"",""items"":{""type"":""string""}},
    ""openings"": {""type"":""array"",""items"":{""type"":""object"",""properties"":{
        ""kind"":{""type"":""string"",""enum"":[""door"",""window""]},
        ""widthMm"":{""$ref"":""#/$defs/val""},""heightMm"":{""$ref"":""#/$defs/val""},
        ""facade"":{""type"":""string""}},""required"":[""kind"",""widthMm"",""heightMm"",""facade""]}},
    ""notes"": {""type"":""string""}
  },
  ""required"": [""footprintWidthMm"",""footprintDepthMm"",""storeys"",""storeyHeightMm"",""facadesSeen""],
  ""$defs"": { ""val"": { ""type"":""object"",""properties"":{
      ""value"":{""type"":""number""},""confidence"":{""type"":""number""}},""required"":[""value"",""confidence""]}}
}";

        private readonly string _model, _url;
        private readonly HttpClient _http;

        public MassingVisionReader(string model = "llava", string ollamaUrl = "http://localhost:11434/api/generate")
        {
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
            _url = string.IsNullOrWhiteSpace(ollamaUrl) ? "http://localhost:11434/api/generate" : ollamaUrl;
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        }

        public static int CountImages(string folder)
        {
            try { return string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder) ? 0 : Images(folder).Count; }
            catch { return 0; }
        }

        /// <summary>Estimate the massing from up to <paramref name="maxImages"/> images in the scoped folder.
        /// Sends them together so the model can fuse multiple views. Returns a VALIDATED estimate (clamped,
        /// assumed-flagged) ready for the reviewer; an all-assumed one when vision is unavailable.</summary>
        public async Task<MassingEstimate> EstimateAsync(string folder, int maxImages = 6, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
                return MassingPlanner.Validate(new MassingEstimate());

            List<string> images;
            try { images = Images(folder).Take(maxImages).ToList(); }
            catch { return MassingPlanner.Validate(new MassingEstimate()); }
            if (images.Count == 0) return MassingPlanner.Validate(new MassingEstimate());

            try
            {
                var b64 = images.Select(f => Convert.ToBase64String(File.ReadAllBytes(f))).ToArray();
                JsonElement format = JsonSerializer.Deserialize<JsonElement>(Schema);
                string payload = JsonSerializer.Serialize(new { model = _model, prompt = Prompt, images = b64, stream = false, format });
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return MassingPlanner.Validate(new MassingEstimate());

                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                string inner = doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() : null;
                if (string.IsNullOrWhiteSpace(inner)) return MassingPlanner.Validate(new MassingEstimate());

                return MassingPlanner.Validate(Parse(inner));
            }
            catch (OperationCanceledException) { throw; }
            catch { return MassingPlanner.Validate(new MassingEstimate()); } // vision is best-effort, never a crash
        }

        // The model's JSON → MassingEstimate. Missing/odd fields are left for Validate to make `assumed`.
        private static MassingEstimate Parse(string json)
        {
            using var d = JsonDocument.Parse(json);
            var root = d.RootElement;
            EstimatedValue Val(string name)
            {
                if (!root.TryGetProperty(name, out var e) || e.ValueKind != JsonValueKind.Object)
                    return new EstimatedValue { Value = double.NaN, Confidence = 0, Source = "assumed" };
                double v = e.TryGetProperty("value", out var vv) && vv.TryGetDouble(out var dv) ? dv : double.NaN;
                double c = e.TryGetProperty("confidence", out var cc) && cc.TryGetDouble(out var dc) ? dc : 0;
                return new EstimatedValue { Value = v, Confidence = c, Source = "photo" };
            }

            var est = new MassingEstimate
            {
                FootprintWidthMm = Val("footprintWidthMm"),
                FootprintDepthMm = Val("footprintDepthMm"),
                Storeys = Val("storeys"),
                StoreyHeightMm = Val("storeyHeightMm"),
                Notes = root.TryGetProperty("notes", out var n) ? n.GetString() : null,
            };
            if (root.TryGetProperty("facadesSeen", out var fs) && fs.ValueKind == JsonValueKind.Array)
                est.FacadesSeen = fs.EnumerateArray().Select(x => x.GetString() ?? "").ToList();
            if (root.TryGetProperty("openings", out var ops) && ops.ValueKind == JsonValueKind.Array)
                foreach (var o in ops.EnumerateArray())
                {
                    EstimatedValue OVal(string name)
                    {
                        if (!o.TryGetProperty(name, out var e)) return new EstimatedValue { Value = double.NaN, Confidence = 0, Source = "assumed" };
                        double v = e.TryGetProperty("value", out var vv) && vv.TryGetDouble(out var dv) ? dv : double.NaN;
                        double c = e.TryGetProperty("confidence", out var cc) && cc.TryGetDouble(out var dc) ? dc : 0;
                        return new EstimatedValue { Value = v, Confidence = c, Source = "photo" };
                    }
                    est.Openings.Add(new OpeningEstimate
                    {
                        Kind = o.TryGetProperty("kind", out var k) && k.GetString() == "window" ? "window" : "door",
                        WidthMm = OVal("widthMm"), HeightMm = OVal("heightMm"),
                        Facade = o.TryGetProperty("facade", out var f) ? (f.GetString() ?? "front") : "front",
                    });
                }
            return est;
        }

        private static List<string> Images(string folder)
        {
            string root = Path.GetFullPath(folder);
            return Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories)
                .Where(f => Array.IndexOf(ImageExtensions, Path.GetExtension(f).ToLowerInvariant()) >= 0)
                .Where(f => { try { return Path.GetFullPath(f).StartsWith(root, StringComparison.OrdinalIgnoreCase); } catch { return false; } })
                .ToList();
        }

        public void Dispose() => _http.Dispose();
    }
}
