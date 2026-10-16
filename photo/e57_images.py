"""sentinel-e57-images 0.1.0 (MA-7-18): an E57's panoramas (images2D) out as files, each with its scanner pose. A one-shot script the bridge runs:
no port, no network, no library (stdlib only, so the bridge's SENTINEL_PYTHON runs it), no file but the E57 it reads and the folder it writes.

The XML section is read with struct (each 1024-byte page's 4-byte checksum skipped) and refused, as survey/e57.py refuses it, unless it is plain
UTF-8 declaring no DTD, entity or schema location; only then is it parsed. Each image's blob is read from its binary section the same way.
survey 0.6.0 is untouched.

    python e57_images.py <scan.e57> <out folder>     (the folder must be empty or absent; writes 01.jpg, 02.png, ...)
    python e57_images.py --self-check

Prints one JSON line: {"ok": true, "version", "images": [{file, guid, name, scan_guid, representation, width, height, pixel_width, pixel_height, rotation [w,x,y,z],
translation [x,y,z] (metres, the E57's frame), sha256}], "tools"} or {"ok": false, "error"} (exit 2). No path is echoed.
"""
import hashlib
import json
import math
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET

VERSION = "0.1.0"
PAGE, DATA = 1024, 1020     # the standard's page: 1 020 bytes of data, then a 4-byte checksum
MAX_XML = 64 << 20
MAX_IMAGES = 200
MAX_BLOB = 256 << 20        # one panorama; a 20k x 10k JPEG stays far under
KINDS = (("jpegImage", "jpg", b"\xff\xd8\xff"), ("pngImage", "png", b"\x89PNG\r\n\x1a\n"))
REPS = ("sphericalRepresentation", "pinholeRepresentation", "cylindricalRepresentation")


class Refused(Exception):
    pass


def to_logical(p):
    return p // PAGE * DATA + p % PAGE


def to_physical(lo):
    return lo // DATA * PAGE + lo % DATA


def read_logical(f, size, at, length):
    """`length` bytes of logical data starting at physical offset `at`, each page's checksum skipped."""
    if at % PAGE >= DATA or to_physical(to_logical(at) + length) > size + 4:
        raise Refused(f"a section at byte {at:,} lies outside the file or on a page checksum (damaged or truncated)")
    f.seek(at - at % PAGE)
    skip, parts, got = at % PAGE, [], 0
    while got < length:
        p = f.read(PAGE)
        if len(p) < PAGE:
            raise Refused("the file is shorter than its sections say (truncated)")
        parts.append(p[skip:DATA])
        got += DATA - skip
        skip = 0
    return b"".join(parts)[:length]


def read_xml(f, size):
    h = f.read(48)
    if len(h) < 48 or h[:8] != b"ASTM-E57":
        raise Refused("not an E57 file (no ASTM-E57 signature)")
    at, length, page = struct.unpack_from("<QQQ", h, 24)
    if page != PAGE:
        raise Refused(f"its header is not the standard's ({page}-byte pages) — not read")
    if length > MAX_XML:
        raise Refused(f"its XML section is {length:,} bytes — over {MAX_XML:,}; not read")
    x = read_logical(f, size, at, length).removeprefix(b"\xef\xbb\xbf").lstrip()
    if (not x.startswith((b"<?xml", b"<e57Root")) or re.match(rb'<\?xml[^>]*encoding\s*=\s*["\'](?!utf-8["\'])', x, re.I)
            or re.search(rb"<!DOCTYPE|<!ENTITY|schemalocation", x, re.I)):
        raise Refused("its XML is not plain UTF-8, or it declares a DTD, an entity or a schema location — not read")
    return ET.fromstring(x)


def _child(node, name):
    return next((c for c in node if c.tag.rsplit("}", 1)[-1] == name), None) if node is not None else None


def _num(node, name, default=None):
    c = _child(node, name)
    return default if c is None or c.text is None else float(c.text)


def _text(node, name):
    c = _child(node, name)
    return None if c is None else (c.text or "").strip()[:100]


def extract(src, out):
    if os.path.isdir(out) and os.listdir(out):
        raise Refused("the panoramas folder already holds files — these panoramas were taken out before")
    size = os.path.getsize(src)
    with open(src, "rb") as f:
        root = read_xml(f, size)
        vec = _child(root, "images2D")
        kids = [] if vec is None else [c for c in vec if c.tag.rsplit("}", 1)[-1] == "vectorChild"]
        if not kids:
            raise Refused("this E57 holds no panoramas (no images2D)")
        if len(kids) > MAX_IMAGES:
            raise Refused(f"this E57 holds {len(kids)} images — over {MAX_IMAGES}; not read")
        found = []
        for k, im in enumerate(kids, 1):
            rep_name, rep = next(((r, _child(im, r)) for r in REPS if _child(im, r) is not None), (None, None))
            blob, ext, magic = next(((_child(rep, b), e, m) for b, e, m in KINDS if _child(rep, b) is not None), (None, None, None))
            if blob is None:
                continue  # a visual reference image or a mask only: no representation to place it by
            pose = _child(im, "pose")
            q = [_num(_child(pose, "rotation"), c, d) for c, d in zip("wxyz", (1.0, 0.0, 0.0, 0.0))]
            t = [_num(_child(pose, "translation"), c, 0.0) for c in "xyz"]
            nq = math.sqrt(sum(v * v for v in q))
            if pose is None or not all(math.isfinite(v) for v in q + t) or not nq:
                raise Refused(f"image {k} of {len(kids)} has no scanner pose (a rotation and a translation) — not read")
            at, length = int(blob.get("fileOffset", -1)), int(blob.get("length", -1))
            if at < 0 or not 0 < length <= MAX_BLOB:
                raise Refused(f"image {k} of {len(kids)}: its blob is {length:,} bytes at {at:,} — not read")
            head = read_logical(f, size, at, 16)  # the blob section's header: sectionId 0, 7 reserved, its logical length
            if head[0] != 0 or struct.unpack_from("<Q", head, 8)[0] < 16 + length:
                raise Refused(f"image {k} of {len(kids)}: its blob section is not one (damaged)")
            data = read_logical(f, size, to_physical(to_logical(at) + 16), length)
            if not data.startswith(magic):
                raise Refused(f"image {k} of {len(kids)}: its {ext.upper()} bytes do not start as one (damaged)")
            found.append((data, ext, {"guid": _text(im, "guid"), "name": _text(im, "name"), "scan_guid": _text(im, "associatedData3DGuid"),
                                      "representation": rep_name, "width": int(_num(rep, "imageWidth", 0)), "height": int(_num(rep, "imageHeight", 0)),
                                      "pixel_width": _num(rep, "pixelWidth"), "pixel_height": _num(rep, "pixelHeight"),  # radians (spherical); MA-7-17 panorama_views.cut needs them
                                      "rotation": [v / nq for v in q], "translation": t, "sha256": hashlib.sha256(data).hexdigest()}))
    if not found:
        raise Refused("this E57's images carry no JPEG or PNG panorama")
    os.makedirs(out, exist_ok=True)  # written only once every image read: a refusal leaves no half folder
    images = []
    for n, (data, ext, rec) in enumerate(found, 1):
        name = f"{n:02d}.{ext}"
        with open(os.path.join(out, name), "xb") as w:
            w.write(data)
        images.append({"file": name, **rec})
    return images


def tools():
    return [{"name": "sentinel-e57-images", "version": VERSION, "licence": "LicenseRef-Sentinel"},
            {"name": "python", "version": sys.version.split()[0], "licence": "PSF-2.0"}]


def _self_check():
    """A small E57 built here: one posed spherical JPEG whose blob header straddles a page checksum; it comes out byte-equal with its pose;
    a second run and a DTD are refused."""
    import tempfile
    jpg = b"\xff\xd8\xff\xe0" + bytes(range(256)) * 6 + b"\xff\xd9"
    blob_at = 2040  # physical: page 1, 4 bytes before its checksum
    xml = (f'<?xml version="1.0" encoding="UTF-8"?><e57Root type="Structure" xmlns="http://www.astm.org/COMMIT/E57/2010-e57-v1.0">'
           f'<images2D type="Vector"><vectorChild type="Structure"><guid type="String">g1</guid><name type="String">sp1</name>'
           f'<pose type="Structure"><rotation type="Structure"><w type="Float">2</w><z type="Float">0</z></rotation>'
           f'<translation type="Structure"><x type="Float">1.5</x><y type="Float">-2</y><z type="Float">0.25</z></translation></pose>'
           f'<sphericalRepresentation type="Structure"><jpegImage type="Blob" fileOffset="{blob_at}" length="{len(jpg)}"/>'
           f'<imageWidth type="Integer">40</imageWidth><imageHeight type="Integer">20</imageHeight></sphericalRepresentation>'
           f'</vectorChild></images2D></e57Root>').encode()
    lg = bytearray(DATA * 4)
    lg[0:48] = b"ASTM-E57" + struct.pack("<IIQQQQ", 1, 0, 0, 48, len(xml), PAGE)
    lg[48:48 + len(xml)] = xml
    b = to_logical(blob_at)
    lg[b:b + 16 + len(jpg)] = struct.pack("<B7xQ", 0, 16 + len(jpg)) + jpg
    phys = b"".join(bytes(lg[i:i + DATA]) + b"\0\0\0\0" for i in range(0, len(lg), DATA))
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, "t.e57"), os.path.join(d, "pano")
        with open(src, "wb") as w:
            w.write(phys)
        ims = extract(src, out)
        with open(os.path.join(out, "01.jpg"), "rb") as r:
            assert len(ims) == 1 and r.read() == jpg, ims
        assert ims[0]["rotation"] == [1.0, 0.0, 0.0, 0.0] and ims[0]["translation"] == [1.5, -2.0, 0.25] and ims[0]["width"] == 40, ims
        for bad_src, bad_out in ((src, out), (None, os.path.join(d, "p2"))):
            if bad_src is None:
                with open(src, "wb") as w:
                    w.write(phys.replace(b"<e57Root", b"<!DOCTYPE x><e57Root", 1))
            try:
                extract(src, bad_out)
                raise AssertionError("must refuse")
            except Refused:
                pass
        assert not os.path.exists(os.path.join(d, "p2"))
    return "ok"


def main(argv):
    try:
        if argv[1:] == ["--self-check"]:
            print(json.dumps({"ok": True, "self_check": _self_check()}))
            return 0
        if len(argv) != 3:
            raise Refused("usage: e57_images.py <scan.e57> <out folder>")
        print(json.dumps({"ok": True, "version": VERSION, "images": extract(argv[1], argv[2]), "tools": tools()}))
        return 0
    except (Refused, OSError, ET.ParseError, ValueError) as e:
        print(json.dumps({"ok": False, "error": str(e)[:300]}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
