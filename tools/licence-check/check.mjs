// MA-7-1 — licence gate over npm, Python pins, NuGet and the model weights table. Exit 1 on a banned or unknown licence;
// pending ones (the founder's decisions, D-7-16) warn. Reads tracked files only (git ls-files), so an untracked folder never
// makes a local run differ from CI. Usage: node tools/licence-check/check.mjs [--lock <package-lock.json>] [--root <repo>]
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAll, WEIGHTS } from "../../WebApp/bridge/licence-logic.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const root = resolve(arg("--root") || join(here, "..", ".."));
const lockPath = resolve(arg("--lock") || join(root, "WebApp", "package-lock.json"));
const allow = JSON.parse(readFileSync(join(here, "allow.json"), "utf8"));

function tracked() {
  try { return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean); }
  catch { // no git: walk the folder
    const out = [];
    const walk = (d, rel) => { for (const e of readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", "bin", "obj", ".git"].includes(e.name)) continue;
      e.isDirectory() ? walk(join(d, e.name), `${rel}${e.name}/`) : out.push(rel + e.name);
    } };
    walk(root, "");
    return out;
  }
}
const files = tracked();
const read = (p) => readFileSync(join(root, p), "utf8");

// The licence of an npm entry: the lockfile field, else the installed package.json (a string, or licenses[].type joined with OR).
function pkgLicence(lock, key, entry) {
  if (typeof entry.license === "string" && entry.license) return entry.license;
  const pj = join(dirname(lock), key, "package.json");
  if (!existsSync(pj)) return "";
  const j = JSON.parse(readFileSync(pj, "utf8"));
  if (typeof j.license === "string") return j.license;
  if (j.license?.type) return j.license.type;
  if (Array.isArray(j.licenses)) return j.licenses.map((l) => l.type).join(" OR ");
  return "";
}
export function readNpm(lock) {
  const seen = new Map();
  for (const [key, entry] of Object.entries(JSON.parse(readFileSync(lock, "utf8")).packages || {})) {
    if (!key) continue;
    const name = key.slice(key.lastIndexOf("node_modules/") + 13);
    const id = `${name}@${entry.version}`;
    if (!seen.has(id)) seen.set(id, { source: "npm", name, version: entry.version || "", licence: pkgLicence(lock, key, entry) });
  }
  return [...seen.values()];
}

function readPython() {
  const pins = {};
  const m = /PINS\s*=\s*\{([^}]*)\}/.exec(read("survey/las.py"));
  for (const p of m ? m[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g) : []) pins[p[1]] = p[2];
  for (const f of files.filter((f) => /^(survey|photo)\/requirements[^/]*\.txt$/.test(f)))
    for (const l of read(f).matchAll(/^([A-Za-z0-9_.-]+)==([^\s;]+)/gm)) pins[l[1]] = l[2];
  for (const n of allow.python_runtime || []) pins[n] ??= allow.python?.[n]?.version || "";
  return Object.entries(pins).map(([name, version]) => {
    const a = allow.python?.[name];
    // a moved pin has not had its licence re-read
    const ok = a && (!version || a.version === version);
    return { source: "python", name, version, licence: ok ? a.licence : "", carries: ok ? a.carries : undefined };
  });
}

function readNuget() {
  const seen = new Map();
  for (const f of files.filter((f) => /^(SentinelAddin|drawing|tools)\/.*\.csproj$/.test(f)))
    for (const r of read(f).matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/g)) {
      const a = allow.nuget?.[r[1]];
      if (!seen.has(r[1])) seen.set(r[1], { source: "nuget", name: r[1], version: r[2] || a?.version || "", licence: a?.licence || "" });
    }
  return [...seen.values()];
}

// Model names a person can pick today: the local chat picker and the add-in's defaults. No weights row = pending.
function readModels() {
  const names = new Set();
  const gw = /local:\s*\{[^}]*?models:\s*\[([^\]]*)\]/.exec(read("WebApp/bridge/ai-gateway.mjs"));
  for (const m of gw ? gw[1].matchAll(/"([^"]+)"/g) : []) names.add(m[1]);
  for (const m of read("SentinelAddin/Engine/SettingsManager.cs").matchAll(/Ghost(?:Vision)?Model\s*\{[^}]*\}\s*=\s*"([^"]+)"/g)) names.add(m[1]);
  return [...names];
}

const npm = readNpm(lockPath), python = readPython(), nuget = readNuget();
const weights = Object.entries(WEIGHTS).map(([name, w]) => ({ source: "weights", name, version: w.digest, licence: w.licence }));
const r = checkAll({ npm, python, nuget, weights, models: readModels(), allow });
console.log(`licence-check: ${npm.length} npm, ${python.length} python, ${nuget.length} nuget, ${weights.length} weights — banned ${r.banned}, unknown ${r.unknown}, pending ${r.pending} (warn: the founder's decision D-7-16)`);
for (const l of r.lines) console.log(l);
process.exit(r.code);
