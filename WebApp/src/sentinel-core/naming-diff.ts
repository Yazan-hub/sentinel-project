// sentinel-core/naming-diff — what a document's candidate naming standard changes against the one in force
// (cohesion phase 3 §5, F15). PURE. The Documents panel shows this before a lead installs the candidate
// WHOLE as the next naming@n: there is no merge, and a candidate that drops fields says so first.
import type { NamingField, NamingRuleset } from "./naming";

export interface NamingFieldRef { key: string; label: string }
export interface NamingFieldChange extends NamingFieldRef { changes: string[] }
export interface NamingDiff {
  added: NamingFieldRef[];
  removed: NamingFieldRef[];
  changed: NamingFieldChange[];
  /** separator / enforce changes — they re-shape or re-gate every name, so the panel shows them first. */
  header: string[];
}

const joined = (a?: string[]) => (a ?? []).join(", ") || "—";

function fieldChanges(a: NamingField, b: NamingField, ia: number, ib: number): string[] {
  const out: string[] = [];
  if (ia !== ib) out.push(`position ${ia + 1} → ${ib + 1}`);
  if (a.label !== b.label) out.push(`label ${a.label} → ${b.label}`);
  if ((a.pattern ?? "") !== (b.pattern ?? "")) out.push(`pattern ${a.pattern ?? "—"} → ${b.pattern ?? "—"}`);
  const ea = new Set(a.enum ?? []), eb = new Set(b.enum ?? []);
  const plus = [...eb].filter((v) => !ea.has(v)).map((v) => `+${v}`);
  const minus = [...ea].filter((v) => !eb.has(v)).map((v) => `-${v}`);
  if (plus.length || minus.length) out.push(`enum ${[...plus, ...minus].join(" ")}`);
  if (joined(a.placeholders) !== joined(b.placeholders)) out.push(`placeholders ${joined(a.placeholders)} → ${joined(b.placeholders)}`);
  return out;
}

/** Field-by-field diff, matched by field key. `current` null = nothing in force: every field is added. */
export function diffNaming(current: NamingRuleset | null, candidate: NamingRuleset): NamingDiff {
  const cur = current?.fields ?? [];
  const was = new Map(cur.map((f, i) => [f.key, { f, i }] as const));
  const candKeys = new Set(candidate.fields.map((f) => f.key));
  const added: NamingFieldRef[] = [], changed: NamingFieldChange[] = [];
  candidate.fields.forEach((f, i) => {
    const w = was.get(f.key);
    if (!w) { added.push({ key: f.key, label: f.label }); return; }
    const changes = fieldChanges(w.f, f, w.i, i);
    if (changes.length) changed.push({ key: f.key, label: f.label, changes });
  });
  const removed = cur.filter((f) => !candKeys.has(f.key)).map((f) => ({ key: f.key, label: f.label }));
  const header: string[] = [];
  if (current) {
    if (current.separator !== candidate.separator) header.push(`separator '${current.separator}' → '${candidate.separator}'`);
    const ec = current.enforce ?? "reject", en = candidate.enforce ?? "reject";
    if (ec !== en) header.push(`enforce ${ec} → ${en}`);
  }
  return { added, removed, changed, header };
}

/** A naming standard written into a document section as a fenced ```json block (the BEP template's
 *  "Container naming and standards" section is the intended home). Returns the first block that parses to
 *  an object with a string `separator` and a `fields` array, with the section it came from; null when no
 *  section carries one. The full shape is judged by the bridge on install (validateArtefact "naming"). */
export function findNamingCandidate(sections: { id: string; heading: string; body?: string }[]):
  { ruleset: NamingRuleset & Record<string, unknown>; section_id: string; heading: string } | null {
  for (const s of sections) {
    for (const m of (s.body ?? "").matchAll(/```json\s*([\s\S]*?)```/g)) {
      try {
        const j = JSON.parse(m[1]);
        if (j && typeof j === "object" && !Array.isArray(j) && typeof j.separator === "string" && Array.isArray(j.fields))
          return { ruleset: j, section_id: s.id, heading: s.heading };
      } catch { /* not JSON — keep looking */ }
    }
  }
  return null;
}
