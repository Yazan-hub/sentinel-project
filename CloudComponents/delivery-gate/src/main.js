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
import { checkDelivery, gateNotChecked } from "../../../WebApp/bridge/delivery-gate.mjs";
import { canonicalSha256 } from "../../../WebApp/bridge/canonical.mjs";

export const CONTRACT_ITEM = "sentinel-contract.json";
export const REPORT_KIND = "sentinel.gate-report";
export const reportName = (ifcName) => `${ifcName}.gate.json`;

/** The report version's tag: the IFC's own tag, or `<tag>.2`, `<tag>.3`… when a run of that IFC version already wrote
 *  one (the platform refuses a second version with the same tag, "Duplicated entry"). */
export function freeTag(versions, tag) {
  const taken = new Set((Array.isArray(versions) ? versions : []).map((v) => v?.tag));
  if (!taken.has(tag)) return tag;
  for (let k = 2; ; k++) if (!taken.has(`${tag}.${k}`)) return `${tag}.${k}`;
}

/** This IFC item's report item, as its own labels name it (this version's, else its newest other version's) — never
 *  found by name: the platform lets two items share a name (seen 2026-09-29, two ASTR26-…-0001.ifc items), and one's
 *  report must not take the other's versions. null when no label names one: the run makes a new report item. */
async function reportItemOf(items, fileId, versions, versionTag, current) {
  const named = (labels) => {
    const id = labels && typeof labels.sentinel_report === "string" ? labels.sentinel_report : "";
    return id && id !== "none" ? items.find((i) => i._id === id && i.name.endsWith(".gate.json")) ?? null : null;
  };
  const here = named(current);
  if (here) return here;
  const earlier = newestTag(versions.filter((v) => v.tag !== versionTag));
  if (!earlier) return null;
  try { return named(await thatOpenServices.getFileVersionMetadata(fileId, earlier)); }
  catch { return null; } // unread: a new report item, never a guess by name
}
const NO_CONTRACT = "no contract on the platform project — install one in Sentinel";

const str = (v) => (typeof v === "string" ? v.trim() : "");
/** The newest version of an item: by createdAt when the platform gives it, else the FIRST entry — the platform lists
 *  versions newest-first (measured 2026-09-28: v13,v12,…,v1); the last entry is the oldest. */
export function newestTag(versions) {
  const vs = (Array.isArray(versions) ? versions : []).filter((v) => v && v.tag);
  if (!vs.length) return "";
  const dated = vs.every((v) => v.createdAt);
  return (dated ? [...vs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : vs)[0].tag;
}
const fail = (message) => ({ type: "FAIL", message: `Gate did not run — ${message}` });
// The platform's own error text can carry the run's token in a URL (…?accessToken=…): never let it reach a message,
// a report or a label.
const words = (e) => String(e?.message || e).replace(/accessToken=[^&\s"']+/g, "accessToken=…");
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
  // GATE-E2: optional; absent or null is 1 (every element of a class).
  if (c.min_coverage != null && !(typeof c.min_coverage === "number" && c.min_coverage >= 0 && c.min_coverage <= 1))
    return "min_coverage is not a number from 0 to 1";
  return null;
}

async function bytesOf(fileId, versionTag) {
  const res = await thatOpenServices.downloadFile(fileId, versionTag ? { versionTag } : undefined);
  // downloadFile never throws on an error status: a 429 or 404 body is not the file.
  if (res && res.ok === false) throw new Error(`the platform answered ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`);
  if (res && typeof res.arrayBuffer === "function") return Buffer.from(await res.arrayBuffer());
  return Buffer.from(res);
}

// A contract key and a version tag the run message may carry: a plain name (SEC-4).
const PLAIN_NAME = /^[A-Za-z0-9._@-]{1,100}$/;

/** The latest sentinel-contract.json of the project: {body, ref, sha256} · {reason} when absent, unreadable or not one item.
 *  sha256 is Sentinel's canonical artefact hash of the body (canonical.mjs), so the bridge can compare it with the contract
 *  installed in Sentinel (SEC-4); the run names it in its message. */
async function contractOf(projectId, items) {
  const named = items.filter((i) => i.name === CONTRACT_ITEM);
  if (named.length > 1) return { reason: `${named.length} items are named ${CONTRACT_ITEM} on the platform project — not checked; keep the one Sentinel mirrors there and remove the rest` };
  const item = named[0];
  if (!item) return { reason: NO_CONTRACT };
  const tag = newestTag(item.versions) || undefined;
  const label = `${CONTRACT_ITEM} ${tag || "(no version)"}`;
  let text, body;
  try { text = (await bytesOf(item._id, tag)).toString("utf8"); }
  catch (e) { return { reason: `${label} could not be downloaded: ${words(e)}` }; }
  try { body = JSON.parse(text); }
  catch (e) { return { reason: `${label} did not parse: ${words(e)}` }; }
  const bad = contractShapeError(body);
  if (bad) return { reason: `${label} ${bad}` };
  // C1: the run's message leads with the hash, then the contract's name — a plain name only, so no platform text can stand
  // where the hash is read.
  if (!PLAIN_NAME.test(body.contract_key) || (tag && !PLAIN_NAME.test(tag)))
    return { reason: `${CONTRACT_ITEM}: its contract_key or version tag is not a plain name (letters, digits, . _ @ -) — install the contract again from Sentinel` };
  return { body, ref: tag || body.contract_key, sha256: canonicalSha256(body) };
}

// The contract is named as the board names it — its ref (the mirrored version, "contract@1") — with the contract's
// own key in brackets when it differs, so the execution log and the card agree.
const contractName = (r, ref) => (!ref || ref === r.contract_key ? r.contract_key : `${ref} (${r.contract_key})`);
// The contract's canonical sha256 rides in the run's own message (the platform's run record, which the bridge's ledger reads),
// first, before any text read from the platform; then the contract's name.
const verdictLine = (r, ref, sha) => r.result === "pass" ? `Passed — contract sha256:${sha} · ${contractName(r, ref)}`
  : r.result === "fail" ? `Refused — contract sha256:${sha} · ${contractName(r, ref)} — ${r.failures.length} failure${r.failures.length === 1 ? "" : "s"}: ${r.failures.join(" ")}`
  : `Not checked — ${r.reason}`;

export async function main() {
  const ctx = typeof executionContext === "object" && executionContext ? executionContext : {};
  const fileId = str(executionParams?.fileId);
  const projectId = str(ctx.projectId) || str(executionParams?.projectId);
  if (!fileId) return fail("fileId is required");
  if (!projectId) return fail("no project: launch from a project or pass projectId");

  // The project's files first: the listing carries each item's versions (getFile named none on the first run,
  // 2026-09-27, when it was asked with the misnamed includeVersions), and the contract and the report item are found
  // in the same list.
  let items;
  try { items = await thatOpenServices.listFiles({ projectId }); }
  catch (e) { return fail(`the project's files could not be listed: ${words(e)}`); }
  let file = items.find((i) => i._id === fileId);
  if (!file) {
    try { file = await thatOpenServices.getFile(fileId, { showVersions: true }); }
    catch (e) { return fail(`file ${fileId}: ${words(e)}`); }
  }
  const name = file?.name || fileId;
  if (name.endsWith(".gate.json") || name === CONTRACT_ITEM) return { type: "WARNING", message: `Skipped — ${name} is not an IFC` };
  const versions = Array.isArray(file?.versions) ? file.versions.filter((v) => v && v.tag) : [];
  let versionTag = str(executionParams?.versionTag);
  if (versionTag) { if (!versions.some((v) => v.tag === versionTag)) return fail(`${name} has no version ${versionTag}`); }
  else versionTag = newestTag(versions);
  if (!versionTag) return fail(`${name} has no version the platform names — nothing was judged`);
  report(`Reading ${name} ${versionTag}…`);

  let bytes;
  try { bytes = await bytesOf(fileId, versionTag); }
  catch (e) { return fail(`${name} ${versionTag} could not be downloaded: ${words(e)}`); }

  const contract = await contractOf(projectId, items);

  let r;
  try { r = contract.body ? checkDelivery(bytes, contract.body) : gateNotChecked(bytes, contract.reason); }
  catch (e) { return fail(`the gate threw on ${name} ${versionTag}: ${words(e)}`); }
  if (r.result !== "not_checked") report(`${r.total_entities} entities · ${r.contract_key}: ${r.failures.length} failure(s)`);
  const line = verdictLine(r, contract.ref, contract.sha256);

  // The report: one item per IFC, a version per judged IFC version (Decision 4).
  const rep = {
    kind: REPORT_KIND, file: { id: fileId, name, versionTag }, result: r.result, passed: r.passed, reason: r.reason ?? null,
    contract: contract.body ? { ref: contract.ref, sha256: contract.sha256 } : null,
    detected_schema: r.detected_schema, total_entities: r.total_entities, failures: r.failures, warnings: r.warnings,
    coverage: r.coverage ?? [], // per class, per required pset and property (GATE-E2); none when not checked
    sha256: r.sha256, size: r.size,
    run: { executionId: ctx.executionId ?? null, at: new Date().toISOString(), component: { toolId: ctx.toolId ?? null, toolVersion: ctx.toolVersion ?? null } },
  };
  // The version's labels are read first: they name this IFC's report item (below), and updateFileVersionMetadata
  // replaces the whole map, so they are merged, never overwritten blind.
  let labelsErr = null, current;
  try { current = await thatOpenServices.getFileVersionMetadata(fileId, versionTag); }
  catch (e) { labelsErr = `the version labels could not be read, so none were written: ${words(e)}`; }

  let reportId = null, reportTag = null, reportErr = null;
  try {
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" });
    const existing = await reportItemOf(items, fileId, versions, versionTag, current);
    if (existing) {
      reportTag = freeTag(existing.versions, versionTag);
      await thatOpenServices.createVersion(existing._id, blob, reportTag);
      reportId = existing._id;
    } else {
      reportTag = versionTag;
      const made = await thatOpenServices.createFile({ file: new File([blob], reportName(name), { type: "application/json" }), name: reportName(name), versionTag, projectId });
      reportId = made?.item?._id ?? made?._id ?? null;
    }
  } catch (e) { reportErr = words(e); }

  // The labels on the IFC version (values ≤ 50 characters: the hash in two halves). The platform's own keys (the
  // IfcFragmenter's fragmentsFileId/derivedFileId link) stay.
  const labels = {
    sentinel_gate: r.result === "not_checked" ? "not_checked" : r.result, sentinel_contract: contract.body ? contract.ref : "none",
    sentinel_failures: String(r.failures.length), sentinel_sha256_a: r.sha256.slice(0, 32), sentinel_sha256_b: r.sha256.slice(32),
    sentinel_report: reportId || "none", sentinel_report_tag: reportId ? reportTag : "none", sentinel_run: String(ctx.executionId ?? "none"),
  };
  if (!labelsErr) {
    try { await thatOpenServices.updateFileVersionMetadata(fileId, versionTag, { ...current, ...labels }); }
    catch (e) { labelsErr = `the version labels were refused: ${words(e)}`; }
  }

  if (reportErr) return { type: "WARNING", message: `${line} — the report could not be written: ${reportErr}` };
  if (labelsErr) return { type: "WARNING", message: `${line} — report written; ${labelsErr}` };
  return { type: r.result === "pass" ? "SUCCESS" : "WARNING", message: line };
}
