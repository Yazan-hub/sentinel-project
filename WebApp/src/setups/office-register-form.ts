/**
 * The office register as a form (R1c Task 7, spec 2026-10-24 §4): the office's own standard — who does which information-management
 * function, its software, hardware, past projects, training and terms. A line marked "Publish in documents" may enter a project's
 * documents; the rest stays here. Built on standard-forms' machinery but NOT in STANDARD_FORMS: the register is not an artefact
 * (bridge/office-register.mjs), it has its own routes — GET/PUT /cde/:office/office-register, lead or owner of the office only.
 * Line ids are kept; a new line gets one from its text plus a counter. The bridge stays the judge; its words are shown as they come.
 */
import { bfetch } from "./bridge-fetch";
import type { Field, Model, Row, StandardForm } from "./standard-forms";

type Body = Record<string, unknown>;
export interface RegisterPointer { version: number; sha256: string; installed_by?: string; installed_at?: string }
export interface Register extends RegisterPointer { body: Body }

const PARTS: { key: string; words: string; item: string; add: string; cols: [string, string][] }[] = [
  { key: "people", words: "People and functions", item: "Person", add: "Add a person", cols: [["function", "Function"], ["who", "Who"], ["competence", "Competence"]] },
  { key: "software", words: "Software", item: "Software", add: "Add software", cols: [["name", "Name"], ["version", "Version"], ["use", "Use"]] },
  { key: "hardware", words: "Hardware and IT", item: "Hardware", add: "Add hardware", cols: [["item", "Item"], ["spec", "Specification"]] },
  { key: "past_projects", words: "Past projects", item: "Project", add: "Add a past project", cols: [["name", "Name"], ["year", "Year"], ["role", "Role"]] },
  { key: "training", words: "Training plan", item: "Course", add: "Add a course", cols: [["course", "Course"], ["who", "Who"]] },
  { key: "terms", words: "Terms", item: "Term", add: "Add a term", cols: [["term", "Term"], ["meaning", "Meaning"]] },
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const val = (r: Row, k: string) => { const v = r.v[k]; return typeof v === "string" ? v.trim() : ""; };

/** A lower-case id stem from a line's text: letters and digits joined by dashes, at most 34 characters. */
const stem = (s: string, fallback: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34).replace(/-+$/, "") || fallback;

const fields: Field[] = PARTS.map((p) => ({
  key: p.key, label: p.words, type: "rows" as const, add: p.add, item: p.item, max: 200,
  blank: { evidence: "evidenced", publish: false },
  columns: [
    ...p.cols.map(([key, label]) => ({ key, label, type: "text" as const })),
    { key: "evidence", label: "Evidence", type: "select" as const, options: [["evidenced", "Evidenced"], ["committed", "Committed"]] as [string, string][] },
    { key: "evidence_note", label: "Evidence note", type: "text" as const },
    { key: "owner", label: "Owner", type: "text" as const, width: "8rem" },
    { key: "due", label: "Due (YYYY-MM-DD)", type: "text" as const, width: "8rem" },
    { key: "publish", label: "Publish in documents", type: "check" as const },
  ],
}));

export const REGISTER_FORM: StandardForm = {
  kind: "office_register", title: "Office register",
  intro: "What this office can show a client. Only lines marked \"Publish in documents\" can enter a project's documents. A committed line (not yet evidenced) needs an owner and a due date. Names and roles only — no e-mail addresses.",
  fields,
  fromBody: (b) => {
    const m: Model = {};
    for (const p of PARTS) {
      const lines = Array.isArray(b?.[p.key]) ? (b![p.key] as Body[]) : [];
      m[p.key] = lines.map((l): Row => {
        const v: Record<string, string | boolean> = { publish: l.publish === true, evidence: l.evidence === "committed" ? "committed" : "evidenced", evidence_note: text(l.evidence_note), owner: text(l.owner), due: text(l.due) };
        for (const [k] of p.cols) v[k] = text(l[k]);
        return { v, orig: { id: l.id } };
      });
    }
    return m;
  },
  toBody: (m) => {
    const lists = PARTS.map((p) => (Array.isArray(m[p.key]) ? (m[p.key] as Row[]) : []));
    const used = new Set<string>();
    for (const l of lists) for (const r of l) if (typeof r.orig.id === "string") used.add(r.orig.id);
    let counter = 0;
    const out: Body = {};
    PARTS.forEach((p, pi) => {
      out[p.key] = lists[pi].map((r, i) => {
        const at = `${p.words}, line ${i + 1}`;
        const evidence = val(r, "evidence") === "committed" ? "committed" : "evidenced";
        const owner = val(r, "owner"), due = val(r, "due");
        if (due && !DATE.test(due)) throw new Error(`${at}: the due date “${due}” must be written YYYY-MM-DD, e.g. 2026-12-31`);
        if (evidence === "committed" && (!owner || !due)) throw new Error(`${at} is committed, so it needs an owner and a due date`);
        let id = typeof r.orig.id === "string" ? r.orig.id : "";
        if (!id) {
          const s = stem(val(r, p.cols[0][0]), p.key.replace(/_/g, "-"));
          do { id = `${s}-${++counter}`; } while (used.has(id));
          used.add(id);
        }
        const line: Body = { id, publish: r.v.publish === true, evidence, evidence_note: val(r, "evidence_note"), owner, due };
        for (const [k] of p.cols) line[k] = val(r, k);
        return line;
      });
    });
    return out;
  },
};

/** "N lines, M published in documents · version n" — or the first-time words when nothing is installed. */
export function registerSummary(reg: Register | null): string {
  if (!reg) return "Nothing entered yet.";
  let n = 0, pub = 0;
  for (const p of PARTS) for (const l of (Array.isArray(reg.body?.[p.key]) ? (reg.body[p.key] as Body[]) : [])) { n++; if (l.publish === true) pub++; }
  return `${n} line${n === 1 ? "" : "s"}, ${pub} published in documents · version ${reg.version}`;
}

/** GET → the register or null (nothing yet). Throws the bridge's words (400 a project, 403 below lead). */
export async function readRegister(base: string, key: string): Promise<Register | null> {
  const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/office-register`);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j as { message?: string } | null)?.message || `HTTP ${r.status}`);
  return (j as Register | null) ?? null;
}

/** PUT the body with If-Match = the sha the form was filled from ("none" for the first one). 412 comes back in the bridge's words. */
export async function saveRegister(base: string, key: string, body: Body, sha: string | null, actor = "web"): Promise<RegisterPointer> {
  const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/office-register?actor=${encodeURIComponent(actor)}`, {
    method: "PUT", headers: { "Content-Type": "application/json", "If-Match": sha ?? "none" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
  return j as RegisterPointer;
}
