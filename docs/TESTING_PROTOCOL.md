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
| Intake — none, then project | from `WebApp`, before the web upload below: `node bridge/intake.mjs <any .ifc in bridge/fixtures/contract-parity/> --project b6-upload --name b6-none.ifc --no-bcf` → gate line `NOT CHECKED · none — not installed for b6-upload or its office · IFC4`, verdict `RECORDED (published)` (or `RECORDED (upload_failed)` if the platform refuses the tiny fixture), note "No contract and no IDS installed for b6-upload or its office — nothing was judged"; audit `IFC delivery gate NOT CHECKED: b6-none.ifc` with `passed: null`. After the web upload, the same command with `--name b6-project.ifc` → gate `PASS` or `FAIL` followed by `contract@1 · project · <sha 12>…` |
| Web upload | as the owner of `b6-upload`, Project Settings ▸ Standards in force → **Install JSON…** on all seven rows; on `contract` pick `config/base-standard/delivery-contract.json` → the row reads `contract@1 · project · <sha 12>…` with your email and today's date, and the line under the rows reads `✓ contract@1 installed on b6-upload from delivery-contract.json (sha <12 hex>…).`; `GET /cde/b6-upload/artefacts` shows `installed_by` = your email and `source.file: "delivery-contract.json"`; pick a copy with `"ifc_schema": "IFC5"` → a red line `contract not installed on b6-upload:` followed by the bridge's message naming `ifc_schema`, and the row still reads `contract@1`; pick a JSON array, or a file with a top-level `"source"` → refused in the browser with the reason and no install in `GET /cde/b6-upload/audit`; a member with role `contributor` or `viewer` sees no Install JSON… on any row, and neither does anyone on the `default` project |
| Bridge stopped | stop the managed bridge → the IFC Delivery Gate on Demo Tower names `contract@1 · office · <sha 12>… (cached HH:mm)` in the first dialog, the result and the certificate's `contract_label`, and still gives a verdict; start the bridge again → the next run loses the `(cached HH:mm)` suffix |
| Honesty | every surface that judges the contract names `contract@n · source · sha` or the none reason; NOT CHECKED is never shown as a pass (no green heading; `passed` is `null`, never `true`); renaming `delivery-contract.json.bak` back to `delivery-contract.json` and rerunning the Aster gate still reads NOT CHECKED (then rename it back to `.bak`) — no workstation or bundled contract is read |

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
