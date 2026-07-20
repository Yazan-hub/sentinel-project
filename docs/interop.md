# Interoperability — Sentinel as the OpenBIM referee for any tool

Sentinel is not another authoring tool; it's the **governed layer** every authoring tool feeds. That's the
whole competitive position (see `bim-tools-catalog-full.md` — the funded BIM-2.0 wave builds the *pencil*,
not the *contract*; none ship a governance/validation/CDE layer). So "compatible with other 3D BIM software"
isn't a per-vendor integration matrix — it's **standards**: any tool that speaks OpenBIM plugs in.

## The four interop surfaces (tool-agnostic)

| Surface | Standard / API | Who uses it |
|---|---|---|
| **Models** | IFC (import via WebIFC; export IFC 4.3 planned; **IFC5** ECS-over-JSON foundation in `element-graph.ts`) | Revit, Archicad, Tekla, Rhino, any IFC exporter |
| **Issues** | **BCF-API 3.0** (`/bcf/3.0/*`, team-wide via Supabase, live SSE) | Revit (BcfSyncManager), BIMcollab, Solibri, any BCF tool |
| **Requirements** | **IDS** (buildingSMART Information Delivery Specification) validation | any tool that ships an `.ids`; the browser or the propose API validates |
| **Proposals** | **the propose API** `POST /cde/:key/propose` + the **MCP server** | AI agents, generators (Snaptrude/Finch/TestFit-style), scripts, any tool |

A tool doesn't integrate with Sentinel's internals — it PROPOSES (a model, elements, an issue) and Sentinel
**adjudicates** (IDS + ISO 19650), **records** (immutable audit), and **governs** (states, suitability). Let a
thousand tools propose; Sentinel is where their output becomes TRUE.

## Revit ↔ web workflow

The Revit plugin (`SentinelAddin/`) and the web app share the bridge (`http://localhost:4100`, `BCF_SERVICE_URL`)
and the platform project id (`THATOPEN_PROJECT_ID`).

```
Revit  ──save/sync──►  IFC → outbox  ──watch-outbox──►  That Open Platform  ──►  Web viewer loads the model
  │                        │
  │  BcfSyncManager  ◄──── BCF-API 3.0 (bidirectional, live SSE) ────►  Issues panel / Revit
  │
  └──GovernedNotify──►  bridge /cde/:project/audit   (NEW: "Model published from Revit" in the governed trail)
```

**Compatible now:** BCF issues sync both ways (live); Revit's IFC publish reaches the web viewer; Revit's local
delivery gate / preflight / health-scorecard mirror the web's IDS + gates (same BDS ruleset origin); Revit
publishes now land in the web app's **hash-chained audit trail** (`GovernedNotify`, commit 8a16493).

**Quantities for any tool:** 5D cost / 6D carbon read IFC `Qto_` base-quantity sets when present. When an export
omits them (common outside Revit, and in older/simple exports), the web app **derives length/area/volume from
each element's bounding box** and flags the result *estimated* (`deriveQuantitiesFromBox`, commit 972da0a) — so
take-off works for any IFC regardless of the authoring tool's export settings, while staying honest that authored
`Qto_` is more precise. Revit's own export already sets `ExportBaseQuantities = true` (`PlatformExporter.cs`), so
models published from Revit carry real quantities and skip the estimate.

## Revit integration roadmap (each a small, bridge-only add — no new deps)

1. **Snapshot ingest on publish** — extract per-element quantities (GlobalId + category + Qto) and
   `POST /cde/:project/snapshots` so the web app's 5D cost / 6D carbon **revision-diff + baseline picker** get
   Revit data automatically (the diff engine keys on GlobalId, which Revit's IFC GUID provides). *Highest value.*
2. **Propose-on-publish (optional)** — for Revit models without a local gate, `POST …/propose` with an `.ids`
   to get an accepted/rejected verdict in Revit before publishing. (Revit already has `IfcDeliveryGate`, so
   this is for parity with tools that don't.)
3. **CDE state in Revit** — read the container's ISO 19650 state (`GET /cde/:key/containers`) and gate
   "Publish" on it (can't publish a `published`/immutable container without a new revision).
4. **Clash register in Revit** — show recorded clashes + status (`GET /clash/:project`) with the raise-time
   element provenance, and select them in the model by GlobalId.

Each reuses the `GovernedNotify` fire-and-forget pattern (never blocks the Revit save flow) and the existing
`BcfConfig`. All are compile-verifiable against RevitVersion 2021–2027 (net48 / net8 / net10).

## Other tools

- **Archicad / Tekla / Rhino / Blender (Bonsai)** — via IFC (models) + BCF (issues) + IDS (requirements),
  identical to Revit; no bespoke plugin required, only OpenBIM exports.
- **Agents / generative tools** — via the MCP server (`docs/mcp-server.md`) and the propose API. This is the
  surface the BIM-2.0 generators (Snaptrude, Finch, TestFit, Motif) can't govern themselves — Sentinel does.
