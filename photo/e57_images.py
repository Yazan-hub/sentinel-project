"""MA-7-18: an E57's panoramas as posed photos. Reads images2D (name, guid, the scan it belongs to, pose, sphericalRepresentation and its
jpeg/png blob) with pye57 at survey's pin, after survey's own XML check (survey/e57.py xml_refusal: no DTD, entity or schema location, so the
bundled Xerces parser fetches nothing). survey 0.6.0 is untouched; this only imports its checks.

cut() makes a pinhole view of a panorama with an exact K and world-to-camera (mm), so a view goes where any photo goes: openings.judge
(7-20) and the SfM check (register.py, 7-17). Pose: the standard's pose maps the image's local frame to the file's (p_file = R p_local + t,
metres -> mm here), as for a scan. Local frame z up; azimuth counter-clockwise from +x about +z (the standard's spherical coordinates).
Pixel convention: AZ_CENTRE_COL / AZ_SIGN / EL_SIGN below - checked against SfM on the manitou file (register.py, the Session MA7
7-17/7-18 rows); an E57 from another scanner is checked the same way before its poses are trusted.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "survey"))
import e57 as survey_e57  # noqa: E402  (survey's XML check and pin)
import las  # noqa: E402

MAX_IMAGE_BYTES = 64 * 1024 * 1024  # as blur.py's cap: a bigger blob is refused before it is read
AZ_SIGN = -1   # columns run clockwise: azimuth falls left to right, as a panorama is seen from inside
EL_SIGN = -1   # rows run down: elevation falls top to bottom
AZ_CENTRE_COL = 0.75  # the azimuth-0 column, as a fraction of the width: the best of 10 conventions tried by SfM on the manitou file
# (10 deg median rotation error, 0.5 m centres - but 11 of 40 views registered, 30 deg worst); the centre (0.5) was 113 deg off
CONVENTION_CONFIRMED = False  # until a run confirms it, a panorama's pose is NOT written as a registration (7-18 E5-1 owed)


def _node(L, n):
    return L.StructureNode(n) if type(n) is L.Node else n


def read_images(path):
    """[{index, name, guid, scan_guid, R, t_mm, width, height, pixel_w, pixel_h, format, data}] for every spherical image of the file.
    Refused in words: an unsafe XML, no pye57, an image with no pose, a blob over MAX_IMAGE_BYTES. Pinhole/cylindrical images are skipped
    (none in the files seen so far)."""
    survey_e57.xml_refusal(path)
    pye57 = las.lib("pye57")
    from pyquaternion import Quaternion
    from pye57 import libe57 as L
    out = []
    with las.damaged("E57"), pye57.E57(path) as e:
        root = e.image_file.root()
        if not root.isDefined("images2D"):
            return out
        ims = root["images2D"]
        for k in range(ims.childCount()):
            n = _node(L, ims.get(k))
            if not n.isDefined("sphericalRepresentation"):
                continue
            if not n.isDefined("pose"):
                raise las.Refused(f"image {k + 1}: it has no pose - not read")
            p = n["pose"]
            q = [p["rotation"][c].value() for c in "wxyz"]
            t = [p["translation"][c].value() for c in "xyz"]
            sp = n["sphericalRepresentation"]
            fmt = next((f for f in ("jpegImage", "pngImage") if sp.isDefined(f)), None)
            if not fmt:
                continue
            b = sp[fmt]
            if b.byteCount() > MAX_IMAGE_BYTES:
                raise las.Refused(f"image {k + 1}: {b.byteCount()} bytes is over the {MAX_IMAGE_BYTES} cap - not read")
            buf = np.zeros(b.byteCount(), np.uint8)
            b.read(buf, 0, b.byteCount())
            text = lambda f: n[f].value() if n.isDefined(f) else None  # noqa: E731
            out.append({"index": k, "name": text("name"), "guid": text("guid"), "scan_guid": text("associatedData3DGuid"),
                        "R": Quaternion(q).rotation_matrix, "t_mm": np.array(t) * 1000.0,
                        "width": sp["imageWidth"].value(), "height": sp["imageHeight"].value(),
                        "pixel_w": sp["pixelWidth"].value(), "pixel_h": sp["pixelHeight"].value(),
                        "format": fmt[:-5], "data": buf.tobytes()})
    return out


def _cam_axes(yaw, pitch):
    """Columns [right, down, forward] of a camera looking at azimuth `yaw`, elevation `pitch` (radians), in the panorama's local frame."""
    f = np.array([np.cos(pitch) * np.cos(yaw), np.cos(pitch) * np.sin(yaw), np.sin(pitch)])
    r = np.cross(f, [0.0, 0.0, 1.0])
    r /= np.linalg.norm(r)
    return np.c_[r, np.cross(f, r), f]


def to_pixel(az, el, spec):
    """Azimuth / elevation (radians, local frame) -> fractional (col, row) of the panorama (pixel edges at integers)."""
    col = spec["width"] * AZ_CENTRE_COL + AZ_SIGN * az / spec["pixel_w"]
    row = spec["height"] / 2 + EL_SIGN * el / spec["pixel_h"]
    return np.mod(col, 2 * np.pi / spec["pixel_w"]), row


def cut(pano, spec, yaw_deg, pitch_deg=0.0, hfov_deg=60.0, size=(800, 600)):
    """A pinhole view of the panorama (pano: HxWx3 uint8 array; spec: a read_images entry) -> (view HxWx3, K, world_to_cam 4x4 mm).
    Bilinear sampling; a ray off the panorama's band is black."""
    W, H = size
    f = (W / 2) / np.tan(np.radians(hfov_deg) / 2)
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1.0]])
    M = _cam_axes(np.radians(yaw_deg), np.radians(pitch_deg))
    u, v = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    rays = np.stack([(u - K[0, 2]) / f, (v - K[1, 2]) / f, np.ones_like(u)], -1) @ M.T
    az = np.arctan2(rays[..., 1], rays[..., 0])
    el = np.arctan2(rays[..., 2], np.hypot(rays[..., 0], rays[..., 1]))
    col, row = to_pixel(az, el, spec)
    col, row = col - 0.5, row - 0.5  # to pixel-centre indices
    ph, pw = pano.shape[:2]
    ok = (col >= 0) & (col <= pw - 1) & (row >= 0) & (row <= ph - 1)
    c0, r0 = np.clip(np.floor(col), 0, pw - 2).astype(int), np.clip(np.floor(row), 0, ph - 2).astype(int)
    dc, dr = np.clip(col - c0, 0, 1)[..., None], np.clip(row - r0, 0, 1)[..., None]
    p = pano.astype(float)
    view = p[r0, c0] * (1 - dc) * (1 - dr) + p[r0, c0 + 1] * dc * (1 - dr) + p[r0 + 1, c0] * (1 - dc) * dr + p[r0 + 1, c0 + 1] * dc * dr
    view[~ok] = 0
    A = M.T @ np.asarray(spec["R"]).T
    w2c = np.eye(4)
    w2c[:3, :3], w2c[:3, 3] = A, -A @ np.asarray(spec["t_mm"], float)
    return view.astype(np.uint8), K, w2c
