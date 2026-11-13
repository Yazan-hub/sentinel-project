// The workspace Review tab (R2d): send the document for review (a deadline, the suitability and acceptance codes, a look at what
// will be frozen), then, while a round is open, who must decide, the decisions so far and the caller's own choices; a lead may
// withdraw. The bridge owns every rule and every refusal (its words are shown as given); this tab only draws and sends.
// Every word is textContent, in the plain words of spec §17; no ids or JSON are shown.
import { C, btn, h } from "./dom";
import { pathSegment } from "../setups/escape-html";
import { askYesNo } from "../setups/ask";
import { incorporatedWords } from "./versions-view";
import type { RoundView } from "./workspace-state";
import type { PaneCtx } from "./workspace-page";

/** What each decision is called on a button and in the list. Copy of DECISION_WORDS in bridge/rounds-logic.mjs (pinned by a test). */
export const DECISION_WORDS: Record<string, string> = {
  accept: "Accept", accept_with_comments: "Accept with comments", reject: "Reject",
  received: "Received", clarification: "Ask for clarification", selected: "Selected", not_selected: "Not selected", skipped: "Skipped",
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
  x.outside && x.words ? `${x.words} · ${when(x.at)} · ledger #${x.ledger_id}` // "Accepted outside Sentinel on 3 November 2026 by Jane Client; recorded in Sentinel by ..."
  : x.words ? `${x.who} (${x.party_words}) · ${x.words} · ${when(x.at)} · ledger #${x.ledger_id}`
  : `${x.who} (${x.party_words}) · ${DECISION_WORDS[x.decision] ?? x.decision}${x.note ? `: ${x.note}` : ""} · ${when(x.at)} · ledger #${x.ledger_id}`;

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
  const area = (placeholder: string): HTMLTextAreaElement => { const t = h(d, "textarea", `${FIELD};min-height:3.2rem;margin:.3rem 0`); t.setAttribute("placeholder", placeholder); t.value = ""; return t; };
  const input = (type: string, placeholder = ""): HTMLInputElement => { const i = h(d, "input", `${FIELD};margin:.2rem 0`); i.setAttribute("type", type); if (placeholder) i.setAttribute("placeholder", placeholder); i.value = ""; return i; };

  // R2d-2: "Needs a review: (reason)" until a round starts or a lead dismisses it with a note.
  if (cur.needs_review?.length && round?.status !== "open") {
    box.append(h(d, "p", `color:${C.warn};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`, `Needs a review: ${cur.needs_review.join("; ")}`));
    if (cur.can_dismiss) {
      const nb = area("Why no review is needed");
      const b = btn(d, "No review needed");
      b.addEventListener("click", () => {
        const text = nb.value.trim();
        if (!text) { note.textContent = "A note is required to dismiss this: say why no review is needed."; return; }
        void act(ctx.ws.post(`${base}/review-needed/dismiss`, { note: text }));
      });
      box.append(nb, b);
    }
  }

  if (round) {
    box.append(h(d, "p", SOFT, `${round.status_words}${round.deadline ? ` · due ${round.deadline}` : ""}${round.sent_by_email ? ` · sent by ${round.sent_by_email}` : ""}`));
    for (const s of round.steps) {
      const here = round.status === "open" && s.n === round.current;
      box.append(h(d, "div", HEAD, `Step ${s.n} · ${s.name}${s.complete ? " · done" : here ? " · now" : ""}`));
      box.append(h(d, "div", MUTED, `Who must decide: ${s.party_words}`));
      for (const o of s.owed ?? []) box.append(h(d, "div", SOFT, `Team ${o.team}: ${o.decided_by ? `decided by ${o.decided_by}` : o.skipped ? "skipped" : "waiting"}`));
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
      if (round.outside?.can && round.outside.choices.length) {
        box.append(h(d, "div", HEAD, "The client is outside Sentinel"));
        box.append(h(d, "div", MUTED, "Record what the client decided, the day they gave it and who gave it. It stays on the record as taken outside Sentinel."));
        const pick = h(d, "select", `${FIELD};width:auto;margin:.2rem 0`);
        for (const c of round.outside.choices) { const op = h(d, "option", "", DECISION_WORDS[c] ?? c); op.value = c; pick.append(op); }
        const date = input("date"), name = input("text", "Who at the client gave it"), ref = input("text", "Where it is kept (e-mail, letter), or the reason");
        const rec = btn(d, "Record the client's decision", true);
        rec.addEventListener("click", () => {
          if (!date.value) { note.textContent = "Say on which day the client gave it."; return; }
          if (!name.value.trim()) { note.textContent = "Say who at the client gave it."; return; }
          if (NOTE_REQUIRED.has(pick.value) && !ref.value.trim()) { note.textContent = "Write the reason in the last box: it is required here."; return; }
          void act(ctx.ws.post(`/bimdocs/${pathSegment(st.key)}/rounds/${pathSegment(round.round_id)}/record-outside`,
            { outcome: pick.value, date: date.value, name: name.value.trim(), ...(ref.value.trim() ? { evidence_ref: ref.value.trim() } : {}) }));
        });
        box.append(pick, date, name, ref, rec);
      }
      if (round.skip?.can && round.skip.step) {
        const step = round.skip.step;
        box.append(h(d, "div", HEAD, "A step nobody can decide"), h(d, "div", MUTED, round.skip.words ?? ""));
        const why = area("Why it is skipped (required)");
        const sk = btn(d, `Skip step ${step}`);
        sk.addEventListener("click", () => {
          if (!why.value.trim()) { note.textContent = "A skipped step carries its reason: write it above."; return; }
          void act(ctx.ws.post(`/bimdocs/${pathSegment(st.key)}/rounds/${pathSegment(round.round_id)}/skip`, { step, reason: why.value.trim() }));
        });
        box.append(why, sk);
      }
      const readSent = btn(d, "Read what was sent");
      readSent.addEventListener("click", () => void (async () => {
        await ctx.ws.viewVersion(0, `/bimdocs/${pathSegment(st.key)}/rounds/${pathSegment(round.round_id)}/render`); // the frozen render, as the Read view of a version
        if (ctx.ws.state().viewing?.version_no === 0) ctx.show("read"); else note.textContent = ctx.ws.state().message;
      })());
      box.append(readSent);
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
  if (st.versions.length) {
    const done = st.versions.filter((v) => cur.incorporated?.[String(v.version_no)]);
    if (done.length || cur.can_incorporate) box.append(h(d, "div", HEAD, "Incorporated in appointment"));
    for (const v of done) box.append(h(d, "div", SOFT, `v${v.version_no} · ${incorporatedWords(cur.incorporated![String(v.version_no)].parties)}`));
    if (cur.can_incorporate) {
      box.append(h(d, "div", MUTED, "After an appointment is signed, record which version it includes and whose appointments include it."));
      const which = h(d, "select", `${FIELD};width:auto;margin:.2rem 0`);
      for (const v of st.versions) { const op = h(d, "option", "", `v${v.version_no}${v.label ? ` · ${v.label}` : ""}`); op.value = String(v.version_no); which.append(op); }
      const parties = input("text", "Whose appointments include it (separate with commas)");
      const rec = btn(d, "Record");
      rec.addEventListener("click", () => {
        const list = parties.value.split(",").map((x) => x.trim()).filter(Boolean);
        if (!list.length) { note.textContent = "Name the parties whose appointments include this version."; return; }
        void act(ctx.ws.post(`${base}/incorporated`, { version_no: Number(which.value), parties: list }));
      });
      box.append(which, parties, rec);
    }
  }
  box.append(note);
  return box;
}
