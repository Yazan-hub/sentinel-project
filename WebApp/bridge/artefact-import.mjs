// Install standards as project artefacts.
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind <one of KINDS in artefact-store.mjs: ids, ruleset, naming, contract, guideline, layers, type_catalog, publish, roi, review, carbon_factors, lod_matrix; evidence_pack is refused here — the evidence routes write it (MA-4a)> [--actor <who>]
//     one file → one artefact of that kind (default ids). The bridge validates the body per kind and refuses one
//     its judge could not use; the refusal names the field ("contract: ifc_schema must be IFC2X3 | IFC4").
//   node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]
//     one-shot retirement of projects.metadata.active_ruleset (cohesion phase 3): every project row's slot is
//     split into ruleset@n and naming@n, validated, installed with actor "import" and the slot named in the
//     pointer's source (so the install audit row names it). Rows that fail validation are listed, not installed.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";
import { refLabel, KINDS } from "./artefact-store.mjs";
import { splitActiveRulesets } from "./artefact-split.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const headers = { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
const { file, flag, has } = parseCliArgs(process.argv.slice(2));

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`);
  return r;
}
// The PUT route lifts `source` out of the body into the pointer's provenance.
const install = (project, kind, body, actor, source) =>
  call("PUT", `/cde/${encodeURIComponent(project)}/artefacts/${encodeURIComponent(kind)}?actor=${encodeURIComponent(actor)}`, { ...body, source });
const installed = (r, project) => `Installed on ${project}: ${refLabel({ ref: `${r.kind}@${r.version}`, source: "project", sha256: r.sha256 })} · by ${r.installed_by}`;

// Exit through process.exitCode, not process.exit(): exiting while fetch's sockets close trips a libuv
// assertion on Windows (UV_HANDLE_CLOSING).
async function fromMetadata() {
  const only = flag("key"), dry = has("dry-run");
  const projects = (await call("GET", "/projects")).filter((p) => !only || p.project_id === only);
  if (only && !projects.length) { console.error(`No project "${only}".`); return 1; }
  const rows = [];
  for (const p of projects) {
    if (!p.active_ruleset) continue;
    rows.push({ key: p.project_id, active_ruleset: p.active_ruleset, installed: await call("GET", `/cde/${encodeURIComponent(p.project_id)}/artefacts`) });
  }
  const { installs, skipped } = splitActiveRulesets(rows);
  const source = { slot: "projects.metadata.active_ruleset", imported_at: new Date().toISOString() };
  let failed = 0;
  for (const i of installs) {
    if (dry) { console.log(`would install ${i.kind} on ${i.key} (${i.body.standard_key} ${i.body.semver})`); continue; }
    try { console.log(installed(await install(i.key, i.kind, i.body, "import", source), i.key)); }
    catch (e) { failed++; console.error(`FAILED ${i.key} ${i.kind}: ${e.message}`); }
  }
  for (const s of skipped) console.log(`skipped ${s.key}${s.kind ? ` ${s.kind}` : ""}: ${s.reason}`);
  console.log(`${dry ? `dry run, nothing written · ${installs.length} to install` : `${installs.length - failed} installed`} · ${skipped.length} skipped · ${failed} failed · ${projects.length - rows.length} project(s) with no active_ruleset`);
  return failed ? 1 : 0;
}

async function fromFile() {
  const project = flag("project"), kind = flag("kind", "ids");
  if (!file || !project) {
    console.error(`Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind <${KINDS.filter((k) => k !== "evidence_pack").join("|")}> [--actor <who>]`);
    console.error("       node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]");
    return 1;
  }
  const body = JSON.parse(await readFile(file, "utf8"));
  console.log(installed(await install(project, kind, body, flag("actor", "cli"), { file: basename(file), imported_at: new Date().toISOString() }), project));
  return 0;
}

try { process.exitCode = await (has("from-metadata") ? fromMetadata() : fromFile()); }
catch (e) { console.error(e.message); process.exitCode = 1; }
