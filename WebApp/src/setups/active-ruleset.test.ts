// The web reads the ruleset in force through the bridge; nothing installed is null, never a bundled fallback.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./active-project", () => ({ activePid: () => "aster-villa" }));

import { readFileSync } from "node:fs";
import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const rs = { standard_key: "house", semver: "1.0.0", rules: [{ id: "SN-01", target: "sheet", mode: "request" }] };

describe("activeRuleset", () => {
  beforeEach(() => bfetch.mockReset());

  it("reads the artefact the bridge resolved and names ref, source and sha", async () => {
    bfetch.mockResolvedValue(res(200, { body: rs, source: "office", ref: "ruleset@1", sha256: "3f07376a1b2c3d4e5f60", pointer_sha_mismatch: false }));
    const a = await activeRuleset("http://b/");
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/artefacts/ruleset");
    expect(a).toEqual({ ruleset: rs, raw: rs, removed: [], ref: "ruleset@1", source: "office", sha256: "3f07376a1b2c3d4e5f60" });
    expect(refLabel(a!)).toBe("ruleset@1 · office · 3f07376a1b2c…");
  });

  it("accepts the stored-document shape: the ref comes from the version, the source is the project", async () => {
    bfetch.mockResolvedValue(res(200, { kind: "ruleset", version: 2, sha256: "ab", body: rs, installed_by: "lead@x", installed_at: "2026-09-23T00:00:00Z", source: null }));
    expect(await activeRuleset("http://b")).toEqual({ ruleset: rs, raw: rs, removed: [], ref: "ruleset@2", source: "project", sha256: "ab" });
  });

  it("is null on 404 — nothing installed on the project or its office", async () => {
    bfetch.mockResolvedValue(res(404, { message: "no ruleset artefact installed for aster-villa or its office" }));
    expect(await activeRuleset("http://b")).toBeNull();
    expect(NO_RULESET).toBe("No ruleset installed for this project — install one from Packs");
  });

  it("a 404 that is not 'not installed' throws: a key the bridge does not know is not an empty project", async () => {
    bfetch.mockResolvedValue(res(404, { message: "no ruleset artefact installed for aster-villa or its office", reason: "not_installed" }));
    expect(await activeRuleset("http://b")).toBeNull();
    bfetch.mockResolvedValue(res(404, { message: 'Project "aster-vila" does not exist', reason: "no_project" }));
    await expect(activeRuleset("http://b")).rejects.toThrow('Project "aster-vila" does not exist');
  });

  it("expands {org} for judging and keeps the raw body for publishing (the Aster ruleset@1 shape)", async () => {
    const body = JSON.parse(readFileSync("../demo/aster/ruleset-AST.json", "utf8"));
    bfetch.mockResolvedValue(res(200, { body, source: "office", ref: "ruleset@1", sha256: "fb8f9baefa9f0000", pointer_sha_mismatch: false }));
    const a = (await activeRuleset("http://b"))!;
    expect(a.ruleset.rules.find((r) => r.id === "SN-01")!.token_defs!.ORG).toBe("AST");
    expect(JSON.stringify(a.ruleset)).not.toContain("{org}");
    expect(a.raw).toEqual(body);
    expect(a.raw.rules.find((r) => r.id === "SN-01")!.token_defs!.ORG).toBe("{org}");
    expect(a.removed).toEqual([]);
  });

  it("throws on a bridge failure instead of reading it as nothing installed", async () => {
    bfetch.mockResolvedValue(res(500, { message: "boom" }));
    await expect(activeRuleset("http://b")).rejects.toThrow("boom");
  });
});

describe("installArtefact", () => {
  beforeEach(() => bfetch.mockReset());

  it("PUTs the body to the kind's route with the actor and returns the pointer", async () => {
    bfetch.mockResolvedValue(res(201, { kind: "naming", version: 3, sha256: "cd" }));
    expect(await installArtefact("http://b", "aster-villa", "naming", { title: "t" }, "lead@x")).toEqual({ kind: "naming", version: 3, sha256: "cd" });
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/artefacts/naming?actor=lead%40x", expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "t" }) }));
  });

  it("throws the bridge's refusal (validation or role)", async () => {
    bfetch.mockResolvedValue(res(400, { message: "rules[3].mode must be warn | request | monitor | reject" }));
    await expect(installArtefact("http://b", "k", "ruleset", {}, "web")).rejects.toThrow("rules[3].mode");
  });
});

describe("droppedRulesNote", () => {
  const base = { ref: "ruleset@1", source: "office" };
  it("is null when every rule runs", async () => {
    const { droppedRulesNote } = await import("./active-ruleset");
    expect(droppedRulesNote({ ...base, ruleset: { standard_key: "k", semver: "1.0.0", rules: [{ id: "A" }] } as never, removed: [] })).toBeNull();
  });
  it("says nothing can run when {org} expansion removed every rule — never a 100 % score", async () => {
    const { droppedRulesNote } = await import("./active-ruleset");
    const note = droppedRulesNote({ ...base, ruleset: { standard_key: "k", semver: "1.0.0", rules: [] } as never, removed: ["WS-01", "VN-01"] });
    expect(note).toContain("None of the rules in ruleset@1 · office can run");
    expect(note).toContain("all 2");
  });
  it("names the skipped rules when some still run", async () => {
    const { droppedRulesNote } = await import("./active-ruleset");
    const note = droppedRulesNote({ ...base, ruleset: { standard_key: "k", semver: "1.0.0", rules: [{ id: "A" }] } as never, removed: ["VP-01"] });
    expect(note).toContain("1 rule(s) of ruleset@1 · office skipped");
    expect(note).toContain("VP-01");
  });
});
