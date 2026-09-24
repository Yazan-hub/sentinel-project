// Shared naming fixtures (spec 2026-09-25 §5): the TS validator's own outcomes over the Aster and pilot naming
// standards, written to fixtures/naming-cases.json so the add-in's C# port (ContainerNameJudge, checked by
// tools/naming-port-check) is held to exactly the same verdicts and reasons. Regenerated on every run; the
// file is committed, so a validator change shows up as a fixture diff.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { validateContainerName, type NamingRuleset } from "./naming";

const OUT = "src/sentinel-core/fixtures/naming-cases.json";
type Why = "pass" | "extension" | "placeholder" | "count" | "enum" | "pattern";
type Case = [name: string, ok: boolean, why: Why];

const ASTER: Case[] = [
  ["ASTR26-AST-ZZ-XX-M3-A-0001", true, "pass"],
  ["ASTR26-STR-Z1-02-DR-S-0042", true, "pass"],
  ["abc-MEP-Z12-00-SP-I-9999", true, "pass"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.ifc", true, "extension"],
  ["ASTR26-MEP-Z12-ZZ-SH-M-9999.IFC", true, "extension"],
  ["ASTR26-AST-ZZ-00-SP-I-0100.ifczip", true, "extension"],
  ["  ASTR26-AST-ZZ-XX-M3-A-0001.nwc  ", true, "extension"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.dwg", false, "extension"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001.rvt.ifc", false, "extension"],
  ["ASTR26-AST-ZZ-ZZ-M3-A-0001", true, "placeholder"],
  ["ASTR26-AST-XX-XX-M3-A-0001", false, "placeholder"],
  ["ASTR26-AST-ZZ-XX-M3-A", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001-P01", false, "count"],
  ["", false, "count"],
  ["Aster Tower Central.rvt", false, "count"],
  ["ASTR26_AST_ZZ_XX_M3_A_0001", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001-", false, "count"],
  ["ASTR26-BDS-ZZ-XX-M3-A-0001", false, "enum"],
  ["ASTR26-ast-ZZ-XX-M3-A-0001", false, "enum"],
  ["ASTR26-AST-ZZ-XX-M2-X-0001", false, "enum"],
  ["AS-AST-ZZ-XX-M3-A-0001", false, "pattern"],
  ["ASTR26-AST-ZZ-XX-M3-A-001", false, "pattern"],
  ["ASTR26-AST-Z123-XX-M3-A-0001", false, "pattern"],
  ["ASTR26-AST-ZZ-123-M3-A-0001", false, "pattern"],
  ["ASTR26-AST--XX-M3-A-0001", false, "pattern"],
  ["ÅSTR26-AST-ZZ-XX-M3-A-0001", false, "pattern"],
];

const PILOT: Case[] = [
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", true, "pass"],
  ["BDS20268-STR-DR-GA-STR-Z1-VEN1-01-0001-A1-C01", true, "pass"],
  ["BDS20268-MEP-M3-IFC4-MEP-Z2-XX-ZZ-ABC1234-S3-P03.1", true, "pass"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc", true, "extension"],
  ["BDS20268-BDS-FED-NA-ARC-ZZ-XX-XX-M001-S2-P01.NWD", true, "extension"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifczip", true, "extension"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.dwg", false, "extension"],
  ["BDS20268-BDS-M3-NA-ARC-ZZ-XX-XX-M001-S2-P03.rvt", true, "placeholder"],
  ["BDS20268-BDS-M3-NA-ARC-ZZ-XX-ZZ-M001-S2-P03", true, "placeholder"],
  ["BDS20268-BDS-M3-IFC4-ARC-NA-XX-XX-M001-S2-P03", false, "placeholder"],
  ["BDS20268-BDS-M3-ARC-ZZ-XX-XX-M001-S2-P03", false, "count"],
  ["Snowdon Towers Sample Structural.ifc", false, "count"],
  ["", false, "count"],
  ["PRJ1_ARC_ZZ_00_M3_A_0001.ifc", false, "count"],
  ["ASTR26-AST-ZZ-XX-M3-A-0001", false, "count"],
  ["BDS20268-XYZ-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M4-IFC4-ARC-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S5-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4-arc-ZZ-XX-XX-M001-S2-P03", false, "enum"],
  ["BDS20268-BDS-M3-IFC4567-ARC-ZZ-XX-XX-M001-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M01-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P3", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-Z100-XX-XX-M001-S2-P03", false, "pattern"],
  ["BDS20268-BDS-M3-IFC4-ARC-ZZ-X-XX-M001-S2-P03", false, "pattern"],
  ["BD-XYZ-M9-IFC4-ARC-ZZ-XX-XX-M001-S9-P3", false, "pattern"],
];

const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const STANDARDS = [
  { naming: load("../demo/aster/aster-naming-ruleset.json"), cases: ASTER },
  { naming: load("../demo/bds-pilot/bds-naming-ruleset.json"), cases: PILOT },
];

describe("shared naming fixtures", () => {
  const all = STANDARDS.flatMap(({ naming, cases }) => cases.map(([name, ok, why]) => {
    const r = validateContainerName(name, naming as NamingRuleset);
    return { why, expected: ok, fixture: { naming, name, ok: r.ok, failures: r.failures.map(({ field, reason }) => ({ field, reason })) } };
  }));

  it("the TS validator gives each case the verdict it was written for", () => {
    for (const c of all) expect([c.fixture.name, c.fixture.ok]).toEqual([c.fixture.name, c.expected]);
  });

  it("covers, per standard, at least 20 names across pass, extensions, placeholders, field count, enum and pattern", () => {
    for (const { naming, cases } of STANDARDS) {
      expect(cases.length).toBeGreaterThanOrEqual(20);
      const whys = new Set(cases.map((c) => c[2]));
      expect([...whys].sort()).toEqual(["count", "enum", "extension", "pass", "pattern", "placeholder"]);
      const mine = all.filter((c) => c.fixture.naming === naming).map((c) => c.fixture);
      expect(mine.some((f) => f.failures.some((x) => x.field === "*"))).toBe(true);
      expect(mine.some((f) => f.failures.some((x) => x.reason.includes("(allowed: ")))).toBe(true);
      expect(mine.some((f) => f.failures.some((x) => x.reason.includes("(must match /")))).toBe(true);
      expect(mine.some((f) => f.failures.length > 1)).toBe(true);
    }
    // The pilot's 14-value originator enum is cut at 12 with ", …" — the C# port must cut the same way.
    expect(all.some((c) => c.fixture.failures.some((x) => x.reason.endsWith(", …)")))).toBe(true);
  });

  it("writes fixtures/naming-cases.json as [{ naming, name, ok, failures: [{ field, reason }] }]", () => {
    const fixtures = all.map((c) => c.fixture);
    mkdirSync("src/sentinel-core/fixtures", { recursive: true });
    writeFileSync(OUT, JSON.stringify(fixtures, null, 2) + "\n");
    const back = load(OUT);
    expect(back).toEqual(fixtures);
    expect(back.length).toBe(ASTER.length + PILOT.length);
    expect(Object.keys(back[0]).sort()).toEqual(["failures", "name", "naming", "ok"]);
  });
});
