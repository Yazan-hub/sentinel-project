// SEC-5: hardenings outside the bridge's stores, pinned by their text (source pins read files with CRLF normalised).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "");

describe("SEC-5 one-liners", () => {
  it("S16: the bridge hands the gate poller the configured project key, and the template names it", () => {
    expect(read("./bcf-service.mjs")).toContain('watchPlatformGate({ componentId, targetKey: (process.env.THATOPEN_GATE_PROJECT_KEY || "").trim() || null, log: (l) => console.log(`[bridge] ${l}`) })');
    expect(read("../../config/.env.template")).toMatch(/^# THATOPEN_GATE_PROJECT_KEY=replace-with-the-sentinel-project-key$/m);
  });

  it("F-a: the packs window says the bridge's words when a publish or a fork is refused — never 'Published'", () => {
    const src = read("../src/setups/packs-panel.ts");
    expect(src).toContain("const okOr = async (r: Response) => {");
    expect(src).toContain("await okOr(await bfetch(`${base}/packs/${encodeURIComponent(src.id)}/fork`");
    expect(src).toContain("await okOr(await publishPack({");
  });

  it("S33: no install script runs with the npm token; its .npmrc is removed before the build; every action is pinned by SHA", () => {
    const ci = read("../../.github/workflows/ci.yml");
    expect(ci).toContain("      - run: npm install --ignore-scripts\n        env:\n          NPM_TOKEN: ${{ secrets.THATOPEN_NPM_TOKEN }}\n      - run: rm -f .npmrc\n      - run: npm run prepare\n      - run: npm run test\n");
    expect(ci).not.toMatch(/run: npm (install|ci)\s*$/m);
    expect((ci.match(/NPM_TOKEN: \$\{\{ secrets\.THATOPEN_NPM_TOKEN \}\}/g) ?? []).length).toBe(2); // the login step and the install only
    const uses = ci.match(/uses: [^\n]+/g) ?? [];
    expect(uses.length).toBe(4);
    // Review C9: the lock's packages with an install script are esbuild and fsevents (macOS only) — a new one fails here.
    expect((read("../package-lock.json").match(/"hasInstallScript": true/g) ?? []).length).toBe(2);
    for (const u of uses) expect(u).toMatch(/^uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+$/);
  });

  it("S18: the documentation keeps the machine credential on the bridge's own PC; a workstation signs in", () => {
    for (const f of ["../../docs/HOSTING_TAILSCALE.md", "../../docs/SECURITY_F2_ACTIVATION.md", "../../demo/aster/README.md"]) {
      const doc = read(f);
      expect(doc, f).toContain("Sentinel ▸ Sign in");
      expect(doc, f).toContain("the bridge's own PC");
    }
    expect(read("../../docs/HOSTING_TAILSCALE.md")).not.toContain('"serviceToken": "<the BCF_TOKEN>"');
    expect(read("../../docs/SECURITY_F2_ACTIVATION.md")).not.toContain("Revit is unaffected (it uses the token)");
  });
});
