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
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class ElementFact
    {
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

    /// <summary>lod_matrix@n v0 as Promote v1 reads it: per class (Revit category, as guideline@n), what DD means. The bridge
    /// refused any key Promote does not read at install; a row that still asks for something else is not run (GN-4), so
    /// "DD now" never reads higher than what was checked. properties are listed for a person, never enforced.</summary>
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

        public bool Draft;
        /// <summary>Category → its DD row without properties, as one sorted string "host=wall; level=story_level; type=guideline_rule".</summary>
        public Dictionary<string, string> Dd = new Dictionary<string, string>(StringComparer.Ordinal);
        public Dictionary<string, List<string>> Properties = new Dictionary<string, List<string>>(StringComparer.Ordinal);

        /// <summary>The raw lod_matrix@n body → the matrix, or null with <paramref name="error"/> naming the field. Never throws.</summary>
        public static LodMatrix FromBody(string json, out string error)
        {
            error = null;
            try
            {
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    var b = d.RootElement;
                    if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                    if (!b.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) throw new InvalidDataException("rows must be an array");
                    var mx = new LodMatrix
                    {
                        Draft = b.TryGetProperty("status", out var st) && st.ValueKind == JsonValueKind.String
                                && string.Equals(st.GetString(), "draft", StringComparison.OrdinalIgnoreCase),
                    };
                    int i = 0;
                    foreach (var r in rows.EnumerateArray())
                    {
                        string at = "rows[" + i++ + "]";
                        if (r.ValueKind != JsonValueKind.Object) throw new InvalidDataException(at + " must be an object");
                        if (!r.TryGetProperty("category", out var c) || c.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(c.GetString()))
                            throw new InvalidDataException(at + ".category must be a non-empty string");
                        if (!r.TryGetProperty("DD", out var dd) || dd.ValueKind != JsonValueKind.Object) throw new InvalidDataException(at + ".DD must be an object");
                        var keys = new List<string>();
                        var props = new List<string>();
                        foreach (var kv in dd.EnumerateObject())
                        {
                            if (kv.Name == "properties")
                            {
                                if (kv.Value.ValueKind != JsonValueKind.Array || kv.Value.EnumerateArray().Any(x => x.ValueKind != JsonValueKind.String))
                                    throw new InvalidDataException(at + ".DD.properties must be an array of strings");
                                props.AddRange(kv.Value.EnumerateArray().Select(x => x.GetString()));
                            }
                            else if (kv.Value.ValueKind != JsonValueKind.String) throw new InvalidDataException(at + ".DD." + kv.Name + " must be a string");
                            else keys.Add(kv.Name + "=" + kv.Value.GetString());
                        }
                        keys.Sort(StringComparer.Ordinal);
                        mx.Dd[c.GetString()] = string.Join("; ", keys);
                        mx.Properties[c.GetString()] = props;
                    }
                    return mx;
                }
            }
            catch (Exception ex) { error = ex.Message; return null; }
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
                var reason = Plan1(e, cls.Category, cls.Word.ToLowerInvariant(), level, oneType, office, docTypes, m, c, out var g);
                if (reason != null) p.Held.Add(new PromoteHeld { UniqueId = e.UniqueId, Label = e.Label, Reason = reason });
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
        // (settled, counted in DD now; office-typed, taken out of the denominator).
        private static string Plan1(ElementFact e, string cat, string word, LevelFact level, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, ClassCount c, out PromoteGhost g)
        {
            g = null;
            bool family = e.Kind == "door" || e.Kind == "window";
            if (e.NotEditable != null) return $"{e.NotEditable} — Sentinel does not retype it; a person decides";
            if (e.InGroup) return "in a group — Sentinel does not edit group members";
            if (e.InOption) return "in a design option — Sentinel does not edit design options";
            if (level == null || !level.IsStory) return $"level {e.Level} is not a Building Story — Promote plans storey by storey";

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
            if (e.Kind == "floor" && e.Structural) return "structural floor — Promote v1 does not retype structure; a person decides";
            return family ? Swap(e, cat, oneType, office, docTypes, m, out g) : Retype(e, cat, word, docTypes, m, out g);
        }

        // Floors, roofs, ceilings: the DD rule's type at this element's thickness, loaded here with that same build-up.
        private static string Retype(ElementFact e, string cat, string word,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g)
        {
            g = null;
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
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.TypeName}, {what}{size})", res.Why);
            IReadOnlyDictionary<string, double?> types = null;
            if (docTypes == null || !docTypes.TryGetValue(cat, out types) || types == null || !types.TryGetValue(res.Type, out var build))
                return $"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            // The harvest never recorded a floor's build-up: the name alone is unverified, and a retype must never move a face.
            if (t.HasValue && !(build.HasValue && Math.Abs(build.Value - t.Value) <= TolMm))
                return $"\"{res.Type}\" {(build.HasValue ? "is " + Mm(build.Value, "0.#") + " mm thick" : "has no build-up")} in this model, " +
                       $"the {word} is {Mm(t.Value, "0")} mm — a retype would move a face; a person decides";
            g = new PromoteGhost
            {
                Op = "retype", Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.TypeName, TypeName = res.Type,
                Reason = $"DD {cat.ToLowerInvariant()}: {what}{size} → {res.Type}",
            };
            return null;
        }

        // Doors, windows: the office family type of exactly this size (a door: and this location), loaded here; the host is kept.
        private static string Swap(ElementFact e, string cat, ISet<string> oneType, string office,
            IReadOnlyDictionary<string, IReadOnlyDictionary<string, double?>> docTypes, GuidelineMatcher m, out PromoteGhost g)
        {
            g = null;
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
                    loc = m.RuleParam("Walls", e.HostTypeName, "Function");
                    if (loc == null) return $"host {e.HostTypeName}: its DD rules do not name one Function — a person decides";
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
                return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", $"no {cat} type named at {size} in the catalogue");
            }
            if (string.IsNullOrWhiteSpace(res.Type)) return "the DD rule names no type — a person decides";
            if (res.Confidence != 1) return m.Gap($"{e.Label} ({e.Family} : {e.TypeName})", res.Why);
            string target = res.Family + " : " + res.Type;
            if (!(TypeNameParse.TrySection(res.Type, out var rw, out var rh) && Same(rw, w) && Same(rh, h)))
                return $"the DD rule gives {target} for {ps["Size"]} — the rule and the type name disagree; a person decides";
            if (!m.CatalogHas(cat, res.Family, res.Type))
                return $"\"{target}\" is not one family and type in the catalogue ({m.CatalogLabel}) — a person decides";
            if (docTypes == null || !docTypes.TryGetValue(cat, out var types) || types == null || !types.ContainsKey(target))
                return $"\"{target}\" is in the catalogue but not loaded in this model — Sentinel creates no types";
            g = new PromoteGhost
            {
                Op = "retype", Kind = e.Kind, UniqueId = e.UniqueId, Label = e.Label, TypeBefore = e.Family + " : " + e.TypeName,
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
