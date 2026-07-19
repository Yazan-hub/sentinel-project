import { describe, it, expect, beforeEach } from "vitest";
import { unlockProject, lockProject, isUnlocked, encryptBytes, decryptBytes } from "./crypto";

// Guards the E2E-encryption core: a wrong passphrase or tampered ciphertext must fail (GCM auth),
// and a locked project must refuse to encrypt. WebCrypto is available on globalThis in Node 18+.
const KEY = "riverside-tower";
const enc = new TextEncoder();
const buf = (s: string) => enc.encode(s).buffer as ArrayBuffer;

describe("crypto E2E", () => {
  beforeEach(() => lockProject(KEY));

  it("round-trips: encrypt then decrypt returns the original bytes", async () => {
    await unlockProject(KEY, "correct horse battery staple");
    expect(isUnlocked(KEY)).toBe(true);
    const plain = buf("SECRET tender pricing — confidential");
    const cipher = await encryptBytes(KEY, plain);
    // IV(12) + ciphertext(=plaintext len) + GCM tag(16)
    expect(cipher.length).toBe(new Uint8Array(plain).byteLength + 12 + 16);
    const back = await decryptBytes(KEY, cipher.buffer);
    expect(new Uint8Array(back)).toEqual(new Uint8Array(plain));
  });

  it("ciphertext does not contain the plaintext", async () => {
    await unlockProject(KEY, "pw");
    const cipher = await encryptBytes(KEY, buf("NEEDLE"));
    expect(new TextDecoder().decode(cipher)).not.toContain("NEEDLE");
  });

  it("a wrong passphrase fails to decrypt (GCM auth)", async () => {
    await unlockProject(KEY, "right-passphrase");
    const cipher = await encryptBytes(KEY, buf("x"));
    lockProject(KEY);
    await unlockProject(KEY, "wrong-passphrase");
    await expect(decryptBytes(KEY, cipher.buffer)).rejects.toBeTruthy();
  });

  it("tampered ciphertext fails to decrypt", async () => {
    await unlockProject(KEY, "pw");
    const cipher = await encryptBytes(KEY, buf("hello world"));
    cipher[cipher.length - 1] ^= 0xff; // flip a byte in the tag
    await expect(decryptBytes(KEY, cipher.buffer)).rejects.toBeTruthy();
  });

  it("refuses to encrypt when the project is locked", async () => {
    expect(isUnlocked(KEY)).toBe(false);
    await expect(encryptBytes(KEY, buf("x"))).rejects.toThrow(/locked/);
  });
});
