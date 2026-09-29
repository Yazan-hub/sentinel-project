// Roadmap item 4, phase 2 (spec 2026-09-29-sdk-ask-sentinel-design.md): the ASKING side of "Ask Sentinel". A tool that
// holds the platform account's API token asks the open, signed-in Sentinel tab over the platform's external channel
// (@thatopen/services 0.16.1, docs/ai-quickstart.md §5b): channelSubscribe → channel:subscribed → channelPublish with an
// ack ({delivered: N}) → the tab's reply, matched on requestId. Read-only: the tab answers only the two commands below.
// Several open tabs each reply; the first reply per request wins.
//
// Usage:  node bridge/ask-sentinel.mjs status|deliveries [name] [--app <appId>]
//   --app: the published app's id (WebApp/.thatopen appId); omit it to ask the local dev app (thatopen serve).
// Config (config/.env, never printed): THATOPEN_CHANNEL_TOKEN if set, else THATOPEN_API_KEY — a token with the API
// permission — and THATOPEN_PROJECT_ID. The token rides in the socket URL, so every error passes through scrub().
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { loadEnv } from "./load-env.mjs";
import { scrub } from "./platform-gate-ledger.mjs";
import { parseCliArgs } from "./cli-args.mjs";

export const COMMANDS = ["sentinel.status", "sentinel.deliveries"];

/** config/.env wins over process.env, as in thatopen-client.mjs getConfig. */
export function channelConfig(file = loadEnv(), penv = process.env) {
  const pick = (k) => ((k in file) ? file[k] : (penv[k] || "")).trim();
  const token = pick("THATOPEN_CHANNEL_TOKEN") || pick("THATOPEN_API_KEY");
  if (!token) throw new Error("Missing config: THATOPEN_CHANNEL_TOKEN or THATOPEN_API_KEY. Set one in config/.env (never commit it).");
  return { token, projectId: pick("THATOPEN_PROJECT_ID"), apiUrl: pick("THATOPEN_API_BASE_URL") || "https://platform.thatopen.com" };
}

const words = (v) => (typeof v === "string" ? v : JSON.stringify(v));

const NOT_OPEN = /^Sentinel is not open \(and joined\)/;

/** Every address the platform's name resolves to; [null] (the default route) when it does not resolve here. */
export async function platformAddresses(apiUrl) {
  try {
    const all = await lookup(new URL(apiUrl).hostname, { all: true });
    return all.length ? [...new Map(all.map((a) => [a.address, a])).values()] : [null];
  } catch { return [null]; }
}

/** Resolves {delivered, answer} with the first reply; anything else rejects in words, scrubbed.
 *  The platform's channel servers share one name but not their rooms (seen 2026-09-29: the tab's socket on one address,
 *  an ask on the other → delivered 0), so the command is asked on every address and the first reply wins; when none
 *  replies, the most telling reason is said ("not open" only when every address said so).
 *  deps: {config, connect(url, opts) → socket.io-client socket, addresses(apiUrl)} — all injectable for tests. */
export async function ask(opts, deps = {}) {
  try {
    const config = deps.config ?? channelConfig();
    const addrs = await (deps.addresses ?? platformAddresses)(config.apiUrl);
    return await Promise.any(addrs.map((address) => askChannel({ ...opts, address }, { ...deps, config })));
  } catch (e) {
    const errs = e instanceof AggregateError ? e.errors : [e];
    const telling = errs.find((x) => !NOT_OPEN.test(String(x?.message))) ?? errs[0];
    throw new Error(scrub(telling?.message || telling));
  }
}

/** A connection pinned to one address (TLS still checks the platform's name); forceNew, since socket.io otherwise
 *  shares one connection per URL. */
const socketOpts = (apiUrl, address) => {
  if (!address) return { forceNew: true };
  const pin = (_h, o, cb) => (o?.all ? cb(null, [address]) : cb(null, address.address, address.family));
  return { forceNew: true, agent: new (apiUrl.startsWith("https:") ? https : http).Agent({ lookup: pin }) };
};

async function askChannel({ projectId, appId, type, payload, timeoutMs = 10_000, kind = "cli", address = null }, deps) {
  const cfg = deps.config;
  const pid = projectId || cfg.projectId;
  if (!pid) throw new Error("not asked — no platform project (pass one, or set THATOPEN_PROJECT_ID)");
  const connect = deps.connect ?? (await import("socket.io-client")).io;
  const requestId = randomUUID();
  return await new Promise((resolve, reject) => {
    let socket, subscribed = false, published = false, delivered, lastConnectError = "";
    let done = false;
    const finish = (settle, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.disconnect(); } catch { /* already gone */ }
      settle(v);
    };
    const fail = (why) => finish(reject, new Error(why));
    const timer = setTimeout(() => {
      const s = timeoutMs / 1000;
      if (!subscribed) fail(`not answered — the platform did not confirm the channel within ${s} s${lastConnectError ? ` (last connection error: ${lastConnectError})` : ""}`);
      else if (delivered === undefined) fail(`not answered — the platform did not acknowledge the command within ${s} s`);
      else fail(`not answered — delivered to ${delivered} Sentinel tab(s) in platform project ${pid}, but no reply within ${s} s`);
    }, timeoutMs);

    try { socket = connect(`${cfg.apiUrl}?accessToken=${encodeURIComponent(cfg.token)}`, socketOpts(cfg.apiUrl, address)); }
    catch (e) { return fail(`not asked — could not open the platform channel: ${e?.message || e}`); }
    // socket.io keeps retrying a transient failure (socket.active); a refusal by the server (e.g. a bad token) is final.
    socket.on("connect_error", (e) => {
      lastConnectError = String(e?.message || e);
      if (!socket.active) fail(`not asked — the platform refused the connection: ${lastConnectError}`);
    });
    socket.on("channelMessage", (msg) => {
      if (msg?.type === "channel:subscribed") {
        subscribed = true;
        if (published) return;
        published = true;
        socket.emit("channelPublish", { type, requestId, payload }, (ack) => {
          if (ack?.error) return fail(`not answered — the platform refused the command: ${words(ack.error)}`);
          delivered = ack?.delivered;
          if (delivered === 0) fail(`Sentinel is not open (and joined) in platform project ${pid} under this account — not answered`);
        });
        return;
      }
      if (msg?.type === "channel:error") return fail(`not answered — the platform channel said: ${words(msg.payload)}`);
      if (!msg || msg.requestId !== requestId) return; // another request's message, or not a reply
      if (msg.type === "reply") return finish(resolve, { delivered: delivered ?? null, answer: msg.payload });
      if (msg.type === "reply-error") return fail(`Sentinel answered with an error: ${words(msg.payload?.error ?? msg.payload)}`);
    });
    socket.emit("channelSubscribe", { projectId: pid, ...(appId ? { appId } : {}), kind });
  });
}

// The CLI runs only when this file is the entry point — importing it from a test or the MCP server is inert.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const { flag } = parseCliArgs(argv);
  const [cmd, name] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--app");
  if (cmd !== "status" && cmd !== "deliveries") {
    console.error("usage: node bridge/ask-sentinel.mjs status|deliveries [name] [--app <appId>]");
    process.exit(2);
  }
  try {
    const out = await ask({ appId: flag("app"), type: `sentinel.${cmd}`, payload: cmd === "deliveries" ? (name ? { name } : {}) : undefined });
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(scrub(e?.message || e));
    process.exit(1);
  }
}
