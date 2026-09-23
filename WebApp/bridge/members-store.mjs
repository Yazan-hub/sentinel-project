// Project collaboration — members with roles. Management writes ride the caller's FORWARDED
// session so 0004's lead-gate RLS is the enforcer (machine callers keep service trust). Email
// lookups use the GoTrue admin API — service key, bridge-only, never the browser.
import { loadEnv } from "./thatopen-client.mjs";
import * as cde from "./cde-store.mjs";
import { currentUserToken, currentSub } from "./bridge-auth.mjs";

const env = { ...process.env, ...loadEnv() };
const AUTH_URL = (env.SUPABASE_URL || "").replace(/\/$/, "") + "/auth/v1";
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || "";

export const ROLES = ["owner", "lead", "contributor", "viewer"];
export const ROLE_RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };

const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GoTrue admin GET (service key). Test seam via deps.adminFetch. */
async function realAdminFetch(path) {
  const r = await fetch(`${AUTH_URL}${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw err(502, `auth admin ${r.status}: ${await r.text()}`);
  return await r.json();
}

const wire = (deps = {}) => ({
  sb: deps.sb || cde.sb,
  ensureProject: deps.ensureProject || cde.ensureProject,
  audit: deps.audit || cde.audit,
  adminFetch: deps.adminFetch || realAdminFetch,
  sub: deps.sub !== undefined ? deps.sub : undefined, // tests override; production reads currentSub()
});
const subOf = (d) => (d.sub !== undefined ? d.sub : currentSub());

/** Rows for a project — service read (the list is member-visible; write RLS is the boundary). */
async function memberRows(d, projId) {
  return (await d.sb(`memberships?project_id=eq.${enc(projId)}&select=user_id,role`, { service: true })) || [];
}

export async function listMembers(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  return Promise.all(rows.map(async (m) => {
    let email = m.user_id;
    try {
      const u = await d.adminFetch(`/admin/users/${enc(m.user_id)}`);
      email = u?.email || u?.users?.[0]?.email || m.user_id; // tolerate shape drift; degrade to id
    } catch { /* GoTrue down → ids still render */ }
    return { user_id: m.user_id, role: m.role, email };
  }));
}

/** The membership rows alone ({ user_id, role }) — no GoTrue e-mail lookup per member (listMembers does one
 *  each). The journey reads this on every strip refresh (Next strip spec §2). */
export async function listMemberRows(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  return memberRows(d, proj.id);
}

export async function findUserByEmail(email, deps) {
  const d = wire(deps);
  const res = await d.adminFetch(`/admin/users?email=${enc(email)}`);
  const list = Array.isArray(res?.users) ? res.users : Array.isArray(res) ? res : res?.id ? [res] : [];
  return list.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
}

export async function addMember(key, { email, role } = {}, actor, deps) {
  const d = wire(deps);
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw err(400, "a valid email is required");
  if (!ROLES.includes(role)) throw err(400, `role must be one of: ${ROLES.join(", ")}`);
  const proj = await d.ensureProject(key);
  const user = await findUserByEmail(email.trim(), d);
  if (!user) throw err(404, `No Sentinel account with this email — they need to sign up first (email + password in the web app), then you can add them.`);
  const rows = await memberRows(d, proj.id);
  if (rows.some((m) => m.user_id === user.id)) throw err(409, "already a member — change their role instead");
  // FORWARDED write: 0004's lead-gate RLS decides whether the CALLER may manage members.
  const member = { project_id: proj.id, user_id: user.id, role };
  await d.sb(`memberships`, { method: "POST", body: member, prefer: "return=minimal" });
  await d.audit(proj.id, "membership", user.id, "member_added", actor || "web", null, { email: user.email, role });
  return { user_id: user.id, role, email: user.email };
}

async function ownerCountExcluding(d, projId, userId) {
  const rows = await memberRows(d, projId);
  return rows.filter((m) => m.role === "owner" && m.user_id !== userId).length;
}

export async function changeRole(key, userId, role, actor, deps) {
  const d = wire(deps);
  if (!ROLES.includes(role)) throw err(400, `role must be one of: ${ROLES.join(", ")}`);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  const before = rows.find((m) => m.user_id === userId);
  if (!before) throw err(404, "not a member of this project");
  if (before.role === "owner" && role !== "owner" && (await ownerCountExcluding(d, proj.id, userId)) === 0)
    throw err(409, "a project must keep at least one owner");
  // CAS: the WHERE re-checks the role the last-owner guard was computed from — two admins
  // demoting the last two owners concurrently cannot race to zero owners; the loser gets 0 rows.
  const patched = await d.sb(`memberships?project_id=eq.${enc(proj.id)}&user_id=eq.${enc(userId)}&role=eq.${enc(before.role)}`, { method: "PATCH", body: { role }, prefer: "return=representation" });
  if (!Array.isArray(patched) || !patched.length) throw err(409, "membership changed concurrently — reload and retry");
  await d.audit(proj.id, "membership", userId, "member_role_changed", actor || "web", { role: before.role }, { role });
  return { user_id: userId, role };
}

export async function removeMember(key, userId, actor, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  const before = rows.find((m) => m.user_id === userId);
  if (!before) throw err(404, "not a member of this project");
  if (before.role === "owner" && (await ownerCountExcluding(d, proj.id, userId)) === 0)
    throw err(409, "a project must keep at least one owner");
  const deleted = await d.sb(`memberships?project_id=eq.${enc(proj.id)}&user_id=eq.${enc(userId)}&role=eq.${enc(before.role)}`, { method: "DELETE", prefer: "return=representation" });
  if (!Array.isArray(deleted) || !deleted.length) throw err(409, "membership changed concurrently — reload and retry");
  await d.audit(proj.id, "membership", userId, "member_removed", actor || "web", { role: before.role }, null);
  return { removed: true, user_id: userId };
}

/** The caller's role: "service" for machine callers (BCF_TOKEN — trusted as everywhere),
 *  the membership row's role for a signed-in member, null for a signed-in non-member. */
export async function myRole(key, deps) {
  const d = wire(deps);
  const sub = subOf(d);
  if (!sub && !currentUserToken() && d.sub === undefined) return "service";
  if (d.sub !== undefined && d.sub === null) return "service"; // test seam parity
  const proj = await d.ensureProject(key);
  const rows = await memberRows(d, proj.id);
  return rows.find((m) => m.user_id === sub)?.role ?? null;
}

/** 403 unless the caller's role rank meets `min`. Machine callers pass (service trust). */
export async function requireMinRole(key, min, deps) {
  const role = await myRole(key, deps);
  if (role === "service") return;
  if (!role || (ROLE_RANK[role] || 0) < (ROLE_RANK[min] || 99))
    throw err(403, `this action requires the ${min} role (you are ${role || "not a member"})`);
}
