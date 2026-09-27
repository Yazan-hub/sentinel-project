// D3 (H0, migration 0033) in createProject and updateProject (POST /cde/projects, PATCH /cde/projects/:key): any
// signed-in account could create a project inside another company's office, or re-point one it owned there, and then
// read that office's standards through the office fallback (cde-1, cde-rem-1) and turn its rollups to 'error'
// (bimdocs-5); any owner could make a project an office. The bridge now asks first and refuses in words before any
// write. globalThis.fetch is a fake PostgREST: service-key reads see every row, forwarded ones carry the caller's JWT.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { createProject, updateProject } from "./cde-store.mjs";

const ATTACH = "attaching a project to an office needs the lead role on that office — nothing was saved";
const OFFICE_WORDS = "an office is created by a platform admin — nothing was saved";
const OFFICE_ID = "33333333-3333-4333-8333-333333333333";
const P = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "55555555-5555-4555-8555-555555555555";
const LEAD = "44444444-0000-4000-8000-00000000000a";     // lead of the office
const STRANGER = "44444444-0000-4000-8000-00000000000b"; // member of nothing in the office
const ADMIN = "44444444-0000-4000-8000-00000000000c";    // platform admin
const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email: `${sub}@example.test`, role: "authenticated" })).toString("base64url") + ".sig";
const signedIn = (auth) => [LEAD, STRANGER, ADMIN].some((s) => auth === `Bearer ${jwt(s)}`);

let project, created, posts, patches, rpcCalls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  project = { id: P, key: "tower", name: "Tower", kind: "project", office_key: null, metadata: {} };
  created = null; posts = []; patches = []; rpcCalls = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const auth = init.headers?.Authorization || "";
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-range": "0-0/0" } });
    if (table === "rpc/is_platform_admin") { rpcCalls++; return json(auth === `Bearer ${jwt(ADMIN)}`); }
    if (table === "projects" && method === "POST") {
      const b = JSON.parse(init.body);
      posts.push(b);
      created = { id: NEW_ID, metadata: {}, ...b };
      return new Response(null, { status: 201 });
    }
    if (table === "projects" && method === "PATCH") {
      const b = JSON.parse(init.body);
      patches.push(b);
      return json([{ ...project, ...b }]);
    }
    if (table === "projects") {
      const key = (u.searchParams.get("key") || "").replace(/^eq\./, "");
      if (u.searchParams.get("id")) return json([{ id: P }]);                   // ensureProject's forwarded visibility read
      if (key === "office-a") return json([{ id: OFFICE_ID, key, kind: "office" }]);
      if (key === "tower") return json([project]);
      if (key === "annex") return json(created && !signedIn(auth) ? [created] : []); // absent until inserted; re-read with the service key
      return json([]);
    }
    if (table === "memberships") return json(u.searchParams.get("project_id") === `eq.${OFFICE_ID}` ? [{ user_id: LEAD, role: "lead" }] : []);
    if (table === "folders") return json([{ id: "f-1" }]);
    if (table === "audit_log") return json([{ id: 1, hash: "h" }]);
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("createProject — POST /cde/projects", () => {
  it("refuses a stranger who names another company's office, before anything is written", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => createProject({ name: "annex", office_key: "office-a" })))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(posts).toEqual([]);
  });

  it("answers an office key that does not exist in the same words", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => createProject({ name: "annex", office_key: "no-such-office" })))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(posts).toEqual([]);
  });

  it("lets the office's lead create a project inside it", async () => {
    await runWithAuth(jwt(LEAD), () => createProject({ name: "annex", office_key: " office-a " }));
    expect(posts).toMatchObject([{ key: "annex", kind: "project", office_key: "office-a" }]);
  });

  it("refuses an office to a signed-in caller who is not a platform admin", async () => {
    await expect(runWithAuth(jwt(LEAD), () => createProject({ name: "annex", kind: "office" })))
      .rejects.toMatchObject({ status: 403, message: OFFICE_WORDS });
    expect(posts).toEqual([]);
  });

  it("lets a platform admin create an office", async () => {
    await runWithAuth(jwt(ADMIN), () => createProject({ name: "annex", kind: "office" }));
    expect(posts).toMatchObject([{ key: "annex", kind: "office", office_key: null }]);
  });

  it("the machine credential creates either without being asked", async () => {
    await createProject({ name: "annex", office_key: "office-a" });
    expect(posts).toMatchObject([{ key: "annex", office_key: "office-a" }]);
    expect(rpcCalls).toBe(0);
  });
});

describe("updateProject — PATCH /cde/projects/:key", () => {
  it("refuses a project lead who re-points it into an office they do not lead, before the PATCH", async () => {
    await expect(runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "office-a" }, "web")))
      .rejects.toMatchObject({ status: 403, message: ATTACH });
    expect(patches).toEqual([]);
  });

  it("does not ask about an office_key the project already has, nor about detaching", async () => {
    project.office_key = "office-a";
    await runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "office-a", name: "Tower B" }, "web"));
    await runWithAuth(jwt(STRANGER), () => updateProject("tower", { office_key: "  " }, "web"));
    expect(patches).toEqual([{ name: "Tower B", office_key: "office-a" }, { office_key: null }]);
    expect(rpcCalls).toBe(0);
  });

  it("refuses turning a project into an office to a caller who is not a platform admin", async () => {
    await expect(runWithAuth(jwt(LEAD), () => updateProject("tower", { kind: "office" }, "web")))
      .rejects.toMatchObject({ status: 403, message: OFFICE_WORDS });
    expect(patches).toEqual([]);
  });

  it("lets the office's lead attach the project", async () => {
    await runWithAuth(jwt(LEAD), () => updateProject("tower", { office_key: "office-a" }, "web"));
    expect(patches).toEqual([{ office_key: "office-a" }]);
  });
});
