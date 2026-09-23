# Sentinel — Features Update 2026-09 (inspiration-driven)

The plan that consolidates every inspiration reviewed in September 2026 into
one prioritised backlog. It sits beside `ROADMAP.md` (the standing roadmap)
and feeds it; it does not replace it. Nothing here starts on the add-in until
the running test session closes; bridge- and core-only items can start on a
parallel branch immediately.

Sources, all read in full (screenshots where LinkedIn was unreachable):

| # | Source | One line |
|---|---|---|
| S1 | That Open Company, "a clash detection app, built with nothing but prompts" | Claude Code built a clash app on That Open Platform in minutes using the platform's `ClashesManager` service: named element queries, a pair matrix, cloud detection in a web worker, new→active→acknowledged→resolved workflow, 3D markers, a built-in clashes panel. "The tool adapts to you." |
| S2 | Andrea Rocco Matta (Ideatura), Leadenhall rebuilt in IFC in under 10 minutes | Agents (Astra + Ideatura) author **directly in IFC**, several chats in parallel building components merged into one model. "**The model still needs checking**, but the speed of iteration is remarkable." Questions Revit at the centre. |
| S3 | Irving Resendiz (Atenea), Torre Reforma in 32 minutes for 5 dollars | 33,502 elements. The "audit" is a count table. Quality control is 200 prompt rules learned from mistakes. |
| S4 | Shankar Kharat, BIM automation portfolio | Hand-rolled checkers: coordinate, room calculation point, component validation, model health; EPSG and lat/long tools; Dynamo automations; Excel exporter. |
| S5 | That Open Company, "hundreds of MB became 1.5 MB" | Francesco Cappilli's Navisworks add-in exports a heavy federated model to five web formats including Fragments in one click, nothing lost (Cortina Olympic Stadium). |
| S6 | Islam Khalil (Autodesk), Autodesk Context (Arabic) | The shift from "what does RFI 169 say" to "**what is the impact of RFI 169**": AI over the *relationships* between models, RFIs, issues, schedules, activities and decisions. "Context is what turns project data into actionable intelligence." |
| S7 | Pascal Editor (`docs/reviews/pascal-editor-fit-2026-09-18.md`) | Open-source browser building editor with 35 MCP scene tools; agents draft whole buildings; no IFC export, no governance. |
| S8 | Ibrahim Abdelhady on **Cartesian by Formas** (Arabic) | AI + 3D modelling in one workspace: start from a sketch, image, old file or a description; vision model for space, a reasoning model for logic and constraints; outputs precise **solids and surfaces**, not mesh; works beside Rhino, SketchUp, Blender; real-time sections and perspectives; waitlist. Framed as the answer to costly restoration modelling of ornate classic buildings. |
| S9 | Sarim Shoaib, CAD → BIM with pyRevit | Rule-based, **offline, no LLM** placement of footings, columns and beams from structural CAD; days to hours. "The future of BIM automation doesn't always have to depend on AI/LLMs." 178 reactions, 19 comments. |
| S10 | Ahmed Fawzy, ACC Model Coordination update | ACC clash detection now runs **search sets against each other** (queries, not just saved views). His open ask: a proper way to **export clash reports** from the tool. |
| S11 | Karim L Maghraby, "nobody is talking about the data" | $120M job: 12,000 clashes, **90% false positives** because one wall was `Wall 1` in one model and `W-A1-Fin` in another; two technicians lost two weeks. "That's a data discipline issue." Teams with real AI ROI did the unsexy work first: one naming standard across drawing, model and schedule; a single source of truth for element types; metadata captured once; model structure that matches how estimators price. |
| S12 | Darpan Nagrecha, the BIM career roadmap | AutoCAD → Revit → Navisworks → ACC → 4D → 5D → **BIM Management** (BEP, standards, LOD, CDE workflows, ISO 19650, model review and information management). 169 reactions, 21 reposts. |

## What the seven say together

1. **Production is now cheap and agentic.** S2, S3, S7: models arrive from
   agents in minutes, in parallel, in IFC or RVT or JSON. Every one of those
   authors says or implies the same sentence: *the model still needs
   checking.* That sentence is Sentinel's product.
2. **The platform Sentinel stands on is becoming agent-buildable.** S1, S5:
   That Open now ships services (clash, conversion) that an agent composes
   into apps in minutes, and intake paths from the tools coordinators already
   hold (Navisworks). Sentinel should *consume* those services and *be* one.
3. **The next AI battleground is context, not chat.** S6: Autodesk is
   wiring impact analysis over project relationships. Sentinel already holds
   the one relationship graph Autodesk cannot offer: an *immutable, verified*
   one (element ↔ version ↔ verdict ↔ issue ↔ transition). Impact analysis
   over that graph is the strategic review's W5 made concrete.
4. **Validation is still hand-rolled in the field.** S4, S9: the checks and
   the rule-based generators exist as personal scripts; Sentinel lacks two of
   the checks and the structural half of the generator.
5. **Data discipline is the ROI, and the market is saying so out loud.** S11
   is Sentinel's thesis in a BIM manager's words, with a number attached:
   90% of 12,000 clashes were *data* clashes. Decision D-01 (compete on data
   clash) now has its case study, and a concrete missing feature: a
   cross-model consistency gate that runs *before* geometric clash.
6. **Clash is moving to cloud queries, and nobody owns the report.** S1,
   S10: both That Open and Autodesk now clash "set against set". S10's ask,
   an exportable clash report, is what Sentinel's governed register already
   is, if it accepts results from any engine.
7. **The rung people aspire to is the one Sentinel automates.** S12's ladder
   ends at BIM Management: BEP, standards, LOD, CDE, ISO 19650, model
   review. Sentinel is that rung as software. The BEP itself is the one
   artefact on that list Sentinel does not yet produce.

Every item below is a referee move (decision D-07). None builds an authoring
agent, an editor, or a clash engine.

## The backlog

Effort: **S** ≤ 2 days · **M** 3–6 days · **L** 1–3 weeks. Status of the
prerequisite code is stated from the source tree, not assumed.

### Wave 1 · The referee for the generators

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **1.1** | **Governed Intake** (Governed Publish without Revit) | S2, S3, S7, S5 | A bridge route that takes an **IFC file from any source** and runs the full G1–G4 loop headlessly: naming gate, server-side element extraction, IDS adjudication, ledger verdict, publish-on-pass, BCF on fail. Today the loop needs the Revit add-in to extract elements (`GovernedElementExtractor`); the bridge only converts IFC to fragments. Add a Node extractor over web-ifc (already a bridge dependency in `ifc-to-frag.mjs`) producing the `ElementProperties` shape. | `POST /ifc`, `/cde/:key/propose`, `sentinel-core` bundle, BCF loop | M | **Highest.** Makes Astra/Ideatura IFC, Atenea's RVT-exported IFC, Pascal (via 1.3), Cartesian solids routed through Rhino/IFC (S8, no BIM semantics of its own) and Navisworks-derived models all first-class proposers. Unlocks 1.3, 3.2, and the demo in 1.4. |
| **1.2** | **Agent Session Gate** (Revit) | S3, S4 | Any automation batch inside Revit (Atenea, Autodesk Assistant, Dynamo, pyRevit) treated as one proposal: delta captured, rule engine run before acceptance, block-mode violations reverted, request-mode to Change Requests with actor `agent:<name>`/`dynamo:<graph>`, batch verdict on the ledger, ROI entry. | DMU updaters, `RequestManager`, `RuleEngineHost`, `GovernedNotify`, `RoiTracker` | M | High. Add-in work: **waits for the test session**. |
| **1.3** | **Pascal → Sentinel** adapter + skill | S7 | Pure `pascal-adapter.ts` (Pascal scene JSON → `ElementProperties`), route `POST /cde/:key/propose/pascal`, agent skill "draw in Pascal, propose to Sentinel, fix until accepted". | 1.1's extractor shape, propose API, MCP server | S after 1.1 | Medium now, high as Pascal grows. |
| **1.4** | **Referee report** (marketing, zero code) | S3, S2 | Run scorecard + IDS + delivery gate on a large generated or foreign model and publish the *verdict table* beside the *count table*. With 1.1 live, run it on an Astra-generated IFC: "Modelled in 10 minutes. Here is what the referee says." | Testing protocol session | S | Positioning. |
| **1.5** | **Parallel-agent merge check** | S2 | S2 merges components from several agents into one model. Add a merge gate to 1.1: duplicate GlobalIds across intake files, storey mismatch, overlapping AABBs between the merged parts (reuse `clash.ts` broad-phase), reported as warnings on the verdict. | `clash.ts`, `revision-diff.ts` | S after 1.1 | Medium; it is the failure mode S2 admits to. |

### Wave 2 · Impact and context (the Autodesk Context answer)

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **2.0** | **Snapshot ingest on Governed Publish** (prerequisite) | interop roadmap item 1 | Per-element snapshots (GlobalId, category, Qto) posted on every publish so the graph has revision history for Revit-authored models. Listed in `docs/interop.md` as "highest value", not yet built. | `element_snapshots` (migration 0005), `revision-diff.ts`, `GovernedNotify` | S–M | Required by 2.1; also lights up 5D/6D revision diff for Revit models. |
| **2.1** | **Impact analysis over the Governed Element Graph** | S6 | `impact_of({issue \| element \| version \| verdict})`: traverse issue → elements → container version → verdict → transitions → revision diff → schedule tasks (4D, `schedule.ts`) → cost/carbon deltas. Every hop cites the ledger row hash. Exposed as a bridge AI tool, an MCP tool, and an "Impact" card in the issue and versions panels. | `element-graph.ts`, `revision-diff.ts`, `schedule.ts`, `revision-cost/carbon.ts`, BCF store, audit ledger | M–L | **High, strategic.** "What is the impact of issue 12?" answered from *verified, immutable* records, which Autodesk cannot claim. Category of one (strategic review W5). |
| **2.2** | **Copilot grounding on impact** | S6 | The existing grounded copilot gets `impact_of` and `read_audit` so it answers impact questions with citations. | `copilot-panel.ts`, `ai-tools.mjs` | S after 2.1 | Medium; the visible face of 2.1. |

### Wave 3 · Federation, clash and intake channels

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **3.0** | **Federation Gate** (data clash before geometric clash) | S11, S10, S1 | A cross-model consistency check that runs on a federated set *before* any clash job: type and classification names reconciled across models (the `Wall 1` vs `W-A1-Fin` case), duplicate GlobalIds across links, level and grid name alignment, shared-coordinate and georeference agreement (ties to 4.1), naming ruleset and IDS applied to every model in the set. Verdict on the ledger, failures as BCF, and a warning banner on the clash panel when the set has not passed. Pure core function + a web panel; the Revit Clash Manager gets the same pre-check. | `naming.ts`, `ids.ts`, `element-graph.ts`, `revision-diff.ts` (GlobalId keying), `clash-panel.ts`, BCF | M | **High.** The concrete form of D-01, with S11's 12,000-clash story as the pitch: "we would have refused that clash run." |
| **3.1** | **Platform clash as a service → governed register** | S1 | Consume That Open's `ClashesManager` (queries, matrices, cloud detection, status workflow) instead of extending Sentinel's own AABB broad-phase. Results land in the governed clash register with provenance and raise BCF as today. Consistent with D-01: Sentinel governs the result, does not build the engine. **Verify first:** `@thatopen/services` is pinned at `^0.3.11` in `WebApp/package.json`; confirm the service exists at that version or what the upgrade costs. | `clash-panel.ts` register view, `/clash/:project`, BCF | M | High; retires the "narrow-phase later" debt in `clash.ts`. |
| **3.2** | **Clash intake from any engine + the register as the report** | S5, S10 | Accept clash results from Navisworks, ACC Model Coordination and That Open's service through BCF-API 3.0 into the governed register, keyed on GlobalId so the same clash from two engines dedups, each with engine provenance and a ledger row. Then make the register the exportable clash report S10 asks for: BCF zip, CSV and a signed PDF with the ledger hash. For geometry, NWD/NWC → Fragments (Cappilli's add-in or That Open's converter). With 1.1, an IFC exported alongside gets the full verdict. | `/bcf/3.0/*`, `/clash/:project`, register view, fragments loader, 1.1 | S (BCF import) + S (report export) + M (fragments intake) | High for the pilot's coordinator role, and it answers a live ask from a BIM manager. |
| **3.3** | **"Build your own governed tool" skill** | S1 | A published agent skill + doc that lets a Claude Code session compose Sentinel's AI tools and MCP server into a working app on That Open Platform in minutes (the S1 pattern), e.g. a publish-gate dashboard. Answer to That Open's own question "if you could build any tool, what would it be?": *one that cannot publish a non-conformant model.* | `ai-tools.mjs`, `mcp-server.mjs`, `docs/mcp-server.md` | S | Marketing + ecosystem. |
| **3.4** | **Sentinel as a That Open Platform service** | S1 | Package the referee (propose, verdict, audit) as a platform-registered service the way `ClashesManager` is, so any platform app gets governance by declaring it. | everything above | L | Strategic distribution; **later**, after 1.1 and 3.3 prove demand. |

### Wave 4 · Validate-panel gaps and hygiene

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **4.1** | **Georeference rule, done properly** | S4 | Delivery contract check for `IfcMapConversion` + `IfcProjectedCRS` with a named EPSG code, survey/base point consistency, warn on site lat/long vs EPSG origin disagreement. Today the gate only regex-matches a numeric tuple on `IFCSITE` and the Base contract ships with `require_georeference: false`. | `IfcDeliveryGate.cs`, `DeliveryContract.cs` | S–M | Medium-high; a common, regulator-visible delivery failure. Add-in: waits for the test session. |
| **4.2** | **Room calculation point rule (RC-01)** | S4 | Instances with the calculation point disabled, or with a null room while inside one, flagged (monitor default; request for doors/windows/equipment). Feeds room schedules and COBie for the LOD-300 pilot. | `RuleEngineHost`, scorecard domain prefix | S | Medium. Add-in: waits. |
| **4.3** | **Standards pack export/import with provenance** | S4 | Pack files carry who built them, from which golden model, SHA-256; import verifies. Seed of the pack marketplace in the vision doc. | `StandardsPack.cs`, `config/base-standard/` | S | Medium; hardens onboarding, which every test session exercises. |
| **4.4** | **Rules from recurring violations** | S3 | Propose a ruleset amendment from ledger patterns (Atenea's "every rule came from a mistake", formalised with provenance). | ledger, `StandardsReviewWindow` | M | 🔭 later; needs ledger volume. |
| **4.5** | **BEP from config** | S12, S11 | Generate the human-readable BIM Execution Plan from the executable config: naming ruleset, element IDS, delivery contract, DWG layer standard, CDE states and suitability codes, roles, enforcement levels per stage. One command, one document, always in sync with what the gate actually enforces. The ISO 19650 audience gets the paperwork and the proof that it is executed. | `config/base-standard/*`, `RulesetWindow`, handbook 04 | S–M | Medium-high; credibility with the certification lane in `ROADMAP.md`, and the one BIM-Management artefact Sentinel does not yet produce. |
| **4.6** | **Structural Ghost** (rule-based, offline) | S9 | Extend the Model-from-Drawings chain to structural CAD: footings, columns and beams from `S-FNDN`, `S-COLS`, `S-BEAM` layers, placed by the deterministic layer ruleset with no model call, review-gated like every Ghost build. `LayerRulesetMatcher` already does deterministic-first mapping; `ElementPlacementFactory` handles columns as point families but has no beam (line-hosted framing) or footing path. | `LayerRulesetMatcher`, `ElementPlacementFactory`, `GhostReviewWindow`, `layers.json` | M | Medium; the generation lane, not the referee. S9's 178 reactions say the demand is real, and the offline posture matches Sentinel's local-only stance. Add-in: waits. |
| **4.7** | **One naming standard across schedule** | S11 | Apply the naming ruleset to 4D task names and WBS codes imported from P6/MSP CSV, so "drawing, model and schedule" share one standard as S11 prescribes. Drawings (layer standard) and models (naming gate) are covered; the schedule is not. | `schedule.ts`, `naming.ts` | S | Low-medium; cheap completion of a claim Sentinel can then make in full. |

### Not doing (and why)

- A natural-language authoring agent (S2, S3): Autodesk ships one, Atenea and
  Ideatura have head starts, and it is the wrong seat (D-07).
- Our own 3D editor (S7) or a vision-to-solids generator (S8): Pascal and
  Cartesian do it better; put Sentinel behind them.
- Our own clash engine narrow-phase (S1): consume the platform service (3.1).
- Fixes as Dynamo nodes, a parameters-to-Excel exporter (S4): split the
  engine or pull data out of the governed graph.

## Sequencing

```
now (test session running)      after the session closes
─────────────────────────       ─────────────────────────────────────────
bridge/core branch:             add-in branch:
  1.1 Governed Intake  ──┐        1.2 Agent Session Gate
  2.0 Snapshot ingest    │        4.1 Georeference rule
  3.0 Federation Gate    │        4.2 RC-01 rule
  3.3 Governed-tool skill│        4.3 Pack provenance
  4.5 BEP from config    │        4.6 Structural Ghost
                         ▼
  1.3 Pascal adapter     2.1 Impact analysis ── 2.2 Copilot
  1.5 Merge check        3.1 Platform clash (after 3.0 + version check)
  1.4 Referee report     3.2 Clash intake + report
  4.7 Schedule naming                          3.4 Platform service (later)
```

- **First commit of the update: 1.1.** It is bridge and core only, it does
  not touch the add-in the test session is exercising, and five other items
  hang off it.
- **Second: 3.0.** Also core and web only, and it is the feature with the
  best story attached (S11). No clash run, ours or a platform's, without a
  Federation Gate pass.
- **The demo that proves the update:** 1.1 + 1.4 on an agent-generated IFC,
  then 2.1 answering "what is the impact of the rejected verdict".
- Each shipped item gets a drill in `docs/TESTING_PROTOCOL.md` and moves its
  row in `docs/handbook/05-capability-status.md` only on evidence, per the
  protocol's rules.

## Definition of done per wave

- **Wave 1:** an IFC produced outside Revit gets a verdict on the ledger and
  a version on the CDE with no human step; a Pascal scene round-trips to an
  accepted verdict; the referee report is published.
- **Wave 2:** `impact_of` returns a cited chain for an issue on the Snowdon
  model, and the copilot answers the S6 question from it.
- **Wave 3:** a federated set with a planted `Wall 1` / `W-A1-Fin` type
  mismatch is refused by the Federation Gate with the pair named; a clash
  found by the platform service is in the governed register with a BCF
  issue; a Navisworks or ACC BCF export lands in the ledger and comes back
  out as a signed report.
- **Wave 4:** planted georeference and calculation-point faults are caught in
  the Session C drill; a pack import refuses a tampered file; the generated
  BEP matches the live config field for field; a structural DWG builds
  footings, columns and beams offline through the review gate.

## Open verifications before starting

1. `@thatopen/services` version with `ClashesManager` (blocks 3.1).
2. Whether web-ifc in Node exposes property sets cleanly enough for the 1.1
   extractor, or whether the Revit-side extractor's logic is ported.
3. Pascal node properties shape (blocks 1.3; noted in the Pascal review).
4. Revit 2027 MCP host contract (for the later MCP-tools follow-on in the
   LinkedIn review, not in this plan's waves).
