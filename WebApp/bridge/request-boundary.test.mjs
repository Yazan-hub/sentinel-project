// The one error boundary around every request (bcf-service.mjs, createServer): a request target of "//" makes
// `new URL(req.url, …)` throw inside handleRequest, and before e0ea676 that rejection was unhandled, so one anonymous
// `GET //` (curl --path-as-is http://127.0.0.1:4100//) ended the process — with BCF_TOKEN armed, no token needed.
// This is the smoke check for it: a COPY of the bridge, spawned from a temp dir on a spare port with a fake env (its
// stores under the temp dir, never %AppData%\Sentinel, no .env reachable, never the managed bridge on :4100), takes
// `GET //` and `OPTIONS //` over a raw socket, answers 400 to each, and still answers /health afterwards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

// One request line over a raw socket (fetch() would refuse to send a "//" target as is). Resolves with the whole reply.
const raw = (port, requestLine) => new Promise((resolve, reject) => {
  let reply = "";
  const s = net.connect({ port, host: "127.0.0.1" }, () =>
    s.write(`${requestLine} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
  s.setEncoding("utf8");
  s.setTimeout(5000, () => { s.destroy(); reject(new Error(`no reply to ${requestLine} within 5 s`)); });
  s.on("data", (d) => { reply += d; });
  s.on("end", () => resolve(reply));
  s.on("error", reject);
});

const statusOf = (reply) => Number(/^HTTP\/1\.[01] (\d{3})/.exec(reply)?.[1]);

let tmp, child, port, stderr = "";

beforeAll(async () => {
  // <tmp>/x/bridge is the copy; <tmp>/x/node_modules → the real one (a junction: no admin needed on Windows); the
  // bridge's .env lookups (<copy>/../.env, <copy>/../../config/.env) land inside <tmp> and find nothing.
  tmp = mkdtempSync(join(tmpdir(), "sentinel-bridge-smoke-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  mkdirSync(join(tmp, "appdata"), { recursive: true });

  port = await freePort();
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot, // Windows crypto needs it
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp,
    APPDATA: join(tmp, "appdata"),          // every store default derives from it — nothing touches the machine's
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port),
    BCF_TOKEN: "smoke-only-token",          // the gate armed: the scenario needs no token to reach the boundary
  };
  child = spawn(process.execPath, [join(copy, "bcf-service.mjs")], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
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

afterAll(() => {
  if (child && child.exitCode === null) child.kill();
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
});

describe("the request error boundary — an unparseable target never ends the bridge", () => {
  it("GET // is answered 400, not an unhandled rejection", async () => {
    const reply = await raw(port, "GET //");
    expect(statusOf(reply), reply).toBe(400);
    expect(reply).toContain('"message":"Bad request"');
    expect(child.exitCode).toBeNull();
  });

  it("OPTIONS // (a preflight with the same target) is answered 400 too", async () => {
    const reply = await raw(port, "OPTIONS //");
    expect(statusOf(reply), reply).toBe(400);
    expect(child.exitCode).toBeNull();
  });

  it("the bridge is still up: /health answers 200 afterwards", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
    expect(child.exitCode, stderr).toBeNull();
  });
});
