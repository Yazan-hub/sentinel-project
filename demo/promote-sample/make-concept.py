#!/usr/bin/env python3
"""MA-0 seed: write the concept changeset (concept.json) that places the drill's generic walls in the scratch model.

Per storey: 8 exterior walls around a 24 x 12 m outline, 10 interior partitions and 2 planted gap walls (a type with
no BDS equivalent). Every wall is unconnected: BaseElevation = its level, TopElevation = base + 3000, so Promote
proposes attaching it. --roof adds a level above L2 so the L2 walls have a story to attach to (only if the model has
none there). Post the file to the scratch project and place it with Review AI Proposals (the MA-0 plan, section 5 step 8).

Offline, standard library only. Geometry in millimetres, as the changeset contract reads it.

  python demo/promote-sample/make-concept.py --l1 "Level 1:0" --l2 "Level 2:3000" --roof "MA0 Roof:6000" \\
      --ext "Generic - 200mm" --int "MA0 Interior - 100mm" --gap "Generic - 125mm"
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


def concept(l1, l2, roof, ext, int_, gap):
    elements = []
    if roof:
        elements.append({"kind": "level", "place": {"BaseElevation": roof[1]},
                         "validate": {"identity": {"Class": "IfcBuildingStorey", "Name": roof[0]}}})
    for tag, lvl in (("L1", l1), ("L2", l2)):
        for prefix, type_name, segs in (("E", ext, EXTERIOR), ("I", int_, INTERIOR), ("G", gap, GAP)):
            for i, (a, b) in enumerate(segs, 1):
                elements.append(wall(f"MA0-{tag}-{prefix}{i:02d}", type_name, lvl, a, b))
    assert len(elements) <= MAX_ELEMENTS, len(elements)
    return {"name": "MA0 concept seed", "source": "concept", "elements": elements}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("\n\n", 1)[1])
    p.add_argument("--l1", type=level, required=True, help='first story, "<name>:<elevation mm>"')
    p.add_argument("--l2", type=level, required=True, help='second story, "<name>:<elevation mm>"')
    p.add_argument("--roof", type=level, help='a level to create above L2, "<name>:<elevation mm>" (only if none is there)')
    p.add_argument("--ext", required=True, help="the exterior walls' type (Function Exterior)")
    p.add_argument("--int", dest="int_", required=True, help="the interior partitions' type (Function Interior)")
    p.add_argument("--gap", required=True, help="the planted gaps' type (no BDS equivalent)")
    p.add_argument("--out", default="concept.json", help="where to write (default: concept.json)")
    a = p.parse_args(argv)
    if a.l2[1] <= a.l1[1]:
        p.error("--l2 must be above --l1")
    if a.roof and a.roof[1] <= a.l2[1]:
        p.error("--roof must be above --l2")
    body = concept(a.l1, a.l2, a.roof, a.ext, a.int_, a.gap)
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(body, f, indent=1, ensure_ascii=False)
        f.write("\n")
    walls = sum(1 for e in body["elements"] if e["kind"] == "wall")
    print(f"wrote {a.out}: {walls} walls" + (f" + level {a.roof[0]}" if a.roof else "") + f" ({len(body['elements'])} elements)")


if __name__ == "__main__":
    sys.exit(main())
