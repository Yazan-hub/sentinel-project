import { randomUUID } from "node:crypto";
// Sentinel CDE store — Supabase-backed ISO 19650 information-container access for the bridge (C3).
// Zero-dep: talks to Supabase PostgREST + RPC over fetch with the SERVICE key (server-side only, never
// the browser). The state machine, published-immutability, and hash-chained audit all live in the DB
// (migrations 0001/0002) — this module is a thin REST wrapper the web app's CDE panel calls via the bridge.
//
// Config (config/.env, never committed):
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role secret from Supabase → Project Settings → API>

import { loadEnv } from "./thatopen-client.mjs";
import { normalizeAgent, buildReceipt, verifyReceipt } from "./agent-provenance.mjs";
import { currentUserToken, currentActor, resolveActor, currentSub } from "./bridge-auth.mjs";
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
import { typeGapId } from "./holding-logic.mjs"; // MA-2c: a type-gap group's id

const env = { ...process.env, ...loadEnv() }; // config/.env is authoritative
const URL = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_KEY || "";
const ANON = env.SUPABASE_ANON_KEY || ""; // enables JWT-forwarding when set; without it the bridge stays service-key only

export const cdeConfigured = () => !!(URL && KEY);

/** Client-supplied ids go into uuid-typed PostgREST filters; a non-UUID makes Postgres throw a cast
 *  error that surfaces as a 500. Guard at every entry point that takes a caller's id: a malformed id
 *  can never match a row, so it is a plain 404 — decided before any network call. */
export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
/** SEC-1 (A): a topic's or a viewpoint's guid — the UUID a caller sent, or a new one when none was sent (the web and Revit send
 *  none); anything else is a 400 before anything is saved. */
export function guidOrNew(v) {
  if (v == null || v === "") return randomUUID();
  if (!isUuid(v)) throw Object.assign(new Error("a guid is a UUID (8-4-4-4-12 hex) — nothing was saved"), { status: 400 });
  return String(v);
}
/** True once JWT-forwarding is armed (anon key present). Forwarding still only kicks in per-request when a
 *  caller actually presents a Supabase JWT; otherwise sb() uses the service key. */
export const forwardingConfigured = () => !!ANON;

// Forward the caller's Supabase JWT (RLS-enforced) when one is present AND forwarding is armed; else use the
// service key. `service: true` FORCES the service key for privileged writes that RLS blocks for authed users
// (audit_log inserts, bridge_events) — those must bypass RLS by design.
// `count: true` adds Prefer count=exact and returns { data, total }: total is the N of Content-Range "a-b/N", or of
// "*/N" for an empty page or a 416 (an offset past the end), both data []. A reply with no N is an error, never a
// planned or estimated count.
export async function sb(path, { method = "GET", body, prefer, service = false, count = false } = {}) {
  if (!cdeConfigured()) throw new Error("CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  const userToken = service ? null : currentUserToken();
  const useUser = !!(userToken && ANON);
  const headers = {
    apikey: useUser ? ANON : KEY,
    Authorization: `Bearer ${useUser ? userToken : KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer || count) headers.Prefer = [prefer, count && "count=exact"].filter(Boolean).join(",");
  // Postgres text/JSONB cannot hold a NUL () — error 22P05 "unsupported Unicode escape sequence". Real
  // authoring tools (Revit among them) occasionally emit a stray NUL inside an element name / parameter value,
  // which then rides into an audit/snapshot/BCF write and 500s the whole request. A NUL in a BIM string is
  // always spurious, so strip it from every write payload here, at the single Supabase write chokepoint.
  // Also strip LONE UTF-16 surrogates (\uD800–\uDFFF): Postgres jsonb rejects them too (22P05). Valid surrogate
  // PAIRS are emitted by JSON.stringify as literal characters (never as \u escapes), so any \uD8xx–\uDFxx escape
  // in the serialized output is a lone surrogate and safe to drop.
  const payload = body
    ? JSON.stringify(body).replace(/\\u0000/g, "").replace(/\\ud[89a-f][0-9a-f]{2}/gi, "")
    : undefined;
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers, body: payload });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (count && (r.ok || r.status === 416)) {
    const range = r.headers.get("content-range") || "";
    const m = /^(\*|\d+-\d+)\/(\d+)$/.exec(range);
    if (!m) throw new Error(`Supabase gave no exact count (Content-Range: ${range || "none"})`);
    return { data: m[1] === "*" ? [] : data, total: Number(m[2]) };
  }
  if (!r.ok) {
    const err = new Error(`Supabase ${r.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    // Surface auth/permission failures with their real client status instead of a generic 500, so a caller
    // whose forwarded JWT is missing/expired/invalid gets a 401 (→ the web app can prompt re-login) and an
    // RLS/row-security denial gets a 403. Routes propagate this via `e?.status || 500`. Other upstream codes
    // (e.g. a malformed query) stay 500 by default — they signal a bridge bug, not a client-fixable one.
    if (r.status === 401 || r.status === 403) err.status = r.status;
    err.body = data; // PostgREST's { code, message, … } — lets a caller map a function's own refusal (transition)
    throw err;
  }
  return data;
}

/** A write the database refused is not an error to PostgREST: RLS filters the rows an UPDATE or DELETE may touch, so
 *  a refused one answers 200/204 having changed nothing (inserts and upserts do raise — 42501, a 403). Every PATCH and
 *  DELETE that is followed by a ledger row asks for its rows (Prefer: return=representation) and passes them here
 *  BEFORE the row is written: none back is a 403 in `what`'s words, never a 200 and never a ledger row over nothing
 *  (H0 D5; patchProjectMeta and updateProject were the first). → the rows. */
export function requireRows(rows, what) {
  if (Array.isArray(rows) && rows.length) return rows;
  throw Object.assign(new Error(`${what} — nothing was saved`), { status: 403 });
}

/** One answer for "no such project" and "not yours" (D7; audit ai-3, projects-2): keys are slugs of names, so a
 *  403-for-not-a-member next to a 404-for-unknown let any signed-in account walk the key space. Every route that
 *  resolves a key comes through ensureProject, so the answer is decided once, here. */
export const projectNotFound = (key) => Object.assign(
  new Error(`Project "${key}" was not found, or you are not a member of it — ask its lead to add you, or create it in the web app (Projects → + New project).`),
  { status: 404 },
);

/** Resolve a project KEY to its CDE row. Projects are created ONLY through the web hub's explicit
 *  "+ New project" (createProject) — an unknown key here is a 404, never an implicit INSERT. (The old
 *  create-on-first-use left test residue: every script that touched a key spawned a project row.) The
 *  single exception is "default", the system fallback every unconfigured publish lands in — that one
 *  self-heals so a wiped database can't brick zero-config publishing.
 *  Multi-user safe: when a caller's JWT is being forwarded (RLS on), existence is checked with the SERVICE
 *  key (authoritative — sees every project regardless of membership), then a forwarded RLS-filtered read
 *  confirms the caller is a member. A non-member gets the unknown key's 404 (projectNotFound). */
export async function ensureProject(key) {
  const forwarding = !!(currentUserToken() && ANON);
  const found = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true }); // authoritative
  if (found?.length) {
    const proj = found[0];
    if (forwarding) {
      const visible = await sb(`projects?id=eq.${proj.id}&select=id`); // forwarded → RLS; a member sees it, a non-member doesn't
      if (!visible?.length) throw projectNotFound(key);
    }
    return proj;
  }
  // Only the machine re-creates "default": under a signed-in caller's JWT the insert would make that caller its owner
  // (0004's trigger bootstraps auth.uid()), and every later fallback publish would be theirs to read. A signed-in
  // caller meets an absent "default" as any absent key.
  if (key !== "default" || currentUserToken()) throw projectNotFound(key);
  // "default" self-heals, with the service key (auth.uid() null: no owner). return=minimal, then re-fetch.
  await sb(`projects`, { method: "POST", body: { key, name: key }, prefer: "return=minimal", service: true });
  const created = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true });
  return created[0];
}

// ── Sentinel project metadata (migration 0007) — the governed-project store, unified into the Supabase
// `projects` row's `metadata` jsonb (was the per-machine bridge/project-store.json). The bridge maps this to
// the same JSON shape the web app already expects, so consolidating is transparent to callers.
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
// stage and gates are not metadata since cohesion phase 5c (spec 2026-09-26 Decision 10): the ledger's stage_gate rows
// are the project's stage (projectStage) and its gate history (projectGates). A stage or gates key still in an old row
// is overridden by toProjectShape and read by nothing.
const defaultMeta = () => ({
  standards_pack: "",
  dimensions: { "2d": true, "3d": true, "4d": false, "5d": true, "6d": false, "7d": false },
  snapshot: {}, updated_at: new Date().toISOString(),
});
/** Merge a patch into project metadata with the same field semantics as the old local store (deep-merge
 *  dimensions/snapshot, replace the rest). `name` is handled separately (a real column); `stage` is not a field
 *  here since phase 5c — the ledger decides it (runStageGate). */
function mergeMeta(meta, patch) {
  const out = { ...meta };
  // active_ruleset is retired (cohesion phase 3): the scan ruleset and the naming pack are artefacts
  // (PUT /cde/:key/artefacts/:kind). A value already in the column is left in place and read by nothing.
  for (const k of ["standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
  if (patch.dimensions) out.dimensions = { ...(meta.dimensions || {}), ...patch.dimensions };
  if (patch.snapshot) {
    const merged = { ...(meta.snapshot || {}), ...patch.snapshot };
    const why = snapshotWhy(patch.snapshot) ?? snapshotWhy(merged); // the patch, then what is stored with it
    if (why) throw Object.assign(new Error(`the project's snapshot: ${why} — nothing was saved`), { status: 400 });
    out.snapshot = merged;
  }
  out.updated_at = new Date().toISOString();
  return out;
}
// What a project's snapshot holds (SEC-2): the fields the web writes. Migration 0039's project_snapshot_ok holds the same rule.
export const SNAPSHOT_NUMBERS = ["open_issues", "hard_clashes", "health", "compliance", "cost_total", "carbon_tco2e",
  "handover_readiness", "handover_complete", "handover_total"];
export const SNAPSHOT_TEXT = ["carbon_basis", "handover_at"];
/** Why a snapshot does not fit, or null. */
export function snapshotWhy(s) {
  if (typeof s !== "object" || s === null || Array.isArray(s)) return "a snapshot is an object";
  for (const [k, v] of Object.entries(s)) {
    if (k === "currency") { if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) return "currency is three capital letters (an ISO 4217 code)"; }
    else if (SNAPSHOT_NUMBERS.includes(k)) { if (typeof v !== "number" || !Number.isFinite(v)) return `${k} is a number`; }
    else if (SNAPSHOT_TEXT.includes(k)) { if (typeof v !== "string" || v.length > 300 || /[<>]/.test(v)) return `${k} is text of at most 300 characters, without < or >`; }
    else return `'${k.slice(0, 40)}' is not a snapshot field`;
  }
  return null;
}
/** Test seam: mergeMeta is module-private by design; this exposes it for unit tests only. */
export const mergeMetaForTest = mergeMeta;
// Always present the core governance fields (dimensions/snapshot) even if a migrated row's metadata was partial — so
// consumers never see a null where the local store used to default them. stage and gates come LAST, from the ledger's
// stage_gate rows (gateRows), so a stale metadata.stage can never outrank a gate:pass row.
const toProjectShape = (row, gates = []) => ({ project_id: row.key, name: row.name, ...defaultMeta(), ...(row.metadata || {}), stage: stageOf(gates), gates: gatesOf(gates) });

/** A project's stage_gate rows, newest first: what runStageGate wrote (audit_log, entity_type stage_gate). */
async function gateRows(projectId) {
  // ponytail: the newest 1000 rows; a project runs its gate a handful of times, never that many.
  const rows = await sb(`audit_log?project_id=eq.${projectId}&entity_type=eq.stage_gate&select=id,at,hash,action,new_value&order=id.desc&limit=1000`);
  return Array.isArray(rows) ? rows : [];
}
/** The stage: the newest gate:pass row's next_stage, else the first stage. A hold or a not_checkable run advances nothing. */
const stageOf = (rows) => {
  const s = rows.find((r) => String(r.action || "").startsWith("gate:pass "))?.new_value?.next_stage;
  return STAGES.includes(s) ? s : STAGES[0];
};
/** The newest run per stage, each with the ledger row that holds it: {status, checks, at, ledger: {id, hash}}. */
const gatesOf = (rows) => {
  const out = {};
  for (const r of rows) {
    const v = r.new_value || {};
    if (!STAGES.includes(v.stage) || out[v.stage]) continue;
    out[v.stage] = { status: v.status, checks: Array.isArray(v.checks) ? v.checks : [], at: r.at, ledger: { id: r.id ?? null, hash: r.hash ?? null } };
  }
  return out;
};

/** Read one project in the web app's shape. `seed` (optional) backfills metadata on first access (one-time
 *  migration from the local store; its stage and gates are dropped — the ledger holds those); if the row already
 *  has metadata, `seed` is ignored. */
export async function getProjectMeta(key, seed) {
  const proj = await ensureProject(key);
  const gates = await gateRows(proj.id);
  if (proj.metadata && Object.keys(proj.metadata).length > 0) return toProjectShape(proj, gates);
  const { stage: _stage, gates: _gates, ...seeded } = seed || {};
  // 0039: the local seed's snapshot keeps only the fields that fit; each one dropped is said, once, in the bridge's log.
  if (seeded.snapshot !== undefined) {
    const kept = {};
    for (const [k, v] of Object.entries(seeded.snapshot ?? {})) {
      const why = snapshotWhy({ [k]: v });
      if (why) console.warn(`[projects] '${key}': the local snapshot field '${k}' is not migrated (${why})`);
      else kept[k] = v;
    }
    seeded.snapshot = kept;
  }
  const metadata = { ...defaultMeta(), ...(Object.keys(seeded).length ? seeded : {}) }; // complete metadata on seed
  const row = (await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body: { metadata }, prefer: "return=representation" }))?.[0];
  // F-MA3a-1: under a forwarded session only a lead or owner may write the project — a refused write answers no row. A read
  // never fails on that: the reader gets the default details, and the next lead or owner read writes them.
  return toProjectShape(row ?? { ...proj, metadata }, gates);
}

/** List every project in the web app's shape (project switcher / hub). Core fields defaulted via toProjectShape. */
export async function listProjectMeta() {
  const rows = await sb(`projects?select=id,key,name,metadata&order=created_at.desc`);
  // ponytail: one ledger read per project on the hub list; one grouped read if a hub outgrows a few dozen projects.
  return Promise.all((rows || []).map(async (r) => toProjectShape(r, await gateRows(r.id))));
}

/** Patch a project's metadata (dims/snapshot/rate_pack/boq_baseline/carbon_baseline/name). A `stage` in the patch is
 *  ignored: the stage is the ledger's (POST /cde/:key/gate). */
export async function patchProjectMeta(key, patch = {}) {
  // Refuse rather than silently drop: a stale client that still "installs" a pack this way must see it failed.
  if (patch.active_ruleset !== undefined) throw Object.assign(new Error("active_ruleset is retired — install the scan ruleset with PUT /cde/:key/artefacts/ruleset and the naming pack with PUT /cde/:key/artefacts/naming"), { status: 400 });
  const proj = await ensureProject(key);
  const metadata = mergeMeta((proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta(), patch);
  const body = { metadata };
  if (patch.name !== undefined) body.name = patch.name;
  const rows = await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" });
  const row = Array.isArray(rows) ? rows[0] : null;
  // Under a forwarded session the database's projects_update policy lets only a lead or owner write: a refused write
  // updates nothing and comes back with no row — say so, never read a missing row (it was a 500).
  if (!row) throw Object.assign(new Error("the project's details are changed by a lead or owner — nothing was saved"), { status: 403 });
  return toProjectShape(row, await gateRows(proj.id));
}

/** The project's stage: the newest gate:pass row's next_stage on its ledger, else tender. */
export async function projectStage(key) { return stageOf(await gateRows((await ensureProject(key)).id)); }
/** The newest gate run per stage, {stage: {status, checks, at, ledger: {id, hash}}}, from the ledger. */
export async function projectGates(key) { return gatesOf(await gateRows((await ensureProject(key)).id)); }

/** POST /cde/:key/gate (cohesion phase 5c, spec Decision 10): a lead runs the CURRENT stage's gate; the bridge measures
 *  the inputs itself (stage-gate.mjs) and writes the run as one stage_gate row — gate:pass | gate:hold |
 *  gate:not_checkable <stage>, new_value {stage, status, checks, next_stage} — through the internal writer the open audit
 *  route refuses. A run that could not be checked is still a fact and advances nothing (the spec names pass and hold;
 *  this row is the third). The reply is the measurement plus the row's id and hash: a line may say "ledger #id ·
 *  receipt …" only from those. */
export async function runStageGate(key, stage, actor) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const proj = await ensureProject(key);
  const current = stageOf(await gateRows(proj.id));
  if (stage !== current) throw Object.assign(new Error(`the gate to run is the current stage's: ${current}`), { status: 409 });
  if (stage === STAGES[STAGES.length - 1]) throw Object.assign(new Error(`${stage} is the final stage — there is no gate to run`), { status: 409 });
  const { measureGate, readGateInputs } = await import("./stage-gate.mjs");
  const result = measureGate(stage, await readGateInputs(key));
  const row = await audit(proj.id, "stage_gate", proj.id, `gate:${result.status} ${stage}`, actor || "web", null,
    { stage, status: result.status, checks: result.checks, next_stage: result.next_stage });
  return { ...result, ledger: { id: row?.id ?? null, hash: row?.hash ?? null } };
}

// ── Projects hub (the "which project?" layer above the per-project CDE board) ──────────────────────────

/** Slugify a free-text name into a stable, URL-safe project key. */
function slugKey(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Every project's identity and office relation, service-key read (the office helpers need to see rows the
 *  caller is not a member of, e.g. a project's office). Rows from before migration 0029 have no kind/office_key. */
export async function listProjectRows() {
  let rows;
  try {
    rows = await sb(`projects?select=id,key,name,kind,office_key&order=created_at.asc`, { service: true });
  } catch (e) {
    if (!/column .* does not exist|42703/.test(String(e?.message || e))) throw e;
    rows = await sb(`projects?select=id,key,name&order=created_at.asc`, { service: true });
  }
  return (rows || []).map((r) => ({ id: r.id, key: r.key, name: r.name, kind: r.kind ?? "project", office_key: r.office_key ?? null }));
}
export { officeKeyOf, listOfficeProjects, projectScope } from "./office-scope.mjs";

/** List every CDE project (newest first) with a container count — the hub's card data. */
export async function listProjects() {
  // PostgREST embeds an aggregate as information_containers:[{count}].
  let rows;
  try {
    rows = await sb(
      `projects?select=id,key,name,appointing_party,status_scheme,created_at,metadata,kind,office_key,information_containers(count)&information_containers.deleted_at=is.null&order=created_at.desc`,
    );
  } catch (e) {
    if (!/column .* does not exist|42703/.test(String(e?.message || e))) throw e;
    rows = await sb(
      `projects?select=id,key,name,appointing_party,status_scheme,created_at,metadata,information_containers(count)&order=created_at.desc`,
    );
  }
  const byKey = new Map(rows.map((p) => [p.key, p.name]));
  return (rows || []).map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    appointing_party: p.appointing_party ?? null,
    status_scheme: p.status_scheme ?? null,
    created_at: p.created_at,
    settings: p.metadata?.settings ?? null, // Forma-style settings (owner, address, archived, …)
    container_count: Array.isArray(p.information_containers) ? p.information_containers[0]?.count ?? 0 : 0,
    kind: p.kind ?? "project",
    office_key: p.office_key ?? null,
    office_name: p.office_key ? byKey.get(p.office_key) ?? null : null,
  }));
}

// D3's words for an office asked for by anyone but a platform admin — the database's too (0033 projects_office_guard).
const OFFICE_BY_ADMIN = "an office is created by a platform admin — nothing was saved";

/** Create a CDE project (idempotent on the derived key) and seed its default folder tree. */
export async function createProject(b = {}) {
  const key = slugKey(b.key || b.name);
  if (!key) throw new Error("A project name or key is required");
  // SEC-4: a key is a slug of words, never uuid-shaped (0041).
  if (isUuid(key)) throw Object.assign(new Error("a project key is not a uuid — choose a name with words in it (nothing was created)"), { status: 400 });
  // The system fallback is the machine's (ensureProject self-heals it): a signed-in creator would become its owner.
  if (key === "default" && currentUserToken())
    throw Object.assign(new Error("'default' is the system fallback project — choose another key; nothing was created"), { status: 403 });
  const existing = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`);
  if (existing?.length) {
    await ensureFolders(existing[0].id);
    return existing[0];
  }
  const kind = b.kind === "office" ? "office" : "project";
  const officeKey = b.office_key ? String(b.office_key).trim() || null : null;
  // D3 (H0): an office is made by a platform admin, and a project joins an office only through a lead of that office
  // (cde-1, cde-rem-1, bimdocs-5). Migration 0033 refuses both in the database as well; asking first answers in words
  // before anything is written.
  const members = await import("./members-store.mjs");
  if (kind === "office" && !(await members.isPlatformAdmin())) throw Object.assign(new Error(OFFICE_BY_ADMIN), { status: 403 });
  if (officeKey) await members.requireOfficeLead(officeKey);
  // H0 (cde-6): any account may create projects (each one 8 folder rows and a ledger row), so a signed-in caller's new
  // projects are budgeted (takeWriteBudget); the machine credential's are not.
  takeWriteBudget("new projects", { perUser: 5, all: 30 });
  // return=minimal on purpose (same trap ensureProject documents): under a FORWARDED session the
  // returning-select runs the is_member policy before the owner-membership row the insert trigger
  // just created is visible → 42501/403 and the whole insert rolls back. Insert minimal, then
  // re-fetch with the service key.
  try {
    await sb(`projects`, {
      method: "POST",
      body: { key, name: (b.name || key).trim(), appointing_party: b.appointing_party || null, kind, office_key: officeKey },
      prefer: "return=minimal",
    });
  } catch (e) {
    // The existence read above is RLS-filtered, so a key held by a project the caller cannot see reaches the insert and
    // hits projects.key unique (23505). Say so in words (409) instead of a scrubbed 500. A create on a taken key can only
    // fail, so this names nothing a prober lacks (ai-3, cde-9).
    if (e?.body?.code === "23505") throw Object.assign(new Error(`The name "${key}" is taken — choose another name (nothing was created).`), { status: 409 });
    // 0029/0033's projects_office_guard (H0 minor N17): office_key must name a row of kind office. requireOfficeLead
    // checks lead/admin, not kind, so an admin or the machine credential naming a plain project's key as office_key
    // reaches the database guard, which raises P0001 with no SQLSTATE the client would use — say so in words (400).
    if (e?.body?.code === "P0001") throw Object.assign(new Error(String(e.body.message || "office_key must name a project of kind office")), { status: 400 });
    throw e;
  }
  const row = (await sb(`projects?key=eq.${encodeURIComponent(key)}&select=*`, { service: true }))[0];
  await ensureFolders(row.id);
  await audit(row.id, "project", row.id, "created", b.actor || "web", null,
    { key, name: row.name, kind: row.kind, office_key: row.office_key ?? null });
  return row;
}

// Forma-style project settings live under metadata.settings so they never collide with the governance
// fields (dimensions/snapshot) that share the same jsonb column.
const SETTINGS_FIELDS = [
  "address", "location", "owner", "project_number", "project_type",
  "start_date", "completion_date", "project_value", "archived",
  // The That Open platform project this Sentinel project opens in by itself (a lead links it in Settings): the
  // published app cannot remember a choice between visits, so without it every visit starts on the projects list.
  "platform_project_id",
];

/** Update a project's identity + Forma-style settings (rename, owner, address, dates, archive…).
 *  The key is never changed — it's the stable identifier every store hangs off. RLS (when a JWT is
 *  forwarded) requires the 'lead' role via projects_update. */
export async function updateProject(key, patch = {}, actor) {
  if (patch.platform_project_id !== undefined && patch.platform_project_id !== null
      && !(typeof patch.platform_project_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(patch.platform_project_id))) {
    throw Object.assign(new Error("platform_project_id must be a platform project id (letters, digits, - or _) or null to unlink"), { status: 400 });
  }
  const proj = await ensureProject(key);
  // SEC-4 (S16): one live project links a platform project (0041's index) — said in words before the write (a service
  // read: the other project need not be the caller's); an archived project's old link is no conflict.
  // The link the write makes live: a new one, or (a restore from archived) the one the project already names.
  const link = patch.platform_project_id !== undefined ? patch.platform_project_id : proj.metadata?.settings?.platform_project_id ?? null;
  const restoring = patch.platform_project_id === undefined && patch.archived !== undefined && String(patch.archived) !== "true";
  const linkHeld = () => Object.assign(new Error(`another Sentinel project already links platform project ${link} — unlink it there first; nothing was saved`), { status: 409 });
  if (link && (patch.platform_project_id || restoring)) {
    const held = await sb(`projects?metadata->settings->>platform_project_id=eq.${encodeURIComponent(link)}&id=neq.${proj.id}&select=id,archived:metadata->settings->archived`, { service: true });
    if ((held || []).some((p) => p.id !== proj.id && String(p.archived) !== "true")) throw linkHeld();
  }
  const body = {};
  if (patch.name !== undefined && String(patch.name).trim()) body.name = String(patch.name).trim();
  if (patch.appointing_party !== undefined) body.appointing_party = patch.appointing_party || null;
  if (patch.office_key !== undefined) body.office_key = patch.office_key ? String(patch.office_key).trim() || null : null;
  if (patch.kind !== undefined) {
    if (!["project", "office"].includes(patch.kind)) { const e = new Error("kind must be project or office"); e.status = 400; throw e; }
    body.kind = patch.kind;
  }

  const hasSettings = SETTINGS_FIELDS.some((f) => patch[f] !== undefined);
  if (hasSettings) {
    const meta = (proj.metadata && Object.keys(proj.metadata).length) ? proj.metadata : defaultMeta();
    const settings = { ...(meta.settings || {}) };
    for (const f of SETTINGS_FIELDS) if (patch[f] !== undefined) settings[f] = patch[f];
    body.metadata = { ...meta, settings, updated_at: new Date().toISOString() };
  }
  if (!Object.keys(body).length) return proj;
  // D3 (H0), as in createProject. Only a change is asked about: re-sending the office a project already has is no
  // attach, and detaching (null) stays the project's own lead's write (projects_update).
  const members = await import("./members-store.mjs");
  if (body.kind === "office" && proj.kind !== "office" && !(await members.isPlatformAdmin())) throw Object.assign(new Error(OFFICE_BY_ADMIN), { status: 403 });
  if (body.office_key && body.office_key !== (proj.office_key ?? null)) await members.requireOfficeLead(body.office_key);

  let rows;
  try {
    rows = await sb(`projects?id=eq.${proj.id}`, { method: "PATCH", body, prefer: "return=representation" });
  } catch (e) {
    // 0041's projects_one_live_platform_link: a link another live project took meanwhile — the same words as the read above.
    if (e?.body?.code === "23505" && /projects_one_live_platform_link/.test(String(e.body.message || ""))) throw linkHeld();
    // 0029/0033's projects_office_guard (H0 minor N17): office_key must name a row of kind office. requireOfficeLead
    // checks lead/admin, not kind, so an admin or the machine credential naming a plain project's key as office_key
    // reaches the database guard, which raises P0001 with no SQLSTATE the client would use — say so in words (400).
    if (e?.body?.code === "P0001") throw Object.assign(new Error(String(e.body.message || "office_key must name a project of kind office")), { status: 400 });
    throw e;
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  // As in patchProjectMeta: a write the projects_update policy refused comes back with no row — a 403, never a 200.
  if (!row) throw Object.assign(new Error("the project's settings are changed by a lead or owner — nothing was saved"), { status: 403 });
  await audit(proj.id, "project", proj.id, "updated", actor || "web", null,
    {
      key, ...(body.name ? { name: body.name } : {}), ...(hasSettings ? { settings: body.metadata.settings } : {}),
      ...(body.office_key !== undefined ? { office_key: { from: proj.office_key ?? null, to: body.office_key } } : {}),
      ...(body.kind !== undefined ? { kind: { from: proj.kind ?? "project", to: body.kind } } : {}),
    });
  return row;
}

/** Delete a project and everything the schema cascades (containers, versions, folders, parties,
 *  memberships, transmittals, snapshots). Deliberately preserved: the audit_log trail (immutable
 *  evidence, undeletable by design). H0 (D12, finding cde-3): the owner's alone — a 403 before anything is
 *  touched — and the database's delete comes FIRST: a delete projects_delete refused (no row back) is a 403
 *  and nothing else is touched; a project with PUBLISHED versions is a 409 with an archive-instead message
 *  (trg_protect_published). Only then the ledger row (audit_log has no FK, so it outlives the project — the
 *  golden thread) and the text-keyed side stores (no FK — they would orphan silently), cleared with the
 *  service key: the caller's membership went with the project, so a forwarded delete would match no row. */
export async function deleteProject(key, actor) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "owner");
  const proj = await ensureProject(key);
  let gone;
  try {
    gone = await sb(`projects?id=eq.${proj.id}`, { method: "DELETE", prefer: "return=representation" });
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This project has PUBLISHED versions, which are immutable by design — the project cannot be hard-deleted. Archive it instead (Settings → Danger zone).");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  requireRows(gone, "the database refused to delete the project (a project is deleted by its owner)");
  await audit(proj.id, "project", proj.id, "deleted", actor || "web", { key, name: proj.name }, null);
  for (const store of ["clash", "rfi", "tender", "keystore"]) {
    try { await docDeleteProject(store, key, { service: true }); } catch { /* best-effort: the project is already gone */ }
  }
  try { await sb(`bcf_topics?project_id=eq.${encodeURIComponent(key)}`, { method: "DELETE", prefer: "return=minimal", service: true }); }
  catch { /* best-effort */ }
  return { deleted: true, key };
}

// ── Folders (ACC/Forma-style "Project Files" tree, per project) ───────────────────────────────────────
// Default seed for a new project. Purely organizational — the ISO 19650 state lives on container_versions.
const DEFAULT_TREE = ["Architecture", "Structure", "MEP", "Civil", "Shared", "Incoming", "Reports"];

/** Seed the default folder tree the first time a project is touched (idempotent — no-op if folders exist). */
export async function ensureFolders(projectId) {
  const existing = await sb(`folders?project_id=eq.${projectId}&select=id&limit=1`);
  if (existing?.length) return;
  const root = (await sb(`folders`, {
    method: "POST",
    body: { project_id: projectId, parent_id: null, name: "Project Files", kind: "root", sort: 0 },
    prefer: "return=representation",
  }))[0];
  await sb(`folders`, {
    method: "POST",
    body: DEFAULT_TREE.map((name, i) => ({ project_id: projectId, parent_id: root.id, name, kind: "folder", sort: i })),
  });
}

export async function listFolders(key) {
  const proj = await ensureProject(key);
  await ensureFolders(proj.id);
  return sb(`folders?project_id=eq.${proj.id}&select=*&order=sort.asc,name.asc`);
}

/** SEC-6 (0043): a folder's parent and a file's folder are in the row's own project — the database refuses any other
 *  (P0001); the bridge answers that as a 400 in its words, nothing written. */
const sameProject = (e) => {
  if (e?.body?.code === "P0001" && / in one project$/.test(String(e.body.message || "")))
    throw Object.assign(new Error(`${e.body.message} — nothing was saved`), { status: 400 });
  throw e;
};

export async function createFolder(key, b) {
  const proj = await ensureProject(key);
  const row = (await sb(`folders`, {
    method: "POST",
    body: { project_id: proj.id, parent_id: b.parent_id || null, name: (b.name || "New folder").trim(), kind: "folder", sort: b.sort || 0 },
    prefer: "return=representation",
  }).catch(sameProject))[0];
  await audit(proj.id, "folder", row.id, "created", b.actor || "web", null, { name: row.name, parent_id: b.parent_id || null });
  return row;
}

export async function renameFolder(folderId, b) {
  const [row] = requireRows(await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, {
    method: "PATCH", body: { name: (b.name || "").trim() }, prefer: "return=representation",
  }), "a folder is renamed by a contributor or above");
  await audit(row.project_id, "folder", row.id, "renamed", b.actor || "web", null, { name: row.name });
  return row;
}

export async function deleteFolder(folderId, b = {}) {
  const found = (await sb(`folders?id=eq.${encodeURIComponent(folderId)}&select=*`))?.[0];
  if (!found) return { ok: false, message: "Folder not found" };
  if (found.kind === "root") return { ok: false, message: "The root folder can't be deleted" };
  // Cascades to subfolders; containers are unfiled (set null). folders_delete is a lead's: a delete the database refused
  // used to answer {ok:true} and write "deleted" over a folder that is still there (cde-rem-10).
  requireRows(await sb(`folders?id=eq.${encodeURIComponent(folderId)}`, { method: "DELETE", prefer: "return=representation" }), "a folder is deleted by a lead or owner");
  await audit(found.project_id, "folder", folderId, "deleted", b.actor || "web", { name: found.name }, null);
  return { ok: true };
}

/** File a container into a folder (folder_id null = project root / unfiled). */
export async function moveContainer(containerId, b) {
  // A file in Deleted items is not filed anywhere until it is restored (0035): said in words, nothing written. The filter
  // repeats it, so a delete that lands between the read and the write leaves no 'moved' row either.
  const found = isUuid(containerId) ? (await sb(`information_containers?id=eq.${containerId}&select=deleted_at`))?.[0] : null;
  if (found?.deleted_at) throw Object.assign(new Error("this file is in Deleted items — restore it first; nothing was saved"), { status: 409 });
  const [row] = requireRows(await sb(`information_containers?id=eq.${encodeURIComponent(containerId)}&deleted_at=is.null`, {
    method: "PATCH", body: { folder_id: b.folder_id || null }, prefer: "return=representation",
  }).catch(sameProject), "a file is filed into a folder by a contributor or above");
  await audit(row.project_id, "container", row.id, "moved", b.actor || "web", null, { folder_id: b.folder_id || null });
  return row;
}

export async function listContainers(key) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?project_id=eq.${proj.id}&select=*,container_versions(*)&order=created_at.desc`);
  // Deleted items (0035) are read only through listDeleted: every other reader sees the project without them.
  return (Array.isArray(rows) ? rows : []).filter((c) => !c.deleted_at).map((c) => {
    const all = c.container_versions || [];
    const container_versions = all.filter((v) => !v.deleted_at);
    // deleted_versions: so the board's next revision label never reuses a deleted version's.
    return { ...c, container_versions, deleted_versions: all.length - container_versions.length };
  });
}

export async function createContainer(key, b) {
  const proj = await ensureProject(key);
  const c = (await sb(`information_containers`, {
    method: "POST",
    body: { project_id: proj.id, folder_id: b.folder_id || null, iso_name: b.iso_name, title: b.title, discipline: b.discipline, container_type: b.container_type || "model" },
    prefer: "return=representation",
  }))[0];
  const v = (await sb(`container_versions`, {
    method: "POST",
    body: { container_id: c.id, revision: b.revision || "P01", state: "wip", suitability: b.suitability || "S0", author: resolveActor(b.author), file_ref: b.file_ref },
    prefer: "return=representation",
  }))[0];
  await audit(proj.id, "container", c.id, "created", b.author, null, { iso_name: b.iso_name });
  return { ...c, container_versions: [v] };
}

// SEC-4 (0041 cde_version_on_insert, founder decision K-c): a revision is registered once per file, Deleted items included —
// the bridge says so in the database's words before it writes, and answers the database's own refusal the same way.
const REVISION_ONCE = "a revision is registered once per file — a new upload takes a new revision; nothing was saved";
// A label is compared trimmed and in any case, as 0041 compares it ("P01 " and "p01" are P01); a new one is stored trimmed.
const sameRevision = (a, b) => String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
// The database's refusal of a held revision: 0041's trigger (a signed-in INSERT, in its words) or, SEC-5, 0042's unique index
// (the same rule for every writer).
const revisionClash = (e) => (e?.body?.code === "P0001" && /registered once per file/.test(String(e.body.message || "")))
  || (e?.body?.code === "23505" && /container_versions_one_revision/.test(String(e.body.message || "")));
const revisionRefused = (e) => {
  if (revisionClash(e)) throw Object.assign(new Error(REVISION_ONCE), { status: 409 });
  throw e;
};

/** SEC-5: when the database refused an INSERT's revision (0041's trigger or 0042's index), the version that holds the revision, read once — answered as a
 *  repeat only when it holds the same bytes and is not in Deleted items; else null (the 409 stands). */
async function heldRepeat(e, containerId, revision, sha256) {
  if (!revisionClash(e) || !sha256) return null;
  const held = await sb(`container_versions?container_id=eq.${containerId}&select=id,revision,state,is_live,platform_item_id,sha256,deleted_at`).catch(() => null);
  const v = (Array.isArray(held) ? held : []).find((x) => sameRevision(x.revision, revision));
  return v && !v.deleted_at && v.sha256 && String(v.sha256).toLowerCase() === String(sha256).toLowerCase() ? v : null;
}

export async function addVersion(container_id, b) {
  // A file in Deleted items takes no new version (0035): a 409 in words before the insert, not the guard's raw refusal.
  const found = isUuid(container_id) ? (await sb(`information_containers?id=eq.${container_id}&select=deleted_at`))?.[0] : null;
  if (found?.deleted_at) throw Object.assign(new Error("this file is in Deleted items — restore it first; nothing was saved"), { status: 409 });
  const revision = typeof b.revision === "string" ? b.revision.trim() || undefined : b.revision;
  const held = isUuid(container_id) && revision ? await sb(`container_versions?container_id=eq.${container_id}&select=revision`) : [];
  if ((held || []).some((v) => sameRevision(v.revision, revision))) throw Object.assign(new Error(REVISION_ONCE), { status: 409 });
  return (await sb(`container_versions`, {
    method: "POST",
    body: { container_id, revision, state: "wip", suitability: b.suitability || "S0", author: resolveActor(b.author), notes: b.notes, file_ref: b.file_ref },
    prefer: "return=representation",
  }).catch(revisionRefused))[0];
}

// ── File versioning (migration 0011) ───────────────────────────────────────────────────────────────────
// A "file" is an information_container; each upload appends a container_version carrying the blob facts
// (size, sha256, platform item id) and a single `is_live` pointer per file. Built on the same rows the CDE
// panel shows (one source of truth) — this is just the file/blob-centric view of them.

/** List a project's files (containers) with their version history, newest version first, live flagged. */
export async function listFiles(key) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?project_id=eq.${proj.id}&select=id,iso_name,title,discipline,container_type,parent_id,created_at,deleted_at,container_versions(id,revision,state,suitability,author,notes,size_bytes,sha256,platform_item_id,file_ref,is_live,superseded,created_at,deleted_at)&order=created_at.desc`);
  // Deleted items (0035) are left out here — the Federation Gate's live set, the clash lock, Holding, reviews, the journey,
  // deliverables and the files panel all read this list. They are read through listDeleted.
  return (Array.isArray(rows) ? rows : []).filter((c) => !c.deleted_at).map((c) => {
    const all = c.container_versions || [];
    const versions = all.filter((v) => !v.deleted_at).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return {
      id: c.id, iso_name: c.iso_name, title: c.title, discipline: c.discipline, container_type: c.container_type,
      parent_id: c.parent_id ?? null, // linked model → nests under this host container in the file tree
      created_at: c.created_at, version_count: versions.length,
      deleted_versions: all.length - versions.length, // so the next label never reuses a deleted version's
      live_version_id: versions.find((v) => v.is_live)?.id ?? null,
      versions,
    };
  });
}

/** Flip the live pointer: mark one version live, all its siblings not-live (partial-unique-safe: clear first). SEC-3 (0040):
 *  the pointer is the bridge's — the version is checked to be on `key`'s project and out of Deleted items, the caller to be a
 *  contributor or above, and only then are both writes made with the service key. */
export async function setLiveVersion(key, version_id, actor) {
  // Refused before the sibling clear below, or a refused pointer would leave the file with no live version.
  const { proj, version: v } = await versionOnKey(key, version_id); // 400 off the project, 409 in Deleted items
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "contributor");
  // Clear the container's current live row FIRST so the partial unique index never sees two live rows.
  await sb(`container_versions?container_id=eq.${v.container_id}&is_live=eq.true`, { method: "PATCH", body: { is_live: false }, prefer: "return=minimal", service: true });
  // No row back is a refusal, not "set live".
  requireRows(await sb(`container_versions?id=eq.${v.id}`, { method: "PATCH", body: { is_live: true }, prefer: "return=representation", service: true }), "the live version is set by a contributor or above");
  const c = await sb(`information_containers?id=eq.${v.container_id}&select=iso_name`);
  await audit(proj.id, "file_version", v.id, "set live", actor || "web", null, { file: c?.[0]?.iso_name, revision: v.revision });
  return { ok: true, version_id: v.id, container_id: v.container_id };
}

/** Resolve a container within a project (404 when absent / not this project's). */
async function containerOf(key, container_id, { deleted = false } = {}) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?id=eq.${encodeURIComponent(container_id)}&project_id=eq.${proj.id}&select=id,iso_name,folder_id,parent_id,deleted_at,container_versions(id,state,revision,deleted_at)`);
  const c = Array.isArray(rows) ? rows[0] : null;
  // A file in Deleted items is found only by the restore; to everything else it is not in the project.
  if (!c || !!c.deleted_at !== deleted) {
    const e = new Error(deleted ? "this file is not in Deleted items" : "file not found in this project"); e.status = 404; throw e;
  }
  if (!deleted) c.container_versions = (c.container_versions || []).filter((v) => !v.deleted_at);
  return { proj, c };
}

/** Rename a file (its ISO container name + title). Audited; versions/history untouched. */
export async function renameFile(key, container_id, name, actor) {
  const clean = String(name || "").trim();
  if (!clean) { const e = new Error("a file name is required"); e.status = 400; throw e; }
  const { proj, c } = await containerOf(key, container_id);
  // 0038 (founder decision F1): the database keeps the name of a file that holds an issued version — said here first, in words.
  if (c.container_versions.some((v) => v.state === "published" || v.state === "archived"))
    throw Object.assign(new Error(`${c.iso_name} holds a published or archived version, so it keeps its name — nothing was saved`), { status: 409 });
  // 0041 (founder decision K-b): a file a verdict judged keeps its name too — the database decides it over every version,
  // Deleted items included, and its words are the answer.
  let rows;
  try {
    rows = await sb(`information_containers?id=eq.${c.id}`, { method: "PATCH", body: { iso_name: clean, title: clean }, prefer: "return=representation" });
  } catch (e) {
    if (e?.body?.code === "P0001" && e.body.message) throw Object.assign(new Error(`${e.body.message} — nothing was saved`), { status: 409 });
    throw e;
  }
  requireRows(rows, "a file is renamed by a contributor or above");
  await audit(proj.id, "container", c.id, "renamed", actor || "web", { iso_name: c.iso_name }, { iso_name: clean });
  return { ok: true, iso_name: clean };
}

/** One move of a file or version to (toBin) or back from Deleted items. The precondition is in the filter
 *  (deleted_at=is.null / not.is.null), so two calls that both read before either wrote make the move once: the second
 *  gets no row and is a 409 "already …", never a second ledger row. No row otherwise is the database's refusal, a 403
 *  in `what`'s words; the 0035 guard's own refusals keep its words (P0001 a 409, 42501 a 403). → the rows. */
async function binMove(table, id, toBin, actor, what) {
  const body = toBin ? { deleted_at: new Date().toISOString(), deleted_by: resolveActor(actor, "web") } : { deleted_at: null, deleted_by: null };
  let rows;
  try {
    rows = await sb(`${table}?id=eq.${id}&deleted_at=${toBin ? "is.null" : "not.is.null"}`, { method: "PATCH", body, prefer: "return=representation" });
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status && e.body.message) throw Object.assign(new Error(e.body.message), { status, body: e.body });
    throw e;
  }
  if (Array.isArray(rows) && rows.length) return rows;
  const now = (await sb(`${table}?id=eq.${id}&select=deleted_at`))?.[0];
  if (now && !!now.deleted_at === toBin)
    throw Object.assign(new Error(toBin ? "already in Deleted items — nothing was saved" : "already restored from Deleted items — nothing was saved"), { status: 409 });
  return requireRows(rows, what);
}

/** Archive a file, governance-consistent: PUBLISHED versions transition to 'archived' (the only legal ISO
 *  move — they stay on the record, immutable); wip/shared drafts move to Deleted items (0035: restorable, one ledger
 *  row each — they used to be erased). The file then holds only archived versions and the web hides it behind the
 *  "archived" toggle. */
export async function archiveFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  const versions = c.container_versions || [];
  let archived = 0, discarded = 0;
  for (const v of versions) {
    if (v.state === "published") { await transition(key, v.id, "archived", { actor: actor || "web", note: "file archived" }); archived++; }
    else if (v.state !== "archived") {
      // Moving a draft to Deleted items is a lead's (the 0035 guard): a move the database would not make comes back as
      // no row — a refusal, not "discarded".
      await binMove("container_versions", v.id, true, actor, "a file's draft versions are moved to Deleted items by a lead or owner");
      await audit(proj.id, "file_version", v.id, "deleted", actor || "web", null, { file: c.iso_name, revision: v.revision, state: v.state, by: "archive", deleted_items: true });
      discarded++;
    }
  }
  // Nothing archived or discarded is nothing to record: no "archived" row over a file that was already archived (cde-11).
  if (archived || discarded) await audit(proj.id, "container", c.id, "archived", actor || "web", null, { iso_name: c.iso_name, archived, discarded });
  return { ok: true, archived, discarded };
}

/** Restore an archived file: archived versions return to 'published' (the state they held before
 *  archiving — only published versions survive the archive step) through cde_transition's archived→published
 *  move (migration 0031): lead-only for a signed-in caller, one state: row per version. A refusal stops the loop
 *  in the function's words (transition). SEC-3 (0040): a restore reads the version's verdict as a publish does; `override`
 *  is the lead's reason when there is none, sent with each restore of the file. */
export async function unarchiveFile(key, container_id, actor, override) {
  const { proj, c } = await containerOf(key, container_id);
  const archived = (c.container_versions || []).filter((v) => v.state === "archived");
  let restored = 0, refusal = null;
  for (const v of archived) {
    try { await transition(key, v.id, "published", { actor: actor || "web", note: "file restored", override }); }
    catch (e) { refusal = e; break; }
    restored++;
  }
  // Nothing restored is nothing to record: no "unarchived" row over a file that had no archived version (cde-11). A refusal
  // after some were restored still records those, and says how many before the function's words (SEC-3).
  if (restored) await audit(proj.id, "container", c.id, "unarchived", actor || "web", null, { iso_name: c.iso_name, restored });
  if (refusal && !restored) throw refusal;
  if (refusal) throw Object.assign(new Error(`${restored} of ${archived.length} archived versions restored — ${refusal.message}`), { status: refusal.status });
  return { ok: true, restored };
}

/** Delete a file: it moves to Deleted items with every version (0035, as in ACC/Forma — restorable, kept for ever; the
 *  name is free for a new file). A file holding a PUBLISHED version is refused by the database guard, surfaced as a 409
 *  telling the caller to archive instead. Moving a file to Deleted items is a lead's: a move the database refused comes
 *  back as no row, a 403. The "deleted" row is written only after the move happened. */
export async function deleteFile(key, container_id, actor) {
  const { proj, c } = await containerOf(key, container_id);
  try {
    await binMove("information_containers", c.id, true, actor, "a file is moved to Deleted items by a lead or owner");
  } catch (e) {
    if (String(e?.message || "").includes("published versions are immutable")) {
      const err = new Error("This file has PUBLISHED versions, which are immutable by design — it cannot be deleted. Archive it instead.");
      err.status = 409;
      throw err;
    }
    throw e;
  }
  await audit(proj.id, "container", c.id, "deleted", actor || "web", { iso_name: c.iso_name, folder_id: c.folder_id ?? null, parent_id: c.parent_id ?? null }, { deleted_items: true, versions: c.container_versions.length });
  return { deleted: true, deleted_items: true, iso_name: c.iso_name };
}

/** Deleted items of a project (0035): whole files and single versions of files still in the project (drafts an archive
 *  moved there), newest first — who, when. A file row counts apart the versions that come back with it (`versions`) and
 *  the ones deleted on their own before it (`deleted_versions`: they stay in Deleted items, restorable once the file is
 *  back). Any member reads it. */
export async function listDeleted(key) {
  const proj = await ensureProject(key);
  const rows = await sb(`information_containers?project_id=eq.${proj.id}&select=id,iso_name,deleted_at,deleted_by,container_versions(id,revision,state,deleted_at,deleted_by,created_at)`);
  const out = [];
  for (const c of Array.isArray(rows) ? rows : []) {
    const vs = c.container_versions || [];
    if (c.deleted_at) out.push({ kind: "file", container_id: c.id, iso_name: c.iso_name, deleted_at: c.deleted_at, deleted_by: c.deleted_by ?? null, versions: vs.filter((v) => !v.deleted_at).length, deleted_versions: vs.filter((v) => v.deleted_at).length });
    else for (const v of vs) if (v.deleted_at) out.push({ kind: "version", container_id: c.id, iso_name: c.iso_name, version_id: v.id, revision: v.revision, state: v.state, deleted_at: v.deleted_at, deleted_by: v.deleted_by ?? null });
  }
  return out.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
}

/** Deleted items of every project the caller can see (the Projects window's Deleted models, GET /cde/deleted): the
 *  projects are listProjects' (a signed-in caller's own, archived ones too), each bin is listDeleted's under the same
 *  caller (RLS as for /cde/:key/files/deleted), 6 read at a time; rows flattened with their project, newest first. A bin
 *  that could not be read is in not_read with the reason in words, never dropped. → { rows, not_read, projects }. */
export async function listDeletedAcross({ projects = listProjects, deleted = listDeleted } = {}) {
  const ps = await projects();
  const rows = [], not_read = [];
  let next = 0;
  const worker = async () => {
    while (next < ps.length) {
      const p = ps[next++];
      try {
        for (const d of await deleted(p.key)) rows.push({ project_key: p.key, project_name: p.name, office_name: p.office_name ?? null, ...d });
      } catch (e) {
        not_read.push({ project_key: p.key, project_name: p.name, reason: String(e?.message || e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, ps.length) }, worker));
  rows.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
  return { rows, not_read, projects: ps.length };
}

/** Restore from Deleted items (0035): a whole file with all its versions, or one version of a file that is in the project
 *  (it comes back not live, in the state it had). A lead's. A file whose name was taken meanwhile is refused in ACC's
 *  words (409); a file whose folder was deleted meanwhile lands at the project root (its folder link is already null). */
export async function restoreFile(key, { container_id, version_id } = {}, actor) {
  if (version_id) {
    if (!isUuid(version_id)) { const e = new Error("this version is not in Deleted items"); e.status = 404; throw e; }
    const { proj, c } = await containerOf(key, container_id);
    const v = (await sb(`container_versions?id=eq.${version_id}&container_id=eq.${c.id}&select=id,revision,state,deleted_at`))?.[0];
    if (!v?.deleted_at) { const e = new Error("this version is not in Deleted items"); e.status = 404; throw e; }
    await binMove("container_versions", v.id, false, actor, "a version is restored from Deleted items by a lead or owner");
    await audit(proj.id, "file_version", v.id, "restored", actor || "web", null, { file: c.iso_name, revision: v.revision, state: v.state, from: "deleted_items" });
    return { restored: true, kind: "version", iso_name: c.iso_name, revision: v.revision };
  }
  const { proj, c } = await containerOf(key, container_id, { deleted: true });
  let back;
  try {
    back = await binMove("information_containers", c.id, false, actor, "a file is restored from Deleted items by a lead or owner");
  } catch (e) {
    if (/23505|duplicate key|ic_project_name_not_deleted/.test(String(e?.message || ""))) {
      const err = new Error(`A file named ${c.iso_name} is already in this project — rename or delete that file, then restore this one. Nothing was restored.`);
      err.status = 409;
      throw err;
    }
    throw e;
  }
  const vs = c.container_versions || [];
  const versions = vs.filter((v) => !v.deleted_at).length, deleted_versions = vs.length - versions; // the latter stay in Deleted items
  await audit(proj.id, "container", c.id, "restored", actor || "web", null, { iso_name: c.iso_name, versions, deleted_versions, from: "deleted_items", to_root: !back[0]?.folder_id });
  return { restored: true, kind: "file", iso_name: c.iso_name, versions, deleted_versions };
}

/** Register an uploaded file as a new version. Create-or-append by file name; the new version becomes live and
 *  always starts in wip (a body's `state` is ignored — publishing is cde_transition's, migration 0031). */
export async function registerFileVersion(key, b = {}) {
  // Geometry is the bridge's: the outbox's attachGeometry puts an item on the version its sidecar names, by id. A
  // registration never attaches onto an existing version (0040: platform_item_id is the bridge's in every state).
  if (b.attach_geometry === true) { const e = new Error("geometry is attached by the bridge to the version an upload names — nothing was saved"); e.status = 400; throw e; }
  // SEC-4 (founder decision L-b; 0041 refuses a signed-in INSERT that carries one): the bridge links an item it uploaded,
  // after its hash check (attachGeometry) — never an item a caller names.
  if (b.platform_item_id != null) { const e = new Error("a version's geometry is linked by the bridge after its upload — send no platform_item_id; nothing was saved"); e.status = 400; throw e; }
  const proj = await ensureProject(key);
  const name = (b.name || b.iso_name || "").trim();
  if (!name) { const e = new Error("name required"); e.status = 400; throw e; }

  // A file in Deleted items does not own its name any more (0035): a new upload of that name is a new file.
  const existing = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(name)}&deleted_at=is.null&select=id,parent_id,container_versions(id,revision,state,is_live,platform_item_id,sha256,deleted_at)`);
  let container = Array.isArray(existing) ? existing[0] : null;

  // Host→link nesting (0019): a linked model names its host file; resolve it in the same project and
  // record parent_id so the web file tree nests the link under its host. Best-effort — a host that
  // hasn't registered yet (upload order isn't guaranteed) just leaves the link top-level.
  let parentId = null;
  if (b.parent_name) {
    const host = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(String(b.parent_name).trim())}&deleted_at=is.null&select=id`);
    parentId = Array.isArray(host) && host[0] ? host[0].id : null;
  }
  if (container && parentId && container.parent_id !== parentId) {
    // Existing file republished as a link (or host registered after the link) — adopt the nesting.
    await sb(`information_containers?id=eq.${container.id}`, { method: "PATCH", body: { parent_id: parentId }, prefer: "return=minimal" });
  }

  if (!container) {
    container = (await sb(`information_containers`, {
      method: "POST",
      body: { project_id: proj.id, iso_name: name, title: b.title || name, discipline: b.discipline || null, container_type: "model", parent_id: parentId },
      prefer: "return=representation",
    }))[0];
    await audit(proj.id, "container", container.id, "created", b.author || "web", null, { iso_name: name, ...(parentId ? { link_of: b.parent_name } : {}) });
  }

  // Next revision label: honour a supplied one, else the first v{N} past the file's existing versions — Deleted items
  // included, so a label is never reused. SEC-4 (K-c): a revision is registered once per file; the same revision with the
  // same bytes is answered with the version that holds it, and nothing is written (a repeated publish run).
  const prior = container.container_versions || [];
  let next = prior.length + 1;
  const asked = String(b.revision ?? "").trim();
  while (!asked && prior.some((v) => sameRevision(v.revision, `v${next}`))) next++;
  let revision = asked || `v${next}`;
  const same = prior.find((v) => sameRevision(v.revision, revision));
  if (same) {
    if (!same.deleted_at && b.sha256 && same.sha256 && String(same.sha256).toLowerCase() === String(b.sha256).toLowerCase())
      return { container_id: container.id, iso_name: name, version: same, repeat: true };
    throw Object.assign(new Error(REVISION_ONCE), { status: 409 });
  }

  const insert = async () => (await sb(`container_versions`, {
    method: "POST",
    body: {
      container_id: container.id, revision, state: "wip", suitability: b.suitability || "S0",
      author: resolveActor(b.author, "web"), notes: b.notes || null, file_ref: b.file_ref || null,
      size_bytes: b.size_bytes != null ? Number(b.size_bytes) : null,
      sha256: b.sha256 || null, is_live: false,
    },
    prefer: "return=representation",
  }))[0];
  let version;
  try {
    version = await insert();
  } catch (e) {
    // SEC-5 (0042): a registration of this revision landed at the same moment — the same bytes are its repeat (SEC-4 C4).
    const held = await heldRepeat(e, container.id, revision, b.sha256);
    if (held) return { container_id: container.id, iso_name: name, version: held, repeat: true };
    // No revision was asked: the label is the bridge's own, so it takes the next free one once (a second refusal stands).
    if (asked || !revisionClash(e)) revisionRefused(e);
    const held2 = await sb(`container_versions?container_id=eq.${container.id}&select=revision`);
    while ((Array.isArray(held2) ? held2 : []).some((v) => sameRevision(v.revision, `v${next}`))) next++;
    revision = `v${next}`;
    try { version = await insert(); } catch (e2) { revisionRefused(e2); }
  }

  await setLiveVersion(key, version.id, b.author || "web");
  await audit(proj.id, "file_version", version.id, "uploaded", b.author || "web", null,
    { file: name, revision, size_bytes: version.size_bytes, platform_item_id: version.platform_item_id });
  return { container_id: container.id, iso_name: name, version: { ...version, is_live: true } };
}

/** SEC-4: the version an uploaded item may go on — a version of `key`'s project, out of Deleted items, without geometry,
 *  and registered with `sha256`, the hash of the bytes the bridge uploads (founder decision L-a: a version registered
 *  without one takes no geometry). → { proj, v, c }. 400 for a hash that is not 64 hex characters (before any read) or a
 *  version not on `key`; 409 otherwise — never a write. The outbox watcher asks it before it uploads anything. */
export async function geometryTarget(key, versionId, sha256) {
  const hash = String(sha256 ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) { const e = new Error("the uploaded file's sha256 is required (64 hex characters) — nothing was linked"); e.status = 400; throw e; }
  const notOnKey = () => Object.assign(new Error(`version ${versionId} is not on ${key}`), { status: 400 });
  if (!isUuid(versionId)) throw notOnKey();
  const proj = await ensureProject(key);
  const v = (await sb(`container_versions?id=eq.${versionId}&select=id,container_id,revision,is_live,platform_item_id,sha256,deleted_at`))?.[0];
  const c = v && (await sb(`information_containers?id=eq.${v.container_id}&project_id=eq.${proj.id}&select=iso_name,deleted_at`))?.[0];
  if (!c) throw notOnKey();
  const refuse = (m) => Object.assign(new Error(m), { status: 409 });
  if (v.deleted_at || c.deleted_at) throw refuse(`version ${v.id} is in Deleted items — restore it first`);
  if (v.platform_item_id) throw refuse(`version ${v.id} already has geometry (platform item ${v.platform_item_id}) — a version's geometry is attached once`);
  if (!v.sha256) throw refuse(`version ${v.id} was registered without a sha256, so no geometry is linked to it — nothing was linked`);
  if (String(v.sha256).toLowerCase() !== hash) throw refuse(`the file's sha256 is not the one version ${v.id} was registered with — nothing was linked`);
  return { proj, v, c };
}

/** Put an uploaded platform item on a version, by id (the outbox watcher, spec Decision 6; intake, for its own upload):
 *  only the version geometryTarget answers for `opts.sha256`, and only while it has no geometry (platform_item_id is
 *  written once; the PATCH is filtered on is.null, so a concurrent attach cannot overwrite). Audited "geometry linked"
 *  (actor `opts.actor`, else outbox) with the IFC's sha256 and, when given, the .frag's and the delivered IFC's platform
 *  item (SEC-5); returns the version and the ledger row's id. 400 for a blank item, a missing hash or a version not on
 *  `key`, 409 for the rest — each decided before any write; an item another version names is 0042's 409, in words. */
export async function attachGeometry(key, versionId, platformItemId, { sha256, frag_sha256, ifc_item_id, actor = "outbox" } = {}) {
  const item = String(platformItemId ?? "").trim();
  if (!item) { const e = new Error("platform_item_id required"); e.status = 400; throw e; }
  const { proj, v, c } = await geometryTarget(key, versionId, sha256);
  // 0040: a version's geometry is the bridge's — written with the service key (the outbox runs with no caller).
  const done = await sb(`container_versions?id=eq.${v.id}&platform_item_id=is.null`, { method: "PATCH", body: { platform_item_id: item }, prefer: "return=representation", service: true })
    .catch((e) => {
      if (e?.body?.code === "23505" && /container_versions_one_item/.test(String(e.body.message || "")))
        throw Object.assign(new Error(`platform item ${item} is already another version's geometry — nothing was linked`), { status: 409 });
      throw e;
    });
  if (!done?.length) {
    const e = new Error(`version ${v.id} already has geometry — a version's geometry is attached once`);
    e.status = 409;
    throw e;
  }
  const row = await audit(proj.id, "file_version", v.id, "geometry linked", actor, null,
    { file: c.iso_name, platform_item_id: item, by: "version_id", ifc_sha256: String(v.sha256).toLowerCase(), ...(frag_sha256 ? { frag_sha256 } : {}),
      ...(ifc_item_id ? { ifc_item_id: String(ifc_item_id) } : {}) });
  return { container_id: v.container_id, iso_name: c.iso_name, linked: true, version: { id: v.id, revision: v.revision, platform_item_id: item, is_live: v.is_live }, audit_id: row?.id ?? null };
}

/** The version when it is on the key's project: { proj, version: { id, container_id, revision, state } }. Any
 *  other id — another project's version, an unknown or malformed one — is a 400 "version <id> is not on <key>". */
export async function versionOnKey(key, version_id) {
  const proj = await ensureProject(key);
  const rows = isUuid(version_id)
    ? await sb(`container_versions?id=eq.${version_id}&select=id,container_id,revision,state,deleted_at,information_containers(project_id,deleted_at)`)
    : [];
  const v = Array.isArray(rows) ? rows[0] : null;
  if (!v || v.information_containers?.project_id !== proj.id) {
    const e = new Error(`version ${version_id} is not on ${key}`); e.status = 400; throw e;
  }
  if (v.deleted_at || v.information_containers?.deleted_at) {
    const e = new Error(`version ${version_id} is in Deleted items — restore it first`); e.status = 409; throw e;
  }
  return { proj, version: { id: v.id, container_id: v.container_id, revision: v.revision, state: v.state } };
}

// cde_transition's raises (migration 0031) → the caller's status, in the function's own words: a refusal (P0001:
// the state machine, the verdict guard, the state trigger) is a 409; an unknown version (no_data_found) a 404; a
// role refusal (insufficient_privilege) a 403. Anything else stays the bridge's error (a 500 at the route, scrubbed).
const TRANSITION_REFUSAL = { P0001: 409, P0002: 404, "42501": 403 };

/** Run the DB state machine (validates the move and the verdict, writes the state: row, enforces immutability).
 *  `key` given → the version must be on that project (versionOnKey); the keyless route and the assistant pass
 *  null. `override` is the lead's reason to publish a version without an accepted verdict that measured
 *  something: sent only when not blank, and cde_transition takes it only from a signed-in lead. */
export async function transition(key, version_id, new_state, { actor, note, override } = {}) {
  if (!isUuid(version_id)) { const e = new Error("version not found"); e.status = 404; throw e; }
  // The reason is recorded word for word on the state: row, so only a string is one ({} or 5 would be "[object Object]"/"5").
  if (override != null && typeof override !== "string") { const e = new Error("override must be a string — the lead's reason to publish"); e.status = 400; throw e; }
  if (key) await versionOnKey(key, version_id);
  // ISO 19650 state changes are the governed trail's spine — stamp the verified identity, not the claim.
  const body = { p_version: version_id, p_new_state: new_state, p_actor: resolveActor(actor, "web"), p_note: note };
  const reason = String(override ?? "").trim();
  if (reason) body.p_override = reason;
  let row;
  try {
    row = await sb(`rpc/cde_transition`, { method: "POST", body });
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status) { const r = new Error(e.body.message); r.status = status; throw r; }
    throw e;
  }
  void mirrorStateSafe(version_id); // committed: the platform copy follows, never awaited (a refusal threw above)
  return row;
}

/** Part B of spec 2026-09-29 (platform-native): after a committed state change, carry the version's state onto its
 *  platform copy (platform-state.mjs). Fire and forget — never awaited by a transition and never its error. Off unless
 *  SENTINEL_PLATFORM_STATE=on, and platform-state.mjs is imported only on that path. Resolves, never rejects. */
// One mirror at a time per version: two in flight could otherwise write an older state last. Each queued mirror
// re-reads the newest state: row, so the last to run writes the newest.
const MIRROR_QUEUE = new Map();
export function mirrorStateSafe(version_id) {
  if (process.env.SENTINEL_PLATFORM_STATE !== "on") return Promise.resolve({ mirrored: false, reason: "off" });
  // A platform call that never answers must not hold the queue: after SENTINEL_MIRROR_TIMEOUT_MS (30 s) the next one
  // runs; the late one, if it ever answers, still cannot regress the label (it skips a map naming a newer row).
  const ms = Number(process.env.SENTINEL_MIRROR_TIMEOUT_MS) || 30000;
  const run = () => {
    let t;
    const timeout = new Promise((r) => {
      t = setTimeout(() => { console.warn(`[platform-state] version ${version_id}: not mirrored — the platform did not answer in ${ms / 1000} s`); r({ mirrored: false, reason: `the platform did not answer in ${ms / 1000} s` }); }, ms);
      t.unref?.();
    });
    return Promise.race([import("./platform-state.mjs").then((m) => m.mirrorState(version_id)), timeout])
      .catch((e) => {
        console.warn(`[platform-state] version ${version_id}: not mirrored — ${String(e?.message || e).replace(/accessToken=[^&\s"']+/gi, "accessToken=…")}`);
        return { mirrored: false, reason: "the mirror failed (the bridge log has the cause)" };
      })
      .finally(() => clearTimeout(t)); // a mirror that settled first never also logs a timeout
  };
  const next = (MIRROR_QUEUE.get(version_id) ?? Promise.resolve()).then(run, run);
  MIRROR_QUEUE.set(version_id, next);
  void next.finally(() => { if (MIRROR_QUEUE.get(version_id) === next) MIRROR_QUEUE.delete(version_id); });
  return next;
}

/** The ledger read's page: 200 rows unless asked, never more than 1000 (the db-max-rows SNAP_PAGE assumes). */
export const AUDIT_LIMIT = 200, AUDIT_MAX = 1000;

/** GET /cde/:key/audit's query → { filter, limit, offset } for PostgREST. Pure; a bad value throws a 400 before any
 *  read. entity_type and actor match exactly; action_prefix → like.<p>* with LIKE's \ % _ escaped (PostgREST turns
 *  every * into %, so a * cannot be matched literally and is refused); entity_id is a uuid or a comma list (→ in.());
 *  since / until → at=gte. / at=lt.; limit defaults to 200 and is clamped to 1000; offset ≥ 0. A blank value is no
 *  filter; other keys are ignored. */
export function auditQuery(f = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const has = (k) => f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== "";
  const val = (k) => String(f[k]).trim();
  let filter = "";
  if (has("entity_type")) filter += `&entity_type=eq.${encodeURIComponent(val("entity_type"))}`;
  if (has("action_prefix")) {
    const p = String(f.action_prefix);
    if (p.includes("*")) throw bad("action_prefix cannot contain * (PostgREST reads every * as a wildcard)");
    filter += `&action=like.${encodeURIComponent(p.replace(/[\\%_]/g, "\\$&"))}*`;
  }
  if (has("entity_id")) {
    const ids = val("entity_id").split(",").map((s) => s.trim());
    if (!ids.every(isUuid)) throw bad("entity_id must be a uuid or a comma list of uuids");
    filter += ids.length === 1 ? `&entity_id=eq.${ids[0]}` : `&entity_id=in.(${ids.join(",")})`;
  }
  if (has("actor")) filter += `&actor=eq.${encodeURIComponent(val("actor"))}`;
  for (const [k, op] of [["since", "gte"], ["until", "lt"]]) {
    if (!has(k)) continue;
    const t = Date.parse(val(k));
    if (Number.isNaN(t)) throw bad(`${k} must be a date or date-time`);
    filter += `&at=${op}.${encodeURIComponent(new Date(t).toISOString())}`;
  }
  const int = (k, dflt, min) => {
    if (!has(k)) return dflt;
    const n = Number(val(k));
    if (!Number.isInteger(n) || n < min) throw bad(`${k} must be an integer ≥ ${min}`);
    return n;
  };
  return { filter, limit: Math.min(int("limit", AUDIT_LIMIT, 1), AUDIT_MAX), offset: int("offset", 0, 0) };
}

/** The project's ledger rows, newest first, filtered and paged: { rows, total, limit, offset }. `total` is the exact
 *  count of rows matching the filter (not of the page), so a reader that got fewer rows than the total knows it. */
export async function listAudit(key, filters = {}) {
  const { filter, limit, offset } = auditQuery(filters);
  const proj = await ensureProject(key);
  const { data, total } = await sb(`audit_log?project_id=eq.${proj.id}${filter}&select=*&order=id.desc&limit=${limit}&offset=${offset}`, { count: true });
  return { rows: data, total, limit, offset };
}

/** Every ledger row of `key` matching `filters` (auditQuery's), newest first: listAudit read page after page (AUDIT_MAX
 *  each) to the exact total. The pages are read by offset, newest first, so a row written between two reads pushes a
 *  row into the next page a second time: each id is kept once (the ledger is append-only, so none is skipped). */
async function auditAll(key, filters) {
  const byId = new Map();
  for (let offset = 0; ;) {
    const page = await listAudit(key, { ...filters, limit: AUDIT_MAX, offset });
    for (const r of page.rows) byId.set(r.id, r);
    offset += page.rows.length;
    if (!page.rows.length || offset >= page.total) return [...byId.values()];
  }
}

export async function audit(project_id, entity_type, entity_id, action, actor, oldv, newv) {
  // audit_log has no authed-insert policy (writes bypass RLS by design) → force the service key.
  // A forwarded JWT's verified identity outranks any client-asserted actor (anti audit-trail poisoning, F3);
  // with no JWT (Revit/service path) we keep the supplied actor so the pilot is unaffected.
  // return=representation: the caller gets the row the ledger stored ({id, at, hash, …}), so a line can name
  // "ledger #id"; null when no row came back — never a made-up id. Callers that ignore the value are unchanged.
  const rows = await sb(`audit_log`, { method: "POST", body: { project_id, entity_type, entity_id, action, actor: resolveActor(actor), old_value: oldv, new_value: newv }, prefer: "return=representation", service: true });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate), ROI (`roi:`), the Holding Area (`hold:`, entity_type hold — phase 6a) and the
 *  review chain (`review:`, entity_type review — phase 6b: review:start written by cde_transition, review:approve and
 *  review:reject by review_decide, migration 0032; the chain and its publish read them). The delivery gate's rows
 *  (entity_type delivery_gate) are written by intake and by POST /cde/:key/delivery-gate — the machine credential or a
 *  signed-in contributor or above (spec 2026-09-27 Decision 5; GATE-E1). The platform gate's runs (entity_type
 *  platform_gate, one row per execution id) are written by bridge/platform-gate-ledger.mjs only (spec 2026-09-29) —
 *  reserved so nobody can squat a real run's id.
 *  The open audit route may not write any of them. */
// MA-3a (review amendment C5): changeset_reviewed and changeset_reopened are the record of the web desk's decisions and a lead's
// re-open (changesets-store reviewChangeset / reopenGhost) — never written through the open route.
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:", "review:", "changeset_reviewed", "changeset_reopened", "geometry linked"];
const RESERVED_TYPES = ["stage_gate", "hold", "delivery_gate", "review", "platform_gate"];

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). A reserved
 *  row (an action starting with one of RESERVED_ACTIONS, or an entity_type in RESERVED_TYPES; case and surrounding
 *  spaces ignored) is a 400 before any read. */
export async function recordAudit(key, b) {
  const type = String(b.entity_type ?? "").trim().toLowerCase();
  const action = String(b.action ?? "").trim().toLowerCase();
  const reserved = RESERVED_TYPES.includes(type) ? type : RESERVED_ACTIONS.find((p) => action.startsWith(p));
  if (reserved) { const e = new Error(`${reserved} rows are written by Sentinel, not through this route`); e.status = 400; throw e; }
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id,
      entity_type: b.entity_type || "event",
      entity_id: b.entity_id ?? null,
      action: b.action || "recorded",
      // Same anti-poisoning rule as audit(): a signed-in caller's verified identity outranks the claim.
      // This route (POST /cde/:key/audit) previously wrote the claim raw — the one audit_log sink that did.
      actor: resolveActor(b.actor),
      old_value: b.old_value ?? null,
      new_value: b.new_value ?? null,
    },
    prefer: "return=representation",
    service: true, // audit_log bypasses RLS by design
  }))[0];
}

/** H0 (cde-6): a signed-in caller's writes that grow the append-only ledger or add projects are budgeted — per verified
 *  user and across every user, one-minute windows (createLimiter) — so neither one account nor a crowd of fresh
 *  sign-ups grows them without bound. Over budget is a 429 before anything is written; the machine credential (no
 *  signed-in user) is not budgeted. */
const budgets = new Map(); // what → { all, bySub } — one per kind of write
export function takeWriteBudget(what, { perUser, all }) {
  const sub = currentSub();
  if (!sub) return;
  let b = budgets.get(what);
  if (!b) budgets.set(what, (b = { all: createLimiter({ max: all }), bySub: createKeyedLimiter({ max: perUser }) }));
  // The user's own window first: a caller over it does not use up everyone's.
  if (!b.bySub.take(sub) || !b.all.take()) throw Object.assign(new Error(`too many ${what} in a minute — nothing was saved; try again shortly`), { status: 429 });
}

const NOTE_MAX = 8 * 1024; // a note's new_value, serialized
const REPORT_MAX = 256 * 1024; // a Revit report's new_value (the renamed rows), serialized
/** Rows Revit writes about work it did itself in the model (H4: a signed-in person, not the machine token). The work
 *  happened in Revit, so no bridge route can write the row from the act; the row is the person's report of it, stamped
 *  with their verified identity. */
const REVIT_REPORT_TYPES = ["naming", "family_heal",
  // MA-1a item 7 (audit XC-5's modelling subset, blueprint P1-9): one row per run of a modelling command — per build,
  // per click, per save — with counts and the actor; never one row per element.
  "datum", "ghost_build", "massing", "annotate", "apply_standard", "auto_fix", "fix_in_place", "doctor",
  // MA-1a item 8: a reader's or planner's run receipt (buildRunRow words its action build:run and marks it claimed).
  "build",
  // MA-2b: Promote's LOD state of the model, now or after an applied changeset (lodStateRow marks it claimed).
  "lod_state",
  // MA-2c: Promote's type gaps of one run, grouped (typeGapRow names each group and marks the row claimed).
  "type_gap"];

/** MA-2c (design §6.4): one Promote run's type gaps — groups of held elements the office has no type for — counted in Revit, not by
 *  the bridge: claimed, like lod_state, whoever posts it. Each group {category, want | size, key?, elements ≥ 1, labels?, nearest?}
 *  is kept name for name and given the bridge's own id (holding-logic typeGapId: the same gap on every run is one group); the
 *  bridge words the action. The Holding Area reads these rows (readHolding). Anything else is a 400. */
function typeGapRow(b) {
  const v = b.new_value;
  const no = (m) => Object.assign(new Error(`a type_gap row's ${m} — nothing was saved`), { status: 400 });
  const line = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max && !/[\u0000-\u001f]/.test(s);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw no("new_value is the run's gap groups, an object");
  if (!Array.isArray(v.groups) || v.groups.length < 1 || v.groups.length > 200) throw no("groups is a list of 1 to 200 gap groups");
  const groups = v.groups.map((g, i) => {
    const at = `groups[${i}]`;
    if (!g || typeof g !== "object" || Array.isArray(g)) throw no(`${at} is an object`);
    if (!line(g.category, 64)) throw no(`${at}.category is one line of at most 64 characters`);
    for (const [f, max] of [["want", 256], ["size", 64], ["key", 500]]) if (g[f] != null && !line(g[f], max)) throw no(`${at}.${f} is one line of at most ${max} characters`);
    if (g.want == null && g.size == null) throw no(`${at} names the type it wants or the size it has (want or size)`);
    if (!Number.isInteger(g.elements) || g.elements < 1) throw no(`${at}.elements is a whole number ≥ 1`);
    for (const f of ["labels", "nearest"])
      if (g[f] != null && !(Array.isArray(g[f]) && g[f].length <= 50 && g[f].every((s) => line(s, 256)))) throw no(`${at}.${f} is a list of at most 50 one-line texts`);
    const kept = { category: g.category.trim(), want: g.want?.trim() ?? null, size: g.size?.trim() ?? null, key: g.key ?? null, elements: g.elements, labels: g.labels ?? [], nearest: g.nearest ?? [] };
    return { id: typeGapId(kept), ...kept };
  });
  const n = groups.reduce((s, g) => s + g.elements, 0);
  // Not "hold:type_gap" (design §6.4): hold: actions are Sentinel's own rows (RESERVED_ACTIONS) and never come through this route.
  return { ...b, action: `type_gap:run · ${groups.length} group(s), ${n} element(s)`, new_value: { ...v, groups, claimed: true } };
}

/** MA-2b: a lod_state row is Promote's count of the model's LOD state — read in Revit, not measured by the bridge — so whoever
 *  posts it, the bridge marks it claimed (the build:run rule). The journey line and the design gate's LOD check read the newest
 *  one, so the count must hold to itself (review): whole counts that add up to the total, and the share those counts give —
 *  floor(at·100/total), null when nothing was counted or a class the matrix has a DD row for was not run (LodStateReport.Share).
 *  Anything else is a 400. */
function lodStateRow(b) {
  const v = b.new_value;
  const no = (m) => Object.assign(new Error(`a lod_state row's ${m} — nothing was saved`), { status: 400 });
  if (!v || typeof v !== "object" || Array.isArray(v)) throw no("new_value is the count, an object");
  if (!["total", "at", "below", "blocked", "not_measured"].every((k) => Number.isInteger(v[k]) && v[k] >= 0))
    throw no("total, at, below, blocked and not_measured are whole numbers ≥ 0");
  const sum = v.at + v.below + v.blocked + v.not_measured;
  if (sum !== v.total) throw no(`at, below, blocked and not_measured add up to its total (${v.total}), not ${sum}`);
  const notRun = v.not_run ?? [];
  if (!Array.isArray(notRun) || !notRun.every((n) => typeof n === "string")) throw no("not_run is a list of reasons");
  const share = v.total === 0 || notRun.some((n) => !n.endsWith(": no DD row in the LOD matrix")) ? null : Math.floor((v.at * 100) / v.total);
  if ((v.share ?? null) !== share)
    throw no(`share is ${share ?? "null (nothing counted, or a class the matrix asks for not run)"} for these counts, not ${v.share}`);
  if (!["now", "after"].includes(v.when)) throw no('when is "now" or "after"');
  if (!Array.isArray(v.changesets ?? []) || !(v.changesets ?? []).every(isUuid)) throw no("changesets is a list of changeset ids");
  return { ...b, new_value: { ...v, claimed: true } };
}

/** MA-1a item 8: a build row is the add-in's own receipt of a reader or planner run. Whoever posts it — a signed-in
 *  contributor or the machine credential — the bridge words the action (build:run) and marks the receipt claimed: no
 *  bridge-run job backs it (survey jobs are MA-4), so nothing in it is verified. A receipt that is not an object is a 400. */
function buildRunRow(b) {
  const receipt = b.new_value;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
    throw Object.assign(new Error("a build row's new_value is the receipt, an object — nothing was saved"), { status: 400 });
  return { ...b, entity_type: "build", action: "build:run", new_value: { ...receipt, claimed: true } };
}

/** A signed-in contributor or above reports a Revit-side batch (the types above): entity_type from the list,
 *  the new_value at most 256 KB (413), budgeted (429), actor the verified identity whatever the body claims. */
async function recordRevitReport(key, role, type, b) {
  const { ROLE_RANK } = await import("./members-store.mjs");
  if ((ROLE_RANK[role] || 0) < ROLE_RANK.contributor) throw Object.assign(new Error(`a ${type} row is a contributor's or above (you are ${role || "not a member"}) — nothing was saved`), { status: 403 });
  const text = typeof b.action === "string" ? b.action.trim() : "";
  if (!text || text.length > 500) throw Object.assign(new Error(`a ${type} row's action is 1 to 500 characters — nothing was saved`), { status: 400 });
  if (JSON.stringify(b.new_value ?? null).length > REPORT_MAX) throw Object.assign(new Error(`a ${type} row's new_value is at most ${REPORT_MAX / 1024} KB — nothing was saved`), { status: 413 });
  takeWriteBudget("revit reports", { perUser: 20, all: 60 });
  return recordAudit(key, { entity_type: type, action: text, new_value: b.new_value ?? null, old_value: b.old_value ?? null });
}

/** POST /cde/:key/audit (H0 D11, finding cde-6). The machine credential writes as before — Revit's naming and
 *  family_heal rows, which the ROI dashboard counts (recordAudit). A signed-in caller writes a lead's NOTE only: lead or
 *  owner (403), entity_type "note" (400: Sentinel writes its other rows itself, from the route that did the work — the
 *  clash register's from /clash, an IDS raise's from the topic route), the note in `action` (1-500 characters) with an
 *  optional new_value of at most 8 KB (413), budgeted (429), stamped with the verified identity — each refusal before
 *  anything is written. → the stored row. */
export async function recordNote(key, b = {}) {
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  const role = await myRole(key);
  const type = String(b.entity_type ?? "note").trim().toLowerCase();
  // MA-1a item 8: a receipt is worded and marked by the bridge for every caller, the machine credential included; and
  // build: actions belong to receipts, so no other row can pass for one.
  if (type === "build") b = buildRunRow(b);
  else if (type === "lod_state") b = lodStateRow(b);
  else if (type === "type_gap") b = typeGapRow(b);
  else if (String(b.action ?? "").trim().toLowerCase().startsWith("build:"))
    throw Object.assign(new Error('build: rows are receipts (entity_type "build") — nothing was saved'), { status: 400 });
  if (role === "service") return recordAudit(key, b);
  if (REVIT_REPORT_TYPES.includes(type)) return recordRevitReport(key, role, type, b);
  if ((ROLE_RANK[role] || 0) < ROLE_RANK.lead) throw Object.assign(new Error(`a note on the ledger is a lead's (you are ${role || "not a member"}) — nothing was saved`), { status: 403 });
  const bad = (status, message) => Object.assign(new Error(message), { status });
  if (type !== "note") throw bad(400, 'a signed-in caller writes notes only (entity_type "note") — Sentinel writes its other rows itself; nothing was saved');
  const text = typeof b.action === "string" ? b.action.trim() : "";
  if (!text || text.length > 500) throw bad(400, "a note is 1 to 500 characters (action) — nothing was saved");
  if (JSON.stringify(b.new_value ?? null).length > NOTE_MAX) throw bad(413, `a note's new_value is at most ${NOTE_MAX / 1024} KB — nothing was saved`);
  takeWriteBudget("notes", { perUser: 20, all: 60 });
  return recordAudit(key, { entity_type: "note", action: text, new_value: b.new_value ?? null });
}

// ── The Holding Area's writers (phase 6a, spec 2026-09-27 Decisions 4-6). A held file keeps no bytes: a hold is one
// reserved ledger row naming the refused file, the stage that refused it and its failures. What is on hold is derived
// from these rows (readHolding), never stored.

/** One hold failure {requirement, detail} from any judge's failure: a delivery-gate line (a string), an IDS failure
 *  {element, requirement, reason}, a naming failure {field, reason}, or one that is already {requirement, detail}. */
function holdFailure(f) {
  if (typeof f === "string") return { requirement: "delivery gate", detail: f };
  if (f?.requirement === undefined && f?.field !== undefined) return { requirement: f.field === "*" ? "naming (field count)" : `naming ${f.field}`, detail: String(f.reason ?? "") };
  const detail = f?.detail ?? (f?.element ? `${f.element}: ${f?.reason ?? ""}` : f?.reason);
  return { requirement: String(f?.requirement ?? ""), detail: String(detail ?? "") };
}

/** Write one hold row: entity_type hold, entity_id the container's uuid when a container of that name exists on the
 *  project (else null), action "hold:<stage> <container_name>", new_value {container_name, sha256, size_bytes, stage,
 *  verdict, failures (the first 50, each {requirement, detail}), failures_total, source, gate_row_id, proposal_row_id,
 *  contract_ref, ids_ref, naming_ref}. failures_total is the caller's count when its list was already cut (the
 *  delivery-gate route's failures_total), else the list's length. The callers decide whether a refusal is held
 *  (adjudicateProposal, the delivery-gate route, holdIfCouldRegister); this only writes it. Returns the stored row
 *  (audit()), null when none came back. */
export async function writeHold(proj, { stage, container_name, sha256, size_bytes, verdict, failures, failures_total, source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref, actor }) {
  const name = String(container_name ?? "").trim();
  const found = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(name)}&deleted_at=is.null&select=id`);
  const all = Array.isArray(failures) ? failures : [];
  return audit(proj.id, "hold", Array.isArray(found) ? found[0]?.id ?? null : null, `hold:${stage} ${name}`, actor, null, {
    container_name: name, sha256: sha256 ?? null, size_bytes: size_bytes ?? null, stage, verdict: verdict ?? "rejected",
    failures: all.slice(0, 50).map(holdFailure), failures_total: Math.max(failures_total ?? 0, all.length), source,
    gate_row_id: gate_row_id ?? null, proposal_row_id: proposal_row_id ?? null,
    contract_ref: contract_ref ?? null, ids_ref: ids_ref ?? null, naming_ref: naming_ref ?? null,
  });
}

/** Whether the caller could register a file on `key` (spec Decision 4's third condition): the machine credential, or a
 *  signed-in member ranked contributor or above. A viewer's or a non-member's refusal is not held. */
export async function couldRegister(key) {
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  const role = await myRole(key);
  return role === "service" || (ROLE_RANK[role] || 0) >= ROLE_RANK.contributor;
}

/** Intake's gate FAIL hold (runIntake's deps.writeHold): written only when the caller could register the file (spec
 *  Decision 4's third condition) → the stored row, {} when the ledger returned none, null when nothing was written. */
export async function holdIfCouldRegister(key, h) {
  if (!(await couldRegister(key))) return null;
  return (await writeHold(await ensureProject(key), h)) ?? {};
}

const GATE_PASSED = { pass: true, fail: false, not_checked: null };           // result → passed; null is not checked
const GATE_WORDS = { pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }; // the words Revit's gate row always used
const GATE_SOURCES = ["revit", "auto-publish", "check"];

/** POST /cde/:key/delivery-gate's body → the delivery_gate row's new_value, or a 400 naming the field (spec 2026-09-27
 *  Decision 5). Pure. A nullable field left out is null; a key not listed is not kept. passed must agree with result;
 *  failures: at most 200, each a line (a string) or {requirement, detail} (only those two keys are kept); failures_total:
 *  the count before the sender cut its list (Revit sends 199 and a counting line past 200), at least the list's length,
 *  the length when left out; publish is true only from a publish. */
export function readDeliveryGate(b = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const v = (k) => (b[k] === undefined ? null : b[k]);
  const file = typeof b.file === "string" ? b.file.trim() : "";
  if (!/^.+\.ifc$/i.test(file)) throw bad("file must be the IFC file's name, ending .ifc");
  if (!Object.keys(GATE_PASSED).includes(b.result)) throw bad("result must be pass, fail or not_checked");
  if (v("passed") !== GATE_PASSED[b.result]) throw bad("passed must be true for pass, false for fail and null for not_checked");
  for (const k of ["contract", "contract_ref", "contract_source", "schema"]) if (v(k) !== null && typeof b[k] !== "string") throw bad(`${k} must be a string or null`);
  for (const k of ["contract_sha256", "sha256"]) if (v(k) !== null && !(typeof b[k] === "string" && /^[0-9a-f]{64}$/i.test(b[k]))) throw bad(`${k} must be 64 hex characters or null`);
  for (const k of ["entities", "size_bytes"]) if (v(k) !== null && !(Number.isSafeInteger(b[k]) && b[k] >= 0)) throw bad(`${k} must be a whole number or null`);
  const failures = v("failures") ?? [];
  const line = (f) => typeof f === "string" || (!!f && typeof f === "object" && typeof f.requirement === "string" && typeof f.detail === "string");
  if (!Array.isArray(failures) || failures.length > 200 || !failures.every(line)) throw bad("failures must be a list of at most 200 lines, each a string or {requirement, detail}");
  const total = v("failures_total") ?? failures.length;
  if (!(Number.isSafeInteger(total) && total >= failures.length)) throw bad("failures_total must be a whole number, at least the number of failures sent");
  if (!GATE_SOURCES.includes(b.source)) throw bad("source must be revit, auto-publish or check");
  if (typeof b.publish !== "boolean") throw bad("publish must be true or false");
  if (b.publish && b.source === "check") throw bad("publish is true only for revit or auto-publish — the IFC Gate command checks a file, it publishes nothing");
  return {
    file, result: b.result, passed: GATE_PASSED[b.result], contract: v("contract"), contract_ref: v("contract_ref"),
    contract_source: v("contract_source"), contract_sha256: v("contract_sha256")?.toLowerCase() ?? null, schema: v("schema"),
    entities: v("entities"), failures: failures.map((f) => (typeof f === "string" ? f : { requirement: f.requirement, detail: f.detail })),
    failures_total: total, sha256: v("sha256")?.toLowerCase() ?? null, size_bytes: v("size_bytes"), source: b.source, publish: b.publish,
  };
}

/** POST /cde/:key/delivery-gate (spec 2026-09-27 Decision 5; GATE-E1/H5): Revit's gate result, written by the bridge.
 *  Open to the machine credential and, as recordRevitReport's rows, to a signed-in contributor or above — a viewer or a
 *  non-member is a 403 before the body is validated; a user's rows are budgeted (429). The open audit route still refuses
 *  entity_type delivery_gate. One delivery_gate row, "IFC delivery gate PASS | FAIL | NOT CHECKED: <file>", new_value
 *  the validated body with the full failure list (a signed-in caller's source as claimed_source), actor a signed-in
 *  caller's verified identity whatever the body claims (audit's resolveActor); a FAIL from a publish is also held
 *  (hold:gate) — a contributor could register the file, as on /propose. The gate is Revit's attestation: the bridge
 *  never sees Revit's bytes. → {id, hash, hold: {id, hash} | null}, each id and hash the stored row's (null when none
 *  came back — never a made-up id). */
export async function recordDeliveryGate(key, b = {}) {
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  const role = await myRole(key);
  if (role !== "service" && (ROLE_RANK[role] || 0) < ROLE_RANK.contributor)
    throw Object.assign(new Error(`a delivery_gate row is a contributor's or above (you are ${role || "not a member"}) — nothing was saved`), { status: 403 });
  const g = readDeliveryGate(b);
  takeWriteBudget("gate rows", { perUser: 20, all: 60 }); // the machine credential (no signed-in user) is not budgeted
  const proj = await ensureProject(key);
  const actor = typeof b.actor === "string" && b.actor.trim() ? b.actor.trim() : "Revit";
  // The source is a self-label: a signed-in caller's is kept as claimed_source only and their hold reads "intake", as on
  // /propose — no member holds a file as Revit's Governed Publish (cde-rem-9).
  const machine = role === "service";
  const row = await audit(proj.id, "delivery_gate", null, `IFC delivery gate ${GATE_WORDS[g.result]}: ${g.file}`, actor, null,
    machine ? g : { ...g, source: null, claimed_source: g.source });
  let hold = null;
  if (g.passed === false && g.publish) {
    const h = await writeHold(proj, {
      stage: "gate", container_name: g.file, sha256: g.sha256, size_bytes: g.size_bytes, verdict: "rejected", failures: g.failures, failures_total: g.failures_total,
      source: machine ? g.source : "intake", gate_row_id: row?.id ?? null, proposal_row_id: null, contract_ref: g.contract_ref, ids_ref: null, naming_ref: null, actor,
    });
    hold = { id: h?.id ?? null, hash: h?.hash ?? null };
  }
  return { id: row?.id ?? null, hash: row?.hash ?? null, hold };
}

/** GET /cde/:key/holding (spec 2026-09-27 Decision 7): the held list, derived — {items, cleared_recent} from
 *  holding-logic.mjs over every hold row (entity_type hold, paged through listAudit to the project's total), the
 *  project's files and their versions (listFiles) and each version's newest verdict (listVersionVerdictRows). A read
 *  that fails is a 502 "not read — …", never an empty list; a non-member's 403 and an unknown key's 404 stay theirs. */
export async function readHolding(key) {
  const { heldItems, clearedRecent, typeGapGroups } = await import("./holding-logic.mjs");
  let rows, gapRows, files, verdicts;
  try {
    rows = await auditAll(key, { entity_type: "hold" });
    gapRows = await auditAll(key, { entity_type: "type_gap" }); // MA-2c: Promote's type gaps, run by run
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[holding] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the hold rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const verdictOf = new Map();
  for (const r of verdicts) if (!verdictOf.has(r.version_id)) verdictOf.set(r.version_id, r.verdict); // newest first
  const versionsByName = {};
  for (const f of files) (versionsByName[f.iso_name] ||= []).push(...f.versions.map((v) => ({ id: v.id, created_at: v.created_at, verdict: verdictOf.get(v.id) ?? null })));
  const core = await import("./sentinel-core.mjs");
  return {
    items: heldItems(rows, rows, versionsByName), cleared_recent: clearedRecent(rows, rows, versionsByName),
    type_gaps: typeGapGroups(gapRows, rows, await catalogInForce(key), core.sameCategory),
  };
}

/** MA-2c: the type catalogue in force for `key` (project → office) as the type-gap close rule reads it — {types, label}; types null
 *  when none is installed or it could not be read or no longer passes the install check (the label says which: nothing is then
 *  closed by it, and the groups stay open). */
async function catalogInForce(key) {
  try {
    const { resolveArtefact, refLabel, validateArtefact } = await import("./artefact-store.mjs");
    const a = await resolveArtefact(key, "type_catalog");
    if (a.source === "none") return { types: null, label: `none — not installed for ${key} or its office` };
    validateArtefact("type_catalog", a.body);
    return { types: a.body.types, label: refLabel(a) };
  } catch (e) {
    return { types: null, label: `not read — ${e?.message || e}` };
  }
}

/** MA-2c: POST /cde/:key/holding/type-gaps/:group/dismiss {reason} (design §6.8) — a lead clears a type-gap group, as dismissHold
 *  clears a held file: lead or owner, the machine credential passes (founder decision F8: the existing dismissal's rule); a reason is
 *  required (≤ 500); only an open group (409 otherwise). One hold:type_gap_dismissed row, new_value {group, reason, category, want,
 *  size, elements, labels} — what it saw: a later run that reports no more keeps it closed (review amendment C5); the type_gap rows
 *  stay. → {id, hash} of that row. */
export async function dismissTypeGap(key, group, b = {}) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason || reason.length > 500) throw Object.assign(new Error("reason is required — a lead's dismissal says why, in at most 500 characters"), { status: 400 });
  const g = (await readHolding(key)).type_gaps.open.find((x) => x.id === group);
  if (!g) throw Object.assign(new Error(`type-gap group ${group} is not open on ${key}`), { status: 409 });
  const proj = await ensureProject(key);
  const row = await audit(proj.id, "hold", null, `hold:type_gap_dismissed ${group}`, b.actor || "web", null,
    { group, reason, category: g.category, want: g.want, size: g.size, elements: g.elements, labels: g.labels });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}

/** POST /cde/:key/holding/dismiss {container_name, reason} (spec 2026-09-27 Decision 8): a lead clears a held item —
 *  lead or owner, the machine credential passes (requireMinRole); a reason is required (≤ 500); only a name that is on
 *  hold (409 otherwise). One hold:dismissed row, new_value {container_name, reason}; the refusal rows stay. → {id,
 *  hash} of that row (null when none came back). */
export async function dismissHold(key, b = {}) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const name = typeof b.container_name === "string" ? b.container_name.trim() : "";
  if (!name) throw bad("container_name is required — the held file's name");
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason || reason.length > 500) throw bad("reason is required — a lead's dismissal says why, in at most 500 characters");
  if (!(await readHolding(key)).items.some((i) => i.container_name === name)) throw Object.assign(new Error(`${name} is not on hold on ${key}`), { status: 409 });
  const proj = await ensureProject(key);
  const row = await audit(proj.id, "hold", null, `hold:dismissed ${name}`, b.actor || "web", null, { container_name: name, reason });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}

// ── The review chain (phase 6b, spec 2026-09-27 Decisions 10-14). The database runs it (migration 0032): cde_transition
// opens a chain when a signed-in lead shares a version on a project whose review@n has steps (review:start), and
// review_decide records each signed-in person's decision (review:approve <k> | review:reject <k>) and publishes on the
// last approval or sends the version back to wip on a rejection. The bridge only reads the chain and forwards a decision.

const REVIEW_NO_FORWARDING = "this bridge does not forward the session (SUPABASE_ANON_KEY is not set) — no review decision can be recorded here";

/** GET /cde/:key/reviews (spec 2026-09-27 Decisions 13-14): the open review chains, derived — {items} from
 *  review-logic.mjs over every review row and every state:shared->wip row of the project (auditAll), its versions with
 *  their state (listFiles), and this caller: uid, the forwarded JWT's sub — only when this bridge forwards the session,
 *  the one way a decision reaches review_decide — and rank, the role's (myRole; the machine credential ranks 0). A read
 *  that fails is a 502 "not read — …", never an empty list; a non-member's 403 and an unknown key's 404 stay theirs. */
export async function readReviews(key) {
  const { openChains } = await import("./review-logic.mjs");
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  let reviewRows, backRows, files, role;
  try {
    [reviewRows, backRows, files, role] = await Promise.all([
      auditAll(key, { entity_type: "review" }),
      auditAll(key, { entity_type: "container_version", action_prefix: "state:shared->wip" }),
      listFiles(key),
      myRole(key),
    ]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[reviews] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the review rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const versions = files.flatMap((f) => f.versions.map((v) => ({ id: v.id, container_name: f.iso_name, revision: v.revision, state: v.state })));
  const sub = currentSub();
  const uid = sub && forwardingConfigured() ? sub : null;
  return { items: openChains(reviewRows, backRows, versions, { uid, rank: ROLE_RANK[role] || 0, ...(sub && !uid ? { unsigned: REVIEW_NO_FORWARDING } : {}) }) };
}

/** POST /cde/:key/versions/:vid/review {decision, note} (spec 2026-09-27 Decision 12): a signed-in person's decision on
 *  the step a version under review waits on. review_decide (migration 0032) checks the rest — the step's role, not the
 *  submitter, not a second approval on the chain, a rejection's note — and in the same transaction publishes on the last
 *  approval or sends the version back to wip on a rejection. The machine credential never decides: with no user JWT
 *  forwarded this is a 403 before any call. decision approve | reject and a note (≤ 500) are 400s before any call; the
 *  version must be on the key (versionOnKey, a 400). review_decide's refusals keep its words (TRANSITION_REFUSAL: P0001 a
 *  409, P0002 a 404, 42501 a 403). → its answer {id, hash, decision, step, of, name, role, published, state} and the
 *  container's name (the rejection topic's). */
export async function reviewDecide(key, version_id, { decision, note } = {}) {
  const refuse = (status, m) => Object.assign(new Error(m), { status });
  if (!currentUserToken() || !forwardingConfigured()) throw refuse(403, "a review decision is a signed-in person's — sign in (and the bridge must forward the session: SUPABASE_ANON_KEY)");
  if (decision !== "approve" && decision !== "reject") throw refuse(400, "decision must be approve or reject");
  if (note != null && !(typeof note === "string" && note.length <= 500)) throw refuse(400, "note must be a string of at most 500 characters — the reviewer's words");
  const { version } = await versionOnKey(key, version_id);
  const c = await sb(`information_containers?id=eq.${version.container_id}&select=iso_name`);
  try {
    const r = await sb(`rpc/review_decide`, { method: "POST", body: { p_version: version_id, p_decision: decision, p_note: note ?? null } });
    void mirrorStateSafe(version_id); // committed (a last approval publishes, a rejection sends back to wip); never awaited
    return { ...r, container_name: Array.isArray(c) ? c[0]?.iso_name ?? null : null };
  } catch (e) {
    const status = TRANSITION_REFUSAL[e?.body?.code];
    if (status) throw refuse(status, e.body.message);
    throw e;
  }
}

// ── Element snapshots (revision tracking) — migration 0005 ─────────────────────────────────────────────
// Persist per-element, per-revision quantities keyed on the IFC GlobalId. The shared revision-diff engine
// (WebApp/src/sentinel-core/revision-diff.ts) diffs two revisions on guid to serve 5D cost, 6D carbon, and
// clash provenance. APPEND-ONLY: each ingest = one model_revisions row + a batch of element_snapshots.

const MAX_SNAPSHOTS = 200000;              // safety cap per revision (a very large federated model)
const SNAP_INSERT_CHUNK = 2000;            // rows per PostgREST insert (keep each request modest)
const SNAP_PAGE = 1000;                     // read page size (matches Supabase's default db-max-rows)
const snapNum = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Ingest a model revision + its element snapshots. Returns { revision_id, element_count, rev_code, uploaded_at }. */
/** The project's live file version, but only if EXACTLY one exists (so auto-linking can't mislink). */
async function soleLiveVersionId(projectId) {
  const conts = await sb(`information_containers?project_id=eq.${projectId}&deleted_at=is.null&select=id`);
  const ids = (Array.isArray(conts) ? conts : []).map((c) => c.id);
  if (!ids.length) return null;
  const live = await sb(`container_versions?is_live=eq.true&deleted_at=is.null&container_id=in.(${ids.join(",")})&select=id`);
  return Array.isArray(live) && live.length === 1 ? live[0].id : null;
}

export async function createRevision(key, b = {}) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "contributor"); // 0038: element_snapshots is the bridge's alone — a take-off is a contributor's, checked here
  const proj = await ensureProject(key);
  // Link this take-off to a file version so the Versions panel can diff versions (migration 0011). Honour an explicit
  // id — a version of this project only (versionOnKey: a 400 in words otherwise); else auto-link to the sole live
  // version — a captured baseline belongs to the live file.
  const containerVersionId = b.container_version_id
    ? (await versionOnKey(key, b.container_version_id)).version.id
    : await soleLiveVersionId(proj.id);
  const snaps = Array.isArray(b.snapshots) ? b.snapshots : [];
  if (snaps.length > MAX_SNAPSHOTS) throw new Error(`too many snapshots (${snaps.length} > ${MAX_SNAPSHOTS})`);
  // Normalize + drop guid-less rows (guid is NOT NULL and the join key), then de-dupe on guid within the batch
  // (PK is (revision_id, guid) — a dup would 409 the whole insert; first occurrence wins, matching the diff engine).
  const seen = new Set();
  // The web sends its measures nested ({guid, …, quantities: {count, area, …}} — revision-diff.ts snapshotFromQuantities);
  // until 2026-09-29 they were read at the top level and every revision was stored without quantities. Flat still reads.
  const deduped = snaps
    .map((s) => {
      const q = s?.quantities && typeof s.quantities === "object" ? s.quantities : s;
      return {
        guid: s && s.guid != null ? String(s.guid) : "",
        category: s?.category ?? null, type_name: s?.type_name ?? null,
        count: snapNum(q?.count), length: snapNum(q?.length), area: snapNum(q?.area), volume: snapNum(q?.volume), weight: snapNum(q?.weight),
      };
    })
    .filter((r) => r.guid && (seen.has(r.guid) ? false : (seen.add(r.guid), true)));
  // Write the revision header with the count we will actually persist, so element_count never overstates.
  const rev = (await sb(`model_revisions`, {
    method: "POST",
    body: {
      project_id: proj.id,
      container_version_id: containerVersionId,
      rev_code: b.rev_code || null,
      model_id: b.model_id || null,
      element_count: deduped.length,
      uploaded_by: resolveActor(b.uploaded_by),
    },
    prefer: "return=representation",
    service: true, // 0038: model_revisions has no signed-in insert — after the contributor check above
  }))[0];
  for (let i = 0; i < deduped.length; i += SNAP_INSERT_CHUNK) {
    const chunk = deduped.slice(i, i + SNAP_INSERT_CHUNK).map((r) => ({ ...r, revision_id: rev.id, project_id: proj.id }));
    await sb(`element_snapshots`, { method: "POST", body: chunk, prefer: "return=minimal", service: true });
  }
  await audit(proj.id, "revision", rev.id, "snapshot ingested", b.uploaded_by || "web", null,
    { rev_code: rev.rev_code, model_id: rev.model_id, element_count: deduped.length });
  return { revision_id: rev.id, element_count: deduped.length, rev_code: rev.rev_code, uploaded_at: rev.uploaded_at };
}

/** List a project's revision metadata (newest first) — the baseline picker. No per-element rows. */
export async function listRevisions(key) {
  const proj = await ensureProject(key);
  return sb(`model_revisions?project_id=eq.${proj.id}&select=id,rev_code,model_id,element_count,container_version_id,uploaded_by,uploaded_at&order=uploaded_at.desc&limit=200`);
}

/** IFC5-aligned ECS export of the governed element graph for a project (default = latest revision). */
export async function getElementGraph(key, revisionId) {
  const revs = await listRevisions(key);
  const rev = revisionId ? (revs.find((r) => r.id === revisionId) ?? { id: revisionId }) : (revs[0] ?? null);
  if (!rev) return { revision: null, graph: { schema: "sentinel.element-graph/1", layer: key, count: 0, elements: [] } };
  const rows = await getRevisionSnapshots(rev.id);
  const measures = ["count", "length", "area", "volume", "weight"];
  const snaps = rows.map((r) => {
    const quantities = {};
    for (const m of measures) if (r[m] != null) quantities[m] = Number(r[m]);
    return { guid: r.guid, category: r.category, type_name: r.type_name, quantities };
  });
  const c = await core();
  return { revision: rev, graph: c.toElementGraph(snaps, `${key}${rev.rev_code ? "@" + rev.rev_code : ""}`) };
}

/**
 * The per-revision delta: what changed between two take-offs, priced and carbon-costed.
 *
 * Defaults to the two newest revisions, which is the "what did this publish just do" question.
 * Returns a `not_comparable` answer rather than a zero when there is only one revision — a single
 * baseline has nothing to be different from, and reporting "no change" would be a fabricated pass.
 */
export async function revisionDelta(key, { from, to } = {}) {
  const revs = await listRevisions(key);
  const byId = new Map((revs || []).map((r) => [r.id, r]));
  const newer = to ? byId.get(to) : revs?.[0];
  const older = from ? byId.get(from) : revs?.[1];
  if (!newer || !older) {
    return {
      comparable: false,
      reason: !revs?.length
        ? "This project has no take-off revisions yet, so there is nothing to compare."
        : revs.length === 1
          ? "Only one revision exists — a baseline has nothing to be different from."
          : "One of the requested revisions does not belong to this project.",
      revisions: (revs || []).slice(0, 10),
    };
  }

  const [oldRows, newRows, c] = await Promise.all([getRevisionSnapshots(older.id), getRevisionSnapshots(newer.id), core()]);
  const toSnap = (r) => {
    const quantities = {};
    for (const m of ["count", "length", "area", "volume", "weight"]) if (r[m] != null) quantities[m] = Number(r[m]);
    return { guid: r.guid, category: r.category, type_name: r.type_name, quantities };
  };
  const diff = c.diffSnapshots(oldRows.map(toSnap), newRows.map(toSnap));
  const summary = c.summarizeDiff(diff);
  // A revision whose rows carry no quantity measured none: its elements can be compared, its cost and carbon cannot
  // (a missing count would price as 1, a missing area as 0 — a figure nobody measured).
  const measured = (rows) => rows.some((r) => ["count", "length", "area", "volume", "weight"].some((m) => r[m] != null));
  const unmeasured = [[older, oldRows], [newer, newRows]].filter(([, rows]) => !measured(rows)).map(([r]) => `revision ${r.rev_code || r.id}`);
  if (unmeasured.length) {
    return {
      comparable: false,
      reason: `${unmeasured.join(" and ")} ${unmeasured.length > 1 ? "carry" : "carries"} no quantities (a take-off saved before quantities were kept, or an intake capture of element identities only) — no cost or carbon is stated.`,
      // Identities are compared; "changed" means a quantity moved, which one side never measured — so only in_both.
      elements: { added: summary.added, deleted: summary.deleted, in_both: summary.changed + summary.unchanged },
      from: { id: older.id, rev_code: older.rev_code, uploaded_at: older.uploaded_at, element_count: older.element_count },
      to: { id: newer.id, rev_code: newer.rev_code, uploaded_at: newer.uploaded_at, element_count: newer.element_count },
    };
  }
  // The project's own rate pack when it has one (the Cost 5D panel's), else the reference table — named either way; a
  // pack that could not be read is said, never silently replaced (item 6, 5D).
  let rates = c.defaultRates, ratesBasis = "bridge reference rate table (this project has no rate pack)";
  try {
    const pack = (await ensureProject(key))?.metadata?.rate_pack; // read as stored — getProjectMeta would seed on a read
    if (pack?.rules?.length) { rates = pack; ratesBasis = "the project's rate pack"; }
  } catch (e) { ratesBasis = `bridge reference rate table — the project's rate pack was not read (${String(e?.message || e).slice(0, 120)})`; }
  // The project's installed carbon factor pack (project → office) when there is one, else the reference factors —
  // named either way, or "not read (why)" (item 6, 6D).
  let factors = c.defaultFactors, factorsBasis = "indicative reference factors (no carbon factor pack installed)";
  try {
    const { resolveArtefact, refLabel } = await import("./artefact-store.mjs");
    const cf = await resolveArtefact(key, "carbon_factors");
    if (cf.source !== "none" && cf.body) {
      factors = { unit_label: cf.body.unit_label || "kgCO2e", source: cf.body.label, factors: cf.body.factors };
      factorsBasis = `${cf.body.label} — ${refLabel(cf)}`;
    }
  } catch (e) { factorsBasis = `indicative reference factors — the installed pack was not read (${String(e?.message || e).slice(0, 120)})`; }
  const cost = c.costDiff(diff, rates);
  const carbon = c.carbonDiff(diff, factors);
  const { deltaHeadline } = await import("./revision-delta.mjs");
  return {
    comparable: true,
    from: { id: older.id, rev_code: older.rev_code, uploaded_at: older.uploaded_at, element_count: older.element_count },
    to: { id: newer.id, rev_code: newer.rev_code, uploaded_at: newer.uploaded_at, element_count: newer.element_count },
    summary, cost, carbon,
    ...deltaHeadline(summary, cost, carbon, {
      currency: rates?.currency ?? null,
      rates: ratesBasis,
      carbon_factors: factorsBasis,
    }),
  };
}

/** Fetch one revision's element snapshots (for diffing / rehydrating a baseline). Pages past db-max-rows. */
export async function getRevisionSnapshots(revisionId) {
  const rid = encodeURIComponent(revisionId);
  const out = [];
  for (let offset = 0; ; offset += SNAP_PAGE) {
    const batch = await sb(`element_snapshots?revision_id=eq.${rid}&select=guid,category,type_name,count,length,area,volume,weight&order=guid.asc&limit=${SNAP_PAGE}&offset=${offset}`);
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < SNAP_PAGE) break;
  }
  return out;
}

// ── Cross-machine event feed (migration 0010) — bridges fan out SSE via a shared table ─────────────────
/** Record an SSE event so other bridges' poll loops re-broadcast it to their own clients. */
export async function emitEvent(project, origin, payload) {
  // bridge_events is service-only (RLS denies authed writes) → force the service key.
  await sb(`bridge_events`, { method: "POST", body: { project_id: project, origin, payload }, prefer: "return=minimal", service: true });
}
/** The current tip id — a bridge starts polling from here so it never replays history at startup. */
export async function maxEventId() {
  const r = await sb(`bridge_events?select=id&order=id.desc&limit=1`, { service: true });
  return r?.[0]?.id ? Number(r[0].id) : 0;
}
/** Events after `afterId` (ascending), for the poll loop. */
export async function pollEvents(afterId) {
  return (await sb(`bridge_events?id=gt.${Number(afterId) || 0}&select=id,project_id,origin,payload&order=id.asc&limit=500`, { service: true })) || [];
}
/** Drop events older than `olderThanMs` (they're only for live fan-out). */
export async function pruneEvents(olderThanMs = 600000) {
  await sb(`bridge_events?created_at=lt.${new Date(Date.now() - olderThanMs).toISOString()}`, { method: "DELETE", prefer: "return=minimal", service: true });
}

// ── The "propose API" (referee layer) — an agent/tool PROPOSES; Sentinel adjudicates deterministically with
// the SAME governed-core validators the browser uses (bundled to sentinel-core.mjs) and records the verdict
// immutably. Let a thousand generators propose; this is where their output becomes TRUE (or is rejected). ──
let _core = null;
const core = async () => (_core ??= await import("./sentinel-core.mjs"));

/** The one sentence every naming judge gives when nothing is installed — the install route included. */
export const NO_NAMING_REASON = "no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)";

/**
 * The naming ruleset a PROJECT is governed by: its `naming` artefact, else its office's, else none.
 * There is no bridge default and no env-var file (cohesion phase 3): `none` is an answer the judges
 * report as not_checkable, never a pilot's pack. `ref`/`sha256` say exactly which version judged.
 * Errors propagate — a resolver failure is an `error`, not a silent "none" (runCheck reports it).
 */
export async function projectNamingRuleset(key, deps = {}) {
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const r = await resolveArtefact(key, "naming");
  return { ruleset: r.body ?? null, source: r.source, ref: r.ref, sha256: r.sha256 };
}

/**
 * One ledger entry, by id, scoped to the project — the backing read for a receipt check.
 * Returns null rather than throwing: "no such entry" is an answer a verifier needs to hear.
 */
export async function getAuditEntry(key, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) return null;
  const proj = await ensureProject(key);
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&id=eq.${n}&select=*`);
  return (Array.isArray(rows) ? rows[0] : rows) ?? null;
}

/** The row an anonymous receipt check names (cohesion phase 4c), or null. Service key only, whatever
 *  Authorization the caller sent; never ensureProject — no "default" self-heal, no key-specific 404 or 403.
 *  An unknown key still costs the second read (against the nil uuid), so it takes as long as an unknown id. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export async function publicAuditRow(key, id) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const proj = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=id`, { service: true });
  const pid = Array.isArray(proj) && proj[0]?.id ? proj[0].id : NIL_UUID;
  const rows = await sb(`audit_log?id=eq.${id}&project_id=eq.${pid}&select=id,at,hash,new_value`, { service: true });
  return (Array.isArray(rows) ? rows[0] : null) ?? null;
}

/** Re-derive the receipt for a recorded adjudication straight from the ledger. */
export async function receiptFor(key, id) {
  const row = await getAuditEntry(key, id);
  return row ? buildReceipt(row, { project_key: key }) : null;
}

/** Check a receipt a client is holding against the ledger entry it names. */
export async function checkReceipt(key, receipt) {
  const row = receipt && receipt.audit_id !== undefined ? await getAuditEntry(key, receipt.audit_id) : null;
  return verifyReceipt(receipt, row);
}

/** The failure list a caller gets back, with honest totals. Unfiltered: the first 200 of everything.
 *  With `requirement` (fix-in-place checks one requirement at a time): only that requirement's failures,
 *  up to 1000. `failures_total` / `failures_matched` are the counts BEFORE slicing, so a client can tell
 *  "no failure came back" from "the list was cut off" without guessing at the cap. Pure. */
export function selectFailures(failures, requirement) {
  const all = Array.isArray(failures) ? failures : [];
  const filtered = typeof requirement === "string" && requirement.trim()
    ? all.filter((f) => String(f?.requirement ?? "").toLowerCase() === requirement.trim().toLowerCase())
    : null;
  const chosen = filtered ?? all;
  const cap = filtered ? 1000 : 200;
  return { failures: chosen.slice(0, cap), failures_total: all.length, failures_matched: chosen.length };
}

/** Judge a container name by a naming ruleset; null when none is in force or it is off. A missing
 *  enforce is reject (plan constraint) and the result records the enforce actually applied. */
export function judgeContainerName(validate, name, rs) {
  const enforce = rs?.enforce ?? "reject";
  if (!rs || enforce === "off") return null;
  return { ...validate(name, rs), enforce };
}

/** POST /cde/:key/propose's `register` (cohesion phase 5a, spec 2026-09-26 Decision 3), or null when absent. The name
 *  registered is the name the naming standard judged, so it must equal container_name; size_bytes and sha256 tie the
 *  version to the file that was judged. Pure: a bad body is a 400 before any read or ledger row. */
function readRegister(b) {
  if (b.register === undefined || b.register === null) return null;
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const r = b.register;
  if (typeof r !== "object" || Array.isArray(r)) throw bad("register must be {name, size_bytes, sha256}");
  if (b.version_id) throw bad("pass version_id (stamp an existing version) or register (register a new one), not both");
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) throw bad("register.name is required");
  if (name !== b.container_name) throw bad("register.name must equal container_name — the name the naming standard judges is the name registered");
  if (!Number.isSafeInteger(r.size_bytes) || r.size_bytes < 0) throw bad("register.size_bytes must be a whole number of bytes");
  if (typeof r.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(r.sha256)) throw bad("register.sha256 must be 64 hex characters");
  // A drawing carries its own revision (P01, C02…; item 5 Phase A); without one the version is v{N+1}, as before.
  let revision = null;
  if (r.revision !== undefined && r.revision !== null) {
    revision = typeof r.revision === "string" ? r.revision.trim() : "";
    if (!revision || revision.length > 16) throw bad("register.revision must be the drawing's revision — 1 to 16 characters (P01, C02…)");
  }
  return { name, size_bytes: r.size_bytes, sha256: r.sha256.toLowerCase(), ...(revision ? { revision } : {}) };
}

/** Adjudicate a proposal (POST /cde/:key/propose, intake, the AI tools, MCP, changesets): validate `elements` (the
 *  ElementProperties shape) against the IDS — the project's installed artefact → the office's → the caller's `ids` →
 *  none, named in ids_source / ids_ref — and the container name against the naming standard, write one proposal row,
 *  and return { verdict, downgraded, summary, failures, naming, ids_*, audit_id, version, verdict_audit_id,
 *  verdict_hash, receipt } (verdict_hash: the verdict row's own chain hash, so Revit can print its receipt; null when
 *  nothing was stamped).
 *  No IDS → "recorded"; accepted with nothing in scope → "recorded", downgraded "nothing in scope". `version_id` stamps
 *  the key's own version (another's is a 400; below the lead role a 403 — phase 6b); `register` registers a wip version
 *  on accepted or recorded and stamps
 *  it (readRegister). A stamp is what publishing reads (migration 0031), so an IDS or a naming ruleset the caller sent
 *  together with version_id or register is a 400: only what is installed on the project or its office stamps. Every
 *  400 comes before any ledger row.
 *  The Holding Area (phase 6a, spec 2026-09-27 Decisions 4 and 6): the proposal row names the file it judged —
 *  container_name, sha256 and size_bytes from register or from intake's `opts.intake` {source, sha256, size_bytes,
 *  gate_row_id} (a second parameter: no HTTP body can set it) — and gate_row_id: intake's, the bridge's own; else
 *  b.gate_row_id, the caller's claim (Revit sends the id the delivery-gate route answered), kept only when one read finds
 *  it is a delivery_gate row of this project. A rejected verdict on such a file is held — one hold:naming (the naming
 *  judge rejected) or hold:ids row — only when the IDS and the naming standard that judged are the installed ones and
 *  the caller could register the file (couldRegister). The reply's `hold` is {id, hash} of that row, or null when
 *  nothing was held. couldRegister and writeHold run after the proposal row is on the ledger: a failure there throws (a
 *  500, its message scrubbed) and the refusal stands on the ledger unheld, as a failed stamp does. */
export async function adjudicateProposal(key, b = {}, opts = {}) {
  const reg = readRegister(b);
  const intake = opts.intake && typeof opts.intake === "object" ? opts.intake : null;
  const file = reg ? { container_name: reg.name, sha256: reg.sha256, size_bytes: reg.size_bytes, ...(reg.revision ? { revision: reg.revision } : {}) }
    : intake && b.container_name ? { container_name: b.container_name, sha256: intake.sha256 ?? null, size_bytes: intake.size_bytes ?? null } : null;
  const positive = (n) => Number.isSafeInteger(n) && n > 0;
  let gateRowId = positive(intake?.gate_row_id) ? intake.gate_row_id : null;
  // The naming twin of the client-IDS rule below: a caller's own ruleset (even {fields: [], enforce: "off"}) may judge
  // a plain proposal, never the name a stamped or registered version carries. Pure, so before any read.
  if (b.naming != null && (b.version_id || reg)) {
    throw Object.assign(new Error(`a version's name is judged only by the naming standard installed on ${key} or its office — send no naming ruleset, or propose without version_id/register`), { status: 400 });
  }
  const proj = await ensureProject(key);
  // A proposal writes a ledger row and may raise BCF topics: the contributor role or above (H0 D4, cde-rem-6 — a viewer
  // writes nothing), asked here so every route that proposes asks it (/propose, changesets, intake, the AI tool). A stamp
  // needs the lead role (phase 6b, spec 2026-09-27 Decision 11: a stamp is what lets a version into a review chain) — a
  // 403 before the version is read; the machine credential passes as service (requireMinRole). A verdict is stamped only
  // on a version of the project that judged it (spec Decision 4): another project's version, an unknown id and a
  // malformed one are the same 400, before any ledger row (versionOnKey, Task 1).
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, b.version_id ? "lead" : "contributor");
  if (b.version_id) await versionOnKey(key, b.version_id);
  const c = await core();
  const elements = Array.isArray(b.elements) ? b.elements : [];
  const { resolveIdsSpec } = await import("./artefact-store.mjs");
  const resolved = await resolveIdsSpec(key, b);
  const spec = resolved.spec, idsSource = resolved.source, clientIdsIgnored = resolved.client_ids_ignored;
  // An IDS the caller sent may judge a plain proposal, but its verdict never lands on a version (controller amendment,
  // 5a): a stamp is what publishing reads, so only the project's or office's installed IDS may make one. Refused
  // before any ledger row, registration or stamp.
  if (idsSource === "client" && (b.version_id || reg)) {
    throw Object.assign(new Error(`a version is stamped only by the IDS installed on ${key} or its office — install one (Packs or Documents ▸ EIR ▸ Install on this project) or propose without version_id/register`), { status: 400 });
  }
  // Delegate to the pure, unit-tested referee core (same code the browser uses).
  const adj = c.adjudicate(spec, elements);
  const { summary, failures } = adj;
  let verdict = adj.verdict;

  // IDS enforcement: adjudicate is a pure validator; the ruleset's `enforce` decides whether element-check
  // failures block the publish. "reject" (default) → failures reject; "warn" → publish but keep the failures
  // as tracked warnings (still raised as BCF so the team sees them); "off" → ignore them entirely.
  const idsEnforce = (spec && typeof spec.enforce === "string") ? spec.enforce : "reject";
  let warned = false;
  if (verdict === "rejected" && idsEnforce !== "reject") {
    verdict = "accepted";
    warned = idsEnforce === "warn" && failures.length > 0;
  }

  // Naming gate: if the caller supplies the container/file name, validate it against the (swappable) naming
  // ruleset and fold the result into the verdict per the ruleset's enforcement level. `reject` → a bad name
  // fails the whole publish (even if the IDS passed); `warn` → recorded but doesn't block; `off`/absent → skip.
  let naming = null, namingProv = { naming_ref: null };
  if (b.container_name) {
    // The project's naming artefact (project → office) governs the name — the same source naming.containers
    // reads. A client-sent ruleset is still honoured (it is the model's own name check) and recorded as
    // "client". Nothing installed → the name is not judged and the verdict row says so (naming_ref null).
    const client = b.naming && typeof b.naming === "object" && Array.isArray(b.naming.fields);
    const named = client ? { ruleset: b.naming, source: "client", ref: "client", sha256: null } : await projectNamingRuleset(key);
    namingProv = { naming_ref: named.ref ?? null, naming_source: named.source, naming_sha256: named.sha256 ?? null, ...(named.ruleset ? {} : { naming_reason: NO_NAMING_REASON }) };
    const rs = named.ruleset;
    naming = judgeContainerName(c.validateContainerName, b.container_name, rs);
    if (naming && !naming.ok && naming.enforce === "reject") verdict = "rejected";
  }

  // The MIDP's word on the name (item 5 Phase A): planned or not, and the revision against the plan's. Read before the
  // proposal row so the row carries it; a failed read is "not read — why", never "not planned".
  let midp = null;
  if (b.container_name) {
    try {
      const [{ listDeliverables }, { midpMatch }] = await Promise.all([import("./deliverables-store.mjs"), import("./deliverables-logic.mjs")]);
      midp = midpMatch(await listDeliverables(key), b.container_name, reg?.revision ?? null);
    } catch (e) { midp = { not_read: String(e?.message || e).slice(0, 200) }; }
  }

  // Nothing in scope is recorded (spec Decision 4), decided here once for every caller — /propose, intake, the AI
  // tools, MCP, changesets: an installed IDS that found no element in its scope measured nothing, so it is never
  // "accepted". Decided before the proposal row and any stamp; the row and the reply say why.
  const downgraded = verdict === "accepted" && summary.in_scope === 0 ? "nothing in scope" : null;
  if (downgraded) verdict = "recorded";
  // The caller's gate_row_id is a claim: the proposal and hold rows name it only when it is this project's gate row.
  if (!gateRowId && positive(b.gate_row_id)) {
    const found = await sb(`audit_log?id=eq.${b.gate_row_id}&project_id=eq.${proj.id}&entity_type=eq.delivery_gate&select=id`, { service: true });
    if (Array.isArray(found) && found.length) gateRowId = b.gate_row_id;
  }
  // A forwarded JWT's verified identity outranks the client-asserted actor (anti audit-trail poisoning, F3);
  // no JWT (Revit/agent/service) falls back to the supplied value so the pilot is unaffected.
  const trustedActor = resolveActor(b.actor ?? b.source, "agent");
  // The source is a self-label too. The machine credential's (no forwarded session — myRole's "service") names the action
  // and may mark a hold as Revit's; a signed-in caller's is kept as claimed_source only, so no member writes "Proposal
  // accepted from Governed Publish" or holds a file as Revit's (cde-rem-9).
  const machine = !currentUserToken();
  const source = machine ? b.source ?? null : null;
  // CLAIMED, never verified (see agent-provenance.mjs). Recorded so that "which model proposed this,
  // from which prompt" is answerable later — the question every AI-authored-BIM thread ends on.
  const agent = normalizeAgent(b.agent);
  const audit = (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "proposal", entity_id: null,
      action: `Proposal ${verdict}${source ? " from " + source : ""}`,
      actor: trustedActor, old_value: null,
      new_value: { source, ...(!machine && b.source != null ? { claimed_source: b.source } : {}), verdict, ...(downgraded ? { downgraded } : {}), summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ...namingProv, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}), ...(file || {}), ...(gateRowId ? { gate_row_id: gateRowId } : {}), ...(midp ? { midp } : {}) },
    },
    prefer: "return=representation", service: true, // audit_log bypasses RLS by design
  }))[0];
  // The verdict on a file version (entity_id = version id, action "verdict:<verdict>"): the Versions panel's badge and
  // what the transition guard reads (migration 0031). `version_id` stamps an existing version of this project (checked
  // above). `register` (one adjudication per publish, spec Decision 3) registers the version on an accepted or recorded
  // verdict — always wip, never attached to another version's geometry — and stamps this same result on it: one
  // proposal row, one registration, one verdict row. A rejected verdict registers nothing. A failure here throws (a
  // 500, its message scrubbed): the proposal row stays on the ledger, and a version left without its stamp cannot be
  // published without a signed-in lead's reason.
  const judged = { verdict, summary, failures, naming, warned, agent, downgraded, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref };
  let version = null, stamp = null;
  if (reg && verdict !== "rejected") {
    const r = await registerFileVersion(key, { ...reg, author: trustedActor, attach_geometry: false });
    version = { id: r.version.id, container_id: r.container_id, revision: r.version.revision, state: r.version.state };
    stamp = await recordVersionVerdict(key, version.id, judged, trustedActor);
  } else if (b.version_id) stamp = await recordVersionVerdict(key, b.version_id, judged, trustedActor);
  // A refusal of a registering file, judged by the installed standards, for a caller who could register it, is held
  // (spec 2026-09-27 Decision 4). The stage is the naming judge's when it rejected the name, else the IDS's; the
  // failures are the ones that refused. Any other refusal writes its proposal row and no hold.
  let hold = null;
  if (verdict === "rejected" && file && idsSource !== "client" && namingProv.naming_source !== "client" && (await couldRegister(key))) {
    const namingRefused = !!naming && !naming.ok && naming.enforce === "reject";
    const idsRefused = adj.verdict === "rejected" && idsEnforce === "reject";
    const row = await writeHold(proj, {
      stage: namingRefused ? "naming" : "ids", ...file, verdict,
      failures: [...(namingRefused ? naming.failures || [] : []), ...(idsRefused ? failures : [])],
      source: intake ? (intake.source === "web" ? "web" : "intake") : source === "Governed Publish" ? "revit" : source === "Auto-Publish" ? "auto-publish" : "intake",
      gate_row_id: gateRowId, proposal_row_id: audit?.id ?? null, contract_ref: null, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref, actor: trustedActor,
    });
    hold = { id: row?.id ?? null, hash: row?.hash ?? null };
  }
  return {
    verdict, downgraded, summary, ...selectFailures(failures, b.failures_requirement), naming, ...namingProv, warned,
    ids_enforce: idsEnforce, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, client_ids_ignored: clientIdsIgnored,
    audit_id: audit?.id ?? null, recorded_at: audit?.at ?? null,
    version, verdict_audit_id: stamp?.id ?? null, verdict_hash: stamp?.hash ?? null, hold, midp,
    agent,
    // The shareable proof. Anchored on the audit row's own chain hash, so it is checkable against a
    // ledger that cannot be rewritten — see POST /receipt/:key/verify.
    receipt: buildReceipt(audit, { project_key: key }),
  };
}

/** Stamp a verdict on a specific file version so the Versions panel badges the row
 *  (entity_id = version id, action "verdict:<verdict>"). Separate from the proposal row on purpose. Returns the
 *  ledger row: its id is the verdict_audit_id /propose answers and the one the state: row names when the version is
 *  published (migration 0031). */
export async function recordVersionVerdict(key, version_id, r, actor) {
  const proj = await ensureProject(key);
  return (await sb(`audit_log`, {
    method: "POST",
    body: {
      project_id: proj.id, entity_type: "file_version", entity_id: version_id,
      action: `verdict:${r.verdict}`, actor: resolveActor(actor, "web"), old_value: null,
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, naming_ref: r.naming_ref ?? null, ...(r.downgraded ? { downgraded: r.downgraded } : {}), ...(r.agent ? { agent: r.agent } : {}) },
    },
    prefer: "return=representation", service: true,
  }))[0];
}

/** Latest governed verdict per version id (from the "verdict:<v>" rows recordVersionVerdict writes);
 *  null when a version was never judged — the Federation Gate treats that as not judged, never as a pass. */
export async function versionVerdicts(key, versionIds = []) {
  const out = {};
  for (const id of versionIds) out[id] = null;
  const ids = versionIds.filter(isUuid);
  if (!ids.length) return out;
  const proj = await ensureProject(key);
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&entity_id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,entity_id,action&order=id.desc`);
  for (const r of rows || []) if (out[r.entity_id] === null) out[r.entity_id] = String(r.action).replace(/^verdict:/, "");
  return out;
}

/** Every governed verdict row of a project, newest first: [{ id, version_id, verdict }]. One read answers both
 *  "any verdict yet" and "the latest verdict of each live version", with the audit id each one needs as
 *  evidence (the journey, Next strip spec §1 — versionVerdicts keeps only the verdict word). */
export async function listVersionVerdictRows(key) {
  const proj = await ensureProject(key);
  // ponytail: unbounded read of the verdict rows; filter by the live version ids if a project's verdict history grows large.
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&select=id,entity_id,action&order=id.desc`);
  return (rows || []).map((r) => ({ id: r.id, version_id: r.entity_id, verdict: String(r.action).replace(/^verdict:/, "") }));
}

// ── Generic document store (migration 0009) — backs the clash/RFI/tender/pack stores as JSONB documents.
const enc = encodeURIComponent;
const DOC_CONFLICT = "on_conflict=store,project_id,doc_id";

/** List a store's documents for a project (data objects, insertion order). MA-3b3 (C3): read in pages — the database caps one
 *  reply (PostgREST max-rows), and with this order a cut read would drop the NEWEST documents without a word.
 *  ponytail: a short page ends the read — a database whose max-rows is set below DOC_PAGE would still cut on page one; ask for the
 *  exact count (sb's `count`) if that setting is ever lowered. */
const DOC_PAGE = 1000;
export async function docList(store, pid) {
  const out = [];
  for (let offset = 0; ; offset += DOC_PAGE) {
    const rows = (await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&select=data&order=created_at.asc,doc_id.asc&limit=${DOC_PAGE}&offset=${offset}`)) || [];
    out.push(...rows.map((r) => r.data));
    if (rows.length < DOC_PAGE) return out;
  }
}
/** Same, but lazy-migrate the local file into Supabase the first time a store/project with no rows is read. The local
 *  file is this machine's history, so only the machine credential migrates it (rfis-2): under a signed-in caller's
 *  session a refused insert answered 403 only when the file held rows for the key, which told a stranger which keys
 *  have local history. A signed-in caller reads what the database holds. */
export async function docListLazy(store, pid, localDocs, idOf) {
  let rows = await docList(store, pid);
  if (!rows.length && !currentUserToken() && Array.isArray(localDocs) && localDocs.length) {
    await sb(`bridge_docs`, { method: "POST", body: localDocs.map((d) => ({ store, project_id: pid, doc_id: String(idOf(d)), data: d })), prefer: "return=minimal" });
    rows = await docList(store, pid);
  }
  return rows;
}
export async function docGet(store, pid, docId) {
  const rows = await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&select=data`);
  return rows?.[0]?.data ?? null;
}
export async function docUpsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal", service });
  return data;
}
/** Generic CAS replace: overwrite the doc ONLY if data->>field currently equals `expected`
 *  (pass null for "the key is absent" — legacy rows). Returns data on success, null when the
 *  condition lost. The concurrency primitive behind changeset transitions and comment appends. */
export async function docReplaceIfField(store, pid, docId, data, field, expected, { service = false } = {}) {
  const cond = expected === null ? `data->>${enc(field)}=is.null` : `data->>${enc(field)}=eq.${enc(expected)}`;
  const rows = await sb(
    `bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&${cond}`,
    // MA-3a (C1): `service` for a store with no signed-in writer (changeset, migration 0037) — the caller checked the role first.
    { method: "PATCH", body: { data, updated_at: new Date().toISOString() }, prefer: "return=representation", service },
  );
  return Array.isArray(rows) && rows.length ? data : null;
}
/** Create-only insert (no merge) → PostgREST 409 on PK conflict. Used for the crypto keystore so a concurrent
 *  first-setup can't clobber a DEK that already encrypted files. */
export async function docInsert(store, pid, docId, data, { service = false } = {}) {
  await sb(`bridge_docs`, { method: "POST", body: { store, project_id: pid, doc_id: String(docId), data }, prefer: "return=minimal", service });
}
export async function docUpsertMany(store, pid, items, { service = false } = {}) { // items: [{doc_id, data}]
  if (!items.length) return;
  await sb(`bridge_docs?${DOC_CONFLICT}`, { method: "POST", body: items.map((i) => ({ store, project_id: pid, doc_id: String(i.doc_id), data: i.data, updated_at: new Date().toISOString() })), prefer: "resolution=merge-duplicates,return=minimal", service });
}
export async function docDeleteProject(store, pid, { service = false } = {}) {
  await sb(`bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}`, { method: "DELETE", prefer: "return=minimal", service });
}

// ── BCF topics (migration 0008) — team-wide topic store. One JSONB document per topic so the exact BCF-API
// shape is preserved; the bridge keeps all topic construction/mutation, cde-store only persists. ────────────
const bcfRow = (t) => ({ guid: t.guid, project_id: t.project_id, topic_status: t.topic_status, model: t.model || "", data: t });

/** List a project's topics (full objects), same status/model filter as the local store. `localTopics`
 *  (optional) lazy-migrates the local file into Supabase the first time a project with no rows is listed. */
export async function bcfListTopics(pid, { status, model } = {}, localTopics) {
  const q = `bcf_topics?project_id=eq.${encodeURIComponent(pid)}&select=data&order=created_at.asc`;
  let rows = await sb(q);
  // As docListLazy (rfis-2): the local file is this machine's history, so only the machine credential migrates it.
  // Under a signed-in caller's session no insert is attempted: bcf_topics has no signed-in writer (0038), and every topic
  // write goes through bcfCreateTopic's own contributor check.
  if ((!rows || !rows.length) && !currentUserToken() && Array.isArray(localTopics) && localTopics.length) {
    // 0039: a topic's guid is a UUID — a local topic with another guid is not migrated, and the log says which.
    const fit = localTopics.filter((t) => isUuid(t?.guid));
    for (const t of localTopics) if (!fit.includes(t)) console.warn(`[topics] '${pid}': the local topic '${t?.guid}' is not migrated (its guid is not a UUID)`);
    if (fit.length) await sb(`bcf_topics`, { method: "POST", body: fit.map(bcfRow), prefer: "return=minimal" });
    rows = await sb(q);
  }
  return (rows || [])
    .map((r) => r.data)
    .filter((t) => (!status ? t.topic_status !== "Closed" : status === "all" ? true : t.topic_status === status))
    .filter((t) => !model || t.model === model);
}

/** Fetch one topic object (or null). */
export async function bcfGetTopic(pid, guid) {
  const rows = await sb(`bcf_topics?guid=eq.${encodeURIComponent(guid)}&project_id=eq.${encodeURIComponent(pid)}&select=data`);
  return rows?.[0]?.data ?? null;
}

/** A title a caller sends (topic POST and PUT, the agent's raise_issue) is text of at most 600 characters, else a 400 —
 *  stored titles are parsed by the raise dedups on every propose and in every member's browser (H0, WR-4 review). Absent
 *  or null passes (newTopicObject's "Untitled"). Titles Sentinel builds itself (raises, a review's rejection) aren't checked. */
export function checkTopicTitle(title) {
  if (title != null && !(typeof title === "string" && title.length <= 600))
    throw Object.assign(new Error("a topic title is text of at most 600 characters — nothing was saved"), { status: 400 });
}

/** Insert a freshly-built topic. */
/** The canonical BCF topic shape. Every producer must go through this — the web Issues panel, the
 *  Revit BcfSyncManager and the governed fail→BCF hook all expect these exact fields, and `guid` is
 *  NOT NULL in the database. A caller that hand-rolls a partial object gets a 23502 at insert time.
 *  Lives here, beside bcfCreateTopic, so the AI tool registry and the HTTP routes share one definition. */
export function newTopicObject(pid, b = {}, now = new Date().toISOString()) {
  // Server-assigned authorship, as the BCF-API spec intends: a signed-in caller's verified identity
  // outranks the claimed creation_author; machine callers (BCF_TOKEN — the Revit pilot, Governed
  // Publish) keep their self-label.
  const author = resolveActor(b.creation_author, "web");
  return {
    guid: guidOrNew(b.guid), project_id: pid, model: b.model || "",
    title: b.title || "Untitled", topic_type: b.topic_type || "Issue",
    topic_status: b.topic_status || "Open", priority: b.priority || "Normal",
    assigned_to: b.assigned_to || "", due_date: b.due_date || null,
    stage: b.stage || "", description: b.description || "",
    creation_author: author, creation_date: now, modified_date: now,
    labels: b.labels || [], comments: [], viewpoints: [],
    history: [{ date: now, author, action: "Created" }],
  };
}

export async function bcfCreateTopic(topic) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(topic.project_id, "contributor"); // 0038: bcf_topics has no signed-in writer — every topic write is checked here
  await sb(`bcf_topics`, { method: "POST", body: bcfRow(topic), prefer: "return=minimal", service: true });
  return topic;
}

/** Persist a mutated topic (update / comment / viewpoint all read-modify-write the whole document). A save the database
 *  changed nothing with is a 403 — the IDS supersede writers put a ledger row after these saves (H0 D5). */
export async function bcfSaveTopic(topic) {
  // requireRows only needs to know a row came back — &select=guid (H0 minor N27) keeps PostgREST from also
  // returning the full jsonb `data` column (comments, viewpoints, snapshots) on every save.
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(topic.project_id, "contributor"); // 0038: bcf_topics has no signed-in writer — every topic write is checked here
  requireRows(await sb(`bcf_topics?guid=eq.${encodeURIComponent(topic.guid)}&project_id=eq.${encodeURIComponent(topic.project_id)}&select=guid`, {
    method: "PATCH",
    body: { data: topic, topic_status: topic.topic_status, model: topic.model || "", modified_at: new Date().toISOString() },
    prefer: "return=representation",
    service: true,
  }), "a topic is changed by a contributor or above");
  return topic;
}

export async function listTransmittals(key) {
  const proj = await ensureProject(key);
  return sb(`transmittals?project_id=eq.${proj.id}&select=*&order=issued_at.desc`);
}

/** Issue a transmittal (transmittals_write: a lead's). The sender is the signed-in caller's verified identity (the machine
 *  credential keeps its label); every listed version must be on this project — another project's, an unknown or a
 *  malformed id is versionOnKey's 400 before any write; the issue is one "issued" ledger row (cde-14). */
export async function createTransmittal(key, b = {}) {
  if (b.version_ids !== undefined && !Array.isArray(b.version_ids)) throw Object.assign(new Error("version_ids must be a list of version ids on this project"), { status: 400 });
  // De-dup on the CALLER's strings first so [v, V] isn't read twice, then store versionOnKey's own canonical id
  // (H0 minor N28): Postgres uuid equality ignores case, so an uppercase id was stored and audited as given —
  // check-registry's classifyDistribution matches version_ids by exact string, so that read as a false un-issued gap.
  // ponytail: one read per listed version; one in.() read if transmittals start listing hundreds of versions.
  const seen = [];
  for (const id of new Set(b.version_ids || [])) seen.push((await versionOnKey(key, id)).version.id);
  const ids = [...new Set(seen)];
  const proj = await ensureProject(key);
  const [row] = requireRows(await sb(`transmittals`, {
    method: "POST",
    body: { project_id: proj.id, reference: b.reference, sender: resolveActor(b.sender), recipients: b.recipients || [], purpose: b.purpose, suitability: b.suitability, version_ids: ids, note: b.note },
    prefer: "return=representation",
  }), "a transmittal is issued by a lead or owner");
  await audit(proj.id, "transmittal", row.id, "issued", b.sender || "web", null,
    { reference: row.reference ?? null, purpose: row.purpose ?? null, suitability: row.suitability ?? null, recipients: row.recipients ?? [], version_ids: ids });
  return row;
}
