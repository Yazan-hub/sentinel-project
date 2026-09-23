// The web reads the ruleset in force through the bridge; nothing installed is null, never a bundled fallback.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./active-project", () => ({ activePid: () => "aster-villa" }));

import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const rs = { standard_key: "house", semver: "1.0.0", rules: [{ id: "SN-01", target: "sheet", mode: "request" }] };

describe("activeRuleset", () => {
  beforeEach(() => bfetch.mockReset());

  it("reads the artefact the bridge resolved and names ref, source and sha", async () => {
    bfetch.mockResolvedValue(res(200, { body: rs, source: "office", ref: "ruleset@1", sha256: "3f07376a1b2c3d4e5f60", pointer_sha_mismatch: false }));
    const a = await activeRuleset("http://b/");
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/artefacts/ruleset");
    expect(a).toEqual({ ruleset: rs, ref: "ruleset@1", source: "office", sha256: "3f07376a1b2c3d4e5f60" });
    expect(refLabel(a!)).toBe("ruleset@1 · office · 3f07376a1b2c…");
  });

  it("accepts the stored-document shape: the ref comes from the version, the source is the project", async () => {
    bfetch.mockResolvedValue(res(200, { kind: "ruleset", version: 2, sha256: "ab", body: rs, installed_by: "lead@x", installed_at: "2026-09-23T00:00:00Z", source: null }));
    expect(await activeRuleset("http://b")).toEqual({ ruleset: rs, ref: "ruleset@2", source: "project", sha256: "ab" });
  });

  it("is null on 404 — nothing installed on the project or its office", async () => {
    bfetch.mockResolvedValue(res(404, { message: "no ruleset artefact installed for aster-villa or its office" }));
    expect(await activeRuleset("http://b")).toBeNull();
    expect(NO_RULESET).toBe("No ruleset installed for this project — install one from Packs");
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
