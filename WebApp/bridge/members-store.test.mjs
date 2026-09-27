import { describe, it, expect, vi } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";
import { ROLES, ROLE_RANK, listMembers, listMemberRows, addMember, changeRole, removeMember, myRole, requireMinRole, requireSpend, canUseCloudAi } from "./members-store.mjs";

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
      { user_id: "u-owner", role: "owner", email: "owner@x.com" },
      { user_id: "u-view", role: "viewer", email: "view@x.com" },
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
    expect(deps.sb).toHaveBeenCalledWith("memberships?project_id=eq.p1&select=user_id,role", { service: true });
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
    await expect(requireMinRole("demo", "lead", baseDeps())).resolves.toBeUndefined();
  });

  it("a signed-in member gets their row's role; a non-member gets null", async () => {
    const deps = baseDeps({ sub: "u-view" });
    expect(await myRole("demo", deps)).toBe("viewer");
    expect(await myRole("demo", baseDeps({ sub: "u-stranger" }))).toBeNull();
  });

  it("requireMinRole 403s below the bar, naming the requirement", async () => {
    await expect(requireMinRole("demo", "lead", baseDeps({ sub: "u-view" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead/) });
    await expect(requireMinRole("demo", "contributor", baseDeps({ sub: "u-owner" }))).resolves.toBeUndefined();
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
});
