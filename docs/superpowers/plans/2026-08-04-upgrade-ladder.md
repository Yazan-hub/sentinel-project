# Upgrade Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch-upgrade RVT/RFA files to any newer installed Revit version from a Sentinel ribbon tool, with downgrade requests honestly refused (spec: `docs/superpowers/specs/2026-08-04-upgrade-ladder-design.md`).

**Architecture:** A pure header parser detects each file's saved version without opening Revit. The window builds a job queue; the command launches the target Revit; the Sentinel add-in already deployed in that version notices the queue at startup, processes it with warning suppression, writes per-job results, and exits. Nothing silent: every job ends in a visible state.

**Tech Stack:** C# dual-target net48 + net8.0-windows (Revit 2021–2027 build matrix already in `Sentinel.csproj`), code-built WPF, existing check-tool pattern (`tools/*-check`).

## Global Constraints

- Compiles on BOTH net48 and net8.0-windows: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2024 -p:DeployToRevit=false` green after every task.
- `Engine/RvtFileInfo.cs` and `Engine/UpgradeQueue.cs` are PURE: zero `Autodesk.Revit` usings (compiled standalone by the new check tool).
- All new modal windows use `SentinelAddin/UI/DialogOwner.cs` (`DialogOwner.Attach(window, commandData)`).
- Sources are never modified; output goes to `upgraded-<version>` subfolder; workshared files come out detached.
- Queue path: `%AppData%\Sentinel\upgrade-queue.json`; results: `%AppData%\Sentinel\upgrade-results.json`; stale threshold 1 hour.
- No new NuGet dependencies.
- Spec deviation (approved posture: honest simplification): `Flavor` is derived from file extension (`.rvt`→Project, `.rfa`→Family, `.rte`→Template, else Unknown), not from CFB streams.

---

### Task 1: RvtFileInfo — pure version detection + check tool

**Files:**
- Create: `SentinelAddin/Engine/RvtFileInfo.cs`
- Create: `tools/rvtinfo-check/rvtinfo-check.csproj`
- Create: `tools/rvtinfo-check/Check.cs`

**Interfaces:**
- Produces: `namespace Sentinel.Engine; public static class RvtFileInfo` with
  `public sealed record Result(string SavedVersion, string Flavor);` (SavedVersion `"2023"` style or `""` when unknown) and
  `public static Result Read(string path)` — never throws; unknown/garbage → `Result("", flavor-from-extension)`.

- [ ] **Step 1: Create the check tool project (the failing test)**

`tools/rvtinfo-check/rvtinfo-check.csproj` — copy the shape of `tools/datum-check/datum-check.csproj` (net8.0, includes the pure source file):

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RvtFileInfo.cs" Link="RvtFileInfo.cs" />
  </ItemGroup>
</Project>
```

`tools/rvtinfo-check/Check.cs` (follow the assert idiom of `tools/datum-check/Check.cs` — read it first):

```csharp
using Sentinel.Engine;

static byte[] FakeRvt(string marker)
{
    // Minimal fixture: OLE magic + padding + the marker as UTF-16LE, as it
    // appears inside BasicFileInfo. Parser must find it by byte scan.
    var head = new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };
    var pad = new byte[512];
    var text = System.Text.Encoding.Unicode.GetBytes(marker);
    return head.Concat(pad).Concat(text).Concat(pad).ToArray();
}

int fail = 0;
void Check(bool ok, string name)
{ if (ok) Console.WriteLine("PASS " + name); else { Console.WriteLine("FAIL " + name); fail++; } }

var dir = Path.Combine(Path.GetTempPath(), "rvtinfo-check");
Directory.CreateDirectory(dir);

// 1. Format marker wins
var p1 = Path.Combine(dir, "a.rvt");
File.WriteAllBytes(p1, FakeRvt("Format: 2023"));
Check(RvtFileInfo.Read(p1).SavedVersion == "2023", "format-marker");
Check(RvtFileInfo.Read(p1).Flavor == "Project", "flavor-rvt");

// 2. Build-string fallback
var p2 = Path.Combine(dir, "b.rfa");
File.WriteAllBytes(p2, FakeRvt("Autodesk Revit 2025 (Build: 25.1)"));
Check(RvtFileInfo.Read(p2).SavedVersion == "2025", "build-fallback");
Check(RvtFileInfo.Read(p2).Flavor == "Family", "flavor-rfa");

// 3. Garbage: no version, no throw
var p3 = Path.Combine(dir, "c.rte");
File.WriteAllBytes(p3, new byte[] { 1, 2, 3, 4 });
Check(RvtFileInfo.Read(p3).SavedVersion == "", "garbage-no-version");
Check(RvtFileInfo.Read(p3).Flavor == "Template", "flavor-rte");

// 4. Missing file: no throw
Check(RvtFileInfo.Read(Path.Combine(dir, "missing.rvt")).SavedVersion == "", "missing-no-throw");

Console.WriteLine(fail == 0 ? "RVTINFO OK" : $"{fail} FAILURES");
return fail == 0 ? 0 : 1;
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet run --project tools/rvtinfo-check`
Expected: compile FAILURE — `RvtFileInfo` does not exist.

- [ ] **Step 3: Implement RvtFileInfo**

`SentinelAddin/Engine/RvtFileInfo.cs`:

```csharp
using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// Reads a Revit file's saved version WITHOUT opening Revit, by scanning the
/// OLE container bytes for the BasicFileInfo version markers ("Format: 2023"
/// preferred, "Autodesk Revit 20xx" fallback). Pure — no Revit API, offline
/// tested by tools/rvtinfo-check. Never throws: unknown input => "".
/// ponytail: byte-scan instead of a CFB parser — the markers are UTF-16 text
/// in the first MB of every RVT/RFA since 2011; add a real CFB reader only
/// if a future format breaks this.
/// </summary>
public static class RvtFileInfo
{
    public sealed record Result(string SavedVersion, string Flavor);

    private static readonly Regex FormatRx = new(@"Format:\s*(20\d\d)", RegexOptions.Compiled);
    private static readonly Regex BuildRx = new(@"Autodesk Revit (20\d\d)", RegexOptions.Compiled);

    public static Result Read(string path)
    {
        var flavor = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".rvt" => "Project", ".rfa" => "Family", ".rte" => "Template", _ => "Unknown",
        };
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var len = (int)Math.Min(fs.Length, 4 * 1024 * 1024); // markers live early
            var buf = new byte[len];
            var read = 0;
            while (read < len) { var n = fs.Read(buf, read, len - read); if (n <= 0) break; read += n; }
            var text = Encoding.Unicode.GetString(buf, 0, read);
            var m = FormatRx.Match(text);
            if (m.Success) return new Result(m.Groups[1].Value, flavor);
            m = BuildRx.Match(text);
            if (m.Success) return new Result(m.Groups[1].Value, flavor);
            return new Result("", flavor);
        }
        catch { return new Result("", flavor); }
    }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `dotnet run --project tools/rvtinfo-check`
Expected: 7× PASS, `RVTINFO OK`.
Bonus manual sanity (do it, record output): `dotnet run --project tools/rvtinfo-check` proves fixtures; then verify against ONE real file if present on the machine (e.g. any sample RVT) via a temporary `Console.WriteLine(RvtFileInfo.Read(@"C:\Program Files\Autodesk\Revit 2024\Samples\Snowdon Towers Sample Architectural.rvt"))` line in Check.cs — expect `2024` — then REMOVE the temporary line (machine-specific path must not stay in the check).

- [ ] **Step 5: Both add-in builds green, commit**

```bash
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026 -p:DeployToRevit=false
dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false
git add SentinelAddin/Engine/RvtFileInfo.cs tools/rvtinfo-check
git commit -m "feat(upgrade): pure RVT version detection + rvtinfo-check (7 offline asserts)"
```

---

### Task 2: UpgradeQueue — pure queue/results contract

**Files:**
- Create: `SentinelAddin/Engine/UpgradeQueue.cs`
- Modify: `tools/rvtinfo-check/rvtinfo-check.csproj` (compile UpgradeQueue.cs too)
- Modify: `tools/rvtinfo-check/Check.cs` (append queue asserts)

**Interfaces:**
- Produces: `namespace Sentinel.Engine;`
  - `public sealed class UpgradeJob { public string Src; public string Dest; public bool? Ok; public int Warnings; public long Ms; public string? Error; }` (System.Text.Json properties `src,dest,ok,warnings,ms,error`)
  - `public sealed class UpgradeQueue { public string Target; public DateTimeOffset CreatedAt; public List<UpgradeJob> Jobs; }` (`target,created_at,jobs`)
  - `public static class UpgradeQueueStore` with:
    - `public static string QueuePath` / `public static string ResultsPath` (under `%AppData%\Sentinel\`)
    - `public static void SaveQueue(UpgradeQueue q)` / `public static UpgradeQueue? LoadQueueFor(string version)` — returns null when file absent, target mismatch, or stale (> 1 h; stale file renamed to `upgrade-queue.stale.json` and a `Console.WriteLine` warning emitted)
    - `public static void SaveResults(UpgradeQueue q, bool done)` — writes `{target, done, jobs}` to ResultsPath
    - `public static (bool done, List<UpgradeJob> jobs)? LoadResults()`

- [ ] **Step 1: Append failing asserts to Check.cs**

```csharp
// ---- UpgradeQueue contract ----
var q = new UpgradeQueue { Target = "2026", CreatedAt = DateTimeOffset.Now,
    Jobs = { new UpgradeJob { Src = @"C:\x\a.rvt", Dest = @"C:\x\upgraded-2026\a.rvt" } } };
UpgradeQueueStore.SaveQueue(q);
Check(UpgradeQueueStore.LoadQueueFor("2026") != null, "queue-roundtrip");
Check(UpgradeQueueStore.LoadQueueFor("2025") == null, "queue-target-mismatch");
q.CreatedAt = DateTimeOffset.Now.AddHours(-2); UpgradeQueueStore.SaveQueue(q);
Check(UpgradeQueueStore.LoadQueueFor("2026") == null, "queue-stale-rejected");
Check(!File.Exists(UpgradeQueueStore.QueuePath), "stale-renamed-away");
q.CreatedAt = DateTimeOffset.Now; q.Jobs[0].Ok = true; q.Jobs[0].Warnings = 3;
UpgradeQueueStore.SaveResults(q, done: true);
var r = UpgradeQueueStore.LoadResults();
Check(r != null && r.Value.done && r.Value.jobs[0].Warnings == 3, "results-roundtrip");
```

(Also add `<Compile Include="..\..\SentinelAddin\Engine\UpgradeQueue.cs" Link="UpgradeQueue.cs" />` to the csproj. Clean up: delete queue/results files at the start of the queue section so re-runs are deterministic.)

- [ ] **Step 2: Run — expect compile failure (types missing)**

- [ ] **Step 3: Implement UpgradeQueue.cs**

Pure C#: System.Text.Json with `JsonPropertyName` attributes matching the interface block; `QueuePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "upgrade-queue.json")`; ensure directory exists on save; stale = `DateTimeOffset.Now - CreatedAt > TimeSpan.FromHours(1)`; `LoadQueueFor` deletes nothing valid — only renames stale (overwrite an existing `.stale.json`). Match the exact JSON key names from the spec (`target`, `created_at`, `jobs`, `src`, `dest`, `ok`, `warnings`, `ms`, `error`, `done`).

- [ ] **Step 4: Run — all asserts pass (`RVTINFO OK`), both add-in builds green**

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/Engine/UpgradeQueue.cs tools/rvtinfo-check
git commit -m "feat(upgrade): pure queue/results contract with stale guard (offline-tested)"
```

---

### Task 3: UpgradeQueueRunner — process the queue inside the target Revit

**Files:**
- Create: `SentinelAddin/Upgrader/UpgradeQueueRunner.cs`
- Modify: `SentinelAddin/App.cs` (hook in `OnStartup`; read the file first — follow its existing event-subscription style)

**Interfaces:**
- Consumes: `UpgradeQueueStore.LoadQueueFor(version)` / `SaveResults` (Task 2). Revit version string: `app.ControlledApplication.VersionNumber` in `OnStartup`.
- Produces: `public static class UpgradeQueueRunner { public static void TryArm(UIControlledApplication app); }` — called once from `App.OnStartup` AFTER ribbon registration; no-ops (fast) when no queue matches.

- [ ] **Step 1: Implement the runner**

```csharp
using System;
using System.Diagnostics;
using System.IO;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;
using Sentinel.Engine;

namespace Sentinel.Upgrader;

/// <summary>
/// When THIS Revit version is named as the target of a pending upgrade queue,
/// process it at ApplicationInitialized (docs can't open during OnStartup),
/// write per-job results as we go, then exit Revit. Warning dialogs are
/// suppressed and counted; a failing job never stops the batch.
/// </summary>
public static class UpgradeQueueRunner
{
    private static UpgradeQueue? _queue;
    private static int _dialogsSuppressed;

    public static void TryArm(UIControlledApplication app)
    {
        _queue = UpgradeQueueStore.LoadQueueFor(app.ControlledApplication.VersionNumber);
        if (_queue is null) return;
        app.DialogBoxShowing += OnDialog;                       // swallow upgrade prompts
        app.ControlledApplication.FailuresProcessing += OnFailures;
        app.ControlledApplication.ApplicationInitialized += OnReady;
    }

    private static void OnDialog(object? s, DialogBoxShowingEventArgs e)
    { _dialogsSuppressed++; e.OverrideResult(1); }              // 1 == OK/close

    private static void OnFailures(object? s, Autodesk.Revit.DB.Events.FailuresProcessingEventArgs e)
    {
        var fa = e.GetFailuresAccessor();
        fa.DeleteAllWarnings();                                  // count via _dialogsSuppressed only
        e.SetProcessingResult(FailureProcessingResult.Continue);
    }

    private static void OnReady(object? sender, Autodesk.Revit.DB.Events.ApplicationInitializedEventArgs e)
    {
        var dbApp = (Application)sender!;
        foreach (var job in _queue!.Jobs)
        {
            var sw = Stopwatch.StartNew();
            _dialogsSuppressed = 0;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(job.Dest)!);
                var mp = ModelPathUtils.ConvertUserVisiblePathToModelPath(job.Src);
                var opts = new OpenOptions
                { DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets };
                var doc = dbApp.OpenDocumentFile(mp, opts);
                doc.SaveAs(job.Dest, new SaveAsOptions { OverwriteExistingFile = true });
                doc.Close(false);
                job.Ok = true;
            }
            catch (Exception ex) { job.Ok = false; job.Error = ex.Message; }
            job.Warnings = _dialogsSuppressed;
            job.Ms = sw.ElapsedMilliseconds;
            UpgradeQueueStore.SaveResults(_queue, done: false);  // truthful partial on crash
        }
        UpgradeQueueStore.SaveResults(_queue, done: true);
        File.Delete(UpgradeQueueStore.QueuePath);
        // ponytail: this instance exists only to run the queue — kill is the
        // reliable exit (PostableCommand.ExitRevit prompts on some versions).
        Process.GetCurrentProcess().Kill();
    }
}
```

(Adapt event arg namespaces to what actually compiles per Revit API version — check with both builds. If `DialogBoxShowingEventArgs.OverrideResult` needs a different code on net48/2024, use `e.OverrideResult((int)TaskDialogResult.Ok)` and verify.)

- [ ] **Step 2: Hook in App.cs**

At the END of `OnStartup`, after ribbon registration:

```csharp
Sentinel.Upgrader.UpgradeQueueRunner.TryArm(application);
```

- [ ] **Step 3: Both builds green (2026 + 2024, -p:DeployToRevit=false). Commit**

```bash
git add SentinelAddin/Upgrader/UpgradeQueueRunner.cs SentinelAddin/App.cs
git commit -m "feat(upgrade): queue runner — target Revit processes the batch at startup, suppresses warning dialogs, writes truthful partial results, exits"
```

---

### Task 4: UpgradeWindow + command + ribbon

**Files:**
- Create: `SentinelAddin/UI/UpgradeWindow.cs`
- Create: `SentinelAddin/Commands.Upgrade.cs`
- Modify: `SentinelAddin/App.cs` (ribbon: add "Upgrade Files" push button to the Standards & Build panel — read the existing `Push`/`Pull`/`Sub` helpers ~L245-272 and the Standards pulldown block, follow that idiom exactly; keep all existing buttons)

**Interfaces:**
- Consumes: `RvtFileInfo.Read`, `UpgradeQueue`/`UpgradeQueueStore` (Tasks 1-2), `DialogOwner.Attach(window, commandData)`.
- Produces: command class `Sentinel.Commands.UpgradeFilesCommand : IExternalCommand`; window `Sentinel.UI.UpgradeWindow` with ctor `(IReadOnlyList<(string path, string version, string flavor)> rows, IReadOnlyList<string> installedVersions, string currentVersion)` and properties `string? TargetVersion`, `IReadOnlyList<string> TickedPaths` after `ShowDialog()==true`.

- [ ] **Step 1: Installed-version detection (inside Commands.Upgrade.cs)**

```csharp
private static List<string> InstalledRevits()
{
    var found = new List<string>();
    for (var v = 2021; v <= 2030; v++)
    {
        var exe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Autodesk", "Revit " + v, "Revit.exe");
        if (File.Exists(exe)) found.Add(v.ToString());
    }
    return found;
}
private static string RevitExe(string version) =>
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "Autodesk", "Revit " + version, "Revit.exe");
```

(ponytail: path probe instead of registry — same truth, no registry plumbing. The loop's 2030 ceiling is deliberate headroom.)

- [ ] **Step 2: Command flow**

`UpgradeFilesCommand.Execute`:
1. Folder pick — reuse the idiom from `Commands.GhostBuilder.cs`'s folder handling; if the Ghost source folder settings exist, start there, else `OpenFileDialog`-based folder select (or `OpenFolderDialog` behind `#if !NET48`, message on net48 — copy the `SettingsDialog.xaml.cs` `OnBrowseGhostFolder` pattern).
2. Enumerate `*.rvt` + `*.rfa` (top level), run `RvtFileInfo.Read` per file.
3. `new UpgradeWindow(rows, InstalledRevits(), currentVersion)` + `DialogOwner.Attach`; show.
4. On accept: build `UpgradeQueue { Target = win.TargetVersion, CreatedAt = now, Jobs = ticked.Select(p => new UpgradeJob { Src = p, Dest = Path.Combine(Path.GetDirectoryName(p), "upgraded-" + win.TargetVersion, Path.GetFileName(p)) }) }`; `UpgradeQueueStore.SaveQueue`; delete any old results file; `Process.Start(RevitExe(win.TargetVersion))`.
5. Poll loop: modeless progress `TaskDialog` is not pollable — instead use a simple WPF progress window (code-built, DialogOwner-attached, with a Cancel button) + `DispatcherTimer` every 2 s reading `UpgradeQueueStore.LoadResults()`; update "n of m done"; on `done: true` (or 10-min timeout / Cancel) close and show the report: one line per job — `✓ name (2023 → 2026, 3 warnings, 41 s)` / `✕ name — <error>`; timeout message lists completed vs pending jobs by name.

- [ ] **Step 3: UpgradeWindow**

Code-built WPF following `DwgPickWindow.cs` / `GhostReviewWindow.cs` idiom: title "Sentinel — Upgrade Files", header text "Upgraded copies are written to an 'upgraded-<version>' subfolder. Sources are never modified. Workshared files are detached. Downgrading needs the Version Bridge (not built yet).", rows as CheckBox list `name · detected version · flavor`, target ComboBox of installed versions. Row rules: detected > target → disabled, suffix " · downgrade — refused"; detected == target → enabled but unticked, suffix " · already this version"; detected empty → enabled unticked, suffix " · version unknown"; detected < target → ticked. Recompute row states when the target selection changes. OK button label "Upgrade N file(s) ▶" disabled at N=0.

- [ ] **Step 4: Ribbon**

Add `Push` button `Sentinel_Upgrade`, text `"Upgrade\nFiles"`, to the Standards & Build panel after the ROI button, className `Sentinel.Commands.UpgradeFilesCommand`, reuse an existing icon if no new one is trivial (check how other buttons load icons in App.cs; a distinct existing resource is fine — note which you used).

- [ ] **Step 5: Both builds green; `dotnet run --project tools/rvtinfo-check` still OK; commit**

```bash
git add SentinelAddin/UI/UpgradeWindow.cs SentinelAddin/Commands.Upgrade.cs SentinelAddin/App.cs
git commit -m "feat(upgrade): Upgrade Files tool - batch window, honest downgrade refusal, target Revit launch + result polling"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/handbook/05-capability-status.md` (new row under "The differentiated seam" or Platform: `| Upgrade Ladder (batch cross-version upgrades) | 🟩 Built | Queue runner in every deployed Revit; downgrades refused honestly; ✅ after the live drill |`)
- Modify: `docs/TESTING_PROTOCOL.md` (Session A table: add row `| Upgrade Files | Mixed-version batch → newest installed: upgraded copies open clean; downgrade row refused with reason; corrupt file fails its row only; report matches disk |`)
- Modify: `docs/handbook/01-overview.md` or the ribbon table doc ONLY if a grep for "Standards & Build" tool lists shows a table that would now be stale (grep first; smallest honest edit).

- [ ] **Step 1: Make the edits** (repo voice: plain, honest, states what is NOT covered — no downgrades, output detached).
- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs: Upgrade Ladder recorded - built, drill added to protocol, downgrade posture stated"
```

---

### Task 6: Live drill (human + Claude)

- [ ] Deploy to the two Revit versions involved (close Revit first): `dotnet build -p:RevitVersion=2024` and `-p:RevitVersion=2026`.
- [ ] Make a test folder with: one 2023-saved file (Golden Nugget original is 2024 — use any 2021/2023 sample or an old project), one 2024 file, one corrupt file (rename a .txt to .rvt), one 2026 file (save something from 2026 first).
- [ ] Run Upgrade Files in Revit 2024, target 2026: the 2026 row must be refused (downgrade), corrupt row must show "version unknown", ticked rows upgrade; Revit 2026 launches, processes, exits; report matches `upgraded-2026\` contents; upgraded file opens clean in 2026.
- [ ] Update `05-capability-status.md` row to ✅ with date + what was demonstrated; log any findings in a `docs/reviews/` session file. Commit + push.
