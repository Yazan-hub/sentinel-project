// invitations-store (R2a): invite by e-mail, list, resend, revoke, expiry — with GoTrue, the database and the budget mocked.
import { describe, it, expect, vi } from "vitest";
import { invite, listInvitations, resend, revoke, SENT, EXPIRY_DAYS } from "./invitations-store.mjs";
import * as members from "./members-store.mjs";

const T0 = new Date("2026-11-12T10:00:00Z");
const PROJ = { id: "p1", key: "demo", office_key: "hq", kind: "project" };
const roles = { "u-owner": "owner", "u-lead": "lead", "u-con": "contributor" };

/** A fake bridge world: memberships, invitations and GoTrue accounts in memory. */
function world({ sub = "u-owner", accounts = { "known@x.com": { id: "u-known", email: "known@x.com", last_sign_in_at: null } }, mailFails = false, now = T0 } = {}) {
  const memberships = Object.entries(roles).map(([user_id, role]) => ({ project_id: "p1", user_id, role, party: role === "contributor" ? null : "lead_appointed", task_team: null, state: "active" }));
  const invitations = [];
  const auth = [];
  const sb = vi.fn(async (path, opts = {}) => {
    const m = opts.method || "GET";
    if (path.startsWith("task_teams")) return [{ code: "ARC" }];
    if (path.startsWith("memberships")) {
      if (m === "GET") return path.includes("user_id=eq.") && !path.includes("project_id=eq.") ? memberships.filter((r) => path.includes(`user_id=eq.${r.user_id}`)) : memberships.filter((r) => r.project_id === "p1");
      if (m === "POST") { memberships.push({ ...opts.body }); return []; }
      if (m === "DELETE") { const uid = /user_id=eq\.([^&]+)/.exec(path)[1]; const i = memberships.findIndex((r) => r.user_id === uid && r.state === "invited"); if (i >= 0) memberships.splice(i, 1); return []; }
    }
    if (path.startsWith("invitations")) {
      if (m === "POST") { const r = { id: `inv-${invitations.length + 1}`, created_at: now.toISOString(), resent_at: null, revoked_at: null, accepted_at: null, ...opts.body }; invitations.push(r); return [r]; }
      if (m === "PATCH") { const id = /id=eq\.([^&]+)/.exec(path)[1]; Object.assign(invitations.find((r) => r.id === id), opts.body); return []; }
      let rows = invitations.filter((r) => !r.revoked_at && !r.accepted_at);
      const uid = /user_id=eq\.([^&]+)/.exec(path)?.[1]; if (uid) rows = rows.filter((r) => r.user_id === uid);
      const id = /&id=eq\.([^&]+)/.exec(path)?.[1]; if (id) rows = rows.filter((r) => r.id === id);
      const lt = /expires_at=lt\.([^&]+)/.exec(path)?.[1]; if (lt) rows = rows.filter((r) => r.expires_at < decodeURIComponent(lt));
      return rows;
    }
    return [];
  });
  const authFetch = vi.fn(async (path, opts = {}) => {
    auth.push([opts.method || "GET", path]);
    if (path.startsWith("/admin/users?page=")) return { users: Object.values(accounts) };
    if (path === "/admin/users" && opts.method === "POST") {
      if (accounts[opts.body.email]) throw Object.assign(new Error("auth POST /admin/users 422: A user with this email address has already been registered"), { status: 502 });
      const u = { id: `u-${opts.body.email.split("@")[0]}`, email: opts.body.email, last_sign_in_at: null, created_at: now.toISOString(), user_metadata: opts.body.user_metadata }; accounts[u.email] = u; return u;
    }
    if (path.startsWith("/admin/users/") && (opts.method || "GET") === "GET") return Object.values(accounts).find((u) => u.id === decodeURIComponent(path.slice(13))) || null;
    if (path.startsWith("/admin/users/") && opts.method === "DELETE") return {};
    if (path === "/otp") { if (mailFails) throw Object.assign(new Error("auth POST /otp 429: over_email_send_rate_limit"), { status: 502 }); return {}; }
    throw new Error("unexpected " + path);
  });
  const deps = {
    sb, authFetch, audit: vi.fn(async () => ({})), budget: vi.fn(), sub,
    ensureProject: vi.fn(async () => PROJ),
    now: () => now,
    members: {
      ...members,
      requireMinRole: vi.fn(async (key, min, dd) => { const r = roles[dd?.sub ?? sub]; if (!r || r === "contributor") throw Object.assign(new Error(`this action requires the lead role (you are ${r || "not a member"})`), { status: 403 }); return r; }),
      listMemberRows: vi.fn(async () => memberships),
    },
  };
  return { deps, memberships, invitations, auth, accounts };
}
const inviteBody = { email: "New.Person@x.com", role: "viewer", party: "appointed", task_team: "ARC" };
const HOUR_MS = 3600_000;
const noSecrets = (o) => { const bad = ["token", "link", "code", "otp", "action_link", "hashed_token"]; const walk = (v) => v && typeof v === "object" && Object.entries(v).forEach(([k, x]) => { expect(bad, k).not.toContain(k.toLowerCase()); walk(x); }); walk(o); };

describe("invite", () => {
  it("a new address: the account is created, the membership inserted FORWARDED in state invited, the row filed, one code mail sent, member_invited ledgered — and the answer carries no code", async () => {
    const w = world();
    const r = await invite("demo", inviteBody, w.deps);
    expect(r).toMatchObject({ status: 201, message: SENT, invitation: { email: "new.person@x.com", role: "viewer", party: "appointed", task_team: "ARC", expires_at: new Date(T0.getTime() + EXPIRY_DAYS * 86400_000).toISOString() } });
    noSecrets(r);
    expect(w.auth).toEqual([["POST", "/admin/users"], ["POST", "/otp"]]);
    const post = w.deps.sb.mock.calls.find(([p, o]) => p === "memberships" && o.method === "POST");
    expect(post[1].body).toEqual({ project_id: "p1", user_id: "u-new.person", role: "viewer", party: "appointed", task_team: "ARC", state: "invited" });
    expect(post[1].service).toBeUndefined();
    expect(w.invitations[0]).toMatchObject({ email: "new.person@x.com", user_id: "u-new.person", inviter_uid: "u-owner" });
    expect(w.deps.audit).toHaveBeenCalledWith("p1", "membership", "u-new.person", "member_invited", "web", null, expect.objectContaining({ email: "new.person@x.com", role: "viewer", party: "appointed", invitation_id: "inv-1" }));
    expect(w.deps.budget).toHaveBeenCalledWith("invitations", { perUser: 2, all: 2 }, "u-owner");
  });
  it("a known address answers the same words: GoTrue's 422 is swallowed, the account found by paging, no GoTrue words in the answer", async () => {
    const w = world();
    const r = await invite("demo", { email: "known@x.com", role: "contributor" }, w.deps);
    expect(r).toMatchObject({ status: 201, message: SENT, invitation: { user_id: "u-known", party: null, task_team: null } });
    expect(w.auth.map(([m, p]) => m + " " + p.split("?")[0])).toEqual(["POST /admin/users", "GET /admin/users", "POST /otp"]);
    expect(JSON.stringify(r)).not.toMatch(/registered|422/);
  });
  it("a failed membership insert leaves nothing behind: the account this call made is deleted, the error is the insert's (review finding 7)", async () => {
    const w = world();
    const inner = w.deps.sb;
    w.deps.sb = vi.fn(async (p, o = {}) => { if (p === "memberships" && o.method === "POST") throw Object.assign(new Error("new row violates row-level security policy"), { status: 403 }); return inner(p, o); });
    await expect(invite("demo", inviteBody, w.deps)).rejects.toThrow(/row-level security/);
    expect(w.auth.at(-1)).toEqual(["DELETE", "/admin/users/u-new.person"]);
    expect(w.invitations).toEqual([]);
  });
  it("the hourly budget: two an hour per person and for everyone, then a 429 in words", async () => {
    const { hourlyBudget } = await import("./invitations-store.mjs");
    const t = Date.parse("2026-11-12T12:00:00Z");
    hourlyBudget("a", t); hourlyBudget("a", t + 1);
    expect(() => hourlyBudget("a", t + 2)).toThrow(/two invitations an hour/);
    expect(() => hourlyBudget("b", t + 3)).toThrow(/two invitations an hour/); // everyone's two are spent
    hourlyBudget("b", t + HOUR_MS + 10); // an hour later
    expect(() => hourlyBudget(null, t + 4)).not.toThrow(); // the machine credential is not budgeted
  });
  it("refusals come before any GoTrue call: a contributor, a lead inviting the Client, a lead inviting an owner, a bad e-mail, a Firm without a team, an unknown role", async () => {
    for (const [sub, body, re] of [
      ["u-con", inviteBody, /requires the lead role/],
      ["u-lead", { ...inviteBody, party: "appointing", task_team: undefined }, /only an owner invites the Client/],
      ["u-lead", { ...inviteBody, role: "owner" }, /at or below your own role/],
      ["u-owner", { ...inviteBody, email: "nope" }, /valid e-mail/],
      ["u-owner", { ...inviteBody, task_team: "" }, /belongs to a task team/],
      ["u-owner", { ...inviteBody, role: "boss" }, /role must be one of/],
    ]) {
      const w = world({ sub });
      await expect(invite("demo", body, w.deps)).rejects.toThrow(re);
      expect(w.auth, String(re)).toEqual([]);
      expect(w.invitations).toEqual([]);
    }
  });
  it("an active member is a 409; an address already invited here is resent instead of inserted twice", async () => {
    const w = world();
    w.memberships.push({ project_id: "p1", user_id: "u-known", role: "viewer", party: null, task_team: null, state: "active" });
    await expect(invite("demo", { email: "known@x.com", role: "viewer" }, w.deps)).rejects.toMatchObject({ status: 409 });
    const w2 = world();
    await invite("demo", { email: "known@x.com", role: "viewer" }, w2.deps);
    const again = await invite("demo", { email: "known@x.com", role: "lead" }, w2.deps);
    expect(again).toMatchObject({ status: 200, message: SENT, invitation: { id: "inv-1", role: "viewer" } });
    expect(w2.invitations).toHaveLength(1);
    expect(w2.memberships.filter((m) => m.user_id === "u-known")).toHaveLength(1);
  });
  it("when GoTrue refuses the mail the row is kept and the answer is a 202 that says so", async () => {
    const w = world({ mailFails: true });
    const r = await invite("demo", inviteBody, w.deps);
    expect(r.status).toBe(202);
    expect(r.message).toMatch(/^Invitation saved; the e-mail was not sent \(.*over_email_send_rate_limit.*\) — use Resend in a while$/);
    expect(w.invitations).toHaveLength(1);
    expect(w.memberships.find((m) => m.user_id === "u-new.person").state).toBe("invited");
  });
});

describe("list, resend, revoke, expiry", () => {
  it("list shows the pending ones to a lead with no code or token; a contributor is refused", async () => {
    const w = world();
    await invite("demo", inviteBody, w.deps);
    const l = await listInvitations("demo", { ...w.deps, sub: "u-lead" });
    expect(l.items).toEqual([expect.objectContaining({ id: "inv-1", email: "new.person@x.com", role: "viewer", party: "appointed", task_team: "ARC", sent_at: T0.toISOString() })]);
    noSecrets(l);
    await expect(listInvitations("demo", { ...w.deps, sub: "u-con" })).rejects.toMatchObject({ status: 403 });
  });
  it("resend refreshes the 14 days, is budgeted, ledgers member_invited again and sends one more mail", async () => {
    const w = world();
    await invite("demo", inviteBody, w.deps);
    const later = new Date(T0.getTime() + 10 * 86400_000);
    const r = await resend("demo", "inv-1", { ...w.deps, now: () => later });
    expect(r).toMatchObject({ status: 200, message: SENT, invitation: { id: "inv-1", expires_at: new Date(later.getTime() + EXPIRY_DAYS * 86400_000).toISOString(), sent_at: later.toISOString() } });
    expect(w.auth.filter(([, p]) => p === "/otp")).toHaveLength(2);
    expect(w.deps.budget).toHaveBeenCalledTimes(2);
    expect(w.deps.audit.mock.calls.filter((c) => c[3] === "member_invited")).toHaveLength(2);
    await expect(resend("demo", "inv-9", w.deps)).rejects.toMatchObject({ status: 404 });
  });
  it("revoke marks the row, removes the invited membership, ledgers invitation_revoked, and deletes an account that never signed in and sits on no other project", async () => {
    const w = world();
    await invite("demo", inviteBody, w.deps);
    const r = await revoke("demo", "inv-1", { ...w.deps, sub: "u-lead" });
    expect(r).toEqual({ revoked: true, reason: "revoked", invitation: expect.objectContaining({ id: "inv-1" }) }); // no account_deleted in the answer (an oracle)
    expect(w.invitations[0].revoked_at).toBe(T0.toISOString());
    expect(w.memberships.find((m) => m.user_id === "u-new.person")).toBeUndefined();
    expect(w.deps.audit).toHaveBeenCalledWith("p1", "membership", "u-new.person", "invitation_revoked", "web", expect.objectContaining({ email: "new.person@x.com" }), { reason: "revoked", invitation_id: "inv-1", account_deleted: true });
    expect(w.auth.at(-1)).toEqual(["DELETE", "/admin/users/u-new.person"]);
  });
  it("revoke keeps an account an invitation did not make, one that has signed in, or one on another project", async () => {
    const deleted = (w) => w.deps.audit.mock.calls.find((c) => c[3] === "invitation_revoked")[6].account_deleted;
    const w = world(); // known@x.com has no invited_to marker: the founder made it
    await invite("demo", { email: "known@x.com", role: "viewer" }, w.deps);
    await revoke("demo", "inv-1", w.deps);
    expect(deleted(w)).toBe(false);
    expect(w.auth.some(([m]) => m === "DELETE")).toBe(false);
    const w2 = world();
    await invite("demo", inviteBody, w2.deps);
    w2.accounts["new.person@x.com"].last_sign_in_at = "2026-01-01T00:00:00Z";
    await revoke("demo", "inv-1", w2.deps);
    expect(deleted(w2)).toBe(false);
    const w3 = world();
    await invite("demo", inviteBody, w3.deps);
    w3.memberships.push({ project_id: "p2", user_id: "u-new.person", role: "viewer", state: "active" });
    await revoke("demo", "inv-1", w3.deps);
    expect(deleted(w3)).toBe(false);
  });
  it("resend and revoke judge the owner rule on the live row: an invited viewer an owner later made the Client is a lead's no more", async () => {
    const w = world();
    await invite("demo", { email: "known@x.com", role: "viewer" }, w.deps);
    w.memberships.find((m) => m.user_id === "u-known").party = "appointing";
    await expect(resend("demo", "inv-1", { ...w.deps, sub: "u-lead" })).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/only an owner resends/) });
    await expect(revoke("demo", "inv-1", { ...w.deps, sub: "u-lead" })).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/only an owner revokes/) });
  });
  it("only an owner revokes the Client's or an owner's invitation", async () => {
    const w = world();
    await invite("demo", { email: "known@x.com", role: "viewer", party: "appointing" }, w.deps);
    await expect(revoke("demo", "inv-1", { ...w.deps, sub: "u-lead" })).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/only an owner revokes/) });
    await expect(revoke("demo", "inv-1", w.deps)).resolves.toMatchObject({ revoked: true });
  });
  it("an invitation older than 14 days is swept on the next list, once, with reason expired", async () => {
    const w = world();
    await invite("demo", inviteBody, w.deps);
    const day15 = { ...w.deps, now: () => new Date(T0.getTime() + 15 * 86400_000) };
    expect((await listInvitations("demo", day15)).items).toEqual([]);
    expect((await listInvitations("demo", day15)).items).toEqual([]);
    expect(w.deps.audit.mock.calls.filter((c) => c[3] === "invitation_revoked")).toHaveLength(1);
    expect(w.deps.audit.mock.calls.find((c) => c[3] === "invitation_revoked")[6]).toEqual({ reason: "expired", invitation_id: "inv-1", account_deleted: true });
    expect(w.memberships.find((m) => m.user_id === "u-new.person")).toBeUndefined();
  });
});
