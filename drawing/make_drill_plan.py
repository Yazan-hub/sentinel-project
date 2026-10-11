#!/usr/bin/env python3
"""Write the MA-5a-3 drill plan: the drill building's L00 as a vector PDF at 1:50, and what a reader must find in it.

Run:  python drawing/make_drill_plan.py

Writes drawing/fixtures/drill-plan-L00.pdf, drill-plan-L00.expected.json and the reader check's variants
(drawing/fixtures/variants/): one-weight.pdf (every stroke 0.70 pt), stray-arc.pdf (the partition door's swing moved
into the east room: no door there, the partition stays two walls, the arc in the room is no door) and two-page.pdf.

The building is survey/test_survey.py building(): outer faces x 0..8000, y 0..6000; walls west 250, south 300,
north 200, east 300 thick; plus a 100 mm partition at x 4000..4100 (y 300..5800). Doors: 900 in the south wall
(x 3000..3900, hinged at x 3000) and 1000 in the partition (y 2000..3000, hinged at y 2000). Drawn the way a CAD
plot draws a plan: cut wall faces heaviest (0.70 pt) as two polylines, door leaves and swings fine (0.25 pt),
the border and title block 0.35 pt, alignment marks A and B (MA-5a-4) at building (0, 0) and (8000, 6000).

Stdlib only, uncompressed, no dates: two runs write the same bytes (the drill admits this file by its sha256).
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCALE = 50.0                    # 1:50 — building mm per paper mm
ORIGIN = (60.0, 40.0)           # the building's (0, 0) on the page, paper mm from the bottom-left
PT = 72.0 / 25.4                # points per paper mm
PAGE = (842, 595)               # A4 landscape, points
K = 0.5523                      # a quarter circle's cubic Bezier handle, x r
WALL, FINE, FRAME = "0.70", "0.25", "0.35"   # fixed width so a weight swap keeps every byte offset

# The cut wall faces, building mm. Outer: one polyline round the building with both south jambs; inner: one polyline
# round both rooms with the partition and its jambs. Each straight piece is a face; the short ones (the jambs, the
# 100 mm stubs where the partition meets a face) are shorter than a reader's minimum face and are not walls.
OUTER = [(3900, 300), (3900, 0), (8000, 0), (8000, 6000), (0, 6000), (0, 0), (3000, 0), (3000, 300)]
INNER = [(3000, 300), (250, 300), (250, 5800), (4000, 5800), (4000, 3000), (4100, 3000), (4100, 5800), (7700, 5800),
         (7700, 300), (4100, 300), (4100, 2000), (4000, 2000), (4000, 300), (3900, 300)]
# Doors: (name, hinge, radius, leaf-open angle, swing from angle, tag position, tag)
DOORS = [("south", (3000, 300), 900, 90, 0, (3200, 700), "D2 900x2100"),
         ("partition", (4100, 2000), 1000, 0, 0, (4400, 2600), "D1 1000x2100")]
STRAY = (6000, 4000)            # stray-arc.pdf: where the partition's swing is moved (no wall gap near)
MARKS = [("A", (0, 0)), ("B", (8000, 6000))]


def paper(p):
    return (ORIGIN[0] + p[0] / SCALE, ORIGIN[1] + p[1] / SCALE)


def pt(p):
    x, y = paper(p)
    return f"{x * PT:.3f} {y * PT:.3f}"


def page_pt(x_mm, y_mm):
    return f"{x_mm * PT:.3f} {y_mm * PT:.3f}"


def polyline(pts):
    return [f"{pt(pts[0])} m"] + [f"{pt(p)} l" for p in pts[1:]] + ["S"]


def arc(c, r, a0):
    """A quarter circle centred c (building mm), radius r, from angle a0 to a0 + 90 (degrees), as one cubic Bezier."""
    a, b = math.radians(a0), math.radians(a0 + 90)
    p0 = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
    p3 = (c[0] + r * math.cos(b), c[1] + r * math.sin(b))
    p1 = (p0[0] - K * r * math.sin(a), p0[1] + K * r * math.cos(a))
    p2 = (p3[0] + K * r * math.sin(b), p3[1] - K * r * math.cos(b))
    return [f"{pt(p0)} m", f"{pt(p1)} {pt(p2)} {pt(p3)} c", "S"]


def text(x_mm, y_mm, s, size=7):
    return [f"BT /F1 {size} Tf {page_pt(x_mm, y_mm)} Td ({s}) Tj ET"]


def content(variant):
    ops = [f"{FRAME} w", "0 J 0 j"]
    ops += [f"{page_pt(10, 10)} {page_pt(277, 190)} re", "S"]                         # the border
    ops += [f"{page_pt(225, 12)} {page_pt(60, 26)} re", "S"]                          # the title block
    ops += text(228, 28, "Drill building L00 - 1:50 - Sentinel drill") + text(228, 20, "Plan - level 00")
    ops += [f"{WALL} w"] + polyline(OUTER) + polyline(INNER)
    ops += [f"{FINE} w"]
    for name, hinge, r, leaf, swing, tag_at, tag in DOORS:
        a = math.radians(leaf)
        ops += polyline([hinge, (hinge[0] + r * math.cos(a), hinge[1] + r * math.sin(a))])
        centre = STRAY if (variant == "stray-arc" and name == "partition") else hinge
        ops += arc(centre, r, swing)
        tx, ty = paper(tag_at)
        ops += text(tx, ty, tag)
    for label, p in MARKS:
        ops += polyline([(p[0] - 200, p[1]), (p[0] + 200, p[1])]) + polyline([(p[0], p[1] - 200), (p[0], p[1] + 200)])
        x, y = paper(p)
        ops += text(x + 1.5, y + 1.5, label)
    s = "\n".join(ops)
    if variant == "one-weight":
        s = s.replace(f"{FRAME} w", f"{WALL} w").replace(f"{FINE} w", f"{WALL} w")
    return s.encode("ascii")


def pdf(streams):
    """Uncompressed PDF 1.4, one page per content stream (the writer of demo/ghost-sample/make-sample.py, paged)."""
    n = len(streams)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n))
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode()]
    font = 3 + 2 * n
    for i, s in enumerate(streams):
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE[0]} {PAGE[1]}] "
                    f"/Resources << /Font << /F1 {font} 0 R >> >> /Contents {4 + 2 * i} 0 R >>".encode())
        objs.append(b"<< /Length " + str(len(s)).encode() + b" >>\nstream\n" + s + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


def expected():
    """What the plan draws, in paper mm (page origin bottom-left, y up) — each wall's centreline over the faces it is
    drawn with, the door in the gap of its swing (width = the gap), the tag's numbers, and the alignment marks."""
    def r(v):
        return round(v, 3)

    def wall(name, a, b, t):
        return {"name": name, "start": [r(c) for c in paper(a)], "end": [r(c) for c in paper(b)], "thickness_paper_mm": r(t / SCALE),
                "thickness_mm_at_1_50": t}

    walls = [wall("south", (0, 150), (8000, 150), 300), wall("east", (7850, 0), (7850, 6000), 300),
             wall("north", (0, 5900), (8000, 5900), 200), wall("west", (125, 0), (125, 6000), 250),
             wall("partition", (4050, 300), (4050, 5800), 100)]
    doors = [{"host": "south", "location": [r(c) for c in paper((3450, 150))], "width_paper_mm": 18.0, "direction": [0, 1],
              "tag_width_mm": 900, "tag_height_mm": 2100},
             {"host": "partition", "location": [r(c) for c in paper((4050, 2500))], "width_paper_mm": 20.0, "direction": [1, 0],
              "tag_width_mm": 1000, "tag_height_mm": 2100}]
    marks = [{"label": label, "building_mm": list(p), "paper_mm": [r(c) for c in paper(p)]} for label, p in MARKS]
    return {"units": "paper_mm", "scale": "1:50", "page": 1, "walls": walls, "doors": doors, "marks": marks,
            "variants": {"one-weight": {"walls": 0, "doors": 0, "why": "one line weight on the page"},
                         "stray-arc": {"walls": 6, "doors": 1},
                         "two-page": {"pages": 2, "page_read": 1, "walls": 5, "doors": 2}}}


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def main():
    fx = os.path.join(HERE, "fixtures")
    write(os.path.join(fx, "drill-plan-L00.pdf"), pdf([content("base")]))
    write(os.path.join(fx, "drill-plan-L00.expected.json"), (json.dumps(expected(), indent=1) + "\n").encode())
    write(os.path.join(fx, "variants", "one-weight.pdf"), pdf([content("one-weight")]))
    write(os.path.join(fx, "variants", "stray-arc.pdf"), pdf([content("stray-arc")]))
    write(os.path.join(fx, "variants", "two-page.pdf"), pdf([content("base"), content("one-weight")]))


if __name__ == "__main__":
    main()
