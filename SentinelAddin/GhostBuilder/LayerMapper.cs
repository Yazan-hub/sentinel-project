using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Sentinel.Engine; // ArtefactCache: the per-project cache folder

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The seam every layer-name-to-family mapper implements. LocalGhostBuilder is the LLM-backed
    /// implementation; LayerMapper is the tiered mapper in front of it. The orchestrator depends on this
    /// interface so the two compose without either knowing about the other.
    /// </summary>
    public interface ILayerMapper
    {
        Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default);
    }

    /// <summary>
    /// Maps each DWG layer through five tiers, the project's installed standard first (cohesion phase 4b-2, spec
    /// decision 9):
    ///
    ///   0. IGNORE     — system / annotation layers (the standard's ignore globs + the built-in net): never
    ///                   geometry, never a model call.
    ///   1. STANDARD   — the project's layers@n, exact row or alias: Source "standard", the only rows the review
    ///                   pre-ticks.
    ///   2. REMEMBERED — this project's earlier local-model answers (%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json),
    ///                   used only under the same layers sha: Source "cache"; and the reviewer's own choices (a type
    ///                   picked in the review, or "(ignore)" — GHB-5): Source "reviewer". Another project's guess, or one
    ///                   made under another layers standard, never answers; an unbound document remembers nothing.
    ///   3. HEURISTIC  — the AIA discipline-major parse and the keyword list: Source "heuristic", a guess.
    ///   4. LOCAL LLM  — the layers nothing above recognised, in one call: Source "llm", remembered for next time.
    ///                   When the model cannot be reached, every row above is kept and these layers come back
    ///                   Source "unmapped" ("not mapped — local model unreachable (…)") instead of failing the run.
    ///
    /// Pure data + network + file I/O — no Revit API — so it stays safe to await off the API thread.
    /// </summary>
    public sealed class LayerMapper : ILayerMapper, IDisposable
    {
        private readonly ILayerMapper _llm;                         // tier 4: unknown layers only
        private readonly LayerRulesetMatcher _matcher;              // tiers 0, 1 and 3
        private readonly string _key;                               // the document's web project
        private readonly string? _cachePath;                        // null: unbound, nothing is remembered
        private readonly Dictionary<string, LayerMapping> _cache;   // tier 2: normalised layer -> the model's answer
        private bool _dirty;

        // On disk: {"key": "<project>", "layers_sha": "<sha of layers@n, or none>", "mappings": {LAYER: llm row}}.
        private sealed class CacheFile
        {
            [JsonPropertyName("key")] public string? Key { get; set; }
            [JsonPropertyName("layers_sha")] public string? LayersSha { get; set; }
            [JsonPropertyName("mappings")] public Dictionary<string, LayerMapping>? Mappings { get; set; }
        }

        /// <param name="llmFallback">The local model (LocalGhostBuilder).</param>
        /// <param name="matcher">The project's layers@n (GhostStandards.Layers, its Sha set), or
        /// LayerRulesetMatcher.HeuristicsOnly().</param>
        /// <param name="projectKey">The document's web project; "" (unbound) remembers nothing.</param>
        public LayerMapper(ILayerMapper llmFallback, LayerRulesetMatcher matcher, string projectKey)
        {
            _llm = llmFallback ?? throw new ArgumentNullException(nameof(llmFallback));
            _matcher = matcher ?? throw new ArgumentNullException(nameof(matcher));
            _key = (projectKey ?? "").Trim();
            _cachePath = _key.Length == 0 ? null : CachePathFor(_key);
            _cache = LoadCache(_cachePath, _key, Stamp);
        }

        /// <summary>%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json — beside the project's artefact copies.</summary>
        public static string CachePathFor(string key) => ArtefactCache.PathFor(key, "dwg_mappings");

        // Remembered answers belong to one layers standard: another sha's are not used.
        private string Stamp => _matcher.Sha ?? "none";

        public async Task<MappingResult> MapLayersAsync(
            IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            // Dedupe while preserving first-seen order; blank layer names are meaningless.
            var layers = (cadLayers ?? Enumerable.Empty<string>())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var resolved = new List<LayerMapping>();
            var unknown = new List<string>();

            foreach (string layer in layers)
            {
                if (_matcher.ShouldIgnore(layer)) continue;                              // 0. never geometry
                LayerMapping? hit = _matcher.Match(layer);
                if (hit is { Source: "standard" }) { resolved.Add(hit); continue; }     // 1. the installed standard
                if (_cache.TryGetValue(Normalize(layer), out LayerMapping? earlier))      // 2. remembered, same sha
                {
                    resolved.Add(Remembered(earlier, layer));
                    continue;
                }
                if (hit != null) { resolved.Add(hit); continue; }                        // 3. heuristic
                unknown.Add(layer);                                                      // 4. the local model
            }

            // One model round-trip for everything no tier above recognised.
            if (unknown.Count > 0)
            {
                MappingResult? answer = null;
                string? failure = null;
                try { answer = await _llm.MapLayersAsync(unknown, ct).ConfigureAwait(false); }
                catch (Exception ex) when (!(ex is OperationCanceledException && ct.IsCancellationRequested)) // ESC still cancels
                {
                    failure = (ex is HttpRequestException ? "local model unreachable" : "local model failed") + " (" + ex.Message + ")";
                }
                if (failure != null)
                    resolved.AddRange(unknown.Select(u => new LayerMapping { CadLayer = u, Confidence = 0, Source = "unmapped", Rationale = "not mapped — " + failure }));
                foreach (LayerMapping m in answer?.Mappings ?? Enumerable.Empty<LayerMapping>())
                {
                    if (m == null || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                    m.Source = "llm";
                    // Remembered for this project, under this layers sha — a COPY (A1): EnrichParamsAsync later edits the
                    // returned row in place, and a document's values must never reach the cache file.
                    _cache[Normalize(m.CadLayer)] = m.Copy();
                    _dirty = true;
                    resolved.Add(m);
                }
            }

            if (_dirty) SaveCache();
            return new MappingResult { Mappings = resolved };
        }

        // ---- the per-project cache (tier 2) ----

        private static string Normalize(string layer) => layer.Trim().ToUpperInvariant();

        private static Dictionary<string, LayerMapping> LoadCache(string? path, string key, string stamp)
        {
            var dict = new Dictionary<string, LayerMapping>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (path == null || !File.Exists(path)) return dict;
                var file = JsonSerializer.Deserialize<CacheFile>(File.ReadAllText(path));
                // Another project's answers (two keys can share a folder once sanitised) or answers given under
                // another layers standard are not this run's.
                if (file?.Mappings == null || file.Key != key || file.LayersSha != stamp) return dict;
                foreach (var kv in file.Mappings)
                    if (kv.Value != null && (kv.Value.Source == "llm" || kv.Value.Source == "reviewer")) dict[kv.Key] = kv.Value;
            }
            catch (Exception) { /* corrupt/unreadable cache -> start empty; the next model answer rewrites it */ }
            return dict;
        }

        private void SaveCache()
        {
            if (_cachePath == null) return; // unbound: nothing is remembered
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
                File.WriteAllText(_cachePath, JsonSerializer.Serialize(
                    new CacheFile { Key = _key, LayersSha = Stamp, Mappings = _cache },
                    new JsonSerializerOptions { WriteIndented = true }));
                _dirty = false;
            }
            catch (Exception) { /* best-effort: a read-only cache dir must not fail the mapping run */ }
        }

        // A remembered row on the DWG's ACTUAL layer string (the placement join is by layer): the model's answer labelled
        // "cache", the reviewer's choice kept as "reviewer" (an ignore included); the stored copy stays untouched.
        private LayerMapping Remembered(LayerMapping src, string layer) => new LayerMapping
        {
            CadLayer = layer,
            Category = src.Category,
            BdsFamily = src.BdsFamily,
            BdsFamilyType = src.BdsFamilyType,
            Confidence = src.Confidence,
            Params = src.Params,
            Rationale = string.IsNullOrWhiteSpace(src.Rationale) ? "remembered: the local model's answer on an earlier run for " + _key : src.Rationale,
            SourceDoc = src.SourceDoc,
            Source = src.Source == "reviewer" ? "reviewer" : "cache",
            Ignore = src.Ignore,
        };

        /// <summary>GHB-5: keep the reviewer's choices — a type picked in the review, or "(ignore)" — for this project, under
        /// this layers sha, beside the model's remembered answers. They come back as "reviewer" rows (tier 2), after the
        /// installed standard: the office's layers@n still wins (F3). Only the choice is kept, never a document's values
        /// (A1); a choice marked Forget deletes the remembered row, so the next run asks the heuristic or the model again
        /// (A2). Rows of any other source are not remembered here; an unbound document remembers nothing.</summary>
        public void Remember(IEnumerable<LayerMapping>? choices)
        {
            foreach (LayerMapping m in choices ?? Enumerable.Empty<LayerMapping>())
            {
                if (m == null || m.Source != "reviewer" || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                string key = Normalize(m.CadLayer);
                if (m.Forget) { if (_cache.Remove(key)) _dirty = true; continue; }
                _cache[key] = new LayerMapping
                {
                    CadLayer = m.CadLayer,
                    Category = m.Category,
                    BdsFamily = m.BdsFamily,
                    BdsFamilyType = m.BdsFamilyType,
                    Confidence = m.Confidence,
                    Rationale = "your earlier review",
                    Source = "reviewer",
                    Ignore = m.Ignore,
                };
                _dirty = true;
            }
            if (_dirty) SaveCache();
        }

        public void Dispose() => (_llm as IDisposable)?.Dispose();
    }
}
