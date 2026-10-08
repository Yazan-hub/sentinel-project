// MA-3a: the review desk groups what waits in Revit by storey and by what it does, says each web decision in words (a decline binds,
// an accept is advice), never sends a decline without a reason, and lets only a signed-in person decide (a lead re-open). The
// Modeling studio is retired: the desk takes its tab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));
vi.mock("./active-project", () => ({ activePid: () => "demo", onActiveProjectChange: () => () => {} }));

import { proposalWords, storeyOf, groupDesk, ghostLine, reviewWords, declinedBy, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
  trustWords, sourceWords,
  readDecided, readLedger, highlightPlan, type Ghost, decidedView, decidedCount, DECIDED_MAX, type LedgerRows } from "./review-desk";

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
    // C16: a role the desk was not given is left out, never printed as "(null)" — for an accept and a re-open as for a decline (E10).
    expect(reviewWords({ ...g2, review: { ...g2.review!, role: null } })).toBe("accepted by reviewer@example.com — advice: Revit still asks for the tick");
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
    expect(main).toContain("const reviewEl = reviewDeskPanel({ baseUrl: SERVICE_URL, components });");
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

describe("MA-3d — Highlight in 3D: the plan and its words", () => {
  const g = (guid: string | null, op = "retype"): Ghost => ({ proposal_guid: "p" + guid + op, kind: "wall", op, target: guid ? { ifc_guid: guid } : null });
  const three = [g("A"), g("B"), g(null, "create")];
  it("one found, one not: the Revit-may-be-newer words", () => {
    const r = highlightPlan(three, new Map([["Tower@P03", [7, null]]]));
    expect(r.map).toEqual({ "Tower@P03": new Set([7]) });
    expect(r.words).toBe("Highlighted 1 of 2 element(s) in Tower@P03 — 1 not in them: the loaded version may be older than Revit's model (Revit may be newer).");
  });
  it("two models, the second holding B", () => {
    const r = highlightPlan(three, new Map<string, (number | null)[]>([["Tower@P03", [7, null]], ["Tower@P04", [null, 9]]]));
    expect(r.words).toBe("Highlighted 2 of 2 element(s) in Tower@P03, Tower@P04.");
  });
  it("nothing loaded", () => {
    expect(highlightPlan(three, new Map()).words).toBe("Load a model first (Files ▸ Open 3D) — nothing is loaded to highlight in.");
  });
  it("retypes from an older add-in carry no GUID", () => {
    expect(highlightPlan([g(null), g(null)], new Map()).words).toBe("Nothing to highlight: these ghosts were filed before the add-in sent IFC GlobalIds — a new Promote run sends them.");
  });
  it("creates only", () => {
    expect(highlightPlan([g(null, "create")], new Map()).words).toBe("Nothing to highlight: this storey proposes only creates (they have no element in the model yet).");
  });
  it("no hit", () => {
    expect(highlightPlan([g("A"), g("B")], new Map([["Tower@P03", [null, null]]])).words)
      .toBe("None of the 2 element(s) is in the loaded model(s) (Tower@P03) — the loaded version may be older than Revit's model; load the newest published version, or Revit may be newer.");
  });
  it("a retype without a GUID beside two with", () => {
    expect(highlightPlan([g("A"), g("B"), g(null)], new Map([["T@1", [1, 2]]])).words)
      .toBe("Highlighted 2 of 2 element(s) in T@1; 1 ghost(s) filed before the add-in sent GlobalIds cannot be highlighted.");
  });
  it("a type edit beside a retype: its type GlobalId is never looked up, and the words say why", () => {
    const r = highlightPlan([g("A"), g("TYPE", "set_parameter")], new Map([["T@1", [1]]]));
    expect(r.guids).toEqual(["A"]);
    expect(r.words).toBe("Highlighted 1 of 1 element(s) in T@1; 1 type edit(s) are not highlighted (a type has no geometry).");
    expect(highlightPlan([g("TYPE", "set_parameter"), g(null, "create")], new Map()).words)
      .toBe("Nothing to highlight: this storey proposes only creates and type edits (a create has no element yet; a type has no geometry).");
  });
  it("a wall retyped and attached is one element", () => {
    expect(highlightPlan([g("A"), g("A", "attach")], new Map([["T@1", [1]]])).words).toBe("Highlighted 1 of 1 element(s) in T@1.");
  });
  it("the desk's row: Highlight in 3D and Clear, one GUID list, the select highlighter", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain('btn("Highlight in 3D", ');
    expect(src).toContain('btn("Clear", () => void clearHighlight())');
    expect(src).toContain('highlightByID("select", plan.map, true, true)');
    expect(src).toContain('clear("select")');
    expect(src.split("const guids = guidsOf(ghosts);").length - 1).toBe(2);
  });
});

describe("MA-3d2 — the proposal model's words", () => {
  const head = (d: number, c: number) => `Showing ${d} of ${c} proposed create(s) as a proposal model in orange — walls as boxes on their lines, floors, roofs and ceilings as their outlines, doors and windows as their openings' boxes turned to the wall under them (a thickness not sent is sketched at 200 mm, a door with no size in its type name at 915 x 2134, a window at 1000 x 1000 on a 900 sill; a level no element of this changeset stands on sits at elevation 0 here); the executor places the real shapes at Apply. Not part of any published version — Hide creates removes it.`;
  const door = "D1: a door — not drawn (the proposal model draws walls, floors, roofs and ceilings as boxes)";
  it("one changeset with a skipped create", () => {
    expect(proposalWords([{ creates: 3, drawn: 2, skipped: [door] }], [], false)).toBe(`${head(2, 3)} Not drawn: ${door}.`);
  });
  it("two changesets add up", () => {
    expect(proposalWords([{ creates: 2, drawn: 2, skipped: [] }, { creates: 3, drawn: 1, skipped: [] }], [], false)).toBe(head(3, 5));
  });
  it("nothing to show", () => {
    expect(proposalWords([], [], true)).toBe("Nothing to show: this storey proposes no create (a retype or attach changes an element that exists — Highlight in 3D selects it).");
  });
  it("a failed one", () => {
    expect(proposalWords([{ creates: 1, drawn: 1, skipped: [] }], ["Level 2 (1/2): the bridge is down"], false)).toBe(`${head(1, 1)} Not loaded: Level 2 (1/2): the bridge is down.`);
    expect(proposalWords([], ["X: why"], false)).toBe("Not loaded: X: why.");
  });
  it("the (+N more) counts the bridge's skipped_total, not its cut list", () => {
    expect(proposalWords([{ creates: 15, drawn: 0, skipped: ["a", "b", "c", "d"], skipped_total: 15 }], [], false)).toBe(`${head(0, 15)} Not drawn: a; b; c (+12 more).`);
  });
  it("four skipped: three and (+1 more)", () => {
    expect(proposalWords([{ creates: 4, drawn: 0, skipped: ["a", "b", "c", "d"] }], [], false)).toBe(`${head(0, 4)} Not drawn: a; b; c (+1 more).`);
  });
  it("the desk's row: Show creates in 3D and Hide creates, the orange proposal style", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain('btn("Show creates in 3D", () => void showCreates(s))');
    expect(src).toContain('btn("Hide creates", () => void hideCreates(s))');
    expect(src).toContain('highlighter.styles.set("proposal"');
  });
});

describe("survey ghosts (MA-4d)", () => {
  const G: Ghost = { proposal_guid: "g1", kind: "wall", op: "create", cid: "scan-L00-wall-1", evidence: ["ev-0001#slice-L00"], pretick: true, trim_mm: [-140, -136],
    measured: { thickness_mm: 300, height_mm: 2800 }, accuracy: { status: "within_tolerance", basis: "fit", from_job: "job-0002", fit_rmse_mm: 2, face_dev_mm: 0, target_mm: 20 },
    place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL" }, validate: { identity: { Name: "scan-L00-wall-1" } } };
  it("trustWords: what was measured, from which job, the fit and the faces against D7's 20 mm, the pre-tick, the trims, the evidence — nothing for an unmeasured ghost", () => {
    expect(trustWords(G)).toBe("measured from job-0002 · 300 mm thick · fit 2 mm rms · faces 0 mm off · within tolerance (20 mm) · pre-ticked · ends -140 / -136 mm to the corners · evidence ev-0001#slice-L00");
    expect(trustWords({ ...G, pretick: false })).toContain(" · not pre-ticked · ");
    expect(trustWords({ proposal_guid: "g2", kind: "wall", accuracy: { status: "not_measured" } })).toBe("");
  });
  it("sourceWords: the job, its row, the frame and who stated it, the storey's level and whether its height was checked", () => {
    const cs = { id: "c", name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", claimed: false, status: "proposed", created_at: "", elements: [G],
      job: { id: "job-0002", ledger_id: 2201, frame: { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0, stated_by: "lead@example.test" }, storey: { level: "GR-FFL", how: "named", checked: false } } } as PendingChangeset;
    expect(sourceWords(cs)).toBe("from survey job-0002 (ledger #2201) · the scan moved 40000, 0, 0 mm, turned 0°, stated by lead@example.test · storey GR-FFL (named — its height not checked: nothing here is pre-ticked)");
    expect(sourceWords({ ...cs, job: { id: "job-0002", ledger_id: 2201, frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, storey: { level: "Scan L01 job-0002", how: "created", checked: true } } }))
      .toBe("from survey job-0002 (ledger #2201) · the scan at the model's internal origin · storey Scan L01 job-0002 (created)");
    expect(sourceWords({ ...cs, job: { ...cs.job!, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] }] } }))
      .toMatch(/ · the same scan ev-0001 was placed before by Survey job-0001 · GR-FFL$/);
    expect(sourceWords({ ...cs, job: null })).toBe("");
  });
});
