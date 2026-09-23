// Per-project standards as immutable, hashed artefacts: kind@n documents plus one pointer per kind.
// Tested against an in-memory doc store so the sequencing (insert → pointer → audit) is exact.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS } from "./artefact-store.mjs";

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
    officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
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
    expect(r.sha256).toBe(createHash("sha256").update(JSON.stringify(spec)).digest("hex"));
    expect(r.pointer_sha_mismatch).toBe(false);
  });
  it("hashes the body that judges — a document rewritten behind the bridge changes the sha and flags the pointer", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const stored = d.docs.get("artefact|uuid-p|ids@1");
    stored.body = { ...spec, specifications: [] };            // tampered through PostgREST, pointer untouched
    const r = await resolveIdsSpec("p", {}, d);
    expect(r.sha256).toBe(createHash("sha256").update(JSON.stringify(stored.body)).digest("hex"));
    expect(r.sha256).not.toBe(stored.sha256);
    expect(r.pointer_sha_mismatch).toBe(true);
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
  it("inherits the office IDS even when the caller is not a member of the office (403 from ensureProject)", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const ensure = d.ensureProject;
    d.ensureProject = async (key) => { if (key === "aster-office") throw Object.assign(new Error("not a member"), { status: 403 }); return ensure(key); };
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r.source).toBe("office");
    expect(r.ref).toBe("ids@1");
  });
  it("rejects a raw .ids XML string from a client the way the referee did", async () => {
    await expect(resolveIdsSpec("p", { ids: "<ids/>" }, memDeps())).rejects.toMatchObject({ status: 400 });
  });
  it("resolves the office through the real office helper when the project row carries office_key", async () => {
    const { officeKeyOf } = await import("./office-scope.mjs");
    const rows = [{ id: "1", key: "aster-office", name: "Aster", kind: "office", office_key: null }, { id: "2", key: "aster-tower", name: "Tower", kind: "project", office_key: "aster-office" }];
    const d = memDeps({ parentKey: null });
    d.officeKeyOf = (key) => officeKeyOf(key, { listProjectRows: async () => rows });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r.source).toBe("office");
    expect(r.ref).toBe("ids@1");
  });
});

const ruleset = { standard_key: "ast-std-001", semver: "1.0.0", org: "AST", rules: [
  { id: "WS-01", target: "workset", mode: "warn", message_en: "Workset '{name}' is not in the {org} whitelist." },
  { id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "SIZE"], token_defs: { ORG: "{org}", SIZE: "\d+ mm" }, message_en: "Type '{name}' does not match." },
] };
const naming = { standard_key: "ast-std-001", semver: "1.0.0", title: "Aster 2-field", separator: "-", enforce: "reject", strip_extensions: [".ifc"], fields: [
  { key: "project", label: "Project", pattern: "[A-Z0-9]{3,}" },
  { key: "role", label: "Role", enum: ["A", "S"] },
] };
const fails = (kind, body) => { try { validateArtefact(kind, body); } catch (e) { return e; } return null; };
const withRule = (over) => ({ ...ruleset, rules: [ruleset.rules[0], { ...ruleset.rules[1], ...over }] });
const withField = (over) => ({ ...naming, fields: [naming.fields[0], { ...naming.fields[1], ...over }] });

describe("validateArtefact — ruleset and naming", () => {
  it("accepts a well-formed scan ruleset and naming pack, extra fields included", () => {
    expect(validateArtefact("ruleset", { ...ruleset, doc_refs: { rtg: "{org}-STD-001" }, schema_version: 1 })).toBe(true);
    expect(validateArtefact("naming", naming)).toBe(true);
    const { enforce, strip_extensions, ...bare } = naming;                     // both optional
    expect(validateArtefact("naming", bare)).toBe(true);
  });
  it.each([
    ["standard_key", { ...ruleset, standard_key: " " }],
    ["semver", { ...ruleset, semver: "1.0" }],
    ["org", { ...ruleset, org: 7 }],
    ["rules", { ...ruleset, rules: [] }],
    ["rules[1]", { ...ruleset, rules: [ruleset.rules[0], null] }],
    ["rules[1].id", withRule({ id: "" })],
    ["rules[1].target", withRule({ target: "room" })],
    ["rules[1].mode", withRule({ mode: "reject" })],
  ])("ruleset: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("ruleset", body)).toMatchObject({ status: 400, message: expect.stringContaining(`ruleset: ${path} `) });
  });
  it.each([
    ["standard_key", { ...naming, standard_key: undefined }],
    ["semver", { ...naming, semver: "v1" }],
    ["title", { ...naming, title: "" }],
    ["separator", { ...naming, separator: "--" }],
    ["fields", { ...naming, fields: [] }],
    ["fields[1].key", withField({ key: "" })],
    ["fields[1].label", withField({ label: undefined })],
    ["fields[1]", withField({ enum: [] })],
    ["enforce", { ...naming, enforce: "block" }],
    ["strip_extensions", { ...naming, strip_extensions: ".ifc" }],
  ])("naming: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("naming", body)).toMatchObject({ status: 400, message: expect.stringContaining(`naming: ${path} `) });
  });
  it("refuses an invalid ruleset at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "ruleset", withRule({ mode: "reject" }), { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

describe("resolveArtefact", () => {
  const shaOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
  it("resolves none → office → project, naming which judged and the sha of the body", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect(await resolveArtefact("aster-villa", "naming", d)).toEqual({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false });
    await putArtefact("aster-office", "naming", naming, { actor: "x" }, d);
    const o = await resolveArtefact("aster-villa", "naming", d);
    expect(o).toEqual({ body: naming, source: "office", ref: "naming@1", sha256: shaOf(naming), pointer_sha_mismatch: false });
    await putArtefact("aster-villa", "naming", { ...naming, title: "Villa" }, { actor: "x" }, d);
    const p = await resolveArtefact("aster-villa", "naming", d);
    expect(p).toMatchObject({ source: "project", ref: "naming@1" });
    expect(p.body.title).toBe("Villa");
    expect((await resolveArtefact("aster-villa", "ruleset", d)).source).toBe("none");   // kinds resolve independently
  });
  it("flags a document rewritten behind the pointer, and refuses an unknown kind", async () => {
    const d = memDeps();
    await putArtefact("p", "ruleset", ruleset, { actor: "x" }, d);
    d.docs.get("artefact|uuid-p|ruleset@1").body = { ...ruleset, rules: [ruleset.rules[0]] };
    expect((await resolveArtefact("p", "ruleset", d)).pointer_sha_mismatch).toBe(true);
    await expect(resolveArtefact("p", "recipes", d)).rejects.toMatchObject({ status: 404 });
  });
  it("agrees with resolveIdsSpec on the IDS (resolveIdsSpec calls it)", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const a = await resolveArtefact("aster-tower", "ids", d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r).toMatchObject({ spec: a.body, source: a.source, ref: a.ref, sha256: a.sha256, pointer_sha_mismatch: false, client_ids_ignored: false });
  });
});

describe("refLabel", () => {
  it("names ref · source · 12 sha chars, and says none when nothing judged", () => {
    expect(refLabel({ ref: "naming@2", source: "office", sha256: "3f0737600a1bc2d4e5f6" })).toBe("naming@2 · office · 3f0737600a1b…");
    expect(refLabel({ ref: null, source: "none", sha256: null })).toBe("none");
    expect(refLabel({ ref: null, source: "client", sha256: "abcdef0123456789" })).toBe("client · abcdef012345…");
  });
});
