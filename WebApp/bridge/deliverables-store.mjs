// MIDP/TIDP deliverables — CRUD over the planned rows, plus the derived read model.
// Thin PostgREST wrapper in the idiom of cde-store.mjs / bimdocs-store.mjs. Writes are audited;
// deliverableStatus writes NOTHING (it is a read model, not an event).
import { sb, ensureProject, audit, listFiles } from "./cde-store.mjs";
import { deriveStatus } from "./deliverables-logic.mjs";

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
  return { container_name: name, title: str(body.title), responsible_team: str(body.responsible_team), due_date: due, stage, notes: str(body.notes) };
}

export async function listDeliverables(key) {
  const proj = await ensureProject(key);
  return (await sb(`deliverables?project_id=eq.${proj.id}&select=*&order=due_date.asc.nullslast,container_name.asc`)) || [];
}

export async function createDeliverable(key, body, actor) {
  const row = validateRow(body);
  const proj = await ensureProject(key);
  const created = one(await sb("deliverables", { method: "POST", body: { ...row, project_id: proj.id }, prefer: "return=representation" }));
  await audit(proj.id, "deliverable", created.id, "created", actor || "web", null, { container_name: created.container_name, due_date: created.due_date });
  return created;
}

export async function updateDeliverable(key, id, patch, actor) {
  const row = validateRow(patch);
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  const updated = one(await sb(`deliverables?id=eq.${enc(id)}`, { method: "PATCH", body: { ...row, updated_at: new Date().toISOString() }, prefer: "return=representation" }));
  await audit(proj.id, "deliverable", id, "updated", actor || "web",
    { container_name: before.container_name, due_date: before.due_date },
    { container_name: updated.container_name, due_date: updated.due_date });
  return updated;
}

export async function deleteDeliverable(key, id, actor) {
  const proj = await ensureProject(key);
  const before = one(await sb(`deliverables?id=eq.${enc(id)}&project_id=eq.${proj.id}&select=*`));
  if (!before) throw err(404, "deliverable not found");
  await audit(proj.id, "deliverable", id, "deleted", actor || "web", { container_name: before.container_name, due_date: before.due_date }, null);
  await sb(`deliverables?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=minimal" });
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
  return { generated_at: new Date().toISOString(), today, ...deriveStatus(rows, files, today) };
}
