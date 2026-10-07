import { encryptBytes, decryptBytes, assertCurrentKey, blobKid, getKeystore, putKeystore, retireKey } from "./crypto";
import { bfetch } from "./bridge-fetch";
import { sha256Hex } from "./geometry-check";

/**
 * Encrypted file storage + local cache (Phase 2). Files are encrypted client-side (crypto.ts); only the
 * ciphertext is uploaded to the bridge (`/cde/files`), which persists it as an opaque blob on disk — the
 * server never holds a key or plaintext. An IndexedDB cache keeps ciphertext blobs locally, keyed by blobId,
 * for offline reads and instant re-open. Plaintext is NEVER persisted — it's decrypted on demand and handed
 * straight to the caller (download / preview).
 */

const DB_NAME = "sentinel-cde-cache";
const STORE = "blobs";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(id: string): Promise<ArrayBuffer | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null; // IndexedDB unavailable (private mode) → fall back to network
  }
}

async function cachePut(id: string, buf: ArrayBuffer): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(buf, id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    /* cache is best-effort */
  }
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

/** The bridge's own words for a refusal (a 403 names the missing role or office), else the status. */
async function failure(r: Response, what: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  return `${what} failed (HTTP ${r.status})${j?.message ? `: ${j.message}` : ""}`;
}

/** Encrypt a file client-side, upload only the ciphertext, cache it locally, and return its ref. The bridge keeps each
 *  blob in its project's folder and checks the caller against that project (H0), so the upload names it. */
export async function putEncryptedFile(base: string, projectKey: string, file: File): Promise<StoredFile> {
  const cipher = await encryptBytes(projectKey, await file.arrayBuffer());
  const r = await bfetch(`${base.replace(/\/$/, "")}/cde/files?project=${encodeURIComponent(projectKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: cipher,
  });
  if (!r.ok) throw new Error(await failure(r, "Upload"));
  const { id } = await r.json();
  // SEC-8: a session that unlocked before a key rotation sealed this under a key the project is retiring — said, and nothing
  // is attached (the blob stays unreferenced). Asked here, after the upload, so the reference is registered right after it.
  await assertCurrentKey(base, projectKey);
  await cachePut(id, cipher.buffer);
  return { id, name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
}

/** Fetch the ciphertext for a ref (cache-first) and decrypt it to plaintext bytes. A cached copy that no longer opens (sealed
 *  under a key a rotation has since retired, SEC-8) gives way to the bridge's copy. */
export async function getDecryptedFile(base: string, projectKey: string, id: string): Promise<ArrayBuffer> {
  const cached = await cacheGet(id);
  if (cached) { try { return await decryptBytes(projectKey, cached); } catch { /* re-sealed since: read the bridge's copy */ } }
  const r = await bfetch(`${base.replace(/\/$/, "")}/cde/files/${encodeURIComponent(id)}?project=${encodeURIComponent(projectKey)}`);
  if (!r.ok) throw new Error(await failure(r, "Download"));
  const cipher = await r.arrayBuffer();
  await cachePut(id, cipher);
  return decryptBytes(projectKey, cipher);
}

/** SEC-8 (S38): after rotateProjectKey, re-seal every encrypted file of the project under its current key (`say` gets each
 *  step in words). Resumable: a file already under the current key is passed over, so a closed tab — unlocked again with the
 *  new passphrase — picks up where it stopped (the keystore's `rotating` marker counts the progress). Each file is read from
 *  the bridge, opened with the key its header names, sealed again, checked to open to the same bytes, and sent with its
 *  sha256; the bridge swaps it in whole or not at all, so a failed step leaves the old blob readable under the retired key.
 *  The list is read again until it holds no file the walk has not seen (one attached meanwhile). The retired key leaves the
 *  keystore only when every file is re-sealed. Answers true when the rotation is complete. */
export async function resealFiles(base: string, projectKey: string, say: (line: string) => void): Promise<boolean> {
  const root = base.replace(/\/$/, ""), p = encodeURIComponent(projectKey);
  const read = await getKeystore(base, projectKey);
  if (read.state !== "present") { say(`Could not read the project keystore (${read.state === "error" ? read.why : "none is set up"}) — nothing was re-sealed`); return false; }
  const ks = read.ks;
  if (!ks.retired) { say("No key rotation is under way for this project."); return true; }
  const from = ks.retired.kid, to = ks.kid ?? 1;
  const seen = new Set<string>(), failed: string[] = [];
  let done = 0;
  for (;;) {
    let ids: string[];
    try {
      const r = await bfetch(`${root}/cde/${p}/keystore/refs`);
      if (!r.ok) { say(`${await failure(r, "Listing the encrypted files")} — key ${from} stays; press Resume key rotation`); return false; }
      ids = ((await r.json()) as { ids: string[] }).ids;
    } catch (e) { say(`Listing the encrypted files failed (${(e as Error)?.message || e}) — key ${from} stays; press Resume key rotation`); return false; }
    const fresh = ids.filter((id) => !seen.has(id));
    if (!fresh.length) break;
    for (const id of fresh) seen.add(id);
    for (const id of fresh) {
      try { await reseal(`${root}/cde/files/${encodeURIComponent(id)}?project=${p}`, projectKey, id, to); done++; }
      catch (e) { failed.push(`${id}: ${(e as Error)?.message || e}`); }
      say(`Re-sealing the encrypted files under key ${to}: ${done} of ${seen.size}${failed.length ? ` (${failed.length} not yet)` : ""}…`);
      await putKeystore(base, projectKey, { ...ks, rotating: { from, to, done, total: seen.size } }, ks.wrapped_dek); // the marker; best effort
    }
  }
  if (failed.length) {
    say(`${done} of ${seen.size} encrypted files re-sealed under key ${to}; ${failed.length} could not be (${failed[0]}${failed.length > 1 ? "; …" : ""}) — key ${from} stays until they are: press Resume key rotation`);
    return false;
  }
  const { retired: _retired, rotating: _rotating, ...finished } = ks;
  const refused = await putKeystore(base, projectKey, finished, ks.wrapped_dek);
  if (refused) { say(`Every encrypted file is re-sealed under key ${to}, but key ${from} was not retired (${refused}) — press Resume key rotation`); return false; }
  retireKey(projectKey, from);
  say(`Key rotated: ${done} encrypted file${done === 1 ? "" : "s"} re-sealed under key ${to}; key ${from} is retired.`);
  return true;
}

async function reseal(url: string, projectKey: string, id: string, to: number): Promise<void> {
  const g = await bfetch(url);
  if (!g.ok) throw new Error(await failure(g, "Download"));
  const old = await g.arrayBuffer();
  if (blobKid(new Uint8Array(old)).kid === to) return; // re-sealed before (a resumed walk)
  const plain = await decryptBytes(projectKey, old);
  const next = await encryptBytes(projectKey, plain);
  // A session unlocked before a later rotation seals under the key that rotation retires: never sent, never counted.
  const sealed = blobKid(next).kid;
  if (sealed !== to) throw new Error(`this session seals under key ${sealed}, not key ${to} — lock (🔓) and unlock again; the stored file is unchanged`);
  const back = new Uint8Array(await decryptBytes(projectKey, next.buffer as ArrayBuffer)), want = new Uint8Array(plain);
  if (back.length !== want.length || !back.every((b, i) => b === want[i])) throw new Error("the re-sealed copy did not open to the same bytes — the stored file is unchanged");
  // SEC-9: the bridge replaces only the bytes this walker read.
  const put = await bfetch(`${url}&sha256=${await sha256Hex(next.buffer as ArrayBuffer)}&replaces=${await sha256Hex(old)}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: next.buffer as ArrayBuffer });
  if (!put.ok) throw new Error(await failure(put, "Re-seal"));
  await cachePut(id, next.buffer as ArrayBuffer);
}

/** Decrypt a stored file and trigger a browser download of the plaintext. */
export async function downloadDecrypted(base: string, projectKey: string, ref: StoredFile): Promise<void> {
  const plain = await getDecryptedFile(base, projectKey, ref.id);
  const url = URL.createObjectURL(new Blob([plain], { type: ref.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = ref.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
