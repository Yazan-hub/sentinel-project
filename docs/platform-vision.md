# The Sentinel Platform — from a Revit plugin to a project-delivery operating system

> **Thesis.** A construction project is authored dozens of times across its life — re-modeled, re-typed,
> re-checked at every handoff — because the tools don't share a source of truth and the standards that
> should bind them live in dead PDFs. Sentinel already fixes this *in miniature* inside Revit. The
> platform is that fix, generalized across the whole lifecycle: **one project, one source of truth,
> tender → handover, 2D–7D, open and connectable.**

---

## 1. Market analysis — where AEC/BIM software actually breaks

The AEC software market is large, entrenched, and *structurally* broken in ways feature-releases don't fix.
Six bottlenecks, in order of how much money they burn:

### B1 — Fragmentation & the interoperability tax (the root cause)
A single project touches 15–30 tools that don't share a data model: authoring (Revit, ArchiCAD, Tekla,
Civil3D), analysis (ETABS, Robot, IES), coordination (Navisworks, Solibri), the CDE (ACC/BIM360, Trimble
Connect, Aconex), issues (BIMcollab), scheduling (P6, MS Project, Synchro), cost (CostX), FM (Maximo,
Archibus). Every boundary is a lossy file export. The classic NIST study (GCR 04‑867, 2004) put the cost of
*inadequate interoperability* in U.S. capital facilities at ~**$15.8 billion/year** — two decades on, the
seam count has only grown. Data doesn't flow; it's re-keyed, and dies a little at each gate.

### B2 — The standards & governance gap (Sentinel's opening)
Every office reinvents its standards; EIRs and BEPs are PDFs nobody executes; compliance is checked manually,
late, and inconsistently. Naming, worksets, parameters, LOD, deliverable rules — all tacit knowledge in
someone's head. There is no "compile error" for a non-conforming model until a coordinator finds it weeks
later. **This is the exact gap Sentinel's Standards Engine + delivery gate close** — and nobody else treats
standards as executable code.

### B3 — Lifecycle discontinuity (the dimensions are islands)
2D drawings drift from the 3D model; 4D schedules (P6) aren't linked to elements; 5D cost is a separate
spreadsheet universe; 6D sustainability and 7D FM/handover are aspirational for most projects. The "golden
thread" the owner paid for arrives as a pile of PDFs and an as‑built model FM can't use. Value evaporates
precisely where BIM was supposed to deliver it — operations, which is 80% of an asset's lifetime cost.

### B4 — Access & cost lock‑in
Named‑user subscription pricing and format lock‑in (chiefly Autodesk) generate real, widespread industry
resentment. Non‑modelers — clients, contractors, inspectors, FM teams, the global South — are priced out of
even *viewing* the model. Coordination stalls because the people who need to flag a problem don't hold a
license. (The open‑source viewer movement — **That Open**, which Sentinel already runs on — is the market's
answer, and a wedge.)

### B5 — Productivity & rework
McKinsey's *Reinventing Construction* (2017) found construction labour productivity grew ~**1%/yr** for two
decades while the total economy grew ~2.8%, and named the sector among the least digitized. Industry estimates
routinely put rework at a double‑digit percentage of contract value. Most of that waste is coordination and
information failure — not physical.

### B6 — AI is bolted on, not grounded
The current wave of "AI in BIM" is mostly demos: chatbots that hallucinate parameters, generative geometry
with no standards awareness. None are *grounded* in a project's real model + enforced standards, and none can
*act* safely. A grounded, standards‑aware, project‑wide copilot is an open lane.

**The strategic read:** the incumbents are either **silos** (authoring tools) or **heavyweight file‑centric
CDEs** (ACC, Aconex, Procore) that store documents but don't understand them and don't enforce anything. The
opening is not to out‑feature Autodesk. It's to be the **open, data‑centric, standards‑enforced, AI‑native
connective tissue** that sits *above* the tools people already use and makes the project a single, living,
governed dataset.

---

## 2. The idea, developed — a project-delivery operating system

Your A‑Z platform is right, and it's bigger than a CDE. Framed precisely:

> **A data‑centric platform where the project lives as one governed dataset for its entire life, every
> lifecycle stage is a gated workflow on that dataset, every "dimension" (2D–7D) is a *view* of the same
> data rather than a separate tool, and the whole thing is open — connectable to Revit, IFC, P6, cost and
> FM systems — so it augments the existing toolchain instead of replacing it.**

Three principles keep it from becoming "yet another silo":

1. **Data‑centric, not file‑centric.** The unit is the *element* (and its properties, relationships, history),
   not the *file*. Dimensions and stages are queries/views over the element graph. (Sentinel's `ElementFacts`
   adapter is already this seam.)
2. **Governed by standards‑as‑code.** Every stage gate enforces the office/client standard mechanically —
   the same standards‑pack that builds the template checks the model and certifies the deliverable. Governance
   is executable, not advisory.
3. **Open & connectable.** IFC/BCF/openCDE/bSDD in and out; a connector layer for the authoring, schedule, cost
   and FM tools. The platform is the spine; the tools are limbs. **Winning = becoming the connective tissue.**

### The dimensions, as views on one model
| Dim | What it is | Platform view (not a separate tool) |
|----|-----------|-------------------------------------|
| **2D** | Drawings, sheets, details | Generated/linked from the model; drift‑checked against 3D |
| **3D** | Federated geometry + semantics | The live model viewer (zero‑license web) — *exists today* |
| **4D** | Time / sequence | Schedule tasks linked to element sets; live simulation |
| **5D** | Cost / quantities | Quantities pulled from the model → live cost plan & BoQ |
| **6D** | Sustainability | Carbon/energy attributes on elements; whole‑life analysis |
| **7D** | Facility / O&M | Asset record + COBie handover; the maintained golden thread |

### The lifecycle, as gated workflows
`Tender → Design → Coordination → Construction → Handover → Operate` — each stage a workflow on the same
dataset, each boundary a **gate** that runs standards‑as‑code and won't pass non‑conforming data. (Sentinel's
IFC Delivery Gate is the first gate, already built; the pattern generalizes to every stage boundary.)

---

## 3. Platform architecture (layers)

```
┌───────────────────────────────────────────────────────────────────────┐
│  ACCESS         Zero-license web · role-based · client/contractor/FM    │
├───────────────────────────────────────────────────────────────────────┤
│  AI COPILOT     Grounded (ElementFacts + standards + issues) · agentic  │
│                 via a whitelisted tool registry · "LLM proposes,        │
│                 the deterministic engine disposes"                      │
├───────────────────────────────────────────────────────────────────────┤
│  DIMENSIONS     2D · 3D · 4D · 5D · 6D · 7D  — views on the spine        │
├───────────────────────────────────────────────────────────────────────┤
│  LIFECYCLE      Tender→Design→Coordination→Construction→Handover→Operate │
│  & GATES        each boundary enforces standards-as-code                 │
├───────────────────────────────────────────────────────────────────────┤
│  COORDINATION   Issues (BCF) · clashes · RFIs · approvals · versions     │
├───────────────────────────────────────────────────────────────────────┤
│  GOVERNANCE     Standards-as-code (packs) · QA scanner · delivery        │
│                 contracts · compliance certificates                     │
├───────────────────────────────────────────────────────────────────────┤
│  DATA SPINE     Single source of truth: element graph + properties +     │
│                 relationships + history (fragments/IFC + facts DB)      │
├───────────────────────────────────────────────────────────────────────┤
│  CONNECTORS     Revit (Sentinel plugin) · IFC/BCF · P6/MSP · cost · FM   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 4. Sentinel already seeds ~40% of this

This isn't a green field — it's a generalization of what's shipping today.

| Platform layer | Already built in Sentinel | Status |
|---|---|---|
| Data spine (element facts) | `sentinel-core` `ElementFacts` adapter (Revit + web) | ✅ |
| Governance — standards‑as‑code | Standards Engine (extract/review/build), rule engine, ruleset packs | ✅ |
| Governance — delivery gate | IFC Delivery Gate (EIR‑as‑code) | ✅ |
| Governance — QA | Scanner + Health Scorecard | ✅ |
| Coordination — issues | Zero‑license BCF portal (web ↔ Revit) + history | ✅ |
| Coordination — clashes | Clash Manager + BCF export | ✅ |
| 3D dimension + access | That Open web viewer, zero‑license | ✅ |
| CAD→BIM (design accel.) | GhostBuilder (2D DWG → LOD 200) | ✅ |
| Connector — Revit | The Sentinel add‑in itself | ✅ |
| Ingestion — documents | Tier‑2 PDF/LLM standards ingest | ✅ |
| AI copilot | designed, not built | ▢ next |
| 4D / 5D / 6D / 7D | not built | ▢ roadmap |
| Tender stage | not built | ▢ roadmap |

The platform is the **project shell** that unifies these into one multi‑project home, plus the missing
dimensions and stages.

---

## 5. Roadmap — Sentinel → Platform

**Phase 0 — Authoring‑side foundation (shipped).**
Standards Engine, QA + scorecard, GhostBuilder, IFC delivery gate, BCF portal, That Open viewer, clash manager.
*The governance + coordination + 3D layers exist.*

**Phase 1 — The project shell + spine (the platform is born).**
- Multi‑project home on the web; a project = a governed dataset with a lifecycle state.
- Promote `ElementFacts` from per‑model to a persistent **project data spine** (facts DB).
- **Grounded Copilot v1** (read‑only, cites standards/issues) — the interface over everything.
- **5D quick win:** live quantities pulled from the model → a running BoQ/cost view (cheap, high‑visibility).

**Phase 2 — Time, cost, and gates across the lifecycle.**
- **4D:** link schedule tasks (P6/MSP import) to element sets; sequence simulation on the viewer.
- **5D:** full cost plan, rate libraries, quantity‑to‑cost, change tracking.
- Generalize the delivery gate into **stage gates** at every boundary (Design→Coord→Construction…).
- RFIs, submittals, approvals as first‑class coordination objects alongside BCF.

**Phase 3 — Handover & the golden thread (where owners get value).**
- **6D:** carbon/energy attributes; whole‑life analysis views.
- **7D:** asset register + **COBie handover**; the maintained as‑built the FM team actually uses.
- Owner/FM portal; the golden thread that survives past practical completion.

**Phase 4 — The front of the funnel + the ecosystem.**
- **Tender module:** RFPs, BoQ‑driven tenders, bid comparison — linked to the model from day one.
- **Connector marketplace** (P6, Solibri, cost engines, FM) and **Standards‑Packs marketplace**
  (forkable/sellable office & regional standards — a network‑effect moat).

**Business model:** open core (viewer + BCF free, à la That Open) → SaaS per‑project/seat for the governed
spine, gates, and dimensions → services (implementation, standards authoring) → marketplace revenue share.
This is the "company that delivers and manages projects and delivers real BIM implementation" — productized.

---

## 6. First version (the prototype)

Built tonight as a self‑contained artifact: **the Lifecycle Command Center** — one project moving A‑Z, the
2D–7D dimensions as views on a single model, the stage gates enforcing standards‑as‑code, and live‑looking
KPIs drawn from the exact concepts Sentinel already computes (health score, open issues, standards
compliance). It makes the thesis *visible*: the project living in one place, from tender to handover.

*See `standards-engine-spec.md` and `sentinel-next-gen-roadmap.md` for the layers already in motion.*
