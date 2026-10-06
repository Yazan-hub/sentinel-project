// Only an IFC goes to the platform (H0, ifc-1): uploadIfcAsFrag uploads the raw bytes when fragment conversion fails
// (Governed Intake relies on that), so POST /ifc refuses anything that is not a STEP file before it gets there.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isIfcStep } from "./platform-publish.mjs";

describe("isIfcStep", () => {
  it("an IFC opens with ISO-10303-21; — after a BOM or blank lines too, from a Buffer or a Uint8Array", () => {
    expect(isIfcStep(readFileSync(new URL("./fixtures/minimal.ifc", import.meta.url)))).toBe(true);
    expect(isIfcStep(Buffer.from("\uFEFF\r\n  ISO-10303-21;\nHEADER;"))).toBe(true);
    expect(isIfcStep(new TextEncoder().encode("ISO-10303-21;"))).toBe(true);
  });

  it("anything else is not", () => {
    for (const s of ["", "hello", "PK\u0003\u0004", "<html>", "ISO-10303-2", "x ISO-10303-21;"]) expect(isIfcStep(Buffer.from(s))).toBe(false);
  });
});

// The delivered IFC goes to the platform beside the .frag (spec 2026-09-27 platform-delivery-gate, Decision 9): the
// platform's "Sentinel gate" automation judges it there, and the bytes behind a receipt are finally kept somewhere.
vi.mock("./thatopen-client.mjs", () => ({
  getConfig: () => ({ token: "t", projectId: "P", apiUrl: "u" }),
  createClient: () => ({}),
  uploadBytes: vi.fn(async (_c, _p, bytes, name, versionTag) => ({ result: { item: { _id: `item-${name}` } }, size: bytes.length })),
}));
vi.mock("./ifc-to-frag.mjs", () => ({ ifcBytesToFrag: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

describe("uploadIfcAsFrag — the .frag first, then the raw IFC beside it", () => {
  it("uploads both and names both item ids; the IFC keeps its own name and version tag", async () => {
    const { uploadBytes } = await import("./thatopen-client.mjs");
    uploadBytes.mockClear();
    const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
    const out = await uploadIfcAsFrag(Buffer.from("ISO-10303-21;"), "tower.ifc", "v3");
    expect(uploadBytes.mock.calls.map((c) => [c[3], c[4]])).toEqual([["tower.frag", "v3"], ["tower.ifc", "v3"]]);
    expect(out).toMatchObject({ ok: true, format: "frag", name: "tower.frag", itemId: "item-tower.frag", ifcItemId: "item-tower.ifc" });
    // SEC-5: the sha256 of the .frag bytes uploaded — what the web's Open 3D checks a download against.
    expect(out.frag_sha256).toBe(createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"));
  });

  it("a failed conversion uploads the IFC once, as before, and says so", async () => {
    const { uploadBytes } = await import("./thatopen-client.mjs");
    const { ifcBytesToFrag } = await import("./ifc-to-frag.mjs");
    uploadBytes.mockClear();
    ifcBytesToFrag.mockRejectedValueOnce(new Error("boom"));
    const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
    const out = await uploadIfcAsFrag(Buffer.from("ISO-10303-21;"), "tower.ifc", "v1");
    expect(uploadBytes.mock.calls.map((c) => c[3])).toEqual(["tower.ifc"]);
    expect(out).toMatchObject({ format: "ifc", itemId: "item-tower.ifc", ifcItemId: "item-tower.ifc" });
    expect(out).not.toHaveProperty("frag_sha256");
    expect(out.note).toMatch(/frag conversion failed \(boom\)/);
  });

  it("a refused .frag upload is not a failed conversion: it throws with its status, and nothing is uploaded a second time", async () => {
    const { uploadBytes } = await import("./thatopen-client.mjs");
    uploadBytes.mockClear();
    uploadBytes.mockImplementationOnce(async () => { throw Object.assign(new Error("Too Many Requests (429)"), { status: 429 }); });
    const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
    await expect(uploadIfcAsFrag(Buffer.from("ISO-10303-21;"), "tower.ifc", "v1")).rejects.toMatchObject({ status: 429, message: "Too Many Requests (429)" });
    expect(uploadBytes.mock.calls.map((c) => c[3])).toEqual(["tower.frag"]);
  });

  it("an IFC upload that fails after the .frag landed does not undo the publish: the note says the IFC is not on the platform", async () => {
    const { uploadBytes } = await import("./thatopen-client.mjs");
    uploadBytes.mockClear();
    uploadBytes.mockImplementationOnce(async (_c, _p, bytes, name) => ({ result: { item: { _id: `item-${name}` } }, size: bytes.length }))
      .mockImplementationOnce(async () => { throw new Error("quota"); });
    const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
    const out = await uploadIfcAsFrag(Buffer.from("ISO-10303-21;"), "tower.ifc", "v1");
    expect(out).toMatchObject({ ok: true, format: "frag", itemId: "item-tower.frag", ifcItemId: null });
    expect(out.note).toBe("the delivered IFC is not on the platform: quota");
  });
});
