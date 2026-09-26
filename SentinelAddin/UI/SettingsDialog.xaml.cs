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
        TemplatePathBox.Text = _current.RevitTemplatePath;
        // The DOCUMENT's code (never the merged machine value): a project-scope save must not turn a machine default
        // into a document fact — CDE-01 reads ProjectCode from the document only, so a machine has none to show.
        ProjectCodeBox.Text = doc is null ? "" : SettingsManager.LoadFromDocument(doc)?.ProjectCode ?? "";
        GhostFolderBox.Text = _current.GhostSourceFolder;
        // The DOCUMENT's key only (never the merged machine value): saving at project scope can then never copy
        // a machine key into a model the user did not bind.
        WebProjectBox.Text = ProjectContext.For(doc).Key;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;      // no document open
            ScopeMachine.IsChecked = true;
        }
        ScopeProject.Checked += (_, _) => SyncWebProjectScope();
        ScopeMachine.Checked += (_, _) => SyncWebProjectScope();
        SyncWebProjectScope();
        LoadWebProjects();
    }

    /// <summary>The web project and the project code belong to a DOCUMENT (Extensible Storage); a machine has
    /// neither. At machine scope both boxes are disabled and the save leaves every document's values alone.</summary>
    private void SyncWebProjectScope()
    {
        var machine = ScopeMachine.IsChecked == true;
        WebProjectBox.IsEnabled = !machine;
        ProjectCodeBox.IsEnabled = !machine;
        WebProjectScopeNote.Text = machine
            ? "Machine scope does not bind a model or set its project code — pick \"Current project\" to set them."
            : "";
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

            var keys = new System.Collections.Generic.List<(string Key, string Name, string? Office, bool IsOffice)>();
            using var jd = System.Text.Json.JsonDocument.Parse(json);
            if (jd.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                foreach (var p in jd.RootElement.EnumerateArray())
                {
                    var key = p.TryGetProperty("key", out var k) ? k.GetString() : null;
                    if (string.IsNullOrWhiteSpace(key)) continue;
                    var name = p.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var office = p.TryGetProperty("office_name", out var o) && o.ValueKind == System.Text.Json.JsonValueKind.String ? o.GetString() : null;
                    var isOffice = p.TryGetProperty("kind", out var kd) && kd.ValueKind == System.Text.Json.JsonValueKind.String && kd.GetString() == "office";
                    keys.Add((key!, name ?? key!, office, isOffice));
                }

            var typed = WebProjectBox.Text; // preserve what was loaded from settings
            foreach (var (key, name, office, isOffice) in keys)
            {
                var label = name == key ? key : $"{name} ({key})";
                if (isOffice) label += " · office";
                else if (!string.IsNullOrWhiteSpace(office)) label += " · " + office;
                WebProjectBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = label, Tag = key });
            }
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
        // net48 WPF has no OpenFolderDialog; WinForms' FolderBrowserDialog does the job (network drives and
        // ACC Desktop Connector paths are ordinary paths to it). Revit 2024 users got a "paste the path"
        // message here instead of a picker (simulation 3.9, F47).
        using var dlg = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "Select the Ghost source folder (DWGs, specs, sketches)",
            SelectedPath = GhostFolderBox.Text,
            ShowNewFolderButton = false,
        };
        if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK) GhostFolderBox.Text = dlg.SelectedPath;
#else
        var dlg = new OpenFolderDialog { Title = "Select the Ghost source folder" };
        if (dlg.ShowDialog(this) == true) GhostFolderBox.Text = dlg.FolderName;
#endif
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        var template = TemplatePathBox.Text.Trim();
        var code = ProjectCodeBox.Text.Trim().ToUpperInvariant();
        var ghostFolder = GhostFolderBox.Text.Trim();
        var webProject = WebProjectKey();

        if (ScopeMachine.IsChecked == true)
        {
            // Load the UNMERGED machine settings (not the doc+machine merge shown in the dialog) so
            // saving to machine can't bake in project-only values, or blow away machine fields this
            // dialog doesn't show.
            var settings = SettingsManager.LoadFromMachine() ?? new SentinelSettings();
            settings.RevitTemplatePath = template;
            settings.GhostSourceFolder = ghostFolder; // no WebProjectKey or ProjectCode: both are document facts
            SettingsManager.SaveToMachine(settings);
            StatusText.Text = "✓ Saved as machine default (" + SettingsManager.ConfigJsonPath + ")";
            App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document)); // machine settings never pick the ruleset
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
            settings.RevitTemplatePath = template;
            settings.ProjectCode = code;
            settings.GhostSourceFolder = ghostFolder;
            settings.WebProjectKey = webProject;
            using var t = new Transaction(doc, "Sentinel: Save project settings");
            t.Start();
            SettingsManager.SaveToDocument(doc, settings);
            t.Commit();
            App.ReloadRuleset(doc); // the web project key may have changed: its ruleset@n, rescan and strip follow
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
