# Simulation room — run record, 2026-09-21 → 23 (Aster Studio)

The first run of `SIMULATION_ROOM.md`. The operator played Aster Studio; Claude drove the bridge, the
Revit MCP for seeding, and the fixes. Every pass below is backed by a bridge audit id, a downloaded file or
a screenshot; every tool not exercised is marked **not run**, never assumed.

**Headline:** the office readiness assessment moved from **3 met / 8 violation** (Assessment 1) to
**8 met / 3 violation** (Assessment 2 and 3) using only Sentinel's own tools plus one honest workaround,
and the first project ran the full referee loop: governed publish rejected → fixed in Revit → re-judged →
accepted with a verifiable receipt (audits 640 → 643 → 657). Forty-six findings were logged; twenty-one
were fixed during the run. The governed-AI act ran end to end (grid applied, wall declined, level
withdrawn, each with a note in the ledger). The datum → ghost → annotate → massing chain ran on the
Aster template and exposed the pilot's guideline as the machine's only office profile (F43/F44).

## Acts

| Act | Steps done | Evidence |
|---|---|---|
| 1 Assessment | 1.1–1.10 all | READINESS v1 (audit 514): measured 3/8/2, 17 declared answers by the lead, 21 plan rows, report md |
| 2 Setup | 2.1–2.8 all | v2: 8/3/2. Ruleset `org: AST` (item 5 met), bulk type rename 109/115 = 95 % (item 3 met, done outside the tool — audit 526 says so), worksets built from the PDF, 212 families healed, 3 task teams (item 12), BEP 5/10 controlling (item 19), pack `ast-std-001` (item 7) |
| 3 First project | 3.1–3.7, 3.9, 3.10 | EIR ingested + compiled (5 specs, 1 unmatched); BEP bound; 12 deliverables; gate PASS after trims; IDS rejected 42 doors (bd320d2c) → Fix in Revit 42/42 → Resolved with receipt; renamed central → ACCEPTED, published v2, deliverable **delivered** with 2 honest exceptions (v2/S0 vs P01/S2); weekly report; rebaseline +14 d applied. 3.9 on a fresh project from the template: 11 grids + 14 levels from the two DXFs (F40 "(2)" names, F41 inches ×25.4 — both fixed), Ghost Builder empty/ceiling proposal (F45), Annotate 96 views with the pilot's names and templates (F44), Photo Massing placed 0 (F43/F46). 3.8 **not run** (no MEP link) |
| 4 Governed AI | 4.1–4.4 | 4.1 the agent posted three changesets (grid, wall, level) via the API; 4.2 Review AI Proposals: grid **applied** 11/11 with a note (c85e6da9), wall **declined** with the note "Cuts through the core — rejected" (f2fc0969), level **withdrawn** by the agent (f61222c4, audit 685); 4.3 receipt 657 verifies, a tampered copy is refused; 4.4 ROI Dashboard opens (F39) |
| 5 Handover | 5.2, 5.3 | Assessment 3 published (v3); matrix below. 5.1 exports **blocked**: they need a model in the platform viewer (F49) |

Assessment 1 → 3, measured items: template types 0 → 109/115 · shared params missing → met · naming standard none → `ast-std-001` · task teams none → 3 · BEP 0 % → 50 % · roles met throughout · worksets honestly *not checkable* from a `.rte` · model health 103 → 85 warn (still > 25) · CDE states and container names remain violations on the office key (the delivered container lives on `aster-tower` — see F23).

## Per-tool matrix

Status: **pass** (evidence) · **fail** (finding) · **not run**.

### Revit ribbon
| Tool | Status | Evidence / finding |
|---|---|---|
| Show Panel | pass | scan panel populated on open (1.5) |
| Scan Now | pass | scan received, audits 466/516/533 |
| Health Scorecard | pass | 18.3 % F, 277 issues — consistent with the scan |
| Rule Set | pass, F8 | showed `AST` after swap; pilot wording leaked from ruleset data |
| Change Requests | pass | opens, 0 pending — nothing tracked changed since the snapshot |
| Review Flag | pass | creates `ZZZ_ReviewStatus`; names the one Browser Organization step the API cannot do |
| Project Setup | pass | web project per document; F23 (office vs project key) |
| Build Office System | pass | snapshot button + refusal guard for document packs |
| Send office snapshot | pass, F13 | audits 434/465/515/532; first post 500ed (fixed 0a2b09d) |
| Apply Standard / Load pack | not run | |
| Ingest Docs | pass, F14/F15 | 4/5 worksets read; false shared parameter; sheet separator lost; whitelist overwritten |
| Naming Manager | pass, F9/F10/F11 | auto 5/5 + manual 2/2 with receipts (524/525); 140 "needs a human" on a stock template |
| Sanitize .rfa | not run | |
| Heal Loaded Families | pass, F16 | 212/212 healed (one gate: `AST_Description`); no ledger row |
| IFC Pre-Flight | pass | 826 issues under IFC-01/IFC-02, listed in the panel |
| IFC Delivery Gate | pass, F25 (fixed) | FAIL 627/628 → PASS 635/639/653; walls counted as 0 until subtype fix; trims = real proxies |
| Governed Publish | pass, F26/F27/F29/F31 (fixed/open) | rejected 640 → accepted 657; judged by pilot IDS/contract/ruleset until swapped |
| Quick Publish (ungoverned) | pass, F12/F23/F24 | went to the office key first; duplicate containers per user |
| Auto-Publish on save | pass (observed) | every sync auto-published |
| Publish Views / Sheets | not run | |
| BCF Issues (Fix in Revit) | pass, F30 (fixed)/F32 | 42/42 → Resolved, receipt; panel listed the machine project until fixed |
| Clash Manager / Register | not run | |
| MEP Openings | not run | |
| 1 · Datum from Drawings | pass, F40/F41 (fixed)/F42 | 11 grids + 14 levels from the two DXFs; names "(2)", heights ×25.4 until fixed |
| 2 · Ghost Builder | pass, F45 | honest empty proposal on the grid plan; A-LEVELS → Generic Ceiling (LLM 0.8, unticked) on the section |
| 2b · Photo Massing | pass after fixes, F43 (partly fixed)/F46/F52–F55 | first runs Placed 0 (pilot type name not in the Aster template, and — F54 — "not in the template" even on the pilot's own template); after 2945a0c + 1aeffff: Placed 150 on the pilot template with the real `BDS_EXT_ARC_CMU_200 mm` walls and a declared floor placeholder. The result is a rectangular envelope from four numbers, never a likeness of the photographed building |
| 3 · Annotate Views | fail, F44 | 96 views created with the pilot's names, all without their (pilot) templates |
| Review AI Proposals | pass, F36/F37/F38 | applied / declined with notes; withdrawn one gone; judged with no project IDS |
| ROI Dashboard | fail, F39 | machine-wide counter at a flat rate, not a project figure |

### Web panels
| Panel | Status | Evidence / finding |
|---|---|---|
| Main / Owner | pass | projects visible after the orphaned-membership fix (data) |
| Dashboard | pass, F50 | stage Design, 3 open issues, 0 block violations; health/compliance/cost honestly "—" without a model — but the stage gate shows **GATE PASS** with two of its three criteria at "no data" |
| Project Files | pass | containers + versions; wip→shared→published (3.6 via bridge) |
| Documents — BEP | pass, F18 (fixed) | Suggest bindings, strip test 40 → 50 %, Draft with AI (Ollama) |
| Documents — EIR | pass, F1/F2/F21 (fixed) | ingest docx + pdf; Compile to IDS added |
| Documents — READINESS | pass, F5/F6/F7/F20 (fixed) | answers, plan, versions v1–v3, md report |
| Deliverables | pass, F17 (fixed)/F33 (fixed)/F34 | teams, paste schedule, status, weekly report, rebaseline |
| Settings | pass | members with roles |
| Issues | pass, F51 | 4 topics listed from the user's side: the resolved 42-door topic, the web-raised level-naming topic (assigned), and two **stale** topics from the pilot-IDS run (Pset_BDS.Discipline 103, wall FireRating 97) still Open |
| RFIs | pass | RFI-001 "Fire rating of corridor doors", open, unassigned |
| Clash · CDE · Cost 5D · Carbon 6D · 4D Sequence · COBie 7D · Tender · Browser · Properties · Visibility · Views · Sheets · Model · Copilot | **blocked**, F49 | the platform's viewer pane never initializes: its injected runtime asks the app's engine for two beta-only classes; our model load itself succeeded (1.0 MB downloaded, handed to the fragments engine) |

## Findings

Fixed during the run are marked with the commit. "Product" = a real gap worth a backlog item.

| # | Finding | Status |
|---|---|---|
| F1 | A naming standard has no document type; it had to be filed as an EIR (1/7 sections) | product |
| F2 | BEP ingest left sections 6 and 8 empty although the docx had prose | check the unassigned list |
| F3 | (closed) PDF ingest path verified | — |
| F4 | Closing a terminal leaves the bridge node process alive on :4100 | ops note |
| F5/F6 | Saving an answer blanked the page for seconds; owner field was free text | fixed e454b21 |
| F7 | Not-checkable plan rows said "reports met" and could never close | fixed 31045e0 |
| F8 | Rule Set showed the pilot's prose/patterns under `AST` — ruleset data, not code | kit fixed e237a19; product: office ruleset authoring |
| F9 | Naming Manager proposes 5/145 on a stock template; 140 need typing | **product, major**: assisted bulk naming |
| F10 | "conforming 0" while conforming types exist | minor |
| F11 | FN-01 accepts `AST_` + anything with an underscore | product: family rule too loose |
| F12 | Sync auto-publish creates a container per user's local file title | **bug** (open) |
| F13 | Snapshot drops ruleset name/version | minor |
| F14 | Ingest Docs: false shared parameter, wrong family example, sheet separator lost, two conventions missed | product |
| F15 | Build ticked items overwrote WS-01 whitelist with the ingested subset | bug (open) |
| F16 | Heal report names no gate and leaves no ledger row | product |
| F17 | Team lead free text → members datalist | fixed ca79635/9aaa95b |
| F18 | Suggest bindings applied only the first section (stale token) | fixed 7a2f9c6 |
| F19 | No UI to install a container naming ruleset; two "rulesets" share one slot | **product** |
| F20 | Published document could only go to archived | fixed cc87446 |
| F21 | Compile-to-IDS had no UI | fixed a66ff75 |
| F22 | Publish label falls back to `vN` when left blank | minor |
| F23 | Office = one project key; a second project's models leave the office view | **design** (spec deferred; now real) |
| F24 | Quick Publish ran 3× (v1–v3) | minor |
| F25 | Gate counted `IFCWALL` literally; Revit writes `IFCWALLSTANDARDCASE` | fixed 590a43c + gate-check |
| F26 | Delivery contract is machine-global (`bds-default`) | product (same class as F8) |
| F27 | Compiled IDS had `pset: null` → unusable | fixed a738e1d |
| F28 | Extractor reads 4 properties; LoadBearing and Space.Reference cannot be measured | **product** (PsetMap rows) |
| F29 | `ids.json` is machine-global | product (same class as F8/F26) |
| F30 | BCF panel used the machine project id | fixed 90a471e |
| F31 | `/propose` judged names by the bridge default, not the project pack | fixed c074106 |
| F32 | Re-check after resolution posts duplicate comments | minor |
| F33 | Deliverables matched `NAME` ≠ `NAME.ifc` | fixed e203f8b |
| F34 | Kit doc mislabelled the rebaseline body shape | doc |
| F35 | Receipt verification requires a bearer — no public verify | product |
| F36 | Changesets are judged against the server's `SENTINEL_IDS` only; the project's compiled IDS is not used, so nothing can be pre-ticked | **product** |
| F37 | Declining with zero ticked rows closes the review window silently | minor |
| F38 | Review AI Proposals opens the oldest pending changeset — no picker | minor |
| F39 | ROI Dashboard sums every intervention ever logged on the machine (`roi.json`, no project field, 940 entries since July) at a flat 5 min × $35/h; 31 entries of two kinds are not shown by type | **product** |
| F40 | Datum named every level after the first "Level N (2)" — the uniqueness check counted the level just created | fixed ecb2691 |
| F41 | Kit DXFs had no `$INSUNITS` header → Revit imported them as inches (Level 1 at 114 300 mm, grids 190 m apart) | kit fixed ecb2691 + confirm-dialog warning above 250 m |
| F42 | README claimed the DXF labels name the levels; the tool reads lines only and names `Level 0…N` | doc fixed ecb2691 |
| F43 | Photo Massing resolved the wall type by the shipped pilot guideline (`BDS_EXT_ARC_CMU_200 mm`, ×92) and found "no comparable type" although `AST_EXT_ARC_CMU_200 mm` exists; floor type empty (×23) → Placed 0 | partly fixed 2945a0c (massing places the template's default types, declared as placeholders); **product** remains: the guideline is per office by design but only the pilot's profile ships |
| F44 | Annotate Views created 96 views with the pilot's names (`WIP_FP_…`) and templates (`01.100_WIP_…`) from the same guideline, not Aster's `DISC_LEVEL_TYPE_DESC` from the installed ruleset | **product** (two view standards in two files) |
| F45 | Ghost Builder proposes the datum layer (`A-LEVELS → Generic Ceiling`) that Datum already consumed | minor |
| F46 | Vision estimate from four whole-building photos: 2 m footprint, 23 storeys, 2.1 m storey for a 38-storey tower — the amber confirm is the only guard | observation |
| F47 | Project Setup → Browse for the Ghost source folder on Revit ≤ 2024 showed "paste the path" (no folder dialog in .NET Framework WPF) | fixed 22670e4 (WinForms picker), deploy pending |
| F48 | "Loaded v2 into the viewer ✓" is reported without checking that a renderer exists | minor |
| F50 | Dashboard stage gate reports **GATE PASS** while model health and standards compliance are "no data" — a pass on unmeasured criteria; should read blocked / not checkable until a model is loaded | **product** (honesty rule) |
| F51 | Topics raised by a superseded IDS (the pilot's, before the Aster IDS was installed) stay Open on the project with no "superseded" state or bulk close | minor |
| F52 | Vision notes echoed JSON punctuation (`}, {`) as the note | fixed 2945a0c |
| F53 | Massing review said "Storeys capped at the 200 mm maximum" — a count labelled in millimetres | fixed 1890f54 |
| F54 | The guideline's "is this type in the office template" check reads the machine-global `type-catalog.json`, last harvested from the Aster tower, so on the pilot's own template it denied the pilot's type; the open document now decides | fixed 1890f54; product: one more machine-global office file |
| F55 | A corrected field in the massing review keeps the estimate's note ("raised to the 2000 mm minimum" beside a typed 47000) | minor |
| F49 | **Platform viewer does not initialize.** The That Open Platform injects its own viewer runtime into the viewer frame (`VMnnn`, deferred-pipeline shaders, ghost LOD — not our code, not any public package); it reads `PostproductionAspect.DEFERRED` and `NearPlaneLineMaterial` from the app's engine, both beta-only, so with the public engine we ship it throws before the pane starts. Same result with local dev mode on and off, and after publishing 1.0.19. Also found on the way: the CLI login token had expired since July (the CLI does not use the browser session); `npm run login` writes into the tracked `WebApp/.thatopen`; `@thatopen/services` is 0.3.11 vs 0.16.1 | **blocked by the platform** — needs the beta engine we lost access to in July (735bda4), or a platform fix; raise with That Open |
| — | Orphaned memberships after an account was recreated (data) | data fixed; product: FK + flag unknown users |

## Still owed (needs the user at Revit or the browser)
Deploy 22670e4 (folder picker) at the next Revit close. 3.8 MEP Openings (no MEP link in the kit — stays not run). 3.11 and 5.1 stay blocked until the platform viewer runs on the public engine (F49). ecb2691 was deployed and re-verified live on 2026-09-23: Level 1 +4500 … Level 14 +47400, names clean, 11 grids.

## Restore after the simulation (machine-global files under `%AppData%\Sentinel`)
`ruleset.json` ← `ruleset.json.bak-BDS-pilot-1.5.0` · `ids.json` ← `ids.json.bak-BDS-pilot` · `delivery-contract.json` untouched. Redeploy is not needed for these.

## Governed Intake drill (Session D2), 2026-09-23

Feature `feature/governed-intake` (Features Update 1.1, cohesion phase 1), run from the CLI against the
branch's bridge; every line below is a bridge response or an audit id.

| Step | Result | Evidence |
|---|---|---|
| Install the project IDS | `ids@3` on `aster-tower` (the compiled Aster EIR), `ids@1` on `aster-office` (a one-spec wall FireRating IDS for the pass path) | `artefact_installed` rows; `GET /cde/aster-tower/artefacts` |
| Fail path first — Golden Nugget IFC (25.3 MB, IFC2X3, 457 821 entities) with a non-conforming name | **REJECTED (ids)**: gate PASS on `bridge-default`; naming ✗ "expected 7 '-'-separated fields …, got 1"; 811 elements read, 0 skipped; 4 IDS failures (2 walls without `Pset_WallCommon.LoadBearing`, 2 windows without `Pset_WindowCommon.ThermalTransmittance`); 2 BCF topics raised; no version | audit 695, receipt `1b0f8c6d…` |
| Same file, conforming name `ASTR26-AST-ZZ-XX-M3-A-0003.ifc` | **REJECTED (ids)**: naming ok, the same 4 failures, 0 new topics (de-duplicated against the open ones), no version | audit 699 |
| Pass path — the test fixture as `ASTR26-AST-ZZ-XX-M3-A-0009.ifc` on `aster-office` | **ACCEPTED (published)**: gate PASS (IFC4, 32 entities), naming ok, `ids@1` in scope 1 / passing 1, fragments uploaded (platform item `6ab3636f…`), version **P01 wip live** registered with sha, verdict stamped on the version | audits 701 (gate PASS) · 702 (proposal accepted) · 703 (container) · 704 (set live) · 705 (uploaded) · 706 (`verdict:accepted`); every `entity_id` a uuid or null |
| Receipt | `GET /receipt/aster-office/702` → `POST …/verify` → `matches: true`; the same receipt with the verdict flipped → `matches: false`, "verdict does not match the ledger (receipt: rejected, ledger: accepted)" | — |
| Bridge log | no errors during the drill | managed server log |

Not exercised: the web **Install on this project** button (the platform viewer is blocked, F49, and
the button lives in the Documents panel which needs the founder signed in) — the same route was
exercised through the import CLI and a direct PUT. Left in place from the drill: `ids@1` on
`aster-office`, the fixture container on `aster-office`, two open IDS topics on `aster-tower` from the
Golden Nugget run, `ids@1..3` on `aster-tower` (same content, three installs). Reviewer follow-up
recorded for phase 1: exclude `store = 'artefact'` from the `bridge_docs` authenticated write policy
so only the bridge (service role) writes artefacts; until then a rewritten document is exposed by the
verdict's `ids_sha256` and the `pointer_sha_mismatch` flag, not prevented.

## Federation Gate drill (Session D3), 2026-09-23

Feature `feature/federation-gate` (Features Update 3.0), run from the CLI against the branch's bridge on
`aster-office` (Aster naming pack with the `TN-01` type rule, drill IDS requiring `Pset_WallCommon.FireRating`).
Every line is a bridge response or an audit id.

| Step | Result | Evidence |
|---|---|---|
| Manifests on publish | five fixtures taken in through Governed Intake (`fed-a` → `…-0101`, `fed-b` → `…-0102`, `fed-c` → `…-0103`, two drill copies with type names that satisfy `TN-01` → `…-0104`, `…-0105`); each `ACCEPTED (published)` with a manifest captured; `GET /cde/aster-office/manifests` lists them `has_manifest: true` and the five older Revit/quick-published models `false` | audits 709, 716, 723, 732, 739 |
| Fail path first — the planted pair `0101` + `0102` | **FAIL**: FG-01 `7YvctVUKr0kugbFTf53O9L` in both; FG-02 `space·2` (`Wall 1`, `Wall 2`) against `hyphen·3` (`W-A1-Fin`, `W-A2-Fin`) and every type name failing `TN-01`; FG-03 `Level 1` at 0 vs 20 mm; FG-04 `B` vs `C`; FG-05 `…-0102` carries no georeference; FG-06 pass (both named to the rule, both accepted) | audit row `Federation gate FAIL: 2 model(s)`; BCF topics one per failing check (raised on the first run, "0 raised, 5 already open" on the second) |
| Pass path — the consistent pair `0104` + `0105` | **PASS**: all six checks `✓`, FG-02 with the type rule applied (`rule TN-01`) | audit row `Federation gate PASS: 2 model(s)` |
| Not checkable — `0101` alone | **NOT CHECKABLE** (1 of 1 manifests), every check carrying the reason; `GET …/federation` → `scope: explicit`, `stale: false` | audit row `Federation gate NOT CHECKABLE: 1 model(s)` |
| Full run (all ten live models, no explicit list) | **FAIL**: the four quick-published Revit containers fail FG-06 (names not in the 7-field pattern, no verdict) and are listed "no manifest"; the planted checks fail as above | audit row `Federation gate FAIL: 8 model(s)` (run before `0104`/`0105` existed) |
| Bridge log | the only errors are the fragments importer throwing on the fixtures' placement-less `IfcGrid` during conversion; the upload helper fell back to the raw IFC as designed and every version registered | managed server log |

Not exercised: the web clash-panel banner (platform viewer blocked, F49) and the Revit Clash Manager line
(compiled, deploy pending at the next Revit close). Left in place on `aster-office`: five fixture
containers, their manifests and revisions, and six open `Federation:` topics. Product note carried from the
final review: manifest capture is not idempotent (a repeated backfill orphans the earlier revision rows).

## Office entity drill (Session B2), 2026-09-23

Feature `feature/office-entity` (cohesion phase 2). Migration `0029_project_office.sql` applied to the live
database first (`select key, kind, office_key from projects` showed every row `project` / `null`). The
managed bridge was restarted on the branch. Every line is a bridge response.

| Step | Result | Evidence |
|---|---|---|
| `PATCH /cde/projects/aster-office {kind: office}` | row returned with `kind: "office"`, `office_key: null` | response body |
| `PATCH /cde/projects/aster-tower {office_key: aster-office}` | row returned with `kind: "project"`, `office_key: "aster-office"` | response body |
| `GET /cde/projects/aster-office/scope` | `{ kind: "office", keys: ["aster-office", "aster-tower"] }` | response body |
| Guard: `PATCH aster-office {office_key: aster-office}` | refused by the trigger ("an office cannot belong to an office"); surfaced as a 500 rather than 409 (backlog) | bridge log |
| Office readiness (`READINESS cb8f72db`) | item 6 model health `violation` with `[aster-office] WS-01 … [aster-tower] …` evidence lines; item 20 CDE states `aster-office: 10 of 10 … | aster-tower: 3 of 4 container(s) are not published`, evidence `[aster-tower] …`; item 21 naming likewise; items 7/11/12/19 `met` with one line per project; template items 1–5 unchanged (office's own snapshot) | readiness JSON |
| New child `POST /cde/projects {key: aster-villa, office_key: aster-office}` | created `kind: "project"`, `office_key: "aster-office"`; `GET /cde/aster-villa/artefacts/ids` → 404 (no IDS of its own) | response bodies |
| `POST /cde/aster-villa/propose {elements: []}` | `ids_source: "office"`, `ids_ref: "ids@1"`, `ids_sha256: 72b7f3a0…`, verdict `accepted` — judged by the IDS installed on `aster-office` alone | response body |

Not exercised: hub grouping and the settings office selector in the browser (platform viewer blocked,
F49; type-checked and built), the Revit picker label at runtime (compiled, deploy pending). Left in place:
`aster-office` is now an office, `aster-tower` and the empty `aster-villa` belong to it. Backlog from the
final review: scope route has no membership check; trigger exceptions map to 500 instead of 409; the spec's
per-item office semantics were replaced by generic worst-wins (spec to be amended); each readiness check
re-resolves the scope.

## Standards-as-artefacts drill (Session B3), 2026-09-24

Feature `feature/standards-artefacts` (cohesion phase 3). Managed bridge restarted on the branch. Before the drill the
legacy IDS pointers were restamped with the canonical (key-sorted) sha, because `bridge_docs.data` is jsonb and
reorders keys, so every pre-existing artefact showed `pointer_sha_mismatch: true` (final review finding, fixed 6dddf5a).
Every line is a bridge response or an audit id.

| Step | Result | Evidence |
|---|---|---|
| Nothing installed | `GET /cde/aster-villa/artefacts/naming` → 404 "no naming artefact installed for aster-villa or its office (PUT /cde/aster-villa/artefacts/naming)" | response body |
| Import from the metadata slot | `artefact-import --from-metadata --key aster-office --dry-run` → "would install ruleset … naming (ast-std-001 1.0.0)"; real run → `ruleset@1 · project · fb8f9baefa9f…`, `naming@1 · project · 43c954e892d0…`, actor `import` | CLI output, install audit rows |
| Inheritance | `GET /cde/aster-villa/artefacts/naming` → `source: office, ref: naming@1, pointer_sha_mismatch: false`; `…/ruleset` → `ruleset@1 · office` | response bodies |
| Office readiness item 7 | `met` — `aster-office: naming@1 · project · 43c954e892d0… | aster-tower: naming@1 · office · … | aster-villa: naming@1 · office · …`, one evidence line per project | readiness JSON |
| Federation on the office | FG-02 `refs: {ruleset: "ruleset@1 · project · fb8f9baefa9f…", naming: "naming@1 · project · 43c954e892d0…"}`; run verdict `fail` on the planted pair as before | federation JSON |
| Proposal on villa with a name | `naming_ref: naming@1, naming_source: office, naming_sha256: 43c954…`, `ids_source: office` | response body |
| Superseded IDS topics | proposal of a wall without FireRating on villa under office `ids@3` → rejected, topic raised with `ids_ref: ids@3, ids_source: office` (audit 770); `PUT /cde/aster-office/artefacts/ids` (`ids@4`) → `superseded_topics: [8271f746…]`, the villa topic now `superseded_by: ids@4` (audit 772); `POST /cde/aster-villa/artefacts/ids/close-superseded` → `closed: 1` (audit 773); no auto-close before that | response bodies, audits 770–773 |
| Bridge log | no errors during the drill except my own malformed first proposal (`psets` must be an array); stale local project rows are now skipped with a warning instead of failing `GET /projects` (fix 4751515) | managed server log |

Not exercised: the web QA-scan "No ruleset installed" state, the Packs install, the Settings "Standards in force" block and
the Issues "superseded" group in a browser (platform viewer blocked, F49; type-checked and built). Observed: an em dash
sent from the Windows shell arrived as `�` in a topic title — the earlier `ids@1` title on the office shows the same,
so it is the drill's shell encoding, not the bridge; verify once from the web UI. Left in place on `aster-office`:
`ruleset@1`, `naming@1`, `ids@1..4`; on `aster-villa`: one closed superseded topic.

## Next strip drill (Session B4), 2026-09-24

Feature `feature/next-strip` (the cohesion review's Next strip graft). Managed bridge restarted on the branch; add-in
deployed to Revit 2024 with Revit closed (02:29). Every line is a bridge response.

| Step | Result | Evidence |
|---|---|---|
| Project journey, `aster-villa` | 1 of 8, next `team` ("needs an owner and a lead (0 owner, 0 lead)" — villa was created by the drill with the service token, so it has no members); `standards` done `ids@4,ruleset@1,naming@1`, all three `· office`; `federated` not checkable "no live model — federation needs two"; every other step todo with its reason | `GET /cde/aster-villa/journey` |
| Office journey, `aster-office` | 5 of 5, next none; `team` two member ids; `standards` all `· project` (installed on the office itself); `snapshot` `office_snapshot@2026-09-22T00:10:45.168Z`; `readiness` document `cb8f72db…`; `projects` `aster-tower,aster-villa` | `GET /cde/aster-office/journey` |
| Project journey, `aster-tower` | 6 of 8, next `federated` ("the Federation Gate has not run" on the tower); `standards` `ids@3 · project` (the tower's own IDS outranks the office's) with `ruleset@1`/`naming@1 · office`; `bep` document `f2c53f6a…`; `model` `office_scan@2026-09-22T22:26:00.888Z`; `verdict` `audit#658`; `published` version `ac3afdca…` · `audit#658` | `GET /cde/aster-tower/journey` |
| Unknown key | 404 with the create-it message | `GET /cde/no-such-key/journey` |
| No percentage | none of the three answers contains `%` | response bodies |
| Revit pane | observed 2026-09-24 on `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt` (bound to `aster-tower`): "Journey · aster-tower (project)"; "Standards in force: IDS ids@3 · project · bc25acf3506a… · Rules ruleset@1 · office · fb8f9baefa9f… · Naming naming@1 · office · 43c954e892d0…"; "Next: Federated … · 6 of 8 done" — the same refs, next step and count as the route; the grey line reads "Scans here with bds-rtg-001 1.5.0 (this machine) — differs from ruleset@1 · office (ast-std-001 1.0.0)", which is why the pane's own rows still quote the BDS whitelist (phase 4 closes this) | screenshot of the pane |

Not exercised: the web strip and the live Guide in a browser (platform viewer blocked, F49; pure line builders
tested, type-checked, built). Product gaps recorded during planning: the `model` step completes only after a
Synchronize with Central (the only path that sends a scan report), and transmittals have no screen on either
surface ("no screen for this step yet").

## Revit standards from the project drill (Session B5), 2026-09-25

Feature `feature/revit-standards` (cohesion phase 4a). Managed bridge restarted on the branch, then migration 0030
applied; add-in deployed to Revit 2024 with Revit closed (03:34) after deleting the stale `Resources\ruleset.json`
copies; Revit started with the unsigned add-in loaded **once** (not "Always Load" — that trust setting stays the
founder's). Every line is a bridge response, a database result or what the pane showed.

| Step | Result | Evidence |
|---|---|---|
| Migration 0030 | applied; probe inside a rolled-back block as a signed-in member: an `artefact` row insert refused, a row in another store allowed (`PROBE artefact_refused=t other_store_allowed=t`) | `apply_migration` success, probe output |
| Pilot | `bds-office` carries `ruleset@1`/`ids@1`/`naming@1`; `demo` belongs to it (cut-over 2026-09-24) | `GET /cde/demo/journey` |
| Bridge answers | `aster-tower` ruleset 200, `ETag: "ruleset@1:office:fb8f9baefa9f…"`; with `If-None-Match` → 304, empty body; `aster-villa/…/contract` 404 `not_installed`; `no-such-key/…/ruleset` 404 `no_project`; `aster-tower/…/nope` 404 `unknown_kind` | response codes and bodies |
| Deploy | `Sentinel.dll` 03:34; the deployed `Resources` folder has no `ruleset.json` or `ids.json` | directory listing |
| Aster Tower | `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt` (bound to `aster-tower`): "Judged by ruleset@1 · office · fb8f9baefa9f…", 50.6 %, rows quote `AST-STD-001 §2/§4` ("not in the AST workset whitelist"), never BDS; `%AppData%\Sentinel\cache\aster-tower\ruleset.json` holds `key, kind, ref, source, sha256, fetched_at, body` | pane, cache file |
| Demo Tower (pilot) | `Demo Tower (demo)_yazan.hKNTHU.rvt`: "Journey · demo (project)", "Standards in force: IDS ids@1 · office · … Rules ruleset@1 · office · 0261a98155f0… Naming naming@1 · office · …", "Judged by ruleset@1 · office · 0261a98155f0…", 31.3 %, rows `BDS-RTG-001 §3.1` (the BDS 15-name whitelist) | pane |
| One ruleset per document | with Demo Tower still open, Scan Now on Aster Tower → back to "Judged by ruleset@1 · office · fb8f9baefa9f…", AST rows, 50.6 %, strip "Journey · aster-tower (project)" | pane |
| Unbound | a new project (`Project1`, never bound) → Scan Now: "Journey — not bound — Sentinel ▸ Project Setup", "Not scored — no ruleset judged this model", status "Project1 — none — not bound — Sentinel ▸ Project Setup", no rows, no percentage | pane |
| Bridge stopped | Scan Now on Demo Tower → "Judged by ruleset@1 · office · 0261a98155f0… (cached 06:01) — the project's ruleset now is unknown (journey unavailable)", the same BDS rows, "Journey unavailable — 502: Bad Gateway" (the add-in reaches the bridge through the Tailscale `serviceUrl`, which answers 502 when the bridge is down); bridge restarted afterwards | pane |
| Office template | `AST_Template.rte` (bound to `aster-office`): "Journey · aster-office (office)", "Judged by ruleset@1 · project · fb8f9baefa9f…", 52.6 % | pane |

**Not run live** (covered by the harnesses `tools/ruleset-install-check` 21/21, `tools/naming-port-check` 59/59,
`tools/snapshot-check` 21/21): *Build / Apply* — Build Office System on `AST_Template.rte` proposes 0 worksets and
0 naming rules (the template is not workshared and carries no naming schema), so no ruleset install is staged,
by design; the only pack on this machine with worksets is the BDS template pack, and applying it would write
BDS worksets into the Aster office's ruleset. An Aster pack with worksets is needed for that row. Also not run:
*Aster Villa* (no model bound to it), *Nothing installed*, *CDE-01* (needs a sync to a central file), *Office
snapshot*. Side effect: opening Build Office System re-harvested the machine-global
`%AppData%\Sentinel\type-catalog.json` from `AST_Template` (1239 types). It was already Aster's (F54), and since
1890f54 the open document decides the catalogue check.

Follow-ups found: (1) the pane shows the last document scanned or opened. Switching to another open model
changes neither the rows nor the strip until Scan Now; refresh on document activation. (2) ↻ on the strip was
clicked twice with Aster Tower active and the strip stayed on `demo`. The ribbon tabs right of the Add-Ins
area also ignored the automation's clicks (a mouse-wheel scroll over the tab row reached the Sentinel tab), so
this is unconfirmed rather than a failure; re-check by hand. (3) "Journey unavailable — 502: Bad Gateway" is
accurate but reads as a server fault; "the bridge did not answer (502 from the Tailscale address)" would say
more.

## The delivery contract from the project drill (Session B6), 2026-09-25

Feature `feature/contract-from-project` (cohesion phase 4b-1). Managed bridge restarted on the branch; add-in deployed
to Revit 2024 with Revit closed (19:18), loaded **once**; `%AppData%\Sentinel\delivery-contract.json` renamed `.bak`.
IFC exports were written to a local scratch folder — the export dialog's default folder is the office's Autodesk
Forma (Desktop Connector) project folder, which would have uploaded them. Every line is a bridge response, an audit
id, a certificate on disk or what a dialog showed.

| Step | Result | Evidence |
|---|---|---|
| Parity fixture | `contract-parity.test.mjs` + `delivery-gate.test.mjs` 21/21; `tools/gate-check` 123/123 — every case of `cases.json` gives the same result, failure count and warning count in Node and C# | test output |
| Bridge refuses | `{}` as `contract`, `layers`, `guideline`, `type_catalog` on `aster-villa` → `HTTP 400: contract: contract_key must be a non-empty string` / `layers: standard must be …` / `guideline: standard must be …` / `type_catalog: types must be a non-empty array`; `GET /cde/aster-villa/artefacts` still `null` for all seven | CLI output, response body |
| Pilot cut-over | `artefact-import … --project bds-office --kind contract` → `Installed on bds-office: contract@1 · project · 944564dc1b8d… · by cli`; `GET /cde/demo/artefacts/contract` → 200, `ETag "contract@1:office:944564dc…"`; `aster-tower` and `aster-villa` → 404 `not_installed` | CLI output, responses |
| Demo Tower — IFC Delivery Gate | first dialog `Contract: contract@1 · office · 944564dc1b8d…` and "An export is IFC4 Reference View"; the export's header `FILE_SCHEMA(('IFC4'))`; result **✕ FAIL** — `IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.`; certificate `FAIL`, `contract_ref contract@1`, `contract_source office`, `contract_sha256` = the bridge's; audit 781 `IFC delivery gate FAIL: demo-b6.ifc`, `result fail`, `passed false`, ref/source/sha. (Audit 424, 2026-09-16: the same model PASSED on the silent `bds-default`, IFC2X3, proxies ≤ 25 %.) | dialog, cert, audit 781 |
| Parity — intake on the same file | `intake.mjs demo-b6.ifc --project demo --name b6-parity.ifc` → `REJECTED (gate)`, `FAIL · contract@1 · office · 944564dc1b8d… · IFC4 · 930555 entities`, the same one failure; audit 782 | CLI output |
| Aster Tower — none | first dialog `Contract: none — not installed for aster-tower or its office` + "Nothing will be judged: an export is IFC 2x3 …"; header `FILE_SCHEMA(('IFC2X3'))`; result **NOT CHECKED — contract: none — …**, "Nothing was judged — this file is NOT certified for CDE upload"; certificate `NOT_CHECKED`, `contract_ref null`, `contract_label` the none label, the file's sha; audit 783 `IFC delivery gate NOT CHECKED: aster-b6.ifc`, `result not_checked`, `passed null` | dialog, cert, audit 783 |
| Unbound | a new project → `Contract: none — not bound — Sentinel ▸ Project Setup`; certifying `aster-b6.ifc` → NOT CHECKED, "Nothing was judged", "Not recorded on the web: This model is not bound to a web project" | dialogs |
| Governed Publish — Demo | exported IFC4 (the contract's schema; before 4b-1 always IFC2x3) → **✕ REJECTED — delivery gate failed (not published)**, `Contract: contract@1 · office · 944564dc1b8d… · Schema: IFC4`, the proxy failure; audit 784 with ref/source/sha; nothing published | dialog, audit 784 |
| Bridge stopped | Demo gate: first dialog, result and certificate `contract@1 · office · 944564dc1b8d… (cached 19:23)`, same FAIL; bridge restarted → the next run's label has no suffix | dialogs, cert |
| Honesty | the machine file renamed back to `delivery-contract.json` → the Aster gate still reads `none — not installed for aster-tower or its office` (then `.bak` again); no default contract on either side (`git grep`) | dialog |

**Found and fixed live:** with the bridge stopped the gate said "Recorded on project 'demo'", but the audit POST is
fire-and-forget and no row reached the bridge (the audit list after restart has 781, 782, 784 — nothing at 19:32).
It now says "Sent to the audit trail of project '<key>' (not confirmed — the gate does not wait for the bridge)"
(59b1997); the wording predates this branch (phase 4a). The ledger graft (4c: `Event()` reading the response) is the
real fix.

**Behaviour change, as designed:** Demo Tower now fails the pilot's own contract (994 `IFCBUILDINGELEMENTPROXY`, the
contract allows 0) where it passed the silent `bds-default` before. Whether the pilot tightens the model or relaxes
its contract (`max_count`/`max_ratio`) is the office's call — install `contract@2` on `bds-office` either way.

**Not run live:** the web **Install JSON…** (a browser session on the platform app; unit-tested, role gate and
refusal line), the `b6-upload` test project and intake with no contract on it, and **Governed Publish — Aster** (an
IDS accept would register a version on `aster-tower`; the not-checked gate line and the reject-dialog line are pinned
by `tools/gate-check`'s `GateLines` checks). The pane still showed the last-scanned model after switching — the pane
fix (`fix/pane-follows-active-document`) was not in this deploy.

## Layers, guideline and type catalogue from the project drill (Session B7), 2026-09-25

Feature `feature/ghost-standards-from-project` (cohesion phase 4b-2). Managed bridge restarted on the branch; the
pilot's `layers@1`, `guideline@1`, `type_catalog@1` installed on `bds-office` and Aster's `type_catalog@1` on
`aster-office`; add-in deployed to Revit 2024 with Revit closed (21:54), loaded once; the stale deployed
`Resources\bds-guideline.json` and `bds-layers.json` removed; `%AppData%\Sentinel\type-catalog.json` and
`dwg_mappings.json` renamed `.bak`. Every line is a bridge response, a file on disk or what a window showed.

| Step | Result | Evidence |
|---|---|---|
| Pilot cut-over | `Installed on bds-office: layers@1 · project · 3fb977dc57c5…`, `guideline@1 · project · fc26449bdbe3…`, `type_catalog@1 · project · a1c0436f6714…`; `Installed on aster-office: type_catalog@1 · project · 9cf3623ded94…`; `demo` resolves all three `· office`; `aster-tower` resolves only `type_catalog@1 · office` (layers and guideline 404 `not_installed`) | CLI output, `GET …/artefacts/<kind>` |
| Harnesses | with no `%AppData%\Sentinel\type-catalog.json` on the machine: ghost-standards-check 125/125, guideline-check 17/17, wallpair-check 9/9, ghost-p2-check 42/42, annotate-check ALL PASS; `guideline-bds.test.ts` + `artefact-store.test.mjs` 111/111 | command output |
| Demo Tower — Ghost Builder review | A101.dwg from the project's Ghost source folder → header `Layers: layers@1 · office · 3fb977dc57c5… · Guideline: guideline@1 · office · fc26449bdbe3… · Type catalogue: type_catalog@1 · office · a1c0436f6714…` (the catalogue named on the first fetch); `A-COLS → BDS_Column_Arch`, `A-DOOR-FRAM → BDS_Door`, `A-FLOR`/`A-FLOR-OTLN → BDS_Floor` are standard rows, ticked; every `heuristic guess` and `local model` row unticked; `A-WALL → BDS_Wall_Int` standard but unticked for "high count — likely annotation" (531 elements) | review window |
| Per-project mapping cache | `%AppData%\Sentinel\cache\demo\dwg_mappings.json` written with `layers_sha` = the bridge's 64-hex `3fb977dc…` and the 11 local-model answers only; a second run shows them as `local model (remembered)`, unticked, and the standard rows still standard and ticked; `%AppData%\Sentinel\dwg_mappings.json` not re-created | cache file, review window |
| Aster Tower — Ghost Builder, no layers or guideline | same drawing → header `Layers: none — not installed for aster-tower or its office · Guideline: none — not installed for aster-tower or its office · Type catalogue: type_catalog@1 · office · 9cf3623ded94…`; `A-COLS → Generic Column`, `A-DOOR-* → Generic Door`, `A-FLOR* → Generic Floor` as `heuristic guess`, others `local model`; nothing ticked; `cache\aster-tower\dwg_mappings.json` written stamped `layers_sha: none` — demo's cache did not answer | review window, cache file |
| Annotate Views — Aster | refuses with exactly `Guideline: none — not installed for aster-tower or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.`; no view created | dialog |
| Annotate Views — Demo | `Guideline: guideline@1 · office · fc26449bdbe3…`, created 108 views across 18 levels, each view template the model lacks named in a warning (`View template '01.100_WIP_FLOOR_PLANS' not in this model — 'WIP_FP_PARKING' created without it.`), none invented; a rerun created 0 and skipped 126 | dialogs |
| Unbound | a new project → Annotate Views refuses with `Guideline: none — not bound — Sentinel ▸ Project Setup. Nothing to plan — …` | dialog |
| Build Office System export | `AST_Template.rte` → `Type catalogue exported (1239 types from AST_Template) → …\exports\type-catalog-AST_Template.json. Install it on the office: node bridge/artefact-import.mjs "…" --project <office> --kind type_catalog.`; the file's `template` is `{title: "AST_Template", extracted_at}` (no workstation path), no top-level `source`, 1239 types; `%AppData%\Sentinel\type-catalog.json` not re-created | dialog, export file |
| Bridge stopped | Annotate Views on Demo → `Guideline: guideline@1 · office · fc26449bdbe3… (cached 22:06)`; bridge restarted after | dialog |
| Honesty | `ghost_layer_ruleset_path` and `ghost_guideline_path` pointed at `demo/bds-pilot/bds-layers.json` / `bds-guideline.json` in `config.json` → Annotate on Aster still refuses with the none label and Ghost Builder on Aster still reads `Layers: none — …` with heuristic rows; `config.json` restored from its backup | dialogs, config file |

**Not run live:** the Demo Ghost Builder **build** on `sample-wall-thickness.dxf` (the Walls line and the guideline's
wall types), **Local model unreachable** (would mean quitting the user's Ollama), both **Photo Massing** rows (the
Seagram photo folder is built locally per `demo/aster/README.md` and was not present), both **Catalogue gap** rows
(a detached `b7-gap.rvt` and the `b6-upload` test project), and Ghost Builder with the bridge stopped (Annotate's
cached label was checked). They are covered by `tools/ghost-standards-check` (125 checks) and the other harnesses.

Follow-ups from the final review (not regressions): `GhostWallTypeProvisioner` still clones the first Basic wall
under a mapping-named wall type (F43 by another route) and `CreateFloorType` falls back to the first floor type; the
Photo Massing summary repeats the "not checked against a type catalogue" note; a guideline rule with no type plus a
mapping with no family warns `WallType '' not found`; ESC during the standards fetch waits up to 20 s.

## The ledger answers drill (Session B8), 2026-09-26

Feature `feature/ledger-grafts` (cohesion phase 4c), on master b6f49fe (which carries the pane-follows-the-active-
document fix). Managed bridge restarted on the branch; add-in deployed to Revit 2024 with Revit closed (04:46), loaded
once. Every line is a bridge response, an audit row or what a Revit window showed.

| Step | Result | Evidence |
|---|---|---|
| Audit read | `GET /cde/demo/audit` → 200 rows, `total: 286`, `limit: 200`, `offset: 0`; `?entity_type=file_version&action_prefix=verdict:` → `total: 1`, row 114 `verdict:accepted` (outside the newest 200); `?offset=100000` → `rows: []`, `total: 286`; `?limit=ten` → 400 `limit must be an integer ≥ 1`; `?entity_type=delivery_gate` → the gate rows 781/782/784…; no bearer on `/cde/demo/audit` → 401 | responses |
| ids.last_verdict on demo | `met` — "All 1 adjudicated version(s) were accepted." (before 4c: `not_checkable`, "No governed verdict has been recorded on this project yet") | `runCheck('ids.last_verdict','demo')` |
| Public verify, no bearer | receipt 702 on `aster-office`: real id + hash + time + verdict + project → `{"matches":true,"checked":["audit_id","ledger_hash","project","recorded_at","verdict"],…,"note":"matches the ledger's stored hash; the chain is not recomputed"}` with `Access-Control-Allow-Origin: *`; the verdict flipped → `matches: false`, `mismatched: ["verdict"]`; an unknown id, an unknown key and a wrong hash → the same bytes `{"matches":false,"note":"no ledger entry on this key has that id and hash"}`; malformed → 400; a 9 KB body → 413 `A receipt check is at most 8 KB`; no ledger value in any anonymous reply; `GET /receipt/aster-office/702` without a bearer still 401; a member's verify still carries `ledger` | responses |
| IFC gate on Demo, bridge up | certify `aster-b6.ifc` → the result ends **Recorded: ledger #790 · receipt 3fb8a239d0c8fbd3…**; `GET /cde/demo/audit?entity_type=delivery_gate&limit=1` → row 790, hash `3fb8a239d0c8fbd3…` | dialog, response |
| IFC gate on Demo, bridge silent | `serviceUrl` pointed at `http://127.0.0.1:4100` (backed up), bridge stopped → the contract reads `(cached 11:14)` and the result ends **Not recorded — the bridge did not answer**; `bcf-config.json` restored from its backup, bridge restarted | dialog |
| Governed Publish on Demo | exported IFC4, gate FAIL (994 proxies) → **✕ REJECTED — delivery gate failed (not published)** … **Gate row: ledger #791 · receipt b50cadb742454714…** | dialog |
| Heal on Demo (bound) | 222 families scanned, 222 auto-healed → **Recorded: ledger #792 · receipt 8428ff825e77ca6d…**; `GET /cde/demo/audit?entity_type=family_heal` → `total: 1`, row 792 `Family heal: 222 healed, 0 for a human, 0 failed of 222`, actor `revit:<user>`, 50 names listed (the cap), `shared_parameter_source` naming the temp scratch file (not an office shared-parameter file) | dialog, response |
| Naming Manager | one proposed row renamed → status **Renamed 1/1. Recorded: ledger #793 · receipt f1a2be85ee7b02d6…** | window status |
| Pane follows the active document (B5 row) | Demo and Aster open: activating an Aster view shows `aster-tower`, 50.6 %, AST rows; a Demo view shows `demo`, 34.9 %, BDS rows — no Scan Now; another view of the same model leaves the pane as it was | pane |

**Not run live:** Governed Publish on Aster Tower (an IDS accept would register a real version on `aster-tower`; the
two-line dialog is pinned by `tools/event-check` and the gate lines by `tools/gate-check`); the Auto-Publish and
sync-scan Doctor lines (need a save and a Synchronize with Central on a workshared local); the Unbound heal/gate wording
(the 4b drills showed the unbound path; the text is pinned). Side effects: Demo Tower's local now holds the heal's
injected parameters on 222 families and one renamed type in memory — close it without saving (its local already carries
the 4b-2 WIP views from a save when Revit closed on 2026-09-25).

## Publishing needs a verdict drill (Session B9), 2026-09-26

Feature `feature/publish-one-path` (cohesion phase 5a, bridge + database; no add-in change). Migration 0031 applied
after the founder's approval, probed, then the managed bridge restarted on the branch. The API rows were driven with
the bridge token (the database sees the service key and no signed-in user) by `scratchpad/b9_api.py`; the watcher row
ran `watch-outbox.mjs --once` on a scratch outbox, never `%AppData%\Sentinel\outbox`. Every line is a database result,
a bridge response or a file on disk.

| Step | Result | Evidence |
|---|---|---|
| Apply | `cde_transition(uuid,container_state,text,text,text)` is the one overload; grants `authenticated, postgres, service_role` (no anon); triggers `trg_protect_published, trg_state_via_transition`; versions unchanged before and after: 44 wip, 2 published, 1 archived | `apply_migration` success; verify SQL |
| Migration probe | `PROBE 0031: 20 of 20 as expected.` — every refusal held and every allowed move worked; its rolled-back rows took ledger ids **794–810** (17), which will never exist | `execute_sql` raise text |
| Deploy | bridge log: `auth gate: ARMED …`, `JWT-forwarding: armed (forwards a caller's Supabase JWT → RLS)`, `platform token: valid ✓` | managed bridge log |
| Test project | `b9-publish` and `b9-client` created (service token, no members); `ids@1 · project` installed on `b9-publish`; `b9-client` has nothing installed | responses |
| `publish@1` — the validator | `{auto: "yes"}` → 400 `publish: auto must be true or false`; `{auto: true, mode: "auto"}` → 400 `… mode is not a publish field …`; `{auto: true}` → 201 `publish@1`; `GET …/artefacts/publish` → `ref publish@1 · source project · body {auto: true}`; audit `artefact_installed publish@1` | responses |
| New versions start in wip | `POST /files` with `state: "published"` → 201, `version.state: "wip"` (VA) | response |
| `/propose` — nothing in scope | `elements: []` + `version_id` → `verdict: recorded`, `downgraded: "nothing in scope"`, `in_scope 0`, `ids_ref ids@1`; the proposal row `Proposal recorded from b9` with `downgraded`; one `verdict:recorded` row on VA (ledger #819) | responses |
| `/propose` — another project's version | a `demo` version id → 400 `version <X> is not on b9-publish`; the proposal total on `b9-publish` and demo's verdict total unchanged | responses |
| `/propose` with `register` — accepted | `accepted`, `in_scope 6`, `version {id, container_id, revision, state: "wip"}` (VB), `verdict_audit_id` 824; **one** proposal row (P+1); one `verdict:accepted` row on VB whose id is 824 with `ids_ref ids@1`; `B9-B.ifc` one wip version, `sha256` = the register's, `platform_item_id null` | responses |
| `/propose` with `register` — rejected | `rejected`, `version: null`, `verdict_audit_id: null` (the keys are present, null); no `B9-C.ifc` | response |
| Client IDS / naming | a plain proposal with a client IDS on `b9-client` → `accepted`, `ids_source client`, `ids_ref null`, nothing stamped; the same with `register` → 400 `a version is stamped only by the IDS installed on b9-client or its office — …` (exact); with `version_id` → the same 400; a client naming ruleset with `register` on `b9-publish` → 400 `a version's name is judged only by the naming standard installed on b9-publish or its office — …`; `b9-client` holds one proposal row, `B9-K.ifc` one version, no verdict row | responses |
| Watcher — sweep (scratch outbox) | `B9-B.ifc` (sidecar with `version_id`) uploaded → `B9-B.frag → item 6ab7bfe0…`, `📎 geometry attached to B9-B.ifc v1 (version VB, project b9-publish) · ledger #830`, manifest captured; `B9-L.ifc` (pre-5b sidecar) uploaded and versioned as before with its item and manifest; `B9-U.ifc` (no sidecar) and `B9-N.ifc` (sidecar naming no project) → `outbox\unbound\<ms>_…` with its sidecar, `⛔ … not uploaded, not registered …`, no `→ item` for either, no "falling back to the bridge default project"; `sent\` holds B9-B and B9-L; `B9-B.ifc` still holds only VB (now with the item, still wip); `manifests` lists VB `has_manifest: true`. Observed: after `--once sweep complete.` the fragments converter (`@thatopen/fragments` GridReader) logged two `TypeError: Cannot read properties of null (reading 'value')` for the 2 KB fixture's grids — both files had already converted and uploaded; a library quirk on the fixture, not a watcher outcome | sweep.txt, responses |
| Transition refused — the service key | VA wip→shared 200; →published → 409 `version <VA> has no accepted verdict that measured something (latest: verdict:recorded, ledger #819) — publishing it needs the lead's reason` (exact); with `override` → 409 `… the lead's reason is taken only from a signed-in lead, and this call has no signed-in user`; shared→archived → 409 `illegal ISO 19650 transition: shared -> archived`; `B9-A.ifc` still shared | responses |
| Transition allowed | VB shared then published → 200 both, no reason asked; the `state:shared->published` row names `verdict:accepted`, `verdict_audit_id 824`, `override null` | responses |
| The audit route cannot write Sentinel's rows | `verdict:accepted` → 400 `verdict: rows are written by Sentinel, not through this route` (exact); `state:…`, `gate:pass design`, `roi:assumption` → 400 naming each prefix; `entity_type stage_gate` → 400 (exact); an ordinary `event` → 201 with `id` and `hash`; VA still has one verdict row | responses |
| Web upload — API half | `B9-W.ifc` registered wip by `/propose` with `register` (VW) | response |

**Not run live:** the browser rows — **Install JSON…** for `publish@1` (the validator was driven through the same
route), **Web Publish — the lead's reason** (needs a signed-in lead in the platform app; the database path is the
probe's P9), **Unarchive through the function** (the function path is the probe's P13) and the **web upload** landing
beside VW; **Governed Publish — the pre-5b add-in** (Revit closed; the API rows prove new versions register wip); **an
IFC with no sidecar in the managed outbox** (no managed watcher runs on this machine — the scratch sweep proved the
path). Left in place: projects `b9-publish` (holds a published version, so it cannot be deleted) and `b9-client` —
archive them from Project Settings ▸ Danger zone; the scratch outbox was removed.

## One publish path drill (Session B10), 2026-09-26

Feature `feature/publish-one-path-revit` (cohesion phase 5b). Deployed 1d144ba with Revit closed (`dotnet build
SentinelAddin -c Release -p:RevitVersion=2024`), the managed bridge restarted on the branch, the two pre-5b outbox
watchers (one from `bridge\start-watch.cmd`, one from a terminal, both since 2026-09-24) stopped and one watcher
started from `WebApp\start-watcher.cmd` (its log `WebApp\watcher.log`). The Revit rows were driven by hand on the
pilot's real locals (`AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt`, `Demo Tower (demo)_yazan.hKNTHU.rvt`, never synced)
and read off the dialogs, the pane's Doctor log, the bridge and the watcher's log. The rows that need an accepted
verdict ran on a fresh office-less project `b10-publish` (the Aster local re-bound to it through Project Setup and
back afterwards), because the pilot's own standards reject the pilot's model — see the Aster row. Every line below
is a dialog, a Doctor line, a bridge reply, a ledger row or a file on disk; ids are the ledger's.

| Step | Result | Evidence |
|---|---|---|
| Deploy | DLL hash = the branch build; `publish-check` 101/101, `artefact-cache-check` 53/53, `gate-check` 123/123, `event-check` 44/44 (all 20 harnesses at the pinned totals, npm 1134/82, tsc 24); `npm run bridge:upload` → `npm error Missing script: "bridge:upload"`; `bridge/upload-ifc.mjs` absent; the "Load Once" prompt showed the new DLL | gates log, tasklist |
| The ribbon | Publish panel: **Governed Publish** and a **Publish ▾** pulldown holding only **Publish Sheets** and **Publish Views**, its tooltip naming the model-name keying and "outside the governed IFC path"; no Quick Publish, no Auto-Publish; Project Setup has no linked-models checkbox | ribbon zoom |
| Not bound | a new project (Revit's default template, saved as Project1.rvt) → Governed Publish → `This model is not bound to a web project — Sentinel • Project Setup.` / `Nothing was exported or published.`; save → no Doctor line, no dialog, the outbox unchanged; the pane: `Journey — not bound — Sentinel • Project Setup` (the pane and the dialog print `•`, the protocol wrote `▸`) | dialog, outbox listing |
| The policy line, none installed | Aster Tower open → `GET /cde/aster-tower/artefacts/publish` 404 `not_installed`; the pane's fourth line `Auto-publish: off — publish: none — not installed for aster-tower or its office` | pane zoom, reply |
| A save with no policy | save → returned at once, nothing exported; Doctor `20:43:05 Auto-publish: off — publish: none — not installed for aster-tower or its office`; a second save → no second line; `/files` unchanged | Doctor zoom, local mtime 20:43:06 |
| Governed Publish — Aster Tower | a plan view active → `✕ REJECTED — model name does not follow the ISO 19650 convention (not published)` / `Name checked: AST_ASTR26_Aster Tower.ifc` (the central's name — F12 holds) / `Delivery gate: NOT CHECKED — contract: none — …` / `Gate row: ledger #845 · receipt 6d05f6292787f8aa…` / `Verdict row: ledger #846 · receipt 0cfdc62b4cd0667a…` / `No version was registered and nothing was uploaded.` / NAMING: `expected 7 '-'-separated fields …, got 1` / FAILURES: `Pset_WallCommon.LoadBearing: REQUIRED but missing` ×10 / `1 BCF issue(s) opened …`. **The pilot's own `naming@1 · office` rejects the pilot's central file name and its `ids@3 · project` rejects its walls** — the honest outcome the row did not foresee (it expected ✓ ACCEPTED or not judged); the bridge: proposals P 16 → 17 (#846 `Proposal rejected from Governed Publish`), gate #845 `IFC delivery gate NOT CHECKED: AST_ASTR26_Aster Tower.ifc`, issue #847, no new container, outbox and `%TEMP%\Sentinel` empty. Repeated twice later (#856/#857, #860/#861: one proposal row per publish, nothing registered) | dialog zoom, audit, files |
| One container, one row · The watcher attaches by id | not on `aster-tower` (rejected → nothing to stage); proven on `b10-publish` below | — |
| Governed Publish — Demo (gate FAIL) | `✕ REJECTED — delivery gate failed (not published)` / `Contract: contract@1 · office · 944564dc1b8d… · Schema: IFC4` / `IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.` / `Gate row: ledger #859 · receipt e8fe05462c026cb0…`, no `Version:` line; gate row #859 names `Demo Tower (demo).ifc` (the central's name; the pre-5b row #791 said `_yazan.ifc`); proposals 29 unchanged, 11 containers unchanged, outbox and temp empty. The whole-model export of Demo takes ~4 min | dialog zoom, audit |
| `publish@1 {auto: true}` | `Installed on aster-tower: publish@1 · project · ed4b894a2ea3… · by cli`; the pane's line did **not** change on the ↻ button or on switching views inside the document; it read `Auto-publish: on · publish@1 · project · ed4b894a2ea3…` after the sync and on every document switch | pane zooms |
| A save with auto on | save → returned at once; Doctor `20:48:01 Auto-publish rejected — nothing uploaded — the model name AST_ASTR26_Aster Tower.ifc failed naming naming@1 · office · 43c954e…` (the naming reject, before the IDS); proposal #850 `Proposal rejected from Auto-Publish`, gate #849; nothing registered, outbox unchanged. The throttle clause (a second save within 15 s) could not be driven: the auto path's export pauses the UI, so a second keystroke lands after it — **not run** | Doctor zoom, audit |
| Sync with Central with auto on | Synchronize Now → the sync returned; Doctor `20:50:52 Scan report: not confirmed — the bridge returned no chain hash` (as B8 records: `/office/scan` answers no hash) then `20:50:58 Auto-publish rejected — nothing uploaded — the model name … failed naming naming@1 …`; ledger #852 `office_scan_received`, #853 gate, #854 proposal (Auto-Publish); the pane's line became `on · publish@1` here | Doctor zoom, audit |
| A rejected auto run uploads nothing (Demo) | `Installed on demo: publish@1 · project · ed4b894a2ea3…`; the pane on Demo `Auto-publish: on · publish@1 · project · ed4b894a2ea3…`; save → Doctor `21:34:23 Auto-publish rejected — nothing uploaded — delivery gate FAIL · contract@1 · office · 944564dc1b8d… · Schema IFC4 · 1 failure(s) · gate row: ledger #862 · receipt …` and, unrequested, a second run `21:37:12 … ledger #863 …`: the local had been opened as a "copied central" (Revit's own dialog) and Revit saved it at 21:34:24 when the first run's export transaction committed (the file's mtime; no keystroke), which raised DocumentSaved once more — Revit's conversion of a copied central, seen only on that open path; proposals 29 unchanged, 11 containers unchanged, outbox empty | Doctor zoom, audit, mtime |
| `publish@2 {auto: false}` | aster-tower: `Installed … publish@2 · project · bb43640b83a0…`; save → Doctor `20:58:42 Auto-publish: off — publish@2 · project · bb43640b83a0…` once; demo: `21:45:28 Auto-publish: off — publish@2 · project · bb43640b83a0…` once; both pilots and `b10-publish` end on `{auto: false}` (`publish@2`, `publish@2`, `publish@4`) | Doctor zooms, GET publish |
| Bridge stopped | `serviceUrl` → `http://127.0.0.1:4100` (backed up, restored after), the managed bridge stopped → Governed Publish → `Delivery gate: NOT CHECKED — contract: none — bridge unreachable (Unable to connect to the remote server)` / `Gate row: not recorded — the bridge did not answer` / `The Sentinel bridge did not return a verdict — nothing was registered or uploaded, and no verdict row is confirmed.` / `Reason: …` / `Start the bridge (npm run bcf:serve) and run Governed Publish again.`; outbox unchanged; save → Doctor `21:01:09 Auto-publish: off — publish@2 · project · bb43640b83a0… (cached 20:58)` | dialog zoom, Doctor zoom |
| A pre-5b sidecar in the managed outbox | `B10-L.ifc` + `{"project":"aster-tower","docTitle":"Aster Tower"}` → `⛔ B10-L.ifc → …\outbox\unbound\1790449316614_B10-L.ifc — pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.`, no `→ item`; `unbound\` held the pair; aster-tower's `/files` unchanged | watcher.log, listing |
| **Accepted path on `b10-publish`** (Governed Publish) | the Aster local bound to `b10-publish` (no office, nothing installed): the pane `Journey · b10-publish (project) · … Auto-publish: off — publish: none — not installed for b10-publish or its office`; Governed Publish → first the org warning (`This document's ruleset (none — …) has no "org" code — office property sets (Pset_<org>.*) were NOT read …`), then `Published — not judged: no IDS installed for b10-publish or its office` / `Project: b10-publish` / `IDS: none — … The model was NOT judged.` / `Naming: not judged — no naming standard installed.` / `Delivery gate: NOT CHECKED — contract: none — …` / `SHA-256: 6f53911762610cdd…` / `Gate row: ledger #865 · receipt 1c898f16d0d67e1e…` / `Verdict row: ledger #866 · receipt 6f211ba367c6e27e…` / `Version: AST_ASTR26_Aster Tower.ifc v1 · wip · ledger #870 · receipt 0b7b2e601f241cc8…` / `Queued for upload — the outbox watcher attaches the geometry to this version.` / the no-badge sentence | dialog zoom |
| One container, one row (b10-publish) | `/files` → one container `AST_ASTR26_Aster Tower.ifc` (the central's name; the local is `…_yazan.hKNTHU.rvt`), one version v1 wip, `sha256 6f53911762610cdd…`, `size_bytes 1398307`; proposals 1 (#866 `Proposal recorded from Governed Publish`); ledger 865 gate · 866 proposal · 867 created container · 868 set live · 869 uploaded · 870 `verdict:recorded` on the file_version with hash `0b7b2e601f241cc8…` (the Version line's receipt) | files, audit |
| The watcher attaches by id (b10-publish) | `uploading AST_ASTR26_Aster Tower.ifc → version d29f189b-… on b10-publish …`, `✅ … → item 6ab8221c13cf4cfc31dfed13`, `📎 geometry attached to AST_ASTR26_Aster Tower.ifc v1 (version d29f189b-…, project b10-publish) · ledger #871`, `🧭 manifest: 378 element(s), 15 level(s), 11 grid(s), georeferenced`; never `no sidecar`; `/files` v1 `platform_item_id 6ab8221c…`, still wip; `/manifests` `d29f189b… has_manifest true`; `outbox\sent\1790452253920_AST_ASTR26_Aster Tower.ifc` | watcher.log, files, manifests |
| A save with auto on (b10-publish) | `Installed on b10-publish: publish@1 · project · ed4b894a2ea3…`; save → Doctor `21:52:25 Auto-publish: This document's ruleset (none — …) has no "org" code …` then `21:52:26 Auto-published AST_ASTR26_Aster Tower.ifc v2 · wip · ledger #878 · receipt 2d582ec43cb4010e… — not judged: no IDS installed for b10-publish or its office`; `/files` two versions, v2 wip live; proposals 2 (#875 `Proposal recorded from Auto-Publish`); ledger 874 gate · 875 · 876 set live · 877 uploaded · 878 `verdict:recorded` · 879 geometry linked · 880 snapshot; the watcher `📎 geometry attached … v2 … · ledger #879` | Doctor zoom, audit, watcher.log |
| `publish@2 {auto: false}` (b10-publish) | `Installed on b10-publish: publish@2 …`; save → Doctor `21:54:06 Auto-publish: off — publish@2 · project · bb43640b83a0…` once | Doctor zoom |
| **Found and fixed live — a closed document silenced auto-publish** (3fba7ac) | on 1d144ba, after Project1 (unbound) was saved and closed, every later save's handler threw `InvalidObjectException` inside `AutoPublish.Trigger` — Revit's journal: `API_ERROR { … InvalidObjectExceptionProxy … was thrown from a handler of … DocumentSavedEventArgsProxy event. The API event handler was registered by application Sentinel BIM Coordinator` at the Demo save 21:13:42 and the Aster save 21:16:58 — so no run, no off line, no dialog (the `Dictionary<Document, …>` maps hashed the closed document's wrapper). Fixed on the branch: the throttle and the once-per-policy maps are keyed by the document's path (else title), `Prune` is gone, and `Trigger` says `Auto-publish: not triggered — <exception>: <message>` in the Doctor log if it ever throws again. Redeployed (Revit closed) and re-checked: Project1 created, saved and closed, then Aster saved with `publish@3 {auto: true}` on b10-publish → `21:55:56 Auto-published AST_ASTR26_Aster Tower.ifc v3 · wip · ledger #887 · receipt 2cb9bc319719b7a7… — not judged …`; v3 attached (`ledger #888`), proposals 3 | journal, Doctor zoom, audit |
| Honesty | every dialog, Doctor line and the strip named what judged (`contract@1 · office · 944564dc1b8d…`, `naming@1 · office · 43c954e…`, `publish@n · project · <sha 12>…`, or the none reason); `✓ ACCEPTED` never appeared (nothing was accepted); `ledger #` and `receipt` only with the bridge's ids and hashes, `not recorded — the bridge did not answer` and `not confirmed — the bridge returned no chain hash` where it had none; no surface read `Version badge`, `immutable`, `Quick Publish`, `Auto Publish` or `upload-ifc`; a save or sync never waited on the bridge (Demo's UI paused ~2¾ min per auto export — the bounded pause the row states); one publish = one proposal row, one version, one verdict row; the container was named from the central file on every path; the outbox never gained a second IFC per publish | all of the above |

**Not run live:** the 15 s throttle by a second keystroke (see the row); the strip's ↻ button as a refresh of the
policy line — it did not visibly refresh it (a document switch and the sync did): to check whether the click reaches
the button or the refresh drops the line. **Observed, Autodesk's:** opening Demo's local from Revit's Home tile raised
`Coordination Model Interface — External component has thrown an exception` (Autodesk's add-in, journal AddInId
9817e4a5…) twice and aborted the open; opening the same local through File ▸ Open worked. **Left in place:** the pilot
locals unsynced (Demo's changes never synchronised, as in B8; Aster's binding restored to `aster-tower`), the test
project `b10-publish` (one container, three wip versions, `publish@4 {auto: false}`) for the founder to archive,
`outbox\sent\` with the drill's two IFCs; the sidecar-row files were removed from `unbound\`. **Finding for the
office (not the tool):** `naming@1 · office` expects a 7-field ISO 19650 name and `AST_ASTR26_Aster Tower` has one field —
the pilot's central must be renamed (a container `ASTR26-AST-ZZ-XX-M3-A-0001.ifc` already exists on aster-tower) before
Governed Publish can register from it; and `ids@3 · project` requires `Pset_WallCommon.LoadBearing` on ten walls.

## ROI and the stage gate from the ledger drill (Session B11), 2026-09-27

Feature `feature/roi-stage-gate` (cohesion phase 5c). Every gate re-run on the branch first: npm 1184 in 85 files, tsc 24,
both add-in builds 0 errors (2024: 6 warnings, 2025: 3 — master's sets), all 21 harnesses at the pinned totals
(`roi-check` 43/43 new, `gate-check` 121/121, `publish-check` 101/101, `event-check` 44/44, `artefact-cache-check` 53/53
…), the deleted-name grep empty; the managed bridge restarted on the branch, the add-in deployed with Revit closed
(the deployed DLL = the branch build; `RoiLines` in it, `RoiTracker` not). The bridge rows were driven by
`scratchpad/b11_api.py` with the bridge token (the machine path, as the protocol says); the Revit rows by hand on the
pilot's Aster local; the web rows could not be driven (below). Every line is a bridge reply, a ledger row, a window
or a file on disk; ids are the ledger's.

| Step | Result | Evidence |
|---|---|---|
| Deploy | as above; `npm run bridge:upload` gone since 5b; the watcher untouched | gates log, tasklist |
| The `roi` kind | `GET /cde/aster-tower/artefacts/roi` → 404 `no roi artefact installed for aster-tower or its office (PUT /cde/aster-tower/artefacts/roi)` | reply |
| Test project | `b11-gate` created through the bridge (no office); `GET /projects/b11-gate` → `stage: "tender"`, `gates: {}`; the founder's account given the owner seat for the web rows | replies |
| The validator's refusals | the five bodies → 400 with the exact messages: `roi: currency must be three capital letters, e.g. EUR` · `roi: hourly_rate must be a number greater than 0` · `roi: minutes.autofix is not a counted kind — the ledger counts delivery_gate, naming and family_heal only` · `roi: minutes needs at least one of delivery_gate, naming, family_heal` · `roi: note is not a roi field — the body is {currency, hourly_rate, minutes, basis?}`; `/artefacts` still `roi: null`; artefact audit `total: 0` | replies |
| `roi@1` from the CLI | `Installed on b11-gate: roi@1 · project · <sha 12>… · by cli`; `GET …/artefacts/roi` 200 `roi@1 · project`, body EUR / 90 / `{delivery_gate: 20, naming: 3, family_heal: 15}` / the basis; audit `artefact_installed roi@1` | replies |
| The gate as the machine — hold | `POST /cde/b11-gate/gate {stage: "tender"}` → 200 `status: "hold"`, one check `Standards pack selected` `ok false` `na false` `detail none` `source ruleset artefact`, `next_stage: "design"`, `ledger {id, 64-hex hash}`; the `stage_gate` row `gate:hold tender` with the reply's id and hash and `new_value {stage, status, checks, next_stage}`; `GET /projects/b11-gate` → stage `tender`, `gates.tender.status hold`, `gates.tender.ledger.id` the row's | replies, audit |
| The gate as the machine — pass | `ruleset@1 · project` installed from the pilot fixture; the same POST → 200 `pass`, the check `ok true` `detail set`, a higher ledger id; the newest row `gate:pass tender`; `GET /projects/b11-gate` → `stage: "design"` (the newest `gate:pass` row's `next_stage`), `gates.tender.status pass` | replies, audit |
| The wrong stage, an unknown one | `{stage: "tender"}` again → 409 `the gate to run is the current stage's: design`; `{stage: "nope"}` and `{}` → 400 `stage must be one of tender, design, coord, constr, hand, oper`; `stage_gate` total 2 (a refusal writes no row) | replies |
| Not checkable | `{stage: "design"}` → 200 `not_checkable`, the three checks (`Model health ≥ 80%`, `No 'block' violations`, `Standards compliance ≥ 70%`) each `na true` with `source not measured — no server source: the browser scan is not persisted`, `next_stage: "coord"`; the newest row `gate:not_checkable design`; stage still `design`, `gates.design.status not_checkable` | replies, audit |
| The compliance check says why | `runCheck('gate.stage', 'b11-gate')` → `not_checkable`, reason `3 of 3 gate metrics have no server source (Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70%) …` — never "run a model scan from the browser"; `stage_gate` total 3 (a compliance run writes nothing) | node |
| The old route is gone | `POST /projects/b11-gate/gate/design` → 404 `Not found`; `PUT /projects/b11-gate {stage: "oper"}` → 200 with `stage` still `design`; `stage_gate` total still 3 | replies |
| The audit route still refuses | `stage_gate` → 400 `stage_gate rows are written by Sentinel, not through this route`; `gate:pass design` → 400 `gate: rows are written by Sentinel, not through this route`; `roi:assumption` → 400 naming `roi:`; total still 3 — **37 of 37 driver checks pass** | replies |
| Web — the Dashboard · a non-lead · the pilot's stage | **not run**: the platform's local-app tab could not be rendered by the browser extension in this session (viewport 0×0 while it sits behind the founder's active tab; `localhost:4000` on its own serves the bundle, the app runs only inside the platform frame). The rail, the Run gate button, the ledger line and the non-lead line are pinned by the mocked-bfetch tests (`stage-gate.test.ts` 9, `gates.test.ts` 11) and the route by `cde-store-gate.test.mjs` (10, the 403 among them). The pilots read Tender on the rail until a lead runs the gate (the plan's behaviour change) — left for the founder | — |
| Revit — counts from the ledger, no `roi@n` | `g aster-tower delivery_gate` → `total 17 rows 17 counted 11` (six NOT CHECKED rows not counted), `naming` 0/0/0, `family_heal` 0/0/0; Sentinel ▸ Standards & Build ▸ ROI Dashboard on Aster Tower → `Return on investment` / `ROI · aster-tower · counted from the ledger (17 rows read)` / `Delivery gate runs: 11` / `Naming renames: 0` / `Family heals: 0` / `Money: not shown — roi: none — not installed for aster-tower or its office` / `Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row`; nothing reads "Assumes", "$", "30-day" or "man-hours"; Revit stayed responsive; `%AppData%\Sentinel\roi.json` untouched | window zoom |
| Revit — money with `roi@1` | `Installed on aster-tower: roi@1 · project · 99246e749f25… · by cli` (ledger #898); ROI Dashboard again → `Delivery gate runs: 11 · 20 min each · 330.00 EUR` / `Naming renames: 0 · 3 min each · 0.00 EUR` / `Family heals: 0 · 15 min each · 0.00 EUR` / `Money: 330.00 EUR at 90 EUR/h · roi@1 · project · 99246e749f25…`; the counts unchanged | window zoom |
| Revit — bridge stopped, unbound | `serviceUrl` → loopback (backed up, restored after), the bridge stopped → ROI Dashboard → the window's only line `ROI · aster-tower · not counted — the ledger could not be read (An error occurred while sending the request.)`, no count, no money; a new unbound project → ROI Dashboard → `ROI · not bound — Sentinel ▸ Project Setup` and `Nothing was read: this document has no web project, so it has no ledger to count.`, no count | window zooms |
| Honesty | every count is a ledger row the bridge returned (`g` and the window agree: 11 · 0 · 0 of 17 rows); money only with `roi@1 · project · 99246e749f25…` named; every gate status is the bridge's own measurement — the three unmeasured metrics made the design gate `not_checkable`, never a pass, and no browser-posted status is taken; the stage moved only on `gate:pass tender`; `ledger #`/`receipt` only with the row's id and 64-hex hash; the audit route wrote no `gate:`, `roi:` or `stage_gate` row; nothing reads `roi.json`, "Assumes 5 min", "$35/h" or "Load a model first" | all of the above |

**Left in place:** `roi@1` on `aster-tower` (the protocol's row — a lead supersedes it with `roi@2`); `b11-gate` (roi@1, ruleset@1, three
stage_gate rows, the founder as owner) for the founder to archive; the pilot locals unsynced; Revit open with Aster and an unsaved
Project1. The driver's temp folder was removed.

## The Holding Area drill (Session B12), 2026-09-27

Feature `feature/holding-area` (phase 6a). Every gate re-run on the branch first: npm 1283 in 90 files, tsc 23, both
add-in builds 0 errors (2024: 6 warnings, 2025: 3 — master's sets), `publish-check` 112/112, `gate-check` 124/124 and
the other ten harnesses unchanged. The bridge and the add-in were deployed together (Revit closed; the deployed DLL =
the branch build, its `/delivery-gate` route and held line present), the managed bridge restarted on the branch. The
bridge rows were driven by `scratchpad/b12_api.py` with the bridge token (the machine credential); the Revit rows by
hand on the pilot locals; the web rows could not be driven (below). Every line is a bridge reply, a ledger row, a dialog
or a Doctor line; ids are the ledger's.

| Step | Result | Evidence |
|---|---|---|
| Deploy | as above | gates log, DLL strings |
| Test project | `b12-hold` created through the bridge (no office); `ids@1 · project` installed from the pilot fixture; `GET /cde/b12-hold/holding` → 200 `{"items":[],"cleared_recent":[]}` | replies |
| The audit route refuses the reserved rows | `hold:gate …` and `  HOLD:dismissed …` → 400 `hold: rows are written by Sentinel, not through this route`; entity_type `hold` → 400 `hold rows …`; entity_type ` Delivery_Gate ` → 400 `delivery_gate rows …`; an ordinary event → 201; `hold` and `delivery_gate` totals 0 | replies |
| The gate route refuses a signed-in member | **not run** — it needs the founder's browser session token (the extension could not render the platform tab); `cde-store-hold.test.mjs` pins the 403 | — |
| The gate route validates | `result: "maybe"` → 400 `result must be pass, fail or not_checked`; nothing written | replies |
| A check holds nothing | `source check, publish false` → 201, `hold: null`; the `delivery_gate` row carries both failures as a list, `source check`, `publish false`, `size_bytes 2456`; the list stays empty | replies |
| A publish FAIL is held | → 201 gate #903 with `hold {id: 904, hash}`; the gate row `source revit`, `publish true`; `hold:gate B12-G.ifc`, `entity_id` null, `gate_row_id 903`, the sha and size, two `{requirement, detail}` failures; one held item `B12-G.ifc`, `stage gate`, `source revit`, `refusals 1`, `ledger.id 904` | replies |
| A publish PASS is not held | → 201, `hold: null`; still the one item | replies |
| `/propose` with `register` — held; a plain one — not | a rejected register → `hold:ids B12-P.ifc` (`source intake`, `proposal_row_id` the proposal's, `ids@1`, four failures), the proposal row naming `container_name`, `sha256`, `size_bytes`; the same POST again → `refusals 2` and the newer ledger id (repeats collapse); a plain proposal → `hold: null`, not listed | replies |
| A registration clears — a recorded one is labelled | a recorded registration of `B12-G.ifc` → no item, `cleared_recent` `{by: "recorded", label: "cleared by a registration that was not judged (recorded)"}`; the version keeps `verdict:recorded` | replies |
| Intake CLI — an IDS reject is held | `REJECTED (ids)`, `failures 4`, exit 2; gate row `NOT CHECKED: B12-I.ifc`; the proposal row names the file (its real sha and size) and `gate_row_id`; `hold:ids B12-I.ifc`, actor `cli`, `source intake`, both links; nothing registered | CLI, replies |
| Intake CLI — the corrected file clears it | `ACCEPTED (published)`; the item gone, none in `cleared_recent` (an accepted registration clears silently) | CLI, replies |
| Naming — held, and not cleared by the renamed file | `naming@1 · project` installed; `--name B12-N.ifc` → `REJECTED (naming)`, `failures 0`; `hold:naming B12-N.ifc`, `naming@1`; the item carries `naming_note` `the corrected file carries a new name — a lead dismisses this entry once it is registered`; the ISO-named corrected file `ACCEPTED`, and `B12-N.ifc` still held | CLI, replies |
| The dismiss route | a blank or missing reason → 400 `reason is required — a lead's dismissal says why, in at most 500 characters`; 501 characters → 400; `B12-P.ifc` and `B12-N.ifc` dismissed → 201 each with a 64-hex hash; the `hold:dismissed B12-N.ifc` row carries the reason; the `hold:naming` refusal stays (total 1); the list empty — **47 of 47 driver checks pass** | replies |
| Web — On hold, an upload refused, the corrected file, a list not read, a lead's dismissal, below lead | **not run** — the extension could not render the platform's local-app tab (as in B11), so no signed-in browser session drove the panel; `holding.test.ts` (16) pins the panel's lines, the upload through intake and the inline dismissal, the bridge rows above prove the routes it calls | — |
| Revit — the IFC Gate is a check | Demo Tower, a 3D view, IFC Delivery Gate ▸ export and certify → `✕ FAIL — DO NOT upload this file`, `Recorded: ledger #939 · receipt f6d8d37664134832…`; the row `IFC delivery gate FAIL: Demo Tower (demo)_yazan.ifc`, `source check`, `publish false`, the failure as a list, `size_bytes 93885760`; `demo` holds nothing | dialog, replies |
| Revit — Governed Publish: a gate FAIL is held | `✕ REJECTED — delivery gate failed (not published)`, `Contract: contract@1 · office · 944564dc1b8d… · Schema: IFC4`, `IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.`, `Gate row: ledger #940 · receipt 5941a5482f593025…`, `Held on the web: Project Files ▸ On hold · ledger #941 · receipt cf9c2513dcd06adf…`; the gate row `source revit`, `publish true`; `hold:gate Demo Tower (demo).ifc` #941 with `gate_row_id 940`, `entity_id` the container's; one held item; proposals unchanged (29), outbox unchanged | dialog, replies |
| Revit — auto-publish: the Doctor line | `publish@3 {auto: true}` on `demo`; save → the Doctor log `Auto-publish rejected — nothing uploaded — delivery gate FAIL · contract@1 · office · 944564dc1b8d… · Schema IFC4 · 1 failure(s) · gate row: ledger #943 · receipt 7452653729767234… · Held on the web: Project Files ▸ On hold · ledger #944 · receipt cc2752d93e7137a2…`; the item `source auto-publish`, `refusals 2`, `ledger.id 944`; a second run followed (#946 → #947) — the local, opened as a copied central, saved itself at the export's commit, as B10 recorded; then `publish@4 {auto: false}` | Doctor zoom, replies |
| Revit — Governed Publish: a naming reject is held | Aster Tower → `✕ REJECTED — model name does not follow the ISO 19650 convention (not published)`, `Name checked: AST_ASTR26_Aster Tower.ifc`, `Gate row: ledger #948 · …`, `Verdict row: ledger #949 · …`, `No version was registered and nothing was uploaded.`, `Held on the web: Project Files ▸ On hold · ledger #950 · receipt 51e1e2b1951b7177…`; the gate row `NOT CHECKED`, `publish true`; the proposal #949 names `AST_ASTR26_Aster Tower.ifc`, `gate_row_id 948` and the gate row's sha and size; `hold:naming …` #950, `source revit`, `naming@1`, both links, `entity_id` null — `aster-tower` holds no container of that name (the protocol assumed one; the B10 versions of that name are on `b10-publish`) | dialog, replies |
| The pilots' holds, dismissed | through the dismiss route with the machine credential (the web row not run): `AST_ASTR26_Aster Tower.ifc` → #951, `Demo Tower (demo).ifc` → #952, each with the protocol's reason; both lists empty; Demo's three `hold:gate` rows stay on the ledger | replies |
| Honesty | no refused file was registered or uploaded; each hold is one `hold:<stage> <name>` row the bridge wrote for a registering refusal judged by installed standards; every ledger line carried the row's id and 64-hex hash; the open audit route wrote no `hold:`, `hold` or `delivery_gate` row; a dismissal needed a reason and left the refusal rows | all of the above |

**Left in place:** `b12-hold` (ids@1, naming@1, its holds and dismissals, two accepted versions) for the founder to archive;
both pilots on `publish@… {auto: false}`; Revit open with the Demo and Aster locals, unsynced.

## The review chain drill (Session B13), 2026-09-27

Feature `feature/review-chain` (phase 6b). Every gate re-run on the branch first: npm 1365 in 94 files, tsc 23 (master's
set, none new), `node --check` clean; no add-in change (nothing in the add-in moves a version between states). Before the
apply the founder chose a dry run: migration 0032 and its probe ran on a local PGlite copy of the schema (migrations
0001-0031, aligned to live by read-only catalog SELECTs; the 0031 probe 20 of 20 on it), which found a malformed-template
crash and probe gaps — fixed in 7d3699a (the probe now 32 cases; 38 of 39 mutants of 0032 killed, the survivor
unreachable). Then the founder said "apply 0032". The bridge rows were driven by `scratchpad/b13_api.py` with the bridge
token; the signed-in rows by the founder on the web board (the local app, Chrome), one by Claude in the founder's tab.
Every line is a reply, a ledger row or the board; ids are the ledger's.

| Step | Result | Evidence |
|---|---|---|
| Drift check | the live md5 of every function 0032 touches or relies on (cde_transition, has_min_role, project_of_container, the state and audit triggers, auth.uid/jwt/role …) equal to the dry-run copy's; review_template and review_decide absent | catalog SELECTs |
| Apply | 0032 applied (`schema_migrations` 20260927085918 `0032_review_chain`); the live md5 of cde_transition (8f173ca3…), review_decide (41647062…) and review_template (f2d7b541…) equal to the dry-run copy's after the same file; EXECUTE: cde_transition authenticated, postgres, service_role · review_decide authenticated, postgres · review_template postgres, service_role; the review mark in cde_transition | catalog SELECTs |
| Migration probe | `PROBE 0032: 32 of 32 as expected.` — ledger ids 953-1020 taken and rolled back; projects 13, memberships 14, containers 34, versions 58, bridge_docs 88, audit rows 934 (max id 952) before and after, no probe project left | execute_sql as postgres |
| PostgREST | `POST /rest/v1/rpc/review_decide` with the service key → 403 `42501 permission denied for function review_decide` (the schema cache knew it — no PGRST202; the machine holds no EXECUTE) | reply |
| Deploy | the managed bridge (it had stopped) started on the branch after the apply: `JWT-forwarding: armed`; the web dev server on :4000 | bridge log |
| Test project | `b13-review` created through the bridge (no office) and the founder added as its owner through the members route (as a web-created project would have it); `ids@1 · project · 121bbb222d04…`; B13-A, B13-B, B13-D accepted and registered wip (A's verdict row #1028); B13-C registered with no verdict; `reviews` → `{"items":[]}`; the review artefact → 404 `no review artefact installed for b13-review or its office (…)` | replies |
| The audit route refuses the review rows | `review:approve 1` → 400 `review: rows are written by Sentinel, not through this route`; entity_type ` Review ` → 400 `review rows are written by Sentinel, not through this route`; review rows 0 | replies |
| The review validator | the six bodies refused in the protocol's words (a role outside contributor/lead/owner, seven steps, six approvals, a blank name, a stray body key, a stray step key); artefact rows 1 | replies |
| `review@1` installed | `Installed on b13-review: review@1 · project · b66325d02b9e… · by cli`; GET → `review@1`, `project`, the body, the importer's sha | CLI, reply |
| The machine cannot share | the keyless route with the bridge token → 409 `this project requires review (review@1) — a version is shared by a signed-in lead, not by this call`, with a reason the same; B13-A still wip; review rows 0; the decide route with the bridge token → 403 `a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)` — **27 of 27 driver checks** | replies |
| A signed-in lead shares — reviewer zero | the founder, **Share →** on B13-A.ifc: Shared, `Review: step 1 of 1 — Design check (contributor)`, `shared for review by <the founder's e-mail> · review@1`, no **Publish →**, `← Back to WIP (ends the review)`, the muted `the submitter does not review their own share`, `My reviews (0)`, `1 under review`; `review:start` #1044 stamped with the founder's e-mail, `submitter_uid` the founder's uid, `verdict:accepted`, `verdict_audit_id` 1028 | board, rows |
| Sharing without a verdict asks for the lead's reason | the founder, **Share →** on B13-C.ifc: the card in red `version c3eb0180-… has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead's reason`, a reason field and **Share with this reason** (disabled while blank), the status `Not shared — a lead can share it for review with a reason, which the ledger records.`; with `b13 drill: client asked for an early look` → Shared under review, `2 under review`; `review:start` #1047 keeps the reason word for word | board, rows |
| Nothing publishes a version under review but its last approval | the machine's publish → 409 `version 7d404256-… is under review (chain ledger #1044) — it is published by its last approval, not by this call`, with a reason the same; its send-back → 409 `… is under review — only a signed-in lead can send it back to wip`; B13-A still shared | replies |
| A template changed mid-review | `review@2 · project · 97fcacc8185c…` installed; both running chains still read `review@1`, 1 step — **11 of 11** | CLI, replies |
| A lead sends it back | the founder, **← Back to WIP (ends the review)** on B13-C.ifc → WIP; `state:shared->wip` #1050 stamped with the founder's e-mail, `review_start_id` 1047; B13-C gone from `reviews`, B13-A still listed; the machine's decision on it still 403 — **4 of 4** | board, rows |
| Web — a reviews list not read | in the founder's Chrome tab, the `reviews` request made to fail inside the app (a fetch stub, removed after) and ↻: over the board `Reviews: not read — Failed to fetch`, never `My reviews (0)`; B13-A shows **Publish →** again — not clicked (a publish control in the founder's session; the probe's P12 and the machine rows above prove the refusal) | board |
| `steps: []` turns the chain off | `review@3 · project · 4430e7786edc…` (steps []); the machine shares B13-D.ifc → 200, no `review:start`, `state:wip->shared` with `review_start_id` null; the machine publishes it on its accepted verdict → 200 — **5 of 5** (47 of 47 driver checks in all) | replies |
| A second account: My reviews, an approval publishing with that account as the actor, a reason-shared chain completing under its reason, two steps and a prior approver, a third account, a reject back to WIP with its BCF topic, a viewer refused; a contributor's `version_id` stamp → 403; the decide route with a signed-in token (`maybe` → 400, the submitter → 409, another project's version → 400) | **not run** — no second signed-in account, and a session token is the founder's to copy, not the drill's to take; on the live database the probe carries every one of these (P6-P19, P22-P23, P25-P31, with simulated JWT claims), the bridge's vitest the route's refusals, the stamp's role and the BCF raise | — |
| Honesty | no call without a signed-in session shared, published or sent back a version on a project with a chain; nothing reached review_decide from the machine; every chain row is stamped with the signed-in person's e-mail and names its template; a template changed mid-review changed no running chain; a list not read said so | all of the above |

**Found on the way:** the published Sentinel app now fails at load in the platform's sandbox (`Failed to read the
'localStorage' property … lacks the 'allow-same-origin' flag`) although every storage read in Sentinel's own code is
guarded — a separate task; the local app is unaffected.

**Left in place (first run):** `b13-review` (ids@1, review@1-3, B13-A under review, B13-D published, B13-B and B13-C in
wip); the founder is its owner.

**The second-account run (same day, 09:38-09:47).** The founder signed up a second account (`yazanhijazeen32@gmail.com`);
`b13-review` was unarchived, the account added as a contributor through the members route and `review@4` (one step,
`Design check`, contributor, one approval) installed. The founder (owner, hotmail) shared B13-B on its accepted verdict and
B13-C on the reason `b13 drill: second-account run` (`3 under review`, `My reviews (0)` for the submitter); the second
account, on the board, read `My reviews (3)` and decided. Checked by `scratchpad/b13_api.py part6` — **13 of 13**:

| Step | Result | Evidence |
|---|---|---|
| An approval publishes, with the approver as the actor | the second account **Approve** on B13-A.ifc → `Approved step 1 of 1 — Design check · B13-A.ifc published · ledger #1067 · receipt eae38a99367f3897…`; `review:approve 1` #1067 by the second account naming its chain (#1044, the founder's share from the first run on `review@1`); `state:shared->published` #1068 in the same call, actor the second account, `note` `review complete`, `verdict:accepted` #1028, `override` null | board, rows |
| A reason-shared chain completes under its reason | **Approve** on B13-C.ifc → `… B13-C.ifc published · ledger #1069 · receipt 7ef46b7ae58e490b…`; `state:shared->published` #1070, actor the second account, `verdict` null, `override` `b13 drill: second-account run` — the reason the founder's share recorded | board, rows |
| A reject returns it to WIP with a BCF topic | **Reject** disabled until a note; with `b13 drill: clash at level 2` → `Rejected at step 1 of 1 — Design check · B13-B.ifc back to WIP · ledger #1071 · receipt 7c2d5d5b30cc0b94… · BCF topic a5611bc2-…`; `review:reject 1` #1071 with the note; `state:shared->wip` #1072 in the same call, actor the second account, note `review: rejected at step 1 — b13 drill: clash at level 2`; one BCF topic `Review: B13-B.ifc rejected at step 1 — b13 drill: clash at level 2` | board, rows, BCF |
| My reviews | the second account's bar read `My reviews (3)`, then `(2)`, `(1)` as it decided, and hid when nothing was left under review; `reviews` → `{"items":[]}` | board, reply |
| Found | switching accounts in one window left the board showing the previous account's review view (`My reviews (0)`, `the submitter does not review their own share`) until ↻ — the board reloads on a project change, not on a sign-in change; the database still refuses a decision the wrong person makes. A follow-up | board |

**Two steps and a viewer (09:53-10:10).** `review@5` installed (two contributor steps, `Design check` then `Coordination
check`); B13-B shared again by the founder on its accepted verdict (`review:start` #1076, `state:wip->shared` #1077, verdict
#1033), Claude driving the founder's tab; the second account decided in its own (Incognito) window:

| Step | Result | Evidence |
|---|---|---|
| Two steps: one approval does not finish the chain | the second account **Approve** on B13-B → `review:approve 1` #1078 (`of` 2, `chain_start_id` 1076); B13-B stays **Shared**, now `Review: step 2 of 2 — Coordination check (contributor)` with `✓ step 1 · yazanhijazeen32@gmail.com · ledger #1078 · receipt f3c8647cc39fe1c7…` on both boards | rows, boards |
| A viewer decides nothing | the second account's role → `viewer` (`member_role_changed` 09:57:02); its board, ↻ → B13-B's review line and approval, the muted `step 2 (Coordination check) needs contributor or above`, no **Approve** or **Reject**, `My reviews (0)` | board |
| A prior approver waits | its role back to `contributor` (10:10:11); ↻ → the muted `you already approved step 1 of this chain`, no **Approve** or **Reject**, `My reviews (0)` — whoever approved step 1 does not take step 2 | board |

Still not run live: a third account completing the two-step chain, and a contributor's `version_id` stamp (the probe and the
bridge's vitest carry them).

**Left in place:** `b13-review` (ids@1, review@1-5, B13-A, B13-C and B13-D published, B13-B shared under review at step 2 of
`review@5`), archived again; the founder is its owner and the second account a contributor.

## The delivery gate on the platform drill (Session B14), 2026-09-27

Spec `docs/superpowers/specs/2026-09-27-platform-delivery-gate-design.md` (hackathon plan A). Master 668fdeb. Platform
project `Welcome Project` 6a4c4df825f9ecf5f416d4c2 (linked to `aster-tower`), workspace 6ab2a2e1ff9e5cd719130683. All
platform calls below were made with the founder's CLI token (`~/.thatopen/config.json`) through `@thatopen/services`
0.3.11 from `WebApp/`; every id is the platform's. Nothing here writes to the ledger: a platform verdict has no ledger
row (spec Decision 11).

| Row | Observed | Evidence |
|---|---|---|
| Component published | `npx thatopen publish` from `CloudComponents/delivery-gate` → **Sentinel Delivery Gate** id `6ab97f7213cf4cfc31e03c60`, 1.0.0 (9.3 kB) then 1.0.1, 1.0.2 (9.0 kB); `extraProps {type CLOUD, tier FREE, executionEngineVersion v1/thatOpenEngine}`; the bundle is the bridge's `delivery-gate.mjs` with `node:crypto` aliased to a run-time shim, no browser stub in it (`grep -c browser-external dist/bundle.js` → 0) | CLI output, Apps & Components page |
| First cloud run (1.0.0) — the two unknowns | `executeComponent(6ab97f72…, {projectId, fileId: 6a581c79e95b14e86c6ceba0 (test.ifc)})` → execution `6ab97f9193f8e6a2d1e36a5a`, COMPLETED in 613 ms, `WARNING`: `Not checked — no contract on the platform project — install one in Sentinel — report written; the version labels were refused: Cannot PUT /api/item/6a581c79…/version//metadata?accessToken=…` — a run **can** write a file into the launching project; the label write reached the API but the tag was empty: the cloud's `getFile` returns no `versions` (measured: keys `_id,name,…,workspaceId`, `versions` undefined), and the platform's own error text carried the run's token | `getExecution` JSON, `getFile` keys |
| Fix 1.0.1 | versions resolved from `listFiles` (which carries them), an item with no named version is a FAIL, `accessToken=` scrubbed from every platform error before it reaches a message, report or label; the empty-tag report item `6ab97f9293f8e6a2d1e36a5f` archived (`archiveFile`) | commit `fix(cloud): …versions from the project listing…`, `node --test` 14 |
| Second run (1.0.1) — both writes | execution `6ab97fec93f8e6a2d1e36a6b`, 535 ms, `WARNING Not checked — no contract on the platform project — install one in Sentinel`; report item `6ab97fed13cf4cfc31e03c90` = `test.ifc.gate.json` v1 `{kind sentinel.gate-report, result not_checked, reason …, sha256 26bc00aab228…, size 62, run {executionId 6ab97fec…, component {toolId 6ab97f72…, toolVersion 1.0.1}}, file {id 6a581c79…, name test.ifc, versionTag v1}}`; labels on `test.ifc` v1: `sentinel_gate not_checked · sentinel_contract none · sentinel_failures 0 · sentinel_sha256_a 26bc00aab228090c3200c04badb0b006 · sentinel_sha256_b 20df848f2fef515cd61dff8a07e85a7c · sentinel_report 6ab97fed… · sentinel_run 6ab97fec…` — the two halves rejoin to the report's sha256 | `downloadFile(report, v1)`, `getFileVersionMetadata` |
| Enabled in the project | Apps & Components ▸ Sentinel Delivery Gate ▸ ⋮ ▸ Enable in Project ▸ Welcome Project ▸ Accept → `Enabled projects 1`; before it the automation form offered only IfcFragmenter | page text before and after |
| Automations | the form applies its conditions to every ticked trigger (`File Uploaded will never fire while this is set` on Update kind), so two: **Sentinel gate — new version** (`file.updated`, Extension `ifc`, Update kind `A new version was uploaded`, `fileId ← eventPayload.itemId`, `versionTag ← eventPayload.versionTag`) and **Sentinel gate — new file** (`file.uploaded`, Extension `ifc`, `fileId ← eventPayload.itemId`); `projectId` left blank (the launching project); both on component 1.0.1 at creation | Automations page: two rows, `Last run Never` |
| New file → judged unattended | `createFile` `gate-automation-test.ifc` v1 (bridge fixture `minimal.ifc`) at 20:53:14 → item `6ab9823a13cf4cfc31e03cd6`; **5 s later** labels `sentinel_gate not_checked`, `sentinel_report 6ab9823a13cf4cfc31e03cdd`, `sentinel_run 6ab9823a13cf4cfc31e03cda` — the new-file automation ran the gate with no one watching | poll of `getFileVersionMetadata` |
| The contract travels | `GET /cde/demo/artefacts/contract` (machine credential) → `contract@1` (`bds-pilot`: IFC4; IFCWALL, IFCDOOR, IFCCOLUMN ≥ 1; IFCBUILDINGELEMENTPROXY max 0 / 20 %; Pset_WallCommon); mirrored as `sentinel-contract.json` versionTag `contract@1` (created) — the same write `platform-contract.ts` makes on install (`aster-tower` itself has no contract: 404 `not_installed`) | script output; `listFiles` |
| New version → **Refused** | `createVersion(6ab9823a…, minimal.ifc, v2)` at 20:54:12 → **5 s later** labels `sentinel_gate fail · sentinel_contract contract@1 · sentinel_failures 2 · sentinel_run 6ab9827413cf4cfc31e03d07`; report v2 (same item `6ab9823a13cf4cfc31e03cdd`): `result fail`, `contract {ref contract@1, sha256 048784d270fa…}`, failures `IFCCOLUMN: 0 found, contract requires ≥ 1.` and `IFCBUILDINGELEMENTPROXY: 1 exceeds max 0.`, 32 entities — the bridge's sentences, from the bridge's code, on the platform | `downloadFile(report, v2)` |
| New version → **Passed** | v3 = the fixture without its proxy line plus one `IFCCOLUMN`; `checkDelivery` locally → `pass`; `createVersion(…, v3)` at 20:54:53 → **5 s later** `sentinel_gate pass`, run `6ab9829d13cf4cfc31e03d3c`; report v3 `result pass`, its `sha256` equal to the local gate's on the same bytes; `getExecution` → `SUCCESS`, `Passed — bds-pilot` (1.0.2 says `Passed — contract@1 (bds-pilot)`, the board's wording) | script output |
| Honesty | the component returned `SUCCESS` only for the pass whose report and labels both landed; a run whose labels were refused said so in its own message (the 1.0.0 row) and left `not_checked`, never a pass; no contract → `not_checked` with the reason, written like any verdict; `ledger #` and `receipt` appear nowhere on the platform; the report and the labels carry the same sha256 (two 32-hex halves, the platform's 50-character value limit) | rows above |
| Intake keeps its own referee | `POST /cde/demo/intake?name=B14-bridge.ifc&source=intake` (machine credential, the v3 bytes) → 200 `verdict rejected, stage naming`, audit 1087 — the office naming standard (`naming@1`, 11 fields, `enforce reject`) refused the name before anything was uploaded; the platform saw no file | reply JSON; `listFiles` had no `B14-bridge.*` |
| Revit / bridge path → judged on the platform | `POST /ifc?name=BDS20268-BDS-M3-IFC4-ARC-Z1-XX-00-M014-S2-P01.ifc&version=P01&projectId=demo` (the `uploadIfcAsFrag` path the web intake and the Revit outbox watcher share, master 668fdeb) → `{format frag, itemId 6ab9835293f8e6a2d1e36b56, bytes 1944, ifcItemId 6ab9835293f8e6a2d1e36b59}` — the `.frag` first, the delivered `.ifc` beside it; **5 s later** the new-file automation labelled the `.ifc` P01 `sentinel_gate pass · sentinel_contract contract@1`, run `6ab9835293f8e6a2d1e36b5d`, report `6ab9835313cf4cfc31e03d7d` — a publish through Sentinel gets the same platform verdict as a consultant's upload | reply JSON, `getFileVersionMetadata` |
| Component 1.0.2 | published (the execution log names the contract as the board does: `Passed — contract@1 (bds-pilot)`); both automations re-pointed from 1.0.1 to 1.0.2 in the platform UI (⋮ ▸ Edit ▸ Version ▸ Save) | Automations page |
| Web strip (app 1.0.24, published 2026-09-27) | the founder signed in to the published app on the platform (Coordination ▸ CDE on `b13-review`, linked platform project = Welcome Project): **PLATFORM DELIVERIES · 3 IFC · 1 passed · 2 not checked** — `test.ifc v1` and `gate-automation-test.ifc v1` **Not checked** with `no contract on the platform project — install one in Sentinel`, `BDS20268-…-P01.ifc P01` **Passed — contract@1**, each with `sha256 <12>… · run <id>`; the review bar and the board below unchanged | founder's screenshot |
| Not run live | the Settings mirror line on a contract install (`b13-review` shows `contract none installed`; it is exercised when the contract is installed for the video); a publish from the Revit pane (the watcher path shares `uploadIfcAsFrag` with the `/ifc` row above) | — |
