using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Lifecycle MEP void manager, IFC-optimized. MEP models arrive as IFC drops
/// (linked RVT containing DirectShape elements) — the engine intersects those
/// solids (precise solid-solid boolean, BB pre-filter) with native walls/
/// floors, merges candidates within 150 mm on the same host, places tracked
/// 'Provision for Void' instances (BDS_Void_ID guid + BDS_Void_Status), and on
/// every re-scan reconciles existing voids against the new IFC drop:
/// moved MEP -> void coordinates updated; deleted MEP -> status 'Orphaned'.
/// Statuses: Pending -> Approved -> Cut, or Orphaned. All model writes run
/// on the EventHub.
/// </summary>
public static class MepVoidManager
{
    public const string PVoidId = "BDS_Void_ID";
    public const string PVoidStatus = "BDS_Void_Status";
    private const double MergeToleranceFt = 0.150 / 0.3048;   // 150 mm
    private const double MatchToleranceFt = 0.500 / 0.3048;   // re-scan pairing radius

    private static readonly BuiltInCategory[] HostCats =
    {
        BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors,
        BuiltInCategory.OST_StructuralFraming,
    };
    private static readonly BuiltInCategory[] MepCats =
    {
        BuiltInCategory.OST_DuctCurves, BuiltInCategory.OST_PipeCurves,
        BuiltInCategory.OST_CableTray, BuiltInCategory.OST_Conduit,
    };

    public sealed class VoidCandidate
    {
        public long HostId { get; set; }
        public string HostName { get; set; } = string.Empty;
        public List<long> MepIds { get; } = new List<long>();  // merged sources
        public string MepDescription { get; set; } = string.Empty;
        public string LinkName { get; set; } = string.Empty;
        public XYZ Point { get; set; } = XYZ.Zero;
        public double VolumeM3 { get; set; }
        public bool Placed { get; set; }
    }

    public sealed class ReconcileReport
    {
        public List<VoidCandidate> NewCandidates { get; } = new List<VoidCandidate>();
        public int Updated { get; set; }     // existing voids moved to new coordinates
        public int Orphaned { get; set; }    // MEP element gone -> flagged
        public int Unchanged { get; set; }
    }

    // ---------------- Detection (read-only) ----------------
    public static List<VoidCandidate> FindIntersections(Document doc)
    {
        var raw = new List<VoidCandidate>();
        var hosts = new FilteredElementCollector(doc)
            .WherePasses(new ElementMulticategoryFilter(HostCats))
            .WhereElementIsNotElementType()
            .Select(h => (El: h, Solid: ClashManager.GetMainSolid(h), Box: h.get_BoundingBox(null)))
            .Where(h => h.Box is not null)
            .ToList();
        if (hosts.Count == 0) return raw;

        foreach (RevitLinkInstance link in new FilteredElementCollector(doc)
                     .OfClass(typeof(RevitLinkInstance)).Cast<RevitLinkInstance>())
        {
            var linkDoc = link.GetLinkDocument();
            if (linkDoc is null) continue;
            var tf = link.GetTotalTransform();

            // IFC drop = DirectShape elements; native RVT MEP links kept as
            // a secondary source. Both BuiltInCategory/class based.
            var targets = new FilteredElementCollector(linkDoc).OfClass(typeof(DirectShape))
                .Cast<Element>()
                .Concat(new FilteredElementCollector(linkDoc)
                    .WherePasses(new ElementMulticategoryFilter(MepCats))
                    .WhereElementIsNotElementType());

            foreach (var mep in targets)
            {
                var bb = mep.get_BoundingBox(null);
                if (bb is null) continue;
                var mepBox = ClashManager.TransformBox(bb, tf);

                Solid? mepSolid = null;                        // lazy: only if BB hits
                foreach (var host in hosts)
                {
                    if (!ClashManager.BoxesIntersect(host.Box!, mepBox)) continue;
                    mepSolid ??= ClashManager.GetMainSolid(mep, tf);
                    if (mepSolid is null || host.Solid is null) continue;

                    try
                    {
                        var inter = BooleanOperationsUtils.ExecuteBooleanOperation(
                            host.Solid, mepSolid, BooleanOperationsType.Intersect);
                        if (inter is null || inter.Volume < 1e-9) continue;

                        var c = new VoidCandidate
                        {
                            HostId = host.El.Id.IdValue(),
                            HostName = host.El.RuleTargetName(),
                            MepDescription = mep.RuleTargetName(),
                            LinkName = link.Name,
                            Point = inter.ComputeCentroid(),
                            VolumeM3 = Math.Round(inter.Volume * Math.Pow(0.3048, 3), 4),
                        };
                        c.MepIds.Add(mep.Id.IdValue());
                        raw.Add(c);
                    }
                    catch (Autodesk.Revit.Exceptions.ApplicationException) { }
                }
            }
        }
        return MergeByProximity(raw);
    }

    /// 150 mm proximity merge per host: several IFC elements crossing the same
    /// wall zone produce ONE combined void.
    private static List<VoidCandidate> MergeByProximity(List<VoidCandidate> raw)
    {
        var merged = new List<VoidCandidate>();
        foreach (var hostGroup in raw.GroupBy(c => c.HostId))
        {
            var pool = hostGroup.ToList();
            while (pool.Count > 0)
            {
                var seed = pool[0];
                pool.RemoveAt(0);
                var cluster = new List<VoidCandidate> { seed };
                bool grew = true;
                while (grew)
                {
                    grew = false;
                    for (int i = pool.Count - 1; i >= 0; i--)
                        if (cluster.Any(m => m.Point.DistanceTo(pool[i].Point) <= MergeToleranceFt))
                        { cluster.Add(pool[i]); pool.RemoveAt(i); grew = true; }
                }
                if (cluster.Count == 1) { merged.Add(seed); continue; }

                var combined = new VoidCandidate
                {
                    HostId = seed.HostId,
                    HostName = seed.HostName,
                    LinkName = seed.LinkName,
                    MepDescription = cluster.Count + " merged: " +
                        string.Join(", ", cluster.Select(c => c.MepDescription).Distinct().Take(4)),
                    Point = new XYZ(cluster.Average(c => c.Point.X),
                                    cluster.Average(c => c.Point.Y),
                                    cluster.Average(c => c.Point.Z)),
                    VolumeM3 = Math.Round(cluster.Sum(c => c.VolumeM3), 4),
                };
                foreach (var c in cluster) combined.MepIds.AddRange(c.MepIds);
                merged.Add(combined);
            }
        }
        return merged;
    }

    // ---------------- Lifecycle reconciliation ----------------
    /// <summary>Compare fresh candidates against voids already placed in the
    /// model. Moved MEP -> relocate void; missing MEP -> Orphaned; match ->
    /// unchanged. Returns report + the truly-new candidates. Must run on the
    /// EventHub (writes locations/statuses).</summary>
    public static void Reconcile(Action<ReconcileReport> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            var report = new ReconcileReport();
            if (doc is null) { onDone(report); return; }

            var fresh = FindIntersections(doc);

            var existing = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_GenericModel)
                .WhereElementIsNotElementType()
                .Where(e => e.LookupParameter(PVoidId)?.AsString() is { Length: > 0 })
                .Cast<Element>().OfType<FamilyInstance>()
                .ToList();

            using var t = new Transaction(doc, "Sentinel: Reconcile MEP voids");
            t.Start();

            var unmatchedFresh = new List<VoidCandidate>(fresh);
            foreach (var inst in existing)
            {
                // Never relocate voids that are already physically cut — the
                // opening exists in concrete; moving the marker would lie.
                var status = inst.LookupParameter(PVoidStatus)?.AsString();
                if (string.Equals(status, "Cut", StringComparison.OrdinalIgnoreCase))
                { report.Unchanged++; continue; }

                var loc = (inst.Location as LocationPoint)?.Point;
                if (loc is null) continue;

                var match = unmatchedFresh
                    .OrderBy(c => c.Point.DistanceTo(loc))
                    .FirstOrDefault(c => c.Point.DistanceTo(loc) <= MatchToleranceFt);

                if (match is null)
                {
                    SetStatus(inst, "Orphaned");               // MEP element deleted in new drop
                    report.Orphaned++;
                    continue;
                }

                unmatchedFresh.Remove(match);
                var drift = match.Point.DistanceTo(loc);
                if (drift > 0.001)
                {
                    ElementTransformUtils.MoveElement(doc, inst.Id, match.Point - loc);
                    report.Updated++;                          // MEP moved: follow it
                }
                else report.Unchanged++;
            }
            t.Commit();

            report.NewCandidates.AddRange(unmatchedFresh);
            if (report.Updated + report.Orphaned > 0)
                RoiTracker.Log("mepvoid", report.Updated + " void(s) relocated, " +
                                          report.Orphaned + " orphaned (IFC iteration)");
            onDone(report);
        });
    }

    // ---------------- Placement (tracked) ----------------
    public static void PlaceVoids(List<VoidCandidate> candidates, Action<int, int> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            if (doc is null) { onDone(0, candidates.Count); return; }

            var symbol = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_GenericModel)
                .OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>()
                .FirstOrDefault(fs =>
                    fs.FamilyName.IndexOf("Void", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    fs.FamilyName.IndexOf("Provision", StringComparison.OrdinalIgnoreCase) >= 0);
            if (symbol is null) { onDone(0, candidates.Count); return; }

            int placed = 0;
            using var t = new Transaction(doc, "Sentinel: Place provision-for-void");
            t.Start();
            if (!symbol.IsActive) symbol.Activate();
            foreach (var c in candidates)
            {
                try
                {
                    var inst = doc.Create.NewFamilyInstance(c.Point, symbol,
                        Autodesk.Revit.DB.Structure.StructuralType.NonStructural);
                    inst.LookupParameter(PVoidId)?.Set(Guid.NewGuid().ToString());
                    SetStatus(inst, "Pending");
                    c.Placed = true;
                    placed++;
                }
                catch (Autodesk.Revit.Exceptions.ApplicationException) { }
            }
            t.Commit();

            if (placed > 0)
                RoiTracker.Log("mepvoid", placed + " tracked provision-for-void instance(s) placed");
            onDone(placed, candidates.Count - placed);
        });
    }

    private static void SetStatus(Element e, string status)
    {
        var p = e.LookupParameter(PVoidStatus);
        if (p is not null && !p.IsReadOnly && p.StorageType == StorageType.String)
            p.Set(status);
    }
}
