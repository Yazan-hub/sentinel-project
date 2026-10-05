// SEC-3 (0040): the live pointer is the bridge's — setLiveVersion checks the version is on the project and the caller's role,
// then writes with the service key (a signed-in write of an issued version's pointer is refused by the database); a restore
// carries the lead's reason. globalThis.fetch is a fake PostgREST (fixtures/fake-postgrest.mjs) that also records the bearer
// of each write.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key"; // forwarding armed: a signed-in call would carry the caller's JWT
});

import { fakePostgrest } from "./fixtures/fake-postgrest.mjs";
import { setLiveVersion, registerFileVersion, attachGeometry } from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const C = "cccccccc-0000-4000-8000-000000000001";
const CX = "cccccccc-0000-4000-8000-000000000002";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001";
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const VX = "bbbbbbbb-0000-4000-8000-000000000001";
const SUB = "33333333-0000-4000-8000-000000000001";
const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: SUB, email: "member@example.test" })).toString("base64url") + ".sig";

let db, rest, bearers;
const realFetch = globalThis.fetch;
beforeEach(() => {
  db = {
    projects: [{ id: P, key: "demo" }, { id: OTHER, key: "other" }],
    memberships: [{ project_id: P, user_id: SUB, role: "contributor" }],
    information_containers: [{ id: C, project_id: P, iso_name: "A.ifc", parent_id: null }, { id: CX, project_id: OTHER, iso_name: "X.ifc" }],
    container_versions: [
      { id: V1, container_id: C, revision: "v1", state: "published", is_live: true },
      { id: V2, container_id: C, revision: "v2", state: "wip", is_live: false },
      { id: VX, container_id: CX, revision: "v1", state: "wip", is_live: false },
    ],
  };
  rest = fakePostgrest(db);
  bearers = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    if (init.method === "PATCH") bearers.push(init.headers?.Authorization);
    return rest.fetch(url, init);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });
const patches = () => rest.calls.filter((c) => c.method === "PATCH" && c.table === "container_versions");

describe("setLiveVersion — the live pointer is the bridge's (SEC-3, 0040)", () => {
  it("a signed-in contributor moves it: both writes go with the service key, never the caller's token, then one 'set live' row", async () => {
    expect(await runWithAuth(jwt, () => setLiveVersion("demo", V2, "web"))).toEqual({ ok: true, version_id: V2, container_id: C });
    expect(patches().map((c) => c.body)).toEqual([{ is_live: false }, { is_live: true }]);
    expect(bearers).toHaveLength(2);
    for (const b of bearers) expect(b).not.toBe(`Bearer ${jwt}`);
    expect(db.container_versions.map((v) => v.is_live)).toEqual([false, true, false]);
    expect(rest.calls.filter((c) => c.table === "audit_log").map((c) => c.body.action)).toEqual(["set live"]);
  });

  it("a viewer is refused in the role's words before any write", async () => {
    db.memberships[0].role = "viewer";
    await expect(runWithAuth(jwt, () => setLiveVersion("demo", V2, "web")))
      .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(patches()).toHaveLength(0);
    expect(db.container_versions[0].is_live).toBe(true);
  });

  it("a version of another project is a 400 before any write", async () => {
    await expect(setLiveVersion("demo", VX, "web")).rejects.toMatchObject({ status: 400, message: `version ${VX} is not on demo` });
    expect(patches()).toHaveLength(0);
  });

  it("a registration makes its new version live the same way", async () => {
    const r = await runWithAuth(jwt, () => registerFileVersion("demo", { name: "A.ifc", sha256: "a".repeat(64), author: "web" }));
    expect(r.version.is_live).toBe(true);
    expect(patches().map((c) => c.body)).toEqual([{ is_live: false }, { is_live: true }]);
    for (const b of bearers) expect(b).not.toBe(`Bearer ${jwt}`);
    expect(db.container_versions.filter((v) => v.is_live).map((v) => v.revision)).toEqual(["v3"]);
  });

  it("the outbox's geometry attach writes with the service key, never a caller's token (0040: a version's geometry is the bridge's)", async () => {
    const r = await runWithAuth(jwt, () => attachGeometry("demo", V2, "item-7"));
    expect(r.version.platform_item_id).toBe("item-7");
    expect(patches().map((c) => c.body)).toEqual([{ platform_item_id: "item-7" }]);
    expect(bearers).toHaveLength(1);
    expect(bearers[0]).not.toBe(`Bearer ${jwt}`);
  });

  it("the route, the assistant's tool and the registration name the project the pointer moves in", () => {
    const route = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(route).toContain("return send(res, 200, await cde.setLiveVersion(p1, b.version_id, b.actor));");
    expect(route).toContain("return send(res, 200, await cde.unarchiveFile(p1, b.container_id, b.actor, b.override));");
    expect(readFileSync(new URL("./ai-tools.mjs", import.meta.url), "utf8")).toContain("run: ({ project, version_id, actor }) => cde.setLiveVersion(project, version_id, actor),");
    expect(readFileSync(new URL("./cde-store.mjs", import.meta.url), "utf8")).toContain('await setLiveVersion(key, version.id, b.author || "web");');
  });
});
