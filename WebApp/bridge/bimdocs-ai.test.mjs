import { describe, it, expect, vi } from "vitest";
import { draftSection, integrityReport, MAX_INTEGRITY_CHARS } from "./bimdocs-ai.mjs";

// Fake stores via deps injection — no network, no Supabase.
const DOC = {
  id: "d1", project_id: "p1", title: "Demo BEP", doc_type: "bep", status: "wip", updated_at: "t1",
  sections: [
    { id: "s1", heading: "Naming", guidance: "", body: "We name things PRJ-XX.", state: "wip", owner: null, bindings: {} },
    { id: "s2", heading: "Milestones", guidance: "MIDP", body: "", state: "wip", owner: null, bindings: {} },
  ],
};
const baseDeps = (chat) => ({
  chat,
  getDoc: vi.fn(async () => ({ ...DOC })),
  complianceReport: vi.fn(async () => ({ sections: [] })),
  listChecks: vi.fn(() => ({ checks: [{ id: "c1", label: "L", description: "D" }], planned: [] })),
  deliverableStatus: vi.fn(async () => ({ summary: { total: 0 } })),
  ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", name: "Demo" })),
  projectNamingRuleset: vi.fn(async () => ({ ruleset: null, source: "unknown" })),
});

describe("draftSection", () => {
  it("returns the parsed proposal and never writes", async () => {
    const chat = vi.fn(async () => ({ text: '{"body":"Drafted."}', provider: "local", model: "m" }));
    const r = await draftSection("demo", "d1", "s2", {}, baseDeps(chat));
    expect(r.proposal).toBe("Drafted.");
    expect(r.grounding_used).toBeGreaterThan(0);
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][0].format).toBe("json");
  });

  it("rejects a published document with 409", async () => {
    const deps = baseDeps(vi.fn());
    deps.getDoc = vi.fn(async () => ({ ...DOC, status: "published" }));
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 409 });
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("rejects an unknown section with 404 before any AI call", async () => {
    const deps = baseDeps(vi.fn());
    await expect(draftSection("demo", "d1", "nope", {}, deps)).rejects.toMatchObject({ status: 404 });
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("surfaces unusable model output as 502, not silence", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: "I refuse", provider: "local", model: "m" })));
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 502 });
  });

  it("propagates a gateway 503 untouched", async () => {
    const deps = baseDeps(vi.fn(async () => { throw Object.assign(new Error("Ollama unreachable"), { status: 503 }); }));
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 503 });
  });

  it("passes provider/model through to chat", async () => {
    const chat = vi.fn(async () => ({ text: '{"body":"x"}', provider: "claude", model: "sonnet" }));
    await draftSection("demo", "d1", "s2", { provider: "claude", model: "sonnet" }, baseDeps(chat));
    expect(chat.mock.calls[0][0]).toMatchObject({ provider: "claude", model: "sonnet" });
  });
});

describe("integrityReport", () => {
  it("gates findings and reports dropped honestly", async () => {
    const reply = { findings: [
      { section_id: "s1", fact: 1, claim: "doc says X", reality: "fact says Y", severity: "high" },
      { section_id: "s1", claim: "uncited", reality: "r" },
    ] };
    const deps = baseDeps(vi.fn(async () => ({ text: JSON.stringify(reply), provider: "local", model: "m" })));
    const r = await integrityReport("demo", "d1", {}, deps);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toBe(1);
    expect(r.generated_at).toBeTruthy();
  });

  it("returns an honest empty note WITHOUT calling the AI when the document has no content", async () => {
    const deps = baseDeps(vi.fn());
    deps.getDoc = vi.fn(async () => ({ ...DOC, sections: DOC.sections.map((s) => ({ ...s, body: "" })) }));
    const r = await integrityReport("demo", "d1", {}, deps);
    expect(r.findings).toEqual([]);
    expect(r.note).toMatch(/no content/i);
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("allows a published document (reading immutable content is fine)", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: '{"findings":[]}', provider: "local", model: "m" })));
    deps.getDoc = vi.fn(async () => ({ ...DOC, status: "published" }));
    const r = await integrityReport("demo", "d1", {}, deps);
    expect(r.findings).toEqual([]);
  });

  it("rejects an oversized document with 413 before any AI call", async () => {
    const deps = baseDeps(vi.fn());
    deps.getDoc = vi.fn(async () => ({ ...DOC, sections: [{ ...DOC.sections[0], body: "x".repeat(MAX_INTEGRITY_CHARS + 1) }] }));
    await expect(integrityReport("demo", "d1", {}, deps)).rejects.toMatchObject({ status: 413 });
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("surfaces unparseable output as 502", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: "garbage", provider: "local", model: "m" })));
    await expect(integrityReport("demo", "d1", {}, deps)).rejects.toMatchObject({ status: 502 });
  });
});

describe("refusal handling", () => {
  it("draft: a refused reply surfaces its own 502 message, not 'unusable output'", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: "no", refused: true, provider: "local", model: "m" })));
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/declined/) });
  });

  it("integrity: a refused reply surfaces a distinguishable 502", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: "no", refused: true, provider: "local", model: "m" })));
    await expect(integrityReport("demo", "d1", {}, deps)).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/declined/) });
  });
});

describe("prompt-size cap measures the ASSEMBLED prompt", () => {
  it("integrity: a small doc with a fact-heavy grounding still 413s before any AI call", async () => {
    const deps = baseDeps(vi.fn());
    // tiny doc body, but compliance results push the fact block far past the cap
    deps.complianceReport = vi.fn(async () => ({
      sections: [{ section_id: "s1", heading: "Naming", results: [{ id: "c1", label: "L", status: "violations", summary: "x".repeat(MAX_INTEGRITY_CHARS + 1000) }] }],
    }));
    await expect(integrityReport("demo", "d1", {}, deps)).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/assembled integrity prompt/) });
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("draft: an oversized assembled prompt 413s before any AI call (the draft path was uncapped)", async () => {
    const deps = baseDeps(vi.fn());
    deps.getDoc = vi.fn(async () => ({ ...DOC, sections: [{ ...DOC.sections[1], body: "x".repeat(MAX_INTEGRITY_CHARS + 1000) }] }));
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 413, message: expect.stringMatching(/assembled draft prompt/) });
    expect(deps.chat).not.toHaveBeenCalled();
  });
});
