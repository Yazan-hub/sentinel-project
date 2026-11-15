// R3: the checks that read BEPs read the whole project, or the one document being scored.
import { describe, it, expect, vi } from "vitest";

const asked = [];
vi.mock("./cde-store.mjs", () => ({ sb: vi.fn(async (q) => { asked.push(String(q)); return []; }), ensureProject: vi.fn(async () => ({ id: "p1" })) }));
const { projectBeps } = await import("./doc-checks.mjs");

describe("projectBeps", () => {
  it("reads the project's BEPs that are not archived, or the one document being scored whatever its status", async () => {
    await projectBeps("k");
    await projectBeps("k", "d 1");
    expect(asked[0]).toContain("doc_type=eq.BEP&status=neq.archived");
    expect(asked[1]).toContain("doc_type=eq.BEP&id=eq.d%201");
    expect(asked[1]).not.toContain("status=neq");
  });
});
