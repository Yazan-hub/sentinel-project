#!/usr/bin/env python3
"""Generate the GhostBuilder sample pair: a floor-plan CAD file and a spec PDF.

Run:  python demo/ghost-sample/make-sample.py

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
import os

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
    ("EXT-ENVELOPE-2HR", -500, -500, W + 500, -500),

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

LAYERS = ["A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXT-ENVELOPE-2HR", "A-ANNO", "DEFPOINTS"]

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
    "    The zone drawn on layer EXT-ENVELOPE-2HR is the external envelope",
    "    line and shall be treated as external walling, 2 hour fire rated.",
    "",
    "5.  DOORS",
    "    All doors (layer A-DOOR) shall be fire rated FD30.",
]


# ── DXF (R12 ASCII) ───────────────────────────────────────────────────────────────────────────────
def dxf():
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
    g(0, "TABLE"); g(2, "LAYER"); g(70, len(LAYERS))
    for i, name in enumerate(LAYERS):
        g(0, "LAYER"); g(2, name); g(70, 0); g(62, (i % 7) + 1); g(6, "CONTINUOUS")
    g(0, "ENDTAB")
    g(0, "ENDSEC")

    g(0, "SECTION"); g(2, "ENTITIES")
    for layer, x1, y1, x2, y2 in LINES:
        g(0, "LINE"); g(8, layer)
        g(10, x1); g(20, y1); g(30, 0.0)
        g(11, x2); g(21, y2); g(31, 0.0)
    for layer, pts in POLYLINES:
        # R12 polyline = POLYLINE header + one VERTEX per point + SEQEND. Flag 70=1 marks it closed;
        # the repeated first point is kept too, because that is what the extractor's closed-loop
        # detection looks for (first vertex coincident with last).
        g(0, "POLYLINE"); g(8, layer); g(66, 1); g(70, 1)
        g(10, 0.0); g(20, 0.0); g(30, 0.0)
        for x, y in pts:
            g(0, "VERTEX"); g(8, layer); g(10, x); g(20, y); g(30, 0.0)
        g(0, "SEQEND"); g(8, layer)
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


if __name__ == "__main__":
    dxf_path = os.path.join(HERE, "sample-plan.dxf")
    pdf_path = os.path.join(HERE, "sample-spec.pdf")
    with open(dxf_path, "w", newline="") as f:
        f.write(dxf())
    with open(pdf_path, "wb") as f:
        f.write(pdf())
    print(f"wrote {dxf_path}  ({os.path.getsize(dxf_path):,} bytes)")
    print(f"wrote {pdf_path}  ({os.path.getsize(pdf_path):,} bytes)")
