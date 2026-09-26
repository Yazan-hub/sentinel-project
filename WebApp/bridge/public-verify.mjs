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

/** A global in-process fixed window: `max` takes per `windowMs`, then false until the window turns.
 *  ponytail: one window for every caller — per-IP limits wait until the Funnel's forwarded address is verified. */
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

/** The request body as text, or null when it is over `max` bytes — declared (answered unread) or streamed (the rest
 *  drained unbuffered, never cut: a destroyed socket could not carry the 413, which the caller sends with
 *  Connection: close). */
export const readCapped = (req, max = PUBLIC_BODY_MAX) => new Promise((resolve) => {
  if (Number(req.headers?.["content-length"] || 0) > max) return resolve(null);
  let chunks = [], total = 0;
  req.on("data", (c) => {
    if (!chunks) return; // over the cap: the stream keeps flowing, nothing is kept
    total += c.length;
    if (total > max) { chunks = null; resolve(null); } else chunks.push(c);
  });
  req.on("end", () => { if (chunks) resolve(Buffer.concat(chunks).toString("utf8")); });
  req.on("error", () => resolve(null));
});
