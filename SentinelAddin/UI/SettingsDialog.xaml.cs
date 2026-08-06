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
        WebProjectBox.Text = _current.WebProjectKey;
        LinkedModelsBox.IsChecked = _current.PublishLinkedModels;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;      // no document open
            ScopeMachine.IsChecked = true;
        }
        LoadWebProjects();
    }

    /// <summary>
    /// Populate the web-project picker from the bridge (GET /cde/projects). Async and best-effort:
    /// an unreachable bridge leaves the ComboBox as a plain editable text field (type the key) —
    /// Project Setup must never block on the network.
    /// </summary>
    private async void LoadWebProjects()
    {
        try
        {
            var cfg = Sentinel.Commands.BcfConfig.Load();
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            var msg = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get,
                cfg.ServiceUrl.TrimEnd('/') + "/cde/projects");
            if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                msg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
            var resp = await http.SendAsync(msg);
            resp.EnsureSuccessStatusCode();
            var json = await resp.Content.ReadAsStringAsync();

            var keys = new System.Collections.Generic.List<(string Key, string Name)>();
            using var jd = System.Text.Json.JsonDocument.Parse(json);
            if (jd.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                foreach (var p in jd.RootElement.EnumerateArray())
                {
                    var key = p.TryGetProperty("key", out var k) ? k.GetString() : null;
                    if (string.IsNullOrWhiteSpace(key)) continue;
                    var name = p.TryGetProperty("name", out var n) ? n.GetString() : null;
                    keys.Add((key!, name ?? key!));
                }

            var typed = WebProjectBox.Text; // preserve what was loaded from settings
            foreach (var (key, name) in keys)
                WebProjectBox.Items.Add(new System.Windows.Controls.ComboBoxItem
                {
                    Content = name == key ? key : $"{name} ({key})",
                    Tag = key,
                });
            WebProjectBox.Text = typed;
            WebProjectHint.Text = keys.Count > 0
                ? $"{keys.Count} project(s) on the web app. Pick one, or type a key."
                : "No projects on the web app yet — create one there, or type a key.";
        }
        catch
        {
            WebProjectHint.Text = "Bridge unreachable — type the project key (e.g. \"demo\").";
        }
    }

    /// <summary>The chosen project KEY: a picked item's Tag, else the typed text.</summary>
    private string WebProjectKey()
    {
        if (WebProjectBox.SelectedItem is System.Windows.Controls.ComboBoxItem it && it.Tag is string key)
            return key.Trim();
        return (WebProjectBox.Text ?? "").Trim();
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
        var path = RulesetPathBox.Text.Trim();
        var template = TemplatePathBox.Text.Trim();
        var code = ProjectCodeBox.Text.Trim().ToUpperInvariant();
        var ghostFolder = GhostFolderBox.Text.Trim();
        var webProject = WebProjectKey();
        var linkedModels = LinkedModelsBox.IsChecked == true;

        if (ScopeMachine.IsChecked == true)
        {
            // Load the UNMERGED machine settings (not the doc+machine merge shown in the dialog) so
            // saving to machine can't bake in project-only values, or blow away machine fields this
            // dialog doesn't show.
            var settings = SettingsManager.LoadFromMachine() ?? new SentinelSettings();
            settings.MasterRulesetPath = path;
            settings.RevitTemplatePath = template;
            settings.ProjectCode = code;
            settings.GhostSourceFolder = ghostFolder;
            settings.WebProjectKey = webProject;
            settings.PublishLinkedModels = linkedModels;
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
            // Load the UNMERGED project settings (not the doc+machine merge shown in the dialog) so
            // saving to project can't bake in machine-local paths, or blow away project fields this
            // dialog doesn't show.
            var settings = SettingsManager.LoadFromDocument(doc) ?? new SentinelSettings();
            settings.MasterRulesetPath = path;
            settings.RevitTemplatePath = template;
            settings.ProjectCode = code;
            settings.GhostSourceFolder = ghostFolder;
            settings.WebProjectKey = webProject;
            settings.PublishLinkedModels = linkedModels;
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
