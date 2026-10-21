// migration 0048 (human-error guards §2): every update of a project bumps its version and stamps who and when; a write on a stale
// version changes nothing — dry-run on PGlite with every migration (pglite-harness.mjs). Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";

let db;
const lead = { sub: uuid(), email: "lead@probe.test" };

beforeAll(async () => {
  db = await buildDb();
  await db.query("insert into auth.users(id, email) values ($1, $2)", [lead.sub, lead.email]);
  const p = (await db.query("insert into public.projects(key, name) values ('p48', 'Project') returning id")).rows[0].id;
  await db.query("insert into public.memberships(project_id, user_id, role) values ($1, $2, 'lead')", [p, lead.sub]);
}, 60_000);

const row = (tx) => tx.query("select version, updated_by from public.projects where key = 'p48'").then((r) => r.rows[0]);

describe("migration 0048 — a project's version", () => {
  it("a new project starts at version 1", () => as(db, "service", async (tx) => expect((await row(tx)).version).toBe(1)));

  it("a service write bumps it and is stamped the machine credential", () => as(db, "service", async (tx) => {
    await tx.query("update public.projects set name = 'Renamed' where key = 'p48'");
    expect(await row(tx)).toEqual({ version: 2, updated_by: "the Sentinel bridge (machine credential)" });
  }));

  it("a signed-in lead's write is stamped with their email — never what the client sent, and never the client's version", () => as(db, lead, async (tx) => {
    await tx.query("update public.projects set name = 'Lead', updated_by = 'someone else', version = 99 where key = 'p48'");
    expect(await row(tx)).toEqual({ version: 2, updated_by: lead.email });
  }));

  it("a save of the panels' snapshot alone keeps the version — a form is never stale for it", () => as(db, "service", async (tx) => {
    await tx.query(`update public.projects set metadata = coalesce(metadata, '{}'::jsonb) || '{"snapshot":{"health":90},"updated_at":"x"}'::jsonb where key = 'p48'`);
    expect((await row(tx)).version).toBe(1);
    await tx.query(`update public.projects set metadata = metadata || '{"rate_pack":"uk-2026"}'::jsonb where key = 'p48'`);
    expect((await row(tx)).version).toBe(2);
  }));

  it("a write filtered on a stale version changes nothing", () => as(db, "service", async (tx) => {
    await tx.query("update public.projects set name = 'First' where key = 'p48' and version = 1");
    const r = await tx.query("update public.projects set name = 'Second' where key = 'p48' and version = 1");
    expect(r.affectedRows).toBe(0);
    expect((await tx.query("select name from public.projects where key = 'p48'")).rows[0].name).toBe("First");
  }));
});
