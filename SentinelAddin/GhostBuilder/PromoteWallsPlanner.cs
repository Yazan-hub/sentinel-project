#nullable disable
// MA-0 Promote walls v0 — the pure planner. Facts read from the pinned document go in; per storey (a wall's base
// level) come out the ghosts to file (retype to the exact catalogue type, attach the top to the next story) and the
// walls sent to a person, each with its reason. No Revit types, so tools/promote-check drives it offline (the
// MassingPlanner / ViewPlanner pattern). Commands.PromoteWalls reads the facts and files one changeset per storey.
//
// EXACT OR A PERSON (D16). A type is proposed only when the DD rule answers at confidence 1 AND that type is already
// loaded in this model: Sentinel creates no types. Anything else — a gap, no rule, a width that is not a whole mm, a
// storey whose walls all share one type — is held with its reason, never guessed.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

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
        public bool IsBasic, InGroup;
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
    }

    public sealed class PromoteHeld
    {
        public string UniqueId, Label, Reason;
    }

    public sealed class StoreyPlan
    {
        public string Storey;
        public int Walls, DdNow, Stamped;
        public List<PromoteGhost> Ghosts = new List<PromoteGhost>();
        public List<PromoteHeld> Held = new List<PromoteHeld>();
    }

    public static class PromoteWallsPlanner
    {
        /// <summary>Offsets and widths within this of the target count as equal (Revit stores feet).</summary>
        private const double TolMm = 0.5;

        public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels,
                                            ISet<string> docBasicWallTypes, GuidelineMatcher m)
        {
            var byName = new Dictionary<string, LevelFact>(StringComparer.Ordinal);
            foreach (var l in levels) if (l?.Name != null && !byName.ContainsKey(l.Name)) byName[l.Name] = l;
            double Elev(string level) => level != null && byName.TryGetValue(level, out var l) ? l.ElevationMm : double.MaxValue;

            var plans = new List<StoreyPlan>();
            foreach (var storey in walls.GroupBy(w => w.BaseLevel ?? "").OrderBy(g => Elev(g.Key)).ThenBy(g => g.Key, StringComparer.Ordinal))
            {
                var p = new StoreyPlan { Storey = storey.Key, Walls = storey.Count(), Stamped = storey.Count(w => !string.IsNullOrEmpty(w.Stamp)) };
                byName.TryGetValue(storey.Key, out var baseLevel);
                var next = baseLevel == null ? null : levels.Where(l => l.IsStory && l.ElevationMm > baseLevel.ElevationMm + TolMm)
                                                            .OrderBy(l => l.ElevationMm).FirstOrDefault();
                var retypes = new List<PromoteGhost>();

                foreach (var w in storey)
                {
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });

                    // Whole-wall holds: nothing is proposed for these walls.
                    if (!w.IsBasic) { Hold("not a basic wall — Promote v0 types basic walls only"); continue; }
                    if (w.InGroup) { Hold("in a group — Sentinel does not edit group members"); continue; }
                    if (baseLevel == null || !baseLevel.IsStory)
                    {
                        Hold($"base level {w.BaseLevel} is not a Building Story — Promote plans storey by storey");
                        continue;
                    }

                    // Type: the DD rule's exact answer, already loaded in this model, or a person.
                    bool typeOk = false;
                    if (Math.Abs(w.WidthMm - Math.Round(w.WidthMm)) > 0.001)
                        Hold($"width {Mm(w.WidthMm, "0.###")} mm is not a whole millimetre — exact match only (D16)");
                    else
                    {
                        var res = m.Resolve(new GuidelineInput
                        {
                            Category = "Walls",
                            Params = new Dictionary<string, string> { ["Function"] = w.Function ?? "" },
                            ThicknessMm = w.WidthMm,
                        });
                        if (res.Source == "rule" && res.Confidence == 1 && !string.IsNullOrWhiteSpace(res.Type))
                        {
                            if (string.Equals(res.Type, w.TypeName, StringComparison.OrdinalIgnoreCase)) typeOk = true;
                            else if (docBasicWallTypes == null || !docBasicWallTypes.Contains(res.Type))
                                Hold($"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types");
                            else
                                retypes.Add(new PromoteGhost
                                {
                                    Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                    Reason = $"DD walls v0: Function {w.Function}, {Mm(w.WidthMm, "0")} mm → {res.Type}",
                                });
                        }
                        else if (res.Source == "rule")
                            Hold(m.Gap($"{w.Label} ({w.TypeName}, {w.Function})", res.Why));
                        else
                            Hold($"no DD rule for Function {w.Function} in {m.Standard}");
                    }

                    // Top: attached to the next story at offset 0, or an attach ghost, or a person.
                    bool topOk = false;
                    if (next == null) Hold($"no story level above {w.BaseLevel} — nothing to attach the top to");
                    else if (Math.Abs(w.BaseOffsetMm) > TolMm)
                        Hold($"base offset {Mm(w.BaseOffsetMm, "0")} mm — attaching would move the wall");
                    else if (w.TopLevel == next.Name && Math.Abs(w.TopOffsetMm) <= TolMm) topOk = true;
                    else
                        p.Ghosts.Add(new PromoteGhost
                        {
                            Op = "attach", UniqueId = w.UniqueId, Label = w.Label, BaseLevel = w.BaseLevel, TopLevel = next.Name,
                            Reason = $"DD: top to next story {next.Name} +0 (was {(w.TopLevel == null ? "unconnected" : w.TopLevel + " " + Mm(w.TopOffsetMm, "+0;-0;+0"))})",
                        });

                    if (typeOk && topOk) p.DdNow++;
                }

                // §3.4 step 4: when every wall on the storey shares one type, inside cannot be told from outside —
                // the retypes go to a person (MA-2 reads the outer boundary). The attaches stay.
                var typed = storey.Where(w => w.IsBasic && !w.InGroup).ToList();
                if (typed.Count >= 2 && typed.Select(w => w.TypeName ?? "").Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1)
                    foreach (var g in retypes)
                        p.Held.Add(new PromoteHeld
                        {
                            UniqueId = g.UniqueId, Label = g.Label,
                            Reason = $"every wall on {storey.Key} is \"{g.TypeBefore}\" — inside cannot be told from outside; a person decides",
                        });
                else
                    p.Ghosts.InsertRange(0, retypes); // retypes first, then attaches: the executor runs them in that order too
                plans.Add(p);
            }
            return plans;
        }

        /// <summary>The POST /changesets/:key bodies for one storey: chunked by GHOST count (the bridge's cap counts
        /// elements), the exceptions riding on the first chunk only. Empty when the storey has no ghosts — a changeset
        /// needs at least one element; its held walls are in the plan summary.</summary>
        public static List<object> Bodies(StoreyPlan p, string actor, int max = 200)
        {
            var bodies = new List<object>();
            int n = (p.Ghosts.Count + max - 1) / max;
            for (int i = 0; i < n; i++)
            {
                bodies.Add(new
                {
                    name = $"Promote walls (DD) · {p.Storey}" + (n > 1 ? $" ({i + 1}/{n})" : ""),
                    source = "promote",
                    actor,
                    elements = p.Ghosts.Skip(i * max).Take(max).Select(Element).ToList(),
                    exceptions = i == 0 && p.Held.Count > 0
                        ? p.Held.Select(h => (object)new { unique_id = h.UniqueId, name = h.Label, reason = Clip(h.Reason, 300) }).ToList()
                        : null,
                });
            }
            return bodies;
        }

        private static object Element(PromoteGhost g) => new
        {
            op = g.Op,
            kind = "wall",
            target = new { unique_id = g.UniqueId, type_before = g.TypeBefore },
            place = g.Op == "retype" ? (object)new { g.TypeName } : new { g.BaseLevel, g.TopLevel },
            reason = Clip(g.Reason, 500),
            validate = new { identity = new { Class = "IfcWall", Name = g.Label } },
        };

        // The bridge refuses a reason over its cap (exceptions 300, ghosts 500); a gap text naming the catalogue can run long.
        private static string Clip(string s, int max) => s == null || s.Length <= max ? s : s.Substring(0, max - 1) + "…";

        private static string Mm(double v, string format) => v.ToString(format, CultureInfo.InvariantCulture);
    }
}
