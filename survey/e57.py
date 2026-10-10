# MA-4g — sentinel-survey's E57 reader (plan docs/superpowers/plans/2026-10-09-ma4g-e57-laz.md): every scan of the file through its own pose
# (rotation, translation) into the file's frame, metres by the standard → millimetres; read with pye57 (libE57Format) into buffers of
# las.CHUNK points, sampled from the same seeded stream as a LAS. Before each pye57 open its XML section is read with struct and refused
# unless it is plain UTF-8 declaring no DTD, entity or schema location (any case): the bundled Xerces-C parser has schema processing on and
# a WinSock net accessor, so it could fetch one, and this service makes no network call.
# ponytail: cartesian points only — pye57 cannot write a spherical E57 to pin a reader against (pye57.utils.convert_spherical_to_cartesian
# reads one when a real spherical scan arrives); a scan's name, images and grouping are not read.
import os
import re
import struct

import numpy as np

import las

XYZ = ["cartesianX", "cartesianY", "cartesianZ"]
STATE = "cartesianInvalidState"  # 0 valid; 1 a direction only; 2 none
PAGE = 1024                      # the standard's page: 1 020 bytes of data, then a 4-byte checksum
MAX_XML = 64 << 20               # bytes: an XML section longer than this is refused (thousands of scans stay far under)
UNSAFE = ("its XML is not plain UTF-8, or it declares a DTD, an entity or a schema location — an E57 whose parser could fetch a file "
          "is not read")


def xml_refusal(path):
    """Refused unless the E57's XML section — read with struct, each page's checksum skipped, no library — is plain UTF-8 that declares
    no DTD, entity or schema location."""
    with open(path, "rb") as f:
        h = f.read(48)
        if len(h) < 48:
            raise las.Refused("the file is shorter than an E57 header (truncated)")
        at, length, page = struct.unpack_from("<QQQ", h, 24)  # xmlPhysicalOffset, xmlLogicalLength, pageSize
        if page != PAGE or at % PAGE >= PAGE - 4:
            raise las.Refused(f"its header is not the standard's ({page}-byte pages, the XML at byte {at:,}) — not read")
        if length > MAX_XML:
            raise las.Refused(f"its XML section is {length:,} bytes — over {MAX_XML:,}; not read")
        if at + length > os.fstat(f.fileno()).st_size:  # before the seek: an offset of 2^63 is never sought
            raise las.Refused("the file is shorter than its header says (truncated)")
        f.seek(at - at % PAGE)
        skip, parts, got = at % PAGE, [], 0
        while got < length:
            p = f.read(PAGE)
            if len(p) < PAGE:
                raise las.Refused("the file is shorter than its header says (truncated)")
            parts.append(p[skip:PAGE - 4])
            got += PAGE - 4 - skip
            skip = 0
    x = b"".join(parts)[:length].removeprefix(b"\xef\xbb\xbf").lstrip()
    if (not x.startswith((b"<?xml", b"<e57Root")) or re.match(rb'<\?xml[^>]*encoding\s*=\s*["\'](?!utf-8["\'])', x, re.I)
            or re.search(rb"<!DOCTYPE|<!ENTITY|schemalocation", x, re.I)):  # any case: xsi:noNamespaceSchemaLocation has a capital S
        raise las.Refused(UNSAFE)


def fields_refusal(fields):
    """None when a scan's points are cartesian x, y, z; else why not, in words."""
    if all(f in fields for f in XYZ):
        return None
    if "sphericalRange" in fields:
        return "its points are spherical (range, azimuth, elevation) — sentinel-survey reads cartesian E57 points; export the scan as cartesian"
    return "its points carry no x, y, z"


def read_header(path):
    """An E57's header: {format: "e57", count, scans: [{points, posed, R, t, state}], crs} — the CRS its coordinateMetadata names, recorded
    only (an E57's points are metres by the standard), a geographic or geocentric one refused. Refused in words: an unsafe XML, no pye57,
    a scan not cartesian, a pose zero or not finite, no point, a damaged file (las.damaged: the library's type only)."""
    xml_refusal(path)
    pye57 = las.lib("pye57")
    from pyquaternion import Quaternion  # pye57's own dependency, at its pin (las.lib checked it)
    with las.damaged("E57"), pye57.E57(path) as e:
        scans = []
        for k in range(e.scan_count):
            s = e.get_header(k)
            why = fields_refusal(s.point_fields)
            if why:
                raise las.Refused(f"scan {k + 1} of {e.scan_count}: {why}")
            # the pose by name — scan_header.py reads it by child order, which the standard does not fix
            pose = s.node["pose"] if s.has_pose() else None
            has = lambda c: pose is not None and pose.isDefined(c)
            q = [pose["rotation"][c].value() for c in "wxyz"] if has("rotation") else [1.0, 0.0, 0.0, 0.0]
            t = [pose["translation"][c].value() for c in "xyz"] if has("translation") else [0.0, 0.0, 0.0]
            if not (np.isfinite(q).all() and np.isfinite(t).all() and np.linalg.norm(q)):
                raise las.Refused(f"scan {k + 1} of {e.scan_count}: its pose is not a rotation and a translation (zero or not finite) — not read")
            scans.append({"points": int(s.point_count), "posed": pose is not None, "R": Quaternion(q).rotation_matrix,
                          "t": np.asarray(t, float), "state": STATE in s.point_fields})
        meta = e.root["coordinateMetadata"].value() if e.root.isDefined("coordinateMetadata") else ""
        if len(meta) > las.MAX_RECORD:  # free text of any size: never handed to a regex unbounded
            raise las.Refused(f"its coordinateMetadata is {len(meta):,} characters — over {las.MAX_RECORD:,}; not read")
    count = sum(s["points"] for s in scans)
    if not count:
        raise las.Refused("the file holds no points")
    return {"format": "e57", "count": count, "scans": scans, "crs": las.wkt_crs(meta, "e57", check=False)}


def read_points_mm(path, head, share=1.0, rng=None):
    """Every valid point of every scan, in index order, in the file's frame (each scan's pose applied), in millimetres — or past the cap a
    seeded `share`: one draw per point read, valid or not, from the one stream (las.read_points_mm's rule), so the points kept do not depend
    on the buffer size. The pose is applied element-wise (no matrix product: the same bits whatever the buffer). The XML is checked again:
    this is a second open, and the file is hashed again only after it."""
    xml_refusal(path)
    pye57, parts = las.lib("pye57"), []
    with las.damaged("E57"), pye57.E57(path) as e:
        for k, s in enumerate(head["scans"]):
            if not s["points"]:  # libE57Format refuses a reader on a scan with no records: skip it, never the whole file
                continue
            fields = XYZ + ([STATE] if s["state"] else [])
            data, bufs = e.make_buffers(fields, min(las.CHUNK, s["points"]))
            r, got, R, t = e.get_header(k).points.reader(bufs), 0, s["R"], s["t"]
            try:
                while got < s["points"]:
                    n = r.read()  # the records this call filled (libE57's CompressedVectorReader::read)
                    if not n:
                        break
                    keep = rng.random(n) < share if share < 1.0 else np.ones(n, bool)
                    if s["state"]:
                        keep &= data[STATE][:n] == 0
                    for c in XYZ:  # a NaN or an infinity is no point (pye57 cannot write one: reasoned, not pinned)
                        keep &= np.isfinite(data[c][:n])
                    x, y, z = (data[c][:n][keep] for c in XYZ)
                    parts.append(np.stack([R[i, 0] * x + R[i, 1] * y + R[i, 2] * z + t[i] for i in range(3)], axis=1) * 1000.0)
                    got += n
            finally:
                r.close()
            if got != s["points"]:
                raise las.Refused("the file is shorter than its header says (truncated)")
    return np.concatenate(parts)
