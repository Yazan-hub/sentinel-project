# MA-7-20 core - sentinel-openings' self-checks, run from the repo root: py -3.14 -B -m unittest discover -s photo -v.
# The projection and the judge on synthetic cameras with exact numbers (numpy only). The real detector runs only where photo-lib and
# the weights are on this PC (PYTHONPATH=%APPDATA%\Sentinel\photo-lib; SENTINEL_OPENINGS_PHOTO = a photo with a door or window).
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("openings", os.path.join(HERE, "openings.py"))
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)

K = [[1000, 0, 640], [0, 1000, 360], [0, 0, 1]]
SIZE = (1280, 720)
DOOR = [[-450, -1000, 5000], [450, -1000, 5000], [450, 1100, 5000], [-450, 1100, 5000]]  # 900 x 2100 mm, 5 m in front


def at(cx, cy, cz):
    """World-to-camera for a camera at (cx, cy, cz) mm looking down +z, no rotation."""
    return [[1, 0, 0, -cx], [0, 1, 0, -cy], [0, 0, 1, -cz], [0, 0, 0, 1]]


def r6(xs):
    return [round(float(x), 6) for x in xs]


class Projection(unittest.TestCase):
    def test_on_axis(self):
        p = op.project(DOOR, K, at(0, 0, 0), SIZE)
        self.assertEqual([r6(q) for q in p["quad"]], [[550, 160], [730, 160], [730, 580], [550, 580]])
        self.assertEqual(r6(p["box"]), [550, 160, 730, 580])
        self.assertEqual(p["in_frame"], 1.0)

    def test_moved_camera(self):
        self.assertEqual(r6(op.project(DOOR, K, at(1000, 0, 0), SIZE)["box"]), [350, 160, 530, 580])  # u = (x - 1000) / 5 + 640

    def test_rotated_camera(self):  # 180 degrees about the optical axis: u = -x / 5 + 640, v = -y / 5 + 360
        R = [[-1, 0, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        self.assertEqual(r6(op.project(DOOR, K, R, SIZE)["box"]), [550, 140, 730, 560])

    def test_farther(self):  # 10 m away: half the size
        self.assertEqual(r6(op.project(DOOR, K, at(0, 0, -5000), SIZE)["box"]), [595, 260, 685, 470])

    def test_behind_camera(self):
        self.assertIsNone(op.project(DOOR, K, at(0, 0, 6000), SIZE))

    def test_off_frame(self):
        self.assertIsNone(op.project(DOOR, K, at(-20000, 0, 0), SIZE))
        p = op.project(DOOR, K, at(-3000, 0, 0), SIZE)  # u from 1150 to 1330: 130 of 180 px inside
        self.assertAlmostEqual(p["in_frame"], 130 / 180)

    def test_iou(self):
        self.assertEqual(op.iou([0, 0, 10, 10], [0, 0, 10, 10]), 1.0)
        self.assertAlmostEqual(op.iou([0, 0, 10, 10], [5, 0, 15, 10]), 50 / 150)
        self.assertEqual(op.iou([0, 0, 1, 1], [2, 2, 3, 3]), 0.0)


class Judge(unittest.TestCase):
    CAM = {"K": K, "world_to_cam": at(0, 0, 0), "size": SIZE}
    WIN = [[1500, -500, 5000], [2500, -500, 5000], [2500, 500, 5000], [1500, 500, 5000]]  # u 940-1140, v 260-460

    def test_seen_not_seen_no_ghost(self):
        dets = [{"label": "door", "score": 0.6, "box": [555, 170, 728, 575]},    # the door, a few px off
                {"label": "window", "score": 0.5, "box": [100, 100, 300, 300]},  # no ghost there
                {"label": "door", "score": 0.4, "box": [940, 260, 1140, 460]}]   # right place, wrong label for the window
        ghosts = [{"id": "g-door", "label": "door", "corners_mm": DOOR}, {"id": "g-win", "label": "window", "corners_mm": self.WIN},
                  {"id": "g-away", "label": "door", "corners_mm": [[c[0], c[1], -c[2]] for c in DOOR]}]  # behind: not asked
        v, un = op.judge(ghosts, self.CAM, dets, "ev-1")
        self.assertEqual([(x["ghost"], x["state"]) for x in v], [("g-door", "seen"), ("g-win", "not seen")])
        self.assertEqual(v[0]["words"], "seen in ev-1 (detector, advice)")
        self.assertTrue(all(x["advice"] for x in v))
        self.assertEqual(v[1]["words"], "not seen")
        self.assertEqual([(d["box"], d["words"]) for d in un],
                         [([100, 100, 300, 300], "no ghost - not filed"), ([940, 260, 1140, 460], "no ghost - not filed")])

    def test_below_threshold(self):
        v, un = op.judge([{"id": "g", "label": "door", "corners_mm": DOOR}], self.CAM,
                         [{"label": "door", "score": 0.9, "box": [700, 160, 900, 580]}], "ev-2")
        self.assertLess(v[0]["iou"], op.SEEN_IOU)
        self.assertEqual(v[0]["state"], "not seen")
        self.assertEqual(len(un), 1)

    def test_one_detection_one_ghost(self):
        g = [{"id": "a", "label": "door", "corners_mm": DOOR}, {"id": "b", "label": "door", "corners_mm": DOOR}]
        v, _ = op.judge(g, self.CAM, [{"label": "door", "score": 0.9, "box": [550, 160, 730, 580]}], "ev-3")
        self.assertEqual([x["state"] for x in v], ["seen", "not seen"])


def _have_stack():
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return all(os.path.isfile(os.path.join(op.MODELS, n, "model.safetensors")) for n in op.WEIGHTS)


@unittest.skipUnless(_have_stack() and os.path.isfile(os.environ.get("SENTINEL_OPENINGS_PHOTO", "")),
                     "needs photo-lib on PYTHONPATH, the weights and SENTINEL_OPENINGS_PHOTO")
class RealDetector(unittest.TestCase):
    def test_finds_an_opening(self):
        from PIL import Image
        dets = op.detect(Image.open(os.environ["SENTINEL_OPENINGS_PHOTO"]).convert("RGB"))
        self.assertTrue(dets, "no door or window found")
        self.assertTrue(all(d["label"] in op.LABELS and d["mask_area"] > 0 for d in dets))
        names = [t["name"] for t in op.tools()]
        for n in ("grounding-dino-tiny", "sam2.1-hiera-small", "transformers", "torch"):
            self.assertIn(n, names)
        self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
        self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")


if __name__ == "__main__":
    unittest.main()
