// R2d Task 3: the pure round view and the plain words (spec §17).
import { describe, it, expect } from "vitest";
import { roundView, docWords, roundWords, outsideWords, longDate, revisionReasons, incorporatedByVersion } from "./rounds-logic.mjs";

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
    expect(v.steps[0].decisions).toEqual([{ who: "arc@x", party_words: "Firm · Team ARC", decision: "accept", note: null, at: "t", ledger_id: 101, outside: false, words: null }]);
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

describe("R2d-2: the client outside Sentinel and the skip rule", () => {
  const noClient = roster.filter((r) => r.uid !== "cli");
  const lead2dec = dec(3, 2, "lead2", "l2@x", "lead_appointed", null, "accept");
  it("a step recorded outside Sentinel reads in the plain words, with the date spelled out and the recorder named", () => {
    expect(longDate("2026-11-03")).toBe("3 November 2026");
    const d = { outside: true, decision: "accept", outside_date: "2026-11-03", outside_name: "Jane Client", email: "sam@lead.test" };
    expect(outsideWords(d)).toBe("Accepted outside Sentinel on 3 November 2026 by Jane Client; recorded in Sentinel by sam@lead.test");
    const v = roundView(round({ stage: "confirmed", roster: noClient }), [arc, str, lead2dec, { ...dec(4, 3, "lead2", "l2@x", "appointing", null, "accept"), ...d }], { uid: "lead2", rank: 3, outside: true });
    expect(v.steps[2].decisions[0]).toMatchObject({ outside: true, evidence: null, words: "Accepted outside Sentinel on 3 November 2026 by Jane Client; recorded in Sentinel by sam@lead.test" });
    const kept = roundView(round({ stage: "confirmed", roster: noClient }), [arc, str, lead2dec, { ...dec(4, 3, "lead2", "l2@x", "appointing", null, "accept"), ...d, evidence_ref: "signed letter" }], { uid: "lead2", rank: 3, outside: true });
    expect(kept.steps[2].decisions[0].evidence).toBe("signed letter"); // F-R2d-11: where it is kept reaches the screen
    expect(kept.steps[0].decisions[0]).not.toHaveProperty("evidence"); // only an outside decision carries it
  });
  it("outside.can: a lead, the setting on, the Client's step waiting, no Client on the roster, not the sender", () => {
    const at3 = [arc, str, lead2dec], r = (o = {}) => round({ stage: "confirmed", roster: noClient, ...o });
    expect(roundView(r(), at3, { uid: "lead2", rank: 3, outside: true }).outside).toEqual({ can: true, choices: ["accept", "reject"] });
    expect(roundView(round({ roster: noClient, issued_version: 1 }), at3, { uid: "lead2", rank: 3, outside: true }).outside.choices).toEqual(["received", "clarification", "selected", "not_selected"]);
    expect(roundView(r(), at3, { uid: "lead2", rank: 3, outside: false }).outside.can).toBe(false);
    expect(roundView(r(), at3, { uid: "arc", rank: 2, outside: true }).outside.can).toBe(false);
    expect(roundView(r(), at3, { uid: "sender", rank: 4, outside: true }).outside.can).toBe(false);
    expect(roundView(r(), [arc, str], { uid: "lead2", rank: 3, outside: true }).outside.can).toBe(false);
    expect(roundView(round({ stage: "confirmed" }), at3, { uid: "lead2", rank: 3, outside: true }).outside.can).toBe(false);
  });
  it("0055: an EIR's Client step is recorded outside at either place in its chain, as accept or reject, and is never skipped", () => {
    const leads = roster.filter((r) => r.party === "lead_appointed");
    const eir = (steps, o = {}) => round({ doc_type: "EIR", steps, teams_owed: [], roster: leads, ...o });
    const clientIssues = [{ name: "Issue", role: "viewer", party: "appointing" }, { name: "Accept", role: "lead", party: "lead_appointed" }];
    const clientAccepts = [{ name: "Issue", role: "lead", party: "lead_appointed" }, { name: "Accept", role: "viewer", party: "appointing" }];
    const me = { uid: "lead2", rank: 3, outside: true };
    expect(roundView(eir(clientIssues), [], me)).toMatchObject({ current: 1, outside: { can: true, choices: ["accept", "reject"] }, skip: { can: false } });
    expect(roundView(eir(clientAccepts), [], me).outside.can).toBe(false); // step 1 is the Lead firm's
    expect(roundView(eir(clientAccepts), [dec(1, 1, "lead2", "l2@x", "lead_appointed", null, "accept")], me)).toMatchObject({ current: 2, outside: { can: true, choices: ["accept", "reject"] }, skip: { can: false } });
    expect(roundView(eir(clientIssues), [], { ...me, outside: false }).outside.can).toBe(false);
    expect(roundView(eir(clientIssues), [], { ...me, uid: "sender", rank: 4 }).outside.can).toBe(false);
    expect(roundView(eir(clientIssues, { roster }), [], me).outside.can).toBe(false); // a Client on the roster decides in Sentinel
  });
  it("skip.can: tender only; step 1 for a team with no member able to confirm, or the Client's step with no Client", () => {
    const r1 = round({ teams_owed: ["ARC", "STR", "MEP"], roster: noClient });
    expect(roundView(r1, [arc], { uid: "lead2", rank: 3 }).skip).toMatchObject({ can: true, step: 1, teams: ["MEP"] });
    expect(roundView(r1, [arc], { uid: "lead2", rank: 3 }).skip.words).toMatch(/Firm . Team MEP/);
    expect(roundView(round({ roster: noClient }), [arc, str], { uid: "lead2", rank: 3 }).skip.can).toBe(false);
    expect(roundView(round({ roster: noClient }), [arc, str, lead2dec], { uid: "lead2", rank: 3 }).skip).toMatchObject({ can: true, step: 3, teams: [] });
    expect(roundView(round(), [arc, str, lead2dec], { uid: "lead2", rank: 3 }).skip.can).toBe(false);
    expect(roundView(round({ roster: noClient, stage: "confirmed" }), [arc, str, lead2dec], { uid: "lead2", rank: 3 }).skip.can).toBe(false);
    expect(roundView(r1, [arc], { uid: "arc", rank: 2 }).skip.can).toBe(false);
  });
  it("skip.can: a team only the sender could confirm, or whose members are no longer active, is skippable (the database's rule)", () => {
    const withSender = round({ teams_owed: ["ARC", "SND"], roster: [...roster, { uid: "sender", email: "s@x", party: "lead_appointed", task_team: "SND", role: "owner" }] });
    expect(roundView(withSender, [arc], { uid: "lead2", rank: 3 }).skip).toMatchObject({ can: true, teams: ["SND"] });
    const gone = round({ teams_owed: ["ARC", "STR"] });
    expect(roundView(gone, [arc], { uid: "lead2", rank: 3, activeUids: ["sender", "lead2", "arc"] }).skip).toMatchObject({ can: true, teams: ["STR"] });
    expect(roundView(gone, [arc], { uid: "lead2", rank: 3, activeUids: ["sender", "lead2", "arc", "str"] }).skip.can).toBe(false);
    expect(roundView(gone, [arc], { uid: "lead2", rank: 3 }).skip.can).toBe(false); // activeUids unknown: the roster stands
  });
  it("a skipped team completes step 1 and shows as skipped; a skipped step 3 ends in 'Submitted, evaluation not recorded'", () => {
    const sk = { ...dec(2, 1, "lead2", "l2@x", "appointed", "STR", "skipped", "no engineer yet") };
    const v = roundView(round(), [arc, sk], { uid: "lead2", rank: 3 });
    expect(v.steps[0]).toMatchObject({ complete: true });
    expect(v.steps[0].owed[1]).toMatchObject({ team: "STR", skipped: true });
    expect(v.steps[0].decisions[1].words).toBe("Skipped (Team STR): no engineer yet");
    const closed = round({ status: "closed", outcome: "skipped", issued_version: 1 });
    expect(roundWords(closed)).toBe("Submitted, evaluation not recorded");
    expect(docWords({ status: "wip", stage: "pre_appointment", suitability: "S0" }, closed)).toBe("Submitted, evaluation not recorded, S4");
  });
});

describe("R2d-2: Needs a review (revisionReasons)", () => {
  const doc = { id: "d1", doc_type: "BEP", status: "wip", created_at: "2026-11-01T00:00:00Z", responds_to: "eir1", responds_to_version: 2 };
  const row = (action, at, extra = {}) => ({ action, at, entity_type: "membership", entity_id: null, old_value: null, new_value: {}, ...extra });
  it("reads each trigger once, from the rows after the last round started", () => {
    const last = { sent_at: "2026-11-05T00:00:00Z" };
    const rows = [
      row("member_joined", "2026-11-04T00:00:00Z"),
      row("membership_party_changed", "2026-11-06T00:00:00Z", { old_value: { party: "appointed" }, new_value: { party: "lead_appointed" } }),
      row("membership_party_changed", "2026-11-06T01:00:00Z", { old_value: { party: "appointed" } }),
      row("membership_party_changed", "2026-11-06T02:00:00Z", { new_value: { party: "appointed", task_team: "MEP" } }),
      row("member_role_changed", "2026-11-06T03:00:00Z"),
      row("gate:pass design", "2026-11-06T04:00:00Z", { entity_type: "stage_gate", new_value: { next_stage: "coordination" } }),
      row("artefact_installed naming@3", "2026-11-06T05:00:00Z", { entity_type: "artefact" }),
      row("artefact_installed ruleset@3", "2026-11-06T05:30:00Z", { entity_type: "artefact" }),
      row("annex_row_changed", "2026-11-06T06:00:00Z", { entity_type: "annex", new_value: { annex: "risk_register", touches: "strategy" } }),
      row("annex_row_added", "2026-11-06T07:00:00Z", { entity_type: "annex", new_value: { annex: "mobilisation", touches: "none" } }),
      row("published", "2026-11-06T08:00:00Z", { entity_type: "bim_document", entity_id: "eir1", new_value: { version_no: 3 } }),
      row("deliverable_late", "2026-11-06T09:00:00Z"),
    ];
    expect(revisionReasons(doc, last, rows)).toEqual([
      "a member's party or task team changed", "Firm · Team MEP gained a member", "a member's role changed", "the project moved to the coordination stage",
      "the naming standard was reinstalled", "the risk register list changed (strategy)", "the EIR this document answers was republished"]);
    expect(revisionReasons(doc, last, [row("member_joined", "2026-11-06T00:00:00Z")])).toEqual(["a member joined the project"]);
    expect(revisionReasons(doc, last, [row("created", "2026-11-06T00:00:00Z", { entity_type: "task_team", new_value: { code: "MEP" } })])).toEqual(["A task team joined: MEP"]);
  });
  it("without a round the clock starts at the document's creation; a dismissal clears what came before it; an old EIR version is not a reason", () => {
    expect(revisionReasons(doc, null, [row("member_joined", "2026-10-30T00:00:00Z")])).toEqual([]);
    const rows = [row("member_joined", "2026-11-02T00:00:00Z"), row("revision_trigger_dismissed", "2026-11-03T00:00:00Z", { entity_type: "bim_document", entity_id: "d1" }), row("member_role_changed", "2026-11-04T00:00:00Z")];
    expect(revisionReasons(doc, null, rows)).toEqual(["a member's role changed"]);
    expect(revisionReasons(doc, null, [row("published", "2026-11-02T00:00:00Z", { entity_type: "bim_document", entity_id: "eir1", new_value: { version_no: 2 } })])).toEqual([]);
    expect(revisionReasons(doc, null, [row("review:doc_published", "2026-11-02T00:00:00Z", { entity_type: "review", new_value: { document_id: "eir1", version_no: 3 } })])).toEqual(["the EIR this document answers was republished"]);
  });
  it("a dismissal of another document does not clear this one; READINESS, TIDP and archived documents need no review", () => {
    const rows = [row("member_joined", "2026-11-02T00:00:00Z"), row("revision_trigger_dismissed", "2026-11-03T00:00:00Z", { entity_type: "bim_document", entity_id: "other" })];
    expect(revisionReasons(doc, null, rows)).toEqual(["a member joined the project"]);
    for (const d of [{ ...doc, doc_type: "READINESS" }, { ...doc, doc_type: "TIDP" }, { ...doc, status: "archived" }]) expect(revisionReasons(d, null, rows)).toEqual([]);
  });
  it("incorporatedByVersion keeps the latest row per version", () => {
    const r = (v, parties, at) => ({ action: "document_incorporated", at, actor: "l@x", new_value: { version_no: v, sha: "s" + v, parties } });
    expect(incorporatedByVersion([r(1, ["A"], "2026-11-02T00:00:00Z"), r(1, ["A", "B"], "2026-11-03T00:00:00Z"), r(2, ["C"], "2026-11-01T00:00:00Z"), { action: "other" }]))
      .toEqual({ 1: { parties: ["A", "B"], sha: "s1", at: "2026-11-03T00:00:00Z", by: "l@x" }, 2: { parties: ["C"], sha: "s2", at: "2026-11-01T00:00:00Z", by: "l@x" } });
  });
});
