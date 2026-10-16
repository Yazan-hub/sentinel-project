"""MA-7-17 core: registration maths and the SfM run. A person picks >= 4 photo<->scan control points and 1 held-out check point; umeyama()
gives the similarity (scale, rotation, translation), fit() the RMSE and the check point's distance, both in mm, for the person to confirm.
sfm() runs pycolmap (accepted for the office PC only, D-7-16) on a folder of photos with known pinhole intrinsics and returns each photo's
world-to-camera in the SfM's own frame. The service, the control-point picking and evidence:registered wait for 7-17 Stage B.
"""
import numpy as np


def umeyama(src, dst):
    """Similarity with dst ~ s R src + t (Umeyama 1991), least squares, never a reflection. src, dst: N x 3, N >= 3, not collinear."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    if len(src) < 3 or src.shape != dst.shape:
        raise ValueError("at least 3 point pairs of the same count are needed")
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    U, S, Vt = np.linalg.svd(b.T @ a / len(src))
    if S[1] < 1e-9 * S[0]:
        raise ValueError("the control points are collinear - a rotation about their line is not fixed")
    D = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = (S * np.diag(D)).sum() / ((a ** 2).sum() / len(src))
    return s, R, md - s * R @ ms


def fit(src, dst, check_src=None, check_dst=None):
    """{"s", "R", "t", "rmse_mm", "check_mm"}: the RMSE of the control points after the fit and the held-out check point's distance."""
    s, R, t = umeyama(src, dst)
    res = np.linalg.norm((s * np.asarray(src, float) @ R.T + t) - np.asarray(dst, float), axis=1)
    out = {"s": float(s), "R": R, "t": t, "rmse_mm": float(np.sqrt((res ** 2).mean()))}
    if check_src is not None:
        out["check_mm"] = float(np.linalg.norm(s * R @ np.asarray(check_src, float) + t - np.asarray(check_dst, float)))
    return out


def pose_points(w2c, arm=1000.0):
    """A camera's centre and the tips of its x and z axes `arm` away, in world units: three non-collinear points per pose, so poses
    along a line still fix a rotation."""
    w2c = np.asarray(w2c, float)
    R, t = w2c[:3, :3], w2c[:3, 3]
    c = -R.T @ t
    return np.array([c, c + arm * R[0], c + arm * R[2]])


def angle_deg(Ra, Rb):
    """The angle between two rotations, degrees."""
    return float(np.degrees(np.arccos(np.clip((np.trace(np.asarray(Ra).T @ np.asarray(Rb)) - 1) / 2, -1, 1))))


def sfm(image_dir, work_dir, K=None, sequential=False):
    """pycolmap SIFT + matching + incremental mapping on every image in image_dir, one camera for all. K given: PINHOLE held fixed; K None:
    SIMPLE_RADIAL estimated (a phone or drone photo set). sequential: neighbours-in-name-order matching (video frames) instead of exhaustive.
    -> ({name: world_to_cam 4x4}, {"K": 3x3, "k1", "points", "reproj_px"}) for the largest reconstruction (SfM frame, arbitrary scale)."""
    import os
    import pycolmap
    os.makedirs(work_dir, exist_ok=True)
    db = os.path.join(work_dir, "database.db")
    reader = pycolmap.ImageReaderOptions()
    if K is not None:
        reader.camera_model = "PINHOLE"
        reader.camera_params = ",".join(str(x) for x in (K[0][0], K[1][1], K[0][2], K[1][2]))
    else:
        reader.camera_model = "SIMPLE_RADIAL"
    pycolmap.extract_features(db, image_dir, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=reader)
    (pycolmap.match_sequential if sequential else pycolmap.match_exhaustive)(db)
    opts = pycolmap.IncrementalPipelineOptions()
    if K is not None:
        opts.ba_refine_focal_length = False
        opts.ba_refine_principal_point = False
        opts.ba_refine_extra_params = False
    recs = pycolmap.incremental_mapping(db, image_dir, os.path.join(work_dir, "sparse"), options=opts)
    if not recs:
        return {}, {}
    rec = max(recs.values(), key=lambda r: r.num_reg_images())
    out = {}
    for im in rec.images.values():
        if im.has_pose:
            m = np.eye(4)
            m[:3, :] = im.cam_from_world().matrix()
            out[im.name] = m
    cam = next(iter(rec.cameras.values()))
    p = list(cam.params)
    Kc = [[p[0], 0, p[1]], [0, p[0], p[2]], [0, 0, 1]] if len(p) == 4 else [[p[0], 0, p[2]], [0, p[1], p[3]], [0, 0, 1]]
    info = {"K": Kc, "k1": p[3] if len(p) == 4 else 0.0, "points": rec.num_points3D(), "reproj_px": rec.compute_mean_reprojection_error()}
    return out, info
