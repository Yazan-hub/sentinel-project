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
        /// <summary>Stamped = walls whose provenance stamp was last written by a Promote changeset.</summary>
        public int Walls, DdNow, Stamped;
        public List<PromoteGhost> Ghosts = new List<PromoteGhost>();
        public List<PromoteHeld> Held = new List<PromoteHeld>();
    }

    public static class PromoteWallsPlanner
    {
        /// <summary>Offsets and widths within this of the target count as equal (Revit stores feet).</summary>
        private const double TolMm = 0.5;
        /// <summary>The bridge's MAX_CHANGESET_EXCEPTIONS (changesets-logic.mjs): more on one changeset is a 400.</summary>
        public const int MaxExceptions = 1000;

        public static List<StoreyPlan> Plan(IReadOnlyList<WallFact> walls, IReadOnlyList<LevelFact> levels,
                                            ISet<string> docBasicWallTypes, GuidelineMatcher m)
        {
            var byName = new Dictionary<string, LevelFact>(StringComparer.Ordinal);
            foreach (var l in levels) if (l?.Name != null && !byName.ContainsKey(l.Name)) byName[l.Name] = l;
            double Elev(string level) => level != null && byName.TryGetValue(level, out var l) ? l.ElevationMm : double.MaxValue;

            var plans = new List<StoreyPlan>();
            foreach (var storey in walls.GroupBy(w => w.BaseLevel ?? "").OrderBy(g => Elev(g.Key)).ThenBy(g => g.Key, StringComparer.Ordinal))
            {
                var p = new StoreyPlan { Storey = storey.Key, Walls = storey.Count(), Stamped = storey.Count(w => ProvenanceStamp.SourceOf(w.Stamp) == "promote") };
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
                    else if (!m.HasCatalog) // with none, the matcher answers the rule's pattern unchecked: not an exact match
                        Hold($"no type catalogue installed ({m.CatalogLabel}) — the exact DD type cannot be checked (D16)");
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
        public static List<object> Bodies(IReadOnlyList<StoreyPlan> plans, string actor, int max = 200)
        {
            var carried = plans.Where(p => p.Ghosts.Count == 0)
                .SelectMany(p => p.Held.Select(h => new PromoteHeld { UniqueId = h.UniqueId, Label = $"{p.Storey} · {h.Label}", Reason = h.Reason }))
                .ToList();
            var bodies = new List<object>();
            foreach (var p in plans.Where(p => p.Ghosts.Count > 0))
            {
                var held = bodies.Count == 0 ? p.Held.Concat(carried).ToList() : p.Held;
                var chunks = ByWall(p.Ghosts, max);
                for (int i = 0; i < chunks.Count; i++)
                    bodies.Add(new
                    {
                        name = $"Promote walls (DD) · {p.Storey}" + (chunks.Count > 1 ? $" ({i + 1}/{chunks.Count})" : ""),
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
                .Select(h => (object)new { unique_id = h.UniqueId, name = h.Label, reason = Clip(h.Reason, 300) }).ToList();
            int over = held.Count - n * MaxExceptions;
            if (i == n - 1 && over > 0)
            {
                rows = rows.Take(MaxExceptions - 1).ToList();
                rows.Add(new { unique_id = "(more)", name = $"… and {over + 1} more", reason = "sent to a person — more than one changeset holds; the Promote summary counts them" });
            }
            return rows.Count == 0 ? null : rows;
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
