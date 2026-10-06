// SEC-4: one-line hardenings outside the bridge's stores, pinned by their text (source pins read files with CRLF normalised).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "");

describe("SEC-4 one-liners", () => {
  it("S19: the single-project GET seeds this PC's local metadata only for the machine credential, as the list route does", () => {
    const svc = read("./bcf-service.mjs");
    expect(svc).toContain("useCde ? await cde.getProjectMeta(ppid, currentUserToken() ? undefined : localSeed(ppid)) : getProject(ppid)");
    expect(svc).not.toContain("cde.getProjectMeta(ppid, localSeed(ppid))");
  });

  it("S34: keys, certificates and the add-in's bridge config are never committed", () => {
    const lines = read("../../.gitignore").split("\n").map((l) => l.trim());
    for (const p of ["*.pem", "*.key", "*.pfx", "*.p12", "bcf-config*.json"]) expect(lines, p).toContain(p);
  });

  it("S33: CI's token reads only, and no checkout keeps it in .git/config", () => {
    const ci = read("../../.github/workflows/ci.yml");
    expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
    const checkouts = ci.match(/- uses: actions\/checkout@v7\n {8}with:\n {10}persist-credentials: false/g) ?? [];
    expect(checkouts).toHaveLength((ci.match(/actions\/checkout@/g) ?? []).length);
    expect(checkouts).toHaveLength(2);
  });
});
