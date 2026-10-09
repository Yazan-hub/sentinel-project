# MA-4c — sentinel-survey 0.1's measuring code (design §2.1 rule 2: geometry from measuring code, never a language or vision model;
# §6.9): storeys from a height histogram, walls from a density slice per storey (faces found by a Hough transform and fitted by total
# least squares, then paired by WallPairing's rule — ported below), floors and ceilings as oriented rectangles. numpy only (the files are
# read by las.py and e57.py); the same points, params and seed give the same candidates (no randomness but the seeded point cap).
# Millimetres in the scan's own frame (no CRS applied — MA-4g: an E57's scans are posed into its file's frame, and one job reads one
# declared CRS). Candidates carry no type: the bridge types them (MA-4d). LOD 200 as found — never survey or permit grade (D7): a closed
# door reads as wall, openings are not proposed (MA-5), stairs are not read.
import math

import numpy as np

import las

# v0.1's fixed choices (a job sets voxel_mm and storey_min_mm). Each is a ceiling MA-4h measures on a real scan (Kladno).
Z_BIN = 10.0            # mm: the height histogram's bin
PLANE_BAND = 25.0       # mm: a horizontal surface's points lie within this of its height
PEAK = 8.0              # a surface's bin holds at least PEAK x the median non-empty bin (walls put a few points in every bin)
MIN_PLANE_POINTS = 200
# ponytail: a horizontal surface under 2 m2, or under a quarter of the largest, is furniture and is not proposed — a small mezzanine is
# lost with it. MA-4h tunes it on a real scan.
MIN_PLANE_M2 = 2.0
SLAB_MAX = 600.0        # mm: a surface this close above a ceiling is the slab's top — the next storey's floor
SLICE_HALF = 300.0      # mm: the wall slice is mid-storey +-300 mm (ponytail: furniture taller than mid-storey reads as a wall face)
CELL = 20.0             # mm: the slice's grid; a face is its points within CELL of a line (why voxel_mm stops at 50: at 200 mm,
                        # 4 of the drill's 8 walls lost their thickness, measured; the bridge and read_job both bound it)
MIN_FACE = 500.0        # mm: a shorter face is not proposed
MAX_GAP = 300.0         # mm: a face breaks where its line is empty for longer (a doorway; a closed door reads as wall)
END_GAP = 100.0         # mm: a piece shorter than this at a face's end, past an empty stretch, is another face crossing the line
MAX_WALL = 600.0        # mm: faces further apart are two walls (a corridor), not one — WallPairing allows 1000 on drawings
NEAR_FACE = 40.0        # mm: a floor or ceiling point this close to a wall face of its storey is the wall's
# ponytail: at most 10 million points are held in memory (a seeded sample beyond, read in chunks — las.CHUNK; no memory bound on
# Windows without a Job Object); MA-4h measures the cap on the 6.5 GB Kladno run.
MAX_POINTS = 10_000_000
# ponytail: one building per job — the Hough accumulator is 360 x (2 x span / CELL) votes, ~170 MB at 300 m (twice, with bincount's);
# a site, a campus or a long infrastructure scan waits for MA-4h's tiled slices.
MAX_SPAN = 300_000.0    # mm in plan


def load(items, params, seed, progress=lambda stage, pct: None):
    """The cloud survey() measures: every item read (a seeded sample past MAX_POINTS), one building at most, one point per voxel_mm cube.
    MA-4e: the same items in the same order, voxel_mm and seed give the same points — deviation reads exactly the cloud a job's candidates
    came from. items: [{id, path, head}], hashed and headed by the service. → (P mm, src, points_in); las.Refused in words past MAX_SPAN."""
    points_in = sum(i["head"]["count"] for i in items)
    share, rng = min(1.0, MAX_POINTS / points_in), np.random.default_rng(seed)
    # MA-4g: two declared frames would be read as one. ponytail: compared by EPSG code, else by the record's sha256 — one CRS written two
    # ways (a WKT with no code beside GeoTIFF keys) is refused too, its words naming both; a scan with no CRS beside one is read ("assumed").
    # Named by code or sha256, never by the file's own text: these words reach the ledger.
    named = {i["id"]: i["head"]["crs"] for i in items if i["head"].get("crs")}
    if len({c["epsg"] or c["sha256"] for c in named.values()}) > 1:
        said = "; ".join(f"{k}: " + (f"EPSG:{c['epsg']}" if c["epsg"] else f"a CRS with no EPSG code (sha256 {c['sha256'][:12]})")
                         for k, c in named.items())
        raise las.Refused(f"the scans declare different CRSs ({said}) — one job reads one frame; survey scans in one CRS")
    progress("reading", 10)
    clouds = [las.read_points_mm(i["path"], i["head"], share, rng) for i in items]
    P = np.concatenate(clouds)
    span = float(np.ptp(P[:, :2], axis=0).max())
    if span > MAX_SPAN:
        raise las.Refused(f"the scans span {span / 1000:.0f} m in plan — sentinel-survey reads one building (at most "
                          f"{MAX_SPAN / 1000:.0f} m across); a larger site waits for MA-4h")
    src = np.concatenate([np.full(len(c), k) for k, c in enumerate(clouds)])
    P, src = voxel(P, src, float(params["voxel_mm"]))
    return P, src, points_in


def survey(items, params, seed, progress=lambda stage, pct: None):
    """items: [{id, path, head}], hashed and headed by the service. → (candidates, {points_in, points_used}); las.Refused in words when
    the scans span more than one building."""
    P, src, points_in = load(items, params, seed, progress)
    progress("storeys", 30)
    out = measure(P, src, [i["id"] for i in items], float(params["storey_min_mm"]), progress)
    return out, {"points_in": int(points_in), "points_used": int(len(P))}


def voxel(P, src, mm):
    """One point per mm-sided cube, the first in reading order — the same points every run. The cubes are keyed by one int64, counted
    from the cloud's lowest corner: numpy sorts a 1-D int64 without holding Python's lock (the service still answers the bridge's polls),
    where np.unique over rows held it 12 s at the 10 M cap (measured on this PC)."""
    k = np.floor(P / mm).astype(np.int64)
    k -= k.min(axis=0)
    n = k.max(axis=0) + 1
    if int(n[0]) * int(n[1]) * int(n[2]) < 2**62:
        _, first = np.unique((k[:, 0] * n[1] + k[:, 1]) * n[2] + k[:, 2], return_index=True)
    else:  # ponytail: a cloud too tall to key in 62 bits (only a stray point km away in z, the plan span is capped) takes the row sort,
        _, first = np.unique(k, axis=0, return_index=True)  # which holds the lock; the bridge's poll grace (BUSY_MS) covers it
    first.sort()
    return P[first], src[first]


def thin(P, z, mm, cap):
    """MA-4f: the scan overlay's points — the cloud between heights z[0] and z[1] (mm, the scan's frame), one point per mm cube, the cube doubled
    until at most cap are left (even over the walls, never a cut list; the same points every run). → (whole-mm int64 rows, the cube used, how many
    the first cube kept). cap >= 8 (read_cloud): a cube larger than the band's extent keys at most 2 cells an axis, 8 in all, so the doubling ends."""
    Q = P[(P[:, 2] >= z[0]) & (P[:, 2] <= z[1])]
    if not len(Q):
        return np.zeros((0, 3), np.int64), mm, 0
    none = np.zeros(len(Q), np.int8)
    T, _ = voxel(Q, none, float(mm))
    of = len(T)
    while len(T) > cap:
        mm *= 2
        T, _ = voxel(Q, none, float(mm))
    return np.round(T).astype(np.int64), mm, of


def surfaces(P):
    """Horizontal surfaces from the height histogram: [{z, band (mask), area_m2}], furniture-sized ones dropped."""
    z = P[:, 2]
    lo = math.floor(z.min() / Z_BIN) * Z_BIN
    h = np.bincount(((z - lo) // Z_BIN).astype(np.int64))
    hot = np.flatnonzero(h >= max(MIN_PLANE_POINTS, PEAK * np.median(h[h > 0])))
    out = []
    for g in np.split(hot, np.flatnonzero(np.diff(hot) > 2) + 1) if hot.size else []:
        z0 = lo + (g[np.argmax(h[g])] + 0.5) * Z_BIN
        zp = float(np.median(z[np.abs(z - z0) <= PLANE_BAND]))
        band = np.abs(z - zp) <= PLANE_BAND
        area = len(np.unique(np.floor(P[band, :2] / 100).astype(np.int64), axis=0)) * 0.01
        out.append({"z": zp, "band": band, "area_m2": area})
    big = max((s["area_m2"] for s in out), default=0.0)
    return [s for s in out if s["area_m2"] >= max(MIN_PLANE_M2, big / 4)]


def classify(found, storey_min):
    """Floors and ceilings, walking up: the lowest surface is a floor; one within SLAB_MAX above a ceiling is the next floor; one at least
    storey_min above the last floor is a ceiling; any other is not proposed.
    ponytail: by the gaps alone — a split level, a mezzanine, or terrain scanned outside the building is mislabelled; the scanner's
    positions (an E57's poses, read since MA-4g, not used here yet) settle which side a surface was seen from."""
    floors, ceilings, prev = [], [], None
    for s in sorted(found, key=lambda s: s["z"]):
        if prev is None or (prev["kind"] == "ceiling" and s["z"] - prev["z"] <= SLAB_MAX):
            s["kind"] = "floor"
            floors.append(s)
        elif s["z"] - floors[-1]["z"] >= storey_min:
            s["kind"] = "ceiling"
            ceilings.append(s)
        else:
            continue
        prev = s
    return floors, ceilings


def fit_line(Q):
    """Total least squares: centre, unit direction (pointing +x), unit normal."""
    c = Q.mean(axis=0)
    d = np.linalg.eigh(np.cov((Q - c).T))[1][:, 1]
    if d[0] < -1e-12 or (abs(d[0]) <= 1e-12 and d[1] < 0):
        d = -d
    return c, d, np.array([-d[1], d[0]])


def trim(tt):
    """The indices of sorted positions tt, less the short pieces at either end past an END_GAP (another face crossing the line)."""
    pieces = np.split(np.arange(len(tt)), np.flatnonzero(np.diff(tt) > END_GAP) + 1)
    while len(pieces) > 1 and tt[pieces[0][-1]] - tt[pieces[0][0]] < END_GAP:
        pieces.pop(0)
    while len(pieces) > 1 and tt[pieces[-1][-1]] - tt[pieces[-1][0]] < END_GAP:
        pieces.pop()
    return np.concatenate(pieces)


def faces(XY):
    """Wall faces in a slice's plan points (mm), longest first: {seg (x1, y1, x2, y2), len, points, rmse, coverage}. The Hough runs in
    the slice's local frame (its lowest corner at 0), so the accumulator follows the slice's size, never its distance from the scan's
    origin (a UTM easting asked for 1.56 TiB); each seg is given back in the scan's own frame.
    ponytail: the Hough transform runs again after each face over the cells left (faces x cells x 360 votes) — fine for a house; MA-4h
    measures a real building."""
    if len(XY) == 0:
        return []
    org = XY.min(axis=0)
    XY = XY - org
    C = (np.unique(np.floor(XY / CELL).astype(np.int64), axis=0) + 0.5) * CELL
    alive, used = np.ones(len(C), bool), np.zeros(len(XY), bool)
    th = np.radians(np.arange(0, 180, 0.5))
    cs, sn = np.cos(th), np.sin(th)
    R = float(np.abs(C).sum(axis=1).max()) + CELL
    nr = int(2 * R / CELL) + 2
    out = []
    while alive.sum() >= MIN_FACE / CELL:
        A = C[alive]
        acc = np.zeros(len(th) * nr, np.int64)
        for t0 in range(0, len(th), 30):  # 30 angles at a time: memory stays cells x 30
            rho = np.rint((A[:, :1] * cs[t0:t0 + 30] + A[:, 1:] * sn[t0:t0 + 30] + R) / CELL).astype(np.int64)
            acc += np.bincount((np.arange(t0, t0 + rho.shape[1]) * nr + rho).ravel(), minlength=len(acc))
        k = int(acc.argmax())
        if acc[k] < MIN_FACE / CELL:
            break
        t, r = divmod(k, nr)
        n0, rho0 = np.array([cs[t], sn[t]]), r * CELL - R
        alive &= ~(np.abs(C @ n0 - rho0) <= CELL)  # the peak's own cells always go: the loop ends
        sel = ~used & (np.abs(XY @ n0 - rho0) <= CELL)
        for _ in range(3):  # the 0.5° peak, refitted on its points until the whole face is in
            if sel.sum() < 3:
                break
            c, d, n = fit_line(XY[sel])
            sel = ~used & (np.abs((XY - c) @ n) <= CELL)
        if sel.sum() < 3:
            continue
        alive &= ~(np.abs((C - c) @ n) <= 1.5 * CELL)
        idx = np.flatnonzero(sel)
        tt = (XY[idx] - c) @ d
        o = np.argsort(tt, kind="stable")
        idx, tt = idx[o], tt[o]
        for run in np.split(np.arange(len(idx)), np.flatnonzero(np.diff(tt) > MAX_GAP) + 1):
            run = run[trim(tt[run])]
            if tt[run[-1]] - tt[run[0]] < MIN_FACE:
                continue
            pts = idx[run]
            cr, dr, nm = fit_line(XY[pts])
            tr, res = (XY[pts] - cr) @ dr, (XY[pts] - cr) @ nm
            a, b = cr + dr * tr.min(), cr + dr * tr.max()
            ln = float(tr.max() - tr.min())
            cover = np.unique(np.floor((tr - tr.min()) / 100)).size / max(1, math.ceil(ln / 100))
            out.append({"seg": (float(a[0] + org[0]), float(a[1] + org[1]), float(b[0] + org[0]), float(b[1] + org[1])), "len": ln, "points": pts,
                        "rmse": rms(res), "coverage": min(1.0, cover)})
            used[pts] = True
    return sorted(out, key=lambda f: -f["len"])


def seg_dist(XY, s):
    a, b = np.array(s[:2]), np.array(s[2:])
    d = b - a
    t = np.clip(((XY - a) @ d) / (d @ d), 0.0, 1.0)
    return np.linalg.norm(XY - (a + t[:, None] * d), axis=1)


def extent(w, other):
    """w's range over the 50 mm columns holding at least a fifth as many filled cells as the fullest — a stray point does not stretch it."""
    b = np.floor((w - w.min()) / 50).astype(np.int64)
    cells = np.unique(np.stack([b, np.floor((other - other.min()) / 50).astype(np.int64)], 1), axis=0)
    n = np.bincount(cells[:, 0])
    ok = np.flatnonzero(n >= 0.2 * n.max())
    m = (b >= ok[0]) & (b <= ok[-1])
    return float(w[m].min()), float(w[m].max())


def outline(P, band, fs):
    """A floor's or ceiling's outline: an oriented rectangle around its points less those within NEAR_FACE of a wall face of its storey,
    turned to the storey's longest face (else the smallest over 0.5° steps). None when fewer than 3 points are left.
    ponytail: a rectangle — an L-shaped floor reads as its bounding rectangle, said by its coverage; the outline of the filled cells
    (Douglas-Peucker) waits for MA-4h. It sits up to ~NEAR_FACE inside its walls."""
    idx = np.flatnonzero(band)
    for f in fs:
        idx = idx[seg_dist(P[idx, :2], f["seg"]) > NEAR_FACE]
    if len(idx) < 3:
        return None
    XY = P[idx, :2]
    if fs:
        s = fs[0]["seg"]
        ang = math.atan2(s[3] - s[1], s[2] - s[0]) % (math.pi / 2)
    else:
        def size(a):
            return np.ptp(XY @ np.array([math.cos(a), math.sin(a)])) * np.ptp(XY @ np.array([-math.sin(a), math.cos(a)]))
        ang = min((math.radians(k / 2) for k in range(180)), key=size)
    c, s_ = math.cos(ang), math.sin(ang)
    u, v = XY @ np.array([c, s_]), XY @ np.array([-s_, c])
    (u0, u1), (v0, v1) = extent(u, v), extent(v, u)
    m = (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
    filled = len(np.unique(np.stack([np.floor((u[m] - u0) / 200), np.floor((v[m] - v0) / 200)], 1), axis=0))
    cover = min(1.0, filled / max(1, math.ceil((u1 - u0) / 200) * math.ceil((v1 - v0) / 200)))
    corners = [(uu * c - vv * s_, uu * s_ + vv * c) for uu, vv in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
    return {"corners": corners, "area": (u1 - u0) * (v1 - v0), "cover": cover, "points": idx[m]}


# ── WallPairing.Pair (SentinelAddin/GhostBuilder/WallPairing.cs), rule for rule — tools/wallpair-check/Check.cs's cases are Pair's tests ──
def _len(s):
    return math.hypot(s[2] - s[0], s[3] - s[1])


def _parallel(a, b, cos_tol):  # |cos| — same or opposite direction both count
    return abs(((a[2] - a[0]) * (b[2] - b[0]) + (a[3] - a[1]) * (b[3] - b[1])) / (_len(a) * _len(b))) >= cos_tol


def _perp(a, b):  # b's midpoint to a's infinite line: the thickness, once parallel and overlapping
    mx, my = (b[0] + b[2]) * 0.5, (b[1] + b[3]) * 0.5
    return abs((a[2] - a[0]) * (my - a[1]) - (a[3] - a[1]) * (mx - a[0])) / _len(a)


def _overlap(a, b):  # the share of the shorter segment covered, measured along a
    la = _len(a)
    ux, uy = (a[2] - a[0]) / la, (a[3] - a[1]) / la
    b0, b1 = sorted(((b[0] - a[0]) * ux + (b[1] - a[1]) * uy, (b[2] - a[0]) * ux + (b[3] - a[1]) * uy))
    return max(0.0, min(la, b1) - max(0.0, b0)) / min(la, _len(b))


def _centreline(a, b, gap, i, j):  # through the mean of the four ends, along a, a's full length
    mx, my = (a[0] + b[0] + a[2] + b[2]) * 0.25, (a[1] + b[1] + a[3] + b[3]) * 0.25
    la = _len(a)
    ux, uy, half = (a[2] - a[0]) / la, (a[3] - a[1]) / la, la * 0.5
    return (mx - ux * half, my - uy * half, mx + ux * half, my + uy * half, gap, i, j)


def pair(segs, max_thickness=1000.0, angle_tol_deg=5.0, min_overlap=0.5):
    """Greedy but deterministic in input order: each face takes its closest valid later partner. → [(cx1, cy1, cx2, cy2, thickness, i, j)];
    a face left over comes back as itself, thickness 0, j = -1 (never dropped)."""
    walls, used = [], [False] * len(segs)
    cos_tol = math.cos(math.radians(angle_tol_deg))
    for i, a in enumerate(segs):
        if used[i]:
            continue
        if _len(a) < 1e-6:
            used[i] = True
            continue
        best, best_gap = -1, math.inf
        for j in range(i + 1, len(segs)):
            b = segs[j]
            if used[j] or _len(b) < 1e-6:
                continue
            if not _parallel(a, b, cos_tol) or _overlap(a, b) < min_overlap:
                continue
            gap = _perp(a, b)
            if gap < 1e-6 or gap > max_thickness:
                continue
            if gap < best_gap:
                best, best_gap = j, gap
        if best >= 0:
            used[i] = used[best] = True
            walls.append(_centreline(a, segs[best], best_gap, i, best))
    for i, a in enumerate(segs):
        if not used[i] and _len(a) >= 1e-6:
            walls.append((*a, 0.0, i, -1))
    return walls


def r(v):
    return int(round(float(v)))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def fit(n, rmse, cover):
    return {"inliers": int(n), "rmse_mm": round(float(rmse), 1), "coverage": round(float(cover), 3)}


def measure(P, src, ids, storey_min, progress=lambda stage, pct: None):
    """The candidates of one registered cloud P (mm); src[i] is point i's item, an index into ids. Per storey, bottom up: its level, its
    floor, its ceilings, its walls. A wall's top is its storey's first ceiling, else the next floor, else the highest point.
    ponytail: a wall's ends follow WallPairing's centreline (face a's full length) — at a corner up to half a thickness long or short;
    MA-4d decides whether to trim walls to their intersections."""
    floors, ceilings = classify(surfaces(P), storey_min)

    def refs(pts, frag):
        return [f"{ids[k]}#{frag}" for k in sorted(set(src[pts].tolist()))]

    out = []
    for k, f in enumerate(floors):
        name, zf = f"L{k:02d}", f["z"]
        lv = f"scan-{name}-level"
        nxt = floors[k + 1]["z"] if k + 1 < len(floors) else None
        cs = [c for c in ceilings if c["z"] > zf and (nxt is None or c["z"] < nxt)]
        top = cs[0]["z"] if cs else nxt if nxt is not None else float(P[:, 2].max())
        sl = np.flatnonzero(np.abs(P[:, 2] - (zf + top) / 2) <= SLICE_HALF)
        fs = faces(P[sl, :2])
        for x in fs:
            x["points"] = sl[x["points"]]
        band = np.flatnonzero(f["band"])
        o = outline(P, f["band"], fs)
        out.append({"cid": lv, "kind": "level", "geometry": {"BaseElevation": r(zf)}, "measured": {"elevation_mm": r(zf)},
                    "evidence": refs(band, f"floor-{name}"), "fit": fit(len(band), rms(P[band, 2] - zf), o["cover"] if o else 0.0)})
        if o:
            out.append({"cid": f"scan-{name}-floor", "kind": "floor",
                        "geometry": {"LocationLoop": [[r(x), r(y), r(zf)] for x, y in o["corners"]], "storey": lv},
                        "measured": {"elevation_mm": r(zf), "area_m2": round(o["area"] / 1e6, 2)},
                        "evidence": refs(o["points"], f"floor-{name}"),
                        "fit": fit(len(o["points"]), rms(P[o["points"], 2] - zf), o["cover"])})
        for n, c in enumerate(cs, 1):
            oc = outline(P, c["band"], fs)
            if oc:
                out.append({"cid": f"scan-{name}-ceiling" + (f"-{n}" if n > 1 else ""), "kind": "ceiling",
                            "geometry": {"Boundary": [[r(x), r(y)] for x, y in oc["corners"]], "Offset": r(c["z"] - zf), "storey": lv},
                            "measured": {"elevation_mm": r(c["z"]), "height_mm": r(c["z"] - zf), "area_m2": round(oc["area"] / 1e6, 2)},
                            "evidence": refs(oc["points"], f"ceiling-{name}"),
                            "fit": fit(len(oc["points"]), rms(P[oc["points"], 2] - c["z"]), oc["cover"])})
        for n, (x1, y1, x2, y2, t, i, j) in enumerate(pair([x["seg"] for x in fs], max_thickness=MAX_WALL), 1):
            two = [fs[i]] + ([fs[j]] if j >= 0 else [])
            pts = np.concatenate([x["points"] for x in two])
            out.append({"cid": f"scan-{name}-wall-{n}", "kind": "wall",
                        "geometry": {"LocationCurve": {"start": [r(x1), r(y1), r(zf)], "end": [r(x2), r(y2), r(zf)]},
                                     "BaseElevation": r(zf), "TopElevation": r(top), "storey": lv,
                                     "faces": [[r(v) for v in x["seg"]] for x in two]},
                        "measured": {"length_mm": r(math.hypot(x2 - x1, y2 - y1)), "height_mm": r(top - zf),
                                     **({"thickness_mm": r(t)} if j >= 0 else {})},
                        "evidence": refs(pts, f"slice-{name}"),
                        "fit": fit(len(pts), math.sqrt(sum(len(x["points"]) * x["rmse"] ** 2 for x in two) / len(pts)),
                                   min(x["coverage"] for x in two))})
        progress("walls", 30 + 60 * (k + 1) // len(floors))
    return out


# ── MA-4e: deviation (design §6.9 POST /measure) — how far the job's own cloud sits from each placed element's faces. Numbers only: the
#    bridge judges (rule 3). v0.1's fixed knobs, named on the receipt (receipt.measure); each one MA-4h tunes on Kladno. ──
EDGE = 200.0      # mm: a face is read this far in from every edge — the floor, the ceiling, the slab above, a join and a free end are not judged
DEV_CELL = 200.0  # mm: coverage cells on a face, filled by any point the face owns (100 mm cells on the drill's 100 mm grid leave a quarter empty by chance)


def deviation(P, elements, tols, progress=lambda stage, pct: None):
    """P: the job's cloud (mm, the scan's frame). elements: [{guid, faces: [[p0, p1, p3], …]}] — rectangles in the scan's frame, p1 and p3 the
    corners next to p0, (p1 − p0) × (p3 − p0) pointing out of the element. A point within BAND = 2 × the largest tolerance of a face's plane,
    over the face, goes to the nearest such face of every element sent (a wall's other face and a neighbour's face — a partition abutting
    it — take their own points), and counts only when it lies over that face's interior (EDGE in from every edge). d is its signed
    distance: + when the scan lies outside the element.
    → per element, in the order sent: {guid, points, p95_mm (of |d|), mean_signed_mm, share_within {tol: share of its points with |d| ≤ tol},
    coverage (its faces' interior cells holding a point it owns — within BAND, so a face seen but placed far off still counts as seen and
    p95 judges it)} — 0.1 mm and 3 decimals; the numbers null with no
    point, coverage null when no face has an interior.
    ponytail: each face is a pass over the cloud cropped to the elements' box (faces x points) — fine for a storey of 200 walls; a plan-grid
    index when MA-4h measures Kladno. Clutter, or an element not placed, within BAND of a face's interior counts against it (the honest
    reading: the scan is not the model). ~1 GB at the 10 M point cap (the crop and three per-point arrays) — MA-4h measures it."""
    band = 2.0 * float(max(tols))
    F = []  # (element, origin, u, |u|, v, |v|, outward normal)
    for k, e in enumerate(elements):
        for p0, p1, p3 in e["faces"]:
            o = np.asarray(p0, float)
            a, b = np.asarray(p1, float) - o, np.asarray(p3, float) - o
            la, lb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
            F.append((k, o, a / la, la, b / lb, lb, np.cross(a, b) / (la * lb)))

    def box(o, u, la, v, lb):
        return np.array([o, o + u * la, o + v * lb, o + u * la + v * lb])
    corners = np.concatenate([box(o, u, la, v, lb) for (_, o, u, la, v, lb, _) in F])
    Q = P[np.all((P >= corners.min(axis=0) - band) & (P <= corners.max(axis=0) + band), axis=1)]
    best, owner, sd, inner = np.full(len(Q), np.inf), np.full(len(Q), -1, np.int64), np.zeros(len(Q)), np.zeros(len(Q), bool)
    for i, (_, o, u, la, v, lb, n) in enumerate(F):
        c = box(o, u, la, v, lb)
        idx = np.flatnonzero(np.all((Q >= c.min(axis=0) - band) & (Q <= c.max(axis=0) + band), axis=1))
        R = Q[idx] - o
        s, t, d = R @ u, R @ v, R @ n
        ok = (s >= 0) & (s <= la) & (t >= 0) & (t <= lb) & (np.abs(d) <= band) & (np.abs(d) < best[idx])  # owners over the full face
        j = idx[ok]
        best[j], owner[j], sd[j] = np.abs(d[ok]), i, d[ok]
        inner[j] = ((s >= EDGE) & (s <= la - EDGE) & (t >= EDGE) & (t <= lb - EDGE))[ok]
        progress("measuring", 40 + 50 * (i + 1) // len(F))
    owner[~inner] = -1  # counted only over the owner's interior: a join's points are the abutting face's, and neither judges them
    out = []
    for k, e in enumerate(elements):
        ds, filled, cells = [], 0, 0
        for i, (kk, o, u, la, v, lb, _) in enumerate(F):
            nu, nv = math.ceil((la - 2 * EDGE) / DEV_CELL), math.ceil((lb - 2 * EDGE) / DEV_CELL)
            if kk != k or nu <= 0 or nv <= 0:
                continue
            j = np.flatnonzero(owner == i)
            ds.append(sd[j])
            cells += nu * nv
            R = Q[j] - o  # every point the face owns (already within BAND): a face seen but far off is seen, and p95 judges it
            cu = np.minimum(np.floor((R @ u - EDGE) / DEV_CELL), nu - 1).astype(np.int64)
            cv = np.minimum(np.floor((R @ v - EDGE) / DEV_CELL), nv - 1).astype(np.int64)
            filled += np.unique(cu * nv + cv).size
        d = np.concatenate(ds) if ds else np.zeros(0)
        a = np.abs(d)
        out.append({"guid": e["guid"], "points": int(d.size),
                    "p95_mm": round(float(np.percentile(a, 95)), 1) + 0.0 if d.size else None,  # + 0.0: never -0.0
                    "mean_signed_mm": round(float(d.mean()), 1) + 0.0 if d.size else None,
                    "share_within": {str(t): round(float((a <= t).mean()), 3) for t in tols} if d.size else None,
                    "coverage": round(filled / cells, 3) if cells else None})
    return out
