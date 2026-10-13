// MA-7-1 — licence gate over npm, Python pins, NuGet and the model weights table. Exit 1 on a banned or unknown licence;
// pending ones (the founder's decisions, D-7-16) warn. The csproj and requirements files are taken from git ls-files; the lockfile and the named source
// files (survey/las.py, ai-gateway.mjs, SettingsManager.cs) are read as they are on disk. Usage: node tools/licence-check/check.mjs [--lock <package-lock.json>] [--root <repo>]
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
  const pins = {}, odd = [];
  const m = /PINS\s*=\s*\{([^}]*)\}/.exec(read("survey/las.py"));
  for (const p of m ? m[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g) : []) pins[`${p[1]}@${p[2]}`] = p[2];
  for (const f of files.filter((f) => /^(survey|photo)\/requirements[^/]*\.txt$/.test(f)))
    for (const raw of read(f).split(/\r?\n/)) {
      const t = raw.trim();
      if (!t || t.startsWith("#") || t.startsWith("-")) continue;
      const l = /^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?==([^\s;=]+)/.exec(t);
      if (l) pins[`${l[1]}@${l[2]}`] = l[2]; else odd.push(t); // a shape the gate cannot read is UNKNOWN, never skipped
    }
  for (const n of allow.python_runtime || []) if (!Object.keys(pins).some((k) => k.startsWith(`${n}@`))) pins[`${n}@`] = allow.python?.[n]?.version || "";
  const rows = Object.keys(pins).map((k) => {
    const name = k.slice(0, k.indexOf("@")), version = pins[k];
    const a = allow.python?.[name];
    // a moved pin has not had its licence re-read
    const ok = a && (!version || a.version === version);
    return { source: "python", name, version, licence: ok ? a.licence : "", carries: ok ? a.carries : undefined };
  });
  return [...rows, ...odd.map((raw) => ({ source: "python", name: raw, version: "", licence: "" }))];
}

function readNuget() {
  const seen = new Map();
  for (const f of files.filter((f) => /^(SentinelAddin|drawing|tools)\/.*\.csproj$/.test(f)))
    for (const r of read(f).matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/g)) {
      const a = allow.nuget?.[r[1]];
      if (!seen.has(r[1])) seen.set(r[1], { source: "nuget", name: r[1], version: String(r[2] || a?.version || "").includes("$(") ? "" : r[2] || a?.version || "", licence: a?.licence || "" });
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

// MA-7-3: imagery is never put into the model (design 4.4) — the add-in has no image-import API. A tracked SentinelAddin/**/*.cs naming one fails the run.
// `--imagery` runs this scan alone.
const IMAGERY = /ImageType\.Create|ImageInstance\.Create|ImageTypeOptions|DecalType|AppearanceAssetElement|RenderingAsset|IfcImageTexture|IfcBlobTexture|IfcPixelTexture/;
const hits = [];
for (const f of files.filter((f) => /^SentinelAddin\/.*\.cs$/.test(f)))
  read(f).split(/\r?\n/).forEach((line, i) => { if (IMAGERY.test(line)) hits.push(`IMAGERY ${f}:${i + 1} — imagery is never put into the model (design 4.4); nothing ships with it`); });
console.log(`imagery: ${hits.length} hits`);
for (const h of hits) console.log(h);
if (process.argv.includes("--imagery")) process.exit(hits.length ? 1 : 0);

const npm = readNpm(lockPath), python = readPython(), nuget = readNuget();
const weights = Object.entries(WEIGHTS).map(([name, w]) => ({ source: "weights", name, version: w.digest, licence: w.licence }));
const r = checkAll({ npm, python, nuget, weights, models: readModels(), allow });
console.log(`licence-check: ${npm.length} npm, ${python.length} python, ${nuget.length} nuget, ${weights.length} weights — banned ${r.banned}, unknown ${r.unknown}, pending ${r.pending} (warn: the founder's decision D-7-16)`);
for (const l of r.lines) console.log(l);
process.exit(r.code || (hits.length ? 1 : 0));
