# 3D Authoring → real IFC — scope

> Follow-up to the in-browser **Model** panel (`WebApp/src/setups/model-panel.ts`, commit `bc451d5`),
> which authors **display meshes**. This scopes turning those into **real IFC/BIM elements**: typed,
> GUID'd, storey-contained, property- and quantity-bearing, exportable to `.ifc`, and loadable back as a
> first-class fragments model that the QA / 5D / 6D / tree / properties pipeline reads.
>
> **Status: Phase A spike PASSED (2026-07-16).** A hand-written IFC4 wall (5×0.2×3 m, with
> `Qto_WallBaseQuantities` + `Pset_WallCommon` + spatial skeleton) verified two ways: web-ifc's reader
> parsed it (1 wall, 1 quantity set, tessellated a real mesh — 204 vertex floats), and the bridge's
> `IfcImporter` converted it to fragments (1897 bytes). The IFC-validity risk is retired; the direct
> IFC-SPF path (not the web-ifc writer) is the chosen approach. Sample: `sentinel-authored-wall.ifc`.

## 1. Goal & non-goals

**Goal.** A user sketches walls/columns/slabs in the Model panel, clicks **Bake to IFC**, and gets a valid
IFC4 model that (a) opens in Revit/Solibri, (b) loads back into the viewer as a proper model with
categories + properties, and (c) is picked up by cost (5D), carbon (6D), QA scan, tree and properties —
i.e. it is **schedulable**, not just visible.

**Non-goals (v1).** Parametric relationships (wall joins, hosted openings), curved/complex geometry, MEP,
live bidirectional edit after bake, and re-importing an edited IFC back into the editable mesh layer.

## 2. Architecture — "edit layer + bake" (recommended)

Keep the current mesh authoring layer as the **editable source of truth**; add a one-way **bake**:

```
authored[] (editable meshes)  ──Bake──▶  IFC4 bytes (web-ifc writer)
                                            ├──▶ load as fragments (IfcImporter, worker) → real model in-app
                                            └──▶ download .ifc  /  upload via Publish→bridge
```

Editing stays on the fast mesh layer; re-baking replaces the previous baked model (a new version). This
matches "sketch → commit" and avoids the hard problem of editing fragments in place (they aren't editable).

## 3. IFC content per element (the hard part)

Built with web-ifc's writer (`CreateModel` → `CreateIfcEntity`/`WriteLine` → `SaveModel`). Verified
available in **web-ifc 0.0.77**.

- **Spatial skeleton (once):** `IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey` via
  `IfcRelAggregates`; `IfcUnitAssignment` (SI metre/degree), `IfcOwnerHistory`,
  `IfcGeometricRepresentationContext` (Model/3D).
- **GUIDs:** IFC base64-compressed 22-char GUID per element (from a v4 uuid).
- **Geometry:** every authored element is a box → `IfcRectangleProfileDef` + `IfcExtrudedAreaSolid` +
  `IfcAxis2Placement3D`; wrapped in `IfcShapeRepresentation` ('Body','SweptSolid') →
  `IfcProductDefinitionShape`. Placement = `IfcLocalPlacement` (relative to storey) carrying the mesh's
  position + `rotationY`.
- **Entities:** `IfcWallStandardCase` / `IfcColumn` / `IfcSlab` (PredefinedType FLOOR). Set **`ObjectType`**
  to the element's type name — the cost/carbon resolvers match rate/factor by category **and** ObjectType.
- **Containment:** `IfcRelContainedInSpatialStructure` → storey.
- **Properties:** `IfcPropertySet` (`Pset_WallCommon` etc., e.g. `IsExternal`) via `IfcRelDefinesByProperties`.
- **Quantities — the schedulable hook (verified against `fragments-quantities.ts`):** emit
  `IfcElementQuantity` named `Qto_*BaseQuantities` with `IfcQuantityLength/Area/Volume` whose
  `LengthValue`/`AreaValue`/`VolumeValue` fields the take-off reads:
  - Wall → `Qto_WallBaseQuantities`: Length, Height, Width, GrossFootprintArea, NetSideArea, NetVolume
  - Slab → `Qto_SlabBaseQuantities`: Width, Depth→GrossArea, Perimeter, GrossVolume
  - Column → `Qto_ColumnBaseQuantities`: Length (=height), CrossSectionArea, OuterSurfaceArea, GrossVolume

  The reader prefers `Net…` over `Gross…`, so name quantities accordingly.

## 4. Integration touchpoints (all verified in the current code)

| Consumer | What it needs | Source of truth |
|---|---|---|
| 5D cost / 6D carbon | `Qto_*` quantity sets + category + `ObjectType` | `adapter/fragments-quantities.ts`, `sentinel-core/{quantities,carbon}.ts` |
| Tree / properties / objects panels | fragments model with categories + attributes | built-ins; free once it's a real model |
| QA scan (naming, params) | element names + parameters | `adapter/fragments-facts.ts` |
| Upload to Platform | `.ifc` bytes | Publish→bridge (`bridge/watch-outbox.mjs`) or `client.createFile` (`bridge/thatopen-client.mjs`) |

**Token boundary:** the browser must never hold `THATOPEN_API_KEY`. So upload routes through the **bridge**
(download the `.ifc` → drop in the outbox, or a new service endpoint), never a direct browser→platform push.

## 5. Levels / placement

Authored elements currently float at arbitrary Y. v1: bake into a single default `IfcBuildingStorey`
("Level 0", y=0). v2: read the loaded model's storeys (there's a `fragments-levels.ts` adapter) and place
each element in the nearest one; expose a level picker in the panel.

## 6. Phasing & effort

| Phase | Deliverable | Est. | Risk |
|---|---|---|---|
| **A. IFC writer core** ✅ | Spatial skeleton + **one** element (wall) end-to-end: geometry + Qto + Pset + GUID → `.ifc`. **Spike done** — parses in web-ifc + converts to fragments. Remaining: confirm it opens in Revit. | ~done | ~~High~~ retired |
| **B. All 3 types + bake** ✅ | `sentinel-core/ifc-writer.ts` (walls/columns/slabs, three→IFC coords, per-type Qto) + **Bake to IFC** button. **Done** — verified: wall+column+slab parse in web-ifc (3 meshes, 3 Qto) + convert to fragments. Reload = Assets panel (existing IFC importer). | ~done | Low |
| **C. Upload + versioning** ✅ | Bridge `POST /ifc` (browser → bridge → platform; token stays server-side; IFC→frag then upload) + **Bake & Upload** button with a per-project version counter. **Done** — verified: route + CORS + real upload (returned a live item id) + local frag conversion (2843 bytes). | ~done | Low |
| **D. (optional) polish** | Per-element name/type/Pset editing UI, multi-storey, IFC→editable re-import | open | — |

**MVP (A–C) ≈ 3–4 days** for a schedulable, exportable authoring flow. D is open-ended.

## 7. Open decisions

1. **Bake-snapshot vs live-sync** — recommend **bake** (simpler; matches sketch→commit).
2. **Upload route** — bridge outbox (reuses the verified path) vs a new browser-callable service endpoint. Recommend **bridge**.
3. **Defaults** — storey height, default wall/column type names (drive rate/factor matching), IsExternal default.
4. **web-ifc writer stability** — 0.0.77 writer docs are thin; Phase A must pin/verify constructor
   signatures and validate output against a real IFC viewer early (biggest unknown).

## 8. Recommendation

Do **Phase A first as a spike** — one hard-coded wall → `.ifc` → open it in Revit. That single validation
retires ~80% of the risk (the IFC-validity unknown). If it opens clean, B and C are mechanical. If web-ifc
0.0.77's writer proves too thin, the fallback is to emit IFC-SPF text directly (a minimal IFC4 STEP writer
is ~200 lines and fully under our control) — heavier but zero dependency risk.
