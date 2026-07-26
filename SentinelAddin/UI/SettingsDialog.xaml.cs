using System.Windows;
using Autodesk.Revit.DB;
using Microsoft.Win32;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// Project Setup: dual-layer settings editor. Machine-level saves happen
/// synchronously (plain file IO); project-level saves are queued through the
/// ExternalEvent hub because Extensible Storage needs a transaction.
/// </summary>
public partial class SettingsDialog : Window
{
    private readonly SentinelSettings _current;

    public SettingsDialog(Document? doc)
    {
        InitializeComponent();
        _current = SettingsManager.Resolve(doc);
        RulesetPathBox.Text = _current.MasterRulesetPath;
        TemplatePathBox.Text = _current.RevitTemplatePath;
        ProjectCodeBox.Text = _current.ProjectCode;
        GhostFolderBox.Text = _current.GhostSourceFolder;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;      // no document open
            ScopeMachine.IsChecked = true;
        }
    }

    private void OnBrowseRuleset(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Title = "Select master ruleset",
            Filter = "Sentinel ruleset (*.json)|*.json|All files (*.*)|*.*",
            CheckFileExists = true,
        };
        if (dlg.ShowDialog(this) == true) RulesetPathBox.Text = dlg.FileName;
    }

    private void OnBrowseTemplate(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            Title = "Select Revit template",
            Filter = "Revit template (*.rte)|*.rte|Revit files (*.rvt;*.rte)|*.rvt;*.rte|All files (*.*)|*.*",
            CheckFileExists = true,
        };
        if (dlg.ShowDialog(this) == true) TemplatePathBox.Text = dlg.FileName;
    }

    private void OnBrowseGhostFolder(object sender, RoutedEventArgs e)
    {
#if NET48
        // net48 WPF has no folder dialog; the TextBox accepts a pasted path.
        MessageBox.Show(this, "Paste the folder path into the box (network drives and ACC Desktop Connector paths work).",
            "Sentinel", MessageBoxButton.OK, MessageBoxImage.Information);
#else
        var dlg = new OpenFolderDialog { Title = "Select the Ghost source folder" };
        if (dlg.ShowDialog(this) == true) GhostFolderBox.Text = dlg.FolderName;
#endif
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        // Mutate the RESOLVED settings so fields this dialog doesn't show survive the save.
        _current.MasterRulesetPath = RulesetPathBox.Text.Trim();
        _current.RevitTemplatePath = TemplatePathBox.Text.Trim();
        _current.ProjectCode = ProjectCodeBox.Text.Trim().ToUpperInvariant();
        _current.GhostSourceFolder = GhostFolderBox.Text.Trim();
        var settings = _current;

        if (ScopeMachine.IsChecked == true)
        {
            SettingsManager.SaveToMachine(settings);
            StatusText.Text = "✓ Saved as machine default (" + SettingsManager.ConfigJsonPath + ")";
            App.Engine?.ReloadRuleset(null);
            DialogResult = true;
            Close();
            return;
        }

        // Project scope: ES write needs a transaction -> ExternalEvent queue.
        StatusText.Text = "Saving to project…";
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            if (doc is null) return;
            using var t = new Transaction(doc, "Sentinel: Save project settings");
            t.Start();
            SettingsManager.SaveToDocument(doc, settings);
            t.Commit();
            App.Engine?.ReloadRuleset(doc);
        });
        DialogResult = true;
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
