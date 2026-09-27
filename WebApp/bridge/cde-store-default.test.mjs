// "default" is the system fallback project, and it self-heals so a wiped database cannot brick zero-config publishing.
// The self-heal is the machine's only (D9): under a signed-in caller's JWT the insert would make that caller its owner
// (0004's trigger bootstraps auth.uid()), so a signed-in caller meets an absent "default" as any absent key, and never
// creates it through POST /cde/projects either. globalThis.fetch is a fake PostgREST that knows no project.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { ensureProject, createProject, projectNotFound } from "./cde-store.mjs";

const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-00000000000c", email: "s@example.test", role: "authenticated" })).toString("base64url") + ".sig";
const DEFAULT = { id: "44444444-4444-4444-8444-444444444444", key: "default", name: "default" };

let calls, created;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  created = false;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ method, path: new URL(String(url)).pathname, auth: init.headers?.Authorization });
    if (method === "POST") { created = true; return new Response("", { status: 201 }); }
    return new Response(JSON.stringify(created ? [DEFAULT] : []), { status: 200 });
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("ensureProject('default') — the self-heal is the machine's", () => {
  it("a signed-in caller gets the unknown key's 404 (projectNotFound) and nothing is inserted", async () => {
    await expect(runWithAuth(jwt, () => ensureProject("default")))
      .rejects.toMatchObject({ status: 404, message: projectNotFound("default").message });
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("the machine (no JWT) recreates it with the service key, so no owner is bootstrapped", async () => {
    expect(await ensureProject("default")).toEqual(DEFAULT);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].auth).not.toBe(`Bearer ${jwt}`);
  });
});

describe("createProject — 'default' is not a signed-in caller's to create", () => {
  it("is a 403 in words before any call", async () => {
    await expect(runWithAuth(jwt, () => createProject({ key: "default" })))
      .rejects.toMatchObject({ status: 403, message: "'default' is the system fallback project — choose another key; nothing was created" });
    expect(calls).toEqual([]);
  });
});
