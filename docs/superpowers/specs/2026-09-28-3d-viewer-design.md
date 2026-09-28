# 3D — exact clash, the gate before the register, streaming and WebGPU measured (roadmap item 2)

Status: draft written 2026-09-28 night while the founder slept (he asked for the work to continue alone). The
decisions marked **(founder)** are his; everything else is built only where it is additive and reversible.
Parent: `docs/ROADMAP.md` item 2; `docs/UPGRADE_MAP_2026-09.md` U-8..U-12.

## Facts this rests on (read 2026-09-28)

- The web app runs the **beta** engine: `.thatopen` `"beta": true`, `vite.config.js` aliases `@thatopen/components`,
  `-front` and `fragments` to `@thatopen-platform/*-beta` (components 3.5.18, front 3.5.16, fragments 3.5.9), and
  `tsconfig.json` `paths` do the same for the types. `three` 0.185.0.
- **Clash today** is Sentinel's own AABB broad-phase (`src/sentinel-core/clash.ts`: sweep-and-prune on X, a
  3-axis overlap with a penetration tolerance, GlobalId signatures) over solid IFC classes
  (`adapter/model-clash.ts`). Two boxes that overlap are reported even when the solids never touch — an L-shaped
  wall's box swallows the duct beside it. The Federation Gate is an advisory banner in the same panel (D-01: "a
  warning, not a lock").
- The beta components ship **`Collider`** (`components-beta` d.ts ~3715): `find(setA: ModelIdMap, setB: ModelIdMap,
  { type: 'hard', calculateVolume? } | { type: 'clearance', tolerance })` → `ClashData[]` with both elements'
  `guid/name/category/localId/modelId`, a `point` and `volume` (hard) or `distance` (clearance), and a stable `id`
  (FNV-1a of the GUID pair). It bakes each element's triangles in world space itself.
- **Streaming/LOD**: fragments 3 keeps a model in its worker and sends the GPU what the camera needs
  (`useCamera`, `LodMode`, virtual tiles). The platform viewer calls `useCamera` (twice in `components-front-beta`);
  the platform's model list loads with `{ modelId, userData }` only. Nothing has been measured on Sentinel's models.
- **WebGPU**: `three/webgpu` is installed; `SimpleRenderer` picks WebGPU when the browser has it *and* `three`
  resolves to `three/webgpu`, and throws otherwise. Nothing in the app aliases it today.
- **Model tree**: Sentinel's project browser (`project-browser-panel.ts` + `adapter/project-tree.ts`) already spans
  every loaded model (Category → Type → Instance). `main.ts:364` mounts `<top-model-tree>` in the Explorer layout; the
  platform registers it at run time (seen 2026-09-28: "No model loaded — load a BIM model to explore its spatial
  structure here"), so it is the platform's spatial tree, not dead markup.

## Decisions

1. **Exact clash = AABB candidates confirmed by the Collider (built tonight).** The broad-phase stays (fast, and the
   Federation Gate's overlap check uses it); every candidate pair is then checked on the solids: per model pair, the
   candidate elements of each side go to `Collider.find` and only pairs the Collider returns are clashes. A candidate
   the Collider does not return is dropped and *counted* ("412 box overlaps → 37 clashes on the solids, 375 boxes
   only"). Volume comes from the Collider (`calculateVolume`). A pair whose solids meet with **no** measured volume is
   kept but marked *touching* and listed after the overlaps (found live: 2,552 of 3,635 hits on aster-tower had no
   volume — walls standing on slabs), so a touch is never ranked by its box volume.
   Signatures stay Sentinel's (`g:<GlobalId>` pairs), so the register and every resolved clash carry over unchanged.
2. **Clearance, the same way.** A "clearance" mode with a distance: the broad-phase runs with a negative tolerance
   (boxes within the distance), the Collider's clearance check confirms. Hard stays the default.
3. **When the exact check cannot run** (the Collider throws, a model is not a fragments model), the run falls back to
   the boxes and says so on every line of the status: "boxes only — the solids were not checked: <reason>". Never a
   silent downgrade.
4. **(founder) The gate as a lock.** D-01 made the Federation Gate a warning. Recommendation: keep a run free (it is
   exploratory), but let ⚑ Raise write to the register only when the gate passed on the current live set, and say
   why when it refuses. Not built until he decides.
5. **Streaming is measured before anything changes.** A small in-app readout (models, items, draw calls, triangles,
   frame time, JS heap) on the viewer, so the founder's own models give the numbers; only then decide between
   `setLodMode`, virtual models and Sentinel's own loader. Nothing replaces the platform's loader blind.
6. **WebGPU as a measured experiment.** The switch is a build-time alias (`three` → `three/webgpu`), so it cannot be a
   per-viewer toggle in one bundle. It is tried on a branch against the same readout on the founder's models and
   shipped only if every panel still works (postproduction, clipper, reality capture) and the numbers improve.
   **(founder)** whether to ship it.
7. **One model tree.** Two trees exist: the platform's spatial tree (Explorer) and Sentinel's category browser
   (BIM Tools ▸ Browser, already across models). Next: load two models and see what each shows before merging
   anything; not built tonight.

## Testing

`src/sentinel-core/clash-confirm.ts` (pure: candidates × Collider results → confirmed, dropped, the status sentence)
pinned by vitest; `npm test`, `tsc`. Live: the founder's federated Aster models in the web app — the drop count and
three confirmed clashes looked at on screen (drill B18). The Collider itself is That Open's; Sentinel checks what it
feeds it and what it does with the answer.
