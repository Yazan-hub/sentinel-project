#!/usr/bin/env python3
"""Generate the GhostBuilder sample pair: a floor-plan CAD file and a spec PDF.

Run:  python demo/ghost-sample/make-sample.py
      python demo/ghost-sample/make-sample.py --step2   (MA-1a step 2 drill: sample-plan-step2.dxf)
      python demo/ghost-sample/make-sample.py --plant   (… plus the planted failing floor: sample-plan-planted.dxf)
      python demo/ghost-sample/make-sample.py --ma1b    (MA-1b drill: sample-doors.dxf + sample-doors-expected.json)
      python demo/ghost-sample/make-sample.py --ma1b --plant   (… with the planted duplicate door: sample-doors-planted.dxf)

Why a generator instead of two committed binaries: both formats are plain text, and the sample is
only useful if you can see (and change) what it claims. Edit the SPEC_LINES or the geometry below and
re-run to make a different test case. No third-party libraries — DXF R12 and PDF 1.4 are both written
directly, so this runs on a bare Python.

DXF, not DWG: DWG is a closed binary format. Revit's Import/Link CAD accepts DXF and produces exactly
the same ImportInstance with the same layer names, which is all GhostBuilder reads
(GhostCadExtractor walks the import's geometry and takes each object's graphics-style category name).
For this test the two are interchangeable; if you specifically want a .dwg, open the .dxf in AutoCAD
or the free ODA File Converter and save it as DWG — the layers carry over unchanged.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# ── The plan, in millimetres. A 10 x 7 m box with one internal partition. ──────────────────────────
W, H = 10000.0, 7000.0

LINES = [
    # (layer, x1, y1, x2, y2)
    ("A-WALL-EXT", 0, 0, W, 0),          # ↓ south
    ("A-WALL-EXT", W, 0, W, H),          # → east
    ("A-WALL-EXT", W, H, 0, H),          # ↑ north
    ("A-WALL-EXT", 0, H, 0, 0),          # ← west
    ("A-WALL-INT", 4000, 0, 4000, H),    # the internal partition

    # A deliberately NON-standard layer name, the kind a consultant's drawing actually arrives with.
    # The deterministic BDS pass cannot match it, so it is the one layer handed to the local model —
    # which is exactly what the spec PDF is there to help it interpret.
    ("EXTERIOR-ENVELOPE", -500, -500, W + 500, -500),

    # These two MUST be dropped before any model call (tier 0 of the ruleset: '*-ANNO', 'DEFPOINTS').
    # If either shows up in the review window, the ignore list has regressed.
    ("A-ANNO", 500, 7500, 3000, 7500),
    ("DEFPOINTS", -800, -800, -600, -800),
]

# Closed polylines. A closed outline becomes a boundary loop: a floor/ceiling slab, or — for a point
# family category like Doors — its centroid becomes the insertion point.
def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]

POLYLINES = [
    ("A-FLOR", rect(0, 0, W, H)),           # the slab: one closed loop over the whole footprint
    ("A-DOOR", rect(3800, 2800, 400, 900)), # door leaf in the partition
    ("A-DOOR", rect(6000, -200, 900, 400)), # door leaf in the south wall
]

LAYERS = ["A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXTERIOR-ENVELOPE", "A-ANNO", "DEFPOINTS"]

# MA-1a step 2 drill. --step2 adds two IDENTICAL furniture outlines at one point (Revit's "identical instances" warning, one
# of the three the global Doctor would erase or resolve — it must leave this build's alone), a ceiling outline over the east
# room (a ceiling at the drawing's height, founder decision F7) and a free-standing curved wall (an arc wall through the
# executor). --plant adds, on the slab layer, a closed outline that crosses itself: Revit cannot make a floor from it, so the
# build must roll back whole — the planted failing element (drill row S2-4).
STEP2 = [("A-FURN", rect(7000, 4500, 1500, 750)), ("A-FURN", rect(7000, 4500, 1500, 750)), ("A-CLNG", rect(4000, 0, 6000, 7000))]
ARCS = [("A-WALL-EXT", 13000, 3000, 1000, 0, 180)]   # (layer, centre x, centre y, radius, start deg, end deg)
BOWTIE = [("A-FLOR", [(12000, 5000), (14000, 7000), (14000, 5000), (12000, 7000), (12000, 5000)])]

# MA-1b drill (GHB-1): door and window BLOCKS on walls at known angles. --ma1b writes sample-doors.dxf: eleven free-standing
# walls (one line each, typed 200 mm thick in the review) on a 7 m grid far from the origin, clear of what the drill model
# holds; a DOOR-900 block on each of the first ten, a WIN-1200 block on the eleventh, one DOOR-900 with no wall near, and a
# twelfth wall drawn in two pieces that stop at a DOOR-900 (the usual CAD habit: expected as a named gap, founder decision F8).
# The door block is drawn hinge at its insertion point: the closed leaf would lie along +X (hinge to strike), the leaf is
# drawn open along +Y, and the swing arc joins strike and open leaf — so the middle of what it draws, along X, is the middle
# of the opening, and +Y is the side it swings to. The window block's own lines are on layer 0 (the common CAD habit); the
# door block's are on A-DOOR. --ma1b --plant writes sample-doors-planted.dxf: one more insert on top of door 1.
# sample-doors-expected.json says what each insert must become. tools/promote-check works it out again with the add-in's own
# code, and drill MA1b compares the model with it.
MA1B_ORIGIN = (40000.0, 40000.0)
MA1B_ANGLES = [0, 15, 30, 45, 60, 90, 120, 135, 150, 165]
# One door per wall: (the insert's rotation minus its wall's angle, x scale, y scale, mm its middle sits left of the wall's line)
MA1B_DOORS = [(0, 1, 1, 0), (0, 1, 1, 0), (0, 1, 1, 60), (180, 1, 1, 0), (0, -1, 1, 0),
              (0, 1, 1, 0), (0, -1, 1, -80), (180, 1, 1, 0), (0, 1, 1, 0), (0, 1, -1, 0)]
WALL_LEN, WALL_THICK, DOOR_W, WIN_W = 4000.0, 200.0, 900.0, 1200.0

# MA-2a drill: walls drawn as TWO faces, so Ghost Builder measures each thickness and the guideline — not the layer mapping —
# types them. --ma2a writes sample-walls-ma2a.dxf: a 10 x 7 m box of 200 mm walls on A-WALL-EXT (a layer rule types them), a
# 100 mm partition on A-WALL-INT across it, a 100 mm free-standing partition inside the east room and one outside the box, both
# on A-WALL-INT (no layer rule: the layer-free Location rule types the inside one; the outside one, open on both sides, is a
# named gap). Far from the origin, clear of what the drill model holds. sample-walls-ma2a-expected.json states each wall's
# centreline, thickness and the location the outer boundary must read; tools/promote-check reads it again with the add-in's own
# WallLocation (two workings of one drawing), and drill MA2a compares Revit with both.
MA2A_ORIGIN = (60000.0, 60000.0)
MA2A_WALLS = [  # (layer, x1, y1, x2, y2, thickness, location) — centrelines, relative to MA2A_ORIGIN
    ("A-WALL-EXT", 0, 0, 10000, 0, 200, "Exterior"), ("A-WALL-EXT", 10000, 0, 10000, 7000, 200, "Exterior"),
    ("A-WALL-EXT", 10000, 7000, 0, 7000, 200, "Exterior"), ("A-WALL-EXT", 0, 7000, 0, 0, 200, "Exterior"),
    ("A-WALL-INT", 4000, 0, 4000, 7000, 100, "Interior"),       # the partition across the box
    ("A-WALL-INT", 6000, 3500, 8500, 3500, 100, "Interior"),    # free-standing inside the east room
    ("A-WALL-INT", 0, -3000, 4000, -3000, 100, None),           # free-standing outside the box: open on both sides — unknown
]
MA1B_BLOCKS = {
    "DOOR-900": {"layer": "A-DOOR", "lines": [(0, 0, 0, DOOR_W)], "arcs": [(0, 0, DOOR_W, 0, 90)]},
    "WIN-1200": {"layer": "0", "lines": [(0, -50, WIN_W, -50), (0, 50, WIN_W, 50), (0, -50, 0, 50), (WIN_W, -50, WIN_W, 50)], "arcs": []},
}

# ── The spec. Deliberately states values GhostBuilder should lift onto the geometry. ───────────────
SPEC_LINES = [
    "BDS SAMPLE PROJECT - OUTLINE SPECIFICATION",
    "Document: BDS-SAMPLE-XX-XX-SP-A-0001   Revision: P01",
    "",
    "1.  EXTERNAL WALLS",
    "    All external walls (layer A-WALL-EXT) shall be 200 mm blockwork",
    "    with a fire rating of FR60.",
    "",
    "2.  INTERNAL WALLS",
    "    Internal partitions (layer A-WALL-INT) shall be 100 mm stud and",
    "    are not fire rated.",
    "",
    "3.  FLOORS",
    "    The ground floor slab (layer A-FLOR) shall be 200 mm reinforced",
    "    concrete.",
    "",
    "4.  ENVELOPE ZONE",
    "    The zone drawn on layer EXTERIOR-ENVELOPE is the external envelope",
    "    line and shall be treated as external walling, 2 hour fire rated.",
    "",
    "5.  DOORS",
    "    All doors (layer A-DOOR) shall be fire rated FD30.",
]


# ── DXF (R12 ASCII) ───────────────────────────────────────────────────────────────────────────────
def dxf(polylines=POLYLINES, arcs=(), layers=LAYERS, lines=None, blocks=None, inserts=()):
    """R12 is the most widely-accepted DXF flavour; every entity here is core R12."""
    o = []
    def g(code, value):           # one group: the code on its own line, then the value
        o.append(str(code)); o.append(str(value))

    g(0, "SECTION"); g(2, "HEADER")
    g(9, "$ACADVER"); g(1, "AC1009")
    g(9, "$INSUNITS"); g(70, 4)        # 4 = millimetres, so Revit's Auto-Detect gets the scale right
    g(0, "ENDSEC")

    g(0, "SECTION"); g(2, "TABLES")
    g(0, "TABLE"); g(2, "LTYPE"); g(70, 1)
    g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0.0)
    g(0, "ENDTAB")
    g(0, "TABLE"); g(2, "LAYER"); g(70, len(layers))
    for i, name in enumerate(layers):
        g(0, "LAYER"); g(2, name); g(70, 0); g(62, (i % 7) + 1); g(6, "CONTINUOUS")
    g(0, "ENDTAB")
    g(0, "ENDSEC")

    if blocks:
        # R12 block definitions: BLOCK, its entities in the block's own coordinates, ENDBLK. An INSERT below places one.
        g(0, "SECTION"); g(2, "BLOCKS")
        for name, b in blocks.items():
            g(0, "BLOCK"); g(8, "0"); g(2, name); g(70, 0); g(10, 0.0); g(20, 0.0); g(30, 0.0); g(3, name)
            for x1, y1, x2, y2 in b["lines"]:
                g(0, "LINE"); g(8, b["layer"])
                g(10, x1); g(20, y1); g(30, 0.0)
                g(11, x2); g(21, y2); g(31, 0.0)
            for cx, cy, r, a0, a1 in b["arcs"]:
                g(0, "ARC"); g(8, b["layer"])
                g(10, cx); g(20, cy); g(30, 0.0); g(40, r); g(50, a0); g(51, a1)
            g(0, "ENDBLK"); g(8, "0")
        g(0, "ENDSEC")

    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, x1, y1, x2, y2 in (LINES if lines is None else lines):
        g(0, "LINE"); g(8, layer)
        g(10, x1); g(20, y1); g(30, 0.0)
        g(11, x2); g(21, y2); g(31, 0.0)
    for layer, cx, cy, r, a0, a1 in arcs:
        g(0, "ARC"); g(8, layer)
        g(10, cx); g(20, cy); g(30, 0.0); g(40, r); g(50, a0); g(51, a1)
    for layer, pts in polylines:
        # R12 polyline = POLYLINE header + one VERTEX per point + SEQEND. Flag 70=1 marks it closed;
        # the repeated first point is kept too, because that is what the extractor's closed-loop
        # detection looks for (first vertex coincident with last).
        g(0, "POLYLINE"); g(8, layer); g(66, 1); g(70, 1)
        g(10, 0.0); g(20, 0.0); g(30, 0.0)
        for x, y in pts:
            g(0, "VERTEX"); g(8, layer); g(10, x); g(20, y); g(30, 0.0)
        g(0, "SEQEND"); g(8, layer)
    for layer, name, x, y, sx, sy, rot in inserts:
        # 41/42/43 = the x, y and z scale (a negative one mirrors the block), 50 = its rotation in degrees.
        g(0, "INSERT"); g(8, layer); g(2, name)
        g(10, x); g(20, y); g(30, 0.0)
        g(41, sx); g(42, sy); g(43, 1.0); g(50, rot)
    g(0, "ENDSEC")
    g(0, "EOF")
    return "\r\n".join(o) + "\r\n"


# ── PDF (1.4, uncompressed) ───────────────────────────────────────────────────────────────────────
def pdf():
    """Uncompressed single page. PdfPig (what the add-in reads PDFs with) parses this directly."""
    def esc(s):
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    body = ["BT", "/F1 11 Tf", "14 TL", "56 780 Td"]
    for line in SPEC_LINES:
        body.append(f"({esc(line)}) Tj")
        body.append("T*")
    body.append("ET")
    stream = "\n".join(body).encode("ascii")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:                      # each entry is exactly 20 bytes, per the spec
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


# ── MA-1b drill drawing and its expected results ──────────────────────────────────────────────────
def ma1b(plant):
    """Write sample-doors.dxf (planted: sample-doors-planted.dxf) and sample-doors-expected.json."""
    def unit(deg):
        return (math.cos(math.radians(deg)), math.sin(math.radians(deg)))

    def angle(v):   # a direction's plan angle, 0 up to 360, to four decimals — as the add-in reads a block's X axis
        return round(math.degrees(math.atan2(v[1], v[0])) % 360, 4) % 360 + 0.0

    def r3(v):      # the drawing and the expected results carry the same rounded numbers
        return [round(c, 3) + 0.0 for c in v]

    spots = [(MA1B_ORIGIN[0] + (i % 4) * 7000.0, MA1B_ORIGIN[1] + (i // 4) * 7000.0) for i in range(13)]
    walls, lines = [], []
    for i, deg in enumerate(MA1B_ANGLES + [0]):          # ten door walls, then the window's
        u, c = unit(deg), spots[i]
        a = r3((c[0] - WALL_LEN / 2 * u[0], c[1] - WALL_LEN / 2 * u[1]))
        b = r3((c[0] + WALL_LEN / 2 * u[0], c[1] + WALL_LEN / 2 * u[1]))
        lines.append(("A-WALL-INT", a[0], a[1], b[0], b[1]))
        walls.append({"n": i + 1, "angle": deg, "start": a, "end": b, "centre": r3(c)})

    def insert(n, layer, block, width, wall, turn, sx, sy, off):
        """One INSERT whose drawn middle sits `off` mm left of its wall's centre line, level with the wall's centre."""
        rot = (wall["angle"] + turn) % 360
        ux = unit(rot)
        bx, by = (ux[0] * sx, ux[1] * sx), (-ux[1] * sy, ux[0] * sy)   # the block's X and Y axes: scaled, then turned
        left = unit(wall["angle"] + 90)
        mid = (wall["centre"][0] + off * left[0], wall["centre"][1] + off * left[1])
        return {"n": n, "layer": layer, "block": block, "insert": r3((mid[0] - width / 2 * bx[0], mid[1] - width / 2 * bx[1])),
                "dxf_rotation": rot, "x_scale": sx, "y_scale": sy, "off_line_mm": off,
                # what it must become: hosted in this wall, at this point of its line, turned and mirrored like this
                "wall": wall["n"], "at": wall["centre"], "rotation": angle(bx), "mirrored": bx[0] * by[1] - bx[1] * by[0] < 0,
                "hinge_to_strike_deg": angle(bx), "swing_side_deg": angle(by)}

    doors = [insert(i + 1, "A-DOOR", "DOOR-900", DOOR_W, walls[i], *MA1B_DOORS[i]) for i in range(10)]
    window = insert(1, "A-GLAZ", "WIN-1200", WIN_W, walls[10], 0, 1, 1, 0)
    lone = {"layer": "A-DOOR", "block": "DOOR-900", "insert": r3(spots[11]), "dxf_rotation": 0, "x_scale": 1, "y_scale": 1, "wall": None}
    # A wall drawn in two pieces that stop at a door, and the door in the gap between them: no wall lies under the door, so it
    # must come out as a gap that says the wall line stops short of it (F8) — the pieces are not joined (GHB-6).
    bc = spots[12]
    ends = [r3((bc[0] + d, bc[1])) for d in (-WALL_LEN / 2, -DOOR_W / 2, DOOR_W / 2, WALL_LEN / 2)]
    lines += [("A-WALL-INT", ends[0][0], ends[0][1], ends[1][0], ends[1][1]), ("A-WALL-INT", ends[2][0], ends[2][1], ends[3][0], ends[3][1])]
    broken = {"layer": "A-DOOR", "block": "DOOR-900", "insert": ends[1], "dxf_rotation": 0, "x_scale": 1, "y_scale": 1, "wall": None,
              "pieces": [{"start": ends[0], "end": ends[1]}, {"start": ends[2], "end": ends[3]}], "stops_short_mm": DOOR_W / 2}
    inserts = doors + [window, lone, broken] + ([doors[0]] if plant else [])

    def drawn(b):   # the points a block draws, in its own coordinates: line ends, and seven points along each arc
        pts = [p for x1, y1, x2, y2 in b["lines"] for p in ((x1, y1), (x2, y2))]
        for cx, cy, r, a0, a1 in b["arcs"]:
            pts += [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / 6)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / 6))) for k in range(7)]
        return [r3(p) for p in pts]

    path = os.path.join(HERE, "sample-doors-planted.dxf" if plant else "sample-doors.dxf")
    with open(path, "w", newline="") as f:
        f.write(dxf([], (), ["A-WALL-INT", "A-DOOR", "A-GLAZ"], lines, MA1B_BLOCKS,
                    [(b["layer"], b["block"], b["insert"][0], b["insert"][1], b["x_scale"], b["y_scale"], b["dxf_rotation"]) for b in inserts]))
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")

    expected = {
        "what": "make-sample.py --ma1b: what each block INSERT of sample-doors.dxf must become (MA-1b, GHB-1). "
                "Millimetres; degrees anticlockwise from +X, in plan.",
        "drawing": "sample-doors.dxf",
        "planted_drawing": "sample-doors-planted.dxf",
        "planted": "one more DOOR-900 insert on top of door 1: the same point, angle and scale",
        "wall_thickness_mm": WALL_THICK,
        "walls": walls,
        "blocks": [{"name": name, "layer": b["layer"], "drawn": drawn(b)} for name, b in MA1B_BLOCKS.items()],
        "doors": doors,
        "window": window,
        "no_wall": lone,
        "broken_wall": broken,
    }

    def entry(key, value):   # one list item per line: a row a person can read beside Revit
        if isinstance(value, list):
            return f' "{key}": [\n' + ",\n".join("  " + json.dumps(v) for v in value) + "\n ]"
        return f' "{key}": {json.dumps(value)}'

    json_path = os.path.join(HERE, "sample-doors-expected.json")
    with open(json_path, "w", newline="\n") as f:
        f.write("{\n" + ",\n".join(entry(k, v) for k, v in expected.items()) + "\n}\n")
    print(f"wrote {json_path}  ({os.path.getsize(json_path):,} bytes)")


def ma2a():
    """Write sample-walls-ma2a.dxf (every wall as its two faces) and sample-walls-ma2a-expected.json."""
    def faces(x1, y1, x2, y2, t):   # the two faces of a wall drawn as a double line: the centreline offset ±t/2 along its normal
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        nx, ny = -dy / length * t / 2, dx / length * t / 2
        return [(x1 + nx, y1 + ny, x2 + nx, y2 + ny), (x1 - nx, y1 - ny, x2 - nx, y2 - ny)]

    ox, oy = MA2A_ORIGIN
    lines, walls = [], []
    for n, (layer, x1, y1, x2, y2, t, loc) in enumerate(MA2A_WALLS, 1):
        for fx1, fy1, fx2, fy2 in faces(x1, y1, x2, y2, t):
            lines.append((layer, round(ox + fx1, 3), round(oy + fy1, 3), round(ox + fx2, 3), round(oy + fy2, 3)))
        walls.append({"n": n, "layer": layer, "start": [ox + x1, oy + y1], "end": [ox + x2, oy + y2], "thickness_mm": t, "location": loc})
    path = os.path.join(HERE, "sample-walls-ma2a.dxf")
    with open(path, "w", newline="") as f:
        f.write(dxf([], (), ["A-WALL-EXT", "A-WALL-INT"], lines))
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
    expected = {
        "what": "make-sample.py --ma2a: each wall of sample-walls-ma2a.dxf (drawn as two faces), its centreline, thickness and the "
                "location the outer boundary must read (MA-2a). Millimetres. location null = unknown: a named gap, never a guess.",
        "drawing": "sample-walls-ma2a.dxf",
        "walls": walls,
    }
    json_path = os.path.join(HERE, "sample-walls-ma2a-expected.json")
    with open(json_path, "w", newline="\n") as f:
        f.write("{\n" + ",\n".join(f' "{k}": ' + ("[\n" + ",\n".join("  " + json.dumps(v) for v in value) + "\n ]" if isinstance(value, list) else json.dumps(value))
                                    for k, value in expected.items()) + "\n}\n")
    print(f"wrote {json_path}  ({os.path.getsize(json_path):,} bytes)")


if __name__ == "__main__":
    if "--ma2a" in sys.argv:
        ma2a()
        sys.exit(0)
    if "--ma1b" in sys.argv:
        ma1b("--plant" in sys.argv)
        sys.exit(0)
    if "--step2" in sys.argv or "--plant" in sys.argv:
        plant = "--plant" in sys.argv
        path = os.path.join(HERE, "sample-plan-planted.dxf" if plant else "sample-plan-step2.dxf")
        with open(path, "w", newline="") as f:
            f.write(dxf(POLYLINES + STEP2 + (BOWTIE if plant else []), ARCS, LAYERS + ["A-FURN", "A-CLNG"]))
        print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
        sys.exit(0)
    dxf_path = os.path.join(HERE, "sample-plan.dxf")
    pdf_path = os.path.join(HERE, "sample-spec.pdf")
    with open(dxf_path, "w", newline="") as f:
        f.write(dxf())
    with open(pdf_path, "wb") as f:
        f.write(pdf())
    print(f"wrote {dxf_path}  ({os.path.getsize(dxf_path):,} bytes)")
    print(f"wrote {pdf_path}  ({os.path.getsize(pdf_path):,} bytes)")
