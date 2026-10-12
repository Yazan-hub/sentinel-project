#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// MA-6-10 (MAS-3): where the photo mass stands, picked in Revit. Pick returns the straight edges of the outline in internal mm
    /// (MassingPlanner.Chain joins them into one loop); Centre is the point the footprint's centre goes to. Both run in Execute, a valid API context.
    /// </summary>
    public static class FootprintPicker
    {
        private const double MmPerFoot = 304.8;
        private const double PickTolMm = 10; // the picked point must lie this close to a closed polyline's edge

        /// <summary>Allows the things a footprint can be read from: a CAD import, a model line, a property line. PointOnElement asks for the reference too.</summary>
        private sealed class FootprintSource : ISelectionFilter
        {
            public bool AllowElement(Element e) => e is ImportInstance || e is ModelCurve || e is PropertyLine;
            public bool AllowReference(Reference r, XYZ p) => true;
        }

        private static double[] Mm(XYZ p) => new[] { p.X * MmPerFoot, p.Y * MmPerFoot };

        private static (double[] A, double[] B)? Edge(Curve c, out string why)
        {
            why = null;
            if (c == null || !c.IsBound) return null;
            if (c is not Line) { why = "the footprint has a curved edge — Sentinel takes straight edges only"; return null; }
            return (Mm(c.GetEndPoint(0)), Mm(c.GetEndPoint(1)));
        }

        /// <summary>The footprint's edges, or null: <paramref name="why"/> says why, or is null when the person pressed Esc.</summary>
        public static List<(double[] A, double[] B)> Pick(UIDocument uidoc, out string from, out string why)
        {
            from = null; why = null;
            var doc = uidoc.Document;
            var curves = new List<Curve>();

            // Pre-selected model lines or a property line are used as they are.
            var chosen = uidoc.Selection.GetElementIds().Select(doc.GetElement).Where(e => e is ModelCurve || e is PropertyLine).ToList();
            if (chosen.Count > 0)
            {
                foreach (var e in chosen) AddCurves(e, new Options(), curves);
                bool prop = chosen.All(e => e is PropertyLine);
                from = prop ? "the property line" : $"{chosen.Count} model lines";
                if (curves.Count == 0) { why = "this property line gives no edges — select model lines along it"; return null; }
                return Edges(curves, ref why);
            }

            Reference r;
            try { r = uidoc.Selection.PickObject(ObjectType.PointOnElement, new FootprintSource(), "Pick the footprint's closed CAD polyline"); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return null; } // Esc: nothing said
            var picked = doc.GetElement(r);

            if (picked is ImportInstance imp)
            {
                // A view-specific ("Current view only") import gives no geometry without its view.
                // MA-6-10 review: Options.View throws on null, so it is set only when there is a view.
                var opt = new Options();
                if (imp.ViewSpecific)
                {
                    if (doc.GetElement(imp.OwnerViewId) is not ViewPlan ov) { why = "this CAD import sits in a view that is not a plan — import it into a plan view, or untick \"Current view only\""; return null; }
                    opt.View = ov;
                }
                var geo = imp.get_Geometry(opt);
                var at = Mm(r.GlobalPoint);
                var best = (poly: (IList<XYZ>)null, layer: (string)null, d: PickTolMm + 1e-9);
                void Consider(PolyLine pl, Transform t)
                {
                    var pts = (t == null ? pl.GetCoordinates() : pl.GetTransformed(t).GetCoordinates());
                    if (pts.Count < 4 || pts[0].DistanceTo(pts[pts.Count - 1]) >= doc.Application.ShortCurveTolerance) return; // closed only
                    for (int i = 0; i < pts.Count - 1; i++)
                    {
                        double d = Dist(at, Mm(pts[i]), Mm(pts[i + 1]));
                        if (d < best.d)
                        {
                            string layer = doc.GetElement(pl.GraphicsStyleId) is GraphicsStyle g && g.GraphicsStyleCategory != null ? g.GraphicsStyleCategory.Name : null;
                            best = (pts, layer, d);
                        }
                    }
                }
                if (geo != null)
                    foreach (GeometryObject o in geo)
                    {
                        if (o is GeometryInstance gi)
                        {
                            var sym = gi.GetSymbolGeometry();
                            if (sym == null) continue;
                            foreach (GeometryObject n in sym) if (n is PolyLine pl) Consider(pl, gi.Transform); // nested inserts are skipped
                        }
                        else if (o is PolyLine pl2) Consider(pl2, null);
                    }
                if (best.poly == null)
                {
                    why = ArcNear(geo, at)
                        ? "the footprint has a curved edge — Sentinel takes straight edges only"
                        : "the curve you picked is not a closed polyline — join it in CAD (PEDIT), or select model lines along it first";
                    return null;
                }
                from = "a closed CAD polyline" + (best.layer == null ? "" : $" on layer {MassingPlanner.CadName(best.layer)}");
                var edges = new List<(double[] A, double[] B)>();
                for (int i = 0; i < best.poly.Count - 1; i++) edges.Add((Mm(best.poly[i]), Mm(best.poly[i + 1])));
                return edges;
            }

            if (picked is PropertyLine) { AddCurves(picked, new Options(), curves); from = "the property line"; if (curves.Count == 0) { why = "this property line gives no edges — select model lines along it"; return null; } return Edges(curves, ref why); }
            why = "a single model line is not an outline — select the model lines along it first, then run Photo Massing again";
            return null;
        }

        /// <summary>MA-6-10 review: a DWG polyline with a bulge arrives as separate Line and Arc curves, never a PolyLine - an Arc at the picked point says "curved edge".</summary>
        private static bool ArcNear(GeometryElement geo, double[] at)
        {
            bool Near(Arc a, Transform t)
            {
                var c = t == null ? (Curve)a : a.CreateTransformed(t);
                return c.Tessellate().Any(p => Mm(p) is var m && Math.Sqrt(Math.Pow(m[0] - at[0], 2) + Math.Pow(m[1] - at[1], 2)) <= PickTolMm * 2);
            }
            if (geo == null) return false;
            foreach (GeometryObject o in geo)
            {
                if (o is Arc a0 && Near(a0, null)) return true;
                if (o is GeometryInstance gi && gi.GetSymbolGeometry() is { } sym)
                    foreach (GeometryObject n in sym) if (n is Arc a1 && Near(a1, gi.Transform)) return true;
            }
            return false;
        }

        private static void AddCurves(Element e, Options opt, List<Curve> into)
        {
            if (e is ModelCurve mc) { into.Add(mc.GeometryCurve); return; }
            var geo = e.get_Geometry(opt);
            if (geo == null) return;
            foreach (GeometryObject o in geo) if (o is Curve c) into.Add(c);
        }

        private static List<(double[] A, double[] B)> Edges(List<Curve> curves, ref string why)
        {
            var edges = new List<(double[] A, double[] B)>();
            foreach (var c in curves)
            {
                var e = Edge(c, out string w);
                if (w != null) { why = w; return null; }
                if (e != null) edges.Add(e.Value);
            }
            return edges;
        }

        private static double Dist(double[] p, double[] a, double[] b)
        {
            double dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
            double t = l2 == 0 ? 0 : Math.Max(0, Math.Min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
            return Math.Sqrt(Math.Pow(p[0] - (a[0] + t * dx), 2) + Math.Pow(p[1] - (a[1] + t * dy), 2));
        }

        /// <summary>The point the footprint's centre goes to (internal mm), or null: Esc leaves it where it lies (<paramref name="why"/> null),
        /// or the view has no work plane to pick on (<paramref name="why"/> says so).</summary>
        public static double[] Centre(UIDocument uidoc, out string why)
        {
            why = null;
            try { return Mm(uidoc.Selection.PickPoint("Pick where the footprint's centre goes — Esc leaves it where it lies")); }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException) { return null; }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException) { why = "This view has no work plane to pick a point on — open a plan view, then run Photo Massing again."; return null; }
        }
    }
}
