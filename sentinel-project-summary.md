# Sentinel — BIM Coordinator Plugin for Revit
## Project Summary, Decisions & Deliverables

Yazan Hijazeen · July 2026 · Status: **Phase 0 prototype delivered**

---

## 1. The Idea

A Revit plugin that acts as a live BIM coordinator inside the model: it enforces the office's agreed standards (naming, worksets, parameters), flags violations in real time, routes modeller changes through a coordinator approval workflow, and is configured not by hand but by AI-parsing the project's own BIM documents (BEP, EIR, naming standards) from ACC. An AI chatbot assists modellers in context.

**Evolved scope (second input):** each project differs (different EIR/BEP/details), so the plugin sits on top of an **office knowledge layer** — a versioned master standards library on ACC that every project inherits from, and that every project feeds improvements back into through a governed contribution process. Standards become living, compounding data instead of static PDFs.

## 2. Market Analysis — Key Findings

- **Guardian for Revit (IconicBIM)** is the closest competitor (~$4k/yr base, US-centric, 200+ seat focus): cloud-synced standards, 80+ intercepted commands, workset auto-placement, delete protections, dashboards. Covers ~60% of the original feature list.
- Other players: Autodesk Model Checker (free, batch-only; API dropped in Revit 2026 interop tools), Ideate suite (reactive audits), nCircle Rule Checker (batch), BIM Track/BIMCollab/Revizto (post-hoc issue management), pyRevit/DiRoots (script-level, no workflow state).
- **Nobody offers:** (a) a request→review→approve workflow inside Revit, (b) AI-generated rulesets from BEP/EIR documents, (c) office-master inheritance with governed upstream contributions, (d) ISO 19650-native / Arabic-English positioning for the Gulf market, (e) SME pricing (5–25 seats).

**Positioning:** *"Guardian prevents mistakes. We govern change."*

## 3. Decisions Made

| # | Decision | Rationale |
|---|---|---|
| 1 | Descope live clash detection → lightweight link-proximity checks at sync time | Real-time geometric clashing is computationally brutal; Navisworks/BIM Collaborate own that space |
| 2 | Killer feature = change-request/approval loop ("Git pull requests for Revit") | Missing middle between Guardian's block/warn binary; solves real coordinator bottleneck |
| 3 | AI's first job = parse BIM documents into machine-enforceable rules (human-reviewed, never auto-published) | Collapses days of setup to an hour; setup friction is the #1 adoption killer |
| 4 | Four enforcement modes per rule: monitor / warn / **request** / block | Gradual adoption; default new deployments to monitor for 2 weeks |
| 5 | Git-like office model: Master Library (versioned, immutable releases) → project = master + EIR-driven overlay → contributions reviewed by BIM manager | Avoids rebuilding standards per project; institutional memory; ISO 19650 lessons-learned evidence |
| 6 | Prototype in pyRevit, production in C#/.NET with DMU (`IUpdater`) | pyRevit = validation speed; C# = performance, live interception, deployment |
| 7 | Pending-change visual flag via `ZZZ_ReviewStatus` project parameter + Browser Organization scheme | Revit API cannot recolor Project Browser text; this is the native equivalent |
| 8 | Rejected requests auto-revert via ExternalEvent; immutable audit log throughout | Audit trail doubles as ISO 19650 information-management evidence — a selling point |
| 9 | Token-based JSON rule schema (not raw regex), bilingual EN/AR messages | Readable/writable by both the AI parser and the coordinator UI; Gulf market fit |
| 10 | ISO 19650 container string enforced at sheet-number level only (per BDS docs); model file name check deferred to C# version (doc.Title at open) | Matches BDS's actual three-layer convention (CDE file / sheet number / family prefix) |
| 11 | MVP knowledge layer = versioned rulesets + inheritance + contribution queue ONLY (no detail/family library indexing yet) | Prevents scope creep into a full DMS |
| 12 | Pilot at BDS as first tenant | Dogfooding; becomes consultancy case study #2; baseline metrics for marketing |

## 4. Ruleset — Grounded in BDS V1.4 Documents

The prototype ruleset was rebuilt from the uploaded V1.4 documents (superseding an earlier reconstruction from memory):

| Rule | Source | Mode |
|---|---|---|
| Sheet numbers = 11-field assembled string `Project-Originator-Type(-SubType)-Discipline-Zone-Venue-Level-Number-Suitability-Revision` (e.g. `BDS20268-BDS-DR-FP-ARC-ZZ-XX-00-0001-S2-P03`) | BDS-BIM-001 §4.1 / BDS-RTG-001 §7.2 | warn |
| View names = `PREFIX_TYPE_LEVEL_DESC` (`WIP_FP_L00_FFL`, `SH_PE_EAST`, `SH_PS_XX_A-A`) + special cases (workset-named coordination views, `NAVISWORKS`, `EXPORT_`, `CO_`) | BDS-RTG-001 §5 | warn |
| `BDS_View Status` parameter must be filled on every non-template view | BDS-RTG-001 §4.2 | warn |
| Worksets = exact 15-name whitelist (incl. `Shared_Levels & Grids Model`, `XX_MEP Modell`); `Workset1` forbidden | BDS-RTG-001 §3.1 | warn |
| Families = `BDS_[LOCATION]_[TYPE]_[VARIANT]`, LOCATION (INT/EXT/STR) optional | BDS-RTG-001 §8.1 | warn |
| Level element naming (`L00_FFL`, `LB1_SSL`, `STREET LEVEL`) | not formalized in V1.4 — **proposed contribution for V1.5** | monitor |
| Grid naming (letters × numbers) | not formalized — **proposed contribution** | monitor |

All rules carry the document reference in their violation message; key rules have Arabic translations. 37 automated pattern tests pass against worked examples from the docs.

## 5. Architecture (agreed)

- **Add-in:** C#/.NET, DMU `IUpdater` per element domain, `DocumentSynchronizedWithCentral` for delta scans, WPF dockable panel, works offline (rules cached as JSON; requests queue)
- **Backend:** Node/TS + Postgres — `standards`, `standard_versions` (immutable), `project_bindings` (pin + overlay), `contributions` (reuses request/verdict state machine), append-only `audit_log`
- **Web console:** React/TS (BIM Nexus design system) for cross-project approvals and rule management
- **AI:** Anthropic API — BEP/EIR → proposed ruleset/overlay with coordinator review; chatbot in v2

## 6. Build Plan

| Phase | Weeks | Deliverable | Status |
|---|---|---|---|
| 0 | 1–2 | pyRevit prototype: scan model vs ruleset, validate schema at BDS | ✅ **Delivered** |
| 1 | 3–6 | C# add-in, DMU live flagging, dockable panel | Next |
| 2 | 7–10 | Request/approve workflow (local, Extensible Storage) | |
| 3 | 11–14 | Backend + web console, multi-user approvals, audit log (+~2 wks knowledge layer) | |
| 4 | 15–16 | AI rule ingestion (document upload → reviewed ruleset) | |
| 5 | 17–18 | BDS pilot, metrics, case study | |

## 7. Files Produced

| File | Contents |
|---|---|
| `revit-coordinator-plugin-spec.md` | Part 1: Guardian teardown & market analysis · Part 2: MVP technical spec (DMU design, enforcement modes, approval data model, rule schema, stack, risks) · Part 3: office knowledge layer (inheritance, contributions, SQL model) |
| `SentinelProto.extension.zip` | Working pyRevit extension — **Scan Model** (compliance report with clickable links + score, incl. parameter checks) and **Edit Rules** buttons, `ruleset.json` (BDS V1.4 rules, EN/AR), README with install steps and Phase 0 validation checklist |

**Source documents used (V1.4, uploaded):** BDS-BIM-001 BIM Manual · BDS-RTG-001 Revit Template Guide · BDS-BEP-001 / BDS-PBEP-001 · BDS-IMP-001 Issue Management Protocol.

## 8. Immediate Next Steps

1. Install the extension, scan the BDS template — expect ~100%; any violation is a template defect to fix pre-pilot
2. Scan a live project → record baseline violation counts (case-study metric)
3. Confirm level/grid naming proposals with Yara → first contributions to office master V1.5
4. Time the scan on the largest model (<15 s target) → green-light Phase 1 (C# DMU add-in)
