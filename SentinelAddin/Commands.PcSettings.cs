#nullable disable
// The founder's rule (2026-10-19): a BIM manager never edits a .json file. Standards & Build ▸ Standards ▸ PC Settings shows this PC's own
// settings — the bridge and the sign-in (bcf-config.json), the local AI and Ghost Builder's paths (config.json) — as plain fields, with a
// Test per connection that answers in words. Save writes only what changed into the same files the add-in reads, keeps every other key and
// backs the old file up first (PcSettings, Revit-free). Tokens and keys are never shown or logged: a blank secret box keeps the saved one.
// PR-1: this PC's shared token stays with the bridge on this PC. Code-only WPF, in Protection's style.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Grid = System.Windows.Controls.Grid;
using TextBox = System.Windows.Controls.TextBox;

namespace Sentinel.Commands;

[Transaction(TransactionMode.ReadOnly)]
public sealed class PcSettingsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var win = new PcSettingsWindow();
        new System.Windows.Interop.WindowInteropHelper(win) { Owner = c.Application.MainWindowHandle };
        win.Show();
        return Result.Succeeded;
    }
}

public sealed class PcSettingsWindow : Window
{
    private static readonly SentinelSettings Defaults = new();
    private readonly TextBox _serviceUrl = Box(), _modelId = Box(), _supabaseUrl = Box();
    private readonly PasswordBox _token = new() { Padding = new Thickness(3) }, _anonKey = new() { Padding = new Thickness(3) };
    private readonly CheckBox _removeToken = new() { Content = "Remove it", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 0, 0) };
    private readonly TextBlock _tokenState = Note(), _anonState = Note();
    private readonly TextBox _ollamaUrl = Box(), _ghostModel = Box(), _visionModel = Box(), _familyDir = Box(), _schemaPath = Box();
    private readonly CheckBox _cloudOptIn = new() { Content = "Allow a model off this PC (https only — drawings and photos then leave this PC)", Margin = new Thickness(0, 4, 0, 2) };
    private readonly TextBlock _bridgeTest = Note(), _signInTest = Note(), _modelTest = Note();
    private readonly TextBlock _status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0), MinHeight = 34 };
    private readonly Button _save = new() { Content = "Save", Padding = new Thickness(14, 4, 14, 4), FontWeight = FontWeights.Bold };
    private JsonObject _bcf, _cfg;            // the files as read (null: did not read — Save starts from empty, the backup keeps the old)
    private string _bcfError, _cfgError;
    private Dictionary<string, string> _shown = new(); // key → the text the form showed: only a change is written
    private bool _hasToken, _hasAnon;

    public PcSettingsWindow()
    {
        Title = "Sentinel — PC Settings";
        Width = 600; SizeToContent = SizeToContent.Height; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var root = new StackPanel { Margin = new Thickness(12) };
        root.Children.Add(new TextBlock { Text = "This PC's settings", FontSize = 15, FontWeight = FontWeights.Bold });
        root.Children.Add(new TextBlock { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 4), Foreground = System.Windows.Media.Brushes.DimGray,
            Text = "Where this PC finds the Sentinel bridge, how it signs in, and its local AI and Ghost Builder folders. They belong to this PC only — a model never carries them. Project and office standards are set on the web project instead." });

        root.Children.Add(Heading("Bridge and sign-in"));
        root.Children.Add(Row("Bridge address", _serviceUrl, TestButton(_bridgeTest, () => { var u = _serviceUrl.Text; return () => PcSettings.TestBridge(u); })));
        root.Children.Add(_bridgeTest);
        root.Children.Add(Row("This PC's shared token", Pair(_token, _removeToken), null));
        root.Children.Add(_tokenState);
        root.Children.Add(Row("Sign-in address", _supabaseUrl, TestButton(_signInTest, () => { var u = _supabaseUrl.Text; var k = AnonKey(); return () => PcSettings.TestSignIn(u, k); })));
        root.Children.Add(Row("Sign-in key", _anonKey, null));
        root.Children.Add(_anonState);
        root.Children.Add(_signInTest);
        root.Children.Add(Row("Issues: only model id", _modelId, null));
        root.Children.Add(Hint("Blank lists the issues of every model."));

        root.Children.Add(Heading("Local AI and Ghost Builder"));
        root.Children.Add(Row("Local AI address", _ollamaUrl, TestButton(_modelTest, () => { var (u, o, m, v) = (_ollamaUrl.Text, _cloudOptIn.IsChecked == true, _ghostModel.Text, _visionModel.Text); return () => PcSettings.TestModel(u, o, m, v); })));
        root.Children.Add(_modelTest);
        root.Children.Add(_cloudOptIn);
        root.Children.Add(Row("Ghost Builder model", _ghostModel, null));
        root.Children.Add(Row("Photo model", _visionModel, null));
        root.Children.Add(Row("Family library folder", _familyDir, Browse(() => PickFolder(_familyDir))));
        root.Children.Add(Row("Layer mapping file", _schemaPath, Browse(PickSchema)));
        root.Children.Add(Hint("Blank folders are not used. The drawings folder belongs to Project Setup."));

        root.Children.Add(_status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
        var close = new Button { Content = "Close", Padding = new Thickness(14, 4, 14, 4), Margin = new Thickness(0, 0, 8, 0) };
        close.Click += (_, _) => Close();
        buttons.Children.Add(close); buttons.Children.Add(_save);
        root.Children.Add(buttons);
        Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MaxHeight = 820 };
        _save.Click += (_, _) => Save();
        _removeToken.Checked += (_, _) => { _token.Clear(); _token.IsEnabled = false; };
        _removeToken.Unchecked += (_, _) => _token.IsEnabled = true;
        Fill();
    }

    private static TextBox Box() => new() { Padding = new Thickness(3), VerticalContentAlignment = VerticalAlignment.Center };
    private static TextBlock Note() => new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(150, 0, 0, 4), Foreground = System.Windows.Media.Brushes.DimGray };
    private static TextBlock Hint(string t) { var n = Note(); n.Text = t; return n; }
    private static TextBlock Heading(string t) => new() { Text = t, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 12, 0, 4) };

    private static UIElement Row(string label, UIElement field, Button action)
    {
        var g = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(150) });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center });
        Grid.SetColumn(field, 1); g.Children.Add(field);
        if (action != null) { action.Margin = new Thickness(6, 0, 0, 0); Grid.SetColumn(action, 2); g.Children.Add(action); }
        return g;
    }

    private static UIElement Pair(UIElement a, UIElement b)
    {
        var d = new DockPanel();
        DockPanel.SetDock(b, Dock.Right); d.Children.Add(b); d.Children.Add(a);
        return d;
    }

    private static Button Browse(Action pick) { var b = new Button { Content = "Browse…", Width = 72 }; b.Click += (_, _) => pick(); return b; }

    /// <summary>A Test: <paramref name="read"/> takes the form's values on the UI thread (drill F-PCS-1: a control read off it throws)
    /// and returns the call, which runs off it.</summary>
    private Button TestButton(TextBlock result, Func<Func<string>> read)
    {
        var b = new Button { Content = "Test", Width = 72 };
        b.Click += (_, _) =>
        {
            b.IsEnabled = false; result.Text = "Testing…"; result.Foreground = System.Windows.Media.Brushes.DimGray;
            var test = read();
            Task.Run(() => { try { return test(); } catch (Exception e) { return "✗ " + e.Message; } })
                .ContinueWith(t => Dispatcher.BeginInvoke(new Action(() =>
                {
                    b.IsEnabled = true; result.Text = t.Result;
                    result.Foreground = t.Result.StartsWith("✓") ? System.Windows.Media.Brushes.DarkGreen
                        : t.Result.StartsWith("✗") ? System.Windows.Media.Brushes.Firebrick : System.Windows.Media.Brushes.DimGray;
                })));
        };
        return b;
    }

    /// <summary>The sign-in key a Test uses: the one typed, else the saved one (never shown).</summary>
    private string AnonKey() => _anonKey.Password.Length > 0 ? _anonKey.Password : BcfConfig.Load().SupabaseAnonKey;

    private static void PickFolder(TextBox box)
    {
#if NET48
        // net48 WPF has no folder picker; WinForms' does the job (SettingsDialog's way).
        using var dlg = new System.Windows.Forms.FolderBrowserDialog { SelectedPath = box.Text, ShowNewFolderButton = false };
        if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK) box.Text = dlg.SelectedPath;
#else
        var dlg = new Microsoft.Win32.OpenFolderDialog { Title = "Select the folder" };
        if (dlg.ShowDialog() == true) box.Text = dlg.FolderName;
#endif
    }

    private void PickSchema()
    {
        Directory.CreateDirectory(LocalOnly.SchemasDir);
        var dlg = new Microsoft.Win32.OpenFileDialog { Filter = "Layer mapping (*.json)|*.json", InitialDirectory = LocalOnly.SchemasDir, CheckFileExists = true };
        if (dlg.ShowDialog(this) == true) _schemaPath.Text = dlg.FileName;
    }

    /// <summary>The form from the two files, each field falling back to what the add-in uses when the file does not set it.</summary>
    private void Fill()
    {
        _bcf = PcSettings.Read(BcfConfig.FilePath, out _bcfError);
        _cfg = PcSettings.Read(SettingsManager.ConfigJsonPath, out _cfgError);
        var bcf = _bcf ?? new JsonObject(); var cfg = _cfg ?? new JsonObject();
        var used = BcfConfig.Load(); // the environment fills what no file sets
        _serviceUrl.Text = PcSettings.Text(bcf, "serviceUrl", used.ServiceUrl);
        _modelId.Text = PcSettings.Text(bcf, "modelId", "");
        _supabaseUrl.Text = PcSettings.Text(bcf, "supabaseUrl", used.SupabaseUrl);
        _ollamaUrl.Text = PcSettings.Text(cfg, "ollama_url", Defaults.OllamaUrl);
        _ghostModel.Text = PcSettings.Text(cfg, "ghost_model", Defaults.GhostModel);
        _visionModel.Text = PcSettings.Text(cfg, "ghost_vision_model", Defaults.GhostVisionModel);
        _familyDir.Text = PcSettings.Text(cfg, "ghost_family_library_dir", "");
        _schemaPath.Text = PcSettings.Text(cfg, "ghost_mapping_schema_path", "");
        _cloudOptIn.IsChecked = PcSettings.Flag(cfg, "ghost_cloud_opt_in");
        _hasToken = used.FileToken.Length > 0; _hasAnon = used.SupabaseAnonKey.Length > 0;
        _token.Clear(); _anonKey.Clear(); _removeToken.IsChecked = false; _removeToken.IsEnabled = _hasToken;
        _tokenState.Text = _hasToken
            ? "Set (hidden). Type a new one to replace it; leave blank to keep it. It works only with the bridge on this PC."
            : "None — people sign in instead (Standards ▸ Sign in).";
        _anonState.Text = _hasAnon ? "Set (hidden). Type a new one to replace it; leave blank to keep it." : "None — sign-in is not possible on this PC until it is set.";
        _shown = Snapshot();
        var unread = string.Join("; ", new[] { _bcfError, _cfgError }).Trim(';', ' ');
        Say(unread.Length > 0 ? unread + " — Save writes a new file and keeps the old one as a backup." : null, unread.Length > 0);
    }

    private Dictionary<string, string> Snapshot() => new()
    {
        ["serviceUrl"] = _serviceUrl.Text.Trim(), ["modelId"] = _modelId.Text.Trim(), ["supabaseUrl"] = _supabaseUrl.Text.Trim(),
        ["ollama_url"] = _ollamaUrl.Text.Trim(), ["ghost_model"] = _ghostModel.Text.Trim(), ["ghost_vision_model"] = _visionModel.Text.Trim(),
        ["ghost_family_library_dir"] = _familyDir.Text.Trim(), ["ghost_mapping_schema_path"] = _schemaPath.Text.Trim(),
        ["ghost_cloud_opt_in"] = _cloudOptIn.IsChecked == true ? "true" : "false",
    };

    private static readonly HashSet<string> BcfKeys = new() { "serviceUrl", "modelId", "supabaseUrl" };

    private void Save()
    {
        var now = Snapshot();
        bool keepsToken = _token.Password.Length > 0 || (_hasToken && _removeToken.IsChecked != true);
        var addinDir = Path.GetDirectoryName(typeof(PcSettingsWindow).Assembly.Location) ?? "";
        if (PcSettings.Refusal(now["serviceUrl"], now["supabaseUrl"], keepsToken, now["ollama_url"], now["ghost_cloud_opt_in"] == "true",
                now["ghost_family_library_dir"], now["ghost_mapping_schema_path"], addinDir, LocalOnly.SchemasDir) is { } why)
        { Say("Not saved: " + why, true); return; }

        var bcfSet = new Dictionary<string, JsonNode>(); var cfgSet = new Dictionary<string, JsonNode>();
        foreach (var kv in now)
        {
            if (_shown.TryGetValue(kv.Key, out var was) && was == kv.Value) continue;
            if (BcfKeys.Contains(kv.Key)) bcfSet[kv.Key] = JsonValue.Create(kv.Value);
            else cfgSet[kv.Key] = kv.Key == "ghost_cloud_opt_in" ? JsonValue.Create(kv.Value == "true") : JsonValue.Create(kv.Value);
        }
        if (_token.Password.Length > 0) bcfSet["serviceToken"] = JsonValue.Create(_token.Password);
        else if (_removeToken.IsChecked == true) bcfSet["serviceToken"] = JsonValue.Create("");
        if (_anonKey.Password.Length > 0) bcfSet["supabaseAnonKey"] = JsonValue.Create(_anonKey.Password);
        if (bcfSet.Count == 0 && cfgSet.Count == 0) { Say("Nothing changed.", false); return; }

        var said = new List<string>();
        try
        {
            if (cfgSet.Count > 0) said.Add(Written(SettingsManager.ConfigJsonPath, PcSettings.Write(SettingsManager.ConfigJsonPath, PcSettings.Merged(_cfg ?? new JsonObject(), cfgSet), DateTime.Now), cfgSet.Keys));
            if (bcfSet.Count > 0) said.Add(Written(BcfConfig.FilePath, PcSettings.Write(BcfConfig.FilePath, PcSettings.Merged(_bcf ?? new JsonObject(), bcfSet), DateTime.Now), bcfSet.Keys));
        }
        catch (Exception e) { Say("Not saved: " + e.Message + (said.Count > 0 ? " (already saved: " + string.Join("; ", said) + ")" : ""), true); return; }
        Fill();
        Say("✓ Saved — " + string.Join("; ", said) + ". Sentinel's tools use it from their next run (an open Issues window: once reopened).", false);
    }

    /// <summary>"config.json: ghost_model (old file kept as config.json.bak-…)" — key names only, never a value.</summary>
    private static string Written(string path, string bak, IEnumerable<string> keys) =>
        Path.GetFileName(path) + ": " + string.Join(", ", keys) + (bak != null ? $" (old file kept as {Path.GetFileName(bak)})" : "");

    private void Say(string text, bool bad)
    {
        _status.Text = text ?? "";
        _status.Foreground = bad ? System.Windows.Media.Brushes.Firebrick : System.Windows.Media.Brushes.DarkGreen;
    }
}
