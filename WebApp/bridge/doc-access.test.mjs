import { describe, it, expect, vi } from "vitest";
const requireMinRole = vi.fn(async () => "lead");
vi.mock("./members-store.mjs", () => ({ requireMinRole: (...a) => requireMinRole(...a) }));
const { requireDocAccess, LEVEL_ROLE } = await import("./doc-access.mjs");

describe("requireDocAccess", () => {
  it("maps each level to its project role", async () => {
    expect(LEVEL_ROLE).toEqual({ read: "viewer", comment: "viewer", edit: "contributor", govern: "lead" });
    for (const [level, role] of Object.entries(LEVEL_ROLE)) {
      requireMinRole.mockClear();
      await expect(requireDocAccess("k", { id: "d" }, level)).resolves.toBe("lead");
      expect(requireMinRole).toHaveBeenCalledWith("k", role);
    }
  });
  it("works without a document (a create)", async () => { await requireDocAccess("k", null, "edit"); expect(requireMinRole).toHaveBeenLastCalledWith("k", "contributor"); });
  it("an unknown level is a programming error", async () =>
    expect(requireDocAccess("k", null, "own")).rejects.toMatchObject({ status: 500, message: "unknown access level 'own'" }));
});

const { effectiveLevel, validateAccess } = await import("./doc-access.mjs");
const deps = ({ role, sub, team = null }) => ({ myMembership: async () => ({ role, task_team: team }), currentSub: () => sub, requireMinRole });
describe("effectiveLevel (R2c)", () => {
  it("no override: viewer comments, contributor edits, lead governs", () => {
    expect(effectiveLevel("viewer", {}, "u1", null)).toBe("comment");
    expect(effectiveLevel("contributor", {}, "u1", null)).toBe("edit");
    expect(effectiveLevel("lead", { members: { u1: "read" } }, "u1", null)).toBe("govern");
    expect(effectiveLevel("owner", { members: { u1: "read" } }, "u1", null)).toBe("govern");
  });
  it("a member entry beats a team entry; an override can raise a viewer to edit and lower a contributor to read", () => {
    const a = { members: { u1: "edit", u2: "read" }, teams: { ARC: "comment" } };
    expect(effectiveLevel("viewer", a, "u1", "ARC")).toBe("edit");
    expect(effectiveLevel("contributor", a, "u2", "ARC")).toBe("read");
    expect(effectiveLevel("contributor", a, "u3", "arc")).toBe("comment"); // team codes compare case-insensitively
  });
  it("an unknown level, a stray key or a prototype name grants nothing", () => {
    expect(effectiveLevel("viewer", { members: { u1: "govern" } }, "u1", null)).toBe("comment");
    expect(effectiveLevel("viewer", { members: {} }, "constructor", null)).toBe("comment");
    expect(effectiveLevel("viewer", { members: { u1: "edit" } }, "u2", null)).toBe("comment"); // never grants to someone else
  });
});
describe("requireDocAccess with an override (R2c)", () => {
  const lowered = { access: { members: { u2: "read" } } };
  it("reads never go below the viewer right", async () => {
    await expect(requireDocAccess("p", lowered, "read", deps({ role: "contributor", sub: "u2" }))).resolves.toBe("contributor");
  });
  it("a lowered contributor is refused an edit and a comment... in words", async () => {
    await expect(requireDocAccess("p", lowered, "edit", deps({ role: "contributor", sub: "u2" })))
      .rejects.toMatchObject({ status: 403, message: "On this document you can read, not edit. A lead sets document access in the workspace, People." });
    await expect(requireDocAccess("p", lowered, "comment", deps({ role: "contributor", sub: "u2" })))
      .rejects.toMatchObject({ status: 403, message: "On this document you can read, not comment. A lead sets document access in the workspace, People." });
  });
  it("a raised viewer edits; a team override reaches the team's members", async () => {
    await expect(requireDocAccess("p", { access: { members: { u1: "edit" } } }, "edit", deps({ role: "viewer", sub: "u1" }))).resolves.toBe("viewer");
    await expect(requireDocAccess("p", { access: { teams: { ARC: "edit" } } }, "edit", deps({ role: "viewer", sub: "u9", team: "arc" }))).resolves.toBe("viewer");
  });
  it("a viewer left at comment is refused an edit with the 'comment' words", async () =>
    expect(requireDocAccess("p", { access: { members: { zz: "read" } } }, "edit", deps({ role: "viewer", sub: "u1" })))
      .rejects.toMatchObject({ message: "On this document you can comment, not edit. A lead sets document access in the workspace, People." }));
  it("a lead is never locked out; govern ignores overrides", async () => {
    await expect(requireDocAccess("p", { access: { members: { u3: "read" } } }, "edit", deps({ role: "lead", sub: "u3" }))).resolves.toBe("lead");
    requireMinRole.mockClear();
    await requireDocAccess("p", lowered, "govern", deps({ role: "contributor", sub: "u2" }));
    expect(requireMinRole).toHaveBeenCalledWith("p", "lead");
  });
  it("the machine credential and a create (doc null) keep the project-role rule", async () => {
    await expect(requireDocAccess("p", lowered, "edit", deps({ role: "service", sub: null }))).resolves.toBe("service");
    requireMinRole.mockClear();
    await requireDocAccess("p", null, "edit", deps({ role: "contributor", sub: "u2" }));
    expect(requireMinRole).toHaveBeenCalledWith("p", "contributor");
  });
});
describe("validateAccess", () => {
  const members = [{ user_id: "u1", role: "viewer" }, { user_id: "u2", role: "contributor" }, { user_id: "l1", role: "lead" }];
  it("keeps members and teams, with the team's declared case", () =>
    expect(validateAccess({ members: { u1: "edit" }, teams: { arc: "read" } }, members, ["ARC"])).toEqual({ members: { u1: "edit" }, teams: { ARC: "read" } }));
  it("refuses an unknown level, a non-member, an undeclared team and a lead, in words", () => {
    expect(() => validateAccess({ members: { u1: "own" } }, members, [])).toThrow(/can read, can comment or can edit/);
    expect(() => validateAccess({ members: { ghost: "read" } }, members, [])).toThrow(/not a member of the project/);
    expect(() => validateAccess({ teams: { MEP: "read" } }, members, ["ARC"])).toThrow(/MEP is not a task team/);
    expect(() => validateAccess({ members: { l1: "read" } }, members, [])).toThrow(/Leads and owners govern every document/);
    expect(() => validateAccess([], members, [])).toThrow(/document access/);
  });
  it("an empty body clears the overrides", () => expect(validateAccess({}, members, [])).toEqual({ members: {}, teams: {} }));
});
