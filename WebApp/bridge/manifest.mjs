// Backfill a manifest for a version published before manifests existed:
//   node bridge/manifest.mjs <file.ifc> --project <key> --version <container_version_id> [--actor cli] [--revision P01]
import { readFile } from "node:fs/promises";
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const { file, flag } = parseCliArgs(process.argv.slice(2));
const project = flag("project"), version = flag("version");
if (!file || !project || !version) { console.error("Usage: node bridge/manifest.mjs <file.ifc> --project <key> --version <id> [--actor cli] [--revision P01]"); process.exit(1); }
const q = new URLSearchParams({ actor: flag("actor", "cli") });
if (flag("revision")) q.set("revision", flag("revision"));
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/manifests/${encodeURIComponent(version)}?${q}`, {
  method: "POST", headers: { "Content-Type": "application/octet-stream", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: await readFile(file),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
console.log(`Manifest captured for version ${version}: ${r.elements} element(s), ${r.levels} level(s), ${r.grids} grid(s)${r.has_site ? ", georeferenced" : ""} (revision ${r.revision_id})`);
