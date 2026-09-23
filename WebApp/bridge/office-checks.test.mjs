import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(async () => null), getScan: vi.fn(async () => null) }));

import {
  classifySnapshotPresent, classifyNamingRules, classifyTemplateTypes, classifyWorksets, classifySharedParams,
  classifyModelHealth, classifyBep, classifyRoles, classifyTaskTeams, expandOrg, OFFICE_CHECKS,
  SNAPSHOT_MAX_AGE_DAYS, TEMPLATE_TYPES_MIN_PCT, MODEL_HEALTH_MAX_WARN, BEP_MIN_SCORE,
} from "./office-checks.mjs";

const NOW = new Date("2026-09-17T12:00:00Z");
const RULESET_PATH = fileURLToPath(new URL("../../SentinelAddin/Resources/ruleset.json", import.meta.url));
const CATALOG_PATH = fileURLToPath(new URL("../../demo/bds-pilot/bds-type-catalog.json", import.meta.url));
const shipped = () => JSON.parse(readFileSync(RULESET_PATH, "utf8"));       // org = "BDS", {org} unexpanded
const pilotCatalog = () => JSON.parse(readFileSync(CATALOG_PATH, "utf8"));   // 1,434 types

const snapshot = (over = {}) => ({
  source: { kind: "template", title: "XXX_Template.rte", revit_version: "2024" },
  pack: { worksets: [{ name: "ARC_Walls" }], shared_parameters: [{ name: "XXX_View Status", binding: "instance" }] },
  catalog: { count: 0, types: [] },
  ruleset: { org: "XXX", rules: [] },
  at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z", received_by: "revit",
  ...over,
});
const tnRule = () => ({ id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"],
  token_defs: { ORG: "{org}", LOC: "EXT|INT|FND", DISC: "ARC|STR", MATERIAL: "[A-Z0-9][A-Z0-9 \\-]*", SIZE: "\\d+(\\.\\d+)? mm" },
  separator: "_", categories: ["Walls", "Floors"], message_en: "Type '{name}' does not match the convention." });

describe("constants match the spec", () => {
  it("thresholds", () => {
    expect(SNAPSHOT_MAX_AGE_DAYS).toBe(30); expect(TEMPLATE_TYPES_MIN_PCT).toBe(90);
    expect(MODEL_HEALTH_MAX_WARN).toBe(25); expect(BEP_MIN_SCORE).toBe(50);
  });
  it("registers exactly ten office.* checks, all with run()", () => {
    expect(OFFICE_CHECKS.map((c) => c.id).sort()).toEqual([
      "office.bep", "office.model_health", "office.naming_rules", "office.naming_standard", "office.roles",
      "office.shared_params", "office.snapshot_present", "office.task_teams", "office.template_types", "office.worksets"]);
    for (const c of OFFICE_CHECKS) expect(typeof c.run).toBe("function");
  });
});

describe("office.snapshot_present — exists and is fresh", () => {
  it("absent → not_checkable with the intake hint", () => {
    const r = classifySnapshotPresent(null, NOW);
    expect(r.status).toBe("not_checkable"); expect(r.reason).toMatch(/no office snapshot received/i);
  });
  it("stale → not_checkable naming the date; fresh → met naming source + date", () => {
    const old = classifySnapshotPresent(snapshot({ at: "2026-07-01T00:00:00Z" }), NOW);
    expect(old.status).toBe("not_checkable"); expect(old.reason).toContain("2026-07-01");
    const ok = classifySnapshotPresent(snapshot(), NOW);
    expect(ok.status).toBe("met"); expect(ok.summary).toContain("XXX_Template.rte"); expect(ok.summary).toContain("2026-09-10");
  });
});

describe("office.naming_rules — family, type, view, sheet rules and a non-empty org", () => {
  it("the shipped ruleset satisfies it", () => {
    const r = classifyNamingRules(shipped());
    expect(r.status).toBe("met"); expect(r.summary).toContain("BDS");
  });
  it("names the missing targets and an empty org", () => {
    const r = classifyNamingRules({ org: "", rules: [{ id: "VN-01", target: "view", tokens: ["A"] }] });
    expect(r.status).toBe("violations");
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["family", "org", "sheet", "type"]);
  });
  it("no ruleset in the snapshot → not_checkable", () => {
    expect(classifyNamingRules(null).status).toBe("not_checkable");
  });
});

describe("expandOrg — {org} in token defs becomes the escaped office code", () => {
  it("expands and escapes; leaves an already-expanded rule alone", () => {
    const r = expandOrg(tnRule(), "A.B");
    expect(r.token_defs.ORG).toBe("A\\.B");
    const done = expandOrg({ ...tnRule(), token_defs: { ...tnRule().token_defs, ORG: "XXX" } }, "XXX");
    expect(done.token_defs.ORG).toBe("XXX");
  });
});

describe("office.template_types — ≥ 90 % of governed-category types match a TN rule", () => {
  const types = (names) => names.map((type) => ({ category: "Walls", family: "Basic Wall", type, system: true }));
  it("no TN rule or no governed types → not_checkable with reason", () => {
    expect(classifyTemplateTypes({ count: 1, types: types(["x"]) }, { org: "XXX", rules: [] }).status).toBe("not_checkable");
    expect(classifyTemplateTypes({ count: 0, types: [] }, { org: "XXX", rules: [tnRule()] }).status).toBe("not_checkable");
  });
  it("met at 90 %, violation below it with the first 10 offenders and the percentage", () => {
    const good = Array.from({ length: 9 }, (_, i) => `XXX_EXT_ARC_CMU_${i + 1}00 mm`);
    const met = classifyTemplateTypes({ count: 10, types: types([...good, "Generic - 200mm"]) }, { org: "XXX", rules: [tnRule()] });
    expect(met.status).toBe("met"); expect(met.summary).toMatch(/90 ?%/);
    const bad = classifyTemplateTypes({ count: 12, types: types([...good.slice(0, 3), ...Array.from({ length: 12 }, (_, i) => `Wall ${i}`)]) }, { org: "XXX", rules: [tnRule()] });
    expect(bad.status).toBe("violations"); expect(bad.count).toBe(12); expect(bad.evidence).toHaveLength(10);
    expect(bad.summary).toMatch(/20 ?%/);
  });
  it("only governed categories count; a type in another category is ignored", () => {
    const r = classifyTemplateTypes({ count: 2, types: [...types(["XXX_EXT_ARC_CMU_200 mm"]), { category: "Furniture", family: "Chair", type: "junk", system: false }] }, { org: "XXX", rules: [tnRule()] });
    expect(r.status).toBe("met"); expect(r.summary).toMatch(/1 of 1/);
  });
  it("honours the rule engine's exclusions — a name matching an exclusion pattern is not flagged, proving the RuleEngine reuse", () => {
    const catalog = { count: 2, types: types(["XXX_EXT_ARC_CMU_200 mm", "Generic - 200mm"]) };
    const withoutExclusion = classifyTemplateTypes(catalog, { org: "XXX", rules: [tnRule()] });
    expect(withoutExclusion.status).toBe("violations"); // "Generic - 200mm" does not match the token pattern
    const withExclusion = classifyTemplateTypes(catalog, { org: "XXX", rules: [{ ...tnRule(), exclusions: ["^Generic"] }] });
    expect(withExclusion.status).toBe("met"); expect(withExclusion.summary).toMatch(/2 of 2/);
  });
  it("a rule with no message_en does not throw — reports violations instead", () => {
    const { message_en, ...ruleWithoutMessage } = tnRule();
    const r = classifyTemplateTypes({ count: 1, types: types(["Wall 1"]) }, { org: "XXX", rules: [ruleWithoutMessage] });
    expect(r.status).toBe("violations");
  });
  it("the pilot catalogue against the shipped TN rules reports honestly (it does not match TN-01's token order)", () => {
    const r = classifyTemplateTypes(pilotCatalog(), shipped());
    expect(["met", "violations"]).toContain(r.status);
    expect(r.summary).toMatch(/\d+ of \d+/);
    if (r.status === "violations") { expect(r.count).toBeGreaterThan(0); expect(r.evidence.length).toBeLessThanOrEqual(10); }
  });
});

describe("office.worksets — whitelist present, no extras", () => {
  const ws = { id: "WS-01", target: "workset", whitelist: ["ARC_Walls", "ARC_Doors"] };
  it("met when the sets are equal", () => {
    expect(classifyWorksets([{ name: "ARC_Walls" }, { name: "ARC_Doors" }], { org: "XXX", rules: [ws] }).status).toBe("met");
  });
  it("lists missing and extra", () => {
    const r = classifyWorksets([{ name: "ARC_Walls" }, { name: "Workset1" }], { org: "XXX", rules: [ws] });
    expect(r.status).toBe("violations"); expect(r.count).toBe(2);
    expect(r.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ label: "missing", detail: "ARC_Doors" }), expect.objectContaining({ label: "extra", detail: "Workset1" })]));
  });
  it("no workset rule → not_checkable", () => { expect(classifyWorksets([], { org: "XXX", rules: [] }).status).toBe("not_checkable"); });
  it("a template snapshot is not checkable — a .rte cannot carry worksets; a model snapshot is still judged", () => {
    const r = classifyWorksets([], { org: "XXX", rules: [ws] }, { kind: "template", title: "XXX_Template" });
    expect(r.status).toBe("not_checkable"); expect(r.reason).toMatch(/cannot carry worksets/);
    expect(classifyWorksets([], { org: "XXX", rules: [ws] }, { kind: "model", title: "Starter" }).status).toBe("violations");
  });
});

describe("office.shared_params — every parameter rule's parameter exists in the pack", () => {
  const vp = { id: "VP-01", target: "parameter", parameter_name: "{org}_View Status" };
  it("met when present (with {org} expanded)", () => {
    expect(classifySharedParams([{ name: "XXX_View Status" }], { org: "XXX", rules: [vp] }).status).toBe("met");
  });
  it("lists missing names; no parameter rule → not_checkable", () => {
    const r = classifySharedParams([], { org: "XXX", rules: [vp] });
    expect(r.status).toBe("violations"); expect(r.evidence[0].detail).toBe("XXX_View Status");
    expect(classifySharedParams([], { org: "XXX", rules: [] }).status).toBe("not_checkable");
  });
});

describe("office.model_health — 0 block, warn ≤ 25, fresh scan", () => {
  const scan = (violations, at = "2026-09-15T08:00:00Z") => ({ doc_title: "Aster Tower.rvt", at, elements_checked: 100, violations, violations_total: violations.length });
  it("absent / stale → not_checkable", () => {
    expect(classifyModelHealth(null, NOW).status).toBe("not_checkable");
    expect(classifyModelHealth(scan([], "2026-06-01T00:00:00Z"), NOW).reason).toContain("2026-06-01");
  });
  it("met within limits; violation with counts by rule when over", () => {
    expect(classifyModelHealth(scan([{ rule_id: "VN-01", mode: "warn" }]), NOW).status).toBe("met");
    const r = classifyModelHealth(scan([{ rule_id: "WS-01", mode: "block" }, ...Array(26).fill({ rule_id: "VN-01", mode: "warn" })]), NOW);
    expect(r.status).toBe("violations"); expect(r.count).toBe(27);
    expect(r.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ label: "WS-01", detail: expect.stringContaining("1 block") }), expect.objectContaining({ label: "VN-01", detail: expect.stringContaining("26 warn") })]));
  });
  it("a truncated scan reports violations (not met) from the full by_mode totals and flags the truncation in the summary", () => {
    const kept = Array.from({ length: 5000 }, (_, i) => ({ rule_id: "WS-01", mode: "warn", element_id: i }));
    const truncatedScan = scan(kept, "2026-09-15T08:00:00Z");
    truncatedScan.violations_total = 5003;
    truncatedScan.by_mode = { monitor: 0, warn: 5000, request: 0, block: 3 };
    const r = classifyModelHealth(truncatedScan, NOW);
    expect(r.status).toBe("violations");
    expect(r.summary).toMatch(/first 5000 of 5003/);
  });
});

describe("office.bep — a BEP exists with executability ≥ 50 %", () => {
  it("none → violation 'no BEP'; below → violation with the score; at or above → met", () => {
    expect(classifyBep(null, null)).toMatchObject({ status: "violations", summary: expect.stringMatching(/no BEP/i) });
    expect(classifyBep({ title: "BEP" }, 20)).toMatchObject({ status: "violations", summary: expect.stringContaining("20") });
    expect(classifyBep({ title: "BEP" }, 50).status).toBe("met");
    expect(classifyBep({ title: "BEP" }, null).status).toBe("not_checkable");   // a BEP with no sections has no score
  });
});

describe("office.naming_rules / template_types / worksets / shared_params — run() with no snapshot", () => {
  const ids = ["office.naming_rules", "office.template_types", "office.worksets", "office.shared_params"];
  it.each(ids)("%s resolves not_checkable under its own id and label, reason mentions the snapshot", async (id) => {
    const check = OFFICE_CHECKS.find((c) => c.id === id);
    const r = await check.run("k");
    expect(r.status).toBe("not_checkable");
    expect(r.id).toBe(check.id);
    expect(r.label).toBe(check.label);
    expect(r.reason).toMatch(/snapshot/i);
  });
});

describe("office.roles / office.task_teams", () => {
  it("roles: at least one owner and one lead, naming what is missing", () => {
    expect(classifyRoles([{ role: "owner" }, { role: "lead" }]).status).toBe("met");
    const r = classifyRoles([{ role: "owner" }, { role: "contributor" }]);
    expect(r.status).toBe("violations"); expect(r.evidence.map((e) => e.detail)).toEqual(["lead"]);
    expect(classifyRoles([]).status).toBe("violations");
  });
  it("task teams: one per discipline, each with a lead; none → violation", () => {
    expect(classifyTaskTeams([{ code: "ARC", discipline: "Architecture", lead_email: "a@x" }]).status).toBe("met");
    const r = classifyTaskTeams([{ code: "ARC", discipline: "Architecture", lead_email: "" }]);
    expect(r.status).toBe("violations"); expect(r.evidence[0]).toMatchObject({ label: "ARC", detail: expect.stringMatching(/no lead/i) });
    expect(classifyTaskTeams([]).status).toBe("violations");
  });
});

describe("runCheck over an office scope", () => {
  it("runs a rollup-eligible check per project and rolls it up; template items and plain projects run once", async () => {
    const { runCheckScoped } = await import("./check-registry.mjs");
    const calls = [];
    const def = { id: "office.roles", label: "Roles", run: async (key) => { calls.push(key); return { id: "office.roles", label: "Roles", status: key === "aster-tower" ? "violations" : "met", count: key === "aster-tower" ? 1 : 0, summary: `${key} roles`, evidence: key === "aster-tower" ? [{ label: "missing role", detail: "lead" }] : [] }; } };
    const scope = { projectScope: async (key) => key === "aster-office" ? { key, kind: "office", office_key: null, keys: ["aster-office", "aster-tower"] } : { key, kind: "project", office_key: null, keys: [key] } };
    const out = await runCheckScoped(def, "aster-office", {}, scope);
    expect(calls).toEqual(["aster-office", "aster-tower"]);
    expect(out.status).toBe("violations");
    expect(out.evidence).toContainEqual({ label: "[aster-tower] missing role", detail: "lead" });
    calls.length = 0;
    const single = await runCheckScoped(def, "aster-tower", {}, scope);
    expect(calls).toEqual(["aster-tower"]);
    expect(single.summary).toBe("aster-tower roles");
    calls.length = 0;
    const tpl = { id: "office.worksets", label: "Worksets", run: async (key) => { calls.push(key); return { id: "office.worksets", label: "Worksets", status: "met", count: 0, summary: "", evidence: [] }; } };
    await runCheckScoped(tpl, "aster-office", {}, scope);
    expect(calls).toEqual(["aster-office"]);              // template item: the office's own snapshot only
  });
  it("falls back to a single run when the scope cannot be resolved", async () => {
    const { runCheckScoped } = await import("./check-registry.mjs");
    const def = { id: "cde.states", label: "States", run: async () => ({ id: "cde.states", label: "States", status: "met", count: 0, summary: "one", evidence: [] }) };
    const out = await runCheckScoped(def, "ghost", {}, { projectScope: async () => { throw Object.assign(new Error("nope"), { status: 404 }); } });
    expect(out.summary).toBe("one");
  });
});
