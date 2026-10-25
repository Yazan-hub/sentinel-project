// A naming rule written in a section's text (a json fence, or a pattern line with a table of values) as naming block data.
// Pure, no DOM. Reads what the text says and invents nothing: a key the table does not mention gets a plain label and no values.
import type { BlockData } from "./doc-blocks";
import { findNamingCandidate } from "./naming-diff";
import { readPipeTables } from "./pipe-table";

type Naming = BlockData["naming"];
type Field = Naming["fields"][number];

const field = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, pattern: null, enum: [], placeholders: [], description: "", ...o });
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function fromJson(md: string): Naming | null {
  const c = findNamingCandidate([{ id: "x", heading: "", body: md }]);
  if (!c) return null;
  const { ruleset } = c;
  return {
    separator: ruleset.separator,
    enforce: ruleset.enforce === "warn" || ruleset.enforce === "off" ? ruleset.enforce : "reject",
    fields: ruleset.fields.map((f) => {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return field(String(o.key ?? ""), String(o.label ?? ""), {
        pattern: typeof o.pattern === "string" ? o.pattern : null, enum: strings(o.enum), placeholders: strings(o.placeholders),
        description: typeof o.description === "string" ? o.description : "",
      });
    }),
  };
}

/** The values and label a table gives the key: the first table row whose first cell is the key. */
function fromTable(md: string, key: string): Field {
  for (const t of readPipeTables(md)) {
    const row = t.rows.find((r) => norm(r[0] ?? "") === key);
    if (!row) continue;
    const tokens = (row[1] ?? "").split("(")[0].match(/\b[A-Z0-9]{1,4}\b/g) ?? [];
    const digits = tokens.length === 1 && /^[0-9]+$/.test(tokens[0]);
    return field(key, row[0], digits ? { pattern: `^[0-9]{${tokens[0].length}}$` } : { enum: tokens });
  }
  return field(key, key.charAt(0).toUpperCase() + key.slice(1));
}

/** Split on the separator, except inside <key> (a key may hold the separator, e.g. <document_type> with "_"). */
function splitOutside(span: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = "", open = false;
  for (const ch of span) {
    if (ch === "<") open = true; else if (ch === ">") open = false;
    if (ch === sep && !open) { parts.push(cur); cur = ""; } else cur += ch;
  }
  return [...parts, cur];
}

function fromPattern(md: string): Naming | null {
  for (const m of md.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1];
    if (!/<[a-z][a-z0-9_]*>/.test(span)) continue;
    const sep = span.match(/^(?:<[a-z][a-z0-9_]*>|[A-Za-z0-9]+)([^A-Za-z0-9<>])/)?.[1];
    if (!sep) continue;
    const parts = splitOutside(span, sep);
    if (parts.length < 2) continue;
    let literals = 0;
    const fields = parts.map((p, i) => {
      const k = p.match(/^<([a-z][a-z0-9_]*)>$/)?.[1];
      if (k) return fromTable(md, k);
      return literals++ === 0 ? field("project", "Project", { enum: [p] }) : field(`part_${i + 1}`, `Part ${i + 1}`, { enum: [p] });
    });
    return { separator: sep, enforce: "reject", fields };
  }
  return null;
}

/** Naming block data from section text: a json fence first, else the first backticked pattern with its table; null when neither is there. */
export function namingFromText(md: unknown): Naming | null {
  return typeof md === "string" ? fromJson(md) ?? fromPattern(md) : null;
}
