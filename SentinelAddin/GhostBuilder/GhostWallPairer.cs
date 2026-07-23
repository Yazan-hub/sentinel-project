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
        /// centreline walls with a measured thickness. Non-wall elements, curved walls, and closed-loop
        /// walls are passed through unchanged. Never throws on odd geometry — a wall it can't pair stays
        /// a plain run exactly as before, so this can only add information, never break a build.
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

            // Pass through everything that isn't a straight single-run wall line (loops, points, curves,
            // non-wall layers). Only straight LocationCurve lines on wall layers are candidates for pairing.
            var byLayer = new Dictionary<string, List<GhostElement>>(StringComparer.OrdinalIgnoreCase);
            foreach (var el in all)
            {
                bool pairable = wallLayers.Contains(el.CadLayer)
                                && el.LocationCurve is Line line && line.IsBound
                                && el.LocationLoop == null;
                if (!pairable) { output.Add(el); continue; }
                if (!byLayer.TryGetValue(el.CadLayer, out var list)) byLayer[el.CadLayer] = list = new List<GhostElement>();
                list.Add(el);
            }

            foreach (var kv in byLayer)
            {
                var els = kv.Value;
                var segs = els.Select(ToSeg).ToList();
                var walls = WallPairing.Pair(segs);

                foreach (var w in walls)
                {
                    // Base the rebuilt element on one of the faces it came from, so elevation/height carry over.
                    var src = els[w.FaceA];
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
            }

            return output;
        }

        // Curve endpoints (feet) → a 2D segment in millimetres, the unit the guideline and the template
        // names both use.
        private static Seg ToSeg(GhostElement el)
        {
            XYZ p0 = el.LocationCurve.GetEndPoint(0), p1 = el.LocationCurve.GetEndPoint(1);
            return new Seg(p0.X * FeetToMm, p0.Y * FeetToMm, p1.X * FeetToMm, p1.Y * FeetToMm);
        }
    }
}
