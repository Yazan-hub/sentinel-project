// SEC-8 (S38): a real key rotation end to end — the real crypto, a fake bridge (bfetch mocked) that keeps one project's
// keystore (with the bridge's PUT rules: it names the key it replaces, the key id never goes back), its blob refs and its
// blobs. No browser storage: the IndexedDB cache is absent here, as in the platform's sandboxed iframe.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { blobKid, createKeystore, decryptBytes, encryptBytes, lockProject, openKeys, rewrapKeystore, rotateKeystore, rotateProjectKey, rotationUnderWay, setUnlocked, unlockAndVerify, type Keystore } from "./crypto";
import { getDecryptedFile, putEncryptedFile, resealFiles } from "./secure-store";

const B = "http://bridge";
const OLD = "correct horse battery staple", NEW = "a new horse for the new key";
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let ks: Keystore | null, blobs: Map<string, Uint8Array>, refuse: Set<string>;
beforeEach(() => {
  ks = null; blobs = new Map(); refuse = new Set();
  bfetch.mockReset();
  bfetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url), method = init.method || "GET";
    if (u.pathname.endsWith("/keystore/refs")) return json(200, { ids: [...blobs.keys()] });
    if (u.pathname.endsWith("/keystore")) {
      if (method === "GET") return json(200, ks);
      const body = JSON.parse(String(init.body));
      if (method === "POST") { if (ks) return json(409, { message: "exists" }); ks = body; return json(201, { ok: true }); }
      const { replaces, ...next } = body;
      if (ks && replaces !== ks.wrapped_dek) return json(409, { message: "the project keystore changed since it was read" });
      if (ks && (next.kid ?? 1) < (ks.kid ?? 1)) return json(409, { message: "the keystore's key id would go back" });
      ks = next;
      return json(200, { ok: true });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop()!);
    if (method === "POST") { const nid = `b${blobs.size + 1}`; blobs.set(nid, new Uint8Array(init.body as Uint8Array)); return json(201, { id: nid }); }
    if (method === "PUT") { if (refuse.has(id)) return json(503, { message: "the disk said no" }); blobs.set(id, new Uint8Array(init.body as Uint8Array)); return json(200, { id }); }
    const b = blobs.get(id);
    return b ? new Response(b.buffer as ArrayBuffer) : json(404, { message: "Blob not found" });
  });
});

const twoFiles = async (pid: string) => {
  expect(await unlockAndVerify(B, pid, OLD)).toEqual({ ok: true, firstUse: true });
  const a = await putEncryptedFile(B, pid, new File(["drawing A"], "a.pdf"));
  const b = await putEncryptedFile(B, pid, new File(["drawing B"], "b.pdf"));
  return [a.id, b.id];
};

describe("SEC-8 (S38): a key rotation re-seals every file under a new key and retires the old one only at the end", () => {
  it("two files sealed under key 1 are re-sealed under key 2; key 1 is retired; after a reload the new passphrase reads both", async () => {
    const [a, b] = await twoFiles("rot-1");
    expect(blobKid(blobs.get(a)!)).toMatchObject({ kid: 1, header: false }); // sealed as before SEC-8, byte for byte
    expect(await rotateProjectKey(B, "rot-1", OLD, NEW)).toEqual({ ok: true, line: "Key 2 stored beside key 1 — re-sealing the encrypted files…" });
    expect(ks).toMatchObject({ v: 2, kid: 2, retired: { kid: 1 }, rotating: { from: 1, to: 2, done: 0, total: 0 } });
    expect(rotationUnderWay("rot-1")).toBe(true);
    const lines: string[] = [];
    expect(await resealFiles(B, "rot-1", (l) => lines.push(l))).toBe(true);
    expect(lines).toEqual([
      "Re-sealing the encrypted files under key 2: 1 of 2…",
      "Re-sealing the encrypted files under key 2: 2 of 2…",
      "Key rotated: 2 encrypted files re-sealed under key 2; key 1 is retired.",
    ]);
    expect(ks).not.toHaveProperty("retired");
    expect(ks).not.toHaveProperty("rotating");
    expect(ks).toMatchObject({ v: 2, kid: 2 });
    for (const id of [a, b]) expect(blobKid(blobs.get(id)!)).toMatchObject({ kid: 2, header: true });
    expect(rotationUnderWay("rot-1")).toBe(false);
    lockProject("rot-1"); // a reload
    expect(await unlockAndVerify(B, "rot-1", OLD)).toEqual({ ok: false, firstUse: false });
    expect(await unlockAndVerify(B, "rot-1", NEW)).toEqual({ ok: true, firstUse: false });
    expect(text(await getDecryptedFile(B, "rot-1", a))).toBe("drawing A");
    expect(text(await getDecryptedFile(B, "rot-1", b))).toBe("drawing B");
  });

  it("a re-seal the bridge refuses leaves that file as it was, readable under the retired key; a closed tab resumes and finishes", async () => {
    const [a, b] = await twoFiles("rot-2");
    const before = blobs.get(b);
    await rotateProjectKey(B, "rot-2", OLD, NEW);
    refuse.add(b);
    const lines: string[] = [];
    expect(await resealFiles(B, "rot-2", (l) => lines.push(l))).toBe(false);
    expect(lines[lines.length - 1]).toBe("1 of 2 encrypted files re-sealed under key 2; 1 could not be (b2: Re-seal failed (HTTP 503): the disk said no) — key 1 stays until they are: press Resume key rotation");
    expect(blobs.get(b)).toBe(before);
    expect(ks).toMatchObject({ kid: 2, retired: { kid: 1 }, rotating: { from: 1, to: 2, done: 1, total: 2 } });
    lockProject("rot-2"); // the tab closed mid-walk
    expect(await unlockAndVerify(B, "rot-2", NEW)).toEqual({ ok: true, firstUse: false });
    expect(rotationUnderWay("rot-2")).toBe(true);
    expect(text(await getDecryptedFile(B, "rot-2", a))).toBe("drawing A"); // key 2
    expect(text(await getDecryptedFile(B, "rot-2", b))).toBe("drawing B"); // still key 1, the retired one
    refuse.clear();
    expect(await resealFiles(B, "rot-2", () => {})).toBe(true);
    expect(ks).not.toHaveProperty("retired");
    expect(text(await getDecryptedFile(B, "rot-2", b))).toBe("drawing B");
  });

  it("a wrong old passphrase rotates nothing; a second rotation while one is under way is refused in words", async () => {
    await twoFiles("rot-3");
    const first = ks;
    expect(await rotateProjectKey(B, "rot-3", "not the old one at all", NEW)).toEqual({ ok: false, line: "Wrong old passphrase — nothing was rotated" });
    expect(ks).toBe(first);
    await rotateProjectKey(B, "rot-3", OLD, NEW);
    expect(await rotateProjectKey(B, "rot-3", NEW, OLD)).toEqual({ ok: false, line: "A key rotation is already under way (key 1 → 2) — unlock with the new passphrase and press Resume key rotation; nothing was rotated" });
  });

  it("a session unlocked before another lead's rotation attaches nothing under the old key — it is told to unlock again", async () => {
    await twoFiles("rot-4");
    ks = (await rotateKeystore(ks!, OLD, NEW)).keystore; // another lead rotated; this session still holds key 1 only
    await expect(putEncryptedFile(B, "rot-4", new File(["late"], "c.pdf")))
      .rejects.toThrow("The project's key was rotated since this session unlocked — lock (🔓) and unlock again; nothing was attached");
  });

  it("a passphrase change during a rotation keeps the retired key (rewrap re-wraps both)", async () => {
    const { keystore, dek } = await createKeystore(OLD);
    setUnlocked("rot-5", dek);
    const sealed1 = await encryptBytes("rot-5", new TextEncoder().encode("one").buffer as ArrayBuffer);
    const rotated = await rotateKeystore(keystore, OLD, NEW);
    const changed = await rewrapKeystore(rotated.keystore, NEW, "a third passphrase for the team");
    expect(changed).toMatchObject({ v: 2, kid: 2, retired: { kid: 1 } });
    const held = await openKeys(changed, "a third passphrase for the team");
    expect([...held.keys.keys()].sort()).toEqual([1, 2]);
    setUnlocked("rot-5", held.keys.get(1)!, 1);
    expect(text(await decryptBytes("rot-5", sealed1.buffer as ArrayBuffer))).toBe("one");
  });
});

describe("SEC-8: a file sealed after a rotation names its key", () => {
  it("key 2 on writes an 8-byte header (SNK 0x01, the key id); key 1 writes none, as before", async () => {
    setUnlocked("h3", (await createKeystore("pw")).dek, 3);
    const c = await encryptBytes("h3", new TextEncoder().encode("x").buffer as ArrayBuffer);
    expect([...c.slice(0, 8)]).toEqual([0x53, 0x4e, 0x4b, 0x01, 0, 0, 0, 3]);
    expect(blobKid(c)).toMatchObject({ kid: 3, header: true });
    setUnlocked("h1", (await createKeystore("pw")).dek);
    const one = await encryptBytes("h1", new TextEncoder().encode("x").buffer as ArrayBuffer);
    expect(one.length).toBe(12 + 1 + 16);
    expect(blobKid(one)).toMatchObject({ kid: 1, header: false });
  });

  it("a session that does not hold a file's key says so in words", async () => {
    setUnlocked("h4", (await createKeystore("pw")).dek, 4);
    const c = await encryptBytes("h4", new TextEncoder().encode("x").buffer as ArrayBuffer);
    setUnlocked("h4", (await createKeystore("pw")).dek, 1);
    await expect(decryptBytes("h4", c.buffer as ArrayBuffer)).rejects.toThrow("This file is sealed under key 4, which this session does not hold — the project's key was rotated: lock (🔓) and unlock again");
  });
});

describe("SEC-8: the CDE panel's Rotate key…", () => {
  it("asks the old and the new passphrase, rotates, clears both fields, then re-seals; a rotation under way reads Resume key rotation…; nothing is kept in browser storage", () => {
    const src = readFileSync(new URL("./cde-panel.ts", import.meta.url), "utf8").replace(/\r/g, "");
    expect(src).toContain(">Rotate key…</button>");
    expect(src).toContain('el("cde-rotate").textContent = rotationUnderWay(pid()) ? "Resume key rotation…" : "Rotate key…";');
    const rotate = src.indexOf("const r = await rotateProjectKey(base, pid(), oldIn.value, newIn.value);");
    const cleared = src.indexOf('oldIn.value = newIn.value = "";', rotate);
    const walk = src.indexOf("await reseal();", cleared);
    expect(rotate).toBeGreaterThan(0);
    expect(cleared).toBeGreaterThan(rotate);
    expect(walk).toBeGreaterThan(cleared);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
