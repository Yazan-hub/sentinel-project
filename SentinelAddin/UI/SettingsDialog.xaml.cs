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
    public SettingsDialog(Document? doc)
    {
        InitializeComponent();
        var current = SettingsManager.Resolve(doc);
        RulesetPathBox.Text = current.MasterRulesetPath;
        TemplatePathBox.Text = current.RevitTemplatePath;
        ProjectCodeBox.Text = current.ProjectCode;
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

    private void OnSave(object sender, RoutedEventArgs e)
    {
        var settings = new SentinelSettings
        {
            MasterRulesetPath = RulesetPathBox.Text.Trim(),
            RevitTemplatePath = TemplatePathBox.Text.Trim(),
            ProjectCode = ProjectCodeBox.Text.Trim().ToUpperInvariant(),
        };

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
