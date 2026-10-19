// MA-3a: the review desk groups what waits in Revit by storey and by what it does, says each web decision in words (a decline binds,
// an accept is advice), never sends a decline without a reason, and lets only a signed-in person decide (a lead re-open). The
// Modeling studio is retired: the desk takes its tab.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));
vi.mock("./active-project", () => ({ activePid: () => "demo", onActiveProjectChange: () => () => {} }));

import { heldLines, proposalWords, storeyOf, groupDesk, ghostLine, reviewWords, citesOf, declinedBy, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
  trustWords, sourceWords, isDrawn,
  readDecided, readLedger, highlightPlan, type Ghost, decidedView, decidedCount, DECIDED_MAX, type LedgerRows,
  measureWords, verifiedView, readVerified, readMeasuredRecent, measuredView, MEASURED_MAX, postMeasure, measureLine, canMeasure, unmeasuredOlder, countWords, editCostLine, keptWords, readEditCost, type EditCostRun, type VerifyRecord, type Measured } from "./review-desk";

import { recipeLine, draftWords, approveWords, readRecipes, postRecipeDraft, postRecipeApprove, postRecipeWithdraw, type RecipeRow } from "./review-desk";

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
    // MA-5b-3: a changeset's review rows in words, capped with how many more
    const cs = { id: "c", name: "Drawing job-0006 · ev-0008 · L00", source: "s", status: "proposed", created_at: "", elements: [],
      exceptions: Array.from({ length: 3 }, (_, i) => ({ unique_id: `u${i}`, name: `wall w${i}`, reason: "on ev-0007, not on ev-0008 — …" })) } as PendingChangeset;
    expect(heldLines(cs, 2)).toEqual(["wall w0 — on ev-0007, not on ev-0008 — …", "wall w1 — on ev-0007, not on ev-0008 — …", "… and 1 more (every one in Revit's review window)"]);
    expect(heldLines({ ...cs, exceptions: undefined })).toEqual([]);
    // MA-5b-1: a room reads its number then its name; a level whose place.Name is its own name reads as before
    expect(ghostLine({ kind: "room", proposal_guid: "g", validate: { identity: { Name: "101" } }, place: { LevelName: "L00", Name: "OFFICE" } } as Ghost)).toBe("101 · OFFICE · L00");
    expect(ghostLine({ kind: "level", proposal_guid: "g", validate: { identity: { Name: "L00" } }, place: { Name: "L00" } } as Ghost)).toBe("L00");
    expect(ghostLine({ kind: "wall", op: "reshape", proposal_guid: "g", validate: { identity: { Name: "drawing-ev-0008-p1-wall-4" } }, target: { unique_id: "u-1" } } as Ghost))
      .toBe("drawing-ev-0008-p1-wall-4 · reshape u-1 to the revised drawing's line (kept as it stands if edited by hand since placed)"); // MA-5b-4
    expect(ghostLine({ kind: "door", op: "rehost", proposal_guid: "g", validate: { identity: { Name: "PH1" } }, target: { unique_id: "u-2", type_before: "Placeholder Door : 1000 x 2100", at: [44100.4, 2510, 0] },
      place: { LevelName: "Level 1", Location: [44050, 2500, 0], FamilyName: "BDS_INT_1 PNL", TypeName: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm" } } as Ghost))
      .toBe("PH1 · rehost Placeholder Door : 1000 x 2100 at (44100, 2510) → BDS_INT_1 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm in the wall at (44050, 2500) on Level 1; the unhosted instance and any tags on it are removed (one Undo in Revit brings them back); its Mark, Comments, workset and phase carry over");
    expect(ghostLine(g4)).toBe('Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)');
    expect(ghostLine({ proposal_guid: "x", kind: "floor", place: { TypeName: "Generic 150mm", LevelName: "L1" } })).toBe("x · Generic 150mm · L1");
    // MA-6-6 review fix: a mass reads its size — the reviewer ticks what the row shows, not what a reason says
    expect(ghostLine({ proposal_guid: "g", kind: "mass", validate: { identity: { Name: "Photo mass" } },
      place: { Boundary: [[-6000, -4000], [6000, -4000], [6000, 4000], [-6000, 4000]], BaseElevation: 0, TopElevation: 9600 } })).toBe("Photo mass · 12000 x 8000 mm footprint, 0 to 9600 mm");
    // MA-8-10: a stair reads where it goes and that it is one straight run — landings, turns and railings are a person's (Revit's row says the same)
    const stair = { proposal_guid: "g", kind: "stair", validate: { identity: { Name: "Stair · L00 → L01" } },
      place: { LevelName: "L00", TopLevel: "L01", FamilyName: "Assembled Stair", TypeName: "190mm max riser 250mm going", Risers: 16, Going: 250, Width: 1200 } } as Ghost;
    expect(ghostLine(stair)).toBe("Stair · L00 → L01 · Assembled Stair : 190mm max riser 250mm going · L00 · to L01 · 16 risers, going 250 mm, width 1200 mm — one straight run; landings, turns and railings are a person's");
    expect(ghostLine({ ...stair, place: { ...stair.place, Risers: undefined } } as Ghost)).toBe("Stair · L00 → L01 · Assembled Stair : 190mm max riser 250mm going · L00");
    // MA-8-14: a terrain says whose word its points are (the add-in's reading of the scan, not re-measured) and that a person checks it against the site survey
    const terrain = { proposal_guid: "g", kind: "terrain", validate: { identity: { Name: "Terrain · L00" } },
      place: { LevelName: "L00", FamilyName: "Toposolid", TypeName: "Site Ground 300", Points: [[0, 0, -300], [1, 2, -300], [3, 4, -300]] } } as Ghost;
    // review round 3: one plain sentence for the shape, and Toposolid and the level said once (the type and the name)
    expect(ghostLine(terrain)).toBe("Terrain · L00 · Toposolid : Site Ground 300 · 3 ground points, filed by a signed-in member from the survey changeset this was proposed from (the bridge checked its level, footprint and height band, not the points; not re-measured); " +
      "the hole is the box of all the storey's scanned walls plus 1 m (typed or not; a notch or courtyard inside it gets no ground); Sentinel adds points along the outer edge and the hole's edge, each at the nearest ground point's height — check it against the site survey");   // review round 2: the shape said, as Revit's row
    expect(ghostLine({ ...terrain, place: { ...terrain.place, Points: undefined } } as Ghost)).toBe("Terrain · L00 · Toposolid : Site Ground 300");
  });

  it("a decline binds, an accept is advice, a re-open is said; nobody decided is waiting", () => {
    const [g1, g2, g3] = after.elements;
    // MA-7-10 (PC-1): an accept that cites a photo says so
    expect(reviewWords({ ...g2, review: { ...g2.review!, evidence: ["ev-000C"], evidence_copies: { "ev-000C": "e".repeat(64) } } }))
      .toBe("accepted by reviewer@example.com (contributor) · confirmed by photo ev-000C (person-linked, not registered) — advice: Revit still asks for the tick");
    expect(citesOf(" ev-000C, ev-000D  ev-000C;")).toEqual(["ev-000C", "ev-000D"]);
    expect(citesOf("  ")).toEqual([]);
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
    // MA-7-10: an accept sends the cited photos; a decline never does
    bwrite.mockResolvedValueOnce({ ledger: null });
    await postReview("http://b", "demo", "cs-ma3a", "accept", ["g-2"], "", ["ev-000C"]);
    expect(JSON.parse(bwrite.mock.calls[2][1].body)).toEqual({ decisions: [{ proposal_guid: "g-2", decision: "accept", evidence: ["ev-000C"] }] });
    bwrite.mockResolvedValueOnce({ ledger: null });
    await postReview("http://b", "demo", "cs-ma3a", "decline", ["g-1"], "no", ["ev-000C"]);
    expect(JSON.parse(bwrite.mock.calls[3][1].body).decisions[0]).not.toHaveProperty("evidence");
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
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by modeller@example.com · 2026-10-04 13:44 UTC · 1 applied, 3 not applied · ledger #1811 · not yet seen saved");
    expect(v.note).toBe("GR-FFL reviewed in Revit");
    expect(v.declined).toEqual([
      { line: "W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: a party wall, as the web desk said", "web, reviewer@example.com (contributor): wrong type: W 1 is a party wall"] },
      { line: "W 2 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: W 2 is demolished in the next package"] },
      { line: 'Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)', why: ["web, reviewer@example.com (contributor): no fire strategy issued yet"] },
    ]);
  });

  it("revert + saved check (drill REV): a revert is said with who and why; the saved check in Revit's words, 'as applied:' once reverted", () => {
    const saved = { ...cs, persisted: { state: "confirmed", how: "saved", at: "2026-10-19T18:23:10Z", missing: 0 } } as PendingChangeset;
    expect(decidedView(saved, row(5)).head).toMatch(/ · ledger #5 · saved in the model$/);
    const reverted: LedgerRows = { row: 5, reverted: { id: 9, op: "undo", revert: { by: "lead@example.test", reason: "not wanted", kept: 1 } } };
    expect(decidedView(saved, reverted).head).toMatch(/ · reverted in Revit by lead@example.test: "not wanted" \(ledger #9\) — 1 row\(s\) kept as they stood · as applied: saved in the model$/);
    const lost = { ...cs, persisted: { state: "lost", how: "reopened", at: "2026-10-19T18:26:11Z", missing: 1 } } as PendingChangeset;
    expect(decidedView(lost, row(6)).head).toMatch(/ · NOT in the saved model — closed without saving, or Revit stopped \(1 row\(s\)\)$/);
    expect(decidedView({ ...cs, persisted: { state: "confirmed", how: "synced", at: "", missing: 0 } } as PendingChangeset, row(7)).head).toMatch(/ · synchronised with central$/);
  });

  it("claimed vs verified: a ledger row that was not found or not read is said, never a made-up id; a ghost with no reason says so", () => {
    expect(decidedView(cs, null).head).toMatch(/ · no ledger row found for it · not yet seen saved$/);
    expect(decidedView(cs, new Error("not read — HTTP 500")).head).toMatch(/ · ledger row not read — HTTP 500 · not yet seen saved$/);
    const bare = decidedView({ ...cs, status: "declined", result: { ...cs.result!, applied: [], rejected: ["g-2", "constructor"], note: null, reported_at: "", declined_on_web: undefined, reasons: undefined } }, row(7));
    expect(bare.head).toBe("Promote (DD) · GR-FFL — declined in Revit by modeller@example.com · an unknown time · 0 applied, 2 not applied · ledger #7");
    expect(bare.note).toBeNull();
    expect(bare.declined).toEqual([{ line: "W 1 · GR-FFL → top 01-FFL", why: ["no reason given for this ghost"] }, { line: "constructor", why: ["no reason given for this ghost"] }]);
  });

  it("MA-5b-5: a report that applied a rehost counts it — the unhosted instance removed", () => {
    const rh = { ...cs, status: "applied", elements: [...cs.elements, { kind: "door", op: "rehost", proposal_guid: "g-r", target: { unique_id: "u-9" } } as Ghost],
      result: { ...cs.result!, applied: [{ proposal_guid: "g-r" }], rejected: [] } };
    expect(decidedView(rh, row(9)).head).toContain(" · 1 applied (1 rehosted — the unhosted instance removed), 0 not applied · ledger #9");
    const kept = { ...rh, status: "declined", result: { ...rh.result!, applied: [], rejected: ["g-r"], note: "kept as they stand: 1 door/window(s) not rehosted — the unhosted instance stays — PH1 was moved by hand", reasons: undefined, declined_on_web: undefined } };
    expect(decidedView(kept, row(10)).declined[0].why).toEqual(["Revit kept it as it stands — its reason is in the note above"]);
  });

  it("MA-8-7: a create that replaces says the original is deleted - in the ghost line and in a report's header", () => {
    const rp = { kind: "wall", proposal_guid: "g-p", validate: { identity: { Name: "WALL-DS" } }, replaces: { unique_id: "u-ds", box: { min: [0, 0, 0], max: [6000, 300, 3000] } },
      place: { LevelName: "Level 1", TypeName: "BDS_EXT_ARC_CMU_300 mm" } } as Ghost;
    expect(ghostLine(rp)).toBe("WALL-DS · re-creates u-ds (DirectShape or Generic Model, 6000 x 300 x 3000 mm) as BDS_EXT_ARC_CMU_300 mm on Level 1; the original and any tags on it are removed in the same Undo (one Undo in Revit brings it back and removes the new element)");
    expect(ghostLine({ ...rp, replaces: undefined })).toBe("WALL-DS · BDS_EXT_ARC_CMU_300 mm · Level 1"); // a plain create is as before
    const done = { ...cs, status: "applied", elements: [...cs.elements, rp], result: { ...cs.result!, applied: [{ proposal_guid: "g-p", removed_unique_id: "U-DS" }], rejected: [] } };
    expect(decidedView(done, row(11)).head).toContain(" · 1 applied (1 re-created — the original removed), 0 not applied · ledger #11");
    // review: the header repeats only what Revit reported; a replacing create applied without the matching removed_unique_id is said apart
    const rp2 = { ...rp, proposal_guid: "g-q", replaces: { ...rp.replaces!, unique_id: "u-ds" } } as Ghost;
    const mixed = { ...done, elements: [...cs.elements, rp2, { ...rp, replaces: { unique_id: "u-other", kind: "generic" as const } }], result: { ...done.result!, applied: [{ proposal_guid: "g-q", removed_unique_id: "U-DS" }, { proposal_guid: "g-p" }] } };
    expect(decidedView(mixed, row(11)).head).toContain("2 applied (1 re-created — the original removed) (1 placed, the original not reported removed");
    // the original's class and category are in the row when the bridge kept them
    expect(ghostLine({ ...rp, replaces: { ...rp.replaces!, kind: "directshape", category: "Floors" } })).toContain("re-creates u-ds (Floors DirectShape, 6000 x 300 x 3000 mm)");
    // a retype says why it is not pre-ticked
    const rt = { kind: "column", op: "retype", proposal_guid: "g-r", validate: { identity: { Name: "C1" } }, target: { type_before: "A : B" }, place: { FamilyName: "F", TypeName: "T" } } as Ghost;
    expect(ghostLine(rt)).toBe("C1 · A : B → F : T — not pre-ticked: structure is a person's");
    expect(ghostLine({ ...rt, kind: "wall", foreign: true })).toBe("C1 · A : B → F : T — not pre-ticked: a type that is not the office's");
    expect(ghostLine({ ...rt, kind: "wall", foreign: null, pretick: false })).toBe("C1 · A : B → F : T — not pre-ticked: not judged, no type catalogue");
    expect(ghostLine({ ...rt, kind: "wall", foreign: false })).toBe("C1 · A : B → F : T");
    const kept = { ...done, status: "declined", result: { ...done.result!, applied: [], rejected: ["g-p"], note: "kept as they stand: 1 not re-created", reasons: undefined, declined_on_web: undefined } };
    expect(decidedView(kept, row(12)).declined[0].why).toEqual(["Revit kept it as it stands — its reason is in the note above"]);
  });

  it("review C3: a report undone in Revit says so, with the ledger row that says it — never 'applied' alone", () => {
    const done = { ...cs, status: "applied" };
    expect(decidedView(done, { row: 1813, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · ledger #1813 · undone in Revit after the report \(ledger #1814\) · not yet seen saved$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1816, op: "redo" } }).head).toMatch(/ · ledger #1813 · undone, then redone in Revit \(ledger #1816\) · not yet seen saved$/);
    expect(decidedView(done, { row: 1813, reverted: { id: 1817, op: "" } }).head).toMatch(/ · ledger #1813 · a changeset_reverted row follows the report \(ledger #1817\) · not yet seen saved$/);
    expect(decidedView(done, { row: null, reverted: { id: 1814, op: "undo" } }).head).toMatch(/ · no ledger row found for it · undone in Revit after the report \(ledger #1814\) · not yet seen saved$/);
    // final verification round 2: an undo recorded on a person's word (basis absent) is said apart - never "undone in Revit"
    const said = decidedView(done, { row: 1813, reverted: { id: 1818, op: "undo", on_word: "yazan" } }).head;
    expect(said).toMatch(/ · ledger #1813 · recorded as gone on yazan's word after the report, not an Undo seen in Revit \(ledger #1818\) · not yet seen saved$/);
    expect(said).not.toMatch(/undone in Revit/);
  });

  it("review C4: an old or hand-written result (no lists, no reporter) is still said — the view never throws", () => {
    const v = decidedView({ ...cs, result: { note: null } as never }, null);
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by an unknown account · an unknown time · 0 applied, 0 not applied · no ledger row found for it · not yet seen saved");
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
    // final verification round 2: a row with basis "absent" carries the account it was recorded on the word of
    bfetch.mockResolvedValueOnce(res(200, { rows: [{ id: 1820, entity_id: A, action: "changeset_reverted", actor: "yazan", new_value: { op: "undo", guids: ["g"], count: 1, basis: "absent" } }], total: 1 }));
    expect((await readLedger("http://b", "demo", [A])).get(A)).toEqual({ row: null, reverted: { id: 1820, op: "undo", on_word: "yazan" } });
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
    expect(src).toContain('try { tail = recent(decided, ledger, role.role, verified); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); }');
    expect(src).toContain('if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), tail); return; }');
    expect(src).toContain('if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), tail); return; }');
    expect(src).toContain("    body.append(tail);");
    expect(src.split("recent(decided, ledger, role.role, verified)").length - 1).toBe(1);
    expect(src.split(/\btail\b/).length - 1).toBe(12); // declared, set twice, shown in each of the desk's three endings (+2 in MA-8-1: edit-cost section; +2 in MA-8-5c: measured section; +2 in MA-8-13: recipes section)
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
  it("MA-5b-4 review: a drawing revision's reshapes name their walls by Revit id — said so, never 'run Promote again'", () => {
    expect(highlightPlan([{ proposal_guid: "r1", kind: "wall", op: "reshape", target: { unique_id: "u-1" } } as Ghost, g(null, "create")], new Map()).words)
      .toBe("Nothing to highlight: a drawing revision's reshape names its wall by Revit id, not IFC GlobalId — select it in Revit (Show in the review window).");
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
    // two overlaps on one scan name it once (final review)
    expect(sourceWords({ ...cs, job: { ...cs.job!, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] },
      { changeset: "Survey job-0001 · L01", job_id: "job-0001", evidence: ["ev-0001"] }] } })).toContain(" · the same scan ev-0001 was placed before by Survey job-0001 · GR-FFL, Survey job-0001 · L01");
  });
  it("MA-6-8: an IFC concept's ghost and changeset in words — modelled, inferred, never pre-ticked, no scan to measure", () => {
    const I: Ghost = { ...G, cid: "2VExwC6xrF6u4NaChOdioP", evidence: ["ev-0021#2VExwC6xrF6u4NaChOdioP"], pretick: false, trim_mm: undefined, measured: { thickness_mm: 300 },
      accuracy: { status: "inferred", basis: "ifc", from_job: "job-0009" } };
    expect(trustWords(I, true)).toContain("inferred (what a third party's model says, not what was measured here)");
    expect(trustWords(I)).toBe("modelled — from job-0009 (IFC) · 300 mm thick as modelled · inferred (what a concept says, not what was built) · not pre-ticked · evidence ev-0021#2VExwC6xrF6u4NaChOdioP");
    const cs = { id: "c", name: "IFC job-0009 · L02", source: "sentinel-ifc 0.1.0", claimed: false, status: "applied", created_at: "", elements: [I],
      job: { id: "job-0009", ledger_id: 3301, reader: "sentinel-ifc 0.1.0", frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0, stated_by: "lead@example.test" }, storey: { level: "IFC L02 job-0009", how: "created", checked: true } } } as PendingChangeset;
    expect(sourceWords(cs)).toBe("from IFC job-0009 (ledger #3301) · the concept at the model's internal origin, stated by lead@example.test · storey IFC L02 job-0009 (created) · nothing from an IFC is pre-ticked");
    expect([isDrawn(cs), canMeasure(cs, "lead", null)]).toEqual([true, false]);
    // MA-8-3: a third party's IFC says whose it is and the order it was bought under; an own model reads as before
    const bought = { ...cs, job: { ...cs.job!, evidence: [{ id: "ev-0021", sha256: "ab", provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" }] } } as PendingChangeset;
    expect(sourceWords(bought)).toBe("from IFC job-0009 by acme scans (commercial, ref PO-2026-114, ledger #3301) · the concept at the model's internal origin, stated by lead@example.test · storey IFC L02 job-0009 (created) · nothing from an IFC is pre-ticked");
    expect(sourceWords({ ...cs, job: { ...cs.job!, evidence: [{ id: "ev-0021", sha256: "ab", provider: "own", licence: "owner-supplied" }] } } as PendingChangeset)).toBe(sourceWords(cs));
  });
  it("MA-5a-4: a drawing's ghost and changeset in words — drawn at the alignment's scale, inferred, never pre-ticked; no Measure", () => {
    const D: Ghost = { ...G, cid: "drawing-ev-0007-p1-wall-1", evidence: ["ev-0007#page-1"], pretick: false, trim_mm: [150, 100], measured: { thickness_mm: 100, thickness_paper_mm: 2 },
      accuracy: { status: "inferred", basis: "drawing", from_job: "job-0005", scale: 50, check_mm: 0 } };
    expect(trustWords(D)).toBe("drawn — from job-0005 at 1:50 · 100 mm thick as drawn · inferred (what someone drew, not what was built) · alignment checked to 0 mm · not pre-ticked · ends 150 / 100 mm to the corners · evidence ev-0007#page-1");
    expect(trustWords({ ...D, accuracy: { ...D.accuracy!, check_mm: null } })).toContain(" · alignment not checked by a third point · ");
    const cs = { id: "c", name: "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005", source: "sentinel-drawing 0.1.0", claimed: false, status: "applied", created_at: "", elements: [D],
      job: { id: "job-0005", ledger_id: 3001, reader: "sentinel-drawing 0.1.0", storey: { level: "Drawing ev-0007 job-0005", how: "created", checked: true },
        alignment: { item: "ev-0007", scale: 50, rotation_deg: 0, dx_mm: 37000, dy_mm: -2000, dz_mm: 0, check_mm: 0, confirmed_by: "lead@example.test" } } } as PendingChangeset;
    expect(sourceWords(cs)).toBe("from drawing job-0005 (ledger #3001) · ev-0007 at 1:50, turned 0°, its paper corner at 37000, -2000 mm, level at 0 mm, stated by lead@example.test · checked to 0 mm by a third point · storey Drawing ev-0007 job-0005 (created) · nothing from a drawing is pre-ticked");
    expect([isDrawn(cs), isDrawn({ ...cs, job: { ...cs.job!, reader: "sentinel-survey 0.6.0" } }), canMeasure(cs, "lead", null)]).toEqual([true, false, false]);
    // review: the same drawing placed before by another job is named on the desk, as a scan's is
    expect(sourceWords({ ...cs, job: { ...cs.job!, overlaps: [{ changeset: "Drawing job-0004 · ev-0007 · GR-FFL", job_id: "job-0004", evidence: ["ev-0007"] }] } }))
      .toMatch(/ · nothing from a drawing is pre-ticked · the same drawing ev-0007 was placed before by Drawing job-0004 · ev-0007 · GR-FFL$/);
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("if (cs.job && !isDrawn(cs)) {");
  });
  it("final review: no ends clause for untrimmed ends; the desk shows both lines and the gap card its job", () => {
    expect(trustWords({ ...G, trim_mm: [0, 0] })).not.toContain("ends");
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const tw = trustWords(x.el, ");
    expect(src).toContain("const w = sourceWords(cs); if (w) box.append(");
    expect(readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8")).toContain("` · from ${x.source === \"sentinel-drawing\" ? \"drawing\" : x.source === \"sentinel-ifc\" ? \"IFC\" : \"survey\"} ${esc(x.job_id)}`"); // MA-5a-4 (review)
  });
});

describe("measured against the scan (MA-4e)", () => {
  beforeEach(() => { bfetch.mockReset(); bwrite.mockReset(); });
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
  const W: Ghost = { proposal_guid: "g1", kind: "wall", op: "create", cid: "scan-L00-wall-1", place: { TypeName: "BDS_EXT_ARC_CMU_300 mm", LevelName: "GR-FFL" }, validate: { identity: { Name: "scan-L00-wall-1" } } };
  const IN: Measured = { proposal_guid: "g1", kind: "wall", status: "within_tolerance", points: 3512, p95_mm: 3, mean_signed_mm: 0, coverage: 0.999, share_within: { 50: 1, 100: 1, 200: 1 } };
  it("measureWords: the verdict against 20 mm on p95, the numbers, the sign said; a reason — never a made-up zero", () => {
    expect(measureWords(IN)).toBe("within tolerance (20 mm, p95) · LOA40 (p95 3 mm, USIBD C120 v3.1, Table 'Levels of Accuracy', p. 15, relative to the scan, not independently validated) · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points");
    expect(measureWords({ ...IN, status: "out_of_tolerance", p95_mm: 63, mean_signed_mm: 0.2, share_within: { 50: 0, 100: 1, 200: 1 } }))
      .toBe("out of tolerance (20 mm, p95) · LOA10 (p95 63 mm, USIBD C120 v3.1, Table 'Levels of Accuracy', p. 15, relative to the scan, not independently validated) · p95 63 mm · mean +0.2 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 0% / 100% / 100% · 3512 points");
    expect(measureWords({ proposal_guid: "g2", status: "missing", points: 0, p95_mm: null, mean_signed_mm: null, coverage: 0, share_within: null, reason: "no scan point within 400 mm of its faces — not built where it stands, or not scanned there" }))
      .toBe("missing · 0% of its faces seen · no scan point within 400 mm of its faces — not built where it stands, or not scanned there");
    expect(measureWords({ proposal_guid: "g3", status: "not_measured", reason: "undone in Revit (ledger #2211) — nothing placed to measure" })).toBe("not measured · undone in Revit (ledger #2211) — nothing placed to measure");
    // MA-5a-2: a row that names its per-face rule says it and each face's share; an old row (p95, target_mm) keeps its words
    const DEV = { within_mm: 20, face_share_min: 0.2 }, SW = { 20: 1, 50: 1, 100: 1, 200: 1 };
    const FACES = { ...IN, share_within: SW, faces: [{ points: 1800, coverage: 1, share_within: { ...SW, 20: 0.97 } }, { points: 1712, coverage: 1, share_within: { ...SW, 20: 0.95 } }] };
    expect(measureWords(FACES, { deviation: DEV }))
      .toBe("within tolerance (each face 20% within 20 mm) · LOA40 (p95 3 mm, USIBD C120 v3.1, Table 'Levels of Accuracy', p. 15, relative to the scan, not independently validated) · faces within 20 mm: 97% / 95% · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points");
    expect(measureWords({ ...FACES, status: "out_of_tolerance", faces: [FACES.faces[0], { points: 0, coverage: 0, share_within: null }], reason: "face 2: no scan point within 400 mm" }, { deviation: DEV }))
      .toBe("out of tolerance (each face 20% within 20 mm) · no band — face 2 has no scan point · faces within 20 mm: 97% / — · p95 3 mm · mean 0 mm (+ = the scan outside it) · 100% of its faces seen · within 50 / 100 / 200 mm: 100% / 100% / 100% · 3512 points · face 2: no scan point within 400 mm");
    expect(measureWords(IN, { target_mm: 20 })).toBe(measureWords(IN)); // an old row
    expect(measureWords({ ...FACES, faces: [FACES.faces[0], { points: 1712, coverage: 1, share_within: { ...SW, 20: 0.196 } }] }, { deviation: DEV }))
      .toContain(" · faces within 20 mm: 97% / 19% · "); // rounded down (review): never "20%" under a verdict that says it missed 20%
  });
  it("verifiedView: the head — as filed, who reported the placement, the counts or why it did not finish, its row, when, who — and a line per placed element; null never measured; a failed read said", () => {
    const cs = { id: A, name: "Survey job-0002 · GR-FFL", source: "sentinel-survey 0.1.0", status: "applied", created_at: "", elements: [W] } as PendingChangeset;
    const rec: VerifyRecord = { id: 2300, at: "2026-10-09T10:00:02.000Z", actor: "lead@example.test", status: "done", reference: "as filed", target_mm: 20,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" },
      counts: { within_tolerance: 1, not_measured: 1 }, elements: [IN, { proposal_guid: "g9", status: "not_measured", reason: "a level has no face to measure — its height against the scan is MA-4h's level error" }] };
    const AS_FILED = "Measured against the scan as filed (the changeset's geometry, which Revit placed exactly — not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen) · placed as Revit reported (by lead@example.test)";
    expect(verifiedView(cs, rec)).toEqual({ head: `${AS_FILED} · 1 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 1 not measured · ledger #2300 · 2026-10-09 10:00 UTC · by lead@example.test`,
      lines: [{ line: ghostLine(W), words: measureWords(IN) }, { line: "g9", words: "not measured · a level has no face to measure — its height against the scan is MA-4h's level error" }] });
    expect(verifiedView(cs, { ...rec, placed_by: { reported_by: "revit", reported_role: "service" } })!.head)
      .toContain(" · placed as Revit reported (by revit) — the machine credential's report · ");
    expect(verifiedView(cs, null)).toBeNull();
    // MA-5a-2 (review): a new row's per-face rule reaches each line — never the old "(20 mm, p95)" on a per-face verdict
    const DEV = { within_mm: 20, face_share_min: 0.2 }, SW = { 20: 0.97, 50: 1, 100: 1, 200: 1 };
    const PF: Measured = { ...IN, share_within: SW, faces: [{ points: 1800, coverage: 1, share_within: SW }, { points: 1712, coverage: 1, share_within: SW }] };
    const lines = verifiedView(cs, { ...rec, target_mm: undefined, deviation: DEV, elements: [PF] })!.lines;
    expect(lines[0].words).toBe(measureWords(PF, { deviation: DEV }));
    expect(lines[0].words).toMatch(/^within tolerance \(each face 20% within 20 mm\) · LOA40 [^·]+ · faces within 20 mm: 97% \/ 97% · /);
    expect(verifiedView(cs, { ...rec, status: "failed", error: "the survey took longer than 10 min — it was stopped; nothing it found was kept", elements: [] })!.head)
      .toBe(`${AS_FILED} · did not finish — the survey took longer than 10 min — it was stopped; nothing it found was kept · ledger #2300 · 2026-10-09 10:00 UTC · by lead@example.test`);
    expect(verifiedView(cs, new Error("not read — HTTP 500"))).toEqual({ head: "Measure not read — HTTP 500", lines: [] });
  });
  it("readVerified reads each changeset's newest verify:measured row on its own (limit 1, in parallel): a busy report never cuts a quiet one's; a failed read is that report's 'not read — …'; none asked is no read", async () => {
    expect((await readVerified("http://b", "demo", [])).size).toBe(0);
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValueOnce(res(200, { rows: [
      { id: 2302, entity_id: A, at: "2026-10-09T11:00:00Z", actor: "x@example.test", new_value: { status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 3 }, elements: [IN] } }], total: 300 }))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(res(200, { rows: [], total: 0 }));
    const m = await readVerified("http://b/", "demo key", [A, B, C]);
    expect(m.get(A)).toEqual({ id: 2302, at: "2026-10-09T11:00:00Z", actor: "x@example.test", status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 3 }, elements: [IN] });
    expect([m.get(B), m.get(C)]).toEqual([new Error("not read — timeout"), null]);
    expect(bfetch.mock.calls.map((c) => c[0])).toEqual([A, B, C].map((id) => `http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=verify:measured&limit=1&entity_id=${id}`));
  });
  it("MA-8-5c: readMeasuredRecent lists the newest measure of each changeset outside the decided window, with its LOA words; one the decided list shows is not listed twice; the cap words follow the read", async () => {
    const row = (id: number, cs: string) => ({ id, entity_id: cs, at: "2026-10-09T11:00:00Z", actor: "x@example.test", action: `verify:measured job-000${id % 9} · sentinel-survey 0.6.0 · done`, new_value: { status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 1 }, elements: [IN] } });
    bfetch.mockResolvedValueOnce(res(200, { rows: [row(2307, A), row(2306, B), row(2225, A), row(2300, C)], total: 4 }));
    const m = await readMeasuredRecent("http://b/", "demo key", new Set([C]));
    expect(bfetch.mock.calls[0][0]).toBe(`http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=verify:measured&limit=${MEASURED_MAX}`);
    expect(m.items.map((x) => [x.id, x.rec.id])).toEqual([[A, 2307], [B, 2306]]);   // newest row per changeset; C is shown under the decided reports
    expect(m.capped).toBe(false);
    const v = verifiedView({ id: A, name: m.items[0].name, source: "", status: "", created_at: "", elements: [] } as PendingChangeset, m.items[0].rec)!;
    expect(v.head).toContain("ledger #2307");
    expect(v.lines[0].words).toContain("LOA40");
    bfetch.mockResolvedValueOnce(res(200, { rows: [row(2307, A)], total: 900 }));
    expect((await readMeasuredRecent("http://b", "demo", new Set())).capped).toBe(true);
    bfetch.mockResolvedValueOnce(res(500, { message: "down" }));
    await expect(readMeasuredRecent("http://b", "demo", new Set())).rejects.toThrow("not read — down");
  });
  it("MA-8-5c: measuredView names each changeset from the desk's own list, keeps its ghostLine words, and says the cap, the empty, the failed read and a bad row (DOM rendering of these nodes is a source scan: no DOM here)", () => {
    const rec = (id: number, elements: unknown) => ({ id, at: "2026-10-09T11:00:00Z", actor: "x@example.test", status: "done", reference: "as filed", target_mm: 20, counts: { within_tolerance: 1 }, elements }) as unknown as VerifyRecord;
    const el0 = { ...after.elements[2], proposal_guid: "g-1" };
    const byId = new Map<string, PendingChangeset>([[A, { ...after, id: A, name: "Survey job-0002 · 1F", elements: [el0] } as PendingChangeset], [B, { ...after, id: B, name: "Survey job-0002 · 2F", elements: [] } as PendingChangeset]]);
    const IN1 = { ...IN, proposal_guid: "g-1" };
    const v = measuredView({ items: [{ id: A, name: "job-0002 · done", rec: rec(2307, [IN1]) }, { id: B, name: "job-0002 · done", rec: rec(2306, [IN1]) }], capped: false }, byId)!;
    expect(v.items.map((x) => x.summary)).toEqual(["Survey job-0002 · 1F", "Survey job-0002 · 2F"]);   // two changesets of one job stay apart
    expect(v.items[0].lines[0].line).toBe(ghostLine(el0 as Ghost));   // words, not a bare guid
    expect(v.items[1].lines[0].line).toBe("g-1");
    expect(v.items[0].lines[0].words).toContain("LOA40");
    expect(v.notes.map((n) => n.text).join(" ")).toContain("an Undo in Revit since then is not read here");
    expect(v.notes.join(" ")).not.toContain("newest 200");   // cap words only when capped
    expect(measuredView({ items: [{ id: A, name: "n", rec: rec(1, [IN1]) }], capped: true }, new Map())!.notes[0].text).toBe(`The newest ${MEASURED_MAX} measures — the older ones are on the ledger.`);
    expect(measuredView({ items: [], capped: false }, byId)).toBeNull();   // nothing to say = no section
    const e = measuredView({ items: [], capped: true }, byId)!;
    expect(e.notes[0].text).toContain("None outside the reports above");
    expect(e.notes[0].text).not.toContain("No other survey changeset");
    expect(measuredView(new Error("not read — down"), byId)).toEqual({ notes: [{ text: "Measures not read — down", warn: true }], items: [] });
    // one malformed row is said in its own entry; the others stay
    const bad = measuredView({ items: [{ id: C, name: "bad", rec: rec(5, [null]) }, { id: A, name: "n", rec: rec(2307, [IN1]) }], capped: false }, byId)!;
    expect(bad.items[0].summary).toContain("bad: measure not shown");
    expect(bad.items[1].lines).toHaveLength(1);
  });
  it("MA-8-5c: readMeasuredRecent names a changeset by its row's own name, else the action without its ledger prefix", async () => {
    const base = { actor: "x", at: "2026-10-09T11:00:00Z", new_value: { status: "done", elements: [] } };
    bfetch.mockResolvedValueOnce(res(200, { rows: [{ ...base, id: 2, entity_id: A, action: "verify:measured job-0002 · done", new_value: { status: "done", elements: [], changeset: { name: "Survey job-0002 · 1F" } } }, { ...base, id: 1, entity_id: B, action: "verify:measured job-0003 · done" }], total: 2 }));
    expect((await readMeasuredRecent("http://b", "demo", new Set())).items.map((x) => x.name)).toEqual(["Survey job-0002 · 1F", "job-0003 · done"]);
  });
  it("MA-8-5c: the desk reads the project's measures beside the decided list and says when it could not (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("readMeasuredRecent(base, key, shownMeasured).catch((e: Error) => e)");
    expect(src).toContain("if (mb) tail.append(mb);");
    expect(src).toContain('"Measured against the scan"');
  });
  it("postMeasure sends the changeset id only to /cde/:key/verify; measureLine says what was judged and its row", async () => {
    bwrite.mockResolvedValueOnce({ changeset: { id: A, name: "Survey job-0002 · GR-FFL" }, status: "done", counts: { within_tolerance: 3 }, elements: [], ledger: { id: 2300, hash: "h" } });
    const r = await postMeasure("http://b/", "demo", A);
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeset: A }) });
    expect(measureLine(r)).toBe("✓ Measured Survey job-0002 · GR-FFL against the scan as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2300");
    expect(countWords({})).toBe("0 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured");
  });
  it("MA-4f: a measure of Revit's re-read says so — the head, a mixed row's as-filed lines, the status line", () => {
    const cs = { id: A, name: "Survey job-0003 · Scan L01 job-0003", source: "sentinel-survey 0.1.0", status: "applied", created_at: "", elements: [W] } as PendingChangeset;
    const rec: VerifyRecord = { id: 2400, at: "2026-10-10T10:00:00Z", actor: "lead@example.test", status: "done", reference: "revit (claimed)", target_mm: 20,
      placed_by: { reported_by: "lead@example.test", reported_role: "lead" }, counts: { within_tolerance: 1 }, elements: [{ ...IN, reference: "revit (claimed)" }] };
    expect(verifiedView(cs, rec)!.head).toBe("Measured against the scan as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen) · placed as Revit reported (by lead@example.test) · 1 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400 · 2026-10-10 10:00 UTC · by lead@example.test");
    const mix = verifiedView(cs, { ...rec, reference: "mixed", elements: [{ ...IN, reference: "revit (claimed)" }, { ...IN, proposal_guid: "g9", reference: "as filed" }] })!;
    expect(mix.head).toContain("Measured against the scan as Revit placed it where Revit re-read it at Apply (the add-in's claim), else as filed — a wall moved since Apply and the lead's frame are not seen · ");
    expect(mix.lines.map((l) => l.words.endsWith(" · as filed"))).toEqual([false, true]);
    const reply = { changeset: { id: A, name: cs.name }, status: "done", counts: { within_tolerance: 3 }, elements: [], ledger: { id: 2400, hash: "h" } };
    expect([measureLine({ ...reply, reference: "revit (claimed)" }), measureLine({ ...reply, reference: "mixed" })]).toEqual([
      "✓ Measured Survey job-0003 · Scan L01 job-0003 against the scan as Revit re-read it (the add-in's claim) — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400",
      "✓ Measured Survey job-0003 · Scan L01 job-0003 against the scan as Revit re-read it (the add-in's claim), else as filed — 3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured · ledger #2400"]);
  });
  it("canMeasure: a placed survey changeset, a signed-in contributor or above, not undone in Revit — the bridge holds the same rules", () => {
    const cs = { id: A, name: "n", source: "s", status: "applied", created_at: "", elements: [], job: { id: "job-0002", ledger_id: 2201 } } as PendingChangeset;
    expect(["viewer", "contributor", "lead", "owner", "service"].map((r) => canMeasure(cs, r, null))).toEqual([false, true, true, true, false]);
    expect(canMeasure({ ...cs, status: "partially_applied" }, "contributor", { row: 1, reverted: { id: 2, op: "redo" } })).toBe(true);
    expect(canMeasure(cs, "contributor", { row: 1, reverted: { id: 2, op: "undo" } })).toBe(false);
    expect(canMeasure(cs, "contributor", new Error("not read"))).toBe(true); // the bridge reads the Undo rows itself
    expect([canMeasure({ ...cs, job: null }, "lead", null), canMeasure({ ...cs, status: "declined" }, "lead", null)]).toEqual([false, false]);
  });
  it("F-B3-4: an 11th placed survey changeset never measured gets Measure under \"Measured against the scan\"; a drawing's or an IFC's never does; one measured, declined or in the newest 10 is not listed", () => {
    const cs = (i: number, over: Partial<PendingChangeset> = {}) => ({ id: `cs-${i}`, name: `Survey job-0002 · S${i}`, source: "s", status: "applied", created_at: "", elements: [],
      job: { id: "job-0002", ledger_id: 2201, reader: "sentinel-survey 0.6.0" }, ...over }) as PendingChangeset;
    const newest = Array.from({ length: DECIDED_MAX }, (_, i) => cs(i));
    const decided = [...newest, cs(10), cs(11, { status: "partially_applied" }), cs(12, { job: { id: "job-0004", ledger_id: 2202, reader: "sentinel-drawing 0.2.0" } } as Partial<PendingChangeset>),
      cs(13, { job: { id: "job-0007", ledger_id: 3301, reader: "sentinel-ifc 0.2.0" } } as Partial<PendingChangeset>), cs(14), cs(15, { status: "declined" }), cs(16, { job: null } as Partial<PendingChangeset>)];
    const rec = { id: 1, at: "", actor: "", status: "done", elements: [] } as unknown as VerifyRecord;
    const measured = { items: [{ id: "cs-14", name: "n", rec }], capped: false };
    const older = unmeasuredOlder(decided, measured);
    expect(older.map((c) => c.id)).toEqual(["cs-10", "cs-11"]);
    expect(older.map((c) => canMeasure(c, "contributor", null))).toEqual([true, true]);   // the button
    expect(canMeasure(decided[12], "lead", null) || canMeasure(decided[13], "lead", null)).toBe(false);   // MA-5a-4 / MA-6-8: never a drawing's or an IFC's
    expect(unmeasuredOlder(newest, measured)).toEqual([]);   // the newest 10 have their own Measure
    expect(unmeasuredOlder(decided, new Error("not read — down"))).toEqual([]);   // never a guess
    // review: a failed or refused measure is no measure — the bridge takes a new one, so the desk offers it
    const failed = { items: [{ id: "cs-14", name: "n", rec }, { id: "cs-10", name: "n", rec: { ...rec, status: "failed" } }, { id: "cs-11", name: "n", rec: { ...rec, status: "refused" } }], capped: false };
    expect(unmeasuredOlder(decided, failed).map((c) => c.id)).toEqual(["cs-10", "cs-11"]);
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const v = measuredView(data, byId), older = unmeasuredOlder(decided, data);");
    expect(src).toContain('if (canMeasure(cs, role, null)) row.append(measureBtn(cs.id, "Measure against the scan"));');
    // review: the heading says an Undo in Revit is not read for these (canMeasure has no ledger rows here)
    expect(src).toContain("Placed as reported, no finished measure (older than the newest ${DECIDED_MAX} reports; an Undo in Revit since is not read here — the bridge refuses an undone one");
    expect(src).toContain("decided instanceof Error ? [] : decided, role.role); if (mb) tail.append(mb);");
  });
  it("the desk reads the newest measure after the ledger rows, and Measure sits behind canMeasure with one press, one run (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const verified = decided instanceof Error ? new Map<string, VerifyRecord | Error | null>() : await readVerified(base, key, decided.slice(0, DECIDED_MAX).filter((c) => c.job && !isDrawn(c)).map((c) => c.id));");
    expect(src).toContain("if (canMeasure(cs, role, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null)) {");
    expect(src).toContain('go.disabled = true; go.textContent = "Measuring…";');
  });
});

describe("edit cost (MA-8-1)", () => {
  const run: EditCostRun = { run: "job#40", label: "job-0003 (ledger #40)", filed: 12, web: 2, carried: 1, revit: 1, applied: 9, undone: 1, kept: 8, pending: 0, withdrawn: 0,
    share_changed: 4 / 11, complete: true, ceiling: "edits made after Apply, other than an Undo in Revit, are not seen" };

  it("says each count in words, carried apart, and the ceiling", () => {
    const l = editCostLine(run);
    expect(l).toContain("12 filed");
    expect(l).toContain("2 declined on the web");
    expect(l).toContain("1 declined before (carried)");
    expect(l).toContain("1 not applied in Revit (unticked, or removed at commit)");
    expect(l).toContain("1 undone");
    expect(l).toContain("8 of 11 kept as filed (4 not kept)"); // MA-8 nits (F-B5-2): share_changed 4/11 in its own terms
    expect(l).not.toContain("% changed");
    expect(l).toContain("edits made after Apply, other than an Undo in Revit, are not seen");
  });

  it("omits carried when none, says pending, and gives no percentage when nothing was decided", () => {
    const l = editCostLine({ ...run, carried: 0, pending: 3, share_changed: null });
    expect(l).not.toContain("carried");
    expect(l).toContain("3 still pending");
    expect(l).not.toContain("% changed");
  });

  it("keptWords (F-B5-2): the drill's 1 of 14 says what share_changed counts - not kept as filed - in the run line and the recipe line alike", () => {
    const drill = { ...run, filed: 14, web: 10, carried: 0, revit: 2, applied: 2, undone: 1, kept: 1, share_changed: 13 / 14 };
    expect(keptWords(drill)).toBe("1 of 14 kept as filed (13 not kept)");
    expect(editCostLine(drill)).toContain(" · 1 of 14 kept as filed (13 not kept) — ");
    expect(keptWords({ ...drill, pending: 14, share_changed: null })).toBe("1 kept");
  });

  it("says withdrawn ghosts are not in the share", () => {
    expect(editCostLine({ ...run, withdrawn: 20 })).toContain("20 withdrawn (not in the share)");
    expect(editCostLine(run)).not.toContain("withdrawn");
  });

  it("Publish sits behind a complete run and a lead, the reply names the ledger row, and the desk refreshes (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("if (r.complete && canReopen(role))");
    expect(src).toContain("rowWords(await postEditCostPublish(base, activePid(), r.run))}`); void show(); }");
  });

  it("F-B5-1: the run's line is a row of its own and Publish + the recipe controls sit on a wrapping row under it (source scan: no DOM here)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    const box = src.slice(src.indexOf("const editCostBox = "), src.indexOf("const recipesBox = "));
    expect(box).toContain('const row = el("div", "", "padding:.2rem 0");');
    expect(box).toContain('const controls = el("div", "", "display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-top:.2rem");');
    expect(box).toContain("row.append(el(\"div\", editCostLine(r)));");
    expect(box).toContain('controls.append(btn("Publish"');
    expect(box).toContain("controls.append(name, ...(scope ? [scope] : []), btn(\"Draft a recipe…\"");
    expect(box).toContain("if (controls.childElementCount) row.append(controls);");
    expect(box).not.toContain("row.append(btn(");
    expect(box).not.toContain('"flex:1"');
    expect(box).not.toContain("innerHTML");
  });

  it("readEditCost throws 'not read' on a failure, never an empty list", async () => {
    bfetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "ledger down" }) });
    await expect(readEditCost("http://b", "demo")).rejects.toThrow("not read — ledger down");
  });
});

describe("recipes (MA-8-13, D13)", () => {
  const body = JSON.parse(readFileSync(new URL("../../bridge/fixtures/recipe/good.json", import.meta.url), "utf8")) as RecipeRow["body"];
  const app = (id: number, role: string, counts = true) => ({ id, hash: "h", role, user_id: `u-${id}`, by: "x@example.test", at: null, counts });
  const row = (over: Partial<RecipeRow> = {}): RecipeRow => ({ ref: "recipe@1", version: 1, scope: "project", key: "demo", sha256: "ab".repeat(32), body, state: "pending", approved: false,
    approvals: [], withdrawn: null, why: null, installed_by: "lead@example.test", ...over });

  it("recipeLine: the reader and planner, the standards it ran on, the run kept of filed and the share changed - then where the approvals stand", () => {
    const l = recipeLine(row());
    expect(l).toBe("recipe@1 · project · Kladno storeys · sentinel-survey 0.6.0 → survey-planner 0.1.0 · guideline@7, type_catalog@3 · job-0013: 9 of 12 kept as filed (3 not kept) · no approval yet — a lead's and an owner's, two different people, are owed");
    expect(recipeLine(row({ approvals: [app(950, "lead")] }))).toContain("approved by a lead (#950); an owner's approval is owed");
    expect(recipeLine(row({ approvals: [app(951, "owner")] }))).toContain("approved by an owner (#951); a lead's approval is owed");
    const done = recipeLine(row({ state: "approved", approved: true, approvals: [app(950, "lead"), app(951, "owner")] }));
    expect(done).toContain("approved by a lead (#950) and an owner (#951) — a third person, who approved neither, may run it");
  });
  it("recipeLine: a withdrawn recipe runs no more, an untrusted body says why, and an approver who no longer holds the role is named as not counting", () => {
    expect(recipeLine(row({ state: "withdrawn", withdrawn: { id: 960 }, approvals: [app(950, "lead"), app(951, "owner")] }))).toContain("withdrawn (ledger #960) — it runs no more");
    expect(recipeLine(row({ state: "untrusted", why: "its body does not hash to the sha256 it was installed with" }))).toContain("not trusted — its body does not hash");
    const lapsed = recipeLine(row({ approvals: [app(950, "lead", false), app(951, "owner")] }));
    expect(lapsed).toContain("approved by an owner (#951); a lead's approval is owed");
    expect(lapsed).toContain("#950 no longer counts (its approver is not a lead or owner any more)");
    expect(recipeLine(row({ scope: "office" }))).toContain("recipe@1 · office ·");
    expect(recipeLine(row({ body: { ...body, verified: { ...body.verified, edit_cost: { ...body.verified.edit_cost, share_changed: null } } } }))).not.toContain("% changed");
    // MA-8 nits (F-B5-2): the drill's run, in the same words as the run line
    expect(recipeLine(row({ body: { ...body, verified: { ...body.verified, edit_cost: { filed: 14, web: 10, carried: 0, revit: 2, undone: 1, kept: 1, share_changed: 13 / 14 } } } })))
      .toContain("job-0013: 1 of 14 kept as filed (13 not kept) · ");
  });
  it("the words after a draft and after an approval", () => {
    expect(draftWords({ ref: "recipe@2", scope: "office" }, "job#900")).toBe("✓ Drafted recipe@2 (office) from job#900 — it runs once a lead and an owner (two different people) approve it; whoever runs it approved neither.");
    expect(approveWords({ ref: "recipe@1", role: "lead", approved: false, ledger: { id: 7, hash: "h" } })).toBe("Approved recipe@1 as lead · ledger #7 — an owner's approval, from another person, is owed.");
    expect(approveWords({ ref: "recipe@1", role: "owner", approved: true, ledger: null })).toContain("it is approved: a third person may run it");
  });
  it("readRecipes reads GET /cde/:key/recipes and throws 'not read' on a failure; the posts send the sha the desk shows and the scope", async () => {
    bfetch.mockResolvedValueOnce(res(200, { project: [], office: null }));
    expect(await readRecipes("http://b/", "demo")).toEqual({ project: [], office: null });
    expect(bfetch.mock.lastCall![0]).toBe("http://b/cde/demo/recipes");
    bfetch.mockResolvedValueOnce(res(503, { message: "ledger down" }));
    await expect(readRecipes("http://b", "demo")).rejects.toThrow("not read — ledger down");
    bfetch.mockResolvedValueOnce(res(200, {}));
    await expect(readRecipes("http://b", "demo")).rejects.toThrow("not read — the bridge answered without recipes");
    bwrite.mockResolvedValue({ ref: "recipe@1" });
    await postRecipeDraft("http://b", "demo", "job#900", "Kladno", "office");
    expect(bwrite).toHaveBeenLastCalledWith("http://b/cde/demo/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: "job#900", name: "Kladno", scope: "office" }) });
    await postRecipeApprove("http://b", "demo", row({ version: 3, scope: "office" }));
    expect(bwrite).toHaveBeenLastCalledWith("http://b/cde/demo/recipes/3/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256: "ab".repeat(32), scope: "office" }) });
    await postRecipeWithdraw("http://b", "demo", row());
    expect(bwrite.mock.lastCall![0]).toBe("http://b/cde/demo/recipes/1/withdraw");
  });
  it("the desk offers Draft to a lead on a complete job run with something kept, Approve while pending, and Run only once approved, to a contributor (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain(String.raw`if (r.complete && r.kept >= 1 && /^job#\d+$/.test(r.run) && canReopen(role)) {`);
    expect(src).toContain('if (live && canReopen(role) && r.state === "pending")');
    expect(src).toContain('if (r.state === "approved" && canDecide(role))');
    expect(src).toContain("tail.append(recipesBox(recipes, role.role))");
    // a recipe is not a standard in force: Settings lists no row (and so no Install JSON…) for it
    expect(readFileSync(new URL("./project-settings-panel.ts", import.meta.url), "utf8")).toContain("Object.entries(pointers).filter(([kind]) => kind !== \"recipe\")");
  });
});
