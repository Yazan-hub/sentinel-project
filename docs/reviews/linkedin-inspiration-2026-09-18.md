# LinkedIn inspiration review — 2026-09-18

Two posts were handed in as inspiration. This note records what they appear to
show, how each fits Sentinel's thesis, and what (if anything) is worth building.
Written while a live test session was running, so it deliberately touches no
code and adds no test step.

## Source caveat (read first)

Neither post could be opened from the analysis environment (LinkedIn is
egress-blocked; mirrors and the web archive too). The analysis below rests on:

| Post | Author | What is known | Confidence |
|---|---|---|---|
| `irvingresendiz_bim-revit-architecture-ugcPost-7505704837917945856` | Irving Resendiz, CEO of Atenea (ateneaio.com) | Atenea is a chat agent inside Revit that executes 250+ real actions from typed instructions (levels, walls, views, sheets, tags, schedules, shared parameters); recent posts show it driving the Ribbon and Properties Palette and operating other AEC tools (SketchUp, Navisworks, Tekla). The post is almost certainly another Atenea demo. | Medium |
| `bim-automation-shankar_bim-revit-dynamo-share-7505886619028066304` | "BIM Automation Shankar" | Slug says `bim revit dynamo share`: a Dynamo graph or workflow being shared, in the "here is my automation, take it" genre. Specific graph unknown. | Low |

If the pasted post text contradicts a row above, the recommendations that
depend on it are marked so they can be re-checked.

## Post 1 — Atenea-style "type it, Revit does it"

### What it is
A natural-language agent that *authors*: it takes a sentence and performs a
batch of Revit API actions. The wave it belongs to is now mainstream: Autodesk
Assistant in Revit 2027 (tech preview) plus Revit's MCP surface mean every
Revit seat will soon have an agent that can change the model on request.

### How it fits Sentinel
This is the exact world Sentinel was designed for, and the posture is already
decided in the handbook:

- **D-07 · referee, not rival.** Sentinel sits downstream of every authoring
  tool. An agent that generates 250 actions per prompt is a *more* prolific
  proposer, which makes the referee seat more valuable, not less.
- **"LLM proposes, the deterministic engine disposes."** GhostBuilder already
  applies this locally: nothing is written until a reviewer ticks it. Atenea
  writes first and lets the human undo. That is the philosophical gap and the
  pitch.
- **The propose API and MCP server exist** (`sentinel_propose`, `sentinel_audit`).
  Today they adjudicate *elements handed to the bridge*; they do not yet see
  what an agent does *inside a live Revit session*.

### Where Sentinel is exposed
1. Users will compare "type a sentence, geometry appears" with GhostBuilder's
   folder-driven, review-gated chain and find Sentinel slower. Sentinel should
   not chase that; the answer is to make the *agent's* output safe, not to
   become the agent.
2. Agent-driven edits currently hit Sentinel's rules only through the DMU live
   scan and the sync-time rescan. A 250-action batch that violates block-mode
   rules is caught after the fact, per element, with no batch-level verdict and
   no provenance that "an agent did this".

### Candidate developments

**1A · Agent Session Gate (recommended).** Treat any external automation
(Atenea, Autodesk Assistant, a Dynamo run, a pyRevit script) as one *proposal*:

- Detect the batch: DMU updater sees a burst of adds/modifies inside one
  transaction group, or the user arms "Agent session" from the panel.
- Capture the delta with the existing `RequestManager` old-value snapshot.
- Run the delta through `RuleEngineHost` **before** the panel accepts it:
  block-mode violations trigger the existing reject/revert path, request-mode
  ones land in Change Requests with actor = `agent:<name>`.
- Record the batch verdict on the ledger via `GovernedNotify.Propose` with
  `actor: "agent"`, so the audit answers "which agent changed what, and did
  it pass".

Reuse: `Updaters/`, `Workflow/RequestManager`, `Engine/RuleEngineHost`,
`Coordination/GovernedNotify`, `RoiTracker`. New code is orchestration, not a
new engine. Effort: medium (one spec, one add-in feature, no bridge schema
change). Value: high; it is the demo that says "run Atenea, Sentinel keeps the
model true" and it lands squarely on the strategic review's point 5
(neutral agent substrate).

**1B · Sentinel tools on Revit's MCP surface.** Revit 2027 exposes MCP; Atenea
already speaks it. Exposing `scan_now`, `ifc_preflight`, `delivery_gate`, and
`propose` as local MCP tools from the add-in lets *any* in-Revit agent ask
"does my change pass?" before it finishes. Effort: medium-low once 1A exists
(the tools are the same functions). Value: medium now, high as the Revit MCP
ecosystem grows. Depends on confirming Revit 2027's MCP host contract.

**1C · Build a natural-language authoring agent.** Not recommended. Autodesk
ships it natively, Atenea has a multi-year head start, and it contradicts D-07.
GhostBuilder stays as the *governed* generation path for drawings and photos.

## Post 2 — a shared Dynamo automation

### What it is
The BIM-community norm: someone builds a Dynamo graph (rename views, renumber
sheets, push parameters, place elements from Excel) and shares it. Dynamo is
listed in the tools catalog as a **complement that feeds Sentinel**, long-term
absorbable.

### How it fits Sentinel
Dynamo graphs are unreviewed bulk edits with no provenance and no standard
check. That is the same shape as an agent batch, only older. Two of the seven
active rules (view names VN-01, sheet numbers SN-01) are exactly what the
typical shared graph rewrites.

### Candidate developments

**2A · Fold Dynamo runs into the Agent Session Gate (recommended, same
feature as 1A).** A Dynamo run is one transaction; the gate above already
captures it. Specific add: label the actor `dynamo:<graph name>` when the
transaction name matches Dynamo's pattern, and log the run to ROI as an
"automation reviewed" intervention. Zero extra engine work.

**2B · Shareable standards packs, not shareable scripts.** The post's real
signal is that BIM people share *artefacts*. Sentinel's shareable artefact is
the standards pack (`config/base-standard/`, harvested packs from Build Office
System). A pack export/import with provenance (who built it, from which golden
model, SHA-256) is cheap and is the seed of the standards-pack marketplace
already in `killer-features-vision.md`. Effort: low. Value: medium; it is
marketing-adjacent but it also hardens onboarding, which the testing protocol
says every session must exercise.

**2C · Ship Sentinel fixes as Dynamo nodes.** Not recommended. It moves the
referee's logic into an ungoverned host and splits the engine, against D-05.

## Recommendation

Build one thing: the **Agent Session Gate** (1A + 2A), specified first as a
design doc under `docs/`, then implemented as an add-in feature with a drill
added to `docs/TESTING_PROTOCOL.md`. 1B follows once the Revit 2027 MCP host
contract is confirmed. 2B is a low-effort side task that can ride any quiet
session.

Why this and not the flashier reading of the posts: both posts are about
*producing* changes faster. Sentinel's differentiated seam is *verifying* them.
Every new producer, human or agent, is a customer of that seam, and the gate
turns "Atenea did 250 things to my model" into "250 things, adjudicated,
on the record".

## Open items

- Paste the text of both posts (or describe the video) to confirm the two
  assumption rows; 1A/2A do not depend on the details, 1B and 2B do.
- Confirm Revit 2027's MCP host contract before speccing 1B.
- Do not start the add-in work until the running test session closes; the
  DMU updater and `RequestManager` are the parts it exercises.
