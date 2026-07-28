using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using Sentinel.Engine;
using Sentinel.Workflow;

namespace Sentinel.UI;

public sealed class ViolationRow
{
    public ViolationRow(Violation v)
    {
        RuleId = v.RuleId;
        Mode = v.Mode.ToString().ToUpperInvariant();
        ElementId = v.ElementId;
        ElementName = v.ElementName;
        Message = v.MessageEn;
        MessageAr = v.MessageAr;
        DocRef = v.DocRef ?? "";
        CanFix = ComputeCanFix(v);
    }

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
    private static bool ComputeCanFix(Violation v)
    {
        if (v.ElementId <= 0) return false;
        if (v.Mode != EnforcementMode.Warn && v.Mode != EnforcementMode.Request) return false;
        var rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == v.RuleId);
        return rule is not null && rule.Tokens.Count > 0;
    }
}

public sealed class SentinelPanelViewModel : INotifyPropertyChanged
{
    public ObservableCollection<ViolationRow> Violations { get; } = new ObservableCollection<ViolationRow>();

    private double _score = 100;
    public double Score { get => _score; private set { _score = value; OnChanged(); OnChanged(nameof(ScoreText)); } }
    public string ScoreText => $"{Score:F1}% compliant";

    private string _status = "No scan yet";
    public string Status { get => _status; private set { _status = value; OnChanged(); } }

    /// Full-scan result replaces panel content (open / sync / Scan Now).
    public void PublishReport(ScanReport report) => OnUi(() =>
    {
        Violations.Clear();
        foreach (var v in report.Violations) Violations.Add(new ViolationRow(v));
        Score = report.Score;
        Status = $"{report.DocTitle} — {report.ElementsChecked} elements in {report.DurationMs} ms";
    });

    /// DMU delta: replace rows belonging to the changed elements only.
    public void MergeDelta(IReadOnlyList<long> changedIds, IReadOnlyList<Violation> fresh) => OnUi(() =>
    {
        var stale = Violations.Where(r => changedIds.Contains(r.ElementId)).ToList();
        foreach (var s in stale) Violations.Remove(s);
        foreach (var v in fresh) Violations.Add(new ViolationRow(v));
        Status = $"Live — updated {DateTime.Now:HH:mm:ss}";
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
        var suggestion = AutoFixExecution.Suggest(row.ElementName, row.RuleId);
        if (suggestion is null) return;
        var dialog = new FixReviewDialog(row.ElementName, row.RuleId, suggestion);
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
