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
