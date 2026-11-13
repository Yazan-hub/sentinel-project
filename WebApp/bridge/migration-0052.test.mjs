// migration 0052 (BIM documents workspace R2c): the Delivery-team comment bag is read only by delivery parties; doc_reads is the bridge's.
// Dry-run on PGlite with every migration; applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

let db, pid, docId;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0052.test` });
const owner = u("owner"), client = u("client"), arcViewer = u("arc"), noParty = u("noparty"), invited = u("invited"), stranger = u("stranger");
const count = async (who, store) => as(db, who, async (tx) => (await tx.query("select count(*)::int n from public.bridge_docs where project_id = $1 and store = $2", [pid, store])).rows[0].n);

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, client, arcViewer, noParty, invited, stranger]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  await db.query("insert into public.projects(key, name, kind) values ('office-52', 'O', 'office')");
  pid = (await db.query("insert into public.projects(key, name, office_key) values ('p52', 'P', 'office-52') returning id")).rows[0].id;
  await db.query("insert into public.task_teams(project_id, code, name) values ($1, 'ARC', 'Architecture')", [pid]);
  for (const [x, role, party, state, team] of [[owner, "owner", "lead_appointed", "active"], [client, "viewer", "appointing", "active"], [arcViewer, "viewer", "appointed", "active", "ARC"],
    [noParty, "contributor", null, "active"], [invited, "viewer", "lead_appointed", "invited"]])
    await db.query("insert into public.memberships(project_id, user_id, role, party, state, task_team) values ($1, $2, $3, $4, $5, $6)", [pid, x.sub, role, party, state, team ?? null]);
  docId = (await db.query("insert into public.bim_documents(project_id, doc_type, title, sections) values ($1, 'BEP', 'T', '[]') returning id", [pid])).rows[0].id;
  for (const s of ["doc_comments", "doc_comments_team", "artefact", "office_register"])
    await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ($1, $2, $3, '{}')", [s, pid, `${s}-1`]);
}, 60_000);

describe("0052 — the team bag is the delivery parties'", () => {
  it("the team bag is read by every active member of a delivery party, viewers included", async () => {
    expect(await count(owner, "doc_comments_team")).toBe(1);
    expect(await count(arcViewer, "doc_comments_team")).toBe(1);
  });
  it("the Client, a member with no party, an invited member and a non-member read no team row", async () => {
    for (const who of [client, noParty, invited, stranger]) expect(await count(who, "doc_comments_team")).toBe(0);
  });
  it("nothing else changes: Everyone comments and artefacts stay member-read, the register stays lead-read", async () => {
    expect(await count(client, "doc_comments")).toBe(1);
    expect(await count(client, "artefact")).toBe(1);
    expect(await count(arcViewer, "office_register")).toBe(0);
    expect(await count(owner, "office_register")).toBe(1);
  });
  it("the service reads the team bag; no signed-in role writes it", async () => {
    expect(await count("service", "doc_comments_team")).toBe(1);
    await expect(as(db, owner, (tx) => tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments_team', $1, 'x', '{}')", [pid]))).rejects.toThrow(/row-level security/);
  });
  it("the function answers by project id or key", () => as(db, arcViewer, async (tx) => {
    expect((await tx.query("select public.bridge_docs_delivery($1) a, public.bridge_docs_delivery('p52') b, public.bridge_docs_delivery('') c", [pid])).rows[0]).toEqual({ a: true, b: true, c: false });
  }));
});

describe("0052 — doc_reads is the bridge's", () => {
  it("a signed-in caller neither reads nor writes it", async () => {
    await expect(as(db, owner, (t) => t.query("insert into public.doc_reads(project_id, document_id, version_no, user_id) values ($1,$2,1,$3)", [pid, docId, owner.sub]))).rejects.toThrow(/permission denied|row-level security/);
    await expect(as(db, owner, (t) => t.query("select count(*)::int n from public.doc_reads"))).rejects.toThrow(/permission denied|row-level security/);
  });
  it("the service writes one row per person per version and a repeat is ignored", async () => {
    const ins = () => db.query("insert into public.doc_reads(project_id, document_id, version_no, user_id) values ($1,$2,1,$3) on conflict do nothing", [pid, docId, owner.sub]);
    await ins(); await ins();
    expect((await db.query("select count(*)::int n from public.doc_reads")).rows[0].n).toBe(1);
    await db.query("delete from public.bim_documents where id = $1", [docId]);
    expect((await db.query("select count(*)::int n from public.doc_reads")).rows[0].n).toBe(0); // on delete cascade
  });
});

describe("0052 files are valid UTF-8", () => {
  for (const f of ["0052_comment_audiences.sql", "probes/0052_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
