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

## Re-check after the fixes (2026-11-18, same model, add-in redeployed)

| # | Finding | Fix | Result on screen | Screenshot |
|---|---|---|---|---|
| 9 | F-UX1-1 pane jargon | Journey box under a collapsed "Details" (light chip header, so it reads on Revit's dark theme; the Doctor header got the same chip, it was black on black too). `tools/pane-layout-check` lays the pane out with Details open and asserts it starts collapsed: 350/350 | ✅ only "Details", the Next step card and the score show | `ux-slice1/09-pane-details-collapsed.jpg` |
| 10 | F-UX1-2 IFC readiness noise | Monitor rows ("default category mapping will be used") are notes: counted under Details, not in the group | ✅ IFC readiness 278 (elements that would export as IfcBuildingElementProxy); total 1159 instead of 5065 | `ux-slice1/10-check-ifc-readiness-278.jpg` |
| 11 | F-UX1-3 waiting lag | Fix sets the pane's waiting count when it opens | ✅ pane reads "401 change(s) waiting" right after Fix all | `ux-slice1/11-pane-401-waiting.jpg` |

F-UX1-4 and F-UX1-5 stay open (engine suggester; per-row tick before filing). Revit closed without saving each time; the drill copy is unchanged on disk.

## F-UX1-4 and F-UX1-5 (2026-11-18, branch fix/ux1-suggester-tick)

| # | Finding | Fix | Result on screen | Screenshot |
|---|---|---|---|---|
| 12 | F-UX1-4 guessed tokens | Fix all builds names strictly (`NameSynth.BuildStrictName`): a token missing from the name comes from the rule's `token_infer` read off the element (parameter, category, or for a view its view type) or from a fixed literal value; a choice, level or number is never guessed, and the name must pass the rule. The pane's ⚡ Fix keeps its editable pre-filled guess. `tools/naming-check` 93/93 (6 new) | ✅ Naming 639: 19 can be fixed for you (only the fixed `AST_` office prefix added), 620 need a name from you; no schedule proposed as PLAN | `ux-slice1/12-check-19-fixable.jpg` |
| 13 | F-UX1-5 no per-row choice | Fix all opens "Fix names": every proposed rename listed, nothing ticked, Tick all / Clear, "Propose ticked (n)" | ✅ ticked 1 row, "1 proposed change(s) ready to approve", Fix shows 1 waiting; approved, Revit Undo, Check shows 639 / 19 again | `ux-slice1/13-fix-names-tick-list.jpg`, `ux-slice1/14-after-undo-19-fixable.jpg` |

Seen in this re-check and fixed after it: the disabled "Propose ticked (0)" button read blank (white text on the disabled grey); it now uses the default colours, bold. Built 2021–2027, deployed to 2025; not re-driven on screen after that one-line colour change. Revit closed without saving.
