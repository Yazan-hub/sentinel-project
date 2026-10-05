// MIDP/TIDP deliverables — CRUD over the planned rows, plus the derived read model.
// Thin PostgREST wrapper in the idiom of cde-store.mjs / bimdocs-store.mjs. Writes are audited;
// deliverableStatus writes NOTHING (it is a read model, not an event).
import { sb, ensureProject, audit, listFiles, isUuid, requireRows } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
import { deriveStatus, rollUpTidp, rebaselineImpact, weeklyReport, unplannedContainers } from "./deliverables-logic.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;

const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalise and validate one planned row. Pure — runs before any network call. */
export function validateRow(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a deliverable must be an object");
  const name = typeof body.container_name === "string" ? body.container_name.trim() : "";
  if (!name) throw err(400, "container_name is required — it is how a deliverable is matched to what arrives");

  let due = null;
  if (body.due_date !== undefined && body.due_date !== null && String(body.due_date).trim() !== "") {
    const d = String(body.due_date).trim();
    if (!DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))
      throw err(400, `due_date "${d}" must be a real date in YYYY-MM-DD format`);
    due = d;
  }

  let stage = null;
  if (body.stage !== undefined && body.stage !== null && String(body.stage).trim() !== "") {
    stage = String(body.stage).trim();
    if (!STAGES.includes(stage)) throw err(400, `stage "${stage}" must be one of: ${STAGES.join(", ")}`);
  }

  const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  return {
    container_name: name, title: str(body.title), responsible_team: str(body.responsible_team),
    due_date: due, stage, notes: str(body.notes),
    // Free-text by design: revision/suitability coding is convention-specific (BS 8644, project BEP…).
    expected_revision: str(body.expected_revision), expected_suitability: str(body.expected_suitability),
    // WHICH DECISION this information supports. Free text; its absence is reported by
    // midp.plan_completeness, never silently tolerated.
    purpose: str(body.purpose),
  };
}

export async function listDeliverables(key) {
  const proj = await ensureProject(key);
  return (await sb(`deliverables?project_id=eq.${proj.id}&select=*&order=due_date.asc.nullslast,container_name.asc`)) || [];
}

export async function createDeliverable(key, body, actor) {
  const row = validateRow(body);
  const proj = await ensureProject(key);
  const created = one(await sb("deliverables", { method: "POST", body: { ...row, project_id: proj.id }, prefer: "return=representation" }));
  await audit(proj.id, "deliverable", created.id, "created", actor || "web", null, { container_name: created.container_name, due_date: created.due_date, expected_revision: created.expected_revision, expected_suitability: created.expected_suitability, purpose: created.purpose });
  return created;
}

export async function updateDeliverable(key, id, patch, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): a planned deliverable is edited, deleted and rebaselined by a lead
  if (!isUuid(id)) throw err(404, "deliverable not found"); // non-UUID = uuid-cast 500 from PostgREST, and can never match
  // Partial-update semantics: validateRow normalises ALL fields (nulls for absent ones), so
  // spreading its full result would silently wipe any field the caller didn't send — the UI's edit
  // form has no notes input, so every edit would null notes. Only write keys the caller supplied.
  const validated = validateRow(patch);
  const row = Object.fromEntries(Object.entries(validated).filter(([k]) => k in patch));
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  // project_id in the WRITE filter too, not just the preceding ownership SELECT: sb() runs under the
  // service role for non-JWT callers, which bypasses RLS, so the tenant scope must be in the query.
  // deliverables_update is a lead's (0038): a refused PATCH comes back as no row — a 403 in words (it was a 500
  // reading the missing row), never an "updated" row.
  const updated = one(requireRows(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() }, prefer: "return=representation" }), "a deliverable is changed by a lead or above"));
  // Audit every planned field, not just name+date: a changed owner or stage is exactly the kind of
  // silent plan edit an audit trail exists to reconstruct.
  const fields = (r) => ({ container_name: r.container_name, title: r.title, responsible_team: r.responsible_team, due_date: r.due_date, stage: r.stage, expected_revision: r.expected_revision, expected_suitability: r.expected_suitability, purpose: r.purpose });
  await audit(proj.id, "deliverable", id, "updated", actor || "web", fields(before), fields(updated));
  return updated;
}

export async function deleteDeliverable(key, id, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): a planned deliverable is edited, deleted and rebaselined by a lead
  if (!isUuid(id)) throw err(404, "deliverable not found");
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  // deliverables_delete is a lead's: a refused delete comes back as no row. The "deleted" row follows a delete that
  // happened — it used to be written first, whatever the delete did (ledger-1); audit_log has no FK, so it outlives the row.
  requireRows(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}`, { method: "DELETE", prefer: "return=representation" }), "a deliverable is deleted by a lead or owner");
  await audit(proj.id, "deliverable", id, "deleted", actor || "web", { container_name: before.container_name, due_date: before.due_date }, null);
  return { deleted: true, id };
}

/** Bulk insert. ALL-OR-NOTHING: one bad row rejects the whole import, so a half-imported schedule
 *  can never be mistaken for a complete one. */
export async function importDeliverables(key, rows, actor) {
  if (!Array.isArray(rows) || !rows.length) throw err(400, "import needs a non-empty array of rows");
  const clean = rows.map((r, i) => {
    try { return validateRow(r); }
    catch (e) { throw err(400, `row ${i + 1}: ${e.message}`); }
  });
  const proj = await ensureProject(key);
  const inserted = await sb("deliverables", { method: "POST", body: clean.map((r) => ({ ...r, project_id: proj.id })), prefer: "return=representation" });
  await audit(proj.id, "deliverable", proj.id, "imported", actor || "web", null, { count: clean.length });
  return { inserted: inserted?.length ?? 0, rows: inserted || [] };
}

/** The read model: planned rows + what actually arrived → per-row status. Writes NOTHING. */
export async function deliverableStatus(key) {
  const [rows, files] = await Promise.all([listDeliverables(key), listFiles(key)]);
  const today = new Date().toISOString().slice(0, 10);
  return { generated_at: new Date().toISOString(), today, ...deriveStatus(rows, files, today), unplanned: unplannedContainers(rows, files) };
}

/**
 * The TIDP view of the same derived rows — grouped by task team, rolled into the MIDP.
 * READ-ONLY, like deliverableStatus: one derivation, two lenses, nothing stored either way.
 */
export async function tidpReport(key) {
  const tt = await import("./task-teams-store.mjs");
  const [status, teams] = await Promise.all([deliverableStatus(key), tt.listTeams(key)]);
  return { generated_at: status.generated_at, today: status.today, ...rollUpTidp(status, teams) };
}

/** What re-importing the programme would do. READ-ONLY — nothing is written, nothing is audited. */
export async function rebaselinePreview(key, programme) {
  if (!Array.isArray(programme)) throw err(400, "programme must be an array of { container_name, due_date } rows");
  const [rows, files] = await Promise.all([listDeliverables(key), listFiles(key)]);
  const today = new Date().toISOString().slice(0, 10);
  return { generated_at: new Date().toISOString(), today, ...rebaselineImpact(rows, files, today, programme) };
}

/**
 * Apply the moved dates. Each change is audited as `rebaselined` rather than `updated`: the ledger
 * should say the PROGRAMME moved this, not that somebody edited a row — that distinction is the
 * whole point of re-importing rather than hand-editing.
 */
export async function rebaselineApply(key, programme, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): a planned deliverable is edited, deleted and rebaselined by a lead
  const preview = await rebaselinePreview(key, programme);
  const proj = await ensureProject(key);
  for (const u of preview.updates) {
    requireRows(await sb(`deliverables?id=eq.${enc(u.id)}`, {
      method: "PATCH", body: { due_date: u.to, updated_at: new Date().toISOString() }, prefer: "return=representation",
    }), "a deliverable's due date is moved by a lead or above");
    await audit(proj.id, "deliverable", u.id, "rebaselined", actor || "web",
      { due_date: u.from }, { due_date: u.to, delta_days: u.delta_days, container_name: u.container_name });
  }
  return { applied: preview.updates.length, ...preview };
}

/** The weekly information-delivery status report, as markdown. READ-ONLY. */
export async function weeklyReportMarkdown(key) {
  const [status, tidp] = await Promise.all([deliverableStatus(key), tidpReport(key)]);
  return { generated_at: status.generated_at, today: status.today, markdown: weeklyReport(status, tidp, key) };
}
