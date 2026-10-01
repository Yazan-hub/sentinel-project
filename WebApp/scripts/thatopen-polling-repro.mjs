// A standalone reproduction for That Open (docs/THATOPEN_REPORTS.md, report 1, follow-up of 2026-10-01): behind the
// platform's one address, socket.io long-polling loses its session when a follow-up request opens a new connection.
//
// It opens an engine.io polling session (GET), then sends 4 follow-up POSTs on the session id. With keep-alive, every
// request rides the same TCP connection, so it reaches the server that opened the session. With a new connection per
// request (what browsers and socket.io-client may do), the balancer sends some to another server, which answers
// HTTP 400 {"code":1,"message":"Session ID unknown"}. Sticky sessions (or WebSocket only) make every request succeed.
//
// Usage (Node 20+, no dependencies): THATOPEN_TOKEN=<API-permission token> node thatopen-polling-repro.mjs [sessions]
// The token is never printed.
import https from "node:https";

const TOKEN = process.env.THATOPEN_TOKEN || process.env.THATOPEN_API_KEY;
if (!TOKEN) { console.error("Set THATOPEN_TOKEN (a platform token with the API permission)."); process.exit(2); }
const HOST = new URL(process.env.THATOPEN_API_BASE_URL || "https://platform.thatopen.com").hostname;
const SESSIONS = Number(process.argv[2]) || 6;
const path = (sid) => `/socket.io/?EIO=4&transport=polling&accessToken=${encodeURIComponent(TOKEN)}${sid ? `&sid=${sid}` : ""}`;

const send = (agent, method, p, body) => new Promise((resolve, reject) => {
  const headers = body ? { "content-type": "text/plain;charset=UTF-8", "content-length": Buffer.byteLength(body) } : {};
  const r = https.request({ host: HOST, path: p, method, agent, headers }, (m) => {
    let d = ""; m.on("data", (c) => (d += c)); m.on("end", () => resolve({ status: m.statusCode, body: d }));
  });
  r.on("error", reject); if (body) r.write(body); r.end();
});

for (const [label, agentFor] of [["keep-alive (one connection)", () => new https.Agent({ keepAlive: true, maxSockets: 1 })],
                                  ["a new connection per request", () => false]]) {
  let failed = 0, asked = 0;
  console.log(`\n${label}:`);
  for (let s = 1; s <= SESSIONS; s++) {
    const agent = agentFor();
    const open = await send(agent, "GET", path());
    const sid = /"sid":"([^"]+)"/.exec(open.body)?.[1];
    const row = [`session ${s}: open ${open.status}`];
    for (let k = 1; k <= 4; k++) {
      const r = await send(agent, "POST", path(sid), "40");
      asked++; if (r.status !== 200) failed++;
      row.push(`POST ${r.status}${r.status !== 200 ? ` ${r.body.slice(0, 50)}` : ""}`);
    }
    if (agent) agent.destroy();
    console.log("  " + row.join(" | "));
  }
  console.log(`  → ${failed} of ${asked} follow-up requests lost the session`);
}
