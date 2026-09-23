# LinkedIn inspiration review — 2026-09-18

> Consolidated into the plan: [`docs/FEATURES_UPDATE_2026-09.md`](../FEATURES_UPDATE_2026-09.md).

Two posts were handed in as inspiration. This note records what they show, how
each fits Sentinel's thesis, and what is worth building. Written while a live
test session was running, so it deliberately touches no code and adds no test
step. Sources: screenshots of both posts (LinkedIn is unreachable from the
analysis environment; the first draft of this note guessed the content, this
revision uses the real text).

## The two posts

### Post 1 — Irving Resendiz (Atenea): "Modeled in 32 minutes. It cost 5 dollars."

Atenea modeled **Torre Reforma** (Mexico City) with its Revit plugin, a vision
module, and a system prompt of 200+ rules, "every one of those rules came out
of a mistake, not a brainstorm." The post's proof is what it calls a *model
audit*:

| | |
|---|---|
| Levels | 70 |
| Grids | 13 |
| Columns | 1,311 |
| Beams and diagonals | 1,566 |
| Walls | 1,002 |
| Slabs | 68 |
| Family instances | 18,613 |
| Materials | 223 |
| **Elements total** | **33,502** |

Team: two people. Time: 32 minutes. Cost: 5 dollars.

### Post 2 — Shankar Kharat: a BIM-automation portfolio

A one-page portfolio (GitHub Pages) of the tools one BIM engineer built and
uses:

- **Dynamo:** title-sheet automation, topography from point cloud, automated
  equipment placement, component validation, EPSG calculator, a "BIM Value
  Exporter" pushing device parameters into Excel.
- **Revit plugins (C#):** coordinate checker, room calculation point checker,
  lat/long converter.
- **AI agents:** JSON error resolution, model health checks.

## What each post actually says about the market

**Post 1: the cost of *producing* a model has collapsed.** 33,502 elements for
5 dollars. Whatever the geometry quality, the economics mean AI-generated
models will arrive on CDEs at volume. Two details matter for Sentinel:

1. The "audit" is a **count**, not a **verdict**. It says nothing about
   naming, parameters, LOD, georeferencing, or whether a single wall carries a
   fire rating. Nobody can sign off a tower on element counts. That is exactly
   the referee gap Sentinel exists for, and the post hands us the demo script:
   *"Atenea modeled it in 32 minutes. Here is what the referee says."*
2. Atenea's quality control is **200 rules in a prompt, each learned from a
   mistake**. That is informal, private, and unverifiable. Sentinel encodes the
   same kind of lesson as a **deterministic, config-driven, audited rule**
   (ruleset, IDS, delivery contract). "Our rules are a standard, not a prompt"
   is a clean positioning line.

**Post 2: the checks Sentinel sells are being hand-rolled, one engineer at a
time.** Half of that portfolio is *validation*: coordinate checker, room
calculation point checker, component validation, model health checks. They
are scattered, unversioned, per-office, and none of them leaves a record.
This confirms two things: the checks are wanted, and the market's current
answer is a folder of scripts. It also names two concrete checks Sentinel
does not have yet (below).

## How they fit Sentinel

The handbook's posture already answers both posts:

- **D-07 · referee, not rival.** An agent that emits 33,502 elements is a more
  prolific proposer; the referee seat gets more valuable, not less.
- **"LLM proposes, the deterministic engine disposes."** GhostBuilder writes
  nothing until a reviewer ticks it. Atenea writes first. At 33k elements a
  human cannot tick anything; only a deterministic gate scales.
- **The propose API and MCP server exist** but adjudicate elements handed to
  the bridge. Neither post's output passes through them today.
- **Dynamo is catalogued as a complement that feeds Sentinel.** Post 2 is that
  complement in the wild.

## Where Sentinel is exposed

1. Users will compare "type it, 32 minutes, done" with GhostBuilder's
   folder-driven, review-gated chain and find Sentinel slower. Chasing that is
   the wrong move; making the agent's output safe is the right one.
2. Agent batches and Dynamo runs meet Sentinel's rules only through the
   per-element live scan and the sync-time rescan. No batch verdict, no
   rollback of a bad batch, no provenance saying an automation did it.
3. Two of Post 2's checks are gaps in Sentinel's Validate panel
   (georeferencing beyond "IFCSITE has a lat/long", room calculation points).

## Candidate developments

### A · Agent Session Gate (recommended, one feature covers both posts)

Treat any external automation (Atenea, Autodesk Assistant, a Dynamo run, a
pyRevit script) as one **proposal**:

- Detect the batch: the DMU updater sees a burst of adds/modifies in one
  transaction group, or the user arms "Agent session" from the panel.
- Capture the delta with the existing `RequestManager` old-value snapshot.
- Run the delta through `RuleEngineHost` before the panel accepts it:
  block-mode violations take the existing reject/revert path; request-mode
  ones land in Change Requests with actor `agent:<name>` or
  `dynamo:<graph name>` (Dynamo's transaction naming makes this detectable).
- Record the batch verdict on the ledger via `GovernedNotify.Propose` with
  the automation as actor, so the audit answers "which agent changed what,
  and did it pass". Log the run to ROI as an "automation reviewed" entry.

Reuse: `Updaters/`, `Workflow/RequestManager`, `Engine/RuleEngineHost`,
`Coordination/GovernedNotify`, `RoiTracker`. New code is orchestration.
Effort: medium (spec, one add-in feature, no bridge schema change). Value:
high; it lands on the strategic review's point 5 (neutral agent substrate)
and is the demo Post 1 hands us.

### B · Two new checks lifted from Post 2 (recommended, small)

1. **Georeference rule, done properly.** Today `IfcDeliveryGate` only looks
   for a numeric tuple on `IFCSITE`, and the Base contract ships with
   `require_georeference: false`. Add a real check: `IfcMapConversion` +
   `IfcProjectedCRS` present (IFC4) with a named EPSG code, survey point and
   project base point consistent with it, and a warn when the site lat/long
   disagrees with the EPSG origin. This is Post 2's coordinate checker, EPSG
   calculator and lat/long converter as one deterministic contract rule.
   Effort: low-medium (gate parser + contract field). Value: medium-high; it
   is a common real-world delivery failure and a regulator-visible one.
2. **Room calculation point rule (RC-01).** A new rule family in the ruleset:
   family instances whose room calculation point is disabled, or whose
   computed room is null while the instance sits inside a room, get flagged
   (monitor by default, request for door/window/equipment categories). This
   feeds room schedules and COBie, which the BDS LOD-300 pilot depends on.
   Effort: low (one rule kind in `RuleEngineHost`, one domain prefix in the
   scorecard). Value: medium.

### C · "Referee report" as the marketing artefact (recommended, zero code)

Post 1 leads with a count table. Sentinel's equivalent is a **verdict
table**: Health Scorecard grade, IDS pass/warn/fail per specification,
delivery-gate certificate hash, and the BCF issues raised. Run the existing
tools on any large generated or foreign model (the Snowdon or German samples
qualify) and publish the table beside the count. The point is not the number
of elements but how many of them are *true*. Effort: none beyond a session
from the testing protocol. Value: positioning.

### D · Sentinel tools on Revit's MCP surface (follow-on)

Revit 2027 exposes MCP and Atenea already speaks it. Exposing `scan_now`,
`ifc_preflight`, `delivery_gate` and `propose` as local MCP tools from the
add-in lets any in-Revit agent ask "does my change pass?" before it finishes.
Effort: medium-low once A exists. Depends on confirming Revit 2027's MCP host
contract.

### E · Rules from mistakes, formally (later)

Atenea's 200 prompt rules each came from a mistake. Sentinel already records
every mistake (rejected proposals, BCF issues, violations) on the ledger.
A "propose a rule from recurring violations" step, reviewed like a standards
pack, would close the same loop with provenance. Keep as 🔭; it needs
ledger volume first.

### Not recommended

- **Build a natural-language authoring agent.** Autodesk ships one natively
  in Revit 2027, Atenea has a multi-year head start, and it contradicts D-07.
- **Ship Sentinel's fixes as Dynamo nodes.** Moves the referee's logic into
  an ungoverned host and splits the engine, against D-05.
- **A parameters-to-Excel exporter.** Cheap, but it pulls data *out* of the
  governed graph; the CSV/BCF compliance report in the vision doc covers the
  legitimate need.

## Recommendation

Do A and B, in that order, each specified first as a short design doc under
`docs/` with a drill added to `docs/TESTING_PROTOCOL.md`. Run C in the next
testing session for free. D follows once the Revit 2027 MCP host contract is
confirmed.

Why: both posts are about *producing* changes faster and cheaper. Sentinel's
differentiated seam is *verifying* them. Every new producer, human or agent,
is a customer of that seam, and the gate turns "an agent did 33,502 things to
my model for 5 dollars" into "33,502 things, adjudicated, on the record".

## Open items

- Confirm Revit 2027's MCP host contract before speccing D.
- Do not start the add-in work until the running test session closes; the
  DMU updater and `RequestManager` are the parts A exercises.
