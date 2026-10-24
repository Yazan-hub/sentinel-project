// migration 0049 (BIM documents workspace R1a): dry-run on PGlite with every migration. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";
import { instantiateTemplate, loadTemplates } from "./bimdocs-logic.mjs";
let db, P, Q;
const lead = { sub: uuid(), email: "lead@0049.test" }, contrib = { sub: uuid(), email: "c@0049.test" }, viewer = { sub: uuid(), email: "v@0049.test" }, owner = { sub: uuid(), email: "o@0049.test" };
const insertDoc = (tx, extra = {}) => tx.query(
  `insert into public.bim_documents(project_id, doc_type, title, sections, stage, suitability, access, responds_to)
   values ($1, 'BEP', 'B', $2, $3, $4, $5, $6) returning id`,
  [extra.project ?? P, JSON.stringify(extra.sections ?? []), extra.stage ?? "pre_appointment", extra.suitability ?? "S0", JSON.stringify(extra.access ?? {}), extra.responds_to ?? null]).then((r) => r.rows[0].id);
beforeAll(async () => {
  db = await buildDb();
  for (const u of [lead, contrib, viewer, owner]) await db.query("insert into auth.users(id, email) values ($1, $2)", [u.sub, u.email]);
  P = (await db.query("insert into public.projects(key, name) values ('p49', 'P') returning id")).rows[0].id;
  Q = (await db.query("insert into public.projects(key, name) values ('q49', 'Q') returning id")).rows[0].id;
  for (const [u, r] of [[owner, "owner"], [lead, "lead"], [contrib, "contributor"], [viewer, "viewer"]])
    await db.query("insert into public.memberships(project_id, user_id, role) values ($1, $2, $3)", [P, u.sub, r]);
}, 60_000);

describe("0049 SQL parts 1-4 — columns and insert rules", () => {
  it("a new document defaults to pre-appointment, S0, no access overrides", () => as(db, contrib, async (tx) => {
    const id = await insertDoc(tx);
    expect((await tx.query("select stage, suitability, access from public.bim_documents where id = $1", [id])).rows[0]).toEqual({ stage: "pre_appointment", suitability: "S0", access: {} });
  }));
  it("a signed-in insert cannot set a stage or suitability, and a contributor cannot set access", async () => {
    await expect(as(db, contrib, (tx) => insertDoc(tx, { stage: "confirmed" }))).rejects.toThrow(/pre-appointment stage with suitability S0/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { suitability: "A1" }))).rejects.toThrow(/suitability S0/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { access: { "v@x": "edit" } }))).rejects.toThrow(/only a lead sets/);
    await expect(as(db, lead, (tx) => insertDoc(tx, { access: { "v@x": "edit" } }))).resolves.toBeTruthy();
  });
  it("the service key may set them; a bad code is refused for everyone", async () => {
    await expect(as(db, "service", (tx) => insertDoc(tx, { stage: "confirmed", suitability: "A2" }))).resolves.toBeTruthy();
    await expect(as(db, "service", (tx) => insertDoc(tx, { suitability: "B9" }))).rejects.toThrow(/check constraint/);
  });
  it("responds_to points into the document's own project only", () => as(db, "service", async (tx) => {
    const other = await insertDoc(tx, { project: Q });
    await expect(insertDoc(tx, { responds_to: other })).rejects.toThrow(/its own project only/);
  }));
  it("a document cannot answer itself, a version must exist, a version needs responds_to", async () => {
    await expect(as(db, "service", async (tx) => { const a = await insertDoc(tx); await tx.query("update public.bim_documents set responds_to = id where id = $1", [a]); })).rejects.toThrow(/cannot answer itself/);
    await expect(as(db, "service", async (tx) => { const a = await insertDoc(tx), b = await insertDoc(tx); await tx.query("update public.bim_documents set responds_to = $2, responds_to_version = 3 where id = $1", [b, a]); })).rejects.toThrow(/has no version/);
    await expect(as(db, "service", async (tx) => { const a = await insertDoc(tx); await tx.query("update public.bim_documents set responds_to_version = 1 where id = $1", [a]); })).rejects.toThrow(/bim_documents_responds_pair/);
  });
  it("moving a responding or an answered document to another project is refused", async () => {
    await expect(as(db, "service", async (tx) => { const a = await insertDoc(tx), b = await insertDoc(tx, { responds_to: a }); await tx.query("update public.bim_documents set project_id = $2 where id = $1", [b, Q]); })).rejects.toThrow(/its own project only/);
    await expect(as(db, "service", async (tx) => { const a = await insertDoc(tx); await insertDoc(tx, { responds_to: a }); await tx.query("update public.bim_documents set project_id = $2 where id = $1", [a, Q]); })).rejects.toThrow(/stays in its project/);
  });
  it("a block that is not an object with an id, a known kind and object data is refused", async () => {
    const s = (blocks) => [{ id: "s1", state: "wip", heading: "H", body: "", blocks }];
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "script", data: {} }]) }))).rejects.toThrow(/bim_documents_sections_ok/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "text", data: "x" }]) }))).rejects.toThrow(/bim_documents_sections_ok/);
    await expect(as(db, contrib, (tx) => insertDoc(tx, { sections: s([{ id: "b", kind: "text", data: { markdown: "" } }]) }))).resolves.toBeTruthy();
  });
});

const P0_02 = readFileSync(new URL("../../docs/testing/snowdon-lifecycle/P0/P0-02_Pre-appointment_BEP.md", import.meta.url), "utf8");
// The ten bodies as pasted in the P0 run: the text under each "## N. " heading.
const snowdonSections = () => P0_02.split(/^## \d+\. .*$/m).slice(1).map((body, i) => ({ id: uuid(), heading: `${i + 1}.`, guidance: "", body, state: "wip", owner: "lead@0049.test", bindings: {} }));
const strip = (sections) => sections.map(({ blocks, ...s }) => s);

describe("0049 SQL part 5 — existing documents migrate unchanged", () => {
  let old, ids;
  beforeAll(async () => {
    old = await buildDb({ before: "0049_bim_document_blocks.sql" });
    const p = (await old.query("insert into public.projects(key, name) values ('snw', 'S') returning id")).rows[0].id;
    const readiness = instantiateTemplate(loadTemplates().find((t) => t.doc_type === "READINESS"));
    const declared = readiness.sections.find((s) => s.kind === "declared");
    Object.assign(declared, { answer: { value: "partial", note: "n", by: "a@b", at: "2026-10-23T00:00:00Z" }, due: "2026-11-01" });
    ids = {};
    for (const [name, sections] of [["bep", snowdonSections()], ["readiness", strip(readiness.sections)]])
      ids[name] = (await old.query("insert into public.bim_documents(project_id, doc_type, title, status, sections, updated_at) values ($1, $2, $2, 'published', $3, '2026-10-23T12:00:04Z') returning id",
        [p, name.toUpperCase(), JSON.stringify(sections)])).rows[0].id;
    ids.before = Object.fromEntries((await old.query("select id, sections, updated_at from public.bim_documents")).rows.map((r) => [r.id, r]));
    await old.exec(readFileSync(new URL("../db/migrations/0049_bim_document_blocks.sql", import.meta.url), "utf8"));
  }, 60_000);
  it("every section keeps every field and gains one text block holding its body", async () => {
    for (const r of (await old.query("select id, sections, updated_at from public.bim_documents")).rows) {
      const before = ids.before[r.id];
      expect(strip(r.sections)).toEqual(before.sections);
      for (const s of r.sections) expect(s.blocks).toEqual([{ id: `${s.id}.t0`, kind: "text", title: "", data: { markdown: s.body } }]);
      expect(r.updated_at).toEqual(before.updated_at);
    }
  });
  it("Snowdon's ten bodies, pipe tables included, are byte for byte the same", async () => {
    const r = (await old.query("select sections from public.bim_documents where id = $1", [ids.bep])).rows[0];
    expect(r.sections).toHaveLength(10);
    expect(r.sections.map((s) => s.body)).toEqual(snowdonSections().map((s) => s.body));
    expect(r.sections.some((s) => s.body.includes("|---|"))).toBe(true);
  });
  it("READINESS keeps its answers, due dates and bindings", async () => {
    const s = (await old.query("select sections from public.bim_documents where id = $1", [ids.readiness])).rows[0].sections;
    expect(s.find((x) => x.answer)).toMatchObject({ answer: { value: "partial" }, due: "2026-11-01", kind: "declared" });
    expect(s.filter((x) => x.bindings?.checks?.length).length).toBeGreaterThan(0);
  });
  it("running the backfill twice changes nothing", async () => {
    const once = (await old.query("select sections from public.bim_documents order by id")).rows;
    const sql = readFileSync(new URL("../db/migrations/0049_bim_document_blocks.sql", import.meta.url), "utf8").replace(/\r/g, ""); // CRLF-safe, as 0045/0047
    await old.exec(/-- 5 ·[\s\S]*?;\n/.exec(sql)[0]);
    expect((await old.query("select sections from public.bim_documents order by id")).rows).toEqual(once);
  });
});
