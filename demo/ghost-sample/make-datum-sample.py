# Datum-from-Drawings sample: a section DXF carrying level lines and a plan DXF carrying grid
# lines, on layers matching DatumBuilder's default keywords ("LEVEL" / "GRID"). Same R12 writer
# idiom as make-sample.py. Regenerate with: python make-datum-sample.py

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


def dxf(lines):
    o = []
    def g(code, value):
        o.append(str(code)); o.append(str(value))

    layers = sorted({l[0] for l in lines})
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
    g(0, "ENDSEC")
    g(0, "EOF")
    return "\r\n".join(o) + "\r\n"


if __name__ == "__main__":
    with open("sample-section.dxf", "w", newline="") as f:
        f.write(dxf(SECTION_LINES))
    with open("sample-grids.dxf", "w", newline="") as f:
        f.write(dxf(GRID_LINES))
    print("wrote sample-section.dxf (3 levels) + sample-grids.dxf (5 grids)")
