// R3 Task 5, step 6: the database already refuses a signed-in person's direct write of the office's doc_templates rows (bridge_docs, store artefact).
// Only the bridge writes them (service key, after its own lead check); members read them, so an office's projects inherit its templates.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";

let db, O, P;
const u = (tag) => ({ sub: uuid(), email: `${tag}@r3.test` });
const lead = u("lead"), contributor = u("contributor"), projectLead = u("projectlead");
const refused = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); return e.message; } await tx.query("release savepoint r"); return null; };
const BODY = JSON.stringify({ version: 1, body: { templates: [] } });

beforeAll(async () => {
  db = await buildDb();
  for (const x of [lead, contributor, projectLead]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  O = (await db.query("insert into public.projects(key, name, kind) values ('office-r3', 'O', 'office') returning id")).rows[0].id;
  P = (await db.query("insert into public.projects(key, name, office_key) values ('p-r3', 'P', 'office-r3') returning id")).rows[0].id;
  const mem = (p, x, role) => db.query("insert into public.memberships(project_id, user_id, role, party, state) values ($1, $2, $3, 'lead_appointed', 'active')", [p, x.sub, role]);
  await mem(O, lead, "lead"); await mem(O, contributor, "contributor"); await mem(P, projectLead, "lead");
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'doc_templates@1', $2)", [O, BODY]);
}, 60_000);

describe("doc_templates rows: only the bridge writes them", () => {
  it("a contributor of the office is refused a direct insert, update and delete; so is a lead (the bridge's lead check is the gate)", async () => {
    for (const who of [contributor, lead]) await as(db, who, async (tx) => {
      expect(await refused(tx, () => tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'doc_templates@2', $2)", [O, BODY])), who.email).toMatch(/row-level security/);
      await tx.query("update public.bridge_docs set data = '{}' where project_id = $1 and doc_id = 'doc_templates@1'", [O]);
      await tx.query("delete from public.bridge_docs where project_id = $1 and doc_id = 'doc_templates@1'", [O]);
      expect((await tx.query("select count(*)::int n from public.bridge_docs where project_id = $1 and doc_id = 'doc_templates@1' and data = $2::jsonb", [O, BODY])).rows[0].n, "update and delete changed nothing").toBe(1);
    });
  });
  it("a project's own lead is refused a write of the project's row too (templates are the office's)", () => as(db, projectLead, async (tx) => {
    expect(await refused(tx, () => tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'doc_templates@1', $2)", [P, BODY]))).toMatch(/row-level security/);
  }));
  it("a member of the office reads the templates", () => as(db, contributor, async (tx) => {
    expect((await tx.query("select count(*)::int n from public.bridge_docs where project_id = $1 and doc_id = 'doc_templates@1'", [O])).rows[0].n).toBe(1);
  }));
});
