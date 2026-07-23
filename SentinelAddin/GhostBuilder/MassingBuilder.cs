#nullable disable
// Place a MassingPlan into Revit — the geometry-generation half of photo→massing. It converts the plan's
// millimetre coordinates into GhostElements and hands them to the SAME placement engine a DWG build uses,
// so the guideline chooses the wall types (and creates missing ones) and every element is governed and
// audited identically. No parallel ungoverned modelling path — that is the whole point versus the demo.
//
// Caller owns the Transaction (same contract as GhostPlacementEngine).
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    public static class MassingBuilder
    {
        private const double MmToFeet = 1.0 / 304.8;

        /// <summary>
        /// Turn a plan into GhostElements + a MappingResult, so the existing GhostPlacementEngine builds it.
        /// Perimeter walls become wall runs (with the plan's thickness, which the guideline types); floors
        /// become closed loops. Openings are returned as elements too but only place if a family exists —
        /// same honest behaviour as the DWG door path.
        /// </summary>
        public static (List<GhostElement> Elements, MappingResult Mapping) ToBuildInputs(MassingPlan plan)
        {
            var elements = new List<GhostElement>();

            foreach (var w in plan.Walls)
            {
                Line run;
                try
                {
                    run = Line.CreateBound(
                        new XYZ(w.X1 * MmToFeet, w.Y1 * MmToFeet, w.BaseElevationMm * MmToFeet),
                        new XYZ(w.X2 * MmToFeet, w.Y2 * MmToFeet, w.BaseElevationMm * MmToFeet));
                }
                catch (Autodesk.Revit.Exceptions.ArgumentException) { continue; } // degenerate edge — skip

                elements.Add(new GhostElement
                {
                    CadLayer = w.Layer,
                    LocationCurve = run,
                    BaseElevation = w.BaseElevationMm * MmToFeet,
                    TopElevation = (w.BaseElevationMm + w.HeightMm) * MmToFeet,
                    ThicknessMm = w.ThicknessMm,   // already the measured/target thickness → guideline types it
                });
            }

            foreach (var f in plan.Floors)
            {
                var loop = new List<Curve>();
                for (int i = 0; i < f.Loop.Count - 1; i++)
                {
                    try
                    {
                        loop.Add(Line.CreateBound(
                            new XYZ(f.Loop[i][0] * MmToFeet, f.Loop[i][1] * MmToFeet, f.BaseElevationMm * MmToFeet),
                            new XYZ(f.Loop[i + 1][0] * MmToFeet, f.Loop[i + 1][1] * MmToFeet, f.BaseElevationMm * MmToFeet)));
                    }
                    catch (Autodesk.Revit.Exceptions.ArgumentException) { /* skip a degenerate edge */ }
                }
                if (loop.Count >= 3)
                    elements.Add(new GhostElement
                    {
                        CadLayer = f.Layer,
                        LocationLoop = loop,
                        BaseElevation = f.BaseElevationMm * MmToFeet,
                        TopElevation = f.BaseElevationMm * MmToFeet,
                    });
            }

            // Openings: a point at the opening centre on the front wall, as a family-instance candidate.
            foreach (var o in plan.Openings)
            {
                var host = plan.Walls.ElementAtOrDefault(o.WallIndex);
                if (host == null) continue;
                // centre point along the wall
                double t = host.WidthOrLength() <= 0 ? 0.5 : o.OffsetMm / host.WidthOrLength();
                double px = host.X1 + (host.X2 - host.X1) * t;
                double py = host.Y1 + (host.Y2 - host.Y1) * t;
                elements.Add(new GhostElement
                {
                    CadLayer = o.Layer,
                    LocationPoint = new XYZ(px * MmToFeet, py * MmToFeet, (host.BaseElevationMm + o.SillMm) * MmToFeet),
                    BaseElevation = host.BaseElevationMm * MmToFeet,
                });
            }

            // The layer→category mapping the massing plan implies. GhostBuilder's engine keys placement on
            // this exactly as it does for a DWG's LLM mapping.
            var mapping = new MappingResult
            {
                Mappings = new List<LayerMapping>
                {
                    new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls",   Confidence = 1.0 },
                    new LayerMapping { CadLayer = "A-FLOR",     Category = "Floors",  Confidence = 1.0 },
                    new LayerMapping { CadLayer = "A-DOOR",     Category = "Doors",   Confidence = 1.0 },
                    new LayerMapping { CadLayer = "A-WIND",     Category = "Windows", Confidence = 1.0 },
                },
            };
            return (elements, mapping);
        }

        private static double WidthOrLength(this PlanWall w)
        {
            double dx = w.X2 - w.X1, dy = w.Y2 - w.Y1;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }
}
