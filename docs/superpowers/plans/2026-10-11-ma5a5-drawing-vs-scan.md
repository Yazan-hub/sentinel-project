# MA-5a-5 — Drawing against scan: differences as review rows and BCF topics (implementation plan)

> Executed natively, on top of MA-5a-4 (branch feature/ma5a5-drawing-vs-scan from feature/ma5a4-drawing-align), one whole-branch review.

**Goal:** when a lead proposes a drawing on a project whose scan walls are already filed on the same storey, the bridge compares them: what
agrees is not proposed twice, a door the scan did not see is proposed from the drawing in the scan's wall, and every difference becomes a
review row on the drawing's changeset and ONE BCF topic — the same difference never raises a second topic on a re-run.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md MA-5 ("Drawing-only ghosts are inferred … Conflicts become review rows. A
difference between drawing and scan becomes a BCF topic"; drill MA5: "A door closed during the scan is proposed from the drawing, flagged
inferred, and accepted by a person"; "A planted drawing-vs-scan difference gives exactly one BCF topic"); docs/research/2026-09-30-reality-to-model.md
§6.6 conflict rules ("Where the scan covers an area, the scan wins on geometry. The drawing wins on openings the scan cannot see. Every conflict
becomes a review row that shows both pieces of evidence").

## Decisions

1. **The scan's walls are its filed changesets'**: survey changesets (job.reader `sentinel-survey …`) proposed, applied or partially applied,
   their storey within 20 mm (TOLERANCE_MM) of the drawing's level height; each wall create less what Revit rejected, at its filed place
   (model mm) and its measured thickness. Read from the changesets proposeFromJob already reads (no new read, no scan re-read).
2. **The drawing takes the scan storey's level** when no published level is named or matched and a scan storey is within 20 mm (`how: "scan"`,
   checked as the scan's) — a door the drawing adds must be on the scan wall's level to be hosted in it.
3. **Matching**: a drawing wall (its drawn centreline in model mm, untrimmed) matches the scan wall that is parallel within 5°, overlaps ≥ 50 %
   of the shorter, and whose centreline is nearest, within 300 mm. Several drawn pieces may share one scan wall (a wall split at a window), and
   the scan walls on a match's line (within one paper mm) are one wall's fragments: all covered (review). A building scanned again files its
   walls again — copies within 50 mm count once, applied first.
4. **The noise**: position — one paper millimetre, `S = scale × 1 mm` (50 mm at 1:50); thickness — under half the office's 50 mm type step,
   `THICK_MM = 25` (review: S let a 250 mm drawn wall agree with a 300 mm scanned one). Matched with offset ≤ S, |thickness difference| < 25 mm and
   its trimmed length covered but for ≤ 2 S → **agrees**: not proposed (the scan's wall stands). Otherwise → **differs**: not proposed (the scan
   wins on geometry), a review row and a topic.
5. **Drawn, not scanned**: an unmatched drawing wall inside the scan's extent on that storey (the scan walls' bounding box) is proposed
   (inferred, as MA-5a-4) with the difference in its reason, plus a topic. Outside the extent it is simply proposed.
6. **Scanned, not drawn**: a scan wall inside the drawing's extent (the drawing walls' bounding box in model mm, grown by S) that no drawing
   wall matches → a review row (an exception on the drawing's changeset) and a topic.
7. **Doors on a matched wall** are hosted in the scan wall: the drawing door's model point projected onto the scan wall's filed centreline. A
   filed scan door on that wall within (its width / 2 + S) → agrees, not proposed. Else proposed from the drawing (inferred; the reason says the
   scan did not see it — a closed door, or seen on one face only). No topic: the drawing wins on openings the scan cannot see.
8. **A topic per difference**, title `Drawing vs scan: <item> <what>`, topic_type "Issue", priority "Normal", creation_author the lead;
   `topic.difference = {key, item, drawing_cid, scan_cid, scan_changeset, scan_job, drawing_job, kind}`; dedup by `difference.key` against
   every topic of the project, any status (a closed one is a person's decision — never re-raised). The key: drawing bytes' sha + drawing cid
   (or none) + the ONE scan wall's job ledger id (or none) + scan cid (or none) + kind — stable across re-runs, alignment changes, re-proposals
   and another scan filed on the storey (review). A drawing whose differences are not all raised yet passes the "nothing new" 409, so the
   words "propose the drawing again" raise them; a filed drawn-only wall is still a difference.
9. **Topics after the filing**: raised after the changeset and before the planner row; the planner row and the reply list them
   (`differences: {agree, differ, drawn_only, scanned_only, doors_from_drawing, topics: {raised, skipped}}`). A topic write that fails is said
   on the reply and the row (the changeset stays filed; Propose again raises what is missing — dedup makes it safe).
10. **One direction only**: a drawing proposed onto a scan. ponytail: a scan proposed onto a filed drawing is not compared (the drawing's
    ghosts are inferred and unticked anyway); add when an office scans after drawing.

## Review focus

1. A planted difference (the drill's west wall drawn 250 mm, scanned 300 mm) → exactly one topic; Propose again → still one.
2. A door the scan did not see → proposed hosted on the scan wall's centreline (within 1 mm of its line), on the scan's level.
3. Everything agreeing → no changeset, the planner row and the line say why (agree N); a 409 "nothing new" is not raised for it.
4. No scan on that storey → MA-5a-4 behaviour unchanged (every MA-5a-4 test still passes).
5. Topic write refused (the store down) → the reply says topics not raised, nothing else lost.
