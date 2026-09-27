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

  const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
  return {
    code,
    name: str(body.name),
    lead_email: lead,
    discipline: str(body.discipline),
    appointment: str(body.appointment),
    notes: str(body.notes),
  };
}

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
  } catch (e) {
    // 23505 = the case-insensitive unique index. A duplicate code is a user mistake, not a 500.
    if (String(e?.message || "").includes("uq_task_teams_project_code") || String(e?.message || "").includes("23505"))
      throw err(409, `task team "${row.code}" is already declared on this project`);
    throw e;
  }
  await audit(proj.id, "task_team", created.id, "created", actor || "web", null, { code: created.code, lead_email: created.lead_email });
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
  }), "a task team is changed by a lead or owner"));
  await audit(proj.id, "task_team", id, "updated", actor || "web", { code: before.code, lead_email: before.lead_email }, { code: merged.code, lead_email: merged.lead_email });
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
