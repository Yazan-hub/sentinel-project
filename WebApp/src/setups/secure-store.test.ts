// Encrypted CDE files belong to a project (H0, cdefiles-1/2): the upload and the download both name it, so the bridge
// stores the blob in that project's folder and checks the caller against that project. A refusal keeps the bridge's words.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./crypto", () => ({
  encryptBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  decryptBytes: vi.fn(async (_key: string, cipher: ArrayBuffer) => cipher),
  assertCurrentKey: vi.fn(async () => {}), // SEC-8: the key-rotation check after an upload (key-rotation.test.ts)
}));

import { putEncryptedFile, getDecryptedFile } from "./secure-store";

const res = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new Uint8Array([9, 9]).buffer }) as unknown as Response;

describe("secure-store names the project on every blob call", () => {
  beforeEach(() => bfetch.mockReset());

  it("uploads to /cde/files?project=<key>", async () => {
    bfetch.mockResolvedValue(res(201, { id: "b1", size: 3 }));
    const stored = await putEncryptedFile("http://b/", "tower one", new File(["plain"], "a.pdf", { type: "application/pdf" }));
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/files?project=tower%20one");
    expect(stored).toEqual({ id: "b1", name: "a.pdf", size: 5, mime: "application/pdf" });
  });

  it("a refused upload throws the bridge's words", async () => {
    bfetch.mockResolvedValue(res(403, { message: "tower belongs to no office — nothing was sent" }));
    await expect(putEncryptedFile("http://b", "tower", new File(["x"], "a.pdf")))
      .rejects.toThrow("Upload failed (HTTP 403): tower belongs to no office — nothing was sent");
  });

  it("downloads from /cde/files/<id>?project=<key>; a refusal without words names the status", async () => {
    bfetch.mockResolvedValue(res(200, null));
    await getDecryptedFile("http://b", "tower one", "b2");
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/files/b2?project=tower%20one");
    bfetch.mockResolvedValue(res(404, null));
    await expect(getDecryptedFile("http://b", "tower one", "b3")).rejects.toThrow("Download failed (HTTP 404)");
  });
});
