// AI privacy (spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md): an office's or a project's ai_policy@n —
// "AI stays on this network: no cloud AI" (local_only) and "names masked in AI answers" (redact) — read by the AI gateway,
// the MCP server (GET /ai/policy) and Revit. The effective policy ORs the office's and the project's: a project adds a
// switch, never takes the office's back. Deps injected (the artefact-store idiom), so it is tested without Supabase.
import { createHash, createHmac } from "node:crypto";
import { loadEnv } from "./load-env.mjs";

const env = { ...process.env, ...loadEnv() };
const err = (status, message) => Object.assign(new Error(message), { status });
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const norm = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase();
export const PROJECT_TOKEN = /^PROJECT_[A-Z2-7]{8}$/;
export const MAX_KEYS = 200;

// The token secret stays on the bridge: derived from its service key, so a token is the same across sessions and restarts,
// and a transcript's token cannot be checked against a guessed name by hashing it. ponytail: a rotated service key renames
// every token — an old token then matches nothing and is refused, never read as another project.
const SECRET = createHash("sha256").update(`sentinel-ai-redact:${env.SUPABASE_SERVICE_KEY || ""}`).digest();

/** KIND_ + 8 base32 characters (40 bits: two of an office's thousand people share one with odds of about 1 in 2000) of
 *  HMAC-SHA256(secret, "KIND:normalised text"). */
export function tokenFor(kind, text, secret = SECRET) {
  let n = createHmac("sha256", secret).update(`${kind}:${norm(text)}`).digest().readUIntBE(0, 5), s = "";
  for (let i = 0; i < 8; i++) { s += B32[n % 32]; n = Math.floor(n / 32); }
  return `${kind}_${s}`;
}

async function wire(deps = {}) {
  const art = deps.getArtefact && deps.officeArtefact ? null : await import("./artefact-store.mjs");
  const cde = deps.ensureProject && deps.officeRow && deps.listProjects ? null : await import("./cde-store.mjs");
  const mem = deps.identitiesOf ? null : await import("./members-store.mjs");
  return {
    getArtefact: deps.getArtefact || art.getArtefact,
    officeArtefact: deps.officeArtefact || art.officeArtefactAsService,
    ensureProject: deps.ensureProject || cde.ensureProject,
    // The office's row with the service key: a member of the project need not be a member of its office.
    officeRow: deps.officeRow || (async (k) => (await cde.sb(`projects?key=eq.${encodeURIComponent(k)}&select=*`, { service: true }))?.[0] ?? null),
    listProjects: deps.listProjects || cde.listProjects,
    identitiesOf: deps.identitiesOf || mem.identitiesOf,
    secret: deps.secret || SECRET,
    cache: deps.cache || TERMS,
  };
}

// ponytail: the redaction list per project for 60 s in this process (it costs one GoTrue read per person) — a person added
// in that minute is masked from the next minute; a shared cache if the bridge ever runs as more than one process.
const TERMS = new Map();
const TERMS_MS = 60_000;

/** The names Sentinel holds for a project, as [{text, token, kind}]: its key and name (PROJECT_, one token, the key first so
 *  a token passed back is the key), owner and appointing party (CLIENT_), address and location (ADDRESS_, the office's too),
 *  and every member of the project and its office (PERSON_: the e-mail first, then the name, one token). */
async function termsOf(proj, office, d) {
  const hit = d.cache.get(proj.id);
  if (hit && Date.now() - hit.at < TERMS_MS) return hit.terms;
  const terms = [];
  // Every text in a value: a string, a {name}, or a list of them (settings are not typed: an owner may be a list, review L3).
  const texts = (v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(texts) : typeof v?.name === "string" ? [v.name] : []);
  const add = (kind, value, seed) => {
    for (const t of texts(value)) if (t.trim()) terms.push({ kind, text: t.trim(), token: tokenFor(kind, seed ?? t, d.secret) });
  };
  add("PROJECT", proj.key);
  add("PROJECT", proj.name, proj.key);
  const s = proj.metadata?.settings ?? {};
  add("PROJECT", s.project_number, proj.key);
  add("CLIENT", s.owner);
  add("CLIENT", proj.appointing_party);
  add("ADDRESS", s.address);
  add("ADDRESS", s.location);
  if (office) {
    add("OFFICE", office.key);
    add("OFFICE", office.name, office.key);
    add("ADDRESS", office.metadata?.settings?.address);
    add("ADDRESS", office.metadata?.settings?.location);
  }
  // A person not read must not go out unmasked: identitiesOf throws rather than leave anyone out (fail closed). Their name is
  // the one they set on their own account, so only a name of two words or more is a term (review M4): "Dana Okafor" is
  // masked, a one-word name such as "rejected" would rewrite every answer of the office and is not; the e-mail always is.
  for (const p of await d.identitiesOf([proj.id, office?.id].filter(Boolean))) {
    const seed = String(p.email || p.user_id).toLowerCase();
    add("PERSON", p.email, seed);
    if (typeof p.name === "string" && /\S\s+\S/.test(p.name.trim()) && p.name.length <= 100) add("PERSON", p.name, seed);
  }
  d.cache.set(proj.id, { at: Date.now(), terms });
  return terms;
}

/** The effective AI policy of `key` (a project or an office): {key, token, local_only, redact, set_by, refs, words, terms?}.
 *  The caller's session decides whether they may read it (ensureProject: a non-member is refused). `terms` only when asked
 *  and redaction is on. */
export async function policyFor(key, { terms = false } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const own = await d.getArtefact(key, "ai_policy");
  const officeKey = proj.kind === "office" ? null : proj.office_key ?? null;
  const office = officeKey ? await d.officeArtefact(officeKey, "ai_policy") : null;
  const on = (doc, f) => doc?.body?.[f] === true;
  const by = (f) => (on(office, f) ? "office" : on(own, f) ? "project" : null);
  const set_by = { local_only: by("local_only"), redact: by("redact") };
  const refs = { project: own ? `ai_policy@${own.version}` : null, office: office ? `ai_policy@${office.version}` : null, office_key: officeKey };
  const local_only = set_by.local_only !== null, redact = set_by.redact !== null;
  const whose = (f) => (set_by[f] === "office" ? `the office's AI policy (${officeKey}, ${refs.office})` : `the project's AI policy (${refs.project})`);
  const words = local_only ? `AI stays on this network for ${key}: ${whose("local_only")} allows no cloud AI.`
    : `Cloud AI is allowed for ${key}: no AI policy keeps it on this network.`;
  const out = { key, token: tokenFor("PROJECT", key, d.secret), local_only, redact, set_by, refs, words };
  if (terms && redact) out.terms = await termsOf(proj, officeKey ? await d.officeRow(officeKey) : null, d);
  return out;
}

/** A requested key that is a project token (PROJECT_XXXXX, from a masked answer) → the caller's project it stands for;
 *  anything else is returned as it is. A token none of the caller's projects has is a 404 in words. */
async function resolveKey(k, list, d) {
  if (!PROJECT_TOKEN.test(k)) return k;
  const rows = await list();
  const hit = (rows || []).find((p) => tokenFor("PROJECT", p.key, d.secret) === k);
  if (hit) return hit.key;
  if ((rows || []).some((p) => p.key === k)) return k;
  throw err(404, `${k} is not one of your projects — a project token is valid only for the projects you can read`);
}

/** GET /ai/policy?project=k1,k2[&terms=1] → {policies: {requested: policy | {error, status}}}. One failure stays its own. */
export async function policies(keys, { terms = false } = {}, deps) {
  if (!Array.isArray(keys) || !keys.length || keys.length > MAX_KEYS) throw err(400, `name 1 to ${MAX_KEYS} projects: ?project=key1,key2`);
  const d = await wire(deps);
  let rows; // the caller's projects, read once for every token in the request (review L5)
  const list = async () => (rows ??= d.listProjects());
  const out = {};
  await Promise.all([...new Set(keys)].map(async (k) => {
    try { out[k] = await policyFor(await resolveKey(k, list, d), { terms }, deps); }
    catch (e) { out[k] = { error: String(e?.message || e), status: e?.status || 500 }; }
  }));
  return { policies: out };
}
