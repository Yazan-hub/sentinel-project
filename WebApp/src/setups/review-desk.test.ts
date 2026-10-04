// MA-3a: the review desk groups what waits in Revit by storey and by what it does, says each web decision in words (a decline binds,
// an accept is advice), never sends a decline without a reason, and lets only a signed-in person decide (a lead re-open). The
// Modeling studio is retired: the desk takes its tab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));
vi.mock("./active-project", () => ({ activePid: () => "demo", onActiveProjectChange: () => () => {} }));

import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset } from "./review-desk";

const fx = JSON.parse(readFileSync(new URL("../../bridge/fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
const after = fx.after as PendingChangeset;
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const part = (name: string, created_at: string, kind = "wall", op = "retype"): PendingChangeset =>
  ({ ...after, id: name, name, created_at, elements: [{ ...after.elements[2], proposal_guid: name + "-g", kind, op }] });

describe("groupDesk — by storey, then by what the ghosts do", () => {
  it("a Promote storey's parts (i/n) are one storey; groups are per op and kind; storeys oldest first", () => {
    expect(storeyOf("Promote (DD) · GR-FFL (2/3)")).toBe("Promote (DD) · GR-FFL");
    expect(storeyOf("Promote (DD) · GR-FFL")).toBe("Promote (DD) · GR-FFL");
    expect(storeyOf("Core walls (a) (1/x)")).toBe("Core walls (a) (1/x)");
    const desk = groupDesk([part("Promote (DD) · 01-FFL", "2026-10-04T08:05:00Z"), part("Promote (DD) · GR-FFL (2/2)", "2026-10-04T08:01:00Z", "wall", "attach"),
      part("Promote (DD) · GR-FFL (1/2)", "2026-10-04T08:00:00Z")]);
    expect(desk.map((s) => [s.storey, s.changesets.map((c) => c.name), s.groups.map((g) => [g.what, g.ghosts.length])])).toEqual([
      ["Promote (DD) · GR-FFL", ["Promote (DD) · GR-FFL (1/2)", "Promote (DD) · GR-FFL (2/2)"], [["retype wall", 1], ["attach wall", 1]]],
      ["Promote (DD) · 01-FFL", ["Promote (DD) · 01-FFL"], [["retype wall", 1]]],
    ]);
    expect(groupDesk([after])[0].groups.map((g) => [g.what, g.ghosts.length])).toEqual([["retype wall", 2], ["attach wall", 1], ["set_parameter wall", 1]]);
  });
});

describe("words", () => {
  it("each ghost as Revit's row says it, shortened", () => {
    const [g1, g2, , g4] = after.elements;
    expect(ghostLine(g1)).toBe("W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm");
    expect(ghostLine(g2)).toBe("W 1 · GR-FFL → top 01-FFL");
    expect(ghostLine(g4)).toBe('Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)');
    expect(ghostLine({ proposal_guid: "x", kind: "floor", place: { TypeName: "Generic 150mm", LevelName: "L1" } })).toBe("x · Generic 150mm · L1");
  });

  it("a decline binds, an accept is advice, a re-open is said; nobody decided is waiting", () => {
    const [g1, g2, g3] = after.elements;
    expect(reviewWords(g1)).toBe("declined by reviewer@example.com (contributor): wrong type: W 1 is a party wall — binds: Revit shows it unticked and refuses the tick");
    expect(reviewWords(g2)).toBe("accepted by reviewer@example.com (contributor) — advice: Revit still asks for the tick");
    expect(reviewWords(g3)).toBe("waiting — nobody decided on the web");
    expect(reviewWords({ ...g1, review: fx.reopened_review })).toBe("re-opened by lead@example.com (lead): party wall confirmed external by the client");
  });

  it("only a signed-in contributor or above decides, only a lead or owner re-opens; the machine credential never", () => {
    expect(["owner", "lead", "contributor"].every(canDecide) && !canDecide("viewer") && !canDecide("service")).toBe(true);
    expect(canReopen("lead") && canReopen("owner") && !canReopen("contributor") && !canReopen("service")).toBe(true);
    expect(rowWords({ ledger: { id: 1201, hash: "ab" } })).toBe("ledger #1201");
    expect(rowWords({ ledger: null })).toBe("the bridge named no ledger row");
  });

  it("one post per changeset; a ghost already in the decision's state is not sent, and counted (C6: a repeat would refuse the whole post)", () => {
    const [, g2, g3] = after.elements;
    const ticked = new Map([[g2.proposal_guid, { cs: after, el: g2 }], [g3.proposal_guid, { cs: after, el: g3 }]]);
    const a = postsFor(ticked, "accept");
    expect([[...a.posts], a.already]).toEqual([[["cs-ma3a", ["g-3"]]], 1]);
    const d = postsFor(ticked, "decline");
    expect([[...d.posts], d.already]).toEqual([[["cs-ma3a", ["g-2", "g-3"]]], 0]);
  });
});

describe("the bridge calls", () => {
  beforeEach(() => { bfetch.mockReset(); bwrite.mockReset(); });

  it("readPending asks for the proposed changesets; a failure is 'not read — …', never an empty list", async () => {
    bfetch.mockResolvedValueOnce(res(200, [after]));
    expect(await readPending("http://b/", "demo key")).toEqual([after]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/changesets/demo%20key?status=proposed");
    bfetch.mockResolvedValueOnce(res(403, { message: "not a member" }));
    await expect(readPending("http://b", "demo")).rejects.toThrow("not read — not a member");
    bfetch.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(readPending("http://b", "demo")).rejects.toThrow("not read — Failed to fetch");
  });

  it("postReview sends one decisions[] for the ticked ghosts; a decline without a reason is never sent", async () => {
    await expect(postReview("http://b", "demo", "cs-ma3a", "decline", ["g-1"], "  ")).rejects.toThrow("a decline needs a reason — the ledger records it and Revit shows it");
    await expect(postReview("http://b", "demo", "cs-ma3a", "accept", [], "")).rejects.toThrow("tick a ghost first");
    expect(bwrite).not.toHaveBeenCalled();
    bwrite.mockResolvedValueOnce({ ledger: { id: 9, hash: "h" } });
    await postReview("http://b", "demo", "cs-ma3a", "decline", ["g-1", "g-4"], " wrong type ");
    expect(bwrite.mock.calls[0][0]).toBe("http://b/changesets/demo/cs-ma3a/review");
    expect(JSON.parse(bwrite.mock.calls[0][1].body)).toEqual({ decisions: [{ proposal_guid: "g-1", decision: "decline", reason: "wrong type" }, { proposal_guid: "g-4", decision: "decline", reason: "wrong type" }] });
    bwrite.mockResolvedValueOnce({ ledger: null });
    await postReview("http://b", "demo", "cs-ma3a", "accept", ["g-2"], "");
    expect(JSON.parse(bwrite.mock.calls[1][1].body)).toEqual({ decisions: [{ proposal_guid: "g-2", decision: "accept" }] });
  });

  it("postReopen needs a reason and names the ghost", async () => {
    await expect(postReopen("http://b", "demo", "cs-ma3a", "g-1", "")).rejects.toThrow("a re-open needs a reason — the ledger records it");
    bwrite.mockResolvedValueOnce({ ledger: { id: 10, hash: "h" } });
    await postReopen("http://b", "demo", "cs-ma3a", "g-1", "confirmed external");
    expect(bwrite.mock.calls[0][0]).toBe("http://b/changesets/demo/cs-ma3a/reopen");
    expect(JSON.parse(bwrite.mock.calls[0][1].body)).toEqual({ proposal_guid: "g-1", reason: "confirmed external" });
  });
});

describe("the Modeling studio is retired; the desk takes its tab (source scan)", () => {
  it("main.ts mounts the review desk where the Model tab was, and model-panel.ts is gone", () => {
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(main).toContain('import { reviewDeskPanel } from "./setups/review-desk";');
    expect(main).toContain("const reviewEl = reviewDeskPanel({ baseUrl: SERVICE_URL });");
    expect(main).toContain('{ label: "Review", el: reviewEl },');
    expect(main).not.toContain("model-panel");
    expect(main).not.toContain('label: "Model"');
    expect(existsSync(new URL("./model-panel.ts", import.meta.url))).toBe(false);
  });
});
