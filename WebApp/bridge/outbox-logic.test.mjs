// The outbox watcher (cohesion phase 5a, spec Decision 6; 5b removes the pre-5b register path): the sidecar alone
// decides — unbound, with the advice the watcher prints, or attach to the sidecar's version by id — and attachGeometry
// puts the platform item on that one version of that project, once. globalThis.fetch is a fake PostgREST; no network,
// no That Open.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { outboxDecision } from "./outbox-logic.mjs";
import { readFileSync } from "node:fs";
import { attachGeometry, geometryTarget } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111"; // aster-tower
const Q = "22222222-2222-4222-8222-222222222222"; // another project
const C = "cccccccc-0000-4000-8000-000000000001";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const side = (o) => JSON.stringify(o);

const BIND = "Bind the model to a web project (Revit → Project Setup) and publish again.";

describe("outboxDecision — the sidecar, and nothing else, says where an outbox IFC goes", () => {
  it.each([
    [null, "no sidecar"],
    ['{"project":', "its sidecar is not JSON"],
    ["null", "its sidecar names no project"],
    [side({}), "its sidecar names no project"],
    [side({ project: "  ", version_id: V }), "its sidecar names no project"],
    [side({ project: 7 }), "its sidecar names no project"],
    [side({ project: "aster-tower", version_id: "v3" }), 'its sidecar\'s version_id is not a uuid ("v3")'],
    [side({ project: "aster-tower", version_id: null }), "its sidecar's version_id is not a uuid (null)"],
  ])("%s → unbound: %s — bind the model", (text, reason) => {
    expect(outboxDecision(text)).toEqual({ action: "unbound", reason, advice: BIND });
  });

  it("a sidecar with a version_id attaches to that version on that project", () => {
    expect(outboxDecision(side({ project: " aster-tower ", container: "AST-ARC-M3-ZZ-0001.ifc", version_id: V }))).toEqual({ action: "attach", project: "aster-tower", version_id: V });
  });

  it("a pre-5b sidecar (a project, no version_id key — the add-in that registered by file name) is unbound: update the add-in", () => {
    const legacy = { action: "unbound", reason: "pre-5b sidecar (no version_id)", advice: "Update the add-in and publish again." };
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Aster Tower" }))).toEqual(legacy);
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Link", host: " Tower.ifc " }))).toEqual(legacy);
  });
});

const H = "a".repeat(64), F = "f".repeat(64); // the IFC's sha256 (the version's) and the .frag's
let calls, version, owner, raced;
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const q = u.searchParams;
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path, method, search: decodeURIComponent(u.search), prefer: init.headers?.Prefer ?? null, body });
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  if (path === "projects") return json(q.get("key") === "eq.aster-tower" ? [{ id: P, key: "aster-tower" }] : []);
  if (path === "information_containers")
    return json(q.get("id") === `eq.${C}` && q.get("project_id") === `eq.${owner}` ? [{ iso_name: "AST-ARC-M3-ZZ-0001.ifc" }] : []);
  if (path === "container_versions" && method === "GET") return json(q.get("id") === `eq.${V}` ? [version] : []);
  if (path === "container_versions" && method === "PATCH") {
    if (raced || (q.get("platform_item_id") === "is.null" && version.platform_item_id !== null)) return json([]);
    version = { ...version, ...body };
    return json([version]);
  }
  if (path === "audit_log" && method === "POST") return json([{ id: 905, ...body }], 201);
  return json([]);
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = []; owner = P; raced = false;
  version = { id: V, container_id: C, revision: "P01", is_live: true, platform_item_id: null, sha256: H };
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });
const writes = () => calls.filter((c) => c.method !== "GET");

describe("attachGeometry — the uploaded item goes on the sidecar's version, by id, once", () => {
  it("attaches the item to that version and names the ledger row", async () => {
    const r = await attachGeometry("aster-tower", V, "item-42", { sha256: H, frag_sha256: F });
    expect(r).toEqual({ container_id: C, iso_name: "AST-ARC-M3-ZZ-0001.ifc", linked: true, version: { id: V, revision: "P01", platform_item_id: "item-42", is_live: true }, audit_id: 905 });
    const [patch, row] = writes();
    expect(patch).toMatchObject({ path: "container_versions", method: "PATCH", search: `?id=eq.${V}&platform_item_id=is.null`, body: { platform_item_id: "item-42" } });
    expect(row).toMatchObject({ path: "audit_log", prefer: "return=representation" });
    expect(row.body).toMatchObject({ project_id: P, entity_type: "file_version", entity_id: V, action: "geometry linked", actor: "outbox", new_value: { file: "AST-ARC-M3-ZZ-0001.ifc", platform_item_id: "item-42", by: "version_id", ifc_sha256: H, frag_sha256: F } });
  });

  it("SEC-5: records the IFC's platform item beside the hashes when it is given", async () => {
    await attachGeometry("aster-tower", V, "item-42", { sha256: H, frag_sha256: F, ifc_item_id: "item-43" });
    expect(writes()[1].body.new_value).toMatchObject({ platform_item_id: "item-42", ifc_sha256: H, frag_sha256: F, ifc_item_id: "item-43" });
  });

  it("SEC-5 (0042): an item another version already names is a 409 in words, and no 'geometry linked' row", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (init.method === "PATCH"
      ? new Response(JSON.stringify({ code: "23505", message: 'duplicate key value violates unique constraint "container_versions_one_item"' }), { status: 409 })
      : real(url, init)));
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: H })).rejects.toMatchObject({ status: 409, message: "platform item item-42 is already another version's geometry — nothing was linked" });
    expect(calls.filter((c) => c.path === "audit_log")).toHaveLength(0);
  });

  it("a version of another project is a 400 and nothing is written", async () => {
    owner = Q;
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: H })).rejects.toMatchObject({ status: 400, message: `version ${V} is not on aster-tower` });
    expect(writes()).toHaveLength(0);
  });

  it("a malformed version id is the same 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", "v3", "item-42", { sha256: H })).rejects.toMatchObject({ status: 400, message: "version v3 is not on aster-tower" });
    expect(calls).toHaveLength(0);
  });

  it("no platform item is a 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", V, "  ", { sha256: H })).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    await expect(attachGeometry("aster-tower", V, undefined, { sha256: H })).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    expect(calls).toHaveLength(0);
  });

  it("a version that already has geometry is a 409 naming its item; nothing is written", async () => {
    version.platform_item_id = "item-old";
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: H })).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry (platform item item-old) — a version's geometry is attached once` });
    expect(writes()).toHaveLength(0);
  });

  it("an attach that lost a race to another one is the same 409, with no ledger row", async () => {
    raced = true;
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: H })).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry — a version's geometry is attached once` });
    expect(writes().map((c) => c.path)).toEqual(["container_versions"]);
  });
});

describe("SEC-4: the item is linked only to the version its bytes were registered as (geometryTarget, attachGeometry)", () => {
  it("no sha256 for the uploaded bytes is a 400, before any read", async () => {
    for (const sha256 of [undefined, "", "abc", "g".repeat(64)])
      await expect(attachGeometry("aster-tower", V, "item-42", { sha256 })).rejects.toMatchObject({ status: 400, message: "the uploaded file's sha256 is required (64 hex characters) — nothing was linked" });
    expect(calls).toHaveLength(0);
  });

  it("a version registered without a sha256 takes no geometry (founder decision L-a); nothing is written", async () => {
    version.sha256 = null;
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: H })).rejects.toMatchObject({ status: 409, message: `version ${V} was registered without a sha256, so no geometry is linked to it — nothing was linked` });
    expect(writes()).toHaveLength(0);
  });

  it("bytes other than the version's are a 409; nothing is written", async () => {
    await expect(attachGeometry("aster-tower", V, "item-42", { sha256: "b".repeat(64) })).rejects.toMatchObject({ status: 409, message: `the file's sha256 is not the one version ${V} was registered with — nothing was linked` });
    expect(writes()).toHaveLength(0);
  });

  it("the hash is compared without regard to case", async () => {
    const r = await attachGeometry("aster-tower", V, "item-42", { sha256: H.toUpperCase() });
    expect(r.linked).toBe(true);
  });

  it("geometryTarget answers the same refusals and writes nothing — the watcher asks it before it uploads", async () => {
    await expect(geometryTarget("aster-tower", V, "b".repeat(64))).rejects.toMatchObject({ status: 409 });
    const ok = await geometryTarget("aster-tower", V, H);
    expect(ok.v.id).toBe(V);
    expect(writes()).toHaveLength(0);
  });

  it("the watcher hashes the IFC, asks before any upload, makes the .frag from the same bytes and links with both hashes", () => {
    const src = readFileSync(new URL("./watch-outbox.mjs", import.meta.url), "utf8").replace(/\r/g, "");
    const ask = src.indexOf("await cde.geometryTarget(d.project, d.version_id, ifcSha);");
    expect(ask).toBeGreaterThan(0);
    for (const upload of ["await uploadBytes(client, cfg.projectId, fragBytes, fragName)", "await uploadBytes(client, cfg.projectId, ifcBytes, name)"])
      expect(src.indexOf(upload), upload).toBeGreaterThan(ask);
    expect(src).toContain("const fragBytes = await ifcBytesToFrag(new Uint8Array(ifcBytes));");
    expect(src).toContain("await cde.attachGeometry(d.project, d.version_id, itemId, hashes);");
    // SEC-5: the delivered IFC's item is recorded on the link (a lead's judge-again reads the version's own bytes there).
    // Review C1: the raw-IFC fallback links the IFC itself — its item is recorded too, so Open 3D checks it.
    expect(src).toContain("const reg = await recordVersion(d, name, result?.item?._id, { sha256: ifcSha, ifc_item_id: result?.item?._id });");
    expect(src).toContain("const hashes = { sha256: ifcSha, frag_sha256: createHash(\"sha256\").update(fragBytes).digest(\"hex\"), ...(beside.ifcItemId ? { ifc_item_id: beside.ifcItemId } : {}) };");
    expect(src).not.toContain("ifcToFrag(p)");
    expect(src).not.toContain("uploadFile(");
  });

  it("SEC-4 (review C17): only geometryTarget's refusals (400, 404, 409) park the IFC; any other failure leaves it in the outbox for the next sweep", () => {
    const src = readFileSync(new URL("./watch-outbox.mjs", import.meta.url), "utf8").replace(/\r/g, "");
    const ask = src.indexOf("await cde.geometryTarget(d.project, d.version_id, ifcSha);");
    const handler = src.slice(ask, src.indexOf("console.log(`[${ts()}] uploading", ask));
    expect(handler).toContain("if ([400, 404, 409].includes(e?.status)) await park(");
    expect(handler).toContain("kept in the outbox for the next sweep");
    expect(handler.match(/await park\(/g)).toHaveLength(1);
  });
});
