// The G1–G4 sequence with every side effect stubbed: what runs, what does not, and in which order.
import { describe, it, expect } from "vitest";
import { runIntake, validateIntakeInput } from "./intake-logic.mjs";

const bytes = Buffer.from("ISO-10303-21;");
const contractSha = "cd".repeat(32);
const noneLabel = "none — not installed for aster-tower or its office";
function stubs({ gatePass = true, contract = "office", verdict = "accepted", uploadFails = false, warned = false, inScope = 1 } = {}) {
  const calls = [];
  const rec = (name, ret) => async (...a) => { calls.push([name, ...a]); return typeof ret === "function" ? ret(...a) : ret; };
  const failures = (verdict === "rejected" || warned) ? [{ element: "g1", requirement: "FireRating" }] : [];
  const idsEnforce = verdict === "recorded" ? null : warned ? "warn" : "reject";
  return {
    calls,
    // deps.loadContract is artefact-store resolveContract: project → office → none, with the label every surface prints.
    loadContract: rec("loadContract", contract === "none"
      ? { body: null, ref: null, source: null, sha256: null, label: noneLabel, reason: "not installed for aster-tower or its office" }
      : { body: { contract_key: "parity-ifc4" }, ref: "contract@1", source: contract, sha256: contractSha, label: `contract@1 · ${contract} · ${contractSha.slice(0, 12)}…`, reason: null }),
    checkDelivery: rec("checkDelivery", { result: gatePass ? "pass" : "fail", passed: gatePass, contract_key: "parity-ifc4", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
    gateNotChecked: rec("gateNotChecked", (_bytes, reason) => ({ result: "not_checked", passed: null, reason, contract_key: null, detected_schema: "IFC4", total_entities: null, entity_counts: {}, failures: [], warnings: [], sha256: "ab".repeat(32), size: 13 })),
    extractElements: rec("extractElements", { elements: [{ identity: { Class: "IFCDOOR", GlobalId: "g1" }, psets: [], quantities: [] }], schema: "IFC4", counts: { elements: 1, skipped: 0, by_class: { IFCDOOR: 1 } } }),
    adjudicate: rec("adjudicate", { verdict, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1, in_scope: verdict === "recorded" ? 0 : inScope }, failures, naming: { ok: true }, warned, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", ids_enforce: idsEnforce, audit_id: 901, receipt: { ledger_hash: "h" } }),
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
    expect(reg).toMatchObject({ name: input.name, revision: "P01", sha256: "ab".repeat(32), size_bytes: 13, platform_item_id: "item-1", author: "agent:astra", attach_geometry: false });
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict").slice(1, 3)).toEqual(["aster-tower", "v-1"]);
  });
  it("accepted with warnings (ids enforce:warn): still raises BCF for the tracked failures, reports warned + ids_enforce", async () => {
    const d = stubs({ warned: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, warned: true, ids_enforce: "warn" });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf", "uploadIfc", "registerFileVersion", "recordVersionVerdict"]);
  });
  it("recorded (no IDS anywhere) publishes on the gate pass alone and says so", async () => {
    const d = stubs({ verdict: "recorded" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "none" });
    expect(r.note).toBe("No project IDS installed — published on the delivery-gate pass alone.");
  });
  it("an installed IDS with no element in scope publishes as recorded, not accepted", async () => {
    const d = stubs({ inScope: 0 });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "project", ids_ref: "ids@1" });
    expect(r.note).toMatch(/no element was in its scope/);
    expect(names(d)).not.toContain("raiseBcf");
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict")).toBeTruthy();
  });
  it("an upload failure after acceptance keeps the verdict and reports the failure honestly", async () => {
    const d = stubs({ uploadFails: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "upload_failed", published: false });
    expect(r.error).toMatch(/platform 401/);
    expect(names(d)).not.toContain("registerFileVersion");
  });
  it("an office contract judges: the gate, its audit row and the result name contract@1 · office · sha", async () => {
    const d = stubs();
    const r = await runIntake(d, input);
    expect(d.calls.find((c) => c[0] === "checkDelivery")[2]).toEqual({ contract_key: "parity-ifc4" });
    const [, , message, , row] = d.calls.find((c) => c[0] === "audit");
    expect(message).toBe("IFC delivery gate PASS: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(row).toEqual({ file: input.name, result: "pass", passed: true, contract: "parity-ifc4", contract_ref: "contract@1", contract_source: "office", contract_sha256: contractSha, schema: "IFC4", entities: 40, failures: 0, sha256: "ab".repeat(32), source: "astra" });
    expect(r.gate).toMatchObject({ result: "pass", contract_ref: "contract@1", contract_source: "office", contract_sha256: contractSha, contract_label: `contract@1 · office · ${contractSha.slice(0, 12)}…` });
    expect(r.note).toBeUndefined();
  });
  it("no contract for the project or its office: NOT CHECKED, never a pass — the IDS still judges and the note names the gate", async () => {
    const d = stubs({ contract: "none" });
    const r = await runIntake(d, input);
    expect(names(d)).toEqual(["loadContract", "gateNotChecked", "audit", "extractElements", "adjudicate", "uploadIfc", "registerFileVersion", "recordVersionVerdict"]);
    const [, , message, , row] = d.calls.find((c) => c[0] === "audit");
    expect(message).toBe("IFC delivery gate NOT CHECKED: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(row).toMatchObject({ result: "not_checked", passed: null, contract: null, contract_ref: null, contract_source: null, contract_sha256: null, entities: null, failures: 0, sha256: "ab".repeat(32) });
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, gate: { result: "not_checked", passed: null, reason: noneLabel, contract_ref: null, contract_label: noneLabel } });
    expect(r.note).toBe(`The IDS judged alone — the delivery gate was not checked (contract: ${noneLabel}).`);
    expect(d.calls.find((c) => c[0] === "registerFileVersion")[2]).toMatchObject({ sha256: "ab".repeat(32), size_bytes: 13 });
  });
  it("no contract and no IDS: recorded, and the note says nothing was judged", async () => {
    const r = await runIntake(stubs({ contract: "none", verdict: "recorded" }), input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", ids_source: "none", gate: { result: "not_checked" } });
    expect(r.note).toBe("No contract and no IDS installed for aster-tower or its office — nothing was judged.");
  });
  it("no contract and an IDS with nothing in scope: recorded, and the note says nothing was judged", async () => {
    const r = await runIntake(stubs({ contract: "none", inScope: 0 }), input);
    expect(r.verdict).toBe("recorded");
    expect(r.note).toBe(`IDS ids@1 is installed but no element was in its scope (1 read, 0 skipped) and the delivery gate was not checked (contract: ${noneLabel}) — nothing was judged.`);
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
