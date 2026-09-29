// Manifests per container version, for the Federation Gate. Element rows go into the revision tables
// (model_revisions + element_snapshots, migration 0005) linked to the version — the same rows revision
// diff and the element graph read — and the datum + site go into one small document keyed by the
// version id. Capture is called after a publish is registered and must never fail that publish: the
// callers log an error and the model reads "no manifest" in the gate.
import { createHash } from "node:crypto";

export const STORE = "manifest";

async function wire(deps = {}) {
  const need = ["ensureProject", "createRevision", "getRevisionSnapshots", "docGet", "docUpsert", "listFiles"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    createRevision: deps.createRevision || cde.createRevision,
    getRevisionSnapshots: deps.getRevisionSnapshots || cde.getRevisionSnapshots,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    listFiles: deps.listFiles || cde.listFiles,
    versionOnKey: deps.versionOnKey || cde?.versionOnKey,
    sb: deps.sb || cde?.sb,
    extractManifest: deps.extractManifest || (await import("./ifc-manifest.mjs")).extractManifest,
    measureCobie: deps.measureCobie || measureCobie,
  };
}

/** COBie hand-over completeness of an IFC's maintainable assets (item 6, 7D): the same assess() and the same property
 *  names as the browser's COBie panel, on the governed file's own bytes, instance and type property sets both. Returns
 *  {total, complete, readiness, coverage, skipped, unknown_classes, measured_at}; throws when the file cannot be read. */
export async function measureCobie(bytes) {
  const [{ extractElements }, core] = await Promise.all([import("./ifc-extract.mjs"), import("./sentinel-core.mjs")]);
  const x = await extractElements(bytes, { classes: [...core.MAINTAINABLE_CLASSES], modelId: "cobie" });
  const assets = x.elements.map((e) => {
    const props = {};
    for (const g of e.psets || []) for (const r of g.rows || []) if (r?.name && r.value != null && String(r.value).trim()) props[r.name] ??= String(r.value);
    return core.assetFromProps({
      guid: e.identity?.GlobalId ?? `cobie:${e.localId}`, local_id: e.localId, model_id: "cobie",
      name: e.identity?.Name ?? `#${e.localId}`, category: e.identity?.Class ?? "", object_type: e.identity?.ObjectType, tag: e.identity?.Tag,
    }, props);
  });
  const r = core.assess(assets, [], []);
  return { total: r.total, complete: r.complete, readiness: r.readiness, coverage: r.coverage, skipped: x.counts.skipped, unknown_classes: x.counts.unknown_classes, measured_at: new Date().toISOString() };
}

export async function captureManifest(key, versionId, bytes, { actor = "bridge", source = "intake", rev_code = null } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const m = await d.extractManifest(bytes);
  const rev = await d.createRevision(key, {
    container_version_id: versionId, rev_code, uploaded_by: actor,
    snapshots: m.elements.map((e) => ({ guid: e.guid, category: e.class, type_name: e.type_name ?? null })),
  });
  // COBie measured on these same bytes; a failure is kept as "not read — why" and never fails the capture.
  let cobie;
  try { cobie = await d.measureCobie(bytes); } catch (e) { cobie = { not_read: String(e?.message || e).slice(0, 200) }; }
  const doc = {
    version_id: versionId, revision_id: rev.revision_id, schema: m.schema, cobie,
    levels: m.levels, grids: m.grids, site: m.site, counts: m.counts, guid_audit: m.guid_audit ?? null,
    sha256: createHash("sha256").update(bytes).digest("hex"), captured_at: new Date().toISOString(), source,
  };
  // Written with the service key: every caller has been checked first (intake, the backfill's lead, the outbox's
  // machine credential), and the store can then be closed to direct writes (migration 0033).
  await d.docUpsert(STORE, proj.id, versionId, doc, { service: true });
  return { revision_id: rev.revision_id, elements: m.counts.elements, skipped: m.counts.skipped, levels: m.levels.length, grids: m.grids.length, has_site: !!(m.site && (m.site.lat != null || m.site.map_conversion)) };
}

/** POST /cde/:key/manifests/:versionId, the CLI backfill (H0 cde-rem-7): it rewrites what the Federation Gate judges, so
 *  the bytes must be the version's own file — the version on `key` (versionOnKey's 400) and, when it was registered with
 *  a sha256, the bytes hashing to it (409) — before anything is captured. A version registered without a sha256 cannot
 *  be matched; the lead's upload stands (the route asks the lead role before it reads the body). */
export async function backfillManifest(key, versionId, bytes, opts = {}, deps) {
  const d = await wire(deps);
  await d.versionOnKey(key, versionId);
  const row = (await d.sb(`container_versions?id=eq.${versionId}&select=sha256,size_bytes`))?.[0] ?? {};
  const recorded = String(row.sha256 || "").toLowerCase();
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (recorded && recorded !== sha)
    throw Object.assign(new Error(`these bytes are not version ${versionId}'s file (sha256 ${sha.slice(0, 12)}… ≠ ${recorded.slice(0, 12)}…) — nothing was saved`), { status: 409 });
  // A version registered before fingerprints has no sha256; when its size was recorded, the bytes must at least be that
  // size (a weaker check than a hash, said as such) — a lead's upload of any other file is refused.
  if (!recorded && Number.isFinite(Number(row.size_bytes)) && row.size_bytes != null && Number(row.size_bytes) !== bytes.length)
    throw Object.assign(new Error(`these bytes are not version ${versionId}'s file (${bytes.length} bytes ≠ ${row.size_bytes} recorded; it has no sha256 to compare) — nothing was saved`), { status: 409 });
  return captureManifest(key, versionId, bytes, opts, d);
}

export async function getManifest(key, versionId, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const doc = await d.docGet(STORE, proj.id, versionId);
  if (!doc) return null;
  const rows = await d.getRevisionSnapshots(doc.revision_id);
  return {
    schema: doc.schema, levels: doc.levels || [], grids: doc.grids || [], site: doc.site ?? null, counts: doc.counts, guid_audit: doc.guid_audit ?? null,
    elements: rows.map((r) => ({ guid: r.guid, class: r.category, type_name: r.type_name ?? null, storey: null })),
    captured_at: doc.captured_at, sha256: doc.sha256,
  };
}

/** The federated set as the CDE sees it: every model container with a live version. */
export async function liveModelVersions(key, deps) {
  const d = await wire(deps);
  const files = await d.listFiles(key);
  return files
    // The federated set is the live IFC models: a manifest is read from IFC bytes, so a container registered as a
    // "model" that is not an IFC (aster-tower's programme.csv, 2026-09-28) could never be judged and would keep the
    // Federation Gate — and the lock on the clash register — shut for ever.
    .filter((f) => f.container_type === "model" && f.live_version_id && /\.ifc$/i.test(String(f.iso_name ?? "")))
    .map((f) => ({ container: f.iso_name, container_id: f.id, version_id: f.live_version_id, revision: (f.versions || []).find((v) => v.id === f.live_version_id)?.revision ?? null }));
}

export async function listManifests(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const out = [];
  for (const m of await liveModelVersions(key, deps)) {
    const doc = await d.docGet(STORE, proj.id, m.version_id);
    out.push({ ...m, has_manifest: !!doc, captured_at: doc?.captured_at ?? null });
  }
  return out;
}
