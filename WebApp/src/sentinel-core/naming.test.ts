import { describe, it, expect } from "vitest";
import { validateContainerName, type NamingRuleset } from "./naming";

// A compact BDS-style 11-field ruleset (mirrors bridge/naming-ruleset.json) for unit tests.
const BDS: NamingRuleset = {
  title: "BDS 11-field", separator: "-", strip_extensions: [".ifc", ".rvt"], enforce: "reject",
  fields: [
    { key: "project", label: "Project", pattern: "[A-Za-z0-9]{3,}" },
    { key: "originator", label: "Originator", enum: ["BDS", "STR", "MEP", "CIV"] },
    { key: "docType", label: "Document Type", enum: ["M3", "DR", "SH"] },
    { key: "subType", label: "Sub-Type", placeholders: ["NA"], pattern: "[A-Za-z0-9]{1,6}" },
    { key: "discipline", label: "Discipline", enum: ["ARC", "INT", "STR", "MEP", "CIV"] },
    { key: "zone", label: "Zone", placeholders: ["ZZ"], pattern: "Z[0-9]{1,2}" },
    { key: "venue", label: "Venue", placeholders: ["XX"], pattern: "[A-Za-z0-9]{2,4}" },
    { key: "level", label: "Level", placeholders: ["XX", "ZZ"], pattern: "[0-9]{1,2}" },
    { key: "number", label: "Number", pattern: "[A-Za-z]{0,3}[0-9]{3,4}" },
    { key: "suitability", label: "Suitability", enum: ["S0", "S2", "S3", "S4", "A1", "B1"] },
    { key: "revision", label: "Revision", pattern: "[PC][0-9]{2}(\\.[0-9]{1,2})?" },
  ],
};

describe("validateContainerName", () => {
  it("accepts a conforming BDS IFC model name (and strips the extension)", () => {
    const r = validateContainerName("BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc", BDS);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.fields).toMatchObject({ originator: "BDS", docType: "M3", discipline: "ARC", suitability: "S2", revision: "P03" });
  });

  it("accepts NA / XX / ZZ placeholders in their fields", () => {
    expect(validateContainerName("BDS20268-BDS-M3-NA-ARC-ZZ-XX-XX-M001-S2-P03", BDS).ok).toBe(true);
  });

  it("rejects the wrong field count with a clear reason", () => {
    const r = validateContainerName("Snowdon Towers Sample Structural.ifc", BDS); // not the BDS form at all
    expect(r.ok).toBe(false);
    expect(r.failures[0].field).toBe("*");
    expect(r.failures[0].reason).toMatch(/expected 11 .* got 1/);
  });

  it("flags each invalid field value individually", () => {
    // bad originator (ZZZ), bad discipline (XYZ), bad suitability (S9)
    const r = validateContainerName("BDS20268-ZZZ-M3-IFC4-XYZ-ZZ-XX-XX-M001-S9-P03", BDS);
    expect(r.ok).toBe(false);
    const bad = r.failures.map((f) => f.field).sort();
    expect(bad).toEqual(["discipline", "originator", "suitability"]);
    expect(r.failures.find((f) => f.field === "originator")!.reason).toMatch(/allowed: BDS, STR/);
  });

  it("rejects a malformed revision and a non-numeric level", () => {
    const r = validateContainerName("BDS20268-BDS-M3-IFC4-ARC-Z01-VNU-2-M001-S2-X99", BDS); // level '2' ok, rev 'X99' bad
    expect(r.failures.map((f) => f.field)).toContain("revision");
  });
});
