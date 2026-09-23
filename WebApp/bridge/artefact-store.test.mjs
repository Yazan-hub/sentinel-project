// Per-project standards as immutable, hashed artefacts: kind@n documents plus one pointer per kind.
// Tested against an in-memory doc store so the sequencing (insert → pointer → audit) is exact.
import { describe, it, expect } from "vitest";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, KINDS } from "./artefact-store.mjs";

function memDeps({ role = "lead", parentKey = null } = {}) {
  const docs = new Map(), audits = [];
  const k = (s, p, d) => `${s}|${p}|${d}`;
  return {
    audits, docs,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
    docInsert: async (s, p, d, data) => { if (docs.has(k(s, p, d))) throw Object.assign(new Error("duplicate"), { status: 409 }); docs.set(k(s, p, d), data); },
    docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
    audit: async (pid, et, eid, action, actor, oldv, newv) => { audits.push({ pid, et, eid, action, actor, oldv, newv }); },
    requireMinRole: async (key, min) => { if (role !== "lead" && role !== "owner" && role !== "service") throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 }); },
    officeKeyOf: async () => parentKey,
  };
}
const spec = { title: "Aster IDS", specifications: [{ name: "DOOR — FireRating", applicability: { entity: "IFCDOOR" }, requirements: { properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };

describe("artefact store", () => {
  it("installs ids@1 then ids@2, keeps both, points at the latest, audits each install", async () => {
    const d = memDeps();
    const p1 = await putArtefact("aster-tower", "ids", spec, { actor: "lead@example.test", source: { document_id: "doc-1" } }, d);
    expect(p1).toMatchObject({ kind: "ids", version: 1, installed_by: "lead@example.test" });
    expect(p1.sha256).toMatch(/^[0-9a-f]{64}$/);
    const p2 = await putArtefact("aster-tower", "ids", { ...spec, title: "Aster IDS v2" }, { actor: "lead@example.test" }, d);
    expect(p2.version).toBe(2);
    expect(p2.sha256).not.toBe(p1.sha256);
    expect((await getArtefact("aster-tower", "ids", d)).body.title).toBe("Aster IDS v2");
    expect((await getArtefactVersion("aster-tower", "ids", 1, d)).body.title).toBe("Aster IDS");
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed ids@1", "artefact_installed ids@2"]);
    expect(d.audits[1].oldv).toMatchObject({ version: 1 });
    expect(d.audits.every((a) => a.eid === null)).toBe(true);   // audit_log.entity_id is a uuid or null
  });
  it("refuses an unknown kind and an IDS without specifications, and a viewer", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "recipes", {}, { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    await expect(putArtefact("p", "ids", { title: "no specs" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    await expect(putArtefact("p", "ids", { title: "empty specs", specifications: [] }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    await expect(putArtefact("p", "ids", spec, { actor: "x" }, memDeps({ role: "viewer" }))).rejects.toMatchObject({ status: 403 });
  });
  it("lists every kind, null when nothing is installed", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const l = await listArtefacts("p", d);
    expect(Object.keys(l).sort()).toEqual([...KINDS].sort());
    expect(l.ids.version).toBe(1);
    expect(l.ruleset).toBeNull();
  });
});

describe("resolveIdsSpec", () => {
  it("project artefact wins over a client spec, and says so", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("p", { ids: { title: "client", specifications: [] } }, d);
    expect(r.source).toBe("project");
    expect(r.ref).toBe("ids@1");
    expect(r.spec.title).toBe("Aster IDS");
    expect(r.client_ids_ignored).toBe(true);
  });
  it("falls back to the client spec, then to none — never to a server file", async () => {
    const d = memDeps();
    const c = await resolveIdsSpec("p", { ids: { title: "client", specifications: [] } }, d);
    expect(c).toMatchObject({ source: "client", ref: null, client_ids_ignored: false });
    const n = await resolveIdsSpec("p", {}, d);
    expect(n).toMatchObject({ spec: null, source: "none", ref: null, sha256: null });
  });
  it("uses the office's artefact when the project has none and an office key resolves", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r.source).toBe("office");
    expect(r.ref).toBe("ids@1");
  });
  it("rejects a raw .ids XML string from a client the way the referee did", async () => {
    await expect(resolveIdsSpec("p", { ids: "<ids/>" }, memDeps())).rejects.toMatchObject({ status: 400 });
  });
});
