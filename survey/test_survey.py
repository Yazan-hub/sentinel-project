# MA-4c — sentinel-survey 0.1's self-checks, run from the repo root: C:\Python314\python.exe -B -m unittest discover -s survey -v.
# The LAS reader, the WallPairing port (tools/wallpair-check/Check.cs's cases), the measuring code on a synthetic two-storey building
# written as a LAS here, determinism, and the service as the bridge runs it (its token, a changed file refused, the stdin watchdog, no
# file written, no network import). numpy and the standard library only.
import ast
import contextlib
import hashlib
import io
import json
import os
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from unittest import mock

import numpy as np

import las
import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))


def write_las(path, P, minor=2, fmt=0, rec_len=20, laz=False, scale=(0.001, 0.001, 0.001), origin=(0.0, 0.0, 0.0)):
    """P (mm) as a plain LAS in metres — records (P/1000 - origin)/scale, per axis as real files do: a header and the records, no VLR."""
    size = {2: 227, 3: 235, 4: 375}[minor]
    h = bytearray(size)
    h[0:4], h[24], h[25] = b"LASF", 1, minor
    struct.pack_into("<HII", h, 94, size, size, 0)
    struct.pack_into("<BHI", h, 104, fmt | (0x80 if laz else 0), rec_len, len(P) if minor < 4 else 0)
    struct.pack_into("<3d", h, 131, *scale)
    struct.pack_into("<3d", h, 155, *origin)
    if minor == 4:
        struct.pack_into("<Q", h, 247, len(P))
    rec = np.zeros(len(P), np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": rec_len}))
    for k, a in enumerate("xyz"):
        rec[a] = np.rint((P[:, k] / 1000.0 - origin[k]) / scale[k]).astype(np.int32)
    with open(path, "wb") as f:
        f.write(bytes(h) + rec.tobytes())


def building(seed=7, spacing=100.0):
    """The drill building (mm), every face scanned: outer faces x 0..8000, y 0..6000, z 0..6000; walls west 250, south 300, north 200
    and east 300 thick; L00 floor 0, ceiling 2800; L01 floor 3000, ceiling 5800. A jittered grid, 2 mm of noise across each surface."""
    rng = np.random.default_rng(seed)

    def grid(a0, a1, b0, b1):
        A, B = np.meshgrid(np.arange(a0, a1, spacing), np.arange(b0, b1, spacing))
        a, b = A.ravel() + rng.uniform(0, spacing, A.size), B.ravel() + rng.uniform(0, spacing, A.size)
        m = (a < a1) & (b < b1)
        return a[m], b[m]

    def flat(x0, x1, y0, y1, z):
        x, y = grid(x0, x1, y0, y1)
        return np.stack([x, y, z + rng.normal(0, 2, x.size)], 1)

    def wall_x(x, y0, y1, z0, z1):
        y, z = grid(y0, y1, z0, z1)
        return np.stack([x + rng.normal(0, 2, y.size), y, z], 1)

    def wall_y(y, x0, x1, z0, z1):
        x, z = grid(x0, x1, z0, z1)
        return np.stack([x, y + rng.normal(0, 2, x.size), z], 1)

    W, S, N, E, X, Y = 250, 300, 200, 300, 8000, 6000
    parts = []
    for zf, zc in ((0, 2800), (3000, 5800)):
        parts += [flat(W, X - E, S, Y - N, zf), flat(W, X - E, S, Y - N, zc), wall_x(W, S, Y - N, zf, zc), wall_x(X - E, S, Y - N, zf, zc),
                  wall_y(S, W, X - E, zf, zc), wall_y(Y - N, W, X - E, zf, zc)]
    parts += [wall_x(0, 0, Y, 0, 6000), wall_x(X, 0, Y, 0, 6000), wall_y(0, 0, X, 0, 6000), wall_y(Y, 0, X, 0, 6000)]
    return np.concatenate(parts)


class Las(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.tmp.cleanup)

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def test_reads_las_1_2_to_1_4_in_millimetres_with_each_axis_scale_and_offset(self):
        scale, origin = (0.001, 0.0005, 0.01), (450000.0, 5500000.0, 250.0)  # a national-grid origin, a scale per axis, as real files have
        P = np.array(origin) * 1000 + np.array([[1000.0, 2000.0, 3000.0], [4500.0, -6250.0, 1.0]])
        for minor, fmt, rec_len in ((2, 0, 20), (3, 1, 28), (4, 6, 30)):
            p = self.path(f"a{minor}.las")
            write_las(p, P, minor, fmt, rec_len, scale=scale, origin=origin)
            head = las.read_header(p)
            self.assertEqual(head["count"], 2)
            got = las.read_points_mm(p, head)
            for k in range(3):  # within half a scale step on each axis: 0.5, 0.25 and 5 mm
                np.testing.assert_allclose(got[:, k], P[:, k], rtol=0, atol=scale[k] * 500 + 1e-6)

    def test_a_capped_read_is_the_same_whatever_the_chunk(self):
        p = self.path("chunks.las")
        write_las(p, np.random.default_rng(2).uniform(0, 9000, (5000, 3)))
        head = las.read_header(p)
        whole = las.read_points_mm(p, head, 0.3, np.random.default_rng(1))
        with mock.patch.object(las, "CHUNK", 7):
            np.testing.assert_array_equal(las.read_points_mm(p, head, 0.3, np.random.default_rng(1)), whole)

    def test_refuses_what_0_1_does_not_read_in_words(self):
        write_las(self.path("ok.las"), np.zeros((3, 3)))
        with open(self.path("ok.las"), "rb") as f:
            good = f.read()
        laz, old = bytearray(good), bytearray(good)
        laz[104] |= 0x80
        old[25] = 1
        for head, size, words in ((bytes(laz), len(good), "compressed (LAZ)"), (b"ASTM-E57" + good[8:], len(good), "not a LAS file"),
                                  (bytes(old), len(good), "LAS 1.1 is not read"), (good, len(good) - 1, "truncated")):
            with self.assertRaises(las.Refused) as e:
                las.parse_header(head[:375], size)
            self.assertIn(words, str(e.exception))
        write_las(self.path("none.las"), np.zeros((0, 3)))
        with self.assertRaisesRegex(las.Refused, "holds no points"):
            las.read_header(self.path("none.las"))


class Pair(unittest.TestCase):
    """tools/wallpair-check/Check.cs's cases, rule for rule: the port gives what WallPairing.cs gives."""

    def test_two_faces_are_one_wall_with_its_thickness_and_centreline(self):
        w = pipeline.pair([(0, 0, 5000, 0), (0, 200, 5000, 200)])
        self.assertEqual(len(w), 1)
        self.assertAlmostEqual(w[0][4], 200, places=2)
        self.assertAlmostEqual(w[0][1], 100)
        self.assertAlmostEqual(w[0][3], 100)

    def test_a_rooms_opposite_walls_stay_two_unpaired_lines(self):
        self.assertEqual([x[4] for x in pipeline.pair([(0, 0, 5000, 0), (0, 4000, 5000, 4000)], max_thickness=1000)], [0.0, 0.0])

    def test_a_reversed_face_pairs(self):
        w = pipeline.pair([(0, 0, 3000, 0), (3000, 300, 0, 300)])
        self.assertEqual(len(w), 1)
        self.assertAlmostEqual(w[0][4], 300, places=2)

    def test_collinear_end_to_end_faces_do_not_pair(self):
        self.assertTrue(all(x[4] == 0 for x in pipeline.pair([(0, 0, 2000, 0), (2000, 0, 4000, 0)])))

    def test_each_face_takes_its_closest_partner(self):
        w = pipeline.pair([(0, 0, 6000, 0), (0, 100, 6000, 100), (0, 500, 6000, 500), (0, 800, 6000, 800)])
        self.assertEqual(sorted(round(x[4]) for x in w), [100, 300])

    def test_a_lone_face_is_kept_with_no_thickness(self):
        self.assertEqual(pipeline.pair([(0, 0, 1000, 0)]), [(0, 0, 1000, 0, 0.0, 0, -1)])

    def test_two_degrees_of_drift_still_pairs(self):
        self.assertEqual(len(pipeline.pair([(0, 0, 5000, 0), (0, 200, 5000, 375)])), 1)


class Survey(unittest.TestCase):
    PARAMS = {"voxel_mm": 20, "storey_min_mm": 2000}

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        path = os.path.join(cls.tmp.name, "two-storey.las")
        write_las(path, building())
        cls.items = [{"id": "ev-0001", "path": path, "head": las.read_header(path)}]
        cls.found, cls.stats = pipeline.survey(cls.items, cls.PARAMS, 1)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def of(self, kind):
        return [c for c in self.found if c["kind"] == kind]

    def near(self, got, want, delta):
        self.assertEqual(len(got), len(want), got)
        for g, w in zip(got, want):
            self.assertAlmostEqual(g, w, delta=delta)

    def test_two_storeys_with_their_floors_and_ceilings(self):
        self.assertEqual([c["cid"] for c in self.of("level")], ["scan-L00-level", "scan-L01-level"])
        self.near([c["measured"]["elevation_mm"] for c in self.of("level")], [0, 3000], 5)
        self.near([c["measured"]["elevation_mm"] for c in self.of("ceiling")], [2800, 5800], 5)
        self.near([c["measured"]["height_mm"] for c in self.of("ceiling")], [2800, 2800], 5)
        self.near([c["geometry"]["Offset"] for c in self.of("ceiling")], [2800, 2800], 5)  # the contract's key: height above its level
        self.assertEqual([c["geometry"]["storey"] for c in self.of("floor")], ["scan-L00-level", "scan-L01-level"])
        for f in self.of("floor") + self.of("ceiling"):
            corners = f["geometry"].get("LocationLoop") or f["geometry"]["Boundary"]
            xs, ys = sorted(p[0] for p in corners), sorted(p[1] for p in corners)
            self.near([xs[0], xs[-1], ys[0], ys[-1]], [250, 7700, 300, 5800], 100)  # the inner faces; ~40 mm inside them (NEAR_FACE)
            self.assertGreater(f["fit"]["coverage"], 0.9)

    def test_eight_walls_with_their_thickness_and_place(self):
        walls = self.of("wall")
        self.assertEqual(len(walls), 8)
        want = {("y", 150): 300, ("y", 5900): 200, ("x", 125): 250, ("x", 7850): 300}  # the centreline's axis and place → thickness
        for w in walls:
            s, e = w["geometry"]["LocationCurve"]["start"], w["geometry"]["LocationCurve"]["end"]
            key = ("y", round((s[1] + e[1]) / 50) * 25) if abs(e[1] - s[1]) < abs(e[0] - s[0]) else ("x", round((s[0] + e[0]) / 50) * 25)
            self.assertIn(key, want, w["cid"])
            self.assertAlmostEqual(w["measured"]["thickness_mm"], want[key], delta=10)
            self.assertAlmostEqual(w["measured"]["height_mm"], 2800, delta=5)
            self.assertEqual(s[2], w["geometry"]["BaseElevation"])
            self.assertEqual(len(w["geometry"]["faces"]), 2)
            self.assertTrue(w["evidence"] and all(x.startswith("ev-0001#slice-L0") for x in w["evidence"]))

    def test_no_candidate_carries_a_type_and_each_names_its_evidence(self):
        for c in self.found:
            self.assertEqual(set(c), {"cid", "kind", "geometry", "measured", "evidence", "fit"})
            self.assertNotIn("TypeName", c["geometry"])
            self.assertTrue(c["evidence"] and all(x.startswith("ev-0001#") for x in c["evidence"]))
            self.assertEqual(set(c["fit"]), {"inliers", "rmse_mm", "coverage"})

    def test_the_same_points_params_and_seed_give_the_same_candidates(self):
        again, stats = pipeline.survey(self.items, self.PARAMS, 1)
        self.assertEqual(json.dumps(again), json.dumps(self.found))
        self.assertEqual(stats, self.stats)

    def test_past_the_point_cap_a_seeded_sample_the_same_every_run(self):
        cap = pipeline.MAX_POINTS
        pipeline.MAX_POINTS = 20_000
        try:
            a, sa = pipeline.survey(self.items, self.PARAMS, 5)
            b, _ = pipeline.survey(self.items, self.PARAMS, 5)
        finally:
            pipeline.MAX_POINTS = cap
        self.assertEqual(json.dumps(a), json.dumps(b))
        self.assertLess(sa["points_used"], 21_000)
        self.near(sorted(w["measured"]["thickness_mm"] for w in a if w["kind"] == "wall"), [200, 200, 250, 250, 300, 300, 300, 300], 10)

    def test_a_scan_in_national_grid_coordinates_gives_the_same_building_in_its_own_frame(self):
        off = np.array([450_000_000.0, 5_500_000_000.0, 250_000.0])  # mm: E 450 km, N 5500 km, 250 m up — a UTM-like registered scan
        path = os.path.join(self.tmp.name, "utm.las")
        write_las(path, building() + off, origin=tuple(off / 1000))
        found, _ = pipeline.survey([{"id": "ev-0001", "path": path, "head": las.read_header(path)}], self.PARAMS, 1)
        self.near([c["measured"]["elevation_mm"] for c in found if c["kind"] == "level"], [250_000, 253_000], 5)
        self.near(sorted(c["measured"].get("thickness_mm", 0) for c in found if c["kind"] == "wall"), [200, 200, 250, 250, 300, 300, 300, 300], 10)
        s = next(c for c in found if c["kind"] == "wall")["geometry"]["LocationCurve"]["start"]
        self.assertGreater(min(s[0] - off[0], s[1] - off[1]), -500)  # the output stays in the scan's own (absolute) frame
        self.assertLess(max(s[0] - off[0], s[1] - off[1]), 8500)

    def test_scans_wider_than_one_building_are_refused_in_words(self):
        path = os.path.join(self.tmp.name, "site.las")
        write_las(path, np.array([[0.0, 0.0, 0.0], [400_000.0, 0.0, 0.0]]))
        with self.assertRaises(las.Refused) as e:
            pipeline.survey([{"id": "ev-0001", "path": path, "head": las.read_header(path)}], self.PARAMS, 1)
        self.assertEqual(str(e.exception), "the scans span 400 m in plan — sentinel-survey 0.1 reads one building (at most 300 m across); "
                                           "a larger site waits for MA-4h")


class Voxel(unittest.TestCase):
    def test_one_point_per_cube_the_first_in_reading_order_as_the_row_sort_gives(self):
        P = np.random.default_rng(3).uniform(-5000, 5000, (20000, 3))
        got, _ = pipeline.voxel(P, np.zeros(len(P), np.int64), 50.0)
        _, first = np.unique(np.floor(P / 50).astype(np.int64), axis=0, return_index=True)
        np.testing.assert_array_equal(got, P[np.sort(first)])
