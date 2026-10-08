// MA-4c — a stand-in for sentinel-survey (survey-service.test.mjs): the §6.9 contract over HTTP on 127.0.0.1, in Node, so every way a
// job ends is driven without Python. STANDIN = ok | silent | badline | exit | slow | refuse | denied | stall (its first poll answered
// 400 ms late, as numpy holding Python's lock does) | frozen (no poll answered). Like service.py it says its port on
// one stdout line, answers only SENTINEL_SURVEY_TOKEN and exits when its stdin closes. Its result's receipt lists its environment's
// NAMES (never values), so a test sees that no bridge secret reached it.
import { createServer } from "node:http";

const mode = process.env.STANDIN || "ok";
const token = process.env.SENTINEL_SURVEY_TOKEN;
process.stdin.resume();
process.stdin.on("end", () => process.exit(3));
if (mode === "silent") setInterval(() => {}, 1000);
else if (mode === "badline") { console.log("starting…"); setInterval(() => {}, 1000); }
else {
  let job = null, polls = 0;
  const server = createServer((req, res) => {
    res.on("error", () => {}); // a late answer to a poll the supervisor gave up on is dropped, never a crash
    const send = (code, body) => { if (!res.destroyed) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); } };
    if (mode === "denied" || req.headers.authorization !== `Bearer ${token}`) return send(401, { message: "not the bridge's token" });
    if (req.method === "GET" && req.url === "/health") return send(200, { version: "0.1.0-standin", tools: [{ name: "standin", version: "1", licence: "MIT" }] });
    if (req.method === "POST" && req.url === "/jobs") {
      let b = "";
      req.on("data", (c) => { b += c; });
      req.on("end", () => { job = JSON.parse(b); send(202, { job_id: job.job_id, status: "queued" }); });
      return;
    }
    if (job && req.url === `/jobs/${job.job_id}`) {
      polls += 1;
      if (mode === "frozen") return; // never answers a poll
      if (mode === "stall" && polls === 1) { setTimeout(() => send(200, { status: "running", stage: "walls", pct: 60, refused: [] }), 400); return; }
      if (mode === "exit") { setTimeout(() => process.exit(3), 5); return send(200, { status: "running", stage: "reading", pct: 10, refused: [] }); }
      if (mode === "slow" || polls < 2) return send(200, { status: "running", stage: "walls", pct: 60, refused: [] });
      if (mode === "refuse") return send(200, { status: "refused", stage: "done", pct: 100, refused: job.items.map((i) => ({ id: i.id, reason: "the stand-in refuses it" })) });
      return send(200, { status: "done", stage: "done", pct: 100, refused: [] });
    }
    if (job && req.url === `/jobs/${job.job_id}/result`) {
      return send(200, {
        candidates: [{ cid: "scan-L00-level", kind: "level", geometry: { BaseElevation: 0 }, measured: { elevation_mm: 0 }, evidence: [`${job.items[0].id}#floor-L00`], fit: { inliers: 1, rmse_mm: 0, coverage: 1 } }],
        derived: [], receipt: { seed: job.seed, params: job.params, points_in: 1, points_used: 1, cpu_s: 0, env: Object.keys(process.env).sort() },
      });
    }
    send(404, { message: "not found" });
  });
  server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port, version: "0.1.0-standin" })));
}
