import { describe, it, expect } from "vitest";
import {
  buildGrounding, buildDraftPrompt, buildIntegrityPrompt,
  parseDraft, parseFindings, SEVERITIES, MAX_FINDING_CHARS,
} from "./bimdocs-ai-logic.mjs";

const DOC = {
  id: "d1", title: "Demo BEP", doc_type: "bep", status: "wip",
  sections: [
    { id: "s1", heading: "Naming convention", guidance: "How containers are named", body: "We use PRJ-XX-YY names.", state: "wip", owner: null, bindings: {} },
    { id: "s2", heading: "Delivery milestones", guidance: "MIDP summary", body: "", state: "wip", owner: null, bindings: {} },
  ],
};

const FULL_INPUT = {
  project: { key: "demo", name: "Demo Project", appointing_party: "ACME" },
  ruleset: { fields: ["project", "originator", "volume"] },
  rulesetSource: "project",
  checks: [{ id: "naming.ruleset", label: "Container naming", description: "Names match the active ruleset" }],
  planned: [{ id: "carbon.budget", label: "Carbon budget", reason: "no model yet" }],
  deliverableSummary: { total: 4, delivered: 1, late: 1, in_wip: 1, overdue: 1, pending: 0, unscheduled: 0 },
  compliance: { sections: [{ section_id: "s1", heading: "Naming convention", results: [{ id: "naming.ruleset", label: "Container naming", status: "violations", count: 2, summary: "2 bad names" }] }] },
};

describe("buildGrounding", () => {
  it("numbers facts from 1 and is deterministic", () => {
    const a = buildGrounding(FULL_INPUT);
    const b = buildGrounding(FULL_INPUT);
    expect(a.facts.map((f) => f.n)).toEqual(a.facts.map((_, i) => i + 1));
    expect(a).toEqual(b);
    expect(a.facts.length).toBeGreaterThanOrEqual(5);
  });

  it("includes project, ruleset, checks, planned gaps, deliverables and compliance as facts", () => {
    const text = buildGrounding(FULL_INPUT).facts.map((f) => f.text).join("\n");
    expect(text).toContain("Demo Project");
    expect(text).toContain("originator");
    expect(text).toContain("Container naming");
    expect(text).toMatch(/no check exists/i);        // planned gap stated honestly
    expect(text).toMatch(/4 deliverable/i);
    expect(text).toMatch(/2 bad names/);
  });

  it("invents NO fact for an absent source (missing ruleset → no naming fact, no placeholder)", () => {
    const g = buildGrounding({ ...FULL_INPUT, ruleset: null, rulesetSource: "unknown" });
    const text = g.facts.map((f) => f.text).join("\n");
    expect(text).not.toMatch(/naming ruleset/i);
    expect(text).not.toMatch(/unknown|placeholder|TBD/i);
  });

  it("states an empty deliverable plan as its own honest fact", () => {
    const g = buildGrounding({ ...FULL_INPUT, deliverableSummary: { total: 0 } });
    expect(g.facts.map((f) => f.text).join("\n")).toMatch(/no deliverables/i);
  });
});

describe("prompts", () => {
  it("draft prompt targets exactly one section and demands JSON {body}", () => {
    const { system, user } = buildDraftPrompt(buildGrounding(FULL_INPUT), DOC, DOC.sections[1]);
    expect(system).toMatch(/JSON/);
    expect(user).toContain("Delivery milestones");
    expect(user).toContain('"body"');
    expect(user).toContain("Naming convention"); // sibling headings for context
    expect(user).not.toContain("We use PRJ-XX-YY names."); // sibling BODIES stay out (token budget)
    expect(system).toMatch(/only .*facts|facts .*only/i); // no invented specifics
  });

  it("integrity prompt contains the numbered facts, every section body, and the findings shape", () => {
    const { user } = buildIntegrityPrompt(buildGrounding(FULL_INPUT), DOC);
    expect(user).toMatch(/FACT 1[.:]/);
    expect(user).toContain("We use PRJ-XX-YY names.");
    expect(user).toContain('"findings"');
    expect(user).toContain('"fact"');
    expect(user).toContain("s1"); // section ids the model must echo back
  });
});

describe("parseDraft", () => {
  it("accepts clean JSON", () => expect(parseDraft('{"body":"Hello."}')).toEqual({ body: "Hello." }));
  it("accepts fenced JSON", () => expect(parseDraft('```json\n{"body":"Hi"}\n```')).toEqual({ body: "Hi" }));
  it("rejects garbage as unparsed", () => expect(parseDraft("I cannot help")).toEqual({ unparsed: true }));
  it("rejects a non-string body as unparsed", () => expect(parseDraft('{"body":42}')).toEqual({ unparsed: true }));
  it("rejects an empty body as unparsed (a blank draft is a failure, not a proposal)", () =>
    expect(parseDraft('{"body":"  "}')).toEqual({ unparsed: true }));
});

describe("parseFindings — the gate", () => {
  const F = (over = {}) => ({ section_id: "s1", fact: 1, claim: "doc says X", reality: "fact says Y", severity: "high", ...over });
  const ok = (arr) => JSON.stringify({ findings: arr });

  it("keeps a valid finding", () => {
    const r = parseFindings(ok([F()]), DOC, 5);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toBe(0);
  });

  it("drops a finding with no fact citation and counts it", () => {
    const r = parseFindings(ok([F({ fact: undefined }), F()]), DOC, 5);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });

  it("drops an out-of-range or non-integer fact index", () => {
    const r = parseFindings(ok([F({ fact: 6 }), F({ fact: 0 }), F({ fact: "one" })]), DOC, 5);
    expect(r.findings).toHaveLength(0);
    expect(r.dropped).toBe(3);
  });

  it("drops a section_id not present in the document", () => {
    const r = parseFindings(ok([F({ section_id: "nope" })]), DOC, 5);
    expect(r.findings).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });

  it("defaults an unknown severity to low instead of dropping", () => {
    const r = parseFindings(ok([F({ severity: "catastrophic" })]), DOC, 5);
    expect(r.findings[0].severity).toBe("low");
  });

  it("drops a finding missing claim or reality (nothing to show a human)", () => {
    const r = parseFindings(ok([F({ claim: "" }), F({ reality: undefined })]), DOC, 5);
    expect(r.findings).toHaveLength(0);
    expect(r.dropped).toBe(2);
  });

  it("truncates long claim/reality to MAX_FINDING_CHARS", () => {
    const r = parseFindings(ok([F({ claim: "x".repeat(2000) })]), DOC, 5);
    expect(r.findings[0].claim.length).toBeLessThanOrEqual(MAX_FINDING_CHARS);
  });

  it("returns unparsed for garbage or a non-array findings key", () => {
    expect(parseFindings("nope", DOC, 5)).toEqual({ unparsed: true });
    expect(parseFindings('{"findings":"none"}', DOC, 5)).toEqual({ unparsed: true });
  });

  it("an empty findings array is a VALID consistent-document result, not unparsed", () => {
    expect(parseFindings(ok([]), DOC, 5)).toEqual({ findings: [], dropped: 0 });
  });

  it("accepts fenced JSON", () => {
    const r = parseFindings("```json\n" + ok([F()]) + "\n```", DOC, 5);
    expect(r.findings).toHaveLength(1);
  });
});

describe("SEVERITIES", () => {
  it("is the frozen list", () => expect(SEVERITIES).toEqual(["high", "medium", "low"]));
});

describe("extractJson candidate preference (schema-echo defense)", () => {
  it("parseDraft picks the candidate with the expected key, not the first parseable fence", () => {
    const reply = 'The format is:\n```json\n{"example": true}\n```\nHere is my answer:\n```json\n{"body":"Real content."}\n```';
    expect(parseDraft(reply)).toEqual({ body: "Real content." });
  });

  it("parseFindings skips a schema-echo fence and finds the real findings block", () => {
    const echo = '{"schema":"demo"}';
    const real = JSON.stringify({ findings: [{ section_id: "s1", fact: 1, claim: "c", reality: "r", severity: "low" }] });
    const r = parseFindings("```json\n" + echo + "\n```\n```json\n" + real + "\n```", DOC, 5);
    expect(r.findings).toHaveLength(1);
  });

  it("still falls back to a keyless parse being rejected as unparsed, not crashing", () => {
    expect(parseDraft('```json\n{"example": true}\n```')).toEqual({ unparsed: true });
  });
});
