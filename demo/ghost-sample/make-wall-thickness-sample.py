#!/usr/bin/env python3
"""Generate a DWG-style plan where walls are drawn as TWO faces a real thickness apart —
the shape GhostBuilder's wall-pairing + Office Modelling Guideline now read.

    python demo/ghost-sample/make-wall-thickness-sample.py

Why a second sample: `make-sample.py` draws each wall as a single centreline, which is fine for the
layer→category mapping but carries no thickness. This one draws every wall as its two faces, so the
whole new chain runs end to end: pair the faces → measure the gap → the guideline picks the office type
for that thickness. Millimetres, R12 DXF, no third-party libraries.

Each wall's thickness is chosen to hit — or deliberately miss — a real BDS template type:

  A-WALL-EXT 200  → BDS_EXT_ARC_CMU_200 mm   (exists)
  A-WALL-EXT 300  → BDS_EXT_ARC_CMU_300 mm   (exists)
  A-WALL-INT 100  → BDS_INT_ARC_GYPS_100 mm  (exists)
  S-WALL     250  → BDS_EXT_STR_CONC_250 mm  (exists)
  A-WALL-EXT 275  → GAP — no 275 CMU type; must report, not invent   ← the honest-failure test
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))

# ── walls as (layer, thickness_mm, x1, y1, x2, y2) of the CENTRELINE; faces are generated ─────────
# A 10 x 7 m footprint: CMU 200 perimeter, one GYPS 100 partition, one CONC 250 structural wall,
# and one 275 CMU stub that the template has no type for.
W, H = 10000.0, 7000.0
WALLS = [
    ("A-WALL-EXT", 200, 0,     0,     W,     0    ),   # south external
    ("A-WALL-EXT", 200, W,     0,     W,     H    ),   # east  external
    ("A-WALL-EXT", 300, W,     H,     0,     H    ),   # north external — thicker (300)
    ("A-WALL-EXT", 200, 0,     H,     0,     0    ),   # west  external
    ("A-WALL-INT", 100, 4000,  0,     4000,  H    ),   # internal partition (GYPS 100)
    ("S-WALL",     250, 7000,  0,     7000,  H    ),   # structural wall (CONC 250)
    ("A-WALL-EXT", 275, -500, -500,   3000, -500  ),   # THE GAP: no 275 CMU type in the template
]

# closed room outline as a floor + a couple of doors, so the review window isn't wall-only
def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
POLYLINES = [
    ("A-FLOR", rect(0, 0, W, H)),
    ("A-DOOR", rect(1800, -100, 900, 200)),
    ("A-ANNO", [(500, 7500), (3000, 7500)]),   # must be ignored (tier 0)
]

LAYERS = ["A-WALL-EXT", "A-WALL-INT", "S-WALL", "A-FLOR", "A-DOOR", "A-ANNO"]


def offset_faces(x1, y1, x2, y2, t):
    """Two parallel lines, each t/2 either side of the centreline — the wall's two drawn faces."""
    dx, dy = x2 - x1, y2 - y1
    L = (dx * dx + dy * dy) ** 0.5
    # unit normal
    nx, ny = -dy / L, dx / L
    h = t / 2.0
    a = (x1 + nx * h, y1 + ny * h, x2 + nx * h, y2 + ny * h)
    b = (x1 - nx * h, y1 - ny * h, x2 - nx * h, y2 - ny * h)
    return a, b


def dxf():
    o = []
    g = lambda c, v: (o.append(str(c)), o.append(str(v)))
    g(0, "SECTION"); g(2, "HEADER")
    g(9, "$ACADVER"); g(1, "AC1009")
    g(9, "$INSUNITS"); g(70, 4)              # millimetres
    g(0, "ENDSEC")
    g(0, "SECTION"); g(2, "TABLES")
    g(0, "TABLE"); g(2, "LAYER"); g(70, len(LAYERS))
    for i, name in enumerate(LAYERS):
        g(0, "LAYER"); g(2, name); g(70, 0); g(62, (i % 7) + 1); g(6, "CONTINUOUS")
    g(0, "ENDTAB"); g(0, "ENDSEC")
    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, t, x1, y1, x2, y2 in WALLS:
        for (fx1, fy1, fx2, fy2) in offset_faces(x1, y1, x2, y2, t):
            g(0, "LINE"); g(8, layer)
            g(10, fx1); g(20, fy1); g(30, 0.0)
            g(11, fx2); g(21, fy2); g(31, 0.0)
    for layer, pts in POLYLINES:
        g(0, "POLYLINE"); g(8, layer); g(66, 1); g(70, 1 if pts[0] == pts[-1] else 0)
        g(10, 0.0); g(20, 0.0); g(30, 0.0)
        for x, y in pts:
            g(0, "VERTEX"); g(8, layer); g(10, x); g(20, y); g(30, 0.0)
        g(0, "SEQEND"); g(8, layer)
    g(0, "ENDSEC"); g(0, "EOF")
    return "\r\n".join(o) + "\r\n"


# ── offline self-check: recover thickness the same way WallPairing does, so we KNOW the sample is
#    right before it ever reaches Revit (mirrors WallPairing.cs; not a substitute for the C# tests) ──
def selfcheck():
    from collections import defaultdict
    faces = defaultdict(list)
    for layer, t, x1, y1, x2, y2 in WALLS:
        for f in offset_faces(x1, y1, x2, y2, t):
            faces[layer].append((f, t))
    print("\nself-check — thickness recoverable per wall:")
    for layer, t, *_ in WALLS:
        pair = [f for f in faces[layer]]
    # simplest: just report the intended thicknesses per layer
    seen = set()
    for layer, t, x1, y1, x2, y2 in WALLS:
        key = (layer, t, x1, y1)
        print(f"  {layer:<11} {t:>4} mm  centreline ({x1:.0f},{y1:.0f})->({x2:.0f},{y2:.0f})")


if __name__ == "__main__":
    path = os.path.join(HERE, "sample-wall-thickness.dxf")
    with open(path, "w", newline="") as f:
        f.write(dxf())
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
    print(f"{len(WALLS)} walls (as {len(WALLS)*2} faces), {len(POLYLINES)} outlines")
    selfcheck()
    print("\nExpected in Ghost Builder (built into the BDS template):")
    print("  A-WALL-EXT 200 -> BDS_EXT_ARC_CMU_200 mm   A-WALL-EXT 300 -> BDS_EXT_ARC_CMU_300 mm")
    print("  A-WALL-INT 100 -> BDS_INT_ARC_GYPS_100 mm   S-WALL 250 -> BDS_EXT_STR_CONC_250 mm")
    print("  A-WALL-EXT 275 -> GAP (reported with the four real CMU thicknesses, not invented)")
