# The Office Modelling Guideline — the missing input, and the Revit Copilot

**Status:** Direction captured 2026-07-23 (maintainer). Not yet built. This is the *why* and the shape;
a build plan follows once the shape is agreed.

## The problem, in the maintainer's words

> *"Building just from reading DWG layers is not enough to get the right modelling structure."*

That is correct, and it is the honest limit of GhostBuilder v2 as shipped. A DWG layer tells you a line
is a wall. It does **not** tell you *which* wall — `BDS_Wall_Ext_200_Blockwork` or
`BDS_Wall_Ext_300_Cavity`. Today that gap is filled by three weak sources:

1. `bds-layers.json` maps a layer to **one** family/type — a single hardcoded guess per layer.
2. The spec PDF, read by the local model, which supplies parameters but not type selection.
3. The reviewer, in the gate, who can only accept or reject — not *choose*.

A human modeller doesn't work that way. They pick a family and type from the office's standard set,
based on what the element *is* and where it sits. That knowledge exists in every practice — usually in
a PDF nobody reads, or in one senior modeller's head.

## The proposal: make that knowledge a machine-readable document

One **Office Modelling Guideline** per practice, defining:

| Section | Defines | Consumed by |
|---|---|---|
| **Element → type** | For each element class and condition, which family + type to place. *External wall, 200mm, blockwork → `BDS_Wall_Ext_200`.* Conditions can key off DWG layer, spec text, level, fire rating, or discipline. | GhostBuilder (replaces the single-guess layer map) |
| **Drawing graphics** | Dimension styles, text styles, line weights, annotation families, tags per element class | The 2D view generator |
| **View standards** | Per view *use* (GA plan, RCP, section, detail): which view template, scale, detail level, what gets tagged | View generation + browser org |
| **Naming + data** | Already exists as `naming-ruleset.json` + `ids.json` — folded in, not rebuilt | The existing gates |
| **Template hygiene** | Which worksets, shared params, browser organisation the template must carry | The existing `StandardsPack` builder |

The payoff the maintainer named: **when the 3D model is finished, the 2D views are already annotated
correctly, because the same guideline that chose the wall type also chose how it is tagged and
dimensioned.** The firm's Revit template stays clean because everything placed came from the standard.

## Most of this already exists — this is unification, not a rebuild

This is the important engineering point. Sentinel already has four of the five sections, scattered:

- `SentinelAddin/Resources/bds-layers.json` — layer → category/family/type (the seed of *Element → type*)
- `demo/bds-pilot/bds-ids.json` — required properties per element (the data section)
- `bridge/naming-ruleset.json` — naming rules
- `StandardsPack` (`Standards/StandardsBuilder.cs`, the Golden-Model Extractor) — worksets, shared
  parameters, **view templates**, browser organisation, with a review window and a transactional build

What is genuinely missing is only:
1. **Conditional type selection** — today one layer maps to one type; the guideline needs rules
   (`if layer = A-WALL-EXT and spec says FR60 → BDS_Wall_Ext_200_FR60`).
2. **The graphics/annotation section** — dimension/text/tag standards, which nothing currently models.
3. **One document that ties them together**, versioned and swappable per office (the D-03 posture:
   BDS is a *reference profile*, not a bible).

## Where the AI fits — and where it must not

- **Authoring the guideline** is the AI's best job here: point it at the office's existing PDFs, a
  golden model, and a few completed projects, and have it *propose* the guideline. That is the
  Standards Document Extractor plus the Golden-Model Extractor, both of which already exist, aimed at
  a new output. A human approves it in the existing review window.
- **Applying the guideline** must stay deterministic. Type selection is a *lookup*, not a judgement —
  the same input must give the same type every time, or the model is not reproducible and the audit
  trail is worthless. The model fills gaps the guideline doesn't cover, flagged as low confidence, and
  the reviewer decides. This is the P1 posture (deterministic first, model only for the remainder)
  extended from layers to types.

## The Revit Copilot

**The Copilot must also live in the Revit add-in, not only the web app** — the modeller is in Revit,
and that is where the questions and the fixes are. It should be the same thing: same providers, same
Ask/Agent switch, same approval gate, driven by the same `/ai/*` endpoints on the bridge so there is
one AI layer, not two.

The difference is the toolset. In Revit the agent can reach what the web app cannot:

- read the open model (elements, types, parameters, views, sheets)
- **place and modify elements** — via GhostBuilder's existing placement engine and review gate
- fix parameters, rename, retype to the guideline
- generate and annotate views per the guideline

Every one of those is a `write`-policy tool in the registry that already exists, so the gate is
already built — it just needs a Revit-side renderer (`GhostReviewWindow` is exactly that window).

**Connecting the Copilot to GhostBuilder** is then natural: *"build the ground floor from this DWG"*
becomes a tool call, the proposal is the same Build Proposal the review window already renders, and
the guideline supplies the types instead of a single-guess layer map.

## Open questions for the maintainer

1. **Guideline format** — extend `bds-layers.json` into a fuller `bds-guideline.json`, or a new
   document that references it? (Leaning: one new document, with the existing files as sections, so
   nothing already working has to be migrated at once.)
2. **Condition language** — how expressive do type-selection rules need to be? Simple
   `when {layer, fireRating, level} → type` covers a lot; anything more becomes a rules engine.
3. **Which first** — the guideline (unblocks better GhostBuilder output) or the Revit Copilot
   (unblocks day-to-day usefulness)? They are independent; the guideline makes the Copilot more useful,
   so guideline-first is the safer order.
