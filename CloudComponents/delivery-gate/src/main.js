// Sentinel Delivery Gate — a That Open cloud component (spec docs/superpowers/specs/2026-09-27-platform-delivery-gate-design.md).
// An automation (File Uploaded / File Updated, .ifc) starts it with fileId, versionTag and projectId; it judges the IFC
// version with the bridge's own gate (WebApp/bridge/delivery-gate.mjs, bundled — never a copy) against the contract
// Sentinel mirrored to the project (sentinel-contract.json), writes <name>.gate.json as a version of one report item
// per IFC, labels the IFC version (sentinel_*), and returns a verdict that never claims more than was written:
// SUCCESS only for a pass whose report and labels both landed; WARNING for a refusal, not_checked, or a pass with a
// refused write (the message says which); FAIL only when the gate itself did not run.
//
// Globals the execution engine injects (never import them): thatOpenServices, executionParams, executionContext,
// executionReporter.
/* global thatOpenServices, executionParams, executionContext, executionReporter */
import { createHash } from "node:crypto";
import { checkDelivery, gateNotChecked } from "../../../WebApp/bridge/delivery-gate.mjs";

export const CONTRACT_ITEM = "sentinel-contract.json";
export const REPORT_KIND = "sentinel.gate-report";
export const reportName = (ifcName) => `${ifcName}.gate.json`;
// The contract's own fingerprint on the report, so a report says which contract text judged it.
const sha = (text) => createHash("sha256").update(text).digest("hex");
const NO_CONTRACT = "no contract on the platform project — install one in Sentinel";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const fail = (message) => ({ type: "FAIL", message: `Gate did not run — ${message}` });
const words = (e) => String(e?.message || e);
const report = (m) => { try { executionReporter.message(m); } catch { /* the reporter is best effort */ } };

/** The shape check a contract must pass before the gate reads it (the full validator lives in the bridge's
 *  artefact-store; here a wrong shape is a not_checked reason, never a crash inside checkDelivery). */
export function contractShapeError(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "is not a JSON object";
  if (typeof c.contract_key !== "string" || !c.contract_key.trim()) return "has no contract_key";
  if (typeof c.ifc_schema !== "string") return "has no ifc_schema";
  for (const k of ["required_entities", "forbidden_entities", "required_psets", "required_properties"])
    if (!Array.isArray(c[k])) return `${k} is not a list`;
  if (typeof c.require_georeference !== "boolean") return "require_georeference is not true or false";
  return null;
}

async function bytesOf(fileId, versionTag) {
  const res = await thatOpenServices.downloadFile(fileId, versionTag ? { versionTag } : undefined);
  if (res && typeof res.arrayBuffer === "function") return Buffer.from(await res.arrayBuffer());
  return Buffer.from(res);
}

/** The latest sentinel-contract.json of the project: {body, ref} · {reason} when absent or unreadable. */
async function contractOf(projectId, items) {
  const item = items.find((i) => i.name === CONTRACT_ITEM);
  if (!item) return { reason: NO_CONTRACT };
  const tag = item.versions?.length ? item.versions[item.versions.length - 1].tag : undefined;
  const label = `${CONTRACT_ITEM} ${tag || "(no version)"}`;
  let body;
  try { body = JSON.parse((await bytesOf(item._id, tag)).toString("utf8")); }
  catch (e) { return { reason: `${label} did not parse: ${words(e)}` }; }
  const bad = contractShapeError(body);
  if (bad) return { reason: `${label} ${bad}` };
  return { body, ref: tag || body.contract_key };
}

const verdictLine = (r) => r.result === "pass" ? `Passed — ${r.contract_key}`
  : r.result === "fail" ? `Refused — ${r.contract_key} — ${r.failures.length} failure${r.failures.length === 1 ? "" : "s"}: ${r.failures.join(" ")}`
  : `Not checked — ${r.reason}`;

export async function main() {
  const ctx = typeof executionContext === "object" && executionContext ? executionContext : {};
  const fileId = str(executionParams?.fileId);
  const projectId = str(ctx.projectId) || str(executionParams?.projectId);
  if (!fileId) return fail("fileId is required");
  if (!projectId) return fail("no project: launch from a project or pass projectId");

  let file;
  try { file = await thatOpenServices.getFile(fileId, { includeVersions: true }); }
  catch (e) { return fail(`file ${fileId}: ${words(e)}`); }
  const name = file?.name || fileId;
  if (name.endsWith(".gate.json") || name === CONTRACT_ITEM) return { type: "WARNING", message: `Skipped — ${name} is not an IFC` };
  const versions = Array.isArray(file?.versions) ? file.versions : [];
  let versionTag = str(executionParams?.versionTag);
  if (versionTag) { if (!versions.some((v) => v.tag === versionTag)) return fail(`${name} has no version ${versionTag}`); }
  else versionTag = versions.length ? versions[versions.length - 1].tag : "";
  report(`Reading ${name} ${versionTag}…`);

  let bytes;
  try { bytes = await bytesOf(fileId, versionTag); }
  catch (e) { return fail(`${name} ${versionTag} could not be downloaded: ${words(e)}`); }

  let items;
  try { items = await thatOpenServices.listFiles({ projectId }); }
  catch (e) { return fail(`the project's files could not be listed: ${words(e)}`); }
  const contract = await contractOf(projectId, items);

  let r;
  try { r = contract.body ? checkDelivery(bytes, contract.body) : gateNotChecked(bytes, contract.reason); }
  catch (e) { return fail(`the gate threw on ${name} ${versionTag}: ${words(e)}`); }
  if (r.result !== "not_checked") report(`${r.total_entities} entities · ${r.contract_key}: ${r.failures.length} failure(s)`);
  const line = verdictLine(r);

  // The report: one item per IFC, a version per judged IFC version (Decision 4).
  const rep = {
    kind: REPORT_KIND, file: { id: fileId, name, versionTag }, result: r.result, passed: r.passed, reason: r.reason ?? null,
    contract: contract.body ? { ref: contract.ref, sha256: sha(JSON.stringify(contract.body)) } : null,
    detected_schema: r.detected_schema, total_entities: r.total_entities, failures: r.failures, warnings: r.warnings,
    sha256: r.sha256, size: r.size,
    run: { executionId: ctx.executionId ?? null, at: new Date().toISOString(), component: { toolId: ctx.toolId ?? null, toolVersion: ctx.toolVersion ?? null } },
  };
  let reportId = null, reportErr = null;
  try {
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" });
    const existing = items.find((i) => i.name === reportName(name));
    if (existing) { await thatOpenServices.createVersion(existing._id, blob, versionTag); reportId = existing._id; }
    else {
      const made = await thatOpenServices.createFile({ file: new File([blob], reportName(name), { type: "application/json" }), name: reportName(name), versionTag, projectId });
      reportId = made?.item?._id ?? made?._id ?? null;
    }
  } catch (e) { reportErr = words(e); }

  // The labels on the IFC version (values ≤ 50 characters: the hash in two halves).
  const labels = {
    sentinel_gate: r.result === "not_checked" ? "not_checked" : r.result, sentinel_contract: contract.body ? contract.ref : "none",
    sentinel_failures: String(r.failures.length), sentinel_sha256_a: r.sha256.slice(0, 32), sentinel_sha256_b: r.sha256.slice(32),
    sentinel_report: reportId || "none", sentinel_run: String(ctx.executionId ?? "none"),
  };
  let labelsErr = null;
  try { await thatOpenServices.updateFileVersionMetadata(fileId, versionTag, labels); } catch (e) { labelsErr = words(e); }

  if (reportErr) return { type: "WARNING", message: `${line} — the report could not be written: ${reportErr}` };
  if (labelsErr) return { type: "WARNING", message: `${line} — report written; the version labels were refused: ${labelsErr}` };
  return { type: r.result === "pass" ? "SUCCESS" : "WARNING", message: line };
}
