// The workspace Comments side tab (R2c): comment threads with an audience (Everyone or Delivery team), replies, resolve,
// assign and mention. The bridge folds the threads and decides who may see a Delivery-team one; this tab only draws what
// it was given. Every word of a comment goes in as textContent, never as markup.
import { C, btn, h } from "./dom";
import { pathSegment } from "../setups/escape-html";
import type { MemberRow } from "../setups/members-people";
import type { Audience, Thread } from "./workspace-state";
import type { PaneCtx } from "./workspace-page";

export const AUDIENCE_WORDS: Record<Audience, string> = { everyone: "Everyone", team: "Delivery team" };
export const WHOLE_DOCUMENT = "Whole document";

/** The small labels under a thread's author: its audience, Open or Resolved, who it is assigned to. */
export const threadLine = (t: Thread): string[] => [AUDIENCE_WORDS[t.audience] ?? "Everyone", t.resolved ? "Resolved" : "Open", ...(t.assignee ? [`Assigned to ${t.assignee.email}`] : [])];

/** Active members who can read a thread of this audience: a Delivery-team thread is not for the Client or a member with no party. */
export const peopleFor = (members: MemberRow[] | null, audience: Audience): MemberRow[] =>
  (members ?? []).filter((m) => m.state === "active" && (audience === "everyone" || m.party === "lead_appointed" || m.party === "appointed"));

const SOFT = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
const FIELD = `width:100%;box-sizing:border-box;background:#09090b;color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.3rem .4rem;font:12px system-ui`;

export function commentsTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, st = ctx.st, doc = st.doc, box = h(d, "div");
  if (!doc) return box;
  const base = `/bimdocs/${pathSegment(st.key)}/${pathSegment(doc.id)}/comments/threads`;
  const sectionId = ctx.focused;
  const heading = sectionId ? String(doc.sections.find((s) => s?.id === sectionId)?.heading ?? "") : WHOLE_DOCUMENT;
  const note = h(d, "div", `color:${C.warn};font:11px system-ui;margin:.4rem 0;line-height:1.4`);
  const level = st.access?.level;
  const canComment = !level || level !== "read";

  // Every action: send through the controller, then re-read the threads (which redraws this tab); a refusal says the bridge's words here.
  const act = async <T,>(sent: Promise<T | null>): Promise<void> => {
    if (await sent) await ctx.ws.reload();
    else note.textContent = ctx.ws.state().message;
  };

  /** A "Mention" choice: picking a member puts @e-mail into the box (the bridge resolves it). */
  const mentionPicker = (box2: HTMLTextAreaElement, audience: () => Audience): HTMLElement => {
    const sel = h(d, "select", `${FIELD};width:auto`);
    const fill = (): void => {
      sel.replaceChildren();
      const first = h(d, "option", "", "Mention…"); first.value = ""; sel.append(first);
      for (const m of peopleFor(st.members, audience())) { const o = h(d, "option", "", m.email); o.value = m.email; sel.append(o); }
    };
    fill();
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      box2.value = `${box2.value}${box2.value && !/\s$/.test(box2.value) ? " " : ""}@${sel.value} `;
      sel.value = "";
    });
    (sel as HTMLSelectElement & { refill?: () => void }).refill = fill;
    return sel;
  };

  const threadView = (t: Thread): HTMLElement => {
    const item = h(d, "div", `margin:0 0 .6rem;padding:.4rem .5rem;border:1px solid ${t.audience === "team" ? C.warn : C.line};border-radius:.35rem`);
    item.dataset.thread = t.id;
    item.append(
      h(d, "div", `color:${C.muted};font:11px system-ui`, `${t.author} · ${String(t.created_at ?? "").slice(0, 10)}`),
      h(d, "div", `color:${t.resolved ? C.muted : C.text};font:12px system-ui;white-space:pre-wrap;overflow-wrap:anywhere`, String(t.text ?? "")),
      h(d, "div", `color:${C.muted};font:10px system-ui;margin:.2rem 0`, threadLine(t).join(" · ")),
    );
    for (const r of t.replies ?? []) {
      const rep = h(d, "div", `margin:.3rem 0 0 .6rem;padding-left:.5rem;border-left:2px solid ${C.line}`);
      rep.append(h(d, "div", `color:${C.muted};font:11px system-ui`, `${r.author} · ${String(r.created_at ?? "").slice(0, 10)}`), h(d, "div", `color:${C.text};font:12px system-ui;white-space:pre-wrap;overflow-wrap:anywhere`, String(r.text ?? "")));
      item.append(rep);
    }
    const bar = h(d, "div", "display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin:.4rem 0 0");
    if (canComment) {
      const reply = h(d, "textarea", `${FIELD};min-height:2.2rem`); reply.setAttribute("placeholder", "Reply");
      const send = btn(d, "Reply");
      send.addEventListener("click", () => {
        const text = reply.value.trim();
        if (!text) { note.textContent = "Type your reply first."; return; }
        note.textContent = ""; void act(ctx.ws.post(`${base}/${pathSegment(t.id)}/reply`, { text }));
      });
      item.append(reply);
      bar.append(send, mentionPicker(reply, () => t.audience));
    }
    const resolve = btn(d, t.resolved ? "Reopen" : "Resolve");
    resolve.addEventListener("click", () => { note.textContent = ""; void act(ctx.ws.post(`${base}/${pathSegment(t.id)}/resolve`, { resolved: !t.resolved })); });
    const assign = h(d, "select", `${FIELD};width:auto`);
    const none = h(d, "option", "", "Assign to…"); none.value = ""; assign.append(none);
    for (const m of peopleFor(st.members, t.audience)) { const o = h(d, "option", "", m.email); o.value = m.user_id; assign.append(o); }
    if (t.assignee) { const o = h(d, "option", "", "No one"); o.value = "-"; assign.append(o); }
    assign.addEventListener("change", () => {
      if (!assign.value) return;
      note.textContent = ""; void act(ctx.ws.post(`${base}/${pathSegment(t.id)}/assign`, { assignee_uid: assign.value === "-" ? null : assign.value }));
    });
    bar.append(resolve, assign);
    item.append(bar);
    return item;
  };

  const form = (): HTMLElement => {
    const f = h(d, "div", `margin:.7rem 0 0;padding-top:.6rem;border-top:1px solid ${C.line}`);
    const text = h(d, "textarea", `${FIELD};min-height:3.4rem`); text.setAttribute("placeholder", sectionId ? "Comment on this section" : "Comment on the whole document");
    const row = h(d, "div", "display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin:.3rem 0 0");
    let audience: Audience = st.canTeam ? st.defaultAudience : "everyone";
    const pick = mentionPicker(text, () => audience);
    if (st.canTeam) {
      const sel = h(d, "select", `${FIELD};width:auto`);
      for (const a of ["everyone", "team"] as Audience[]) { const o = h(d, "option", "", AUDIENCE_WORDS[a]); o.value = a; sel.append(o); }
      sel.value = audience;
      sel.addEventListener("change", () => { audience = sel.value as Audience; (pick as unknown as { refill(): void }).refill(); });
      row.append(sel);
    }
    const add = btn(d, "Comment", true);
    add.addEventListener("click", () => {
      const t = text.value.trim();
      if (!t) { note.textContent = "Type your comment first."; return; }
      note.textContent = "";
      void act(ctx.ws.post(base, { anchor: { section_id: sectionId ?? null, block_id: null }, text: t, ...(st.canTeam ? { audience } : {}) }));
    });
    row.append(pick, add);
    f.append(text, row);
    return f;
  };

  const mine = st.threads.filter((t) => (t.anchor?.section_id ?? null) === (sectionId ?? null)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  box.append(h(d, "div", "color:#fff;font:700 12px system-ui;margin:0 0 .5rem", heading));
  if (!mine.length) box.append(h(d, "p", SOFT, sectionId ? "No comments on this section." : "No comments on the whole document."));
  for (const t of mine) box.append(threadView(t));
  box.append(canComment ? form() : h(d, "p", SOFT, "On this document you can read; commenting is switched off for you."), note);
  return box;
}
