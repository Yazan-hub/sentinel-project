/**
 * End-to-end crypto for the private CDE (Phase 2). Files are encrypted in the browser with AES-GCM-256
 * BEFORE they leave it; the bridge (and any storage behind it) only ever sees ciphertext — zero-knowledge.
 * The key is derived from a per-project passphrase shared among project members; neither the passphrase nor
 * the derived key ever leaves the browser (kept in memory only).
 *
 * Salt: deterministic per project — SHA-256("sentinel-cde:" + projectKey) — so every member deriving with
 * the same passphrase gets the same key with no server round-trip. Per-project uniqueness defeats
 * cross-project precomputation; the passphrase carries the real entropy. IV: a fresh random 12 bytes per
 * file, prepended to the ciphertext. Tampering or a wrong key fails the GCM auth tag (decrypt throws).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITERS = 210_000; // OWASP guidance for PBKDF2-HMAC-SHA256

// Derived keys live in memory only — cleared on reload or lock(). Never persisted.
const keys = new Map<string, CryptoKey>();

async function projectSalt(projectKey: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode("sentinel-cde:" + projectKey));
  return new Uint8Array(digest);
}

/** Derive + cache (in memory) the AES-GCM key for a project from its shared passphrase. */
export async function unlockProject(projectKey: string, passphrase: string): Promise<void> {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: await projectSalt(projectKey), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  keys.set(projectKey, key);
}

export const isUnlocked = (projectKey: string): boolean => keys.has(projectKey);
export const lockProject = (projectKey: string): void => void keys.delete(projectKey);

function requireKey(projectKey: string): CryptoKey {
  const k = keys.get(projectKey);
  if (!k) throw new Error(`Project "${projectKey}" is locked — unlock it with the project passphrase first.`);
  return k;
}

/** Encrypt bytes → (IV ‖ ciphertext). */
export async function encryptBytes(projectKey: string, data: ArrayBuffer): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, requireKey(projectKey), data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

/** Decrypt (IV ‖ ciphertext) → plaintext. Throws on wrong key / tampering. */
export async function decryptBytes(projectKey: string, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const buf = new Uint8Array(blob);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, requireKey(projectKey), buf.slice(12));
}

// ── base64 helpers (small blobs — verifier) ────────────────────────────────────
export function b64(u: Uint8Array): string {
  let s = "";
  for (const byte of u) s += String.fromCharCode(byte);
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// ── passphrase verifier (client-side, per browser) ─────────────────────────────
// Lets us say "wrong passphrase" on unlock without any server. The first time a project is unlocked in
// THIS browser we store a verifier (a known string encrypted under the derived key) in localStorage; later
// unlocks decrypt it to check the passphrase. A fresh browser has no verifier, so its first unlock is
// trusted — a wrong passphrase there surfaces later as a decryption failure on a real file.
const VERIFY_PLAINTEXT = "sentinel-verify-v1";
const verifyKey = (projectKey: string) => `sentinel.enc.verify.${projectKey}`;

export async function unlockAndVerify(
  projectKey: string,
  passphrase: string,
): Promise<{ ok: boolean; firstUse: boolean }> {
  await unlockProject(projectKey, passphrase);
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(verifyKey(projectKey));
  } catch {
    /* storage blocked — treat as first use */
  }
  if (!stored) {
    const v = await encryptBytes(projectKey, enc.encode(VERIFY_PLAINTEXT).buffer as ArrayBuffer);
    try {
      localStorage.setItem(verifyKey(projectKey), b64(v));
    } catch {
      /* can't persist the verifier — unlock still holds for this session */
    }
    return { ok: true, firstUse: true };
  }
  try {
    const pt = await decryptBytes(projectKey, unb64(stored).buffer);
    const ok = dec.decode(pt) === VERIFY_PLAINTEXT;
    if (!ok) lockProject(projectKey);
    return { ok, firstUse: false };
  } catch {
    lockProject(projectKey);
    return { ok: false, firstUse: false };
  }
}
