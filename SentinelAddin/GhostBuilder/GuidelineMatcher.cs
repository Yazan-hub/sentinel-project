#nullable disable
// C# port of WebApp/src/sentinel-core/guideline.ts — the Office Modelling Guideline resolver.
// `guideline.test.ts` + `guideline-bds.test.ts` are the CONFORMANCE REFERENCE: this must give the same
// answer for the same input, exactly as LayerRulesetMatcher.cs mirrors layers.ts. RuleProduces, RuleParam, CatalogHas,
// CatalogOfSize and HasRulesFor are Promote's C#-only reads; they have no TS twin.
//
// PER-FIRM BY DESIGN. Nothing here knows about any office. The guideline and the type catalogue are artefacts —
// guideline@n and type_catalog@n installed on the document's web project or its office (cohesion phase 4b) —
// resolved by GhostStandards and read here by FromBodies. Nothing ships beside the DLL and nothing is read from
// the machine: with none installed there is no guideline, and every surface that builds says so.
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
        [JsonPropertyName("standard")]   public string Standard { get; set; }
        [JsonPropertyName("office")]     public string Office { get; set; }
        /// <summary>"draft" while the office has not confirmed the rules (Promote's summary says so), else null/"approved".</summary>
        [JsonPropertyName("status")]     public string Status { get; set; }
        [JsonPropertyName("elements")]   public List<GuidelineElement> Elements { get; set; } = new List<GuidelineElement>();
        [JsonPropertyName("graphics")]   public GuidelineGraphics Graphics { get; set; }
        [JsonPropertyName("views")]      public List<GuidelineViewStandard> Views { get; set; }
        [JsonPropertyName("viewNaming")] public GuidelineViewNaming ViewNaming { get; set; }
    }

    public sealed class GuidelineTag
    {
        [JsonPropertyName("family")]         public string Family { get; set; }
        [JsonPropertyName("type")]           public string Type { get; set; }
        [JsonPropertyName("officeAuthored")] public bool OfficeAuthored { get; set; }
    }

    public sealed class GuidelineGraphics
    {
        [JsonPropertyName("tags")] public Dictionary<string, GuidelineTag> Tags { get; set; }
    }

    public sealed class GuidelineViewStandard
    {
        [JsonPropertyName("use")]           public string Use { get; set; }
        [JsonPropertyName("wipTemplate")]   public string WipTemplate { get; set; }
        [JsonPropertyName("sheetTemplate")] public string SheetTemplate { get; set; }
        [JsonPropertyName("viewType")]      public string ViewType { get; set; }
        [JsonPropertyName("namePrefix")]    public string NamePrefix { get; set; }
        [JsonPropertyName("tag")]           public List<string> Tag { get; set; }
    }

    public sealed class GuidelineViewNaming
    {
        [JsonPropertyName("structure")]      public string Structure { get; set; }
        [JsonPropertyName("statusPrefixes")] public Dictionary<string, string> StatusPrefixes { get; set; }
    }

    /// <summary>One row of the office's harvested type catalogue (a type_catalog@n body's <c>types[]</c>).</summary>
    public sealed class CatalogEntry
    {
        [JsonPropertyName("category")] public string Category { get; set; }
        [JsonPropertyName("family")]   public string Family { get; set; }
        [JsonPropertyName("type")]     public string Type { get; set; }
    }

    /// <summary>The template a catalogue was harvested from (Build Office System's export).</summary>
    public sealed class CatalogTemplate
    {
        [JsonPropertyName("title")]        public string Title { get; set; }
        [JsonPropertyName("path")]         public string Path { get; set; }
        [JsonPropertyName("extracted_at")] public string ExtractedAt { get; set; }
    }

    public sealed class CatalogDoc
    {
        /// <summary><c>template</c>, never <c>source</c>: the bridge's PUT route lifts a top-level source into the
        /// artefact's pointer, and the catalogue would lose it (spec 2026-09-25-standards-4b decision 4).</summary>
        [JsonPropertyName("template")] public CatalogTemplate Template { get; set; }
        [JsonPropertyName("types")]    public List<CatalogEntry> Types { get; set; } = new List<CatalogEntry>();
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
        private readonly CatalogTemplate _template;

        public bool HasGuideline => _doc?.Elements != null && _doc.Elements.Count > 0;
        public bool HasCatalog => _catalog != null && _catalog.Count > 0;
        public string Standard => _doc?.Standard ?? "(no guideline)";
        /// <summary>The office code the guideline names ("BDS"), or null.</summary>
        public string Office => _doc?.Office;
        public bool IsDraft => string.Equals(_doc?.Status, "draft", StringComparison.OrdinalIgnoreCase);
        public List<GuidelineViewStandard> Views => _doc?.Views;
        public GuidelineViewNaming ViewNaming => _doc?.ViewNaming;
        public GuidelineGraphics Graphics => _doc?.Graphics;

        /// <summary>What the catalogue check judges by: the type_catalog artefact's label ("type_catalog@1 · office ·
        /// 3f2a9c…", or "none — not installed for &lt;key&gt; or its office"). GhostStandards sets it; every gap text
        /// names it, so a reviewer sees WHICH catalogue called a type missing (F54).</summary>
        public string CatalogLabel { get; set; } = "type_catalog (unlabelled)";

        /// <summary>The template the catalogue was harvested from (its <c>template.title</c>), or null.</summary>
        public string TemplateTitle => _template?.Title;

        private GuidelineMatcher(GuidelineDoc doc, List<CatalogEntry> catalog, CatalogTemplate template)
        {
            _doc = doc ?? new GuidelineDoc();
            _catalog = catalog ?? new List<CatalogEntry>();
            _template = template;
        }

        /// <summary>
        /// The guideline@n and type_catalog@n bodies (the raw artefact JSON; null = none installed) → the matcher.
        /// Each body is checked by the bridge validator's rules (artefact-store.mjs validateArtefact; spec
        /// 2026-09-25-standards-4b decision 4) before it is read, and one that fails is left out with
        /// <paramref name="guidelineError"/> / <paramref name="catalogError"/> naming the field — never a partial
        /// standard, never a file on the machine or beside the DLL. Always returns a matcher (HasGuideline and
        /// HasCatalog say what it holds); never throws.
        /// </summary>
        public static GuidelineMatcher FromBodies(string guidelineJson, string catalogJson,
                                                  out string guidelineError, out string catalogError)
        {
            var doc = Read<GuidelineDoc>(guidelineJson, CheckGuideline, out guidelineError);
            var cat = Read<CatalogDoc>(catalogJson, CheckCatalog, out catalogError);
            return new GuidelineMatcher(doc, cat?.Types, cat?.Template);
        }

        /// <summary>How placement reports a wall it could not type: "gap: &lt;what&gt; — &lt;why&gt; (type_catalog:
        /// &lt;label&gt;)", naming the catalogue in force.</summary>
        public string Gap(string what, string why) => "gap: " + what + " — " + why + " (type_catalog: " + CatalogLabel + ")";

        // ---- reading a body --------------------------------------------------------------------------

        private const int MaxCatalogTypes = 20000; // = the bridge's MAX_CATALOG_TYPES (artefact-store.mjs)

        private static T Read<T>(string json, Action<JsonElement> check, out string error) where T : class
        {
            error = null;
            if (json == null) return null; // none installed: not an error
            try
            {
                if (string.IsNullOrWhiteSpace(json)) throw new InvalidDataException("the body is empty");
                using (var d = JsonDocument.Parse(json))
                {
                    var b = d.RootElement;
                    if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
                    if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                    check(b);
                }
                return JsonSerializer.Deserialize<T>(json);
            }
            catch (Exception ex) { error = ex.Message; return null; }
        }

        // guideline@n as the bridge validates it: what Resolve dereferences (elements[].rules[].when/use.family).
        private static void CheckGuideline(JsonElement b)
        {
            if (!Filled(b, "standard")) throw Bad("standard", "must be a non-empty string");
            if (!b.TryGetProperty("elements", out var els) || els.ValueKind != JsonValueKind.Array || els.GetArrayLength() == 0)
                throw Bad("elements", "must be a non-empty array");
            int i = 0;
            foreach (var e in els.EnumerateArray())
            {
                string at = "elements[" + i++ + "]";
                if (e.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                if (!Filled(e, "category")) throw Bad(at + ".category", "must be a non-empty string");
                if (!e.TryGetProperty("rules", out var rules) || rules.ValueKind != JsonValueKind.Array) throw Bad(at + ".rules", "must be an array");
                int j = 0;
                foreach (var r in rules.EnumerateArray())
                {
                    string rat = at + ".rules[" + j++ + "]";
                    if (r.ValueKind != JsonValueKind.Object) throw Bad(rat, "must be an object");
                    if (!r.TryGetProperty("when", out var w) || w.ValueKind != JsonValueKind.Object) throw Bad(rat + ".when", "must be an object");
                    if (!r.TryGetProperty("use", out var u) || u.ValueKind != JsonValueKind.Object || !Filled(u, "family"))
                        throw Bad(rat + ".use.family", "must be a non-empty string");
                }
                if (Present(e, "default", out var def) && !(def.ValueKind == JsonValueKind.Object && Filled(def, "family")))
                    throw Bad(at + ".default.family", "must be a non-empty string");
            }
            if (Present(b, "views", out var views) && views.ValueKind != JsonValueKind.Array) throw Bad("views", "must be an array");
            if (Present(b, "viewNaming", out var vn) && vn.ValueKind != JsonValueKind.Object) throw Bad("viewNaming", "must be an object");
        }

        // type_catalog@n as the bridge validates it (the office-snapshot row shape, template instead of source).
        private static void CheckCatalog(JsonElement b)
        {
            if (!b.TryGetProperty("types", out var types) || types.ValueKind != JsonValueKind.Array || types.GetArrayLength() == 0)
                throw Bad("types", "must be a non-empty array");
            if (types.GetArrayLength() > MaxCatalogTypes)
                throw Bad("types", "must hold at most " + MaxCatalogTypes + " entries (has " + types.GetArrayLength() + ")");
            int i = 0;
            foreach (var t in types.EnumerateArray())
            {
                string at = "types[" + i++ + "]";
                if (t.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                if (!Filled(t, "category")) throw Bad(at + ".category", "must be a non-empty string");
                if (!Filled(t, "type")) throw Bad(at + ".type", "must be a non-empty string");
                if (Present(t, "family", out var fam) && fam.ValueKind != JsonValueKind.String) throw Bad(at + ".family", "must be a string");
                if (Present(t, "system", out var sys) && sys.ValueKind != JsonValueKind.True && sys.ValueKind != JsonValueKind.False)
                    throw Bad(at + ".system", "must be true or false");
                if (Present(t, "width_mm", out var w) && w.ValueKind != JsonValueKind.Number) throw Bad(at + ".width_mm", "must be a number or null");
                if (Present(t, "height_mm", out var h) && h.ValueKind != JsonValueKind.Number) throw Bad(at + ".height_mm", "must be a number or null");
            }
            if (Present(b, "template", out var tpl))
            {
                if (tpl.ValueKind != JsonValueKind.Object) throw Bad("template", "must be an object {title, path?, extracted_at?}");
                if (!Filled(tpl, "title")) throw Bad("template.title", "must be a non-empty string");
                if (Present(tpl, "path", out var p) && p.ValueKind != JsonValueKind.String) throw Bad("template.path", "must be a string");
                if (Present(tpl, "extracted_at", out var x) && x.ValueKind != JsonValueKind.String) throw Bad("template.extracted_at", "must be a string");
            }
            if (Present(b, "view_templates", out var vt) && vt.ValueKind != JsonValueKind.Array) throw Bad("view_templates", "must be an array");
        }

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException(path + " " + want);

        // Optional = absent or null, as the bridge reads it.
        private static bool Present(JsonElement o, string name, out JsonElement v) =>
            o.TryGetProperty(name, out v) && v.ValueKind != JsonValueKind.Null;

        // Blank as the bridge's filled() reads it: char.IsWhiteSpace plus U+FEFF (as DeliveryContract does).
        private static bool Filled(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            && v.GetString().Any(ch => !char.IsWhiteSpace(ch) && ch != '\uFEFF');

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
        /// Verify the answer against the installed type catalogue (type_catalog@n, the office template's
        /// harvest). This is the guard that makes the original mistake impossible: a guideline written from a
        /// document named a type nobody had, and the builder would have provisioned an invented type on first
        /// run. A type the catalogue lacks comes back at confidence 0 with the real alternatives listed and the
        /// catalogue named (<see cref="CatalogLabel"/>), so the gate asks a human. No catalogue → unchecked here;
        /// placement then checks the type against the open document only, and says so.
        /// </summary>
        private GuidelineResolution WithCatalogCheck(GuidelineResolution r, GuidelineInput input, string pattern)
        {
            if (!HasCatalog || string.IsNullOrWhiteSpace(r.Type)) return r;

            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type)
                                          && Norm(c.Category) == Norm(input.Category));
            if (present) return r;

            r.Available = pattern == null ? new List<string>() : PatternOptions(pattern, input.Category);
            r.Confidence = 0;
            r.Why = "\"" + r.Type + "\" is not in " + CatalogLabel +
                    (TemplateTitle == null ? "" : " (template " + TemplateTitle + ")") + ". " +
                    (r.Available.Count > 0
                        ? "Available: " + string.Join(", ", r.Available) + "."
                        : "No comparable type in it — the office standard may need this type added.");
            return r;
        }

        /// <summary>Types the office's template DOES have for this pattern, smallest first.</summary>
        public List<string> PatternOptions(string pattern, string category)
        {
            var rx = PatternRx(pattern);
            return _catalog
                .Where(c => Norm(c.Category) == Norm(category) && rx.IsMatch(c.Type ?? string.Empty))
                .Select(c => c.Type)
                .OrderBy(t => int.TryParse(rx.Match(t).Groups[1].Value, out int n) ? n : 0)
                .ToList();
        }

        // Split on the placeholder FIRST, then escape each literal part — escaping the whole string
        // and un-escaping the placeholder afterwards is where this goes wrong.
        private static Regex PatternRx(string pattern) =>
            new Regex("^" + string.Join(@"(\d+)", pattern.Split(new[] { "{thickness}" }, StringSplitOptions.None).Select(Regex.Escape)) + "$",
                      RegexOptions.IgnoreCase);

        /// <summary>Is <paramref name="typeName"/> a type one of <paramref name="category"/>'s RULES produces — its use.type,
        /// or its use.typePattern with {thickness} a number? Case-insensitive; the default is not a rule, and the catalogue
        /// is not consulted (MA-0: a wall already on such a type is settled, whatever its type's Function says). With
        /// <paramref name="family"/>, the rule's use.family must be it too (Promote v1: window type names repeat across families).</summary>
        public bool RuleProduces(string category, string typeName, string family = null) => Producers(category, typeName, family).Any();

        private IEnumerable<GuidelineRule> Producers(string category, string typeName, string family = null)
        {
            if (string.IsNullOrWhiteSpace(typeName)) return Enumerable.Empty<GuidelineRule>();
            var el = _doc.Elements.FirstOrDefault(e => Norm(e.Category) == Norm(category));
            return el == null ? Enumerable.Empty<GuidelineRule>() : el.Rules.Where(r => r.Use != null
                && (family == null || Norm(r.Use.Family) == Norm(family))
                && ((!string.IsNullOrWhiteSpace(r.Use.Type) && Norm(r.Use.Type) == Norm(typeName))
                    || (!string.IsNullOrWhiteSpace(r.Use.TypePattern) && PatternRx(r.Use.TypePattern).IsMatch(typeName))));
        }

        /// <summary>The when.params[<paramref name="param"/>] of the rules that produce <paramref name="typeName"/> under
        /// <paramref name="category"/> — one value, or null when none does, none names it, or they disagree (Promote v1: a door's
        /// location from its settled host's DD rule, not from the template's Function — drill B33 F2).</summary>
        public string RuleParam(string category, string typeName, string param)
        {
            var values = Producers(category, typeName)
                .Select(r => r.When?.Params?.FirstOrDefault(kv => Squash(kv.Key) == Squash(param)).Value)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return values.Count == 1 ? values[0] : null; // a producing rule that does not name it is a disagreement
        }

        /// <summary>Does the catalogue hold exactly this family AND type under the category? (Resolve's check matches the type
        /// name only; window type names repeat across families.)</summary>
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => Norm(c.Category) == Norm(category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));

        /// <summary>"Family : Type" of every catalogue type of the category whose name carries exactly this W x H
        /// (TypeNameParse.TrySection) — what a door or window gap names.</summary>
        public List<string> CatalogOfSize(string category, double widthMm, double heightMm) =>
            _catalog.Where(c => Norm(c.Category) == Norm(category) && TypeNameParse.TrySection(c.Type, out var w, out var h)
                             && Math.Abs(w - widthMm) < 0.001 && Math.Abs(h - heightMm) < 0.001)
                    .Select(c => c.Family + " : " + c.Type).ToList();

        /// <summary>Has the guideline an element block for the category?</summary>
        public bool HasRulesFor(string category) => _doc.Elements.Any(e => Norm(e.Category) == Norm(category));

        /// <summary>The catalogue's types a provisioner may clone for <paramref name="typeName"/> under
        /// <paramref name="category"/>: what <see cref="GuidelineResolution.Available"/> lists for a guideline gap — the
        /// same name stem at another thickness (BDS_EXT_ARC_CMU_{thickness} mm), smallest first, the name itself left
        /// out. Never merely the same Revit family: in a template every wall is "Basic Wall", and a plaster build-up
        /// renamed as a metal type would be the F43 lie under the standard's own name. Empty when no catalogue is
        /// installed, the name carries no thickness (no stem to share), or the catalogue has no other size of it.</summary>
        public List<string> CatalogSiblings(string category, string typeName)
        {
            string pattern = TypeNameParse.ThicknessPattern(typeName);
            if (pattern == null || !HasCatalog) return new List<string>();
            return PatternOptions(pattern, category).Where(t => Norm(t) != Norm(typeName)).ToList();
        }

        /// <summary>Of <paramref name="siblings"/> (catalogue types), the one <paramref name="inDocument"/> holds whose
        /// named thickness is nearest <paramref name="targetMm"/> — the build-up a new type inherits. Null when the
        /// document holds none: the caller reports the gap, never clones an unrelated type. Pure; names compare
        /// case-insensitively and the catalogue's spelling is returned.</summary>
        public static string NearestSiblingInDocument(IEnumerable<string> siblings, IEnumerable<string> inDocument, double targetMm)
        {
            var present = new HashSet<string>(inDocument ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            return (siblings ?? Enumerable.Empty<string>())
                .Where(s => s != null && present.Contains(s))
                .OrderBy(s => Math.Abs(TypeNameParse.ThicknessMm(s) - targetMm))
                .FirstOrDefault();
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
