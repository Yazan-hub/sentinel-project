// External timestamps for the ledger (docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md §5): a project's chain head
// (migration 0045's project_hash) is taken to an RFC 3161 timestamp authority, and the signed token comes back into that project's
// own ledger as an `anchor:timestamped` row (entity_type ledger_anchor) — so the operator cannot rewrite the project's history before
// that time without the token failing. The global head is taken too, daily, into a row with no project.
//
// Only the 32-byte hash and a random nonce leave the PC. Nothing is sent while LEDGER_TSA_URL is unset (config/.env): the founder's
// switch. A token is checked (ledger-verify.mjs verifyToken: imprint, nonce, signature, a time-stamping certificate chaining to a
// trusted root) before it is recorded; one that does not check out is not recorded.
// Daily: every project whose head is not already an anchor row, then the global head. On demand: POST /cde/:key/anchor (a lead).
import { randomBytes } from "node:crypto";
import { loadEnv } from "./load-env.mjs";
import { verifyToken, verifyChain, checkAnchor, tlv, kids, anchorRows } from "./ledger-verify.mjs";

const env = { ...process.env, ...loadEnv() };
export const tsaUrl = () => String(env.LEDGER_TSA_URL || "").trim();
const err = (status, message) => Object.assign(new Error(message), { status });

// ── RFC 3161 request and response ──────────────────────────────────────────────────────────────────────────────────────────────
const enc = (tag, ...parts) => {
  const body = Buffer.concat(parts); const n = body.length; const len = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) len.unshift(x & 0xff);
  return Buffer.concat([Buffer.from([tag, ...(n < 0x80 ? [n] : [0x80 | len.length, ...len])]), body]);
};
const SHA256_ALG = Buffer.from("300d06096086480165030402010500", "hex");
/** A positive 8-byte nonce whose first byte is not zero (so its DER INTEGER is minimal). */
export const newNonce = () => { const b = randomBytes(8); b[0] = (b[0] & 0x7f) | 0x01; return b; };
/** DER TimeStampReq: version 1, a sha256 imprint of `hashHex` (the hash itself is the message), the nonce, certReq true. Pure. */
export const tsRequest = (hashHex, nonce) => {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) throw err(500, "a chain head is 64 lowercase hex");
  return enc(0x30, Buffer.from([2, 1, 1]), enc(0x30, SHA256_ALG, enc(0x04, Buffer.from(hashHex, "hex"))), enc(0x02, nonce), Buffer.from([1, 1, 0xff]));
};
/** A TimeStampResp: { code (0 granted, 1 granted with mods, 2+ refused), text, token (DER) | null }. Pure. */
export function readTsResponse(der) {
  const [status, token] = kids(tlv(Buffer.from(der)));
  const s = kids(status);
  const text = s[1]?.tag === 0x30 ? kids(s[1]).map((x) => Buffer.from(x.body).toString("utf8")).join("; ") : "";
  return { code: parseInt(Buffer.from(s[0].body).toString("hex") || "0", 16), text, token: token ? Buffer.from(token.all) : null };
}

async function httpPost(url, der) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/timestamp-query", Accept: "application/timestamp-reply" }, body: der, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw err(502, `the timestamp service answered HTTP ${r.status} — nothing was recorded`);
  return Buffer.from(await r.arrayBuffer());
}

/** Asks the TSA at `url` to fix `hashHex` in time and checks the answer. → { token, check }. Throws (502) on a refusal or a
 *  token that does not check out — nothing is recorded then. deps: { post(url, der) → Buffer, nonce, verifyOpts }. */
export async function stamp(hashHex, url, { post = httpPost, nonce = newNonce(), verifyOpts = {} } = {}) {
  let resp;
  try { resp = readTsResponse(await post(url, tsRequest(hashHex, nonce))); }
  catch (e) { throw e.status ? e : err(502, `the timestamp service could not be reached or read (${e.message}) — nothing was recorded`); }
  if (resp.code > 1 || !resp.token) throw err(502, `the timestamp service refused (status ${resp.code}${resp.text ? `: ${resp.text}` : ""}) — nothing was recorded`);
  const check = verifyToken(resp.token, hashHex, { ...verifyOpts, nonce: nonce.toString("hex") });
  if (!check.ok) throw err(502, `the timestamp service's answer did not check out (${check.problems.join("; ")}) — nothing was recorded`);
  return { token: resp.token, check };
}

// ── The ledger side ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const store = async () => import("./cde-store.mjs");
const notSetUp = (e) => /audit_project_chain/.test(String(e?.message)) ? err(503, "the project chain is not set up on this database yet (migration 0045) — nothing was sent") : e;
const read = async (path) => { try { return await (await store()).sb(path, { service: true }); } catch (e) { throw notSetUp(e); } };

/** The project's chain head: { project_seq, project_hash, audit_id, entity_type, action } | null. */
const head = async (pid) => (await read(`audit_project_chain_v?project_id=eq.${pid}&select=project_seq,project_hash,audit_id,entity_type,action&order=project_seq.desc&limit=1`))?.[0] ?? null;

/** Fixes one project's head in time. → { status: "stamped" | "current" | "empty", … }. A head that is already an anchor row is
 *  "current": nothing new to fix, nothing sent. deps: as stamp()'s, plus { url } to override the configured service. */
export async function anchorProject(key, actor, deps = {}) {
  const url = deps.url ?? tsaUrl();
  if (!url) throw err(409, "external timestamps are not switched on for this bridge (no timestamp service is set) — nothing was sent");
  const cde = await store();
  const proj = await cde.ensureProject(key);
  const h = await head(proj.id);
  if (!h) return { status: "empty", message: "this project's ledger has no rows yet — nothing to timestamp" };
  if (h.entity_type === "ledger_anchor") return { status: "current", project_seq: h.project_seq, message: "nothing new since the last external timestamp — nothing was sent" };
  const { token, check } = await stamp(h.project_hash, url, deps);
  const row = await cde.audit(proj.id, "ledger_anchor", null, "anchor:timestamped", actor, null, {
    scope: "project", project_seq: h.project_seq, project_hash: h.project_hash, tsa: url, tsa_name: check.tsa, tsa_cert_sha256: check.signer_sha256,
    gen_time: check.gen_time, serial: check.serial, policy: check.policy, token: token.toString("base64"),
  });
  return { status: "stamped", project_seq: h.project_seq, gen_time: check.gen_time, tsa: check.tsa, audit_id: row?.id ?? null };
}

/** Fixes the global head in time (a row with no project). → { status, … } as anchorProject's. */
export async function anchorGlobal(actor, deps = {}) {
  const url = deps.url ?? tsaUrl();
  if (!url) throw err(409, "external timestamps are not switched on for this bridge — nothing was sent");
  const cde = await store();
  const h = (await cde.sb(`audit_log?select=id,hash,project_id,entity_type&order=id.desc&limit=1`, { service: true }))?.[0];
  if (!h?.hash) return { status: "empty" };
  if (h.project_id == null && h.entity_type === "ledger_anchor") return { status: "current", audit_id: h.id };
  const { token, check } = await stamp(h.hash, url, deps);
  const row = await cde.audit(null, "ledger_anchor", null, "anchor:timestamped", actor, null, {
    scope: "global", audit_id: h.id, hash: h.hash, tsa: url, tsa_name: check.tsa, tsa_cert_sha256: check.signer_sha256, gen_time: check.gen_time, serial: check.serial,
    policy: check.policy, token: token.toString("base64"),
  });
  return { status: "stamped", audit_id: h.id, gen_time: check.gen_time, tsa: check.tsa, row_id: row?.id ?? null };
}

/** What the Settings screen shows: the head, and the newest timestamp checked now as the auditor's file checks it — the chain up to
 *  the seq it names recomputed from its rows, then the token (ledger-verify.mjs checkAnchor). → { configured, tsa, head, last, current }. */
export async function anchorStatus(key, verifyOpts = {}) {
  const cde = await store();
  const proj = await cde.ensureProject(key);
  const h = await head(proj.id);
  const [a] = anchorRows(await read(`audit_project_chain_v?project_id=eq.${proj.id}&entity_type=eq.ledger_anchor&action=eq.anchor:timestamped&select=project_seq,audit_id,entity_type,action,new_text,at_utc&order=project_seq.desc&limit=1`));
  let last = null;
  if (a) {
    const n = Number(a.value.project_seq); const rows = [];
    for (let offset = 0; rows.length < n;) {
      const page = await read(`audit_project_chain_v?project_id=eq.${proj.id}&project_seq=lte.${n}&select=*&order=project_seq.asc&limit=1000&offset=${offset}`);
      if (!page?.length) break;
      rows.push(...page); offset += page.length;
    }
    const c = verifyChain(rows);
    const r = c.ok && c.length === n ? checkAnchor(a.row, a.value, c, verifyOpts)
      : { ok: false, problems: c.problems.length ? c.problems : [`the chain before the timestamp is not complete (${c.length} of ${n} rows)`] };
    last = { project_seq: n, audit_id: a.row.audit_id, gen_time: r.gen_time ?? a.value.gen_time ?? null, tsa: r.tsa ?? a.value.tsa_name ?? null, verified: r.ok, problems: r.problems };
  }
  return { configured: !!tsaUrl(), tsa: tsaUrl() || null, head: h ? { project_seq: h.project_seq, project_hash: h.project_hash } : null, last, current: h?.entity_type === "ledger_anchor" };
}

// ── Daily ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY = 24 * 3600e3;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const DAILY_ACTOR = "sentinel (daily timestamp)";

/** One daily round, when the last global timestamp is a day old (or there is none): each project whose head is not an anchor row,
 *  one request at a time, then the global head. A project that fails is logged and the round goes on. → { projects, failed, global }. */
export async function runDaily({ now = Date.now, gapMs = 2000, log = console.log, deps = {} } = {}) {
  const cde = await store();
  const [g] = await cde.sb(`audit_log?project_id=is.null&entity_type=eq.ledger_anchor&select=id,at&order=id.desc&limit=1`, { service: true });
  if (g && now() - Date.parse(g.at) < DAY - 30 * 60e3) return { skipped: "the last daily timestamp is less than a day old" };
  // ponytail: one row per project with a chain (seq 1); PostgREST answers at most 1000 — page it when an office has more projects.
  const firsts = await read(`audit_project_chain?project_seq=eq.1&select=project_id&order=audit_id.asc&limit=1000`);
  const keys = new Map((await cde.listProjects()).map((p) => [p.id, p.key]));
  let projects = 0, failed = 0;
  for (const { project_id } of firsts) {
    const key = keys.get(project_id);
    if (!key) continue;
    try {
      const r = await anchorProject(key, DAILY_ACTOR, deps);
      if (r.status === "stamped") { projects++; await pause(gapMs); }
    } catch (e) { failed++; log(`[anchor] ${key}: ${e.message}`); }
  }
  const global = await anchorGlobal(DAILY_ACTOR, deps).catch((e) => ({ status: "failed", message: e.message }));
  log(`[anchor] daily: ${projects} project(s) timestamped, ${failed} failed; global head ${global.status}`);
  return { projects, failed, global };
}

/** Starts the daily round (checked hourly) when a timestamp service is set; says so either way. */
export function startDaily(log = console.log) {
  if (!tsaUrl()) { log("[anchor] external timestamps: off (LEDGER_TSA_URL is not set) — nothing is sent"); return null; }
  log(`[anchor] external timestamps: on — ${tsaUrl()}, daily`);
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await runDaily({ log }); } catch (e) { log(`[anchor] daily round failed: ${e.message}`); } finally { busy = false; } };
  const first = setTimeout(tick, 5 * 60e3); first.unref?.();
  const every = setInterval(tick, 3600e3); every.unref?.();
  return () => { clearTimeout(first); clearInterval(every); };
}
