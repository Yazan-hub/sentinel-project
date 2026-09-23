import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { normalizeAgent, buildReceipt, verifyReceipt, RECEIPT_VERSION } from "./agent-provenance.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");

describe("normalizeAgent", () => {
  it("marks every block as CLAIMED — Sentinel cannot verify who called it", () => {
    expect(normalizeAgent({ kind: "agent", model: "gpt-6-astra" }).claimed).toBe(true);
  });

  it("hashes the prompt and never keeps its text", () => {
    const a = normalizeAgent({ kind: "agent", prompt: "model me a stair core" });
    expect(a.prompt_sha256).toBe(sha("model me a stair core"));
    expect(a.prompt_chars).toBe(21);
    expect(JSON.stringify(a)).not.toContain("stair core");
  });

  it("accepts a pre-computed digest when the caller will not share the prompt", () => {
    const d = sha("x");
    expect(normalizeAgent({ kind: "agent", prompt_sha256: d }).prompt_sha256).toBe(d);
  });

  it("infers 'agent' when a model or tool is named but no kind is", () => {
    expect(normalizeAgent({ model: "fable-5" }).kind).toBe("agent");
    expect(normalizeAgent({ tool: "revit-mcp" }).kind).toBe("agent");
  });

  it("keeps a stated human claim as human", () => {
    expect(normalizeAgent({ kind: "human" }).kind).toBe("human");
  });

  it("never trusts an unrecognised kind — but a named model still reads as machine-authored", () => {
    // Erring toward "agent" is the safe direction: calling a machine a human is the dangerous
    // misclassification, and the whole block is marked claimed either way.
    expect(normalizeAgent({ kind: "wizard", model: "m" }).kind).toBe("agent");
    expect(normalizeAgent({ kind: "wizard", tool: "t" }).kind).toBe("agent");
  });

  it("falls back to 'unknown' when an unrecognised kind names nothing else", () => {
    expect(normalizeAgent({ kind: "wizard", prompt: "hi" }).kind).toBe("unknown");
  });

  it("returns null for an empty claim — an absence stays an absence", () => {
    for (const bad of [null, undefined, {}, [], "agent", 7, { kind: "  " }]) expect(normalizeAgent(bad)).toBeNull();
  });

  it("truncates long model/tool strings instead of letting them into the ledger unbounded", () => {
    expect(normalizeAgent({ model: "m".repeat(500) }).model).toHaveLength(120);
  });
});

describe("buildReceipt", () => {
  const row = {
    id: 412, at: "2026-09-15T10:00:00.000Z", actor: "agent", hash: "abc123", prev_hash: "def456",
    new_value: { verdict: "accepted", ids_source: "project", summary: { ids: { failing: 0 } }, agent: { claimed: true, kind: "agent", model: "gpt-6" } },
  };

  it("anchors on the ledger's own chain hash, not a digest of its own", () => {
    const r = buildReceipt(row, { project_key: "bds" });
    expect(r.ledger_hash).toBe("abc123");
    expect(r.prev_hash).toBe("def456");
    expect(r.version).toBe(RECEIPT_VERSION);
    expect(r.project).toBe("bds");
  });

  it("carries the claimed provenance through untouched", () => {
    expect(buildReceipt(row).agent).toEqual({ claimed: true, kind: "agent", model: "gpt-6" });
  });

  it("is null for a row that does not exist", () => {
    expect(buildReceipt(null)).toBeNull();
    expect(buildReceipt({})).toBeNull();
  });

  it("carries null provenance rather than inventing one", () => {
    expect(buildReceipt({ id: 1, new_value: {} }).agent).toBeNull();
  });
});

describe("verifyReceipt", () => {
  const row = { id: 412, at: "2026-09-15T10:00:00.000Z", hash: "abc123", prev_hash: "d", new_value: { verdict: "accepted" } };
  const good = buildReceipt(row, { project_key: "bds" });

  it("confirms a receipt that matches its ledger entry", () => {
    expect(verifyReceipt(good, row)).toMatchObject({ matches: true, reasons: [] });
  });

  it("names each mismatch rather than returning a bare false", () => {
    const r = verifyReceipt({ ...good, verdict: "rejected" }, row);
    expect(r.matches).toBe(false);
    expect(r.reasons[0]).toMatch(/verdict does not match the ledger \(receipt: rejected, ledger: accepted\)/);
  });

  it("refuses a forged hash", () => {
    const r = verifyReceipt({ ...good, ledger_hash: "forged" }, row);
    expect(r.matches).toBe(false);
    expect(r.reasons.some((x) => x.includes("ledger_hash"))).toBe(true);
  });

  it("refuses to confirm when the ledger row carries no chain hash at all", () => {
    const noHash = { ...row, hash: null };
    const r = verifyReceipt(buildReceipt(noHash), noHash);
    expect(r.matches).toBe(false);
    expect(r.reasons[0]).toMatch(/carries no chain hash/);
  });

  it("rejects an unknown receipt version", () => {
    expect(verifyReceipt({ ...good, version: "made-up/9" }, row).matches).toBe(false);
  });

  it("says plainly when the ledger entry does not exist", () => {
    expect(verifyReceipt(good, null)).toMatchObject({ matches: false, reasons: ["no ledger entry exists with that audit id"] });
  });
});
