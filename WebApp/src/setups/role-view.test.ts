import { describe, it, expect } from "vitest";
import { ROLE_HIDES, hiddenTabs, hiddenIn } from "./role-view";

describe("UX slice 6: role hides what isn't yours (a view choice, never a deletion)", () => {
  it("a modeller and a reviewer hide their tabs; a BIM manager and the machine path hide nothing", () => {
    expect([...hiddenTabs("contributor", true, false)]).toEqual(ROLE_HIDES.contributor.map((h) => h.tab));
    expect(hiddenTabs("viewer", true, false).has("Documents ▸ Proposed changes")).toBe(true);
    for (const r of ["owner", "lead", "service"]) expect(hiddenTabs(r, true, false).size, r).toBe(0);
  });

  it("nothing is hidden when the role was not read, the caller is not a member or signed out", () => {
    for (const r of ["contributor", "viewer"]) expect(hiddenTabs(r, false, false).size, r).toBe(0);
    for (const r of ["not-member", "signed-out", ""]) expect(hiddenTabs(r, true, false).size, r).toBe(0);
  });

  it("Show all tools brings every tab back for every role", () => {
    for (const r of Object.keys(ROLE_HIDES)) expect(hiddenTabs(r, true, true).size, r).toBe(0);
  });

  it("every hidden tab has a reason", () => {
    for (const hs of Object.values(ROLE_HIDES)) for (const h of hs) expect(h.why.length, h.tab).toBeGreaterThan(10);
  });

  it("a tab group gets its own labels only, never a subgroup's", () => {
    const h = new Set(["Documents ▸ Proposed changes", "Documents ▸ Reports ▸ Tender", "Settings ▸ Project"]);
    expect(hiddenIn(h, "Documents")).toEqual(["Proposed changes"]);
    expect(hiddenIn(h, "Documents ▸ Reports")).toEqual(["Tender"]);
    expect(hiddenIn(h, "Settings ▸ Advanced")).toEqual([]);
  });
});
