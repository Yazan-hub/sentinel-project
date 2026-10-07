import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
import { myRoleRead, roleWords, canEditRole, canGovernRole, canDeleteProjectRole, NOT_MEMBER, SIGNED_OUT } from "./my-role";

const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body }) as Response;

describe("myRoleRead (W-2 G7): a non-member is not told 'your role: viewer'", () => {
  beforeEach(() => bfetch.mockReset());
  const read = async (r: Response | Error) => {
    if (r instanceof Error) bfetch.mockRejectedValue(r); else bfetch.mockResolvedValue(r);
    return myRoleRead("http://b", "demo");
  };

  it("a member's role is read and said", async () => {
    const r = await read(res(200, { role: "lead" }));
    expect(r).toEqual({ role: "lead", read: true });
    expect(roleWords(r)).toBe("your role: lead");
  });
  it("a 404 is not a member — read-only, in its own words", async () => {
    const r = await read(res(404, { message: "not found" }));
    expect(r).toEqual({ role: NOT_MEMBER, read: true });
    expect(roleWords(r)).toBe("not a member of this project — read-only");
    expect(canEditRole(r.role) || canGovernRole(r.role)).toBe(false);
  });
  it("a 401 is signed out — read-only", async () => {
    const r = await read(res(401));
    expect(r).toEqual({ role: SIGNED_OUT, read: true });
    expect(roleWords(r)).toBe("signed out — read-only");
    expect(canEditRole(r.role)).toBe(false);
  });
  it("a 5xx or no bridge is 'role not read'; another 4xx is a viewer", async () => {
    expect(roleWords(await read(res(503)))).toBe("role not read — read-only");
    expect(roleWords(await read(new Error("down")))).toBe("role not read — read-only");
    expect(await read(res(403))).toEqual({ role: "viewer", read: true });
  });
});

describe("canDeleteProjectRole (W-2 G4): deleting a project is the owner's", () => {
  it("an owner and the machine may; a lead and below may not", () => {
    expect(["owner", "service"].map(canDeleteProjectRole)).toEqual([true, true]);
    expect(["lead", "contributor", "viewer", NOT_MEMBER].map(canDeleteProjectRole)).toEqual([false, false, false, false]);
  });
});
