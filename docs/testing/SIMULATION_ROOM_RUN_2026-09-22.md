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
| Published | web app 1.0.28 with Deleted items | 1.0.28 published ~18:55 UTC (version 6abab82613cf4cfc31e0a522, 15.4 MB); it boots signed out in the founder's tab (reloaded by Claude's mistake: a navigate without a tab id), and says `Can't reach the bridge at <the Funnel address>` — local /health 200, the tailnet address 200, the public relay's TLS handshake fails, as earlier the same day after a bridge restart; the founder runs `tools/public-bridge-off.cmd` then `public-bridge-on.cmd` |
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
| The outage | the published app read "Projects not read — can't reach the bridge at <the Funnel address>". Measured: local `:4100/health` no answer, the public address 502 — the bridge had been a managed server of the previous Claude session and ended with it. Restarted (poller on, platform token valid); local and public `/health` 200 |
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

## Session MA3b6 — the declines made before, previewed (2026-10-07 ~18:55 → 19:05 local, branch feature/ma3b6-preview-carried-declines e4cfe15, Claude driving the bridge and the test bridge alone)

Setup: the founder's standing words ("continue the roadmap"). The 4100 bridge and the test bridge 4101 restarted on the branch. The rows ran
on the scratch project `ma3b3` (MA3b3's artefacts still installed) through 4101 with the machine credential — a storey of two retypes.

| Row | Result | Evidence |
|---|---|---|
| B-1 | 4100 restarted on the branch, `/health` ok; 4101 up — **pass** | the lines |
| D-0 | the preview of a storey nothing was filed for: `200`, `carried 0 · no_reason 0 · creates 0 · unverified 0 · all_carried false` — **pass** | the reply |
| D-2 | a preview of `{}`: `400` "a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read" — **pass** | the words |
| D-1 | storey A filed (`201`, #2106 its adjudication row), reported with both ghosts rejected and a reason each by the machine credential; the same storey previewed again: `unverified 2 · carried 0 · all_carried false` — C1 holds (a reason no signed-in member reported is not carried) and the preview read the earlier result; a third preview changed nothing (no new changeset, no ledger row) — **pass** | the replies |

The carried path (a signed-in member's decline → `carried n`, `all_carried`) is pinned offline (changesets-store.test.mjs reuses MA3b3's
`declinedInRevit("contributor")`); promote-check 827/827 pins the dialog's words and the hop's guard releases.

**Owed:** R-1 — Promote on Revit 2024 against a project holding a member's declined storey (the dialog's "Declined before" line and a storey
not filed), the founder's session; Revit 2025–2027 live rows.

**Closing list:** 4101 stays up; changeset A (`MA3b6 drill · GR-FFL`, declined) stays on `ma3b3` as the founder's scratch.

## Session MA3b7 — Ghost Builder files off Revit's thread, live (2026-10-07 ~18:40 → 18:57 local, branch feature/ma3b7-ghost-filing-off-thread 1bc65ce, Claude driving Revit 2024 alone)

Setup: the branch build deployed to Revit 2024 (Revit closed first); the add-in's bridge config backed up and pointed at the drill's door
on 127.0.0.1:4101 (MA3b5's door: the FIRST `POST /changesets/<key>` held 45 s after the bridge answered), in front of the test bridge on
4102 (this checkout's bridge code); restored afterwards. Scratch copy `ma3b7-a.rvt` of MA3b4's `ma3b4-a.rvt` (bound to `ma2a-ghost`, the
drawing `sample-walls-ma2a.dxf` already imported), opened in Revit 2024 by its path (the file association opens 2027 — its upgrade dialog
cancelled, nothing upgraded). Revit signed in (the filing's actor is the founder's account; never printed).

| Row | Result | Evidence |
|---|---|---|
| R-1 | Ghost Builder ▸ `sample-walls-ma2a.dxf` ▸ review `Walls — 2 layer(s), 14 element(s)` ▸ A-WALL-EXT ticked, GR-FFL ▸ Build at 18:51:44. The bridge filed the changeset at 18:51:45.9 (`created_at`); the door then held the answer 45 s. **During the hold Revit answered**: the review window read `Building 1 layer(s)…` with no summary at +5 s, and the ribbon switched to the View tab at +7 s (screenshots); the summary dialog was up by +60 s: `Placed: 4 · Walls: 4 typed by the guideline · Provenance: 4 of 4 … stamped as source dwg · Ledger: reporting 1 changeset(s) to ma2a-ghost (source dwg: 696e71f4) off Revit's thread … One Ctrl+Z undoes the whole build`; the bridge's changeset read `applied`, 4 of 4, a signed-in actor — **pass** | the dialog, the screenshots, the changeset |
| R-2 | the 4102 bridge stopped (the door answers 502); the same build again: the dialog `Nothing was built — the build could not be filed as a changeset, so Sentinel rolled it back (no element, type or family was added): Bridge 502: drill door: the test bridge on 4102 did not answer … — changeset "Ghost Builder · sample-walls-ma2a · GR-FFL" may exist on the bridge anyway: check ma2a-ghost on the web and withdraw it`; the standards read from the cache (`cached 18:50`) — **pass** | the words |

Not read live: the pane's Doctor log lines (the UIA read of the pane's list was not driven this session) and the Undo entry's name — both
pinned offline (promote-check 54, 838/838). The door's log: `held POST /changesets/ma2a-ghost (201) for 45000 ms - the bridge answered at
16:51:46.045Z` · `answered … at 16:52:31.056Z` — the 45 s Revit kept answering through.

**Owed:** a withdrawal path live (a filing that fails after one chunk was filed: needs a two-chunk drawing), Revit 2025–2027.

**Closing list:** Revit closed without saving (the scratch copy keeps the 4 walls only in memory — discarded); the door and the 4102 bridge
stopped; the add-in's bridge config restored from `bcf-config.json.bak-ma3b7`. Left on the shared ledger (a scratch key): on `ma2a-ghost`
one Ghost changeset (applied, 4 elements) and its rows. Left on this PC: `Documents\Sentinel drills\ma3b7\ma3b7-a.rvt` (unchanged on disk).

## Session PR1 — the machine credential is this PC's alone, live (2026-10-07 ~19:10 → 19:20 local, branch feature/pr1-machine-credential-this-pc d211839, Claude driving the test bridge alone)

Setup: the founder's words "go, production readiness". The test bridge 4101 on the branch; the rows sent with the machine credential
through a helper that adds `X-Forwarded-For` the way the Funnel appends it (a proxy in front). The 4100 bridge is restarted on master
after the merge (the rule is the same code).

| Row | Result | Evidence |
|---|---|---|
| M-1 | the token from a loopback socket with no proxy header: `GET /projects` `200` — Revit on this PC, the outbox watcher, the MCP server and scripts as before — **pass** | the reply |
| M-2 | the token behind a proxy header (`X-Forwarded-For: 203.0.113.9`): `403` "the machine credential is accepted only from this PC — from the internet or another PC, sign in (a person's session); nothing was read or saved" — **pass** | the words |
| M-3 | a write behind the header (`POST /cde/sec8-smoke/audit`, two hops in the header): the same `403`, nothing written — **pass** | the words |
| M-4 | `GET /health` behind the header: `200` (exempt, as before) — **pass** | the reply |

Offline: gate-limits.test.mjs pins M-1…M-4 and that a signed-in session behind the proxy is not refused by this rule; 2689 tests.

**Said to the founder:** this PC's add-in config points at the Funnel hostname with the machine token in it, so a signed-out Revit on this
PC now meets the 403 until that config points at `http://127.0.0.1:4100` (a signed-in Revit is unchanged: it sends the person's JWT).
The outbox watcher, intake, federation and the MCP server default to loopback (`BCF_BASE`).

**Owed:** the real Funnel path with the token (not driven — the proof is the header the Funnel appends, as `clientAddress` and the
receipt log already rely on); H6 and one rotation of the token (the founder's).

## Session MA3c — the ghost overlay, live (2026-10-07 ~19:35 → 19:57 local, branch feature/ma3c-ghost-overlay, Claude driving Revit 2024 alone)

Setup: the branch build deployed to Revit 2024 (Revit closed first); scratch copy `ma3c-a.rvt` of MA3b4's model (bound to `ma2a-ghost`),
opened in Revit 2024 by its path; the add-in's bridge config points at the loopback bridge (PR-1). Two changesets filed through the test
bridge: A — two wall creates 3 m outside the Ghost build's rectangle; B — one wall create inside its courtyard (`62000,63500 → 68000,63500`,
GR-FFL, 0 → 3000 mm). The default 3D view `{3D}` open.

| Row | Result | Evidence |
|---|---|---|
| O-4 | the review window's Show line: `2 of 2 proposed create(s) outlined in this model's 3D views — ticked green, unticked grey, declined red; nothing is written. Open a 3D view to see them; they go when this window closes or Apply places them.` (A), `1 of 1 …` (B) — **pass** | the words |
| O-1 | B's wall: after Show zoomed `{3D}` onto it, a faint grey frame (base, top, two verticals) stands in the courtyard; the Doctor log: `Ghost overlay: asked for the 3D view "{3D}" — this model: True; 4 line(s)` and `Ghost overlay: drawn in "{3D}" — 4 line(s)` — **pass**. A's outlines were not spotted at the site zoom (1-px grey lines 3 m from the walls; the first build also lacked the Doctor lines) — the instrumentation was added for exactly this: a registered server is now told apart from lines out of sight | the zoom, the log |
| O-2 | the row ticked (UIA): the frame turned green at once — **pass** | the zoom |
| O-3 | the window closed: the removal ran through the hub with no `was not removed` line in the Doctor log; the Undo list was not read and the courtyard not re-inspected — the founder's Chrome came to the front and Revit was left alone — **pass on the log; the visual check owed** | the log |

**Owed:** O-3's visual check and the Undo list; the two 1-px grey lines are faint at a site zoom — a thicker or dashed line, or a plan-view
marker (TemporaryGraphicsManager, 2022+), is MA-3c's Next; Revit 2025–2027.

**Closing list:** Revit 2024 left open on the scratch copy (the founder was at the PC); changesets A and B stay proposed on `ma2a-ghost`
(the founder's scratch — decline or withdraw them on the web desk).

## Session MA3d — IFC GlobalIds on Promote's ghosts, live (2026-10-07 ~20:20 → 20:40 local, branch feature/ma3d-web-highlights dda91c1, Claude driving the test bridge and Revit 2024 alone)

Setup: the branch build deployed to Revit 2024 (Revit closed first); the test bridge 4101 on the branch; scratch copy `ma3d-a.rvt` of MA3b3's
model, re-bound through Project Setup to `ma3b3` (Promote's standards installed; its old `ma1-bds` key is gone); the three Promote storeys
waiting on `ma3b3` from MA3b3/MA3b5 withdrawn through 4101 first (Promote reopens a waiting storey instead of planning). The add-in's bridge
config pointed at 4101 for the filing rows and restored to the loopback 4100 afterwards.

| Row | Result | Evidence |
|---|---|---|
| D-1 | a retype with `target.ifc_guid: "2O2Fr$t4X7Zf8NOew3FLKI"`: `201`, the field kept on the stored target; `"abc"`: `400` "elements[0]: target.ifc_guid must be an IFC GlobalId — 22 characters of its alphabet — when it is sent" — **pass** | the replies |
| R-1 | Promote (DD) on `ma3d-a` ▸ `File 3 changeset(s)?` ▸ Yes: the three storeys filed (GR-FFL 48 elements, 01-FFL 40, MA0 Roof 1); **89 of 89** carry a well-formed `target.ifc_guid` (28 + 20 + 20 + 20 + 1 — retypes and attaches alike; e.g. `3YA3o11Xb52hro634JnWZr`) — **pass**. A first run through the live 4100 bridge (master's validator) filed the same storeys with **0** GUIDs: master strips the field it does not know — the merge and the 4100 restart close that; recorded so nobody reads it as the add-in's fault | the bodies |
| W-1 | the desk's Highlight in 3D on a loaded published version — **owed to the founder's session** (pinned offline: review-desk.test.ts, 7 rows) | — |

Also seen: Promote's MA-3b6 question read `File 3 changeset(s)?` (nothing declined before); the MA-3c line on a Promote review read
"No ghost to draw: this review proposes no create…"; the second filing's GR-FFL header carried one decline from the first (MA-3b3's carry).

**Closing list:** Revit closed without saving (the re-binding to `ma3b3` lived in the unsaved model only; the copy on disk is MA3b3's); the
three new storeys stay proposed on `ma3b3` (the founder's scratch — decline or withdraw them); the add-in's config restored
(`bcf-config.json.bak-ma3d`).

## Session MA3d2 — the proposal model, live (2026-10-07 ~20:45 → 21:15 local, merged 73d692c / web 1.0.55, Claude driving the test bridge and the local app alone)

Setup: the test bridge 4101 on the branch; a changeset of 2 walls + 1 door typed onto `sec8-smoke` (storey "MA3d2 drill · proposal model ·
Level 1"); after the merge the 4100 bridge restarted on master and the web 1.0.55 published; the web row driven in a fresh Chrome tab on the
local app (the founder's tab was left alone — its iframe still ran the pre-merge code).

| Row | Result | Evidence |
|---|---|---|
| P-1 | `GET /changesets/sec8-smoke/<id>/proposal.frag`: `200 application/octet-stream`, 2,349 bytes, header `X-Sentinel-Proposal: {"creates":3,"drawn":2,"skipped":[…door…],"skipped_total":1}` (ASCII-escaped; an em dash in the first build made Node throw ERR_INVALID_CHAR → 500, fixed in review) — **pass** | the reply |
| P-2 | a retype-only changeset: `409` "this changeset proposes no wall, floor, roof or ceiling to draw…" — **pass** | the reply |
| W-1 | the desk ▸ Refresh ▸ "Show creates in 3D" on the Level 1 storey: two orange boxes in the viewer beside the empty scene; the words `Showing 2 of 3 proposed create(s) as a proposal model in orange — boxes from the proposal's lines and boundaries … Not drawn: MA3d2 door: a door — not drawn (the proposal model draws walls, floors, roofs and ceilings as boxes)`; "Hide creates" removed them — **pass** | the screenshot |

**Owed:** the frame check beside a *published* wall (needs a project with published geometry and a create at a known place) — the founder's
session; slab polygons, door boxes and levels from the model are MA-3d2's Next.

**Closing list:** the drill changeset stays proposed on `sec8-smoke` (decline or withdraw it on the desk); my Chrome tab closed; 4100 on
master since ~20:58 — the Funnel refresh is the founder's.

## Session MA3d2N — the proposal model's Next: outlines, openings, levels (2026-10-07 ~21:10 → 21:30 local, merged 20211f2 / web 1.0.56, Claude driving the live bridge and the local app alone)

Setup: built inline on `feature/ma3d2-next-shapes` (no workflow — size S); 2727 tests, the web builds; merged `--no-ff`, the 4100 bridge
restarted on master, web 1.0.56 published. The drill changeset of Session MA3d2 (2 walls + 1 door on `sec8-smoke`) reused as it stands.

| Row | Result | Evidence |
|---|---|---|
| U-1 | the real pipeline test: a wall, an L-shaped floor (6-point `LocationLoop`) and a door named `0915 x 2134` through the core bundle's IFC and web-ifc to fragments — `{creates 3, drawn 3, skipped []}`; each shape adds bytes (wall 1,889 → +floor 2,426 → +door 2,955) — **pass** | vitest; node |
| P-1 | `GET /changesets/sec8-smoke/2a4effc3…/proposal.frag` on the LIVE 4100: `200`, 2,843 bytes, header `{"creates":3,"drawn":3,"skipped":[],"skipped_total":0}` — the door at (3000, 0) found wall 1 under it (was `drawn 2`, the door skipped) — **pass** | the reply |
| W-1 | the desk ▸ Show creates in 3D in a fresh Chrome tab: `Showing 3 of 3 proposed create(s) as a proposal model in orange — walls as boxes on their lines, floors, roofs and ceilings as their outlines, doors and windows as their openings' boxes turned to the wall under them …`; the door's box visible in the first wall's face; Hide creates cleared the scene — **pass** | the screenshot |

Also: the header pin in write-roles.test.mjs that used a door for the em-dash words now uses a grid (a door is drawn).

**Owed:** a floor or window live (no changeset on a scratch key carries one yet — U-1 covers them offline); a proposal model per storey
rather than per changeset; levels from the *published* model's storeys (today: only what the changeset itself tells).

**Closing list:** the drill changeset stays proposed on `sec8-smoke` (decline or withdraw it on the desk); my Chrome tab closed; 4100 on
master since ~21:20 — the Funnel refresh is the founder's.

## Session MA3cN — the ghost overlay's Next: see-through faces, plans (2026-10-07 ~21:35 → 22:00 local, branch feature/ma3c-next-faces, Claude driving Revit 2024 alone)

Setup: built inline (size S, no workflow); deployed to Revit 2024 (closed first); scratch copy `ma3c-a.rvt` (bound `ma2a-ghost`), the
MA3c changesets A (two walls outside the build) and B still proposed; Review AI Proposals ▸ A ▸ Show ▸ tick by UIA.

| Row | Result | Evidence |
|---|---|---|
| F-1 | first build: the window's line `2 of 2 proposed create(s) outlined in this model's views — a see-through face and its edges …`; `{3D}`: ghost 1 stood as a 3 m sheet readable at the site zoom (a solid grey panel beside the brick walls — not see-through: the vertex alpha alone is ignored by Revit); the row ticked → the sheet turned green at once — **pass on draw and recolour, see-through failed** | the screenshot |
| F-2 | fix (`_teffect.SetTransparency(150/255)` for the triangle pass) redeployed, Revit reopened: the green sheet is translucent — ghost 2's grey sheet shows through it — **pass** | the screenshot |
| P-1 | the floor plan `WIP_BUA_GR_FFL` opened, Show zoomed onto ghost 1: a green line above the real wall (the sheet edge-on); the Doctor: `Ghost overlay: asked for the FloorPlan view "WIP_BUA_GR_FFL" — this model: True; 8 line(s), 8 face(s)` and `drawn in the FloorPlan view …` — **pass: Revit draws DirectContext3D in plans**; the words now say "3D views, plans and sections" | the log, the screenshot |
| O-3 | the window closed by UIA: no `was not removed` line (4 Doctor lines in all) — **pass** | the log |

**Owed:** a section view (not opened; the server answers it the same way), Revit 2025–2027 (deployed, not run), a concave slab's fan
(over-covers — ear-clipping if it matters), a door's panels live.

**Closing list:** Revit closed without saving (nothing changed); A and B stay proposed on `ma2a-ghost` (the founder's scratch — decline or
withdraw them); the add-in deployed 2021–2027 from master.

## Session BASE — the Base ruleset in Packs, live (2026-10-07 ~22:10 → 22:20 local, merged 52864b5 + 14752cc / web 1.0.58, Claude driving the live bridge and the local app alone)

Setup: built inline (size S); `base-standard@1.0.0` published to the live registry by the machine credential from this PC (the
registry was already seeded, so the new seed file alone would not have appeared); the 4100 bridge on master; the drill in a fresh
Chrome tab on `sec8-smoke`, whose office is the scratch `ma2e-office` (holding `ruleset@1` only).

| Row | Result | Evidence |
|---|---|---|
| B-1 | Marketplace: the Base card reads `1 rule(s) · naming · ids · layers · contract · Sentinel` with `Install`, `Install on office ma2e-office`, `Fork` — **pass**. First build read the office from the local project record (no `office_key` there → no button); fixed to the projects hub (14752cc) | the screenshot |
| B-2 | Install on office: `Installed Base standard (office-agnostic) as ruleset@2 + naming@1 + ids@1 + layers@1 + contract@1 on ma2e-office — sec8-smoke and the office's other projects inherit it unless they install their own…`; the header: `in force: ruleset@2 · office · cc9443…` — **pass** | the words |
| B-3 | the bridge for `sec8-smoke`: `ruleset@2·office  naming@1·office  ids@1·office  layers@1·office  contract@1·office` — **pass** (inheritance) | the replies |
| B-4 | overlay: the pilot's naming PUT on `sec8-smoke` (201) → `naming@1·project` while `ids`, `layers`, `contract`, `ruleset` stay `·office` — **pass** (project → office, one kind at a time) | the replies |

Also: `seed-packs.test.mjs` pins the pack's bodies equal to `config/base-standard/*` and free of the pilot's names; a QA scan under the
Base sheet rule was not run (no sheets on `sec8-smoke`).

**Closing list:** `ma2e-office` now holds the Base standards (scratch office — leave or withdraw); `sec8-smoke` carries the pilot's
naming as its overlay; my Chrome tab closed; the 4100 bridge on master since ~22:05 — the Funnel refresh is the founder's.

## Session MA3d3 — one proposal model per storey, live (2026-10-07 ~23:20 → 23:35 local, merged 9f4e75d / web 1.0.59, Claude driving the live bridge and the local app alone)

Setup: built inline (size S); the 4100 bridge restarted on master; the drill against the live bridge with the machine credential from
loopback, and the desk in a fresh Chrome tab on `sec8-smoke`.

| Row | Result | Evidence |
|---|---|---|
| P-1 | `GET /changesets/ma2a-ghost/proposal.frag?ids=<A>,<B>` (the two MA3c changesets): `200`, 2,725 bytes, header `{"creates":3,"drawn":3,"skipped":[],"skipped_total":0,"changesets":2}` — one model from two changesets; `sec8-smoke` one part: `200`, 2,844 bytes, `changesets 1`; an unknown part: `404 changeset not found`, nothing served; no `ids`: `400` in words — **pass** | the replies |
| W-1 | the desk ▸ Show creates in 3D on the Level 1 storey: one request, the orange model, `Showing 3 of 3 proposed create(s)…`; Hide creates: `Hid the storey's proposal model.` — **pass** | the screenshots |

Also: `storeyModel` pinned offline (a level create in part 1 places part 2's wall at that elevation; the name loses " (i/n)").
Levels from the *published* model are not read — the bridge has no fragments reader; the storey learns its levels from its own
parts (a level create, a loop's, a line's or a point's z).

**Closing list:** the drill changesets stay proposed (`sec8-smoke` 2a4effc3; `ma2a-ghost` A and B — the founder's scratch); my
Chrome tab closed; the 4100 bridge on master since ~23:20 — the Funnel refresh is the founder's.

## Session OPEN1 — openCDE slice 1, the BCF-API 3.0 reads, live (2026-10-08 ~00:20 → 00:35 local, merged 3eac54e, Claude driving the live bridge alone)

Setup: built inline (size M); the 4100 bridge restarted on master; the drill with the machine credential from loopback against the
real `aster-tower` (62 projects visible to the machine, 2 live containers, topics with one viewpoint).

| Row | Result | Evidence |
|---|---|---|
| O-1 | `GET /bcf/versions` → `{"versions":[{"version_id":"3.0",…}]}`; `GET /bcf/3.0/current-user` → `{"id":"machine","name":"the bridge (machine credential)"}` — **pass** | the replies |
| O-2 | `GET /bcf/3.0/projects` → 62 `{project_id, name, authorization}`; `/projects/aster-tower` → one; `/extensions` → Sentinel's types, statuses, priorities and the members as users — **pass** | the replies |
| O-3 | `GET …/files` → 2 BCF files, the live versions named ISO-style (`ASTR26-AST-ZZ-XX-M3-A-0001.ifc`), each `reference` the version's route — **pass** | the reply |
| O-4 | one topic `200`; its comments `[]`; its viewpoints 1; `…/selection` → the viewpoint's `ifc_guid` list; `…/snapshot` → `404 snapshot not found` (none stored — right) — **pass** | the replies |
| O-5 | `?status=all&$top=2` → 2; `?$filter=topic_status eq 'Closed'&$top=1` → one Closed (the filter starts from every status); `?$filter=x gt 1` → `400` in words — **pass** | the replies |
| O-6 | `DELETE …/comments/y` → `405 this openCDE route is read-only on this bridge — the writes come with the next slice; nothing changed` — **pass** | the reply |

Offline: `bcf-open.test.mjs` (the parser, the paging, snapshots, files, extensions) and five write-roles rows (a person's identity, a
stranger refused as before). 2741 tests.

**Owed:** a stock BCF client (BIMcollab Zoom / Solibri) opening the Funnel URL — needs the auth discovery document (slice 2) first,
since those clients start at `/bcf/3.0/auth`; the buildingSMART test-suite run (slice 3).

**Closing list:** nothing written; the 4100 bridge on master since ~00:25 — the Funnel refresh is the founder's.

## Session OPEN2 — openCDE slice 2, the writes and the auth front, live (2026-10-08 ~01:10 → 01:30 local, merged dbde90b, Claude driving the live bridge alone)

Setup: built inline (size M); the 4100 bridge restarted on master; the public routes probed with no bearer on loopback and through
the Funnel; the writes with the machine credential from loopback on a scratch topic of `sec8-smoke`.

| Row | Result | Evidence |
|---|---|---|
| A-1 | `GET /bcf/3.0/auth` with no bearer: `200`, `oauth2_auth_url` = this bridge's `/oauth/authorize`, `oauth2_token_url` = `/oauth/token`, `authorization_code_grant`; **through the Funnel** with no bearer: `200`, both URLs `https://…` on the Funnel host — the gate's exemption holds behind the proxy — **pass** | the replies |
| A-2 | `GET /oauth/authorize?response_type=code&client_id=probe&redirect_uri=http://localhost:9999/cb` with no bearer: `200 text/html`, the sign-in form; `POST /oauth/token {grant_type: password}`: `400 unsupported_grant_type` in words — **pass** | the replies |
| W-1 | a topic created (the existing POST) → comment `PUT` `200`; `PUT related_topics` with the spec's bare array → `[{related_topic_guid}]`; `POST document_references {url}` `201`; comment `DELETE` → "comment removed — the topic's history keeps the fact" — **pass** | the replies |
| W-2 | `GET …/events` → `Created | Comment added | Comment edited | Related topics: 1 | Document reference added: … | Comment removed`; `GET …/documents` → the project's containers by name — **pass** | the replies |
| W-3 | `DELETE …/topics/:guid` → "closed, not erased — a Sentinel topic stays on the ledger"; the topic reads `Closed` after — **pass** | the replies |

Offline: the pure tests (auth document, redirect rule, the 60-second single-use code store, the escaped consent page, events,
the methods table) and five write-roles rows (a viewer refused, a governed topic a lead's, a comment the author's or a lead's,
documents refused in words, the full code-for-JWT swap with a signed-in page). 2750 tests.

**Owed (the founder's):** the consent page end to end — a stock BCF client (BIMcollab Zoom, Solibri) on the Funnel URL, a person's
own sign-in in the page, the client receiving the code and opening the issues; the buildingSMART test suite (slice 3).

**Closing list:** one scratch topic "OPEN2 drill topic" on `sec8-smoke`, Closed; the 4100 bridge on master since ~01:15 — the Funnel
refresh is the founder's.

## Session OPEN3 — openCDE slice 3, BCF-API 3.0 conformance on the official schemas, live (2026-10-08 ~02:00 → 02:20 local, merged 736ce7a, Claude driving the live bridge alone)

Setup: buildingSMART publishes no runnable BCF-API test suite (its repository: the specification, an OpenAPI reference, the JSON
schemas); the schemas vendored unchanged (CC BY-ND 4.0, a notice) and a draft-03 subset validator + a runner built inline (size S);
the 4100 bridge restarted on master; the walk with the machine credential from loopback on the real `aster-tower`.

| Row | Result | Evidence |
|---|---|---|
| C-1 | offline: the raw store's topic fails `topic_GET` (`server_assigned_id` missing), a comment fails `comment_GET` (`topic_guid`), a viewpoint fails on `snapshot` (a string); with the outgoing shapes (bcfTopic / bcfComment / bcfViewpoint, the files list as `project_files_information`, events with `actions`) every shape conforms — **pass** (the run found four gaps and fixed them first) | `bcf-conformance.test.mjs` |
| C-2 | live: `node bridge/bcf-conformance.mjs http://127.0.0.1:4100 aster-tower` → **20 conform, 0 do not, 0 skipped** (versions, auth, current-user, projects, project, extensions, files, documents, topics, events, one topic, its events, comments, viewpoints, related topics, document references, a viewpoint's selection/coloring/visibility, the 404 error shape) — **pass** | `docs/compliance/BCF_API_CONFORMANCE_2026-10.md` |
| C-3 | through the Funnel with no bearer: `/bcf/versions` `200`, `/bcf/3.0/auth` `200` (https URLs on the Funnel host), `/bcf/3.0/projects` `401` — the public surface is the specification's §3 set, nothing more — **pass** | the replies |

2755 tests.

**Owed (the founder's):** a buildingSMART conformance listing (an implementer's registration + the Implementers Group's review —
this report is the evidence); the stock-client check of Session OPEN2.

**Closing list:** nothing written to any project; the 4100 bridge on master since ~02:05 — the Funnel refresh is the founder's.

## Session PAPER — paperwork slices 4–6: the TIDP document, the evidence pack, the written procedure, live (2026-10-08 ~02:40 → 03:00 local, merged 0710b25, Claude driving the live bridge alone)

Setup: built inline (size S); the 4100 bridge restarted on master; the reads with the machine credential from loopback on the
real `aster-tower`.

| Row | Result | Evidence |
|---|---|---|
| T-1 | `GET /bimdocs/templates` → `BEP, EIR, READINESS, TIDP` — the TIDP offered beside the BEP; `GET /cde/aster-tower/journey` → `6/9`, next `tidp` (status `todo`): the Next strip asks for the TIDP after the BEP — **pass** | the replies |
| E-1 | `GET /cde/aster-tower/evidence-pack` → `200`, `Content-Disposition: attachment; filename="aster-tower-evidence-pack-2026-10-07.json"`; the project (`aster-office`'s), 12 standards in force named `kind@n · source` (ids@3·project, ruleset@5·office, naming@1·office, contract@1·project, type_catalog@1·office, publish@2·project, roi@1·project, review@1·project; guideline, layers, carbon_factors, lod_matrix none), 3 documents (EIR archived, EIR wip, BEP wip), 2 containers with 4 versions, 0 review chains, **187 ledger rows of 187** each with its `hash` and `prev_hash`, `bundle_sha256` re-checked offline with `sealed()` → true; 65,843 bytes — **pass** | the reply |
| E-2 | offline: a viewer's and a contributor's pack is a `403`; a part the store cannot serve is `{ not_read: … }` in its place (the test fake's ledger has no count header → said so), the rest sealed — **pass** | `write-roles.test.mjs`, `evidence-pack.test.mjs` |

2759 tests. The procedure (`docs/compliance/INFORMATION_MANAGEMENT_PROCEDURE.md`) is a document; its check is the reader's.

**Owed:** a TIDP created on the web from the new template (the founder's session: Documents ▸ + New document ▸ TIDP); the pack's
download button on the web (today: the route, a lead's bearer).

**Closing list:** nothing written to any project; the 4100 bridge on master since ~02:50 — the Funnel refresh is the founder's.

## Session PACKBTN — the evidence pack's button, live (2026-10-08 ~03:20 → 03:35 local, merged 2fd7d34 / web 1.0.60, Claude driving the local app alone)

Setup: built inline (size S, web only); the local app in a fresh Chrome tab on `sec8-smoke` (the founder's account, owner).

| Row | Result | Evidence |
|---|---|---|
| B-1 | Project Settings ▸ Standards in force: after the artefact rows, the `evidence pack` line — "the standards in force, the documents, the containers and versions, the review chains and every ledger row with its hash — one JSON, sealed by sha256" — and the **Download evidence pack** button, shown to an owner — **pass** | the screenshot |
| B-2 | the click itself saves a file into the browser's Downloads: **the founder's** (a download is theirs to start); the helper's file name and words are pinned offline (`evidence-pack.test.ts`): the bridge's name from `Content-Disposition`, the counts of every part, any part not read named, "(cut at the cap)" when the ledger was | the test |

**Closing list:** nothing written; the web 1.0.60 published; no bridge change — no Funnel refresh owed.

## Session MA3cR — the ghost overlay on Revit 2025, 2026 and 2027, live (2026-10-08 ~00:05 → 00:30 local, master 23ab04e, the add-in deployed 2021–2027 on 2026-10-07, Claude driving each Revit alone)

Setup: one scratch copy of `ma3c-a.rvt` per version (`ma3c-a-2025.rvt`, `-2026.rvt`, `-2027.rvt`), each opened by its version's
path, upgraded in memory (12 family warnings, 0 errors, accepted) and closed without saving; changeset A on `ma2a-ghost` (two walls)
reviewed in each: Review AI Proposals ▸ double-click A ▸ Show ▸ tick the first row (UIA) ▸ the floor plan `WIP_BUA_GR_FFL` ▸ Show ▸
close the window. The Sentinel tab is reached by one wheel tick per tab (17 tabs past Architecture on 2025, 15 on 2026, 14 on 2027).

| Version | Add-in + pane | Window words | 3D: asked / drawn | Tick → green, see-through | Plan: asked / drawn | Removal |
|---|---|---|---|---|---|---|
| 2025.4 | loaded, journey shown | "2 of 2 … 3D views, plans and sections" | ThreeD "{3D}", 8 lines, 8 faces | ✅ pale green sheet over the model | FloorPlan "WIP_BUA_GR_FFL", 8 / 8 | no `was not removed` line |
| 2026.4 | loaded | same | same | ✅ | same | clean |
| 2027.0 | loaded (beside the Autodesk Assistant panel) | same | same | ✅ blended with the dark canvas (a dark green, not the solid colour) | same | clean |

**Pass on all three.** With MA3cN (2024) the overlay — lines, see-through faces, recolour, plan views, removal — is proven on
2024–2027. Revit 2021–2023 are deployed and compile; not run.

**Note:** 2026 and 2027 show an "Accelerated Graphics" toggle in the 3D view (off by default, left off); the overlay was checked
with it off only.

**Closing list:** each Revit closed without saving; the three scratch copies stay in `Documents\Sentinel drills\ma3c\`; changesets A
and B stay proposed on `ma2a-ghost`.

## Session W2 — a second account at team scale, live (2026-10-08 ~00:35 → 01:10 local, master 23ab04e, Claude driving the second account's session in the published app through the Funnel)

Setup: the founder signed a second, existing account (a Gmail account, not the founder's) into the published Sentinel app in a tab
of Claude's tab group (the published app keeps its sign-in per tab; Claude entered no password). The account's memberships, read by
the bridge beforehand: viewer on `aster-office` and `sentinel-first-test`, contributor on `b13-review`, lead on `aster-tower` and
`live-25`. Expected outcomes were pinned first from the code by a two-stage read (one mapper per surface, one skeptic per mapper:
hub, issues, standards, CDE, desk). Every call went through the Funnel with the person's own session.

| Row | Role | Result | Evidence |
|---|---|---|---|
| H-1 | — | the Projects hub lists exactly the 5 member projects (aster-office, aster-tower, live-25, Sentinel First test, B13 review) of 62; the account menu reads "lead on aster-tower" — **pass** | the screenshot |
| V-1 | viewer (aster-office) | the dashboard reads "your role: viewer — a lead or owner runs the gate" (no Run gate); Settings: no "Install JSON…", no evidence-pack row, no Members section, "your role: viewer — project settings are read-only (a lead or owner can edit them)" — **pass** | the screenshots |
| V-2 | viewer | RFIs ▸ Raise: `❌ this action requires the contributor role (you are viewer)`; nothing written — **pass**. (Issues ▸ New stops earlier in the web: "Select an element in the model first.") | the screenshot |
| C-1 | contributor (b13-review) | Settings: "your role: contributor — project settings are read-only"; Project Files: "archive and delete are a lead's (your role: contributor)", no delete control — **pass** | the screenshots |
| C-2 | contributor | the open review chain on B13-B.ifc (review@5, step 2 of 2, role contributor): the card shows step 1 approved by this account and "you already approved step 1 of this chain", no approve control; "My reviews (0)" — **pass: one approval per person per chain** | the zoom |
| C-3 | contributor | CDE ▸ + Container `B13-W2-ZZ-XX-M3-A-0001` created (WIP, P01); ledger **#2153** `container created`, actor = the second account (checked by the bridge against the member list, not the founder), hash set — **pass: attribution** | the bridge read |
| C-4 | contributor | the board draws "Archive" (Published) and "Share →" (WIP) for a contributor; pressing them: `Transition rejected: insufficient role to transition (needs lead or owner)`, nothing moved — **the database holds; the UI offers what the role cannot do (gap G3)** | the screenshots |
| L-1 | lead (live-25) | Settings: "Install JSON…" on every kind, the "Download evidence pack" row, Members with role selects, Remove and Add, Save changes, Archive; "Delete project" is also offered though the bridge needs the owner (gap G4) — **pass, with G4** | the zoom |

**Gaps found and fixed in this slice** (feature/w2-gaps, merged e6a556d, web 1.0.61; fixed by one implementer, reviewed from three lenses — correctness, role regressions, wording — fixed again, then a final two-skeptic review whose one real finding (Deliverables, below) was fixed too): G2 members role change/remove by a non-lead answered "membership changed
concurrently" (RLS zero rows) instead of the role words; G3 CDE board transition buttons and "Rotate key…" drawn below lead; G4
"Delete project" offered to a lead; G5 a contributor could rename a plain topic into a governed "IDS:"/"Federation:" title or create
one already Closed (a leading space no longer slips past); G6 the hub called every 503 "CDE not configured"; G7 a non-member was told "your role: viewer"; and the final review's find: the Deliverables panel drew a lead's controls (row edit/delete, Rebaseline Apply, Declare team, team edit/delete) for a contributor, and its team delete dropped the bridge's words. 2777 tests.

**After the merge (local app, the founder's own session, a contributor on `live-25`):** the CDE board reads "your role: contributor — sharing, publishing, archiving, deleting folders and key rotation are a lead's", Rotate key… is gone, + Container stays; Deliverables keeps + Add, Paste schedule and the Rebaseline preview, and Teams offers no "+ Declare team" — **pass**. The bridge-side fixes (members role words, owner-only owner changes, governed titles) are pinned in `write-roles.test.mjs`; the 4100 bridge runs them since ~01:40.

**Decision (the founder's, 2026-10-08): keep G1** — any member, a viewer included, can read the members list (e-mails) through the
bridge and the BCF extensions, as the ledger already names every actor to every member; written into the procedure (5.5).

**Closing list:** the drill container `B13-W2-ZZ-XX-M3-A-0001` stays on `b13-review` (scratch, WIP); no membership was changed; the
second account stays signed in in Claude's tab until the founder signs it out.

## Session MA4a — evidence intake and the audit pack (2026-10-08 local: the machine rows on the branch on the 4101 test bridge, the person rows live on master; merged 2a23208, web 1.0.62 published; Claude driving the bridge alone)

Setup: a new drill project `ma4a-drill` ("MA-4a drill (evidence intake, scratch)"), attached to `ma2e-office`, the founder added
as its owner (201); its evidence folder `%APPDATA%\Sentinel\evidence\ma4a-drill\` holds `scans\tiny.las` (from
`WebApp/scripts/make-tiny-las.mjs`), `photos\own.jpg`, `photos\street.jpg`, a stand-in `scans\site.rcp` and
`scans\site-registration.txt`. Every call below used the machine credential from loopback (no person).

| Row | Result | Evidence |
|---|---|---|
| E-0 | `GET /cde/ma4a-drill/audit-pack` and the old `/evidence-pack` both 200, `"pack":"sentinel-audit-pack"`, `filename=ma4a-drill-audit-pack-2026-10-08.json`; a pack sealed by master's `evidence-pack.mjs` (no 2026-10-07 download was on disk) verifies with the branch's `sealed()` — true, a tampered copy false — **pass** | the script output |
| E-1 | `PUT /cde/ma4a-drill/artefacts/evidence_pack` → 400 `evidence packs change only through the evidence routes; nothing was saved`; `POST /cde/ma2e-office/evidence` → 400 `an evidence pack belongs to a project, not an office — make it on the project; nothing was saved` — **pass** | the script output |
| E-2 | the machine credential: `…/attest {code:"a"}` → 403 `an attestation needs a person: sign in. Nothing was saved.`; `…/items` → 403 `an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved.` — **pass** | the script output |
| E-5 (part) | `{path:"../x"}` by the machine credential → the same 403 (the person check comes before the path check; the 400 is pinned offline) — **pass** | the script output |
| E-6 | `POST /cde/ma4a-drill/audit` with `evidence:admitted …` → 400 `evidence: rows are written by Sentinel, not through this route`; `attestation:signed …` → 400 `attestation: rows …`; `entity_type:"evidence"` → 400 `evidence rows …` — **pass** | the script output |

**The person rows — run 2026-10-08 ~19:10 → 19:25 local** (the founder's own session, the owner of `ma4a-drill`, in the local
app through the Funnel; the 4100 bridge on master 096f2dd; Claude driving the founder's session in Claude's own tab). The pack went
`evidence_pack@1` (#2157) to `@14`, each change an `artefact_installed` row before its own evidence or attestation row.

| Row | Result | Evidence |
|---|---|---|
| E-0 | Settings shows the "audit pack" row with **Download audit pack** (the download is the founder's to start) and `evidence_pack` with no Install JSON… — **pass** | the screenshot |
| E-1 | Files ▸ Evidence ▸ **Make the evidence pack** → `✓ Made the evidence pack evp-0001 — …`; its folder `%APPDATA%\Sentinel\evidence\ma4a-drill` is the bridge's own (`storage_root` read back equal) — **pass** | #2157 |
| E-2 | Admit `photos/own.jpg` before any signature → `Not done — a lead must sign (a), (c) and (d) first; nothing was saved`, no row; sign (a) → #2159 (`text_sha256` e5fdcf84…2546), (c) → #2161 (f6103bd8…1bbc); the photo again → `a lead must sign (d) first`, no row; (d) → #2163 (6b4631ae…0f4a) — **pass** | the status lines, the rows |
| E-3 | `photos/own.jpg` → ev-0001 #2165; `scans/tiny.las` ("registered in source") → ev-0002 #2167, sha `76c6b5e9…3c44` = `certutil`; `scans/site.rcp` with `scans/site-registration.txt` → ev-0003 #2169, "not surveyable (no ReCap here)", the report no longer listed; `evidence_pack@7` (make 1, sign 2-4, admit 5-7); every item's sha equals the file's on disk — **pass** | the rows, the read-back |
| E-4 | One byte of `tiny.las` flipped, **Re-check** → `Re-checked 3 item(s): 1 changed — scans/tiny.las (changed since admitted). On hold until …`; #2171 `evidence:refused` (sha 45c66876…); On hold shows `evidence:scans/tiny.las` "refused by the evidence intake — changed since admitted"; the byte restored, **Admit** → `✓ Admitted scans/tiny.las as ev-0002`, #2173 `readmitted: true`, the hold cleared; `evidence_pack@9` is byte-identical to `@7` (same sha 29808e47…) — **pass** | the screenshots, the rows |
| E-5 | `photos/street.jpg` admitted from the web → ev-0004 #2175. The google-provider refusal, the 409 on an admitted file, `photos/none.jpg` and `../x` cannot be sent from the web as a person: pinned in `evidence-store.test.mjs` (b), (c) — **pass (web half live)** | #2175 |
| E-6 | (machine rows, above) — **pass** | |
| E-7 | A watch on the 4100 bridge's sockets (every 0.3 s) while `photos/extra.jpg` was admitted (ev-0006 #2184): remotes were loopback (the Funnel's local hops), the Supabase REST host (Cloudflare 104.18.x) and That Open's API (`platform.thatopen.com`, which resolves to AWS 35.156.x and 52.58.x — one connection each, 60 s apart) — the latter is the bridge's platform gate poller (`startPlatformGatePoll`), present in the idle watch too, before any evidence activity; `evidence-store.mjs` makes no outbound call (test (h): no fetch, imports from an allow-list) — **pass with a note** (the literal "no connection to That Open" does not hold for the bridge process while the gate poller is on; no evidence byte goes to it) | the watch logs |
| E-8 | The viewer's read-only Evidence section: not run live (the founder is the project's only owner; the second account's tab was gone) — pinned by `evidenceControls` in `evidence.test.ts` | |


## Session MA4b — Ask the owner and drawings (2026-10-08 local: the machine rows on the branch on the 4101 test bridge, the person rows live on master; Claude driving the bridge alone)

Built on `feature/ma4b-ask-the-owner` (e8d99b7), reviewed from three lenses (correctness, security and privacy, the web and its words)
with a skeptic per finding: 5 confirmed and fixed in 6a0f0fb (a flagged item's signatures checked for its own kind, not the body's;
the Ask the owner form kept across a re-render and a same-scope refresh; the request picker keeps its pick; a project or person
switch drops the draft, the picker and the open letters; one draft at a time), 4 refuted. 2840 tests.

| Row | Result | Evidence |
|---|---|---|
| R-1 | the machine credential `POST /cde/ma4a-drill/evidence/evp-0001/requests {recipient_kind:"owner", documents:["floor plans"]}` → 403 `a request needs a person — the letter names who asks: sign in. Nothing was saved.` — **pass** | the script output |
| R-2 | the machine credential `POST …/items {path:"drawings/A-101.pdf", kind:"drawing", request_id:"req-0001"}` → 403 `an admission needs a person — …` — **pass** | the script output |
| R-3 | `GET …/requests` → 404 `CDE route not found` (a request is read with the pack, `GET …/evidence/evp-0001`) — **pass** | the script output |

**The person rows — run 2026-10-08 ~19:17 → 19:22 local** (the same session):

| Row | Result | Evidence |
|---|---|---|
| R-4 | **+ Ask the owner…**, the fields filled (to the owner, "Drill Owner (example)", two documents, a purpose), then **Sign (b)** before drafting (#2177, `text_sha256` a66c8e12…8c92): the reload kept every field as typed (the review's fix, live) — **pass** | the screenshot |
| R-5 | **Draft the letter** → `✓ Drafted req-0001 — Sentinel sends nothing: copy the letter and send it yourself`, #2179 `evidence:requested req-0001 owner` with `{pack_id, request_id, recipient_kind, documents: 2, letter_sha256, actor}` — the recipient's name is not on the row (read back); the letter shown (subject with `ma4a-drill req-0001`, "Dear Drill Owner (example)", the two documents, the terms, "[your name and title]"); its sha256 matches the stored letter; **Copy** → `✓ Copied the letter of req-0001 — sign it and send it yourself` (the clipboard works in the platform's sandbox) — **pass** | #2179, the screenshot |
| R-6 | `drawings/A-101.pdf` → **Admit** opens the request picker (`answers req-0001 · to the owner`) → **Admit drawing** → ev-0005 #2181: `provider: "owner"`, `licence: "holder-permission"`, `request_id: "req-0001"`, `attestation_ids` (a) and (b), not surveyable; the line reads "drawing from the owner under req-0001" — **pass** | #2181, the read-back |
| R-7 | `drawings/fake.pdf` (begins `PK..`) under req-0001 → `Refused drawings/fake.pdf — the file does not begin as a .pdf does — renamed or damaged · on hold`, #2182, no pack version — **pass** | #2182 |
| R-8 | An image in the folder (`photos/extra.jpg`) offers **Admit** and **as drawing…** once the pack has a request — **pass** | the screenshot |

**Closing list:** `ma4a-drill` keeps its pack (`evidence_pack@14`: 6 items, 4 signatures, 1 request) and one hold (`evidence:drawings/fake.pdf`); the drill's synthetic files stay in its evidence folder; the letter was copied to the founder's clipboard by the Copy row.

## Session MA4c — sentinel-survey v0.1 and the survey jobs (2026-10-08 local: the machine rows on the branch on the 4101 test bridge, a harness for the kill path, the person rows live on master f7a31f2 through the Funnel; Claude driving)

Built on `feature/ma4c-sentinel-survey` from the plan `docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md` (four readers, a
planner, two critics — one found the Hough sized by absolute coordinates: 1.56 TiB at national-grid origins, fixed by local frames — and a
revision), built in three reviewed groups (one important finding fixed: a job's record said done before its result existed), a
whole-branch review with a real end-to-end run (14 candidates, deterministic, the child's environment five allow-listed keys, no
python.exe left), four minors fixed by the controller. The file cap is 300 million points (the Kladno scan has 250.5 million; MA-4h
measures the time). 26 Python tests, 2865 vitest. Project `ma4c-drill` ("MA-4c drill (sentinel-survey, scratch)"), attached to
`ma2e-office`, the founder its owner; its scans `two-storey.las` (sha `244cba9d…c8bc0d`, as the plan), `compressed.las` (the LAZ bit
set) and `site.laz`.

| Row | Result | Evidence |
|---|---|---|
| S-0 | `C:\Python314\python.exe -E -B -c "import sys, numpy; …"` → `3.14.2 2.4.6` in 0.2 s; nothing installed or downloaded for 4c; the survey's 26 tests pass in 3.3 s — **pass** | the output |
| S-1 | A pack made, (a) and (c) signed (#2193 for (c)), the three scans admitted (ev-0001 #2195, ev-0002 #2197, ev-0003 #2199); **Run survey** → `✓ Started job-0001 — sentinel-survey reads ev-0001 (scans/two-storey.las), ev-0002 (scans/compressed.las); refused ev-0003 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) — ↻ for its progress.`; done at once: `job-0001 · done · read ev-0001 · refused ev-0003 (…); ev-0002 (its points are compressed (LAZ) — …) · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · by <the founder> · … · ledger #2200`. A watch on the bridge's python.exe children (every 100 ms): each job's child held one socket, a listener on 127.0.0.1 — no remote address — **pass** | the status lines, the watch log |
| S-2 | **Candidates**: levels 0 and 3000; floors 39.68 and 39.77 m²; ceilings 2800 and 5800, height 2800; 8 walls, height 2800, thicknesses 300, 200, 300, 250 (L00) and 300, 200, 250, 300 (L01); fits 1.7-3.4 mm rms; every evidence ref `ev-0001#…`; `result.json`'s sha256 (a9ca930c…) equals the record's and the row's — **pass** | the read-back |
| S-3 | #2200 `build:run job-0001 · sentinel-survey 0.1.0 · done`, actor the founder, `claimed: false`, items ev-0001 and ev-0002, `read: ["ev-0001"]`, tools `sentinel-survey 0.1.0 LicenseRef-Sentinel; python 3.14.2 PSF-2.0; numpy 2.4.6 BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`, seed 1, `points_in` 47699, `gaps: null` — **pass** | #2200 |
| S-4 | **Run survey** again → job-0002 (#2201): its 14 candidates equal job-0001's as JSON; the result shas differ only through the receipt's times — **pass** | the read-back |
| S-5 | On 4101, the machine credential: `params.snap_mm` → 400 (D16 words), `seed` and `items` → 400 `… is not a survey job field — …`, a start → 403 `a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved.`, the list → 200, `job-0099` → 404 `no survey job job-0099 on ma4c-drill — nothing was saved` — **pass** | the script output |
| S-6 | Not run on a bridge: it needs the drill copy's `config/.env` edited (the founder's secret file, which Claude does not write). The words through the real `notSetUp`: a missing python → `… no Python where SENTINEL_PYTHON in config/.env points …`; a bare `python.exe` → `… SENTINEL_PYTHON must be the absolute path of a python.exe — nothing was saved`; `C:/Python314/python.exe` → none — **pass (by the function)** | the harness output |
| S-7 | A harness (the real build-jobs, survey-service and python.exe, deps injected) started a job on the Kladno file with a wrong sha, so the child was hashing 6.5 GB (3.1 s of CPU) when `taskkill /f` took the harness: the child was gone 0.39 s later (the stdin watchdog); a fresh process read the job `failed · the bridge stopped while it ran — nothing it found was kept; run it again`; no python.exe left — **pass** | the harness output |
| S-8 | On 4101, the open audit route: `{entity_type:"build", action:"build:run job-0001 · sentinel-survey 0.1.0 · done", new_value:{claimed:false}}` → stored as `build:run`, `claimed: true` (#2188); `{entity_type:"event", action:"build:run job-0001"}` → 400 `build: rows are receipts (entity_type "build") — nothing was saved` — **pass** | #2188 |
| S-9 | The owner's session: **Run survey** shown with no job running, **Candidates** on a done job; the viewer's view (no Run survey) rests on the web tests (no viewer on the project) — **pass (owner half live)** | the screenshots |
| S-10 | The real MCP server over stdio: `sentinel_build_status` listed; `{project:"ma4c-drill"}` → job-0002 done, job-0001 done; `{…, job:"job-0001"}` → 14 candidates (level, floor, ceiling, wall) — **pass** | the script output |

**Closing list:** `ma4c-drill` keeps its pack (3 items, (a) and (c)), two survey jobs in `%APPDATA%\Sentinel\jobs\ma4c-drill`, and one
forged open-route row (#2188, `claimed: true`, as designed); the harness's jobs are in Claude's scratchpad.

## Session MA4d — survey candidates to typed changesets, live (2026-10-09 local: the machine rows on the branch on the 4101 test bridge, the person rows and Revit 2024 on master f8ba2a5; Claude driving the founder's session and a scratch Revit copy)

Built on `feature/ma4d-survey-to-changesets` from the plan `docs/superpowers/plans/2026-10-08-ma4d-survey-to-changesets.md` (four
readers, a planner, two critics, a revision), in three reviewed groups and a whole-branch review with an end-to-end run (2 changesets, 7
ghosts, 4 pre-ticked, 3 gap groups, zero types, the forged-row and edited-result refusals); three important findings and seven minor
fixed (cdb6097). The founder's three answers: the 20 mm judged before placement on the larger of the fit and `face_dev_mm`; no add-in
change in 4d (Revit opens scan walls unticked); only the bridge builds changesets from a job. 2916 tests, 864/864 add-in pins, no
migration, no add-in change. Web 1.0.65 published. Project `ma4c-drill`, its job-0002 (#2201).

| Row | Result | Evidence |
|---|---|---|
| P-0 | The office has `guideline@1` and no catalogue (404); `guideline@1` (bds-dd-layerfree) and `type_catalog@1` (bds-type-catalog, sha a1c0436f…) installed on the project by the machine credential — standards only, no type made; no manifest; job-0002's `result.json` hashes to #2201's `70c9845a…`. The scratch Revit copy `ma4d.rvt` (from ma1-src_detached.rvt), bound to `ma4c-drill` in Project Setup; `GR-FFL` Elevation 0 = ProjectElevation 0; `BDS_EXT_ARC_CMU_200 mm` and `_300 mm` loaded; 90 wall types (read through the Revit MCP after placement — no clone, no 250 mm CMU) — **pass** | the read-backs |
| P-1 | Machine credential: propose → 403 `proposing from a survey job needs a person — …`; the open audit route `changeset_applied` and `changeset_proposed …` → 400 `changeset_ rows are written by Sentinel, not through this route`; no row, no changeset. The lead (web), job-0001 with one byte added to its `result.json`: the web refuses before sending (its read of the job); with `job.json` edited to carry the tampered sha (the web passes), the route → `Not done — job-0001's result is not trusted: its result.json does not hash to the sha256 on ledger #2200 — it changed after the job — run the survey again; nothing was saved`; with `job.json`'s ledger id set to the forged #2188 → `… ledger #2188 is not job-0001's own build:run row (the bridge's: build:run job-0001 · sentinel-survey … · done, claimed false) — … nothing was saved`; both files restored byte for byte. The body 400s (`pretick`, no frame) cannot be sent from the web as a lead: pinned in the tests — **pass** | the status lines |
| P-2 | **Propose…** job-0002, x 40000, L0 → `GR-FFL`, L1 blank → `✓ Proposed job-0002 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (Revit leaves every create for a person to tick) · 3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · ledger #2209` — **pass** | the status line |
| P-3 | #2205 and #2207 `changeset_proposed` (`claimed: false`, `job {job-0002, ledger 2201, 70c9845a…}`, `evidence [ev-0001 244cba9d…]`, `from_job` per element with its slice); #2208 `type_gap:run job-0002 · survey-planner · 3 group(s), 6 element(s)` (250 mm walls wanting `BDS_EXT_ARC_CMU_250 mm`, nearest 100/200/300/400; floors and ceilings "thickness not measured"); #2209 `build:run job-0002 · survey-planner 0.1.0 · proposed` (`survey_row #2201`, frame 40000/0/0, rotation 0, stated by the founder); the changesets: GR-FFL 3 ghosts, 0 pre-ticked; L01 4 ghosts, 4 pre-ticked; the catalogue unchanged (`type_catalog@1` a1c0436f…) — **pass** | the read-back |
| P-4 | Again, same frame → `Not done — nothing new to propose from job-0002 — every candidate that types is filed already (…: proposed; …: proposed): …; nothing was saved`; x 0 → `Not done — Survey job-0002 · GR-FFL (proposed) was filed from job-0002 with the scan moved 40000, 0, 0 mm, turned 0° — send that frame (one job is one frame), …; nothing was saved`; job-0001 → `Not done — Survey job-0002 · GR-FFL (from job-0002) is still proposed — decide or withdraw it before proposing another survey job: both would propose the same walls; nothing was saved` — **pass** | the status lines |
| P-5 | Type gaps (3): `Walls: "BDS_EXT_ARC_CMU_250 mm" is not in the catalogue — 2 element(s) (Location Exterior, 250 mm); nearest: …` · `GR-FFL · scan-L00-wall-4, Scan L01 job-0002 · scan-L01-wall-3 · reported by <the founder> · sentinel-survey · from survey job-0002 · evidence ev-0001#slice-L00, ev-0001#slice-L01 · ledger #2208`, no "(claimed …)"; Floors and Ceilings "no type named at thickness not measured" — **pass** | the screenshot |
| P-6 | Review desk: `Survey job-0002 · GR-FFL — 3 ghost(s)`, `from survey job-0002 (ledger #2201) · the scan moved 40000, 0, 0 mm, turned 0°, stated by <the founder> · storey GR-FFL (named — its height not checked: nothing here is pre-ticked)`; per wall `measured from job-0002 · 300 mm thick · fit 2 mm rms · faces 0 mm off · within tolerance (20 mm) · not pre-ticked · ends -140 / -136 mm to the corners · evidence ev-0001#slice-L00`; **Show creates in 3D** on L01: the three placed walls drawn as a U, the level not drawn — **pass** | the screenshots |
| R-1 | Revit 2024 (the Sentinel add-in loaded once at the unsigned-add-in prompt), the scratch copy: Review AI Proposals lists both changesets; GR-FFL: three walls **unticked**, `BDS_EXT_ARC_CMU_300/200/300 mm · GR-FFL · within tolerance…`, each marked `✗ rejected (1)` by the office IDS's element check (the changeset's adjudication `accepted`); three "Sent to a person" (wall-4 250 mm, the floor, the ceiling). Tick group → **Apply 3 ticked in Revit** → `Applied 3 element(s) … reported (ledger #2210)`. Read through the Revit MCP: wall-1 `CMU_300` (40 125, 150)→(47 850, 150), wall-2 `CMU_200` (40 125, 5 900)→(47 850, 5 900), wall-3 `CMU_300` (47 850, 150)→(47 850, 5 900), all on GR-FFL, base offset 0, top unconnected at 2800; **two corners joined** at x 47 850, free ends at x 40 125 (wall-4 a gap); no cloned type. #2210 `changeset_applied`: `job {job-0002, ledger 2201, 70c9845a…}`, `evidence [ev-0001 244cba9d…]`, `from_job` per wall with `cid`, `ev-0001#slice-L00` and its `revit_unique_id`, rejected 0 — **pass** (the IDS mark is the office ruleset's, not the planner's) | the screenshots, the read-backs |
| R-2 | One Ctrl+Z removed all three (one Undo entry) → #2211 `changeset_reverted {op: undo, count: 3, guids}`; Ctrl+Y → #2212 `{op: redo, count: 3}`; the copy closed without saving; `Survey job-0002 · Scan L01 job-0002` withdrawn (the machine credential); GR-FFL stays `applied` on the bridge — **pass** | the read-backs |
| R-3 | **Propose…** job-0002 again (40000/0/0/0, levels blank) → `✓ Proposed job-0002 — 1 changeset(s), 4 ghost(s), 4 pre-ticked … · scan-L00-level → GR-FFL (filed, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · 3 already filed (not proposed again) · ledger #2217`; the new L01 changeset withdrawn — **pass** | the status line |

**Closing list:** `ma4c-drill` keeps `guideline@1` and `type_catalog@1` (project), GR-FFL's changeset `applied` (the scratch copy was not
saved), two L01 changesets withdrawn, the type-gap groups in the Holding Area; `Documents\Sentinel drills\ma4d.rvt` is the unsaved drill
copy (binding not saved). Follow-ups noted: the office IDS marks each scan wall `rejected (1)` in Revit — the scan walls carry no BDS
parameters yet (MA-5/MA-7 fill parameters); the add-in's Review button opened the changeset only on a double-click of its row here.


## Session MA4e — a placed survey changeset measured against its scan (2026-10-09 local: the machine rows on the branch on the 4101 test bridge, Revit 2024 and the refusals on master ce4c86e; Claude driving the founder's session and a scratch Revit copy)

Built on `feature/ma4e-deviation` from the plan `docs/superpowers/plans/2026-10-09-ma4e-deviation.md` (four readers, a planner, two
critics, a revision), in three reviewed groups and a whole-branch review (its findings fixed in d1f8001). The bridge suite 2311 passed at
the merge, no migration, no add-in change. Merged ce4c86e, web 1.0.66 published, 4100 restarted on master. Project `ma4c-drill`, job-0002
(#2201), changeset `Survey job-0002 · GR-FFL` (#2205, applied #2210, Undo #2211, Redo #2212).

| Row | Result | Evidence |
|---|---|---|
| V-0 | `two-storey.las` sha `244cba9d…`, job-0002 `result.json` `70c9845a…` (= #2201); GR-FFL `applied`, storey `GR-FFL` named, not checked, walls 300/200/300, reported by the founder (`owner`); its `changeset_` rows #2205, #2210, #2211 undo, #2212 redo (the newest decides: placed); no `verify:` row on the ledger (2096 rows, top #2218) — **pass** | the read-backs, SQL |
| V-1 | Machine credential (4101, then 4100 on master): `POST cde/ma4c-drill/verify {changeset}` → 403 `measuring a changeset against its scan needs a person — it reads the whole scan, and its row names who asked: sign in. Nothing was saved.`; the open audit route with `verify:measured …` on the changeset and as an `event` → 400 `verify: rows are written by Sentinel, not through this route`; no row. The person-side 400/409s (`results`, a bad id, a withdrawn changeset) are pinned in the tests, not run live — **pass (machine half)** | the status lines |
| V-4 | The measure on the drill's own bytes, in memory (`pipeline.deviation`, nothing written): GR-FFL wall-1 as filed p95 3 mm; moved 30 / 60 / 120 / 1000 mm → 33 / 63 / 123 / null (0 points); modelled 400 mm thick → p95 53, mean −50; one face unseen (the scan less \|y\| < 10) and placed 250 mm off → 1752 points, p95 253, coverage 0.5 (out of tolerance, not insufficient data) — **pass** | the script's output |
| R-1 (gate) | **Propose…** job-0002 again (40000/0/0/0, levels blank) → `… scan-L01-level → Scan L01 job-0002 (created) · 3 already filed (not proposed again) · ledger #2222`; `ma4d.rvt` bound to `ma4c-drill` (Project Setup), Review AI Proposals → `Survey job-0002 · Scan L01 job-0002` (1dc57c2f…) → the level (`✓ accepted`) and three walls (`✗ rejected (1)`, the office IDS, as MA4d) ticked → **Apply 4 ticked in Revit** → `Applied 4 element(s) … (ledger #2223)`. Through the Revit MCP (read only): wall-1 `CMU_300` (40 125, 150)→(47 850, 150), wall-2 `CMU_200` (40 125, 5 900)→(47 850, 5 900), wall-4 `CMU_300` (47 850, 150)→(47 850, 5 900); **Location Line 0 (Wall Centerline) on all three**; **type Width 300 / 200 / 300 = `measured.thickness_mm` of scan-L01-wall-1/2/4** in job-0002's `result.json`; base offset 0, top unconnected 2800 (to 5800); level `Scan L01 job-0002` at 3000. **Level error GR-FFL: 0 mm** (Elevation 0 against the L00 storey's 0 + dz 0); **Scan L01: 0 mm** (created at the scan's height, 3000) — **pass, the gate is open** | the screenshots, the read-backs, #2222, #2223 |
| V-5 | After the merge and the 4100 restart: no `verify:` row on the ledger (2101 rows, top #2223 — the five since V-0 are the drill's propose, withdraw and apply rows); the machine credential's forged `verify:measured` on 4100 → 400 — **pass** | SQL, the status lines |
| V-2 | The founder's session (local app, signed in, `owner`), Review desk → `Survey job-0002 · GR-FFL` → **Measure against the scan** → `✓ Measured Survey job-0002 · GR-FFL against the scan as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2224`; under the report `Measured against the scan as filed (… not re-read from Revit …) · placed as Revit reported (by <the founder>) · … · ledger #2224 · 2026-10-09 16:42 UTC · by <the founder>` and per wall `within tolerance (20 mm, p95) · p95 3 mm · mean 0 mm · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100%` with 3512 / 3523 / 2569 points (the plan's in-memory numbers); the button reads **Measure again**; no python.exe left after the reply. **Measure again** at once → `Not measured — Survey job-0002 · GR-FFL was measured on these same inputs as ledger #2224 — the same bytes, seed and geometry give the same numbers; nothing was saved`; no row — **pass** | the screenshots, tasklist |
| V-3 | #2224: entity `changeset` e9130eec…, `claimed: false`, `reference: "as filed"`, `status: done`, `applied_row` 2210, `reverted_row` 2212, `placed_by.reported_role` owner, `faces_sha256` dd7fbd28…, `job {ledger_id 2201, result_sha256 70c9845a…}`, `measure {band_mm 400, edge_mm 200, cell_mm 200}`, `target_mm` 20, `min_coverage` 0.25, 3 elements, `model_calls` 0 — **pass** | SQL |
| R-2 | `Survey job-0002 · Scan L01 job-0002` → **Measure against the scan** → `✓ … 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #2225`; `Scan L01 job-0002 — not measured · a level has no face to measure — its height against the scan is MA-4h's level error`; wall-1 / wall-2 / wall-4 p95 3 mm, mean −0.1 / +0.1 / 0 mm, 100% seen, 3512 / 3513 / 2567 points — **pass** | the screenshots |
| R-3 | Ctrl+Z in `ma4d.rvt` (a "not saved recently" reminder cancelled, nothing saved) → #2226 `changeset_reverted {op: undo, count: 4}`; desk ↻ → `… ledger #2223 · undone in Revit after the report (ledger #2226)` and **no Measure**. Ctrl+Y → #2227 `{op: redo, count: 4}`; ↻ → `undone, then redone in Revit (ledger #2227)`, **Measure again** → `✓ … 1 not measured · ledger #2228` (a second row: `reverted_row` 2227, the same `faces_sha256` 858289c4…). `ma4d.rvt` closed without saving — **pass** | the screenshots, SQL |
| V-5 (again) | Three `verify:` rows on the ledger, all this drill's (#2224, #2225, #2228) — **pass** | SQL |

**Closing list:** `ma4c-drill` now also holds the L01 changeset 1dc57c2f… `applied` (#2223, undone #2226, redone #2227) and three
`verify:measured` rows (#2224, #2225, #2228); `Documents\Sentinel drills\ma4d.rvt` was closed without saving. Drill MA4e passed in full.

## Session MA4f-1 — Revit's pre-tick and Revit's re-read, live (2026-10-09 local: merged c4f5ddc, web 1.0.67, the add-in deployed 2021–2027 at 20:11; the founder's session and a scratch Revit 2024 copy; Claude driving)

Built on `feature/ma4f-revit-scan` from the plan `docs/superpowers/plans/2026-10-09-ma4f-revit-scan.md` (four readers, a planner, two
critics, a revision), in three reviewed groups and a whole-branch review (two important findings fixed in 71791ab: `meshFaces` holds a
re-read to the filed wall both ways, and refuses a side under 1 mm across). 2367 bridge and desk tests, 878/878 add-in pins, every Revit
version compiled; no migration. Project `ma4c-drill`, job-0003.

| Row | Result | Evidence |
|---|---|---|
| D-0 | Revit closed; the ledger 2106 rows (top #2228, 3 `verify:` rows); no proposed changeset on `ma4c-drill` — **pass** | SQL, the bridge |
| D-1 | Merged c4f5ddc; 4100 restarted on master; `build.ps1` built and deployed 2021–2027 (each `Sentinel.dll` 20:11); web 1.0.67 published; the range scanned and pushed — **pass** | the build log, the file times |
| R-1 | The founder's session: **Run survey** → `job-0003 · done · … 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · ledger #2229`; **Propose…** x 40000, L00 → `GR-FFL` → `✓ Proposed job-0003 — 2 changeset(s), 7 ghost(s), 4 pre-ticked … scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0003 (created) · the same scan was placed before by Survey job-0002 · GR-FFL, Survey job-0002 · Scan L01 job-0002 · ledger #2235`; changesets b43c1fc8… (GR-FFL) and e5f2b4ae… (L01) — **pass** | the status lines |
| R-2 | Revit 2024 (Load Once — clicked by the founder: Windows' text-input host held the foreground), `ma4d.rvt` bound to `ma4c-drill` in Project Setup ("Signed in as <the founder>"); Review AI Proposals: **GR-FFL's three walls open unticked** (the level not checked); **L01: the created level opens ticked** (`within tolerance`, `✓ accepted`), **its three walls unticked** (`✗ rejected (1)`, the office IDS), "Apply 1 ticked in Revit"; Untick all → **Tick suggested** → the level alone; the walls ticked by hand — **pass** | the screenshots |
| R-3 | **Apply 4 ticked in Revit** → `… reported (ledger #2236)`; the bridge's doc: `reported_role` owner, the level no `reread`, each wall `reread {mesh_sha256 (64 hex), faces}`: wall-1 (300) ±150 mm from its filed line, u 0..7875; wall-2 (200) ±100, u 0..7875; wall-4 (300) ±150, u 150..5650; all z 3000..5800 — Wall Centerline, the type's width and Revit's joins (wall-1 and wall-2 run through to the outer corner at x 48 000, wall-4 butts between them); #2236 carries the same shas and faces, no mesh — **pass** | the read-back, SQL |
| R-4 | Review desk → `Survey job-0003 · Scan L01 job-0003` → **Measure against the scan** → `✓ Measured … against the scan as Revit re-read it (the add-in's claim) — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #2237`; the head `Measured against the scan as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen) · placed as Revit reported (by <the founder>) …`; walls p95 3 mm, 3559 / 3565 / 2447 points (as filed they were 3512 / 3513 / 2567: the joins seen), 99 / 99 / 100% seen. #2237: action `verify:measured job-0003 · sentinel-survey 0.1.0 · done · revit (claimed) · 3 within tolerance, …`, `claimed: true`, `reference: "revit (claimed)"`, each wall's `mesh_sha256` equal to #2236's. **Measure again** at once → `Not measured — … was measured on these same inputs as ledger #2237 — …; nothing was saved`, no row — **pass** | the screenshots, SQL |
| R-5 | `ma4d.rvt` closed without saving; Revit closed; `Survey job-0003 · GR-FFL` stays proposed for drill MA4f-2 — **pass** | — |

**Follow-up fixed on the 4f-2 branch (698250f):** the Propose line's "(Revit leaves every create for a person to tick)" was stale after
MA-4f-1; it now says Revit opens them ticked too, less what the office IDS rejects.

## Session MA4f-2 — the scan overlay in Revit, live (2026-10-09 local: merged 1e9b83c, web 1.0.68, the add-in deployed 2021–2027 at 22:12; Claude driving Revit 2024 on the scratch copy, signed in as the founder)

Built on `feature/ma4f2-scan-overlay` in a worktree (so the live bridge ran only merged code during drill MA4f-1), from the plan's
MA-4f-2 half: three reviewed groups and a whole-branch review (no critical or important finding; five minors fixed in eecbfbc). 2955 web
and bridge tests, 44 survey tests, 888/888 add-in pins, every Revit version compiled; no migration, sentinel-survey still 0.1.0.

| Row | Result | Evidence |
|---|---|---|
| V-0 | The machine credential, `GET /changesets/ma4c-drill/e9130eec…/scan` on 4100 → 403 `showing a changeset's scan needs a person — it reads the whole scan on this PC's one survey slot: sign in (in Revit: Standards ▸ Sign in) — its scan is not shown`; no python.exe started; no row — **pass** | the status line, tasklist |
| V-1 | In memory on the drill's bytes (sha 244cba9d…, the worktree's sentinel-survey): band 300–2500 → 4502 points of 11 362 at the 100 mm cube, the cube doubled to 200 mm, z 300..2500, moved by dx 40 000: x 39 997..48 003, y −3..6003, 0.06 s; band 3300–5500 → 4506 of 11 379, z 3301..5500 — **pass** | the script's output |
| D-1 | Merged 1e9b83c (4f-2 and drill MA4f-1's record); 4100 restarted on master; `build.ps1` 7 builds, 0 errors, each `Sentinel.dll` 22:12; web 1.0.68 published (the Propose line's pre-tick words); scanned and pushed — **pass** | the build log |
| R-1 | Revit 2024 (Load Once by the founder: Windows' text-input host held the foreground), `ma4d.rvt` bound to `ma4c-drill`, signed in as the founder; Review AI Proposals → `Survey job-0003 · GR-FFL` → **Show the scan** → `Reading the scan on the bridge…` → `Scan: 4502 of 11362 point(s) drawn as cyan crosses — job-0003 (ledger #2229), one point per 200 mm, 300–2500 mm high (the walls less 300 mm at the floor and ceiling), placed by the lead's frame; nothing is written. Untick to hide.`; the crosses sit on the ghost walls' faces and trace wall-4 (the type gap, no ghost); the Doctor: `Scan overlay: asked for the ThreeD view "{3D}" — this model: True; 13506 line(s), 0 face(s)` and `… drawn in … 13506 line(s), 0 face(s)` — counts only — **pass** | the screenshots |
| R-2 | The plan `WIP_FP_GR_FFL`: `Scan overlay: drawn in the FloorPlan view … 13506 line(s)`; the crosses trace both faces of all four walls — the view range does not cut them (DirectContext3D draws over it). The section box was **not observed**: after Apply no proposed survey changeset was left to reopen with the overlay — **pass (plan); section box owed** | the screenshots |
| R-3 | Untick → the crosses go, the line is MA-3c's ghost line again; tick → one python.exe during the read, none after, the Scan line back; four quick untick/tick clicks end on the scan drawn (each read under a second: no 409 met); tick the three walls → **Apply 3 ticked in Revit** → `reported (ledger #2238)` — the ghosts go, **the crosses stay** on the placed CMU walls; close the window → the crosses go. A misclick on the Undo button (meant for its drop-down) undid the Apply → #2239 `changeset_reverted {op: undo}` — one Undo took all three walls (Apply's entry was the top one; nothing of the overlay is on the Undo list); Ctrl+Y → the redo row. Bonus for MA4f-1: GR-FFL's walls re-read on the bridge — ±150 / ±100 / ±150 mm from their filed lines, u 0..7875, 0..7875, 150..5650, z 0..2800, `reported_role` owner — **pass** | the screenshots, SQL, the read-back |
| R-4 | Zoomed in and out and orbited with 13 506 lines drawn: no stall — **pass** | — |
| R-5 | `ma4d.rvt` closed without saving; Revit closed — **pass** | — |

**Closing list:** `ma4c-drill` holds job-0003 (#2229), its two changesets applied (L01 #2236, GR-FFL #2238, undone #2239 and redone),
#2237 (`revit (claimed)`); the scratch copy is unsaved. Owed: the section-box observation (open question 4) on the next survey changeset.

## Session MA4g — LAZ, E57 and the scan's CRS in sentinel-survey 0.2.0, live (2026-10-10 local: merged ce1278b, web 1.0.69; the founder's session; Claude driving)

Built in a worktree from the plan `docs/superpowers/plans/2026-10-09-ma4g-e57-laz.md` (four readers, a planner, two critics, a revision;
the controller's override: the wheels in a private folder, `%APPDATA%\Sentinel\survey-lib`, never the shared user site), in three reviewed
groups and a whole-branch review (one important and five minor findings fixed in 03c1143). 62 survey tests (skipped 0), 2956 web and bridge
tests; no add-in change, no migration. The plain-LAS read is bit-identical to 0.1.0 on the drill's bytes.

| Row | Result | Evidence |
|---|---|---|
| Install | The four wheels (laspy 2.7.0, lazrs 0.8.2, pye57 0.4.19, pyquaternion 0.9.9; the founder's download OK, each sha256 = PyPI's and = `survey/requirements-ma4g.txt`) installed with `pip --isolated --no-index --only-binary :all: --no-deps --require-hashes --target "%APPDATA%\Sentinel\survey-lib"` in 2 s; `pip freeze --user` unchanged byte for byte; `pip list --path` shows exactly the four — **pass** | the logs |
| V-0 | The ledger 2118 rows (top #2240); the drill scans `two-storey.las` and `site.laz` 244cba9d…, `compressed.las` 0f8e3484…; newest job job-0003; 4100 on master — **pass** | SQL, sha256 |
| V-1 | The bridge's interpreter (only `SYSTEMROOT`, `APPDATA`, `TEMP`, `TMP`; `-E -B`) imports the four from the private folder: `2.7.0 0.4.19 ['LazrsParallel', 'Lazrs']`, no DLL missing — **pass** | the output |
| V-1b | An E57 shell whose root carries `xsi:noNamespaceSchemaLocation="http://127.0.0.1:<port>/x.xsd"` → `its XML is not plain UTF-8, or it declares a DTD, an entity or a schema location — an E57 whose parser could fetch a file is not read`; the listener: **no connection** in 3 s — **pass** | the output |
| V-2 | In memory, one run over ev-0001 (LAS), ev-0002 (`compressed.las`), ev-0003 (`site.laz`), `real.laz` (laspy from the drill LAS, a fixture CRS ETRS89 / UTM 33N) and `two-storey.e57` (pye57, two posed halves): `done`; ev-0002 refused `its points are marked compressed (LAZ) but no LASzip record was found — it is not read as a LAZ; export it again`; `inputs` las / las / laz (`crs {wkt, epsg 25833, metre, dcb5b44b…}`, `metres (its CRS)`) / e57 (two scans, posed); 2 / 8 / 2 / 2, walls 200, 200, 250, 250, 300 ×4; `points_in` 190 796, `points_used` 53 539; `tools` with every wheel and its bundled licences; 0.4 s — **pass** | the output |
| V-3 | The private folder renamed away: ev-0001 and ev-0003 read; ev-0004 `a LAZ is read with laspy and lazrs — not importable under this Python …; install the four pinned wheels offline, as survey/requirements-ma4g.txt says`; ev-0005 likewise for pye57; the user site unchanged; renamed back → all read — **pass** | the output |
| D-1 | Merged ce1278b; 4100 restarted on master; secret scan; pushed. **Incident in the teardown:** the junction's removal (blocked by the Fact-Forcing Gate) and `git worktree remove` were sent together; git followed the junction and deleted `.bin`, `.package-lock.json`, `.vite`, `3d-tiles-renderer`, `@anthropic-ai/sdk`, `@babel/runtime` and `@dimforge/rapier3d-compat` from the main `WebApp/node_modules` before stopping at `@esbuild`. `.bin` was rebuilt offline (`npm rebuild --ignore-scripts --offline`); the four packages were downloaded on the founder's OK (registry.npmjs.org, 4.3 MB), each sha512 = the lock's `integrity`, unpacked into their own folders only; the web built; web 1.0.69 published. (`npm install` was not used: the working-copy lock is ahead of the installed tree and would have changed 22 packages.) — **pass, with the incident** | the logs |
| D-2 | `real.laz` (a51e8741…) and `two-storey.e57` (8a7426c9…) placed in the drill's evidence folder — **pass** | sha256 |
| R-1 | The founder's session: **Admit** `scans/real.laz` → `✓ Admitted scans/real.laz as ev-0004 · sha a51e87410d0d… · ledger #2242`; `scans/two-storey.e57` → `ev-0005 · sha 8a7426c919f0… · ledger #2244` (registered in source) — **pass** | the status lines |
| R-2 | The Survey line reads "reads the admitted LAS, LAZ and E57 scans on this PC"; **Run survey** → `✓ Started job-0004 — sentinel-survey reads ev-0001 … ev-0005`; ↻ → `job-0004 · done · read ev-0001, ev-0003, ev-0004, ev-0005 · refused ev-0002 (its points are marked compressed (LAZ) but no LASzip record was found — …) · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · ledger #2245`. #2245: `build:run job-0004 · sentinel-survey 0.2.0 · done`, `claimed: false`, `read` the four, 190 796 / 53 539, `tools` every wheel with its licence; the receipt's `inputs` = V-2's. The watch on the bridge's child (pid 44960): `lazrs`, `libe57` and `xerces-c_3_2.dll` loaded; its only socket a 127.0.0.1 listener — **pass** | the status lines, SQL, the watch |
| R-3 | **Propose…** job-0004, 40000 / 0 / 0 / 0, L00 → `GR-FFL` → `✓ Proposed job-0004 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (Revit opens them ticked too, less what the office IDS rejects; a person clicks Apply) · 3 type-gap group(s), 6 element(s) … · the same scan was placed before by … job-0002 …, … job-0003 … · ledger #2251` — job-0003's numbers: a 0.2.0 row is trusted. Both changesets left proposed — **pass** | the status line |

**Closing list:** `ma4c-drill` holds ev-0004 and ev-0005, job-0004 (#2245) and its two proposed changesets (#2251). The wheels stay in
`%APPDATA%\Sentinel\survey-lib`. Next: MA-4g-3 (the computed frame) waits for the founder's choice of the model's georeference.

## Session MA4h — Kladno, the public scan, at full size from its national grid; the hand-built reference and the baseline (2026-10-10 local: merged 7d3e82c, web 1.0.70; the founder's session; Claude driving)

Built in a worktree from the plan `docs/superpowers/plans/2026-10-10-ma4h-kladno.md` (four readers, a planner, two critics, a revision),
in three reviewed groups and a whole-branch review (no critical or important finding; seven minors fixed in 5c5c829). 67 survey tests,
2964 web and bridge tests; no migration, no add-in change, sentinel-survey still 0.2.0. The PC: 32 GB, 32 threads.

| Row | Result | Evidence |
|---|---|---|
| R-0 | The licence, read at its source (Zenodo record 14221915, read only): "Original point cloud from laser scanning of the Kladno railway station", creator Urban, Rudolf (Czech Technical University in Prague), Creative Commons Attribution 4.0 International, published 2024-11-26, v1; its file's md5 b11e3df8… = the downloaded file's. Read by Claude (the founder said "continue"); the founder then said "go" to (f) — **pass** | the record page |
| V-0 | 4100 on master; the file's md5 matches (13 s); sha256 18e67434… (7 s); no `kladno-drill` yet — **pass** | the hashes |
| T-0 | `zpeaks` (40 s): the fullest bins at 409 631 (GF floor), 414 501–414 521 (1F), 413 381 (GF ceiling), 418 181 / 418 671 (attic); slices at 409 631, 414 511 and 418 181, about 31 s each, 3375 × 3356 px of 20 mm, one origin; side shas gf 9dea001f…, 1f 970b38cc…, attic a7fe5a17…; the GF image reads as a plan with walls at 45° — **pass** | the side records |
| D-1 | Merged 7d3e82c; 4100 restarted on master (the founder refreshed the Funnel); web 1.0.70 published; no scan data tracked; scanned and pushed; the worktree torn down after the tracing (the junction removed alone first) — **pass** | the logs |
| R-1 | Machine credential: `kladno-drill` (office ma2e-office); the founder its owner (the address copied from `ma4c-drill`'s owner, never printed); `guideline@1` 8bcd989f… and `type_catalog@1` a1c0436f…; the dataset pack evp-0001 with `dataset {zenodo, the DOI link, CC-BY-4.0, attribution}` — **pass** | the replies |
| R-2 | The scan hard-linked into `%APPDATA%\Sentinel\evidence\kladno-drill\scans` (both names listed by fsutil), `attrib +R`; the pack lists it, 6 513 510 452 bytes, not admitted — **pass** | the read-back |
| T-1 | The founder drew a 10-line first-minute check, then asked Claude to "do the rest of the traces"; the check's lines did not sit midway between the faces, so it is kept apart as `gf.png.trace.founder-check.json` (2945a224…), not scored. **Claude traced the reference:** 20 tracers on 20 m tiles at full resolution (faces measured on pixel profiles), a snap of each centreline to the slice's faces, a merge of the tiles' duplicates, then 20 reviewers (removed doubled lines and stair or balustrade lines, corrected ends; found no missed wall). GF 45 walls (13 guessed), 1F 61 (1 guessed), attic 3 floor samples; floor samples chosen among the offered ones by the points they hold (two GF samples in the SE hall held none). Traces gf 8e2d11ee…, 1f 5513dfd0…, attic 2e6dc9cd… — `traced_by` says Claude, at the founder's request, and how. No job existed while tracing — **pass (traced by Claude, disclosed)** | the traces, the overlays |
| T-2 | `reference.json` (41 s): scan 18e67434… (= V-0); GF ffl 409 629.5 mm (samples 409 600.0 / 409 633.8 / 409 629.5), 1F 414 488.6 (414 488.6 / 414 499.2 / 414 487.3), attic 418 133.1 (418 121.7 / 418 167.5 / 418 133.1); file sha ce1a4f46… — **pass** | the file |
| R-3 | The dataset line in the founder's tab: `Published dataset — zenodo · CC-BY-4.0 · https://doi.org/10.5281/zenodo.14221915 · attribution: … A lead signs (f), then admits its scans.`, only (f) listed; on the founder's "go": **Sign (f)** → #2258 `attestation:signed f evp-0001`, `text_sha256` be54e048… — **pass** | the screenshot, SQL |
| R-4 | **Admit** the scan, registration "as published (one registered cloud, no report)" → `✓ Admitted scans/Kladno station pointcloud.las as ev-0001 · sha 18e674345edf… · ledger #2260`, 10–18 s from the click — **pass** | the status line |
| R-5 | **Run survey** → `✓ Started job-0001 — sentinel-survey reads ev-0001 (scans/Kladno station pointcloud.las)`; `job-0001 · done · read ev-0001 · 2 level(s), 470 wall(s), 2 floor(s), 3 ceiling(s) · ledger #2261`. #2261: `build:run job-0001 · sentinel-survey 0.2.0 · done`, `claimed: false`, 250 519 618 points in, 8 420 924 used, 181 s CPU, 3.6 min. The watch on the bridge's child: 216 s alive, peak working set 6.54 GB (the memory-mapped scan's pages counted), only 127.0.0.1 sockets — **pass** | the status lines, SQL, the watch |
| R-6 | **Propose…** at frame 0 → `Not done — the frame puts the scan 1287 km from the model's internal origin — Revit draws a model within 32 km of it; state where the scan sits in the model (with no turn, dx_mm 763974000 and dy_mm 1035484000 bring its middle to the origin, dz_mm -409631 its lowest storey to 0) — nothing was saved`; with that frame → `✓ Proposed job-0001 — 0 changeset(s), 0 ghost(s), 0 pre-ticked … · 131 type-gap group(s), 475 element(s) in the Holding Area · scan-L00-level → Scan L00 job-0001 (created); scan-L01-level → Scan L01 job-0001 (created) · ledger #2263` (#2262 the gap row): with the BDS catalogue no Kladno wall types — **pass** | the status lines |
| T-3 | `result.json` sha 6eae16cb… = #2261's `result_sha256`; `score` from master 7d3e82c: **levels** GF +1.5 mm, **1F missed**, attic +543.9 mm; **walls** (GF scored, 1F all false negatives; the attic's 50 walls not scored) at 50 / 100 / 200 mm: TP 12 / 16 / 19, FP 408 / 404 / 401, FN 94 / 90 / 87, P 0.029 / 0.038 / 0.045, R 0.113 / 0.151 / 0.179, **F1 0.046 / 0.061 / 0.072**, tp_unpaired 0 / 3 / 4, completeness 0.143 / 0.208 / 0.257, correctness 0.175 / 0.277 / 0.354; GF alone F1 0.052 / 0.069 / 0.082 (420 candidates against 45 walls). The honest baseline MA-4h-3 starts from — **recorded** | score.json |

**Closing list:** `kladno-drill` holds evp-0001 with (f), ev-0001 (the Kladno scan, hard-linked, read-only), job-0001 (#2261) and its
proposal (0 changesets, 131 gap groups in the Holding Area, two levels created). The reference files live beside the scan
(`%USERPROFILE%\SentinelData\kladno\reference`, outside the repo). Next: MA-4h-3, the knobs — its own plan, starting from these numbers
(SLAB_MAX for 1F, double faces, MIN_FACE, the fragmentation).

## Session MA4h3 — the knobs measured on Kladno, sentinel-survey 0.3.0 (2026-10-10 local: merged 34f8692; the founder's session; Claude driving)

Built from the MA-4h plan's protocol ("MA-4h-3: the knobs") and recorded in `docs/superpowers/plans/2026-10-10-ma4h3-knobs.md`: an
in-memory sweep (a scratch harness, never in the repo) against `reference.json` ce1a4f46…, one knob at a time, GF tuned and 1F held
out; one reviewer on the diff (no critical or important finding; four minors fixed in 794a2f0). 71 survey tests; no bridge, web,
add-in or migration change, and no restart (the bridge spawns the service per job).

| Row | Result | Evidence |
|---|---|---|
| S-1 | The sweep: the baseline reproduced T-3 exactly; `SLAB_MAX` 600 and 900 miss 1F, 1 200 finds it (+18.4 mm) with no extra level, 1 500 the same → **1 200**; clearing 2 then **3** cells, `MIN_FACE` 750 then **1 000**, each raising F1 at 100 mm on GF (tuned) and 1F (held out); `MAX_POINTS` not tried (at 50 mm completeness 0.40 is over correctness 0.32) — **chosen** | the plan's table |
| S-2 | The double face: 190 of 231 pairs under 100 mm (median 40 mm) → 61 of 162 (median 158 mm) — **pass** | the pair statistics |
| S-3 | Deviation with the reference walls (99 of 106 fitted from the cloud): `judge` as written (p95 ≤ 20 mm) reads 15 of 99 walls in place within and every shifted or thickened wall out; the share within 25 mm ≥ 0.4 reads 93 % in place within and 98 % of walls 50 mm off out, not 20 mm (87 % within) — **the founder's decision** (open question 8) | dev.json |
| S-4 | The attic's +543.9 mm is the reference's: its floor samples read the 1F ceiling's underside (418 181 mm); the survey's attic level is the attic floor's top (418 677 mm) — **finding**, the reference kept as recorded | the surfaces |
| D-1 | Merged 34f8692 (`--no-ff`); the next job runs 0.3.0 — **pass** | git |
| R-1 | **Run survey** → `job-0002 · done · read ev-0001 · 3 level(s), 367 wall(s), 3 floor(s), 2 ceiling(s) · ledger #2264`, reader sentinel-survey 0.3.0; 181 s (12:27:23–12:30:24), CPU 146 s, 8 420 924 of 250 519 618 points; the child's peak private commit 1.93 GB (sampled private 1.74 GB; the 6.54 GB working set is the LAS's mapped pages), its TCP loopback only — **pass** (≤ 5 min, ≤ 2.5 GB) | the watch log |
| R-2 | `result.json` sha c1d1657a…; `score`: levels GF +1.5, 1F +18.4, attic +543.9 mm (S-4); F1 at 50 / 100 / 200 mm 0.161 / 0.217 / 0.261 — 1F (held out) 0.294 / 0.330 / 0.376, GF 0.041 / 0.116 / 0.157; P 0.141, R 0.472 at 100 mm — equal to the in-memory run — **pass** (1F under the default 0.6 bar: the founder's) | score |
| R-3 | **Propose…** at the MA-4h frame (763 974 000 / 1 035 484 000 / −409 631 mm, no turn): the first click answered "Failed to fetch" in a network blip (the platform's own config fetch failed at 12:32–12:33 too; the bridge answered on loopback; no ledger row); the retry → `✓ Proposed job-0002 — 0 changeset(s), 0 ghost(s) … 144 type-gap group(s), 372 element(s) in the Holding Area · scan-L00/L01/L02-level → Scan L00/L01/L02 job-0002 (created) · ledger #2266`; #2265 `type_gap:run job-0002 · survey-planner · 144 group(s), 372 element(s)` — **pass** | the status line, the ledger |
| R-4 | A measure of a 0.2.0 job fails in words — pinned by `changesets-store.test.mjs` (Kladno types no element, so no live measure) — **covered by the test** | the test |

**Closing list:** `kladno-drill` holds job-0002 (#2264) and its proposal (#2266: 144 gap groups, three levels created) beside
job-0001. Owed to the founder (open question 8): the acceptance bars (1F F1 0.330 against 0.6), the deviation statistic (recommended:
the share within 25 mm at 0.4), the pair minimum thickness. Next: precision (faces that are not walls), the reference's attic floor
from above.

## Session MA4h4 — a wall face runs the storey's height, sentinel-survey 0.4.0 (2026-10-10 local: merged bbdf8f0; the founder's session; Claude driving)

Measured before it was built (`docs/superpowers/plans/2026-10-10-ma4h3-knobs.md` ▸ MA-4h-4): of the rules that separate GF's and 1F's
false positives from the true walls, the face's share of the storey's height (≥ 0.8) keeps 93–94 % of the true walls on both storeys
and passes the protocol. One reviewer (no critical finding; two important and three minors fixed in the review commit). 72 survey
tests; Python only, no restart.

| Row | Result | Evidence |
|---|---|---|
| S-1 | In memory at 0.4.0 against ce1a4f46…: F1 0.245 / 0.304 / 0.340 at 50 / 100 / 200 mm (0.3.0: 0.161 / 0.217 / 0.261); GF 0.184, 1F held out 0.419 at 100 mm; candidates 118 / 111 / 0 — **pass** (GF up, 1F up at every d) | the plan's table |
| D-1 | Merged bbdf8f0 (`--no-ff`); the next job runs 0.4.0 — **pass** | git |
| R-1 | **Run survey** → `job-0003 · done · read ev-0001 · 3 level(s), 229 wall(s), 3 floor(s), 2 ceiling(s) · ledger #2267`, sentinel-survey 0.4.0; 200 s (12:48:39–12:51:59), CPU 170 s, 8 420 924 points used; peak private commit 1.93 GB, loopback only — **pass** (≤ 5 min, ≤ 2.5 GB; the height pass adds ~20 s) | the watch log |
| R-2 | `result.json` sha 2b18cba…; `score` equal to S-1 exactly; levels GF +1.5, 1F +18.4, attic +543.9 (the reference's); the attic proposes 0 walls (its top is the roof's highest point — Next) — **pass** | score |
| R-3 | **Propose…** at the MA-4h frame → `✓ Proposed job-0003 — 0 changeset(s), 0 ghost(s) … 89 type-gap group(s), 234 element(s) in the Holding Area · scan-L00/L01/L02-level → Scan L00/L01/L02 job-0003 (created) · ledger #2269` (0.3.0: 144 groups, 372 elements) — **pass** | the status line |
| R-4 | A measure of a 0.3.0 job fails in words — pinned by `changesets-store.test.mjs` — **covered by the test** | the test |

**Closing list:** `kladno-drill` holds job-0003 (#2267) and its proposal (#2269) beside job-0001 and job-0002. Against the reference at
100 mm: precision 0.223, recall 0.481. Owed to the founder: open question 8 (the bars — 1F now 0.419 against 0.6 — the deviation
statistic, the pair minimum thickness). Next: a second tracer before a further precision rule; the attic's sloped-roof height.

## Session MA5a — doors and windows from scans, sentinel-survey 0.5.0 (2026-10-10/11 local: merged 74f4cdd, web 1.0.71; the fix 951842e, web 1.0.72; the founder's session; Claude driving)

Built and measured before the drill (`docs/superpowers/plans/2026-10-10-ma5a-scan-openings.md` ▸ As built and measured): each wall
face's occupancy grid finds its holes; a hole framed on 70 % of its border is a door (from the floor) or a window; two faces join by
their jambs; the bridge types an opening by an office rule, else by its size from the catalogue (exactly one row within 100 mm), else a
gap. The branch review (three lenses, a skeptic per finding) confirmed 9 important findings, all fixed before the merge.

| Row | Result | Evidence |
|---|---|---|
| T-0 / T-3 | The four sill and plan images traced, `reference-5a.json` sha 61ee7e01…; the kept knobs (`OPEN_W` 5, `OPEN_H` 10, `MIN_BORDER` 0.7, `LINTEL` 0.5) measured one at a time on the reviewed code — **pass** (the plan's table) | the plan |
| U-1 | Python 88 tests OK; bridge + web 2977 at the merge (2978 with the K-3 fix), 1 skipped — **pass** | the runs |
| K-1 | **Run survey** on `kladno-drill` → `job-0004 · done · read ev-0001 · 3 level(s), 202 wall(s), 3 floor(s), 2 ceiling(s), 72 door(s), 18 window(s) · ledger #2272`, sentinel-survey 0.5.0; 134 s, CPU 141 s, peak private commit 1.93 GB — **pass** (≤ 5 min, ≤ 2.5 GB) | the watch log, #2272 |
| K-2 | `score` against `reference-5a.json` equal to T-3's kept row: openings F1 0.259 / 0.293 / 0.345 at 50 / 100 / 200 mm (P 0.189, R 0.654 at 100; GF 0.133, 1F 0.394), every matched opening's class right; walls 0.299 / 0.357 / 0.396. Counts against the hand count: GF 29 doors + 7 windows (7 + 2), 1F 43 + 11 (17 + 0) — **pass** (precision is the number to watch) | score |
| K-3 | **Propose…** job-0004 at the MA-4h frame (763974000, 1035484000, −409631 mm), levels blank → `✓ Proposed job-0004 — 0 changeset(s), 0 ghost(s) … 76 type-gap group(s), 207 element(s) in the Holding Area · ledger #2293` (gaps #2292: 74 wall groups, 124 walls seen on one face). Every Kladno wall is a type gap on the BDS standards, so every door and window is held by its host — no size group (by design, the review) — **but the 90 held openings were said nowhere**: no changeset to carry them, not in the Holding Area, not on the line. **F-MA5a-1, fixed** in 951842e: a storey that files no changeset names its held doors and windows on the planner's row (`storeys[].held`), and the Propose line counts them (web 1.0.72) — **pass after the fix** (the count bar: no 413) | #2292, #2293, the test (m) |
| R-0 | `Documents\Sentinel drills\ma5a.rvt` (a scratch copy of ma4d.rvt, bound to `ma4c-drill`); the catalogue's window `BDS_Window_1 Panel+FX : 800x1200 mm` made present **by renaming the scratch copy's own `Window-Fixed : MA1 800 x 1200mm`** (Sentinel loads no families; the first Apply rolled back in words: `window type "BDS_Window_1 Panel+FX : 800x1200 mm" does not exist in this model` — #2282) — **pass, disclosed** | #2282 |
| R-1 | `two-storey-openings.las` admitted as ev-0006 (#2271, sha 0a6267a2…); **Run survey** → job-0005 (#2273, 0.5.0); **Propose…** at (40000, 0, 0), levels blank → Scan L00: level + 6 walls + `window: scan-L00-wall-5-window-1 · BDS_Window_1 Panel+FX : 800x1200 mm · sill 900 mm · insufficient data · typed by the bridge by size: 800 x 1200 mm, the one catalogue type within 100 mm`, not pre-ticked; the door a gap: `13 Doors types are named within 100 mm of 1000 x 2100 mm … — a person picks one` (#2285); two 250 mm walls gaps. Two stale MA4g proposals of the old job-0004 were declined first (#2274, #2275: another job's proposal blocks proposing). Proposed again after R-0 (#2284, #2286) — **pass** (the door types to no one row on BDS: the plan's "typed by size" is the window's) | #2284–#2286 |
| R-2 | Revit 2024, **Review AI Proposals** → Scan L00 → the level, host wall-5 and the window ticked → **Apply** → `Applied 3 element(s)` (#2287, partially applied: 5 unticked rejected); the Undo list holds one entry `Sentinel AI changeset: Survey job-0005 · Scan L00 job-0005 [6d386a31]`; the window's Sill Height reads 900 in Properties (both 800x1200 instances, no `<varies>`); its host is wall-5 by the executor's own check (`fi.Host` must be the chosen wall or the changeset rolls back, ChangesetExecutor.cs:607 — the only wall on the new level; the re-read puts it at x 67 700–68 000, the east wall) — the host was **not** read in Revit's UI (Select by ID did not take the driver's clicks). One Undo → `changeset_reverted` op undo, count 3 (#2288); Redo → op redo, count 3 (#2289) — **pass** (host by the executor's check) | #2287–#2289 |
| R-3 | The stored window: `typing {typed_by: "bridge-size", family: "BDS_Window_1 Panel+FX", type: "800x1200 mm", size: "800 x 1200 mm", band_mm: 100, catalog: "type_catalog@1 · project · a1c0436f6714…", catalog_sha256}`, `pretick: false`, `accuracy {basis: "framing", status: "insufficient_data", coverage: 0.889}`, `SillHeight` 900 — **pass** | SQL |
| V-1 | Review desk → **Measure against the scan** → `verify:measured … 1 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 2 not measured` (#2290): wall-5 p95 4 mm, coverage 0.965 (under 1.0: the window's hole), 9 421 points; the window `a window is not measured by sentinel-survey`; the level has no face — **pass** (the door was not placed: its words pinned in the tests) | #2290 |
| H-1 / H-2 | The size gap's words and the host gap holding its opening — pinned by `holding-logic.test.mjs` and `survey-plan.test.mjs`, not run live — **covered by the tests** | the tests |

**Closing list:** the L01 proposal of job-0005 declined in Revit with a reason (#2291); `ma5a.rvt` closed without saving, Revit closed.
`kladno-drill` holds job-0004 (#2272) and its gap-only proposal (#2293). The 4100 bridge runs the K-3 fix from its next restart (a
restart needs the founder's Funnel refresh). Owed to the founder: the both-faces filter (1F 0.394 → 0.686 at 100 mm, GF falls),
installing the BDS elements guideline (interior doors typed by rule), open question 8 (the bars, the deviation statistic, the pair
minimum thickness). Next: MA-5a's PDF half or MA-5b, as the roadmap splits MA-5.

## Session MA5a2 — survey trust, sentinel-survey 0.6.0 (2026-10-11 local: merged 9ea10b7, web 1.0.73, the 4100 bridge restarted on master; the founder's session after the Funnel refresh; Claude driving)

The founder's "go" on the measured recommendations (`docs/superpowers/plans/2026-10-11-ma5a2-survey-trust.md`): a door only when seen through
the wall; `faces_seen` per face; a thickness only clear of its faces' scatter; no pre-ticked scan wall; the per-face verdict, measured first
(20 mm at 0.2); the bars in the design. Reviewed by three lenses and a skeptic per finding (2 important fixed).

| Row | Result | Evidence |
|---|---|---|
| K-1 | **Run survey** on `kladno-drill` → `job-0005 · done · read ev-0001 · 3 level(s), 202 wall(s), 3 floor(s), 2 ceiling(s), 72 door(s), 18 window(s) · ledger #2296`, sentinel-survey 0.6.0; 167 s, peak private commit 1.93 GB — **pass** (≤ 5 min, ≤ 2.5 GB) | the watch log, #2296 |
| K-2 | `score` of its `result.json` against reference-5a: walls 0.299 / 0.357 / 0.396 (TP 46 / 55 / 61 — 0.5.0's, the ratchet holds); openings 0.259 / 0.293 / 0.345 (the survey emits every hole; the door rule is the bridge's); `faces_apart_mm` on exactly 8 walls (L00-1, -4, -6, -8, -10, -14, -17, L01-36), none on a traced wall at 50 mm; `faces_seen` GF 9 doors × 2, 20 × 1, 7 windows × 1 (the one window that read 2 on a one-face wall now reads 1) — **pass**, equal to the in-memory run | score |
| K-3 | **Propose…** at the MA-4h frame, levels blank → `✓ Proposed job-0005 — 0 changeset(s), 0 ghost(s), 0 pre-ticked … · 69 type-gap group(s), 207 element(s) in the Holding Area · 45 door(s) or window(s) held on a storey with nothing to place … · 45 door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed) · … · ledger #2298`; the type_gap row (#2297) holds one "thickness not trusted" group of 8 under one key; the planner row's storeys: held 16 + 29, `doors_seen_once` 20 + 25 — **pass** | the line, #2297, #2298 |
| R-0 | `ma5a.rvt` reopened in Revit 2024: the window's family and type renamed again to `BDS_Window_1 Panel+FX : 800x1200 mm` (MA5a's rename was lost — closed unsaved) and the model bound to `ma4c-drill` in Project Setup; **saved this time** (03:07) — **pass, disclosed** | the file time |
| R-1 | **Run survey** on `ma4c-drill` → job-0006 (#2299, 0.6.0, 16 walls, 1 door, 1 window); **Propose…** at (40000, 0, 0), levels blank → `2 changeset(s), 15 ghost(s), 2 pre-ticked … (a level the scan created — a person ticks every scan wall, door and window …) · 4 type-gap group(s), 9 element(s)` (#2305). Stored: every wall `pretick: false`, both created levels `true`; the window **typed by guideline@2's rule** ("DD (DRAFT WN-1): the only BDS window at 800 x 1200"), sill 900; the exterior door a gap ("13 Doors types … a person picks one" — BDS types interior doors only) — **pass** | SQL |
| R-2 | Revit 2024 **Review AI Proposals** → Scan L00 job-0006: `create wall (6) · 0 ticked` (Revit honours the bridge's pre-tick), the level ticked; wall-5 and the window ticked → **Apply** → `Applied 3 element(s)` (#2306) — **pass** | the window, #2306 |
| V-1 | Review desk → **Measure against the scan** → `1 within tolerance, 0 out, 0 missing, 0 insufficient data, 2 not measured` (#2307): the row carries `deviation {per "face", within_mm 20, face_share_min 0.2}`, `tolerances_mm [20, 50, 100, 200]`, no `target_mm`; wall-5's faces 4 717 / 4 704 points, coverage 0.966 / 0.963, 100 % / 100 % within 20 mm; its reason the check's limits. The desk: `within tolerance (each face 20% within 20 mm) · faces within 20 mm: 100% / 100% · p95 4 mm · … · this check misses most 20 mm offsets, and a thin partition moved by its own thickness can pass` — **pass** | #2307, the desk |
| V-2 | The old row #2290 (job-0005 on ma4c-drill, before this branch) on the desk: `within tolerance (20 mm, p95) · p95 4 mm · …` — its own rule kept — **pass** | the desk |
| R-3 | One Undo (the QAT list: one entry `Sentinel AI changeset: Survey job-0006 · Scan L00 job-0006 [405f0e6a]`) → `changeset_reverted` op undo, count 3 (#2308) — **pass** | #2308 |

**Closing list:** the job-0006 L01 proposal declined in Revit with a reason (#2309); Revit closed (`ma5a.rvt` keeps the rename and the
binding). No survey changeset is left proposed. Owed: the thin-wall deviation bar (77 % out, the bar 90 %) and a second reference before
the 1F target or the pre-tick bar can be judged; the office's exterior door rules (none in BDS). Next: MA-5's PDF half or MA-5b.

## Session MA5a3 — the drawing reader, sentinel-drawing 0.1.0 (2026-10-11 local: merged ce8c0eb, web 1.0.74, the 4100 bridge restarted on master; the founder's session (the local app on master) after the Funnel refresh; Claude driving)

The founder's "continue" on the roadmap: MA-5's PDF half, slice one (`docs/superpowers/plans/2026-10-11-ma5a3-drawing-reader.md`). A .NET
worker the bridge runs on the admitted vector PDF plans: walls from paired face lines, doors from swing arcs, paper millimetres; proposing
waits for MA-5a-4's 2-point alignment. Reviewed twice before merge (wf_ae3a6c66-31b: 9 confirmed, 0 refuted — the add-in's `WallPairing`
read by stroke order, now not linked; then a skeptic on the new pairing: 10 more, fixed, 0 of 400 fuzzed plans order-dependent).

| Row | Result | Evidence |
|---|---|---|
| G-1 | `drawing/fixtures/drill-plan-L00.pdf` (sha f6171b11…) copied into `ma4a-drill`'s `drawings/`; Files ▸ Evidence ▸ **Admit** → answers req-0001 → **Admit drawing** → `✓ Admitted drawings/drill-plan-L00.pdf as ev-0007 · sha f6171b1138c3… · ledger #2311`, a drawing from the owner under req-0001 (attestations (a) and (b) already signed — no new signature) — **pass** | #2311 |
| D-1 | **Read drawings** → `✓ Started job-0001 — sentinel-drawing reads ev-0005 (drawings/A-101.pdf), ev-0007 (drawings/drill-plan-L00.pdf)`; the job: `job-0001 · sentinel-drawing · done · read ev-0007 · refused ev-0005 (not a PDF PdfPig can open) · 5 wall(s), 2 door(s) · ledger #2312`. Its `result.json` against `drill-plan-L00.expected.json`: the 5 walls on their centrelines within 0.1 paper mm, thickness 6 / 6 / 4 / 5 / 2 (300 / 300 / 200 / 250 / 100 mm at 1:50) exact; both doors at their openings, widths 18 / 20, tags 900x2100 / 1000x2100, swings (0, 1) / (1, 0), each hosted in the wall its gap splits; the receipt: page 1 of 1, 0.7 pt read, 0.35 pt (border and title block) paired 140 of the walls' 632 and not read, 0.2 s CPU. Row #2312: `build:run job-0001 · sentinel-drawing 0.1.0 · done`, `claimed: false`, its `result_sha256` e7995b42… = result.json's, params `{}`, A-101.pdf (MA-4b's 73-byte stub) refused with why — **pass** | result.json, #2312 |
| D-2 | **Candidates** → 7 lines, each in paper mm from `ev-0007#page-1` (e.g. `drawing-ev-0007-p1-wall-5-door-1 · door · width paper mm 18, tag width mm 900, tag height mm 2100`) — **pass** | the panel |
| D-3 | No **Propose…** on the drawing job (the founder is the owner: a survey job shows it); its line: "Paper millimetres, no scale yet — a drawing job is proposed with its 2-point alignment (MA-5a-4)." The route's own 409 (`job-NNNN is a drawing job (sentinel-drawing): … MA-5a-4; nothing was saved`) is pinned by `changesets-store.test.mjs` (proposeFromJob (b)); driving it live needs a person's session token, not lifted — **pass (web), route by test** | the panel, the test |
| D-4 | **Run survey** beside it → `job-0002 · done · read ev-0002 · refused ev-0003 (not surveyable (a .rcp)) · 0 level(s), 0 wall(s), …` (tiny.las finds nothing, as before) · row #2313 `build:run job-0002 · sentinel-survey 0.6.0 · done`, the survey's params, no `notes` — one slot, the survey unchanged — **pass** | #2313 |

**Closing list:** no changeset was filed (a drawing job proposes nothing yet; the survey found nothing). `drawings/fake.pdf` stays in the
folder, not admitted. Known limits recorded in `drawing/PlanReader.cs` (window, stair and leaf-rectangle lines in the wall weight read as thin
walls; a dense hatch or a heaviest title block pairing into 30 % of the walls is read). Owed: real drawing sets to tune on; Ghost Builder's
`WallPairing` reads DWG lines by stroke order (task offered). Next: MA-5a-4 — the 2-point alignment and `inferred` drawing ghosts.

## Session MA5a456 — drawing alignment, drawing against scan, click-to-pick (2026-10-11 local: merged b7e002a, web 1.0.75, the add-in deployed 2021–2027, the 4100 bridge restarted once on master; the founder's session (the local app on master) after the Funnel refresh; Claude driving; Revit 2024)

The founder's "ok go ahead with all three": MA-5a-4 (a lead proposes a drawing job by two marks; every ghost `inferred`, never pre-ticked),
MA-5a-5 (a drawing proposed onto a storey whose scan is filed: what agrees is not proposed twice; a difference is a review row and ONE BCF
topic, deduplicated across re-runs) and MA-5a-6 (the marks clicked on the drawing as read). Plans `docs/superpowers/plans/2026-10-11-ma5a4-drawing-align.md`,
`…-ma5a5-drawing-vs-scan.md`, `…-ma5a6-pick-points.md`. Reviewed per slice (wf_29a27983-1b5: 3 + 6 minor; wf_624b4811-aaf: 7; MA-5a-6: 1 + 5
minor — all fixed). On `ma4c-drill`: guideline@2 + type_catalog@1, and four scans of the drill building filed at 0 mm (job-0002/0003 GR-FFL
applied, job-0005/0006 Scan L00 partially applied — counted once, applied first).

| Row | Result | Evidence |
|---|---|---|
| P-0 | The founder signed attestation (b) on ma4c-drill (a first signature went to ma4a-drill, the project open in the app, which had (b) already — no row); Claude drafted req-0001 to the owner ("Floor plans, ground floor (vector PDF)"), on the founder's "draft req-0001 yourself" — **pass** | #2318, #2316 |
| P-1 | `drawing/fixtures/drill-plan-L00.pdf` copied into the pack's `drawings/`; **Admit** → answers req-0001 → **Admit drawing** → `✓ Admitted drawings/drill-plan-L00.pdf as ev-0007 · sha f6171b1138c3…` — **pass** | #2320 |
| P-2 | **Read drawings** → `job-0007 · sentinel-drawing · done · read ev-0007 · 5 wall(s), 2 door(s)`; **Propose…** offered on the drawing job (MA-5a-3 had none) — **pass** | #2321 |
| P-3 | MA-5a-6: the form shows page 1 as read (the outer walls, the partition, the two doors); three clicks 2–3 px off the corners → A `60, 40`, B `220, 160`, check `220, 40`, each snapped exactly; the pick moves on A → B → check — **pass** | the panel |
| W-1 | Model points typed (40000, 0 / 48000, 6000 / 48000, 0), level blank at 0 mm → preview `1:50 · turned 0° · the paper's corner at 37000, -2000 mm in the model · the check point lands 0 mm` — the bridge's tested numbers — **pass** | the panel |
| W-2 | **Propose** → `✓ Proposed job-0007 — ev-0007 at 1:50, turned 0°, checked to 0 mm · 1 changeset(s), 1 ghost(s), none pre-ticked · against the scan: 3 wall(s) agree (not proposed again), 0 differ, 1 drawn only, 0 scanned only, 0 door(s) from the drawing in the scan's walls — 1 BCF topic(s) raised · 1 type-gap group(s) … · drawing-ev-0007-p1-level → GR-FFL (scan, its height not checked)`. The changeset `Drawing job-0007 · ev-0007 · GR-FFL`: the partition alone (`BDS_INT_ARC_CMU_100 mm`, (44050, 150) → (44050, 5900), `inferred`, pretick false); exceptions: the 250 mm west wall (type gap) and both doors held (finding F-MA5a456-1); `job.alignment` with `confirmed_by`. ONE topic `Drawing vs scan: ev-0007 drawing-ev-0007-p1-wall-1 — drawn, not in the scan` (Open, `difference.key` = sha\|cid\|-\|-\|drawn_only) — the planted difference, exactly one topic — **pass** | #2323, #2324, #2325, topic fa8a3db8… |
| W-3 | The same points typed (the keyboard route; the marks redrawn in place) and **Propose** again → `Not done — nothing new to propose from job-0007 … read the drawing again to propose it afresh; nothing was saved` (the jsonb key-order fix live: no false "another alignment"); no row, still one topic — **pass** | newest row #2325 |
| D-1 | Review desk: `Drawing job-0007 · ev-0007 · GR-FFL — 1 ghost(s)`; source words `from drawing job-0007 (ledger #2321) · ev-0007 at 1:50, turned 0°, its paper corner at 37000, -2000 mm, level at 0 mm, stated by <the founder> · checked to 0 mm by a third point · storey GR-FFL (scan — its height not checked) · nothing from a drawing is pre-ticked`; the ghost `drawn — from job-0007 at 1:50 · 100 mm thick as drawn · inferred (what someone drew, not what was built) · alignment checked to 0 mm · not pre-ticked · ends 150 / 100 mm to the corners` — **pass** | the desk |
| R-1 | Revit 2024, `ma5a.rvt` (bound to ma4c-drill): Review AI Proposals lists the drawing changeset; the window: `Proposed by sentinel-drawing 0.1.0`, the 3 rows sent to a person with their reasons, the partition `inferr…` **unticked**, no "Show the scan" — **pass** | the window |
| R-2 | Ticked and **Apply 1 ticked in Revit** → `Applied 1 element(s) … reported (ledger #2326)`; `changeset_applied` names job-0007 (#2321), `drawing-ev-0007-p1-wall-1`, its evidence `ev-0007#page-1` and its Revit element; the model saved — **pass** | #2326 |
| V-1 | The desk's "Recently decided": `Drawing job-0007 … applied in Revit … 1 applied, 0 not applied · ledger #2326` with **no** "Measure against the scan" (survey changesets keep it); the verify/overlay 409s for a drawing changeset are pinned by `changesets-store.test.mjs` — **pass (web), route by test** | the desk |
| I-1 | The project dashboard: OPEN ISSUES **1** (was 0) — the drawing-vs-scan topic — **pass** | the dashboard |

**Findings:**
- **F-MA5a456-1 (behaviour, as designed):** both doors were held, not placed: the storey took the scan's level GR-FFL, which the MA-4d drill
  *named* (no published model holds it), so its height is unchecked and Revit would refuse a door off it. The door-into-the-scan's-wall path
  (MA-5a-5 decision 7) is therefore proven by test only (`drawing-plan.test.mjs`: hosted on the scan wall's centreline, in the fragment its
  point falls on), not live. Live it needs a checked scan level — a published model holding GR-FFL, or a scan storey the scan created.
- **F-MA5a456-2 (words, fixed on fix/ma5a456-drill):** the held doors' advice "name a published level, or leave level out to have it created"
  was wrong for a level taken from the scan (leaving it out gives the scan's level again) — now "GR-FFL is the scan's level, named when the scan
  was proposed and never checked: publish a model that holds it, then propose the drawing again". Live after the next bridge restart.
- **F-MA5a456-3 (environment):** the local app loaded while Chrome was minimized reported `never_ready` (That Open's start timeout); Retry with
  the window visible loaded it. Not Sentinel's.
- **F-MA5a456-4 (test):** `bcf-open.test.mjs` "the auth front" fails only under the full-suite load (passes alone 3/3) — pre-existing, flaky.

**Closing list:** `Drawing job-0007 · ev-0007 · GR-FFL` applied (the partition placed in `ma5a.rvt`, saved); one Open topic on ma4c-drill; the
250 mm west wall waits in the Holding Area; req-0001 drafted (not sent — the founder's to send, or not). Owed: a live door from the drawing
in a scan wall (F-MA5a456-1); real drawing sets; MA-5b (rooms and revisions) next on the roadmap.
## Session MA5b batch 1 — rooms, revision compare, reshape, DWG hygiene (2026-10-11 local: merged through 6d33bf0, web 1.0.76, sentinel-drawing 0.2.0, the add-in deployed 2021–2027, the 4100 bridge restarted once on master; the founder's session (the local app on master) after the Funnel refresh; Claude driving; Revit 2024, `ma5a.rvt`)

The founder's "go ahead with MA-5b" + "run all phases all together": MA-5b-1 (rooms from a drawing's labels), MA-5b-2 (Ghost/Datum DWG
hygiene: GHB-3, DAT-4), MA-5b-3 (revision compare, C13a) and MA-5b-4 (reshape with an as-placed stale guard, C13b) in one deploy and one
drill. Fixtures: `drawing/fixtures/drill-plan-L00-rooms.pdf` (A), `-rev-b.pdf` (B: the partition moved east), `-rev-c.pdf` (C: the east and
north walls each 100 mm out). Marks for every proposal: A `60, 40` → `40000, 0`, B `220, 160` → `48000, 6000`, check `220, 40` → `48000, 0`.

| Row | Result | Evidence |
|---|---|---|
| P-1 | The three PDFs copied into the pack's `drawings/`; **Re-check** lists them; each **Admit** → answers req-0001 → `ev-0008` (rooms), `ev-0009` (rev-b), `ev-0010` (rev-c) — **pass** | #2328, #2330, #2332 |
| P-2 | **Read drawings** → `job-0008 · sentinel-drawing · done · read ev-0007, ev-0008, ev-0009, ev-0010 · 20 wall(s), 8 door(s), 6 room(s)` (two rooms in each new drawing) — **pass** | #2333 |
| A-0 | ev-0008 at **3000 mm**, level blank → the storey matched the scan's `Scan L01 job-0002` (`checked: true`: created by an applied scan changeset): 3 walls agree with the scan, 1 drawn only, ONE BCF topic; the changeset = the partition, its door and `MEETING ROOM 102`; held: the 250 mm west wall (type gap), the south door (13 door types within 100 mm), `OFFICE 101` ("bounded by …-wall-3, a type gap") — the planner **pass**; but `ma5a.rvt` has no level `Scan L01 job-0002` (that scan was applied into another copy: F-MA5b-1), so Apply would fail on the named level — **declined in Revit with the reason**, re-proposed at 6000 mm | #2337, #2338 |
| A-1 | ev-0008 at **6000 mm** → `drawing-ev-0008-p1-level → Drawing ev-0008 job-0008 (created)` · 1 changeset, 7 ghosts (the level, 4 walls, the partition door, room 102), none pre-ticked; OFFICE 101 held as above — **pass** | #2342 |
| R-1 | Review AI Proposals: `room: 102 · MEETING ROOM · Drawing ev-0008 job-0008 · inferred`; the "Sent to a person" rows read as on the bridge — **pass** | the window |
| R-2 | Everything ticked but the east wall (`wall-4`) → **Apply 6** → `room 102 MEETING ROOM is not enclosed on Drawing ev-0008 job-0008 — a wall round it is unticked, held or a type gap: untick the room, or place its walls first; nothing was placed` · "the proposals are still pending" — **pass** | the window (no row) |
| R-3 | The east wall ticked → **Apply 7** → `Applied 7 element(s)`; room 102 MEETING ROOM placed: **Area 19.800 m²**, perimeter 18 200 mm, number 102 — **pass** | #2343 |
| B-1 | ev-0009 revises ev-0008 at 6000 mm → `against ev-0008: 3 wall(s) the same (left as placed), 0 changed, 1 no longer drawn; doors 0 the same, 1 no longer drawn; rooms 1 the same, 0 no longer drawn — each a person's row on the changeset (Sentinel never deletes)` · `→ Drawing ev-0008 job-0008 (revision)`; the changeset = the new partition (x 45050) and its door — **pass** | #2347 |
| B-2 | Revit: A's partition and door as "Sent to a person" rows (`on ev-0008, not on ev-0009 — placed from … (Revit …-001f9553): Sentinel never deletes; a person removes it in Revit, or keeps it`); the two ticked → `Applied 2 element(s)` — **pass** | #2348 |
| C-0 | A's north wall moved 500 mm by hand (Move) and saved | the model |
| C-1 | ev-0010 revises ev-0009 → `against ev-0009: 2 wall(s) the same (left as placed), 2 reshaped to ev-0010's line (Revit keeps one edited by hand since), 0 changed, 1 no longer drawn; doors 1 the same, 1 no longer drawn; rooms 1 the same` — the chain followed through B to A's placed walls — **pass** | #2352 |
| C-2 | Revit: 2 reshape rows → **Apply 2** → `Applied 1 element(s)` (the east wall moved 100 mm) · `Kept as they stand (1 wall(s), not reshaped): wall …-001f9554 is no longer in this model — not reshaped (deleted by hand?)`. The kept path held, but the reason did not fit what happened: the Move ran with **Disjoin** ticked (left on from an earlier session), and Revit re-creates a wall moved with Disjoin under a new id (2069844 → 2069888; a 1 mm Disjoin move again gave 2069948): F-MA5b-3 | #2353 |
| C-3 | The main path: Revit's Undo back to before the Disjoin move (the add-in reported the reshape's undo, #2354; the desk shows "undone in Revit after the report"); the north wall moved 500 mm **without** Disjoin (id 2069844 kept) and saved; ev-0010 proposed again → `1 reshaped … 1 already filed (not proposed again)`; Revit shows the carried decline unticked ("a lead re-opens one on the web desk"); the desk shows the reshape row (`reshape …-001f9554 to the revised drawing's line (kept as it stands if edited by hand since placed)`) and the carried decline; **Re-open** refused without a reason, then re-opened with one — **pass** | #2358, #2359 |
| C-4 | Revit: the reshape ticked → **Apply 1** → `Applied 0 element(s)` · `Kept as they stand (1 wall(s), not reshaped): wall 2069844 was moved by hand since it was placed (it no longer stands on (40125, 5900) → (47850, 5900)) — kept as it stands; a person decides` — the as-placed guard live — **pass** | #2360 |
| G-1 | Datum from Drawings: the pick window offers **The drawing's units** (as the file says / mm / cm / m / in / ft); a metres DXF with no `$INSUNITS` (the aster section ÷ 1000, a scratch copy in the Ghost source folder, removed after) read "as the file says" → `Create 1 level(s)` with `The levels are at most 5 mm apart — no storey is under 1.5 m: the drawing's units look wrong (a metres drawing read as millimetres?). Choose its units in the drawing window and read it again.` (the re-read after the 50 mm merge) — declined; read as **metres** → 15 levels `+0 … +47400 mm`, no warning — declined (nothing written) — **pass** | the dialogs |
| G-2 | Ghost Builder: the pick window says the drawing "is imported origin-to-origin for this run and removed when the run ends", with the units choice; A101.dwg imported (seen in the plan), **Cancel** during the vision read → the import gone from the view — **pass** | the view |

**Findings:**
- **F-MA5b-1 (environment, a known limit):** one bridge, many model copies. The bridge took the scan's `Scan L01 job-0002` as checked
  (its scan changeset was applied, into another copy of the drill model), and two applied scan storeys stand at 3000 mm (job-0002 and
  job-0003; the planner takes the first). Apply refuses a named level the model does not hold, in words; the person declines with the
  reason. Recorded, not changed: which file a changeset was applied into is not on the bridge.
- **F-MA5b-2 (behaviour, fixed on fix/ma5b-drill):** the room check was only "enclosed" (Area > 0). With a wall of the changeset unticked,
  walls already standing (a scan's, an earlier drawing's) can close a larger area round the label: an unticked partition would give one
  room over both. The executor now refuses a room when an unticked wall of the changeset on its level runs through it (its midpoint in the
  placed room): `… is unticked and runs through it … — Revit would close the room past it: tick the wall, or untick the room`. Not hit live
  (the drill's west wall is a type gap, so the room did not close); pinned in promote-check.
- **F-MA5b-3 (words, fixed):** a wall moved with Revit's Move + **Disjoin** is re-created under a new id; the reshape is rightly kept, but
  the reason said only "deleted by hand?". It now says "deleted by hand, or replaced: Revit's Move with Disjoin gives a wall a new id".
- **F-MA5b-4 (words, fixed):** two reshape rows read alike ("ends move 100 and 141.4 mm …"); each now names the wall by the line it was
  placed on, and the overlay's "No ghost to draw" names reshape among the edits of an existing element.
- **F-MA5b-5 (words, fixed):** the bridge's 409 advice "withdraw … on the Review desk" named a control the desk does not have; it now says
  "decline … in Revit (Review AI Proposals → Decline all, with a reason)". The Files panel's Drawings line now says the reader reads room
  labels, and when a room is placed.
- **F-MA5b-6 (environment):** closing a maximized review window hands the focus to the window behind Revit (Chrome here); restore the
  window before closing it.

**Closing list:** in `ma5a.rvt` (saved) on level `Drawing ev-0008 job-0008` (6000 mm; a plan view made for the drill): A's walls, door and
room 102 (19.80 m²), B's partition and door; A's partition and door kept (person's rows); the north wall 500 mm off its placed line (kept);
the east wall back on A's line after the Undo (the bridge records C's east reshape as applied, then undone, #2354). In the Holding Area:
the 250 mm west wall and the south door (type gaps), OFFICE 101 behind them. The scratch DXF removed from the Ghost source folder.
Owed: a live run of F-MA5b-2's refusal (a drawing whose rooms close with a wall unticked); a live Ghost Builder build on a real DWG;
real PDF/DWG sets (D8); F-MA5a456-1.

## Session MA5b batch 2 — Revit rows: Ghost wall joins, datum layers and review, arc grids (2026-10-12 local: merged through c5e89d7, web 1.0.77, the add-in deployed 2021–2027 at 01:27, the 4100 bridge restarted once on master; Claude driving alone (the founder away, no Funnel refresh yet); Revit 2024, `ma5b-b2.rvt` — a scratch copy of `ma5a.rvt`, bound to ma4c-drill)

Setup: `ma5a.rvt` saved and closed; a Revit 2026 left at the unsigned-add-in prompt since 23:02 (no model) closed. ma4c-drill read the
office's base layers@1; a project layers@1 with only a `datum` section added (levels `*-SECT-DATUM`, grids `S-GRID-IDEN`) installed over
loopback with the machine credential (#2361). The four drill DXFs (`make-sample.py --ma5b6`, `make-datum-sample.py --ma5b7 / --ma5b8`)
copied into the Ghost source folder for the run, removed after.

| Row | What happened | Result |
|---|---|---|
| D-1 | Datum's pick window: `Read from: layers@1 · project · 51f606ea9ae3… datum: levels *-SECT-DATUM; grids S-GRID-IDEN` | **pass** |
| D-2 | `ma5b7-datum.dxf`: the review lists Level 0–4 (0 … 11400) and 12 grids, 1–3 and A–H, J (no I). Renamed B1 / Ground / L01 / Roof — the ±0.00 list followed every rename (the review fix) — Building Story off on Roof, the 11400 parapet unticked, ±0.00 → Ground: B1 −3500, Ground 0, L01 3500, Roof 7000. Create: 3 levels and 12 grids (#2362); `Level at 0 mm already exists ('GR-FFL') — kept`; grids 1–3 / A–H already named in the model → `1 (2)` … said. Read back by a second read: `Level at -3500 mm already exists ('B1')`, `3500 ('L01')`, `7000 ('Roof')`, no level at 7900 | **pass** (Roof's Building Story flag not read back live — the elevation's crop hides the new levels; Annotate needs a views section this guideline lacks; offline pins cover the write) |
| D-4 | Every grid of the second read: `already stands on that line — kept` (position, not name) | **pass** |
| D-3 | Ghost Builder on `ma5b7-datum.dxf`: the review lists `Walls — 1 layer(s), 2 element(s): A-WALL` only — neither datum layer | **pass** |
| G-0 | Ghost Builder on `ma5b6-joins.dxf` (from the GR-FFL plan; the BDS 200 / 100 wall types and a BDS door picked — the base layers name Generic_Wall / Generic_Door, which this model lacks): `Placed: 6`, boundary 4 outside · 1 inside, the only Revit warning a duplicate Mark (no "walls overlap"). The stored changeset 62646153: the four box walls end at their centrelines' crossings (80000/90000 × 60000/67000), the south wall one wall through the door, the partition 84000 from 60000 to 67000, the door at (81950, 60000) hosted. One Ctrl+Z → `changeset_reverted` undo #2369 | **pass** |
| R-1 | Datum on `ma5b8-radial.dxf`: the review lists spokes 1–5 (0, 22.5, 45, 67.5, 90°), the wing A–C at 30°, the arcs D–F about (200000, 0) — no bubble, no leader. Create: 10 grids; a second read: the arcs `already stand on that arc — kept`, the wing on its lines | **pass**, with F-2 |

Findings (all fixed on `fix/ma5b-b2-drill`):
- **F-1** Ghost Builder run from an elevation imported the drawing into the elevation's vertical plane — the door read at (0, 81950), the
  walls vertical, nothing built and nothing said about why. Ghost now refuses an elevation, section, detail, drafting, 3D, walkthrough or
  rendering view before a drawing is picked, in words.
- **F-2** Datum kept spoke 1 (y = 0, x 215–232 m) as "grid 'A (2)' already stands on that line" — A (2) runs x −0.5–12.5 m on the same
  infinite line. A grid is now the one in the model only where their spans meet (named apart and said otherwise).
- **F-3** A Snowdon sheet read by mistake (keyboard selection) listed dozens of "whole circle of radius 610 mm" lines: with no grid line on
  the layer the size floor was 0. An arc grid is now at least 2 m in radius (a radial plan's hub ring excepted); bubbles say nothing.
- **F-4** The review's Runs column cut an arc's centre, radius and sweep; a grid's run now spans the last two columns and wraps.
- Driving: open_application on a running Revit 2026 started a second instance again (closed); reach a running Revit by its taskbar
  button. Keyboard Up/Down in the drawing list moves focus, not always the selection — click the row.

Owed for batch 2: MA5b5 (Promote rehost) live — a Sentinel sign-in in Revit (the founder's) and a non-hosted placeholder door family;
the web rows (the desk's rehost row and its "rehosted" count, the batch-1 fixes' words) after the founder's Funnel refresh.

Re-checked live after the fixes (merged 8eeffd1, the add-in redeployed 2021–2027 at 01:56): Ghost Builder from the WIP_PE_EAST elevation →
"Ghost Builder reads a plan drawing into a plan view — "WIP_PE_EAST" is a Elevation view, …" (F-1; the article is a nit for the next batch);
Datum on `ma5b8-radial.dxf` → the Runs column shows each arc in full (F-4), spoke 1 created as `1 (3)` — no longer "kept" against A (2)
200 m away — the rest kept on their own spans (F-2). The drill DXFs removed from the Ghost source folder; `ma5b-b2.rvt` saved.

## Session MA5b5 — Promote rehost live, and the batch-2 web rows (2026-10-12 local: master at 9a6d289, web 1.0.77, the add-in deployed 2021–2027 at 01:56, the 4100 bridge on master; the founder signed in to Sentinel in Revit and refreshed the Funnel; Claude driving; Revit 2024, `ma5b-b2.rvt` bound to ma4c-drill)

Setup: on ma4c-drill a draft lod_matrix@1 (`BDS-LOD-DRILL-MA5B5`, the repo's DD Doors row only) installed over loopback with the machine
credential (never printed). A level-based placeholder family `Family1` (Doors, type `1000 x 2100`, its own Width 1000 / Height 2100, a
1000 × 80 × 2100 box) loaded; one instance placed with snaps off so its box's middle lies inside the GR-FFL interior wall `Generic - 125mm`
(4000 mm long), one in open floor.

| Row | What happened | Result |
|---|---|---|
| P-1 | Promote (DD): `GR-FFL · Doors: 2 retype · 1 rehost (the unhosted instance removed) · 3 sent to a person`; the open-floor one held: `Door 2072075 (MA1-D11): no wall hosts it, and it stands in no wall of GR-FFL — a person places it` | **pass** (#2383–#2386) |
| R-1 | The review opened on GR-FFL: the rehost row unticked — `rehost door: Door 2072062 (MA1-D10) · Family1 : 1000 x 2100 at (3014, 5873) → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm in the wall at (3514, 6000) on GR-FFL; the unhosted instance and any tags on it are removed (one Undo brings them back); its Mark, Comments, work…` | **pass** |
| R-2 | Only the rehost ticked → Apply: `Applied 1 element(s)`; the office door hosted in the wall where the placeholder stood, Mark `MA1-D10` carried, sill 0, the placeholder gone. Ledger: `changeset_applied` with `applied` (the new door) and `removed: [{type_before: "Family1 : 1000 x 2100", replaced_by: …}]`; LOD state after DD 5 of 11 | **pass** (#2387, #2388) |
| R-3 | One Ctrl+Z: the placeholder back, the door gone → `changeset_reverted` (undo, the same proposal guid) | **pass** (#2389) |
| R-4 | The placeholder pinned → Promote → the rehost proposed again (F-6) → ticked → Apply: `Applied 0 element(s)` · `Kept as they stand (1 door/window(s) not rehosted — the unhosted instance stays): door "Door 2072062 (MA1-D10)" is pinned — not rehosted; it stays as it stands, a person decides` | **pass** (#2398) |
| W-1 | The web desk (Refresh in the panel): `rehost door (1)` — `Door 2072062 (MA1-D10) · rehost Family1 : 1000 x 2100 at (3014, 5873) → … in the wall at (3514, 6000) on GR-FFL; the unhosted instance and any tags on it are removed (one Undo in Revit brings them back); its Mark, Comments, workset and phase carry over · waiting — nobody decided on the web` | **pass** |
| W-2 | Recently decided: `Promote (DD) · GR-FFL — partially applied in Revit by <the founder> · … · 1 applied (1 rehosted — the unhosted instance removed), 2 not applied · ledger #2387 · undone in Revit after the report (ledger #2389)`; #2398 opened: the rehost under Not applied says `Revit kept it as it stands — its reason is in the note above` | **pass** |
| W-3 | Batch-1 fix words: Project Files ▸ Evidence: `Drawings — … doors (swing arcs, with any W x H tag) and room labels (a name, and its number when one is written) … a room is placed where its label stands, and only when the walls round it close`. The 409 advice words (decline in Revit) stay pinned by changesets-store.test.mjs — not hit live | **pass** |

Declines kept the drill project clean: 01-FFL declined twice (#2390 with a note only — proposed again undecided; #2399 with a group
reason — carried: the next Promote said `1 not filed — every ghost in them was declined before`), the web-row changeset declined (#2405).
The undo of an accidental floor drag (a window-select started on the floor) posted nothing — only Sentinel's own transactions are watched.

Findings (fixed on `fix/ma5b5-drill`, merged 5dfbffb, the add-in redeployed 2021–2027 at 02:39):
- **F-5** (from batch 2) Ghost Builder's footer said a picked type "is remembered", but a pick on a row of the layers standard never came
  back: the standard answers first (F3). A pick on a standard row now rides along as its `Earlier`; the review starts on it only while the
  standard's own type is not in the model (the standard still wins when it can be built), says `your earlier pick (the standard's type is
  not in this model)`, and offers `(forget my choice)`. The footer says so.
- **F-6** Promote proposed a rehost for a pinned placeholder that Apply always keeps (R-4). The preflight now holds a placeholder, or its
  one host wall, that `ChangesetExecutor.HeldBy` names — pinned, in a group or design option, borrowed, changed in central — in words.
- **F-7 (words)** `Decline all (needs a reason)` stayed after a note was typed; it now reads `Decline all` once the note holds one.
- **Nit** Ghost's view refusal said "is a Elevation view"; it now says `is not a plan (its view type is Elevation)`.
- Driving: a window-select dragged from inside an element moves that element in Revit — start a selection box on empty canvas.

Re-checked live after the fixes (Revit 2024 restarted on the deployed add-in): Ghost Builder on `ma5b6-joins.dxf` → A-DOOR, A-WALL-EXT and
A-WALL-INT start on `BDS_EXT_1 PNL_WOOD_1000 x 2100 mm`, `BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_GYPS_100 mm` with `your earlier pick (…)`,
`Types: this build adds no type or family to the model` — cancelled, nothing built (F-5); the placeholder pinned → Promote:
`GR-FFL · Doors: 2 retype · 4 sent to a person`, `Door 2072062 (MA1-D10): no wall hosts it, and it is pinned — not rehosted; a person
decides` (F-6); in the review, Untick all → `Decline all (needs a reason)`, a note typed → `Decline all`, declined (#2411) (F-7).

Closing list: `ma5b-b2.rvt` saved with both placeholders (unpinned) and no rehost applied; ma4c-drill keeps the draft lod_matrix@1 (Doors
only) and the project layers@1 with a datum section; `ma5b6-joins.dxf` removed from the Ghost source folder (the batch-2 note above said
removed — it was still there). Owed: F-MA5a456-1; a live F-MA5b-2 refusal; real PDF/DWG sets.

## Session MA6 batch 1 — agents: reads, verified writes, vocabulary v2 (2026-10-12 local: merged through e10d769 — 6-1 1c6aee2, 6-2 1c07659, 6-3 c2de684, the bridge bundle 0ab2eea, the drill fixes e10d769; the add-in deployed 2021–2027 at 06:40 and again at 07:42; the 4100 bridge restarted once on master; no web change, no Funnel; Claude driving and acting as the MCP agent over stdio (`node WebApp/bridge/mcp-server.mjs`, the machine credential read by the server, never printed); Revit 2024 `ma6-house.rvt` — a copy of `ma5b-b2.rvt`, bound to ma4c-drill; Revit signed in as <the founder>)

Setup: on ma4c-drill a draft project lod_matrix@2 (`BDS-LOD-DRILL-MA6`, the repo's full DD matrix: walls FireRating + IsExternal, doors FireRating, windows U-value) over loopback; the office ids@1 (walls FireRating, slabs LoadBearing, every element a Name). The brief (5 lines, the agent's `house.mjs`): a two-storey house, 10 × 8 m to wall centrelines at x = 300 m, storeys 3.2 m; 200 mm outside walls 2-hour, a 100 mm partition 1-hour; an entrance, a partition door and a 900 × 2100 open passage; windows; two columns and a beam; a 1.2 × 3 m stair void; a 30° gable roof, ridge east-west.

| Row | What happened | Result |
|---|---|---|
| A-2 | `sentinel_standards {kind: type_catalog, category: Walls}` lists 91 wall rows with family, type, width and params (no category: the category names with counts); `guideline` gives the layer-free rules | **pass** |
| H-1 | The agent read the guideline and catalogue, then filed two changesets: storey 1 (3 levels, 5 walls, floor, 2 doors, a wall opening, 2 windows, 2 columns with TopLevel, a beam) and storey 2 (5 walls, floor, a floor opening, 2 windows, a roof with `Slopes [30, null, 30, null]`); walls, floors, the roof, the partition door and the windows typed by the bridge from facts; 0 pre-ticked; the propose-time verdicts (the agent's claim) all accepted | **pass** (#2413, #2415) |
| A-3 | A wall posted with `Class: "IFCDOOR"`: stored IFCWALL, `ignored: set by the bridge from kind` | **pass** |
| H-5 | Storey 2 applied before storey 1: `level "MA6 House L1" does not exist in this model — …; nothing was placed, and this one stays proposed` | **pass** (words: F-1) |
| — | Storey 1: `window type "BDS_Window_Single Panel : 1200x2000 mm" does not exist in this model` → the whole changeset **declined** (#2419); re-proposed with the model's window, the beam family missing the same way (#2425): F-2, F-3, F-4 | finding |
| H-2 | The reviewer typed the brief's Fire Rating on the two wall types (2 HR, 1 HR — set_parameter cannot: the catalogue holds no value). Storey 1 (third proposal): the DD IDS check before commit ran for the agent's changeset — `leaves 4 element(s) failing the DD IDS made from lod_matrix@2 … Doors FireRating — 2; Windows ThermalTransmittance — 2` — Place anyway → `Applied 17`; `sentinel_changeset_status` → `as_built {ids@1 · office, reported_role owner, judged 13, passed 12, failed 0, not_read 1 (Pset_SlabCommon.LoadBearing — no Revit reader), out_of_scope {level 3, opening 1}}`. Storey 2: `Applied 10`, as_built 9 / 8 / 0 / 1 | **pass** (#2426; #2430) |
| V-1, V-3 | The passage and the stair void were cut and the roof's slope read back within 0.1° (each is a guard that rolls the changeset back) — both applies landed; 3D: a gable roof, ridge east-west | **pass** |
| V-2 | Both columns read Base `MA6 House L0` → Top `MA6 House L1`, offsets 0. The beam placed (as-built IFCBEAM); its level offsets not read (its type is used elsewhere in the model) | **pass** (beam offsets owed) |
| H-4 | Revit's Undo list names each changeset (`Sentinel AI changeset: MA6 House · storey 2 … [87475dcb]`, then storey 1); undo storey 2 → `undone {ledger_id 2432, guids 10}`, storey 1 `undone: null`; undo storey 1 → `undone {2433, 17}` | **pass** |
| A-1 | `sentinel_lod_state`: `not measured — lod_state ledger #2431 was measured after changeset 87475dcb…, undone at ledger #2432 — run Promote (DD) again` (the agent's own apply wrote #2431) | **pass** |
| H-3 | A 300 mm outside wall on an office type with no fire rating (the agent claims 2 HR): the DD check `leaves 1 element(s) failing … Walls · DD: missing Pset_WallCommon.FireRating` → Go back: `nothing was placed … still pending`; Apply again → Place anyway → as_built `fails: Pset_WallCommon.FireRating REQUIRED but missing` | **pass** |
| D-1 | Revit 2025 (net8) and Revit 2027 on scratch copies (`ma6-d1-2025.rvt`, `ma6-d1-2027.rvt`, upgraded on open): the picker, the review, the DD check and Apply — `Applied 17` each; as_built 13 judged / 7 pass / 5 fail (the walls: these copies' types hold no rating) / 1 not read, reported by the owner | **pass** |

Findings (fixed on `fix/ma6-b1-drill`, merged e10d769, the add-in redeployed 2021–2027 at 07:42):
- **F-1 (words)** the missing-level refusal told an agent to "re-run Promote"; it now reads `apply the changeset that creates it first, or propose again … (Promote: run it again)`.
- **F-2** a type the model does not hold declined the whole changeset for good (the agent re-proposed 17 elements twice). Apply now checks every ticked row's type first and refuses in words, the changeset kept proposed: `3 ticked row(s) name a type this model does not hold — window …, window …, beam … — load the family or add the type, or untick those rows and what they host and apply the rest, or propose again with a loaded type; nothing was placed, and this one stays proposed`. A door, window or opening whose host wall or floor is an unticked row is refused the same way (review).
- **F-3** the review now marks such a row `⚠ type not in this model`, opens it unticked and counts them in the footer, from the same lookup Apply uses.
- **F-4 (data, not code)** the office type_catalog@1 names `BDS_Window_Single Panel` and `BDS_STR_CONC_Rectangular Beam`; the ma5a-derived models hold `BDS_Window-1 Panel : 3.10X1.50 m` and `BDS_STR_CONC-Rectangular Beam`. The office's catalogue and its template have drifted; Promote's "Office template: N of M office type(s) present" line says so — a person re-harvests the catalogue.
- Driving: Revit's Open dialog refuses typed paths — navigate by double-clicking folders; a hidden Windows text-input window can sit in front of Revit (bring File Explorer forward, then Revit's taskbar button); Revit 2027's close button does nothing while a save prompt is hidden — File ▸ Exit Revit.

Re-checked live after the fixes (Revit 2024): the agent's storey with the catalogue window and beam types → three rows `⚠ type not in this model`, unticked, footer `3 row(s) name a type this model does not hold`; all ticked → Apply refused in words, nothing placed, still proposed (F-2); those three unticked → the DD check → Place anyway → `Applied 14`, `3 of 3 unticked element(s) reported as rejected`; a wall on a missing level → the new F-1 words (declined after, #2445).

Closing list: ma6-house.rvt saved (the H-3 wall, the re-check storey's 14 elements, the two fire ratings typed by hand); ma6-d1-2025/2027.rvt saved in their versions; ma4c-drill keeps the draft lod_matrix@2. Owed: R-1 (a survey or drawing changeset's apply now carries the DD line — not run), the beam's level offsets read live.

Batch 1, owed row closed after the founder's Funnel refresh (2026-10-12 ~09:15 local): **R-1** — on the web (the local app through the Funnel), Project Files ▸ Evidence ▸ job-0008 ▸ Propose ev-0007 at a new level `MA6 R-1 Drawing` 12800 mm (marks A 60,40 → 363000,2000; B 220,160 → 371000,8000; check 220,40 → 371000,2000; preview `1:50 · turned 0° · the check point lands 0 mm`) → `✓ Proposed job-0008 — ev-0007 at 1:50, turned 0°, checked to 0 mm · 1 changeset(s), 4 ghost(s), none pre-ticked … 1 type-gap group(s) … drawing-ev-0007-p1-level → MA6 R-1 Drawing (named, its height not checked) · the same drawing was placed before by Drawing job-0007 · ev-0007 · GR-FFL` (#2457). Its walls named a level ma6-house.rvt lacked; the agent filed that one level (`MA6 R-1 · the drawing level`) and it was applied first. In Revit 2024 the drawing changeset (`Proposed by sentinel-drawing 0.2.0`, 4 walls unticked, the type gap and 2 doors sent to a person) → Apply 4 → the DD IDS check before commit now runs for a drawing changeset too: `leaves 2 element(s) failing the DD IDS made from lod_matrix@2 … Walls · DD: missing Pset_WallCommon.FireRating — 2` → Place anyway → `reported (ledger #2462)`; `sentinel_changeset_status` → as_built `{owner, ids@1 · office, judged 4, passed 2 (the 100 and 200 mm types rated by hand), failed 2 (the 300 mm type, no rating), not_read 0}` — **pass**. The journey strip on the web, refreshed, reads the same LOD line as `sentinel_lod_state` (#2453).

## Session MA6 batch 2 — shell a mass, curtain walls from a facade rule, Photo Massing v2 (2026-10-12 local: merged through 2a6bb05 — 6-4 742db76, 6-5 a0363a0, 6-6 2a6bb05; web 1.0.78 (a4fb908); the add-in deployed 2021–2027 at 10:59; the 4100 bridge restarted once on master; no web rows, no Funnel; Claude driving and acting as the MCP agent over stdio; Revit 2024 `ma6-mass.rvt` — a scratch drill model bound to ma4c-drill; ma4c-drill's project guideline set to `demo/bds-pilot/bds-dd-shell-guideline.json` for the run (guideline@3, #2464) and put back after; Revit signed in as <the founder>)

| Row | What happened | Result |
|---|---|---|
| — | The agent filed two masses (an L and a box) with their levels in one changeset; applied: DirectShapes in Mass, the levels Building Story | **pass** (#2466, #2467) |
| S-1 | 2c · Shell a Mass on the two masses: one changeset of 22 ghosts (walls per storey inset 150 mm from the mass face, clockwise, each with its Facade fact; floors; flat roofs on the top faces), none pre-ticked; the DD check before commit → Place anyway → applied; `sentinel_changeset_status` → as_built `{ids@1 · office, judged 22, passed 1, failed 18 (Pset_WallCommon.FireRating — the office types hold no rating), not_read 3}`; one Revit Undo → `undone` | **pass** (#2470, #2472; undone #2474) |
| C-1 | True North 0, the shell guideline's facade rules (L00 Exterior → `Curtain Wall : M_Storefront`; L01 and L02 Facade S → `M_Exterior Glazing`): the storefront all round at L00 and the south glazing at L01–L02 came as wall creates on curtain types; their class IFCCURTAINWALL, so the walls' Pset_WallCommon rules leave them unjudged; 3D confirmed | **pass** (#2476, #2478; a True North rotated copy not run) |
| M-1 | 2b · Photo Massing read the project images with the vision model on this PC; the estimate came back with every number at its minimum (F-B2-3). Typed 20000 × 15000, 3 × 3500 → File for review → refused before anything was filed: `The filing did not start (01-FFL at 3300 mm, 01_SSL at 3000 mm, MA0 Roof at 6300 mm and 1 more are Building Stories inside the massing (0 to 10500 mm) — Shell a Mass cuts a storey at every Building Story level: set the storey height to match them, or clear their Building Story). Your numbers are kept: put it right, then File for review again.` Building Story cleared on 12 drill levels (F-B2-2); 2 × 3000 → `L01 at 3500 mm is a Building Story inside the massing (0 to 6000 mm)`; 1 × 3500 → one changeset `Photo Massing · 1 storeys · 20.0 × 15.0 m` (F-B2-1): a level create `Massing L00` (`the floor of storey 1 of 1 at 0 mm — no Building Story level there`; L01 at 3500 reused) and a mass create (20000 × 15000 footprint, 0 to 3500 mm, IFCBUILDINGELEMENTPROXY, its reason naming each number `typed by the reviewer`), source photo, claimed, none ticked. Apply 2 → `DD IDS: not asked of 1 level(s), 1 mass(es): the DD IDS has no class for them` → `Next: Shell it — select the mass and run Model from Drawings ▸ 2c · Shell a Mass`. The mass (Mass category) showed in the east elevation without Show Mass | **pass** (#2481, #2483) |
| M-2 | 2c · Shell a Mass on the photo mass where Photo Massing put it: `Mass 2072610 cannot be shelled — 15 wall(s) already stand inside this mass — Shell plans an empty mass only; a person decides. Nothing was planned or filed.` (F-B2-4). The mass moved 100 m by hand → `Massing L00–L01: 4 walls · floor · filed; Roof on L01: filed — 6 element(s) in 1 changeset` → the review (4 walls `BDS_EXT_ARC_CMU_300 mm`, a floor `BDS_INT_STR_CONC_300 mm`, a roof `BDS_EXT_ARC_GENRC_300 mm`) → Apply 6 → the DD check (`4 element(s) failing … missing Pset_WallCommon.FireRating`) → Place anyway → applied; as_built `{ids@1 · office, judged 6, passed 1 (the roof), failed 4 (the walls, FireRating), not_read 1 (Pset_SlabCommon.LoadBearing)}`; 3D shows the shelled box | **pass** (#2486, #2488) |
| S-2 | A storey that leans is held (`the mass leans in this storey — a person decides`): needs an in-place loft between two profiles; the sketch lines did not show in this model's 3D view nor in the S L00 plan (outside its view range) and the mass was cancelled. The rule is pinned by tools/promote-check (Ma6b4) | owed live (harness pass) |
| — | The photo mass's IFC export and its effect on the federation gate's proxy count | not run |

Findings (fixed on `fix/ma6-b2-drill`; the add-in deploys with batch 3):
- **F-B2-1 (nit)** Photo Massing's progress window was titled `Sentinel — Ghost Builder`; it now says `Sentinel — Massing`. One storey read `1 storeys`; now `1 storey` (tools/massing-check pins it).
- **F-B2-2 (words)** the refusal offered `or clear their Building Story` without its cost: Promote plans storey by storey and holds whatever stands on a level that is not a storey — clearing 12 levels here took the LOD line from 9 blocked (#2479) to 153 blocked (#2484). The words now end `… or clear their Building Story (Promote then holds what stands on them — it plans storey by storey)`.
- **F-B2-3 (to 6-9)** the vision read returned no usable number (every field raised to its minimum, storeys `low confidence`) — an input for C14 photo reading v2.
- **F-B2-4 (to 6-10)** the photo mass is centred on 0,0 whatever stands there; Shell refuses it in words. MAS-3 footprint pick lets a person place it.
- Driving: Select by ID (Manage ▸ Inquiry, middle icon) ▸ Show reaches a far mass; Select All Instances takes one type only — right-click over a grid selects grids; an in-place mass sketched in a plan whose view range misses its work plane is invisible (Revit warns).

Closing list: ma6-mass.rvt saved (the masses, S-1 undone, C-1, the photo mass and its shell; Building Story cleared on 12 drill levels); ma4c-drill's guideline put back (the guideline@2 body, now guideline@4). Owed: S-2 live, C-1 on a True North rotated copy, the photo mass's IFC export, D-2 on Revit 2025/2027.

## Session MA6 batch 3 — IFC concepts and photos v2 (2026-10-12 local: merged through f96bc9f — 6-7 290bdb1, 6-8 25e1d33 (+ d9ccd9d), 6-9 8e1e60a, 6-10 f96bc9f; web 1.0.79 (004ae08); the add-in deployed 2021–2027 at 18:41; the 4100 bridge restarted once on master; the founder closed Revit and refreshed the Funnel once; Claude driving (Fable 5.1 at low effort; the slices built by routed workflows — Sonnet implement/fix/merge, Opus on the trust lens only) and acting as the MCP agent over stdio; Revit 2024 `ma6-concept.rvt` (I-0) and `ma6-ifc.rvt` (I-3, P-1, P-2) — scratch copies of ma6-mass bound to ma4c-drill; the shell guideline installed as guideline@5 for P-2's shell step and the @2 body put back as @6)

Before the build: the batch-3 build maps (scratchpad ma6/plan-b3.md) with the critic's binding corrections (the L area 456.0 = 30 × 20 minus a 12 × 12 notch; FOOT units read from IfcUnitAssignment; a wall missing a number goes to not_read, never null; the harness pins that move). P-1 step 1 measured before any code (scratchpad ma6/p1_results.txt): on the four Seagram photos at 1024 px with the v2 prompt (counts and ratios only) **llava** counts 20 storeys on every photo (H:W 3.2, 4–9 s), **llama3.2-vision** answers HTTP 500 from Ollama on every photo, **qwen3.6** counts 52/50/50/42 (H:W 3.15–3.8, 10–109 s) — every local model misses 38 ± 4, so D17 applies and the table is pinned in `tools/massing-check/p1-views.json`.

| Row | What happened | Result |
|---|---|---|
| I-0 (model + exports) | The concept filed as two agent changesets (`MA6 Concept · storey CN L00` #2491: 3 levels, 4 exterior 300 walls on the (0,0)–(20000,12000) centreline rectangle, a 150 interior wall at x = 8000, the floor, a door, a column; `… CN L01 + roof` #2493: 4 walls, the floor, a flat roof on CN L02), applied in Revit 2024 on `ma6-concept.rvt` (a copy of ma6-mass; the concept overlaps that model's own building at the origin — Revit warned, nothing else), the DD check → Place anyway each time; as_built 8 judged / 2 pass / 5 fail (FireRating) / 1 not read, then 6 / 1 / 4 / 1. CN L00 South switched to Location Line *Finish Face: Exterior* by hand. The 17 elements isolated in the {3D} view, exported with *Export only elements visible in view* three ways: IFC2x3 CV2.0 at the default base (Shared Coordinates), IFC2x3 CV2.0 at Internal Origin, IFC4 RV at Internal Origin. | recorded |
| I-0 (reader) | `node WebApp/bridge/ifc-geometry.mjs` on the CV2.0 export: 8 levels, **9 walls on the stated lines exactly** ((0,0)→(20000,0) …, (8000,0)→(8000,12000)), thickness 300/150 `(layers)`, h 3500, `external true/false`, the roof-clipped walls `clipped true`; 2 floors of 4 corners, 240.0 m², top 0 and 3500; not read (5) by GlobalId with why: the door's host wall (`1 unfilled opening(s) — not proposed`), the roof slab, the IfcRoof, the IfcDoor, the IfcColumn; hint `site at 0,0,0 · 0°`, no map conversion. On the IFC4 RV export, at 6-7's merge, **every wall read as "a curved wall — straight walls only"** (F-B3-1: Revit writes the RV wall Axis as an `IfcIndexedPolyCurve`, which the reader took for an arc) — fixed in 6-8: the same 9 lines within 1 mm, thickness 300/150 `(body)`, the clipped walls `tessellated`. Both exports committed, scrubbed, as `fixtures/ifc-geometry/revit2024-concept-{cv2,ifc4rv}.ifc` with tests | **pass** (after F-B3-1) |
| I-1 | Web (the local app through the Funnel, 1.0.79): `concept.ifc` (the CV2.0 export) and `not-an-ifc.ifc` (a markdown file renamed) put in ma4c-drill's evidence folder → Re-check lists both → Admit the fake: `Refused not-an-ifc.ifc — the file does not begin as a .ifc does — renamed or damaged · on hold · ledger #2499` (and #2500: the list re-rendered under the second click); Admit the concept: `✓ Admitted concept.ifc as ev-0011 · sha ddc0843c0ab2… · ledger #2502`, the line `ev-0011 · concept.ifc · ifc · 50 KB · sha ddc0843c0ab2… · concept model (own)`; the attestation words now read `… and (a) before a concept IFC` | **pass** |
| I-2 | Web: **Read IFC** (beside Read drawings) → `Started job-0009 — sentinel-ifc reads ev-0011 (concept.ifc)`; ↻ → `job-0009 · sentinel-ifc · done · read ev-0011 · 8 level(s), 9 wall(s), 2 floor(s) · ledger #2503`. The row `build:run job-0009 · sentinel-ifc 0.1.0 · done` (#2503) carries `items [{ev-0011, sha ddc0843c…}]`, `candidates {wall 9, floor 2, level 8}`, `not_read` (5, with why and GlobalId) + `not_read_total`, `tools [sentinel-ifc 0.1.0, web-ifc 0.0.77 MPL-2.0, Node 26.5.0]`, `cpu_s 0.11`, `minutes 0.02`, `claimed false`, `model_calls 0` | **pass** |
| I-3 | Web: Propose… → the form shows the frame (x y z 0, turned 0) with the hint `the IFC says its site at 0, 0, 0 mm turned 0° — a hint, never applied (D5): state the frame yourself` and the 8 storeys → Propose → `✓ Proposed job-0009 — 2 changeset(s), 13 ghost(s), none pre-ticked (an IFC is what a concept says, not what was built — a person ticks each in Revit) · 0 type-gap group(s) · 0 element(s) in the Holding Area · 2 IFC element(s) on no storey that is placed — not read (IfcSlab …, IfcRoof …) · L02 → IFC L02 job-0009 (created); L04 → IFC L04 job-0009 (created) · ledger #2508`. The bridge's two changesets (`IFC job-0009 · IFC L02 job-0009`, `… L04 …`, source sentinel-ifc 0.1.0, `claimed false`): walls typed by the office rules from thickness — `BDS_EXT_ARC_CMU_300 mm` / `BDS_INT_ARC_CMU_150 mm`, floors `BDS_INT_STR_CONC_300 mm`, every element `accuracy inferred`, none pre-ticked; the door, the column and the opening-bearing wall as the L02 changeset's exceptions. Revit 2024 (`ma6-ifc.rvt`): Review AI Proposals lists both (`sentinel-ifc 0.1.0 · 7 ghost(s)`, `6 ghost(s)`); L02: `Sent to a person (3)` on top, 0 ticked, no ⚠ type gap → tick all → Apply 7 → the DD check (5 walls, FireRating) → Place anyway → `Applied 7`; L04 the same → `Applied 6`. Read back with the Revit MCP: **every wall's LocationCurve on the IFC's line to the millimetre** (`(0,0)->(20000,0)` … `(8000,0)->(8000,12000)`), the right types, h 3500, on `IFC L02 job-0009` / `IFC L04 job-0009` (elev 0 / 3500, Building Story); the floors on their outlines. as_built `{ids@1 · office, judged 6, passed 0, failed 5 (FireRating), not_read 1}` and `{5, 0, 4, 1}`. One Ctrl+Z per storey → `undone {ledger 2513, guids 6}` (L04) then `{2514, guids 7}` (L02); the elements gone. **Drill row 3** | **pass** (#2505, #2507, applied #2510/#2512, undone #2513/#2514) |
| P-1 | `ma6-ifc.rvt`, Project Setup ▸ Ghost source folder → the four Seagram photos; 2b · Photo Massing → the new prompt **Where does the mass stand?** (pick a footprint / width × depth from the photos centred on a point you pick) → the second → a point picked → `Reading photo 1 of 4…` (llava, ~40 s) → the v2 review: Storeys `20` amber `observed — 4 of 4 photos: 20–30 · 0.8 agreement between photos, not accuracy — check the count`; Height : width `3.2` `observed — 4 of 4 photos: 3.2–3.2 · 1.0 confident`; Known height / Known width `given — type one of the two`; storey height, width, depth `assumed — type one known dimension…`; the vision notes per photo (`seagram-01.jpg: 30 storeys, height : width 3.2, 10 bays, front` …). Known height 157 → Scale ▶ → storey height `7850` `inferred — range 5233.333–7850 — 157000 mm ÷ 20 storeys` (amber), width `49062.5` `inferred — … 157000 mm ÷ ratio 3.2`, depth `assumed — depth not seen — a person confirms`; `Scaled from the given height 157000 mm. The inferred numbers are amber — check them, then File for review.` The count is wrong the same way on every photo (20 of 38) and the window says so — the miss is recorded, not hidden (D17); not filed. **Drill row 4** | **miss recorded** (D17) |
| P-2 | `ma6-footprint-L.dxf` (an R12 POLYLINE on layer FOOTPRINT: (0,0) (30000,0) (30000,8000) (18000,8000) (18000,20000) (0,20000), 456.0 m²; Revit refused a first AC1015 LWPOLYLINE file as "no valid elements in Model space") imported origin-to-origin into the plan; 2b → **Pick its footprint** → a click on the polyline's edge → a centre point picked clear of the building → the photos read → the review shows `Footprint: a closed CAD polyline on layer FOOTPRINT, 6 corners, 456.0 m²` in place of the width/depth rows, and `Rotation (°)`; storeys 2 + height 7 → refused (`MA0 Roof at 6300 mm, Drawing … at 6000 mm are Building Stories inside the massing (0 to 7000 mm)`), 1 × 5 m → refused (`L01 at 3500 mm`), 1 × 3.5 m → filed `Photo Massing · 1 storey · footprint 456.0 m²`: one mass `35980.8 × 26320.5 mm footprint, 0 to 3500 mm`, reason `footprint: a closed CAD polyline on layer FOOTPRINT, 6 corners, 456.0 m² (the polyline: 456.0 m²), centre at (-38529.2, -29981.8) mm, turned 30°; 1 storey of 3500 mm — storeys given, storey height inferred`, 6 boundary points; unticked → tick → Apply 1 → `Applied 1` (#2518). Revit MCP read: DirectShape 2072791 in Mass, bounding box 35980.8 × 26320.5 × 3500 (the L turned 30°), **bottom face 456.0 m², 6 edges**, volume 1596 m³ = 456 × 3.5. Then 2c · Shell a Mass: with the project's thickness-rule guideline (@4) every storey held in words (`the rule names its type with {thickness} — a mass has no thickness; write an exact-type rule`); with the shell guideline (@5) → `Massing L00→L01: 6 walls · floor · filed; Roof on L01: filed — 8 element(s)` → tick all → Apply 8 → Place anyway → `Applied 8` (#2524); **the L00 floor's Area (Revit's own) 456.0 m²**, 6 walls, nothing inside — F-B2-4 fixed. The @2 body put back (@6) | **pass** |

R9, what Revit 2024 (IFC 24.3.40.26) writes for this model:
- **Units** `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)` (the project's). **Site** carries lat/long, no `IfcMapConversion`; the default base (Shared) and Internal Origin exports are byte-for-byte alike but for the file name — this model's shared origin is its internal origin, so D5's default of 0 holds.
- **Storeys**: every level of the model is written (8, the hidden ones too — `B1 −3500`, `Massing L00 0`, `CN L00 0`, `L01 3500`, `CN L01 3500`, `Drawing … 6000`, `MA0 Roof 6300`, `CN L02 7000`); elevations carry float noise (3500.0000000000005). Elements are contained by their own storey.
- **CV2.0**: 9 `IfcWallStandardCase`, each with an `Axis`/`Curve2D` polyline and an `IfcMaterialLayerSetUsage(…, .AXIS2., .NEGATIVE., +t/2)` (150 for the 300 types, 75 for the 150) — so the Axis is the **centreline for every wall, the Finish-Face wall included** (Revit re-bases the export on the centreline; the Location Line setting leaves no trace). Bodies: 13 `SweptSolid` (`IfcRectangleProfileDef` extrusions), 2 `Clipping` (`IfcBooleanClippingResult`: the walls the roof clips), 1 `Brep`, 2 `MappedRepresentation` (door, column). 3 `IfcSlab` (two floors and the roof's slab part, usage `.AXIS3. .POSITIVE. 0`), 1 `IfcRoof`, 1 `IfcColumn`, 1 `IfcDoor` with its `IfcOpeningElement`; 2 `IfcWallType` through `IfcRelDefinesByType`. **No `Pset_WallCommon.IsExternal`, no BaseQuantities** (not exported by default).
- **IFC4 RV**: 9 bare `IfcWall`, **no Axis, no layer-set usage**; bodies are `SweptSolid` extrusions of `IfcArbitraryClosedProfileDef` over `IfcIndexedPolyCurve` (the cleaned footprint, joined corners) and 4 `Tessellation` (`IfcPolygonalFaceSet`) for the clipped walls; door and column mapped. So RV defeats the Axis + layer path: the reader's body fallback (a 4-point parallelogram's mid-line) must carry it, or I-3 proposes from the CV2.0 export (the plan's R9 fallback).
- Scrubbed copies (IFCPERSON/IFCORGANIZATION → example.test, FILE_NAME authors blank) in the scratchpad `ma6/ifc/` for the committed fixture; GlobalIds that happen to contain "YH" are not names.

Findings:
- **F-B3-1 (fixed in 6-8, bc0356d)** the RV export's walls read as curved (above).
- **F-B3-2 (web, nit)** after a refusal the evidence list re-renders and the next Admit lands on the row that moved under the pointer (the fake was refused twice, #2499/#2500); harmless, worth a settle.
- **F-B3-3 (model data)** Photo Massing's Building Story refusal fires on every scratch model copied from ma6-mass (levels at 3500, 6000, 6300): the batch-2 words made the cause clear each time; no code change.
- Driving: the DXF Revit imports must be R12 POLYLINE/VERTEX (an LWPOLYLINE file without handles is "no valid elements"); the Revit MCP code template's parameter is `document` (not `doc`/`Document`), and the switch must be turned on again after every Revit restart (Add-Ins ▸ Revit MCP Switch); Revit's ribbon clicks land even when the screenshot lags — wait, never re-click (a stray click ran Review Flag on the concept model); the Sentinel panel's Project Setup sits under Standards.

Closing list: ma6-concept.rvt saved (the concept, Finish-Face wall, {3D} isolate reset); ma6-ifc.rvt saved (IFC storeys undone; the L mass and its shell kept; its Ghost source folder points at the Seagram photos); ma4c-drill: evidence ev-0011 admitted, the fake on hold, job-0009 done, guideline back to the @2 body (@6); Documents/Sentinel drills holds the three exports and the DXF. Owed: S-2 (a leaning storey, live), C-1 on a True North rotated copy, D-2 on Revit 2025/2027 for batch 3's add-in, a second vision model on this PC (the founder's — qwen3.6 was closest at 42–52), the roof slab part on a job's row only.

**MA-6 complete** — batches 1–3 shipped and drilled. Next: MA-8, then MA-7 (after counsel).

## Session MA8 batch 1 — edit cost, FG-07 tolerance, third-party model in (2026-10-12 local: merged through ae2b945 — 8-1 542e336, 8-2 12e06fd, 8-3 ae2b945; web 1.0.80 published; no add-in change; the 4100 bridge restarted once on master; the founder refreshed the Funnel and signed attestation (e); Claude driving (Fable 5.1 low effort; slices built by the routed workflows) and acting as the MCP agent; project ma4c-drill — `contract@2` = contract@1 + `tolerance_mm: 20` installed before the gate rows)

| Row | What happened | Result |
|---|---|---|
| E-1 | `sentinel_edit_cost {project}` lists 37 runs, each with filed / declined on the web / carried / not applied in Revit / applied / undone / kept / pending / withdrawn, `share_changed`, `rests_on {applied, reverted}` and the ceiling line on every run (`edits made after Apply, other than an Undo in Revit, are not seen`). The MA-6 IFC run job-0009 (ledger #2503) reads filed 13 · applied 13 · undone 13 · share 1.0, resting on the Undo row #2514 — what the MA-6 batch-3 drill did | **pass** |
| E-2 | Review desk (BIM tools ▸ Review) ▸ **Edit cost per run**: the same lines; Publish on job-0003 → `Published job-0003 (ledger #2229) · ledger #2528`, job-0005 → #2529, job-0006 → #2530; Publish again on job-0003 → `not published — job-0003 (ledger #2229)'s edit cost was published on these same numbers as ledger #2528 — nothing was saved`. The rows carry `run job#2229`, the numbers and `rests_on`. **Drill row 3** | **pass** |
| E-3 | `POST /changesets/ma4c-drill/edit-cost/publish` with the machine credential → 403 `publishing an edit cost on the web desk is a signed-in person's — sign in (the machine credential, the MCP agent and scripts never review)` | **pass** |
| T-1 | Evidence folder: `golden-nugget.ifc` (the Revit 2024 sample's IFC, 24.1 MB — D1's stand-in, never committed). **a third party's…** form (`A third party's model is a purchase, not a request. Needs (a) and (e) signed by a lead, and a lead to admit it…`): before (e) was signed → `Not done — a lead must sign (e) first; nothing was saved`; the founder signed (e) (#2532); provider `google-earth` + `PO-0001` → `Refused golden-nugget.ifc — google-earth is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo) · on hold · ledger #2533`; a fresh copy `golden-nugget-vendor.ifc` as `autodesk-sample` + `PO-2026-0412` → `✓ Admitted golden-nugget-vendor.ifc as ev-0012 · sha 37e83c76ba1f… · ledger #2535`, the line `ev-0012 · golden-nugget-vendor.ifc · ifc · 24.1 MB · model from autodesk-sample (commercial, ref PO-2026-0412)`. The 70 MB cap case not run (no such file) | **pass** |
| T-2 | **Read IFC ev-0012 (autodesk-sample)** (one button per admitted model) → `Started job-0010 — sentinel-ifc reads ev-0012`; the row `build:run job-0010 · sentinel-ifc 0.1.0 · done` (#2536) carries `items [{ev-0012, sha 37e83c76…, provider autodesk-sample, licence commercial}]`, `candidates {level 12, wall 401, floor 80}`, `not_read_total 1202` (the first 50 listed with why — e.g. `a body of 2 solids — one outline only`), `cpu_s 1.61`, tools sentinel-ifc 0.1.0 / web-ifc 0.0.77 / Node; the web line `job-0010 · sentinel-ifc · done · read ev-0012 · 12 level(s), 401 wall(s), 80 floor(s)` | **pass** |
| T-3 | Propose… — the hint `the IFC says its site at 0, 0, 500000 mm turned −45.5°; 12 storey(s) whose Elevation differs from where they are placed — a hint, never applied (D5): state the frame yourself`; z = −497750 → `✓ Proposed job-0010 — 3 changeset(s), 6 ghost(s), none pre-ticked … 25 type-gap group(s) · 293 element(s) in the Holding Area … L00 → IFC L00 job-0010 (created) … L11 → IFC L11 job-0010 (created) · ledger #2544`. The changesets `IFC (autodesk-sample) job-0010 · IFC L06 job-0010` (1 level + 1 wall `BDS_INT_ARC_CMU_100 mm`, 20 exceptions), `… L03 …` (level + floor, 49 exceptions), `… L01 …` (level + floor, 4 exceptions): source `sentinel-ifc 0.1.0`, `claimed false`, every element `inferred`, nothing pre-ticked; `job.frame {dz_mm −497750, stated_by <the founder>}`; the type-gap row #2543 names 25 groups (e.g. `Location Interior, 2 mm → BDS_INT_ARC_CMU_2 mm`, the export's cladding layers) — the office's catalogue decides, nothing is snapped | **pass** |
| G-1 | Two scratch copies of ma6-concept (the concept's 9 walls on (0,0)–(20000,12000) + x = 8000 over ma6's own building): in `ma8-str` the 9 walls copied, pasted *Aligned to Same Place* and the originals deleted (new UniqueIds, 2072993–2073002); `ma8-arc` kept the originals. Governed Publish refused both as `ma8-*.rvt` (`NAMING: expected 7 '_'-separated fields … got 1 · Held on the web: Project Files · On hold`, no container registered, #2552/#2558) — renamed on disk to `MA8_STR_ZZ_XX_M3_S_0001.rvt` / `MA8_ARC_ZZ_XX_M3_A_0001.rvt` → `✓ ACCEPTED — published as v1 · wip` each (STR #2558, ARC #2568), both manifests `captured` with 115 walls (`walls_total 115, walls_held 0`). `POST /cde/ma4c-drill/federation/run` → FG-07 **pass** · `124 wall pairs judged at 20 mm (walls are paired while their bodies, widened by the tolerance, overlap)`; FG-01 **fail** (373 shared GlobalIds — the two models are copies of one file: a setup artefact, F-B1-3), so the verdict is `fail` throughout and only FG-07's own status is judged below | **pass** (FG-07) |
| G-2 | ARC south wall 2072710 moved **60 mm** north (Revit MCP read `(0,60)->(20000,60)`), published v2 (#2578) → FG-07 **pass**, 124 pairs: D4's rule pairs the moved 300 mm wall with ma6's coincident 200 mm wall at 60 mm — a 200 inside a 300 pokes out 10 mm, within 20 (F-B1-4, a decision for the founder). Moved **130 mm** instead, published v3 (#2588) → FG-07 **fail** · `1 wall pair sticks out of each other by more than 20 mm (the thinner wall outside the thicker one)` · evidence `{walls [2VExwC6xrF6u4NaChOdioP, 2JAfum3A14tO2tmQ2FmKne], storey CN L00, offset_mm 80, centre_mm 130, thickness_mm [300, 200]}` · `bcf {raised 1, topics [d743d237…]}`. **Drill row 2a** | **pass** (at 130 mm) |
| G-3 | Ctrl+Z (`(0,0)->(20000,0)`), published v4 (#2598) → FG-07 **pass**, 124 pairs, 0 evidence, no BCF raised. **Drill row 2b** | **pass** |
| G-4 | `contract@2` = the body without `tolerance_mm` → FG-07 **not_checkable** · `the contract sets no tolerance_mm`; `contract@3` puts 20 back (live: `tolerance_mm 20`) | **pass** |
| T-4 | In `MA8_ARC…` Review AI Proposals lists the three vendor changesets (`IFC (autodesk-sample) job-0010 · IFC L0n job-0010 — sentinel-ifc 0.1.0 · 2 ghost(s): 1 accepted, 1 rejected`); L06 opened: `Sent to a person (20)` (type gaps and `its base sits 20 mm off IFC L06 job-0010 — a person decides`), level + wall unticked → tick → Apply 2 → the DD check (FireRating) → Place anyway → `Applied 2 … "IFC (autodesk-sample) job-0010 · IFC L06 job-0010": reported (ledger #2607)`; published v5 (#2613). `node bridge/ifc-compare.mjs <published v5> <golden-nugget.ifc> 20 --frame 0,0,-497750,0` → `FG-07 PASS at 20 mm · 1 wall pair judged at 20 mm` + `a: 115 walls have no matching wall · b: 400 walls have no matching wall · b: 12 walls were not compared (curved, bent or without thickness)` — the re-created wall sits on its source within tolerance; the source IFC was never registered as a container (amendment 1). The stand-in for drill row 1's "compared with Sentinel's own result" (D1) | **pass** |

Closing list: `MA8_ARC_ZZ_XX_M3_A_0001.rvt` saved (south wall restored, the vendor wall + level IFC L06 applied), `MA8_STR_…` saved; ma4c-drill holds containers MA8_ARC v1–v5 and MA8_STR v1, `contract@3` (tolerance 20), ev-0012 + job-0010; the 60 mm move's v2 and the 130 mm v3 stay as versions. Owed: the USD 29 scanner IFC (D1), the 70 MB cap case, 8-2's backfill of manifests captured before MA-8.

Findings:
- **F-B1-1 (data)** a design export's walls are mostly its layers (2 mm, 15 mm …): 293 of the stand-in's elements are honest type gaps and 3 changesets hold 6 ghosts. Drill row 1 ("no generic types left") needs the scanner-made IFC the founder may buy (D1) — recorded owed.
- **F-B1-2 (web, nit)** the desk re-renders to the top after a Publish; the next press needs a scroll.
- **F-B1-3 (setup)** copying one model twice shares every GlobalId, so FG-01 fails and the gate verdict is `fail` whatever FG-07 says — a gate drill needs two models that share only the walls under test.
- **F-B1-4 (decision owed)** D4's error is how far the thinner body pokes out of the thicker: a 300 mm wall 60 mm off a 200 mm neighbour reads 10 mm. With a thinner coincident wall the design's "60 mm off fails" needs equal thicknesses; at 130 mm it fails. The founder decides whether centre-line distance should also be judged.
- Driving: the Review desk is the BIM tools panel's **Review** tab (not Coordination); the Evidence toggle sits after On hold / Type gaps; a Chrome tab in front blocks every desktop click (read tier) — the founder brings Revit forward.

## Session MA8 batch 2 — IFC reader v2, LOA bands, export mapping (2026-10-13 local: merged through 5d1f2db — 8-4 4157d79, 8-5 a34a4bd, 8-6 6943a14, 8-5b 120833b + the bound-words fix; web 1.0.81 published; the add-in deployed 2021–2027; the 4100 bridge restarted on master; then F-B2-1's fix 8-4b merged 50a4b3e (sentinel-ifc 0.2.1) and the bridge restarted again; Claude driving and acting as the MCP agent; Revit 2024; projects ma4c-drill and aster-tower. **In progress:** P-1 waits for the founder, below; the web rows ran after 8-5c, web 1.0.82)

| Row | What happened | Result |
|---|---|---|
| R-1 | `node bridge/ifc-geometry.mjs` (sentinel-ifc 0.2.0) on the Golden Nugget IFC (the Revit 2024 sample's export, D1's stand-in, never committed): 12 levels, 401 walls, 80 floors, 64 openings, 0 doors, **3 windows**, 0 columns (mapped multi-band B-reps), 37 curtain walls, 1202 not read. Before 8-4's review fix the same file read 16 windows: the review's rule (an inner reveal box inset by more than 1 mm on every side) refuses a Revit reveal that is flush with the sill or a jamb → **F-B2-1**. Fix 8-4b (50a4b3e, sentinel-ifc 0.2.1): a flush reveal counts when it is its own solid; a notch or pocket in a single outline stays refused (pinned). Golden Nugget after the fix: still 64 openings, 3 windows, 1202 not read — the windows a first attempt recovered were single-outline notch shapes, which stay refused; two-solid flush reveals now read (tests) | **pass** (reader); F-B2-1 fixed for two-solid reveals, **F-B2-1b** open |
| R-2/R-3 | The committed concept export `fixtures/ifc-geometry/revit2024-concept-cv2.ifc` with 0.2.0: the door and the column read (1 + 1) | **pass** |
| L-1 | MCP: the MA-4 scan jobs job-0002/job-0003, every measured wall p95 3 mm → `LOA40 (p95 3 mm, USIBD C120 v3.1, Levels of Accuracy table, p. 15, relative to the scan, not independently validated)`; levels `no band — not measured`; job-0003's reference shown as `revit (claimed)` | **pass** |
| L-2 | The band edges in `loa.test` (0, 1, 1.01, 5, 5.01, 15, 50, 150, 150.01) against the brief; 150 mm reads `150 mm or more` (the bounds are exclusive) | **pass** |
| P-2 | `ifc_export@1` on ma4c-drill over loopback (`Sentinel_P2_Drill`, instance, IfcWall/IfcWallStandardCase, `DrillComment` Text ← Revit `Comments`; sha 5456ea1f483a…, ledger #2618). `MA8_ARC_ZZ_XX_M3_A_0001.rvt`, wall 2072710's Comments = `P-2 drill`, saved → **Governed Publish** → `✓ ACCEPTED — published as v6 · wip` with the line `IFC export: ifc_export@1 · 5456ea1f483a… (1 property set) asked of Revit's exporter; not checked in the file.`; gate row #2619 carries `export_ref "ifc_export@1"`, `export_sha256 5456ea1f483a…`; verdict #2620, version #2623, geometry linked #2624. The sent IFC holds `IFCPROPERTYSET(…,'Sentinel_P2_Drill',…)` with `DrillComment 'P-2 drill'`, and `extractElements` finds it on 2VExwC6xrF6u4NaChOdioP (`Basic Wall:BDS_EXT_ARC_CMU_300 mm:2072710`) — 1 of 116 walls, the others having no Comments (Revit writes no empty value). **Drill row 3** | **pass** |
| P-1 | `ifc_export@1` on aster-tower (`AST_COBie_SAMPLE`, instance, IfcDoor/IfcWindow: `SerialNumber`, `Manufacturer`, `WarrantyStartDate`, `InstallationDate` ← `AST_*` Text parameters; sha 4a5a6eb43e0d…). Not run: `ASTR26-AST-ZZ-XX-M3-A-0001.rvt` is a **local** of the central `AST_ASTR26_Aster Tower.rvt` (its BasicFileInfo), and Governed Publish names the container from the central (`Publisher.ContainerName`) — `AST_ASTR26_Aster Tower.ifc`, which the pilot naming refuses (B10's finding). Saving a detached copy as its own central was refused by the session's safety rules, also after the founder's "do all urself"; the founder saves the copy (Detach from Central → Save As a central named `ASTR26-AST-ZZ-XX-M3-A-0001`) or allows it | **owed** |
| W-1 | Web (the local app; the Funnel already served the restarted bridge, /health 200 — no refresh needed): Review desk on ma4c-drill → the measured survey changesets (job-0002/0003/0005/0006, #2225–#2307) showed **nowhere**: the measured lines ride only on the newest 10 decided reports and the MA-6/MA-8 runs pushed them out (**F-B2-3**). Fixed in 8-5c (4701011 + words b4c14d9, web **1.0.82**): a section **Measured against the scan** (`Each is its newest measure as written; an Undo in Revit since then is not read here — open the report in Revit or ask sentinel_changeset_status.`) lists `Survey job-0006 · Scan L00 job-0006` … `Survey job-0002 · GR-FFL`; job-0003 expanded: `scan-L01-wall-1 · BDS_EXT_ARC_CMU_300 mm · Scan L01 job-0003 — within tolerance (20 mm, p95) · LOA40 (p95 3 mm, USIBD C120 v3.1, Table 'Levels of Accuracy', p. 15, relative to the scan, not independently validated) · p95 3 mm · mean -0.1 mm …`; the level `not measured · a level has no face to measure` | **pass** (after F-B2-3) |
| W-2 | Web: Project Files ▸ Evidence ▸ **Read IFC ev-0012 (autodesk-sample)** → `job-0011 · sentinel-ifc · done · read ev-0012 · 12 level(s), 438 wall(s), 80 floor(s), 0 door(s), 3 window(s), 64 opening(s), 0 column(s) · ledger #2629`; the row `build:run job-0011 · sentinel-ifc 0.2.1 · done`, `not_read_total 1202`, provider autodesk-sample (438 walls = 401 + 37 curtain walls). The panel's IFC paragraph still described reader 0.1 (`what it does not read (columns, doors, …)`) — **F-B2-4**, reworded in 8-5c | **pass** |

Findings:
- **F-B2-1 (fixed in part, 50a4b3e)** above. **F-B2-1b (open)** 8 of the sample's 16 windows still unread: single-outline reveals, double-shell frames ~10 mm apart, 7 openings "not in its wall".
- **F-B2-3 (fixed, 4701011)** and **F-B2-4 (fixed, 4701011 + b4c14d9)** above; web 1.0.82.
- **F-B2-2 (setup, owed to the founder)** aster-tower's Revit model publishes under its central's name, so P-1 needs the central renamed (or a correctly named copy) before COBie can come from Revit itself; until then the live 168/168 is v3's SAMPLE intake (#1187).
- Driving: Select by ID is the middle icon of Manage ▸ Inquiry; Revit's own Open/Save dialogs take no typed name here — navigate by double-click and pick the file; hover a taskbar R before clicking (the pinned Revit 2026 shortcut sits beside the running 2024 and a click launched it).

## Session MA8 batch 3 — MEP type check, stair flags, third-party RVT in place (2026-10-13 local: merged through 145a068 — 8-8 ba11de3, 8-9 07fdc12, 8-7 cf062f4; web 1.0.83 published; the add-in deployed 2021–2027 at 02:33; the 4100 bridge restarted once on master; the founder asleep ("finish all tasks urself"); Claude driving and acting as the MCP agent; Revit 2024; scratch copies only, in Documents/Sentinel drills/ma8-b3 (the Snowdon Towers samples and the Golden Nugget model, never committed); project ma4c-drill)

| Row | What happened | Result |
|---|---|---|
| M-5 | `mep-hvac.rvt` (a copy of Snowdon Towers Sample HVAC) not yet bound → MEP Type Check: `This model is not bound to a web project — Sentinel ▸ Project Setup.`; the Electrical copy bound to ma4a-drill (no catalogue installed) → `No type catalogue installed (none — not installed for ma4a-drill or its office) — nothing to check against; nothing was sent.`, no row (ma4a-drill holds 0 mep_check rows) | **pass** |
| M-1 | HVAC copy bound to ma4c-drill → `1053 MEP element(s) checked against type_catalog@1 … 1053 matched · 0 type not the office's · 0 system not the office's`, ducts checked against 3 Duct Systems rows; Plumbing copy → `3237 … 864 matched · 2373 type not the office's · 0 system not the office's (systems judged on 864, the ones with the office's type)`, `Pipes 3056: system checked against 11 Piping Systems rows`, groups `2266 × Pipes: Pipe Types / Copper — type not the office's`, `107 × Pipes: Pipe Types / Cast Iron …`; the footer says what is not read (flex, placeholders, fabrication, fittings, accessories) and that sizes are not checked (D15) | **pass** |
| M-2 | Electrical copy → `530 … 530 matched …`, `Conduits 530: type only — Revit gives a conduit no system type` | **pass** |
| M-3 | One `mep_check:run` row per run, by the signed-in founder: #2630 (HVAC), #2631 (Plumbing), #2632 (Electrical); the row carries `catalog`, `categories`, `findings`, `not_read`, `no_type` | **pass** |
| M-4 | Plumbing → Export a BCF topic… → a `.bcfzip` in the drill folder (markup title `MEP types or systems not the office's (2373)`, both groups, `ids shown: 40 of 2373`); ma4c-drill's BCF topics stayed at 6 — nothing raised on the web | **pass** |
| F-1 | `gn-copy.rvt` (Golden Nugget) bound to ma4c-drill → Promote: `Nothing was built — this model was not made from the office template …` + `This model holds 3266 element(s) on 401 type(s) that are not the office's — Structural Connections 1144, Walls 480, Structural Framing 336, Furniture 208 … Transfer Project Standards …`; ledger `foreign_types:run · 3266 element(s) on 401 type(s) not the office's` (#2633, totals gap 3090 / retype 0 / settled 6 / directshape 176). After Transfer Project Standards (BDS wall + floor types) and one office column family, Promote planned per storey with `Structural Columns (by section, outside the LOD matrix): 0 retype (never pre-ticked) · n sent to a person`; the Nugget's members held in words (`a brace or purlin — Sentinel does not retype it`, `not a Building Story`) — the R-B3-4 case, so F-2 ran on a controlled copy | **pass** |
| F-2 | `f2-columns.rvt` (a copy of MA8_ARC): two `M_Concrete-Rectangular-Column` columns on a duplicated foreign type `300 x 450mm 2C1-thirdparty`, one turned 90°, base CN L00 → Promote: `CN L00 · Structural Columns (by section, outside the LOD matrix): 2 retype (never pre-ticked)`; in Revit both rows unticked, `✓ accepted`; the bridge stores `foreign: true` on both, reason `structure by section 300 x 450 mm`; tick → Apply 2 → `Applied 2 element(s)` · `DD IDS: not judged — 2 column(s): structure is outside the LOD matrix …` · ledger #2648; both now `M_Concrete-Rectangular-Column : 300 x 450mm` — the 90°-turned column measured in its own frame (the review's critical SectionOf fix, live); one Ctrl+Z → both back on the foreign type, `changeset_reverted` #2650 | **pass** |
| F-3 | A DirectShape model from Revit's IFC link cache of `concept-2storey.ifc` (17 DirectShapes) → Promote holds each in words: `Columns DirectShape … neither wall- nor floor-like`, `a Doors DirectShape — Promote re-creates walls and floors only`, `not one upright prism (a bottom face with holes)`, and the wall-like ones `no DD rule for no facts … (location unknown: only 0 other wall(s) on the storey …)`; with the concept's native walls pasted onto CN L00: `its body overlaps a parallel wall's body (a wall drawn inside another)`, `both sides look out to open plan — a free-standing wall`, and a 150 mm catalogue gap. The bridge refuses a replacing create from the machine credential: `elements[0]: a create that replaces removes an element — only a signed-in member files one (Promote in Revit, signed in); nothing was saved`. A wall-like DirectShape inside a closed outline, re-created + one Undo, was not reached: drawing one through the Revit MCP was refused by the session's safety rules | **partial** — refusals pass; the re-create Apply/Undo owed |
| S-1 | `f2-columns.rvt` with an office stair (CN L00 → CN L01, 17 risers) exported to IFC (`IFCSTAIR` ×2 incl. the model's own, `IFCSTAIRFLIGHT` ×2), admitted as ev-0013 (#2659) → Read IFC → job-0012 `sentinel-ifc 0.2.1 · done` (#2660: 9 levels, 126 walls, 42 floors, 40 doors, 7 windows, 5 columns; each stair boxed under not_read) → Propose (levels named) → job-0012 `ifc-planner 0.2.1 · proposed` (#2674); on `IFC job-0012 · CN L00` the row `Stair on CN L00 · 1118 × 4400 mm, 3900 mm tall — a stair — Sentinel does not place stairs yet; a person adds it; box … · job-0012 (ledger #2660) (from the IFC, GlobalId 0YxJODJ95E6uHNg97hpE4m)`, unticked, no stair ghost; the second stair (B1) flagged on its storey's row | **pass** |
| S-2 | Same changeset, Flag a stair… in the CN L00 plan → two corners → `Flagged: Stair on CN L00 · 3539 × 4855 mm, 3500 mm tall — saved on IFC job-0012 · CN L00 for a person; nothing was placed`, ledger `changeset_flagged IFC job-0012 · CN L00 · stair on CN L00` (#2675, the founder); in WIP_FP_GR_FFL → `GR-FFL is not a Building Story — open the plan of a storey (a level marked Building Story); nothing was saved` | **pass** |
| S-3 | `POST …/flags` with the machine credential → 403 `a stair flag is a person's pick — sign in (Standards ▸ Sign in); nothing was saved` | **pass** |
| S-4 | Survey job-0013 (sentinel-survey 0.6.0, #2681) proposed (#2687); on `Survey job-0013 · Massing L00` a flag picked over the scan → `Stair on Massing L00 · 2271 × 2650 mm`; its **Scan slice** → `Scan slice: 4434 point(s) inside the stair's box (of 4434 in the scan's square crop around it) drawn as cyan crosses — job-0013 (ledger #2681), one point per 100 mm, 0–3500 mm high …`, crosses only inside the box, Show the scan unticked itself; a second flag's slice off the scan → `0 point(s) inside the stair's box (of 0 …)`; ticking one slice unticks the other; closing the window removes the crosses | **pass** |
| S-6 | Show the scan on the new job-0013 (0.6.0, no `xy_mm`): `Scan: 1891 of 32019 point(s) drawn …`; the survey stays 0.6.0. A re-Measure of an existing 0.6.0 job from the web was not reachable (F-B3-4); the machine credential is refused by design (`measuring … needs a person`) | **partial** |

Closing list: every scratch changeset proposed during the drill was declined in Revit with a note (#2651 MA0 Roof, #2661/#2662 the batch-1 job-0010 storeys, #2676–#2680 job-0012); job-0013's two survey changesets stay proposed (stair flags on them); the scratch models stay in Documents/Sentinel drills/ma8-b3.

Findings:
- **F-B3-1 (Revit crash, not attributed)** Revit 2024 closed with `System.StackOverflowException` (mscorlib, WER 04:54) while exporting IFC from `f3-concept.rvt` — a document Revit had opened from an IFC; the journal's last lines are Revit's IFC exporter loading (assembly-version warnings for GeometryGymIFC / IFCPlugin). The same export from a native model (`f2-columns.rvt`) succeeded. Nothing was lost (the model was saved). Watch for a repeat; the Sentinel add-in's handlers are DocumentChanged/FailuresProcessing only.
- **F-B3-2 (owed)** F-3's re-create Apply/Undo on a wall-like DirectShape inside a closed outline.
- **F-B3-3 (data)** the BDS DD rules type a wall by its Function; a DirectShape has none, so a pure-DirectShape storey is held whole — the re-create path (D16) needs native walls around the shape, as on a scan or a part-modelled storey.
- **F-B3-4 (web)** a placed survey changeset older than the newest 10 decided reports has no Measure button on the desk (the 8-5c section shows measures, not the button) — a never-measured old changeset cannot be measured from the web.
- **F-B3-5 (words, nit)** the evidence panel still lists stairs under "does not read"; since 8-9 a boxed IfcStair becomes a flag row.
- Driving: with Chrome or Windows' text input host in front, every desktop click is refused — `WScript.Shell.AppActivate(<Revit pid>)` brings Revit forward without sending input anywhere; Revit's file dialogs take no typed keys outside File name (navigate by double-click); Paste Aligned to Same Place is greyed across documents — Aligned to Selected Levels works; a Link IFC writes `<name>.ifc.RVT`, a model of DirectShapes.

## Session MA8 batch 4 — stairs from rules, office templates, sheets and tags (2026-10-13 local: spikes S1/S2 run live on a never-merged spike branch (102fe99) at 05:36–05:40; merged through cc0c5e3 — 8-11 ea3ade9, 8-12 e03666f, 8-10 13ecec5 + b16a2e5 (no Revit warning is ever erased — F-S2-3 kept: a warning at a stair's commit rolls the stair back in words); web 1.0.84 published; the add-in deployed 2021–2027 at 07:07; the 4100 bridge restarted once on master; the founder asleep ("finish all tasks urself"); Claude driving and acting as the MCP agent; Revit 2024; scratch copies only (Documents/Sentinel drills/ma8-b3); project ma4c-drill)

| Row | What happened | Result |
|---|---|---|
| S1 (spike) | A stair built inside Sentinel's TransactionGroup (StairsEditScope → inner Transaction → scope.Commit → Assimilate) on a scratch copy, office type `Assembled Stair : 190mm max riser 250mm going`, f2f 3500 mm: **one** Undo entry `Sentinel AI changeset: spike stair [..]`; **one** Ctrl+Z removed stairs + run + 2 railings, Ctrl+Y returned them. A run of (N−1) × going (4500 mm) gave exactly N = 19 risers with no warning; N × going gave 20 and a top-end warning; warnings at scope.Commit reach the person as modal dialogs even with the handler attached; railings appear only at the scope's commit | **GO** |
| S2 (spike) | A temp copy of the office template (a central with its `_backup`) opened detached + all worksets closed in 3.2 s; 54 view templates; two copied by CopyElements in 460 ms with their filter; Close(false); the copy's sha256 and folder listing unchanged; app.Documents back to its count | **GO** |
| G-1 | `PUT …/artefacts/guideline` with a Stairs rule lacking `width_mm` → 400 `guideline: elements[6].default.params.width_mm must be a number of millimetres from 300 to 5000 — the stair's run width`; with `width_mm 1200` → guideline@7 installed (sha 4cb2bc497ffd…) | **pass** |
| S-3 | `s1-spike.rvt`, `Survey job-0013 · Massing L00`: each stair flag row has **Propose a stair…** → `Which end does the stair rise from?` (south/north or west/east with the coordinate). The 2271 × 2650 mm flag → `Held for a person — 19 risers at 250 mm going need 4500 mm; the box is 2650 mm long — a landing or a turn is a person's (D9)`. The 5309 × 5309 mm flag, west → `Proposed Stair · Massing L00 → L01 · from Stair picked on Massing L00: 19 risers of 184.2 mm, going 250 mm, width 1200 mm, run 4500 mm. Review it (Review AI Proposals); nothing was ticked or placed.` (the same-height CN L00 skipped — the next storey up is L01 at 3500). Propose again → `Bridge 409: … this flag is already proposed as "Stair · Massing L00 → L01 · from Stair picked on Massing L00" — withdraw it first` | **pass** |
| S-3b | The stair changeset in Revit: `create stair (1) · 0 ticked` → tick → Apply 1 → `Applied 1 element(s)`, **no modal dialog**; Revit MCP read: the new stair 19 risers × 184.2 mm, tread 250.0, Massing L00 → L01, the office type; +1 run, +2 railings. Ledger `changeset_applied` #2698: `stairs[0] {planned {risers 19, going_mm 250, width_mm 1200}, built {risers 19, riser_mm 184.21, going_mm 250, width_mm 1200, runs 1, railings 2}, as_planned true}` | **pass** |
| S-4 | Edit ▸ Undo shows **one** entry `Sentinel AI changeset: Stair · Massing L00 → L01 · from Stair picked on Ma…`; **one** Ctrl+Z removed the stair, its run and its 2 railings (stairs 4→3, runs 4→3, railings 13→11) — `changeset_reverted` #2700 `{op undo, guids [c38a1b9c…]}` (the undo watcher's first live hit on a stair); Ctrl+Y returned them — #2701 `{op redo}`; after the Redo, Propose from the same flag → `Bridge 409: … this flag is already built as "…" (applied) — undo it in Revit first` | **pass** |
| S-5, S-4b, S-6, C-1, C-2, C-3 | Revit 2027/2021 Apply, the workshared copy, the level-moved refusal, and Annotate's template copy / sheets / tags / MH-VW-01 rows | **owed** (next session part) |

Findings:
- **F-B4-1 (fixed before the drill, b16a2e5)** 8-10 as built erased one Revit warning at a stair's commit (an allowlisted exception to the pinned rule "No DeleteWarning anywhere", F-S2-3 / P1-3). The rule was restored: with the (N−1) × going path a correct stair raises no warning (S-3b: none), and any warning at the commit now rolls the stair back with its words.
- **F-B4-2 (words, nit)** the 409s reach the Revit window as raw JSON (`Bridge 409: {"message":"…"}`) — say the message only.
- **F-B4-3 (data, nit)** the ledger's `planned.going_mm` carries float noise (249.99999999999997) — round to 0.1 mm on write.
- **F-B4-4 (words, nit)** a stair flag's stored reason still reads "Sentinel does not place stairs yet; a person adds it" beside the new Propose a stair… button.
- **F-B4-5 (data, for C-2)** the BDS ruleset's sheet rule SN-01 (ten tokens) refuses the guideline sheet number pattern `A-{level}-{n}` — sheet creation on the pilot needs a fitting `sheets.number` pattern or a project without SN-01.
- **F-B4-6 (data, for C-1)** the Desktop office template (BDS_Revit.Template.rvt) holds none of the BDS guideline's view template names (`01.100_WIP_FLOOR_PLANS` …) — C-1 needs the template file that does, or a guideline naming the file's templates.
- Driving: with Windows' text input host in front, open_application('File Explorer') then minimising it hands the focus back; a dead ribbon comes back after Win+D and a click on Revit's taskbar button.

## Session MA8 batch 5 — recipes (2026-10-13 local: 8-13 merged b009851; web 1.0.85 published (424a413); no add-in change; the 4100 bridge restarted once on master; the founder asleep; Claude driving and acting as the MCP agent; Revit 2024 on the scratch copy `s1-spike.rvt`; project ma4c-drill. 8-14 (terrain) follows as its own section)

| Row | What happened | Result |
|---|---|---|
| Q-0 (prep) | No complete run under the standards in force (guideline@7 since G-1): job-0013's planner row predates it. **Run survey** → job-0014 (sentinel-survey 0.6.0, 24 candidates, #2705). Its Propose was refused while job-0013's survey changesets stayed proposed: `Survey job-0013 · Massing L00 (from job-0013) is still proposed — decide or withdraw it before proposing from another job: both could propose the same walls; nothing was saved` (the check is project-wide, so mapping to CN L00 was refused too). Both job-0013 changesets declined in Revit with a reason (#2706, #2707). Propose job-0014 (scan-L00 → Massing L00, scan-L01 blank) → `2 changeset(s), 14 ghost(s)` (#2713). In Revit: one wall ticked → DD IDS `missing Pset_WallCommon.FireRating` → Place anyway → `Applied 1 element(s)` (#2714; Revit's own overlap warning left in the model, not erased); `Scan L01 job-0014` declined (#2716); model saved. `sentinel_edit_cost` → `job#2705 · filed 14 · applied 1 · kept 1 · complete`; desk **Publish** → `Published job-0014 (ledger #2705) · ledger #2717` | **pass** |
| Q-1 | Desk ▸ Edit cost per run ▸ job-0014 ▸ name `Scan walls on L00 (drill 8-13)`, this project ▸ **Draft a recipe…** → `Drafted recipe@1 (project) from job#2705 — it runs once a lead and an owner (two different people) approve it; whoever runs it approved neither.` `GET /cde/ma4c-drill/recipes` → recipe@1 `sha256 715220ded3db…`, body: reader `sentinel-survey 0.6.0`, params `{voxel_mm 20, storey_min_mm 2000}`, planner `survey-planner 0.1.0`, verified `{run job#2705, reader_row #2705, planner_rows [#2713], edit_cost_row #2717}`, standards `guideline@7 4cb2bc497ffd…`, `type_catalog@1 a1c0436f6714…`; state `pending`. The desk's Recipes line: `recipe@1 · project · Scan walls on L00 (drill 8-13) · sentinel-survey 0.6.0 → survey-planner 0.1.0 · guideline@7, type_catalog@1 · job-0014: 1 of 14 kept (93 % changed) · no approval yet — a lead's and an owner's, two different people, are owed` with Approve / Withdraw and no Run | **pass** |
| Q-2 (machine) | Machine credential: `POST …/recipes/1/approve` → 403 `approving a recipe is a signed-in person's — the machine credential, the MCP agent and scripts never approve; nothing was saved`; `POST …/recipes` (draft) → 403 `drafting a recipe is a signed-in person's — …never draft; nothing was saved` | **pass** |
| Q-3 (machine) | Machine credential `POST …/build/jobs {pack, recipe {version 1, scope project}}` → 403 `a recipe run is a person's — its build:run row names who ran it: sign in. Nothing was saved.` | **pass** |
| Q-2 / Q-3 (people) | The founder's **Approve** (→ 201 + `recipe:approved`; a second Approve → 409), the second person of the other role, a third person's Run (its `build:run` row names recipe@1 and both approvals), the approver's own Run → 403, a guideline change → 409, Withdraw | **owed to the founder** — an approval is a person's attestation (D13: the agent never approves), so Claude did not click Approve in the founder's session |

Findings:
- **F-B5-1 (web, layout nit)** on the desk's Edit cost per run, a complete run's line with the recipe controls (name box, scope, Draft a recipe…) is squeezed into a one-word-wide column — the line should wrap above the controls.
- **F-B5-2 (words, nit)** `1 of 14 kept (93 % changed)` reads as if 93 % of the kept walls were edited; it is the share of filed ghosts not kept as filed — say `13 of 14 not kept`.

## Session MA8 batch 5 — terrain spike K-1 (8-14 stage A) (2026-10-13 local 12:00–12:25: a hidden 2024-only command on the never-merged branch `spike/ma8-b5` (4cec057 + run 2–3 commit), deployed to Revit 2024 only and replaced by master's build afterwards; a new scratch project from Revit's Metric Multi-discipline template (`Documents/Sentinel drills/ma8-b5/Project1.rvt`); the ground points from `kladno-drill` job-0005 (sentinel-survey 0.6.0) by a scratchpad script, never committed; Claude driving)

| Row | What happened | Result |
|---|---|---|
| K-1a (step 0, full scan) | All 250 519 618 points of the Kladno station scan read in 19 s: 17 267 lowest-per-100 mm cells outside the lowest storey's walls box (+1 m) and at or below that storey + 0.5 m; thinned to the lowest per 500 mm cell = **887 points** (200 mm cells = 4 921 for the timing variant). Frame stated as `placeRefusal`'s hint: dx 763 971 000, dy 1 035 486 000, dz −409 631 mm, no turn (kladno-drill holds no survey changeset to take a frame from). Model z −2 038.6 … +442.4 mm around the storey | ground present |
| K-1b points vs walls | A plan plot (points over the 107 lowest-storey wall lines and the box): every point lies in the four corner triangles of the turned square scan, clear of every wall — no missing wing reads as ground | **pass** (judged on the points, critic 10) |
| K-1b run 1 | `Toposolid.Create(doc, points, typeId, levelId)` is fast (887 points 24 ms, 4 921 points 138 ms + 309 ms regenerate), but **every commit failed**, rolled back whole by Sentinel's all-or-nothing handler: `Slab Shape Edit failed. The Floor or Roof or Toposolid is too thin for its given type.` The ground falls 2.04 m below the level and the type is 1 000 mm thick (its flat bottom at −1 000). Three collinear points throw `ArgumentException: Failed to get a valid boundary from the input points`; a duplicated xy point is accepted silently (vertices merged) | NO-GO as built |
| K-1b z frame | Run 2: a flat triangle at point z = 3 300 on L2 (3 600 mm) committed with its top at 3 300 → **a point's z is the absolute model elevation**, not relative to the level. Setting `Height Offset From Level` after the create moves every shape point with it (top 442 → −1 606), so lowering alone still fails | known |
| K-1b run 3 | **Create with the points lifted by −o, then set `Height Offset From Level` = o** (o = lowest point − level − 10 mm = −2 048.6 mm): the points land at their own z, the top face sits under the lowest one and every point raises it, so the type's thickness no longer limits the relief and no type is created. 4 921 points: committed, 461 ms in all. The **CurveLoop overload** (outer = the points' extent + 1 m, inner = the footprint box, a hole where the building stands) + 887 points: committed, 98 ms, **0 warnings**. MAIN (points only, 887): committed and assimilated, but Revit raised `Line in Sketch is slightly off axis and may cause inaccuracies.` **as a modal dialog** although the handler is non-modal; Claude pressed OK (the warning stays in the model; nothing erased) | GO with the CurveLoop overload |
| K-1b Undo | Edit ▸ Undo lists **one** entry `Sentinel AI changeset: spike terrain [7c338c58]`; one Ctrl+Z removed the Toposolid (Undo greyed after), Ctrl+Y returned it | **pass** |
| K-1b IFC | Sentinel's exporter (IFC4) writes the Toposolid as `IFCGEOGRAPHICELEMENT(…,'Toposolid:Generic - 1000mm:1594233',…,.TERRAIN.)` with an `IFCGEOGRAPHICELEMENTTYPE … .TERRAIN.` | known |
| Go / no-go | ≤ 2 000 points well under 10 s; one Ctrl+Z; the z frame known; the points outside the walls | **GO** for stage B, with the binding notes below |

Binding notes for stage B (from the spike):
1. Create with the **CurveLoop overload**: outer = an axis-aligned rectangle around the ground points (+ a margin), inner = the storey footprint; points-only Create spans the building and its convex hull can raise the off-axis sketch warning as a modal.
2. **Lift then offset**: create with z − o and set the Toposolid's height offset to o (o = lowest point − level, less a margin); never a new or thicker type.
3. The footprint must follow the building, not the plan axes: on a turned building the axis-aligned walls box (+1 m) keeps only the scan's corners (here 887 cells of 17 267) — use the walls' oriented box (or hull) for both the ground filter and the inner loop.
4. `Height Offset From Level` was found by its English name; stage B reads it by its `BuiltInParameter` (to be confirmed in the API on the 2024–2027 builds) so a localised Revit works.
5. Collinear points throw and duplicates merge silently: the bridge's refusals (≥ 3 points, not collinear, none within 1 mm) stay.

Findings:
- **F-K1-1 (Revit, for stage B)** a warning at a Toposolid's commit reached the person as a modal dialog with Sentinel's non-modal handler attached (as S1 saw for stairs); the CurveLoop route raised none here, but stage B's drill must watch for it.
- **F-K1-2 (survey, for stage B)** the axis-aligned footprint filter drops most of the ground beside a turned building (note 3).
- Driving: a click on a pinned taskbar icon after Win+D launched a second Revit (2026) — focus Revit with `WScript.Shell.AppActivate(<pid>)` only; Revit's Save As takes typed text in none of its boxes here, so the scratch file kept the default name `Project1.rvt`.

Owed before 8-14 is called done (recorded 2026-10-13 after the final verification, rounds 1-2; nothing below has run in Revit). Only the spike branch ran, on Revit 2024: the CurveLoop overload with an axis-aligned hole, lifted points, the offset set by its English name, one Undo, the stamp on a Toposolid. Master's Apply path has never run. Every step below fails closed (rolled back, in words, the changeset stays proposed) until it does:
- **K-1c on Revit 2024 (scratch), then once on 2025+**:
  - **Apply on L00, the rim and raise read-back:** either it commits and the edge and hole vertices stand at their ground heights, or it refuses with "read back N mm off its ground point …" or "loop corners could not be read back … it stays proposed". Either way the ledger never records it as declined.
  - **Hard cases:** a turned footprint; Elevation Base = Survey Point (dz != 0); ground wholly above the floor (o = 0); a commit warning reaching the rollback words ("… — a terrain Revit did not build stays proposed").
  - **Undo, Propose, Redo, Apply:** apply terrain A; Ctrl+Z (the undo row frees the scan); Propose terrain (B is filed); Ctrl+Y (A stands again); tick B and Apply. Expect "a Sentinel terrain (changeset <A>) already stands in this model — undo or delete it first; it stays proposed", and B stays proposed.
  - **Freeing a gone terrain:** delete the applied Toposolid by hand, then press Propose terrain. The question names the changeset and this model. No records nothing and shows the 409. Yes posts one changeset_reverted row with basis "absent" (the desk says "recorded as gone on <you>'s word") and files the terrain. Repeat with a level name of about 100 characters. In a second file bound to the same key, where the Toposolid stands elsewhere, No records nothing.
  - **Stale local (workshared):** user A applies and syncs, and user B's local is not reloaded. Propose shows the 409 plus "this local is not up to date with central — Reload Latest, then press again; nothing was recorded". No row is written.
- **K-1d on Revit 2021–2023:** Propose terrain and Apply both refuse ("a terrain is a Toposolid — Revit 2024 and later …"), and nothing is filed or placed.
- **Localized Revit:** the offset is set by its BuiltInParameter, and the type is matched by name only.

## Session MA8 batch 5 — terrain (8-14 stage B) and the drill nits, the Revit-free rows (2026-10-13 local ~16:10: 8-14 merged cce155d, then three post-merge review rounds merged 5b29d29 (13 confirmed findings fixed) and a final verification merged 91a9011 (4 confirmed findings fixed in round 1; round 2 found no serious finding); the drill-nits slice merged 2aa83b7 (F-B4-2, F-B4-3, F-B4-4, F-B3-4, F-B3-5, F-B5-1, F-B5-2); the add-in deployed to 2021–2027 at 16:01 as a file copy with every Revit closed; the 4100 bridge restarted on 91a9011 (local and Funnel health 200); web 1.0.86 published (be457f1); CI green on every push. **No Revit today**: the founder's Autodesk account is in use elsewhere, so every Revit row is owed. Claude acting as the MCP agent; nothing filed by a person)

| Row | What happened | Result |
|---|---|---|
| P-1 | `python -m unittest discover -s survey`: `Ran 104 tests … OK` (the `Ground` tests and the read_cloud ground/outside_mm service tests among them); sentinel-survey stays 0.6.0 | **pass** |
| G-1 | The ground a terrain is made of, read directly through sentinel-survey's `read_cloud` + `run` on `kladno-drill` job-0005 and its admitted scan (the bridge's `groundCut` in the scan's frame: the band 5 m under to 1.5 m over the lowest wall base, outside the lowest storey's **oriented** wall box + 1 m): **17.6 s** (cpu 17.2 s) over **250 519 618** points; 500 mm cells kept 2 598 ground points (> 2 000), so the cell doubled to **1 000 mm → 828 points**; z 407 796 … 411 008 mm, every one in the band [404 631, 411 131]; receipt keys exactly `cell_mm, z_mm, of, points, ground, outside_mm`, `ground: true`, the box echoed; one point per cell; no two on one mm; **0** points within 1 mm of the box. The oriented box keeps about three times the ground the spike's axis-aligned box did (887 cells at 500 mm, F-K1-2 closed). The highest points sit 1.38 m over the floor (platforms, kerbs) — inside the band, and the terrain's reason states the band | **pass** |
| M-T | The machine credential against the running bridge (6 rows, nothing written): a terrain body → 400 `elements[0]: a terrain is filed by a signed-in member from Revit (Propose terrain from the scan) — the machine credential files none; nothing was saved`; `…/scan?ground=1` → 403 `showing a changeset's scan needs a person — … its scan is not shown`; `?ground=0` → 400 `ground must be 1 — send ?ground=1; nothing was read`; `?ground=1&flag=x` → 400 `ground and flag are two different cuts of the scan — send one; nothing was read`; an undo with `basis: "absent"` → 403 `an Undo recorded as gone (basis "absent") is a signed-in person's word — the machine credential records none; nothing was saved`; any other basis → 400 `basis is "absent" on an undo, or none` | **pass** |
| D-1 | `sentinel_propose_changeset` says a terrain is filed only by a signed-in member from Revit; `sentinel_changeset_status` says an undo on a person's word carries `basis "absent"` and the account; `mcp-server.test.mjs` 55/55; the tool count stays 17 | **pass** |
| U-1 | On master after each merge: bridge 3 589 passed (1 skipped), web 702, survey 104, add-in 2021/2024/2025/2027 0 errors, promote-check 1 229/1 229, ghost-p2-check 131/131, session-check 47/47; CI green (runs for cce155d, 2aa83b7, 91a9011) | **pass** |
| W-T0…W-T4, nits on the desk | The kladno-drill survey changeset of L00, the project Toposolid rule (amendment 11: never at the office while Q-2/Q-3 are owed), the terrain row, the on-word undo words, the edit-cost words; F-B4-4, F-B3-4, F-B3-5, F-B5-1, F-B5-2 on web 1.0.86 | **owed** — they need a signed-in person (the founder's session) and a terrain only Revit files |
| K-1c, K-1c-1b…K-1c-4, K-1d, K-1e; F-B4-2/F-B4-3 in Revit's windows | Propose terrain from the scan, Apply (rim and raise read back, one Undo), the hard cases (turned footprint, dz ≠ 0, ground above the floor, a forced warning), the second-terrain refusals, freeing a gone terrain on the person's word, Revit 2021–2023 refusals, once on 2025+; the 409 words and the 250 mm going in Revit | **owed** (Revit). Every Apply step after the spike has never run in Revit (TOPOSOLID_HEIGHTABOVELEVEL_PARAM, a turned hole loop, the rim points, the vertex raise and its read-back, dz ≠ 0, o = 0, the warning roll-back on a terrain, the whole executor terrain branch, any 2025–2027 call); each fails closed in words if Revit behaves otherwise. **8-14 is not done until K-1c passes** |

Findings closed by this slice: F-K1-2 (oriented footprint, G-1), F-B4-2, F-B4-3, F-B4-4, F-B3-4, F-B3-5, F-B5-1, F-B5-2 (code + tests; their live rows owed as above).

## Session MA7 batch 1 — trust floor and plumbing (2026-10-13 local evening: 7-1 licence gate 41c91c7, 7-2 counsel switch + source lists fe9fe55, 7-3 guards 0adcd44, 7-4 photo intake 1ea2eb9, 7-5 delete_by/expiry 19cca70, 7-6 NOTICE b11fa4b; each one review round (trust opus, spec + compat sonnet), confirmed findings fixed before its merge; web 1.0.87 published (d7d97a4); the 4100 bridge restarted on master; no add-in change; no download, no counsel, no Revit (the founder's Autodesk account is in use elsewhere today); web evidence stays OFF (D5: counsel has not reviewed it))

| Row | What happened | Result |
|---|---|---|
| LC-1 | `node tools/licence-check/check.mjs` on master: exit 0 — banned 0, unknown 0, pending 12 (10 packages + the llama3 and qwen2.5:7b-instruct weights); `llama3.2-vision` is refused by the weights table (Llama-3.2-Community) and never counted as allowed | **pass** |
| G-3 (amendment 21) | Every real evidence pack read from the running bridge and run through master's `validatePack` (the new item-field whitelist): ma4a-drill ok (7 items), ma4c-drill ok (13), kladno-drill ok (1); aster-tower has no pack. Run after the merge (it was owed before it) — no pack broke | **pass** |
| O-1 | `GET /cde/ma4c-drill/evidence/evp-0001/web` → 200 `{mode: "off", why: "web evidence is off until counsel has reviewed it (design D5) — the founder's switch SENTINEL_WEB_EVIDENCE; nothing was searched, fetched or saved", sources: [… every one held_for_counsel …]}` | **pass** |
| G-1, G-2, P-1…, D-1…, N-1, N-2, the Evidence panel rows | The imagery and photo-kind refusals, the photo intake form (own camera / map service refused / website waits for counsel), delete-by and the sweep, the NOTICE on a live project | **owed** — next session part (a signed-in person for the panel rows; loopback rows on the next run) |

Notes: CI runs the licence check before the tests; LC-1's pending count is 12, not the plan's 10 (amendment 23(v)); amendment 23(iii)/(iv) (the C# ModelLicence twin and WEIGHTS DRIFT) moved to 7-8.

## Session MA7 batch 2 — photos at work, part 1 (2026-10-14 local: the founder OK'd Pillow's MIT-CMU licence ("OK Pillow"); 7-7 blurred stored copies d56e1a7, 7-9 a person chooses the material from a photo 9a42b7f, 7-10 a photo confirms a ghost fb15bee; one review round each (trust opus, spec + compat sonnet), 12 confirmed findings fixed before the merges — among them the photo's orientation read the same way by the browser and the blur tool, MPO phone JPEGs, the 64 MB cap and a decompression-bomb test; web 1.0.88 published (d3e56d2); the 4100 bridge restarted on master; no add-in change, no download, no Revit; **7-8 (the closed-list vision reader) is held for spike M-0, which needs 12 of the founder's own wall photos of known material**)

| Row | What happened | Result |
|---|---|---|
| G-3 again | Every real evidence pack through master's `validatePack` after batch 2: ma4a-drill ok (7), ma4c-drill ok (13), kladno-drill ok (1) | **pass** |
| Unit + CI | Bridge 3 700+ passed, web 713+, survey 116 (7 new blur tests), licence gate banned 0 / unknown 0 (Pillow accepted) | **pass** |
| B-1…B-6, PT-1…PT-3, PC-1, PC-2 | Marking faces and plates on an own photo, the blurred copy's bytes (no EXIF/XMP), the original only on this PC, "Choose by photo" typing a scanned wall's material, a photo-cited accept | **owed** — a signed-in person in the local app, with own camera photos |
| M-0, 7-8 (VR-1…VR-4, MV-1), PT-R, MV-R | The vision spike and reader; the Revit rows | **held / owed** — the founder's 12 labelled wall photos; Revit |

Ceilings recorded by the slices: the web marker has no DOM test (no jsdom; installs barred); a blur-only project's NOTICE does not yet credit Pillow/FreeType (toolsOf reads build:run rows only); amendment 29's frame lock relies on the existing "one job is one frame" 409.

## Session MA7 batch 3 — splats in the desk, Commons behind the switch, web items context only (2026-10-14 local: the founder's "go batch 3"; 7-12 Commons admission 9ea2b6b, 7-13 context only 1bb4f50, 7-11 splats + splat:placed c6474bc; one review round each, 5 confirmed findings fixed before the merges (among them: a Commons admission whose file replace fails still writes its ledger rows); web 1.0.89 published (0d2b3ba); the 4100 bridge restarted on master; CI green; **the web-evidence switch stays off** (counsel has not reviewed); no download (the Commons drill photos need the founder's per-file OK), no Revit)

| Row | What happened | Result |
|---|---|---|
| G-3 again | Every real evidence pack through master's `validatePack` after batch 3: ma4a-drill ok (7), ma4c-drill ok (13), kladno-drill ok (1) | **pass** |
| Unit + CI | Bridge 3 786 passed (1 skipped), web 716+, CI green on c6474bc | **pass** |
| SP-0 | A synthetic 3DGS PLY (1k and 200k gaussians) admitted as a splat and shown in the local app (≥ 20 fps at 200k) and in the published app; if Spark's worker cannot load in the published iframe the desk says "local app only" | **owed** — a signed-in lead's admission in the founder's session |
| SP-1…SP-5, CM-1…CM-7, CX-1, CX-2 | Splat admission, Show in 3D, Save placement (`splat:placed`), reload, refusals; the Commons drill (switch `drill:ma7-web-drill`, 5 Commons photos — per-file download OK); context-only refusals | **owed** — the founder's session; the founder's switch and download OK |

Ceilings: no web form yet for a Commons admission (a lead uses the items route; the panel refuses in counsel's words while the switch is off); a web photo cannot be cited on a ghost (the 7-10 cite path refuses context items), so "context (assumed, web)" appears on the item line only; CM-2 (field-by-field against design §6.2) owed in the drill.

## Session MA7 batch 5 — packaging record 7-15 (2026-10-14 local ~01:50: the founder's "OK 1, 2, go batch 5"; only items #1 and #2 of plan §6 downloaded, each into its own new folder; nothing else fetched)

| Row | What happened | Result |
|---|---|---|
| K-1 YuNet | `face_detection_yunet_2023mar.onnx` · github.com/opencv/opencv_zoo (models/face_detection_yunet, via media.githubusercontent.com) · 0.23 MB download (232 589 bytes) · 1 s · sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` · in `%USERPROFILE%\SentinelData\models-ma7\` · loads in the installed onnxruntime 1.26.0 (CPU), input `[1,3,640,640]`, 12 outputs (cls/obj/bbox/kps × 8/16/32) · Python 3.14 · GPU no · licence file read: MIT (© 2020 Shiqi Yu) | **GO** |
| K-2 pycolmap | `pycolmap-4.2.1-cp314-cp314-win_amd64.whl` · pypi.org (metadata read first: a cp314 Windows wheel exists, so no private Python 3.12, D-7-20) · 24.7 MB download · 23 s · sha256 `db0f5d7f3a90869bbaf798a726a9fac5850e114a3cc317c2ae915698c52316ce` (equals PyPI's) · installed offline with `--require-hashes --no-deps --target %APPDATA%\Sentinel\photo-lib` in 2 s · 65 MB on disk · imports, `has_cuda False` · licence files read: COPYING.txt (COLMAP BSD-3-Clause, "independent of its dependencies, which are separately licensed"); bundled DLLs include ceres, glog/gflags, boost, OpenImageIO/OpenEXR/OpenColorIO, libjpeg/png, libcurl, OpenSSL libcrypto, the MinGW GCC runtime (libgfortran, libquadmath, libgcc_s, libwinpthread) and **SuiteSparse CHOLMOD/AMD/CAMD/COLAMD/CCOLAMD** | **GO with a licence flag**: CHOLMOD's Core is LGPL-2.1+, but some CHOLMOD modules (Supernodal, MatrixOps, Modify) are GPL-2.0+ — which ones this build links is unread; the licence gate keeps pycolmap **pending** until that is read (7-17 does not ship before it) |
| #0 | Only pycolmap's PyPI JSON was read (for its wheel list); the torch/gsplat/transformers indexes were not fetched (their items are not OK'd) | — |

## Session MA8 batch 5 — terrain K-1c live (2026-10-14 local 02:20–02:56: Revit back; the founder asleep ("finish everythign urself"); master through ef0b866 — two fixes found by this drill and merged first: a7e5941 (F-K1c-1, the hole is the box of all the storey's scanned walls, not the typed ones) and ef0b866 (F-K1c-2, the hole snaps to 45° diagonals too); add-in deployed 2021–2027 at 02:29; the 4100 bridge restarted on master; kladno-drill prep at the PROJECT (never the office): guideline@3 = @2 + `{category: "Toposolid", default: {family: "Toposolid", type: "Generic - 1000mm"}}` (f25eeb44453a) and type_catalog@2 = @1 + 11 rows each marked "MA-8-14 K-1c drill row on kladno-drill only - not an office type" (454a8bf5b064); Revit 2024 on `Documents/Sentinel drills/ma8-b5/Project1.rvt` (the spike's Toposolid deleted first), Revit 2027 on a new unsaved metric project; Claude driving)

| Row | What happened | Result |
|---|---|---|
| W-T0 | Propose job-0005 (frame dx 763 971 000, dy 1 035 486 000, dz −409 631, scan-L00 → L1) with the office catalogue alone → `0 changeset(s) … 69 type-gap group(s), 207 element(s) in the Holding Area` (#2721): every scanned wall thickness was a type gap. With the 11 drill rows → `2 changeset(s), 13 ghost(s)` (#2728) | pass (after the drill rows) |
| F-K1c-1 | The first terrain's hole would have been the box of the 11 typed walls — 584 m² of the 1 234 m² building: ground read inside the building. Fixed (a7e5941) to the box of all 107 lowest-storey wall candidates of the job's result; refuses in words when the result cannot be read | **found + fixed** |
| K-1c-1 | Revit 2024, Review AI Proposals ▸ `Survey job-0005 · L1` ▸ **Propose terrain from the scan…** → `Reading the ground off the scan on the bridge…` → `Terrain · L1 · from Survey job-0005 · L1`: 828 ground points (lowest per 1 000 mm cell, widened from 500 mm, which kept 2 598), hole 1 234 m² (all 107 walls), `Generic - 1000mm`, not pre-ticked; reason ends "check it against the site survey" | **pass** |
| K-1c-2 (first) | Apply → `Revit did not commit the transaction (failure resolution rolled it back): Revit raised a warning on the terrain: Line in Sketch is slightly off axis and may cause inaccuracies. — … a terrain Revit did not build stays proposed`; **no modal dialog** (F-K1-1 handled), nothing placed. Cause: the hole's edges at 45.16°/134.84°; Revit's off-axis check covers the diagonals (the spike's ~45° wall lines raised 41 of the same). Declined with a reason (#2731) | refused in words — **F-K1c-2 found + fixed** (ef0b866: snap to the nearest 45° within 0.5°, exact on the 0.1 mm grid) |
| K-1c-1b | Re-proposed (hole edges now exactly 45.000000/135.000000°); a second press → `The terrain was not proposed — Bridge 409: elements[0]: a terrain from "Survey job-0005 · L1"'s scan is already filed ("Terrain · L1 · from Survey job-0005 · L1") — withdraw it first; nothing was saved` | **pass** |
| K-1c-2 | Apply → `Applied 1 element(s) from "Terrain · L1 · from Survey job-0005 · L1"` · `DD IDS: not checked — HTTP 404: no lod_matrix installed for kladno-drill or its office` · ledger #2734; no modal; the rim/vertex raise passed its own read-back (else it refuses); the ground stands round the station with a clean hole where the building stands (screenshot) | **pass** |
| K-1c Undo | Edit ▸ Undo lists **one** entry `Sentinel AI changeset: Terrain · L1 · from Survey job-0005 · L1 [28b45993]`; one Ctrl+Z removed it (#2735 undo), Ctrl+Y returned it (#2736 redo); a second Ctrl+Z (#2737) freed the scan | **pass** |
| K-1e (Revit 2027) | New metric project bound to kladno-drill → Propose terrain (the scan freed by the undo) → Apply → `Applied 1 element(s)` (#2740), no modal; one Ctrl+Z removed it, Ctrl+Y returned it; closed unsaved | **pass** |
| K-1d (Revit 2021–2023 refusal) | Revit 2023 is not granted to this session's computer use (granting needs the founder at the screen) | **owed** |
| K-1c-3, K-1c-3b, K-1c-4 | dz ≠ 0 (Survey Point base), ground wholly above the floor, a forced commit warning, Undo-Propose-Redo-Apply, freeing a gone terrain on a person's word | **owed** |

Ceilings: the Holding Area still holds 195 Kladno elements (most scanned walls have untrusted thickness or unread inside/outside); the drill rows in kladno-drill's catalogue are labelled and project-only.

## Session MA8 batch 4 owed row — S-5 on Revit 2027 (2026-10-14 local 03:00: the staged copy `Documents/Sentinel drills/ma8-b3/s1-spike-2027.rvt` (s1-spike.rvt saved at 11:54, bound to ma4c-drill) upgraded on open in Revit 2027 (12 family-upgrade warnings, accepted); the add-in from master deployed 02:29; Claude driving)

| Row | What happened | Result |
|---|---|---|
| S-5 (2027) | Review AI Proposals ▸ `Stair · Massing L00 → L01 · from Stair picked on Massing L00` (the changeset left proposed by S-6) ▸ tick ▸ Apply → `Applied 1 element(s)`; no modal; `DD IDS: not asked of 1 stair(s): the DD IDS has no class for them`; ledger #2743 `stairs[0] {built {runs 1, risers 19, riser_mm 184.21, going_mm 250, width_mm 1200, railings 2}, planned {risers 19, going_mm 249.99999999999997, width_mm 1200}, as_planned true}` — the same `built` as Revit 2024's S-3b (#2698); the plan's float noise predates the F-B4-3 fix (that changeset was planned before it) | **pass** |
| S-5 (2021) | Revit 2021 is not installed on this PC; Revit 2023 is not granted to this session's computer use | **owed** |

## Session MA7 batch 4 — Photo Massing behind the pack (2026-10-14 local ~03:55: the founder's "go next"; 7-14 merged 0499a19 — one review round, 5 confirmed findings fixed before the merge (the owed 7-28 free-folder path named in the words; a photo counts as read only when the model read it; the one-line `evidence` strings recorded as a deviation from amendment 28; the copy download given its own 120 s client); the add-in deployed 2021–2027 at 03:51 with every Revit closed (D-7-27: the bridge refusal lands with the add-in that obeys it); the 4100 bridge restarted on master; no web change; CI watched; Claude driving)

| Row | What happened | Result |
|---|---|---|
| PM-1 | Machine credential `POST /changesets/ma4c-drill` with the fixture's `source:"photo"` mass naming `ev-000C sha256:c0ffee…` → 409 `Photo Massing read photos that are not admitted, blurred evidence (c0ffee000000…) — admit them in Files ▸ Evidence and blur them; nothing was filed`; with an empty evidence list → 409 `… (none named) …`; nothing filed either time | **pass** |
| PM-2, PM-3, PM-4 | Photo Massing in Revit listing the pack's blurred photos (not a folder), the receipt naming each item id and copy sha, the cloud opt-in refused | **owed** — needs own photos admitted and blurred in the local app first (a person's rows) |
| K-1d (Revit 2023) | Revit 2023 was granted and started, but fails at launch: `Missing schema folder: C:\Program Files\Common Files\Autodesk Shared\Revit Schemas 2023. Repair your installation` — a broken install, not Sentinel; it exited by itself | **blocked** — the founder repairs the 2023 install |

Open after 7-14 (named in its words): Ghost Builder's `LocalVisionReader` still reads sketches/renders from `GhostSourceFolder` as layer-mapping text hints (never geometry) — **7-28** (MA-7 Next).

## Session MA7 Next — 7-28 Ghost Builder hints from the pack only (2026-10-14 local ~10:40: the founder's "go"; merged eb3e0e3 — one review round, no serious findings, 9 minors fixed (hints kept in their own field so a photo alone starts no enrichment call; both vision readers built with cloudOptIn false; the receipt lists every photo sent); the add-in deployed 2021–2027 at 10:36 with every Revit closed; no bridge change, no web change; CI watched; Claude driving)

| Row | What happened | Result |
|---|---|---|
| Code | `LocalVisionReader` no longer reads images from `GhostSourceFolder` (`CountImages`, `ReadFolderAsync` and the folder enumeration deleted); `ReadPackAsync` reads the pack's blurred photo copies through the bridge (sha-checked, via 7-14's `CopyOf`), hints named by item id; the Ghost Builder receipt carries `photos [{item, copy_sha256}]`; an off-PC/cloud model skips the photo hints before any fetch (logged); an unbound project logs "no project bound — no evidence photo hints"; DWG pickup from the folder unchanged; drawings are not read here (sentinel-drawing on the bridge already reads them) | **built** |
| Pins | ghost-p2-check 136/136 (no Directory/File read in LocalVisionReader; a photo without a copy is never sent; hints by item id; empty pack → empty hints; AppendHints alone leaves HasEvidence false), promote-check 1237/1237, session-check 47/47, massing-check 69/69; builds 2021/2024/2025/2027 0 errors | **pass** |
| GH-R | Revit: a Ghost Builder run with an image left in `GhostSourceFolder` reads nothing from it; with a blurred pack photo the hint is made and the receipt names it | **owed** — needs an own photo blurred in the local app first |

With 7-28 every photo path in Sentinel goes through the evidence pack: Photo Massing (7-14), Ghost Builder hints (7-28), Choose by photo (7-9), confirm by photo (7-10).

## Session MA7 — the two founder-free checks (2026-10-14 local ~11:00: the founder's "both"; read-only on the installed wheel and the YuNet model; no download, no Revit, no server; Claude driving)

| Row | What happened | Result |
|---|---|---|
| K-2b pycolmap licence (7-15, 7-17 gate) | The bundled `cholmod-*.dll` in `%APPDATA%\Sentinel\photo-lib\pycolmap.libs` exports 288 `cholmod_*` symbols, 19 of them from the **Supernodal** (`cholmod_super_numeric`, `cholmod_super_symbolic`, `cholmod_super_solve` …) and **MatrixOps** (`cholmod_ssmult`, `cholmod_sdmult`, `cholmod_horzcat` …) modules — GPL-2.0+ in SuiteSparse (Core/Check/Cholesky/Partition are LGPL); `spqr-*.dll` (SPQR) is GPL-2.0+ entirely; `amd/camd/colamd/ccolamd` are BSD-3. No licence text inside the DLLs. So the wheel links GPL code (ceres' sparse solvers). pycolmap entered in the gate's `pending` with the read; it runs on the office PC only and nothing of it is shipped | **read — founder decides** (D-7-16); 7-17 held |
| FD-0 YuNet decode (7-16) | Two synthetic face-like images (skin oval, eyes, brows, nose, mouth; no real photo) at known places on a 1000 × 700 canvas → `blur.detect`: one box each, centred within ~15 px of the drawn face, scores 0.824 / 0.869; the box moved with the face. The 12-tensor order and the grid/exp decode are right | **pass** |

## Session MA7 — batch 6 packaging spike, downloads #3–#7 (2026-10-14 local ~11:30–12:10: the founder's "do them all" on the owed list; index metadata read first (#0), every file hashed against its source; Claude driving, no Revit)

| Row | What happened | Result |
|---|---|---|
| K-2c pycolmap decision | Accepted for one use on the founder's "do them all": it runs on the office PC inside `%APPDATA%\Sentinel\photo-lib` and is never bundled, copied into an installer or served; the GPL's conditions start at distribution. `allow.json`: pending → accepted with that wording, plus a `python.pycolmap` row listing every bundled library (CHOLMOD Supernodal/MatrixOps and SPQR as GPL-2.0-or-later). The gate's `atom()` bans any GPL carry, so the day pycolmap is pinned in a requirements file the gate goes red by design: shipping it needs a new decision | **accepted, office PC only** (D-7-16) |
| #0 index | `download.pytorch.org/whl/{cu126,cu128,cu130}/torch/` listings, `pypi.org/pypi/{torch,gsplat,transformers}/json`, `docs.gsplat.studio/whl/gsplat/` (91 wheels), two Hugging Face model APIs. Driver 610.60 → CUDA 13 is usable | read |
| K-3 torch | `torch-2.14.1+cu130-cp314-cp314-win_amd64.whl` · download.pytorch.org/whl/cu130 · 1 999 MB · sha256 `e25757e4…283ae0` equals the index hash · licence `Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT`, 95 licence files in the wheel; 29 bundled CUDA/cuDNN DLLs (cudart64_13, cublas64_13, cudnn64_9 …) under NVIDIA's redistributable runtime licence · Python 3.14 · GPU yes (RTX 4060, 8 GB). Pure-Python deps also fetched: filelock 4.1.1 MIT, typing_extensions 4.16.0 PSF-2.0, setuptools 84.0.0 MIT, sympy 1.14.0 BSD, mpmath 1.3.0 BSD, networkx 3.7 BSD-3, jinja2 3.1.6 BSD, MarkupSafe 3.0.4 BSD-3, fsspec 2026.9.0 BSD-3 | **GO** (install owed, below) |
| K-4 gsplat | pypi `gsplat 1.5.3` is a `py3-none-any` wheel (no CUDA kernels: it JIT-compiles with nvcc at first use); the prebuilt index has Windows wheels only for **cp310 + torch 2.4 / cu124** (newest `gsplat-1.5.3+pt24cu124-cp310`). No CUDA toolkit on this PC. So on Python 3.14 + torch 2.14 there is no gsplat without a ~3 GB CUDA toolkit download or a private Python 3.10 + torch 2.4.1 cu124 (~2.5 GB more). Neither is on the OK'd list | **NO-GO under the OK'd items** → D-7-25: 7-19 held; the founder picks (a) private Python 3.10 + torch 2.4.1/cu124 + gsplat cp310, (b) CUDA toolkit 13 and build, or (c) Brush / row 8 owed |
| K-5 Grounding DINO | `IDEA-Research/grounding-dino-tiny` · Apache-2.0 (model card) · `model.safetensors` 689 MB, sha256 `1a2412ef…42f3` equals the Hub's LFS sha; configs, tokenizer, vocab (the `.bin` twin not fetched) · in `%USERPROFILE%\SentinelData\models-ma7\grounding-dino-tiny\` | **GO** |
| K-6 SAM 2.1 | `facebook/sam2.1-hiera-small` · Apache-2.0 · `model.safetensors` 184 MB, sha256 `0a4067b1…bc60` equals the Hub's · configs + `sam2.1_hiera_s.yaml` (the `.pt` twin not fetched) · `models-ma7\sam2.1-hiera-small\` | **GO** |
| K-7 transformers stack | transformers 5.19.0 Apache-2.0, tokenizers 0.23.3 Apache-2.0, safetensors 0.8.0 Apache-2.0, huggingface_hub 2.2.0 Apache-2.0, hf_xet 1.7.0 Apache-2.0, regex 2026.9.29 `Apache-2.0 AND CNRI-Python`, tqdm 4.70.1 `MPL-2.0 AND MIT`, pyyaml 6.0.3 MIT, packaging 26.3 `Apache-2.0 OR BSD-2-Clause`, typer 0.27.3 MIT (+ click BSD-3, rich MIT, pygments BSD-2, markdown-it-py MIT, mdurl MIT, shellingham ISC, annotated-doc MIT), httpx2/httpcore2 BSD-3, anyio MIT, h11 MIT, idna BSD-3, colorama BSD, truststore MIT. All 34 wheels in `wheels-ma7\`, each sha256 in `req-ma7-b6.txt` (hash-pinned). Nothing GPL, nothing unknown | **GO** (install owed, below) |
| Install + gate rows | The auto-mode classifier refused three steps as "untrusted code integration": `pip install --require-hashes --no-index` of the folder into `photo-lib`, the script adding the 34 `allow.json` python rows from the wheels' own METADATA, and the two `WEIGHTS` rows in `licence-logic.mjs`. Not worked around. The pin file waits in the scratchpad (`requirements-ma7-b6.txt`) so the gate stays green | **owed to the founder: three commands (below)** |

Founder's three commands (each a Run button in the chat):
1. install: `py -3.14 -m pip install --require-hashes --no-index --no-deps --find-links "%USERPROFILE%\SentinelData\wheels-ma7" --target "%APPDATA%\Sentinel\photo-lib" -r "%USERPROFILE%\SentinelData\wheels-ma7\req-ma7-b6.txt"`
2. allow rows: `py -3.14 -I <scratchpad>\ma7\allow_b6.py tools\licence-check\allow.json %USERPROFILE%\SentinelData\wheels-ma7` then copy `<scratchpad>\ma7\requirements-ma7-b6.txt` to `survey\`
3. weights rows: add to `WEIGHTS` in `WebApp/bridge/licence-logic.mjs`: `"grounding-dino-tiny:main": { digest: "1a2412ef99bd", licence: "Apache-2.0" }` and `"sam2.1-hiera-small:main": { digest: "0a4067b11ce1", licence: "Apache-2.0" }`
| Install + gate rows, second pass ("run the rows", ~12:50) | All three went through this time: 34 wheels installed offline with `--require-hashes` into `photo-lib` (3.3 GB); `allow.json` gained one python row per wheel from its own METADATA (42 python rows now); `WEIGHTS` gained `grounding-dino-tiny:main` and `sam2.1-hiera-small:main`; `survey/requirements-ma7-b6.txt` committed. Found and fixed on the way: the gate matched pin names to allow rows byte-for-byte, so `markdown_it_py` (wheel spelling) never met `markdown-it-py` (METADATA) — `check.mjs` now normalises both per PEP 503; `Apache-2.0 WITH LLVM-exception` (torch) and `CNRI-Python` (regex) added to ALLOWED; the torch wheel's bundled NVIDIA CUDA/cuDNN runtime is a `pending` row (`NVIDIA-Software-Licence`, D-7-16). Smoke: `torch 2.14.1+cu130`, `cuda True`, `NVIDIA GeForce RTX 4060 Laptop GPU`, a 256² matmul on the GPU, `transformers 5.19.0`, `pycolmap 4.2.1` all import from `photo-lib` (numpy from the user site, as the survey does) | **pass**; gate 0 unknown, 14 pending |

## Session MA8 batch 5 owed rows - K-1c-3, K-1c-3b, K-1c-4 live on Revit 2024 (2026-10-14 local 19:00-19:40: the founder's "revit is back"; Revit 2024.3 on `Documents/Sentinel drills/ma8-b5/Project1.rvt` bound to kladno-drill, the add-in from master (deployed 10:36), the bridge on master; Claude driving. The Revit MCP switch (Add-Ins, Revit MCP Plugin) was on for measurements and for the model setup of rows (ii) and (iii), then switched off; the scratch file was closed without saving, its saved state of 02:49 unchanged)

| Row | What happened | Result |
|---|---|---|
| K-1c-4 (No) | The scan was held by e12c38f3, last night's Revit 2027 terrain whose unsaved document was closed, so its Toposolid is absent from every file. Review AI Proposals, `Survey job-0005 · L1`, Propose terrain from the scan: after the ground read the dialog `Is this terrain's Toposolid gone?` came up with the spec's words (names the terrain and this model's path; "If it may stand in another model, a copy, another person's local, or a closed workset, answer No"; "Yes records an Undo ... on the ledger in your name, on your word, and files the terrain again"), default No. No: `The terrain was not proposed — Bridge 409: elements[0]: changeset e12c38f3-26a6-4119-8da0-eed53aaef78d (applied) holds this scan — a terrain from "Survey job-0005 · L1"'s scan is already built as "Terrain · L1 · from Survey job-0005 · L1"; undo it in Revit first; nothing was saved`. The ledger stayed at 49 rows, newest #2742 | **pass** |
| K-1c-4 (Yes) | Second press, the same dialog, Yes: `Proposed Terrain · L1 · from Survey job-0005 · L1: 828 ground points ... Review it (Review AI Proposals); nothing was ticked or placed. The Undo of "Terrain · L1 · from Survey job-0005 · L1" was recorded on your word that its Toposolid is gone. The scan is free.` Ledger: #2745 `changeset_reverted` e12c38f3 `{op undo, basis absent, count 1}` (exactly one), #2746/#2747 the new terrain c95def51 proposed. The status tool builds `undone` from the newest undo row of a changeset (markUndone), so e12c38f3 reads `{ledger_id 2745, basis "absent", by <the account>}` | **pass** |
| K-1c-3b | Apply c95def51: `Applied 1 element(s)` (#2748), one Undo entry `Sentinel AI changeset: Terrain · L1 · from Survey job-0005 · L1 [c95def51]`; undone from the list (#2749, the Toposolid gone); Propose again filed d98f826c without a 409 (#2750/#2751: an undone terrain frees its scan); Ctrl+Y, the terrain stands again (#2752 redo); tick d98f826c, Apply: `terrain "Terrain · L1": a Sentinel terrain (changeset c95def51-57a0-48d5-89ad-f77f1f8b7f21) already stands in this model — undo or delete it first; it stays proposed ... Nothing was placed; the proposals are still pending — change the ticks or press Apply again.` No ledger row was written for the refusal and d98f826c stayed proposed | **pass** |
| K-1c-3 (baseline) | Measured through the Revit MCP: the terrain applied at L1 = 0 has offset -1845.0 mm (the lowest ground point, -1835, less 10 mm) and 1712 shape vertices at z -1835.0 ... 1377.0 mm | the reference for (ii) and (iii) |
| K-1c-3 (iii) ground wholly above the floor | After undoing c95def51 (#2753), L1 set to -3000 mm (the lowest ground is now 1165 mm above it); d98f826c Apply (#2754) built without refusal: offset **0.0 mm**, the same 1712 vertices at z -1835.0 ... 1377.0 mm, bounding box z -4000 ... 1377 (the 1000 mm slab hangs from the level). Undone (#2755), L1 restored to 0 | **pass** |
| K-1c-3 (ii) dz ≠ 0 | Propose filed 72f35b1b first (#2756/#2757, filed at the unmoved base, then the base point moved before the Apply). Then the Project Base Point Elev set to 2000 mm: L1 `Elevation -2000.0` (displayed frame), `ProjectElevation 0.0` (internal), dz 2000. Apply (#2758): offset **0.0 mm** (o from the displayed frame: -1835 - (-2000) - 10 > 0, so 0), the 1712 vertices at internal z **165.0 ... 3377.0 mm** = the scan heights -1835 ... 1377 plus dz, and the Apply's own 5 mm read-back of every loop vertex passed (no refusal). Undone (#2759), the base point restored to 0. Elevation Base = Survey Point with the Survey Point raised (unclipped, Elev 2500) left Level.Elevation and ProjectElevation equal in this model (dz 0): only the moved Project Base Point makes dz ≠ 0 here | **pass** (through the Project Base Point; the Survey Point variant gives dz 0 in this model) |
| K-1c-3 (iv) forced commit warning | Not forced again today: the first K-1c-2 Apply (#2731 decline) already showed it: `Revit did not commit the transaction (failure resolution rolled it back): Revit raised a warning on the terrain: Line in Sketch is slightly off axis ... a terrain Revit did not build stays proposed`, no modal | **covered by K-1c-2** |
| K-1c-4 (second file) | The add-in asks the question of the active document only (`TerrainPlanner.Gone` over `d2.GetElement`); a second file where the Toposolid stands changes nothing but the person's answer, and No records nothing (the first row). "Absent from both files: the question appears" is what the first row showed | **pass by the code and the No row** |

Findings:
- **F-K1c-3 (LOW, not fixed)** the ground read takes about 2.3 minutes on the 250 million point Kladno scan (four runs: 2 min 10 s to 2 min 40 s), not the 20 to 40 seconds the spec says; the window's only line is `Reading the ground off the scan on the bridge…` with no elapsed time. Nothing breaks, but a person cannot tell a slow read from a stuck one.
- Tool note: the Revit MCP template wraps the code in its own transaction (a nested `Transaction.Start` is refused), and its Open Server and Close Server notices are modal and must be closed before the next call.

Owed: the 100-character level repeat of K-1c-4 live (it needs a survey proposal at a 100-character level, which only a signed-in person files on the web desk; the recognition itself is pinned in `tools/promote-check/Ma8Terrain.cs`); K-1c-5 (a workshared stale local: two locals); K-1d (Revit 2021 to 2023 refusal: Revit 2023 is broken); K-1c-6 on Revit 2025 and 2026 (2027 passed).

Closing list: Project1.rvt closed unsaved, the MCP switch off, Revit 2024 left open at its Home screen. kladno-drill: terrains c95def51, d98f826c and 72f35b1b applied then undone; e12c38f3 freed on the person's word; walls 55e386ed and level e143d30b still proposed.

## Session MA7 — NVIDIA accepted and gsplat path A (2026-10-14 local ~21:00–21:40: the founder's "accept NVIDIA, go with A"; every file hashed against its source; Claude driving, no Revit)

| Row | What happened | Result |
|---|---|---|
| D-NVIDIA | The torch wheels' bundled CUDA/cuDNN runtime (cu130 for Python 3.14, cu124 for the private 3.10) moved from `pending` to `accepted` in `allow.json` with the founder's words and the office-PC-only condition; the gate's pending count 14 → 13 | **accepted** (D-7-16) |
| K-4a Python 3.10 | NuGet `python` 3.10.11 (16.3 MB, PSF-2.0, its LICENSE.txt read) unpacked to `%APPDATA%\Sentinel\py310`, pip 23.0.1 bootstrapped with ensurepip; nothing touches the system Pythons or the user site | **GO** |
| K-4b torch cu124 | `torch-2.4.1+cu124-cp310-cp310-win_amd64.whl` · download.pytorch.org/whl/cu124 · 2 506 MB · sha256 `db873d7c…b147` equals the index · BSD-3 + the NVIDIA runtime (accepted above) | **GO** |
| K-4c gsplat | `gsplat-1.5.3+pt24cu124-cp310-cp310-win_amd64.whl` · github.com/nerfstudio-project/gsplat release v1.5.3 (the docs.gsplat.studio index points there) · 21.9 MB · Apache-2.0 (its LICENSE file; no metadata field) · ships `csrc.pyd` built against torch 2.4 / CUDA 12.4 — no nvcc needed · deps ninja 1.13.2 Apache-2.0, numpy 1.26.4 BSD-3, jaxtyping 0.3.7 MIT (+ wadler_lindig 0.1.7 Apache-2.0), rich 15.0.0 MIT; `packaging` 26.3 is an undeclared import (`gsplat/cuda/_backend.py`), reused from `wheels-ma7` | **GO** |
| K-4d install | 19 wheels, hash-pinned (`survey/requirements-ma7-py310.txt`), installed offline into `%APPDATA%\Sentinel\photo-lib310` (separate from `photo-lib`, which stays Python 3.14 for 7-20) | **pass** |
| K-4e smoke | `torch 2.4.1+cu124 · cuda True · 12.4 · NVIDIA GeForce RTX 4060 Laptop GPU · gsplat 1.5.3+pt24cu124`; `gsplat.rasterization` of 2 000 random Gaussians at 320 × 240 → image `(1, 240, 320, 3)`, 48 710 covered pixels, 2.3 s for the first call (kernel load), peak 2 MB | **pass** — 7-19's Stage B (Sentinel's own short trainer, T-0 spike) can be built; it still needs RG's 20 registered copies, i.e. the founder's photos |
| Gate | `check.mjs` now accepts a `versions` list beside `version` on a python row (torch, numpy, networkx, filelock are pinned twice, once per stack); python 3.10.11 listed under `python.versions`; 0 unknown, 0 banned | **pass** |

Owed: T-0 (7 000 steps at half resolution on 20 registered photos) and GS-1…GS-3 — the founder's own photos; `photo/` has no trainer yet (7-19 Stage B).

## Session MA7 7-19 Stage B — Sentinel's own short gsplat trainer (2026-10-16; branch feature/ma7-19-splat-trainer, commit 195ae536; no Revit, no bridge change, no web change; Claude driving)

| Row | What happened | Result |
|---|---|---|
| S-0 | `%APPDATA%\Sentinel\py310\python.exe photo/splat_train.py` synthetic self-check on the RTX 4060 Laptop GPU: 400 known Gaussians, 12 ring cameras, trained on 10 from random init (2000 Gaussians, 3000 steps, 128x128, SH degree 0, L1, Adam, one view per step, fixed count — densify via gsplat DefaultStrategy is the upgrade): 7.8 s, peak VRAM 6.1 MB (torch allocated), held-out PSNR on 2 views 11.02 -> 40.58 dB (bar: >6 dB gain), loss 0.0858 -> 0.0049 (bar: halves), PLY 136,414 bytes = 414-byte header + 2000x17x4 | **PASSED** |
| S-1 | The PLY header passes `evidence-logic.mjs` `splatHeaderRefusal` (null), both the full file and the committed fixture `photo/fixtures/selfcheck-head.ply`; vitest case added in `WebApp/bridge/evidence-logic.test.mjs` | **PASSED** |
| S-2 | Receipt `tools()` lists sentinel-splat-train 0.1.0, python 3.10.11 PSF-2.0, every library in `photo-lib310` with its version from its own metadata and its licence from `tools/licence-check/allow.json` (gsplat 1.5.3+pt24cu124 Apache-2.0 + its CUDA kernels; torch 2.4.1+cu124 with allow.json's expression, which includes BSD-3-Clause; the bundled NVIDIA CUDA 12.4 runtime row; CUDA 12.4 as torch reports it); a library not in allow.json stops the job | **PASSED** |
| T-0 | 7,000 steps at half resolution on 20 registered photos (minutes, peak VRAM, PLY MB) — waits for 7-17 registration (pycolmap) and the founder's 20 photos | **OWED** |
| GS-1 | Bridge job -> PLY admitted as splat with made_with "gsplat job-…" stamped by the bridge — the job wiring waits for registration (`train()` and `write_ply()` are the interface) | **OWED** |
| GS-2 | (live half) The job's receipt on the admitted row; the tool list itself is proven by S-2 | **OWED** |
| GS-3 | A NOTICE listing gsplat, torch, pycolmap — no NOTICE file exists in the repo yet; lands with the job | **OWED** |

## Session MA7 7-20 core — openings by Grounding DINO + SAM 2.1, advice only (2026-10-16 local: built offline on the RTX 4060; no download, no Revit, no bridge or web change; registration (7-17) is not built, so no photo has a pose and the job wiring waits; Claude driving)

| Row | What happened | Result |
|---|---|---|
| Core | `photo/openings.py` (sentinel-openings 0.1.0): `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` set before transformers is imported (R29); both models loaded from `%USERPROFILE%\SentinelData\models-ma7\` only, `local_files_only`, each `model.safetensors` checked against its sha256 prefix (= `WEIGHTS` in `licence-logic.mjs`) before load. `detect()` prompts `door. window.` (box 0.30, text 0.25), refines every box with one SAM 2.1 pass → `[{label, score, box, mask_area}]`. `Sam2Processor` needs torchvision (not in photo-lib), so the SAM input is built by hand (1024² resize, ImageNet norm, boxes scaled), as its image processor does. `project()` / `judge()`: a ghost's 4 corners (mm) through K and world-to-camera; IoU ≥ `SEEN_IOU` 0.30 with a same-label detection → "seen in ev-… (detector, advice)", else "not seen"; a ghost under half in frame or behind the camera is not asked; a leftover detection is "no ghost — not filed". Nothing is written or created | **built** |
| Projection self-check | `photo/test_openings.py`, synthetic cameras, exact numbers: on axis [550,160,730,580], moved 1 m [350,160,530,580], rolled 180° [550,140,730,560], 10 m [595,260,685,470], behind → none, part off frame 130/180; judge: seen / not seen / wrong label / one detection per ghost / no ghost — not filed | **pass** (10 tests, numpy only) |
| Detector on a real photo | `test-kit\wall-photos\timber-frame-08.jpg` (3245 × 4895; Commons "Friedrichsdorf, Hugenottenstrasse 108 (1).JPG", Karsten Ratzke, CC0 — already stocked, no download): 8 detections, all `window`, scores 0.32–0.57, mask areas 18 661–158 858 px; the first-floor windows, the shop glazing and the three dormers are found; the 0.322 box is probably the neighbour's window; the garage/shop doors were **not** labelled `door` (recall for doors is unproven). CUDA: load 13.2 s (includes hashing ~0.9 GB of weights), first detect 16.8 s (kernel warm-up), warm detect 0.99 s, peak VRAM 2 041 MB. `unittest` with `SENTINEL_OPENINGS_PHOTO` set: 11 tests OK | **pass** |
| OD-2 receipt | `tools()`: sentinel-openings 0.1.0 (LicenseRef-Sentinel); grounding-dino-tiny main `1a2412ef99bd` Apache-2.0; sam2.1-hiera-small main `0a4067b11ce1` Apache-2.0; transformers 5.19.0 Apache 2.0; torch 2.14.1+cu130 (from its metadata) | **pass** (core; the job's `build:run` row lists it once wired) |
| OD-1 per ghost opening | Needs registered photos (camera poses) | **owed — 7-17 registration** |
| OD-R Revit row | Needs OD-1 | **owed — 7-17 registration** |

Owed: the job wiring (bridge → `openings.py` per registered photo → advice rows) after 7-17; a door-recall check on a photo with plain doors (the founder's own photos).

## Session MA7 7-18 — E57 panoramas as posed photos (2026-10-17; branch feature/ma7-18-e57-panoramas; the founder's "build now"; test-kit E57 `manitouNoInvalidPoints.e57` (5 spherical panoramas + 5 posed scans); no Revit; Claude driving)

| Row | What happened | Result |
|---|---|---|
| X-0 | `photo/e57_images.py` "sentinel-e57-images 0.1.0" (stdlib only: XML read with struct, page checksums skipped, a DTD/entity/schema location refused before parsing, as `survey/e57.py`; survey 0.6.0 untouched). `--self-check` (an E57 built in the test, a blob header across a page checksum, a second run and a DTD refused, no half folder) ok. On manitou: 5 JPEGs out at their exact blob lengths (672,215 … 505,102 bytes), names sp2_1 … sp26_2, 5387×678 … 1829×677, translations (0.007, −0.012, 0.177) … (43.248, −24.854, −0.501) m; 03.jpg looked at — the right street panorama, a person on a bench (so the blur step matters). `pumpAVisualReferenceImage.e57` refused in words: "this E57's images carry no JPEG or PNG panorama" (a visual reference image only) | **PASSED** |
| E5-1 (store) | `extractPanoramas` with the real tool on the real E57 in a temporary evidence folder (deps injected, no Supabase): 5 photo items ev-0002 … ev-0006, each `registration {method "E57 scanner pose", scan_item_id ev-0001, image_guid, representation, rotation, translation, confirmed_by}`, no camera EXIF asked of them; 5 `evidence:admitted` rows; 0.2 s; a second press 409 "ev-0001's panoramas were taken out before". `survey/blur.py` takes a panorama: 5394 wide → copy 2048×257 | **PASSED** |
| E5-1 (tests) | vitest: evidence-store (p1) pose + no EXIF + a hand-made "E57 scanner pose" body still refused; (p2) not an E57, 404, 503, the machine credential 403, taken out before; (p3) a panorama swapped between extraction and admission refused by name, a changed scan 409; web `itemLine` + `panoramasLine`. Full WebApp suite 3,810 passed | **PASSED** |
| E5-1 (live) | Files ▸ Evidence ▸ **Take out panoramas** on an admitted E57 in the local app against the bridge on this branch, signed in; then mark faces/plates on each panorama | **OWED** (web publish + bridge restart; the founder's session) |
| E5-2 | A ghost wall projected into one panorama lands on the wall (screenshot) — needs a projection view in the viewer | **OWED** (next slice) |

## Session MA7 7-19 GS-3 — the NOTICE half (2026-10-17; the founder's "do GS-3"; same branch; no Revit)

| Row | What happened | Result |
|---|---|---|
| GS-3 (offline) | The pack's NOTICE is built from the ledger's build:run rows (`noticeText`), so no separate NOTICE file is needed. vitest feeds it the trainer's real receipt (`photo/fixtures/splat-tools.json`, from `splat_train.tools()` under the private Python 3.10) as a training job's row and a registration job's pycolmap row: the NOTICE carries `- gsplat 1.5.3+pt24cu124 · Apache-2.0`, `- torch 2.4.1+cu124 · Apache-2.0 AND … BSD-3-Clause …`, `- pycolmap 4.2.1 · BSD-3-Clause` | **PASSED** |
| GS-3 (live) | The NOTICE downloaded from a pack whose training job really ran (Files ▸ Evidence ▸ NOTICE) | **OWED** (with GS-1: needs 7-17 registration + the founder's photos) |

## Session MA7 7-17 / 7-18 core + 7-20 bridge wiring (2026-10-17 local: the founder's "go 1 and 2", then the founder's Lighthouse folder; no download, no Revit, no web publish, the 4100 bridge not restarted; photos and the E57 views stay in the scratchpad; Claude driving, the bridge wiring built by a Sonnet agent and fixed before the merge)

| Row | What happened | Result |
|---|---|---|
| 7-18 views | Master's 7-18 reader (`photo/e57_images.py`, sentinel-e57-images, built the same night by another session) now also returns `pixel_width` / `pixel_height`; my parallel pye57 reader was dropped for it. `photo/panorama_views.py`: `spec()` from a reader record, `cut()` a pinhole view with an exact K and world-to-camera (mm), so a panorama view goes wherever a photo goes. manitou file: 5 spherical images (3 × ~354°, one 120°, one 240°; ~5 400 × 680 px, 44.5° tall), stations at 0 m, 0.08 m, 18 m, 18 m, 50 m | **built** |
| 7-18 pixel convention (E5-1) | The standard's text does not settle where azimuth 0 sits or which way columns run. Tried 10 conventions: cut 40 views, ran SfM, aligned to the E57 poses. Image-centre azimuth 0 was 113° off; the best, azimuth 0 at ¾ of the width, gave a 10° median rotation error and 0.5 m centres, but only 11/40 views registered (30° worst). Intensity-vs-photo and edge cross-correlation checks were inconclusive (the scans have intensity, no colour) | **not confirmed** — `CONVENTION_CONFIRMED = False`: no E57 pose is written as a registration until a run confirms it (E5-1, E5-2 owed) |
| 7-17 maths | `photo/register.py`: Umeyama similarity (never a reflection, collinear refused), `fit()` RMSE + held-out check distance in mm, `pose_points()` (3 points per pose so poses on a line still fix a rotation), `sfm()` pycolmap (fixed PINHOLE or self-calibrated SIMPLE_RADIAL, exhaustive or sequential). `photo/test_register.py`: exact synthetic numbers + the cut's round trip | **pass** (18 photo tests, 1 skipped without the models) |
| RG-0 on the founder's photos | `Desktop\Sentinel Test Folder\Photos\Lighthouse` (309 DJI X5R frames, 2048 × 1080; **the founder's own photos** (confirmed 2026-10-19: "The Lighthouse photos are mine to use; record them as my own.")). Blurred copies first (blur.py, YuNet proposals: 14 boxes on 13 frames; **frame 00157 shows two people from behind with no box — the founder confirms the boxes**). pycolmap on the 309 copies, sequential matching, self-calibrated: **309/309 registered**, 185 827 points, mean reprojection 0.558 px, f 1667 px, k1 −0.116, 1 105 s on the CPU | **pass** (RG-0); RMSE to a scan owed — no scan of this site, so no control points (RG-1…RG-3) |
| OD-1 on real poses | 26 frames (every 12th): 68 detections; 60 ghost openings made from them (box corners onto the plane of the SfM points inside the box) plus a copy of each moved 2.5 widths sideways; each judged in the other frames that have it in view: real 48 seen / 783 not seen, moved 2 seen / 735 not seen; 18 detections "no ghost — not filed". "Seen" is meaningful (≈ 20 × likelier for a real ghost); "not seen" is weak (no occlusion or facing test, k1 ignored by the pinhole, detector misses), so it stays advice and never counts against a ghost | **pass as advice**; OD-1 on a real changeset owed (a model of the site) |
| 7-20 bridge wiring | `POST /changesets/:key/:id/openings-advice` → `adviseOpenings()` (openings-logic.mjs pure, openings-store.mjs, `photo-store.runJudge`): a signed-in contributor (the machine credential 403), write budget 10/user, only own blurred registered photos (`usable(i,"read")`), ONE `evidence:openings <cs> · n/m seen · advice` ledger row with the words and the tool receipt; nothing is filed or changed. Words: "seen in ev-… (detector, advice)", "not seen", "no registered photo sees it — not asked", "no ghost — not filed", "not registered — not asked". Fixed before the merge: one Python child for every photo (`--judge` takes a job list; two real frames: 14.0 s then 0.5 s), and a ghost no photo has in view is "not asked", not "not seen". Ghost sizes: Width/Height/SillHeight when the ghost has them, else door 900 × 2100 / window 1200 × 1200 sill 900 (ponytail) | **pass** (bridge openings + photo-store tests 15/15) |
| OD-2 receipt | The row and the batch answer list sentinel-openings, grounding-dino-tiny, sam2.1-hiera-small, transformers, torch with licences; the NOTICE (`toolsOf`) does not read `evidence:openings` rows yet | **pass**; NOTICE pickup owed |
| OD-R Revit row | Needs a registered photo of a modelled site | **owed** |

Owed: the founder confirms the blur boxes (00157); E57 convention confirmation (E5-1/E5-2); 7-17 Stage B (service, control-point picking, `evidence:registered` writing `registration`); the registration's frame must be the model's frame (a changeset's Location mm); OD-1/OD-R on a real changeset; NOTICE pickup of the openings receipt.

## Session PROT-B — protection policy, roadmap item 1 slice B (2026-10-19 local; branch feature/protection-policy; the founder's "go"; Revit 2024 on a scratch copy `Documents\Sentinel drills\prot-b-drill.rvt` of ma5b-b2.rvt, bound to ma4c-drill; the 4100 bridge NOT restarted (still master, so it does not know the kind yet); Claude driving)

| Row | What happened | Result |
|---|---|---|
| PB-0 setup | Add-in 2024 deployed from the branch (02:44). Wall A 1625663 `BDS_INT_STR_CONC_200 mm`: Structural ticked (Bearing) as found. Wall B 1625328 `BDS_INT_ARC_CMU_200 mm`: not structural. Changeset `a028b86f…` filed by `POST /changesets/ma4c-drill` (source agent): two wall retypes at the same width (to `BDS_EXT_STR_CONC_200 mm` / `BDS_EXT_ARC_CMU_200 mm`) | pass |
| PB-1 kept | Review AI Proposals → both ticked → Apply. The check before commit judged 1 element (only B reached the transaction); Place anyway. Result: "Applied 1 element(s)"; "Kept as they stand (1 kept): wall …0018ce3f: is structural, protected by the built-in protection policy (none — the bridge does not know the kind 'protection') — kept as it stands; a lead edits it by hand or installs a looser protection policy" | **pass** |
| PB-2 fail closed | The bridge answered the add-in's `protection` read with an unknown-kind refusal (it runs master); the add-in used the built-in default and named why, never "nothing protected" | **pass** |
| PB-3 ledger | Changeset `partially_applied`; ledger #2762 `changeset_applied` carries the kept line; B (6f17ade3…) in `applied`, A (8ff53aa0…) in `rejected` | **pass** |
| PB-4 installed policy | 4100 restarted on master (edb8969d, auth gate ARMED; the founder refreshes the Funnel). protection@1 · project (19b1654c…) installed by `artefact-import.mjs`: levels and grids only, `structural_hosts: false`. Changeset `0b3ecdc7…` retyping the same structural wall 1625663: the check before commit judged it, "Applied 1 element(s)", no kept line, ledger #2767 — the installed policy was read, not the default. Then protection@2 · project (95847ebb…) installed with the default values, so ma4c-drill is protected again | **pass** |

Revit closed without saving the scratch copy.

## Session PROT-W — the Protection window (2026-10-19 local; branch feature/protection-window; the founder's "in Revit next to the Standards button"; Revit 2024 on `prot-b-drill.rvt` (ma4c-drill), signed in as the founder; Claude driving; a Sonnet reviewer read the code)

| Row | What happened | Result |
|---|---|---|
| PW-1 open | Sentinel ▸ Standards & Build ▸ **Protection** (right after Standards) opens at once and fills itself: "In force now: protection@2 · project · 95847ebb…", every category ticked by name (no Revit code on screen), "This model is not workshared", the pattern `*Shared Levels and Grids*` in the box, "Every project in the office (ma2e-office)" offered, Save enabled for a lead/owner | **pass** |
| PW-2 save | Unticked Survey point and "Walls and floors marked Structural" → Save (this project): "✓ Saved as protection@3 on ma4c-drill, recorded in the ledger"; the bridge holds exactly those categories and `structural_hosts: false`; ledger #2770 `artefact_installed protection@3` by the signed-in founder (not "cli") | **pass** |
| PW-3 reset | Reset to the built-in default → Save → protection@4 (the default values) — ma4c-drill protected as before | **pass** |
| PW-F1 | The window grew and shrank with the status line, so the buttons moved under the pointer (a missed Save click) | **fixed**: the status line keeps two lines' height |
| Review | Sonnet reviewer: a throw while reading (signed-out `BcfConfig.Load`) would leave the window on "Reading…" forever; the same on Save (`UserSession.Actor`); a workset name over 120 characters got the bridge's indexed refusal | **fixed** (read wrapped, read-only with the reason; actor read before the pool thread; the long name said by name) — not re-run live |

## Session STD-F — Standards in force without JSON (2026-10-19 local; branch feature/standards-forms, spec docs/superpowers/specs/2026-10-19-standards-forms-design.md; the founder's "build batch 1 and batch 2 together"; master fast-forwarded locally (not pushed) so the founder's port-4000 local app served the branch, against the 4100 bridge (bridge code unchanged); signed in as the founder in Chrome; scratch project `std-f-drill-standards-forms` under ma2e-office; Claude driving; a review workflow (wf_d663b4da-7fc: 3 lenses, 2 skeptics per finding) read the diff in parallel)

| Row | What happened | Result |
|---|---|---|
| F-1 rows | Every row of Standards in force: no "Install JSON…" anywhere. naming, contract, layers, review, publish, roi → **Edit…**; ids → Edit in Documents; ruleset → Choose in Standards; carbon_factors → Edit in Carbon; type_catalog / protection → "Edit in Revit ▸ Standards & Build ▸ …"; guideline, lod_matrix, ifc_export → "No editor yet — import a file under Advanced"; evidence_pack → nothing | **pass** |
| D-1 naming (office → project) | Edit… opens filled from the office's naming@1 and says saving makes the project's own; title changed → "✓ naming@1 saved on std-f-drill-standards-forms (sha 6ea533b4e26a…)"; row `naming@1 · project`; ledger #2773 by the founder, source `{form: project-settings}` | **pass** |
| D-2 review | A step left blank → "Step 1 needs a name" (form stays open); Lead check / a lead or the owner / 1 → review@1, ledger #2774, body `{steps:[{name:"Lead check",role:"lead",approvals:1}]}` | **pass** |
| D-3 publish | Ticked "Publish automatically…" → publish@1 `{auto:true}`, ledger #2775 | **pass** |
| D-4 roi | EUR, rate typed "65,5", 30 min per gate run, 2 per rename → roi@1, body hourly_rate 65.5, minutes {delivery_gate:30, naming:2}, ledger #2776 | **pass** |
| D-5 contract | From the office's contract@1: class typed "ifcwall" + Pset_WallCommon → contract@1 (IFCWALL in capitals, schema_version kept), ledger #2777 | **pass** |
| D-6 layers | From the office's layers@1: grid letter without level/grid layers → "Name the layers where levels or grids are drawn first"; A-WALL-INT added → layers@1, ledger #2778 | **pass** |
| D-7 naming refused by the bridge, then @2 | A pattern `[0-9` reached the bridge: "Not saved — naming: fields[6].pattern does not compile…" (nothing saved, a JSON path in the words → F-STD-5); restored → naming@2, semver 1.0.2, `_note` and `placeholders` kept, ledger #2779 | **pass** (words fixed, see F-STD-5) |
| F-STD-1 | The parts / layers / steps tables overflowed the narrow panel (allowed values and the remove ✕ cut off, a sideways scrollbar) | **fixed**: rows are cards ("Part 3", Remove); re-run: no sideways scroll |
| F-STD-2 | A new review step started as "Any member", which also hid that viewers never approve | **fixed**: a new step starts as "A lead or the owner", 1 approval; the option reads "A contributor, lead or owner (not viewers)" |
| F-STD-3 | The base contract's "no count limit" showed as 2147483647; clearing it saved 0 = none allowed (review: a blank % saved 0 too) | **fixed**: blank = no limit on that side (written as the readers read it), a new class with no limit refused in words; re-run D-5b below |
| F-STD-4 | The contract mirror reported "already on the platform as sentinel-contract.json contract@1" for a project not linked to that platform project (review: it would write another project's gate contract) | **fixed**: mirrored only into the platform project the project is linked to; re-run D-5b |
| F-STD-5 | A pattern the bridge cannot compile was said with a JSON path, counted from 0 | **fixed**: checked in the form first — "Part “Number”: “[0-9” is not a valid pattern — e.g. [0-9]{4} = four digits…" (vitest) |
| Review (11 confirmed) | Besides F-STD-3/4/5: "1,000" read as 1 (thousands comma) → refused in words; list fields one-line (pasted lines became spaces) → text boxes; an explicit "skip no grid letter" (`skip_letters: []`) dropped on an unchanged save → shown as "none" and kept; a save over a version installed after the form opened → refused; a save finishing after another Edit… opened wiped that form / hid its refusal → fixed | **fixed** (vitest: 20 form tests) |
| D-5b contract re-run | Cards fit; the PROXY count shows blank (no limit) next to 25 %; a new IFCSPACE with no limit → "Limited class 2: give the most allowed — a count, a share in %, or both (0 = none allowed)"; count "1,000" → "could be read two ways — write it without a thousands separator"; 1000 → "✓ contract@2 saved … · not copied to the platform — std-f-drill-standards-forms is not linked to this platform project"; body: PROXY {2147483647, 0.25}, IFCSPACE {1000, 1}; ledger #2780 | **pass** |
| S-1 stale save | Naming form opened on naming@2; Choose in Standards → Base standard pack installed naming@3 (#2783); back in Settings, Save → "Not saved — the naming standard changed since this form opened (now naming@3 · project · 8a3513677491…); open the form again to start from it" | **pass** |
| L-1 / L-2 / L-3 links | Edit in Documents → the project's Documents tab; Choose in Standards → the Standards sidebar (packs); Edit in Carbon → Lifecycle ▸ Carbon 6D | **pass** |
| A-1 Advanced | "Advanced ▸ Import a file from another office" closed by default; opens to a kind picker + Choose file… | **pass** (the file pick itself not run — a Windows file dialog; `installArtefactFile` unchanged and unit-tested) |
| R-1 contributor | A contributor sees no controls | **owed** (needs a second signed-in account); the gate is the unchanged `canInstallArtefacts` (vitest) |

Follow-ups (not this change): the platform mirror treats any `contract@n` tag already on the platform project as "already" even when another body made it (platform-contract.ts, tag-only check); the Next strip and Settings list do not refresh when another tool installs a standard (seen after the pack install).

## Session STD-3 — Standards without JSON, batch 3: guideline, ifc_export, lod_matrix (2026-10-19 local; branch claude/zen-babbage-3c5e92, spec docs/superpowers/specs/2026-10-19-standards-batch3-design.md; started from session local_c56d9eed with the audit's split — Revit windows for guideline and ifc_export, a web form for lod_matrix — taken on the founder's standing "proceed with the recommendation"; master fast-forwarded locally (not pushed) so the port-4000 local app served the branch, 4100 bridge unchanged; signed in as the founder in Chrome and in Revit 2024; scratch project `std-f-drill-standards-forms` under ma2e-office; scratch model `Documents\Sentinel drills\std-3-scratch.rvt` (a copy of ma1a-s1-scratch) bound to it; Claude driving; one review agent read the diff in parallel)

| Row | What happened | Result |
|---|---|---|
| F-1 rows | lod_matrix → **Edit…**; guideline → "Edit in Revit ▸ Standards & Build ▸ Standards ▸ Modelling Guideline"; ifc_export → "… ▸ IFC Export Mapping"; no "No editor yet" left | **pass** |
| L-1 refusals | Save with no class → "Add at least one class"; two Walls cards → "Walls appears twice — one card per class"; Doors snap 10 → "Type snap for Doors must be 0 — a door or window is matched by its type name's width x height, never snapped"; SD → Coordination with DD on Design → "Design development (DD) cannot come before Schematic design (SD): it is mapped to an earlier project stage" — nothing sent | **pass** |
| L-2 new matrix | Draft; CD → Construction; Walls (storey level, top to next storey, Pset_WallCommon.FireRating, snap 5) + Doors (storey level, hosted in a wall, snap 0) → lod_matrix@1 on the project, ledger #2790; body exactly the form (`stage_map {CD: constr}` only, `type: guideline_rule` on each row, `standard_key std-f-drill-standards-forms-lod`, semver 1.0.0) | **pass** |
| L-3 edit | Edit… opens filled from lod_matrix@1; Walls snap 5 → 10 → lod_matrix@2 (#2791): only the snap and semver (1.0.1) moved, status/stage_map/properties kept | **pass** |
| R-0 ribbon | Revit 2024 ▸ Sentinel ▸ Standards & Build ▸ Standards lists Modelling Guideline and IFC Export Mapping (after Ingest Docs) | **pass** |
| G-1 guideline window | Opens at once, then fills from guideline@1 · office (BDS v3, 8 Walls rules); levels (GR_SSL, GR-FFL, 01_SSL, 01-FFL, MA0 Roof), Basic Wall's types and the title blocks (BDS_Sheet : A0/A1, BDS_Sheet_V2 : A0/A1, Starting View) listed from the model; Save enabled (lead); office choice names ma2e-office | **pass** |
| G-2 refusal | Rule 1's layer and parameters cleared → "Not saved: Walls, rule 1 names no condition (layer, level, discipline or parameters) — it would match every element; make it the category's default instead." | **pass** |
| G-3 save | Sheets BDS_Sheet : A1 (picked) / A-{level}-{n} / {level} {use}; Walls workset Architecture; phase of the view; rule 1 typed back; name + " (STD-3 drill)" → "✓ Saved as guideline@1 on std-f-drill-standards-forms", ledger #2792; SQL: the body minus standard/sheets/placement equals the office's guideline@1 (all 12 keys, views and references kept, rule 1 restored to the same node) | **pass** |
| G-4 stale save | A second window read guideline@1 · project, rule 2's level picked 01-FFL → guideline@2 (#2793; SQL: only that level added); the first window's Save → "Not saved on std-f-drill-standards-forms: guideline@2 · project · ea2ca63bd91c… was saved since this window opened — close it and open it again to see it; nothing was saved" (no ledger row) | **pass** |
| I-1 ifc_export window | "In force now: none saved yet — Save makes ifc_export@1"; the exporter's data types (Text first) and this model's parameter names listed | **pass** |
| I-2 refusal | Set name "Client Wall" → "Not saved: Property set “Client Wall”: a set name is letters, digits and _ only, starts with a letter and is at most 64 characters (no spaces)." | **pass** |
| I-3 save | Pset_ClientWall, each element, IfcWall + IfcCurtainWall ticked, Fire Rating · Label · Revit parameter Fire Rating → ifc_export@1 (#2794), body exactly that | **pass** |
| I-4 reopen + edit | Reopened filled from ifc_export@1 (ticks, type, parameter); + Pset_ClientDoorType, for its type, IfcDoor, Manufacturer · Text · Manufacturer; common property sets No → ifc_export@2 (#2795): set 1 unchanged (class order kept), `common_psets: false` | **pass** |
| W-1 web rows after the Revit saves | First run: the open Settings list kept guideline@1 · office until reloaded (no live push for an install made outside the page), and the reload's screenshots timed out. **Fixed the same night** (a60f1de2, merged bb8908ba): the bridge's artefact PUT now pushes `{type: "standard", action: "installed", key, kind, version}` on the project's live feed (an office install to each of its projects), and the web's one feed (the Issues panel's) turns it into `sentinel:standard-installed`, which Settings and the Next strip already re-read on. 4100 restarted on master; re-run: after a reload the rows read guideline@2, lod_matrix@2, ifc_export@2 · project; then, with the page left open, Revit's Modelling Guideline window saved rule 1's why + " (live check)" → guideline@3 (#2801) and the open list showed **guideline@3 · project · ac07b129…** with no reload | **pass** |
| Review (5) | A single review agent: the windows said "the first rule that matches wins" but both resolvers try a rule with more conditions first (↑ ↓ only orders rules with as many) → words fixed in the window, help and spec; an old body's blank `when` field could not be saved → dropped on save; a NaN stair width escaped as an exception → refused, Save never throws; a family change could clear the type box → type kept; an office save checked the project's version → checks the office's | **fixed** (guideline-check 47/47, publish-check 180/180) |
| F-STD3-1 | Fixed-width fields sat centred in the windows | **fixed** (left-aligned) |
| N-1 side effect | Ctrl+S on the scratch model (to close Revit without a prompt) ran the scratch project's auto-publish — publish@1 {auto: true} from STD-F D-3: gate PASS, proposal rejected (naming hold), two IDS issues raised on std-f-drill-standards-forms (#2796–#2800). The product as designed, on scratch data; left as they are | noted |

Driving notes: in Revit 2024 the first click on a newly shown Sentinel window only activates it (its X and Save need a second click); a window can be closed by a WM_CLOSE to the foreground window when its X does not take. Revit's ribbon tab row needs the mouse wheel (one notch = one tab). A new add-in DLL brings Revit's unsigned add-in prompt: Load Once (Always Load would change a standing trust setting).

## Session PCS — PC Settings: this PC's settings without JSON (2026-10-19 local; branch claude/blissful-hawking-70c532, started from session local_e3b5d027 with the founder's rule "no JSON or CLI for users"; Revit 2024.3 on a scratch copy `Documents\Sentinel drills\pcs-scratch.rvt` of std-3-scratch.rvt; the 4100 bridge on master, not restarted; signed in as the founder in Revit; Claude driving)

The keys a PC holds, found from SentinelAddin: config.json (SettingsManager.PcOnlyKeys) — `ollama_url` (default http://localhost:11434/api/generate), `ghost_model` (qwen2.5:7b-instruct), `ghost_vision_model` (llava), `ghost_cloud_opt_in` (false), `ghost_family_library_dir` and `ghost_mapping_schema_path` (blank: not used); `ghost_source_folder` stays in Project Setup (This machine). bcf-config.json (BcfConfig) — `serviceUrl` (http://localhost:4100, else BCF_SERVICE_URL), `modelId` (blank: every model's issues), `serviceToken` (the machine credential; blank on an external install, else BCF_TOKEN when there is no file), `supabaseUrl` and `supabaseAnonKey` (else SUPABASE_URL / SUPABASE_ANON_KEY). Any other key (legacy `projectId`, `master_ruleset_path`, …) is kept as it is.

| Row | What happened | Result |
|---|---|---|
| R-0 ribbon | Sentinel ▸ Standards & Build ▸ Standards lists PC Settings after Sign in | **pass** |
| W-0 window | Opens at once from the two files: bridge http://127.0.0.1:4100, sign-in address shown; shared token "None — people sign in instead", sign-in key "Set (hidden)" — no secret on screen | **pass** |
| T-1 tests, first run | Test → "✗ The calling thread cannot access this object because a different thread owns it." | **F-PCS-1** |
| F-PCS-1 | Each Test read its text box on a pool thread | **fixed**: the form is read on the UI thread, only the call runs off it (promote-check row); redeployed, re-run below |
| T-1 bridge | "✓ The bridge at http://127.0.0.1:4100 answers." | **pass** |
| T-2 sign-in | "✓ Signed in as <the founder's e-mail>; the sign-in is valid." | **pass** |
| T-3 local AI | "✓ Ollama answers on this PC. Ghost Builder's model qwen2.5:7b-instruct is installed. The photo model llava is installed." | **pass** |
| S-1 refusal | Bridge http://bridge.example.test → Save → "Not saved: The bridge address … is not https and not on this PC — … set an https address in Standards ▸ PC Settings." Nothing written | **pass** |
| S-2 save | Bridge typed back, photo model llava → llava-drill, Save → "✓ Saved — config.json: ghost_vision_model (old file kept as config.json.bak-20261019-181055)". On disk: the same 13 keys in the same order, only ghost_vision_model changed; bcf-config.json untouched (sha a2354dc337d1 before and after) — the bridge address typed back to what was shown is not written | **pass** |
| S-3 reopen | Close, Standards ▸ PC Settings again → Photo model reads llava-drill | **pass** |
| S-4 restore | llava typed back, Save → saved with a backup; config.json byte-identical to before the drill (raw sha a976682da0f0); the drill's two backups deleted | **pass** |

Revit closed without saving the scratch copy. Revit-free: promote-check 1290/1290 (PC Settings rows: round-trip keeps unknown and nested keys, case variant dropped, backup first, the add-in's own readers read the result, PR-1 token refusal, words name PC Settings, wiring), session-check 47/47, event-check 56/56, project-context-check 135/136 (the one failure, "every model client is built with this PC's opt-in", predates this branch: MA-7-28's vision readers pass `cloudOptIn: false`).

## Session REV — Revert changeset and "applied, then saved" (2026-10-19 local; branch claude/confident-bohr-092989; design docs/superpowers/specs/2026-10-20-revert-and-persisted-design.md; Revit 2024 on a scratch copy `Documents/Sentinel drills/rev-drill.rvt` of prot-b-drill.rvt (ma4c-drill, protection@4 = the default values); test bridge 127.0.0.1:4101 on the branch; signed in as the founder; Claude driving)

| Row | What happened | Result |
|---|---|---|
| R-0 window | Coordinate ▸ Applied AI Changes opens at once: "39 applied changeset(s), newest first", each with "not yet seen saved" (none had a saved check before this build). While it is open, Review AI Proposals refuses with the Busy words (the review guard holds) | **pass** (F-REV-1: the Busy words did not name this window — **fixed**, they now say "Applied AI Changes holds it too … close that window first") |
| R-1 never saved | Check revert on `a028b86f` (PROT-B) and `0b3ecdc7` (PROT-B4): "Nothing would go back — … does not carry this changeset's stamp in this model — it was undone already, or this is another copy of the model". The PROT-B drill's model was never saved after those applies: the ledger said "applied" for changes the file does not hold — the gap B closes | **pass** |
| B-1 saved | Agent changeset `b8b9b2f1` (REV-A3: wall create, level create, retype of wall 1625328 to BDS_EXT_ARC_CMU_200 mm) applied ("Place anyway" at the DD IDS check), then Ctrl+S → `changeset_confirmed` ledger #2822 `{how: saved, held: 3, missing: []}`; doc `persisted: confirmed/saved` | **pass** |
| B-2 closed without saving | Agent changeset `1ded4c12` (REV-B3: one wall) applied; this PC's record written (`%AppData%/Sentinel/unsaved/ma4c-drill/1ded4c12….json`); Revit closed, "Save changes?" → No; reopened → `changeset_lost` ledger #2825 `{how: reopened, held: 0, missing: [d6741d91…]}`; record removed. The list shows it orange: "NOT in the saved model (1 element(s)) — closed without saving, or Revit stopped" | **pass** |
| R-2 preview | In the new session, Check revert on REV-A3: "2 row(s) go back … 1 kept as they stand: create level "REV L09": Levels are protected by protection@4 · project … kept as it stands; a lead reverts it by hand or installs a looser protection policy" — the protection policy holds a revert too; nothing changed (rolled back) | **pass** |
| R-3 reason | Revert with the reason box empty → "Type why you revert it — the reason is recorded on the ledger with your name." Nothing changed | **pass** |
| R-4 revert | Reason typed, Revert, OK → "Reverted in this model: 2 row(s) back, 1 kept (one Undo step: "Sentinel revert: drill REV-A3 revert [b8b9b2f1]")"; ledger #2826 `changeset_reverted {op: undo, basis: revert, guids: [retype, wall], kept: [level + why], reason, by: the founder}`; doc `reverted` set; no record left on this PC | **pass** |
| R-5 Ctrl+Z | Ctrl+Z → ledger #2827 `changeset_reverted {op: redo}` (the change is back), doc `reverted` cleared. Ctrl+Y → #2828 the revert again (basis revert, reason, kept), doc `reverted` set | **pass** |
| R-6 model | Check revert again: wall "REV wall 1" "is no longer in this model", retype "is "BDS_INT_ARC_CMU_200 mm" now, not the changeset's …", level kept by protection — the model holds the revert | **pass** (F-REV-2: the list said "reverted by … · saved in the model" — the save was of the change as applied; **fixed**: "· as applied: saved in the model") |

Revit closed without saving the scratch copy (so the revert itself is not in the file: the design's stated limit, a revert's own persistence is not checked). Revit-free: promote-check 1322/1322 (32 new rows: the rows never reverted, the reason, the words, the event table of the saved check, the records on this PC, the attach `before` body). Bridge: vitest 3877 passed (reportReverted basis revert, attach `before`, reportPersisted, MCP status, desk words). Not run live: the web desk's words and the MCP status (unit-tested; owed to the founder's session after the publish), a workshared local save/sync, an attach revert (no attach changeset on this model), a Revit crash (covered by the reopening path).

### Session REV, part 2 — the rows owed (2026-10-19 evening; master 279433bc deployed 2021–2027, 4100 on master, web 1.0.95; the founder refreshed the Funnel)

| Row | What happened | Result |
|---|---|---|
| M-1 MCP | The real MCP server over stdio against 4100: `sentinel_changeset_status` REV-A3 → `undone {ledger_id 2828, basis: revert, by, reason, kept: 1}`, `persisted confirmed/saved`, `reverted {…}`; REV-B3 → `persisted lost/reopened, missing 1` | **pass** |
| W-1 desk | The founder's look at the published desk (1.0.95, ma4c-drill): REV-A3 "reverted in Revit by … "…" (ledger #2828) — 1 row(s) kept as they stood · saved in the model (saved)"; REV-B3 "NOT in the saved model — closed without saving, or Revit stopped (1 row(s))"; REV-C "reverted in Revit by …: "Drill REV-C: the attach was not wanted"" | **pass** (F-REV-3: "saved in the model (saved)" doubled the word and missed "as applied:" after a revert — **fixed** b4fc7b69, Revit's words; web 1.0.96) |
| A-1 attach | Wall 1625328 (base GR-FFL set to +0 on the scratch copy; top 01-FFL +500): agent changeset `b9135fde` attach GR-FFL → REV L09, applied; the stored result keeps `before {top_level: 01-FFL, top_offset_mm: 500}`; Ctrl+S → confirmed; Check revert "1 row(s) go back", Revert with a reason → ledger #2834; Properties: Top Constraint "Up to level: 01-FFL", Top Offset 500 — as before the attach | **pass** |
| WS-1 central | Collaborate ▸ Worksets enabled worksharing; saved as central. A central opened directly: Save is greyed (Ctrl+S does nothing) | noted |
| WS-2 naming guard | Synchronize with Central on central "rev-drill": CDE-01 stops it ("Central file 'rev-drill' does not match naming@1") — and the saved check posts nothing for the sync that did not happen. Also after a Save As without "Make this a Central Model" (the central path still names rev-drill) | **pass** |
| WS-3 sync | The founder saved `REV_ARC_ZZ_XX_M3_A_0001.rvt` with "Make this a Central Model after save"; agent changeset `86600e52` (one wall) applied; Synchronize Now → ledger #2843 `changeset_confirmed {how: saved_locally}` (the sync's local save) and #2844 `{how: synced}`; this PC's record removed | **pass** |
| WS-4 Save As | Changeset `042ee0de` applied in rev-drill.rvt before the Save As: its record kept naming rev-drill.rvt, so no save of the new file confirmed it — the design's stated Save As limit, seen live; the stale drill record was deleted by hand | **limit** (follow-up: carry records across Save As) |

Revit closed (synced, nothing unsaved). Scratch files left in Documents/Sentinel drills: rev-drill.rvt (workshared central), REV_ARC_ZZ_XX_M3_A_0001.rvt (central) and their backups.
| WS-5 Save As (fixed) | Branch build (DocumentSavedAs moves this PC's records from the old path to the new one and checks them there) on Revit 2024, scratch copy `rev-sa.rvt`: agent changeset `a7b836d7` (one wall) applied, record names rev-sa.rvt; the founder's File ▸ Save As ▸ `rev-sa-2.rvt` → ledger #2849 `changeset_confirmed {how: saved, held: 1}`; record removed | **pass** — WS-4's limit closed |

## Session IDS-G — the IDS from the installed standards (Q5) (2026-10-19 local; branch claude/gracious-jang-925174, spec docs/superpowers/specs/2026-10-19-ids-from-standards.md; the founder's decision Q5 "the whole loop stays in Sentinel"; master fast-forwarded locally (not pushed) so the port-4000 local app served the branch, and the 4100 bridge restarted on it (Funnel not refreshed — local only); signed in as the founder in Chrome; scratch project `std-f-drill-standards-forms`; Claude driving; one Sonnet reviewer read the diff)

**Independent proof — IfcTester (IfcOpenShell 0.9.0.post1, venv `%APPDATA%\Sentinel\ifctester-venv`).** `tools/ids-proof/compile.mjs` compiles the IDS from `tools/ids-proof/bds-proof-contract.json` (the BDS pilot contract + 8 required properties, IFC2X3) and `bds-proof-ruleset.json` (the BDS pilot ruleset + a proof level rule LV-P that some storeys pass) with `standardsToIds`, writes it as IDS 1.0 XML (it passes the IDS 1.0 XSD — `ids.open(validate=True)`), and writes Sentinel's own verdicts on the same file: properties by the contract's delivery gate (`checkDelivery` coverage per class), level names by the naming engine (`RuleEngine.checkName`). `check.py` runs IfcTester on the XML and compares per specification and requirement (applicable / failed):

| File | Walls IsExternal · LoadBearing · FireRating | Doors FireRating · IsExternal | Floors LoadBearing | Levels LV-01 · LV-P | Disagreements |
|---|---|---|---|---|---|
| BDS20268 …M001-S2-P03.ifc (150 MB, Revit, IFC2X3 despite its name) | 1078/0 · 1078/17 · 1078/395 | 132/19 · 132/0 | 230/30 | 18/18 · 18/9 | **0** |
| golden-nugget.ifc (MA-4c drill, another vendor) | 413/0 · 413/2 · 413/413 | 0 · 0 | 110/7 | 12/12 · 12/12 | **0** |
| Snowdon Towers Sample Structural.ifc | 58/0 · 58/0 · 58/58 | 0 · 0 | 108/77 | 12/12 · 12/5 | **0** |
| revit2024-concept-ifc4rv.ifc (fixture) | 9/0 · 9/0 · 9/9 | 1/1 · 1/0 | 3/1 | 8/8 · 8/8 | **0** |

The one difference seen is in reporting, not in the verdict: a property no element of any class carries (Walls FireRating on golden-nugget) is "Required property … not found in the file" from the contract gate (one line, no per-class count) and 413/413 failing from IfcTester — both fail it; the compare reads the gate's "not found" as every element of the class failing. Two harness slips were fixed on the way (the ifcopenshell file freed before the reporter read it → a segfault; a UTF-8 read of "·").

| Row | What happened | Result |
|---|---|---|
| G-1 row | Settings ▸ Standards in force: the ids row shows **Generate from standards…** beside Edit in Documents (owner) | **pass** |
| G-2 preview | "IDS from the standards in force — Made from contract@3 · ruleset@4 · naming@4. Keeps 3 specifications of ids@1 …"; It checks: "Levels must have a Name matching ^(?:(?:(L\d{2}\|LB\d\|LMZ\|LRF)_(FFL\|SSL)\|STREET LEVEL))$"; Not in the IDS (9): schema, the proxy limit, WS-01/VN-01/VP-01/SN-01/FN-01/GR-01 and the container naming, each with its reason and "checked by …" | **pass** (F-IDSG-1: the base contract's proxy limit read "at most 2147483647" — the forms' "no limit"; **fixed** c5bae639, only the share is said) |
| G-3 install | Install as the project's IDS → ids@2 · project; ledger #2854 `artefact_installed ids@2` by the founder, source `{generated_from: [contract@3…, ruleset@4…, naming@4…]}`; #2855 IDS topics superseded by ids@2; body = ids@1's 3 specs (kept, no origin) + "Levels · naming LV-01" (origin ruleset), title/enforce kept from ids@1 | **pass** |
| G-4 out of date | contract Edit… → required properties Pset_WallCommon.FireRating, Pset_DoorCommon.FireRating, FireRating → contract@4 (#2856); the ids row then says, in amber, "ids@2 · project · ed3ea66d8aaa… was generated from an earlier contract or naming rules — generate it again to bring it up to date" | **pass** |
| G-5 regenerate | Generate again: It checks "Doors must have FireRating in Pset_DoorCommon" + the level rule; Not in the IDS (11) adds "Pset_WallCommon.FireRating: already required by the IDS in force ('Walls carry fire rating')" and "FireRating: names no property set … write it as Pset_WallCommon.FireRating"; Install → ids@3 (#2857, #2858); body = 3 kept + "Doors · contract base-default" + "Levels · naming LV-01" (ids@2's generated spec replaced, not piled up); the amber line is gone | **pass** |
| G-6 note | The "✓ ids@n installed …" line is redrawn away within seconds by the live feed's own reload of the section (the bridge's {type: standard} event) — the same for every Standards in force install, before this change | **noted** (pre-existing) |
| G-7 review fixes, live | A Sonnet review found 8 real issues; all 8 fixed in cac03b14. The two serious ones: a regenerate wrote `enforce: warn` over an IDS in force with none, which loosens a reject gate; and generated entities were bare class names, which `ids.ts` matches unanchored, so `IFCBUILDING` also judged storeys and proxies. Also fixed: unknown `Pset_<X>Common` classes; XSD `\d`/`\w`/top-level `\|`/braces; parameter-rule exclusions; two panel races; the empty IDS. Bridge restarted on cac03b14 and the app reloaded: Generate → the same plain-words preview → Install → ids@4 · project (ledger #2872); the stored entities are `^(IFCDOOR\|IFCDOORSTANDARDCASE)$` and `^IFCBUILDINGSTOREY$`, the kept specs are untouched, and `enforce` is kept (warn, as in ids@3). The IfcTester proof was re-run on the new XML (`[0-9]` patterns): 4 files, **0 disagreements** | **pass** |

Not run live: **Download .ids** (a browser download needs the founder's OK per item — the same `idsToXml` output is what IfcTester validated above); the stale-preview refusal on Install (a JSON compare of a fresh GET, unit-level only); a contributor's view (the button is under the same `canInstallArtefacts` gate as Edit…).

The proof compares IfcTester with the contract gate and the naming engine, not with `ids.ts` itself: the unanchored-match bug was invisible to it and is now pinned by a unit test (`ids-from-standards.test.mjs`). Follow-up, not built: Documents ▸ "install as IDS" (an EIR compile) replaces the whole IDS, which drops the generated specs and their `generated_from`.

## Session CLM — apply claim, retry-safe result, two-office isolation, a revert's own save (2026-10-19 local; branch claude/vigilant-jepsen-e54701; spec docs/superpowers/specs/2026-10-20-apply-claim-isolation-revert-saved-design.md; test bridge 127.0.0.1:4101 on the branch against the live database; project ma4c-drill; agent changesets CLM-A `d72673ed` (wall create + retype) and CLM-B `edb70423` (one wall); Claude driving: the bridge rows with curl as the add-in would, the Revit rows on Revit 2024 after the founder allowed it)

| Row | What happened | Result |
|---|---|---|
| L-1 claim | `POST …/d72673ed/claim {session: drill-other-pc-0001, pc: DRILL-PC-2, actor: colleague@drill}` → 200, doc `claim {by, pc, at, until = at + 30 min}` | **pass** |
| L-2 second claim | Another session claims the same changeset → 409 `"drill CLM-A claim + revert saved" is being applied by colleague@drill on DRILL-PC-2 (since 19:53 UTC) — nothing was changed; try again when they finish, or after 20:23 UTC` | **pass** |
| L-3 result under a foreign claim | A Decline all from another session, and one with no session (an agent, an older add-in) → 409 `… — this result was not recorded; the changeset stays proposed; …`; no ledger row (CLM-A's ledger: its proposal #2851 only) | **pass** |
| L-4 withdraw under a claim | → 409 `… — it was not withdrawn; …` | **pass** |
| L-5 unclaim | Another session's unclaim leaves the claim as it is (200, unchanged); the holder's unclaim clears it; a third session can then claim and unclaim | **pass** |
| L-6 retry-safe result | CLM-B claimed by `drill-rev-session-01`, its result (a decline) with `attempt_key: drill-attempt-0001` → 200, `declined`, claim cleared, ledger #2859. The same send again → 200 `replayed: true`, ledger #2859; the same key as an `Idempotency-Key` header → the same; another key → 409 `changeset is declined — a result can be reported exactly once, from proposed`. CLM-B's ledger: #2853 proposed, #2859 applied — one row, no double record | **pass** |
| L-7 a revert recorded before this build | `POST …/b8b9b2f1/persisted {of: revert, …}` (drill REV-A3, reverted 2026-10-19 without `rows`) → 409 `… was recorded before its rows were kept — its save cannot be checked; nothing was saved` | **pass** |
| R-1 Apply under another PC's claim | Revit 2024.3, branch build, scratch copy `Documents/Sentinel drills/claim-drill.rvt` of prot-b-drill.rvt, signed in as the founder; CLM-A claimed by the simulated `drill-other-pc-0001` (DRILL-PC-2); Review AI Proposals ▸ CLM-A, both rows ticked, Apply → the window: `Not applied — "drill CLM-A claim + revert saved" is being applied by colleague@drill on DRILL-PC-2 (since 20:05 UTC) — nothing was changed; try again when they finish, or after 20:35 UTC` / `Nothing was changed in the model; the proposals are still pending.`; no transaction, no ledger row | **pass** |
| R-2 Apply lands | The other PC unclaims; Apply again → while the DD IDS dialog was open the bridge held `claim {by: the founder, pc: YAZAN_HIJAZEEN, session: this Revit's}` and refused the simulated PC's claim in those words; Place anyway → "Applied 2 element(s)"; doc `applied`, `claim: null`, `result.attempt_key` stored; ledger #2860 `changeset_applied` (one row). Re-posting Revit's own result with its attempt key → 200 `replayed: true`, ledger #2860. Ctrl+S → `changeset_confirmed` #2862 | **pass** |
| R-3 a revert saved | Applied AI Changes ▸ CLM-A ▸ Check revert "2 row(s) go back" ▸ reason ▸ Revert ▸ OK → "Reverted in this model: 2 row(s) back, 0 kept", ledger #2863 `changeset_reverted` (doc `reverted.rows` = both guids); this PC's `…/unsaved/ma4c-drill/d72673ed….revert.json` written; the list line "— revert not yet seen saved". Ctrl+S → #2864 `changeset_revert_confirmed {how: saved, held: 2, missing: []}` (the deleted wall counted as held, the retype by its stamp's revert mark); doc `reverted.persisted confirmed/saved`; record removed; the list then reads "— revert saved in the model · as applied: saved in the model" | **pass** |
| R-4 a revert closed without saving | CLM-C `5d4c2a5b` (wall create + retype) applied, Ctrl+S (#2869 confirmed), reverted (#2870); Revit closed, "Save changes to claim-drill.rvt?" → No; reopened → #2871 `changeset_revert_lost {how: reopened, held: 0, missing: [both]}`; doc `reverted.persisted lost/reopened, missing 2`; record removed | **pass** |

CI suite: `bridge/two-office-isolation.test.mjs` on PGlite 0.5.10 (migrations 0001–0043 unedited, a minimal Supabase shim): 113 tests — RLS on every public table, every table tenant-scoped or listed, signed-in A sees 0 of B's rows in every table (and B of A's), anon none, B's rows proven present, writes into B refused, the definer functions answer nothing for B; a mutation (`using (true)` on transmittals) fails 4 tests by name. No isolation hole found. vitest 193 files, 3998 passed; promote-check 1333/1333; add-in builds 2024 (net48) and 2027 (net10).

## Session EIR-M — an EIR compile installs beside the IDS made from the standards (2026-10-19 local; branch claude/gifted-carson-fce84f, commit 9eb4b3a2; closes Session IDS-G's follow-up "Documents ▸ install as IDS replaces the whole IDS"; master fast-forwarded locally (not pushed) so the port-4000 local app served the branch, and the 4100 bridge restarted on it (Funnel not refreshed — local only); signed in as the founder in Chrome; scratch project `std-f-drill-standards-forms`, ids@4 = 3 untagged base specs + "Doors · contract base-default" (origin contract) + "Levels · naming LV-01" (origin ruleset), enforce warn; Claude driving)

Before: Documents ▸ Compile to IDS ▸ Install put the compile in as a whole new ids@n — the generated contract and naming checks and the body's `generated_from` were gone, so the project lost those checks without a word and the ids row's "out of date" line could never show again. Now the bridge merges (`eirToIds`, `POST /cde/:key/artefacts/ids/eir`): compiled specs carry `origin: "eir"` and replace the last compile's (an untagged spec with a `source_sentence` — only `compileIds` writes one — counts as an older EIR install's); every other spec, `generated_from`, the title and `enforce` stay as the IDS in force has them (no `enforce` stays none — reject to the judge); a compiled requirement a kept spec already makes is listed as skipped, not repeated (`facetKey`, shared with `standardsToIds`).

| Row | What happened | Result |
|---|---|---|
| M-1 EIR | Documents ▸ + New document ▸ Create EIR "Drill EIR-M EIR merge"; section 2: "All walls shall have Pset_WallCommon.FireRating. All doors shall have Pset_DoorCommon.FireRating. Every window shall have Pset_WindowCommon.ThermalTransmittance." Saved (ledger #2876 `section_updated`) | **pass** |
| M-2 preview | Document view ▸ Compile to IDS: "Proposed IDS — 3 specification(s) from 3 requirement sentence(s), 0 not compiled"; "Installing keeps 5 specification(s) of ids@4 · project · ac171b573992… that did not come from a compile — the checks made from the contract and naming rules stay — and replaces the last compile's."; amber "Skipped: WALL — FireRating — already required by the IDS in force ('Walls carry fire rating')" and "Skipped: DOOR — FireRating — … ('Doors · contract base-default')"; green "WINDOW — ThermalTransmittance" with its sentence | **pass** |
| M-3 install | Install on this project → ids@5 · project `8b3329f0c16d…` (ledger #2877 `artefact_installed ids@5` by the founder, source the document; #2878 IDS topics superseded). Body: the 5 specs of ids@4 untouched + "WINDOW — ThermalTransmittance" (origin eir); `generated_from` identical to ids@4's; title and `enforce: warn` kept | **pass** |
| M-4 ids row | Settings ▸ Standards in force: the ids row shows ids@5 with no out-of-date line — it still reads as made from the standards in force (before, an EIR install left no `generated_from`, so `up_to_date` was null and the line could never show) | **pass** |
| M-5 generate after | ids ▸ Generate from standards…: "Made from contract@4 · ruleset@4 · naming@4. Keeps 4 specifications of ids@5 … that did not come from these standards" (the 3 base specs and the EIR's window check); It checks the doors and level rules; Install → ids@6 `f550ab0c5f69…` (#2890): the window spec kept with origin eir, the generated specs replaced in place | **pass** |
| M-6 compile again | Compile to IDS again on the same EIR: "keeps 5 specification(s) of ids@6" (its own window spec not counted); Install → ids@7 (#2913): exactly one window spec — replaced, not piled up; sha `8b3329f0c16d…` = ids@5's (the same body made again); `generated_from` = ids@6's | **pass** |

Not run live: the amber line reappearing after a standard changes post-EIR-install (it reads only `generated_from`, which M-3/M-6 show kept byte for byte; G-4 showed the line itself; the unit test `ids-from-standards.test.mjs` "POST …/ids/eir … out-of-date line" walks install → contract change → `up_to_date: false`); a first IDS from an EIR on a project with none (unit test: no `enforce`, no `generated_from`, as before). Known limit, not built: a requirement skipped because a generated spec makes it comes back only when the EIR is compiled again, if a later regenerate stops making it (the generator has the mirror case). vitest 195 files, 4014 passed, 2 skipped.

## Session CT — clash triage: groups, owners, one Issue per group, not a clash, imported BCF (2026-10-19 local; branch claude/zealous-volhard-df7d8b, commits 08c6bfd3 + 0de941dd; spec docs/superpowers/specs/2026-10-20-clash-triage-design.md; the founder's Q5 "the whole loop stays in Sentinel"; master fast-forwarded locally so the port-4000 local app served it, the 4100 bridge restarted on it (Funnel not refreshed — local only); signed in as the founder in Chrome; project aster-tower with two models loaded: ARC v3 and ARC v2 of `ASTR26-AST-ZZ-XX-M3-A-0001.ifc`, so every element meets its own older copy; Claude driving)

| Row | What happened | Result |
|---|---|---|
| CT-1 group | Run clash (Hard 0.02 m): 728 hits (560 overlapping, 168 touching) → Groups: "98 group(s) · 728 clash(es)" — e.g. "Slab × Wall · L09_FFL · Architecture 14", "Duplicate Wall × Wall · L13_FFL · Architecture 14", "Duplicate Window × Window …", "Duplicate Slab × Slab … 1", "Touching Wall × Window · L08_FFL · Architecture 8"; plain names and storey names, never an IFC code; the duplicate text says remove the Architecture copy, never the structural one, and that a person does it in Revit | **pass** |
| CT-2 lock | Mark not a clash while the gate was STALE: "Not recorded — the Federation Gate's last run is stale — a live model changed since; run it again. Nothing was sent." | **pass** |
| CT-3 not a clash | Run gate → PASS; Mark not a clash on "Touching Door × Wall · L13_FFL" → "4 touching pair(s) recorded as not a clash (touching faces, no overlap volume)"; 4 register records status not_a_clash with the reason and group `touching\|Door × Wall\|L13_FFL\|Architecture`; ledger #2947–#2950 "Clash marked not a clash: Wall '…' ↔ Door '…' — touching faces, no overlap volume", by the founder. After a reload and a new run: 724 hits — the 4 do not come back | **pass** |
| CT-4 owner | Discipline owners ▸ Architecture → the founder's e-mail: every Architecture group's Owner shows it; `clash_triage/owners` = {Architecture → …}; ledger #2951 "Clash discipline owners set: Architecture → …" | **pass** |
| CT-5 raise group | ⚑ Raise group on "Slab × Wall · L09_FFL · Architecture (14)": one topic `d2362013…` "Clash group: Slab × Wall · L09_FFL · Architecture (14)", Open, assigned to the owner, 16 element GUIDs in its viewpoint; 14 register records with that bcf_guid and the group; ledger #2952–#2965 (14 "Clash raised" rows); groups 97 → 96, hits 724 → 710; the dashboard counts it as one clash issue | **pass** |
| CT-6 import door | A stand-in for a Navisworks clash that came in as BCF (topic `3cba2eb3…`, type Clash, author Navisworks, viewpoint = wall 1200510 + slab 1200567; inserted on the drill project, not through the bridge — the machine token is not in this checkout) → ＋ Imported BCF: "1 imported clash(es) added to the groups", grouped "Slab × Wall · L08_FFL · Architecture 1" with the owner. The stand-in was closed afterwards | **pass** |

Not seen live: the Register view's "Not a clash: <reason> · Group: …" line (Chrome disconnected; the records it reads are verified above). Not built, by decision: a delete operation for duplicates — changesets cannot delete and Revert could not undo one, so a duplicate group is an Issue for its owner (founder's call if a real delete op is wanted). Observed: 98 groups for 728 hits on a 14-storey tower is still many — the split by level is per spec; a "group by pair only" view is a follow-up if coordinators ask. Collisions: another session's commits to master reloaded the port-4000 app three times mid-drill, and the active project is shared across tabs. vitest 196 files, 4015 passed (3 failures fixed or flaky: html-sinks escaper ×2 fixed in 0de941dd; licence-check timeout passed on rerun).

## Session EIR-M2 — nothing lost between the EIR and the standards; plain words; .ids download (2026-10-19 local; branch claude/gifted-carson-fce84f, commit 96ba2a37; closes EIR-M's known limit and its "not run live" out-of-date row; local master fast-forwarded (not pushed) so the port-4000 app served it, the 4100 bridge restarted on it once (Funnel not refreshed — local only); signed in as the founder in Chrome; scratch project `std-f-drill-standards-forms` from ids@7 (EIR-M); Claude driving)

The gap: a requirement the EIR shared with another check was dropped at the EIR install, or thinned out of the generated specs at a regenerate — so a later regenerate (or a later compile without it) lost it silently. Now the EIR's held-back specs ride in the IDS body (`eir_skipped`) and are placed again at every install from either side (`placeEir`); the generator never thins its own specs against the EIR's. The Documents preview says it in plain words (no `source_sentence`/`unmatched`) and offers **Download .ids** (the merged IDS as buildingSMART IDS 1.0) instead of a JSON download; the Generate preview says what it puts back from, or holds back from, the EIR.

| Row | What happened | Result |
|---|---|---|
| N-1 preview | Compile to IDS on "Drill EIR-M EIR merge": "Checks from this EIR — 3 of 3 requirement sentence(s) read"; "A proposal: check each line against the sentence it came from. A sentence in red is in the EIR but not in the IDS — reword it, or it is not checked."; "Installing keeps 5 check(s) of ids@7 …"; amber "WALL — FireRating: already checked by 'Walls carry fire rating' — held back so it is not checked twice, and put back if that check goes" (and DOOR by 'Doors · contract base-default'); buttons **Download .ids** · Install on this project | **pass** |
| N-2 install | → ids@8 `e20e5a77556e…` (ledger #2966): the same 6 checks as ids@7, `generated_from` unchanged, enforce warn, and `eir_skipped` = WALL — FireRating, DOOR — FireRating | **pass** |
| N-3 out of date | contract Edit… → required properties "Pset_WallCommon.FireRating, FireRating" (door one removed) → contract@5 (#2968); the ids row then shows, in amber, "ids@8 · project · e20e5a77556e… was generated from an earlier contract or naming rules — generate it again to bring it up to date" — on an IDS last installed from an EIR (EIR-M's "not run live" row) | **pass** |
| N-4 put back | Generate from standards…: "Made from contract@5 … Keeps 5 specifications of ids@8 …"; green "Puts back from the EIR: DOOR — FireRating — these standards no longer check it."; Install → ids@9 `3b707f576847…` (#2969): "Doors · contract base-default" gone, **"DOOR — FireRating" (origin eir) in force**, WALL still held (the base spec still checks it), `generated_from.contract` = contract@5; the amber line is gone | **pass** |

Not run live: **Download .ids** (a browser download needs the founder's OK per item; the route's `xml` is pinned in `ids-from-standards.test.mjs` and is the same `idsToXml` IfcTester validated in IDS-G). The scratch project is left on contract@5 / ids@9; the active project in the app was set back to ma2e-colon (another session's). vitest 195 files, 4015 passed, 2 skipped.

## Session BCF-RT + FEED-L — work alongside: BCF files and the no-toll data feed (2026-10-20 local; branch claude/clever-jackson-3d2c14, commit 0e63fdff; a 4101 test bridge on the branch (the SEC-8 precedent: loopback, machine credential, no platform-gate poller, no expiry sweep) against the real database; migration 0044 applied on the founder's "Apply it"; Claude driving; desktop access to Revit, Power BI and File Explorer declined by the founder this session)

Spec: `docs/superpowers/specs/2026-10-19-work-alongside-connectors.md`. Before the drill, a security review (2 confirmed BCF defects + 2 feed hardenings, fixed a3e22b44) and a correctness review (21 of 23 findings confirmed, fixed e19c8a5c) ran; the BCF exports were then checked against buildingSMART's own XSDs (release_2_1 and release_3_0 `Schemas/`, lxml): 511 exported files of the 38 samples + 3 Sentinel-made topics, both versions — all valid. The only invalid files are 3 of buildingSMART's own 3.0 samples (their `extensions.xml` has `SnippetTypes` out of order), which Sentinel carries unchanged in a same-version file and never writes itself.

| Row | What happened | Result |
|---|---|---|
| 0044 apply | probe part 0 "0" → apply `0044_feed_keys` → part 1 6 of 6 true → part 2 "PROBE 0044: 7 of 7 as expected." (rolled back: 0 keys, 0 probe projects, 0 probe users after) | **pass** |
| BCF-1 import 2.1 | `POST /cde/projects` bcf-drill (201); the 19 buildingSMART 2.1 samples through `POST /bcf/3.0/projects/bcf-drill/import`: 21 created, 0 skipped; the same 19 again: 21 unchanged | **pass** |
| BCF-2 import 3.0 | bcf-drill-v3 (201); the 19 3.0 samples: 21 created, 0 skipped; again: 21 unchanged | **pass** |
| BCF-3 store round trip | each source topic folder (markup, viewpoints, snapshots, bitmaps, documents) against the same-version export through `GET …/export`: 51 (2.1) + 56 (3.0) files compared at XML level / byte for byte — **0 differences** | **pass** |
| BCF-4 exports valid | the four route exports (2.1 and 3.0 of both projects, 156 files) validated against the official XSDs — all valid; 3.0→2.1 says what 2.1 cannot carry (36 lines: server-assigned ids, camera aspect ratios), 2.1→3.0 loses nothing | **pass** |
| BCF-5 openCDE | `GET /bcf/3.0/projects/<p>/topics/<guid>` of an imported topic: 200, no `x_` bookkeeping; its viewpoint snapshot: 200 image/png (111 391 and 81 491 bytes) | **pass** |
| FEED-1 CSV | a test feed key (made in SQL for benchmark-hospital's owner — no sign-in route without a JWT; key file deleted after), Basic: `elements.csv` 200 text/csv, BOM, header as documented, **12 670 rows** (the newest complete revision; PostgREST's 1000-row cap gone), `elements.json` 12 670, `revisions.csv` 7, `?rev=<id>` 2 827, `?rev=NOPE` 404 in words | **pass** |
| FEED-2 refusals | a well-shaped wrong key 401 + `WWW-Authenticate: Basic`; a project the owner is not in (b9-publish) 403 in words; the machine credential 403 in words; no credential 401 + Basic | **pass** |
| FEED-3 revoke | the key revoked (SQL `revoked_at`) → 401 "this feed key is not valid or was revoked…"; `last_used_at` was recorded by the reads | **pass** |
| FEED-4 speed | 14 reads 0.2–0.44 s (also after 70 s idle). **Two slow first reads right after the migration**: 21 s (200) and 32 s (502 — "statement timeout" from the anon role's 3 s limit); not reproduced since. Fixed in part: the bridge asks once more on a statement timeout (0e63fdff). Ceiling noted: ≈100k elements a revision at the measured 64 ms per 12.7k | **pass with a watch** |

Not run live (owed): **Power BI Desktop and Excel reading the feed** and **the web Data feed screen making a key** — the founder's (a feed key is typed into Power BI's sign-in by its owner, and desktop access was declined); **KUBUS BCF Manager (BIMcollab) in Revit 2024** round trip and the **Revit BCF Issues Import/Export buttons** — desktop access declined; **an ACC Issues BCF export** — needs the founder's ACC (no Autodesk API, files only). Drill projects `bcf-drill` and `bcf-drill-v3` are left for the founder's look (Deleted items can take them). vitest 201 files, 4136 passed, 2 skipped (after the rebase on master 0ea5594d).

## Session BCF-RV — the Revit BCF Issues buttons, live (2026-10-20 local; master 3e0d0d6a, web 1.0.101, add-in deployed 2021–2027; Revit 2024 on a drill copy `Documents\Sentinel drills\bcf-drill.rvt` (bound to `ma4c-drill`), Sentinel add-in loaded once; Claude driving on the founder's "go")

| Row | What happened | Result |
|---|---|---|
| RV-1 import | Sentinel ▸ BCF Issues ▸ **Import BCF file…** → the Windows "Import a BCF file" dialog (filter *.bcf;*.bcfzip) → buildingSMART v2.1 "Component Selection" sample → "BCF 2.1 file: 1 new, 0 updated."; the list shows "[Open] Component Selection" (6 → 7 open); details: Type Issue, Status Open, Author dangl@iabi.eu 2015-10-16, **Linked el: 3**, its description, History "Imported from a BCF file" by the signed-in user | **pass** |
| RV-2 export for ACC | **Export BCF file…** → "BCF 2.1 — for ACC" (default) → "Saved ma4c-drill-issues.bcfzip — 7 issue(s) for ACC (BCF 2.1)." The sample's topic folder against the source: identical (viewpoint, snapshot bytes, 3 components) except `TopicType="Issue" TopicStatus="Open"` added — the ACC rule (the sample had neither); all 7 issues carry a status | **pass** |
| RV-3 export 3.0 | the same dialog's third choice "BCF 3.0" → "Saved ma4c-drill-bcf30.bcfzip — 7 issue(s) for BCF 3.0. Not carried: … viewpoint …'s elements and markup (BCF 3.0 needs a camera for them — export as 2.1 to keep them)" (the IDS raises' camera-less viewpoints, said in words); the sample keeps camera, snapshot and 3 components | **pass** |
| RV-4 XSD | both Revit-made files (23 XML files) validated against buildingSMART's release_2_1 / release_3_0 XSDs (lxml) — 0 errors | **pass** |

Not run: **KUBUS BCF Manager 7.1 (BIMcollab)** — its panel is a CefSharp web view that does not take automated clicks (the toolbar's New, Add, Open and the warning icon did nothing; its Settings dialog opened and was cancelled unchanged), so making an issue there and re-opening Sentinel's export there is the founder's (steps in the session answer). The imported sample issue stays on `ma4c-drill` (a drill project). Files kept in `Documents\Sentinel drills\bcf\` for the BCF Manager step.

## Session BCF-IOS — an independent BCF engine (IfcOpenShell bcf-client 0.9.0) against Sentinel's files (2026-10-20 local; master 73c74d3c, web 1.0.102, 4100 on it, add-in deployed 2021–2027; the founder has no BIMcollab account, so KUBUS BCF Manager is out; bcf-client — the BCF engine inside Bonsai/BlenderBIM — downloaded from PyPI on the founder's "Yes, download it" into a throwaway environment, deleted after)

| Row | What happened | Result |
|---|---|---|
| IOS-A read | bcf-client loads Sentinel's live exports of `ma4c-drill` (for ACC 2.1 and 3.0): 7 topics each, every one with a status; "Component Selection" has 1 viewpoint, 3 components and its snapshot | **pass** |
| IOS-B write → Sentinel | bcf-client writes a new topic as 2.1 and as 3.0 (a comment pointing at a viewpoint with a camera and 3 components); Sentinel reads both completely (title, status, author, comment → viewpoint, 3 GUIDs, camera) and the live route imports each: "1 new" (Revit's Issues window showed them by live sync) | **pass** |
| IOS-C re-save | bcf-client loads Sentinel's for-ACC export and saves it with its own writer; Sentinel's XML diff of the two: **0 differences** | **pass** |
| IOS-F found + fixed | the first IOS-C run crashed in bcf-client: the buildingSMART sample embeds its IFC (`Estructura.ifc`, isExternal=false); Sentinel keeps models in its CDE, not inside an issue, but the export still said the model was inside. Fixed 49be7a1e: the export writes such a model as a reference and says so in its "not carried" list; the import reply says "the model file … (564 KB) inside this BCF file is not kept". Re-run above is after the fix | **fixed** |

Owed: BCF Manager / BIMcollab (needs a BIMcollab account the founder does not have) and an ACC Issues import (needs ACC); the "for ACC" export follows Autodesk's documented rules (status on every issue, ≤100 a file). vitest 201 files, 4140 passed.

## Session PBI — Power BI Desktop reads the data feed (2026-10-20 local; master c72899ac, web 1.0.102, 4100 on it, through the Funnel; Power BI Desktop 2.140 on this PC; Claude driving on the founder's "do it yourself", the founder pasting the key — a key is typed into another company's app by its owner only)

| Row | What happened | Result |
|---|---|---|
| PBI-0 key from the screen | the founder made a key on Lifecycle ▸ Data feed (label "Power BI", 23:12:54 UTC) — the screen's Make a feed key, live, under his sign-in (RLS insert of his own row) | **pass** |
| PBI-1 connect | Power BI ▸ Get data ▸ Web ▸ `https://4374ga.tailfae508.ts.net/feed/benchmark-hospital/elements.csv` → Power BI got the 401 + `WWW-Authenticate: Basic` and opened "Access Web content" → Basic, user name `feed`, the key pasted by the founder → Connect → preview: UTF-8, comma, the documented columns, `revision_date` read as a date | **pass** |
| PBI-2 load | Load → "Table: elements (12,670 rows)" — the newest complete revision, no 1000-row cut | **pass** |
| PBI-3 refresh | Home ▸ Refresh, twice: no error; Supabase's edge log shows each refresh as 3 `POST /rpc/feed_rows` 200s; the key's `last_used_at` follows (23:26:25) | **pass** |
| PBI-4 revoke | a revoked key → 401 through the Funnel (Claude's own test key, revoked after). The founder's "Power BI" key stays live and in use, so Power BI's own revoke message was not shown | **pass (route)** |

Note: Claude's separate test key (put on the clipboard) went unused — the founder had already copied his own key from the screen, which is the real user flow. Power BI was left open with the loaded table (unsaved).

## Session LV — the ledger verifiable by an outsider, per project (2026-10-20 local; branch claude/eloquent-tu-4984da, commits 362bce01 + 0cbc1a66 + efb04e06, merged 61d3a374; strategy §5 "ledger verification and anchoring"; migration 0045 applied on the founder's "Yes, apply" after the careful review's fixes; DigiCert chosen by the founder as the timestamp authority; a 4102 test bridge on the branch (the SEC-8 precedent: loopback, machine credential, no event poller, no platform-gate poller, no expiry sweep) with `LEDGER_TSA_URL=http://timestamp.digicert.com`, against the real database; Claude driving)

| Row | What happened | Result |
|---|---|---|
| M-0 probe part 0 | no table, view or function named as 0045's (0); 2,856 ledger rows name a project | **pass** |
| M-1 apply + part 1 | 0045 applied (≈08:56 UTC); 9 of 9 true — every project row chained once, seq 1..n with no gap, every `project_hash` recomputes in SQL, trigger after insert, RLS on, view `security_invoker`, no API role may write a chain row or call the append function; 2,856 chain rows in 108 projects | **pass** |
| M-2 part 2 | "PROBE 0045: 8 of 8 as expected." (rolled back); after: 2,856 chain rows = 2,856 ledger rows, no probe project left | **pass** |
| T-0 DigiCert, one synthetic hash | sha256 of "sentinel ledger-verify fixture: DigiCert" sent once (no ledger row). The first check refused DigiCert's real token: Node writes the organisation `DigiCert\, Inc.` (escaped comma) — **F-LV-1**, fixed before the merge (names read unescaped). The saved token then checks offline on the pinned path: `DigiCert SHA256 RSA4096 Timestamp Responder 2026 1 ← DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1 ← DigiCert Trusted Root G4`, one critical time-stamping key usage, nonce, signed digest, signature. Kept as the test fixture `reply-digicert.tsr` | **pass** (after F-LV-1) |
| D-1 scratch project | `POST /cde/projects` `ledger-drill-2026-10-20` → 201 | **pass** |
| D-2 rows | two notes, #2983 and #2984 (the second with `naïve — 日本 "q"` and `12345678901234567890.5`) → 201 each | **pass** |
| D-3 status before | `GET /cde/:key/anchor` → configured, DigiCert, head seq 3, no timestamp yet | **pass** |
| D-4 Timestamp now | `POST /cde/:key/anchor` → `stamped`: seq 3 at 2026-10-20T09:06:15Z by DigiCert SHA256 RSA4096 Timestamp Responder 2026 1, ledger #2985 | **pass** |
| D-5 a second press within the minute | 429 "One timestamp request a minute per project — try again shortly. Nothing was sent." | **pass** |
| D-6 status after | last timestamp seq 3, verified (the chain to seq 3 recomputed, then the token), no problems; current (the head is the anchor row) | **pass** |
| D-7 a forged anchor row | `POST /cde/:key/audit` with entity_type `ledger_anchor` → 400 "ledger_anchor rows are written by Sentinel, not through this route" | **pass** |
| D-8 a newer row | #2986 → head seq 5, last timestamp seq 3 still verified, not current (the screen's words: "1 newer ledger row(s) not yet fixed in time") | **pass** |
| D-9 audit pack | `GET /cde/:key/audit-pack` → version 2, chain 5 rows, readable ledger 5 rows, `chain.verifier` sha256 be9716412663… | **pass** |
| D-10 the verifier | `GET /cde/:key/audit-pack/verifier` → `ledger-verify.mjs`, 25,069 characters, the same sha256 | **pass** |
| D-11 offline check | `node ledger-verify.mjs pack.json` (the downloaded file, its own folder) → exit 0: seal, chain of 5 recomputed, the chain is the pack's project, the readable list is the chain's own rows, seq 3 fixed in time by DigiCert (trusted as "DigiCert's own timestamp service (DigiCert, Inc., under DigiCert Trusted Root G4)"); notes: every row to seq 3 fixed within a day, seq 5 newer than the last timestamp, revocation not checked offline, keep the head for `--expect` | **pass** |
| D-12 a row changed, the pack re-sealed | seq 2's `plain` → `PLAIN`, a fresh seal → exit 1: FAIL seq 2–5 "its project_hash is not the hash of its text", FAIL "the timestamp in ledger #2985: it names a hash that is not the chain's at seq 3" | **pass** |
| D-13 `--expect` | seq 2's hash from this pack → PASS "this chain extends the one you had" | **pass** |
| D-14 the operator's full rewrite | the same change with every `project_hash` recomputed and the pack re-sealed → the chain itself checks, and exit 1: FAIL "it names a hash that is not the chain's at seq 3" — DigiCert's token holds the original | **pass** |
| D-15 the daily round | 5 min after the start: "[anchor] daily: 68 project(s) timestamped, 0 failed; global head stamped" (09:10–09:13 UTC). 68 of the 68 projects that exist; the other 41 chained project ids are deleted projects (their ledger rows are kept, their project row is gone) — the global timestamp covers them, no per-project one. After: 2,929 chain rows = 2,929 ledger rows | **pass** |
| D-16 4100 on master | the 4100 bridge restarted on master 61d3a374 with `LEDGER_TSA_URL` in config/.env (the Funnel answered `/health` 200 from this PC; refresh left to the founder); `GET /cde/ledger-drill-2026-10-20/anchor` → configured, last timestamp seq 5 (the daily round, 09:13:26Z), verified, current | **pass** |
| W-1 the Settings screen | web 1.0.103 published (built from 61d3a374 — the ai-privacy merge 99134176 landed mid-build and is not in it); the app opens in Chrome and reaches the bridge through the Funnel ("the bridge answered 401" before sign-in). Signed in as the founder (published app, Chrome, through the Funnel), aster-tower ▸ Settings: `timestamp` — "Last external timestamp: 2026-10-20 09:10 UTC, verified (DigiCert SHA256 RSA4096 Timestamp Responder 2026 1). Nothing newer since." with **Timestamp now** and **Download the verifier** beside it (the daily round's stamp; neither button pressed — the download needs the founder's OK, its route passed in D-10) | **pass** |

The careful review (high effort) before the apply: **H1** a token from any time-stamping certificate under any web root passed → the verifier pins DigiCert's own service (organisation + root), `--root` for an auditor's own choice, `--trust-system-roots` said in the output; the key usage must be one critical time-stamping. **H2** the timestamps sit inside the data they protect → a token's time must be its row's time (5 min after, 1 h before), a row dated after the token that covers it fails, each range says how long after its writing it was first fixed in time, `--expect <seq>:<hash>`. **M3** the readable ledger list and the project id are checked against the chain. **M4** "the chain follows the id order" is not true under two writers (an id is drawn before the lock) — the wording and the probe row were corrected; the project chain itself never forks (seq under the lock). **M5** the screen's "verified" recomputes the chain up to the stamped seq. L7 (a truncated DER length), L8 (no SHA-1), L10 (jsonb text stability noted) fixed. Open, not this change: the **global** chain (0006) can fork under two concurrent writers for the same reason as M4 (its tip is `order by id desc`); the per-project chains are not affected.

vitest on master after the merge: 204 files, 4,182 passed, 2 skipped; CI on master 4e66b4dc (run 39399565342): WebApp test + build and the add-in builds 2021–2027, all green.

## Session AIP — AI privacy controls: the office's "AI stays on this network" lock, name masking, no telemetry (2026-10-20 local; branch claude/angry-goldberg-b58ee2, merged 99134176; spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md; a 4101 test bridge on the branch (loopback, machine credential, no platform-gate poller, event poll off, a dummy Gemini key that a locked call never sends) against the real database; scratch office `ma3b3-office` (projects ma3b3, ma3b3-b1, ma3b5) for the lock and scratch project `sec5-smoke` (no office) for masking; MCP server v1.3 over stdio against 4101; Claude driving, the founder asleep)

| Row | What happened | Result |
|---|---|---|
| L-0 before | `GET /ai/policy?project=ma3b3`: "Cloud AI is allowed for ma3b3: no AI policy keeps it on this network." | **pass** |
| L-1 office lock | `PUT /cde/ma3b3-office/artefacts/ai_policy {local_only:true, redact:false}` → 201 ai_policy@1 | **pass** |
| L-2 ledgered | ledger #2975 `artefact_installed ai_policy@1`, its new_value carries the body `{local_only:true, redact:false}` | **pass** |
| L-3 inherited | ma3b3, ma3b5 and the office itself read locked; ma3b3: "AI stays on this network for ma3b3: the office's AI policy (ma3b3-office, ai_policy@1) allows no cloud AI." | **pass** |
| L-4 no undo from below | ma3b3's own ai_policy@1 `{local_only:false}` installed → still locked, set by the office | **pass** |
| L-5 cloud refused | `POST /ai/chat {provider: gemini, project: ma3b3}` → 403 "… allows no cloud AI. Use Local (Ollama) — nothing was sent." | **pass** |
| L-6 no project | a cloud call naming no project → 400 "A cloud AI call names its project, so Sentinel can check that project's AI policy — nothing was sent." | **pass** |
| L-7 picker | `/ai/providers?project=ma3b3`: every cloud row unavailable in the lock's words; the answer carries the policy for the Copilot line | **pass** |
| L-8 local still works | `POST /ai/chat {provider: local, project: ma3b3}` → 200 "ok" (this PC's Ollama) | **pass** |
| M-1..M-4 MCP | v1.3: sentinel_audit on ma3b3 → refused in the lock's words ("… an MCP client such as Claude Desktop sends what it reads to a cloud model"); list_projects lists 63, "4 project(s) keep AI on their network …"; ask_app off; list_checks still answers | **pass** |
| R-0..R-5 masking | sec5-smoke given a drill owner and address, ai_policy@1 `{redact:true}`: 6 terms (PROJECT, CLIENT, ADDRESS, PERSON); a 34 KB audit answer with no listed term and no e-mail (its 11 "@" are refs such as ids@1), 18 tokens; the project named by its token is answered; list_projects shows it only as its token | **pass** |
| Review | a high-effort review found 2 High (an MCP project passed as a list skipped the policy; a project lead could detach from a locked office), 4 Medium, 9 Low — fixed or written down as limits; migration 0046 written for the database half | **fixed** |
| C-1..C-9 re-drill | on the fixed code and again after the rebase onto master (ids-conformance + ledger-proof): every lock and MCP row again, the list-shaped project refused (H1), a 43 KB masked answer with 0 leaked terms and 0 e-mails, every cloud picker row in the lock's words | **pass** |
| Revit 2024 R-1 not read | 2026-10-20 evening, Revit 2024 (licence back), the add-in deployed from master; Standards ▸ PC Settings on `ma3d-a.rvt`: the new "AI policy (this model's project)" heading reads, in red, "AI policy not read — Project "ma1-bds" was not found, or you are not a member of it — …" — the model is bound to ma1-bds (this PC's bound-models index still names ma3b3) and the signed-in account is no member: the policy was read off Revit's thread and its refusal said in the bridge's words, never a guess | **pass** |
| Revit 2024 R-2 locked | `std-3-scratch.rvt` (bound to std-f-drill-standards-forms, the account its owner) with the project locked (ai_policy@3 by the machine credential): PC Settings reads "AI stays on this network for std-f-drill-standards-forms: the project's AI policy (ai_policy@3) allows no cloud AI."; ticking "Allow a model off this PC" (never saved) adds "The office lock overrides "Allow a model off this PC" for this project." and unticking takes it away. Nit: "office lock" for a project's own lock. PC Settings closed with Close; both drill models closed unsaved, Revit left on its Home screen | **pass** |
| W-1 form | 2026-10-20 afternoon, published 1.0.104 through the Funnel (the founder signed in in Claude's Chrome tab and refreshed the Funnel after a 14:57 bridge restart): STD-F drill ▸ Settings ▸ Standards in force ▸ ai_policy "none installed" ▸ Edit… → "Edit AI privacy", two ticks with their plain-word hints, no JSON; ticked "AI stays on this network: no cloud AI" → Save → the row reads ai_policy@1 · project · the founder · 2026-10-20; ledger #3059 `artefact_installed ai_policy@1` by the founder's verified e-mail, body {local_only:true, redact:false}, source {form: project-settings} | **pass** |
| W-2 Copilot | Copilot on the same project, after ↻: "🔒 AI stays on this network for std-f-drill-standards-forms: the project's AI policy (ai_policy@1) allows no cloud AI."; the provider picker: Local (Ollama) available, Claude, Gemini, Kimi and NVIDIA Nemotron "— unavailable" (the bridge's rows carry the lock's words). Nit: a Copilot already open shows the line only after ↻ or a project change — a Settings save does not refresh it | **pass** |
| W-3 back | Edit… again starts from ai_policy@1 with the tick on; unticked → Save → ai_policy@2 {local_only:false}, ledger #3060 by the founder; policy reads "Cloud AI is allowed …"; the Copilot line is gone after ↻ | **pass** |

Migration 0046_office_leave_guard (a project leaves its office only through that office's lead) APPLIED on the founder's "Apply 0046" after this session: probe part 0 true/false → true/true, part 1 "PROBE 0046: 5 of 5 as expected.", rolled back (0 probe rows left). vitest 207 files, 4214 passed; promote-check 1379/1379; CI green on 4e66b4dc and c9e92f42 (WebApp + 7 Revit legs). Web 1.0.104 published (the AI privacy form, the Copilot lock line). Every drill policy was reset after the last row: ai_policy {local_only:false, redact:false} on ma3b3-office (@2), ma3b3 (@2), sec5-smoke (@2) and std-f-drill-standards-forms (@4); sec5-smoke keeps the drill owner and address it was given.

## Session LV-2 — the global ledger chain keeps its tip: two writers can no longer fork it (2026-10-20 local; branch claude/eloquent-tu-4984da, commits beb312e9 + 83cb45ff, merged f9881e8b, CI run 39429049337 green; drill LV's open item; migration 0047 applied on the founder's "Yes, apply + drill"; Claude driving)

| Row | What happened | Result |
|---|---|---|
| G-0 the live chain before | read-only: 2,930 rows, 0 forks, 0 dangling links, one root, every hash recomputes — the race had not happened yet | **pass** |
| G-1 PGlite replay | the racing order (ids drawn out of lock order, given explicitly): the old trigger forks (A and C both name B); 0047 refuses to apply onto that forked chain ("2 ends, not one"); after 0047 the same order makes one line, the tip follows the lock, every hash recomputes by the unchanged formula, a failed statement leaves the tip, the project chain (0045) follows the lock too (seq B, A, C) | **pass** |
| G-2 careful review (high) | no critical or high finding; hash text byte-identical. Taken: owner check before commit (M2), UTC + ISO dates pinned in the trigger (the live sessions' own — the same bytes; a session elsewhere can no longer change them) (L2), the chain trigger pinned as the last BEFORE INSERT trigger (L1), truncate and anon/authenticated checks (L3), the rollback note's condition (L4) | **pass** |
| G-3 probe part 0 | no tip table, 1 end, 0 forks, sessions `ISO, MDY / UTC`, owner `postgres` (bypasses RLS) | **pass** |
| G-4 apply + part 1 | 0047 applied (≈13:10 UTC); 7 of 7 true — one tip row, the chain's one end, no fork, every hash recomputes, the trigger security definer with empty search_path + UTC + ISO, last BEFORE INSERT trigger, no API role writes the tip | **pass** |
| G-5 part 2 | the racing order live, rolled back: "PROBE 0047: 5 of 5 as expected." | **pass** |
| G-6 two sessions, live | S1 took the chain lock and slept 6 s, S2 inserted "at the same time", then C: the database tool ran the two sessions **one after the other** (S1 committed 13:14:19, #3056; S2 13:14:27, #3057), so the race itself did not occur live. The three rows (project ledger-drill-2026-10-20, seq 7–9) form one line, 0 forks, tip #3058. The lock-wait path is proven by the PGlite replay and the probe, not by a live race | **pass (no race reproduced)** |

The bridge's daily global timestamp now reads the kept tip (`audit_chain_tip`), falling back to the highest id without 0047; the 4100 bridge was not restarted for it (the change takes effect at its next restart — until then it stamps the highest id, which is also a real row). vitest on the rebased branch: 208 files, 4,229 passed, 2 skipped.

## Session DTA — "do them all": BCF Manager, clash Pair only, Aster Tower publishable (2026-10-21 local; branch claude/silly-kirch-0f8a9e, merged 7c290323 and 5dc2e82f, pushed eb1b418a; the add-in deployed 2021–2027 at 19:33 and 19:50; the 4100 bridge restarted on master at 19:34 (the Funnel refresh is the founder's); Revit 2024 on the founder's Aster local `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt`, opened and closed three times, nothing saved; the review-safety session held off Revit until it was handed over; Claude driving on the founder's "do them all urself")

| Row | What happened | Result |
|---|---|---|
| BCF-M1 BCF Manager | BIMcollab ▸ BCF Manager opens in **Offline** mode with no sign-in, so no BIMcollab account is needed (new). Open and its drop-down did nothing on automated clicks. Keyboard focus inside the panel was refused by the desktop tool ("focus anomaly"), and working around that is not allowed. Same result as BCF-RV | **not run — the founder's** (steps in the session notes) |
| BCF-M2 fresh exports | aster-tower from the live 4100, BCF 2.1 and 3.0: 11 topics each. The 3.0 header lists the camera-less viewpoints it cannot carry. Files in `Documents\Sentinel drills\bcf\2026-10-21\` | **pass** (inputs for BCF-M1) |
| CT-P Pair only | `groupHits(hits, "pair")`: one group per kind × pair, e.g. "Beam × Duct · 2 levels · Mechanical / Structure". The instruction names structure when any hit yields it. The full view is unchanged. Discipline owners are listed per discipline. The html-sinks guard passes. Live UI not driven | **pass (tests)**; live look owed |
| AP-1 what the proxies are | the 26 Sep export: all 224 of 224 proxies are `Muntin Pattern_2x2`, now `AST_Muntin Pattern_2x2` (Revit category Generic Models). They are 457 × 435 × 44 mm muntin grids in the window glazing, 2 per window × 112 windows. Generic Models exports as IfcBuildingElementProxy | **found** |
| AP-2 governed path | none existed: ifc_export held property sets only, and changeset set_parameter covers six host kinds. Built ifc_export `export_as` (7f55c0f8): Revit's own "Export Type to IFC As" (+ "Type IFC Predefined Type") is written inside the export's rolled-back transaction | built |
| AP-3 install | Standards ▸ IFC Export Mapping ▸ Export as: `AST_Muntin Pattern_2x2` → IfcMember, MULLION, This project → "Saved as ifc_export@2 on aster-tower, recorded in the ledger" (P-1's COBie set kept) | **pass** |
| AP-4 IFC Delivery Gate | export + certify: **contract PASS** (contract@1 · project, 28 544 entities, Pset_WallCommon 196/196), ledger #3204. The file: IfcBuildingElementProxy **0** (was 224), IfcMember 224 with IfcMemberType `.MULLION.`, the same GlobalIds (`2g7hEgAuvEG8Tt5lC2ABHp`). publish.log: "export_as (ifc_export@2): 1 type(s) set — AST_Muntin Pattern_2x2 : Muntin Pattern_2x2 → IfcMember.MULLION". Undo and Redo greyed after: the model was not changed | **pass** |
| AP-5 Governed Publish 1 | REJECTED: the name `AST_ASTR26_Aster Tower.ifc` (1 field of naming@1's 7, B10/P-1), and the IDS 238 failing of 364. Delivery gate PASS #3205, verdict #3206, hold #3207. The 238 were `Pset_WallCommon.LoadBearing` "missing" while the IFC says FALSE on all 196 walls: Sentinel had no Revit reader (F-DTA-1) | **found** |
| F-DTA-1 fix | PsetMap LoadBearing: a `LoadBearing` parameter, else the wall's Structural flag (`WALL_STRUCTURAL_SIGNIFICANT`), read as TRUE/FALSE (1bc99bbd). The tests' "no reader" example is now AcousticRating | fixed |
| AP-6 Governed Publish 2 | REJECTED for the name only, plus real data. Gate PASS #3208, verdict #3209: 42 failing, 322 passing, 364 in scope — all `Pset_DoorCommon.FireRating`. The IFC agrees: 14 doors "60 MIN", 42 none. Hold #3210. No issue was auto-raised | **pass** (fix proven live); publish blocked |
| COBie | `AST_COBie_SAMPLE` is absent from the export: the model's `AST_*` parameters are empty. v3's sample COBie was added by `scripts/cobie-sample.mjs` after its export | noted |

Owed — the founder's:
1. A central under the ISO name, e.g. Save As `ASTR26-AST-ZZ-XX-M3-A-0001.rvt` from the central. Governed Publish names the container from the central.
2. Fire ratings for the 42 doors, from the fire strategy (ids@3 requires them; Sentinel does not invent values).
3. ~~BCF-M1 in BCF Manager.~~ **Not needed: the founder chose a native tool (2026-10-21, "why are we working with BIMcollab? i want to replace it with a native tool in Sentinel") — see Session NIT. BCF files stay for interop with other firms.**
4. The Funnel refresh after the 4100 restart.

Holds #3067, #3207 and #3210 stay until a publish passes.

DTA addendum (20:43, the founder's "do it urself"): **owed item 1 done**. The Aster central was opened detached (preserve worksets) and saved as a new central `Desktop\Sentinel Test Folder\Demo\aster-iso\ASTR26-AST-ZZ-XX-M3-A-0001.rvt`. The old central and the old `ASTR26-…-0001.rvt` are untouched (30 Sep, 22 Sep). The model kept `aster-tower` in its settings. Project Setup ▸ Save confirmed it on this PC (bound-models.json). Governed Publish now names the container `ASTR26-AST-ZZ-XX-M3-A-0001.ifc`. Not re-run: the 42 doors without FireRating would still refuse it. Driving note: computer-use cannot type in Revit's own file dialogs. A click on an existing file of the wanted name sets File name, and it survives folder navigation.

## Session GUARD — human-error guards: risk-tiered review, version checks, governed delete of a duplicate (2026-10-21 local; branch claude/infallible-lalande-83eba5, spec docs/superpowers/specs/2026-10-21-human-error-guards-design.md; master fast-forwarded locally to 3aa203b3 then 0b0a1db1, the add-in deployed 2021–2027 then 2024 again with the drill fix; the 4100 bridge restarted on master at ~20:05 (the Funnel refresh is the founder's); Revit 2024.3 on `Documents\Sentinel drills\guards-drill.rvt`, a copy of claim-drill.rvt bound to ma4c-drill, signed in as the founder; Claude driving after the founder's "drive Revit 2024 now")

Stand-ins (CT-6's precedent): the drill changesets GUARD-A `dd1a73e2`, GUARD-B `42a0739c` and GUARD-B2 `6e5e15f8` were built by the bridge's own `proposeChangeset` (deps capture the stored doc; the delete's filing ran as a lead with a clash-register stand-in naming both pairs) and inserted on ma4c-drill — not through the bridge's route, so they have no `changeset_proposed` row. Everything after the filing ran for real: the Revit window, Apply, the result through the 4100 bridge, the ledger, the saved checks, Revert. A colleague's install (protection@5, `drill-colleague@ma4c.test`) was a stand-in inserted the same way.

| Row | What happened | Result |
|---|---|---|
| F-1 filing (bridge code) | GUARD-B as a contributor → `a delete removes an element — it is a lead's or owner's to propose (you are contributor); nothing was saved`; as a lead with no register proof → `2 delete(s) name a pair the clash register does not hold as one element modelled twice in one model (…) — run clash triage and record the duplicate group first; nothing was saved`; as a lead with the register → filed, nothing pre-ticked | **pass** |
| T-1 tiers | GUARD-A opens as "retype wall (1)" with Tick group / Untick group, and "Needs a reason — tick each row by hand (2)" (two wall creates) with Untick group only, the orange "Why you apply the rows ticked here (required)" box, nothing pre-ticked | **pass** |
| T-2 reason required | All three ticked, Apply with no reason → `Rows under "Needs a reason" are ticked — type why you apply them in that group's box (one line, recorded on the ledger with your name), then press Apply.`; nothing sent | **pass** |
| T-3 reason ledgered | Reason typed, Apply → DD IDS check (Place anyway) → "Applied 3 element(s)"; result and ledger #3211 `changeset_applied` (by the founder) carry `tick_reasons` for both creates, no `unreasoned`; Ctrl+S → `persisted: saved, confirmed, 0 missing` | **pass** |
| D-1 Show | GUARD-B ▸ Show on the delete row → Revit finds the copy by its IFC GlobalId and selects it ("Showing the copy delete wall "GA-2" would delete.") | **pass** |
| D-2 not a duplicate | GA-1 (5 m along the kept wall's line) → kept: `wall "GA-1" does not run on the element kept's line (5 mm) — not deleted; it stays as it stands, a person decides` | **pass** |
| D-3 first try | GA-2, an exact duplicate, was KEPT: `cannot be removed alone — removing it would also remove 4 other element(s) (an element with no category …)` — Revit's own bookkeeping of the overlapping walls. Fixed 0b0a1db1: uncategorised elements are the copy's own parts; the words name the class otherwise. The bridge took the all-kept result with both tick reasons (ledger #3213) — the review fix "a reason on a kept row is no refused result" live | **fixed** |
| D-4 delete | GUARD-B2 after the fix → "Applied 1 element(s)" (GA-2 deleted, GA-1 kept as in D-2); result `deleted {keeper_unique_id, 15 values}`, ledger #3215 `removed [{unique_id, ifc_guid, kept}]`, `tick_reasons` 2; Ctrl+S → saved check `confirmed, 0 missing` (a gone copy is held, never lost) | **pass** |
| D-5 revert | Applied AI Changes ▸ GUARD-B2 ▸ Check revert → "1 row(s) go back…"; Revert with a reason → "1 row(s) back, 0 kept", Revit's overlap warning shows the copy is back on the kept wall; ledger #3218 `changeset_reverted` by the founder with the reason; Ctrl+S → the revert's own save `confirmed, 0 missing` (the re-created copy found by its new id and revert mark). The preview did not say the copy's Revit id is new — added after the drill (Commands.AppliedChanges, not re-run live) | **pass** |
| V-1 stale standard | Protection window open on protection@4; the colleague's protection@5 lands; Save → `Not saved on ma4c-drill: HTTP 412: protection was changed by drill-colleague@ma4c.test at 2026-10-21 19:00 UTC — reload to see it; nothing was saved`; no protection@6 written | **pass** |
| V-2 reload | Reopened (protection@5 shown), the colleague's line removed, Save → `✓ Saved as protection@6`; Save again from the same window → `✓ Saved as protection@7` (no false 412); @6/@7 carry @4's sha 1ee0c6a2… — the drill project's policy is as before | **pass** |

Migration 0048 APPLIED ~21:15 on the founder's "apply 0048" (probe 7 of 7, rolled back clean); the 4100 bridge already reads projects.version (no restart). Not run live: the web rows (Project Settings 412 after 0048; the web standard form sends the same If-Match the Revit window did, unit-tested; Coordination ▸ Clash "Propose deleting the copies…" — the shared active project in Chrome was another session's); the over-200 batch reason (promote-check); a row near a protected element (none in this model's reach; promote-check covers the tier, ChangesetExecutor.Guarded is Revit-only). vitest 4256 passed (two load timeouts re-run green), promote-check 1392/1392, builds 2021/2024/2027.

GUARD-W addendum (23:40–23:57, the web rows on the local app; the platform's local-app tab loading the :4000 build = web 1.0.109 from master dc4e6225; signed in as the founder in Chrome):
- **The 4100 bridge was down** at 23:41: the ~20:05 bridge was gone and nothing listened on 4100 (only another session's 4101 test bridge ran). It was restarted on master dc4e6225 at ~23:44. The Funnel was not touched.
- **The Funnel still refused TLS from this PC** after the founder's refresh and after the restart: curl exit 35, and Chrome showed an error page. `tailscale funnel status` says on, proxying to 127.0.0.1:4100.
- **The local app is not loopback by itself.** The :4000 build has the Funnel address compiled in (`WebApp/.env` VITE_SENTINEL_SERVICE), so a test-only fetch rewrite in the local-app frame sent `https://4374ga…` to `http://localhost:4100`. The frame's origin `https://platform.thatopen.com` passes the bridge's origin gate, and Chrome did not block the call. The app code was unchanged.
- **Colleague stand-ins via SQL.** The project update ran with the JWT claim `drill-colleague@ma4c.test` for its transaction, so 0048's trigger names that person. layers@2 was inserted as a doc plus pointer, its sha computed by the bridge's `canonicalSha256`; it has no ledger row.

| Row | What happened | Result |
|---|---|---|
| W-1 stale Project Settings | Settings open on ma4c-drill at version 1; the colleague's Location change → version 2 (21:47 UTC); an Address typed, Save changes → `Save failed: the project's settings were changed by drill-colleague@ma4c.test at 2026-10-21 21:47 UTC — reload to see it; nothing was saved`; bridge `PATCH /cde/projects/ma4c-drill → 412`; the row still at version 2 with no address | **pass** |
| W-2 reload | ↻ and the tabs do not re-read the form (it re-reads on a project switch or after its own save); a page reload (the project re-opened, since the rewrite goes in after the app's first read) → the colleague's Location shown; Address typed, Save → version 3 by the founder, the colleague's Location kept | **pass** |
| W-3 stale standard form | Standards in force ▸ layers ▸ Edit… ("Starts from layers@1 · 51f606ea9ae3…"); the colleague's layers@2 lands; the name changed, Save as the project's standard → `Not saved — layers was changed by drill-colleague@ma4c.test at 2026-10-21 21:53 UTC — reload to see it; nothing was saved`; bridge `PUT /cde/ma4c-drill/artefacts/layers → 412`; no layers@3 | **pass** |
| W-4 reload | Cancel, Edit… again → "Starts from layers@2 · 1f53411a81ef…" (the list row still said layers@1 until the panel re-read); the name set back, Save → layers@3 by the founder with layers@1's sha 51f606ea… — the form round-trips the body exactly | **pass** |

Restored:
- Address and Location were cleared through the form (version 4, empty strings where there were none).
- layers@3 carries layers@1's content.
- The shared active project is back on benchmark-hospital.

Still owed:
- The same rows on the published app through the Funnel, once it answers from outside (same build line, different transport).
- Coordination ▸ Clash "Propose deleting the copies…" (needs a loaded model with duplicate groups).
- UX notes:
  - After a 412 nothing in the panel re-reads. The person reloads the page and retypes (by design, nothing merges blindly).
  - The Standards list keeps the old version on its row until it re-reads.

DTA addendum 2 (21:20–21:30, the founder's "do the fire ratings urself"): **Aster Tower published.**
- **The value.** Aster is the fictional simulation kit; its README recipe seeds "40 doors whose type has no Fire Rating". The 42 unrated doors are one type, `AST_Door_Passage_Single_Flush : AST_EXT_1 PNL_MTL_914 x 2134 mm`. The project's own 22 Sep ⚡ Fix (issue bd320d2c, #643–645) gave these same doors **F30**, and the published v2 IFC carries F30 on them. The central lost it: that fix was made in an unsynced local. So F30 was restored, not invented.
- **The fix.** A local of the ISO central, then BCF Issues ▸ open issue 04c3afb1 (DOOR FireRating, 4 failing) ▸ Fix in Revit. One type row: Fire Rating "" → F30, 4 on the issue + 38 others. Check: 1 would pass (#3222). Apply: "4/4 pass, the issue is now Resolved" (#3223 written, #3224).
- **The sync.** Synchronize with Central, with a comment naming the source. Central and local saved at 21:24:57.
- **The publish.** Governed Publish → **ACCEPTED, published as v4 · wip**.
  - ids@3: 364/364 in scope passed. naming@1 passed. Delivery gate PASS: contract@1, IFC2X3, ifc_export@2 (1 pset, 1 export-as row).
  - Ledger: gate #3226, verdict #3227, set live #3228, uploaded #3229, version `ASTR26-AST-ZZ-XX-M3-A-0001.ifc` v4 #3230.
  - The outbox linked the geometry (#3231) and ingested the snapshot (#3232). The That Open platform gate passed (#3233).
- **Holding Area.** #3067 was superseded by v4 (no longer listed). The `AST_ASTR26_Aster Tower.ifc` naming holds (#3207, #3210) were dismissed with the reason (#3235). On hold now: 0.
- Revit closed, elements relinquished. The issues stay Resolved; closing them is a person's call on the web.

## Session NIT — Sentinel's native issue tool replaces BIMcollab's BCF Manager (2026-10-21 local; branch claude/gracious-swartz-d9f7a0; the founder: "why are we working with BIMcollab? i want to replace it with a native tool in Sentinel")

Audit: BIMcollab BCF Manager 7.1 (installed, `Languages\en.txt` + the KUBUS help pages) against Sentinel ▸ Coordinate ▸ BCF Issues. Built the gaps a coordinator touches daily; skipped Paint markup, visible/hidden viewpoint modes, notify, offline/sync, delete, milestones/areas/approval (said in the session answer, with the reasons).

| Row | What | Result |
|---|---|---|
| NIT-1 list | Columns Nr/Title/Status/Priority/Assigned/Due/Modified, header click sorts (second click reverses), search box, filters status ("Open issues" = not Closed, each status, All) / type / priority / Mine; every status fetched (`?status=all`) so Closed issues show on request | code: `UI/BcfIssuesWindow.cs`, `Coordination/IssueList.cs` (pure, pinned by tools/issue-check: 49/49) |
| NIT-2 quick edit | Status, Priority, Assigned, Due + "Save changes" → one PUT with only the changed fields (case-insensitive compare; a cleared deadline is an explicit null); the bridge logs each to the history under the verified identity and keeps the lead-only close of a referee-raised issue (403 worded) | issue-check `Native()` |
| NIT-3 quick comment | "Send comment" → POST comments; the box clears only when the bridge answered 2xx; buttons disabled until answered (no double send); a live refresh of the same issue keeps what is being typed | issue-check |
| NIT-4 snapshot | A new issue from Revit attaches the active view as a PNG data URL on its viewpoint (Revit's own ExportImage, no model write, 4 MB cap, report-like views skipped and said); the window and the web detail show it | issue-check (body), web vitest |
| NIT-5 section box | "Section box around issue": a BoundingBoxXYZ around the linked elements + 1 m, `SetSectionBox` on the Sentinel Coordination view in one Undo entry; zoom/isolate clear a stale box; a group Revit did not keep is said | reviewed (opus, high): 8 findings, all fixed before the drill |
| NIT-6 web | Coordination ▸ Issues detail: snapshot image, quick edit row, quick comment (`topicChanges` pure + 3 vitest cases) | vitest 4283 passed, 1 failed (pre-existing? see below) |
| NIT-7 selection lookup | "Issues for my Revit selection" searches every fetched issue (closed and filtered ones too) and widens the filters to show a hit | code |
| NIT-R Revit 2024 live | Scratch copy `Documents\Sentinel drills\issues-drill.rvt` (from guards-drill.rvt, bound to ma4c-drill); the add-in deployed to 2024; access granted on the founder's "Allow Revit, drill" (22:39) after two denials | run 22:45–22:50, rows below |
| R-1 list | 9 issues of ma4c-drill in columns; status filter All / each status; Priority header sort (Normal → High → blanks last; Critical sorted after High once set); search "fire" → the one issue | **pass** (F-NIT-1: the count line kept "9 of 9" on a filter change — fixed: `Filtered()` says the new count) |
| R-2 quick comment | Issue 3 (IDS walls FireRating) ▸ "Drill NIT: quick comment from Revit" ▸ Send → `Comment posted on #3 'IDS: Walls carry fire rating — …'`, the box cleared, list refreshed | **pass** |
| R-3 quick edit | Assigned `mep@drill.test`, Priority Critical ▸ Save changes → `Saved on #3: priority → Critical, assigned to → mep@drill.test.`; the list re-sorted (Critical after High), the selection and details followed | **pass** |
| R-4 zoom | Double-click issue 3 → `Isolated + selected 96 element(s).` on the Sentinel Coordination 3D view (96 of the 115 walls are in this copy) | **pass** |
| R-5 new issue + snapshot | ＋ New issue on the 96 selected walls: the dialog says `96 × Walls · camera from 'Sentinel Coordination' (isometric, sent as a 60° perspective) + snapshot`; Create → `Issue created: 'Drill NIT: 96 walls with snapshot' · 96 element(s) linked · … + snapshot — on the web board now.`; listed as #10 within a second; its details show the snapshot image | **pass** |
| R-6 section box | Issue 10 ▸ Section box around issue → `Section box around 96 element(s) on 'Sentinel Coordination' (1 m margin). Undo removes it.` | **pass** |
| R-7 selection lookup | Issues for my Revit selection (the 96 walls) → `Selection is linked to 2 issue(s) (highlighted).` — #3 and #10 | **pass** |
| R-8 isolate all | Isolate ALL listed issue elements → `Isolated 132 element(s) across 10 issue(s).` (the stale section box cleared first) | **pass** |
| R-9 close | Revit closed with No to save: the scratch copy unchanged | **pass** |

Driving: the Chrome Remote Desktop host overlay (`remoting_desktop`, "Unidentified app") blocks input for stretches of ~10–60 s while the founder is connected remotely; waiting and retrying works. Ribbon tabs: Tuuli, then one wheel tick per scroll action.
Not run live: the web rows (Coordination ▸ Issues detail: snapshot, quick edit, quick comment) — `topicChanges` is unit-tested and the PUT/POST routes are the Revit window's.

Not built (said to the founder): Paint markup, visible/hidden viewpoint modes, notify, offline mode, delete, milestones/areas/approval. The bridge did not change (no 4100 restart).
