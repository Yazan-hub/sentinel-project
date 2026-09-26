// Sentinel → That Open Platform bridge — outbox watcher.
//
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that Revit publishes into, and uploads each new IFC to
// That Open Platform via the shared, verified upload path. Where the geometry lands in the CDE is read from the IFC's
// sidecar (<name>.ifc.meta.json) and nothing else (spec Decision 6, outbox-logic.mjs): a sidecar version_id → attach
// the platform item to that version; a pre-5b sidecar with no version_id → register a version by file name; no
// sidecar, or one naming no project → the IFC moves to outbox\unbound\ with one log line, never uploaded or
// registered. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
//
// Usage:
//   node bridge/watch-outbox.mjs [--once] [--dry-run]
//     --once      sweep whatever is already in the outbox, then exit (no long-running watch)
//     --dry-run   detect + report what WOULD upload; do not upload or move anything
//
// Config: THATOPEN_API_KEY, THATOPEN_PROJECT_ID (config/.env). Outbox override: SENTINEL_OUTBOX.

import { watch } from "node:fs";
import { readdir, stat, mkdir, rename, readFile, unlink } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";
import { getConfig, createClient, uploadFile, uploadBytes } from "./thatopen-client.mjs";
import { ifcToFrag } from "./ifc-to-frag.mjs";
import { outboxDecision } from "./outbox-logic.mjs";

const ONCE = process.argv.includes("--once");
const DRY = process.argv.includes("--dry-run");

const OUTBOX = process.env.SENTINEL_OUTBOX
  || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "outbox");
const SENT = join(OUTBOX, "sent");
const UNBOUND = join(OUTBOX, "unbound"); // an IFC whose sidecar names no project waits here, not uploaded
const UPLOAD_EXTS = new Set([".ifc"]);

// --dry-run only detects + reports, so it must not need credentials — resolve config lazily so the
// outbox path can be validated offline (getConfig throws when THATOPEN_API_KEY/PROJECT_ID is missing).
const cfg = DRY ? null : getConfig();
const client = DRY ? null : createClient(cfg);
await mkdir(OUTBOX, { recursive: true });
if (!DRY) for (const d of [SENT, UNBOUND]) await mkdir(d, { recursive: true });

const inFlight = new Set();
const ts = () => new Date().toISOString();

/**
 * Put an uploaded outbox file's geometry on its CDE version, as the sidecar decided (outboxDecision): "attach" → the
 * platform item goes on the sidecar's version by id (cde.attachGeometry — that version of that project, once);
 * "register" (a pre-5b sidecar with no version_id) → a version by the .ifc name, as before, with attach_geometry:
 * true spelled out (the by-name attach is opt-in since 5a; this path goes in 5b). Never throws: the upload has
 * already happened, so a failure logs one line naming the platform item that is on no version, and returns null.
 */
async function recordVersion(d, name, sizeBytes, itemId) {
  const orphan = `platform item ${itemId || "(none returned)"} is on no version`;
  try {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) { console.error(`  ⚠ CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY) — ${name}: ${orphan}`); return null; }
    if (d.action === "attach") {
      const r = await cde.attachGeometry(d.project, d.version_id, itemId);
      console.log(`  📎 geometry attached to ${r.iso_name} ${r.version.revision} (version ${r.version.id}, project ${d.project})${r.audit_id ? ` · ledger #${r.audit_id}` : " · ledger row not returned"}`);
      return { key: d.project, ...r };
    }
    const r = await cde.registerFileVersion(d.project, {
      name, author: "outbox", size_bytes: sizeBytes, platform_item_id: itemId || null, attach_geometry: true,
      parent_name: d.host, // linked model → nests under its host in the file tree
      notes: d.host ? `linked model of ${d.host} (outbox watcher)` : "uploaded via outbox watcher",
    });
    console.log(`  📚 versioned ${name} in the CDE (project ${d.project}${d.host ? `, link of ${d.host}` : ""}; pre-5b sidecar, no version_id: ${r.linked ? "attached by name to the live version without geometry" : "a new version"})`);
    return { key: d.project, ...r };
  } catch (e) {
    console.error(`  ⚠ ${d.action === "attach" ? `geometry not attached to version ${d.version_id}` : "version register failed"} for ${name} on ${d.project}: ${e?.message || e} — ${orphan}`);
    return null;
  }
}

/**
 * Manifest capture after a successful version register (Federation Gate input). Best-effort: logs
 * and swallows any failure so a manifest problem never breaks the outbox upload itself. Shared by
 * both handle() call sites (frag success + .ifc fallback) so the capture/logging logic lives once.
 */
async function captureAfterRegister(reg, name, filePath) {
  if (!reg?.version?.id) return;
  try {
    const { captureManifest } = await import("./manifest-store.mjs");
    const mf = await captureManifest(reg.key, reg.version.id, await readFile(filePath), { actor: "outbox", source: "outbox", rev_code: reg.version.revision });
    console.log(`  🧭 manifest: ${mf.elements} element(s), ${mf.levels} level(s), ${mf.grids} grid(s)${mf.has_site ? ", georeferenced" : ""}`);
  } catch (e) {
    console.error(`  ⚠ manifest capture failed for ${name} (version ${reg.version.id}): ${e?.message || e}`);
  }
}

/** The sidecar Revit writes next to each outbox IFC ("<name>.ifc.meta.json"), as text; null when there is none. */
async function readSidecar(ifcPath) {
  try { return await readFile(ifcPath + ".meta.json", "utf8"); } catch { return null; }
}

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
    // Where this publish goes is the sidecar's to say, and nothing else's. Read it again once after 2 s when it is
    // missing or unreadable — Governed Publish copies the IFC in just before it writes the sidecar.
    let d = outboxDecision(await readSidecar(p));
    if (d.action === "unbound") { await new Promise((r) => setTimeout(r, 2000)); d = outboxDecision(await readSidecar(p)); }
    if (d.action === "unbound") {
      if (DRY) { console.log(`[${ts()}] would move ${name} to ${UNBOUND} — ${d.reason}`); return; }
      const parked = join(UNBOUND, `${Date.now()}_${name}`);
      await rename(p, parked);
      await rename(p + ".meta.json", parked + ".meta.json").catch(() => {}); // a sidecar naming no project goes with it
      console.log(`[${ts()}] ⛔ ${name} → ${parked} — ${d.reason}: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.`);
      return;
    }
    const target = d.action === "attach" ? `version ${d.version_id} on ${d.project}` : `${d.project} by file name (pre-5b sidecar, no version_id)`;
    if (DRY) { console.log(`[${ts()}] would upload ${name} → ${target}`); return; }

    console.log(`[${ts()}] uploading ${name} → ${target} …`);
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
      const reg = await recordVersion(d, name, size, result?.item?._id);
      await captureAfterRegister(reg, name, p);
    } catch (e) {
      console.error(`  ⚠ frag conversion failed for ${name}: ${e?.message || e} — uploading .ifc instead`);
      const { result, size } = await uploadFile(client, cfg.projectId, p, { name });
      console.log(`  ✅ ${name} (${size.toLocaleString()} bytes) → item ${result?.item?._id}  (fallback)`);
      const reg = await recordVersion(d, name, size, result?.item?._id);
      await captureAfterRegister(reg, name, p);
    }

    await rename(p, join(SENT, `${Date.now()}_${name}`)); // out of the outbox so it isn't re-sent
    await unlink(p + ".meta.json").catch(() => {}); // sidecar consumed with its IFC
  } catch (e) {
    console.error(`  ❌ ${name}: ${e?.message || e}`);
  } finally {
    inFlight.delete(p);
  }
}

/** Scan the whole outbox once, handing every file to handle() (which skips non-.ifc + in-flight). */
async function sweep() {
  let entries;
  try { entries = await readdir(OUTBOX); } catch { return; } // outbox removed mid-run — nothing to do
  for (const f of entries) {
    const s = await stat(join(OUTBOX, f)).catch(() => null);
    if (s?.isFile()) await handle(f);
  }
}

// Initial sweep of anything already sitting in the outbox.
await sweep();

if (ONCE) {
  console.log(`[${ts()}] --once sweep complete.`);
  process.exit(0);
}

console.log(`[${ts()}] watching ${OUTBOX}${DRY ? " (dry-run)" : ""} … Ctrl+C to stop.`);
watch(OUTBOX, (_event, filename) => { handle(filename); });

// Safety net: fs.watch can silently miss events on some filesystems (network shares, WSL), and a file
// whose upload FAILED stays in the outbox with no event to retrigger it. A periodic re-sweep recovers
// both — handle()'s in-flight guard keeps it from colliding with a live watch event for the same file.
const RESWEEP_MS = Number(process.env.SENTINEL_RESWEEP_MS) || 15000;
setInterval(() => { sweep().catch((e) => console.error(`  ❌ re-sweep: ${e?.message || e}`)); }, RESWEEP_MS).unref?.();
