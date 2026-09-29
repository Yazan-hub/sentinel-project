// A standalone reproduction for That Open (docs/THATOPEN_REPORTS.md, report 1): the app channel's servers do not share
// rooms. No Sentinel code is involved beyond an open app tab.
//
// 1. Open any app that joins the channel (client.channel.external()) in its platform project, in a browser.
// 2. Run this. It resolves platform.thatopen.com (two addresses today) and, for each address in turn, connects a socket
//    pinned to that address, subscribes as an external tool (channelSubscribe {projectId, appId, kind: "cli"}) and
//    publishes one command with an ack — exactly the quickstart's §5b recipe, only pinned.
// 3. Reload the app tab (it may land on the other server) and run it again.
// If the rooms were shared, every address would report the same {delivered}. They do not: only the address the tab's
// socket landed on reports delivered 1.
//
// A script cannot stand in for the tab: the platform counts a listener only when it connects with a signed-in session
// and &accountToken=true, which an API token is refused (channel:error "Unauthorized").
//
// Usage (Node 20+, socket.io-client 4.x):
//   THATOPEN_TOKEN=<API-permission token> THATOPEN_PROJECT_ID=<id> THATOPEN_APP_ID=<id> node thatopen-channel-repro.mjs [rounds] [ip ...]
//   THATOPEN_COMMAND (default "ping", the scaffold's command) is the command published. The token is never printed.
//   The ip "unpinned" asks the way the quickstart does (the system's own DNS choice), for comparison.
import dns from "node:dns/promises";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { io } from "socket.io-client";

const BASE = process.env.THATOPEN_API_BASE_URL || "https://platform.thatopen.com";
const TOKEN = process.env.THATOPEN_TOKEN || process.env.THATOPEN_API_KEY;
const PROJECT = process.env.THATOPEN_PROJECT_ID;
const APP = process.env.THATOPEN_APP_ID;
const COMMAND = process.env.THATOPEN_COMMAND || "ping";
if (!TOKEN || !PROJECT || !APP) {
  console.error("Set THATOPEN_TOKEN (a platform token with the API permission), THATOPEN_PROJECT_ID and THATOPEN_APP_ID.");
  process.exit(2);
}
const [roundsArg, ...ipArgs] = process.argv.slice(2);
const ROUNDS = Number(roundsArg) || 3;
const host = new URL(BASE).hostname;
const scrub = (s) => String(s).split(TOKEN).join("[token]").replace(/accessToken=[^&\s"]+/g, "accessToken=[token]");

/** Publishes COMMAND once over a socket whose TCP connections all go to `ip` (TLS still checks the platform's name).
 *  Resolves {delivered, reply} or {error}, in words. */
const askVia = (ip) => new Promise((resolve) => {
  const lookup = (_h, o, cb) => (o?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4));
  const pin = ip === "unpinned" ? {} : { agent: new https.Agent({ lookup }) }; // "unpinned": the quickstart as written
  const s = io(`${BASE}?accessToken=${encodeURIComponent(TOKEN)}`, { ...pin, forceNew: true, reconnection: false });
  const requestId = randomUUID();
  let delivered;
  const done = (v) => { clearTimeout(t); s.disconnect(); resolve(v); };
  const t = setTimeout(() => done(delivered === undefined ? { error: "no subscribe/ack within 10 s" } : { delivered, reply: false }), 10_000);
  s.on("connect_error", (e) => done({ error: `connect_error ${scrub(e?.message)}` }));
  s.on("channelMessage", (m) => {
    if (m?.type === "channel:error") return done({ error: `channel:error ${scrub(JSON.stringify(m.payload))}` });
    if (m?.type === "reply" && m.requestId === requestId) return done({ delivered, reply: true });
    if (m?.type !== "channel:subscribed") return;
    s.emit("channelPublish", { type: COMMAND, requestId }, (ack) => {
      delivered = ack?.delivered;
      if (!delivered) done({ delivered: delivered ?? "no ack", reply: false }); // nobody to reply
    });
  });
  s.emit("channelSubscribe", { projectId: PROJECT, appId: APP, kind: "cli" });
});

let resolved = [];
try { resolved = await dns.resolve4(host, { ttl: true }); } catch (e) { console.log(`DNS: ${host} did not resolve (${e.code})`); }
const ips = ipArgs.length ? ipArgs : [...new Set(resolved.map((a) => a.address))];
const require = createRequire(import.meta.url);
console.log(`Run at ${new Date().toISOString()} · node ${process.version} · socket.io-client ${require("socket.io-client/package.json").version}`);
console.log(`DNS ${host} → ${resolved.map((a) => `${a.address} (ttl ${a.ttl} s)`).join(", ") || "—"}`);
console.log(`project ${PROJECT} · app ${APP} · command "${COMMAND}" · ${ROUNDS} round(s) · addresses: ${ips.join(", ")}`);
if (ips.filter((ip) => ip !== "unpinned").length < 2) console.log("Only one address: pass both as arguments to compare them.");
console.log("");
console.log("round  asked via        publish ack        app replied");
const tally = Object.fromEntries(ips.map((ip) => [ip, [0, 0]])); // [delivered >= 1, asked]
for (let round = 1; round <= ROUNDS; round++) {
  for (const ip of ips) {
    const r = await askVia(ip);
    if (!r.error) { tally[ip][1]++; if (r.delivered >= 1) tally[ip][0]++; }
    const ack = r.error ? `ERROR ${r.error}` : JSON.stringify({ delivered: r.delivered });
    console.log(`${String(round).padEnd(7)}${ip.padEnd(17)}${ack.padEnd(19)}${r.error ? "—" : r.reply ? "yes" : "no"}`);
  }
}
console.log("");
for (const ip of ips) console.log(`via ${ip}: delivered to the open app in ${tally[ip][0]} of ${tally[ip][1]} asks`);
process.exit(0);
