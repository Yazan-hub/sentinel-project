import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const chat = vi.fn();
vi.mock("./ai-gateway.mjs", () => ({ chat: (...args) => chat(...args) }));

// Default forwards to the real chunkPages so every existing test is unaffected; the chunk-cap test
// below overrides it once to simulate a document that produces too many chunks.
const chunkPages = vi.fn();
vi.mock("./ingest-logic.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  chunkPages.mockImplementation(actual.chunkPages);
  return { ...actual, chunkPages: (...args) => chunkPages(...args) };
});

const { ingestDocument, sourceFilePath } = await import("./bimdocs-ingest.mjs");

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sentinel-bimdocs-"));
  process.env.SENTINEL_BIMDOCS = dir;
  chat.mockReset();
});
afterEach(() => {
  delete process.env.SENTINEL_BIMDOCS;
  rmSync(dir, { recursive: true, force: true });
});

const buf = Buffer.from("hello world, this is the EIR text.");
const P = "11111111-2222-4333-8444-555555555555";     // the project the upload is for
const OTHER = "66666666-7777-4888-8999-aaaaaaaaaaaa"; // someone else's project
const opts = { filename: "doc.txt", doc_type: "EIR", project_id: P };
const statusOf = (fn) => { try { fn(); return "no throw"; } catch (e) { return e.status; } };

describe("ingestDocument chunk-failure handling", () => {
  it("propagates a 503 (model unreachable)", async () => {
    chat.mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));
    await expect(ingestDocument(buf, opts)).rejects.toMatchObject({ status: 503 });
  });

  it("propagates a status-less TypeError (real programming defect)", async () => {
    chat.mockRejectedValue(new TypeError("cannot read property of undefined"));
    await expect(ingestDocument(buf, opts)).rejects.toBeInstanceOf(TypeError);
  });

  it("tolerates a non-503/400 model failure, routing the chunk to unassigned", async () => {
    chat.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 500 }));
    const result = await ingestDocument(buf, opts);
    expect(result.proposal.unassigned).toHaveLength(1);
    expect(result.proposal.unassigned[0].reason).toBe("unparsed");
  });

  it("routes a zero-assignment reply to unassigned", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const result = await ingestDocument(buf, opts);
    expect(result.proposal.unassigned).toHaveLength(1);
    expect(result.proposal.unassigned[0].text).toContain("hello world");
  });
});

describe("ingestDocument chunk-count cap", () => {
  it("rejects with 413 naming the limit when chunking produces too many chunks", async () => {
    chunkPages.mockReturnValueOnce(Array.from({ length: 61 }, (_, i) => ({ text: `chunk ${i}`, pages: [i + 1] })));
    await expect(ingestDocument(buf, opts)).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/61.*60|60.*limit/i) });
    expect(chat).not.toHaveBeenCalled(); // cap is enforced before any AI call
  });

  it("keeps nothing on disk when it refuses (the original is stored only for a document it will map)", async () => {
    chunkPages.mockReturnValueOnce(Array.from({ length: 61 }, (_, i) => ({ text: `chunk ${i}`, pages: [i + 1] })));
    await expect(ingestDocument(buf, opts)).rejects.toMatchObject({ status: 413 });
    // Files, not entries: SPEND-9 later keeps originals in a per-project folder it creates before the chunk check.
    expect(readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.[a-z0-9]+$/i.test(f))).toEqual([]);
  });

  it("a small document (well under the cap) still succeeds", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const result = await ingestDocument(buf, opts);
    expect(result.doc_type).toBe("EIR");
    expect(result.proposal).toBeDefined();
  });
});

describe("ingest and the AI budget (H0, D2)", () => {
  it("each chunk's model call is budget:false — one upload, whose route already required a trusted caller", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    await ingestDocument(buf, opts);
    expect(chat.mock.calls[0][1]).toEqual({ budget: false });
  });
});

describe("originals are bound to their project (H0, bimdocs-4)", () => {
  it("ingest keeps the original in the project's own folder", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const { source } = await ingestDocument(buf, opts);
    expect(existsSync(join(dir, P, source.file_id))).toBe(true);
    expect(existsSync(join(dir, source.file_id))).toBe(false);
    expect(sourceFilePath(P, source.file_id)).toBe(join(dir, P, source.file_id));
  });

  it("another project's file_id names nothing here: 404", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const { source } = await ingestDocument(buf, opts);
    expect(statusOf(() => sourceFilePath(OTHER, source.file_id))).toBe(404);
  });

  it("a file from before H0 (the flat folder) is found only with legacy — the commit check never passes it", () => {
    const old = "12345678-1234-4123-8123-123456789abc.txt";
    writeFileSync(join(dir, old), "old original");
    expect(statusOf(() => sourceFilePath(P, old))).toBe(404);
    expect(sourceFilePath(P, old, { legacy: true })).toBe(join(dir, old));
  });

  it("a project folder is never read as a file", () => {
    mkdirSync(join(dir, OTHER), { recursive: true });
    expect(statusOf(() => sourceFilePath(P, OTHER, { legacy: true }))).toBe(404);
  });

  it("no project id: 400 before anything is stored or asked", async () => {
    await expect(ingestDocument(buf, { filename: "doc.txt", doc_type: "EIR" })).rejects.toMatchObject({ status: 400 });
    expect(readdirSync(dir)).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });
});
