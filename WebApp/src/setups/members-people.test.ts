import { describe, it, expect } from "vitest";
import { partyWord, canEditParty, invitableParties, inviteProblem, groupByParty, dayOf, NO_PARTY } from "./members-people";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = (user_id: string, role: string, party: any, task_team: string | null = null, state: "invited" | "active" = "active") => ({ user_id, email: `${user_id}@x`, role, party, task_team, state });

describe("members-people", () => {
  it("says parties in plain words", () => {
    expect(partyWord("appointing")).toBe("Client");
    expect(partyWord("lead_appointed")).toBe("Lead firm");
    expect(partyWord("appointed", "ARC")).toBe("Firm · Team ARC");
    expect(partyWord(null)).toBe(NO_PARTY);
  });
  it("party edits are an owner's, never on their own row; a lead invites no Client", () => {
    expect(canEditParty("owner", "u2", "u1")).toBe(true);
    expect(canEditParty("owner", "u1", "u1")).toBe(false);
    expect(canEditParty("lead", "u2", "u1")).toBe(false);
    expect(invitableParties("lead")).toEqual(["lead_appointed", "appointed"]);
    expect(invitableParties("owner")).toEqual(["appointing", "lead_appointed", "appointed"]);
  });
  it("names the first thing wrong with an invite, null when it can go", () => {
    const ok = { email: "a@b.co", role: "viewer", party: "appointed" as const, task_team: "ARC" };
    expect(inviteProblem({ ...ok, email: "nope" }, "owner", ["viewer"])).toBe("Type the person's e-mail.");
    expect(inviteProblem({ ...ok, role: "owner" }, "lead", ["lead", "contributor", "viewer"])).toBe("You can invite as lead, contributor, viewer only.");
    expect(inviteProblem({ ...ok, party: "appointing" }, "lead", ["viewer"])).toBe("Only an owner invites the Client.");
    expect(inviteProblem({ ...ok, task_team: " " }, "owner", ["viewer"])).toBe("A Firm member belongs to a task team — pick one.");
    expect(inviteProblem(ok, "owner", ["viewer"])).toBeNull();
    expect(inviteProblem({ ...ok, party: "" }, "lead", ["viewer"])).toBeNull();
  });
  it("groups Client, Lead firm, each Firm by team, then No party yet", () => {
    const g = groupByParty([m("a", "viewer", null), m("b", "viewer", "appointed", "STR"), m("c", "owner", "lead_appointed"), m("d", "viewer", "appointing"), m("e", "contributor", "appointed", "ARC")]);
    expect(g.map((x) => [x.title, x.members.map((y) => y.user_id)])).toEqual([["Client", ["d"]], ["Lead firm", ["c"]], ["Firm · Team ARC", ["e"]], ["Firm · Team STR", ["b"]], [NO_PARTY, ["a"]]]);
  });
  it("prints a day", () => {
    expect(dayOf("2026-11-26T10:00:00Z")).toMatch(/26 Nov 2026/);
    expect(dayOf("junk")).toBe("junk");
  });
});
