# Drill UX-1: modeller journey Check → Fix → Undo → Publish (2026-11-18)

Branch `feature/ux-revit-journey` (93abcd35 + b4f1f526), add-in built for Revit 2025 and deployed from the worktree.
Model: `Documents\Sentinel drills\snowdon\SNW_ARC_ZZ_XX_M3_A_0001.rvt` (scratch copy, web project `snowdon-towers`), Revit 2025, opened fresh (no Revit was running).
Legend: ✅ run live and passed · ⚠️ passed with a finding.

| # | Step | Result | Screenshot |
|---|---|---|---|
| 1 | Open the model; pane shows the Next step card | ✅ "Next step: Check — 881 thing(s) to fix", "Connected · Signed in · no changes waiting" | `ux-slice1/01-pane-next-step.jpg` |
| 2 | Sentinel tab shows 7 buttons + slide-out arrow | ✅ Sentinel, Check, Fix, Issues, Publish, Build, More | `ux-slice1/02-ribbon-7-buttons.jpg` |
| 3 | Check | ✅ 5065 items in 4 groups: Naming 639 (401 fixable), Required data 242, Families (not checked yet), IFC readiness 4184; Details collapsed | `ux-slice1/03-check-window.jpg` |
| 4 | Naming ▸ Fix all | ✅ "401 proposed change(s) ready to approve", then Fix opens with "401 proposed change(s) waiting" | `ux-slice1/04-fix-window.jpg` |
| 5 | Fix ▸ Name fixes ▸ Approve one (Door Schedule → ARC_L00_PLAN_Door Schedule) | ✅ renamed, 400 pending | `ux-slice1/05-name-fix-approved.jpg` |
| 6 | Undo (Revit Ctrl+Z), then Check again | ✅ "Door Schedule" is back on the naming list, 639 names as before | `ux-slice1/06-after-undo-recheck.jpg` |
| 7 | Go to Publish | ✅ pre-publish check in plain words, Open Check / Publish now | `ux-slice1/07-pre-publish-check.jpg` |
| 8 | Publish now | ✅ export steps in plain words; result "Published — The model passed the pre-publish check and is uploading"; Details: accepted, `SNW_ARC_ZZ_XX_M3_A_0001.ifc` v2 wip, ledger #4230/#4231/#4234 | `ux-slice1/08-published-details.jpg` |

Side effects: snowdon-towers got ARC version v2 (WIP). The drill copy holds 400 pending name proposals, unsaved (Revit left open, nothing saved).

## Findings

- **F-UX1-1 (medium):** the pane's Journey box above the new card still shows internal words (ledger, changeset, ruleset@1, sha). Collapsing it under Details breaks `tools/pane-layout-check` (it expects those lines visible), so it needs that check updated together.
- **F-UX1-2 (medium):** IFC readiness counts 4184, mostly "no explicit IFC mapping — default category mapping will be used". That is advice, not a fault; the count drowns the real items. Split it out or count it as a note.
- **F-UX1-3 (low):** the pane's "changes waiting" figure refreshes only on the next check (it read "no changes waiting" while Fix said 401).
- **F-UX1-4 (low, engine):** the name suggester proposes `ARC_L00_PLAN_Door Schedule` for a schedule (type token PLAN). Existing ⚡ Fix behaviour, not new in this slice.
- **F-UX1-5 (low):** "Fix all" files every fixable name at once (401 here). A per-row tick before filing would suit a first-time user better.
