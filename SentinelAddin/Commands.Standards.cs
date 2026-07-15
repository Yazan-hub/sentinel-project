using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Windows.Interop;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Win32;
using Sentinel.Standards;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Standards Engine entry point (docs/standards-engine-spec.md §7 MVP). Reverse-extracts the office
/// standard (worksets + shared parameters) from the active "golden" model, opens the review window,
/// and on approval builds the ticked items into the model + enforces them in the ruleset.
///
/// Threading: extraction is read-only Revit-API (safe synchronously on the command's API thread);
/// the BUILD mutates the model, so it's funneled through <see cref="StandardsBuildEvent"/>
/// (ExternalEvent → API thread only when Revit is idle).
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class BuildOfficeSystemCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        var doc = uiapp.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        // Read-only extraction, up front on the API thread.
        StandardsPack pack = GoldenModelExtractor.Extract(doc);
        StandardsReview.Show(uiapp, pack, sourceLabel: doc.Title, buildTarget: doc.Title);
        return Result.Succeeded;
    }
}

/// <summary>
/// Loads a saved <see cref="StandardsPack"/> from disk and builds it into the ACTIVE model — the clean
/// golden→blank round-trip. Extract once (Build Office System → Save pack), then apply the same pack to
/// any number of blank templates. Deserialization is pure I/O; the build funnels through the same
/// <see cref="StandardsBuildEvent"/> so it lands on a blank workshared model exactly like extraction.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class LoadOfficeSystemCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        var doc = uiapp.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        string packsDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "packs");
        var dlg = new OpenFileDialog
        {
            Title = "Load Sentinel Standards Pack",
            Filter = "Standards packs (*.json)|*.json|All files (*.*)|*.*",
            InitialDirectory = Directory.Exists(packsDir) ? packsDir : null,
            CheckFileExists = true,
        };
        if (dlg.ShowDialog() != true) return Result.Cancelled;

        StandardsPack? pack;
        try
        {
            pack = JsonSerializer.Deserialize<StandardsPack>(File.ReadAllText(dlg.FileName), StandardsPack.JsonOpts);
        }
        catch (Exception ex)
        {
            msg = "Could not read the standards pack:\n" + ex.Message;
            return Result.Failed;
        }
        if (pack is null) { msg = "The selected file is not a valid standards pack."; return Result.Failed; }

        StandardsReview.Show(uiapp, pack, sourceLabel: Path.GetFileName(dlg.FileName), buildTarget: doc.Title);
        return Result.Succeeded;
    }
}

/// <summary>
/// Tier-2 ingestion (docs/standards-engine-spec.md §2): read office-standards documents (PDF/txt/CSV),
/// extract worksets + shared parameters with a local LLM, and drop them into the same review window with
/// pdf:page provenance (document items are unticked-by-default until the reviewer approves them).
///
/// Threading: file read + LLM are network/file I/O (no Revit API) → run async off the UI thread; the
/// window is shown immediately with a progress status and populated on completion via its dispatcher.
/// Build still funnels through <see cref="StandardsBuildEvent"/>.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class IngestDocumentsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uiapp = c.Application;
        var doc = uiapp.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        var dlg = new OpenFileDialog
        {
            Title = "Ingest office-standards documents",
            Filter = "Documents (*.pdf;*.txt;*.md;*.csv)|*.pdf;*.txt;*.md;*.csv|All files (*.*)|*.*",
            Multiselect = true,
            CheckFileExists = true,
        };
        if (dlg.ShowDialog() != true) return Result.Cancelled;
        var files = dlg.FileNames.ToList();

        var window = StandardsReview.Create(uiapp);
        var extractor = new DocumentExtractor();
        window.Closed += (_, __) => extractor.Dispose();
        window.Show();
        window.SetStatus($"Reading {files.Count} document(s) and querying the local LLM… " +
                         "(first run loads the model — this can take a minute)");

        // Capture Revit-thread state NOW — the continuation below runs off the API thread, so it must
        // not touch the Document (doc.Title). label + target are plain strings, safe to close over.
        string label = string.Join(", ", files.Select(Path.GetFileName));
        string target = doc.Title;
        async void Run()
        {
            try
            {
                var pack = await extractor.ExtractAsync(files).ConfigureAwait(false);
                int n = pack.Provision.Worksets.Count + pack.Provision.SharedParameters.Count
                        + pack.Provision.NamingRules.Count;
                if (n == 0) { window.SetStatus("No worksets, shared parameters or naming rules were found in the document(s)."); return; }
                window.Load(pack, label, target);
            }
            catch (Exception ex) { window.SetStatus(ex.Message); }
        }
        Run();
        return Result.Succeeded;
    }
}

/// <summary>
/// Shared review-window wiring for Build (extract), Load (from disk), and Ingest (documents): opens the
/// modeless review window, funnels Build through an ExternalEvent, and saves ticked packs to disk.
/// </summary>
internal static class StandardsReview
{
    public static void Show(UIApplication uiapp, StandardsPack pack, string sourceLabel, string buildTarget)
    {
        var window = Create(uiapp);
        window.Load(pack, sourceLabel, buildTarget);
        window.Show();
    }

    /// <summary>Create + wire an EMPTY review window. The caller shows it and calls Load once a pack is
    /// ready — used by async document ingest, where extraction completes after the window is on screen.</summary>
    public static StandardsReviewWindow Create(UIApplication uiapp)
    {
        var window = new StandardsReviewWindow();
        new WindowInteropHelper(window) { Owner = uiapp.MainWindowHandle };

        var build = new StandardsBuildEvent();
        var externalEvent = ExternalEvent.Create(build);
        build.Built += report => window.ShowReport(report);
        window.BuildRequested += ticked => { build.Request(ticked); externalEvent.Raise(); };
        window.SaveRequested += ticked => SavePack(ticked, window);
        return window;
    }

    private static void SavePack(StandardsPack pack, StandardsReviewWindow window)
    {
        try
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "packs");
            Directory.CreateDirectory(dir);
            string path = Path.Combine(dir, $"{pack.PackKey}-{pack.Semver}.json");
            File.WriteAllText(path, JsonSerializer.Serialize(pack, StandardsPack.JsonOpts));
            window.SetStatus($"Saved pack → {path}");
        }
        catch (Exception ex) { window.SetStatus("Save failed: " + ex.Message); }
    }
}

/// <summary>
/// Funnels the model-mutating build onto the API thread. Mirrors BcfApplyEvent: the window stages a
/// pack via <see cref="Request"/> then raises the event; Execute runs the builder and reports back.
/// </summary>
public sealed class StandardsBuildEvent : IExternalEventHandler
{
    private StandardsPack? _pending;

    public event Action<BuildReport>? Built;

    public void Request(StandardsPack pack) => _pending = pack;

    public void Execute(UIApplication app)
    {
        var pack = _pending;
        _pending = null;
        if (pack is null) return;

        BuildReport report;
        try { report = StandardsBuilder.Build(app, pack); }
        catch (Exception ex)
        {
            report = new BuildReport();
            report.Failed.Add("Build error: " + ex.Message);
        }
        Built?.Invoke(report);
    }

    public string GetName() => "Sentinel Standards Builder";
}
