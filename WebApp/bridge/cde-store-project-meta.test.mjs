// PUT /projects/:key → patchProjectMeta writes under the caller's forwarded session, and the database's projects_update
// policy lets only a lead or owner write: a refused write updates nothing and PostgREST answers 200 with no row. The
// bridge read `.key` off that missing row and answered a 500 (a contributor's Carbon/COBie auto-saves, 2026-09-27).
// A write that stored nothing is a 403 in words; a stored one returns the project's shape. globalThis.fetch is a fake PostgREST.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { patchProjectMeta, updateProject, createProject } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "22222222-0000-4000-8000-00000000000b", email: "c@example.test", role: "authenticated" })).toString("base64url") + ".sig";
const project = { id: P, key: "b13-review", name: "B13 review", metadata: {}, created_at: "2026-09-27T09:00:00+00:00" };

let patchRows, patchBodies;
const realFetch = globalThis.fetch;
beforeEach(() => {
  patchRows = [];
  patchBodies = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-range": "0-0/0" } });
    if (table === "projects" && (init.method || "GET") === "PATCH") { patchBodies.push(JSON.parse(init.body)); return json(patchRows); }
    if (table === "projects") return json([project]);
    return json([]); // audit_log (the project's gate rows): none
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("patchProjectMeta — a project's details are a lead's or owner's to change", () => {
  it("answers a write the database refused (no row back) with a 403 in words, never a 500", async () => {
    await expect(runWithAuth(jwt, () => patchProjectMeta("b13-review", { snapshot: { carbon_tco2e: 12 } })))
      .rejects.toMatchObject({ status: 403, message: "the project's details are changed by a lead or owner — nothing was saved" });
  });

  it("returns the stored project's shape when the write came back", async () => {
    patchRows = [{ ...project, metadata: { snapshot: { carbon_tco2e: 12 } } }];
    const shape = await runWithAuth(jwt, () => patchProjectMeta("b13-review", { snapshot: { carbon_tco2e: 12 } }));
    expect(shape).toMatchObject({ project_id: "b13-review" });
  });
});

describe("createProject — a project key is a slug of words, never a uuid (SEC-4, 0041's projects_key_not_uuid)", () => {
  it("refuses a uuid-shaped key or name in words, before anything is sent", async () => {
    for (const b of [{ name: "0f8fad5b-d9cb-469f-a165-70867728950e" }, { key: "0F8FAD5B-D9CB-469F-A165-70867728950E", name: "x" }])
      await expect(runWithAuth(jwt, () => createProject(b))).rejects.toMatchObject({ status: 400, message: "a project key is not a uuid — choose a name with words in it (nothing was created)" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("updateProject — settings (PATCH /cde/projects/:key)", () => {
  it("answers a settings save the database refused with a 403, never a silent 200 with nothing in it", async () => {
    await expect(runWithAuth(jwt, () => updateProject("b13-review", { archived: true }, "web")))
      .rejects.toMatchObject({ status: 403, message: "the project's settings are changed by a lead or owner — nothing was saved" });
  });

  it("stores the platform project a lead links, and unlinks with null", async () => {
    patchRows = [{ ...project }];
    await updateProject("b13-review", { platform_project_id: "6a4c4df825f9ecf5f416d4c2" }, "web");
    await updateProject("b13-review", { platform_project_id: null }, "web");
    expect(patchBodies.map((b) => b.metadata.settings.platform_project_id)).toEqual(["6a4c4df825f9ecf5f416d4c2", null]);
  });

  it("refuses a platform project id that is not one, before any write", async () => {
    for (const bad of ["", "a b", "x".repeat(101), 42]) {
      await expect(updateProject("b13-review", { platform_project_id: bad }, "web"))
        .rejects.toMatchObject({ status: 400, message: "platform_project_id must be a platform project id (letters, digits, - or _) or null to unlink" });
    }
    expect(patchBodies).toEqual([]);
  });
});
