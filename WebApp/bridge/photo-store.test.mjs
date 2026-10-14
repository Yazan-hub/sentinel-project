// MA-7-7 — photo-store.mjs: running the blur tool and streaming a photo's bytes. Unit tests inject execFile; one end-to-end test runs the real
// survey/blur.py where Pillow 12.3.0 is installed (this PC; it is skipped, with why, where it is not — CI has no Python job).
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBlur, runDetect, sendBytes, blurNotSetUp, BLUR_SCRIPT } from "./photo-store.mjs";
import { DEFAULT_PYTHON } from "./survey-service.mjs";

const PY = process.env.SENTINEL_PYTHON || DEFAULT_PYTHON;
const haveBlur = (() => { try { execFileSync(PY, ["-c", "import importlib.metadata as m; assert m.version('pillow')=='12.3.0'"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe("runBlur (MA-7-7)", () => {
  const ok = { ok: true, width: 10, height: 8, areas: 1, version: "0.1.0", tools: [] };
  const stub = (stdout, e = null, stderr = "") => (_py, args, opts, cb) => { stub.seen = { args, opts }; cb(e, stdout, stderr); };
  const here = { python: process.execPath, script: BLUR_SCRIPT }; // an existing absolute file stands in for python.exe

  it("runs the script with an allow-listed environment (no secret), a bound, no shell; → the tool's answer", async () => {
    const env = { SYSTEMROOT: "C:\\Windows", APPDATA: "C:\\a", TEMP: "C:\\t", TMP: "C:\\t", SUPABASE_SERVICE_KEY: "secret", BCF_TOKEN: "secret" };
    const r = await runBlur("in.jpg", "out.jpg", [{ x: 0, y: 0, w: 1, h: 1 }], { w: 400, h: 600 }, { ...here, env, execFileFn: stub(JSON.stringify(ok)) });
    expect(r).toEqual(ok);
    expect(stub.seen.args).toEqual(["-B", BLUR_SCRIPT, "in.jpg", "out.jpg", '[{"x":0,"y":0,"w":1,"h":1}]', "400x600"]);
    expect(stub.seen.opts).toMatchObject({ windowsHide: true, timeout: 60_000, env: { SYSTEMROOT: "C:\\Windows", APPDATA: "C:\\a", TEMP: "C:\\t", TMP: "C:\\t" } });
    expect(Object.keys(stub.seen.opts.env)).toHaveLength(4);
    expect(stub.seen.opts.shell).toBeUndefined();
  });

  it("MA-7-16 runDetect: --detect with USERPROFILE (and no secret) handed over; the tool's answer back; a missing model is a 503 in words; a dead child a 500", async () => {
    const det = { ok: true, width: 10, height: 8, faces: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, score: 0.9 }], method: "detector+person", version: "0.1.0", tools: [] };
    const env = { SYSTEMROOT: "C:/Windows", USERPROFILE: "C:/Users/u", SUPABASE_SERVICE_KEY: "secret" };
    expect(await runDetect("in.jpg", { ...here, env, execFileFn: stub(JSON.stringify(det)) })).toEqual(det);
    expect(stub.seen.args).toEqual(["-B", BLUR_SCRIPT, "--detect", "in.jpg"]);
    expect(stub.seen.opts.env).toEqual({ SYSTEMROOT: "C:/Windows", USERPROFILE: "C:/Users/u" });
    const miss = JSON.stringify({ ok: false, error: "ValueError: the face detector is not set up on this PC (YuNet 2023mar model not found) - nothing was proposed; mark the faces by hand" });
    await expect(runDetect("a", { ...here, execFileFn: stub(miss, new Error("exit 2")) })).rejects.toMatchObject({ status: 503, message: expect.stringContaining("mark the faces by hand") });
    const pin = JSON.stringify({ ok: false, error: "ValueError: the face detector is not set up on this PC (onnxruntime 1.26.0 is needed, this PC has none) - nothing was proposed; mark the faces by hand" });
    await expect(runDetect("a", { ...here, execFileFn: stub(pin, new Error("exit 2")) })).rejects.toMatchObject({ status: 503 }); // a missing or different onnxruntime is "not set up", not "bad photo"
    await expect(runDetect("a", { ...here, execFileFn: stub("", new Error("boom")) })).rejects.toMatchObject({ status: 500, message: "the face detector failed — nothing was proposed" });
    await expect(runDetect("a", { python: "relative.exe", execFileFn: () => {} })).rejects.toMatchObject({ status: 503, message: expect.stringContaining("face detector") });
    await expect(runDetect("a", { python: "relative.exe", execFileFn: () => {} })).rejects.toMatchObject({ message: expect.stringContaining("mark the faces by hand") }); // MA-7-16b: the hand-marking hint on every 503
    await expect(runDetect("a", { ...here, execFileFn: stub(miss, new Error("exit 2")) })).rejects.toMatchObject({ message: expect.not.stringContaining("ValueError") });
    await expect(runBlur("a", "b", [], undefined, { ...here, execFileFn: stub(JSON.stringify(ok)) })).resolves.toEqual(ok);
    expect(stub.seen.args).not.toContain("--detected"); // MA-7-16: the blur form has no way to claim a detector run
  });

  it("a refusal from the tool is a 422 in words; a dead or stuck child is a 500; a missing tool is a 503 before anything runs", async () => {
    await expect(runBlur("a", "b", [], undefined, { ...here, execFileFn: stub(JSON.stringify({ ok: false, error: "UnidentifiedImageError: <file>" }), Object.assign(new Error("exit 2"), { code: 2 })) }))
      .rejects.toMatchObject({ status: 422, message: "this photo could not be blurred (UnidentifiedImageError: <file>) — nothing was saved" });
    await expect(runBlur("a", "b", [], undefined, { ...here, execFileFn: stub("", new Error("boom"), "Traceback ...") })).rejects.toMatchObject({ status: 500, message: "the blur tool failed — nothing was saved" });
    await expect(runBlur("a", "b", [], undefined, { ...here, execFileFn: stub("", Object.assign(new Error("t"), { killed: true })) })).rejects.toMatchObject({ status: 500, message: expect.stringContaining("took too long") });
    let ran = false;
    await expect(runBlur("a", "b", [], undefined, { python: "relative.exe", execFileFn: () => { ran = true; } })).rejects.toMatchObject({ status: 503 });
    await expect(runBlur("a", "b", [], undefined, { python: join(tmpdir(), "no-python.exe"), execFileFn: () => { ran = true; } })).rejects.toMatchObject({ status: 503, message: expect.stringContaining("no Python where SENTINEL_PYTHON") });
    expect(ran).toBe(false);
    expect(blurNotSetUp({ python: process.execPath, script: join(tmpdir(), "none.py") })).toContain("survey/blur.py is missing");
  });

  it.skipIf(!haveBlur)("end to end with the real tool: a marked box is filled, no EXIF/XMP/ICC is left, the long side is cut, and the answer names Pillow's licence", async () => {
    const d = mkdtempSync(join(tmpdir(), "sentinel-blur-"));
    try {
      const src = join(d, "in.jpg"), dst = join(d, "out.jpg");
      execFileSync(PY, ["-c", `
from PIL import Image
import random
r = random.Random(3)
im = Image.frombytes("RGB", (2600, 1800), bytes(r.randrange(256) for _ in range(2600*1800*3)))
ex = Image.Exif(); ex[0x010F] = "Example"; ex[0x0110] = "Cam"; ex.get_ifd(0x8825)[1] = "N"
im.save(r"${src}", "JPEG", exif=ex, icc_profile=b"\\0"*144)`], { stdio: "ignore" });
      expect(readFileSync(src).includes("Exif\0\0")).toBe(true);
      const a = await runBlur(src, dst, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]);
      expect(a).toMatchObject({ ok: true, width: 2048, height: 1418, areas: 1, version: "0.1.0" });
      expect(a.tools.find((t) => t.name === "pillow")).toMatchObject({ version: "12.3.0", licence: "MIT-CMU" });
      const b = readFileSync(dst);
      for (const bad of ["Exif\0\0", "http://ns.adobe.com/xap", "ICC_PROFILE"]) expect(b.includes(bad), bad).toBe(false);
      expect(existsSync(`${dst}.part`)).toBe(false);
      await expect(runBlur(join(d, "none.jpg"), dst, [])).rejects.toMatchObject({ status: 422 });
    } finally { rmSync(d, { recursive: true, force: true }); }
  }, 30_000);
});

describe("sendBytes (MA-7-7)", () => {
  it("streams the file with its type and length; no wildcard CORS, nosniff", async () => {
    const d = mkdtempSync(join(tmpdir(), "sentinel-send-")), f = join(d, "x.jpg");
    try {
      writeFileSync(f, "jpeg bytes");
      const head = {}; const chunks = [];
      const res = Object.assign(new (await import("node:stream")).Writable({ write(c, _e, cb) { chunks.push(c); cb(); } }), { writeHead: (s, h) => { head.s = s; head.h = h; } });
      await new Promise((ok) => { res.on("finish", ok); sendBytes(res, f, "image/jpeg", { "Cache-Control": "no-store" }); });
      expect(head).toEqual({ s: 200, h: { "Content-Type": "image/jpeg", "Content-Length": 10, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
      expect(Buffer.concat(chunks).toString()).toBe("jpeg bytes");
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe("photo-store.mjs stays offline (x)", () => {
  it("(x) no fetch, upload or remote module; bytes only by pipeline(createReadStream(...), res); no wildcard CORS", () => {
    const src = readFileSync(new URL("./photo-store.mjs", import.meta.url), "utf8");
    for (const word of ["fetch(", "uploadIfc", "/cde/files", "thatopen", "readRaw", "XMLHttpRequest", "node:http", "node:net", "node:dns", "node:tls"]) expect(src, word).not.toContain(word);
    const allowed = ["./survey-service.mjs"];
    const specs = [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s.startsWith("node:") || allowed.includes(s), s).toBe(true);
    const code = src.split("\n").filter((l) => !l.startsWith("//")).join(" ");
    expect(code.match(/createReadStream\(/g)).toHaveLength(1);
    expect(code).toContain("pipeline(createReadStream(file), res");
    expect(code).not.toMatch(/Access-Control-Allow-Origin/i);
  });
});
