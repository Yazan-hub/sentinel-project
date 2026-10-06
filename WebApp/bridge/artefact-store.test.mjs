// Per-project standards as immutable, hashed artefacts: kind@n documents plus one pointer per kind.
// Tested against an in-memory doc store so the sequencing (insert → pointer → audit) is exact.
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonical } from "./artefact-store.mjs";
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS, artefactReply, resolveContract } from "./artefact-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

// Only the default wiring (a test that omits docInsert/docUpsert) reaches this mock; memDeps tests never import cde-store.
const cdeMock = vi.hoisted(() => ({
  ensureProject: vi.fn(async (key) => ({ id: `uuid-${key}`, key })), docGet: vi.fn(async () => null),
  docInsert: vi.fn(async () => {}), docUpsert: vi.fn(async () => {}), audit: vi.fn(async () => {}),
}));
vi.mock("./cde-store.mjs", () => cdeMock);

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
    expect(r.sha256).toBe(createHash("sha256").update(canonical(spec)).digest("hex"));
    expect(r.pointer_sha_mismatch).toBe(false);
  });
  it("hashes the body that judges — a document rewritten behind the bridge changes the sha and flags the pointer", async () => {
    const d = memDeps();
    await putArtefact("p", "ids", spec, { actor: "x" }, d);
    const stored = d.docs.get("artefact|uuid-p|ids@1");
    stored.body = { ...spec, specifications: [] };            // tampered through PostgREST, pointer untouched
    const r = await resolveIdsSpec("p", {}, d);
    expect(r.sha256).toBe(createHash("sha256").update(canonical(stored.body)).digest("hex"));
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
  it("SEC-4: accepts patterns at the bound, {org} in a pattern, and the seed packs' and demos' exclusions", () => {
    expect(validateArtefact("ruleset", withRule({ token_defs: { ORG: "{org}", SIZE: "a".repeat(512) }, exclusions: ["^<.*>", "^\\{3D"] }))).toBe(true);
    expect(fails("ruleset", withRule({ exclusions: ["(?i)^draft"] })).message).toBe("ruleset: rules[1].exclusions[0] does not compile as a pattern (Invalid regular expression: /(?i)^draft/: Invalid group) — write it without .NET-only syntax such as a leading (?i)");
  });
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
    // SEC-4 (S29): the patterns the add-in and the web compile are checked here first.
    ["rules[1].token_defs", withRule({ token_defs: ["\\d+"] })],
    ["rules[1].token_defs", withRule({ token_defs: null })],
    ["rules[1].token_defs.SIZE", withRule({ token_defs: { ORG: "{org}", SIZE: 5 } })],
    ["rules[1].token_defs.SIZE", withRule({ token_defs: { ORG: "{org}", SIZE: "(\\d+" } })],
    ["rules[1].token_defs.SIZE", withRule({ token_defs: { ORG: "{org}", SIZE: "a".repeat(513) } })],
    ["rules[1].token_defs", withRule({ token_defs: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`T${i}`, "x"])) })],
    ["rules[1].exclusions", withRule({ exclusions: "^<.*>$" })],
    ["rules[1].exclusions[1]", withRule({ exclusions: ["^<.*>$", "(?i)^draft"] })],
    ["rules[1].exclusions", withRule({ exclusions: Array.from({ length: 65 }, () => "x") })],
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
  const shaOf = (o) => createHash("sha256").update(canonical(o)).digest("hex");
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

describe("canonical sha", () => {
  it("is the same whatever key order the database returns the body in (jsonb reorders keys)", async () => {
    const d = memDeps();
    const p = await putArtefact("aster-tower", "ids", spec, { actor: "x" }, d);
    const reordered = JSON.parse(JSON.stringify({ specifications: spec.specifications, title: spec.title }));
    d.docs.set("artefact|uuid-aster-tower|ids@1", { ...d.docs.get("artefact|uuid-aster-tower|ids@1"), body: reordered });
    const r = await resolveArtefact("aster-tower", "ids", d);
    expect(r.sha256).toBe(p.sha256);
    expect(r.pointer_sha_mismatch).toBe(false);
  });
});

describe("refLabel", () => {
  it("names ref · source · 12 sha chars, and says none when nothing judged", () => {
    expect(refLabel({ ref: "naming@2", source: "office", sha256: "3f0737600a1bc2d4e5f6" })).toBe("naming@2 · office · 3f0737600a1b…");
    expect(refLabel({ ref: null, source: "none", sha256: null })).toBe("none");
    expect(refLabel({ ref: null, source: "client", sha256: "abcdef0123456789" })).toBe("client · abcdef012345…");
  });
});

describe("artefactReply — the GET route's answer (ETag, 304, 404 reasons)", () => {
  const shaOf = (o) => createHash("sha256").update(canonical(o)).digest("hex");
  it("200 names kind, version, source, ref and sha, with an ETag of ref:source:sha", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ruleset", ruleset, { actor: "x" }, d);
    const r = await artefactReply("aster-tower", "ruleset", undefined, d);
    expect(r.status).toBe(200);
    expect(r.etag).toBe(`"ruleset@1:office:${shaOf(ruleset)}"`);
    expect(r.body).toEqual({ kind: "ruleset", version: 1, body: ruleset, source: "office", ref: "ruleset@1", sha256: shaOf(ruleset), pointer_sha_mismatch: false });
  });
  it("304 with no body when If-None-Match equals the ETag; 200 when it does not", async () => {
    const d = memDeps();
    await putArtefact("p", "naming", naming, { actor: "x" }, d);
    const { etag } = await artefactReply("p", "naming", undefined, d);
    expect(await artefactReply("p", "naming", etag, d)).toEqual({ status: 304, etag });
    expect((await artefactReply("p", "naming", `"naming@0:project:${"0".repeat(64)}"`, d)).status).toBe(200);
  });
  it("the same body moving from the office to the project changes the ETag (source is inside it)", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ruleset", ruleset, { actor: "x" }, d);
    const before = await artefactReply("aster-villa", "ruleset", undefined, d);
    await putArtefact("aster-villa", "ruleset", ruleset, { actor: "x" }, d);
    const after = await artefactReply("aster-villa", "ruleset", before.etag, d);
    expect(after.status).toBe(200);
    expect(after.body.sha256).toBe(before.body.sha256);
    expect(after.etag).toBe(`"ruleset@1:project:${shaOf(ruleset)}"`);
  });
  it("404 not_installed when neither the project nor its office has the kind", async () => {
    const r = await artefactReply("aster-villa", "ids", undefined, memDeps({ parentKey: "aster-office" }));
    expect(r).toEqual({ status: 404, body: { message: "no ids artefact installed for aster-villa or its office (PUT /cde/aster-villa/artefacts/ids)", reason: "not_installed" } });
  });
  it("404 no_project when the key is unknown to the bridge — never read as nothing installed", async () => {
    const d = memDeps();
    // one 404 for unknown or not a member (projectNotFound), same wording the real cde-store throws
    d.ensureProject = async (key) => { throw Object.assign(new Error(`Project "${key}" was not found, or you are not a member of it — ask its lead to add you, or create it in the web app (Projects → + New project).`), { status: 404 }); };
    const r = await artefactReply("no-such-key", "ruleset", undefined, d);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ reason: "no_project", message: expect.stringContaining('Project "no-such-key" was not found') });
  });
  it("404 unknown_kind before touching the store; a 403 still throws", async () => {
    const d = memDeps();
    d.ensureProject = vi.fn(d.ensureProject);
    const r = await artefactReply("p", "recipes", undefined, d);
    expect(r).toMatchObject({ status: 404, body: { reason: "unknown_kind" } });
    expect(d.ensureProject).not.toHaveBeenCalled();
    d.ensureProject = async () => { throw Object.assign(new Error("not a member"), { status: 403 }); };
    await expect(artefactReply("p", "ruleset", undefined, d)).rejects.toMatchObject({ status: 403 });
  });
});

describe("artefact writes go with the service key (migration 0030)", () => {
  it("the default wiring inserts the version and upserts the pointer with { service: true }", async () => {
    const d = memDeps();
    await putArtefact("p", "naming", naming, { actor: "x" }, { requireMinRole: d.requireMinRole, officeKeyOf: d.officeKeyOf, officeArtefact: d.officeArtefact });
    expect(cdeMock.docInsert).toHaveBeenCalledWith("artefact", "uuid-p", "naming@1", expect.objectContaining({ kind: "naming", version: 1, body: naming }), { service: true });
    expect(cdeMock.docUpsert).toHaveBeenCalledWith("artefact", "uuid-p", "naming", expect.objectContaining({ kind: "naming", version: 1 }), { service: true });
    expect(cdeMock.audit).toHaveBeenCalledTimes(1);
  });
});

// Contract, layers, guideline and type catalogue (spec 2026-09-25 4b decision 4): the bridge refuses a body its
// judge could not use. The seeds and the pilot's files are read from disk, so a shape drift shows up here first.
const readRepoJson = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8"));
const contract = { schema_version: 1, contract_key: "office-ifc4", ifc_schema: "IFC4",
  required_entities: [{ entity: "IFCWALL", min_count: 1 }, { entity: "IFCBUILDINGSTOREY", min_count: 0 }],
  required_psets: ["Pset_WallCommon"], required_properties: [],
  forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.25 }],
  require_georeference: false };
const layers = { standard: "Office layers v1", enforce: "warn", ignore: ["0", "DEFPOINTS"], layers: [
  { layer: "A-WALL", category: "Walls", family: "Generic_Wall", aliases: ["A-WALL-EXT"], params: { Discipline: "A" } },
  { layer: "A-DOOR", category: "Doors" },
] };
const guideline = { standard: "Office guideline v1", elements: [
  { category: "Walls", rules: [{ when: { layer: "A-WALL" }, use: { family: "Basic Wall", typePattern: "EXT_{thickness} mm" } }], default: { family: "Basic Wall" } },
  { category: "Ceilings", rules: [] },
], views: [], viewNaming: { separator: "_" } };
const catalog = { template: { title: "Office template", extracted_at: "2026-09-25T00:00:00Z" }, view_templates: [], types: [
  { category: "Walls", family: "Basic Wall", type: "EXT_200 mm", system: true, width_mm: 200, height_mm: null },
  { category: "Doors", type: "D1" },
] };
const withItem = (body, key, i, over) => ({ ...body, [key]: body[key].map((x, j) => (j === i ? { ...x, ...over } : x)) });

describe("validateArtefact — contract, layers, guideline, type catalogue", () => {
  it("accepts the seeds and the pilot's files as they will be installed", () => {
    expect(validateArtefact("contract", readRepoJson("config/base-standard/delivery-contract.json"))).toBe(true);
    expect(validateArtefact("contract", readRepoJson("demo/bds-pilot/delivery-contract.json"))).toBe(true);
    expect(validateArtefact("layers", readRepoJson("config/base-standard/layers.json"))).toBe(true);
    expect(validateArtefact("layers", readRepoJson("demo/bds-pilot/bds-layers.json"))).toBe(true);
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-guideline.json"))).toBe(true);
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-elements-guideline.json"))).toBe(true);
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-layerfree-guideline.json"))).toBe(true); // MA-2a: layer-free rules install
    expect(validateArtefact("type_catalog", { ...catalog, types: [{ ...catalog.types[0], bic: "OST_Walls" }, { ...catalog.types[1], bic: null }] })).toBe(true); // BOS-5: a row's bic, or none
    expect(validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json"))).toBe(true);
    expect(validateArtefact("lod_matrix", readRepoJson("demo/bds-pilot/bds-lod-matrix-dd-ma2b.json"))).toBe(true); // MA-2b: stage_map, type_snap_mm
    expect(validateArtefact("type_catalog", readRepoJson("demo/bds-pilot/bds-type-catalog.json"))).toBe(true);
    expect(validateArtefact("type_catalog", readRepoJson("demo/aster/aster-type-catalog.json"))).toBe(true);
  });
  it("the type-catalogue fixtures carry the harvest's title under template, never a top-level source the install route strips", () => {
    for (const f of ["demo/bds-pilot/bds-type-catalog.json", "demo/aster/aster-type-catalog.json"]) {
      const c = readRepoJson(f);
      expect(c).not.toHaveProperty("source");
      expect(c.template.title).toEqual(expect.any(String));
      expect(c.types).toHaveLength(c.count);
    }
    expect(readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json")).not.toHaveProperty("source");
  });
  it("accepts well-formed bodies; optional fields may be absent or null; extra fields stay", () => {
    expect(validateArtefact("contract", contract)).toBe(true);
    const { schema_version, ...unversioned } = contract;
    expect(validateArtefact("contract", unversioned)).toBe(true);
    for (const min_coverage of [0, 0.5, 1, null]) expect(validateArtefact("contract", { ...contract, min_coverage })).toBe(true);
    expect(validateArtefact("layers", layers)).toBe(true);
    expect(validateArtefact("layers", { standard: "S", ignore: null, layers: [{ layer: "A-WALL", category: "Walls", family: null, aliases: null }] })).toBe(true);
    expect(validateArtefact("guideline", guideline)).toBe(true);
    expect(validateArtefact("guideline", { standard: "G", elements: [{ category: "Walls", rules: [], default: null }] })).toBe(true);
    expect(validateArtefact("type_catalog", catalog)).toBe(true);
    expect(validateArtefact("type_catalog", { types: [{ category: "Walls", type: "W", family: null, system: null, width_mm: null }] })).toBe(true);
  });
  it.each([
    ["contract_key", { ...contract, contract_key: "" }],
    ["ifc_schema", { ...contract, ifc_schema: "IFC4X3" }],
    ["ifc_schema", { ...contract, ifc_schema: undefined }],
    ["required_entities", { ...contract, required_entities: undefined }],
    ["required_entities[0]", { ...contract, required_entities: [null] }],
    ["required_entities[0].entity", withItem(contract, "required_entities", 0, { entity: "IfcWall" })],
    ["required_entities[0].min_count", withItem(contract, "required_entities", 0, { min_count: 1.5 })],
    ["required_entities[1].min_count", withItem(contract, "required_entities", 1, { min_count: undefined })],
    ["required_psets", { ...contract, required_psets: ["Pset_WallCommon", ""] }],
    ["required_properties", { ...contract, required_properties: undefined }],
    ["forbidden_entities", { ...contract, forbidden_entities: {} }],
    ["forbidden_entities[0].entity", withItem(contract, "forbidden_entities", 0, { entity: "PROXY" })],
    ["forbidden_entities[0].max_count", withItem(contract, "forbidden_entities", 0, { max_count: 2147483648 })],
    ["forbidden_entities[0].max_ratio", withItem(contract, "forbidden_entities", 0, { max_ratio: 1.5 })],
    ["forbidden_entities[0].max_ratio", withItem(contract, "forbidden_entities", 0, { max_ratio: undefined })],
    ["require_georeference", { ...contract, require_georeference: "yes" }],
    ["require_georeference", { ...contract, require_georeference: undefined }],
    ["schema_version", { ...contract, schema_version: "1" }],
    // Parity with DeliveryContract.FromBody: what Revit would read as none, the bridge does not install.
    ["contract_key", { ...contract, contract_key: "\u0085" }],
    ["schema_version", { ...contract, schema_version: 2147483648 }],
    // GATE-E2: optional, 0..1 (DeliveryContract.FromBody refuses the same).
    ["min_coverage", { ...contract, min_coverage: 1.5 }],
    ["min_coverage", { ...contract, min_coverage: -0.1 }],
    ["min_coverage", { ...contract, min_coverage: "0.5" }],
    ["min_coverage", { ...contract, min_coverage: true }],
  ])("contract: a bad or missing %s is a 400 naming that path", (path, body) => {
    expect(fails("contract", body)).toMatchObject({ status: 400, message: expect.stringContaining(`contract: ${path} `) });
  });
  it.each([
    ["standard", { ...layers, standard: " " }],
    ["layers", { ...layers, layers: [] }],
    ["layers[1]", { ...layers, layers: [layers.layers[0], "A-DOOR"] }],
    ["layers[1].layer", withItem(layers, "layers", 1, { layer: "" })],
    ["layers[1].category", withItem(layers, "layers", 1, { category: "Stairs" })],
    ["layers[0].family", withItem(layers, "layers", 0, { family: 7 })],
    ["layers[0].aliases", withItem(layers, "layers", 0, { aliases: "A-WALL-EXT" })],
    ["ignore", { ...layers, ignore: [0] }],
  ])("layers: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("layers", body)).toMatchObject({ status: 400, message: expect.stringContaining(`layers: ${path} `) });
  });
  it.each([
    ["standard", { ...guideline, standard: undefined }],
    ["elements", { ...guideline, elements: [] }],
    ["elements[0].category", withItem(guideline, "elements", 0, { category: "" })],
    ["elements[1].rules", withItem(guideline, "elements", 1, { rules: undefined })],
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].use.family", withItem(guideline, "elements", 0, { rules: [{ when: {}, use: { type: "X" } }] })],
    ["elements[0].default.family", withItem(guideline, "elements", 0, { default: { family: "" } })],
    // MA-2a: a rule with no condition would match every element the bridge types — refused at install, the strictest of the three
    // validators (review C12): guideline.ts validateGuideline refuses only `when: {}`, the add-in's CheckGuideline neither.
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ when: {}, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ when: { params: {} }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ when: { layer: " " }, use: { family: "Basic Wall" } }] })],
    // A when field present but blank reads as a condition on the TS side and a wildcard on the add-in's; a params value that is not
    // a non-empty string crashed the bridge typer (a number) or matched every element carrying the parameter (null, "").
    ["elements[0].rules[0].when.layer", withItem(guideline, "elements", 0, { rules: [{ when: { layer: null, params: { Location: "Exterior" } }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when.level", withItem(guideline, "elements", 0, { rules: [{ when: { level: "", params: { Location: "Exterior" } }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when.params.Location", withItem(guideline, "elements", 0, { rules: [{ when: { params: { Location: 5 } }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when.params.Location", withItem(guideline, "elements", 0, { rules: [{ when: { params: { Location: null } }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when.params.Location", withItem(guideline, "elements", 0, { rules: [{ when: { params: { Location: "" } }, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when.params.", withItem(guideline, "elements", 0, { rules: [{ when: { params: { "": "Exterior" } }, use: { family: "Basic Wall" } }] })],
    ["views", { ...guideline, views: {} }],
    ["viewNaming", { ...guideline, viewNaming: [] }],
  ])("guideline: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("guideline", body)).toMatchObject({ status: 400, message: expect.stringContaining(`guideline: ${path} `) });
  });
  it.each([
    ["types", { ...catalog, types: [] }],
    ["types", { ...catalog, types: Array.from({ length: 20001 }, (_, i) => ({ category: "Walls", type: `T${i}` })) }],
    ["types[1].category", withItem(catalog, "types", 1, { category: "" })],
    ["types[1].type", withItem(catalog, "types", 1, { type: undefined })],
    ["types[0].family", withItem(catalog, "types", 0, { family: false })],
    ["types[0].system", withItem(catalog, "types", 0, { system: "yes" })],
    ["types[0].width_mm", withItem(catalog, "types", 0, { width_mm: "200" })],
    ["types[0].bic", withItem(catalog, "types", 0, { bic: 5 })],
    ["template", { ...catalog, template: "Office template" }],
    ["template.title", { ...catalog, template: { path: "C:/x.rte" } }],
    ["template.extracted_at", { ...catalog, template: { title: "T", extracted_at: 20260925 } }],
    ["view_templates", { ...catalog, view_templates: {} }],
  ])("type_catalog: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("type_catalog", body)).toMatchObject({ status: 400, message: expect.stringContaining(`type_catalog: ${path} `) });
  });
  it("refuses a contract its judge could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "contract", { ...contract, ifc_schema: "IFC4X3" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "contract: ifc_schema must be IFC2X3 | IFC4" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

describe("resolveContract — what judges Governed Intake: project → office → none, re-checked", () => {
  const shaOf = (o) => createHash("sha256").update(canonical(o)).digest("hex");
  it("SEC-4 (review C15): a contract installs only under a plain contract_key — the name the platform gate checks it by", async () => {
    const d = memDeps();
    for (const contract_key of ["BDS Pilot 2026", "x · contract sha256:", "a".repeat(101), "ü"])
      await expect(putArtefact("p", "contract", { ...contract, contract_key }, { actor: "x" }, d))
        .rejects.toMatchObject({ status: 400, message: "contract: contract_key must be a plain name (letters, digits, . _ @ -), up to 100 characters" });
    expect(d.docs.size).toBe(0);
    for (const contract_key of ["bds-pilot", "base-default", "office.ifc4_v2@1", "a".repeat(100)])
      await expect(putArtefact("p", "contract", { ...contract, contract_key }, { actor: "x" }, d)).resolves.toBeTruthy();
    // The same rule the delivery-gate component reads a mirrored contract by.
    const gate = readFileSync(new URL("../../CloudComponents/delivery-gate/src/main.js", import.meta.url), "utf8");
    const store = readFileSync(new URL("./artefact-store.mjs", import.meta.url), "utf8");
    for (const src of [gate, store]) expect(src).toContain("const PLAIN_NAME = /^[A-Za-z0-9._@-]{1,100}$/;");
  });
  it("none names the key and its office and carries no body", async () => {
    expect(await resolveContract("aster-villa", memDeps({ parentKey: "aster-office" }))).toEqual({
      body: null, ref: null, source: null, sha256: null,
      label: "none — not installed for aster-villa or its office", reason: "not installed for aster-villa or its office",
    });
  });
  it("the office's contract judges a project that has none; the project's own outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "contract", contract, { actor: "x" }, d);
    expect(await resolveContract("aster-villa", d)).toEqual({
      body: contract, ref: "contract@1", source: "office", sha256: shaOf(contract),
      label: `contract@1 · office · ${shaOf(contract).slice(0, 12)}…`, reason: null,
    });
    const own = { ...contract, ifc_schema: "IFC2X3" };
    await putArtefact("aster-villa", "contract", own, { actor: "x" }, d);
    expect(await resolveContract("aster-villa", d)).toMatchObject({ body: own, ref: "contract@1", source: "project", sha256: shaOf(own) });
  });
  it("a body installed before the validator existed is none with its reason, never a partial contract", async () => {
    const d = memDeps();
    await putArtefact("p", "contract", contract, { actor: "x" }, d);
    const old = { contract_key: "old", ifc_schema: "" };                    // what "any object" let in before 4b-1
    d.docs.get("artefact|uuid-p|contract@1").body = old;
    const r = await resolveContract("p", d);
    expect(r).toMatchObject({ body: null, ref: null, source: null, sha256: null });
    expect(r.reason).toBe(`contract@1 · project · ${shaOf(old).slice(0, 12)}… did not parse: contract: ifc_schema must be IFC2X3 | IFC4`);
    expect(r.label).toBe(`none — ${r.reason}`);
  });
});

// The lead's publish policy (cohesion phase 5, spec Decision 2): exactly {auto: boolean}; none installed = auto off.
// Nothing in 5a reads it (the Revit Publisher does from 5b), so the body carries no field a reader would ignore.
describe("validateArtefact — publish", () => {
  it("accepts exactly {auto: true} and {auto: false}", () => {
    expect(KINDS).toContain("publish");
    expect(validateArtefact("publish", { auto: true })).toBe(true);
    expect(validateArtefact("publish", { auto: false })).toBe(true);
  });
  it.each([
    [{}, "publish: auto must be true or false"],
    [{ auto: "true" }, "publish: auto must be true or false"],
    [{ auto: 1 }, "publish: auto must be true or false"],
    [{ auto: null }, "publish: auto must be true or false"],
    [{ auto: true, mode: "auto" }, "publish: mode is not a publish field — the body is exactly {auto: true} or {auto: false}"],
    [{ enabled: true }, "publish: enabled is not a publish field — the body is exactly {auto: true} or {auto: false}"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("publish", body)).toMatchObject({ status: 400, message });
  });
  it("installs publish@n lead-only and audited; an office's policy reaches a project with none, the project's own outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect((await listArtefacts("aster-tower", d)).publish).toBeNull();
    expect((await artefactReply("aster-tower", "publish", undefined, d)).body.reason).toBe("not_installed");
    await putArtefact("aster-office", "publish", { auto: true }, { actor: "lead@example.test" }, d);
    expect(await artefactReply("aster-tower", "publish", undefined, d)).toMatchObject({ status: 200, body: { kind: "publish", version: 1, ref: "publish@1", source: "office", body: { auto: true } } });
    expect(await putArtefact("aster-tower", "publish", { auto: false }, { actor: "lead@example.test" }, d)).toMatchObject({ kind: "publish", version: 1 });
    expect(await resolveArtefact("aster-tower", "publish", d)).toMatchObject({ source: "project", ref: "publish@1", body: { auto: false } });
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed publish@1", "artefact_installed publish@1"]);
    await expect(putArtefact("aster-tower", "publish", { auto: true }, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
  it("refuses an invalid policy at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "publish", { auto: "yes" }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "publish: auto must be true or false" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

// The office's rate card (cohesion phase 5c, spec Decision 9): the Revit ROI dashboard multiplies the minutes each counted
// kind saves by the ledger's counts. Without roi@n it shows counts and no money, so a key no reader shows is refused.
describe("validateArtefact — roi", () => {
  const roi = { currency: "EUR", hourly_rate: 90, minutes: { delivery_gate: 20, naming: 2, family_heal: 15 }, basis: "office estimate, September 2026" };
  it("accepts the full body, and a one-kind minutes map with no basis", () => {
    expect(KINDS).toContain("roi");
    expect(validateArtefact("roi", roi)).toBe(true);
    expect(validateArtefact("roi", { currency: "GBP", hourly_rate: 0.5, minutes: { naming: 0 }, basis: null })).toBe(true);
  });
  it.each([
    [{ ...roi, currency: "eur" }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, currency: "EURO" }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, currency: undefined }, "roi: currency must be three capital letters, e.g. EUR"],
    [{ ...roi, hourly_rate: 0 }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, hourly_rate: "90" }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, hourly_rate: -1 }, "roi: hourly_rate must be a number greater than 0"],
    [{ ...roi, minutes: undefined }, "roi: minutes must be an object {delivery_gate?, naming?, family_heal?}"],
    [{ ...roi, minutes: [20] }, "roi: minutes must be an object {delivery_gate?, naming?, family_heal?}"],
    [{ ...roi, minutes: {} }, "roi: minutes needs at least one of delivery_gate, naming, family_heal"],
    [{ ...roi, minutes: { naming: -1 } }, "roi: minutes.naming must be a number ≥ 0"],
    [{ ...roi, minutes: { delivery_gate: "20" } }, "roi: minutes.delivery_gate must be a number ≥ 0"],
    [{ ...roi, minutes: { naming: 2, auto_fix: 5 } }, "roi: minutes.auto_fix is not a counted kind — the ledger counts delivery_gate, naming and family_heal only"],
    [{ ...roi, basis: 7 }, "roi: basis must be a string of at most 500 characters"],
    [{ ...roi, basis: "x".repeat(501) }, "roi: basis must be a string of at most 500 characters"],
    [{ ...roi, rate: 90 }, "roi: rate is not a roi field — the body is {currency, hourly_rate, minutes, basis?}"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("roi", body)).toMatchObject({ status: 400, message });
  });
  it("installs roi@1 lead-only and audited; the office's card reaches a project with none; refLabel names it as every kind", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect((await artefactReply("aster-tower", "roi", undefined, d)).body.reason).toBe("not_installed");
    await putArtefact("aster-office", "roi", roi, { actor: "lead@example.test" }, d);
    const r = await resolveArtefact("aster-tower", "roi", d);
    expect(r).toMatchObject({ source: "office", ref: "roi@1", body: roi, pointer_sha_mismatch: false });
    expect(refLabel(r)).toBe(`roi@1 · office · ${r.sha256.slice(0, 12)}…`);
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed roi@1"]);
    await expect(putArtefact("aster-tower", "roi", roi, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
  it("refuses a rate card its reader could not use at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "roi", { ...roi, minutes: {} }, { actor: "x" }, d)).rejects.toMatchObject({ status: 400, message: "roi: minutes needs at least one of delivery_gate, naming, family_heal" });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

// The review chain's template (phase 6b, spec 2026-09-27 Decision 10): exactly {steps}; 0-6 steps, each exactly {name,
// role, approvals}. The database reads it (review_template, migration 0032), so a key it would not read is refused, not
// kept; steps [] is no chain, and a project's own review@n with no steps turns its office's off.
describe("validateArtefact — review", () => {
  const review = { steps: [{ name: "Coordination check", role: "contributor", approvals: 2 }, { name: "Lead sign-off", role: "lead", approvals: 1 }] };
  const step = review.steps[0];
  it("accepts steps of every role, both bounds of every range, and no steps at all", () => {
    expect(KINDS).toContain("review");
    expect(validateArtefact("review", review)).toBe(true);
    expect(validateArtefact("review", { steps: [] })).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: "x".repeat(80), role: ["contributor", "lead", "owner"][i % 3], approvals: i % 2 ? 5 : 1 }));
    expect(validateArtefact("review", { steps: six })).toBe(true);
  });
  it.each([
    [{}, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: null }, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: "lead" }, "review: steps must be an array of 0 to 6 steps"],
    [{ steps: Array.from({ length: 7 }, () => step) }, "review: steps must be an array of 0 to 6 steps"],
    [{ ...review, folder: "Architecture" }, "review: folder is not a review field — the body is exactly {steps: [{name, role, approvals}]}"],
    [{ steps: ["lead"] }, "review: steps[0] must be an object"],
    [{ steps: [{ ...step, due: "5d" }] }, "review: steps[0].due is not a step field — a step is exactly {name, role, approvals}"],
    [{ steps: [{ ...step, name: "" }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [{ ...step, name: "   " }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [{ ...step, name: "x".repeat(81) }] }, "review: steps[0].name must be a non-empty string of at most 80 characters"],
    [{ steps: [step, { ...review.steps[1], role: "viewer" }] }, "review: steps[1].role must be contributor, lead or owner"],
    [{ steps: [{ ...step, role: "Lead" }] }, "review: steps[0].role must be contributor, lead or owner"],
    [{ steps: [{ ...step, approvals: 0 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: 6 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: 1.5 }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ ...step, approvals: "2" }] }, "review: steps[0].approvals must be an integer 1..5"],
    [{ steps: [{ name: "Check", role: "lead" }] }, "review: steps[0].approvals must be an integer 1..5"],
  ])("%j is a 400: %s", (body, message) => {
    expect(fails("review", body)).toMatchObject({ status: 400, message });
  });
  it("installs review@1 lead-only and audited; an office's template reaches a project with none; the project's own steps [] outranks it", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "review", review, { actor: "lead@example.test" }, d);
    expect(await resolveArtefact("aster-tower", "review", d)).toMatchObject({ source: "office", ref: "review@1", body: review });
    await putArtefact("aster-tower", "review", { steps: [] }, { actor: "lead@example.test" }, d);
    expect(await resolveArtefact("aster-tower", "review", d)).toMatchObject({ source: "project", ref: "review@1", body: { steps: [] } });
    expect(d.audits.map((a) => a.action)).toEqual(["artefact_installed review@1", "artefact_installed review@1"]);
    await expect(putArtefact("aster-tower", "review", review, { actor: "x" }, memDeps({ role: "contributor" }))).rejects.toMatchObject({ status: 403 });
  });
});

describe("installed_by comes from the sign-in (cde-13, H0 D6)", () => {
  const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";

  it("a signed-in lead's install names them — on the pointer, in Settings' source and in the ledger row — not ?actor", async () => {
    const d = memDeps();
    const p = await runWithAuth(jwt("lead@example.test"), () => putArtefact("aster-tower", "ids", spec, { actor: "The Director" }, d));
    expect(p.installed_by).toBe("lead@example.test");
    expect(d.docs.get("artefact|uuid-aster-tower|ids").installed_by).toBe("lead@example.test");
    expect(d.audits[0]).toMatchObject({ actor: "lead@example.test", newv: { installed_by: "lead@example.test" } });
  });

  it("the machine credential keeps its label; none is web", async () => {
    const d = memDeps();
    expect((await putArtefact("p", "ids", spec, { actor: "Revit" }, d)).installed_by).toBe("Revit");
    expect((await putArtefact("p", "ids", spec, {}, d)).installed_by).toBe("web");
  });
});

describe("validateArtefact — carbon_factors (item 6, 6D)", () => {
  const ok = { label: "Project EPD set 2026-09", unit_label: "kgCO2e", factors: [{ match: "IFCSLAB", measure: "volume", unit: "m³", factor: 310 }] };
  it("a named pack of factors installs", () => {
    expect(fails("carbon_factors", ok)).toBeNull();
    expect(KINDS).toContain("carbon_factors");
  });
  it.each([
    [{ ...ok, label: "" }, "carbon_factors: label must name the factors' source (EPD, EC3, ICE …) in 1 to 300 characters"],
    [{ ...ok, factors: [] }, "carbon_factors: factors needs at least one {match, measure, unit, factor}"],
    [{ ...ok, factors: [{ ...ok.factors[0], factor: -1 }] }, "carbon_factors: factors[0].factor must be a number ≥ 0 (kgCO₂e per unit)"],
    [{ ...ok, factors: [{ ...ok.factors[0], measure: "mass" }] }, "carbon_factors: factors[0].measure must be one of count, length, area, volume, weight"],
    [{ ...ok, source: "x" }, "carbon_factors: source is not a carbon_factors field — the body is {label, unit_label?, factors}"],
  ])("a pack that could not price honestly is refused in words (%#)", (body, message) => {
    expect(fails("carbon_factors", body)).toMatchObject({ status: 400, message });
  });
});

describe("validateArtefact — lod_matrix (Promote v1, MA-2b)", () => {
  const ok = readRepoJson("demo/bds-pilot/bds-lod-matrix-dd.json");
  const row = (i, over) => withItem(ok, "rows", i, over);
  // MA-2b: the install check is sentinel-core's parseLodMatrix (the bundle); the add-in's LodMatrix.FromBody reads the same cases.
  const cases = JSON.parse(readFileSync(new URL("./fixtures/lod-matrix/cases.json", import.meta.url), "utf8"));
  it("the demo matrix (a v0 body) installs as before", () => {
    expect(fails("lod_matrix", ok)).toBeNull();
    expect(KINDS).toContain("lod_matrix");
  });
  it.each(cases.map((c) => [c.name, c]))("the shared case: %s", (_name, c) => {
    if (c.error === null) expect(validateArtefact("lod_matrix", c.body)).toBe(true);
    else expect(fails("lod_matrix", c.body)).toMatchObject({ status: 400, message: `lod_matrix: ${c.error}` });
  });
  it.each([
    [{ ...ok, source: "x" }, "lod_matrix: source is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}"],
    [row(0, { DD: { ...ok.rows[0].DD, joins: "clean" } }), "lod_matrix: rows[0].DD.joins is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"],
    [row(1, { DD: { ...ok.rows[1].DD, constructor: "x" } }), "lod_matrix: rows[1].DD.constructor is not a DD rule Promote reads — type, level, top, host, properties, type_snap_mm"],
  ])("a matrix Promote would not read as written is refused in words (%#)", (body, message) => {
    expect(fails("lod_matrix", body)).toMatchObject({ status: 400, message });
  });
});

// MA-1a item 6: guideline@n's placement block — a workset per category and the phase. The cases are shared with the
// add-in's loader (tools/promote-check reads the same file), so both sides accept and refuse the same bodies in the same words.
describe("validateArtefact — a guideline's placement block (MA-1a item 6)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/guideline-placement/cases.json", import.meta.url), "utf8"));
  it("holds both kinds of case: accepted and refused", () => {
    expect(cases.filter((c) => c.error === null).length).toBeGreaterThan(0);
    expect(cases.filter((c) => c.error !== null).length).toBeGreaterThan(0);
  });
  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    const body = { ...guideline, placement: c.placement };
    if (c.error === null) expect(validateArtefact("guideline", body)).toBe(true);
    else expect(fails("guideline", body)).toMatchObject({ status: 400, message: `guideline: ${c.error}` });
  });
  it("a guideline with no placement block installs as before", () => {
    expect(validateArtefact("guideline", guideline)).toBe(true);
    expect(guideline).not.toHaveProperty("placement");
  });
});
