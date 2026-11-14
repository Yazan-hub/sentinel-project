// The proposed-changes editor: "Compare with the client's naming" lists what this document's naming changes against the naming
// found in the linked EIR (diffNaming(client, ours)); each line has a Why box. Reasons typed before a second compare are kept.
import type { Block, BlockData, DocRow, SectionRow } from "../sentinel-core/doc-blocks";
import { blocksOf } from "../sentinel-core/doc-blocks";
import { diffNaming, findNamingCandidate } from "../sentinel-core/naming-diff";
import type { NamingRuleset } from "../sentinel-core/naming";
import { artefactInForce } from "../setups/active-ruleset";
import { pathSegment } from "../setups/escape-html";
import { C, h } from "./dom";
import type { BlockEditor } from "./block-editors";
import { arr, frame, input, rec, small } from "./grid-editors";

type Change = BlockData["proposed_changes"]["changes"][number];
const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const NO_CLIENT_NAMING = "No naming was found in the linked EIR, so there is nothing to compare.";
export const NO_OUR_NAMING = "This document has no naming block and no naming is in force, so there is nothing to compare.";
const keyOf = (c: Pick<Change, "field_key" | "change">): string => `${c.field_key}\u0000${c.change}`;

/** The first naming a document holds: a naming block, else a naming standard written into a section's text. */
export function namingOf(sections: SectionRow[]): NamingRuleset | null {
  for (const s of sections) for (const b of blocksOf(s)) {
    const d = b.kind === "naming" ? rec((b as Block).data) : null;
    if (d && typeof d.separator === "string" && Array.isArray(d.fields)) return { title: "", separator: d.separator, enforce: d.enforce ?? "reject", fields: d.fields } as NamingRuleset;
  }
  const found = findNamingCandidate(sections);
  return found ? (found.ruleset as NamingRuleset) : null;
}

/** The changes diffNaming found, as lines: a separator or enforce change, then each field added, removed or changed. */
export function changesFrom(client: NamingRuleset, ours: NamingRuleset): Omit<Change, "reason">[] {
  const d = diffNaming(client, ours);
  return [
    ...d.header.map((t) => ({ field_key: t.split(" ")[0], change: "changed" as const, detail: t })),
    ...d.added.map((f) => ({ field_key: f.key, change: "added" as const, detail: `Adds ${f.label}` })),
    ...d.removed.map((f) => ({ field_key: f.key, change: "removed" as const, detail: `Removes ${f.label}` })),
    ...d.changed.map((f) => ({ field_key: f.key, change: "changed" as const, detail: f.changes.join("; ") })),
  ];
}

const CHANGE_WORDS = { added: "added", removed: "removed", changed: "changed" } as const;
/** One change in words: what was found ("Adds Originator", "separator '-' → '_'"), a changed field named before its changes. */
export const changeLine = (c: Pick<Change, "field_key" | "change" | "detail">): string =>
  !c.detail ? `${c.field_key} ${CHANGE_WORDS[c.change] ?? "changed"}` : c.change === "changed" && !c.detail.startsWith(c.field_key) ? `${c.field_key}: ${c.detail}` : c.detail;

export const proposedChangesEditor: BlockEditor = (block, ctx) => {
  const f = frame(ctx, "proposed_changes", block.title), d = f.d;
  let changes: Change[] = arr(rec(block.data).changes).map((c) => ({ field_key: str(rec(c).field_key), change: (rec(c).change ?? "changed") as Change["change"], detail: str(rec(c).detail), reason: str(rec(c).reason) }));
  const say = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`);

  function draw() {
    const lines = changes.map((c) => {
      const row = h(d, "div", "display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin:.25rem 0");
      row.append(h(d, "span", `color:${C.soft};font:12px system-ui`, changeLine(c)),
        input(f, "reason", c.reason, (x) => { changes = changes.map((q) => (keyOf(q) === keyOf(c) ? { ...q, reason: x } : q)); f.changed(); }));
      (row.children[1] as HTMLInputElement).placeholder = "Why";
      return row;
    });
    f.grid.replaceChildren(...(changes.length ? lines : [h(d, "div", `color:${C.muted};font:italic 12px system-ui`, "No proposed changes")]),
      small(f, "Compare with the client's naming", compare));
  }

  async function compare() {
    say.textContent = "";
    const doc: DocRow | null = ctx.st.doc, key = ctx.st.key;
    if (!doc?.responds_to) { say.textContent = NO_CLIENT_NAMING; return; }
    const eir = await ctx.ws.get<DocRow>(`/bimdocs/${pathSegment(key)}/${pathSegment(doc.responds_to)}`);
    const client = eir && Array.isArray(eir.sections) ? namingOf(eir.sections) : null;
    if (!client) { say.textContent = NO_CLIENT_NAMING; return; }
    let ours = namingOf(arr<SectionRow>(doc.sections));
    if (!ours) { try { ours = ((await artefactInForce<NamingRuleset>(ctx.base, key, "naming"))?.body) ?? null; } catch { ours = null; } }
    if (!ours) { say.textContent = NO_OUR_NAMING; return; }
    const kept = new Map(changes.map((c) => [keyOf(c), c.reason]));
    changes = changesFrom(client, ours).map((c) => ({ ...c, reason: kept.get(keyOf(c)) ?? "" }));
    draw(); f.changed();
  }
  f.el.append(say);
  draw();
  return { el: f.el, value: () => ({ title: f.caption.value, data: { changes } }), onChange: f.onChange };
};
