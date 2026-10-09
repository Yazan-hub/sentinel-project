# MA-4c — sentinel-survey's scan reader (design §6.9; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md): LAS 1.2 to 1.4, any
# point format 0-10 (a record's first 12 bytes are X, Y, Z in all of them), numpy and struct only for a plain LAS.
# MA-4g (plan docs/superpowers/plans/2026-10-09-ma4g-e57-laz.md): the bytes decide the reader, never the extension — LASF with the LASzip
# record is a LAZ, read with laspy and lazrs; ASTM-E57 is an E57, read with pye57 (e57.py). Each library is imported only inside the read
# that needs it (lib), so a plain LAS stays numpy-only and a PC without MA-4g's wheels refuses a LAZ or an E57 in words. The CRS is read
# from the VLRs and EVLRs with struct (laspy's parse_crs needs pyproj, which is not installed) and recorded, never applied: a CRS in
# degrees or not in metres is refused; a scan with none is taken as metres in its own frame ("metres assumed").
import contextlib
import hashlib
import os
import re
import struct
import sys

import numpy as np

# Records per read. ~200 MB for a plain LAS whatever the file's size; a LAZ's chunk peaks near 0.5-0.8 GB (laspy's record bytes) and an
# E57's near 0.8 GB (its buffers and temporaries) — MA-4h measures both on Kladno.
CHUNK = 8_000_000
# ponytail: at most 1 000 VLRs (and 1 000 EVLRs) are walked — a file with more reads as if it had none past them (no CRS: metres
# assumed; no LASzip record: refused, in words); a LAZ declaring more VLRs is refused before laspy opens it (laspy walks every VLR it is
# told of; its EVLRs it is told not to read); raise it when a real file needs more.
MAX_VLRS = 1000
MAX_RECORD = 1 << 16  # bytes: a CRS record (a WKT is a few KB), an E57's coordinateMetadata or a LASzip record longer than this is refused
LASZIP, WKT, GEOKEYS = (b"laszip encoded", 22204), (b"LASF_Projection", 2112), (b"LASF_Projection", 34735)
# MA-4g: the wheels this reader was pinned and tested with (survey/requirements-ma4g.txt), in a private folder (pip --target), never the
# shared user site; any other version found is refused in words, so the reader never changes under the same VERSION.
PINS = {"laspy": "2.7.0", "lazrs": "0.8.2", "pye57": "0.4.19", "pyquaternion": "0.9.9"}
LIB = os.path.join(os.environ["APPDATA"], "Sentinel", "survey-lib") if os.environ.get("APPDATA") else ""  # never a relative path
GEOGRAPHIC = ("its CRS is geographic or geocentric (degrees, or x, y, z from the Earth's centre) — sentinel-survey reads a projected CRS "
              "or a local frame in metres; reproject the scan first")
METRES = "sentinel-survey reads metres; convert the scan to metres first"
UNITS = {9001: "metre", 9002: "foot", 9003: "US survey foot"}  # EPSG unit codes, as GeoTIFF keys carry them: a closed table, never file text
UNIT = re.compile(r'\b(?:LENGTH)?UNIT\[\s*"([^"]*)"\s*,\s*(\d*\.?\d+(?:[eE][-+]?\d+)?)')
ANGULAR = re.compile(r"degree|radian|grad|arc", re.I)
EPSG = re.compile(r'\b(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d+)')


class Refused(Exception):
    """A file this version does not read (its words go in the job's refused[{id, reason}]), or a job it cannot measure (its error)."""


def add_lib():
    """MA-4g: the pinned wheels' private folder first on sys.path, once — so the shared user site never decides the reader."""
    if LIB and os.path.isdir(LIB) and LIB not in sys.path:
        sys.path.insert(0, LIB)


def lib(name):
    """MA-4g: laspy (with lazrs) or pye57 (with pyquaternion), at their PINS, imported here only — or Refused in words when one is at
    another version or does not import under this Python. A missing wheel's PackageNotFoundError is an ImportError."""
    import importlib.metadata
    add_lib()
    try:
        for n in ("laspy", "lazrs") if name == "laspy" else ("pye57", "pyquaternion"):
            if (v := importlib.metadata.version(n)) != PINS[n]:
                raise Refused(f"{n} {v} is installed — sentinel-survey reads with {n} {PINS[n]}; install the pinned wheels offline, as "
                              "survey/requirements-ma4g.txt says")
        if name == "laspy":
            sys.modules.setdefault("requests", None)  # laspy's COPC reader imports requests when it can: this service holds no HTTP client
            import laspy
            if laspy.LazBackend.Lazrs not in laspy.LazBackend.detect_available():  # lazrs itself, never another backend
                raise ImportError("lazrs")
            return laspy
        import pye57
        return pye57
    except ImportError:
        what = "a LAZ is read with laspy and lazrs" if name == "laspy" else "an E57 is read with pye57"
        raise Refused(f"{what} — not importable under this Python (not installed, or a DLL it needs is missing); install the four pinned "
                      "wheels offline, as survey/requirements-ma4g.txt says") from None


@contextlib.contextmanager
def damaged(what):
    """MA-4g: a library's failure in words — its type only: its message can name the path, and the words reach job.json, the Funnel and
    the ledger. BaseException: lazrs reports a Rust panic as pyo3's PanicException, which is not an Exception. MemoryError is not damage:
    it goes on to service.run, whose words name its type."""
    try:
        yield
    except (Refused, KeyboardInterrupt, SystemExit, MemoryError):
        raise
    except BaseException as e:
        raise Refused(f"the {what} could not be read ({type(e).__name__}) — the file may be damaged") from None


def parse_header(h, size):
    """The fields the reader needs, from a header's first bytes `h` (up to 375) of a file of `size` bytes; Refused in words otherwise.
    MA-4g: a point format with bit 7 set and bit 6 clear (laspy's test) is a LAZ — `laz`: its records are compressed, so no length check."""
    if len(h) < 227 or h[:4] != b"LASF":
        raise Refused("not a LAS, LAZ or E57 file (it begins neither LASF nor ASTM-E57)")
    major, minor = h[24], h[25]
    if major != 1 or minor not in (2, 3, 4):
        raise Refused(f"LAS {major}.{minor} is not read — sentinel-survey reads LAS 1.2 to 1.4")
    header_size, offset = struct.unpack_from("<HI", h, 94)
    fmt, rec_len, count = struct.unpack_from("<BHI", h, 104)
    laz = fmt & 0xC0 == 0x80
    if laz:
        fmt &= 0x3F
    if fmt > 10 or rec_len < 12:
        raise Refused(f"point format {fmt} with {rec_len}-byte records is not a LAS point record")
    if minor == 4 and header_size >= 375 and len(h) >= 255:
        count = struct.unpack_from("<Q", h, 247)[0] or count
    if count == 0:
        raise Refused("the file holds no points")
    if not laz and offset + count * rec_len > size:
        raise Refused("the file is shorter than its header says (truncated)")
    return {"count": count, "offset": offset, "rec_len": rec_len, "laz": laz,
            "scale": struct.unpack_from("<3d", h, 131), "origin": struct.unpack_from("<3d", h, 155)}


def read_header(path):
    """A scan's header — a LAS or a LAZ (its LASzip record found, laspy importable) with its CRS, or an E57's (e57.py); Refused in words."""
    with open(path, "rb") as f:
        h = f.read(375)
    if h[:8] == b"ASTM-E57":
        import e57  # MA-4g: Sentinel's own E57 reader (it imports this module for Refused, CHUNK, lib, damaged and wkt_crs)
        return e57.read_header(path)
    head = parse_header(h, os.path.getsize(path))
    with open(path, "rb") as f:
        found = records(f, h)
    if head["laz"]:
        if struct.unpack_from("<I", h, 100)[0] > MAX_VLRS:
            raise Refused(f"its header declares more than {MAX_VLRS:,} VLRs — not read as a LAZ")
        if LASZIP not in found:
            raise Refused("its points are marked compressed (LAZ) but no LASzip record was found — it is not read as a LAZ; export it again")
        lib("laspy")  # refused here, per item, when laspy or lazrs does not import — never a failed job
    return {**head, "format": "laz" if head["laz"] else "las", "crs": crs_of(found)}


def records(f, h):
    """MA-4g: {(user_id, record_id): bytes} of the records this reader uses — the CRS (WKT, GeoTIFF keys) and the LASzip record — from the
    VLRs between the header and the points and a LAS 1.4's EVLRs after them, read with struct (they are never compressed)."""
    found = {}

    def walk(at, n, size, end):  # size: a VLR's header (54 bytes, a u16 length) or an EVLR's (60, a u64 length)
        for _ in range(min(n, MAX_VLRS)):
            if at + size > end:
                return
            f.seek(at)
            v = f.read(size)
            if len(v) < size:
                return
            key = (v[2:18].rstrip(b"\0 "), struct.unpack_from("<H", v, 18)[0])
            length = struct.unpack_from("<H" if size == 54 else "<Q", v, 20)[0]
            if key in (LASZIP, WKT, GEOKEYS):
                if length > MAX_RECORD:
                    raise Refused(f"its {key[0].decode()} record {key[1]} is {length:,} bytes — over {MAX_RECORD:,}; not read")
                found[key] = f.read(length)
            at += size + length

    header_size, offset, n = struct.unpack_from("<HII", h, 94)
    walk(header_size, n, 54, offset)
    if h[25] == 4 and len(h) >= 247:
        at, n = struct.unpack_from("<QI", h, 235)
        if at:
            walk(at, n, 60, os.fstat(f.fileno()).st_size)  # bounded by the file: an offset of 2^63 is never sought
    return found


def crs_of(found):
    """MA-4g: the scan's CRS — {source, epsg, unit, sha256}, or None (none declared: metres assumed). The WKT wins over the GeoTIFF keys.
    No name: it is the file's free text, and a refusal's words reach the ledger.
    ponytail: a CRS in feet is refused, not converted — a factor per axis when an owner's scan in feet arrives."""
    if WKT in found:
        return wkt_crs(found[WKT].split(b"\0")[0].decode("utf-8", "replace"), "wkt")
    return geokeys_crs(found[GEOKEYS]) if GEOKEYS in found else None


def wkt_crs(w, source, check=True):
    """A CRS's text (WKT 1 or 2, or an E57's bare "EPSG:25833") → {source, epsg, unit, sha256}, or None when empty. With `check`, Refused
    when it is geographic or a length unit is not the metre (said by its factor, never its name), and `unit` is "metre" when a length unit
    says so (else None: not stated). The EPSG code is the outermost node's (bracket depth 1: never a datum's or a unit's).
    ponytail: square brackets only — WKT's round-bracket form reads as no unit and no code."""
    w = w.strip()
    if not w:
        return None
    unit = None
    if check:
        if (not re.search(r"\bPROJ(?:CS|CRS|ECTEDCRS)\[", w, re.I)
                and re.search(r"\b(?:GEOGCS|GEOCCS|GEOGCRS|GEODCRS|GEOGRAPHICCRS|GEODETICCRS)\[", w, re.I)):
            raise Refused(GEOGRAPHIC)
        for name, f in UNIT.findall(w):
            if ANGULAR.search(name):
                continue
            if abs(float(f) - 1) > 1e-9:
                raise Refused(f"its CRS's unit is {float(f):g} m — {METRES}")
            unit = "metre"
    bare = re.fullmatch(r"EPSG:(\d+)", w, re.I)
    epsg = int(bare[1]) if bare else next((int(m[1]) for m in EPSG.finditer(w) if w.count("[", 0, m.start()) - w.count("]", 0, m.start()) == 1), None)
    return {"source": source, "epsg": epsg, "unit": unit, "sha256": hashlib.sha256(w.encode()).hexdigest()}


def geokeys_crs(b):
    """GeoTIFF keys (LASF_Projection 34735: a u16 header, then [key, location, count, value] entries) → {source, epsg, unit, sha256};
    Refused when geographic or geocentric (key 1024 is 2 or 3; 2048 without 3072), or a linear unit (3076, vertical 4099) is not the metre.
    `unit` is "metre" only when 3076 says so: a code alone (3072) does not say its unit, and no pyproj looks it up here."""
    k = struct.unpack_from(f"<{len(b) // 2}H", b)
    n = k[3] if len(k) >= 4 else 0
    keys = {k[i]: k[i + 3] for i in range(4, min(4 + 4 * n, len(k) - 3), 4) if k[i + 1] == 0}  # location 0: the value is in the entry
    if keys.get(1024) in (2, 3) or (2048 in keys and 3072 not in keys):
        raise Refused(GEOGRAPHIC)
    for key, what in ((3076, ""), (4099, "vertical ")):
        if keys.get(key, 9001) != 9001:
            raise Refused(f"its CRS's {what}unit is {UNITS.get(keys[key], f'unit code {keys[key]}')} — {METRES}")
    epsg = keys.get(3072) if 1024 <= keys.get(3072, 0) <= 32766 else None
    return {"source": "geokeys", "epsg": epsg, "unit": "metre" if keys.get(3076) == 9001 else None, "sha256": hashlib.sha256(b).hexdigest()}


def _mm(cols, head):
    """Three columns of raw integer records → x, y, z in millimetres (N x 3 float64), each axis by its scale and offset."""
    return np.stack([(c.astype(np.float64) * s + o) * 1000.0 for c, s, o in zip(cols, head["scale"], head["origin"])], axis=1)


def read_points_mm(path, head, share=1.0, rng=None):
    """Every point's x, y, z in millimetres (N x 3 float64) — or, past the point cap, a seeded `share` of them (the same every run).
    Read CHUNK records at a time, so memory follows the points kept, never the file: the mask is drawn per chunk, and consecutive
    draws of one generator are the same stream however it is cut — the same points as one draw over the whole file.
    MA-4g: an E57 is e57.py's; a LAZ is decompressed by laspy and lazrs CHUNK points at a time — the same raw integers, scale and offset
    (this module's own header read) and the same stream, so a LAS and its LAZ give the same points."""
    if head.get("format") == "e57":
        import e57
        return e57.read_points_mm(path, head, share, rng)
    if head.get("laz"):
        return _laz_mm(path, head, share, rng)
    dt = np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": head["rec_len"]})
    rec = np.memmap(path, dtype=dt, mode="r", offset=head["offset"], shape=(head["count"],))
    try:
        parts = []
        for a in range(0, head["count"], CHUNK):
            part = rec[a:a + CHUNK]
            if share < 1.0:
                part = part[rng.random(len(part)) < share]  # fancy indexing copies the kept records
            parts.append(_mm([part["x"], part["y"], part["z"]], head))
            del part
        return np.concatenate(parts)
    finally:
        del rec  # Windows keeps a mapped file locked; nothing returned is a view of it (astype copies)


def _laz_mm(path, head, share, rng):
    laspy, parts, got = lib("laspy"), [], 0
    # the CRS is this module's (records): laspy reads no EVLR, and decompresses with lazrs only
    with damaged("LAZ"), laspy.open(path, read_evlrs=False, laz_backend=(laspy.LazBackend.LazrsParallel, laspy.LazBackend.Lazrs)) as r:
        for part in r.chunk_iterator(CHUNK):
            cols = [np.asarray(part.X), np.asarray(part.Y), np.asarray(part.Z)]
            got += len(cols[0])
            if share < 1.0:
                keep = rng.random(len(cols[0])) < share
                cols = [c[keep] for c in cols]
            parts.append(_mm(cols, head))
            del part, cols  # laspy's record bytes freed before the next chunk is allocated: one chunk alive at a time
    if got != head["count"]:  # laspy logs a short read and goes on: the count is checked here
        raise Refused("the file is shorter than its header says (truncated)")
    return np.concatenate(parts)
