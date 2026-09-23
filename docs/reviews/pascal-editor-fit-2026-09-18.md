# Pascal Editor — fit assessment for Sentinel (2026-09-18)

> Consolidated into the plan: [`docs/FEATURES_UPDATE_2026-09.md`](../FEATURES_UPDATE_2026-09.md).

Inspiration: <https://editor.pascal.app/> (source: `github.com/pascalorg/editor`).
The site itself is unreachable from the analysis environment; everything below
comes from the repository README, the `packages/mcp`, `packages/ifc-converter`
and `packages/core` READMEs, and the MCP registry manifest.

## What Pascal is

An **open-source (MIT), local-first, browser 3D building editor** built for
humans *and* AI agents. Roughly 24k GitHub stars.

| Aspect | Detail |
|---|---|
| Stack | React 19, Next.js 16, Three.js on WebGPU, React Three Fiber, Zustand + Zundo (undo), Zod schemas, three-bvh-csg |
| Data model | Flat node dictionary. `Site → Building → Level → {Wall, Slab, Ceiling, Roof, Zone, Scan, Guide}`; walls/ceilings host `Item`s (doors, windows, lights). A wall is `start, end, height, thickness`. |
| Editing | Draw walls, slabs, ceilings, roofs; zones for rooms; parametric door/window placement; furniture catalog; 2D guide images and 3D scans as references; stacked/exploded/solo level views |
| Agents | An MCP server (`@pascal-app/mcp`, stdio or HTTP, SQLite-backed, headless) with ~35 tools: `get_scene`, `find_nodes`, `get_walls`, `get_zones`, `measure`, `create_room`, `create_wall`, `add_door`, `add_window`, `cut_opening`, `furnish_room`, `create_level`, `create_roof`, `create_stair_between_levels`, **`apply_patch`** ("batched create/update/delete/move, validated and dry-run before commit"), `validate_scene`, `verify_scene`, `check_collisions`, `export_json`, `export_glb`, plus vision tools `analyze_floorplan_image` / `analyze_room_photo`. A `from_brief` prompt turns "2-bed apartment in 80 m²" into a sequence of patches. |
| IFC | **Import only.** `@pascal-app/ifc-converter` turns IFC bytes into Pascal nodes (sites, buildings, levels, walls, doors, windows, slabs, columns, spaces→zones, beams, partial roofs; IFC IDs, names, properties and material metadata retained). Export is JSON, GLB, STL, OBJ. **There is no IFC export.** |
| Extensibility | Plugin manifests: custom node kinds, renderers, inspector panels (example: `pascalorg/plugin-trees`) |
| Deployment | Hosted at editor.pascal.app (API-key MCP endpoint, scenes uploaded) or `npx @pascal-app/cli editor` locally (no upload, loopback MCP) |

The feature people fall for is the combination: **an agent draws a whole
building live in the browser from a prose brief, with undo, validation and a
proper level/zone model behind it.**

## What Sentinel already has in this area

- A **Model panel** in the web app (`WebApp/src/setups/model-panel.ts`, ~750
  lines): box authoring of walls/columns/slabs inside the That Open viewer,
  **Bake to IFC** and **Bake & Upload** via `sentinel-core/ifc-writer.ts`
  (IFC4 with GUIDs, psets and `Qto_*` quantities, verified to parse and
  convert). Phase D "polish" of that spec (per-element editing UI,
  multi-storey, re-import) was left open.
- A **propose API** (`POST /cde/:key/propose`), an **MCP server**
  (`sentinel_propose`, `sentinel_audit`) and bridge AI tools
  (`propose_elements`, `raise_issue`, `transition_container`, …).
- GhostBuilder / Photo Massing in Revit: governed generation with a human
  review gate.

So Sentinel has a small, unpolished authoring surface and a mature referee.
Pascal has a polished authoring surface and **no governance at all**: its
`validate_scene` / `verify_scene` / `check_collisions` are geometric sanity
checks (invariants, overlaps), not standards. Nothing in Pascal knows what a
fire rating, an ISO 19650 container, an IDS, or an audit trail is.

## The honest comparison

| | Pascal | Sentinel Model panel |
|---|---|---|
| Authoring UX | Excellent, purpose-built, 24k-star community | Boxes with a gizmo inside a viewer |
| Semantic model | Levels, zones, hosted openings, roofs, stairs | Three element types, single storey |
| Agent surface | 35 scene tools, dry-run patches, vision | None on the authoring side |
| Standards / IDS | None | The whole product |
| IFC out | None | Yes (walls/columns/slabs, Qto, psets) |
| Ledger, BCF, CDE, ISO 19650 | None | Yes |

Rebuilding Pascal's editor inside Sentinel would be a multi-month React/WebGPU
project against a stack Sentinel does not use (vanilla TS + That Open), to
reach parity with a free MIT tool that already has the community. It also
contradicts decision **D-07 (referee, not rival)**. The Model panel's Phase D
is now not worth doing.

## Recommendation: put Sentinel *behind* Pascal, not in front of it

Pascal is the best possible "thousand tools propose" partner: open, agent
native, MIT, and missing exactly what Sentinel sells. Three slices, in order.

### Slice 1 · Pascal → Sentinel referee (bridge + core only, days)

- `sentinel-core/pascal-adapter.ts` (pure, tested): map Pascal `export_json`
  nodes to `ElementProperties`. Wall → `IFCWALL`, Slab → `IFCSLAB`,
  Zone → `IFCSPACE`, door/window items → `IFCDOOR` / `IFCWINDOW`,
  Level → storey containment; Pascal node properties/material metadata →
  psets where names match, everything else into a `Pset_Pascal` for
  traceability. Node id kept as the GlobalId source so re-proposals diff.
- Bridge route `POST /cde/:key/propose/pascal` that accepts a Pascal scene
  JSON and runs the existing adjudication (IDS verdict, ledger row, BCF on
  fail). Zero new engine code.
- An agent skill ("pascal-governed"): draw with Pascal's MCP, propose with
  Sentinel's MCP, read the per-requirement reasons, patch, re-propose until
  accepted. This is the live demo: **Claude drafts the apartment in Pascal,
  Sentinel rejects it for missing fire ratings and an invalid container name,
  the agent fixes it, the accepted verdict lands on the ledger.**

### Slice 2 · Pascal scene → real IFC on the CDE (core, about a week)

Pascal cannot export IFC. Sentinel's `ifc-writer.ts` already writes IFC4.
Extend it to take the adapter's output: walls from `start/end/height/
thickness` (already a box), slabs and zones from polygons (needs
`IfcArbitraryClosedProfileDef` extrusion, currently boxes only), storeys from
Pascal levels, doors/windows as `IfcOpeningElement` + `IfcDoor`/`IfcWindow`
(or as properties on the wall in v1). Result: a Pascal sketch becomes a
governed, versioned IFC container on the CDE through the existing
Bake & Upload path. This is a gap Pascal's own users are asking for (their
issue #219) and a natural open-source contribution that carries Sentinel's
name into that community.

### Slice 3 · Sentinel plugin inside Pascal (UI, later)

Pascal's plugin manifest allows custom inspector panels. A "Referee" panel
shows the last verdict per node (green/red, the KF-B colour-coding idea
delivered inside Pascal instead of the That Open viewer) and a
"Propose to Sentinel" button. React work, so a separate small package.
Only after slices 1 and 2 prove the loop.

### Deployment posture

Use Pascal's **local CLI** (`npx @pascal-app/cli editor`), not the hosted
editor: local-first, no scene upload, loopback MCP, which matches Sentinel's
trust boundary (D-06). The hosted endpoint needs an API key and uploads
scenes to Pascal's servers.

## Assumptions to verify before slice 1

1. Pascal node schemas carry free-form properties (the IFC converter says it
   "retains properties", so a metadata field exists; confirm its shape in
   `@pascal-app/nodes`).
2. `apply_patch` can set those properties, so an agent can satisfy an IDS
   requirement without leaving Pascal.
3. `export_json` output is stable across versions (Pascal skills "inspect the
   connected MCP tool schemas before using optional fields", so expect drift).

## Bottom line

The feature to want is not Pascal's editor; it is **Pascal's editor with
Sentinel's verdict on every patch**. That is one adapter, one bridge route
and one skill away, and it demonstrates "LLM proposes, the deterministic
engine disposes" on the most-watched open-source authoring tool of the year.
