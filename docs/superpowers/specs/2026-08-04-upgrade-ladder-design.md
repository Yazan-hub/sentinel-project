# Upgrade Ladder — batch Revit file upgrading (design)

Approved 2026-08-04. Feature: batch-upgrade RVT/RFA files to any newer
installed Revit version from inside Sentinel, with honest refusal of
downgrade requests.

## Why (and the platform truth)

Files arrive in assorted versions; pulling them into the working version
means open→wait→upgrade→save per file. Revit cannot save DOWN — no API
exists; that direction is a different future feature (the IFC "Version
Bridge"). This tool automates the UP direction only and says so.

## Components

1. **`SentinelAddin/Engine/RvtFileInfo.cs`** — pure C#, zero Revit refs.
   Reads an RVT/RFA's OLE compound-file `BasicFileInfo` stream and returns
   `{ SavedVersion (e.g. "2023"), Flavor (Project|Family|Template|Unknown) }`.
   Never throws on garbage input — returns Unknown. Offline check tool
   `tools/rvtinfo-check` with byte-fixture tests (no real RVTs in repo;
   synthesized OLE fixtures with the version string embedded).
2. **`SentinelAddin/UI/UpgradeWindow.cs`** — code-built WPF (house idiom),
   `DialogOwner`-anchored. Folder pick → table rows (name, detected
   version, status), target-version dropdown listing INSTALLED Revits
   (registry scan `HKLM\SOFTWARE\Autodesk\Revit\<ver>` + fallback to
   `C:\Program Files\Autodesk\Revit <ver>\Revit.exe` existence), tick
   rows, Run. Rows with detected version > target show status
   "downgrade — needs the Version Bridge (not built)" and cannot be
   ticked. Rows equal to target show "already <ver>" unticked.
3. **`SentinelAddin/Commands.Upgrade.cs`** — `Sentinel → Standards & Build
   → Upgrade Files`. Shows window; on Run writes the queue file, launches
   the target `Revit.exe` (plain start, no journal), then polls
   `upgrade-results.json` (2 s interval, 10 min timeout, cancellable
   progress dialog) and renders the final per-file report.
4. **`SentinelAddin/Upgrader/UpgradeQueueRunner.cs`** — compiled into the
   SAME Sentinel add-in already deployed per version; hooked from
   `App.OnStartup`. If `%AppData%\Sentinel\upgrade-queue.json` exists AND
   `queue.target` == this Revit's version AND `created_at` < 1 h old:
   process jobs, then close Revit (`uiapp... post quit`); else normal
   startup. Stale queue → renamed to `.stale` + warning logged, normal
   startup proceeds.

## Queue / results contract

```json
// upgrade-queue.json
{ "target": "2026", "created_at": "ISO8601",
  "jobs": [ { "src": "C:\\...\\a.rvt", "dest": "C:\\...\\upgraded-2026\\a.rvt" } ] }
// upgrade-results.json (appended per job, then finalized)
{ "target": "2026", "done": true,
  "jobs": [ { "src": "...", "ok": true, "warnings": 3, "ms": 41200,
              "error": null } ] }
```

## Processing rules (runner)

- `OpenOptions { DetachFromCentralOption = DetachAndPreserveWorksets }`
  for workshared files; plain open otherwise; never Audit by default.
- `DialogBoxShowing` handler + `IFailuresPreprocessor`: warnings swallowed
  and COUNTED per job; errors fail that job only, batch continues.
- `SaveAs` with overwrite-allowed to `dest`; source never touched.
- Families (`.rfa`) opened via `OpenDocumentFile` the same way.
- Every job outcome (ok / failed+reason / warning count / duration) written
  before moving to the next — a crash mid-batch leaves a truthful partial
  results file.

## Error handling — referee rules

- Downgrade request: refused in the UI, per row, with the reason.
- Unopenable/corrupt file: that row fails with the exception text.
- Launched Revit dies: poller timeout names exactly which jobs completed.
- Stale queue (>1 h): ignored + logged; cannot ambush an unrelated Revit
  start.
- Nothing silent: every row ends in a visible state.

## Testing

- `tools/rvtinfo-check`: version parse on synthesized OLE fixtures +
  garbage-input never-throws.
- Pure queue-contract parse/serialize test (net check tool or vitest-side
  N/A — C# check tool).
- Live protocol drill (Session A extension): mixed-version batch → newest
  installed version; one deliberate downgrade row → refusal; one corrupt
  file → row-level failure; verify report matches disk outcomes.

## Out of scope (named to stay honest)

Downgrading (future "Version Bridge" via governed IFC rebuild + loss
manifest); cloud upgrading; workshared central re-hosting (output is always
detached); in-place upgrades.
