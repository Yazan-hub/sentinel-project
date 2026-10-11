// MA-5a-3 — a stand-in for sentinel-drawing (drawing-service.test.mjs): the job JSON on stdin, an answer on stdout, so every way a job
// ends is driven without .NET. STANDIN = ok | refuse | crash (a line on stderr, exit 1) | garbage (stdout not JSON) | badstatus | hang
// (never answers). Its result's receipt lists its environment's NAMES (never values), so a test sees that no bridge secret reached it.
const mode = process.env.STANDIN || "ok";
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  const job = JSON.parse(input);
  const say = (o) => process.stdout.write(JSON.stringify(o));
  const tools = [{ name: "sentinel-drawing", version: "0.1.0-standin", licence: "proprietary" }];
  if (mode === "crash") return process.stderr.write("sentinel-drawing: FileNotFoundException: C:\\secret\\path.pdf\n", () => process.exit(1));
  if (mode === "garbage") return process.stdout.write("not json");
  if (mode === "badstatus") return say({ status: "running" });
  if (mode === "hang") return setInterval(() => {}, 1000);
  if (mode === "refuse") return say({ status: "refused", version: "0.1.0-standin", tools, refused: job.items.map((i) => ({ id: i.id, reason: "not the bytes admitted (sha256)" })) });
  const id = job.items[0].id;
  say({ status: "done", version: "0.1.0-standin", tools, refused: [], result: {
    candidates: [{ cid: `drawing-${id}-p1-wall-1`, kind: "wall", geometry: { LocationCurve: { start: [60, 43], end: [220, 43] }, faces: [], page: 1, units: "paper_mm" },
      measured: { length_paper_mm: 160, thickness_paper_mm: 6 }, evidence: [`${id}#page-1`] }],
    derived: [], receipt: { started: "2026-10-11T10:00:00Z", finished: "2026-10-11T10:00:01Z", cpu_s: 0.2, items: [], env: Object.keys(process.env), job } } });
});
