# MA-5b-8 — Angled and arc grids (DAT-5) Implementation Plan

> **For agentic workers:** executed inline (the founder's low-usage rule: direct work, one review at the end). Stacked on MA-5b-7.

**Goal:** Datum from Drawings keeps a grid drawn at any angle (a wing at 30°) and creates arc grids from arcs (a radial plan), named so
the office's GR-01 (`[A-Z]{1,2}` or `\d{1,3}`) passes — and never turns a grid bubble or a leader into a grid.

**Spec:** `docs/strategy/2026-09-30-revit-addin-audit.md` DAT-5 ("a radial DWG gives arc grids within 5 mm, and a wing at 30° is
kept"); `docs/superpowers/plans/2026-10-11-ma5b1-drawing-rooms.md` row 5b-8.

## Decisions

1. **Which lines are grids:** every straight line on a grid layer at least a quarter as long as the longest one there (a bubble's
   leader, a tick, a dimension stub is shorter) — any angle. Lines are grouped by direction (within ~1.15°, the old 2 % slope, so hand-drawn square grids group as before); within a direction, lines
   whose offsets are within the merge tolerance are one grid (the longest kept), as today.
2. **Which arcs are grids:** an arc on a grid layer whose radius is at least a quarter of the longest grid line and that is not a whole
   circle (a bubble is a small circle; Revit makes no grid of a full circle — said). Arcs of one centre (within 5 mm) and one radius
   (within the merge tolerance) are one grid (the longest kept).
3. **Names (GR-01):** numbers for the lines within 45° of vertical, and for the spokes of a radial plan (a line whose extension passes
   within 5 mm of an arc grid's centre); letters (skipping I and O) for the lines within 45° of horizontal and for the arcs. Numbers run
   by direction (the one nearest vertical first), then left to right; spokes (the lines of a direction that all pass through an arc's centre)
   one centre at a time, anticlockwise from just after the fan's widest gap. Letters run
   by direction (the one nearest horizontal first), then bottom to top; arcs by radius, inner first, after the lines. A drawing of plain
   orthogonal grids is named exactly as before.
4. **Revit:** an arc grid by `Grid.Create(doc, Arc)` (centre, radius, start and end angle as drawn); one in the model of the same centre
   and radius (each within 10 mm) is the one kept. An angled line goes through `Grid.Create(doc, Line)` as any other.
5. **Review window:** a row says how it runs — "numbered, at 30°: (x, y) → (x, y)", "lettered, arc: centre (x, y), radius r mm, a0°–a1°".

## Files

- `SentinelAddin/GhostBuilder/DatumFromDrawing.cs` — `DetectedGrid` arc fields, `GridArc` input, `Grids(lines, arcs, …)`, `SameArc`.
- `SentinelAddin/GhostBuilder/DatumBuilder.cs` — arcs collected from grid layers; `CreateGrid` for arcs; position de-dup for arcs.
- `SentinelAddin/UI/DatumReviewWindow.cs` — the run text.
- `tools/datum-check/Check.cs` — wing at 30°, radial (arcs within 5 mm, spokes numbered by angle), bubbles and ticks ignored, a full
  circle said, orthogonal naming unchanged, every name GR-01-legal; the radial fixture.
- `demo/ghost-sample/make-datum-sample.py --ma5b8` → `ma5b8-radial.dxf` (arcs and spokes on S-GRID-IDEN, a 30° wing, bubbles).

## Review focus

1. A plan whose grid layer also holds the building outline or a north arrow (long lines at odd angles) — named as grids.
2. A spoke that passes near the centre of an arc it is not related to.
3. Two directions both within 45° of vertical (a 40° wing beside verticals) — numbering order stays stable across runs.
4. Arc start/end angles in Revit's frame (counter-clockwise from +X) vs the DXF's.
5. Units: arcs read from the import in feet, the pure code in mm.

## Drill MA5b8 (batch 2)

- R-1: Datum on `ma5b8-radial.dxf`: the review lists the spokes (1..5), the wing (A, B, C, lettered at 30°) and the arc grids (D, E, F); Create:
  the arcs in Revit within 5 mm of the drawn radii; the wing kept at 30°; no grid from a bubble.
