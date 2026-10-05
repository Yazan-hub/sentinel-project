// Publishing reads the verdict (cohesion phase 5a, spec Decision 5; migration 0031): the bridge side. transition()
// sends the lead's reason only when there is one and answers cde_transition's refusal as a 409 in the function's
// own words; a key scopes the version to its project; unarchiving restores through the function; a registration
// always starts in wip and attaches geometry only when asked. globalThis.fetch is a fake PostgREST — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { transition, versionOnKey, archiveFile, unarchiveFile, registerFileVersion } from "./cde-store.mjs";

const DEMO = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const C1 = "cccccccc-0000-4000-8000-000000000001";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001"; // demo's
const V2 = "aaaaaaaa-0000-4000-8000-000000000002"; // demo's, archived
const VX = "bbbbbbbb-0000-4000-8000-000000000001"; // the other project's
const V3 = "aaaaaaaa-0000-4000-8000-000000000003"; // what a registration creates
const V4 = "aaaaaaaa-0000-4000-8000-000000000004"; // demo's, a second archived version
const NEEDS = `version ${V1} has no accepted verdict that measured something (latest: none) — publishing it needs the lead's reason`;

let calls, rpc, versions;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ path, search: decodeURIComponent(u.search), method, body });
  const q = u.searchParams;
  if (path === "projects") return json(q.get("key") === "eq.demo" ? [{ id: DEMO, key: "demo" }] : []);
  if (path === "rpc/cde_transition") return rpc(body);
  if (path === "container_versions" && method === "GET" && q.get("select")?.includes("information_containers")) {
    const id = q.get("id").slice(3);
    const project_id = { [V1]: DEMO, [V2]: DEMO, [V3]: DEMO, [V4]: DEMO, [VX]: OTHER }[id];
    return json(project_id ? [{ id, container_id: C1, revision: "v1", state: "shared", information_containers: { project_id } }] : []);
  }
  if (path === "information_containers" && q.get("select")?.startsWith("id,iso_name,folder_id,parent_id,deleted_at,container_versions("))
    return json([{ id: C1, iso_name: "A.ifc", container_versions: versions }]);
  if (path === "information_containers" && q.get("iso_name"))
    return json([{ id: C1, parent_id: null, container_versions: [{ id: V1, revision: "v1", is_live: true, platform_item_id: null }] }]);
  if (path === "information_containers" && q.get("id")) return json([{ project_id: DEMO, iso_name: "A.ifc" }]);
  if (path === "container_versions" && method === "POST") return json([{ ...body, id: V3 }], 201);
  if (path === "container_versions" && method === "GET") return json([{ id: V1, container_id: C1, revision: "v1" }]);
  // A PATCH the database made answers its row (the stores ask with return=representation; requireRows reads none as a refusal).
  if (method === "PATCH") return json([{ id: q.get("id")?.slice(3) ?? null, ...body }]);
  return json([]);
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  rpc = (body) => json({ id: body.p_version, state: body.p_new_state });
  versions = [{ id: V1, state: "published" }, { id: V2, state: "archived" }];
  globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init));
});
afterEach(() => { globalThis.fetch = realFetch; });
const rpcCalls = () => calls.filter((c) => c.path === "rpc/cde_transition");
const pgError = (status, code, message) => () => json({ code, details: null, hint: null, message }, status);

describe("transition — the lead's reason, and cde_transition's refusals in its own words", () => {
  it("sends p_override only when the reason is not blank, trimmed", async () => {
    await transition(null, V1, "published", { actor: "web", note: "Publish →", override: "  client signed off by email  " });
    expect(rpcCalls()[0].body).toEqual({ p_version: V1, p_new_state: "published", p_actor: "web", p_note: "Publish →", p_override: "client signed off by email" });
    await transition(null, V1, "published", { actor: "web", note: "Publish →", override: "   " });
    await transition(null, V1, "shared", { note: "Share →" });
    expect(rpcCalls()[1].body).not.toHaveProperty("p_override");
    expect(rpcCalls()[2].body).toEqual({ p_version: V1, p_new_state: "shared", p_actor: "web", p_note: "Share →" });
  });

  it("a refusal (P0001) is a 409 with the function's message", async () => {
    rpc = pgError(400, "P0001", NEEDS);
    await expect(transition(null, V1, "published", { note: "Publish →" })).rejects.toMatchObject({ status: 409, message: NEEDS });
  });

  it("an unknown version (P0002) is a 404 and a role refusal (42501) a 403, each in the function's words", async () => {
    rpc = pgError(400, "P0002", `version ${V1} not found`);
    await expect(transition(null, V1, "shared")).rejects.toMatchObject({ status: 404, message: `version ${V1} not found` });
    rpc = pgError(403, "42501", "insufficient role to transition (needs lead or owner)");
    await expect(transition(null, V1, "published")).rejects.toMatchObject({ status: 403, message: "insufficient role to transition (needs lead or owner)" });
  });

  it("any other failure stays the bridge's error (a 500 at the route, scrubbed)", async () => {
    rpc = pgError(404, "PGRST202", "Could not find the function public.cde_transition");
    const e = await transition(null, V1, "published", { override: "reason" }).catch((x) => x);
    expect(e.status).toBeUndefined();
    expect(e.message).toMatch(/^Supabase 404: /);
  });

  it("an override that is not a string is a 400 before any call — it would be recorded as '[object Object]' or '5'", async () => {
    for (const override of [{ reason: "x" }, 5, true, ["x"]])
      await expect(transition(null, V1, "published", { override })).rejects.toMatchObject({ status: 400, message: "override must be a string — the lead's reason to publish" });
    expect(calls).toHaveLength(0);
    await transition(null, V1, "published", { override: null });
    expect(rpcCalls()[0].body).not.toHaveProperty("p_override");
  });

  it("a malformed id is a 404 before any call", async () => {
    await expect(transition(null, "nope", "shared")).rejects.toMatchObject({ status: 404, message: "version not found" });
    expect(calls).toHaveLength(0);
  });

  it("a key scopes the version: another project's version is a 400 and nothing is transitioned", async () => {
    await expect(transition("demo", VX, "published", { override: "x" })).rejects.toMatchObject({ status: 400, message: `version ${VX} is not on demo` });
    expect(rpcCalls()).toHaveLength(0);
    await transition("demo", V1, "shared");
    expect(rpcCalls()).toHaveLength(1);
  });

  it("versionOnKey answers the version on the key's project, and a 400 for any other id", async () => {
    expect(await versionOnKey("demo", V1)).toEqual({ proj: { id: DEMO, key: "demo" }, version: { id: V1, container_id: C1, revision: "v1", state: "shared" } });
    await expect(versionOnKey("demo", "nope")).rejects.toMatchObject({ status: 400, message: "version nope is not on demo" });
    await expect(versionOnKey("demo", "aaaaaaaa-0000-4000-8000-00000000dead")).rejects.toMatchObject({ status: 400 });
  });
});

describe("archive and restore go through cde_transition", () => {
  it("archiveFile archives the published version with the note 'file archived'", async () => {
    expect(await archiveFile("demo", C1, "lead@bds.jo")).toEqual({ ok: true, archived: 1, discarded: 0 });
    expect(rpcCalls().map((c) => c.body)).toEqual([{ p_version: V1, p_new_state: "archived", p_actor: "lead@bds.jo", p_note: "file archived" }]);
  });

  it("unarchiveFile restores each archived version through the function — never a state PATCH", async () => {
    expect(await unarchiveFile("demo", C1, "lead@bds.jo")).toEqual({ ok: true, restored: 1 });
    expect(rpcCalls().map((c) => c.body)).toEqual([{ p_version: V2, p_new_state: "published", p_actor: "lead@bds.jo", p_note: "file restored" }]);
    expect(calls.filter((c) => c.method === "PATCH" && c.body && "state" in c.body)).toHaveLength(0);
    expect(calls.find((c) => c.path === "audit_log" && c.body?.action === "unarchived").body.new_value).toEqual({ iso_name: "A.ifc", restored: 1 });
  });

  it("a refused restore stops the loop with the function's words", async () => {
    versions = [{ id: V2, state: "archived" }, { id: V4, state: "archived" }];
    rpc = pgError(403, "42501", "insufficient role to transition (needs lead or owner)");
    await expect(unarchiveFile("demo", C1, "viewer@bds.jo")).rejects.toMatchObject({ status: 403, message: "insufficient role to transition (needs lead or owner)" });
    expect(rpcCalls().map((c) => c.body.p_version)).toEqual([V2]); // V4 is never tried
    expect(calls.find((c) => c.path === "audit_log" && c.body?.action === "unarchived")).toBeUndefined();
  });

  it("SEC-3: a restore that needs the lead's reason answers the function's words; the reason goes to every restore of the file", async () => {
    versions = [{ id: V2, state: "archived" }, { id: V4, state: "archived" }];
    const ask = `version ${V2} has no accepted verdict that measured something (latest: none) — restoring it needs the lead's reason`;
    rpc = pgError(400, "P0001", ask);
    await expect(unarchiveFile("demo", C1, "lead@bds.jo")).rejects.toMatchObject({ status: 409, message: ask });
    rpc = (body) => json({ id: body.p_version, state: body.p_new_state });
    expect(await unarchiveFile("demo", C1, "lead@bds.jo", "  client sign-off 2026-10-05 ")).toEqual({ ok: true, restored: 2 });
    expect(rpcCalls().slice(1).map((c) => c.body)).toEqual([V2, V4].map((v) =>
      ({ p_version: v, p_new_state: "published", p_actor: "lead@bds.jo", p_note: "file restored", p_override: "client sign-off 2026-10-05" })));
  });

  it("SEC-3: a restore refused after others succeeded records what was restored and says how many, in the function's words", async () => {
    versions = [{ id: V2, state: "archived" }, { id: V4, state: "archived" }];
    const ask = `version ${V4} has no accepted verdict that measured something (latest: none) — restoring it needs the lead's reason`;
    rpc = (body) => (body.p_version === V4 ? pgError(400, "P0001", ask)() : json({ id: body.p_version, state: body.p_new_state }));
    await expect(unarchiveFile("demo", C1, "lead@bds.jo")).rejects.toMatchObject({ status: 409, message: `1 of 2 archived versions restored — ${ask}` });
    expect(calls.find((c) => c.path === "audit_log" && c.body?.action === "unarchived").body.new_value).toEqual({ iso_name: "A.ifc", restored: 1 });
  });
});

describe("registerFileVersion — every new version starts in wip; geometry is the bridge's, by version id", () => {
  it("ignores a state in the body: the version is posted in wip", async () => {
    await registerFileVersion("demo", { name: "A.ifc", state: "published", author: "web" });
    expect(calls.find((c) => c.path === "container_versions" && c.method === "POST").body.state).toBe("wip");
  });

  it("a platform item without attach_geometry is a new version, never attached to the live one", async () => {
    const r = await registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", author: "web" });
    expect(r.linked).toBeUndefined();
    expect(calls.find((c) => c.path === "container_versions" && c.method === "POST").body).toMatchObject({ platform_item_id: "item-9", state: "wip" });
    expect(calls.filter((c) => c.method === "PATCH" && c.body?.platform_item_id)).toHaveLength(0);
  });

  it("attach_geometry: true is refused in words before anything is written", async () => {
    await expect(registerFileVersion("demo", { name: "A.ifc", platform_item_id: "item-9", author: "outbox", attach_geometry: true }))
      .rejects.toMatchObject({ status: 400, message: "geometry is attached by the bridge to the version an upload names — nothing was saved" });
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});
