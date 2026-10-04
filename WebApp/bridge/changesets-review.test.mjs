// MA-3a (design §6.6, founder decision D17): the review states, one per ghost. A web decline binds (Revit shows it unticked with
// the reason and refuses the tick), a web accept is advice, only a lead re-opens a decline, and nothing is decided once Revit
// reported. Pure: changesets-logic.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REVIEW_STATES, reviewState, reviewRev, reviewNext, applyDecisions, reopenDecline, resultConflicts, resultReasons,
  carryKey, carryDeclines, declineWords } from "./changesets-logic.mjs";

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

describe("resultReasons — Revit's reason per declined ghost (MA-3b2)", () => {
  const rr = fx.revit_reasons;
  it("the shared fixture: each reason is trimmed, a blank one is dropped, and one for a ghost the web also declined is kept", () => {
    expect(resultReasons(rr.result.rejected, rr.result.reasons)).toEqual(rr.stored);
  });

  it("none sent, or only blank ones, is null — nothing is stored", () => {
    expect(resultReasons(["g-1"], undefined)).toBeNull();
    expect(resultReasons(["g-1"], null)).toBeNull();
    expect(resultReasons(["g-1"], {})).toBeNull();
    expect(resultReasons(["g-1"], { "g-1": "  " })).toBeNull();
  });

  it("the one-line rule is the web desk's (the fixture's `rule`, which tools/promote-check reads for ChangesetTrust.DeclineReason)", () => {
    for (const c of rr.rule) {
      if (c.ok) expect(resultReasons(["g"], { g: c.text })).toEqual(c.clean == null ? null : { g: c.clean });
      else expect(() => resultReasons(["g"], { g: c.text })).toThrow(/a reason is one line of at most 500 characters/);
    }
    expect(resultReasons(["g"], { g: "x".repeat(500) })).toEqual({ g: "x".repeat(500) });
    expect(() => resultReasons(["g"], { g: "x".repeat(501) })).toThrow(/a reason is one line of at most 500 characters/);
    expect(() => resultReasons(["g"], { g: 7 })).toThrow(/a reason is one line/);
  });

  it("a reason for a ghost the result does not reject, and a `reasons` that is not an object, are 400s in words", () => {
    expect(() => resultReasons(["g-1"], { "g-2": "applied, not declined" })).toThrow(/reasons names "g-2", which this result does not reject — a reason is for a declined ghost/);
    expect(() => resultReasons(["g-1"], JSON.parse('{"__proto__":"x"}'))).toThrow(/reasons names "__proto__"/);
    expect(() => resultReasons(["g-1"], ["g-1"])).toThrow(/reasons must be \{proposal_guid: reason\} — one line for each ghost this result rejects/);
    expect(() => resultReasons(["g-1"], "why")).toThrow(/reasons must be/);
    const thrown = (f) => { try { f(); } catch (e) { return e; } return null; }; // review C7: fails when nothing is thrown
    expect(thrown(() => resultReasons(["g-1"], { nope: "x" }))).toMatchObject({ status: 400 });
    // review C9: a ghost keyed __proto__ keeps its reason (an own key, never the prototype)
    expect(Object.keys(resultReasons(["__proto__"], JSON.parse('{"__proto__":"kept"}')))).toEqual(["__proto__"]);
  });
});

describe("carryDeclines — a decline carried to the next filing (MA-3b3)", () => {
  const c3 = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/ma3b3-carry.json", import.meta.url), "utf8"));
  const bare = (cs) => cs.elements.map(({ review, ...e }) => e);
  const counts = (o) => ({ carried: o.carried.length, no_reason: o.no_reason, creates: o.creates, unverified: o.unverified });
  /** `cs` as a signed-in contributor's Revit reported it: these guids rejected (the rest applied), with these reasons. */
  const reported = (cs, rejected, reasons) => ({ ...cs, status: "partially_applied", review_rev: reviewRev(cs) + 1, result: {
    applied: cs.elements.filter((e) => !rejected.includes(e.proposal_guid)).map((e) => ({ proposal_guid: e.proposal_guid, revit_element_id: 1 })),
    rejected, note: null, reported_at: "2026-10-04T14:00:00.000Z", reported_by: "second@example.com", reported_role: "contributor", ...(reasons ? { reasons } : {}) } });
  const W2 = c3.changeset.elements[1];

  it("the shared fixture: a web decline and a Revit decline with a reason are stamped on the same change; the rest is not, and is counted", () => {
    const out = carryDeclines(bare(c3.changeset), c3.earlier);
    expect(out.elements).toEqual(c3.changeset.elements);
    expect(counts(out)).toEqual(c3.changeset.carry);
    expect(out.carried).toEqual(c3.carried);
    expect(out.elements.filter((e) => e.review).map((e) => [e.proposal_guid, e.review.rev, e.review.role, e.review.carried_from.origin]))
      .toEqual([["n-1", 0, "contributor", "web"], ["n-2", 0, "contributor", "revit"]]);
  });

  it("the newest decision stands whatever order the store answers in; the input is not changed", () => {
    const els = bare(c3.changeset), copy = JSON.parse(JSON.stringify(els));
    expect(carryDeclines(els, [...c3.earlier].reverse()).elements).toEqual(c3.changeset.elements);
    expect(els).toEqual(copy);
  });

  it("nothing earlier, or nothing that matches: the elements are answered as they came and nothing is counted", () => {
    for (const earlier of [[], null, undefined, [c3.earlier[1]]]) {
      const out = carryDeclines(bare(c3.changeset), earlier);
      expect(out.elements).toEqual(bare(c3.changeset));
      expect(counts(out)).toEqual({ carried: 0, no_reason: 0, creates: 0, unverified: 0 });
    }
  });

  it("a carried decline Revit then reports as rejected is carried again from its FIRST origin (never chained)", () => {
    const again = carryDeclines(bare(c3.changeset), [...c3.earlier, reported(c3.changeset, ["n-1", "n-2", "n-3"], null)]);
    expect(again.elements).toEqual(c3.changeset.elements);
    expect(again.carried).toEqual(c3.carried);
    expect(counts(again)).toEqual({ carried: 2, no_reason: 1, creates: 1, unverified: 0 }); // n-8 was applied by that report: nothing stands
  });

  it("a re-opened decline is not carried; a Revit decline with a reason after the re-open is, as Revit's own", () => {
    const re = reopenDecline(c3.changeset, "n-1", "W 1 is external after all", LEAD);
    expect(re.row.carried_from).toEqual(c3.changeset.elements[0].review.carried_from);
    const open = carryDeclines(bare(c3.changeset), [...c3.earlier, re.updated]);
    expect(open.carried.map((x) => x.proposal_guid)).toEqual(["n-2"]);
    expect(open.elements[0].review).toBeUndefined();
    const later = carryDeclines(bare(c3.changeset), [...c3.earlier, reported(re.updated, ["n-1"], { "n-1": "still a party wall" })]);
    expect(later.elements[0].review).toEqual({ state: "declined", action: "decline", reason: "still a party wall", by: "second@example.com", role: "contributor",
      at: "2026-10-04T14:00:00.000Z", rev: 0, carried_from: { changeset: "cs-ma3b3", name: "Promote (DD) · GR-FFL", proposal_guid: "n-1", origin: "revit" } });
    expect(later.elements[1].review).toBeUndefined(); // n-2 was applied by that report (over its decline): nothing stands
  });

  it("a rejection with no reason of its own is never a decline: a rolled-back Apply carries nothing, and never replaces a decline that stands", () => {
    const { review, ...w2 } = W2;
    const rolledBack = { id: "cs-old", name: "Promote (DD) · GR-FFL", status: "declined", created_at: "2026-10-04T12:30:00.000Z", elements: [{ ...w2, proposal_guid: "o-1" }],
      result: { applied: [], rejected: ["o-1"], note: "Revit transaction failed — rolled back: a wall could not be joined", reported_at: "2026-10-04T12:31:00.000Z", reported_by: "modeller@example.com" } };
    const alone = carryDeclines([w2], [rolledBack]);
    expect(alone.elements).toEqual([w2]);
    expect(counts(alone)).toEqual({ carried: 0, no_reason: 1, creates: 0, unverified: 0 });
    expect(carryDeclines([w2], [...c3.earlier, rolledBack]).elements[0].review).toEqual(review); // cs-a's decline with a reason still stands
  });

  it("carryKey: the element, the op and what it sets — a create, or a ghost that is not whole, has none", () => {
    const uid = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
    const retype = (place, kind = "wall", id = uid) => carryKey({ kind, op: "retype", target: { unique_id: id }, place });
    expect(retype({ TypeName: "T" })).toBe(retype({ TypeName: " T " }, "wall", uid.toUpperCase()));
    // C13: a type's and a level's name is compared as the add-in resolves it — case-insensitively (ChangesetExecutor, OrdinalIgnoreCase).
    expect(retype({ TypeName: "T" })).toBe(retype({ TypeName: "t" }));
    expect(retype({ TypeName: "T", FamilyName: "F" }, "door")).toBe(retype({ TypeName: "t", FamilyName: "f" }, "door"));
    expect(retype({ TypeName: "T", FamilyName: "F" }, "door")).not.toBe(retype({ TypeName: "T", FamilyName: "G" }, "door"));
    expect(retype({})).toBeNull();
    const attach = (place) => carryKey({ kind: "wall", op: "attach", target: { unique_id: uid }, place });
    expect(attach({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" })).not.toBe(attach({ BaseLevel: "GR-FFL", TopLevel: "02-FFL" }));
    expect(attach({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" })).toBe(attach({ BaseLevel: "gr-ffl", TopLevel: "01-ffl" }));
    expect(attach({ BaseLevel: "GR-FFL" })).toBeNull();
    expect(attach({ BaseLevel: "GR-FFL", TopLevel: "01-FFL" })).not.toBe(retype({ TypeName: "GR-FFL", FamilyName: "01-FFL" }));
    const set = (parameter, to) => carryKey({ kind: "wall", op: "set_parameter", target: { unique_id: uid }, place: { TypeName: "T" }, parameter, to });
    expect(set("FireRating", "60 min")).toBe(set("firerating", "60 min"));
    expect(set("FireRating", "60 min")).not.toBe(set("FireRating", "90 min"));
    expect(set("FireRating", "60 min")).not.toBe(set("AcousticRating", "60 min"));
    expect(set("FireRating", undefined)).toBeNull();
    expect(carryKey({ kind: "wall", op: "create", target: null, place: { TypeName: "T" } })).toBeNull();
    expect(carryKey(null)).toBeNull();
  });

  it("a result that applies a carried decline is refused whatever review_rev it claims, and the refusal says where the decline was made", () => {
    const hit = resultConflicts(c3.changeset, ["n-1", "n-2"], ["n-3", "n-4", "n-5", "n-6", "n-7", "n-8"], 0);
    expect(hit.refused.map((x) => [x.proposal_guid, x.rev, x.carried_from.origin])).toEqual([["n-1", 0, "web"], ["n-2", 0, "revit"]]);
    expect(declineWords(hit.refused[0])).toBe('declined on the web by reviewer@example.com (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge');
    expect(declineWords(hit.refused[1])).toBe('declined in Revit by modeller@example.com (contributor) in "Promote (DD) · GR-FFL" and carried here by the bridge');
    expect(declineWords(fx.after.elements[0].review)).toBe("declined on the web by reviewer@example.com (contributor)");
    // C15: an origin the bridge does not know is "before" (Revit's ReviewLine and the desk's declinedBy say the same), never "on the web".
    expect(declineWords({ by: "x", role: null, carried_from: { origin: "a script", name: "N" } })).toBe('declined before by x in "N" and carried here by the bridge');
    expect(resultConflicts(fx.after, [], ["g-1"], 1).declined_on_web[0]).not.toHaveProperty("carried_from");
    // C6: a result with no review_rev — the carried decline was on the filing's 201 reply, so it is refused, never "unchecked".
    const blind = resultConflicts(c3.changeset, ["n-1"], [], undefined);
    expect([blind.refused.map((x) => x.proposal_guid), blind.unchecked]).toEqual([["n-1"], []]);
  });

  it("C1: a Revit reason is a decline only when a signed-in member reported it — the machine credential's, or a result with no role stored, carries nothing and is counted", () => {
    const { review, ...w2 } = W2;
    const script = (role) => ({ id: "cs-s", name: "Script", status: "declined", created_at: "2026-10-04T12:30:00.000Z", elements: [{ ...w2, proposal_guid: "s-1" }],
      result: { applied: [], rejected: ["s-1"], note: null, reported_at: "2026-10-04T12:31:00.000Z", reported_by: "lead@example.com", ...(role ? { reported_role: role } : {}),
        reasons: { "s-1": "claimed under a lead's name" } } });
    for (const role of ["service", null]) {
      const out = carryDeclines([w2], [script(role)]);
      expect(out.elements).toEqual([w2]);
      expect(counts(out)).toEqual({ carried: 0, no_reason: 0, creates: 0, unverified: 1 });
    }
    expect(carryDeclines([w2], [script("lead")]).elements[0].review).toMatchObject({ by: "lead@example.com", role: "lead", reason: "claimed under a lead's name" });
    expect(carryDeclines([w2], [...c3.earlier, script("service")]).elements[0].review).toEqual(review); // it never replaces a decline that stands
  });

  it("C2: the newest DECISION stands, by when it was made — not by when its changeset was filed", () => {
    const { review, ...w2 } = W2;
    const X = { id: "cs-x", name: "X", status: "proposed", created_at: "2026-10-05T08:00:00.000Z", review_rev: 0, elements: [{ ...w2, proposal_guid: "x-1" }], result: null };
    const declinedAt = (cs, g, at) => ({ ...cs, elements: cs.elements.map((e) => (e.proposal_guid === g
      ? { ...e, review: { state: "declined", action: "decline", reason: "no", by: "reviewer@example.com", role: "contributor", at, rev: 1 } } : e)) });
    // X is filed at 08:00 and waits; Y, filed at 09:00 with the same change, is declined on the web at 09:10; X is applied in Revit at 11:00.
    const Y = declinedAt({ ...X, id: "cs-y", name: "Y", created_at: "2026-10-05T09:00:00.000Z", elements: [{ ...w2, proposal_guid: "y-1" }] }, "y-1", "2026-10-05T09:10:00.000Z");
    const appliedAt = (at) => ({ ...X, status: "applied", result: { applied: [{ proposal_guid: "x-1", revit_element_id: 1 }], rejected: [], reported_at: at, reported_by: "modeller@example.com", reported_role: "contributor" } });
    expect(carryDeclines([w2], [X, Y]).carried).toHaveLength(1);
    expect(carryDeclines([w2], [appliedAt("2026-10-05T11:00:00.000Z"), Y]).carried).toEqual([]);
    expect(carryDeclines([w2], [appliedAt("2026-10-05T09:10:00.000Z"), Y]).carried).toEqual([]); // the same moment: the clear stands
    expect(carryDeclines([w2], [appliedAt("2026-10-05T09:05:00.000Z"), Y]).carried).toHaveLength(1); // applied first, declined after
    // The origin X is declined at 09:00 and still proposed; B, filed at 10:00, holds the carried copy; a lead re-opens on X at 12:00.
    const origin = declinedAt(X, "x-1", "2026-10-05T09:00:00.000Z");
    const B = { ...X, id: "cs-b2", created_at: "2026-10-05T10:00:00.000Z", elements: carryDeclines([{ ...w2, proposal_guid: "b-9" }], [origin]).elements };
    expect(B.elements[0].review).toMatchObject({ at: "2026-10-05T09:00:00.000Z", carried_from: { changeset: "cs-x" } });
    const reopened = reopenDecline(origin, "x-1", "retype it after all", { ...LEAD, at: "2026-10-05T12:00:00.000Z" }).updated;
    expect(carryDeclines([w2], [origin, B]).carried).toHaveLength(1);
    expect(carryDeclines([w2], [reopened, B]).carried).toEqual([]);
  });

  it("C12: an apply the bridge itself recorded as made over a standing decline (late, or unchecked) is not a clear — the decline stands and is carried", () => {
    const { review, ...w2 } = W2;
    const decl = { state: "declined", action: "decline", reason: "no", by: "reviewer@example.com", role: "contributor", at: "2026-10-05T09:10:00.000Z", rev: 1 };
    const over = (field, seen) => ({ id: "cs-o", name: "O", status: "applied", created_at: "2026-10-05T08:00:00.000Z", review_rev: 2, elements: [{ ...w2, proposal_guid: "o-1", review: decl }],
      result: { applied: [{ proposal_guid: "o-1", revit_element_id: 1 }], rejected: [], reported_at: "2026-10-05T11:00:00.000Z", reported_by: "modeller@example.com", reported_role: "contributor",
        review_rev_seen: seen, declined_on_web: [], applied_over_late_decline: [], applied_over_decline_unchecked: [],
        [field]: [{ proposal_guid: "o-1", name: 'retype wall "W 2"', by: decl.by, role: decl.role, reason: decl.reason, rev: 1 }] } });
    for (const [field, seen] of [["applied_over_late_decline", { value: 0, claimed: true }], ["applied_over_decline_unchecked", null]]) {
      const out = carryDeclines([w2], [over(field, seen)]);
      expect(out.elements[0].review, field).toEqual({ ...decl, rev: 0, carried_from: { changeset: "cs-o", name: "O", proposal_guid: "o-1", origin: "web" } });
      expect(out.carried, field).toHaveLength(1);
    }
    // An apply the bridge recorded as plain (over no decline) is still a clear, as before.
    expect(carryDeclines([w2], [{ ...over("declined_on_web", null), elements: [{ ...w2, proposal_guid: "o-1" }] }]).carried).toEqual([]);
  });

  it("C7: a create is counted only when a create of the same kind, type and level was declined before", () => {
    const n6 = bare(c3.changeset)[5];
    expect(carryDeclines([n6], c3.earlier).creates).toBe(1);
    expect(carryDeclines([{ ...n6, place: { ...n6.place, TypeName: "BDS_INT_ARC_CMU_100 mm" } }, { ...n6, place: { ...n6.place, LevelName: "01-FFL" } }, { ...n6, kind: "floor" }], c3.earlier).creates).toBe(0);
    expect(carryDeclines([n6], [c3.earlier[3]]).creates).toBe(0); // no declined create on the project: nothing is said
  });
});
