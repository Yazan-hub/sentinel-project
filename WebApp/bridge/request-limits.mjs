// Request limits for the bridge (H0, decisions D8 and D9). The caps read process.env when a body is read
// (bcf-service.mjs has merged config/.env into it by then), so tests drive them with plain streams; the caller is the
// request's auth context (bridge-auth.mjs), the machine credential when there is none.
import { currentSub } from "./bridge-auth.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const MB = 1024 * 1024;

/** A JSON body is parsed whole in memory: 16 MB by default, BCF_MAX_JSON_MB overrides. */
export const jsonCap = () => (Number(process.env.BCF_MAX_JSON_MB) || 16) * MB;
/** A raw upload (an IFC, an encrypted blob) is held whole in memory: 2 GB by default, BCF_MAX_UPLOAD_MB overrides. */
export const uploadCap = () => (Number(process.env.BCF_MAX_UPLOAD_MB) || 2048) * MB;
/** Bodies that are a prompt or a few fields (/ai/*, compile-ids): nothing real comes near 1 MB. */
export const SMALL_JSON = 1 * MB;

// JSON.parse holds many times its text in memory, so the JSON bytes being read and parsed at once across every request
// are bounded too: four bodies at the cap.
const json = { used: 0 };
// H0 minor N3: the shared budget above is 4 x jsonCap() for EVERYONE, signed-in or not — a signed-in caller could
// fill it alone by holding ~4 bodies at the cap (or many small ones) and 503 every other JSON write, including the
// machine credential's own. Charging each signed-in sub at most one jsonCap() in flight keeps the shared budget
// available to others; the machine credential (no sub) is exempt, as it always was for the reads-in-flight cap below.
const jsonBySub = new Map(); // sub -> bytes currently in flight

// Bodies are bounded in time as well as in size. The server's requestTimeout (30 min) is there for a 2 GB upload over
// the Funnel; left alone, 256 bodies that never finish would hold every socket the server accepts (maxConnections) for
// that long, and every caller — Revit and the web on loopback too — would be dropped.
const STALL_MS = 30_000; // any body: this long without a byte is a 408
const JSON_MS = 2 * 60_000; // a JSON body arrives whole within 2 min (16 MB needs ~1.1 Mbps). ponytail: one deadline;
// a minimum-rate rule if a real 16 MB body over a slow link ever needs longer.
// SEC-6 (S21): a raw upload has no overall deadline (a large IFC over the Funnel may need most of the server's 30 min), so it
// keeps an average rate instead: once its first BCF_UPLOAD_GRACE_S (120 s) are over, an upload whose average falls below
// BCF_MIN_UPLOAD_KBPS (16 KB/s) is a 408. ponytail: one floor for every raw route — the founder raises it from the measured
// "[upload]" lines (founder decision I-a).
const uploadGraceMs = () => (Number(process.env.BCF_UPLOAD_GRACE_S) || 120) * 1000;
const minUploadKbps = () => Number(process.env.BCF_MIN_UPLOAD_KBPS) || 16;

/** The body's bytes, or a refusal in words: a declared length over `max` is a 413 before a byte is read, a streamed
 *  body (chunked, or a length that lied) a 413 the moment it passes `max`. The rest is never kept — send() closes the
 *  connection after a 413. A `lease` charges the bytes to the shared JSON budget (503 when it is full). A body that
 *  sends nothing for 30 s, or a JSON body not whole within 2 min, is a 408 (send() closes that connection too). */
function readBytes(req, max, lease, sub) {
  return new Promise((resolve, reject) => {
    const over = () => err(413, `the request body is over the ${Math.round(max / MB)} MB limit for this route — nothing was read or saved`);
    if (Number(req.headers?.["content-length"] || 0) > max) return reject(over());
    // A caller that went away while the route was still deciding: its "end" or "close" has fired already, so nothing
    // would ever settle this read.
    if (req.destroyed || req.readableAborted) return reject(err(400, "the request ended before its body did — nothing was saved"));
    let chunks = [], total = 0, settled = false;
    const started = Date.now(), grace = lease ? 0 : uploadGraceMs(), floor = minUploadKbps();
    const slow = (why) => () => fail(err(408, `the request body ${why} — nothing was saved`));
    const stall = setTimeout(slow(`stopped arriving (nothing for ${STALL_MS / 1000} s)`), STALL_MS); // restarted by each chunk
    const deadline = lease ? setTimeout(slow(`took over ${JSON_MS / 60_000} min to arrive`), JSON_MS) : null;
    const stop = () => { settled = true; clearTimeout(stall); clearTimeout(deadline); };
    const fail = (e) => { if (settled) return; stop(); chunks = null; reject(e); };
    req.on("data", (c) => {
      if (settled) return; // refused: the rest flows past, nothing is kept
      stall.refresh();
      total += c.length;
      if (total > max) return fail(over());
      const ms = Date.now() - started;
      if (grace && ms > grace && total / 1024 / (ms / 1000) < floor)
        return fail(err(408, `the upload arrived slower than ${floor} KB/s on average after its first ${grace / 1000} s — nothing was saved; try again on a faster connection`));
      if (lease) {
        if (json.used + c.length > 4 * jsonCap()) return fail(err(503, "the bridge is reading too many large requests at once — nothing was saved; try again in a moment"));
        if (sub) {
          const mine = jsonBySub.get(sub) || 0;
          if (mine + c.length > jsonCap())
            return fail(err(429, "you already have too much JSON in flight on this account — wait for it to finish; nothing was saved"));
          jsonBySub.set(sub, mine + c.length);
        }
        json.used += c.length;
        lease.held += c.length;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (settled) return;
      stop();
      if (!lease) { // SEC-6: the measurement the founder's upload floor is set from — no name, no project, no caller
        const s = (Date.now() - started) / 1000;
        console.log(`[upload] ${(total / MB).toFixed(1)} MB in ${s.toFixed(1)} s (${Math.round(total / 1024 / Math.max(s, 0.001))} KB/s)`);
      }
      resolve(Buffer.concat(chunks, total));
    });
    const cut = () => fail(err(400, "the request ended before its body did — nothing was saved"));
    req.on("error", cut);
    req.on("close", cut); // after "end" this is a no-op
  });
}

// A signed-in caller reads at most 8 JSON bodies at once (the machine credential is not counted): with the deadlines
// above, one account cannot hold more than 8 of the server's sockets with bodies it never finishes, whereas a body is
// read before the route checks membership. ponytail: per account — many accounts multiply the 8 while sign-up is open
// (D1); a global cap on signed-in body reads if that is ever seen.
const MAX_READS_PER_CALLER = 8;
const readingBy = new Map();

/** A JSON request body, parsed: {} when it is empty, not JSON, or JSON that is not an object (`null`, `"x"`, `5`,
 *  an array) — every route destructures the result as an object, and a route reading nothing back is a 400 in
 *  words downstream, never a 500 TypeError. Over `max` → 413; the shared budget full → 503; a ninth body at once
 *  from the same signed-in account → 429, unread. Bytes are collected before decoding, so a character split
 *  across two chunks survives. */
export async function readBody(req, { max = jsonCap() } = {}) {
  const who = currentSub();
  const mine = (who && readingBy.get(who)) || 0;
  if (mine >= MAX_READS_PER_CALLER) throw err(429, `you are sending more than ${MAX_READS_PER_CALLER} requests at once — nothing was saved; wait for them to finish`);
  if (who) readingBy.set(who, mine + 1);
  const lease = { held: 0 };
  try {
    const text = (await readBytes(req, max, lease, who)).toString("utf8");
    try {
      const v = text ? JSON.parse(text) : {};
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch { return {}; }
  } finally {
    json.used -= lease.held;
    if (who) {
      const n = readingBy.get(who) - 1; if (n) readingBy.set(who, n); else readingBy.delete(who);
      const held = (jsonBySub.get(who) || 0) - lease.held; if (held > 0) jsonBySub.set(who, held); else jsonBySub.delete(who);
    }
  }
}

/** A raw upload's bytes (an IFC, a document, ciphertext); over `max` → 413. The caller holds an uploadSlot. */
export const readRaw = (req, { max = uploadCap() } = {}) => readBytes(req, max, null);

// At most two large uploads at once across the bridge, one per caller. ponytail: every upload is held whole in memory
// (2 × 2 GB worst case); stream to a temp file if uploads ever need to run wider.
const MAX_UPLOADS = 2;
const uploading = new Set();

/** Take an upload slot for `sub` (the verified sign-in's user id; every machine caller shares "service") or throw a
 *  429 in words. Returns the release, which is safe to call more than once. SEC-6 (S21): the machine credential's slot is
 *  its own, beside the two — signed-in uploads never lock Revit or the outbox out. */
export function uploadSlot(sub) {
  const who = sub || "service";
  if (uploading.has(who)) throw err(429, "you already have an upload running on the bridge — wait for it to finish, then send this one; nothing was saved");
  if (who !== "service" && [...uploading].filter((w) => w !== "service").length >= MAX_UPLOADS)
    throw err(429, `the bridge is already taking ${MAX_UPLOADS} uploads — try again in a minute; nothing was saved`);
  uploading.add(who);
  let held = true;
  return () => { if (held) { held = false; uploading.delete(who); } };
}

/** Take `sub`'s upload slot for this request, released when its answer is done ("close" on res). A route checks the
 *  caller's role first (a PostgREST read or two); a caller that went away meanwhile has had its "close" already, so
 *  its slot would never be released — that is a refusal instead, with the slot freed at once. */
export function holdUpload(req, res, sub) {
  const release = uploadSlot(sub);
  if (res.destroyed || req.destroyed) { release(); throw err(400, "the caller went away before the upload started — nothing was saved"); }
  res.once("close", release);
}

const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost)$/;
/** Why the bridge must not start, or null. The gate is armed whatever the bind (SEC-1): a loopback bridge can still be
 *  published beyond this PC, so an empty (or blank) BCF_TOKEN stops it. Bound beyond loopback it must also verify a sign-in
 *  (SUPABASE_JWT_SECRET) and forward it (SUPABASE_ANON_KEY). */
export function startRefusal(env) {
  if (!String(env.BCF_TOKEN ?? "").trim()) return "refusing to start: BCF_TOKEN is empty — set it in config/.env (every route but GET /health needs it or a sign-in)";
  const host = env.BCF_HOST || "127.0.0.1";
  if (LOOPBACK.test(host)) return null;
  const empty = ["SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY"].filter((k) => !env[k]);
  if (!empty.length) return null;
  return `refusing to listen on ${host}: ${empty.join(", ")} ${empty.length === 1 ? "is" : "are"} empty — set ${empty.length === 1 ? "it" : "them"} in config/.env, or bind 127.0.0.1`;
}

/** The http server's own limits: request headers within 20 s, a whole request within 30 min (a 2 GB IFC over the
 *  Funnel), at most 256 open sockets. */
export const SERVER_LIMITS = { headersTimeout: 20_000, requestTimeout: 30 * 60_000, maxConnections: 256 };
