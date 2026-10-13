// MA-7-1 review — check.mjs against a throwaway root: the pin readers (unreadable requirement lines, both versions of a pin) and the exit code.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const check = join(import.meta.dirname, "..", "..", "tools", "licence-check", "check.mjs");

function run(files) {
  const root = mkdtempSync(join(tmpdir(), "lc-"));
  try {
    const all = { "survey/las.py": 'PINS = {"laspy": "2.7.0"}\n', "WebApp/bridge/ai-gateway.mjs": "", "SentinelAddin/Engine/SettingsManager.cs": "", ...files };
    for (const [p, c] of Object.entries(all)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); }
    writeFileSync(join(root, "lock.json"), JSON.stringify({ packages: {} }));
    try { return { code: 0, out: execFileSync("node", [check, "--root", root, "--lock", join(root, "lock.json")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout) }; }
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("licence-check pin readers", () => {
  it("passes the real pins and fails a requirement line it cannot read", () => {
    expect(run({}).out).toContain("licence-check:");
    const r = run({ "photo/requirements.txt": "# c\n-r other.txt\ngsplat @ https://example.test/x.whl\n" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/UNKNOWN gsplat @ https/);
  });
  it("judges both versions of a pin and reads name[extra]==ver", () => {
    const r = run({ "photo/requirements.txt": "laspy==2.8.0\ntransformers[torch]==4.1 --hash=sha256:ab\n" });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/UNKNOWN laspy@2\.8\.0/);
    expect(r.out).toMatch(/UNKNOWN transformers@4\.1/);
  });
});

// MA-7-3 (amendment 20): the add-in has no image-import API — a SentinelAddin .cs naming one fails the run, naming the line.
describe("licence-check imagery scan (MA-7-3)", () => {
  it("prints 0 hits on clean code; a Revit image import fails and names file:line", () => {
    expect(run({ "SentinelAddin/A.cs": "class A { }\n" }).out).toContain("imagery: 0 hits");
    const r = run({ "SentinelAddin/A.cs": "class A {\n  void M() { ImageType.Create(d, o); }\n}\n" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("IMAGERY SentinelAddin/A.cs:2 — imagery is never put into the model (design 4.4); nothing ships with it");
  });
});
