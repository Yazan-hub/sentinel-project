# MA-7-17/7-18 core - registration maths and the panorama cut (panorama_views.py), run from the repo root: py -3.14 -B -m unittest discover -s photo -v.
# Exact numbers on synthetic data (numpy only): Umeyama recovers a known similarity, refuses collinear points and never returns a reflection;
# the RMSE and the held-out check distance; a pinhole view cut from a panorama projects a world point back where the panorama has it.
import importlib.util
import os
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, f"{name}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


rg = load("register")


def rot(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    i, j = [(1, 2), (2, 0), (0, 1)][axis]
    R = np.eye(3)
    R[i, i], R[i, j], R[j, i], R[j, j] = c, -s, s, c
    return R


class Umeyama(unittest.TestCase):
    P = np.array([[0, 0, 0], [1000, 0, 0], [0, 2000, 0], [0, 0, 3000], [500, 700, 900]], float)

    def test_recovers_similarity(self):
        R = rot(2, 30) @ rot(0, -20)
        Q = 2.5 * self.P @ R.T + [100, -200, 300]
        s, Rf, t = rg.umeyama(self.P, Q)
        self.assertAlmostEqual(s, 2.5, places=9)
        np.testing.assert_allclose(Rf, R, atol=1e-12)
        np.testing.assert_allclose(t, [100, -200, 300], atol=1e-8)

    def test_never_a_reflection(self):
        _, R, _ = rg.umeyama(self.P, self.P * [-1, 1, 1])  # a mirror image: the best proper rotation, det +1
        self.assertAlmostEqual(np.linalg.det(R), 1.0, places=12)

    def test_collinear_refused(self):
        with self.assertRaisesRegex(ValueError, "collinear"):
            rg.umeyama([[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]], [[0, 0, 0], [2, 2, 2], [4, 4, 4], [6, 6, 6]])
        with self.assertRaisesRegex(ValueError, "at least 3"):
            rg.umeyama(self.P[:2], self.P[:2])

    def test_rmse_and_check(self):
        Q = self.P.copy()
        Q[0] += [0, 0, 3]  # one control point 3 mm off; the fit spreads it
        f = rg.fit(self.P[:4], Q[:4], self.P[4], self.P[4])
        self.assertTrue(0 < f["rmse_mm"] < 3)
        self.assertAlmostEqual(rg.fit(self.P[:4], self.P[:4], self.P[4], self.P[4] + [0, 0, 10])["check_mm"], 10, places=9)

    def test_pose_points_and_angle(self):
        w2c = np.eye(4)
        w2c[:3, :3] = rot(2, 90)
        w2c[:3, 3] = -rot(2, 90) @ [1000, 2000, 0]  # centre at (1000, 2000, 0)
        pts = rg.pose_points(w2c, 500)
        np.testing.assert_allclose(pts[0], [1000, 2000, 0], atol=1e-9)
        np.testing.assert_allclose(pts[1] - pts[0], 500 * rot(2, 90)[0], atol=1e-9)
        self.assertAlmostEqual(rg.angle_deg(rot(0, 10), rot(0, 35)), 25, places=9)


class Cut(unittest.TestCase):
    def setUp(self):
        try:
            self.ei = load("panorama_views")
        except Exception as e:  # noqa: BLE001  (survey's las / pye57 helpers are not importable here)
            self.skipTest(f"photo/panorama_views.py: {e}")

    def spec(self, R=np.eye(3), t=(0, 0, 0)):
        W = 3600
        return {"width": W, "height": 1200, "pixel_w": 2 * np.pi / W, "pixel_h": 2 * np.pi / W, "R": R, "t_mm": np.array(t, float)}

    def test_a_world_point_lands_where_the_panorama_has_it(self):
        sp = self.spec(rot(2, 40) @ rot(0, 5), (1000, -500, 200))
        yy, xx = np.mgrid[0:sp["height"], 0:sp["width"]]
        pano = np.stack([xx % 256, yy % 256, (xx // 256) * 16], -1).astype(np.uint8)  # each pixel names its column and row
        view, K, w2c = self.ei.cut(pano, sp, yaw_deg=25, pitch_deg=4, hfov_deg=50, size=(400, 300))
        for az, el in ((25, 4), (35, 10), (12, -5)):  # rays in the panorama's local frame, inside the view
            a, e = np.radians(az), np.radians(el)
            world = sp["R"] @ (7000 * np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])) + sp["t_mm"]
            c = w2c @ np.r_[world, 1]
            u, v = (K @ (c[:3] / c[2]))[:2]
            col, row = self.ei.to_pixel(np.array(a), np.array(e), sp)
            self.assertTrue(0 <= u < 400 and 0 <= v < 300)
            got = view[int(v), int(u)].astype(int)
            self.assertLessEqual(abs(got[0] - int(col) % 256), 2)  # the view's pixel is the panorama's pixel on that ray
            self.assertLessEqual(abs(got[1] - int(row) % 256), 2)
        np.testing.assert_allclose((w2c @ np.r_[sp["t_mm"], 1])[:3], 0, atol=1e-9)  # the camera centre is the panorama's

    def test_spec_from_a_reader_record(self):
        sp = self.ei.spec({"rotation": [np.cos(np.pi / 8), 0, 0, np.sin(np.pi / 8)], "translation": [1.5, -2, 0.25], "width": 40, "height": 20,
                           "pixel_width": 0.1, "pixel_height": 0.1})  # 45 degrees about z
        np.testing.assert_allclose(sp["R"], rot(2, 45), atol=1e-12)
        np.testing.assert_allclose(sp["t_mm"], [1500, -2000, 250])

    def test_view_centre_is_the_yaw(self):
        sp = self.spec()
        pano = np.zeros((sp["height"], sp["width"], 3), np.uint8)
        col, _ = self.ei.to_pixel(np.radians(30.0), 0.0, sp)
        pano[:, int(col) - 2:int(col) + 3] = 255  # a bright column at azimuth 30 degrees
        view, _, _ = self.ei.cut(pano, sp, yaw_deg=30, hfov_deg=40, size=(201, 101))
        self.assertGreater(view[50, 100].mean(), 200)
        self.assertLess(view[50, 20].mean(), 10)


if __name__ == "__main__":
    unittest.main()
