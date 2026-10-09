# MA-4c — sentinel-survey 0.1's self-checks, run from the repo root: C:\Python314\python.exe -B -m unittest discover -s survey -v.
# The LAS reader, the WallPairing port (tools/wallpair-check/Check.cs's cases), the measuring code on a synthetic two-storey building
# written as a LAS here, determinism, and the service as the bridge runs it (its token, a changed file refused, the stdin watchdog, no
# file written, no network import). numpy and the standard library only.
import ast
import contextlib
import hashlib
import io
import json
import math
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
import service

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


def wall_faces(start, end, t, z0, z1):
    """MA-4e: a wall's two long faces as survey-plan.mjs facesOf builds them — [p0, p1, p3], (p1 − p0) × (p3 − p0) out of the wall."""
    (ax, ay), (bx, by) = start, end
    L = math.hypot(bx - ax, by - ay)
    nx, ny = -(by - ay) / L * t / 2, (bx - ax) / L * t / 2
    return [[[ax + nx, ay + ny, z0], [ax + nx, ay + ny, z1], [bx + nx, by + ny, z0]],
            [[ax - nx, ay - ny, z0], [bx - nx, by - ny, z0], [ax - nx, ay - ny, z1]]]


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


class Deviation(unittest.TestCase):
    """MA-4e: pipeline.deviation on the drill building (2 mm of noise across each face) — numbers only, the bridge judges (survey-plan judge).
    Pinned from the in-memory run of the plan (Base)."""
    TOLS = [50, 100, 200]

    @classmethod
    def setUpClass(cls):
        cls.P = building()

    def wall(self, dy=0, t=300, guid="wall-1"):  # the south wall as filed (trimmed to x 125..7850, y 150), moved dy in y
        return {"guid": guid, "faces": wall_faces((125, 150 + dy), (7850, 150 + dy), t, 0, 2800)}

    def test_a_wall_where_it_was_scanned_is_a_few_mm_off_both_faces_seen_numbers_only(self):
        (m,) = pipeline.deviation(self.P, [self.wall()], self.TOLS)
        self.assertEqual(set(m), {"guid", "points", "p95_mm", "mean_signed_mm", "share_within", "coverage"})  # no status: the bridge's
        self.assertLess(m["p95_mm"], 5.0)  # |N(0, 2)|'s p95 is 3.9 mm
        self.assertLess(abs(m["mean_signed_mm"]), 0.5)
        self.assertEqual(m["share_within"], {"50": 1.0, "100": 1.0, "200": 1.0})
        self.assertGreaterEqual(m["coverage"], 0.98)
        self.assertGreater(m["points"], 3000)  # both faces, 200 mm in from every edge — the floor, the ceiling and the corners left out

    def test_a_wall_moved_60_mm_is_60_off_plus_on_one_face_minus_on_the_other(self):
        (m,) = pipeline.deviation(self.P, [self.wall(dy=60)], self.TOLS)
        self.assertTrue(58 < m["p95_mm"] < 66, m)
        self.assertLess(abs(m["mean_signed_mm"]), 2.0)
        self.assertEqual(m["share_within"], {"50": 0.0, "100": 1.0, "200": 1.0})

    def test_a_wall_modelled_100_mm_too_thick_reads_minus_50_the_scan_inside_it(self):
        (m,) = pipeline.deviation(self.P, [self.wall(t=400)], self.TOLS)
        self.assertTrue(-52 < m["mean_signed_mm"] < -48, m)
        self.assertTrue(50 < m["p95_mm"] < 57, m)

    def test_a_wall_where_nothing_was_scanned_has_no_point_and_its_cells_counted_empty(self):
        (m,) = pipeline.deviation(self.P, [self.wall(dy=1000)], self.TOLS)  # faces at y 1 000 and 1 300: the nearest scan face is 700 mm off
        self.assertEqual((m["points"], m["p95_mm"], m["mean_signed_mm"], m["share_within"], m["coverage"]), (0, None, None, None, 0.0))

    def test_a_wall_seen_from_one_side_250_mm_off_is_judged_on_that_face_not_unseen(self):
        # The south wall's outer face (y 0) not scanned — an exterior wall in an interior scan; the wall placed 250 mm off. Every point the
        # face owns (within 400 mm) counts for coverage, so p95 decides (out of tolerance), never insufficient data. Base, review round 2.
        P = self.P[np.abs(self.P[:, 1]) >= 10]
        (m,) = pipeline.deviation(P, [self.wall(dy=-250)], self.TOLS)
        self.assertAlmostEqual(m["coverage"], 0.5, delta=0.02)
        self.assertTrue(250 < m["p95_mm"] < 257, m)
        self.assertTrue(248 < m["mean_signed_mm"] < 252, m)
        self.assertEqual(m["share_within"], {"50": 0.0, "100": 0.0, "200": 0.0})

    def test_a_face_under_400_mm_has_no_interior(self):
        (m,) = pipeline.deviation(self.P, [{"guid": "stub", "faces": wall_faces((125, 150), (450, 150), 300, 0, 2800)}], self.TOLS)
        self.assertEqual((m["points"], m["coverage"]), (0, None))

    def test_each_point_goes_to_the_nearest_face_of_every_element_sent(self):
        east = {"guid": "wall-3", "faces": wall_faces((7850, 150), (7850, 5900), 300, 0, 2800)}
        a, b = pipeline.deviation(self.P, [self.wall(), east], self.TOLS)
        self.assertEqual([a["guid"], b["guid"]], ["wall-1", "wall-3"])
        self.assertLess(max(a["p95_mm"], b["p95_mm"]), 5.0)

    def test_load_gives_the_cloud_survey_measured_the_same_twice(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as d:
            path = os.path.join(d, "b.las")
            write_las(path, building())
            items = [{"id": "ev-0001", "path": path, "head": las.read_header(path)}]
            P1, _, n = pipeline.load(items, {"voxel_mm": 20}, 1)
            P2, _, _ = pipeline.load(items, {"voxel_mm": 20}, 1)
            _, stats = pipeline.survey(items, {"voxel_mm": 20, "storey_min_mm": 2000}, 1)
        np.testing.assert_array_equal(P1, P2)
        self.assertEqual((n, len(P1)), (stats["points_in"], stats["points_used"]))


class Service(unittest.TestCase):
    """service.py as the bridge runs it: -E -B, an allow-listed environment, a token, its stdin held."""
    TOKEN = "t" * 64

    def setUp(self):
        self.cwd = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.data = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.cwd.cleanup)
        self.addCleanup(self.data.cleanup)

    def start(self):
        env = {"SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "APPDATA": os.environ.get("APPDATA", ""), "SENTINEL_SURVEY_TOKEN": self.TOKEN}
        p = subprocess.Popen([sys.executable, "-E", "-B", os.path.join(HERE, "service.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, env={k: v for k, v in env.items() if v}, cwd=self.cwd.name)

        def stop():
            if p.poll() is None:
                p.kill()
            p.wait(10)
            p.stdout.close()
            if not p.stdin.closed:
                p.stdin.close()
        self.addCleanup(stop)
        line = json.loads(p.stdout.readline())
        return p, line["port"], line["version"]

    def call(self, port, method, path, body=None, token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {token or self.TOKEN}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            with e:  # closed here, not left to the garbage collector (a ResourceWarning in the run)
                return e.code, json.loads(e.read())

    def test_health_answers_only_its_token_and_names_each_tool_with_its_licence(self):
        _, port, version = self.start()
        self.assertEqual(version, "0.1.0")
        self.assertEqual(self.call(port, "GET", "/health", token="nope")[0], 401)
        code, health = self.call(port, "GET", "/health")
        self.assertEqual([t["name"] for t in health["tools"]], ["sentinel-survey", "python", "numpy"])
        self.assertTrue(all(t["licence"] for t in health["tools"]))

    def test_a_job_on_the_las_a_changed_file_refused_in_words_and_no_file_written(self):
        path = os.path.join(self.data.name, "two-storey.las")
        write_las(path, building())
        with open(path, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        _, port, _ = self.start()
        body = {"job_id": "job-0001", "items": [{"id": "ev-0001", "kind": "scan", "path": path, "sha256": sha},
                                                {"id": "ev-0002", "kind": "scan", "path": path, "sha256": "0" * 64}],
                "params": {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}, "seed": 1}
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 202)
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 409)  # one job per process
        for _ in range(200):
            status = self.call(port, "GET", "/jobs/job-0001")[1]
            if status["status"] in ("done", "failed", "refused"):
                break
            time.sleep(0.1)
        self.assertEqual(status["status"], "done", status)
        self.assertEqual(status["refused"], [{"id": "ev-0002", "reason": "changed since admitted (its sha256 is not the pack's) — Re-check flags it"}])
        result = self.call(port, "GET", "/jobs/job-0001/result")[1]
        self.assertEqual(len([c for c in result["candidates"] if c["kind"] == "wall"]), 8)
        self.assertEqual((result["receipt"]["seed"], result["receipt"]["units"]), (1, "metres assumed (no CRS read)"))
        self.assertEqual(os.listdir(self.cwd.name), [])  # it writes nothing — not even in its own folder

    def test_it_exits_when_the_bridge_goes(self):
        p, _, _ = self.start()
        p.stdin.close()  # what a bridge ended by any route (taskkill /f too) does to the pipe
        self.assertEqual(p.wait(10), 3)


class InProcess(unittest.TestCase):
    """service.py's parts in this process: its listener, a file gone or changed around the read, the point limit."""

    def setUp(self):
        self.data = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.data.cleanup)
        self.addCleanup(service.JOB.clear)

    def item(self, P):
        path = os.path.join(self.data.name, "a.las")
        write_las(path, P)
        with open(path, "rb") as f:
            return {"id": "ev-0001", "kind": "scan", "path": path, "sha256": hashlib.sha256(f.read()).hexdigest()}

    def run_job(self, item):
        service.JOB.clear()
        service.JOB.update(id="job-0001", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):  # a traceback is the bridge log's
            service.run({"job_id": "job-0001", "items": [item], "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1})
        return service.JOB

    def test_the_listener_shares_its_port_with_no_one_and_drops_an_idle_connection(self):
        server = service.Server(("127.0.0.1", 0), service.Handler)
        self.addCleanup(server.server_close)
        self.assertEqual(server.socket.getsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR), 0)
        self.assertEqual((server.daemon_threads, service.Handler.timeout), (True, 10))

    def test_a_file_gone_after_its_hash_fails_in_words_that_name_no_path(self):
        item = self.item(np.zeros((5, 3)))
        head = las.read_header(item["path"])
        os.remove(item["path"])
        with mock.patch.object(service, "check", return_value=(head, None)):
            job = self.run_job(item)
        self.assertEqual(job["status"], "failed")
        self.assertTrue(job["error"].startswith("a scan was not read ("), job["error"])
        self.assertNotIn(os.sep, job["error"])
        self.assertNotIn("a.las", job["error"])

    def test_a_file_changed_while_it_was_read_keeps_nothing(self):
        item = self.item(np.zeros((5, 3)))

        def rewrite(*_):
            with open(item["path"], "ab") as f:
                f.write(b"\0")
            return [], {"points_in": 5, "points_used": 5}
        with mock.patch.object(service.pipeline, "survey", side_effect=rewrite):
            job = self.run_job(item)
        self.assertEqual((job["status"], job["error"]), ("failed", "ev-0001 changed while it was read — nothing it found was kept"))
        self.assertNotIn("result", job)

    def test_a_file_over_the_point_limit_is_refused_in_words(self):
        item = self.item(np.zeros((5, 3)))
        with mock.patch.object(service, "MAX_POINTS_IN", 4):
            self.assertEqual(service.check(item), (None, "5 points — sentinel-survey 0.1 reads at most 4 in one file; a larger scan waits for MA-4h"))


class NoNetwork(unittest.TestCase):
    def test_the_service_imports_numpy_and_the_standard_library_only_and_no_client(self):
        allowed = {"numpy", "las", "pipeline", "hashlib", "hmac", "json", "os", "sys", "threading", "time", "datetime", "http.server",
                   "struct", "math", "importlib.metadata", "platform", "traceback"}
        for name in ("las.py", "pipeline.py", "service.py"):
            with open(os.path.join(HERE, name), encoding="utf-8") as f:
                tree = ast.parse(f.read())
            used = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
            used |= {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
            self.assertLessEqual(used, allowed, name)  # no socket, urllib, http.client: it listens, it never calls out
