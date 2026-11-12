// Invitations by e-mail (BIM documents workspace R2a; design 2026-10-24 §6 Invitations, §10 Invitations, call 15).
// A lead or owner of an office project types an e-mail, a role, a party and (for a Firm) a task team. The bridge creates the
// account with the service credential when none exists (public sign-up stays closed), inserts the membership in state
// 'invited' with the inviter's FORWARDED session (0016's role cap and 0050's party rules still apply), files the invitation
// (service-only table), and sends ONE e-mail: GoTrue's sign-in code (the "Magic Link" template, which the founder words as an
// invitation). The person opens Sentinel, chooses "Sign in with a code", and their first bridge call flips them to active
// (members-store myMembership). No link or code is ever returned, stored or logged by the bridge.
// Supabase's built-in mail sends 2 e-mails an hour for the whole project, so invitations are budgeted (takeWriteBudget).
import { loadEnv } from "./thatopen-client.mjs";
import * as cde from "./cde-store.mjs";
import { currentSub, currentActor } from "./bridge-auth.mjs";
import * as members from "./members-store.mjs";

const env = { ...process.env, ...loadEnv() };
const AUTH_URL = (env.SUPABASE_URL || "").replace(/\/$/, "") + "/auth/v1";
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || "";
export const EXPIRY_DAYS = 14;
export const SENT = "Invitation sent";
const NO_UID = "00000000-0000-0000-0000-000000000000"; // the machine credential's inviter_uid
const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GoTrue call with the service key; the body (never a code or link) comes back as JSON. Test seam via deps.authFetch. */
async function realAuthFetch(path, { method = "GET", body } = {}) {
  const r = await fetch(`${AUTH_URL}${path}`, {
    method, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  if (!r.ok) throw err(502, `auth ${method} ${path.split("?")[0]} ${r.status}: ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

const wire = (deps = {}) => ({
  sb: deps.sb || cde.sb,
  ensureProject: deps.ensureProject || cde.ensureProject,
  audit: deps.audit || cde.audit,
  authFetch: deps.authFetch || realAuthFetch,
  budget: deps.budget || cde.takeWriteBudget,
  members: deps.members || members,
  sub: deps.sub !== undefined ? deps.sub : undefined,
  now: deps.now || (() => new Date()),
  deps,
});
const subOf = (d) => (d.sub !== undefined ? d.sub : currentSub());
const plus14 = (d) => new Date(d.now().getTime() + EXPIRY_DAYS * 86400_000).toISOString();
const pending = (d, projId, more = "") => d.sb(`invitations?project_id=eq.${enc(projId)}&revoked_at=is.null&accepted_at=is.null${more}&select=id,email,user_id,role,party,task_team,inviter_email,created_at,expires_at,resent_at&order=created_at.asc`, { service: true });
const row = (i) => ({ id: i.id, email: i.email, user_id: i.user_id, role: i.role, party: i.party ?? null, task_team: i.task_team ?? null, invited_by: i.inviter_email ?? null, sent_at: i.resent_at ?? i.created_at, expires_at: i.expires_at });

/** The inviter's right: lead or owner of a project that belongs to an office (addMember's rule, cde-10); role at or below theirs;
 *  owner and the Client only by an owner. Answers the inviter's role. All before any account lookup (no e-mail oracle). */
async function requireInviter(key, proj, { role, party }, d) {
  const mine = await d.members.requireMinRole(key, "lead", { ...d.deps, ensureProject: async () => proj });
  if (mine !== "service" && proj.kind !== "office" && !proj.office_key) throw err(403, "inviting people needs a project that belongs to an office — a lead of the office attaches it in Project settings, then invite them");
  if (role !== undefined) {
    if (!members.ROLES.includes(role)) throw err(400, `role must be one of: ${members.ROLES.join(", ")}`);
    if (mine !== "service" && members.ROLE_RANK[role] > members.ROLE_RANK[mine]) throw err(403, `you invite at or below your own role (you are ${mine}) — nothing was sent`);
  }
  if (party === "appointing" && mine !== "owner" && mine !== "service") throw err(403, `only an owner invites the Client (appointing party) (you are ${mine}) — nothing was sent`);
  return mine;
}

/** GoTrue sends the sign-in code to an existing account. The founder's "Magic Link" template is the invitation's words. */
async function trySend(d, email) {
  try { await d.authFetch("/otp", { method: "POST", body: { email, create_user: false } }); return { ok: true }; }
  catch (e) { return { ok: false, message: `Invitation saved; the e-mail was not sent (${String(e?.message || e).slice(0, 160)}) — use Resend in a while` }; }
}

/** POST /cde/:key/invitations {email, role, party, task_team} → {status 201, message, invitation}, or status 202 when the row is
 *  saved but the mail was refused (Supabase's hourly limit, most likely) — the inviter uses Resend later. A new and a known
 *  address answer the same words; an address already invited here is resent. */
export async function invite(key, body = {}, deps) {
  const d = wire(deps);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw err(400, "a valid e-mail is required");
  if (body.role === undefined) throw err(400, `role must be one of: ${members.ROLES.join(", ")}`);
  const proj = await d.ensureProject(key);
  const mine = await requireInviter(key, proj, body, d);
  const fields = await d.members.partyFields({ sb: d.sb }, proj, body);
  d.budget("invitations", { perUser: 2, all: 2 }); // Supabase's built-in mail: 2 an hour for the whole project
  let user = await d.members.findUserByEmail(email, { adminFetch: (p) => d.authFetch(p) });
  if (!user) user = await d.authFetch("/admin/users", { method: "POST", body: { email, email_confirm: true, user_metadata: { invited_to: key } } });
  if (!user?.id) throw err(502, "the account could not be created — nothing was sent");
  const rows = await d.members.listMemberRows(key, { ...d.deps, ensureProject: async () => proj });
  const existing = rows.find((m) => m.user_id === user.id);
  if (existing && existing.state !== "invited") throw err(409, "already a member — change their role or party instead");
  if (existing) {
    const open = await pending(d, proj.id, `&user_id=eq.${enc(user.id)}`);
    if (open?.length) return resend(key, open[0].id, deps);
  } else {
    // FORWARDED write: 0016's role cap and 0050's party rules decide whether the CALLER may insert this row.
    await d.sb(`memberships`, { method: "POST", body: { project_id: proj.id, user_id: user.id, role: body.role, ...fields, state: "invited" }, prefer: "return=minimal" });
  }
  const expires_at = plus14(d);
  const inv = (await d.sb(`invitations`, { method: "POST", prefer: "return=representation", service: true, body: {
    project_id: proj.id, email, user_id: user.id, role: body.role, ...fields, inviter_uid: subOf(d) || NO_UID, inviter_email: currentActor() || (mine === "service" ? "service" : null), expires_at,
  } }))?.[0] ?? {};
  await d.audit(proj.id, "membership", user.id, "member_invited", "web", null, { email, role: body.role, ...fields, expires_at, invitation_id: inv.id ?? null });
  const sent = await trySend(d, email);
  return { status: sent.ok ? 201 : 202, message: sent.ok ? SENT : sent.message, invitation: row({ ...inv, email, user_id: user.id, role: body.role, ...fields, expires_at }) };
}

/** GET /cde/:key/invitations (lead or owner) → {items}: the pending ones, after sweeping the expired. */
export async function listInvitations(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  await requireInviter(key, proj, {}, d);
  await sweep(d, key, proj);
  return { items: ((await pending(d, proj.id)) || []).map(row) };
}

/** Expired invitations (call 15: 14 days) are revoked on the next read, with the reason on the ledger row. */
async function sweep(d, key, proj) {
  const late = (await pending(d, proj.id, `&expires_at=lt.${enc(d.now().toISOString())}`)) || [];
  for (const i of late) await revokeRow(d, key, proj, i, "expired");
}

/** POST /cde/:key/invitations/:id/resend → the same words, a fresh 14 days. */
export async function resend(key, id, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  await requireInviter(key, proj, {}, d);
  const inv = (await pending(d, proj.id, `&id=eq.${enc(id)}`))?.[0];
  if (!inv) throw err(404, "no pending invitation with this id — it was accepted, revoked or has expired");
  d.budget("invitations", { perUser: 2, all: 2 });
  const expires_at = plus14(d), resent_at = d.now().toISOString();
  await d.sb(`invitations?id=eq.${enc(inv.id)}`, { method: "PATCH", body: { expires_at, resent_at }, prefer: "return=minimal", service: true });
  await d.audit(proj.id, "membership", inv.user_id, "member_invited", "web", null, { email: inv.email, role: inv.role, party: inv.party, task_team: inv.task_team, expires_at, invitation_id: inv.id, resent: true });
  const sent = await trySend(d, inv.email);
  return { status: sent.ok ? 200 : 202, message: sent.ok ? SENT : sent.message, invitation: row({ ...inv, expires_at, resent_at }) };
}

/** DELETE /cde/:key/invitations/:id → {revoked, account_deleted}. An owner's or the Client's invitation is an owner's to revoke. */
export async function revoke(key, id, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const mine = await requireInviter(key, proj, {}, d);
  const inv = (await pending(d, proj.id, `&id=eq.${enc(id)}`))?.[0];
  if (!inv) throw err(404, "no pending invitation with this id — it was accepted, revoked or has expired");
  if ((inv.role === "owner" || inv.party === "appointing") && mine !== "owner" && mine !== "service") throw err(403, `only an owner revokes an owner's or the Client's invitation (you are ${mine}) — nothing was changed`);
  return revokeRow(d, key, proj, inv, "revoked");
}

/** The one revoke path: mark the row, remove the invited membership, ledger it, and delete an account that never signed in
 *  and belongs to no other project (the invitation made it; nothing else did). */
async function revokeRow(d, key, proj, inv, reason) {
  await d.sb(`invitations?id=eq.${enc(inv.id)}`, { method: "PATCH", body: { revoked_at: d.now().toISOString() }, prefer: "return=minimal", service: true });
  await d.sb(`memberships?project_id=eq.${enc(proj.id)}&user_id=eq.${enc(inv.user_id)}&state=eq.invited`, { method: "DELETE", prefer: "return=minimal", service: true });
  await d.audit(proj.id, "membership", inv.user_id, "invitation_revoked", "web", { email: inv.email, role: inv.role, party: inv.party, task_team: inv.task_team }, { reason, invitation_id: inv.id });
  let account_deleted = false;
  try {
    const u = await d.authFetch(`/admin/users/${enc(inv.user_id)}`);
    const elsewhere = (await d.sb(`memberships?user_id=eq.${enc(inv.user_id)}&select=project_id`, { service: true })) || [];
    if (u && !u.last_sign_in_at && !elsewhere.length) { await d.authFetch(`/admin/users/${enc(inv.user_id)}`, { method: "DELETE" }); account_deleted = true; }
  } catch (e) { console.warn(`[invitations] ${key}: the account of a revoked invitation was not checked or deleted: ${e?.message || e}`); }
  return { revoked: true, reason, account_deleted, invitation: row(inv) };
}
