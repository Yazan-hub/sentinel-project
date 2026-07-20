# Sentinel — Project Overview (for external review)

*A self-contained brief. Written to be handed to a reviewer for critique of strategy, architecture, security, and go-to-market. Current as of 2026-07-20.*

---

## 1. What Sentinel is

Sentinel is a **BIM (Building Information Modelling) governance system** for the AEC (architecture/engineering/construction) industry. Its one-line thesis:

> **"A model becomes TRUE here, and it's on the record."**

Concretely: architects and engineers author building models in desktop tools (Revit, ArchiCAD, Tekla). Sentinel is the layer *downstream* of authoring where a model is **validated** (against buildingSMART IDS — Information Delivery Specifications), **governed** (against the ISO 19650 information-management standard's state machine), **recorded immutably** (a hash-chained audit trail), and made **portable** (open export, no lock-in). It is deliberately **not** an authoring tool.

The strategic framing the team uses is the **"Governed Element Graph"** or **"referee layer"** — analogous to *GitHub for code* or *Stripe for payments*: let a thousand authoring tools and AI agents **propose** model changes; Sentinel is where their output becomes **true or is rejected**, deterministically. It aims to own the "disposer/referee" seat, not the "author/proposer" seat.

## 2. Why this seat is claimable (market thesis)

- The entire funded "BIM 2.0" startup wave (Motif ~$46M, Arcol, Snaptrude, TestFit, Higharc, Autodesk Forma, etc.) builds **authoring / review / visualization** — with essentially **zero governance, ISO 19650, CDE, or validation**. VC is ignoring the trust layer.
- The one web-native model-checker slot (Solibri's browser product, Verifi3D→Checkpoint) was **discontinued in April 2026**, leaving certified web-native IDS checking as nobody's product.
- Incumbent CDEs (Autodesk ACC, Aconex, Asite, Procore) can't easily take this seat without cannibalizing their per-seat / metered-API economics.
- **Speckle** is the closest philosophical competitor (data layer for AI), but ships *proprietary-rules* validation, not IDS + ISO 19650 states + immutable audit.

**Business model:** open-core (open-source schema + export; paid = govern-and-verify), **per-project unlimited-user** pricing (undercuts the ~€12–18k/yr a mid-size coordinator pays across 6–8 tools). **Go-to-market = ride the regulatory wave** — each mandate is a buying trigger: UK Building Safety Act "golden thread"/Gateways, Finland/Norway BIM-permit mandates (IDS-gated approvals), EU Data Act data-portability (the anti-lock-in weapon), embodied-carbon regulations (EPBD/CALGreen).

## 3. Architecture

A single git monorepo, two deployables plus a bridge:

- **`SentinelAddin/`** — a Revit C#/.NET add-in (the authoring-side plugin). SDK-style project multi-targeting Revit 2021–2027 from one csproj (net48 / net8 / net10 by version). Ribbon commands for governance (IFC Delivery Gate, Governed Publish), a DWG→LOD200 auto-modeler (GhostBuilder, uses a local Llama3 via Ollama), standards enforcement, clash, and BCF issue sync.
- **`WebApp/`** — a client-only Vite/TypeScript SPA hosted on the "That Open Platform" (an open-source BIM web platform). Browser-side only (lit, three.js, web-ifc, `@thatopen/*`). It renders models and hosts ~16 tool panels: 3D viewer, properties/browser/visibility, IDS validation (KF-B), a CDE/ISO-19650 panel, file versioning, clash, quantities (5D cost), carbon (6D), BCF issues, COBie, tenders/RFIs.
- **`WebApp/bridge/`** — a small Node service (no framework) that is the trust boundary. It runs the BCF-API 3.0 service, the CDE endpoints, the "propose" referee API, an MCP server for agents, and the IFC-upload watcher. It holds the secrets (platform token, Supabase key) that never touch the browser.
- **Supabase (Postgres)** — the single source of truth. 14 migrations: ISO 19650 CDE schema + state machine, RLS on ~10 tables, an immutable hash-chained `audit_log` (Postgres advisory-lock serialized, tamper-evident), file versioning, element snapshots, BCF topics, and a cross-machine event feed (poll-based, since the bridge can't hold a Postgres LISTEN over PostgREST).

**Governed core (`sentinel-core/`)** — pure, framework-free TypeScript validators (IDS adjudication, ISO 19650 gates, clash, quantities, carbon, revision-diff) with unit tests. The **same code runs in the browser and, bundled to `sentinel-core.mjs`, in the bridge** — so an agent's `POST /propose` and a user's in-browser check adjudicate identically.

## 4. The flagship: the Governed Publish loop

The one differentiated end-to-end seam (desktop → cloud → referee), just completed as a pilot:

1. **In Revit**, one **Governed Publish** button: export active view → IFC → run the **IFC Delivery Gate** (contract check) → **adjudicate** the model against the project's IDS via the bridge's `/propose` API → record the verdict to the immutable audit chain → **publish + version only if it passes**.
2. **In the browser** (zero install), the coordinator sees the new version with who/when, its ISO 19650 state, and a **✓/✗ verdict badge** linking to the hash-chained audit entry.
3. **On a reject**, each failing IDS requirement **auto-opens a BCF issue** on the failing 3D elements, live-synced back into Revit via SSE.
4. **Fix → re-publish → ✓ accepted**; the audit shows the full *rejected → fixed → accepted* trail.

Also exposed: a zero-dep **MCP server** and a **"propose API"** so AI agents/generators can propose elements and get a deterministic, immutably-recorded IDS verdict — the "referee for AI-generated BIM" play.

## 5. Current state (honest)

- **Working & verified:** the web app, bridge (all endpoints), the governed core (79 passing unit tests), the Supabase schema + RLS + immutable audit (verified via SQL), envelope encryption (zero-knowledge, server holds only a wrapped key), CI (GitHub Actions), the Revit add-in **compiles clean for 2025/2026** headlessly.
- **Security hardening done this month:** origin-gated CSRF, JWT-forwarding so a signed-in user's token drives RLS (armed + end-to-end verified), SECURITY DEFINER function hardening (closed an anon `cde_transition` bypass), all app state consolidated from per-machine JSON into Supabase (single source of truth, team-wide).
- **Not yet verified:** the unified Governed Publish command runs *inside live Revit* end-to-end — it's compile-only verified; a real Revit run is the remaining step. Single-operator today (multi-user RLS is built but the product story is single modeler + single coordinator).
- **Known residual risks:** the bridge can still fall back to a Supabase **service key** (full RLS bypass) for a few audit writes by design; the demo depends on a prepared model carrying specific IFC parameters; no BSI Kitemark / ISO 19650 certification yet (paperwork gap vs. certified CDEs).

## 6. Supply-chain / dependency note

Sentinel is built on **That Open Company's** open-source stack (`@thatopen/*`, web-ifc, fragments) — permissive MIT/MPL, safe to build on, but a sustainability watch-item (no public funding found; the platform is a bare dashboard).

## 7. What a review would be most useful on

1. **Strategy:** is the "referee/disposer seat" genuinely defensible, or does an incumbent (Autodesk Forma, a certified CDE, or Speckle) absorb it once governance matters?
2. **Wedge vs. focus:** the codebase spans a *lot* (governance, clash, 5D cost, 6D carbon, COBie, tenders, DWG auto-modeling, an AI copilot). Is that breadth a moat or a focus risk for a small team? *(Post-review doctrine — see STRATEGIC_REVIEW Part VI: 4D/5D/6D are thin **derivations off one shared quantities/snapshot spine**, integrating external cost/EPD data by reference, never owning it; clash is repositioned to **data clash** — IDS/parameter/contract contradictions — ceding geometric clash to Navisworks/Revizto. Engineering focus stays on the Governed Publish loop.)*
3. **Go-to-market:** is "ride the regulatory wave + per-project unlimited-user + verify-against-your-legacy-export" the right wedge, and which regulation is the sharpest first beachhead?
4. **Architecture/security:** is the bridge-holds-the-key model + immutable audit the right trust boundary, and what would a security reviewer attack first?
5. **The referee-for-AI-agents angle** (propose API + MCP): real differentiator or premature?
