// Shared That Open Platform upload helpers for the Sentinel Bridge.
// Wraps the official @thatopen/services client so both the one-shot uploader (upload-ifc.mjs)
// and the outbox watcher (watch-outbox.mjs) use the exact same, verified upload path.

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EngineServicesClient } from "@thatopen/services";

/**
 * Load config/.env and make it AUTHORITATIVE — its values override any pre-existing process.env
 * (unlike process.loadEnvFile, which silently keeps a stale shell/Windows env var and shadows the
 * file). Also strips quotes and trailing CR so a CRLF file or quoted value can't corrupt a token.
 */
export function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fromFile = {};
  for (const p of [resolve(here, "../../config/.env"), resolve(here, "../.env")]) {
    let text;
    try { text = readFileSync(p, "utf8"); } catch { continue; } // not there — try next
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      fromFile[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); // strip quotes/whitespace (& CR)
    }
    break; // first file found wins
  }
  return fromFile; // getConfig treats these as authoritative over process.env
}

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
