# BDS DWG Layer Standard (v1)

The layer naming standard that incoming DWGs must follow so GhostBuilder can map layers to families **deterministically** (and so the AI only has to reason about the genuine gaps). It is lineage-compatible with the **AIA CAD Layer Guidelines / US National CAD Standard** and **ISO 13567**, adapted to the BDS family library and Sentinel's IDS.

> Like the naming and IDS rulesets, this is a **configurable reference, not a bible**. BDS is the pilot profile; a future office-agnostic **Base** profile just swaps the ruleset file (`demo/bds-pilot/bds-layers.json`). Enforcement is per-project: `reject` / `warn` / `off`.

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
2. **Compliance check** (the layer gate): does the layer match the standard? Compliant layers get a **deterministic** category/family from this ruleset — no AI needed, confidence = 1.0.
3. **AI only for the gaps:** non-compliant or ambiguous layers are the only ones sent to the interpreter to *propose* a mapping (with a lower confidence) — and to **suggest the compliant rename**.
4. **Non-compliant DWGs** are flagged in the review with the offending layers and a proposed remap to the standard — so the office can fix the source, and the next run is deterministic.

This is what keeps an autonomous build reliable: the standard carries the common cases; the AI is reserved for genuine ambiguity, not for guessing at chaos.

## Compliance / enforcement

Per project, in `bds-layers.json`:
- `reject` — a non-compliant layer blocks the build (strict offices).
- `warn` — build proceeds, non-compliant layers flagged (default — matches the "warn-first" posture).
- `off` — no layer checking (pure-AI mapping).

## The machine-readable ruleset

`demo/bds-pilot/bds-layers.json` is the source of truth GhostBuilder loads (mirrors `naming-ruleset.json` and `bds-ids.json`). Editing the standard = editing that file; no code change. Swap it for a `base-layers.json` to make Sentinel office-agnostic.
