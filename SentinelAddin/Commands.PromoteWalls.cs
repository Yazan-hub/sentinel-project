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
using Sentinel.Standards; // TypeHarvest (MA-2a: the build-up's material label)
using Sentinel.Workflow;  // NamingManagerService.LayerMaterials

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

        // The standards, the LOD matrix and (MA-2b) its DD stage IDS, off the API thread (the Annotate pattern) — PromoteContext, which
        // the review's check before commit reads too — then the facts (on it).
        var pc = Task.Run(() => PromoteContext.Fetch(key)).GetAwaiter().GetResult();
        var standards = pc.Standards;
        if (!standards.Guideline.HasGuideline)
        {
            TaskDialog.Show(Title, $"Guideline: {standards.GuidelineSource.Label}\n\nNo DD rule file is installed for \"{key}\" or its office — nothing to plan. Install one as guideline@n.");
            return Result.Cancelled;
        }
        // MA-1a item 6, the office-template check: Promote retypes onto office types, so a model that holds none of them
        // was not made from the office template — said before anything is planned.
        var (officeHave, officeAll) = standards.Guideline.OfficeTypesIn(GhostBuilderCommand.HeldTypes(doc)); // F-MA2a-4: every type the model holds
        if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
        {
            TaskDialog.Show(Title, PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label));
            return Result.Cancelled;
        }
        LodMatrix mx = pc.Mx;
        var notRun = pc.NotRun.ToList();
        var classes = pc.Classes;
        // With no matrix the header says "walls only"; otherwise each class left out is named below the plan.
        var header = standards.Header + "\n" + (mx == null ? notRun[0] : "LOD matrix: " + pc.MxLabel + (mx.Draft ? " (DRAFT)" : ""));
        if (mx == null) notRun.Clear();
        header += "\n" + PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);

        var (walls, others, docTypes, classTypes, levels) = ReadFacts(doc, classes);
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
        // MA-2c (design §3.3 op 4): the DD properties of the DD types the plan lands elements on, read on their TYPE (API thread,
        // read-only) — empty ones filled from a cited source as a set_parameter type edit, else sent to a person and counted.
        PropertyReport props = mx == null ? null
            : PropertyPlanner.Plan(plans, mx, TypeValues(doc, PropertyPlanner.DdTypes(plans, mx), mx), standards.Guideline, pc.Clauses);
        plannerClock.Stop();
        var actor = UserSession.Actor;
        // MA-2b, design §3.4 step 2: the LOD state now — one lod_state row per run, the read-only one too (the gate reads it).
        // A read that throws (one element's parameter read) is said and posts no row — never the end of Promote (review).
        LodStateReport lod = null;
        string lodErr = null;
        try { lod = LodStateOf(doc, plans, pc, "now"); }
        catch (Exception ex) { lodErr = ex.Message; }
        if (lod != null) GovernedNotify.Report("LOD state now", CommandReports.LodState(lod, null, actor), key);
        var lodLines = lod == null ? new List<string>() : lod.LevelLines();
        var lodText = lodErr != null ? "LOD state: not read — " + lodErr
            : lod == null ? $"LOD state: not measured — no lod_matrix@n to measure against ({pc.MxLabel})"
            : "LOD state now (sent to the ledger — the pane's Doctor log says whether it was recorded): " + lod.Line + "\n" + string.Join("\n", lodLines.Take(12)) + (lodLines.Count > 12 ? $"\n… and {lodLines.Count - 12} more" : "");
        // MA-2c (design §6.4): the run's type gaps — the held elements the office has no type for, grouped — as one type_gap row (the
        // Holding Area lists each group until a lead dismisses it or a catalogue with the type is installed); the read-only run too.
        var gaps = TypeGaps.Group(plans);
        if (gaps.Count > 0) GovernedNotify.Report("Type gaps", CommandReports.TypeGaps(gaps, standards.CatalogSource.Label, standards.GuidelineSource.Label, actor), key);
        var gapText = gaps.Count == 0 ? ""
            : $"\n\nType gaps (sent to the ledger — the Holding Area lists them; the pane's Doctor log says whether it was recorded): {gaps.Count} group(s), {gaps.Sum(g => g.Elements)} element(s)\n" +
              string.Join("\n", gaps.Take(8).Select(TypeGaps.Line)) + (gaps.Count > 8 ? $"\n… and {gaps.Count - 8} more" : "");
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
        var held = plans.SelectMany(p => p.Held.Concat(p.ToPerson).Select(h => $"{p.Storey} · {h.Label}: {h.Reason}")).ToList();
        var propLines = props == null || props.Rows.Count == 0 ? new List<string>() : props.Lines();
        var propText = props == null ? "" : props.Rows.Count == 0 ? "\n\nDD properties: every one the DD types hold is filled, or the matrix asks none Sentinel reads on a type"
            : "\n\n" + props.Line + " — " + pc.Clauses.Label + "\n" + string.Join("\n", propLines.Take(12)) + (propLines.Count > 12 ? $"\n… and {propLines.Count - 12} more" : "");
        // A retype target whose Function in this model disagrees with the wall's side as the rule decided it: once per type, for the office to fix.
        var notes = plans.SelectMany(p => p.Ghosts).Select(g => g.Note).Where(n => n != null).Distinct().ToList();
        var dlg = new TaskDialog(Title)
        {
            MainInstruction = bodies.Count == 0 ? "Nothing to file: no element needs a change Sentinel can propose."
                                                : $"File {bodies.Count} changeset(s)?",
            MainContent = header + (standards.Guideline.IsDraft ? "\nDRAFT rules: install them on a throwaway project only." : "") +
                          "\n\n" + string.Join("\n", lines) + "\n\n" + ddNow + "\n" + lodText + propText + gapText +
                          (asks.Count > 0 ? "\n\nDD also asks (the DD IDS: counted in the LOD state, checked again before commit" + (mx.Draft ? "; DRAFT, decision LM-1" : "") + "):\n" + string.Join("\n", asks) +
                                            (pc.Ids == null ? "\nDD IDS: not read — " + pc.IdsWhy : pc.Ids.Unmatched.Count > 0 ? "\nNot in the DD IDS: " + string.Join("; ", pc.Ids.Unmatched) : "") : "") +
                          (notRun.Count > 0 ? "\n\n" + string.Join("\n", notRun) : "") +
                          (notes.Count > 0 ? "\n\nTemplate check (the office's template should fix these):\n" + string.Join("\n", notes) : "") +
                          (bodies.Count > 0 ? "\n\nNo = a read-only run: nothing is filed, nothing in the model changes" + (lod != null ? " (the LOD state above was sent to the ledger)." : ".")
                           : held.Count > 0 ? "\n\nNothing is filed, so the elements sent to a person are listed only here, not on the ledger." : ""),
            CommonButtons = bodies.Count == 0 ? TaskDialogCommonButtons.Ok : TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No,
        };
        if (held.Count > 0)
            dlg.ExpandedContent = "Sent to a person:\n" + string.Join("\n", held.Take(40)) + (held.Count > 40 ? $"\n… and {held.Count - 40} more" : "");
        if (dlg.Show() != TaskDialogResult.Yes) return Result.Succeeded; // read-only run

        ChangesetDto first = null;
        var failed = new List<string>();
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
        var typeEditsNotFiled = 0;
        foreach (var body in bodies)
        {
            var cs = ChangesetClient.Propose(cfg, key, body, out var err);
            // Review amendment C4: a set_parameter the bridge refuses (its source not confirmed now, or a bridge older than the op) never
            // costs the storey its retypes and attaches — the body is filed again without its type edits, each one an exception that
            // says why. Only a second refusal counts as not filed; a body of type edits only is not filed again.
            if (cs == null && err != null && err.StartsWith("Bridge 400:") && err.Contains("set_parameter") && PropertyPlanner.WithoutWrites(body, err, out var dropped) is object again)
            {
                cs = ChangesetClient.Propose(cfg, key, again, out err);
                if (cs != null) typeEditsNotFiled += dropped;
            }
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
            receipt.Parameters["lod_matrix"] = pc.MxLabel;
            GovernedNotify.Report("Promote receipt", BuildReceipt.Run("promote", BuildReceipt.AddinSha256, receipt,
                plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key);
        }
        if (failed.Count > 0 || typeEditsNotFiled > 0)
            TaskDialog.Show(Title, (typeEditsNotFiled > 0 ? $"{typeEditsNotFiled} type edit(s) not filed — see Sent to a person (the bridge refused their source; a person fills them in Revit)\n" : "") +
                                   (failed.Count > 0 ? $"{failed.Count} of {bodies.Count} changeset(s) were not filed:\n" + string.Join("\n", failed.Take(5)) : ""));
        if (first == null) return Result.Failed;
        return ReviewChangesetsCommand.Open(c, doc, cfg, key, first) ? Result.Succeeded : Result.Cancelled;
    }

    /// <summary>The facts Promote plans from, read on the API thread for the classes that run: the walls (read for doors too: a door's
    /// location reads its host storey's one-type verdict), the other classes' elements, the document's basic wall types → their
    /// Function, its types per class (never across classes: BDS_INT_ARC_GYPS_50 mm is both a wall and a ceiling type) → build-up
    /// mm, and its story levels. MA-2b: Promote's run and the LOD state after a Promote changeset read them the same way.</summary>
    internal static (List<WallFact> Walls, List<ElementFact> Others, Dictionary<string, string> DocTypes,
                     Dictionary<string, IReadOnlyDictionary<string, double?>> ClassTypes, List<LevelFact> Levels) ReadFacts(Document doc, IReadOnlyCollection<string> classes)
    {
        var docTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); // basic wall type → its Function
        foreach (var t in new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(t => t.Kind == WallKind.Basic))
            docTypes[t.Name] = t.Function.ToString();
        var classTypes = new Dictionary<string, IReadOnlyDictionary<string, double?>>(StringComparer.Ordinal);
        foreach (var (kind, bic) in Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category)))
        {
            var d = new Dictionary<string, double?>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>())
                d[ChangesetExecutor.TypeLabel(t)] = (t as HostObjAttributes)?.GetCompoundStructure() is CompoundStructure cs ? cs.GetWidth() * FtToMm : (double?)null;
            classTypes[PromoteWallsPlanner.Classes[kind].Category] = d;
        }
        var levels = ChangesetExecutor.Stories(doc); // the one projection of the model's levels (MA-1a review amendment C6)
        var walls = classes.Contains("Walls") || classes.Contains("Doors")
            ? new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>().Select(w => Fact(doc, w)).ToList()
            : new List<WallFact>();
        var others = Others.Where(o => classes.Contains(PromoteWallsPlanner.Classes[o.Kind].Category))
            .SelectMany(o => new FilteredElementCollector(doc).OfCategory(o.Bic).WhereElementIsNotElementType().Select(e => OtherFact(doc, e, o.Kind)))
            .ToList();
        return (walls, others, docTypes, classTypes, levels);
    }

    /// <summary>MA-2b (design §3.4 steps 2 and 10): the LOD state of these plans — the DD stage IDS judged, on the API thread and
    /// read-only, on every element whose DD rules pass and whose class asks for properties (read through GovernedElementExtractor,
    /// as the IDS reads an element). Null with no lod_matrix: there is nothing to measure against.</summary>
    internal static LodStateReport LodStateOf(Document doc, IReadOnlyList<StoreyPlan> plans, PromoteContext pc, string when)
    {
        if (pc.Mx == null) return null;
        string org = App.OrgFor(doc);
        var props = new Dictionary<string, StageIds.Verdict>(StringComparer.Ordinal);
        if (pc.Ids != null)
        {
            // Only the elements whose class has a specification; each judged against its own class's alone (review C2).
            var ruled = plans.SelectMany(p => p.Lod)
                .Where(f => f.RulesOk && pc.Ids.For(f.Category) != null)
                .Select(f => (f.UniqueId, Spec: pc.Ids.For(f.Category), Element: doc.GetElement(f.UniqueId))).Where(x => x.Element != null).ToList();
            var read = GovernedElementExtractor.ExtractByIds(doc, doc.Title, ruled.Select(x => x.Element.Id), org); // in the ids' order
            for (int i = 0; i < ruled.Count && i < read.Count; i++)
                props[ruled[i].UniqueId] = pc.Ids.Judge(read[i].identity.Class, StageIds.ValuesOf(read[i]), org, ruled[i].Spec);
        }
        var r = LodState.Read(plans, pc.Mx, pc.Ids, pc.IdsWhy, props, pc.NotRun);
        r.When = when;
        r.Matrix = pc.MxLabel;
        r.MatrixSha = pc.MxSha; // the gate and the journey read the row only while this matrix is in force (review C3)
        r.Guideline = pc.Standards.GuidelineSource.Label;
        r.Ids = pc.Ids != null ? "DD IDS made from " + pc.Ids.Matrix : "DD IDS not read — " + pc.IdsWhy;
        return r;
    }

    /// <summary>MA-2b, design §3.4 step 10: the LOD state after a Promote changeset was applied — the facts read again and planned
    /// again, as Promote reads them. API thread (the review's result handler runs inside the placement event).</summary>
    internal static LodStateReport LodStateAfter(Document doc, PromoteContext pc)
    {
        var (walls, others, docTypes, classTypes, levels) = ReadFacts(doc, pc.Classes);
        var plans = PromotePlanner.Plan(pc.Classes, walls, others, levels, docTypes, classTypes, pc.Standards.Guideline);
        return LodStateOf(doc, plans, pc, "after");
    }

    /// <summary>MA-2c: each DD type's matrix properties as Revit holds them on the TYPE — the parameter there, its value as the IDS
    /// reads it, why Sentinel could not write it — with the elements on the type now. API thread, read-only. A type the plan names
    /// that is not one type here (none, or two of that name) is not read, so nothing is written to it; a property the type does not
    /// hold (an instance parameter, a wall's IsExternal from its Function) is not listed.</summary>
    internal static List<TypeValue> TypeValues(Document doc, IReadOnlyList<(string Category, string Family, string Type)> types, LodMatrix mx)
    {
        var list = new List<TypeValue>();
        if (types.Count == 0) return list;
        string org = App.OrgFor(doc);
        var onType = new Dictionary<long, int>();
        foreach (var x in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            var tid = x.GetTypeId().IdValue();
            onType[tid] = onType.TryGetValue(tid, out var n) ? n + 1 : 1;
        }
        foreach (var (cat, family, type) in types)
        {
            var bic = cat == "Walls" ? BuiltInCategory.OST_Walls : Others.First(o => PromoteWallsPlanner.Classes[o.Kind].Category == cat).Bic;
            var hits = new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>()
                .Where(t => string.Equals(t.Name, type, StringComparison.OrdinalIgnoreCase)
                            && (family == null || string.Equals((t as FamilySymbol)?.FamilyName, family, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            if (hits.Count != 1) continue;
            foreach (var key in mx.Properties[cat])
            {
                var entry = PsetMap.Find(org, key);
                if (entry == null) continue; // no reader: the LOD state says "no Revit reader for …"
                var (p, current, noWriter) = FixInPlaceService.OnType(hits[0], doc, entry);
                if (p == null) continue;
                list.Add(new TypeValue
                {
                    Category = cat, Family = family, Type = type, UniqueId = hits[0].UniqueId, Key = key, Current = current,
                    Param = p.Definition.Name, NoWriter = noWriter, Instances = onType.TryGetValue(hits[0].Id.IdValue(), out var n) ? n : 0,
                });
            }
        }
        return list;
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
            // MA-2a: the facts the layer-free rules may see — the wall's line for the outer boundary (every wall, whatever its
            // type: it encloses), and a basic type's build-up materials.
            Line = WallLine(w),
            Material = basic ? TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, wt)) : null,
        };
    }

    /// <summary>MA-2a: the wall's location line in plan (mm) as WallLocation reads it — an arc's chord, flagged; null when the wall
    /// has no bound curve (it is then no barrier and its own location is unknown).</summary>
    private static WallLocation.Segment WallLine(Wall w)
    {
        var c = (w.Location as LocationCurve)?.Curve;
        if (c == null || !c.IsBound) return null;
        XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
        var wt = w.WallType;
        bool basic = wt?.Kind == WallKind.Basic && !w.IsStackedWallMember;
        return new WallLocation.Segment
        {
            X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm,
            WidthMm = basic ? wt.Width * FtToMm : 0,
            Curved = !(c is Line),
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
