# MA-5b-6 — Ghost Builder wall joins (GHB-6 remainder) Implementation Plan

> **For agentic workers:** executed inline (the founder's low-usage rule: direct work, one review at the end).

**Goal:** Ghost Builder's DWG path gives walls that meet: each paired wall's end on the centreline of the wall it meets, one wall
through a drawn door or window where the drawing broke it in two, walls drawn as closed outlines paired like lines — and a speed pin.

**Architecture:** pure 2D in `WallPairing.cs` (tested offline by `tools/wallpair-check`), wired in `GhostWallPairer.PairWalls` (the
Revit half). Nothing new reaches the bridge: Ghost files the same `create` walls, now with joined lines.

**Spec:** `docs/strategy/2026-09-30-revit-addin-audit.md` GHB-6 ("0 corner gaps and no overlap warnings; under 2 s for 10k
segments"); `docs/superpowers/plans/2026-10-11-ma5b1-drawing-rooms.md` row 5b-6 (trimEnds port, joins across blocks, closed loops).

## Decisions

1. **Corners — the bridge's `trimEnds`, ported** (`WebApp/bridge/survey-plan.mjs`): each end of a paired wall moves along its own line
   to the nearest centreline of another paired wall it meets — within that wall's thickness + 50 mm of the end, not within 10° of
   parallel, the crossing point on that wall's line (± its own thickness + 50 mm past its ends). Both ends are read from the untrimmed
   walls, so the order never matters. A wall the trim would turn inside out (shorter than 1 mm) is left as it is. Unpaired lines
   (thickness 0) neither trim nor are trimmed to. Across every Walls row of the build (an exterior layer meets an interior one).
   - L corner: each centreline overshoots by half the other's thickness (the run on to the outer corner) → both end at the centrelines'
     crossing. T: the stem stops at the through wall's face → it reaches its centreline. A crossing's two walls are untouched (no end).
2. **Pieces at an opening joined:** two paired walls on ONE Walls row, of one thickness (± 1 mm), on one line (within 0.5° and 1 mm),
   consecutive along it (no wall of that row on that line between), at most `PlacementGeometry.BrokenReachMm` (2000 mm) apart, with a
   door or window (a Doors or Windows row's block middle, or an outline's centroid) in the gap — along it within 1 mm of the gap's ends,
   across it within half the thickness + `HostTolMm` — are ONE wall over both (the first piece's direction and face). Repeated, so
   wall–door–wall–window–wall is one wall. Without an opening between them, two pieces stay two (a gap a person drew).
   Before the trim (the joined wall's ends trim as one).
3. **Closed outlines on a Walls row:** a loop whose edges are all straight is paired with the row's lines (its edges are its faces, its
   short edges its caps); a loop with an arc passes through unchanged, as today.
4. **Words:** a door whose wall pieces were not joined says why in Snap's reason: `BrokenWallNote` = "its wall pieces were not joined
   through it (GHB-6 joins two pieces of one thickness on one line, at most 2000 mm apart, the opening between them)". Ghost's summary
   line follows it.
5. **Speed:** `tools/wallpair-check` pins 10,000 shuffled segments (5,000 walls on one row) through Pair + JoinAtOpenings + TrimEnds in
   under 2 s.

## Files

- `SentinelAddin/GhostBuilder/WallPairing.cs` — `TrimEnds(IList<PairedWall>)`, `JoinAtOpenings(List<PairedWall>, IReadOnlyList<(double X, double Y)>, double reachMm, double hostTolMm)`.
- `SentinelAddin/GhostBuilder/GhostWallPairer.cs` — loops exploded; openings read from Doors/Windows rows; join per row; trim across rows.
- `SentinelAddin/GhostBuilder/PlacementGeometry.cs` — `BrokenWallNote` words. `SentinelAddin/Commands.GhostBuilder.cs` — the summary line.
- `tools/wallpair-check/Check.cs` — L, T, crossing, inside-out, unpaired, order; joins (door, window, chain, no opening, two thicknesses,
  off line, too far, another row); loops; speed. `tools/wallpair-check/SampleRun.cs` — corner gaps on the sample DXF = 0.
- `tools/promote-check/Blocks.cs` — the BrokenWallNote pins.

## Review focus

1. A trim that moves an end onto a wall it merely passes near (a parallel neighbour, a wall across a corridor) — the 10° and the reach.
2. A door block between two pieces of DIFFERENT walls that happen to be collinear (two rooms' walls either side of a corridor door).
3. A loop that is a column or a shaft outline on a Walls row — paired into thin walls it used to file as its edges.
4. A joined wall over a gap with no door now hosting a window that was a person's gap before.
5. Units: the pairing runs in mm (ToSeg), the trims in mm, the Line rebuilt in feet.

## Drill MA5b6 (batch 2)

- G-0: Ghost Builder on a DXF with an L, a T and a door block in a broken wall (fixture `demo/ghost-sample/ma5b6-joins.dxf`, written by
  a script, example.test only): the review window shows the walls meeting (no gap at the corners), one wall through the door, the door
  hosted; after Apply, Revit's warnings list has no "walls overlap" / "highlighted walls are attached" warning; one Undo removes it all.
