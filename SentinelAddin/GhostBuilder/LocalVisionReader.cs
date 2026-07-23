#nullable disable
// P2 SENSE (slice 2): read sketch/render IMAGES from the SCOPED folder and turn each into a short text
// "hint" via a LOCAL vision model (Ollama), so the interpreter can use what a drawing DEPICTS — not just
// layer names — to disambiguate. Images are HINTS, never dimensioned geometry (that stays DWG). Local +
// offline; reads only inside the configured folder; best-effort (no VLM / no images -> "", build proceeds
// text-only). No Revit API, so it's safe on the background thread like the mapping call.
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
    public sealed class LocalVisionReader : IDisposable
    {
        private static readonly string[] ImageExtensions = { ".png", ".jpg", ".jpeg", ".webp" };
        private const string HintPrompt =
            "This is an architectural drawing or sketch. In ONE short sentence, list the building elements " +
            "you can see (e.g. external walls, internal partitions, doors, windows, columns, a room layout). " +
            "Be concise; no preamble.";

        private readonly string _model;
        private readonly string _url;
        private readonly HttpClient _http;

        public LocalVisionReader(string model = "llama3.2-vision",
                                 string ollamaUrl = "http://localhost:11434/api/generate")
        {
            _model = string.IsNullOrWhiteSpace(model) ? "llama3.2-vision" : model;
            _url = string.IsNullOrWhiteSpace(ollamaUrl) ? "http://localhost:11434/api/generate" : ollamaUrl;
            _http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) }; // local vision inference is slow
        }

        /// <summary>Count image files in the scoped folder (so the caller can show a status only when there
        /// is vision work to do). Never throws.</summary>
        public static int CountImages(string folder)
        {
            try { return string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder) ? 0 : Images(folder).Count; }
            catch { return 0; }
        }

        /// <summary>Describe each image in the scoped folder as a short hint. Never throws; returns "" when
        /// there are no images or the vision model is unavailable, so the build proceeds text-only.</summary>
        public async Task<string> ReadFolderAsync(string folder, int maxImages = 4, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return string.Empty;

            List<string> images;
            try { images = Images(folder).Take(maxImages).ToList(); }
            catch { return string.Empty; }
            if (images.Count == 0) return string.Empty;

            var sb = new StringBuilder();
            foreach (string img in images)
            {
                ct.ThrowIfCancellationRequested();
                string hint = await DescribeAsync(img, ct).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(hint))
                    sb.Append('[').Append(Path.GetFileName(img)).Append("] ").Append(hint.Trim()).Append('\n');
            }
            return sb.ToString().Trim();
        }

        private static List<string> Images(string folder)
        {
            string root = Path.GetFullPath(folder);
            return Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories)
                .Where(f => Array.IndexOf(ImageExtensions, Path.GetExtension(f).ToLowerInvariant()) >= 0)
                .Where(f => { try { return Path.GetFullPath(f).StartsWith(root, StringComparison.OrdinalIgnoreCase); } catch { return false; } })
                .ToList();
        }

        private async Task<string> DescribeAsync(string imagePath, CancellationToken ct)
        {
            try
            {
                string b64 = Convert.ToBase64String(File.ReadAllBytes(imagePath));
                string payload = JsonSerializer.Serialize(new
                {
                    model = _model,
                    prompt = HintPrompt,
                    images = new[] { b64 },
                    stream = false,
                });
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return string.Empty; // model not pulled / other -> skip gracefully
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                return doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() ?? string.Empty : string.Empty;
            }
            catch (OperationCanceledException) { throw; }
            catch { return string.Empty; } // vision is best-effort; never break the build
        }

        public void Dispose() => _http.Dispose();
    }
}
