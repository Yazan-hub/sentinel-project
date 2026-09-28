using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

/// <summary>
/// Describe an issue raised from Revit: title, description, type, priority, assignee, due date — the web Issues
/// panel's fields. What it points at (the selected elements, the camera) was captured before it opened and is shown,
/// not edited. Create is enabled once there is a title; the draft's own Refusal() is the last word.
/// </summary>
public sealed class NewIssueDialog : Window
{
    private readonly IssueDraft _draft;
    private readonly TextBox _title = new() { Margin = new Thickness(0, 2, 0, 8) };
    private readonly TextBox _description = new() { Height = 90, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 2, 0, 8) };
    private readonly ComboBox _type = new() { Margin = new Thickness(0, 2, 8, 8), MinWidth = 110 };
    private readonly ComboBox _priority = new() { Margin = new Thickness(0, 2, 0, 8), MinWidth = 110 };
    private readonly TextBox _assignee = new() { Margin = new Thickness(0, 2, 0, 8) };
    private readonly DatePicker _due = new() { Margin = new Thickness(0, 2, 0, 8) };
    private readonly TextBlock _error = new() { Foreground = Brushes.IndianRed, TextWrapping = TextWrapping.Wrap };
    private readonly Button _create = new() { Content = "Create issue", Padding = new Thickness(14, 5, 14, 5), IsDefault = true, FontWeight = FontWeights.SemiBold };

    public NewIssueDialog(IssueDraft draft, string pointsAt)
    {
        _draft = draft;
        Title = "Sentinel — New issue";
        Width = 460; SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize; ShowInTaskbar = false;

        foreach (var t in IssueDraft.Types) _type.Items.Add(t);
        foreach (var p in IssueDraft.Priorities) _priority.Items.Add(p);
        _type.SelectedItem = draft.TopicType; _priority.SelectedItem = draft.Priority;
        _title.Text = draft.Title; _description.Text = draft.Description;
        _title.TextChanged += (_, __) => _create.IsEnabled = _title.Text.Trim().Length > 0;
        _create.IsEnabled = _title.Text.Trim().Length > 0;
        _create.Click += (_, __) => OnCreate();
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(14, 5, 14, 5), Margin = new Thickness(8, 0, 0, 0), IsCancel = true };

        TextBlock Label(string s) => new() { Text = s, FontWeight = FontWeights.SemiBold };
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        var typeCol = new StackPanel(); typeCol.Children.Add(Label("Type")); typeCol.Children.Add(_type);
        var prioCol = new StackPanel(); prioCol.Children.Add(Label("Priority")); prioCol.Children.Add(_priority);
        row.Children.Add(typeCol); row.Children.Add(prioCol);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(_create); buttons.Children.Add(cancel);

        var root = new StackPanel { Margin = new Thickness(14) };
        root.Children.Add(new TextBlock { Text = pointsAt, Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 10) });
        root.Children.Add(Label("Title")); root.Children.Add(_title);
        root.Children.Add(Label("Description")); root.Children.Add(_description);
        root.Children.Add(row);
        root.Children.Add(Label("Assigned to (e-mail or name)")); root.Children.Add(_assignee);
        root.Children.Add(Label("Due date (optional)")); root.Children.Add(_due);
        root.Children.Add(_error);
        root.Children.Add(buttons);
        Content = root;
        Loaded += (_, __) => { _title.Focus(); _title.SelectAll(); };
    }

    private void OnCreate()
    {
        _draft.Title = _title.Text;
        _draft.Description = _description.Text;
        _draft.TopicType = _type.SelectedItem as string ?? "Issue";
        _draft.Priority = _priority.SelectedItem as string ?? "Normal";
        _draft.AssignedTo = _assignee.Text;
        _draft.DueDate = _due.SelectedDate;
        var why = _draft.Refusal();
        if (why != null) { _error.Text = why; return; }
        DialogResult = true;
    }
}
