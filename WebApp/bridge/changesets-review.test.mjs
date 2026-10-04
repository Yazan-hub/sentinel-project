// MA-3a (design §6.6, founder decision D17): the review states, one per ghost. A web decline binds (Revit shows it unticked with
// the reason and refuses the tick), a web accept is advice, only a lead re-opens a decline, and nothing is decided once Revit
// reported. Pure: changesets-logic.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts } from "./changesets-logic.mjs";

const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3a-review.json", import.meta.url), "utf8"));
const WHO = fx.who;
const LEAD = fx.reopen.who;
const decline = (proposal_guid, reason = "not this one") => ({ proposal_guid, decision: "decline", reason });
const accept = (proposal_guid) => ({ proposal_guid, decision: "accept" });

describe("review states (design §6.6)", () => {
  it("are proposed, accepted and declined; a ghost nobody decided is proposed; a doc from before MA-3a is at revision 0", () => {
    expect(REVIEW_STATES).toEqual(["proposed", "accepted", "declined"]);
    expect(reviewState(fx.before.elements[0])).toBe("proposed");
    expect(reviewRev({})).toBe(0);
    expect(reviewRev(fx.after)).toBe(1);
  });

  it("proposed → accepted or declined; accepted → declined; declined → proposed only by a re-open", () => {
    expect(reviewNext("proposed", "accept")).toBe("accepted");
    expect(reviewNext("proposed", "decline")).toBe("declined");
    expect(reviewNext("accepted", "decline")).toBe("declined");
    expect(reviewNext("declined", "reopen")).toBe("proposed");
  });

  it("every other step is a 409 in words", () => {
    expect(() => reviewNext("declined", "accept")).toThrow(/this ghost is declined — only a lead may re-open it, then it can be accepted/);
    expect(() => reviewNext("declined", "decline")).toThrow(/this ghost is already declined/);
    expect(() => reviewNext("accepted", "accept")).toThrow(/this ghost is already accepted/);
    expect(() => reviewNext("proposed", "reopen")).toThrow(/only a declined ghost can be re-opened \(this one is proposed\)/);
    expect(() => reviewNext("accepted", "reopen")).toThrow(/only a declined ghost can be re-opened \(this one is accepted\)/);
    try { reviewNext("accepted", "accept"); } catch (e) { expect(e.status).toBe(409); }
  });
});

describe("applyDecisions — the web desk's decisions on one changeset, all or none", () => {
  it("the shared fixture: `after` is what the bridge stores from `before`, `decisions` and `who` (tools/promote-check reads it)", () => {
    const { updated, rows } = applyDecisions(fx.before, fx.decisions, WHO);
    expect(updated).toEqual(fx.after);
    expect(rows).toEqual([
      { proposal_guid: "g-1", name: 'retype wall "W 1"', from: "proposed", to: "declined", reason: "wrong type: W 1 is a party wall" },
      { proposal_guid: "g-2", name: 'attach wall "W 1"', from: "proposed", to: "accepted", reason: null },
      { proposal_guid: "g-4", name: 'set_parameter wall "BDS_EXT_ARC_CMU_200 mm"', from: "proposed", to: "declined", reason: "no fire strategy issued yet" },
    ]);
  });

  it("does not change its input", () => {
    const before = JSON.parse(JSON.stringify(fx.before));
    applyDecisions(before, fx.decisions, WHO);
    expect(before).toEqual(fx.before);
  });

  it("a decline needs a reason; a reason is one line of at most 500 characters", () => {
    expect(() => applyDecisions(fx.before, [decline("g-1", "  ")], WHO)).toThrow(/a decline needs a reason — the ledger records it and Revit shows it/);
    expect(() => applyDecisions(fx.before, [{ proposal_guid: "g-1", decision: "decline" }], WHO)).toThrow(/a decline needs a reason/);
    expect(() => applyDecisions(fx.before, [decline("g-1", "x".repeat(501))], WHO)).toThrow(/a reason is one line of at most 500 characters/);
    expect(() => applyDecisions(fx.before, [decline("g-1", "two\nlines")], WHO)).toThrow(/one line/);
    try { applyDecisions(fx.before, [decline("g-1", "")], WHO); } catch (e) { expect(e.status).toBe(400); }
  });

  it("C9: an invisible reason is no reason, and a Unicode line break or control character is not one line", () => {
    for (const blank of ["​", " ​﻿ "]) expect(() => applyDecisions(fx.before, [decline("g-1", blank)], WHO)).toThrow(/a decline needs a reason/);
    for (const broken of ["a b", "a b", "a\u0085b", "a\u007fb"]) expect(() => applyDecisions(fx.before, [decline("g-1", broken)], WHO)).toThrow(/one line/);
    expect(() => reopenDecline(fx.after, "g-1", "​", LEAD)).toThrow(/a re-open needs a reason/);
  });

  it("an unknown or repeated guid, a decision that is not accept or decline, and an empty or oversized list are 400s", () => {
    expect(() => applyDecisions(fx.before, [accept("nope")], WHO)).toThrow(/decisions\[0\]: unknown proposal_guid "nope"/);
    expect(() => applyDecisions(fx.before, [accept("g-1"), decline("g-1")], WHO)).toThrow(/proposal_guid "g-1" appears twice in the decisions/);
    expect(() => applyDecisions(fx.before, [{ proposal_guid: "g-1", decision: "reopen" }], WHO)).toThrow(/decisions\[0\]\.decision must be accept or decline/);
    expect(() => applyDecisions(fx.before, [], WHO)).toThrow(/decisions must be 1–200 entries/);
    expect(() => applyDecisions(fx.before, "g-1", WHO)).toThrow(/decisions must be 1–200 entries/);
  });

  it("one refused step refuses the whole post, naming the ghost (all or none)", () => {
    let e;
    try { applyDecisions(fx.after, [accept("g-3"), accept("g-1")], WHO); } catch (x) { e = x; }
    expect(e.status).toBe(409);
    expect(e.message).toBe('retype wall "W 1": this ghost is declined — only a lead may re-open it, then it can be accepted');
  });

  it("an accepted ghost may still be declined; the revision goes up by one per post", () => {
    const { updated } = applyDecisions(fx.after, [decline("g-2", "attach to the roof instead")], { ...WHO, at: "2026-10-04T09:30:00.000Z" });
    expect(updated.review_rev).toBe(2);
    expect(updated.elements[1].review).toEqual({ state: "declined", action: "decline", reason: "attach to the roof instead", by: WHO.by, role: "contributor", at: "2026-10-04T09:30:00.000Z", rev: 2 });
  });

  it("nothing is decided once the changeset is not proposed (Revit reported, or it was withdrawn)", () => {
    for (const status of ["applied", "partially_applied", "declined", "withdrawn"])
      expect(() => applyDecisions({ ...fx.before, status }, [accept("g-1")], WHO)).toThrow(new RegExp(`changeset is ${status} — the web desk decides only while it is proposed`));
  });
});

describe("reopenDecline — a lead re-opens one decline", () => {
  it("the declined ghost is proposed again, with the lead's reason and what it re-opened", () => {
    const { updated, row } = reopenDecline(fx.after, fx.reopen.proposal_guid, fx.reopen.reason, LEAD);
    expect(updated.review_rev).toBe(2);
    expect(updated.updated_at).toBe(LEAD.at);
    expect(updated.elements[0].review).toEqual(fx.reopened_review);
    expect(updated.elements.slice(1)).toEqual(fx.after.elements.slice(1));
    expect(row).toEqual({ proposal_guid: "g-1", name: 'retype wall "W 1"', declined_by: WHO.by, declined_reason: "wrong type: W 1 is a party wall", reason: fx.reopen.reason });
  });

  it("needs a reason, a known guid, a declined ghost and a proposed changeset", () => {
    expect(() => reopenDecline(fx.after, "g-1", " ", LEAD)).toThrow(/a re-open needs a reason/);
    expect(() => reopenDecline(fx.after, "nope", "why", LEAD)).toThrow(/unknown proposal_guid "nope"/);
    expect(() => reopenDecline(fx.after, "g-2", "why", LEAD)).toThrow(/attach wall "W 1": only a declined ghost can be re-opened \(this one is accepted\)/);
    expect(() => reopenDecline({ ...fx.after, status: "applied" }, "g-1", "why", LEAD)).toThrow(/changeset is applied — the web desk decides only while it is proposed/);
  });
});

describe("resultConflicts — Revit's result against the web's declines (Q2)", () => {
  // fx.after: g-1 and g-4 declined at revision 1.
  it("applying a ghost declined at or before the revision Revit re-checked is refused (Revit showed it declined)", () => {
    const c = resultConflicts(fx.after, ["g-1", "g-3"], ["g-2", "g-4"], 1);
    expect(c.refused).toEqual([{ proposal_guid: "g-1", name: 'retype wall "W 1"', by: WHO.by, role: "contributor", reason: "wrong type: W 1 is a party wall", rev: 1 }]);
    expect(c.late).toEqual([]);
  });

  it("a ghost declined after that revision was applied over a decline Revit could not see: recorded, not refused", () => {
    const c = resultConflicts(fx.after, ["g-1"], ["g-2", "g-3", "g-4"], 0);
    expect(c.refused).toEqual([]);
    expect(c.late.map((x) => x.proposal_guid)).toEqual(["g-1"]);
  });

  it("no review_rev (an add-in before MA-3a, a script) is unchecked: never refused, never called late (C2)", () => {
    const c = resultConflicts(fx.after, ["g-1", "g-4"], ["g-2", "g-3"], undefined);
    expect(c.unchecked.map((x) => x.proposal_guid)).toEqual(["g-1", "g-4"]);
    expect([c.refused, c.late]).toEqual([[], []]);
    expect(resultConflicts(fx.after, ["g-1", "g-4"], ["g-2", "g-3"], null).unchecked.length).toBe(2);
    expect(resultConflicts(fx.after, ["g-1"], ["g-2", "g-3", "g-4"], 0).unchecked).toEqual([]); // a revision sent is judged
  });

  it("declined ghosts the result rejects are listed with the web's reason", () => {
    const c = resultConflicts(fx.after, ["g-3"], ["g-1", "g-2", "g-4"], 1);
    expect(c.declined_on_web.map((x) => [x.proposal_guid, x.reason])).toEqual([["g-1", "wrong type: W 1 is a party wall"], ["g-4", "no fire strategy issued yet"]]);
    expect(c.refused).toEqual([]);
  });

  it("a review_rev that is not 0 to the changeset's revision is a 400", () => {
    expect(() => resultConflicts(fx.after, [], ["g-1", "g-2", "g-3", "g-4"], 2)).toThrow(/review_rev must be the review revision Revit re-checked \(0–1\)/);
    expect(() => resultConflicts(fx.after, [], ["g-1"], -1)).toThrow(/review_rev/);
    expect(() => resultConflicts(fx.after, [], ["g-1"], "1")).toThrow(/review_rev/);
  });
});
