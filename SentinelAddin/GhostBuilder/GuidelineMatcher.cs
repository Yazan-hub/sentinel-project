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
        /// <summary>MA-1a item 6: where a placed element goes; null when the guideline has no block.</summary>
        [JsonPropertyName("placement")]  public GuidelinePlacement Placement { get; set; }
    }

    /// <summary>MA-1a item 6: guideline@n's placement block. <c>worksets</c> maps a category (an <c>elements[].category</c>,
    /// or "Levels" / "Grids") to a workset name; <c>phase</c> is "view" (the phase of the view the person builds in) or
    /// absent. There is no design-option field: Sentinel never places into a design option (PlacementPolicy).</summary>
    public sealed class GuidelinePlacement
    {
        [JsonPropertyName("worksets")] public Dictionary<string, string> Worksets { get; set; }
        [JsonPropertyName("phase")]    public string Phase { get; set; }
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
        /// <summary>A door's or window's harvested type Width and Height (mm); null when not harvested.</summary>
        [JsonPropertyName("width_mm")]  public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
        /// <summary>MA-2a (BOS-5): the row's BuiltInCategory as its enum name ("OST_Walls"), written by Build Office System since
        /// MA-2a; null on a type_catalog@1 harvested before it. A row matches a category by name OR by this (SameCategory).</summary>
        [JsonPropertyName("bic")]       public string Bic { get; set; }
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
        /// <summary>MA-2a: the conditions the winning rule stated, in the rule's own spelling — "layer", "level", "discipline",
        /// "param:Location" — as guideline.ts's <c>matched</c>; null for a default or none. Promote's reason names them.</summary>
        public List<string> Matched { get; set; }
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
        /// <summary>MA-1a item 6: the guideline's placement block; null when it has none or no guideline is installed.</summary>
        public GuidelinePlacement Placement => _doc?.Placement;

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
            // MA-1a item 6: the placement block, refused as the bridge refuses it (artefact-store.mjs), in the same words —
            // tools/promote-check runs both against WebApp/bridge/fixtures/guideline-placement/cases.json.
            if (Present(b, "placement", out var pl))
            {
                if (pl.ValueKind != JsonValueKind.Object) throw Bad("placement", "must be an object");
                foreach (var f in pl.EnumerateObject())
                    if (f.Name != "worksets" && f.Name != "phase") throw Bad("placement." + f.Name, "is not a placement field (worksets, phase)");
                if (Present(pl, "worksets", out var ws))
                {
                    if (ws.ValueKind != JsonValueKind.Object) throw Bad("placement.worksets", "must be an object of category: workset name");
                    // Review amendment C8: a key is a category Sentinel places, named once (case and padding ignored).
                    var named = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var w in ws.EnumerateObject())
                    {
                        string canon = GuidelineMatcher.PlacementCategories.FirstOrDefault(c => string.Equals(c, w.Name.Trim(), StringComparison.OrdinalIgnoreCase));
                        if (canon == null) throw Bad("placement.worksets." + w.Name, "is not a category Sentinel places (" + string.Join(", ", GuidelineMatcher.PlacementCategories) + ")");
                        if (!named.Add(canon)) throw Bad("placement.worksets." + w.Name, "names the category " + canon + " a second time");
                        if (w.Value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(w.Value.GetString()))
                            throw Bad("placement.worksets." + w.Name, "must be a non-empty workset name");
                    }
                }
                if (Present(pl, "phase", out var ph) && !(ph.ValueKind == JsonValueKind.String && ph.GetString() == "view"))
                    throw Bad("placement.phase", "must be \"view\" (the phase of the view the person builds in)");
            }
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
                if (Present(t, "bic", out var bic) && bic.ValueKind != JsonValueKind.String) throw Bad(at + ".bic", "must be a string (a BuiltInCategory name)");
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
        // Every whitespace, as guideline.ts's `\s+` does — a poster's NBSP in a fact name typed on the bridge and not here (review C23).
        private static string Squash(string s) => new string(Norm(s).Where(ch => !char.IsWhiteSpace(ch)).ToArray());

        /// <summary>MA-2a (BOS-5): the BuiltInCategory of each category Sentinel places (PlacementCategories), as a harvested row's
        /// <c>bic</c> spells it. guideline.ts's CATEGORY_BIC is the same list, name for name (the layer-free fixture holds both to it).</summary>
        internal static readonly IReadOnlyDictionary<string, string> CategoryBics = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Walls"] = "OST_Walls", ["Floors"] = "OST_Floors", ["Roofs"] = "OST_Roofs", ["Ceilings"] = "OST_Ceilings", ["Doors"] = "OST_Doors",
            ["Windows"] = "OST_Windows", ["Columns"] = "OST_Columns", ["Furniture"] = "OST_Furniture", ["Levels"] = "OST_Levels", ["Grids"] = "OST_Grids",
        };

        /// <summary>Does a catalogue row belong to <paramref name="category"/>? By name (case and padding ignored), or by its
        /// BuiltInCategory when the row carries one and the category is one Sentinel places — so a catalogue harvested on a
        /// non-English Revit ("Wände", OST_Walls) answers for "Walls". Never by name alone across locales.</summary>
        private static bool SameCategory(CatalogEntry c, string category)
        {
            if (Norm(c.Category) == Norm(category)) return true;
            if (string.IsNullOrEmpty(c.Bic)) return false;
            string key = CategoryBics.Keys.FirstOrDefault(k => Norm(k) == Norm(category));
            return key != null && CategoryBics[key] == c.Bic;
        }

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
                var hit = Matches(rule.When, input);
                if (hit == null) continue;
                return WithCatalogCheck(new GuidelineResolution
                {
                    Family = rule.Use?.Family,
                    Type = FillPattern(rule.Use, input),
                    Params = rule.Use?.Params ?? new Dictionary<string, object>(),
                    Source = "rule",
                    Confidence = 1.0,
                    Why = rule.Why,
                    Matched = hit,
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

        /// <summary>The conditions the rule stated and the input met ("layer", "level", "discipline", "param:&lt;key&gt;"), or null when
        /// one is not met — guideline.ts's matches(). A stated field must match; an unstated one is a wildcard.</summary>
        private static List<string> Matches(GuidelineWhen w, GuidelineInput input)
        {
            if (w == null) return null;
            var hit = new List<string>();
            if (w.Layer != null) { if (Norm(w.Layer) != Norm(input.Layer)) return null; hit.Add("layer"); }
            if (w.Level != null) { if (Norm(w.Level) != Norm(input.Level)) return null; hit.Add("level"); }
            if (w.Discipline != null) { if (Norm(w.Discipline) != Norm(input.Discipline)) return null; hit.Add("discipline"); }

            foreach (var kv in w.Params ?? new Dictionary<string, string>())
            {
                // Loose on the NAME (a spec says "Fire Rating" where the model says "FireRating") and
                // substring on the VALUE (so "FR60" matches "FR60 / REI60").
                string key = (input.Params ?? new Dictionary<string, string>()).Keys
                    .FirstOrDefault(n => Squash(n) == Squash(kv.Key));
                if (key == null) return null;
                if (!Norm(input.Params[key]).Contains(Norm(kv.Value))) return null;
                hit.Add("param:" + kv.Key);
            }
            return hit;
        }

        /// <summary>An explicit type wins; otherwise `{thickness}` is filled from the measurement.
        /// Rounded to the nearest mm — a DWG measurement is never exactly 200.0 and template names
        /// are integers. Null when a pattern has no measurement to fill it: that is a gap, not a guess.
        /// Half a millimetre rounds UP (AwayFromZero), as JavaScript's Math.round does for a positive number: .NET's default is
        /// to-even, and 100.5 mm named CMU_100 here and CMU_101 on the bridge (review of MA-2a; the shared fixture pins 100.5).</summary>
        private static string FillPattern(GuidelineUse use, GuidelineInput input)
        {
            if (use == null) return null;
            if (!string.IsNullOrWhiteSpace(use.Type)) return use.Type;
            if (string.IsNullOrWhiteSpace(use.TypePattern) || !input.ThicknessMm.HasValue) return null;
            return use.TypePattern.Replace("{thickness}",
                Math.Round(input.ThicknessMm.Value, MidpointRounding.AwayFromZero).ToString("0", System.Globalization.CultureInfo.InvariantCulture));
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

            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type) && SameCategory(c, input.Category));
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
                .Where(c => SameCategory(c, category) && rx.IsMatch(c.Type ?? string.Empty))
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

        /// <summary>MA-2a: a settled host's inside or outside — each producing rule's when.params Function, else its Location (the same
        /// two words), the one distinct value, or null when the rules disagree. A rule that names neither is skipped: the DD layer-free
        /// file produces one type from a Location+Material rule AND a Function rule, and RuleParam reads "not named" as a disagreement
        /// (review C6). Promote v1's Swap reads a door's location from it.</summary>
        public string RuleLocation(string category, string typeName)
        {
            var values = Producers(category, typeName)
                .Select(r => r.When?.Params?.FirstOrDefault(kv => Squash(kv.Key) == "function").Value
                          ?? r.When?.Params?.FirstOrDefault(kv => Squash(kv.Key) == "location").Value)
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return values.Count == 1 ? values[0] : null;
        }

        /// <summary>Does the catalogue hold exactly this family AND type under the category? (Resolve's check matches the type
        /// name only; window type names repeat across families.)</summary>
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => SameCategory(c, category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));

        /// <summary>"Family : Type" of every catalogue type of the category whose name carries exactly this W x H
        /// (TypeNameParse.TrySection) — what a door or window gap names. With <paramref name="faults"/>, a type whose harvested
        /// width_mm x height_mm say otherwise (0 x 0 included) goes there instead: its name cannot be trusted (WN-3).</summary>
        public List<string> CatalogOfSize(string category, double widthMm, double heightMm, List<string> faults = null)
        {
            bool Is(double? v, double want) => v.HasValue && Math.Abs(v.Value - want) < 0.001;
            var named = _catalog.Where(c => SameCategory(c, category) && TypeNameParse.TrySection(c.Type, out var w, out var h)
                                           && Is(w, widthMm) && Is(h, heightMm)).ToList();
            var bad = faults == null ? new List<CatalogEntry>()
                : named.Where(c => c.WidthMm.HasValue && c.HeightMm.HasValue && !(Is(c.WidthMm, widthMm) && Is(c.HeightMm, heightMm))).ToList();
            faults?.AddRange(bad.Select(c => c.Family + " : " + c.Type));
            return named.Except(bad).Select(c => c.Family + " : " + c.Type).ToList();
        }

        /// <summary>Has the guideline an element block for the category?</summary>
        public bool HasRulesFor(string category) => _doc.Elements.Any(e => Norm(e.Category) == Norm(category));

        /// <summary>MA-1a item 6 (review amendment C8): the categories a placement block may name a workset for — the ones
        /// Sentinel places (every changeset kind lands in one: PlacementPolicy.CategoriesOf; tools/promote-check holds the
        /// two lists equal). The bridge's check carries the same list (artefact-store.mjs); the shared cases prove it.</summary>
        internal static readonly string[] PlacementCategories =
            { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Columns", "Furniture", "Levels", "Grids" };

        /// <summary>MA-1a item 6, the office-template check: of the catalogue's types in the categories the guideline has
        /// rules for, how many the open model holds. <paramref name="documentTypes"/> is the model's types by category as
        /// GhostBuilderCommand.LoadedTypes reads them; a category it did not read is not counted. A type matches by its name
        /// and, when the reader gives one, its family (a system type — a wall, a floor — has none). Total 0 = nothing to
        /// compare: no catalogue, or no category in common.</summary>
        public (int Present, int Total) OfficeTypesIn(IReadOnlyDictionary<string, IReadOnlyList<(string Family, string Type)>> documentTypes)
        {
            int present = 0, total = 0;
            foreach (var c in _catalog)
            {
                // MA-2a (BOS-5): a row filed under a localized name counts for the English category its bic names.
                string cat = CategoryBics.Keys.FirstOrDefault(k => SameCategory(c, k)) ?? c.Category;
                if (!HasRulesFor(cat)) continue;
                string key = documentTypes.Keys.FirstOrDefault(k => SameCategory(c, k));
                if (key == null) continue;
                total++;
                if (documentTypes[key].Any(t => Norm(t.Type) == Norm(c.Type) && (t.Family == null || Norm(t.Family) == Norm(c.Family)))) present++;
            }
            return (present, total);
        }

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
                var inCat = _catalog.Where(c => SameCategory(c, el.Category)).ToList();
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
