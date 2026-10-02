using Autodesk.Revit.DB;
using ExtensibleStorage = Autodesk.Revit.DB.ExtensibleStorage;
using Sentinel.Engine;
using Sentinel.UI;

namespace Sentinel.Updaters;

/// <summary>
/// Dynamic Model Update (Decision 6): one registered updater, scoped by
/// element-domain triggers. Executes on every relevant model change and
/// pushes incremental violations to the panel. NEVER modifies the model
/// inside Execute (rejected-change reverts go through ExternalEvent instead).
/// </summary>
public sealed class SentinelUpdater : IUpdater
{
    // UpdaterId requires the AddInId, so it is built per-registration in RegisterFor.
    private readonly UpdaterId _id;
    private readonly RuleEngineHost _engine;
    private readonly SentinelPanelViewModel _panel;

    private static readonly Dictionary<Document, SentinelUpdater> Registered = new();

    private SentinelUpdater(AddInId addInId, RuleEngineHost engine, SentinelPanelViewModel panel)
    {
        _id = new UpdaterId(addInId, new Guid("9D5B3F60-1C4E-4A7B-8E2F-0B6D4A9C1E55"));
        _engine = engine;
        _panel = panel;
    }

    public static void RegisterFor(Document doc, RuleEngineHost engine, SentinelPanelViewModel panel)
    {
        // Keyed by the Document itself (Equals/GetHashCode), never PathName/Title: a new project's path is empty until
        // its first save, and two unsaved projects can share a title (BG-1).
        if (doc.IsFamilyDocument || Registered.ContainsKey(doc)) return;

        var updater = new SentinelUpdater(doc.Application.ActiveAddInId, engine, panel);
        UpdaterRegistry.RegisterUpdater(updater, doc, isOptional: true);

        // Element-domain triggers — names & key parameters, not geometry:
        // Views (rename, view-status edits)
        UpdaterRegistry.AddTrigger(updater._id, doc,
            new ElementClassFilter(typeof(View)), Element.GetChangeTypeAny());
        // Sheets (number edits)
        UpdaterRegistry.AddTrigger(updater._id, doc,
            new ElementClassFilter(typeof(ViewSheet)), Element.GetChangeTypeAny());
        // Levels & grids (datum renames)
        UpdaterRegistry.AddTrigger(updater._id, doc,
            new ElementClassFilter(typeof(Level)), Element.GetChangeTypeAny());
        UpdaterRegistry.AddTrigger(updater._id, doc,
            new ElementClassFilter(typeof(Grid)), Element.GetChangeTypeAny());
        // New elements anywhere (workset assignment / family placement checks).
        // DataStorage is excluded: Sentinel itself creates DataStorage elements
        // (requests/settings ES) inside DMU/ExternalEvent contexts, and they
        // must never feed back into the updater's own trigger scope.
        UpdaterRegistry.AddTrigger(updater._id, doc,
            new LogicalAndFilter(new List<ElementFilter>
            {
                new ElementIsElementTypeFilter(inverted: true),
                new ElementClassFilter(typeof(ExtensibleStorage.DataStorage), inverted: true),
            }),
            Element.GetChangeTypeElementAddition());

        Registered[doc] = updater;
    }

    /// Closing: this document's triggers and registration go with it; the other open documents keep theirs.
    public static void UnregisterFor(Document doc)
    {
        if (!Registered.TryGetValue(doc, out var u)) return;
        Registered.Remove(doc);
        if (UpdaterRegistry.IsUpdaterRegistered(u._id, doc))
        {
            UpdaterRegistry.RemoveDocumentTriggers(u._id, doc);
            UpdaterRegistry.UnregisterUpdater(u._id, doc);
        }
    }

    public static void UnregisterAll()
    {
        foreach (var u in Registered.Values)
            if (UpdaterRegistry.IsUpdaterRegistered(u._id))
                UpdaterRegistry.UnregisterUpdater(u._id);
        Registered.Clear();
    }

    public void Execute(UpdaterData data)
    {
        var doc = data.GetDocument();
        var changed = data.GetAddedElementIds().Concat(data.GetModifiedElementIds()).ToList();
        if (changed.Count == 0) return;

        // Read-only evaluation of just the changed elements — keeps DMU cost
        // proportional to the edit, not the model (15 s full-scan budget stays
        // reserved for open/sync events).
        var violations = _engine.ScanElements(doc, changed);
        // The pane shows one document: an edit in another open document (e.g. a change request resolved from its own
        // window) never merges its rows or toasts under the shown document's title. Requests and snapshots still run.
        var shown = App.IsShown(doc);
        if (shown) _panel.MergeDelta(changed.Select(c => c.IdValue()).ToList(), violations, _engine.RulesetFor(doc));

        // Enforcement modes (Decision 4):
        //  monitor -> log only (panel)
        //  warn    -> panel + a status line
        //  request -> pending change request + flag element
        //  block   -> stops the sync (App.OnSynchronizing), never the edit
        if (shown)
            foreach (var v in violations.Where(v => v.Mode == EnforcementMode.Warn))
                _panel.RaiseWarnToast(v);

        // Phase 2: request-mode violations become pending change requests.
        // We are inside the DMU transaction, so ES writes + param sets are legal.
        foreach (var v in violations.Where(v => v.Mode == EnforcementMode.Request))
        {
            var el = doc.GetElement(v.ElementId.ToElementId());
            if (el is null) continue;
            var newValue = el is ViewSheet sh ? sh.SheetNumber : el.Name;
            if (Sentinel.Workflow.RequestManager.CreatePending(doc, v.RuleId, el, newValue) && shown)
                _panel.RaisePendingRequest(v);
        }

        // Keep old-value snapshots current for elements that changed without
        // triggering a request (renames that are compliant, etc.).
        foreach (var id in changed)
        {
            if (doc.GetElement(id) is Element e)
                Sentinel.Workflow.RequestManager.UpdateSnapshot(
                    doc, id.IdValue(), e is ViewSheet s2 ? s2.SheetNumber : e.Name);
        }
    }

    /// <summary>DocumentChanged (App.OnStartup subscribes it): Execute sees additions and edits inside a transaction only.
    /// An element that is deleted — or that an Undo, a Redo or a rolled-back group (the BLOCK check's Go back) takes away
    /// or brings back — never reaches it, so the pane kept a row for an element that no longer existed until the next
    /// full scan (drill MA1a-I35). Rows only: no change request, no toast.</summary>
    public static void OnDocumentChanged(object? sender, Autodesk.Revit.DB.Events.DocumentChangedEventArgs e)
    {
        try
        {
            var doc = e.GetDocument();
            if (!Registered.TryGetValue(doc, out var u) || !App.IsShown(doc)) return;
            var gone = e.GetDeletedElementIds();
            // A commit's additions and edits were judged in Execute; an undo, a redo or a rollback runs no updater.
            var back = e.Operation == Autodesk.Revit.DB.Events.UndoOperation.TransactionCommitted
                ? new List<ElementId>()
                : e.GetAddedElementIds().Concat(e.GetModifiedElementIds()).ToList();
            if (gone.Count == 0 && back.Count == 0) return;
            u._panel.MergeDelta(gone.Concat(back).Select(i => i.IdValue()).ToList(), u._engine.ScanElements(doc, back), u._engine.RulesetFor(doc));
        }
        catch (Exception ex) { App.PanelVm?.LogDoctor("Pane refresh after an undo or delete failed: " + ex.Message); }
    }

    public UpdaterId GetUpdaterId() => _id;
    public ChangePriority GetChangePriority() => ChangePriority.Views;
    public string GetUpdaterName() => "Sentinel Live Compliance";
    public string GetAdditionalInformation() =>
        "Evaluates office standards on changed elements in real time.";
}
