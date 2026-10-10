# MA-4h — wall F1 and the level error of a survey job against a hand-built reference (design Drill MA4: "Measure wall F1 at 5, 10 and
# 20 cm against a hand-built reference, and the level error in mm"). Drill tooling, offline: the service never imports it; numpy and the
# standard library. A person traces walls on slice_png's images in survey/trace.html, never seeing the job's candidates; build() turns
# the traces into reference.json in the scan's own frame (mm); score() compares a job's result.json with it.
# ponytail: a plain LAS only (Kladno's format) — a LAZ or an E57 reference reads through las.read_points_mm when one needs it.
# Run from the repo root: "C:/Python314/python.exe" -B survey/reference.py zpeaks|slice|build|score ...
import hashlib
import json
import math
import struct
import sys
import zlib

import numpy as np

import las
import pipeline

PX = 20.0          # mm a pixel of a slice image
CUT = 1200.0       # mm above a storey's floor: Revit's plan cut, where the person reads the walls (the survey's own slice is mid-storey)
HALF = 300.0       # mm: a slice image is the cut +- this
BAND = 150.0       # mm: a floor sample reads the points within this of its storey's floor guess (not the ceiling below a thin slab, nor a table top)
STEP = 50.0        # mm between a wall's samples
ANGLE = 5.0        # degrees: a matched pair is at most this far apart in direction (pipeline.pair's tolerance)
MISSED = 1000.0    # mm: a reference storey with no candidate level this near is missed
DS = (50, 100, 200)  # mm: the design's 5, 10 and 20 cm


def chunks_mm(path):
    """Every point of a plain LAS in mm, las.CHUNK at a time (las._mm: the reader's own arithmetic) — never the whole cloud in memory."""
    head = las.read_header(path)
    if head["format"] != "las":
        raise las.Refused("the reference tools read a plain LAS")
    dt = np.dtype({"names": ["x", "y", "z"], "formats": ["<i4"] * 3, "offsets": [0, 4, 8], "itemsize": head["rec_len"]})
    rec = np.memmap(path, dtype=dt, mode="r", offset=head["offset"], shape=(head["count"],))
    try:
        for a in range(0, head["count"], las.CHUNK):
            part = rec[a:a + las.CHUNK]
            yield las._mm([part["x"], part["y"], part["z"]], head)
            del part
    finally:
        del rec  # Windows keeps a mapped file locked


def bounds(path):
    """The cloud's extent in mm from its points (a header's own bounds may be stale): (min x, y, z), (max x, y, z)."""
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for P in chunks_mm(path):
        lo, hi = np.minimum(lo, P.min(axis=0)), np.maximum(hi, P.max(axis=0))
    return lo, hi


def zpeaks(path, n=12):
    """The n fullest 10 mm height bins of the whole cloud, fullest first: [(z mm, points)] — where its floors and ceilings are."""
    lo, hi = bounds(path)
    h = np.zeros(int((hi[2] - lo[2]) // 10) + 1, np.int64)
    for P in chunks_mm(path):
        h += np.bincount(((P[:, 2] - lo[2]) // 10).astype(np.int64), minlength=len(h))
    return [(round(float(lo[2] + (k + 0.5) * 10)), int(h[k])) for k in np.argsort(-h, kind="stable")[:n]]


def png(g):
    """An 8-bit greyscale PNG of an h x w uint8 array — zlib and struct, no imaging library."""
    h, w = g.shape
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    raw = b"".join(b"\0" + g[r].tobytes() for r in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))


def slice_png(path, z0, z1):
    """Every point with z0 <= z <= z1 (mm) in plan, one PX mm pixel each, darker where denser (log scale); row 0 is the largest y and
    every image of one scan shares its origin. -> (PNG bytes, its side record {origin_mm: [x, y] of the top-left corner, px_mm, z_mm,
    size: [w, h], png_sha256})"""
    lo, hi = bounds(path)
    w, h = int((hi[0] - lo[0]) // PX) + 1, int((hi[1] - lo[1]) // PX) + 1
    n = np.zeros(w * h, np.int64)
    for P in chunks_mm(path):
        Q = P[(P[:, 2] >= z0) & (P[:, 2] <= z1)]
        u = ((Q[:, 0] - lo[0]) // PX).astype(np.int64)
        v = ((hi[1] - Q[:, 1]) // PX).astype(np.int64)
        n += np.bincount(v * w + u, minlength=w * h)
    g = (255 - 255 * np.log1p(n) / max(1.0, math.log1p(int(n.max())))).astype(np.uint8).reshape(h, w)
    data = png(g)
    return data, {"origin_mm": [float(lo[0]), float(hi[1])], "px_mm": PX, "z_mm": [z0, z1], "size": [w, h],
                  "png_sha256": hashlib.sha256(data).hexdigest()}


def to_mm(side, u, v):
    """A point of an image (u, v: pixels from its top-left corner, fractions kept) -> [x, y] mm in the scan's frame."""
    return [round(side["origin_mm"][0] + u * side["px_mm"], 1), round(side["origin_mm"][1] - v * side["px_mm"], 1)]


def floor_mm(path, near, rects):
    """A storey's reference floor height: in each rectangle (x0, y0, x1, y1 mm, the person's floor samples) the points within BAND of
    near (the floor's guess), their fullest 10 mm bin, the median of those within 25 mm of it; the storey's is the median of the
    rectangles'. -> (mm, [each rectangle's mm]); ValueError in words when there is no rectangle or one holds under 100 points."""
    if not rects:
        raise ValueError("no floor sample — draw three, in three rooms, on clear floor")
    box = [(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)) for x0, y0, x1, y1 in rects]
    zs = [[] for _ in box]
    for P in chunks_mm(path):
        P = P[np.abs(P[:, 2] - near) <= BAND]
        for k, (x0, y0, x1, y1) in enumerate(box):
            zs[k].append(P[(P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1), 2])
    each = []
    for k, z in enumerate(zs):
        z = np.concatenate(z)
        if len(z) < 100:
            raise ValueError(f"floor sample {k + 1} holds {len(z)} points within {BAND:.0f} mm of {near:.0f} mm — draw it on clear floor")
        peak = z.min() + (np.bincount(((z - z.min()) // 10).astype(np.int64)).argmax() + 0.5) * 10
        each.append(round(float(np.median(z[np.abs(z - peak) <= 25])), 1))
    return round(float(np.median(each)), 1), each


def build(path, storeys):
    """reference.json from the person's traces: storeys [{name, side (slice_png's record), trace (trace.html's JSON)}], lowest first.
    A wall line under 100 mm is a stray click, dropped; a storey with no wall line was not traced: walls null (its candidates are
    counted, not scored)."""
    out = []
    for s in storeys:
        side, tr = s["side"], s["trace"]
        if tr.get("image_sha256") != side["png_sha256"]:
            raise ValueError(f"{s['name']}: the trace was drawn on another image than its side record's")
        lines = [(x["kind"], to_mm(side, *x["a"]), to_mm(side, *x["b"])) for x in tr["lines"]]
        walls = [{"a": a, "b": b, "guessed": k == "guessed"} for k, a, b in lines if k in ("wall", "guessed") and math.dist(a, b) >= 100]
        ffl, each = floor_mm(path, side["z_mm"][0] + HALF - CUT, [(*a, *b) for k, a, b in lines if k == "floor"])
        out.append({"name": s["name"], "ffl_mm": ffl, "floor_samples_mm": each, "walls": walls or None, "cut_mm": side["z_mm"],
                    "origin_mm": side["origin_mm"], "image_sha256": side["png_sha256"], "side_sha256": s.get("side_sha256"),
                    "trace_sha256": s.get("trace_sha256"),
                    "traced_by": tr.get("traced_by"), "saved": tr.get("saved"), "minutes": tr.get("minutes")})
    with open(path, "rb") as f:
        sha = hashlib.file_digest(f, "sha256").hexdigest()
    return {"scan_sha256": sha, "storeys": out}


def load_storey(name, png_path):
    """One storey for build() from the disk: its image, side record (<png>.json) and the person's trace (<png>.trace.json), with the
    trace file's sha256 (the drill notes record it at the save). ValueError when the image's bytes are not the ones its side record
    was made from — an edited or swapped image. MA-4h: the side record's file sha256 too — png_sha256 does not cover its origin_mm, px_mm
    or z_mm, so an edited one would shift the storey silently; slice prints it, the notes record it, build stores it beside the trace's."""
    with open(png_path, "rb") as f:
        png_sha = hashlib.sha256(f.read()).hexdigest()
    with open(png_path + ".json", "rb") as f:
        side_raw = f.read()
    with open(png_path + ".trace.json", "rb") as f:
        raw = f.read()
    side = json.loads(side_raw)
    if png_sha != side["png_sha256"]:
        raise ValueError(f"{name}: the image is not the one its side record was made from — slice it again")
    return {"name": name, "side": side, "side_sha256": hashlib.sha256(side_raw).hexdigest(), "trace": json.loads(raw),
            "trace_sha256": hashlib.sha256(raw).hexdigest()}


def samples(s):
    """Points along segment s (x1, y1, x2, y2) every STEP mm or less, both ends included."""
    a, b = np.array(s[:2], float), np.array(s[2:], float)
    return a + np.linspace(0.0, 1.0, max(2, math.ceil(math.dist(s[:2], s[2:]) / STEP) + 1))[:, None] * (b - a)


def angle(s, t):
    u, v = np.subtract(s[2:], s[:2]), np.subtract(t[2:], t[:2])
    return math.degrees(math.acos(min(1.0, abs(float(u @ v)) / float(np.linalg.norm(u) * np.linalg.norm(v)))))


def match(C, R, d):
    """Candidate segments C to reference segments R at d mm, one to one: a pair is at most ANGLE apart and more than half of each one's
    samples lie within d of the other; pairs are taken greedily by the smaller of the two shares, highest first. -> [(i, j)]"""
    SC, SR, pairs = [samples(c) for c in C], [samples(r) for r in R], []
    for i, c in enumerate(C):
        for j, r in enumerate(R):
            if angle(c, r) <= ANGLE:
                q = min(float((pipeline.seg_dist(SC[i], r) <= d).mean()), float((pipeline.seg_dist(SR[j], c) <= d).mean()))
                if q > 0.5:
                    pairs.append((-q, i, j))
    took, ci, rj = [], set(), set()
    for _, i, j in sorted(pairs):
        if i not in ci and j not in rj:
            ci.add(i)
            rj.add(j)
            took.append((i, j))
    return took


def covered(segs, others, d):
    """(samples of segs within d of any of others, samples of segs) — a length share, STEP mm a sample."""
    P = np.concatenate([samples(s) for s in segs]) if segs else np.zeros((0, 2))
    if not len(P) or not others:
        return 0, len(P)
    best = np.min([pipeline.seg_dist(P, o) for o in others], axis=0)
    return int((best <= d).sum()), len(P)


def prf(n):
    p = n["tp"] / (n["tp"] + n["fp"]) if n["tp"] + n["fp"] else 0.0
    r = n["tp"] / (n["tp"] + n["fn"]) if n["tp"] + n["fn"] else 0.0
    return {"p": round(p, 3), "r": round(r, 3), "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0}


def level_error(cands, ref):
    """Each reference storey takes the nearest candidate level within MISSED, nearest pairs first, one to one; its error is the level's
    BaseElevation - ffl_mm (signed, mm). A storey with none is missed; a level matched to none is extra.
    -> ({storey name: level cid}, {storeys: [{name, ffl_mm, level, e_mm}], missed, extra})"""
    levels = {c["cid"]: c["geometry"]["BaseElevation"] for c in cands if c["kind"] == "level"}
    near = sorted((abs(z - s["ffl_mm"]), s["name"], cid) for s in ref["storeys"] for cid, z in levels.items() if abs(z - s["ffl_mm"]) <= MISSED)
    of = {}
    for _, name, cid in near:
        if name not in of and cid not in of.values():
            of[name] = cid
    rows = [{"name": s["name"], "ffl_mm": s["ffl_mm"], "level": of.get(s["name"]),
             "e_mm": round(levels[of[s["name"]]] - s["ffl_mm"], 1) if s["name"] in of else None} for s in ref["storeys"]]
    return of, {"storeys": rows, "missed": [r["name"] for r in rows if r["level"] is None], "extra": sorted(set(levels) - set(of.values()))}


def score(cands, ref):
    """Wall F1 at DS against the reference. Scored: each traced storey's walls against its matched level's candidate walls (all false
    negatives when it was missed), and an extra level's candidate walls (false positives: a person would delete them). A storey not
    traced (walls null) has its level's candidates counted, not scored. A candidate with no thickness_mm is one face, half a thickness off
    its centreline: its true positives are counted apart (tp_unpaired). completeness: the share of reference length within d of a
    candidate; correctness: the share of candidate length within d of a reference wall.
    -> {levels: level_error's, walls: {d: {tp, fp, fn, tp_unpaired, p, r, f1, completeness, correctness, storeys: {name: {...}}}}, not_scored}"""
    of, levels = level_error(cands, ref)
    walls = {}
    for c in cands:
        if c["kind"] == "wall":
            walls.setdefault(c["geometry"]["storey"], []).append(c)
    seg = lambda c: (*c["geometry"]["LocationCurve"]["start"][:2], *c["geometry"]["LocationCurve"]["end"][:2])
    groups = [(s["name"], [(*w["a"], *w["b"]) for w in s["walls"]], walls.get(of.get(s["name"]), [])) for s in ref["storeys"] if s["walls"] is not None]
    groups += [(cid, [], walls.get(cid, [])) for cid in levels["extra"]]
    out = {}
    for d in DS:
        total, per, cov = dict.fromkeys(("tp", "fp", "fn", "tp_unpaired"), 0), {}, [0, 0, 0, 0]
        for name, R, C in groups:
            S = [seg(c) for c in C]
            m = match(S, R, d)
            row = {"tp": len(m), "fp": len(C) - len(m), "fn": len(R) - len(m), "tp_unpaired": sum("thickness_mm" not in C[i]["measured"] for i, _ in m)}
            per[name] = {**row, **prf(row)}
            for k in total:
                total[k] += row[k]
            for k, n in enumerate((*covered(R, S, d), *covered(S, R, d))):
                cov[k] += n
        out[d] = {**total, **prf(total), "completeness": round(cov[0] / cov[1], 3) if cov[1] else None,
                  "correctness": round(cov[2] / cov[3], 3) if cov[3] else None, "storeys": per}
    not_scored = {of[s["name"]]: len(walls.get(of[s["name"]], [])) for s in ref["storeys"] if s["walls"] is None and s["name"] in of}
    return {"levels": levels, "walls": out, "not_scored": not_scored}


def main(argv):
    cmd, a = argv[1] if len(argv) > 1 else "", argv[2:]  # MA-4h: no command is the usage line below, not an IndexError
    if cmd == "zpeaks":  # <las>
        for z, n in zpeaks(a[0]):
            print(z, n)
    elif cmd == "slice":  # <las> <the storey's floor guess, mm> <out.png>: the cut CUT above it, +- HALF; its side record as <out.png>.json
        data, side = slice_png(a[0], float(a[1]) + CUT - HALF, float(a[1]) + CUT + HALF)
        raw = json.dumps(side).encode("utf-8")
        with open(a[2], "wb") as f:
            f.write(data)
        with open(a[2] + ".json", "wb") as f:
            f.write(raw)
        print(json.dumps({**side, "side_sha256": hashlib.sha256(raw).hexdigest()}))  # MA-4h: the notes record it; build stores it
    elif cmd == "build":  # <las> <out.json> <name>=<png> ... lowest first; each png beside <png>.json (its side) and <png>.trace.json
        storeys = [load_storey(n, p) for n, p in (x.split("=", 1) for x in a[2:])]
        with open(a[1], "w", encoding="utf-8") as f:
            json.dump(build(a[0], storeys), f, indent=1)
    elif cmd == "score":  # <result.json> <reference.json>
        with open(a[0], encoding="utf-8") as f, open(a[1], encoding="utf-8") as g:
            print(json.dumps(score(json.load(f)["candidates"], json.load(g)), indent=1))
    else:
        sys.exit("reference.py zpeaks|slice|build|score — see the header")


if __name__ == "__main__":
    main(sys.argv)
