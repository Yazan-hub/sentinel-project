#nullable disable
// P2 SENSE (slice 2) / MA-7-28: turn the evidence pack's admitted, BLURRED photos into short text "hints" via a LOCAL vision model
// (Ollama), so the interpreter can use what a photo DEPICTS - not just layer names. The pack is the only source (never a folder): a photo is
// read only as the blurred copy the bridge serves, sha-checked against the pack. Drawings are not read here - the bridge reads them with
// sentinel-drawing. Hints are text for DWG layer mapping, never geometry (that stays DWG). Best-effort (no VLM / no photo -> "", build proceeds
// text-only). No Revit API, so it's safe on the background thread like the mapping call.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    public sealed class LocalVisionReader : IDisposable
    {
        private const string HintPrompt =
            "This is an architectural drawing or sketch. In ONE short sentence, list the building elements " +
            "you can see (e.g. external walls, internal partitions, doors, windows, columns, a room layout). " +
            "Be concise; no preamble.";

        private readonly string _model;
        private readonly string _url;
        private readonly HttpClient _http;

        public LocalVisionReader(string model = "llava",
                                 string ollamaUrl = "http://localhost:11434/api/generate",
                                 bool cloudOptIn = false)
        {
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
            Usage = new ModelUsage(_model);
            _url = Sentinel.Engine.LocalOnly.ModelUrl(ollamaUrl, cloudOptIn); // SEC-2: this PC's model, or a host this PC opted in to
            _http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMinutes(5) }; // local vision inference is slow
        }

        /// <summary>MA-7-28: describe each of the evidence pack's admitted, blurred photos (up to <paramref name="maxImages"/>) as a short hint. The pack is
        /// the only source - <paramref name="copyOf"/> gives a photo's blurred copy (already sha-checked against the pack), never a file of a folder.
        /// <paramref name="onRead"/> is told each photo a hint came from. Never throws except on cancel; "" when no photo gave a hint, so the build proceeds text-only.</summary>
        public async Task<string> ReadPackAsync(IReadOnlyList<PackPhoto> photos, Func<PackPhoto, (byte[] Jpeg, string Error)> copyOf, Action<PackPhoto> onRead = null, int maxImages = 4, CancellationToken ct = default)
        {
            var sb = new StringBuilder();
            foreach (PackPhoto p in (photos ?? new List<PackPhoto>()).Take(maxImages))
            {
                ct.ThrowIfCancellationRequested();
                var (jpeg, _) = copyOf(p);
                if (jpeg == null) continue; // not fetched, or not the copy the pack names: not read
                string hint = await DescribeAsync(jpeg, ct).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(hint)) continue;
                onRead?.Invoke(p);
                sb.Append('[').Append(p.Id).Append("] ").Append(hint.Trim()).Append('\n');
            }
            return sb.ToString().Trim();
        }

        private async Task<string> DescribeAsync(byte[] copy, CancellationToken ct)
        {
            try
            {
                string b64 = Convert.ToBase64String(copy);
                string payload = JsonSerializer.Serialize(new
                {
                    model = _model,
                    prompt = HintPrompt,
                    images = new[] { b64 },
                    stream = false,
                });
                Usage.Asked(); // MA-1a item 8: every round trip is counted, answered or not
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return string.Empty; // model not pulled / other -> skip gracefully
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                Usage.Got(doc.RootElement);
                return doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() ?? string.Empty : string.Empty;
            }
            catch (OperationCanceledException) { throw; }
            catch { return string.Empty; } // vision is best-effort; never break the build
        }

        /// <summary>MA-1a item 8: this model's calls, answers and token counts in this run, for the build:run receipt.</summary>
        public ModelUsage Usage { get; }

        public void Dispose() => _http.Dispose();
    }
}
