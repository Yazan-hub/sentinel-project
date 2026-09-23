// Run the Federation Gate from the command line: node bridge/federation.mjs --project <key> [--versions id,id] [--actor cli] [--no-bcf]
// Exit 0 pass · 2 fail · 3 not checkable · 1 error.
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const { flag, has } = parseCliArgs(process.argv.slice(2));
const project = flag("project");
if (!project) { console.error("Usage: node bridge/federation.mjs --project <key> [--versions id,id] [--actor cli] [--no-bcf]"); process.exit(1); }
const body = { actor: flag("actor", "cli"), raise_bcf: !has("no-bcf") };
if (flag("versions")) body.versions = flag("versions").split(",").map((s) => s.trim()).filter(Boolean);
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/federation/run`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
const v = r.result.verdict;
console.log(`Federation Gate: ${v === "not_checkable" ? "NOT CHECKABLE" : v.toUpperCase()} · ${r.set.length} model(s) · rule ${r.type_rule ?? "none"} · naming ${r.naming_ruleset ?? "none"}`);
for (const m of r.result.models) console.log(`  ${m.has_manifest ? "●" : "○"} ${m.container} (${m.version_id.slice(0, 8)})${m.has_manifest ? "" : " — no manifest: republish or node bridge/manifest.mjs"}`);
for (const c of r.result.checks) {
  console.log(`${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "–"} ${c.id} ${c.title}${c.reason ? " — " + c.reason : ""}`);
  for (const e of c.evidence.slice(0, 10)) console.log(`      ${JSON.stringify(e)}`);
  for (const w of c.warnings.slice(0, 10)) console.log(`      ! ${w}`);
}
if (r.bcf) console.log(`bcf: ${r.bcf.raised} topic(s) raised, ${r.bcf.skipped ?? 0} already open${r.bcf.error ? " — " + r.bcf.error : ""}`);
process.exit(v === "pass" ? 0 : v === "fail" ? 2 : 3);
