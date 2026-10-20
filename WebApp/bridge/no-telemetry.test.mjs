// No telemetry (evaluation §4A1 point 5; spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md §4; write-up
// docs/security/no-telemetry.md). Three proofs, all in CI:
//  1. every host the bridge's or the add-in's code names is on a list that says why — a new one fails until a person files it;
//  2. no telemetry or crash-reporting SDK is a dependency (package-lock.json, every .csproj);
//  3. a copy of the bridge, booted with Supabase, That Open and Ollama on local stubs and a preload that refuses every other
//     outgoing connection (deny by default), reaches only those stubs while it boots and answers the AI and CDE routes.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SOURCES } from "./web-sources.mjs";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const repo = join(here, "..", "..");

// ── 1. every host the code names, and why ──────────────────────────────────────────────────────────────────────────
const CONTACTED = {
  "127.0.0.1": "this PC: the bridge itself, the local AI (Ollama) and the web app's dev server",
  localhost: "this PC (the same)",
  "platform.thatopen.com": "That Open, the platform Sentinel is published on (the bridge's uploads, gate reads and app channel; THATOPEN_API_BASE_URL overrides it)",
  "generativelanguage.googleapis.com": "Gemini — only with its key, SENTINEL_AI_CLOUD=1, a trusted caller and a project whose AI policy allows cloud AI",
  "api.moonshot.ai": "Kimi — the same conditions",
  "integrate.api.nvidia.com": "NVIDIA NIM — the same conditions",
};
const NAMED_ONLY = {
  "www.w3.org": "an XML namespace in the BCF and IDS files Sentinel writes — never fetched",
  "standards.buildingsmart.org": "the IDS and BCF schema namespaces — never fetched",
  "github.com": "the BCF-API version link in a BCF answer (and a web evidence source below)",
  h: "an example address in a comment (http://h:11434)",
  "bridge-address-refused.invalid": "the add-in's stand-in for a refused bridge address (.invalid never resolves)",
};
// MA-7 web evidence: off until the founder's SENTINEL_WEB_EVIDENCE switch, and then fetched only on a lead's request, only
// from these listed sources (web-sources.mjs classifyHost refuses any other host). Their terms pages are named for people.
const WEB_EVIDENCE = new Set(SOURCES.flatMap((s) => [...(s.hosts ?? []), ...(s.terms_url ? [new URL(s.terms_url).hostname] : [])]));
const filed = (h) => Object.hasOwn(CONTACTED, h) || Object.hasOwn(NAMED_ONLY, h) || WEB_EVIDENCE.has(h) || [...WEB_EVIDENCE].some((w) => h.endsWith(`.${w}`));

const filesUnder = (dir, test) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && test(d.name) && !/[\\/](bin|obj|node_modules)([\\/]|$)/.test(d.parentPath ?? d.path))
  .map((d) => join(d.parentPath ?? d.path, d.name));
const hostsIn = (files) => {
  const out = new Map();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g)) {
    const h = m[1].toLowerCase().replace(/\.$/, "");
    if (!out.has(h)) out.set(h, f.slice(repo.length + 1));
  }
  return out;
};

describe("1. every host the bridge and the add-in name is filed with a reason", () => {
  it("the bridge (WebApp/bridge/*.mjs, tests aside)", () => {
    const hosts = hostsIn(filesUnder(here, (n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs")));
    expect(hosts.size).toBeGreaterThan(5);
    expect([...hosts].filter(([h]) => !filed(h)).map(([h, f]) => `${h} (${f})`)).toEqual([]);
  });
  it("the Revit add-in (SentinelAddin/**/*.cs) names only this PC and two stand-ins: its bridge and sign-in come from this PC's settings", () => {
    const hosts = hostsIn(execFileSync("git", ["ls-files", "SentinelAddin/*.cs"], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean).map((f) => join(repo, f)));
    expect(hosts.size).toBeGreaterThan(0);
    expect([...hosts].filter(([h]) => !["localhost", "127.0.0.1", "h", "bridge-address-refused.invalid"].includes(h)).map(([h, f]) => `${h} (${f})`)).toEqual([]);
  });
});

// ── 2. no telemetry SDK ────────────────────────────────────────────────────────────────────────────────────────────
const TELEMETRY = /(^|[/@.])(sentry|applicationinsights|posthog|segment|analytics-node|mixpanel|amplitude|dd-trace|datadog|newrelic|bugsnag|rollbar|honeycomb|logrocket|appcenter|raygun|elastic-apm|opentelemetry|instana|dynatrace|heap)([/@.-]|$)/i;
describe("2. no telemetry or crash-reporting SDK is a dependency", () => {
  it("in package-lock.json (every package the bridge and the web app install)", () => {
    const lock = JSON.parse(readFileSync(join(here, "..", "package-lock.json"), "utf8"));
    const names = Object.keys(lock.packages ?? {}).map((p) => p.replace(/^.*node_modules\//, "")).filter(Boolean);
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter((n) => TELEMETRY.test(n))).toEqual([]);
  });
  it("in any .csproj (the add-in and its checks)", () => {
    // The tracked project files (git's list: a walk of the repo would cross node_modules).
    const refs = execFileSync("git", ["ls-files", "*.csproj"], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean)
      .flatMap((f) => [...readFileSync(join(repo, f), "utf8").matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1]));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((n) => TELEMETRY.test(n))).toEqual([]);
  });
});

// ── 3. the running bridge reaches only what it was configured with ─────────────────────────────────────────────────
// The preload patches net.Socket.prototype.connect, the one door every outgoing TCP connection passes (http, https, tls and
// fetch's undici alike): each attempt is written to the log, and one not on EGRESS_ALLOW is destroyed before it opens.
const GUARD = `import net from "node:net";
import { appendFileSync } from "node:fs";
const allow = new Set(process.env.EGRESS_ALLOW.split(","));
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const o = Array.isArray(args[0]) ? args[0][0] : typeof args[0] === "object" ? args[0] : { port: args[0], host: args[1] };
  if (o?.path) return connect.apply(this, args); // a local pipe, not the network
  const to = \`\${o?.host ?? "localhost"}:\${o?.port}\`;
  const ok = allow.has(to);
  appendFileSync(process.env.EGRESS_LOG, JSON.stringify({ to, ok }) + "\\n");
  if (ok) return connect.apply(this, args);
  process.nextTick(() => this.destroy(new Error("egress refused by the no-telemetry test: " + to)));
  return this;
};
`;
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});
/** A stub that answers every request with `reply(url)` as JSON and keeps what it saw. */
const stub = (reply) => new Promise((resolve) => {
  const seen = [];
  const s = createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(reply(req.url))); });
  s.listen(0, "127.0.0.1", () => resolve({ s, seen, port: s.address().port }));
});

let tmp, child, port, log, stderr = "", sb, to, ol;
const TOKEN = "egress-only-token";

beforeAll(async () => {
  sb = await stub((u) => (u.includes("jwks") ? { keys: [] } : []));
  to = await stub(() => ({}));
  ol = await stub((u) => (u.startsWith("/api/tags") ? { models: [{ name: "qwen2.5:7b-instruct" }] } : { message: { content: "ok" } }));
  tmp = mkdtempSync(join(tmpdir(), "sentinel-egress-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  mkdirSync(join(tmp, "appdata"), { recursive: true });
  writeFileSync(join(tmp, "guard.mjs"), GUARD);
  log = join(tmp, "egress.log");
  writeFileSync(log, "");
  port = await freePort();
  const at = (s) => `http://127.0.0.1:${s.port}`;
  const env = {
    PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot,
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp, APPDATA: join(tmp, "appdata"),
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port), BCF_TOKEN: TOKEN,
    SUPABASE_URL: at(sb), SUPABASE_SERVICE_KEY: "stub-service-key", SUPABASE_ANON_KEY: "stub-anon-key",
    THATOPEN_API_KEY: "stub-thatopen-key", THATOPEN_PROJECT_ID: "stub-project", THATOPEN_API_BASE_URL: at(to),
    OLLAMA_URL: at(ol),
    EGRESS_LOG: log, EGRESS_ALLOW: [sb, to, ol].map((s) => `127.0.0.1:${s.port}`).join(","),
  };
  child = spawn(process.execPath, ["--import", pathToFileURL(join(tmp, "guard.mjs")).href, join(copy, "bcf-service.mjs")],
    { cwd: copy, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderr += d; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the bridge copy exited with ${child.exitCode} before listening:\n${stderr}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the bridge copy did not answer /health within 20 s:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const gone = new Promise((r) => child.once("exit", r));
    child.kill();
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  }
  for (const s of [sb, to, ol]) s?.s.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
});

describe("3. the running bridge reaches only Supabase, That Open and the local AI it was given", () => {
  it("boots and answers the AI and CDE routes with every connection on the list", async () => {
    const call = (path, init = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" } });
    for (const path of ["/health", "/ai/providers", "/ai/providers?project=egress-test", "/ai/models?provider=local", "/ai/tools", "/ai/policy?project=egress-test", "/cde/projects", "/bcf/3.0/projects"])
      expect((await call(path)).status, path).toBeLessThan(600);
    const chat = await call("/ai/chat", { method: "POST", body: JSON.stringify({ provider: "local", messages: [{ role: "user", content: "hi" }] }) });
    expect(chat.status, await chat.clone().text()).toBe(200);
    // A cloud call with no key configured is refused before anything leaves (blockedReason) — no new host.
    expect((await call("/ai/chat", { method: "POST", body: JSON.stringify({ provider: "gemini", project: "egress-test", messages: [{ role: "user", content: "hi" }] }) })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 1500)); // let boot-time reads (JWKS, the platform token check, the event feed) land
    const tries = readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(tries.filter((t) => !t.ok), JSON.stringify(tries)).toEqual([]);
    // The guard saw real traffic, so an empty refusal list is not vacuous: the Supabase and Ollama stubs were reached through it.
    expect(sb.seen.length, stderr).toBeGreaterThan(0);
    expect(ol.seen.some((s) => s.startsWith("POST /api/chat")), JSON.stringify(ol.seen)).toBe(true);
    expect(tries.length).toBeGreaterThanOrEqual(2);
    expect(child.exitCode, stderr).toBeNull();
  }, 30_000);
});
