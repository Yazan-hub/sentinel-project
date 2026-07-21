/**
 * End-to-end crypto for the private CDE (Phase 2), ENVELOPE scheme. Files are encrypted in the browser with
 * a random per-project Data Encryption Key (DEK); the bridge/storage only ever sees ciphertext — zero-
 * knowledge. The DEK is WRAPPED (AES-GCM) by a Key Encryption Key (KEK) derived from the shared project
 * passphrase (PBKDF2-HMAC-SHA256), and the wrapped DEK + a random salt live SERVER-SIDE (the keystore). The
 * server never sees the passphrase, the KEK, or the plaintext DEK, so it still can't decrypt anything.
 *
 * Why envelope (vs. deriving the file key straight from the passphrase, the old scheme):
 *  - Passphrase change / recovery re-wraps the SAME DEK — no re-encrypting every file.
 *  - The wrapped DEK's GCM auth tag IS the verifier: a wrong passphrase fails to unwrap → we say "wrong
 *    passphrase" instead of failing OPEN. Because the keystore is server-side, this works on a NEW device
 *    too — killing the old localStorage-verifier's fail-open-on-a-fresh-browser bug (which forked blobs when
 *    a wrong passphrase was accepted and then used to encrypt).
 *
 * IV: a fresh random 12 bytes per file, prepended to the ciphertext. Keys live in memory only.
 */

import { bfetch } from "./bridge-fetch";

const enc = new TextEncoder();
const PBKDF2_ITERS = 210_000; // OWASP guidance for PBKDF2-HMAC-SHA256

/** The per-project keystore (safe to store server-side — useless without the passphrase). */
export interface Keystore {
  v: 1;
  alg: "AES-GCM-256";
  salt: string;        // b64 random PBKDF2 salt
  iters: number;
  wrap_iv: string;     // b64 IV used to wrap the DEK
  wrapped_dek: string; // b64 DEK wrapped (AES-GCM) under the passphrase-derived KEK
}

// Unwrapped DEKs live in memory only — cleared on reload or lock(). Never persisted.
const deks = new Map<string, CryptoKey>();

// ── base64 helpers ─────────────────────────────────────────────────────────────
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

// ── envelope primitives (pure — unit-tested) ───────────────────────────────────
async function deriveKek(passphrase: string, salt: Uint8Array, iters: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** New project keystore: random salt + random DEK, wrapped under the passphrase. Returns the keystore + DEK. */
export async function createKeystore(passphrase: string): Promise<{ keystore: Keystore; dek: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // extractable so wrapKey can read the key material INTO the wrap (JS never sees the raw bytes — we never call exportKey).
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv }));
  return {
    keystore: { v: 1, alg: "AES-GCM-256", salt: b64(salt), iters: PBKDF2_ITERS, wrap_iv: b64(iv), wrapped_dek: b64(wrapped) },
    dek,
  };
}

/** Open an existing keystore. THROWS on a wrong passphrase (the GCM tag fails to unwrap) — the verifier. */
export async function openKeystore(ks: Keystore, passphrase: string): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, unb64(ks.salt), ks.iters);
  return crypto.subtle.unwrapKey(
    "raw", unb64(ks.wrapped_dek), kek, { name: "AES-GCM", iv: unb64(ks.wrap_iv) },
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"],
  );
}

/** Change passphrase: verify the old one, then re-wrap the SAME DEK under the new one (files unchanged). */
export async function rewrapKeystore(ks: Keystore, oldPass: string, newPass: string): Promise<Keystore> {
  const dek = await openKeystore(ks, oldPass); // throws if oldPass is wrong
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(newPass, salt, PBKDF2_ITERS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv }));
  return { v: 1, alg: "AES-GCM-256", salt: b64(salt), iters: PBKDF2_ITERS, wrap_iv: b64(iv), wrapped_dek: b64(wrapped) };
}

// ── in-memory DEK cache + file crypto ──────────────────────────────────────────
export const isUnlocked = (projectKey: string): boolean => deks.has(projectKey);
export const lockProject = (projectKey: string): void => void deks.delete(projectKey);
/** Cache an already-unwrapped DEK for a project (used by unlock + tests). */
export const setUnlocked = (projectKey: string, dek: CryptoKey): void => void deks.set(projectKey, dek);

function requireDek(projectKey: string): CryptoKey {
  const d = deks.get(projectKey);
  if (!d) throw new Error(`Project "${projectKey}" is locked — unlock it with the project passphrase first.`);
  return d;
}

/** Encrypt bytes → (IV ‖ ciphertext) under the project's DEK. */
export async function encryptBytes(projectKey: string, data: ArrayBuffer): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, requireDek(projectKey), data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

/** Decrypt (IV ‖ ciphertext) → plaintext. Throws on wrong key / tampering (GCM auth). */
export async function decryptBytes(projectKey: string, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const buf = new Uint8Array(blob);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, requireDek(projectKey), buf.slice(12));
}

// ── unlock orchestration (fetches the server-side keystore; creates it on genuine first use) ────────────
const keystoreUrl = (base: string, projectKey: string) =>
  `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(projectKey)}/keystore`;

async function getKeystore(base: string, projectKey: string): Promise<Keystore | null> {
  try {
    const r = await bfetch(keystoreUrl(base, projectKey));
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.wrapped_dek ? (d as Keystore) : null;
  } catch {
    return null;
  }
}

/**
 * A human-readable reason a passphrase is too weak to CREATE a project keystore, or null if acceptable.
 * Length-first by design — a shared project passphrase (e.g. four random words) beats character-class rules,
 * and the keystore is the only secret protecting the whole project's encrypted files (F7). Enforced only at
 * first-time setup; existing keystores are never re-gated, and createKeystore stays unguarded for tests.
 */
export function passphraseIssue(pw: string): string | null {
  const p = pw ?? "";
  if (p.length < 12) return "Use at least 12 characters — a memorable passphrase (e.g. four random words) is ideal.";
  if (/^(.)\1+$/.test(p)) return "Too repetitive — use a longer, more varied passphrase.";
  if (["passwordpassword", "123456789012", "changemechangeme"].includes(p.toLowerCase()))
    return "That passphrase is too common — choose something unique to this project.";
  return null;
}

/**
 * Unlock a project with its shared passphrase. If a server keystore exists, the passphrase is VERIFIED by
 * unwrapping the DEK (cross-device, no fail-open). If none exists, this is genuine first-time setup: a new
 * keystore is created (insert-only, so a concurrent first-setup can't clobber the DEK that already encrypted
 * files — the loser re-opens the winner's keystore). Returns firstUse=true only when THIS call created it.
 */
export async function unlockAndVerify(
  base: string,
  projectKey: string,
  passphrase: string,
): Promise<{ ok: boolean; firstUse: boolean; reason?: string }> {
  const existing = await getKeystore(base, projectKey);
  if (existing) {
    try {
      deks.set(projectKey, await openKeystore(existing, passphrase));
      return { ok: true, firstUse: false };
    } catch {
      return { ok: false, firstUse: false }; // wrong passphrase — GCM auth failed, no fail-open
    }
  }
  // First-time setup for this project — enforce a minimum passphrase strength HERE (createKeystore stays
  // unguarded so the pure tests can use short fixtures). Existing keystores are never re-gated.
  const issue = passphraseIssue(passphrase);
  if (issue) return { ok: false, firstUse: true, reason: issue };
  const { keystore, dek } = await createKeystore(passphrase);
  try {
    const r = await bfetch(keystoreUrl(base, projectKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keystore),
    });
    if (r.status === 409) {
      // Someone set it up first — open THEIR keystore with the entered passphrase.
      const other = await getKeystore(base, projectKey);
      if (other) {
        try {
          deks.set(projectKey, await openKeystore(other, passphrase));
          return { ok: true, firstUse: false };
        } catch {
          return { ok: false, firstUse: false };
        }
      }
    }
  } catch {
    /* offline — hold the DEK for this session; it'll persist on the next successful setup */
  }
  deks.set(projectKey, dek);
  return { ok: true, firstUse: true };
}
