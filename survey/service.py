# MA-4c — sentinel-survey 0.1 (design §6.9): the service the bridge starts for ONE survey job and stops after it
# (WebApp/bridge/survey-service.mjs). It listens on 127.0.0.1 only, on a port it picks (one JSON line on stdout), answers only the
# bridge's per-start token, makes no network call, writes no file (its result goes back over HTTP and the bridge keeps it), re-hashes
# every input before the read (a changed one is refused) and after it (a change during the read fails the job), does no typing, never writes the ledger, never talks to Revit — and exits when the bridge does
# (its stdin closes, a hard kill too). numpy and the standard library at start; MA-4g: laspy (with lazrs) and pye57 only inside the read
# of a LAZ or an E57 (las.lib, at las.PINS, from their private folder las.LIB). Run: python -E -B service.py (never -I: numpy is in the
# user site).
# MA-4e: POST /measure — a job's own cloud read again and measured against a placed changeset's faces (numbers only; the bridge judges).
# MA-4f: POST /cloud — a job's own cloud read again, cut to a band and thinned for Revit's overlay (numbers only; the bridge moves them into the model's frame).
import hashlib
import hmac
import json
import math
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import las
import pipeline

VERSION = "0.2.0"  # MA-4g: LAZ, E57 and the CRS. A job read by 0.1.0 is proposed and overlaid as before; a measure of one fails in words (changesets-store verify)
TOKEN = os.environ.get("SENTINEL_SURVEY_TOKEN", "")
MAX_BODY = 1 << 20
# ponytail: one file is at most 300 million points: it is hashed twice and read in chunks, which must fit the bridge's 10 min job limit.
# The Kladno scan (MA-4h) has 250.5 million points (LAS 1.2, format 2, 6.5 GB); MA-4h measures its run time against that limit and
# sets this cap.
MAX_POINTS_IN = 300_000_000
MAX_ELEMENTS = 200  # MA-4e: a changeset holds at most 200 elements (changesets-logic MAX_CHANGESET_ELEMENTS)
MAX_FACES = 12      # per element: a wall sends two
MAX_CLOUD = 100_000  # MA-4f: the most overlay points a body may ask (the bridge asks 5 000)
JOB = {}  # this process's one job: {id, status, stage, pct, refused, error?, result?}
LOCK = threading.Lock()


# MA-4g: what a pinned wheel (las.PINS) carries that its metadata does not declare — listed only when the wheel is at its pin
# (ponytail: read by hand from these wheel versions; a new wheel is a new download OK, and a re-read).
INSIDE = {"lazrs": [("laz (in lazrs)", "0.12.2", "Apache-2.0")],  # its SBOM; the other crates are MIT or Apache-2.0
          "pye57": [("libE57Format (in pye57)", "bundled", "BSL-1.0"), ("Xerces-C++ (in pye57)", "3.2.3", "Apache-2.0")]}


def tools():
    """Each tool with the licence its package declares (the build:run receipt lists them, design §6.10); MA-4g's wheels when INSTALLED —
    not a statement that this job used them (a LAS-only job lists them too). Read from metadata, never imported here."""
    import importlib.metadata
    import platform
    import numpy
    las.add_lib()  # MA-4g: the wheels' private folder (las.LIB) on sys.path, so their metadata is found where las.lib imports them
    declared = lambda md: md.get("License-Expression") or md.get("License") or "not declared"
    out = [{"name": "sentinel-survey", "version": VERSION, "licence": "LicenseRef-Sentinel"},
           {"name": "python", "version": platform.python_version(), "licence": "PSF-2.0"},
           {"name": "numpy", "version": numpy.__version__, "licence": declared(importlib.metadata.metadata("numpy"))}]
    for name, pin in las.PINS.items():
        try:
            md = importlib.metadata.metadata(name)
        except importlib.metadata.PackageNotFoundError:
            continue
        out.append({"name": name, "version": md["Version"], "licence": declared(md)})
        if md["Version"] == pin:  # at another version las.lib refuses it, and what it carries is not known
            out += [{"name": n, "version": v, "licence": lic} for n, v, lic in INSIDE.get(name, [])]
    return out


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check(item):
    """(its header, None) when the item is read, else (None, why not in words).
    ponytail: hashed before the read and again after it (run) — a change made and undone inside the read is not caught; a read lock
    on the file (MA-4h) closes that if it ever matters."""
    if item["kind"] != "scan":
        return None, f"a {item['kind']} is not surveyed by sentinel-survey (scans only)"
    try:
        if sha256(item["path"]) != item["sha256"]:
            return None, "changed since admitted (its sha256 is not the pack's) — Re-check flags it"
        head = las.read_header(item["path"])
        if head["count"] > MAX_POINTS_IN:
            return None, f"{head['count']:,} points — sentinel-survey reads at most {MAX_POINTS_IN:,} in one file; a larger scan waits for MA-4h"
        return head, None
    except las.Refused as e:
        return None, str(e)
    except OSError as e:
        return None, f"not read ({e.strerror or type(e).__name__})"  # strerror names no path


def input_of(item):
    """MA-4g: what was read of one item, for the receipt — its format by its bytes (a .laz holding a plain LAS reads "las"), its points, its
    CRS and units, and an E57's scans (each its points and whether it is posed). Numbers and fixed words: no path, no name."""
    h = item["head"]
    e57 = h.get("format") == "e57"
    crs = h.get("crs")
    units = ("metres (E57)" if e57 else "metres assumed (no CRS read)" if not crs else "metres (its CRS)" if crs["unit"] == "metre"
             else "metres assumed (its CRS's unit not stated)")
    return {"id": item["id"], "format": h.get("format", "las"), "points": int(h["count"]), "crs": crs, "units": units,
            **({"scans": [{"points": s["points"], "posed": s["posed"]} for s in h["scans"]]} if e57 else {})}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def run(job):
    started, cpu0 = now(), time.process_time()
    measuring = "elements" in job or "cloud" in job  # MA-4e, MA-4f: a job's cloud read again — every item it read must be read again, or nothing is read
    try:
        JOB.update(status="running", stage="hashing", pct=5)
        ok = []
        for item in job["items"]:
            head, why = check(item)
            if why:
                JOB["refused"].append({"id": item["id"], "reason": why})
            else:
                ok.append({**item, "head": head})
        if not ok or (measuring and JOB["refused"]):
            JOB.update(status="refused", stage="done", pct=100)
            return
        def progress(stage, pct):
            JOB.update(stage=stage, pct=pct)
        if "cloud" in job:  # MA-4f: the overlay's points (the bridge cuts the band and moves them into the model's frame)
            P, _, points_in = pipeline.load(ok, job["params"], job["seed"], progress)
            c = job["cloud"]
            Q, cell, of = pipeline.thin(P, c["z_mm"], c["cell_mm"], c["max_points"])
            out = {"points": Q.tolist(), "derived": []}
            stats = {"points_in": int(points_in), "points_used": int(len(P)),
                     "cloud": {"cell_mm": int(cell), "z_mm": c["z_mm"], "of": int(of), "points": int(len(Q))}}
        elif measuring:
            P, _, points_in = pipeline.load(ok, job["params"], job["seed"], progress)
            tol = job["params"]["tolerances_mm"]
            out = {"elements": pipeline.deviation(P, job["elements"], tol, progress), "derived": []}
            stats = {"points_in": int(points_in), "points_used": int(len(P)),
                     "measure": {"band_mm": 2 * max(tol), "edge_mm": pipeline.EDGE, "cell_mm": pipeline.DEV_CELL}}
        else:
            candidates, stats = pipeline.survey(ok, job["params"], job["seed"], progress)
            out = {"candidates": candidates, "derived": []}
        JOB.update(stage="re-hashing", pct=95)  # a file changed during the read: what was measured is not what was admitted
        moved = [i["id"] for i in ok if sha256(i["path"]) != i["sha256"]]
        if moved:
            JOB.update(status="failed", error=f"{', '.join(moved)} changed while {'it was' if len(moved) == 1 else 'they were'} read"
                                              " — nothing it found was kept")
            return
        JOB["result"] = {**out, "receipt": {
            "tools": tools(), "params": job["params"], "seed": job["seed"], "started": started, "finished": now(),
            "cpu_s": round(time.process_time() - cpu0, 2), **stats, "inputs": [input_of(i) for i in ok]}}
        JOB.update(status="done", stage="done", pct=100)
    # The job fails in words; the service stays up for the bridge to read it. The error goes into job.json, every viewer's read over
    # the Funnel and the build:run row in the hosted ledger, so it names no path (a Windows path carries the user's name): the
    # traceback goes to stderr, which only the bridge log sees.
    except las.Refused as e:  # the job's own words (one building at most)
        JOB.update(status="failed", error=str(e))
    except OSError as e:  # a file gone or locked after its hash
        traceback.print_exc()
        JOB.update(status="failed", error=f"a scan was not read ({e.strerror or type(e).__name__}) — nothing it found was kept")
    except Exception as e:
        traceback.print_exc()
        JOB.update(status="failed", error=f"{type(e).__name__}: {e}"[:500])


def read_job(b):
    """POST /jobs's body, or ValueError in words (the bridge sends the contract; this is its own check)."""
    if not isinstance(b, dict) or not isinstance(b.get("job_id"), str):
        raise ValueError("job_id is required")
    items = b.get("items")
    if not isinstance(items, list) or not items or not all(
            isinstance(i, dict) and all(isinstance(i.get(k), str) for k in ("id", "kind", "path", "sha256")) for i in items):
        raise ValueError("items must be [{id, kind, path, sha256}]")
    p = b.get("params")
    if not isinstance(p, dict):
        raise ValueError("params must be an object")
    for k, lo, hi in (("voxel_mm", 5, 50), ("storey_min_mm", 1500, 6000)):  # voxel: a wall face needs a point at least every 50 mm
        if not isinstance(p.get(k), int) or not lo <= p[k] <= hi:
            raise ValueError(f"params.{k} must be a whole number from {lo} to {hi}")
    if not isinstance(b.get("seed"), int):
        raise ValueError("seed must be a whole number")
    return {"job_id": b["job_id"], "items": items, "params": p, "seed": b["seed"]}


def rectangle(f):
    """MA-4e: a face [p0, p1, p3] — three points of three numbers within 2e10 mm (MA-4h: a national grid — Kladno's y is about -1.0355e9,
    a UTM northing reaches 1e10; finite: a NaN, an infinity or an int past float range fails the bound, never raises), both sides at least
    1 mm, square at p0."""
    if not (isinstance(f, list) and len(f) == 3 and all(isinstance(p, list) and len(p) == 3 and all(
            isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= 2e10 for x in p) for p in f)):
        return False
    a, b = [f[1][k] - f[0][k] for k in range(3)], [f[2][k] - f[0][k] for k in range(3)]
    la, lb = math.hypot(*a), math.hypot(*b)
    return la >= 1 and lb >= 1 and abs(sum(x * y for x, y in zip(a, b))) <= 1e-3 * la * lb


def read_measure(b):
    """MA-4e: POST /measure's body — a job's (read_job: the job's own items, params and seed, so the cloud is the one its candidates came
    from) plus params.tolerances_mm and the elements, each its faces in the scan's frame; or ValueError in words."""
    m = read_job(b)
    t = m["params"].get("tolerances_mm")
    if not (isinstance(t, list) and 1 <= len(t) <= 5 and all(isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= 1000 for x in t)
            and t == sorted(set(t))):
        raise ValueError("params.tolerances_mm must be 1 to 5 whole numbers of mm from 1 to 1000, rising")
    els = b.get("elements")
    if not isinstance(els, list) or not 1 <= len(els) <= MAX_ELEMENTS:
        raise ValueError(f"elements must be 1 to {MAX_ELEMENTS} [{{guid, faces}}]")
    seen = set()
    for n, e in enumerate(els):
        if not isinstance(e, dict) or not isinstance(e.get("guid"), str) or not 0 < len(e["guid"]) <= 128 or e["guid"] in seen:
            raise ValueError(f"elements[{n}].guid must be a text of 1 to 128 characters, each once")
        seen.add(e["guid"])
        fs = e.get("faces")
        if not isinstance(fs, list) or not 1 <= len(fs) <= MAX_FACES or not all(rectangle(f) for f in fs):
            raise ValueError(f"elements[{n}].faces must be 1 to {MAX_FACES} rectangles [p0, p1, p3] of [x, y, z] mm — both sides at least 1 mm, square at p0")
    return {**m, "elements": els}


def read_cloud(b):
    """MA-4f: POST /cloud's body — a job's (read_job: its own items, params and seed, so the cloud is the one its candidates came from) plus
    cloud {cell_mm, z_mm: [low, high], max_points}; or ValueError in words."""
    m = read_job(b)
    c = b.get("cloud")
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) <= 1e9  # a NaN fails the bound
    whole = lambda v, lo, hi: isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi
    if not (isinstance(c, dict) and whole(c.get("cell_mm"), 20, 1000) and whole(c.get("max_points"), 8, MAX_CLOUD)  # 8: thin's doubling ends
            and isinstance(c.get("z_mm"), list) and len(c["z_mm"]) == 2 and all(num(z) for z in c["z_mm"]) and c["z_mm"][0] < c["z_mm"][1]):
        raise ValueError(f"cloud must be {{cell_mm: 20 to 1000, z_mm: [low, high] mm, max_points: 8 to {MAX_CLOUD}}}")
    return {**m, "cloud": {"cell_mm": c["cell_mm"], "z_mm": c["z_mm"], "max_points": c["max_points"]}}


class Server(ThreadingHTTPServer):
    """Port 0 never needs reuse: HTTPServer's SO_REUSEADDR is turned off, so this listener asks for no shared port.
    ponytail: SO_EXCLUSIVEADDRUSE is not set (it needs `socket`, which the no-client test keeps out): a process of the same Windows
    account could still bind over the port — that account can already read this process's environment (the token) and the evidence
    files; set it if the service ever runs under an account of its own."""
    allow_reuse_address = False
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    timeout = 10  # s: an idle local connection does not hold a thread for the life of the job

    def log_message(self, *args):
        pass  # the bridge logs; nothing here is printed

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        if TOKEN and hmac.compare_digest(self.headers.get("Authorization", "").encode(), f"Bearer {TOKEN}".encode()):
            return True
        self.reply(401, {"message": "not the bridge's token"})
        return False

    def do_GET(self):
        if not self.allowed():
            return
        parts = self.path.strip("/").split("/")
        if parts == ["health"]:
            return self.reply(200, {"version": VERSION, "tools": tools()})
        if len(parts) in (2, 3) and parts[0] == "jobs" and JOB.get("id") == parts[1]:
            if len(parts) == 2:
                return self.reply(200, {k: JOB[k] for k in ("status", "stage", "pct", "refused", "error") if k in JOB})
            if parts[2] == "result":
                if "result" in JOB:
                    return self.reply(200, JOB["result"])
                return self.reply(409, {"message": f"job {parts[1]} is {JOB['status']} — it has no result"})
        self.reply(404, {"message": "not found"})

    def do_POST(self):
        if not self.allowed():
            return
        if self.path not in ("/jobs", "/measure", "/cloud"):  # MA-4e, MA-4f: a measure and a cloud are this process's one run too, polled at /jobs/:id
            return self.reply(404, {"message": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return self.reply(413, {"message": "a job is at most 1 MB of JSON"})
        try:
            job = {"/measure": read_measure, "/cloud": read_cloud}.get(self.path, read_job)(json.loads(self.rfile.read(n) or b"null"))
        except ValueError as e:  # a JSONDecodeError is a ValueError
            return self.reply(400, {"message": str(e)})
        with LOCK:
            if JOB:
                return self.reply(409, {"message": "this service runs one job — the bridge starts another for the next"})
            JOB.update(id=job["job_id"], status="queued", stage="queued", pct=0, refused=[])
        threading.Thread(target=run, args=(job,), daemon=True).start()
        self.reply(202, {"job_id": job["job_id"], "status": "queued"})


def main():
    if not TOKEN:
        sys.exit("sentinel-survey: no SENTINEL_SURVEY_TOKEN — the bridge starts this service; it never runs open")
    # The bridge holds our stdin and never writes to it: when the bridge ends by any route (taskkill /f, a closed console too), the pipe
    # closes and this exits — no orphan keeps its port, its CPU or its memory.
    # Final review: exit whatever the read does (no stdin handle, an error, EOF) — a service that cannot watch its parent does not run on.
    def watch():
        try:
            sys.stdin.buffer.read()
        finally:
            os._exit(3)
    threading.Thread(target=watch, daemon=True).start()
    server = Server(("127.0.0.1", 0), Handler)  # loopback only, a port the OS picks (no firewall prompt)
    print(json.dumps({"port": server.server_address[1], "version": VERSION}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
