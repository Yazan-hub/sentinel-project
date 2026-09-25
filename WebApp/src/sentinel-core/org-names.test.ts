// {org} expansion on the web must judge exactly as the add-in's OrgNames.Apply does (spec 2026-09-25 decision 10).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyOrg } from "./org-names";
import { RuleEngine } from "./rule-engine";
import type { Ruleset } from "./types";

// The Aster ruleset@1 shape (installed on aster-office): org "AST", {org} in doc refs, token defs, parameter
// names, messages and doc refs. Read fresh for every test so a mutation would show.
const aster = (): Ruleset => JSON.parse(readFileSync("../demo/aster/ruleset-AST.json", "utf8"));
const rule = (rs: Ruleset, id: string) => rs.rules.find((r) => r.id === id)!;

describe("applyOrg", () => {
  it("expands every {org} in the Aster ruleset@1 and removes nothing", () => {
    const { ruleset, removed } = applyOrg(aster());
    expect(removed).toEqual([]);
    expect(ruleset.rules.map((r) => r.id)).toEqual(aster().rules.map((r) => r.id));
    expect(ruleset.doc_refs).toEqual({ rtg: "AST-STD-001", bep: "AST-BEP-001" });
    expect(rule(ruleset, "SN-01").token_defs!.ORG).toBe("AST");
    expect(rule(ruleset, "VP-01").parameter_name).toBe("AST_View Status");
    expect(rule(ruleset, "WS-01").message_en).toBe("Workset '{name}' is not in the AST workset whitelist.");
    expect(rule(ruleset, "WS-01").message_ar).toContain("AST");
    expect(rule(ruleset, "WS-01").doc_ref).toBe("AST-STD-001 §4");
    expect(JSON.stringify(ruleset)).not.toContain("{org}");
  });
  it("returns a copy: the artefact body it was given is unchanged", () => {
    const body = aster();
    applyOrg(body);
    expect(body).toEqual(aster());
  });
  it("judges the Aster names the add-in accepts: a sheet AST-ARC-ZZ-01 passes SN-01 only after expansion", () => {
    const raw = rule(aster(), "SN-01");
    const expanded = rule(applyOrg(aster()).ruleset, "SN-01");
    expect(new RuleEngine().checkName(raw, 1, "AST-ARC-ZZ-01")).not.toBeNull();   // the literal "{org}" matched nothing
    expect(new RuleEngine().checkName(expanded, 1, "AST-ARC-ZZ-01")).toBeNull();
    expect(new RuleEngine().checkName(expanded, 1, "BDS-ARC-ZZ-01")).not.toBeNull();
  });
  it("regex-escapes the org in token defs only", () => {
    const { ruleset } = applyOrg({ ...aster(), org: "A.B" });
    expect(rule(ruleset, "SN-01").token_defs!.ORG).toBe("A\\.B");
    expect(rule(ruleset, "VP-01").parameter_name).toBe("A.B_View Status");
    expect(ruleset.doc_refs!.rtg).toBe("A.B-STD-001");
    expect(new RuleEngine().checkName(rule(ruleset, "SN-01"), 1, "AxB-ARC-ZZ-01")).not.toBeNull();
  });
  it("with no org, removes the rules and doc refs that need one and names the removed rule ids", () => {
    const rs: Ruleset = {
      standard_key: "k", semver: "1.0.0", org: "", doc_refs: { rtg: "{org}-STD-001", iso: "ISO 19650-2" },
      rules: [
        { id: "LV-01", target: "level", mode: "monitor", tokens: ["L"], token_defs: { L: "L\\d{2}" }, message_en: "Level '{name}'." },
        { id: "SN-01", target: "sheet", mode: "request", tokens: ["ORG"], token_defs: { ORG: "{org}" }, message_en: "Sheet '{name}'." },
        { id: "VP-01", target: "parameter", mode: "warn", parameter_name: "{org}_View Status", message_en: "View '{name}'." },
        { id: "WS-01", target: "workset", mode: "warn", whitelist: ["A"], message_en: "Workset '{name}'.", message_ar: "{org}" },
        { id: "GR-01", target: "grid", mode: "monitor", message_en: "Grid '{name}'.", doc_ref: "{org}-STD-001" },
      ],
    };
    const { ruleset, removed } = applyOrg(rs);
    expect(removed).toEqual(["SN-01", "VP-01", "WS-01", "GR-01"]);
    expect(ruleset.rules.map((r) => r.id)).toEqual(["LV-01"]);
    expect(ruleset.doc_refs).toEqual({ iso: "ISO 19650-2" });
    expect(rs.rules).toHaveLength(5);
  });
  it("a blank or missing org counts as none (OrgNames.Configured is IsNullOrWhiteSpace)", () => {
    const { org: _drop, ...noOrg } = aster();
    expect(applyOrg(noOrg as Ruleset).removed).toHaveLength(9);          // every Aster rule cites {org}-STD-001
    expect(applyOrg({ ...aster(), org: "  " }).ruleset.rules).toEqual([]);
  });
});
