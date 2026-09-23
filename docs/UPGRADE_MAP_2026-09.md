# Sentinel — Upgrade Map 2026-09

**Purpose.** Sentinel already has a version of most things the September
inspirations show. This map takes each *existing* Sentinel capability (from
`docs/CAPABILITY_MAP.md`, source-verified July 2026), puts it next to what the
twelve LinkedIn sources, Pascal, and the platforms (Autodesk Forma / ACC,
Solibri, Speckle, BIMcollab, Revizto, That Open) do today, names the delta,
and states the concrete upgrade. `docs/FEATURES_UPDATE_2026-09.md` remains the
single backlog; upgrades here carry a **U-n** id and are cross-listed there.

**Sources for the platform side** (Sept 2026, via search summaries; vendor
sites are unreachable from the analysis environment): Autodesk AU 2026 and
the March 2026 Forma release (ACC rebranded "Forma for Construction";
Drawing Compliance; Drawing Change Analysis; Clash Checks Dashboard; Search
Sets; Autodesk Assistant Project Data agent out of beta; naming-standard
enforcement with a Holding Area; Reviews with 1–6 step serial/parallel
templates; Forma Building Design to Revit without rebuild), Solibri April and
June 2026 (IDS Editor for all customers, AI assistant beta that helps set up
rules and run checks, point-cloud clash/clearance/matching rules), Speckle
May 2026 (Model Validation beta on every version, IDS/COBie rulesets
planned), BIMcollab (Smart Views colour by property, IDS cardinality,
overnight checks), Revizto (clash matrix automation, auto-group by
zone/level, stamp templates, Clash Charts, new API and conversational AI over
project data).

**Rule for this map:** an upgrade sharpens a pillar Sentinel already has. It
never adds an authoring tool, a clash engine, or a generic chatbot (D-01,
D-07). Effort: **S** ≤ 2 days · **M** 3–6 days · **L** 1–3 weeks.

---

## Pillar ① — Desktop pre-flight (Revit add-in + web QA)

### Rule engine, live scan, naming gate, CDE sync guard

| Sentinel today | What others do | Delta |
|---|---|---|
| Token-regex naming and parameter rules, 7 active rules, live DMU delta scan, full scan, block/request/warn/monitor modes, sync guard on the central file name, Fix dialog with live validation. | **ACC** enforces file naming natively in Revit, AutoCAD and Desktop Connector, and non-conforming uploads go to a **Holding Area** to be fixed and resubmitted rather than bounced. **Forma Drawing Compliance** applies user-defined rules for design standards, owner requirements and cross-discipline coordination and grades findings **critical / major / minor**. **Solibri's assistant** helps *set up* rules in natural language. **BIMcollab Smart Views** colour the model by property so data quality is visible without a report. | Sentinel's rules are richer (parameters, worksets, views, families, EIR-as-code) and audited, but: rejection is binary at the gate, severity vocabulary is internal, rule authoring is JSON by hand, and colour-by-rule exists only in the web Visibility panel. |

Upgrades:

- **U-1 · Holding Area at the gate (S).** A rejected Governed Publish or
  Intake lands the file in a per-project `holding/` folder on the CDE with
  its verdict attached and a one-click resubmit after fix, instead of
  vanishing. Same for Sync Guard hits. Adoption move consistent with D-09;
  the ledger still records the refusal.
- **U-2 · Severity vocabulary on reports (S).** Map block/request/warn/
  monitor to critical/major/minor/info on every certificate, BCF topic and
  scorecard so BIM managers read Sentinel output the way they read Forma's.
- **U-3 · Rule authoring assistant, propose-then-validate (M).** In Rule
  Set and the packs panel: describe a rule in plain language, the local
  model drafts the ruleset JSON, the *engine* validates it against sample
  elements before it can be saved. Same posture as GhostBuilder: the LLM
  proposes, the deterministic engine disposes. Needs Ollama, as today.
- **U-4 · Colour-by-verdict everywhere (S).** Bring the web Visibility
  panel's IDS colouring to the Revit side as a temporary view override
  from the panel (green pass, red fail, grey out of scope), and to the
  Pascal plugin later. The KF-B visual, finished.

### IFC Pre-Flight and IFC Delivery Gate

| Sentinel today | What others do | Delta |
|---|---|---|
| Pre-export audit of `IfcExportAs` and mandatory psets; post-export streaming STEP parse against a JSON delivery contract; SHA-256 certificate; IFCZIP unsupported; georeference check is a lat/long tuple on `IFCSITE`. | **Solibri CheckPoint / Premium**: cloud model checking, IDS rules, point-cloud rules. **Speckle Model Validation** runs on *every* version pushed and shows results in the web UI. **BIMcollab** runs **overnight checks** automatically. | Sentinel's gate is desktop-triggered and one-shot; nothing checks a version that arrives from anywhere else, on a schedule, or an IFCZIP. |

Upgrades:

- **U-5 · Gate on every version, from anywhere (M).** This is Features
  Update **1.1 Governed Intake**: the same contract + IDS check server-side
  on any uploaded IFC, on every version. Add a nightly re-check job so a
  ruleset tightened at a stage gate re-grades the live versions (Speckle's
  and BIMcollab's pattern).
- **U-6 · IFCZIP support (S).** Known gap; unzip before the streaming
  parse. Trivial and it removes a listed caveat.
- **U-7 · Georeference done properly (S–M).** Features Update **4.1**.

### Clash Manager (Revit), clash panel (web), clash register

| Sentinel today | What others do | Delta |
|---|---|---|
| Revit: link-vs-host solid-boolean clash with Hard/Medium/Soft severity, 3D clash views, BCF export. Web: pure AABB broad-phase with stable GlobalId signatures so resolved clashes never resurface; team register with status lifecycle and provenance; raise as BCF. | **ACC**: **Search Sets** (saved property queries) clashed against each other; **Clash Checks Dashboard** to triage outside the viewer; clash issues auto-highlight the pair and fade surrounding geometry. **Revizto**: run tests from a **clash matrix**, **auto-group by zone and level**, **stamp templates** to assign the responsible party, **Clash Charts** without converting to issues. **That Open**: queries + matrices + cloud detection as a service, status workflow, built-in panel. **Karim (S11)**: 12,000 clashes, 90% data false positives. | Sentinel has the *register* (which the others lack) but not the *setup* (queries, matrix), the *triage* (dashboard, grouping, auto-assign), or the *pre-check* that would have killed Karim's false positives. Its own engine is a broad-phase only. |

Upgrades:

- **U-8 · Queries and matrix from IDS applicability (M).** Named element
  sets defined with the same applicability syntax IDS already uses
  (entity + property filters), saved per project, and a pair matrix that
  drives clash jobs. Reuse `ids.ts` applicability evaluation as the query
  engine. This is Search Sets and Revizto's matrix in one, and it makes the
  setup part of the governed config.
- **U-9 · Clash triage dashboard (M).** Counts by pair, level, discipline
  and status; ageing; trend per revision from `revision-diff`; open from a
  row into the viewer with the pair isolated and surroundings ghosted (the
  ACC highlight behaviour). Group by level and zone automatically from
  storey containment and `IfcSpace`.
- **U-10 · Auto-assign by responsibility matrix (S).** A `Discipline` →
  assignee map in the project config (the same param the BDS IDS already
  requires) stamps every raised clash and IDS issue with its owner.
- **U-11 · Federation Gate before any run (M).** Features Update **3.0**.
- **U-12 · Any engine's results into the register (S+S+M).** Features
  Update **3.2**, including the platform clash service (**3.1**). Sentinel's
  own engine stays a broad-phase for the sandbox and the Federation Gate
  overlap check; narrow-phase is the platform's job.

### GhostBuilder, Datum from Drawings, Photo Massing, Annotate

| Sentinel today | What others do | Delta |
|---|---|---|
| Deterministic layer-standard mapping first, local LLM only for gaps, spec-derived parameters, human review gate, nothing written until ticked; datum from drawings; photo massing with editable estimates; guideline views. Verified live. | **Atenea**: 33,502 elements in 32 minutes. **Astra/Ideatura**: Leadenhall in IFC in 10 minutes, agents in parallel. **Pascal**: 35 MCP tools, briefs to buildings. **Cartesian**: sketch or photo to solids. **Sarim**: rule-based offline footings/columns/beams. **Forma Building Design**: schematic massing with daylight, sun hours and carbon, synced to Revit without rebuild. | Sentinel's generation is slower and narrower by design, and it should stay governed. The gaps are the *structural* categories (Sarim) and an early carbon read at massing stage (Forma). Everything else in this row is a *proposer* for Governed Intake, not a competitor to GhostBuilder. |

Upgrades:

- **U-13 · Structural Ghost (M).** Features Update **4.6**.
- **U-14 · Carbon at massing (S).** Photo Massing's corrected numbers
  already produce volumes; run `carbon.ts` factors on them for an indicative
  embodied-carbon figure on the review window, flagged estimated. Forma's
  schematic carbon, derivation-only (D-02).
- **U-15 · Accept the generators (M).** Features Update **1.1**, **1.3**,
  **1.5**. Sentinel does not race Atenea; it grades its output.

### Standards: Document Extractor, Golden-Model Extractor, ISO gap analyzer, Change Requests

| Sentinel today | What others do | Delta |
|---|---|---|
| Local LLM mines worksets and shared parameters from PDF standards into a reviewable pack; golden model reverse-extraction; pack applied transactionally; ISO 19650 gap grade; coordinator approve/reject with auto-revert. | **Forma Drawing Compliance** takes "owner requirements you bring to the project" as rules. **ACC** enforces naming natively across Revit *and AutoCAD*. **Darpan (S12)**: the BEP is the top rung's artefact. **Karim (S11)**: one naming standard across drawing, model and schedule. | The extractor mines *office* standards; it does not yet turn a client's **EIR** into an **IDS**. Naming is enforced on model containers, not on drawing or PDF containers or schedule tasks. Sentinel enforces a BEP it cannot print. |

Upgrades:

- **U-16 · EIR → IDS ingestion (M).** Extend Document Extractor: feed an
  EIR or client BIM requirements document, get a reviewable IDS draft
  (applicability + requirements + cardinality) that the engine validates
  against the current model before it is adopted. Owner requirements as
  code, on Sentinel's terms.
- **U-17 · Non-model containers through the naming gate (S).** DWG, PDF and
  sheet packages uploaded to the CDE pass the same ISO 19650 container-name
  rules and land in the same Holding Area; the layer standard already
  covers DWG content.
- **U-18 · BEP from config (S–M).** Features Update **4.5**.
- **U-19 · Schedule naming (S).** Features Update **4.7**.

### Family sanitizer, self-healer, Revit Doctor, MEP voids

No source this month touches these. Keep; they are pilot workhorses. One
hygiene item: Doctor dismisses duplicate-mark warnings without renumbering
(listed gap), fix with the Session C drill.

---

## Pillar ② — Open-BIM cloud hub

### CDE, ISO 19650 state machine, transmittals, versions

| Sentinel today | What others do | Delta |
|---|---|---|
| Containers with wip→shared→published→archived, suitability codes, `cde_transition` RPC, published immutability, transmittals, version history with set-live and compare, past-version geometry in the viewer, hash-chained ledger. | **ACC Reviews**: 1–6 step approval templates, serial and parallel ("group") steps, per-folder; **Holding Area**; automated distribution. **Forma Drawing Change Analysis**: meaningful differences between drawing revisions. **Speckle**: version diff in the viewer. | Sentinel's transition is one step with a verdict badge; there is no configurable human review chain, and drawing revisions (sheets as PNG) have no diff. The verdict is not yet a formal *step* of a review. |

Upgrades:

- **U-20 · Review workflows with the referee as reviewer zero (M).**
  Per-folder templates of 1–n steps, serial or parallel, each step a role
  from the existing membership hierarchy; step 0 is always the automated
  verdict (a rejected file never reaches a human). Every step decision is a
  ledger row; the container transition fires on completion. Reuses
  `cde_transition`, roles, BCF for rejections.
- **U-21 · Drawing revision diff (M).** Sheet PNGs already exist; add an
  image diff overlay between two versions plus the element-level revision
  diff summary for the same container, so "what changed on this sheet" and
  "does it still pass" are answered together. Forma's Drawing Change
  Analysis, grounded in the element graph.
- **U-22 · Verdict diff between versions (S).** Per-requirement pass/fail
  delta between two versions of a container, shown on the Versions panel.
  Cheap and it is what a reviewer actually asks.

### Live BCF issues, RFIs

| Sentinel today | What others do | Delta |
|---|---|---|
| BCF 3.0 topics and viewpoints, live SSE sync web↔Revit, auto-raised from gate failures, isolate + camera; RFIs with element links, raise→answer→approve. | **ACC**: opening a clash issue auto-highlights the pair and reduces surrounding geometry. **Revizto**: predefined workflows and stamps. **Autodesk Assistant**: AI-generated RFIs with location and custom fields prefilled from a prompt. | Sentinel's issues are raised automatically but arrive bare: no template, no assignee, no prefilled location narrative. Isolation exists; ghosting the rest does not. |

Upgrades:

- **U-23 · Issue stamps and workflows (S).** Templates per failure class
  (naming, IDS requirement, clash, federation) with type, priority, assignee
  from U-10, due-date offset, and a fixed status path. Applied when the gate
  raises a topic.
- **U-24 · Focus mode on open (S).** Isolate the element(s) and ghost
  everything else, with the camera from the viewpoint, in both the web
  viewer and Revit's BCF Issues window.
- **U-25 · Grounded RFI draft from a verdict (S).** One click on a failed
  requirement drafts an RFI with the element, storey, requirement text and
  the ledger reference prefilled from the verdict, not from a prompt. The
  copilot can polish the wording; the facts come from the record.

### Copilot, MCP server, bridge AI tools

| Sentinel today | What others do | Delta |
|---|---|---|
| Grounded copilot with citations over live project data; MCP server with 3 tools (list, propose, audit); 12 bridge AI tools including propose, raise_issue, transition. | **Autodesk Assistant** Project Data agent: "top risks right now", "create a project health dashboard", cross-record search "even if carpentry is not labelled". **Autodesk Context**: impact of an RFI across model, schedule, dependencies. **Revizto**: open API plus conversational AI over project data. **Solibri assistant**: set up rules, run checks, navigate results in-session. **Pascal**: 35 tools, published to the MCP registry. | Sentinel's agent surface is narrow (3 MCP tools) and read-mostly; the copilot answers but does not act; there is no impact traversal and no KPI view on demand. |

Upgrades:

- **U-26 · Full MCP surface + registry (S–M).** Expose all bridge AI tools
  through the MCP server with the same write-policy gates, publish a
  `server.json` to the MCP registry, ship the "governed tool" skill
  (Features Update **3.3**).
- **U-27 · Impact analysis (M–L).** Features Update **2.0 + 2.1 + 2.2**.
- **U-28 · Copilot actions (M).** Let the copilot *do* the three things
  Solibri's assistant does: draft a rule (through U-3), run a check on the
  current model, open the failing elements. Every action is an existing
  tool call and lands on the ledger.
- **U-29 · Governance dashboard on demand (M).** "Project health" as a
  generated card set: verdict pass rate per revision, gate failures by rule,
  open issues by age and assignee, clash trend, transitions per week. Built
  from ledger queries, so the numbers are audit-grade. Doubles as U-9's
  home.

---

## Pillar ③ — Analytics (4D, 5D, 6D, 7D, scorecard, ROI)

| Sentinel today | What others do | Delta |
|---|---|---|
| 4D sequence with P6/MSP CSV import (core untested); 5D BoQ with rate packs and revision Δ (tested); 6D carbon (tested); 7D COBie readiness (untested); scorecard; ROI with static rates. | **Darpan (S12)**: 4D and 5D are rungs on the ladder people climb. **Karim (S11)**: model structure must match how estimators price. **Forma Building Design**: carbon at schematic. **Solibri**: point-cloud as-built vs design. **Shankar (S4)**: topography from point cloud. | Sentinel's derivation-only posture (D-02) holds. The gaps are test coverage on 4D/7D, a classification spine so BoQ lines follow how estimators price, and nothing on as-built verification. |

Upgrades:

- **U-30 · Classification as an IDS requirement (M).** Require a
  classification reference (Uniclass / NRM / Uniformat, configurable) on
  cost-bearing elements through the IDS, and let 5D group BoQ lines by it.
  Karim's "model structure that matches how estimators price", enforced at
  the gate rather than fixed in a spreadsheet.
- **U-31 · Tests for the untested cores (S).** `schedule`, `cobie`,
  `ifc-writer`, `scanner`, `scorecard`. Listed in the capability map since
  July; do it before demoing 4D/7D.
- **U-32 · Scorecard reconciliation (S).** Session C found three different
  "compliant %" figures on one model. Label the metrics distinctly or unify.
- **U-33 · As-built verification (🔭).** Point-cloud vs model deviation is
  Solibri Premium territory and Darpan's Scan-to-BIM rung. Out of scope now;
  revisit when a pilot brings scans.

---

## Cross-cutting — the moat (IDS adjudicate, element graph, ledger)

| Sentinel today | What others do | Delta |
|---|---|---|
| Pure IDS validator + adjudicate with immutable verdicts; JSON IDS server-side, XML parsed in the browser; element graph (IFC5-aligned); hash-chained ledger truncate-proof at the DB core. | **Solibri IDS Editor** for all customers, fixes for enumerations and USERDEFINED predefined types. **BIMcollab** IDS with cardinality on applicability and requirements. **Speckle** plans IDS and COBie rulesets. None has an immutable verdict. | The engine is right; the *authoring* and the *conformance proof* are thin. Nobody outside can see that Sentinel's IDS implementation is complete. |

Upgrades:

- **U-34 · IDS conformance against buildingSMART's test cases (M).** Run
  the official IDS 1.0 test-case suite through `ids.ts` and publish the
  pass matrix. Server-side XML parse (no DOM) so `.ids` files are accepted
  by the propose API too. Credibility that Solibri and BIMcollab claim and
  Speckle does not yet have.
- **U-35 · IDS authoring panel (M).** Specifications, applicability,
  requirements, cardinality, enumerations, bsDD lookup; live validation
  against the loaded model as you edit (the sandbox already does the last
  part). Replaces hand-edited JSON for pilots.

---

## What not to copy

- Forma Building Design's daylight, sun and site analyses: authoring-side
  analysis, not governance.
- Autodesk Assistant's open-ended chat over "everything": Sentinel's copilot
  stays grounded in the governed dataset and cites hashes.
- Revizto's VR and Navisworks' narrow-phase clash: engines, not the record.
- Solibri's point-cloud rules and Cartesian's solids: other people's lanes
  until a pilot needs them.

## Priority within this map

The capability map's advice from July still holds: *stop building new
pillars, polish the ones you have*. Ranked by leverage per day:

1. **U-5 / 1.1 Governed Intake** and **U-11 / 3.0 Federation Gate**: turn
   the gate into a service and a pre-check for every clash run.
2. **U-8 + U-9 + U-10**: queries, triage dashboard, auto-assign. This is the
   clash UX gap the two clash posts and Revizto expose, on top of the
   register nobody else has.
3. **U-20 + U-1**: review workflows with the referee as step zero, and the
   Holding Area. This is the ISO 19650 adoption story for BIM managers.
4. **U-27 / 2.x Impact analysis** and **U-29 dashboard**: the Autodesk
   Context answer, audit-grade.
5. **U-34 + U-35**: prove and expose the IDS engine.
6. **U-3, U-16, U-28**: the propose-then-validate assistants (rule, EIR,
   copilot actions), all on the local model.
7. **U-2, U-4, U-6, U-22, U-23, U-24, U-25, U-31, U-32**: the S-sized
   polish that makes the existing surface read like a finished product.
