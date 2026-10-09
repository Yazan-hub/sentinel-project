# MA-4c — sentinel-survey 0.1's self-checks, run from the repo root: C:\Python314\python.exe -B -m unittest discover -s survey -v.
# The LAS reader, the WallPairing port (tools/wallpair-check/Check.cs's cases), the measuring code on a synthetic two-storey building
# written as a LAS here, determinism, and the service as the bridge runs it (its token, a changed file refused, the stdin watchdog, no
# file written, no network import). numpy and the standard library; MA-4g's LAZ and E57 tests need its wheels
# (survey/requirements-ma4g.txt) and are skipped, with why, where they are not installed.
import ast
import contextlib
import hashlib
import io
import importlib.util
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
import e57
import pipeline
import service

HERE = os.path.dirname(os.path.abspath(__file__))


def write_las(path, P, minor=2, fmt=0, rec_len=20, laz=False, scale=(0.001, 0.001, 0.001), origin=(0.0, 0.0, 0.0), vlrs=(), evlrs=()):
    """P (mm) as a plain LAS in metres — records (P/1000 - origin)/scale, per axis as real files do. MA-4g: vlrs and evlrs (LAS 1.4),
    each [(user_id, record_id, data)], after the header and after the points; laz sets the compression bit only (no LASzip record)."""
    size = {2: 227, 3: 235, 4: 375}[minor]
    v = b"".join(struct.pack("<H16sHH32s", 0, u, r, len(d), b"") + d for u, r, d in vlrs)
    h = bytearray(size)
    h[0:4], h[24], h[25] = b"LASF", 1, minor
    struct.pack_into("<HII", h, 94, size, size + len(v), len(vlrs))
    struct.pack_into("<BHI", h, 104, fmt | (0x80 if laz else 0), rec_len, len(P) if minor < 4 else 0)
    struct.pack_into("<3d", h, 131, *scale)
    struct.pack_into("<3d", h, 155, *origin)
    if minor == 4:
        struct.pack_into("<Q", h, 247, len(P))
    rec = np.zeros(len(P), np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": rec_len}))
    for k, a in enumerate("xyz"):
        rec[a] = np.rint((P[:, k] / 1000.0 - origin[k]) / scale[k]).astype(np.int32)
    e = b"".join(struct.pack("<H16sHQ32s", 0, u, r, len(d), b"") + d for u, r, d in evlrs)
    if evlrs:
        struct.pack_into("<QI", h, 235, size + len(v) + rec.nbytes, len(evlrs))
    with open(path, "wb") as f:
        f.write(bytes(h) + v + rec.tobytes() + e)


las.add_lib()  # MA-4g: the pinned wheels' private folder (las.LIB) first on sys.path, so find_spec sees what las.lib imports
HAS = lambda *names: all(importlib.util.find_spec(n) is not None for n in names)
WHY = "{} not installed under this Python — MA-4g's wheels (survey/requirements-ma4g.txt)"
# MA-4g: a projected CRS in metres, as a LAS writer puts it in its WKT VLR (EPSG codes nested in the datum, the units and the CRS itself).
UTM33 = ('PROJCS["ETRS89 / UTM zone 33N",GEOGCS["ETRS89",DATUM["European_Terrestrial_Reference_System_1989",SPHEROID["GRS 1980",6378137,'
         '298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6258"]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],'
         'AUTHORITY["EPSG","4258"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],'
         'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,'
         'AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","25833"]]')


def geokeys(keys):
    """MA-4g: a GeoTIFF key directory (LASF_Projection 34735) from {key: value}, every value in its own entry."""
    return struct.pack(f"<{4 + 4 * len(keys)}H", 1, 1, 0, len(keys), *[x for k, v in sorted(keys.items()) for x in (k, 0, 1, v)])


def write_e57(path, P, poses):
    """MA-4g: P (mm) as an E57 written by pye57 itself — scan k holds its share of P in its own frame, posed by poses[k] = (an angle about
    z, a translation in m). Local coordinates stay small (pye57 stores them as float32); the pose is double."""
    pye57 = las.lib("pye57")
    with pye57.E57(path, mode="w") as e:
        for part, (theta, t) in zip(np.array_split(P / 1000.0, len(poses)), poses):
            c, s = math.cos(theta), math.sin(theta)
            local = (part - np.array(t)) @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])  # global = R·local + t
            e.write_scan_raw({k: local[:, n] for n, k in enumerate(("cartesianX", "cartesianY", "cartesianZ"))},
                             rotation=np.array([math.cos(theta / 2), 0, 0, math.sin(theta / 2)]), translation=np.array(t, float))


def write_e57_shell(path, xml):
    """MA-4g: an E57's header and XML section only (one page, no data, no checksums) — what the struct check reads before any library."""
    page0 = struct.pack("<8sIIQQQQ", b"ASTM-E57", 1, 0, 2048, 1024, len(xml), 1024).ljust(1024, b"\0")
    with open(path, "wb") as f:
        f.write(page0 + xml.ljust(1020, b" ") + b"\0" * 4)


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

    def test_refuses_what_it_does_not_read_in_words(self):
        write_las(self.path("ok.las"), np.zeros((3, 3)))
        with open(self.path("ok.las"), "rb") as f:
            good = f.read()
        old, bit6, laz = bytearray(good), bytearray(good), bytearray(good)
        old[25] = 1
        bit6[104] |= 0x40
        laz[104] |= 0x80
        for head, size, words in ((b"ASTM-E58" + good[8:], len(good), "not a LAS, LAZ or E57 file (it begins neither LASF nor ASTM-E57)"),
                                  (bytes(old), len(good), "LAS 1.1 is not read — sentinel-survey reads LAS 1.2 to 1.4"),
                                  (bytes(bit6), len(good), "point format 64 with 20-byte records is not a LAS point record"),
                                  (good, len(good) - 1, "truncated")):
            with self.assertRaises(las.Refused) as e:
                las.parse_header(head[:375], size)
            self.assertIn(words, str(e.exception))
        self.assertTrue(las.parse_header(bytes(laz)[:375], 10)["laz"])  # MA-4g: a LAZ's records are compressed — no length check
        write_las(self.path("bit.las"), np.zeros((3, 3)), laz=True)  # the drill's compressed.las: the bit, no LASzip record
        with self.assertRaises(las.Refused) as e:
            las.read_header(self.path("bit.las"))
        self.assertEqual(str(e.exception), "its points are marked compressed (LAZ) but no LASzip record was found — it is not read as a LAZ; export it again")
        write_las(self.path("many.laz"), np.zeros((3, 3)), laz=True, vlrs=[(b"laszip encoded", 22204, bytes(34))])
        with open(self.path("many.laz"), "r+b") as f:  # its VLR count: laspy would walk 4e9 of them
            f.seek(100)
            f.write(struct.pack("<I", 0xFFFFFFFF))
        with mock.patch.object(las, "lib", side_effect=AssertionError("laspy imported")), self.assertRaises(las.Refused) as e:
            las.read_header(self.path("many.laz"))
        self.assertEqual(str(e.exception), "its header declares more than 1,000 VLRs — not read as a LAZ")
        write_las(self.path("none.las"), np.zeros((0, 3)))
        with self.assertRaisesRegex(las.Refused, "holds no points"):
            las.read_header(self.path("none.las"))

    def test_the_crs_from_its_wkt_or_geotiff_keys_a_1_4_evlr_too_none_is_metres_assumed(self):
        P = np.zeros((3, 3))
        wkt = (b"LASF_Projection", 2112, UTM33.encode() + b"\0")
        for n, (kw, want, units) in enumerate((
                ({"vlrs": [wkt]}, ("wkt", 25833, "metre"), "metres (its CRS)"),
                ({"vlrs": [(b"other", 1, b"x" * 10), wkt]}, ("wkt", 25833, "metre"), "metres (its CRS)"),
                ({"vlrs": [(b"LASF_Projection", 34735, geokeys({1024: 1, 3072: 32633, 3076: 9001}))]}, ("geokeys", 32633, "metre"), "metres (its CRS)"),
                # a US-feet code with no unit key: no pyproj looks the code's unit up, so the receipt says the metre is assumed
                ({"vlrs": [(b"LASF_Projection", 34735, geokeys({1024: 1, 3072: 2263}))]}, ("geokeys", 2263, None), "metres assumed (its CRS's unit not stated)"),
                ({"minor": 4, "fmt": 6, "rec_len": 30, "evlrs": [wkt]}, ("wkt", 25833, "metre"), "metres (its CRS)"))):
            p = self.path(f"crs{n}.las")
            write_las(p, P, **kw)
            head = las.read_header(p)
            c = head["crs"]
            self.assertEqual((c["source"], c["epsg"], c["unit"]), want)
            self.assertEqual(set(c), {"source", "epsg", "unit", "sha256"})  # no name: the file's free text never reaches a caller
            self.assertRegex(c["sha256"], "^[0-9a-f]{64}$")
            self.assertEqual(service.input_of({"id": "ev-0001", "head": head})["units"], units)
        write_las(self.path("plain.las"), P)
        head = las.read_header(self.path("plain.las"))
        self.assertEqual((head["format"], head["laz"], head["crs"]), ("las", False, None))
        self.assertEqual(las.wkt_crs("EPSG:25833", "e57", check=False)["epsg"], 25833)  # an E57's coordinateMetadata, as writers put it

    def test_a_crs_in_degrees_or_not_in_metres_is_refused_in_words(self):
        geog = UTM33[UTM33.index("GEOGCS"):UTM33.index(",PROJECTION")]
        feet = UTM33.replace('UNIT["metre",1,AUTHORITY["EPSG","9001"]]', 'UNIT["US survey foot",0.304800609601219]')
        degrees = ("its CRS is geographic or geocentric (degrees, or x, y, z from the Earth's centre) — sentinel-survey reads a projected CRS "
                   "or a local frame in metres; reproject the scan first")
        for n, (rid, data, words) in enumerate((
                (2112, geog.encode(), degrees),
                (2112, feet.encode(), "its CRS's unit is 0.304801 m — sentinel-survey reads metres; convert the scan to metres first"),
                (34735, geokeys({1024: 2, 2048: 4258}), degrees),
                (34735, geokeys({1024: 1, 3072: 2263, 3076: 9003}), "its CRS's unit is US survey foot — sentinel-survey reads metres; convert the scan to metres first"),
                (34735, geokeys({1024: 1, 3072: 32633, 4099: 9002}), "its CRS's vertical unit is foot — sentinel-survey reads metres; convert the scan to metres first"))):
            p = self.path(f"bad{n}.las")
            write_las(p, np.zeros((3, 3)), vlrs=[(b"LASF_Projection", rid, data)])
            with self.assertRaises(las.Refused) as e:
                las.read_header(p)
            self.assertEqual(str(e.exception), words)

    def test_one_job_reads_one_declared_crs_named_by_code_or_sha_never_its_text(self):
        P = building()[:2000]
        a, b, c, d = self.path("a.las"), self.path("b.las"), self.path("c.las"), self.path("d.las")
        nocode = UTM33[:UTM33.rindex(',AUTHORITY["EPSG","25833"]')] + "]"  # the same CRS with no code of its own
        write_las(a, P, vlrs=[(b"LASF_Projection", 2112, UTM33.encode())])
        write_las(b, P, vlrs=[(b"LASF_Projection", 34735, geokeys({1024: 1, 3072: 32633}))])
        write_las(c, P)
        write_las(d, P, vlrs=[(b"LASF_Projection", 2112, nocode.encode())])
        item = lambda i, p: {"id": i, "path": p, "head": las.read_header(p)}
        pipeline.load([item("ev-0001", a), item("ev-0003", c)], {"voxel_mm": 20}, 1)  # one declared, one not: read ("assumed")
        for other, said in ((b, "EPSG:32633"), (d, f"a CRS with no EPSG code (sha256 {hashlib.sha256(nocode.encode()).hexdigest()[:12]})")):
            with self.assertRaises(las.Refused) as e:
                pipeline.load([item("ev-0001", a), item("ev-0002", other)], {"voxel_mm": 20}, 1)
            self.assertEqual(str(e.exception), f"the scans declare different CRSs (ev-0001: EPSG:25833; ev-0002: {said}) — "
                                               "one job reads one frame; survey scans in one CRS")
            self.assertNotIn("UTM", str(e.exception))

    def test_a_header_offset_past_the_file_is_never_sought(self):
        p, q = self.path("far.las"), self.path("far.e57")
        write_las(p, np.zeros((3, 3)), minor=4, fmt=6, rec_len=30)
        write_e57_shell(q, b'<?xml version="1.0" encoding="UTF-8"?><e57Root/>')
        for path, at in ((p, 235), (q, 24)):  # a LAS 1.4's EVLR offset, an E57's xmlPhysicalOffset: 2^63 (Python cannot seek it)
            with open(path, "r+b") as f:
                f.seek(at)
                f.write(struct.pack("<Q", 1 << 63))
        item = lambda path: {"kind": "scan", "path": path, "sha256": service.sha256(path)}
        head, why = service.check(item(p))  # its EVLRs past the end are not read, as a short read is: the points still are
        self.assertEqual((why, head["count"], head["crs"]), (None, 3, None))
        self.assertEqual(service.check(item(q)), (None, "the file is shorter than its header says (truncated)"))

    def test_a_librarys_failure_is_words_that_name_no_path(self):
        with self.assertRaises(las.Refused) as e:
            with las.damaged("E57"):
                raise OSError(f"cannot read {self.path('site.e57')}")
        self.assertEqual(str(e.exception), "the E57 could not be read (OSError) — the file may be damaged")
        with self.assertRaises(las.Refused) as e:
            with las.damaged("LAZ"):
                raise las.Refused("its own words")
        self.assertEqual(str(e.exception), "its own words")
        with self.assertRaises(MemoryError):  # not damage: service.run says MemoryError, with no path
            with las.damaged("LAZ"):
                raise MemoryError()

    def test_a_wheel_at_another_version_is_refused_in_words(self):
        with mock.patch("importlib.metadata.version", return_value="2.8.0"), self.assertRaises(las.Refused) as e:
            las.lib("laspy")
        self.assertEqual(str(e.exception), "laspy 2.8.0 is installed — sentinel-survey reads with laspy 2.7.0; install the pinned wheels "
                                           "offline, as survey/requirements-ma4g.txt says")

    def test_an_e57_whose_parser_could_fetch_a_file_is_refused_before_any_library(self):
        xsi = b'<?xml version="1.0"?><e57Root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        for n, xml in enumerate((b'<?xml version="1.0"?><!DOCTYPE e57Root SYSTEM "http://example.test/x.dtd"><e57Root/>',
                                 xsi + b'xsi:schemaLocation="http://example.test/e57.xsd"/>',
                                 xsi + b'xsi:noNamespaceSchemaLocation="http://example.test/e57.xsd"/>',  # a capital S: any case is refused
                                 xsi + b'xsi:noNamespaceSchemaLocation="file://example.test/s/x.xsd"/>',  # a share: an SMB connection
                                 b'<?xml version="1.0" encoding="UTF-16"?><e57Root/>',
                                 "\ufeff<e57Root/>".encode("utf-16-le"))):
            p = self.path(f"x{n}.e57")
            write_e57_shell(p, xml)
            with mock.patch.object(las, "lib", side_effect=AssertionError("a library before the check")), self.assertRaises(las.Refused) as e:
                las.read_header(p)
            self.assertEqual(str(e.exception), "its XML is not plain UTF-8, or it declares a DTD, an entity or a schema location — an E57 whose "
                                               "parser could fetch a file is not read")

    def test_without_the_wheels_a_plain_las_reads_and_a_laz_or_an_e57_is_refused_in_words(self):
        write_las(self.path("plain.las"), np.zeros((3, 3)))
        write_las(self.path("fake.laz"), np.zeros((3, 3)), laz=True, vlrs=[(b"laszip encoded", 22204, b"\0" * 34)])
        write_e57_shell(self.path("shell.e57"), b'<?xml version="1.0" encoding="UTF-8"?><e57Root/>')
        with mock.patch.dict(sys.modules, {"laspy": None, "pye57": None}):
            self.assertEqual(len(las.read_points_mm(self.path("plain.las"), las.read_header(self.path("plain.las")))), 3)
            for name, words in (("fake.laz", "a LAZ is read with laspy and lazrs — "), ("shell.e57", "an E57 is read with pye57 — ")):
                with self.assertRaises(las.Refused) as e:
                    las.read_header(self.path(name))
                self.assertEqual(str(e.exception), f"{words}not importable under this Python (not installed, or a DLL it needs is missing); "
                                                   "install the four pinned wheels offline, as survey/requirements-ma4g.txt says")

    def test_an_e57_scan_is_read_when_cartesian(self):
        self.assertIsNone(e57.fields_refusal(["cartesianX", "cartesianY", "cartesianZ", "intensity"]))
        self.assertEqual(e57.fields_refusal(["sphericalRange", "sphericalAzimuth", "sphericalElevation"]),
                         "its points are spherical (range, azimuth, elevation) — sentinel-survey reads cartesian E57 points; export the scan as cartesian")


@unittest.skipUnless(HAS("laspy", "lazrs"), WHY.format("laspy and lazrs are"))
class Laz(unittest.TestCase):
    """MA-4g: a LAZ written by laspy itself from a LAS written here — the same points, read in chunks, capped or not."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.tmp.cleanup)

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def laz(self, p, q, wkt=None):
        laspy = las.lib("laspy")  # never a plain import here: it would import requests for real (NoNetwork pins the block in a child)
        d = laspy.read(p)
        if wkt:
            d.header.vlrs.append(laspy.vlrs.known.WktCoordinateSystemVlr(wkt))
        d.write(q, do_compress=True)

    def test_a_laz_reads_the_points_of_its_las_capped_or_not_whatever_the_chunk(self):
        off = (450000.0, 5500000.0, 250.0)
        P = np.array(off) * 1000 + np.random.default_rng(4).uniform(0, 9000, (5000, 3))
        for minor, fmt, rec_len in ((2, 0, 20), (4, 6, 30)):
            p, q = self.path(f"a{minor}.las"), self.path(f"a{minor}.laz")
            write_las(p, P, minor, fmt, rec_len, origin=off)
            self.laz(p, q, UTM33 if minor == 4 else None)  # the WKT VLR is LAS 1.4's
            hp, hq = las.read_header(p), las.read_header(q)
            self.assertEqual((hq["format"], hq["laz"], hq["count"]), ("laz", True, 5000))
            self.assertEqual(hq["crs"] and hq["crs"]["epsg"], 25833 if minor == 4 else None)
            np.testing.assert_array_equal(las.read_points_mm(q, hq), las.read_points_mm(p, hp))
            capped = las.read_points_mm(p, hp, 0.3, np.random.default_rng(1))
            with mock.patch.object(las, "CHUNK", 7):
                np.testing.assert_array_equal(las.read_points_mm(q, hq, 0.3, np.random.default_rng(1)), capped)

    def test_a_laz_survey_gives_the_candidates_of_its_las(self):
        p, q = self.path("b.las"), self.path("b.laz")
        write_las(p, building())
        self.laz(p, q)
        found = lambda path: pipeline.survey([{"id": "ev-0001", "path": path, "head": las.read_header(path)}], Survey.PARAMS, 1)
        a, b = found(p), found(q)
        self.assertEqual(json.dumps(b), json.dumps(a))
        self.assertEqual(len([c for c in b[0] if c["kind"] == "wall"]), 8)

    def test_a_damaged_laz_fails_in_words_that_name_no_path(self):
        p, q = self.path("c.las"), self.path("c.laz")
        write_las(p, building())
        self.laz(p, q)
        with open(q, "r+b") as f:
            f.truncate(os.path.getsize(q) // 2)
        with self.assertRaises(las.Refused) as e:
            las.read_points_mm(q, las.read_header(q))
        self.assertNotIn(os.sep, str(e.exception))
        self.assertNotIn("c.laz", str(e.exception))


@unittest.skipUnless(HAS("pye57"), WHY.format("pye57 is"))
class E57(unittest.TestCase):
    """MA-4g: an E57 written by pye57 itself — two scans, each in its own frame, posed into a national grid."""
    OFF = np.array([450_000_000.0, 5_500_000_000.0, 250_000.0])  # mm
    POSES = [(0.5, (450_001.0, 5_500_002.0, 250.0)), (2.0, (450_004.0, 5_500_003.0, 250.1))]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self.tmp.cleanup)

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def test_two_posed_scans_read_in_the_files_frame_capped_or_not_whatever_the_buffer(self):
        P = building() + self.OFF
        p = self.path("two.e57")
        write_e57(p, P, self.POSES)
        head = las.read_header(p)  # the XML check passes on what libE57Format writes
        self.assertEqual((head["format"], head["count"], head["crs"]), ("e57", len(P), None))
        self.assertEqual([(s["points"], s["posed"]) for s in head["scans"]], [(len(a), True) for a in np.array_split(P, 2)])
        np.testing.assert_allclose(las.read_points_mm(p, head), P, rtol=0, atol=0.01)
        capped = las.read_points_mm(p, head, 0.3, np.random.default_rng(1))
        with mock.patch.object(las, "CHUNK", 7):  # also pins that libE57's read() returns each buffer's count
            np.testing.assert_array_equal(las.read_points_mm(p, head, 0.3, np.random.default_rng(1)), capped)
        found, _ = pipeline.survey([{"id": "ev-0005", "path": p, "head": head}], Survey.PARAMS, 1)
        self.assertEqual(len([c for c in found if c["kind"] == "wall"]), 8)
        self.assertTrue(all(x.startswith("ev-0005#") for c in found for x in c["evidence"]))

    def test_a_damaged_e57_is_refused_in_words_that_name_no_path(self):
        p = self.path("bad.e57")
        write_e57(p, building(), [(0.0, (0.0, 0.0, 0.0))])
        with open(p, "r+b") as f:  # one byte flipped in a data page (libE57 writes its XML last, so a cut would only fail the XML check)
            at = struct.unpack_from("<Q", f.read(48), 24)[0] // 2
            f.seek(at)
            b = f.read(1)
            f.seek(at)
            f.write(bytes([b[0] ^ 0xFF]))
        with self.assertRaises(las.Refused) as e:
            las.read_points_mm(p, las.read_header(p))
        self.assertRegex(str(e.exception), r"^the E57 could not be read \(\w+\) — the file may be damaged$")  # pye57 reached: damaged
        self.assertNotIn("bad.e57", str(e.exception))


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
        self.assertEqual(str(e.exception), "the scans span 400 m in plan — sentinel-survey reads one building (at most 300 m across); "
                                           "a larger site waits for MA-4h")


class Voxel(unittest.TestCase):
    def test_one_point_per_cube_the_first_in_reading_order_as_the_row_sort_gives(self):
        P = np.random.default_rng(3).uniform(-5000, 5000, (20000, 3))
        got, _ = pipeline.voxel(P, np.zeros(len(P), np.int64), 50.0)
        _, first = np.unique(np.floor(P / 50).astype(np.int64), axis=0, return_index=True)
        np.testing.assert_array_equal(got, P[np.sort(first)])


class Thin(unittest.TestCase):
    """MA-4f: pipeline.thin — the scan overlay's points from the job's cloud."""

    def test_the_band_only_one_point_per_cube_the_cube_doubled_under_the_cap_the_same_twice(self):
        P = building()
        Q, cell, of = pipeline.thin(P, (300, 2500), 100, 10 ** 6)
        self.assertEqual(Q.dtype, np.int64)
        self.assertTrue(((Q[:, 2] >= 300) & (Q[:, 2] <= 2500)).all())
        self.assertEqual((cell, len(Q)), (100, of))
        Q2, cell2, of2 = pipeline.thin(P, (300, 2500), 100, of // 3)
        self.assertEqual(of2, of)
        self.assertGreater(cell2, 100)
        self.assertLessEqual(len(Q2), of // 3)
        np.testing.assert_array_equal(Q2, pipeline.thin(P, (300, 2500), 100, of // 3)[0])

    def test_nothing_in_the_band_is_no_point(self):
        Q, cell, of = pipeline.thin(building(), (90000, 91000), 100, 5000)
        self.assertEqual((Q.shape, cell, of), ((0, 3), 100, 0))


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

    def test_partitions_abutting_a_wall_take_their_own_points_at_the_join(self):
        # Three 100 mm partitions filed from the south wall's inner face (y 300), all sent: their points within 200 mm of the join are
        # nearer their own faces than the wall's, so they never count against it (63.3 mm p95 before the fix, a false out_of_tolerance).
        rng = np.random.default_rng(3)
        parts = [self.P]
        for x in (2000, 4000, 6000):
            for fx in (x - 50, x + 50):
                y, z = rng.uniform(300, 3000, 800), rng.uniform(0, 2800, 800)
                parts.append(np.stack([fx + rng.normal(0, 2, y.size), y, z], 1))
        els = [self.wall()] + [{"guid": f"part-{x}", "faces": wall_faces((x, 300), (x, 3000), 100, 0, 2800)} for x in (2000, 4000, 6000)]
        out = pipeline.deviation(np.concatenate(parts), els, self.TOLS)
        self.assertLess(max(m["p95_mm"] for m in out), 5.0, out)

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
        self.assertEqual(version, "0.2.0")
        self.assertEqual(self.call(port, "GET", "/health", token="nope")[0], 401)
        code, health = self.call(port, "GET", "/health")
        names = [t["name"] for t in health["tools"]]
        self.assertEqual(names[:3], ["sentinel-survey", "python", "numpy"])
        self.assertLessEqual(set(names[3:]), {"laspy", "lazrs", "laz (in lazrs)", "pye57", "libE57Format (in pye57)", "Xerces-C++ (in pye57)", "pyquaternion"})
        if HAS("laspy", "lazrs", "pye57", "pyquaternion"):  # a fresh child, as the bridge starts it: service.tools adds las.LIB itself
            self.assertEqual(names[3:], ["laspy", "lazrs", "laz (in lazrs)", "pye57", "libE57Format (in pye57)", "Xerces-C++ (in pye57)", "pyquaternion"])
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
        self.assertEqual((result["receipt"]["seed"], result["receipt"]["inputs"]), (1, [{"id": "ev-0001", "format": "las", "points": len(building()), "crs": None, "units": "metres assumed (no CRS read)"}]))
        self.assertEqual(os.listdir(self.cwd.name), [])  # it writes nothing — not even in its own folder

    def test_a_measure_over_http_is_this_processs_one_run_polled_as_a_job(self):
        path = os.path.join(self.data.name, "two-storey.las")
        write_las(path, building())
        with open(path, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        _, port, _ = self.start()
        body = {"job_id": "measure-1", "items": [{"id": "ev-0001", "kind": "scan", "path": path, "sha256": sha}],
                "params": {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}, "seed": 1,
                "elements": [{"guid": "wall-1", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}]}
        self.assertEqual(self.call(port, "POST", "/measure", {**body, "elements": []})[0], 400)
        self.assertEqual(self.call(port, "POST", "/measure", body)[0], 202)
        self.assertEqual(self.call(port, "POST", "/jobs", body)[0], 409)  # one run per process, a job or a measure
        for _ in range(200):
            status = self.call(port, "GET", "/jobs/measure-1")[1]
            if status["status"] in ("done", "failed", "refused"):
                break
            time.sleep(0.1)
        self.assertEqual(status["status"], "done", status)
        self.assertLess(self.call(port, "GET", "/jobs/measure-1/result")[1]["elements"][0]["p95_mm"], 5.0)
        self.assertEqual(os.listdir(self.cwd.name), [])

    def test_a_cloud_over_http_refuses_a_bad_cloud_in_words_and_queues_a_good_one(self):
        """MA-4f: POST /cloud as the bridge sends it — a cloud outside its bounds is a 400 before any read; a good one is this process's run."""
        path = os.path.join(self.data.name, "two-storey.las")
        write_las(path, building())
        with open(path, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        _, port, _ = self.start()
        body = {"job_id": "scan-1", "items": [{"id": "ev-0001", "kind": "scan", "path": path, "sha256": sha}],
                "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1, "cloud": {"cell_mm": 100, "z_mm": [300, 2500], "max_points": 5000}}
        code, bad = self.call(port, "POST", "/cloud", {**body, "cloud": {**body["cloud"], "z_mm": [2500, 300]}})
        self.assertEqual((code, bad["message"].startswith("cloud must be {cell_mm: 20 to 1000")), (400, True))
        self.assertEqual(self.call(port, "POST", "/cloud", body)[0], 202)

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

    @unittest.skipUnless(HAS("laspy", "lazrs", "pye57"), WHY.format("laspy, lazrs and pye57 are"))
    def test_a_job_on_a_las_its_laz_and_an_e57_names_each_input_and_every_wheel(self):
        laspy = las.lib("laspy")  # never a plain import: it would import requests for real
        p, q, r = (os.path.join(self.data.name, n) for n in ("b.las", "b.laz", "b.e57"))
        write_las(p, building())
        d = laspy.read(p)
        d.header.vlrs.append(laspy.vlrs.known.WktCoordinateSystemVlr(UTM33))
        d.write(q, do_compress=True)
        write_e57(r, building(), [(0.5, (1.0, 2.0, 0.0)), (2.0, (4.0, 3.0, 0.1))])
        items = [{"id": f"ev-000{n + 1}", "kind": "scan", "path": x, "sha256": service.sha256(x)} for n, x in enumerate((p, q, r))]
        job = self.run_job_items(items)
        self.assertEqual(job["status"], "done", job)
        n = len(building())
        crs = {"source": "wkt", "epsg": 25833, "unit": "metre", "sha256": hashlib.sha256(UTM33.encode()).hexdigest()}
        self.assertEqual(job["result"]["receipt"]["inputs"], [
            {"id": "ev-0001", "format": "las", "points": n, "crs": None, "units": "metres assumed (no CRS read)"},
            {"id": "ev-0002", "format": "laz", "points": n, "crs": crs, "units": "metres (its CRS)"},
            {"id": "ev-0003", "format": "e57", "points": n, "crs": None, "units": "metres (E57)",
             "scans": [{"points": n - n // 2, "posed": True}, {"points": n // 2, "posed": True}]}])
        self.assertEqual(len([c for c in job["result"]["candidates"] if c["kind"] == "wall"]), 8)
        self.assertEqual([t["name"] for t in job["result"]["receipt"]["tools"]],
                         ["sentinel-survey", "python", "numpy", "laspy", "lazrs", "laz (in lazrs)", "pye57", "libE57Format (in pye57)",
                          "Xerces-C++ (in pye57)", "pyquaternion"])

    def run_job_items(self, items):
        service.JOB.clear()
        service.JOB.update(id="job-0001", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):
            service.run({"job_id": "job-0001", "items": items, "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1})
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
            self.assertEqual(service.check(item), (None, "5 points — sentinel-survey reads at most 4 in one file; a larger scan waits for MA-4h"))

    MEASURE = {"voxel_mm": 20, "storey_min_mm": 2000, "tolerances_mm": [50, 100, 200]}

    def run_measure(self, items, elements):
        service.JOB.clear()
        service.JOB.update(id="measure-1", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):
            service.run({"job_id": "measure-1", "items": items, "params": self.MEASURE, "seed": 1, "elements": elements})
        return service.JOB

    def test_a_measure_reads_the_jobs_cloud_again_and_gives_numbers_and_its_knobs(self):
        item = self.item(building())
        job = self.run_measure([item], [{"guid": "wall-1", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}])
        self.assertEqual(job["status"], "done", job)
        (m,) = job["result"]["elements"]
        self.assertLess(m["p95_mm"], 5.0)
        self.assertNotIn("candidates", job["result"])
        self.assertEqual(job["result"]["receipt"]["measure"], {"band_mm": 400, "edge_mm": 200.0, "cell_mm": 200.0})
        self.assertEqual(job["result"]["receipt"]["seed"], 1)

    def test_a_measure_with_one_item_not_read_measures_nothing(self):
        item = self.item(building())
        job = self.run_measure([item, {**item, "id": "ev-0002", "sha256": "0" * 64}], [{"guid": "w", "faces": wall_faces((125, 150), (7850, 150), 300, 0, 2800)}])
        self.assertEqual((job["status"], [r["id"] for r in job["refused"]]), ("refused", ["ev-0002"]))
        self.assertNotIn("result", job)

    def test_read_measure_refuses_in_words(self):
        good = {"job_id": "measure-1", "items": [{"id": "ev-0001", "kind": "scan", "path": "x", "sha256": "a" * 64}], "params": dict(self.MEASURE), "seed": 1,
                "elements": [{"guid": "w", "faces": wall_faces((0, 0), (5000, 0), 200, 0, 2800)}]}
        self.assertEqual(service.read_measure(good)["elements"][0]["guid"], "w")
        for bad, words in (({**good, "params": {"voxel_mm": 20, "storey_min_mm": 2000}}, "params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising"),
                           ({**good, "params": {**self.MEASURE, "tolerances_mm": [200, 50]}}, "params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising"),
                           ({**good, "elements": []}, "elements must be 1 to 200 [{guid, faces}]"),
                           ({**good, "elements": [good["elements"][0]] * 2}, "elements[1].guid must be a text of 1 to 128 characters, each once"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [1000, 0, 0], [500, 0, 2800]]]}]},
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [1000, 0, 0], [0, 0, float("nan")]]]}]},
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [1e200, 0, 0], [0, 0, 2800]]]}]},  # finite, overflows
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0"),
                           ({**good, "elements": [{"guid": "w", "faces": [[[0, 0, 0], [10 ** 400, 0, 0], [0, 0, 2800]]]}]},  # past float range
                            "elements[0].faces must be 1 to 12 rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0")):
            with self.assertRaises(ValueError) as e:
                service.read_measure(bad)
            self.assertEqual(str(e.exception), words)

    def test_a_cloud_reads_the_jobs_cloud_again_and_gives_whole_mm_points_in_the_band(self):
        item = self.item(building())
        service.JOB.clear()
        service.JOB.update(id="scan-1", status="queued", stage="queued", pct=0, refused=[])
        with contextlib.redirect_stderr(io.StringIO()):
            service.run({"job_id": "scan-1", "items": [item], "params": {"voxel_mm": 20, "storey_min_mm": 2000}, "seed": 1,
                         "cloud": {"cell_mm": 100, "z_mm": [300, 2500], "max_points": 5000}})
        job = service.JOB
        self.assertEqual(job["status"], "done", job)
        pts, rc = job["result"]["points"], job["result"]["receipt"]
        self.assertTrue(0 < len(pts) <= 5000 and all(len(p) == 3 and all(isinstance(v, int) for v in p) and 300 <= p[2] <= 2500 for p in pts))
        self.assertEqual((rc["cloud"]["points"], rc["cloud"]["z_mm"], rc["seed"]), (len(pts), [300, 2500], 1))
        self.assertGreaterEqual(rc["cloud"]["of"], len(pts))
        self.assertNotIn("candidates", job["result"])
        self.assertEqual(job["result"]["derived"], [])

    def test_read_cloud_refuses_in_words(self):
        good = {"job_id": "scan-1", "items": [{"id": "ev-0001", "kind": "scan", "path": "x", "sha256": "a" * 64}], "params": {"voxel_mm": 20, "storey_min_mm": 2000},
                "seed": 1, "cloud": {"cell_mm": 100, "z_mm": [300, 2500], "max_points": 5000}}
        self.assertEqual(service.read_cloud(good)["cloud"], good["cloud"])
        for bad in ({**good, "cloud": None}, {**good, "cloud": {**good["cloud"], "cell_mm": 10}}, {**good, "cloud": {**good["cloud"], "z_mm": [2500, 300]}},
                    {**good, "cloud": {**good["cloud"], "z_mm": [0, float("nan")]}}, {**good, "cloud": {**good["cloud"], "max_points": 7}},
                    {**good, "cloud": {**good["cloud"], "max_points": True}}):
            with self.assertRaises(ValueError) as e:
                service.read_cloud(bad)
            self.assertEqual(str(e.exception), "cloud must be {cell_mm: 20 to 1000, z_mm: [low, high] mm, max_points: 8 to 100000}")


class NoNetwork(unittest.TestCase):
    def test_numpy_and_the_standard_library_at_start_laspy_and_pye57_only_inside_a_read_and_no_client(self):
        wheels = {"laspy", "pye57", "pyquaternion"}
        allowed = {"numpy", "las", "e57", "pipeline", "hashlib", "hmac", "json", "os", "sys", "threading", "time", "datetime", "http.server",
                   "struct", "math", "re", "contextlib", "importlib.metadata", "platform", "traceback"} | wheels
        for name in ("las.py", "e57.py", "pipeline.py", "service.py"):
            with open(os.path.join(HERE, name), encoding="utf-8") as f:
                tree = ast.parse(f.read())
            used = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
            used |= {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
            self.assertLessEqual(used, allowed, name)  # no socket, urllib, http.client, requests: it listens, it never calls out
            top = {a.name for n in tree.body if isinstance(n, ast.Import) for a in n.names}
            top |= {n.module for n in tree.body if isinstance(n, ast.ImportFrom)}
            self.assertFalse(top & wheels, name)  # MA-4g: imported only inside a LAZ's or an E57's read, after las.lib

    @unittest.skipUnless(HAS("laspy", "lazrs"), WHY.format("laspy and lazrs are"))
    def test_laspy_finds_no_http_client(self):
        # MA-4g: laspy's COPC reader imports requests when it can, and requests is in the user site. A child process, started as the
        # bridge starts the service, so nothing this test process imported first can hide a missing block.
        out = subprocess.run([sys.executable, "-E", "-B", "-c", "import las, sys; las.lib('laspy'); print(sys.modules['requests'] is None)"],
                             cwd=HERE, capture_output=True, text=True, timeout=120)
        self.assertEqual(out.stdout.strip(), "True", out.stderr[-500:])
