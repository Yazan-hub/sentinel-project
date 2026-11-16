// migration 0058 (task_teams.owns_no_container): dry-run on PGlite. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { buildDb } from "./pglite-harness.mjs";

let db;
beforeAll(async () => { db = await buildDb(); }, 60_000);

describe("0058 owns_no_container", () => {
  it("a team defaults to false and the mark can be set", async () => {
    const p = (await db.query("insert into public.projects(key, name) values ('p58', 'P') returning id")).rows[0].id;
    await db.query("insert into public.task_teams(project_id, code) values ($1, 'ARC')", [p]);
    await db.query("insert into public.task_teams(project_id, code, owns_no_container) values ($1, 'INT', true)", [p]);
    const r = (await db.query("select code, owns_no_container from public.task_teams where project_id = $1 order by code", [p])).rows;
    expect(r).toEqual([{ code: "ARC", owns_no_container: false }, { code: "INT", owns_no_container: true }]);
  });
  it("the probe passes", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0058_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const rows = (await db.query(probe.slice(probe.search(/^-- Part 1$/m)))).rows;
    expect(rows.filter((r) => r.ok !== true)).toEqual([]);
    expect(rows.length).toBe(1);
  });
  it("files are valid UTF-8", () => {
    for (const f of ["0058_owns_no_container.sql", "probes/0058_probe.sql"])
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
  });
});
