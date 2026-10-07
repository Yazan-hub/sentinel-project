// SEC-7: hardenings pinned by their text (source pins read files with CRLF normalised), and one mocked store row.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "");

describe("SEC-7 (S21): the body caps are named where the bridge is configured", () => {
  it("the template names the four caps, commented out at their defaults, each on its own line", () => {
    const t = read("../../config/.env.template");
    expect(t).toMatch(/^# BCF_MAX_UPLOAD_MB=1024$/m);
    expect(t).toMatch(/^# BCF_MAX_JSON_MB=16$/m);
    expect(t).toMatch(/^# SENTINEL_MAX_BLOB_MB=100$/m);
    expect(t).toMatch(/^# SENTINEL_MAX_DOC_MB=32$/m);
  });

  it("the model routes read BCF_MAX_UPLOAD_MB (1024 MB by default); the attachment and document routes keep their own lower caps", () => {
    const limits = read("./request-limits.mjs"), svc = read("./bcf-service.mjs");
    expect(limits).toContain('export const uploadCap = () => (Number(process.env.BCF_MAX_UPLOAD_MB) || 1024) * MB;');
    // Review C7: every raw body read with no cap of its own inherits the model cap — exactly the three model routes the template
    // names (POST /ifc, Governed Intake, the manifests backfill); a fourth is named in the template first, or given its own cap.
    expect((svc.match(/readRaw\(req\)/g) || []).length).toBe(3);
    expect(svc).toContain('const MAX_DOC_UPLOAD = (Number(process.env.SENTINEL_MAX_DOC_MB) || 32) * 1024 * 1024;');
    expect(svc).toContain('const MAX_BLOB = (Number(process.env.SENTINEL_MAX_BLOB_MB) || 100) * 1024 * 1024;');
    expect(svc).toContain("const bytes = await readRaw(req, { max: MAX_BLOB });");
    expect(svc).toContain("const raw = await readRaw(req, { max: MAX_DOC_UPLOAD });");
  });
});

describe("SEC-7 (S23): a deleted project's side rows are the database's (0043's cde_project_side_rows), not the bridge's", () => {
  it("deleteProject no longer clears bridge documents or BCF topics itself — the trigger does, for every writer", () => {
    const src = read("./cde-store.mjs");
    const fn = src.slice(src.indexOf("/** Delete a project and everything the schema cascades"), src.indexOf("// ── Folders (ACC/Forma-style"));
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).not.toContain("docDeleteProject(");
    expect(fn).not.toContain("bcf_topics");
    expect(fn).toContain("0043");
  });

  it("…and makes exactly one DELETE (the project) and one ledger row, nothing else", async () => {
    // cde-store reads its config at import; without a config/.env (CI) these make the store "configured". fetch is faked.
    process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
    process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
    const { deleteProject } = await import("./cde-store.mjs");
    const P = "11111111-1111-4111-8111-111111111111";
    const calls = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url)), path = u.pathname.replace(/^\/rest\/v1\//, ""), method = init.method || "GET";
      calls.push({ path, method, search: decodeURIComponent(u.search) });
      const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
      if (path === "projects" && method === "GET") return json([{ id: P, key: "sec7-gone", name: "sec7-gone" }]);
      if (path === "projects" && method === "DELETE") return json([{ id: P }]);
      if (path === "audit_log" && method === "POST") return json([{ id: 7 }], 201);
      return json([]);
    };
    try {
      expect(await deleteProject("sec7-gone", "web")).toEqual({ deleted: true, key: "sec7-gone" });
      expect(calls.filter((c) => c.method !== "GET")).toEqual([
        { path: "projects", method: "DELETE", search: `?id=eq.${P}` },
        { path: "audit_log", method: "POST", search: "" },
      ]);
    } finally { globalThis.fetch = real; }
  });
});
