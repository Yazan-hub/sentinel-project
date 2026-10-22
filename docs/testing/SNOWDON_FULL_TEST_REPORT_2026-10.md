# Snowdon Towers full test: report for the founder (2026-10-22)

Written while you slept. Row by row evidence is in `SIMULATION_ROOM_RUN_2026-09-22.md`, "Session SNOWDON". The plan is `SNOWDON_FULL_TEST_PLAN_2026-10.md`.

## What was tested

- The sample: Autodesk's Snowdon Towers (Revit 2025.4), the architectural model (98 MB, 55 sheets, 297 views) plus six sister models, and 46 DWG sheets. Scratch copies only, in `Documents\Sentinel drills\snowdon`. Your originals on the Desktop were not touched.
- A brand-new office (`snowdon-office`) and project (`snowdon-towers`), created the way an outside office would, from the web forms, with no JSON.
- Seats: the local web app on :4000 in Chrome, signed in as you; Revit 2025.4 with the add-in; bridge 4100 on master (530243e2); Ollama for the local AI; the Sentinel MCP server (17 tools).
- Run from about 02:00 to 04:15 local time. You were asleep from about 02:30, so every row that needs a password, a download or the Funnel refresh was left for you.
- Scope note: Snowdon ships with no EIR, BEP, MIDP, programme, photos or point cloud. Rows that needed them used a short synthetic input and say so.

## Headline

71 rows in the plan. Counted from the table:

- 51 passed (a few of these are partial passes; the log says what was not driven).
- 1 failed: B16, Ghost Builder on a blank template.
- 4 not applicable: B17 Annotate Views, B18 Promote (DD), B20 Photo Massing, B26 MEP Type Check. Three of these are honest refusals, one has no input.
- 15 not run: B6, B19, B21, B24, B30, B32, B34, C5, C10, C14, C15, D4, E2, E3, E4.

By section: A 11 pass. B 22 pass, 1 fail, 4 N/A, 7 not run. C 12 pass, 4 not run. D 5 pass, 1 not run. E 1 pass, 3 not run.

Sixteen findings, F-SNW-1 to F-SNW-16 (the log has no number 8 or 11). Two are real bugs in the product (F-SNW-5 and F-SNW-9), one is a bug an outside office meets in its first minute (F-SNW-1), and three need your decision (F-SNW-12, 13, 14).

## What worked end to end

The governed path held from set-up to revert:

1. **Set-up.** Office and project created from the hub form; members added (owner, lead, viewer); the base pack installed on the office (ruleset@1, `cc944310e731…`); naming, contract, LOD matrix and AI policy saved from web forms (naming@1 `4161cc4c0429…`, contract@1 `9c21d0cc6dfa…`, lod_matrix@1 `088d7279d2bc…`, ai_policy@1 on the ledger as #3285). Journey went 0 of 9, then 1, then 2.
2. **Standards.** "Generate IDS from standards" said in words that nothing could be checked by an IDS and why, then installed (ids@1 `fcb3140696a7…`). The EIR compiled to ids@2 (`3d6e499d2c31…`): 3 of 5 sentences read, 2 refused with reasons, nothing lost.
3. **Revit.** PC Settings tests were all green. Project Setup bound the model to snowdon-towers. Scan, Health Scorecard and Rule Set agreed with what was installed. Naming Manager renamed 2 items (ledger #3292). Heal ran on 222 families (ledger #3293). Protection, Modelling Guideline and IFC Export Mapping saved from their windows. IFC Delivery Gate passed the contract (ledger #3297).
4. **Publish.** The ARC model was accepted as v1 · wip: gate row #3304, verdict #3305, version ledger #3309, geometry linked #3310, snapshot of 4841 elements #3311, about 50 seconds after the dialog. The STR model was accepted too (#3454, #3455, #3459). The verdict matched the MIDP row (midp.planned true).
5. **Web.** Project Files, Open 3D (ARC in 2.3 s, STR in 1.1 s), Browser (26 categories, 6,388 elements), Federation Gate (FAIL on FG-02 and FG-04, raise locked, as it should be), Clash (4335 clashes in 275 groups), RFI-001 raised, answered and closed, CDE board WIP to Shared to Published, Holding Area dismissal (#3425), Deleted items.
6. **Lifecycle.** Cost 5D SAR 14,082,334 (1,745 elements, 9 lines), Carbon 6D 3,465.3 tCO2e, 4D sequence of 6 trades over 2,642 elements, COBie 0 of 807 assets complete, a tender issued from the model BoQ, owner register of 807 assets.
7. **Issues and fix-in-place.** The three IDS issues from the rejected run (#3301 to #3303) were assigned and commented from Revit's native Issues window ("Comment posted on #3"). Fix in Revit set FireRating 60 on 6 door types: check #3432, written #3433 (6 values), re-check #3434 "15/15 pass", issue Resolved #3436. Closing stays a human decision on the web.
8. **AI proposals and revert.** Two MCP-proposed changesets reached Review AI Proposals with risk tiers. The wall went through the DD IDS dialog ("Place anyway") and was reverted in one Undo step with a reason.
9. **MCP.** All 17 tools answered; names came back masked (PROJECT_7RDECNYD), so the AI privacy policy works over MCP.

## What failed or needs a decision

**F-SNW-1 (bug, small; first minute).** The first "Save changes" on a new project is refused as if a colleague changed it. Cause: creating the project and the Dashboard's first read both write; a hidden unversioned seed bumps the version to 2, so the panel's version 1 trips the 412 guard. The fix (seed the metadata in the INSERT) was merged to master as b34baedd and pushed (secret scan clean; the 4100 bridge was not restarted, so it is live after the next restart + Funnel refresh). F-SNW-1b: after the refusal, the refresh button and tab switches do not reload the panel, only a browser reload does, and that loses the edits.

**F-SNW-2 (usability, small).** Paste schedule: Preview accepts stage "DD", only Import refuses it, and the hint never lists the allowed stages (tender, design, coord, constr, hand, oper).

**F-SNW-3 (judgement call).** The first Heal on a real model rewrote and reloaded all 222 families with no preview and no "N families will be changed, continue?". As designed, but an outside office would want a dry run first.

**F-SNW-4 (words).** A fresh project's CDE tab shows "PLATFORM DELIVERIES 47 IFC" and Aster Tower cards because it is not linked to a platform project. Confusing for an outside office.

**F-SNW-5 (bug).** Cost 5D and Carbon 6D show every geometry-measured quantity as negative (Slabs -4,034.6 m3, Walls -11,093.4 m2) while the amounts are positive. The signed volume from this IFC's winding is shown signed in Qty and unsigned in the amount. The totals are right; the Qty column is wrong.

**F-SNW-6 and F-SNW-7 (usability, wrong-by-design).** Publish Sheets shows only "Exporting ... Sheet: G000 - Cover" for the whole 20 minutes, with no progress or estimate, and Cancel did nothing. And sheet PDFs are named by sheet number (A100.pdf), so all 55 were refused by the 7-field container rule. Sentinel should compose the ISO container name for sheets, or say up front that they will be held.

**F-SNW-9 (bug, add-in).** Ghost Builder's walls were rolled back by Revit's "Can't keep elements joined" (A-WALL #35, #36, #37). The build's failure handler does not resolve it, so nothing is built. F-SNW-9b: the A102 DWG import stayed in the L1 view afterwards. This is the one failed row (B16).

**F-SNW-10a and 10b (form gaps).** The Revit guideline editor has no views list, so a guideline made on screen can never feed Annotate Views. The web LOD-matrix form lets you save a wall DD that Promote v1 cannot check, without saying so.

**F-SNW-12 (design, needs your decision).** The delivery contract is one per project. The HVAC model was rejected (ledger #3445, #3446) because the contract written for the architectural model requires walls and caps proxies at 25 %: 0 IFCWALL, 37 of 37 elements are proxies. A multi-discipline project needs a contract per discipline or role. The 37 proxies are also Revit's IFC2x3 export of HVAC families with no Export-As mapping.

**F-SNW-13 (design, needs your decision).** protection@1 protects grids, yet an AI changeset that creates a new grid applies. Then Revert refuses to take that grid back ("Grids are protected by protection@1"). The asymmetry is the real bug: either refuse the create, or allow the revert.

**F-SNW-14 (design, needs your decision).** You alone took a container from WIP to Shared to Published, with no second-person review. With no review standard installed there is no gate. ISO 19650 expects check, review and authorise before Published; the default should at least say so.

**F-SNW-15 (minor).** The platform deliveries card hit "Rate limit exceeded: max 100 requests per 60s" after a few minutes on the CDE tab. The panel polls too often.

**F-SNW-16 (check).** The Deliverables tab still shows all 7 rows "pending", including the published ARC model whose verdict said midp.planned true. Either it needs a refresh or delivery is not matched to the row. Not resolved this run.

Also seen: the same account raised, answered and approved its own RFI; IFC Pre-Flight flags 4184 of 4184 elements yet reads 93.4 % readiness; Project Files and Views do not refresh themselves after a publish; Ask Sentinel answered the scan question, not the open-issues one.

## Honest refusals that are right

These are not bugs; the product said no, in words:

- **Naming reject (E1, B27 run 1).** "REJECTED - model name does not follow the ISO 19650 convention (not published) ... expected 7 '_'-separated fields, got 1". Nothing uploaded, held on the web (#3300), and 3 issues opened on the failing elements.
- **MEP contract (HVAC).** Refused for the contract's rules, with the counts. Right behaviour, wrong contract design (F-SNW-12).
- **Generate IDS from standards.** "Nothing in these standards can be checked by an IDS" plus five reasons.
- **Naming Manager on the base pack.** Refused until a ruleset with a naming rule is installed.
- **Annotate Views.** "No views section. Nothing to plan."
- **Promote (DD).** "Nothing to promote in this model", with the exact rule it checks.
- **MEP Type Check.** "No type catalogue installed ... nothing was sent."
- **Check revert on the grid.** Refused with the protection policy named.
- **MCP changesets.** Grid move, reshape and delete refused at the schema, with the allowed operations listed.
- **Federation Gate.** FAIL locks "Raise", as designed.
- **Ghost Builder.** Said exactly why each layer could not be placed (types not loaded, floors not closed polylines, no family library).

## Timings

- IFC export of the ARC model: about 4 to 5 minutes (B12 about 4 min; Governed Publish export plus gate about 5 min).
- Publish: dialog to snapshot ingested about 50 seconds after the dialog.
- Heal Loaded Families: about 6 minutes (222 families).
- Publish Sheets: about 20 minutes for 55 sheets (images and PDFs).
- Viewer load: ARC 2.3 s (download 1.0 s, 9.7 MB; open 1.3 s); STR 1.1 s.
- Scan: 55 elements in 8 to 9 ms on the base pack, 952 elements in 195 ms on the Aster standard. IFC Pre-Flight 4184 elements in 190 ms.
- Clash Manager: 4075 clashes (368 hard, 2459 medium, 1248 soft). Web clash: 4335 clashes on 6,836 elements.
- Performance readout (10.5 s, p50 1003.9 ms) is NOT valid: Chrome was behind Revit and throttled. Re-measure with Chrome in front.
- Revit 2025 opened the 98 MB model in about 90 seconds.

## What an outside office would hit first

1. **F-SNW-1.** Their first Save changes on a new project is refused, and the refresh button does not help.
2. **The SN-01 sheet rule against Autodesk numbering.** The base pack scored 0.0 % (F) with 55 REQUEST issues, one per sheet (A101-style numbers). The office must edit SN-01 or the sheets.
3. **One contract per project.** A second discipline's model (HVAC) is rejected by a contract written for the first (F-SNW-12).
4. **Ghost Builder on a blank template.** Layer types not loaded, no family library, and the join error rolls the whole build back (F-SNW-9, B16).
5. **Sheet names against the container rule.** All 55 sheet PDFs were held, 55 naming holds (F-SNW-7).
6. **Deliverables still pending** after a published model (F-SNW-16), and a CDE tab full of Aster platform cards (F-SNW-4).

## Owed / not run

Yours (password, download or Funnel):

- B34 sign out and publish refused; C14 viewer account; C7 second-account review; the Sign in dialog itself (A9 passed on the PC's existing sign-in).
- Downloads, per item: audit pack and verifier (C12), BCF 2.1 / 3.0 export and import back (C5).
- Funnel refresh, then C15 (published app).
- Decisions on F-SNW-12, F-SNW-13, F-SNW-14 (and F-SNW-3, the RFI two-person rule).
- Re-measure Performance with Chrome in front; re-run Publish Sheets after the sheet naming is settled; re-check Deliverables (F-SNW-16) after a refresh.
- Restart the 4100 bridge (then refresh the Funnel) so the F-SNW-1 fix (b34baedd) is live.

Not run, for reasons in the log: B6 Sanitize .rfa (the file dialog guard), B19 Provenance (no Sentinel-made element survived), B21 Change Requests round trip, B24 Clash Register, B27 for PLB / ELE / FAC / SITE, B30 Auto-publish (no publish standard installed), B32 Ingest Docs, D4 lock refusal, E2 bridge stopped mid-action, E3 Ollama stopped, E4 two seats. Not driven inside rows that passed: "applied-then-saved" (B15), the B22 assignee check, Pair only / Mark not a clash / Propose deleting copies (drilled 2026-10-21), Build ticked items (B31), Restore from Deleted items (C13).
