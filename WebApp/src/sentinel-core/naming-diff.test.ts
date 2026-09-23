import { describe, it, expect } from "vitest";
import { diffNaming, findNamingCandidate } from "./naming-diff";
import type { NamingRuleset } from "./naming";

const inForce: NamingRuleset = {
  title: "Office naming", separator: "-", enforce: "reject",
  fields: [
    { key: "project", label: "Project", pattern: "[A-Z0-9]{3,6}" },
    { key: "originator", label: "Originator", enum: ["ORG", "STR"] },
    { key: "number", label: "Number", pattern: "\\d{4}" },
  ],
};

describe("diffNaming", () => {
  it("with nothing in force, every candidate field is added", () => {
    expect(diffNaming(null, inForce)).toEqual({
      added: [{ key: "project", label: "Project" }, { key: "originator", label: "Originator" }, { key: "number", label: "Number" }],
      removed: [], changed: [], header: [],
    });
  });
  it("names added, removed and changed pattern/enum fields by key", () => {
    const cand: NamingRuleset = { ...inForce, fields: [
      { key: "project", label: "Project", pattern: "[A-Z0-9]{4}" },
      { key: "originator", label: "Originator", enum: ["ORG", "MEP"] },
      { key: "role", label: "Role", enum: ["A", "S"] },
    ] };
    const d = diffNaming(inForce, cand);
    expect(d.added).toEqual([{ key: "role", label: "Role" }]);
    expect(d.removed).toEqual([{ key: "number", label: "Number" }]);
    expect(d.changed).toEqual([
      { key: "project", label: "Project", changes: ["pattern [A-Z0-9]{3,6} → [A-Z0-9]{4}"] },
      { key: "originator", label: "Originator", changes: ["enum +MEP -STR"] },
    ]);
    expect(d.header).toEqual([]);
  });
  it("reports separator, enforce and position changes — they re-shape every name", () => {
    const moved = diffNaming(inForce, { ...inForce, separator: "_", enforce: "warn", fields: [inForce.fields[1], inForce.fields[0], inForce.fields[2]] });
    expect(moved.header).toEqual(["separator '-' → '_'", "enforce reject → warn"]);
    expect(moved.changed.map((c) => c.changes)).toEqual([["position 2 → 1"], ["position 1 → 2"]]);
  });
  it("an identical candidate has an empty diff", () => {
    expect(diffNaming(inForce, inForce)).toEqual({ added: [], removed: [], changed: [], header: [] });
  });
});

describe("findNamingCandidate", () => {
  it("takes the first json block shaped like a naming ruleset, skipping prose, bad JSON and other objects", () => {
    const sections = [
      { id: "s1", heading: "1. Introduction", body: "Prose only." },
      { id: "s5", heading: "5. Codes", body: "```json\n{ not json }\n```\n```json\n{\"codes\": [\"A\"]}\n```" },
      { id: "s6", heading: "6. Container naming and standards", body: "Names follow:\n```json\n" + JSON.stringify({ ...inForce, standard_key: "office-naming", semver: "1.0.0" }) + "\n```\nEnd." },
    ];
    const c = findNamingCandidate(sections);
    expect(c?.section_id).toBe("s6");
    expect(c?.heading).toBe("6. Container naming and standards");
    expect(c?.ruleset.standard_key).toBe("office-naming");
    expect(findNamingCandidate(sections.slice(0, 2))).toBeNull();
  });
});
