// The G1–G4 sequence with every side effect stubbed: what runs, what does not, and in which order.
import { describe, it, expect } from "vitest";
import { runIntake, validateIntakeInput } from "./intake-logic.mjs";

const bytes = Buffer.from("ISO-10303-21;");
function stubs({ gatePass = true, verdict = "accepted", uploadFails = false } = {}) {
  const calls = [];
  const rec = (name, ret) => async (...a) => { calls.push([name, ...a]); return typeof ret === "function" ? ret(...a) : ret; };
  return {
    calls,
    loadContract: rec("loadContract", { contract_key: "bridge-default" }),
    checkDelivery: rec("checkDelivery", { passed: gatePass, contract_key: "bridge-default", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
    extractElements: rec("extractElements", { elements: [{ identity: { Class: "IFCDOOR", GlobalId: "g1" }, psets: [], quantities: [] }], schema: "IFC4", counts: { elements: 1, skipped: 0, by_class: { IFCDOOR: 1 } } }),
    adjudicate: rec("adjudicate", { verdict, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1 }, failures: verdict === "rejected" ? [{ element: "g1", requirement: "FireRating" }] : [], naming: { ok: true }, warned: false, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", audit_id: 901, receipt: { ledger_hash: "h" } }),
    raiseBcf: rec("raiseBcf", { raised: 1 }),
    uploadIfc: uploadFails ? rec("uploadIfc", () => { throw new Error("platform 401"); }) : rec("uploadIfc", { format: "frag", name: "x.frag", itemId: "item-1", bytes: 9 }),
    registerFileVersion: rec("registerFileVersion", { container_id: "c-1", iso_name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", version: { id: "v-1", revision: "P01", platform_item_id: "item-1", is_live: true } }),
    recordVersionVerdict: rec("recordVersionVerdict", undefined),
    audit: rec("audit", undefined),
  };
}
const input = { key: "aster-tower", name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", bytes, source: "astra", actor: "agent:astra", revision: "P01" };
const names = (d) => d.calls.map((c) => c[0]);

describe("runIntake", () => {
  it("stops at the delivery gate: audit row, no adjudication, no version", async () => {
    const d = stubs({ gatePass: false });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", published: false, sha256: "ab".repeat(32) });
    expect(r.gate.failures).toHaveLength(1);
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe("IFC delivery gate FAIL: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
  });
  it("rejected by the IDS: gate PASS audited, BCF raised, no version", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "ids", published: false, ids_source: "project", ids_ref: "ids@1" });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf"]);
    const adjBody = d.calls.find((c) => c[0] === "adjudicate")[2];
    expect(adjBody).toMatchObject({ source: "astra", actor: "agent:astra", container_name: input.name });
    expect(adjBody.elements).toHaveLength(1);
  });
  it("raise_bcf:false skips the BCF step on a rejection", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, { ...input, raise_bcf: false });
    expect(r.bcf).toBeUndefined();
    expect(names(d)).not.toContain("raiseBcf");
  });
  it("accepted: upload, register with sha and size, stamp the version verdict", async () => {
    const d = stubs();
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true });
    expect(r.version).toMatchObject({ container_id: "c-1", version_id: "v-1", revision: "P01", platform_item_id: "item-1", format: "frag" });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "uploadIfc", "registerFileVersion", "recordVersionVerdict"]);
    const reg = d.calls.find((c) => c[0] === "registerFileVersion")[2];
    expect(reg).toMatchObject({ name: input.name, revision: "P01", sha256: "ab".repeat(32), size_bytes: 13, platform_item_id: "item-1", author: "agent:astra" });
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict").slice(1, 3)).toEqual(["aster-tower", "v-1"]);
  });
  it("recorded (no IDS anywhere) publishes on the gate pass alone and says so", async () => {
    const d = stubs({ verdict: "recorded" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "none" });
    expect(r.note).toBe("No project IDS installed — published on the delivery-gate pass alone.");
  });
  it("an upload failure after acceptance keeps the verdict and reports the failure honestly", async () => {
    const d = stubs({ uploadFails: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "upload_failed", published: false });
    expect(r.error).toMatch(/platform 401/);
    expect(names(d)).not.toContain("registerFileVersion");
  });
});

describe("validateIntakeInput", () => {
  it("requires a project key, an .ifc name, bytes and a source", () => {
    expect(() => validateIntakeInput({ ...input, name: "model.rvt" })).toThrow(/\.ifc/);
    expect(() => validateIntakeInput({ ...input, source: "" })).toThrow(/source/);
    expect(() => validateIntakeInput({ ...input, bytes: Buffer.alloc(0) })).toThrow(/Empty/);
    expect(validateIntakeInput(input)).toMatchObject({ revision: "P01", actor: "agent:astra" });
    expect(validateIntakeInput({ ...input, actor: undefined, revision: undefined })).toMatchObject({ actor: "astra", revision: undefined });
  });
});
