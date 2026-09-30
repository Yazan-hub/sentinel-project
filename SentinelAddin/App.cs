using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Sentinel.Engine;
using Sentinel.Updaters;
using Sentinel.UI;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
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
    /// This document's office code (its ruleset's "org"); empty when none — callers must say so, not guess.
    internal static string OrgFor(Document? doc) => doc is null || Engine is null ? string.Empty : Engine.RulesetFor(doc).Org;

    public Result OnStartup(UIControlledApplication app)
    {
        try
        {
            // 1. Rule engine (empty: each document gets its project's ruleset@n when it opens)
            try
            {
                Engine = new RuleEngineHost();
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
                app.ControlledApplication.DocumentCreated += OnDocumentCreated; // File ▸ New: watched like an opened project
                app.ControlledApplication.DocumentClosing += OnDocumentClosing;
                app.ControlledApplication.DocumentClosed += OnDocumentClosed; // a cancelled close is watched again
                app.ControlledApplication.DocumentSynchronizingWithCentral += OnSynchronizing; // BLOCK stops the sync
                app.ControlledApplication.DocumentSynchronizedWithCentral += OnSynchronized;
                app.ControlledApplication.DocumentSaved += OnSaved; // push-on-save → auto-publish
                app.ControlledApplication.DocumentChanged += UndoWatcher.OnChanged; // MA-0: an Undo of a Sentinel changeset → a ledger row
                app.ViewActivated += OnViewActivated; // the pane follows the active document

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
        app.ControlledApplication.DocumentCreated -= OnDocumentCreated;
        app.ControlledApplication.DocumentClosing -= OnDocumentClosing;
        app.ControlledApplication.DocumentClosed -= OnDocumentClosed;
        app.ControlledApplication.DocumentSynchronizingWithCentral -= OnSynchronizing;
        app.ControlledApplication.DocumentSynchronizedWithCentral -= OnSynchronized;
        app.ControlledApplication.DocumentSaved -= OnSaved;
        app.ControlledApplication.DocumentChanged -= UndoWatcher.OnChanged;
        app.ViewActivated -= OnViewActivated;
        Updaters.FailureInterceptor.Unregister(app.ControlledApplication);
        SentinelUpdater.UnregisterAll();
        return Result.Succeeded;
    }

    private static void OnDocumentOpened(object? sender, DocumentOpenedEventArgs e)
    {
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
        CdeSyncGuard.Prefetch(ProjectContext.For(doc)); // CDE-01's naming@n, off Revit's thread
        Workflow.RequestManager.RefreshSnapshot(doc); // old-value capture baseline
        ReloadRuleset(doc); // the baseline scan runs when the document's ruleset@n has landed
    }

    // A new project (File ▸ New) is watched like an opened one; its ruleset@n loads when its view activates.
    private static void OnDocumentCreated(object? sender, DocumentCreatedEventArgs e)
    {
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
        Workflow.RequestManager.RefreshSnapshot(doc);
    }

    // The documents in the middle of closing, by DocumentId (API thread only): DocumentClosing can be cancelled by another
    // add-in, or the close can fail — DocumentClosed then says so, and the still-open document is watched again.
    private static readonly Dictionary<int, Document> Closing = new();

    private static void OnDocumentClosing(object? sender, DocumentClosingEventArgs e)
    {
        Closing[e.DocumentId] = e.Document;
        Engine?.Forget(e.Document);
        ReloadSeq.Remove(e.Document);
        SentinelUpdater.UnregisterFor(e.Document);      // BG-1: its triggers go with it; other documents keep theirs
        Workflow.RequestManager.Forget(e.Document);
    }

    private static void OnDocumentClosed(object? sender, DocumentClosedEventArgs e)
    {
        if (!Closing.TryGetValue(e.DocumentId, out var doc)) return;
        Closing.Remove(e.DocumentId);
        if (e.Status == RevitAPIEventStatus.Succeeded || !doc.IsValidObject || doc.IsFamilyDocument) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);   // the close did not happen: watch it again
        Workflow.RequestManager.RefreshSnapshot(doc);
        ReloadRuleset(doc);                                     // Engine.Forget ran too
    }

    // The latest reload per document (API thread only): an older GET that lands late never overwrites a newer one.
    private static readonly Dictionary<Document, int> ReloadSeq = new();

    /// <summary>Resolve the document's ruleset@n (project → office → none) and judge the document by it. The
    /// key is read here (Extensible Storage: API thread); the GET runs on a background task (≤ 4 s, never the UI
    /// thread); the install, the rescan and the strip land back on the API thread through the event hub.</summary>
    internal static void ReloadRuleset(Document doc)
    {
        if (doc.IsFamilyDocument || Engine is not { } engine || Events is not { } events) return;
        var key = ProjectContext.For(doc).Key;
        var seq = ReloadSeq[doc] = ReloadSeq.TryGetValue(doc, out var last) ? last + 1 : 1;
        Task.Run(() => RulesetStore.Load(key)).ContinueWith(t => events.Enqueue(_ =>
        {
            if (!doc.IsValidObject) return;              // closed while the ruleset was in flight
            if (!ReloadSeq.TryGetValue(doc, out var latest) || latest != seq) return; // a newer reload is in flight or landed
            if (ProjectContext.For(doc).Key != key) return; // rebound meanwhile: the newer reload installs its ruleset
            var (rs, src, note) = t.Result;              // Load never throws
            engine.Set(doc, (rs, src));
            if (note is not null) PanelVm?.LogDoctor(note);
            // The pane shows the document it follows (not Revit's active one: a family editor in front never moves the
            // pane): a ruleset that lands after the user moved to another project is installed for it, and shown when
            // that project's view is activated again (OnViewActivated).
            if (!IsShown(doc)) return;
            PanelVm?.PublishReport(doc, engine.ScanFull(doc));
            RefreshJourney(doc);
        }), TaskScheduler.Default);
    }

    // The project document the pane last followed on a view activation (API thread only).
    private static Document? _activeDoc;

    /// Whether the pane shows this document: the one it follows, or any before the first activation / after it closed.
    internal static bool IsShown(Document doc) =>
        _activeDoc is not { } shown || !shown.IsValidObject || shown.Equals(doc);

    /// <summary>The pane follows the active document: when a view of another project document becomes active, show
    /// that document's scan and journey — no Scan Now needed. A document whose ruleset@n has not landed yet is loaded
    /// (off Revit's thread; it publishes when it lands), never scanned with none; one already in flight lands by
    /// itself. A family document leaves the pane as it was.</summary>
    private static void OnViewActivated(object? sender, Autodesk.Revit.UI.Events.ViewActivatedEventArgs e)
    {
        var doc = e.Document;
        if (doc is null || doc.IsFamilyDocument || Engine is not { } engine || PanelVm is not { } vm) return;
        if (_activeDoc is { } prev && prev.IsValidObject && prev.Equals(doc)) return; // another view, same document
        _activeDoc = doc;
        if (!engine.Has(doc))
        {
            vm.ShowLoading(doc.Title);
            if (!ReloadSeq.ContainsKey(doc)) ReloadRuleset(doc); // e.g. a new project never opened from disk
            return;
        }
        vm.PublishReport(doc, engine.ScanFull(doc));
        RefreshJourney(doc);
    }

    // The one pre-sync gate. CDE-01 first (GP-3: the central file name by naming@n — cheap), then BLOCK (founder,
    // 2026-09-30): a BLOCK rule stops the sync, not the edit. The document's full scan runs before Revit syncs; any BLOCK
    // violation cancels the sync and lists what to fix. Local work is untouched. A document whose ruleset@n has not
    // landed yet is not judged for BLOCK here (nothing to block by).
    private static void OnSynchronizing(object? sender, DocumentSynchronizingWithCentralEventArgs e)
    {
        var doc = e.Document;
        if (doc is null || doc.IsFamilyDocument) return;
        if (!CdeBeforeSync(e, doc)) return; // the sync is stopped
        if (Engine is not { } engine || !engine.Has(doc)) return;
        if (!engine.RulesetFor(doc).Rules.Any(r => r.Mode == EnforcementMode.Block)) return; // nothing can block: no pre-sync scan
        var report = engine.ScanFull(doc);
        var all = report.Violations.Where(v => v.Mode == EnforcementMode.Block).ToList();
        if (all.Count == 0) return;
        // Only what THIS user can fix stops THIS sync: in a workshared model an element another user owns is listed,
        // never blocking — otherwise two users could block each other's syncs with no way out.
        var blocks = all.Where(v => !NotFixableHere(doc, v)).ToList();
        var others = all.Count - blocks.Count;
        if (blocks.Count == 0)
        {
            PanelVm?.LogDoctor($"{others} BLOCK violation(s) on elements other users own or changed in central — not blocking this sync.");
            return;
        }
        var rules = string.Join(", ", blocks.Select(v => v.RuleId).Distinct());
        var sample = string.Join("\n", blocks.Take(8).Select(v => "• " + v.RuleId + ": " + v.ElementName));
        var more = (blocks.Count > 8 ? "\n…" : "")
            + (others > 0 ? $"\n({others} more on elements other users own or changed in central — not blocking this sync.)" : "")
            + "\n\nIf ⚡ Fix fails on an element, run Collaborate ▸ Reload Latest first: it may already be fixed in central, or borrowed by someone else.";
        PanelVm?.PublishReport(doc, report);
        if (!e.Cancellable)
        {
            PanelVm?.LogDoctor($"{blocks.Count} BLOCK violation(s) ({rules}) — Revit did not allow Sentinel to stop this sync.");
            TaskDialog.Show("Sentinel — Sync not stopped",
                $"Revit did not let Sentinel stop this sync. {blocks.Count} BLOCK violation(s) ({rules}) went to central.\n\n{sample}{more}\n\nFix them and sync again.");
            return;
        }
        e.Cancel();
        PanelVm?.LogDoctor($"Sync stopped: {blocks.Count} BLOCK violation(s) ({rules}).");
        TaskDialog.Show("Sentinel — Sync stopped",
            $"{blocks.Count} BLOCK violation(s) ({rules}) must be fixed before this model syncs.\n\n{sample}{more}" +
            "\n\nThe Sentinel pane lists them first — fix them (⚡ Fix where offered) and sync again. Your work is safe: save locally.");
    }

    // CDE-01's verdict from before this sync, for the pane after it (API thread only): judged once, reported once.
    private static (Document Doc, Violation Row)? _cdeAtSync;

    // GP-3: CDE-01 before the sync — the central file name judged by the cached naming@n with the pure Decide, as the
    // bridge's /propose judges it. Reject → the sync stops, the dialog names the failing field; warn → "Sync anyway /
    // Cancel"; a Monitor note (no naming@n yet, not bound) and the project-code Warn never ask. The row joins the pane's
    // report after a sync that happened (OnSynchronized). False = the sync is stopped. A throw here is said, never lets BLOCK be skipped.
    private static bool CdeBeforeSync(DocumentSynchronizingWithCentralEventArgs e, Document doc)
    {
        _cdeAtSync = null;
        Violation? cde;
        try
        {
            var ctx = ProjectContext.For(doc);
            cde = CdeSyncGuard.Check(doc, ctx, CdeSyncGuard.LastNaming(ctx));
            // Before a sync is stopped, judged again by naming@n as it is now (Refresh): a lead may have set it to warn
            // or off since it was cached, as the stop dialog suggests.
            if (cde is not null && CdeSyncGuard.StopsSync(cde))
                cde = CdeSyncGuard.Check(doc, ctx, CdeSyncGuard.Refresh(ctx));
        }
        catch (Exception ex)
        {
            PanelVm?.LogDoctor("CDE-01 not judged before this sync — " + ex.GetType().Name + ": " + ex.Message);
            return true;
        }
        if (cde is null) return true;
        _cdeAtSync = (doc, cde);
        if (!CdeSyncGuard.StopsSync(cde)) return true;
        const string title = "Sentinel — Central file name (CDE-01)";
        if (!e.Cancellable)
        {
            PanelVm?.LogDoctor("CDE-01: " + cde.MessageEn + " Revit did not allow Sentinel to stop this sync.");
            if (cde.Mode == EnforcementMode.Block)
                TaskDialog.Show(title, "Revit did not let Sentinel stop this sync.\n\n" + cde.MessageEn);
            return true;
        }
        if (cde.Mode == EnforcementMode.Block)
        {
            e.Cancel();
            PanelVm?.LogDoctor("Sync stopped: CDE-01 — " + cde.MessageEn);
            TaskDialog.Show(title, "Sync stopped — the central file name fails the project's naming standard.\n\n" + cde.MessageEn +
                "\n\nNothing went to central. Your work is safe: save locally. To sync, save the central model under a conforming " +
                "name, or a lead sets this naming standard to warn on the web.");
            return false;
        }
        var ask = new TaskDialog(title)
        {
            MainInstruction = "The central file name does not follow the project's naming standard",
            MainContent = cde.MessageEn,
            CommonButtons = TaskDialogCommonButtons.Cancel,
        };
        ask.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Sync anyway", "The name stays a CDE-01 warning in the Sentinel pane.");
        if (ask.Show() == TaskDialogResult.CommandLink1) return true;
        e.Cancel();
        _cdeAtSync = null;
        PanelVm?.LogDoctor("Sync cancelled at CDE-01 (warn): " + cde.MessageEn);
        return false;
    }

    // What this user cannot fix in this sync does not block it (workshared models only): an element another user has
    // borrowed, or one changed/deleted in central since the last reload (it may already be fixed — Reload Latest); a
    // workset row (ElementId -1) whose workset another user holds editable, matched by name.
    private static bool NotFixableHere(Document doc, Violation v)
    {
        if (!doc.IsWorkshared) return false;
        if (v.ElementId > 0)
        {
            var id = v.ElementId.ToElementId();
            if (WorksharingUtils.GetCheckoutStatus(doc, id) == CheckoutStatus.OwnedByOtherUser) return true;
            var u = WorksharingUtils.GetModelUpdatesStatus(doc, id);
            return u == ModelUpdatesStatus.UpdatedInCentral || u == ModelUpdatesStatus.DeletedInCentral;
        }
        // ponytail: matched by the row's name; a '(missing) X' row matches no workset, so it stays actionable
        var ws = new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset).FirstOrDefault(w => w.Name == v.ElementName);
        return ws != null && !string.IsNullOrEmpty(ws.Owner)
            && !string.Equals(ws.Owner, doc.Application.Username, StringComparison.OrdinalIgnoreCase);
    }

    private static void OnSynchronized(object? sender, DocumentSynchronizedWithCentralEventArgs e)
    {
        // Revit raises this after a CANCELLED or failed sync too (OnSynchronizing cancels for BLOCK): nothing below —
        // rescan, CDE-01, auto-publish, the office scan post — may run for a sync that did not happen.
        if (e.Status != RevitAPIEventStatus.Succeeded || e.Document is null || e.Document.IsFamilyDocument) return;
        // Delta scan at sync time (Decision 1: link-proximity checks live here too)
        Workflow.RequestManager.RefreshSnapshot(e.Document);
        var report = Engine!.ScanFull(e.Document);

        // CDE Sync Guard: judged BEFORE this sync (CdeBeforeSync, GP-3) — its row joins the report here, never judged
        // twice; a Monitor note (no naming standard to judge by) is never scored or counted as checked.
        var ctx = ProjectContext.For(e.Document);
        if (_cdeAtSync is { } at && at.Doc.IsValidObject && at.Doc.Equals(e.Document))
            report = report.Plus(at.Row, at.Row.Mode != Sentinel.Engine.EnforcementMode.Monitor);
        _cdeAtSync = null;
        Sentinel.Engine.CdeSyncGuard.Prefetch(ctx); // the next sync sees a naming@n installed since
        PanelVm!.PublishReport(e.Document, report);
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync → auto-publish, when the project's publish@n says so
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled;
        // posted on a task and never waited for — a sync must not block. When the bridge has answered, its ledger line
        // goes to the Doctor log and the journey is re-read, so the `model` step is never read before its report
        // lands. Both on the pane's thread through BeginInvoke — never Invoke from the worker. The key, the ruleset
        // source and the strip's follow token are read here, on the API thread: if the strip has moved on meanwhile
        // (another project's view activated), the re-read is skipped rather than show this project's journey there.
        // An unbound document posts nothing (silently: a sync is not the place for a dialog) and its strip says not bound.
        if (ctx.IsBound)
        {
            var key = ctx.Key;
            var local = Engine.SourceFor(e.Document);
            var vm = PanelVm;
            var follow = vm.JourneySeq;
            var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
            Task.Run(() => Sentinel.Coordination.GovernedNotify.OfficeScan(report, key)).ContinueWith(t => ui.BeginInvoke(new Action(() =>
            {
                var ledger = t.Status == TaskStatus.RanToCompletion ? t.Result
                    : Sentinel.Coordination.LedgerResult.NotConfirmed(t.Exception?.GetBaseException().Message ?? "the scan post did not finish");
                vm.LogDoctor("Scan report: " + Sentinel.Coordination.LedgerLine.For(ledger));
                if (vm.JourneySeq == follow) vm.RefreshJourney(key, local);
            })), TaskScheduler.Default);
        }
        else RefreshJourney(e.Document);
    }

    /// <summary>Next strip: read the document's web key and where its ruleset came from on the Revit API thread,
    /// then hand them to the pane (its GET runs off-thread). Read-only; family documents skipped. An unbound
    /// document shows "not bound — Sentinel ▸ Project Setup" and asks the bridge nothing.</summary>
    internal static void RefreshJourney(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || PanelVm is null || Engine is null) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) { PanelVm.ShowUnbound(); return; }
        PanelVm.RefreshJourney(ctx.Key, Engine.SourceFor(doc));
    }

    // Local save (non-workshared, or a local save before sync) → auto-publish, when the project's publish@n says so.
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
            "Review pending change requests. Approve keeps a change or applies a ⚡ Fix proposal; reject reverts a change or drops a proposal.");
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
        Push(co, "Sentinel_ReviewChangesets", "Review AI\nProposals", "Sentinel.Commands.ReviewChangesetsCommand", "gate",
            "Review staged AI element proposals: the referee's verdict per element, your tick decides what enters the model. Everything is audit-chained.");

        // ── Validate — compliance, IFC readiness, family hygiene ─────────────────────────────
        var va = app.CreateRibbonPanel(tab, "Validate");
        Push(va, "Sentinel_ScanNow", "Scan\nNow", "Sentinel.Commands.ScanNowCommand", "scan",
            "Run a full compliance scan against the active ruleset.");
        Push(va, "Sentinel_Scorecard", "Health\nScorecard", "Sentinel.Commands.ScorecardCommand", "scorecard",
            "Weighted executive compliance score with per-domain breakdown.");
        Push(va, "Sentinel_Rules", "Rule\nSet", "Sentinel.Commands.ShowRulesetCommand", "rules",
            "View the ruleset this document is judged by: its web project's ruleset@n (or its office's), with source and sha.");
        var ifc = Pull(va, "Sentinel_IfcGate", "IFC\nGate", "ifcgate",
            "IFC deliverable checks: pre-flight before export, and delivery-gate certification after.");
        Sub(ifc, "Sentinel_IfcPreflight", "IFC Pre-Flight", "Sentinel.Commands.IfcPreFlightCommand", "preflight",
            "Audit Export-to-IFC mappings and the delivery contract's required properties BEFORE exporting IFC.");
        Sub(ifc, "Sentinel_IfcGateCmd", "IFC Delivery Gate", "Sentinel.Commands.IfcDeliveryGateCommand", "gate",
            "Export + certify an IFC against the delivery contract installed on this document's web project (or its office), named contract@n with source and sha; the export uses the contract's IFC schema. FAIL = do not upload to the CDE; no contract = NOT CHECKED, never a pass.");
        var fam = Pull(va, "Sentinel_FamilyHealth", "Family\nHealth", "family",
            "Family hygiene: audit an .rfa before loading, or heal families already in the project.");
        Sub(fam, "Sentinel_SanitizeFamily", "Sanitize .rfa", "Sentinel.Commands.SanitizeFamilyCommand", "family",
            "Audit an .rfa (geometry budget, nested CAD, shared parameters) before loading it.");
        Sub(fam, "Sentinel_SanitizeLoaded", "Heal Loaded Families", "Sentinel.Commands.SanitizeLoadedCommand", "heal",
            "Scan families already in the project; auto-inject missing shared parameters and reload silently.");
        Push(va, "Sentinel_MepVoids", "MEP\nOpenings", "Sentinel.Commands.MepVoidsCommand", "mep",
            "Find linked MEP vs structure intersections; place provision-for-void families.");
        Push(va, "Sentinel_NamingManager", "Naming\nManager", "Sentinel.Commands.NamingManagerCommand", "family",
            "Review family and type names against the office naming rules: recovered proposals, duplicates blocked, rename only what you tick. Each batch is one ledger row, and the window says whether it landed.");

        // ── Publish — the one governed path (auto-publish is the project's publish@n, not a button) + sheets and views ──
        var pu = app.CreateRibbonPanel(tab, "Publish");
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "The one publish path: export the whole model to IFC in the contract's schema, run the delivery gate, adjudicate against the project IDS and naming, and — on accepted or recorded — register one version (the container is named from the central file) with its verdict on the ledger and stage the upload. A reject uploads nothing; each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit). The dialog names the version and both ledger rows.");
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
            "Sheets and views for the web app's Sheets and Views tabs — images keyed by model name under %AppData%, outside the governed IFC path (no version, no verdict). The model itself publishes only through Governed Publish, or on save when the project's publish@n says auto: true (the pane's strip names it).");
        Sub(pub, "Sentinel_PublishSheets", "Publish Sheets", "Sentinel.Commands.PublishSheetsCommand", "sheets",
            "Render all Revit sheets to PNG (sheets never survive IFC export). The Bridge serves them to the web app's Sheets tab. Keyed by model name under %AppData%, not by the web project — outside the governed IFC path.");
        Sub(pub, "Sentinel_PublishViews", "Publish Views", "Sentinel.Commands.PublishViewsCommand", "views",
            "Choose which views (plans, sections, elevations, 3D, drafting) to publish. Only checked views appear in the web app's Views tab. Keyed by model name under %AppData%, not by the web project — outside the governed IFC path.");

        // ── Standards & Build — office standards + generation ────────────────────────────────
        var st = app.CreateRibbonPanel(tab, "Standards & Build");
        var std = Pull(st, "Sentinel_Standards", "Standards", "standards",
            "Set up and apply office standards: project setup, build/apply a standards pack, or ingest from documents.");
        Sub(std, "Sentinel_Setup", "Project Setup", "Sentinel.Commands.ProjectSetupCommand", "setup",
            "Bind this model to its web project (its ruleset, IDS and naming come from there), plus the template path.");
        Sub(std, "Sentinel_SignIn", "Sign in", "Sentinel.Commands.SignInCommand", "setup",
            "Sign in with your Sentinel account (the same as on the web): every governed call from Revit then carries your name on the ledger instead of this PC's shared token. Sign out forgets it on this PC only.");
        Sub(std, "Sentinel_BuildOfficeSystem", "Build Office System", "Sentinel.Commands.BuildOfficeSystemCommand", "office",
            "Extract worksets + shared parameters from the active 'golden' model, review them, then build them into this model and enforce them in the ruleset.");
        Sub(std, "Sentinel_LoadOfficeSystem", "Apply Standard", "Sentinel.Commands.LoadOfficeSystemCommand", "apply",
            "Load a saved standards pack and build it into the active model — the golden→blank round-trip.");
        Sub(std, "Sentinel_IngestDocs", "Ingest Docs", "Sentinel.Commands.IngestDocumentsCommand", "ingest",
            "Read office-standards documents (PDF/text/CSV) with a local LLM and extract worksets + shared parameters into a reviewable standards pack. Requires Ollama.");
        var chain = Pull(st, "Sentinel_Chain", "Model from\nDrawings", "ghost",
            "The datum -> model -> annotate chain: read the datum from the drawings, build LOD 200 geometry (from DWG or photos), then create the WIP views of the guideline installed on this document's web project (or its office).");
        Sub(chain, "Sentinel_Datum", "1 · Datum from Drawings", "Sentinel.Commands.DatumFromDrawingsCommand", "ghost",
            "Datum first: read the levels from an imported section's levels layer and the grids from an imported plan's grid layer, then create them — real floor-to-floor heights and a real column grid, measured off the drawings, before any element is modelled.");
        Sub(chain, "Sentinel_GhostBuilder", "2 · Ghost Builder", "Sentinel.Commands.GhostBuilderCommand", "ghost",
            "Build LOD 200 Revit geometry from a 2D DWG import: CAD layers map by the layers standard installed on this document's web project (or its office) — labelled heuristics and the local LLM for the rest, never pre-ticked — then walls are typed by its guideline and type catalogue. Each is named with source and sha; one not installed reads none.");
        Sub(chain, "Sentinel_Massing", "2b · Photo Massing", "Sentinel.Commands.MassingFromImagesCommand", "ghost",
            "Estimate a building's massing from the project images (photos/renders/elevations) in the scoped folder, review and correct the numbers, then build it through the same governed placement, typed by the guideline and type catalogue installed on this document's web project (or its office) and named in the summary; with no guideline the walls get declared placeholder types.");
        Sub(chain, "Sentinel_Annotate", "3 · Annotate Views", "Sentinel.Commands.AnnotateViewsCommand", "ghost",
            "Create the WIP plan views prescribed by the `views` section of the guideline installed on this document's web project (or its office), named guideline@n with source and sha: one per plannable entry per level, templated and routed into the office Project Browser structure. Idempotent. No guideline installed = nothing to plan.");
        Sub(chain, "Sentinel_PromoteWalls", "4 · Promote walls (DD)", "Sentinel.Commands.PromoteWallsCommand", "ghost",
            "Promote this model's walls to DD by the guideline and type catalogue installed on its web project (or its office): retype each basic wall to the exact catalogue type already loaded here, attach bases and tops to story levels, and send every ambiguous wall to a person with its reason. Shows the plan first (No = read-only); files one reviewed changeset per storey. No type is ever created; each change is stamped, and an Undo of it is recorded on the ledger.");
        Push(st, "Sentinel_Roi", "ROI\nDashboard", "Sentinel.Commands.RoiDashboardCommand", "roi",
            "Counts from this document's web project ledger — delivery gate runs, naming renames, family heals — priced only by the roi standard installed on the project (or its office); what writes no ledger row is listed as not counted.");
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
