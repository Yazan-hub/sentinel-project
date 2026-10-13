"""sentinel-blur 0.1.0 (MA-7-7): one photo in, one blurred copy out. A one-shot script the bridge runs (not a service): no port, no network,
no file but the two paths it is given.

Each person-marked box is FILLED with its own mean colour (irreversible: nothing of the area is kept, unlike a Gaussian or a pixelate that
can be partly undone), the long side is cut to 2048, and the copy is built from the pixels alone, so no EXIF, XMP, ICC profile or thumbnail
is carried (the camera's make, time and GPS stay in the original only). Pillow is the installed 12.3.0 (MIT-CMU; the founder OK'd it
2026-10-13), version-pinned; pillow_heif (LGPL libheif) is blocked before PIL is imported, and a HEIC is not admitted.

    python blur.py <source.jpg> <copy.jpg> '<[{"x":0.1,"y":0.2,"w":0.05,"h":0.07}, ...]>' [<shown width>x<shown height>]

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


def tools():
    """sentinel-blur, Pillow (licence from its own metadata) and what Pillow's wheel carries: the evidence:blurred row's tools[]."""
    md = importlib.metadata.metadata("pillow")
    out = [{"name": "sentinel-blur", "version": VERSION, "licence": "LicenseRef-Sentinel"},
           {"name": "pillow", "version": md["Version"], "licence": md.get("License-Expression") or md.get("License") or "not declared"}]
    if md["Version"] == PILLOW:
        out += [{"name": f"{n} (in pillow)", "version": v, "licence": lic} for n, v, lic in INSIDE]
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


def blur(src, dst, boxes, shown=None):
    """Write the blurred copy of `src` to `dst` (a .jpg path); -> {"width", "height", "areas", "source_sha256"}. `boxes` as read_boxes returns them;
    `shown`: (width, height) the browser showed the photo at, checked against the upright size. The bytes read are hashed once and decoded from
    memory, so the copy is of exactly the bytes whose sha256 is returned."""
    Image, ImageStat = _pillow()
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    if os.path.getsize(src) > MAX_BYTES:
        raise ValueError(f"the photo is over {MAX_BYTES // 1048576} MB and is not blurred")
    with open(src, "rb") as f:
        data = f.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"the photo is over {MAX_BYTES // 1048576} MB and is not blurred")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as im0:
            if im0.format not in ("JPEG", "MPO", "PNG"):  # an MPO is a JPEG with a second picture (a phone's depth or gain map): frame 0 is read, the rest never copied
                raise ValueError("only a JPEG or PNG photo is blurred (a HEIC or other format is not admitted)")
            im = _upright(Image, im0, im0.convert("RGB"))  # the orientation the person saw when marking; the pixels are then all there is
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


def main(argv):
    try:
        if len(argv) not in (4, 5):
            raise ValueError("usage: blur.py <source> <copy.jpg> <boxes json> [<shown width>x<shown height>]")
        shown = None
        if len(argv) == 5:
            try:
                shown = tuple(int(v) for v in argv[4].split("x"))
                assert len(shown) == 2 and min(shown) > 0
            except (ValueError, AssertionError):
                raise ValueError("the shown size must be <width>x<height> in pixels")
        r = blur(argv[1], argv[2], read_boxes(json.loads(argv[3])), shown)
        print(json.dumps({"ok": True, **r, "version": VERSION, "tools": tools()}))
        return 0
    except Exception as e:  # the bridge turns this into one sentence; no path or pixel is echoed
        msg = f"{type(e).__name__}: {e}"
        for p in argv[1:3]:
            msg = msg.replace(p, "<file>")
        print(json.dumps({"ok": False, "error": msg[:160]}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
