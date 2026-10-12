#nullable disable
// MA-6-4 Shell a Mass — the reads, on the API thread and read-only: the mass's solid (its forms united), its storeys (the Building Story
// levels it spans, by ProjectElevation — the solid's frame, as the rehost code reads it), each storey's section 10 mm above its bottom level
// and 10 mm below its top one (BooleanOperationsUtils.CutWithHalfSpace: the face the cut leaves), and the wall, floor and roof types the
// planner may name. Every failure is one sentence: the mass's refuses the run, a storey's holds that storey (risk R5). ShellPlanner plans.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    internal static class ShellReader
    {
        private const double FtToMm = 304.8;
        private const double CutMm = ShellPlanner.CutMm, TolMm = 2;

        /// <summary>The facts ShellPlanner plans from, or null and <paramref name="refusal"/>: the mass has no solid Revit can cut, or walls
        /// already stand inside it (Shell plans an empty mass only — a second run after Apply files no second shell).</summary>
        public static ShellFacts Read(Document doc, Element mass, out string refusal)
        {
            var solid = SolidOf(mass, out refusal);
            if (solid == null) return null;
            // MA-6 amendment 7: the walls the mass's own solid holds — not its bounding box (an L's empty corner, a neighbour's walls).
            int inside = new FilteredElementCollector(doc).OfClass(typeof(Wall)).WherePasses(new ElementIntersectsSolidFilter(solid)).GetElementCount();
            if (inside > 0) { refusal = $"{inside} wall(s) already stand inside this mass — Shell plans an empty mass only; a person decides"; return null; }

            // Amendment 6a: the Z range in the model's frame — each corner of the solid's box through its transform.
            var bb = solid.GetBoundingBox();
            var zs = new[] { bb.Min.X, bb.Max.X }.SelectMany(x => new[] { bb.Min.Y, bb.Max.Y }.SelectMany(y => new[] { bb.Min.Z, bb.Max.Z }
                .Select(z => bb.Transform.OfPoint(new XYZ(x, y, z)).Z))).ToList();
            double zMin = zs.Min(), zMax = zs.Max(), tol = TolMm / FtToMm;
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                .Where(l => l.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.AsInteger() == 1
                            && l.ProjectElevation >= zMin - tol && l.ProjectElevation <= zMax + tol)
                .OrderBy(l => l.ProjectElevation).ToList();
            var f = new ShellFacts { MassUid = mass.UniqueId, MassLabel = "mass " + mass.Id.IdValue() };
            f.Levels.AddRange(levels.Select(l => (l.Name, l.Elevation * FtToMm)));
            if (levels.Count > 0)
            {
                f.RiseMm = (zMax - levels[levels.Count - 1].ProjectElevation) * FtToMm;
                f.BelowMm = (levels[0].ProjectElevation - zMin) * FtToMm;
            }
            for (int i = 0; i + 1 < levels.Count; i++)
            {
                Level a = levels[i], b = levels[i + 1];
                try
                {
                    var bottom = SectionAt(solid, a.ProjectElevation + CutMm / FtToMm, out var whyBottom);
                    var top = SectionAt(solid, b.ProjectElevation - CutMm / FtToMm, out var whyTop);
                    f.Storeys.Add((bottom, top, whyBottom != null ? $"the mass {whyBottom} 10 mm above {a.Name} — a person decides"
                                              : whyTop != null ? $"the mass {whyTop} 10 mm below {b.Name} — a person decides" : null));
                }
                catch (Exception ex) { f.Storeys.Add((null, null, $"Revit could not cut the mass at {a.Name} — {ex.Message}")); }
            }

            // Amendment 6c: wall types grouped by name, case-insensitive, a basic one first (ResolveWallType's pick); a basic one's width only.
            foreach (var g in new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase))
            {
                var t = g.FirstOrDefault(x => x.Kind == WallKind.Basic) ?? g.First();
                f.WallTypes[g.Key] = (t.Kind.ToString(), t.Kind == WallKind.Basic ? t.Width * FtToMm : 0);
            }
            foreach (var t in new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(t => !t.IsFoundationSlab)) f.FloorTypes.Add(t.Name);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Roofs).WhereElementIsElementType().OfType<RoofType>()) f.RoofTypes.Add(t.Name);
            return f;
        }

        /// <summary>The mass's solids (its instance geometry walked), united — or null and why: a mesh, no solid, or forms Revit could not join.</summary>
        internal static Solid SolidOf(Element e, out string why)
        {
            why = null;
            var solids = new List<Solid>();
            bool mesh = false;
            void Walk(GeometryElement ge)
            {
                foreach (var o in ge)
                {
                    if (o is Solid s && s.Volume > 1e-9) solids.Add(s);
                    else if (o is Mesh) mesh = true;
                    else if (o is GeometryInstance gi) Walk(gi.GetInstanceGeometry());
                }
            }
            var geo = e.get_Geometry(new Options { DetailLevel = ViewDetailLevel.Fine });
            if (geo != null) Walk(geo);
            if (solids.Count == 0) { why = mesh ? "the mass is a mesh, not a solid — Revit cannot cut it; a person decides" : "the mass has no solid"; return null; }
            var u = solids[0];
            try { for (int i = 1; i < solids.Count; i++) u = BooleanOperationsUtils.ExecuteBooleanOperation(u, solids[i], BooleanOperationsType.Union); }
            catch (Exception ex) { why = $"its {solids.Count} forms could not be joined — {ex.Message}"; return null; }
            return u;
        }

        /// <summary>The solid's section at <paramref name="zFt"/> (model frame): the one downward planar face the cut leaves there, one loop of
        /// straight edges, as its points in plan (mm) — or null and why ("does not reach", "cuts into N pieces", "has a hole (a courtyard)",
        /// "has a curved edge"). A throw is the caller's (the storey is held).</summary>
        internal static List<double[]> SectionAt(Solid s, double zFt, out string why)
        {
            why = null;
            var above = BooleanOperationsUtils.CutWithHalfSpace(s, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, new XYZ(0, 0, zFt)));
            // Amendment 6b: a plane that misses the solid gives null, not a section.
            var faces = above == null ? new List<PlanarFace>()
                : above.Faces.OfType<PlanarFace>().Where(fc => fc.FaceNormal.Z < -0.9999 && Math.Abs(fc.Origin.Z - zFt) < 1e-6).ToList();
            if (faces.Count == 0) { why = "does not reach"; return null; }
            if (faces.Count > 1) { why = $"cuts into {faces.Count} pieces"; return null; }
            var loops = faces[0].GetEdgesAsCurveLoops();
            if (loops.Count > 1) { why = "has a hole (a courtyard)"; return null; }
            var pts = new List<double[]>();
            foreach (var c in loops[0])
            {
                if (!(c is Line)) { why = "has a curved edge"; return null; }
                var p = c.GetEndPoint(0);
                pts.Add(new[] { p.X * FtToMm, p.Y * FtToMm });
            }
            return pts;
        }
    }
}
