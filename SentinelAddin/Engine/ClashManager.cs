using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Native clash engine: link-vs-host intersection detection with severity
/// grading. Read-only; view generation/coloring lives in ViewGenerator.
/// Severity: HARD = solid-solid intersection with meaningful volume,
/// MEDIUM = solid intersection with small volume (grazing), SOFT = bounding
/// boxes overlap but solids do not (proximity clash).
/// </summary>
public static class ClashManager
{
    public enum Severity { Soft, Medium, Hard }

    /// Solid intersection volume thresholds (m3).
    private const double HardVolumeM3 = 0.001;   // > 1 liter of shared volume
    private const double FtToM = 0.3048;

    public sealed class ClashItem
    {
        public long HostId { get; set; }
        public string HostName { get; set; } = string.Empty;
        public string HostCategory { get; set; } = string.Empty;
        public long OtherId { get; set; }
        public string OtherName { get; set; } = string.Empty;
        public string LinkName { get; set; } = string.Empty;
        public XYZ Location { get; set; } = XYZ.Zero;
        public Severity Grade { get; set; }
        public double VolumeM3 { get; set; }
        public string LocationText =>
            $"({Location.X * FtToM:F2}, {Location.Y * FtToM:F2}, {Location.Z * FtToM:F2}) m";
    }

    private static readonly BuiltInCategory[] HostCats =
    {
        BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors,
        BuiltInCategory.OST_StructuralFraming, BuiltInCategory.OST_StructuralColumns,
    };

    /// <summary>Run clash detection between all loaded links (RVT elements AND
    /// IFC DirectShape drops) and native structure. Read-only.</summary>
    public static List<ClashItem> Run(Document doc)
    {
        var clashes = new List<ClashItem>();
        var hosts = new FilteredElementCollector(doc)
            .WherePasses(new ElementMulticategoryFilter(HostCats))
            .WhereElementIsNotElementType()
            .Select(h => (Element: h, Solid: GetMainSolid(h), Box: h.get_BoundingBox(null)))
            .Where(h => h.Box is not null)
            .ToList();
        if (hosts.Count == 0) return clashes;

        foreach (RevitLinkInstance link in new FilteredElementCollector(doc)
                     .OfClass(typeof(RevitLinkInstance)).Cast<RevitLinkInstance>())
        {
            var linkDoc = link.GetLinkDocument();
            if (linkDoc is null) continue;
            var tf = link.GetTotalTransform();

            foreach (var other in CollectLinkTargets(linkDoc))
            {
                var obb = other.get_BoundingBox(null);
                if (obb is null) continue;
                var oBox = TransformBox(obb, tf);

                foreach (var host in hosts)
                {
                    if (!BoxesIntersect(host.Box!, oBox)) continue;

                    var grade = Severity.Soft;
                    double volM3 = 0;
                    XYZ point = BoxCentroid(host.Box!, oBox);

                    var otherSolid = GetMainSolid(other, tf);
                    if (host.Solid is not null && otherSolid is not null)
                    {
                        try
                        {
                            var inter = BooleanOperationsUtils.ExecuteBooleanOperation(
                                host.Solid, otherSolid, BooleanOperationsType.Intersect);
                            if (inter is not null && inter.Volume > 1e-9)
                            {
                                volM3 = inter.Volume * FtToM * FtToM * FtToM;
                                grade = volM3 >= HardVolumeM3 ? Severity.Hard : Severity.Medium;
                                point = inter.ComputeCentroid();
                            }
                        }
                        catch (Autodesk.Revit.Exceptions.ApplicationException)
                        { /* boolean failed: stay Soft */ }
                    }

                    clashes.Add(new ClashItem
                    {
                        HostId = host.Element.Id.IdValue(),
                        HostName = host.Element.RuleTargetName(),
                        HostCategory = host.Element.Category?.Name ?? "?",
                        OtherId = other.Id.IdValue(),
                        OtherName = other.RuleTargetName(),
                        LinkName = link.Name,
                        Location = point,
                        Grade = grade,
                        VolumeM3 = Math.Round(volM3, 4),
                    });
                }
            }
        }
        return clashes.OrderByDescending(c => c.Grade).ThenByDescending(c => c.VolumeM3).ToList();
    }

    /// MEP curves from RVT links + DirectShape from IFC drops (IFC link =
    /// DirectShape elements). BuiltInCategory-based: locale-invariant.
    private static IEnumerable<Element> CollectLinkTargets(Document linkDoc)
    {
        var mepCats = new[]
        {
            BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_PipeCurves,
            BuiltInCategory.OST_CableTray, BuiltInCategory.OST_Conduit,
        };
        foreach (var e in new FilteredElementCollector(linkDoc)
                     .WherePasses(new ElementMulticategoryFilter(mepCats))
                     .WhereElementIsNotElementType())
            yield return e;
        foreach (var e in new FilteredElementCollector(linkDoc).OfClass(typeof(DirectShape)))
            yield return e;
    }

    internal static Solid? GetMainSolid(Element e, Transform? tf = null)
    {
        var geo = e.get_Geometry(new Options { DetailLevel = ViewDetailLevel.Coarse });
        if (geo is null) return null;
        Solid? best = null;
        foreach (var obj in geo)
        {
            switch (obj)
            {
                case Solid s when s.Volume > 1e-9:
                    if (best is null || s.Volume > best.Volume) best = s;
                    break;
                case GeometryInstance gi:
                    foreach (var inner in gi.GetInstanceGeometry())
                        if (inner is Solid s2 && s2.Volume > 1e-9 && (best is null || s2.Volume > best.Volume))
                            best = s2;
                    break;
            }
        }
        if (best is not null && tf is not null && !tf.IsIdentity)
        {
            try { best = SolidUtils.CreateTransformed(best, tf); }
            catch (Autodesk.Revit.Exceptions.ApplicationException) { return null; }
        }
        return best;
    }

    internal static bool BoxesIntersect(BoundingBoxXYZ a, BoundingBoxXYZ b) =>
        a.Min.X <= b.Max.X && a.Max.X >= b.Min.X &&
        a.Min.Y <= b.Max.Y && a.Max.Y >= b.Min.Y &&
        a.Min.Z <= b.Max.Z && a.Max.Z >= b.Min.Z;

    internal static BoundingBoxXYZ TransformBox(BoundingBoxXYZ bb, Transform tf)
    {
        var min = tf.OfPoint(bb.Min); var max = tf.OfPoint(bb.Max);
        return new BoundingBoxXYZ
        {
            Min = new XYZ(Math.Min(min.X, max.X), Math.Min(min.Y, max.Y), Math.Min(min.Z, max.Z)),
            Max = new XYZ(Math.Max(min.X, max.X), Math.Max(min.Y, max.Y), Math.Max(min.Z, max.Z)),
        };
    }

    internal static XYZ BoxCentroid(BoundingBoxXYZ a, BoundingBoxXYZ b)
    {
        var min = new XYZ(Math.Max(a.Min.X, b.Min.X), Math.Max(a.Min.Y, b.Min.Y), Math.Max(a.Min.Z, b.Min.Z));
        var max = new XYZ(Math.Min(a.Max.X, b.Max.X), Math.Min(a.Max.Y, b.Max.Y), Math.Min(a.Max.Z, b.Max.Z));
        return (min + max) / 2.0;
    }
}
