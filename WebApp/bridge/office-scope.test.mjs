// The office as a scope: which keys an assessment reads, and how per-project results roll up honestly.
import { describe, it, expect } from "vitest";
import { officeKeyOf, listOfficeProjects, projectScope, rollupResults, ROLLUP_CHECK_IDS } from "./office-scope.mjs";

const rows = [
  { id: "u-office", key: "aster-office", name: "Aster Studio", kind: "office", office_key: null },
  { id: "u-tower", key: "aster-tower", name: "Aster Tower", kind: "project", office_key: "aster-office" },
  { id: "u-villa", key: "aster-villa", name: "Aster Villa", kind: "project", office_key: "aster-office" },
  { id: "u-demo", key: "demo", name: "Demo", kind: "project", office_key: null },
  { id: "u-old", key: "old-project", name: "Old" },                       // row from before the migration
];
const deps = { listProjectRows: async () => rows };
const r = (status, over = {}) => ({ id: "office.model_health", label: "Live model health", status, count: 0, summary: "", evidence: [], ...over });

describe("office scope helpers", () => {
  it("answers which office owns a key, null for an office, a project without one, or a pre-migration row", async () => {
    expect(await officeKeyOf("aster-tower", deps)).toBe("aster-office");
    expect(await officeKeyOf("aster-office", deps)).toBeNull();
    expect(await officeKeyOf("demo", deps)).toBeNull();
    expect(await officeKeyOf("old-project", deps)).toBeNull();
    expect(await officeKeyOf("nope", deps)).toBeNull();
  });
  it("lists an office's projects, refuses a project or an unknown key", async () => {
    expect(await listOfficeProjects("aster-office", deps)).toEqual([{ key: "aster-tower", name: "Aster Tower", id: "u-tower" }, { key: "aster-villa", name: "Aster Villa", id: "u-villa" }]);
    await expect(listOfficeProjects("aster-tower", deps)).rejects.toMatchObject({ status: 409 });
    await expect(listOfficeProjects("nope", deps)).rejects.toMatchObject({ status: 404 });
  });
  it("scopes an office to itself plus its children, a project to itself", async () => {
    expect(await projectScope("aster-office", deps)).toEqual({ key: "aster-office", kind: "office", office_key: null, keys: ["aster-office", "aster-tower", "aster-villa"] });
    expect(await projectScope("aster-tower", deps)).toEqual({ key: "aster-tower", kind: "project", office_key: "aster-office", keys: ["aster-tower"] });
    expect(await projectScope("old-project", deps)).toEqual({ key: "old-project", kind: "project", office_key: null, keys: ["old-project"] });
    await expect(projectScope("nope", deps)).rejects.toMatchObject({ status: 404 });
  });
  it("names the rollup-eligible checks and leaves the template items out", () => {
    for (const id of ["office.model_health", "office.bep", "office.roles", "office.task_teams", "office.naming_standard", "cde.states", "naming.containers", "ids.last_verdict"]) expect(ROLLUP_CHECK_IDS.has(id)).toBe(true);
    for (const id of ["office.snapshot", "office.naming_rules", "office.template_types", "office.worksets", "office.shared_params"]) expect(ROLLUP_CHECK_IDS.has(id)).toBe(false);
  });
});

describe("rollupResults", () => {
  it("is not checkable with no projects, naming the reason", () => {
    expect(rollupResults("office.model_health", "Live model health", [])).toMatchObject({ status: "not_checkable", reason: "no projects belong to this office", evidence: [] });
  });
  it("worst status wins and evidence is prefixed with the project key", () => {
    const out = rollupResults("office.model_health", "Live model health", [
      { key: "aster-office", result: r("not_checkable", { reason: "No scan report received" }) },
      { key: "aster-tower", result: r("violations", { count: 85, summary: "tower: 85 warn", evidence: [{ label: "VN-01", detail: "12 warn" }] }) },
      { key: "aster-villa", result: r("met", { summary: "villa: 3 warn" }) },
    ]);
    expect(out.status).toBe("violations");
    expect(out.count).toBe(85);
    expect(out.evidence).toContainEqual({ label: "[aster-tower] VN-01", detail: "12 warn" });
    expect(out.evidence).toContainEqual({ label: "[aster-office]", detail: "No scan report received" });
    expect(out.summary).toContain("aster-tower: violations — tower: 85 warn");
    expect(out.summary).toContain("aster-villa: met — villa: 3 warn");
  });
  it("is met only when every project with data is met, and says which had none", () => {
    const met = rollupResults("office.roles", "Roles", [{ key: "a", result: r("met", { summary: "ok" }) }, { key: "b", result: r("not_checkable", { reason: "no members" }) }]);
    expect(met.status).toBe("met");
    expect(met.evidence).toContainEqual({ label: "[b]", detail: "no members" });
    const none = rollupResults("office.roles", "Roles", [{ key: "a", result: r("not_checkable", { reason: "x" }) }, { key: "b", result: r("not_checkable", { reason: "y" }) }]);
    expect(none.status).toBe("not_checkable");
    expect(none.reason).toBe("a: x; b: y");
    const err = rollupResults("office.roles", "Roles", [{ key: "a", result: r("met") }, { key: "b", result: r("error", { summary: "Check failed: boom" }) }]);
    expect(err.status).toBe("error");
  });
});
