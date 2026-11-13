import { describe, it, expect, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const yes = { v: true };
vi.mock("../setups/ask", () => ({ askYesNo: vi.fn(async () => yes.v) }));

import { reviewTab, codeChoices, decisionLine, DECISION_WORDS } from "./review-tab";
import { emptyState, type RoundCurrent, type RoundView } from "./workspace-state";
import { fakeDocument, findAll, textOf, click } from "./fake-dom";
import { askYesNo } from "../setups/ask";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all = (el: any, tag: string): any[] => findAll(el, tag);

const view = (o: Partial<RoundView> = {}): RoundView => ({ round_id: "r1", stage: "pre_appointment", status: "open", status_words: "Out for review", codes: { shared: "S3", issue: "S4" }, deadline: "2026-12-01",
  sent_by_email: "lead@x", sent_at: "2026-11-13T09:00:00Z", current: 1, can_decide: false, why_not: null, choices: [], can_withdraw: false, issued_version: null, outcome: null,
  steps: [
    { n: 1, name: "Task teams", party_words: "Firm · Team ARC, Firm · Team STR", owed: [{ team: "ARC", decided_by: "arc@x" }, { team: "STR", decided_by: null }],
      decisions: [{ who: "arc@x", party_words: "Firm · Team ARC", decision: "accept_with_comments", note: "mind the grid", at: "2026-11-14T10:05:00Z", ledger_id: 41 }], complete: false },
    { n: 2, name: "Lead firm", party_words: "Lead firm", decisions: [], complete: false },
  ], ...o });
const cur = (o: Partial<RoundCurrent> = {}): RoundCurrent => ({ round: null, words: "Draft", stage: "pre_appointment", doc_status: "wip", suitability: "S0", chain: true, can_send: true, appointment: { can: false, needs_note: false }, ...o });
function ctx(round: RoundCurrent | null, o: { post?: unknown; message?: string } = {}) {
  const post = vi.fn((o.post as never) ?? (async () => ({ ok: true })));
  const reload = vi.fn(async () => {});
  const show = vi.fn();
  const st = { ...emptyState("snowdon"), doc: { id: "d1", updated_at: "2026-11-13T08:00:00Z", sections: [] }, round, message: o.message ?? "Only a lead can do that." };
  return { ws: { post, reload, state: () => st }, st, doc: fakeDocument(), show } as never as { ws: { post: typeof post; reload: typeof reload }; st: typeof st; doc: Document; show: typeof show };
}
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
const by = (el: HTMLElement, label: string) => all(el, "button").filter((b) => textOf(b) === label);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (c: any) => reviewTab(c);

describe("words", () => {
  it("the decision words are the bridge's own", async () => {
    const m = await import(/* @vite-ignore */ pathToFileURL(resolve(__dirname, "../../bridge/rounds-logic.mjs")).href);
    expect(DECISION_WORDS).toEqual(m.DECISION_WORDS);
  });
  it("code choices by stage", () => {
    expect(codeChoices("pre_appointment").map((c) => [c.key, c.options, c.def])).toEqual([["shared", ["S1", "S2", "S3"], "S3"], ["issue", ["S4", "S5"], "S4"]]);
    expect(codeChoices("confirmed").map((c) => [c.key, c.options, c.def])).toEqual([["shared", ["S1", "S2", "S3"], "S3"], ["accept", ["A1", "A2", "A3"], "A1"]]);
    expect(codeChoices("revision").map((c) => c.key)).toEqual(["shared", "accept"]);
  });
  it("a decision line: who, party, words, note, when, ledger #", () => {
    expect(decisionLine(view().steps[0].decisions[0])).toBe("arc@x (Firm · Team ARC) · Accept with comments: mind the grid · 2026-11-14 10:05 · ledger #41");
  });
});

describe("no round", () => {
  it("a lead sees the send form: a deadline, the codes by stage, the freeze preview and Send", () => {
    const el = run(ctx(cur()));
    const t = textOf(el);
    expect(t).toContain("Send for review"); expect(t).toContain("S4"); expect(t).not.toContain("A1");
    expect(all(el, "input")[0].getAttribute("type")).toBe("date");
    expect(by(el, "See what will be frozen").length).toBe(1); expect(by(el, "Send").length).toBe(1);
    const c = textOf(run(ctx(cur({ stage: "confirmed" }))));
    expect(c).toContain("A1"); expect(c).not.toContain("S4");
  });
  it("See what will be frozen shows the draft on the Read view", () => {
    const c = ctx(cur()); click(by(run(c), "See what will be frozen")[0]);
    expect(c.show).toHaveBeenCalledWith("read");
  });
  it("Send posts the deadline and the codes (defaults S3 and S4), then reads everything again", async () => {
    const c = ctx(cur()), el = run(c);
    all(el, "input")[0].value = "2026-12-01";
    const sels = all(el, "select"); expect(sels.map((s) => s.value)).toEqual(["S3", "S4"]);
    sels[0].value = "S2";
    click(by(el, "Send")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/rounds", { codes: { shared: "S2", issue: "S4" }, updated_at: "2026-11-13T08:00:00Z", deadline: "2026-12-01" });
    expect(c.ws.reload).toHaveBeenCalledTimes(1);
  });
  it("a refusal shows the bridge's words and does not reload", async () => {
    const c = ctx(cur(), { post: async () => null, message: "Team STR has nobody who can decide." }), el = run(c);
    click(by(el, "Send")[0]); await tick();
    expect(textOf(el)).toContain("Team STR has nobody who can decide."); expect(c.ws.reload).not.toHaveBeenCalled();
  });
  it("someone who cannot send gets no form; a document with no chain says it is shared and published from the Documents tab", () => {
    const t = textOf(run(ctx(cur({ can_send: false, chain: false }))));
    expect(t).not.toContain("Send for review"); expect(t).toContain("Documents tab");
  });
});

describe("an open round", () => {
  it("steps with Who must decide, owed teams and who decided, and the decisions so far", () => {
    const t = textOf(run(ctx(cur({ round: view(), words: "Out for review, S3" }))));
    for (const w of ["Out for review", "due 2026-12-01", "Step 1 · Task teams · now", "Who must decide: Firm · Team ARC, Firm · Team STR", "Team ARC: decided by arc@x", "Team STR: waiting", "arc@x (Firm · Team ARC) · Accept with comments: mind the grid", "ledger #41", "Step 2 · Lead firm", "Who must decide: Lead firm"]) expect(t).toContain(w);
    expect(t).not.toContain("Send for review");
  });
  it("the caller's choices are buttons; a note is required for reject and says so before sending", async () => {
    const c = ctx(cur({ round: view({ can_decide: true, choices: ["accept", "accept_with_comments", "reject"] }) })), el = run(c);
    expect(all(el, "button").map(textOf)).toEqual(["Accept", "Accept with comments", "Reject"]);
    expect(textOf(el)).toContain("A note is required for: Reject.");
    click(by(el, "Reject")[0]); await tick();
    expect(c.ws.post).not.toHaveBeenCalled(); expect(textOf(el)).toContain("A note is required to reject");
    all(el, "textarea")[0].value = "  wrong grid  ";
    click(by(el, "Reject")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/rounds/r1/decide", { decision: "reject", note: "wrong grid" });
    expect(c.ws.reload).toHaveBeenCalledTimes(1);
  });
  it("accept needs no note", async () => {
    const c = ctx(cur({ round: view({ can_decide: true, choices: ["accept", "reject"] }) }));
    click(by(run(c), "Accept")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/rounds/r1/decide", { decision: "accept" });
  });
  it("tender step 3 choices use the bridge's words, a note for clarification", () => {
    const el = run(ctx(cur({ round: view({ can_decide: true, choices: ["received", "clarification", "selected", "not_selected"] }) })));
    expect(all(el, "button").map(textOf)).toEqual(["Received", "Ask for clarification", "Selected", "Not selected"]);
    expect(textOf(el)).toContain("A note is required for: Ask for clarification.");
  });
  it("why_not shows when the caller cannot decide", () => {
    const t = textOf(run(ctx(cur({ round: view({ why_not: "You sent this round, so you do not decide it." }) }))));
    expect(t).toContain("You sent this round, so you do not decide it.");
  });
  it("Withdraw from review asks first, then posts; a No sends nothing", async () => {
    const c = ctx(cur({ round: view({ can_withdraw: true }) })), el = run(c);
    yes.v = false; click(by(el, "Withdraw from review")[0]); await tick();
    expect(askYesNo).toHaveBeenCalled(); expect(c.ws.post).not.toHaveBeenCalled();
    yes.v = true; click(by(el, "Withdraw from review")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/rounds/r1/withdraw", {});
    expect(c.ws.reload).toHaveBeenCalledTimes(1);
  });
  it("no withdraw button for someone who may not", () => {
    expect(by(run(ctx(cur({ round: view() }))), "Withdraw from review")).toEqual([]);
  });
});

describe("appointment indicated", () => {
  const closed = view({ status: "closed", status_words: "Submitted", outcome: "Selected", steps: view().steps.slice(0, 1) });
  it("after a tender is selected: Appointment indicated opens the confirmation; a note box when the bridge says so", async () => {
    const c = ctx(cur({ round: closed, can_send: false, appointment: { can: true, needs_note: true } })), el = run(c);
    expect(textOf(el)).toContain("Submitted"); expect(by(el, "Send").length).toBe(0);
    click(by(el, "Appointment indicated: open confirmation")[0]); await tick();
    expect(c.ws.post).not.toHaveBeenCalled(); expect(textOf(el)).toContain("A note is required");
    all(el, "textarea")[0].value = "Client letter of 12 Nov";
    click(by(el, "Appointment indicated: open confirmation")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/appointment-indicated", { note: "Client letter of 12 Nov" });
    expect(c.ws.reload).toHaveBeenCalledTimes(1);
  });
  it("with no note needed it posts straight away", async () => {
    const c = ctx(cur({ round: closed, can_send: false, appointment: { can: true, needs_note: false } }));
    click(by(run(c), "Appointment indicated: open confirmation")[0]); await tick();
    expect(c.ws.post).toHaveBeenCalledWith("/bimdocs/snowdon/d1/appointment-indicated", {});
  });
});

describe("safety", () => {
  it("a note or a name is text, never markup; nothing without the round read", () => {
    const v = view(); v.steps[0].decisions[0].note = "<b>x</b>";
    const el = run(ctx(cur({ round: v })));
    expect(textOf(el)).toContain("<b>x</b>"); expect(all(el, "b")).toEqual([]);
    expect(textOf(run(ctx(null)))).toBe("");
  });
});
