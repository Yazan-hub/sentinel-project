// migration 0046 (AI privacy review H2): a project leaves its office only through a lead of that office — dry-run on PGlite with
// every migration (pglite-harness.mjs), the probe's five cases. Applying it live is the founder's; nothing here touches a real database.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";

let db;
const u = { p: { sub: uuid() }, both: { sub: uuid() }, move: { sub: uuid() } };
const LEAVE = "a project leaves its office only through a lead of that office — nothing was saved";

beforeAll(async () => {
  db = await buildDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows[0];
  for (const [k, x] of Object.entries(u)) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, `${k}@probe.test`]);
  const o1 = (await q("insert into public.projects(key, name, kind) values ('o1', 'Office 1', 'office') returning id")).id;
  const o2 = (await q("insert into public.projects(key, name, kind) values ('o2', 'Office 2', 'office') returning id")).id;
  const p = (await q("insert into public.projects(key, name, office_key) values ('p', 'Project', 'o1') returning id")).id;
  await db.query(`insert into public.memberships(project_id, user_id, role) values ($1, $4, 'lead'), ($1, $5, 'lead'), ($2, $5, 'lead'), ($1, $6, 'lead'), ($3, $6, 'lead')`,
    [p, o1, o2, u.p.sub, u.both.sub, u.move.sub]);
}, 60_000);

/** The update as `who`, rolled back: "OK <rows>" or the error's words. */
const update = (who, office) => as(db, who, async (tx) => {
  try { const r = await tx.query("update public.projects set office_key = $1 where key = 'p'", [office]); return `OK ${r.affectedRows}`; }
  catch (e) { return e.message; }
});

describe("migration 0046 — leaving an office needs a lead of that office", () => {
  it("a project's lead cannot detach it from its office", async () => {
    expect(await update(u.p, null)).toBe(LEAVE);
  });
  it("a lead of the project and of another office cannot move it out", async () => {
    expect(await update(u.move, "o2")).toBe(LEAVE);
  });
  it("a lead of the office detaches it; the service key moves it", async () => {
    expect(await update(u.both, null)).toBe("OK 1");
    expect(await update("service", "o2")).toBe("OK 1");
  });
  it("0033's attach rule still holds", async () => {
    await as(db, "service", async (tx) => {
      await tx.query("update public.projects set office_key = null where key = 'p'");
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.p.sub, role: "authenticated" })]);
      await expect(tx.query("update public.projects set office_key = 'o1' where key = 'p'")).rejects.toThrow(/attaching a project to an office needs the lead role/);
    });
  });
});
