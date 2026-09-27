// The public receipt check (cohesion phase 4c): anyone may ask whether a receipt is on the ledger, without a
// token, and learn a yes/no plus field NAMES — never a ledger value. Pure; bcf-service.mjs wires it in ahead of
// the CSRF and bearer gates for callers those gates would refuse, and cde-store.mjs's publicAuditRow reads the row.
//
// What a match means: the row this key's project holds under that id carries exactly that stored hash. The
// hash chain is global (one chain over every project's rows) and is NOT recomputed here — the reply says so.

const err = (status, message) => Object.assign(new Error(message), { status });
const HEX64 = /^[0-9a-f]{64}$/;

/** The one byte-identical answer for an unknown key, an unknown id, another project's id, a wrong hash and a
 *  hashless row — so the reply is never an existence oracle for keys or ids. */
export const MISS = Object.freeze({ matches: false, note: "no ledger entry on this key has that id and hash" });
const HIT_NOTE = "matches the ledger's stored hash; the chain is not recomputed";

/** Bytes a public check may send. */
export const PUBLIC_BODY_MAX = 8 * 1024;

/** True only for POST and OPTIONS on /receipt/<key>/verify — the one route the gates let an anonymous caller reach. */
export const isPublicRoute = (method, pathname) =>
  (method === "POST" || method === "OPTIONS") && /^\/receipt\/[^/]+\/verify$/.test(String(pathname ?? ""));

/** {audit_id, ledger_hash[, recorded_at, verdict, project]} from `{receipt}`, a bare receipt or a bare claim;
 *  nothing else is read. Malformed → err(400), before any database call. A null optional is "not supplied". */
export function parsePublicVerify(body) {
  const r = body && typeof body === "object" && !Array.isArray(body)
    ? (body.receipt && typeof body.receipt === "object" && !Array.isArray(body.receipt) ? body.receipt : body)
    : null;
  if (!r) throw err(400, "send {audit_id, ledger_hash} or a whole receipt as JSON");
  if (!Number.isSafeInteger(r.audit_id) || r.audit_id < 1) throw err(400, "audit_id must be a positive integer");
  if (typeof r.ledger_hash !== "string" || !HEX64.test(r.ledger_hash)) throw err(400, "ledger_hash must be 64 lowercase hex characters");
  const claim = { audit_id: r.audit_id, ledger_hash: r.ledger_hash };
  for (const f of ["recorded_at", "verdict", "project"]) {
    if (r[f] === undefined || r[f] === null) continue;
    if (typeof r[f] !== "string") throw err(400, `${f} must be a string when given`);
    claim[f] = r[f];
  }
  return claim;
}

/** The anonymous reply: MISS unless the row exists with that id and a stored hash equal to the claim's; then
 *  {matches, checked, mismatched, not_checked, note} with field names only. The project is always checked (the
 *  row was found under the route key's project; a supplied `project` must equal the key); `recorded_at` and
 *  `verdict` are checked only when supplied — a supplied verdict that differs (or a row with no verdict) is a
 *  mismatch, never a pass. */
export function comparePublic(row, claim, routeKey) {
  if (!row || !row.hash || String(row.id) !== String(claim.audit_id) || row.hash !== claim.ledger_hash) return MISS;
  const checked = ["audit_id", "ledger_hash", "project"], mismatched = [], not_checked = [];
  if (claim.project !== undefined && claim.project !== routeKey) mismatched.push("project");
  for (const [f, actual] of [["recorded_at", row.at ?? null], ["verdict", row.new_value?.verdict ?? null]]) {
    if (claim[f] === undefined) { not_checked.push(f); continue; }
    checked.push(f);
    if (claim[f] !== actual) mismatched.push(f);
  }
  return { matches: mismatched.length === 0, checked, mismatched, not_checked, note: HIT_NOTE };
}

/** An in-process fixed window: `max` takes per `windowMs`, then false until the window turns. */
export function createLimiter({ max = 60, windowMs = 60000, now = Date.now } = {}) {
  let start = now(), used = 0;
  return {
    take() {
      const t = now();
      if (t - start >= windowMs) { start = t; used = 0; }
      if (used >= max) return false;
      used++;
      return true;
    },
  };
}

/** One fixed window per key (a caller's address), at most `maxKeys` of them: past that the oldest window is dropped,
 *  so a flood of fresh keys can restart a window early but never grow memory. */
export function createKeyedLimiter({ max = 60, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const windows = new Map();
  return {
    take(key) {
      let l = windows.get(key);
      if (!l) {
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
        windows.set(key, (l = createLimiter({ max, windowMs, now })));
      }
      return l.take();
    },
    size: () => windows.size,
  };
}

/** The caller's address as the proxy in front of the bridge (the Funnel) saw it: the LAST X-Forwarded-For entry — a
 *  proxy appends the address it accepted the connection from, so anything a client wrote itself sits to its left —
 *  else the socket's own address. This holds only behind a proxy that appends the header: on a direct non-loopback
 *  bind a caller writes its own X-Forwarded-For, and behind a proxy that forwards none every caller shares the
 *  proxy's address (the per-caller window then acts as one global window). */
export const clientAddress = (req) =>
  String(req.headers?.["x-forwarded-for"] || "").split(",").pop().trim() || req.socket?.remoteAddress || "unknown";

/** One caller for the limits: an IPv4 address (or an IPv4-mapped one) as it is; an IPv6 address folded to its /64,
 *  since a provider hands a single subscriber the whole block and every address in it would otherwise be a fresh
 *  caller. */
export function callerKey(address) {
  const a = String(address).trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return mapped[1];
  if (!a.includes(":")) return a;
  const [head, tail] = a.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** A receipt check is a few hundred bytes: it arrives whole within 3 s, or it is a 408. Without a deadline a check
 *  that sends 1 byte of 100 held its socket for the server's 30 min, and 256 of them locked every caller out; the
 *  shorter the hold, the more sources it takes to keep the read slots full. */
export const PUBLIC_BODY_MS = 3_000;

/** The request body as text, or null when it is over `max` bytes — declared (answered unread) or streamed (the rest
 *  drained unbuffered, never cut: a destroyed socket could not carry the 413, which the caller sends with
 *  Connection: close). Rejects with .status 408 when the body is not whole within `ms`, and 400 when the caller
 *  goes away first; send() closes the connection on either. */
export const readCapped = (req, max = PUBLIC_BODY_MAX, ms = PUBLIC_BODY_MS) => new Promise((resolve, reject) => {
  if (Number(req.headers?.["content-length"] || 0) > max) return resolve(null);
  let chunks = [], total = 0;
  const refuse = (status, message) => { clearTimeout(timer); chunks = null; reject(Object.assign(new Error(message), { status })); };
  const timer = setTimeout(() => refuse(408, `a receipt check must arrive within ${ms / 1000} s`), ms);
  const done = (v) => { clearTimeout(timer); resolve(v); };
  req.on("data", (c) => {
    if (!chunks) return; // over the cap: the stream keeps flowing, nothing is kept
    total += c.length;
    if (total > max) { chunks = null; done(null); } else chunks.push(c);
  });
  req.on("end", () => { if (chunks) done(Buffer.concat(chunks).toString("utf8")); });
  req.on("error", () => done(null));
  req.on("close", () => refuse(400, "the request ended before its body did")); // after "end" this is a no-op
});
