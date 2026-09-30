#!/usr/bin/env python3
"""MA-0 seed: write the concept changeset (concept.json) that places the drill's generic walls in the scratch model.

Per storey: 8 exterior walls around a 24 x 12 m outline, 10 interior partitions and 2 planted gap walls (a type with
no BDS equivalent). Every wall is unconnected: BaseElevation = its level, TopElevation = base + 3000, so Promote
proposes attaching it. --roof adds a level above L2 so the L2 walls have a story to attach to (only if the model has
none there). Post the file to the scratch project and place it with Review AI Proposals (the MA-0 plan, section 5 step 8).

Offline, standard library only. Geometry in millimetres, as the changeset contract reads it.

  python demo/promote-sample/make-concept.py --l1 "Level 1:0" --l2 "Level 2:3000" --roof "MA0 Roof:6000" \\
      --ext "Generic - 200mm" --int "MA0 Interior - 100mm" --gap "Generic - 125mm"

Promote v1 (drill B35): the walls are already in the copy, so --skip-walls; --floor adds five concept floors (one
interior at a BDS thickness on each storey, a gap, a second one to tick Structural by hand, an office screed), and
--sheet prints the hand-placement sheet for the roofs, ceilings, doors and windows (the plan's section 6.3).

  python demo/promote-sample/make-concept.py --skip-walls --l1 "GR-FFL:0" --l2 "01-FFL:3300" \\
      --floor "Generic 300mm" --floor-l2 "Concrete 150mm" --floor-gap "Concrete 250mm" \\
      --floor-office "BDS_INT_ARC_SCREED_90 mm" --out ma1-floors.json
  python demo/promote-sample/make-concept.py --sheet

MA-1 (drill B35, one command): --b35 writes the whole seed of the plan's section 6.3 as ONE changeset: 5 floors
(MA1-L2-F02 structural), 2 flat roofs, 3 ceilings at 2700, 6 doors and 3 windows on the MA-0 walls, each with its Mark.
Every type must already be in the model (Sentinel loads no families and creates no types); a type named otherwise there
is passed as --type DEFAULT=NAME.

  python demo/promote-sample/make-concept.py --b35 --l1 "GR-FFL:0" --l2 "01-FFL:3300" --out ma1-seed.json
"""
import argparse
import json
import sys

HEIGHT = 3000
MAX_ELEMENTS = 200  # = the bridge's MAX_CHANGESET_ELEMENTS

# (start, end) in plan, mm. The outline: each long side in two, each short side in two.
EXTERIOR = [((0, 0), (12000, 0)), ((12000, 0), (24000, 0)), ((24000, 0), (24000, 6000)), ((24000, 6000), (24000, 12000)),
            ((24000, 12000), (12000, 12000)), ((12000, 12000), (0, 12000)), ((0, 12000), (0, 6000)), ((0, 6000), (0, 0))]
# Cross walls of the south and north rooms, leaving a corridor between y 4500 and 7500.
INTERIOR = [((x, 0), (x, 4500)) for x in (4000, 8000, 12000, 16000, 20000)] + \
           [((x, 7500), (x, 12000)) for x in (4000, 8000, 12000, 16000, 20000)]
# Free-standing in the corridor: the planted gaps.
GAP = [((2000, 6000), (6000, 6000)), ((18000, 6000), (22000, 6000))]
# B35 floors: (name, storey, which --floor* type, x0, y0, x1, y1). No overlaps (Revit warns on overlapping floors).
FLOORS = [("MA1-L1-F01", "L1", "floor", 0, 0, 12000, 12000), ("MA1-L1-F02", "L1", "floor_gap", 12000, 0, 24000, 12000),
          ("MA1-L2-F01", "L2", "floor_l2", 0, 0, 12000, 12000), ("MA1-L2-F02", "L2", "floor", 12000, 0, 24000, 4500),
          ("MA1-L2-F03", "L2", "floor_office", 12000, 4500, 24000, 12000)]
# B35 hand-placement sheet (plan section 6.3): what a person places after the floors, and what run 1 must do with it.
SHEET = [
    ("MA1-R01", "roof", "MA0 Roof, footprint x 0-12000 x y 0-12000, no slope", "Generic - 300mm", "retype -> `BDS_EXT_ARC_GENRC_300 mm`"),
    ("MA1-R02", "roof", "MA0 Roof, x 12000-24000, no slope", "Generic - 225mm", "held: gap, available `BDS_EXT_ARC_GENRC_300 mm`"),
    ("MA1-C01", "ceiling", "GR-FFL, sketch x 0-4000 x y 0-4500, offset 2700", "MA1 Ceiling - 50mm", "retype -> `BDS_INT_ARC_GYPS_50 mm`"),
    ("MA1-C02", "ceiling", "GR-FFL, x 4000-8000 x y 0-4500", "Generic (Basic Ceiling)", "held: no DD rule for Family Basic Ceiling (CL-1)"),
    ("MA1-C03", "ceiling", "GR-FFL, x 8000-12000 x y 0-4500", "600mm x 600mm ACT System", "held: gap `...GYPS_56 mm`, available `...GYPS_50 mm`"),
    ("MA1-D01", "door", "GR-FFL, in I02 (x 8000) at y 2250", "M_Single-Flush : MA1 1000 x 2100mm", "swap -> `BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm`"),
    ("MA1-D02", "door", "GR-FFL, in I07 (x 8000) at y 9750", "M_Double-Flush : MA1 2000 x 2100mm", "swap -> `BDS_INT_2 PNL : BDS_INT_2 PNL_WOOD_2000 x 2100 mm`"),
    ("MA1-D03", "door", "GR-FFL, in E01 at x 6000", "M_Single-Flush : MA1 1000 x 2100mm", "held: no DD rule for HostFunction Exterior ... (DR-4)"),
    ("MA1-D04", "door", "GR-FFL, in I03 (x 12000) at y 2250", "M_Single-Flush : 0915 x 2134mm", "held: `gap: ... no Doors type of 915 x 2134 mm in the catalogue`"),
    ("MA1-D05", "door", "GR-FFL, in I04 (x 16000) at y 2250", "BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm", "left as is (office family)"),
    ("MA1-D06", "door", "01-FFL, in I02 at y 2250", "M_Single-Flush : MA1 1000 x 2100mm", "proposed; **the reviewer unticks it** (sets up B35-6)"),
    ("MA1-W01", "window", "GR-FFL, in E03 at y 3000, sill 900", "M_Fixed : MA1 600 x 1200mm", "swap -> `BDS_Window_Single Panel : 600x1200 mm`"),
    ("MA1-W02", "window", "GR-FFL, in E05 at x 18000, sill 900", "M_Fixed : MA1 800 x 1200mm", "swap -> `BDS_Window_1 Panel+FX : 800x1200 mm`"),
    ("MA1-W03", "window", "GR-FFL, in E06 at x 6000, sill 900", "M_Fixed : MA1 600 x 1300mm", "held: no DD rule ... the catalogue has both families (WN-2)"),
]
# B35 whole seed (--b35, MA-1): every element of the plan's section 6.3 table, placed by ONE changeset, each with its Mark.
# The floors are FLOORS above with these default types (MA1-L2-F02 structural); PLACED is the rest: roofs and ceilings an
# outline x0, y0, x1, y1 in plan, doors and windows the point on their MA-0 host wall's location line (the wall in the comment).
FLOOR_TYPES = {"floor": "Generic 300mm", "floor_l2": "Concrete 150mm", "floor_gap": "Concrete 250mm",
               "floor_office": "BDS_INT_ARC_SCREED_90 mm"}
STRUCTURAL = ("MA1-L2-F02",)
PLACED = [
    ("MA1-R01", "roof", "roof", "Generic - 300mm", (0, 0, 12000, 12000)),
    ("MA1-R02", "roof", "roof", "Generic - 225mm", (12000, 0, 24000, 12000)),
    ("MA1-C01", "ceiling", "L1", "MA1 Ceiling - 50mm", (0, 0, 4000, 4500)),
    ("MA1-C02", "ceiling", "L1", "Generic", (4000, 0, 8000, 4500)),
    ("MA1-C03", "ceiling", "L1", "600mm x 600mm ACT System", (8000, 0, 12000, 4500)),
    ("MA1-D01", "door", "L1", "M_Single-Flush : MA1 1000 x 2100mm", (8000, 2250)),  # I02
    ("MA1-D02", "door", "L1", "M_Double-Flush : MA1 2000 x 2100mm", (8000, 9750)),  # I07
    ("MA1-D03", "door", "L1", "M_Single-Flush : MA1 1000 x 2100mm", (6000, 0)),  # E01
    ("MA1-D04", "door", "L1", "M_Single-Flush : 0915 x 2134mm", (12000, 2250)),  # I03
    ("MA1-D05", "door", "L1", "BDS_INT_1 PNL : BDS_INT_1 PNL_GLASS_1000 x 2100 mm", (16000, 2250)),  # I04
    ("MA1-D06", "door", "L2", "M_Single-Flush : MA1 1000 x 2100mm", (8000, 2250)),  # I02 of the second storey
    ("MA1-W01", "window", "L1", "M_Fixed : MA1 600 x 1200mm", (24000, 3000)),  # E03
    ("MA1-W02", "window", "L1", "M_Fixed : MA1 800 x 1200mm", (18000, 12000)),  # E05
    ("MA1-W03", "window", "L1", "M_Fixed : MA1 600 x 1300mm", (6000, 12000)),  # E06
]
SEED_TYPES = sorted(set(FLOOR_TYPES.values()) | {row[3] for row in PLACED})
CEILING_OFFSET = 2700
SILL = 900
IFC = {"roof": "IfcRoof", "ceiling": "IfcCovering", "door": "IfcDoor", "window": "IfcWindow"}


def level(text):
    """"Name:mm" -> (name, mm). The name may itself hold a colon; the elevation is after the last one."""
    name, sep, mm = text.rpartition(":")
    if not sep or not name.strip():
        raise argparse.ArgumentTypeError(f'"{text}" is not "<level name>:<elevation mm>"')
    try:
        return name.strip(), float(mm)
    except ValueError:
        raise argparse.ArgumentTypeError(f'"{mm}" in "{text}" is not an elevation in mm')


def wall(name, type_name, lvl, a, b):
    lname, z = lvl
    return {
        "kind": "wall",
        "place": {"TypeName": type_name, "LevelName": lname,
                  "LocationCurve": {"start": [a[0], a[1], z], "end": [b[0], b[1], z]},
                  "BaseElevation": z, "TopElevation": z + HEIGHT},
        "validate": {"identity": {"Class": "IfcWall", "Name": name}},
    }


def floor(name, type_name, lvl, x0, y0, x1, y1):
    lname, z = lvl
    return {
        "kind": "floor",
        "place": {"TypeName": type_name, "LevelName": lname,
                  "LocationLoop": [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]},
        "validate": {"identity": {"Class": "IfcSlab", "Name": name}},
    }


def concept(l1, l2, roof, ext, int_, gap, skip_walls=False, floors=None):
    """floors: {"floor", "floor_l2", "floor_gap", "floor_office"} -> type name, or None for MA-0's walls only."""
    elements = []
    if roof and not skip_walls:
        elements.append({"kind": "level", "place": {"BaseElevation": roof[1]},
                         "validate": {"identity": {"Class": "IfcBuildingStorey", "Name": roof[0]}}})
    for tag, lvl in (() if skip_walls else (("L1", l1), ("L2", l2))):
        for prefix, type_name, segs in (("E", ext, EXTERIOR), ("I", int_, INTERIOR), ("G", gap, GAP)):
            for i, (a, b) in enumerate(segs, 1):
                elements.append(wall(f"MA0-{tag}-{prefix}{i:02d}", type_name, lvl, a, b))
    for name, tag, which, x0, y0, x1, y1 in (FLOORS if floors else ()):
        elements.append(floor(name, floors[which], l1 if tag == "L1" else l2, x0, y0, x1, y1))
    assert len(elements) <= MAX_ELEMENTS, len(elements)
    return {"name": "MA1 concept seed" if floors else "MA0 concept seed", "source": "concept", "elements": elements}


def placed(mark, kind, lvl, type_name, geo):
    """One PLACED row as a create: a roof or ceiling by its outline, a door or window by its point (z = its level)."""
    lname, z = lvl
    place = {"LevelName": lname}
    if kind in ("door", "window"):
        family, _, type_name = type_name.partition(" : ")
        place.update(FamilyName=family, TypeName=type_name, Location=[geo[0], geo[1], z])
        if kind == "window":
            place["SillHeight"] = SILL
    else:
        x0, y0, x1, y1 = geo
        place.update(TypeName=type_name, Boundary=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
        if kind == "ceiling":
            place["Offset"] = CEILING_OFFSET
    place["Mark"] = mark
    return {"kind": kind, "place": place, "validate": {"identity": {"Class": IFC[kind], "Name": mark}}}


def b35(l1, l2, roof_level, types):
    """Drill B35's whole seed as ONE changeset. types: a section 6.3 default type name -> the name to use instead."""
    elements = []
    for name, tag, which, x0, y0, x1, y1 in FLOORS:
        e = floor(name, types.get(FLOOR_TYPES[which], FLOOR_TYPES[which]), l1 if tag == "L1" else l2, x0, y0, x1, y1)
        e["place"]["Mark"] = name
        if name in STRUCTURAL:
            e["place"]["Structural"] = True
        elements.append(e)
    levels = {"L1": l1, "L2": l2, "roof": (roof_level, None)}
    for mark, kind, tag, type_name, geo in PLACED:
        elements.append(placed(mark, kind, levels[tag], types.get(type_name, type_name), geo))
    return {"name": "MA1 B35 seed", "source": "concept", "elements": elements}


def sheet():
    """The hand-placement sheet as Markdown: one row per element a person places after the floors."""
    rows = ["| Mark | Class | Where | Concept type | Expected in run 1 |", "|---|---|---|---|---|"]
    return "\n".join(rows + [f"| {' | '.join(r)} |" for r in SHEET])


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("\n\n", 1)[1])
    p.add_argument("--l1", type=level, help='first story, "<name>:<elevation mm>" (required)')
    p.add_argument("--l2", type=level, help='second story, "<name>:<elevation mm>" (required)')
    p.add_argument("--roof", type=level, help='a level to create above L2, "<name>:<elevation mm>" (only if none is there)')
    p.add_argument("--ext", help="the exterior walls' type (Function Exterior); required without --skip-walls")
    p.add_argument("--int", dest="int_", help="the interior partitions' type (Function Interior); required without --skip-walls")
    p.add_argument("--gap", help="the planted gaps' type (no BDS equivalent); required without --skip-walls")
    p.add_argument("--skip-walls", action="store_true", help="omit the walls and the --roof level (B35: the copy has them)")
    p.add_argument("--floor", help="B35: the interior concept floor type at a thickness BDS has (e.g. Generic 300mm)")
    p.add_argument("--floor-l2", help="B35: the second storey's interior floor type (e.g. Concrete 150mm)")
    p.add_argument("--floor-gap", help="B35: a floor type at a thickness BDS lacks (e.g. Concrete 250mm)")
    p.add_argument("--floor-office", help="B35: an office floor type Promote leaves as is (e.g. BDS_INT_ARC_SCREED_90 mm)")
    p.add_argument("--sheet", action="store_true", help="print the B35 hand-placement sheet (Markdown) and exit")
    p.add_argument("--b35", action="store_true",
                   help="MA-1: drill B35's whole seed as ONE changeset (plan section 6.3) — 5 floors, 2 roofs, 3 ceilings, "
                        "6 doors, 3 windows, each with its Mark; implies --skip-walls")
    p.add_argument("--roof-level", default=None, help='--b35: the roofs\' level (default "MA0 Roof")')
    p.add_argument("--type", action="append", default=[], metavar="DEFAULT=NAME",
                   help="--b35: use NAME wherever the seed names the section 6.3 type DEFAULT (repeatable)")
    p.add_argument("--out", default="concept.json", help="where to write (default: concept.json)")
    a = p.parse_args(argv)
    if a.sheet:
        print(sheet())
        return 0
    if a.l1 is None or a.l2 is None:
        p.error("--l1 and --l2 are required")
    if (a.type or a.roof_level) and not a.b35:
        p.error("--type and --roof-level go with --b35")
    if not (a.skip_walls or a.b35) and not (a.ext and a.int_ and a.gap):
        p.error("--ext, --int and --gap are required without --skip-walls")
    floors = {k: getattr(a, k) for k in ("floor", "floor_l2", "floor_gap", "floor_office")}
    if a.b35 and any(floors.values()):
        p.error("--b35 names its own floor types; change one with --type")
    if any(floors.values()) and not all(floors.values()):
        p.error("--floor, --floor-l2, --floor-gap and --floor-office go together")
    types = {}
    for t in a.type:
        default, _, name = t.partition("=")
        if default not in SEED_TYPES or not name:
            p.error(f'--type "{t}": DEFAULT must be one of: ' + ", ".join(SEED_TYPES))
        types[default] = name
    if a.l2[1] <= a.l1[1]:
        p.error("--l2 must be above --l1")
    if a.roof and a.roof[1] <= a.l2[1]:
        p.error("--roof must be above --l2")
    body = (b35(a.l1, a.l2, a.roof_level or "MA0 Roof", types) if a.b35
            else concept(a.l1, a.l2, a.roof, a.ext, a.int_, a.gap, a.skip_walls, floors if a.floor else None))
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(body, f, indent=1, ensure_ascii=False)
        f.write("\n")
    if a.b35:
        kinds = [e["kind"] for e in body["elements"]]
        print(f"wrote {a.out}: " + " + ".join(f"{kinds.count(k)} {k}s" for k in ("floor", "roof", "ceiling", "door", "window"))
              + f" ({len(kinds)} elements)")
        return 0
    walls = sum(1 for e in body["elements"] if e["kind"] == "wall")
    n_floors = sum(1 for e in body["elements"] if e["kind"] == "floor")
    roof = a.roof and not a.skip_walls
    print(f"wrote {a.out}: {walls} walls" + (f" + {n_floors} floors" if n_floors else "") + (f" + level {a.roof[0]}" if roof else "")
          + f" ({len(body['elements'])} elements)")


if __name__ == "__main__":
    sys.exit(main())
