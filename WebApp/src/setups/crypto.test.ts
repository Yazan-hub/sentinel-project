import { describe, it, expect } from "vitest";
import {
  createKeystore, openKeystore, rewrapKeystore,
  setUnlocked, isUnlocked, lockProject, encryptBytes, decryptBytes, b64, unb64,
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
