# MA-4c — sentinel-survey 0.1's LAS reader (design §6.9; plan docs/superpowers/plans/2026-10-08-ma4c-sentinel-survey.md): plain,
# uncompressed LAS 1.2 to 1.4, any point format 0-10 (a record's first 12 bytes are X, Y, Z in all of them), numpy and struct only.
# ponytail: no VLR is read, so no CRS — the coordinates are taken as metres in the scan's own frame (a LAS in US survey feet would read
# 3.28x too large; the receipt says "metres assumed"). The CRS (WKT or GeoTIFF keys) is read with laspy from MA-4g, with E57 and LAZ.
import os
import struct

import numpy as np

CHUNK = 8_000_000  # records per read: the sampling mask and the copies stay ~200 MB whatever the file's size


class Refused(Exception):
    """A file this version does not read (its words go in the job's refused[{id, reason}]), or a job it cannot measure (its error)."""


def parse_header(h, size):
    """The fields the reader needs, from a header's first bytes `h` (up to 375) of a file of `size` bytes; Refused in words otherwise."""
    if len(h) < 227 or h[:4] != b"LASF":
        raise Refused("not a LAS file (it does not begin LASF)")
    major, minor = h[24], h[25]
    if major != 1 or minor not in (2, 3, 4):
        raise Refused(f"LAS {major}.{minor} is not read — sentinel-survey 0.1 reads LAS 1.2 to 1.4")
    header_size, offset = struct.unpack_from("<HI", h, 94)
    fmt, rec_len, count = struct.unpack_from("<BHI", h, 104)
    if fmt & 0xC0:
        raise Refused("its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g")
    if fmt > 10 or rec_len < 12:
        raise Refused(f"point format {fmt} with {rec_len}-byte records is not a LAS point record")
    if minor == 4 and header_size >= 375 and len(h) >= 255:
        count = struct.unpack_from("<Q", h, 247)[0] or count
    if count == 0:
        raise Refused("the file holds no points")
    if offset + count * rec_len > size:
        raise Refused("the file is shorter than its header says (truncated)")
    return {"count": count, "offset": offset, "rec_len": rec_len,
            "scale": struct.unpack_from("<3d", h, 131), "origin": struct.unpack_from("<3d", h, 155)}


def read_header(path):
    with open(path, "rb") as f:
        return parse_header(f.read(375), os.path.getsize(path))


def read_points_mm(path, head, share=1.0, rng=None):
    """Every point's x, y, z in millimetres (N x 3 float64) — or, past the point cap, a seeded `share` of them (the same every run).
    Read CHUNK records at a time, so memory follows the points kept, never the file: the mask is drawn per chunk, and consecutive
    draws of one generator are the same stream however it is cut — the same points as one draw over the whole file."""
    dt = np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": head["rec_len"]})
    rec = np.memmap(path, dtype=dt, mode="r", offset=head["offset"], shape=(head["count"],))
    try:
        parts = []
        for a in range(0, head["count"], CHUNK):
            part = rec[a:a + CHUNK]
            if share < 1.0:
                part = part[rng.random(len(part)) < share]  # fancy indexing copies the kept records
            parts.append(np.stack([(part[k].astype(np.float64) * s + o) * 1000.0
                                   for k, s, o in zip("xyz", head["scale"], head["origin"])], axis=1))
            del part
        return np.concatenate(parts)
    finally:
        del rec  # Windows keeps a mapped file locked; nothing returned is a view of it (astype copies)
