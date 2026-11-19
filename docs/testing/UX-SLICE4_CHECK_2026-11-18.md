# UX slice 4 — words in Revit: check log (2026-11-18)

Branch `feature/ux-revit-words`. Rules: `docs/ux/revit-words.md` (with `docs/ux/web-words.md`). Old → new:
`docs/ux/revit-words-changes.csv` (1,636 unique rows: C#, windows, help). Strings that keep an internal word on purpose
are listed with the web's in `WebApp/src/ux-words-left.json`, guarded by `WebApp/src/ux-words.test.ts` (it now scans
`SentinelAddin` too).

Built for Revit 2021, 2025 and 2027 (0 errors). Every `tools/*-check` passes except `project-context-check`'s one failure
("every model client is built with this PC's opt-in", Commands.GhostBuilder.cs / Commands.Massing.cs), which fails
on master too. Help rebuilt with `py tools/help/build.py` (47 pages).

Live check: Revit 2025, the branch build deployed, model `Documents\Sentinel drills\snowdon\SNW_ARC_ZZ_XX_M3_A_0001.rvt`
(scratch copy, not modified). The unsigned add-in prompt was answered "Load Once" (no trust setting changed).

| # | Where | Expected | Seen |
|---|---|---|---|
| 0 | Sentinel pane | plain next step and status | ✅ "Next step: Check — 881 thing(s) to fix · Connected · Signed in · no changes waiting" ([0](ux-slice4/0-pane-next-step.jpg)) |
| 1 | Sentinel tab | the 7 buttons | ✅ Sentinel, Check, Fix, Issues, Publish, Build, More ([1](ux-slice4/1-ribbon-7-buttons.jpg)) |
| 2 | Issues ▾ | "Issues list" | ✅ Issues list, Clash Manager, Clash Register ([2](ux-slice4/2-issues-menu.jpg)) |
| 3 | Slide-out ▸ Publish tools | "Publish model", "Pre-publish check" | ✅ Publish model, Pre-publish check, Publish Sheets, Publish Views ([3](ux-slice4/3-publish-tools.jpg)) |
| 4 | Slide-out ▸ Checks | "Project standards" | ✅ Scan Now, Health Scorecard, Project standards, IFC Pre-Flight, MEP Type Check, Naming Manager ([4](ux-slice4/4-checks-menu.jpg)) |
| 5 | Project standards window | plain heading, codes in Details | ❌ first run: heading was `ruleset@1 · project · 9fbf771aea3b…` ([5](ux-slice4/5-project-standards-before-fix.jpg)) → fixed (`UI/RulesetWindow.xaml(.cs)`), redeployed: ✅ "Project standards", "… — 9 rule(s)", Details holding `ruleset@1 · project · 9fbf771aea3b… · ast-std-001 v1.0.0` ([6](ux-slice4/6-project-standards-after-fix.jpg)) |

Not seen live: TaskDialog Details on errors (no error raised), the help pages in Revit's F1 viewer (rebuilt and
checked by build.py). Revit 2025 on this PC runs the branch build until master is redeployed.
