// The one-shot import of projects.metadata.active_ruleset: split, validate, skip with a reason — over an
// in-memory project list (the CLI supplies the real one from GET /projects).
import { describe, it, expect } from "vitest";
import { splitActiveRulesets } from "./artefact-split.mjs";

const rules = [{ id: "WS-01", target: "workset", mode: "warn", whitelist: ["ARC_Walls"], message_en: "Workset '{name}' is not in the {org} whitelist." }];
const fields = [{ key: "project", label: "Project", pattern: "[A-Z0-9]{3,}" }, { key: "role", label: "Role", enum: ["A", "S"] }];
const head = { standard_key: "ast-std-001", semver: "1.0.0" };
const rows = [
  { key: "aster-office", active_ruleset: { schema_version: 1, ...head, org: "AST", doc_refs: { rtg: "{org}-STD-001" }, rules,
    title: "Aster naming", separator: "-", strip_extensions: [".ifc"], enforce: "warn", fields, _note: "merged by hand" } },
  { key: "pilot", active_ruleset: { standard_key: "house", semver: "1.4.1", rules } },
  { key: "demo" },                                                                                   // nothing in the slot
  { key: "broken", active_ruleset: { ...head, semver: "1.0", rules } },
  { key: "half", active_ruleset: { ...head, rules, title: "Half", separator: "--", fields } },
  { key: "odd", active_ruleset: { ...head } },
  { key: "done", active_ruleset: { ...head, rules }, installed: { ruleset: { kind: "ruleset", version: 2 }, naming: null } },
  { key: "names-only", active_ruleset: { ...head, title: "Names", separator: "-", fields } },
];

describe("splitActiveRulesets", () => {
  const { installs, skipped } = splitActiveRulesets(rows);
  it("splits the merged slot into ruleset and naming, each keeping only its own fields", () => {
    expect(installs.map((i) => `${i.key}:${i.kind}`)).toEqual(["aster-office:ruleset", "aster-office:naming", "pilot:ruleset", "half:ruleset", "names-only:naming"]);
    expect(installs[0].body).toEqual({ ...head, org: "AST", doc_refs: { rtg: "{org}-STD-001" }, schema_version: 1, rules });
    expect(installs[1].body).toEqual({ ...head, title: "Aster naming", separator: "-", fields, enforce: "warn", strip_extensions: [".ifc"] });
  });
  it("defaults a naming pack without enforce to reject", () => {
    expect(installs.find((i) => i.key === "names-only").body.enforce).toBe("reject");
  });
  it("lists every row it will not install, with the reason, and says nothing about an empty slot", () => {
    expect(skipped).toEqual([
      { key: "broken", kind: "ruleset", reason: expect.stringContaining("semver") },
      { key: "half", kind: "naming", reason: expect.stringContaining("separator") },
      { key: "odd", kind: null, reason: "active_ruleset has neither rules[] nor fields[]" },
      { key: "done", kind: "ruleset", reason: "already installed on this project (ruleset@2); not overwritten" },
    ]);
  });
});
