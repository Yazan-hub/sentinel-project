// The People side tab (R2a, R2c): your level on this document, who may read, comment or edit it (a lead sets it), the section
// leads (picked from the members), and who is in which party on this project — Client, Lead firm, each Firm by team, No party yet.
// Read through the workspace controller (a project switch drops it). Every word is textContent.
import { C, btn, h } from "./dom";
import { pathSegment } from "../setups/escape-html";
import { groupByParty, INVITED_WORDS, type MemberRow } from "../setups/members-people";
import type { PaneCtx } from "./workspace-page";

export const PEOPLE_FOR_MEMBERS = "The people list is shown to members of the project.";
export const PEOPLE_HINT = "Parties and invitations are set in Project Settings, Members.";
export const NOT_A_MEMBER = "Not a member";
export const PROJECT_ROLE = "Project role";
export const LEVEL_CHOICES: [string, string][] = [["", PROJECT_ROLE], ["read", "Can read"], ["comment", "Can comment"], ["edit", "Can edit"]];

/** "On this document you can read." — the caller's level, from GET …/me. */
export const myLevelLine = (level: string | undefined): string =>
  !level ? "" : level === "govern" ? "On this document you can edit it and set who else can." : `On this document you can ${level}.`;

/** "" when the lead is a signed-in member (or there is none, or the list was not read); "Invited" or "Not a member" otherwise. */
export function leadStatus(owner: string | null | undefined, members: MemberRow[] | null): "" | "Invited" | typeof NOT_A_MEMBER {
  const who = String(owner ?? "").trim().toLowerCase();
  if (!who || !members) return "";
  const m = members.find((x) => String(x.email ?? "").toLowerCase() === who);
  return !m ? NOT_A_MEMBER : m.state === "invited" ? "Invited" : "";
}

export interface AccessRow { who: string; kind: "member" | "team"; key: string; level: "" | "read" | "comment" | "edit" }
/** One row per task team and per active viewer or contributor (a lead or owner is not limited), with what is set now ("" = the project role). */
export function accessRows(members: MemberRow[], teams: { code: string; name?: string | null }[],
  access: { members?: Record<string, string>; teams?: Record<string, string> } | null | undefined): AccessRow[] {
  const lvl = (v: string | undefined): AccessRow["level"] => (v === "read" || v === "comment" || v === "edit" ? v : "");
  return [
    ...teams.map((t): AccessRow => ({ who: `Team ${t.code}${t.name ? ` · ${t.name}` : ""}`, kind: "team", key: t.code, level: lvl(access?.teams?.[t.code]) })),
    ...members.filter((m) => m.state === "active" && (m.role === "viewer" || m.role === "contributor"))
      .map((m): AccessRow => ({ who: m.email, kind: "member", key: m.user_id, level: lvl(access?.members?.[m.user_id]) })),
  ];
}

const SOFT = `color:${C.soft};font:12px system-ui;line-height:1.5;margin:0 0 .5rem`;
const SELECT = `background:#09090b;color:${C.text};border:1px solid ${C.btnBorder};border-radius:.3rem;padding:.2rem .3rem;font:12px system-ui;max-width:100%`;
const HEAD = "color:#fff;font:700 12px system-ui;margin:.8rem 0 .3rem";

export function peopleTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc, doc = ctx.st.doc;
  const root = h(d, "div", `color:${C.soft};font:12px system-ui;line-height:1.5`);
  const mine = h(d, "p", SOFT, myLevelLine(ctx.st.access?.level));
  const note = h(d, "div", `color:${C.warn};font:11px system-ui;margin:.4rem 0;line-height:1.4`);
  const extra = h(d, "div"); // document access and section leads, drawn when the members are read
  const list = h(d, "div");
  root.append(mine, extra, list, h(d, "p", `color:${C.muted};font:11px system-ui;margin:.6rem 0 0`, PEOPLE_HINT), note);
  list.append(h(d, "p", `color:${C.muted}`, "Reading the people…"));

  const saved = async (sent: Promise<unknown>): Promise<void> => {
    if (await sent) ctx.refresh("all");
    else note.textContent = ctx.ws.state().message;
  };

  const leads = (rows: MemberRow[]): HTMLElement => {
    const box = h(d, "div");
    box.append(h(d, "div", HEAD, "Section leads"));
    for (const [i, s] of (doc?.sections ?? []).entries()) {
      if (!s) continue;
      const line = h(d, "div", "margin:0 0 .4rem");
      line.append(h(d, "div", `color:${C.text}`, `${i + 1}. ${String(s.heading ?? "")}`));
      const status = leadStatus(s.owner, rows);
      if (ctx.canGovern) {
        const sel = h(d, "select", SELECT);
        const opt = (value: string, label: string): void => { const o = h(d, "option", "", label); o.value = value; sel.append(o); };
        opt("", "No lead");
        for (const m of rows) opt(m.email, m.state === "invited" ? `${m.email} (Invited)` : m.email);
        if (s.owner && status === NOT_A_MEMBER) opt(s.owner, `${s.owner} (${NOT_A_MEMBER})`); // an unchanged legacy lead stays selectable; a new pick must be a member
        sel.value = s.owner ?? "";
        sel.addEventListener("change", () => { note.textContent = ""; void saved(ctx.ws.write("PATCH", `/section/${pathSegment(s.id)}`, { owner: sel.value || null })); });
        line.append(sel);
      } else {
        line.append(h(d, "div", `color:${C.muted};font-size:11px`, `${s.owner ? s.owner : "No lead"}${status ? ` · ${status}` : ""}`));
      }
      box.append(line);
    }
    return box;
  };

  const access = (rows: MemberRow[], teams: { code: string; name?: string | null }[]): HTMLElement => {
    const box = h(d, "div");
    box.append(h(d, "div", HEAD, "Access to this document"));
    const set = accessRows(rows, teams, doc?.access);
    if (!set.length) { box.append(h(d, "p", `color:${C.muted}`, "No task teams or viewers and contributors yet.")); return box; }
    const picks: [AccessRow, HTMLSelectElement][] = [];
    for (const r of set) {
      const line = h(d, "div", "display:flex;gap:.5rem;align-items:center;justify-content:space-between;margin:0 0 .3rem");
      const sel = h(d, "select", SELECT);
      for (const [v, label] of LEVEL_CHOICES) { const o = h(d, "option", "", label); o.value = v; sel.append(o); }
      sel.value = r.level;
      line.append(h(d, "span", `color:${C.text};overflow-wrap:anywhere`, r.who), sel);
      picks.push([r, sel]);
      box.append(line);
    }
    const save = btn(d, "Save access", true);
    save.addEventListener("click", () => {
      // Review R2c-2: start from what is stored, so an override this editor does not show (an invited member's) survives a Save.
      const body: { members: Record<string, string>; teams: Record<string, string> } = { members: { ...(doc?.access?.members ?? {}) }, teams: { ...(doc?.access?.teams ?? {}) } };
      for (const [r, sel] of picks) { const bag = body[r.kind === "team" ? "teams" : "members"]; if (sel.value) bag[r.key] = sel.value; else delete bag[r.key]; }
      note.textContent = ""; void saved(ctx.ws.write("PUT", "/access", body));
    });
    box.append(save);
    return box;
  };

  void ctx.ws.get<MemberRow[]>(`/cde/${pathSegment(ctx.st.key)}/members`).then(async (rows) => {
    list.replaceChildren();
    if (!Array.isArray(rows)) { list.append(h(d, "p", `color:${C.muted}`, PEOPLE_FOR_MEMBERS)); return; }
    if (ctx.canGovern) {
      const teams = await ctx.ws.get<{ code: string; name?: string | null }[]>(`/teams/${pathSegment(ctx.st.key)}`);
      extra.append(access(rows, Array.isArray(teams) ? teams : []));
    }
    if (doc) extra.append(leads(rows));
    for (const g of groupByParty(rows)) {
      list.append(h(d, "div", "color:#fff;font:700 12px system-ui;margin:.5rem 0 .2rem", g.title));
      for (const m of g.members) {
        const line = h(d, "div", "display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap");
        line.append(h(d, "span", `color:${C.text}`, m.email), h(d, "span", `color:${C.muted};font-size:11px`, m.role));
        if (m.state === "invited") line.append(h(d, "span", `color:${C.warn};font-size:11px`, INVITED_WORDS));
        list.append(line);
      }
    }
  });
  return root;
}
