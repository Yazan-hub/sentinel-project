#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    /// <summary>One CAD-layer-to-BDS-family mapping row returned by the local LLM.
    /// P2 (task 4): additively carries the document-derived parameter assignments + their provenance,
    /// so the build proposal says WHY and FROM WHERE, not just WHAT. All three are optional — a P1-shape
    /// mapping (no params/rationale/source) stays perfectly valid.</summary>
    public sealed class LayerMapping
    {
        [JsonPropertyName("cadLayer")]      public string CadLayer { get; set; }
        [JsonPropertyName("category")]      public string Category { get; set; }
        [JsonPropertyName("bdsFamily")]     public string BdsFamily { get; set; }
        [JsonPropertyName("bdsFamilyType")] public string BdsFamilyType { get; set; }
        [JsonPropertyName("confidence")]    public double Confidence { get; set; }
        [JsonPropertyName("params")]        public List<ParamAssignment> Params { get; set; }
        [JsonPropertyName("rationale")]     public string Rationale { get; set; }
        [JsonPropertyName("sourceDoc")]     public string SourceDoc { get; set; }

        /// <summary>Which tier produced this mapping: "standard" (deterministic ruleset) or "llm".
        /// Cached rows from before this field exist deserialize as null - treat null as "llm".</summary>
        [JsonPropertyName("source")]        public string Source { get; set; } = "llm";
    }

    /// <summary>One Revit parameter the project documents state for a mapped layer's elements
    /// (e.g. "Fire Rating" = "FR60"). A name/value pair, not a map, because constrained decoding
    /// handles fixed-shape objects far more reliably than arbitrary key sets.</summary>
    public sealed class ParamAssignment
    {
        [JsonPropertyName("name")]  public string Name { get; set; }
        [JsonPropertyName("value")] public string Value { get; set; }
    }

    /// <summary>Root of the LLM's JSON response: the full set of layer mappings.</summary>
    public sealed class MappingResult
    {
        [JsonPropertyName("mappings")] public List<LayerMapping> Mappings { get; set; }
    }

    /// <summary>Root of the P2 parameter-enrichment response — a second, evidence-only pass over the
    /// FINAL mapping set (see LocalGhostBuilder.EnrichParamsAsync).</summary>
    public sealed class ParamEnrichment
    {
        [JsonPropertyName("assignments")] public List<LayerParams> Assignments { get; set; }
    }

    /// <summary>Document-derived parameters for one already-mapped layer.</summary>
    public sealed class LayerParams
    {
        [JsonPropertyName("cadLayer")]  public string CadLayer { get; set; }
        [JsonPropertyName("params")]    public List<ParamAssignment> Params { get; set; }
        [JsonPropertyName("rationale")] public string Rationale { get; set; }
        [JsonPropertyName("sourceDoc")] public string SourceDoc { get; set; }
    }

    /// <summary>
    /// Bridges Revit CAD layer names to an offline Llama 3 (Ollama) that returns LOD 200
    /// family mappings as JSON. Network I/O only — no Revit API, so it is thread-agnostic and
    /// safe to await off the API thread.
    /// </summary>
    public sealed class LocalGhostBuilder : IDisposable, ILayerMapper
    {
        // Local model runtime (Ollama). Defaults keep the plugin fully offline; both are overridable via
        // Sentinel settings so the office can pick a stronger local model (P1 default: qwen2.5:7b-instruct)
        // with no code change. Data never leaves the machine on this path.
        private readonly string _ollamaUrl;
        private readonly string _model;
        private string _evidence; // P2: scoped-folder document + vision context (empty -> none); appendable

        private readonly HttpClient _http;
        private readonly string _schema; // optional caller-supplied JSON schema; empty -> DefaultSchema

        // Ollama constrains decoding to THIS JSON schema (format field), so the model must emit
        // exactly the shape MappingResult deserializes — a top-level "mappings" array with the
        // property names below. format:"json" alone only guarantees *valid* JSON, not this *shape*,
        // which is why an unconstrained llama3 returned e.g. {"layers":[{"layer","family"}]} and the
        // orchestrator reported "LLM returned no mappings". The enum keeps 'category' on the values
        // ElementPlacementFactory switches on.
        private const string DefaultSchema = @"{
  ""type"": ""object"",
  ""properties"": {
    ""mappings"": {
      ""type"": ""array"",
      ""items"": {
        ""type"": ""object"",
        ""properties"": {
          ""cadLayer"":      { ""type"": ""string"" },
          ""category"":      { ""type"": ""string"", ""enum"": [""Walls"",""Floors"",""Ceilings"",""Doors"",""Windows"",""Columns"",""Furniture""] },
          ""bdsFamily"":     { ""type"": ""string"" },
          ""bdsFamilyType"": { ""type"": ""string"" },
          ""confidence"":    { ""type"": ""number"" }
        },
        ""required"": [""cadLayer"", ""category"", ""bdsFamily"", ""confidence""]
      }
    }
  },
  ""required"": [""mappings""]
}";

        public LocalGhostBuilder(string schemaJson,
                                 string model = "qwen2.5:7b-instruct",
                                 string ollamaUrl = "http://localhost:11434/api/generate",
                                 string evidence = null)
        {
            _schema = schemaJson; // null/empty is fine — MapLayersAsync falls back to DefaultSchema
            _model = string.IsNullOrWhiteSpace(model) ? "qwen2.5:7b-instruct" : model;
            _ollamaUrl = string.IsNullOrWhiteSpace(ollamaUrl) ? "http://localhost:11434/api/generate" : ollamaUrl;
            _evidence = evidence ?? string.Empty; // P2: document context the model uses to disambiguate layers
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // local inference is slow
        }

        /// <summary>P2 slice 2: add vision-model hints (from LocalVisionReader) to the document context on the
        /// background thread, before the mapping call. Safe to call once between construction and MapLayersAsync.</summary>
        public void AppendEvidence(string more)
        {
            if (string.IsNullOrWhiteSpace(more)) return;
            _evidence = string.IsNullOrWhiteSpace(_evidence) ? more : _evidence + "\n\n" + more;
        }

        /// <summary>True when the scoped folder yielded document/vision context — i.e. there is something
        /// for EnrichParamsAsync to read parameters out of.</summary>
        public bool HasEvidence => !string.IsNullOrWhiteSpace(_evidence);

        /// <param name="cadLayers">Layer names from GhostCadExtractor.ExtractCadLayers.</param>
        /// <param name="ct">Cancels the HTTP call when the user aborts (ESC / Cancel).</param>
        public async Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            // Only layers the deterministic BDS-standard pass could NOT resolve reach the model, so the
            // prompt is tuned for disambiguating messy/non-standard names into the fixed category set.
            string prompt =
                "You map non-standard CAD layer names to Revit model categories for a LOD 200 build. " +
                "Return ONLY JSON matching the schema, with every input layer included exactly once in " +
                "'mappings'. 'category' MUST be one of: Walls, Floors, Ceilings, Doors, Windows, Columns, " +
                "Furniture. Set 'confidence' 0-1. If a layer is annotation/text/grid or clearly not model " +
                "geometry, still return it but with low confidence.\n" +
                "Examples: 'EXT-WALL-2HR' -> Walls; 'A_DR_INTERIOR' -> Doors; 'CURTAIN-GLASS' -> Windows; " +
                "'RCP-GRID' -> Ceilings.\n" +
                "Layers: " + string.Join(", ", cadLayers);

            // P2: prepend scoped-folder document context so the model can disambiguate messy layer names
            // (and, later, seed parameters) from the project's own specs/schedules.
            if (!string.IsNullOrWhiteSpace(_evidence))
                prompt = "PROJECT DOCUMENTS (context to interpret ambiguous layer names and their category):\n"
                         + _evidence + "\n\n" + prompt;

            // Send the schema in Ollama's `format` field so decoding is constrained to our shape.
            // A caller-supplied schema (from settings) wins; otherwise the built-in default is used.
            // A malformed custom schema falls back to the default rather than failing the whole run.
            JsonElement format;
            try
            {
                format = JsonSerializer.Deserialize<JsonElement>(
                    string.IsNullOrWhiteSpace(_schema) ? DefaultSchema : _schema);
            }
            catch (JsonException)
            {
                format = JsonSerializer.Deserialize<JsonElement>(DefaultSchema);
            }

            string inner = await GenerateAsync(prompt, format, ct).ConfigureAwait(false);

            var result = JsonSerializer.Deserialize<MappingResult>(inner)
                   ?? throw new InvalidOperationException("LLM returned malformed mapping JSON.");
            NormalizeFamilies(result);
            return result;
        }

        // ---- P2 task 4/5: document-derived parameters over the FINAL mapping set ----

        // Same reasoning as DefaultSchema: constrain decoding to exactly what MergeParams reads.
        // 'params' is a name/value ARRAY, not an object map — llama.cpp's grammar conversion handles a
        // fixed-shape array reliably, arbitrary keys it does not.
        private const string ParamSchema = @"{
  ""type"": ""object"",
  ""properties"": {
    ""assignments"": {
      ""type"": ""array"",
      ""items"": {
        ""type"": ""object"",
        ""properties"": {
          ""cadLayer"":  { ""type"": ""string"" },
          ""params"": {
            ""type"": ""array"",
            ""items"": {
              ""type"": ""object"",
              ""properties"": {
                ""name"":  { ""type"": ""string"" },
                ""value"": { ""type"": ""string"" }
              },
              ""required"": [""name"", ""value""]
            }
          },
          ""rationale"": { ""type"": ""string"" },
          ""sourceDoc"": { ""type"": ""string"" }
        },
        ""required"": [""cadLayer"", ""params""]
      }
    }
  },
  ""required"": [""assignments""]
}";

        /// <summary>
        /// Second pass: with the project documents in context, ask ONCE for the Revit parameter values the
        /// documents state for the already-mapped layers, and fold them into <paramref name="mapping"/>.
        ///
        /// It runs over the FINAL mapping set on purpose. The deterministic BDS-standard tier resolves most
        /// layers WITHOUT ever calling the model, so a spec line like "external walls FR60" would never reach
        /// A-WALL-EXT if enrichment rode along with the mapping call — the standard layers are exactly the
        /// ones a spec talks about. No evidence -> no call at all (and the P1 behaviour is unchanged).
        ///
        /// Best-effort: a model that returns junk leaves the mapping exactly as it was, so a build never
        /// fails over parameters. Network only; safe on the background thread.
        /// </summary>
        public async Task<MappingResult> EnrichParamsAsync(MappingResult mapping, CancellationToken ct = default)
        {
            if (mapping?.Mappings == null || mapping.Mappings.Count == 0 || !HasEvidence) return mapping;

            string rows = string.Join("\n", mapping.Mappings
                .Where(m => m != null && !string.IsNullOrWhiteSpace(m.CadLayer))
                .Select(m => $"- {m.CadLayer} => {m.Category} / {m.BdsFamilyType ?? m.BdsFamily}"));
            if (rows.Length == 0) return mapping;

            string prompt =
                "PROJECT DOCUMENTS:\n" + _evidence + "\n\n" +
                "The CAD layers below are already mapped to Revit categories/types. Using ONLY the project " +
                "documents above, return the Revit parameter values those documents state for each layer's " +
                "elements — e.g. a fire rating, an acoustic rating, a thickness, a mark, a finish. Use the " +
                "Revit parameter name in 'name' (e.g. \"Fire Rating\", \"Comments\", \"Mark\") and the value " +
                "as written in the document.\n" +
                "OMIT a layer entirely if the documents say nothing about it. Never guess, never invent a " +
                "value the documents do not state — an empty 'assignments' array is the correct answer when " +
                "the documents are silent.\n" +
                "Set 'rationale' to the document sentence you took it from and 'sourceDoc' to the [file] it " +
                "appeared under.\n" +
                "Mapped layers:\n" + rows;

            try
            {
                JsonElement format = JsonSerializer.Deserialize<JsonElement>(ParamSchema);
                string inner = await GenerateAsync(prompt, format, ct).ConfigureAwait(false);
                MergeParams(mapping, inner);
            }
            catch (OperationCanceledException) { throw; }   // user pressed ESC — that's not a param failure
            catch (Exception) { /* parameters are an enhancement, never a build blocker */ }

            return mapping;
        }

        // The model reliably leaks the response's OWN meta fields into the params array — a live run
        // against a real spec came back with `Rationale = "- All external walls are 200 mm, FR60."` as if
        // it were a Revit parameter. Writing that would hunt for a parameter named "Rationale", fail, and
        // fill the report with noise. Names are matched case-insensitively; the rationale text is not
        // thrown away, it is promoted to the field it belonged in.
        private static readonly string[] MetaParamNames =
            { "rationale", "why", "reason", "source", "sourcedoc", "source doc", "note", "notes", "cadlayer", "layer" };

        /// <summary>Fold an enrichment response into the mapping rows, matching by CAD layer. Unknown layers,
        /// blank names/values, the response's own meta fields, and malformed JSON are dropped. Pure — no
        /// I/O — so it is directly testable.</summary>
        public static void MergeParams(MappingResult mapping, string enrichmentJson)
        {
            if (mapping?.Mappings == null || string.IsNullOrWhiteSpace(enrichmentJson)) return;

            ParamEnrichment enriched;
            try { enriched = JsonSerializer.Deserialize<ParamEnrichment>(enrichmentJson); }
            catch (JsonException) { return; }
            if (enriched?.Assignments == null) return;

            var byLayer = mapping.Mappings
                .Where(m => m != null && !string.IsNullOrWhiteSpace(m.CadLayer))
                .GroupBy(m => m.CadLayer.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (LayerParams a in enriched.Assignments)
            {
                if (a?.CadLayer == null) continue;
                if (!byLayer.TryGetValue(a.CadLayer.Trim(), out LayerMapping m)) continue; // layer the model invented

                var supplied = (a.Params ?? new List<ParamAssignment>())
                    .Where(p => p != null && !string.IsNullOrWhiteSpace(p.Name) && !string.IsNullOrWhiteSpace(p.Value))
                    .ToList();

                // A meta field that arrived as a parameter is not a Revit parameter — but its text is still
                // the provenance we wanted, so keep it as the rationale rather than discarding it.
                string strayRationale = supplied
                    .FirstOrDefault(p => p.Name.Trim().ToLowerInvariant() is "rationale" or "why" or "reason")?.Value;

                var clean = supplied
                    .Where(p => Array.IndexOf(MetaParamNames, p.Name.Trim().ToLowerInvariant()) < 0)
                    .ToList();
                if (clean.Count == 0) continue; // rationale without a value is just noise

                m.Params = clean;
                m.Rationale = !string.IsNullOrWhiteSpace(a.Rationale) ? a.Rationale.Trim()
                            : !string.IsNullOrWhiteSpace(strayRationale) ? strayRationale.Trim()
                            : null;
                m.SourceDoc = string.IsNullOrWhiteSpace(a.SourceDoc) ? null : a.SourceDoc.Trim();
            }
        }

        /// <summary>One schema-constrained Ollama round-trip; returns the model's inner JSON text.</summary>
        private async Task<string> GenerateAsync(string prompt, JsonElement format, CancellationToken ct)
        {
            string payload = JsonSerializer.Serialize(new
            {
                model  = _model,
                prompt,
                stream = false,
                format   // JSON schema object -> Ollama constrains output to this exact shape
            });

            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(_ollamaUrl, body, ct).ConfigureAwait(false);
            resp.EnsureSuccessStatusCode();

            // Ollama wraps the model's text in { "response": "<json string>", ... }.
            using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
            return doc.RootElement.GetProperty("response").GetString()
                   ?? throw new InvalidOperationException("Empty LLM response.");
        }

        // The model often omits a family/type name (the schema only requires cadLayer/category/confidence),
        // returning an EMPTY string that defeats the `BdsFamilyType ?? BdsFamily` fallback in the provisioner
        // + placement (`??` only catches null) — so the layer skipped on an empty type. Normalise: empty type
        // -> null (so the fallback works), empty family -> a generic default. For "Walls" that generic type is
        // system-provisioned downstream, so a spec-inferred layer like EXTERIOR-ENVELOPE now actually builds;
        // other categories still need their .rfa families loaded.
        private static void NormalizeFamilies(MappingResult r)
        {
            if (r?.Mappings == null) return;
            foreach (var m in r.Mappings)
            {
                if (m == null) continue;
                if (string.IsNullOrWhiteSpace(m.BdsFamilyType)) m.BdsFamilyType = null;
                if (string.IsNullOrWhiteSpace(m.BdsFamily)) m.BdsFamily = GenericFamilyFor(m.Category);
            }
        }

        private static string GenericFamilyFor(string category) => (category ?? "").Trim() switch
        {
            "Walls" => "Generic Wall",
            "Doors" => "Generic Door",
            "Windows" => "Generic Window",
            "Floors" => "Generic Floor",
            "Ceilings" => "Generic Ceiling",
            "Columns" => "Generic Column",
            "Furniture" => "Generic Furniture",
            _ => null,
        };

        public void Dispose() => _http.Dispose();

        // ponytail: schema-constrained decoding fixes the shape, but not semantic quality (an 8B model
        // still mis-picks families). Downstream anti-hallucination drops unknown families; add a
        // confidence-weighted retry / better prompt exemplars when tuning yield.
    }
}
