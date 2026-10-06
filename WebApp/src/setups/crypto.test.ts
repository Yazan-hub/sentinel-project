import { describe, it, expect, vi } from "vitest";

// unlockAndVerify's bridge calls (the keystore GET and the first-use POST) — the envelope tests below make none.
const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import {
  createKeystore, openKeystore, rewrapKeystore,
  setUnlocked, isUnlocked, lockProject, encryptBytes, decryptBytes, b64, unb64, unlockAndVerify,
} from "./crypto";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

describe("envelope keystore", () => {
  it("round-trips: the same passphrase re-opens the SAME DEK (encrypt, then decrypt on a 'new device')", async () => {
    const { keystore, dek } = await createKeystore("correct horse battery staple");
    setUnlocked("p", dek);
    const cipher = await encryptBytes("p", bytes("secret drawing"));
    lockProject("p"); // simulate a fresh device: no cached DEK

    // reopen from the SERVER keystore with the passphrase (no localStorage verifier involved)
    setUnlocked("p", await openKeystore(keystore, "correct horse battery staple"));
    expect(text(await decryptBytes("p", cipher.buffer))).toBe("secret drawing");
  });

  it("rejects a wrong passphrase (no fail-open) — the GCM tag fails to unwrap", async () => {
    const { keystore } = await createKeystore("right-pass");
    await expect(openKeystore(keystore, "wrong-pass")).rejects.toBeDefined();
  });

  it("re-key: change the passphrase without re-encrypting — old files still decrypt, old passphrase stops working", async () => {
    const { keystore, dek } = await createKeystore("old-pass");
    setUnlocked("q", dek);
    const cipher = await encryptBytes("q", bytes("as-built model"));

    const rekeyed = await rewrapKeystore(keystore, "old-pass", "new-pass");
    // the same DEK comes back out under the NEW passphrase → the already-encrypted file still opens
    setUnlocked("q", await openKeystore(rekeyed, "new-pass"));
    expect(text(await decryptBytes("q", cipher.buffer))).toBe("as-built model");
    // the OLD passphrase no longer opens the re-keyed store
    await expect(openKeystore(rekeyed, "old-pass")).rejects.toBeDefined();
  });

  it("rewrap verifies the old passphrase before re-keying", async () => {
    const { keystore } = await createKeystore("old-pass");
    await expect(rewrapKeystore(keystore, "not-the-old-pass", "new-pass")).rejects.toBeDefined();
  });

  it("uses a fresh random salt each time (no deterministic-salt precompute)", async () => {
    const a = await createKeystore("same-pass");
    const b = await createKeystore("same-pass");
    expect(a.keystore.salt).not.toBe(b.keystore.salt);              // random salt
    expect(a.keystore.wrapped_dek).not.toBe(b.keystore.wrapped_dek); // and independent DEKs
  });
});

describe("file crypto (AES-GCM under the DEK)", () => {
  it("encrypt → decrypt round-trips and prepends a 12-byte IV", async () => {
    const { dek } = await createKeystore("pw");
    setUnlocked("f", dek);
    const cipher = await encryptBytes("f", bytes("hello ifc"));
    expect(cipher.length).toBeGreaterThan(12 + 9); // IV + ciphertext + GCM tag
    expect(text(await decryptBytes("f", cipher.buffer))).toBe("hello ifc");
  });

  it("a tampered ciphertext fails the GCM auth tag", async () => {
    const { dek } = await createKeystore("pw");
    setUnlocked("t", dek);
    const cipher = await encryptBytes("t", bytes("integrity"));
    cipher[cipher.length - 1] ^= 0xff; // flip a byte in the tag
    await expect(decryptBytes("t", cipher.buffer)).rejects.toBeDefined();
  });

  it("locking clears the DEK; encrypt then refuses", async () => {
    const { dek } = await createKeystore("pw");
    setUnlocked("l", dek);
    expect(isUnlocked("l")).toBe(true);
    lockProject("l");
    expect(isUnlocked("l")).toBe(false);
    await expect(encryptBytes("l", bytes("x"))).rejects.toThrow(/locked/);
  });

  it("base64 helpers round-trip", () => {
    const u = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...unb64(b64(u))]).toEqual([...u]);
  });
});

// H0 (D4): setting up a project's passphrase is a lead's. A first use the bridge refuses is not a first use — holding the
// new key would encrypt this session's files under a key the project never stored, unreadable to everyone afterwards.
describe("unlockAndVerify — a refused first-time setup", () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  it("is not ok, says the bridge's words, and leaves the project locked", async () => {
    bfetch.mockResolvedValueOnce(reply(200, null)) // no keystore yet
      .mockResolvedValueOnce(reply(403, { message: "this action requires the lead role (you are contributor)" }));
    const r = await unlockAndVerify("http://bridge", "demo-refused", "correct horse battery staple");
    expect(r).toEqual({ ok: false, firstUse: true, reason: "Not set up — this action requires the lead role (you are contributor)" });
    expect(isUnlocked("demo-refused")).toBe(false);
  });

  it("a 409 whose keystore cannot be read is not ok and leaves the project locked", async () => {
    bfetch.mockResolvedValueOnce(reply(200, null)) // no keystore yet
      .mockResolvedValueOnce(reply(409, { message: "exists" }))
      .mockResolvedValueOnce(reply(200, {})); // a leftover without wrapped_dek
    const r = await unlockAndVerify("http://bridge", "demo-unreadable", "correct horse battery staple");
    expect(r).toEqual({ ok: false, firstUse: false, reason: "A keystore exists for this project but could not be read — nothing was set up" });
    expect(isUnlocked("demo-unreadable")).toBe(false);
  });
});

// SEC-5 (S39): only a keystore the bridge says is not there is a first use, and only a keystore the bridge stored unlocks.
describe("unlockAndVerify — a read or a write that did not happen never unlocks", () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
  const PASS = "correct horse battery staple";

  it("a keystore read that throws, answers 500 or is not JSON: not ok, no first-use POST, the project stays locked", async () => {
    const reads: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(reply(500, { message: "Internal error" })),
      () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } } as unknown as Response),
    ];
    for (const [i, read] of reads.entries()) {
      bfetch.mockReset();
      bfetch.mockImplementationOnce(read);
      const r = await unlockAndVerify("http://bridge", `s39-read-${i}`, PASS);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/^Could not read the project keystore \(.+\) — nothing was unlocked; try again$/);
      expect(bfetch).toHaveBeenCalledTimes(1);
      expect(isUnlocked(`s39-read-${i}`)).toBe(false);
    }
  });

  it("no keystore yet, then a first-use POST that throws: not ok, the passphrase may not have been stored, the project stays locked", async () => {
    bfetch.mockReset();
    bfetch.mockResolvedValueOnce(reply(200, null)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await unlockAndVerify("http://bridge", "s39-post", PASS);
    expect(r).toEqual({ ok: false, firstUse: true, reason: "Could not reach the bridge — the passphrase may not have been stored; unlock again with the same passphrase" });
    expect(isUnlocked("s39-post")).toBe(false);
  });

  it("a keystore read the bridge refused (401, 403, 404), or one with no wrapped key: not ok, the bridge's words, no 'try again' (review C6)", async () => {
    const cases: Array<[Response, string]> = [
      [reply(403, { message: "a member of this project reads its keystore" }), "Could not read the project keystore (the bridge answered HTTP 403: a member of this project reads its keystore) — nothing was unlocked"],
      [reply(401, {}), "Could not read the project keystore (the bridge answered HTTP 401) — nothing was unlocked"],
      [reply(404, { message: "Project not found" }), "Could not read the project keystore (the bridge answered HTTP 404: Project not found) — nothing was unlocked"],
      [reply(200, { v: 1, salt: "c2FsdA==" }), "Could not read the project keystore (the stored keystore holds no wrapped key) — nothing was unlocked"],
    ];
    for (const [i, [res, reason]] of cases.entries()) {
      bfetch.mockReset();
      bfetch.mockResolvedValueOnce(res);
      expect(await unlockAndVerify("http://bridge", `s39-final-${i}`, PASS)).toEqual({ ok: false, firstUse: false, reason });
      expect(bfetch).toHaveBeenCalledTimes(1);
      expect(isUnlocked(`s39-final-${i}`)).toBe(false);
    }
  });

  it("the control: no keystore yet and a POST the bridge stored is a first use, unlocked", async () => {
    bfetch.mockReset();
    bfetch.mockResolvedValueOnce(reply(200, null)).mockResolvedValueOnce(reply(201, { ok: true }));
    expect(await unlockAndVerify("http://bridge", "s39-ok", PASS)).toEqual({ ok: true, firstUse: true });
    expect(isUnlocked("s39-ok")).toBe(true);
  });
});

// SEC-5 (S38): the DEK a session holds cannot be exported; a re-key unwraps its own short-lived copy.
describe("the session's DEK is not extractable", () => {
  it("createKeystore and openKeystore answer a key exportKey refuses", async () => {
    const { keystore, dek } = await createKeystore("old-pass");
    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", dek)).rejects.toBeDefined();
    const opened = await openKeystore(keystore, "old-pass");
    expect(opened.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", opened)).rejects.toBeDefined();
  });
});
