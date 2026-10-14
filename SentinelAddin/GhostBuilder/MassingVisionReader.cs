#nullable disable
// Ask a LOCAL vision model (Ollama) what each project photo shows — MA-6-9 (C14, photo reading v2): one call per photo at
// 1024 px, COUNTS AND A RATIO ONLY (storeys, full height, height : width, bays, view), never a length. MassingPlanner.FromViews
// fuses the photos into one estimate; a person gives one known dimension and Scale works the lengths out. Schema-constrained
// decoding, same discipline as GhostBuilder's mapping call. Local + offline (nothing leaves the machine); best-effort — a photo
// the model cannot read is a row with its reason, never a stop; no VLM or no images yields an all-assumed estimate.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    public sealed class MassingVisionReader : IDisposable
    {
            // MA-6-9: the prompt and schema p1_measure.py measured (row P-1) — verbatim.
        private const string Prompt =
            "Look at the tallest building in this photo. Count its storeys: the horizontal floor bands from the ground to the roof, " +
            "the ground storey included. Set full_height true only if both its base and its roof are inside the photo. " +
            "height_to_width: its visible height divided by the width of the face nearest the camera (a ratio, for example 3.2). " +
            "bays: the number of window columns across that face. view: front, side, corner, aerial or unknown. " +
            "Give no length in metres, feet or millimetres - counts and ratios only. Return only JSON.";

        private const string Schema = @"{
  ""type"": ""object"",
  ""properties"": {
    ""storeys"": {""type"": ""integer""},
    ""full_height"": {""type"": ""boolean""},
    ""height_to_width"": {""type"": ""number""},
    ""bays"": {""type"": ""integer""},
    ""view"": {""type"": ""string"", ""enum"": [""front"", ""side"", ""corner"", ""aerial"", ""unknown""]}
  },
  ""required"": [""storeys"", ""full_height"", ""height_to_width"", ""view""]
}";

        private readonly string _model, _url;
        private readonly HttpClient _http;

        public MassingVisionReader(string model = "llava", string ollamaUrl = "http://localhost:11434/api/generate", bool cloudOptIn = false)
        {
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
            Usage = new ModelUsage(_model);
            _url = Sentinel.Engine.LocalOnly.ModelUrl(ollamaUrl, cloudOptIn); // SEC-2: this PC's model, or a host this PC opted in to
            _http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMinutes(5) };
        }

        /// <summary>MA-1a item 8: this model's calls, answers and token counts in this run, for the build:run receipt.</summary>
        public ModelUsage Usage { get; }

        /// <summary>How many of the pack's photos the vision model reads (the first ones PackPhotos.Usable lists).</summary>
        public const int MaxImages = 6;

        /// <summary>MA-7-14: read up to <paramref name="maxImages"/> of the pack's photos, one call each, and fuse the readings (MassingPlanner.FromViews).
        /// <paramref name="copyOf"/> gives a photo's blurred copy (bytes, or why not): the pack's copy is the only thing read, never a file of a folder.
        /// NOT validated: widths and heights stay assumed until a known dimension is given, and a count of 300 must reach ScaleRefusal, not be capped
        /// first. An all-assumed estimate when vision or the copies are unavailable.</summary>
        public async Task<MassingEstimate> EstimateAsync(IReadOnlyList<PackPhoto> photos, Func<PackPhoto, (byte[] Jpeg, string Error)> copyOf, int maxImages = MaxImages, CancellationToken ct = default, IProgress<string> progress = null, Action<PackPhoto> onRead = null)
        {
            var views = new List<ViewReading>();
            var images = (photos ?? new List<PackPhoto>()).Take(maxImages).ToList();
            for (int i = 0; i < images.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                progress?.Report($"Reading photo {i + 1} of {images.Count}…");
                var (jpeg, why) = copyOf(images[i]);
                var reading = jpeg == null ? new ViewReading { Photo = images[i].Id, Error = why ?? "its blurred copy could not be read" } : await ReadViewAsync(images[i].Id, jpeg, ct).ConfigureAwait(false);
                if (reading.Error == null) onRead?.Invoke(images[i]); // MA-7-14 review: a photo is "read" only when the model gave a reading of it
                views.Add(reading);
            }
            return MassingPlanner.FromViews(views);
        }

        // One photo, one call. Any failure is that photo's row, never a stop (cancellation excepted).
        private async Task<ViewReading> ReadViewAsync(string name, byte[] copy, CancellationToken ct)
        {
            try
            {
                string b64 = Convert.ToBase64String(Jpeg1024(copy));
                JsonElement format = JsonSerializer.Deserialize<JsonElement>(Schema);
                var req = new Dictionary<string, object>
                {
                    ["model"] = _model, ["prompt"] = Prompt, ["images"] = new[] { b64 }, ["stream"] = false, ["format"] = format,
                    ["options"] = new { temperature = 0 },
                };
                if (_model.StartsWith("qwen3", StringComparison.OrdinalIgnoreCase)) req["think"] = false; // a thinking model answers in its content only when told not to think
                Usage.Asked(); // MA-1a item 8: every round trip is counted, answered or not
                using var body = new StringContent(JsonSerializer.Serialize(req), Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return new ViewReading { Photo = name, Error = $"the model answered HTTP {(int)resp.StatusCode}" };

                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                Usage.Got(doc.RootElement);
                string inner = doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() : null;
                return ParseView(name, inner);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex) { return new ViewReading { Photo = name, Error = ex.Message }; } // vision is best-effort, never a crash
        }

        /// <summary>One answer → one reading. Garbage, or no storey count, is a row with its reason (Error).</summary>
        internal static ViewReading ParseView(string photo, string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new ViewReading { Photo = photo, Error = "the model answered nothing" };
            try
            {
                using var d = JsonDocument.Parse(json);
                var root = d.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return new ViewReading { Photo = photo, Error = "the answer was not an object" };
                double Num(string k) => root.TryGetProperty(k, out var e) && e.ValueKind == JsonValueKind.Number && e.TryGetDouble(out var x) ? x : 0;
                double count = Math.Round(Num("storeys")); // bounded before the cast: it is platform-dependent beyond int
                if (count <= 0) return new ViewReading { Photo = photo, Error = "no storey count in the answer" };
                if (count > 1000) return new ViewReading { Photo = photo, Error = $"implausible storey count {count:0.###}" };
                int storeys = (int)count;
                // The model's text is untrusted: only the five views named in the prompt pass (case aside); anything else is "unknown".
                string view = (root.TryGetProperty("view", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : "").Trim().ToLowerInvariant();
                if (Array.IndexOf(new[] { "front", "side", "corner", "aerial" }, view) < 0) view = "unknown";
                return new ViewReading
                {
                    Photo = photo, Storeys = storeys,
                    FullHeight = root.TryGetProperty("full_height", out var f) && f.ValueKind == JsonValueKind.True,
                    HeightToWidth = Num("height_to_width"), Bays = (int)Math.Max(0, Math.Min(1000, Math.Round(Num("bays")))), View = view,
                };
            }
            catch (JsonException) { return new ViewReading { Photo = photo, Error = "the answer was not JSON" }; }
        }

        /// <summary>The photo as a JPEG (quality 85) with its long side at most 1024 px, EXIF-rotated. WPF imaging, created, frozen and used
        /// on the calling thread — safe on a worker (ghost-p2-check proves it).</summary>
        internal static byte[] Jpeg1024(string path) => Jpeg1024(File.ReadAllBytes(path));

        internal static byte[] Jpeg1024(byte[] data)
        {
            BitmapSource frame;
            using (var fs = new MemoryStream(data)) frame = BitmapDecoder.Create(fs, BitmapCreateOptions.None, BitmapCacheOption.OnLoad).Frames[0];
            int turn = 0; // EXIF orientation 3, 6, 8 → 180, 90, 270 degrees (mirrored ones are left)
            try
            {
                if ((frame as BitmapFrame)?.Metadata is BitmapMetadata md && md.GetQuery("/app1/ifd/{ushort=274}") is ushort o)
                    turn = o == 3 ? 180 : o == 6 ? 90 : o == 8 ? 270 : 0;
            }
            catch { /* no EXIF, or a format without it */ }
            var tf = new TransformGroup();
            if (turn != 0) tf.Children.Add(new RotateTransform(turn));
            double longSide = Math.Max(frame.PixelWidth, frame.PixelHeight);
            if (longSide > 1024) { double k = 1024 / longSide; tf.Children.Add(new ScaleTransform(k, k)); }
            BitmapSource shown = tf.Children.Count == 0 ? frame : new TransformedBitmap(frame, tf);
            shown.Freeze();
            var enc = new JpegBitmapEncoder { QualityLevel = 85 };
            enc.Frames.Add(BitmapFrame.Create(shown));
            using var ms = new MemoryStream();
            enc.Save(ms);
            return ms.ToArray();
        }

        public void Dispose() => _http.Dispose();
    }
}
