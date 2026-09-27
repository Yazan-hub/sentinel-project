// Request limits for the bridge (H0, decisions D8 and D9). Pure: the caps read process.env when a body is read
// (bcf-service.mjs has merged config/.env into it by then), so tests drive them with plain streams.

const err = (status, message) => Object.assign(new Error(message), { status });
const MB = 1024 * 1024;

/** A JSON body is parsed whole in memory: 16 MB by default, BCF_MAX_JSON_MB overrides. */
export const jsonCap = () => (Number(process.env.BCF_MAX_JSON_MB) || 16) * MB;
/** A raw upload (an IFC, an encrypted blob) is held whole in memory: 2 GB by default, BCF_MAX_UPLOAD_MB overrides. */
export const uploadCap = () => (Number(process.env.BCF_MAX_UPLOAD_MB) || 2048) * MB;
/** Bodies that are a prompt or a few fields (/ai/*, compile-ids): nothing real comes near 1 MB. */
export const SMALL_JSON = 1 * MB;

// JSON.parse holds many times its text in memory, so the JSON bytes being read and parsed at once across every request
// are bounded too: four bodies at the cap. ponytail: one shared budget — a stranger can fill it (503s, never a crash);
// per-caller budgets if that ever happens.
const json = { used: 0 };

/** The body's bytes, or a refusal in words: a declared length over `max` is a 413 before a byte is read, a streamed
 *  body (chunked, or a length that lied) a 413 the moment it passes `max`. The rest is never kept — send() closes the
 *  connection after a 413. A `lease` charges the bytes to the shared JSON budget (503 when it is full). */
function readBytes(req, max, lease) {
  return new Promise((resolve, reject) => {
    const over = () => err(413, `the request body is over the ${Math.round(max / MB)} MB limit for this route — nothing was read or saved`);
    if (Number(req.headers?.["content-length"] || 0) > max) return reject(over());
    let chunks = [], total = 0, settled = false;
    const fail = (e) => { if (settled) return; settled = true; chunks = null; reject(e); };
    req.on("data", (c) => {
      if (settled) return; // refused: the rest flows past, nothing is kept
      total += c.length;
      if (total > max) return fail(over());
      if (lease) {
        if (json.used + c.length > 4 * jsonCap()) return fail(err(503, "the bridge is reading too many large requests at once — nothing was saved; try again in a moment"));
        json.used += c.length;
        lease.held += c.length;
      }
      chunks.push(c);
    });
    req.on("end", () => { if (settled) return; settled = true; resolve(Buffer.concat(chunks, total)); });
    const cut = () => fail(err(400, "the request ended before its body did — nothing was saved"));
    req.on("error", cut);
    req.on("close", cut); // after "end" this is a no-op
  });
}

/** A JSON request body, parsed: {} when it is empty or not JSON (as before). Over `max` → 413; the shared budget
 *  full → 503. Bytes are collected before decoding, so a character split across two chunks survives. */
export async function readBody(req, { max = jsonCap() } = {}) {
  const lease = { held: 0 };
  try {
    const text = (await readBytes(req, max, lease)).toString("utf8");
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  } finally {
    json.used -= lease.held;
  }
}

/** A raw upload's bytes (an IFC, a document, ciphertext); over `max` → 413. The caller holds an uploadSlot. */
export const readRaw = (req, { max = uploadCap() } = {}) => readBytes(req, max, null);

// At most two large uploads at once across the bridge, one per caller. ponytail: every upload is held whole in memory
// (2 × 2 GB worst case); stream to a temp file if uploads ever need to run wider.
const MAX_UPLOADS = 2;
const uploading = new Set();

/** Take an upload slot for `sub` (the verified sign-in's user id; every machine caller shares "service") or throw a
 *  429 in words. Returns the release, which is safe to call more than once. */
export function uploadSlot(sub) {
  const who = sub || "service";
  if (uploading.has(who)) throw err(429, "you already have an upload running on the bridge — wait for it to finish, then send this one; nothing was saved");
  if (uploading.size >= MAX_UPLOADS) throw err(429, `the bridge is already taking ${MAX_UPLOADS} uploads — try again in a minute; nothing was saved`);
  uploading.add(who);
  let held = true;
  return () => { if (held) { held = false; uploading.delete(who); } };
}

const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost)$/;
/** Why the bridge must not start, or null. Bound beyond loopback it faces the network, so the gate must be armed
 *  (BCF_TOKEN) and able to verify a sign-in (SUPABASE_JWT_SECRET) and forward it (SUPABASE_ANON_KEY). */
export function startRefusal(env) {
  const host = env.BCF_HOST || "127.0.0.1";
  if (LOOPBACK.test(host)) return null;
  const empty = ["BCF_TOKEN", "SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY"].filter((k) => !env[k]);
  if (!empty.length) return null;
  return `refusing to listen on ${host}: ${empty.join(", ")} ${empty.length === 1 ? "is" : "are"} empty — set ${empty.length === 1 ? "it" : "them"} in config/.env, or bind 127.0.0.1`;
}

/** The http server's own limits: request headers within 20 s, a whole request within 30 min (a 2 GB IFC over the
 *  Funnel), at most 256 open sockets. */
export const SERVER_LIMITS = { headersTimeout: 20_000, requestTimeout: 30 * 60_000, maxConnections: 256 };
