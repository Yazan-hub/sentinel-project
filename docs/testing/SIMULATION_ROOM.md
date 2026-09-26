# Sentinel simulation room — "Aster Studio"

**Purpose:** one fictional office goes through a whole BDS engagement on Sentinel, both surfaces, every tool.
It is the acceptance test for the office-readiness assessment (`docs/superpowers/specs/2026-09-17-office-readiness-assessment-design.md`)
and the regression drill for everything that exists. The operator plays the office *and* BDS. Evidence is
collected as it is produced; the matrix at the end is filled from that evidence only — an unrun tool is `not run`, never `pass`.

**Time:** five acts, ~2 h each, on separate days if needed. **Prerequisites:** Revit 2024 with the add-in
deployed (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024`, Revit closed), the bridge running
(`cd WebApp && npm run bcf:serve`), the web app running (`npm run dev`), the Aster kit prepared per `demo/aster/README.md`.

## Ground rules
- Evidence or it did not happen: a screenshot, a bridge log line, an audit id, a receipt hash, a downloaded file.
- Every confusion is written down verbatim as a finding, even when the operator knows the workaround.
- The honesty rule is itself under test: any `met` that was not measured, any blended number, any silent default is a **fail** of the tool that produced it.
- Roles are real accounts: `aster.owner@…` (owner), `aster.bim@…` (lead), `aster.arch@…` (contributor), `client.reviewer@…` (viewer). Sign-up happens in the Supabase dashboard (the web app has no sign-up UI — known gap, logged in act 1).

## The office
**Aster Studio** — 12 people, architecture + interiors, Revit 2024, one live project ("Aster Tower", 14 storeys).
Office code `AST`. No naming standard (a PDF inherited from a former employee), a Word BEP inherited from a client,
a template with mixed type names (duplicated, non-ASCII, unit-mixed), worksets half-named, no task teams, one
"BIM person" with no mandate. Their pain, in their words: "every project starts from zero and the client's BIM
manager finds the same problems every time."

## Act 1 — Assessment (the first link of the chain)
| # | Step | Surface | Tool | Evidence that passes |
|---|---|---|---|---|
| 1.1 | Create project `aster-office`; add the four accounts with roles | web | Owner / Settings (members) | members list shows 4 roles; viewer cannot open Settings |
| 1.2 | Ingest the inherited BEP (docx) and the naming PDF | web | Documents → Ingest | BEP sections mapped; unassigned paragraphs listed, not dropped |
| 1.3 | Open `demo/aster/AST_Template.rte`; Project Setup → Web project = `aster-office` | Revit | Project Setup | settings saved on the document |
| 1.4 | Build Office System on the template → **Send office snapshot to Sentinel** | Revit | Build Office System | status "received"; bridge log `POST …/office/snapshot 201`; type count matches the TaskDialog |
| 1.5 | Open `Aster_Tower.rvt`; Project Setup → Web project = `aster-office`; Scan Now; Sync with Central | Revit | Scan Now, Health Scorecard | panel populated; bridge log `POST …/office/scan 201` |
| 1.6 | Documents → Create READINESS "Aster Studio readiness — Sept" | web | Documents | 30 items in three pillars; Overall shows three lines |
| 1.7 | Read the measured items | web | Documents (READINESS) | snapshot present = met; template types = violation (< 90 %, first 10 offenders named); worksets = not checkable (a `.rte` cannot carry worksets — the reason says so; the tower's workset names are judged by the scan under model health); shared params = violation; model health = violation (block > 0); BEP = violation (score < 50 %); naming standard = violation (no pack); roles = met; task teams = violation |
| 1.8 | As `aster.bim` answer the 20 declared items honestly for Aster (mostly `no`/`partial`) | web | Documents (READINESS) | each answer carries name + date; Missing drops to 0 declared |
| 1.9 | As `aster.owner` set owner + due on every open item | web | Documents (READINESS) → Plan | Plan lists every non-met item with owner, due, closes-when |
| 1.10 | Download the report; publish the document as "Assessment 1" | web | Documents | `.md` has snapshot date, three numbers per pillar, no `%` anywhere; version 1 exists |

## Act 2 — Setup (executing the plan with Sentinel's own tools)
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 2.1 | Set ruleset `org` = `AST`; confirm TN-01/TN-02 conventions with "the office" (turn to `warn`) | Revit | Rule Set | ruleset 1.5.x with `org: AST`; scan shows AST-prefixed messages |
| 2.2 | Naming Manager on the template: rename non-conforming wall/floor/door/window types | Revit | Naming Manager | rename receipts in the audit (`naming_renamed`); re-snapshot → template types ≥ 90 % |
| 2.3 | Apply Standard from the saved pack: worksets + shared parameters | Revit | Apply Standard, Build Office System (Save pack) | worksets = met; shared params = met after re-snapshot |
| 2.4 | Heal Loaded Families / Sanitize .rfa on the template's worst families | Revit | Heal Loaded Families, Sanitize .rfa | before/after report from the tool |
| 2.5 | Declare task teams (ARC, INT, STR-consultant) with leads | web | Deliverables (task teams) | task teams = met |
| 2.6 | Create BEP from template; bind clauses (Suggest bindings, then confirm) | web | Documents | executability ≥ 50 %; strip test shows what remains narrative |
| 2.7 | Install the container naming ruleset (standards pack) | web | Settings | naming standard = met |
| 2.8 | Re-run the assessment; re-answer changed declared items; publish "Assessment 2" | web | Documents (READINESS) | two versions; every addressed measured item flipped; plan rows closed |

## Act 3 — First project
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 3.1 | Create `aster-tower`; ingest the client EIR; compile IDS | web | Documents (EIR → compile-ids) | 6 requirement sentences → IDS specs |
| 3.2 | BEP clauses bound to the compiled checks | web | Documents | compliance strip per clause |
| 3.3 | MIDP/TIDP: deliverables with purpose; import `programme.csv` (4D) and `programme-midp.json` (rebaseline rows) | web | Deliverables, 4D Sequence | derived status per deliverable; milestones on the timeline |
| 3.4 | Governed Publish the tower model → rejected on IDS | Revit | Governed Publish, IFC Pre-Flight, IFC Delivery Gate | BCF topics `IDS: …`; receipt hash; verdict badge on the version |
| 3.5 | BCF Issues → Fix in Revit → Check → Apply → Resolve | Revit | BCF Issues (Fix in Revit) | `✓ N/N pass … Resolved (audit id)`; re-publish accepted |
| 3.6 | Publish Views / Publish Sheets; auto-publish on save with `publish@1 {auto: true}` installed on the project | Revit | those two, then a save | web Sheets and Views tabs show them; Project Files shows the auto-published version with its verdict, the Doctor strip its line |
| 3.7 | Clash Manager + Clash Register; raise RFIs and issues from the web | both | Clash Manager, Clash Register; Clash, Issues, RFIs panels | register rows with responsible team |
| 3.8 | MEP Openings on the linked MEP model; Change Requests review | Revit | MEP Openings, Change Requests, Review Flag | request rows; opening elements with AST void parameters |
| 3.9 | Datum from Drawings → Ghost Builder → Annotate Views on the DWG set; Photo Massing on the site photos | Revit | 1 · Datum, 2 · Ghost Builder, 2b · Photo Massing, 3 · Annotate Views | levels/grids from DWG; ghost elements; annotations |
| 3.10 | Weekly delivery report; rebaseline after a 2-week slip | web | Deliverables (report, rebaseline) | report file; rebaseline diff |
| 3.11 | Tender, Cost 5D, Carbon 6D, COBie 7D, CDE panel, Model/Views/Sheets/Browser/Properties/Visibility | web | those panels | each opens on the live dataset and shows Aster data; findings logged per panel |

## Act 4 — Governed AI
| # | Step | Surface | Tool | Evidence |
|---|---|---|---|---|
| 4.1 | An agent proposes a changeset over MCP (rename 3 types) | MCP / web | Copilot, MCP server | changeset row with agent provenance "claimed" |
| 4.2 | Review AI Proposals in Revit: apply one, withdraw one | Revit | Review AI Proposals | audit thread with both outcomes |
| 4.3 | Verify a receipt from a signed-out browser | web | receipt route | `ledger_hash` verifies |
| 4.4 | Ingest Docs (docx pack) and ROI Dashboard | Revit | Ingest Docs, ROI Dashboard | ingestion report; ROI figures cite their sources |

## Act 5 — Handover and the matrix
| # | Step | Evidence |
|---|---|---|
| 5.1 | COBie/cost/carbon exports from the published versions | files downloaded; version ids on each |
| 5.2 | Final readiness re-run, "Assessment 3" published | three versions, before/after/final |
| 5.3 | Fill the matrix below from acts 1–4 | every row has evidence or `not run` |

## The per-tool matrix
Status ∈ `pass` (evidence linked) · `fail` (finding #) · `not run`. Fill from evidence only.

**Revit ribbon** (from `App.cs BuildRibbon`, one row each): Show Panel · Scan Now · Health Scorecard · Rule Set · Change Requests · Review Flag ·
Project Setup · Build Office System · Apply Standard · Ingest Docs · Naming Manager · Sanitize .rfa · Heal Loaded Families ·
IFC Pre-Flight · IFC Delivery Gate · Governed Publish · Publish Views ·
Publish Sheets · BCF Issues (incl. Fix in Revit) · Clash Manager · Clash Register · MEP Openings · 1 · Datum from Drawings ·
2 · Ghost Builder · 2b · Photo Massing · 3 · Annotate Views · Review AI Proposals · ROI Dashboard.

| Tool | Act/step | Status | Evidence / finding |
|---|---|---|---|
| Show Panel | 1.5 | | |
| Scan Now | 1.5 | | |
| Health Scorecard | 1.5 | | |
| Rule Set | 2.1 | | |
| Change Requests | 3.8 | | |
| Review Flag | 3.8 | | |
| Project Setup | 1.3 | | |
| Build Office System (+ Send office snapshot, Save pack, ISO 19650 ✓) | 1.4, 2.3 | | |
| Apply Standard | 2.3 | | |
| Ingest Docs | 4.4 | | |
| Naming Manager | 2.2 | | |
| Sanitize .rfa | 2.4 | | |
| Heal Loaded Families | 2.4 | | |
| IFC Pre-Flight | 3.4 | | |
| IFC Delivery Gate | 3.4 | | |
| Governed Publish | 3.4 | | |
| Auto-publish on save (`publish@n`, no button) | 3.6 | | |
| Publish Views | 3.6 | | |
| Publish Sheets | 3.6 | | |
| BCF Issues (Fix in Revit) | 3.5 | | |
| Clash Manager | 3.7 | | |
| Clash Register | 3.7 | | |
| MEP Openings | 3.8 | | |
| 1 · Datum from Drawings | 3.9 | | |
| 2 · Ghost Builder | 3.9 | | |
| 2b · Photo Massing | 3.9 | | |
| 3 · Annotate Views | 3.9 | | |
| Review AI Proposals | 4.2 | | |
| ROI Dashboard | 4.4 | | |

**Web panels** (from `main.ts`, one row each): Main · Dashboard · Project Files · Documents (BEP, EIR, READINESS) · Deliverables · Settings ·
Browser · Properties · Visibility · Views · Sheets · Model · Issues · RFIs · Clash · CDE · Cost 5D · Carbon 6D · 4D Sequence · COBie 7D · Tender · Owner · Copilot.

| Panel | Act/step | Status | Evidence / finding |
|---|---|---|---|
| Main | 1.1 | | |
| Dashboard | 1.1 | | |
| Project Files | 3.6 | | |
| Documents — BEP | 2.6, 3.2 | | |
| Documents — EIR | 3.1 | | |
| Documents — READINESS | 1.6–1.10, 2.8, 5.2 | | |
| Deliverables | 2.5, 3.3, 3.10 | | |
| Settings | 1.1, 2.7 | | |
| Browser | 3.11 | | |
| Properties | 3.11 | | |
| Visibility | 3.11 | | |
| Views | 3.11 | | |
| Sheets | 3.11 | | |
| Model | 3.11 | | |
| Issues | 3.7 | | |
| RFIs | 3.7 | | |
| Clash | 3.7 | | |
| CDE | 3.11 | | |
| Cost 5D | 3.11, 5.1 | | |
| Carbon 6D | 3.11, 5.1 | | |
| 4D Sequence | 3.3 | | |
| COBie 7D | 3.11, 5.1 | | |
| Tender | 3.11 | | |
| Owner | 1.1 | | |
| Copilot | 4.1 | | |

## Findings log
| # | Act/step | Role | What happened (verbatim) | Severity | Follow-up |
|---|---|---|---|---|---|
| | | | | | |
