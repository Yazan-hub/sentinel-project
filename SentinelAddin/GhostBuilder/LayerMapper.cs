#nullable disable
// ponytail: nullable off to match the ported GhostBuilder module; annotate when hardening.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The seam every layer-name-to-family mapper implements. LocalGhostBuilder is the LLM-backed
    /// implementation; LayerMapper is a caching decorator over it. The orchestrator depends on this
    /// interface so the two compose without either knowing about the other.
    /// </summary>
    public interface ILayerMapper
    {
        Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default);
    }

    /// <summary>
    /// Resilience layer for "dirty" external DWGs whose layer names are unpredictable and
    /// non-standardised. It resolves each layer in three tiers, cheapest first:
    ///
    ///   1. PERSISTENT CACHE  — a JSON dictionary (%AppData%\Sentinel\dwg_mappings.json) of layers
    ///      resolved on a previous run. A DWG from the same source re-uses these for free.
    ///   2. BASE DICTIONARY   — built-in keyword heuristics (A-WALL/PARTITION -> Walls, etc.) that
    ///      cover standard AIA-style names without any model call.
    ///   3. LOCAL LLM         — ONLY the layers neither tier recognised are handed to the wrapped
    ///      ILayerMapper (LocalGhostBuilder -> Ollama). Whatever it returns is written back to the
    ///      cache, so each novel layer costs the model exactly once.
    ///
    /// Pure data + network + file I/O — no Revit API — so it stays safe to await off the API thread,
    /// exactly like the LocalGhostBuilder it wraps.
    /// </summary>
    public sealed class LayerMapper : ILayerMapper, IDisposable
    {
        private readonly ILayerMapper _llm;                       // tier 3: unknown layers only
        private readonly LayerRulesetMatcher _matcher;            // tier 0 (ignore) + tier 2 (map): standard-driven
        private readonly string _cachePath;                      // tier 1 backing file
        private readonly Dictionary<string, LayerMapping> _cache; // normalised layer -> mapping
        private bool _dirty;

        public LayerMapper(ILayerMapper llmFallback, string cachePath = null, LayerRulesetMatcher matcher = null)
        {
            _llm = llmFallback ?? throw new ArgumentNullException(nameof(llmFallback));
            _matcher = matcher ?? LayerRulesetMatcher.Load(); // P1: BDS DWG Layer Standard drives ignore + mapping
            _cachePath = cachePath ?? DefaultCachePath();
            _cache = LoadCache(_cachePath);

            // Self-heal: purge any previously-cached system/annotation layers (e.g. a stale
            // DEFPOINTS -> Walls written before the ignore-list existed) so the next save drops them.
            var stale = _cache.Keys.Where(_matcher.ShouldIgnore).ToList();
            foreach (string k in stale) _cache.Remove(k);
            if (stale.Count > 0) _dirty = true;
        }

        public static string DefaultCachePath() => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "dwg_mappings.json");

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
                // Tier 0: AutoCAD system / annotation layers are never model geometry — drop them
                // before any cache/dictionary/LLM work so they can't become walls, furniture, or
                // IFC noise, and never cost a model call.
                if (_matcher.ShouldIgnore(layer)) continue;

                string key = Normalize(layer);

                // Tier 1: previously resolved (by this or an earlier DWG from the same source).
                if (_cache.TryGetValue(key, out LayerMapping cached))
                {
                    resolved.Add(WithLayer(cached, layer));
                    continue;
                }

                // Tier 2: the BDS DWG Layer Standard (exact / alias / standard-format), with the old
                // keyword heuristics kept as a fallback inside the matcher.
                LayerMapping baseHit = _matcher.Match(layer);
                if (baseHit != null)
                {
                    _cache[key] = baseHit;
                    _dirty = true;
                    resolved.Add(WithLayer(baseHit, layer));
                    continue;
                }

                // Tier 3 candidate: hand to the LLM below.
                unknown.Add(layer);
            }

            // One model round-trip for everything neither tier recognised.
            if (unknown.Count > 0)
            {
                MappingResult llmResult = await _llm.MapLayersAsync(unknown, ct).ConfigureAwait(false);
                foreach (LayerMapping m in llmResult?.Mappings ?? Enumerable.Empty<LayerMapping>())
                {
                    if (m == null || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                    _cache[Normalize(m.CadLayer)] = m;   // learn it for next time
                    _dirty = true;
                    resolved.Add(m);
                }
            }

            if (_dirty) SaveCache();
            return new MappingResult { Mappings = resolved };
        }

        // Tier 0 (ignore) + tier 2 (standard-driven mapping) now live in LayerRulesetMatcher, loaded from
        // the BDS DWG Layer Standard (bds-layers.json). See LayerRulesetMatcher.cs.

        // ---- cache persistence (tier 1) ----

        private static string Normalize(string layer) => layer.Trim().ToUpperInvariant();

        private static Dictionary<string, LayerMapping> LoadCache(string path)
        {
            var dict = new Dictionary<string, LayerMapping>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (File.Exists(path))
                {
                    var loaded = JsonSerializer.Deserialize<Dictionary<string, LayerMapping>>(
                        File.ReadAllText(path));
                    if (loaded != null)
                        foreach (var kv in loaded)
                            if (kv.Value != null) dict[kv.Key] = kv.Value;
                }
            }
            catch (Exception) { /* corrupt/unreadable cache -> start empty, it will be rebuilt */ }
            return dict;
        }

        private void SaveCache()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath));
                File.WriteAllText(_cachePath,
                    JsonSerializer.Serialize(_cache, new JsonSerializerOptions { WriteIndented = true }));
                _dirty = false;
            }
            catch (Exception) { /* best-effort: a read-only cache dir must not fail the mapping run */ }
        }

        // A returned mapping must carry the DWG's ACTUAL layer string (case included) so the
        // placement engine's by-layer join lines up; the cached copy stays untouched.
        private static LayerMapping WithLayer(LayerMapping src, string layer) => new LayerMapping
        {
            CadLayer = layer,
            Category = src.Category,
            BdsFamily = src.BdsFamily,
            BdsFamilyType = src.BdsFamilyType,
            Confidence = src.Confidence,
            // P2: carry the proposal's document-derived fields; a cached row has none (enrichment runs
            // per-project, after mapping) but a matcher-supplied one may, and dropping them silently
            // would lose the build proposal's provenance.
            Params = src.Params,
            Rationale = src.Rationale,
            SourceDoc = src.SourceDoc,
        };

        public void Dispose() => (_llm as IDisposable)?.Dispose();
    }
}
