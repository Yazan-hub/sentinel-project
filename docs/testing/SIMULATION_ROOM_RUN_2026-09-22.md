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
