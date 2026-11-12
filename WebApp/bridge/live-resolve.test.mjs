import { describe, it, expect, vi } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { FACTS, resolveLive, listFacts } from "./live-resolve.mjs";
import { maskVersion, buildSnapshot } from "./bimdocs-logic.mjs";
import { buildDb, as } from "./pglite-harness.mjs";

const refuse = (status, message) => Object.assign(new Error(message), { status });
const line = (part, f, o = {}) => ({ part, id: "x", publish: true, evidence: "evidenced", evidence_note: "", owner: "", due: "", ...f, ...o });
const FIRM = [
  line("people", { function: "BIM manager", who: "Ana Ruiz", competence: "ISO 19650 lead" }),
  line("software", { name: "Revit", version: "2025", use: "modelling" }),
  line("hardware", { item: "Workstation", spec: "RTX 4000" }),
  line("training", { course: "ISO 19650", who: "all" }, { evidence: "committed", owner: "Ana", due: "2026-12-01" }),
  line("past_projects", { name: "Hospital", year: "2024", role: "BIM lead" }),
];
const D1 = (n, team, o = {}) => ({ container_name: n, title: `T ${n}`, responsible_team: team, stage: "design", due_date: "2026-12-01", status: "pending", ...o });
const mk = (over = {}) => ({
  ensureProject: vi.fn(async () => ({ id: "p1", name: "Snowdon", appointing_party: "Col", office_key: "off", metadata: { settings: { owner: "Badran", project_number: "P-9", address: "1 High St", location: "Dubai", project_type: "Hospital", start_date: "2026-01-01", completion_date: "2027-01-01" } } })),
  officeOf: vi.fn(async () => ({ id: "office-1", name: "Aster Office" })),
  // the real publishedLines filters flagged lines inside the store; a mock stands in for what it returns
  publishedLines: vi.fn(async (id) => (id === "office-1" ? FIRM : [line("software", { name: "OTHER OFFICE" })])),
  listTeams: vi.fn(async () => [{ code: "ARC", name: "Architecture", lead_email: "arc@x.com" }, { code: "STR", name: null }]),
  listMemberRows: vi.fn(async () => [
    { user_id: "u1", role: "viewer", party: "appointing", task_team: null, state: "active" },
    { user_id: "u2", role: "owner", party: "lead_appointed", task_team: null, state: "active" },
    { user_id: "u3", role: "lead", party: "lead_appointed", task_team: null, state: "active" },
    { user_id: "u4", role: "contributor", party: "appointed", task_team: "ARC", state: "active" },
    { user_id: "u5", role: "contributor", party: "appointed", task_team: "ARC", state: "invited", email: "inv@x.com" },
  ]),
  deliverableStatus: vi.fn(async () => ({ rows: [D1("a", "ARC"), D1("b", "STR", { stage: "coord" })] })),
  tidpReport: vi.fn(async () => ({ tidps: [{ code: "ARC", rows: [D1("a", "ARC")] }, { code: "STR", rows: [D1("b", "STR", { stage: "coord" })] }] })),
  readAnnex: vi.fn(async (_p, name) => ({ rev: 1, rows: name === "capability"
    ? [{ id: "r-1", team: "arc", area: "software", item: "Navisworks", evidence: "evidenced" }, { id: "r-2", team: "ARC", area: "people", item: "Coordinator", evidence: "committed" }, { id: "r-3", team: "ZZZ", area: "people", item: "ghost", evidence: "evidenced" }]
    : [{ id: "r-1", risk: "Late survey", owner: "Ana" }] })),
  requireDocAccess: vi.fn(async () => "viewer"),
  requireMinRole: vi.fn(async () => "viewer"),
  ...over,
});
const doc = (blocks, extra = {}) => ({ id: "d1", stage: "pre_appointment", sections: [{ id: "s1", blocks }], ...extra });
const facts = (labels, id = "f1") => ({ id, kind: "facts", data: { labels, layout: "text" } });
const live = (source, filter = {}, id = "l1") => ({ id, kind: "live_view", data: { source, filter: { team: null, stage: null, register_part: null, ...filter } } });
const run = (blocks, d = mk(), extra) => resolveLive("demo", doc(blocks, extra), d);

describe("FACTS", () => {
  it("the labels and words of the plan, in order", () => {
    expect(FACTS.map((f) => f.label)).toEqual(["project.name", "project.number", "project.appointing_party", "project.type", "project.address", "project.location",
      "project.start_date", "project.completion_date", "project.office", "team.task_teams", "team.parties", "register.people", "register.software", "register.hardware", "register.past_projects", "register.training"]);
    expect(FACTS.find((f) => f.label === "team.parties").words).toBe("Who is in which party");
    expect(FACTS.find((f) => f.label === "project.office").words).toBe("Lead firm's office");
  });
});

describe("facts blocks", () => {
  it("reads every fact", async () => {
    const r = await run([facts(FACTS.map((f) => f.label))]);
    const v = Object.fromEntries(r.blocks.f1.items.map((i) => [i.label, i.value]));
    expect(r.blocks.f1.kind).toBe("facts");
    expect(v).toMatchObject({ "project.name": "Snowdon", "project.number": "P-9", "project.appointing_party": "Badran", "project.type": "Hospital", "project.address": "1 High St",
      "project.location": "Dubai", "project.start_date": "2026-01-01", "project.completion_date": "2027-01-01", "project.office": "Aster Office", "team.task_teams": "ARC — Architecture; STR" });
    expect(v["register.software"]).toBe("Revit 2025 — modelling (evidenced)");
    expect(v["register.people"]).toBe("BIM manager: Ana Ruiz — ISO 19650 lead (evidenced)");
    expect(v["register.training"]).toBe("ISO 19650 — all (committed)");
    expect(v["register.past_projects"]).toBe("Hospital (2024) — BIM lead (evidenced)");
    expect(new Date(r.at).toString()).not.toBe("Invalid Date");
  });
  it("the appointing party falls back to the project column; a missing value is null", async () => {
    const d = mk({ ensureProject: vi.fn(async () => ({ id: "p1", name: "N", appointing_party: "Col", office_key: null, metadata: {} })), officeOf: vi.fn(async () => null) });
    const v = Object.fromEntries((await run([facts(["project.appointing_party", "project.number", "project.office", "register.software"])], d)).blocks.f1.items.map((i) => [i.label, i.value]));
    expect(v).toEqual({ "project.appointing_party": "Col", "project.number": null, "project.office": null, "register.software": null });
    expect(d.publishedLines).not.toHaveBeenCalled(); // no office, no register read
  });
  it("an unknown label carries the note", async () => {
    const r = await run([facts(["project.colour"])]);
    expect(r.blocks.f1.items).toEqual([{ label: "project.colour", words: "project.colour", value: null, note: "not a known fact" }]);
  });
  it("team.parties is counts per party and role, active members only, and no e-mail anywhere", async () => {
    const r = await run([facts(["team.parties", "team.task_teams"])]);
    expect(r.blocks.f1.items[0].value).toBe("Client: 1 (viewer); Lead firm: 2 (owner, lead); Firm · Team ARC: 1 (contributor)");
    expect(JSON.stringify(r)).not.toContain("@"); // the team lead's e-mail and the invited member's are never read into a fact
  });
  it("only the project's own office is read, and only by its id", async () => {
    const d = mk();
    await run([facts(["register.software"])], d);
    expect(d.publishedLines.mock.calls.map((c) => c[0])).toEqual(["office-1"]);
  });
  it("a register line carrying an e-mail address is dropped (second lock)", async () => {
    const d = mk({ publishedLines: vi.fn(async () => [line("people", { function: "BIM", who: "ana@x.com" }), line("people", { function: "Lead", who: "Bo" })]) });
    expect((await run([facts(["register.people"])], d)).blocks.f1.items[0].value).toBe("Lead: Bo (evidenced)");
  });
  it("the facts list is every fact with its value, behind a viewer check", async () => {
    const d = mk();
    const l = await listFacts("demo", d);
    expect(l).toHaveLength(16);
    expect(l[0]).toEqual({ label: "project.name", words: "Project name", value: "Snowdon" });
    expect(d.requireMinRole).toHaveBeenCalledWith("demo", "viewer");
    await expect(listFacts("demo", mk({ requireMinRole: vi.fn(async () => { throw refuse(404, "nope"); }) }))).rejects.toMatchObject({ status: 404 });
  });
});

describe("live lists", () => {
  it("midp lists every deliverable, filtered by stage when asked", async () => {
    const b = (await run([live("midp")])).blocks.l1;
    expect(b).toMatchObject({ kind: "live_view", source: "midp", edit_hint: "Edit in Deliverables" });
    expect(b.columns.map((c) => c.key)).toEqual(["container", "title", "team", "stage", "due", "status"]);
    expect(b.rows.map((r) => r.container)).toEqual(["a", "b"]);
    expect((await run([live("midp", { stage: "coord" })])).blocks.l1.rows.map((r) => r.container)).toEqual(["b"]);
  });
  it("tidp needs a team; with one, only that team's rows", async () => {
    const none = (await run([live("tidp")])).blocks.l1;
    expect(none.note).toBe("Pick a task team");
    expect(none.rows).toEqual([]);
    expect((await run([live("tidp", { team: "str" })])).blocks.l1.rows.map((r) => r.container)).toEqual(["b"]);
    expect((await run([live("tidp", { team: "ZZZ" })])).blocks.l1.note).toMatch(/not a task team/);
  });
  it("office_register: flagged lines only, one part or all, with the hint", async () => {
    const all = (await run([live("office_register")])).blocks.l1;
    expect(all.edit_hint).toBe("Edit in the office's Settings ▸ Office register");
    expect(all.rows).toHaveLength(5);
    const sw = (await run([live("office_register", { register_part: "software" })])).blocks.l1;
    expect(sw.rows).toEqual([{ part: "Software", what: "Revit 2025 — modelling", evidence: "evidenced", evidence_note: "", owner: "", due: "" }]);
  });
  it("an unflagged line and another office's line never appear (the resolver asks the store for the project's own office only)", async () => {
    const d = mk();
    const r = await run([live("office_register"), facts(["register.software"])], d);
    expect(JSON.stringify(r)).not.toContain("OTHER OFFICE");
    expect(d.publishedLines.mock.calls.every((c) => c[0] === "office-1")).toBe(true);
  });
  it("an office-less project shows a note, not another office's register", async () => {
    const d = mk({ officeOf: vi.fn(async () => null) });
    const b = (await run([live("office_register")], d)).blocks.l1;
    expect(b.rows).toEqual([]);
    expect(b.note).toMatch(/not attached to an office/);
  });
  it("risk register and mobilisation read the annex rows with their hints", async () => {
    const r = (await run([live("risk_register", {}, "a"), live("mobilisation", {}, "b")])).blocks;
    expect(r.a.rows).toEqual([{ id: "r-1", risk: "Late survey", owner: "Ana" }]);
    expect(r.a.edit_hint).toBe("Edit in Deliverables ▸ Risks");
    expect(r.b.edit_hint).toBe("Edit in Deliverables ▸ Mobilisation");
    expect(r.a.columns[0]).toEqual({ key: "risk", words: "Risk" });
  });
  it("capability: the Lead firm group first, then one group per declared team that has rows, prospective before appointment, with a summary", async () => {
    const g = (await run([live("capability")])).blocks.l1.groups;
    expect(g.map((x) => x.title)).toEqual(["Lead firm (from the office register)", "Firm · Team ARC"]); // STR has no rows; ZZZ is undeclared
    expect(g[0]).toMatchObject({ prospective: false, summary: "3 evidenced, 1 committed" }); // people, software, hardware | training (past projects are not capability)
    expect(g[1]).toMatchObject({ prospective: true, summary: "1 evidenced, 1 committed" });
    expect(g[1].rows).toHaveLength(2);
    const after = (await run([live("capability")], mk(), { stage: "confirmed" })).blocks.l1.groups;
    expect(after[1].prospective).toBe(false);
  });
  it("no @ in any row of any source", async () => {
    const all = await run([live("midp", {}, "1"), live("tidp", { team: "ARC" }, "2"), live("office_register", {}, "3"), live("risk_register", {}, "4"), live("mobilisation", {}, "5"), live("capability", {}, "6"), facts(FACTS.map((f) => f.label), "7")]);
    expect(JSON.stringify(all)).not.toContain("@");
  });
  it("blocks other than facts and live views are not read, and a document with none reads nothing", async () => {
    const d = mk();
    const r = await run([{ id: "t", kind: "text", data: { markdown: "x" } }], d);
    expect(r.blocks).toEqual({});
    expect(d.ensureProject).not.toHaveBeenCalled();
  });
  it("read access is asked before anything is read; a refusal reads nothing", async () => {
    const d = mk({ requireDocAccess: vi.fn(async () => { throw refuse(403, "needs viewer"); }) });
    await expect(run([facts(["project.name"])], d)).rejects.toMatchObject({ status: 403 });
    expect(d.ensureProject).not.toHaveBeenCalled();
    expect(d.requireDocAccess.mock.calls[0][2]).toBe("read");
  });
  it("a source that cannot be read fails the whole resolve", async () => {
    const d = mk({ deliverableStatus: vi.fn(async () => { throw refuse(500, "db down"); }) });
    await expect(run([live("midp")], d)).rejects.toMatchObject({ status: 500 });
  });
});

describe("frozen in the version", () => {
  it("buildSnapshot puts frozen on the snapshot; without it the snapshot is the row", () => {
    const row = { id: "d1", sections: [] };
    const frozen = { at: "t", blocks: { f1: { kind: "facts", items: [] } } };
    expect(buildSnapshot(row, "L", "a", 2, frozen).snapshot).toEqual({ id: "d1", sections: [], frozen });
    expect(buildSnapshot(row, "L", "a", 2).snapshot).toBe(row);
  });
  it("frozen passes the viewer mask", () => {
    const frozen = { at: "t", blocks: { l1: { kind: "live_view", rows: [] } } };
    expect(maskVersion({ version_no: 1, snapshot: { id: "d", sections: [], frozen } }).snapshot.frozen).toEqual(frozen);
  });
  it("the 0049 version trigger accepts a snapshot with frozen (service insert), and still refuses sections that are not the document's", async () => {
    const db = await buildDb();
    const P = (await db.query("insert into public.projects(key, name) values ('lr', 'P') returning id")).rows[0].id;
    const sections = [{ id: uuid(), heading: "H", guidance: "", body: "", state: "wip", owner: null, bindings: {} }];
    const frozen = { at: "2026-11-12T00:00:00Z", blocks: { f1: { kind: "facts", items: [{ label: "project.name", words: "Project name", value: "P" }] } } };
    const ins = (tx, id, n, snapshot) => tx.query("insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by) values ($1, $2, $3, 'v', 'a')", [id, n, JSON.stringify(snapshot)]);
    await as(db, "service", async (tx) => {
      const id = (await tx.query("insert into public.bim_documents(project_id, doc_type, title, sections, status) values ($1, 'BEP', 'B', $2, 'published') returning id", [P, JSON.stringify(sections)])).rows[0].id;
      const row = (await tx.query("select * from public.bim_documents where id = $1", [id])).rows[0];
      await ins(tx, id, 1, buildSnapshot(row, "v", "a", 1, frozen).snapshot); // the service insert succeeds
      expect((await tx.query("select snapshot from public.bim_document_versions where document_id = $1", [id])).rows[0].snapshot.frozen).toEqual(frozen);
    });
    await expect(as(db, "service", async (tx) => {
      const id = (await tx.query("insert into public.bim_documents(project_id, doc_type, title, sections, status) values ($1, 'BEP', 'B', $2, 'published') returning id", [P, JSON.stringify(sections)])).rows[0].id;
      const row = (await tx.query("select * from public.bim_documents where id = $1", [id])).rows[0];
      await ins(tx, id, 1, { ...row, sections: [], frozen });
    })).rejects.toThrow(/sections are not the document's current sections/);
  }, 60_000);
});

// Review R1c fixes: no e-mail leaves the resolver from any free text; an undeclared team's TIDP list says so.
describe("review fixes", () => {
  it("a project setting or a deliverable cell holding an e-mail address is withheld (R1c-1)", async () => {
    const d = mk({
      ensureProject: vi.fn(async () => ({ id: "p1", name: "Snowdon", office_key: "off", metadata: { settings: { owner: "client@firm.com" } } })),
      deliverableStatus: vi.fn(async () => ({ rows: [D1("a", "ARC", { title: "send to bob@firm.com" })] })),
    });
    const r = await run([facts(["project.appointing_party"]), live("midp")], d);
    expect(r.blocks.f1.items[0]).toMatchObject({ value: null, note: "withheld: it holds an e-mail address" });
    expect(r.blocks.l1.rows[0].title).toBe("(e-mail withheld)");
    expect(JSON.stringify(r)).not.toMatch(/@firm\.com/);
  });
  it("a TIDP list for a team the roll-up marks undeclared gets the note, not its rows (R1c-2)", async () => {
    const d = mk({ tidpReport: vi.fn(async () => ({ tidps: [{ code: "XYZ", declared: false, rows: [D1("z", "XYZ")] }] })) });
    const r = await run([live("tidp", { team: "XYZ" })], d);
    expect(r.blocks.l1.rows).toEqual([]);
    expect(r.blocks.l1.note).toMatch(/not a task team of this project/);
  });
});
