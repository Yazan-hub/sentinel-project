# MA-4c — sentinel-survey 0.1 (design §6.9): the service the bridge starts for ONE survey job and stops after it
# (WebApp/bridge/survey-service.mjs). It listens on 127.0.0.1 only, on a port it picks (one JSON line on stdout), answers only the
# bridge's per-start token, makes no network call, writes no file (its result goes back over HTTP and the bridge keeps it), re-hashes
# every input before the read (a changed one is refused) and after it (a change during the read fails the job), does no typing, never writes the ledger, never talks to Revit — and exits when the bridge does
# (its stdin closes, a hard kill too). numpy and the standard library only. Run: python -E -B service.py (never -I: numpy is in the
# user site).
import hashlib
import hmac
import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import las
import pipeline

VERSION = "0.1.0"
TOKEN = os.environ.get("SENTINEL_SURVEY_TOKEN", "")
MAX_BODY = 1 << 20
# ponytail: one file is at most 300 million points: it is hashed twice and read in chunks, which must fit the bridge's 10 min job limit.
# The Kladno scan (MA-4h) has 250.5 million points (LAS 1.2, format 2, 6.5 GB); MA-4h measures its run time against that limit and
# sets this cap.
MAX_POINTS_IN = 300_000_000
JOB = {}  # this process's one job: {id, status, stage, pct, refused, error?, result?}
LOCK = threading.Lock()


def tools():
    """Each tool with the licence its package declares (the build:run receipt lists them, design §6.10)."""
    import importlib.metadata
    import platform
    import numpy
    md = importlib.metadata.metadata("numpy")
    return [{"name": "sentinel-survey", "version": VERSION, "licence": "LicenseRef-Sentinel"},
            {"name": "python", "version": platform.python_version(), "licence": "PSF-2.0"},
            {"name": "numpy", "version": numpy.__version__, "licence": md.get("License-Expression") or md.get("License") or "not declared"}]


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
        return None, f"a {item['kind']} is not surveyed by sentinel-survey 0.1 (scans only)"
    try:
        if sha256(item["path"]) != item["sha256"]:
            return None, "changed since admitted (its sha256 is not the pack's) — Re-check flags it"
        head = las.read_header(item["path"])
        if head["count"] > MAX_POINTS_IN:
            return None, f"{head['count']:,} points — sentinel-survey 0.1 reads at most {MAX_POINTS_IN:,} in one file; a larger scan waits for MA-4h"
        return head, None
    except las.Refused as e:
        return None, str(e)
    except OSError as e:
        return None, f"not read ({e.strerror or type(e).__name__})"  # strerror names no path


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def run(job):
    started, cpu0 = now(), time.process_time()
    try:
        JOB.update(status="running", stage="hashing", pct=5)
        ok = []
        for item in job["items"]:
            head, why = check(item)
            if why:
                JOB["refused"].append({"id": item["id"], "reason": why})
            else:
                ok.append({**item, "head": head})
        if not ok:
            JOB.update(status="refused", stage="done", pct=100)
            return
        candidates, stats = pipeline.survey(ok, job["params"], job["seed"], lambda stage, pct: JOB.update(stage=stage, pct=pct))
        JOB.update(stage="re-hashing", pct=95)  # a file changed during the read: what was measured is not what was admitted
        moved = [i["id"] for i in ok if sha256(i["path"]) != i["sha256"]]
        if moved:
            JOB.update(status="failed", error=f"{', '.join(moved)} changed while {'it was' if len(moved) == 1 else 'they were'} read"
                                              " — nothing it found was kept")
            return
        JOB["result"] = {"candidates": candidates, "derived": [], "receipt": {
            "tools": tools(), "params": job["params"], "seed": job["seed"], "started": started, "finished": now(),
            "cpu_s": round(time.process_time() - cpu0, 2), **stats, "units": "metres assumed (no CRS read)"}}
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
        if self.path != "/jobs":
            return self.reply(404, {"message": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return self.reply(413, {"message": "a job is at most 1 MB of JSON"})
        try:
            job = read_job(json.loads(self.rfile.read(n) or b"null"))
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
    threading.Thread(target=lambda: (sys.stdin.buffer.read(), os._exit(3)), daemon=True).start()
    server = Server(("127.0.0.1", 0), Handler)  # loopback only, a port the OS picks (no firewall prompt)
    print(json.dumps({"port": server.server_address[1], "version": VERSION}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
