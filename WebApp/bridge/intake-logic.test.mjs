// The G1–G4 sequence with every side effect stubbed: what runs, what does not, and in which order.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { runIntake, runJudgeAgain, validateIntakeInput } from "./intake-logic.mjs";

const bytes = Buffer.from("ISO-10303-21;");
const contractSha = "cd".repeat(32);
const noneLabel = "none — not installed for aster-tower or its office";
function stubs({ gatePass = true, contract = "office", verdict = "accepted", uploadFails = false, warned = false, inScope = 1, namingRefused = false, failuresTotal, held = { id: 701, hash: "71".repeat(32) }, linkFails = false, regFails = false, repeat = null } = {}) {
  const calls = [];
  const rec = (name, ret) => async (...a) => { calls.push([name, ...a]); return typeof ret === "function" ? ret(...a) : ret; };
  const failures = (verdict === "rejected" || warned) ? [{ element: "g1", requirement: "FireRating" }] : [];
  const idsEnforce = verdict === "recorded" ? null : warned ? "warn" : "reject";
  // The referee's own answer (adjudicateProposal decides it once): an installed IDS with no element in scope is
  // "recorded", downgraded "nothing in scope" — intake no longer re-decides it.
  const downgraded = verdict === "accepted" && inScope === 0 ? "nothing in scope" : null;
  return {
    calls,
    // deps.loadContract is artefact-store resolveContract: project → office → none, with the label every surface prints.
    loadContract: rec("loadContract", contract === "none"
      ? { body: null, ref: null, source: null, sha256: null, label: noneLabel, reason: "not installed for aster-tower or its office" }
      : { body: { contract_key: "parity-ifc4" }, ref: "contract@1", source: contract, sha256: contractSha, label: `contract@1 · ${contract} · ${contractSha.slice(0, 12)}…`, reason: null }),
    checkDelivery: rec("checkDelivery", { result: gatePass ? "pass" : "fail", passed: gatePass, contract_key: "parity-ifc4", detected_schema: "IFC4", total_entities: 40, entity_counts: {}, failures: gatePass ? [] : ["IFCPROJECT: 0 found, contract requires ≥ 1."], warnings: [], sha256: "ab".repeat(32), size: 13 }),
    gateNotChecked: rec("gateNotChecked", (_bytes, reason) => ({ result: "not_checked", passed: null, reason, contract_key: null, detected_schema: "IFC4", total_entities: null, entity_counts: {}, failures: [], warnings: [], sha256: "ab".repeat(32), size: 13 })),
    extractElements: rec("extractElements", { elements: [{ identity: { Class: "IFCDOOR", GlobalId: "g1" }, psets: [], quantities: [] }], schema: "IFC4", counts: { elements: 1, skipped: 0, by_class: { IFCDOOR: 1 } } }),
    adjudicate: rec("adjudicate", { verdict: downgraded ? "recorded" : verdict, downgraded, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1, in_scope: verdict === "recorded" ? 0 : inScope }, failures, failures_total: failuresTotal ?? failures.length, naming: namingRefused ? { ok: false, enforce: "reject", failures: [{ field: "*", reason: "expected 11 fields, got 1" }] } : { ok: true }, warned, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", ids_enforce: idsEnforce, audit_id: 901, receipt: { ledger_hash: "h" }, hold: verdict === "rejected" ? { id: 902, hash: "92".repeat(32) } : null }),
    raiseBcf: rec("raiseBcf", { raised: 1 }),
    uploadIfc: uploadFails ? rec("uploadIfc", () => { throw new Error("platform 401"); }) : rec("uploadIfc", { format: "frag", name: "x.frag", itemId: "item-1", bytes: 9 }),
    registerFileVersion: regFails
      ? rec("registerFileVersion", () => { throw Object.assign(new Error("a revision is registered once per file — a new upload takes a new revision; nothing was saved"), { status: 409 }); })
      : rec("registerFileVersion", { container_id: "c-1", iso_name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", version: { id: "v-1", revision: "P01", platform_item_id: repeat === "linked" ? "item-0" : null, is_live: true }, ...(repeat ? { repeat: true } : {}) }),
    recordVersionVerdict: rec("recordVersionVerdict", undefined),
    attachGeometry: linkFails ? rec("attachGeometry", () => { throw Object.assign(new Error("version v-1 already has geometry — a version's geometry is attached once"), { status: 409 }); }) : rec("attachGeometry", { linked: true }),
    // The wiring's audit adapter returns the stored row (phase 6a); writeHold the hold row, or null when nothing was held.
    audit: rec("audit", { id: 700, hash: "70".repeat(32) }),
    writeHold: rec("writeHold", held),
  };
}
const input = { key: "aster-tower", name: "ASTR26-AST-ZZ-XX-M3-A-0001.ifc", bytes, source: "astra", actor: "agent:astra", revision: "P01" };
const names = (d) => d.calls.map((c) => c[0]);

describe("runIntake", () => {
  it("stops at the delivery gate: audit row, the refusal held, no adjudication, no version", async () => {
    const d = stubs({ gatePass: false });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", published: false, sha256: "ab".repeat(32), hold: { id: 701, hash: "71".repeat(32) } });
    expect(r.gate.failures).toHaveLength(1);
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "writeHold"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe("IFC delivery gate FAIL: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(d.calls.find((c) => c[0] === "writeHold").slice(1)).toEqual(["aster-tower", {
      stage: "gate", container_name: input.name, sha256: "ab".repeat(32), size_bytes: 13, verdict: "rejected", failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."],
      source: "intake", gate_row_id: 700, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, actor: "agent:astra",
    }]);
  });
  it("a web upload's gate FAIL is held as web; a caller who could not register it holds nothing (hold null)", async () => {
    const d = stubs({ gatePass: false });
    await runIntake(d, { ...input, source: "web" });
    expect(d.calls.find((c) => c[0] === "writeHold")[2]).toMatchObject({ source: "web" });
    const r = await runIntake(stubs({ gatePass: false, held: null }), input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", hold: null });
    const noRow = await runIntake(stubs({ gatePass: false, held: {} }), input);
    expect(noRow.hold).toEqual({ id: null, hash: null });
  });
  it("rejected by the IDS: gate PASS audited, BCF raised, no version; the referee gets intake's own argument, its hold and its failures_total (the count before its cut at 200) are the reply's", async () => {
    const d = stubs({ verdict: "rejected", failuresTotal: 250 });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "ids", published: false, ids_source: "project", ids_ref: "ids@1", hold: { id: 902, hash: "92".repeat(32) }, failures_total: 250 });
    expect(r.failures).toHaveLength(1);
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf"]);
    const [, , adjBody, adjOpts] = d.calls.find((c) => c[0] === "adjudicate");
    expect(adjBody).toMatchObject({ source: "astra", actor: "agent:astra", container_name: input.name });
    expect(adjBody).not.toHaveProperty("intake");
    expect(adjBody.elements).toHaveLength(1);
    expect(adjOpts).toEqual({ intake: { source: "astra", sha256: "ab".repeat(32), size_bytes: 13, gate_row_id: 700 } });
  });
  it("rejected by the naming judge: stage naming", async () => {
    const r = await runIntake(stubs({ verdict: "rejected", namingRefused: true }), input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "naming", hold: { id: 902 } });
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
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, hold: null });
    expect(r.version).toMatchObject({ container_id: "c-1", version_id: "v-1", revision: "P01", platform_item_id: "item-1", format: "frag" });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "registerFileVersion", "recordVersionVerdict", "uploadIfc", "attachGeometry"]);
    const reg = d.calls.find((c) => c[0] === "registerFileVersion")[2];
    expect(reg).toMatchObject({ name: input.name, revision: "P01", sha256: "ab".repeat(32), size_bytes: 13, author: "agent:astra", attach_geometry: false });
    expect(reg).not.toHaveProperty("platform_item_id");
    // SEC-4: the bridge's own upload, linked by the gate's sha256 of the same bytes, after the verdict is stamped.
    expect(d.calls.find((c) => c[0] === "attachGeometry").slice(1)).toEqual(["aster-tower", "v-1", "item-1", { sha256: "ab".repeat(32), actor: "agent:astra" }]);
  });
  it("SEC-5: the link records the .frag's sha256 and the IFC's item that the upload answered", async () => {
    const d = stubs();
    d.uploadIfc = async (...a) => { d.calls.push(["uploadIfc", ...a]); return { format: "frag", name: "x.frag", itemId: "item-1", bytes: 9, frag_sha256: "f".repeat(64), ifcItemId: "item-2" }; };
    await runIntake(d, input);
    expect(d.calls.find((c) => c[0] === "attachGeometry").slice(1)).toEqual(["aster-tower", "v-1", "item-1", { sha256: "ab".repeat(32), actor: "agent:astra", frag_sha256: "f".repeat(64), ifc_item_id: "item-2" }]);
  });
  it("SEC-5 (review C1): a raw-IFC upload links the IFC as its own item — ifc_item_id is the item", async () => {
    const d = stubs();
    d.uploadIfc = async (...a) => { d.calls.push(["uploadIfc", ...a]); return { format: "ifc", name: "x.ifc", itemId: "item-1", ifcItemId: "item-1", bytes: 9 }; };
    await runIntake(d, input);
    expect(d.calls.find((c) => c[0] === "attachGeometry").slice(1)).toEqual(["aster-tower", "v-1", "item-1", { sha256: "ab".repeat(32), actor: "agent:astra", ifc_item_id: "item-1" }]);
  });
  it("SEC-7: the link records the platform version tag the upload went under, when the upload answers one", async () => {
    const d = stubs();
    d.uploadIfc = async (...a) => { d.calls.push(["uploadIfc", ...a]); return { format: "frag", name: "x.frag", itemId: "item-1", bytes: 9, frag_sha256: "f".repeat(64), ifcItemId: "item-2", version_tag: "P01" }; };
    await runIntake(d, input);
    expect(d.calls.find((c) => c[0] === "attachGeometry").slice(1)).toEqual(["aster-tower", "v-1", "item-1", { sha256: "ab".repeat(32), actor: "agent:astra", frag_sha256: "f".repeat(64), ifc_item_id: "item-2", version_tag: "P01" }]);
  });
  it("a link the bridge could not make leaves the version registered and says so", async () => {
    const d = stubs({ linkFails: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true });
    expect(r.version).toMatchObject({ version_id: "v-1", platform_item_id: null, geometry: "not linked — version v-1 already has geometry — a version's geometry is attached once" });
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict").slice(1, 3)).toEqual(["aster-tower", "v-1"]);
  });
  it("accepted with warnings (ids enforce:warn): still raises BCF for the tracked failures, reports warned + ids_enforce", async () => {
    const d = stubs({ warned: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, warned: true, ids_enforce: "warn" });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf", "registerFileVersion", "recordVersionVerdict", "uploadIfc", "attachGeometry"]);
  });
  it("recorded (no IDS anywhere) publishes on the gate pass alone and says so", async () => {
    const d = stubs({ verdict: "recorded" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "none" });
    expect(r.note).toBe("No project IDS installed — published on the delivery-gate pass alone.");
  });
  it("an installed IDS with no element in scope: the referee's recorded is published and stamped as recorded, never accepted", async () => {
    const d = stubs({ inScope: 0 });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "recorded", stage: "published", published: true, ids_source: "project", ids_ref: "ids@1" });
    expect(r.note).toMatch(/no element was in its scope/);
    expect(names(d)).not.toContain("raiseBcf");
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict")[3]).toMatchObject({ verdict: "recorded", downgraded: "nothing in scope" });
  });
  it("an upload failure after acceptance keeps the verdict and the registered version, without geometry, and says so", async () => {
    const d = stubs({ uploadFails: true });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "upload_failed", published: false });
    expect(r.error).toMatch(/platform 401/);
    expect(r.version).toMatchObject({ version_id: "v-1", revision: "P01", platform_item_id: null, geometry: "not uploaded — platform 401" });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "registerFileVersion", "recordVersionVerdict", "uploadIfc"]);
  });
  it("SEC-4 (review C14): a registration the bridge refuses (a held revision, other bytes) uploads nothing to the platform", async () => {
    const d = stubs({ regFails: true });
    await expect(runIntake(d, input)).rejects.toMatchObject({ status: 409 });
    expect(names(d)).not.toContain("uploadIfc");
    expect(names(d)).not.toContain("attachGeometry");
  });
  it("SEC-4 (review C14): the same bytes again are answered with the version that holds them — uploaded only when it has no geometry yet", async () => {
    const linked = stubs({ repeat: "linked" });
    const r = await runIntake(linked, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true });
    expect(r.version).toMatchObject({ version_id: "v-1", revision: "P01", platform_item_id: "item-0" });
    expect(names(linked)).not.toContain("uploadIfc");
    const bare = stubs({ repeat: "bare" });
    expect((await runIntake(bare, input)).version).toMatchObject({ version_id: "v-1", platform_item_id: "item-1" });
    expect(bare.calls.find((c) => c[0] === "uploadIfc").slice(2)).toEqual([input.name, "P01"]);
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
    expect(names(d)).toEqual(["loadContract", "gateNotChecked", "audit", "extractElements", "adjudicate", "registerFileVersion", "recordVersionVerdict", "uploadIfc", "attachGeometry"]);
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

// SEC-8: judge-again — the judging half of intake on a version's own bytes, nothing registered, uploaded or linked.
describe("runJudgeAgain", () => {
  const SHA = createHash("sha256").update(bytes).digest("hex");
  const V = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const judging = (version, opts) => {
    const d = stubs(opts);
    d.loadVersion = async (...a) => { d.calls.push(["loadVersion", ...a]); return { id: V, revision: "P07", state: "wip", iso_name: input.name, sha256: SHA, link: null, ...version }; };
    d.download = async (...a) => { d.calls.push(["download", ...a]); return bytes; };
    d.recordVersionVerdict = async (...a) => { d.calls.push(["recordVersionVerdict", ...a]); return { id: 950 }; };
    return d;
  };
  const ask = { key: "aster-tower", versionId: V, actor: "lead@example.test" };

  it("no body: the IFC the link names, downloaded at the tag the link recorded, hashed, judged and stamped on the version with the lead as actor", async () => {
    const d = judging({ link: { platform_item_id: "item-frag", ifc_item_id: "item-ifc", version_tag: "P07" } });
    const r = await runJudgeAgain(d, { ...ask, bytes: Buffer.alloc(0) });
    expect(names(d)).toEqual(["loadVersion", "download", "loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "recordVersionVerdict"]);
    expect(d.calls.find((c) => c[0] === "download").slice(1)).toEqual(["item-ifc", "P07"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe(`IFC delivery gate PASS: ${input.name} (judged again)`);
    expect(d.calls.find((c) => c[0] === "audit")[4]).toMatchObject({ file: input.name, source: "judge-again", version_id: V, result: "pass" });
    const asked = d.calls.find((c) => c[0] === "adjudicate");
    expect(asked[2]).toMatchObject({ source: "judge-again", actor: "lead@example.test", container_name: input.name });
    expect(asked[2]).not.toHaveProperty("version_id"); // the stamp is this module's, below — one verdict row
    expect(asked).toHaveLength(3); // no intake opts: an existing version is never held
    const stamp = d.calls.find((c) => c[0] === "recordVersionVerdict");
    expect(stamp.slice(1, 3)).toEqual(["aster-tower", V]);
    expect(stamp[3]).toMatchObject({ verdict: "accepted" });
    expect(stamp[4]).toBe("lead@example.test");
    expect(r).toMatchObject({ verdict: "accepted", stage: "judged", from: "platform", version: { id: V, revision: "P07" }, audit_id: 901, verdict_audit_id: 950, gate_audit_id: 700 });
  });

  it("a link made before SEC-7 records no tag: the IFC item's own version is downloaded (the item holds one)", async () => {
    const d = judging({ link: { ifc_item_id: "item-ifc" } });
    await runJudgeAgain(d, { ...ask, bytes: null });
    expect(d.calls.find((c) => c[0] === "download").slice(1)).toEqual(["item-ifc", null]);
  });

  it("a body is the lead's re-upload: judged when its sha256 is the version's, nothing downloaded", async () => {
    const d = judging({ link: null });
    const r = await runJudgeAgain(d, { ...ask, bytes });
    expect(names(d)).not.toContain("download");
    expect(r).toMatchObject({ from: "upload", verdict: "accepted" });
  });

  it("a re-upload with other bytes is a 409 in words — nothing is judged", async () => {
    const d = judging({ sha256: "ab".repeat(32) });
    await expect(runJudgeAgain(d, { ...ask, bytes })).rejects.toMatchObject({ status: 409, message: `the uploaded file's sha256 is not the one version ${V} was registered with — nothing was judged` });
    expect(names(d)).toEqual(["loadVersion"]);
  });

  it("platform bytes that are not the version's are a 409 in words — nothing is judged", async () => {
    const d = judging({ sha256: "ab".repeat(32), link: { ifc_item_id: "item-ifc", version_tag: "P07" } });
    await expect(runJudgeAgain(d, { ...ask, bytes: null })).rejects.toMatchObject({ status: 409, message: `the IFC the platform served's sha256 is not the one version ${V} was registered with — nothing was judged` });
    expect(names(d)).toEqual(["loadVersion", "download"]);
  });

  it("a version registered without a sha256 cannot be judged again — said in words, before any byte is fetched", async () => {
    const d = judging({ sha256: null, link: { ifc_item_id: "item-ifc" } });
    await expect(runJudgeAgain(d, { ...ask, bytes })).rejects.toMatchObject({ status: 409, message: `version ${V} was registered without a sha256, so no bytes are bound to it and it cannot be judged again — a lead's reason moves it, as before; nothing was judged` });
    expect(names(d)).toEqual(["loadVersion"]);
  });

  it("no body and a link that names no IFC (a legacy version): the answer names the re-upload", async () => {
    const d = judging({ link: { platform_item_id: "item-frag" } });
    await expect(runJudgeAgain(d, { ...ask, bytes: null })).rejects.toMatchObject({ status: 409, message: `version ${V}'s geometry link names no IFC on the platform — POST the IFC as the request body (its sha256 must be the version's); nothing was judged` });
  });

  it("bytes that fail the contract in force: the stamp says rejected with the gate's failures, and no IDS runs", async () => {
    const d = judging({ link: null }, { gatePass: false });
    const r = await runJudgeAgain(d, { ...ask, bytes });
    expect(names(d)).toEqual(["loadVersion", "loadContract", "checkDelivery", "audit", "recordVersionVerdict"]);
    expect(d.calls.find((c) => c[0] === "recordVersionVerdict").slice(1)).toEqual(["aster-tower", V, { verdict: "rejected", summary: null, failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."] }, "lead@example.test"]);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", verdict_audit_id: 950 });
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
