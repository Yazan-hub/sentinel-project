#nullable disable
// Promote v1 — the pure planner for the classes after walls: floors, roofs and ceilings are retyped to the exact DD type,
// doors and windows swapped to an office family type (their host kept). Walls stay PromoteWallsPlanner's (MA-0); this
// merges the other classes into the same storey plans, so one storey still files one changeset. No Revit types, so
// tools/promote-check drives it offline. Commands.PromoteWalls reads the facts.
//
// The same principles as the walls: EXACT OR A PERSON (D16) — a rule at confidence 1 whose type is already loaded here, or
// a held row with its reason, never a nearest; CONCEPT ELEMENTS ONLY — an element on a type a DD rule produces is settled,
// one on another office type (floors, roofs, ceilings: the type name; doors, windows: the family name) is left as is and
// not counted, structure is held whole. So a second run proposes nothing a first run applied.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class ElementFact
    {
        /// <summary>MA-3d: the element's IFC GlobalId (ExportUtils.GetExportId, as the IFC export and the BCF viewpoints name it); null when Revit gave none.</summary>
        public string IfcGuid;
        /// <summary>"floor" | "roof" | "ceiling" | "door" | "window" (a key of PromoteWallsPlanner.Classes).</summary>
        public string Kind, UniqueId, Label, Family, TypeName, Level, Stamp;
        /// <summary>Floors, roofs, ceilings: the type's build-up (mm); null = none (a Basic Ceiling, sloped glazing).</summary>
        public double? ThicknessMm;
        /// <summary>Doors, windows: the TYPE's Width and Height (mm); null = not a type parameter (an instance-sized family).</summary>
        public double? WidthMm, HeightMm;
        /// <summary>Floors: the type's Function ("Interior"/"Exterior"), null when it has none.</summary>
        public string Function;
        /// <summary>Doors, windows: the host wall's type (null = not hosted by a wall), its type's Function, its base level.</summary>
        public string HostTypeName, HostFunction, HostLevel;
        public bool HostBasic;
        /// <summary>Doors, windows: the category of a host that is not a wall ("Roofs" for a skylight); null otherwise.</summary>
        public string HostCategory;
        /// <summary>Why Sentinel cannot retype it ("an in-place family", "a nested shared component"), or null.</summary>
        public string NotEditable;
        public bool InGroup, InOption, Structural;
    }

    /// <summary>lod_matrix@n as Promote reads it: per class (Revit category, as guideline@n), what DD means; since MA-2b also the
    /// stage map (D18) and each row's snap (D16). The C# twin of sentinel-core's parseLodMatrix (lod-matrix.ts): it accepts and
    /// refuses the same bodies in the same words — tools/promote-check and vitest read WebApp/bridge/fixtures/lod-matrix/cases.json.
    /// A row that asks for something Promote does not check is not run (GN-4), so the LOD state never reads higher than what was
    /// checked. properties are what the stage IDS (the bridge's matrixToIds) and the LOD state ask of an element.</summary>
    public sealed class LodMatrix
    {
        public static readonly string[] Order = { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows" };
        /// <summary>Exactly what Promote v1 checks per class, as a row's DD reads once sorted (<see cref="Dd"/>).</summary>
        public static readonly IReadOnlyDictionary<string, string> V1 = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Walls"] = "level=story_level; top=next_story_level; type=guideline_rule",
            ["Floors"] = "level=story_level; type=guideline_rule", ["Roofs"] = "level=story_level; type=guideline_rule",
            ["Ceilings"] = "level=story_level; type=guideline_rule",
            ["Doors"] = "host=wall; level=story_level; type=guideline_rule", ["Windows"] = "host=wall; level=story_level; type=guideline_rule",
        };

        /// <summary>Sentinel's project stages, in order (sentinel-core STAGES; GATE_DEFS is keyed by them).</summary>
        public static readonly string[] Stages = { "tender", "design", "coord", "constr", "hand", "oper" };
        /// <summary>The matrix's design stages, in order.</summary>
        public static readonly string[] MatrixStages = { "concept", "SD", "DD", "CD" };
        /// <summary>D18: concept, SD and DD → design; CD → coord.</summary>
        public static readonly IReadOnlyDictionary<string, string> DefaultStageMap = new Dictionary<string, string>(StringComparer.Ordinal)
        { ["concept"] = "design", ["SD"] = "design", ["DD"] = "design", ["CD"] = "coord" };
        /// <summary>A snap is measurement noise or a near size, never another type.</summary>
        public const int MaxSnapMm = 50;
        private static readonly Dictionary<string, string> DdRules = new Dictionary<string, string>(StringComparer.Ordinal)
        { ["type"] = "guideline_rule", ["level"] = "story_level", ["top"] = "next_story_level", ["host"] = "wall" };

        public bool Draft;
        /// <summary>Category → its DD rules (no properties, no snap), as one sorted string "host=wall; level=story_level; type=guideline_rule".</summary>
        public Dictionary<string, string> Dd = new Dictionary<string, string>(StringComparer.Ordinal);
        public Dictionary<string, List<string>> Properties = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        /// <summary>MA-2b: every matrix stage → its project stage (the body's stage_map over <see cref="DefaultStageMap"/>).</summary>
        public Dictionary<string, string> StageMap = new Dictionary<string, string>(StringComparer.Ordinal);
        /// <summary>MA-2b: category → its DD row's type_snap_mm (0 = the exact match, D16).</summary>
        public Dictionary<string, int> SnapMm = new Dictionary<string, int>(StringComparer.Ordinal);

        /// <summary>The raw lod_matrix@n body → the matrix, or null with <paramref name="error"/> in parseLodMatrix's words
        /// ("rows[1].DD.type_snap_mm must be …"). Never throws; never a partial matrix.</summary>
        public static LodMatrix FromBody(string json, out string error)
        {
            error = null;
            try
            {
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    var b = d.RootElement;
                    if (b.ValueKind != JsonValueKind.Object) throw Bad("the body", "must be a JSON object");
                    foreach (var p in JsOrder(b))
                        if (Array.IndexOf(new[] { "standard_key", "semver", "status", "stage_map", "rows" }, p.Name) < 0)
                            throw Bad(p.Name, "is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}");
                    if (!(b.TryGetProperty("standard_key", out var sk) && Filled(sk))) throw Bad("standard_key", "must be a non-empty string");
                    // [0-9] and \z: .NET's \d takes any Unicode digit and its $ a final newline; JS's /^\d+\.\d+\.\d+$/ takes neither.
                    if (!(b.TryGetProperty("semver", out var sv) && sv.ValueKind == JsonValueKind.String && Regex.IsMatch(sv.GetString(), @"^[0-9]+\.[0-9]+\.[0-9]+\z")))
                        throw Bad("semver", "must be x.y.z");
                    if (Present(b, "status", out var st) && !(st.ValueKind == JsonValueKind.String && (st.GetString() == "draft" || st.GetString() == "approved")))
                        throw Bad("status", "must be draft or approved");
                    var mx = new LodMatrix
                    {
                        Draft = Present(b, "status", out st) && st.GetString() == "draft",
                        StageMap = DefaultStageMap.ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal),
                    };

                    if (Present(b, "stage_map", out var sm))
                    {
                        if (sm.ValueKind != JsonValueKind.Object) throw Bad("stage_map", "must be an object of matrix stage: project stage");
                        foreach (var kv in JsOrder(sm))
                        {
                            if (Array.IndexOf(MatrixStages, kv.Name) < 0) throw Bad("stage_map." + kv.Name, "is not a matrix stage — " + string.Join(", ", MatrixStages));
                            if (kv.Value.ValueKind != JsonValueKind.String || Array.IndexOf(Stages, kv.Value.GetString()) < 0)
                                throw Bad("stage_map." + kv.Name, "must be " + string.Join(" | ", Stages));
                            mx.StageMap[kv.Name] = kv.Value.GetString();
                        }
                        for (int s = 1; s < MatrixStages.Length; s++)
                        {
                            string prev = MatrixStages[s - 1], k = MatrixStages[s];
                            if (Array.IndexOf(Stages, mx.StageMap[k]) < Array.IndexOf(Stages, mx.StageMap[prev]))
                                throw Bad("stage_map." + k, $"maps to {mx.StageMap[k]}, before {prev}'s {mx.StageMap[prev]} — a later matrix stage never maps to an earlier project stage");
                        }
                    }

                    if (!(b.TryGetProperty("rows", out var rows) && rows.ValueKind == JsonValueKind.Array && rows.GetArrayLength() > 0))
                        throw Bad("rows", "must be a non-empty array");
                    int i = 0;
                    foreach (var r in rows.EnumerateArray())
                    {
                        string at = "rows[" + i++ + "]";
                        if (r.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                        foreach (var p in JsOrder(r))
                            if (p.Name != "category" && p.Name != "DD")
                                throw Bad(at + "." + p.Name, "is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)");
                        string cat = r.TryGetProperty("category", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
                        if (cat == null || Array.IndexOf(Order, cat) < 0) throw Bad(at + ".category", "must be " + string.Join(" | ", Order));
                        if (mx.Dd.ContainsKey(cat)) throw Bad(at + ".category", "appears twice — one row per class");
                        if (!r.TryGetProperty("DD", out var dd) || dd.ValueKind != JsonValueKind.Object) throw Bad(at + ".DD", "must be an object");
                        var keys = new List<string>();
                        var props = new List<string>();
                        int snap = 0;
                        foreach (var kv in JsOrder(dd))
                        {
                            if (kv.Name == "properties")
                            {
                                if (kv.Value.ValueKind != JsonValueKind.Array || kv.Value.EnumerateArray().Any(x => !Filled(x)))
                                    throw Bad(at + ".DD.properties", "must be an array of non-empty strings");
                                props.AddRange(kv.Value.EnumerateArray().Select(x => x.GetString()));
                            }
                            else if (kv.Name == "type_snap_mm")
                            {
                                if (!(kv.Value.ValueKind == JsonValueKind.Number && kv.Value.TryGetDouble(out var v) && v == Math.Floor(v) && v >= 0 && v <= MaxSnapMm))
                                    throw Bad(at + ".DD.type_snap_mm", $"must be a whole number of millimetres, 0 to {MaxSnapMm} (D16: 0 keeps the exact match)");
                                snap = (int)kv.Value.GetDouble();
                                if (snap > 0 && (cat == "Doors" || cat == "Windows"))
                                    throw Bad(at + ".DD.type_snap_mm", $"must be 0 for {cat} — a door or window is matched by its type name's W x H, never snapped");
                            }
                            else if (!DdRules.TryGetValue(kv.Name, out var want))
                                throw Bad(at + ".DD." + kv.Name, "is not a DD rule Promote reads — " + string.Join(", ", DdRules.Keys.Concat(new[] { "properties", "type_snap_mm" })));
                            else if (kv.Value.ValueKind != JsonValueKind.String || kv.Value.GetString() != want)
                                throw Bad(at + ".DD." + kv.Name, "must be " + want);
                            else keys.Add(kv.Name + "=" + want);
                        }
                        if (!keys.Any(k => k.StartsWith("type=", StringComparison.Ordinal))) throw Bad(at + ".DD.type", "is required — DD means typed by a guideline rule");
                        keys.Sort(StringComparer.Ordinal);
                        mx.Dd[cat] = string.Join("; ", keys);
                        mx.Properties[cat] = props;
                        mx.SnapMm[cat] = snap;
                    }
                    return mx;
                }
            }
            catch (Exception ex) { error = ex.Message; return null; }
        }

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException(path + " " + want);
        // Optional = absent or null, as the bridge reads it.
        private static bool Present(JsonElement o, string name, out JsonElement v) => o.TryGetProperty(name, out v) && v.ValueKind != JsonValueKind.Null;
        // Blank as the bridge's filled() reads it — JS's /[^\s\u0085]/: JS's \s includes U+FEFF and leaves out U+0085, char.IsWhiteSpace
        // the reverse, so U+FEFF is named here, as an escape (a raw byte-order mark is lost by any tool that strips one).
        private static bool Filled(JsonElement v) => v.ValueKind == JsonValueKind.String && v.GetString().Any(ch => !char.IsWhiteSpace(ch) && ch != '\uFEFF');
        // An object's members in JS's Object.keys order — integer-like names first, ascending, then the rest as written — so the
        // first stray key named is the one the TS reader names.
        private static IEnumerable<JsonProperty> JsOrder(JsonElement o)
        {
            // A name given twice keeps its last value in its first place, as JSON.parse does (TryGetProperty also reads the last).
            var all = o.EnumerateObject().GroupBy(p => p.Name, StringComparer.Ordinal).Select(g => g.Last()).ToList();
            bool Index(string k) => uint.TryParse(k, NumberStyles.None, CultureInfo.InvariantCulture, out var n) && n < uint.MaxValue && n.ToString(CultureInfo.InvariantCulture) == k;
            return all.Where(p => Index(p.Name)).OrderBy(p => uint.Parse(p.Name, CultureInfo.InvariantCulture)).Concat(all.Where(p => !Index(p.Name)));
        }

        /// <summary>The classes Promote runs, in <see cref="Order"/>; each class left out gets its reason in <paramref name="notRun"/>.
        /// No matrix → walls only, exactly MA-0 (GN-3).</summary>
        public static List<string> Classes(LodMatrix mx, string label, GuidelineMatcher m, List<string> notRun)
        {
            if (mx == null)
            {
                notRun.Add($"LOD matrix: {label} — walls only (MA-0 rules)");
                return new List<string> { "Walls" };
            }
            var run = new List<string>();
            foreach (var cat in Order)
            {
                if (!mx.Dd.TryGetValue(cat, out var dd)) notRun.Add($"{cat}: no DD row in the LOD matrix");
                else if (dd != V1[cat]) notRun.Add($"{cat}: the matrix's DD is \"{dd}\"; Promote v1 checks exactly \"{V1[cat]}\"");
                else if (!m.HasRulesFor(cat)) notRun.Add($"{cat}: {m.Standard} has no {cat} rules");
                else run.Add(cat);
            }
            return run;
        }
    }

    /// <summary>One class on one storey. Total = the DD-now denominator (every element but the OfficeTyped ones); DdNow =
    /// settled (doors, windows: and hosted by a wall); Stamped = last written by a Promote changeset (office-typed included).</summary>
    public sealed class ClassCount { public int Total, DdNow, OfficeTyped, Stamped; }

    public static class PromotePlanner
    {
        /// <summary>A target's build-up within this of the element's thickness counts as equal (Revit stores feet).</summary>
        private const double TolMm = 0.5;

        /// <param name="classes">The guideline categories that run (Walls, Floors, Roofs, Ceilings, Doors, Windows).</param>
        /// <param name="docBasicWallTypes">As PromoteWallsPlanner.Plan: the document's basic wall types → their Function.</param>
        /// <param name="docTypes">Category → the document's types of it ("Family : Type" for doors and windows, the type name
        /// otherwise; case-insensitive) → build-up mm (null for a loadable family or none). Never across categories.</param>
        public static List<StoreyPlan> Plan(IReadOnlyCollection<string> classes, IReadOnlyList<WallFact> walls, IReadOnlyList<ElementFact> others,
            IReadOnlyList<LevelFact> levels, IReadOnlyDictionary<string, string> docBasicWallTypes,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m)
        {
            // The walls are planned even when Walls do not run: a door's location reads its host storey's one-type verdict.
            var wallPlans = PromoteWallsPlanner.Plan(walls ?? new List<WallFact>(), levels, docBasicWallTypes, m);
            var oneType = new HashSet<string>(wallPlans.Where(p => p.OneType).Select(p => p.Storey), StringComparer.Ordinal);
            var plans = classes.Contains("Walls") ? wallPlans : new List<StoreyPlan>();

            var byName = new Dictionary<string, LevelFact>(StringComparer.Ordinal);
            foreach (var l in levels) if (l?.Name != null && !byName.ContainsKey(l.Name)) byName[l.Name] = l;
            string office = string.IsNullOrWhiteSpace(m.Office) ? null : m.Office.Trim() + "_";

            foreach (var e in others ?? new List<ElementFact>())
            {
                if (e?.Kind == null || e.Kind == "wall" || !PromoteWallsPlanner.Classes.TryGetValue(e.Kind, out var cls) || !classes.Contains(cls.Category)) continue;
                string storey = e.Level ?? "";
                var p = plans.FirstOrDefault(x => x.Storey == storey);
                if (p == null) plans.Add(p = new StoreyPlan { Storey = storey });
                if (!p.Others.TryGetValue(cls.Category, out var c)) p.Others[cls.Category] = c = new ClassCount();
                c.Total++;
                if (ProvenanceStamp.SourceOf(e.Stamp) == "promote") c.Stamped++;
                byName.TryGetValue(storey, out var level);
                int ddWas = c.DdNow, officeWas = c.OfficeTyped;
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, out var g, out var blocked, out var gap);
                // MA-2b: the element's DD verdict for the LOD state — the same counters "DD now" reads; an office-typed one is not counted.
                if (c.OfficeTyped == officeWas) p.Lod.Add(new LodFact { UniqueId = e.UniqueId, Category = cls.Category, RulesOk = c.DdNow > ddWas, Blocked = blocked });
                // MA-2c: an element that stays on its DD type (no reason, no ghost, not office-typed) — its type's properties are read.
                if (reason == null && g == null && c.OfficeTyped == officeWas)
                    p.Settled.Add((cls.Category, e.Kind == "door" || e.Kind == "window" ? e.Family : null, e.TypeName));
                if (reason != null) p.Held.Add(new PromoteHeld { UniqueId = e.UniqueId, Label = e.Label, Reason = reason, Gap = gap });
                else if (g != null) p.Ghosts.Add(g); // after the walls' ghosts; Bodies puts every retype before the attaches
            }

            double Elev(string level) => level != null && byName.TryGetValue(level, out var l) ? l.ElevationMm : double.MaxValue;
            return plans.OrderBy(p => Elev(p.Storey)).ThenBy(p => p.Storey, StringComparer.Ordinal).ToList();
        }

        /// <summary>The command's preflight: a retype ghost <paramref name="why"/> refuses (non-null) becomes a held row with that reason.</summary>
        public static void Refuse(IEnumerable<StoreyPlan> plans, Func<PromoteGhost, string> why)
        {
            foreach (var p in plans)
                foreach (var g in p.Ghosts.Where(x => x.Op == "retype").ToList())
                {
                    var r = why(g);
                    if (r == null) continue;
                    p.Ghosts.Remove(g);
                    p.Held.Add(new PromoteHeld { UniqueId = g.UniqueId, Label = g.Label, Reason = r });
                }
        }

        // One element through the plan's checks, in order: the reason a person decides, or null — with a ghost, or with none
        // (settled, counted in DD now; office-typed, taken out of the denominator). MA-2c: a type gap's facts in gap.
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, out PromoteGhost g,
            out bool blocked, out TypeGap gap)
        {
            g = null;
            gap = null;
            bool family = e.Kind == "door" || e.Kind == "window";
            // MA-2b: these holds are BLOCKED in the LOD state — Promote cannot act on them.
            blocked = true;
            if (e.NotEditable != null) return $"{e.NotEditable} — Sentinel does not retype it; a person decides";
            if (e.InGroup) return "in a group — Sentinel does not edit group members";
            if (e.InOption) return "in a design option — Sentinel does not edit design options";
            if (level == null || !level.IsStory) return $"level {e.Level} is not a Building Story — Promote plans storey by storey";
            blocked = false;

            // Settled, by family and type for doors and windows (window type names repeat across families) — never re-measured.
            if (family ? m.RuleProduces(cat, e.TypeName, e.Family) : m.RuleProduces(cat, e.TypeName))
            {
                if (!family || e.HostTypeName != null) c.DdNow++;
                return null;
            }
            if (office != null && ((family ? e.Family : e.TypeName) ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase))
            {
                c.OfficeTyped++; c.Total--;
                return null;
            }
            if (e.Kind == "floor" && e.Structural) { blocked = true; return "structural floor — Promote v1 does not retype structure; a person decides"; }
            return family ? Swap(e, cat, oneType, office, docTypes, m, out g, out gap) : Retype(e, cat, word, docTypes, m, out g, out gap);
        }

        // Floors, roofs, ceilings: the DD rule's type at this element's thickness, loaded here with that same build-up.
        private static string Retype(ElementFact e, string cat, string word,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g, out TypeGap gap)
        {
            g = null;
            gap = null;
            var t = e.ThicknessMm;
            if (t.HasValue && !Whole(t.Value)) return $"thickness {Mm(t.Value, "0.###")} mm is not a whole millimetre — exact match only (D16)";
            if (!m.HasCatalog) return NoCatalog(m);
            var ps = new Dictionary<string, string>();
            if (e.Function != null) ps["Function"] = e.Function;
            ps["Family"] = e.Family ?? "";
            string what = What(ps), size = t.HasValue ? ", " + Mm(t.Value, "0") + " mm" : "";
            var res = m.Resolve(new GuidelineInput { Category = cat, Params = ps, ThicknessMm = t });
            if (res.Source != "rule") return $"no DD rule for {what} in {m.Standard}";
            if (string.IsNullOrWhiteSpace(res.Type)) return "no build-up thickness to fill the DD rule's type — a person decides";
            if (res.Confidence != 1)
            {
                gap = new TypeGap { Category = cat, Want = res.Type, Size = t.HasValue ? Mm(t.Value, "0") + " mm" : null, Key = what, Nearest = res.Available ?? new List<string>() };
                return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            }
            IReadOnlyDictionary<string, double?> types = null;
            if (docTypes == null || !docTypes.TryGetValue(cat, out types) || types == null || !types.TryGetValue(res.Type, out var build))
                return $"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            // The harvest never recorded a floor's build-up: the name alone is unverified, and a retype must never move a face.
            if (t.HasValue && !(build.HasValue && Math.Abs(build.Value - t.Value) <= TolMm))
                return $"\"{res.Type}\" {(build.HasValue ? "is " + Mm(build.Value, "0.#") + " mm thick" : "has no build-up")} in this model, " +
                       $"the {word} is {Mm(t.Value, "0")} mm — a retype would move a face; a person decides";
            g = new PromoteGhost
            {
                Op = "retype", IfcGuid = e.IfcGuid, Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.TypeName, TypeName = res.Type,
                Reason = $"DD {cat.ToLowerInvariant()}: {what}{size} → {res.Type}",
            };
            return null;
        }

        // Doors, windows: the office family type of exactly this size (a door: and this location), loaded here; the host is kept.
        private static string Swap(ElementFact e, string cat, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g, out TypeGap gap)
        {
            g = null;
            gap = null;
            if (e.HostTypeName == null)
                return e.HostCategory == null ? "not hosted by a wall — rehosting is MA-5"
                    : $"its host is not a wall ({e.HostCategory}) — Promote v1 swaps wall-hosted {cat.ToLowerInvariant()} only; a person decides";
            if (!e.HostBasic) return $"host {e.HostTypeName} is not a basic wall — a person decides";

            // A door's location: a settled host's DD rule, not the template's Function (drill B33 F2); an office host no rule
            // produces, or a one-type storey, cannot tell inside from outside.
            string loc = null, tail = "";
            if (e.Kind == "door")
            {
                if (m.RuleProduces("Walls", e.HostTypeName))
                {
                    // MA-2a: a host settled by a layer-free rule names its Location (Exterior/Interior, the same words) — each producing
                    // rule's Function, else its Location (review C6: the gypsum type is produced by one rule of each).
                    loc = m.RuleLocation("Walls", e.HostTypeName);
                    if (loc == null) return $"host {e.HostTypeName}: its DD rules do not name one Function or Location — a person decides";
                    if (!string.Equals(loc, e.HostFunction, StringComparison.OrdinalIgnoreCase)) tail = $" (host {e.HostTypeName}: its DD rule says {loc})";
                }
                else if (office != null && e.HostTypeName.StartsWith(office, StringComparison.OrdinalIgnoreCase))
                    return $"host {e.HostTypeName} is an office type no DD wall rule produces — inside cannot be told from outside; a person decides";
                else if (e.HostLevel != null && oneType.Contains(e.HostLevel))
                    return $"every wall on {e.HostLevel} is one type — inside cannot be told from outside; a person decides";
                else loc = e.HostFunction ?? "";
            }

            if (!e.WidthMm.HasValue || !e.HeightMm.HasValue) return "width or height is not a type parameter — an instance-sized family; a person decides";
            double w = e.WidthMm.Value, h = e.HeightMm.Value;
            if (!Whole(w) || !Whole(h)) return $"size {Mm(w, "0.###")} x {Mm(h, "0.###")} mm is not a whole millimetre — exact match only (D16)";
            if (TypeNameParse.TrySection(e.TypeName, out var nw, out var nh) && !(Same(nw, w) && Same(nh, h)))
                return $"its type name says {Mm(nw, "0.###")} x {Mm(nh, "0.###")} mm, its Width x Height is {Mm(w, "0")} x {Mm(h, "0")} mm — a person decides";
            if (!m.HasCatalog) return NoCatalog(m);

            var ps = new Dictionary<string, string>();
            if (loc != null) ps["HostFunction"] = loc;
            ps["Size"] = $"W{Mm(w, "0")} x H{Mm(h, "0")} mm";
            string what = What(ps);
            var res = m.Resolve(new GuidelineInput { Category = cat, Params = ps });
            if (res.Source != "rule")
            {
                // The catalogue by type NAME (a door's own Width is its leaf, DR-1); a window type whose own Width x Height
                // contradict its name is a template fault, not a choice (WN-3).
                var faults = e.Kind == "window" ? new List<string>() : null;
                var have = m.CatalogOfSize(cat, w, h, faults);
                string size = $"{Mm(w, "0")} x {Mm(h, "0")} mm";
                if (have.Count > 0)
                    return $"no DD rule for {what} in {m.Standard} — the catalogue has {string.Join(", ", have)}" +
                           (have.Count > 1 ? "; which one is office policy" : ", but no DD rule names it (office policy)");
                if (faults?.Count > 0)
                    return $"the catalogue's {string.Join(", ", faults)} (named at {size}) read another Width x Height in the template — a template fault (WN-3); a person decides";
                gap = new TypeGap { Category = cat, Size = size, Key = what };
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", $"no {cat} type named at {size} in the catalogue");
            }
            if (string.IsNullOrWhiteSpace(res.Type)) return "the DD rule names no type — a person decides";
            if (res.Confidence != 1)
            {
                gap = new TypeGap { Category = cat, Want = res.Type, Size = $"{Mm(w, "0")} x {Mm(h, "0")} mm", Key = what, Nearest = res.Available ?? new List<string>() };
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", res.Why);
            }
            string target = res.Family + " : " + res.Type;
            if (!(TypeNameParse.TrySection(res.Type, out var rw, out var rh) && Same(rw, w) && Same(rh, h)))
                return $"the DD rule gives {target} for {ps["Size"]} — the rule and the type name disagree; a person decides";
            if (!m.CatalogHas(cat, res.Family, res.Type))
                return $"\"{target}\" is not one family and type in the catalogue ({m.CatalogLabel}) — a person decides";
            if (docTypes == null || !docTypes.TryGetValue(cat, out var types) || types == null || !types.ContainsKey(target))
                return $"\"{target}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            g = new PromoteGhost
            {
                Op = "retype", IfcGuid = e.IfcGuid, Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.Family + " : " + e.TypeName,
                TypeName = res.Type, FamilyName = res.Family, Reason = $"DD {cat.ToLowerInvariant()}: {what} → {target}{tail}" + (e.Kind == "door" ? DoorSize : ""),
            };
            return null;
        }

        // DR-1 (confirmed by the founder 2026-10-01): a door is sized by the target's type NAME, so after the swap its Width x
        // Height read the new family's own (for BDS, the leaf). The reason says so on every door swap row.
        private const string DoorSize = "; sized by its type name (DR-1): after the swap the door's Width x Height read the new family's own";

        private static string NoCatalog(GuidelineMatcher m) => $"no type catalogue installed ({m.CatalogLabel}) — the exact DD type cannot be checked (D16)";
        private static string What(Dictionary<string, string> ps) => string.Join(", ", ps.Select(kv => kv.Key + " " + kv.Value));
        private static bool Whole(double v) => Math.Abs(v - Math.Round(v)) <= 0.001;
        private static bool Same(double a, double b) => Math.Abs(a - b) <= 0.001;
        private static string Mm(double v, string format) => v.ToString(format, CultureInfo.InvariantCulture);
    }
}
