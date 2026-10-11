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


if __name__ == "__main__":
    unittest.main()
