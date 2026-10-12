// Manifests per container version: elements into the revision tables, datum + site into one document.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { captureManifest, getManifest, listManifests, backfillManifest, manifestWalls } from "./manifest-store.mjs";

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
  // MA-8-2: the walls FG-07 compares, captured with the manifest.
  describe("walls (MA-8-2)", () => {
    const FIX = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));
    it("captures the walls of a real IFC: plan mm, the level's NAME as storey, the reader's version; getManifest returns them", async () => {
      const d = memDeps();
      await captureManifest("p", "v-1", FIX, { actor: "cli" }, d);
      const doc = d.docs.get("manifest|uuid-p|v-1");
      expect(doc.walls.length).toBeGreaterThan(0);
      expect(doc).toMatchObject({ walls_total: doc.walls.length, walls_held: expect.any(Number), walls_reader: expect.stringMatching(/^sentinel-ifc /) });
      const w = doc.walls[0];
      expect(w).toMatchObject({ g: expect.any(String), s: [expect.any(Number), expect.any(Number)], e: [expect.any(Number), expect.any(Number)], t: expect.any(Number) });
      expect(w.z1).toBeGreaterThan(w.z0);
      expect(w.storey).not.toMatch(/^L\d\d$/); // a level's name, not the reader's file-local cid
      expect((await getManifest("p", "v-1", d)).walls).toEqual(doc.walls);
    });
    it("a reader that throws keeps the capture and sets walls_why", async () => {
      const d = { ...memDeps(), readWalls: async () => { throw new Error("web-ifc could not open the file"); } };
      await captureManifest("p", "v-1", Buffer.from("x"), { actor: "cli" }, d);
      const doc = d.docs.get("manifest|uuid-p|v-1");
      expect(doc.walls).toBeUndefined();
      expect(doc.walls_why).toBe("web-ifc could not open the file");
      expect(doc.cobie).toBeDefined();
      expect(await getManifest("p", "v-1", d)).toMatchObject({ walls: null, walls_why: "web-ifc could not open the file" });
    });
    it("bytes over the bridge's read cap are not opened", async () => {
      let opened = false;
      const d = { ...memDeps(), readWalls: async () => { opened = true; return { walls: [], levels: [] }; } };
      await captureManifest("p", "v-1", Buffer.alloc(20 * 1024 * 1024 + 1), { actor: "cli" }, d);
      expect(opened).toBe(false);
      expect(d.docs.get("manifest|uuid-p|v-1").walls_why).toBe("larger than the bridge reads (20 MB)");
    });
    it("a document captured before MA-8 reads back as 'captured before MA-8'", async () => {
      const d = memDeps();
      d.docs.set("manifest|uuid-p|v-1", { version_id: "v-1", revision_id: "rev-0", schema: "IFC4", levels: [], grids: [], site: null });
      expect(await getManifest("p", "v-1", d)).toMatchObject({ walls: null, walls_why: "captured before MA-8 — backfill its manifest" });
    });
    it("manifestWalls maps one reading: names the level, counts held IFCWALL*", () => {
      const r = { levels: [{ cid: "L00", name: "Ground" }], walls: [{ global_id: "g", start: [0, 0], end: [1000, 0], thickness_mm: 200, base_mm: 10, height_mm: 2990, storey: "L00" }, { global_id: "h", start: [0, 0], end: [1, 0], thickness_mm: 1, base_mm: 0, height_mm: 1, storey: null }],
        not_read: [{ ifc_class: "IFCWALLSTANDARDCASE" }, { ifc_class: "IFCWINDOW" }] };
      expect(manifestWalls(r)).toEqual({ walls: [{ g: "g", s: [0, 0], e: [1000, 0], t: 200, z0: 10, z1: 3000, storey: "Ground" }, expect.objectContaining({ g: "h", storey: null })], walls_total: 2, walls_held: 1 });
    });
  });
});
