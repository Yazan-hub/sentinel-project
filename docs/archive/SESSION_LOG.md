# Session Log — Ghost Builder + That Open BIM Viewer

**Date:** 2026-07-13
**Machine:** Windows 11, PowerShell + Bash
**Assistant:** Claude Code (Opus 4.8)

---

## Part 1 — Sentinel "Ghost Builder" (Revit C# module)

Goal: bridge Revit 2D CAD extraction → offline Llama 3 (Ollama) → LOD 200 3D model generation for Badran Design Studio.

### Files produced (`C:\Users\yazan\ThatOpenCompany\Launchpad\Sentinel\`)
| File | Contents |
|---|---|
| `GhostBuilder_Architecture.cs` | `LocalGhostBuilder` (Ollama HTTP bridge) + `MappingResult` / `LayerMapping` DTOs + JSON schema |
| `GhostBuilder_ExtractionAndPlacement.cs` | `GhostCadExtractor` (layers + `GhostElement` geometry) + `GhostPlacementEngine` (anti-hallucination placement) |
| `GhostFamilyPreloader.cs` | Loads component `.rfa` families the LLM mapped, if missing from doc |
| `GhostWallTypeProvisioner.cs` | Duplicates a base wall type for mapped wall types (system families can't be `LoadFamily`'d) |
| `GhostBuilderOrchestrator.cs` | 4-step pipeline; awaits LLM **before** opening the Revit transaction |
| `GhostBuilderExternalEvent.cs` | `IExternalEventHandler` — runs `RunAsync` on the Revit API thread |

### Pipeline
```
Button → SetRequest/Raise → [API thread] Execute → RunAsync:
  ExtractCadLayers → LLM MapLayersAsync (awaited, no txn)
  ExtractGhostElements (geometry)
  txn: preload families → provision wall types → Regenerate → build engine → place → commit
  → PlacementReport
```

### Key decisions / bugs caught
- **API key was pasted in plaintext** in the user's script → flagged as compromised, advised rotation + env var. Did **not** run the round-trip API script; emitted code directly.
- **Transaction must never span an `await`** — LLM call awaited first, transaction opened after, all on the API thread.
- **Engine caches families/types/levels in its constructor** → must be built AFTER preload + wall provisioning + `Regenerate()`, else new families invisible. (Caught mid-build.)
- **Anti-hallucination:** every LLM-named family/type validated against a `FilteredElementCollector` truth-set; unknowns counted in `SkippedUnknownFamily`, never thrown into Revit. Plus `minConfidence` gate.
- **Compile-sanity pass** found `GhostBuilder_Architecture.cs` had never been written to disk (only pasted as text) — all other files referenced its types. Written; cross-checked all 6.
- **Target range Revit 2021–2027:** swapped `init` accessors → `set` (avoids `IsExternalInit` shim on net48). For net48 also need `<LangVersion>latest</LangVersion>` + `System.Text.Json` NuGet.

### Known LOD-200 simplifications (marked `ponytail:`)
- Wall-type clone is geometric-only (renamed base type), no real assemblies.
- Default wall height 10 ft when 2D CAD carries no Z.
- No LLM-output schema validation / retry loop yet.
- Doors/windows placed free-standing (not hosted in walls).

---

## Part 2 — That Open Company BIM viewer (Vite + TS)

Location: `C:\Users\yazan\that-open-test-app\`

### Stack
- Vite v8.1.4 + vanilla-ts
- `@thatopen/components@3.4.6`, `@thatopen/components-front@3.4.3`, `@thatopen/ui@3.4.9`
- `@thatopen/fragments`, `web-ifc@0.0.77`, `three` (+ `@types/three`)

### Features built into `src/main.ts`
- TOC v3 world: `SimpleScene` + `SimpleCamera` + `PostproductionRenderer` (front)
- **Offline** IFC loading — wasm in `public/wasm/`, worker via `@thatopen/fragments/worker?url`
- Drag-drop **and** file-picker load paths
- Zoom-to-fit on load (`controls.fitToBox(model.box)`)
- Highlighter (selection) — needs postproduction renderer
- Clipper (section planes) + **enable/disable checkbox** in the BUI panel
- Left BUI panel (Status / Load / Controls) + right Properties Explorer panel
- **Properties Explorer**: attributes + instance Psets (`HasProperties`) + Qsets (`Quantities`) + type Psets (`IsTypedBy` → `HasPropertySets`)

### v3 API bugs caught in user-supplied snippets (NOT run verbatim)
| Snippet code | Problem | Fixed to |
|---|---|---|
| `world.scene.get()` | no `get()` on BaseScene | `world.scene.three` |
| `IfcRelationsIndexer` | doesn't exist in this build | removed (data is in the model) |
| `fragments.groups.get(id)` | `groups` gone | `fragments.list.get(modelId)` |
| `model.getProperties(id)` | gone | `model.getItemsData([localId], config)` |
| `ifcLoader.setup()` no args | `autoSetWasm:true` → unpkg fetch, breaks offline | `autoSetWasm:false` + local wasm path |
| `ifcLoader.load(data)` | missing required args | `load(data, true, name)` |
| selection keyed as `fragmentId` | it's `ModelIdMap = Record<modelId, Set<localId>>` | iterate correctly |

### Offline asset details
- wasm: `public/wasm/web-ifc.wasm` (single-threaded; dropped `-mt.wasm` — no COOP/COEP configured)
- worker: imported via `@thatopen/fragments/worker?url` (the package's `./worker` export) — dedupes to the single Vite-emitted asset instead of shipping a 2nd copy
- Two `unpkg.com` strings remain in the bundle but are in **dead code paths** (`getWorker()` and `autoSetWasm()`), never executed in this config.

### Build
- `npm run build` → exit 0. App chunk ~7.17 MB (gzip ~1.41 MB), worker 3.48 MB, wasm 1.30 MB.
- >500 kB chunk warning is expected (BIM viewer monolith); code-split only if first-paint matters.

### Debugging "IFC not responding"
- Assets served 200; problem was a **silent-failure trap**: `if (!ready) return` + no try/catch in `loadIfc`.
- Added error surfacing: try/catch around `ifcLoader.setup`, `ifcLoader.load`, and the `initLoaders()` call — failures now show in the Status line + `[GhostBuilder]` console logs.
- **Resolved:** load worked once triggered via Choose File. `ARC-Interior_Finishes.ifc` loaded and rendered with zoom-to-fit. Clipping was on (blue section-cut slab visible).

### Running
- Production preview: `npm run preview` → http://localhost:4173/ (serves `dist/`)
- Killed stale preview procs (4173/4174) and the 5173 dev server per user request.

### Open follow-ups
- Test left-click selection → Properties Explorer against the loaded model (getItemsData path not yet exercised on real data at time of writing).
- Optional: `git init` + commit as a restore point.
- Properties Explorer renders single-value props/quantities; enum/list/table property types render blank (not a crash).
