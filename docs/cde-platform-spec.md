# Sentinel CDE Platform — architecture & master roadmap

> Turns the market research ([cde-market-analysis.md](./cde-market-analysis.md), [4d-market-analysis.md](./4d-market-analysis.md))
> into an actionable build. **Thesis:** Sentinel becomes the first platform to unify a **web-native OpenBIM viewer** +
> **rigorous ISO 19650 CDE governance** + the **full 4D–7D / QA / cost / tender lifecycle** + **open interop**, in **one
> governed dataset**. The CDE is the backbone; 4D, the Revit-style UI, and tool connectors are views/tools on it.

## 1. Where we are

Sentinel already has ~40% of a CDE (verified in-repo): BCF-API 3.0 subset, project store, RFIs, tenders, standards-pack
marketplace, RIBA stage gates (`gates.ts`), web-native fragments viewer, QA engine + scorecard, 5D/6D/7D, in-browser IFC
writer, and the Revit plugin. **But** persistence is single-project **JSON files** on a dev bridge, and the ISO 19650
governance core is absent. The gap to a real CDE (from the research):

🔴 container **states** (WIP/Shared/Published/Archived) · suitability **codes** (S0–S7/A/B) · **transmittals** · **roles/parties** + auth
🟠 immutable **audit trail** · **revision** control + naming validation · **multi-tenant durable DB**
🟡 **OpenCDE Documents API** + handover bundle · **IDS/bSDD**

## 2. Target architecture

```
        ┌──────────────────────── Sentinel CDE (governed dataset) ─────────────────────────┐
        │  Supabase (Postgres + Auth + RLS + Storage)                                       │
        │   projects · parties/roles · information_containers · container_versions          │
        │   (state + suitability + revision) · transmittals · audit_log (append-only)       │
        │   + migrated: bcf_topics · rfis · tenders · standards_packs · project_meta         │
        └───────▲───────────────────────▲───────────────────────────▲──────────────────────┘
                │ REST/RLS               │ OpenCDE + BCF-API          │ REST
   ┌────────────┴─────────┐   ┌──────────┴───────────┐   ┌────────────┴───────────────┐
   │  Web app (panels =   │   │  BIM tool connectors  │   │  Revit plugin (Sentinel     │
   │  views on the graph) │   │  IFC/BCF/IDS + native │   │  Addin): publish, QA, BCF   │
   │  viewer · QA · 5D/6D  │   │  plugins (Revit=1st)  │   │  sync, IFC export           │
   │  4D · issues · CDE UI │   └───────────────────────┘   └─────────────────────────────┘
   └──────────────────────┘
```

**Persistence shift:** the dev bridge's JSON stores → **Supabase** (Postgres + Auth + Row-Level Security + Storage).
Supabase is already connected to this workspace. The bridge keeps serving the BCF-API/OpenCDE surface to the Revit
plugin (token stays server-side) but reads/writes Supabase instead of JSON.

## 3. CDE core data model (Phase 1)

- **`projects`** — id, name, appointing party, naming convention, status-code scheme (UK NA / custom).
- **`parties`** / **`memberships`** — org + role (appointing / lead appointed / appointed / viewer); RLS keys off this.
- **`information_containers`** — the ISO 19650 unit (a model, drawing, doc); ISO name (Project-Originator-Volume-Level-Type-Role-Number).
- **`container_versions`** — revision (P/C+.NN, supersede-not-overwrite), **state** (`wip|shared|published|archived`),
  **suitability** (S0–S7/A/B), file ref (Storage / platform item), author, timestamp. **Published rows immutable.**
- **`transmittals`** — recorded issue: sender, recipients, purpose, container_versions[], suitability, immutable, exportable (PDF).
- **`audit_log`** — append-only, tamper-evident (hash-chained): who/what/when/old→new, every state change + metadata edit.
- **State machine** (reuse the `gates.ts` "check/review/approve at every boundary" idiom): WIP→Shared needs task-team
  approve + suitability; Shared→Published needs lead-appointed authorization; reject routes back to WIP; each transition
  writes `audit_log`. Access is gated **by state** via RLS, not folders.

## 4. Master roadmap (each phase ships independently, like IFC A→B→C)

| Phase | Thread | Deliverable | Depends on |
|---|---|---|---|
| **C1** | CDE core | ✅ **Schema live** on Supabase `autqqtwhxqrfjaztablm` (`WebApp/db/migrations/0001_cde_core_c1.sql`) — projects/parties/memberships/containers/versions/transmittals/audit_log, RLS locked to service key. Verified end-to-end (container → wip/shared versions + suitability → transmittal → audit). **Remaining:** migrate BCF/RFI/tender/project JSON → Postgres; point the bridge at Supabase. | Supabase (done) |
| **C2** | CDE core | Container **state machine** + suitability codes + revision control + **append-only audit log**; state-gated RLS | C1 |
| **C3** | CDE UI | Web panels: **container/state board** (Kanban WIP→Shared→Published→Archived), **transmittal** builder + register, **audit-trail** viewer, **roles/parties** admin | C2 |
| **C4** | Auth/parties | Supabase Auth (magic-link/SSO), org/role model, **unlimited external viewers** (the pricing wedge) | C1 |
| **D1** | **4D module** | Browser timeline/Gantt driving **Highlighter/Hider** over fragments; author `IfcTask`/`IfcWorkSchedule`; scrub playback | viewer (have) |
| **D2** | 4D | **Self-healing schedule↔element linking** via the QA rule engine (map by class/property/zone, persist to GlobalId, re-heal + diff on new version) — *the #1 industry pain* | D1 |
| **D3** | 4D | Fuse 4D with **5D cost / 6D carbon / BCF** on the timeline (cash-flow + carbon-over-time curves; issue on out-of-sequence element) | D1, existing 5D/6D |
| **R1** | **Revit-style UI** | Reshape the web app toward Revit patterns: ribbon, Properties palette, Project-Browser tree, selection/filter — over the existing panels | — |
| **R2** | Revit-style tools | Modeling-tool polish (visibility fix follow-through, multi-storey bake, snapping, levels/grids) + Revit-like edit tools | model panel (have) |
| **X1** | Connectors | **OpenCDE Documents API** + BCF-API hardening; **handover bundle** export (IFC+BCF+COBie+IDS+transmittal register+audit) | C1–C3 |
| **X2** | Connectors | **IDS import/export** for standards packs + **bSDD**; broaden BIM-tool ingest (ArchiCAD/Tekla/Navis via IFC+BCF); Revit plugin = first native connector | rule engine (have) |

**Suggested sequence:** **C1→C2→C3/C4** first (the backbone + the wedge nobody else ships), then **D1–D3** (4D on the
governed model), then **R1–R2** (UI) and **X1–X2** (open interop) in parallel. Each phase is demoable on its own.

## 5. Decisions needed before C1
1. **Provision Supabase** — create/choose the project (outward-facing; may incur cost). *Needs explicit go-ahead.* Supabase MCP is connected, so once confirmed I can stand up the schema immediately.
2. **Auth model** — Supabase Auth (email magic-link) for v1, SSO later? External parties = unlimited free viewers.
3. **Status-code scheme** default — UK National Annex (S0–S7, A/B) vs a configurable set per project.
4. **Migration** — port existing JSON stores, or start clean in Supabase and keep the bridge JSON as a fallback during transition.

## 6. Honest scope notes
- "**Connect to all BIM tools**" = open-standards backbone (IFC + BCF + IDS + OpenCDE) for the long tail **+** native
  plugins for the dominant tools (Revit first). **Live bidirectional parametric sync with every tool does not scale** —
  scope "sync" as publish/reference + BCF issue round-trip (per Speckle's own interoperability→connectivity reframing).
- "**ISO 19650 compliant**" is self-declared industry-wide (no cert program). We hold ourselves to the §Checklist in
  the market analysis and test against it.
- The container-state engine + immutable audit trail (**C2**) is the single sharpest differentiator — the OpenBIM camp
  (Catenda/Konekt/Dalux) doesn't ship it rigorously, and the doc-control camp (Aconex/Asite) ships it only on dated,
  non-web-native foundations.
