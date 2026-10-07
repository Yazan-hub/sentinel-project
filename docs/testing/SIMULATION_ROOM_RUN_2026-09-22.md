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

**The second-account run (same day, 09:38-09:47).** The founder signed up a second account (`<the founder's second account>`);
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
| Two steps: one approval does not finish the chain | the second account **Approve** on B13-B → `review:approve 1` #1078 (`of` 2, `chain_start_id` 1076); B13-B stays **Shared**, now `Review: step 2 of 2 — Coordination check (contributor)` with `✓ step 1 · <the founder's second account> · ledger #1078 · receipt f3c8647cc39fe1c7…` on both boards | rows, boards |
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

## The Revit sign-in drill (Session B15), 2026-09-28

Spec `docs/superpowers/specs/2026-09-28-revit-sign-in-design.md` (H4). Branch feature/revit-sign-in; add-in built for Revit 2024 and deployed to `%AppData%\Autodesk\Revit\Addins\2024` (Sentinel.dll 01:36); `bcf-config.json` gained `supabaseUrl` and `supabaseAnonKey`; the bridge on master e885c83 unchanged. Founder's PC, Revit 2024, the Aster model bound to `aster-tower`.

| Row | Observed | Evidence |
|---|---|---|
| Offline checks | `tools/session-check` 22 of 22 against a loopback Supabase: a wrong password refused in Supabase's words; a sign-in stores a DPAPI file with no plain token; the token is reused until under a minute is left, then refreshed once; a second instance adopts the first's refreshed tokens from the file (one refresh call, none refused); a refused refresh signs out and deletes the file; `BcfConfig.ServiceToken` prefers the session, falls back to the file's shared token, sends nothing on a tokenless install signed out, never uses a session when the config has no Supabase address. event-check 44/44 (a 401 is "not recorded — HTTP 401: signed out — Sentinel ▸ Sign in"), project-context 19/19, gate 124/124, artefact-cache 53/53, publish 112/112, roi 43/43, ghost-standards 135/135; npm test 1730 in 116 (the web signs out with scope local); tsc 23 | tool output |
| Sign in from the ribbon | Standards ▸ Sign in → e-mail + password (typed by the founder) → "Signed in as <the founder's account> — the ledger records your e-mail."; `%LOCALAPPDATA%\Sentinel\session.bin` 1142 bytes at 01:39 | founder's screen; file listing |
| Reads carry the person | IFC Delivery Gate dialog: `Contract: contract@1 · project · 9cc32c96f815…` resolved from the bridge under the session bearer | founder's screenshot |
| A machine-only route refuses the person, in words | IFC Delivery Gate ▸ Export active view, then certify → `✓ PASS — certified for CDE upload … Not recorded — HTTP 403: the delivery-gate route is for Sentinel's machine credential`; Governed Publish on the whole model → `✕ REJECTED — delivery gate failed` (IFCBUILDINGELEMENTPROXY 224/602 = 37 % > 5 %), `Gate row: not recorded — HTTP 403: …` — the bearer is the user's (the shared token would have been "recorded"); the pass and the certificate are unaffected; the gate row moves to the bridge in H5 | founder's screenshots |
| A user-authored write from Revit | not exercised: Naming Manager refused the rename locally (the proposed name does not match the schema — no ledger row), the Issues window is import-only, Governed Publish was rejected by the contract before its proposal rows. The bridge stamps `resolveActor` (the verified e-mail) on every such write; a write with the founder's e-mail as actor is owed to the next Revit-side write feature (issue creation from Revit, or a passing Governed Publish) | code: `cde-store.mjs:1695`, `bcf-service.mjs:339` |
| The web's sign-out leaves Revit signed in | founder signed out on the web app; Standards ▸ Sign in in Revit still "Signed in as …" | founder's report |
| A Revit restart keeps the session | Revit closed and reopened; Standards ▸ Sign in still "Signed in as …" (the DPAPI file) | founder's report |
| Not run live | two Revit versions open at once (covered offline by the session-check mutex row); a tokenless install (H6) | — |
| Founder's product notes during the drill | (1) the Naming Manager should suggest a compliant name from the naming rule; (2) issues should be creatable from Revit with a viewpoint and the selected GUIDs. Both on the roadmap after H4 | — |

## Session B16 — Naming Manager suggestions and the user-attributed write (2026-09-28)

Founder at the Revit 2024 add-in on `aster-tower`, signed in from the ribbon (H4); builds 02:04 → 03:04.

| Row | Observed | Source |
|---|---|---|
| A user-attributed write from Revit (owed by B15) | Naming Manager renamed `2' x 4' ACT System` → `AST_EXT_ARC_ACT_200 mm`; the window printed `Recorded: ledger #1093 · receipt d3238e02b9955be2…`; row 1093 read back from `audit_log`: entity_type `naming`, actor `<the founder's account>`, hash `d3238e02b9955be2663e36882c881a9afcc9de93c54eda1c30b29d39be62687b` | founder's screenshot; SQL read of row 1093 |
| The first attempt was refused | `Not recorded — HTTP 400: a signed-in caller writes notes only` — the H0 rule let a signed-in person write notes only; fixed: a signed-in contributor or above may report Revit's own `naming`/`family_heal` rows under their verified identity (256 KB, budgeted); `write-roles` 40/40, bridge suite 1417 | founder's screenshot; `WebApp/bridge/cde-store.mjs` `recordRevitReport` |
| Slot editors replaced by one suggestion | per-token boxes judged "a bad way to rename" by the founder; replaced by one editable full name (Review Fix pattern) with the refused part in words, plus a ⚡ Fix button per row | founder's screenshots |
| Wrong material code | `5/8" GWB on Metal Stud` → MTL (longest alias won); fixed to the earliest-mentioned word (GYP) | founder's screenshot; naming-check |
| Ceiling measured against the typed size | the founder's `…_200 mm` ceiling was flagged `name says 200 mm, Width is 57.15 mm` with `…_ACT_57.15 mm` proposed — the check held | founder's screenshot |
| The fact-driven scan on the model (Claude at the founder's PC, read-only) | build 03:04 + ruleset@4: `142 shown · conforming 4 · proposed 95 · needs human 38 · blocked 5` (before: proposed 0, needs human 136); each proposed row names its sources, e.g. `LOC EXT from Function = Exterior; LEAF 1 PNL from family 'Door-Passage-Single-Flush'; MATERIAL MTL from Frame Material = Metal - Paint Finish - Grey`; the 5 blocked are duplicates of types already so named (Concrete 6" → AST_INT_ARC_CON_152.4 mm exists) | Revit 2024, Naming Manager, screenshots |
| Gaps found and fixed in the same night | `Tür 900×2100` (× and no unit) → read as mm, said in the note; roofs had no LOC fact → Roofs → EXT by category; `Generic - 12"` took its leftover words as MATERIAL → now `MATERIAL not found in the name, the family, the layers or the parameters the rule names`; build 03:16 + ruleset@5: `conforming 4 · proposed 99 · needs human 34 · blocked 5` | Revit 2024 rescan; naming-check 76/76 |
| Not run | Tick all proposed → Rename ticked on the model — the founder's decision (99 renames of his model; doors take MATERIAL from Frame Material where Door Material is empty — check that reading first); nothing was renamed or saved during the scan | — |

## Session B17 — an issue raised from Revit (2026-09-28, 03:34, run by Claude at the founder's PC)

Build 03:29 (`feature/revit-issues`), Revit 2024, `aster-tower` local file, signed in from the ribbon (H4 session).

| Row | Observed | Source |
|---|---|---|
| The button | Sentinel ▸ BCF Issues shows `＋ New issue from my Revit selection` | screenshot |
| Capture | one wall selected in `{3D - yazan.hKNTHU}` → the dialog said `Points at 1 element(s): 1 × Walls · camera from '{3D - yazan.hKNTHU}' (isometric, sent as a 60° perspective).`, description prefilled `Raised from Revit on 1 × Walls in 'AST_ASTR26_Aster Tower_yazan.hKNTHU'.` | screenshot |
| Created under the person | title `Drill B17 - issue raised from Revit (test, safe to close)`; `bcf_topics` row `1297f06e-045e-43bd-bf67-0f68377db835`: creation_author `<the founder's account>` (the verified identity, not the "Revit" label sent), type Issue, priority Normal, labels `["revit"]`, 1 viewpoint with selection `[{ifc_guid: 2g7hEgAuvEG8Tt5lC2ABVU}]` and a camera in metres | SQL read of the row |
| Round trip | double-clicking the new issue in the same window → `Isolated + selected 1 element(s).`, the Properties palette showing the same wall (Basic Wall · Interior - 4 1/2" Partition) — the GlobalId written maps back to its element | screenshot |
| Found and fixed | the live refresh that follows the bridge's broadcast replaced the "Issue created …" line with the list count within a second; the outcome now stays on the line for 90 s above the count (build 03:35) | screenshot; `BcfIssuesWindow.SetOutcome` |
| Not run live | the web board showing the issue's camera (the camera's frame is the shared coordinate base the IFC export uses — the same assumption BcfApplyEvent makes, not measured against the published .frag); a viewer refused (covered by the bridge's role tests); the outcome line after the fix | — |
| Left in the project | the drill issue is Open on `aster-tower` — the founder decides whether to close it | — |

## Session B18 — exact clash on the solids (2026-09-28, ~04:00, run by Claude in the founder's Chrome)

Local build (`feature/3d-viewer`, served by `web-dev` on :4000) opened as the platform's local app; signed in to the
bridge as the founder (session already in that browser); `aster-tower` › Project Files › `AST_ASTR26_Aster Tower_yazan.ifc`
v4 › Open 3D; Coordination › Clash › Hard, min. penetration 0.02 m › Run clash.

| Row | Observed | Source |
|---|---|---|
| The mode selector | `Hard` / `Clearance` beside the tolerance, labelled "min. penetration" / "distance" | screenshot |
| First run (before the touching split) | `1 model against itself · 602 elements · 798 box overlap(s) → 574 clash(es) on the solids, 224 boxes only (dropped)` | screenshot |
| What the Collider returned | `3635 hit(s) · volume>0 1083 · volume=0 2552 · no volume 0 · max 342.9022 m3` (the hits include each element against itself — filtered — and both orders of a pair) | console line, since removed |
| Found and fixed | zero-volume pairs were ranked by their box volume; now marked *touching*, counted, listed last | `clash-confirm.ts`; vitest 10/10 |
| Second run | `798 box overlap(s) → 574 clash(es) on the solids (182 overlapping, 392 touching — no overlap volume), 224 boxes only (dropped)` — the box-only engine would have reported all 798 | screenshot |
| A confirmed clash | the top row `AST_AS #5610 ↔ AST_AS #4694 · 2.812 m³` isolated two coincident slabs — a real modelling error | screenshot |
| Not run | two models (federated), clearance mode on the model, the ⚑ Raise of a confirmed clash into the register, the published app (not published) | — |
| Also seen | the web Issues board lists the B17 issue raised from Revit (`Drill B17 … 1 el · unassigned`); Standards shows `ruleset@5 · office` | screenshots |
| Ledger vs model | the ledger holds `Naming Manager renamed 56 item(s) in Revit [founder]` at 00:58 UTC, but the local model file was last saved 00:39 UTC and read 4 conforming names at 03:12 — the rename was not saved, the ledger row stands. A ledger row records the act in Revit at commit time, not the saved file | CDE ledger panel; Revit scan |

## Session B19 — the viewer measured, the federation's tree, WebGPU tried (2026-09-28, ~10:20–10:45, Claude in the founder's Chrome)

Local build (`feature/3d-readout`, `web-dev` on :4000) as the platform's local app, signed in as the founder;
aster-tower › Project Files › Open 3D on `AST_ASTR26_Aster Tower_yazan.ifc` v4 and `ASTR26-AST-ZZ-XX-M3-A-0001.ifc` v2.

| Row | Observed | Source |
|---|---|---|
| Browser, two models | `▣ AST_ASTR26_Aster Tower_yazan.ifc@v4 · 626` and `▣ ASTR26-AST-ZZ-XX-M3-A-0001.ifc@v2 · 401`, `2 models · 13 categories · 1,027 elements` | screenshot |
| Found and fixed | PROJECT, DERIVEDUNIT, WALLTYPE, SLABTYPE, BUILDINGELEMENTPROXYTYPE listed as categories; after `isBrowsable`: `2 models · 8 categories · 1,014 elements` (Building, Doors, Floors/Slabs, Generic Models, Levels, Site, Walls, Windows) | screenshots |
| The platform's tree with two models | Explorer › Tree shows two roots both named `Project Number - 30` (the IFC project name) — which model is which cannot be told; Sentinel's Browser names the model and version | screenshot |
| First measure (before the review fixes) | `Renderer: webgl · AK · AUTO` · Intel UHD Graphics (ANGLE, D3D11) · `1,102 draw calls · 208,598 triangles` per drawn frame · 38 geometries, 23 textures · JS heap 149 MB · both models `culling/LOD follow the camera` · `Measured 10.4 s · 1 frames` | screenshot |
| Found by the review, confirmed live | the draw calls and triangles counted the engine's hover/anchor pick passes and the frame before the window; after the fix the same scene reads `241 draw calls · 47,859 triangles` per drawn frame — the first reading was ~4.5× inflated; the renderer is named `PostproductionRenderer` | screenshot; review workflow (10 confirmed, 7 refuted) |
| Frame time not measured | the browser gave the page 1 animation frame in 10–28 s: the Chrome window was covered (the Windows lock screen process was running); the readout now says so on its own line instead of printing a frame time | screenshot |
| Streaming finding | both models already have culling/LOD bound to the viewer's camera (the platform binds it) — "bind the camera at load" is not needed; the next levers are the engine settings (graphicsQuality 0, lodThresholds, culling) | readout |
| WebGPU | not tried in the browser: the build cannot be made — the engine packages import WebGL-only three add-ons at load (details in the 3D spec, Decision 6) | trial builds, scratchpad only |
| Not run | a frame-time measurement with Chrome in front; the published app (not published) | — |

## Session B20 — the gate locks ⚑ Raise; web app 1.0.26 published (2026-09-28, ~11:00–11:55)

The founder's answers: publish, yes (the lock), done (the rename), and his Chrome window holds the Sentinel app.

| Row | Observed | Source |
|---|---|---|
| The lock, built | `raiseGate` (pure) + `POST /clash/:pid` 409 in words + the panel's pre-check and banner; its review confirmed 9 findings, refuted 4; fixed: a partial (explicit) gate run no longer opens the lock, a pass needs one check that passed, a Clash issue is refused at the same gate, the register is written with the service key, a no-CDE bridge has no gate | `bridge/federation-store.mjs`, `bcf-service.mjs`, `clash-panel.ts`; vitest 1756, route tests |
| Migration 0034 | written with its probe; APPLIED on the founder's "apply" (~12:25): probe 8 of 8 true; as the founder (owner of aster-tower), a direct `bridge_docs` insert into `clash` → `new row violates row-level security policy`, the control insert into `rfi` → inserted (both removed); through the bridge `GET /clash/aster-tower` 200 (0 records) and `raise: {ok: false, why: "the Federation Gate has not been run on this project — run it first …"}` | Supabase SQL; bridge reads |
| Published | web app 1.0.26 (version 6aba387993f8e6a2d1e393f6, 15.4 MB) — exact clash on the solids, BIM Tools ▸ Performance, the federation Browser, the lock | `npm run publish` output |
| The bridge stopped again | both managed servers stopped by the desktop app at 09:17 UTC (and 07:05 UTC); the founder's rename around 11:25 local is in the saved model (local and central 11:30) but no ledger row reached the ledger (last naming row #1095, 00:58 UTC) — the bridge was not answering; restarted 09:37 and 09:48 UTC | preview server list; `audit_log`; file times |
| aster-tower's gate after the lock (B21) | the founder ran it: `NOT CHECKABLE · 4 model(s) · 0 of 4 read · ⚑ Raise locked`; causes: no live model had a manifest (none entered through intake), `programme.csv` registered as a "model", and aster-tower holds one building in three copies; fixed: IFC-only federated set, a size check on fingerprint-less backfills, the one-model rule (option B) reviewed twice (9 + 14 confirmed); ASTR26 v2's manifest backfilled from its size-matched file (378 elements; `guid_audit`: 563 IfcProducts, 0 duplicate, 0 missing GlobalIds); the two old Aster containers' IFC sources no longer exist — the founder archives them (drafts are discarded, so he presses it) | Supabase reads; bridge |
| Frame time | not measured by Claude: the Chrome window was behind the Claude window (1 animation frame in 11.5 s — the readout said so) | screenshot |
| Frame time, measured by the founder (10:09 UTC, published 1.0.26, Chrome in front, orbiting) | one model (`ASTR26-AST-ZZ-XX-M3-A-0001.ifc@v2`, 378 elements): `600 frames (60 per s) · frame time p50 16.7 ms, p95 16.8 ms, worst 17.2 ms`; every frame drawn; `draw calls avg 107 / max 135 · triangles submitted avg 25,896 / max 29,219`; 21 geometries, 23 textures; JS heap 100 MB; culling/LOD follow the camera; Intel UHD Graphics (integrated). The frame time sits on the display's refresh (60 Hz): the viewer is not the limit at this size, and how much headroom is left is not measurable this way. The same readout in a covered window gave 1 frame — the throttling line was right | the founder's pasted readout |

## Session B22 — Deleted items (2026-09-28, ~18:05–18:30 UTC, run by Claude on the founder's "apply")

The founder's request (2026-09-28): the two entries he deleted should be restorable, as in ACC/Forma; he took every default
recommendation, then said "apply". The bridge rows ran on a drill project, `b22-deleted` (created by SQL with no owner, so
only the machine credential reaches it), so the founder's own files stay in Deleted items for him to restore.

| Row | Expected | Observed |
|---|---|---|
| 0035 applied, probe | part 1: 7 of 7 true; part 2: `PROBE 0035: 22 of 22 as expected`, all rolled back | applied ~18:08; part 1 7 of 7 true; part 2 `PROBE 0035: 22 of 22 as expected` (audit ids 1106–1110 consumed by the rolled-back rows); afterwards no probe project left and nothing deleted |
| Bridge restart | the Deleted items code running right after the apply | restarted ~18:09; clean start (auth gate armed, JWT forwarding armed, platform token valid) |
| The rebuild | both files in Deleted items, 4 + 2 versions set aside, two `container rebuilt` rows; a second run refused | `AST_ASTR26_Aster Tower_yazan.ifc` (deleted 13:23:45 UTC) and `….hKNTHU.ifc` (13:23:41) by the founder, container_type model, at the root; v1–v4 and v1–v2 wip S0, not live, set aside at 13:01:04 and 13:00:37, platform items on the four .ifc versions; ledger #1111 and #1112; a second run → `already rebuilt — a file id is in use; nothing was done` |
| The list (bridge) | `GET /cde/aster-tower/files/deleted` → the two files with their counts | `file … yazan.ifc · 0 ver + 4 deleted · by the founder` and `file … hKNTHU.ifc · 0 ver + 2 deleted`; the files list holds `ASTR26-AST-ZZ-XX-M3-A-0001.ifc` and `programme.csv` only; the project's `container_count` 2; the Federation Gate's latest set one model |
| The list (web) | Project Files ▸ Deleted items (2) | local app in the founder's Chrome, signed in as him: `Deleted items (2)`, each row `— the file, with 0 version(s) (and n deleted version(s), restorable after the file)`, `deleted by <the founder> · 2026-09-28 13:23`, Restore (he is the owner); status `2 file(s) · 3 version(s) · 0 on hold · 2 in Deleted items.`; fixed during the run: the row text was cut off with an ellipsis, now it wraps. ASTR26 (v2 published) shows Rename, Archive, Delete. Restore not clicked |
| Archive a drafts-only file (route) | drafts to Deleted items, the file empty, counted | `200 {archived: 0, discarded: 2}`; `version_count 0, deleted_versions 2`; both drafts listed as versions by `b22` |
| Restore a version | back as wip, not live; a second restore a 404 in words | `200 {kind: version, revision: v2}`, `v2 wip live=false`; again → `404 this version is not in Deleted items` |
| Labels | a new version never reuses a deleted one's | `201 v3` (v1 set aside, v2 back) |
| Delete | to Deleted items, gone from the files list, counted apart | `200 {deleted: true, deleted_items: true}`; files: B22-P, B22-B; listed `versions 2, deleted_versions 1` |
| Nothing changes on a deleted file | move, set-live, rename, a CDE version each refused in words | move `409 this file is in Deleted items — restore it first; nothing was saved`; set-live `409 this version is in Deleted items — restore it first`; rename `404 file not found in this project`; add `409 …restore it first; nothing was saved` |
| The name is free, a taken name refused | a new B22-A.ifc is a new file; the old one's restore a 409 in words | new container, `v1`; restore → `409 A file named B22-A.ifc is already in this project — rename or delete that file, then restore this one. Nothing was restored.` |
| Restore a file | back with its versions; the one set aside before stays aside | `200 {versions: 2, deleted_versions: 1}`; back in the list at the root; its last set-aside version then restores on its own (`v1`). The row as written also expected "nothing live": wrong — v3 was the live version when the file was deleted, and a restored file keeps it (only a version deleted on its own comes back not live). 18 of 19 rows as written |
| Two deletes at once | the move made and recorded once | `409 already in Deleted items — nothing was saved` and `200`; one `deleted` row |
| A published version | the file refused in the old words, no row | `409 This file has PUBLISHED versions, which are immutable by design — it cannot be deleted. Archive it instead.` (the version published through `cde_transition` with a stand-in verdict row on the drill project) |
| An archived file | may be deleted, restores with its archived version | archive `{archived: 1}`, delete 200, restore `{versions: 1, deleted_versions: 0}`, state `archived` |
| The ledger | every move one row, in order | B22-A: #1113 created · #1114/#1116 set live · #1115/#1117 uploaded · #1127/#1128 file_version deleted · #1129 archived · #1130 file_version restored · #1133 container deleted · #1138 container restored · #1139 file_version restored |
| Not run live | a signed-in viewer's Restore (403) and a web Restore click | no second account; the founder's files are his to restore — the route's lead check and the guard's role check are pinned by `cde-store-writes.test.mjs` and probe rows D1, D14, D21 |
| Published | web app 1.0.28 with Deleted items | 1.0.28 published ~18:55 UTC (version 6abab82613cf4cfc31e0a522, 15.4 MB); it boots signed out in the founder's tab (reloaded by Claude's mistake: a navigate without a tab id), and says `Can't reach the bridge at https://4374ga.tailfae508.ts.net.` — local /health 200, the tailnet address 200, the public relay's TLS handshake fails, as earlier the same day after a bridge restart; the founder runs `tools/public-bridge-off.cmd` then `public-bridge-on.cmd` |
| The published app after the toggle | reaches the bridge | still `Can't reach the bridge` after the founder's off/on: the relay answered curl, the platform top page and a sandboxed frame on example.com, but a sandboxed frame on platform.thatopen.com never sent its request. Cause: between `public-bridge-off` (MagicDNS on) and `public-bridge-on`, Chrome cached the tailnet address for the platform site's frames, and Chrome blocks a sandboxed public frame from a private address. Clearing Chrome's cached lookups (restart, or net-internals host cache + socket pools) fixed it — the founder: "worked" |

## Session B23 — every panel follows a sign-in and a bridge outage (2026-09-29, before the hackathon deadline)

The founder: "fix everything before the deadline". An audit mapped 28 panels; one shared watcher in `bridge-fetch.ts`
(a failed read probes /health at once; only after an outage it saw does the first answer fire `sentinel:bridge-back`,
which reloads every panel) and per-panel fixes; three review rounds (25 findings, then 8, all fixed). Live in the local
app on aster-tower, in Claude's tab:

| Row | Observed |
|---|---|
| Signed in, first load | Projects hub (8 projects), Dashboard (Run gate for the lead), Project Files (2 files, Deleted items 2, the ledger read in chunks with no gap line), Issues (8), Clash (`Federation Gate: PASS · 1 model(s)`), CDE board with the Platform deliveries strip and the ledger |
| Sign out (Claude, in its tab) | every panel reloaded by itself: CDE `CDE: not read — Unauthorized`, `Ledger: not read — Unauthorized`, `Reviews: not read — Unauthorized`; Issues `Issues not read — Unauthorized`; Clash `Federation Gate: not read — Unauthorized`; Files `Files not read — Unauthorized.` with Upload hidden; the hub `Sign in (bottom right) to see your projects…`; the sign-in form opened once and stayed closed for 10 s after ✕ |
| Sign in (the founder, same tab) | every panel reloaded with no ↻: the hub's 8 projects, Clash PASS, the CDE board, Issues (8) |
| The bridge coming back | not run live (a bridge restart broke the public relay twice on 2026-09-28): pinned by `bridge-watch.test.ts` — an outage then the bridge back fires once; a read that fails while /health answers reloads nothing (no loop); a real outage right after a false alarm is still caught; a long outage keeps probing every 60 s; the signed-out feed asks once a minute |
| Published | web app 1.0.29 on the founder's "yes publish" (version 6abaeee993f8e6a2d1e3e764, 15.4 MB); a fresh tab of the published app boots signed out through the public relay: `Sign in (bottom right) to see your projects…`, `Not signed in — the bridge answered 401.`, the sign-in form open |

## Owed web rows, run 2026-09-29 in the local app (the extension can drive the platform's local-app tab now)

| Owed row | Observed | Still not run, and why |
|---|---|---|
| B11 — the Dashboard, the pilot's stage | aster-tower as its owner: the rail on **Tender** (current), `Stage gate · Tender (current · preview — Run gate measures on the bridge)`, `GATE PASS`, **Run gate → advance to Design** offered to the lead | pressing Run gate advances aster-tower to Design — the founder's governance decision, not a drill's; the non-lead line needs a second account (pinned by `stage-gate.test.ts`, `gates.test.ts`) |
| B14 — the web rows of the platform gate | the CDE board's **Platform deliveries** strip `1 IFC · 1 passed`, the card `Passed — contract@1`, its sha256 and run; Settings ▸ Standards in force `contract@1 · project · 9cc32c96f815… · the founder · 2026-09-27` (the install-time note `also on the platform as sentinel-contract.json` is in the recorded video) | the Revit-pane publish row: a Governed Publish of aster-tower adds a version and resets its Federation Gate pass right before the hackathon — after the deadline |
| B12 — On hold in the web | not run: it needs a refused upload through the file picker and a lead's dismissal on a live project; left with B11's gate run for the founder's session after the deadline | pinned by `holding.test.ts` (16) and the bridge rows of B12 |

## Session B24 — the platform gate's runs on Sentinel's ledger (roadmap item 3, 2026-09-29)

The founder: "do everything on your own … continue the roadmap". Spec `docs/superpowers/specs/2026-09-29-platform-native-design.md`.

| Row | Observed |
|---|---|
| Read-only first (the bridge token) | `listFolders({projectId})` answered (4 folders); `listExecutions` 9 runs with `result`/`resultMessage` (two with a `creatingToken` field); `getExecution` carries `Reading <name> <tag>…`; a `.frag` version's map already holds `sourceIfcId`; exactly one project (aster-tower) links the Welcome Project; no `platform_gate` row |
| Dry run (the writer replaced by a printer) | 9 rows, oldest first: 4 NOT CHECKED, 2 FAIL, 3 PASS; the 1.0.0 run's `accessToken` scrubbed; no `creatingToken`, no JWT |
| Review (3 lenses, adversarially verified) | 4 minor confirmed, all fixed (a tag with a space; a run whose detail is unreadable stalling later ones; two mirrors of one version racing; the strip's 200-row page); 7 refuted |
| 0036 applied, probe | part 1: 3 of 3 true; part 2: `PROBE 0036: 4 of 4 as expected` (a duplicate run refused 23505 with the chain tip unchanged), rolled back — ledger ids 1150–1153 consumed |
| `node bridge/platform-gate-ledger.mjs --once` | `{"written":9,"skipped":0}` → aster-tower #1154–#1162, each chaining to the one before, no token; a second run `{"written":0,"skipped":9}` |
| The strip's read | `GET /cde/aster-tower/audit?entity_type=platform_gate` → 9 rows; the ASTR26 v3 card's run → `ledger #1162` (the card itself not seen live: the platform session had expired in the test tab) |
| After 2026-10-04 | the bridge restart with the founder's Funnel toggle (the reserved type on the open route, the in-bridge poller); web 1.0.30; part B on a scratch `.frag` version (`SENTINEL_PLATFORM_STATE=on`) |

## Session B25 — the rest of item 3, live (2026-09-29, the founder: "forget the deadline and fix everything")

| Row | Observed |
|---|---|
| Part B on a scratch `.frag` (the archived drill project b10-publish, v1) | the platform copy `AST_ASTR26_Aster Tower.frag` (one version, v1) had `{}`; `transition(wip → shared)` wrote `state:wip->shared` #1163 and the hook wrote `{"sentinel_state":"shared","sentinel_state_row":"1163"}` onto the copy; a second mirror answered `up to date — the label already names ledger #1163`; the platform gate's run count 9 → 9 (a `.frag` label never starts the gate) |
| Switched on | `config/.env`: `THATOPEN_GATE_COMPONENT_ID` (the in-bridge sync every 60 s) and `SENTINEL_PLATFORM_STATE=on` |
| The bridge restart | clean; the public relay answered before and after (the two earlier breaks did not repeat); `[platform-gate] on — component 6ab97f72…, every 60 s`; `platform token: valid ✓` now proves the project read |
| The open route refuses the type | `POST /cde/aster-tower/audit` with `platform_gate` and ` Platform_Gate ` → `400 platform_gate rows are written by Sentinel, not through this route`; no forged row; a minute of the poller wrote no duplicate (9 rows) |
| Published | web app 1.0.30 (version 6abb00ba93f8e6a2d1e3ed48) boots in a fresh tab (signed out, the bridge answering 401 through the relay); in the local app (SDK 0.16.1, after the founder signed in to That Open) the Platform deliveries card reads `Passed — contract@1 · sha256 5a496247defa… · run 6ab99e4d93f8e6a2d1e371d3 · ledger #1162`, and the CDE ledger strip lists the nine `platform gate` rows |
| SDK 0.16.1 (item 4 phase 1, merged 3651f62) | tests 1867, tsc 22; the bridge's platform reads answer under it; the bridge restarted on it (`platform token: valid ✓`, the poller on, the relay answering); the local app loads and works on it |

## Session B26 — Ask Sentinel, live (roadmap item 4, 2026-09-29, ~02:50–03:30 CEST, run by Claude alone on the founder's "do everything by yourself")

| Row | Observed |
|---|---|
| Local app, signed in (1cbf96d: a row is cited only when it names the card's file and version) | `node bridge/ask-sentinel.mjs status` → `delivered 1`, `{app_version 1.0.30, sentinel_project aster-tower, signed_in true, bridge reachable}`; `deliveries` → ASTR26 v3, the platform's hint `Passed — contract@1`, run 6ab99e4d…, `ledger #1162`, `ledger_result pass`, `agrees true`. An earlier "not open" was the ask arriving before the tab had loaded |
| Published 1.0.31 (version 6abb0da3…), signed out | answered only now and then: `delivered 0` on 9 asks in a row, then answers. **Root cause, measured:** `platform.thatopen.com` resolves to two addresses (3.69.132.147, 52.58.243.60) whose channel servers do not share rooms — pinned asks: via 52.58.243.60 `delivered 1` ×3, via 3.69.132.147 `delivered 0` ×3, the tab's socket on the first. A platform bug (to report to That Open). Fixed on our side (1c2df2e): the asker asks on every address (pinned, `forceNew`), the first reply wins, "not open" only when every address says so. After: 5 of 6 answered, the sixth said "the platform did not confirm the channel within 10 s" — never a false "not open" |
| Published, signed out, `deliveries` | ASTR26 v3 with `ledger not read — this tab is not signed in to Sentinel`, no `agrees` |
| Published, closed | `Sentinel is not open (and joined) … — not answered` |
| Found and fixed | signed out, `sentinel_project` named the platform project's id (the key's fallback); now `null` until a Sentinel project is linked or picked — 1.0.32 (6abb10bd…) answers `sentinel_project: null` |
| Delivery gate 1.0.4 (component version 6abb1139…; label merge, `showVersions`, the download ok check) | run once with `executeComponent(…, {fileId, versionTag v3}, "1.0.4")` on ASTR26 v3: `toolVersion 1.0.4`, `Passed — contract@1 (aster-tower) — the report could not be written: Duplicated entry` (WARNING); no label key lost, `sentinel_run` = this run; the in-bridge poller wrote ledger **#1164** within its minute (`platform gate PASS … v3`, component 1.0.4) |
| Found and fixed | a re-run of a judged version cannot write its report (the platform refuses a second version with the same tag), and the card preferred any report — it kept showing the earlier run. Now the labels are read for every IFC and a report whose run is not the labels' run gives way, said in words (14304c1). Live, local app: `run 6abb1161…`, `ledger #1164`, `agrees true` |
| Web 1.0.33 (6abb1359…) | boots in a fresh tab (~55 s for the new 15 MB bundle); `status` → `app_version 1.0.33`, `sentinel_project null`, `bridge reachable`. Carries "Change password" (f9b0e86) — the form renders and refuses an empty current password in words, nothing asked; the change itself was not run (it needs the account's password — the founder's) |
| Owed (the founder) | sign in to Sentinel in the published app and run `node bridge/ask-sentinel.mjs deliveries --app 6a56513872a416a2841b0667` (expect `ledger #1164`, `agrees true`); re-point both "Sentinel gate" automations to component 1.0.4; change the account password with the new button |

## Session B27 — 2D: sheets against the MIDP, live plans on the Views engine (roadmap item 5, 2026-09-29, ~04:00–05:00 CEST, Claude alone)

| Row | Observed |
|---|---|
| Bridge, on a new drill project `b27-sheets` (under aster-office, so its naming@1 judges; made by the machine credential — no member sees it) | one MIDP row `ASTR26-AST-ZZ-00-DR-A-0100` due 2027-01-31, expected P01. Proposed `…-0100.pdf` with register.revision P01 → `recorded` (no elements), naming ok, `midp {planned, row, due 2027-01-31, expected P01, revision met}`, registered **P01** (not v1) — proposal row #1167 carries the same `midp`. `…-01-DR-A-0101.pdf` → `midp {planned:false}`, registered P01 (#1172). `A-101.pdf` → rejected in the standard's words ("expected 7 '-'-separated fields … got 2"), held (#1178), nothing registered (#1177) |
| Status | the planned row `in_wip` (registered, not published), revision `pending`; `unplanned: [{…-0101.pdf, 1 version}]` |
| The chain | the 18 rows from #1160 link (`prev_hash` = the previous `hash`), 0 breaks |
| Web, local app, aster-tower | Deliverables: "Issued, never planned (1) — programme.csv · 1 version" beside the delivered model (after the bridge restart; the relay answered 200 before and after). BIM Tools ▸ Browser ▸ ▦ Plans on v2: 15 storey views; **L04_FFL** opens top-down with the cut walls in the Section style; L03_FFL shows its slab (that level's content); Exit to 3D returns to the same pose. Aster has no published Revit views or sheets, so the lightbox buttons were not exercised |
| Found and fixed | while the dashboard reloaded, the stage-gate preview read "Standards pack selected (none)" and GATE HOLD before the ruleset read answered (then PASS); a failed read said "No ruleset installed". Now not read = not measured (GATE NOT CHECKABLE), and a failed read is named (cfb8d5e) |
| Published | web 1.0.34 (6abb1c35…) boots (~70 s for the new bundle) and answers `status` over the channel: `app_version 1.0.34` |
| Owed (a session with Revit) | Publish Sheets on aster: PDFs written (2024 PDF export has not run in this codebase), one proposal row per sheet, the dialog lines; the lead publishes the planned sheet with a reason → the Deliverables row reads delivered; the Sheets panel's lines; Live plan from a sheet hotspot and a Revit plan view. The add-in was built for 2024 and 2026 with DeployToRevit=false — install it with the normal build when Revit is closed |

## Session B28 — 5D/6D revisions and 7D hand-over measured (roadmap item 6, 2026-09-29, ~05:00–06:30 CEST, Claude alone)

| Row | Observed |
|---|---|
| Found (query) | all 30 `model_revisions` on the shared DB carried no quantities (every `element_snapshots` row null in all five measures) — web baselines (demo ×16, aster-office ×5) and intake captures alike. Cause: the web sends `{guid, …, quantities: {…}}`; `createRevision` read `s.count` etc. at the top level. A 5D/6D Δ against them priced a missing count as 1 and a missing area as 0 |
| Fixed, live through the bridge on `b27-sheets` | two nested take-offs stored with their measures (`w1` count 1, area 12, volume 2.4); delta A→B `comparable: true`, "0 added, 0 removed, 1 changed · +2.6k SAR · +760 kg CO₂e" with its basis; an identities-only revision → `comparable: false`, "revision B28-ids carries no quantities … — no cost or carbon is stated", elements `{added 0, deleted 0, in_both 2}` |
| Web | the store throws its reason on a failed read or save; Cost and Carbon say "saved team-wide / saved with the project / not saved — why" (no "saved locally"); picking a revision of identities only says "Baseline not set — that revision carries no quantities …" (unit-tested; the 30 old revisions all read that way) |
| 7D honesty | readiness floored (94.97 % reads 94, test); the COBie save carries its counts and date and says a refusal; the Owner view reads "N of M assets complete — a browser scan of <date>, not the recorded stage gate" instead of "Ready for handover" |
| 7D measured by the bridge | `readCobie("aster-tower")` before: "not measured — ASTR26 … v2's manifest was captured before COBie was measured (backfill it)". Backfill of v2 through the route with its own bytes (the outbox's sent file, 1 052 497 bytes = the recorded size; sha256 5a496247defa…, the file the platform gate judged): 201, 378 elements, 15 levels, site kept. After: readiness **0** — "COBie on the live models: ASTR26-AST-ZZ-XX-M3-A-0001.ifc v2 0/168 · sha256 5a496247defa…" (56 doors + 112 windows, no FM data). The hand-over check as the recorded gate measures it: ok false, na false, detail 0, that source. **The gate itself was not run** (Run gate is the founder's) |
| Published | web 1.0.35 (6abb218e…) boots (~100 s for the new bundle), `app_version 1.0.35` over the channel |

## Session B29 — 5D, 6D and 4D live (roadmap item 6, 2026-09-29, ~06:30–08:00 CEST, Claude alone)

| Row | Observed |
|---|---|
| 5D, bridge on `b27-sheets` | a take-off posted, a tender issued pinned to it (`revision_id` stored, `rate_basis` "reference rates — this project has no rate pack"); a bid with rate `""` → 400 "the bid rate for C1 must be a number of 0 or more — nothing was saved"; a bid with no rate for the line → total 3000 (the estimate's); "since issue" with no newer take-off → the tender's own revision (the panel says "no take-off since issue"); after a new take-off → "1 added, 0 removed, 1 changed · +3.1k SAR · +615 kg CO₂e" at "bridge reference rate table (this project has no rate pack)" |
| 6D, bridge on `b27-sheets` | a pack with a negative factor → 400 "carbon_factors: factors[0].factor must be a number ≥ 0 (kgCO₂e per unit)"; `carbon_factors@1` installed (sha 044d417ddf1c…, project); the same delta then priced carbon at the pack (+720 kg: +6 m² of wall × 120) and named it "B29 drill EPD set (walls 120, slabs 300) — carbon_factors@1 · project · 044d417ddf1c…" |
| 4D, local app on aster-tower v2 | a programme CSV with a containers column, imported through the panel: "Structural Frame — ASTR26-AST-ZZ-XX-M3-A-0001: delivered 2026-09-22, before the task starts" (green); "Fit-out L00 — ASTR26-AST-ZZ-00-DR-A-0100: due 2027-02-14, after the task starts 2026-12-01 — it will be late"; two invented containers "not in the MIDP"; "row 6: start "03/04/2026" could be day/month or month/day — write it as yyyy-mm-dd" (refused); Handover (no category) "matches no element" and not counted. **Found and fixed live:** "Facade" (WALL) matched nothing — aster's walls are all IFCWALLSTANDARDCASE; a class now takes its standard/elemented cases, and Facade picked up the walls |
| Published | web 1.0.36 (6abb2683…); `status` over the channel → `app_version 1.0.36` |
| Not run | the Tender and Carbon panels' own buttons in a browser (their bridge rows ran; the web code is type-checked and the bid/issue paths unit-tested); an EPD factor pack or real tender rates (the founder's data) |

## B26 owed row, run 2026-09-29 (after the founder's morning report "can't reach the bridge")

| Row | Observed |
|---|---|
| The outage | the published app read "Projects not read — can't reach the bridge at https://4374ga.tailfae508.ts.net". Measured: local `:4100/health` no answer, the public address 502 — the bridge had been a managed server of the previous Claude session and ended with it. Restarted (poller on, platform token valid); local and public `/health` 200 |
| Recovery without a reload | the founder's open tab answered over the channel a minute later: `bridge reachable`, `signed_in true`, `sentinel_project aster-tower` (the watcher re-probed and reloaded the panels) |
| Published app, signed in (the owed row) | `node bridge/ask-sentinel.mjs deliveries --app 6a56513872a416a2841b0667` → ASTR26 v3, the platform's hint "Passed — contract@1", run 6abb1161…, **`ledger #1164`**, `ledger_result pass`, **`agrees true`** — B26 complete |
| Follow-up | `tools/bridge-start.cmd`: starts the bridge in its own window unless one already answers on :4100 (the "already running" path run; the start path not run — it would stop the founder's live bridge). A shortcut in `shell:startup` makes it start at every sign-in — the founder's to place |

## Session B30 — aster-tower gets hand-over data; the gate automations on 1.0.4, then the report fix 1.0.5 (2026-09-29, ~19:40–20:15 CEST, Claude, on the founder's "update the automations" and "make aster-tower has hand over data")

| Row | Observed |
|---|---|
| Automations | both "Sentinel gate" automations moved 1.0.3 → **1.0.4** in the platform UI ("Automation updated" each); their bindings unchanged (new version: fileId ← itemId, versionTag ← versionTag; new file: fileId ← itemId) |
| COBie on aster-tower | `WebApp/scripts/cobie-sample.mjs` on v2's own bytes (sha256 5a496247defa…): 522 lines appended — Pset_ManufacturerTypeInformation (Manufacturer, ModelLabel) and AST_Handover (InstallationDate, WarrantyDurationParts, DataStatus) shared per class, Pset_ManufacturerOccurrence.SerialNumber per element; **every value marked SAMPLE** (Aster is fictional). Checked before upload with the bridge's own code: COBie 0/168 → **168/168**, readiness 100; contract@1 pass (15 264 entities, 0 failures); 378 elements read, 0 skipped; 563 products, 0 duplicate GlobalIds |
| Intake | `node bridge/intake.mjs … --project aster-tower --source cli --actor claude-agent --revision v3 --note "…SAMPLE values…"` → **ACCEPTED (published)**: gate PASS contract@1 · project · 9cc32c96f815…, naming ok, ids@3 0 failures, 378 read; **ledger #1187** (receipt 55d109463047…); v3 wip and live. `readCobie("aster-tower")` → readiness **100**, "ASTR26-AST-ZZ-XX-M3-A-0001.ifc v3 168/168 · sha256 1969750b8ac4…" |
| Platform automation 1.0.4 | the intake's IFC upload fired "Sentinel gate — new file" at 18:06:54 UTC: run #8E92 on 1.0.4, "15264 entities · aster-tower: 0 failure(s)", but **WARNING "Passed — contract@1 (aster-tower) — the report could not be written: Duplicated entry"** |
| Cause | the platform held two items named ASTR26-AST-ZZ-XX-M3-A-0001.ifc (the video's, v1–v3, and this intake's, v3); the component found the report item by name and added a second "v3" to the other file's report |
| Fix, component 1.0.5 | the report item is the one the IFC's own labels name (this version's, else its newest other version's), else a new one; a re-run's report is `<tag>.2`, `.3`…; the labels add `sentinel_report_tag`. 22 component tests (two new: the same-name case and the re-run). Published 1.0.5 (10.6 kB). Run once by `executeComponent` on the intake's item: **SUCCESS "Passed — contract@1 (aster-tower)"**, a new report item 6abbff7b… v3, labels name it, no key lost. Run once on the video's item v3 (a re-run): **SUCCESS**, report written as v3.2 — the old "re-run cannot write its report" gap closed |
| Fix, web card | the Platform deliveries card reads the report the labels name (item + tag), else, for older runs, the same-named report item that names this IFC; 25 tests (two new). Not yet published |
| Not done | the automations still run 1.0.4 (moving them to 1.0.5 is the founder's yes); web publish; the next Revit publish would drop the COBie data (the add-in's exporter writes no user-defined property sets) |

## Sessions B31 + B32 (partial) — Revit packages 1 and 2 live on Revit 2024 (2026-09-30, ~01:53–02:15 local, Claude driving Revit on the founder's "open and close revit when needed on ur own")

Build: feature/revit-package2 at 3408bb9…c58103a (session 1), then 583af6a (sessions 2–3), installed with Revit closed. Model: the aster-tower local (AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt); drill edits discarded on close ("Do not save the project", borrowed elements relinquished); central untouched.

| Row | Observed |
|---|---|
| B32-7 labels | pane "**Rule pass rate 58.7%**"; Health Scorecard "**Weighted rule score 32.5% (F) · rule pass rate 59.0%** — 175 open issue(s) across 7 domain(s)" with both formulas printed; IFC Pre-Flight pane "**IFC mapping coverage 45.8%**" (the label is "IFC readiness" from 583af6a on) — **pass** |
| B32-4 ⚡ Fix on a REQUEST row | VN-01 row "L1 - Architectural": the dialog proposed "ARC_L00_PLAN_L1 - Architectural", "✓ Matches the naming schema"; Execute → pane "✓ Proposed 'ARC_L00_PLAN_L1 - Architectural' for 'L1 - Architectural' — a coordinator approves it in Change Requests"; the view kept its name. Change Requests listed "L1 - Architectural → ARC_L00_PLAN_L1 - Architectural" under the new wording; **Approve renamed the view** (Project Browser), 1 pending left — **pass** |
| B32-2 IFC-02 from the contract | 826 rows over 826 elements; aster's contract@1 has `required_properties: []` (read from the bridge) and `required_psets: ["Pset_WallCommon"]`, so no IFC-02 missing-property rows, and no more `{org}_View Status` rows — **pass as far as this contract can show**; the missing/unmapped cases are pinned offline (fixplace-check) |
| B31-1 Select pinned | family editor opened from aster (AST_Window_Casement_Double.rfa); pane stayed on aster; double-click an aster row → dialog "**Sentinel did not select the element: switch back to AST_ASTR26_Aster Tower_yazan.hKNTHU — nothing was changed.**" — **pass** |
| B31-2 ⚡ Fix pinned | same setup, ⚡ Fix on "West - Architectural", Execute → pane "**✕ Sentinel did not rename the element: switch back to AST_ASTR26_Aster Tower_yazan.hKNTHU — nothing was changed.**"; nothing renamed — **pass** |
| Undo finding (not a Sentinel bug) | after the Approve the Undo list was empty: the journal says "Transaction sucessfully committed and the undo stack FLUSH-ed as requested". A **manual** Project Browser rename of a view does the same (journal: ID_PRJBROWSER_RENAME … "undo stack FLUSH-ed as requested") — Revit flushes Undo on view renames in this workshared model. The one-Undo rows (B31-4) must use non-view actions |
| Not run | Revit stopped taking mouse and keyboard input in sessions 2 and 3 (ribbon, pane and "VV" all ignored; Revit responding, ~1 core busy; foreground = Revit; no modal window; an Enscape renderer window was present and masked — the founder declined showing it). B31-3/4/5/6/7/8 and B32-1/3/5/6 remain owed; also the flipped BCF camera on a model with a moved survey point |

### B31/B32 continued — session 4 (2026-09-30 ~02:26–02:39, build 4cd3d7a)

Cause of the "Revit ignores input" in sessions 2–3 found: a runaway `find / -name 2026-09-30-reality-to-model.md` started by a research agent at 01:53 had used ~36 min of CPU; once stopped, clicks registered at once. The Windows 11 Snap Layouts flyout also appears over the ribbon's right end and must be dismissed.

| Row | Observed |
|---|---|
| B31-3 BCF Issues | window opened on aster, family editor then in front: double-click an issue → status "**Sentinel did not open the issue: switch back to AST_ASTR26_Aster Tower_yazan.hKNTHU — nothing was changed.**"; Isolate ALL → "**Sentinel did not isolate the issue elements: switch back to …**" (per-operation words) — **pass** |
| B31-3 Change Requests | window opened on aster, family editor in front: Show → dialog "**Sentinel did not show the change: switch back to …**"; Approve → dialog "**Sentinel did not approve the request: switch back to …**", the request stays listed — **pass** |
| B31-7 reopen in one session | File ▸ Close (family, then aster), Home ▸ Open the aster local again, rename "L2 - Architectural" → "L2 - Architectural Y" (VN-01 REQUEST): Change Requests lists "**L2 - Architectural → L2 - Architectural Y**" — the live watcher re-registered and the request carries the real old name — **pass** |
| B31-4 one Undo | not provable on aster's data: its BCF issues point at another file's GlobalIds ("No matching element in this model"), so the viewpoint changed nothing and left no entry; view renames flush Undo (above) |
| Open | Reject on that request did not register in four tries (no hub run in the journal); not concluded as a Sentinel fault — clicks on these WPF windows needed a title-bar focus click before and still failed here. Owed with B31-5/6/8 and B32-1/3/5/6 |

## Session B33 — drill MA0 (Promote walls v0) + owed B31/B32 rows (2026-09-30, ~08:36–09:12 local, build e96f819, Claude driving Revit 2024)

Setup: scratch copy of `BDS_Project Number_Project Name (Template)` detached to a new central in `Documents/sentinel-scratch/ma0/` (originals'
sha256 re-checked after the session: 78152a5f…, b7c98e13… — unchanged). Test bridge on 127.0.0.1:4101 (event poll off), add-in `serviceUrl`
switched for the session and restored after. Web project `ma0-bds` (created for the drill) with `guideline@1` (bds-dd-walls-guideline.json) and
`type_catalog@1`. Levels: GR_SSL −300, GR-FFL 0, 01_SSL 3000, 01-FFL 3300 (all Building Story). Hand-made seed type `MA0 Interior - 100mm`
(Generic − 100mm duplicated, Function Interior). Seed: `make-concept.py --l1 "GR-FFL:0" --l2 "01-FFL:3300" --roof "MA0 Roof:6300" --ext "Generic - 200mm"
--int "MA0 Interior - 100mm" --gap "Generic - 125mm"` → 40 walls + level MA0 Roof (ledger #1207), placed with Review AI Proposals: "Applied 41
element(s)", Undo "Sentinel AI changeset: MA0 concept seed [1f35fd32]", MA0 Roof Building Story ✓. The central was opened directly, so Save was
disabled; the seed was saved with Synchronize Now (own scratch central).

| Step | Result | Evidence |
|---|---|---|
| B31-3 Review AI Proposals pinned | family editor (BDS_Splash Screen.rfa) in front, Apply ticked → "**Sentinel did not place the proposals: switch back to BDS_Project Number_Project Name (Template)_yazan.hKNTHU_detached — nothing was changed. The proposals are still pending**"; reopened on the project, still pending — **pass** | dialog |
| MA0-1 Promote, No | GR_SSL 0 retype · 0 attach · 2 held · DD 0/2; **GR-FFL 37 retype · 32 attach · 45 held · DD 0/72**; 01-FFL 18 retype · 20 attach · 2 held · DD 0/20; nothing filed (changesets list still 1) | dialog text saved |
| MA0-2 Promote, Yes → GR-FFL review | 69 ghosts + 61 exception rows, all ghosts pre-ticked. **13 retypes + 12 attaches were on the template's own office walls** (BDS_EXT_STR_CONC_100…400 → BDS_EXT_ARC_CMU_*, BDS_ÉXT_LSE_CONC → CMU, BDS_INT_ARC_GYPS_100 (Function Exterior) → EXT CMU_100, BDS_INT_STR_CONC_100 → GYPS_100, BDS_INT_ARC_CMU_100 → GYPS_100, metal walls). Reviewer unticked those **25 rows**; "Applied 44 element(s) … 25 unticked element(s) reported as rejected" (#1215, partially_applied). Yes → applied ≈ 2 min | **finding F1** |
| MA0-3 Promote again | reopened the pending 01-FFL changeset (38 rows, all seed, 2 gaps held); 0 edits; "Applied 38 element(s)" (#1216) | |
| MA0-4 Promote, No (DD after) | GR-FFL 23 retype · 12 attach · **DD 8/72 · stamped by Promote 26**; 01-FFL **10 retype** · 0 attach · **DD 8/20 · stamped 20**. The 10 remaining retypes per storey propose **BDS_EXT_ARC_CMU_100 mm for the interior walls just promoted to BDS_INT_ARC_GYPS_100 mm**: that type's Function is Exterior in the BDS template, so a second Promote would flip gypsum partitions to external CMU | **finding F2** |
| MA0-5 Undo / redo | Undo list: one entry per changeset ("… Promote walls (DD) · 01-FFL [6d0b51a0]", "… · GR-FFL [3d94a01e]"). Ctrl+Z → 01-FFL walls lost their CMU hatch; ledger **#1217 changeset_reverted op undo count 38**; Ctrl+Y → **#1218 op redo count 38** — **pass** | audit rows |
| MA0-6 IDS pass rate | not measured: `ma0-bds` carries no IDS (spec none); the DD-now counts above are the measured outcome | |
| MA0-7 + B32-5 BLOCK at sync | ruleset@3 (one BLOCK level rule; "MA0 Roof" the one violation): Synchronize Now → "**Sentinel — Sync stopped: 1 BLOCK violation(s) (LB-01) must be fixed before this model syncs. • LB-01: MA0 Roof**"; central file time unchanged (08:48:27). Renamed the level to RF-FFL (by hand — see F3), the pane's live row cleared, Synchronize Now ran (central 09:03:25) — **pass** | dialog |
| B32-3 ⚡ Fix under `{org}` | BDS ruleset@1 on ma0-bds, FN-01 `[ORG]_[BODY]`: "M_Floor Drain - Round" → proposed "BDS_M_Floor Drain - Round", "**✓ Matches the naming schema**", Execute → "✓ Auto-fixed … (FN-01)", row gone — **pass** | dialog |
| B32-1 Yes/No and 0 | ruleset@2: PB-01 on "Annotation Crop" (Yes/No), PN-01 on "Rotation on Sheet" (integer). Flagged only views that lack the parameter (schedules, sheets, drafting, unplaced elevations); WIP_PS_XX_A-A (Annotation Crop = No) and WIP_PE_NORTH (Rotation on Sheet = None/0) **not flagged** — **pass** | pane |
| B31-6 live row on a new project | File ▸ New ▸ Project → Project1, bound to ma0-bds (ruleset@4), renamed view "Site" → "Site X": pane "**⌛ Change request created for 'Site X' — awaiting coordinator (VN-01)**" without Scan Now — **pass** | pane |
| Reject (open item) | Change Requests "Site → Site X": the first two Reject clicks raised no hub event (journal); the third (after a Show click) rejected — "0 pending", the view back to "Site". Flaky input on this WPF window, not reproduced as a Sentinel fault | journal |
| B31-8 Save As then request | Project1 saved as `sentinel-scratch/ma0/Project1.rvt`, renamed "Section 1" → "Section 1 Y": Change Requests "**Section 1 → Section 1 Y**" (real old name) — **pass** | dialog |
| B31-3 Apply Standard pinned | Build Office System opened on Project1 (worksets unticked), scratch central made active, Build → "**Sentinel did not apply the standard: switch back to Project1 — nothing was changed**" (0 created, 1 failed) — **pass** | dialog |
| B31-4 one Undo (Apply Standard) | back on Project1, Build → "76 created, 33 skipped, 0 failed"; Undo top entry "**Sentinel: Apply standard**" (one entry) — **pass**. A change-request Show on a *view* request opens the view and changes nothing, so it leaves no Undo entry (correct) | undo list |
| B31-5, B32-6, BCF zoom/isolate | not run: the scratch has no RVT/IFC links and no issues captured from its GlobalIds | |

Closed Revit: Project1 not saved; the scratch central holds the drill state (seed kept as `ma0-seed-central-0848.rvt.bak`).

**Findings (fixed on a follow-up branch, not in e96f819):**
- **F1 (critical)** — Promote planned on walls already on the office's own types (structural concrete → CMU/gypsum pre-ticked). v0 must plan concept walls only.
- **F2 (critical)** — not idempotent: the DD target's own Function can differ from the source wall's (BDS template: `BDS_INT_ARC_GYPS_*` is Function Exterior), so promoted interior walls re-plan as exterior CMU.
- **F3 (minor)** — the docked pane's ⚡ column sits past the right edge when the Ref text is wide; the BLOCK row could not be fixed with ⚡ at the default width.

**Numbers for gate G1 (as measured, e96f819):** 40 seed walls; 36 convertible by rule, 4 planted gaps held with their reason (10 %). After one Promote pass with 25 manual unticks: 16/40 seed walls DD by the planner's own count (8 exterior per storey); the 20 interior walls were retyped correctly but counted not-DD because of F2. Edits: 25 unticks on storey 1 (all non-concept template walls), 0 on storey 2. Time: ≈2 min review + apply for storey 1, ≈20 s for storey 2. Ledger: 4 changeset rows, 46 walls stamped by Promote, undo/redo rows with counts.

### B33 re-check after the fix (2026-09-30 ~10:50, master 2928e99, run by the founder in Revit 2024 on the drill-state scratch central)

Promote walls (DD), read-only: "**Nothing to file: no wall needs a retype or an attach that Sentinel can propose.**"
GR_SSL 0 retype · 0 attach · 0 held · DD 0/0 · 2 on other office types, left as is. **GR-FFL 0 retype · 0 attach · 22 held · DD 18/40 · 32 on other
office types, left as is · stamped by Promote 26.** **01-FFL 0 retype · 0 attach · 2 held · DD 18/20 · stamped by Promote 20.** F1 (office walls
no longer planned) and F2 (promoted gypsum partitions no longer re-planned as CMU; 01-FFL 18/20 as predicted) pass live. GR-FFL's 22 held: 6 base
offsets, 8 non-basic walls, 6 template "Generic - 200mm" walls unconnected at 6096 mm (attaching would cut them to one storey), 2 planted 125 mm gaps.
**Seed result: 36/40 seed walls DD, 4/40 planted gaps held with their reason.** F3 (pane ⚡ column) not yet seen live.

## Session B35 — drill Promote v1 (whole elements) + the MA-1 placement seed (2026-09-30 21:48 → 2026-10-01 18:58 local, builds b63ef13 + df6cd16, Claude driving Revit 2024)

Setup: scratch copy `Documents/sentinel-scratch/ma1/ma1-src.rvt` (from the B33 drill-state central), detached with worksets discarded
→ `ma1-src_detached.rvt` (plain Save works on it). Originals' sha256 re-checked after the session: 78152a5f…, b7c98e13… — unchanged. Test
bridge on 127.0.0.1:4101, add-in `serviceUrl` switched for the session and restored after (Funnel URL). Web project `ma1-bds` with
`type_catalog@1`, `guideline@1` (walls only), later `lod_matrix@1` (#1261) and `guideline@2` = bds-dd-elements-guideline.json (#1262), both DRAFT.
Stock families: the Revit content library is not on this PC; the founder OK'd "Load Autodesk Family" (Door-Passage-Single/Double-Flush,
Window-Fixed, then Door-Interior-Single-Flush_Panel-Wood and Door-Interior-Double-Full Glass-Wood). Enscape was disabled by the founder in all
Revit versions after its renderer (started at document open) pegged Revit's UI thread and injected input was ignored.

**B35-0 seed by changeset create (MA-1 placement slice).** One script (`make-concept.py --b35 --type DEFAULT=NAME`), one changeset per class,
one Undo entry each: floors 5 "Applied 5" (#1240), ceilings 3 (#1242), windows 3 hosted by point in their wall, sill 900 (#1244). Roofs
declined twice with a bare "Value cannot be null." (#1241, #1254) → **F4**; after the fix "Applied 2" (#1257). Doors in `Door-Passage-*`
declined (#1243): those US families cannot regenerate in a 100 mm partition ("Can't make type", "Profile sketch is empty"); the same door
placed in a 200 mm wall (#1250, undone #1251). Re-seeded with the interior families: "Applied 6" (#1260). Seed saved 18:48.

| Step | Result | Evidence |
|---|---|---|
| B35-1 no LOD matrix | "LOD matrix: none … walls only (MA-0 rules)"; GR-FFL 24 retype · 20 attach · 22 held · 32 office-typed; 01-FFL 18 · 20 · 2 held; Walls 0/60; Template check note: `BDS_INT_ARC_GYPS_100 mm` is Function Exterior — **pass** (MA-0 behaviour kept) | b35-1.txt |
| B35-2 matrix, walls-only guideline | "lod_matrix@1 … (DRAFT)" + one line per class "BDS DD walls v0 (MA-0) has no Floors/Roofs/… rules"; walls unchanged — **pass** | b35-2.txt |
| B35-3 guideline@2, No | "File 3 changeset(s)", DRAFT banner. DD before: Walls 0/60 · Floors 5/9 · Roofs 1/3 · Ceilings 1/4 · Doors 2/7 · Windows 0/3. Held as §6.3 expects: F02 gap 250, L2-F02 structural (FL-3), R02 gap 225, C02 no rule for Basic Ceiling (CL-1), C03 gap GYPS_56, D03 exterior host (DR-4), D04 "no Doors type named at 915 x 2134 mm", W03 two families (WN-2). F03 and D05 left as is (office types). **W01/W02 held, not swapped**: "BDS_Window_Single Panel : 600x1200 mm / BDS_Window_1 Panel+FX : 800x1200 mm is in the catalogue but not loaded in this model" → **F5** | b35-3.txt |
| B35-4 GR-FFL review | floor + ceiling retypes pre-ticked; door swaps D01/D02 **not** pre-ticked (DR-1 unconfirmed, by design); reviewer ticked both; "Applied 48 element(s)" (#1269) ≈ 1.5 min after Yes; 2 ticks, 0 unticks | dialog |
| B35-5 01-FFL + roof | "Applied 39 element(s) … 1 unticked element(s) reported as rejected" (D06 unticked as planned, #1270 partially_applied); MA0 Roof "Applied 1" (R01, #1271) | dialog |
| B35-6 settled host (DR-2) | Promote again: "File 1 changeset(s)", exactly one ghost: D06 → `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm`, reason "(host BDS_INT_ARC_GYPS_100 mm: its DD rule says Interior); sized by its type name (DR-1)…" although that host type is Function Exterior; "Applied 1" (#1274) — **pass** | b35-6.txt |
| B35-7 idempotence | "**Nothing to file: no element needs a change Sentinel can propose.**" DD now — Walls 36/60 · Floors 7/9 · Roofs 2/3 · Ceilings 2/4 · Doors 5/7 · Windows 0/3. Stamped by Promote: GR-FFL walls 26, floors 1, ceilings 1, doors 2; 01-FFL walls 20, floors 1, doors 1; MA0 Roof roofs 1 — **pass** | b35-7.txt |
| B35-8 undo / redo | Ctrl+Z ×2, Ctrl+Y ×2, nothing in between: #1275 undo D06 changeset (count 1), #1276 undo roof changeset (count 1), #1277 redo roof, #1278 redo D06 — one row each, in stack order — **pass** | audit rows |
| B35-9 stale plan | not run (optional; the executor's `Unsafe()` re-check is covered by promote-check) | |
| B35-10 live API facts | `FUNCTION_PARAM` on a FloorType came through ("Function Interior, Family Floor, 300 mm" on Generic 300mm). The concept door types' Width × Height were read as type parameters (W1000 x H2100, W2000 x H2100; the code reads `FAMILY_WIDTH_PARAM` then `DOOR_WIDTH` — which of the two answered was not isolated). The door swaps to `BDS_INT_1 PNL` / `BDS_INT_2 PNL` types applied inside the changeset transaction (whether the symbols were inactive before was not recorded). Floors, roofs and ceilings retyped with no face moved | changeset JSON |
| B35-11 close | Revit closed without saving (the seed-complete save stays the restart point); originals unchanged | sha256 |

**Findings:**
- **F4 (fixed, df6cd16 + 9212c4f)** — `NewFootPrintRoof` reads its `out ModelCurveArray` before filling it: passed null, every roof create threw a
  bare "Value cannot be null.". The array is created first now; and a declined changeset names the element and the exception type.
- **F5 (data, owed by the founder)** — `type_catalog@1` (harvested 2026-07-23) lists BDS window types this template copy does not have loaded,
  so both window swaps were held (correctly — Sentinel loads no families). Window swaps are not proven live until the types are loaded or the
  catalogue is re-harvested.

**Numbers for gate G2 (as measured, df6cd16 on b63ef13):** 17 concept elements besides walls (4 floors, 2 roofs, 3 ceilings, 5 doors,
3 windows) + 2 office-typed controls left as is. **7 promoted** (2 floors, 1 roof, 1 ceiling, 3 doors), **10 held with their reason** (8 as
planned + W01/W02 by F5); 0 wrong proposals. Walls as B33: 36/40 seed walls DD. Edits: 2 ticks (door swaps, by design) + 1 planned untick.
Time: ≈1.5 min review + apply for GR-FFL. Ledger: 4 Promote changesets, 53 elements stamped by Promote, undo/redo rows
with counts. Policy decisions GN/FL/RF/CL/DR/WN/LM are still DRAFT until the founder confirms them.

## Session MA1a-S1 — Ghost Builder honest build live (2026-10-02 ~00:15–00:28 local, branch feature/ma1a-ghost-honest-build d4259b3, Claude driving Revit 2024)

Setup: `Documents/Sentinel drills/ma1a-s1-scratch.rvt` = a copy of the B35 detached BDS model (deviation from "new project from the
template": that model is already detached and its seed stands for the user's elements). Project Setup on the copy only: web project
`demo` (layers@1, guideline@1, type_catalog@1 from bds-office), Ghost source folder = `demo/ghost-sample`; no Ghost family library;
Ollama qwen2.5:7b-instruct. The `demo` mapping cache was moved aside first and restored after. Counts by mcp-server-for-revit
`analyze_model_statistics` (read-only; its plugin server switched on in Revit). Build level GR_SSL (the window's default).

| Row | Result | Evidence |
|---|---|---|
| S1-1 types listed before Build | Review: "Nothing has been built yet"; A-ANNO/DEFPOINTS absent; forecast "– Doors family "BDS_Door" (layer A-DOOR) — not loaded, and no Ghost family library is set — the row will be skipped", "+ Floors type "BDS_Floor" … cloned from the type catalogue, or reported as a gap", the two wall types, "+ Walls typed by the guideline …". After picks: "Types: this build adds no type or family to the model" — **pass** | screenshots |
| S1-2 missing family type → gap | Build as proposed: "Placed: 0", "Skipped (type or family not in the model): 5", "Doors on 'A-DOOR': Doors family "BDS_Door" is not loaded in this model — load it or set the Ghost family library; skipped. (×2)"; BDS_Wall_Ext/Int and BDS_Floor "gap … no sibling type in this document". Walls 89, floors 36, doors 38 unchanged; no door of any family placed — **pass** | counts |
| S1-3 Placed counts survivors | S1-2: 0 = 0. S1-4: Placed 8 = walls +5, floors +1, doors +2. S1-5: Placed 8 = +5/+1/+2 again (a closed loop of 4 counts 4) — **pass** | counts |
| S1-4 type drop-down | Picked BDS_EXT_1 PNL : …WOOD_1000 x 2100 mm, BDS_EXT_ARC_SCREED_90 mm, BDS_EXT_ARC_CMU_200/100 mm: "Placed: 8", "Walls: 5 typed by the reviewer". Spec values were **not written onto the existing types** (A7): "'Fire Rating' = 'FR60' … not applied to type "BDS_EXT_ARC_CMU_200 mm" — it would change 1 existing instance(s)" — **pass** | summary |
| S1-5 planted duplicate | Same picks again on top of S1-4's build: "Placed: 8", "Revit warnings raised by this build: 10 — left in the model … never erased" (walls overlap ×9, floors overlap ×1); walls 94→99, floors 37→38, doors 40→42, so every S1-4 element survived. Review Warnings: 15 = 1 (stair, before) + 4 (S1-4) + 10 (S1-5) — **pass** | Review Warnings |
| S1-6 a build error naming a user element | Not seen live: both builds raised warnings only. The rule is proven offline (GhostFailurePolicy checks) | — |
| S1-7 remembered as reviewer | EXTERIOR-ENVELOPE (local-model row) set to BDS_EXT_ARC_CMU_300 mm and built alone: "Placed: 1", "Walls: 1 typed by the reviewer"; cache row `"source":"reviewer","rationale":"your earlier review","params":null` (A1); next run "as proposed: BDS_EXT_ARC_CMU_300 mm · your earlier review", unticked. (ignore) + Cancel → saved `"ignore":true`; next run "(ignore)", unticked and locked; "as proposed" offered on it (A2) → Cancel → the key is dropped (forget). Standard rows (A-DOOR …) come back "as proposed" each run (F3 A: the standard outranks a remembered pick) — **pass** | cache JSON |
| S1-8 what Revit shows | Revit's own non-blocking warning box at the bottom right ("Warning: 1 out of 4"), no modal dialog — **pass** | screenshot |
| S1-9 Massing placeholder | Not run: no building photos on this PC (the Snowdon Tower folder has 6 RPC shrub/tree images only) | — |

Not exercised live: the Doctor exemption by transaction name (no auto-resolvable warning arose in a Ghost build); a Pending commit status.
Closed Revit without saving; BDS template sha256 78152a5f… unchanged.

## Session MA1a-S2 — Ghost Builder on the changeset executor, live (2026-10-02 ~11:06–11:24 local, branch feature/ma1a-step2-ghost-executor f7cbca3, Claude driving Revit 2024)

Setup: `Documents/Sentinel drills/ma1a-s2-scratch.rvt` (copy of the B35 detached model) bound to `demo`; Ghost source folder =
`demo/ghost-sample` (with `sample-plan-step2.dxf` and `sample-plan-planted.dxf` from `make-sample.py`); test bridge 127.0.0.1:4101
restarted on the branch (the founder's 4100 bridge was not touched), add-in `serviceUrl` switched for the session and restored;
signed out (actor "unsigned — yazan"). The `demo` mapping cache was moved aside and restored. No writes through the community MCP.

| Row | Result | Evidence |
|---|---|---|
| S2-1 one changeset, source dwg, one Undo | Picks as S1-4 (CMU 200/100, SCREED_90, BDS_EXT_1 PNL WOOD 1000×2100): "Placed: 8", "Provenance: 8 of 8 placed element(s) stamped as source dwg", "Ledger: 1 of 1 changeset(s) recorded on demo (source dwg: 1d55f7c7)"; audit #1280 `changeset_proposed` (source dwg, 8) + #1281 `changeset_applied` (applied). Undo list: "Sentinel AI changeset: Ghost Builder · sample-plan · GR_SSL [1d55f7c7]" — one entry, the DWG import its own entry below. Both doors placed (hosted in this build's walls) — **pass** | summary, audit, Undo list |
| S2-2 Ctrl+Z / Ctrl+Y | #1282 `changeset_reverted` undo count 8 (8 guids), #1283 redo count 8; one Doctor line each ("Undo watcher: undo/redo of changeset 1d55f7c7") — **pass** (UNSURE 2: one row either way) | audit |
| S2-3 every element stamped | S2-1 8/8, S2-5 10/10, S2-8 6/6, S2-7 6/6 — **pass** | summaries |
| S2-4 planted failing element | `sample-plan-planted.dxf`, all rows typed: "Nothing was built — Revit rolled the build back … floor "A-FLOR #1": ArgumentException: The input curve loops cannot compose a valid boundary …"; #1285 proposed (11) / #1286 applied **declined** with the reason; no Ghost Undo entry; Review Warnings 5 = before — **pass** (UNSURE 1: Floor.Create throws on the bow-tie) | summary, audit, Review Warnings |
| S2-5 arc wall, ceiling, furniture, Doctor | On GR_SSL the build was **declined whole**: "Can't keep elements joined … Revit named element 2051441 (not one of this changeset's), wall "A-WALL-EXT #1"" (a new wall against a wall already on the level — risk B6 seen live; nothing changed). Re-run on `MA0 Roof` (no walls): "Placed: 10" (6 walls incl. the arc, floor, ceiling, 2 desks), "Revit warnings raised by this build: 1 — … identical instances in the same place" (UNSURE 4: yes), ceiling "placed 0 mm above MA0 Roof … set the ceiling height" (F7), ledger 1f8e5b41 — **pass** on the clear level; see follow-ups F-S2-2/3 | summaries, audit #1288–#1292 |
| S2-6 unloaded type → gap | A-DOOR left on BDS_Door: "Doors on 'A-DOOR': Doors family "BDS_Door" is not loaded … skipped. (×2)", "Skipped (type or family not in the model): 2"; the rest placed — **pass** | summary |
| S2-7 unbound model | Project Setup web project cleared on the drill copy: rows become heuristic guesses (unticked); 3 rows typed and ticked: "Placed: 6", "Provenance: 6 of 6 … dwg", "Ledger: none — this model is not bound to a web project … ran through the changeset executor as a local changeset (source dwg, stamped), as one Undo step"; audit unchanged — **pass** | summary, audit |
| S2-8 re-run on top | `sample-plan.dxf` again on GR_SSL: "Placed: 6", "Skipped (no single straight wall of this build under the door or window): 2" with "2 walls on GR_SSL pass within 1 mm of (6450, 0): wall 2069788, A-WALL-EXT #1 (this build) — a person decides the host — not filed"; 10 overlap warnings kept; ledger de9a66ff — **pass** | summary |
| S2-9 Photo Massing | Not run: no building photos on this PC | — |

Review Warnings at the end on the bound copy: 15 = 1 (stair) + 4 (S2-1) + 10 (S2-8); S2-5's "identical instances" warning was kept by
the build (Revit showed it) but **the global Doctor suppressed it at the next ordinary transaction** (pane log "11:20:02 Suppressed:
There are identical instances in the same place.") — the Doctor's pre-existing AutoResolvable rule, not the Ghost build.
Closed Revit without saving; BDS template sha256 78152a5f… unchanged.

**Follow-ups (not blocking the merge):**
- **F-S2-1 (UX)** — after a Ghost build with warnings, Revit now shows its **blocking** warning dialog (OK / Cancel) where step 1
  showed the non-blocking box (UNSURE 9: `SetForcedModalHandling(false)` is not honoured on this path). OK keeps the build; Cancel
  would roll that changeset back (safe, all or nothing).
- **F-S2-2 (founder decision)** — all or nothing means one new wall that cannot keep a join with a wall already in the model
  declines the whole build (seen live). Options: keep it (safe, the culprit is named); or stop new walls from auto-joining walls
  that were already there (changes only Sentinel's walls); or drop only the failing new wall, as step 1 did.
- **F-S2-3 (founder decision, BG-3)** — the global Doctor erases "identical instances" and duplicate-Mark warnings in every
  transaction, which contradicts "warnings are counted, never erased" (P1-3).

### MA1a-S2 follow-ups re-checked live (2026-10-02 ~12:24–12:43 local, branch fix/ma1a-step2-followups 28f971b, Revit 2024)

Fresh copy `Documents/Sentinel drills/ma1a-s2b-scratch.rvt` bound to `demo`, test bridge 4101, settings restored after.
- **F-S2-2 fixed:** `sample-plan-step2.dxf` on GR_SSL — declined this morning with "Can't keep elements joined … element 2051441" —
  now builds: "Placed: 10" (6 walls incl. the arc, floor, ceiling, 2 desks), ledger 15ed12be. New walls never join a wall that
  was already in the model (WallUtils.DisallowWallJoinAtEnd on Sentinel's own wall only).
- **F-S2-1 fixed:** no blocking OK/Cancel dialog; Revit's non-blocking box ("Warning: 1 out of 5 — There are identical instances…").
  Root cause: a TransactionGroup forces modal failure handling on its inner transactions (`IsFailureHandlingForcedModal`); the
  build now turns it off.
- **F-S2-3 fixed:** after the build and a later ordinary transaction (Project Setup save), Manage ▸ Review Warnings still lists
  "There are identical instances in the same place" — and now also "Elements have duplicate 'Type Mark' values", which the old
  Doctor had erased. Project Setup has the new opt-in box for Revit's own off-axis fix (default off).
- Not a code fault: in the first two Revit starts with this build, Revit ignored injected clicks for ~10 min while its UI thread
  sat at 100%; master behaved the same way at times (the spin is Revit/environment), and clicks worked on a later start of the same
  build. Recorded so a future drill does not chase it.

## Session MA1a-I35 — walls level to level, the full stamp, the BLOCK check before commit, live (2026-10-02 ~15:40–16:38 local, branch feature/ma1a-items3-5 11de0ac → a9bb0d5, Claude driving Revit 2024)

Setup: two fresh copies of the B35 detached model in `Documents/Sentinel drills/`. `ma1a-i34-scratch.rvt` bound to `demo` (rows I3,
I4). `ma1a-i5-scratch.rvt` bound to the scratch web project `ma1a-block`, which holds only `demo/ghost-sample/ma1a-block-ruleset.json`
(ruleset@1: MA1-FN-01, BLOCK, Furniture needs a Mark; MA1-LV-01, BLOCK, level-name whitelist). Worksharing was enabled on the I5
copy and its first save made it the central **in place** (the plan said Save As `ma1a-i5-central.rvt`; file dialogs refuse typed
names from the tool, so the copy itself became the central). Test bridge 127.0.0.1:4101 on the branch; the founder's 4100 bridge
was not touched. Add-in `serviceUrl` and the `demo` mapping cache were switched for the session and restored after. Signed out
(actor "unsigned — yazan"). The Ghost source folder is a project setting of the scratch copies; the PC's own setting was not
changed. The community MCP was used read-only (element ids of grids).

| Row | Result | Evidence |
|---|---|---|
| I3-1 a wall on a storey rises to the next storey | Ghost Builder ▸ `sample-plan.dxf`: the review's level defaulted to GR-FFL, the import's level (C8). "Placed: 6", "Walls on GR-FFL rise to 01_SSL, the next Building Story above; their tops are attached to it (GHB-2)". Wall 2069788: Base GR-FFL, offset 0, Top "Up to level: 01_SSL". Changeset 5b921ec6, audit #1301 — **pass** (UNSURE 3: `WALL_HEIGHT_TYPE` can be set in the creating transaction) | summary, Properties |
| I3-2 slab level | Same drawing on GR_SSL: walls rise to GR-FFL (300 mm), the rule working on a template that marks slab levels as Building Story (risk F1). Changeset 82ca56b1 — **pass** | Properties |
| I3-3 top storey | On MA0 Roof: "no Building Story above — unconnected, 3000 mm high, the storey below's height (founder decision F2)". Changeset ff556302 — **pass** | summary |
| I3-4 a drawing imported on an upper level | `sample-plan-up.dxf` imported in a new 01-FFL plan: default level 01-FFL; wall 2070043 Base 01-FFL, Base Offset 0, Top "Up to level: MA0 Roof"; filed base 3300. Changeset 8d041755, audit #1313 — **pass** (UNSURE 2: the import's origin Z is the level's elevation) | Properties, changeset |
| I3-5 an agent's walls | Changeset 75756bd4 (audit #1316) through Review AI Proposals: the wall with no `TopElevation` got Top "Up to level: 01_SSL"; the wall with `TopElevation` stayed Unconnected 2500 — **pass** | Properties |
| I4-1 read a Ghost wall's stamp | Model from Drawings ▸ 5 · Provenance on wall 2069788: Source dwg; sha256 37eb3839…a8f1c4 = the sha256 of `sample-plan.dxf` (all 64 digits compared through the filed changeset's `source_sha256`); Layer A-WALL-EXT; Rule "type picked by the reviewer in Ghost's review"; Approver "unsigned — yazan (not signed in …)"; Ledger row #1301; Placed at 2026-10-02T13:43:31Z; Changeset 5b921ec6-… — **pass** | dialog |
| I4-2 a copy-pasted wall | The pasted copy (2069865) reads "Copied, not placed by Sentinel — this stamp came with a copy of element 368f118b-…-001f951c; the lines below are that element's record, not this one's" — **pass** (UNSURE 1: Revit's copy carries the Extensible Storage entity) | dialog |
| I4-3 Datum stamps what it creates | `sample-grids.dxf` created nothing (all five grids already exist — "kept"), so a second drawing with more grid lines was made (`ghost-up/sample-grids-more.dxf`): "Created 0 level(s) and 2 grid(s), each stamped with where it came from". Grid 7 (2070231): Source dwg; sha256 1e891f22…c6fc5986 = the file's; Layer A-GRID; Rule "Datum from Drawings: a grid line on a layer named GRID (a plan), read origin to origin"; "Ledger row: none — not on a project ledger …"; "Changeset: none" — **pass** | dialog |
| I4-4 Photo Massing stamps | Not run: no building photos on this PC | — |
| an agent's stamp, an unstamped element (extra) | Agent wall 2070101: Source agent; "sha256: none recorded …"; "Layer: none"; "Rule: not recorded" (the body gave no reason); Ledger row #1316. A title block: "No Sentinel provenance stamp — Sentinel did not place or change this element." A wall built from a drawing that was **already imported** reads "sha256: none recorded — … a drawing already imported in the model" (E7) | dialogs |
| I5 baseline | Bound to `ma1a-block`: "Rule pass rate 100.0% — 5 elements", no BLOCK row, no furniture instance; `M_Desk : 1525 x 762mm` is loaded | pane |
| I5-1 the warning, Go back | Ghost Builder ▸ `sample-plan-step2.dxf` on GR-FFL, A-FURN (M_Desk 1525 x 762mm), A-WALL-EXT and A-WALL-INT typed by hand. **Sentinel — BLOCK check**: "This batch will block your sync: 2 element(s) (MA1-FN-01)", "• MA1-FN-01: 1525 x 762mm [2069798]" ×2, "Judged by ruleset@1 — the rules a sync runs. A BLOCK rule stops the sync, not the edit." **Go back**: the review stays open, Build enabled, status "You went back at the BLOCK check — nothing was placed. 2 element(s) would have blocked your sync (MA1-FN-01). Ledger: the 1 changeset(s) already filed were withdrawn."; no Ghost entry in the Undo list; audit #1321 `changeset_proposed` + #1322 `changeset_withdrawn` (37bfbf19). Second Build: the review **can be closed** under the dialog; Go back then shows the same two lines in a "Sentinel — Ghost Builder" dialog; audit #1324 + #1325 (0744b153) — **pass** (UNSURE 4: a TaskDialog runs between transactions inside an open group; Go back leaves no element and no Undo entry) | dialogs, Undo list, audit |
| I5-2 Place anyway | Ghost again (the picks came back as "your earlier review"), Build, **Place anyway**: "Placed: 8" (6 walls incl. the arc, 2 desks); first Warnings line "This batch will block your sync: 2 element(s) (MA1-FN-01) — placed anyway, as the person chose; a sync stops until they are fixed."; audit #1328 `changeset_applied` note carries the line (72cace73). Scan Now: 2 MA1-FN-01 BLOCK rows — **pass** | summary, audit, pane |
| I5-3 Review AI Proposals | Level proposal 371f1b10 (audit #1329/#1330). Apply: "1 element(s) (MA1-LV-01)", "• MA1-LV-01: MA1 Test"; **Go back**: "You went back at the BLOCK check — nothing was placed. … The proposals are still pending — run Review AI Proposals again on that model." Apply again, **Place anyway**: "Applied 1 element(s) …" + the BLOCK line; audit #1331 note starts "This batch will block your sync"; no blocking Revit dialog (F-S2-1 holds). Undo list: one entry "Sentinel AI changeset: MA1a item 5 — one level [371f1b10]". Undo → #1332 `changeset_reverted` op undo; Redo → #1333 op redo — **pass** (UNSURE 5: one row each; UNSURE 6: the level is a Building Story) | dialogs, Undo list, audit |
| I5-4 the sync is stopped as predicted | Synchronize Now: "Sentinel — Sync stopped: 3 BLOCK violation(s) (MA1-FN-01, MA1-LV-01) must be fixed before this model syncs. • MA1-FN-01: 1525 x 762mm [2069824] • MA1-FN-01: 1525 x 762mm [2069825] • MA1-LV-01: MA1 Test" — the elements I5-2 and I5-3 named. After Mark = D-01 on both desks and deleting `MA1 Test`, the sync ran (central 16:20:17; pane 100.0%, 7 elements). The central's time was 16:09:06 before the stopped sync; it was not read again between the stop and the fix — **pass**, with that one reading missing | dialog, file time |

**Found in the drill and fixed on the branch (80c15d3, a9bb0d5), each re-checked live on the rebuilt add-in:**
- **F-I35-1 the pane kept rows of elements that no longer exist.** After Go back in I5-3 the pane still listed "MA1-LV-01 BLOCK MA1 Test"
  for a level that was never placed (two rows after the second Apply), until the next full scan. Cause: the live pane is fed by the
  updater, which sees additions and edits inside a transaction only — never a delete, an Undo, a Redo or a rollback (older than
  item 5; Go back made it visible). Fix: a DocumentChanged handler drops the rows of deleted ids and re-judges what an Undo or Redo
  brings back (seen live: Undo removed the row, Redo brought it back); a rolled-back TransactionGroup names no element there (seen
  live on 80c15d3: the row stayed), so Sentinel's own group rollbacks now go through `SentinelUndo.RollBack`, which drops the rows
  of elements that are gone. Re-check on a9bb0d5: the row shows while the BLOCK dialog is open and is gone after Go back.
- **F-I35-2 the Provenance dialog clipped the hash.** In I4-3 the 64 digits ended in "…" (one unbreakable word wider than the dialog),
  so nobody could compare them. Fix: a sha256 is shown in groups of 8. Re-check: grid 7 reads
  "1e891f22 2acf90bc 5087ab96 d66bdb2d db8442ef 0bb5d278 967828ec c6fc5986", the file's hash. (I4-1's hash was compared in full through
  the filed changeset's `source_sha256` on the bridge, which equals the file's; that dialog had the same width.)
- **F-I35-3 Project Setup changed a typed project key.** Typing `ma1a-block` in the Web project box became "MA1a-block": the box
  completed the text against the projects' display names. Fix: its text search is off and the key is read from the box's text only
  (a listed label → that project's key; anything else → as typed). Re-check: `ma1a-block` stays as typed and the model stays bound.

Notes:
- `promote-check` 231/231 after the fixes. Add-in rebuilt and deployed for Revit 2021–2027 from a9bb0d5.
- Left on the test ledger: on `demo`, the I3/I4 changesets (rows #1301–#1316) and a change request for the new "01-FFL" plan view
  (VN-01, a live row); on `ma1a-block`, rows #1320–#1334 plus the re-check proposals 0505c92a (applied on a model that was not
  saved) and 66581f4f (still proposed). `ma1a-block` stays as a scratch project.
- Revit warnings seen and kept: "Highlighted walls overlap" ×4 and "identical instances in the same place" ×1 (the sample's two
  desks sit on one point) — Revit's non-blocking box. Filling one Mark on both desks raised Revit's own "Elements have duplicate
  'Mark' values" dialog, which the Doctor no longer erases.
- Revit driving: Escape did not end the Provenance pick mode (the key was not taken); picking any element ends it. Select by ID
  needs about 3 s after the Manage tab is clicked.
- Closed Revit without saving the I34 copy; the I5 central holds the synced state (8 placed elements, grids as before).

## Session MA1a-I68 — the placement block, the command reports, the receipts and the trust rules, live (2026-10-02 ~20:25–22:30 local, branch feature/ma1a-items6-8 7861807, Claude driving Revit 2024)

Setup: four fresh copies of the B35 detached model in `Documents/Sentinel drills/` (`ma1a-i68-central`, `-plain`, `-unbound`, `-new`;
only `-central` and `-plain` were opened). The central copy was workshared in place, with worksets `MA1_Walls` and `MA1_Datum`
(no `MA1_Missing`). Scratch web projects on the test bridge 127.0.0.1:4101: `ma1a-i68` (the drill's `guideline@1` with a placement
block, `type_catalog@1` = no type the model holds, later `@2`), `ma1a-i68-bare` (nothing installed), and B33's `ma0-bds`. The
founder's 4100 bridge was not touched. Add-in build 7861807 deployed to Revit 2024 only (DLL sha256 020ab5d3…f58f6b). **The
session ran signed in** (the founder's account was signed in from an earlier session and was added as contributor to the three
scratch projects), so the signed-out cases are owed. A Windows "antivirus expired" pop-up blocked Revit from 20:25 to about 21:30;
the three bridge-only rows ran in that time.

| Row | Result | Evidence |
|---|---|---|
| I6-1 the office-template check refuses | Ghost Builder ▸ `sample-plan-step2.dxf`: "Nothing was built — this model was not made from the office template: it holds none of the 2 office type(s) that type_catalog@1 · project · 78bb6e85d2ff… lists in the guideline's categories. Start the project from the office template, then run this again — Sentinel never loads an unknown family." No review opened, no changeset filed. Promote: the same sentence — **pass** | dialogs, audit id unchanged |
| I6-2 workset and phase, the template count | With `type_catalog@2`: "Office template: 1 of 3 office type(s) present", "Placed: 8", "Worksets: 6 on MA1_Walls · 2 left on the active workset (the guideline names no workset for Furniture).", "Phase: 8 element(s) set to "New Construction", the active view's phase …" — lines of their own, above Warnings. Wall 2069792: Workset MA1_Walls, Phase Created New Construction. Desk 2069799: Workset1. Active workset still Workset1. Revit warnings 5 (walls overlap ×4, identical instances ×1), as in MA1a-I35 — **pass** (UNSURE 7: no new warning; UNSURE 9, 14 held) | summary, Properties |
| I6-3 the view's phase, one Undo | From a copy of the plan set to phase Existing: "Worksets: 1 on MA1_Walls.", "Phase: 1 element(s) set to "Existing" …". Wall 2069856: MA1_Walls, Phase Created Existing. Undo removed it (#1369 `changeset_reverted` undo), Redo brought it back (#1370 redo) — **pass** (UNSURE 6) | dialog, Properties, audit |
| I6-4 a workset the model lacks | "Nothing was placed — the guideline's placement block names a workset this model does not have: "MA1_Missing". Create it (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another." + "The proposals are still pending — run Review AI Proposals again." Changeset 42eaa956 stayed `proposed`; the workset list has no MA1_Missing — **pass** | dialog, changeset, workset list |
| I6-5 a design option is being edited (F3) | In "Option 1 <primary>": Review AI Proposals, Ghost Builder, Datum from Drawings and Photo Massing each answered "Nothing was placed — design option "Option 1  <primary>" is being edited, and Sentinel never places into a design option. Switch to Main Model (Manage ▸ Design Options), then … again." Ghost, Datum and Massing refused before any picker opened; nothing was filed. Back in Main Model the wall applied on MA1_Walls — **pass** (UNSURE 4: the active option is reported inside an ExternalEvent). The CAD-import count could not be read from Manage Links (it lists links, not imports); "no picker opened" is the evidence | four dialogs, audit ids |
| I6-6 a model that is not workshared (F4) | `ma1a-i68-plain.rvt`: "Worksets: not set — this model is not workshared, so it has no worksets (the guideline names 7).", "Phase: 1 element(s) set to "New Construction" …" — **pass** | dialog |
| I6-7 no placement block | Bound to `ma1a-i68-bare` (guideline 404 `not_installed`): "Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before." The wall's Phase Created: New Construction (UNSURE 1: with nothing set, Revit gives the active view's phase here) — **pass** | dialog, Properties |
| I6-8 Datum's grids | The 14 grids of the copy are pinned: unpinned, then deleted. "Created 0 level(s) and 5 grid(s) …", "Worksets: 5 on MA1_Datum.", "Phase: 0 element(s) set …". Grid 2070008: Workset MA1_Datum. Second run from a schedule: all kept, "Worksets: no element was created.", "Phase: 0 element(s) set to "New Construction"" — a schedule answers a phase (UNSURE 3); no second `datum` row — **pass** | dialogs, Properties |
| I6-9 a door, a column and a ceiling | "Applied 4 element(s) …", "Worksets: 4 on MA1_Walls.", "Phase: 4 element(s) set to "New Construction"": the four elements show MA1_Walls and New Construction (UNSURE 2 held for wall, door, column, ceiling). Second post, a door from the Existing view into that wall: placed, Workset MA1_Walls, but **Phase Created New Construction** — Revit kept the door in its wall's phase, with no error and no warning, while the dialog said "Phase: 1 element(s) set to "Existing"" → **F-I68-1**. The founder's decision (2026-10-02): leave it as Revit does it — **pass after the fix** | Properties, dialog |
| I7-1 one row per action, with the signed-in actor | One `ghost_build` row (#1361: "Ghost Builder placed 8 element(s) from sample-plan-step2 on GR-FFL", placed 8, revit_warnings 5, its changeset id) and one `datum` row (#1377: "Datum from Drawings created 0 level(s) and 5 grid(s)"), each with the signed-in e-mail as actor. The pane logged "Ghost Builder — Recorded: ledger #1361 · receipt …" and "Datum from Drawings — Recorded: ledger #1377 …". The refused runs left no report row — **pass** (UNSURE 11) | audit, pane |
| I7-2 Annotate | "Created: 5 view(s) across 5 level(s)." → #1391 `annotate`. Again: "Created: 0 … Skipped (already exist): 5", no second row — **pass** | dialog, audit |
| I7-3 Apply Standard | Build Office System ▸ Build: #1392 "Apply Standard: 14 created, 99 skipped, 0 failed" (shared-parameter bindings; the four worksets skipped as existing; no "Ruleset:" line among `created`). The window also said "Ruleset NOT installed on ma1a-i68: HTTP 403: this action requires the lead role (you are contributor)" — the role rule working. Second Build: nothing created, no second row — **pass** | window, audit |
| I7-4 ⚡ Fix | On `ma0-bds`: FN-01 on family "Grab Bar"; the proposed "BDS_Grab Bar" did not match (the pattern wants a second `_` part), edited to "BDS_Grab_Bar" → "✓ Auto-fixed"; #1399 `auto_fix` "Auto-fix FN-01: 1 Family renamed" with old_name, new_name, element id; pane "Auto-fix FN-01 — Recorded: ledger #1399" — **pass** | pane, audit |
| I7-5 fix-in-place | **Owed** (no scratch project holds an open IDS issue Sentinel can write) | — |
| I7-6 the Doctor | **Owed.** A wall rotated by a typed 0.034° and another by 0.005° raised no "slightly off axis" warning in Revit 2024 (Review Warnings unchanged, no "Seen:" line), so there was nothing for the Doctor to see or resolve (UNSURE 13: no). The row needs a wall drawn off axis by hand | Review Warnings |
| I7-7 not bound, not reachable, the budget | (a) An unbound copy: "Created 0 level(s) and 5 grid(s)", the no-block line, pane "Datum from Drawings — Not recorded on the web: This model is not bound …" and the same for the receipt. (b) `serviceUrl` on a dead port: the dialog opened at once, the cached guideline placed the grid ("Worksets: 1 on MA1_Datum."), pane "Datum from Drawings — Not recorded — the bridge did not answer" twice. (c) 6 report rows by the signed-in person in the session, at most 2 in one minute — **pass** (UNSURE 12, 16) | dialogs, pane, audit |
| I7-7d a project the bridge does not have (C30) | Bound to `ma1a-i68-new`: Datum answered with the no-block line, never "the guideline could not be read". The grids had not been deleted in that run, so nothing was created: the wording is seen, the create path is **owed** | dialog |
| I7-8 ROI | `ma1a-i68`: "Fixes on the ledger, not priced: 0 auto-fix(es) · 0 fix-in-place value(s) written · 0 Doctor resolution(s)"; `ma0-bds`: "1 auto-fix(es) · 0 … · 0 …"; the last line "Not counted: CDE intercepts, MEP voids, BCF export, clash views — they write no ledger row" — **pass** | windows |
| I7-9 Photo Massing | **Owed** (no photos on this PC). Its design-option refusal passed (I6-5) | — |
| I8-1 an agent post with `pretick: true` and `within_tolerance` | 201: `pretick` false, `accuracy` `{status: not_measured}`, `claimed` true, `ignored` lists `elements[0].pretick`, `.accuracy`, `.measured` ("no survey job the bridge ran backs it") and `.place.pretick`; the stored `place` has no `pretick`. In the review: "Proposed by agent (claimed — the bridge records who a changeset says it is from, and cannot verify it)", the row unticked, "· not measured"; Tick suggested leaves it unticked; ticked by hand it applied — **pass** | reply, review |
| I8-2 the MCP tool never files as the add-in | `source: "promote"` and `source: {reader: "promote"}` both stored as `agent`, claimed, pretick false; both declined afterwards — **pass** | printed lines, audit |
| I8-3 Promote's own operations, the first real template count | On `ma0-bds`: "Office template: 79 of 91 office type(s) present (type_catalog@1 …)" — the first real count for decision F5. Signed in: the retype rows opened **ticked**. Receipt #1404: reader `promote`, model_calls 0, its two changesets (both withdrawn afterwards). The signed-out case (rows open unticked, F14) is **owed** | review, audit |
| I8-4 the receipts | Ghost (#1360): `build:run`, reader `ghost-builder`, claimed true, `addin_sha256` = the deployed DLL's, 20.3 s, candidates 12, gaps 0, tools Revit API + PdfPig + Ollama, weights `qwen2.5:7b-instruct` with `licence: null` and its note, model_calls 2, tokens {prompt 3707, output 416} (UNSURE 10: Ollama gives the counts). Datum (#1378): reader `datum`, model_calls 0, tokens null, "no model was called: this run is deterministic". No prompt, no file content, no path — **pass** | audit |
| I8-5 a receipt cannot be forged or unmarked | A `naming` row called `build:run`: 400 "build: rows are receipts (entity_type "build") — nothing was saved". A `build` row with `claimed: false`: stored as `build:run`, `claimed: true` — **pass** | replies |
| I8-6 the machine credential earns no pre-tick by writing `promote` (C2) | 201: source `promote`, claimed true, `pretick` false; the attach row opened unticked and Tick suggested left it so; declined — **pass** | reply, review |

**Found in the drill:**
- **F-I68-1 (fixed on the branch) — a phase Revit did not keep was counted as set.** A door placed from an Existing view into a New
  Construction wall ends in the wall's phase; the write does not throw and the commit raises nothing, so the line said
  "1 element(s) set to "Existing"". The lines are now counted from the phase each element still has after the commit: such an
  element is not in the count, and the line adds "N more kept by Revit in another phase — a hosted element takes a phase its
  host allows." One pure check (promote-check 395/395). Not re-run live.
- **Drill data (the plan's, not the code's).** The plan's door type `M_Single-Flush : 0915 x 2134mm` is not in the B35 model: the
  whole four-element batch was refused cleanly ("door type … does not exist in this model — load it …", reported as declined) and
  re-posted with `Door-Interior-Single-Flush_Panel-Wood : MA1 915 x 2134mm`. Manage Links does not list CAD imports. A typed
  rotation raises no off-axis warning (I7-6).

**Owed** (not passed): I7-5 fix-in-place; I7-6 the Doctor's row; I7-9 Photo Massing; I7-7d's create path; the signed-out cases
(I7-1's actor as `unsigned — …`, I8-3's unticked Promote rows); a floor, a window and a roof on a named workset; a two-user row
(a workset owned by someone else); one row on Revit 2026 or 2027; a blank project from the BDS template (the second count for F5);
full contract 2 (a post without `place.TypeName` is a 400 until MA-2).

Notes:
- Left on the test ledger: scratch projects `ma1a-i68` (rows #1342–#1395, guideline@1, type_catalog@1 and @2) and `ma1a-i68-bare`
  (#1396–#1398); on `ma0-bds` rows #1399–#1404 and the two Promote changesets, withdrawn afterwards; the founder's account is a contributor
  of the three scratch projects. No proposal is left pending.
- Mistake in driving, in an unsaved scratch copy only: in `ma1a-i68-plain.rvt` a click meant to clear the selection picked the
  CAD import, and the next Delete removed it. Both models were closed without saving.
- Settings restored: `bcf-config.json` from its backup (same sha256); the test bridge stopped. The Ghost source folder and the
  bindings were document settings of copies that were not saved.
- Revit driving: after a deploy the first start may sit behind another program's pop-up; Select by ID must show the dialog before
  typing (wait about 6 s); a contextual Modify tab appears only when the ribbon is not on Manage — check the tab before clicking
  ribbon coordinates.

## Session MA1b — door and window blocks hosted in their walls and turned to the drawing, live (2026-10-02 ~23:00 → 2026-10-03 ~01:55 local, branch feature/ma1b-dwg-doors, builds 1c45171 → 183f3f7 → 031361e → 4b91b65, Claude driving Revit 2024)

Setup: five copies of the B35 detached model in `Documents\Sentinel drills\` (`ma1b-central` — workshared in place with `MA1_Walls`
and `MA1_Datum` —, `-planted`, `-level`, `-block`, `-outline`). Scratch web projects on the test bridge 127.0.0.1:4101: `ma1b`
(the drill's `guideline@1` with a placement block, `type_catalog@1`) and `ma1b-block` (the same, plus ruleset `MA1B-DR-01`: BLOCK
on a door with no Comments). **Signed in** (the founder's account, a contributor of both), so the signed-out cases are owed. The
add-in was deployed to Revit 2024 only, three times as the fixes landed (final DLL sha256 0815d76f…92af). The founder's 4100
bridge was restarted by the founder at 22:53 on master e6b324c (the MA-1a items 6–8 build) — it does not carry `place.Rotation`;
nothing in this session used it. The drill drawing is `demo/ghost-sample/sample-doors.dxf` (10 door blocks at known angles on 10
walls at known angles, 3 mirrored; one lone block, one at a wall broken at the opening, one window block) with its expected
results as data (`sample-doors-expected.json`).

| Row | Result | Evidence |
|---|---|---|
| B1-1 the blocks are read (UNSURE 1, 2, 3) | First run: the review counted `36` on `A-DOOR` and `2` on `A-GLAZ` — 12 blocks + 24 flattened curves: Revit's INSTANCE geometry flattens a block into loose curves → **F-MA1b-1**. After the fix (the reader walks the import's SYMBOL geometry): `A-DOOR 12 element(s)`, `A-WALL 13`, `A-GLAZ 1` — the window's insert is reported on the insert's layer (UNSURE 2: the insert's layer); the import on screen shows the mirrored blocks mirrored (UNSURE 3: yes); the nested symbol is named after the drawing and the block (`sample-doors.DOOR-900`, UNSURE 8). UNSURE 1 held: a block INSERT is a nested `GeometryInstance` with a `Transform` — **pass after the fix** | the review, twice |
| B1-2 ten hosted doors that cut their walls | `Placed: 24`, `Walls: 13 …`, `Skipped (no single straight wall … and along it): 2`, `  of these, where a wall line stops short of the opening …: 1`, `Blocks: 11 of 11 … 0.0°`. First and second runs: doors 4, 5, 7, 8 — every door whose hand needed a flip — faced the wrong way while the line said 0.0° → **F-MA1b-2** (two causes: the flip inside the create transaction, and `FacingOrientation` reading reversed after `flipHand()` until a regeneration). Third run, after both fixes: all ten doors and the window face and hinge as the drawing says, verified from their bounding boxes (read-only MCP) against the expected data — **pass after the fixes** (UNSURE 7: every oblique door cut its wall, no Revit warning from the doors) | summaries; bounding boxes |
| B1-3 rotation within 1°, mirrored blocks give the matching hand | The changeset's filed `place.Rotation`, `Mirrored` and `Location` match `sample-doors-expected.json` within 0.01° and 1 mm for all ten; the swing side of each door read from its bounding box against the block's axis, the hinge end checked on door 2 — the calibration signs held (UNSURE 5: the default signs are right for `Door-Interior-Single-Flush_Panel-Wood`) — **pass** | `GET changesets/ma1b/<id>`; bounding boxes |
| B1-4 a block with no wall near, and one at a broken wall, are gaps by name | B1-2's two `Skipped` lines and the two named warnings ("no straight wall …" for the lone block; "the wall line of … stops 450 mm short of …" for the broken wall, F8); the changeset holds 10 doors + 1 window, none for the two — **pass** | B1-2's summary; the changeset |
| B1-5 the window block | Placed in the middle of wall 11, `Rotation 0`; its **sill height is 0** — `NewFamilyInstance` does not apply the family's Default Sill Height (F10 note: a sill from the guideline or the type is Next) — **pass**, the sill recorded | bounding box |
| B1-6 workset and phase hold for doors | `Worksets: 23 on MA1_Walls · 1 left on the active workset (the guideline names no workset for Windows).` and `Phase: 24 element(s) set to "New Construction" …` — **pass on the lines**; one door's Properties (workset, phase) were not read (Select by ID stopped responding in this session) — that detail is owed | summary |
| B1-7 the ledger report and the receipt count the doors | `ghost_build` row: placed 24, skipped 2, wall_gaps 0, its changeset; `build:run` receipt: reader `ghost-builder`, candidates 26, gaps 0, claimed true, `ignored` empty, the signed-in e-mail as actor on both — **pass** | audit |
| B1-8 one Undo removes the build | Ctrl+Z: all 24 gone, the import stays; one `changeset_reverted` row listing the build's 24 guids; no second row — **pass** | the model; audit |
| B1-9 an import in the 01-FFL plan | On `ma1b-level.rvt` (a `01-FFL` plan created for it): the ten doors on Level `01-FFL` at z 3300, "Walls on 01-FFL rise to MA0 Roof"; the blocks' axes and the DXF origin held in the raised plan (UNSURE 4: yes) — **pass** | summary; bounding boxes |
| B1-10 the planted duplicate (F4; UNSURE 6) | **Case (c)**: Revit raised an error, not a warning — `Nothing was built — … Instance(s) of MA1 915 x 2134mm not cutting anything`, naming wall #1 and door #11; nothing in the model; the changeset declined. UNSURE 6: the error. → **F4 goes to B** (taken under the founder's standing "continue with your recommendations": the planner names a second door or window block at one point as a duplicate and does not file it, commit 068e63e; **not run live again** — owed) | the dialog; the declined changeset |
| B1-11 the BLOCK check sees the doors | A baseline Scan Now first: the model's 38 existing doors already fail `MA1B-DR-01` (the drill rule is on an empty Comments, which the template's doors also have). Build: **Sentinel — BLOCK check** `This batch will block your sync: 10 element(s) (MA1B-DR-01)`; Go back: nothing placed, the proposal withdrawn, the review back with Build enabled. Build again, place anyway: `Placed: 24`, the first warning says 10 will block a sync; Scan Now: the pane lists 48 (38 + 10) — **pass**; one new door's Mark and Comments were not read (UNSURE 12 stands on the dialog: the rule fired, so Comments were empty) | dialogs; the pane |
| B1-12 the drawn rectangles still work (F3) | `ma1b-outline.rvt` bound to `ma1b`, `sample-plan-step2.dxf`, level `MA0 Roof`, `A-WALL-EXT`/`A-WALL-INT` → `Generic - 200mm`, `A-DOOR` → `MA1 915 x 2134mm`, `A-FURN` → `M_Desk : 1525 x 762mm`: `Placed: 10` (6 walls, 2 doors, 2 desks), no `Skipped` line, no `Blocks:` line, "Walls on MA0 Roof: no Building Story above — unconnected, 3000 mm high". Both doors on `MA0 Roof` (ids 2069798 in the wall along x, 2069799 in the wall along y; z 6300–8504). `Revit warnings … 1 — identical instances` is the two desks, as in S2-5. Ledger #1455 `changeset_applied` (10 ids), #1456 `ghost_build` placed 10 skipped 0, #1457 `build:run` candidates 12 gaps 0 — **pass** (Pick New Host was not opened — Select by ID; the executor files a door only with its host) | summary; MCP; audit |
| B1-13 an agent's door with a Rotation | On the open central: a door along its wall with `Rotation` — changeset 76ab3850 applied, `Worksets: 2 on MA1_Walls`, `Blocks: 1 of 1`; the same with `FlipHand` too: `400` "say the same thing twice"; `Rotation` 90° to its wall: refused before create — "place.Rotation 90° is 90° off the line of its wall (wall 2069813) … Reported as declined", nothing in the model — **pass** | replies; summary; audit |
| M4-1 Photo Massing builds once (MAS-4) | **Owed** (no photos on this PC; offline-proven only) | — |

**Found in the drill:**
- **F-MA1b-1 (fixed 183f3f7, run again live) — a block's curves were counted as loose elements.** The reader now takes the drawing's
  loose curves from the import's symbol geometry (each moved by the instance's transform), where blocks stay nested.
- **F-MA1b-2 (fixed 031361e + 4b91b65, run again live) — doors whose hand needed a flip faced the wrong way.** A block's door is
  turned after the commit in its own transaction, both flip answers read before either flip; `Turned` is measured after that.
- **F4 → B (068e63e, not run live).** Revit's answer to two identical doors at one point is an error that rolls the whole build back.
- **Drill data:** a typed `Rotation` with `FlipHand` is a 400 by design; the template's doors all fail the drill's Comments rule, so the
  pane's count after B1-11 is 48, not 10.

**Owed** (not passed): M4-1; B1-10 with the duplicate named (the planted drawing against 068e63e); the old-bridge message live
(`GhostFiling.LostRotation` against a bridge without `Rotation` — 4100 is one until the merge is deployed there); the signed-out
cases; one door's workset and phase, Mark and Comments read from Properties; a binary DWG and another office's block library (F9);
a second door family (E9's signs); a door near a wall's end or corner (UNSURE 7's second half); a block more than 5° off its wall and
two walls equally near; Columns and Furniture blocks (E17); a family with no hand flip (F5); the harder inserts (a downward extrusion,
a one-unit block scaled to size); a drawing whose every wall is broken at its openings (F8); Revit 2026 and 2027 (UNSURE 11).

Notes:
- Left on the test ledger: scratch projects `ma1b` (rows #1407–#1457: guideline@1, type_catalog@1, the changesets of B1-2, B1-8's
  revert, B1-9, B1-10 declined, B1-12, B1-13's three) and `ma1b-block` (rows #1408–#1452: its ruleset and the B1-11 changesets); the founder's account
  is a contributor of both. No proposal is left pending.
- Left on this PC: the five scratch copies and `ma1b-central_backup` in `Documents\Sentinel drills\`; `ma1b` and `ma1b-block` under
  `%AppData%\Sentinel\cache` (the remembered layer picks); the request bodies under the session scratchpad. All five models were
  closed without saving; the central's borrowed elements were relinquished.
- Settings restored: `bcf-config.json` from `bcf-config.json.ma1bbak` (same sha256); the test bridge stopped.
- Revit driving: Select by ID stopped answering in this session — doors were verified through the read-only MCP filter
  (`ai_element_filter`, by family-symbol id; its bounding-box and wall-type filters are unreliable); the Revit MCP Switch toggles the
  server, so a timeout is checked before it is clicked; a type combo in Ghost's review takes typed text to jump to the type, then one
  click on the highlighted row; Ghost's level box lists the model's levels by name.

## Session MA2a — rules without a layer, the wider harvest, bridge typing (full contract 2), live (2026-10-03 ~06:10 → 08:05 local, branch feature/ma2a-layer-free-rules 4cba919 → daafa83 → 9856407 → 90b8e36, Claude driving Revit 2024)

Setup: five copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` in `Documents\Sentinel drills\` (`ma2a-promote`, `-onetype`,
`-ghost`, `-harvest`, `-orphan`). The restart copy is the PRE-Promote seed (outline `Generic - 200mm`, partitions `MA0 Interior -
100mm`, gap walls `Generic - 125mm`), not the settled storey the plan's set-up assumed (amendment D6). Scratch web projects on the test
bridge 127.0.0.1:4101: office `ma2a-office` (`guideline@1` = the layer-free DRAFT `8bcd989f…`, `type_catalog@1` = the pilot's
catalogue without `bic`, `a1c0436f…`), projects `ma2a` and `ma2a-ghost` (own `guideline@1` `b2bcb612…`, a layer rule first) in that
office, `ma2a-orphan` (no office). **Signed in** (the founder's account — Project Setup reads "Signed in as …"; contributor of
`ma2a`, `ma2a-ghost`, `ma2a-orphan` and the office, raised to lead on the office for H-2). The add-in was deployed to Revit 2024 four
times as the fixes landed (final DLL sha256 197e759b…); the test bridge was restarted once on the fixed bridge code. The founder's
4100 bridge was not touched.

| Row | Result | Evidence |
|---|---|---|
| P-1 the layer-free rules read Promote's storeys | Header `Guideline: guideline@1 · office · 8bcd989fe1f3…`, `DRAFT rules: install them on a throwaway project only.`, `type_catalog@1 · office · a1c0436f6714…`, `Office template: 79 of 91`. `GR-FFL: 24 retype · 20 attach · 27 wall(s) sent to a person`, `01-FFL: 18 retype · 20 attach · 2`; the gap walls held `gap: W 2051449 (Generic - 125mm, Location Interior) — "BDS_INT_ARC_CMU_125 mm" is not in type_catalog@1 · office · … Available: BDS_INT_ARC_CMU_100 mm, …_150 mm, …_200 mm, …_300 mm`; no wall said `inside cannot be told from outside`; a template wall's retype reason `DD walls v0: Location Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm`. Same counts on the fixed build — **pass** (the storey was not settled: D6) | header; held reasons; tooltip |
| P-2 a one-type storey types by location (F2) | 01-FFL reset to 20 × `Generic - 200mm` + one free wall drawn 6 m south (east was off the canvas). First build: `19 retype · 2 sent` — the outline wall 2051452 held "its sample point lies beyond another wall's centreline (overlapping walls)" because of the template's 6 mm waterproofing wall 34 mm off its face → **F-MA2a-1**; and a false `Template check: BDS_INT_ARC_CMU_200 mm is Function Interior in this model` → **F-MA2a-2**. Apply: `Applied 39 element(s)`, 7 outline → `BDS_EXT_ARC_CMU_200 mm`, 12 → `BDS_INT_ARC_CMU_200 mm` (MCP), wall types 1702 before and after, one Undo entry and one `changeset_reverted` (#1482, 39 guids). Fixed build: `01-FFL: 20 retype · 20 attach · 1 wall(s) sent to a person`, the free wall held with exactly the plan's words, no template note — **pass after the fixes** (UNSURE 1 held on the clean storey) | dialogs; MCP; audit #1481/#1482 |
| P-4 a shell based below is a barrier (C1) | The 8 GR-FFL outline walls raised to MA0 Roof (Select by ID answered this session); Revit: 8 × "Highlighted walls overlap". `01-FFL: 12 retype · 9 sent`: every partition and gap wall `Location Interior`; the 8 outline walls unknown "its body overlaps a parallel wall's body (a wall drawn inside another)" — D5: two walls in one place, the plan expected Exterior. The 01-FFL outline deleted: `01-FFL: 12 retype · 12 attach · 1 wall(s) sent to a person`, all 12 reasons `DD walls v0: Location Interior, 200 mm → BDS_INT_ARC_CMU_200 mm` (filed, read, withdrawn) — **pass** (C1), first half recorded as D5 | dialogs; changeset reasons |
| P-3 an unknown location on a mixed storey falls to Function | On `ma2a-promote` a free `Generic - 200mm` wall south of the 01-FFL outline: `01-FFL: 19 retype`, its reason `DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm` (`Generic - 200mm` is Function Exterior in this model — H-1); the outline wall by the membrane `Location Exterior` (fix live) — **pass** | changeset reasons |
| G-1 Ghost Builder: the layer rule, the layer-free rule, a gap | `sample-walls-ma2a.dxf` from Ghost's own picker, no type picked: the review counts drawn LINES (`A-WALL-EXT 8`, `A-WALL-INT 6`), the build pairs them: `Placed: 6`, `Walls: 6 typed by the guideline · 1 left as a reported gap`, `Wall on 'A-WALL-INT': gap: 100 mm wall on 'A-WALL-INT' — the guideline names no wall type for it (type_catalog: type_catalog@1 · office · …); skipped.`, `outer boundary: 4 outside · 2 inside · 1 unknown`; the changeset: 4 × `BDS_EXT_ARC_CMU_200 mm` (the layer rule) and 2 × `BDS_INT_ARC_CMU_100 mm` (the Location rule), each `provenance.rule` naming the guideline; no CreatedTypes line (no clone); one Undo. The same on the fixed build — **pass** (UNSURE 5: the faces pair) | summary; changeset 55f4929e / 7acd0c36 |
| B-1 a contract-2 post without `place.TypeName` is typed | 201; `elements[0]` `BDS_EXT_ARC_CMU_200 mm`, `typing` `typed_by: bridge`, `matched: ["param:Location"]`, `input {category: Walls, params: {Location: Exterior}, thicknessMm: 200}`, the rule's words, both artefact labels and shas; `elements[1]` `BDS_INT_ARC_CMU_100 mm`; both `pretick: false`, `not_measured`; `claimed: true`; `ignored` only `source.job_id`; `facts` kept; audit `typed: 2`. 1.36 s including the Node client's start — **pass** (UNSURE 11: well under a few seconds) | reply; audit #1493 |
| B-2 the bridge-typed changeset applied in Revit | Rows read `· not measured · typed by the bridge from the facts posted (guideline@1 · office · 8bcd989fe1f3…)` (full only with the window widened — UNSURE 9), unticked, "Tick suggested" leaves them so. Applied 2; partition 2051439 → `BDS_INT_ARC_CMU_100 mm`, same width; types 1702 unchanged. **But the new wall stood on GR_SSL, −300 → 0 mm** → **F-MA2a-3**. Fixed build and bridge, re-posted (51b5e38f): the wall 2069812 stands on GR-FFL, 0 → 3300 — **pass after the fix** (UNSURE 8 held) | review; MCP; changesets 2b41780c, 51b5e38f |
| B-5 a claimed thickness that would move a face is refused | 201 typed `BDS_INT_ARC_CMU_200 mm` (unticked); Apply: "Transaction failed and was rolled back: "BDS_INT_ARC_CMU_200 mm" is 200 mm thick, wall 932a9e30-…-001f4d6f is 100 mm — a retype would move a face; a person decides. Reported as declined."; changeset declined, `rejected` 1 — **pass** | dialog; changeset 9ed8df9a |
| B-3 a post the bridge cannot type is a 400 that names what is missing | (a)–(e) answered word for word as the plan wrote them; changeset counts unchanged — **pass** | replies |
| B-4 the trust rules stay | 201; `ignored` lists `elements[0].typing` and `elements[0].pretick` as `ignored: set by the bridge`; stored `typing.typed_by: bridge`, `pretick: false`; withdrawn — **pass** | reply |
| H-1 the harvest writes Function, Material and the BuiltInCategory | `Type catalogue exported (1462 types from ma2a-harvest)`, the dialog ends `A lead installs it from the review window too: Install catalogue on office (MA-2a, BOS-3) — no command line.` Basic Wall rows 80, all with `Function` (Exterior 52, Interior 22, Foundation 4, Retaining 1, Soffit 1) and `bic: OST_Walls`, 73 with `Material`; doors 41/41 with `Function`; `bic` on 1,362 of 1,462 rows, the only category without one the CAD import's; `category_local` on 0 rows — **pass** (UNSURE 3, 4). UNSURE 7: `Generic - 200mm` has no Material; the BDS labels are words like `BDS_GypsumBoard`, `BDS_StoneFacade`, `Concrete Masonry Units`, `BDS_WATERPROOF_CEMENT` (a `STONE`/`GYPS` rule matches them as substrings) | export file; one-liner |
| H-3 a contributor is refused Install on office | `Catalogue NOT installed: HTTP 403: this action requires the lead role (you are contributor)`; the office still `version 1` — **pass** | status line |
| H-4 a project with no office is refused | `Catalogue NOT installed: project ma2a-orphan belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)`; `ma2a-orphan` type_catalog 404 `not_installed` — **pass** | status line |
| H-2 Install on office from Revit (BOS-3) | As lead, from `ma2a-ghost` (D6): `type_catalog@2 · office · 91fa90605a58…: installed on ma2a-office — 1,463 types from ma2a-ghost. Ghost Builder, Promote and the bridge read it from here on; GET /cde/ma2a-office/artefacts/type_catalog answers the same sha.` GET: version 2, sha `91fa90605a58…`, 1,463 types with `bic`/`Function`; audit #1522 `artefact_installed type_catalog@2`, actor the signed-in e-mail, `source {tool: revit-build, document: ma2a-ghost}` — **pass** (UNSURE 6, 10) | status line; GET; audit |
| H-5 the add-in reads what Revit installed | Header `type_catalog@2 · office · 91fa90605a58…`; first `Office template: 80 of 87` — the 7 were curtain wall types → **F-MA2a-4**; fixed build: `87 of 87` — **pass after the fix** | dialog |
| R-1 parity | promote-check 569/569 with `…every shared case (29/29)` and `…every shared layer-free case (20/20)`; vitest guideline + bundle + typing 6 files, 49 passed; the whole suite 139 files, 2,159 passed, 1 skipped; `npm run build:bridge-core` leaves the bundle unchanged — **pass** | runs |

**Found in the drill** (each fixed on the branch with its check and run again live):
- **F-MA2a-1 (daafa83) — a thin lining read as an overlap.** The template's 6 mm waterproofing wall beside the outline sent the
  outline wall to a person. A lining (parallel, known width ≤ 50 mm and thinner, body starting at or past the face) is read past. An
  adversarial review of the first cut found width-0 and equal walls slipping through as linings and a partition wholly inside a shell
  reading Interior; both are unknown now ("its body overlaps a parallel wall's body").
- **F-MA2a-2 (daafa83) — a false template note** on a one-type storey; the note now compares with the side the rule decided.
- **F-MA2a-3 (9856407) — the design's contract-2 wall went on the lowest level, in silence.** The executor reads `BaseLevel`/`TopLevel`
  on a create and never picks a level; the bridge refuses a level-less wall or floor.
- **F-MA2a-4 (90b8e36) — "80 of 87" for a model holding all 87:** the template count reads every type the model holds.
- **Driving slip:** the wall tool kept chaining while a read-only MCP call waited for Revit and drew a second, diagonal wall in the
  scratch copy; one Undo removed it before any Promote run. Do not call the MCP while a Revit tool is active.

**Owed** (not passed): H-6 (a signed-out Install refused — the session was signed in; signing out is the founder's step); the
signed-out actor on the ledger rows; one row on Revit 2026 and 2027; a non-English Revit harvest (BOS-5); floors, roofs, ceilings,
doors and windows through the layer-free rules live (no `lod_matrix` installed); a closed inner courtyard and walls drawn in pieces
under the boundary; the MCP tool posting `facts`; a survey-backed `measured` (MA-4); Ghost's clone path (not provoked); the office
guideline's own layer-free rules written by a lead (design `:1081`), in the template's material words (H-1 gives them); the plan-only
aster-tower run (B-3 (d) stands for it); a floor create naming no level, live (pinned offline).

Notes:
- Left on the test ledger: `ma2a-office` (#1458–#1522: guideline@1, type_catalog@1 and Revit's type_catalog@2, the account as lead),
  `ma2a` (#1459–#1514: 3 changesets applied in copies that were not saved, 1 declined, 8 withdrawn), `ma2a-ghost` (#1460–#1519),
  `ma2a-orphan` (#1461–#1520). No proposal is left pending.
- Left on this PC: the five scratch copies (`ma2a-onetype` and `ma2a-promote` saved once mid-drill, with backups `.0001`/`.0002`), the
  export files `%AppData%\Sentinel\exports\type-catalog-ma2a-{harvest,orphan,ghost}.json` (the drill's evidence). The `ma2a` and `ma2a-ghost` cache
  folders (no `ma2a-orphan` folder was made) and the request bodies were deleted.
- Settings restored: `bcf-config.json` from `.ma2abak` (same sha256); the test bridge stopped; Revit closed without saving.
- Revit driving: Select by ID answered again this session (it did not in MA1b); the type selector's search box takes a typed name; a
  long "Promote" dialog's expanded list scrolls only by dragging its scrollbar; Revit's "Project Not Saved Recently" prompt blocks the
  MCP until answered; after a Revit restart the MCP server must be switched on again (Add-Ins ▸ Revit MCP Switch).

## Session MA2b — the LOD matrix's stage map, the LOD state on the ledger, the DD IDS before commit, live (2026-10-03 ~08:30 → 11:25 local, branch feature/ma2b-lod-matrix-state 7f8fc2c → 0cbc6b0 → 2ea064f, Claude driving Revit 2024)

Setup: two copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the PRE-Promote B35 seed) in `Documents\Sentinel drills\ma2b\`:
`ma2b-a.rvt` bound to `ma2b`, `ma2b-b.rvt` bound to `ma2b-none` (Project Setup, current-project scope, not saved). Scratch web projects
on the test bridge 127.0.0.1:4101 (branch code, event poll off): office `ma2b-office` with `guideline@1` (`bds-dd-elements-guideline.json`,
`5ac547cae77c…`), `type_catalog@1` (`a1c0436f6714…`), `lod_matrix@1` = the drill's DRAFT `bds-lod-matrix-dd-ma2b.json` (sha256
`cb47a6d07da3…cb11`) and the pilot's `ruleset@1`; project `ma2b` in that office; `ma2b-none` with no office and no matrix (its own
guideline and catalogue). **Signed in** (the founder's account; contributor of `ma2b`, `ma2b-none` and the office). The add-in: the
branch build 7f8fc2c, deployed to Revit 2024 once (10:34); the two fixes below were committed after it, and only the bridge one ran
live (see Owed). The founder's 4100 bridge was not touched.

**Record before the first row** (by mouse, Type Properties on `ma2b-a.rvt`; UNSURE 1): `BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_GYPS_100 mm`,
`MA0 Interior - 100mm`, `BDS_INT_1 PNL_WOOD_1000 x 2100 mm` and `BDS_INT_2 PNL_WOOD_2000 x 2100 mm` — Fire Rating empty on every one;
the four BDS window types loaded (`BDS_Window-1 Panel 3.10X1.50 m`, `-2/-3/-4 Panels 3.10X2.90 m`) — Analytic Construction `<None>`,
Heat Transfer Coefficient (U) empty, no `U-Value`/`ThermalTransmittance` parameter; no type has an `Export Type to IFC As` (UNSURE 3:
none on the seed). So the table's doors read 0 at DD, and L-3 takes every "else" branch. `analyze_model_statistics`: Walls 89, Doors
38, Windows 7, Floors 36, Ceilings 9, Roofs 3 model-wide (the template's legend instances included; Promote counts 86 on its storeys).

| Row | Result | Evidence |
|---|---|---|
| R-1 the matrix's DD IDS, derived | `GET cde/ma2b/artefacts/lod_matrix/ids` 200: `matrix` `lod_matrix@1 · office · cb47a6d07da3…`, `sha256` its full sha, `project_stage` `design`, specifications `Walls · DD`, `Doors · DD`, `Windows · DD`, `unmatched` `[]`; `ma2b-none` 404 `no lod_matrix installed for ma2b-none or its office`; the PUT with `stage_map {SD: coord}` 400 (DD maps to design, before SD's coord), nothing installed — **pass** | replies |
| G-0 the LOD check before any row | tender `gate:pass tender` (#1535); design `gate:not_checkable design` (#1536), four checks, the fourth `LOD state: elements at the DD row ≥ 90%`, `na: true`, source `LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)` — **pass** | replies |
| N-1 no matrix, no row | `ma2b-b` → `ma2b-none`, Promote (DD): `LOD matrix: none — not installed for ma2b-none or its office — walls only (MA-0 rules)`; `LOD state: not measured — no lod_matrix@n to measure against (none — not installed for ma2b-none or its office)`; `DD now — Walls 0/60`; No pressed; `audit?entity_type=lod_state` `rows: []`; the pane `LOD state: not measured — no lod_state row yet (Promote (DD) in Revit records one)` — **pass** | dialog, reply, pane |
| L-1 the LOD state now | `ma2b-a` → `ma2b`, Promote (DD), the dialog in ~3 s (UNSURE 5): `LOD matrix: lod_matrix@1 · office · cb47a6d07da3… (DRAFT)`; `DD now — Walls 0/60 · Floors 5/9 · Roofs 1/3 · Ceilings 1/4 · Doors 2/7 · Windows 0/3` (= B35-3); `LOD state now (sent to the ledger — …): DD → design: 7 of 86 at DD (8%) · 70 below · 9 blocked · 0 not measured · 101 on other office types, not counted`; per level and class GR-FFL Walls 0/32/8/0, Floors 5/2/0/0, Roofs 1/0/0/0, Ceilings 1/3/0/0, Doors 0/6/0/0 (`missing Pset_DoorCommon.FireRating ×2` — the two DD-now doors), Windows 0/3/0/0; 01-FFL Walls 0/20/0/0, Floors 0/1/1/0, Doors 0/1/0/0; MA0 Roof Roofs 0/2/0/0 — they add up to 86 = 7 + 70 + 9; `DD also asks` Walls FireRating, IsExternal · Doors FireRating · Windows ThermalTransmittance. Doctor `10:54:08 LOD state now — Recorded: ledger #1537 · receipt 78ed60aed99c4ecb…` (UNSURE 6). Row #1537 `lod:state now · DD → design: 7 of 86 …`, `claimed: true`, `project_stage: design`, `matrix_sha256` = R-1's, actor the account's e-mail — **pass** | dialog, Doctor, row |
| L-2 the pane and the journey | ↻ pressed (see the pane note below); the pane: `LOD state: DD → design: 7 of 86 at DD (8%) · … — Revit's count (claimed), <e-mail>, 2026-10-03 08:54 · ledger #1537`, the journey's `lod_state.line` word for word, `ledger.id` 1537; it wraps in the docked pane (UNSURE 7: it fits, on five lines) — **pass**, with **F-MA2b-1** (the time is UTC, unlabelled) | pane (read through UI Automation), reply |
| W-1 the web Next strip | **owed**: the local-app route loads from `:4000`, where the founder's long-running `thatopen serve` serves the 4100 build, and the app needs a signed-in platform session (a password). The strip prints `lod_state.line` verbatim (`next-strip.test.ts`); the line is L-2's | — |
| G-1 the gate reads the row | `gate:hold design` (#1538): the LOD check `na: false`, `ok: false`, `detail` `8`, source `lod_state ledger #1537 — DD → design: 7 of 86 … (Revit's count, claimed: <e-mail>, 2026-10-03T08:54:08.038951+00:00)`; the other three not measured — **pass** | reply, row |
| I-1 the DD IDS before commit, Go back | `MA0 Interior - 100mm` Fire Rating set to 60 (GYPS 100's already empty). Promote (DD) → Yes (a second `now` row, #1539, the same reading — the partitions on the concept type stay below: not on a DD type). The review `Promote (DD) · GR-FFL` (changeset `b7c941bf…`): 48 rows ticked — 14 walls → `BDS_EXT_ARC_CMU_200 mm`, 10 partitions (W 2051439–48) → `BDS_INT_ARC_GYPS_100 mm`, floor 2062165 → `BDS_INT_STR_CONC_300 mm`, ceiling 2062245 → `BDS_INT_ARC_GYPS_50 mm`, doors 2069756/57 → the BDS PNL_WOOD types, 20 attaches; 30 sent to a person. Apply: `This changeset leaves 28 element(s) failing the DD IDS made from lod_matrix@1 · office · cb47a6d07da3…` = 14 outline + 10 partitions + 2 doors + the 2 attach-only gap walls (amendment D3); had the read seen the concept type's 60 it would be 18 — **UNSURE 2 held**. The dialog named the first eight (outline walls) and "… and 20 more" → **F-MA2b-2**. Go back: `You went back at the DD IDS check — nothing was placed. 28 element(s) would have failed …`, "The proposals are still pending"; the changeset `proposed`; MCP on `WIP_FP_GR_FFL`: the outline still `Generic - 200mm`, the partitions `MA0 Interior - 100mm` — **pass** (the partitions by count; see F-MA2b-2) | dialogs, reply, MCP |
| I-2 Place anyway, the LOD state after | Review again (3 pending, the oldest first), the same 48; Apply; Place anyway. The result in ~3 s: `Applied 48 element(s) from "Promote (DD) · GR-FFL".`, `… — placed anyway, as the person chose: W 1747982 (Walls · DD): missing Pset_WallCommon.FireRating; … and 23 more`, `LOD state after (sent to the ledger — …): DD → design: 9 of 86 at DD (10%) · 68 below · 9 blocked · 0 not measured · 101 on other office types, not counted`; Doctor `11:12:19 LOD state after — Recorded: ledger #1548 · receipt 0c55ad1d2d2d3b10…`; the changeset's result note starts with the IDS line; row #1548 `lod:state after · …`, `changesets: ["b7c941bf-…"]` — **pass** | dialog, Doctor, rows |
| L-3 after, per class | The pane shows #1548. Against L-1: GR-FFL Floors 5 → 6 and Ceilings 1 → 2 at DD (their class asks nothing); Walls 0/32/8 with `18× missing Pset_WallCommon.FireRating` (the 8 outline walls retyped and attached, and the 10 partitions — the 6 retyped walls 6,096 mm high keep their "top above 01_SSL" reason); Doors 0/6 with `4× missing Pset_DoorCommon.FireRating` (the two swapped doors and the two DD-now doors) — every "else" branch, as the record said. Gate `gate:hold design` (#1549), the LOD check `detail` `10` from #1548 — **pass** | rows, pane, reply |

**Found in the drill:**
- **F-MA2b-1 (0cbc6b0, minor, words) — the journey's LOD line printed the row's UTC time without its zone** ("08:54" for a 10:54 run).
  It now reads "… 08:54 UTC · ledger #n". Run again live: the restarted test bridge's journey reply reads `2026-10-03 09:12 UTC · ledger #1548`.
- **F-MA2b-2 (2ea064f, important, words) — the DD IDS dialog named eight elements and hid the rest.** The person chose Place anyway
  without seeing the ten partitions. The dialog now counts the failures by specification and missing properties (every element in a
  line) and names each element under See details (up to 200; the count covers the rest). Checked offline (promote-check 605/605);
  **not run again live** — the redeploy was blocked (below), so the row is owed.
- **The pane's content is wider than its docked column** (not MA-2b's): with Speckle docked beside it the pane is ~290 px wide and its
  content ~456 px — long lines are cut and the ↻ button sits off the right edge; dragging the dock splitter did nothing. ↻ was pressed
  through UI Automation, and the pane's lines were read the same way. Left as a follow-up task.
- **Driving slips:** Windows' "Windows Input Experience" window (TextInputHost) held the foreground after Revit started, so the first
  clicks were refused; the unsigned-add-in prompt's Load Once was pressed with a posted click, and bringing File Explorer, then Revit,
  forward cleared it. Each of those "open Revit" calls made while Revit was already up started another Revit 2024 (three, each stopped
  at its own unsigned-add-in prompt, no document); they were still running after the drill's Revit closed and blocked the redeploy —
  the founder closes them. Never open an app that is already running; switch to its window.

**Owed** (not passed): I-1's dialog with F-MA2b-2's fix, live (the redeploy was blocked); W-1, the strip in the browser; the pane
showing "UTC" (the bridge's reply shows it); the signed-out actor on `lod_state` rows; one row on Revit 2026 and 2027; a real office's
matrix (LM-1); a type with an IfcExportAs override (UNSURE 3, none on the seed); the LOD state on sync (S4, not built); the snap (D16,
not built).

Notes:
- Left on the test ledger: `ma2b-office` (guideline@1, type_catalog@1, lod_matrix@1, ruleset@1, the account's membership), `ma2b`
  (#1524–#1549: four gate runs, three `lod_state` rows, three Promote changesets — GR-FFL applied in a copy that was not saved, 01-FFL
  and MA0 Roof left `proposed`), `ma2b-none` (no `lod_state` row). Scratch keys only.
- Left on this PC: the two scratch copies and the request bodies in `Documents\Sentinel drills\ma2b\` (not saved; the drill's evidence).

**Owed rows run live** (2026-10-03 ~14:05 local, after the founder closed the stray Revits and restarted the 4100 bridge on master;
Revit 2024 with branch fix/pane-narrow-dock 2660146 = master 6a87d9f + the pane fix; `ma2b-a.rvt` rebound to `ma2b`, not saved):
- **F-MA2b-1 — pass.** The pane's LOD line reads `… lead@…, 2026-10-03 09:12 UTC · ledger #1548` (UI Automation read).
- **F-MA2b-2 — pass.** Apply on the drill's pending `Promote (DD) · 01-FFL`: `This changeset leaves 21 element(s) failing the DD IDS
  made from lod_matrix@1 · office · cb47a6d07da3…`, tallied `Walls · DD: missing Pset_WallCommon.FireRating — 20 element(s)` and
  `Doors · DD: missing Pset_DoorCommon.FireRating — 1 element(s)`; See details names all 21 (W 2051451–2051470, Door 2069761). Go back:
  nothing placed, no ledger row.
- **The pane in a narrow dock (drill D5) — pass.** Docked alone and dragged to the drill's width (content 2268–2544 px on a 2560 px
  screen at 150 %): ↻ at 2499–2535 (it was at 2685, off the screen), every journey line wraps, the journey box scrolls with its bar from
  the key down, ⚡ Fix whole with Rule and Mode beside it, the Doctor toggle in view; unbound (`ma1-bds` 404) its empty lines take no room.
- Still owed: W-1 (the strip in the browser) and the rest of the list above.

## Session MA2c — set_parameter from a cited source, the type gaps, live (2026-10-03 ~16:50 → 17:40 local, branch feature/ma2c-set-parameter-gaps 1a8f782, Claude driving Revit 2024)

Setup: two copies of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the PRE-Promote B35 seed) in `Documents\Sentinel drills\ma2c\`:
`ma2c-a.rvt` bound to `ma2c`, `ma2c-b.rvt` bound to `ma2c-b` (not saved). Scratch web projects on the test bridge 127.0.0.1:4101 (branch
code, event poll off): office `ma2c-office` with `guideline@1` (`5ac547cae77c…`), `type_catalog@1` = `catalog-fr.json` (the BDS catalogue
with Fire Rating "60 min" on `BDS_EXT_ARC_CMU_200 mm`, `79c6efb85da5…`), `lod_matrix@1` (`cb47a6d07da3…`, MA2b's DRAFT) and the pilot's
`ruleset@1`; projects `ma2c` and `ma2c-b` in that office, each with `ids@1`, then `ids@2` (drill amendment D1). **Signed in** (the
founder's account, made lead of all three). The add-in: the branch build 1a8f782 deployed to Revit 2024 at 16:54 on the founder's
explicit ask (DLL `5b6987d1…`; before it, master 154915f's `428e87c08e6d…`). The add-in's bridge settings backed up and pointed at 4101.
The founder's 4100 bridge was not touched (read-only GETs only, after the drill, for this record).

**Record before the first row:** Type Properties ▸ Fire Rating empty on the four types (MA2b's record, the same seed bytes);
`get_available_family_types` Walls 87, Doors 41 (128).

| Row | Result | Evidence |
|---|---|---|
| R-1 the bridge refuses what no source gives | `"to":"120 min"` with `value_source` catalogue: 400, the catalogue gives "60 min"; `value_source` person: 400 (a person's value is not this op's yet); `"from":"30 min"`: 400 (fills an empty value only); `changesets/ma2c` `[]`; `holding` `type_gaps {open: [], closed: [], catalog: "type_catalog@1 · office · 79c6efb85da5…"}` — **pass** | replies |
| P-1 the read-only run | First run (the plan's hand-written `ids@1`): `LOD state now … DD → design: 7 of 86 at DD (8%) · 70 below · 9 blocked · 0 not measured`; `✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → "60 min" (type_catalog@1 · office · 79c6efb85da5… · BDS_EXT_ARC_CMU_200 mm · Fire Rating) — 23 element(s) read the type`; the two DD door types **refused** the clause: "its document says more than whole-class values … — a person decides" — the hand-written ids@1 carries no `source_alone` (only `compileIds` sets it: C23, fail-closed), drill data, **D1**. Re-run on `ids@2` compiled from "The fire rating of all doors shall be FD30.": `DD properties: 3 type edit(s) from a cited source (never pre-ticked) · 5 with no source — sent to a person (25 element(s) on those types) · 6 held off the type …`; `✎ … BDS_INT_1 PNL_WOOD_1000 x 2100 mm … → "FD30" (ids@2 · … "The fire rating of all doors shall be FD30.") — 3 element(s)`, `… BDS_INT_2 PNL_WOOD_2000 x 2100 mm … — 2 element(s)`; `Type gaps (…): 5 group(s), 8 element(s)` (Walls GYPS_125 ×4, Floors CONC_250, Ceilings GYPS_56, Doors 915 x 2134, Roofs GENRC_225); No pressed — **pass** | dialog text (both runs) |
| P-2 the type_gap row | #1563 `type_gap:run · 5 group(s), 8 element(s)`, `claimed` true, actor the account; group ids `19858cb2fb16` (Walls), `06ee290645ca`, `5cac25b88e0e`, `d0206653f1ce` (Doors), `7c7f82b71aae`; `holding.type_gaps.open` the same five, `runs: 1` — **pass** | replies |
| A-1 the review and Apply | Review `Promote (DD) · GR-FFL`: 48 rows ticked, the 3 type edits **unticked**, each `type edit wall: BDS_EXT_ARC_CMU_200 mm · reaches 1 element(s) in the model now + 14 if this changeset's retypes onto it are applied · Pset_WallCommon.FireRating "" → "60 min" · from type_catalog@1 … · Fire Rating` (the doors "+1", "FD30" from ids@2); door retype badges "✗ rejected" (the IDS referee's verdict, S3). Ticked all; Apply; DD IDS: `12 element(s) failing … Walls · DD: missing Pset_WallCommon.FireRating — 12 element(s)`, See details W 2051439–2051450 (the partitions on GYPS_100, which has no source) — the outline walls did **not** fail (UNSURE 1 and 3 held: the type write is inside the group, N = 12 not 26). Place anyway: `Applied 51 element(s)`, `LOD state after … 21 of 86 at DD (24%) · 56 below · 9 blocked` = the prediction — **pass** | dialog, review rows |
| A-2 the values, written and read back | `changeset_applied` #1575 `values`: CMU_200 `""` → `"60 min"`, `value_source` catalogue (`type_catalog@1 · … · Fire Rating`, sha `79c6efb85da5…`); BDS_INT_1/INT_2 PNL_WOOD `""` → `"FD30"`, clause (`ids@2 · …`, sha `6a36732dbf0d…`); `unique_id` = `revit_unique_id` each. Type Properties by mouse: CMU_200 "60 min", INT_1 "FD30", INT_2 "FD30". MCP family types after: the same 128 (87 + 41, the same ids) — **zero types created**; the stamp took the types (UNSURE 4) — **pass** | row, Type Properties, MCP |
| U-1 one Undo | Undo list top `Sentinel AI changeset: Promote (DD) · GR-FFL [353753a1]` (one entry; the next `Sentinel: Save project settings`); one Undo → #1577 `changeset_reverted`, 51 rows, the 3 set_parameter guids among them; Type Properties CMU_200, INT_1, INT_2 Fire Rating empty again; MCP on GR-FFL: outline walls `Generic - 200mm`, partitions `MA0 Interior - 100mm` (UNSURE 8, XC-2 for a write on a type) — **pass** | Undo list, row, Type Properties, MCP |
| S-1 the stale guard | `ma2c-b.rvt`: Promote → Yes; before Apply, CMU_200 Fire Rating "90 min" ▸ OK; tick all; Apply: `Transaction failed and was rolled back: stale: Pset_WallCommon.FireRating on type BDS_EXT_ARC_CMU_200 mm reads "90 min" now, the plan read "" — set_parameter fills an empty value only (a filled one is a person's); re-run Promote` … `Reported as declined.`; #1587 status `declined`, `applied: []`, `rejected: 51`; outline walls still `Generic - 200mm`. Promote again (after D2): no ✎ for CMU_200 — `→ a person: Pset_WallCommon.FireRating on BDS_EXT_ARC_CMU_200 mm reads "90 min", type_catalog@1 … · Fire Rating gives "60 min" — not overwritten; a person decides`; No pressed — **pass** | dialogs, row, MCP |
| G-1 the close rules | Dismiss `d0206653f1ce` (Doors 915 x 2134): 201, #1592 `hold:type_gap_dismissed d0206653f1ce`; a second dismissal 409 `type-gap group d0206653f1ce is not open on ma2c`; `catalog-fr-125.json` (+ `BDS_INT_ARC_GYPS_125 mm`) → `type_catalog@2` (`33be0801…`); holding: Doors `closed_by` dismissed with the reason, Walls `19858cb2fb16` `closed_by` catalogue `BDS_INT_ARC_GYPS_125 mm` (`type_catalog@2`); Floors, Ceilings, Roofs open — **pass** | replies |
| G-2 a dismissal holds | `ma2c-a.rvt` Promote → No (after D2): `type_gap:run · 4 group(s), 4 element(s)`; Doors still closed (dismissed, reason kept), `runs` one more than at G-1, not reopened; Walls stays closed by the catalogue — **pass** | reply |
| W-1 the web Holding Area | **owed** (C14): port 4000 is held by the founder's `thatopen serve` (pid 63540, read with `netstat`), and the app needs the founder's platform sign-in. The section's words are pinned offline (`holding.ts` tests) | `netstat` |

**Drill amendments:**
- **D1 (drill data) — the plan's hand-written `ids-fd30.json` has no `source_alone`**, so the bridge and the add-in read its clause as
  "says more than whole-class values" and send the doors to a person (C23, fail-closed: an ids@n not made by `compileIds` is never a
  source). `compileIds` does not compile "All doors shall be FD30." (no property word); the drill compiled "The fire rating of all doors
  shall be FD30." (the verifier's control) and installed it as `ids@2` on both projects. Recorded as F-MA2c-1 (drill data, no code change).
- **D2 — Promote opens a pending Promote review before it plans again** (Promote v1: `FetchProposed`, the unreviewed promote first).
  S-1's and G-2's re-runs withdrew the storey's pending `01-FFL` and `MA0 Roof` changesets first (`POST changesets/<key>/<id>/withdraw`:
  #1588–1589 on `ma2c-b`, two more on `ma2c`). After a stale decline, "re-run Promote" therefore shows the next pending storey's review
  first; the re-plan follows once those are reviewed. Words only; not changed.

**Found in the drill:** F-MA2c-1 above (drill data). No gap in the code.

**Notes:**
- The report route logs every outcome under the action `changeset_applied`, the outcome in `new_value.status` (`declined` at S-1) —
  as since the changesets' first build, not MA-2c's.
- Revit's main thread ran at ~100 % CPU from its start (1131 CPU-s in 19 min) with no command open. Sentinel registers no Idling
  handler and no timer: another add-in or Revit itself, not a finding.
- **Driving slips:** from ~17:12 every mouse click missed Revit — the Claude desktop window was maximized and always-on-top over the
  whole screen (`WindowFromPoint`; screenshots hide it, so Revit looked clickable); the founder minimized it. Before that, Apply was
  pressed once through UI Automation (Invoke) after the rows were ticked the same way.

**Owed** (not passed): W-1, the Holding Area in the browser; the signed-out actor on the changeset, `values` and `type_gap` rows; a
window U-value (UNSURE 2: no BDS window type is DD on the seed); one row on Revit 2026 and 2027; one Undo per storey, DAT-3/ANV-1/ANV-2,
the full drill MA2 and gate G2 (MA-2d); a second account's approval (MA2); a real office matrix (LM-1); master's add-in back on Revit
2024 — the redeploy from a master worktree was refused by the session's permission check (the branch build stays until the merge's
deploy).

**Closing list:** Revit closed without saving either copy; sign-in left as found (signed in); the test bridge stopped; the add-in's
bridge settings restored (sha256 `366a193f4680…` = the backup's), the backup deleted; `%AppData%\Sentinel\cache\ma2c` and `ma2c-b`
deleted. Left on the test ledger (scratch keys, on purpose): `ma2c-office` #1550–#1593 (guideline@1, type_catalog@1 and @2,
lod_matrix@1, ruleset@1, the membership), `ma2c` #1551–#1597 (ids@1, ids@2, four `lod_state`, three `type_gap` runs, the dismissal,
three Promote changesets — GR-FFL applied then undone, two withdrawn), `ma2c-b` #1552–#1591 (ids@1, ids@2, two `lod_state`, two
`type_gap` runs, GR-FFL declined stale, two withdrawn). Left on this PC: the two scratch copies and the drill's files in
`Documents\Sentinel drills\ma2c\` (the drill's evidence; never committed).

**After the drill — C26** (66ef8c7, from the report-only attack run at 1a8f782): the compiler now keeps the value of "must be", "is to be", "shall be:", "shall have a … of", a doubled blank, a closing "!", a quoted value and a decimal comma; the docs panel compiles headings and the title with the bodies; a clause naming the property or set in another spelling is weighed on both sides; a U-value's decimal comma takes 1–2 digits. No drill row's input reaches the changed code (the drill's ids@2 is one plain sentence, and no thermal value is written): checked offline on both sides (shared cases value 249, document 46, ids 50; promote-check 659/659), not run again live.

## Session MA2d — one Undo per storey, live (2026-10-03 ~19:20 → 20:45 local, branch feature/ma2d-storey-undo c0c01bc → cef26db, Claude driving Revit 2024)

Setup: the branch build c0c01bc deployed to Revit 2024 at 19:20 on the founder's explicit ask ("deploy the ma2d branch to 2024"; DLL
`4bef357200c…`; before it, master 3242452's `b7b75b69d70…`), cef26db at 20:14 for the re-run (`497e9c49c46…`). The add-in's bridge
settings backed up and pointed at the test bridge 127.0.0.1:4101 (no bridge change in MA-2d). Scratch office `ma2d-office`
(`guideline@1` `5ac547ca…`, `type_catalog@1` = `catalog-fr2.json` with Fire Rating "60 min" on `BDS_EXT_ARC_CMU_200 mm` and "30 min" on
`BDS_INT_ARC_GYPS_100 mm`, `ca0ab99f…`, `lod_matrix@1` `cb47a6d0…`, `ruleset@1`); projects `ma2d`, `ma2d-ma0`, `ma2d-26`; **signed in**,
the account lead on all four (copied from `ma2c`'s lead in a script that never printed the e-mail). Scratch copies in
`Documents\Sentinel drills\ma2d\`: `ma2d-a.rvt` and `ma2d-26.rvt` (the B35 seed), `ma2d-ma0.rvt` (the MA-0 seed central
`ma0-seed-central-0848.rvt.bak`, opened detached, worksets discarded). None saved.

**The crowd** (S2, C3): `MA0 Interior - 100mm` present (MCP); GR-FFL's walls read with the MCP — the 24 × 12 m outline, partitions every
4 m, two 125 mm walls at y 6000, and template sample walls crossing the outline at y ≈ 2588 / 4672 / 7224 / 10296 (x 16.5–24 m). Rows
chosen at least ~500 mm clear of all of them: 1000, 1800, 3400, 4000, 5300, 6700, 8000, 8800, 9500, 11000. `crowd.json` 160 → changeset
`a0a2e40f` (#1610), the 160 creates ticked (UI Automation), Apply → `Applied 160 element(s) from "MA2d crowd seed".`

**Record before the first row:** `analyze_model_statistics` totalTypes 1702, door types 41, Walls 249 (89 + 160); Undo list top
`Sentinel AI changeset: MA2d crowd seed [a0a2e40f]`.

| Row | Result | Evidence |
|---|---|---|
| P-1 one storey, one window | `File 4 changeset(s)?`; `GR-FFL: 184 retype · 180 attach · 22 wall(s) sent to a person · DD now 0/200`; `LOD state now … 7 of 246 at DD (2%) · 230 below · 9 blocked` (#1614); `DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 6 with no source …` (GYPS_100 "30 min", 181 read; CMU_200 "60 min", 23 read); type gaps 5 groups, 8 elements. Filed `GR-FFL (1/2)` 200 (102 retype, 2 set_parameter, 96 attach) and `(2/2)` 170 (86 retype, 84 attach), `01-FFL` 40, `MA0 Roof` 1. ONE window `Sentinel — Review AI proposal: Promote (DD) · GR-FFL (2 changesets, one Undo)`: 406 rows = 370 + 36 sent to a person, 368 pre-ticked, the two type edits unticked; the row `type edit wall: BDS_INT_ARC_GYPS_100 mm · reaches 1 element(s) in the model now + 170 if this storey's retypes onto it are applied …` (170 = 88 + 82 across both parts, C11) — **pass**, with **F-MA2d-1** (the row's tooltip said "170 more that this changeset retypes onto it") | dialog and rows (UI Automation) |
| A-1 the storey applied | Both type edits ticked; Apply → ONE DD IDS dialog: 4 failing — Doors 2069756/2069757 (no Fire Rating source) and W 2051449/2051450 (the 125 mm gap walls); **no crowd or outline wall** (F11 gone within the storey); Go back reads `storey "Promote (DD) · GR-FFL" (2 changesets) is rolled back`. Place anyway → ONE result `Applied 370 element(s) from "Promote (DD) · GR-FFL (2 changesets, one Undo)".` with ONE `LOD state after … 187 of 246 at DD (76%)`. Ledger: #1624 `changeset_applied` (1/2) 200 + `values` GYPS_100 = 30 min, CMU_200 = 60 min; #1625 (2/2) 170; #1626 `lod_state` naming both ids. 184 wall retypes, 0 not in the catalogue. totalTypes 1702 after — **zero types created** — **pass**, with **F-MA2d-2** (the dialog's heading said "This changeset leaves 4 element(s)") | dialogs, rows, MCP |
| U-1 one Undo | Undo list before: top ONE `Sentinel AI changeset: Promote (DD) · GR-FFL [5a51f29e]` (UNSURE 1: the storey's name with the first part's id), the crowd's under it; one Undo → top is the crowd's. MCP GR-FFL: `MA0 Interior - 100mm` 170 (160 + 10 seed), `Generic - 200mm` 14; GYPS_100 Fire Rating empty (Type Properties); Doctor `Undo watcher: undo of changeset aa6d4f9c — changeset_reverted row posted (170 guid(s))` and `… 5a51f29e … (200 guid(s))`; #1627, #1628 — **pass** | Undo list, MCP, pane, rows |
| S-1 all or nothing | Pending 01-FFL and MA0 Roof withdrawn (D2 of MA2c); Promote → Yes → the storey's window again (`54fef822` 200 + `c5b965ac` 170). W 2069927 picked (its retype and attach only in `(2/2)`, C12); deleted (Select by ID — see D2 below); the storey reopened by Review AI Proposals (`4 proposals pending — reviewing the oldest first (Promote (DD) · GR-FFL (2 changesets, one Undo)).`); type edits ticked; Apply → `Transaction failed and was rolled back: changeset "Promote (DD) · GR-FFL (2/2)": wall 3fe083f7-…-001f95a7 is not in this model — re-run Promote`, `Reported as declined: 2 of 2 changeset(s).`, C2's `This storey carried 2 type edit(s) (BDS_INT_ARC_GYPS_100 mm, BDS_EXT_ARC_CMU_200 mm). Other storeys of the same run that retype onto those types will fail the DD IDS check …`, and `Run Promote (DD) again to plan this storey anew: it first opens any other Promote storey still waiting for review, and plans again once none is waiting.` #1642, #1643 declined. MCP: `MA0 Interior` 169, `Generic - 200mm` 14 — nothing of `(1/2)` kept; GYPS_100 Fire Rating empty. Promote → opened `01-FFL` first; untick all ▸ Apply → `Declined 1 of 1 changeset(s) — nothing in the model changed.` + the Run line (C6); `MA0 Roof` the same; Promote → plans again → No — **pass** | dialogs, rows, MCP |
| AST-1 plan-only | aster-tower local opened detached (worksets discarded; the local file unchanged): `Guideline: none — not installed for aster-tower or its office` / `No DD rule file is installed for "aster-tower" or its office — nothing to plan. Install one as guideline@n.` (C8: "not installed"); before and after: no proposed changeset, no `lod_state`, no `type_gap` row — **pass** | dialog, replies |
| G2-A, G2-B | Measured — the table below | — |
| R26-1 Revit 2026 | **owed**: the founder's OK named Revit 2024 only | — |
| F-MA2d-1, F-MA2d-2 run again | cef26db deployed (20:14); fresh `ma2d-a.rvt`, the crowd again (`8c144a90`), Promote → Yes: the tooltip `… (1 in the model now, 170 more that this storey retypes onto it)`; Apply → `This storey "Promote (DD) · GR-FFL" (2 changesets) leaves 4 element(s) failing the DD IDS made from lod_matrix@1 …`; Place anyway → the result line and both notes (#1690, #1691) start `This storey "Promote (DD) · GR-FFL" (2 changesets) leaves 4 element(s)` — **pass** | dialogs, rows |

**Gate G2's numbers** (F2, F3; the reviewer is the drill runner, Claude, as in G1; the window cannot change a row — said once):

| Model · storey | Rows filed | Sent to a person | Unticked (reason) | DD properties to a person | LOD before → after | Window → result |
|---|---|---|---|---|---|---|
| A · MA-0 seed · GR-FFL | 46 (24 retype, 2 type edits, 20 attach) | 28 | 0 | 6 types (6 elements) | 10% → 36% | ~1 min |
| A · MA-0 seed · 01-FFL | 38 (18 retype, 20 attach) | 2 (gap walls) | 0 | — | 36% → 62% | ~1 min |
| B · crowded B35 · GR-FFL | 370 in 2 changesets | 36 | 0 | 6 types (9 elements) | 2% → 76% | ~7 min (most of it my UI Automation reads and a misclick) |
| B · crowded B35 · 01-FFL | 40 (18 retype, 1 floor, 1 door, 20 attach) | 3 (2 gap walls, 1 structural floor) | 0 | — | 75% → 83% | ~1.5–2 min |

G1's baseline on the MA-0 seed: 25 unticks on storey 1, about 2 min 20 s. Every row of both models was a catalogue type the rules name or
an attach to the next story, so nothing was unticked; what a person must still do is the "sent to a person" column (gap types, walls
whose base offset an attach would move, non-basic walls, structural floors) and the DD properties with no source. Revit's warnings were not
counted. The G2 decision is the founder's (F4; recommended default: continue — MA-3, then MA-4).

**Drill amendments:**
- **D1** — the `.rvt` file association is Revit 2027's version selector: it hands the file to Revit 2024 but drops it, so 2024 opens on
  its Home page. Open the scratch copies from Revit's Open dialog or Recent.
- **D2** — Select by ID is greyed while the focus is in the Project Browser (not because of the modeless review window). S-1 closed the
  window (nothing is reported; the storey stays proposed), clicked the view, selected and deleted the wall, and reopened the storey with
  Review AI Proposals — the same test: a part's target missing at Apply.
- **D3** — the drill driver's lesson: a pop-up of another application (McAfee's "Antivirus protection expired", Renew / Uninstall — the
  founder's choice) dims the screen and takes every click; Revit's TaskDialog buttons offer no UI Automation Invoke, so the drill waits
  for the founder to close it.

**Found in the drill:** F-MA2d-1 and F-MA2d-2 (cef26db, minor, words; run again live — pass).

**Notes:**
- A rolled-back or undone Promote changeset keeps its status `applied` on the bridge with a `changeset_reverted` row (as since the
  changesets' first build).
- `analyze_model_statistics` counts 57 families before A-1 and 56 after (families in use after the door swaps); types 1702 both times.
- Driving slips: a Place anyway click mis-scaled once; the first Undo attempt toggled the Undo list shut and hit the Precast tab;
  Promote's dialog on the MA-0 seed was narrower, so the first Yes missed; the AST-1 notice and the Promote dialog were closed through UI
  Automation where clicks did not land.

**Owed** (not passed): R26-1 (Revit 2026) and a Revit 2027 row; a second account approving a batch (MA2 row 7); the signed-out actor;
W-1 (the web Holding Area) and the Next strip; a window U-value; a real office matrix (LM-1); a real concept model for G2 (F2); the G2
decision (F4); DAT-3, ANV-1, ANV-2 (MA-2e).

**Closing list:** Revit closed without saving any scratch copy or the detached aster-tower copy; sign-in left as found (signed in); the
test bridge stopped; the add-in's bridge settings restored (sha256 `366a193f4680…` = the backup's), the backup deleted;
`%AppData%\Sentinel\cache\ma2d` and `ma2d-ma0` deleted. The branch build cef26db stays on Revit 2024 until the merge's deploy. Left on the
test ledger (scratch keys, on purpose): `ma2d-office` #1598–#1606, `ma2d` #1599–#1692 (nine `lod_state`, five `type_gap` runs, the
crowds, the storeys applied, undone, declined, withdrawn), `ma2d-ma0` #1600–#1674, `ma2d-26` #1601–#1609 (created, membership). Left on
this PC: the scratch copies and the drill's files in `Documents\Sentinel drills\ma2d\` (evidence; never committed).

## Session MA2e — storey plans and datums, live (2026-10-04 ~01:09 → 01:40 local, branch feature/ma2e-storey-plans 6f2a4f9, Claude driving Revit 2024)

Setup: the branch build 6f2a4f9 deployed to Revit 2024 at 01:09 on the founder's explicit ask ("deploy the ma2e branch to 2024"; DLL
`39b975d2fa0…`; before it, master 5e249da's `0c7e2aa2826…`). The add-in's bridge settings backed up and pointed at the test bridge
127.0.0.1:4101. Scratch office `ma2e-office` (`guideline@1` = `bds-guideline.json`, `fc26449bdbe3…`; `ruleset@1` `0261a98155f0…`);
projects `ma2e`; `ma2e-ast` with its own `guideline@1` (`guideline-ast.json`: `tokens` on GA Plan and RCP, `3c3649caf1be…`) and
`ruleset@1` (`ruleset-AST.json`, `fa4f893dbf37…`); `ma2e-colon` with its own `guideline@1` (GA Plan's prefix `F:P`, `9623564da693…`).
Every PUT answered 201 (the bridge stores `tokens`). **Signed in**; the account lead on all four. Scratch copies `ma2e-a/b/c.rvt` of the
B35 seed, opened from Revit's Open dialog, bound with Project Setup (current-project scope, UI Automation), never saved; Scan Now run
after each binding (F4).

**Record before the first row** (`ma2e-a.rvt`): Scan Now 86.7 %, 420 elements; VN-01 rows 6 (Levels, Grids, 01_SSL, GR_SSL,
Starting_View, Drafting 1); Change Requests `0 pending`; Undo list `Sentinel: Save project settings` only. Building Story and pins read
from the preview, not by mouse (D1): all 5 levels are Building Story and unpinned; the seed's 14 grids are already pinned (UNSURE 2).

| Row | Result | Evidence |
|---|---|---|
| V-1 | Preview `Sentinel — Annotate: views and pins`: `Guideline: guideline@1 · office · fc26449bdbe3…`, `View names are checked against VN-01 (ruleset ruleset@1 · office · 0261a98155f0…) — Scan Now's own rule.`, the B31 line `Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list "Sentinel: Annotate views", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.`, `10 of 30 creatable view(s) and 5 of 5 datum(s) to pin are ticked.` Per level (GR_SSL, GR-FFL, 01_SSL, 01-FFL, MA0 Roof) `WIP_FP_<L>` and `WIP_RCP_<L>` ticked (`MA0 Roof` → `WIP_FP_MA0-ROOF`), PP/BUA/QA/END unticked, `Presentation Plan (no colour)` greyed `same name as 'Presentation Plan' on <L>`; Pin group `5 unpinned level(s) and grid(s)` all ticked. Create → `Created: 10 view(s). Pinned: 5 level(s) and 0 grid(s).`, `Pinned now: 5/5 story level(s), 0/0 other level(s), 14/14 grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).`, `Not created, as the preview said: 0 already in the model, 5 refused with a reason.`, `Not routed in the Project Browser: 10 view(s) — no writable BDS_View Status / View_Group / BDS_Discipline / View Group parameter.`, the B31 line; no Failed block, no "did not keep" line. Undo list top `Sentinel: Annotate views` (UNSURE 1: kept in a model that is not workshared). Ledger #1706 `Annotate created 10 view(s) and pinned 5 datum(s) across 5 level(s)`: `views_created` 10, `pinned_levels` 5, `pinned_grids` 0, `views` the 10 names, `pinned_ids` 5, `pinned_now` the dialog's line, `undo_group_kept` true, `ruleset` `ruleset@1 · office · 0261a98155f0…`, `story_levels` 5, actor the account. Scan Now after: 87.3 %, 440 elements, the same 6 VN-01 rows — none names a created view (ANV-1, closes F44); Change Requests `0 pending` (UNSURE 4) — **pass** | preview and result (UI Automation), Undo list, row, Scan Now |
| V-1R | Annotate again: `0 of 20 creatable view(s) and 0 of 0 datum(s) to pin are ticked.`; V-1's 10 rows greyed `already in the model (a view or a view template holds this name)`; `Pin — 0 unpinned level(s) and grid(s)`; Cancel → Undo list unchanged — **pass** | preview |
| U-1 | One Undo (the list's top entry) → the list ends at `Sentinel: Save project settings`; Annotate: `10 of 30 creatable view(s) and 5 of 5 datum(s) to pin are ticked.`, none "already in the model", `Pin — 5 unpinned level(s)` — one Undo took every view and pin of V-1 back; Cancel — **pass** | Undo list, preview |
| V-2 | `ma2e-b.rvt` → `ma2e-ast` (Scan Now 53.1 %). First preview: `View names are checked against VN-01 (ruleset ruleset@1 · project · fa4f893dbf37…)`; `0 of 0 creatable view(s)`; every GA Plan and RCP row `LEVEL '<level>' does not pass L\d{2}\|LRF\|XX (VN-01) — the level's name is used as it is: rename the level, or give the entry another LEVEL`; every fixed name `'WIP_PP_GR_SSL' does not pass VN-01: View 'WIP_PP_GR_SSL' does not match [DISCIPLINE]_[LEVEL]_[TYPE]_[DESCRIPTION].` (35 refusals); Cancel. Level `GR-FFL` (id 30) renamed `L00` (Select by ID, Properties ▸ Name, Apply; no "rename views?" prompt — no view held its name). Second: `2 of 2 creatable view(s)`, `ARC_L00_PLAN_GA` and `ARC_L00_RCP_Ceiling` ticked; Create → `Created: 2 view(s). Pinned: 5 level(s) and 0 grid(s).` Scan Now (all 387 rows read): 70 VN-01 rows, none names either view; both appear only under VP-01 (a parameter rule, warn: no view-status/discipline parameter — the result's "Not routed" line); Change Requests `0 pending` — **pass** | previews, result, Scan Now |
| V-3 | `ma2e-c.rvt` → `ma2e-colon`: `5 of 25 creatable view(s)`; each GA Plan row greyed `'WIP_F:P_<L>' holds ':', which Revit does not allow in a view name` (5); each `WIP_RCP_<L>` ticked; Create → `Created: 5 view(s). Pinned: 5 level(s) and 0 grid(s).`, `… 0 already in the model, 10 refused with a reason.`; no Failed block (ANV-2) — **pass** | preview, result |

**Drill amendments:**
- **D1** — each level's Building Story and pin, and each grid's pin, are read from Annotate's own preview (the story groups and the Pin
  group), not by mouse; the seed has no level that is not a Building Story, so that branch was not exercised (UNSURE 2: all five are).
- **D2** — the pane's grid virtualizes: a read sees only the rows on screen. A full Scan Now check reads every row through UI
  Automation's ScrollPattern in steps smaller than one screen (V-2: 387 rows).
- **D3** — the community MCP must be switched on again after each Revit start (Add-Ins ▸ Revit MCP Switch).

**Found in the drill:** nothing.

**Owed** (not passed): Revit 2025/2026/2027; the signed-out actor; a view that throws inside its SubTransaction (UNSURE 6); F7 (an owned
or out-of-date datum) and pinning in a workshared copy (UNSURE 7); a level that is not a Building Story; a real MH-LNK-01 rule and
links; `token_aliases` as a LEVEL source.

**Closing list:** Revit closed without saving any copy; sign-in left as found (signed in); the test bridge stopped; the add-in's bridge
settings restored (sha256 `366a193f4680…` = the backup's), the backup deleted; `%AppData%\Sentinel\cache\ma2e`, `ma2e-ast`, `ma2e-colon`
deleted. The branch build stays on Revit 2024 until the merge's deploy. Left on the test ledger (scratch keys, on purpose): `ma2e-office`
#1693–#1702, `ma2e` #1694–#1706, `ma2e-ast` #1695–#1707, `ma2e-colon` #1696–#1708 (artefacts, memberships, three `annotate` rows). Left
on this PC: the scratch copies and the drill's files in `Documents\Sentinel drills\ma2e\` (evidence; never committed).

## Session MA3a — the binding web decline, live (2026-10-04 ~08:24 → 12:13 local, branch feature/ma3-review-desk 1289c5e → b45c3fb → fdc739d, Claude driving Revit 2024, the founder on the desk)

Setup: the branch build 1289c5e deployed to Revit 2024 at 08:24 on the founder's explicit ask ("deploy the ma3a branch to 2024"; DLL
`5aab0bfd242…`; before it, master 57b6295's `61aa8296ef9…`). The add-in's bridge settings backed up and pointed at the test bridge
127.0.0.1:4101 (the branch's code). Scratch office `ma3a-office` (`guideline@1` `5ac547ca…`, `type_catalog@1` `a1c0436f…`,
`lod_matrix@1` `cb47a6d0…`, `ruleset@1` `0261a981…`); project `ma3a` in it; the founder's account a `contributor` (one account — D2).
Scratch copy `ma3a-a.rvt` of the B35 seed, opened from Revit's Open dialog, bound with Project Setup (UI Automation), never saved.
**Revit signed in** (the founder). **The desk:** the plan's port 4002 could not be used (D-A1) — the founder's own `thatopen serve` on
4000 served the branch's bundle and the founder restarted the 4100 bridge on the branch's code at 11:12; Revit stayed on 4101; both
bridges write the same ledger.

| Row | Result | Evidence |
|---|---|---|
| D-1 | Undo list `Sentinel: Save project settings`; Promote (DD) → `File 3 changeset(s)?` → **Yes** → the review window `Promote (DD) · GR-FFL` (pre-ticked: signed in) → closed with × → the Undo list unchanged. GET proposed: `edc79d7e` `Promote (DD) · GR-FFL` `"review_rev":0`, 48 elements (28 retype, 20 attach), none with `review`; `ece14b55` 01-FFL (40), `ae4741d5` MA0 Roof (1); ledger #1719, #1721, #1723 `changeset_proposed` — **pass** | window, Undo list, GET, rows |
| D-5 | The machine credential: `POST …/review` → `403 accepting or declining a ghost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)`; `POST …/reopen` → `403 re-opening a declined ghost on the web desk is a signed-in person's — sign in (…)`; GET still `"review_rev":0`, no `review`; the audit only the three `changeset_proposed` rows — **pass** | replies, GET, audit |
| D-2 | The founder on the desk (BIM tools ▸ Review): `Review desk · ma3a` `your role: contributor`; no Re-open button on any row; ticked W 1747982 and W 1747984 (two, not three — the founder's ticks; W 1747983 stayed `waiting — nobody decided on the web`), reason `drill MA3a: wrong type`, **Decline ticked** → `2 declined · ledger #1725 — Revit now shows them unticked with the reason and refuses the tick.`; each row `declined by <founder> (contributor): drill MA3a: wrong type — binds: Revit shows it unticked and refuses the tick`. GET: `"review_rev":1`, both `review` `{state declined, action decline, role contributor, rev 1, reason}`; #1725 `changeset_reviewed` (actor the founder, role contributor, decisions `proposed → declined` with the ghosts' names, `review_rev` 1) — **pass** | desk, GET, row |
| D-3 | Review AI Proposals: header `⚠ 2 ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here (a lead may re-open one on the web desk). Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided.`; the two rows `declined on the web by <founder> (contributor): drill MA3a: wrong type · a lead may re-open it on the web desk · retype wall: W 1747982 …`; 86 boxes: 46 on, 40 disabled (38 sent to a person + 2 declined); **Tick suggested** and a click on a declined box left both unticked. **The late decline (run 3, the founder driving — D-A3):** the window opened first, headed `⚠ 4 ghost(s) declined on the web` (it predates the decline); on the desk attach W 2051433 declined at 09:56:28Z, reason `drill MA3a: late 3` (#1728, rev 4); back in that window, **Apply ticked in Revit** → ONE dialog `1 ticked ghost(s) were declined on the web after this window opened:` / `· attach wall "W 2051433" — declined on the web by <founder> (contributor): drill MA3a: late 3 · a lead may re-open it on the web desk` / `Nothing was created. Run Review AI Proposals again: they open unticked, with the reason.` GET: `"status":"proposed"`, `"review_rev":4`, `"result":null`; no `changeset_applied` row; the Undo list read after D-4 holds one Sentinel entry (D-4's) above `Sentinel: Save project settings` — nothing was created — **pass** | window, dialog, GET, audit, Undo list |
| D-4 | One account (D2): `PATCH cde/ma3a/members/298456a9-… {"role":"lead"}` → `200 {"user_id":"298456a9-…","role":"lead"}`; desk ↻ Refresh → `your role: lead`, a **Re-open** button on each declined row; reason `drill MA3a: re-opened` ▸ Re-open on W 1747982 → `Re-opened · ledger #1730 — Revit may tick it again.`; #1730 `changeset_reopened` (old `{state declined, review_rev 4}`, new: the lead, role lead, the ghost's name, the reason, `review_rev` 5, `declined_by` the founder, `declined_reason` `drill MA3a: wrong type`). Review AI Proposals: header `⚠ 4 ghost(s) declined on the web …`; W 1747982 enabled and pre-ticked, `re-opened on the web by <founder> (lead): drill MA3a: re-opened`; W 1747984 still declined, unticked, disabled. **Apply ticked in Revit** → the DD IDS check → **Place anyway** → `Applied 44 element(s) from "Promote (DD) · GR-FFL". 4 of 4 unticked element(s) reported as rejected.`, the DD IDS line (27 failing, placed anyway, `W 1747982 (Walls · DD): missing Pset_WallCommon.FireRating; … and 22 more`), `LOD state after …: DD → design: 9 of 86 at DD (10%) · 68 below · 9 blocked · 0 not measured · 101 on other office types, not counted`. GET: `"status":"partially_applied"`, `result.applied` 44, `rejected` 4, `declined_on_web` the four still declined with the web's reasons (W 1747984 `wrong type`; W 2051431/2/3 `late`, `late 2`, `late 3`), `review_rev_seen` `{"value":5,"claimed":true}`, `applied_over_late_decline` `[]`, `applied_over_decline_unchecked` `[]`; #1731 `changeset_applied` (actor the founder, `partially_applied`, 44 applied, 4 rejected, `declined_on_web` 4). Undo list top `Sentinel AI changeset: Promote (DD) · GR-FFL [edc79d7e]` — **pass** (the two-account half **owed**) | desk, window, dialogs, GET, rows, Undo list |

**Drill amendments:**
- **D-A1** — the desk on port 4002 could not run: the platform's local-app route loads only `:4000`, and `thatopen serve` injects no
  `import.meta.env`, so the bundle's bridge is always `http://localhost:4100` (`config.ts`); both serve processes write the same
  `WebApp/dist/bundle.js`. The desk ran on the founder's 4000 serve against the founder's 4100 bridge, restarted on the branch's code
  (the founder's `tools/bridge-start.cmd`); Revit stayed on 4101. UNSURE 1–2 settled; UNSURE 4 moot (a restart, not a dynamic import).
- **D-A2** — after a branch switch the local app is reloaded (Ctrl+Shift+R, then Get started): the founder's first view still showed
  the Model tab from an older bundle.
- **D-A3** — the late decline needs the window to predate the decline, proven by its header count read before the decline; the founder
  drives that run (a script cannot take focus from Chrome, and Revit's owned review window hides from UI Automation while Revit is in
  the background — a hidden window looked closed). Runs 1 and 2 did not prove the order: run 1's Apply (09:38) went to a window opened
  after its decline (headed `3 ghost(s) declined`; the row was locked, so Apply rightly reached the DD IDS check — Go back, nothing
  placed); run 2's order was not recorded (DD IDS check — Go back). An offline probe (the live GET of `edc79d7e`, the add-in's own DTOs
  and `ChangesetTrust.DeclinedTicked`) refused, naming all four, and the deployed DLL carried the refusal; run 3 proved it live.
- **D-A4** — D-2 declined two retypes, not three, so the headers counted 2, then 3 and 4 (the late attaches of runs 1–3).
- **D-A5** — the founder asked mid-drill for a refresh on the desk: **↻ Refresh** (b45c3fb — re-reads the changesets and the role; a
  source-scan check in `review-desk.test.ts`), used in run 3 and D-4.

**Found in the drill:**
- **F-MA3a-1 (pre-existing, bridge)** — a contributor opening a never-opened project read `Project state not read — Internal error`:
  `getProjectMeta` PATCHes the empty metadata as the caller; RLS refuses a contributor's write and answers no row; the read crashed (500).
  Worked round in the drill (the machine credential's GET wrote the default metadata). Fixed in fdc739d (the read returns the default
  details; the next lead or owner read writes them; check in `cde-store-gate.test.mjs`). Live re-run **owed** (the founder's 4100 bridge
  picks it up on its restart after the merge).

**Owed** (not passed): D-4's two-account half (a second account re-opens what the first declined); D-2's third decline; Revit
2025/2026/2027; the published app (the founder's publish, after migration 0037); migration 0037 applied and its probe (the founder's
"apply"); a late decline applied over (`applied_over_late_decline`, F2 A) live; Ghost Builder's own build and a result with no
`review_rev` live; F-MA3a-1 live; UNSURE 3 (a disabled row's tooltip) not observed.

**Closing list:** Revit closed without saving (`Do you want to save changes to ma3a-a.rvt?` → No); sign-in left as found (signed in);
the 4002 desk server stopped (unused); the founder's 4000 server untouched; the test bridge stopped; the add-in's bridge settings restored
(sha256 `366a193f468…` = the backup's), the backup deleted; `%AppData%\Sentinel\cache\ma3a` deleted. The branch build stays on Revit
2024 until the merge's deploy. Left on the shared ledger (scratch keys, on purpose): `ma3a-office` (`guideline@1`, `type_catalog@1`,
`lod_matrix@1`, `ruleset@1`), the project `ma3a`, the founder's membership (made lead in D-4), the changesets `edc79d7e`
(`partially_applied`), `ece14b55` and `ae4741d5` (proposed), rows #1719–#1731. Left on this PC: the scratch copy in
`Documents\Sentinel drills\ma3a\` (evidence; never committed). The founder's 4100 bridge runs the branch's code from 11:12 (before
fdc739d) — restarted on master after the merge.

## Session MA3a-live — the owed rows after the merge (2026-10-04 ~12:30 → 13:45 local, master f44b7fb → fed78cb, Claude driving Revit 2025, 2026 and 2027, the founder on the published app 1.0.41)

Setup: master's add-in deployed to Revit 2021–2027 at 12:16; the founder's 4100 bridge restarted on master at 12:18 (with F-MA3a-1's
fix); migration 0037 applied at 12:20; web 1.0.41 published at 12:27. No test bridge: Revit used its own settings (the Funnel address,
the founder's 4100 bridge). Scratch projects through 4100 with the machine credential: `ma3a-f1` (no office; the founder a
`contributor`) and `live-25`, `live-26`, `live-27` in `ma3a-office` (the founder a `contributor`; the founder's second account `lead` on
`live-25`); the e-mails were read from where they already were and never printed. Scratch copies `live-25/26/27.rvt` of the B35 seed,
upgraded on open (0 errors, 12 family warnings each), bound with Project Setup (UI Automation), never saved. Revit 2026 and 2027 asked
about the unsigned add-in: **Load Once** (no standing change). Revit signed in as the founder in every version.

| Row | Result | Evidence |
|---|---|---|
| F-MA3a-1 live | `ma3a-f1` created with empty metadata; the founder (contributor) opened it in the published app: it loaded (no `Internal error`); its metadata stayed `{}` (the read wrote nothing). `live-25`'s metadata was written at 10:40:07Z when the second account (lead) first opened it — the next lead read writes the defaults — **pass** | the founder's word, SQL |
| D-4 two accounts (Revit 2025) | The founder (contributor) declined W 1747982, W 1747984 and attach W 2051431 (`live 2025`, #1751); the second account (lead) re-opened W 1747982 (`live 2025: re-opened by the second account`, #1752 — the ledger's actor is the second account, `declined_by` the founder, role lead). Revit 2025's review: `⚠ 2 ghost(s) declined on the web`; W 1747982 `re-opened on the web by <second account> (lead): …` ticked; the two others `declined on the web by <founder> (contributor): live 2025 …` locked; 86 boxes, 46 on, 40 disabled. Apply (after the late row below) → DD IDS → Place anyway → `Applied 44 element(s) …`, `4 of 4 unticked element(s) reported as rejected.`; GET: `partially_applied`, applied 44 (W 1747982 among them), `declined_on_web` four with each account's role and reason, `review_rev_seen` `{"value":4,"claimed":true}`, no late or unchecked decline — **pass** | desk, window (UI Automation), dialogs, GET, rows |
| D-3 Revit 2025 | Window opened 10:57Z (`⚠ 3 ghost(s) declined`); the second account declined attach W 2051433 at 11:02:39Z (`live 2025: late 2`); Apply in that window → `1 ticked ghost(s) were declined on the web after this window opened: · attach wall "W 2051433" — declined on the web by <second account> (lead): live 2025: late 2 … Nothing was created.`; the Undo list only `Sentinel: Save project settings` — **pass** | dialog, Undo list |
| D-2 + D-3 Revit 2026 | Promote filed 3 changesets; the window open before the founder declined W 1747982 and attach W 2051431 (`live-26`, #1775); Apply (UI Automation) → `2 ticked ghost(s) were declined on the web after this window opened: …` `Nothing was created.`; Review again: `⚠ 2 ghost(s) declined on the web`, both rows `declined on the web by <founder> (contributor): live-26 …` locked; 86 / 46 / 40; GET `proposed`, result null — **pass** | dialog, window, GET, rows |
| D-2 + D-3 Revit 2027 | The same on `live-27` (#1776): `2 ticked ghost(s) were declined on the web after this window opened: …` `Nothing was created.`; Review again: `⚠ 2 ghost(s) declined on the web`, both rows locked; 86 / 46 / 40; GET `proposed`, result null — **pass** | dialog, window, GET, rows |

**Notes:**
- Twice the review window was closed and re-opened by the founder between steps (the founder's word); that, not the add-in, explains
  MA3a's run 1 and this session's first window. A deactivation test (Revit losing and regaining focus) left the window open.
- Revit 2027's quick-access toolbar sits a few pixels left of 2024's: a click meant for the Undo list's arrow pressed **Undo**, taking
  back `Sentinel: Save project settings` (the binding fell back to the seed's `ma1-bds`; Review then read a 404 for it). Ctrl+Y redid it.
  The refusal had come first, and one Undo emptied the list: the refused Apply had created nothing. Driving tip: read Revit 2027's Undo
  state from the greyed arrows, or locate the arrow by zoom first.
- UI Automation reached Revit 2026's review window while Revit 2027 was in front, and its Apply invoked through it.

**Still owed:** a late decline applied over (`applied_over_late_decline`) live; Ghost Builder's build and a result with no `review_rev`
live; the Apply path on Revit 2026 and 2027 (their rows refused or were left proposed on purpose).

**Closing list:** Revit 2025, 2026 and 2027 closed without saving; `%AppData%\Sentinel\cache\live-25`, `live-26`, `live-27` deleted (no
`ma3a-f1` cache was made); the add-in's settings untouched. Left on the shared ledger (scratch keys, on purpose): `ma3a-f1`, `live-25`
(changeset `partially_applied`), `live-26` and `live-27` (proposed), their memberships, rows #1745–#1776. Left on this PC: the scratch
copies in `Documents\Sentinel drills\live\` (evidence; never committed).

## Session MA3b — the Revit review that does not wait, live (2026-10-04 ~14:21 → 14:38 local, branch feature/ma3b-revit-desk 1d16b29, Claude driving Revit 2024)

Setup: the branch build 1d16b29 (with the review's fixes C8–C16) deployed to Revit 2024 at 14:21 on the founder's explicit ask ("deploy
the ma3b branch to 2024"; DLL `aa3ac5b63c9a…`; before it, master's `346496560189…`). The add-in's bridge settings backed up and pointed
at the test bridge 127.0.0.1:4101 (the branch's code). Scratch office `ma3b-office` (guideline, type_catalog, lod_matrix, ruleset — each
201) and project `ma3b`; the founder's account a `contributor` (the e-mail read from an existing membership, never printed). Scratch
copies `ma3b-a.rvt` and `ma3b-b.rvt` of the B35 seed, opened from Revit's Open dialog, bound with Project Setup (UI Automation), never
saved. Revit signed in.

| Row | Result | Evidence |
|---|---|---|
| R-1 | Promote (DD) → Yes → the review window (closed with ×). Review AI Proposals: the picker `Sentinel — AI proposals waiting: ma3b`, `3 waiting for review on "ma3b", oldest first — pick one and press Review.`, three lines (`Promote (DD) · GR-FFL — promote (claimed) · just now · 48 ghost(s): 0 accepted, 0 rejected, 48 recorded`, 01-FFL 40, MA0 Roof 1); no "oldest first" dialog. GR-FFL ▸ Review: groups by what they do (`retype wall (24) · 24 ticked` first), `Apply 48 ticked in Revit`; **Untick group** → `retype wall (24) · 0 ticked`, `Apply 24 ticked in Revit`; **Tick group** → 24 and 48 again — **pass** (R-A1: the seed's groups are retype wall 24 and others, not the plan's 28/20) | picker, window |
| R-2 | Apply 48 → the DD IDS check (28 failing) → the test bridge stopped → Place anyway. The silent port failed to start (R-A2), so the first report was refused at once: `Applied 48 element(s) from "Promote (DD) · GR-FFL".` … `LOD state after: not sent — the bridge took no changeset of this Apply (a result reported later sends none).`, **Retry report** shown; one file `5335521a-….json` (8 093 bytes) in `%AppData%\Sentinel\unreported\ma3b\`. With the silent port up: **Retry report** → `Checking the model, then reporting again…`; during the wait a click in the view selected an element and the Undo list read `Sentinel AI changeset: Promote (DD) · GR-FFL [5335521a]` above `Sentinel: Save project settings` (Revit answered); still waiting at 69 s, and by 131 s: `Sent again: 0 of 1 result(s) reported.` / `"Promote (DD) · GR-FFL": not reported: the bridge did not answer within 120 s` / `The result is kept on this PC and sent again by Retry report or the next Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.` After ×, the next Review AI Proposals sent it again by itself (`Checking this model and sending 1 result(s) it applied that the bridge has not taken (the bridge has up to two minutes to answer)…`, then the same kept words) — **pass**; the report's own hold (× during a Retry, the ribbon answering busy, the words as a TaskDialog) **owed** (a missed click) | window, picker, Undo list, the file |
| R-2b | `ma3b-b.rvt` opened and bound to `ma3b`; Review AI Proposals: `1 result(s) applied in another model wait on this PC for the bridge — close this list, open that model and run Review AI Proposals there:` / `"Promote (DD) · GR-FFL" in …\ma3b\ma3b-a.rvt. If that model is gone, check the changeset's status on the bridge, then delete …\unreported\ma3b\5335521a-….json.`; with the bridge back, the GR-FFL line carries `⚠ "Promote (DD) · GR-FFL" was applied in …ma3b-a.rvt (…) and the bridge has not taken its result yet — it is not opened for review again, so nothing is applied twice. …`; selecting it leaves **Review** disabled — **pass** | picker |
| R-3 | Back in `ma3b-a.rvt`, the bridge up: Review AI Proposals → `2 waiting for review on "ma3b" …` / `"Promote (DD) · GR-FFL": reported (ledger #1793).`; 01-FFL and MA0 Roof only; the record file gone; GET `applied`, applied 48, rejected 0, `review_rev_seen` `{"value":0,"claimed":true}`, no ledger on the doc — **pass** | picker, GET, folder |
| R-4 | 01-FFL ▸ Review ▸ Untick all: the button reads `Decline all (needs a reason)`; pressed with the note empty → at once `Nothing is ticked, so this declines every ghost — a decline needs a reason: type it in the note (it is recorded with the result), then press Decline all.`, the window open; with `drill MA3b: wrong storey` → `Declined 1 of 1 changeset(s) — nothing in the model changed.` / `Run Promote (DD) again …` / `"Promote (DD) · 01-FFL": reported (ledger #1794).` — **pass** | window |

**Drill amendments:** **R-A1** — the group counts are the seed's (retype wall 24 first), and all 48 were applied, not 28. **R-A2** — the
silent port must start only after the test bridge's port is free (it failed once with the port still held); the 120 s wait was measured
on **Retry report**, as the plan's fallback allows.

**Found in the drill:** the picker's first line when the bridge does not answer reads `Couldn't reach the bridge: A task was canceled.`
— true but technical (net48's words for the timeout); wording only, left for MA-3b2.

**Owed:** R-5 (a waiting result undone with Ctrl+Z); C8 live (an Undo during the report's wait → `changeset_reverted`); the report's
own hold (R-2's last step); Revit 2025–2027; the rows the plan named owed up front.

**Closing list:** Revit closed without saving either copy; the test bridge and the silent port stopped; the add-in's bridge settings
restored (sha256 `366a193f4680…` = the backup's), the backup deleted; `%AppData%\Sentinel\cache\ma3b` and `unreported\ma3b` deleted.
Left on the shared ledger (scratch keys): `ma3b-office`, `ma3b`, the membership, three changesets (GR-FFL applied, 01-FFL declined, MA0
Roof proposed), rows up to #1794. Left on this PC: the scratch copies in `Documents\Sentinel drills\ma3b\` (never committed).

## Session MA3b2 — a reason per declined ghost, zoom to row, plain bridge words, live (2026-10-04 ~16:38 → 16:48 local, branch feature/ma3b2-decline-reasons 143dd5f, Claude driving Revit 2024)

Setup: the branch build 143dd5f deployed to Revit 2024 on the founder's explicit ask ("deploy the ma3b2 branch to 2024"; DLL
`4b8f41e2f646…`; before it, master's `37b4413b29bb…`). The add-in's bridge settings backed up and pointed at 127.0.0.1:4101 — the drill
proxy in front of the test bridge on 4102 (the branch's code). Scratch office `ma3b2-office` (four artefacts, each 201), project `ma3b2`,
the founder a `contributor` (the e-mail never printed). Scratch copy `ma3b2-a.rvt` of the B35 seed, opened from Revit's Open dialog,
bound with Project Setup, never saved; Revit signed in. Promote filed GR-FFL (48), 01-FFL (40), MA0 Roof (1).

| Row | Result | Evidence |
|---|---|---|
| Z-1 | In the GR-FFL review, **Show** on the first `retype wall` row: with only a sheet open Revit first asked `There is no open view that shows any of the highlighted elements …` (OK); then the plan `WIP_GFA_GR_FFL` opened on the wall, the Properties palette read `Walls (1)`, and the grey line `Showing retype wall "W 1747982".` — **pass**. Show on a create (MA0 Roof) and on a type edit: **owed** (not run) | window, Properties, view |
| Z-2 | `retype wall` all ticked, reason `drill MA3b2: no row yet`, Apply → at once `The reason for "retype wall" has no unticked row to go with — untick the rows it is for, or clear it. Nothing was sent.` **Untick group**, Apply → DD IDS → **Go back** → `You went back at the DD IDS check — nothing was placed. …` / `Nothing was placed; the proposals are still pending — change the ticks or press Apply again.` (ticks and reason kept, Apply enabled). Reason `drill MA3b2: these stay as they are until the slab is set`, Apply → Place anyway → `Applied 24 element(s) …`, `24 of 24 unticked element(s) reported as rejected.` GET: `partially_applied`, applied 24, rejected 24, `result.reasons` 24 entries with that text; ledger #1811 `changeset_applied` carries `reasons` — **pass**. The tab-character refusal: **owed** (the keystroke moved focus; checked offline) | window, GET, row |
| Z-3 | Proxy silent: the picker reads `Couldn't reach the bridge:` / `the bridge did not answer within 8 s`. Proxy stopped: `Couldn't reach the bridge:` / `the connection failed — No connection could be made because the target machine actively refused it 127.0.0.1:4101` — **pass** | picker |
| Z-4 | 01-FFL ▸ Review ▸ Apply 40 → Place anyway with the proxy slow (95 s): the window read `Reporting to the bridge…`; **Ctrl+Z** once was taken (Redo active); window closed with ×; the ribbon's Review AI Proposals answered `A review window is open, or a result is still being reported to the bridge — finish or close the window, or wait for its report (two minutes at most), then run Review AI Proposals again.` (**the hold — pass**). When the report landed: ledger #1813 `changeset_applied`, then #1814 `changeset_reverted` `{op: undo, count: 40}` (**C8 live — pass**); no record left in `unreported\ma3b2\` | ribbon dialog, rows |

**Found in the drill:** **F-MA3b2-1** — with the window closed, the report's words did not appear as a TaskDialog (review C2 of MA-3b
expects one); the Doctor log line is written before it, so the words are not lost. Not fixed here; first item of the next slice.

**Owed:** Show on a create and on a type edit; the tab refusal live; F-MA3b2-1; MA3b's R-5; Revit 2025–2027; the rows named owed up front.

**Closing list:** Revit closed without saving; the proxy and the test bridge stopped, their two launch entries removed, the `slow` and
`silent` files gone; the add-in's bridge settings restored (sha256 `366a193f4680…`), the backup deleted;
`%AppData%\Sentinel\cache\ma3b2` and `unreported\ma3b2` deleted. Left on the shared ledger (scratch keys): `ma3b2-office`, `ma3b2`, the
membership, three changesets (GR-FFL partially applied, 01-FFL applied and reverted, MA0 Roof proposed), rows up to #1814. Left on this
PC: the scratch copy in `Documents\Sentinel drills\ma3b2\` (never committed).

## Session MA3b2b — Revit's reasons on the web desk, a closed window's result in a dialog, a lost-reply decline taken, live (2026-10-04 ~20:20 → 20:45 local, branch feature/ma3b2b-desk-reasons 54a8206, Claude driving Revit 2024, the founder's local app)

Setup: Revit 2024 first held master's build (`3f3bc454ba48…`, e411406) for R-0; then the branch build 54a8206 deployed on the founder's
explicit ask ("deploy the ma3b2b branch to 2024"; DLL `8f0a146aaf38…`). The add-in's settings backed up and pointed at 127.0.0.1:4101 —
the drill proxy (moods `slow`, `lose`) in front of the test bridge on 4102. Scratch office `ma3b2b-office`, project `ma3b2b`, the
founder's account a `contributor` (never printed). Scratch copy `ma3b2b-a.rvt` of the B35 seed, never saved; Revit signed in. Promote
filed GR-FFL (48), 01-FFL (40), MA0 Roof (1). The web rows on the founder's local app (port 4000, the 4100 bridge on master).

| Row | Result | Evidence |
|---|---|---|
| R-0 (master's build) | GR-FFL: Apply 48 → Place anyway with the proxy slow (95 s); the window closed with × while it read `Reporting to the bridge…`; Revit in front, nothing touched: **no dialog** by 128 s, none after a click either; the report landed (ledger #1832). F-MA3b2-1 reproduced on master's build. The Doctor log was not read — which candidate it was stays unread (not (e)) | screen, ledger |
| R-1 (the branch's build) | 01-FFL: `retype wall (18)` unticked, reason `<b>drill MA3b2b</b> stays as modelled`, Apply 22 → Place anyway (slow); window closed with ×; nothing touched. A TaskDialog `Sentinel — AI proposals` showed by itself: `Applied 22 element(s) from "Promote (DD) · 01-FFL".` … `18 of 18 unticked element(s) reported as rejected.` … `"Promote (DD) · 01-FFL": reported (ledger #1834).` `18 decline reason(s) recorded with it.` — **pass** | dialog |
| R-2 | MA0 Roof: Untick group, reason `drill MA3b2b R-2`, note `drill MA3b2b: the reply is lost`, Decline all with the proxy losing the reply: `Declined 0 of 1 changeset(s) — nothing in the model changed.` … `"Promote (DD) · MA0 Roof": not reported: the connection failed — The underlying connection was closed: The connection was closed unexpectedly.` `Nothing in the model changed; Retry report sends it again.` **Retry report** → `Sent again: 1 of 1 result(s) reported.` / `"Promote (DD) · MA0 Roof": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.` / `1 decline reason(s) recorded with it.` — **pass** | window |
| W-1 (the founder, local app, `ma3b2b`) | `Recently decided in Revit` / `3 report(s), newest first.`: `Promote (DD) · MA0 Roof — declined in Revit by <account> · 2026-10-04 18:36 UTC · 0 applied, 1 not applied · ledger #1836`; `Promote (DD) · 01-FFL — partially applied in Revit by <account> · 18:33 UTC · 22 applied, 18 not applied · ledger #1834`; `Promote (DD) · GR-FFL — applied in Revit by <account> · 18:27 UTC · 48 applied, 0 not applied · ledger #1832`; above it `Nothing waits for review in Revit on this project.` — **pass**. The opened rows (the `<b>` reason as characters) and Refresh (W-2): **owed** (vitest only) | the founder's screenshot |

**Notes:** after "Load Once" on the unsigned add-in prompt, Revit 2024's ribbon ignored mouse clicks on its tabs for the session; the
Sentinel tab was opened through UI Automation (Invoke on its Button).

**Owed:** the cause of F-MA3b2-1 (R-0's Doctor log unread); a report opened on the desk (`<b>` as text) and Refresh, live; the picker's
closed-window gap (Doctor line only); MA3b2's Show on a create and a type edit; Revit 2025–2027.

**Closing list:** Revit closed without saving; the proxy and the test bridge stopped and their launch entries removed; the add-in's
settings restored (sha256 `366a193f4680…`), the backup deleted; `%AppData%\Sentinel\cache\ma3b2b` deleted. Left on the shared ledger
(scratch keys): `ma3b2b-office`, `ma3b2b`, the membership, three changesets, rows up to #1836. Left on this PC: the scratch copy in
`Documents\Sentinel drills\ma3b2b\` (never committed).

## Session MA3b3 — a decline carried forward to a Promote re-run, stamped by the bridge, live (2026-10-04 ~22:05 → 22:55 local, branch feature/ma3b3-carried-decline cf2e92a, Claude driving Revit 2024, the founder on the local app)

Setup: the branch build cf2e92a deployed to Revit 2024 on the founder's explicit OK given ahead ("deploy the ma3b3 branch to 2024";
DLL `5cfaf3c07d3f…`; before it `6cb0446932ad…`). The add-in's settings backed up and pointed at the test bridge 127.0.0.1:4101 (the
branch's code). Scratch office `ma3b3-office` (four artefacts, each 201), projects `ma3b3` (the founder's account a **lead** — the e-mail
never printed) and `ma3b3-b1`. Scratch copy `ma3b3-a.rvt` of the B35 seed, opened from Revit's Open dialog, bound with Project Setup,
never saved; Revit signed in. W-1 on the founder's local app (port 4000, serving this checkout's bundle) against the founder's 4100
bridge — **R-A1:** the plan's port 4002 desk cannot load in the platform's local-app route (MA3a D-A1); both bridges share the store.

| Row | Result | Evidence |
|---|---|---|
| B-1 | The script on 4101 (machine credential): `A filed 201 carry null reviews 0`; `A reported 200 partially_applied reported_role service`; `B filed 201 carry {"carried":0,"no_reason":1,"creates":0,"unverified":1}`; `B W 1 review null · B W 2 review null · B W 3 review null`; ledger #1849 `changeset_proposed` holds `"carried":0`, `"carried_from":[]`, `"not_carried":{"creates":0,"no_reason":1,"unverified":1}`; `B withdrawn 200 withdrawn` — **pass** (review C1: the machine credential never makes a decline that carries) | script lines, row |
| R-1 | Promote (DD) → Yes; in its GR-FFL window: W 1747982 and W 1747983 unticked in `retype wall` with `drill MA3b3: these two stay as modelled`; one `attach wall` row (W 2051431) unticked with no reason (UI Automation Toggle); Apply 45 → DD IDS → Place anyway → `Applied 45 element(s) …` `3 of 3 unticked element(s) reported as rejected.` … `"Promote (DD) · GR-FFL": reported (ledger #1860).` `2 decline reason(s) recorded with it.` GET: `partially_applied`, `result.reasons` 2, `result.reported_role` `lead`. 01-FFL and MA0 Roof withdrawn (200, 200) — **pass** | window, GET |
| R-2 | Promote (DD) → Yes again; the GR-FFL window: `⚠ 2 ghost(s) declined (2 carried here by the bridge from an earlier changeset) — shown unticked with the reason; they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). … A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).`; `1 ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: the bridge cannot tell an unticked row from an element Revit removed or an Apply that rolled back. A reason in the group's box makes a decline carry.`; group `retype wall (2) · 0 ticked · 2 declined (2 carried)`, both rows `declined in Revit by <account> (lead) in "Promote (DD) · GR-FFL", carried here by the bridge: drill MA3b3: these two stay as modelled · a lead may re-open it on the web desk`, unticked and disabled (38 disabled = 36 sent to a person + 2 carried); `attach wall (1) · 1 ticked` (W 2051431 proposed again, undecided). Ledger #1867 `changeset_proposed` GR-FFL `carried 2`, `not_carried {"creates":0,"no_reason":1,"unverified":0}`, `carried_from` naming `a025c250…`. The wait from Yes to the window was not timed (C4: owed) — **pass** | window (UI Automation), row |
| W-1 (the founder) | `ma3b3` ▸ Review, role lead: the intro `… a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.`; under GR-FFL both carried ghosts `declined in Revit by <account> (lead) in "Promote (DD) · GR-FFL", carried here by the bridge: drill MA3b3: these two stay as modelled — binds: …`, ticks disabled, **Re-open** on each; W 2051431 `waiting — nobody decided on the web`. Re-open on W 1747982 with `drill MA3b3 W-1: retype it after all` → `Re-opened · ledger #1873 — Revit may tick it again.`, the row `re-opened by <account> (lead): drill MA3b3 W-1: retype it after all` — **pass** | the founder's screenshot |
| R-3 | Review AI Proposals: the picker's GR-FFL line ends `· 1 declined (1 carried)`; the window: `⚠ 1 ghost(s) declined (1 carried here by the bridge from an earlier changeset) …`, `retype wall (2) · 1 ticked · 1 declined (1 carried)`, W 1747982 `re-opened on the web by <account> (lead): drill MA3b3 W-1: retype it after all` ticked and enabled, W 1747983 still locked with its carried line. Apply 2 → DD IDS → Place anyway → `Applied 2 element(s) …` … `"Promote (DD) · GR-FFL": reported (ledger #1874).` — no 409. GET: `partially_applied`, applied 2, rejected 1, `result.declined_on_web` one entry, W 1747983, `carried_from` origin `revit` from `a025c250…` — **pass** | picker, window, GET |

**Drill amendments:** **R-A1** — W-1 on the founder's 4000 local app and 4100 bridge (master's code took the re-open of a carried decline
without a change), not a 4002 desk. **R-A2** — the `attach` row was unticked through UI Automation's Toggle (the review list virtualizes
and scrolls one row per wheel burst).

**Owed:** a second account (the carried row's "by" is the founder's own); a web-origin carry live (offline only); the R-2 wait timed
(C4); the opened desk report and Refresh live (MA3b2b); Revit 2025–2027; the earlier owed rows.

**Closing list:** Revit closed without saving; the test bridge stopped; the add-in's settings restored (sha256 `366a193f4680…`), the
backup deleted; `%AppData%\Sentinel\cache\ma3b3` deleted. Left on the shared ledger (scratch keys): `ma3b3-office`, `ma3b3`, `ma3b3-b1`,
the membership, the changesets and rows up to #1874. Left on this PC: the scratch copy in `Documents\Sentinel drills\ma3b3\`.

## Session MA3b4 — a report never lost, landing by itself when its model opens, live (2026-10-05 ~00:05 → 00:20 local, branch feature/ma3b4-nothing-waits 9bbe7b5, Claude driving Revit 2024)

Setup: the branch build 9bbe7b5 deployed to Revit 2024 on the founder's OK given ahead ("deploy the ma3b4 branch to 2024"; DLL
`0912d17efaa8…`; before it `bd44382ed135…`). The add-in's settings backed up and pointed at the drill's door on 127.0.0.1:4101, in front
of the test bridge on 4102 (this checkout's bridge code); the door answered the first `POST …/result` with a 503 and passed everything
else. The project `ma2a-ghost` (drill G-1's scratch project; the founder's account a contributor; nothing proposed; no
`unreported\ma2a-ghost` folder). Scratch copy `ma3b4-a.rvt` of the B35 seed, opened from Revit's Open dialog, bound with Project Setup to
`ma2a-ghost`, and **saved** (G3; Ctrl+S, no Save As prompt). Revit signed in. **R-A1:** the copy's Ghost source folder (Project Setup,
current-project scope) pointed at the repo's `demo\ghost-sample` so the chooser lists `sample-walls-ma2a.dxf` — it listed the founder's
test drawings before.

| Row | Result | Evidence |
|---|---|---|
| R-1 | Ghost Builder ▸ `sample-walls-ma2a.dxf` ▸ build proposal `Walls — 2 layer(s), 14 element(s)`. A-WALL-INT alone placed nothing (`gap: 100 mm wall on 'A-WALL-INT' — the guideline names no wall type for it (type_catalog@2 …); skipped. (×3)` — R-A2); A-WALL-EXT, GR-FFL ▸ Build → the summary with **no** Retry dialog before it: `Placed: 4` … `Ledger: reporting 1 changeset(s) to ma2a-ghost (source dwg: 998d6e65) off Revit's thread — the pane's Doctor log says what the bridge took. A result it does not take is kept on this PC and sent again by the next opening of this model or Review AI Proposals; that changeset is not opened for review until then, so nothing is applied twice. One Ctrl+Z undoes the whole build; changeset_reverted is posted for what the bridge holds.` Then a `Sentinel — AI proposals` dialog: `Ghost Builder — the report to the bridge: "Ghost Builder · sample-walls-ma2a · GR-FFL": not reported: Bridge 503: {"error":"drill MA3b4 proxy: the bridge is down (503)"}` / `The result is kept on this PC and sent again by the next opening of this model or Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.` (no "Retry report"); the same words in the Doctor log (`00:13:02  Ghost Builder — the report to the bridge: …`); the door's log `failed /changesets/ma2a-ghost/998d6e65…/result with 503 - the bridge never saw it`; `unreported\ma2a-ghost\998d6e65-….json`; GET `proposed`. The build's own rows: #1878 (`Ghost Builder — Recorded`), #1879 (receipt) — **pass** | summary, dialog, Doctor log, door log, file, GET |
| R-2 | Ctrl+S; File ▸ Close (no prompt); reopened from Revit's Open dialog, still signed in; the door's one failure spent. The Doctor log: `00:15:29  Review AI Proposals (on opening "ma3b4-a"): "Ghost Builder · sample-walls-ma2a · GR-FFL": reported (ledger #1880).`; **no** dialog (G1: nobody had to act); `unreported\ma2a-ghost\` empty; GET `applied`, `result.applied` 4, `result.reported_role` `contributor` (a person's, never the machine's — C1); ledger #1880 `changeset_applied` at the moment of opening — **pass** | Doctor log, folder, GET, row |
| R-3 (optional) | not run — **owed** | — |

**Owed:** R-3 (a model closed without saving reports nothing as applied); the open-time guard live; Ghost Builder's Decline path live;
the picker's closed-window gap live; Revit 2025–2027; MA-3b5 (Promote's own waits).

**Closing list:** Revit closed (the copy saved, as G3 intends — a scratch copy only); the door and the test bridge stopped and their
launch entries removed; the `fail` file deleted; the add-in's settings restored (sha256 `366a193f4680…`), the backup deleted;
`unreported\ma2a-ghost` (empty) and `cache\ma2a-ghost` deleted. Left on the shared ledger (a scratch key): on `ma2a-ghost` the Ghost
changeset (applied) and rows #1877–#1880. Left on this PC: the scratch copy in `Documents\Sentinel drills\ma3b4\` (saved; never committed).

## Session MA3b5 — Promote reads and files off Revit's thread, live (2026-10-05 ~02:15 → 02:36 local, branch feature/ma3b5-promote-no-wait b6a019f, Claude driving Revit 2024)

Setup: the branch build b6a019f deployed to Revit 2024 on the founder's OK given ahead ("MA-3b5 go, deploy the ma3b5 branch to 2024";
DLL `abfa3fe8cf46…`). The add-in's settings backed up and pointed at the drill's door on 127.0.0.1:4101, in front of the test bridge on
4102 (this checkout's bridge code); with `slowfile` beside it the door held the answer to the first `POST /changesets/<key>` 90 s (C2).
The project `ma3b5` (scratch). Two scratch copies of the B35 seed, `ma3b5-a.rvt` (bound to `ma3b5`, view `WIP_FP_GR_FFL`) and
`ma3b5-b.rvt`, open in one Revit; Revit signed in.

| Row | Result | Evidence |
|---|---|---|
| P-1 | Promote (DD) in `ma3b5-a` ▸ Yes (3 storeys). While the door held the filing: (a) Revit answered (selection, views) — before the door's `answered` line (C1); (b) Review AI Proposals → the Busy dialog naming Promote, no picker; (c) a second Promote → Busy at 02:30:23, before the door's `answered … 00:31:32Z` (02:31:32 local); (d) the review window opened by itself ≥ 90 s after Yes, with no click; (e) the Doctor log `Promote (DD): 3 of 3 changeset(s) filed (confirmed by the bridge)` and the receipt line through Revit's dispatcher (C1e, C8) — ledger #1891 (run 1), #1901 (run 2); GET exactly 3 `proposed` (`GR-FFL`, `01-FFL`, `MA0 Roof`). Run twice (the first three withdrawn between runs) — **pass** | dialogs, Doctor log, door log, GET |
| P-2 (first half: the plan hop's refusal, C9) | **not run — owed**: the door was restarted without `slowread`, so the read was not held and the 8 s switch did not happen. Per C9 it is recorded owed, not re-run. | — |
| P-2 (second half: the open hop's refusal and the release) | Promote (DD) in `ma3b5-a` ▸ Yes, then — in the same batch, mid-filing — a switch to `ma3b5-b`. When the filing landed (02:34:42): `Promote (DD): 3 of 3 changeset(s) filed (confirmed by the bridge) – the filing is done.`, the receipt `ledger #1915`, and a dialog in `ma3b5-b`: `Sentinel did not open the review of the changesets Promote filed: switch back to ma3b5-a — nothing was changed.` / `3 changeset(s) Promote filed wait for review — in "ma3b5-a", run Review AI Proposals (or Promote (DD): it opens a Promote storey waiting for review before it plans again).` (the same words in the Doctor log); nothing changed in `ma3b5-b`. Back in `ma3b5-a`, Promote (DD) → **no** Busy (the guard released), the Doctor log's reading line (`02:35:23 Promote (DD): reading the bridge …`), and the review window of the waiting storey `Promote (DD) · GR-FFL` opened (C10: the bridge's first) — **pass** | dialog, Doctor log, review window |

**Owed:** P-2's first half (the plan hop's refusal live, C9); Revit 2025–2027; the stall rule live (pure check §52); a filing that throws
(§52, §52b); MA-3b4's owed rows (R-3, the open-time guard live, Ghost Builder's decline path live). Noted: the Doctor log shows some
lines twice (seen before MA-3b5).

**Closing list:** both review windows closed without Apply; Revit closed without saving either copy; the door and the test bridge
stopped and their launch entries removed; `slowfile` deleted; the add-in's settings restored (sha256 `366a193f4680…`), the backup
deleted; `cache\ma3b5` deleted (no `unreported\ma3b5`). Left on the shared ledger (a scratch key): on `ma3b5` the last three Promote
changesets (proposed), the six earlier ones withdrawn, and their rows up to #1915.

## Session SEC1 — hardening slice 1 live (2026-10-05 ~03:20 → 03:30 and ~11:45 → 11:58 local, branch feature/sec1-hardening a3d155a, Claude driving the bridge, the database and the founder's local app)

Setup: the founder confirmed in chat that no other bridge uses this database (G3) and created the scratch project `sec1-smoke`
(their account its owner). The 4100 bridge was restarted on the branch a3d155a by Claude on the founder's word (the process that
listened on 4100 stopped, `npm run bcf:serve` started in its own window; the Funnel refresh left to the founder); `GET /health` →
`{"ok":true,"cde_configured":true}` (no `token` key, F7). The test bridge on 127.0.0.1:4101 runs the same checkout. The founder's
"apply 0038 when ready" covers D-1…D-3. The founder's own dev server on :4000 served the branch to the local app.

| Row | Result | Evidence |
|---|---|---|
| D-1 | part 0, read-only, just before the apply: 3 of 3 true (the snapshot rows fit the new key; `container_versions`' columns and triggers are the ones 0038 was written against) — **pass** | the rows |
| D-2 | `0038_bridge_role_rules` applied (~03:26 local), success, one transaction — **pass** | the answer |
| D-3 | part 1: 10 of 10 true; part 2: `PROBE 0038: 28 of 28 as expected.`; afterwards no probe project left (rolled back) — **pass** | the rows, the summary |
| D-4 | through 4101 on `sec1-smoke`, the machine credential: a BEP created (201), a section edited, commented, bound (200/201/200), shared and published (`{"version_no":1}`); a deliverable created (201) and updated (200 — the update needs `container_name` in its body, the route's own rule since before SEC-1); an issue created (201), closed, commented, given a viewpoint (200/201/201); a topic guid and a comment `viewpoint_guid` that are not UUIDs → `400 {"message":"a guid is a UUID (8-4-4-4-12 hex) — nothing was saved"}` each; an RFI raised and answered (201/200); a file with two versions (201 ×2), set live, renamed (200 ×2); a take-off (`element_count: 2`) read back as 2 rows. No 403, no 500 — **pass** | statuses, ledger #1919–#1934 |
| L-5 | the founder's local app, signed in as the founder (the platform session already in the founder's Chrome; no password typed), `sec1-smoke`: an RFI raised (`RFI-002`, survives the list's reload); a new BEP created and its first section edited (the text survives reopening); a comment posted on the published smoke BEP (💬 2). Each landed through the bridge's role check and the service key, recorded under the founder's account (ledger #1935 created, #1936 section_updated, #1937 comment_added; the RFI's author the founder's) — **pass**. The issue part is **owed**: the web's Issues panel raises an issue only from a selected model element (`sec1-smoke` holds no model) and shows no comment box | screenshots, ledger rows, the RFI row |
| L-6 | Project Files ▸ rename the wip file to a name holding double and single quotes, angle brackets and an ampersand: the list, the reopened rename box and the status line show the whole name as typed, as text — nothing cut, nothing added, no entity shown literally (C10); ledger #1938 `renamed` under the founder's account — **pass** | screenshot, ledger row |

**Owed:** a signed-in issue and its comment (needs a model in the project); a viewer's and a contributor's refusals live (a second
account; proven offline and by probe part 2); the office snapshot and scan signed in (Revit); a geometry attach live; a tokenless
start live (offline only); a rename refused live on a file holding a published version (F1; offline and probe B14); Revit's writes
through the restarted bridge. **Decisions taken (the reviewer's, defaults):** C19 — a lost race on a transition or publish answers
409 in words; a database check on a document's section shape is left to SEC-2 (the web escapes and validates it now).

**Closing list:** the test bridge on 4101 had already stopped; the 4100 bridge stays on the branch until master carries the same
code; `sec1-smoke` stays for the founder to delete (Settings ▸ Danger zone) — its rows stay on the ledger by design. Left on the
shared ledger: #1916–#1938 on `sec1-smoke`.

## Session SEC2 — hardening slice 2 live (2026-10-05 ~14:30 → 15:55 local, branch feature/sec2-hardening 6e955ce, Claude driving the bridge, the database and Revit 2024)

Setup: the founder's words, given ahead: "deploy the sec2 branch to 2024", "apply 0039 when ready", "publish the web app when ready
too", "restart the bridge urself too when needed"; during the drill (~14:40) a one-time exception to the standing rule for the
Revit MCP's code tool (the scratch model `sec2-drill.rvt` only, to store and read back its Sentinel settings) and "run npm ci". The
4100 bridge restarted by Claude on the branch (the process on 4100 stopped, `npm run bcf:serve` started in its own window), then
again after `npm ci` (the old `node_modules` renamed first, C5). The test bridge on 127.0.0.1:4101 runs the same checkout. The
scratch project `sec2-smoke` (the machine credential). The add-in built for Revit 2024 from the branch and deployed (DLL
`5cbfff1dc0c0…`); Revit 2024 opened by Claude, Load Once. The scratch model: a copy of an earlier drill's scratch model, saved as
`Documents\Sentinel drills\sec2\sec2-drill.rvt` and opened from Revit's Open dialog (a new project could not be saved under a typed
name from here).

| Row | Result | Evidence |
|---|---|---|
| B-1 | `npm ci` added the locked packages; `npm ls`: `@xmldom/xmldom@0.8.15`, `engine.io@6.6.11`, `socket.io-parser@4.2.7`, `mammoth@1.12.0`; `/health` → `{"ok":true,"cde_configured":true}`; `npm run build` passes on the new packages — **pass** | the lines |
| X-1 | a normal BEP .docx → `200` with a proposal (sections mapped) — before and after `npm ci` — **pass** | status, first words |
| X-2 | a file past the unpacked bound → `413 {"message":"this .docx unpacks to over 100 MB — nothing was read or saved; …"}`; `/health` still answers — **pass** | status, words |
| X-3 | a file past the part bound → `413 … holds over 2000 parts — nothing was read or saved …` — **pass** | status, words |
| X-4 | an image sent as a .docx → `400 … not a .docx the bridge reads (no zip directory) …` — **pass** | status, words |
| X-5 | a file past the text bound → `413 {"message":"this .docx holds over 8 MB of document text — nothing was read or saved; split the document"}`; `/health` still answers — **pass** | status, words |
| X-6 | another writer's .docx — **owed** (none at hand) | — |
| D-1 | part 0 (read-only): 4 of 4 true (also run earlier the same day, 4 of 4: F5's default holds) — **pass** | the rows |
| D-2 | `0039_value_checks` applied (~14:34 local), one transaction — **pass** | the answer |
| D-3 | part 1: 6 of 6 true; part 2: `PROBE 0039: 16 of 16 as expected.` — **pass** | the rows, the summary |
| M-1 | on `sec2-smoke`: a snapshot with an ISO currency `200`; a lower-case currency `400 {"message":"the project's snapshot: currency is three capital letters (an ISO 4217 code) — nothing was saved"}`; an unknown field `400 … 'owner' is not a snapshot field …`; the GET's snapshot `{health: 80, currency: "SAR"}`; a rename `200` with the key unchanged; a topic `201` (a UUID guid); a document `201` and its section `200`. No 500 — **pass** | statuses, ids |
| R-0 | the branch's add-in deployed to Revit 2024 (0 errors); the scratch model opened; READ answered its title, its path and the settings an older build had stored in it — **pass** | the lines |
| R-1 | the scratch model holding a share folder: Datum from Drawings, Ghost Builder and Photo Massing each show `This model's Project Setup names the folder "…", a network share. Sentinel reads a share only when this PC's own Sentinel config.json names it, or through a drive letter mapped on this PC. Nothing was read or sent.` and stop; no picker opened — **pass** | each dialog's text |
| R-2 | the scratch model holding a local folder and the six values a model no longer carries (a model address at a documentation-only network, scratch schema and library paths, the opt-in): Datum lists the drawing in the model's local folder; Ghost Builder opens its picker with no schema or library dialog and reads `Reading 1 sketch(es) with the vision model on this PC…`; Photo Massing reads `Reading the project images with the vision model on this PC…` and returns its estimate for review; Revit's connections during the runs: this PC's model (127.0.0.1:11434) only, none to the documentation address; nothing built (both cancelled) — **pass** | progress lines, the connection list |
| R-3 | Project Setup ▸ Current project ▸ Save on that model, then READ: the stored keys are `revit_template_path, project_code, web_project_key, ghost_source_folder, doctor_axis_fix` — none of the six PC-only ones; the documentation address gone — **pass** | the key list |
| R-4 | the share-folder model: Project Setup ▸ This machine ▸ Save leaves this PC's source folder as it was (the share never reaches this PC's config); Current project ▸ Save shows the share words in the status line and the dialog stays open; READ: the stored settings unchanged; a second new project's Project Setup shows this PC's own folder, never the share — **pass** (and F-SEC2-1) | status words, key list, the box |

**F-SEC2-1 (minor, older than SEC-2):** Project Setup's machine save writes the dialog's template-path box into this PC's config;
the box shows the open model's value, so a model that names no template clears this PC's `revit_template_path` (seen in R-4; this
PC's config restored from its backup at once, byte for byte). The same on master. The template path is unused (SEC-3 removes it).
**Note:** Photo Massing's review window closed from its ✕, not from its Cancel button (a click on Cancel did not close it) — to look
at in SEC-3.

**Owed:** X-6; a model host this PC opted in to, live; Revit 2021–2023 and 2025–2027 live (builds only; deployed after the merge);
a signed-in snapshot autosave in the web after 0039 (the machine smoke and the tests only).

**Closing list:** Revit closed without saving (the scratch model's stored settings were in memory only; two new projects never
saved); the test bridge on 4101 stopped; the 4100 bridge on the branch (the same code master gets); this PC's add-in config
restored and its backup deleted; the `node_modules` backup left only where the founder's dev server on :4000 still holds a file in it
(goes when that server restarts); `sec2-smoke` stays for the founder to delete; the scratch model stays in
`Documents\Sentinel drills\sec2\` (never committed). Left on the shared ledger: `sec2-smoke`'s rows.

## Session SEC3 — hardening slice 3 live (2026-10-06 ~01:25 → 01:55 local, branch feature/sec3-hardening 9ec46be, Claude driving the bridge, the database, the founder's local app and Revit 2024)

Setup: the founder's words, given ahead: "apply 0040 when ready, deploy the sec3 branch to 2024", "publish the web app when ready too",
"restart the bridge urself too when needed". The 4100 bridge restarted by Claude on the branch before the apply (B-1); the test
bridge on 127.0.0.1:4101 on the same checkout. Part 0 read twice (the evening before and just before the apply): 3 shared
versions, 1 of them on a verdict that records no sha256, 9 wip versions on such a verdict, 2 archived — all in scratch or office
projects (none in the pilot); the live bodies, the one cde_transition and the ledger's triggers as 0040 was written against. The
scratch project `sec3-smoke` made in the founder's local app, signed in as the founder (no office). The add-in built for Revit
2024 from the branch and deployed (DLL `70610dd27d37…`); Revit 2024 started by Claude with a documentation-only model address in
`SENTINEL_OLLAMA_URL`, Load Once; the scratch model a shell copy (`Documents\Sentinel drills\sec3\sec3-drill.rvt`) opened from
Revit's Open dialog.

| Row | Result | Evidence |
|---|---|---|
| B-1 | 4100 restarted on 9ec46be, `/health` `{"ok":true,"cde_configured":true}`; 4101 up — **pass** | the lines |
| D-1 | part 0: twelve rows as above; verdict rows with a sha256 0; one cde_transition; the three ledger triggers; the bodies true — **pass** | the rows (counts only) |
| D-2 | `0040_verdict_binding` applied (~01:30 local), one transaction — **pass** | the answer |
| D-3 | part 1: 5 of 5 true; part 2: `PROBE 0040: 22 of 22 as expected.` — **pass** | the rows, the summary |
| W-0 | `sec3-smoke` created in the founder's local app, signed in, no office; it opens — **pass** | the key |
| M-1 | a registration on `sec3-smoke` (4101): `201`, `v1` — **pass** | ids |
| M-2 | share `200`; publish without a verdict `409 … has no accepted verdict that measured something (latest: none) — publishing it needs the lead's reason` — **pass** | statuses, the words |
| W-1 | the founder's Publish on the CDE board shows the database's words and a reason box; published with a reason; the ledger's `state:shared->published` under the founder's account (#1968) — **pass** | board, ledger |
| M-3 | a second registration over the published live version: `201`, `v2`, live (the bridge moved the issued version's pointer with its own key) — **pass** | ids |
| W-3 | the founder's Set live on the published v1 in the Files window: `● v1 live`, no failure line — **pass** | the list |
| M-5 | archive `200 {"ok":true,"archived":1,"discarded":1}` — **pass** | the reply |
| M-6 | a restore without a reason `409 … restoring it needs the lead's reason` — **pass** | status, words |
| W-2 | the Files window's Unarchive shows the database's words and a reason box; restored with a reason: `✓ Restored SEC3-SMOKE.ifc from the archive.` (#1975) — **pass** | status line, ledger |
| M-7 | `ids@1` installed; a proposal judged `verdict: accepted`, `ids_ref: ids@1`, in scope 1, a wip version, `verdict_audit_id` 1982 — **pass** | the verdict |
| W-4 | the founder shared and published that version with no reason box at either step (#1983, #1984, no reason recorded) — **pass** | board, ledger |
| D-4 | v1's moves: `wip->shared` (no reason), `shared->published` (the publish reason), `published->archived`, `archived->published` (the restore reason) — **pass** | the four rows |
| D-5 | every verdict on `sec3-smoke` records its version's sha256: 0 unbound of 1 (again after R-6) — **pass** | the counts |
| X-1 | a BEP .docx read in the parse worker: `200` with a proposal — **pass** | status |
| X-2 | a .pdf read in the parse worker: `200` with a proposal — **pass** | status |
| X-3 | a dense .docx at the text bound: `/health` answered in 134 ms while it was read, the read ended in ~2 s; the reply was the importer's existing chunk limit in words (`413 … 679 chunks, over the 60 limit …`) — **pass** (the worker's point: the bridge stays free) | times, status |
| R-0 | the branch's add-in on Revit 2024 (0 errors); the scratch model open — **pass** | the lines |
| R-0b | Sign in: signed in, both addresses https, no refusal; Project Setup: no refusal, 42 projects listed; bound to `sec3-smoke`, the pane loaded it — **pass** | the dialogs, the pane |
| R-1 | Project Setup has no template-path row — **pass** | the dialog's rows |
| R-2 | Standards ▸ Ingest documents ▸ a PDF: `The model at 192.0.2.10 is not on this PC, and this PC has not opted in to a model elsewhere (ghost_cloud_opt_in in this PC's Sentinel config.json). Nothing was read or sent.`; no review window — **pass** | the dialog |
| R-4 | a scratch ruleset whose exclusion runs past the match bound, installed; after Project Setup reloaded it, a scan of 334 ms listed `SL-01 · MONITOR · (the rule's pattern took too long …)`; Revit answered throughout — **pass** | the pane |
| R-5 | Photo Massing's review closes on one click of Cancel — **pass** | the window |
| R-6 | Governed Publish from Revit through the restarted bridge ends in words (rejected by `ids@1`'s door check, held on the web, nothing registered); its gate, proposal and hold rows (#1986–#1988) each record the export's sha256; D-5 still 0 unbound — **pass** | the dialog, the rows |

**Owed:** R-3 (an http bridge address to another PC, live — this PC's config holds its token and is not opened; offline rows);
a second account's refusals live (probe L1); Revit 2021–2023 and 2025–2027 live (builds; deployed after the merge); a legacy open
review chain's last approval (the probe's C1). **Ceiling (SEC-4):** a contributor can still change a judged wip or shared
version's stored file reference until it is published (`cv_update`); recorded, not fixed here.

**Closing list:** the test bridge on 4101 stopped; the 4100 bridge on the branch (the same code master gets); Revit closed
without saving the scratch model (its binding, rename and IFC export in memory or the scratch copy only); `sec3-smoke` is the
founder's scratch project — its rows stay on the ledger by design (#1964–#1988 and the ingest rows).

## Session SEC4 — hardening slice 4 live (2026-10-06 ~11:40 → 12:25 local, branch feature/sec4-hardening 6fa6636 → d20208f, Claude driving the bridge, the database, the founder's local app and Revit 2024)

Setup: the founder's words, given ahead: "apply 0041 when ready, deploy the sec4 branch to 2024", "publish the web app when ready
too", "restart the bridge urself too when needed"; S28 answered "Only confirmed models". The 4100 bridge restarted by Claude on the
branch before the apply (B-1); two outbox watchers found running were stopped and one started on the branch. The test bridge on
127.0.0.1:4101 on the same checkout. The scratch project `sec4-smoke` made in the founder's local app, signed in as the founder (no
office). The add-in built for Revit 2024 from the branch and deployed (DLL `2960efb6f704…`); Revit 2024 started by Claude, Load
Once; the scratch model a shell copy of SEC3's (`Documents\Sentinel drills\sec4\sec4-drill.rvt`) opened from Revit's Open dialog.

| Row | Result | Evidence |
|---|---|---|
| B-1 | 4100 restarted on the branch; one outbox watcher on the branch (two older ones stopped) — **pass** | the lines |
| D-1 | part 0: 14 wip and 3 shared versions a verdict names, 37 wip or shared with no sha256, 15 files whose name freezes (10 accepted, 5 recorded; all in office or drill projects, none in aster-tower), 0 revisions held twice, 0 platform items on more than one project, 0 uuid-shaped keys, 0 platform links held twice; policies `transmittals_select, transmittals_write`; the triggers and bodies as 0041 was written against — **pass** | the rows (counts only) |
| D-2 | `0041_version_record_frozen` applied (~12:00 local), one transaction — **pass** | the answer |
| D-3 | part 1: 6 of 6 true; part 2: `PROBE 0041: 24 of 24 as expected.` (the plan's 21 grew to 24 with the review's cases) — **pass** | the rows, the summary |
| D-4 | `24 of 24 installed rulesets pass SEC-4's validator` — no REFUSED line — **pass** | the summary line |
| W-0 | `sec4-smoke` created in the founder's local app, signed in, no office; it opens, no review in force — **pass** | the key |
| M-1 | a uuid-shaped project name: `400 a project key is not a uuid — choose a name with words in it (nothing was created)` — **pass** | status, words |
| M-2 | a registration naming `platform_item_id`: `400 a version's geometry is linked by the bridge after its upload — send no platform_item_id; nothing was saved`; without it `201`, `v1`, live, no item — **pass** | statuses, the version id |
| M-2b | the same bytes under `v1` again: `201`, the same version id, `repeat: true`; other bytes under `v1`: `409 a revision is registered once per file — a new upload takes a new revision; nothing was saved` — **pass** | statuses |
| M-3 | `ids@1` installed (`201`, a first install); a proposal `verdict: accepted`, `ids_ref: ids@1`, a wip version of SEC4-BOUND.ifc, `verdict_audit_id` 2001 — **pass** | the verdict |
| W-1 | the Files window: SEC4-BOUND.ifc ▸ Rename refused in the window's words `rename failed: a file whose version a verdict judged keeps its name — a new name is a new file: upload it under the new name — nothing was saved`; SEC4-SMOKE.ifc renamed (`✓ Renamed to SEC4-SMOKE-B.ifc.`) — **pass** | the status lines |
| M-4 | a ruleset with a `(?i)` exclusion: `400 ruleset: rules[0].exclusions[0] does not compile as a pattern (…) — write it without .NET-only syntax such as a leading (?i)`; the plain one `201`, `ruleset@1` — **pass** | statuses, words |
| M-5 | `GET packs` lists `bds-house@1.4.1`; `Bad Key` `400` in the key's words; `bds-house@1.4.1` again `409 … is already published — publish a new version; nothing was published` — **pass** | statuses |
| W-2 | `sec4-smoke` ▸ Settings ▸ Link to this platform project (the one aster-tower links): `Save failed: another Sentinel project already links platform project <id> — unlink it there first; nothing was saved`; the database reads `sec4-smoke` unlinked, aster-tower unchanged — **pass** | the line, the rows |
| R-0 | the branch's add-in on Revit 2024 (0 errors); the scratch model open; its pane named the model's earlier key with `Auto-publish and scan posts paused on this PC — Project Setup ▸ Save confirms web project …` — **pass** | the lines |
| R-0b | Sign in: signed in, no address refusal; Project Setup: no refusal — **pass** | the dialogs |
| R-1 | Project Setup's note followed the key box: `Saving confirms that this model, on this PC, publishes into sec4-smoke.`; after Save `bound-models.json` lists `…\sentinel drills\sec4\sec4-drill.rvt` with `sec4-smoke`; the pane's publish line is the policy's (no paused line) — **pass** | the entry, the pane |
| M-6 | `publish@1` `{auto: true}` on `sec4-smoke`: `201` — **pass** | the ref |
| R-2 | a small change ▸ Save: `Auto-publish: exporting sec4-drill.ifc…`, then `Auto-publish rejected — nothing uploaded — 38 of 38 element check(s) failed · ids@1 … ledger #2006 … Held on the web … ledger #2007` — **pass** (held with its reasons) | the Doctor lines |
| R-3 | a shell copy (the Save As dialog takes no typed name here; the same case: a path this PC has not confirmed), opened by double-clicks: the pane's paused line for `sec4-smoke`; a change ▸ Save: `Auto-publish: nothing sent — this model names web project "sec4-smoke", which this PC has not confirmed for it. Sentinel ▸ Project Setup ▸ Save confirms it (a copy or a Save As of a model asks again).`; a second change ▸ Save (12:17:39) said it no second time — **pass** | the lines |
| R-4 | Project Setup ▸ Save on the copy: `bound-models.json` lists both paths; the pane `Auto-publish: on · publish@1 · project · ed4b894a2ea3…`; a change ▸ Save auto-published as R-2 did (rejected · #2010, held · #2011) — **pass** | the Doctor lines |
| D-6 | proposal rows on `sec4-smoke`: 1 (M-3) → 2 after R-2 → 2 after R-3 → 3 after R-4 — **pass** | the counts |
| D-5 | before G-2: the three newest gate rows (#1194–#1197, 2026-09-29) carry no `contract` field, as written before the restart — **pass (pre-G-2 half)** | the rows |
| W-3 | aster-tower ▸ CDE ▸ Platform deliveries: `3 IFC · 3 passed (unverified)`; each card `Passed (unverified) — contract@1` (amber) with `the ledger's row for this run does not show the contract installed in Sentinel judged it` — **pass (pre-1.0.7 half)** | the cards |
| G-1 | (~19:00 local, after the merge) the founder ran `npm run publish` in `CloudComponents/delivery-gate` (master, 1.0.7 built fresh, 27/27 component tests): `Publishing new version (1.0.7) for component 6ab97f72…` · `Published successfully!` (Claude's own run of it was refused by the session's command check; the founder ran it on the founder's words "do that urself"); Claude re-pointed both automations in the platform's Automations ▸ Edit: "Sentinel gate — new version" (file.updated, IFC File ID ← `eventPayload.itemId`, Version tag ← `eventPayload.versionTag`) and "Sentinel gate — new file" (file.uploaded, IFC File ID ← `eventPayload.itemId`, version tag blank) — the list reads `Sentinel Delivery Gate 1.0.7` on both — **pass** | the version, the automation list |
| G-2 | the platform mirror holds `sentinel-contract.json` `contract@1`, the contract installed on aster-tower (`9cc32c96…`); the corrected test model (Desktop `hackathon-video\delivery`, 1 052 497 bytes, the bytes of v2) uploaded as **v3** of `ASTR26-AST-ZZ-XX-M3-A-0002.ifc` (item `6abc0d84…`) with the bridge's platform client `createVersion` at 19:06:07; run `#4AF9` "Sentinel gate — new version" `Success`; its message `Passed — contract sha256:9cc32c96f815… · contract@1 (aster-tower)` — **pass** | the run, the message's head |
| D-5 | the newest gate row **#2012** (19:06:25, 18 s after the upload): `platform gate PASS: ASTR26-AST-ZZ-XX-M3-A-0002.ifc v3`, `component 1.0.7`, `contract: {verified: true, named_sha256 = installed_sha256 = 9cc32c96…}`; the rows before the restart carry no `contract` field — **pass** | the rows |
| W-3 | aster-tower ▸ CDE ▸ Platform deliveries after G-2: `3 IFC · 1 passed · 2 passed (unverified)`; the 0002 card `Passed — contract@1` (green) with `ledger #2012`, the two 0001 cards still amber `Passed (unverified)` — **pass** | the cards |

**Owed:** R-5 (the watcher's hash-bound geometry link, live —
both publishes were held, so nothing reached the outbox, and `sec4-smoke` links no platform project by design (W-2);
`outbox-logic.test.mjs` holds it); Revit 2021–2023 and 2025–2027 live (builds; deployed after the merge). **Seen, not a SEC-4
row:** the pane's ↻ re-reads the journey card's scan but not the publish policy — a policy installed after the model opened shows
on the next Project Setup ▸ Save or reopen.

**Closing list:** the test bridge on 4101 stopped; the 4100 bridge and the watcher on the branch (the same code master gets); Revit
closed after both scratch models were saved (scratch copies only); `sec4-smoke` is the founder's scratch project — its rows stay on
the ledger by design (#1997–#2011).

## Session SEC5 — hardening slice 5 live (2026-10-06 ~20:55 → 23:12 local, branch feature/sec5-hardening 8d0e399, Claude driving the bridge, the database, the platform, the founder's local app and Revit 2024)

Setup: the founder's words, given ahead: "apply 0042 when ready, deploy the sec5 branch to 2024", "OK for the uploads, publish the
web app when ready too"; the restart under the standing "restart the bridge urself too when needed". D-1 and D-4 read first
(read-only, review C4), then the 4100 bridge and the outbox watcher restarted by Claude on the branch (B-1), then the platform
round trip, then the apply. The test bridge on 127.0.0.1:4101 and the local app's dev server on 4000 on the same checkout. The
scratch project `sec5-smoke` made in the founder's local app, signed in as the founder (no office). The add-in built for Revit
2024 from the branch and deployed; Revit 2024 started by Claude, Load Once; the scratch model a shell copy of SEC4's
(`Documents\Sentinel drills\sec5\sec5-drill.rvt`) opened from Revit's Open dialog. A Windows antivirus notice covered the screen
mid-drill; the founder closed it (and restarted the bridge from his own script, same checkout); Revit was started again for R-2.

| Row | Result | Evidence |
|---|---|---|
| D-1 | part 0: 0 revision pairs held twice, 0 platform items named twice, 0 indexes of 0042's names, 0 versions with more than one link row; 48 versions with geometry and no checked hash (A-a: "not hash-checked"), 0 checked — **pass** | the rows (counts only) |
| D-4 | `23 of 23 installed naming, layers and ids artefacts pass SEC-5's validator` (no ids@n refused — B-1 not held); packs: `1 of 3` — the two July seed packs' rulesets carry rules without a `target`, refused by the ruleset check that predates SEC-5 (on master since phase 3): an install of those two packs was already refused; the founder is told — **pass** | the summary lines |
| B-1 | 4100 restarted on the branch, `/health` `{"ok":true,"cde_configured":true}`; one outbox watcher on the branch; 4101 and 4000 up — **pass** | the lines |
| U-1 | a scratch `.frag` uploaded to the bridge's platform project and downloaded without a tag: `byte-for-byte: true` — **pass** | hash prefixes |
| U-2 | after a v2: no tag → v2; tag v1 → v1; `listVersions` `v2,v1`, createdAt on every one, `first is v1: true`; the scratch item archived — **pass** (A-a's option C stands) | the lines |
| D-2 | `0042_one_revision_per_file` applied (~21:12 local), one transaction — **pass** | the answer |
| D-3 | part 1: 2 of 2 true; part 2: `PROBE 0042: 8 of 8 as expected.` — **pass** | the rows, the summary |
| W-0 | `sec5-smoke` created in the founder's local app, signed in, no office — **pass** | the key |
| M-1 | a revision `P01` registered (`201`); other bytes under `P01`: `409 a revision is registered once per file — a new upload takes a new revision; nothing was saved`; the same bytes again: `201`, the first version id, `repeat: true` — **pass** | statuses, ids |
| M-2 | a "geometry linked" row through the audit route: `400 geometry linked rows are written by Sentinel, not through this route` — **pass** | status, words |
| M-3 | a scratch IDS whose facet pattern does not compile: `400 … properties[0].pattern does not compile as a pattern …`; the compiling one `201`, `ids@1`; a scratch layers standard with a four-wildcard glob: `400 layers: ignore[0] holds more than 3 * wildcards` — **pass** | statuses, words |
| W-1 | aster-tower ▸ Files ▸ v3 ▸ Open 3D: the model loads; `Loaded v3 into the viewer ✓ … — geometry not hash-checked — the ledger holds no geometry link for this version.` (its geometry predates link rows) — **pass** | the line |
| W-2 | one intake upload of a test IFC on `sec5-smoke` (through 4101's intake, the route the Files window's upload calls — the platform's file picker is not drivable here): `200`, judged by `ids@1` (nothing in scope), ledger #2019; Open 3D: `Loaded P01 into the viewer ✓ (model "SEC5-SMOKE.ifc@P01") — geometry checked against the ledger's link.` — **pass** | the version id, the line |
| D-5 | the link row #2024 for that version: `frag_sha256` true, `ifc_item_id` true, `ifc_sha256` = the version's sha256 — **pass** | the answer |
| W-3 | a later platform version (`sec5-v2`) of W-2's linked item; Open 3D again: `SEC5-SMOKE.ifc P01: the downloaded bytes are not the ones linked to this version (the item changed on the platform, or the download was cut) — not shown.` — **pass** | the line |
| W-4 | Standards ▸ Publish ▸ `sec5-pack` (aster-tower's ruleset): `Publish failed: the standards-pack registry is written by the bridge's machine credential — a signed-in publish, fork or install count is not open yet; nothing was published`; the registry lists no `sec5-pack` — **pass** | the line |
| W-6 | the local app reloaded: still signed in, 44 projects listed — **pass** | yes |
| R-0 | the branch's add-in on Revit 2024 (0 errors); the scratch model open (its pane: the paused line for its old key) — **pass** | the lines |
| R-1 | Project Setup ▸ `sec5-smoke` ▸ Save; Governed Publish: no address refusal; rejected by `ids@1`'s door check (the scratch model's doors carry no rating), nothing uploaded; `Gate row: ledger #2027 · receipt …`, verdict #2028, hold #2029 — **pass** | the dialog, the ledger ids |
| R-2 | after Project Setup ▸ Save the pane read `Auto-publish: on · publish@1`; `publish@2` (off) installed → ↻ → `Auto-publish: off — publish@2 · project · bb43640b83a0…`; `publish@3` (on) → ↻ → `Auto-publish: on · publish@3`; the add-in's cache file rewritten each time — **pass** | the lines |

**Seen, not reproduced (L):** in drill SEC4 and once tonight (right after a result dialog, and with another window in front) ↻ left
the publish line stale; on a clean Revit session every ↻ followed the change and refreshed the cache. No code change; watch it
in SEC-6. **Owed:** W-5 (the founder's own passphrase unlock); G-1 (`THATOPEN_GATE_PROJECT_KEY` — the founder's line in
config/.env, J-a stays "unset" until then); a raw-IFC link made since SEC-5 and the live mid-unlock failure (offline rows); the
CI run (after the push); Revit 2021–2023 and 2025–2027 live (builds; deployed after the merge).

**Closing list:** the test bridge on 4101 stopped; the 4100 bridge and the watcher on the branch (the same code master gets);
Revit closed without saving the scratch model; `sec5-smoke` is the founder's scratch project — its rows stay on the ledger by
design (#2016–#2029 and the artefact installs); on the platform the scratch round-trip item is archived and W-2's two items
(`SEC5-SMOKE.frag` with its `sec5-v2`, and the IFC) stay as the founder's scratch.

## Session SEC6 — hardening slice 6 live (2026-10-07 ~01:15 → 01:50 local, branch feature/sec6-hardening c1959d6, Claude driving the bridge, the database, the founder's local app and Revit 2024; the founder's hand on Sign in)

Setup: the founder's words, given ahead: "apply 0043 when ready, deploy the sec6 branch to 2024", "OK for the uploads, publish the
web app when ready too" (no web file changed, so no publish), the restart under the standing OK. D-1 read first (read-only), then
the 4100 bridge restarted by Claude on the branch (the outbox watcher untouched: nothing it runs changed), then the apply. The
test bridge on 127.0.0.1:4101. The scratch project `sec6-smoke` made in the founder's local app, signed in as the founder (no
office). The add-in built for Revit 2024 from the branch and deployed; Revit 2024 started by Claude (one instance, checked
first); the scratch model a shell copy of SEC5's (`Documents\Sentinel drills\sec6\sec6-drill.rvt`) opened from Revit's Open dialog.

| Row | Result | Evidence |
|---|---|---|
| D-1 | part 0: 0 cross-project folders, files, linked models and model revisions; 16 BCF topics and bridge documents `doc_comments 1, tender 1` left by earlier deletes (counted only — N-b); the live bodies `true`; no 0043 trigger — **pass** | the rows (counts only) |
| B-1 | 4100 restarted on the branch, `/health` ok; 4101 up; the watcher left running — **pass** | the lines |
| D-2 | `0043_one_project_answers` applied (~01:30 local), one transaction — **pass** | the answer |
| D-3 | part 1: 4 of 4 true; part 2: `PROBE 0043: 18 of 18 as expected.` — **pass** | the rows, the summary |
| W-0 | `sec6-smoke` created in the founder's local app, signed in, no office — **pass** | the key |
| M-1 | one intake upload of the test IFC through 4101 (`source=web` — the plan's command omitted it): `200`, judged by no IDS; the bridge log `[upload] 0.0 MB in 0.0 s (2398 KB/s)` — **pass** | status, the line |
| M-2 | a trickled upload: `after 140 s (8 KB sent): 408 {"message":"the upload arrived slower than 16 KB/s on average after its first 120 s — nothing was saved; try again on a faster connection"}`; no `[upload]` line for it; no `SEC6-TRICKLE.ifc` registered. While it held the machine slot, M-1's first try answered `429 you already have an upload running on the bridge …` (the machine credential's own slot, I-b) — **pass** | the lines |
| M-3 | a folder under aster-tower's root: `400 a folder and its parent folder are in one project — nothing was saved`, not listed; under its own root: `201` — **pass** | statuses, words |
| R-0 | the branch's add-in on Revit 2024 (0 errors); the scratch model open — **pass** | the lines |
| R-F | publish@1 on; Project Setup ▸ `sec6-smoke` ▸ Save → the pane `Auto-publish: on · publish@1`; Governed Publish (published, not judged — no IDS; #2049–#2056); publish@2 (off); a coordinate click on ↻ with Chrome brought in front: the pane stayed `publish@1`, **no Doctor line** — then a true press of the button (UI Automation `Invoke` on the button named "↻") → `01:40:25 ↻ sec6-smoke: Auto-publish: off — publish@2 · project · bb43640b83a0…` within a second and the pane followed — **pass, and F-SEC5-1 is explained: the drill's mouse clicks landed beside the small ↻ button (UIA places it at physical 2500,308); the event hub never stalled.** The ↻ line is what made it visible | the lines |
| R-F0 | Governed Publish with File ▸ Options held 40 s by the founder: the publish's rows landed in 7 s (#2060–#2066, 01:44:52–01:44:59) before Options was held, so nothing was queued during the hold; no wait line, no drain line, no duplicate dialog — **inconclusive (not exercised), not repeated** — the hub rows in event-check (56/56), promote-check (815/815) and project-context-check (136/136) hold the watchdog and the drain | the ledger rows, the Doctor log |
| R-F2 | the founder's Sign in; Project Setup ▸ Save; publish@3 (on) installed; ↻ (UIA Invoke) → the pane `Auto-publish: on · publish@3 · project · ed4b894a2ea3…`, a new ↻ line, the add-in's cache rewritten at 01:49:24 — **pass** | the lines, the cache time |
| R-BCF | BCF Issues on the scratch model (machine credential); a topic posted through 4101 did not appear (the stream is in-process: 4101's writes never reach 4100's clients — by design, not a defect); one posted through 4100 appeared within seconds with no ↻ pressed; both listed `[Open]`; no `Live sync paused` line — **pass** | the window |

**Owed:** U-1 (the founder's real IFC through the Funnel — the speed measurement; the 16 KB/s floor stays the default until he
reads one); W-2 (a removed member's stream — needs a second account); a stream ending at token expiry (an hour; offline rows);
Revit 2021–2023 and 2025–2027 live (builds; deployed after the merge); the CI run (after the push). **Lesson recorded:** drive the
pane's small WPF buttons by UI Automation name, never by coordinates.

**Closing list:** the test bridge on 4101 stopped; the 4100 bridge on the branch (the same code master gets), the watcher
untouched; Revit closed without saving the scratch model; `sec6-smoke` is the founder's scratch project — its rows stay on the
ledger by design (#2036–#2066 and two BCF topics).

## Session SEC7 — hardening slice 7 live (2026-10-07 ~03:20 → 03:40 local, branch feature/sec7-hardening d7dadbd, Claude driving the bridge, the test bridge and Revit 2024 alone — the founder asleep, his platform session expired)

Setup: the founder's words, given ahead: "do everything urself" and "continue all SEC parts and all tasks needed" (the restart,
the Revit 2024 deploy, the publish, the post-merge deploys). The 4100 bridge and the outbox watcher restarted by Claude on the
branch after reading how both ran (plain `npm run` in command windows, no redirection). The founder's platform session had
expired, so no signed-in web row ran and no `sec7-smoke` was made: the 4101 and Revit rows used `sec6-smoke`, the founder's own
scratch project from SEC6. The add-in built for Revit 2024 from the branch and deployed; Revit 2024 started by Claude (one
instance, checked first); the scratch model a shell copy of SEC6's (`Documents\Sentinel drills\sec7\sec7-drill.rvt`).

| Row | Result | Evidence |
|---|---|---|
| B-1 | both processes read, then restarted the same way; `/health` ok on 4100; 4101 up — **pass** | the lines |
| S-1 | one intake upload through 4101 (`source=web`, `revision=P07`): `200`; the version's "geometry linked" row records `version_tag: "P07"` beside `frag_sha256` and `ifc_item_id` — the platform echoed the asked tag — **pass** | the row |
| S-5 | the test bridge started again with `BCF_MAX_UPLOAD_MB=1` through the 4101 helper (never a bare bridge — review C2); a 2 KB upload `200`; a 1.5 MB upload `413 {"message":"the request body is over the 1 MB limit for this route — nothing was read or saved"}` — **pass** | statuses, words |
| R-0 | the branch's add-in on Revit 2024 (0 errors); the scratch model open; bound to `sec6-smoke` — **pass** | the lines |
| R-A1 | a topic with a viewpoint posted through 4100; BCF Issues listed it live; the row selected and `Zoom to issue` invoked (UI Automation): the view `Sentinel Coordination` opened with the camera applied, status `No matching element in this model.`, no Doctor wait line (the hub ran it at once) — **pass** | the view, the status |
| R-A2 | Build Office System on the scratch model, Build pressed twice within ~100 ms: one report (`Done — 0 created, 109 skipped, 0 failed` — the template's parameters are already bound), no second report — **pass** (whether the second press met the guard or a finished build is not told apart by the one status line; the guard's words are pinned in ghost-standards 178/178) | the status line |

**Owed (the founder's session or hand):** W-0 (`sec7-smoke`), S-3 (**the merge gate for Task 2** — Open 3D downloading the
linked tag, read in the network log), S-4 (a legacy version), S-6 (the delete trigger live), S-2 (the watcher's `v1` from a Revit
Governed Publish), R-A3 (the watchdog naming a window's job under sketch mode — best effort, offline-pinned), the
2021–2027 live rows. **S-3 unmet means Task 2 and the 1.0.52 bump are reverted before the merge** (review C1), (B)'s web half
to Next with the measured answer; Task 1's record (the tag on the link row) stays.

**Closing list:** the capped 4101 stopped; the 4100 bridge and the watcher on the branch (the same code master gets); Revit
closed without saving the scratch model; the two SEC-7 versions on `sec6-smoke` (`SEC7-SMOKE.ifc P07`, `SEC7-CAP.ifc P08`) and
the topics `SEC7 hub` stay as the founder's scratch.

## Session SEC8 — hardening slice 8 live (2026-10-07 ~14:40 → 15:35 local, branch feature/sec8-hardening 732e2d6, Claude driving the bridge, the test bridge, the database and the founder's local app; the founder's hand on Sign in)

Setup: the founder's words, given ahead: "do everything urself" and, for the rotation rows, "do these urself". The 4100 bridge
restarted on the branch; the test bridge 4101 and web-dev up. A scratch project `sec8-smoke` made under the founder's office
through the signed-in local app (W-0). Claude types no passphrase into the founder's app and drives no native file picker, so the
rotation rows ran through the web's own code (`crypto.ts` + `secure-store.ts`) under vitest against 4101 with the machine
credential — scratch passphrases lived only in that process and were never printed.

| Row | Result | Evidence |
|---|---|---|
| B-1 | 4100 restarted on the branch; `/health` ok; 4101 + web-dev up — **pass** | the lines |
| J-1 | judge again on a platform-linked version: `200`, the new judgement row `from: "platform"` (#2096) — **pass** | the row |
| J-2 | judge again with a raw re-upload whose sha256 matches: `200`, `from: "upload"` (newest #2099); a mismatching body `409` with the exact words — **pass** | statuses, words |
| J-3 | a version with no sha256 (7070b267…): `409` with the exact no-sha256 words; a binned version first answers "in Deleted items — restore it first" — **pass** | the words |
| S-3 | Open 3D by tag: status ok; the request shape (`…/download?versionTag=`) proven from the SDK's `#downloadItem` source — the sandboxed iframe hides the network log, so the live request itself is not read — **pass with that caveat** | the source |
| S-4 | a legacy version (no tag) opens the item's current version — **pass** | the line |
| W-0 | `sec8-smoke` created under the founder's office in the signed-in app — **pass** | the project |
| K-1 | a keystore made (first use), two files sealed (`K-A.txt`, `K-B.txt`) and registered as encrypted versions (P02 of two scratch containers); `refs` lists 2; `rotateProjectKey` ok; `resealFiles` true; the stored keystore afterwards `v:2, kid:2`, keys `alg,iters,kid,salt,v,wrap_iv,wrapped_dek` — no `retired`, no `rotating` — **pass** | the keystore row |
| K-2 | a fresh session: the old passphrase refused (`{"ok":false,"firstUse":false}`), the new one opens; both files read back as written under key 2 — **pass** | the bytes |

Lessons from the harness, not the product: `POST /cde/:key/containers` makes P01 itself (an attach is P02), the version route
is `/cde/containers/:id/versions`, and a first run that sealed blobs without registering versions re-sealed 0 files — the
rotation walks versions' `file_ref`, exactly as designed, so an unregistered blob is not a file.

**Owed:** K-3 (a rotation interrupted mid-walk and resumed — offline-pinned in the bridge tests, not run live), the Rotate key
button in the founder's own hand (the passphrase prompts), the 2021–2027 live rows.

**Closing list:** 4101 and web-dev stay up for the founder; `sec8-smoke` and its scratch containers/versions stay as the
founder's scratch; the scratch keystore holds a passphrase no one knows (the project is scratch — delete or re-make it).

## Session SEC9 — hardening slice 9 live (2026-10-07 ~16:15 → 16:30 local, branch feature/sec9-hardening bc0b5a9, Claude driving the bridge, the test bridge and the database alone)

Setup: the founder's standing words ("do everything on ur own, fix the small gaps, and continue the roadmap"). The 4100 bridge
and the test bridge 4101 restarted on the branch. The rows ran on `sec8-smoke` (its keystore at key 2 after SEC8's rotation)
through 4101 with the machine credential; two scratch blobs: one with no header (key 1), one whose 8-byte header names key 2.

| Row | Result | Evidence |
|---|---|---|
| B-1 | 4100 restarted on the branch, `/health` ok; 4101 up — **pass** | the lines |
| A-1 | the key-1 blob registered as a new container's file on a key-2 project: `409` with the exact words ("sealed under key 1, but the project's key is 2 — lock (🔓) and unlock again … nothing was saved") — **pass** | the words |
| A-2 | the key-2 blob: `201`, container `SEC9-A2` — **pass** | the row |
| A-3 | a reference to a blob not in the project's folder: `409` with the exact words — **pass** | the words |
| A-4 | the versions route on `SEC9-A2` with the key-1 blob: the same `409` — **pass** | the words |
| A-5 | the versions route with the key-2 blob: `201` (P02) — **pass** | the row |
| R-1 | a re-seal `PUT` of the key-2 blob outside a rotation (`sha256` and `replaces` both named): `409` "no key rotation is under way … the stored file is unchanged" — **pass** | the words |
| R-2 | the same without `replaces`: the rotation check answers first, the same `409` — **pass** (the 400 for a missing `replaces` is pinned offline) | the words |

**Owed:** P-1 (the state mirror on a platform item carrying two versions — needs `SENTINEL_PLATFORM_STATE=on` and such an item;
offline-pinned), a re-seal during a live rotation with `replaces` (K-1's walk ran before SEC-9; pinned offline, and the web half
ships in 1.0.53), the 2021–2027 live rows.

**Closing list:** 4101 stays up; `SEC9-A2` and its P02 stay as the founder's scratch on `sec8-smoke`; the key-1 blob stays
unreferenced in the project's folder.
