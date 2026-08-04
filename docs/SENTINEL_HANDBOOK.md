# Sentinel — Field Handbook

*A map of everything Sentinel does: every tool, what it's for, when to reach for it, and who uses it — across the Revit add-in, the web app, the bridge, and the shared core. Written 2026-07-25 from the actual codebase.*

---

## 1. What Sentinel is

Sentinel is a **governance layer for BIM delivery** — a referee that sits between the people who *make* the model and the people who *review and consume* it, and enforces the office's standards and the project's requirements at every handoff. It turns "trust me, it's fine" into "here is the recorded verdict."

It has **four parts**, and almost every feature is one of these wearing a different hat:

| Part | What it is | Who lives here |
|---|---|---|
| **Revit add-in** (`SentinelAddin/`, C#) | The authoring side. A Sentinel ribbon tab inside Revit with 4 panels of tools. | Modellers, coordinators |
| **Web app** (`WebApp/src/`, TypeScript + That Open Components) | The review/coordination side. A browser BIM viewer + a common data environment (CDE), no Revit needed. | Reviewers, clients, QS, everyone without Revit |
| **The Bridge** (`WebApp/bridge/`, Node) | The connective tissue. Uploads models, serves the CDE/BCF/AI, runs the shared brain server-side. | Nobody directly — it's plumbing |
| **sentinel-core** (`WebApp/src/sentinel-core/`, pure TS, mirrored to C#) | The shared rules engine. One implementation of every rule, used by *both* Revit and the browser so a rule means the same thing on both sides. | Nobody directly — it's the brain |

**The single most important idea:** a rule (a clash test, an IDS check, a naming convention, a guideline type-choice) is written **once** in `sentinel-core`, tested there, and then mirrored into Revit as a C# port. That's why the web app and the add-in never disagree about whether something passes.

---

## 2. The spine — how a project flows through Sentinel

The tools aren't a random pile; they follow the delivery lifecycle. Read top-to-bottom:

```
  DRAWINGS / PHOTOS / DWGs
          │
          ▼   ┌─────────────────────────── AUTHOR (Revit add-in) ───────────────────────────┐
   Datum from Drawings ──▶ Ghost Builder / Photo Massing ──▶ model the rest by hand
   (levels + grids)         (LOD 200 geometry, governed by the Office Guideline)
          │
          ▼   ┌─────────────────────────── VALIDATE (Revit add-in) ─────────────────────────┐
   Scan Now · Scorecard · IFC Pre-Flight · Family Health · MEP Openings · Clash Manager
          │
          ▼   ┌─────────────────────────── GATE (Revit add-in) ─────────────────────────────┐
   Governed Publish ── export IFC → delivery gate → IDS adjudication → immutable verdict
          │                                                    │
          │  (pass) publishes + versions to the CDE            │ (fail) auto-opens BCF issues
          ▼                                                    ▼
  ┌───────────────────────── REVIEW & COORDINATE (Web app) ───────────────────────────┐
   Viewer · Issues (BCF) · RFI · Clash Register · CDE state machine · Versions
          │         ▲                                          │
          │         └───────── issues sync live back to Revit (SSE) ──────────┘
          ▼
  ┌───────────────────────── LIFECYCLE & HANDOVER (Web app) ──────────────────────────┐
   Timeline (4D) · Cost (5D) · Carbon (6D) · COBie (handover) · Owner · Tender
```

The **Bridge** carries the model and messages between the two sides. **sentinel-core** is the shared judgement used at every "validate/gate/check" step on both sides.

---

## 3. The Revit add-in — tools by ribbon panel

Everything here runs *inside Revit*, on the model open in front of you. The ribbon has four panels.

### 3.1 Coordinate — live coordination + issues

| Tool | What it does | When | Who |
|---|---|---|---|
| **Show Panel** | Opens the dockable "Live Coordination" panel — the running list of compliance violations for the open model. | Keep it open while modelling. | Modeller, Coordinator |
| **Change Requests** | Review pending change requests; **approve** keeps the change, **reject** reverts it (Sentinel captured the old value). | When a governed element was edited and needs sign-off. | Coordinator |
| **BCF Issues** | The issues raised by non-Revit people on the web, in Revit. Double-click zooms to the element + saved camera. | Working through coordination comments. | Modeller, Coordinator |
| **Clash → Clash Manager** | Native clash detection (RVT + IFC links vs structure), severity-graded, with a 3D clash view and BCF export. | Before a coordination milestone. | Coordinator |
| **Clash → Clash Register** | Read-only view of the team-wide clash register recorded on the web (status + volume). | To see the shared clash state without re-running. | Modeller, Coordinator |
| **Review Flag** | One-time setup: creates the `ZZZ_ReviewStatus` flag parameter used by the review workflow. | Once per project, by the coordinator. | Coordinator |

### 3.2 Validate — compliance, IFC readiness, family hygiene

| Tool | What it does | When | Who |
|---|---|---|---|
| **Scan Now** | Full compliance scan against the active ruleset. | Any time you want the current violation list. | Modeller, Coordinator |
| **Health Scorecard** | A weighted executive compliance score with a per-domain breakdown. | For a status read / a client update. | Coordinator, Manager |
| **Rule Set** | Shows the *effective* ruleset (master version + this project's overlay). | To see what's actually being enforced. | Coordinator |
| **IFC Gate → IFC Pre-Flight** | Audits `IfcExportAs` and mandatory property sets **before** you export IFC. | Right before an IFC export. | Modeller |
| **IFC Gate → IFC Delivery Gate** | Exports + certifies an IFC against the delivery contract (EIR-as-code). **FAIL = do not upload.** | At a formal deliverable. | Coordinator |
| **Family Health → Sanitize .rfa** | Audits a family file (geometry budget, nested CAD, shared params) **before** loading it. | Before bringing in an external family. | Modeller |
| **Family Health → Heal Loaded Families** | Scans families already in the project; injects missing shared parameters and reloads silently. | To fix a model that's already polluted. | Coordinator |
| **MEP Openings** | Finds linked MEP-vs-structure intersections and places provision-for-void families. | Structural/MEP coordination. | Coordinator, Structural |

### 3.3 Publish — governed delivery (the flagship) + ungoverned options

| Tool | What it does | When | Who |
|---|---|---|---|
| **Governed Publish** ⭐ | The flagship. **One action**: export the active view to IFC → run the delivery gate → adjudicate against the project IDS → record the verdict **immutably** → publish + version **only if it passes**. A fail is recorded and each failing requirement **auto-opens as a BCF issue**, live-synced to the web and back into Revit. | Every real deliverable. This is the referee. | Coordinator |
| **Publish → Quick Publish** | Ungoverned: export the active view to IFC into the outbox; the bridge uploads it. **No verdict.** | Quick share of work-in-progress. | Modeller |
| **Publish → Auto-Publish on save** | Toggle push-on-save: every save/sync re-exports + uploads. Throttled. | Turn on for a live-shared model; off for very large ones. | Modeller |
| **Publish → Publish Sheets** | Renders all Revit sheets to PNG (sheets don't survive IFC) and serves them to the web app's Sheets tab. | When reviewers need the actual drawings, not just the model. | Modeller |

### 3.4 Standards & Build — office standards + generation

| Tool | What it does | When | Who |
|---|---|---|---|
| **Standards → Project Setup** | Configure standards sources: master ruleset + template paths, saved to the project or this machine. Also sets the **Ghost source folder** the generation tools read. | First thing on a new project/machine. | Coordinator, Standards lead |
| **Standards → Build Office System** | Extract worksets + shared parameters from the active "golden" model, review them, build them into this model, and enforce them in the ruleset. | Turning an exemplar model into a reusable standard. | Standards lead |
| **Standards → Apply Standard** | Load a saved standards pack and build it into the active model — the golden→blank round-trip. | Starting a new model from the office standard. | Modeller |
| **Standards → Ingest Docs** | Read office-standards documents (PDF/text/CSV) with a **local** LLM and extract worksets + shared parameters into a reviewable pack. *Requires Ollama.* | Converting a written standard into an enforceable one. | Standards lead |
| **Datum from Drawings** | Datum-first modelling: read the **levels** from a section's levels layer and the **grids** from a plan's grid layer, then create them — real floor-to-floor heights and a real column grid, measured off the drawings. Reads DWGs straight from the project folder. | The first modelling step on a new project. | Modeller |
| **Ghost Builder** | Build LOD 200 geometry from a 2D DWG plan: a **local** LLM maps CAD layers to families, walls are paired to centrelines + thickness, and the **Office Modelling Guideline** picks the exact type (creating it if the template lacks it). Governed + audited. | When you have a DWG plan to model from. | Modeller |
| **Photo Massing** | Estimate a building envelope from photos/renders/elevations with a **local** vision model, **review and correct the numbers**, then build it through the *same* governed placement. The governed answer to "photo → model." | Early massing when there's no DWG. | Modeller |
| **ROI Dashboard** | Man-hours and money saved by Sentinel's automated interventions. | For a value/status conversation. | Manager |

**Behind the ribbon (automatic):** on document open Sentinel runs a baseline scan; on **sync** it re-scans, checks the central file name against the ISO 19650 / BDS convention, and refreshes the web copy; on **save** it can auto-publish. A global **failure interceptor** ("Revit Doctor") catches native warnings.

---

## 4. The web app — sections by lifecycle

The web app is a browser BIM environment (viewer + CDE) built on That Open Components. **No Revit required** — this is where everyone else works. The left activity bar is ordered as the **project lifecycle**.

| Section | What's in it | Primarily for |
|---|---|---|
| **Projects** | The projects hub — pick/switch/manage projects. The landing tab. | Everyone |
| **Guide** | In-app guidance / help panel. | New users |
| **Copilot** | The AI assistant (see §5). | Everyone |
| **BIM Tools** | The viewer toolkit: **Model** loader, **Properties**, **Project Browser** (element tree), **Visibility** (isolate/hide), **Plans** (2D), **Sheets** (the rendered Revit sheets), **Views** (saved camera views), **Clash** panel. Plus viewer tools: measure, section/clip, exploded view, camera views. | Reviewer, Modeller |
| **Coordination** | **Issues** (BCF: create + list + details, live-synced to Revit), **RFI**, **CDE** panel (the ISO 19650 state machine), clash. | Coordinator, Reviewer |
| **Lifecycle** | **Timeline** (4D sequencing), **Cost** (5D), **Carbon** (6D embodied carbon), **COBie** (handover data), **Owner** (owner dashboard), **Tender** (bid packages). | QS, Sustainability, Client, Manager |
| **Explorer** | The spatial tree + properties (platform built-in). | Reviewer |
| **Assets** | **Governed version history** (model version · uploader · when · click-through history) on top, then the model loader + objects list. The project's version home. | Coordinator, Client |
| **Data** | The element data table. | Reviewer, QS |
| **Standards** | The standards **Packs** panel — the office standards as data. | Standards lead |
| **QA** | The QA panel — checks/status. | Coordinator |
| **Settings** | App settings, auth, keys. | Everyone |
| **Reality Capture** *(viewer mode)* | A point-cloud / splat / photogrammetry viewer for as-built capture. | Reviewer, Surveyor |

The web app also carries a **live issue loop**: issues raised here stream to Revit over Server-Sent Events and back, so a comment made in the browser lands in the modeller's BCF Issues panel without a manual refresh.

---

## 5. The AI Copilot

A chat assistant that can *do things*, not just answer. It combines two modes and several models.

- **Modes:** **Copilot** (answers, explains, suggests) and **Agent** (takes actions through tools). The user switches between them.
- **Providers (5):** **Claude** (Anthropic), **Gemini** (Google), **NVIDIA Nemotron**, **Kimi** (Moonshot), and **local** (Ollama). Keys belong to the **firm**, live only on the bridge (never the browser), and cloud providers are **opt-in** — the default is local so nothing leaves the machine unless you choose it.
- **Governed tools (11):** the agent doesn't get raw database access — it gets a fixed set of governed actions, each going through the same rules as a human:
  `list_projects` · `list_containers` · `list_folders` · `create_folder` · `list_revisions` · `list_transmittals` · `list_issues` · `raise_issue` · `propose_elements` · `read_audit` · `set_live_version` · `transition_container`.

So the Copilot can navigate the CDE, raise an issue, propose elements, set the live model version, or move a container through its ISO 19650 state — all recorded in the audit trail exactly as if a person did it.

---

## 6. The Bridge & the shared core

### 6.1 The Bridge (Node server, `WebApp/bridge/`)

The bridge is the only thing that talks to the outside world. Its endpoints:

| Endpoint group | Serves |
|---|---|
| `/events` (SSE) | The live issue/coordination stream. |
| `/ai/*` (`providers`, `models`, `tools`, `run-tool`, `chat`) | The Copilot — provider list, model list, tool registry, tool execution, chat. |
| `/cde/*` | The CDE: projects, containers, folders, files, versions, transitions, snapshots, audit, transmittals, element-graph, propose. The ISO 19650 heart. |
| `/projects/:pid/topics/*` | BCF issues (topics, comments, viewpoints). |
| `/clash/*` | The team-wide clash register. |
| `/sheets`, `/sheets/img/*` | The rendered Revit sheet images. |
| `/ifc` | IFC upload/fetch, and IFC→fragments conversion for the viewer. |
| `/files` | File listing. |

Supporting modules: `thatopen-client` (uploads to That Open Platform), `upload-ifc` / `watch-outbox` (the Revit outbox → cloud pipeline), `ifc-to-frag` (convert IFC for the viewer), `bcf-service` (the server itself), `cde-store` (CDE persistence), `ai-gateway` + `ai-tools` (AI), `bridge-auth`, `mcp-server` (exposes Sentinel's governance tools over MCP).

### 6.2 sentinel-core — the shared brain (`WebApp/src/sentinel-core/`)

Pure, dependency-free TypeScript (no DOM, no Revit), each with tests, and each mirrored to a C# port so Revit runs the *same* logic. The modules:

| Module | Judgement it owns |
|---|---|
| `rule-engine`, `scanner`, `scorecard` | Compliance scanning + scoring. |
| `ids`, `ids-parse`, `gates` | IDS parsing + the delivery-gate adjudication. |
| `clash` | Clash detection geometry. |
| `guideline`, `layers` | The Office Modelling Guideline (layer → type) + DWG layer standard. |
| `naming` | Naming-convention validation. |
| `quantities`, `schedule` | Quantity takeoff + scheduling. |
| `cost`, `revision-cost` | 5D cost + cost deltas between revisions. |
| `carbon`, `revision-carbon` | 6D embodied carbon + carbon deltas. |
| `cobie` | COBie handover data. |
| `element-graph` | The governed element graph (what relates to what). |
| `ifc-writer` | IFC generation. |
| `revision-diff` | What changed between two model versions. |
| `massing`, `massing-plan` | Photo-massing estimate + build plan. |

Plus C#-only pure modules on the Revit side that follow the same discipline (offline-tested, no Revit types): `DatumFromDrawing`, `WallPairing`, `TypeNameParse`, `GuidelineMatcher`, `MassingPlanner`.

---

## 7. The governance model — the referee thesis

This is *why* Sentinel exists, and it's worth stating plainly.

Most BIM tools help you **make** things. Sentinel's distinctive job is to **judge** them at the boundary and keep an **immutable record** of the judgement:

1. **One rule, both sides.** Every check lives in `sentinel-core`, so Revit and the web agree.
2. **The gate.** *Governed Publish* is the referee: nothing reaches the CDE as an official version unless it passed the delivery gate + IDS. A pass publishes and versions; a fail is recorded and each failing requirement becomes a BCF issue.
3. **The record.** Verdicts are immutable and carry **provenance** (was this from a human, a photo, an LLM?) and a **source/verdict badge** in the audit timeline. A photo-massing element is never confidence-1; an LLM proposal is marked as such.
4. **The loop.** Issues raised anywhere (web, gate failure, review) sync live to Revit and back, so coordination is one shared conversation, not email.

Everything generative (Ghost Builder, Photo Massing, the Copilot agent) feeds *into* this governed pipeline rather than around it — that's the deliberate difference from ungoverned "AI draws your building" demos.

---

## 8. Who uses what — role matrix

| Role | Lives mostly in | Their key tools |
|---|---|---|
| **Modeller** (Revit author) | Revit add-in | Datum from Drawings, Ghost Builder, Photo Massing, Scan Now, Pre-Flight, Quick Publish; web: BIM Tools, Issues |
| **BIM Coordinator / Manager** | Both | Governed Publish, Clash Manager, Scorecard, Change Requests, Rule Set; web: Coordination, CDE, Assets, QA |
| **Reviewer / stakeholder** (no Revit) | Web app | Viewer, Properties, Issues, RFI, Sheets, Reality Capture |
| **Client / Owner** | Web app | Owner dashboard, Assets (versions), Scorecard, Timeline |
| **QS / Commercial** | Web app | Tender, Cost (5D), Data table, Quantities |
| **Sustainability** | Web app | Carbon (6D) |
| **Standards lead** | Revit add-in | Build Office System, Apply Standard, Ingest Docs, Project Setup, the Guideline + Layer standard files |

---

## 9. Where the standards live (the files you own)

The behaviour of the generation + validation tools is driven by editable data files, not hardcoded logic:

| File | What it defines |
|---|---|
| `SentinelAddin/Resources/bds-guideline.json` | **Office Modelling Guideline** — which family/type per element (layer + material + level), tags, view templates, view naming. |
| `SentinelAddin/Resources/bds-layers.json` | **DWG Layer Standard** — which CAD layer maps to which Revit category/family, aliases, what to ignore. |
| `demo/bds-pilot/bds-type-catalog.json` | The **type catalogue** harvested from the real template (1,434 types) — the guard that stops the tool inventing types the template lacks. |
| `demo/bds-pilot/bds-ids.json` | The project **IDS** (the requirements the gate adjudicates against). |
| `WebApp/bridge/naming-ruleset.json` | The **naming convention**. |
| `WebApp/src/sentinel-core/*.ts` | The **logic** that reads all of the above (the engine). |

These are the levers: the tools are only as strong as the standard in these files.

---

## 10. Honest status (as of 2026-07-25)

- **Solid & live-verified:** the governed publish loop, clash, IDS gate, the web CDE + issue loop, Ghost Builder DWG→walls, guideline type-creation (walls).
- **Built, needs a live run:** Datum from Drawings (depends on your layer names), Photo Massing placement, floor/column type-creation.
- **Thin / deliberately parked:** the guideline covers walls well but doors (sizing rule), floors, columns, windows are one-liners; the guideline's **graphics/views half is data only** — no tool applies tags/views yet; Datum and Ghost Builder don't hand off to each other yet.

The next structural work isn't more tools — it's (a) completing the *standard* in the files above, and (b) making the three Standards & Build tools one continuous chain (datum → model → annotate).
