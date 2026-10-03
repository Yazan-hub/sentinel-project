# Sentinel Revit add-in: tool audit and enhancement plan

Date: 2026-09-29.

Scope: the Sentinel ribbon tab (29 commands on 4 panels, `SentinelAddin/App.cs:253-341`), the background machinery behind the dockable pane, and the add-in shell (install, versions, threading, identity).

Method: a read-only audit of the code. Each finding was checked a second time against the file and against the run records. Nothing was built or run in Revit for this audit.

---

## 0. How to read this

**Status labels.** This document never raises a status. Where two sources disagreed, the lower status was kept.

| Label | Meaning |
|---|---|
| LIVE-PROVEN | A run record exists. The session or drill id is given. |
| PARTIAL | Part of the tool ran live and part did not. The split is named. |
| BUILT-NOT-PROVEN | The code exists, but there is no run record. |
| BROKEN | Seen failing in a live run. |
| UNKNOWN | No record either way. |

**Evidence.** Every weakness carries one of three kinds of evidence: a `file:line`, a session or drill id, or a memory note name. File paths are under `SentinelAddin/` unless another folder is named.

- `SIM run:N` = `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`, line N. Sessions B1–B30 and findings F1–F55 are recorded in that file.
- `Session C` = `docs/reviews/session-c-2026-07-28-golden-nugget.md`.
- `Snowdon` = `docs/reviews/external-test-2026-07-26-snowdon.md`.
- `memory <name>` = the founder's project memory note with that name.
- `blueprint:N` = `docs/strategy/2026-09-29-sentinel-blueprint.md`, line N. P1-x, P2-x, R-0x, MH-*, E5, E6 and U-n are ids defined in the blueprint.
- H3, H4 and H5 are the hardening items listed in memory sentinel-2026-09-29-owed.

**Competitors.** Every competitor claim has a URL. A claim without a URL was left out.

**Enhancements.** Each enhancement has an id, a size, a value, the Revit API it uses and a proof. The proof is what a live drill must show before the row can be called LIVE-PROVEN.
- Size: **S** = under 1 day, **M** = 1–3 days, **L** = more than 3 days.
- Value: high, med or low, judged for a BIM manager or a modeller.
- When an API is not available in Revit 2021, the enhancement says so.

**Blueprint Phase 1 is not proposed again here.** These items are already planned. Where a tool overlaps one of them, this document gives the id:
- P1-1: health@n
- P1-2: warning catalogue
- P1-3: RWSI/MHI
- P1-4: MH-* checks
- P1-5: pane block
- P1-6: health runs
- P1-7: cleanup recipes R-01..R-08
- P1-8: Validate ▸ Model Health pulldown
- P1-9: ledger rows for auto-fix, fix-in-place and Doctor
- P1-10: office.model_health reads
- P1-11: exporter pset mapping

**One hard limit.** Only Revit 2024 has run live (memory sentinel-2026-09-16-state). In this document, LIVE-PROVEN always means "proven on Revit 2024".

---

## 1. The add-in today

| Panel | Tool | What it does | Status + evidence | Top weakness |
|---|---|---|---|---|
| Coordinate | Show Panel | Opens the dockable pane: score, rule rows, Next strip, Doctor log. | LIVE-PROVEN: rows on open (SIM run:34), Next strip (SIM run:249), Doctor lines (B10). ↻ UNKNOWN (memory sentinel-2026-09-25-revit-standards). Live DMU rows and row ⚡ Fix BUILT-NOT-PROVEN. | The score is not recomputed after live changes or ⚡ Fix, so the header and the grid disagree (UI/SentinelPanelViewModel.cs:80-89). |
| Coordinate | Background: live updater, Revit Doctor, ⚡ Fix, event hub | Re-checks changed views, sheets, levels and grids live. Auto-resolves 3 warning types. Renames one element from the pane. | BUILT-NOT-PROVEN (blueprint:390, SIM run:499). The event hub is LIVE-PROVEN by use (B17, SIM run:54). | The ⚡ Fix dialog never expands {org}, so on aster rulesets it refuses a correct name (UI/FixReviewDialog.xaml.cs:46-54). |
| Coordinate | Change Requests | Lists pending REQUEST-mode changes. Approve keeps a change; Reject reverts it. | BUILT-NOT-PROVEN. The window opened with 0 pending (SIM run:38). The approve/reject drill is owed (blueprint:1157). | The card disappears before the revert runs, so a failed revert still looks done (UI/RequestsWindow.xaml.cs:69-88). |
| Coordinate | BCF Issues | Live list of the project's BCF topics: zoom, raise an issue from the selection, and the Fix in Revit loop. | LIVE-PROVEN for list, zoom, Fix and raise (SIM run:54, :681-682). Isolate-all and Issues-for-selection UNKNOWN. | The bearer token is read once, when the window opens (Commands.BcfIssues.cs:90-93). A window left open past token expiry should fail; not yet seen live. |
| Coordinate | Clash ▸ Clash Manager | Grades linked MEP against host structure as Hard, Medium or Soft. Makes a 3D view and a local BCF. | BUILT-NOT-PROVEN (SIM run:55, :185; blueprint:77). | Rotated links get wrong bounding boxes, because only the Min and Max corners are transformed (Engine/ClashManager.cs:160-168). |
| Coordinate | Clash ▸ Clash Register | Read-only TaskDialog of the web clash register, top 12 by volume. | BUILT-NOT-PROVEN (SIM run:55). | No zoom-to-clash and no status change, although the bridge supports both (GovernedQuery.cs:268-273; bcf-service.mjs:1887-1893). |
| Coordinate | Review Flag | One-time setup of the ZZZ_ReviewStatus shared parameter. | LIVE-PROVEN for creating the parameter (SIM run:39). Flag writes BUILT-NOT-PROVEN. | A new GUID is made on each machine from a %TEMP% file (Commands.Workflow.cs:84-100). |
| Coordinate | Review AI Proposals | Reviews AI changesets element by element and places the ticked ones in one transaction. | LIVE-PROVEN (memory bim-documents-roadmap 2026-08-07; SIM run:61). | Places the elements into whichever model is active when the event fires (GhostBuilder/ChangesetPlacementEvent.cs:31-37). |
| Validate | Scan Now | Reloads ruleset@n and runs a full rule scan into the pane. | LIVE-PROVEN (B5, SIM run:256-293; Session C). | Parameter rules can only target views, and non-text parameters always read as empty (Engine/RuleEngineHost.cs:193-204, :216-221). |
| Validate | Health Scorecard | Shows a weighted 0–100 score with an A–F grade in a TaskDialog. | LIVE-PROVEN (SIM run:36; Session C). | The score saturates at 0.0% F, so fixing violations does not move it (HealthScorecard.cs:66-70; Session C). |
| Validate | Rule Set | Read-only window listing the rules, with their source and sha. | LIVE-PROVEN (SIM run:37). | Shows token names only, not what each token accepts (UI/RulesetWindow.xaml.cs:27-29). |
| Validate | IFC Gate ▸ IFC Pre-Flight | Flags elements with no explicit IFC class, and one empty parameter. | PARTIAL. IFC-01 ran live (SIM run:48; Session C). IFC-02 never exercised (Session C). | IFC-02 checks '{org}_View Status', a view-routing parameter, not a mandatory pset (IfcPreFlightScanner.cs:22, :123-131). |
| Validate | IFC Gate ▸ IFC Delivery Gate | Certifies an IFC against contract@n, then writes a certificate and a ledger row. | PARTIAL. Certify LIVE-PROVEN (B6, B8, B12). Ledger row BROKEN when signed in (B15, SIM run:651). | Returns HTTP 403 for signed-in users, so the ledger has no gate record (WebApp/bridge/cde-store.mjs:1171-1174). |
| Validate | Family Health ▸ Sanitize .rfa | Audits one .rfa and loads it if it passes. | PARTIAL. Only the refusal path ran (Session C). Pass-and-load not run (SIM run:46; blueprint:391). | The solid count ignores nested families, so a rich family reads "Solids: 0" (Workflow/FamilySanitizer.cs:71-79). |
| Validate | Family Health ▸ Heal Loaded Families | Adds '{org}_Description' to every loaded family and reloads it. | LIVE-PROVEN (B8 #792; SIM run:47; Session C). | The parameter is defined in a %TEMP% file with a per-machine GUID (Workflow/FamilyProcessor.cs:99-126). |
| Validate | MEP Openings | Finds linked MEP against structure and places or reconciles void families. | BUILT-NOT-PROVEN (SIM run:56). | With the MEP link unloaded, every tracked void is marked Orphaned in a committed transaction (Engine/MepVoidManager.cs:73-74, :211-219). |
| Validate | Naming Manager | Proposes compliant family and type names from model facts, then renames the ticked rows and writes one ledger row. | LIVE-PROVEN (B8 #793; B16 #1093; SIM run:669-670). | For Family rules, it invents missing enum tokens and marks them Proposed (Workflow/NameSynth.cs:12-16, :44-47). |
| Publish | Governed Publish (+ Auto-Publish, CDE-01) | Exports IFC, runs the gate, asks the referee, then registers a version or opens BCF topics. | PARTIAL. Ran signed out in B10: a reject, a recorded publish, auto v2 and v3. ACCEPTED never seen on the current code (B10). The gate row gets 403 when signed in (B15). CDE-01 not observed. | The export and a referee wait of up to 120 s block Revit, with no progress and no Cancel. Auto-Publish freezes Revit after a save (Commands.GovernedPublish.cs:52-66; B10). |
| Publish | Publish ▸ Publish Sheets | Renders every sheet to PNG and PDF and proposes each PDF to the bridge. | BUILT-NOT-PROVEN (SIM matrix; B27 owed; memory sentinel-2026-09-29-2d-item5). | The container name is the bare sheet number, so naming@n rejects every sheet (Commands.PublishSheets.cs:49; B27 driver). |
| Publish | Publish ▸ Publish Views | Renders the picked views to PNG for the web Views tab. | BUILT-NOT-PROVEN (SIM matrix; B27). | A view that fails to render is dropped without a message (Engine/ViewExporter.cs:141-144). |
| Standards & Build | Standards ▸ Project Setup | Binds the model to a web project key and stores settings in the model. | LIVE-PROVEN (SIM matrix, F23; B10). | Closes before the write runs. A failure goes only to the Doctor log, and the write targets whichever document is active (UI/SettingsDialog.xaml.cs:169-190). |
| Standards & Build | Standards ▸ Sign in | E-mail and password sign-in. Every governed call then carries the person's identity. | LIVE-PROVEN (B15, B16 #1093, B17). | A network blip during token refresh signs the user out for the rest of the session. Calls then fall back to the PC token without warning (Coordination/UserSession.cs:107-111). |
| Standards & Build | Standards ▸ Build Office System | Harvests worksets, shared parameters, templates and types from a "golden" model, then builds them and stages a ruleset. | PARTIAL. Extract, review, snapshot and type export ran live (SIM matrix; B7). Build and ruleset install not run (B5). | Shared-parameter data types collapse to 8 tokens. Any other type is rebuilt as Text under the original GUID (Standards/StandardsCompat.cs:24-48). |
| Standards & Build | Standards ▸ Apply Standard | Builds a saved pack into the active model and installs ruleset@n+1. | BUILT-NOT-PROVEN (SIM matrix; B5; memory sentinel-2026-09-25-revit-standards). | Builds into whichever model is active, not the model named in the window (Standards/StandardsBuilder.cs:29). |
| Standards & Build | Standards ▸ Ingest Docs | Reads standards PDFs and text with a local LLM and proposes worksets, parameters and naming rules. | PARTIAL (SIM matrix: pass with F14/F15; the F15 fix has not been re-run live). | Naming-rule ids are positional, so a second document overwrites the first document's rules (Standards/DocumentExtractor.cs:110-118). |
| Standards & Build | Model from Drawings ▸ 1 · Datum from Drawings | Creates levels and grids from the LEVEL and GRID layers of a DWG. | LIVE-PROVEN (SIM 3.9; F40/F41 re-verified 2026-09-23; Snowdon). | The layer words are hard-coded, not read from layers@n (Commands.Datum.cs:76-79; Snowdon §3). |
| Standards & Build | Model from Drawings ▸ 2 · Ghost Builder | Maps DWG layers to types and places walls, floors, ceilings and families. | PARTIAL. Mapping and review ran live (B7, SIM 3.9, Snowdon). Placement last ran live 2026-07-26, before phase 4b-2 (memory sentinel-2026-07-26-priorities). The B7 build was not run. | Doors and windows are placed unhosted, and the block rotation is lost (ElementPlacementFactory.cs:299-323). |
| Standards & Build | Model from Drawings ▸ 2b · Photo Massing | Turns a vision-model estimate into a rectangular box of walls and floors. | PARTIAL (SIM 3.9 pass after fixes; not run since 4b-2, B7). | Always a rectangle at the internal origin, on the lowest level (MassingPlanner.cs:160-197). |
| Standards & Build | Model from Drawings ▸ 3 · Annotate Views | Creates WIP plan views for each level from guideline@n. | PARTIAL. B7 created 108 views. No run has applied a template (SIM F44). | Creates empty views, not annotation, and the names ignore the project's View rule (App.cs:337-338; ViewPlanner.cs:23-26). |
| Standards & Build | ROI Dashboard | Counts gate runs, renames and heals on the ledger and prices them with roi@n. | LIVE-PROVEN (B11). | Prices every gate row, including the automatic reruns on each save (Engine/RoiReport.cs:31-36). |
| (all) | Add-in shell | Ribbon, document events, the event queue, and build and install for Revit 2021–2027. | PARTIAL. The ribbon ran live on 2024 only (B10). CI builds 2025 and 2026 only (.github/workflows/ci.yml:40-52). | The 2021–2023 and 2027 binaries predate the recent phases. Only 2024 has run (bin/Release dates; ci.yml:44-46). |

**Totals** (31 rows):
- 13 tools are LIVE-PROVEN, fully or in their main part (3 of them have sub-parts that are not).
- 10 are PARTIAL.
- 8 are BUILT-NOT-PROVEN.
- 1 BROKEN path: the gate ledger row for signed-in users (B15).

---

## 2. What competitors do better

| Job | What competitors do (source) | Sentinel today (evidence) | Where Sentinel is already ahead (evidence) |
|---|---|---|---|
| Issues (BCF) | BIMcollab BCF Manager for Revit: a new issue takes the active view as a snapshot, stores visible, hidden or selected components, lets you annotate the snapshot, set Resolved or Closed, and comment from Revit ([source](https://helpcenter.bimcollab.com/en/articles/344346-create-and-edit-issues-in-revit)). It also has a filterable list, double-click zoom and an offline BCF-file workflow ([source](https://helpcenter.bimcollab.com/en/articles/342215-get-started-with-bcf-manager-revit)). Autodesk Issues add-in: creates ACC issues on 3D views and shows pushpins on drafting views ([source](https://up1.autodesk.com/prd/2024/RVT/2D97A5A4-B152-5A41-98CD-B618AC6E8763/RIA_7.0.2_ReleaseNotes_Revit2024.htm)). Newforma Konekt: can force a section box and an orthographic view ([source](https://konekt.help.newforma.com/360002819171-add-ins/360008492631-revit/360057740071-retrieving-newforma-konekt-perspective-view-issues-in-revit/)). | No snapshot and no section box. Orthographic views are sent as a 60° perspective (Coordination/IssueDraft.cs:58-62; BcfModels.cs:48-53). The list shows only "[Status] Title". Status and plain comments cannot be changed from Revit (UI/BcfIssuesWindow.cs:44, :60-76). | Fix in Revit: dry-run with the referee, apply, re-check, post evidence, and set Resolved only when every GUID passes. Live result 42/42 → Resolved (SIM run:54; memory sentinel-2026-09-16-state). Issues raised from Revit carry the verified e-mail (B17). The cited competitor pages do not describe a verified fix loop. |
| Clash | Revit Interference Check: works with linked models, with Show, HTML export and Show Last Report ([source](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-Collaborate/files/GUID-890A9FE0-EFF4-4CFB-9E81-B0DE1A132BEC.htm)). BIMcollab Zoom: size and volume tolerances ([source](https://helpcenter.bimcollab.com/en/articles/340826-setting-tolerances-for-clash-detection)), and Smart Issues that track status and avoid duplicates across versions ([source](https://www.bimcollab.com/en/products/bimcollab-zoom/clash-management/)). Revizto: Navisworks clash groups become tracked issues with status sync ([source](https://help.revizto.com/hc/en-us/articles/4414942889359-Syncing-Navisworks-clashes-with-Revizto)). Navisworks SwitchBack: selects and zooms to the item in Revit ([source](https://help.autodesk.com/cloudhelp/2022/ENU/Navisworks/files/GUID-2877F4F4-3B6B-4A2A-887B-35761E79AA46.htm)). Kiwi Codes Clash Importer: turns clash XML into points and views ([source](http://revitaddons.blogspot.com/2016/04/kiwi-codes-bonus-tools-expands-to-87.html)). | Revit Clash Manager and Clash Register have never run (SIM run:55). Rotated-link bug (Engine/ClashManager.cs:160-168). No tolerance setting. The output is one local .bcfzip (UI/ClashManagerDialog.xaml.cs:53-90). | The web exact clash is LIVE-PROVEN (B18; memory sentinel-2026-09-28-3d-clash) and sits behind the Federation Gate lock (blueprint E6). This is on the web only. |
| Warnings and model health | Ideate Explorer: the warnings view stays open while you work, sorts by type or by element, and double-click zooms ([source](https://graitec.com/Help/Ideate_Software/EN/review-warnings.htm)). A BIM team can set and deploy warning standards ([source](https://graitec.com/Help/Ideate_Software/EN/set-up-warning-standards.htm)), with help topics for common, calculated and geometric warnings ([source](https://graitec.com/Help/Ideate_Software/EN/how-to-resolve-revit-warnings-with-ideate-explorer.htm)). Kiwi Codes: "Show warnings" with a Clear button ([source](https://apps.autodesk.com/RVT/en/Detail/HelpDoc?appId=2077603980990329161&appLang=en&os=Win64)). Autodesk Model Checker: checksets, a report, zoom and select from the results, Automation, and a Power BI template ([source](https://interoperability.autodesk.com/modelchecker.php)). Ideate Automation: Power BI templates, including warnings over time ([source](https://ideatesoftware.com/ideate-automation-understand-revit-model-health-using-microsoft-power-bi)). | No warnings view in Revit. Revit Doctor silently resolves 3 warning types and is BUILT-NOT-PROVEN (blueprint:390). The Scorecard saturates at 0.0% F (Session C). Already planned: P1-1..P1-5, R-08. | Every scan names the exact ruleset@n · source · sha that judged it. When the bridge is down it falls back to a labelled cache (B5, SIM run:256-293). |
| Families | Ideate Explorer family auditing: CAD imports, deep nesting, line styles, complex or hidden geometry, and category ([source](https://graitec.com/Help/Ideate_Software/EN/family-auditing.htm)). Naviate: re-saves families on disk to the current version ([source](https://www.naviate.com/naviate-for-revit/naviate-accelerate/features/)). CTC Family Processor: batch-adds or replaces shared parameters from a named SP file, with instance/type and group set per parameter ([source](https://help.ctcsoftware.com/BIM/2021/familyprocessor)). DiRoots ParaManager: transfers parameters to many families without opening them ([source](https://diroots.com/revit-plugins/manage-revit-parameters-in-projects-and-families-with-paramanager/)). | One .rfa at a time. The solid count ignores nested families (Workflow/FamilySanitizer.cs:71-79). Heal makes up a per-machine GUID in %TEMP% (Workflow/FamilyProcessor.cs:99-126). | A heal run writes one ledger row (B8, #792). |
| Naming | DiRoots FamilyReviser: find and replace, prefix and suffix, by scope and category ([source](https://docs.dirootsone.diroots.com/docs/pages/FamilyReviser/FR-Edit.html)). Ideate BIMLink: renames through Excel ([source](https://ideatesoftware.com/renaming-revit-families)). A duplicate type name gets a number appended ([source](https://graitec.com/Help/Ideate_Software/EN/known-issues-with-Ideate-BIMLink-for-Revit.htm)). | Family and type rules only. No merge for duplicates (Workflow/NamingManagerService.cs:85; NamingProposer.cs:124-129). | Names are proposed from model facts against the office rule. Duplicates are Blocked rather than numbered. Each batch is one ledger row under the verified e-mail (B16 #1093; SIM run:669-670). |
| Parameters and data | DiRoots ParaManager: creates and edits parameters, imports and exports Excel and SP files, and assigns categories ([source](https://docs.dirootsone.diroots.com/docs/pages/ParaManager/PM-Categories.html)). Cobuilder Require: exports requirements as a Revit SP file with GUIDs ([source](https://cobuilder.com/en/cobuilder-require/revit-shared-parameters-export/)). DiRoots IDS4Revit: IDS entity and property inspectors inside Revit, plus parameter mapping ([source](https://docs.ids4revit.diroots.com/docs/Pages/IDS4Revit/IDS4Revit.html)). BIMcollab Zoom: IDS validation showing property, requirement and actual value ([source](https://helpcenter.bimcollab.com/en/articles/340833-ids-property-validation-in-bimcollab)). | Parameter rules can target views only. Non-text parameters always read as empty (Engine/RuleEngineHost.cs:193-204, :216-221). No IDS check inside Revit. | At publish, the bridge referee judges ids@n and opens one BCF topic for each failing requirement (B10 reject on aster, #845/#846). |
| Sheets and views | DiRoots ProSheets: batch export to PDF, DWG, DGN, DWF, NWC, IFC and images, with names built from parameters and saved profiles ([source](https://diroots.com/revit-plugins/revit-to-pdf-dwg-dgn-dwf-nwc-ifc-and-images-with-prosheets/)), plus a selection tab and a file-name builder ([source](https://docs.prosheets.diroots.com/docs/ui-components/selection-tab.html)). Revit Publish Settings: named sets with search ([source](https://help.autodesk.com/cloudhelp/2025/ENU/RevitLT-Cloud/files/GUID-09FBF9E2-6ECF-447D-8FA8-12AB16495BC3.htm)). CTC View Creator + Sheet Assistant ([source](https://ctcsoftware.com/product/bim-project-suite/)). Naviate Sheet Manager ([source](https://blog.naviate.com/an-overview-of-sheet-manager)). DiRoots SheetGen ([source](https://docs.dirootsone.diroots.com/docs/sheetgen-user-guide)). | Publish Sheets and Publish Views have never run (B27). Every run exports every sheet, with no picker (Engine/SheetExporter.cs:62-66). Annotate creates empty views and no sheets. | Not yet proven in Revit: each sheet PDF is judged against naming@n and MIDP on the bridge (B27 bridge rows only). |
| Publish and export | Ideate Automation: scheduled, unattended IFC export ([source](https://graitec.com/uk/blog/how-to-automate-ifc-export-from-revit/)). Revit IFC exporter: user-defined pset mapping files ([source](https://help.autodesk.com/cloudhelp/2027/ENU/Revit-DocumentPresent/files/GUID-E6B1753C-7396-4176-995B-8306C4F50EF4.htm)). IDS4Revit: IFC export driven by the IDS requirements ([source](https://docs.ids4revit.diroots.com/docs/Pages/IDS4Revit/IDS4Revit.html)). | Bare IFCExportOptions with no user psets (Engine/PlatformExporter.cs:55-62; P1-11). No scheduling. The export freezes Revit (B10). | One governed path: gate, referee, version and ledger, seen live while signed out (B10: #845/#846, #865–#871). The cited pages do not describe a verdict or a ledger. |
| Standards | Native Transfer Project Standards: copies templates, filters, object styles, line and fill patterns, materials, annotation types and system types, with Overwrite or New Only. It does not copy shared parameters, project parameters or worksets ([source](https://novedge.com/blogs/design-news/revit-tip-transfer-project-standards-into-an-active-revit-model)). Ideate StyleManager: merges or deletes styles and patterns that Revit cannot purge ([source](https://support.ideatesoftware.com/support/help/ideate-stylemanager/using-ideate-stylemanager/line-fill-patterns)). Model Checker Configurator: builds checksets with a wizard ([source](https://interoperability.autodesk.com/modelcheckerconfigurator.php)). | The pack covers only worksets, shared parameters, view templates, browser organisation and types (Standards/GoldenModelExtractor.cs:31-32). Apply has never run (B5). Rules are read-only in Revit. | BUILT-NOT-PROVEN: Sentinel transfers worksets and shared-parameter bindings, which the native tool does not, and stages naming rules as ruleset@n+1 (harness only, B5). |
| MEP openings | Naviate Provision for Voids: oversize, Accepted/Conditional/Rejected statuses, linked RVT and IFC, IfcProvisionForVoids ([source](https://blog.naviate.com/provision-for-voids-coordinate-openings-for-mep-service-across-discipline)). ConVoid: round, rectangular and polygonal openings, oversize, merge, auto-update with a changelog, approvals, BCF ([source](https://www.conclass.tech/convoid)). MEPcontent Openings Manager: dimensions, shape, status, fire rating, approve or decline, place the approved ones ([source](https://www.mepcontent.com/en/apps/detail/16/)). | Never run (SIM run:56). Voids are unsized points (Engine/MepVoidManager.cs:252-271). | None proven. |
| Modelling automation | WiseBIM AI: walls, doors, windows and slabs from DWG, PDF or images, with wall heights constrained to levels ([source](https://aecmag.com/ai/ai-generates-revit-models-from-2d-plans/)). DiRoots custom DWG→Revit add-in ([source](https://diroots.com/custom-software-development/case-studies/auto-dwg-to-revit-conversion-kingspan-isoeste-custom-revit-add-in/)). IMAGINiT Rooms from CAD ([source](https://resources.imaginit.com/building-solutions-blog/imaginit-utilities-for-revit-cad-tools-part-2-rooms-from-cad)). Lines to Walls ([source](https://marketplace.autodesk.com/apps/4a59d6ad-e802-4c64-b8a5-858ca1c3db4f)). DXF_To_Revit ([source](https://github.com/omarsamy3/DXF_To_Revit)). The Revit Level tool makes floor and ceiling plans for each story level ([source](https://help.autodesk.com/cloudhelp/2014/ENU/Revit/files/GUID-54EDD889-9AEA-40B5-BD60-FC2F860DF95D.htm)). Revit Mass Floors ([source](https://help.autodesk.com/cloudhelp/2022/ENU/Revit-ArchDesign/files/GUID-7D7C1D92-5318-4BF9-99C2-10A45113E63F.htm)). Geopogo site context ([source](https://marketplace.autodesk.com/apps/326b93db-2303-4d9e-a3f4-f77e5e91958a)). Autodesk Assistant (Revit 2027) waits for the user before changing the model ([source](https://blog.bimsmith.com/Revit-2027-How-Autodesk-Assistant-Bridges-the-Gap-Between-Intent-and-Execution)). | Datum is LIVE-PROVEN. Ghost placement is PARTIAL, with walls fixed at 10 ft (GhostBuilder_ExtractionAndPlacement.cs:232-234). Massing is a rectangle (MassingPlanner.cs:160-197). | The layer mapping names the installed layers@n, guideline@n and type_catalog@n with source and sha, and never pre-ticks heuristic or LLM rows (B7; Snowdon). Wall thickness is measured from paired faces; the Lines to Walls page does not mention this. AI changesets get a referee verdict per element and roll back as one transaction (LIVE-PROVEN, memory bim-documents-roadmap). |
| Change requests | Revit editing requests with a Worksharing Monitor ([source](https://help.autodesk.com/cloudhelp/2022/ENU/Revit-Collaborate/files/GUID-365257C1-738B-477B-AD7F-C08D6D986488.htm)). TrackChanges compares element snapshots ([source](https://github.com/jeremytammik/TrackChanges)). | BUILT-NOT-PROVEN. The coordinator role defaults to everyone (Workflow/RequestManager.cs:39-40). | None proven. |
| UX and shell | Ideate Explorer: the working list stays open beside the model ([source](https://graitec.com/Help/Ideate_Software/EN/review-warnings.htm)). pyRevit telemetry records tool, user, Revit version and result ([source](https://docs.pyrevitlabs.io/reference/pyrevit/telemetry/record/)). Bimbeats: activity dashboards and alerts ([source](https://www.bimbeats.com/)). pyRevit: localised titles and tooltips ([source](https://discourse.pyrevitlabs.io/t/the-art-of-laziness-bundle-yaml-creation-tip-snippets-in-vscode/1179)). Autodesk: signed add-ins load without the prompt ([source](https://help.autodesk.com/cloudhelp/2024/ESP/Revit-API/files/Revit_API_Developers_Guide/Introduction/Add_In_Integration/Revit_API_Revit_API_Developers_Guide_Introduction_Add_In_Integration_Digitally_Signing_Your_Revit_Add_in_html.html)). Revit 2026 isolation, UseRevitContext=false ([source](https://www.revitapidocs.com/2026/news)). A .bundle with one entry per version ([source](https://blog.autodesk.io/revit-api-understanding-the-role-of-seriesmin-and-seriesmax-in-plugin-deployment/)). BIMcollab: a project picker after login ([source](https://helpcenter.bimcollab.com/en/articles/326998-connect-to-a-bimcollab-project-from-bcf-managers-or-bimcollab-zoom)), a 30-day login renewed on open, and proxy settings ([source](https://helpcenter.bimcollab.com/en/articles/332195-bimcollab-zoom-and-bcf-managers-login-with-bimcollab-id)). | Many floating windows and modal TaskDialogs. English only. Built from source, unsigned, with no version stamp (Sentinel.csproj:8; install.bat:13, :23). | Offline behaviour is honest: cached data is labelled "(cached HH:mm)", and the bridge-down rows were verified in B10 and B11. |

---

## 3. Per-tool findings and enhancements

Benchmarks for each tool are in §2. Tables list only verified findings.

### 3.1 Coordinate panel

#### 3.1.1 Show Panel (`Coordinate ▸ Show Panel`, `Commands.cs:8`)
**What it does.** Shows the dockable pane. The pane follows the active project through ViewActivated. It shows:
- the score, or "Not scored";
- the rule rows;
- a one-row ⚡ Fix;
- the Next strip with a ↻ button;
- a collapsible Doctor log.

Live DMU rows are merged in. Double-click selects the element and zooms to it.

**Status:**
- LIVE-PROVEN: rows on open (SIM run:34), the Next strip (SIM run:249; memory sentinel-2026-09-24-next-strip), and Doctor lines (B10, SIM run:442-457).
- UNKNOWN: ↻ (memory sentinel-2026-09-25-revit-standards (2); memory sentinel-2026-09-26-publish-5a (3)).
- BUILT-NOT-PROVEN: live DMU rows and the row ⚡ Fix.

| Kind | Finding | Evidence |
|---|---|---|
| honesty | The Doctor header counts every log line as an "auto-resolved warning". The log also holds scan-report, ruleset, auto-publish, clash-view and failure lines. | UI/SentinelPanelViewModel.cs:101; App.cs:157, :231; Engine/AutoPublish.cs:48-119; RevitEventHub.cs:49; B10 (SIM run:442, :448) |
| ux | ↻ gives no sign that it ran: there is no "refreshed HH:mm" stamp. | UI/SentinelPanelViewModel.cs:132-156; memory notes above |
| ux | Failures print raw HTTP text ("Journey unavailable — 502: Bad Gateway"). A 401 is not shown with the standard "signed out" wording. | Coordination/GovernedQuery.cs:122-126 vs :30, :36-37; memory sentinel-2026-09-25-revit-standards (3) |
| ux | The grid is single-select, with no grouping, counts, search or export. You cannot select every element that breaks one rule. | UI/SentinelPanel.xaml:33-36; SentinelPanel.xaml.cs:29-32 |
| gap | English only. The Arabic message (MessageAr) is loaded but never shown. | SentinelPanelViewModel.cs:23 vs SentinelPanel.xaml:41; demo/aster/ruleset-AST.json:23, :62; ROADMAP.md:53 |
| reliability | A row does not remember its document. Select and ⚡ Fix run later against the active document, which can be a family editor. Workset rows (id -1) do nothing on double-click, with no message. | RevitEventHub.cs:25-33; Workflow/AutoFixExecution.cs:33-34; SentinelPanelViewModel.cs:187-190; App.cs:158-160, :178-183 |
| ux | The Doctor log lives only in memory. It is capped at 200 lines, lost on restart, and its lines cannot be clicked. | SentinelPanelViewModel.cs:92-98 |
| honesty | A code comment calls the warn-mode notice a "non-blocking toast", but it is one Status line. When one edit raises several warnings, each overwrites the last. | Updaters/SentinelUpdater.cs:90, :94-96; SentinelPanelViewModel.cs:106-107 |
| honesty | The score is not recomputed after live deltas or ⚡ Fix. The header and the grid can disagree. | SentinelPanelViewModel.cs:80-89, :215-218 |
| perf | Switching to a view of another project runs a full ScanFull on the UI thread instead of showing a cached report. | App.cs:178-192; SentinelUpdater.cs:79-81 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| PNL-1 | Group the rows by rule, with counts and mode colour. Allow multi-select, "Select all in rule" and "Isolate". Add a text filter and CSV export. Every action runs against the row's own document, captured when the scan is published and compared with `.Equals`. | M | high | `Selection.SetElementIds`, `UIDocument.ShowElements`, `View.IsolateElementsTemporary` (2021+); ExternalEvent through RevitEventHub | On aster-tower the group counts add up to the scan total, and "Select all" on one rule selects exactly that count. With two projects open, a select on A never touches B. With a family editor in front, it says "switch back". | — (same work as SCAN-E4) |
| PNL-2 | Split the log into Doctor and Activity. Persist the last lines per project under %AppData%\Sentinel. Double-clicking a line that has an element selects that element. | M | med | `FailuresAccessor.GetFailureMessages`, `FailureMessageAccessor.GetFailingElementIds`; RevitEventHub.SelectAndShow | After one sync on Demo, the header reads "Doctor — 0 resolved" and Activity shows the scan line. A planted duplicate Mark adds one Doctor line that selects both elements. The lines survive a Revit restart. | R-08, P1-9 (they own the counting; this item is only labels and persistence) |
| PNL-3 | Add an Issues tab to the pane (Rules · Issues · Doctor), fed by the existing BcfSyncManager SSE stream. Double-click reuses BcfApplyEvent. | M | high | DockablePane / IDockablePaneProvider (already registered); ExternalEvent (BcfApplyEvent) | A web issue appears in the tab within 5 s while the BCF window is closed. Double-click isolates the element on aster-tower. Switching documents switches the list. | — (build in the same pass as P1-5) |
| PNL-4 | Stamp "refreshed HH:mm:ss" after ↻. Map 401 to the signed-out line, and 502 or connection errors to "bridge not answering at <url>". | S | med | none (WPF, HttpClient) | ↻ changes the stamp even when the data is unchanged. With the bridge stopped the strip reads "bridge not answering…". Signed out, it reads "signed out — Sentinel ▸ Sign in". | — (part of XC-6) |
| PNL-5 | An Arabic/English toggle for rule messages (right-to-left). Move the pane strings into a .resx file. | S | med | none (WPF) | On aster-tower the toggle shows the Arabic text right-to-left on the same rows, and English again when switched back. | — |
| PNL-6 | Cache the last report per Document and drop it when the document closes. Show the cached report on view switch, stamped "scanned HH:mm". After a live delta or ⚡ Fix, recompute the score or label it "as of last full scan HH:mm". | S | med | existing ViewActivated / DocumentClosing | Switching between two projects shows the report at once (the Activity line records a 0 ms scan). After a live rename clears a violation, the header either changes or says "as of <time>". | — (covers SCORE-E4) |

#### 3.1.2 Background machinery: live updater, Revit Doctor, ⚡ Fix, event hub (no button)
**What it does:**
- **SentinelUpdater** (an IUpdater, registered only on DocumentOpened) re-judges changed views, sheets, levels and grids, and any added element. It merges the rows into the pane and files change requests for REQUEST rules.
- **FailureInterceptor** ("Revit Doctor") listens to the application-wide FailuresProcessing event. It auto-resolves or dismisses 3 warning types in every transaction.
- **⚡ Fix** proposes a compliant name in FixReviewDialog, renames the element and writes an audit to the request store.
- **RevitEventHub** is the single ExternalEvent queue that the WPF UI uses.

**Status:**
- BUILT-NOT-PROVEN: Doctor (blueprint:390; its drill is owed, blueprint:1154).
- BUILT-NOT-PROVEN: ⚡ Fix from the pane. No record exists; FixReviewDialog has only been seen from the Naming Manager (memory sentinel-2026-09-28-naming-suggestions).
- BUILT-NOT-PROVEN: live delta and request creation (SIM run:38 shows 0 pending).
- LIVE-PROVEN by use: RevitEventHub (B17, SIM run:673-682; the Fix loop, SIM run:54).

| Kind | Finding | Evidence |
|---|---|---|
| bug | Live checking is registered only on DocumentOpened. Problems follow from that: (1) File ▸ New gets no updater and no name snapshot. (2) The key is `PathName ?? Title`, and PathName is "" for documents opened without a path, so those documents share one key. (3) The key changes after the first save. (4) The Registered set is never cleared on close. | App.cs:124-130, :187; Updaters/SentinelUpdater.cs:30-33, :62; Workflow/RequestManager.cs:50, :66, :85; App.cs:131-135 |
| honesty | The addition trigger fires on every added element, and its comment claims "workset / family placement checks". But EvaluateSingle judges only View, Sheet, Level, Grid and Parameter-on-View. | SentinelUpdater.cs:50-60, :111-116 vs Engine/RuleEngineHost.cs:108-128 |
| reliability | Doctor resolves or dismisses DuplicateValue, InaccurateLine and DuplicateInstances in every transaction of every document, including families and other add-ins' transactions. There is no opt-in, no notice and no count. Dismissing "identical instances" hides schedule double counting. | Updaters/FailureInterceptor.cs:19-24, :32-37, :54-63; App.cs:93 |
| honesty | The class comment says each intervention goes to the ROI tracker. It does not (B11 lists it as not counted). The Doctor line is written before commit, so a rolled-back transaction still shows "Resolved". | FailureInterceptor.cs:11-12 vs :58, :78; SIM run:499 |
| dead-code | The IFailuresPreprocessor half of FailureInterceptor is never attached. The only preprocessor in use is GhostFailureHandler. | FailureInterceptor.cs:14, :39-40; GhostBuilder/GhostBuilderOrchestrator.cs:148 |
| gap | ⚡ Fix is offered on REQUEST rows and records "machine fix = pre-approved", so a modeller can approve their own change. | UI/SentinelPanelViewModel.cs:46-52; Workflow/AutoFixExecution.cs:55-67; Workflow/RequestManager.cs:7-15 |
| bug | FixReviewDialog never substitutes {org}. On aster rules that use ORG={org}, a correct name shows "✕ Does not match" and Execute stays disabled. The dialog also duplicates RuleRegex.For, and it returns true (enabling Execute) when a definition is malformed. | UI/FixReviewDialog.xaml.cs:46-54 vs Engine/RuleRegex.cs:16-17, :30-35; SentinelPanelViewModel.cs:203 vs Commands.NamingManager.cs:114-122; ruleset-AST.json:76, :95, :151, :232 |
| ux | On a name collision, ⚡ Fix silently appends "<sep>01". The name written differs from the one in the dialog, and it may fail the same schema again. | AutoFixExecution.cs:50, :86-100 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| BG-1 | Register the updater on DocumentCreated as well as DocumentOpened. Keep the registration state in a dictionary keyed by the Document (compared with `.Equals`, pruned on close). Remove the document's triggers on close. Re-snapshot names after Save and Save As. | S | high | `UpdaterRegistry.RegisterUpdater(IUpdater, Document, bool)`, `AddTrigger`, `RemoveDocumentTriggers`; DocumentCreated / DocumentClosing / DocumentSaved / DocumentSavedAs (2021+) | A File ▸ New project shows a live row after a non-compliant view rename. Close aster-tower, reopen it in the same session, and a request-mode rename creates a Pending request. After a first Save As, the request shows the real old name. | — |
| BG-2 | Drop the all-elements addition trigger, or add a Workset case to EvaluateSingle. | S | med | ElementClassFilter / ElementMulticategoryFilter triggers; `Element.WorksetId`, `WorksetTable.GetWorkset` | Paste 5,000 elements on Demo: the updater runs 0 times. Or, if workset rules become live: a wall placed on the wrong workset shows a row immediately. | — |
| BG-3 | Doctor runs only in projects that opt in. Skip family documents, limit it to transactions that Sentinel or the user started, and never dismiss DuplicateInstances. Log after commit: "Sentinel resolved N in <transaction>". Ctrl+Z also reverts the user's edit, so it must not be offered as a separate undo. | S | med | ControlledApplication.FailuresProcessing, `FailuresAccessor.GetTransactionName`, `ResolveFailure` / `DeleteWarning`, `FailureMessageAccessor.GetFailingElementIds` (2021+) | On an unbound model, no warning is touched. On an opted-in model, a planted duplicate Mark gives one Doctor line naming both elements, and identical instances still appear in Manage ▸ Warnings. | R-08, P1-1, P1-9 (build it as part of R-08) |
| BG-4 | On a REQUEST row, ⚡ Fix files a Pending request that carries the proposed name, and the element stays unchanged until a coordinator approves. | S | high | ExtensibleStorage (existing RequestStore), Transaction | With a request-mode view rule, the modeller clicks Fix: Change Requests lists a Pending proposal and the view name is unchanged. Approve renames the view, and the audit shows two actors. | — |
| BG-5 | Replace FixReviewDialog.Matches with `RuleRegex.For(rule, org)`, failing closed on a bad definition. Check the de-duplicated name against the same pattern and show the final name before Execute. | S | high | none (WPF + existing RuleRegex) | On aster-tower, ⚡ Fix on a sheet under an ORG={org} rule shows "✓ Matches", Execute is enabled, and the rename lands. A forced collision shows the suffixed name before Execute. | — |

#### 3.1.3 Change Requests (`Coordinate ▸ Change Requests`, `Commands.Workflow.cs:11`)
**What it does.** A modeless list of the Pending requests held in the model's Extensible Storage blob.
- **Show** opens the view or sheet, or paints a level or grid green.
- **Approve** keeps the change. **Reject** reverts the name or number.
- Both clear ZZZ_ReviewStatus and append to an in-model audit.

**Status:** BUILT-NOT-PROVEN.
- It opened live with 0 pending (SIM run:38).
- Act 3.8 "stays not run" (SIM run:142).
- The approve/reject drill is owed (blueprint:1157).

| Kind | Finding | Evidence |
|---|---|---|
| reliability | One DataStorage element holds every request, plus the ⚡ Fix, Naming Manager and fix-in-place audits. It is written even from inside users' DMU transactions. On a workshared central, the last writer holds it until they sync, and everyone else must borrow it. The audit list grows without limit. Each request-mode hit loads the whole blob twice. | Workflow/RequestStore.cs:39-65, :75-82, :104-105; RequestManager.cs:83, :97; AutoFixExecution.cs:55; NamingManagerService.cs:192; Coordination/FixInPlaceService.cs:326 |
| bug | Old values come only from the name snapshot. An element created with a non-compliant name, or a request made after the document key changed, gets OldValue "". Reject then sets Name="", which Revit refuses, and the error goes only to the Doctor log. | RequestManager.cs:50, :69-70, :85, :148-152; SentinelUpdater.cs:32, :100-116; RevitEventHub.cs:45-50 |
| bug | A request-mode Parameter rule never files a request for the parameter edit, because the updater compares names. If the name also changed in the same edit, Reject reverts the name, not the parameter. | SentinelUpdater.cs:100-106; RequestManager.cs:85-86; RuleEngineHost.cs:124-126 |
| honesty | Approve and Reject remove the card before the ExternalEvent runs. If the revert fails, the model still lists the request as Pending, but the window shows it as done. | UI/RequestsWindow.xaml.cs:69-88 |
| gap | The coordinator role is a Revit user name in a per-PC settings.json. When the file is missing, everyone is a coordinator. The signed-in identity and the bridge's roles are ignored. | RequestManager.cs:21-41; WebApp/bridge/bcf-service.mjs:1853 |
| ux | No reason field, no confirmation, no bulk approve, no live refresh and no history view (GetAll and GetAudit have no callers). Non-coordinators cannot even use Show. | RequestsWindow.xaml.cs:41, :45, :83; RequestStore.cs:67, :72 |
| gap | Nothing reaches the web or the ledger. The "Phase 3 sync" named in the code comments was never built. | Workflow/ChangeRequest.cs:7-11, :29-30; SIM run:499 |
| reliability | Show writes model transactions (colour override plus temporary isolate) into the active view: they add undo entries and need the view borrowed. Show and Reset act on the active document by element id only, so they can paint an unrelated element in another model or leave the override stuck. | Workflow/ShowPendingChangeCommand.cs:33-42, :55-72, :84-101; RequestsWindow.xaml.cs:54-58 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| CR-1 | Store each request on the changed element itself (the requester already holds that element), keeping only an index in DataStorage. Check the checkout status before writing. Cap or rotate the audit. | M | high | `Element.SetEntity` / `GetEntity`, `WorksharingUtils.GetCheckoutStatus`, ExtensibleStorageFilter (2021+) | Two users on a central each trigger a request-mode rename. After both sync, both requests exist and neither user saw an "owned by" failure. | — |
| CR-2 | Keep the card in a "working…" state until the job reports back. On failure it stays Pending with the reason. Reject requires a reason. Add Approve-all and Reject-all for a filtered set. Show and Reset are pinned to the window's document. | S | high | ExternalEvent callback, `TransactionStatus`, `Document.Equals` | Reject a request whose old name is taken: the card stays, showing "not reverted — name in use". A normal Reject stores the typed reason. Show with another model active says "switch back". | — |
| CR-3 | Post request.created, request.approved and request.rejected rows under the signed-in identity. Take the coordinator role from the bridge (lead and above). Show pending requests on the web board. | M | high | ExternalEvent; network off the API thread | Approve one request on aster-tower: a ledger row appears with the signed-in e-mail. A contributor sees the window read-only; a lead can decide. | P2-7 (governed parameters through Change Requests); not in P1-9 |
| CR-4 | Snapshot by UniqueId on open, save and sync. Add parameter-change triggers. Reject restores the parameter. A request on a created element offers "delete". | M | med | `Element.GetChangeTypeParameter`, `UpdaterRegistry.AddTrigger`, `Parameter.Set`, `Document.Delete` | A request-mode view-parameter change shows the old and new values. Reject restores the parameter and leaves the name alone. A new non-compliant view's request deletes it on Reject. | P2-7 |

#### 3.1.4 BCF Issues (`Coordinate ▸ BCF Issues`, `Commands.BcfIssues.cs:28`)
**What it does.** A modeless window listing the bound project's open BCF topics, refreshed live over SSE. From it you can:
- zoom to an issue, in a "Sentinel Coordination" 3D view with the camera applied;
- isolate all issue elements;
- list the issues for the current selection;
- raise a new issue from the selection and the camera;
- run Fix in Revit on referee issues. The loop is: dry-run check → apply in one transaction → re-check → evidence comment → Resolved only when every GUID passes.

**Status:**
- LIVE-PROVEN: list, zoom, Fix in Revit and raise. Fix: 42/42 → Resolved (SIM run:54; memory sentinel-2026-09-16-state). Raise: B17, SIM run:681-682.
- UNKNOWN: Isolate-all and Issues-for-selection.

| Kind | Finding | Evidence |
|---|---|---|
| reliability | The bearer token is read once, when the window opens. Fetch, SSE, the evidence comment and Resolve all use it. Tokens expire (3600 s by default), so a window left open past that should get a 401 on the Fix loop (not seen live). | Commands.BcfIssues.cs:90-93, :182; Coordination/BcfSyncManager.cs:27-37, :91-101, :145-154; BcfConfig.cs:30; UserSession.cs:139 |
| gap | An issue raised from Revit carries no snapshot and no section box, although the bridge stores both. Orthographic views are sent as a 60° perspective. | Coordination/IssueDraft.cs:58-62; Commands.BcfIssues.cs:52-66; WebApp/bridge/bcf-service.mjs:2006-2008 |
| gap | Zoom applies only the first viewpoint's camera and isolation. It ignores clipping, visibility and colour, and cannot read orthogonal cameras. | Commands.BcfIssues.cs:101; BcfApplyEvent.cs:57-90; BcfModels.cs:48-53 |
| reliability | Every zoom edits one shared "Sentinel Coordination" view in model transactions. The first zoom uses two transactions. This adds undo entries and dirties the file, and two coordinators collide over the view. Zoom also acts on the active document, while New issue and Fix check the document. | Coordination/BcfApplyEvent.cs:33-36, :66-83, :208-225 vs Commands.BcfIssues.cs:173, :222 |
| perf | GUID lookup walks every non-type element and computes GetExportId, with no cache. One GUID missing from the model forces a walk of the whole model. | BcfApplyEvent.cs:154-173 |
| ux | The list shows only "[Status] Title" in a fixed 150 px box. There is no filter or sort, and status cannot be changed. A plain comment is only possible through Fix. The assignee is free text. | UI/BcfIssuesWindow.cs:44, :60-76; BcfModels.cs:31; UI/NewIssueDialog.cs:21, :56 |
| reliability | F32 is still open: every Re-check posts another evidence comment, even when nothing changed. | Commands.BcfIssues.cs:377; SIM run:115 |
| reliability | Whether an issue can be fixed is parsed from the topic title, so editing the title on the web loses the Fix button. Each ribbon click opens another window with its own SSE stream. | Coordination/IdsIssueRef.cs:22-35; Commands.BcfIssues.cs:91-95, :135-143 |
| reliability | BcfApplyEvent holds only one staged operation. A second operation raised before Revit is idle overwrites the first, which then never runs. | BcfApplyEvent.cs:19-31, :50; Commands.BcfIssues.cs:103-109 |
| honesty | The tooltip still says "issues raised by non-Revit users on the web", but issues are now raised from Revit too (B17). | App.cs:266-267; SIM run:673-682 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| BCF-1 | Read a fresh bearer token on every call (fetch, SSE, comments, status), the way CreateIssueAsync already does. | S | high | none (HttpClient) | Leave the window open past token expiry, then Fix → Re-check: the comment returns 201 under the signed-in e-mail. | — |
| BCF-2 | When raising an issue, send a PNG snapshot plus clipping planes from the section box. When zooming, restore the section box. Add orthogonal_camera to the DTO and the bridge. The web display of these is not verified, which may add work. | M | high | `Document.ExportImage(ImageExportOptions)`, `View3D.GetSectionBox` / `SetSectionBox` / `IsSectionBoxActive`, `View3D.SetOrientation` (2021+) | Raise an issue from a section-boxed isometric view on aster-tower: the topic has a snapshot and planes. Double-click restores the box and the isometric camera. | — |
| BCF-3 | Use a per-user view ("Sentinel Coordination – {user}"). Make each zoom one TransactionGroup. Skip the view if someone else owns it. Refuse when the active document is not the window's document. | S | med | `TransactionGroup.Assimilate`, `WorksharingUtils.GetCheckoutStatus`, `View3D.CreateIsometric`, `Document.Equals` | Two users zoom on the aster central at the same time with no borrow errors. Each zoom is one undo entry. With another model active, the tool says "switch back". | — |
| BCF-4 | Build a GlobalId → ElementId map once per document and keep it current from the updater's added and deleted ids. FixInPlaceService uses the same map. | S | med | `ExportUtils.GetExportId`, `UpdaterData.GetAddedElementIds` / `GetDeletedElementIds` | The second zoom to an issue with a GUID missing from the model, and a Fix plan build, each take under 200 ms on the largest model (first-call time recorded). | — |
| BCF-5 | A comment box and a status picker that use the existing AddCommentAsync and SetStatusAsync. Skip the evidence comment when the pass/fail set is unchanged (closes F32). The assignee is picked from project members. | S | med | none (network off the UI thread) | Two Re-checks with no change post one comment. "In progress" set in Revit shows in the web history under the signed-in e-mail. | — |
| BCF-6 | The bridge puts the requirement in a label (e.g. "ids:Pset_X.Prop"). The add-in reads the label first and falls back to the title. | S | low | none | Rename a referee topic on the web: the Fix button stays and the loop still resolves the topic. | — |

#### 3.1.5 Clash ▸ Clash Manager (`Commands.Phase2.cs:165`)
**What it does.** Runs synchronously inside the command. It tests linked duct, pipe, cable tray, conduit and DirectShape elements against host walls, floors, framing and columns:
1. a bounding-box test;
2. a Boolean intersect of the main solids;
3. a grade: Hard (≥ 1 L), Medium, or Soft (the boxes overlap but the solids do not intersect).

It also shows the Federation Gate status. The buttons are Show, Create 3D clash view and Export BCF (a local BCF 2.1 .bcfzip).

**Status:** BUILT-NOT-PROVEN (SIM run:55 "not run"; SIM run:185; blueprint:77, :560).

| Kind | Finding | Evidence |
|---|---|---|
| bug | The link box is moved into host space by transforming only its Min and Max corners. For a rotated link the result does not bound the element, so clashes are missed and false Soft rows appear. MEP Openings uses the same code. | Engine/ClashManager.cs:63-65, :160-168; Engine/MepVoidManager.cs:89 |
| bug | Geometry is read at Coarse detail. Pipes and ducts are often single lines at Coarse, so MEP clashes may never grade Hard or Medium. Not verified, because the tool has never run. | ClashManager.cs:75-91, :128-131; SIM run:55 |
| perf | A triple nested loop with no spatial index. The link solid is re-extracted for every host (MepVoidManager caches it; this tool does not). It all runs on the UI thread with no progress or Cancel, then a blocking 4 s GET. | ClashManager.cs:54-106 (line 75 is inside the loop) vs MepVoidManager.cs:91-95; Commands.Phase2.cs:171-177; GovernedQuery.cs:20 |
| bug | The BCF export writes wrong component GUIDs: 22 hex characters instead of the IFC base64 GlobalId. The correct encoder already exists in BcfApplyEvent. | Engine/BcfExporter.cs:172-179 vs Coordination/BcfApplyEvent.cs:184-206 |
| bug | The exported camera is in internal coordinates with no shared-coordinate transform, so it is misplaced in IFC viewers when the survey point differs from the internal origin. | BcfExporter.cs:83-101, :181-184 vs Commands.BcfIssues.cs:52-61; Commands.Phase2.cs:137-150 |
| ux | All selected clashes become one BCF topic, with the description cut at 25 lines and at most 100 host ids. The linked element is never included. The save location is chosen through a SaveFileDialog hack. | UI/ClashManagerDialog.xaml.cs:53-90 |
| gap | The scope is hard-coded: no fittings, equipment or sprinklers; no host MEP against linked structure; no clashes inside one model; no tolerance. Soft means any box overlap, so large floor boxes flood the list. Results are not saved, and each clash view is a new timestamped view. | ClashManager.cs:35-39, :69-73, :113-126; Engine/ViewGenerator.cs:34 |
| ux | "Show element" selects only the host element. | ClashManagerDialog.xaml.cs:28-32 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| CLM-1 | Search for candidates in link space: move each host solid into link space with the inverse transform, then run the native filters in the link document. Cache link solids. Run in batches through ExternalEvent from a modeless window with progress and Cancel. | L | high | `BoundingBoxIntersectsFilter`, `ElementIntersectsSolidFilter`, `SolidUtils.CreateTransformed`, `RevitLinkInstance.GetTotalTransform().Inverse` (2021+) | A pipe through a slab in a link rotated 30° is graded Hard, with the same pair count as Revit Interference Check. Run time is recorded before and after, and Cancel stops a run midway. | — (decide the clash strategy first, §7) |
| CLM-2 | Read MEP geometry at Fine detail. Take minimum volume, penetration, clearance and a category matrix from a project artefact. Hide box-only Soft rows by default, as the web engine does (B18). | M | high | `Options.DetailLevel = Fine`, `BooleanOperationsUtils.ExecuteBooleanOperation`, `GeometryCreationUtilities.CreateExtrusionGeometry` | A DN100 pipe through a wall is graded Hard with a non-zero volume. A 30 mm near miss shows only with a 50 mm clearance. | P2-3 (this is the Revit reader of clash@n) |
| CLM-3 | Post confirmed clashes to /clash/:pid, which respects the gate lock (409 with a reason). Create one BCF topic per clash or group, with both GlobalIds. Use the web engine's signature scheme. | M | high | `ExportUtils.GetExportId` / IFC_GUID for both elements; network off the API thread | Demo with its MEP link: the web register lists the rows (source revit), and each topic selects both elements. With the gate at FAIL, Revit shows the 409 reason and writes nothing. | E6, P2-3 |
| CLM-4 | Use BcfApplyEvent.ToIfcGuid in BcfExporter, and write the camera through `ActiveProjectLocation.GetTotalTransform()`. This also fixes the MEP Openings export. | S | high | `ExportUtils.GetExportId`, `ProjectLocation.GetTotalTransform` | Export one clash from aster-tower, open it in BIMcollab Zoom or Sentinel web Issues: the component selects the element and the camera matches the Revit view. | — |
| CLM-5 | "Show" selects the host and the linked element. No API can override the graphics of one element inside a link, so the view keeps the section box and the host override. | S | med | `Reference.CreateLinkReference` + `Selection.SetReferences` (Revit 2023+; 2021–2022 builds fall back to the host only) | On 2024, Properties shows two elements selected: the wall and the linked pipe. | — |

#### 3.1.6 Clash ▸ Clash Register (`Commands.ClashRegister.cs:18`)
**What it does.** GETs /clash/:pid and counts the status lifecycle (raised → reviewed → approved → resolved). It shows the 12 largest clashes by volume in a TaskDialog.

**Status:** BUILT-NOT-PROVEN (SIM run:55). Act 3.7 ran its web parts only (SIM run:21).

| Kind | Finding | Evidence |
|---|---|---|
| ux | A modal TaskDialog with the top 12 rows: no list, filter, zoom or link to the BCF topic. | Commands.ClashRegister.cs:53-76 |
| gap | The rows carry the signature, bcf_guid and elements, but the client keeps only Label, Status and Volume. | bcf-service.mjs:1839, :220-231 vs GovernedQuery.cs:268-273, :302-309 |
| gap | Status cannot be changed from Revit, although PUT /clash/:pid exists. | bcf-service.mjs:1853, :1887-1893; App.cs:272-273 |
| honesty | A 200 reply without "items" reads "No clashes recorded". Every error except 401 reads "Couldn't reach the Sentinel bridge". | GovernedQuery.cs:297-298, :313-314; Commands.ClashRegister.cs:35-51 |
| perf | The GET blocks Revit's UI thread for up to 4 s. | Commands.ClashRegister.cs:28; GovernedQuery.cs:20, :29 |
| gap | Fed only by the web clash panel. Clash Manager's results never reach it, so the two tools in one pulldown show unrelated data. | ClashManagerDialog.xaml.cs:53-90; bcf-service.mjs:1868-1885 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| CRG-1 | A modeless register (or a pane tab) with status and volume filters and "only clashes touching this model". Double-click resolves the GlobalIds and isolates the elements in the per-user view; linked elements are selected by reference on 2023+. | M | high | GUID map (BCF-4), `View.IsolateElementsTemporary`, `Selection.SetReferences` (2023+), ExternalEvent | On aster-tower after a web ⚑ Raise, double-click isolates both elements, or names which one is missing. With the bridge stopped, Revit does not freeze. | — |
| CRG-2 | A status picker that PUTs {signature, status} under the signed-in session and shows the ledger line. | S | med | none (network off the UI thread) | "resolved" set in Revit shows on the web. The ledger row names the e-mail. A viewer account is refused with the bridge's message. | — |
| CRG-3 | When a row has a bcf_guid, "Open issue" opens that topic in BCF Issues or the pane tab. | S | low | none | The Issues window opens with that topic highlighted. | — |

#### 3.1.7 Review Flag (`Commands.Workflow.cs:58`)
**What it does.** A one-time setup. It creates the text shared parameter ZZZ_ReviewStatus on Views, Sheets, Levels and Grids, then asks the coordinator to build a Browser Organization by hand.

**Status:**
- LIVE-PROVEN for creating the parameter (SIM run:39).
- BUILT-NOT-PROVEN for the flag writes (SIM run:142; blueprint:1157).

| Kind | Finding | Evidence |
|---|---|---|
| ux | A one-time setup takes a large button on the everyday Coordinate panel. | App.cs:274-275 |
| reliability | The definition comes from %TEMP%\Sentinel_SP.txt with no fixed GUID. Each machine, and each temp cleanup, creates a new GUID. | Commands.Workflow.cs:84-100 |
| bug | The "already exists" check is by name only. A same-named parameter of another type passes, and SetReviewFlag then silently writes nothing. | Commands.Workflow.cs:72-80; RequestManager.cs:154-160 |
| honesty | The tooltip says "coordinator only", but everyone is a coordinator when there is no settings.json. | App.cs:275; RequestManager.cs:39-40 |
| gap | Nothing in Revit reads the flag: no filter, sheet list or schedule. | Commands.Workflow.cs:120-125 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| RF-1 | Use a fixed GUID shipped in the add-in. Check an existing parameter by GUID and storage type. Run the setup from Project Setup, or automatically when the first request-mode rule is installed, and free the ribbon slot. | S | med | `ExternalDefinitionCreationOptions.GUID`, `SharedParameterElement.Lookup(doc, guid)`, `Document.ParameterBindings` (2021+) | Two machines and two projects show the same GuidValue. A same-named parameter of the wrong type is reported. The Coordinate panel has one fewer button. | — |
| RF-2 | Create a "Sentinel — Pending review" sheet list filtered on Pending, plus an orange view filter for levels and grids. First check that those categories are filterable; otherwise fall back to per-element overrides. | S | med | `ViewSchedule.CreateSheetList`, `ScheduleDefinition.AddFilter`, `ParameterFilterElement.Create`, `ParameterFilterRuleFactory.CreateEqualsRule`, `ParameterFilterUtilities.GetAllFilterableCategories` | A pending sheet-number change shows in the list, and a pending level is orange. Approve clears both. | — |

#### 3.1.8 Review AI Proposals (`Commands.ReviewChangesets.cs:21`)
**What it does.** Fetches the oldest "proposed" AI changeset. Each row shows the referee verdict, and a row is pre-ticked only if the referee accepted it. On Decide the tool:
1. re-fetches the changeset;
2. places the ticked levels, grids, walls and floors in one transaction, rolling everything back on a missing type or level;
3. reports the result with the ElementIds and UniqueIds.

**Status:** LIVE-PROVEN.
- memory bim-documents-roadmap (2026-08-07): the happy path, a rollback drill and a mid-review withdraw.
- SIM run:61: pass, with findings F36/F37/F38.
- blueprint:351, :698.

| Kind | Finding | Evidence |
|---|---|---|
| reliability | Places elements into whichever document is active when the event fires. With two models open, elements can land in the wrong model and be reported against the reviewed project. | GhostBuilder/ChangesetPlacementEvent.cs:31-37; Commands.ReviewChangesets.cs:30-45 |
| perf | The report is a synchronous call (120 s timeout) inside the ExternalEvent callback, and retries are modal. The fetches (8 s) also block. | Coordination/ChangesetClient.cs:90-91, :107, :122, :140; Commands.ReviewChangesets.cs:47, :76, :91-106, :115-143; ChangesetPlacementEvent.cs:37-38 |
| honesty | Undo in Revit after an apply silently leaves the record saying "applied" (found live on 2026-08-07). The watcher that would catch this was never built. | memory bim-documents-roadmap; grep: no DocumentChanged subscription in SentinelAddin |
| ux | Rows are text only: no geometry preview, and no selection of the created elements afterwards. | UI/ChangesetReviewWindow.cs:74-99; Commands.ReviewChangesets.cs:103-105 |
| ux | F37 and F38 are still open. Declining with zero ticks closes silently. There is no picker, and an extra modal appears when more than one changeset is pending. | Commands.ReviewChangesets.cs:59-61, :84-88; SIM run:120-121 |
| reliability | The window closes after Decide whatever happens, so a failed re-fetch loses the ticks and the note. The one-window guard is released before placement and before the report. A second click can then re-run a changeset that is still "proposed" and duplicate its elements. | UI/ChangesetReviewWindow.cs:137-143; Commands.ReviewChangesets.cs:23-26, :71-82, :107-109 |
| gap | The vocabulary is level, grid, basic wall and floor. No parameter edits, doors or windows. | GhostBuilder/ChangesetExecutor.cs:50-58, :81-138; blueprint:700 |
| dead-code | Duplicates the ElementId conversion with `#if NET48 IntegerValue` instead of using Compat.IdValue (IntegerValue is deprecated on 2024). The report claims actor = Windows user; the bridge replaces it only when a signed-in token is sent. | ChangesetExecutor.cs:163-167 vs Compat.cs:11-17; Sentinel.csproj:16; ChangesetClient.cs:137 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| AI-1 | Capture the Document when the command starts. Refuse unless the active document `.Equals` it, and report nothing in that case. | S | high | `Document.Equals`, ExternalEvent | Start a review on Demo, switch to aster, then click Create: nothing is created, the message says "switch back", and the changeset stays proposed. | — (a case of XC-1) |
| AI-2 | Move FetchOne and ReportResult off the UI thread. Save an "applied, unreported" record in Extensible Storage first, and retry it on the next open or sync. Refuse to re-run a changeset that has an unreported record. Hold the guard until the report lands. | M | high | ExtensibleStorage (Entity on ProjectInfo), DocumentOpened, ExternalEvent | With the bridge stopped at Create, Revit stays responsive and shows "1 AI result waiting". The report lands later by itself, and Review does not offer that changeset again. | — |
| AI-3 | Stamp created elements with their proposal_guid. Watch Application.DocumentChanged, which also fires on Undo and Redo, and post "reverted" rows. | M | high | `Application.DocumentChanged`, `DocumentChangedEventArgs.GetDeletedElementIds` / `GetTransactionNames` / `Operation`, `Element.SetEntity` (2021+) | Apply 4 elements, then Ctrl+Z: the bridge records "reverted by undo" for 4 guids, and the web shows applied-then-reverted. | — |
| AI-4 | Draw the proposed walls, floors and grids as transient graphics, with no transaction. Ticking a row highlights it; add "Zoom to row". | L | med | DirectContext3D (IDirectContext3DServer through ExternalServiceRegistry, all supported versions); TemporaryGraphicsManager only for position markers (2022+) | Outlines appear in 3D, ticking highlights a row, the undo stack is unchanged, and closing the window removes the graphics. | — |
| AI-5 | List all pending changesets with age, source and verdict counts. "Decline all" requires a reason and confirms "Declined — reported (ledger …)". The window stays open until the report lands. | S | med | none (WPF) | With 3 pending, the picker lists 3. A zero-tick decline shows the reported line, and the bridge status is "declined" with the typed reason. | — |

### 3.2 Validate panel

#### 3.2.1 Scan Now (`Commands.cs:17-35`)
**What it does.**
1. Refuses family documents.
2. Fetches ruleset@n off the UI thread (project, then office, then none), with a 4 s cap and a cache fallback.
3. Runs ScanFull on the API thread. ScanFull matches names for views, sheets, levels, grids, families, types and worksets, and checks "parameter not empty" on views only.

The report reaches the bridge only on Synchronize with Central.

**Status:** LIVE-PROVEN.
- B5 (SIM run:256-293): 50.6% "Judged by ruleset@1 · office · fb8f9baefa9f…"; Demo 31.3%; unbound "Not scored"; with the bridge down, "(cached 06:01)".
- Session C: 1,092 elements scanned in 88 ms.

| Kind | Finding | Evidence |
|---|---|---|
| gap | Parameter rules can only target views. "Every door carries Fire Rating" cannot be expressed. | Engine/RuleEngineHost.cs:193-204, :124-126 |
| bug | Non-text parameters always read as empty (AsString is null for Integer, Double and ElementId). A filled Yes/No or number is always flagged. IFC-02 has the same bug. | RuleEngineHost.cs:216-221; IfcPreFlightScanner.cs:126 |
| bug | The live parameter check ignores exclusions. A Parameter rule without parameter_name reaches LookupParameter(null), which throws ArgumentNullException inside IUpdater.Execute on every view edit. The loader does not require the field. | RuleEngineHost.cs:124-126 vs :195, :199, :218; Engine/RulesetStore.cs:55-67 |
| honesty | Type, Family and Workset rules are never re-checked live, although the updater comment claims they are. MergeDelta never recomputes the score. | RuleEngineHost.cs:108-128, :177-179; SentinelUpdater.cs:50-60; SentinelPanelViewModel.cs:79-89 |
| honesty | BLOCK mode does nothing beyond its weight: nothing calls PostFailure. BLOCK rows also get no ⚡ Fix. | SentinelUpdater.cs:88-93; SentinelPanelViewModel.cs:46-52; grep (only HealthScorecard.cs:14, RulesetWindow.xaml.cs:32-38) |
| reliability | Scan Now never posts to the bridge; only a sync does. The sync post is limited to one a minute per Revit process, so a second model synced within 60 s is dropped (only a Doctor line says so). Non-workshared models never post. Posted reports read "not confirmed" because no chain hash comes back. | App.cs:194-227; Coordination/GovernedNotify.cs:195-225; SIM run:97-98, :448 (B10 #852) |
| ux | Single-select grid, so 1,069 rows can only be scrolled. No batch Fix. | UI/SentinelPanel.xaml:33-54; Session C finding 5 |
| reliability | Regexes written on the web (exclusions and token_defs) run with no MatchTimeout on the API thread. A bad pattern could freeze Revit. | RuleEngineHost.cs:46-47; RuleRegex.cs:30-36; RulesetStore.cs:70-84 |
| ux | No immediate feedback. The rows change only when the GET lands, up to 4 s later. | Commands.cs:29-33; App.cs:145-166, :184-188 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| SCAN-E1 | Parameter rules gain `categories` and read by StorageType, instance then type (as GovernedElementExtractor.ReadEntry does). Scan with an ElementMulticategoryFilter. The DMU path gets the exclusion check and a null guard. The loader refuses a Parameter rule without parameter_name. | M | high | `ElementMulticategoryFilter`, `Parameter.StorageType`, `Element.GetTypeId` (2021+) | Strip a parameter from 5 doors: exactly 5 rows. Yes/No set to "No" is not flagged. Editing an excluded view adds no row. | — |
| SCAN-E2 | Add triggers for types, families and workset changes. Extend EvaluateSingle to cover them. MergeDelta recomputes the pass rate. | M | high | `UpdaterRegistry.AddTrigger`, `ElementIsElementTypeFilter`, `ElementClassFilter(typeof(Family))`, `Element.GetChangeTypeParameter(ELEM_PARTITION_PARAM)` | Renaming a non-conforming wall type removes its row and moves the %. Moving a wall to a non-whitelisted workset adds a WS row. | — |
| SCAN-E3 | Register a Sentinel FailureDefinition at startup with Error severity, and post it for BLOCK violations from the updater. The code comment calls this "disallowed inside DMU"; that is wrong, it is supported. Give BLOCK rows ⚡ Fix. | M | med | `FailureDefinition.CreateFailureDefinition` (OnStartup only), `Document.PostFailure` from `IUpdater.Execute` | Under a BLOCK view-name rule, a non-conforming rename is refused with Sentinel's message and reverts. Warn and Monitor rules are unaffected. | — (founder decision: keep BLOCK or drop it) |
| SCAN-E4 | Pane triage: filter, multi-select, isolate, batch Fix for one rule, CSV export. | M | med | `Selection.SetElementIds`, `View.IsolateElementsTemporary`, `UIDocument.ShowElements` | Filter to one rule, select 20 rows and isolate: the view shows those 20. The CSV row count equals the pane count. | — (do together with PNL-1) |
| SCAN-E5 | Post Scan Now results too. Throttle per project key, not per process. /office/scan returns the hash. | S | med | none new | Two models synced 20 s apart both get rows. Scan Now on a non-workshared model changes office.model_health, and the log reads "Recorded: ledger #…". | P1-6, P1-10 |

#### 3.2.2 Health Scorecard (`Commands.cs:69-81`)
**What it does.** Runs a fresh ScanFull and weights each violation: Block 8, Request 4, Warn 2, Monitor 0.5. The penalty is divided by (elements checked × 2) and clamped, giving 0–100 and a grade A–F. The result is grouped by rule prefix in a TaskDialog.

**Status:** LIVE-PROVEN (SIM run:36: "18.3% F, 277 issues"; Session C: "0.0% (F) — 1,069 open issues", with the domain sums correct).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | One model shows three different percentages under one label: the pane pass rate, the clamped scorecard, and Pre-Flight's ratio written into "% compliant". Session C saw 11.0%, 0.0% and 91.4% at the same time. | Session C finding 1; RuleModels.cs:113-123; SentinelPanelViewModel.cs:62, :68-77; HealthScorecard.cs:66-70; IfcPreFlightScanner.cs:135 |
| bug | The score saturates at 0. When the penalty reaches twice the elements checked, the score reads 0.0% F, and fixing violations does not move it, while the pane does (10.9% → 11.0%). | HealthScorecard.cs:66-70; Session C |
| ux | Domain codes (VN, VP, FN, SN, LV, WS) are shown with no legend. | Session C finding 4; HealthScorecard.cs:84-85 |
| ux | The TaskDialog pads columns with spaces in a proportional font, so they misalign. No copy or export. | HealthScorecard.cs:76-86; Commands.cs:76-78 |
| reliability | It re-scans instead of using the pane's report, so it leaves out CDE-01, which is added at sync. | Commands.cs:76 vs App.cs:198-211 |
| ux | No guard for family documents: in the family editor it tells the user to run Scan Now, which then refuses. | Commands.cs:69-80 vs :24-28; RuleEngineHost.cs:37-38 |
| gap | No history, trend or post of the weighted score. | Commands.cs:69-80 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| SCORE-E1 | Give each figure its own name: "Rule pass rate", "Weighted rule score", "IFC mapping coverage". Print each formula. This must land before MHI adds a fourth number, and P1-3 must define which figure is RuleScore (blueprint:388, :392, :424). | S | high | none | On the Session C model every percentage carries a distinct label. Fixing one violation moves both rule figures in the same direction. | P1-3, P1-5 |
| SCORE-E2 | Replace the clamp with a decay curve, 100·e^(−penalty/(k·checked)), with k as a tuning knob. | S | med | none | The Golden Nugget copy reads a non-zero score, and fixing 10 violations raises it. | Conflicts with P1-3 "HealthScorecard v1 untouched" (blueprint:389, :1185): founder decision |
| SCORE-E3 | A modeless window: domain rows with a legend and per-rule counts. Clicking a row filters the pane. Copy plus HTML/CSV export. | M | med | WPF window owned by the Revit main window; ExternalEvent | Each domain names its rules, and the exported totals equal the dialog's. | — |
| SCORE-E4 | Build the scorecard from the pane's last report. Refuse family documents. | S | low | none | After a sync that adds CDE-01, the scorecard total equals the pane's row count. | — (PNL-6 covers most of this) |

#### 3.2.3 Rule Set (`Commands.cs:83-99`)
**What it does.** A modeless, read-only window listing the rules. It shows ruleset@n · source · sha (or the cached state), and for each rule: target, mode, token names, EN and AR messages, whitelist, parameter and the exclusion count.

**Status:** LIVE-PROVEN (SIM run:37; Session A, TESTING_PROTOCOL.md:612). The header label after phase 4a has no run record (SIM run:268 does not list this window).

| Kind | Finding | Evidence |
|---|---|---|
| gap | Shows token names only. What each token accepts, the aliases, the inference sources and the exclusion patterns are not shown. | UI/RulesetWindow.xaml.cs:27-29, :41-53 |
| honesty | The legend shows BLOCK as a mode, but BLOCK enforces nothing. | RulesetWindow.xaml:34-50; SentinelUpdater.cs:88-93; SentinelPanelViewModel.cs:49 |
| honesty | Read-only, yet the web Packs panel says "Edit rules in Revit (Standards Engine)". F8's "office ruleset authoring" is still open. | WebApp/src/setups/packs-panel.ts:146; SIM run:91 |
| ux | Each click opens another snapshot window, and none refreshes when a newer ruleset@n is installed. | Commands.cs:94-97; RulesetWindow.xaml.cs:79-87 |
| gap | No count of violations per rule, no link to the rows, no "test a name" box. | RulesetWindow.xaml.cs; UI/NamingManagerWindow.cs:134-143 (a live check already exists there) |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| RULE-E1 | For each token, show the allowed values (with {org} expanded), aliases and inference sources, and list the exclusions. | S | med | none | On Aster (ruleset@5) each token of the type rule shows its codes and the alias GYPSUM→GYP. | — |
| RULE-E2 | A "Test a name" box using RuleRegex.For and NamingProposer.Problems. It names the failing token in words. | S | high | none | "AST_EXT_ARC_ACT_200 mm" shows ✓. "AST_XXX_ARC_ACT_200 mm" names LOC as the failing part. | — |
| RULE-E3 | One window per document that updates on reload. Each card shows its violation count and a "show rows" link. Correct the wording in packs-panel.ts:146. | S | med | ExternalEvent (RevitEventHub) | Install ruleset@6 on the web and click Scan Now: the open window changes to @6, and the card counts equal the pane counts. | — |

#### 3.2.4 IFC Gate ▸ IFC Pre-Flight (`Commands.cs:37-67`)
**What it does.** Walks placed elements in 14 architectural and structural categories.
- **IFC-01** flags a missing "Export to IFC As". The built-in parameter is read on 2023+, the shared parameter before that.
- **IFC-02** flags an empty '{org}_View Status'.

The results replace the pane's rows. It does not read PsetMap, contract@n or ids@n.

**Status:** PARTIAL.
- IFC-01 ran live (SIM run:48: 826 issues; Session C: 2,161 elements in 238 ms).
- The IFC-02 branch has never been exercised (Session C deferred the drill).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | IFC-02 tests one view-routing parameter on walls, doors and slabs, and only when the parameter exists and is empty. The tooltip promises an audit of "mandatory property sets". | IfcPreFlightScanner.cs:22, :123-131; OrgNames.cs:21; App.cs:289-290 |
| gap | Never reads contract@n, PsetMap or ids@n, so it can say "✓ Ready" for a model the contract then refuses. Demo failed on 994 proxies. | IfcPreFlightScanner.cs; SIM run:307 (B6 #781), :372-376 (B8) |
| ux | Noise: one Monitor row per element (2,161 on Golden Nugget, 826 on Aster) buries the few Warn rows. | Session C; SIM run:48; IfcPreFlightScanner.cs:104-121 |
| ux | Overwrites the compliance rows in the pane and writes its own ratio as "% compliant" (91.4%). | Session C findings 1 and 5; Commands.cs:57-58; SentinelPanelViewModel.cs:68-77 |
| gap | Covers architectural and structural categories only. An MEP model gets a misleading "No placed model elements…". | IfcPreFlightScanner.cs:25-33; Commands.cs:46-54 |
| dead-code | The Warn branch for Specialty Equipment can never fire, because that category is not collected. | IfcPreFlightScanner.cs:25-33 vs :110-112 |
| gap | No export-setup checks: user psets, levels marked as building stories, site location, DontExport. | IfcPreFlightScanner.cs; blueprint:111 (U15), :1091 |
| reliability | Pre-Flight reads the built-in "Export to IFC As" on 2023+, but GovernedElementExtractor.IfcClassOf, used at publish, reads only a parameter named "IfcExportAs". The two can disagree, and counts differ between 2022 and 2023+ builds. | IfcPreFlightScanner.cs:70-101; Engine/GovernedElementExtractor.cs:83-87 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| PRE-E1 | Load contract@n off the UI thread. Predict the class census, the proxy count and ratio, and the missing mapped properties for each class. Precondition: make IfcClassOf read the built-in parameter on 2023+. | M | high | `ElementMulticategoryFilter`, `get_Parameter(BuiltInParameter.IFC_EXPORT_ELEMENT_AS)` (current guard: 2023+) | On Demo, Pre-Flight predicts the proxy failure against contract@1 with a count within 5% of the gate's 994. | P1-11 |
| PRE-E2 | Take the required parameters from the ruleset or the contract. Flag missing and empty values. Read by StorageType. | S | high | `LookupParameter` / `get_Parameter`, `StorageType` | Strip the pset parameter from 5 doors: exactly 5 IFC-02 rows, naming the doors. | — |
| PRE-E3 | Pre-Flight gets its own pane tab. Monitor rows roll up to one per type with a count; Warn rows stay per element. | S | med | none (WPF) | On Golden Nugget, 2,161 rows collapse to per-type rows, and the compliance rows stay one click away. | — (pane tabs, §4.2) |
| PRE-E4 | Flag unflagged building stories, a default site location, DontExport elements, and MEP categories when the contract names MEP classes. | M | med | `LEVEL_IS_BUILDING_STORY`, `Document.SiteLocation`, `IFC_EXPORT_ELEMENT_AS` (built-in on 2023+) | An Aster copy with one level unflagged and a default location gives 2 findings, and the gate's georeference warning goes away once both are fixed. | — |

#### 3.2.5 IFC Gate ▸ IFC Delivery Gate (`Commands.IfcGate.cs:17-125`)
**What it does.**
1. Loads contract@n, blocking for up to 4 s.
2. Exports the active 3D view in the contract's schema, or takes an existing .ifc.
3. Scans the STEP file: entity census, psets and properties present, a georeference hint.
4. Writes .sentinel-cert.json and posts a delivery_gate row, waiting up to 6 s.

With no contract the result is NOT CHECKED, never PASS.

**Status:** PARTIAL.
- Certify is LIVE-PROVEN: B6 (FAIL, 994 proxies, #781); B8 (#790); B12 (#939); SIM F25 fixed.
- The ledger row is BROKEN for signed-in users: B15 got "HTTP 403: … machine credential" (SIM run:651). H5 is owed.

| Kind | Finding | Evidence |
|---|---|---|
| bug | The ledger row is refused with 403 for signed-in users, the normal case since H4. The certificate says PASS or FAIL, but the ledger has no record, so ROI and stage-gate counts come out low. | SIM run:651 (B15); WebApp/bridge/cde-store.mjs:1171-1174; memory sentinel-2026-09-28-h4-revit-sign-in |
| honesty | Required psets and properties count as present if they appear anywhere in the file. One wall with FireRating passes "FireRating required", and the dialog says "certified for CDE upload". | Engine/IfcDeliveryGate.cs:79-114, :152-158; GateLines.cs:59 |
| honesty | The georeference check is weak: any integer triple on IFCSITE passes, including a template default. require_georeference only ever gives a Warning. | IfcDeliveryGate.cs:115-123, :160-161; DeliveryContract.cs:31 |
| honesty | The dialog says "current project setup", but the export uses bare options. The office IFC setup and user pset mapping are ignored. | Commands.IfcGate.cs:40-42; PlatformExporter.cs:55-62; blueprint:111, :1091 |
| honesty | The certificate is called "signed", but it is plain JSON holding the file's SHA-256. It does not record the view or the options, so a partial view export can be "certified" like a whole-model export. | IfcDeliveryGate.cs:18-20, :169-196; Commands.IfcGate.cs:63-77; PlatformExporter.cs:61-62 |
| honesty | PASS covers the contract only. The project's IDS and naming are not run. | GateLines.cs:59; IdsSpecFile.cs:5-9 |
| reliability | The STEP scan assumes one entity per line, which matters when certifying files from other exporters. The proxy-ratio denominator also misses IFC4 *STANDARDCASE, ramps, chimneys, shading devices and parts; the Node port has the same bug. | IfcDeliveryGate.cs:52-53, :84-98, :139-149, :237-244 vs :216-226; WebApp/bridge/delivery-gate.mjs:22-25 |
| gap | IFC2X3 or IFC4 only, with IFC4 always as Reference View. No IFC4x3, no Design Transfer View, no IFCZIP. | DeliveryContract.cs:67-70; PlatformExporter.cs:57-58; IfcDeliveryGate.cs:163 |
| ux | The network waits (4 s and 6 s) block the UI with no progress. On the existing-file path, the certificate write is not in a try/catch, so it can end in a raw Revit error. | Commands.IfcGate.cs:31, :58, :121; IfcDeliveryGate.cs:178 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| GATE-E1 | Move the row to the bridge-measured route (H5), or allow a signed-in contributor to post a "check" row, as recordRevitReport already allows for naming and family_heal. | M | high | none (bridge route + GovernedNotify.Event) | Signed in, gate Demo: the dialog ends "Recorded: ledger #<id>", and the actor is the verified e-mail. | H5 |
| GATE-E2 | Index IFCRELDEFINESBYPROPERTIES, the property sets and type-level psets. Report coverage per class (e.g. "180/196 IFCWALL") with a minimum set by the contract. Make the same change in Node, with parity cases. | L | high | none (STEP parse); parity in delivery-gate.mjs via tools/gate-check | 1 of N walls with FireRating → FAIL "1/N". All filled → PASS. The Node verdict is the same, and gate-check stays at 100%. | — |
| GATE-E3 | Pass the office pset mapping and the named export setup into IFCExportOptions. Until then, correct the dialog wording. | M | high | `IFCExportOptions.AddOption("ExportUserDefinedPsets","true")` / `("ExportUserDefinedPsetsFileName", path)` (depends on the exporter version; verify on 2024–2026) | With the COBie fields as Revit parameters on aster-tower, the required psets pass, and a re-publish keeps 168/168 COBie. | P1-11 |
| GATE-E4 | Certificate v3 records the view, options, Revit build, Sentinel version and ledger receipt. require_georeference: true becomes a failure, and a template default location counts as not georeferenced. Change C# and Node together. | M | med | `Document.SiteLocation`, `ProjectLocation.GetProjectPosition` | The JSON names "{3D}" and the options. A default location FAILs in both gates and passes once the site is set. | — |
| GATE-E5 | Reword PASS as "contract PASS — IDS not checked here (Governed Publish judges ids@n)", or run the IDS through the referee without registering. | S | med | none | The dialog on Aster names contract@n and either the ids@n verdict or the "not checked" line. | — |

#### 3.2.6 Family Health ▸ Sanitize .rfa (`Commands.Phase2.cs:9-40`)
**What it does.** Opens one .rfa and checks four things:
- top-level solids (budget 150);
- nested CAD;
- '{org}_Description';
- type names.

If it passes, the family is loaded into the active project with overwrite = true. No ledger row is written.

**Status:** PARTIAL.
- Only the refusal path ran live (Session C, 2026-07-28, before the office-agnostic change).
- Pass-and-load has not run (SIM run:46; blueprint:391, :1156).

| Kind | Finding | Evidence |
|---|---|---|
| bug | The solid count never recurses into GeometryInstance, so nested geometry is missed. Session C read "Solids: 0" on a rich sample family. | Workflow/FamilySanitizer.cs:71-79; Session C finding 3 |
| gap | The required parameter and the 150-solid budget are hard-coded, not taken from the office standard. Session C found this blocking loads on another standard. | FamilySanitizer.cs:26-28; Session C finding 2 |
| honesty | With no office code, the parameter check is skipped and the family "passes" and is loaded. Only the Doctor log says so. | FamilySanitizer.cs:49-53, :92-94; Commands.Phase2.cs:26-27 |
| bug | Loads with overwriteParameterValues = true and no prompt. An existing family's type values are silently overwritten. The comment promises an "explicit override" that does not exist. | FamilySanitizer.cs:9, :50-53, :116-123 |
| bug | The target is the document active when the job runs. The same bug was found live in the gate (Session C finding 7) and fixed there, but not here. | FamilySanitizer.cs:48; Session C finding 7 |
| reliability | The type-name check can refuse a family whose only type is the unnamed default. Heal ignores this check, so the same family can be "Clean" in Heal and refused here. | FamilySanitizer.cs:111-113 vs FamilyProcessor.cs:59-78 |
| gap | One file at a time: no folder batch, report file or ledger row. | Commands.Phase2.cs:9-40 |
| gap | No checks for nesting depth, file size, line styles, category, the office Family name rule, or an upgrade on open. | FamilySanitizer.cs:69-114 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| SAN-E1 | Recurse into GeometryInstance. Count nested instances and depth. Add file size and the counts of parameters, formulas and types. | M | med | `GeometryInstance.GetInstanceGeometry`, `FamilyManager.Parameters` / `FamilyParameter.Formula`, `FileInfo` | rac_advanced_sample_family reports more than 0 solids, and a planted 3-level nest reports depth 3. | MH-FAM-02, MH-FAM-03 |
| SAN-E2 | Read the required parameters (with GUIDs), the budget and the allowed categories from an office artefact, and name that source. With no standard, say "not checked". | S | high | `FamilyManager.Parameters`, `FamilyParameter.IsShared` / GUID | On Aster, a family missing AST_Discipline is refused and the parameter is named. An unbound project reads "parameters not checked". | — |
| SAN-E3 | Audit a whole folder with progress, Cancel and a CSV report. Load nothing until "Load passed…", with overwrite = false and the document fixed at command time. | M | high | `Application.OpenDocumentFile`, `Document.Close(false)`, `Document.LoadFamily(string, IFamilyLoadOptions, out Family)`, ExternalEvent | A 50-file folder gives a 50-row CSV. The project's family count is unchanged until Load, and an existing family keeps its type values. | — |
| SAN-E4 | Run NamingProposer on the family name, and post a family_sanitize row. | S | med | none | "Door-Passage-Single" shows a Family-rule verdict, and /audit?entity_type=family_sanitize returns the run. | — |

#### 3.2.7 Family Health ▸ Heal Loaded Families (`Commands.Phase2.cs:195-236`)
**What it does.** Runs as one job pinned to the document:
1. Opens every editable family with EditFamily.
2. Families with too many solids or with CAD are marked "needs a human".
3. A missing '{org}_Description' is added from a %TEMP% SP file as a Text type parameter, and the family is reloaded.
4. Posts one family_heal row.

**Status:** LIVE-PROVEN.
- B8 (SIM run:378): 222/222 healed, ledger #792 (machine token).
- SIM run:47: 212/212.
- Session C: 194/194.
- A signed-in family_heal row is allowed since B16, but no heal has been drilled signed in.

| Kind | Finding | Evidence |
|---|---|---|
| bug | The injected "shared" parameter comes from a per-machine %TEMP% file. Its GUID does not match the office parameter of the same name, so two users can create same-name parameters with different GUIDs. Schedules and tags bound to the office GUID miss the value. | Workflow/FamilyProcessor.cs:99-126; Workflow/HealRecord.cs:13-19; SIM run:378 |
| ux | Not silent: native warnings pop up once per family (about 15 clicked through in Session C). | Session C finding 9; FamilyProcessor.cs:71, :108-128; FailureInterceptor.cs:19-24 |
| ux | No preview, confirmation, progress or Cancel. One job reloads 222 families on the UI thread, each reload is its own undo step, and there is no single undo. | FamilyProcessor.cs:31-93; Commands.Phase2.cs:204; B8 |
| gap | Always Text, type-level, under Identity Data, whatever the office defines. | FamilyProcessor.cs:110-126 |
| honesty | The effect is invisible: no rule measures family parameters, so 194 heals moved nothing. No before/after counts. | Session C findings 10 and 11; Commands.Phase2.cs:225-232 |
| honesty | With no office code, every simple family is reported and ledgered as "✓ Clean". | FamilySanitizer.cs:92-94; FamilyProcessor.cs:68-78; Commands.Phase2.cs:212, :221; SentinelPanelViewModel.cs:97 |
| reliability | Only ApplicationException is caught per family. An IO error aborts the job: families already healed stay reloaded, but no dialog appears and no row is written. | FamilyProcessor.cs:80-84, :100-105; RevitEventHub.cs:45-51 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| HEAL-E1 | Take the GUID, data type, group and instance/type from an office artefact or the Project Setup SP file. With no office definition, refuse with "needs a human". | M | high | `Application.OpenSharedParameterFile`, `ExternalDefinition.GUID`, `FamilyManager.AddParameter(ExternalDefinition, group, bool)` with the existing #if split (GroupTypeId 2024+ / BuiltInParameterGroup before; SpecTypeId 2022+ / ParameterType 2021) | Heal on two machines: the parameter's GUID equals the office GUID on both, and the project has one SharedParameterElement with that name. | — |
| HEAL-E2 | A dry run lists the families that will change. Then pick one of two apply modes, because a TransactionGroup cannot outlive its event call. Option A: one TransactionGroup inside a single job, with progress and Cancel between families. Option B: chunked Raises, one undo per chunk. | M | high | `TransactionGroup.Start` / `Assimilate` (within one ExternalEvent call), `Document.EditFamily`, `LoadFamily`, WPF Dispatcher | On Demo, the preview lists N families and Apply heals exactly N. One Ctrl+Z undoes all of them (option A). Cancel at 50 leaves 50, and the report says 50. | P1-7 |
| HEAL-E3 | During a heal, delete warnings (never errors), count them, and report them by type. | S | med | `Application.FailuresProcessing`, `FailuresAccessor.DeleteWarning`, `FailureHandlingOptions.SetFailuresPreprocessor` | The Golden Nugget heal shows 0 dialogs, and the report says "15 geometry-constraint warnings suppressed". | R-08, P1-9 (share the handler with BG-3) |
| HEAL-E4 | Before/after type and instance counts per category. Add a family-parameter completeness rule (needs SCAN-E1). Say "not checked" instead of "Clean" when there is no office code. | S | med | FilteredElementCollector counts | Counts are identical before and after, and the new domain in Scan Now drops by the healed count. | — |

#### 3.2.8 MEP Openings (`Commands.Phase2.cs:61-161`)
**What it does.**
1. Intersects linked DirectShapes and MEP curves with host walls, floors and framing.
2. Merges hits within 150 mm.
3. Reconciles tracked voids by 500 mm proximity (moves them or marks them Orphaned) and commits.
4. Then asks whether to place Generic Model voids or export one BCF topic.

**Status:** BUILT-NOT-PROVEN (SIM run:56; TESTING_PROTOCOL.md:561; B11 lists "MEP voids" as not counted, SIM run:499).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Reconcile commits moves and Orphaned marks before the user sees anything. Cancel in the next dialog does not undo them. | Engine/MepVoidManager.cs:196-231; Commands.Phase2.cs:72, :87-105 |
| bug | With the MEP link unloaded, or no link at all, every tracked void is marked Orphaned and committed. | MepVoidManager.cs:73-74, :211-219 |
| gap | Voids are unhosted points at the centroid: no size, rotation or shape. The family is the first one named "*Void*". This fails the protocol's own "sized sanely, none floating" criterion. | MepVoidManager.cs:252-271; TESTING_PROTOCOL.md:561 |
| bug | Detection, reconcile, placement and BCF export act on the active document, not the captured one. | MepVoidManager.cs:174, :243; Commands.Phase2.cs:135 vs :67-72, :98 |
| reliability | Every DirectShape in a link counts as MEP, and every wall counts as a host, including partitions. Fittings, flex and insulation are excluded. | MepVoidManager.cs:27-36, :79-83 |
| perf | Nested loops with no spatial filter, on the UI thread, with no progress or Cancel. | MepVoidManager.cs:59-121 |
| reliability | Voids are paired to hits by proximity only. MepIds are collected but never stored. | MepVoidManager.cs:42, :211-213, :268-271 |
| gap | No ledger row. One BCF topic for all hits (capped at 20 lines), chosen through the folder hack. | SIM run:499; Commands.Phase2.cs:120-147 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| MEP-E1 | Run the Session E drill. Detection becomes read-only. Moves and orphans are shown first and applied on confirm in one TransactionGroup, and Cancel writes nothing. Pin the document. Refuse to orphan anything when a link is unloaded. | S | high | `TransactionGroup`, `Document.Equals`, `RevitLinkInstance.GetLinkDocument` / `RevitLinkType.IsLoaded` | Cancel leaves Undo empty, Confirm gives one entry, and an unloaded link orphans 0 voids. | — |
| MEP-E2 | Size voids from connectors or size parameters plus clearance. Orient them along the curve. Place them face-based with round or rectangular types. Set IfcBuildingElementProxy with PROVISIONFORVOID (IFC4 only; IFC2x3 needs a naming convention). | L | high | `Connector.Width` / `Height` / `Radius`, `LocationCurve`, `HostObjectUtils.GetSideFaces` / `GetTopFaces`, `NewFamilyInstance(Reference, XYZ, XYZ, FamilySymbol)`, `ElementTransformUtils.RotateElement` | Session E: each dimension is within ±1 mm of duct size + 2×clearance, none float, and the IFC4 export shows PROVISIONFORVOID. | — |
| MEP-E3 | Limit link DirectShapes to MEP categories and hosts to structural or configured walls. Query per host with ElementIntersectsSolidFilter in link space. Show progress with Cancel. | M | med | `ElementIntersectsSolidFilter`, `BoundingBoxIntersectsFilter`, `SolidUtils.CreateTransformed`, `WALL_STRUCTURAL_SIGNIFICANT` | An architectural IFC link gives 0 candidates, partitions give 0 voids, and the run time is recorded. | — |
| MEP-E4 | Store the MEP UniqueId or GlobalId on each void and reconcile by id first. Post mep_void rows. | M | med | ExtensibleStorage, `Element.UniqueId`, IFC_GUID | Move one duct: exactly one void moves. Delete one: exactly one is Orphaned. Three rows are on the ledger. | — |

#### 3.2.9 Naming Manager (`Commands.NamingManager.cs:17-133`)
**What it does.** Builds one row per family or type for the Family and Type rules. Each row has the current name, a proposal, a verdict and a count. "Rename ticked" runs one transaction that re-validates each name and checks uniqueness, writes the local audit, and posts one naming row. ⚡ Fix opens the review dialog for a single row.

**Status:** LIVE-PROVEN.
- B8 (SIM run:379): 1/1 renamed, #793.
- B16 (SIM run:664): #1093 under the verified e-mail.
- 99 of 142 proposed (SIM run:670).
- The 99-row batch was not run; that is the founder's decision (SIM run:671).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | For Family rules, NameSynth fills a missing enum token with the first alternative (e.g. "ARC") and marks the row Proposed. This breaks the proposer's rule that enum tokens are never defaulted. | Standards/NamingProposer.cs:65-66 vs :118-120; Workflow/NameSynth.cs:12-16, :44-47 |
| honesty | The ledger records the rename, not the saved model. 56 renames stayed on the ledger after the model was closed without saving (B18). Undo reverts the model but not the ledger. | SIM run:703; NamingManagerService.cs:201-211 |
| ux | After a rename, the pane keeps the old rows and the old % until Scan Now. | Commands.NamingManager.cs:80-108; RuleEngineHost.cs:177-179; SentinelUpdater.cs:38-60 |
| perf | Rows sit in a non-virtualized StackPanel. Each keystroke rebuilds every row. At rename time, every type is scanned per row and a regex is compiled per row. | UI/NamingManagerWindow.cs:25, :51, :67, :94-109, :113-115; NamingManagerService.cs:170, :216-225 |
| ux | "Select instances" uses only the first ticked row. Blocked duplicates have no merge action. | NamingManagerWindow.cs:59, :116; NamingProposer.cs:124-129 |
| gap | Family and Type only. View, sheet, level and workset names (411 and 412 of the Session C rows) can only be fixed one row at a time in the pane. | NamingManagerService.cs:85; SentinelPanelViewModel.cs:43-52; Session C |
| gap | No impact check: filters and key schedules that match old names break silently. Many template rows still need a human (34 of 142). | NamingManagerService.cs:153-213; SIM run:92 (F9), :670 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| NAME-E1 | Route Family rules through Recover and Skeleton. A missing enum becomes NeedsHuman with options, never Proposed. | S | high | none (pin the behaviour with tools/naming-check) | "Door-Passage-Single" under a DISC enum rule is "needs a human" with DISC choices, and naming-check gains that case. | — |
| NAME-E2 | Republish the scan after Apply. Mark the row "in model, not yet saved" and confirm it on save or sync. Post "reverted" on Undo. | M | high | `Application.DocumentChanged` (`GetTransactionNames`, `Operation == UndoOperation.TransactionUndone`), DocumentSaved / DocumentSynchronizedWithCentral | Rename 5: the pane rows drop at once. Ctrl+Z gives a "naming reverted" row. Closing without saving leaves the row marked "not saved". | — |
| NAME-E3 | "Merge into <existing>" for Blocked rows: change the instances' type, check filters and schedules, delete the duplicate, and write one naming.merged row. | M | high | `Element.ChangeTypeId`, `ParameterFilterElement.GetElementFilter`, `Document.Delete`, `TransactionGroup` | The 5 Blocked rows on aster-tower merge, the counts move to the target types, and one Ctrl+Z restores everything. | — |
| NAME-E4 | A virtualized DataGrid with headers, sort and multi-select, plus CSV export. Re-import goes through P2-7, not Excel. | M | med | none (WPF DataGrid, VirtualizingStackPanel) | On 3,000 types, filtering responds in under 100 ms, and the CSV count equals the rows shown. | P2-7 (no spreadsheet round trip, blueprint:698, U18) |
| NAME-E5 | Add View, Sheet and Level rules. Before renaming, list the filters and schedules that reference the old name. | L | med | `View.Name`, `ViewSheet.SheetNumber`, `ParameterFilterElement.GetElementFilter`, `ScheduleDefinition.GetFilter` | On the Golden Nugget copy, a batch renames 20 views with one ledger row, and a filter on a type name is listed before the rename. | — |

### 3.3 Publish panel, setup, account and ROI

#### 3.3.1 Governed Publish, with Auto-Publish and the CDE-01 Sync Guard (`Commands.GovernedPublish.cs`)
**What it does.**
1. Exports the whole model to a temporary IFC in the contract's schema, filtered by Default3DView.
2. Runs the gate.
3. Extracts elements on the API thread.
4. Blocks for up to 120 s while POST /cde/:key/propose runs.
5. On accepted or recorded: registers a wip version and stages the IFC in the outbox.
6. On reject: opens one BCF topic per failing requirement.

Auto-Publish runs the same path after a save or sync, throttled to one run per 15 s. CDE-01 judges the central file name after a sync.

**Status:** PARTIAL.
- B10 (signed out, current code): a reject on aster (#845/#846); a "recorded — not judged" publish on b10-publish (#865–#871); auto v2 (#878) and v3 (#887).
- B10 also says "✓ ACCEPTED never appeared". The only accept (SIM Act 3, audits 640→657) ran the older code.
- B15: the gate row got 403 when signed in.
- CDE-01: no outcome observed (memory sentinel-2026-09-25-revit-standards). aster-tower v3 came from the CLI intake (B30 #1187), not from Revit.

| Kind | Finding | Evidence |
|---|---|---|
| perf | The whole-model export and a referee wait of up to 120 s run on the UI thread (`Task.Run(...).GetAwaiter().GetResult()`), with no progress or Cancel. Auto-Publish exports inside a hub job, so Revit freezes a few seconds after a save without warning. | Commands.GovernedPublish.cs:52-66; GovernedNotify.cs:30; AutoPublish.cs:92-93; B10 (~4 min export; "UI paused ~2¾ min per auto export") |
| bug | The "whole model" is filtered by an arbitrary view: {3D}, or else the first View3D the collector finds. On workshared models that is usually a per-user view, with its section box, hidden categories and phase. | PlatformExporter.cs:61-62, :88-102; Publisher.cs:168; App.cs:307; B17 ("{3D - yazan.hKNTHU}") |
| reliability | The export Transaction is committed, not rolled back. That leaves an undo step and a modified document right after the save. On a copied-central local it caused a second save and a second, unrequested auto run. | PlatformExporter.cs:64-68; B10 (gate rows #862, #863) |
| bug | Signed in, the gate row is refused (403). The proposal then carries no gate_row_id, and a hold row cannot be written. | GovernedNotify.cs:74-76; BcfConfig.cs:30; Publisher.cs:190, :224; B15; memory sentinel-2026-09-28-h4-revit-sign-in |
| honesty | CDE-01 passes any name that matches a hard-coded office pattern before it consults naming@n. "AST_ASTR26_Aster Tower" passes CDE-01, but Governed Publish rejected the same name under naming@1. | CdeSyncGuard.Judge.cs:30-31; OrgNames.cs:42-43; CdeSyncGuard.cs:11-12; B10 |
| honesty | The code says a sync cannot be stopped. The API documents DocumentSynchronizingWithCentral as cancellable. | CdeSyncGuard.cs:12-14; App.cs:200-202; [revitapidocs](https://www.revitapidocs.com/2025/20644173-bd8c-3598-4ac1-4c874679f8e8.htm) |
| gap | The container name can only come from the central file name, so a central that is not ISO-named cannot publish from Revit. | Publisher.cs:32-39, :136; B10; B30 (#1187); memory sentinel-2026-09-26-publish-5a |
| ux | All output is in TaskDialogs. The "no org" warning is an OK-only modal. A reject lists at most 12 failures as plain text. The user is told to run "npm run bcf:serve". Signed out, the actor is "Revit". | Commands.GovernedPublish.cs:61; Publisher.cs:376, :364, :221; ProposalResult.cs:18, :122; SignInDialog.xaml.cs:36 |
| gap | Every auto run registers a new version even when nothing changed. | Publisher.cs:220-224; AutoPublish.cs:27, :56; B10 (v2 #878, v3 #887) |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| GP-1 | Show progress in a window on its own STA thread (the UI thread is busy inside Export). Cancel through the ProgressChanged handler, and dismiss the confirmation that follows with DialogBoxShowing. Whether the exporter reports progress and honours Cancel must be measured. The referee wait gets a CancellationToken. Auto-Publish announces itself first. | M | high | `Application.ProgressChanged`, `ProgressChangedEventArgs.Cancel()`, `UIApplication.DialogBoxShowing`, ExternalEvent; `CancellationTokenSource` | On Demo, the window shows at least 3 updates. Cancel either stops the export within 5 s (leaving no temp file and no rows), or the drill records that it is ignored. An auto run logs "exporting" before the pause. | — |
| GP-2 | Drop FilterViewId: a null filter exports the whole model, as the code's own comment says. Roll the Transaction back after Export. | S | high | `IFCExportOptions` (no FilterViewId), `Transaction.RollBack` | On the aster local, the manifest element count equals the exportable count. After a publish, IsModified is false and Undo shows no entry. One save gives exactly one auto run. | — |
| GP-3 | Run CDE-01 in DocumentSynchronizingWithCentral with the pure Decide() and the cached naming@n. Offer "Sync anyway / Cancel" in warn mode; call Cancel() in reject mode. Remove the org-pattern short-circuit. | S | high | `DocumentSynchronizingWithCentral` + `DocumentSynchronizingWithCentralEventArgs.Cancel()` | Before the sync, CDE-01 names "AST_ASTR26_Aster Tower" as failing naming@1. Cancel leaves no new central history entry. A compliant name syncs with no dialog. | — |
| GP-4 | A "Container name" field in Project Setup, stored in Extensible Storage and checked live with ContainerNameJudge. Publisher uses it before the central path. | S | high | ExtensibleStorage (existing SettingsManager schema), ProjectInfo parameters | aster-tower publishes from Revit as ASTR26-AST-ZZ-XX-M3-A-0001.ifc without renaming the central, and the container gains a new version. | — |
| GP-5 | A result window built from ProposalResult.ElementFailures, grouped by requirement. Clicking a row selects the element. Copy, "Open in web" and "Open BCF Issues". Add "Check only" (register null, raiseBcf false). | M | high | `Selection.SetElementIds`, `UIDocument.ShowElements` via ExternalEvent; owned WPF window | The aster reject lists the 10 walls missing LoadBearing (B10), and clicking one selects it. "Check only" writes one proposal row, no topic and no version. | P1-11 |
| GP-6 | Hash the extracted element payload and skip register when it is unchanged. | S | med | none | Two saves 20 s apart with no edits produce one version; an edit plus a save produces v(n+1). | — |

#### 3.3.2 Publish ▸ Publish Sheets (`Commands.PublishSheets.cs`)
**What it does.** Renders every sheet to a 2400 px PNG and, from 2022, a PDF. Makes one blocking /propose per PDF and writes manifest.json.

**Status:** BUILT-NOT-PROVEN. It has never been deployed or run in Revit (SIM matrix "not run"; B27 owed; memory sentinel-2026-09-29-2d-item5; blueprint:662).

| Kind | Finding | Evidence |
|---|---|---|
| gap | The container name is the bare sheet number + .pdf, so a 7-field naming@n rejects every sheet and each one is held. | Commands.PublishSheets.cs:49; B27 driver ("A-101.pdf … got 2", #1177/#1178) |
| bug | The file name uses the sanitized sheet number; the container uses the raw one. "/" or ":" makes them differ. | Commands.PublishSheets.cs:49 vs SheetExporter.cs:171 |
| honesty | The tooltips still say "PNG" and "no version, no verdict", but the tool now proposes, registers and records MIDP. | App.cs:308-311 vs Commands.PublishSheets.cs:12-18, :50-52 |
| perf | Everything runs on the API thread: two exports per sheet, then a blocking /propose per sheet with a 120 s timeout. A hung bridge can cost 120 s per sheet. | Commands.PublishSheets.cs:45-52; GovernedNotify.cs:30 |
| gap | No sheet selection and no skip for unchanged sheets. Every run re-registers every sheet. | SheetExporter.cs:62-66; Commands.PublishSheets.cs:46-52 |
| honesty | Says "registered in the CDE", but the bytes stay on this PC. Upload is H3. | Commands.PublishSheets.cs:74; SheetExporter.cs:38-45; memory sentinel-2026-09-29-owed |
| reliability | The folder is keyed by doc.Title, so each workshared local gets its own folder (F12). The folder is deleted before export, so a failed run removes the sheets already on the web. | SheetExporter.cs:54, :59; B17; SIM F12 |
| gap | PDFExportOptions sets only Combine and FileName. Revit 2021 makes images only, and those are never proposed. | SheetExporter.cs:172, :74-78; Commands.PublishSheets.cs:46 |
| ux | Signed out, the actor is "Revit". | Commands.PublishSheets.cs:50; SignInDialog.xaml.cs:36 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| PS-1 | Build ISO container names with SetNamingRule from sheet and Project Information parameters, or read them from a sheet parameter. Use one sanitized string for file and container. Judge each name locally with ContainerNameJudge before any /propose. | M | high | `PDFExportOptions.SetNamingRule` + `TableCellCombinedParameterData` (2022+; 2021 has no PDF export), `ViewSheet.get_Parameter` | On aster under naming@1, three filled sheets register as ASTR26-AST-ZZ-00-DR-A-0100.pdf and similar with "naming ok". A sheet with a missing field writes no row. | — |
| PS-2 | A sheet picker preset from ViewSheetSets and the last manifest, with a "revision changed" filter based on SHEET_CURRENT_REVISION. | M | high | `FilteredElementCollector(ViewSheetSet)`, `ViewSheetSet.Views`, `SHEET_CURRENT_REVISION` | Picking 2 of 15 gives 2 PDFs and 2 rows. After a revision bump, the filter ticks only that sheet. | — |
| PS-3 | Send the proposals from a Task with a short connect timeout and one "bridge unreachable" stop. Show per-sheet status. | S | med | ExternalEvent; HttpClient with a CancellationToken | A 50-sheet run shows per-sheet status. With the bridge stopped, it ends in under 10 s with one line. | — |
| PS-4 | Honest tooltips (PDF, proposal, verdict, MIDP). The summary says "kept on this PC — not uploaded" until H3. | S | med | `PushButtonData.ToolTip` / `LongDescription` | The ribbon tooltip on 2024 shows the new text. The summary contains "not uploaded" when the manifest has no upload id. | H3, P2-6 (needs this live run) |

#### 3.3.3 Publish ▸ Publish Views (`Commands.PublishViews.cs`)
**What it does.** A grouped checkbox tree of views, pre-ticked from selection.json. Renders each ticked view to a 2400 px PNG with a manifest. It is outside governance.

**Status:** BUILT-NOT-PROVEN (SIM matrix; B27; blueprint:662).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | A view that fails to render is dropped with no reason given, and the dialog says "Published N". | ViewExporter.cs:141-144, :59; Commands.PublishViews.cs:69-72 vs SheetExporter.cs:153-156 |
| ux | Offers schedules and reports. No search, no "on sheets" filter, no named sets. | Commands.PublishViews.cs:22-27, :38-41; ViewPickWindow.cs:43-49, :131 |
| reliability | The folder and the remembered ticks are keyed by doc.Title, so they are separate for each local. | ViewExporter.cs:36, :95-96; B17; SIM F12 |
| reliability | The folder is deleted before export. | ViewExporter.cs:41-43 |
| gap | PNG only. Served only by a bridge on the same PC (H3). No ledger row. | ViewExporter.cs:121-131; memory sentinel-2026-09-29-owed |
| perf | Renders one after another on the UI thread, with no progress. | ViewExporter.cs:55-68; Commands.PublishViews.cs:61 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| PV-1 | Name skipped views with the reason. Offer only renderable types. | S | med | `Document.ExportImage(ImageExportOptions)`, ViewType filter, `View.CanBePrinted` | "N of M published — <view>: <Revit message>", and the manifest count equals the PNG count. | — |
| PV-2 | Named sets stored in the model (UniqueIds), plus search and a "placed on sheets" filter. | M | med | ExtensibleStorage on DataStorage; `ViewSheet.GetAllPlacedViews` | User A saves "Coordination" and syncs; user B sees the same ticks. Searching "L04" narrows the list. | — |
| PV-3 | Export to a temp folder and swap it in on success. Key the folder by project key + container name. Apply the same to sheets. | S | med | `Document.GetWorksharingCentralModelPath` | Aborting midway leaves the old manifest in place. Two locals publish into one folder. | — |

#### 3.3.4 Standards ▸ Project Setup (`Commands.Workflow.cs`, `UI/SettingsDialog`)
**What it does.** A modal dialog that binds the document to a web project key (taken from GET /cde/projects, or typed), with a project code, a template path and the Ghost folder. It writes Extensible Storage through the hub, then reloads the ruleset.

**Status:** LIVE-PROVEN (SIM matrix: pass, F23; B10 re-bound and back; F47 fixed in 22670e4).

| Kind | Finding | Evidence |
|---|---|---|
| reliability | Save queues the write and closes at once. A failure (read-only, element borrowed) goes only to the Doctor log. The write targets whichever document is active when it runs. | UI/SettingsDialog.xaml.cs:169-190, :173; SettingsManager.cs:114-120; RevitEventHub.cs:45-50 |
| gap | Binding or re-binding writes no ledger row. The key spreads to the whole team on the next sync. | SettingsDialog.xaml.cs:169-190 |
| ux | A typed key is never checked. A typo binds to a project that does not exist. The unreachable-bridge hint suggests "demo". | SettingsDialog.xaml.cs:104, :109-114; SIM F23 |
| dead-code | The .rte template path is saved but never read; the tooltip still advertises it. | SettingsManager.cs:19, :51; SettingsDialog.xaml:17-23; SettingsDialog.xaml.cs:25, :159, :179; App.cs:320 |
| gap | Bridge URL, token and Supabase settings have no UI. A malformed bcf-config.json silently becomes localhost:4100. | BcfConfig.cs:7-11, :32-50 (catch at :45); memory sentinel-2026-09-25-revit-standards |
| ux | "Not bound" refusals give no link to Setup. | Commands.GovernedPublish.cs:33-37; Commands.PublishSheets.cs:26-30; Commands.PublishViews.cs:32-36 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| PSU-1 | Resolve the key before saving and show the project name, office and role. Refuse unknown keys. Record "bound to <key> (was <old>)". Needs an allowed entity type on the bridge. | M | high | ExtensibleStorage; ExternalEvent | Binding the aster local to b10-publish and back gives two rows with the e-mail as actor. "aster-towr" is refused. | — |
| PSU-2 | Save inside Execute, after the dialog closes, on the command's document. Report "bound to X" or "not saved — <reason>". | S | med | Transaction in `IExternalCommand.Execute`; `WorksharingUtils.GetCheckoutStatus(doc, id, out owner)` | With the DataStorage borrowed, Save names the owner. A normal save shows "bound to aster-tower". | — |
| PSU-3 | A Connection tab: URL, token presence, Supabase address, anon key and proxy, with a Test button. A malformed config is reported by line. | S | high | none (WPF, HttpClient) | A wrong URL shows "bridge unreachable at <url>". A corrupted file shows "line N: <error>". No tool says "localhost:4100". | — |
| PSU-4 | Add an "Open Project Setup" link to the not-bound refusals. Remove or wire up the template field. | S | med | `TaskDialog.AddCommandLink` | Governed Publish on an unbound Project1 offers the link. After Save, it passes the binding check. | — |

#### 3.3.5 Standards ▸ Sign in (`UI/SignInDialog`, `Coordination/UserSession.cs`)
**What it does.** Supabase password grant. The refresh token is DPAPI-encrypted in %LOCALAPPDATA%. After sign-in, BcfConfig.ServiceToken sends the person's bearer.

**Status:** LIVE-PROVEN (B15; B16 #1093; B17; docs/handbook/05-capability-status.md).

| Kind | Finding | Evidence |
|---|---|---|
| bug | A refresh that fails on the network (not a refusal) sets the session to null for the rest of the process. Calls then fall back silently to the PC token, and writes carry "Revit". | UserSession.cs:107-111, :161, :83-89; BcfConfig.cs:30; SignInDialog.xaml.cs:36 |
| bug | Signing in loses gate rows (403) until H5 lands. | B15; memory sentinel-2026-09-28-h4-revit-sign-in |
| ux | The Supabase call blocks the UI thread for up to 8 s. "Signing in…" is never painted, and there is no Cancel. | SignInDialog.xaml.cs:49-54; UserSession.cs:29 |
| ux | Hidden inside Standards ▾ with the same icon as Project Setup. The signed-in state is not shown on the ribbon or the pane. | App.cs:319-322; SettingsDialog.xaml.cs:21-23 |
| gap | Works only after supabaseUrl and anon key are hand-edited into the config. | SignInDialog.xaml.cs:22-26; BcfConfig.cs:47-48; memory sentinel-2026-09-28-h4-revit-sign-in |
| gap | Password only: no SSO, magic link, MFA or "forgot password". | UserSession.cs:54-63 |
| perf | The refresh (8 s HTTP + 10 s mutex) runs inside the ServiceToken getter, even for UI-thread callers. | UserSession.cs:78-79, :84-89, :96-98; SettingsDialog.xaml.cs:69-70 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| SI-1 | Keep the stored session after a network blip and retry it. While a session file exists, never fall back to the shared token; fail with "session not refreshed — retrying" and show that in the pane. | S | high | none (pin with tools/session-check) | Block the network near token expiry, then restore it: the next rename's actor is the e-mail, and no row says "Revit". | — |
| SI-2 | An Account button whose label changes at runtime ("Signed in: yazan…" or "Sign in"), plus a signed-in line in the pane. | S | high | `RibbonItem.ItemText` / `ToolTip` set at runtime; a new RibbonPanel | The label changes after sign-in and sign-out without a restart. | P1-8 (same BuildRibbon pass) |
| SI-3 | Await sign-in off the UI thread with Cancel. Move the refresh into a background refresher. | S | med | none (WPF async) | With Supabase slowed, the window can be dragged, and Cancel returns within 1 s with no session.bin. | — |
| SI-4 | Browser sign-in with PKCE through a loopback HttpListener, so SSO and MFA match the web. | M | med | none (`HttpListener`, `Process.Start`) | The browser flow creates session.bin, a rename carries the e-mail, and the dialog has no password field. | — |

#### 3.3.6 ROI Dashboard (`Commands.Phase2.cs`, `Engine/RoiReport.cs`)
**What it does.** Reads up to 5 × 1000 ledger rows for each of delivery_gate, naming and family_heal, blocking Revit while it reads. Prices the counts with roi@n. Lists what is not counted.

**Status:** LIVE-PROVEN (B11: 11 gate runs out of 17 rows; money shown only after roi@1, 330.00 EUR at 90 EUR/h).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Every delivery_gate row with a verdict is priced, whatever its source. Auto-publish reruns and unrequested duplicates add money, so ROI grows with how often people save. | RoiReport.cs:31-36; GateLines.cs:92-95; Publisher.cs:190; B10 (Demo #862, #863) |
| reliability | Offset paging over a newest-first list can double-count past 1000 rows. | GovernedQuery.cs:238-260; memory sentinel-2026-09-26-publish-5a |
| perf | Blocks for up to 15 sequential GETs of 4 s each, with no progress. | Commands.Phase2.cs:52; RoiDashboard.cs:61-69 |
| ux | Static text: no period, per-person breakdown, refresh or export. | RoiDashboard.cs:19-51; RoiReport.cs:113-127 |
| gap | Three kinds only. Auto-fix, Doctor, CDE intercepts, MEP voids, BCF export, clash views and fix-in-place are all "not counted". | RoiReport.cs:110-111 |
| ux | A manager's report placed on Standards & Build, away from the Publish runs it prices. | App.cs:339-340 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| ROI-1 | Split gate rows by source. Price only "revit" and "check" runs, at most once per sha256. Show auto-publish runs on their own line, not priced. | S | high | none (pin with tools/roi-check) | On Demo the split equals SQL grouped by new_value->>'source', and #862/#863 appear under auto-publish, not priced. | P1-9 |
| ROI-2 | A date range, per-actor and per-kind breakdowns (the route already has since, until and actor), and Copy CSV. | M | med | none | The last 7 days equal SQL, the per-actor totals add up, and the CSV opens with the same numbers. | — |
| ROI-3 | Pin "until" at the first read. Open the window at once and fill it from a Task, reading the three kinds in parallel. | S | med | none (WPF Dispatcher) | A 2500-row fixture with rows inserted during the read counts the same twice. With 3 s per GET, the window appears within 1 s. | — |

#### 3.3.7 Add-in shell (ribbon, settings, install, versions)
**What it does.** Registers the pane, the rule engine, RevitEventHub, the document events, the FailureInterceptor and 29 commands. It targets net48 up to 2024, net8 for 2025/2026 and net10 for 2027. It is deployed per user.

**Status:** PARTIAL.
- The ribbon ran live on 2024 only (B10).
- CI builds 2025 and 2026 (ci.yml:40-52), but those versions have never run in Revit.
- The 2021, 2022 and 2027 DLLs are dated 2026-08-06, and 2023 is dated 2026-09-17: all older than the recent phases.

| Kind | Finding | Evidence |
|---|---|---|
| reliability | "Builds for 2021–2027" is not true of the current code. Version-specific paths have not been compiled for 2021–2023 or 2027 since they changed. INSTALL.md, build.ps1 and install.bat ask for SDK 8, but the 2027 target needs .NET 10. | ci.yml:44-46; bin/Release dates; SheetExporter.cs:74-78; SettingsDialog.xaml.cs:129-143; INSTALL.md:4-6, :13-15; build.ps1:4; install.bat:4, :18; Sentinel.csproj:16-18 |
| reliability | The net48 builds load System.Text.Json 8 and PdfPig into Revit's shared AppDomain with no isolation. No conflict has been seen yet. The manifest does not opt into 2026 isolation. | Sentinel.csproj:47, :49; Sentinel.addin:1-11 |
| gap | Build-from-source only: needs the .NET SDK, installs per user, and the DLL is unsigned, so the prompt appears after every rebuild. No version is stamped. The default target is 2026. INSTALL.md describes a 3-button ribbon. | install.bat:13, :23; Sentinel.csproj:8; INSTALL.md:18-19; memory sentinel-2026-09-28-naming-suggestions; B10 deploy row |
| honesty | The manifest vendor is the pilot office ("BDS", "Badran Design Studio — Sentinel"), which Revit shows on every external install. | Sentinel.addin:8-9 vs OrgNames.cs:6-8 |
| ux | Icons are reused ("gate" ×2, "family" ×3, "setup" ×2, "ghost" ×5). A one-time setup is a large button. Tooltips run to about 200–480 characters, with no LongDescription or F1 help. No availability class, so every button is live in the family editor. contact_sheet.png is deployed. | App.cs:274-277, :291, :293-301, :307, :319-322, :329-339; grep; Sentinel.csproj:58 |
| perf | Network waits block the UI: Governed Publish up to 120 s, ROI up to 15×4 s, gate and Annotate 4–6 s. A full ScanFull runs on every project switch and every sync. | Commands.GovernedPublish.cs:66; Commands.Phase2.cs:52; Commands.IfcGate.cs:31, :121; Commands.Annotate.cs:30; App.cs:190, :198 |
| dead-code | PlatformExporter.Log has no caller. The Doctor log lives only in memory and its header is mislabelled. Startup failures show raw stack traces. | PlatformExporter.cs:28-38; SentinelPanelViewModel.cs:91-101; AutoPublish.cs:48, :76, :119; RevitEventHub.cs:49; App.cs:40-107 |
| gap | All UI text is hard-coded English, with no .resx. The Arabic rule message is shown beside the English whatever the locale. | grep (no .resx, no LanguageType); RulesetWindow.xaml:102 |
| ux | About a dozen owned windows open CenterScreen (the monitor with the cursor); only DialogOwner callers open over Revit. Cosmetic. | Commands.Workflow.cs:18, :31, :44; Commands.Phase2.cs:55, :185; UI/DialogOwner.cs:9-25; [WindowStartupLocation](https://learn.microsoft.com/en-us/dotnet/api/system.windows.windowstartuplocation) |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| SH-1 | A .bundle with one ComponentEntry per year and an Authenticode-signed DLL (the certificate cost is the founder's decision). AssemblyInformationalVersion = git sha. No SDK needed to install. A neutral vendor. An About line. | M | high | add-in manifest / PackageContents.xml | On a clean account without the SDK, Revit 2024 starts with no unsigned prompt, and About shows the sha that matches HEAD. | — |
| SH-2 | Add 2021–2024 (net48 targeting pack) and 2027 (setup-dotnet 10.0.x) to the CI matrix. Add ManifestSettings UseRevitContext=False for 2026+. Binding redirects on net48. | S | high | RevitAddInManifest ManifestSettings (2026+) | One CI run produces 7 DLLs. Revit 2026, with another add-in that ships an older System.Text.Json, loads Sentinel without a FileLoadException. | — |
| SH-3 | An Account panel. Review Flag moves under Setup, ROI under Reports. Distinct icons, a short ToolTip plus LongDescription and ContextualHelp, and IExternalCommandAvailability. Stop deploying contact_sheet.png. | M | med | `PushButtonData.LongDescription` / `ToolTipImage`, `ContextualHelp`, `AvailabilityClassName` + `IExternalCommandAvailability` | No duplicated icons on 2024. Publish buttons are grey in the family editor. F1 on Governed Publish opens its help. | P1-8 |
| SH-4 | A rolling log in %LOCALAPPDATA%\Sentinel\logs. Delete PlatformExporter.Log. Fix the Doctor header. "Copy diagnostics" gives versions, bridge URL and /health, the user and the last 200 lines. | S | med | none | After a restart the previous Auto-Publish lines are in the file, and the diagnostics include the DLL sha. | — |
| SH-5 | Move strings to .resx and pick the culture from Application.Language, starting with Arabic. | L | low | `Application.Language` (LanguageType) | Revit in Arabic shows translated labels, and English is unchanged. | — |

### 3.4 Standards & Build panel

#### 3.4.1 Standards ▸ Build Office System (`Commands.Standards.cs:26-57`)
**What it does.**
1. Reads the "golden" model: worksets, shared-parameter bindings, view templates, browser organisation and the type catalogue.
2. Exports the catalogue JSON.
3. Opens a review window with four actions: Build (into the active document plus staging ruleset@n+1), Save pack, ISO 19650 ✓, Send office snapshot.

**Status:** PARTIAL.
- Extract, review, snapshot and catalogue export ran live (SIM matrix: pass, snapshot audits 434/465/515/532; B7: 1239 types).
- Build and ruleset install have not run live (B5: 0 worksets and 0 rules from AST_Template.rte). Only harnesses cover them (ruleset-install-check 21/21, snapshot-check 21/21).

| Kind | Finding | Evidence |
|---|---|---|
| bug | Data types collapse to 8 tokens. Anything else (Material, URL, Currency, MultilineText…) is rebuilt as Text under the original GUID. With an office file configured, lookup is by name in group "Sentinel" only, never by GUID. | Standards/StandardsCompat.cs:24-34, :37-48, :50-72; StandardsBuilder.cs:170-178; StandardsPack.cs:112 |
| bug | Build writes the pack's definitions into the user's configured SP file (often the office network file). When none was set, the application is left pointing at Sentinel's file. A name match returns any GUID. | StandardsBuilder.cs:79-106 (restore guarded at :104), :137-159, :170-174 |
| gap | The main input is a template (.rte), which cannot be workshared, so worksets and the ruleset install do nothing. The workset list cannot be entered by hand. | GoldenModelExtractor.cs:117; B5 |
| ux | Build targets the model it just read, so every item reads "exists". The real flow (Save pack → open target → Apply) is hidden. A modal about the export pops over the window. | Commands.Standards.cs:51-54; App.cs:323-324 |
| ux | The type catalogue can only be installed with a Node CLI run from WebApp. | TypeCatalogExport.cs:53-57; B7 |
| gap | Categories are stored by localized name while GuidelineMatcher compares English keys, so a non-English Revit breaks guideline typing. Compat.MatchesCategoryKey exists and is not used. | GoldenModelExtractor.cs:66, :150; GuidelineMatcher.cs:389, :411, :451; ElementPlacementFactory.cs:155; StandardsBuilder.cs:181-192; Compat.cs:63-75 |
| gap | No object styles, patterns, text or dimension types, filters, project or global parameters, or title blocks. The 2-argument Insert drops the parameter group. A partly bound parameter is skipped rather than extended. The class comment is stale. | GoldenModelExtractor.cs:14-15 vs :31-32; StandardsBuilder.cs:114, :129-131 |
| reliability | Semver is never set, so each Save overwrites the last pack. A saved pack drops the type catalogue, so a later snapshot reports 0 types. | Commands.Standards.cs:247, :190-222; StandardsPack.cs:24; GoldenModelExtractor.cs:22-27; StandardsReviewWindow.cs:222-238 |
| reliability | Shared parameters are matched by name, so a project parameter with the same name is exported with a shared GUID, and duplicates share the last GUID. | GoldenModelExtractor.cs:133-145 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| BOS-1 | Store the exact data type and group. Look up by GUID first, and refuse a same-name/different-GUID or same-GUID/different-type clash with the reason. Bind with the original group, and ReInsert to extend categories. | M | high | `SharedParameterElement.Lookup(doc, Guid)`; `Definition.GetDataType()` (2022+) / `ParameterType` (2021); `GetGroupTypeId()` (2022+) / `ParameterGroup` (2021); `ExternalDefinitionCreationOptions(name, ForgeTypeId)` (2022+); `BindingMap.Insert` / `ReInsert` | Material, URL, MultilineText and Currency parameters rebuild on a blank model with the same GUID, type and group. A planted clash is listed as Failed and not bound. | — |
| BOS-2 | Build from a throwaway temp SP file. Always restore SharedParametersFilename, even when it was empty. | S | high | `Application.SharedParametersFilename`, `OpenSharedParameterFile`, `DefinitionFile.Groups` | The setting is identical before and after, and the office SP file's SHA-256 is unchanged. | — |
| BOS-3 | "Install on office" for leads: PUT the type catalogue through GovernedNotify.InstallArtefact, off the API thread. | S | high | existing type harvest on the API thread; HTTP off-thread | The window shows type_catalog@2 · office · <sha>, and GET returns the same sha without a CLI run. | — |
| BOS-4 | Add line and fill patterns, text and dimension types and filters as transfer items with New only or Overwrite. Object-style subcategories are read and written through the Category API. Needs the golden model open (or APS-4). | L | high | `LinePatternElement`, `FillPatternElement`, `TextNoteType`, `DimensionType`, `ParameterFilterElement`, `ElementTransformUtils.CopyElements` + `CopyPasteOptions.SetDuplicateTypeNamesHandler`, `Category.SubCategories` / `GetLineWeight` / `SetLineWeight` / `LineColor` / `SetLinePatternId` | From AST_Template into a blank model, 20 patterns and 10 filters arrive. New only keeps an existing differing pattern; Overwrite replaces it. | — |
| BOS-5 | Store the BuiltInCategory next to the name in catalogue rows and bindings, and compare on it. | S | med | `Category.BuiltInCategory` (2023+) or `(BuiltInCategory)Category.Id` value (2021–2022); `Category.GetCategory(doc, bic)` | A German harvest applied on English Revit binds every parameter, and Ghost typing matches the English run. | — |

#### 3.4.2 Standards ▸ Apply Standard (`Commands.Standards.cs:65-100`)
**What it does.** Opens a saved pack JSON in the same window. Build creates worksets and bindings, and copies templates and browser organisation only when the golden model is open. It then merges and PUTs ruleset@n+1.

**Status:** BUILT-NOT-PROVEN (SIM matrix "not run"; B5; memory sentinel-2026-09-25-revit-standards "don't claim them"; harness only).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Promises "any number of blank templates", but a pack alone skips view templates and browser organisation. | Commands.Standards.cs:59-64; StandardsBuilder.cs:212-217, :256-261 |
| bug | The window names one model, but Build writes into whichever model is active, and the ruleset goes there too. The Snapshot button in the same window uses the captured model. | Commands.Standards.cs:97, :188, :212; StandardsReviewWindow.cs:134; StandardsBuilder.cs:29 |
| gap | Packs are per-machine files with no sha, no history and no artefact kind. The same class of problem as F8, F26, F29 and F54. | Commands.Standards.cs:74-83; WebApp/bridge/artefact-store.mjs:12; blueprint:128 (E5) |
| ux | Four transactions, no TransactionGroup. A failure part-way leaves a half-applied standard. The ruleset is staged even after failures. | StandardsBuilder.cs:33-37, :58, :93, :227, :270, :306-322; grep (no TransactionGroup) |
| ux | Gives an inheriting project its own ruleset, so later office installs stop reaching it. The user learns this only after the PUT. | StandardsBuilder.cs:373-374 |
| reliability | The F15 fix (union merge) is proven only by a harness. | SIM F15; RulesetMerge.cs:55-77; B5 |
| ux | No diff before Build. The pack JSON is not validated: schema_version is ignored, and any binding value other than "type" becomes instance. | Commands.Standards.cs:85-95; StandardsBuilder.cs:48-53, :62, :114, :123, :125-127 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| APS-1 | A pack artefact kind, resolved project → office. Apply lists what is installed, and the report names pack@n · source · sha. | M | high | no new API (Workset.Create / BindingMap.Insert; fetch through ArtefactClient) | On a second Windows account, Apply shows "pack@1 · office · <sha>" and builds into a blank model. | E5 |
| APS-2 | Tag every row "exists", "will create" or "cannot" when the window loads, and pre-tick only "will create". | S | high | `FilteredWorksetCollector`, `WorksetTable.IsWorksetNameUnique`, `SharedParameterElement.Lookup`, `ParameterBindings.Contains`, `Category.AllowsBoundParameters` | On aster-tower the diff counts equal the Created and Skipped counts after Build. | — |
| APS-3 | Wrap the four sections in one TransactionGroup. Roll back on any failure. Install the ruleset only after the commit. | S | med | `TransactionGroup.Start` / `Assimilate` / `RollBack` | Undo shows one "Sentinel: Apply standard". A planted failure leaves nothing behind and installs no ruleset. | blueprint §3.4 recipe contract |
| APS-4 | Open the golden model in the background (detached), copy the templates and browser organisation, then close it. | M | med | `Application.OpenDocumentFile(ModelPath, OpenOptions{DetachFromCentralOption})`, `CopyElements`, `Document.Close(false)` | Apply with the golden model closed copies the templates, and the list of open documents is unchanged. | — |
| APS-5 | Capture the Document when the window opens and pass it to Build. Refuse by name when it is closed or not active. | S | med | `Document.IsValidObject`, `UIApplication.ActiveUIDocument` | Switch models, then Build: it builds into the named model or refuses by name, and the other model is untouched. | — (a case of XC-1) |

#### 3.4.3 Standards ▸ Ingest Docs (`Commands.Standards.cs:111-156`)
**What it does.** PdfPig reads the PDF pages. Chunks of about 6000 characters go to a local Ollama model with a JSON schema. Results are merged by name, capped at confidence 0.85 (so they arrive unticked), and shown with the pdf:page they came from.

**Status:** PARTIAL (SIM matrix: pass with F14/F15, "4/5 worksets read; false shared parameter…"; the F15 fix has not been re-run, B5).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Poor quality measured live: a false parameter, a lost separator, missed conventions. Rows carry a page number but not the supporting sentence. | SIM F14; DocumentExtractor.cs:151-200 |
| bug | Rule ids are positional (NM-01, NM-02…), and merge replaces by id, so a second document or a re-run overwrites earlier rules. The comment calls them "stable". | DocumentExtractor.cs:110-118; RulesetMerge.cs:79-87 |
| ux | No real Cancel and no per-chunk progress. Closing the window disposes the client, and the remaining chunks then fail. Each chunk can wait up to 5 minutes. | Commands.Standards.cs:132, :134-145; DocumentExtractor.cs:32, :68, :84-85 |
| gap | No .docx or .xlsx support (the web ingest reads docx). A .docx is read as binary text. | Commands.Standards.cs:123; DocumentTextReader.cs:22-26, :32-33; SIM web matrix |
| gap | Scanned PDFs give empty text with no warning. Tables are flattened. | DocumentTextReader.cs:35-42; Commands.Standards.cs:148 |
| honesty | "ISO 19650 ✓" runs 6 name-match checks. It scores worksets as an ISO fundamental, and any 4-token View or Sheet rule as a container convention. It never grades naming@n. | IsoGapAnalyzer.cs:24-40, :45-50, :58-63; StandardsReviewWindow.cs:62, :251-264 |
| reliability | Two LLM configurations: Ingest uses environment variables (llama3), while Ghost and Massing use settings (qwen2.5). | DocumentExtractor.cs:27-28, :38-39; SettingsManager.cs:39-40; Commands.GhostBuilder.cs:175 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| ING-1 | Make the id a hash of target + tokens + separator. | S | high | none | Ingest A then B: both rule sets stay. Re-ingesting A reports "unchanged — nothing installed". | — |
| ING-2 | Read word/document.xml with ZipArchive and use headings as locators. | S | med | none | The SIM BEP .docx ingests with section provenance. | — |
| ING-3 | A CancellationTokenSource tied to Close and Cancel. Show "chunk k/n · file". Show partial results. | S | med | none | Closing stops within 1 s with no further Ollama requests, and the status had shown k/n. | — |
| ING-4 | Add "quote" to the schema and show it. Drop rows whose quote is not found word for word in the chunk. | S | high | none | Every row shows a word-for-word quote, and F14's false parameter is dropped or visibly unsupported. | — |
| ING-5 | Grade container naming against the installed naming@n, drop worksets as "ISO", and relabel the button "Standard coverage (heuristic)". | S | med | none | On aster-tower the check names naming@1 · office · sha, and a pack with only a View rule scores "Missing". | — |

#### 3.4.4 Model from Drawings ▸ 1 · Datum from Drawings (`Commands.Datum.cs:20-119`)
**What it does.**
1. Imports the chosen DWG into a scratch view, in a transaction that is then rolled back.
2. Collects LEVEL/LEVL and GRID layer lines: level lines within 50 mm merge, and grid lines are de-duplicated within 100 mm.
3. After a text TaskDialog, creates the levels and grids in one transaction.

**Status:** LIVE-PROVEN.
- SIM 3.9: 11 grids + 14 levels.
- F40 and F41 fixed in ecb2691 and re-verified 2026-09-23 (memory sentinel-2026-09-22-simulation).
- Snowdon single-drawing pick: 15 coherent grids.
- Revit 2024 only.

| Kind | Finding | Evidence |
|---|---|---|
| gap | The layer words are hard-coded and not taken from layers@n. Snowdon finding 3 is still open. | Commands.Datum.cs:76-79; DatumBuilder.cs:37, :58, :79, :208-214; Snowdon §3 |
| gap | Elevations are measured from the lowest line, so a basement becomes ±0.00. No anchor, and the base point is not respected. | DatumFromDrawing.cs:55-62 |
| reliability | The units guard only warns above 250 m. A drawing whose units are too large collapses into one level with no warning. | DatumBuilder.cs:133-137; DatumFromDrawing.cs:48-51; SIM F41 |
| gap | Only orthogonal grids. Angled and arc grids are dropped with no message. | DatumFromDrawing.cs:87-88; DatumBuilder.cs:201 |
| bug | Grids are de-duplicated by name, so a second plan's grid "1" at another position is skipped. The naming convention is fixed and includes I and O. | DatumBuilder.cs:234-240 vs :267-274; DatumFromDrawing.cs:80-83, :110-119 |
| reliability | Blocks are read one level deep only. The code calls .First() on drafting view types and throws if there are none. | DatumBuilder.cs:178-184, :144-145 |
| ux | All or nothing: false levels cannot be unticked (Snowdon's +3658 mm line), and names cannot be edited before creation. | Commands.Datum.cs:83-90; Snowdon §1 residual |
| gap | No plan views are created, and nothing is pinned. | DatumBuilder.cs:231-244, :258-277; blueprint MH-LNK-01, R-07 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| DAT-1 | A datum section in layers@n: level and grid layer globs, the naming convention (skip I/O), tolerances. Name the source in the dialog. On a zero result, list the layers that were seen. Ghost then ignores the datum layers. | M | high | `ImportInstance.get_Geometry`, `GraphicsStyle.GraphicsStyleCategory.Name` | Layers "S-GRID-IDEN" and "A-SECT-DATUM" produce levels and grids, the header names layers@n, and Ghost stops proposing them (closes F45). | — |
| DAT-2 | A WPF grid: tick, name and elevation for each row, a ±0.00 anchor, and a Building Story flag. | M | high | `Level.Create`, `Level.Name`, `LEVEL_IS_BUILDING_STORY`, `Grid.Create`, `Grid.Name` | A basement lands at −3500 mm. Unticking +3658 creates nothing there. Typed names appear as typed. | — |
| DAT-3 | Floor and ceiling plans for each story level. Pin every level and grid created. | S | med | `ViewPlan.Create`, `Element.Pinned` | Each new story level has one floor plan and one RCP, and MH-LNK-01 reports 0 unpinned. **MA-2e (LANDED in MA-2e (merge 2026-10-04), drill MA2e: V-1, V-1R, U-1, V-2, V-3 passed live on Revit 2024; owed: Revit 2025-2027, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy):** in Annotate, after Datum (spec amendment S2); MH-LNK-01 is not in code — the result's `Pinned now: x/y story level(s), p/q other level(s), a/b grid(s)` read-back stands in (S3). | MH-LNK-01, R-07 |
| DAT-4 | A units choice in the pick window. Warn when the storey spacing is under 1.5 m or over 10 m. | S | high | `DWGImportOptions.Unit` (ImportUnit) | A DXF drawn in metres warns, and with "metres" chosen it gives 14 levels. | — |
| DAT-5 | Keep non-orthogonal grids. Create arc grids from arcs. | M | med | `Grid.Create(doc, Line)`, `Grid.Create(doc, Arc)` | A radial DWG gives arc grids within 5 mm, and a wing at 30° is kept. | — |

#### 3.4.5 Model from Drawings ▸ 2 · Ghost Builder (`Commands.GhostBuilder.cs:34-399`)
**What it does.**
1. Imports the DWG origin to origin; the import is kept, visible in all views.
2. Reads lines, arcs, loops and blocks.
3. Fetches layers@n, guideline@n and type_catalog@n.
4. Maps layers in five tiers: ignore, standard, cache, heuristics, LLM.
5. Shows a tick-list review.
6. Pairs wall faces into centrelines, provisions types, and places everything in one transaction with a failure preprocessor.

**Status:** PARTIAL.
- Review and mapping LIVE-PROVEN (B7; SIM 3.9; Snowdon).
- Placement last ran live on 2026-07-26 (memory sentinel-2026-07-26-priorities), before phase 4b-2 and the clone fix 08e591b.
- The B7 build was not run. No door or window has ever been placed live.

| Kind | Finding | Evidence |
|---|---|---|
| bug | Doors and windows are placed with the unhosted overload. It is unproven whether they host; if the call throws, the element counts as "no geometry". The block rotation is certainly lost. | ElementPlacementFactory.cs:299-323; GhostBuilder_ExtractionAndPlacement.cs:156, :164-173, :365-378; RevitAPI.xml remarks on NewFamilyInstance with a host |
| bug | The wall base offset is the CAD's absolute Z, which is relative to the import view's level. An import in the Level 3 plan (+9 m) built on Level 3 puts the walls at +18 m. An import at elevation 0 is correct. Not exercised live. | GhostBuilder_ExtractionAndPlacement.cs:195-201; GhostWallPairer.cs:71-72, :85; ElementPlacementFactory.cs:268-269; Commands.GhostBuilder.cs:110-126 |
| honesty | "Placed" is counted before commit, once per CAD element (a loop of 4 walls counts 1). The handler deletes failing elements and erases every warning at commit. | GhostBuilder_ExtractionAndPlacement.cs:383-389; ElementPlacementFactory.cs:260-276; GhostBuilderOrchestrator.cs:147-150, :180; GhostFailureHandler.cs:29-52 |
| reliability | For errors without a resolution, it deletes every failing id, not only elements this build created. Plausible risk, not seen live. | GhostFailureHandler.cs:43-52 |
| bug | Symbols are cached by type name only, first match wins. A missing symbol falls back to the first family of the category, which contradicts the class comment. | GhostBuilder_ExtractionAndPlacement.cs:294-297; ElementPlacementFactory.cs:17-19 vs :308-313, :343-362 |
| gap | Walls are 10 ft high with no top constraint, even though step 1 created real levels. | GhostBuilder_ExtractionAndPlacement.cs:232-234; ElementPlacementFactory.cs:258, :268 |
| reliability | The DWG is imported (not linked), visible in all views, and committed before the review. A cancelled run leaves it behind. A re-run reuses the old import, ignoring an updated file. | Commands.GhostBuilder.cs:98-105, :128-146, :237-239; blueprint MH-CAD-01/02 |
| ux | The review is tick-only: a wrong mapping (F45) cannot be re-mapped, there is no preview, and the types to be created are shown only afterwards. | GhostReviewWindow.cs:32, :177-179, :285-293; ElementPlacementFactory.cs:177-197; GhostBuilderOrchestrator.cs:165-171; SIM F45 |
| dead-code | GhostTypeCreator.CreateColumnType and TryParseSection have no callers. The column fallback repeats the clone bug that F43 and 08e591b fixed. | GhostTypeCreator.cs:116-152, :134, :235; memory sentinel-2026-09-25-ghost-4b2 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| GHB-1 | After the walls, host each opening in the nearest wall within half its thickness. Rotate to the block's angle and flip to match the swing. | M | high | `NewFamilyInstance(XYZ, FamilySymbol, Element host, Level, StructuralType)`, `LocationCurve.Curve.Project`, `ElementTransformUtils.RotateElement`, `FamilyInstance.flipFacing()` | 10 door blocks give 10 hosted doors that cut openings, with rotation within 1°. | — |
| GHB-2 | Base offset = Z minus the level elevation. Top constraint = the next story level. Keep an unconnected option and drop the 10 ft constant. | S | high | `Wall.Create(doc, curve, typeId, levelId, height, offset, flip, structural)`, `WALL_HEIGHT_TYPE` / `WALL_TOP_OFFSET` / `WALL_BASE_OFFSET` | An import in the Level 3 plan built on Level 3 gives every wall Base L3, offset 0, Top L4. | — |
| GHB-3 | Link the DWG to one view only. Compare the timestamp or sha before reusing it. Offer "remove after build". Remove it when the review is cancelled. | S | med | `Document.Link(string, DWGImportOptions{ThisViewOnly=true}, View, out ElementId)`, `ImportInstance.IsLinked`, `CADLinkType.Reload` | MH-CAD-01 reports 0 for Ghost's drawing. An edited DWG is re-read. A cancel leaves no ImportInstance. | MH-CAD-01/02, R-01 |
| GHB-4 | Preview the centrelines, loops and points in the plan before Build, coloured by source, with nothing written to the model. On 2022+, markers flag the types that will be created. | L | high | DirectContext3D (all supported versions); TemporaryGraphicsManager (2022+ only) | Toggling A-WALL shows and hides 531 lines within 1 s, and Undo is unchanged. | — |
| GHB-5 | A type drop-down per row, plus "ignore", remembered as "reviewer". List the types to be created. Count "Placed" after commit from surviving ids. The handler deletes only this build's ids and reports what it deleted. | M | high | FilteredElementCollector per category; `FailuresAccessor.GetFailureMessages`, `GetFailingElementIds`; `Document.GetElement` after commit | Remapping A-LEVELS to "ignore" sticks. A planted duplicate gives "Placed 9 (1 deleted by Revit…)". | P1-3 (count warnings, don't erase them) |
| GHB-6 | Extend paired centrelines to their intersections so corners join. Replace the O(n²) greedy pairing with grid-bucketed nearest neighbour. | M | med | `WallUtils.AllowWallJoinAtEnd`, `Curve.Intersect`, `LocationCurve.JoinType` | 0 corner gaps and no overlap warnings. Under 2 s for 10k segments. | — |

#### 3.4.6 Model from Drawings ▸ 2b · Photo Massing (`Commands.Massing.cs:25-159`)
**What it does.**
1. A vision model estimates footprint, storeys, storey height and openings.
2. The estimate is clamped to LOD-100 bounds and shown in an editable review.
3. Build places a rectangle at the internal origin: 4 walls and 1 floor per storey, plus openings.

**Status:** PARTIAL.
- SIM 3.9 "pass after fixes": Placed 150 with real walls and a declared placeholder floor. The result is "a rectangular envelope from four numbers, never a likeness".
- F46: a 2 m footprint and 23 storeys estimated for a 38-storey tower.
- Not run since 4b-2 (B7).

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Always an axis-aligned box, whatever the photos show. The tooltip promises more. | MassingPlanner.cs:160-197; SIM 3.9; SIM F46; App.cs:335-336 |
| gap | No levels are created or used. Every storey hangs off the lowest level, which may be a basement. | Commands.Massing.cs:153; GhostBuilderOrchestrator.cs:135-136, :173; GhostBuilder_ExtractionAndPlacement.cs:311-313; MassingBuilder.cs:29-47 |
| bug | Build stays enabled, so a second click places a second massing. Ghost's review already disables its button. | MassingReviewWindow.cs:81-82; Commands.Massing.cs:55-60, :84-91 vs GhostReviewWindow.cs:290 |
| gap | Always centred on (0,0) with no rotation and no site. | Commands.Massing.cs:86; MassingPlanner.cs:160-168 |
| gap | The opening sizes the reviewer confirms are never applied. Openings use the unhosted path. | MassingBuilder.cs:73-88; MassingPlanner.cs:199-213; ElementPlacementFactory.cs:305-322 |
| honesty | Placeholder boxes are real Walls and Floors that flow into schedules, quantities and IFC. A comment claims "audited identically", but no ledger row is written. | ElementPlacementFactory.cs:42-45, :218-226, :387-392; MassingBuilder.cs:2-5; GhostBuilderOrchestrator.cs:131-133 |
| perf | Full-size images are sent as base64 with no downscaling. | MassingVisionReader.cs:58, :76, :82 |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| MAS-1 | One storey per story level (from Datum), or create levels. Host walls and floors on their level, with the top on the next level. | M | high | `Level.Create`, `Wall.Create(..., levelId, ...)`, `WALL_HEIGHT_TYPE`, `Floor.Create(doc, loops, typeId, levelId)` (2022+) / `NewFloor` (2021) | With 14 Datum levels, the review pre-fills 14 storeys, each wall reads Base Ln / Top Ln+1, and each floor is on its level. | — |
| MAS-2 | Build as a Mass DirectShape. Converting to walls and floors becomes an explicit second step. | M | med | `DirectShape.CreateElement(doc, new ElementId(BuiltInCategory.OST_Mass))`, `GeometryCreationUtilities.CreateExtrusionGeometry`, `DirectShape.SetShape` | Wall and floor schedules are unchanged, and the IFC has no IfcWall or IfcSlab for the massing. | — |
| MAS-3 | Pick a closed footprint (lines, property line or CAD), an insertion point and a rotation. | M | high | `Selection.PickObjects(ObjectType.Element, ISelectionFilter)` / `PickPoint`, `CurveLoop`, `PropertyLine` | An L-shaped polyline gives an L-shaped massing in place, with the area within 0.1 m². | — |
| MAS-4 | Disable Build on click and close the review when the build completes. Select and zoom to what was placed. | S | med | `Selection.SetElementIds`, `UIDocument.ShowElements` | A double-click gives one massing, and the count equals the selection. | — |

#### 3.4.7 Model from Drawings ▸ 3 · Annotate Views (`Commands.Annotate.cs:19-112`)
**What it does.**
1. Fetches guideline@n, blocking for up to 4 s.
2. For each FloorPlan or CeilingPlan entry × level, creates "WIP_<prefix>_<LEVEL>" with the first view family type.
3. Applies the template if the model has it, routes the view in the browser, and skips existing names.

Everything runs in one transaction.

**Status:** PARTIAL.
- B7: 108 views on Demo; a rerun created 0 and skipped 126.
- SIM F44: 96 views, all without their templates.
- No live run has applied a template.

| Kind | Finding | Evidence |
|---|---|---|
| honesty | Named "Annotate", but it creates empty views with no tags, dimensions or sheets. The tooltip says "templated", yet no run has applied a template. | App.cs:337-338; Commands.Annotate.cs:73-96; SIM F44; B7 |
| gap | Names use a fixed WIP_ format. The guideline's naming and the project's View rule are ignored (F44). | ViewPlanner.cs:23-26, :33, :42-45; SIM F44 |
| gap | FloorPlan and CeilingPlan only. | ViewPlanner.cs:21, :39 |
| ux | Every level, reference levels included, all or nothing, with no preview (108 views). | Commands.Annotate.cs:41-42, :49-50, :73-96; B7 |
| bug | No per-view try/catch. One exception, for example from an unsanitized guideline prefix, rolls back every view. | Commands.Annotate.cs:71-97; ViewPlanner.cs:45 |
| reliability | Uses the first ViewFamilyType. Routing results are ignored, so views can land under "???" without a message. | Commands.Annotate.cs:79, :92-93; ViewGenerator.cs:43-56 |
| perf | The GET blocks Revit for up to 4 s. | Commands.Annotate.cs:27-30, :109; ArtefactClient.cs:42 |
| gap | No sheets, so every view created will count under MH-VW-01. | blueprint MH-VW-01, R-03; Commands.Annotate.cs |

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| ANV-1 | Fill the project's View rule tokens from the guideline and the level. Refuse, with the reason, when a token is missing. | M | high | `ViewPlan.Create`, `View.Name`; existing token compiler | Scan Now reports 0 View naming violations for the created views (closes F44). **MA-2e (LANDED in MA-2e (merge 2026-10-04), drill MA2e: V-1, V-1R, U-1, V-2, V-3 passed live on Revit 2024; owed: Revit 2025-2027, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy):** a guideline view entry's `tokens` (`{level}` verbatim, founder decision F1 A), judged by Scan Now's cached ruleset before create. | — |
| ANV-2 | Preview levels × types with name, template status and validity. Story levels are pre-ticked. A per-view try/catch. | S | high | `LEVEL_IS_BUILDING_STORY`, `NamingUtils.IsValidName` (in 2021 API), `ViewPlan.Create` | Only story-level views are created. A ":" in the prefix is reported and skipped, and the rest are still created. **MA-2e (LANDED in MA-2e (merge 2026-10-04), drill MA2e: V-1, V-1R, U-1, V-2, V-3 passed live on Revit 2024; owed: Revit 2025-2027, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy):** story levels × the first FloorPlan and CeilingPlan entries pre-ticked (S4); a `SubTransaction` per view. | — |
| ANV-3 | Copy a missing template from the office template, opened in the background (as in APS-4). | M | high | `OpenDocumentFile(ModelPath, OpenOptions)`, `CopyElements`, `View.ViewTemplateId`, `Document.Close(false)` | 108 views with templates and 0 "created without it" warnings. | — |
| ANV-4 | Dependent views per scope box, and sheets with a title block and the views placed. | L | high | `View.Duplicate(ViewDuplicateOption.AsDependent)`, `VIEWER_VOLUME_OF_INTEREST_CROP`, `ViewSheet.Create`, `Viewport.CanAddViewToSheet` / `Create` | Every view created is on a sheet, MH-VW-01 reports 0, and the sheet names pass the rule. | MH-VW-01, R-03 |
| ANV-5 | Either annotate (room, door and window tags; datum extents) or rename the command to "Create Guideline Views". | M | med | `IndependentTag.Create(...)` (2021 API), `NewRoomTag`, `DatumPlane.SetDatumExtentType` / `Maximize3DExtents` | Each plan has a tag on every door and room in view, with the counts per view in the summary. | — (founder decision) |

---

## 4. Cross-cutting enhancements

### 4.1 Ribbon reorganisation (before / after)

| Panel | Before (App.cs:260-340) | After (proposal) | Why (evidence) |
|---|---|---|---|
| Account (new) | none. Sign in and Project Setup are hidden in Standards ▾ with the same "setup" icon (App.cs:319-322). | Account button that reads "Signed in: <name>" or "Sign in" (SI-2) · Setup ▾ (Project Setup, Review Flag setup until RF-1 makes it automatic) · About & Diagnostics (SH-4). | Identity is hard to find. "Not bound" and "signed out" are the two most common refusals. |
| Coordinate | Show Panel · Change Requests · BCF Issues · Clash ▾ (Clash Manager, Clash Register) · Review Flag · Review AI Proposals | Show Panel · BCF Issues · Clash ▾ (Clash Manager, Clash Register, MEP Openings) · Change Requests · Review AI Proposals (own icon) | Review Flag is a one-time setup (App.cs:274-275). MEP Openings places families and repeats the clash loop (MepVoidManager.cs:59-121 vs ClashManager.cs:49-75). The "gate" icon is reused (App.cs:276 vs :291). |
| Validate | Scan Now · Health Scorecard · Rule Set · IFC Gate ▾ (Pre-Flight, Delivery Gate) · Family Health ▾ (Sanitize .rfa, Heal) · MEP Openings · Naming Manager | Scan Now · Check ▾ (Health Scorecard, Rule Set) · Model Health ▾ (P1-8: Health Check, Warnings, Cleanup Recipes) · IFC ▾ (Pre-Flight, Delivery Gate) · Families ▾ (Sanitize .rfa, Heal) · Naming Manager (own icon) | P1-8 adds a pulldown here. The "family" icon is used 3 times (App.cs:293, :295, :301). "Family Health" is a container, not a tool (Session C finding 8). |
| Publish | Governed Publish · Publish ▾ (Sheets, Views) | Governed Publish · Publish ▾ (Sheets, Views) · Reports ▾ (ROI Dashboard) | ROI prices publish runs but sits on Standards & Build (App.cs:339-340). The Publish tooltips are out of date (App.cs:308-311). |
| Standards & Build | Standards ▾ (Project Setup, Sign in, Build Office System, Apply Standard, Ingest Docs) · Model from Drawings ▾ (4 items, all with the "ghost" icon) · ROI Dashboard | Standards ▾ (Build Office System, Apply Standard, Ingest Docs) · Model from Drawings ▾ (1 Datum, 2 Ghost Builder, 2b Photo Massing, 3 Create Guideline Views; distinct icons) | "ghost" icon ×5 (App.cs:329-337). "Annotate" creates views, not annotation (ANV-5). |
| All panels | Tooltips of about 200–480 characters. No LongDescription or F1 help. Every button stays live in the family editor. | One-line ToolTip + LongDescription + ContextualHelp. IExternalCommandAvailability greys out document-bound commands. contact_sheet.png is no longer deployed. | App.cs:347-364 sets ToolTip only. grep finds no IExternalCommandAvailability. Sentinel.csproj:58. |

Build all of this in one BuildRibbon pass: SH-3 + SI-2 + RF-1 + P1-8.

### 4.2 The pane as the home
Today, issues, change requests, clash results, AI proposals and Fix in Revit each open their own floating window. Clash Register and many result screens are modal TaskDialogs. BCF Issues opens a new window, with its own SSE stream, on every click (Commands.BcfIssues.cs:91-95, :137). Ideate Explorer keeps its working list open beside the model ([source](https://graitec.com/Help/Ideate_Software/EN/review-warnings.htm)).

Proposal: one pane with the tabs **Rules · Issues · Clashes · Requests · IFC · Activity**.

1. **First, rows must carry their document.** Do XC-1 before any pane work.
2. **Then the existing rows.** PNL-1 (with SCAN-E4) and PNL-6.
3. **Then the tabs.** PNL-3 (Issues), CRG-1 (Clashes), PRE-E3 (IFC), PNL-2 (Activity).

Build the tabs in the same XAML pass as P1-5 (the pane block).

### 4.3 Document binding, undo and model state

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| XC-1 | **Pin every job to its document.** Add a `RevitEventHub.Enqueue(Document, job)` overload that re-resolves the captured Document with `.Equals` and refuses ("switch back to <title>") when it is closed or not active. Move these callers onto it: pane Select and ⚡ Fix (RevitEventHub.cs:25-33; AutoFixExecution.cs:33), change-request Show and Reset (ShowPendingChangeCommand.cs:35-41), BCF zoom (BcfApplyEvent.cs:35-36), AI placement (ChangesetPlacementEvent.cs:31), clash view and export (ClashManagerDialog.xaml.cs:39, :67), Sanitize (FamilySanitizer.cs:48), MEP (MepVoidManager.cs:174, :243), Apply (StandardsBuilder.cs:29), Project Setup (SettingsDialog.xaml.cs:173). This applies the lesson in memory sentinel-2026-09-16-state everywhere. It covers the guard parts of AI-1, APS-5, CR-2, BCF-3, MEP-E1 and SAN-E3. | M | high | ExternalEvent / IExternalEventHandler, `UIApplication.ActiveUIDocument`, `Document.Equals`, `Document.IsValidObject` | Open Demo and aster-tower. Start each listed action on Demo, then switch to aster before the event runs. Every action refuses with "switch back to Demo", and aster's Undo list is unchanged. | — |
| XC-2 | **One undo per Sentinel action.** A small TransactionGroup helper, used by Apply Standard (APS-3), Heal option A (HEAL-E2), MEP confirm (MEP-E1), the Naming merge (NAME-E3) and BCF zoom (BCF-3). Previews roll back. A TransactionGroup cannot outlive its ExternalEvent call. Evidence: there is no TransactionGroup anywhere in the add-in (grep); StandardsBuilder.cs:58, :93, :227, :270; BcfApplyEvent.cs:68-82, :219-223; ShowPendingChangeCommand.cs:55-72; BcfExporter.cs:53-72. | S | high | `TransactionGroup.Start` / `Assimilate` / `RollBack`, `Transaction.RollBack` | After Apply Standard, a BCF zoom and a Heal, Undo shows exactly one "Sentinel: …" entry each. Cancel leaves Undo unchanged. | blueprint §3.4 recipe contract; P1-7 |

### 4.4 Threading and freezes

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| XC-3 | **Network off Revit's UI thread, everywhere.** One pattern: Task + CancellationToken for the call, then back through RevitEventHub or the Dispatcher. Blocking calls today: Clash Manager 4 s (Commands.Phase2.cs:171-177), Clash Register 4 s (Commands.ClashRegister.cs:28), Review AI 8 s and 120 s (ChangesetClient.cs:90-91, :140), gate 4 s + 6 s (Commands.IfcGate.cs:31, :121), Annotate 4 s (Commands.Annotate.cs:30), ROI up to 15×4 s (Commands.Phase2.cs:52), Heal post (Commands.Phase2.cs:222), Sign in 8 s (SignInDialog.xaml.cs:49-54), token refresh in a getter (UserSession.cs:78-98). The bridge runs on the founder's PC behind a Funnel (blueprint U10), so slow answers are normal. | M | high | ExternalEvent (RevitEventHub), `Task.Run`, `CancellationTokenSource`, WPF Dispatcher | With the bridge slowed to 5 s per call, each listed command opens at once with "waiting for the bridge…", and the user can still pan a view. With the bridge stopped, each ends in one plain line within 10 s. | — |

The long jobs also need progress and Cancel: GP-1 (export), PS-3 (sheets), HEAL-E2 (heal), CLM-1 and MEP-E3 (geometry), ING-3 (LLM).

Two further points:
- The panel creates an extra ExternalEvent per window or run (Commands.Standards.cs:179; Commands.GhostBuilder.cs:205; Commands.Massing.cs:50), against blueprint §4.1.2 rule 1. Fold them into RevitEventHub when those files are next touched.
- Ghost walks the whole source folder and parses PDFs on the API thread before any progress shows (GhostEvidence.cs:43, :62; Commands.GhostBuilder.cs:174).

### 4.5 Offline and error wording

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| XC-6 | **Plain-words errors.** Every network failure maps to one of four sentences: "bridge not answering at <url>", "signed out — Sentinel ▸ Sign in", "your role cannot do this (<route>)", "the bridge refused: <its message>". Evidence of the current wording: raw "502: Bad Gateway" (GovernedQuery.cs:122-126; memory sentinel-2026-09-25-revit-standards); every non-401 reads "couldn't reach" (GovernedQuery.cs:313-314); "npm run bcf:serve" (Publisher.cs:364); a malformed config silently becomes localhost:4100 (BcfConfig.cs:45). Includes the error part of PNL-4 and the config part of PSU-3. | S | med | none | With the bridge stopped, then a 401, a 403 and a 500, every command shows one of the four sentences, and none shows "npm", "502: Bad Gateway" or "localhost:4100" unless that is the configured URL. | — |

Offline behaviour is otherwise good. Cached artefacts are labelled "(cached HH:mm)", and the bridge-down rows passed in B10 and B11. Keep that.

### 4.6 Identity and the ledger

| Id | Enhancement | Size | Value | Revit API | Proof | Blueprint |
|---|---|---|---|---|---|---|
| XC-4 | **One identity on every write.** In-model audits and evidence text use the signed-in e-mail when a session exists. Signed-out writes say "unsigned — <Windows user>", never "Revit". The coordinator role comes from the bridge (lead and above), not settings.json. Today's actor strings: RequestManager.cs:95, :115; AutoFixExecution.cs:63, :71; FixInPlaceService.cs:262; Commands.BcfIssues.cs:163 → :366; ClashManagerDialog.xaml.cs:74; Publisher.cs:221; Commands.PublishSheets.cs:50; HealRecord.cs:27; StandardsBuilder.cs:359; ChangesetClient.cs:137. Coordinator default: RequestManager.cs:27-41. | M | high | none (UserSession) + ExtensibleStorage for in-model audits | Signed in: ⚡ Fix, a change-request approve, a Fix-in-place Apply and a Governed Publish all name the e-mail, in the model audit and on the ledger. Signed out: they read "unsigned — <user>". A contributor sees Change Requests read-only. | H4 |
| XC-5 | **A ledger row for every model-changing action.** Add allowed entity types on the bridge, and rows for: change requests, clash views, BCF file export, IFC Pre-Flight, Sanitize, MEP voids, Datum, Ghost, Massing, Annotate, Apply Standard (model half) and project binding. Evidence: B11 "Not counted" (SIM run:499); GovernedNotify appears only at Commands.Standards.cs:230 and StandardsBuilder.cs:359 on the Standards & Build panel; SettingsDialog.xaml.cs:169-190. | M | high | none (existing GovernedNotify.Event; bridge `recordRevitReport` allow-list) | After one drill session covering those actions, GET /cde/<key>/audit lists one row per action with the signed-in actor, and the ROI "not counted" line lists none of them. | Extends P1-9 (which covers only auto-fix, fix-in-place and Doctor) |

Related items already in the backlog:
- SI-1: no silent fallback to the PC token.
- SI-2: identity shown on the ribbon.
- GATE-E1 (H5): the gate row for signed-in users.
- CR-3: change requests on the ledger.
- ROI-1: price only runs a person started.

### 4.7 Install and versions
- **Install.** SH-1: a signed .bundle, a version stamp, a neutral vendor.
- **Versions.** SH-2: CI for all 7 years, plus 2026 isolation. The API limits in this plan are listed below. Each needs a fallback on older builds, and the fallback needs its own drill:
  - `Selection.SetReferences`: 2023+ (CLM-5, CRG-1).
  - TemporaryGraphicsManager: 2022+ (AI-4, GHB-4).
  - Native PDF export: 2022+ (PS-1).
  - Built-in IFC_EXPORT_ELEMENT_AS read: guarded at 2023+ today (PRE-E1).
  - `Category.BuiltInCategory`: 2023+ (BOS-5).
  - ForgeTypeId definitions: 2022+ (BOS-1, HEAL-E1).
- **Owed live drills.** Run these on 2024 first, then once each on 2025 and 2026:
  - Change Requests approve/reject and Revit Doctor (blueprint:1154, :1157).
  - Clash Manager and Clash Register (SIM run:55, :185).
  - SIM Act 3.8 (SIM run:142).
  - BCF Isolate-all and Issues-for-selection (no record).
  - Pane ↻ (memory notes).
  - Pane ⚡ Fix (BG-5 first; on aster the {org} bug blocks it).
  - Sanitize .rfa pass-and-load (SIM run:46).
  - The IFC-02 branch (Session C).
  - Build/Apply and CDE-01 (B5; memory sentinel-2026-09-25-revit-standards).
  - Governed Publish ACCEPTED on the current code (B10).
  - Publish Sheets and Views (B27).
  - Ghost build and Photo Massing after 4b-2 (B7).

### 4.8 Localisation
- PNL-5: Arabic rule messages in the pane, now.
- SH-5: full .resx with Application.Language, later.

The data is already bilingual (message_ar in ruleset-AST.json), and the pilot market is Jordan (ROADMAP.md:53).

### 4.9 Diagnostics
- SH-4: a persistent log, and "Copy diagnostics".
- PNL-2: split Doctor from Activity, and fix the header count.

Together these replace today's memory-only 200-line log (SentinelPanelViewModel.cs:92-98) and PlatformExporter.Log, which has no caller.

### 4.10 Results that stay
Six Validate tools report in modal TaskDialogs with no element links and no export: Scorecard, Pre-Flight, Gate, Heal, Sanitize and MEP. The same is true of Clash Register and Governed Publish. Model Checker zooms to and selects elements from its report ([source](https://interoperability.autodesk.com/modelchecker.php)).

Priority order:
1. GP-5 (publish results).
2. SCORE-E3 (scorecard window).
3. CRG-1 (register).
4. PRE-E3 (IFC tab).
5. ROI-2 (Copy CSV).

---

## 5. Missing tools a BIM manager expects

This section lists only tools with a competitor source. Items already planned are mapped to their ids.

| Missing tool | Competitor evidence | Closest Sentinel piece today | Backlog / blueprint |
|---|---|---|---|
| A warnings browser that stays open, is grouped, and zooms | Ideate Explorer ([source](https://graitec.com/Help/Ideate_Software/EN/review-warnings.htm)); Kiwi Codes ([source](https://apps.autodesk.com/RVT/en/Detail/HelpDoc?appId=2077603980990329161&appLang=en&os=Win64)) | Doctor log (BUILT-NOT-PROVEN) | Planned: P1-2, P1-3, P1-5, P1-8. PNL-2 for the log. |
| Organisation-wide warning standards | Ideate Explorer ([source](https://graitec.com/Help/Ideate_Software/EN/set-up-warning-standards.htm)) | none | Planned: P1-1 (health@n) |
| Checkset authoring inside Revit | Model Checker Configurator ([source](https://interoperability.autodesk.com/modelcheckerconfigurator.php)) | Rule Set window, read-only. "Office ruleset authoring" open under F8 (SIM run:91). | RULE-E2 is a first step. Authoring is not in P1. |
| Check the model against the project IDS inside Revit, with selectable failures | IDS4Revit ([source](https://docs.ids4revit.diroots.com/docs/Pages/IDS4Revit/IDS4Revit.html)); BIMcollab Zoom ([source](https://helpcenter.bimcollab.com/en/articles/340833-ids-property-validation-in-bimcollab)) | IDS is judged only at Governed Publish. The pieces exist: GovernedElementExtractor, PsetMap, FixInPlaceService. | GP-5 "Check only" (referee dry run), PRE-E1. Not in P1: P1-11 covers export mapping only. |
| Scheduled, unattended IFC export and multi-model health | Ideate Automation ([source](https://graitec.com/uk/blog/how-to-automate-ifc-export-from-revit/), [source](https://ideatesoftware.com/ideate-automation-understand-revit-model-health-using-microsoft-power-bi)); Model Checker Automation ([source](https://interoperability.autodesk.com/modelchecker.php)) | Auto-Publish on save and sync only | Not planned. U10 is the web gate; P1-6 and P1-10 give history only for models that sync. |
| Batch export of saved sheet/view sets to PDF, DWG and NWC with parameter names | ProSheets ([source](https://diroots.com/revit-plugins/revit-to-pdf-dwg-dgn-dwf-nwc-ifc-and-images-with-prosheets/), [source](https://docs.prosheets.diroots.com/docs/ui-components/selection-tab.html)); Revit Publish Settings ([source](https://help.autodesk.com/cloudhelp/2025/ENU/RevitLT-Cloud/files/GUID-09FBF9E2-6ECF-447D-8FA8-12AB16495BC3.htm)) | Publish Sheets: all sheets, BUILT-NOT-PROVEN | PS-1, PS-2, PV-2. P2-6 needs the live run. |
| Sheet creation with views placed, and dependent views per scope box | CTC ([source](https://ctcsoftware.com/product/bim-project-suite/)); Naviate Sheet Manager ([source](https://blog.naviate.com/an-overview-of-sheet-manager)); DiRoots SheetGen ([source](https://docs.dirootsone.diroots.com/docs/sheetgen-user-guide)) | Annotate creates loose plan views | ANV-4; MH-VW-01, R-03 |
| Shared-parameter manager and batch family parameter processor | DiRoots ParaManager ([source](https://docs.dirootsone.diroots.com/docs/pages/ParaManager/PM-Categories.html), [source](https://diroots.com/revit-plugins/manage-revit-parameters-in-projects-and-families-with-paramanager/)); CTC Family Processor ([source](https://help.ctcsoftware.com/BIM/2021/familyprocessor)); Cobuilder Require ([source](https://cobuilder.com/en/cobuilder-require/revit-shared-parameters-export/)) | Heal (one parameter, temp GUID); Build Office System | HEAL-E1, BOS-1, BOS-2; P2-7 for values |
| Family library audit (a whole folder) and re-save to the current version | Ideate family auditing ([source](https://graitec.com/Help/Ideate_Software/EN/family-auditing.htm)); Naviate Re-save Families ([source](https://www.naviate.com/naviate-for-revit/naviate-accelerate/features/)) | Sanitize .rfa, one file at a time | SAN-E1, SAN-E3; MH-FAM-02/03 for loaded families |
| Style and pattern clean-up; Overwrite or New Only transfer | Ideate StyleManager ([source](https://support.ideatesoftware.com/support/help/ideate-stylemanager/using-ideate-stylemanager/line-fill-patterns)); Transfer Project Standards ([source](https://novedge.com/blogs/design-news/revit-tip-transfer-project-standards-into-an-active-revit-model)) | Not extracted | BOS-4; cleanup recipes R-01..R-08 where they overlap |
| Import clash results from Navisworks and others; switch back to Revit | Kiwi Codes ([source](http://revitaddons.blogspot.com/2016/04/kiwi-codes-bonus-tools-expands-to-87.html)); Revizto ([source](https://help.revizto.com/hc/en-us/articles/4414942889359-Syncing-Navisworks-clashes-with-Revizto)); SwitchBack ([source](https://help.autodesk.com/cloudhelp/2022/ENU/Navisworks/files/GUID-2877F4F4-3B6B-4A2A-887B-35761E79AA46.htm)) | Clash Register, read-only | CRG-1, CLM-3. P2-4 is BCF zip import on the bridge only. |
| A provision-for-void manager with size, status and approval | Naviate ([source](https://blog.naviate.com/provision-for-voids-coordinate-openings-for-mep-service-across-discipline)); ConVoid ([source](https://www.conclass.tech/convoid)); MEPcontent ([source](https://www.mepcontent.com/en/apps/detail/16/)) | MEP Openings (never run) | MEP-E1, MEP-E2, MEP-E4 |
| BCF snapshot, status change and comments from Revit | BIMcollab BCF Manager ([source](https://helpcenter.bimcollab.com/en/articles/344346-create-and-edit-issues-in-revit)) | BCF Issues: no snapshot, no status | BCF-2, BCF-5 |
| Rooms from CAD polylines | IMAGINiT ([source](https://resources.imaginit.com/building-solutions-blog/imaginit-utilities-for-revit-cad-tools-part-2-rooms-from-cad)) | Ghost Builder has no room path | No id yet. A candidate after GHB-1..5. |
| Usage telemetry per tool and user | pyRevit telemetry ([source](https://docs.pyrevitlabs.io/reference/pyrevit/telemetry/record/)); Bimbeats ([source](https://www.bimbeats.com/)) | Ledger rows for 3 kinds only (RoiReport.cs:110-111) | XC-5, ROI-2; P1-9 |

**Deliberate non-goal.** Excel round trips (Ideate BIMLink, [source](https://ideatesoftware.com/renaming-revit-families); DiRoots SheetGen). The blueprint rejects spreadsheet round trips for bulk edits (blueprint:698, U18 → P2-7). CSV export only.

---

## 6. Ranked backlog

Sort order: value (high first), then size (S first). Inside a group, bugs and honesty fixes on live paths come first. "Depends on" names a backlog item or a decision that must come first.

| # | Id | Tool | Size | Value | Depends on | Blueprint overlap |
|---|---|---|---|---|---|---|
| 1 | BG-5 | ⚡ Fix dialog | S | high | — | — |
| 2 | BG-4 | ⚡ Fix | S | high | — | — |
| 3 | BG-1 | Live updater | S | high | — | — |
| 4 | GP-2 | Governed Publish | S | high | — | — |
| 5 | GP-3 | Governed Publish (CDE-01) | S | high | — | — |
| 6 | SI-1 | Sign in | S | high | — | — |
| 7 | CLM-4 | Clash Manager + MEP BCF export | S | high | — | — |
| 8 | XC-2 | Cross-cutting (undo) | S | high | — | §3.4, P1-7 |
| 9 | AI-1 | Review AI Proposals | S | high | XC-1 (or a standalone guard) | — |
| 10 | CR-2 | Change Requests | S | high | XC-1 | — |
| 11 | BCF-1 | BCF Issues | S | high | — | — |
| 12 | SCORE-E1 | Health Scorecard | S | high | — | P1-3, P1-5 |
| 13 | NAME-E1 | Naming Manager | S | high | — | — |
| 14 | PRE-E2 | IFC Pre-Flight | S | high | — | — |
| 15 | MEP-E1 | MEP Openings | S | high | XC-1, XC-2 | — |
| 16 | GP-4 | Governed Publish | S | high | — | — |
| 17 | SAN-E2 | Sanitize .rfa | S | high | — | — |
| 18 | RULE-E2 | Rule Set | S | high | — | — |
| 19 | ROI-1 | ROI Dashboard | S | high | — | P1-9 |
| 20 | PSU-3 | Project Setup | S | high | — | — |
| 21 | SI-2 | Sign in / ribbon | S | high | SH-3 (same pass) | P1-8 |
| 22 | SH-2 | Shell (CI, isolation) | S | high | — | — |
| 23 | BOS-2 | Build Office System | S | high | — | — |
| 24 | BOS-3 | Build Office System | S | high | — | — |
| 25 | APS-2 | Apply Standard | S | high | — | — |
| 26 | ING-1 | Ingest Docs | S | high | — | — |
| 27 | ING-4 | Ingest Docs | S | high | — | — |
| 28 | DAT-4 | Datum | S | high | — | — |
| 29 | GHB-2 | Ghost Builder | S | high | — | — |
| 30 | ANV-2 | Annotate Views | S | high | — | — |
| 31 | XC-1 | Cross-cutting (document pin) | M | high | — | — |
| 32 | XC-3 | Cross-cutting (threading) | M | high | — | — |
| 33 | XC-4 | Cross-cutting (identity) | M | high | SI-1 | H4 |
| 34 | XC-5 | Cross-cutting (ledger coverage) | M | high | XC-4; bridge allow-list | extends P1-9 |
| 35 | GATE-E1 | IFC Delivery Gate | M | high | bridge route | H5 |
| 36 | GP-1 | Governed Publish | M | high | — | — |
| 37 | PNL-1 | Show Panel | M | high | XC-1 | — (do together with SCAN-E4) |
| 38 | PNL-3 | Show Panel (Issues tab) | M | high | BCF-1 | P1-5 (same XAML pass) |
| 39 | SCAN-E1 | Scan Now | M | high | — | — |
| 40 | SCAN-E2 | Scan Now | M | high | BG-1 | — |
| 41 | AI-2 | Review AI Proposals | M | high | XC-3 | — |
| 42 | AI-3 | Review AI Proposals | M | high | — | — |
| 43 | NAME-E2 | Naming Manager | M | high | — | — |
| 44 | GP-5 | Governed Publish | M | high | — | P1-11 |
| 45 | CR-1 | Change Requests | M | high | — | — |
| 46 | CR-3 | Change Requests | M | high | XC-4 | P2-7 |
| 47 | BCF-2 | BCF Issues | M | high | — | — |
| 48 | PRE-E1 | IFC Pre-Flight | M | high | — (includes the IfcClassOf fix) | P1-11 |
| 49 | GATE-E3 | IFC Delivery Gate | M | high | — | P1-11 (same item) |
| 50 | HEAL-E1 | Heal Loaded Families | M | high | — | — |
| 51 | HEAL-E2 | Heal Loaded Families | M | high | XC-2 | P1-7 |
| 52 | NAME-E3 | Naming Manager | M | high | XC-2 | — |
| 53 | SAN-E3 | Sanitize .rfa | M | high | XC-1 | — |
| 54 | PS-1 | Publish Sheets | M | high | — | — |
| 55 | PS-2 | Publish Sheets | M | high | — | — |
| 56 | PSU-1 | Project Setup | M | high | bridge allow-list (XC-5) | — |
| 57 | SH-1 | Shell (installer) | M | high | founder decision: certificate cost | — |
| 58 | BOS-1 | Build Office System | M | high | — | — |
| 59 | APS-1 | Apply Standard | M | high | — | E5 |
| 60 | CLM-2 | Clash Manager | M | high | CLM-1 recommended; founder decision: clash strategy | P2-3 |
| 61 | CLM-3 | Clash Manager | M | high | CLM-4, CLM-1; founder decision: clash strategy | E6, P2-3 |
| 62 | CRG-1 | Clash Register | M | high | BCF-3, BCF-4 | — |
| 63 | DAT-1 | Datum | M | high | — | — |
| 64 | DAT-2 | Datum | M | high | — | — |
| 65 | GHB-1 | Ghost Builder | M | high | — | — |
| 66 | GHB-5 | Ghost Builder | M | high | — | P1-3 |
| 67 | MAS-1 | Photo Massing | M | high | Datum levels (DAT-2 helps) | — |
| 68 | MAS-3 | Photo Massing | M | high | — | — |
| 69 | ANV-1 | Annotate Views | M | high | — | — |
| 70 | ANV-3 | Annotate Views | M | high | APS-4 pattern | — |
| 71 | CLM-1 | Clash Manager | L | high | founder decision: clash strategy | — |
| 72 | GATE-E2 | IFC Delivery Gate | L | high | Node parity (tools/gate-check) | — |
| 73 | MEP-E2 | MEP Openings | L | high | MEP-E1 | — |
| 74 | BOS-4 | Build Office System | L | high | APS-4 | — |
| 75 | GHB-4 | Ghost Builder | L | high | — | — |
| 76 | ANV-4 | Annotate Views | L | high | ANV-1, ANV-3 | MH-VW-01, R-03 |
| 77 | PNL-6 | Show Panel | S | med | — | — |
| 78 | PNL-4 | Show Panel | S | med | — (part of XC-6) | — |
| 79 | XC-6 | Cross-cutting (error wording) | S | med | — | — |
| 80 | BG-3 | Revit Doctor | S | med | — | R-08, P1-1, P1-9 (build inside R-08) |
| 81 | BG-2 | Live updater | S | med | — | — |
| 82 | PNL-5 | Show Panel | S | med | — | — |
| 83 | BCF-3 | BCF Issues | S | med | XC-1, XC-2 | — |
| 84 | BCF-4 | BCF Issues | S | med | — | — |
| 85 | BCF-5 | BCF Issues | S | med | BCF-1 | — |
| 86 | CLM-5 | Clash Manager | S | med | — (2023+) | — |
| 87 | CRG-2 | Clash Register | S | med | — | — |
| 88 | RF-1 | Review Flag | S | med | — | — |
| 89 | RF-2 | Review Flag | S | med | RF-1 | — |
| 90 | AI-5 | Review AI Proposals | S | med | — | — |
| 91 | SCAN-E5 | Scan Now | S | med | — | P1-6, P1-10 |
| 92 | SCORE-E2 | Health Scorecard | S | med | founder decision | conflicts with P1-3 "v1 untouched" |
| 93 | RULE-E1 | Rule Set | S | med | — | — |
| 94 | RULE-E3 | Rule Set | S | med | — | — |
| 95 | PRE-E3 | IFC Pre-Flight | S | med | pane tabs (PNL-3) | — |
| 96 | GATE-E5 | IFC Delivery Gate | S | med | — | — |
| 97 | SAN-E4 | Sanitize .rfa | S | med | — | — |
| 98 | HEAL-E3 | Heal Loaded Families | S | med | — (share the handler with BG-3) | R-08, P1-9 |
| 99 | HEAL-E4 | Heal Loaded Families | S | med | SCAN-E1 | — |
| 100 | GP-6 | Governed Publish | S | med | — | — |
| 101 | PS-3 | Publish Sheets | S | med | XC-3 | — |
| 102 | PS-4 | Publish Sheets | S | med | — | H3, P2-6 |
| 103 | PV-1 | Publish Views | S | med | — | — |
| 104 | PV-3 | Publish Views | S | med | — | — |
| 105 | PSU-2 | Project Setup | S | med | — | — |
| 106 | PSU-4 | Project Setup | S | med | — | — |
| 107 | SI-3 | Sign in | S | med | — | — |
| 108 | ROI-3 | ROI Dashboard | S | med | — | — |
| 109 | SH-4 | Shell (diagnostics) | S | med | — | — |
| 110 | BOS-5 | Build Office System | S | med | — | — |
| 111 | APS-3 | Apply Standard | S | med | XC-2 | §3.4 recipe contract |
| 112 | APS-5 | Apply Standard | S | med | XC-1 | — |
| 113 | ING-2 | Ingest Docs | S | med | — | — |
| 114 | ING-3 | Ingest Docs | S | med | — | — |
| 115 | ING-5 | Ingest Docs | S | med | — | — |
| 116 | DAT-3 | Datum | S | med | — | MH-LNK-01, R-07 |
| 117 | GHB-3 | Ghost Builder | S | med | — | MH-CAD-01/02, R-01 |
| 118 | MAS-4 | Photo Massing | S | med | — | — |
| 119 | PNL-2 | Show Panel | M | med | — | R-08, P1-9 |
| 120 | SCAN-E4 | Scan Now | M | med | do with PNL-1 | — |
| 121 | SCAN-E3 | Scan Now (BLOCK mode) | M | med | founder decision: keep BLOCK or drop it | — |
| 122 | CR-4 | Change Requests | M | med | BG-1 | P2-7 |
| 123 | SCORE-E3 | Health Scorecard | M | med | — | — |
| 124 | PRE-E4 | IFC Pre-Flight | M | med | — | — |
| 125 | GATE-E4 | IFC Delivery Gate | M | med | Node parity | — |
| 126 | SAN-E1 | Sanitize .rfa | M | med | — | MH-FAM-02/03 |
| 127 | MEP-E3 | MEP Openings | M | med | — | — |
| 128 | MEP-E4 | MEP Openings | M | med | MEP-E1 | — |
| 129 | NAME-E4 | Naming Manager | M | med | — | P2-7 |
| 130 | PV-2 | Publish Views | M | med | — | — |
| 131 | SI-4 | Sign in | M | med | — | — |
| 132 | ROI-2 | ROI Dashboard | M | med | — | — |
| 133 | SH-3 | Shell (ribbon) | M | med | — | P1-8 |
| 134 | APS-4 | Apply Standard | M | med | — | — |
| 135 | DAT-5 | Datum | M | med | — | — |
| 136 | GHB-6 | Ghost Builder | M | med | — | — |
| 137 | MAS-2 | Photo Massing | M | med | — | — |
| 138 | ANV-5 | Annotate Views | M | med | founder decision: rename or annotate | — |
| 139 | AI-4 | Review AI Proposals | L | med | — | — |
| 140 | NAME-E5 | Naming Manager | L | med | NAME-E1 | — |
| 141 | BCF-6 | BCF Issues | S | low | bridge label | — |
| 142 | CRG-3 | Clash Register | S | low | CRG-1 | — |
| 143 | SCORE-E4 | Health Scorecard | S | low | — (PNL-6 covers most of it) | — |
| 144 | SH-5 | Shell (localisation) | L | low | PNL-5 | — |

---

## 7. Delivery approaches

### Approach A: Safe and honest first
**What.** Fix the bugs and honesty gaps in tools people already use. Pin every job to its document, stop publish from freezing Revit and dirtying the model, and attribute every write. In the same Revit sessions, run the owed drills listed in §4.7.

**First items:** XC-1, BG-5, BG-4, BG-1, GP-2, GP-3, SI-1, CLM-4. Then GATE-E1 (H5), SCORE-E1 and XC-2.

**Trade-offs.**
- For: mostly S, low risk. Each item removes a wrong-model or wrong-answer risk. It turns BUILT-NOT-PROVEN rows into drill candidates. It is the cheapest in credits (memory founder-credit-economy).
- For: it prepares blueprint P1. XC-2 is P1-7's recipe contract, XC-5 extends P1-9, and SCORE-E1 must land before P1-3 adds MHI.
- Against: nothing new to demo. Competitor feature gaps stay open. The pane stays single-select.

### Approach B: Pane-first redesign
**What.** Make the dockable pane the home: rows grouped by rule with select-all, a cached honest score, and tabs for Issues, Clashes, IFC and Activity. Results go into the pane instead of modal dialogs.

**First items:** PNL-1, PNL-6, PNL-3, PNL-2, PRE-E3, CRG-1, XC-3, PNL-4.

**Trade-offs.**
- For: the biggest daily gain for modellers and coordinators, and it ends the window sprawl. It matches how Ideate Explorer keeps its list open. It lands where P1-5 lands.
- Against: mostly M, and it changes a LIVE-PROVEN surface, so regressions are possible. Without XC-1 first, it multiplies wrong-document actions. It needs Revit sessions to prove.

### Approach C: Power tools to match pyRevit, Ideate, DiRoots, CTC and Naviate
**What.** Close visible feature gaps: sheets, family library, merge duplicates, correct clash, sized voids.

**First items:** PS-1, PS-2, ANV-4, SAN-E3, HEAL-E1, NAME-E3, MEP-E2, CLM-1.

**Trade-offs.**
- For: good demos, and parity in areas where buyers compare.
- Against: many M and L items, in a market where competitors are mature. The link to Sentinel's governance edge is weak unless each tool writes to naming@n and the ledger.
- Against: CLM-1 conflicts with ROADMAP.md:53 ("cede geometric clash"), so the founder must decide the clash strategy first.
- Against: it adds more unproven code to an add-in where 8 tools are already BUILT-NOT-PROVEN and only Revit 2024 has run.

### Recommendation
Do Approach A first, then the first four items of Approach B. From Approach C, take only items that carry governance: PS-1 and PS-2 (sheets judged by naming@n), GP-5 "Check only" as the in-Revit IDS check, and HEAL-E1 (office GUIDs). Put CLM-1..3 on hold until the clash strategy is decided.

Decisions owed by the founder:
- SCORE-E2 against "HealthScorecard v1 untouched".
- BLOCK mode: keep it or drop it (SCAN-E3).
- The clash direction.
- The code-signing certificate cost (SH-1).
- "Annotate": rename it or make it annotate (ANV-5).
