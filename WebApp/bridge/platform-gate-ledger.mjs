// Roadmap item 3, part A (spec 2026-09-29-platform-native-design.md): each finished run of That Open's delivery-gate
// component becomes ONE ledger row, entity_type platform_gate. The source is the platform's own run record
// (listExecutions, then getExecution for its messages) — not the report file or the labels, which any project writer
// can write — read with the bridge's platform token. This module only READS the platform: it cannot start, stop or
// change a gate run. Exactly one row per run is the database's job (migration 0036, a partial unique index on the
// execution id): a duplicate insert is 23505, counted here as "already recorded".
//
// Usage (beside the bridge, the way watch-outbox.mjs runs, so the bridge need not restart):
//   node bridge/platform-gate-ledger.mjs --once    one tick, prints {written, skipped, reason?}
//   node bridge/platform-gate-ledger.mjs --watch   a tick every 60 s, never overlapping, one line per change of reason
// Inside the bridge: bcf-service.mjs starts watchPlatformGate when THATOPEN_GATE_COMPONENT_ID is set.
//
// Config: THATOPEN_API_KEY + THATOPEN_PROJECT_ID (thatopen-client.mjs getConfig — the token is never printed),
// SUPABASE_URL + SUPABASE_SERVICE_KEY (cde-store.mjs), THATOPEN_GATE_COMPONENT_ID (the CLI defaults to the published
// gate component).
import { pathToFileURL } from "node:url";
import { loadEnv } from "./load-env.mjs";

export const DEFAULT_COMPONENT_ID = "6ab97f7213cf4cfc31e03c60";
export const ENTITY_TYPE = "platform_gate";
export const ACTOR = "platform gate";
const MESSAGE_CAP = 2000;
const CHUNK = 100;

const RESULTS = [
  ["Passed —", "pass"], ["Refused —", "fail"], ["Not checked —", "not_checked"],
  ["Gate did not run —", "did_not_run"], ["Skipped —", "skipped"],
];
const LABEL = { pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED", did_not_run: "DID NOT RUN", skipped: "SKIPPED" };

/** The verdict from the component's first words; anything else (a platform timeout, an empty message) did not run —
 *  never a pass. "Passed — … — report written; the version labels were refused: …" is still a pass. */
export function resultOf(message) {
  const m = String(message ?? "").trimStart();
  return RESULTS.find(([head]) => m.startsWith(head))?.[1] ?? "did_not_run";
}

/** The ledger is append-only (0015): a credential that reaches it can never be taken back. The 1.0.0 run's message
 *  carried its token in a URL (…?accessToken=…), so every string a row or a log line takes from the platform goes
 *  through here: token query values, "Bearer x", and bare JWTs. */
export function scrub(text) {
  return String(text ?? "")
    .replace(/\b(access_?token|token|api_?key)=[^&\s"'#]+/gi, "$1=[scrubbed]")
    .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [scrubbed]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*){0,2}/g, "[scrubbed]");
}

// A message's text: {content: "…"}, where content may itself be JSON ("\"Reading …\"" or {"message": "…"}).
function textOf(msg) {
  let c = msg && typeof msg === "object" ? msg.content : msg;
  if (typeof c === "string" && /^\s*["{]/.test(c)) { try { c = JSON.parse(c); } catch { /* plain text */ } }
  if (c && typeof c === "object") c = c.message ?? c.content ?? c.text;
  return typeof c === "string" ? c : "";
}

/** {name, version_tag} from the component's "Reading <name> <tag>…" line (main.js), or null when the run never got
 *  that far (a Skipped run, a run that failed before reading). */
export function readingOf(messages) {
  for (const msg of Array.isArray(messages) ? messages : []) {
    const line = scrub(textOf(msg)).trim();
    // The gated names end in .ifc (both automations filter Extension = ifc) and a tag is free text ("Rev A"): split at
    // ".ifc " first, at the last space only for a name without it.
    const m = /^Reading (.+?\.ifc) (.+?)(?:…|\.\.\.)\s*$/i.exec(line) ?? /^Reading (.+) (\S+?)(?:…|\.\.\.)\s*$/.exec(line);
    if (m) return { name: m[1], version_tag: m[2] };
  }
  return null;
}

const str = (v) => (v == null || v === "" ? null : String(v));

/** The ledger row for one run. NAMED fields only, never the record: some records carry a creatingToken. */
export function rowOf(exec, detail, platformProjectId) {
  const id = str(exec?._id);
  if (!id) throw new Error("a platform gate row needs the run's execution id — refused");
  const pick = (k) => exec?.[k] ?? detail?.[k];
  const message = scrub(pick("resultMessage") ?? "").slice(0, MESSAGE_CAP);
  const result = resultOf(message);
  const file = readingOf(detail?.messages ?? exec?.messages);
  return {
    entity_type: ENTITY_TYPE,
    action: `platform gate ${LABEL[result]}: ${file ? `${file.name} ${file.version_tag}` : `run ${id}`}`,
    new_value: {
      execution_id: id,
      platform_project_id: str(platformProjectId),
      component: { id: str(pick("toolId")), version: str(pick("toolVersion")) },
      result,
      platform_result: str(pick("result")),
      message,
      file,
      ran_at: str(pick("createdAt")),
      finished_at: str(pick("completedAt")),
    },
  };
}

const why = (e) => scrub(String(e?.message || e)).slice(0, 300);
const SEEN = new Set(); // execution ids this process knows are on the ledger
const createdAt = (r) => Date.parse(r.createdAt) || 0;

/**
 * One tick. deps: {listExecutions, getExecution, findLinkedProjects(platformProjectId) → [{id, key, archived}],
 * existingExecutionIds(projectId, ids) → Set, audit(projectId, entity_type, entity_id, action, actor, old, new)}.
 * Finished runs only (a `result` set — a run in progress waits); exactly one non-archived linked Sentinel project
 * (none or two: nothing is written and the reason says why); runs already recorded are dropped (this process's seen
 * set, then one ledger read per 100 ids); the rest are written oldest first. A 23505 counts as recorded; any other
 * throw ends the tick and is its reason — the next tick retries, and the index makes the retry safe.
 * → {written, skipped (finished runs already on the ledger), reason?}
 */
const DETAIL_TRIES = 3;
const DETAIL_FAILS = new Map(); // run id → ticks whose detail read failed (process memory; a restart starts again)

export async function syncPlatformGate(deps, { componentId, platformProjectId, seen = SEEN }) {
  let written = 0, skipped = 0;
  let runs;
  try { runs = await deps.listExecutions(componentId, platformProjectId); }
  catch (e) { return { written, skipped, reason: `the platform's gate runs were not read — ${why(e)}` }; }
  if (!Array.isArray(runs)) return { written, skipped, reason: "the platform's gate runs were not read — the answer was not a list" };
  const finished = runs.filter((r) => str(r?._id) && r.result);
  const fresh = finished.filter((r) => !seen.has(String(r._id)));
  skipped = finished.length - fresh.length;
  if (!fresh.length) return { written, skipped };

  let links;
  try { links = ((await deps.findLinkedProjects(platformProjectId)) ?? []).filter((p) => !p.archived); }
  catch (e) { return { written, skipped, reason: `the linked Sentinel project was not read — ${why(e)}` }; }
  if (!links.length) return { written, skipped, reason: `no Sentinel project links platform project ${platformProjectId} — link one in Settings ▸ General; nothing was written` };
  if (links.length > 1) return { written, skipped, reason: `platform project ${platformProjectId} is linked by ${links.map((p) => p.key).join(" and ")} — unlink all but one in Settings ▸ General; nothing was written` };
  const proj = links[0];

  const ids = fresh.map((r) => String(r._id));
  try {
    for (let i = 0; i < ids.length; i += CHUNK)
      for (const id of await deps.existingExecutionIds(proj.id, ids.slice(i, i + CHUNK))) seen.add(String(id));
  } catch (e) { return { written, skipped, reason: `the ledger was not read — ${why(e)}` }; }
  const todo = fresh.filter((r) => !seen.has(String(r._id)))
    .sort((a, b) => createdAt(a) - createdAt(b) || String(a._id).localeCompare(String(b._id)));
  skipped += fresh.length - todo.length;

  let detailGap = null;
  for (const run of todo) {
    const id = String(run._id);
    // The run's detail (its messages) names the file. A detail that cannot be read skips this run for this tick and
    // never stalls the later ones; after DETAIL_TRIES ticks the row is written from the list record, file unknown.
    let detail;
    try { detail = await deps.getExecution(id); DETAIL_FAILS.delete(id); }
    catch (e) {
      const n = (DETAIL_FAILS.get(id) ?? 0) + 1;
      DETAIL_FAILS.set(id, n);
      if (n < DETAIL_TRIES) { detailGap ??= `run ${id}'s detail was not read (try ${n} of ${DETAIL_TRIES}) — ${why(e)}`; continue; }
      detail = null; DETAIL_FAILS.delete(id);
    }
    try {
      const row = rowOf(run, detail, platformProjectId);
      await deps.audit(proj.id, row.entity_type, null, row.action, ACTOR, null, row.new_value);
      written++;
    } catch (e) {
      if (e?.body?.code !== "23505") return { written, skipped, reason: `run ${id} was not recorded — ${why(e)}` };
      skipped++; // another bridge wrote it first
    }
    seen.add(id);
  }
  return detailGap ? { written, skipped, reason: detailGap } : { written, skipped };
}

/** The real deps: the bridge's platform client (THATOPEN_API_KEY, read by getConfig — never printed) and the CDE store
 *  with the service key. Throws when either is not configured. */
export async function wire() {
  const cde = await import("./cde-store.mjs");
  if (!cde.cdeConfigured()) throw new Error("CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  const { getConfig, createClient } = await import("./thatopen-client.mjs");
  const cfg = getConfig();
  const client = createClient(cfg);
  return {
    platformProjectId: cfg.projectId,
    deps: {
      listExecutions: (componentId, projectId) => client.listExecutions(componentId, projectId),
      getExecution: (id) => client.getExecution(id),
      findLinkedProjects: async (pid) =>
        ((await cde.sb(`projects?metadata->settings->>platform_project_id=eq.${encodeURIComponent(pid)}&select=id,key,archived:metadata->settings->archived`, { service: true })) ?? [])
          .map((p) => ({ id: p.id, key: p.key, archived: !!p.archived })),
      // Global, not per project: the unique index (0036) is global, so a run recorded on any project is recorded.
      existingExecutionIds: async (_projectId, ids) => {
        const list = ids.map((id) => encodeURIComponent(`"${id}"`)).join(",");
        const rows = await cde.sb(`audit_log?entity_type=eq.${ENTITY_TYPE}&new_value->>execution_id=in.(${list})&select=x:new_value->>execution_id`, { service: true });
        return new Set((rows ?? []).map((r) => r.x));
      },
      audit: cde.audit,
    },
  };
}

/** A tick every `everyMs`, never overlapping (the next is scheduled when one ends); one log line per change of reason,
 *  one per tick that wrote. Off (false) without a component id or when wire() throws. */
export async function watchPlatformGate({ componentId, everyMs = 60_000, log = console.log, connect = wire } = {}) {
  if (!componentId) return false;
  let w;
  try { w = await connect(); }
  catch (e) { log(`[platform-gate] off — ${why(e)}`); return false; }
  log(`[platform-gate] on — component ${componentId}, platform project ${w.platformProjectId}, every ${everyMs / 1000} s`);
  let last = "up to date";
  const tick = async () => {
    let r;
    try { r = await syncPlatformGate(w.deps, { componentId, platformProjectId: w.platformProjectId }); }
    catch (e) { r = { written: 0, skipped: 0, reason: why(e) }; }
    if (r.written) log(`[platform-gate] ${r.written} run(s) recorded on the ledger`);
    const now = r.reason ?? "up to date";
    if (now !== last) { last = now; log(`[platform-gate] ${now}`); }
    setTimeout(tick, everyMs);
  };
  void tick();
  return true;
}

// The CLI runs only when this file is the entry point — importing it from a test or the bridge is inert.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = { ...process.env, ...loadEnv() };
  const componentId = (env.THATOPEN_GATE_COMPONENT_ID || "").trim() || DEFAULT_COMPONENT_ID;
  if (process.argv.includes("--watch")) {
    if (!(await watchPlatformGate({ componentId }))) process.exit(1);
  } else if (process.argv.includes("--once")) {
    let r;
    try {
      const w = await wire();
      r = await syncPlatformGate(w.deps, { componentId, platformProjectId: w.platformProjectId });
    } catch (e) { r = { written: 0, skipped: 0, reason: `not started — ${why(e)}` }; }
    console.log(JSON.stringify(r));
    process.exit(r.reason ? 1 : 0);
  } else {
    console.error("usage: node bridge/platform-gate-ledger.mjs --once | --watch");
    process.exit(2);
  }
}
