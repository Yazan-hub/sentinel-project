import { describe, it, expect } from "vitest";
import { SNOWDON_6 as SNOWDON } from "./snowdon-fixture";
import { namingFromText } from "./naming-from-text";

describe("namingFromText", () => {
  it("reads Snowdon's pattern line and table into a naming block", () => {
    const n = namingFromText(SNOWDON)!;
    expect(n).toMatchObject({ separator: "_", enforce: "reject" });
    expect(n.fields.map((f) => [f.key, f.label, f.enum, f.pattern])).toEqual([
      ["project", "Project", ["SNW"], null], ["originator", "Originator", ["ARC", "STR", "MEP", "SIT"], null], ["volume", "Volume", ["ZZ"], null],
      ["level", "Level", ["XX"], null], ["type", "Type", ["M3"], null], ["role", "Role", ["A", "S", "M", "P", "E", "L"], null], ["number", "Number", [], "^[0-9]{4}$"]]);
  });
  it("prefers a json fence, mapped to block fields", () => {
    const md = 'Intro\n\n```json\n{"separator":"-","enforce":"warn","fields":[{"key":"project","label":"Project","enum":["SNW"]},{"key":"number","label":"Number","pattern":"^[0-9]{4}$"}]}\n```\n\n' + SNOWDON;
    expect(namingFromText(md)).toEqual({ separator: "-", enforce: "warn", fields: [
      { key: "project", label: "Project", pattern: null, enum: ["SNW"], placeholders: [], description: "" },
      { key: "number", label: "Number", pattern: "^[0-9]{4}$", enum: [], placeholders: [], description: "" }] });
  });
  it("is null when nothing qualifies", () => {
    expect(namingFromText("Just prose, and `code` with no parts.")).toBeNull();
    expect(namingFromText(42)).toBeNull();
  });
  it("a key with no table row keeps a plain label and no values", () => {
    expect(namingFromText("`AB-<zone>`")!.fields).toEqual([
      { key: "project", label: "Project", pattern: null, enum: ["AB"], placeholders: [], description: "" },
      { key: "zone", label: "Zone", pattern: null, enum: [], placeholders: [], description: "" }]);
  });
});
