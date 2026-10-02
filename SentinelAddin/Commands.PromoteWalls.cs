#nullable disable
// Promote (DD) — MA-0 walls (design §7.2) and Promote v1's floors, roofs, ceilings, doors and windows: the ribbon entry.
// Reads the levels and the facts of each class that runs in the active, bound document, loads the project's guideline@n
// and type_catalog@n (the DD rule file, installed like any guideline), plans with PromotePlanner (walls: PromoteWallsPlanner),
// asks Revit whether each retype is valid (a refused one is held, so one bad swap cannot roll back a storey), shows the plan
// per class (No = a read-only run), files one changeset per storey through the reviewed changeset path and opens the review
// on the first. Never plans on top of an unreviewed Promote changeset: that one is reopened instead. Nothing here writes to
// the model — the executor does, after a person ticks and clicks Apply.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class PromoteWallsCommand : IExternalCommand
{
    private const string Title = "Sentinel — Promote (DD)";
    private const double FtToMm = 304.8;
    // Promote v1's classes after walls: the changeset kind and the Revit category it reads.
    private static readonly (string Kind, BuiltInCategory Bic)[] Others =
    {
        ("floor", BuiltInCategory.OST_Floors), ("roof", BuiltInCategory.OST_Roofs), ("ceiling", BuiltInCategory.OST_Ceilings),
        ("door", BuiltInCategory.OST_Doors), ("window", BuiltInCategory.OST_Windows),
    };

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null || doc.IsFamilyDocument) return Result.Cancelled;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound);
            return Result.Cancelled;
        }
        var cfg = BcfConfig.Load();
        var key = ctx.Key;

        var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
        if (pending == null)
        {
            TaskDialog.Show(Title, $"Couldn't reach the bridge:\n{fetchErr}");
            return Result.Failed;
        }
        var unreviewed = pending.FirstOrDefault(p => p.Source == "promote");
        if (unreviewed != null)
            return ReviewChangesetsCommand.Open(c, doc, cfg, key, unreviewed) ? Result.Succeeded : Result.Cancelled;

        // The standards and the LOD matrix (off the API thread, the Annotate pattern), then the facts (on it).
        var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false)).GetAwaiter().GetResult();
        if (!standards.Guideline.HasGuideline)
        {
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return Result.Cancelled;
        }
        // MA-1a item 6, the office-template check: Promote retypes onto office types, so a model that holds none of them
        // was not made from the office template — said before anything is planned.
        var (officeHave, officeAll) = standards.Guideline.OfficeTypesIn(GhostBuilderCommand.LoadedTypes(doc));
        if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
        {
            TaskDialog.Show(Title, PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label));
            return Result.Cancelled;
        }
        var mxSource = mxTask.GetAwaiter().GetResult();
        LodMatrix mx = null;
        if (mxSource.Origin != "none")
        {
            mx = LodMatrix.FromBody(mxSource.BodyJson ?? "", out var mxErr); // a body it cannot read is none, never a partial matrix
            if (mxErr != null) mxSource = ArtefactClient.None("lod_matrix", $"{mxSource.Label} did not parse: {mxErr}");
        }
        var notRun = new List<string>();
        var classes = LodMatrix.Classes(mx, mxSource.Label, standards.Guideline, notRun);
        // With no matrix the header says "walls only"; otherwise each class left out is named below the plan.
        var header = standards.Header + "\n" + (mx == null ? notRun[0] : "LOD matrix: " + mxSource.Label + (mx.Draft ? " (DRAFT)" : ""));
        if (mx == null) notRun.Clear();
        header += "\n" + PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);

        var docTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // basic wall type → its Function
        foreach (var t in new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(t => t.Kind == WallKind.Basic))
            docTypes[t.Name] = t.Function.ToString();
        // The document's types per class, never across classes (BDS_INT_ARC_GYPS_50 mm is both a wall and a ceiling type).
        var classTypes = new Dictionary<string, IReadOnlyDictionary<string, double?>>(StringComparer.Ordinal);
        foreach (var (kind, bic) in Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category)))
        {
            var d = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>())
                d[ChangesetExecutor.TypeLabel(t)] = (t as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
            classTypes[PromoteWallsPlanner.Classes[kind].Category] = d;
        }
        var levels = ChangesetExecutor.Stories(doc); // the one projection of the model's levels (MA-1a review amendment C6)
        // Walls are read for doors too: a door's location reads its host storey's one-type verdict.
        var walls = classes.Contains("Walls") || classes.Contains("Doors")
            ? new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Select(w => Fact(doc, w)).ToList()
            : new List<WallFact>();
        var others = Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category))
            .SelectMany(o => new FilteredElementCollector(doc).OfCategory(o.Bic).WhereElementIsNotElementType().Select(e => OtherFact(doc, e, o.Kind)))
            .ToList();
        if ((classes.Contains("Walls") ? walls.Count : 0) + others.Count == 0)
        {
            TaskDialog.Show(Title, "Nothing to promote in this model." + (notRun.Count > 0 ? "\n\n" + string.Join("\n", notRun) : ""));
            return Result.Cancelled;
        }

        var plannerClock = System.Diagnostics.Stopwatch.StartNew(); // MA-1a item 8: the planner's own time, for the receipt
        var plans = PromotePlanner.Plan(classes, walls, others, levels, docTypes, classTypes, standards.Guideline);
        // Preflight: Revit's own answer on every retype before anything is filed — a refused ghost is held with the reason.
        PromotePlanner.Refuse(plans, g =>
        {
            try
            {
                var e = doc.GetElement(g.UniqueId);
                if (e == null) return $"{g.Label} is not in this model — re-run Promote";
                var nt = ChangesetExecutor.RetypeTarget(doc, e, g.Kind ?? "wall", g.FamilyName, g.TypeName);
                return ChangesetExecutor.Unsafe(e, g.Kind ?? "wall", doc.GetElement(e.GetTypeId()) as ElementType, nt)
                       ?? (e.IsValidType(nt.Id) ? null : $"\"{g.TypeName}\" is not a valid type for {g.Label} in Revit — a person decides");
            }
            catch (Exception ex) { return ex.Message; }
        });
        plannerClock.Stop();
        var actor = UserSession.Actor;
        var bodies = PromoteWallsPlanner.Bodies(plans, actor, title: classes.Count == 1 && classes[0] == "Walls" ? "Promote walls (DD)" : "Promote (DD)");

        // Elements, not reasons: one wall can be held for its type and for its top. DD now counts concept and settled
        // elements; those on the office's other types are left out of it and named on their own.
        var kindOf = others.ToDictionary(o => o.UniqueId, o => PromoteWallsPlanner.Classes[o.Kind].Category, StringComparer.Ordinal);
        string Cat(string uid) => uid != null && kindOf.TryGetValue(uid, out var k) ? k : "Walls";
        var lines = new List<string>();
        foreach (var p in plans)
        {
            if (classes.Contains("Walls") && p.Walls + p.OfficeTyped > 0)
                lines.Add($"{p.Storey}: {p.Ghosts.Count(g => g.Kind == null && g.Op == "retype")} retype · {p.Ghosts.Count(g => g.Op == "attach")} attach · " +
                          $"{p.Held.Where(h => Cat(h.UniqueId) == "Walls").Select(h => h.UniqueId).Distinct().Count()} wall(s) sent to a person · DD now {p.DdNow}/{p.Walls}" +
                          (p.OfficeTyped > 0 ? $" · {p.OfficeTyped} on other office types, left as is" : "") + $" · stamped by Promote {p.Stamped}");
            foreach (var cat in LodMatrix.Order.Where(p.Others.ContainsKey))
            {
                var n = p.Others[cat];
                lines.Add($"{p.Storey} · {cat}: {p.Ghosts.Count(g => g.Kind != null && Cat(g.UniqueId) == cat)} retype · " +
                          $"{p.Held.Where(h => Cat(h.UniqueId) == cat).Select(h => h.UniqueId).Distinct().Count()} sent to a person · DD now {n.DdNow}/{n.Total}" +
                          (n.OfficeTyped > 0 ? $" · {n.OfficeTyped} on other office types, left as is" : "") + $" · stamped by Promote {n.Stamped}");
            }
        }
        var ddNow = "DD now — " + string.Join(" · ", LodMatrix.Order.Where(classes.Contains).Select(cat => cat == "Walls"
            ? $"Walls {plans.Sum(p => p.DdNow)}/{plans.Sum(p => p.Walls)}"
            : $"{cat} {plans.Sum(p => p.Others.TryGetValue(cat, out var n) ? n.DdNow : 0)}/{plans.Sum(p => p.Others.TryGetValue(cat, out var n) ? n.Total : 0)}"));
        var asks = mx == null ? new List<string>() : LodMatrix.Order.Where(classes.Contains)
            .Where(cat => mx.Properties.TryGetValue(cat, out var ps) && ps.Count > 0).Select(cat => $"{cat}: {string.Join(", ", mx.Properties[cat])}").ToList();
        var held = plans.SelectMany(p => p.Held.Select(h => $"{p.Storey} · {h.Label}: {h.Reason}")).ToList();
        // A retype target whose Function in this model disagrees with the rule: once per type, for the office to fix.
        var notes = plans.SelectMany(p => p.Ghosts).Select(g => g.Note).Where(n => n != null).Distinct().ToList();
        var dlg = new TaskDialog(Title)
        {
            MainInstruction = bodies.Count == 0 ? "Nothing to file: no element needs a change Sentinel can propose."
                                                : $"File {bodies.Count} changeset(s)?",
            MainContent = header + (standards.Guideline.IsDraft ? "\nDRAFT rules: install them on a throwaway project only." : "") +
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow +
                          (asks.Count > 0 ? "\n\nDD also asks (listed for a person, not checked by Promote" + (mx.Draft ? "; DRAFT, decision LM-1" : "") + "):\n" + string.Join("\n", asks) : "") +
                          (notRun.Count > 0 ? "\n\n" + string.Join("\n", notRun) : "") +
                          (notes.Count > 0 ? "\n\nTemplate check (the office's template should fix these):\n" + string.Join("\n", notes) : "") +
                          (bodies.Count > 0 ? "\n\nNo = a read-only run: nothing is filed, nothing changes."
                           : held.Count > 0 ? "\n\nNothing is filed, so the elements sent to a person are listed only here, not on the ledger." : ""),
            CommonButtons = bodies.Count == 0 ? TaskDialogCommonButtons.Ok : TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
        };
        if (held.Count > 0)
            dlg.ExpandedContent = "Sent to a person:\n" + string.Join("\n", held.Take(40)) + (held.Count > 40 ? $"\n… and {held.Count - 40} more" : "");
        if (dlg.Show() != TaskDialogResult.Yes) return Result.Succeeded; // read-only run

        ChangesetDto first = null;
        var failed = new List<string>();
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
        foreach (var body in bodies)
        {
            var cs = ChangesetClient.Propose(cfg, key, body, out var err);
            if (cs == null) failed.Add(err);
            else { first ??= cs; filedIds.Add(cs.Id); }
        }
        if (filedIds.Count > 0)
        {
            // MA-1a item 8: the planner's build:run receipt for the run that filed these changesets — deterministic, so no
            // model and no tokens; its gaps are the elements it sent to a person.
            var receipt = new BuildReceipt.Facts { Seconds = plannerClock.Elapsed.TotalSeconds, Candidates = (classes.Contains("Walls") ? walls.Count : 0) + others.Count };
            receipt.Parameters["classes"] = classes.ToArray();
            receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
            receipt.Parameters["lod_matrix"] = mxSource.Label;
            GovernedNotify.Report("Promote receipt", BuildReceipt.Run("promote", BuildReceipt.AddinSha256, receipt,
                plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key);
        }
        if (failed.Count > 0)
            TaskDialog.Show(Title, $"{failed.Count} of {bodies.Count} changeset(s) were not filed:\n" + string.Join("\n", failed.Take(5)));
        if (first == null) return Result.Failed;
        return ReviewChangesetsCommand.Open(c, doc, cfg, key, first) ? Result.Succeeded : Result.Cancelled;
    }

    /// <summary>One wall's facts, read on the API thread. A stacked-wall member reads as not basic: Revit types it
    /// through its stacked wall, never alone.</summary>
    private static WallFact Fact(Document doc, Wall w)
    {
        var wt = w.WallType;
        string LevelOf(BuiltInParameter bip)
        {
            var id = w.get_Parameter(bip)?.AsElementId();
            return id == null || id == ElementId.InvalidElementId ? null : (doc.GetElement(id) as Level)?.Name;
        }
        double Mm(BuiltInParameter bip) => (w.get_Parameter(bip)?.AsDouble() ?? 0) * FtToMm;
        bool basic = wt?.Kind == WallKind.Basic && !w.IsStackedWallMember;
        return new WallFact
        {
            UniqueId = w.UniqueId,
            Label = "W " + w.Id.IdValue(),
            TypeName = wt?.Name,
            Function = basic ? wt.Function.ToString() : null,
            WidthMm = basic ? wt.Width * FtToMm : 0,
            BaseLevel = LevelOf(BuiltInParameter.WALL_BASE_CONSTRAINT),
            TopLevel = LevelOf(BuiltInParameter.WALL_HEIGHT_TYPE),
            BaseOffsetMm = Mm(BuiltInParameter.WALL_BASE_OFFSET),
            TopOffsetMm = Mm(BuiltInParameter.WALL_TOP_OFFSET),
            HeightMm = Mm(BuiltInParameter.WALL_USER_HEIGHT_PARAM),
            IsBasic = basic,
            InGroup = w.GroupId != ElementId.InvalidElementId,
            InOption = w.DesignOption != null,
            Structural = w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)?.AsInteger() == 1,
            Stamp = ProvenanceStamp.Read(w),
        };
    }

    /// <summary>A floor's, roof's, ceiling's, door's or window's facts, read on the API thread. Sizes come from the TYPE
    /// (a door's Width/Height on its symbol; a system type's compound structure), so a stale plan is caught by its type.</summary>
    private static ElementFact OtherFact(Document doc, Element e, string kind)
    {
        var type = doc.GetElement(e.GetTypeId()) as ElementType;
        string LevelName(ElementId id) => id == null || id == ElementId.InvalidElementId ? null : (doc.GetElement(id) as Level)?.Name;
        var mark = e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString();
        var f = new ElementFact
        {
            Kind = kind, UniqueId = e.UniqueId,
            Label = PromoteWallsPlanner.Classes[kind].Word + " " + e.Id.IdValue() + (string.IsNullOrWhiteSpace(mark) ? "" : " (" + mark + ")"),
            Family = type?.FamilyName, TypeName = type?.Name,
            // An extrusion roof has no LevelId: its reference level (verify live, B35-10).
            Level = LevelName(e.LevelId) ?? LevelName(e.get_Parameter(BuiltInParameter.ROOF_CONSTRAINT_LEVEL_PARAM)?.AsElementId()),
            InGroup = e.GroupId != ElementId.InvalidElementId, InOption = e.DesignOption != null,
            Stamp = ProvenanceStamp.Read(e),
            NotEditable = type == null ? "no type Sentinel can read" : null,
        };
        if (kind is "floor" or "roof" or "ceiling")
        {
            if (e is not HostObject || type is not HostObjAttributes h) f.NotEditable ??= "an in-place family";
            else f.ThicknessMm = h.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
            if (kind == "floor")
            {
                f.Structural = e.get_Parameter(BuiltInParameter.FLOOR_PARAM_IS_STRUCTURAL)?.AsInteger() == 1;
                // The GovernedElementExtractor read of a type's Function (verify live on a FloorType, B35-10).
                var fn = type?.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
                if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer) f.Function = ((WallFunction)fn.AsInteger()).ToString();
            }
            return f;
        }
        if (e is not FamilyInstance fi) { f.NotEditable ??= "not a family instance"; return f; }
        if (fi.SuperComponent != null) f.NotEditable ??= "a nested shared component — its parent family decides its type";
        (f.WidthMm, f.HeightMm) = ChangesetExecutor.TypeSize(fi.Symbol, kind);
        if (fi.Host is Wall hw)
        {
            f.HostTypeName = hw.WallType.Name;
            f.HostBasic = hw.WallType.Kind == WallKind.Basic && !hw.IsStackedWallMember;
            f.HostFunction = f.HostBasic ? hw.WallType.Function.ToString() : null;
            f.HostLevel = LevelName(hw.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsElementId());
        }
        else if (fi.Host != null) f.HostCategory = fi.Host.Category?.Name ?? "an element with no category";
        return f;
    }
}
