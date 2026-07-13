using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace BadranDesignStudio.Sentinel
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
    public sealed class LocalGhostBuilder : IDisposable
    {
        private const string OllamaUrl = "http://localhost:11434/api/generate";
        private const string Model     = "llama3";

        private readonly HttpClient _http;
        private readonly string _schema; // JSON schema string echoed into the prompt

        public LocalGhostBuilder(string schemaJson)
        {
            _schema = schemaJson ?? throw new ArgumentNullException(nameof(schemaJson));
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // local inference is slow
        }

        /// <param name="cadLayers">Layer names from GhostCadExtractor.ExtractCadLayers.</param>
        public async Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers)
        {
            string prompt =
                "Map each CAD layer to a standard Badran Design Studio Revit family at LOD 200. " +
                "Return ONLY JSON matching the provided schema.\nLayers: " +
                string.Join(", ", cadLayers) + "\nSchema: " + _schema;

            string payload = JsonSerializer.Serialize(new
            {
                model  = Model,
                prompt,
                stream = false,
                format = "json"   // Ollama constrains output to syntactically valid JSON
            });

            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(OllamaUrl, body);
            resp.EnsureSuccessStatusCode();

            // Ollama wraps the model's text in { "response": "<json string>", ... }.
            using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            string inner = doc.RootElement.GetProperty("response").GetString()
                           ?? throw new InvalidOperationException("Empty LLM response.");

            return JsonSerializer.Deserialize<MappingResult>(inner)
                   ?? throw new InvalidOperationException("LLM returned malformed mapping JSON.");
        }

        public void Dispose() => _http.Dispose();

        // ponytail: format:"json" guarantees valid JSON, NOT schema-conformant JSON. No retry on
        // wrong-shape output. Add a JSON-schema validator + one retry loop when wiring to live.
    }
}
