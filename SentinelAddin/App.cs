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
        var panel = app.CreateRibbonPanel(tab, "Coordination");
        var asm = Assembly.GetExecutingAssembly().Location;

        AddButton(panel, asm, "Sentinel_ShowPanel", "Show\nPanel",
            "Sentinel.Commands.ShowPanelCommand", "panel",
            "Show the Sentinel live coordination panel.");
        AddButton(panel, asm, "Sentinel_ScanNow", "Scan\nNow",
            "Sentinel.Commands.ScanNowCommand", "scan",
            "Run a full compliance scan against the active ruleset.");
        AddButton(panel, asm, "Sentinel_Rules", "Rule\nSet",
            "Sentinel.Commands.ShowRulesetCommand", "rules",
            "View the effective ruleset (master version + project overlay).");

        var qa = app.CreateRibbonPanel(tab, "Quality");
        AddButton(qa, asm, "Sentinel_IfcPreflight", "IFC\nPre-Flight",
            "Sentinel.Commands.IfcPreFlightCommand", "scan",
            "Audit IfcExportAs and mandatory property sets before exporting IFC.");
        AddButton(qa, asm, "Sentinel_Scorecard", "Health\nScorecard",
            "Sentinel.Commands.ScorecardCommand", "rules",
            "Weighted executive compliance score with per-domain breakdown.");
        AddButton(qa, asm, "Sentinel_SanitizeFamily", "Sanitize\nFamily",
            "Sentinel.Commands.SanitizeFamilyCommand", "setup",
            "Audit an .rfa (geometry budget, nested CAD, shared parameters) before loading it.");
        AddButton(qa, asm, "Sentinel_IfcGate", "IFC Delivery\nGate",
            "Sentinel.Commands.IfcDeliveryGateCommand", "rules",
            "Export + certify an IFC against the delivery contract (EIR-as-code). FAIL = do not upload to the CDE.");
        AddButton(qa, asm, "Sentinel_ClashManager", "Clash\nManager",
            "Sentinel.Commands.ClashManagerCommand", "scan",
            "Native clash detection (RVT + IFC links vs structure) with severity grading, 3D clash view and BCF export.");
        AddButton(qa, asm, "Sentinel_SanitizeLoaded", "Heal Loaded\nFamilies",
            "Sentinel.Commands.SanitizeLoadedCommand", "setup",
            "Scan families already in the project; auto-inject missing shared parameters and reload silently.");
        AddButton(qa, asm, "Sentinel_MepVoids", "MEP\nOpenings",
            "Sentinel.Commands.MepVoidsCommand", "scan",
            "Find linked MEP vs structure intersections; place provision-for-void families.");
        AddButton(qa, asm, "Sentinel_Roi", "ROI\nDashboard",
            "Sentinel.Commands.RoiDashboardCommand", "panel",
            "Man-hours and monetary value saved by Sentinel's automated interventions.");
        AddButton(qa, asm, "Sentinel_GhostBuilder", "Ghost\nBuilder",
            "Sentinel.Commands.GhostBuilderCommand", "setup",
            "Build LOD 200 Revit geometry from a 2D DWG import: local LLM maps CAD layers to BDS families, then places walls and instances.");

        var wf = app.CreateRibbonPanel(tab, "Workflow");
        AddButton(wf, asm, "Sentinel_Requests", "Change\nRequests",
            "Sentinel.Commands.ShowRequestsCommand", "requests",
            "Review pending change requests. Approve keeps the change; reject reverts it.");
        AddButton(wf, asm, "Sentinel_Setup", "Project\nSetup",
            "Sentinel.Commands.ProjectSetupCommand", "setup",
            "Configure standards sources: master ruleset + template paths, saved to the project or this machine.");
        AddButton(wf, asm, "Sentinel_BuildOfficeSystem", "Build Office\nSystem",
            "Sentinel.Commands.BuildOfficeSystemCommand", "setup",
            "Extract worksets + shared parameters from the active 'golden' model, review them with confidence + provenance, then build them into this model and enforce them in the ruleset (Standards Engine).");
        AddButton(wf, asm, "Sentinel_LoadOfficeSystem", "Apply\nStandard",
            "Sentinel.Commands.LoadOfficeSystemCommand", "setup",
            "Load a saved standards pack (from Build Office System → Save pack) and build it into the active model — the golden→blank round-trip.");
        AddButton(wf, asm, "Sentinel_IngestDocs", "Ingest\nDocs",
            "Sentinel.Commands.IngestDocumentsCommand", "setup",
            "Read office-standards documents (PDF/text/CSV) with a local LLM and extract worksets + shared parameters into a reviewable standards pack (cited by file + page). Requires Ollama running locally.");
        AddButton(wf, asm, "Sentinel_ReviewFlag", "Review\nFlag",
            "Sentinel.Commands.SetupWorkflowCommand", "requests",
            "One-time: creates the ZZZ_ReviewStatus flag parameter (coordinator only).");
        AddButton(wf, asm, "Sentinel_Publish", "Publish to\nPlatform",
            "Sentinel.Commands.PublishToPlatformCommand", "panel",
            "Export the active view to IFC into the Sentinel outbox; the Bridge uploads it to That Open Platform.");
        AddButton(wf, asm, "Sentinel_AutoPublish", "Auto\nPublish",
            "Sentinel.Commands.ToggleAutoPublishCommand", "panel",
            "Toggle push-on-save: when ON, every save/sync re-exports the model and the Bridge uploads it, so the web viewer stays in sync. Throttled; turn off for very large models.");
        AddButton(wf, asm, "Sentinel_PublishSheets", "Publish\nSheets",
            "Sentinel.Commands.PublishSheetsCommand", "panel",
            "Render all Revit sheets to PNG (sheets never survive IFC export). The Bridge serves them to the web app's BIM Tools → Sheets tab, so you can view Revit sheets on the web.");
        AddButton(wf, asm, "Sentinel_BcfIssues", "BCF\nIssues",
            "Sentinel.Commands.BcfIssuesCommand", "requests",
            "Review coordination issues raised by non-Revit users on the web; double-click to zoom to the element + camera.");
        AddButton(wf, asm, "Sentinel_ClashRegister", "Clash\nRegister",
            "Sentinel.Commands.ClashRegisterCommand", "requests",
            "View the team-wide clash register recorded on the web (status lifecycle + volume), read-only.");
    }

    private static void AddButton(RibbonPanel panel, string asm, string name,
        string text, string className, string iconBase, string tooltip)
    {
        var data = new PushButtonData(name, text, asm, className) { ToolTip = tooltip };
        var resDir = Path.Combine(Path.GetDirectoryName(asm)!, "Resources");
        var large = Path.Combine(resDir, iconBase + "32.png");
        var small = Path.Combine(resDir, iconBase + "16.png");
        if (File.Exists(large)) data.LargeImage = LoadPng(large);
        if (File.Exists(small)) data.Image = LoadPng(small);
        panel.AddItem(data);
    }

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
