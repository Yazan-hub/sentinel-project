// The workspace Review tab (R2d): send the document for review (a deadline, the suitability and acceptance codes, a look at what
// will be frozen), then, while a round is open, who must decide, the decisions so far and the caller's own choices; a lead may
// withdraw. The bridge owns every rule and every refusal (its words are shown as given); this tab only draws and sends.
// Every word is textContent, in the plain words of spec §17; no ids or JSON are shown.
import { C, btn, h } from "./dom";
import { pathSegment } from "../setups/escape-html";
import { askYesNo } from "../setups/ask";
import type { RoundView } from "./workspace-state";
import type { PaneCtx } from "./workspace-page";

/** What each decision is called on a button and in the list. Copy of DECISION_WORDS in bridge/rounds-logic.mjs (pinned by a test). */
export const DECISION_WORDS: Record<string, string> = {
  accept: "Accept", accept_with_comments: "Accept with comments", reject: "Reject",
  received: "Received", clarification: "Ask for clarification", selected: "Selected", not_selected: "Not selected",
};
export const NOTE_REQUIRED = new Set(["reject", "clarification"]);

/** The codes a send form offers at a stage: shared S1-S3 (default S3); before the appointment an issue code S4/S5 (default S4); after it an acceptance code A1-A3 (default A1). */
export function codeChoices(stage: string): { key: "shared" | "issue" | "accept"; label: string; options: string[]; def: string }[] {
  const shared = { key: "shared" as const, label: "Suitability while it is out for review", options: ["S1", "S2", "S3"], def: "S3" };
  return stage === "pre_appointment"
    ? [shared, { key: "issue", label: "Suitability when it is issued", options: ["S4", "S5"], def: "S4" }]
    : [shared, { key: "accept", label: "Acceptance code", options: ["A1", "A2", "A3"], def: "A1" }];
}

const SOFT = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
const MUTED = `color:${C.muted};font:11px system-ui;line-height:1.4;margin:0 0 .4rem`;
const HEAD = "color:#fff;font:700 12px system-ui;margin:.7rem 0 .3rem";
const FIELD = `width:100%;box-sizing:border-box;background:#09090b;color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.3rem .4rem;font:12px system-ui`;
const when = (at: string): string => String(at ?? "").slice(0, 16).replace("T", " ");

/** One decision on a line: who, their party, the decision in words, the note, when, ledger #n. */
export const decisionLine = (x: RoundView["steps"][number]["decisions"][number]): string =>
  `${x.who} (${x.party_words}) · ${DECISION_WORDS[x.decision] ?? x.decision}${x.note ? `: ${x.note}` : ""} · ${when(x.at)} · ledger #${x.ledger_id}`;

export function reviewTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st, doc = st.doc, cur = st.round, box = h(d, "div");
  if (!doc || !cur) return box;
  const base = `/bimdocs/${pathSegment(st.key)}/${pathSegment(doc.id)}`;
  const note = h(d, "div", `color:${C.warn};font:11px system-ui;margin:.4rem 0;line-height:1.4`);
  // Every action: send through the controller, then read everything again (which redraws this tab); a refusal says the bridge's words here.
  const act = async <T,>(sent: Promise<T | null>): Promise<void> => {
    if (await sent) await ctx.ws.reload();
    else note.textContent = ctx.ws.state().message;
  };
  const noteBox = (): HTMLTextAreaElement => { const t = h(d, "textarea", `${FIELD};min-height:3.2rem;margin:.3rem 0`); t.setAttribute("placeholder", "A note (optional)"); t.value = ""; return t; };
  const round = cur.round;

  if (round) {
    box.append(h(d, "p", SOFT, `${round.status_words}${round.deadline ? ` · due ${round.deadline}` : ""}${round.sent_by_email ? ` · sent by ${round.sent_by_email}` : ""}`));
    if (round.outcome) box.append(h(d, "p", SOFT, round.outcome));
    for (const s of round.steps) {
      const here = round.status === "open" && s.n === round.current;
      box.append(h(d, "div", HEAD, `Step ${s.n} · ${s.name}${s.complete ? " · done" : here ? " · now" : ""}`));
      box.append(h(d, "div", MUTED, `Who must decide: ${s.party_words}`));
      for (const o of s.owed ?? []) box.append(h(d, "div", SOFT, `Team ${o.team}: ${o.decided_by ? `decided by ${o.decided_by}` : "waiting"}`));
      for (const x of s.decisions) box.append(h(d, "div", SOFT, decisionLine(x)));
    }
    if (round.status === "open") {
      if (round.can_decide && round.choices.length) {
        box.append(h(d, "div", HEAD, "Your decision"));
        const nb = noteBox();
        const needs = round.choices.filter((c) => NOTE_REQUIRED.has(c)).map((c) => DECISION_WORDS[c] ?? c);
        if (needs.length) box.append(h(d, "div", MUTED, `A note is required for: ${needs.join(", ")}.`));
        const row = h(d, "div", "display:flex;gap:.3rem;flex-wrap:wrap");
        for (const c of round.choices) {
          const b = btn(d, DECISION_WORDS[c] ?? c, c === "accept" || c === "selected");
          b.addEventListener("click", () => {
            const text = nb.value.trim();
            if (NOTE_REQUIRED.has(c) && !text) { note.textContent = `A note is required to ${(DECISION_WORDS[c] ?? c).toLowerCase()}. Write it above, then choose again.`; return; }
            void act(ctx.ws.post(`/bimdocs/${pathSegment(st.key)}/rounds/${pathSegment(round.round_id)}/decide`, { decision: c, ...(text ? { note: text } : {}) }));
          });
          row.append(b);
        }
        box.append(nb, row);
      } else if (round.why_not) box.append(h(d, "p", MUTED, round.why_not));
      if (round.can_withdraw) {
        const w = btn(d, "Withdraw from review");
        w.style.marginTop = ".6rem";
        w.addEventListener("click", () => void (async () => {
          if (!(await askYesNo("Withdraw this document from review?", { doc: d, ok: "Withdraw" }))) return;
          await act(ctx.ws.post(`/bimdocs/${pathSegment(st.key)}/rounds/${pathSegment(round.round_id)}/withdraw`, {}));
        })());
        box.append(w);
      }
    }
  }

  if (cur.appointment.can) {
    box.append(h(d, "div", HEAD, "Appointment"));
    const nb = cur.appointment.needs_note ? noteBox() : null;
    if (nb) box.append(h(d, "div", MUTED, "A note is required here."), nb);
    const b = btn(d, "Appointment indicated: open confirmation", true);
    b.addEventListener("click", () => {
      const text = nb?.value.trim() ?? "";
      if (nb && !text) { note.textContent = "A note is required before the confirmation is opened."; return; }
      void act(ctx.ws.post(`${base}/appointment-indicated`, text ? { note: text } : {}));
    });
    box.append(b);
  }

  if (cur.can_send && round?.status !== "open") {
    box.append(h(d, "div", HEAD, "Send for review"));
    const deadline = h(d, "input", `${FIELD};width:auto`); deadline.setAttribute("type", "date");
    box.append(h(d, "label", MUTED, "Decide by (optional)"), deadline);
    const picks: Record<string, HTMLSelectElement> = {};
    for (const c of codeChoices(cur.stage)) {
      const sel = h(d, "select", `${FIELD};width:auto;margin:.2rem 0`);
      for (const o of c.options) { const op = h(d, "option", "", o); op.value = o; sel.append(op); }
      sel.value = c.def; picks[c.key] = sel;
      box.append(h(d, "div", MUTED, c.label), sel);
    }
    const see = btn(d, "See what will be frozen");
    see.addEventListener("click", () => ctx.show("read")); // the draft Read is the freeze preview
    const send = btn(d, "Send", true);
    send.addEventListener("click", () => {
      const codes = Object.fromEntries(Object.entries(picks).map(([k, s]) => [k, s.value]));
      void act(ctx.ws.post(`${base}/rounds`, { codes, updated_at: doc.updated_at, ...(deadline.value ? { deadline: deadline.value } : {}) }));
    });
    const row = h(d, "div", "display:flex;gap:.3rem;margin-top:.5rem");
    row.append(see, send);
    box.append(row);
  } else if (!round && !cur.chain) box.append(h(d, "p", MUTED, "This document is not sent for review in rounds. Share and publish from the Documents tab."));
  box.append(note);
  return box;
}
