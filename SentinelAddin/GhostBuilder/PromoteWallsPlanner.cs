#nullable disable
// MA-0 Promote walls v0 — the pure planner. Facts read from the pinned document go in; per storey (a wall's base
// level) come out the ghosts to file (retype to the exact catalogue type, attach the top to the next story) and the
// walls sent to a person, each with its reason. No Revit types, so tools/promote-check drives it offline (the
// MassingPlanner / ViewPlanner pattern). Commands.PromoteWalls reads the facts and files one changeset per storey.
//
// EXACT OR A PERSON (D16). A type is proposed only when the DD rule answers at confidence 1 AND that type is already
// loaded in this model: Sentinel creates no types. Anything else — a gap, no rule, a width that is not a whole mm, a
// storey whose walls all share one type — is held with its reason, never guessed.
//
// CONCEPT WALLS ONLY (drill F1/F2). A wall already on a type the DD rules produce is settled (only its top is judged); a
// wall on any other type of the guideline's office ("BDS_…") is left as is, unheld and uncounted; a structural wall
// is held whole. So a second run proposes nothing a first run applied, whatever Function the template gave the type.
//
// Promote v1 (PromotePlanner) merges floors, roofs, ceilings, doors and windows into these storey plans; the shared types
// below grow fields for them with defaults, so the walls' plan and body are what MA-0 wrote.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class WallFact
    {
        public string UniqueId, Label, TypeName, Function, BaseLevel;
        /// <summary>Null = unconnected height.</summary>
        public string TopLevel;
        /// <summary>The provenance stamp JSON (ProvenanceStamp.Read), or null.</summary>
        public string Stamp;
        public double WidthMm, BaseOffsetMm, TopOffsetMm;
        /// <summary>Unconnected Height (WALL_USER_HEIGHT_PARAM); read only when TopLevel is null.</summary>
        public double HeightMm;
        public bool IsBasic, InGroup, InOption;
        /// <summary>The wall's Structural usage (WALL_STRUCTURAL_SIGNIFICANT = 1).</summary>
        public bool Structural;
        /// <summary>MA-2a: the wall's location line in plan (mm) as the outer boundary reads it — a curved wall's chord, flagged;
        /// null when none was read (the wall is then no barrier and its location is unknown).</summary>
        public WallLocation.Segment Line;
        /// <summary>MA-2a: the type's compound-layer materials, finish layers first, joined " / " ("Stone / Concrete Masonry
        /// Units"); null when the type has none. Passed to the rules as the param Material.</summary>
        public string Material;
    }

    public sealed class LevelFact
    {
        public string Name;
        public double ElevationMm;
        public bool IsStory;
    }

    public sealed class PromoteGhost
    {
        /// <summary>"retype" or "attach".</summary>
        public string Op, UniqueId, Label, TypeBefore, TypeName, BaseLevel, TopLevel, Reason;
        /// <summary>A key of PromoteWallsPlanner.Classes; null = wall. FamilyName: a door or window retype's target family.</summary>
        public string Kind, FamilyName;
        /// <summary>A retype whose target's Function in this model disagrees with the wall's side as the rule decided it (the
        /// Location it matched; else, on a mixed storey, the wall's Function): "&lt;target&gt; is Function &lt;X&gt; in this
        /// model" (also the Reason's tail) — the office's template to fix. Null otherwise; never posted.</summary>
        public string Note;
        /// <summary>MA-2c, a "set_parameter" (PropertyPlanner): the DD property ("Pset_WallCommon.FireRating"), the Revit parameter
        /// that holds it on the TYPE, the value the plan read there (From, "" when empty: the executor's stale guard), the value to
        /// write (To) and its source's kind ("catalogue" | "clause"). UniqueId is the TYPE's; TypeName and FamilyName name it.</summary>
        public string Parameter, RevitParameter, From, To, SourceKind;
    }

    public sealed class PromoteHeld
    {
        public string UniqueId, Label, Reason;
    }

    public sealed class StoreyPlan
    {
        public string Storey;
        /// <summary>Walls = the DD-now denominator: every wall based on the storey except the OfficeTyped ones (concept
        /// walls, held included, plus settled walls). DdNow = those whose type AND top are DD. OfficeTyped = walls on
        /// another type of the guideline's office, left as is. Stamped = walls whose provenance stamp was last written by
        /// a Promote changeset.</summary>
        public int Walls, DdNow, OfficeTyped, Stamped;
        /// <summary>Every basic, ungrouped wall on the storey, office types aside, shares one type (the one-type hold; a
        /// door's location cannot be read from such a storey either).</summary>
        public bool OneType;
        /// <summary>Promote v1's other classes on this storey: guideline category → counts.</summary>
        public Dictionary<string, ClassCount> Others = new Dictionary<string, ClassCount>(StringComparer.Ordinal);
        public List<PromoteGhost> Ghosts = new List<PromoteGhost>();
        public List<PromoteHeld> Held = new List<PromoteHeld>();
        /// <summary>MA-2b: every counted element's DD verdict (the "DD now" denominator, element by element) — what the LOD state
        /// reader (LodState.Read) counts, so the two never drift.</summary>
        public List<LodFact> Lod = new List<LodFact>();
        /// <summary>MA-2c: the DD type each counted element already stands on (settled: a wall whose type is DD, a floor, roof,
        /// ceiling, door or window on a type a DD rule produces), one entry per element — with the retype targets, the types whose
        /// DD properties PropertyPlanner reads. Family: a door's or window's; null for a system type.</summary>
        public List<(string Category, string Family, string Type)> Settled = new List<(string Category, string Family, string Type)>();
        /// <summary>MA-2c: the DD properties sent to a person (PropertyPlanner) — no source, sources that disagree, no parameter
        /// Sentinel can write — one row per type and property, the TYPE's UniqueId. They ride on the changeset's exceptions.</summary>
        public List<PromoteHeld> ToPerson = new List<PromoteHeld>();
    }

    public static class PromoteWallsPlanner
    {
        /// <summary>Offsets and widths within this of the target count as equal (Revit stores feet).</summary>
        private const double TolMm = 0.5;
        /// <summary>The bridge's MAX_CHANGESET_EXCEPTIONS (changesets-logic.mjs): more on one changeset is a 400.</summary>
        public const int MaxExceptions = 1000;

        /// <summary>Promote's classes by changeset kind: the guideline category, the IFC class a ghost is adjudicated as, the label word.</summary>
        public static readonly IReadOnlyDictionary<string, (string Category, string Ifc, string Word)> Classes =
            new Dictionary<string, (string, string, string)>(StringComparer.Ordinal)
            {
                ["wall"] = ("Walls", "IfcWall", "W"), ["floor"] = ("Floors", "IfcSlab", "Floor"), ["roof"] = ("Roofs", "IfcRoof", "Roof"),
                ["ceiling"] = ("Ceilings", "IfcCovering", "Ceiling"), ["door"] = ("Doors", "IfcDoor", "Door"), ["window"] = ("Windows", "IfcWindow", "Window"),
            };

        /// <summary>The story level a wall based at <paramref name="baseMm"/> rises to: the lowest Building Story more than 0.5 mm
        /// above it, or null. Promote's attach rule (MA-0), and since MA-1a item 3 the executor's wall top for every source.</summary>
        public static LevelFact NextStory(IReadOnlyList<LevelFact> levels, double baseMm) =>
            levels.Where(l => l != null && l.IsStory && l.ElevationMm > baseMm + TolMm).OrderBy(l => l.ElevationMm).FirstOrDefault();

        /// <summary>MA-1a item 3 (GHB-2): a new wall's top when its proposal sends no TopElevation. The next story above its base
        /// (TopLevel set: the executor constrains the top there, offset 0); with none, unconnected at the height of the storey
        /// below its base — the story at or under the base minus the story before that (founder decision F2); with neither,
        /// null and <paramref name="why"/>: the executor refuses the wall, Ghost's planner names it a gap. Never a constant.</summary>
        public static (double TopMm, string TopLevel)? WallTop(IReadOnlyList<LevelFact> levels, double baseMm, string baseLevel, out string why)
        {
            why = null;
            var next = NextStory(levels, baseMm);
            if (next != null) return (next.ElevationMm, next.Name);
            var at = levels.Where(l => l != null && l.IsStory && l.ElevationMm <= baseMm + TolMm).OrderByDescending(l => l.ElevationMm).FirstOrDefault();
            var under = at == null ? null : levels.Where(l => l != null && l.IsStory && l.ElevationMm < at.ElevationMm - TolMm)
                                                  .OrderByDescending(l => l.ElevationMm).FirstOrDefault();
            if (under != null) return (baseMm + at.ElevationMm - under.ElevationMm, null);
            why = $"no Building Story above {baseLevel}, and no storey below it to take a height from — tick Building Story on the level " +
                  "above (its Properties), add one (Datum from Drawings), or send a TopElevation";
            return null;
        }

        /// <param name="docBasicWallTypes">The document's basic wall types: name (case-insensitive) → the type's Function.</param>
        public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels,
                                            IReadOnlyDictionary<string, string> docBasicWallTypes, GuidelineMatcher m)
        {
            var byName = new Dictionary<string, LevelFact>(StringComparer.Ordinal);
            foreach (var l in levels) if (l?.Name != null && !byName.ContainsKey(l.Name)) byName[l.Name] = l;
            double Elev(string level) => level != null && byName.TryGetValue(level, out var l) ? l.ElevationMm : double.MaxValue;
            string office = string.IsNullOrWhiteSpace(m.Office) ? null : m.Office.Trim() + "_";

            var plans = new List<StoreyPlan>();
            foreach (var storey in walls.GroupBy(w => w.BaseLevel ?? "").OrderBy(g => Elev(g.Key)).ThenBy(g => g.Key, StringComparer.Ordinal))
            {
                var p = new StoreyPlan { Storey = storey.Key, Stamped = storey.Count(w => ProvenanceStamp.SourceOf(w.Stamp) == "promote") };
                byName.TryGetValue(storey.Key, out var baseLevel);
                var next = baseLevel == null ? null : NextStory(levels, baseLevel.ElevationMm); // the executor's wall top too (MA-1a item 3)
                var retypes = new List<PromoteGhost>();
                var ws = storey.ToList();
                // MA-2a: the storey's barriers as the outer boundary reads them — this storey's walls and every other wall that crosses
                // its plane (a shell based below and rising past it: review C1), whatever their types. The storey's own walls come
                // first, so a wall's index in ws is its index here; a wall with no line is no barrier.
                double plane = baseLevel?.ElevationMm ?? double.NaN;
                var segs = ws.Select(w => w.Line).ToList();
                if (!double.IsNaN(plane))
                    segs.AddRange(walls.Where(o => o.Line != null && !ws.Contains(o)
                                                   && Elev(o.BaseLevel) + o.BaseOffsetMm <= plane + TolMm && TopMm(o, Elev(o.BaseLevel)) > plane + TolMm)
                                       .Select(o => o.Line));
                // §3.4 step 4: when every concept wall on the storey shares one type, its Function is the template's default and
                // tells nothing — decided before the loop, because it decides what each wall's rule may see (MA-2a reads the
                // outer boundary instead; a wall whose location cannot be read goes to a person). Settled walls count (a storey a
                // first run half-promoted is not one-type); the office's other types do not (template samples would mask it).
                var eligible = ws.Where(w => w.IsBasic && !w.InGroup && !w.InOption && baseLevel != null && baseLevel.IsStory).ToList();
                bool OfficeOther(WallFact w) => !m.RuleProduces("Walls", w.TypeName) && office != null && (w.TypeName ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase);
                var typed = eligible.Where(w => !OfficeOther(w)).ToList(); // basic, ungrouped walls, settled included, office-typed not
                p.OneType = typed.Count >= 2 && typed.Select(w => w.TypeName ?? "").Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1;
                int officeOthers = eligible.Count(OfficeOther);
                var aside = officeOthers > 0 ? $" besides the {officeOthers} on other office types" : "";

                for (int k = 0; k < ws.Count; k++)
                {
                    var w = ws[k];
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });
                    // MA-2b: a whole-wall hold is BLOCKED in the LOD state — Promote cannot act on it, whatever the matrix says.
                    void Block(string reason) { Hold(reason); p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", Blocked = true }); }

                    // Whole-wall holds: nothing is proposed for these walls.
                    if (!w.IsBasic) { Block("not a basic wall — Promote v0 types basic walls only"); continue; }
                    if (w.InGroup) { Block("in a group — Sentinel does not edit group members"); continue; }
                    if (w.InOption) { Block("in a design option — Sentinel does not edit design options"); continue; }
                    if (baseLevel == null || !baseLevel.IsStory)
                    {
                        Block($"base level {w.BaseLevel} is not a Building Story — Promote plans storey by storey");
                        continue;
                    }

                    // Settled: already on a type the DD rules produce, whatever Function the template gave it (F2).
                    // Otherwise another office type is not a concept wall — left as is, unheld, uncounted (F1) — and
                    // structure goes to a person whole.
                    bool typeOk = m.RuleProduces("Walls", w.TypeName);
                    if (!typeOk && office != null && (w.TypeName ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase)) { p.OfficeTyped++; continue; }
                    if (!typeOk && w.Structural) { Block("structural wall — Promote v0 does not retype or re-top structure; a person decides"); continue; }

                    // Type: settled, or the DD rule's exact answer already loaded in this model, or a person.
                    if (typeOk) { }
                    else if (Math.Abs(w.WidthMm - Math.Round(w.WidthMm)) > 0.001)
                        Hold($"width {Mm(w.WidthMm, "0.###")} mm is not a whole millimetre — exact match only (D16)");
                    else if (!m.HasCatalog) // with none, the matcher answers the rule's pattern unchecked: not an exact match
                        Hold($"no type catalogue installed ({m.CatalogLabel}) — the exact DD type cannot be checked (D16)");
                    else
                    {
                        // MA-2a: what the rules may see — the type's Function (not on a one-type storey: it tells nothing there), the
                        // wall's Location from the outer boundary when it can be read, its Material when the type has one. An
                        // unknown is left out, so a rule that needs it cannot fire: a reason to a person, never a guess.
                        string loc = WallLocation.Locate(segs, k, out string locWhy);
                        bool fnSaysSide = string.Equals(w.Function, WallLocation.Exterior, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(w.Function, WallLocation.Interior, StringComparison.OrdinalIgnoreCase);
                        if (!p.OneType && loc != null && fnSaysSide && !string.Equals(w.Function, loc, StringComparison.OrdinalIgnoreCase))
                        {
                            // Review C2: on a mixed storey the type's Function is a modelling decision; where the boundary reads the other
                            // way (a courtyard wall, a misread outline, a template's wrong Function) neither is passed — a person decides.
                            Hold($"Function {w.Function} but it reads " + (loc == WallLocation.Exterior
                                 ? "outside (one side looks out of the storey's outline)" : "inside (both sides enclosed — a courtyard, or a misread outline)") + "; a person decides");
                        }
                        else
                        {
                            var ps = new Dictionary<string, string>();
                            if (!p.OneType && !string.IsNullOrEmpty(w.Function)) ps["Function"] = w.Function;
                            if (loc != null) ps["Location"] = loc;
                            if (!string.IsNullOrWhiteSpace(w.Material)) ps["Material"] = w.Material;
                            var res = m.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = w.WidthMm });
                            string used = What(ps, res.Matched);
                            // Review C21 (C2 for the Functions that are not a side): on a mixed storey a Retaining, Foundation, Soffit or
                            // Coreshaft wall is decided only by a rule that names its Function — a Location rule listed first would
                            // retype a retaining wall to an internal CMU at confidence 1 with nothing said. A person decides.
                            bool civilFn = ps.ContainsKey("Function") && !fnSaysSide;
                            if (res.Source == "rule" && civilFn && !Named(res.Matched, "Function"))
                                Hold($"Function {w.Function} — the rule that matched does not name Function: it does not decide a {w.Function} wall; a person decides");
                            else if (res.Source == "rule" && res.Confidence == 1 && !string.IsNullOrWhiteSpace(res.Type))
                            {
                                if (string.Equals(res.Type, w.TypeName, StringComparison.OrdinalIgnoreCase)) typeOk = true;
                                else if (docBasicWallTypes == null || !docBasicWallTypes.TryGetValue(res.Type, out var fn))
                                    Hold($"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types");
                                else
                                {
                                    // The rule is the office's: proposed even when the template gave the target another Function.
                                    // Drill MA2a (F-MA2a-2): compared with the wall's side as the rule decided it — the Location it
                                    // matched; else, on a mixed storey, the wall's Function (a modelling decision); on a one-type storey
                                    // with nothing (its Function told nothing). A rule that also names the wall's Function agrees with it
                                    // (a Retaining wall typed onto a Retaining type is right: C21).
                                    bool byLoc = Named(res.Matched, "Location"), byFn = Named(res.Matched, "Function");
                                    string side = byLoc ? loc : p.OneType ? null : w.Function;
                                    bool agrees = string.Equals(fn, side, StringComparison.OrdinalIgnoreCase)
                                                  || (byFn && string.Equals(fn, w.Function, StringComparison.OrdinalIgnoreCase));
                                    var note = string.IsNullOrEmpty(fn) || string.IsNullOrEmpty(side) || agrees
                                        ? null : $"{res.Type} is Function {fn} in this model";
                                    retypes.Add(new PromoteGhost
                                    {
                                        Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                        Reason = $"DD walls v0: {used}, {Mm(w.WidthMm, "0")} mm → {res.Type}" + (note == null ? "" : " — note: " + note),
                                        Note = note,
                                    });
                                }
                            }
                            else if (res.Source == "rule")
                                Hold(m.Gap($"{w.Label} ({w.TypeName}, {used})", res.Why));
                            else if (p.OneType)
                                Hold($"every wall on {storey.Key}{aside} is \"{w.TypeName}\" — inside cannot be told from outside: its Function tells nothing, and " +
                                     (loc != null ? $"{m.Standard} has no rule for Location {loc}" : $"its location is unknown ({locWhy})") + "; a person decides");
                            else
                                Hold($"no DD rule for {used} in {m.Standard}" + (loc == null ? $" (location unknown: {locWhy})" : ""));
                        }
                    }

                    // Top: attached to the next story at offset 0, or an attach ghost, or a person.
                    bool topOk = false;
                    if (next == null) Hold($"no story level above {w.BaseLevel} — nothing to attach the top to");
                    else if (Math.Abs(w.BaseOffsetMm) > TolMm)
                        Hold($"base offset {Mm(w.BaseOffsetMm, "0")} mm — attaching would move the wall");
                    else if (w.TopLevel == next.Name && Math.Abs(w.TopOffsetMm) <= TolMm) topOk = true;
                    else if (TopMm(w, baseLevel.ElevationMm) > next.ElevationMm + TolMm)
                        Hold($"top ({(w.TopLevel == null ? "unconnected, " + Mm(w.HeightMm, "0") + " mm high" : w.TopLevel + " " + Mm(w.TopOffsetMm, "+0;-0;+0"))}) " +
                             $"is above {next.Name} — attaching would cut the wall down to one storey; a person decides");
                    else
                        p.Ghosts.Add(new PromoteGhost
                        {
                            Op = "attach", UniqueId = w.UniqueId, Label = w.Label, BaseLevel = w.BaseLevel, TopLevel = next.Name,
                            Reason = $"DD: top to next story {next.Name} +0 (was {(w.TopLevel == null ? "unconnected" : w.TopLevel + " " + Mm(w.TopOffsetMm, "+0;-0;+0"))})",
                        });

                    if (typeOk && topOk) p.DdNow++;
                    if (typeOk) p.Settled.Add(("Walls", null, w.TypeName)); // MA-2c: its DD type's properties are read
                    p.Lod.Add(new LodFact { UniqueId = w.UniqueId, Category = "Walls", RulesOk = typeOk && topOk });
                }
                p.Walls = ws.Count - p.OfficeTyped;
                p.Ghosts.InsertRange(0, retypes); // retypes first, then attaches: the executor runs them in that order too
                plans.Add(p);
            }
            return plans;

            // The wall's top now: its top level plus offset, or (unconnected) its base plus offset plus height. An
            // unknown top level reads as above everything, so it is held, never cut.
            double TopMm(WallFact w, double baseMm) => w.TopLevel == null ? baseMm + w.BaseOffsetMm + w.HeightMm
                : byName.TryGetValue(w.TopLevel, out var t) ? t.ElevationMm + w.TopOffsetMm : double.MaxValue;
        }

        /// <summary>The POST /changesets/:key bodies, storey by storey. A storey's ghosts are chunked BY WALL at up to
        /// <paramref name="max"/> ghosts (the bridge's cap counts elements): one wall's retype and attach never land in two
        /// changesets (one stamp write, one Undo). Its held walls ride on its chunks, at most MaxExceptions each. A storey
        /// with no ghosts files no changeset (one needs an element), so its held walls ride on the first body filed, named
        /// with their storey — every held wall reaches the ledger and the review window. Empty when no storey has a ghost.</summary>
        public static List<object> Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200, string title = "Promote walls (DD)")
        {
            // MA-2c: a storey's DD properties sent to a person ride with its held elements.
            var carried = plans.Where(p => p.Ghosts.Count == 0)
                .SelectMany(p => p.Held.Concat(p.ToPerson).Select(h => new PromoteHeld { UniqueId = h.UniqueId, Label = $"{p.Storey} · {h.Label}", Reason = h.Reason }))
                .ToList();
            var bodies = new List<object>();
            foreach (var p in plans.Where(p => p.Ghosts.Count > 0))
            {
                var held = p.Held.Concat(p.ToPerson).Concat(bodies.Count == 0 ? carried : new List<PromoteHeld>()).ToList();
                var chunks = ByWall(p.Ghosts, max);
                for (int i = 0; i < chunks.Count; i++)
                    bodies.Add(new
                    {
                        name = $"{title} · {p.Storey}" + (chunks.Count > 1 ? $" ({i + 1}/{chunks.Count})" : ""),
                        source = "promote",
                        actor,
                        elements = chunks[i].Select(Element).ToList(),
                        exceptions = Exceptions(held, i, chunks.Count),
                    });
            }
            return bodies;
        }

        // Whole walls per chunk, retypes first within it (the executor runs them in that order too).
        private static List<List<PromoteGhost>> ByWall(List<PromoteGhost> ghosts, int max)
        {
            var chunks = new List<List<PromoteGhost>>();
            var cur = new List<PromoteGhost>();
            foreach (var wall in ghosts.GroupBy(g => g.UniqueId))
            {
                if (cur.Count > 0 && cur.Count + wall.Count() > max) { chunks.Add(cur); cur = new List<PromoteGhost>(); }
                cur.AddRange(wall);
            }
            if (cur.Count > 0) chunks.Add(cur);
            return chunks.Select(c => c.OrderBy(g => g.Op == "retype" ? 0 : 1).ToList()).ToList();
        }

        // Chunk i's share of the held rows, MaxExceptions each; what the last chunk cannot hold is one summary row.
        private static List<object> Exceptions(IReadOnlyList<PromoteHeld> held, int i, int n)
        {
            var rows = held.Skip(i * MaxExceptions).Take(MaxExceptions)
                .Select(h => (object)new { unique_id = h.UniqueId, name = Clip(h.Label, 256), reason = Clip(h.Reason, 300) }).ToList();
            int over = held.Count - n * MaxExceptions;
            if (i == n - 1 && over > 0)
            {
                rows = rows.Take(MaxExceptions - 1).ToList();
                rows.Add(new { unique_id = "(more)", name = $"… and {over + 1} more", reason = "sent to a person — more than one changeset holds; the Promote summary counts them" });
            }
            return rows.Count == 0 ? null : rows;
        }

        private static object Element(PromoteGhost g) => g.Op == "set_parameter" ? SetParameter(g) : new
        {
            op = g.Op,
            kind = g.Kind ?? "wall",
            target = new { unique_id = g.UniqueId, type_before = g.TypeBefore },
            place = g.Op == "retype" ? (object)new { g.TypeName, g.FamilyName } : new { g.BaseLevel, g.TopLevel },
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
        };

        // MA-2c: a type edit — the type it writes, the property, the value read and the value to write, and its source's kind (the
        // bridge checks it against the installed artefact and writes its own record). Review amendment C2: no psets — the bridge
        // builds the validate its referee judges from kind, parameter and to ([BP] P2-7 step 3), so the value judged is the value written.
        private static object SetParameter(PromoteGhost g) => new
        {
            op = g.Op,
            kind = g.Kind ?? "wall",
            target = new { unique_id = g.UniqueId },
            place = new { g.TypeName, g.FamilyName },
            parameter = g.Parameter,
            revit_parameter = g.RevitParameter,
            from = g.From,
            to = g.To,
            value_source = new { kind = g.SourceKind },
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = Classes[g.Kind ?? "wall"].Ifc, Name = g.Label } },
        };

        // The bridge refuses a reason over its cap (exceptions 300, ghosts 500) and an exception name over 256; a gap text naming
        // the catalogue can run long, and a v1 label carries the element's Mark, which a person types freely.
        private static string Clip(string s, int max) => s == null || s.Length <= max ? s : s.Substring(0, max - 1) + "…";

        private static string Mm(double v, string format) => v.ToString(format, CultureInfo.InvariantCulture);

        /// <summary>MA-2a: the facts a rule used, in words — "Location Exterior, Material Stone" — from the params passed and the
        /// winning rule's Matched ("param:Location"); every param passed when none matched (a hold names what was offered).</summary>
        internal static string What(IReadOnlyDictionary<string, string> ps, IReadOnlyList<string> matched)
        {
            var used = ps.Where(kv => Named(matched, kv.Key)).ToList();
            var said = (used.Count > 0 ? used : ps.ToList()).Select(kv => kv.Key + " " + kv.Value);
            return ps.Count == 0 ? "no facts" : string.Join(", ", said);
        }

        /// <summary>Did the winning rule match on parameter <paramref name="key"/>? Names compare as the matcher compares them: case
        /// and every whitespace ignored (a rule file's "location " is the fact's "Location").</summary>
        internal static bool Named(IReadOnlyList<string> matched, string key)
        {
            string Sq(string v) => new string((v ?? "").Where(ch => !char.IsWhiteSpace(ch)).ToArray());
            return matched != null && matched.Any(h => h != null && h.StartsWith("param:", StringComparison.Ordinal)
                                                       && string.Equals(Sq(h.Substring(6)), Sq(key), StringComparison.OrdinalIgnoreCase));
        }
    }
}
