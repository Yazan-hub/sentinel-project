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
  };
}

export async function captureManifest(key, versionId, bytes, { actor = "bridge", source = "intake", rev_code = null } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const m = await d.extractManifest(bytes);
  const rev = await d.createRevision(key, {
    container_version_id: versionId, rev_code, uploaded_by: actor,
    snapshots: m.elements.map((e) => ({ guid: e.guid, category: e.class, type_name: e.type_name ?? null })),
  });
  const doc = {
    version_id: versionId, revision_id: rev.revision_id, schema: m.schema,
    levels: m.levels, grids: m.grids, site: m.site, counts: m.counts,
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
  const recorded = String((await d.sb(`container_versions?id=eq.${versionId}&select=sha256`))?.[0]?.sha256 || "").toLowerCase();
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (recorded && recorded !== sha)
    throw Object.assign(new Error(`these bytes are not version ${versionId}'s file (sha256 ${sha.slice(0, 12)}… ≠ ${recorded.slice(0, 12)}…) — nothing was saved`), { status: 409 });
  return captureManifest(key, versionId, bytes, opts, d);
}

export async function getManifest(key, versionId, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const doc = await d.docGet(STORE, proj.id, versionId);
  if (!doc) return null;
  const rows = await d.getRevisionSnapshots(doc.revision_id);
  return {
    schema: doc.schema, levels: doc.levels || [], grids: doc.grids || [], site: doc.site ?? null, counts: doc.counts,
    elements: rows.map((r) => ({ guid: r.guid, class: r.category, type_name: r.type_name ?? null, storey: null })),
    captured_at: doc.captured_at, sha256: doc.sha256,
  };
}

/** The federated set as the CDE sees it: every model container with a live version. */
export async function liveModelVersions(key, deps) {
  const d = await wire(deps);
  const files = await d.listFiles(key);
  return files
    .filter((f) => f.container_type === "model" && f.live_version_id)
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
