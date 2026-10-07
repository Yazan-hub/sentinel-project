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
  v: 1 | 2;
  alg: "AES-GCM-256";
  salt: string;        // b64 random PBKDF2 salt
  iters: number;
  wrap_iv: string;     // b64 IV used to wrap the DEK
  wrapped_dek: string; // b64 DEK wrapped (AES-GCM) under the passphrase-derived KEK
  // SEC-8 (S38), a key rotation: the current DEK's id (1 when absent — every keystore before its first rotation); the previous
  // DEK, wrapped under the same passphrase, kept while the files are re-sealed; the walk's progress marker.
  kid?: number;
  retired?: { kid: number; wrap_iv: string; wrapped_dek: string };
  rotating?: { from: number; to: number; done: number; total: number };
}

// Unwrapped DEKs live in memory only — cleared on reload or lock(). Never persisted. Per project: the current key's id and
// every key the session can open a file with (the current one, and the retired one while a rotation is under way).
interface Held { kid: number; keys: Map<number, CryptoKey> }
const deks = new Map<string, Held>();

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

/** New project keystore: random salt + random DEK, wrapped under the passphrase. Returns the keystore + the DEK as a
 *  key that cannot be exported (SEC-5): the extractable one exists only for the wrap. */
export async function createKeystore(passphrase: string): Promise<{ keystore: Keystore; dek: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // extractable so wrapKey can read the key material INTO the wrap (JS never sees the raw bytes — we never call exportKey).
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv }));
  const kept = await crypto.subtle.unwrapKey("raw", wrapped, kek, { name: "AES-GCM", iv }, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return {
    keystore: { v: 1, alg: "AES-GCM-256", salt: b64(salt), iters: PBKDF2_ITERS, wrap_iv: b64(iv), wrapped_dek: b64(wrapped) },
    dek: kept,
  };
}

const unwrapDek = (kek: CryptoKey, iv: string, wrapped: string, extractable: boolean) =>
  crypto.subtle.unwrapKey("raw", unb64(wrapped), kek, { name: "AES-GCM", iv: unb64(iv) }, { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<{ wrap_iv: string; wrapped_dek: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { wrap_iv: b64(iv), wrapped_dek: b64(new Uint8Array(await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv }))) };
}

/** Open every key of a keystore: the current one and, while a rotation is under way, the retired one (SEC-8). THROWS on a
 *  wrong passphrase (the GCM tag fails to unwrap) — the verifier. Not exportable unless `extractable` (a re-key's own copy). */
export async function openKeys(ks: Keystore, passphrase: string, extractable = false): Promise<Held> {
  const kek = await deriveKek(passphrase, unb64(ks.salt), ks.iters);
  const kid = ks.kid ?? 1;
  const keys = new Map([[kid, await unwrapDek(kek, ks.wrap_iv, ks.wrapped_dek, extractable)]]);
  if (ks.retired) keys.set(ks.retired.kid, await unwrapDek(kek, ks.retired.wrap_iv, ks.retired.wrapped_dek, extractable));
  return { kid, keys };
}

/** Open an existing keystore's current key. THROWS on a wrong passphrase (the GCM tag fails to unwrap) — the verifier. The
 *  DEK cannot be exported unless `extractable` (a re-key's own short-lived copy, SEC-5). */
export async function openKeystore(ks: Keystore, passphrase: string, extractable = false): Promise<CryptoKey> {
  const held = await openKeys(ks, passphrase, extractable);
  return held.keys.get(held.kid)!;
}

/** Change passphrase: verify the old one, then re-wrap the SAME keys under the new one (files unchanged) — the retired key
 *  too while a rotation is under way (SEC-8), so a change mid-rotation loses no file. */
export async function rewrapKeystore(ks: Keystore, oldPass: string, newPass: string): Promise<Keystore> {
  const held = await openKeys(ks, oldPass, true); // throws if oldPass is wrong; extractable for the wraps below only
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(newPass, salt, PBKDF2_ITERS);
  const out: Keystore = { ...ks, salt: b64(salt), iters: PBKDF2_ITERS, ...(await wrapDek(held.keys.get(held.kid)!, kek)) };
  if (ks.retired) out.retired = { kid: ks.retired.kid, ...(await wrapDek(held.keys.get(ks.retired.kid)!, kek)) };
  return out;
}

/** SEC-8 (S38): a real rotation — a new DEK (the next key id) wrapped under the new passphrase, the old DEK kept beside it as
 *  `retired` (wrapped under the same new passphrase) so every file stays readable until the walk has re-sealed it
 *  (secure-store resealFiles). Verifies the old passphrase first (throws); refuses while a rotation is under way, whose
 *  retired key would otherwise be lost. Answers the keystore to store and the session's copies of its keys (not exportable). */
export async function rotateKeystore(ks: Keystore, oldPass: string, newPass: string): Promise<{ keystore: Keystore; held: Held }> {
  if (ks.retired) throw new Error(`A key rotation is already under way (key ${ks.retired.kid} → ${ks.kid}) — nothing was rotated`);
  const old = await openKeys(ks, oldPass, true);
  const from = old.kid, to = from + 1;
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(newPass, salt, PBKDF2_ITERS);
  const current = await wrapDek(dek, kek), retired = { kid: from, ...(await wrapDek(old.keys.get(from)!, kek)) };
  const keystore: Keystore = { v: 2, alg: "AES-GCM-256", salt: b64(salt), iters: PBKDF2_ITERS, kid: to, ...current, retired, rotating: { from, to, done: 0, total: 0 } };
  const keys = new Map([[to, await unwrapDek(kek, current.wrap_iv, current.wrapped_dek, false)], [from, await unwrapDek(kek, retired.wrap_iv, retired.wrapped_dek, false)]]);
  return { keystore, held: { kid: to, keys } };
}

// ── in-memory DEK cache + file crypto ──────────────────────────────────────────
export const isUnlocked = (projectKey: string): boolean => deks.has(projectKey);
export const lockProject = (projectKey: string): void => void deks.delete(projectKey);
/** Cache an already-unwrapped DEK for a project (used by unlock + tests); `kid` is its key id (1 before any rotation). */
export const setUnlocked = (projectKey: string, dek: CryptoKey, kid = 1): void => void deks.set(projectKey, { kid, keys: new Map([[kid, dek]]) });
/** SEC-8: a rotation is under way while the session holds a retired key beside the current one. */
export const rotationUnderWay = (projectKey: string): boolean => (deks.get(projectKey)?.keys.size ?? 0) > 1;
/** SEC-8: the walk re-sealed every file and the keystore dropped the retired key — the session drops it too. */
export const retireKey = (projectKey: string, kid: number): void => void deks.get(projectKey)?.keys.delete(kid);

function requireKeys(projectKey: string): Held {
  const d = deks.get(projectKey);
  if (!d) throw new Error(`Project "${projectKey}" is locked — unlock it with the project passphrase first.`);
  return d;
}

// SEC-8 (S38): a file sealed after a rotation names its key — "SNK" 0x01, the key id (uint32, big-endian), then IV ‖ ciphertext.
// A file with no header is key 1: every file sealed before the first rotation, byte for byte as before.
const MAGIC = [0x53, 0x4e, 0x4b, 0x01];
export function blobKid(buf: Uint8Array): { kid: number; body: Uint8Array; header: boolean } {
  if (buf.length > 8 && MAGIC.every((b, i) => buf[i] === b)) return { kid: new DataView(buf.buffer, buf.byteOffset, 8).getUint32(4), body: buf.subarray(8), header: true };
  return { kid: 1, body: buf, header: false };
}

/** Encrypt bytes → ([header ‖] IV ‖ ciphertext) under the project's current DEK — a header from key 2 on (blobKid). */
export async function encryptBytes(projectKey: string, data: ArrayBuffer): Promise<Uint8Array> {
  const held = requireKeys(projectKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, held.keys.get(held.kid)!, data);
  const head = held.kid > 1 ? 8 : 0;
  const out = new Uint8Array(head + iv.length + ct.byteLength);
  if (head) { out.set(MAGIC, 0); new DataView(out.buffer).setUint32(4, held.kid); }
  out.set(iv, head);
  out.set(new Uint8Array(ct), head + iv.length);
  return out;
}

/** Decrypt ([header ‖] IV ‖ ciphertext) → plaintext with the key the file names. Throws on wrong key / tampering (GCM auth),
 *  and in words when the session does not hold the file's key (a rotation since it unlocked). */
export async function decryptBytes(projectKey: string, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const held = requireKeys(projectKey);
  const buf = new Uint8Array(blob);
  const { kid, body, header } = blobKid(buf);
  const open = (key: CryptoKey, b: Uint8Array) => crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12));
  const key = held.keys.get(kid);
  if (key) { try { return await open(key, body); } catch { /* the keys held, below */ } }
  // A file with no header that an older web sealed under the current key, or one from before the first rotation whose
  // random IV happened to begin with the header's bytes: read whole with each key held (GCM refuses every wrong one).
  for (const k of [...held.keys.values()]) if (k !== key || header) { try { return await open(k, buf); } catch { /* next */ } }
  if (key) throw new Error("This file did not open with the project's key (it was changed or cut) — nothing was read");
  throw new Error(`This file is sealed under key ${kid}, which this session does not hold — the project's key was rotated: lock (🔓) and unlock again`);
}

// ── unlock orchestration (fetches the server-side keystore; creates it on genuine first use) ────────────
const keystoreUrl = (base: string, projectKey: string) =>
  `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(projectKey)}/keystore`;

// SEC-5 (S39): "absent" is only the bridge's 200 null; anything else that is not a keystore is a failed read — never a
// first use, which would create a second key for the project.
// A read the bridge refused (401, 403, 404) or a keystore with no wrapped key does not get better by trying again.
export type KeystoreRead = { state: "absent" } | { state: "present"; ks: Keystore } | { state: "error"; why: string; retry: boolean };
export async function getKeystore(base: string, projectKey: string): Promise<KeystoreRead> {
  let r: Response;
  try { r = await bfetch(keystoreUrl(base, projectKey)); }
  catch (e) { return { state: "error", why: (e as Error)?.message || String(e), retry: true }; }
  if (!r.ok) {
    const m = ((await r.json().catch(() => null)) as { message?: string } | null)?.message;
    return { state: "error", why: `the bridge answered HTTP ${r.status}${m ? `: ${m}` : ""}`, retry: ![401, 403, 404].includes(r.status) };
  }
  let d: unknown;
  try { d = await r.json(); }
  catch { return { state: "error", why: "the bridge's answer was not JSON", retry: true }; }
  if (d === null) return { state: "absent" };
  return d && typeof d === "object" && (d as Keystore).wrapped_dek ? { state: "present", ks: d as Keystore } : { state: "error", why: "the stored keystore holds no wrapped key", retry: false };
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
  if (existing.state === "error") return { ok: false, firstUse: false, reason: `Could not read the project keystore (${existing.why}) — nothing was unlocked${existing.retry ? "; try again" : ""}` };
  if (existing.state === "present") {
    try {
      deks.set(projectKey, await openKeys(existing.ks, passphrase));
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
      if (other.state === "present") {
        try {
          deks.set(projectKey, await openKeys(other.ks, passphrase));
          return { ok: true, firstUse: false };
        } catch {
          return { ok: false, firstUse: false };
        }
      }
      // A keystore exists but can't be read (a GET refused, or a leftover without wrapped_dek): holding the new DEK
      // would encrypt this session's files under a key the project never stored.
      return { ok: false, firstUse: false, reason: "A keystore exists for this project but could not be read — nothing was set up" };
    } else if (!r.ok) {
      // Refused (setting up the project's passphrase is a lead's — H0 D4): not a first use. Holding the new DEK would
      // encrypt this session's files under a key the project never stored — unreadable to everyone afterwards.
      const j = (await r.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, firstUse: true, reason: `Not set up — ${j?.message || `the bridge answered HTTP ${r.status}`}` };
    }
  } catch {
    // SEC-5 (S39): the keystore may not have been stored — a key held now could seal this session's files under a key no
    // one keeps. The next unlock reads what the bridge holds.
    return { ok: false, firstUse: true, reason: "Could not reach the bridge — the passphrase may not have been stored; unlock again with the same passphrase" };
  }
  setUnlocked(projectKey, dek);
  return { ok: true, firstUse: true };
}

/** SEC-8 (S38): a session unlocked before a key rotation holds a key the project no longer seals with — a file it sealed now
 *  would be unreadable to everyone else once that key is retired. Asked after an upload and before its reference is
 *  registered (secure-store putEncryptedFile), so a refusal attaches nothing. A keystore that cannot be read is a refusal. */
export async function assertCurrentKey(base: string, projectKey: string): Promise<void> {
  const held = requireKeys(projectKey);
  const read = await getKeystore(base, projectKey);
  if (read.state !== "present") throw new Error(`Could not read the project keystore (${read.state === "error" ? read.why : "none is stored"}) — nothing was attached`);
  if ((read.ks.kid ?? 1) !== held.kid) throw new Error("The project's key was rotated since this session unlocked — lock (🔓) and unlock again; nothing was attached");
}

/** SEC-8: store a keystore over the one read — `replaces` names the wrapped key that was read; the bridge refuses a keystore
 *  that changed since, or a key id that goes back (409 in words). Answers null when stored, else the refusal in words. */
export async function putKeystore(base: string, projectKey: string, ks: Keystore, replaces: string): Promise<string | null> {
  try {
    const r = await bfetch(keystoreUrl(base, projectKey), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ks, replaces }) });
    if (r.ok) return null;
    const m = ((await r.json().catch(() => null)) as { message?: string } | null)?.message;
    return `the bridge answered HTTP ${r.status}${m ? `: ${m}` : ""}`;
  } catch (e) { return (e as Error)?.message || String(e); }
}

/** SEC-8 (S38): rotate the project's key (the CDE panel's Rotate key…). The new keystore — both keys, under the new
 *  passphrase — is stored and read back before the session holds the new key, so no file is ever sealed under a key the
 *  project does not keep; secure-store resealFiles then re-seals the files. The passphrases are used here and kept nowhere. */
export async function rotateProjectKey(base: string, projectKey: string, oldPass: string, newPass: string): Promise<{ ok: boolean; line: string }> {
  const read = await getKeystore(base, projectKey);
  if (read.state !== "present") return { ok: false, line: `Could not read the project keystore (${read.state === "error" ? read.why : "none is set up — unlock once to set the passphrase"}) — nothing was rotated` };
  if (read.ks.retired) return { ok: false, line: `A key rotation is already under way (key ${read.ks.retired.kid} → ${read.ks.kid}) — unlock with the new passphrase and press Resume key rotation; nothing was rotated` };
  let next: { keystore: Keystore; held: Held };
  try { next = await rotateKeystore(read.ks, oldPass, newPass); }
  catch { return { ok: false, line: "Wrong old passphrase — nothing was rotated" }; }
  const refused = await putKeystore(base, projectKey, next.keystore, read.ks.wrapped_dek);
  const back = await getKeystore(base, projectKey);
  if (!(back.state === "present" && back.ks.wrapped_dek === next.keystore.wrapped_dek)) {
    return { ok: false, line: refused && back.state === "present"
      ? `The new key was not stored (${refused}) — nothing was rotated; the old passphrase still opens the project`
      : "The new key could not be read back — no file was re-sealed; unlock with the new passphrase (else the old one), then press Resume key rotation" };
  }
  deks.set(projectKey, next.held);
  return { ok: true, line: `Key ${next.keystore.kid} stored beside key ${next.keystore.retired!.kid} — re-sealing the encrypted files…` };
}
