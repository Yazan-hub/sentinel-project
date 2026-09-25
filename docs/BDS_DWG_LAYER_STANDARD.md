# BDS DWG Layer Standard (v1)

The layer naming standard that incoming DWGs must follow so GhostBuilder can map layers to families **deterministically** (and so the AI only has to reason about the genuine gaps). It is lineage-compatible with the **AIA CAD Layer Guidelines / US National CAD Standard** and **ISO 13567**, adapted to the BDS family library and Sentinel's IDS.

> Like the naming and IDS rulesets, this is a **configurable reference, not a bible**. BDS is the pilot profile (`demo/bds-pilot/bds-layers.json`, installed on the office `bds-office` as `layers@1`); the office-agnostic **Base** profile is `config/base-standard/layers.json`. Swapping the standard means installing another `layers@n` on the project or its office. The file's `enforce` (`reject` / `warn` / `off`) is not applied by Revit — see *Compliance / enforcement*.

## Why it matters

GhostBuilder builds geometry from DWG **linework**, grouped by **layer**. If a wall lives on a layer called `A-WALL-EXT`, the mapping to `BDS_Wall_Ext` (external, needs a fire rating) is unambiguous and needs no AI guesswork. If it lives on `Layer1` or `walls new copy (2)`, the model has to guess — and guesses are where autonomous builds go wrong. **Compliant layers = confident, correct models.**

## Layer name format

```
   D - MAJR - MINR [ - STATUS ]
   │    │      │        │
   │    │      │        └─ optional: N (new) · E (existing) · D (demolish)
   │    │      └────────── minor modifier (3–4 chars): EXT, INT, FIRE, FNSH, PART…
   │    └───────────────── major group (4 chars): WALL, DOOR, WIND, FLOR, COLS…
   └────────────────────── discipline (1 char): A, S, M, E, P, F…
```

Rules:
- **UPPERCASE**, hyphen-`-` delimited, **no spaces**, no free text.
- Discipline is always first. Major group is required. Minor + status are optional.
- Examples: `A-WALL-EXT` · `A-DOOR` · `A-WIND` · `S-COLS` · `A-WALL-FIRE-E` · `M-DUCT`.

## Field 1 — Discipline

| Code | Discipline |
|---|---|
| `A` | Architectural |
| `S` | Structural |
| `M` | Mechanical (HVAC) |
| `E` | Electrical |
| `P` | Plumbing |
| `F` | Fire protection |
| `C` | Civil / site |
| `I` | Interiors |
| `G` | General / shared |

## Field 2 — Major group (the modelled element)

These map directly to GhostBuilder's build categories.

| Major | Element | GhostBuilder category |
|---|---|---|
| `WALL` | Walls | Walls |
| `DOOR` | Doors | Doors |
| `WIND` | Windows | Windows |
| `GLAZ` | Glazing / curtain (alias of WIND) | Windows |
| `FLOR` | Floors / slabs | Floors |
| `CLNG` | Ceilings | Ceilings |
| `COLS` | Columns | Columns |
| `FURN` | Furniture | Furniture |
| `EQPM` | Equipment | Furniture |
| `BEAM` | Beams | *extension* |
| `SLAB` | Structural slab | Floors |
| `STRS` | Stairs | *extension* |
| `ROOF` | Roofs | *extension* |
| `DUCT` | HVAC duct | MEP void |
| `PIPE` | Pipe | MEP void |

## Field 3 — Minor modifier (subtype)

| Minor | Meaning | Sets IDS param |
|---|---|---|
| `EXT` | External | `IsExternal = true` |
| `INT` | Internal | `IsExternal = false` |
| `FIRE` | Fire-rated | flags `FireRating` as **required** |
| `PART` | Partition (non-load) | — |
| `LOAD` | Load-bearing | — |
| `FNSH` | Finish | — |
| `FULL` / `HALF` | Height | — |

## The layer table (BDS profile)

Model layers GhostBuilder reads and maps:

| Layer | Category | Example BDS family | Key IDS params seeded |
|---|---|---|---|
| `A-WALL-EXT` | Walls | `BDS_Wall_Ext` | `IsExternal=true`, `FireRating`, `Discipline=A` |
| `A-WALL-INT` | Walls | `BDS_Wall_Int` | `IsExternal=false` |
| `A-WALL-FIRE` | Walls | `BDS_Wall_Fire` | `FireRating` (required) |
| `A-WALL-PART` | Walls | `BDS_Wall_Partition` | `IsExternal=false` |
| `A-DOOR` | Doors | `BDS_Door` | `FireRating`, width, height |
| `A-WIND` / `A-GLAZ` | Windows | `BDS_Window` | `ThermalTransmittance` (U-value) |
| `A-FLOR` | Floors | `BDS_Floor` | `Discipline=A` |
| `A-FLOR-FNSH` | Floors | `BDS_Floor_Finish` | — |
| `A-CLNG` | Ceilings | `BDS_Ceiling` | — |
| `A-COLS` | Columns | `BDS_Column_Arch` | — |
| `A-FURN` | Furniture | `BDS_Furniture` | — |
| `A-EQPM` | Furniture | `BDS_Equipment` | — |
| `S-COLS` | Columns | `BDS_Column_Struct` | `Discipline=S` |
| `S-SLAB` | Floors | `BDS_Slab_Struct` | `Discipline=S` |
| `S-WALL` | Walls | `BDS_Wall_Shear` | `Discipline=S` |
| `M-DUCT` | MEP void | — | `Discipline=M` |
| `P-PIPE` | MEP void | — | `Discipline=P` |

## Layers to IGNORE (never modelled)

Annotation, references, and drafting layers must **not** be turned into geometry. GhostBuilder skips any layer matching these:

| Pattern | What it is |
|---|---|
| `*-ANNO-*` | Any annotation (text, tags, symbols) |
| `*-DIMS` | Dimensions |
| `*-TEXT` | Text / notes |
| `*-GRID` | Gridlines |
| `*-DETL` | Detail linework |
| `*-PATT` | Hatch / patterns |
| `*-SECT`, `*-ELEV` | Section / elevation markers |
| `*-NPLT` | Non-plotting |
| `DEFPOINTS`, `0` | AutoCAD system layers |

## How it feeds GhostBuilder (deterministic-first)

1. **SENSE** reads each DWG layer.
2. **Ignore:** a layer matching the standard's `ignore` globs, or a built-in annotation token (`ANNO`, `TEXT`, `DIM`, `GRID`, …), never reaches the review.
3. **The installed standard:** an exact layer or an alias of the project's `layers@n` gets its category and family deterministically — no AI. These rows are `standard`, and they are the only rows the review pre-ticks.
4. **The project's cache:** an answer the local model gave before on this project, under the same `layers@n` sha (`%AppData%\Sentinel\cache\<key>\dwg_mappings.json`) — a `cache` row.
5. **Heuristics:** a `D-MAJR` parse (`A-WALL-…` → Walls) or a keyword (`WALL`, `DOOR`, …) proposes a generic family — a `heuristic` row, never pre-ticked. With no `layers@n` installed, every model layer is a heuristic or a model guess.
6. **The local model** proposes the rest — an `llm` row, never pre-ticked. If it cannot be reached, those layers read `unmapped` ("not mapped — local model unreachable") and every row above is kept.

The review window's header names the standard: `Layers: layers@n · source · sha`, or `Layers: none — not installed for <key> or its office`. The compliant-rename suggestion and the compliance verdict exist only in the TypeScript reference (`WebApp/src/sentinel-core/layers.ts`), which no tool runs yet.

This is what keeps an autonomous build reliable: the standard carries the common cases; the AI is reserved for genuine ambiguity, not for guessing at chaos.

## Compliance / enforcement

The file carries `enforce`: `reject` (a non-compliant layer should block the build), `warn` (build and flag) or `off` (no layer checking). **Revit does not apply it:** Ghost Builder reads `standard`, `layers` and `ignore` only, maps every layer by the tiers above and leaves the decision to the reviewer's ticks. The TypeScript reference computes the verdict (`validateLayers`), but no tool calls it; until one does, `enforce` states an intent, it is not a gate.

## The machine-readable ruleset

`demo/bds-pilot/bds-layers.json` is the BDS standard as data. It reaches Ghost Builder only as an artefact: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers` (from `WebApp`) installs it on the office as `layers@n`, and every project attached to the office (`demo`) inherits it. Editing the standard = editing that file and installing it again (`layers@n+1`); no code change, and no copy on a workstation or beside the add-in. The office-agnostic profile is `config/base-standard/layers.json`.
