// Living annexes (R1c, spec 2026-10-24 §4 Living annexes): the risk register, the mobilisation plan and the capability rows are edited where they
// live and read by a document's live lists. One bridge_docs document per project per annex (store `annex`, doc id = the annex name),
// data {rev, rows}. Written only here, with the service key after the bridge's own role check: a read-modify-write that compares `rev`
// (a stale one is a 409, a concurrent one loses the compare-and-swap) and one ledger row per change.
// Deps are injected (the members-store idiom) so the sequencing is unit-tested without Supabase.
import { randomBytes } from "node:crypto";

export const STORE = "annex";
const TOUCHES = { key: "touches", words: "Needs a review", type: "choice", choices: ["none", "responsibilities", "strategy", "standard"] };
const LMH = ["low", "medium", "high"];
export const ANNEXES = {
  risk_register: { words: "Risk register", columns: [
    { key: "risk", words: "Risk", type: "text", required: true }, { key: "owner", words: "Owner", type: "text" },
    { key: "likelihood", words: "Likelihood", type: "choice", choices: LMH }, { key: "impact", words: "Impact", type: "choice", choices: LMH },
    { key: "mitigation", words: "Mitigation", type: "text" }, { key: "status", words: "Status", type: "choice", choices: ["open", "closed"] }, TOUCHES] },
  mobilisation: { words: "Mobilisation plan", columns: [
    { key: "activity", words: "Activity", type: "text", required: true }, { key: "owner", words: "Owner", type: "text" },
    { key: "due", words: "Due", type: "date" }, { key: "done", words: "Done", type: "check" }, TOUCHES] },
  capability: { words: "Capability", columns: [
    { key: "team", words: "Task team", type: "text", required: true }, { key: "area", words: "Area", type: "choice", choices: ["people", "software", "hardware", "process"] },
    { key: "item", words: "Item", type: "text", required: true }, { key: "evidence", words: "Evidence", type: "choice", choices: ["evidenced", "committed"] },
    { key: "evidence_note", words: "Evidence note", type: "text" }, { key: "owner", words: "Owner", type: "text" }, { key: "due", words: "Due", type: "date" }] },
};
const MAX_TEXT = 500, MAX_ROWS = 500;
const EMAIL = /@[^\s@]+\.[^\s@]+/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
const STALE = "Someone changed this list meanwhile — reload; nothing was saved.";

const err = (status, message) => Object.assign(new Error(message), { status });
const validDate = (s) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const annexOf = (name) => { const a = Object.hasOwn(ANNEXES, name) ? ANNEXES[name] : null; if (!a) throw err(404, `there is no list called ${name} — the lists are risk_register, mobilisation and capability`); return a; };

/** A row's values checked against the annex's columns → the row without its id. Unknown key, wrong type or an e-mail address is a 400 in words. */
export function validateRow(name, row) {
  const a = annexOf(name);
  if (!row || typeof row !== "object" || Array.isArray(row)) throw err(400, "a row must be an object of values");
  const known = new Set(a.columns.map((c) => c.key));
  const stray = Object.keys(row).find((k) => !known.has(k));
  if (stray !== undefined) throw err(400, `${stray} is not a column of the ${a.words}`);
  const out = {};
  for (const c of a.columns) {
    let v = row[c.key];
    if (v === undefined || v === null) v = c.type === "check" ? false : c.type === "choice" ? c.choices[0] : "";
    if (c.type === "check") { if (typeof v !== "boolean") throw err(400, `${c.words} must be yes or no`); out[c.key] = v; continue; }
    if (typeof v !== "string") throw err(400, `${c.words} must be text`);
    v = v.trim();
    if (v.length > MAX_TEXT) throw err(400, `${c.words} is longer than ${MAX_TEXT} characters`);
    if (EMAIL.test(v)) throw err(400, "this list holds names and roles, not e-mail addresses");
    if (c.type === "choice" && !c.choices.includes(v)) throw err(400, `${c.words} must be one of ${c.choices.join(", ")}`);
    if (c.type === "date" && v !== "" && !validDate(v)) throw err(400, `${c.words} must be a date as YYYY-MM-DD`);
    if (c.required && !v) throw err(400, `${c.words} is required`);
    out[c.key] = v;
  }
  if (name === "capability" && out.evidence === "committed" && (!out.owner || !out.due)) throw err(400, "A committed item needs an owner and a due date");
  return out;
}

const wire = async (deps = {}) => {
  const needCde = !(deps.ensureProject && deps.docGet && deps.docInsert && deps.docCas && deps.audit && deps.teamCodes);
  const cde = needCde ? await import("./cde-store.mjs") : null;
  const members = deps.requireMinRole && deps.myMembership ? null : await import("./members-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || ((pid, id) => cde.sb(`bridge_docs?store=eq.${STORE}&project_id=eq.${encodeURIComponent(pid)}&doc_id=eq.${encodeURIComponent(id)}&select=data`, { service: true }).then((r) => r?.[0]?.data ?? null)),
    docInsert: deps.docInsert || ((pid, id, data) => cde.docInsert(STORE, pid, id, data, { service: true })),
    // compare-and-swap on data->>rev: the write lands only if nobody wrote since this read → data | null
    docCas: deps.docCas || ((pid, id, data, rev) => cde.docReplaceIfField(STORE, pid, id, data, "rev", String(rev), { service: true })),
    audit: deps.audit || cde.audit,
    teamCodes: deps.teamCodes || (async (pid) => ((await cde.sb(`task_teams?project_id=eq.${encodeURIComponent(pid)}&select=code`, { service: true })) || []).map((t) => t.code)),
    requireMinRole: deps.requireMinRole || members.requireMinRole,
    myMembership: deps.myMembership || members.myMembership,
  };
};

const readDoc = async (d, proj, name) => { const x = await d.docGet(proj.id, name); return { rev: Number.isInteger(x?.rev) ? x.rev : 0, rows: Array.isArray(x?.rows) ? x.rows : [] }; };

/** → {name, words, columns, rev, rows}. Viewer or above. */
export async function listAnnex(key, name, deps) {
  const a = annexOf(name);
  const d = await wire(deps);
  await d.requireMinRole(key, "viewer");
  const proj = await d.ensureProject(key);
  return { name, words: a.words, columns: a.columns, ...(await readDoc(d, proj, name)) };
}

/** The write rule of call 3. Risks and mobilisation: a contributor or above. Capability: only an active member of an appointed Firm whose
 *  task team is the row's team (contributor or above) — nobody else, the machine credential and the Lead firm's leads included.
 *  → {team} for a capability write (the declared code), else null. */
async function mayWrite(d, key, proj, name, teamOfRow) {
  if (name !== "capability") { await d.requireMinRole(key, "contributor"); return null; }
  const m = await d.myMembership(key);
  const own = m.role && m.role !== "service" && m.state === "active" && m.party === "appointed" && m.task_team && (RANK[m.role] || 0) >= RANK.contributor;
  if (!own) throw err(403, "Capability rows are entered by each task team's own members.");
  if (String(teamOfRow ?? "").toLowerCase() !== String(m.task_team).toLowerCase()) throw err(403, `You enter capability for your own task team (${m.task_team}) only.`);
  const declared = (await d.teamCodes(proj.id)).find((c) => String(c).toLowerCase() === String(m.task_team).toLowerCase());
  if (!declared) throw err(403, `Team ${m.task_team} is not declared on this project yet — declare it under Teams first.`);
  return { team: declared };
}

async function save(d, proj, name, cur, rows, rev) {
  if (rev !== cur.rev) throw err(409, STALE);
  const data = { rev: cur.rev + 1, rows };
  if (cur.rev === 0) {
    try { await d.docInsert(proj.id, name, data); }
    catch (e) { if (e?.status === 409 || e?.body?.code === "23505") throw err(409, STALE); throw e; }
  } else if (!(await d.docCas(proj.id, name, data, cur.rev))) throw err(409, STALE);
  return data.rev;
}
const who = (actor) => String(actor || "web");
const wantRev = (rev) => { if (!Number.isInteger(rev) || rev < 0) throw err(400, "rev is required — the revision you read"); return rev; };

export async function addRow(key, name, row, { rev, actor } = {}, deps) {
  annexOf(name);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const values = validateRow(name, row);
  const fixed = await mayWrite(d, key, proj, name, values.team);
  if (fixed) values.team = fixed.team;
  wantRev(rev);
  const cur = await readDoc(d, proj, name);
  if (cur.rows.length >= MAX_ROWS) throw err(400, `this list is full (${MAX_ROWS} rows)`);
  const saved = { id: `r-${randomBytes(4).toString("hex")}`, ...values };
  const newRev = await save(d, proj, name, cur, [...cur.rows, saved], rev);
  await d.audit(proj.id, "annex", null, "annex_row_added", who(actor), null, { annex: name, row: saved, touches: saved.touches ?? null });
  return { rev: newRev, row: saved };
}

export async function updateRow(key, name, rowId, row, { rev, actor } = {}, deps) {
  annexOf(name);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const values = validateRow(name, row);
  wantRev(rev);
  const cur = await readDoc(d, proj, name);
  const before = cur.rows.find((r) => r.id === rowId);
  if (!before) throw err(404, "that row is no longer in the list — reload");
  const fixed = await mayWrite(d, key, proj, name, before.team); // the row must be the caller's team's now …
  if (fixed) { await mayWrite(d, key, proj, name, values.team); values.team = fixed.team; } // … and stay so
  const after = { id: rowId, ...values };
  const newRev = await save(d, proj, name, cur, cur.rows.map((r) => (r.id === rowId ? after : r)), rev);
  await d.audit(proj.id, "annex", null, "annex_row_changed", who(actor), { annex: name, row: before }, { annex: name, row: after, touches: after.touches ?? null });
  return { rev: newRev, row: after };
}

export async function removeRow(key, name, rowId, { rev, actor } = {}, deps) {
  annexOf(name);
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  wantRev(rev);
  const cur = await readDoc(d, proj, name);
  const before = cur.rows.find((r) => r.id === rowId);
  if (!before) throw err(404, "that row is no longer in the list — reload");
  await mayWrite(d, key, proj, name, before.team);
  const newRev = await save(d, proj, name, cur, cur.rows.filter((r) => r.id !== rowId), rev);
  await d.audit(proj.id, "annex", null, "annex_row_removed", who(actor), { annex: name, row: before }, { annex: name, row: null, touches: before.touches ?? null });
  return { rev: newRev };
}
