#nullable disable
// C# port of WebApp/src/sentinel-core/guideline.ts — the Office Modelling Guideline resolver.
// `guideline.test.ts` + `guideline-bds.test.ts` are the CONFORMANCE REFERENCE: this must give the same
// answer for the same input, exactly as LayerRulesetMatcher.cs mirrors layers.ts.
//
// PER-FIRM BY DESIGN. Nothing here knows about BDS. The guideline and the type catalogue are two swappable
// JSON files; another practice points the settings at their own and no code changes (decision D-03 — an
// office standard is config, not code). The shipped Resources copy is a reference profile, not a default
// anyone is stuck with.
//
// WHAT IT ADDS OVER LayerRulesetMatcher. That answers "is this layer a wall?" and hands back ONE family
// per layer. This answers "WHICH wall type" — because a real office picks by material, location and size,
// and a flat layer map cannot express that. See docs/BDS_TEMPLATE_TYPE_AUDIT.md for the evidence.
//
// DETERMINISTIC. Type selection is a lookup, never a judgement: the same inputs must yield the same type
// on every run, or a model can't be rebuilt and the audit trail that says "accepted" means nothing.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    // ---- the guideline document ----------------------------------------------------------------
    public sealed class GuidelineWhen
    {
        [JsonPropertyName("layer")]      public string Layer { get; set; }
        [JsonPropertyName("level")]      public string Level { get; set; }
        [JsonPropertyName("discipline")] public string Discipline { get; set; }
        [JsonPropertyName("params")]     public Dictionary<string, string> Params { get; set; }
    }

    public sealed class GuidelineUse
    {
        [JsonPropertyName("family")]      public string Family { get; set; }
        [JsonPropertyName("type")]        public string Type { get; set; }
        /// <summary>Type name with `{thickness}` filled from the measured geometry, e.g.
        /// "BDS_EXT_ARC_CMU_{thickness} mm" — one rule instead of one per thickness.</summary>
        [JsonPropertyName("typePattern")] public string TypePattern { get; set; }
        [JsonPropertyName("params")]      public Dictionary<string, object> Params { get; set; }
    }

    public sealed class GuidelineRule
    {
        [JsonPropertyName("when")] public GuidelineWhen When { get; set; }
        [JsonPropertyName("use")]  public GuidelineUse Use { get; set; }
        [JsonPropertyName("why")]  public string Why { get; set; }
    }

    public sealed class GuidelineElement
    {
        [JsonPropertyName("category")] public string Category { get; set; }
        [JsonPropertyName("rules")]    public List<GuidelineRule> Rules { get; set; } = new List<GuidelineRule>();
        [JsonPropertyName("default")]  public GuidelineUse Default { get; set; }
    }

    public sealed class GuidelineDoc
    {
        [JsonPropertyName("standard")] public string Standard { get; set; }
        [JsonPropertyName("office")]   public string Office { get; set; }
        [JsonPropertyName("elements")] public List<GuidelineElement> Elements { get; set; } = new List<GuidelineElement>();
    }

    /// <summary>One row of the office's harvested type catalogue (type-catalog.json).</summary>
    public sealed class CatalogEntry
    {
        [JsonPropertyName("category")] public string Category { get; set; }
        [JsonPropertyName("family")]   public string Family { get; set; }
        [JsonPropertyName("type")]     public string Type { get; set; }
    }

    public sealed class CatalogDoc
    {
        [JsonPropertyName("source")] public string Source { get; set; }
        [JsonPropertyName("types")]  public List<CatalogEntry> Types { get; set; } = new List<CatalogEntry>();
    }

    // ---- the answer -----------------------------------------------------------------------------
    public sealed class GuidelineResolution
    {
        public string Family { get; set; }
        public string Type { get; set; }
        public Dictionary<string, object> Params { get; set; } = new Dictionary<string, object>();
        /// <summary>"rule" · "default" · "none".</summary>
        public string Source { get; set; } = "none";
        public double Confidence { get; set; }
        public string Why { get; set; }
        /// <summary>Set when the resolved type is NOT in the office's template — the review gate shows
        /// these so a human picks, instead of the builder inventing a type or snapping to a size.</summary>
        public List<string> Available { get; set; }
    }

    public sealed class GuidelineInput
    {
        public string Category;
        public string Layer;
        public string Level;
        public string Discipline;
        public Dictionary<string, string> Params;
        /// <summary>Measured from the drawing (mm). Null when the DWG doesn't give one.</summary>
        public double? ThicknessMm;
    }

    public sealed class GuidelineMatcher
    {
        private readonly GuidelineDoc _doc;
        private readonly List<CatalogEntry> _catalog;

        public bool HasGuideline => _doc?.Elements != null && _doc.Elements.Count > 0;
        public bool HasCatalog => _catalog != null && _catalog.Count > 0;
        public string Standard => _doc?.Standard ?? "(no guideline)";

        private GuidelineMatcher(GuidelineDoc doc, List<CatalogEntry> catalog)
        {
            _doc = doc ?? new GuidelineDoc();
            _catalog = catalog ?? new List<CatalogEntry>();
        }

        /// <summary>Load from explicit paths, else %AppData%\Sentinel\, else the shipped Resources copy.
        /// Never throws — a missing or malformed guideline degrades to "no guideline", which leaves
        /// GhostBuilder exactly as it was before, rather than breaking a build.</summary>
        public static GuidelineMatcher Load(string guidelinePath = null, string catalogPath = null)
        {
            var doc = ReadJson<GuidelineDoc>(Candidates(guidelinePath, "bds-guideline.json"));
            var cat = ReadJson<CatalogDoc>(Candidates(catalogPath, "type-catalog.json"));
            return new GuidelineMatcher(doc, cat?.Types);
        }

        private static IEnumerable<string> Candidates(string explicitPath, string fileName)
        {
            if (!string.IsNullOrWhiteSpace(explicitPath)) yield return explicitPath;
            yield return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", fileName);
            string dll = Path.GetDirectoryName(typeof(GuidelineMatcher).Assembly.Location);
            if (!string.IsNullOrEmpty(dll)) yield return Path.Combine(dll, "Resources", fileName);
        }

        private static T ReadJson<T>(IEnumerable<string> paths) where T : class
        {
            foreach (string p in paths)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(p) && File.Exists(p))
                        return JsonSerializer.Deserialize<T>(File.ReadAllText(p));
                }
                catch (Exception) { /* corrupt file — try the next candidate */ }
            }
            return null;
        }

        // ---- resolution --------------------------------------------------------------------------

        private static string Norm(string s) => (s ?? string.Empty).Trim().ToLowerInvariant();
        private static string Squash(string s) => Norm(s).Replace(" ", string.Empty);

        /// <summary>
        /// Which family + type to place. First matching rule wins, MOST SPECIFIC FIRST — an author writes
        /// "external walls are CMU, and stone-clad external walls are stone" in that natural order and
        /// expects the second to win; specificity ordering gives them that without thinking about precedence.
        /// </summary>
        public GuidelineResolution Resolve(GuidelineInput input)
        {
            var el = _doc.Elements.FirstOrDefault(e => Norm(e.Category) == Norm(input.Category));
            if (el == null) return new GuidelineResolution();

            foreach (var rule in el.Rules
                         .Select((r, i) => new { r, i })
                         .OrderByDescending(x => Specificity(x.r.When)).ThenBy(x => x.i)
                         .Select(x => x.r))
            {
                if (!Matches(rule.When, input)) continue;
                return WithCatalogCheck(new GuidelineResolution
                {
                    Family = rule.Use?.Family,
                    Type = FillPattern(rule.Use, input),
                    Params = rule.Use?.Params ?? new Dictionary<string, object>(),
                    Source = "rule",
                    Confidence = 1.0,
                    Why = rule.Why,
                }, input, rule.Use?.TypePattern);
            }

            if (el.Default != null)
            {
                return WithCatalogCheck(new GuidelineResolution
                {
                    Family = el.Default.Family,
                    Type = FillPattern(el.Default, input),
                    Params = el.Default.Params ?? new Dictionary<string, object>(),
                    Source = "default",
                    Confidence = 0.6,
                    Why = "No office rule matched — fell back to the " + el.Category + " default.",
                }, input, el.Default.TypePattern);
            }
            return new GuidelineResolution();
        }

        private static int Specificity(GuidelineWhen w)
        {
            if (w == null) return 0;
            return (string.IsNullOrWhiteSpace(w.Layer) ? 0 : 1)
                 + (string.IsNullOrWhiteSpace(w.Level) ? 0 : 1)
                 + (string.IsNullOrWhiteSpace(w.Discipline) ? 0 : 1)
                 + (w.Params?.Count ?? 0);
        }

        private static bool Matches(GuidelineWhen w, GuidelineInput input)
        {
            if (w == null) return false;
            if (w.Layer != null && Norm(w.Layer) != Norm(input.Layer)) return false;
            if (w.Level != null && Norm(w.Level) != Norm(input.Level)) return false;
            if (w.Discipline != null && Norm(w.Discipline) != Norm(input.Discipline)) return false;

            foreach (var kv in w.Params ?? new Dictionary<string, string>())
            {
                // Loose on the NAME (a spec says "Fire Rating" where the model says "FireRating") and
                // substring on the VALUE (so "FR60" matches "FR60 / REI60").
                string key = (input.Params ?? new Dictionary<string, string>()).Keys
                    .FirstOrDefault(n => Squash(n) == Squash(kv.Key));
                if (key == null) return false;
                if (!Norm(input.Params[key]).Contains(Norm(kv.Value))) return false;
            }
            return true;
        }

        /// <summary>An explicit type wins; otherwise `{thickness}` is filled from the measurement.
        /// Rounded to the nearest mm — a DWG measurement is never exactly 200.0 and template names
        /// are integers. Null when a pattern has no measurement to fill it: that is a gap, not a guess.</summary>
        private static string FillPattern(GuidelineUse use, GuidelineInput input)
        {
            if (use == null) return null;
            if (!string.IsNullOrWhiteSpace(use.Type)) return use.Type;
            if (string.IsNullOrWhiteSpace(use.TypePattern) || !input.ThicknessMm.HasValue) return null;
            return use.TypePattern.Replace("{thickness}",
                Math.Round(input.ThicknessMm.Value).ToString("0", System.Globalization.CultureInfo.InvariantCulture));
        }

        /// <summary>
        /// Verify the answer against the office's own template. This is the guard that makes the original
        /// mistake impossible: a guideline written from a document named a type nobody had, and the
        /// builder would have provisioned an invented type on first run. A type the template lacks comes
        /// back at confidence 0 with the real alternatives listed, so the gate asks a human.
        /// </summary>
        private GuidelineResolution WithCatalogCheck(GuidelineResolution r, GuidelineInput input, string pattern)
        {
            if (!HasCatalog || string.IsNullOrWhiteSpace(r.Type)) return r;

            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type)
                                          && Norm(c.Category) == Norm(input.Category));
            if (present) return r;

            r.Available = pattern == null ? new List<string>() : PatternOptions(pattern, input.Category);
            r.Confidence = 0;
            r.Why = "\"" + r.Type + "\" is not in this office's template. " +
                    (r.Available.Count > 0
                        ? "Available: " + string.Join(", ", r.Available) + "."
                        : "No comparable type found — the office standard may need this type added.");
            return r;
        }

        /// <summary>Types the office's template DOES have for this pattern, smallest first.</summary>
        public List<string> PatternOptions(string pattern, string category)
        {
            // Split on the placeholder FIRST, then escape each literal part — escaping the whole string
            // and un-escaping the placeholder afterwards is where this goes wrong.
            string[] parts = pattern.Split(new[] { "{thickness}" }, StringSplitOptions.None)
                                    .Select(Regex.Escape).ToArray();
            var rx = new Regex("^" + string.Join(@"(\d+)", parts) + "$", RegexOptions.IgnoreCase);
            return _catalog
                .Where(c => Norm(c.Category) == Norm(category) && rx.IsMatch(c.Type ?? string.Empty))
                .Select(c => c.Type)
                .OrderBy(t => int.TryParse(rx.Match(t).Groups[1].Value, out int n) ? n : 0)
                .ToList();
        }

        /// <summary>Every type the guideline names that the office's template does NOT contain. Run when a
        /// guideline is authored or swapped: it is the difference between a standard and a wish list.</summary>
        public List<string> ValidateAgainstCatalog()
        {
            var errs = new List<string>();
            if (!HasCatalog) return errs; // nothing to check against — not an error
            foreach (var el in _doc.Elements)
            {
                var inCat = _catalog.Where(c => Norm(c.Category) == Norm(el.Category)).ToList();
                if (inCat.Count == 0)
                {
                    errs.Add("\"" + el.Category + "\" — this office's template has no types in that category.");
                    continue;
                }
                void Check(GuidelineUse use, string label)
                {
                    if (use == null) return;
                    if (!inCat.Any(c => Norm(c.Family) == Norm(use.Family)))
                        errs.Add(label + ": family \"" + use.Family + "\" is not in the template.");
                    if (!string.IsNullOrWhiteSpace(use.Type) && !inCat.Any(c => Norm(c.Type) == Norm(use.Type)))
                        errs.Add(label + ": type \"" + use.Type + "\" is not in the template.");
                    if (!string.IsNullOrWhiteSpace(use.TypePattern) && PatternOptions(use.TypePattern, el.Category).Count == 0)
                        errs.Add(label + ": pattern \"" + use.TypePattern + "\" matches no type in the template.");
                }
                for (int i = 0; i < el.Rules.Count; i++) Check(el.Rules[i].Use, el.Category + " rule " + (i + 1));
                Check(el.Default, el.Category + " default");
            }
            return errs;
        }
    }
}
