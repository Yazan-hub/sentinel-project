# MA-5b-3 — Drawing revision compare, read-only on the model (C13a, PDF path) — as built

**Goal:** a revised drawing (B) proposed against the earlier one it revises (A) proposes only what is new; what is the same is left as
placed, and what changed or is no longer drawn is a person's row. Nothing is deleted or reshaped by Sentinel (reshape is MA-5b-4).

**Spec:** docs/strategy/2026-09-30-model-automation-design.md :391-394 (revision update: compare A with B, protect manual edits, never delete
automatically), :406 (read Horizun's DWG-to-BIM contract first), :1186/:1193 (drill MA5's revision row). Founder: "go ahead with MA-5b", "can
u run all phases all together?" (2026-10-11).

## Horizun's DWG-to-BIM contract, as read (2026-10-11, design :406's prerequisite)

Summarised in our words (github.com/HorizunGroup/horizun-revit-mcp, docs/DWG-TO-BIM.md, Apache-2.0):
- Identity is a quantised fingerprint of what a drawing entity is and where it sits, recorded as provenance on the element; matching climbs a
  ladder (same entity and issue → same entity re-cut → same shape → only a position) and each match says the rung it reached.
- Hand edits: the provenance keeps the geometry each element was built with; the current model against it tells a drawing change from a
  person's; no record → review, never a guess (`manually_diverged`, `conflict`).
- A closed list of update actions (moved, reshaped, retyped, resized, rehosted, added, removed, unchanged, ambiguous, conflict); splits and
  merges are offered for a decision, never applied.
- **Nothing is ever deleted automatically**: a removal is a person's decision (`built_not_in_drawing` / `drawing_not_built`).
- Each source is hashed; that one file supersedes another is the user's statement (`supersedes_sha256`) — nothing in a DWG says it.
- Tolerances it states: point 1 mm, gap 25 mm, angle 2°; an apply refuses a plan whose sources drifted since planning.

What Sentinel takes: the lead states `revises` (as Horizun's `supersedes_sha256`); removals are a person's rows; the as-placed record is what a
later change is judged against (C13b: the stale guard). What differs: Sentinel's identity is the bridge's filed record (cid → proposal_guid
→ Revit UniqueId on the changeset doc), matched geometrically (the MA-5a-5 matcher), with the drawing's own scale as the noise.

## Decisions (as built)

1. **The lead names the earlier drawing:** `revises: <its evidence id>` on Propose (optional; not this drawing; an id). No evidence-schema
   change; retiring A stays with MA-7.
2. **What A filed** (`priorOf`): A's drawing changesets proposed or placed (applied first), each create less what Revit rejected — walls (with
   the thickness filed), doors, rooms, each with the Revit UniqueId it was placed as. A filed nothing → 409 in words.
3. **B is A's storey:** on A's level at A's height (`how: "revision"`); another level or another height is refused in words. No level is
   created again.
4. **Walls** (the MA-5a-5 matcher against A's filed walls, before the scan's): the same (within one paper mm, thickness under 25 mm apart,
   covered) → not proposed (`unchanged`); matched but moved, re-thicknessed or longer → a person's row "changed since A — …: <A's wall>
   stays as placed; a person updates it in Revit" (`changed`; MA-5b-4 proposes the reshape); no match → the existing path (the scan, a gap,
   proposed). A wall of A that B no longer draws → a person's row "on A, not on B — placed from … (Revit <id>): Sentinel never deletes".
5. **Doors:** a door on a wall matched to A's goes into A's wall as placed (its point onto A's filed centreline, A's level); one A filed there
   (within half its width and the noise) is the same door. A door of A with no door of B within 300 mm → a person's row.
6. **Rooms:** the same number and name as one A filed → the same room; a room of A that B no longer labels → a person's row.
7. **Said:** the planner row, the reply and the Propose line carry `revision` {unchanged, changed, removed, doors_…, rooms_…}; the web desk
   now lists every changeset's held rows ("Held for a person in …"), and names what a drawing revises.

ponytail: a placed element is taken as placed — an Undo in Revit leaves its changeset applied here (decision 19's rule); C13b reads the model
before it changes one. A moved wall beyond MATCH_MM (300 mm) is "removed + added", never "moved".

## Files

`WebApp/bridge/drawing-plan.mjs` (BODY + revises, `priorOf`, storeyOf's revision storey, the prior matching, rows), `changesets-store.mjs`
(prior → planDrawing, 409, `revision` on the row and the reply), `WebApp/src/setups/evidence.ts` (revises in the body, the revision words),
`files-panel.ts` (the revises field), `review-desk.ts` (`heldLines`, the held rows, "revises" in the source line); `drawing/make_drill_plan.py`
(`inner(px)`, `doors(px)`, the rev-b variant; old fixtures byte-identical), `drawing/fixtures/drill-plan-L00-rev-b.pdf`,
`WebApp/bridge/fixtures/drawing/drill-plan-L00-rev-b-result.json`; checks in drawing-check, test_make_drill_plan, drawing-plan.test,
changesets-store.test (h), evidence.test, review-desk.test.

## Live drill MA5b3 (after MA5b1 on ma4c-drill: A = the rooms plan, applied at 3000)

| Row | What happens | Pass when |
|---|---|---|
| B-0 | Copy `drawing/fixtures/drill-plan-L00-rev-b.pdf` into the drawings folder; admit under req-0001; Read drawings | `ev-…` sha `4168915c…`; 5 walls, 2 doors, 2 rooms |
| B-1 | Propose with the same marks, elevation 3000, revises = A's evidence id | the line says "against <A>: 3 wall(s) the same (left as placed), 0 changed, 1 no longer drawn …"; ONE changeset on A's level (no level created) holding the moved partition (and its door if typed) |
| B-2 | Review desk | "Held for a person in …" lists A's partition "on <A>, not on <B> … Sentinel never deletes" with its Revit id |
| B-3 | Revit 2024 review window | the same row, untickable; Apply the partition → placed beside A's (A's untouched) |
| B-4 | Propose B again | "nothing new" |
| B-5 | Propose with revises = an id that filed nothing | 409 in words |

## Review (wf_579e590d-cfa) — 5 important confirmed (each by two reviewers), all fixed

- **A chain (C revises B, B revised A) re-proposed A's walls on top of A's:** `priorOf` follows `alignment.revises` down the chain — what
  B left as placed is still A's, and placed (nothing is deleted); `chain` names the drawings read.
- **A wall B shortens or splits counted "the same":** the cover is checked both ways — how much of A's wall B's walls on its line still
  draw; under all of it by more than two paper mm is "changed since A — B draws X of A's Y mm".
- **B proposed again without `revises` proposed A's walls again:** `revises` is part of the drawing's one alignment (decision 19's 409
  names it).
- **A door A placed in the scan's wall was proposed again by B:** a door within half its width of one the earlier drawing placed is that
  door, whichever wall hosts it.
- **A revision that files nothing new said its rows nowhere:** its changed / no-longer-drawn rows ride on the planner's row and the reply
  (`held`), said in the Propose line as revision rows.
- Minors fixed: the 409 for an A still proposed from another job says "apply it in Revit first" (it looped into "filed nothing"); the
  "filed nothing" 409 names the case of a revision that filed nothing new; unnumbered rooms of one name are the same room only within
  1 m of where it stood; a room is not held behind a wall A placed that B's typer gaps; a B wall beside an A wall another B wall stands
  for is new, not "changed". Kept as ponytails: a door B resizes is the same door; an A filed on two storeys (one drawing is one
  alignment, so it is not); A proposed in the same job (Revit refuses a host-less door in words).
