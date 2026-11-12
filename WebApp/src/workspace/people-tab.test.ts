import { describe, it, expect, vi } from "vitest";
import { peopleTab, PEOPLE_FOR_MEMBERS } from "./people-tab";
import { fakeDocument, textOf } from "./fake-dom";

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (rows: unknown) => ({ ws: { get: vi.fn(async () => rows) }, st: { key: "snowdon" }, doc: fakeDocument() }) as any;

describe("peopleTab", () => {
  it("groups the members by party with role words and the invited tag", async () => {
    const root = peopleTab(ctx([
      { user_id: "1", email: "client@x", role: "viewer", party: "appointing", task_team: null, state: "active" },
      { user_id: "2", email: "arch@x", role: "owner", party: "lead_appointed", task_team: null, state: "active" },
      { user_id: "3", email: "str@x", role: "contributor", party: "appointed", task_team: "STR", state: "invited" },
      { user_id: "4", email: "nobody@x", role: "viewer", party: null, task_team: null, state: "active" }]));
    await flush();
    const t = textOf(root);
    for (const w of ["Client", "client@x", "Lead firm", "arch@x", "Firm · Team STR", "str@x", "Invited, not signed in yet", "No party yet", "nobody@x"]) expect(t).toContain(w);
    expect(t.indexOf("Client")).toBeLessThan(t.indexOf("Lead firm"));
    expect(t.indexOf("Lead firm")).toBeLessThan(t.indexOf("Firm · Team STR"));
  });
  it("a refused read says the list is for members", async () => {
    const root = peopleTab(ctx(null));
    await flush();
    expect(textOf(root)).toContain(PEOPLE_FOR_MEMBERS);
  });
});
