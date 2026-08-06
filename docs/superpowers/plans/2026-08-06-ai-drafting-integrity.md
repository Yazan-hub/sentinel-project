# AI Drafting + Integrity Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-section AI drafting (propose-only) and on-demand document-vs-reality integrity analysis (transient findings), with a code-enforced anti-hallucination gate.

**Architecture:** A pure logic module builds a numbered fact list (grounding) and the two prompts, and gates the model's output — any finding that does not cite a grounded fact is dropped in code. A thin composition module assembles grounding from existing stores and makes one `chat()` call per operation. Neither writes anything; the only write path remains the human save through the existing `patchSection`.

**Tech Stack:** Node ESM bridge, `ai-gateway.mjs`'s `chat()`, vitest, plain-DOM TypeScript panel.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-ai-drafting-integrity-design.md` — implemented exactly.
- **LLM proposes, code disposes.** The model never queries anything; it sees only the grounding pack code built. Every integrity finding must cite a fact index; uncited/invalid findings are dropped in code with an honest `dropped` count. Draft proposals are never saved by these modules.
- **Writes nothing.** `draftSection` and `integrityReport` perform no DB write and no audit call. The audit for an accepted draft happens in `patchSection` when the human saves.
- **Transient findings.** No table, no persistence, no dismiss machinery. The UI labels the report "AI analysis — suggestions, not compliance facts."
- **Error discipline (copied from `bimdocs-ingest.mjs`):** gateway errors WITH a `status` (503 provider down, 400) propagate as-is; errors WITHOUT a status are bugs and propagate; a model reply that fails the parser surfaces as 502 "model returned unusable output — try again or switch model", never silence, never fabricated content.
- **Route pattern:** the existing `/bimdocs` block dispatches on `seg` = `['bimdocs', p1(key), p2(docId), p3, p4]`. New routes follow the existing `section` idiom: `POST /bimdocs/:key/:docId/section/:sectionId/draft` and `POST /bimdocs/:key/:docId/integrity`.
- **XSS:** all model-derived strings (drafts, findings) are hostile by definition — `.textContent`/`.value` only.
- Bridge modules ESM `.mjs`, Node 20+; `err(status,msg)` idiom; no new dependencies; all npm/vitest commands from `WebApp/`.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Test baseline: **317 passing**. Build: `npm run build`.

## Existing interfaces consumed (verified, do not re-derive)

```js
// ai-gateway.mjs
chat({provider="local", model, system, messages=[], tools=[], format}) → {text, toolCalls, provider, model, refused?}
// throws {status:503} provider unreachable / not enabled, {status:502} provider HTTP error

// bimdocs-store.mjs
getDoc(key, docId) → row  // {id, project_id, title, doc_type, status, sections:[{id,heading,guidance,body,state,owner,bindings}], updated_at, ...}; 404 unknown
complianceReport(key, docId) → {summary, sections:[{section_id, heading, results:[{id,label,status,count,summary,reason?}]}]}

// check-registry.mjs
listChecks() → {checks:[{id,label,description,params_schema}], planned:[{id,label,reason}]}

// deliverables-store.mjs
deliverableStatus(key) → {generated_at, today, rows, summary:{total,delivered,late,in_wip,overdue,pending,unscheduled}}

// cde-store.mjs
ensureProject(key) → {id, key, name, appointing_party, ...}   // throws {status:404}
projectNamingRuleset(key) → {ruleset:{fields?...}|null, source:"project"|"default"|"unknown"}
```

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/bimdocs-ai-logic.mjs` (new) | Pure: grounding, prompts, parsers, the gate. No I/O, no AI. |
| `WebApp/bridge/bimdocs-ai-logic.test.mjs` (new) | Exhaustive tests, especially `parseFindings`. |
| `WebApp/bridge/bimdocs-ai.mjs` (new) | Thin composition: assemble grounding, one `chat()` call each. |
| `WebApp/bridge/bimdocs-ai.test.mjs` (new) | Composition tests with injected fake `chat`. |
| `WebApp/bridge/bcf-service.mjs` (modify) | Two routes inside the existing `/bimdocs` block. |
| `WebApp/src/setups/docs-panel.ts` (modify) | Draft with AI button; Check integrity view. |

---

### Task 1: Pure logic — grounding, prompts, parsers, the gate

**Files:**
- Create: `WebApp/bridge/bimdocs-ai-logic.mjs`
- Test: `WebApp/bridge/bimdocs-ai-logic.test.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (exact names Task 2 imports):
  - `buildGrounding({project, ruleset, rulesetSource, checks, planned, deliverableSummary, compliance}) → {facts:[{n, text}]}`
  - `buildDraftPrompt(grounding, doc, section) → {system, user}`
  - `buildIntegrityPrompt(grounding, doc) → {system, user}`
  - `parseDraft(text) → {body} | {unparsed:true}`
  - `parseFindings(text, doc, factCount) → {findings:[{section_id, fact, claim, reality, severity}], dropped} | {unparsed:true}`
  - `SEVERITIES = ["high","medium","low"]`, `MAX_FINDING_CHARS = 500`

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/bimdocs-ai-logic.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/bimdocs-ai-logic.test.mjs`
Expected: FAIL — cannot load `./bimdocs-ai-logic.mjs`.

- [ ] **Step 3: Implement**

Create `WebApp/bridge/bimdocs-ai-logic.mjs`:

```javascript
// AI drafting + integrity analysis — the pure half. Builds the grounding pack (a numbered list of
// facts code derived from project state), the two prompts, and parses/gates the model's replies.
// No I/O and no AI here: what the model is shown, and what of its output survives, are both
// decided by unit-testable code.
//
// THE GATE (load-bearing): every integrity finding must cite a fact index from the grounding.
// A finding citing nothing, an unknown index, or a section not in the document is dropped here —
// the model cannot introduce a "fact" of its own into the report. Same honesty rule as the check
// registry (never claim what wasn't measured), applied to generative output.

export const SEVERITIES = ["high", "medium", "low"];
export const MAX_FINDING_CHARS = 500;

/** Numbered facts, built ONLY from sources that exist — an absent source contributes no fact,
 *  never a placeholder (a placeholder would be a fact we invented). */
export function buildGrounding({ project, ruleset, rulesetSource, checks, planned, deliverableSummary, compliance } = {}) {
  const texts = [];
  if (project?.name) texts.push(`This project is "${project.name}" (key: ${project.key})${project.appointing_party ? `, appointing party: ${project.appointing_party}` : ""}.`);
  if (ruleset && rulesetSource !== "unknown") {
    const fields = Array.isArray(ruleset.fields) ? ruleset.fields.join("-") : null;
    texts.push(`The active naming ruleset (${rulesetSource}) requires container names with fields: ${fields || "as configured"}.`);
  }
  for (const c of checks || []) texts.push(`A governance check is configured: "${c.label}" (${c.id}) — ${c.description}`);
  for (const p of planned || []) texts.push(`NO check exists for "${p.label}" — ${p.reason}`);
  if (deliverableSummary) {
    const s = deliverableSummary;
    texts.push(s.total
      ? `The MIDP tracks ${s.total} deliverable(s): ${s.delivered || 0} delivered, ${s.late || 0} late, ${s.in_wip || 0} in WIP unissued, ${s.overdue || 0} overdue, ${s.pending || 0} pending, ${s.unscheduled || 0} unscheduled.`
      : `No deliverables are planned in the MIDP tracker.`);
  }
  for (const sec of compliance?.sections || [])
    for (const r of sec.results || [])
      texts.push(`Compliance for section "${sec.heading}", check "${r.label}": ${r.status}${r.summary ? ` — ${r.summary}` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  return { facts: texts.map((text, i) => ({ n: i + 1, text })) };
}

const factBlock = (grounding) => grounding.facts.map((f) => `FACT ${f.n}: ${f.text}`).join("\n");

export function buildDraftPrompt(grounding, doc, section) {
  const siblings = doc.sections.filter((s) => s.id !== section.id).map((s) => s.heading).join("; ");
  return {
    system:
      `You draft one section of a BIM Execution Plan. Use ONLY the supplied facts for any project ` +
      `specifics — never invent names, dates, tools, or numbers not present in the facts. General ` +
      `ISO 19650 practice wording is fine. Reply with JSON only: {"body": "..."}`,
    user:
      `${factBlock(grounding)}\n\nDocument: "${doc.title}" (${doc.doc_type}). Other sections: ${siblings || "none"}.\n\n` +
      `Write the body for the section below. Match a professional BEP register. 1-4 paragraphs.\n` +
      `Section heading: ${section.heading}\nSection guidance: ${section.guidance || "none"}\n` +
      `Current body (may be empty; improve or replace): ${section.body || "(empty)"}\n\n` +
      `Reply with JSON only: {"body": "..."}`,
  };
}

export function buildIntegrityPrompt(grounding, doc) {
  const sections = doc.sections
    .filter((s) => (s.body || "").trim())
    .map((s) => `SECTION id=${s.id} heading="${s.heading}":\n${s.body}`)
    .join("\n\n");
  return {
    system:
      `You audit a BIM document against a numbered list of FACTS about the project's actual ` +
      `configuration. Report ONLY contradictions between the document text and a specific fact. ` +
      `Each finding MUST cite the fact number it contradicts. If nothing contradicts a fact, ` +
      `report nothing about it. Reply with JSON only: ` +
      `{"findings":[{"section_id":"...","fact":N,"claim":"what the document says","reality":"what the fact says","severity":"high|medium|low"}]}`,
    user: `${factBlock(grounding)}\n\nDocument "${doc.title}" (${doc.doc_type}):\n\n${sections}\n\nReply with JSON only.`,
  };
}

/** Tolerant JSON extraction: raw, or the first fenced/brace block. Returns null when hopeless. */
function extractJson(text) {
  const raw = String(text ?? "").trim();
  const candidates = [raw];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* next */ }
  }
  return null;
}

export function parseDraft(text) {
  const j = extractJson(text);
  if (!j || typeof j.body !== "string" || !j.body.trim()) return { unparsed: true };
  return { body: j.body };
}

export function parseFindings(text, doc, factCount) {
  const j = extractJson(text);
  if (!j || !Array.isArray(j.findings)) return { unparsed: true };
  const ids = new Set((doc?.sections || []).map((s) => s.id));
  const clip = (v) => String(v).slice(0, MAX_FINDING_CHARS);
  let dropped = 0;
  const findings = [];
  for (const f of j.findings) {
    const cited = Number.isInteger(f?.fact) && f.fact >= 1 && f.fact <= factCount;
    const located = typeof f?.section_id === "string" && ids.has(f.section_id);
    const showable = typeof f?.claim === "string" && f.claim.trim() && typeof f?.reality === "string" && f.reality.trim();
    if (!cited || !located || !showable) { dropped += 1; continue; }
    findings.push({
      section_id: f.section_id,
      fact: f.fact,
      claim: clip(f.claim),
      reality: clip(f.reality),
      severity: SEVERITIES.includes(f.severity) ? f.severity : "low",
    });
  }
  return { findings, dropped };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd WebApp && npx vitest run bridge/bimdocs-ai-logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `cd WebApp && npx vitest run`
Expected: 317 baseline + new, all passing.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/bimdocs-ai-logic.mjs WebApp/bridge/bimdocs-ai-logic.test.mjs
git commit -m "feat(bimdocs-ai): grounding, prompts, and the uncited-finding gate (pure)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Composition — `draftSection` and `integrityReport`

**Files:**
- Create: `WebApp/bridge/bimdocs-ai.mjs`
- Test: `WebApp/bridge/bimdocs-ai.test.mjs`

**Interfaces:**
- Consumes: everything Task 1 produced; `chat` from `./ai-gateway.mjs`; `getDoc`, `complianceReport` from `./bimdocs-store.mjs`; `listChecks` from `./check-registry.mjs`; `deliverableStatus` from `./deliverables-store.mjs`; `ensureProject`, `projectNamingRuleset` from `./cde-store.mjs`.
- Produces (Task 3 calls these):
  - `draftSection(key, docId, sectionId, {provider, model} = {}, deps = {}) → {proposal, grounding_used, provider, model}`
  - `integrityReport(key, docId, {provider, model} = {}, deps = {}) → {findings, dropped, grounding_used, generated_at, provider, model, note?}`
  - `MAX_INTEGRITY_CHARS = 60000`
  - `deps` allows tests to inject a fake `chat` (`deps.chat`); production callers omit it.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/bimdocs-ai.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/bimdocs-ai.test.mjs`
Expected: FAIL — cannot load `./bimdocs-ai.mjs`.

- [ ] **Step 3: Implement**

Create `WebApp/bridge/bimdocs-ai.mjs`:

```javascript
// AI drafting + integrity analysis — the I/O half. Assembles the grounding pack from existing
// stores, makes ONE chat() call per operation, and gates the reply through bimdocs-ai-logic.
// WRITES NOTHING: no DB write, no audit row. An accepted draft is saved by the human through the
// existing patchSection route, which audits it as a normal section edit.
import { chat as realChat } from "./ai-gateway.mjs";
import * as store from "./bimdocs-store.mjs";
import * as registry from "./check-registry.mjs";
import * as deliverables from "./deliverables-store.mjs";
import * as cde from "./cde-store.mjs";
import { buildGrounding, buildDraftPrompt, buildIntegrityPrompt, parseDraft, parseFindings } from "./bimdocs-ai-logic.mjs";

export const MAX_INTEGRITY_CHARS = 60000;
const err = (status, message) => Object.assign(new Error(message), { status });

/** deps is a test seam only — production callers pass nothing and get the real modules. */
const wire = (deps) => ({
  chat: deps.chat || realChat,
  getDoc: deps.getDoc || store.getDoc,
  complianceReport: deps.complianceReport || store.complianceReport,
  listChecks: deps.listChecks || registry.listChecks,
  deliverableStatus: deps.deliverableStatus || deliverables.deliverableStatus,
  ensureProject: deps.ensureProject || cde.ensureProject,
  projectNamingRuleset: deps.projectNamingRuleset || cde.projectNamingRuleset,
});

async function assembleGrounding(key, docId, d) {
  const [project, naming, status, compliance] = await Promise.all([
    d.ensureProject(key),
    d.projectNamingRuleset(key).catch(() => ({ ruleset: null, source: "unknown" })),
    d.deliverableStatus(key).catch(() => null),
    d.complianceReport(key, docId).catch(() => null),
  ]);
  const { checks, planned } = d.listChecks();
  return buildGrounding({
    project,
    ruleset: naming.ruleset, rulesetSource: naming.source,
    checks, planned,
    deliverableSummary: status?.summary || null,
    compliance,
  });
}

export async function draftSection(key, docId, sectionId, { provider, model } = {}, deps = {}) {
  const d = wire(deps);
  const doc = await d.getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived")
    throw err(409, `document is ${doc.status}; drafting requires an editable document`);
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) throw err(404, "section not found");

  const grounding = await assembleGrounding(key, docId, d);
  const { system, user } = buildDraftPrompt(grounding, doc, section);
  const reply = await d.chat({ provider, model, system, messages: [{ role: "user", content: user }], format: "json" });
  const parsed = parseDraft(reply.text);
  if (parsed.unparsed) throw err(502, "model returned unusable output — try again or switch model");
  return { proposal: parsed.body, grounding_used: grounding.facts.length, provider: reply.provider, model: reply.model };
}

export async function integrityReport(key, docId, { provider, model } = {}, deps = {}) {
  const d = wire(deps);
  const doc = await d.getDoc(key, docId);

  const contentChars = doc.sections.reduce((n, s) => n + (s.body || "").trim().length, 0);
  if (!contentChars)
    // Honest not-checkable, not a vacuous pass — and no AI cost for an empty document.
    return { findings: [], dropped: 0, grounding_used: 0, generated_at: new Date().toISOString(), note: "document has no content to analyse" };
  if (contentChars > MAX_INTEGRITY_CHARS)
    throw err(413, `document too large for integrity analysis (${contentChars} chars, limit ${MAX_INTEGRITY_CHARS})`);

  const grounding = await assembleGrounding(key, docId, d);
  const { system, user } = buildIntegrityPrompt(grounding, doc);
  const reply = await d.chat({ provider, model, system, messages: [{ role: "user", content: user }], format: "json" });
  const parsed = parseFindings(reply.text, doc, grounding.facts.length);
  if (parsed.unparsed) throw err(502, "model returned unusable output — try again or switch model");
  return {
    findings: parsed.findings, dropped: parsed.dropped,
    grounding_used: grounding.facts.length,
    generated_at: new Date().toISOString(),
    provider: reply.provider, model: reply.model,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd WebApp && npx vitest run bridge/bimdocs-ai.test.mjs && npx vitest run`
Expected: new tests pass; full suite passes.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/bimdocs-ai.mjs WebApp/bridge/bimdocs-ai.test.mjs
git commit -m "feat(bimdocs-ai): draftSection + integrityReport composition (read-only)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Routes

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (inside the existing `/bimdocs` block)

**Interfaces:**
- Consumes: Task 2's `draftSection`, `integrityReport`.
- Produces:
  - `POST /bimdocs/:key/:docId/section/:sectionId/draft` body `{provider?, model?}` → 200 `{proposal, grounding_used, provider, model}`
  - `POST /bimdocs/:key/:docId/integrity` body `{provider?, model?}` → 200 the report

- [ ] **Step 1: Add the routes**

In the `/bimdocs` block of `WebApp/bridge/bcf-service.mjs`, the dispatch uses `seg = ['bimdocs', p1(key), p2(docId), p3, p4]` (and `seg[5]` for deeper paths). Add these two dispatch lines DIRECTLY ABOVE the existing `if (p1 && p2 && p3 === "section" && p4 && req.method === "PATCH")` line (draft is the more specific match on the same prefix, so it must be tested first — note the PATCH line matches on method so ordering is belt-and-braces, but keep the specific route first regardless):

```javascript
      // AI proposals — read-only: nothing here writes; an accepted draft is saved via the normal
      // section PATCH. POST because they trigger slow/paid AI work (mirrors /ingest).
      if (p1 && p2 && p3 === "section" && p4 && seg[5] === "draft" && req.method === "POST") {
        const ai = await import("./bimdocs-ai.mjs");
        return send(res, 200, await ai.draftSection(p1, p2, p4, body || {}));
      }
      if (p1 && p2 && p3 === "integrity" && !p4 && req.method === "POST") {
        const ai = await import("./bimdocs-ai.mjs");
        return send(res, 200, await ai.integrityReport(p1, p2, body || {}));
      }
```

Also update the route-comment block at the top of the `/bimdocs` section (lines ~1012-1017) to list the two new routes.

- [ ] **Step 2: Verify syntax and suite**

Run: `cd WebApp && node --check bridge/bcf-service.mjs && npx vitest run`
Expected: clean; full suite passes.

- [ ] **Step 3: Restart the bridge and smoke**

Restart (kill PID on :4100 first — `Stop-ScheduledTask` alone is not reliable):

```bash
powershell -Command "$p=(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}; Start-Sleep 2; Start-ScheduledTask -TaskName SentinelBridge; Start-Sleep 6; if(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue){'up'}else{'DOWN'}"
```

With `TOKEN` from `config/.env` (repo root) and a real doc id from `GET /bimdocs/demo`:

```bash
# integrity on a real doc (Ollama must be running; a 503 with the Ollama message is the CORRECT result if it is not)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' \
  http://localhost:4100/bimdocs/demo/<docId>/integrity | head -c 600
# draft an existing section
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' \
  http://localhost:4100/bimdocs/demo/<docId>/section/<sectionId>/draft | head -c 600
# 404s: unknown doc, unknown section
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' http://localhost:4100/bimdocs/demo/nope/integrity
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' http://localhost:4100/bimdocs/demo/<docId>/section/nope/draft
```

Expected: real JSON (or an honest 503 naming Ollama) on the first two; `{message:...}` 404s on the last two. Confirm a neighbouring route still works (`GET /bimdocs/demo`). Paste real output in the report.

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(bimdocs-ai): draft + integrity routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — Draft with AI + Check integrity

**Files:**
- Modify: `WebApp/src/setups/docs-panel.ts`

**Interfaces:**
- Consumes: Task 3's routes; the panel's existing `api()` helper, section editor (textarea at ~line 509, save flow via section PATCH), `complianceStrip`, `showDocView(doc)`.
- Produces: two user-visible actions; no new exports.

- [ ] **Step 1: Add "Draft with AI" to the section editor**

In `docs-panel.ts`, locate the section editor render (the block around the `textarea` at ~line 509 inside the doc view; adapt to the file's exact local names — the editor has the section `s`, its textarea `ta`, and the doc `doc` in scope). Add a Draft button beside the existing section controls, visible only when the doc is editable (`doc.status !== "published" && doc.status !== "archived"`):

```typescript
      // AI draft — proposal only: fills the editor; nothing is saved until the normal Save.
      const draftBtn = document.createElement("button");
      draftBtn.textContent = "Draft with AI";
      draftBtn.style.cssText = "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.2rem .5rem;font:600 11px system-ui;cursor:pointer";
      draftBtn.onclick = async () => {
        draftBtn.disabled = true;
        const prev = draftBtn.textContent;
        draftBtn.textContent = "Drafting…";
        try {
          const r = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/draft`, { method: "POST", body: JSON.stringify({}) });
          ta.value = r.proposal;                        // model output → .value (XSS-safe)
          ta.dispatchEvent(new Event("input"));         // fire any dirty-tracking the editor has
          note(`AI draft (${r.provider}/${r.model}, grounded in ${r.grounding_used} fact(s)) — review before saving.`);
        } catch (e) {
          note(`Draft failed: ${(e as Error).message}`, true);
        } finally {
          draftBtn.disabled = false;
          draftBtn.textContent = prev;
        }
      };
```

`note(text, isErr?)` is whatever transient-message helper the panel already has — reuse it (docs-panel has one for ingest errors; if its name differs, use that name). Append `draftBtn` to the same control row as the section's existing buttons.

- [ ] **Step 2: Add "Check integrity" to the doc view**

In `showDocView`, beside the existing compliance action, add:

```typescript
      const integrityBtn = document.createElement("button");
      integrityBtn.textContent = "Check integrity";
      integrityBtn.style.cssText = "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.25rem .6rem;font:600 11px system-ui;cursor:pointer";
      const integrityOut = document.createElement("div");   // findings render here, transient
      integrityBtn.onclick = async () => {
        integrityBtn.disabled = true;
        integrityBtn.textContent = "Analysing…";
        integrityOut.replaceChildren();
        try {
          const r = await api(`/${encodeURIComponent(pid())}/${doc.id}/integrity`, { method: "POST", body: JSON.stringify({}) });
          renderIntegrity(integrityOut, r, doc);
        } catch (e) {
          const d = document.createElement("div");
          d.textContent = `Integrity analysis failed: ${(e as Error).message}`;
          d.style.cssText = "padding:.4rem .6rem;border-radius:.35rem;background:#3b1113;color:#fca5a5;margin:.4rem 0";
          integrityOut.append(d);
        } finally {
          integrityBtn.disabled = false;
          integrityBtn.textContent = "Check integrity";
        }
      };
```

Place `integrityBtn` in the doc-view header row and `integrityOut` directly below it.

- [ ] **Step 3: Add the findings renderer**

Add this module-level function to `docs-panel.ts` (types: define `IntegrityReport` inline):

```typescript
type IntegrityFinding = { section_id: string; fact: number; claim: string; reality: string; severity: "high" | "medium" | "low" };
type IntegrityReport = { findings: IntegrityFinding[]; dropped: number; grounding_used: number; generated_at: string; provider?: string; model?: string; note?: string };

const SEV_COLOR: Record<string, string> = { high: "#f87171", medium: "#eab308", low: "#9ca3af" };

function renderIntegrity(out: HTMLElement, r: IntegrityReport, doc: { sections: { id: string; heading: string }[] }) {
  out.replaceChildren();
  const banner = document.createElement("div");
  banner.textContent = `AI analysis — suggestions, not compliance facts. ${r.provider ? `${r.provider}/${r.model} · ` : ""}${new Date(r.generated_at).toLocaleString()} · grounded in ${r.grounding_used} fact(s)`;
  banner.style.cssText = "color:#93c5fd;background:#132038;border-radius:.35rem;padding:.35rem .6rem;font:10.5px system-ui;margin:.4rem 0";
  out.append(banner);

  if (r.note) {
    const n = document.createElement("div");
    n.textContent = r.note;                                // honest empty-document note
    n.style.cssText = "color:#9ca3af;padding:.3rem .6rem;font:11px system-ui";
    out.append(n);
    return;
  }
  if (r.dropped > 0) {
    const d = document.createElement("div");
    d.textContent = `${r.dropped} finding(s) discarded — the model cited no grounded fact for them.`;
    d.style.cssText = "color:#fbbf24;padding:.2rem .6rem;font:10.5px system-ui";
    out.append(d);
  }
  if (!r.findings.length) {
    const okEl = document.createElement("div");
    okEl.textContent = r.dropped > 0
      ? "0 usable findings (see discarded above) — this is NOT a clean bill of health."
      : "No contradictions found between this document and the project's configuration.";
    okEl.style.cssText = "color:#9ca3af;padding:.3rem .6rem;font:11px system-ui";
    out.append(okEl);
    return;
  }
  const headingOf = (id: string) => doc.sections.find((s) => s.id === id)?.heading || id;
  for (const f of r.findings) {
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;padding:.4rem .6rem;margin:.25rem 0";
    const head = document.createElement("div");
    const sev = document.createElement("span");
    sev.textContent = f.severity.toUpperCase();
    sev.style.cssText = `color:${SEV_COLOR[f.severity] || "#9ca3af"};font:700 10px system-ui;margin-right:.5rem`;
    const sec = document.createElement("span");
    sec.textContent = headingOf(f.section_id);
    sec.style.cssText = "color:#e5e7eb;font:600 11.5px system-ui";
    head.append(sev, sec);
    const claim = document.createElement("div");
    claim.textContent = `Document: ${f.claim}`;
    claim.style.cssText = "color:#cbd5e1;font:11px system-ui;margin-top:.2rem";
    const reality = document.createElement("div");
    reality.textContent = `Reality: ${f.reality}`;
    reality.style.cssText = "color:#93c5fd;font:11px system-ui";
    card.append(head, claim, reality);
    out.append(card);
  }
}
```

- [ ] **Step 4: Build and audit**

Run: `cd WebApp && npm run build && npx vitest run`
Expected: clean build, full suite passing.

XSS audit: list every DOM write added; confirm all model-derived strings (`proposal`, `claim`, `reality`, `note`, error messages) go through `.value`/`.textContent`. `severity` reaches `cssText` ONLY as a lookup into the hardcoded `SEV_COLOR` map with a hardcoded fallback — confirm no raw server string is interpolated. Report each site.

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts
git commit -m "feat(bimdocs-ai): Draft with AI + Check integrity UI (transient, propose-only)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Live verification

**Files:** none (verification only; report defects, don't fix).

- [ ] **Step 1: Suite + build**

Run: `cd WebApp && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 2: Restart the bridge; confirm Ollama**

Restart per Task 3 Step 3. Then `curl -s http://localhost:4100/ai/providers` — confirm `local` is available. If Ollama is down, start it or report NOT-RUN for the AI-dependent steps (do not fake results).

- [ ] **Step 3: Draft, live**

On `demo`, pick an editable doc (`GET /bimdocs/demo`; if none is `wip`, create one via `POST /bimdocs/demo {doc_type, title}`). Call the draft route on an empty section. Expected: a real `proposal` referencing only grounded specifics; `grounding_used > 0`. Paste the proposal.

- [ ] **Step 4: Integrity with a seeded contradiction**

Via `PATCH .../section/:id` set a section body to a claim that contradicts a grounded fact, e.g. "Container naming follows the XYZ-99 convention with 3 fields." (the active ruleset differs). Run integrity. Expected: at least one finding citing the naming fact — or, if the local model misses it, report exactly that (a small local model failing to find a contradiction is a model-quality observation, NOT a code defect; the gate working correctly on whatever it returns is what's being verified). Also verify: every returned finding's `fact` is within range and `section_id` is real (the gate held). Revert the seeded body after.

- [ ] **Step 5: Read-only proof**

Capture audit state (`listAudit('demo')` count/newest id) → one draft call + two integrity runs → capture again. Expected: identical. Paste both.

- [ ] **Step 6: Provider-down honesty**

Stop Ollama (or point `OLLAMA_URL` at a dead port for one request via env — simplest: stop the Ollama service, run one integrity call, start it again). Expected: 503 whose message names Ollama, shown as-is by the routes. If stopping Ollama is not possible in this environment, NOT-RUN with the reason.

- [ ] **Step 7: Report**

Write `.superpowers/sdd/task-5-report.md` (phase-5 numbering) with every check, command, real output, PASS/FAIL/NOT-RUN. Clean up any test docs/sections created; note anything left behind.

---

## Self-Review

**Spec coverage:** grounding/prompts/parsers/gate → Task 1 (gate exhaustively tested). Composition with error discipline, empty-doc honesty, 60k cap, published-doc rules (draft 409 / integrity allowed) → Task 2. Routes (POST, mirroring /ingest) → Task 3. UI: propose-into-editor via existing save, transient findings with the "not compliance facts" banner, dropped-count honesty, XSS audit → Task 4. Live checks incl. read-only proof and provider-down → Task 5. Provider/model passthrough exists in the API (spec's picker: the routes accept `{provider, model}`; the UI sends `{}` = local default — a picker can reuse the copilot pattern later without API change, which stays within the spec's "minimal provider select" latitude).
**Placeholders:** none; every code step is complete. Task 4 names anchor points by existing line references and instructs adapting to in-scope local names (the file is being modified in place, not rewritten).
**Type consistency:** `deps` seam names match Task 2's `wire()`; route responses match the UI's `IntegrityReport` type field-for-field; `SEVERITIES` (Task 1) ≡ `SEV_COLOR` keys (Task 4); `grounding_used` = `grounding.facts.length` everywhere.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-06-ai-drafting-integrity.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
