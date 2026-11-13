// R2d Task 3: the pure round view and the plain words (spec §17).
import { describe, it, expect } from "vitest";
import { roundView, docWords, roundWords } from "./rounds-logic.mjs";

const BEP = [{ name: "Task teams", role: "contributor", kind: "task_teams" }, { name: "Lead firm", role: "lead", party: "lead_appointed" }, { name: "Client", role: "viewer", party: "appointing" }];
const roster = [
  { uid: "sender", email: "s@x", party: "lead_appointed", task_team: null, role: "owner" },
  { uid: "lead2", email: "l2@x", party: "lead_appointed", task_team: null, role: "lead" },
  { uid: "arc", email: "arc@x", party: "appointed", task_team: "ARC", role: "contributor" },
  { uid: "str", email: "str@x", party: "appointed", task_team: "STR", role: "contributor" },
  { uid: "cli", email: "cli@x", party: "appointing", task_team: null, role: "viewer" },
];
const round = (o = {}) => ({ id: "r1", doc_type: "BEP", stage: "pre_appointment", steps: BEP, teams_owed: ["ARC", "STR"], roster, codes: { shared: "S3", issue: "S4", accept: "A1" },
  sent_by: "sender", sent_by_email: "s@x", status: "open", issued_version: null, outcome: null, ...o });
const dec = (id, step, uid, email, party, task_team, decision, note = null) => ({ id, step, uid, email, party, task_team, decision, note, at: "t", ledger_id: 100 + id });
const arc = dec(1, 1, "arc", "arc@x", "appointed", "ARC", "accept");
const str = dec(2, 1, "str", "str@x", "appointed", "STR", "accept_with_comments");
const lead = dec(3, 2, "lead2", "l2@x", "lead_appointed", null, "accept");

describe("roundView", () => {
  it("step 1: each team owed, who decided, and the right caller may decide", () => {
    const v = roundView(round(), [arc], { uid: "str", rank: 2 });
    expect(v.current).toBe(1);
    expect(v.status_words).toBe("Out for review");
    expect(v.steps[0]).toMatchObject({ n: 1, party_words: "Firm · Team ARC, Firm · Team STR", complete: false,
      owed: [{ team: "ARC", decided_by: "arc@x" }, { team: "STR", decided_by: null }] });
    expect(v.steps[0].decisions).toEqual([{ who: "arc@x", party_words: "Firm · Team ARC", decision: "accept", note: null, at: "t", ledger_id: 101 }]);
    expect(v).toMatchObject({ can_decide: true, why_not: null, choices: ["accept", "accept_with_comments", "reject"], can_withdraw: false });
  });
  it("who may not decide, and why, in the database's words", () => {
    const why = (uid, ds = [], o = {}) => roundView(round(o), ds, { uid, rank: 2 }).why_not;
    expect(why("sender")).toBe("The sender does not decide their own round.");
    expect(why("arc", [arc])).toBe("You have already decided in this round.");
    expect(why("cli")).toMatch(/confirmed by each task team/);
    expect(why("lead2")).toMatch(/confirmed by each task team/);
    expect(why("stranger")).toMatch(/not on the roster/);
    expect(why(null)).toBe("not signed in");
    expect(why("cli", [arc, str])).toMatch(/decided by the Lead firm — you are the Client/);
    expect(why("arc", [], { status: "closed" })).toBe("This review round is no longer open.");
  });
  it("step 2 is the Lead firm, step 3 the Client; the sender is never the Lead firm decider", () => {
    expect(roundView(round(), [arc, str], { uid: "lead2" })).toMatchObject({ current: 2, can_decide: true });
    expect(roundView(round(), [arc, str], { uid: "sender", rank: 4 })).toMatchObject({ current: 2, can_decide: false, can_withdraw: true });
    const v3 = roundView(round({ issued_version: 1 }), [arc, str, lead], { uid: "cli" });
    expect(v3).toMatchObject({ current: 3, can_decide: true, status_words: "Issued, awaiting the client", issued_version: 1 });
  });
  it("choices per stage: tender step 3 offers the four outcomes; confirmed step 3 accept or reject; an EIR its two", () => {
    expect(roundView(round({ issued_version: 1 }), [arc, str, lead], { uid: "cli" }).choices).toEqual(["received", "clarification", "selected", "not_selected"]);
    expect(roundView(round({ stage: "confirmed" }), [arc, str, lead], { uid: "cli" }).choices).toEqual(["accept", "reject"]);
    const eir = round({ doc_type: "EIR", steps: [{ name: "Issuer", role: "lead", party: "lead_appointed" }, { name: "Acceptor", role: "viewer", party: "appointing" }], teams_owed: [] });
    expect(roundView(eir, [], { uid: "lead2" }).choices).toEqual(["accept", "accept_with_comments", "reject"]);
    expect(roundView(eir, [dec(1, 1, "lead2", "l2@x", "lead_appointed", null, "accept")], { uid: "cli" })).toMatchObject({ current: 2, choices: ["accept", "reject"] });
  });
  it("a closed round has no current step and nobody decides; withdraw is a lead's and only while open", () => {
    const v = roundView(round({ status: "closed", outcome: "selected", issued_version: 1 }), [arc, str, lead, dec(4, 3, "cli", "cli@x", "appointing", null, "selected")], { uid: "cli", rank: 3 });
    expect(v).toMatchObject({ current: null, can_decide: false, can_withdraw: false, outcome: "selected", status_words: "Submitted" });
    expect(v.steps.every((s) => s.complete)).toBe(true);
  });
  it("a reject does not complete its step", () => {
    const v = roundView(round(), [dec(1, 1, "arc", "arc@x", "appointed", "ARC", "reject", "no")], { uid: "str" });
    expect(v.steps[0].complete).toBe(false);
    expect(v.steps[0].owed[0].decided_by).toBeNull();
  });
});

describe("the plain words (§17)", () => {
  const wip = { status: "wip", stage: "pre_appointment", suitability: "S0" };
  it("every row", () => {
    expect(docWords(wip, null)).toBe("Draft");
    expect(docWords({ ...wip, status: "shared", suitability: "S3" }, round())).toBe("Out for review, S3");
    expect(docWords({ ...wip, suitability: "S0" }, round())).toBe("Out for review");
    expect(docWords({ ...wip, status: "shared", suitability: "S4" }, round({ issued_version: 1 }))).toBe("Issued, awaiting the client, S4");
    expect(docWords(wip, round({ status: "closed", outcome: "selected", issued_version: 1 }))).toBe("Submitted, S4");
    expect(docWords(wip, round({ status: "voided", outcome: "withdrawn", issued_version: 1 }))).toBe("Submitted, evaluation not recorded, S4");
    expect(docWords({ ...wip, status: "published", stage: "confirmed", suitability: "A1" }, round({ stage: "confirmed", status: "closed", outcome: "accepted" }))).toBe("Accepted, A1");
    expect(docWords({ ...wip, status: "archived" }, null)).toBe("Archived");
  });
  it("a round rejected before any issue, or at another stage, leaves a Draft; the version list can show the issue", () => {
    expect(docWords(wip, round({ status: "voided", outcome: "rejected" }))).toBe("Draft");
    expect(docWords({ ...wip, stage: "confirmed" }, round({ status: "closed", outcome: "selected", issued_version: 1 }))).toBe("Draft");
    expect(docWords({ ...wip, status: "shared", suitability: "S4" }, round(), [{ round_id: "r1" }])).toBe("Issued, awaiting the client, S4");
  });
  it("roundWords names the ends of a round", () => {
    expect(roundWords(round({ status: "voided", outcome: "rejected" }))).toBe("Rejected, back to draft");
    expect(roundWords(round({ status: "voided", outcome: "withdrawn" }))).toBe("Withdrawn, back to draft");
    expect(roundWords(round({ status: "closed", outcome: "accepted", stage: "confirmed" }))).toBe("Accepted");
  });
});
