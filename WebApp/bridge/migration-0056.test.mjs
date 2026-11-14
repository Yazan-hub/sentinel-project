// migration 0056 (R2d follow-up: an EIR's published version is labelled "Accepted C0n", a BEP's labels are unchanged): dry-run on PGlite.
// The probe drives one EIR and two BEP rounds end to end. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { buildDb } from "./pglite-harness.mjs";

let db;
beforeAll(async () => { db = await buildDb(); }, 60_000);

describe("0056 the probe passes on PGlite", () => {
  it("part 1 every row true, part 2 'PROBE 0056: 3 of 3 as expected.' (rolled back)", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0056_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const i = probe.search(/^-- Part 2$/m);
    const r1 = (await db.query(probe.slice(probe.search(/^-- Part 1$/m), i))).rows;
    expect(r1.filter((r) => r.ok !== true).map((r) => r.what)).toEqual([]);
    expect(r1.length).toBe(2);
    await expect(db.exec(probe.slice(i))).rejects.toThrow("PROBE 0056: 3 of 3 as expected.");
  });
});

describe("0056 files are valid UTF-8", () => {
  for (const f of ["0056_eir_version_label.sql", "probes/0056_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
