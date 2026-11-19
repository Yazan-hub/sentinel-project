# UX slice 7 - Build as one guided flow: check log (2026-11-19)

Branch `feature/ux-build-flow`, deployed to Revit 2025, model `Documents\Sentinel drills\snowdon\SNW_ARC_ZZ_XX_M3_A_0001.rvt`
(scratch copy, not modified: the one tool opened was cancelled).

| # | Where | Expected | Seen |
|---|---|---|---|
| 1 | Sentinel tab | Build is one button (no menu) | OK ([1](ux-slice7/1-ribbon-build-button.jpg)) |
| 2 | Build window | 5 steps in order + Provenance, each with its state and a button | OK: Levels and grids "Done: 18 level(s) and 28 grid(s)"; Model from drawings "Done: 1152 wall(s)"; Massing "Not yet: no mass"; Annotate views "0 of 18 level(s) and 0 of 28 grid(s) pinned"; Promote "Not checked here" ([2](ux-slice7/2-build-window.jpg)) |
| 3 | Levels and grids button | runs the existing Datum from Drawings | OK: "Datum: choose ONE drawing" opened with the DWG list; cancelled ([3](ux-slice7/3-levels-and-grids-runs-datum.jpg)) |
| 4 | Panel slide-out | the old tools reachable | OK: Checks, Changes, Build tools, Publish tools ([4](ux-slice7/4-slide-out-build-tools.jpg)) |

Findings (small, not fixed):
- F-UX7-1: the Datum picker still shows a code in its text: "no datum section in layers@1 - office - 1572b13640ef..." (a slice 4 miss).
- F-UX7-2: step 1 says "Needs: an imported drawing. None is imported or linked", yet the tool offers the DWG files of the project folder; the line reads as a blocker when it is not.

Not seen: the F1 page, the other step buttons, a model with masses or a drawing imported.
