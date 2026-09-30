#nullable disable
// MA-0 Promote walls v0 (design §7.2): the ribbon entry. Reads the walls and levels of the active, bound document,
// loads the project's guideline@n and type_catalog@n (the DD wall rule file, installed like any guideline), plans with
// PromoteWallsPlanner, shows the plan (No = a read-only run), files one changeset per storey through the reviewed
// changeset path and opens the review on the first. Never plans on top of an unreviewed Promote changeset: that one is
// reopened instead. Nothing here writes to the model — the executor does, after a person ticks and clicks Apply.
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
    private const string Title = "Sentinel — Promote walls (DD)";
    private const double FtToMm = 304.8;

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

        // The standards (off the API thread, the Annotate pattern), then the facts (on it).
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false)).GetAwaiter().GetResult();
        if (!standards.Guideline.HasGuideline)
        {
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return Result.Cancelled;
        }

        var docTypes = new HashSet<string>(new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => t.Kind == WallKind.Basic).Select(t => t.Name), StringComparer.OrdinalIgnoreCase);
        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().Select(l => new LevelFact
        {
            Name = l.Name, ElevationMm = l.Elevation * FtToMm,
            IsStory = l.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.AsInteger() == 1,
        }).ToList();
        var walls = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>()
            .Select(w => Fact(doc, w)).ToList();
        if (walls.Count == 0)
        {
            TaskDialog.Show(Title, "No walls in this model — nothing to promote.");
            return Result.Cancelled;
        }

        var plans = PromoteWallsPlanner.Plan(walls, levels, docTypes, standards.Guideline);
        var actor = Environment.UserName;
        var bodies = plans.SelectMany(p => PromoteWallsPlanner.Bodies(p, actor)).ToList();

        var lines = plans.Select(p =>
            $"{p.Storey}: {p.Ghosts.Count(g => g.Op == "retype")} retype · {p.Ghosts.Count(g => g.Op == "attach")} attach · " +
            $"{p.Held.Count} sent to a person · DD now {p.DdNow}/{p.Walls} · stamped {p.Stamped}");
        var held = plans.SelectMany(p => p.Held.Select(h => $"{p.Storey} · {h.Label}: {h.Reason}")).ToList();
        var d = new TaskDialog(Title)
        {
            MainInstruction = bodies.Count == 0 ? "Nothing to file: no wall needs a retype or an attach that Sentinel can propose."
                                                : $"File {bodies.Count} changeset(s)?",
            MainContent = standards.Header + "\n\n" + string.Join("\n", lines) +
                          (bodies.Count == 0 ? "" : "\n\nNo = a read-only run: nothing is filed, nothing changes."),
            CommonButtons = bodies.Count == 0 ? TaskDialogCommonButtons.Ok : TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
        };
        if (held.Count > 0)
            d.ExpandedContent = "Sent to a person:\n" + string.Join("\n", held.Take(40)) + (held.Count > 40 ? $"\n… and {held.Count - 40} more" : "");
        if (d.Show() != TaskDialogResult.Yes) return Result.Succeeded; // read-only run

        ChangesetDto first = null;
        var failed = new List<string>();
        foreach (var body in bodies)
        {
            var cs = ChangesetClient.Propose(cfg, key, body, out var err);
            if (cs == null) failed.Add(err);
            else first ??= cs;
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
            IsBasic = basic,
            InGroup = w.GroupId != ElementId.InvalidElementId,
            Stamp = ProvenanceStamp.Read(w),
        };
    }
}
