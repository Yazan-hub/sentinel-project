// Issue sign-offs on the ledger (the audit gap of 2026-10-21): a change to a BCF topic's status, assignee or priority — from the
// web, Revit's Issues window, a BCF-API 3.0 client or a BCF file — is one audit_log row (entity_type bcf_topic) the bridge writes
// BEFORE it saves the topic, so the per-project chain and its daily RFC 3161 timestamp cover who signed the issue off. The row's
// id is stamped on the history lines it records (ledger_id → "recorded in the ledger #N" in the web and Revit history panels).
// Nothing earlier is backfilled: a project's first such row is a coverage marker that says so.
import { currentActor } from "./bridge-auth.mjs";

const FIELDS = ["topic_status", "assigned_to", "priority"];
const CLOSED = /^(closed|resolved)$/i; // bcf-service isClosed's rule, trimmed as it trims
export const COVERAGE = "issue_ledger_coverage_started";
export const COVERAGE_NOTE = "From this row on, every change to an issue's status, assignee or priority on this project is one bcf_topic row in this ledger. "
  + "Changes made before it are in each issue's own history only — they were not backfilled.";
export const COMMENT_MAX = 5000;

/** The ledger entry for a topic going from `before` (null: raised now) to `after`: { action, old_value, new_value }, or null when
 *  neither status, assignee nor priority changed. old_value/new_value name only the fields that changed ("" is null). Pure. */
export function topicLedgerEntry(before, after, { comment = null, via = null } = {}) {
  const v = (t, k) => t?.[k] ?? "";
  const changed = before ? FIELDS.filter((k) => v(before, k) !== v(after, k)) : FIELDS;
  if (!changed.length) return null;
  const was = String(v(before, "topic_status")).trim(), now = String(v(after, "topic_status")).trim();
  const action = !before ? "issue_opened"
    : changed.includes("topic_status")
      ? (/^closed$/i.test(now) ? "issue_closed" : /^resolved$/i.test(now) ? "issue_resolved" : CLOSED.test(was) ? "issue_reopened" : "issue_status_changed")
    : changed.includes("assigned_to") ? (String(v(after, "assigned_to")).trim() ? "issue_assigned" : "issue_unassigned")
    : "issue_priority_changed";
  const only = (t) => Object.fromEntries(changed.map((k) => [k, v(t, k) === "" ? null : t[k]]));
  return {
    action,
    old_value: before ? only(before) : null,
    new_value: { guid: after.guid, title: after.title ?? null, ...only(after), comment: comment || null, via: via || null },
  };
}

const coverage = new Map(); // project id → the promise that its coverage row exists (looked for once per project per run)
function ensureCoverage(cde, projectId, actor) {
  if (!coverage.has(projectId)) coverage.set(projectId, (async () => {
    // Read with the service key: a caller whose row-level security hides the ledger must not make every restart write the marker again.
    const had = await cde.sb(`audit_log?project_id=eq.${projectId}&entity_type=eq.bcf_topic&action=eq.${COVERAGE}&select=id&limit=1`, { service: true });
    if (!had?.length) await cde.audit(projectId, "bcf_topic", null, COVERAGE, actor, null, { note: COVERAGE_NOTE });
  })().catch((e) => { coverage.delete(projectId); throw e; }));
  return coverage.get(projectId);
}

/** Write the ledger row for `topic`'s change from `before`, stamp its id on `lines` (the history lines it records), then `save()`.
 *  No ledger row came back → nothing is saved (a 502); a save that fails after the row was written is a second row saying so
 *  (the ledger is append-only, the first row is never altered). A signed-in caller's rows are budgeted as the ledger's other
 *  writes are (cde-6). With no CDE there is no ledger: `save()` alone. Returns the row id, or null when nothing tracked changed. */
export async function saveWithLedger(cde, { before, topic, lines = [], actor, comment = null, via = null, save }) {
  const entry = cde.cdeConfigured() ? topicLedgerEntry(before, topic, { comment, via }) : null;
  if (!entry) { await save(); return null; }
  cde.takeWriteBudget("issue changes", { perUser: 300, all: 1000 });
  const proj = await cde.ensureProject(topic.project_id);
  await ensureCoverage(cde, proj.id, actor);
  const eid = cde.isUuid(topic.guid) ? topic.guid : null; // audit_log.entity_id is a uuid; a pre-0039 local guid rides in new_value
  const row = await cde.audit(proj.id, "bcf_topic", eid, entry.action, actor, entry.old_value, { ...entry.new_value, actor_verified: !!currentActor() });
  if (!row?.id) throw Object.assign(new Error("the ledger gave no row back — nothing was changed"), { status: 502 });
  for (const l of lines) l.ledger_id = row.id;
  try { await save(); }
  catch (e) {
    try { await cde.audit(proj.id, "bcf_topic", eid, "issue_change_not_saved", actor, null, { voids: row.id, guid: topic.guid, reason: String(e?.message || e).slice(0, 300) }); }
    catch (e2) { console.warn(`[bcf] ledger #${row.id} records a change to ${topic.guid} that was not saved, and the row saying so failed: ${e2?.message || e2}`); }
    throw e;
  }
  return row.id;
}
