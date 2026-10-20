// Migration 0045 — a hash chain per project, beside the global one. Runs the real migrations on PGlite (pglite-harness.mjs): rows
// written before 0045 are carried into the chain by its backfill, rows written after by its trigger, and ledger-verify.mjs (the
// auditor's file) recomputes every project_hash the database made — the SQL text and the JS text are the same text.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID as uuid } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";
import { verifyChain } from "./ledger-verify.mjs";

const SQL = readFileSync(new URL("../db/migrations/0045_project_chain.sql", import.meta.url), "utf8").replace(/\r/g, "");
const P1 = uuid(), P2 = uuid(), user = { sub: uuid(), email: "m@p1.test" };
let db;

const ins = (pid, type, action, actor, oldv, newv) => db.query(
  "insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)",
  [pid, type, type === "container" ? uuid() : null, action, actor, oldv == null ? null : JSON.stringify(oldv), newv == null ? null : JSON.stringify(newv)]);
const chain = async (pid) => (await db.query("select * from public.audit_project_chain_v where project_id = $1 order by project_seq", [pid])).rows
  .map((r) => ({ ...r, project_seq: Number(r.project_seq), audit_id: Number(r.audit_id) }));

beforeAll(async () => {
  db = await buildDb({ before: "0045" });
  await db.query("insert into public.projects(id, key, name) values ($1, 'chain-a', 'A'), ($2, 'chain-b', 'B')", [P1, P2]);
  await db.query("insert into auth.users(id, email) values ($1, $2)", [user.sub, user.email]);
  await db.query("insert into public.memberships(project_id, user_id, role) values ($1, $2, 'viewer')", [P1, user.sub]);
  // Before 0045: what the backfill must carry over — text a jsonb renders its own way (key order, spacing, numbers), unicode, nulls.
  await db.query(`insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values ($1, 'container', $2, 'state: wip → shared', 'lead@a.test', '{"state": "shared", "b": 1, "aa": [1.50, 2e3, null]}')`, [P1, uuid()]);
  await ins(P2, "event", "note", "Zoë Ångström", { x: "naïve — 日本\n\"q\"" }, null);
  await db.query(`insert into public.audit_log(project_id, entity_type, action, new_value) values ($1, 'event', 'note', '{"n": 12345678901234567890.5}')`, [P1]);
  await db.exec(SQL);
  // After 0045: the trigger — in another session time zone, and several rows in one statement.
  await db.exec("set timezone = 'Asia/Tokyo'");
  await ins(P1, "event", "note", "tz@a.test", null, { t: "tokyo" });
  await db.query(`insert into public.audit_log(project_id, entity_type, action, actor, new_value)
    values ($1, 'event', 'multi 1', 'm', '{"i": 1}'), ($2, 'event', 'multi 2', 'm', '{"i": 2}'), ($1, 'event', 'multi 3', 'm', '{"i": 3}')`, [P1, P2]);
  await ins(null, "ledger_anchor", "anchor:timestamped", "sentinel", null, { scope: "global" });
  await db.exec("set timezone = 'UTC'");
});

describe("migration 0045 — the project chain", () => {
  it("carries the rows written before it, then chains new ones, per project (one writer at a time: in id order)", async () => {
    const a = await chain(P1), b = await chain(P2);
    expect(a.map((r) => r.action)).toEqual(["state: wip → shared", "note", "note", "multi 1", "multi 3"]);
    expect(b.map((r) => r.action)).toEqual(["note", "multi 2"]);
    expect(a.map((r) => r.project_seq)).toEqual([1, 2, 3, 4, 5]);
    const ids = a.map((r) => r.audit_id); expect([...ids].sort((x, y) => x - y)).toEqual(ids);
    // the global chain is untouched: every row keeps its global hash; the row with no project is in no project chain
    expect((await db.query("select count(*)::int n from public.audit_project_chain")).rows[0].n).toBe(7);
    expect((await db.query("select count(*)::int n from public.audit_log where hash is null")).rows[0].n).toBe(0);
  });

  it("the auditor's file recomputes every hash the database made (the same text in SQL and in JS)", async () => {
    for (const pid of [P1, P2]) {
      const v = verifyChain(await chain(pid));
      expect(v.problems).toEqual([]);
      expect(v.ok).toBe(true);
    }
    const a = await chain(P1);
    expect(a[0].new_text).toBe('{"b": 1, "aa": [1.50, 2000, null], "state": "shared"}'); // jsonb's own text, not JSON.stringify's
    expect(a[1].new_text).toBe('{"n": 12345678901234567890.5}');
    expect(a[3].at_utc).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  });

  it("a changed row, a missing row or a moved null fails the check", async () => {
    const a = await chain(P1);
    expect(verifyChain(a.map((r, i) => i === 2 ? { ...r, actor: "x" } : r)).problems[0]).toMatch(/seq 3 .*not the hash of its text/);
    expect(verifyChain(a.filter((_, i) => i !== 2)).problems[0]).toMatch(/carries seq 4/);
    expect(a[1].actor).toBe(null);
    expect(verifyChain(a.map((r, i) => i === 1 ? { ...r, actor: "" } : r)).ok).toBe(false); // a null is not an empty text
  });

  it("is append-only, and nobody but the trigger writes it", async () => {
    for (const sql of ["update public.audit_project_chain set project_seq = 9", "delete from public.audit_project_chain", "truncate public.audit_project_chain"]) {
      await expect(db.exec(sql)).rejects.toThrow(/append-only/);
    }
    for (const sql of [`insert into public.audit_project_chain values (1, '${P1}', 99, '${"0".repeat(64)}')`, "select public.cde_project_chain_append(a) from public.audit_log a limit 1"]) {
      await db.exec("begin; set local role service_role");
      await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
      await db.exec("rollback");
    }
  });

  it("a member reads their own project's chain and texts, and no other; anon reads nothing", async () => {
    const seen = await as(db, user, async (tx) => (await tx.query("select distinct project_id from public.audit_project_chain_v")).rows.map((r) => r.project_id));
    expect(seen).toEqual([P1]);
    const anon = await as(db, null, (tx) => tx.query("select 1 from public.audit_project_chain").then(() => "read", (e) => e.message));
    expect(anon).toMatch(/permission denied/);
  });

  it("the probe passes on PGlite: part 1 every row true (9), part 2 'PROBE 0045: 8 of 8 as expected.' (rolled back)", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0045_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const part = (n) => probe.slice(probe.indexOf(`-- Part ${n} (after`), n === 1 ? probe.indexOf("-- Part 2 (after") : undefined);
    const rows = (await db.query(part(1))).rows;
    expect(rows.length).toBe(9);
    expect(rows.filter((r) => r.ok !== true).map((r) => r.what)).toEqual([]);
    await expect(db.exec(part(2))).rejects.toThrow("PROBE 0045: 8 of 8 as expected.");
    expect((await db.query("select count(*)::int n from public.projects where key = 'probe-0045'")).rows[0].n).toBe(0);
  });

  it("states its rollback and keeps the global chain's lock key", () => {
    expect(SQL).toContain("ROLLBACK (if needed)");
    expect(SQL).toContain("pg_advisory_xact_lock(4823710411641000001)");
    expect(SQL).toContain("lock table public.audit_log in share row exclusive mode");
    expect(SQL.trim().endsWith("commit;")).toBe(true);
  });
});
