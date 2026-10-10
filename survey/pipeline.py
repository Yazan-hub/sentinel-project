# MA-4c — sentinel-survey 0.1's measuring code (design §2.1 rule 2: geometry from measuring code, never a language or vision model;
# §6.9): storeys from a height histogram, walls from a density slice per storey (faces found by a Hough transform and fitted by total
# least squares, then paired by WallPairing's rule — ported below), floors and ceilings as oriented rectangles. numpy only (the files are
# read by las.py and e57.py); the same points, params and seed give the same candidates (no randomness but the seeded point cap).
# Millimetres in the scan's own frame (no CRS applied — MA-4g: an E57's scans are posed into its file's frame, and one job reads one
# declared CRS). Candidates carry no type: the bridge types them (MA-4d; a door or window by its size, MA-5a). LOD 200 as found — never
# survey or permit grade (D7): a closed door reads as wall; a hole in a wall face is an opening or an occluder, said by its border
# (MA-5a); glazing is seen through, so a glazed door reads as a door and a curtain wall as no wall; swing, hinge, frame and lintel
# are not read; stairs are not read.
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
# MA-4h-3, Kladno: at 600 and 900 the 1F floor, 1 124 mm over GF's suspended ceiling, read as a ceiling (1F missed); 1 200 found every
# traced storey with no extra level (1F +18.4 mm). ponytail: a void deeper than 1.2 m loses its storey, and a surface within 1.2 m over a
# ceiling reads as a floor; the scanner's positions settle it (classify's ponytail).
SLAB_MAX = 1200.0       # mm: a surface this close above a ceiling is the slab's top — the next storey's floor
SLICE_HALF = 300.0      # mm: the wall slice is mid-storey +-300 mm (ponytail: furniture taller than mid-storey reads as a wall face)
CELL = 20.0             # mm: the slice's grid; a face is its points within CELL of a line (why voxel_mm stops at 50: at 200 mm,
                        # 4 of the drill's 8 walls lost their thickness, measured; the bridge and read_job both bound it)
# MA-4h-3, Kladno: clearing 1.5 cells around a found face left a rough face's far half to be found again — 190 of 231 pairs under 100 mm
# (median 40 mm), one surface twice; F1 at 100 mm rose on GF and 1F at 2 and again at 3, and with MA-4h-3's other knobs 61 of 162 pairs
# are under 100 mm (median 158 mm). ponytail: two faces closer than 3 cells (a wall under ~60 mm, glass) read as one face — never a
# wall — and a face stepped under 60 mm off another's line (a nib across a doorway) is lost; the scan's normals would tell them apart.
CLEAR = 3.0             # cells: a found face's cells within CLEAR x CELL of its line leave the Hough
# MA-4h-3, Kladno (tuned on GF, held out on 1F): F1 at 100 mm 0.089 / 0.204 at 500, 0.102 / 0.225 at 750, 0.116 / 0.330 at 1 000, and
# GF's candidates 313 -> 197 (a storey fits one changeset of 200). ponytail: a wall nib or a pier under 1 m is not proposed — a person draws it.
MIN_FACE = 1000.0       # mm: a shorter face is not proposed
MIN_HEIGHT = 0.8        # MA-4h-4: the share of the storey's height (100 mm bins, HEIGHT_EDGE in from floor and top) a wall face's points cover
HEIGHT_EDGE = 150.0     # mm: the floor's and the top's own points stay out of a face's height
# ponytail: each face of the slice scans the storey's points once for its occupancy grid (faces x points — Kladno's GF: 118 faces over
# ~3 M points), and merge_split once more for each collinear pair it tests and each face it merges (MA-5a: a pair that failed is not
# tested again — Kladno built 671 joined grids for 143 pairs before), measured inside the job's time on the drill; a plan-grid index
# when a storey nears JOB_MS.
# MA-5a: doors and windows from each wall face's occupancy — the (along, height) grid height_share reads. Measured on Kladno against
# the opening reference (reference-5a.json 61ee7e01…: GF 7 doors + 2 windows, 1F 17 doors, majority of three readers), one knob at a
# time, kept only when opening F1 at 100 mm rose on both storeys and wall F1 did not fall: OPEN_W 3 -> 5 (GF 0.014 -> 0.020, 1F 0.112
# -> 0.131; 6 lowered 1F, and a BDS window is 600 mm wide at the least), OPEN_H 3 -> 10 (0.060 / 0.325), MIN_BORDER 0 -> 0.5
# (0.100 / 0.394); LINTEL 0.6 -> 0.5 raised wall F1 (GF 0.204 -> 0.211, 1F 0.497 -> 0.500); MERGE_GAP 1500 / 3500, DOOR_ROWS 0 / 2 and
# SPECK 1 / 3 did not rise on both. At these: openings F1 0.264 / 0.283 / 0.358 at 50 / 100 / 200 mm (P 0.188, R 0.577 at 100), every
# matched class right; only 4 of GF's 9 traced openings lie on a wall the survey finds (1F 16 of 17) — GF's walls cap its openings.
# MA-5a review (holes grown across lines under half filled, a hole at a face's end dropped, two faces joined by their jambs, a unit
# direction; walls unchanged; the run 143 -> 117 s, the merge's failed pairs not tested again): at these knobs 0.244 / 0.276 / 0.325 (in
# memory, 2026-10-10). A grown hole's border is at least about half by construction, so MIN_BORDER 0.5 drops nearly nothing — it waits on
# its re-measure (0.9: 0.323 / 0.366 / 0.430, GF 0.188, 1F 0.459, every matched opening kept).
# ponytail: a hole seen on one face only is kept (an interior scan never sees a window's outer face); keeping only holes seen on both
# faces doubled 1F (0.394 -> 0.686) but lowered GF (0.100 -> 0.095), so the protocol left it out — the founder's call.
GRID = 100.0        # mm: the occupancy cell along a face and up it (coverage's bin, height_share's bin)
OPEN_W = 5          # cells along: a hole narrower is clutter or a scan shadow, not an opening
OPEN_H = 10         # cells up: a hole under 1 m high is clutter too; every BDS window is at least 1200 mm high (7 of its 27 sized windows are wider than tall)
MIN_BORDER = 0.5    # share of a hole's border cells that hold the face: an opening is framed by its wall; less is a gap the scan left
DOOR_ROWS = 1       # a hole whose lowest row is within this of the grid's floor row is a door
MERGE_GAP = 2500.0  # mm: two faces on one line this close are one wall across a doorway when a lintel bridges the gap
LINTEL = 0.5        # share of the gap's cells above its hole that must be filled for the merge
SPECK = 2           # a filled cell with this many filled neighbours or fewer (of 8) is stray points inside a hole, not the face
MAX_GAP = 300.0         # mm: a face breaks where its line is empty for longer (a doorway; a closed door reads as wall)
END_GAP = 100.0         # mm: a piece shorter than this at a face's end, past an empty stretch, is another face crossing the line
MAX_WALL = 600.0        # mm: faces further apart are two walls (a corridor), not one — WallPairing allows 1000 on drawings
NEAR_FACE = 40.0        # mm: a floor or ceiling point this close to a wall face of its storey is the wall's
# ponytail: at most 10 million points are held in memory (a seeded sample beyond, read in chunks — las.CHUNK; no memory bound on
# Windows without a Job Object). MA-4h, Kladno (250.5 M points): a 4 % sample, 8.42 M after the voxel; the job 157 s in memory (216 s live) and 1.70 GB private
# at peak (0.76 GB of it numpy's OpenBLAS buffers, one per thread); at 0.3.0's knobs 181 s live and 1.93 GB peak private (job-0002); at 0.4.0 200 s, 1.93 GB (job-0003).
# Raise it only if wall F1 shows walls lost to sparsity — MA-4h-3 measured none: at 50 mm, completeness 0.40 stays over correctness 0.32.
MAX_POINTS = 10_000_000
# ponytail: one building per job — the Hough accumulator is 360 x (2 x span / CELL) votes, ~170 MB at 300 m (twice, with bincount's);
# a site, a campus or a long infrastructure scan waits for tiled slices (not built: MA-4h's Kladno is 67 m across).
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
    if not len(P):  # an E57 whose every point is marked invalid or not finite
        raise las.Refused("no valid point was read")
    span = float(np.ptp(P[:, :2], axis=0).max())
    if span > MAX_SPAN:
        raise las.Refused(f"the scans span {span / 1000:.0f} m in plan — sentinel-survey reads one building (at most "
                          f"{MAX_SPAN / 1000:.0f} m across); admit each building's scans to a project of its own")
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
    ponytail: the Hough transform runs again after each face over the cells left (faces x cells x 360 votes) — MA-4h, Kladno's ground
    storey at 0.2.0's knobs: 70 103 cells, 420 walls, 129 s of the job's 157 s in memory; tile the slice if a storey nears JOB_MS."""
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
        alive &= ~(np.abs((C - c) @ n) <= CLEAR * CELL)
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


def occupancy(Q, seg, z0, z1):
    """MA-5a: the (height, along) occupancy of face seg between z0 and z1 — GRID mm cells, True where a point of Q (mm) lies within
    2 x CELL of the face; row 0 is the floor's, column 0 the face's start. Computed once per kept face (measure stores it as x["grid"])
    and read three times: the height share, the holes, the merge. ponytail: a cell is filled by one point; an occluder (a cupboard) and
    a true opening both read as empty cells — the hole's border says how credible it is, nothing more."""
    a, b = np.array(seg[:2]), np.array(seg[2:])
    L = float(np.linalg.norm(b - a))
    u = (b - a) / L
    R = Q[:, :2] - a
    t, d = R @ u, R @ np.array([-u[1], u[0]])
    k = (t > 0) & (t < L) & (np.abs(d) <= 2 * CELL)
    nr, nc = max(1, int((z1 - z0) / GRID)), max(1, math.ceil(L / GRID))
    g = np.zeros((nr, nc), bool)
    g[np.minimum(((Q[k, 2] - z0) // GRID).astype(np.int64), nr - 1), np.minimum((t[k] // GRID).astype(np.int64), nc - 1)] = True
    return g


def height_share(g):
    """The share of a face's height rows holding a point (MA-4h-4's rule, on the grid)."""
    return float(g.any(axis=1).mean())


def holes(g):
    """MA-5a: the empty rectangles of a face's grid, at least OPEN_W x OPEN_H cells: [(c0, c1, r0, r1, border, cells)], c1 and r1
    exclusive; border is the share of the filled cells on the rectangle's sides inside the grid, cells their count. Row by row from the
    floor, each empty run of >= OPEN_W cells joins the hole below it whose columns it overlaps by more than half (the columns'
    intersection), else starts one; then each side grows across a line under half filled. A hole open at the face's start or end is
    not an opening: a face ends where the mid-storey slice leaves the wall, so an opening there ends the face, it is no hole in it
    (Kladno: all 11 such holes were false, their borders 0.5 to 1.0 with the open side skipped — review).
    ponytail: greedy, bottom-up — an L-shaped hole is its lower box, an arch its rectangle; two holes of one face grown into one box are
    not deduplicated (none on Kladno or the drill's seeds) — they would read as one opening seen on both faces."""
    nr, nc = g.shape
    # a filled cell with at most SPECK of its 8 neighbours filled is a speck — stray points, not the face: it does not close a hole (one
    # pair in a doorway split the drill door's run and shrank it from 1000 to 750 mm); a wall's own cells have 5 or more, its edge 3.
    # ponytail: any line one cell thick is specks too — a transom, a mullion or a cable across an opening is seen through, and so is a
    # one-row lintel at the grid's top (the door's hole runs to the top: its head reads high) or a one-cell pier (two windows read as one)
    pad = np.pad(g, 1)
    nb = sum(pad[1 + dr:1 + dr + nr, 1 + dc:1 + dc + nc].astype(np.int64) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc)
    g = g & (nb > SPECK)
    live, done = [], []
    for r in range(nr):
        runs, c = [], 0
        while c < nc:
            if g[r, c]:
                c += 1
                continue
            e = c
            while e < nc and not g[r, e]:
                e += 1
            if e - c >= OPEN_W:
                runs.append((c, e))
            c = e
        used, nxt = [False] * len(runs), []
        for c0, c1, r0 in live:
            best = None
            for i, (p, q) in enumerate(runs):
                ov = min(c1, q) - max(c0, p)
                if not used[i] and ov > 0.5 * min(c1 - c0, q - p) and (best is None or ov > best[0]):
                    best = (ov, i)
            if best is None:
                done.append((c0, c1, r0, r))
            else:
                used[best[1]] = True
                p, q = runs[best[1]]
                nxt.append((max(c0, p), min(c1, q), r0))
        nxt += [(p, q, r) for i, (p, q) in enumerate(runs) if not used[i]]
        live = nxt
    done += [(c0, c1, r0, nr) for c0, c1, r0 in live]
    out = []
    for c0, c1, r0, r1 in done:
        if r1 - r0 < OPEN_H:
            continue
        # MA-5a (review): a stray cell beside a jamb or under the lintel keeps the wall's 3 cells as neighbours (it is no speck) and the
        # intersection above narrowed every row of the hole to the columns past it — its side became the door's own near-empty column and
        # its border collapsed, or it fell under OPEN_W (4 of 10 seeds of the test's building lost the door or saw it on one face). Each
        # side grows across a line under half filled, and OPEN_W is read after it: every row of a hole held a run of OPEN_W.
        while c0 > 0 and g[r0:r1, c0 - 1].mean() < 0.5:
            c0 -= 1
        while c1 < nc and g[r0:r1, c1].mean() < 0.5:
            c1 += 1
        while r0 > 0 and g[r0 - 1, c0:c1].mean() < 0.5:
            r0 -= 1
        while r1 < nr and g[r1, c0:c1].mean() < 0.5:
            r1 += 1
        if c1 - c0 < OPEN_W or c0 == 0 or c1 == nc:
            continue
        cells = filled = 0
        for rr0, rr1, cc0, cc1 in ((r0 - 1, r0, c0, c1), (r1, r1 + 1, c0, c1), (r0, r1, c0 - 1, c0), (r0, r1, c1, c1 + 1)):
            if rr0 >= 0 and rr1 <= nr:  # a door's floor side and a hole's top at the grid's top are not counted
                sub = g[rr0:rr1, cc0:cc1]
                cells += sub.size
                filled += int(sub.sum())
        out.append((c0, c1, r0, r1, filled / cells if cells else 0.0, cells))
    return out


def wall_openings(two, line, zf, top):
    """MA-5a: a wall's doors and windows → [(kind, a0, a1, lo, hi, border, cells, seen)]: a0..a1 along its centreline line (x1, y1, x2,
    y2) from its start, lo and hi the sill (a door's floor) and head heights (mm, the scan's z). Each face's holes are placed along the
    centreline (a face sits half a thickness off it); a hole on one face overlapping one on the other by more than half along is one
    opening seen on both faces; a hole seen on one face only is kept with seen 1 and the border it has (an occluder reads the same — the
    bridge never pre-ticks it); an opening whose border is under MIN_BORDER is dropped."""
    x1, y1, x2, y2 = line
    L = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    found = []
    for x in two:
        fa = np.array(x["seg"][:2])
        fu = (np.array(x["seg"][2:]) - fa) / x["len"]
        for c0, c1, r0, r1, border, cells in holes(x["grid"]):
            # each jamb at the middle of its boundary cell: a cell holding a few points reads as wall, so the empty cells alone
            # undershoot the opening by up to a cell a side; the middle is unbiased (+-GRID/2 an edge)
            p0 = fa + fu * max(0.0, (c0 - 0.5) * GRID)
            p1 = fa + fu * min(x["len"], (c1 + 0.5) * GRID)
            a0, a1 = sorted(((p0[0] - x1) * ux + (p0[1] - y1) * uy, (p1[0] - x1) * ux + (p1[1] - y1) * uy))
            found.append([a0, a1, r0, r1, border, cells, 1])
    openings = []
    for h in sorted(found, key=lambda h: h[0]):
        for o in openings:
            if min(o[1], h[1]) - max(o[0], h[0]) > 0.5 * min(o[1] - o[0], h[1] - h[0]):
                # MA-5a (review): the two faces' grids start at different points along the wall, so each reads a jamb to +-GRID/2 at a
                # different place — their union read the drill's 1000 door as 1054 (its Size W1100). The same count of cells: the jambs'
                # mean. One cell more on one face: its cells met the opening's edges, a boundary cell holding a sliver of wall read as
                # empty — the narrower face is the reading (every door and window of the test's and the drill's buildings, 12 seeds each,
                # to the mm; Kladno's score unchanged). More apart (a stray or an occluder on one face): the better-framed face's reading.
                dw = (h[1] - h[0]) - (o[1] - o[0])
                if abs(dw) <= 1.5 * GRID:
                    if abs(dw) <= 0.5 * GRID:
                        o[0], o[1] = (o[0] + h[0]) / 2, (o[1] + h[1]) / 2
                    elif dw < 0:
                        o[0], o[1] = h[0], h[1]
                    o[2], o[3] = min(o[2], h[2]), max(o[3], h[3])
                elif h[4] > o[4]:
                    o[0], o[1], o[2], o[3] = h[0], h[1], h[2], h[3]
                o[4], o[5], o[6] = (o[4] * o[5] + h[4] * h[5]) / (o[5] + h[5]), o[5] + h[5], 2
                break
        else:
            openings.append(h)
    out = []
    for a0, a1, r0, r1, border, cells, seen in openings:
        if border < MIN_BORDER:
            continue
        kind = "door" if r0 <= DOOR_ROWS else "window"
        # the sill and head at the middle of their boundary rows, as the jambs; a door runs down to the floor
        lo = zf if kind == "door" else zf + HEIGHT_EDGE + (r0 - 0.5) * GRID
        hi = min(top - HEIGHT_EDGE, zf + HEIGHT_EDGE + (r1 + 0.5) * GRID)
        out.append((kind, a0, a1, lo, hi, border, cells, seen))
    return out


def merge_split(P, Q, fs, z0, z1):
    """MA-5a (a wall rule, recorded under MA-4h's design row): two kept faces on one line (within 1 deg and CELL across) with an
    end-to-start gap of at most MERGE_GAP are one face when a lintel bridges the gap — in the joined grid, the gap's columns above
    their hole hold at least LINTEL of their cells. P: the cloud (the faces' points index it); Q: the storey's points for the grid.
    ponytail: a doorway with nothing scanned above it (a glazed head, an open top) stays two faces and two walls; a nib under
    MIN_FACE beside a door was never a face, so it is not merged (pipeline.py MIN_FACE)."""
    fs = sorted(fs, key=lambda x: -x["len"])
    tried, changed = set(), True
    while changed:
        changed = False
        for i in range(len(fs)):
            for j in range(i + 1, len(fs)):
                a, b = fs[i], fs[j]
                ua = np.array(a["seg"][2:]) - np.array(a["seg"][:2])
                ub = np.array(b["seg"][2:]) - np.array(b["seg"][:2])
                ua, ub = ua / np.linalg.norm(ua), ub / np.linalg.norm(ub)
                if abs(float(ua @ ub)) < math.cos(math.radians(1)):
                    continue
                na = np.array([-ua[1], ua[0]])
                if abs(float((np.array(b["seg"][:2]) - np.array(a["seg"][:2])) @ na)) > CELL:
                    continue
                ta = sorted([0.0, float((np.array(a["seg"][2:]) - np.array(a["seg"][:2])) @ ua)])
                tb = sorted([float((np.array(b["seg"][:2]) - np.array(a["seg"][:2])) @ ua), float((np.array(b["seg"][2:]) - np.array(a["seg"][:2])) @ ua)])
                gap = max(ta[0], tb[0]) - min(ta[1], tb[1])
                if gap <= 0 or gap > MERGE_GAP:
                    continue
                key = (a["seg"], b["seg"])  # MA-5a (review): the verdict hangs on the two lines alone — a pair that failed fails again
                if key in tried:
                    continue
                tried.add(key)
                lo, hi = min(ta[0], tb[0]), max(ta[1], tb[1])
                o = np.array(a["seg"][:2])
                seg = (*(o + ua * lo), *(o + ua * hi))
                g = occupancy(Q, seg, z0, z1)
                gc0, gc1 = int((min(ta[1], tb[1]) - lo) // GRID) + 1, int((max(ta[0], tb[0]) - lo) // GRID)
                if gc1 <= gc0:
                    continue
                B = g[:, gc0:gc1]
                empty = np.flatnonzero(~B.any(axis=1))  # the gap's hole: its rows with no point (a door's from the floor, a window's over a sill)
                top = int(empty.max()) + 1 if empty.size else 0  # the rows above the hole are the lintel's
                if top >= B.shape[0] or float(B[top:].mean()) < LINTEL:
                    continue
                pts = np.concatenate([a["points"], b["points"]])
                cr, dr, _ = fit_line(P[pts, :2])
                tr = (P[pts, :2] - cr) @ dr
                p, q = cr + dr * tr.min(), cr + dr * tr.max()
                ln = float(tr.max() - tr.min())
                res = (P[pts, :2] - cr) @ np.array([-dr[1], dr[0]])
                fs[i] = {"seg": (float(p[0]), float(p[1]), float(q[0]), float(q[1])), "len": ln, "points": pts, "rmse": rms(res),
                         "coverage": min(1.0, np.unique(np.floor((tr - tr.min()) / 100)).size / max(1, math.ceil(ln / 100))),
                         "grid": occupancy(Q, (float(p[0]), float(p[1]), float(q[0]), float(q[1])), z0, z1)}
                del fs[j]
                changed = True
                break
            if changed:
                break
    return fs


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
        # MA-4h-4, Kladno: a face in the mid-storey slice is a wall only if it runs the storey's height — a sofa back, a counter or a
        # cupboard reads as a face in the slice but stops short (GF: 183 false positives, half of them under 0.5 of the height).
        # Measured on the reference at 100 mm: GF F1 0.116 -> 0.154, 1F (held out) 0.330 -> 0.372, true walls kept 0.93 / 0.94.
        # The floor's and ceilings' outlines (outline below) are cut by the kept faces only: a counter no longer trims a floor.
        # ponytail: a half-height wall (a parapet, a dwarf wall under glazing) is not proposed — a person draws it.
        st = P[(P[:, 2] > zf + HEIGHT_EDGE) & (P[:, 2] < top - HEIGHT_EDGE)]
        z0, z1 = zf + HEIGHT_EDGE, top - HEIGHT_EDGE
        for x in fs:
            x["grid"] = occupancy(st, x["seg"], z0, z1)
            x["points"] = sl[x["points"]]
        fs = [x for x in fs if height_share(x["grid"]) >= MIN_HEIGHT]
        fs = merge_split(P, st, fs, z0, z1)  # MA-5a: a face broken at a doorway by MAX_GAP is one wall when a lintel bridges the gap
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
            # MA-5a: the wall's openings (wall_openings); direction is the host's unit vector to 4 places (review: whole numbers made a
            # 45 deg wall's [1, 1], sqrt 2 long, and a 30 deg wall's [1, 0], which reference.score's 5 deg match rejects)
            L = math.hypot(x2 - x1, y2 - y1)
            ux, uy = (x2 - x1) / L, (y2 - y1) / L
            for m, (kind, a0, a1, lo, hi, border, cells, seen) in enumerate(wall_openings(two, (x1, y1, x2, y2), zf, top), 1):
                mid = (a0 + a1) / 2
                out.append({"cid": f"scan-{name}-wall-{n}-{kind}-{m}", "kind": kind,
                            "geometry": {"host": f"scan-{name}-wall-{n}", "storey": lv, "direction": [round(ux, 4), round(uy, 4)],
                                         "Location": [r(x1 + ux * mid), r(y1 + uy * mid), r(zf)], "along_mm": r(mid)},
                            "measured": {"width_mm": r(a1 - a0), "height_mm": r(hi - lo), "sill_mm": 0 if kind == "door" else r(lo - zf),
                                         "head_mm": r(hi - zf)},
                            "evidence": refs(pts, f"slice-{name}"),
                            "fit": {"inliers": int(cells), "rmse_mm": 0.0, "coverage": round(border, 3), "faces_seen": seen}})
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
    ponytail: each face is a pass over the cloud cropped to the elements' box (faces x points) — MA-4h, Kladno: 200 walls (400
    faces) over a whole storey in 21 s, under the job's 1.70 GB peak; a plan-grid index if a measure nears JOB_MS. Clutter, or an element
    not placed, within BAND of a face's interior counts against it (the honest reading: the scan is not the model)."""
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
