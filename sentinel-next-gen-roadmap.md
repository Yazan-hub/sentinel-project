# Sentinel — Next-Generation Roadmap
### Codebase analysis · AECO market research · That Open Company bridge · Killer-feature pitch
Yazan Hijazeen · July 2026 · Prepared by: Sentinel product/architecture review

---

## Phase 1 — What we have built (capability audit)

The Sentinel add-in today is a **governance layer plus a coordination toolkit**, spanning ~30 C# files with a consistent architecture:

| Layer | Assets | Portability rating (see Phase 3) |
|---|---|---|
| **Rule engine** | Token-based JSON ruleset (bilingual EN/AR), regex compilation, per-target scanners, mode ladder monitor→warn→request→block | ★★★ pure logic, trivially portable |
| **Workflow state** | Extensible Storage change requests + audit log, approve/reject/auto-revert, `ZZZ_ReviewStatus` flagging | ★★☆ state machine portable; storage is Revit-bound |
| **Automation** | Auto-fix name synthesis, Revit Doctor (failure interception), family sanitizer/auto-healer | ★★☆ synthesis portable; healing is Revit API |
| **Coordination** | Clash manager (solid booleans, severity grading), MEP void lifecycle (GUID-tracked, orphan detection, 150 mm merge), 3D view generator | ★★☆ math portable; geometry extraction is host-specific |
| **Interop** | BCF 2.1 exporter (native, zero dependencies), IFC pre-flight (BuiltInParameter-based, locale-safe) | ★★★ BCF/XML generation is 100 % portable |
| **Business layer** | ROI tracker (JSON log → dashboard), health scorecard (severity-weighted), CDE sync guard, dual-layer settings | ★★★ pure data |
| **Backend design** | PostgreSQL knowledge-layer schema: immutable `standard_versions`, `project_bindings` (pin+overlay), `contributions` state machine, append-only `audit_log` | ★★★ already host-agnostic |

**Architectural strengths to protect:** single ExternalEvent funnel (maps cleanly to an async job queue on web), everything speaks `Violation`/`ScanReport` (one wire format), locale invariance via BuiltInCategory/BuiltInParameter (same discipline maps to IFC entity/pset names on web), version isolation in one Compat file.

**Structural debts:** rule engine and Revit API are still coupled inside `RuleEngineHost` (scanners call `FilteredElementCollector` directly); ES JSON blobs have no schema version field yet; ROI/scorecard constants are hardcoded.

---

## Phase 2 — Market research: where the industry is bleeding (July 2026)

### The five recurring bleeding points

**1. The coordinator is the bottleneck, not the software.** Field research keeps repeating the same finding: the more a project depends on a single VDC/BIM resource to answer every model question, the slower coordination moves ([OpenSpace](https://www.openspace.ai/blog/what-is-bim-coordination-in-construction/)). Academic bottleneck studies list outdated models, disconnected trades, information discrepancy and office-site disconnect as the persistent process failures ([UBC BIM TOPiCS](https://bimtopics.civil.ubc.ca/research/bim-coordination-and-lean-design-management/), [ResearchGate](https://www.researchgate.net/publication/332821917_BIM-based_building_design_coordination_processes_bottlenecks_and_considerations)). **Sentinel's request/approve loop attacks exactly this — the market validates the thesis.**

**2. IFC round-tripping silently destroys data.** Live forum traffic in 2025–26: Revit 2026 IFC export failures ([Autodesk Community](https://forums.autodesk.com/t5/revit-architecture-forum/revit-2026-won-t-export-to-ifc/td-p/13807489)), walls/windows losing materials and type properties on reimport ([Autodesk support](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Some-ifc-walls-are-looses-their-attributes-after-export-from-import-to-Revit.html)), `ModelReference` not exporting since 2025 ([RevitForum](https://www.revitforum.org/forum/revit-architecture-forum-rac/architecture-and-general-revit-questions/460590-issue-with-exporting-modelreference-to-ifc-in-rvt2025)), and a standing wall of open issues on [Autodesk/revit-ifc](https://github.com/Autodesk/revit-ifc/issues). The universal workaround is manual: export, open in a checker, discover losses, tweak mapping tables, repeat ([BIMcorner](https://bimcorner.com/ifc-exports-from-revit-done-right/)). Errors "may not be visible until late-stage coordination" ([EraCore](https://eracore.com/ifc-file-issues/)). **Nobody validates the IFC against intent BEFORE it leaves the machine.**

**3. Clash results are noise.** Coordinators face thousands of results that are mostly irrelevant; the data is "noisy, imbalanced (more false than real conflicts), and lacks standardization" ([ScienceDirect, 2025](https://www.sciencedirect.com/science/article/pii/S0926580525006843)). ML-based grouping/prioritisation is the frontier ([Enginero](https://www.enginero.com/blogs/ai-powered-bim-clash-detection/)), and startups like Qonic are going further — generating MEP solutions rather than detecting clashes after the fact ([archBIM.cloud](https://archbim.cloud/en/blog/agentic-bim-startups-challenging-revit-2026)).

**4. Handover data dies at practical completion.** "The rich data contained in BIM models was archived, filed away, or simply lost during the handover process" ([HFM Magazine](https://www.hfmmagazine.com/bridging-gap-what-facilities-managers-need-digital-handover)); digital-twin studies name weak data continuity at handover as the #1 barrier ([MDPI](https://www.mdpi.com/2075-5309/16/5/1084)). COBie is the nominal answer but populating it is manual agony ([Pinnacle](https://pinnacleinfotech.com/understanding-cobie-data/), [Enginerio](https://enginerio.com/blog/cobie-bim-for-facility-management-challenges/)).

**5. Incumbents solved detection, then created new friction.** Solibri: IFC-only pipeline forces an export step and multi-tool workflows, from $185/user/month ([SelectHub](https://www.selecthub.com/p/building-information-modeling-software/solibri/)). BIMcollab: strong issue hub but the model data lives in *their* cloud — a data silo with per-seat pricing ([SelectHub comparison](https://www.selecthub.com/building-information-modeling-software/solibri-vs-bimcollab/)). Ideate: powerful but reactive — audits after the damage ([Graitec](https://graitec.com/ca-en/blog/free-vs-paid-revit-plugins-which-make-sense/)). The pattern across all incumbents: **post-hoc checking, external silos, seat-based rent.** Sentinel's counter-position: prevention inside the authoring tool, data in the client's own model/CDE, governed change instead of issue ping-pong.

---

## Phase 3 — The That Open Company bridge

TOC's stack — [@thatopen/components](https://docs.thatopen.com/components/getting-started) (Three.js BIM toolkit, browser + Node) and the [Fragments](https://github.com/ThatOpen/engine_fragment) format (FlatBuffers-based, built for massive models on any device) — is precisely the runtime Sentinel's web future needs. Architecture rules for the pre-September 2026 sprint:

**Rule 1 — Split the engine from the host adapter now.** Refactor target:

```
Sentinel.Core        (netstandard-style pure C#: rule models, token compiler,
                      name synthesis, severity grading, merge clustering,
                      scorecard, ROI math, BCF XML generation, request state machine)
Sentinel.Revit       (adapters: FilteredElementCollector -> ElementFacts,
                      ES storage, DMU, ExternalEvent hub, WPF)
```
Everything in `Sentinel.Core` translates line-for-line to TypeScript (regex, XML, clustering, state machines are language-neutral). Port cost is measured in days, not months. The TS twin becomes `@sentinel/core` consumed by OBC apps.

**Rule 2 — Define the wire format as the product.** `ElementFacts` = `{ guid, category (IFC entity), typeName, name, params: {…}, bbox, location }`. In Revit it's fed by collectors; on web it's fed by Fragments/IFC properties via OBC. The ruleset JSON, `Violation`, `ScanReport`, `ChangeRequest`, and ROI entries are already JSON — they ARE the API contract between the plugin and the future cloud. Freeze them with schema versions.

**Rule 3 — The Revit plugin becomes the "authoring-side agent" of the web platform.** Long-term topology: web app (OBC viewer + rule editor + dashboards, reading IFC/Fragments) ↔ Postgres knowledge layer (already designed in Module 2) ↔ Sentinel Revit agent (live enforcement + data capture at source). BCF is the neutral escape hatch to every other tool.

**Rule 4 — Geometry stays host-side.** Solid booleans don't port; bounding-box + distance clustering does (Three.js `Box3`). Design web features around BB/centroid math plus host-computed volumes shipped in the data.

---

## Phase 4 — The killer-feature pitch (3–5 disruptive bets)

### KF-1 · IFC Delivery Contract — "CI/CD for IFC" ⭐ highest conviction
**Pain:** #2 above — silent IFC data loss, discovered weeks later by the recipient.
**Feature:** Extend the EIR/BEP-driven ruleset into a machine-readable *delivery contract*: required entities, psets, properties, classification, georeferencing per milestone. Sentinel exports the IFC, immediately re-opens it (IFC parse, not Revit import), diffs the result against the contract AND against the source model facts, and issues a signed pass/fail certificate (hash + scorecard) stored in the audit trail. Fail = the file never reaches the CDE.
**Why incumbents can't:** Solibri checks the IFC but has no knowledge of the source model or the contract lineage; the exporter (Autodesk) has no incentive to certify its own losses.
**TOC path:** the contract checker is pure data → the identical TS engine validates any uploaded IFC in the browser via OBC. This is a standalone product on its own ("IFC gate for any CDE").

### KF-2 · Coordination Memory — clash intelligence that learns the office
**Pain:** #3 — thousands of noisy clashes re-triaged from scratch every project.
**Feature:** Every clash verdict in Sentinel's Clash Manager (dismissed-as-irrelevant, grouped, resolved-by-void, escalated) is recorded as a labelled training row in the knowledge layer — categories pair, distance band, host type, discipline, verdict. From ~2 projects of history, Sentinel pre-classifies new clash sets: "83 % of duct-vs-nonstructural-partition under 25 mm were dismissed office-wide — auto-filter?" This is the contribution loop (Module 2) applied to geometry decisions, not just naming rules.
**Why incumbents can't:** BIMcollab sees issues, not verdict rationale tied to element semantics; ML startups lack the office-specific labelled data Sentinel collects for free.
**TOC path:** verdict data is host-neutral; the classifier and review UI run on web against Fragments geometry.

### KF-3 · Living Handover — COBie/twin data assembled continuously, not at PC
**Pain:** #4 — handover data assembled in a death-march at practical completion, then dies.
**Feature:** A "handover readiness" rule domain: from day one, Sentinel tracks maintainable-asset parameters (per COBie/EIR contract) exactly like naming rules — the panel shows "Handover: 34 % of assets complete" for the whole project life. At any moment, one click emits COBie-shaped data + the audit trail proving when/who filled each value. The ROI dashboard gains its most saleable number: "handover prep: 0 extra weeks."
**Why incumbents can't:** COBie tools run at the end; Sentinel lives in the model daily and already owns the enforcement + audit machinery.
**TOC path:** the FM-facing viewer of this data is the natural first standalone OBC app — owners don't have Revit.

### KF-4 · Cross-Model Referee — multi-file rule enforcement at CDE level
**Pain:** #1 — coordination decisions bottleneck through one human; discrepancies BETWEEN models (levels/grids mismatch, duplicated scope, stale links) are found in meetings.
**Feature:** Sentinel agents in each discipline model publish their `ElementFacts` snapshot to the knowledge layer on every sync. A referee service (headless `Sentinel.Core`) runs cross-model rules: shared datum equality, naming/code consistency across files, link freshness SLAs, scope-overlap detection (two models both modelling floor finishes). Violations route back into each author's panel — the coordinator stops being the human diff tool.
**Why incumbents can't:** requires an agent inside every authoring session AND a shared rule brain — Sentinel uniquely has both halves designed already.
**TOC path:** the referee IS a Node service using the TS core; its dashboard is the flagship web app.

### KF-5 (opportunistic) · Void Marketplace — the openings workflow as a protocol
Extend the GUID-tracked void lifecycle into a two-party protocol: MEP side requests (BCF out), structural side approves/cuts (Sentinel in), statuses reconcile automatically across IFC iterations. It's the request/approve state machine applied across companies — a wedge into every consultant relationship BDS has. Ship after KF-1 proves the IFC layer.

### Sequencing (to September 2026 TOC sprint)
1. **Now–Aug:** Core/Adapter refactor (Rule 1) + schema-version the JSON contracts — this de-risks everything else.
2. **Aug:** KF-1 MVP in Revit (contract JSON + post-export IFC diff) — dogfood on BDS20268 deliverables.
3. **TOC sprint (Sep):** port `Sentinel.Core` → TS; build the OBC IFC-gate viewer (KF-1 web) + scorecard dashboard as the first standalone apps.
4. **Q4:** KF-2 data collection switched on (it's just logging verdicts — cheap now, priceless later); KF-3 rule domain drafted from the BDS LOD matrix.
5. **2027:** KF-4 referee once ≥2 discipline agents run in production.

**One-line strategy:** incumbents check models after the fact in their silos; Sentinel governs data at the point of authorship and carries the proof — from template to handover — on the client's own infrastructure.
