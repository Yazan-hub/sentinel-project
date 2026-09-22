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
4. **Validation is still hand-rolled in the field.** S4: the checks exist as
   personal scripts; Sentinel lacks two of them.

Every item below is a referee move (decision D-07). None builds an authoring
agent, an editor, or a clash engine.

## The backlog

Effort: **S** ≤ 2 days · **M** 3–6 days · **L** 1–3 weeks. Status of the
prerequisite code is stated from the source tree, not assumed.

### Wave 1 · The referee for the generators

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **1.1** | **Governed Intake** (Governed Publish without Revit) | S2, S3, S7, S5 | A bridge route that takes an **IFC file from any source** and runs the full G1–G4 loop headlessly: naming gate, server-side element extraction, IDS adjudication, ledger verdict, publish-on-pass, BCF on fail. Today the loop needs the Revit add-in to extract elements (`GovernedElementExtractor`); the bridge only converts IFC to fragments. Add a Node extractor over web-ifc (already a bridge dependency in `ifc-to-frag.mjs`) producing the `ElementProperties` shape. | `POST /ifc`, `/cde/:key/propose`, `sentinel-core` bundle, BCF loop | M | **Highest.** Makes Astra/Ideatura IFC, Atenea's RVT-exported IFC, Pascal (via 1.3) and Navisworks-derived models all first-class proposers. Unlocks 1.3, 3.2, and the demo in 1.4. |
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

### Wave 3 · Platform services and intake channels (That Open)

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **3.1** | **Platform clash as a service → governed register** | S1 | Consume That Open's `ClashesManager` (queries, matrices, cloud detection, status workflow) instead of extending Sentinel's own AABB broad-phase. Results land in the governed clash register with provenance and raise BCF as today. Consistent with D-01: Sentinel governs the result, does not build the engine. **Verify first:** `@thatopen/services` is pinned at `^0.3.11` in `WebApp/package.json`; confirm the service exists at that version or what the upgrade costs. | `clash-panel.ts` register view, `/clash/:project`, BCF | M | High; retires the "narrow-phase later" debt in `clash.ts`. |
| **3.2** | **Navisworks intake** | S5 | Accept the federated coordination model where coordinators already hold it: NWD/NWC → Fragments (Cappilli's add-in or That Open's converter) for viewing, and Navisworks clash results (BCF export) → BCF-API 3.0 → ledger. With 1.1, an IFC exported alongside gets the full verdict. | `/bcf/3.0/*`, fragments loader, 1.1 | S (BCF import) + M (fragments intake) | Medium-high for the pilot's coordinator role, which the roadmap assigns geometric clash to Navisworks. |
| **3.3** | **"Build your own governed tool" skill** | S1 | A published agent skill + doc that lets a Claude Code session compose Sentinel's AI tools and MCP server into a working app on That Open Platform in minutes (the S1 pattern), e.g. a publish-gate dashboard. Answer to That Open's own question "if you could build any tool, what would it be?": *one that cannot publish a non-conformant model.* | `ai-tools.mjs`, `mcp-server.mjs`, `docs/mcp-server.md` | S | Marketing + ecosystem. |
| **3.4** | **Sentinel as a That Open Platform service** | S1 | Package the referee (propose, verdict, audit) as a platform-registered service the way `ClashesManager` is, so any platform app gets governance by declaring it. | everything above | L | Strategic distribution; **later**, after 1.1 and 3.3 prove demand. |

### Wave 4 · Validate-panel gaps and hygiene

| # | Feature | From | What it is | Reuses | Effort | Value |
|---|---|---|---|---|---|---|
| **4.1** | **Georeference rule, done properly** | S4 | Delivery contract check for `IfcMapConversion` + `IfcProjectedCRS` with a named EPSG code, survey/base point consistency, warn on site lat/long vs EPSG origin disagreement. Today the gate only regex-matches a numeric tuple on `IFCSITE` and the Base contract ships with `require_georeference: false`. | `IfcDeliveryGate.cs`, `DeliveryContract.cs` | S–M | Medium-high; a common, regulator-visible delivery failure. Add-in: waits for the test session. |
| **4.2** | **Room calculation point rule (RC-01)** | S4 | Instances with the calculation point disabled, or with a null room while inside one, flagged (monitor default; request for doors/windows/equipment). Feeds room schedules and COBie for the LOD-300 pilot. | `RuleEngineHost`, scorecard domain prefix | S | Medium. Add-in: waits. |
| **4.3** | **Standards pack export/import with provenance** | S4 | Pack files carry who built them, from which golden model, SHA-256; import verifies. Seed of the pack marketplace in the vision doc. | `StandardsPack.cs`, `config/base-standard/` | S | Medium; hardens onboarding, which every test session exercises. |
| **4.4** | **Rules from recurring violations** | S3 | Propose a ruleset amendment from ledger patterns (Atenea's "every rule came from a mistake", formalised with provenance). | ledger, `StandardsReviewWindow` | M | 🔭 later; needs ledger volume. |

### Not doing (and why)

- A natural-language authoring agent (S2, S3): Autodesk ships one, Atenea and
  Ideatura have head starts, and it is the wrong seat (D-07).
- Our own 3D editor (S7): Pascal is MIT and better; put Sentinel behind it.
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
  3.3 Governed-tool skill│        4.2 RC-01 rule
                         │        4.3 Pack provenance
                         ▼
  1.3 Pascal adapter     2.1 Impact analysis ── 2.2 Copilot
  1.5 Merge check        3.1 Platform clash (after version check)
  1.4 Referee report     3.2 Navisworks intake
                                              3.4 Platform service (later)
```

- **First commit of the update: 1.1.** It is bridge and core only, it does
  not touch the add-in the test session is exercising, and five other items
  hang off it.
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
- **Wave 3:** a clash found by the platform service is in the governed
  register with a BCF issue; a Navisworks BCF export lands in the ledger.
- **Wave 4:** planted georeference and calculation-point faults are caught in
  the Session C drill; a pack import refuses a tampered file.

## Open verifications before starting

1. `@thatopen/services` version with `ClashesManager` (blocks 3.1).
2. Whether web-ifc in Node exposes property sets cleanly enough for the 1.1
   extractor, or whether the Revit-side extractor's logic is ported.
3. Pascal node properties shape (blocks 1.3; noted in the Pascal review).
4. Revit 2027 MCP host contract (for the later MCP-tools follow-on in the
   LinkedIn review, not in this plan's waves).
