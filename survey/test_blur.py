# MA-7-7 — sentinel-blur 0.1.0's self-checks, run from the repo root: C:\Python314\python.exe -B -m unittest discover -s survey -v.
# Synthetic photos only (random noise made here, with planted EXIF/GPS/ICC): a marked box is one flat colour, nothing else is touched,
# the long side is cut to 2048, and the copy carries no EXIF/XMP/ICC/thumbnail. Skipped, with why, where Pillow 12.3.0 is not installed.
# MA-7-16 (FD-1, FD-2): the YuNet face proposer - decoded from a STUBBED session on a synthetic photo (CI has no model and no onnxruntime);
# the real model is run only where it is on this PC (skipped otherwise).
import importlib.util
import json
import os
import random
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("blur", os.path.join(HERE, "blur.py"))
blur = importlib.util.module_from_spec(spec)
spec.loader.exec_module(blur)
try:
    blur._pillow()
    HAVE = True
except Exception as e:  # noqa: BLE001
    HAVE, WHY = False, str(e)


def segments(b):
    """The JPEG's marker segments before the scan: [(marker byte, payload start bytes)]."""
    out, i = [], 2
    while i + 4 <= len(b) and b[i] == 0xFF:
        m, n = b[i + 1], int.from_bytes(b[i + 2:i + 4], "big")
        if m == 0xDA:
            break
        out.append((m, b[i + 4:i + 16]))
        i += 2 + n
    return out


@unittest.skipUnless(HAVE, "Pillow 12.3.0 is not installed")
class Blur(unittest.TestCase):
    def photo(self, d, size=(3000, 2000), orientation=1):
        from PIL import Image
        rnd = random.Random(7)
        im = Image.frombytes("RGB", size, bytes(rnd.randrange(256) for _ in range(size[0] * size[1] * 3)))
        ex = Image.Exif()
        ex[0x010F], ex[0x0110], ex[0x0112] = "Example", "Test Cam 1", orientation
        ex.get_ifd(0x8825)[1] = "N"  # a GPS IFD is there
        p = os.path.join(d, "in.jpg")
        im.save(p, "JPEG", exif=ex, icc_profile=b"\0" * 144, quality=90)
        return p

    def test_fill_is_flat_rest_is_untouched_and_long_side_cut(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d), os.path.join(d, "out.jpg")
            r = blur.blur(src, dst, blur.read_boxes([{"x": 0.25, "y": 0.5, "w": 0.25, "h": 0.25}, {"x": 0.7, "y": 0.1, "w": 0.1, "h": 0.1}]))
            from PIL import Image, ImageStat
            import hashlib
            import pathlib
            self.assertEqual(r, {"width": 2048, "height": 1365, "areas": 2, "source_sha256": hashlib.sha256(pathlib.Path(src).read_bytes()).hexdigest()})
            with Image.open(dst) as im:
                self.assertEqual(im.size, (2048, 1365))
                inside = ImageStat.Stat(im.crop((int(2048 * .26), int(1365 * .51), int(2048 * .49), int(1365 * .74)))).stddev
                outside = ImageStat.Stat(im.crop((0, 0, 400, 400))).stddev
            self.assertLess(max(inside), 4, "a marked box is one flat colour (JPEG rounding only)")
            self.assertGreater(min(outside), 20, "the rest is the photo's own noise")

    def test_no_exif_xmp_icc_or_thumbnail_in_the_copy(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(800, 600)), os.path.join(d, "out.jpg")
            self.assertIn(b"Exif\0\0", open(src, "rb").read())
            blur.blur(src, dst, [])
            with open(dst, "rb") as f:
                b = f.read()
            self.assertNotIn(b"Exif\0\0", b)
            self.assertNotIn(b"http://ns.adobe.com/xap", b)
            self.assertNotIn(b"ICC_PROFILE", b)
            self.assertFalse({m for m, _ in segments(b)} & {0xE1, 0xE2, 0xED}, "no APP1, APP2 or APP13")

    def test_orientation_is_applied_before_the_boxes(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(600, 400), orientation=6), os.path.join(d, "out.jpg")  # shown rotated: 400 wide, 600 tall
            from PIL import Image
            self.assertEqual(blur.blur(src, dst, [])["width"], 400)
            with Image.open(dst) as im:
                self.assertEqual(im.size, (400, 600))

    def test_xmp_only_orientation_is_not_followed_as_a_browser_ignores_it(self):
        # MA-7-7 review: Pillow's getexif() trusts XMP tiff:Orientation; a browser does not. The box is where the person saw the face.
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            im = Image.new("RGB", (400, 200), (10, 20, 200))
            im.paste((255, 0, 0), (0, 0, 100, 100))  # the "face", top-left as shown
            src, dst = os.path.join(d, "x.jpg"), os.path.join(d, "o.jpg")
            xmp = b'<?xpacket?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" tiff:Orientation="6"/></rdf:RDF></x:xmpmeta>'
            im.save(src, "JPEG", quality=95, xmp=xmp)
            r = blur.blur(src, dst, blur.read_boxes([{"x": 0, "y": 0, "w": 0.5, "h": 0.5}]), (400, 200))  # the face plus blue beside it: the fill is purple
            self.assertEqual((r["width"], r["height"]), (400, 200))
            with Image.open(dst) as o:
                px = o.getpixel((50, 50))
            self.assertLess(px[0], 200, "the face is filled with the box's mean (purple), not left red")

    def test_shown_size_that_disagrees_is_refused_in_words(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(600, 400), orientation=6), os.path.join(d, "out.jpg")  # upright 400x600
            with self.assertRaisesRegex(ValueError, "wrong place"):
                blur.blur(src, dst, [], (600, 400))
            self.assertFalse(os.path.exists(dst))
            self.assertEqual(blur.blur(src, dst, [], (400, 600))["width"], 400)

    def test_an_mpo_photo_is_blurred_from_frame_zero_only(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            a, b = Image.new("RGB", (300, 200), (200, 10, 10)), Image.new("RGB", (60, 40), (0, 0, 0))
            src, dst = os.path.join(d, "two.jpg"), os.path.join(d, "o.jpg")
            a.save(src, "MPO", save_all=True, append_images=[b])
            with Image.open(src) as chk:
                self.assertEqual((chk.format, getattr(chk, "n_frames", 1)), ("MPO", 2))
            self.assertEqual(blur.blur(src, dst, [])["width"], 300)
            with Image.open(dst) as o:
                self.assertEqual((o.format, getattr(o, "n_frames", 1)), ("JPEG", 1))
            self.assertFalse({m for m, _ in segments(__import__("pathlib").Path(dst).read_bytes())} & {0xE1, 0xE2})

    def test_the_byte_cap_and_the_pixel_cap_refuse_and_leave_no_file(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(100, 100)), os.path.join(d, "o.jpg")
            for name, val in (("MAX_BYTES", 1000), ("MAX_PIXELS", 100)):
                old = getattr(blur, name)
                setattr(blur, name, val)
                try:
                    with self.assertRaises(Exception, msg=name):
                        blur.blur(src, dst, [])
                finally:
                    setattr(blur, name, old)
                self.assertEqual(os.listdir(d), ["in.jpg"], "no copy and no .part is left")

    def test_a_failed_save_leaves_no_part_file(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(100, 100)), os.path.join(d, "no-such-dir", "o.jpg")
            with self.assertRaises(Exception):
                blur.blur(src, dst, [])
            self.assertEqual(os.listdir(d), ["in.jpg"])

    def test_pillow_heif_is_blocked_not_loaded(self):
        self.assertIsNone(sys.modules.get("pillow_heif", 0))

    def test_boxes_are_validated(self):
        for bad in ([{"x": 0.9, "y": 0, "w": 0.3, "h": 0.1}], [{"x": 0, "y": 0, "w": 0, "h": 0.1}], [{"x": 0}], "x", [{"x": 0, "y": 0, "w": 1, "h": 1}] * 201):
            with self.assertRaises(ValueError):
                blur.read_boxes(bad)

    def test_cli_prints_one_json_line_and_names_no_path(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = self.photo(d, size=(400, 300)), os.path.join(d, "out.jpg")
            run = lambda boxes: subprocess.run([sys.executable, "-B", os.path.join(HERE, "blur.py"), src, dst, json.dumps(boxes)], capture_output=True, text=True)
            ok = run([{"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}])
            self.assertEqual(ok.returncode, 0)
            j = json.loads(ok.stdout)
            self.assertEqual((j["ok"], j["areas"], j["version"]), (True, 1, "0.1.0"))
            names = {t["name"]: t for t in j["tools"]}
            self.assertEqual((names["pillow"]["version"], names["pillow"]["licence"]), ("12.3.0", "MIT-CMU"))
            self.assertIn("FreeType (in pillow)", names)
            bad = run([{"x": 2, "y": 0, "w": 1, "h": 1}])
            self.assertEqual(bad.returncode, 2)
            self.assertFalse(json.loads(bad.stdout)["ok"])
            gone = subprocess.run([sys.executable, "-B", os.path.join(HERE, "blur.py"), os.path.join(d, "nope.jpg"), dst, "[]"], capture_output=True, text=True)
            self.assertEqual(gone.returncode, 2)
            self.assertNotIn(d, gone.stdout)

    def test_a_non_image_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.jpg")
            with open(p, "wb") as f:
                f.write(b"not an image")
            with self.assertRaises(Exception):
                blur.blur(p, os.path.join(d, "o.jpg"), [])
            self.assertFalse(os.path.exists(os.path.join(d, "o.jpg")))


def fake_outputs(cells):
    """YuNet's 12 outputs with score ~0.9 at the given (stride, row, col, log_w, log_h) cells and zero elsewhere."""
    import numpy as np
    outs = [np.zeros((1, (640 // st) ** 2, 1), np.float32) for st in (8, 16, 32)] * 2 + [np.zeros((1, (640 // st) ** 2, 4), np.float32) for st in (8, 16, 32)]         + [np.zeros((1, (640 // st) ** 2, 10), np.float32) for st in (8, 16, 32)]
    for st, r, c, lw, lh in cells:
        k, i = (8, 16, 32).index(st), r * (640 // st) + c
        outs[k][0, i, 0] = outs[3 + k][0, i, 0] = 0.9
        outs[6 + k][0, i, 2], outs[6 + k][0, i, 3] = lw, lh
    return outs


class Stub:
    def __init__(self, cells):
        self.cells, self.fed = cells, None

    def run(self, names, feeds):
        self.fed = feeds["input"]
        return fake_outputs(self.cells)


@unittest.skipUnless(HAVE, "Pillow 12.3.0 is not installed")
class Detect(unittest.TestCase):
    """MA-7-16: the model file is checked by sha256, then a stubbed session stands in for onnxruntime."""
    def setUp(self):
        try:
            import numpy  # noqa: F401
        except ImportError:
            self.skipTest("numpy is not installed")
        self.d = tempfile.TemporaryDirectory()
        self.addCleanup(self.d.cleanup)
        self.model = os.path.join(self.d.name, "m.onnx")
        with open(self.model, "wb") as f:
            f.write(b"stand-in model bytes")
        self.real_sha = blur.YUNET_SHA
        blur.YUNET_SHA = __import__("hashlib").sha256(b"stand-in model bytes").hexdigest()
        self.addCleanup(setattr, blur, "YUNET_SHA", self.real_sha)
        rnd = random.Random(3)
        from PIL import Image
        self.src = os.path.join(self.d.name, "p.jpg")
        Image.frombytes("RGB", (3000, 2000), bytes(rnd.randrange(256) for _ in range(3000 * 2000 * 3))).save(self.src, "JPEG", quality=60)

    def test_a_stubbed_session_gives_padded_fractions_and_a_letterboxed_bgr_input(self):
        stub = Stub([(8, 20, 30, 1.3862944, 1.3862944)])  # a 32 px box at (224, 144)-(256, 176) on the 640 canvas
        r = blur.detect(self.src, self.model, lambda data: stub)
        self.assertEqual((r["width"], r["height"], r["method"]), (3000, 2000, "detector+person"))
        self.assertEqual(len(r["faces"]), 1)
        f, k = r["faces"][0], 640 / 3000
        x0, x1 = 224 / k, 256 / k
        pad = (x1 - x0) * blur.YUNET_PAD
        self.assertAlmostEqual(f["x"], (x0 - pad) / 3000, places=3)
        self.assertAlmostEqual(f["w"], (x1 - x0 + 2 * pad) / 3000, places=3)
        self.assertAlmostEqual(f["score"], 0.9, places=2)
        self.assertEqual(stub.fed.shape, (1, 3, 640, 640))
        self.assertEqual(str(stub.fed.dtype), "float32")
        self.assertEqual(float(stub.fed[0, :, 430:, :].max()), 0.0, "the bottom of the canvas below the 427-row photo is black padding")
        blur.read_boxes([{k2: f[k2] for k2 in "xywh"}])  # a proposal is a valid blur box as it stands

    def test_overlapping_cells_are_suppressed_and_far_ones_kept(self):
        stub = Stub([(8, 20, 30, 1.3862944, 1.3862944), (8, 20, 31, 1.3862944, 1.3862944), (16, 5, 5, 1.3862944, 1.3862944)])
        self.assertEqual(len(blur.detect(self.src, self.model, lambda data: stub)["faces"]), 2)

    def test_no_face_is_an_empty_list_not_an_error(self):
        self.assertEqual(blur.detect(self.src, self.model, lambda data: Stub([]))["faces"], [])

    def test_a_missing_or_wrong_model_is_refused_in_words_and_no_session_is_made(self):
        made = []
        mk = lambda data: made.append(1)
        with self.assertRaisesRegex(ValueError, "not set up on this PC"):
            blur.detect(self.src, os.path.join(self.d.name, "none.onnx"), mk)
        with open(self.model, "wb") as f:
            f.write(b"another file")
        with self.assertRaisesRegex(ValueError, "not the approved"):
            blur.detect(self.src, self.model, mk)
        self.assertEqual(made, [])

    def test_the_cli_refuses_a_missing_model_and_names_no_path(self):
        env = {**os.environ, "USERPROFILE": self.d.name}
        r = subprocess.run([sys.executable, "-B", os.path.join(HERE, "blur.py"), "--detect", self.src], capture_output=True, text=True, env=env)
        j = json.loads(r.stdout)
        self.assertEqual((r.returncode, j["ok"]), (2, False))
        self.assertIn("mark the faces by hand", j["error"])
        self.assertNotIn(self.d.name, r.stdout)

    def test_detected_boxes_name_yunet_and_onnxruntime_in_the_tools(self):
        self.assertFalse({"yunet", "onnxruntime"} & {t["name"] for t in blur.tools()})
        got = {t["name"]: t for t in blur.tools(True)}
        self.assertEqual((got["yunet"]["version"], got["yunet"]["licence"]), ("2023mar", "MIT"))
        self.assertEqual((got["onnxruntime"]["version"], got["onnxruntime"]["licence"]), ("1.26.0", "MIT"))
        out = os.path.join(self.d.name, "o.jpg")
        r = subprocess.run([sys.executable, "-B", os.path.join(HERE, "blur.py"), self.src, out, json.dumps([{"x": .1, "y": .1, "w": .1, "h": .1}]), "--detected"], capture_output=True, text=True)
        self.assertIn("yunet", {t["name"] for t in json.loads(r.stdout)["tools"]})
        self.assertNotIn("pillow_heif", [m for m in sys.modules if sys.modules[m] is not None])

    @unittest.skipUnless(os.path.isfile(blur.yunet_path()), "the YuNet model is not on this PC")
    def test_the_real_model_runs_on_a_noise_photo(self):
        blur.YUNET_SHA = self.real_sha
        r = blur.detect(self.src)
        self.assertEqual(r["method"], "detector+person")
        self.assertIsInstance(r["faces"], list)


if __name__ == "__main__":
    unittest.main()
