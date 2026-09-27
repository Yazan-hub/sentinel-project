// D3 (H0, migration 0033): who may make an office and who may attach a project to one — the bridge's half, asked
// before anything is written so the answer comes in words. The database's half is 0033's projects_office_guard, which
// refuses a direct PostgREST write in the same words (pinned in migration-0033.test.mjs).
import { describe, it, expect, vi } from "vitest";
import { isPlatformAdmin, requireOfficeLead } from "./members-store.mjs";

const ATTACH = "attaching a project to an office needs the lead role on that office — nothing was saved";
const OFFICE_ID = "o-1";

// sub: undefined = the machine credential (no JWT); a string = that signed-in user. admin: what is_platform_admin()
// answers under their JWT; rpc: a function that replaces the answer (to throw, or to return something odd).
const deps = ({ sub, admin = false, rpc } = {}) => ({
  sub,
  sb: vi.fn(async (path) => {
    if (path === "rpc/is_platform_admin") return rpc ? rpc() : admin;
    if (path === "projects?key=eq.office-a&select=id") return [{ id: OFFICE_ID }];
    if (path.startsWith("projects?key=eq.")) return [];
    if (path === `memberships?project_id=eq.${OFFICE_ID}&select=user_id,role`)
      return [
        { user_id: "u-owner", role: "owner" }, { user_id: "u-lead", role: "lead" },
        { user_id: "u-con", role: "contributor" }, { user_id: "u-view", role: "viewer" },
      ];
    return [];
  }),
  ensureProject: vi.fn(async () => { throw new Error("the office question must not go through ensureProject"); }),
});
const rpcCalls = (d) => d.sb.mock.calls.filter(([p]) => p === "rpc/is_platform_admin");

describe("isPlatformAdmin — a question that never fails open", () => {
  it("the machine credential is one, and nothing is asked", async () => {
    const d = deps();
    expect(await isPlatformAdmin(d)).toBe(true);
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a signed-in caller is one only when is_platform_admin() answers true under their own session", async () => {
    const yes = deps({ sub: "u-adm", admin: true });
    expect(await isPlatformAdmin(yes)).toBe(true);
    expect(rpcCalls(yes)).toEqual([["rpc/is_platform_admin", { method: "POST", body: {} }]]); // no service: the caller's JWT
    expect(await isPlatformAdmin(deps({ sub: "u-x", admin: false }))).toBe(false);
  });

  it("no function yet (0033 not applied), PostgREST down or an answer that is not true is no", async () => {
    const missing = () => { throw Object.assign(new Error('Supabase 404: {"code":"PGRST202"}'), { status: 404 }); };
    expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: missing }))).toBe(false);
    expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: () => { throw new Error("fetch failed"); } }))).toBe(false);
    for (const odd of ["true", [true], { is_platform_admin: true }, null, 1])
      expect(await isPlatformAdmin(deps({ sub: "u-x", rpc: () => odd }))).toBe(false);
  });
});

describe("requireOfficeLead — attaching a project to an office", () => {
  it("the machine credential attaches anywhere, asking nothing", async () => {
    const d = deps();
    await expect(requireOfficeLead("office-a", d)).resolves.toBeUndefined();
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a lead or owner of the office attaches, without the admin question", async () => {
    for (const sub of ["u-lead", "u-owner"]) {
      const d = deps({ sub });
      await expect(requireOfficeLead("office-a", d)).resolves.toBeUndefined();
      expect(rpcCalls(d)).toEqual([]);
    }
  });

  it("a contributor, a viewer and a stranger of the office get a 403 in words", async () => {
    for (const sub of ["u-con", "u-view", "u-stranger"])
      await expect(requireOfficeLead("office-a", deps({ sub }))).rejects.toMatchObject({ status: 403, message: ATTACH });
  });

  it("an office that does not exist gets the same words — the answer is no office-key oracle", async () => {
    const d = deps({ sub: "u-lead" });
    await expect(requireOfficeLead("no-such-office", d)).rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(d.ensureProject).not.toHaveBeenCalled();
  });

  it("a platform admin who is no member of the office attaches", async () => {
    await expect(requireOfficeLead("office-a", deps({ sub: "u-adm", admin: true }))).resolves.toBeUndefined();
  });
});
