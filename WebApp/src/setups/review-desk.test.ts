// MA-3a: the review desk groups what waits in Revit by storey and by what it does, says each web decision in words (a decline binds,
// an accept is advice), never sends a decline without a reason, and lets only a signed-in person decide (a lead re-open). The
// Modeling studio is retired: the desk takes its tab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));
vi.mock("./active-project", () => ({ activePid: () => "demo", onActiveProjectChange: () => () => {} }));

import { storeyOf, groupDesk, ghostLine, reviewWords, declinedBy, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
  readDecided, readLedger, decidedView, decidedCount, DECIDED_MAX, type LedgerRows } from "./review-desk";

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

describe("recently decided in Revit (MA-3b2b)", () => {
  const rr = fx.revit_reasons;
  const reported = (id: string, status: string, reported_at: string): PendingChangeset => ({
    ...after, id, status,
    result: {
      applied: rr.result.applied, rejected: rr.result.rejected, note: rr.result.note, reported_at, reported_by: "modeller@example.com",
      declined_on_web: [
        { proposal_guid: "g-1", by: "reviewer@example.com", role: "contributor", reason: "wrong type: W 1 is a party wall" },
        { proposal_guid: "g-4", by: "reviewer@example.com", role: "contributor", reason: "no fire strategy issued yet" },
      ],
      reasons: rr.stored,
    },
  });
  const A = "0b0f6c1e-8a59-4d0a-9d6e-3f1f2a6c7e11", B = "7c2d9a40-11aa-4e0b-8a77-5d3e9f0c2b22";
  const cs = reported(A, "partially_applied", "2026-10-04T13:44:10.123Z");
  const row = (n: number): LedgerRows => ({ row: n, reverted: null });
  beforeEach(() => { bfetch.mockReset(); });

  it("a reported changeset in words: who, when, the counts, the ledger row, the note, and each ghost not applied with Revit's reason and the web's", () => {
    const v = decidedView(cs, row(1811));
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by modeller@example.com · 2026-10-04 13:44 UTC · 1 applied, 3 not applied · ledger #1811");
    expect(v.note).toBe("GR-FFL reviewed in Revit");
    expect(v.declined).toEqual([
      { line: "W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: a party wall, as the web desk said", "web, reviewer@example.com (contributor): wrong type: W 1 is a party wall"] },
      { line: "W 2 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: W 2 is demolished in the next package"] },
      { line: 'Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)', why: ["web, reviewer@example.com (contributor): no fire strategy issued yet"] },
    ]);
  });

  it("claimed vs verified: a ledger row that was not found or not read is said, never a made-up id; a ghost with no reason says so", () => {
    expect(decidedView(cs, null).head).toMatch(/ · no ledger row found for it$/);
    expect(decidedView(cs, new Error("not read — HTTP 500")).head).toMatch(/ · ledger row not read — HTTP 500$/);
    const bare = decidedView({ ...cs, status: "declined", result: { ...cs.result!, applied: [], rejected: ["g-2", "constructor"], note: null, reported_at: "", declined_on_web: undefined, reasons: undefined } }, row(7));
    expect(bare.head).toBe("Promote (DD) · GR-FFL — declined in Revit by modeller@example.com · an unknown time · 0 applied, 2 not applied · ledger #7");
    expect(bare.note).toBeNull();
    expect(bare.declined).toEqual([{ line: "W 1 · GR-FFL → top 01-FFL", why: ["no reason given for this ghost"] }, { line: "constructor", why: ["no reason given for this ghost"] }]);
  });

  it("review C3: a report undone in Revit says so, with the ledger row that says it — never 'applied' alone", () => {
    const done = { ...cs, status: "applied" };
    expect(decidedView(done, { row: 1813, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · ledger #1813 · undone in Revit after the report \(ledger #1814\)$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1816, op: "redo" } }).head).toMatch(/ · ledger #1813 · undone, then redone in Revit \(ledger #1816\)$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1817, op: "" } }).head).toMatch(/ · ledger #1813 · a changeset_reverted row follows the report \(ledger #1817\)$/);
    expect(decidedView(done, { row: null, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · no ledger row found for it · undone in Revit after the report \(ledger #1814\)$/);
  });

  it("review C4: an old or hand-written result (no lists, no reporter) is still said — the view never throws", () => {
    const v = decidedView({ ...cs, result: { note: null } as never }, null);
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by an unknown account · an unknown time · 0 applied, 0 not applied · no ledger row found for it");
    expect(v.note).toBeNull();
    expect(v.declined).toEqual([]);
  });

  it("C13: a reason is text — markup typed in Revit comes back as the same characters, for textContent", () => {
    const v = decidedView({ ...cs, result: { ...cs.result!, reasons: { "g-3": '<b onclick="x()">not this</b>' } } }, row(1));
    expect(v.declined[1].why).toEqual(['Revit: <b onclick="x()">not this</b>']);
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it("the heading says how many reports are shown", () => {
    expect(DECIDED_MAX).toBe(10);
    expect(decidedCount(3)).toBe("3 report(s), newest first.");
    expect(decidedCount(14)).toBe("The newest 10 of 14 reports — the older ones are on the ledger.");
  });

  it("readDecided reads every changeset and keeps the reported ones, newest report first; a failure is 'not read — …'", async () => {
    const older = reported(B, "declined", "2026-10-04T09:00:00.000Z");
    bfetch.mockResolvedValueOnce(res(200, [after, older, { ...after, id: "w", status: "withdrawn" }, cs]));
    expect((await readDecided("http://b/", "demo")).map((c) => c.id)).toEqual([A, B]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/changesets/demo");
    bfetch.mockResolvedValueOnce(res(403, { message: "not a member" }));
    await expect(readDecided("http://b", "demo")).rejects.toThrow("not read — not a member");
  });

  it("readLedger asks the ledger for the reports' rows by changeset id — the report's row and the newest Undo or Redo after it (C3); none asked is no read; a failure is 'not read — …'", async () => {
    expect((await readLedger("http://b", "demo", [])).size).toBe(0);
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValueOnce(res(200, { rows: [
      { id: 1816, entity_id: B, action: "changeset_reverted", new_value: { op: "redo", guids: ["g-2"], count: 1 } },
      { id: 1814, entity_id: B, action: "changeset_reverted", new_value: { op: "undo", guids: ["g-2"], count: 1 } },
      { id: 1813, entity_id: B, action: "changeset_applied" }, { id: 1811, entity_id: A, action: "changeset_applied" },
      { id: 1805, entity_id: A, action: "changeset_reviewed" }, { id: 1800, entity_id: A, action: "changeset_proposed" }], total: 6 }));
    expect([...(await readLedger("http://b/", "demo key", [A, B]))]).toEqual([[B, { row: 1813, reverted: { id: 1816, op: "redo" } }], [A, { row: 1811, reverted: null }]]);
    expect(bfetch.mock.calls[0][0]).toBe(`http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=changeset_&entity_id=${A},${B}&limit=1000`);
    bfetch.mockResolvedValueOnce(res(200, { rows: [{ id: 1811, entity_id: A, action: "changeset_applied" }], total: 1200 }));
    await expect(readLedger("http://b", "demo", [A])).rejects.toThrow("not read — the ledger holds more rows for these reports (1200) than one read returns");
    bfetch.mockResolvedValueOnce(res(400, { message: "entity_id must be a uuid or a comma list of uuids" }));
    await expect(readLedger("http://b", "demo", ["x"])).rejects.toThrow("not read — entity_id must be a uuid or a comma list of uuids");
    bfetch.mockResolvedValueOnce(res(200, { total: 0 }));
    await expect(readLedger("http://b", "demo", [A])).rejects.toThrow("not read — the bridge answered without rows");
  });

  it("the desk reads the decided list beside the proposed one, Refresh re-reads both, and the section shows when nothing waits (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);");
    // Review C4: the section is built once, and a throw in it is said — it never takes the proposed list with it.
    expect(src).toContain('try { tail = recent(decided, ledger); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); }');
    expect(src).toContain('if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), tail); return; }');
    expect(src).toContain('if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), tail); return; }');
    expect(src).toContain("    body.append(tail);");
    expect(src.split("recent(decided, ledger)").length - 1).toBe(1);
    expect(src.split(/\btail\b/).length - 1).toBe(6); // declared, set twice, shown in each of the desk's three endings
  });
});

describe("↻ Refresh re-reads the desk without reloading the site (source scan: no DOM here)", () => {
  it("every role gets the button, and it calls the desk's own read", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain('el("span", roleWords(role), "color:#8b93a1"), btn("↻ Refresh", () => void show()));');
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
describe("MA-3b3 — a carried decline on the desk", () => {
  const c3 = JSON.parse(readFileSync(new URL("../../bridge/fixtures/changeset-ops/ma3b3-carry.json", import.meta.url), "utf8"));
  const carried = c3.changeset as PendingChangeset;

  it("says where the decline was made, by whom, in which changeset, and that the bridge carried it; it binds as any decline", () => {
    const [n1, n2, n3] = carried.elements;
    expect(reviewWords(n1)).toBe('declined on the web by reviewer@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: wrong type: W 1 is a party wall — binds: Revit shows it unticked and refuses the tick');
    expect(reviewWords(n2)).toBe('declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: W 2 is demolished in the next package — binds: Revit shows it unticked and refuses the tick');
    expect(reviewWords(n3)).toBe("waiting — nobody decided on the web");
    expect(declinedBy({ by: "x", role: null, carried_from: { changeset: "c", name: "N", proposal_guid: "g", origin: "a script" } })).toBe('declined before by x in "N", carried here by the bridge');
    expect(declinedBy(after.elements[0].review!)).toBe("declined by reviewer@example.com (contributor)");
  });

  it("Recently decided: a carried decline the report rejected is said with its origin, never as the web's", () => {
    const r = carried.elements[1].review!;
    const v = decidedView({ ...carried, status: "declined", result: { applied: [], rejected: ["n-2"], note: "x", reported_at: "2026-10-04T14:00:00.000Z", reported_by: "modeller@example.com",
      declined_on_web: [{ proposal_guid: "n-2", by: r.by, role: r.role, reason: r.reason!, carried_from: r.carried_from }] } }, null);
    expect(v.declined[0].why).toEqual(['declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL", carried here by the bridge: W 2 is demolished in the next package']);
  });

  it("the desk's intro says a decline is carried (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.");
    expect(src).not.toContain("a new Promote run proposes a declined ghost again, undecided");
  });
});
