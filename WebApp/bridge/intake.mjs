// Governed Intake from the command line: any IFC → gate → project IDS → verdict → version.
// Usage: node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli]
//        [--actor <who>] [--revision P01] [--note "..."] [--no-bcf]
// Config: BCF_BASE (default http://127.0.0.1:4100) and BCF_TOKEN from config/.env or the environment.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const project = flag("project");
if (!file || !project) { console.error("Usage: node bridge/intake.mjs <file.ifc> --project <key> [--name <iso name>] [--source cli] [--actor <who>] [--revision P01] [--note \"...\"] [--no-bcf]"); process.exit(1); }

const q = new URLSearchParams({ name: flag("name", basename(file)), source: flag("source", "cli") });
for (const k of ["actor", "revision", "note"]) { const v = flag(k); if (v) q.set(k, v); }
if (args.includes("--no-bcf")) q.set("raise_bcf", "false");

const bytes = await readFile(file);
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/intake?${q}`, {
  method: "POST", headers: { "Content-Type": "application/octet-stream", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: bytes,
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }

const line = (k, v) => console.log(`${k.padEnd(14)} ${v ?? "—"}`);
line("verdict", `${String(r.verdict).toUpperCase()} (${r.stage})`);
line("file", `${q.get("name")} · ${r.size} bytes · sha ${String(r.sha256).slice(0, 16)}…`);
line("gate", `${r.gate?.passed ? "PASS" : "FAIL"} · contract ${r.gate?.contract_key} · ${r.gate?.detected_schema} · ${r.gate?.total_entities} entities`);
for (const f of r.gate?.failures || []) line("  gate ✗", f);
for (const w of r.gate?.warnings || []) line("  gate !", w);
if (r.naming) line("naming", r.naming.ok ? "ok" : `✗ ${(r.naming.errors || r.naming.failures || []).map((e) => e.reason ?? e.message ?? JSON.stringify(e)).join("; ")}`);
line("ids", `${r.ids_source}${r.ids_ref ? " " + r.ids_ref : ""}${r.summary?.ids ? " · " + r.summary.ids : ""}`);
if (r.extracted) line("elements", `${r.extracted.elements} read, ${r.extracted.skipped} skipped`);
line("failures", String((r.failures || []).length));
for (const f of (r.failures || []).slice(0, 10)) line("  ids ✗", `${f.element ?? "?"} — ${f.requirement ?? f.message ?? JSON.stringify(f)}`);
if (r.bcf) line("bcf", `${r.bcf.raised ?? 0} topic(s) raised${r.bcf.error ? " — " + r.bcf.error : ""}`);
line("ledger", r.audit_id != null ? `audit #${r.audit_id} · receipt ${String(r.receipt?.ledger_hash || "").slice(0, 16)}…` : "—");
if (r.version) line("version", `${r.version.revision} · ${r.version.format} · item ${r.version.platform_item_id ?? "—"} · version ${r.version.version_id}`);
if (r.note) line("note", r.note);
if (r.error) line("error", r.error);
process.exit(r.verdict === "rejected" ? 2 : 0);
