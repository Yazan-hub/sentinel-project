# AI × Revit × openBIM showcase analysis — feature inspiration

**Sources:** 12 shared posts (11 fetched clean; the Instagram reel resolved to unrelated content
behind a login wall). Six of twelve are one author (Michael Hoppe) promoting GeoPogo's
Claude-to-Revit connector — treat that cluster as one signal, not six.

## What the market is actually showing

### 1. The generation wave (Hoppe/GeoPogo cluster — 6 posts)
Claude Desktop drives Revit through an MCP connector ("Claude to Revit"): a full house from one
text prompt, a model from a floor plan image, buildings reconstructed from a single photo, massing
from reference images, organic towers pushed to Unreal/Cesium via Datasmith. Where the connector's
tool surface ran out, the demos fall back to raw computer-use (unattended mouse control in Revit).

**The tell is in the comments, consistently unanswered:**
- "Does the connector validate writes before they commit?"
- "One photo underdetermines the unseen geometry — how do you trust it?"
- "What did it cost in tokens and clock time?"

Generation is commoditizing; **verification, provenance, and cost transparency are the open
questions nobody on stage answers.** That is Sentinel's exact thesis (LLM proposes, code disposes).

### 2. The reconciliation architecture (Karim Maghraby — the highest-signal post, 5/5)
An n8n POC that answers "does a document in the CDE actually PROVE correct information delivery?"
by reconciling an approved MIDP/TIDP baseline against Oracle Aconex APIs across five evidence
domains: register presence, **revision correctness**, **status/suitability match**, **review
workflow completion**, and **transmittal/distribution**. Output is an exception register where
every exception carries severity, responsible party, evidence reference, action, and due date.
Notably: **zero AI** — deterministic ETL + rules engine. This is what mature information managers
consider the real problem.

### 3. The honest-quantities pitch (Gule Noor — IFC → priced BOQ)
Sells itself on "no guessed trade codes, no invented rates, no silent assumptions" — the honesty
posture as MARKETING. Comments ask for NRM2/CESMM4 (measurement standards), MEP/rebar handling,
and how much is actually automatic. Demand for evidence-chained quantities is real; the offering
is a black box.

### 4. Extensibility + unverified formulas (Nikolai Davydov — AnalyseTool)
Open-source framework: Revit extension logic in C#, UI in plain web tech. Built a German
early-phase KPI calculator (GRZ/GFZ/BMZ, areas, CO2, cost) in 30 minutes — and says out loud he
"didn't verify the formulas the AI wrote." The speed is real; the trust gap is stated by the
author himself.

### 5. Noise (CAD→BIM reshare, TraceLayer)
CAD→BIM "automation" post carries no mechanics and gets Dynamo-era pushback in its own comments.
TraceLayer (screen-overlay tracing paper) is charming but not our layer; its best comment
contrasts pixel-level AI with a structured-data MCP + user-validation layer — again, the market
asking for a referee.

## The pattern

Every comment section converges on the same three unanswered questions:

> **Can I trust the write? Where is the evidence? What did it cost?**

Sentinel already owns the answer architecture: the IDS propose gate, the hash-chained audit trail,
derived-not-stored status, the uncited-finding gate, verified actor attribution. The next phase
should weaponize that against the generation wave rather than joining it.

## Killer-feature candidates

### A. Governed AI modeling — the propose gate in front of Revit writes (flagship)
The direct counter to the GeoPogo cluster. An agent (any MCP client) designs; **nothing enters the
model ungoverned**: proposed elements go through `sentinel_propose` (IDS adjudication) and a human
tick-list in the add-in BEFORE the Revit transaction commits; every accept/reject lands in the
audit trail with the acting identity. The pieces exist today — SentinelAddin (executor),
IDS validators (sentinel-core), propose API + MCP tool, audit chain, resolveActor. What's new is
the Revit-side transaction broker: buffer AI-proposed elements as a staged changeset, render the
verdict list in the add-in, commit only accepted elements.
**Pitch: "Let any AI design. Nothing touches the model without adjudication." Nobody in these 12
posts has this; their own comment sections are asking for it.**

### B. Deliverable evidence reconciliation — MIDP compliance beyond arrival (fastest win)
Phase 4 answers "did the named container arrive and publish by the date." The Aconex POC shows
the four dimensions clients actually audit: expected **revision** at the milestone, expected
**suitability/status**, **review/approval evidence**, **distribution** (who was it issued to).
Extend `deliverables` rows with expected_revision + expected_suitability (optional columns,
paste-import compatible); derive richer verdicts (arrived-but-wrong-revision,
published-at-wrong-suitability) from data we already hold in `container_versions` + the audit
trail; emit an exception register (severity, responsible party = planned team, evidence = version
ids/audit refs) exportable as the client-facing report. Each new dimension becomes a real check in
the registry (`midp.revision`, `midp.suitability`) — honest not_checkable where evidence doesn't
exist (e.g. distribution, until transmittals exist in Sentinel).
**Pure extension of the phase-3/4 spine, deterministic end to end, no new trust surface.**

### C. Evidence-chained BOQ — 5D with receipts
Sentinel already has BoQ/5D + rate packs. The differentiator the BOQ post fakes: every line item
traceable to element GUIDs + the measurement rule that produced the quantity + the rate source
row; elements that DON'T classify land in an explicit exceptions list instead of a silently
guessed trade. Measurement-standard packs (NRM2 first — the thing the post's commenters asked for
and were refused) as data, not code.

### D. Verified KPI packs (smaller)
AnalyseTool's lesson productized: early-phase design metrics as registry checks whose formulas are
test-pinned code with provenance in the result ("computed by rule X over N elements"), the
opposite of "AI wrote the formula, I didn't verify it."

## Recommended sequencing

1. **B** — weeks-scale, entirely on the existing spine, deepens the tracker into the thing the
   highest-signal post proves information managers want. Immediately demoable to the pilot.
2. **A** — the flagship differentiator; bigger lift (add-in transaction broker + staged-changeset
   UX), start as spec/brainstorm while B ships.
3. **C** then **D** — both ride existing surfaces; C has stated market demand.

One meta-note: the strongest marketing line in the whole corpus is Sentinel's existing behavior.
"No guessed codes, no invented rates, no silent assumptions" got a vendor traction — Sentinel can
say it with receipts (the gate drops uncited findings; checks refuse to fabricate passes; the
audit chain is tamper-evident). Worth a demo video answering the three questions the GeoPogo
threads leave hanging.
