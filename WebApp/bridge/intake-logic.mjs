// Governed Intake: the Governed Publish loop for an IFC that did not come from Revit.
//   G2 delivery gate → G1+G3 naming + IDS adjudication (one referee call) → G4 publish on pass.
// Pure sequencing; every side effect is a dep so the order is unit-tested. Honesty rules: a gate-only
// pass is "recorded", never "accepted"; the three failure lists stay separate; an upload failure after
// an accepted verdict does not undo the verdict — it is reported as unpublished.
const err = (status, message) => Object.assign(new Error(message), { status });

export function validateIntakeInput(input = {}) {
  const key = String(input.key || "").trim();
  const name = String(input.name || "").trim();
  const source = String(input.source || "").trim();
  if (!key) throw err(400, "project key required");
  if (!/\.ifc$/i.test(name)) throw err(400, "name must be the container's ISO name ending in .ifc");
  if (!input.bytes || !input.bytes.length) throw err(400, "Empty body — POST the .ifc file as the request body.");
  if (!source) throw err(400, "source required (who produced the file: astra, pascal, navisworks, cli, an email)");
  return {
    key, name, source, bytes: input.bytes,
    actor: (input.actor && String(input.actor).trim()) || source,
    revision: input.revision ? String(input.revision).trim() : undefined,
    note: input.note ? String(input.note) : undefined,
    agent: input.agent && typeof input.agent === "object" ? input.agent : undefined,
    raise_bcf: input.raise_bcf !== false,
  };
}

export async function runIntake(deps, rawInput) {
  const input = validateIntakeInput(rawInput);
  const { key, name, bytes, source, actor, revision, note, agent } = input;

  // G2 — delivery gate (the contract the project or the bridge default names).
  const contract = await deps.loadContract(key);
  const gate = await deps.checkDelivery(bytes, contract);
  const gateRow = { file: name, passed: gate.passed, contract: gate.contract_key, schema: gate.detected_schema, entities: gate.total_entities, failures: gate.failures.length, sha256: gate.sha256, source };
  // deps.audit is 4-arg here: (key, message, actor, value) — entity_type/entity_id are the wiring
  // adapter's job (see task-5-brief.md), not this module's; the real cde.audit takes 7 args.
  await deps.audit(key, `IFC delivery gate ${gate.passed ? "PASS" : "FAIL"}: ${name}`, actor, gateRow);
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, ids_enforce: null, warned: false, audit_id: null, receipt: null, published: false };
  if (!gate.passed) return { ...base, verdict: "rejected", stage: "gate" };

  // G1 + G3 — the referee: naming gate on the container name, IDS on the extracted elements.
  const extracted = await deps.extractElements(bytes);
  const result = await deps.adjudicate(key, { source, actor, agent, elements: extracted.elements, container_name: name, note });
  const judged = {
    ...base, naming: result.naming ?? null, summary: result.summary ?? null, failures: result.failures || [],
    ids_source: result.ids_source, ids_ref: result.ids_ref ?? null, ids_enforce: result.ids_enforce ?? null, warned: !!result.warned,
    audit_id: result.audit_id ?? null, receipt: result.receipt ?? null,
    extracted: extracted.counts,
  };
  // Same rule the propose route applies: raise a BCF issue whenever there ARE element failures and the
  // IDS isn't "off" — this covers a hard reject AND a warn (published-but-flagged), so warned checks are
  // still tracked, not silently dropped from the loop just because the file came in through intake.
  const shouldRaiseBcf = input.raise_bcf && (result.failures || []).length > 0 && result.ids_enforce !== "off";
  if (result.verdict === "rejected") {
    const out = { ...judged, verdict: "rejected", stage: "ids" };
    if (shouldRaiseBcf) out.bcf = await deps.raiseBcf(key, result, { author: actor });
    return out;
  }

  // G4 — publish on pass: fragments + platform upload, then the CDE version with the verdict badge.
  // An installed IDS that found NO element in its scope has checked nothing: that is a gate-only pass
  // and is published as "recorded", never "accepted" (honesty rule; final review of 2026-09-23).
  const nothingInScope = result.verdict === "accepted" && result.summary && result.summary.in_scope === 0;
  const verdict = nothingInScope ? "recorded" : result.verdict; // "accepted" or "recorded"
  const noteLine = nothingInScope
    ? `IDS ${result.ids_ref ?? ""} is installed but no element was in its scope (${extracted.counts?.elements ?? 0} read, ${extracted.counts?.skipped ?? 0} skipped) — published on the delivery-gate pass alone.`.replace("IDS  is", "IDS is")
    : verdict === "recorded" ? "No project IDS installed — published on the delivery-gate pass alone." : undefined;
  const bcf = shouldRaiseBcf ? await deps.raiseBcf(key, result, { author: actor }) : undefined;
  let upload;
  try { upload = await deps.uploadIfc(bytes, name, revision || "v1"); }
  catch (e) { return { ...judged, verdict, stage: "upload_failed", note: noteLine, bcf, error: String(e?.message || e) }; }
  const reg = await deps.registerFileVersion(key, {
    name, revision, sha256: gate.sha256, size_bytes: gate.size, platform_item_id: upload.itemId ?? null,
    author: actor, notes: note ?? null, title: name,
    attach_geometry: false, // never silently attach to a stale liveNoGeom version — this is a fresh intake revision
  });
  const versionId = reg?.version?.id ?? null;
  if (versionId) await deps.recordVersionVerdict(key, versionId, result, actor);
  return {
    ...judged, verdict, stage: "published", published: true, note: noteLine, bcf,
    version: { container_id: reg?.container_id ?? null, version_id: versionId, revision: reg?.version?.revision ?? revision ?? null, platform_item_id: upload.itemId ?? null, format: upload.format },
  };
}
