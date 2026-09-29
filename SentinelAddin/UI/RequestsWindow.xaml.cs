using System.Collections.ObjectModel;
using System.Windows;
using Autodesk.Revit.DB;
using Sentinel.Workflow;

namespace Sentinel.UI;

public sealed class RequestRow
{
    public RequestRow(ChangeRequest r)
    {
        Id = r.Id;
        RuleId = r.RuleId;
        ElementId = r.ElementId;
        Category = r.ElementCategory;
        OldValue = r.OldValue;
        NewValue = r.NewValue;
        RequestedBy = r.RequestedBy;
        When = r.RequestedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
    }
    public Guid Id { get; }
    public string RuleId { get; }
    public long ElementId { get; }
    public string Category { get; }
    public string OldValue { get; }
    public string NewValue { get; }
    public string RequestedBy { get; }
    public string When { get; }
}

public partial class RequestsWindow : Window
{
    private readonly Document _doc;
    public ObservableCollection<RequestRow> Rows { get; } = new ObservableCollection<RequestRow>();

    public RequestsWindow(Document doc, bool isCoordinator)
    {
        _doc = doc;
        InitializeComponent();
        RequestList.ItemsSource = Rows;
        Reload();
        SubHeader.Text = isCoordinator
            ? $"{Rows.Count} pending — approve keeps a change (or applies a ⚡ proposal); reject reverts it (or drops the proposal)"
            : $"{Rows.Count} pending — read-only (you are not listed as a coordinator)";
        if (!isCoordinator) RequestList.IsEnabled = false;
    }

    private void Reload()
    {
        Rows.Clear();
        foreach (var r in RequestStore.GetPending(_doc)) Rows.Add(new RequestRow(r));
    }

    private void OnShow(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is RequestRow row)
            ShowPendingChangeCommand.Show(_doc, row.ElementId); // visual diff: green fill + isolate
    }

    protected override void OnClosed(EventArgs e)
    {
        ShowPendingChangeCommand.ResetFromUi(); // restore original graphics
        base.OnClosed(e);
    }

    private void OnApprove(object sender, RoutedEventArgs e) => Verdict(sender, approve: true);
    private void OnReject(object sender, RoutedEventArgs e) => Verdict(sender, approve: false);

    private void Verdict(object sender, bool approve)
    {
        if ((sender as FrameworkElement)?.DataContext is not RequestRow row) return;
        var id = row.Id;
        // Revit API work goes through the ExternalEvent hub (we're on the WPF thread), pinned to the document this window
        // was opened for (XC-1): refused in words when it is closed or another model is active. The row leaves the list
        // only once the verdict is written.
        App.Events?.Enqueue(_doc, approve ? "approve the request" : "reject the request", (_, d) =>
        {
            using var t = new Transaction(d, approve ? "Sentinel: Approve request" : "Sentinel: Reject request");
            t.Start();
            RequestManager.Resolve(d, id, approve, note: null);
            t.Commit();
            Dispatcher.Invoke(() => { Rows.Remove(row); SubHeader.Text = $"{Rows.Count} pending"; });
        });
    }
}
