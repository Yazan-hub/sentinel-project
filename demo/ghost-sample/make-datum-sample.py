# Datum-from-Drawings sample: a section DXF carrying level lines and a plan DXF carrying grid
# lines, on layers matching DatumBuilder's default keywords ("LEVEL" / "GRID"). Same R12 writer
# idiom as make-sample.py. Regenerate with: python make-datum-sample.py
import math

# Section: horizontal lines at storey elevations (mm). Y is elevation.
SECTION_LINES = [
    ("A-LEVEL", 0.0, 0.0, 10000.0, 0.0),        # ground
    ("A-LEVEL", 0.0, 3500.0, 10000.0, 3500.0),  # level 1
    ("A-LEVEL", 0.0, 7000.0, 10000.0, 7000.0),  # level 2
]

# Plan: grid lines matching the 10 x 7 m sample plan.
GRID_LINES = [
    ("A-GRID", 0.0, -500.0, 0.0, 7500.0),        # vertical grids 1..3
    ("A-GRID", 5000.0, -500.0, 5000.0, 7500.0),
    ("A-GRID", 10000.0, -500.0, 10000.0, 7500.0),
    ("A-GRID", -500.0, 0.0, 10500.0, 0.0),       # horizontal grids A..B
    ("A-GRID", -500.0, 7000.0, 10500.0, 7000.0),
]


def dxf(lines, arcs=()):
    """arcs: (layer, cx, cy, r, start_deg, end_deg) — an ARC; start == end == None writes a CIRCLE (MA-5b-8)."""
    o = []
    def g(code, value):
        o.append(str(code)); o.append(str(value))

    layers = sorted({l[0] for l in list(lines) + list(arcs)})
    g(0, "SECTION"); g(2, "HEADER")
    g(9, "$ACADVER"); g(1, "AC1009")
    g(9, "$INSUNITS"); g(70, 4)  # millimetres
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
    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, x1, y1, x2, y2 in lines:
        g(0, "LINE"); g(8, layer)
        g(10, x1); g(20, y1); g(30, 0.0)
        g(11, x2); g(21, y2); g(31, 0.0)
    for layer, cx, cy, r, a0, a1 in arcs:
        g(0, "CIRCLE" if a0 is None else "ARC"); g(8, layer)
        g(10, cx); g(20, cy); g(30, 0.0); g(40, r)
        if a0 is not None:
            g(50, a0); g(51, a1)
    g(0, "ENDSEC")
    g(0, "EOF")
    return "\r\n".join(o) + "\r\n"


# MA-5b-7 drill (DAT-1, DAT-2): the datum on an office's own layers — levels on A-SECT-DATUM (a basement at -3500 below the
# ground, two storeys and a parapet line at 7900 a person unticks), grids on S-GRID-IDEN (3 numbered, 9 lettered: no I), and a
# 200 mm wall on A-WALL beside them (Ghost builds the wall, never the datum layers). ma5b7-plan-shifted.dxf: the same grids
# 60 m east — its numbered grids stand elsewhere and its lettered ones on the same lines but 47 m apart: all new ("1 (2)", "A (2)"), said.
MA5B7_SECTION = [("A-SECT-DATUM", 100000.0, y, 110000.0, y) for y in (-3500.0, 0.0, 3500.0, 7000.0, 7900.0)]
MA5B7_GRIDS = ([("S-GRID-IDEN", x, -500.0, x, 40500.0) for x in (0.0, 6000.0, 12000.0)]
               + [("S-GRID-IDEN", -500.0, float(y), 12500.0, float(y)) for y in range(0, 45000, 5000)])
MA5B7_WALL = [("A-WALL", 2000.0, 2000.0, 8000.0, 2000.0), ("A-WALL", 2000.0, 2200.0, 8000.0, 2200.0)]


def shifted(lines, dx):
    return [(l, x1 + dx, y1, x2 + dx, y2) for l, x1, y1, x2, y2 in lines]


# MA-5b-8 drill (DAT-5): a radial plan on S-GRID-IDEN — three arcs about (200000, 0) (radii 20, 25, 30 m, 0-90 degrees), five spokes
# from 15 m to 32 m at 0, 22.5, 45, 67.5 and 90 degrees, a 500 mm bubble circle and a short leader at each spoke's end (never grids) —
# and a wing of three grids at 30 degrees, 6 m apart, east of it. Expected names (GR-01): spokes 1-5 by angle; the wing A-C (bottom to
# top); the arcs D-F, inner first.
MA5B8_C = (200000.0, 0.0)
MA5B8_ARCS = ([("S-GRID-IDEN", MA5B8_C[0], MA5B8_C[1], r, 0.0, 90.0) for r in (20000.0, 25000.0, 30000.0)]
              + [("S-GRID-IDEN", MA5B8_C[0] + 32500 * math.cos(math.radians(a)), MA5B8_C[1] + 32500 * math.sin(math.radians(a)), 500.0, None, None)
                 for a in (0, 22.5, 45, 67.5, 90)])
MA5B8_LINES = ([("S-GRID-IDEN", MA5B8_C[0] + 15000 * math.cos(math.radians(a)), MA5B8_C[1] + 15000 * math.sin(math.radians(a)),
                 MA5B8_C[0] + 32000 * math.cos(math.radians(a)), MA5B8_C[1] + 32000 * math.sin(math.radians(a))) for a in (0, 22.5, 45, 67.5, 90)]
               + [("S-GRID-IDEN", MA5B8_C[0] + 33000 * math.cos(math.radians(a)), MA5B8_C[1] + 33000 * math.sin(math.radians(a)),
                   MA5B8_C[0] + 33800 * math.cos(math.radians(a)), MA5B8_C[1] + 33800 * math.sin(math.radians(a))) for a in (0, 22.5, 45, 67.5, 90)]
               + [("S-GRID-IDEN", 250000.0 - k * 6000 * math.sin(math.radians(30)), k * 6000 * math.cos(math.radians(30)),
                   250000.0 - k * 6000 * math.sin(math.radians(30)) + 20000 * math.cos(math.radians(30)), k * 6000 * math.cos(math.radians(30)) + 20000 * math.sin(math.radians(30)))
                  for k in range(3)])


if __name__ == "__main__":
    import sys
    if "--ma5b8" in sys.argv:
        with open("ma5b8-radial.dxf", "w", newline="") as f:
            f.write(dxf([(l, round(a, 3), round(b, 3), round(c, 3), round(d, 3)) for l, a, b, c, d in MA5B8_LINES],
                        [(l, round(cx, 3), round(cy, 3), r, a0, a1) for l, cx, cy, r, a0, a1 in MA5B8_ARCS]))
        print("wrote ma5b8-radial.dxf (3 arcs, 5 spokes, 5 bubbles + leaders, a 30-degree wing of 3)")
        sys.exit(0)
    if "--ma5b7" in sys.argv:
        with open("ma5b7-datum.dxf", "w", newline="") as f:
            f.write(dxf(MA5B7_SECTION + MA5B7_GRIDS + MA5B7_WALL))
        with open("ma5b7-plan-shifted.dxf", "w", newline="") as f:
            f.write(dxf(shifted(MA5B7_GRIDS, 60000.0)))
        print("wrote ma5b7-datum.dxf (5 level lines, 12 grids, 1 wall) + ma5b7-plan-shifted.dxf (12 grids, 60 m east)")
        sys.exit(0)
    with open("sample-section.dxf", "w", newline="") as f:
        f.write(dxf(SECTION_LINES))
    with open("sample-grids.dxf", "w", newline="") as f:
        f.write(dxf(GRID_LINES))
    print("wrote sample-section.dxf (3 levels) + sample-grids.dxf (5 grids)")
