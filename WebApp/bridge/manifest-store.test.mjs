// Manifests per container version: elements into the revision tables, datum + site into one document.
import { describe, it, expect } from "vitest";
import { captureManifest, getManifest, listManifests } from "./manifest-store.mjs";

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
