# What the BDS template actually contains — and what it means for the Guideline

Harvested from `BDS_Project Number_Project Name (Template).rvt` on 2026-07-23 by
**Sentinel → Build Office System**. Raw data: `demo/bds-pilot/bds-type-catalog.json` (234 types).

| Category | Types | Families |
|---|---:|---:|
| Walls | 91 | 2 |
| Doors | 49 | 11 |
| Floors | 33 | 1 |
| Windows | 29 | 13 |
| Columns | 17 | 7 |
| Ceilings | 11 | 2 |
| Furniture | 4 | 2 |

---

## 1. The wall convention — which BDS-RTG-001 does not document

§8 of the Revit Template Guide covers doors, windows and structural families. It says nothing about
walls or floors. The template does, consistently:

```
BDS_[LOCATION]_[DISCIPLINE]_[MATERIAL]_[THICKNESS] mm

BDS_EXT_ARC_CMU_200 mm          BDS_INT_ARC_GYPS_100 mm
BDS_EXT_STR_CONC_300 mm         BDS_FND_STR_CONC-RAFT_2500 mm
```

| Token | Values found |
|---|---|
| LOCATION | `EXT` · `INT` · `FND` |
| DISCIPLINE | `ARC` · `STR` · `LSE` (landscape) |
| MATERIAL | CMU · CONC · MTL · GYPS · STONE · PORCELAIN · PLS-BEIGE · PLS-WHITE · PLS PAINT · PLS PAINT-MOISTURE RESISTANT · CEM-WATERPROOF |
| THICKNESS | 6 · 15 · 20 · 30 · 50 · 100 · 150 · 200 · 250 · 300 · 350 · 400 mm |

**The thickness in the name matches the real Width parameter on 32 of 32 conforming types.** That is
the finding that decides how GhostBuilder should pick a wall type.

## 2. The answer to "what drives type choice"

Split by where each token can come from:

| Token | Where it comes from | Needs a rule? |
|---|---|---|
| LOCATION (EXT/INT/FND) | the DWG layer — `A-WALL-EXT` already says it | No |
| DISCIPLINE (ARC/STR/LSE) | the DWG layer prefix | No |
| THICKNESS | **measured from the drawing** — two parallel lines give a wall thickness, and the name is truthful about it | No |
| **MATERIAL** | **nothing in the DWG says CMU vs CONC vs GYPS** | **Yes — this is the only real judgement** |

So the guideline does *not* need a rule per type. It needs a rule for **material**, and the rest is
lookup:

> *"External architectural walls are CMU unless the spec says otherwise. External structural walls are
> CONC. Internal architectural walls are GYPS."*

…then match `BDS_{LOC}_{DISC}_{MATERIAL}_{measured thickness} mm` against the catalogue. If that exact
type exists, place it. If it doesn't, that is a reportable gap — never an invented type.

## 3. Doors are the opposite case — and the trap

Door type names carry a size, but **it is not the parameter value**:

```
BDS_EXT_1 PNL_WOOD_1000 x 2100 mm   →  Width/Height parameters = 960 x 1980
BDS_EXT_2 PNL_GLASS_2000 x 2100 mm  →  Width/Height parameters = 980 x 2080
```

The name is the **nominal / structural opening**; the parameters are the **leaf**. Both are legitimate,
but it means the wall approach does not transfer: measuring a 1000 mm opening from the DWG and looking
for a type whose `Width` is 1000 finds nothing. Door matching must use the **name's** nominal size, or
an explicit rule — never the Width parameter.

That is exactly the ambiguity worth resolving before writing door rules, and it could not have been
settled from the document.

## 4. Template hygiene — 59 of 91 wall types are off-convention

Not a guideline problem, but it is the "keep the template clean" concern, with names:

| Issue | Examples |
|---|---|
| **Revit out-of-box types never purged** | `Generic - 200mm`, `M_Exterior - Brick on CMU`, `Interior - 114mm Partition (1-hr)`, `M_Storefront`, `Concrete 450mm`, `Foundation - 900mm Concrete Footing`, `Soffit - 12mm GWB & Metal Stud` |
| **Test types left in the shipped template** | `TEST_FamilyCheck_100mm` … `TEST_FamilyCheck_300mm` (5 types) |
| **Legacy naming, duplicating current types** | `BDS_ARCH_WALL_EXT_MTL_50_mm` **and** `BDS_ARCH_WALL_EXT_MTL_5_CM` **and** `BDS_EXT_ARC_MTL_50 mm` — three names, one 50 mm metal external wall. `5_CM` also mixes units. |
| **Non-ASCII character in a type name** | `BDS_ÊXT_LSE_CONC_100 mm` and `…_200 mm` use **U+00CA (Ê)** where `E` was intended. Visually near-identical, breaks any text rule, and sorts wrongly. |
| **Inconsistent classification** | `BDS_EXT_ARC_STONE_50 mm` has Assembly Code `B2010160`; every other external wall has `B2010`. |
| Landscape typo | `BDS_LSE_WALL_CONC_150_mm` uses the old token order |

The homoglyph is the one to fix first: it is invisible in the Revit UI and would silently defeat any
guideline rule matching on `BDS_EXT_…`.

## 5. What this changes in the Guideline

1. Replace the invented `BDS_Wall_Ext_200_FR60` style types with real catalogue names.
2. Replace the invented view templates with the template's real ones (`01.100_WIP_FLOOR_PLANS`,
   `02.100_SHEET_FLOOR_PLANS`, …) — 32 of them, already visible in the extractor output.
3. Write **material rules**, not type rules, for walls.
4. Write **nominal-size** rules for doors, and do not match on the Width parameter.
5. Add "type exists in the catalogue" as a validation step, so a guideline can never name a type the
   template lacks — the mistake that shipped once already.
