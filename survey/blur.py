"""sentinel-blur 0.1.0 (MA-7-7): one photo in, one blurred copy out. A one-shot script the bridge runs (not a service): no port, no network,
no file but the two paths it is given.

Each person-marked box is FILLED with its own mean colour (irreversible: nothing of the area is kept, unlike a Gaussian or a pixelate that
can be partly undone), the long side is cut to 2048, and the copy is built from the pixels alone, so no EXIF, XMP, ICC profile or thumbnail
is carried (the camera's make, time and GPS stay in the original only). Pillow is the installed 12.3.0 (MIT-CMU; the founder OK'd it
2026-10-13), version-pinned; pillow_heif (LGPL libheif) is blocked before PIL is imported, and a HEIC is not admitted.

    python blur.py <source.jpg> <copy.jpg> '<[{"x":0.1,"y":0.2,"w":0.05,"h":0.07}, ...]>' [<shown width>x<shown height>]

    python blur.py --detect <source.jpg>        (MA-7-16: propose face boxes; blurs nothing, writes nothing)
    ... a trailing --detected on the blur form says the boxes began as YuNet's proposals (the tools list then names YuNet and onnxruntime)

x, y, w, h are fractions (0 to 1) of the photo AS A VIEWER SHOWS IT (EXIF APP1 orientation applied, as a browser does). Prints one JSON line:
{"ok": true, "width", "height", "areas", "tools": [...]} or {"ok": false, "error": "..."} (exit 2). No pixel or path is ever echoed.
"""
import hashlib
import importlib.metadata
import io
import json
import math
import os
import sys
import warnings

sys.modules["pillow_heif"] = None  # MA-7-7 (amendment 33): the HEIC plug-in bundles LGPL libheif; never imported in process. Before `import PIL`.

VERSION = "0.1.0"
PILLOW = "12.3.0"
LONG_SIDE = 2048
MAX_BOXES = 200
MAX_PIXELS = 100_000_000  # Pillow warns above this and fails above twice; both are refused here
MAX_BYTES = 64 * 1024 * 1024  # MA-7-7 (R18): the bridge refuses a bigger photo at admission; the tool refuses it too, before reading it
SHOWN_TOLERANCE = 0.01  # the shown aspect may differ from the rotated one by this much (rounding), no more
# EXIF orientation tag value -> the transpose that shows the photo upright, as a browser does (MA-7-7 review: the EXIF APP1 tag only)
ORIENT = {2: "FLIP_LEFT_RIGHT", 3: "ROTATE_180", 4: "FLIP_TOP_BOTTOM", 5: "TRANSPOSE", 6: "ROTATE_270", 7: "TRANSVERSE", 8: "ROTATE_90"}

# MA-7-16: the face detector. YuNet 2023mar (MIT, opencv_zoo) on the installed onnxruntime, numpy pre/post, no OpenCV. The model is found by path and
# checked by sha256; it is never in the repo. A proposal only - a person confirms the boxes and adds the plates (no permissive plate model exists).
ONNXRUNTIME = "1.26.0"
YUNET_FILE = "face_detection_yunet_2023mar.onnx"
YUNET_SHA = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
YUNET_MAX_BYTES = 4 * 1024 * 1024  # the real file is 0.23 MB
YUNET_SIZE = 640  # the ONNX has a fixed 1x3x640x640 input
YUNET_SCORE = 0.5  # below OpenCV's 0.9: a person confirms, so recall matters more than a clean list
YUNET_NMS = 0.3
YUNET_PAD = 0.1  # each box grows by this fraction per side: YuNet's box is tight to the face
METHOD = "detector+person"

# What Pillow's wheel carries (read from pillow-12.3.0.dist-info/licenses/LICENSE and sboms/*.cdx.json, 2026-10-13). Listed only at that pin
# (the survey INSIDE pattern, survey/service.py). Not in this Windows wheel: libimagequant (GPL-3.0-or-later; no symbol in any .pyd,
# PIL.features.check("imagequant") is False) and FriBiDi (LGPL-2.1-or-later; a shim that loads a system library, absent here).
INSIDE = [("FreeType", "2.14.3", "FTL"), ("HarfBuzz", "14.2.1", "MIT"), ("libjpeg-turbo", "3.1.4.1", "IJG AND BSD-3-Clause"),
          ("libwebp", "1.6.0", "BSD-3-Clause"), ("libtiff", "4.7.1", "libtiff"), ("Little CMS 2", "2.19.1", "MIT"),
          ("OpenJPEG", "2.5.4", "BSD-2-Clause"), ("libavif", "1.4.2", "BSD-2-Clause"), ("libpng", "1.6.58", "libpng-2.0"),
          ("zlib", "2.3.3", "Zlib"), ("brotli", "1.2.0", "MIT"), ("xz", "5.8.3", "0BSD")]


def _pillow():
    got = importlib.metadata.version("pillow")
    if got != PILLOW:
        raise RuntimeError(f"sentinel-blur {VERSION} is built for Pillow {PILLOW} (this PC has {got}) - a new Pillow is a new licence read")
    from PIL import Image, ImageStat  # noqa: E402 (after the pin and the pillow_heif block)
    return Image, ImageStat


def tools(detected=False):
    """sentinel-blur, Pillow (licence from its own metadata) and what Pillow's wheel carries: the evidence:blurred row's tools[]. `detected`: YuNet and onnxruntime too."""
    md = importlib.metadata.metadata("pillow")
    out = [{"name": "sentinel-blur", "version": VERSION, "licence": "LicenseRef-Sentinel"},
           {"name": "pillow", "version": md["Version"], "licence": md.get("License-Expression") or md.get("License") or "not declared"}]
    if md["Version"] == PILLOW:
        out += [{"name": f"{n} (in pillow)", "version": v, "licence": lic} for n, v, lic in INSIDE]
    if detected:  # MA-7-16: the licences are the ones read for the pins (tools/licence-check/allow.json)
        out += [{"name": "yunet", "version": "2023mar", "licence": "MIT"}, {"name": "onnxruntime", "version": ONNXRUNTIME, "licence": "MIT"}]
    return out


def read_boxes(raw):
    """The boxes, validated: a list of at most MAX_BOXES {x, y, w, h} fractions inside the photo. ValueError in words."""
    if not isinstance(raw, list) or len(raw) > MAX_BOXES:
        raise ValueError(f"boxes must be a list of at most {MAX_BOXES}")
    out = []
    for b in raw:
        try:
            x, y, w, h = (float(b[k]) for k in ("x", "y", "w", "h"))
        except (TypeError, KeyError, ValueError):
            raise ValueError("each box needs numbers x, y, w and h")
        if not all(0 <= v <= 1 for v in (x, y, w, h)) or w <= 0 or h <= 0 or x + w > 1.0001 or y + h > 1.0001:
            raise ValueError("each box must lie inside the photo (fractions from 0 to 1, width and height above 0)")
        out.append((x, y, w, h))
    return out


def _upright(Image, im0, im):
    """`im` turned by the EXIF APP1 orientation only - what a browser shows. Pillow's getexif() also trusts an XMP tiff:Orientation and a PNG
    text chunk, which a browser ignores; following it would put the fill on the wrong part of the photo."""
    raw = im0.info.get("exif")
    if not raw:
        return im
    ex = Image.Exif()
    ex.load(raw)
    name = ORIENT.get(ex.get(0x0112))
    return im.transpose(getattr(Image.Transpose, name)) if name else im


def _decode(Image, data):
    """The photo's bytes as an upright RGB image (the orientation the person saw); only a JPEG, MPO (frame 0) or PNG, bomb-checked."""
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as im0:
            if im0.format not in ("JPEG", "MPO", "PNG"):  # an MPO is a JPEG with a second picture (a phone's depth or gain map): frame 0 is read, the rest never copied
                raise ValueError("only a JPEG or PNG photo is blurred (a HEIC or other format is not admitted)")
            return _upright(Image, im0, im0.convert("RGB"))  # the orientation the person saw when marking; the pixels are then all there is


def _read(src, Image):
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    if os.path.getsize(src) > MAX_BYTES:
        raise ValueError(f"the photo is over {MAX_BYTES // 1048576} MB and is not blurred")
    with open(src, "rb") as f:
        data = f.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"the photo is over {MAX_BYTES // 1048576} MB and is not blurred")
    return data


def blur(src, dst, boxes, shown=None):
    """Write the blurred copy of `src` to `dst` (a .jpg path); -> {"width", "height", "areas", "source_sha256"}. `boxes` as read_boxes returns them;
    `shown`: (width, height) the browser showed the photo at, checked against the upright size. The bytes read are hashed once and decoded from
    memory, so the copy is of exactly the bytes whose sha256 is returned."""
    Image, ImageStat = _pillow()
    data = _read(src, Image)
    im = _decode(Image, data)
    W, H = im.size
    if shown and abs(shown[0] / shown[1] - W / H) > SHOWN_TOLERANCE * (W / H):
        raise ValueError(f"the photo is {W}x{H} turned upright but the marker showed {shown[0]}x{shown[1]} - the boxes would land in the wrong place; reload and mark again")
    for x, y, w, h in boxes:
        x0, y0 = max(0, int(x * W)), max(0, int(y * H))
        x1, y1 = min(W, max(x0 + 1, math.ceil((x + w) * W))), min(H, max(y0 + 1, math.ceil((y + h) * H)))
        box = (x0, y0, x1, y1)
        mean = tuple(int(round(v)) for v in ImageStat.Stat(im.crop(box)).mean[:3])
        im.paste(mean, box)  # a solid fill: nothing of the area survives
    if max(W, H) > LONG_SIDE:
        k = LONG_SIDE / max(W, H)
        im = im.resize((max(1, round(W * k)), max(1, round(H * k))), Image.LANCZOS)
    clean = Image.frombytes("RGB", im.size, im.tobytes())  # pixels only: no info dict, so no EXIF, XMP, ICC or thumbnail can ride along
    tmp = f"{dst}.part"
    try:
        clean.save(tmp, "JPEG", quality=85, optimize=True)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return {"width": clean.size[0], "height": clean.size[1], "areas": len(boxes), "source_sha256": hashlib.sha256(data).hexdigest()}


def yunet_path():
    """Where the founder-approved model lives: %USERPROFILE%/SentinelData/models-ma7 (never in the repo)."""
    return os.path.join(os.environ.get("USERPROFILE") or os.path.expanduser("~"), "SentinelData", "models-ma7", YUNET_FILE)


def _yunet_session(model, make_session=None):
    """An onnxruntime session on the model bytes after their sha256 matched. ValueError in words if the file is missing or is not the approved one."""
    if not os.path.isfile(model):
        raise ValueError(f"the face detector is not set up on this PC (YuNet 2023mar model not found) - nothing was proposed; mark the faces by hand")
    if os.path.getsize(model) > YUNET_MAX_BYTES:
        raise ValueError("the YuNet file is not the approved one (too big) - nothing was proposed; mark the faces by hand")
    with open(model, "rb") as f:
        data = f.read()
    if hashlib.sha256(data).hexdigest() != YUNET_SHA:
        raise ValueError("the YuNet file is not the approved 2023mar (sha256 differs) - not used; nothing was proposed; mark the faces by hand")
    if make_session:
        return make_session(data)
    got = importlib.metadata.version("onnxruntime")
    if got != ONNXRUNTIME:
        raise RuntimeError(f"sentinel-blur {VERSION} is built for onnxruntime {ONNXRUNTIME} (this PC has {got}) - a new onnxruntime is a new licence read")
    import onnxruntime  # noqa: E402 (after the pin)
    so = onnxruntime.SessionOptions()
    so.log_severity_level = 3
    return onnxruntime.InferenceSession(data, so, providers=["CPUExecutionProvider"])


def _nms(b, s, thr):
    """Indices kept by greedy non-maximum suppression; b: N x 4 (x0, y0, x1, y1), s: N scores."""
    import numpy as np
    keep, order = [], np.argsort(-s)
    while len(order):
        i = order[0]
        keep.append(int(i))
        xx0, yy0 = np.maximum(b[i, 0], b[order[1:], 0]), np.maximum(b[i, 1], b[order[1:], 1])
        xx1, yy1 = np.minimum(b[i, 2], b[order[1:], 2]), np.minimum(b[i, 3], b[order[1:], 3])
        inter = np.clip(xx1 - xx0, 0, None) * np.clip(yy1 - yy0, 0, None)
        area = lambda q: (q[..., 2] - q[..., 0]) * (q[..., 3] - q[..., 1])  # noqa: E731
        order = order[1:][inter / (area(b[i]) + area(b[order[1:]]) - inter + 1e-9) <= thr]
    return keep


def decode_yunet(outs, scale, W, H):
    """YuNet's 12 output tensors (cls, obj, bbox, kps at strides 8, 16, 32) -> [{x, y, w, h, score}] as fractions of the W x H photo, padded and
    kept inside it. `scale`: letterbox factor (640 / long side). Pure numpy."""
    import numpy as np
    cls, obj, bbox = outs[0:3], outs[3:6], outs[6:9]
    boxes, scores = [], []
    for k, stride in enumerate((8, 16, 32)):
        n = YUNET_SIZE // stride
        c = np.clip(np.asarray(cls[k], dtype=np.float32).reshape(-1), 0, 1)
        o = np.clip(np.asarray(obj[k], dtype=np.float32).reshape(-1), 0, 1)
        bb = np.asarray(bbox[k], dtype=np.float32).reshape(-1, 4)
        sc = np.sqrt(c * o)
        idx = np.nonzero(sc >= YUNET_SCORE)[0]
        if not len(idx):
            continue
        cx, cy = (idx % n + bb[idx, 0]) * stride, (idx // n + bb[idx, 1]) * stride
        w, h = np.exp(bb[idx, 2]) * stride, np.exp(bb[idx, 3]) * stride
        boxes.append(np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1))
        scores.append(sc[idx])
    if not boxes:
        return []
    b, s = np.concatenate(boxes), np.concatenate(scores)
    out = []
    for i in _nms(b, s, YUNET_NMS)[:MAX_BOXES]:
        x0, y0, x1, y1 = b[i] / scale  # back to the photo's pixels
        pw, ph = (x1 - x0) * YUNET_PAD, (y1 - y0) * YUNET_PAD
        x0, y0, x1, y1 = max(0.0, x0 - pw), max(0.0, y0 - ph), min(float(W), x1 + pw), min(float(H), y1 + ph)
        if x1 - x0 > 0 and y1 - y0 > 0:
            out.append({"x": round(x0 / W, 5), "y": round(y0 / H, 5), "w": round((x1 - x0) / W, 5), "h": round((y1 - y0) / H, 5), "score": round(float(s[i]), 3)})
    return out


def detect(src, model=None, make_session=None):
    """MA-7-16: propose face boxes for the photo `src`; -> {"width", "height", "faces": [{x, y, w, h, score}], "source_sha256", "method"}. Proposals only:
    nothing is blurred or written, and a person confirms the boxes, removes wrong ones and adds the number plates. The photo is the same upright
    RGB the blur step uses, so the boxes land where the marker shows them. `make_session(model_bytes)` is the test seam (CI has no model)."""
    import numpy as np
    Image, _ = _pillow()
    sess = _yunet_session(model or yunet_path(), make_session)
    data = _read(src, Image)
    im = _decode(Image, data)
    W, H = im.size
    k = YUNET_SIZE / max(W, H)
    small = im.resize((max(1, round(W * k)), max(1, round(H * k))), Image.BILINEAR)
    canvas = np.zeros((YUNET_SIZE, YUNET_SIZE, 3), dtype=np.float32)  # letterbox: top-left, black padding
    a = np.asarray(small, dtype=np.float32)[:, :, ::-1]  # BGR, 0-255, no normalisation (YuNet's input)
    canvas[:a.shape[0], :a.shape[1]] = a
    outs = sess.run(None, {"input": np.ascontiguousarray(canvas.transpose(2, 0, 1)[None])})
    return {"width": W, "height": H, "faces": decode_yunet(outs, k, W, H), "source_sha256": hashlib.sha256(data).hexdigest(), "method": METHOD}


def main(argv):
    try:
        if len(argv) == 3 and argv[1] == "--detect":
            print(json.dumps({"ok": True, **detect(argv[2]), "version": VERSION, "tools": tools(True)}))
            return 0
        detected = argv[-1] == "--detected"  # MA-7-16: the boxes began as YuNet's proposals
        if detected:
            argv = argv[:-1]
        if len(argv) not in (4, 5):
            raise ValueError("usage: blur.py <source> <copy.jpg> <boxes json> [<shown width>x<shown height>] [--detected] | blur.py --detect <source>")
        shown = None
        if len(argv) == 5:
            try:
                shown = tuple(int(v) for v in argv[4].split("x"))
                assert len(shown) == 2 and min(shown) > 0
            except (ValueError, AssertionError):
                raise ValueError("the shown size must be <width>x<height> in pixels")
        r = blur(argv[1], argv[2], read_boxes(json.loads(argv[3])), shown)
        print(json.dumps({"ok": True, **r, "version": VERSION, "tools": tools(detected)}))
        return 0
    except Exception as e:  # the bridge turns this into one sentence; no path or pixel is echoed
        msg = f"{type(e).__name__}: {e}"
        for p in argv[1:3]:  # (--detect: argv[2] is the photo)
            msg = msg.replace(p, "<file>")
        print(json.dumps({"ok": False, "error": msg[:160]}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
