// Project Settings: "The client is not in Sentinel" (R2d-2, spec §7 and §10). An owner turns it on when the client accepts by e-mail or on paper;
// a lead then records the client's step in the Review tab, with the date and the name. The bridge and the database refuse what this screen does not offer.
// Every word is textContent.
import { C, btn, h } from "../workspace/dom";

export interface ClientOutside { on: boolean; can_change: boolean; has_client: boolean }

export const CLIENT_OUTSIDE_TITLE = "The client is not in Sentinel";
export const CLIENT_OUTSIDE_HELP = "Turn this on when the client accepts documents by e-mail or on paper. A lead then records the client's decision in the review, with the day and the name of the person who gave it, and it stays on the record as taken outside Sentinel.";

/** The block: the setting in words and, for an owner, the button that changes it. `change` answers null when it worked, else the refusal's words (shown as given). */
export function clientOutsideBlock(d: Document, s: ClientOutside, change: (on: boolean) => Promise<string | null>): HTMLElement {
  const box = h(d, "div", "margin-top:1rem");
  box.append(h(d, "div", `color:${C.muted};font:10.5px system-ui;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem`, CLIENT_OUTSIDE_TITLE));
  box.append(h(d, "div", `color:${C.soft};font:12px system-ui;line-height:1.5`, s.on ? "On: the client is outside Sentinel." : "Off: the client is a member and accepts in Sentinel."));
  box.append(h(d, "div", `color:${C.muted};font:11px system-ui;line-height:1.5;margin:.2rem 0 .4rem`, CLIENT_OUTSIDE_HELP));
  const say = h(d, "div", `color:${C.bad};font:11px system-ui;min-height:1em;margin-top:.3rem`);
  if (!s.can_change) box.append(h(d, "div", `color:${C.muted};font:11px system-ui`, "Only an owner changes this."));
  else if (!s.on && s.has_client) box.append(h(d, "div", `color:${C.muted};font:11px system-ui`, "The client is already a member. Remove them first if they should be outside."));
  else {
    const b = btn(d, s.on ? "Turn off" : "Turn on");
    b.addEventListener("click", () => void (async () => { b.disabled = true; const m = await change(!s.on); if (m) { say.textContent = m; b.disabled = false; } })());
    box.append(b);
  }
  box.append(say);
  return box;
}
