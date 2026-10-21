// Human-error guards §2 (spec 2026-10-21): optimistic concurrency on governed rows. A standard's install takes If-Match = the sha in force as
// read (or "none"); a project's write takes If-Match = its version (migration 0048). Stale is a 412 naming who and when; none sent writes as
// before. globalThis.fetch is a fake PostgREST for the project half; the artefact half runs on in-memory deps.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { putArtefact, ifMatchValue, staleChange } from "./artefact-store.mjs";
import { canonicalSha256 as sha } from "./canonical.mjs";
import { patchProjectMeta, updateProject } from "./cde-store.mjs";

function deps(parentKey = null) {
  const docs = new Map();
  const k = (s, p, d) => `${s}|${p}|${d}`;
  return {
    docs,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
    docInsert: async (s, p, d, data) => { if (docs.has(k(s, p, d))) throw Object.assign(new Error("duplicate"), { status: 409 }); docs.set(k(s, p, d), data); },
    docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
    audit: async () => {},
    requireMinRole: async () => {},
    officeKeyOf: async () => parentKey,
    officeArtefact: async (key, kind) => { const p = docs.get(k("artefact", `uuid-${key}`, kind)); return p ? docs.get(k("artefact", `uuid-${key}`, `${kind}@${p.version}`)) ?? null : null; },
  };
}
const policy = (over = {}) => ({ categories: ["OST_Levels"], worksets: [], structural_hosts: true, ...over });

describe("a standard's install with If-Match", () => {
  it("reads the header as sent: quotes and W/ off, nothing sent is null", () => {
    expect([ifMatchValue('"abc"'), ifMatchValue('W/"abc"'), ifMatchValue("abc"), ifMatchValue(undefined), ifMatchValue("  ")]).toEqual(["abc", "abc", "abc", null, null]);
    expect(staleChange("protection was", "ana@x.test", "2026-10-21T14:02:33.1+00:00").message)
      .toBe("protection was changed by ana@x.test at 2026-10-21 14:02 UTC — reload to see it; nothing was saved");
  });

  it("installs on the sha it read, and on \"none\" when nothing was in force", async () => {
    const d = deps();
    const p1 = await putArtefact("p", "protection", policy(), { actor: "ana@x.test", ifMatch: '"none"' }, d);
    const p2 = await putArtefact("p", "protection", policy({ structural_hosts: false }), { actor: "ana@x.test", ifMatch: `"${p1.sha256}"` }, d);
    expect([p1.version, p2.version]).toEqual([1, 2]);
  });

  it("refuses a save on a sha another lead replaced since, naming them — nothing is installed", async () => {
    const d = deps();
    const p1 = await putArtefact("p", "protection", policy(), { actor: "ana@x.test" }, d);
    await putArtefact("p", "protection", policy({ worksets: ["Core"] }), { actor: "ben@x.test" }, d);
    await expect(putArtefact("p", "protection", policy({ structural_hosts: false }), { actor: "ana@x.test", ifMatch: `"${p1.sha256}"` }, d))
      .rejects.toMatchObject({ status: 412, message: expect.stringMatching(/^protection was changed by ben@x\.test at \d{4}-\d\d-\d\d \d\d:\d\d UTC — reload to see it; nothing was saved$/) });
    expect(d.docs.has("artefact|uuid-p|protection@3")).toBe(false);
  });

  it("refuses \"none\" when a standard arrived since — the office's too, by its installer", async () => {
    const d = deps("office");
    await putArtefact("office", "protection", policy(), { actor: "office-lead@x.test" }, d);
    await expect(putArtefact("p", "protection", policy(), { actor: "ana@x.test", ifMatch: "none" }, d))
      .rejects.toMatchObject({ status: 412, message: expect.stringContaining("protection was changed by office-lead@x.test") });
  });

  it("writes as before when no If-Match is sent (scripts, the MCP server, an older add-in)", async () => {
    const d = deps();
    await putArtefact("p", "protection", policy(), { actor: "a" }, d);
    expect((await putArtefact("p", "protection", policy({ worksets: ["X"] }), { actor: "b" }, d)).version).toBe(2);
  });

  it("the sha is the body's canonical sha — what the web form and Revit hold from their read", async () => {
    const d = deps();
    const body = policy();
    const p = await putArtefact("p", "protection", body, { actor: "a" }, d);
    expect(p.sha256).toBe(sha(body));
  });
});

describe("a project's write with If-Match (0048)", () => {
  const P = "11111111-1111-4111-8111-111111111111";
  let project, patches, current;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    project = { id: P, key: "p48", name: "P48", metadata: { settings: {} }, version: 3, updated_by: "ana@x.test", updated_at: "2026-10-21T14:02:00+00:00" };
    current = { ...project };
    patches = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = new URL(String(url));
      const table = u.pathname.replace(/^\/rest\/v1\//, "");
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-range": "0-0/0" } });
      if (table === "projects" && init.method === "PATCH") {
        patches.push(String(url));
        const want = u.searchParams.get("version");
        return json(!want || want === `eq.${current.version}` ? [{ ...current, ...JSON.parse(init.body), version: current.version + 1 }] : []);
      }
      if (table === "projects" && u.searchParams.get("select") === "version,updated_by,updated_at") return json([current]);
      if (table === "projects") return json([project]);
      return json([]);
    });
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("PATCHes on the version the form read", async () => {
    const row = await updateProject("p48", { address: "1 Way" }, "web", { ifMatch: '"3"' });
    expect(patches[0]).toContain("version=eq.3");
    expect(row.version).toBe(4);
  });

  it("refuses before any write when the version read is not the row's, naming who changed it and when", async () => {
    await expect(updateProject("p48", { address: "1 Way" }, "web", { ifMatch: '"2"' }))
      .rejects.toMatchObject({ status: 412, message: "the project's settings were changed by ana@x.test at 2026-10-21 14:02 UTC — reload to see it; nothing was saved" });
    expect(patches).toEqual([]);
  });

  it("a write that lost the race in the database (no row back, the version moved) is the 412, not the 403", async () => {
    current = { ...project, version: 4, updated_by: "ben@x.test", updated_at: "2026-10-21T14:05:00+00:00" };
    await expect(patchProjectMeta("p48", { rate_pack: "uk-2026" }, { ifMatch: "3" }))
      .rejects.toMatchObject({ status: 412, message: "the project's details were changed by ben@x.test at 2026-10-21 14:05 UTC — reload to see it; nothing was saved" });
  });

  it("an If-Match that is not a version is a 400 before any write; none sent writes unfiltered", async () => {
    await expect(updateProject("p48", { address: "x" }, "web", { ifMatch: '"abc"' })).rejects.toMatchObject({ status: 400 });
    await updateProject("p48", { address: "x" }, "web");
    expect(patches).toHaveLength(1);
    expect(patches[0]).not.toContain("version=");
  });

  it("before 0048 is applied (no version on the row) the write goes as it did", async () => {
    delete project.version;
    await updateProject("p48", { address: "x" }, "web", { ifMatch: '"3"' });
    expect(patches[0]).not.toContain("version=");
  });
});
