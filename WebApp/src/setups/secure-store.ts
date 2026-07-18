import { encryptBytes, decryptBytes } from "./crypto";

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

/** Encrypt a file client-side, upload only the ciphertext, cache it locally, and return its ref. */
export async function putEncryptedFile(base: string, projectKey: string, file: File): Promise<StoredFile> {
  const cipher = await encryptBytes(projectKey, await file.arrayBuffer());
  const r = await fetch(`${base.replace(/\/$/, "")}/cde/files`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: cipher,
  });
  if (!r.ok) throw new Error(`Upload failed (HTTP ${r.status})`);
  const { id } = await r.json();
  await cachePut(id, cipher.buffer);
  return { id, name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
}

/** Fetch the ciphertext for a ref (cache-first) and decrypt it to plaintext bytes. */
export async function getDecryptedFile(base: string, projectKey: string, id: string): Promise<ArrayBuffer> {
  let cipher = await cacheGet(id);
  if (!cipher) {
    const r = await fetch(`${base.replace(/\/$/, "")}/cde/files/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`Download failed (HTTP ${r.status})`);
    cipher = await r.arrayBuffer();
    await cachePut(id, cipher);
  }
  return decryptBytes(projectKey, cipher);
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
