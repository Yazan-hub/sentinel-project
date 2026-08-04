# Final-review fixes — Upgrade Ladder (feature/upgrade-ladder)

## FINDING 1 (MEDIUM, fixed) — target could equal current version, default was self-kill
- `SentinelAddin/UI/UpgradeWindow.cs`: target ComboBox now only lists installed versions strictly
  greater than `currentVersion` (parsed numerically), sorted ascending, default-selected to the
  lowest newer version. If none exist, header text switches to "No newer Revit installed — nothing
  to upgrade to." and the dropdown is disabled; Run stays disabled since no target is selected.
  Per-row "already this version" logic (saved version == chosen target) is unchanged — only the
  dropdown population changed.
- `SentinelAddin/Commands.Upgrade.cs`: belt-and-suspenders guard right before `SaveQueue` — if
  `target == currentVersion`, abort with a TaskDialog and `Result.Cancelled`.

## FINDING 3 (LOW, fixed) — requester polled 10 min even if target Revit died immediately
- `Process.Start` result is now captured and passed into `UpgradeProgressWindow(total, proc)`.
- Poll tick checks `proc.HasExited` when results aren't done yet; if so, stops early (`_diedEarly`)
  instead of waiting out the full timeout.
- Final report distinguishes "The target Revit closed before finishing (exit code N)." from the
  ordinary "Timed out after 10 minutes." message, both listing completed vs pending jobs by name.

## FINDING 2 (LOW, not fixed — by design)
- `SentinelAddin/Engine/UpgradeQueue.cs`: added a `// ponytail:` comment at `QueuePath` noting the
  single global queue file is a known ceiling (one upgrade batch at a time); per-request queue
  files are the upgrade path if concurrent upgrades ever matter. No behavior change.

## Verification
- `dotnet build SentinelAddin -p:RevitVersion=2026 -p:DeployToRevit=false` — Build succeeded, 0 errors.
- `dotnet build SentinelAddin -p:RevitVersion=2024 -p:DeployToRevit=false` — Build succeeded, 0 errors.
- `dotnet run --project tools/rvtinfo-check` — RVTINFO OK (all checks PASS).
