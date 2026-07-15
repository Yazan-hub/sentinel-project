// Sentinel → That Open Platform bridge — outbox watcher.
//
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that the Revit "Publish to Platform"
// command exports into, and uploads each new IFC to the project's CDE via the shared, verified
// upload path. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
//
// Usage:
//   node bridge/watch-outbox.mjs [--once] [--dry-run]
//     --once      sweep whatever is already in the outbox, then exit (no long-running watch)
//     --dry-run   detect + report what WOULD upload; do not upload or move anything
//
// Config: THATOPEN_API_KEY, THATOPEN_PROJECT_ID (config/.env). Outbox override: SENTINEL_OUTBOX.

import { watch } from "node:fs";
import { readdir, stat, mkdir, rename } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";
import { getConfig, createClient, uploadFile, uploadBytes } from "./thatopen-client.mjs";
import { ifcToFrag } from "./ifc-to-frag.mjs";

const ONCE = process.argv.includes("--once");
const DRY = process.argv.includes("--dry-run");

const OUTBOX = process.env.SENTINEL_OUTBOX
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "outbox");
const SENT = join(OUTBOX, "sent");
const UPLOAD_EXTS = new Set([".ifc"]);

const cfg = getConfig();                 // throws with a clear message if unconfigured
const client = DRY ? null : createClient(cfg);
await mkdir(OUTBOX, { recursive: true });
if (!DRY) await mkdir(SENT, { recursive: true });

const inFlight = new Set();
const ts = () => new Date().toISOString();

/** Wait until a file's size stops changing (so we don't upload a half-written export). */
async function waitStable(p) {
  let last = -1;
  for (let i = 0; i < 30; i++) {
    let s;
    try { s = await stat(p); } catch { return false; } // vanished (e.g. moved) — skip
    if (!s.isFile()) return false;
    if (s.size > 0 && s.size === last) return true;
    last = s.size;
    await new Promise((r) => setTimeout(r, 500));
  }
  return true; // give up waiting; treat as stable
}

async function handle(name) {
  if (!name || !UPLOAD_EXTS.has(extname(name).toLowerCase())) return;
  const p = join(OUTBOX, name);
  if (inFlight.has(p)) return;
  inFlight.add(p);
  try {
    if (!(await waitStable(p))) return;
    if (DRY) { console.log(`[${ts()}] would upload: ${name}`); return; }

    console.log(`[${ts()}] uploading ${name} …`);
    // Keep the FULL filename (with .ifc) as the item name — the platform derives fileExtension from
    // it and only auto-converts recognised IFCs to viewable .frag. Stripping it left files unviewable.
    // Convert locally and upload ONLY the .frag (the viewable format). The .ifc upload is skipped —
    // it just triggers the platform's slow, size-limited server-side conversion. If conversion fails,
    // fall back to uploading the .ifc so the model still lands. (handle() only sees .ifc here.)
    const fragName = name.replace(/\.ifc$/i, ".frag");
    try {
      console.log(`[${ts()}] converting ${name} → fragments …`);
      const fragBytes = await ifcToFrag(p);
      const { result, size } = await uploadBytes(client, cfg.projectId, fragBytes, fragName);
      console.log(`  ✅ ${fragName} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (.ifc skipped)`);
    } catch (e) {
      console.error(`  ⚠ frag conversion failed for ${name}: ${e?.message || e} — uploading .ifc instead`);
      const { result, size } = await uploadFile(client, cfg.projectId, p, { name });
      console.log(`  ✅ ${name} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (fallback)`);
    }

    await rename(p, join(SENT, `${Date.now()}_${name}`)); // out of the outbox so it isn't re-sent
  } catch (e) {
    console.error(`  ❌ ${name}: ${e?.message || e}`);
  } finally {
    inFlight.delete(p);
  }
}

// Initial sweep of anything already sitting in the outbox.
for (const f of await readdir(OUTBOX)) {
  const s = await stat(join(OUTBOX, f)).catch(() => null);
  if (s?.isFile()) await handle(f);
}

if (ONCE) {
  console.log(`[${ts()}] --once sweep complete.`);
  process.exit(0);
}

console.log(`[${ts()}] watching ${OUTBOX}${DRY ? " (dry-run)" : ""} … Ctrl+C to stop.`);
watch(OUTBOX, (_event, filename) => { handle(filename); });
