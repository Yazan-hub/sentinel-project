# MA-5b-1 — Rooms from the drawing (C7, PDF path) — as built

**Goal:** a room label on an admitted PDF plan becomes a proposed Revit room, named and numbered as drawn, placed only when a person ticks it
and only where the walls close.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md (MA-5: "Rooms from closed loops, named from the drawing text (C7)"; drill MA5:
"Rooms are placed and named, and the IDS room checks pass").

**Founder:** "go ahead with MA-5b" and "can u run all phases all together?" (2026-10-11): MA-5b runs slice after slice, built, reviewed,
merged, then drilled in batches.

## MA-5b slices (the order this run builds them)

| # | Slice | Live drill |
|---|---|---|
| **5b-1** | Rooms from the drawing (this plan) | MA5b1 below |
| 5b-2 | GHB-3 + DAT-4: Ghost/Datum DWG hygiene (an edited DWG is read again; the import a run made is gone on Cancel; units) | Revit only |
| 5b-3 | C13a: revision compare, read-only on the model (PDF path; `revises: <item>` on Propose; B's walls against A's filed walls) | B against A |
| 5b-4 | C13b: `reshape` op with an as-placed stale guard (hand edits kept and reported) | the rest of the MA5 revision row |
| 5b-5 | Promote rehost + placeholder swaps | Photo Massing doors rehosted |
| 5b-6 | GHB-6 remainder (trimEnds port, joins across blocks, closed loops) | sample DXF 0 corner gaps |
| 5b-7 | DAT-1 + DAT-2 (datum layers, the WPF grid, grids de-duplicated) | Revit only |
| 5b-8 | DAT-5: angled and arc grids | radial DWG |

The MA5 drill row "Revision B of the sample DWG" is proved on the PDF path first (5b-3/5b-4: cids, job binding, bridge-built trust); Ghost's
DWG joins the same compare once Ghost files a geometric key.

## Decisions (as built)

1. **A room is a create kind, not an op** (`create`, kind `room`): it fits OPS × kind and the executor's per-kind loops. The design's
   `create_room` line is corrected.
2. **The reader finds labels; Revit proves the loop.** No loop tracing: a label's words are joined (heights within 60 %, one line at most a
   word height apart, the next line at most two heights below and overlapping across); its number is the first word like `101`, `1.01` or
   `12A`, its name the words with a letter. It is a room's label when the name has two letters or more and a ray from its centre hits a wall
   centreline each way (left, right, down, up). Labels with the same four nearest walls are ONE room: the tallest names it; the others are
   kept as `also` (at most 8). Door tags (one word or three) and areas (`12.5 m²`: the unit and the number before it) are no label's words.
   Ceiling (`ponytail:` in PlanReader): an L-shaped room labelled twice reads as two rooms — Apply refuses the pair; a turned label is not read.
3. **The bridge proposes** `{op: create, kind: room, validate.identity {Class: IFCSPACE, Name: number ?? cid, LongName: name}, place
   {LevelName, Location [x, y, E], Name, Number?}}` on the storey's level (the scan's too, even unchecked: a room needs no height), inferred and
   never pre-ticked. **Held** (a review row, not proposed) when a wall round it is a type gap not filed and not matched by the scan, or is not
   a wall of the drawing. Rooms count toward the 200-element cap. No number drawn: Revit numbers it, and the reason says so.
4. **Revit** (ChangesetExecutor, after every wall and point family, Regenerate first): a room already standing at a point is refused; then
   `NewRoom(level, UV)` per room, its Name and Number set; Regenerate; two rooms in one enclosed area are refused, then a room with Area 0
   (not enclosed). Each refusal is `PlacementRefused`: rolled back whole and the changeset **stays proposed** — the person changes the ticks
   and applies again (a room's refusal is the ticks or the model, not a verdict on the changeset).
5. **The base drill plan is unchanged** (its sha is admitted in earlier drills): `drill-plan-L00-rooms.pdf` is the same plan plus OFFICE 101
   (with a level note `FFL +0.00`, kept as `also`) and MEETING ROOM 102.
6. The vocabulary grows by `room` (bridge VOCABULARY, `Number` in PLACE_KEPT and the add-in's PlaceDto, `Location`/`Number` on a room only);
   KIND_ENTITY is unchanged (it is the add-in's shared table for set_parameter): the planner writes IFCSPACE itself, as it writes a level's
   IFCBUILDINGSTOREY.

## Files

- `drawing/PlanReader.cs` — Word box (L, B, R, T; horizontal words only), `Room`, `Reading.Rooms`, `Rooms()` and `Ray()`.
- `drawing/Job.cs` — 0.2.0; room candidates `drawing-<item>-p1-room-<n>` {Location, name, number?, also, walls, page, units}, measured
  {text_height_paper_mm}; the receipt counts rooms.
- `drawing/make_drill_plan.py` (+ test) — the `rooms` variant and its expected rooms; `drawing/fixtures/drill-rooms-ids.json` (the drill's IDS).
- `tools/drawing-check/Check.cs` — the rooms plan (2 rooms, each inside its walls, its four walls, `also`); the base plan has none; 9
  synthetic cases.
- `WebApp/bridge/build-jobs.mjs` — DRAWING_KINDS + room; a room candidate's fields checked (one line each, bounded).
- `WebApp/bridge/changesets-logic.mjs` — VOCABULARY + room, UNTYPED, the room's place checks; `changesets-store.mjs` needsTyping.
- `WebApp/bridge/drawing-plan.mjs` — planner 0.2.0, the rooms loop.
- `WebApp/bridge/mcp-server.mjs` — the propose tool describes rooms.
- `WebApp/src/setups/evidence.ts` (room(s) on the job line), `review-desk.ts` (a room's row: `101 · OFFICE · L00`).
- `SentinelAddin` — PlaceDto.Number; ChangesetExecutor's room block; PlacementRefused's doc; the overlay's cross; the review row's name.
- `tools/promote-check/Ma5b1.cs` — overlay, PlaceDto, executor order and refusals, the review row.
- Fixtures: `WebApp/bridge/fixtures/drawing/drill-plan-L00-rooms-result.json` (the real worker on the rooms plan);
  `contract2-drawing.json` planner 0.2.0.

## Live drill MA5b1 (on ma4c-drill; attestation (b) #2318 and req-0001 are in place)

A fresh storey (elevation 3000: no scan there), so nothing is matched or proposed twice.

| Row | What happens | Pass when |
|---|---|---|
| P-0 | Copy `drawing/fixtures/drill-plan-L00-rooms.pdf` into `%APPDATA%\Sentinel\evidence\ma4c-drill\drawings`; admit under req-0001 | `ev-…` with sha `be256ceb…` |
| P-1 | Read drawings | `5 wall(s), 2 door(s), 2 room(s)`; job reader sentinel-drawing 0.2.0 |
| W-1 | Propose: marks A (60,40)→(40000,0), B (220,160)→(48000,6000), check (220,40)→(48000,0), elevation 3000, level blank | a level is created; 1:50 |
| W-2 | The changeset | MEETING ROOM 102 proposed (its reason names its 4 walls), OFFICE 101 held "bounded by …wall-3, a type gap" (the 250 wall); none pre-ticked |
| D-1 | Review desk | the row reads `102 · MEETING ROOM · <level>`; its IDS verdict under the installed IDS (optional: install `drawing/fixtures/drill-rooms-ids.json` with `node bridge/artefact-import.mjs … --kind ids` first) |
| R-1 | Revit 2024 review window, Show | `room: 102 · MEETING ROOM · <level>`; the overlay draws its cross |
| R-2 (negative) | Tick everything but the east wall, Apply | refused: "room 102 MEETING ROOM is not enclosed …"; nothing placed; the changeset stays proposed |
| R-3 | Tick all, Apply | the room placed, named and numbered; Area about 19.80 m² (3600 × 5500); its phase the walls' |
| R-4 | Ledger and provenance | `changeset_applied` names the room's cid and Revit id; Provenance on the room shows the changeset |
| R-5 | Ctrl+Z | the room and the walls gone; `changeset_reverted` |

Not yet proved (each has a row): `NewRoom(level, UV)` at an open point gives Area 0 with a warning, not a throw (R-2); the phase NewRoom
uses (R-3); Revit's IFC export writing Number → IfcSpace.Name and Name → LongName (an optional IFC export run).

## Checks

drawing-check (all pass), `python -m unittest test_make_drill_plan` (5), bridge+web vitest (all pass, the new room cases included),
promote-check 896, the add-in builds for 2021, 2024 and 2025.

## Review (wf_67d9c9c6-c68) — fixed

- **Important (confirmed): phase.** `GetRoomAtPoint(XYZ)` reads only the last phase, and `NewRoom(level, UV)` places in the last phase, while
  the walls go to the view's phase (PlacementApply). Now: the existing-room check reads the placement's phase; a room Revit puts in another
  phase than the walls' is refused in words ("apply it from a view of the last phase, or untick the room"), the changeset staying proposed.
- **Important (confirmed, reproduced): a window under a label's ray dropped the room.** An opening with no door keeps its two walls apart;
  a ray through it hit nothing (or the next room's wall). Now each doorless opening is a ray target owned by the wall it is in.
- Minors fixed: NewRoom's null or Revit exception is a `PlacementRefused` (was a decline of the whole changeset); the probe uses
  `ProjectElevation` (Elevation reads from the survey point when the level's base is set so); a held room on a storey that files no
  changeset is named on the planner's row and in the Propose line; a 0.1.0 reader's job counts no `room` (it never looked); rooms past the
  200-element cap wait as review rows instead of a 413 for the whole drawing; an area's number is found by its place, not the word order;
  text drawn twice (synthetic bold, an overlay) is read once (PdfPig's DuplicateOverlappingTextProcessor).
