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
    private readonly Document? _doc;   // the model this dialog was opened on (XC-1)

    public SettingsDialog(Document? doc)
    {
        _doc = doc;
        InitializeComponent();
        // H4: who the bridge will see. The sign-in itself lives in Sentinel ▸ Sign in.
        WhoText.Text = Sentinel.Coordination.UserSession.Email is { } who
            ? "Signed in as " + who + " (Sentinel ▸ Sign in to sign out)."
            : "Signed out — Sentinel ▸ Sign in to act under your own name; until then this PC's shared token (if any) is used.";
        _current = SettingsManager.Resolve(doc);
        // The DOCUMENT's code (never the merged machine value): a project-scope save must not turn a machine default
        // into a document fact — CDE-01 reads ProjectCode from the document only, so a machine has none to show.
        ProjectCodeBox.Text = doc is null ? "" : SettingsManager.LoadFromDocument(doc)?.ProjectCode ?? "";
        GhostFolderBox.Text = _current.GhostSourceFolder;
        DoctorAxisFixBox.IsChecked = doc is not null && SettingsManager.LoadFromDocument(doc)?.DoctorAxisFix == true; // a document fact, as the code
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
        // SEC-4 (S28): the note above Save names the web project a project-scope save confirms on this PC.
        WebProjectBox.AddHandler(System.Windows.Controls.Primitives.TextBoxBase.TextChangedEvent,
            new System.Windows.Controls.TextChangedEventHandler((_, _) => SyncWebProjectScope()));
        WebProjectBox.SelectionChanged += (_, _) => SyncWebProjectScope();
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
        DoctorAxisFixBox.IsEnabled = !machine;
        WebProjectScopeNote.Text = machine
            ? "Machine scope does not bind a model, set its project code or its Doctor — pick \"Current project\" to set them."
            : ModelBindings.SaveNote(WebProjectKey());
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
            if (cfg.Refusal is { } refused) { WebProjectHint.Text = refused; return; } // SEC-3: no token is sent to that address
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            var msg = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Get,
                cfg.ServiceUrl.TrimEnd('/') + "/cde/projects");
            if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                msg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
            var resp = await http.SendAsync(msg);
            if ((int)resp.StatusCode == 401) { WebProjectHint.Text = "Signed out — Sentinel ▸ Sign in, or type the project key."; return; }
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
        catch (Sentinel.Coordination.SessionException e) { WebProjectHint.Text = e.Message + " — or type the project key."; } // SI-1
        catch
        {
            WebProjectHint.Text = "Bridge unreachable — type the project key (e.g. \"demo\").";
        }
    }

    /// <summary>The chosen project KEY: the key of the listed project whose label the box shows, else the text as typed.
    /// The box's text is the only source (drill MA1a-I35): its text search is off, because it completed a typed key against
    /// the projects' display names ("ma1a-block" became "MA1a-block"), and with it off a typed key no longer moves the
    /// selection, so the selected item is not read.</summary>
    private string WebProjectKey()
    {
        var text = (WebProjectBox.Text ?? "").Trim();
        foreach (var item in WebProjectBox.Items)
            if (item is System.Windows.Controls.ComboBoxItem { Content: string label, Tag: string key } && label == text)
                return key.Trim();
        return text;
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
        var code = ProjectCodeBox.Text.Trim().ToUpperInvariant();
        var ghostFolder = GhostFolderBox.Text.Trim();
        var webProject = WebProjectKey();
        var axisFix = DoctorAxisFixBox.IsChecked == true;

        if (ScopeMachine.IsChecked == true)
        {
            // Load the UNMERGED machine settings (not the doc+machine merge shown in the dialog) so
            // saving to machine can't bake in project-only values, or blow away machine fields this
            // dialog doesn't show.
            var settings = SettingsManager.LoadFromMachine() ?? new SentinelSettings();
            // No WebProjectKey or ProjectCode: both are document facts. SEC-2: while the box still shows the folder the model
            // names, this PC keeps its own — a machine save never turns a model's folder into this PC's.
            if (!(_current.SourceFolderFromModel && ghostFolder == _current.GhostSourceFolder)) settings.GhostSourceFolder = ghostFolder;
            SettingsManager.SaveToMachine(settings);
            StatusText.Text = "✓ Saved as machine default (" + SettingsManager.ConfigJsonPath + ")";
            App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document)); // machine settings never pick the ruleset
            DialogResult = true;
            Close();
            return;
        }

        // Project scope: ES write needs a transaction -> ExternalEvent queue. SEC-2: while the box still shows this PC's own
        // folder (the model names none), the model keeps naming none — this PC's folder is never copied into a model. A folder
        // the tools would refuse from a model (a share, not a full path) is said here and not saved.
        if (!_current.SourceFolderFromModel && ghostFolder == (_current.GhostSourceFolder ?? "").Trim()) ghostFolder = "";
        if (LocalOnly.FolderRefusal(ghostFolder, fromModel: true) is { } notLocal) { StatusText.Text = notLocal; return; }
        StatusText.Text = "Saving to project…";
        if (_doc is null) { StatusText.Text = "No open model to save the project settings into."; return; }
        App.Events?.Enqueue(_doc, "save the project settings", (uiapp, doc) =>
        {
            // Load the UNMERGED project settings (not the doc+machine merge shown in the dialog) so
            // saving to project can't bake in machine-local paths, or blow away project fields this
            // dialog doesn't show.
            var settings = SettingsManager.LoadFromDocument(doc) ?? new SentinelSettings();
            settings.ProjectCode = code;
            settings.GhostSourceFolder = ghostFolder;
            settings.WebProjectKey = webProject;
            settings.DoctorAxisFix = axisFix;
            using var t = new Transaction(doc, "Sentinel: Save project settings");
            t.Start();
            SettingsManager.SaveToDocument(doc, settings);
            t.Commit();
            // SEC-4 (S28): saving the model's web project here is this PC's confirmation of it for this model (a blank one
            // removes it). A model with no file yet is confirmed by the next Save here after it has one.
            var model = ModelBindings.IdentityOf(doc);
            ModelBindings.Confirm(model, webProject);
            if (model.Length == 0 && webProject.Length > 0)
                App.PanelVm?.LogDoctor("Project Setup: this model has no file yet — save it, then Project Setup ▸ Save again so this PC confirms its web project.");
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
