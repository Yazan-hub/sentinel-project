"""MA-7-17/7-18: pinhole views of an E57 panorama, so a panorama goes wherever a photo goes (openings.judge for 7-20, register.sfm for 7-17).
The panoramas come out of the E57 with photo/e57_images.py (sentinel-e57-images); spec() turns one of its image records into what cut() needs.

Pose: the standard's pose maps the image's local frame to the file's (p_file = R p_local + t, metres -> mm here), as for a scan. Local frame
z up; azimuth counter-clockwise from +x about +z. The pixel convention below is NOT settled by the standard's text; it is the best of 10 tried
by SfM against the manitou file's poses (Session MA7 7-17/7-18 rows) and is not confirmed, so no panorama pose is written as a registration.
"""
import numpy as np

AZ_SIGN = -1   # columns run clockwise: azimuth falls left to right, as a panorama is seen from inside
EL_SIGN = -1   # rows run down: elevation falls top to bottom
AZ_CENTRE_COL = 0.75  # the azimuth-0 column, as a fraction of the width: the best of 10 conventions tried by SfM on the manitou file
# (10 deg median rotation error, 0.5 m centres - but 11 of 40 views registered, 30 deg worst); the centre (0.5) was 113 deg off
CONVENTION_CONFIRMED = False  # until a run confirms it, a panorama's pose is NOT written as a registration (7-18 E5-1 owed)


def spec(rec):
    """An e57_images.py image record (rotation [w,x,y,z], translation m, width, height, pixel_width, pixel_height) -> cut()'s spec."""
    w, x, y, z = rec["rotation"]
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    return {"width": rec["width"], "height": rec["height"], "pixel_w": rec["pixel_width"], "pixel_h": rec["pixel_height"],
            "R": R, "t_mm": np.array(rec["translation"], float) * 1000.0}


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
