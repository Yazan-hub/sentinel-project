// config/.env loader — builtin-only (no deps), shared by bcf-service.mjs, mcp-server.mjs and
// thatopen-client.mjs so none of them need to statically pull in @thatopen/services just to read env.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
