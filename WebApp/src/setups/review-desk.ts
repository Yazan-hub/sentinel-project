// review-desk — the web side of a changeset's review (MA-3a, design §6.6, founder decision D17). The ghosts waiting in Revit's
// review (GET /changesets/:key?status=proposed), grouped by storey (a Promote storey's parts, " (i/n)", as Revit's StoreyBatch
// groups them) and by what they do. A signed-in contributor accepts or declines the ticked ghosts — a decline needs a reason and
// BINDS: Revit shows it unticked with the reason and refuses the tick; an accept is advice. A signed-in lead re-opens a decline.
// POST /changesets/:key/:id/review and /reopen; the bridge holds the rules (the machine credential never reviews). A list that was
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
import { bfetch, bwrite } from "./bridge-fetch";
import { myRoleRead, roleWords } from "./my-role";
import { activePid, onActiveProjectChange } from "./active-project";
import { SERVICE_URL } from "../config";

export interface GhostReview { state: "proposed" | "accepted" | "declined"; action: "accept" | "decline" | "reopen"; reason: string | null; by: string; role: string; at: string; rev: number; }
export interface Ghost {
  proposal_guid: string; kind: string; op?: string | null;
  target?: { unique_id?: string; type_before?: string } | null;
  place?: { TypeName?: string; FamilyName?: string; LevelName?: string; BaseLevel?: string; TopLevel?: string } | null;
  validate?: { identity?: { Name?: string } } | null;
  parameter?: string; from?: string; to?: string;
  review?: GhostReview | null;
}
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; }
export interface DeskGroup { what: string; ghosts: { cs: PendingChangeset; el: Ghost }[]; }
export interface DeskStorey { storey: string; changesets: PendingChangeset[]; groups: DeskGroup[]; }
export interface LedgerRef { id: number | null; hash: string | null; }

// Revit's StoreyBatch.Part: " (i/n)" at the end of a Promote storey's part (ASCII digits).
const PART = / \(([0-9]{1,4})\/([0-9]{1,4})\)$/;
/** A changeset's storey: its name without " (i/n)" (StoreyBatch.StoreyOf). */
export const storeyOf = (name: string): string => (name ?? "").replace(PART, "");

/** What a ghost does, as a group heading: "retype wall", "attach wall", "set_parameter wall", "create floor". */
export const whatOf = (el: Ghost): string => `${el.op ?? "create"} ${el.kind}`;

/** The pending changesets as the desk shows them: by storey (oldest first, a storey's parts together), then by what the ghosts do. */
export function groupDesk(pending: PendingChangeset[]): DeskStorey[] {
  const storeys = new Map<string, DeskStorey>();
  for (const cs of [...pending].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    const key = storeyOf(cs.name);
    const s = storeys.get(key) ?? { storey: key, changesets: [], groups: [] };
    storeys.set(key, s);
    s.changesets.push(cs);
    for (const el of cs.elements ?? []) {
      let g = s.groups.find((x) => x.what === whatOf(el));
      if (!g) s.groups.push((g = { what: whatOf(el), ghosts: [] }));
      g.ghosts.push({ cs, el });
    }
  }
  return [...storeys.values()];
}

/** One ghost in words — Revit's review row, shortened: `W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm`. */
export function ghostLine(el: Ghost): string {
  const name = el.validate?.identity?.Name ?? el.proposal_guid;
  const type = (el.place?.FamilyName ? el.place.FamilyName + " : " : "") + (el.place?.TypeName ?? "?");
  switch (el.op) {
    case "retype": return `${name} · ${el.target?.type_before ?? "?"} → ${type}`;
    case "attach": return `${name} · ${el.place?.BaseLevel ?? "?"} → top ${el.place?.TopLevel ?? "?"}`;
    case "set_parameter": return `${type} · ${el.parameter} "${el.from ?? ""}" → "${el.to ?? ""}" (a type edit: it reaches every element of the type)`;
    default: return `${name}${el.place?.TypeName ? " · " + type : ""}${el.place?.LevelName ? " · " + el.place.LevelName : ""}`;
  }
}

/** The web desk's decision in words (Revit's ChangesetTrust.ReviewLine, from the desk's side); "waiting" when nobody decided. */
export function reviewWords(el: Ghost): string {
  const r = el.review;
  if (!r || (r.state === "proposed" && r.action !== "reopen")) return "waiting — nobody decided on the web";
  const who = `${r.by} (${r.role})`;
  if (r.state === "declined") return `declined by ${who}: ${r.reason} — binds: Revit shows it unticked and refuses the tick`;
  if (r.state === "accepted") return `accepted by ${who}${r.reason ? ": " + r.reason : ""} — advice: Revit still asks for the tick`;
  return `re-opened by ${who}: ${r.reason}`;
}

/** Who may accept or decline on the desk: a signed-in contributor or above. The machine credential ("service") never reviews (Q1). */
export const canDecide = (role: string): boolean => ["owner", "lead", "contributor"].includes(role);
/** Who may re-open a decline: a signed-in lead or owner. */
export const canReopen = (role: string): boolean => ["owner", "lead"].includes(role);

const at = (base: string, key: string, path = "") => `${base.replace(/\/$/, "")}/changesets/${encodeURIComponent(key)}${path}`;

/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export async function readPending(base: string, key: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "?status=proposed")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** POST /changesets/:key/:id/review {decisions}. A decline with a blank reason is never sent; a refusal throws the bridge's words. */
export async function postReview(base: string, key: string, id: string, decision: "accept" | "decline", guids: string[], reason: string): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!guids.length) throw new Error("tick a ghost first");
  if (decision === "decline" && !why) throw new Error("a decline needs a reason — the ledger records it and Revit shows it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/review`), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions: guids.map((g) => ({ proposal_guid: g, decision, ...(why ? { reason: why } : {}) })) }),
  });
}

/** POST /changesets/:key/:id/reopen {proposal_guid, reason} — a lead's. A blank reason is never sent. */
export async function postReopen(base: string, key: string, id: string, guid: string, reason: string): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!why) throw new Error("a re-open needs a reason — the ledger records it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/reopen`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_guid: guid, reason: why }),
  });
}

/** The desk's posts for the ticked ghosts: one per changeset (all or none on the bridge — a storey's parts are separate changesets),
 *  leaving out a ghost already in the state the decision leads to: a repeat is a 409 that would refuse its whole post (C6). */
export function postsFor(ticked: Map<string, { cs: PendingChangeset; el: Ghost }>, decision: "accept" | "decline"): { posts: Map<string, string[]>; already: number } {
  const target = decision === "accept" ? "accepted" : "declined";
  const posts = new Map<string, string[]>();
  let already = 0;
  for (const [g, x] of ticked) {
    if (x.el.review?.state === target) { already++; continue; }
    posts.set(x.cs.id, [...(posts.get(x.cs.id) ?? []), g]);
  }
  return { posts, already };
}

/** "ledger #1201" when the bridge named the row; else that it did not. */
export const rowWords = (r: { ledger: LedgerRef | null } | null): string => (r?.ledger?.id != null ? `ledger #${r.ledger.id}` : "the bridge named no ledger row");

/** The desk: plain DOM, re-read on a project or person change (main.ts → refreshActiveProject) or by its own ↻ Refresh. */
export function reviewDeskPanel(opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  const status = document.createElement("div");
  status.style.cssText = "padding:.3rem .6rem;color:#93c5fd";
  root.append(bar, status, body);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", css = ""): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.style.cssText = css;
    return e;
  };
  const btn = (label: string, onClick: () => void) => { const b = el("button", label, "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.25rem .55rem;font:600 11px system-ui;cursor:pointer"); b.onclick = onClick; return b; };
  const reason = el("input", "", "flex:1;min-width:10rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui");
  reason.placeholder = "Reason (a decline needs one; one line)";
  const ticked = new Map<string, { cs: PendingChangeset; el: Ghost }>();
  const say = (text: string, bad = false) => { status.textContent = text; status.style.color = bad ? "#fca5a5" : "#93c5fd"; };
  let seq = 0;

  const decide = async (decision: "accept" | "decline") => {
    // One post per changeset (all or none on the bridge); a ghost already accepted (or declined) is not sent again (C6).
    const { posts, already } = postsFor(ticked, decision);
    const skipped = already ? `${already} already ${decision === "accept" ? "accepted" : "declined"} — not sent` : "";
    if (!posts.size) return say(skipped ? skipped + "." : "Tick a ghost first.", true);
    const done: string[] = [];
    try {
      for (const [id, guids] of posts) done.push(`${guids.length} ${decision === "accept" ? "accepted" : "declined"} · ${rowWords(await postReview(base, activePid(), id, decision, guids, reason.value))}`);
      reason.value = "";
      say([...done, ...(skipped ? [skipped] : [])].join("; ") + (decision === "decline" ? " — Revit now shows them unticked with the reason and refuses the tick." : " — advice: Revit still asks for the tick."));
    } catch (e) { say(`${done.length ? done.join("; ") + "; then " : ""}not recorded — ${(e as Error).message}`, true); }
    void show();
  };

  async function show(): Promise<void> {
    const mine = ++seq, key = activePid();
    ticked.clear();
    body.replaceChildren(el("div", "Reading…"));
    const [role, pending] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
    bar.replaceChildren(el("b", `Review desk · ${key}`), el("span", roleWords(role), "color:#8b93a1"), btn("↻ Refresh", () => void show()));
    if (canDecide(role.role)) bar.append(reason, btn("Accept ticked", () => void decide("accept")), btn("Decline ticked", () => void decide("decline")));
    else bar.append(el("span", role.role === "service" ? "· sign in to accept or decline — the machine credential never reviews" : "· read-only: accepting or declining needs contributor", "color:#fbbf24"));
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5")); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project.")); return; }
    body.replaceChildren(el("div", "A decline binds: Revit shows the ghost unticked with your reason and refuses the tick. An accept is advice. A changeset stays proposed until Revit applies or declines it — a new Promote run proposes a declined ghost again, undecided.", "color:#8b93a1;margin-bottom:.5rem"));
    for (const s of groupDesk(pending)) {
      const box = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      box.open = true;
      box.append(el("summary", `${s.storey} — ${s.groups.reduce((n, g) => n + g.ghosts.length, 0)} ghost(s) in ${s.changesets.length} changeset(s)`, "cursor:pointer;font-weight:600"));
      for (const g of s.groups) {
        box.append(el("div", `${g.what} (${g.ghosts.length})`, "margin:.4rem 0 .2rem;color:#8b93a1"));
        for (const x of g.ghosts) {
          const row = el("div", "", "display:flex;gap:.4rem;align-items:flex-start;padding:.15rem 0");
          const tick = el("input");
          tick.type = "checkbox";
          tick.disabled = !canDecide(role.role) || x.el.review?.state === "declined";
          tick.onchange = () => { if (tick.checked) ticked.set(x.el.proposal_guid, x); else ticked.delete(x.el.proposal_guid); };
          const words = el("div", "");
          words.append(el("div", ghostLine(x.el)), el("div", reviewWords(x.el), `color:${x.el.review?.state === "declined" ? "#fca5a5" : x.el.review?.state === "accepted" ? "#86efac" : "#8b93a1"}`));
          row.append(tick, words);
          if (x.el.review?.state === "declined" && canReopen(role.role))
            row.append(btn("Re-open", async () => {
              try { say(`Re-opened · ${rowWords(await postReopen(base, key, x.cs.id, x.el.proposal_guid, reason.value))} — Revit may tick it again.`); reason.value = ""; }
              catch (e) { say(`not recorded — ${(e as Error).message}`, true); }
              void show();
            }));
          box.append(row);
        }
      }
      body.append(box);
    }
  }
  onActiveProjectChange(() => void show());
  void show();
  return root;
}
