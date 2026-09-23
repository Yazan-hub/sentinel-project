// Install a standards file as a project artefact: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]
// The one-time path for the pilot's and Aster's existing ids.json files, so no project starts empty.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const project = flag("project"), kind = flag("kind", "ids");
if (!file || !project) { console.error("Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]"); process.exit(1); }

const body = JSON.parse(await readFile(file, "utf8"));
body.source = { file: basename(file), imported_at: new Date().toISOString() };
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/artefacts/${encodeURIComponent(kind)}?actor=${encodeURIComponent(flag("actor", "cli"))}`, {
  method: "PUT", headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
console.log(`Installed ${r.kind}@${r.version} on ${project} · sha ${String(r.sha256).slice(0, 16)}… · by ${r.installed_by}`);
