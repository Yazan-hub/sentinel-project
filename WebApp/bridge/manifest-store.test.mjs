// Manifests per container version: elements into the revision tables, datum + site into one document.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { captureManifest, getManifest, listManifests, backfillManifest } from "./manifest-store.mjs";

const manifestA = { schema: "IFC4", elements: [{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" }, { guid: "g2", class: "IFCSLAB", type_name: null, storey: "Level 1" }], levels: [{ name: "Level 1", elevation_mm: 0 }], grids: ["A"], site: { lat: 51.5, lon: -0.1, elevation_m: 12, map_conversion: null }, counts: { elements: 2, skipped: 0 } };

function memDeps() {
  const docs = new Map(), revisions = new Map(), calls = [];
  const k = (s, p, d) => `${s}|${p}|${d}`;
  return {
    docs, revisions, calls,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    extractManifest: async () => manifestA,
    createRevision: async (key, b) => { calls.push(["createRevision", key, b]); const id = `rev-${revisions.size + 1}`; revisions.set(id, b.snapshots); return { revision_id: id, element_count: b.snapshots.length }; },
    getRevisionSnapshots: async (rid) => revisions.get(rid) ?? [],
    docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
    docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
    listFiles: async () => [
      { id: "c-1", iso_name: "A-0101.ifc", container_type: "model", live_version_id: "v-1", versions: [{ id: "v-1", revision: "P01", is_live: true }] },
      { id: "c-2", iso_name: "B-0102.ifc", container_type: "model", live_version_id: "v-2", versions: [{ id: "v-2", revision: "P01", is_live: true }] },
      { id: "c-3", iso_name: "programme.csv", container_type: "document", live_version_id: "v-3", versions: [] },
      { id: "c-5", iso_name: "programme-2.csv", container_type: "model", live_version_id: "v-5", versions: [] }, // registered as a model, not an IFC
      { id: "c-4", iso_name: "old.ifc", container_type: "model", live_version_id: null, versions: [] },
    ],
  };
}

describe("manifest store", () => {
  it("captures: a revision of element rows linked to the version, one document with datum and site, a sha", async () => {
    const d = memDeps();
    const r = await captureManifest("p", "v-1", Buffer.from("ISO-10303-21;"), { actor: "cli", source: "intake", rev_code: "P01" }, d);
    expect(r).toEqual({ revision_id: "rev-1", elements: 2, skipped: 0, levels: 1, grids: 1, has_site: true });
    const [, key, body] = d.calls[0];
    expect(key).toBe("p");
    expect(body).toMatchObject({ container_version_id: "v-1", rev_code: "P01", uploaded_by: "cli" });
    expect(body.snapshots).toEqual([{ guid: "g1", category: "IFCWALL", type_name: "Wall 1" }, { guid: "g2", category: "IFCSLAB", type_name: null }]);
    const doc = d.docs.get("manifest|uuid-p|v-1");
    expect(doc).toMatchObject({ version_id: "v-1", revision_id: "rev-1", schema: "IFC4", levels: manifestA.levels, grids: ["A"], site: manifestA.site, source: "intake" });
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof doc.captured_at).toBe("string");
  });
  it("reads back a manifest the core can judge, and null when none was captured", async () => {
    const d = memDeps();
    await captureManifest("p", "v-1", Buffer.from("x"), { actor: "cli" }, d);
    const m = await getManifest("p", "v-1", d);
    expect(m.elements).toEqual([{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: null }, { guid: "g2", class: "IFCSLAB", type_name: null, storey: null }]);
    expect(m.levels).toEqual(manifestA.levels);
    expect(m.site.lat).toBe(51.5);
    expect(await getManifest("p", "v-9", d)).toBeNull();
  });
  it("lists live model versions with their manifest state, ignoring documents and containers without a live version", async () => {
    const d = memDeps();
    await captureManifest("p", "v-1", Buffer.from("x"), { actor: "cli" }, d);
    const l = await listManifests("p", d);
    expect(l).toEqual([
      { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: true, captured_at: expect.any(String) },
      { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: false, captured_at: null },
    ]);
  });
});

// H0 (cde-rem-7): the CLI backfill rewrites what the Federation Gate judges, so the bytes must be the version's own file —
// the version on the key, and the bytes hashing to the sha256 it was registered with. (The lead check is the route's,
// before the body is read.) The manifest document is written with the service key once the bridge has checked.
describe("backfillManifest — only the version's own file", () => {
  const bytes = Buffer.from("ISO-10303-21;");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const withVersion = (recorded, onKey = true) => {
    const d = memDeps();
    d.versionOnKey = async (key, vid) => { if (!onKey) throw Object.assign(new Error(`version ${vid} is not on ${key}`), { status: 400 }); return { proj: { id: `uuid-${key}` }, version: { id: vid } }; };
    d.sb = async () => [{ sha256: recorded, size_bytes: d.size ?? null }];
    d.opts = [];
    const upsert = d.docUpsert;
    d.docUpsert = async (s, p, id, data, o) => { d.opts.push(o); return upsert(s, p, id, data); };
    return d;
  };

  it("a version that is not on the key is a 400 and nothing is captured", async () => {
    const d = withVersion(sha, false);
    await expect(backfillManifest("p", "v-9", bytes, { actor: "cli", source: "backfill" }, d)).rejects.toMatchObject({ status: 400, message: "version v-9 is not on p" });
    expect(d.calls).toHaveLength(0);
    expect(d.docs.size).toBe(0);
  });

  it("bytes that are not the version's file are a 409 and nothing is captured", async () => {
    const d = withVersion("ff".repeat(32));
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, d))
      .rejects.toMatchObject({ status: 409, message: `these bytes are not version v-1's file (sha256 ${sha.slice(0, 12)}… ≠ ffffffffffff…) — nothing was saved` });
    expect(d.calls).toHaveLength(0);
    expect(d.docs.size).toBe(0);
  });

  it("the version's own bytes are captured, the document written with the service key; a version with no recorded sha256 takes the lead's upload", async () => {
    const d = withVersion(sha.toUpperCase());
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, d)).resolves.toMatchObject({ revision_id: "rev-1", elements: 2 });
    expect(d.docs.get("manifest|uuid-p|v-1")).toMatchObject({ sha256: sha, source: "backfill" });
    expect(d.opts).toEqual([{ service: true }]);
    const none = withVersion(null);
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, none)).resolves.toMatchObject({ revision_id: "rev-1" });
  });

  it("with no recorded sha256 but a recorded size, bytes of another size are a 409 and nothing is captured; the right size is taken", async () => {
    const d = withVersion(null);
    d.size = bytes.length + 1;
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, d))
      .rejects.toMatchObject({ status: 409, message: `these bytes are not version v-1's file (${bytes.length} bytes ≠ ${bytes.length + 1} recorded; it has no sha256 to compare) — nothing was saved` });
    expect(d.docs.size).toBe(0);
    const ok = withVersion(null);
    ok.size = bytes.length;
    await expect(backfillManifest("p", "v-1", bytes, { actor: "cli", source: "backfill" }, ok)).resolves.toMatchObject({ revision_id: "rev-1" });
  });
});
