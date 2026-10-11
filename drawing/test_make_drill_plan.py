"""The drill plan generator: deterministic bytes, a PDF, and the expected reading it promises.
Run (in drawing/): python -m unittest -q test_make_drill_plan
"""
import hashlib
import json
import os
import unittest

import make_drill_plan as m


class DrillPlan(unittest.TestCase):
    def test_same_bytes_every_run(self):
        a = m.pdf([m.content("base")])
        self.assertEqual(hashlib.sha256(a).hexdigest(), hashlib.sha256(m.pdf([m.content("base")])).hexdigest())
        self.assertTrue(a.startswith(b"%PDF-1.4\n"))

    def test_the_committed_fixture_is_the_generators(self):
        with open(os.path.join(m.HERE, "fixtures", "drill-plan-L00.pdf"), "rb") as f:
            self.assertEqual(f.read(), m.pdf([m.content("base")]))

    def test_one_weight_keeps_every_offset(self):
        self.assertEqual(len(m.content("one-weight")), len(m.content("base")))
        self.assertNotIn(b"0.25 w", m.content("one-weight"))
        self.assertNotIn(b"0.35 w", m.content("one-weight"))

    def test_expected_names_five_walls_two_doors(self):
        e = json.loads(json.dumps(m.expected()))
        self.assertEqual([w["name"] for w in e["walls"]], ["south", "east", "north", "west", "partition"])
        self.assertEqual([w["thickness_paper_mm"] for w in e["walls"]], [6.0, 6.0, 4.0, 5.0, 2.0])
        self.assertEqual([(d["host"], d["width_paper_mm"]) for d in e["doors"]], [("south", 18.0), ("partition", 20.0)])
        self.assertEqual(e["marks"][1]["paper_mm"], [220.0, 160.0])

    def test_rooms_plan_is_the_base_with_its_labels(self):
        """MA-5b-1: the rooms plan adds the labels and nothing else — the base plan's bytes (admitted in earlier drills) stay."""
        rooms, base = m.content("rooms"), m.content("base")
        self.assertTrue(rooms.startswith(base))
        for label, _, _ in m.ROOMS:
            self.assertIn(f"({label}) Tj".encode(), rooms)
        with open(os.path.join(m.HERE, "fixtures", "drill-plan-L00-rooms.pdf"), "rb") as f:
            self.assertEqual(f.read(), m.pdf([m.content("rooms")]))
        e = m.expected()["variants"]["rooms"]
        self.assertEqual([(r["name"], r["number"], r["also"]) for r in e["rooms"]], [("OFFICE", "101", ["FFL +0.00"]), ("MEETING ROOM", "102", [])])
        self.assertEqual(e["rooms"][0]["inside_paper_mm"], [65.0, 46.0, 140.0, 156.0])

    def test_revision_b_moves_the_partition_and_its_door(self):
        """MA-5b-3: revision B of the rooms plan — its own committed bytes; the partition and its door 1000 mm east."""
        with open(os.path.join(m.HERE, "fixtures", "drill-plan-L00-rev-b.pdf"), "rb") as f:
            self.assertEqual(f.read(), m.pdf([m.content("rev-b")]))
        self.assertEqual(m.inner(m.REV_B_PX)[3], (5000, 5800))
        self.assertEqual(m.doors(m.REV_B_PX)[1][1], (5100, 2000))
        self.assertEqual(m.inner(), m.INNER)
        e = m.expected()["variants"]["rev-b"]
        self.assertEqual(e["partition"]["start"], [161.0, 46.0])


if __name__ == "__main__":
    unittest.main()
