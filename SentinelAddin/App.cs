using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Sentinel.Engine;
using Sentinel.Updaters;
using Sentinel.UI;
using System.IO;
using System.Reflection;
using System.Windows.Media.Imaging;

namespace Sentinel;

/// <summary>
/// Entry point. Owns: Ribbon UI, dockable panel registration, IUpdater
/// lifecycle, sync-time delta scans, and the shared ExternalEvent hub.
/// </summary>
public sealed class App : IExternalApplication
{
    public static readonly DockablePaneId PaneId =
        new(new Guid("2C9F4D11-8E3A-4F6B-B1D0-6A7E5C2B9F44"));

    internal static SentinelPanelViewModel? PanelVm { get; private set; }
    internal static RuleEngineHost? Engine { get; private set; }
    internal static RevitEventHub? Events { get; private set; }

    public Result OnStartup(UIControlledApplication app)
    {
        try
        {
            // 1. Rule engine (loads cached ruleset.json; backend sync is async/offline-safe)
            try
            {
                Engine = new RuleEngineHost(RulesetStore.LoadEffective());
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — Initialization Error", 
                    $"Failed to load rule engine:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
                return Result.Failed;
            }

            // 2. Dockable panel
            try
            {
                PanelVm = new SentinelPanelViewModel();
                var panel = new SentinelPanel(PanelVm);
                app.RegisterDockablePane(PaneId, "Sentinel — Live Coordination", panel);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — Initialization Error", 
                    $"Failed to create UI panel:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
                return Result.Failed;
            }

            // 3. ExternalEvent hub (element select/zoom, future revert actions)
            try
            {
                Events = new RevitEventHub();
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — Initialization Error", 
                    $"Failed to create event hub:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
                return Result.Failed;
            }

            // 4. Ribbon
            try
            {
                BuildRibbon(app);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — Initialization Error", 
                    $"Failed to build ribbon:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
                return Result.Failed;
            }

            // 5. DMU updaters + document events
            try
            {
                app.ControlledApplication.DocumentOpened += OnDocumentOpened;
                app.ControlledApplication.DocumentSynchronizedWithCentral += OnSynchronized;
                app.ControlledApplication.DocumentSaved += OnSaved; // push-on-save → auto-publish

                // 'Revit Doctor': global native-warning interception
                Updaters.FailureInterceptor.Register(app.ControlledApplication);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — Initialization Error", 
                    $"Failed to register event handlers:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
                return Result.Failed;
            }

            // 6. Upgrade-ladder queue runner: no-op unless this Revit version is the target
            // of a pending batch upgrade queue (Sentinel.Upgrader.UpgradeQueueRunner).
            Sentinel.Upgrader.UpgradeQueueRunner.TryArm(app);

            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            TaskDialog.Show("Sentinel — Unexpected Error",
                $"Unexpected error during startup:\n\n{ex.GetType().Name}: {ex.Message}\n\n{ex.StackTrace}");
            return Result.Failed;
        }
    }

    public Result OnShutdown(UIControlledApplication app)
    {
        app.ControlledApplication.DocumentOpened -= OnDocumentOpened;
        app.ControlledApplication.DocumentSynchronizedWithCentral -= OnSynchronized;
        app.ControlledApplication.DocumentSaved -= OnSaved;
        Updaters.FailureInterceptor.Unregister(app.ControlledApplication);
        SentinelUpdater.UnregisterAll();
        return Result.Succeeded;
    }

    private static void OnDocumentOpened(object? sender, DocumentOpenedEventArgs e)
    {
        if (e.Document is { IsFamilyDocument: false } doc)
        {
            Engine!.ReloadRuleset(doc); // honor project-level settings (ES) if present
            SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
            Workflow.RequestManager.RefreshSnapshot(doc); // old-value capture baseline
            // Baseline full scan so the panel is populated immediately
            var report = Engine!.ScanFull(doc);
            PanelVm!.PublishReport(report);
        }
    }

    private static void OnSynchronized(object? sender, DocumentSynchronizedWithCentralEventArgs e)
    {
        // Delta scan at sync time (Decision 1: link-proximity checks live here too)
        Workflow.RequestManager.RefreshSnapshot(e.Document);
        var report = Engine!.ScanFull(e.Document);

        // CDE Sync Guard: central file name vs ISO 19650 / BDS convention.
        // Sync cannot be vetoed by the API, so a mismatch reports loudly.
        var cde = Sentinel.Engine.CdeSyncGuard.Check(e);
        if (cde is not null)
        {
            Sentinel.Engine.RoiTracker.Log("cde", cde.ElementName);
            var merged = new List<Sentinel.Engine.Violation>(report.Violations) { cde };
            report = new Sentinel.Engine.ScanReport(report.DocTitle, report.At,
                report.DurationMs, report.ElementsChecked + 1, merged);
        }
        PanelVm!.PublishReport(report);
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync-to-central → refresh the web copy too
        // TODO Phase 3: queue report -> backend scan_reports (offline-safe queue)
    }

    // Local save (non-workshared, or a local save before sync) → push the latest model to the web.
    private static void OnSaved(object? sender, DocumentSavedEventArgs e)
        => Sentinel.Engine.AutoPublish.Trigger(e.Document);

    private static void BuildRibbon(UIControlledApplication app)
    {
        const string tab = "Sentinel";
        app.CreateRibbonTab(tab);
        _asm = Assembly.GetExecutingAssembly().Location;
        _resDir = Path.Combine(Path.GetDirectoryName(_asm)!, "Resources");

        // ── Coordinate — live coordination + issues ──────────────────────────────────────────
        var co = app.CreateRibbonPanel(tab, "Coordinate");
        Push(co, "Sentinel_ShowPanel", "Show\nPanel", "Sentinel.Commands.ShowPanelCommand", "dashboard",
            "Show the Sentinel live coordination panel.");
        Push(co, "Sentinel_Requests", "Change\nRequests", "Sentinel.Commands.ShowRequestsCommand", "requests",
            "Review pending change requests. Approve keeps the change; reject reverts it.");
        Push(co, "Sentinel_BcfIssues", "BCF\nIssues", "Sentinel.Commands.BcfIssuesCommand", "issues",
            "Review coordination issues raised by non-Revit users on the web; double-click to zoom to the element + camera.");
        var clash = Pull(co, "Sentinel_Clash", "Clash", "clash",
            "Clash detection (author) and the team-wide clash register (review).");
        Sub(clash, "Sentinel_ClashManager", "Clash Manager", "Sentinel.Commands.ClashManagerCommand", "clash",
            "Native clash detection (RVT + IFC links vs structure) with severity grading, 3D clash view and BCF export.");
        Sub(clash, "Sentinel_ClashRegister", "Clash Register", "Sentinel.Commands.ClashRegisterCommand", "clashreg",
            "View the team-wide clash register recorded on the web (status lifecycle + volume), read-only.");
        Push(co, "Sentinel_ReviewFlag", "Review\nFlag", "Sentinel.Commands.SetupWorkflowCommand", "flag",
            "One-time: creates the ZZZ_ReviewStatus flag parameter (coordinator only).");

        // ── Validate — compliance, IFC readiness, family hygiene ─────────────────────────────
        var va = app.CreateRibbonPanel(tab, "Validate");
        Push(va, "Sentinel_ScanNow", "Scan\nNow", "Sentinel.Commands.ScanNowCommand", "scan",
            "Run a full compliance scan against the active ruleset.");
        Push(va, "Sentinel_Scorecard", "Health\nScorecard", "Sentinel.Commands.ScorecardCommand", "scorecard",
            "Weighted executive compliance score with per-domain breakdown.");
        Push(va, "Sentinel_Rules", "Rule\nSet", "Sentinel.Commands.ShowRulesetCommand", "rules",
            "View the effective ruleset (master version + project overlay).");
        var ifc = Pull(va, "Sentinel_IfcGate", "IFC\nGate", "ifcgate",
            "IFC deliverable checks: pre-flight before export, and delivery-gate certification after.");
        Sub(ifc, "Sentinel_IfcPreflight", "IFC Pre-Flight", "Sentinel.Commands.IfcPreFlightCommand", "preflight",
            "Audit IfcExportAs and mandatory property sets BEFORE exporting IFC.");
        Sub(ifc, "Sentinel_IfcGateCmd", "IFC Delivery Gate", "Sentinel.Commands.IfcDeliveryGateCommand", "gate",
            "Export + certify an IFC against the delivery contract (EIR-as-code). FAIL = do not upload to the CDE.");
        var fam = Pull(va, "Sentinel_FamilyHealth", "Family\nHealth", "family",
            "Family hygiene: audit an .rfa before loading, or heal families already in the project.");
        Sub(fam, "Sentinel_SanitizeFamily", "Sanitize .rfa", "Sentinel.Commands.SanitizeFamilyCommand", "family",
            "Audit an .rfa (geometry budget, nested CAD, shared parameters) before loading it.");
        Sub(fam, "Sentinel_SanitizeLoaded", "Heal Loaded Families", "Sentinel.Commands.SanitizeLoadedCommand", "heal",
            "Scan families already in the project; auto-inject missing shared parameters and reload silently.");
        Push(va, "Sentinel_MepVoids", "MEP\nOpenings", "Sentinel.Commands.MepVoidsCommand", "mep",
            "Find linked MEP vs structure intersections; place provision-for-void families.");

        // ── Publish — governed delivery (flagship) + ungoverned options ──────────────────────
        var pu = app.CreateRibbonPanel(tab, "Publish");
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "One governed action: export the active view to IFC, run the delivery gate, adjudicate against the project IDS, record the verdict immutably, and publish + version ONLY if it passes. A fail is recorded and each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit).");
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
            "Ungoverned publishing: quick publish, auto-publish on save, and sheet rendering. Prefer Governed Publish for delivery.");
        Sub(pub, "Sentinel_QuickPublish", "Quick Publish (ungoverned)", "Sentinel.Commands.PublishToPlatformCommand", "publish",
            "Export the active view to IFC into the Sentinel outbox; the Bridge uploads it to That Open Platform. No verdict — prefer Governed Publish.");
        Sub(pub, "Sentinel_AutoPublish", "Auto-Publish on save", "Sentinel.Commands.ToggleAutoPublishCommand", "autopublish",
            "Toggle push-on-save: when ON, every save/sync re-exports the model and the Bridge uploads it. Throttled; turn off for very large models.");
        Sub(pub, "Sentinel_PublishSheets", "Publish Sheets", "Sentinel.Commands.PublishSheetsCommand", "sheets",
            "Render all Revit sheets to PNG (sheets never survive IFC export). The Bridge serves them to the web app's Sheets tab.");

        // ── Standards & Build — office standards + generation ────────────────────────────────
        var st = app.CreateRibbonPanel(tab, "Standards & Build");
        var std = Pull(st, "Sentinel_Standards", "Standards", "standards",
            "Set up and apply office standards: project setup, build/apply a standards pack, or ingest from documents.");
        Sub(std, "Sentinel_Setup", "Project Setup", "Sentinel.Commands.ProjectSetupCommand", "setup",
            "Configure standards sources: master ruleset + template paths, saved to the project or this machine.");
        Sub(std, "Sentinel_BuildOfficeSystem", "Build Office System", "Sentinel.Commands.BuildOfficeSystemCommand", "office",
            "Extract worksets + shared parameters from the active 'golden' model, review them, then build them into this model and enforce them in the ruleset.");
        Sub(std, "Sentinel_LoadOfficeSystem", "Apply Standard", "Sentinel.Commands.LoadOfficeSystemCommand", "apply",
            "Load a saved standards pack and build it into the active model — the golden→blank round-trip.");
        Sub(std, "Sentinel_IngestDocs", "Ingest Docs", "Sentinel.Commands.IngestDocumentsCommand", "ingest",
            "Read office-standards documents (PDF/text/CSV) with a local LLM and extract worksets + shared parameters into a reviewable standards pack. Requires Ollama.");
        var chain = Pull(st, "Sentinel_Chain", "Model from\nDrawings", "ghost",
            "The datum -> model -> annotate chain: read the datum from the drawings, build LOD 200 geometry (from DWG or photos), then create the guideline's WIP views.");
        Sub(chain, "Sentinel_Datum", "1 · Datum from Drawings", "Sentinel.Commands.DatumFromDrawingsCommand", "ghost",
            "Datum first: read the levels from an imported section's levels layer and the grids from an imported plan's grid layer, then create them — real floor-to-floor heights and a real column grid, measured off the drawings, before any element is modelled.");
        Sub(chain, "Sentinel_GhostBuilder", "2 · Ghost Builder", "Sentinel.Commands.GhostBuilderCommand", "ghost",
            "Build LOD 200 Revit geometry from a 2D DWG import: local LLM maps CAD layers to BDS families, then places walls and instances.");
        Sub(chain, "Sentinel_Massing", "2b · Photo Massing", "Sentinel.Commands.MassingFromImagesCommand", "ghost",
            "Estimate a building's massing from the project images (photos/renders/elevations) in the scoped folder, review and correct the numbers, then build it through the same governed placement + guideline.");
        Sub(chain, "Sentinel_Annotate", "3 · Annotate Views", "Sentinel.Commands.AnnotateViewsCommand", "ghost",
            "Create the WIP plan views the guideline's `views` section prescribes: one per plannable entry per level, templated and routed into the office Project Browser structure. Idempotent.");
        Push(st, "Sentinel_Roi", "ROI\nDashboard", "Sentinel.Commands.RoiDashboardCommand", "roi",
            "Man-hours and monetary value saved by Sentinel's automated interventions.");
    }

    private static string _asm = "";
    private static string _resDir = "";

    // Build a push-button's data + its distinct icon (32 large / 16 small) from Resources by icon base name.
    private static PushButtonData Data(string name, string text, string className, string icon, string tooltip)
    {
        var data = new PushButtonData(name, text, _asm, className) { ToolTip = tooltip };
        var large = Path.Combine(_resDir, icon + "32.png");
        var small = Path.Combine(_resDir, icon + "16.png");
        if (File.Exists(large)) data.LargeImage = LoadPng(large);
        if (File.Exists(small)) data.Image = LoadPng(small);
        return data;
    }

    // A top-level push button on a panel.
    private static void Push(RibbonPanel panel, string name, string text, string className, string icon, string tooltip)
        => panel.AddItem(Data(name, text, className, icon, tooltip));

    // A pulldown button (its dropdown groups related sub-commands via Sub()).
    private static PulldownButton Pull(RibbonPanel panel, string name, string text, string icon, string tooltip)
    {
        var pd = new PulldownButtonData(name, text) { ToolTip = tooltip };
        var large = Path.Combine(_resDir, icon + "32.png");
        var small = Path.Combine(_resDir, icon + "16.png");
        if (File.Exists(large)) pd.LargeImage = LoadPng(large);
        if (File.Exists(small)) pd.Image = LoadPng(small);
        return (PulldownButton)panel.AddItem(pd);
    }

    // A command inside a pulldown's dropdown.
    private static void Sub(PulldownButton parent, string name, string text, string className, string icon, string tooltip)
        => parent.AddPushButton(Data(name, text, className, icon, tooltip));

    private static BitmapImage LoadPng(string path)
    {
        var bmp = new BitmapImage();
        bmp.BeginInit();
        bmp.CacheOption = BitmapCacheOption.OnLoad; // don't lock the file
        bmp.UriSource = new Uri(path, UriKind.Absolute);
        bmp.EndInit();
        bmp.Freeze();
        return bmp;
    }
}
