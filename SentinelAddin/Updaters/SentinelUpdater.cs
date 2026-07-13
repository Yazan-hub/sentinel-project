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

    private static readonly Dictionary<string, SentinelUpdater> Registered = [];

    private SentinelUpdater(AddInId addInId, RuleEngineHost engine, SentinelPanelViewModel panel)
    {
        _id = new UpdaterId(addInId, new Guid("9D5B3F60-1C4E-4A7B-8E2F-0B6D4A9C1E55"));
        _engine = engine;
        _panel = panel;
    }

    public static void RegisterFor(Document doc, RuleEngineHost engine, SentinelPanelViewModel panel)
    {
        var key = doc.PathName ?? doc.Title;
        if (Registered.ContainsKey(key)) return;

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

        Registered[key] = updater;
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
        _panel.MergeDelta(changed.Select(c => c.IdValue()).ToList(), violations);

        // Enforcement modes (Decision 4):
        //  monitor -> log only (panel)
        //  warn    -> panel + non-blocking toast
        //  request -> Phase 2: create pending change request + flag element
        //  block   -> disallowed inside DMU; blocking rules are enforced by
        //             failure-posting at sync time
        foreach (var v in violations.Where(v => v.Mode == EnforcementMode.Warn))
            _panel.RaiseWarnToast(v);

        // Phase 2: request-mode violations become pending change requests.
        // We are inside the DMU transaction, so ES writes + param sets are legal.
        foreach (var v in violations.Where(v => v.Mode == EnforcementMode.Request))
        {
            var el = doc.GetElement(v.ElementId.ToElementId());
            if (el is null) continue;
            var newValue = el is ViewSheet sh ? sh.SheetNumber : el.Name;
            if (Sentinel.Workflow.RequestManager.CreatePending(doc, v.RuleId, el, newValue))
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

    public UpdaterId GetUpdaterId() => _id;
    public ChangePriority GetChangePriority() => ChangePriority.Views;
    public string GetUpdaterName() => "Sentinel Live Compliance";
    public string GetAdditionalInformation() =>
        "Evaluates BDS/office standards on changed elements in real time.";
}
