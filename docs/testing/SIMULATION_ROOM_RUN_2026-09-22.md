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
| 2b · Photo Massing | fail, F43/F46 | llava estimate 2 m × 2 m × 23 storeys; Placed 0 — wall type from the pilot guideline, floor type empty |
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
| F43 | Photo Massing resolved the wall type by the shipped pilot guideline (`BDS_EXT_ARC_CMU_200 mm`, ×92) and found "no comparable type" although `AST_EXT_ARC_CMU_200 mm` exists; floor type empty (×23) → Placed 0 | **product** (class of F8/F26/F29: `ghost_guideline_path` blank = pilot profile) |
| F44 | Annotate Views created 96 views with the pilot's names (`WIP_FP_…`) and templates (`01.100_WIP_…`) from the same guideline, not Aster's `DISC_LEVEL_TYPE_DESC` from the installed ruleset | **product** (two view standards in two files) |
| F45 | Ghost Builder proposes the datum layer (`A-LEVELS → Generic Ceiling`) that Datum already consumed | minor |
| F46 | Vision estimate from four whole-building photos: 2 m footprint, 23 storeys, 2.1 m storey for a 38-storey tower — the amber confirm is the only guard | observation |
| F47 | Project Setup → Browse for the Ghost source folder on Revit ≤ 2024 showed "paste the path" (no folder dialog in .NET Framework WPF) | fixed 22670e4 (WinForms picker), deploy pending |
| F48 | "Loaded v2 into the viewer ✓" is reported without checking that a renderer exists | minor |
| F50 | Dashboard stage gate reports **GATE PASS** while model health and standards compliance are "no data" — a pass on unmeasured criteria; should read blocked / not checkable until a model is loaded | **product** (honesty rule) |
| F51 | Topics raised by a superseded IDS (the pilot's, before the Aster IDS was installed) stay Open on the project with no "superseded" state or bulk close | minor |
| F49 | **Platform viewer does not initialize.** The That Open Platform injects its own viewer runtime into the viewer frame (`VMnnn`, deferred-pipeline shaders, ghost LOD — not our code, not any public package); it reads `PostproductionAspect.DEFERRED` and `NearPlaneLineMaterial` from the app's engine, both beta-only, so with the public engine we ship it throws before the pane starts. Same result with local dev mode on and off, and after publishing 1.0.19. Also found on the way: the CLI login token had expired since July (the CLI does not use the browser session); `npm run login` writes into the tracked `WebApp/.thatopen`; `@thatopen/services` is 0.3.11 vs 0.16.1 | **blocked by the platform** — needs the beta engine we lost access to in July (735bda4), or a platform fix; raise with That Open |
| — | Orphaned memberships after an account was recreated (data) | data fixed; product: FK + flag unknown users |

## Still owed (needs the user at Revit or the browser)
Deploy 22670e4 (folder picker) at the next Revit close. 3.8 MEP Openings (no MEP link in the kit — stays not run). 3.11 and 5.1 stay blocked until the platform viewer runs on the public engine (F49). ecb2691 was deployed and re-verified live on 2026-09-23: Level 1 +4500 … Level 14 +47400, names clean, 11 grids.

## Restore after the simulation (machine-global files under `%AppData%\Sentinel`)
`ruleset.json` ← `ruleset.json.bak-BDS-pilot-1.5.0` · `ids.json` ← `ids.json.bak-BDS-pilot` · `delivery-contract.json` untouched. Redeploy is not needed for these.
