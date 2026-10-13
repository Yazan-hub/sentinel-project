#nullable disable
// MA-8-14: a terrain from a scan, the pure planner. Facts go in - the ground points the bridge read off the survey (lowest per cell, outside the storey's walls), the
// storey's footprint, its level, the guideline's Toposolid rule and the survey changeset - and out comes either the POST /changesets/:key body of ONE terrain or the reason a
// person decides (D9). No Revit types, so tools/promote-check drives it offline; Commands.ReviewChangesets reads the facts and files the body.
//
// THE POINTS ARE THE ADD-IN'S WORD. The bridge cannot tie them to the scan (the ground read is a GET with no ledger row), so the element names the survey changeset it came from
// (from_scan) and its reason says so; the bridge ties its level, hole and height band to that changeset's ground cut (review round 1), and the desk says only that.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    /// <summary>A plan: <see cref="Body"/> to file, or <see cref="Hold"/> (a whole sentence) when a person decides.</summary>
    internal sealed class TerrainPlan
    {
        public object Body;
        public string Hold;
        /// <summary>The one-line account for the dialog ("412 ground points on L00 outside the walls, from job-0003").</summary>
        public string Line;
        public int Points;
    }

    internal static class TerrainPlanner
    {
        /// <summary>The bridge's own bounds (changesets-logic MIN/MAX_TERRAIN_POINTS): fewer than 3 points make no surface, more than 2000 are refused.</summary>
        public const int MinPoints = 3, MaxPoints = 2000;
        /// <summary>The bridge's ground cell (survey-plan GROUND_CELL_MM); a wider one means the cell doubled to stay under <see cref="MaxPoints"/>.</summary>
        public const int BaseCellMm = 500;
        /// <summary>Review round 2: the bridge's span bound (changesets-logic MAX_TERRAIN_SPAN_MM) - points wider than this in plan are refused at filing, so the plan holds them first.</summary>
        public const double MaxSpanMm = 500000;
        /// <summary>Review round 2 (D-B5-9, said): what Revit builds beyond the scan's points - the hole is the walls' box, not the walls, and CreateTerrain adds rim points.
        /// In the reason, the plan's line and the review row. Review round 3: one plain sentence; the web desk (review-desk.ts TERRAIN_SHAPE) holds it verbatim and
        /// "plus 1 m" is survey-plan's GROUND_PAD_MM (both pinned by Ma8Terrain).</summary>
        public const string Shape = "the hole is the walls' box plus 1 m (a notch or courtyard inside it gets no ground); Sentinel adds points along the outer edge and the hole's edge, each at the nearest ground point's height";
        /// <summary>The refusal at Apply (and on the review row) on a Revit before 2024 - which has no Toposolid. Nothing was placed.</summary>
        public const string OldRevit = "a terrain is a Toposolid — Revit 2024 and later; this Revit cannot apply it; nothing was placed";
        /// <summary>The refusal at Propose on a Revit before 2024.</summary>
        public static string NoProposal(string revitVersion) => $"a terrain is a Toposolid — Revit 2024 and later; this is Revit {revitVersion}. Nothing was proposed";

        /// <param name="points">The ground points [x, y, z] mm, z the absolute model elevation (the bridge's answer).</param>
        /// <param name="footprint">The storey's footprint [x, y] mm (the oriented box of the lowest walls, + 1 m) - the hole in the Toposolid.</param>
        /// <param name="level">The level the lowest walls name.</param>
        /// <param name="cellMm">The plan cell the lowest point was kept per (the answer's cell_mm), <paramref name="zMm"/> the height band read, <paramref name="of"/> the points the 500 mm cell kept before it widened.</param>
        /// <param name="rule">The guideline's Toposolid rule (GuidelineMatcher.TerrainRule), or null when it names none.</param>
        public static TerrainPlan Plan(double[][] points, double[][] footprint, string level, (string Family, string Type, string Source)? rule,
                                       string csName, string csId, string jobId, int cellMm, double[] zMm, int? of, string actor)
        {
            TerrainPlan Hold(string why) => new TerrainPlan { Hold = why };
            if (string.IsNullOrWhiteSpace(level)) return Hold($"{csName}'s lowest walls name no level — the Toposolid is created on a level; a person decides");
            if (rule == null || string.IsNullOrWhiteSpace(rule.Value.Type)) return Hold("the guideline names no Toposolid type — a person decides");
            if (footprint == null || footprint.Length < 3) return Hold($"the scan's storey has no footprint (no wall on {level}) — a person decides");
            int n = points?.Length ?? 0;
            if (n < MinPoints) return Hold($"{n} ground point(s) outside the walls of {level} in the scan — a surface needs at least {MinPoints}; a person decides");
            if (n > MaxPoints) return Hold($"{n} ground points — a terrain takes at most {MaxPoints}; a person decides");
            // review round 2: the bridge's span bound, said here before the filing refuses it (the span as the bridge measures it: the wider of the x and y ranges);
            // review round 3: over the points and the footprint, as the bridge - the outer loop runs round both (OuterRect)
            var plan = points.Concat(footprint).ToList();
            double span = Math.Max(plan.Max(p => p[0]) - plan.Min(p => p[0]), plan.Max(p => p[1]) - plan.Min(p => p[1]));
            if (span > MaxSpanMm) return Hold($"the ground spans {Math.Round(span / 1000)} m in plan — a terrain is at most {MaxSpanMm / 1000} m across; a person decides");
            string name = $"Terrain · {level}";
            // review: say what the read does not see - the cell it kept one point per, the band it cut to, and the walls' box it left out
            string widened = cellMm > BaseCellMm && of != null ? $" (widened from {BaseCellMm} mm, which kept {of})" : "";
            string band = zMm is { Length: 2 } ? $", between {Mm(zMm[0])} and {Mm(zMm[1])} mm (5 m under to 1.5 m over {level}'s floor; ground outside that band is not read)" : "";
            string reason = $"{n} ground points, lowest per {cellMm} mm cell{widened}{band}, outside the storey's walls, from {jobId}; {Shape} — check it against the site survey";
            var place = new Dictionary<string, object> { ["LevelName"] = level };
            if (!string.IsNullOrWhiteSpace(rule.Value.Family)) place["FamilyName"] = rule.Value.Family;
            place["TypeName"] = rule.Value.Type;
            place["Points"] = points;
            place["Boundary"] = footprint;
            var element = new
            {
                kind = "terrain",
                validate = new { identity = new { Class = "IFCGEOGRAPHICELEMENT", Name = name } },
                reason,
                place,
                from_scan = new { changeset = csId },
            };
            return new TerrainPlan
            {
                Body = new { name = $"{name} · from {csName}", source = "promote", actor, elements = new[] { element } },
                Points = n,
                Line = $"{n} ground points on {level} outside the walls, lowest per {cellMm} mm cell{widened}{(zMm is { Length: 2 } ? $", {Mm(zMm[0])} to {Mm(zMm[1])} mm" : "")}, {rule.Value.Type} ({rule.Value.Source}), from {jobId}; {Shape}",
            };
        }

        static string Mm(double v) => Math.Round(v).ToString("0", CultureInfo.InvariantCulture);

        /// <summary>MA-8-14 review round 1: the z (mm) of the ground point nearest (x, y) in plan - a Toposolid's loop vertex carries no point, so CreateTerrain gives it this.</summary>
        public static double NearestZ(IReadOnlyList<double[]> ground, double x, double y)
        {
            double best = double.MaxValue, z = 0;
            foreach (var p in ground) { double d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); if (d < best) { best = d; z = p[2]; } }
            return z;
        }

        /// <summary>MA-8-14 review round 1: points along each edge of <paramref name="loop"/> (anticlockwise, [x, y] mm), every <paramref name="stepMm"/> or less and
        /// <paramref name="insetMm"/> to its left (into the solid for the outer loop; pass a negative inset for the hole: to its right, out of it), each at the nearest ground
        /// point's z. Without them a loop edge stays at the top face's height (the lowest point less 10 mm): a trench round the building and a sunken rim. Pure.</summary>
        public static List<double[]> RimPoints(IReadOnlyList<double[]> loop, IReadOnlyList<double[]> ground, double insetMm, double stepMm = BaseCellMm)
        {
            var rim = new List<double[]>();
            for (int i = 0; i < loop.Count; i++)
            {
                double[] a = loop[i], b = loop[(i + 1) % loop.Count];
                double dx = b[0] - a[0], dy = b[1] - a[1], len = Math.Sqrt(dx * dx + dy * dy);
                if (len < 1) continue;
                double nx = -dy / len * insetMm, ny = dx / len * insetMm;
                int n = Math.Max(1, (int)Math.Ceiling(len / stepMm));
                for (int k = 0; k < n; k++)
                {
                    // the start sits inset along the edge too; the end is the next edge's start (a corner gets one point, not two on one spot)
                    double t = (Math.Abs(insetMm) + k * (len - 2 * Math.Abs(insetMm)) / n) / len, x = a[0] + dx * t + nx, y = a[1] + dy * t + ny;
                    rim.Add(new[] { x, y, NearestZ(ground, x, y) });
                }
            }
            return rim;
        }

        /// <summary>MA-8-14 review round 3: CreateTerrain's arithmetic, pure (Compat calls these inside the 2024 guard; Ma8Terrain runs them on values). The height offset o, mm
        /// from the level: the lowest point less the level less 10 mm (the spike's lift: every point then sits at least 10 mm above the top face, so the type's thickness never
        /// limits the relief). Clamped to 0 - not in the spike's note 2, which ran only ground under the floor: a site wholly above the floor keeps its top face at the level
        /// and its points rise from it, so a positive Height Offset From Level (untried) is never set.</summary>
        public static double OffsetMm(double lowestZMm, double levelElevationMm) => Math.Min(0, lowestZMm - levelElevationMm - 10);

        /// <summary>Review round 3: the outer loop - an axis-aligned rectangle round the points and the footprint, <paramref name="marginMm"/> out on every side, anticlockwise.</summary>
        public static List<double[]> OuterRect(IReadOnlyList<double[]> points, IReadOnlyList<double[]> footprint, double marginMm)
        {
            var all = points.Concat(footprint).ToList();
            double x0 = all.Min(p => p[0]) - marginMm, x1 = all.Max(p => p[0]) + marginMm, y0 = all.Min(p => p[1]) - marginMm, y1 = all.Max(p => p[1]) + marginMm;
            return new List<double[]> { new[] { x0, y0 }, new[] { x1, y0 }, new[] { x1, y1 }, new[] { x0, y1 } };
        }

        /// <summary>Review round 3: the hole as [x, y], anticlockwise like the outer loop (the bridge checks the footprint is one simple loop, not which way it turns), a closing
        /// point repeating the first dropped.</summary>
        public static List<double[]> AnticlockwiseRing(IReadOnlyList<double[]> footprint)
        {
            var ring = footprint.Select(p => new[] { p[0], p[1] }).ToList();
            if (ring.Count > 3 && Math.Abs(ring[0][0] - ring[ring.Count - 1][0]) < 1e-6 && Math.Abs(ring[0][1] - ring[ring.Count - 1][1]) < 1e-6) ring.RemoveAt(ring.Count - 1);
            double area2 = 0;
            for (int i = 0; i < ring.Count; i++) area2 += ring[i][0] * ring[(i + 1) % ring.Count][1] - ring[(i + 1) % ring.Count][0] * ring[i][1];
            if (area2 < 0) ring.Reverse();
            return ring;
        }

        /// <summary>MA-8-14 review round 3: the applied terrains whose Toposolid this model no longer holds (<paramref name="standing"/>: is that UniqueId in the model) - deleted by
        /// hand, or undone after a restart, neither of which posts the changeset_reverted row an in-session Ctrl+Z does, so the bridge would hold the scan ("undo it in Revit
        /// first") for good. Each with the proposal_guids to report as undone (ChangesetClient.ReportReverted). Only an applied entry with a UniqueId is judged. Pure.</summary>
        public static List<(string Id, string Name, List<string> Guids)> Gone(IEnumerable<ChangesetDto> all, Func<string, bool> standing)
        {
            var gone = new List<(string, string, List<string>)>();
            foreach (var c in all ?? Enumerable.Empty<ChangesetDto>())
            {
                if (c.Status != "applied" && c.Status != "partially_applied") continue;
                if (c.Result is not { ValueKind: JsonValueKind.Object } res || !res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) continue;
                var terrains = new HashSet<string>((c.Elements ?? new()).Where(e => e.Kind == "terrain" && e.ProposalGuid != null).Select(e => e.ProposalGuid), StringComparer.Ordinal);
                var guids = a.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object
                        && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String && terrains.Contains(g.GetString())
                        && x.TryGetProperty("revit_unique_id", out var u) && u.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(u.GetString()) && !standing(u.GetString()))
                    .Select(x => x.GetProperty("proposal_guid").GetString()).ToList();
                if (guids.Count > 0) gone.Add((c.Id, c.Name, guids));
            }
            return gone;
        }

        /// <summary>The line the review window reads beside a terrain row.</summary>
        public static string RowWords(int points, bool supported) =>
            // review round 2: only what the bridge checks is claimed (as the desk) - a member's filing, not "read off the scan"
            $"Toposolid from {points} ground points filed by a signed-in member from the survey changeset (the bridge checked its level, footprint and height band, not the points; not re-measured); {Shape} — check it against the site survey" + (supported ? "" : " — " + OldRevit);
    }
}
