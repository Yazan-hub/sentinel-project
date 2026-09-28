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
4. **The gate as a lock — decided by the founder 2026-09-28 ("yes"), built.** A run stays free; ⚑ Raise records on the
   register only when the Federation Gate passed on the whole live set (`raiseGate`: a pass, not stale, every live
   model judged; a pass needs at least one check that passed — six not-checkable checks are NOT CHECKABLE). The bridge
   asks it for every new register record (`POST /clash/:pid` → 409 in words) and every Clash issue (so a gate that goes
   stale mid-raise stops at the first issue); the panel asks it before starting and shows the lock on its banner; moving
   a recorded clash stays free; a bridge without a CDE has no gate. The register is written with the service key after
   those checks; migration 0034 (written, applied only on the founder's approval) takes the direct PostgREST write away
   from signed-in callers — until it is applied, a contributor could still write the store directly.
5. **Streaming is measured before anything changes (built: BIM Tools ▸ Performance).** A 10-second measure while the
   person orbits: frame time p50/p95, drawn frames, draw calls and triangles submitted per drawn frame (summed across
   postproduction passes), GPU geometries/textures, JS heap, per model its elements and whether culling/LOD follow a
   camera (`model.camera`), and the engine's culling/LOD settings. Correction to "Facts": "Open 3D" is Sentinel's own
   loader (`files-panel.ts` `core.load(buf, { modelId })`, no camera), and the two `useCamera` calls in
   `components-front-beta` belong to sheet viewports — so whether the main camera is bound is exactly what the
   readout shows. Only then: bind the camera at load, tune `core.settings` (culling, lodThresholds, graphicsQuality).
6. **WebGPU — blocked upstream (found 2026-09-28, trial builds in the session scratchpad, no repo change).** The
   switch is a build-time alias (`three` → `three/webgpu`); `SimpleRenderer` then picks WebGPU by itself
   (`components-beta` index.mjs ~16377: `hasWebGPU = typeof THREE.WebGPURenderer === "function"` — a build check, not a
   browser check; a browser without WebGPU gets WebGPURenderer's WebGL2 backend). But the build fails before any of
   Sentinel's code matters: the engine packages themselves import WebGL-only three add-ons at module load —
   `components-front-beta` index.js:11-19 (EffectComposer, GTAOPass, OutputPass, SMAAPass, LineSegments2, LineMaterial)
   and `fragments-beta` (Line2, LineMaterial, which touches `UniformsLib` at load). A plain alias stops at
   `"UniformsLib" is not exported by three.webgpu.js`; shimming the six missing exports (ShaderChunk, ShaderLib,
   UniformsLib, UniformsUtils, WebGLCubeRenderTarget, WebGLRenderer) builds a bundle that throws as it loads. Beyond
   that: fat lines (measure, section, dimension lines) need porting to three's `Line2NodeMaterial`; fragments' shell
   effects use `onBeforeCompile`, which WebGPU never calls; reality capture has its own WebGLRenderer and Spark.
   `thatopen serve` hard-codes its aliases (dev would stay WebGL while publish went WebGPU). Fragments' own comment
   assumes an "addon stub" for WebGL-only add-ons in WebGPU builds that no installed package ships. And the engine's
   real streaming (`.fragstrm`/`.fragdata`/`.fraglod`, `IfcImporter.processStreamed`) refuses to load unless three is
   the WebGPU build. **Decision:** not shipped; the question goes to That Open — how is an app meant to build against
   their WebGPU engine (the addon stub)? Until then streaming work stays on the WebGL path (camera binding, culling and
   LOD settings), measured with the Performance tab.
7. **One model tree.** Two trees exist: the platform's spatial tree (Explorer) and Sentinel's category browser
   (BIM Tools ▸ Browser, already across models). Next: load two models and see what each shows before merging
   anything; not built tonight.

## Testing

`src/sentinel-core/clash-confirm.ts` (pure: candidates × Collider results → confirmed, dropped, the status sentence)
pinned by vitest; `npm test`, `tsc`. Live: the founder's federated Aster models in the web app — the drop count and
three confirmed clashes looked at on screen (drill B18). The Collider itself is That Open's; Sentinel checks what it
feeds it and what it does with the answer.
