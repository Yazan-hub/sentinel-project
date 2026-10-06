// Migration 0042 (SEC-5): one revision per file and one version per platform item, for every writer. Applied by the
// controller on the founder's "apply" — never by a test. This pins the text the probe and the bridge rely on, as
// migration-0041.test.mjs does.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0042_one_revision_per_file.sql");
const PROBE = read("../db/migrations/probes/0042_probe.sql");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("migration 0042 — one revision per file, one version per platform item (SEC-5)", () => {
  it("is not applied yet, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toContain("the 4100 bridge runs the branch");
    expect(SQL).toContain("probes/0042_probe.sql\n-- part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
    expect(code).not.toMatch(/\b(grant|drop|alter|create or replace)\b/i);
  });

  it("the two unique indexes, exactly — the revision one covers Deleted items (no WHERE)", () => {
    expect(code).toContain("create unique index container_versions_one_revision on public.container_versions (container_id, upper(btrim(revision)));");
    expect(code).toContain("create unique index container_versions_one_item on public.container_versions (platform_item_id) where platform_item_id is not null;");
    expect(code.match(/create /g)).toHaveLength(2);
  });

  it("the probe: part 0 read-only with the two preconditions first, part 1 the index text, part 2 eight cases that always roll back", () => {
    const part0 = PROBE.split("-- Part 1 (after the apply)")[0];
    expect(part0).toContain("-- Part 0 (before the apply)");
    expect(part0).not.toMatch(/\b(insert|update|delete|create|drop|alter)\b(?![^\n]*--)/i);
    expect(part0.indexOf("(file, revision) pairs held by more than one version")).toBeLessThan(part0.indexOf("platform items named by more than one version"));
    expect(part0).toContain('versions with more than one "geometry linked" row (expect 0 — the web reads the newest)'); // review C7
    expect(PROBE).toContain("indexdef like 'CREATE UNIQUE INDEX%(container_id, upper(btrim(revision)))' and indexdef not like '%WHERE%'");
    for (const k of ["U1", "U2", "U3", "U4", "S1", "I1", "I2", "I3"]) expect(PROBE).toContain(`  -- ${k} `);
    expect(PROBE).toContain("raise exception 'PROBE 0042: % of % as expected%.");
    expect(PROBE).toContain("contributor@example.test");
    expect(PROBE).not.toContain("probe.invalid");
  });

});
