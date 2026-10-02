using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Selection;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Ghost Builder: pick a 2D DWG import, map its CAD layers to office families by the layers@n installed on the
/// document's web project (or its office) — labelled heuristics and the local LLM for the rest — review the
/// proposal, and build LOD 200 geometry typed by the project's guideline@n and type_catalog@n — WITHOUT freezing
/// the Revit UI. Each standard is named (kind@n · source · sha) in the review header and the build summary; one
/// not installed is named as none, never filled from a file beside the add-in (cohesion phase 4b-2).
///
/// Threading (this is the whole point of the command):
///   • Execute (API thread): resolve config, read the project key, pick DWG, extract inputs (reads), show a
///     modeless progress window, then RETURN immediately so Revit's UI stays live.
///   • Task.Run (background): the standards GET and the LLM HTTP calls — the slow, Revit-API-free steps; the
///     mapper and orchestrator are built there once the standards are known.
///     Cancellable via the window's ESC / Cancel (CancellationToken).
///   • Review (UI thread): the proposal is shown for approval — NOTHING is written until the user
///     ticks layers and clicks Build. Cancel/ESC ends the run having touched nothing (P3 gate).
///   • ExternalEvent (API thread): the build — planned, filed as changesets (source dwg) and placed by
///     ChangesetExecutor (GhostChangesetBuild, MA-1a step 2), the only place Revit API writes are legal.
///     Reads and writes never touch the background thread.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GhostBuilderCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        // 1. Resolve config (project ES -> machine JSON). Ghost paths are optional.
        var settings = SettingsManager.Resolve(doc);
        string? libraryDir = string.IsNullOrWhiteSpace(settings.GhostFamilyLibraryDir)
            ? null
            : settings.GhostFamilyLibraryDir;

        string schemaJson = "";
        if (!string.IsNullOrWhiteSpace(settings.GhostMappingSchemaPath))
        {
            if (!File.Exists(settings.GhostMappingSchemaPath))
            {
                TaskDialog.Show("Sentinel — Ghost Builder",
                    $"Mapping schema not found:\n{settings.GhostMappingSchemaPath}\n\n" +
                    "Fix the path in Project Setup, or clear it to run without a schema.");
                return Result.Cancelled;
            }
            schemaJson = File.ReadAllText(settings.GhostMappingSchemaPath);
        }

        if (libraryDir != null && !Directory.Exists(libraryDir))
        {
            TaskDialog.Show("Sentinel — Ghost Builder",
                $"Family library folder not found:\n{libraryDir}\n\n" +
                "Fix the path in Project Setup, or clear it to run without family preload.");
            return Result.Cancelled;
        }

        // 2. Acquire the DWG: folder-first (same GhostSourceFolder Datum reads), PickObject fallback.
        ImportInstance? cadLink = null;
        string? sourceSha = null; // MA-1a item 4: the drawing's sha256 — only when this run imports it (a reused import may be older, GHB-3)
        var folderDwgs = Directory.Exists(settings.GhostSourceFolder ?? "")
            ? Directory.EnumerateFiles(settings.GhostSourceFolder!, "*.*")
                .Where(f => f.EndsWith(".dwg", System.StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".dxf", System.StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f).ToList()
            : new List<string>();

        // Already-imported DWGs (by filename, sans extension) so the picker can flag them and a
        // re-run can reuse the existing import instead of importing the same drawing again.
        var existingImports = new FilteredElementCollector(doc).OfClass(typeof(ImportInstance))
            .Cast<ImportInstance>()
            .Select(imp => (Instance: imp, TypeName: doc.GetElement(imp.GetTypeId())?.Name))
            .Where(x => !string.IsNullOrEmpty(x.TypeName))
            .Select(x => (x.Instance, Name: Path.GetFileNameWithoutExtension(x.TypeName!)))
            .ToList();
        var existingImportNames = existingImports.Select(x => x.Name).ToList();

        bool pickFromModel = folderDwgs.Count == 0;
        if (folderDwgs.Count > 0)
        {
            var pick = new DwgPickWindow(folderDwgs, existingImportNames);
            new System.Windows.Interop.WindowInteropHelper(pick) { Owner = c.Application.MainWindowHandle };
            if (pick.ShowDialog() != true) return Result.Cancelled;
            pickFromModel = pick.PickFromModel;

            if (!pickFromModel && pick.SelectedPath is { } dwgPath)
            {
                // Re-running on the same drawing: reuse the ImportInstance already in the model
                // instead of importing (and duplicating) it again.
                var reuse = existingImports.FirstOrDefault(x =>
                    string.Equals(x.Name, Path.GetFileNameWithoutExtension(dwgPath), System.StringComparison.OrdinalIgnoreCase));
                if (reuse.Instance != null)
                {
                    cadLink = reuse.Instance;
                }
                else
                {
                    // Import needs a view that can actually host CAD geometry — the active view can
                    // be a schedule/legend/sheet etc. in which case fall back to any floor plan.
                    View importView = uidoc.ActiveView;
                    var unhostable = importView.ViewType is ViewType.Schedule or ViewType.Legend
                        or ViewType.DrawingSheet or ViewType.ProjectBrowser or ViewType.SystemBrowser
                        or ViewType.Internal or ViewType.Undefined or ViewType.ColumnSchedule or ViewType.PanelSchedule
                        or ViewType.ThreeD;
                    if (unhostable)
                    {
                        var fallback = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<ViewPlan>()
                            .FirstOrDefault(v => v.ViewType == ViewType.FloorPlan && !v.IsTemplate);
                        if (fallback is null)
                        {
                            TaskDialog.Show("Sentinel — Ghost Builder",
                                "The active view can't host a DWG import, and no floor plan view was found. Open a floor plan view and try again.");
                            return Result.Cancelled;
                        }
                        importView = fallback;
                    }

                    // Import KEPT in the model (unlike Datum's rolled-back scratch read) so the user
                    // sees what was built from, and re-runs can re-pick it from the model.
                    using var t = new Transaction(doc, "Sentinel — import DWG plan");
                    t.Start();
                    var opts = new DWGImportOptions
                    {
                        Placement = ImportPlacement.Origin,   // aligns with Datum's origin-to-origin read
                        ThisViewOnly = false,
                        ColorMode = ImportColorMode.Preserved,
                    };
                    if (doc.Import(dwgPath, opts, importView, out ElementId impId))
                        cadLink = doc.GetElement(impId) as ImportInstance;
                    if (cadLink is null)
                    {
                        t.RollBack();
                        TaskDialog.Show("Sentinel — Ghost Builder", $"Could not import:\n{dwgPath}");
                        return Result.Failed;
                    }
                    t.Commit();
                    sourceSha = ProvenanceStamp.FileSha256(dwgPath);
                }
            }
        }

        if (pickFromModel)
        {
            try
            {
                var picked = uidoc.Selection.PickObject(
                    ObjectType.Element, new CadImportFilter(),
                    "Select a 2D CAD (DWG) import to build from.");
                cadLink = doc.GetElement(picked.ElementId) as ImportInstance;
            }
            catch (Autodesk.Revit.Exceptions.OperationCanceledException)
            {
                return Result.Cancelled;
            }
        }
        if (cadLink is null) return Result.Cancelled;
        // The drawing's name, for the changesets the build files (MA-1a step 2).
        string drawing = Path.GetFileNameWithoutExtension(doc.GetElement(cadLink.GetTypeId())?.Name ?? "drawing");
        // MA-1a item 3 (GHB-2): the import's own Z — the extractor reads the drawing in model coordinates, raised by it.
        double importZFt = cadLink.GetTotalTransform().Origin.Z;

        // 3. PHASE 1 — Revit API reads, on this (API) thread. Fast; safe to do inline.
        // The project key is read here (Extensible Storage); layers@n, guideline@n and type_catalog@n are fetched
        // in PHASE 2, off this thread, and the mapper and orchestrator are built there once they are known.
        // Mapping tiers: ignore → the project's layers@n → the per-project cache → labelled heuristics → the LOCAL
        // model (settings.GhostModel) for what is left. Cloud stays off — the drawing never leaves the machine.
        string key = ProjectContext.For(doc).Key; // "" when unbound: every standard then reads "none — not bound"
        // P2 SENSE (slice 1): read supporting docs (PDF/specs) from the SCOPED folder → context for the model.
        var evidence = GhostEvidence.FromFolder(settings.GhostSourceFolder);
        var llm = new LocalGhostBuilder(schemaJson, settings.GhostModel, settings.OllamaUrl, evidence.Context);
        GhostBuilderOrchestrator.Inputs inputs;
        try
        {
            // Extraction reads the import and needs no standard: a mapper-less orchestrator does it here.
            inputs = new GhostBuilderOrchestrator(doc, mapper: null).ExtractInputs(cadLink);
        }
        catch (System.Exception ex)
        {
            llm.Dispose();
            msg = $"{ex.GetType().Name}: {ex.Message}";
            return Result.Failed;
        }

        if (inputs.Layers.Count == 0)
        {
            llm.Dispose();
            TaskDialog.Show("Sentinel — Ghost Builder", "No CAD layers found in the import; nothing to build.");
            return Result.Cancelled;
        }

        // Set in PHASE 2 before the review window opens; the review and placement callbacks below only run after.
        LayerMapper? mapper = null;
        GhostBuilderOrchestrator? orchestrator = null;
        GhostStandards? standards = null;
        // Frees the local model's HttpClient (LayerMapper.Dispose forwards to the same LocalGhostBuilder).
        void Release() => ((System.IDisposable?)mapper ?? llm).Dispose();

        // 4. Wire the PHASE 3 placement handoff (runs on the API thread when raised).
        var placementEvent = new GhostBuilderPlacementEvent { Org = App.OrgFor(doc) };
        var externalEvent = ExternalEvent.Create(placementEvent);

        // 5. Modeless progress window owns the CancellationTokenSource (ESC / Cancel -> cancel).
        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        // 5b. The P3 review gate. Created here (UI thread) but only shown once the proposal exists;
        // its Build click is the ONLY path to placement, so an unreviewed proposal can never reach the model.
        var review = new GhostReviewWindow();
        new System.Windows.Interop.WindowInteropHelper(review) { Owner = c.Application.MainWindowHandle };
        bool building = false;

        // Reviewer picks the build level here too — collected from the model, elevation-ordered. Review amendment C8: the box
        // opens on the drawing's own level — the level at the import's elevation, else the active plan view's, else the
        // lowest (GhostFiling.DefaultLevel); the lowest alone was GR_SSL on the BDS template, 300 mm under the floor level.
#if NET48
        static long IdOf(Level l) => l.Id.IntegerValue;
#else
        static long IdOf(Level l) => l.Id.Value;
#endif
        var modelLevels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
        var levels = modelLevels.Select(l => (l.Name, IdOf(l))).ToList();
        if (levels.Count > 0)
            review.LoadLevels(levels, GhostFiling.DefaultLevel(modelLevels.Select(l => (IdOf(l), l.Elevation * 304.8)).ToList(), importZFt * 304.8,
                                                               (uidoc.ActiveView as ViewPlan)?.GenLevel is { } viewLevel ? IdOf(viewLevel) : (long?)null));
        review.LoadTypes(LoadedTypes(doc)); // GHB-5: what each row's type drop-down offers, read here on the API thread

        review.BuildRequested += (approved, levelId) =>
        {
            building = true;
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
            // MA-1a step 2: Build is the one human gate — the ticked rows are filed as changesets (source dwg) and placed by
            // ChangesetExecutor; an unbound model runs the same executor on a local changeset, with no ledger.
            placementEvent.SetRequest(new GhostChangesetBuild.Request
            {
                Doc = doc, Elements = inputs.Elements, Mapping = approved, LevelId = levelId,
                Guideline = standards!.Guideline, LibraryDir = libraryDir, Key = key, Drawing = drawing,
                ImportZFt = importZFt, SourceSha256 = sourceSha, GuidelineLabel = standards!.GuidelineSource.Label, LayersLabel = standards!.LayersSource.Label,
            });
            externalEvent.Raise();
        };

        // Closing the review without building ends the run — nothing was written, so there is nothing
        // to report or undo. The reviewer's choices are still remembered (an ignore on a drawing with nothing
        // else to build must stick — F45). Releasing here is what frees the local model's HttpClient.
        review.Closed += (_, __) =>
        {
            if (building) return;
            mapper?.Remember(review.Choices);
            Release();
        };

        placementEvent.Completed += (report, error) =>
        {
            // Back on the API thread. Marshal UI updates to the window's dispatcher.
            review.Dispatcher.Invoke(() =>
            {
                Release();
                review.Close();
                if (error != null)
                    TaskDialog.Show("Sentinel — Ghost Builder", "Placement failed: " + error.Message);
                else
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report, standards!));
            });
        };

        // 6. PHASE 2 — the project's standards, then LLM mapping, on a background thread. UI is free the
        // moment we return below.
        _ = Task.Run(async () =>
        {
            try
            {
                // layers@n, guideline@n and type_catalog@n for this document's project (or its office), fetched in
                // parallel (the catalogue within 20 s). One not installed is none, named — never a shipped file.
                progress.SetStatus("Reading the project's layers, guideline and type catalogue…");
                var resolved = GhostStandards.Load(key);
                progress.Token.ThrowIfCancellationRequested();
                standards = resolved;
                // The per-project mapping cache (%AppData%\Sentinel\cache\<key>\dwg_mappings.json), stamped by the
                // mapper with the layers sha: another project's guess never outranks this project's layers@n.
                mapper = new LayerMapper(llm, resolved.Layers, key);
                // minConfidence 0: the P3 review window is the confidence gate now. It pre-ticks standard rows only
                // (at 0.5) and shows the score on every row, so a human has already adjudicated each layer by the time we place —
                // a second silent engine-side threshold would just drop layers the reviewer deliberately ticked.
                orchestrator = new GhostBuilderOrchestrator(doc, mapper, minConfidence: 0, familyLibraryDir: libraryDir,
                                                            guideline: resolved.Guideline);

                // P2 slice 2: read sketch/render images with the local vision model and fold their hints into
                // the model's context. Best-effort + offline; no images / no VLM pulled -> silently skipped.
                int imgCount = LocalVisionReader.CountImages(settings.GhostSourceFolder);
                if (imgCount > 0)
                {
                    progress.SetStatus($"Reading {imgCount} sketch(es) with the local vision model…");
                    using var vision = new LocalVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                    string hints = await vision.ReadFolderAsync(settings.GhostSourceFolder, ct: progress.Token).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(hints)) llm.AppendEvidence(hints);
                }

                progress.SetStatus(evidence.IsEmpty
                    ? "Mapping CAD layers with the local model…"
                    : $"Mapping CAD layers with the local model ({evidence.Sources.Count} doc(s) for context)…");
                MappingResult mapping = await orchestrator.MapAsync(inputs, progress.Token).ConfigureAwait(false);

                if (progress.Token.IsCancellationRequested) return; // user aborted; window already closing

                // P2 (task 4/5): one more local call — read the project documents for parameter values that
                // belong on the mapped elements (a spec's "FR60" -> the wall's Fire Rating). Runs over the
                // FINAL mapping set, so layers the deterministic BDS pass resolved get seeded too. No
                // documents in the scoped folder -> no call, no change.
                if (llm.HasEvidence)
                {
                    progress.SetStatus("Reading parameters from the project documents…");
                    await llm.EnrichParamsAsync(mapping, progress.Token).ConfigureAwait(false);
                }

                // P3 gate: hand the proposal to the human instead of building it. Placement is raised
                // from the review window's Build click, never from here.
                var perLayer = inputs.Elements
                    .GroupBy(e => e.CadLayer ?? "", System.StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.Count(), System.StringComparer.OrdinalIgnoreCase);

                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    review.Load(mapping, perLayer, doc.Title, resolved.Header, guided: resolved.Guideline.HasGuideline,
                                hasLibrary: libraryDir != null); // the header names what maps and types this proposal
                    review.Show();
                });
            }
            catch (System.OperationCanceledException)
            {
                CloseOnUi(progress, Release); // ESC/Cancel: HTTP aborted cleanly
            }
            catch (System.Net.Http.HttpRequestException)
            {
                FailOnUi(progress, Release,
                    $"Could not reach the local model at {settings.OllamaUrl}.\n\n" +
                    $"Start Ollama and pull the model (\"ollama pull {settings.GhostModel}\"), then try again.");
            }
            catch (System.Exception ex)
            {
                FailOnUi(progress, Release, $"{ex.GetType().Name}: {ex.Message}");
            }
        });

        progress.Show();   // modeless — does NOT block; returns immediately
        return Result.Succeeded;
    }

    /// <summary>GHB-5: what each review row's type drop-down offers, read on the API thread as plain strings (the review
    /// window is Revit-free): basic wall, floor and ceiling types by name; door, window, column and furniture types as
    /// family : type. Basic walls only and floors without foundation slabs, as ChangesetExecutor resolves them, so a pick
    /// is one the executor places.</summary>
    private static Dictionary<string, IReadOnlyList<(string? Family, string Type)>> LoadedTypes(Document doc)
    {
        IReadOnlyList<(string? Family, string Type)> Names(IEnumerable<ElementType> types) => types
            .Select(t => (Family: t is FamilySymbol s ? s.FamilyName : null, Type: t.Name))
            .OrderBy(x => x.Family ?? "", System.StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.Type, System.StringComparer.OrdinalIgnoreCase)
            .ToList();
        IEnumerable<ElementType> Of(BuiltInCategory bic) =>
            new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>();
        return new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>(System.StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"] = Names(new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(w => w.Kind == WallKind.Basic)),
            ["Floors"] = Names(new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(f => !f.IsFoundationSlab)),
            ["Ceilings"] = Names(Of(BuiltInCategory.OST_Ceilings)),
            ["Doors"] = Names(Of(BuiltInCategory.OST_Doors).OfType<FamilySymbol>()),
            ["Windows"] = Names(Of(BuiltInCategory.OST_Windows).OfType<FamilySymbol>()),
            ["Columns"] = Names(Of(BuiltInCategory.OST_Columns).OfType<FamilySymbol>()),
            ["Furniture"] = Names(Of(BuiltInCategory.OST_Furniture).OfType<FamilySymbol>()),
        };
    }

    private static void CloseOnUi(GhostBuilderProgressWindow w, System.Action release) =>
        w.Dispatcher.Invoke(() => { release(); w.Close(); });

    private static void FailOnUi(GhostBuilderProgressWindow w, System.Action release, string message) =>
        w.Dispatcher.Invoke(() =>
        {
            release();
            w.Close();
            TaskDialog.Show("Sentinel — Ghost Builder", message);
        });

    /// <summary>What typed the placed walls — the guideline, the layer mapping — and how many were left as a
    /// reported gap (a massing placeholder among them). Shared with Photo Massing.</summary>
    internal static string WallsLine(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        var parts = new List<string>();
        if (r.WallsByGuideline > 0) parts.Add($"{r.WallsByGuideline} typed by the guideline");
        if (r.WallsByMapping > 0)
            parts.Add($"{r.WallsByMapping} typed by the layer mapping " + (s.GuidelineSource.Origin == "none"
                ? "(guideline none — the pre-guideline behaviour)"
                : "(no measured thickness for the guideline to type)"));
        if (r.WallsByReviewer > 0) parts.Add($"{r.WallsByReviewer} typed by the reviewer (picked in the review)");
        if (r.WallGaps > 0) parts.Add($"{r.WallGaps} left as a reported gap (each named below; a massing placeholder is noted for retyping)");
        return "Walls: " + (parts.Count == 0 ? "none placed" : string.Join(" · ", parts));
    }

    /// <summary>Spec 4b decision 2: with no type catalogue the guideline's types are checked against the open
    /// document only — said, never passed. Shared with Photo Massing.</summary>
    internal static string CatalogueNotChecked(GhostStandards s) =>
        "Type catalogue not checked — type_catalog: " + s.CatalogSource.Label + "; types checked against this document only.";

    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        // What this build was mapped and typed by, first — the review window's header, repeated.
        lines.AppendLine(s.Header);
        if (s.CatalogSource.Origin == "none") lines.AppendLine(CatalogueNotChecked(s));
        lines.AppendLine();
        // MA-1a step 2: nothing was built (refused, not filed, rolled back by Revit, not finished, or nothing to build) —
        // that line and the ledger line; the reasons below still name every row that gave no element. Nothing else is true.
        if (r.NotBuilt != null)
        {
            lines.AppendLine(r.NotBuilt);
            if (r.Ledger != null) lines.AppendLine(r.Ledger);
        }
        else
        {
            // GHB-5: Placed is what exists after the commit (the executor's recount); what Revit removed is named.
            lines.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
            lines.AppendLine(WallsLine(r, s));
            if (r.TypeGaps > 0) lines.AppendLine($"Types: {r.TypeGaps} named by the layer mapping not created (each named below with its reason)");
            if (r.SkippedUnknownFamily > 0) lines.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
            if (r.SkippedNoHost > 0) lines.AppendLine($"Skipped (no single straight wall of this build under the door or window): {r.SkippedNoHost}");
            if (r.SkippedNoGeometry > 0) lines.AppendLine($"Skipped (no geometry): {r.SkippedNoGeometry}");
            lines.AppendLine($"Provenance: {r.Stamped} of {r.Placed} placed element(s) stamped as source dwg");
            var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
            if (revitWarnings != null) lines.AppendLine(revitWarnings);
            if (r.Ledger != null) lines.AppendLine(r.Ledger);
            if (r.CreatedTypes.Count > 0)
            {
                // The office type library was extended — show it plainly; this is a deliberate change to the model's
                // type library, not a placement side-effect. Inside the build's one Undo: Ctrl+Z removes them too.
                lines.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
                foreach (var t in r.CreatedTypes) lines.AppendLine($"  + {t}");
            }
        }
        if (r.Warnings.Count > 0)
        {
            // Collapse identical warnings (a dirty layer can skip tens of thousands of elements for
            // the same reason) into one line with a count, most frequent first — otherwise the dialog
            // is an unreadable wall of duplicates.
            lines.AppendLine().AppendLine("Warnings:");
            foreach (var g in r.Warnings.GroupBy(w => w).OrderByDescending(g => g.Count()))
                lines.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        return lines.ToString();
    }
}

/// <summary>Restricts PickObject to DWG/CAD import instances.</summary>
internal sealed class CadImportFilter : ISelectionFilter
{
    public bool AllowElement(Element e) => e is ImportInstance;
    public bool AllowReference(Reference r, XYZ p) => false;
}
