# BDS CAD layer template

One-click setup so every drawing starts on the [BDS DWG Layer Standard](../../../docs/BDS_DWG_LAYER_STANDARD.md) — which is what lets GhostBuilder map layers to families **deterministically**.

## Files

- **`BDS-Layers.scr`** — an AutoCAD script that creates all 27 standard layers with sensible colors + lineweights (21 model layers GhostBuilder reads + 6 annotation/drafting layers it ignores).

## Use it (once) → make a template for everyone

1. Open a **blank drawing** in AutoCAD (full) or BricsCAD.
2. Run the script: type **`SCRIPT`** ↵, pick `BDS-Layers.scr`. All layers appear (current layer is set to `A-WALL-EXT`).
   - *Or* drag the `.scr` onto the drawing window.
3. **Save As → AutoCAD Drawing Template (`.dwt`)** → name it `BDS-Template.dwt`, put it in your Templates folder.
4. Distribute that `.dwt`. Drafters **File → New → BDS-Template** and every drawing is on-standard from line one.

## What it creates

| Group | Layers |
|---|---|
| Walls | `A-WALL-EXT` `A-WALL-INT` `A-WALL-FIRE` `A-WALL-PART` `A-WALL` `S-WALL` |
| Openings | `A-DOOR` `A-WIND` |
| Horizontal | `A-FLOR` `A-FLOR-FNSH` `A-CLNG` `S-SLAB` |
| Vertical / frame | `A-COLS` `S-COLS` `S-BEAM` |
| Other model | `A-FURN` `A-EQPM` `A-STRS` `A-ROOF` `M-DUCT` `P-PIPE` |
| Annotation (ignored by GhostBuilder) | `A-ANNO-TEXT` `A-ANNO-SYMB` `A-DIMS` `A-GRID` `A-DETL` `A-PATT` |

## Notes

- **Colors/lineweights are conventions** — adjust them to house style freely. What GhostBuilder cares about is the **layer name**, so keep those exactly.
- **AutoCAD LT** doesn't run `.scr` scripts; make the `.dwt` once on a full-AutoCAD/BricsCAD seat, then LT users start from the template normally.
- To evolve the standard, edit [`../bds-layers.json`](../bds-layers.json) (the machine-readable ruleset) and regenerate the layers here to match.
- Put objects on the layer that matches what they *are* (an external wall on `A-WALL-EXT`, its dimensions on `A-DIMS`). Non-compliant layers still work — GhostBuilder's aliases catch common variants and the AI proposes a remap — but every compliant layer is one the model never has to guess about.
