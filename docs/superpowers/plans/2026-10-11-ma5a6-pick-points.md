# MA-5a-6 — Click-to-pick the alignment's marks on the drawing (implementation plan)

> Executed natively on top of MA-5a-5 (branch feature/ma5a6-pick-points), reviewed with it.

**Goal:** in a drawing job's Propose form, the lead clicks A, B and the check mark on a picture of page 1 as sentinel-drawing read it, instead
of measuring paper millimetres off the PDF; where each mark is in the model is still typed.

**Decisions**
1. The picture is the reader's own result (the walls' faces, the doors' points, the page size from the job's receipt) — never the PDF itself:
   no PDF renderer in the web, and the lead picks on exactly what will be proposed.
2. A click snaps to the nearest end of a wall face within 3 paper mm (the drill's marks are the outer corners), else it is taken as
   clicked, to 0.1 mm. The picked value lands in the same "x, y" field a lead can still type in; the bridge decides as before.
3. The next click sets A, then B, then the check; a button picks any mark again. The picture is an inline SVG built as a string with every
   value escaped (html-sinks); y is flipped (paper origin bottom-left).

**Tests:** evidence.test.ts — the SVG (faces, doors, marks, y flip, escaping, another drawing not drawn), snapPaper (corner snap, a click
off every corner), the files-panel click handler pins. Drill: P-2 in the combined MA-5a-4/5/6 drill (click A and B on the drill plan →
"60, 40" and "220, 160").
