// One answer for "absent" and "not yours" (D7; audit ai-3, projects-2, cde-9). ensureProject answered a signed-in
// non-member 403 "not a member" and an unknown key 404 "does not exist", so any account could walk the key space (keys
// are slugs of names). createProject turned a key taken by someone else's project into a scrubbed 500 (the unique
// violation has no status). globalThis.fetch is a fake PostgREST: "alpha" (u-member is a member) and "beta" (not).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured" and forwarding armed. fetch is faked either way, so none of them is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  process.env.SUPABASE_ANON_KEY ||= "fixture-anon-key";
});

import { runWithAuth } from "./bridge-auth.mjs";
import { ensureProject, createProject, projectNotFound, docList, docListLazy, bcfListTopics } from "./cde-store.mjs";

const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub, email: `${sub}@example.test`, role: "authenticated" })).toString("base64url") + ".sig";
const PROJECTS = [{ id: "11111111-1111-4111-8111-111111111111", key: "alpha" }, { id: "22222222-2222-4222-8222-222222222222", key: "beta" }];
const MEMBER_OF = { "u-member": ["alpha"] };

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    let sub = null; // null: the service key (a legacy service key is a JWT too, but it carries no sub)
    try { sub = JSON.parse(Buffer.from(String(init.headers?.Authorization || "").split(".")[1], "base64url")).sub ?? null; } catch { /* not a JWT: the service key */ }
    calls.push({ table, method, sub });
    const q = (k) => u.searchParams.get(k);
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (table === "projects" && method === "GET") {
      return json(PROJECTS.filter((p) => (sub === null || (MEMBER_OF[sub] || []).includes(p.key))
        && (!q("key") || q("key") === `eq.${p.key}`) && (!q("id") || q("id") === `eq.${p.id}`)));
    }
    // projects.key is unique (0001_cde_core_c1.sql): a key the caller cannot see still exists.
    if (table === "projects" && method === "POST") return json({ code: "23505", details: null, hint: null, message: 'duplicate key value violates unique constraint "projects_key_key"' }, 409);
    // bridge_docs_write (0030) refuses a non-member's insert; the service key writes (used by READS-2).
    if (table === "bridge_docs" && method === "POST") return sub === null ? new Response(null, { status: 201 }) : json({ code: "42501", details: null, hint: null, message: 'new row violates row-level security policy for table "bridge_docs"' }, 403);
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("ensureProject — one answer for an absent project and one that is not yours", () => {
  it("a signed-in non-member gets exactly the unknown key's 404", async () => {
    const notYours = await runWithAuth(jwt("u-member"), () => ensureProject("beta")).catch((e) => e);
    const absent = await runWithAuth(jwt("u-member"), () => ensureProject("gamma")).catch((e) => e);
    expect(notYours).toMatchObject({ status: 404, message: projectNotFound("beta").message });
    expect(absent).toMatchObject({ status: 404, message: projectNotFound("gamma").message });
    expect(projectNotFound("beta").message).toBe('Project "beta" was not found, or you are not a member of it — ask its lead to add you, or create it in the web app (Projects → + New project).');
  });
  it("a member and the machine credential still resolve the row", async () => {
    await expect(runWithAuth(jwt("u-member"), () => ensureProject("alpha"))).resolves.toMatchObject({ key: "alpha" });
    await expect(ensureProject("beta")).resolves.toMatchObject({ key: "beta" });
  });
});

describe("createProject — a key taken by a project the caller cannot see", () => {
  it("is a 409 in words, not a scrubbed 500", async () => {
    await expect(runWithAuth(jwt("u-member"), () => createProject({ name: "Beta" })))
      .rejects.toMatchObject({ status: 409, message: 'The name "beta" is taken — choose another name (nothing was created).' });
  });
});

// rfis-2: for a project the caller cannot read, docList is [] under RLS and the local file's rows were inserted under the
// caller's session. The refusal came back as a 403 naming bridge_docs only when this machine held rows for the key.
describe("docListLazy — only the machine credential migrates this machine's local rows", () => {
  const local = [{ guid: "r1", project_id: "beta", subject: "Local RFI" }];
  const inserts = () => calls.filter((c) => c.table === "bridge_docs" && c.method === "POST");
  it("a signed-in caller reads what the database holds and writes nothing", async () => {
    await expect(runWithAuth(jwt("u-member"), () => docListLazy("rfi", "beta", local, (r) => r.guid))).resolves.toEqual([]);
    expect(inserts()).toEqual([]);
  });
  it("the machine credential still migrates them", async () => {
    await docListLazy("rfi", "beta", local, (r) => r.guid);
    expect(inserts()).toEqual([{ table: "bridge_docs", method: "POST", sub: null }]);
  });
});

// The same path for BCF topics (bcfListTopics): after 0033 a viewer's insert is refused (bcf_topics_insert, contributor).
describe("bcfListTopics — only the machine credential migrates this machine's local topics", () => {
  const local = [{ guid: "t1", project_id: "beta", title: "Local topic", topic_status: "Open" }];
  const inserts = () => calls.filter((c) => c.table === "bcf_topics" && c.method === "POST");
  it("a signed-in caller reads what the database holds and writes nothing", async () => {
    await expect(runWithAuth(jwt("u-member"), () => bcfListTopics("beta", {}, local))).resolves.toEqual([]);
    expect(inserts()).toEqual([]);
  });
  it("the machine credential still migrates them", async () => {
    await bcfListTopics("beta", {}, local);
    expect(inserts()).toEqual([{ table: "bcf_topics", method: "POST", sub: null }]);
  });
});

// MA-3b3 (C3): the database caps one reply (PostgREST max-rows); with the ascending order a cut read drops the NEWEST documents
// without a word — for changesets, the ones that hold the re-opens and the applies.
describe("docList — reads a store in pages", () => {
  it("a full page is followed by the next one; a short page ends the read; every row is answered, in order", async () => {
    const asked = [];
    globalThis.fetch = vi.fn(async (url) => {
      const q = new URL(String(url)).searchParams;
      asked.push([q.get("order"), q.get("limit"), q.get("offset")]);
      const offset = Number(q.get("offset"));
      return new Response(JSON.stringify(Array.from({ length: offset === 0 ? 1000 : 3 }, (_, i) => ({ data: { n: offset + i } }))), { status: 200 });
    });
    const rows = await docList("changeset", "p1");
    expect(rows).toHaveLength(1003);
    expect([rows[0], rows[999], rows[1002]]).toEqual([{ n: 0 }, { n: 999 }, { n: 1002 }]);
    expect(asked).toEqual([["created_at.asc,doc_id.asc", "1000", "0"], ["created_at.asc,doc_id.asc", "1000", "1000"]]);
  });
});
