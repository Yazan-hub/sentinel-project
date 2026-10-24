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
