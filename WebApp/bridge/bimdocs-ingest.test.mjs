import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
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

const { ingestDocument } = await import("./bimdocs-ingest.mjs");

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
const opts = { filename: "doc.txt", doc_type: "EIR" };

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

  it("a small document (well under the cap) still succeeds", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const result = await ingestDocument(buf, opts);
    expect(result.doc_type).toBe("EIR");
    expect(result.proposal).toBeDefined();
  });
});
