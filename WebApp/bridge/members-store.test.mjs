import { describe, it, expect, vi } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";
import { ROLES, ROLE_RANK, PARTIES, PARTY_WORDS, changeParty, myMembership, acceptMyInvitations, listMembers, listMemberRows, addMember, changeRole, removeMember, myRole, requireMinRole, requireSpend, canUseCloudAi } from "./members-store.mjs";

const jwt = (payload) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".sig";

const baseDeps = (over = {}) => {
  const rows = [
    { project_id: "p1", user_id: "u-owner", role: "owner" },
    { project_id: "p1", user_id: "u-view", role: "viewer" },
  ];
  return {
    rows,
    ensureProject: vi.fn(async () => ({ id: "p1", key: "demo" })),
    sb: vi.fn(async (path, opts = {}) => {
      if (path.startsWith("memberships") && (!opts.method || opts.method === "GET")) return rows;
      if (path.startsWith("memberships") && opts.method === "POST") { rows.push(opts.body); return [opts.body]; }
      if (path.startsWith("memberships") && opts.method === "PATCH") return [{}];
      if (path.startsWith("memberships") && opts.method === "DELETE") return [{}]; // CAS: non-empty = the row matched the predicate
      return [];
    }),
    audit: vi.fn(async () => ({})),
    adminFetch: vi.fn(async (path) => {
      if (path.includes("email=known%40x.com")) return { users: [{ id: "u-new", email: "known@x.com" }] };
      if (path.includes("/users/u-owner")) return { id: "u-owner", email: "owner@x.com" };
      if (path.includes("/users/u-view")) return { id: "u-view", email: "view@x.com" };
      return { users: [] };
    }),
    ...over,
  };
};

describe("vocabulary", () => {
  it("mirrors 0004 role_rank exactly", () => {
    expect(ROLES).toEqual(["owner", "lead", "contributor", "viewer"]);
    expect(ROLE_RANK).toEqual({ owner: 4, lead: 3, contributor: 2, viewer: 1 });
  });
});

describe("listMembers", () => {
  it("joins roles with admin-resolved emails", async () => {
    const m = await listMembers("demo", baseDeps());
    expect(m).toEqual([
      { user_id: "u-owner", role: "owner", email: "owner@x.com", party: null, task_team: null, state: "active" },
      { user_id: "u-view", role: "viewer", email: "view@x.com", party: null, task_team: null, state: "active" },
    ]);
  });

  it("an unresolvable email degrades to the user id, never throws", async () => {
    const deps = baseDeps({ adminFetch: vi.fn(async () => { throw new Error("gotrue down"); }) });
    const m = await listMembers("demo", deps);
    expect(m[0].email).toBe("u-owner");
  });
});

describe("listMemberRows", () => {
  it("returns the rows without a single e-mail lookup", async () => {
    const deps = baseDeps();
    expect(await listMemberRows("demo", deps)).toEqual(deps.rows);
    expect(deps.adminFetch).not.toHaveBeenCalled();
    expect(deps.sb).toHaveBeenCalledWith("memberships?project_id=eq.p1&select=user_id,role,party,task_team,state", { service: true });
  });
});

describe("addMember", () => {
  it("adds a found user with a valid role and audits", async () => {
    const deps = baseDeps();
    const m = await addMember("demo", { email: "known@x.com", role: "contributor" }, "web", deps);
    expect(m).toMatchObject({ user_id: "u-new", role: "contributor" });
    expect(deps.audit.mock.calls[0][3]).toBe("member_added");
  });

  it("404s with the sign-up-first message when no account exists", async () => {
    await expect(addMember("demo", { email: "ghost@x.com", role: "viewer" }, "web", baseDeps()))
      .rejects.toMatchObject({ status: 404, message: expect.stringMatching(/sign up first/i) });
  });

  it("409s a duplicate member, 400s an unknown role, 400s a garbage email", async () => {
    const deps = baseDeps({ adminFetch: vi.fn(async () => ({ users: [{ id: "u-owner", email: "owner@x.com" }] })) });
    await expect(addMember("demo", { email: "owner@x.com", role: "viewer" }, "w", deps)).rejects.toMatchObject({ status: 409 });
    await expect(addMember("demo", { email: "a@x.com", role: "boss" }, "w", baseDeps())).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/owner, lead, contributor, viewer/) });
    await expect(addMember("demo", { email: "not-an-email", role: "viewer" }, "w", baseDeps())).rejects.toMatchObject({ status: 400 });
  });
});

describe("last-owner guard", () => {
  it("blocks demoting or removing the only owner with 409", async () => {
    await expect(changeRole("demo", "u-owner", "lead", "w", baseDeps())).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/at least one owner/) });
    await expect(removeMember("demo", "u-owner", "w", baseDeps())).rejects.toMatchObject({ status: 409 });
  });

  it("allows it when a second owner exists", async () => {
    const deps = baseDeps();
    deps.rows.push({ project_id: "p1", user_id: "u-owner2", role: "owner" });
    await expect(changeRole("demo", "u-owner", "lead", "w", deps)).resolves.toBeTruthy();
    expect(deps.audit.mock.calls.some((c) => c[3] === "member_role_changed")).toBe(true);
  });

  it("removing a non-owner audits member_removed", async () => {
    const deps = baseDeps();
    await removeMember("demo", "u-view", "w", deps);
    expect(deps.audit.mock.calls[0][3]).toBe("member_removed");
  });
});

describe("myRole / requireMinRole", () => {
  it("machine caller (no JWT) is 'service'; requireMinRole passes it", async () => {
    expect(await myRole("demo", baseDeps())).toBe("service");
    await expect(requireMinRole("demo", "lead", baseDeps())).resolves.toBe("service");
  });

  it("a signed-in member gets their row's role; a non-member gets null", async () => {
    const deps = baseDeps({ sub: "u-view" });
    expect(await myRole("demo", deps)).toBe("viewer");
    expect(await myRole("demo", baseDeps({ sub: "u-stranger" }))).toBeNull();
  });

  it("requireMinRole 403s below the bar, naming the requirement", async () => {
    await expect(requireMinRole("demo", "lead", baseDeps({ sub: "u-view" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead/) });
    await expect(requireMinRole("demo", "contributor", baseDeps({ sub: "u-owner" }))).resolves.toBe("owner"); // answers the role (W-2 review)
  });
});

describe("membership CAS — role predicate on writes", () => {
  it("the write's WHERE carries the pre-read role; a lost race (0 rows) is a 409, no audit", async () => {
    const deps = baseDeps();
    deps.rows.push({ project_id: "p1", user_id: "u-owner2", role: "owner" });
    deps.sb = vi.fn(async (path, opts = {}) => {
      if (path.startsWith("memberships") && (!opts.method || opts.method === "GET")) return deps.rows;
      if (opts.method === "PATCH" || opts.method === "DELETE") {
        expect(path).toMatch(/role=eq\.owner/); // the predicate is on the wire
        return []; // concurrent winner already changed the row
      }
      return [];
    });
    await expect(changeRole("demo", "u-owner", "lead", "w", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/concurrently/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });
});

describe("requireSpend — who may spend the founder's storage or AI on a project (H0, D2)", () => {
  const office = { id: "o1", key: "office-a", kind: "office", office_key: null };
  const attached = { id: "p1", key: "demo", kind: "project", office_key: "office-a" };
  const lone = { id: "p1", key: "demo", kind: "project", office_key: null }; // anyone who signs up can make one
  const on = (proj, over) => baseDeps({ ensureProject: vi.fn(async () => proj), ...over });

  it("the machine credential passes, office or not, and gets the project row", async () => {
    await expect(requireSpend("demo", on(lone, { sub: null }))).resolves.toEqual(lone);
  });

  it("a contributor or above of an office project passes; the project is read once", async () => {
    const deps = on(attached, { sub: "u-owner" });
    await expect(requireSpend("demo", deps)).resolves.toEqual(attached);
    expect(deps.ensureProject).toHaveBeenCalledTimes(1);
  });

  it("an office row is its lead's or owner's to spend on; its contributor is refused, as canUseCloudAi refuses them", async () => {
    await expect(requireSpend("office-a", on(office, { sub: "u-owner" }))).resolves.toEqual(office);
    const deps = on(office, { sub: "u-con" });
    deps.rows.push({ project_id: "p1", user_id: "u-con", role: "contributor" });
    await expect(requireSpend("office-a", deps))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead role on office-a.*you are contributor.*nothing was sent/) });
  });

  it("a viewer is refused in words that name the role", async () => {
    await expect(requireSpend("demo", on(attached, { sub: "u-view" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/contributor role.*you are viewer.*nothing was sent/) });
  });

  it("the owner of a project with no office is refused — owning a self-made project is not trust", async () => {
    await expect(requireSpend("demo", on(lone, { sub: "u-owner" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/belongs to no office.*nothing was sent/) });
  });

  it("a signed-in non-member is refused, named as not a member (H0 minor N5)", async () => {
    await expect(requireSpend("demo", on(attached, { sub: "u-stranger" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/you are not a member.*nothing was sent/) });
  });
});

describe("canUseCloudAi — /ai/* names no project, so the account is checked (H0, D2)", () => {
  const deps = (sub, rows) => baseDeps({
    sub,
    sb: vi.fn(async (path, opts) => {
      expect(path).toBe(`memberships?user_id=eq.${sub}&select=role,projects(kind,office_key)`);
      expect(opts).toEqual({ service: true });
      return rows;
    }),
  });
  const row = (role, kind, office_key) => ({ role, projects: { kind, office_key } });

  it("the machine credential may, with no read", async () => {
    const d = deps(null, []);
    await expect(canUseCloudAi(d)).resolves.toMatchObject({ ok: true });
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a contributor of an office project may; a lead of an office may", async () => {
    await expect(canUseCloudAi(deps("u1", [row("contributor", "project", "office-a")]))).resolves.toMatchObject({ ok: true });
    await expect(canUseCloudAi(deps("u2", [row("lead", "office", null)]))).resolves.toMatchObject({ ok: true });
  });

  it("a viewer of an office project, a contributor of an office row, a self-made project's owner and a member of nothing may not — why says what is needed", async () => {
    for (const rows of [[row("viewer", "project", "office-a")], [row("contributor", "office", null)], [row("owner", "project", null)], []]) {
      const r = await canUseCloudAi(deps("u3", rows));
      expect(r.ok).toBe(false);
      expect(r.why).toMatch(/office/);
      expect(r.why).toMatch(/Local AI still works/);
    }
  });

  it("the production path (a JWT sign-in, no deps.sub) reads the caller's own sub, not the machine credential's (H0 minor N5)", async () => {
    const sb = vi.fn(async () => []);
    await expect(runWithAuth(jwt({ sub: "u3" }), () => canUseCloudAi({ sb }))).resolves.toMatchObject({ ok: false });
    expect(sb).toHaveBeenCalledWith("memberships?user_id=eq.u3&select=role,projects(kind,office_key)", { service: true });
  });
});

// H0 (cde-10): the account lookup tells "no account" (404) from "added" (201) — an e-mail oracle — and an add needs no
// consent, so it runs only for a lead or owner of an office or of a project attached to one. Anyone else gets the same
// 403 before any lookup, whether or not the address has an account; the machine credential passes as before.
describe("addMember — the lookup is a lead's, on an office's project (cde-10)", () => {
  it("a contributor is refused before any lookup — the same 403 for an address with an account and one without", async () => {
    const deps = baseDeps({ sub: "u-contrib" });
    deps.rows.push({ project_id: "p1", user_id: "u-contrib", role: "contributor" });
    for (const email of ["known@x.com", "ghost@x.com"])
      await expect(addMember("demo", { email, role: "viewer" }, "w", deps)).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(deps.adminFetch).not.toHaveBeenCalled();
  });

  it("the owner of a project outside any office is refused before the lookup — any account owns the projects it creates", async () => {
    const deps = baseDeps({ sub: "u-owner" });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer" }, "w", deps))
      .rejects.toMatchObject({ status: 403, message: "adding people by e-mail needs a project that belongs to an office — a lead of the office attaches it in Project settings, then add them" });
    expect(deps.adminFetch).not.toHaveBeenCalled();
    expect(deps.sb.mock.calls.some(([, o]) => o?.method === "POST")).toBe(false);
  });

  it("a lead or owner of an office's project, or of an office, adds as before", async () => {
    const child = baseDeps({ sub: "u-owner", ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", kind: "project", office_key: "hq" })) });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer" }, "w", child)).resolves.toMatchObject({ user_id: "u-new", role: "viewer" });
    const office = baseDeps({ sub: "u-owner", ensureProject: vi.fn(async () => ({ id: "p1", key: "hq", kind: "office", office_key: null })) });
    await expect(addMember("hq", { email: "known@x.com", role: "viewer" }, "w", office)).resolves.toMatchObject({ user_id: "u-new" });
  });
});

// R2a (documents design §6, §10 Memberships): parties on memberships, the invited -> active flip.
describe("R2a — changeParty, parties on addMember, myMembership", () => {

  const withTeams = (over = {}) => {
    const d = baseDeps(over);
    const inner = d.sb;
    d.sb = vi.fn(async (path, opts = {}) => path.startsWith("task_teams") ? [{ code: "ARC" }] : inner(path, opts));
    return d;
  };
  it("names the three parties in plain words", () => {
    expect(PARTIES).toEqual(["appointing", "lead_appointed", "appointed"]);
    expect(PARTY_WORDS).toEqual({ appointing: "Client", lead_appointed: "Lead firm", appointed: "Firm" });
  });
  it("a lead cannot change a party; an owner cannot change their own; a non-member is a 404", async () => {
    const rows = [{ project_id: "p1", user_id: "u-lead", role: "lead" }, { project_id: "p1", user_id: "u-owner", role: "owner" }, { project_id: "p1", user_id: "u-view", role: "viewer" }];
    const lead = withTeams({ sub: "u-lead" }); lead.rows.splice(0, lead.rows.length, ...rows);
    await expect(changeParty("demo", "u-view", { party: "lead_appointed" }, lead)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/only an owner changes who is in which party/) });
    await expect(changeParty("demo", "u-owner", { party: "appointed", task_team: "ARC" }, withTeams({ sub: "u-owner" }))).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/your own party/) });
    await expect(changeParty("demo", "u-nobody", { party: "appointing" }, withTeams({ sub: "u-owner" }))).rejects.toMatchObject({ status: 404 });
  });
  it("a Firm member needs a declared task team; the write is a forwarded PATCH of exactly {party, task_team}, with no audit() call (the trigger's row is the record)", async () => {
    const d = withTeams({ sub: "u-owner" });
    await expect(changeParty("demo", "u-view", { party: "appointed" }, d)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/belongs to a task team/) });
    await expect(changeParty("demo", "u-view", { party: "appointed", task_team: "STR" }, d)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not a task team of this project/) });
    await expect(changeParty("demo", "u-view", { party: "appointed", task_team: "arc" }, d)).resolves.toEqual({ user_id: "u-view", party: "appointed", task_team: "ARC" });
    const patch = d.sb.mock.calls.find(([p, o]) => o?.method === "PATCH");
    expect(patch[0]).toBe("memberships?project_id=eq.p1&user_id=eq.u-view");
    expect(patch[1]).toMatchObject({ body: { party: "appointed", task_team: "ARC" } });
    expect(patch[1].service).toBeUndefined(); // forwarded: 0050's trigger sees the owner's JWT
    expect(d.audit).not.toHaveBeenCalled();
    await expect(changeParty("demo", "u-view", { party: "lead_appointed", task_team: "ARC" }, d)).resolves.toEqual({ user_id: "u-view", party: "lead_appointed", task_team: null });
  });
  it("the database's refusal reaches the caller as its sentence alone (F-R2a-2), not the PostgREST envelope", async () => {
    const d = withTeams({ sub: "u-owner" });
    const inner = d.sb;
    d.sb = vi.fn(async (p, o = {}) => { if (p.startsWith("memberships") && o.method === "PATCH") throw Object.assign(new Error('Supabase 403: {"code":"42501","details":null,"hint":null,"message":"party, team and state change only by an owner, never on your own row, and never while a review round is open"}'), { status: 403 }); return inner(p, o); });
    await expect(changeParty("demo", "u-view", { party: "lead_appointed" }, d)).rejects.toMatchObject({ status: 403, message: "party, team and state change only by an owner, never on your own row, and never while a review round is open" });
  });
  it("addMember: a lead cannot add the Client, before any e-mail lookup; an owner's add carries the party", async () => {
    const lead = withTeams({ sub: "u-lead", ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", office_key: "hq" })) });
    lead.rows.push({ project_id: "p1", user_id: "u-lead", role: "lead" });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer", party: "appointing" }, "w", lead)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/only an owner adds the Client/) });
    expect(lead.adminFetch).not.toHaveBeenCalled();
    const owner = withTeams({ sub: "u-owner", ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", office_key: "hq" })) });
    await expect(addMember("demo", { email: "known@x.com", role: "viewer", party: "appointing" }, "w", owner)).resolves.toMatchObject({ user_id: "u-new", party: "appointing", task_team: null });
    expect(owner.sb.mock.calls.find(([, o]) => o?.method === "POST")[1].body).toMatchObject({ party: "appointing", task_team: null, role: "viewer" });
  });
  it("F-R2a-5: an invited person's own session cannot find the project, so the first call accepts their live invitations and looks again", async () => {
    const d = withTeams({ sub: "u-view" });
    d.rows[1] = { project_id: "p1", user_id: "u-view", role: "viewer", party: "appointed", task_team: "ARC", state: "invited" };
    let seen = false;
    d.ensureProject = vi.fn(async () => { if (!seen) throw Object.assign(new Error("not found"), { status: 404 }); return { id: "p1", key: "demo" }; });
    const inner = d.sb;
    d.sb = vi.fn(async (p, o = {}) => {
      if (p.startsWith("invitations") && !o.method) return [{ project_id: "p1" }];
      if (p.startsWith("invitations") && o.method === "PATCH") return [{ id: "inv-1" }];
      if (p.startsWith("memberships") && o.method === "PATCH") { seen = true; d.rows[1].state = "active"; return null; }
      return inner(p, o);
    });
    await expect(myMembership("demo", d)).resolves.toEqual({ role: "viewer", party: "appointed", task_team: "ARC", state: "active" });
    const read = d.sb.mock.calls.find(([p, o]) => p.startsWith("invitations") && !o?.method);
    expect(read[0]).toMatch(/^invitations\?user_id=eq\.u-view&accepted_at=is\.null&revoked_at=is\.null&expires_at=gt\.[^&]+&select=project_id$/);
    expect(read[1].service).toBe(true);
    // No live invitation: the 404 stands, nothing is written.
    const e = withTeams({ sub: "u-x" });
    e.ensureProject = vi.fn(async () => { throw Object.assign(new Error("not found"), { status: 404 }); });
    const innerE = e.sb; e.sb = vi.fn(async (p, o = {}) => (p.startsWith("invitations") ? [] : innerE(p, o)));
    await expect(myMembership("demo", e)).rejects.toMatchObject({ status: 404 });
    expect(e.sb.mock.calls.filter(([, o]) => o?.method === "PATCH")).toHaveLength(0);
    await expect(acceptMyInvitations({ ...e, sub: null })).resolves.toBe(0);
  });
  it("myMembership answers the party fields; an invited row is flipped once (the live invitation accepted first, then the row, both service) and answered active", async () => {
    const d = withTeams({ sub: "u-view" });
    d.rows[1] = { project_id: "p1", user_id: "u-view", role: "viewer", party: "appointing", task_team: null, state: "invited" };
    const inner = d.sb; d.sb = vi.fn(async (p, o = {}) => (p.startsWith("invitations") && o.method === "PATCH" ? [{ id: "inv-1" }] : inner(p, o)));
    await expect(myMembership("demo", d)).resolves.toEqual({ role: "viewer", party: "appointing", task_team: null, state: "active" });
    const patches = d.sb.mock.calls.filter(([, o]) => o?.method === "PATCH");
    expect(patches.map(([p]) => p.replace(/expires_at=gt\.[^&]+/, "expires_at=gt.NOW"))).toEqual(["invitations?project_id=eq.p1&user_id=eq.u-view&accepted_at=is.null&revoked_at=is.null&expires_at=gt.NOW", "memberships?project_id=eq.p1&user_id=eq.u-view&state=eq.invited"]);
    expect(patches.every(([, o]) => o.service === true)).toBe(true);
    expect(patches[1][1].body).toEqual({ state: "active" });
    expect(d.audit).not.toHaveBeenCalled(); // member_joined is the trigger's row
    // An expired or revoked invitation (no row accepted): the person stays invited and counts as nobody (review finding 3).
    const e = withTeams({ sub: "u-view" });
    e.rows[1] = { project_id: "p1", user_id: "u-view", role: "viewer", party: null, task_team: null, state: "invited" };
    const innerE = e.sb; e.sb = vi.fn(async (p, o = {}) => (p.startsWith("invitations") && o.method === "PATCH" ? [] : innerE(p, o)));
    await expect(myMembership("demo", e)).resolves.toEqual({ role: null, party: null, task_team: null, state: "invited" });
    expect(e.sb.mock.calls.filter(([p, o]) => p.startsWith("memberships") && o?.method === "PATCH")).toHaveLength(0);
    await expect(myMembership("demo", withTeams({ sub: "u-stranger" }))).resolves.toEqual({ role: null, party: null, task_team: null, state: null });
    await expect(myMembership("demo", withTeams())).resolves.toMatchObject({ role: "service" });
  });
});
