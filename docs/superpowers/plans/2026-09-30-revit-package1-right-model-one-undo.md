# Revit package 1 — right model, one undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Sentinel job that changes or shows a Revit model runs on the model it was started on (or refuses in words), each multi-step Sentinel action is one Undo entry, and the live watcher follows every project document for its whole life.

**Architecture:** One pure refusal rule (`DocPin.Refusal`) with a Revit half (`DocPin.Check`) that every job calls before it touches a model; the shared event hub gains a pinned `Enqueue(Document, what, job)` overload, and handlers with their own `ExternalEvent` call `DocPin.Check` in `Execute`. A `SentinelUndo` helper wraps an action's transactions in one `TransactionGroup`. The DMU updater and the name snapshots are keyed by the `Document` itself and released on close.

**Tech Stack:** C# (net48 for Revit 2024, net8 for 2025/2026), Revit API, WPF; offline checks as `tools/*-check` console projects (net8).

**Spec:** `docs/superpowers/specs/2026-09-30-revit-addin-safe-honest-design.md` (Package 1). Audit ids: XC-1, XC-2, BG-1 in `docs/strategy/2026-09-30-revit-addin-audit.md`.

## Global Constraints

- The add-in must build for Revit **2024, 2025 and 2026** (`dotnet build -p:RevitVersion=YYYY -p:DeployToRevit=false` from `SentinelAddin/`). Any Revit API used must exist in **2021**.
- Revit API calls run only on the API thread: commands, `IUpdater.Execute`, Revit events, or `RevitEventHub` / `ExternalEvent` jobs. No new `ExternalEvent` per window.
- Pure logic gets a check in `tools/*-check` (net8 console, links the add-in's source, `SENTINEL_CHECK` hides Revit-typed members). Each new check is added to `.github/workflows/ci.yml`'s "Revit-free checks" step.
- Honesty: a refused job says so in plain words and changes nothing; never a silent no-op.
- No new NuGet or npm dependencies.
- Refusal wording (verbatim): `Sentinel did not <what>: switch back to <title> — nothing was changed.` and `Sentinel did not <what>: the model it was started on is closed — nothing was changed.`
- Undo entries are named `Sentinel: <name>`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feature/revit-safe-honest`; `--no-ff` merge to master; secret-scan before push (public repo).

## File structure

| File | Responsibility |
|---|---|
| `SentinelAddin/Engine/DocPin.cs` (new) | The pinned-document rule: pure refusal words + the Revit check |
| `SentinelAddin/Engine/SentinelUndo.cs` (new) | One Undo entry per action (`Run`), or none for a preview (`Preview`) |
| `tools/docpin-check/` (new) | Offline check of the refusal words |
| `SentinelAddin/RevitEventHub.cs` | Pinned `Enqueue` overload; `SelectAndShow(Document, id)` |
| `SentinelAddin/UI/SentinelPanelViewModel.cs`, `App.cs`, `Commands.cs` | The pane knows which document its rows came from |
| `SentinelAddin/Workflow/AutoFixExecution.cs` | ⚡ Fix runs on the rows' document |
| `SentinelAddin/UI/ClashManagerDialog.xaml.cs`, `Commands.Phase2.cs` | Clash show / view / BCF export pinned; MEP + Sanitize pinned |
| `SentinelAddin/Workflow/ShowPendingChangeCommand.cs`, `UI/RequestsWindow.xaml.cs` | Change-request preview pinned; reset acts on the document it painted |
| `SentinelAddin/UI/SettingsDialog.xaml.cs` | Project Setup save pinned |
| `SentinelAddin/Coordination/BcfApplyEvent.cs`, `Commands.BcfIssues.cs` | BCF Issues zoom pinned; one Undo for the viewpoint |
| `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, `ChangesetExecutor.cs`, `Commands.ReviewChangesets.cs` | AI placement pinned; a refusal keeps the changeset pending |
| `SentinelAddin/Commands.Standards.cs`, `Standards/StandardsBuilder.cs` | Apply Standard pinned, one Undo |
| `SentinelAddin/Engine/MepVoidManager.cs`, `Workflow/FamilySanitizer.cs` | MEP reconcile / place and Sanitize load pinned |
| `SentinelAddin/Engine/BcfExporter.cs` | The snapshot isolation leaves no Undo entry |
| `SentinelAddin/Updaters/SentinelUpdater.cs`, `Workflow/RequestManager.cs`, `App.cs` | Updater + snapshots per `Document`; `DocumentCreated`; release on close |

Out of this package (spec change recorded in Task 8): XC-2 for **MEP Openings** (reconcile and place are two user-separated steps; one Undo across them would span two ExternalEvent runs) and for **Heal** (whether `LoadFamily` may run inside a `TransactionGroup` is unverified; Heal already pins its document).

---

### Task 1: DocPin — the refusal rule and its check

**Files:**
- Create: `SentinelAddin/Engine/DocPin.cs`
- Create: `tools/docpin-check/docpin-check.csproj`, `tools/docpin-check/Check.cs`
- Modify: `.github/workflows/ci.yml` (Revit-free checks step)

**Interfaces:**
- Produces: `Sentinel.Engine.DocPin.Refusal(bool pinnedValid, bool pinnedActive, string pinnedTitle, string what) : string?` and `DocPin.Check(UIApplication app, Document pinned, string what) : string?` (null = run).

- [ ] **Step 1: Write the failing check**

`tools/docpin-check/docpin-check.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for DocPin's refusal words (XC-1: a Sentinel job runs on the model it was started on, or says why
       not). Compiles the pure half of DocPin.cs (SENTINEL_CHECK hides the Revit-typed Check). `dotnet run` here. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>docpin-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
    <DefineConstants>$(DefineConstants);SENTINEL_CHECK</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\DocPin.cs" />
  </ItemGroup>
</Project>
```

`tools/docpin-check/Check.cs`:
```csharp
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Is(string? got, string? want, string n)
    {
        if (got == want) { _pass++; Console.WriteLine("  PASS  " + n); return; }
        _fail++;
        Console.WriteLine("  FAIL  " + n + "\n        got:  " + (got ?? "(null)") + "\n        want: " + (want ?? "(null)"));
    }

    static int Main()
    {
        Console.WriteLine("DocPin — a Sentinel job runs on the model it was started on, or says why not\n");
        Is(DocPin.Refusal(true, true, "Aster.rvt", "rename the element"), null, "open and active → runs (no refusal)");
        Is(DocPin.Refusal(true, false, "Aster.rvt", "rename the element"),
           "Sentinel did not rename the element: switch back to Aster.rvt — nothing was changed.",
           "open, another model active → switch back, the model named");
        Is(DocPin.Refusal(false, false, "", "rename the element"),
           "Sentinel did not rename the element: the model it was started on is closed — nothing was changed.",
           "closed → says closed and names no title (a closed document has none to read)");
        Is(DocPin.Refusal(false, true, "Aster.rvt", "place the proposals"),
           "Sentinel did not place the proposals: the model it was started on is closed — nothing was changed.",
           "closed wins over active");
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `dotnet run --project tools/docpin-check`
Expected: build error — `DocPin.cs` not found / `DocPin` does not exist.

- [ ] **Step 3: Write DocPin**

`SentinelAddin/Engine/DocPin.cs`:
```csharp
// XC-1: every Sentinel job that changes or shows a model runs on the model it was started on — captured when the
// action starts (row published, button clicked, window opened) — or refuses in words and changes nothing. The words
// are pure (tools/docpin-check); SENTINEL_CHECK hides the Revit half from the check.
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
#endif

namespace Sentinel.Engine;

public static class DocPin
{
    /// <summary>What Sentinel says when a job does not run; null = run. <paramref name="what"/> is a verb phrase
    /// ("rename the element").</summary>
    public static string? Refusal(bool pinnedValid, bool pinnedActive, string pinnedTitle, string what)
    {
        if (!pinnedValid) return $"Sentinel did not {what}: the model it was started on is closed — nothing was changed.";
        if (!pinnedActive) return $"Sentinel did not {what}: switch back to {pinnedTitle} — nothing was changed.";
        return null;
    }

#if !SENTINEL_CHECK
    /// <summary>Null when <paramref name="pinned"/> is open and is Revit's active document; else the refusal line.
    /// API thread only. IsValidObject is read before Equals: a closed document cannot be compared.</summary>
    public static string? Check(UIApplication app, Document pinned, string what)
    {
        bool valid = pinned.IsValidObject;
        bool active = valid && app.ActiveUIDocument?.Document is { } a && a.Equals(pinned);
        return Refusal(valid, active, valid ? pinned.Title : "", what);
    }
#endif
}
```

- [ ] **Step 4: Run the check**

Run: `dotnet run --project tools/docpin-check`
Expected: `4/4 checks pass`, exit 0.

- [ ] **Step 5: Add the check to CI**

In `.github/workflows/ci.yml`, in the "Revit-free checks" step, append a line after `dotnet run --project tools/roi-check`:
```yaml
          dotnet run --project tools/docpin-check
```
and add `+ docpin` to that step's `name:` list.

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin/Engine/DocPin.cs tools/docpin-check .github/workflows/ci.yml
git commit -m "feat(revit): DocPin — a job runs on the model it was started on, or refuses in words (XC-1)"
```

---

### Task 2: The hub's pinned overload, the pane's Select and ⚡ Fix

**Files:**
- Modify: `SentinelAddin/RevitEventHub.cs:19-33`
- Modify: `SentinelAddin/UI/SentinelPanelViewModel.cs:67-77, 172-184, 186-220`
- Modify: `SentinelAddin/Workflow/AutoFixExecution.cs:25-84`
- Modify: `SentinelAddin/App.cs:162, 190, 211`
- Modify: `SentinelAddin/Commands.cs:58` (IFC Pre-Flight `PublishReport`)

**Interfaces:**
- Consumes: `DocPin.Check` (Task 1).
- Produces: `RevitEventHub.Enqueue(Document doc, string what, Action<UIApplication, Document> job, Action<string>? onRefused = null)`; `RevitEventHub.SelectAndShow(Document doc, long elementId)` (the `SelectAndShow(long)` overload is removed); `SentinelPanelViewModel.PublishReport(Document doc, ScanReport report)`; `AutoFixExecution.Run(Document pinned, long elementId, string ruleId, Action<string, string?>? onDone = null, string? finalName = null)`.

- [ ] **Step 1: Hub overload** — in `RevitEventHub.cs`, replace the `SelectAndShow(long elementId)` method (lines 25-33) with:
```csharp
    /// <summary>XC-1: run <paramref name="job"/> on <paramref name="doc"/> only while it is open and Revit's active
    /// document; otherwise say why (Doctor log + a dialog, or <paramref name="onRefused"/> when the caller shows it
    /// itself) and change nothing. The job gets the pinned document: it never re-reads ActiveUIDocument.</summary>
    public void Enqueue(Document doc, string what, Action<UIApplication, Document> job, Action<string>? onRefused = null)
        => Enqueue(uiapp =>
        {
            if (Sentinel.Engine.DocPin.Check(uiapp, doc, what) is { } refusal)
            {
                App.PanelVm?.LogDoctor(refusal);
                if (onRefused is not null) onRefused(refusal);
                else TaskDialog.Show("Sentinel", refusal);
                return;
            }
            job(uiapp, doc);
        });

    public void SelectAndShow(Document doc, long elementId) => Enqueue(doc, "select the element", (uiapp, d) =>
    {
        var uidoc = uiapp.ActiveUIDocument!;          // DocPin: the active document is d
        var id = elementId.ToElementId();
        if (d.GetElement(id) is null) return;
        uidoc.Selection.SetElementIds([id]);
        uidoc.ShowElements(id);
    });
```

- [ ] **Step 2: The pane remembers its rows' document** — in `SentinelPanelViewModel.cs`:

Add a field under `Violations` (line 57):
```csharp
    // The project document the rows were scanned in (XC-1): Select and ⚡ Fix act on it, never on whichever model is
    // active when Revit runs the job. Set on the API thread by PublishReport; cleared while a document loads.
    private Autodesk.Revit.DB.Document? _reportDoc;
```
Replace `PublishReport(ScanReport report)` (lines 67-77) with:
```csharp
    /// Full-scan result replaces panel content (open / sync / Scan Now / IFC Pre-Flight). <paramref name="doc"/> is
    /// the document the report judged.
    public void PublishReport(Autodesk.Revit.DB.Document doc, ScanReport report)
    {
        _reportDoc = doc;
        OnUi(() =>
        {
            Violations.Clear();
            foreach (var v in report.Violations) Violations.Add(new ViolationRow(v, report.Ruleset));
            _notScored = report.NotScored;
            Score = report.Score;   // raises ScoreText, which reads _notScored
            Status = report.NotScored is { } why
                ? $"{report.DocTitle} — {why}"
                : $"{report.DocTitle} — {report.ElementsChecked} elements in {report.DurationMs} ms";
        });
    }
```
In `ShowLoading` (line 172), add as the first line of the method body: `_reportDoc = null;`

Replace `RequestSelect` (lines 187-190) with:
```csharp
    public void RequestSelect(ViolationRow row)
    {
        if (row.ElementId > 0 && _reportDoc is { } doc) App.Events?.SelectAndShow(doc, row.ElementId);
    }
```
In `RequestFix`, replace the line `if (!row.CanFix) return;` with:
```csharp
        if (!row.CanFix || _reportDoc is not { } doc) return;
```
and replace the `AutoFixExecution.Run(row.ElementId, row.RuleId, (oldName, newName) => OnUi(() =>` call (lines 208-219) with:
```csharp
        AutoFixExecution.Run(doc, row.ElementId, row.RuleId, (oldName, newName) => OnUi(() =>
        {
            if (newName is null)
            {
                Status = $"✕ Could not auto-fix '{row.ElementName}' ({row.RuleId}) — rename manually.";
                return;
            }
            var match = Violations.FirstOrDefault(r =>
                r.ElementId == row.ElementId && r.RuleId == row.RuleId);
            if (match is not null) Violations.Remove(match);
            Status = $"✓ Auto-fixed: '{oldName}' → '{newName}' ({row.RuleId})";
        }), dialog.FinalName, refusal => OnUi(() => Status = "✕ " + refusal));
```

- [ ] **Step 3: ⚡ Fix runs on the pinned document** — in `AutoFixExecution.cs`, replace the `Run` signature and its first three body lines (lines 29-35):
```csharp
    public static void Run(Document pinned, long elementId, string ruleId, Action<string, string?>? onDone = null,
                           string? finalName = null, Action<string>? onRefused = null)
    {
        App.Events?.Enqueue(pinned, "rename the element", (uiapp, doc) =>
        {
            var rule = App.Engine?.RulesetFor(doc).Rules.FirstOrDefault(r => r.Id == ruleId);
            if (rule is null || rule.Tokens.Count == 0) { onDone?.Invoke("", null); return; }
```
and close the call with `}, onRefused);` instead of `});` at line 83. Update the doc comment above `Run` to add: `/// pinned: the document the pane's rows were scanned in (XC-1); the fix refuses when another model is active.`

- [ ] **Step 4: Callers pass the document** — `App.cs` line 162: `PanelVm?.PublishReport(doc, engine.ScanFull(doc));` · line 190: `vm.PublishReport(doc, engine.ScanFull(doc));` · line 211: `PanelVm!.PublishReport(e.Document, report);` · `Commands.cs` line 58: `App.PanelVm.PublishReport(doc, report);`

- [ ] **Step 5: Build (compile errors list the remaining `SelectAndShow(long)` callers — fixed in Task 3)**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error|Build succeeded"`
Expected: errors only at `UI/ClashManagerDialog.xaml.cs:31` and `Commands.BcfIssues.cs:324` (`SelectAndShow` takes 2 arguments). No other errors.

- [ ] **Step 6: Commit** (the build is green again after Task 3; commit both together at the end of Task 3).

---

### Task 3: Windows that already hold their document

**Files:**
- Modify: `SentinelAddin/UI/ClashManagerDialog.xaml.cs:9-21, 28-32, 34-51, 53-91`
- Modify: `SentinelAddin/Commands.Phase2.cs:184` (ClashManagerCommand)
- Modify: `SentinelAddin/Commands.BcfIssues.cs:324` (Fix-in-place zoom)
- Modify: `SentinelAddin/Workflow/ShowPendingChangeCommand.cs:15-101`
- Modify: `SentinelAddin/UI/RequestsWindow.xaml.cs:57`
- Modify: `SentinelAddin/UI/SettingsDialog.xaml.cs:15-17, 171-189`

**Interfaces:**
- Consumes: `RevitEventHub.Enqueue(Document, string, Action<UIApplication, Document>, Action<string>?)`, `SelectAndShow(Document, long)` (Task 2).
- Produces: `ClashManagerDialog(Autodesk.Revit.DB.Document doc, List<ClashManager.ClashItem> clashes, string? federationLine = null)`; `ShowPendingChangeCommand.Show(Document doc, long elementId)`.

- [ ] **Step 1: Clash Manager** — in `ClashManagerDialog.xaml.cs`:
Add a field and change the constructor (lines 9-11):
```csharp
    private readonly List<ClashManager.ClashItem> _clashes;
    private readonly Autodesk.Revit.DB.Document _doc;   // the model the clashes were found in (XC-1)

    public ClashManagerDialog(Autodesk.Revit.DB.Document doc, List<ClashManager.ClashItem> clashes, string? federationLine = null)
    {
        _doc = doc;
        _clashes = clashes;
```
`OnShow`: `App.Events?.SelectAndShow(_doc, c.HostId);`
`OnCreateView` — replace the `App.Events?.Enqueue(uiapp => { var doc = uiapp.ActiveUIDocument?.Document; if (doc is null) return;` opening with:
```csharp
        App.Events?.Enqueue(_doc, "create the clash view", (uiapp, doc) =>
        {
```
(the rest of the body is unchanged; `uiapp.ActiveUIDocument!` is now the pinned document's).
`OnExportBcf` — replace the `App.Events?.Enqueue(uiapp => { var doc = uiapp.ActiveUIDocument?.Document; if (doc is null) return;` opening with:
```csharp
        App.Events?.Enqueue(_doc, "export the BCF", (uiapp, doc) =>
        {
```
In `Commands.Phase2.cs` line 184: `var win = new Sentinel.UI.ClashManagerDialog(doc, clashes, fedLine);`

- [ ] **Step 2: Fix-in-place zoom** — `Commands.BcfIssues.cs` line 324 (inside `OpenFixWindow(Document d, …)`):
```csharp
            fix.ZoomRequested += row => App.Events?.SelectAndShow(d, row.IsType ? row.InstanceIds[0] : row.TargetId);
```

- [ ] **Step 3: Change-request preview** — in `ShowPendingChangeCommand.cs`, the preview remembers its document and the reset acts on that document (it may be inactive; restoring graphics needs no UI). Replace `SavedState` (lines 15-23) with:
```csharp
    private sealed class SavedState
    {
        public SavedState(Document doc, ElementId viewId, ElementId elementId, OverrideGraphicSettings original, bool startedIsolation)
        { Doc = doc; ViewId = viewId; ElementId = elementId; Original = original; StartedIsolation = startedIsolation; }
        public Document Doc { get; }          // the model the preview was painted on (XC-1)
        public ElementId ViewId { get; }
        public ElementId ElementId { get; }
        public OverrideGraphicSettings Original { get; }
        public bool StartedIsolation { get; }
    }
```
Replace `Show(long elementId)` (lines 31-78) with:
```csharp
    public static void Show(Document doc, long elementId)
    {
        App.Events?.Enqueue(doc, "show the change", (uiapp, d) =>
        {
            var uidoc = uiapp.ActiveUIDocument!;       // DocPin: the active document is d
            var id = elementId.ToElementId();
            var element = d.GetElement(id);
            var view = d.ActiveView;
            if (element is null || view is null) return;

            // Views/sheets under review can't be overridden as graphics — fall
            // back to opening/selecting them instead of painting them.
            if (element is View targetView)
            {
                uidoc.RequestViewChange(targetView);
                return;
            }
            if (!element.CanBeHidden(view)) { uidoc.Selection.SetElementIds(new List<ElementId> { id }); return; }

            Reset(); // never stack two previews

            using var t = new Transaction(d, "Sentinel: Preview pending change");
            t.Start();

            var original = view.GetElementOverrides(id);
            bool isolate = !view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);

            var ogs = new OverrideGraphicSettings()
                .SetSurfaceTransparency(40)
                .SetSurfaceForegroundPatternColor(new Color(70, 170, 110))
                .SetProjectionLineColor(new Color(30, 110, 70))
                .SetProjectionLineWeight(6);
            var solid = GetSolidFillPattern(d);
            if (solid is not null) ogs.SetSurfaceForegroundPatternId(solid.Id);

            view.SetElementOverrides(id, ogs);
            if (isolate) view.IsolateElementTemporary(id);

            t.Commit();

            lock (Gate) _active = new SavedState(d, view.Id, id, original, isolate);
            uidoc.Selection.SetElementIds(new List<ElementId> { id });
            uidoc.ShowElements(id);
        });
    }
```
Replace `ResetFromUi` and `Reset(UIApplication uiapp)` (lines 82-101) with:
```csharp
    public static void ResetFromUi() => App.Events?.Enqueue(_ => Reset());

    // Restores the graphics on the document the preview was painted on — never on whichever model is active now.
    private static void Reset()
    {
        SavedState? s;
        lock (Gate) { s = _active; _active = null; }
        if (s is null || !s.Doc.IsValidObject) return;   // closed: its preview went with it
        var doc = s.Doc;
        if (doc.GetElement(s.ViewId) is not View view) return;

        using var t = new Transaction(doc, "Sentinel: Clear change preview");
        t.Start();
        if (doc.GetElement(s.ElementId) is not null)
            view.SetElementOverrides(s.ElementId, s.Original);
        if (s.StartedIsolation && view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate))
            view.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
        t.Commit();
    }
```
In `RequestsWindow.xaml.cs` line 57: `ShowPendingChangeCommand.Show(_doc, row.ElementId); // visual diff: green fill + isolate`

- [ ] **Step 4: Project Setup save** — in `SettingsDialog.xaml.cs` add a field after `_current` (line 15):
```csharp
    private readonly Document? _doc;   // the model this dialog was opened on (XC-1)
```
and as the first line of the constructor body (after `{` at line 18, before `InitializeComponent();`): `_doc = doc;`
Replace the project-scope save block `App.Events?.Enqueue(uiapp => { var doc = uiapp.ActiveUIDocument?.Document; if (doc is null) return;` (lines 171-174) with:
```csharp
        if (_doc is null) { StatusText.Text = "No open model to save the project settings into."; return; }
        App.Events?.Enqueue(_doc, "save the project settings", (uiapp, doc) =>
        {
```
(the rest of the block is unchanged).

- [ ] **Step 5: Build**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded`, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin
git commit -m "feat(revit): pane Select/⚡ Fix, clash, change requests, setup and fix-in-place zoom run on their own model (XC-1)"
```

---

### Task 4: Handlers with their own ExternalEvent — BCF Issues, AI proposals, Apply Standard

**Files:**
- Modify: `SentinelAddin/Coordination/BcfApplyEvent.cs:15-51`
- Modify: `SentinelAddin/Commands.BcfIssues.cs:91` (`var apply = new BcfApplyEvent();`)
- Modify: `SentinelAddin/GhostBuilder/ChangesetExecutor.cs:18-22`
- Modify: `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs:15-39`
- Modify: `SentinelAddin/Commands.ReviewChangesets.cs:91-107`
- Modify: `SentinelAddin/Commands.Standards.cs:173-188, 255-288`
- Modify: `SentinelAddin/Standards/StandardsBuilder.cs:27-29`

**Interfaces:**
- Consumes: `DocPin.Check` (Task 1).
- Produces: `BcfApplyEvent(Document doc)`; `ChangesetPlacementEvent.SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc)`; `ChangesetExecutor.ExecutionResult.NotRun` (bool); `StandardsBuildEvent(Document? doc)`; `StandardsBuilder.Build(UIApplication uiapp, Document doc, StandardsPack pack)`.

- [ ] **Step 1: BCF Issues** — in `BcfApplyEvent.cs` add under the `_topics` field:
```csharp
    private readonly Document _doc;   // the model the Issues window was opened on (XC-1)

    public BcfApplyEvent(Document doc) => _doc = doc;
```
Replace the first two lines of `Execute` (lines 35-36) with:
```csharp
        if (Sentinel.Engine.DocPin.Check(app, _doc, "open the issue") is { } refusal)
        {
            Applied?.Invoke(refusal);
            _viewpoint = null; _topics = null;
            return;
        }
        UIDocument uidoc = app.ActiveUIDocument!;   // DocPin: the active document is _doc
        Document doc = _doc;
```
In `Commands.BcfIssues.cs` line 91: `var apply = new BcfApplyEvent(uiapp.ActiveUIDocument.Document);`

- [ ] **Step 2: AI proposals** — in `ChangesetExecutor.cs` replace `ExecutionResult` (lines 18-22) with:
```csharp
    public sealed class ExecutionResult
    {
        public List<AppliedEntry> Applied { get; } = new();
        public string Error { get; set; }
        /// Nothing was attempted (the model was switched or closed): the changeset stays pending — never reported
        /// as declined, never as applied.
        public bool NotRun { get; set; }
    }
```
In `ChangesetPlacementEvent.cs` replace lines 15-39 with:
```csharp
    private ChangesetDto _cs;
    private HashSet<string> _ticked;
    private Document _doc;

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc) { _cs = cs; _ticked = ticked; _doc = doc; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc;
        _cs = null; _ticked = null; _doc = null;
        if (cs == null || ticked == null || doc == null)
        {
            // A Raise without a staged request must still complete — a silent return would hang
            // any caller awaiting the callback.
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = "no request staged", NotRun = true });
            return;
        }
        if (Sentinel.Engine.DocPin.Check(app, doc, "place the proposals") is { } refusal)
        {
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = refusal, NotRun = true });
            return;
        }
        var result = new ChangesetExecutor().Execute(doc, cs, ticked);
        Completed?.Invoke(result);
    }
```
and add `using Autodesk.Revit.DB;` to its usings.
In `Commands.ReviewChangesets.cs`, inside `onDone` before `if (result.Error != null)` (line 94), add:
```csharp
                if (result.NotRun)
                {
                    TaskDialog.Show("Sentinel — AI proposals", result.Error + "\n\nThe proposals are still pending — run Review AI Proposals again on that model.");
                    return;
                }
```
and change `handler.SetRequest(fresh, new HashSet<string>(ticked));` (line 108) to `handler.SetRequest(fresh, new HashSet<string>(ticked), doc);`

- [ ] **Step 3: Apply Standard** — in `Commands.Standards.cs` `Create()`: move the line `var doc = uiapp.ActiveUIDocument?.Document;` (line 188) up to just before `var build = new StandardsBuildEvent();` (line 178) and change that line to `var build = new StandardsBuildEvent(doc);`. In `StandardsBuildEvent` add:
```csharp
    private readonly Document? _doc;   // the model the review window was opened on (XC-1)

    public StandardsBuildEvent(Document? doc) => _doc = doc;
```
and replace the `BuildReport report; try { report = StandardsBuilder.Build(app, pack); }` lines (275-276) with:
```csharp
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
        try { report = StandardsBuilder.Build(app, doc, pack); }
```
In `StandardsBuilder.cs` replace lines 27-29 with:
```csharp
    public static BuildReport Build(UIApplication uiapp, Document doc, StandardsPack pack)
    {
```
(`doc` is now the parameter; the `var doc = uiapp.ActiveUIDocument.Document;` line is deleted.)

- [ ] **Step 4: Build**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin
git commit -m "feat(revit): BCF zoom, AI placement and Apply Standard run on their own model; a refused placement stays pending (XC-1)"
```

---

### Task 5: Command jobs — MEP Openings and Sanitize

**Files:**
- Modify: `SentinelAddin/Engine/MepVoidManager.cs:170-176, 239-245`
- Modify: `SentinelAddin/Commands.Phase2.cs:22, 72, 114, 133-136, 150`
- Modify: `SentinelAddin/Workflow/FamilySanitizer.cs:32-66`

**Interfaces:**
- Consumes: `RevitEventHub.Enqueue(Document, …)` (Task 2).
- Produces: `MepVoidManager.Reconcile(Document pinned, Action<ReconcileReport> onDone)`; `MepVoidManager.PlaceVoids(Document pinned, List<VoidCandidate> candidates, Action<int, int> onDone)`; `FamilySanitizer.ScanAndLoad(Document? target, string rfaPath, Action<SanitationReport, bool> onDone)`.

- [ ] **Step 1: MEP** — in `MepVoidManager.cs` replace the opening of `Reconcile` (lines 170-176):
```csharp
    public static void Reconcile(Document pinned, Action<ReconcileReport> onDone)
    {
        App.Events?.Enqueue(pinned, "reconcile the MEP voids", (uiapp, doc) =>
        {
            var report = new ReconcileReport();
```
(delete `var doc = uiapp.ActiveUIDocument?.Document;` and `if (doc is null) { onDone(report); return; }`). Replace the opening of `PlaceVoids` (lines 239-245):
```csharp
    public static void PlaceVoids(Document pinned, List<VoidCandidate> candidates, Action<int, int> onDone)
    {
        App.Events?.Enqueue(pinned, "place the voids", (uiapp, doc) =>
        {
```
(delete `var doc = uiapp.ActiveUIDocument?.Document;` and `if (doc is null) { onDone(0, candidates.Count); return; }`).
In `Commands.Phase2.cs`: line 72 `Sentinel.Engine.MepVoidManager.Reconcile(doc, report => HandleReport(report, c.Application, doc));` · line 114 `Sentinel.Engine.MepVoidManager.PlaceVoids(doc, candidates, (placed, failed) =>` · the BCF export job (lines 133-150): replace `App.Events?.Enqueue(evtApp => { var doc2 = evtApp.ActiveUIDocument?.Document; if (doc2 is null) return;` with
```csharp
            App.Events?.Enqueue(doc, "export the BCF", (evtApp, doc2) =>
            {
```
and `BcfExporter.Export(uiapp, issue, outDir)` inside it with `BcfExporter.Export(evtApp, issue, outDir)` (the command's `uiapp` is not valid after its Execute returned).

- [ ] **Step 2: Sanitize** — in `FamilySanitizer.cs` add `using Autodesk.Revit.UI;` and replace `ScanAndLoad` (lines 32-66) with:
```csharp
    /// <summary>Scan an .rfa on disk and, on pass, load it into <paramref name="target"/> — the project the command
    /// was started on (XC-1). No target (no project open) → scan only. Runs on the EventHub.</summary>
    public static void ScanAndLoad(Document? target, string rfaPath, Action<SanitationReport, bool> onDone)
    {
        if (target is null || target.IsFamilyDocument) { App.Events?.Enqueue(uiapp => Run(uiapp, null)); return; }
        App.Events?.Enqueue(target, "load the family", (uiapp, t) => Run(uiapp, t));

        void Run(UIApplication uiapp, Document? into)
        {
            var report = new SanitationReport { FamilyPath = rfaPath };
            Document? famDoc = null;
            bool loaded = false;
            try
            {
                famDoc = uiapp.Application.OpenDocumentFile(rfaPath);
                if (!famDoc.IsFamilyDocument)
                {
                    report.Issues.Add("Not a family document.");
                }
                else
                {
                    Scan(famDoc, report, App.OrgFor(into));   // the project it loads into decides the office code
                    if (report.Passed && into is not null)
                        loaded = famDoc.LoadFamily(into, new OverwriteOptions()) is not null;
                }
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex)
            {
                report.Issues.Add("Could not open family: " + ex.Message);
            }
            finally
            {
                famDoc?.Close(false);
            }
            onDone(report, loaded);
        }
    }
```
In `Commands.Phase2.cs` `SanitizeFamilyCommand.Execute`, add `var target = c.Application.ActiveUIDocument?.Document;` before the file dialog, and change line 22 to `Workflow.FamilySanitizer.ScanAndLoad(target, dlg.FileName, (report, loaded) =>`.

- [ ] **Step 3: Build**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded`.

- [ ] **Step 4: Check no job still reads the active document on its own**

Run: `grep -rn "Enqueue(uiapp =>\|Enqueue(evtApp =>" SentinelAddin --include=*.cs | grep -v /obj/`
Expected: only jobs that do not change or show a model by element (`App.cs` ruleset reload, `RefreshJourney`, `ResetFromUi`, the Standards snapshot's own `doc.IsValidObject` check, `SettingsDialog` machine-scope `RefreshJourney`, `FamilySanitizer` scan-only branch, `FamilyProcessor.ScanLoaded` which pins `doc` itself, the NamingManager / BcfIssues jobs that already compare `d.Equals(doc)`). Any other hit is moved onto the pinned overload in this task.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin
git commit -m "feat(revit): MEP Openings and Sanitize run on their own model; MEP BCF export no longer uses a stale UIApplication (XC-1)"
```

---

### Task 6: SentinelUndo — one Undo entry per action

**Files:**
- Create: `SentinelAddin/Engine/SentinelUndo.cs`
- Modify: `SentinelAddin/Commands.Standards.cs` (StandardsBuildEvent build call from Task 4)
- Modify: `SentinelAddin/Coordination/BcfApplyEvent.cs:57-90` (`ApplyViewpoint`)
- Modify: `SentinelAddin/Workflow/ShowPendingChangeCommand.cs` (`Show` from Task 3)
- Modify: `SentinelAddin/Engine/BcfExporter.cs:47-72` (snapshot isolation)

**Interfaces:**
- Produces: `SentinelUndo.Run(Document doc, string name, Func<bool> body) : bool`; `SentinelUndo.Preview(Document doc, string name, Action body)`.

- [ ] **Step 1: The helper** — `SentinelAddin/Engine/SentinelUndo.cs`:
```csharp
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>XC-2: one Sentinel action = one Undo entry named "Sentinel: …". The action's own transactions run inside a
/// TransactionGroup: kept → Assimilate (one entry), declined → RollBack (none), a throw → RollBack and rethrow to the
/// caller's own handler. A preview (graphics shown only while Sentinel works) always rolls back. A group lives inside
/// one API-thread call — never across two ExternalEvent runs.</summary>
public static class SentinelUndo
{
    public static bool Run(Document doc, string name, Func<bool> body)
    {
        using var g = new TransactionGroup(doc, "Sentinel: " + name);
        g.Start();
        bool keep;
        try { keep = body(); }
        catch { if (g.HasStarted()) g.RollBack(); throw; }
        if (keep) g.Assimilate(); else g.RollBack();
        return keep;
    }

    public static void Preview(Document doc, string name, Action body)
    {
        using var g = new TransactionGroup(doc, "Sentinel: " + name);
        g.Start();
        try { body(); }
        finally { if (g.HasStarted()) g.RollBack(); }
    }
}
```

- [ ] **Step 2: Apply Standard is one Undo** — in `StandardsBuildEvent.Execute` replace `try { report = StandardsBuilder.Build(app, doc, pack); }` and its `catch` with:
```csharp
        try
        {
            BuildReport built = new BuildReport();
            Sentinel.Engine.SentinelUndo.Run(doc, "Apply standard", () => { built = StandardsBuilder.Build(app, doc, pack); return true; });
            report = built;
        }
        catch (Exception ex)
        {
            report = new BuildReport();
            report.Failed.Add("Build error: " + ex.Message + " — nothing was changed (undone).");
        }
```

- [ ] **Step 3: BCF viewpoint is one Undo** — in `BcfApplyEvent.ApplyViewpoint` replace lines 63-84 (from `View3D? view = GetOrCreateCoordinationView(doc);` through `uidoc.ActiveView = view; }`) with:
```csharp
        View3D? view = null;
        string cameraNote = "";
        Sentinel.Engine.SentinelUndo.Run(doc, "open issue viewpoint", () =>
        {
            view = GetOrCreateCoordinationView(doc);
            if (view is null) return false;
            using var t = new Transaction(doc, "Sentinel: apply BCF viewpoint");
            t.Start();
            if (vp.Camera is { } cam)
            {
                try { (XYZ eye, XYZ fwd, XYZ up) = ToRevit(doc, cam); view.SetOrientation(new ViewOrientation3D(eye, up, fwd)); }
                catch (Exception camEx) { cameraNote = "  (camera skipped: " + camEx.Message + ")"; }
            }
            if (ids.Count > 0)
            {
                view.DisableTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);
                view.IsolateElementsTemporary(ids);
            }
            t.Commit();
            return true;
        });
        if (view is not null && view.IsValidObject) uidoc.ActiveView = view;   // after the group: no open transaction
```

- [ ] **Step 4: Change preview is one Undo** — in `ShowPendingChangeCommand.Show`, wrap from `Reset(); // never stack two previews` through `t.Commit();` so the clear and the paint are one entry:
```csharp
            bool isolate = false;
            OverrideGraphicSettings original = null!;
            Sentinel.Engine.SentinelUndo.Run(d, "preview the change", () =>
            {
                Reset(); // never stack two previews

                using var t = new Transaction(d, "Sentinel: Preview pending change");
                t.Start();

                original = view.GetElementOverrides(id);
                isolate = !view.IsInTemporaryViewMode(TemporaryViewMode.TemporaryHideIsolate);

                var ogs = new OverrideGraphicSettings()
                    .SetSurfaceTransparency(40)
                    .SetSurfaceForegroundPatternColor(new Color(70, 170, 110))
                    .SetProjectionLineColor(new Color(30, 110, 70))
                    .SetProjectionLineWeight(6);
                var solid = GetSolidFillPattern(d);
                if (solid is not null) ogs.SetSurfaceForegroundPatternId(solid.Id);

                view.SetElementOverrides(id, ogs);
                if (isolate) view.IsolateElementTemporary(id);

                t.Commit();
                return true;
            });
```
(the `lock (Gate) _active = …`, `SetElementIds` and `ShowElements` lines follow unchanged.) Note: `Reset()` may clear a preview on a different document; that transaction is outside `d`'s group and keeps its own entry — correct, it is a different model's undo list.

- [ ] **Step 5: BCF snapshot leaves no Undo entry** — in `BcfExporter.Export` replace lines 47-72 (from `// ---- 1. Snapshot` through the restore block) with:
```csharp
        // ---- 1. Snapshot (with temporary isolation when we have a 3D view; rolled back — no Undo entry) ----
        string snapshotPath = Path.Combine(work, topicGuid, "snapshot.png");
        if (view3d is not null && issue.Components.Count > 0)
        {
            SentinelUndo.Preview(doc, "BCF snapshot", () =>
            {
                try
                {
                    using var t = new Transaction(doc, "Sentinel: BCF snapshot isolation");
                    t.Start();
                    view3d.IsolateElementsTemporary(issue.Components);
                    t.Commit();
                    uidoc.ShowElements(issue.Components);
                }
                catch (Autodesk.Revit.Exceptions.ApplicationException) { }
                ExportSnapshot(doc, snapshotPath);
            });
        }
        else ExportSnapshot(doc, snapshotPath);
```

- [ ] **Step 6: Build**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded`.

- [ ] **Step 7: Commit**

```bash
git add SentinelAddin
git commit -m "feat(revit): one Undo entry per Sentinel action — Apply Standard, BCF viewpoint, change preview; BCF snapshot leaves none (XC-2)"
```

---

### Task 7: The live watcher follows every project document (BG-1)

**Files:**
- Modify: `SentinelAddin/Updaters/SentinelUpdater.cs:21, 30-33, 62`
- Modify: `SentinelAddin/Workflow/RequestManager.cs:47-75`
- Modify: `SentinelAddin/App.cs:86-87, 114-115, 124-137`

**Interfaces:**
- Produces: `SentinelUpdater.UnregisterFor(Document doc)`; `RequestManager.Forget(Document doc)`.

- [ ] **Step 1: Updater keyed by the document** — in `SentinelUpdater.cs`:
line 21: `private static readonly Dictionary<Document, SentinelUpdater> Registered = new();`
lines 32-33:
```csharp
        // Keyed by the Document itself (Equals/GetHashCode), never PathName/Title: a new project's path is empty until
        // its first save, and two unsaved projects can share a title.
        if (doc.IsFamilyDocument || Registered.ContainsKey(doc)) return;
```
line 62: `Registered[doc] = updater;`
Add after `RegisterFor`:
```csharp
    /// Closing: this document's triggers and registration go with it; the other open documents keep theirs.
    public static void UnregisterFor(Document doc)
    {
        if (!Registered.TryGetValue(doc, out var u)) return;
        Registered.Remove(doc);
        if (UpdaterRegistry.IsUpdaterRegistered(u._id, doc))
        {
            UpdaterRegistry.RemoveDocumentTriggers(u._id, doc);
            UpdaterRegistry.UnregisterUpdater(u._id, doc);
        }
    }
```
Replace the enforcement-mode comment block (lines 88-93) with the truth:
```csharp
        // Enforcement modes (Decision 4):
        //  monitor -> log only (panel)
        //  warn    -> panel + a status line
        //  request -> pending change request + flag element
        //  block   -> nothing extra here yet: package 2 of the Revit plan makes BLOCK stop the sync
```

- [ ] **Step 2: Snapshots keyed by the document** — in `RequestManager.cs` replace lines 47-50 with:
```csharp
    // Keyed by the Document (not PathName/Title): a first save or Save As changes the path, and the snapshot must
    // still be found — a request made after it then carries the real old name (BG-1).
    private static readonly Dictionary<Document, Dictionary<long, string>> Snapshots =
        new Dictionary<Document, Dictionary<long, string>>();

    public static void Forget(Document doc) => Snapshots.Remove(doc);
```
and in `RefreshSnapshot`, `GetSnapshotName`, `UpdateSnapshot` replace `Key(doc)` with `doc`.

- [ ] **Step 3: App wires created and closing documents** — in `App.cs` after line 86 add
`app.ControlledApplication.DocumentCreated += OnDocumentCreated; // File ▸ New: watched like an opened project`
and in `OnShutdown` after line 114 add `app.ControlledApplication.DocumentCreated -= OnDocumentCreated;`
Add after `OnDocumentOpened`:
```csharp
    // A new project (File ▸ New) is watched like an opened one; its ruleset@n loads when its view activates.
    private static void OnDocumentCreated(object? sender, DocumentCreatedEventArgs e)
    {
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
        Workflow.RequestManager.RefreshSnapshot(doc);
    }
```
In `OnDocumentClosing` add after `ReloadSeq.Remove(e.Document);`:
```csharp
        SentinelUpdater.UnregisterFor(e.Document);
        Workflow.RequestManager.Forget(e.Document);
```

- [ ] **Step 4: Build**

Run: `cd SentinelAddin && dotnet build -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin
git commit -m "fix(revit): the live watcher and name snapshots follow each project document — new projects, reopen, Save As (BG-1)"
```

---

### Task 8: All versions, all checks, spec note, merge

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-revit-addin-safe-honest-design.md` (XC-2 scope note)

- [ ] **Step 1: Build every verified version**

Run (from `SentinelAddin/`):
```bash
for v in 2024 2025 2026; do dotnet build -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Build succeeded| error " | head -3; done
```
Expected: `Build succeeded` three times.

- [ ] **Step 2: Run every Revit-free check** (the CI list plus docpin)

Run (from the repo root): `for p in fixplace naming org snapshot gate ghost-standards heal event publish roi docpin; do dotnet run --project tools/$p-check 2>&1 | tail -1; done`
Expected: every line ends `checks pass` with no failures.

- [ ] **Step 3: Record the XC-2 scope in the spec** — under Package 1's XC-2 paragraph add:
`Built for Apply Standard, the BCF viewpoint, the change-request preview and the BCF snapshot (rolled back, no entry). MEP Openings keeps two entries (reconcile and place are two user-separated steps; one group cannot span two ExternalEvent runs). Heal is left as is: whether LoadFamily may run inside a TransactionGroup is unverified, and Heal already pins its document.`
and under BG-1 add: `As built: keying the snapshots by the Document itself makes a re-snapshot after Save / Save As unnecessary — the key no longer changes.`

- [ ] **Step 4: Refresh the graph** — `graphify update .`

- [ ] **Step 5: Commit, merge, scan, push**

```bash
git add docs/superpowers/specs/2026-09-30-revit-addin-safe-honest-design.md graphify-out
git commit -m "docs(spec): package 1 XC-2 scope as built"
git checkout master && git merge --no-ff feature/revit-safe-honest -m "Merge feature/revit-safe-honest: package 1 — right model, one undo (XC-1, XC-2, BG-1)"
git diff origin/master..master | grep -iE "^\+.*(sk-[a-z0-9]{20}|eyJ[a-zA-Z0-9_-]{20}|ghp_[A-Za-z0-9]{20}|service_role|BEGIN (RSA|OPENSSH|PRIVATE))"   # expect no output
git push origin master
```

---

### Task 9: Live drill B31 (Revit 2024, with the founder)

Deploy first with Revit closed: `cd SentinelAddin && dotnet build -p:RevitVersion=2024` (DeployToRevit on). Then, with Demo and aster-tower open, record each row in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as Session B31:

| # | Do | Pass when |
|---|---|---|
| 1 | Pane shows aster's rows. Open a family for edit from aster (the pane stays on aster: a family editor never moves it). Double-click an aster row | Dialog "Sentinel did not select the element: switch back to …aster… — nothing was changed."; the family editor's selection is unchanged |
| 2 | Same setup (family editor in front, pane on aster): ⚡ Fix an aster row, Execute | Status "✕ Sentinel did not rename the element: switch back to …aster…"; the family's Undo list is unchanged; aster's element keeps its name |
| 3 | Open each modeless window on Demo — Clash Manager, Change Requests (Show and Approve), BCF Issues (double-click, Isolate all), Review AI Proposals, Apply Standard — then switch to aster and act in that window | Each refuses with its own "Sentinel did not <what>" line; aster's Undo list unchanged; the AI proposals stay pending; the change request stays in the list |
| 4 | Apply Standard on Demo; a BCF zoom; BCF Isolate all; a change-request Show | Undo shows exactly one "Sentinel: Apply standard" / "Sentinel: open issue viewpoint" / "Sentinel: isolate issue elements" / "Sentinel: preview the change" entry each (a second Show also leaves its own "Clear change preview") |
| 5 | Export a clash to BCF from a 3D view | The .bcfzip has a snapshot of the isolated elements; Undo list unchanged by the export |
| 6 | File ▸ New project; rename a view against a non-compliant pattern | A live row appears without Scan Now |
| 7 | Close aster, reopen it in the same session; rename a view under a request-mode rule | A Pending request appears with the real old name |
| 8 | New project, Save As, then a request-mode rename | The request carries the real old name (not empty) |

Not drillable by hand, left to code review: a close cancelled by another add-in (re-watched in DocumentClosed); Project Setup save and MEP Openings (both run before the user can switch models).

A row that fails is fixed on the branch before package 2 starts; a row that cannot be run is recorded as not run, with why.
