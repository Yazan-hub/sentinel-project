#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    /// <summary>One CAD-layer-to-BDS-family mapping row returned by the local LLM.</summary>
    public sealed class LayerMapping
    {
        [JsonPropertyName("cadLayer")]      public string CadLayer { get; set; }
        [JsonPropertyName("category")]      public string Category { get; set; }
        [JsonPropertyName("bdsFamily")]     public string BdsFamily { get; set; }
        [JsonPropertyName("bdsFamilyType")] public string BdsFamilyType { get; set; }
        [JsonPropertyName("confidence")]    public double Confidence { get; set; }
    }

    /// <summary>Root of the LLM's JSON response: the full set of layer mappings.</summary>
    public sealed class MappingResult
    {
        [JsonPropertyName("mappings")] public List<LayerMapping> Mappings { get; set; }
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
                                 string ollamaUrl = "http://localhost:11434/api/generate")
        {
            _schema = schemaJson; // null/empty is fine — MapLayersAsync falls back to DefaultSchema
            _model = string.IsNullOrWhiteSpace(model) ? "qwen2.5:7b-instruct" : model;
            _ollamaUrl = string.IsNullOrWhiteSpace(ollamaUrl) ? "http://localhost:11434/api/generate" : ollamaUrl;
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // local inference is slow
        }

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

            string payload = JsonSerializer.Serialize(new
            {
                model  = _model,
                prompt,
                stream = false,
                format   // JSON schema object -> Ollama constrains output to this exact shape
            });

            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(_ollamaUrl, body, ct);
            resp.EnsureSuccessStatusCode();

            // Ollama wraps the model's text in { "response": "<json string>", ... }.
            using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            string inner = doc.RootElement.GetProperty("response").GetString()
                           ?? throw new InvalidOperationException("Empty LLM response.");

            return JsonSerializer.Deserialize<MappingResult>(inner)
                   ?? throw new InvalidOperationException("LLM returned malformed mapping JSON.");
        }

        public void Dispose() => _http.Dispose();

        // ponytail: schema-constrained decoding fixes the shape, but not semantic quality (an 8B model
        // still mis-picks families). Downstream anti-hallucination drops unknown families; add a
        // confidence-weighted retry / better prompt exemplars when tuning yield.
    }
}
