# Sentinel full-surface testing protocol

The repeatable script for maturing every feature by self-run drills against
models we didn't author — no external testers, no BDS dependency. One session
≈ one evening. Findings go to `docs/reviews/` in the Snowdon-file format
(severity-ranked, fix-direction per finding); HIGHs get fixed before the next
session; `docs/handbook/05-capability-status.md` rows move only on evidence.

## Ground rules

- **Foreign models only.** Autodesk samples (`rac_basic_sample`, Snowdon
  architectural / structural / MEP), or any downloaded model. Never a model
  built by us for the test.
- **The standard is harvested, not assumed.** Session 1 of every new model:
  `Build Office System` extracts its worksets/params → that pack + the Base
  pack (`config/base-standard/`) is the standard under test. This tests
  onboarding itself, every time.
- **Play the user, not the author.** Follow the UI, not the source. Every
  hesitation, misread label, or wrong guess is a LOW finding — write it down.
- **Pass criteria are written before the session** (they're below). "It ran"
  is not a pass; each tool has a thing it must demonstrably get right.
- **Every session ends in the browser.** Whatever Revit produced must be
  seen, correct, on the web side — that's the product, not the add-in alone.

## Status legend (per-tool ledger at the bottom)

`✅ verified` live pass with evidence · `🟨 ran, issues` works with logged
findings · `⬜ untested` never deliberately exercised · `⛔ blocked` needs a
prerequisite first.

---

## Session A — Onboard a foreign model (Standards & Build)

Model: `rac_basic_sample` (small, clean — the friendly first target).

| Tool | Pass criteria |
|---|---|
| Project Setup | Settings survive save/reopen; folder + code respected everywhere downstream |
| Build Office System | Harvested pack lists this model's real worksets/shared params; review window edits stick; enforce writes them to a blank doc |
| Apply Standard | The harvested pack applied to a NEW blank doc reproduces the worksets/params |
| Ingest Docs | Feed it any PDF standard (even a public CAD manual): reviewable pack out, nothing enforced without review, local-only (watch no network calls) |
| Rule Set | Shows the effective ruleset incl. overlay; matches the files on disk |

## Session B — Model-from-Drawings chain (already in flight)

Datum → Ghost → Photo Massing → Annotate on the model's DWG/photo exports.
Per-tool criteria as in `docs/reviews/external-test-2026-07-26-snowdon.md`.
**Photo Massing is ⬜ untested live** — criteria: vision estimate editable,
corrected numbers (not the model's guess) drive the build, provenance says
photo, confidence < 1.0 on every photo-derived element.

## Session B2 — The office and its projects

| Step | Pass criteria |
|---|---|
| Make an office | `PATCH /cde/projects/<office-key> {kind: "office"}` (owner) → the hub shows it with an "office" badge; the Revit picker lists it as `name (key) · office` |
| Attach a project | Settings → Office selector (lead) or `PATCH /cde/projects/<key> {office_key}` → audit row with old and new office; the hub nests it under the office; `GET /cde/projects/<office>/scope` lists it |
| Rollup | the office's READINESS report: `office.model_health` evidence carries `[<project>]` lines from the project's scan; `cde.states` / `naming.containers` count the project's containers under its key; template items read the office's snapshot only |
| Empty office | an office with no projects and no data → `not_checkable`, reason "no projects belong to this office" |
| Office IDS | install an IDS on the office only → `POST /cde/<project>/propose` returns `ids_source: "office"` and the `ids@n` ref |

## Session B3 — Standards as artefacts

| Step | Pass criteria |
|---|---|
| Nothing installed | On `aster-villa` (no own ruleset/naming, office has none yet): readiness `naming.containers` → `not_checkable`, reason names `PUT /cde/:key/artefacts/naming`; the web QA scan shows "No ruleset installed for this project — install one from Packs" and does not scan; no bundled ruleset or bridge file is used anywhere |
| Import to the office | `node bridge/artefact-import.mjs --from-metadata --key aster-office` → `ruleset@1` and `naming@1` installed on `aster-office` with actor `import`; audit rows name the source slot; a row that fails validation is listed, not installed |
| Inherit | `GET /cde/aster-villa/artefacts/naming` → the office's `naming@1`; `aster-villa` readiness evidence for `office.naming_standard` and `naming.containers` names `naming@1 · office · <sha 12>` |
| Project install | Packs → install on `aster-villa` from the web (if the platform loads the app) or `PUT /cde/aster-villa/artefacts/ruleset` → `ruleset@1` on the project; the scan header names `ruleset@1 · project` |
| Superseded IDS | With open `IDS:` topics on a project, install a new `ids@n` → the PUT answers `superseded_topics`; Issues shows them under "Raised by a superseded IDS"; a lead's **Close all as superseded** closes them with one audit row; a viewer sees no button; new failures under `ids@n` raise their own topics carrying `ids_ref` |
| Document naming | A BEP whose section 6 carries a naming ruleset as a ```` ```json ```` block → **Naming candidate** lists added/removed/changed fields against the version in force and warns before a field is removed; **Install** writes the candidate whole and the pointer's `source` names the document and section |

## Session B4 — The Next strip

| Step | Pass criteria |
|---|---|
| Office journey | `GET /cde/aster-office/journey` (a member's token) → `kind: "office"`, 5 steps in order `team, standards, snapshot, readiness, projects`, `total: 5`; every `done` step has a non-empty `evidence.ref` (`projects` names `aster-tower`, `aster-villa`); `done` is a count and no field is a percentage |
| Project journey | `GET /cde/aster-villa/journey` → `kind: "project"`, `office_key: "aster-office"`, 8 steps `team, standards, bep, model, verdict, published, federated, issued`; `standards` labels read `ids@n · office · <sha 12>…`, `ruleset@1 · office · …`, `naming@1 · office · …` (the strings the verdicts print); `next` is the first `todo` step; with one live model `federated` is `not_checkable`, reason "one model only — federation needs two" |
| Membership | the same GET on a key the caller is not a member of is refused exactly as `GET /cde/<key>/files` is |
| Web strip | on `aster-villa` (if the platform loads the app): line 1 shows the three labels identical to the route; line 2 `Next: <label> — <hint>` with **Open** switching to the named project tab, and `<done> of 8 ▸ Journey` opening the Guide, whose live section lists each step with its mark, evidence label and how; stop the bridge and press ↻ → "Journey unavailable — <message>", no stale lines. If the platform does not load, record that; the route rows stand |
| Revit pane | Revit closed → deploy the add-in; open a document whose Project Setup web project is `aster-villa` → the pane's strip shows `Journey · aster-villa (project)`, the same three refs, the same next step label and `<done> of 8 done` as the route; the grey line reads `Judged by ruleset@1 · office · <sha12>…` (phase 4a: the pane judges by the project's ruleset; `(cached HH:mm)` from the cache); Scan Now and ↻ refresh it; with the bridge stopped, ↻ gives "Journey unavailable — <the connection error>" and an empty standards line |
| Honesty | no percentage on the route, the web strip, the Guide section or the pane; no step is `done` without an evidence ref; nothing on either strip writes |

## Session B5 — Revit pulls its standards from the project

| Step | Pass criteria |
|---|---|
| Pilot cut-over (before deploy) | `bds-office` exists (kind office) with `ruleset@1` (BDS 1.5.0, from the former `%AppData%\Sentinel\ruleset.json`), `ids@1` and `naming@1` (`demo/bds-pilot/bds-naming-ruleset.json`) installed through `artefact-import.mjs`; `demo` has `office_key = bds-office`; `GET /cde/demo/journey` names `ruleset@1 · office`, `ids@1 · office` and `naming@1 · office`, each with a sha |
| Bridge answers | `GET /cde/aster-tower/artefacts/ruleset` → 200 with `ETag: "ruleset@1:office:<sha256>"`; the same GET with `If-None-Match` set to that value → 304 with an empty body; `GET /cde/aster-villa/artefacts/contract` (nothing installed) → 404 `reason: "not_installed"`; `GET /cde/no-such-key/artefacts/ruleset` → 404 `reason: "no_project"`; `GET /cde/aster-tower/artefacts/nope` → 404 `reason: "unknown_kind"` |
| Deploy | Before the drill, delete `SentinelAddin\bin\Release\2024\Resources\ruleset.json` and `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\Resources\ruleset.json` if either is still present (the deploy step copies a `ruleset.json` forward when it finds one but never deletes one); Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the deployed `Resources` folder has no `ruleset.json`; renaming `%AppData%\Sentinel\ruleset.json` and `ids.json` (if still present from before the cut-over) changes no label and no row in any step below |
| Aster Tower | open the Aster Tower model (bound to `aster-tower`) → the pane's scan line reads `Judged by ruleset@1 · office · <sha 12>…`; the rows quote the Aster rules (`AST` in names and messages, never `BDS`); the Rule Set window header shows the same label, with no "office master + project overlay" subheader; `%AppData%\Sentinel\cache\aster-tower\ruleset.json` holds `ref`, `source`, `sha256` and `fetched_at` |
| Aster Villa | a model bound to `aster-villa` (no project ruleset) → the same `ruleset@1 · office · …` label and the Aster rows |
| Demo Tower (pilot) | the Demo Tower model bound to `demo` in Project Setup → scans by BDS 1.5.0, labelled `ruleset@1 · office` (from `bds-office`); the rows match the pre-cut-over pilot scan rule for rule |
| Switching documents | with Aster Tower and Demo Tower both open, switching the active document updates the pane: activating a view of the other model replaces the rows, the score, the scan line and the strip with that model's, with no Scan Now; another view of the same model or a family document leaves the pane as it was (a ruleset that lands while a family editor is in front is shown when you return); a model whose ruleset has not landed shows the loading strip until it does, never a score by none; an edit in a model the pane is not showing (e.g. a change request resolved from its own window) adds no row or toast to the shown model; ↻ on the strip refreshes the active model's journey, and an action that fails leaves one "A Sentinel action failed and was skipped: …" line in the Doctor log |
| Unbound | a model with no web project in Project Setup → the pane says `not bound — Sentinel ▸ Project Setup`, shows no percentage and no grade, and posts no scan; Project Setup's box is empty (never "default" and never the machine key) |
| Nothing installed | a model bound to a project whose office has no ruleset → the pane's score reads `Not scored — no ruleset judged this model` and its status line reads `<doc title> — none — not installed for <key> or its office`; after a sync the posted scan names no ruleset and the web's `office.model_health` reads `not_checkable` ("the latest scan names no ruleset") |
| CDE-01 | sync a workshared model whose central file name conforms to `naming@1` (e.g. `ASTR26-AST-ZZ-XX-M3-A-0001`) → no CDE-01 row; rename a copy to a non-conforming name and sync → one CDE-01 Warn row whose message and reference name `naming@1 · office · <sha 12>…` and the failing fields in the web's words; on a project with no naming installed → one CDE-01 **Monitor** note "not checked — no naming standard to judge it by: none — not installed for <key> or its office", with the score unchanged |
| Build / Apply — office | Build Office System (or Apply Standard) on the Aster template model bound to `aster-office` → the review window's "Ruleset install" section names `installed ruleset@2 · project · <sha 12>…` on `aster-office` itself, with no fork warning (there is no office above `aster-office` to stop inheriting from); every child project with no ruleset of its own (e.g. `aster-tower`) now resolves `ruleset@2 · office`; `GET /cde/aster-office/artefacts` shows the pointer with `installed_by: "revit:<Windows user>"` and `source: {tool: "revit-build", pack, document}`; the new body keeps `{org}` placeholders and every rule of `ruleset@1`; the pane rescans as `ruleset@2 · project`. Running the same pack again on the same model → "Ruleset: unchanged — ruleset@2 · project · … already carries these worksets and naming rules; nothing installed", with no `ruleset@3` |
| Build / Apply — child project | The same pack run on a model bound to a child project with no ruleset of its own (before Build) → installs `ruleset@1 · project` on that project and warns "⚠ <key> now has its own ruleset: this stops <key> inheriting ruleset@1 · office · … from its office — later office installs no longer reach it"; `GET /cde/<key>/artefacts` shows the same `installed_by`/`source` shape; the pane rescans as `ruleset@1 · project`. Running the same pack again → "Ruleset: unchanged — ruleset@1 · project · … already carries these worksets and naming rules; nothing installed" |
| Office snapshot | "Send office snapshot to Sentinel" after the office-level Build above → status names `ruleset@2 · project · …`; `GET /cde/aster-office/office/snapshot` → `ruleset.ref: "ruleset@2"` and `ruleset.sha256` equal to the pointer's |
| Bridge stopped | stop the bridge and reopen Aster Tower → the scan line says `Judged by ruleset@1 · office · <sha 12>… (cached HH:mm)`; Build → "✗ Ruleset NOT installed on <key>: the bridge did not answer (…cached HH:mm…). A cached copy is never the base of an install …"; start the bridge again and reopen → the label loses the `(cached HH:mm)` suffix |
| Governed Publish | on a project with no IDS installed → the dialog heading is "Published — not judged: no IDS installed", never the green accepted heading; with `ids@n` installed the IDS line reads `ids@n · source · <sha 12>…` from the bridge's answer |
| Honesty | every Revit surface that judges names `kind@n · source · sha`; a cached artefact says cached; `none` never scores, passes or publishes under a green heading; nothing reads a machine standard file |

## Session B6 — the delivery contract from the project

| Step | Pass criteria |
|---|---|
| Parity fixture (offline, before the drill) | `cd WebApp && npx vitest run bridge/contract-parity.test.mjs bridge/delivery-gate.test.mjs` and `dotnet run --project tools/gate-check` both green; both run every case of `WebApp/bridge/fixtures/contract-parity/cases.json` (including the `IFCMAPCONVERSION`-only georeferenced IFC4 file and the schema mismatch) to the same result, failure count and warning count |
| Pilot cut-over (before deploy) | the managed bridge runs the branch; from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/delivery-contract.json --project bds-office --kind contract` → `Installed on bds-office: contract@1 · project · <sha 12>… · by cli`; `GET /cde/demo/artefacts/contract` → 200 with `source: "office"`, `ref: "contract@1"`, the same sha and `body.ifc_schema: "IFC4"`; `GET /cde/aster-tower/artefacts/contract` and `GET /cde/aster-villa/artefacts/contract` → 404 `reason: "not_installed"` |
| Test project | create `b6-upload` in the web (Projects → + New project), no office, you its owner; `GET /cde/b6-upload/artefacts/contract` → 404 `reason: "not_installed"` |
| Bridge refuses | a file holding `{}` installed with `node bridge/artefact-import.mjs <that file> --project b6-upload --kind <kind>` for each of `contract`, `layers`, `guideline`, `type_catalog` → `HTTP 400:` with a message that starts with the kind and names a missing field; `GET /cde/b6-upload/artefacts` still shows `null` for all four |
| Deploy | Revit closed → `%AppData%\Sentinel\delivery-contract.json` renamed `delivery-contract.json.bak` (never deleted); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; `WebApp/bridge/delivery-contract.json` no longer exists on the branch |
| Demo Tower — IFC Delivery Gate | the Demo Tower model (bound to `demo`), a 3D view → the first dialog reads `Contract: contract@1 · office · <sha 12>…` (no file path); "Export active view to IFC, then certify" writes an IFC4 file (`FILE_SCHEMA(('IFC4'))` in its header); the result dialog reads `✓ PASS` or `✕ FAIL`, names `contract@1 · office · …` and lists each failure; the `.sentinel-cert.json` beside the file carries `certificate` `"PASS"` or `"FAIL"`, `contract_ref: "contract@1"`, `contract_source: "office"`, `contract_sha256` equal to the bridge's 64-hex sha, and `contract_label`; `GET /cde/demo/audit` has `IFC delivery gate PASS: <file>` or `IFC delivery gate FAIL: <file>` whose value carries `result`, `passed` (true or false), `contract_ref`, `contract_source`, `contract_sha256` |
| Parity — intake on the same file | from `WebApp`: `node bridge/intake.mjs <that .ifc> --project demo --name b6-parity.ifc --no-bcf` → the `gate` line reads `PASS · contract@1 · office · <sha 12>… · IFC4 · <n> entities` (or `FAIL · …`), the same outcome and the same number of failures as the Revit certificate; the audit row `IFC delivery gate PASS: b6-parity.ifc` (or `FAIL`) carries `contract_ref: "contract@1"` and `contract_source: "office"`. (A gate FAIL stops at `REJECTED (gate)`; a PASS meets `naming@1`, which refuses the name — no version is registered either way) |
| Aster Tower — none | the Aster Tower model (bound to `aster-tower`) → the first dialog reads `Contract: none — not installed for aster-tower or its office`; the export writes IFC2x3 (`FILE_SCHEMA(('IFC2X3'))`); the result dialog reads `NOT CHECKED` — never PASS, never FAIL — and says nothing was judged; the certificate carries `certificate: "NOT_CHECKED"`, `contract_ref: null`, `contract_label: "none — not installed for aster-tower or its office"` and the file's sha; `GET /cde/aster-tower/audit` has `IFC delivery gate NOT CHECKED: <file>` with `result: "not_checked"` and `passed: null` |
| Unbound | a model with no web project in Project Setup → the gate reads `NOT CHECKED` with `not bound — Sentinel ▸ Project Setup`; the certificate says `NOT_CHECKED`; nothing is recorded on the web |
| Governed Publish — Aster | Governed Publish on Aster Tower → the not-checked gate does not stop the flow: the IDS judges (or "Published — not judged: no IDS installed" when none is installed); the dialog's gate line reads `Delivery gate: NOT CHECKED — contract: none — not installed for aster-tower or its office`; no heading or line says the gate passed; and when the IDS rejects, the reject dialog carries the same `Delivery gate: NOT CHECKED — contract: none — …` line |
| Governed Publish — Demo | Governed Publish on Demo Tower exports IFC4 (the contract's schema; before 4b-1 it always exported IFC2x3) → the gate line reads `Delivery gate: PASS · contract@1 · office · <sha 12>… · Schema IFC4`, or the reject dialog names `contract@1 · office · …` and the failures. Demo's verdicts now follow the pilot's real contract (IFC4, `IFCCOLUMN` ≥ 1, no proxies) |
| Intake — none, then project | from `WebApp`, before the web upload below: `node bridge/intake.mjs bridge/fixtures/contract-parity/ifc4-mapconversion.ifc --project b6-upload --name b6-none.ifc --no-bcf` → gate line `NOT CHECKED · none — not installed for b6-upload or its office · IFC4`, verdict `RECORDED (published)` (or `RECORDED (upload_failed)` if the platform refuses the tiny fixture), note "No contract and no IDS installed for b6-upload or its office — nothing was judged"; audit `IFC delivery gate NOT CHECKED: b6-none.ifc` with `passed: null`. After the web upload, the same command with `--name b6-project.ifc` → gate `PASS` or `FAIL` followed by `contract@1 · project · <sha 12>…` |
| Web upload | as the owner of `b6-upload`, Project Settings ▸ Standards in force → **Install JSON…** on all seven rows; on `contract` pick `config/base-standard/delivery-contract.json` → the row reads `contract@1 · project · <sha 12>…` with your email and today's date, and the line under the rows reads `✓ contract@1 installed on b6-upload from delivery-contract.json (sha <12 hex>…).`; `GET /cde/b6-upload/artefacts` shows `installed_by` = your email and `source.file: "delivery-contract.json"`; pick a copy with `"ifc_schema": "IFC5"` → a red line `contract not installed on b6-upload:` followed by the bridge's message naming `ifc_schema`, and the row still reads `contract@1`; pick a JSON array, or a file with a top-level `"source"` → refused in the browser with the reason and no install in `GET /cde/b6-upload/audit`; a member with role `contributor` or `viewer` sees no Install JSON… on any row, and neither does anyone on the `default` project |
| Bridge stopped | stop the managed bridge → the IFC Delivery Gate on Demo Tower names `contract@1 · office · <sha 12>… (cached HH:mm)` in the first dialog, the result and the certificate's `contract_label`, and still gives a verdict; start the bridge again → the next run loses the `(cached HH:mm)` suffix |
| Honesty | every surface that judges the contract names `contract@n · source · sha` or the none reason; NOT CHECKED is never shown as a pass (no green heading; `passed` is `null`, never `true`); renaming `delivery-contract.json.bak` back to `delivery-contract.json` and rerunning the Aster gate still reads NOT CHECKED (then rename it back to `.bak`) — no workstation or bundled contract is read |

## Session B7 — layers, guideline and type catalogue from the project

| Step | Pass criteria |
|---|---|
| Pilot cut-over (before deploy) | the managed bridge runs the branch; from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers`, `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project bds-office --kind guideline`, `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project bds-office --kind type_catalog` and `node bridge/artefact-import.mjs ../demo/aster/aster-type-catalog.json --project aster-office --kind type_catalog` → each prints `Installed on <office>: <kind>@1 · project · <sha 12>… · by cli`; `GET /cde/demo/artefacts/layers`, `GET /cde/demo/artefacts/guideline` and `GET /cde/demo/artefacts/type_catalog` → 200 with `source: "office"` and `ref` `layers@1`, `guideline@1`, `type_catalog@1`, the catalogue's `body.template.title` `BDS_Project Number_Project Name (Template)` and 1434 `body.types`; `GET /cde/aster-tower/artefacts/type_catalog` → 200, `type_catalog@1`, `source: "office"`, `body.template.title` `AST_Template` and 1239 `body.types`; `GET /cde/aster-tower/artefacts/layers` and `GET /cde/aster-tower/artefacts/guideline` → 404 `reason: "not_installed"`; `GET /cde/aster-villa/artefacts/contract` still 404 `not_installed` |
| Deploy | Revit closed → in `%AppData%\Sentinel\`, `type-catalog.json` renamed `type-catalog.json.bak` and `dwg_mappings.json` renamed `dwg_mappings.json.bak` (never deleted); the keys `ghost_layer_ruleset_path`, `ghost_guideline_path` and `ghost_type_catalog_path` removed from `config.json`; `Resources\bds-guideline.json` and `Resources\bds-layers.json` deleted from `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\` and from `SentinelAddin\bin\Release\2024\` where present (the build copies files forward, it never deletes them); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the deployed `Resources` folder holds no `bds-*.json`, and neither does `SentinelAddin/Resources/` on the branch |
| Harnesses (after the renames above) | from the repo root, with no `%AppData%\Sentinel\type-catalog.json` on the machine: `dotnet run --project tools/ghost-standards-check`, `dotnet run --project tools/guideline-check`, `dotnet run --project tools/wallpair-check` and `dotnet run --project tools/ghost-p2-check` each end `<n>/<n> checks pass`, and `dotnet run --project tools/annotate-check` ends `ALL PASS`; `cd WebApp && npx vitest run src/sentinel-core/guideline-bds.test.ts bridge/artefact-store.test.mjs` is green — no harness or test reads the workstation |
| Demo Tower — Ghost Builder review | the Demo Tower model (bound to `demo`), a plan view, `demo/bds-pilot/samples/BDS-sample-plan.dxf` imported (Insert ▸ Import CAD, millimetres, or picked from the Ghost source folder); Ollama running; no `%AppData%\Sentinel\cache\demo\dwg_mappings.json` yet; Sentinel ▸ Ghost Builder on the import → the review window's header reads `Layers: layers@1 · office · <sha 12>… · Guideline: guideline@1 · office · <sha 12>… · Type catalogue: type_catalog@1 · office · <sha 12>…` (the catalogue named on this first fetch, not a none from a timeout); `A-WALL-EXT`, `A-WALL-INT`, `A-DOOR`, `A-WIND`, `A-FLOR` and `A-COLS` are `standard` rows naming `BDS_*` families and start ticked; `EXTERIOR-ENVELOPE` is an `llm` row and starts unticked; `A-ANNO-TEXT` is not listed; nothing is built before Build; in the review a row's tier shows after its element count — nothing for `standard`, `· heuristic guess` for `heuristic`, `· local model` for `llm`, `· local model (remembered)` for `cache`, `· not mapped` for `unmapped` — and its tooltip reads `Why: <rationale>` |
| Demo Tower — Ghost Builder build | Cancel the review above (the sample plan's walls are centrelines with no thickness for the guideline to read); import `demo/ghost-sample/sample-wall-thickness.dxf` (walls drawn as two faces: 200, 300, 100, 250 and one 275 mm) and run Ghost Builder; Build with the ticks as they are → the summary repeats the header's three labels and its `Walls:` line counts the walls typed by the guideline (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_300 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_EXT_STR_CONC_250 mm` where the model has the type) and those left as a reported gap (a type the model lacks is warned `WallType '<type>' not found (layer '<layer>'); skipped.`); the 275 mm wall is either typed `BDS_EXT_ARC_CMU_275 mm`, created from the nearest CMU sibling the model has and listed under the created types, or — when the model has no CMU sibling — reported as `gap: BDS_EXT_ARC_CMU_275 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · <sha 12>…)`; no gap text says "this office's template"; one Ctrl+Z removes the whole build |
| Per-project mapping cache | after an Ollama-up run on Demo Tower: `%AppData%\Sentinel\cache\demo\dwg_mappings.json` exists, holds the `EXTERIOR-ENVELOPE` answer and is stamped with the 64-hex `sha256` that `GET /cde/demo/artefacts/layers` returns; `%AppData%\Sentinel\dwg_mappings.json` is not re-created; a second Ghost Builder run on the same import shows `EXTERIOR-ENVELOPE` as a `cache` row, unticked, and the six `standard` rows still `standard` (the installed standard answers before the cache) |
| Local model unreachable | quit Ollama; delete `%AppData%\Sentinel\cache\demo\dwg_mappings.json`; Ghost Builder on the same import → the review window still opens (the run does not fail on the model); the six `standard` rows are there and ticked; `EXTERIOR-ENVELOPE` is an `unmapped` row (`· not mapped`) whose tooltip reads `Why: not mapped — local model unreachable (<the HTTP error>)`, unticked; Cancel, start Ollama again |
| Aster Tower — Ghost Builder with no layers or guideline | the Aster Tower model (bound to `aster-tower`), the same DXF imported; count the types whose name starts `BDS_` (Project Browser ▸ search `BDS_`); Ghost Builder → header `Layers: none — not installed for aster-tower or its office · Guideline: none — not installed for aster-tower or its office · Type catalogue: type_catalog@1 · office · <sha 12>…`; the six `A-*` layers are `heuristic` rows with generic families (`Generic Wall`, `Generic Door`, …), none ticked; `EXTERIOR-ENVELOPE` is an `llm` row asked afresh — `demo`'s cache does not answer it — and `%AppData%\Sentinel\cache\aster-tower\dwg_mappings.json` is written; tick `A-WALL-EXT` and Build → the summary repeats the three labels and says the walls were typed by the mapping because the guideline is none (the pre-guideline behaviour); the `BDS_` type count is unchanged; one Ctrl+Z, close without saving |
| Annotate Views — Aster | Aster Tower → Sentinel ▸ Annotate Views refuses with exactly `Guideline: none — not installed for aster-tower or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.` and creates no view |
| Annotate Views — Demo | Demo Tower → the result names `guideline@1 · office · <sha 12>…` and creates the guideline's WIP views per level (a rerun counts them under "Skipped (already exist)" and creates none); a view template the model lacks is named in a warning, never invented |
| Photo Massing — Demo | Demo Tower, Project Setup ▸ Ghost source folder = a folder of the Seagram images (`demo/aster/photos/`, built locally per `demo/aster/README.md`), the vision model running → the summary names the guideline `guideline@1 · office · <sha 12>…` and the catalogue `type_catalog@1 · office · <sha 12>…`; one Ctrl+Z removes the build |
| Photo Massing — Aster | Aster Tower, the same folder → the summary names the guideline as `none — not installed for aster-tower or its office` and the catalogue as `type_catalog@1 · office · <sha 12>…`; the massing mapping names no wall type and the guideline is none, so the walls are placed with the document's default wall type and the summary's warnings carry `Placeholder wall type '<default type>' used for <t> mm walls on '<layer>' — gap: <t> mm wall on '<layer>' — guideline: none, and the layer mapping names no wall type (type_catalog: type_catalog@1 · office · <sha 12>…). Retype before issue.` — Aster's own catalogue named in the gap text (spec definition of done) — and the `Walls:` line counts them as left as a reported gap; never typed `BDS_*`; the `BDS_` type count is unchanged; one Ctrl+Z, close without saving |
| Build Office System export | the Aster template (`AST_Template.rte`, bound to `aster-office`) → Sentinel ▸ Build Office System; close the review window without building → the dialog begins `Type catalogue exported (<n> types from AST_Template) → <path>. Install it on the office: node bridge/artefact-import.mjs "<path>" --project <office> --kind type_catalog.` (`<office>` is printed as is — the add-in cannot know the office key; for this template it is `aster-office`), `<path>` being `%AppData%\Sentinel\exports\type-catalog-AST_Template.json` (`<n>` is 1239 while the template is unchanged since the fixture's harvest); that file's top level has `template` with `title: "AST_Template"` and `extracted_at` (no workstation `path`), and no `source`; `%AppData%\Sentinel\type-catalog.json` is not re-created; from `WebApp`, `node bridge/artefact-import.mjs "<path>" --project b6-upload --kind type_catalog` → `Installed on b6-upload: type_catalog@1 · project · <sha 12>… · by cli` and `GET /cde/b6-upload/artefacts/type_catalog` → `body.template.title: "AST_Template"` (the install route kept the title) |
| Catalogue gap — the pilot's guideline in a document without its types | open the Aster Tower model detached from central (Detach and preserve worksets) and Save As `b7-gap.rvt` in a scratch folder; Project Setup ▸ Web project = `demo`; import `demo/ghost-sample/sample-wall-thickness.dxf`; Ghost Builder → the header names the three `· office` labels of `demo`; Build with the ticks as they are → the 275 mm wall on `A-WALL-EXT` is not built and the summary carries `gap: BDS_EXT_ARC_CMU_275 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · <sha 12>…)`; no type named `BDS_EXT_ARC_CMU_275 mm` exists afterwards (before phase 4b-2 the first Basic wall was cloned under that name; a `BDS_Wall_*` type provisioned for a ticked `standard` row is the installed `layers@1`'s own family name, not a shipped file); keep the copy for the next row |
| Catalogue gap — Aster's catalogue under the pilot's guideline | after the two rows above (`b6-upload` now carries Aster's harvest as `type_catalog@1`), from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project b6-upload --kind guideline` → `Installed on b6-upload: guideline@1 · project · <sha 12>… · by cli`; in `b7-gap.rvt`, Project Setup ▸ Web project = `b6-upload`; Ghost Builder on the `sample-wall-thickness.dxf` import → header `Layers: none — not installed for b6-upload or its office · Guideline: guideline@1 · project · <sha 12>… · Type catalogue: type_catalog@1 · project · <sha 12>…`; tick the `A-WALL-EXT` row (a `heuristic` row) and Build → no `A-WALL-EXT` wall is built: each is a reported gap that names the guideline's type (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_275 mm`, `BDS_EXT_ARC_CMU_300 mm`) and `type_catalog@1 · project · <sha 12>…` — Aster's catalogue, which has no comparable type (simulation F43) — never "this office's template"; no `BDS_EXT_ARC_CMU_*` type is created; discard the copy |
| Unbound | a model with no web project in Project Setup, a DXF imported → Ghost Builder's header reads `Layers: none — not bound — Sentinel ▸ Project Setup · Guideline: none — not bound — Sentinel ▸ Project Setup · Type catalogue: none — not bound — Sentinel ▸ Project Setup`; Annotate Views refuses with `Guideline: none — not bound — Sentinel ▸ Project Setup. Nothing to plan — install a guideline@n with a views section on the project or its office.` |
| Bridge stopped | stop the managed bridge → Ghost Builder on Demo Tower names all three labels with ` (cached HH:mm)`, and Annotate Views names `guideline@1 · office · <sha 12>… (cached HH:mm)`; start the bridge again → the next run loses the suffix |
| Honesty | set `ghost_layer_ruleset_path` and `ghost_guideline_path` in `%AppData%\Sentinel\config.json` to `demo/bds-pilot/bds-layers.json` and `demo/bds-pilot/bds-guideline.json` (full paths) → Annotate Views on Aster Tower still refuses with the none label, and Ghost Builder on Aster Tower still reads `Layers: none — …` with `heuristic` rows; remove both keys again. No review row reads `standard` unless its layer (or an alias) is a row of the installed `layers@n`; no `heuristic`, `llm`, `cache` or `unmapped` row starts ticked; every Ghost Builder, Photo Massing and Annotate Views surface names `kind@n · source · sha` or the none reason |

## Session C — Validate panel (the referee's home turf)

Model: same harvested-standard model, deliberately damaged first (rename a
workset, strip a param from 5 doors, import a junk CAD block into a family).

| Tool | Pass criteria |
|---|---|
| Scan Now | Finds the planted violations, zero false positives on the clean parts; re-scan after fix is clean |
| Health Scorecard | Score moves in the right direction when a planted violation is fixed; per-domain numbers sum sensibly |
| IFC Pre-Flight | Flags the 5 doors missing the pset BEFORE export; clean model passes |
| IFC Delivery Gate | A model violating the delivery contract is refused with the failing entity named; passing model exports |
| Sanitize .rfa | The junk-CAD family is flagged with the reason (nested import / geometry budget); a clean family passes |
| Heal Loaded Families | Missing shared params injected + silent reload; model re-scans cleaner afterwards; NO other family changes (diff type counts before/after) |
| Family Health | Ranks the planted bad family worst |

## Session D — Publish panel end-to-end

| Tool | Pass criteria |
|---|---|
| Governed Publish | Fail path FIRST: wrong container name → rejected, reason names the field, BCF issues auto-open in Revit AND appear on web. Then pass path: version on CDE with verdict, audit row hash-chained |
| Quick Publish | Uploads, clearly labelled ungoverned, no verdict row created |
| Auto-Publish on save | Toggle on → save twice fast → exactly one throttled upload; toggle off → nothing |
| Publish Sheets | Sheets render as PNGs, appear in web Sheets tab, right titleblocks |

## Session D2 — Governed Intake (no Revit)

| Step | Pass criteria |
|---|---|
| Install the project IDS | Documents → EIR → Compile to IDS → **Install on this project** → `GET /cde/:key/artefacts/ids` returns `ids@n` with a sha; audit row `artefact_installed ids@n` |
| Fail path FIRST | `node bridge/intake.mjs <foreign.ifc> --project <key> --name <bad name>.ifc --source cli` → `REJECTED (ids)` or a naming failure that names the field; BCF topics per failing requirement on the web Issues panel; **no** new version in Project Files |
| Gate fail | on a project with a `contract@n` installed or inherited (e.g. `demo`), a file breaking it (e.g. `--name x.ifc` on an empty IFC) → `REJECTED (gate)` with the C# sentence and `contract@n · source · <sha 12>…`; audit row `IFC delivery gate FAIL: …`; no adjudication row. With no contract anywhere the gate is `NOT CHECKED` and the flow continues to the IDS — never `REJECTED (gate)` |
| Pass path | a conforming name and a model that meets the installed IDS → `ACCEPTED (published)`; version in Project Files with the ✓ badge; `POST /receipt/:key/verify` matches; `ids_ref` names the artefact |
| Recorded | with no IDS and no contract on a fresh project → `RECORDED (published)`, gate `NOT CHECKED`, and the note "No contract and no IDS installed for <key> or its office — nothing was judged"; with a contract that passes and no IDS → `RECORDED (published)` and the note "… published on the delivery-gate pass alone" |

## Session D3 — Federation Gate (data clash before geometric clash)

| Step | Pass criteria |
|---|---|
| Manifests | Every model published through Governed Intake or the outbox watcher shows `has_manifest: true` in `GET /cde/:key/manifests`; an older version is backfilled with `node bridge/manifest.mjs <file.ifc> --project <key> --version <id>` |
| Fail path FIRST | Two models planted with the S11 mismatch (a shared GlobalId, `Wall 1` against `W-A1-Fin`, a level 20 mm off, a grid tag missing, one model without a georeference) → `node bridge/federation.mjs --project <key> --versions <a>,<b>` prints **FAIL** with FG-01, FG-02, FG-03, FG-04 and FG-05 each naming the models and values; one BCF topic per failing check on the web Issues panel; audit row `Federation gate FAIL: 2 model(s)` |
| Pass path | Two consistent models → **PASS**, every check `✓`, FG-02 says "no type rule installed — naming shapes compared only" when none is; audit row `Federation gate PASS` |
| Not checkable | One manifest only → **NOT CHECKABLE** with the reason and the model that lacks a manifest named |
| Surfaces | The web clash panel banner shows the same verdict and goes STALE after a new version is published; the Revit Clash Manager header shows the same line for the document's project |

## Session E — Coordinate panel (needs two machines or two sessions)

Prereq: Session D published a version. Second seat = the browser on another
tailnet device (phone works).

| Tool | Pass criteria |
|---|---|
| Show Panel (live coordination) | Violations update on sync without reopening |
| BCF Issues | Issue raised in browser → appears in Revit < 10 s; double-click zooms the right element with reviewer's camera; reply round-trips |
| Change Requests | Edit a governed element → request appears; reject restores the OLD value exactly; approve keeps it; both audited |
| Clash Manager | Link Snowdon structural: known overlaps found, severity plausible, 3D view isolates the pair, BCF export opens in the web register |
| Clash Register (Revit, read-only) | Mirrors the web register without re-running |
| MEP Openings | Link Snowdon MEP: provision-for-void families land at real duct/structure intersections, sized sanely, none floating in air |
| Review Flag | Creates the param once; second run no-ops politely |

## Session F — Web app, reviewer seat (no Revit open)

Prereqs: sessions B–E produced versions, issues, clashes, sheets.

| Feature | Pass criteria |
|---|---|
| Viewer + BIM tools | Fragment loads < 10 s for the Snowdon IFC; measure/section/explode work; selection shows correct properties |
| Plans / Sheets / Views | 2D plans navigable; published sheet PNGs present; saved views restore camera |
| Projects hub | Create project, switch, error states distinguish 401 vs down (known gap — log it) |
| Issues / RFI | Full lifecycle browser-side: raise, assign, resolve; states survive reload; RFI links to element + version |
| CDE + Assets | ISO 19650 container states transition legally (and refuse illegal jumps); version compare shows real deltas; set-live works and is audited |
| Data table | Element data matches what Revit shows for 10 spot-checked elements |
| QA panel | Same verdicts as Revit Scan Now for the same model (the one-engine claim, tested) |
| Standards / Packs | Harvested pack from Session A visible, installable, drives the active ruleset label |

## Session G — Web app, non-modeller seats

| Feature | Pass criteria |
|---|---|
| Cost (5D) | Quantities match a hand takeoff of 3 walls ± rounding; rates clearly labelled demo-seed |
| Carbon (6D) | Same spine as cost (change a quantity upstream → both move) |
| COBie | Export opens in Excel with the model's real spaces/assets, not placeholders |
| Owner dashboard | Reads correctly with zero BIM literacy — test on an actual non-BIM person in the room |
| Tender | Package assembles from the governed version only |
| Timeline (4D) | Elements sequence by the field it claims to read |
| Reality Capture | Load any free point cloud; navigation usable |
| Copilot (chat + agent) | Ask "what changed since version N?" → correct answer from real data; agent raises an issue → identical audit trail to a human raising it; local model only, verify zero cloud calls |

## Session H — Adversarial pass (after A–G are 🟨 or better)

The Snowdon-sheet-exports trick, generalised: wrong inputs on purpose.
Empty folder, DWG with zero known layers, IFC with 0 elements, container
named `final_v2.ifc`, publish with bridge stopped, sign-out mid-session,
two browsers editing the same issue. Pass = every failure is loud, named,
and recoverable; nothing silent, nothing stuck.

---

## Ledger

Update in place; date + reviews-file link on every non-⬜ entry.

| Surface | Status | Evidence |
|---|---|---|
| Model-from-Drawings chain | ✅ verified | reviews/external-test-2026-07-26-snowdon.md |
| Governed Publish loop | ✅ verified | handbook 05, G1–G4 + 2026-07-26 |
| Base/standard swap | ✅ verified | handbook 05, 2026-07-26 |
| Auth gate + HTTPS + platform browser session | ✅ verified | 2026-07-26 live debug |
| Session A — onboard foreign model (Build Office System, Apply Standard, Rule Set, Ingest Docs) | ✅ verified | reviews/session-a-2026-07-27-golden-nugget.md — PASS, 1 med 3 low |
| Session C — Validate panel (Scan, Fix loop, Scorecard, Pre-Flight, Delivery Gate, Sanitize) | 🟨 ran, issues | reviews/session-c-2026-07-28-golden-nugget.md — COMPLETE 2026-08-04: HIGH fixed+retested; Heal 194/194 (3 new findings, 1 med); pset drill rolled into Session D |
| Everything else above | ⬜ untested | — |

*The gap between the handbook's 🟩 Built rows and this ledger's ⬜ rows is
the honest maturity picture. Close it session by session, not by adjective.*
