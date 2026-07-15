// Sentinel → That Open Platform bridge — one-shot model uploader.
//
// Pushes a single file into a project's CDE via the OFFICIAL @thatopen/services client
// (client.createFile). Replaces the retired C# `POST /api/item` (that endpoint publishes
// apps/components, not model files, which is why it 500'd).
//
// Usage:
//   node bridge/upload-ifc.mjs <path-to-file.ifc> [--name "My Model"] [--version v1]
//
// Config (process env, or config/.env at the repo root — never commit it):
//   THATOPEN_API_KEY, THATOPEN_PROJECT_ID, and optionally THATOPEN_API_BASE_URL.

import { basename, resolve } from "node:path";
import { getConfig, createClient, uploadFile, uploadBytes } from "./thatopen-client.mjs";
import { ifcToFrag } from "./ifc-to-frag.mjs";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

if (!filePath) {
  console.error('Usage: node bridge/upload-ifc.mjs <path-to-file.ifc> [--name "..."] [--version v1]');
  process.exit(2);
}

let cfg;
try {
  cfg = getConfig();
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const name = flag("name", basename(filePath));
const versionTag = flag("version", "v1");
const client = createClient(cfg);

console.log(`Uploading "${name}" → project ${cfg.projectId} @ ${cfg.apiUrl} …`);
try {
  if (/\.ifc$/i.test(name)) {
    // Convert locally and upload ONLY the .frag (viewable). Skip the .ifc — it just triggers the
    // platform's slow server-side conversion. Fall back to the .ifc if conversion fails.
    const fragName = name.replace(/\.ifc$/i, ".frag");
    try {
      console.log("Converting to fragments locally …");
      const fragBytes = await ifcToFrag(resolve(filePath));
      const { result, size } = await uploadBytes(client, cfg.projectId, fragBytes, fragName, versionTag);
      console.log(`✅ Uploaded ${fragName} (${size.toLocaleString()} bytes) — item ${result?.item?._id}  (.ifc skipped)`);
    } catch (e) {
      console.error("⚠ frag conversion failed — uploading .ifc instead:", e?.message || e);
      const { result, size } = await uploadFile(client, cfg.projectId, resolve(filePath), { name, versionTag });
      console.log(`✅ Uploaded ${name} (${size.toLocaleString()} bytes) — item ${result?.item?._id}  (fallback)`);
    }
  } else {
    // Non-IFC file (e.g. a .frag passed directly): upload as-is.
    const { result, size } = await uploadFile(client, cfg.projectId, resolve(filePath), { name, versionTag });
    console.log(`✅ Uploaded (${size.toLocaleString()} bytes) — item ${result?.item?._id}`);
  }
} catch (err) {
  console.error("❌ Upload failed:");
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
}
