// Live facts and lists (R1c, spec 2026-10-24 §4 "facts" and "live_view" kinds, Freezing): ONE resolver turns every `facts` and
// `live_view` block of a document into values. The same object is the freeze preview (GET …/live) and, at publish, snapshot.frozen.
// Reads use the service key after the caller's own read check on the document; nothing personal beyond names and roles (no e-mail
// address anywhere), a register line only when flagged `publish`, and only the project's OWN office's register.
// Deps are injected (the annex-store idiom) so the sequencing is unit-tested without Supabase.
import { PARTS, PART_WORDS } from "./office-register.mjs";
import { ANNEXES } from "./annex-store.mjs";

const EMAIL = /@[^\s@]+\.[^\s@]+/;
const norm = (v) => String(v ?? "").trim().toLowerCase();
const PARTY_WORDS = { appointing: "Client", lead_appointed: "Lead firm", appointed: "Firm" };
const RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };

const wire = async (deps = {}) => {
  const cde = deps.ensureProject && deps.officeOf ? null : await import("./cde-store.mjs");
  const dl = deps.deliverableStatus && deps.tidpReport ? null : await import("./deliverables-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    officeOf: deps.officeOf || (async (proj) => {
      if (!proj.office_key) return null;
      const r = (await cde.sb(`projects?key=eq.${encodeURIComponent(proj.office_key)}&select=id,name,kind`, { service: true }))?.[0];
      return r && r.kind === "office" ? { id: r.id, name: r.name } : null;
    }),
    publishedLines: deps.publishedLines || (async (id, part) => (await import("./office-register.mjs")).publishedLines(id, part)),
    listTeams: deps.listTeams || (async (key) => (await import("./task-teams-store.mjs")).listTeams(key)),
    listMemberRows: deps.listMemberRows || (async (key) => (await import("./members-store.mjs")).listMemberRows(key)),
    deliverableStatus: deps.deliverableStatus || dl.deliverableStatus,
    tidpReport: deps.tidpReport || dl.tidpReport,
    readAnnex: deps.readAnnex || (async (proj, name) => (await import("./annex-store.mjs")).readAnnexRows(proj, name)),
    requireDocAccess: deps.requireDocAccess || (async (key, doc, level) => (await import("./doc-access.mjs")).requireDocAccess(key, doc, level)),
    requireMinRole: deps.requireMinRole || (async (key, min) => (await import("./members-store.mjs")).requireMinRole(key, min)),
  };
};

/** A lookup memoised per resolve, so a document with ten blocks reads each source once. */
const memo = (fn) => { let p; return () => (p ??= fn()); };

/** One register line as a sentence, or null when it would carry an e-mail address (the register refuses them on write; this is the second lock). */
function lineText(l) {
  const evid = l.evidence ? ` (${l.evidence})` : "";
  const t = {
    people: () => `${l.function}: ${l.who}${l.competence ? ` — ${l.competence}` : ""}`,
    software: () => `${[l.name, l.version].filter(Boolean).join(" ")}${l.use ? ` — ${l.use}` : ""}`,
    hardware: () => `${l.item}${l.spec ? ` — ${l.spec}` : ""}`,
    past_projects: () => `${l.name}${l.year ? ` (${l.year})` : ""}${l.role ? ` — ${l.role}` : ""}`,
    training: () => `${l.course}${l.who ? ` — ${l.who}` : ""}`,
    terms: () => `${l.term}: ${l.meaning}`,
  }[l.part]?.();
  if (!t || EMAIL.test(t) || EMAIL.test(l.evidence_note ?? "") || EMAIL.test(l.owner ?? "")) return null;
  return t + evid;
}

const regFact = (part) => async (c) => {
  const lines = (await c.lines(part)).map(lineText).filter(Boolean);
  return lines.length ? lines.join("\n") : null;
};
const setting = (k) => (c) => c.proj.settings?.[k] || c.proj.metadata?.settings?.[k] || null;

/** Party counts only: "Client: 1 (viewer); Lead firm: 2 (owner, lead); Firm · Team ARC: 1 (contributor)". Active members only; never an identity. */
function partyCounts(members) {
  const groups = new Map();
  for (const m of members.filter((x) => (x.state ?? "active") === "active")) {
    const g = !m.party ? "No party set" : m.party === "appointed" ? `${PARTY_WORDS.appointed}${m.task_team ? ` · Team ${m.task_team}` : ""}` : PARTY_WORDS[m.party] || "No party set";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m.role);
  }
  const order = (g) => (g === "Client" ? 0 : g === "Lead firm" ? 1 : g === "No party set" ? 3 : 2);
  return [...groups].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([g, roles]) => {
    const by = {};
    for (const r of roles) by[r] = (by[r] || 0) + 1;
    const words = Object.keys(by).sort((a, b) => (RANK[b] || 0) - (RANK[a] || 0)).map((r) => (by[r] > 1 ? `${r} ×${by[r]}` : r)).join(", ");
    return `${g}: ${roles.length} (${words})`;
  }).join("; ") || null;
}

export const FACTS = [
  { label: "project.name", words: "Project name", read: (c) => c.proj.name || null },
  { label: "project.number", words: "Project number", read: setting("project_number") },
  { label: "project.appointing_party", words: "Appointing party (client)", read: (c) => setting("owner")(c) || c.proj.appointing_party || null },
  { label: "project.type", words: "Project type", read: setting("project_type") },
  { label: "project.address", words: "Address", read: setting("address") },
  { label: "project.location", words: "Location", read: setting("location") },
  { label: "project.start_date", words: "Start date", read: setting("start_date") },
  { label: "project.completion_date", words: "Completion date", read: setting("completion_date") },
  { label: "project.office", words: "Lead firm's office", read: async (c) => (await c.office())?.name ?? null },
  { label: "team.task_teams", words: "Task teams", read: async (c) => {
    const t = (await c.teams()).map((x) => (x.name ? `${x.code} — ${x.name}` : x.code));
    return t.length ? t.join("; ") : null;
  } },
  { label: "team.parties", words: "Who is in which party", read: async (c) => partyCounts(await c.members()) },
  { label: "register.people", words: "Information management functions", read: regFact("people") },
  { label: "register.software", words: "Software we use", read: regFact("software") },
  { label: "register.hardware", words: "Hardware and IT", read: regFact("hardware") },
  { label: "register.past_projects", words: "Past projects", read: regFact("past_projects") },
  { label: "register.training", words: "Training plan", read: regFact("training") },
];
const FACT_BY_LABEL = new Map(FACTS.map((f) => [f.label, f]));

const context = (d, key, proj) => {
  const office = memo(() => d.officeOf(proj));
  const all = memo(async () => { const o = await office(); return o ? d.publishedLines(o.id) : []; }); // the project's OWN office only
  return {
    proj, office,
    teams: memo(() => d.listTeams(key)),
    members: memo(() => d.listMemberRows(key)),
    lines: async (part) => (await all()).filter((l) => !part || l.part === part),
  };
};

const readFact = async (c, label) => {
  const f = FACT_BY_LABEL.get(label);
  if (!f) return { label, words: label, value: null, note: "not a known fact" };
  const v = await f.read(c);
  if (typeof v === "string" && EMAIL.test(v)) return { label, words: f.words, value: null, note: "withheld: it holds an e-mail address" }; // review R1c-1
  return { label, words: f.words, value: typeof v === "string" && v.trim() ? v : null };
};

/** Review R1c-1: no e-mail address leaves the resolver, whatever free text a project setting, team name or deliverable holds. */
const WITHHELD = "(e-mail withheld)";
const scrubRow = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && EMAIL.test(v) ? WITHHELD : v]));
const scrubLive = (l) => ({ ...l, rows: (l.rows || []).map(scrubRow), ...(l.groups ? { groups: l.groups.map((g) => ({ ...g, rows: (g.rows || []).map(scrubRow) })) } : {}) });

const DELIV_COLS = [{ key: "container", words: "Container" }, { key: "title", words: "Title" }, { key: "team", words: "Task team" },
  { key: "stage", words: "Stage" }, { key: "due", words: "Due" }, { key: "status", words: "Status" }];
const delivRow = (r) => ({ container: r.container_name ?? "", title: r.title ?? "", team: r.responsible_team ?? "", stage: r.stage ?? "", due: r.due_date ?? "", status: r.status ?? "" });
const REG_COLS = [{ key: "part", words: "Part" }, { key: "what", words: "Line" }, { key: "evidence", words: "Evidence" },
  { key: "evidence_note", words: "Evidence note" }, { key: "owner", words: "Owner" }, { key: "due", words: "Due" }];
const CAP_COLS = ANNEXES.capability.columns.map((c) => ({ key: c.key, words: c.words }));
const summary = (rows) => `${rows.filter((r) => r.evidence === "evidenced").length} evidenced, ${rows.filter((r) => r.evidence === "committed").length} committed`;
const LEAD_AREA = { people: "people", software: "software", hardware: "hardware", training: "people" };

async function readLive(d, c, key, proj, doc, data) {
  const source = data.source, f = data.filter || {};
  const base = (words, extra) => ({ kind: "live_view", source, words, columns: [], rows: [], ...extra });
  if (source === "midp") {
    const rows = (await d.deliverableStatus(key)).rows.filter((r) => !f.stage || r.stage === f.stage).map(delivRow);
    return base("Master information delivery plan", { columns: DELIV_COLS, rows, edit_hint: "Edit in Deliverables" });
  }
  if (source === "tidp") {
    const hint = "Edit in Deliverables";
    if (!f.team) return base("Task information delivery plan", { columns: DELIV_COLS, edit_hint: hint, note: "Pick a task team" });
    const t = (await d.tidpReport(key)).tidps.find((x) => x.declared !== false && norm(x.code) === norm(f.team)); // review R1c-2: an undeclared team gets the note
    return base(`Task information delivery plan — Team ${f.team}`, { columns: DELIV_COLS, edit_hint: hint,
      rows: (t?.rows || []).filter((r) => !f.stage || r.stage === f.stage).map(delivRow), ...(t ? {} : { note: `Team ${f.team} is not a task team of this project` }) });
  }
  if (source === "office_register") {
    const hint = "Edit in the office's Settings ▸ Office register";
    const part = f.register_part && PARTS.includes(f.register_part) ? f.register_part : null;
    const words = part ? `Office register — ${PART_WORDS[part]}` : "Office register";
    if (!(await c.office())) return base(words, { columns: REG_COLS, edit_hint: hint, note: "This project is not attached to an office" });
    const rows = (await c.lines(part)).map((l) => ({ l, what: lineText({ ...l, evidence: "" }) })).filter((x) => x.what)
      .map(({ l, what }) => ({ part: PART_WORDS[l.part], what, evidence: l.evidence ?? "", evidence_note: l.evidence_note ?? "", owner: l.owner ?? "", due: l.due ?? "" }));
    return base(words, { columns: REG_COLS, rows, edit_hint: hint });
  }
  if (source === "risk_register" || source === "mobilisation") {
    const a = ANNEXES[source];
    const rows = (await d.readAnnex(proj, source)).rows || [];
    return base(a.words, { columns: a.columns.map(({ key: k, words }) => ({ key: k, words })), rows,
      edit_hint: `Edit in Deliverables ▸ ${source === "risk_register" ? "Risks" : "Mobilisation"}` });
  }
  if (source === "capability") {
    const groups = [];
    const lead = (await c.lines()).filter((l) => LEAD_AREA[l.part]).map((l) => ({ l, item: lineText({ ...l, evidence: "" }) })).filter((x) => x.item)
      .map(({ l, item }) => ({ team: "Lead firm", area: LEAD_AREA[l.part], item, evidence: l.evidence ?? "", evidence_note: l.evidence_note ?? "", owner: l.owner ?? "", due: l.due ?? "" }));
    if (lead.length) groups.push({ title: "Lead firm (from the office register)", prospective: false, rows: lead, summary: summary(lead) });
    const rows = (await d.readAnnex(proj, "capability")).rows || [];
    for (const t of await c.teams()) {
      const mine = rows.filter((r) => norm(r.team) === norm(t.code));
      if (mine.length) groups.push({ title: `Firm · Team ${t.code}`, prospective: doc.stage === "pre_appointment", rows: mine, summary: summary(mine) });
    }
    return base(ANNEXES.capability.words, { columns: CAP_COLS, groups, edit_hint: "Edit in Deliverables ▸ Capability" });
  }
  return base(String(source), { note: "not a known list" });
}

/** The blocks of a document that need live data: [{id, kind, data}]. */
const liveBlocks = (doc) => (Array.isArray(doc?.sections) ? doc.sections : []).flatMap((s) =>
  (Array.isArray(s?.blocks) ? s.blocks : []).filter((b) => b && (b.kind === "facts" || b.kind === "live_view")));

/** → { at, blocks: { [blockId]: Facts | Live } } — the freeze preview, and what a publish writes as snapshot.frozen. Needs read access on the document. */
export async function resolveLive(key, doc, deps) {
  const d = await wire(deps);
  await d.requireDocAccess(key, doc, "read");
  const blocks = {};
  const found = liveBlocks(doc);
  if (found.length) {
    const proj = await d.ensureProject(key);
    const c = context(d, key, proj);
    for (const b of found) {
      blocks[b.id] = b.kind === "facts"
        ? { kind: "facts", items: await Promise.all((b.data?.labels || []).map((l) => readFact(c, l))) }
        : scrubLive(await readLive(d, c, key, proj, doc, b.data || {}));
    }
  }
  return { at: new Date().toISOString(), blocks };
}

/** → [{label, words, value}] for the facts editor's checklist. Viewer or above. */
export async function listFacts(key, deps) {
  const d = await wire(deps);
  await d.requireMinRole(key, "viewer");
  const c = context(d, key, await d.ensureProject(key));
  return Promise.all(FACTS.map(async (f) => { const { label, words, value } = await readFact(c, f.label); return { label, words, value }; }));
}
