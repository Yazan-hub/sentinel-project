// The outbox watcher (cohesion phase 5a, spec Decision 6): the sidecar alone decides — unbound, attach to the
// sidecar's version by id, or the pre-5b register path — and attachGeometry puts the platform item on that one
// version of that project, once. globalThis.fetch is a fake PostgREST; no network, no That Open.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { outboxDecision } from "./outbox-logic.mjs";
import { attachGeometry, registerFileVersion } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111"; // aster-tower
const Q = "22222222-2222-4222-8222-222222222222"; // another project
const C = "cccccccc-0000-4000-8000-000000000001";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const side = (o) => JSON.stringify(o);

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
  ])("%s → unbound: %s", (text, reason) => {
    expect(outboxDecision(text)).toEqual({ action: "unbound", reason });
  });

  it("a sidecar with a version_id attaches to that version on that project", () => {
    expect(outboxDecision(side({ project: " aster-tower ", container: "AST-ARC-M3-ZZ-0001.ifc", version_id: V }))).toEqual({ action: "attach", project: "aster-tower", version_id: V });
  });

  it("a pre-5b sidecar (no version_id key) registers by file name, with its host when it names one", () => {
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Aster Tower" }))).toEqual({ action: "register", project: "aster-tower", host: null });
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Link", host: " Tower.ifc " }))).toEqual({ action: "register", project: "aster-tower", host: "Tower.ifc" });
  });
});

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
  if (path === "information_containers" && q.get("iso_name")) // registerFileVersion's by-name lookup
    return json([{ id: C, parent_id: null, container_versions: [{ id: V, revision: version.revision, is_live: true, platform_item_id: version.platform_item_id }] }]);
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
  version = { id: V, container_id: C, revision: "P01", is_live: true, platform_item_id: null };
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });
const writes = () => calls.filter((c) => c.method !== "GET");

describe("attachGeometry — the uploaded item goes on the sidecar's version, by id, once", () => {
  it("attaches the item to that version and names the ledger row", async () => {
    const r = await attachGeometry("aster-tower", V, "item-42");
    expect(r).toEqual({ container_id: C, iso_name: "AST-ARC-M3-ZZ-0001.ifc", linked: true, version: { id: V, revision: "P01", platform_item_id: "item-42", is_live: true }, audit_id: 905 });
    const [patch, row] = writes();
    expect(patch).toMatchObject({ path: "container_versions", method: "PATCH", search: `?id=eq.${V}&platform_item_id=is.null`, body: { platform_item_id: "item-42" } });
    expect(row).toMatchObject({ path: "audit_log", prefer: "return=representation" });
    expect(row.body).toMatchObject({ project_id: P, entity_type: "file_version", entity_id: V, action: "geometry linked", actor: "outbox", new_value: { file: "AST-ARC-M3-ZZ-0001.ifc", platform_item_id: "item-42", by: "version_id" } });
  });

  it("a version of another project is a 400 and nothing is written", async () => {
    owner = Q;
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 400, message: `version ${V} is not on aster-tower` });
    expect(writes()).toHaveLength(0);
  });

  it("a malformed version id is the same 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", "v3", "item-42")).rejects.toMatchObject({ status: 400, message: "version v3 is not on aster-tower" });
    expect(calls).toHaveLength(0);
  });

  it("no platform item is a 400, before any read", async () => {
    await expect(attachGeometry("aster-tower", V, "  ")).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    await expect(attachGeometry("aster-tower", V, undefined)).rejects.toMatchObject({ status: 400, message: "platform_item_id required" });
    expect(calls).toHaveLength(0);
  });

  it("a version that already has geometry is a 409 naming its item; nothing is written", async () => {
    version.platform_item_id = "item-old";
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry (platform item item-old) — a version's geometry is attached once` });
    expect(writes()).toHaveLength(0);
  });

  it("an attach that lost a race to another one is the same 409, with no ledger row", async () => {
    raced = true;
    await expect(attachGeometry("aster-tower", V, "item-42")).rejects.toMatchObject({ status: 409, message: `version ${V} already has geometry — a version's geometry is attached once` });
    expect(writes().map((c) => c.path)).toEqual(["container_versions"]);
  });
});

describe("the pre-5b path — registerFileVersion with attach_geometry: true", () => {
  it("still attaches by name to the live version without geometry (the watcher spells the flag out)", async () => {
    version.revision = "v1";
    const r = await registerFileVersion("aster-tower", { name: "AST-ARC-M3-ZZ-0001.ifc", author: "outbox", size_bytes: 10, platform_item_id: "item-7", attach_geometry: true });
    expect(r).toMatchObject({ container_id: C, linked: true, version: { id: V, platform_item_id: "item-7" } });
    expect(writes().map((c) => [c.path, c.method])).toEqual([["container_versions", "PATCH"], ["audit_log", "POST"]]);
  });
});
