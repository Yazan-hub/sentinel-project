// Task teams — the responsibility matrix. CRUD over the declared teams, in the idiom of
// deliverables-store.mjs: a pure validator that runs before any network call, audited writes, and
// no derived state stored anywhere.
//
// The link to a deliverable is its CODE, matched case-insensitively (see 0026). Nothing here
// rewrites deliverables.responsible_team — an undeclared team is a finding for
// roles.responsibility, not a silent repair.
import { sb, ensureProject, audit, isUuid, requireRows } from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";

const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;

// Kept deliberately permissive: appointment chains differ by jurisdiction and contract. The value is
// recorded as stated rather than forced into a vocabulary Sentinel would then have to defend.
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise and validate one task-team row. Pure. */
export function validateTeam(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "a task team must be an object");
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) throw err(400, "code is required — it is how a deliverable is matched to its task team");
  if (!CODE_RE.test(code))
    throw err(400, `code "${code}" must be 1-16 characters of letters, digits, dot, dash or underscore`);

  let lead = null;
  if (body.lead_email !== undefined && body.lead_email !== null && String(body.lead_email).trim() !== "") {
    lead = String(body.lead_email).trim();
    // A malformed address is worse than none: roles.responsibility would count it as a named
    // accountable human when no one could ever be reached at it.
    if (!EMAIL_RE.test(lead)) throw err(400, `lead_email "${lead}" must be an email address`);
  }

  if (body.outside_sentinel != null && typeof body.outside_sentinel !== "boolean") throw err(400, "outside_sentinel is true or false");
  if (body.owns_no_container != null && typeof body.owns_no_container !== "boolean") throw err(400, "owns_no_container is true or false");
  const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  return {
    code,
    name: str(body.name),
    lead_email: lead,
    discipline: str(body.discipline),
    appointment: str(body.appointment),
    notes: str(body.notes),
    // 0057: the team is not in Sentinel, so a lead records what it decided on a plan sent for review. Kept only when the caller, or the stored row, carries it.
    ...(body.outside_sentinel != null && { outside_sentinel: body.outside_sentinel }),
    // 0058: the team works inside another team's model, so it owns no container. Same rule: only when the caller, or the stored row, carries it.
    ...(body.owns_no_container != null && { owns_no_container: body.owns_no_container }),
  };
}

// Before 0058 is applied the column is not there: a write that carries the flag is refused in plain words and nothing is saved (reads use select=*, so they never name it).
const noColumn = (e) => (/owns_no_container/.test(String(e?.message || "")) ? err(409, "This needs a database update that has not been applied yet, so the tick could not be saved.") : e);

export async function listTeams(key) {
  const proj = await ensureProject(key);
  return (await sb(`task_teams?project_id=eq.${enc(proj.id)}&select=*&order=code.asc`)) || [];
}

export async function createTeam(key, body, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's (0026 agrees)
  const row = validateTeam(body);
  const proj = await ensureProject(key);
  let created;
  try {
    created = one(await sb("task_teams", { method: "POST", body: { ...row, project_id: proj.id }, prefer: "return=representation" }));
  } catch (e0) {
    const e = noColumn(e0);
    if (e !== e0) throw e;
    // 23505 = the case-insensitive unique index. A duplicate code is a user mistake, not a 500.
    if (String(e?.message || "").includes("uq_task_teams_project_code") || String(e?.message || "").includes("23505"))
      throw err(409, `task team "${row.code}" is already declared on this project`);
    throw e;
  }
  await audit(proj.id, "task_team", created.id, "created", actor || "web", null, { code: created.code, lead_email: created.lead_email, ...(created.outside_sentinel && { outside_sentinel: true }), ...(created.owns_no_container && { owns_no_container: true }) });
  return created;
}

export async function updateTeam(key, id, patch, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's (0026 agrees)
  if (!isUuid(id)) throw err(404, "task team not found");
  const proj = await ensureProject(key);
  const before = one(await sb(`task_teams?id=eq.${enc(id)}&project_id=eq.${enc(proj.id)}&select=*`));
  if (!before) throw err(404, "task team not found");
  // Partial update: validate the MERGED row so an omitted field is kept, never wiped (the phase-4
  // PATCH full-row-replace bug, which cost a live `notes` field).
  const merged = validateTeam({ ...before, ...patch });
  // task_teams writes are a lead's (0026): a refused PATCH comes back as no row — a 403, never an "updated" row (ledger-1).
  const updated = one(requireRows(await sb(`task_teams?id=eq.${enc(id)}`, {
    method: "PATCH", body: { ...merged, updated_at: new Date().toISOString() }, prefer: "return=representation",
  }).catch((e) => { throw noColumn(e); }), "a task team is changed by a lead or owner"));
  const marked = !!before.outside_sentinel !== !!merged.outside_sentinel; // 0057: a change of the mark goes on the ledger, both ways
  const owns = !!before.owns_no_container !== !!merged.owns_no_container; // 0058: so does a change of "owns no container"
  await audit(proj.id, "task_team", id, "updated", actor || "web",
    { code: before.code, lead_email: before.lead_email, ...(marked && { outside_sentinel: !!before.outside_sentinel }), ...(owns && { owns_no_container: !!before.owns_no_container }) },
    { code: merged.code, lead_email: merged.lead_email, ...(marked && { outside_sentinel: !!merged.outside_sentinel }), ...(owns && { owns_no_container: !!merged.owns_no_container }) });
  return updated;
}

export async function deleteTeam(key, id, actor) {
  await requireMinRole(key, "lead"); // H0 (D4, ledger-1): declaring, editing and deleting a task team is a lead's (0026 agrees)
  if (!isUuid(id)) throw err(404, "task team not found");
  const proj = await ensureProject(key);
  const before = one(await sb(`task_teams?id=eq.${enc(id)}&project_id=eq.${enc(proj.id)}&select=*`));
  if (!before) throw err(404, "task team not found");
  requireRows(await sb(`task_teams?id=eq.${enc(id)}`, { method: "DELETE", prefer: "return=representation" }), "a task team is deleted by a lead or owner");
  // Deliverables keep their responsible_team text. The team is now undeclared, which is precisely
  // what roles.responsibility will report — deleting a team must never silently orphan a plan.
  await audit(proj.id, "task_team", id, "deleted", actor || "web", { code: before.code }, null);
  return { deleted: true, code: before.code };
}
