import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mergeMetaForTest, selectFailures, projectNamingRuleset, NO_NAMING_REASON, judgeContainerName } from "./cde-store.mjs";

describe("judgeContainerName — a missing enforce is reject", () => {
  const validate = (name) => ({ ok: /^A-\d{4}$/.test(name) });
  it("rejects a bad name under a ruleset with no enforce and records reject", () => {
    expect(judgeContainerName(validate, "Bad name", { fields: [] })).toEqual({ ok: false, enforce: "reject" });
  });
  it("is null with no ruleset or enforce off; keeps warn", () => {
    expect(judgeContainerName(validate, "x", null)).toBeNull();
    expect(judgeContainerName(validate, "x", { enforce: "off" })).toBeNull();
    expect(judgeContainerName(validate, "x", { enforce: "warn" }).enforce).toBe("warn");
  });
});

const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

describe("projectNamingRuleset — the naming artefact, never a shipped file", () => {
  it("is source none with no ruleset when nothing is installed on the project or its office", async () => {
    const resolveArtefact = vi.fn(async () => NONE);
    expect(await projectNamingRuleset("aster-villa", { resolveArtefact })).toEqual({ ruleset: null, source: "none", ref: null, sha256: null });
    expect(resolveArtefact).toHaveBeenCalledWith("aster-villa", "naming");
  });
  it("returns the office's naming body with its ref and sha", async () => {
    const body = { standard_key: "x", semver: "1.0.0", title: "T", separator: "-", fields: [{ key: "p", label: "P", pattern: "[A-Z]+" }] };
    const resolveArtefact = async () => ({ body, source: "office", ref: "naming@1", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false });
    expect(await projectNamingRuleset("aster-villa", { resolveArtefact })).toEqual({ ruleset: body, source: "office", ref: "naming@1", sha256: "3f07376abcdef0123456789" });
  });
  it("names the install route in the not-installed reason", () => {
    expect(NO_NAMING_REASON).toBe("no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });
});

describe("selectFailures — the failure list a proposer gets back, with honest totals", () => {
  const f = (req, n) => Array.from({ length: n }, (_, i) => ({ element: `g${req}${i}`, requirement: req, reason: "missing" }));
  const all = [...f("Pset_DoorCommon.FireRating", 132), ...f("Pset_BDS.Discipline", 132)];

  it("unfiltered: first 200 of everything, totals say what was cut", () => {
    const out = selectFailures(all, undefined);
    expect(out.failures).toHaveLength(200);
    expect(out.failures_total).toBe(264);
    expect(out.failures_matched).toBe(264);
  });

  it("filtered to one requirement (case-insensitive): only those, up to 1000, matched counted before slicing", () => {
    const out = selectFailures(all, "pset_doorcommon.firerating");
    expect(out.failures).toHaveLength(132);
    expect(out.failures.every((x) => x.requirement === "Pset_DoorCommon.FireRating")).toBe(true);
    expect(out.failures_total).toBe(264);
    expect(out.failures_matched).toBe(132);
    const big = selectFailures(f("@Name", 1500), "@Name");
    expect(big.failures).toHaveLength(1000);
    expect(big.failures_matched).toBe(1500); // a client sees 1000 < 1500 ⇒ truncated, no guessing
  });

  it("a blank filter is no filter; a non-array is empty", () => {
    expect(selectFailures(all, "  ").failures).toHaveLength(200);
    expect(selectFailures(null, "x")).toEqual({ failures: [], failures_total: 0, failures_matched: 0 });
  });
});

describe("mergeMeta", () => {
  const base = { stage: "design", standards_pack: "", dimensions: { "2d": true }, snapshot: {}, gates: {} };

  it("no longer writes active_ruleset (retired: standards are artefacts)", () => {
    const out = mergeMetaForTest(base, { active_ruleset: { standard_key: "k", semver: "1.0.0", rules: [] } });
    expect(out.active_ruleset).toBeUndefined();
  });

  it("no longer writes stage — the ledger's newest gate:pass row is the stage (phase 5c); the other keys merge as before", () => {
    const out = mergeMetaForTest(base, { stage: "coord", standards_pack: "bds-house@1.4.1" });
    expect(out.stage).toBe("design");            // whatever the column already held: untouched, read by nothing
    expect(out.standards_pack).toBe("bds-house@1.4.1");
  });

  it("leaves active_ruleset untouched when the patch omits it", () => {
    const withRs = { ...base, active_ruleset: { standard_key: "keep-me", semver: "1", rules: [] } };
    const out = mergeMetaForTest(withRs, { stage: "coord" });
    expect(out.active_ruleset.standard_key).toBe("keep-me");
  });

  it("deep-merges dimensions and snapshot as before", () => {
    const out = mergeMetaForTest({ ...base, snapshot: { health: 90 } }, { dimensions: { "4d": true }, snapshot: { compliance: 70 } });
    expect(out.dimensions).toEqual({ "2d": true, "4d": true });
    expect(out.snapshot).toEqual({ health: 90, compliance: 70 });
  });

  it("0039: a snapshot holds the fields the web writes — a currency of three capitals, numbers, short text; anything else is a 400 in words", () => {
    const web = { currency: "SAR", open_issues: 3, hard_clashes: 1, health: 90, compliance: 70, cost_total: 125000, carbon_tco2e: 12,
      carbon_basis: "indicative reference factors — no factor pack installed", handover_readiness: 94, handover_complete: 189,
      handover_total: 199, handover_at: "2026-10-05T10:00:00.000Z" };
    expect(mergeMetaForTest(base, { snapshot: web }).snapshot).toEqual(web);
    const refusal = (snapshot) => { try { mergeMetaForTest(base, { snapshot }); return null; } catch (e) { return e; } };
    for (const [snapshot, words] of [[{ currency: "sar" }, "currency is three capital letters"], [{ currency: "SARS" }, "currency is three capital letters"],
      [{ health: "90" }, "health is a number"], [{ carbon_basis: "a < b" }, "without < or >"], [{ carbon_basis: "x".repeat(301) }, "at most 300 characters"],
      [{ owner: "x" }, "'owner' is not a snapshot field"], [["SAR"], "a snapshot is an object"], ["SAR", "a snapshot is an object"]])
      expect(refusal(snapshot)).toMatchObject({ status: 400, message: expect.stringMatching(new RegExp(`${words}.* — nothing was saved$`)) });
    // the merged snapshot is checked too: a field stored before this rule is said, not left for the database to refuse
    expect(() => mergeMetaForTest({ ...base, snapshot: { carbon_t: 12 } }, { snapshot: { health: 80 } }))
      .toThrow(/'carbon_t' is not a snapshot field — nothing was saved$/);
  });

  it("0039: the web's autosave stores only what fits — a currency of three capitals, finite numbers — and says when a save fails", () => {
    const shell = readFileSync(new URL("../src/setups/project-shell.ts", import.meta.url), "utf8").replace(/\r/g, "");
    expect(shell).toContain("/^[A-Z]{3}$/.test(kpis.currency) ? { currency: kpis.currency } : {};");
    expect(shell).toContain("const num = (k: string, v: number | null) => { if (v != null && Number.isFinite(v)) snap[k] = Math.round(v); };");
    expect(shell).not.toContain("}).catch(() => {});\n  };");
    expect(shell.match(/console\.warn\("\[snapshot\] not saved — " \+/g)).toHaveLength(2);
  });
});
