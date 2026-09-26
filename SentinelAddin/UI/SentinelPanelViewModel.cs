using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Threading.Tasks;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Workflow;

namespace Sentinel.UI;

public sealed class ViolationRow
{
    public ViolationRow(Violation v, Ruleset? rs)
    {
        Rule = rs?.Rules.FirstOrDefault(r => r.Id == v.RuleId);
        Org = rs?.Org;
        RuleId = v.RuleId;
        Mode = v.Mode.ToString().ToUpperInvariant();
        ElementId = v.ElementId;
        ElementName = v.ElementName;
        Message = v.MessageEn;
        MessageAr = v.MessageAr;
        DocRef = v.DocRef ?? "";
        CanFix = ComputeCanFix(v, Rule);
    }

    /// The rule that judged this row, from the ruleset of the document it was scanned in (null for a check
    /// outside the ruleset, e.g. CDE-01 or IFC pre-flight), and that ruleset's office code.
    public Rule? Rule { get; }
    public string? Org { get; }

    public string RuleId { get; }
    public string Mode { get; }
    public long ElementId { get; }
    public string ElementName { get; }
    public string Message { get; }
    public string? MessageAr { get; }
    public string DocRef { get; }
    public bool CanFix { get; }
    public Visibility FixVisibility => CanFix ? Visibility.Visible : Visibility.Collapsed;

    /// Fix applies only to warn/request naming rules with a token schema on a
    /// real element (worksets report ElementId -1; parameter rules have no
    /// tokens to synthesize a name from).
    private static bool ComputeCanFix(Violation v, Rule? rule)
    {
        if (v.ElementId <= 0) return false;
        if (v.Mode != EnforcementMode.Warn && v.Mode != EnforcementMode.Request) return false;
        // Type renames go through the Naming Manager: the one-row Fix would suffix on a collision.
        return rule is not null && rule.Tokens.Count > 0 && rule.Target != RuleTarget.Type;
    }
}

public sealed class SentinelPanelViewModel : INotifyPropertyChanged
{
    public ObservableCollection<ViolationRow> Violations { get; } = new ObservableCollection<ViolationRow>();

    private double _score = 100;
    public double Score { get => _score; private set { _score = value; OnChanged(); OnChanged(nameof(ScoreText)); } }
    private string? _notScored;   // set when no ruleset judged the rows: no percentage, no grade
    public string ScoreText => _notScored is null ? $"{Score:F1}% compliant" : "Not scored — no ruleset judged this model";

    private string _status = "No scan yet";
    public string Status { get => _status; private set { _status = value; OnChanged(); } }

    /// Full-scan result replaces panel content (open / sync / Scan Now).
    public void PublishReport(ScanReport report) => OnUi(() =>
    {
        Violations.Clear();
        foreach (var v in report.Violations) Violations.Add(new ViolationRow(v, report.Ruleset));
        _notScored = report.NotScored;
        Score = report.Score;   // raises ScoreText, which reads _notScored
        Status = report.NotScored is { } why
            ? $"{report.DocTitle} — {why}"
            : $"{report.DocTitle} — {report.ElementsChecked} elements in {report.DurationMs} ms";
    });

    /// DMU delta: replace rows belonging to the changed elements only.
    public void MergeDelta(IReadOnlyList<long> changedIds, IReadOnlyList<Violation> fresh, Ruleset rs) => OnUi(() =>
    {
        var stale = Violations.Where(r => changedIds.Contains(r.ElementId)).ToList();
        foreach (var s in stale) Violations.Remove(s);
        foreach (var v in fresh) Violations.Add(new ViolationRow(v, rs));
        // Keep the reason a model is not scored in view: a live edit must not replace "none — <why>".
        Status = _notScored is { } why
            ? $"{why} · live — updated {DateTime.Now:HH:mm:ss}"
            : $"Live — updated {DateTime.Now:HH:mm:ss}";
    });

    /// 'Revit Doctor' log: native warnings auto-resolved/suppressed.
    public ObservableCollection<string> DoctorLog { get; } = new ObservableCollection<string>();

    public void LogDoctor(string line) => OnUi(() =>
    {
        DoctorLog.Insert(0, DateTime.Now.ToString("HH:mm:ss") + "  " + line);
        while (DoctorLog.Count > 200) DoctorLog.RemoveAt(DoctorLog.Count - 1);
        OnChanged(nameof(DoctorHeader));
    });

    public string DoctorHeader => $"Doctor — {DoctorLog.Count} auto-resolved warning(s)";

    public void RaisePendingRequest(Violation v) =>
        OnUi(() => Status = $"⏳ Change request created for '{v.ElementName}' — awaiting coordinator ({v.RuleId})");

    public void RaiseWarnToast(Violation v) =>
        OnUi(() => Status = $"⚠ {v.RuleId}: {v.MessageEn}");

    // ── Next strip: the project's journey from the web (read-only; GET /cde/:key/journey) ──────────
    private string _journeyKey = "Journey — open or scan a document bound to a web project";
    public string JourneyKey { get => _journeyKey; private set { _journeyKey = value; OnChanged(); } }
    private string _standardsLine = "";
    public string StandardsLine { get => _standardsLine; private set { _standardsLine = value; OnChanged(); } }
    private string _nextLine = "";
    public string NextLine { get => _nextLine; private set { _nextLine = value; OnChanged(); } }
    private string _scanRulesetLine = "";
    public string ScanRulesetLine { get => _scanRulesetLine; private set { _scanRulesetLine = value; OnChanged(); } }
    private int _journeySeq;
    /// Bumped (on the Revit API thread) by every refresh, ShowUnbound and ShowLoading: a caller that captured it can
    /// tell whether the strip has moved on since.
    internal int JourneySeq => _journeySeq;

    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with what was read there: the
    /// document's web key and where the ruleset that judged the rows came from. The GET (up to 4 s) runs on a
    /// background task; the result is set back on the pane's thread. A newer refresh wins over a slower older
    /// one; a failure clears the strip and says so — never stale data.
    public void RefreshJourney(string projectKey, ResolvedArtefact local)
    {
        var seq = ++_journeySeq;
        OnUi(() =>
        {
            // Like the web strip: while loading, no line from the previous document or ruleset stays up.
            JourneyKey = $"Journey · {projectKey} — loading…";
            StandardsLine = NextLine = ScanRulesetLine = "";
        });
        // Same dispatcher OnUi uses: the pane's (WPF application) dispatcher when there is one.
        var ui = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => { var info = GovernedQuery.Journey(projectKey, out var why); return (info, why); }).ContinueWith(t => ui.BeginInvoke(new Action(() =>
        {
            if (seq != _journeySeq) return;
            var (j, why) = t.Status == TaskStatus.RanToCompletion ? t.Result : (null, t.Exception?.GetBaseException().Message);
            JourneyKey = j is null ? $"Journey · {projectKey}" : $"Journey · {j.Key} ({j.Kind})";
            StandardsLine = j?.StandardsLine ?? "";
            NextLine = j?.NextLine ?? $"Journey unavailable — {why ?? "the bridge did not answer for this project"}";
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(local, j);
        })));
    }

    /// The document has no web project: say so, and where to bind it — never a journey for "default". Bumps the
    /// sequence so a slower GET for the previous document cannot overwrite this.
    public void ShowUnbound()
    {
        ++_journeySeq;
        OnUi(() =>
        {
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = ScanRulesetLine = "";
        });
    }

    /// The active document's ruleset@n is still on its way: nothing from the previous document stays up and nothing
    /// is scored; the landing publishes the scan and the strip. Bumps the sequence like ShowUnbound.
    public void ShowLoading(string docTitle)
    {
        ++_journeySeq;
        OnUi(() =>
        {
            Violations.Clear();
            _notScored = "loading";
            Score = 0; // raises ScoreText, which reads _notScored
            Status = $"{docTitle} — loading its ruleset…";
            JourneyKey = "Journey — loading…";
            StandardsLine = NextLine = ScanRulesetLine = "";
        });
    }

    /// Row double-click -> select/zoom in Revit via the ExternalEvent hub.
    public void RequestSelect(ViolationRow row)
    {
        if (row.ElementId > 0) App.Events?.SelectAndShow(row.ElementId);
    }

    /// Fix button -> Auto-Remediator on the ExternalEvent queue. On success the
    /// row is removed here immediately; the DMU snapshot update inside
    /// AutoFixExecution prevents the rename from being re-flagged.
    public void RequestFix(ViolationRow row, System.IntPtr ownerHandle = default)
    {
        if (!row.CanFix) return;

        // Human-in-the-loop: show synthesized suggestion in an editable dialog;
        // nothing touches the model until the coordinator clicks Execute.
        var suggestion = AutoFixExecution.Suggest(row.ElementName, row.Rule, row.Org);
        if (suggestion is null) return;
        var dialog = new FixReviewDialog(row.ElementName, row.RuleId, row.Rule, suggestion);
        DialogOwner.Attach(dialog, ownerHandle);
        if (dialog.ShowDialog() != true || string.IsNullOrWhiteSpace(dialog.FinalName)) return;

        Status = $"⚡ Fixing '{row.ElementName}' ({row.RuleId})…";
        AutoFixExecution.Run(row.ElementId, row.RuleId, (oldName, newName) => OnUi(() =>
        {
            if (newName is null)
            {
                Status = $"✕ Could not auto-fix '{row.ElementName}' ({row.RuleId}) — rename manually.";
                return;
            }
            var match = Violations.FirstOrDefault(r =>
                r.ElementId == row.ElementId && r.RuleId == row.RuleId);
            if (match is not null) Violations.Remove(match);
            Status = $"✓ Auto-fixed: '{oldName}' → '{newName}' ({row.RuleId})";
        }), dialog.FinalName);
    }

    private static void OnUi(Action a)
    {
        var d = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        if (d.CheckAccess()) a();
        else d.Invoke(a);
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnChanged([CallerMemberName] string? n = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(n));
}
