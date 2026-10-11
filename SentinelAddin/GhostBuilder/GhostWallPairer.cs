#nullable disable
// Bridge between the DWG's straight wall-face lines and the pure WallPairing geometry: for the elements
// a mapping says are Walls, collapse each pair of drawn faces into ONE centreline element carrying the
// measured thickness. Everything else passes through untouched.
//
// WHERE THIS RUNS. After mapping (so we know which layers are Walls) and before placement (so the
// placement/guideline step sees one wall of a real thickness, not two faces). The orchestrator threads it
// between the two — see GhostBuilderOrchestrator.
//
// WHY IT'S SEPARATE FROM WallPairing. WallPairing is pure 2D and unit-agnostic; this is the Revit-coupled
// half — it reads Curve endpoints, converts feet→mm for the thickness the guideline expects, and rebuilds
// Revit curves from the centrelines. Keeping the geometry pure is what let the pairing be tested offline.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    public static class GhostWallPairer
    {
        private const double FeetToMm = 304.8;

        /// <summary>
        /// Return a new element list in which each Walls-category layer's face lines are paired into
        /// centreline walls with a measured thickness. Non-wall elements, curved walls and loops with an arc are
        /// passed through unchanged; a loop of straight edges is paired like lines (MA-5b-6). Two pieces of a wall
        /// broken at a drawn door or window are joined through it, and every paired wall's ends meet the
        /// centreline of the wall they run into (MA-5b-6, GHB-6). Never throws on odd geometry — a wall it can't
        /// pair stays a plain run exactly as before, so this can only add information, never break a build.
        /// </summary>
        public static List<GhostElement> PairWalls(IEnumerable<GhostElement> elements, MappingResult mapping)
        {
            var all = elements?.ToList() ?? new List<GhostElement>();
            if (mapping?.Mappings == null || mapping.Mappings.Count == 0) return all;

            // Which layers are walls, by the mapping the model just produced.
            var wallLayers = new HashSet<string>(
                mapping.Mappings.Where(m => string.Equals(m.Category, "Walls", StringComparison.OrdinalIgnoreCase))
                                .Select(m => m.CadLayer),
                StringComparer.OrdinalIgnoreCase);
            if (wallLayers.Count == 0) return all;

            var output = new List<GhostElement>();

            // MA-5b-6 (GHB-6): the doors and windows the drawing places (a block's middle, an outline's centroid), in mm — a wall broken
            // at one is joined through it below.
            var openLayers = new HashSet<string>(mapping.Mappings.Where(m => string.Equals(m.Category, "Doors", StringComparison.OrdinalIgnoreCase)
                                                                             || string.Equals(m.Category, "Windows", StringComparison.OrdinalIgnoreCase))
                                                                 .Select(m => m.CadLayer), StringComparer.OrdinalIgnoreCase);
            var openings = all.Where(el => openLayers.Contains(el.CadLayer))
                              .Select(el => el.LocationPoint ?? (el.LocationLoop != null ? ElementPlacementFactory.Centroid(el.LocationLoop) : null))
                              .Where(p => p != null).Select(p => (p.X * FeetToMm, p.Y * FeetToMm)).ToList();

            // Pass through everything that isn't straight wall lines (points, curves, a loop with an arc, non-wall layers). Straight
            // LocationCurve lines on wall layers are paired — and (MA-5b-6) a closed outline of straight edges: its edges are the
            // wall's faces, its short edges the caps. Each segment remembers the element it came from (elevations carry over).
            var byLayer = new Dictionary<string, List<(Seg seg, GhostElement src)>>(StringComparer.OrdinalIgnoreCase);
            foreach (var el in all)
            {
                List<Curve> edges = !wallLayers.Contains(el.CadLayer) ? null
                    : el.LocationLoop == null ? (el.LocationCurve is Line line && line.IsBound ? new List<Curve> { line } : null)
                    : el.LocationCurve == null && el.LocationLoop.Count >= 3 && el.LocationLoop.All(c => c is Line && c.IsBound) ? el.LocationLoop.ToList() : null;
                if (edges == null) { output.Add(el); continue; }
                if (!byLayer.TryGetValue(el.CadLayer, out var list)) byLayer[el.CadLayer] = list = new List<(Seg, GhostElement)>();
                list.AddRange(edges.Select(c => (ToSeg(c), el)));
            }

            // Paired and joined per layer (a door between two rows' walls joins nothing); trimmed across every layer (an exterior
            // layer meets an interior one at a corner).
            var built = new List<(PairedWall w, GhostElement src)>();
            var paired = byLayer.ToDictionary(kv => kv.Key, kv => WallPairing.Pair(kv.Value.Select(e => e.seg).ToList()), StringComparer.OrdinalIgnoreCase);
            foreach (var kv in byLayer)
            {
                var els = kv.Value;
                // review: a wall of another row standing in the gap keeps the pieces apart too
                var walls = WallPairing.JoinAtOpenings(paired[kv.Key], openings, PlacementGeometry.BrokenReachMm, PlacementGeometry.HostTolMm,
                                                       paired.Where(p => !string.Equals(p.Key, kv.Key, StringComparison.OrdinalIgnoreCase)).SelectMany(p => p.Value).ToList());
                built.AddRange(walls.Select(w => (w, els[w.FaceA].src)));
            }
            WallPairing.TrimEnds(built.Select(b => b.w).ToList());

            foreach (var (w, src) in built)
            {
                // Based on one of the faces it came from, so elevation/height carry over.
                Line centre;
                try
                {
                    centre = Line.CreateBound(
                        new XYZ(w.Cx1 / FeetToMm, w.Cy1 / FeetToMm, src.BaseElevation),
                        new XYZ(w.Cx2 / FeetToMm, w.Cy2 / FeetToMm, src.BaseElevation));
                }
                catch (Autodesk.Revit.Exceptions.ArgumentException)
                {
                    // Degenerate centreline (near-zero length) — keep the original face rather than drop it.
                    output.Add(src);
                    continue;
                }

                output.Add(new GhostElement
                {
                    CadLayer = src.CadLayer,
                    LocationCurve = centre,
                    BaseElevation = src.BaseElevation,
                    TopElevation = src.TopElevation,
                    ThicknessMm = w.ThicknessMm,   // 0 for an unpaired face — an honest "unknown"
                });
            }

            return output;
        }

        // Curve endpoints (feet) → a 2D segment in millimetres, the unit the guideline and the template
        // names both use.
        private static Seg ToSeg(Curve c)
        {
            XYZ p0 = c.GetEndPoint(0), p1 = c.GetEndPoint(1);
            return new Seg(p0.X * FeetToMm, p0.Y * FeetToMm, p1.X * FeetToMm, p1.Y * FeetToMm);
        }
    }
}
