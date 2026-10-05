using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Interop;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Win32;
using Sentinel.Coordination;
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

        // Export the TYPE CATALOGUE before the review window opens: it is reference material, not something you
        // tick and build, and the window only ever emits the ticked subset. An EXPORT, not a machine file: Revit
        // reads the type_catalog@n installed on the document's project or its office and never reads this back
        // (cohesion phase 4b-2, F54); a lead installs it on the office with the command the dialog prints.
        string? catalogPath = null, exportError = null;
        try
        {
            catalogPath = TypeCatalogExport.Write(
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "exports"),
                doc.Title, DateTimeOffset.Now, pack.Provision.TypeCatalog, pack.Provision.ViewTemplates);
        }
        catch (Exception ex) { exportError = ex.Message; } // a read-only folder must not sink the extraction

        StandardsReview.Show(uiapp, pack, sourceLabel: doc.Title, buildTarget: doc.Title);
        TaskDialog.Show("Sentinel — Office System", catalogPath != null
            ? TypeCatalogExport.Message(pack.Provision.TypeCatalog.Count, doc.Title, catalogPath)
            : "The type catalogue could not be exported: " + exportError);
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
        if (DialogOwner.ShowFileDialog(dlg, uiapp) != true) return Result.Cancelled;

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
        if (DialogOwner.ShowFileDialog(dlg, uiapp) != true) return Result.Cancelled;
        var files = dlg.FileNames.ToList();

        // SEC-3: the endpoint is checked before the window opens; a refusal is said, and nothing is read or sent.
        DocumentExtractor extractor;
        try { extractor = new DocumentExtractor(Sentinel.Engine.SettingsManager.MachineCloudOptIn()); }
        catch (ArgumentException ex) { TaskDialog.Show("Sentinel — Standards", ex.Message); return Result.Cancelled; }
        var window = StandardsReview.Create(uiapp);
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

        var doc = uiapp.ActiveUIDocument?.Document;   // the model this window builds into (XC-1)
        var build = new StandardsBuildEvent(doc);
        var externalEvent = ExternalEvent.Create(build);
        build.Built += report => window.ShowReport(report);
        build.RulesetInstalled += lines => window.AppendReport(lines);
        window.BuildRequested += ticked => { build.Request(ticked); externalEvent.Raise(); };
        window.SaveRequested += ticked => SavePack(ticked, window);

        // The document is captured here (API thread); its project and ruleset are read when the button is
        // clicked — back on the API thread through the event hub — so a Build that installed ruleset@n+1 since
        // the window opened is what the snapshot names. The POST runs off Revit's thread.
        string revitVersion = uiapp.Application.VersionNumber;
        window.SnapshotRequested += () =>
        {
            var pack = window.Source;
            // Provenance must come from the PACK, not the active document: Create() also serves "Load pack
            // from disk" and async document-ingest (window created empty, Load called later), where the
            // active document has nothing to do with what's in the pack.
            var src = pack.SourceModel;
            if (src is null || string.IsNullOrWhiteSpace(src.Title))
            {
                window.SetStatus("Snapshot NOT sent: this pack has no source model — extract from a template first (Build Office System).");
                return;
            }
            if (doc is null || App.Events is null)
            {
                window.SetStatus("Snapshot NOT sent: no open model to read the project and its ruleset from.");
                return;
            }
            string title = src.Title;
            string kind = string.Equals(System.IO.Path.GetExtension(src.Path ?? ""), ".rte", StringComparison.OrdinalIgnoreCase) ? "template" : "model";
            window.SetStatus("Reading this model's project and ruleset…");
            App.Events.Enqueue(_ =>
            {
                if (!doc.IsValidObject) { window.SetStatus("Snapshot NOT sent: the model this window was opened on is closed."); return; }
                var ctx = Sentinel.Engine.ProjectContext.For(doc);
                if (!ctx.IsBound) { window.SetStatus("Snapshot NOT sent: " + Sentinel.Engine.ProjectContext.NotBound); return; }
                var from = App.Engine?.SourceFor(doc);
                bool none = from is null || from.Origin == "none";
                var dto = OfficeSnapshotDto.Build(
                    kind: kind,
                    title: title, revitVersion: revitVersion,
                    worksets: pack.Provision.Worksets.Select(w => w.Name),
                    sharedParams: pack.Provision.SharedParameters.Select(p => (p.Name, p.Binding)),
                    types: pack.Provision.TypeCatalog.Select(t => new OfficeSnapshotDto.TypeDto { Category = t.Category, Family = t.Family, Type = t.Type, System = t.IsSystem, WidthMm = t.WidthMm, HeightMm = t.HeightMm }),
                    ruleset: none ? null : App.Engine?.RulesetFor(doc),
                    rulesetRef: none ? null : from!.Ref,
                    rulesetSha256: none ? null : from!.Sha256);
                string key = ctx.Key, judged = from?.Label ?? "none";
                window.SetStatus($"Sending office snapshot to Sentinel ({dto.Catalog.Count} types, {dto.Pack.Worksets.Count} worksets, ruleset {judged}) → project {key}…");
                Task.Run(() =>
                {
                    var error = GovernedNotify.OfficeSnapshot(dto, key);
                    window.SetStatus(error is null
                        ? $"Office snapshot received by Sentinel — project {key}, ruleset {judged}. Open the web app → Documents → READINESS to see it measured."
                        : $"Snapshot NOT sent: {error}");
                });
            });
        };

        // MA-2a (BOS-3): a lead installs the harvested catalogue on the document's OFFICE from here — no CLI. The key is read on
        // the API thread through the event hub; the scope read and the PUT run off Revit's thread (GovernedNotify, 120 s each);
        // the bridge decides the role (lead on the office), and the window prints its words. Never on the project itself: a
        // catalogue there would shadow the office's for that project alone (TypeCatalogExport.OfficeKeyFrom).
        window.InstallRequested += () =>
        {
            // Review C22: signed out, GovernedNotify would send the machine's token, which the bridge reads as `service` and lets past
            // the lead check — the office catalogue installed by whoever holds the shared token, under the Windows user's name.
            if (!UserSession.IsSignedIn) { window.SetStatus(TypeCatalogExport.NotInstalledLine("sign in first — installing on the office is a lead's own action, not the machine's")); return; }
            var pack = window.Source;
            var src = pack.SourceModel;
            if (src is null || string.IsNullOrWhiteSpace(src.Title) || pack.Provision.TypeCatalog.Count == 0)
            {
                window.SetStatus(TypeCatalogExport.NotInstalledLine("this pack has no harvested catalogue — extract from a template first (Build Office System)"));
                return;
            }
            if (doc is null || App.Events is null) { window.SetStatus(TypeCatalogExport.NotInstalledLine("no open model to read the project from")); return; }
            string title = src.Title;
            var types = pack.Provision.TypeCatalog;
            var views = pack.Provision.ViewTemplates;
            window.SetStatus("Reading this model's project…");
            App.Events.Enqueue(_ =>
            {
                if (!doc.IsValidObject) { window.SetStatus(TypeCatalogExport.NotInstalledLine("the model this window was opened on is closed")); return; }
                var ctx = Sentinel.Engine.ProjectContext.For(doc);
                if (!ctx.IsBound) { window.SetStatus(TypeCatalogExport.NotInstalledLine(Sentinel.Engine.ProjectContext.NotBound)); return; }
                string key = ctx.Key;
                window.SetStatus($"Asking Sentinel which office {key} belongs to…");
                Task.Run(() =>
                {
                    var scope = GovernedNotify.ProjectScope(key);
                    if (scope.Error is not null) { window.SetStatus(TypeCatalogExport.NotInstalledLine(scope.Error)); return; }
                    var office = TypeCatalogExport.OfficeKeyFrom(scope.Json!, key, out var why);
                    if (office is null) { window.SetStatus(TypeCatalogExport.NotInstalledLine(why!)); return; }
                    window.SetStatus($"Installing type_catalog on {office} ({types.Count} types)…");
                    var put = GovernedNotify.InstallArtefact(office, "type_catalog", TypeCatalogExport.InstallJson(title, DateTimeOffset.Now, types, views, title), UserSession.Actor);
                    window.SetStatus(put.Error is null
                        ? TypeCatalogExport.InstallLine(office, put.Version, put.Sha256, types.Count, title)
                        : TypeCatalogExport.NotInstalledLine(put.Error));
                });
            });
        };
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
    private readonly Document? _doc;   // the model the review window was opened on (XC-1)

    public StandardsBuildEvent(Document? doc) => _doc = doc;

    public event Action<BuildReport>? Built;
    /// The ruleset install's outcome lines, raised OFF the API thread after Built has rendered the model report.
    public event Action<IReadOnlyList<string>>? RulesetInstalled;

    public void Request(StandardsPack pack) => _pending = pack;

    public void Execute(UIApplication app)
    {
        var pack = _pending;
        _pending = null;
        if (pack is null) return;

        BuildReport report;
        var refusal = _doc is null
            ? "No open model when this window was opened — nothing was changed."
            : Sentinel.Engine.DocPin.Check(app, _doc, "apply the standard");
        if (refusal is not null)
        {
            report = new BuildReport();
            report.Failed.Add(refusal);
            Built?.Invoke(report);
            return;
        }
        var doc = _doc!;
        // XC-2: the whole build is one Undo entry; a throw rolls every step back.
        bool kept = false; // MA-1a item 7 (review amendment C9): Revit kept the build's Undo group — only then is it reported
        try
        {
            BuildReport built = new BuildReport();
            kept = Sentinel.Engine.SentinelUndo.Run(doc, "Apply standard", () => { built = StandardsBuilder.Build(app, doc, pack); return true; });
            report = built;
            if (!kept)
            {
                // Revit did not keep the group: nothing of this build is in the model, and the dialog says so.
                // The ruleset install's line stays: it is the bridge's, not the model's, and its job still runs below.
                var undone = report.Created.Where(c => !c.StartsWith("Ruleset:", StringComparison.Ordinal)).ToList();
                report.Failed.AddRange(undone.Select(c => c + ": Revit did not keep the build's Undo group"));
                report.Created.RemoveAll(undone.Contains);
            }
        }
        catch (Exception ex)
        {
            report = new BuildReport();
            report.Failed.Add("Build error: " + ex.Message + " — nothing was changed (undone).");
        }
        Built?.Invoke(report); // ShowReport is a Dispatcher.Invoke: the model report is on screen when this returns
        // MA-1a item 7: one apply_standard row for a build Revit kept that created something in the model, sent off this
        // thread. The model's creations only (review amendment C9): "Ruleset: installing …" is the bridge install's line —
        // nothing in the model — and that install writes its own artefact row.
        var modelCreated = report.Created.Where(c => !c.StartsWith("Ruleset:", StringComparison.Ordinal)).ToList();
        if (kept && modelCreated.Count > 0)
            GovernedNotify.Report("Apply Standard", CommandReports.ApplyStandard(modelCreated, report.Skipped, report.Failed, UserSession.Actor),
                                  Sentinel.Engine.ProjectContext.For(doc).Key);
        // The ruleset GET/PUT never runs on Revit's thread (the bridge can take seconds, or not answer).
        if (report.RulesetJob is { } job) Task.Run(() => RulesetInstalled?.Invoke(job()));
    }

    public string GetName() => "Sentinel Standards Builder";
}
