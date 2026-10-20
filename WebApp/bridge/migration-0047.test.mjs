// Migration 0047 — the global ledger chain cannot fork under two concurrent writers. PGlite has one connection, so the race is
// replayed by its order: ids given explicitly, the higher id chained first (B), then the lower (A), then the next (C) — what two
// writers do when an id is drawn before the lock. Before 0047 that order forks (A and C share B as parent); after it, one line.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID as uuid } from "node:crypto";
import { buildDb } from "./pglite-harness.mjs";
import { verifyChain } from "./ledger-verify.mjs";

const SQL = readFileSync(new URL("../db/migrations/0047_chain_tip.sql", import.meta.url), "utf8");
const PROBE = readFileSync(new URL("../db/migrations/probes/0047_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
const ins = (db, id, action, pid = null) => db.query(
  `insert into public.audit_log(id, project_id, entity_type, action, actor) overriding system value values ($1, $2, 'event', $3, 'race') returning id, hash, prev_hash`,
  [id, pid, action]).then((r) => r.rows[0]);
const race = async (db, base, pid = null) => {
  const b = await ins(db, base + 1, "B", pid), a = await ins(db, base, "A", pid), c = await ins(db, base + 2, "C", pid);
  return { a, b, c };
};
const forks = async (db) => (await db.query("select count(*)::int n from (select prev_hash from public.audit_log where prev_hash is not null group by prev_hash having count(*) > 1) f")).rows[0].n;
const recompute = async (db) => (await db.query(`select count(*)::int n from public.audit_log a where a.hash is distinct from encode(extensions.digest(coalesce(a.prev_hash,'') || a.entity_type || coalesce(a.entity_id::text,'') || a.action || coalesce(a.actor,'') || coalesce(a.old_value::text,'') || coalesce(a.new_value::text,'') || coalesce(a.at::text,''), 'sha256'), 'hex')`)).rows[0].n;

describe("migration 0047 — one line, whatever order the ids were drawn in", () => {
  let before, after;
  beforeAll(async () => {
    before = await buildDb({ before: "0047" });
    after = await buildDb();
  });

  it("before 0047 the racing order forks the chain — and 0047 refuses to apply onto a forked chain", async () => {
    await before.query("insert into public.audit_log(entity_type, action) values ('event', 'first')");
    const { a, b, c } = await race(before, 1000);
    expect(a.prev_hash).toBe(b.hash);
    expect(c.prev_hash).toBe(b.hash); // the fork: A and C both claim B
    expect(await forks(before)).toBe(1);
    await expect(before.exec(SQL)).rejects.toThrow(/the ledger chain has 2 ends, not one/);
  });

  it("after 0047 the same order makes one line, the tip follows the lock, and every hash recomputes by the unchanged formula", async () => {
    await after.query("insert into public.audit_log(entity_type, action) values ('event', 'first')");
    const tip0 = (await after.query("select hash from public.audit_chain_tip")).rows[0].hash;
    const { a, b, c } = await race(after, 1000);
    expect(b.prev_hash).toBe(tip0);
    expect(a.prev_hash).toBe(b.hash);
    expect(c.prev_hash).toBe(a.hash);
    expect((await after.query("select audit_id from public.audit_chain_tip")).rows[0].audit_id).toBe(c.id);
    expect(await forks(after)).toBe(0);
    expect(await recompute(after)).toBe(0);
    // a statement that fails after the trigger leaves the tip where it was
    await expect(after.query("insert into public.audit_log(id, entity_type, action) overriding system value values (1000, 'event', 'dup id')")).rejects.toThrow();
    expect((await after.query("select audit_id from public.audit_chain_tip")).rows[0].audit_id).toBe(c.id);
  });

  it("the project chain (0045) is untouched by the racing order", async () => {
    const P = uuid();
    await after.query("insert into public.projects(id, key, name) values ($1, 'race-p', 'Race')", [P]);
    await race(after, 2000, P);
    const rows = (await after.query("select * from public.audit_project_chain_v where project_id = $1 order by project_seq", [P])).rows
      .map((r) => ({ ...r, project_seq: Number(r.project_seq), audit_id: Number(r.audit_id) }));
    expect(rows.map((r) => r.action)).toEqual(["B", "A", "C"]); // seq follows the lock, not the id
    expect(verifyChain(rows).ok).toBe(true);
  });

  it("seeds the tip from a clean existing chain; only the trigger writes it", async () => {
    const db = await buildDb({ before: "0047" });
    for (const x of ["one", "two", "three"]) await db.query("insert into public.audit_log(entity_type, action) values ('event', $1)", [x]);
    await db.exec(SQL);
    const last = (await db.query("select id, hash from public.audit_log order by id desc limit 1")).rows[0];
    expect((await db.query("select audit_id, hash from public.audit_chain_tip")).rows[0]).toEqual({ audit_id: last.id, hash: last.hash });
    const next = (await db.query("insert into public.audit_log(entity_type, action) values ('event', 'four') returning prev_hash")).rows[0];
    expect(next.prev_hash).toBe(last.hash);
    for (const sql of ["update public.audit_chain_tip set hash = repeat('0', 64)", "delete from public.audit_chain_tip"]) {
      await db.exec("begin; set local role service_role");
      await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
      await db.exec("rollback");
    }
  });

  it("the probe passes on PGlite: part 1 every row true (6), part 2 'PROBE 0047: 5 of 5 as expected.' (rolled back)", async () => {
    const part = (n) => PROBE.slice(PROBE.indexOf(`-- Part ${n} (after`), n === 1 ? PROBE.indexOf("-- Part 2 (after") : undefined);
    const rows = (await after.query(part(1))).rows;
    expect(rows.length).toBe(6);
    expect(rows.filter((r) => r.ok !== true).map((r) => r.what)).toEqual([]);
    const n = (await after.query("select count(*)::int n from public.audit_log")).rows[0].n;
    await expect(after.exec(part(2))).rejects.toThrow("PROBE 0047: 5 of 5 as expected.");
    expect((await after.query("select count(*)::int n from public.audit_log")).rows[0].n).toBe(n);
  });
});
