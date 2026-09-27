// The journey gatherer: facts in parallel, a rejected source costs only its own step, standards named as the judges name them.
import { describe, it, expect, vi } from "vitest";
import { getJourney } from "./journey-store.mjs";
import { refLabel } from "./artefact-store.mjs";
import { projectNotFound } from "./cde-store.mjs";

const SHA = "23bb57937fb0" + "a".repeat(52);
const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
const art = (kind, source, body = {}) => ({ body, source, ref: `${kind}@${kind === "ids" ? 4 : 1}`, sha256: SHA, pointer_sha_mismatch: false });
const STD = { standard_key: "ast-std-001", semver: "1.0.0" };

function memDeps(over = {}) {
  return {
    ensureProject: vi.fn(async (key) => ({ id: `uuid-${key}`, key })),
    projectScope: vi.fn(async (key) => key === "aster-office"
      ? { key, kind: "office", office_key: null, keys: ["aster-office", "aster-tower", "aster-villa"] }
      : { key, kind: "project", office_key: "aster-office", keys: [key] }),
    listMemberRows: vi.fn(async () => [{ user_id: "u-owner", role: "owner" }, { user_id: "u-lead", role: "lead" }]),
    resolveArtefact: vi.fn(async (key, kind) => art(kind, key === "aster-office" ? "project" : "office", kind === "ids" ? { title: "Aster IDS" } : STD)),
    getSnapshot: vi.fn(async () => ({ source: { title: "Aster template" }, at: "2026-09-20T08:00:00.000Z" })),
    getScan: vi.fn(async () => ({ doc_title: "Aster Villa", at: "2026-09-22T09:00:00.000Z" })),
    listDocs: vi.fn(async () => [{ id: "d-bep", doc_type: "BEP", title: "Aster BEP", status: "draft", version_count: 0 }, { id: "d-r", doc_type: "READINESS", title: "Readiness", status: "draft", version_count: 1 }]),
    listVersionVerdictRows: vi.fn(async () => [{ id: 42, version_id: "v-1", verdict: "accepted" }]),
    listFiles: vi.fn(async () => [{ iso_name: "A.ifc", container_type: "model", versions: [{ id: "v-1", revision: "P01", state: "published", is_live: true }] }]),
    getFederation: vi.fn(async () => ({ latest: null, stale: false, live_set: [{ version_id: "v-1" }] })),
    listTransmittals: vi.fn(async () => []),
    ...over,
  };
}

describe("getJourney", () => {
  it("gathers a project's facts and returns the standards line, the steps and the counts", async () => {
    const d = memDeps();
    const j = await getJourney("aster-villa", d);
    expect(j).toMatchObject({ key: "aster-villa", kind: "project", office_key: "aster-office", total: 8, done: 6, next: "issued" });
    expect(j.standards.ids).toEqual({ ref: "ids@4", source: "office", sha256: SHA, label: refLabel(art("ids", "office")), standard_key: null, semver: null });
    expect(j.standards.ids.label).toBe("ids@4 · office · 23bb57937fb0…");
    expect(j.standards.ruleset).toMatchObject({ ref: "ruleset@1", source: "office", standard_key: "ast-std-001", semver: "1.0.0" });
    const s = Object.fromEntries(j.steps.map((x) => [x.id, x]));
    expect(s.standards.evidence.label).toBe([j.standards.ids.label, j.standards.ruleset.label, j.standards.naming.label].join(" | "));
    expect(s.federated).toMatchObject({ status: "not_checkable", reason: "one model only — federation needs two" });
    expect(d.getSnapshot).not.toHaveBeenCalled();                       // a project does not read the office snapshot
    expect(d.ensureProject).toHaveBeenCalledWith("aster-villa");
  });
  it("one rejected source makes only its step not_checkable with the message; the others stand", async () => {
    const j = await getJourney("aster-villa", memDeps({ listTransmittals: async () => { throw Object.assign(new Error("Supabase 500: transmittals down"), { status: 500 }); } }));
    const s = Object.fromEntries(j.steps.map((x) => [x.id, x]));
    expect(s.issued).toMatchObject({ status: "not_checkable", reason: "Supabase 500: transmittals down", evidence: null });
    expect(s.team.status).toBe("done");
    expect(s.published.status).toBe("done");
    expect(j.done).toBe(6);
    expect(j.next).toBeNull();
  });
  it("a synchronous throw in a reader is a rejected fact too, not a failed request", async () => {
    const j = await getJourney("aster-villa", memDeps({ getScan: () => { throw new Error("scan reader broke"); } }));
    expect(j.steps.find((x) => x.id === "model")).toMatchObject({ status: "not_checkable", reason: "scan reader broke" });
  });
  it("names none for a kind with nothing installed, and unavailable when the resolver fails", async () => {
    const none = await getJourney("aster-villa", memDeps({ resolveArtefact: async (key, kind) => kind === "naming" ? NONE : art(kind, "project") }));
    expect(none.standards.naming).toEqual({ ref: null, source: "none", sha256: null, label: "none", standard_key: null, semver: null });
    expect(none.steps.find((x) => x.id === "standards")).toMatchObject({ status: "todo", reason: "nothing in force: naming" });
    const down = await getJourney("aster-villa", memDeps({ resolveArtefact: async () => { throw new Error("artefacts down"); } }));
    expect(down.standards.ids).toMatchObject({ ref: null, source: "none", label: "unavailable — artefacts down" });
    expect(down.steps.find((x) => x.id === "standards")).toMatchObject({ status: "not_checkable", reason: "artefacts down" });
  });
  it("an office reads only the office facts and lists its projects", async () => {
    const d = memDeps();
    const j = await getJourney("aster-office", d);
    expect(j).toMatchObject({ kind: "office", office_key: null, total: 5, done: 5, next: null });
    expect(j.steps.find((x) => x.id === "projects").evidence.ref).toBe("aster-tower,aster-villa");
    for (const f of ["getScan", "listVersionVerdictRows", "listFiles", "getFederation", "listTransmittals"]) expect(d[f]).not.toHaveBeenCalled();
  });
  it("a non-member is refused before any fact is read", async () => {
    const d = memDeps({ ensureProject: async (key) => { throw projectNotFound(key); } });
    await expect(getJourney("aster-villa", d)).rejects.toMatchObject({ status: 404 });
    expect(d.listMemberRows).not.toHaveBeenCalled();
    expect(d.projectScope).not.toHaveBeenCalled();
  });
});
