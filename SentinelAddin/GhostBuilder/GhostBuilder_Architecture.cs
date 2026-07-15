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
        private const string OllamaUrl = "http://localhost:11434/api/generate";
        private const string Model     = "llama3";

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

        public LocalGhostBuilder(string schemaJson)
        {
            _schema = schemaJson; // null/empty is fine — MapLayersAsync falls back to DefaultSchema
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // local inference is slow
        }

        /// <param name="cadLayers">Layer names from GhostCadExtractor.ExtractCadLayers.</param>
        /// <param name="ct">Cancels the HTTP call when the user aborts (ESC / Cancel).</param>
        public async Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            string prompt =
                "Map each CAD layer to a standard Badran Design Studio Revit family at LOD 200. " +
                "Return ONLY JSON matching the schema. Include every input layer exactly once in " +
                "'mappings'. Choose 'category' from the allowed set and set 'confidence' from 0 to 1.\n" +
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
                model  = Model,
                prompt,
                stream = false,
                format   // JSON schema object -> Ollama constrains output to this exact shape
            });

            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(OllamaUrl, body, ct);
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
