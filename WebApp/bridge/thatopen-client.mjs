// Shared That Open Platform upload helpers for the Sentinel Bridge.
// Wraps the official @thatopen/services client so both the one-shot uploader (upload-ifc.mjs)
// and the outbox watcher (watch-outbox.mjs) use the exact same, verified upload path.

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { EngineServicesClient } from "@thatopen/services";
import { loadEnv } from "./load-env.mjs";

// Re-exported so cde-store.mjs/ai-gateway.mjs (and anyone else importing loadEnv from here) keep
// working unchanged. bcf-service.mjs/mcp-server.mjs now import it from ./load-env.mjs directly —
// that module has no deps, so those two entrypoints no longer statically pull in @thatopen/services.
export { loadEnv };

/**
 * Resolve platform config. Base host is https://platform.thatopen.com (the SDK appends /api/…);
 * "api.thatopen.com" from the SDK docs is NOT a real host. Throws listing any missing values.
 */
export function getConfig() {
  const file = loadEnv();
  // config/.env is authoritative: a key PRESENT in the file (even empty) wins; fall back to a real
  // env var only when the file omits the key entirely. Stops a stale Windows User env var (e.g. an
  // old deleted token) from shadowing the file, and reading from the object sidesteps the Windows
  // quirk where process.env can't be overwritten/cleared with an empty string.
  const pick = (k) => ((k in file) ? file[k] : (process.env[k] || "")).trim();
  const token = pick("THATOPEN_API_KEY");
  const projectId = pick("THATOPEN_PROJECT_ID");
  const apiUrl = pick("THATOPEN_API_BASE_URL") || "https://platform.thatopen.com";
  const missing = [];
  if (!token) missing.push("THATOPEN_API_KEY");
  if (!projectId) missing.push("THATOPEN_PROJECT_ID");
  if (missing.length) {
    throw new Error(`Missing config: ${missing.join(", ")}. Set them in config/.env (never commit it).`);
  }
  return { token, projectId, apiUrl };
}

/** A platform API token authenticates as an accessToken query param (default). useBearer is JWT-only. */
export function createClient({ token, apiUrl }) {
  return new EngineServicesClient(token, apiUrl, { retries: 2 });
}

/**
 * Upload raw bytes as a named File. Pass a File (not a bare Blob): the platform derives
 * fileExtension from the File's NAME, so name it "<x>.ifc" / "<x>.frag" accordingly.
 */
export async function uploadBytes(client, projectId, bytes, name, versionTag = "v1") {
  const file = new File([bytes], name, { type: "application/octet-stream" });
  const result = await client.createFile({ file, name, versionTag, projectId });
  return { result, size: bytes.length };
}

/** Upload one file from disk into the project's CDE via the Files API. */
export async function uploadFile(client, projectId, filePath, { name, versionTag = "v1" } = {}) {
  const bytes = await readFile(filePath);
  return uploadBytes(client, projectId, bytes, name || basename(filePath), versionTag);
}
