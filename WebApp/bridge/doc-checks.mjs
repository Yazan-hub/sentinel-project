// The four checks that score a BEP on what the earlier releases built (R3, Task 1): nominated people, one responsible task team
// per element, document suitability, level of information need. Same doctrine as check-registry: read-only, never a fabricated
// pass, not_checkable WITH a reason; a pure classifier per check and a thin fetch. They read every BEP of the project that is
// not archived — a check gets only (key, params) and fetches its own data.
import { sb, ensureProject } from "./cde-store.mjs";
import { blocksOf } from "./doc-blocks.mjs";
import { loinToIds } from "./ids-compile.mjs";

const result = (id, label, status, { count = 0, summary = "", reason, evidence = [] } = {}) => ({
  id, label, status, count, summary, ...(reason ? { reason } : {}), evidence,
});
const enc = encodeURIComponent;
const norm = (v) => String(v ?? "").trim().toLowerCase();
const text = (v) => String(v ?? "").trim();
const plural = (n, one, many) => (n === 1 ? one : many);

/** The project's BEPs that are not archived, read with the caller's session → [{id, title, status, sections}]. `documentId`: only that
 *  BEP, whatever its status — a document scored for itself (complianceReport) is judged on its own tables, not on its neighbours'. */
export async function projectBeps(key, documentId) {
  const proj = await ensureProject(key);
  const which = documentId ? `&id=eq.${enc(documentId)}` : "&status=neq.archived";
  const rows = await sb(`bim_documents?project_id=eq.${enc(proj.id)}&doc_type=eq.BEP${which}&order=updated_at.desc&select=id,title,status,sections`);
  return (rows || []).map((d) => ({ id: d.id, title: d.title, status: d.status, sections: Array.isArray(d.sections) ? d.sections : [] }));
}

/** Each BEP with its latest version → [{title, latest: {version_no, suitability}|null}] — the version rows with the service key
 *  after ensureProject refused a non-member (0049 limits direct version reads, as listVersions). */
export async function bepsWithLatestVersion(key, beps) {
  await ensureProject(key);
  if (!beps.length) return [];
  const rows = (await sb(`bim_document_versions?document_id=in.(${beps.map((b) => enc(b.id)).join(",")})&select=document_id,version_no,suitability&order=version_no.desc`, { service: true })) || [];
  return beps.map((b) => ({ title: b.title, latest: rows.find((r) => r.document_id === b.id) ?? null }));
}

/** Every block of a kind in the BEPs, with where it is → [{where, block}]. */
function blocksOfKind(beps, kind) {
  return beps.flatMap((b) => b.sections.flatMap((s) => blocksOf(s).filter((x) => x?.kind === kind).map((block) => ({ where: `${b.title} — ${s.heading ?? "section"}`, block }))));
}

/** Nominated people: a non-empty cell of a person column counts as a member only when it equals an active member's e-mail
 *  (case and spaces ignored; an invited member does not count). `members`: listMembers's rows. */
export function classifyNominated(beps, members) {
  const id = "people.nominated", label = "Nominated people are project members";
  // The member list falls back to a person's id when the sign-in service cannot be asked: then nobody would match, so say so instead.
  if ((members || []).some((m) => !String(m.email ?? "").includes("@"))) return result(id, label, "not_checkable", { reason: "The members' e-mail addresses could not be read just now. Try again in a minute." });
  const byEmail = new Map((members || []).map((m) => [norm(m.email), m]));
  const seen = new Map(); // person → where first named
  for (const { where, block } of blocksOfKind(beps, "table")) {
    const cols = (block.data?.columns ?? []).filter((c) => c.type === "person");
    for (const r of block.data?.rows ?? []) for (const c of cols) {
      const v = text(r.cells?.[c.key]);
      if (v && !seen.has(norm(v))) seen.set(norm(v), { v, where });
    }
  }
  if (!seen.size) return result(id, label, "not_checkable", { reason: "No table names people yet: add them to a table with a Person column in the BEP." });
  const bad = [];
  for (const [k, { v, where }] of seen) {
    const m = byEmail.get(k);
    if (m && (m.state ?? "active") === "active") continue;
    bad.push({ label: where, detail: m ? `${v} is invited and has not signed in yet` : `${v} is not a member of this project` });
  }
  const n = seen.size;
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${n} nominated ${plural(n, "person is", "people are")} not an active member.` })
    : result(id, label, "met", { summary: n === 1 ? "All 1 nominated person is an active member." : `All ${n} nominated people are active members.` });
}

/** One responsible task team per element: every labelled matrix row has a "produces" mark, in a column that names a declared task team.
 *  (Two marks are already refused on save.) A column with no team is read by its name (F-RUN-2: matrices made before the editor tied
 *  columns to teams carry team null under a team-code name). `teams`: listTeams's rows. */
export function classifyOneProducer(beps, teams) {
  const id = "roles.one_producer", label = "One responsible task team per element";
  const declared = new Set((teams || []).map((t) => norm(t.code)));
  const bad = [];
  let rows = 0;
  for (const { where, block } of blocksOfKind(beps, "matrix")) {
    const cols = new Map((block.data?.columns ?? []).map((c) => [c.key, c]));
    for (const r of block.data?.rows ?? []) {
      const name = text(r.label);
      if (!name) continue;
      rows += 1;
      const key = Object.entries(r.marks ?? {}).find(([, m]) => m === "produces")?.[0];
      if (key === undefined) bad.push({ label: where, detail: `${name} has no task team that produces it` });
      else if (!declared.has(norm(text(cols.get(key)?.team) ? cols.get(key).team : cols.get(key)?.label))) bad.push({ label: where, detail: `${name} is produced by a column that names no declared task team` });
    }
  }
  if (!rows) return result(id, label, "not_checkable", { reason: "No responsibility matrix has rows yet." });
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${rows} matrix ${plural(rows, "row has", "rows have")} no single responsible task team.` })
    : result(id, label, "met", { summary: `All ${rows} matrix ${plural(rows, "row has", "rows have")} one responsible task team.` });
}

export const SUITABILITY_ALLOWED = ["S1", "S2", "S3", "S4", "S5", "A1", "A2", "A3"];

/** Document suitability: the latest version of each BEP that a review round issued carries an allowed code. A version published with no
 *  review chain carries no code (S0 or none) and nobody can give it one, so it is not judged. `docs`: bepsWithLatestVersion's rows. */
export function classifyDocSuitability(docs, allowed) {
  const id = "docs.suitability", label = "Document suitability";
  const ok = new Set(allowed && allowed.length ? allowed : SUITABILITY_ALLOWED);
  const coded = (d) => d.latest?.suitability && d.latest.suitability !== "S0";
  const issued = (docs || []).filter(coded);
  if (!issued.length) return result(id, label, "not_checkable", { reason: (docs || []).some((d) => d.latest)
    ? "No document has been issued through a review round yet: a suitability code is given when a round issues a version."
    : "No document has been issued or published yet." });
  const bad = [];
  for (const d of issued) {
    const code = d.latest.suitability, at = `${d.title} v${d.latest.version_no}`;
    if (!ok.has(code)) bad.push({ label: at, detail: `${at} is ${code}, which is not an allowed code` });
  }
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${issued.length} issued ${plural(issued.length, "document", "documents")} without an allowed suitability code.` })
    : result(id, label, "met", { summary: `All ${issued.length} issued ${plural(issued.length, "document carries", "documents carry")} an allowed suitability code.` });
}

/** Level of information need: every LOIN row names an element, a milestone and a property, and compiles to an IDS specification. */
export function classifyLoin(beps) {
  const id = "loin.levels", label = "Level of information need";
  const bad = [];
  let total = 0;
  for (const { where, block } of blocksOfKind(beps, "loin")) {
    (block.data?.rows ?? []).forEach((r, i) => {
      total += 1;
      const missing = [["element", r.element], ["milestone", r.milestone], ["property", r.property]].filter(([, v]) => !text(v)).map(([k]) => `no ${k}`);
      if (missing.length) { bad.push({ label: where, detail: `Row ${i + 1}: ${missing.join(", ")}` }); return; }
      const u = loinToIds([r]).unmatched[0];
      if (u) bad.push({ label: where, detail: `Row ${i + 1}: ${u.reason}` });
    });
  }
  if (!total) return result(id, label, "not_checkable", { reason: "No level of information need table has rows yet." });
  return bad.length
    ? result(id, label, "violations", { count: bad.length, evidence: bad, summary: `${bad.length} of ${total} level-of-information-need ${plural(total, "row", "rows")} incomplete or not mappable to a data requirement.` })
    : result(id, label, "met", { summary: `${total} ${plural(total, "row", "rows")}, complete and mapped to data requirements.` });
}
