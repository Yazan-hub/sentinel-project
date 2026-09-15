# Market Signal — September 2026

*Input: 24 posts (LinkedIn + Instagram) collected by Yazan, read 2026-09-15. Output: what the market is
saying, where Sentinel actually stands against it, and the ranked upgrade set for the unfreeze.
Companion to `STRATEGIC_REVIEW_2026-07.md` — that one argued the seat; this one tests it against the feed.*

---

## Part I — What the 24 sources actually say

### Cluster 1 · AI now authors BIM. The professionals in the comments are demanding a referee.

| Source | What it shows |
|---|---|
| Nicolas Catellier — *Astra GPT-6 + Revit for detailing* | One prompt recreates a construction detail in Revit, generates the missing detail-item families, tags and dimensions it. Author's own verdict: *"the old paradigm is clearly dead."* |
| Kristijan Vilibić — *Fable 5 → Revit* (Geopogo connector) | Natural language → complete residential floor plans, built into Revit through a Claude-to-Revit connector. |
| Chaitanya Bharech — *Blender MCP test* | 2D plan + elevation → walls, slabs, stair, roof, openings, materials, render — in an afternoon. Exported to FBX, opened in Navisworks: *"staircase that needs cleaning and doors that are not quite right."* |
| Philippe Bédard (Prevu3D) | Reality mesh → IFC via AI. The framing shift: stop asking the model *"what is in this scan"*, start telling it *"here is the geometry, here are the assets, here is the metadata — now build the BIM."* |
| Geopogo (IG) | Claude reads a Revit model → quantities → a construction cost report. |
| arch_ai_lab (IG) | Revit MCP generating axonometric view/filter/sheet setups from a prompt. |
| James Gray — AUTOM8 Labs | Manufacturer data sheet → generated Revit family, photometrics carried through, finishes as types. Next goal stated: *"bring families in line with company BIM standards."* |
| That Open — WebMCP | A 35B local model called a web app's own functions through WebMCP, found a wrong `Fire Rating` value in a live IFC and fixed it in the browser. |

**The signal is not the generation. It is the comment sections.**

- Under Catellier: Dr. Shawn O'Keeffe itemises what is wrong with the AI detail (leaders, dimensions, missing
  sill sealer, hatching). Steven S.: *"Claiming AI can produce publishable construction details without
  qualified review is a liability wrapped in a costly construction error."*
- Under Bédard, the top question is Mohammad Reza Mahmoodi's: *"how are you handling the validation/QA step
  once the AI generates the IFC? That still feels like the hard part in production."*
- Under Kristijan's Fable 5 post, Peter Neil asks whether building codes were supplied to *steer* the
  generation toward compliance.
- James Gray's own roadmap is "make generated content conform to the standard" — i.e. he built a proposer and
  immediately needed a referee.

**Read:** the entire feed is the proposer side racing ahead, and the professional response is a demand for the
disposer side. Sentinel's thesis — *"let a thousand tools propose; this is where it becomes true"* — was a
bet in July. In September it is what the market is asking for out loud, in public, under every viral post.
**The freeze cost nothing strategically. The market moved toward the seat.**

### Cluster 2 · The BEP / MIDP / TIDP thread — the sharpest, most specific opening

**Karim L Maghraby (BIM PM, Omrania/Egis)** — the single most useful post in the set. Paraphrased:

> Open your BEP and ask of every section: does this actually say *who* produces the information, *when*, *who
> reviews it*, and *what decision it supports*? You will find a 70–80 page document of which maybe a few pages
> are an actual plan. Software lists, naming conventions, LOD tables, org charts, CDE screenshots — required,
> maybe important, but their presence is not a plan. This is why the proposed ISO 19650 rename from *BIM
> Execution Plan* to **Information Production Plan** matters more than a name change: it asks the right
> question — *where is the plan?* Are the information delivery milestones actually tied to the construction
> programme? Does every deliverable have an owner, a date and a purpose? Strip out everything that doesn't
> help you manage information production, and see what is left. The real question isn't how many pages your
> BEP has — it's **how many of them actually control how the project runs.**

Supporting comments: Ayman Ghomrawi — BIM is becoming a parallel track to the project, sometimes a burden on
it. Ahmed Shawky — *"the BEP should be a tool for managing BIM, not a document for submission."*

**Mahmoud Mostafa (BIM Manager, ECG)** — TIDP/MIDP explained practically: what they are, the difference,
how and when you produce them, how the project team *and* the client use them. The top comment (Eman
M.Fakher, Technical Office Manager, 20+ yrs) is the operational reality: *"if the client isn't an
engineering firm, what are they approving it on the basis of?"* and *"how is it different from a drawing
list?"* — i.e. even senior practitioners can't tell a delivery plan from a document register.

**This cluster maps one-to-one onto code Sentinel already has and onto the gaps Sentinel already admits.**
From `WebApp/bridge/check-registry.mjs`, the *planned / not-checkable* list:

```
loin.levels            — "LOIN is not modelled per stage or discipline; the IDS spec is bridge-wide"
roles.responsibility   — "No task-team or responsibility matrix exists — container authorship is free text"
midp.review            — "No review/approval workflow model — cannot evidence a deliverable passed review"
midp.distribution      — "No transmittal model — cannot evidence who an issue was distributed to"
federation.breakdown   — "No declared expected-model list to check the federation against"
```

Karim's four questions are *who / when / who reviews / what decision* — and Sentinel's own registry says it
cannot check roles, review, or distribution. **Those five planned checks are the upgrade backlog, written by
the market.**

### Cluster 3 · Competitors and near-neighbours

- **BIMVAQ (Ghufran Khalil, KEO — via Ala'a Albozom).** The closest thing to Sentinel in the set: a Revit
  plugin branded *Validation | Automation | Quality*, three workflows, 48-hour free trial, author of a "COBie
  Delivery System". His pitch: *"Move closer to the authoring environment. The clash is already there, the
  context is already there. Why should the workflow start over when it's time to act? Keep the context.
  Continue the workflow where the model can actually change."*
  **That is Sentinel's own Revit-side argument, in market, with a trial link, while Sentinel has 99 passing
  tests and one verified operator.** It validates the direction and sets the clock.
  What it does *not* appear to have: an ISO 19650 state machine, an immutable ledger, a CDE, or openness.
  Sentinel's differentiation holds — but only if someone outside can touch it.
- **MODELi (Arun Santhosh, via Kristijan Vilibić).** Vibe-coded with Claude: IFC → BOQ take-off → 5D → CPM 4D
  → earned value + cash flow, browser dashboard. Dr. Pooja Jha's question in the comments — *how do you keep
  BOQ/WBS/schedule/EVM in sync when the model changes?* — is answered by the author with "not implemented
  yet; probably via IFC GUIDs." **The reconciliation problem is unsolved by the people building 4D/5D fast.**
- **Superplan (Charlie Deane).** IFC upload → BoM → costing (regional price DBs) → proposal → Word/PDF, in
  minutes. Deane's comment under Kristijan's post is worth keeping: *"There are so many individual
  initiatives that make sense! What if we all sat together and pooled our efforts into one big platform.
  Construction is too big for disconnected tools."*
- **Motif Design (Amar Hanspal, ex-Autodesk).** Public launch after 3.5 years: agent-native, parametric,
  associative, browser-based BIM authoring, backed by Redpoint. **Confirms the July thesis exactly:** the
  funded wave is building the *author* seat. Nobody in that round is building governance.
- **Autodesk Forma Schedule 4D** (Islam Khalil, Mostafa ElAshmawy — same news, AR and EN). Native 4D in the
  browser, no specialist licence, view-permission users can consume it. Three linking modes, and the one
  detail worth stealing: **links persist across model versions and the linking rules re-apply automatically
  to newly matching objects.** Comments: it does not federate (single RVT/IFC), and 4D clash is the obvious
  next ask.
- **Hamza Arshad — BIM Naming Manager.** In-Revit family naming engine with review-before-rename, explicitly
  positioned against DiRoots FamilyReviser ("CSV round-trip vs. the standard built into Revit"). Sentinel's
  Phase 0 pyRevit prototype already had family naming rules; this is a solved, wanted, small feature.

### Cluster 4 · The That Open / #befreeagain ecosystem (Yazan is a Founding Member)

Four posts, one message: people take the open engine and build the tool their niche needs, without
permission — a prompt-built clash detection app on That Open Platform; Pic on Site (geolocated site photos
pinned to the IFC, on Fragments); FragmentsUnity / FragmentsUE (Mohammed Azif — *"Getting a BIM model into a
game engine usually costs you the thing that made it a BIM model. The geometry arrives. The data doesn't."*);
and Luis Manuel Fuentes Pérez's 5D app whose stated principle is **every budget number should be traceable
back to the element that created it.**

These are not competitors. **They are proposers on the same stack Sentinel already runs on** — and a
distribution channel Yazan has standing in.

### Cluster 5 · Peripheral / noted, not acted on

- **Dr. Ibrahim Fahdah — voice agent on the model.** Interesting; the best comment is the real problem
  (Ian M.): ask for a wall's fire rating on site and there are three walls within a foot — *tie the agent to
  location* (scan position, room, grid) and it becomes useful. Park; relevant later to a field/7D layer.
- **Meng To — Fable 5.1 / three.js.** Craft signal, not BIM: AI is now good at the viewer layer, taste and
  detail still have to be pushed. Relevant only to how the WebApp presents itself.
- **Ahmed Maher Aly — "free-claude-code" proxy.** A proxy that routes requests through ~50 providers'
  free tiers. **Do not use this on Sentinel.** Everything — prompts, code, and any client model data in
  context — passes through a third-party proxy to third-party inference providers. Sentinel's whole pitch is
  provable custody of information. Using that proxy contradicts the product.
- **eng.mo.ashraf (IG) — "BIM portfolio recipe."** Portfolio-craft content; relevant to the consultancy
  site, not to Sentinel.

---

## Part II — The verdict on positioning

1. **The seat is correct and is being validated publicly.** Every generation post produces a comment thread
   demanding validation, review and accountability. Nobody in the feed is building that.
2. **The wedge should narrow, not widen.** The feed shows 4D, 5D, BoQ, cost, take-off, estimating being
   vibe-coded by individuals in weeks. That is now commodity surface. Sentinel's July doctrine (4D/5D/6D as
   *thin derivations off the shared spine, never owned*) is confirmed — hold it harder.
3. **The one place Sentinel is both differentiated and nearly finished is the governance document spine:**
   BEP/EIR (`docs-panel.ts` + `check-registry.mjs`) and MIDP/TIDP (`deliverables-panel.ts`). Nobody in this
   feed — and no incumbent — treats the BEP as executable. Karim's post is a 25-comment public demand for
   exactly the product that is 70% built in this repo.
4. **The credibility gap is exposure, not capability.** BIMVAQ ships a trial link and asks for feedback.
   Sentinel has 99 tests, an immutable ledger and no one outside the pilot has touched it.

---

## Part III — Ranked upgrade set

> **Status, 2026-09-15 (same day).** P1, P2, P3, P5, P6, P7 and P8 below are **built, tested and
> verified** (640/640, build clean); see `.superpowers/sdd/progress.md` for what landed where.
> Migrations 0025–0027 are applied live. **P4 (the Revit add-in) is not built** — it needs a Windows
> session with the .NET SDK. Still open: deliverable dependencies, the WebMCP browser surface, and
> UI for the delta and IDS-compiler routes. A security hole was found and closed during the work —
> see the 2026-09-15 addendum in `SECURITY_AUDIT_2026-07.md`.


### P1 · The Executable BEP — "how many pages actually control the project?"

*Direct from Karim. Built on `docs-panel.ts`, `check-registry.mjs`, `binding-suggest.mjs`, `bimdocs-*`.*

- **BEP Executability Score.** For each document: `% of sections bound to a live check` + counts of
  *narrative-only* sections. The panel already renders per-section check results; this is the roll-up.
- **The strip test, as a button.** "Show me only the clauses that control production" → a filtered view of
  bound sections; everything else greys out as *reference material, not plan*. Exportable one-pager.
- **Every deliverable needs Owner · Date · Purpose.** Purpose = *which decision this information supports*
  — a required field, and a check that fails when it is missing. This is the line nobody else draws.
- **Close the five admitted gaps** in `check-registry.mjs`, in this order of value:
  1. `roles.responsibility` — model task teams + a responsibility matrix; container authorship stops being
     free text. (Unlocks *who*.)
  2. `midp.review` — a review/approval state on deliverables, evidenced from the ledger. (Unlocks
     *who reviews*.)
  3. `midp.distribution` — a transmittal object. (Unlocks *who received it*.)
  4. `loin.levels` — LOIN per stage × discipline, so the IDS spec stops being bridge-wide. (Unlocks
     *how much information, when*.)
  5. `federation.breakdown` — a declared expected-model list to check the federation against.
- **Rename in the UI to Information Production Plan (BEP)** and say why. It is a positioning statement, it
  costs nothing, and it rides the ISO 19650 revision conversation.

### P2 · MIDP/TIDP as the live spine — programme-aware

*Built on `deliverables-panel.ts` + `deliverables-logic.mjs`. Status is already derived, never stored — keep that.*

- **TIDP → MIDP hierarchy.** Today the list is flat. Model TIDPs per task team, rolling up into the MIDP.
  This is the exact distinction Mahmoud's audience could not articulate — shipping it *is* the explanation.
- **Rule-based deliverable↔container binding, not manual links.** Steal Forma's property-match rule so bindings
  survive new versions and auto-apply to newly matching containers.
- **Dependencies between deliverables**, so a slip propagates instead of sitting in one row.
- **Programme import + rebaseline diff.** Import P6/MSP/CSV dates; on re-import, produce
  *"the programme moved 3 weeks → these 14 deliverables are now late, these two gates shift."* This answers
  Karim's sharpest point — a BEP whose dates have no relationship to the dates the project actually runs on —
  and Ayman's "the schedule died and BIM kept scheduling against it."
- **Weekly Information Delivery Status report, auto-generated.** Exceptions + late + in-WIP + evidence. This
  is a deliverable of the BDS retainer that currently costs manual hours. Ship it and it pays for itself.

### P3 · The agent gate — the referee for AI-authored BIM

*Built on the `/propose` API, `mcp-server.mjs`, the hash-chained ledger.*

- **Actor identity on every proposal:** human vs agent, model name/version, prompt hash, tool. The ledger
  already records the verdict; record *who or what proposed it*. This is the direct answer to
  "liability wrapped in a costly construction error."
- **No-pass-no-write, enforced at the API** — an agent cannot commit to a governed container without a
  passing verdict. That is the product sentence: *"Generate however you like. It doesn't become real until
  it passes."*
- **A shareable verdict receipt** — hash + link + timestamp, provable to a client. The public artefact of the
  golden thread.
- **WebMCP surface on the WebApp** (the That Open / Vedant Desai post). Expose the viewer's own functions so a
  browser agent can *propose → get a verdict → fix → re-check* inside the governed loop, instead of editing a
  model with nothing watching. That post is the template; being the *governed* version of it is the story.

### P4 · Revit-side parity with BIMVAQ — keep the context, act where the model can change

- **Fix-in-place from a BCF issue:** select the failing elements from the issue, propose the parameter fix,
  apply, re-check — without leaving the session. (BIMVAQ's exact pitch; Sentinel has the BCF sync already.)
- **Family / type naming manager** with propose → review → rename-selected, standard built in (not a CSV
  round-trip). The Phase 0 pyRevit ruleset already encodes BDS family naming — port it, and it fits the
  request/approve loop that is Sentinel's differentiator over passive checkers.

### P5 · Documents → IDS compiler

EIR/BEP in, executable IDS out (`bimdocs-ingest.mjs` + PdfPig already in the add-in). This is the loop that
makes P1 more than reporting: the clause that says *"all fire doors shall carry a FireRating"* becomes the
check that enforces it, in Revit and on the web, from one source. It is also the office-agnostic **Base
template** the roadmap already lists as next — same work, better framing.

### P6 · Derivations, not products (hold the line)

Keep 4D/5D/6D thin. One high-value derivation already exists in `sentinel-core`
(`revision-diff` / `revision-cost` / `revision-carbon`) and is not surfaced: **a per-publish delta report** —
*"this revision added 14 t CO₂e and 22k JOD."* That is a headline output, owns no cost or EPD data, and is
the traceability principle from the #befreeagain 5D post applied to change rather than to totals.

### P7 · Open the verdict (and use the That Open channel)

Publish the ruleset + verdict schema and a tiny JS client so **any** app on That Open Engine can call the
referee and display a verdict. Every proposer in Cluster 4 becomes a potential consumer. Charlie Deane's
"pool our efforts into one platform" is an invitation; the neutral, open governance layer is the one piece
of that platform nobody is claiming — and the Founding Member seat is the distribution.

### P8 · Ship something public within two weeks

The Sandbox artifact already exists. Package one narrow free tool — a **BEP integrity check** (upload a BEP,
get the executability score + the dead-clause list) is the sharpest, because it is the P1 story in one
screen and it has a 25-comment audience waiting under Karim's post. BIMVAQ is in market with a 48-hour
trial. Sentinel needs a thing strangers can touch.

---

## Part IV — Unfreeze sequence (suggested)

| Week | Do | Why now |
|---|---|---|
| 1 | P1 score + strip test + Owner/Date/Purpose required field | Smallest edit-to-story ratio; all UI plumbing exists |
| 1–2 | P2 TIDP→MIDP hierarchy + weekly status report | Pays for itself inside the BDS retainer immediately |
| 2 | P8 public BEP integrity check | Puts something touchable in the world while the thread is live |
| 3–4 | P1 `roles.responsibility` + `midp.review` | Turns the two biggest "not checkable" admissions into checks |
| 4–6 | P3 actor identity + no-pass-no-write + verdict receipt | The AI-liability story, while every viral post is asking for it |
| Parallel | P4 fix-in-place + family naming | Daily value on the studio floor; keeps pilot momentum |
| Later | P5 IDS compiler → Base template · P6 delta report · P7 open verdict | Sequenced after the spine is provable |

**The one-line story for the quarter:** *Everyone is building tools that propose. Sentinel is where a BEP
stops being a PDF and starts being the thing that decides what is allowed to become real.*

---

## Sources

All 24 items supplied by Yazan, 2026-09-15. Primary references used above:
Karim L Maghraby (BEP / Information Production Plan) · Mahmoud Mostafa (TIDP & MIDP) ·
Ala'a Albozom → Ghufran Khalil (BIMVAQ) · Nicolas Catellier (Astra GPT-6 detailing + critique thread) ·
Kristijan Vilibić (MODELi; Fable 5 → Revit) · Charlie Deane (Superplan) · Amar Hanspal (Motif Design) ·
Islam Khalil & Mostafa ElAshmawy (Forma Schedule 4D) · Philippe Bédard (Prevu3D scan→IFC) ·
Chaitanya Bharech (Blender MCP) · Hamza Arshad (BIM Naming Manager) · James Gray (AUTOM8 Labs family gen) ·
Dr. Ibrahim Fahdah (voice agent) · Mohammed Azif (FragmentsUnity/UE) ·
That Open Company ×4 (WebMCP fire-rating fix · prompt-built clash app · Pic on Site · 5D traceability) ·
Geopogo & arch_ai_lab (Instagram, Claude×Revit workflows) · Meng To (Fable 5.1) ·
Ahmed Maher Aly (free-claude-code proxy — flagged, not adopted) · eng.mo.ashraf (BIM portfolio).

---

## Part V — Build log & handover (2026-09-15)

### Shipped this session — P1.a, the Executability Score + strip test

- **`WebApp/bridge/executability.mjs`** (new, pure). `classifySection()` sorts every BEP/EIR clause into
  **controlling** (bound to a check the registry can evaluate) · **declared** (bound only to a
  `PLANNED_CHECKS` id — an honest coverage gap, *never* counted as control) · **narrative** (unbound, or
  bound only to unknown ids, which are named in the reason). `buildExecutability()` returns the summary
  (`sections / controlling / declared / narrative / unowned / score`), a per-section breakdown, and
  `strip_test: { keeps, declares, strips }` — Karim's test as a payload.
  Honesty invariants held: an empty document scores `null` **with a reason**, never `0%`; `declared` is
  never folded into `controlling`; `SCORE_NOTE` travels with every response stating that this measures
  *wiring, not compliance* — a wired clause can still fail.
- **`WebApp/bridge/executability.test.mjs`** (new). 13 assertions across both functions.
- **`WebApp/bridge/bimdocs-store.mjs`** — added `executabilityReport(key, docId)`; read-only, no audit row,
  same posture as `complianceReport`. Imports `CHECKS` alongside the existing registry imports.
- **`WebApp/bridge/bcf-service.mjs`** — `GET /bimdocs/:key/:docId/executability`.

**Verification:** the 13 assertions were run directly under Node and all pass; `bimdocs-store.mjs` and
`bcf-service.mjs` both pass `node --check`. Vitest could **not** be run from the Linux side — `node_modules`
holds the Windows rollup binary, so `npx vitest` fails with `MODULE_NOT_FOUND` on
`rollup/dist/native.js`. **Run `npm run test` on Windows to execute `executability.test.mjs` in CI form.**

**Not yet wired:** the UI. `WebApp/src/setups/docs-panel.ts` needs a score bar + a strip-test view calling
the new endpoint — the panel already has the fetch idiom (`api("/…")`) and the status-colour vocabulary.

### Next, in order (unstarted)

1. **P1.b — Owner · Date · Purpose.** Migration `0025`: add `purpose` to `deliverables`; extend
   `validateRow()` in `deliverables-store.mjs`; new check `midp.plan_completeness` failing any deliverable
   missing owner, due date or purpose. This is the second half of Karim's test.
2. **P1.c — close the five `PLANNED_CHECKS`.** Cheapest honest path is one new
   `bridge/governance-store.mjs` over the existing generic `bridge_docs` store (`docGet` / `docInsert` /
   `docReplaceIfField` in `cde-store.mjs`) holding four project-level registers — task teams,
   LOIN matrix (stage × discipline), transmittals, expected-model list — plus per-version review records,
   with pure classifiers in `governance-logic.mjs`. Order of value:
   `roles.responsibility` → `midp.review` → `midp.distribution` → `loin.levels` → `federation.breakdown`.
   Each one moves a line out of `PLANNED_CHECKS` and into `CHECKS`.
3. **P2 — MIDP/TIDP spine.** TIDP = deliverables grouped by task team (`GET /deliverables/:key/tidp`);
   `depends_on` column + `blocked_by` derived in `deriveStatus()`; `match_pattern` so binding survives
   renames (note: Sentinel already beats Forma here — matching is at *read* time, so links cannot go
   stale); `POST /deliverables/:key/rebaseline { rows, dry_run }` returning the programme-shift diff before
   writing; weekly delivery-status report export.
4. **P3 — agent gate.** Actor identity (human/agent, model, prompt hash) on `/propose`;
   no-pass-no-write; verdict receipt; WebMCP surface on the WebApp.
5. **P4–P8** as ranked in Part III.

*Session note: work paused here on budget, not on doubt — the sequence above is the agreed order.*
