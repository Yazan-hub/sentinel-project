// Paperwork slice 5 — the audit pack (renamed in MA-4a): canonical bytes, the seal, honest partial parts, the ledger paging.
import { describe, it, expect } from "vitest";
import { canonical, seal, sealed, buildAuditPack, LEDGER_MAX } from "./audit-pack.mjs";

describe("canonical + seal", () => {
  it("sorts keys at every level, so two writers of the same facts seal the same sha", () => {
    expect(canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } })).toBe('{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}');
    const p = seal({ x: 1, y: [1, 2] });
    expect(p.bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(seal({ y: [1, 2], x: 1 }).bundle_sha256).toBe(p.bundle_sha256);
    expect(sealed(p)).toBe(true); expect(sealed({ ...p, x: 2 })).toBe(false); expect(sealed({ x: 1 })).toBe(false);
  });
  it("MA-4a: a pack sealed under the old name still verifies (sealed() re-hashes the body; the name is not checked)", () => {
    const old = seal({ pack: "sentinel-evidence-pack", version: 1, generated_at: "2026-10-07T18:00:00.000Z", ledger: { rows: [] } });
    expect(sealed(old)).toBe(true);
    expect(sealed({ ...old, pack: "sentinel-audit-pack" })).toBe(false);
  });
});

describe("buildAuditPack", () => {
  const deps = {
    kinds: ["ids", "naming", "roi"], now: () => "2026-10-08T00:00:00.000Z", actor: "lead@example.test",
    project: async () => ({ key: "demo", name: "Demo", kind: "project", office_key: "office" }),
    standards: async (_k, kind) => kind === "roi" ? { ref: null, source: "none" } : { ref: `${kind}@2`, source: kind === "ids" ? "project" : "office", sha256: "ab", pointer_sha_mismatch: kind === "naming" },
    documents: async () => [{ id: "d1", doc_type: "BEP", title: "B", status: "draft", updated_at: "t", bim_document_versions: [{ count: 2 }] }],
    containers: async () => [{ id: "c1", iso_name: "A.ifc", container_versions: [{ id: "v1", revision: "P01", state: "published", sha256: "s", is_live: true }], deleted_versions: 1 }],
    reviews: async () => ({ items: [{ version_id: "v1", step: 1 }] }),
    ledgerPage: async (_k, { offset }) => ({ total: 3, rows: offset === 0 ? [{ id: 3, at: "t3", entity_type: "file_version", entity_id: "v1", action: "verdict: accepted", actor: "a", hash: "h3", prev_hash: "h2" }, { id: 2, at: "t2", entity_type: "x", action: "y", actor: "a", hash: "h2", prev_hash: "h1" }] : [{ id: 1, at: "t1", entity_type: "x", action: "z", actor: "a", hash: "h1", prev_hash: null }] }),
  };
  it("gathers every part, seals the bundle, and the seal re-checks", async () => {
    const p = await buildAuditPack("demo", deps);
    expect(p).toMatchObject({ pack: "sentinel-audit-pack", version: 1, generated_at: "2026-10-08T00:00:00.000Z", generated_by: "lead@example.test", project: { key: "demo", office_key: "office" } });
    expect(p.standards).toEqual({ ids: { ref: "ids@2", source: "project", sha256: "ab" }, naming: { ref: "naming@2", source: "office", sha256: "ab", pointer_sha_mismatch: true }, roi: null });
    expect(p.documents).toEqual([{ id: "d1", doc_type: "BEP", title: "B", status: "draft", updated_at: "t", versions: 2 }]);
    expect(p.containers[0]).toMatchObject({ iso_name: "A.ifc", deleted_versions: 1, versions: [{ id: "v1", revision: "P01", state: "published", is_live: true, superseded: false }] });
    expect(p.reviews).toEqual([{ version_id: "v1", step: 1 }]);
    expect(p.ledger.rows.map((r) => r.id)).toEqual([1, 2, 3]); expect(p.ledger).toMatchObject({ total: 3, truncated: false });
    expect(p.ledger.rows[2]).toMatchObject({ hash: "h3", prev_hash: "h2", action: "verdict: accepted" });
    expect(sealed(p)).toBe(true);
    expect(LEDGER_MAX).toBe(5000);
  });
  it("a part that cannot be read is said so in its place; the rest of the pack stands and is sealed", async () => {
    const p = await buildAuditPack("demo", { ...deps, documents: async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); }, reviews: async () => { throw new Error("no such table"); } });
    expect(p.documents).toEqual({ not_read: "forbidden" }); expect(p.reviews).toEqual({ not_read: "no such table" });
    expect(p.containers).toHaveLength(1); expect(sealed(p)).toBe(true);
  });
});
