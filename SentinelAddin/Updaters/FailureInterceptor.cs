using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Sentinel.Engine;

namespace Sentinel.Updaters;

/// <summary>
/// 'Revit Doctor' (F-S2-3, audit BG-3): watches failure processing in every transaction through the FailuresProcessing
/// application event, and NEVER erases a warning ([BP] P1-3). It logs the warnings it used to erase — identical instances, a
/// duplicate Mark, a slightly-off-axis line — as "Seen: … — left in the model", naming the elements, once their transaction
/// commits (DocumentChanged), so a rolled-back transaction logs nothing. Its one touch is Revit's own resolution of a
/// slightly-off-axis line, and only in a bound project that opted in under Project Setup (default off): "Sentinel resolved N
/// in …". Never in a family document, never in a transaction Sentinel counts itself (GhostFailurePolicy.DoctorSkips). The rule
/// is DoctorPolicy's (pure, ghost-p2-check). Revit's API cannot tell another add-in's transaction from the user's, so in an
/// opted-in project the axis fix applies to both (BG-3 asks for Sentinel's and the user's only).
/// </summary>
public sealed class FailureInterceptor : IFailuresPreprocessor
{
    private static readonly Dictionary<Guid, DoctorPolicy.Kind> Kinds = new Dictionary<Guid, DoctorPolicy.Kind>
    {
        [BuiltInFailures.InaccurateFailures.InaccurateLine.Guid] = DoctorPolicy.Kind.InaccurateLine,      // slightly off axis
        [BuiltInFailures.OverlapFailures.DuplicateInstances.Guid] = DoctorPolicy.Kind.DuplicateInstances, // identical instances
        [BuiltInFailures.GeneralFailures.DuplicateValue.Guid] = DoctorPolicy.Kind.DuplicateValue,         // duplicate Mark
    };

    // What the Doctor saw, waiting for its transaction to commit. Revit's API thread only (both events run there).
    private static readonly List<DoctorPolicy.Seen> Pending = new List<DoctorPolicy.Seen>();

    // MA-1a item 7 (P1-9): what Revit's own fix resolved, gathered per project for one minute and reported as one doctor row.
    private static readonly Sentinel.Coordination.DoctorBuffer Reported = new Sentinel.Coordination.DoctorBuffer();

    // API thread (DocumentChanged). The key and the actor are read here; the flush runs a minute later on a pool thread.
    private static void ReportResolved(Document doc, ICollection<string> committed)
    {
        string key = ProjectContext.For(doc).Key;
        // Only this model's own resolutions: Pending holds every open model's, and a transaction of the same name can
        // commit in another one.
        var resolved = Pending.Where(p => p.Resolved && p.Project == key && committed.Contains(p.Tx)).GroupBy(p => p.Tx + "|" + p.Key).Select(g => g.First()).ToList();
        if (resolved.Count == 0) return;
        string actor = Sentinel.Coordination.UserSession.Actor;
        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher; // the pane's thread
        bool opens = false;
        foreach (var p in resolved) opens |= Reported.Add(key, p.Text, p.Tx, p.Ids);
        if (!opens) return; // a flush is already on its way for this project
        System.Threading.Tasks.Task.Delay(TimeSpan.FromSeconds(Sentinel.Coordination.DoctorBuffer.WindowSeconds)).ContinueWith(_ =>
        {
            if (Reported.Take(key) is { } tally)
                Sentinel.Coordination.GovernedNotify.Report("Doctor", Sentinel.Coordination.CommandReports.Doctor(tally, actor), key, ui);
        }, System.Threading.Tasks.TaskScheduler.Default);
    }

    public static void Register(Autodesk.Revit.ApplicationServices.ControlledApplication app)
    {
        app.FailuresProcessing += OnFailuresProcessing;
        app.DocumentChanged += OnDocumentChanged;
    }

    public static void Unregister(Autodesk.Revit.ApplicationServices.ControlledApplication app)
    {
        app.FailuresProcessing -= OnFailuresProcessing;
        app.DocumentChanged -= OnDocumentChanged;
    }

    private static void OnFailuresProcessing(object? sender, FailuresProcessingEventArgs e)
    {
        var result = Process(e.GetFailuresAccessor());
        if (result != FailureProcessingResult.Continue)
            e.SetProcessingResult(result);
    }

    // BG-3: logged after commit. Any DocumentChanged ends the wait: a committed transaction's lines are written, the rest
    // (rolled back, undone) are dropped.
    // ponytail: a rolled-back transaction that raises no DocumentChanged keeps its lines until the next one, and a commit of
    // the same name then would log them; key them by document version if a drill sees it.
    private static void OnDocumentChanged(object? sender, DocumentChangedEventArgs e)
    {
        if (Pending.Count == 0) return;
        try
        {
            var committed = e.Operation == UndoOperation.TransactionCommitted ? e.GetTransactionNames() : new List<string>();
            foreach (var (line, resolved) in DoctorPolicy.Lines(Pending, committed)) App.PanelVm?.LogDoctor(line, resolved);
            ReportResolved(e.GetDocument(), committed);
        }
        finally { Pending.Clear(); }
    }

    /// IFailuresPreprocessor entry (Sentinel-owned transactions).
    public FailureProcessingResult PreprocessFailures(FailuresAccessor accessor) => Process(accessor);

    private static FailureProcessingResult Process(FailuresAccessor accessor)
    {
        var doc = accessor.GetDocument();
        string tx = accessor.GetTransactionName();
        int opted = -1; // the opt-in is read once, and only when a slightly-off-axis line with a resolution comes by
        bool OptedIn()
        {
            if (opted < 0) opted = ProjectContext.For(doc).IsBound && SettingsManager.LoadFromDocument(doc)?.DoctorAxisFix == true ? 1 : 0;
            return opted == 1;
        }
        bool resolvedAny = false;
        foreach (var failure in accessor.GetFailureMessages())
        {
            var kind = failure.GetFailureDefinitionId() is { } def && Kinds.TryGetValue(def.Guid, out var k) ? k : DoctorPolicy.Kind.Other;
            bool canResolve = kind == DoctorPolicy.Kind.InaccurateLine && failure.HasResolutions();
            var act = DoctorPolicy.Decide(tx, doc.IsFamilyDocument, failure.GetSeverity() == FailureSeverity.Warning, kind,
                                          canResolve, canResolve && OptedIn());
            if (act == DoctorPolicy.Act.Leave) continue;
            var ids = failure.GetFailingElementIds().Select(i => i.IdValue()).ToList();
            var seen = new DoctorPolicy.Seen
            {
                Tx = tx, Text = failure.GetDescriptionText(), Ids = ids,
                Project = ProjectContext.For(doc).Key, // MA-1a item 7: a resolution is reported under its own model's project only
                Key = failure.GetFailureDefinitionId().Guid + "|" + string.Join(",", ids.OrderBy(i => i)),
            };
            if (act == DoctorPolicy.Act.Resolve)
            {
                try
                {
                    accessor.ResolveFailure(failure); // Revit's own fix (the axis nudge) — never DeleteWarning
                    seen.Resolved = resolvedAny = true;
                }
                catch (Autodesk.Revit.Exceptions.ApplicationException)
                {
                    // Resolution unavailable in this context — left for the user, logged as seen.
                }
            }
            Pending.Add(seen);
        }
        return resolvedAny
            ? FailureProcessingResult.ProceedWithCommit       // re-run with the fix applied
            : FailureProcessingResult.Continue;
    }
}
