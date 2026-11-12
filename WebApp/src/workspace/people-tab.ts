// The People side tab (R2a): who is in which party on this project — Client, Lead firm, each Firm by team, No party yet —
// read from the members route through the workspace controller (a project switch drops it). Every word is textContent.
import { C, h } from "./dom";
import { pathSegment } from "../setups/escape-html";
import { groupByParty, INVITED_WORDS, type MemberRow } from "../setups/members-people";
import type { PaneCtx } from "./workspace-page";

export const PEOPLE_FOR_MEMBERS = "The people list is shown to members of the project.";
export const PEOPLE_HINT = "Parties and invitations are set in Project Settings, Members.";

export function peopleTab(ctx: PaneCtx): HTMLElement {
  const d = ctx.doc;
  const root = h(d, "div", `color:${C.soft};font:12px system-ui;line-height:1.5`);
  const list = h(d, "div");
  root.append(list, h(d, "p", `color:${C.muted};font:11px system-ui;margin:.6rem 0 0`, PEOPLE_HINT));
  list.append(h(d, "p", `color:${C.muted}`, "Reading the people…"));
  void ctx.ws.get<MemberRow[]>(`/cde/${pathSegment(ctx.st.key)}/members`).then((rows) => {
    list.replaceChildren();
    if (!Array.isArray(rows)) { list.append(h(d, "p", `color:${C.muted}`, PEOPLE_FOR_MEMBERS)); return; }
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
