# EIR/BEP Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a client's EIR/BEP (PDF/Word), map its text onto the matching Sentinel document template with page-cited AI proposals, review it, and commit a populated document with the original file linked.

**Architecture:** Stateless propose-then-commit. `POST /bimdocs/:key/ingest` stores the uploaded blob, extracts text, chunks it page-marked, runs one AI call per chunk through the existing `ai-gateway`, and returns a **proposal** — nothing is written to the document tables. The browser renders the proposal for review (edit bodies, reassign or discard unassigned chunks), then `POST /bimdocs/:key/ingest/commit` performs a single insert of the fully-populated document. Abandoning a review leaves no draft rows behind.

**Tech Stack:** Node ESM bridge (zero-framework `http`), Supabase PostgREST via `cde-store.mjs`'s `sb()`, vitest, plain-DOM TypeScript panel, `unpdf` (PDF text) + `mammoth` (DOCX text), Ollama-first `ai-gateway`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-eir-ingestion-design.md` — this plan implements it exactly.
- **Phase-1 section shape is frozen:** `{id, heading, guidance, body, state, owner, bindings}`. `bindings` MUST remain `{}` — it is reserved for sub-project 3. Never write into it.
- **Privacy:** ingestion uses `ai-gateway.chat()` with its existing default `provider: "local"`. Never hardcode a cloud provider; never add a new API key path.
- **New dependencies (exactly two, bridge-side):** `unpdf@^1.8.0`, `mammoth@^1.12.0`. Both MUST be lazy-imported inside the branch that needs them (the `/ifc` route precedent) so the bridge boots without them.
- **Audit:** every document write goes through `audit()` from `cde-store.mjs`. Ingestion commits exactly ONE audit row per document (`action: "ingested"`).
- **Error idiom:** `const err = (status, message) => Object.assign(new Error(message), { status });` — already defined in `bimdocs-store.mjs`. Routes propagate via `e?.status || 500`.
- **Chunk budget:** 6000 characters (mirrors the proven `DocumentExtractor.cs:29`).
- **Low-confidence threshold:** 0.5 — at or below goes to `unassigned`.
- **Test command:** `npm test` from `WebApp/` (vitest). Build: `npm run build`.
- **Commits:** conventional-commit style, one per task, ending with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/ingest-logic.mjs` (new) | Pure: chunking, prompt building, proposal parsing/merging. No I/O. Fully unit-tested. |
| `WebApp/bridge/ingest-logic.test.mjs` (new) | Vitest suite for the above. |
| `WebApp/bridge/doc-text.mjs` (new) | Text extraction per file type (lazy-imports parsers). Thin, I/O-only. |
| `WebApp/bridge/doc-text.test.mjs` (new) | Vitest for the txt/md paths + unsupported-extension error. |
| `WebApp/bridge/ai-gateway.mjs` (modify) | Additive `format` passthrough on `chat()`. |
| `WebApp/bridge/bimdocs-store.mjs` (modify) | `createDocFromIngest()` + `getSourcePath()`. |
| `WebApp/bridge/bimdocs-ingest.mjs` (new) | Orchestration: blob storage → extract → chunk → AI loop → merged proposal. |
| `WebApp/bridge/bcf-service.mjs` (modify) | Two new routes + one source-download route inside the `/bimdocs` block. |
| `WebApp/db/migrations/0021_bim_documents_source.sql` (new) | `source jsonb` column. |
| `WebApp/src/setups/docs-panel.ts` (modify) | Ingest button, file input, review view, commit. |

Task order is dependency order: pure logic (1) → extraction (2) → gateway seam (3) → store+migration (4) → orchestrator (5) → routes (6) → UI (7) → live verification (8).

---

### Task 1: Pure ingestion logic

**Files:**
- Create: `WebApp/bridge/ingest-logic.mjs`
- Test: `WebApp/bridge/ingest-logic.test.mjs`

**Interfaces:**
- Consumes: nothing (pure module, first task).
- Produces:
  - `chunkPages(pages, budget = 6000) → [{text, pages}]` where `pages` is an array of page numbers.
  - `buildMappingPrompt(templateSections, chunk) → {system, user}`; `templateSections` is `[{heading, guidance}]`.
  - `parseProposal(raw, templateSections) → {assignments, malformed}`; assignment = `{section_heading, text, confidence, reason}`.
  - `mergeProposal(chunkResults, templateSections) → {sections, unassigned}` where `chunkResults` is `[{chunk, assignments, malformed}]`, `sections` is `[{heading, guidance, body, fragments}]`, `unassigned` is `[{text, pages, suggested_heading, confidence, reason}]`.
  - `LOW_CONFIDENCE = 0.5`

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/ingest-logic.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { chunkPages, buildMappingPrompt, parseProposal, mergeProposal, LOW_CONFIDENCE } from "./ingest-logic.mjs";

const SECTIONS = [
  { heading: "1. Context", guidance: "why" },
  { heading: "2. Requirements", guidance: "what" },
];

describe("chunkPages", () => {
  it("packs pages up to the budget and marks page numbers", () => {
    const pages = [{ page: 1, text: "a".repeat(50) }, { page: 2, text: "b".repeat(50) }];
    const [chunk] = chunkPages(pages, 500);
    expect(chunk.pages).toEqual([1, 2]);
    expect(chunk.text).toContain("[page 1]");
    expect(chunk.text).toContain("[page 2]");
  });

  it("splits when the budget is exceeded", () => {
    const pages = [{ page: 1, text: "a".repeat(400) }, { page: 2, text: "b".repeat(400) }];
    const chunks = chunkPages(pages, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].pages).toEqual([1]);
    expect(chunks[1].pages).toEqual([2]);
  });

  it("keeps a single oversized page as its own chunk", () => {
    const chunks = chunkPages([{ page: 1, text: "x".repeat(9000) }], 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toEqual([1]);
  });

  it("skips blank pages", () => {
    const chunks = chunkPages([{ page: 1, text: "   " }, { page: 2, text: "real" }], 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toEqual([2]);
  });
});

describe("buildMappingPrompt", () => {
  it("lists every heading and embeds the chunk text", () => {
    const { system, user } = buildMappingPrompt(SECTIONS, { text: "[page 1] hello", pages: [1] });
    expect(system).toContain("1. Context");
    expect(system).toContain("2. Requirements");
    expect(system).toContain("JSON");
    expect(user).toContain("[page 1] hello");
  });
});

describe("parseProposal", () => {
  it("parses clean JSON", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "1. Context", text: "t", confidence: 0.9, reason: "r" }] });
    const { assignments, malformed } = parseProposal(raw, SECTIONS);
    expect(assignments).toHaveLength(1);
    expect(malformed).toHaveLength(0);
  });

  it("parses JSON inside a fenced code block with prose around it", () => {
    const raw = 'Sure!\n```json\n{"assignments":[{"section_heading":"2. Requirements","text":"t","confidence":0.7}]}\n```\nHope that helps.';
    const { assignments } = parseProposal(raw, SECTIONS);
    expect(assignments[0].section_heading).toBe("2. Requirements");
  });

  it("routes unknown headings to malformed instead of inventing sections", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "99. Nope", text: "t", confidence: 0.9 }] });
    const { assignments, malformed } = parseProposal(raw, SECTIONS);
    expect(assignments).toHaveLength(0);
    expect(malformed).toHaveLength(1);
  });

  it("returns empty results for garbage", () => {
    const { assignments, malformed } = parseProposal("not json at all", SECTIONS);
    expect(assignments).toHaveLength(0);
    expect(malformed).toHaveLength(0);
  });

  it("defaults a missing confidence to 0", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "1. Context", text: "t" }] });
    const { assignments } = parseProposal(raw, SECTIONS);
    expect(assignments[0].confidence).toBe(0);
  });
});

describe("mergeProposal", () => {
  const chunk1 = { text: "c1", pages: [1] };
  const chunk2 = { text: "c2", pages: [2] };

  it("groups by section and preserves document order", () => {
    const { sections } = mergeProposal([
      { chunk: chunk1, assignments: [{ section_heading: "1. Context", text: "first", confidence: 0.9 }], malformed: [] },
      { chunk: chunk2, assignments: [{ section_heading: "1. Context", text: "second", confidence: 0.8 }], malformed: [] },
    ], SECTIONS);
    const ctx = sections.find((s) => s.heading === "1. Context");
    expect(ctx.body).toBe("first\n\nsecond");
    expect(ctx.fragments).toHaveLength(2);
    expect(ctx.fragments[0].pages).toEqual([1]);
  });

  it("sends low-confidence assignments to unassigned", () => {
    const { sections, unassigned } = mergeProposal([
      { chunk: chunk1, assignments: [{ section_heading: "1. Context", text: "weak", confidence: LOW_CONFIDENCE }], malformed: [] },
    ], SECTIONS);
    expect(sections.find((s) => s.heading === "1. Context").body).toBe("");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].suggested_heading).toBe("1. Context");
    expect(unassigned[0].pages).toEqual([1]);
  });

  it("sends an unparsed chunk to unassigned with the chunk text", () => {
    const { unassigned } = mergeProposal([{ chunk: chunk1, assignments: [], malformed: [], unparsed: true }], SECTIONS);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].reason).toBe("unparsed");
    expect(unassigned[0].text).toBe("c1");
  });

  it("returns every template section even when nothing mapped", () => {
    const { sections } = mergeProposal([], SECTIONS);
    expect(sections.map((s) => s.heading)).toEqual(["1. Context", "2. Requirements"]);
    expect(sections.every((s) => s.body === "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd WebApp && npx vitest run bridge/ingest-logic.test.mjs`
Expected: FAIL — `Failed to load .../ingest-logic.mjs` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `WebApp/bridge/ingest-logic.mjs`:

```javascript
// EIR/BEP ingestion — pure logic. Chunking, prompt construction, proposal parsing and merging.
// No I/O and no network so vitest covers all of it; bimdocs-ingest.mjs composes these with the
// file store and the AI gateway. Mirrors the proven Revit-side extractor shape (page-marked
// chunks -> schema-shaped LLM output -> confidence + page provenance -> human review).

/** Assignments at or below this confidence are parked for human assignment, never auto-placed. */
export const LOW_CONFIDENCE = 0.5;

/**
 * Pack extracted pages into chunks under a character budget, injecting [page N] markers so the
 * model can cite pages. A single page larger than the budget becomes its own chunk (never split
 * mid-page: a half sentence maps worse than a long one). Blank pages are dropped.
 */
export function chunkPages(pages, budget = 6000) {
  const chunks = [];
  let text = "";
  let nums = [];
  const flush = () => {
    if (text.trim()) chunks.push({ text: text.trim(), pages: nums });
    text = "";
    nums = [];
  };
  for (const p of pages) {
    const marked = `[page ${p.page}]\n${(p.text || "").trim()}`;
    if (!(p.text || "").trim()) continue;
    if (text && text.length + marked.length > budget) flush();
    text += (text ? "\n\n" : "") + marked;
    nums.push(p.page);
  }
  flush();
  return chunks;
}

/** The mapping ask: which template section does each passage of this chunk belong to? */
export function buildMappingPrompt(templateSections, chunk) {
  const headings = templateSections.map((s) => `- "${s.heading}" — ${s.guidance || ""}`).join("\n");
  const system = [
    "You map passages of a client BIM requirements document onto a fixed set of document sections.",
    "",
    "Sections:",
    headings,
    "",
    'Reply with JSON ONLY, shaped: {"assignments":[{"section_heading":"<one of the headings above, copied exactly>","text":"<the passage, verbatim from the input>","confidence":<0..1>,"reason":"<short>"}]}',
    "",
    "Rules: copy text verbatim — never summarise, never invent. Keep the [page N] markers in the text.",
    "Use only the headings listed above. Omit any passage that fits no section rather than forcing it.",
    "If nothing in the input fits any section, reply {\"assignments\":[]}.",
  ].join("\n");
  return { system, user: chunk.text };
}

/**
 * Defensive JSON extraction: models wrap JSON in prose or fences even when told not to. Assignments
 * naming a heading outside the template land in `malformed` rather than inventing a section.
 */
export function parseProposal(raw, templateSections) {
  const known = new Set(templateSections.map((s) => s.heading));
  const obj = extractJson(raw);
  const list = Array.isArray(obj?.assignments) ? obj.assignments : [];
  const assignments = [];
  const malformed = [];
  for (const a of list) {
    const item = {
      section_heading: String(a?.section_heading || ""),
      text: String(a?.text || ""),
      confidence: Number.isFinite(Number(a?.confidence)) ? Number(a.confidence) : 0,
      reason: String(a?.reason || ""),
    };
    if (!item.text.trim()) continue;
    (known.has(item.section_heading) ? assignments : malformed).push(item);
  }
  return { assignments, malformed };
}

function extractJson(raw) {
  const text = String(raw || "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c); } catch { /* try the next candidate */ }
  }
  return null;
}

/**
 * Fold every chunk's assignments into one proposal: a body per template section (fragments joined
 * in document order, each keeping its pages + confidence) plus `unassigned` — low-confidence,
 * unknown-heading and unparsed text, each carrying the AI's best guess for the review dropdown.
 */
export function mergeProposal(chunkResults, templateSections) {
  const sections = templateSections.map((s) => ({
    heading: s.heading,
    guidance: s.guidance || "",
    body: "",
    fragments: [],
  }));
  const byHeading = new Map(sections.map((s) => [s.heading, s]));
  const unassigned = [];

  for (const r of chunkResults) {
    const pages = r.chunk?.pages || [];
    if (r.unparsed) {
      unassigned.push({ text: r.chunk?.text || "", pages, suggested_heading: null, confidence: 0, reason: "unparsed" });
      continue;
    }
    for (const a of r.assignments || []) {
      if (a.confidence > LOW_CONFIDENCE) byHeading.get(a.section_heading).fragments.push({ text: a.text, pages, confidence: a.confidence });
      else unassigned.push({ text: a.text, pages, suggested_heading: a.section_heading, confidence: a.confidence, reason: a.reason || "low confidence" });
    }
    for (const m of r.malformed || []) {
      unassigned.push({ text: m.text, pages, suggested_heading: null, confidence: m.confidence, reason: `unknown section '${m.section_heading}'` });
    }
  }

  for (const s of sections) s.body = s.fragments.map((f) => f.text).join("\n\n");
  return { sections, unassigned };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/ingest-logic.test.mjs`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/ingest-logic.mjs WebApp/bridge/ingest-logic.test.mjs
git commit -m "feat(bimdocs): pure ingestion logic — page-marked chunking, prompt, proposal merge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Document text extraction

**Files:**
- Create: `WebApp/bridge/doc-text.mjs`
- Test: `WebApp/bridge/doc-text.test.mjs`
- Modify: `WebApp/package.json` (add two dependencies)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `async extractText(buffer, filename) → {pages: [{page, text}], kind}` where `kind` is `"pdf" | "docx" | "text"`. Throws `{status: 400}` for unsupported types and for zero extractable text.

- [ ] **Step 1: Install the two parsers**

Run: `cd WebApp && npm install unpdf@^1.8.0 mammoth@^1.12.0`
Expected: both added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing tests**

Create `WebApp/bridge/doc-text.test.mjs`:

```javascript
import { describe, it, expect } from "vitest";
import { extractText } from "./doc-text.mjs";

const buf = (s) => Buffer.from(s, "utf8");

describe("extractText", () => {
  it("reads a .txt file as a single page", async () => {
    const out = await extractText(buf("hello world"), "eir.txt");
    expect(out.kind).toBe("text");
    expect(out.pages).toEqual([{ page: 1, text: "hello world" }]);
  });

  it("reads a .md file the same way", async () => {
    const out = await extractText(buf("# Heading\n\nbody"), "eir.md");
    expect(out.kind).toBe("text");
    expect(out.pages[0].text).toContain("# Heading");
  });

  it("rejects an unsupported extension with 400", async () => {
    await expect(extractText(buf("x"), "eir.xlsx")).rejects.toMatchObject({ status: 400 });
  });

  it("tells .doc users to save as .docx", async () => {
    await expect(extractText(buf("x"), "old.doc")).rejects.toMatchObject({ status: 400, message: expect.stringContaining(".docx") });
  });

  it("rejects a file with no extractable text with 400 naming OCR", async () => {
    await expect(extractText(buf("   "), "blank.txt")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("OCR") });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd WebApp && npx vitest run bridge/doc-text.test.mjs`
Expected: FAIL — cannot load `./doc-text.mjs`.

- [ ] **Step 4: Write the implementation**

Create `WebApp/bridge/doc-text.mjs`:

```javascript
// Text extraction for ingested documents. The ONLY place that touches a parser library, so the
// rest of ingestion stays pure and testable. Parsers are lazy-imported inside their branch (the
// /ifc route's idiom) so the bridge boots even if they are missing.

const err = (status, message) => Object.assign(new Error(message), { status });

/**
 * Extract text from an uploaded document.
 * @returns {Promise<{pages: {page: number, text: string}[], kind: "pdf"|"docx"|"text"}>}
 */
export async function extractText(buffer, filename) {
  const ext = String(filename || "").toLowerCase().split(".").pop();
  let out;

  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfText(doc, { mergePages: false });
    const arr = Array.isArray(text) ? text : [String(text || "")];
    out = { kind: "pdf", pages: arr.map((t, i) => ({ page: i + 1, text: String(t || "") })) };
  } else if (ext === "docx") {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    // Word has no page concept in its XML — the whole document is one logical page.
    out = { kind: "docx", pages: [{ page: 1, text: String(value || "") }] };
  } else if (ext === "doc") {
    throw err(400, "Legacy .doc files aren't supported — open it in Word and save as .docx, then upload again.");
  } else if (ext === "txt" || ext === "md") {
    out = { kind: "text", pages: [{ page: 1, text: Buffer.from(buffer).toString("utf8") }] };
  } else {
    throw err(400, `Unsupported file type '.${ext}' — upload a .pdf, .docx, .txt or .md file.`);
  }

  if (!out.pages.some((p) => (p.text || "").trim())) {
    throw err(400, "No text could be extracted — this looks like a scanned document. OCR it first, then upload the searchable version.");
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd WebApp && npx vitest run bridge/doc-text.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/doc-text.mjs WebApp/bridge/doc-text.test.mjs WebApp/package.json WebApp/package-lock.json
git commit -m "feat(bimdocs): document text extraction (pdf/docx/txt) with lazy-imported parsers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: JSON-format passthrough on the AI gateway

**Files:**
- Modify: `WebApp/bridge/ai-gateway.mjs` (the `chat` export and the three provider functions)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `chat({provider, model, system, messages, tools, format})` — `format: "json"` asks the provider for a JSON-only reply. Default `undefined` = today's behaviour exactly.

- [ ] **Step 1: Add the parameter and thread it through**

In `WebApp/bridge/ai-gateway.mjs`, change the `chat` signature and its three call sites:

```javascript
export async function chat({ provider = "local", model, system, messages = [], tools = [], format } = {}) {
  const blocked = blockedReason(provider);
  if (blocked) throw Object.assign(new Error(blocked), { status: 400 });

  const p = PROVIDERS[provider];
  const chosen = model || p.models[0];
  const out =
    provider === "local"  ? await viaOllama(chosen, system, messages, tools, format)
  : provider === "claude" ? await viaClaude(chosen, system, messages, tools, format)
                          : await viaOpenAiCompatible(provider, chosen, system, messages, tools, format);
  return { ...out, provider, model: chosen };
}
```

- [ ] **Step 2: Honour it in each provider**

`viaOllama` — add the parameter and pass Ollama's native field:

```javascript
async function viaOllama(model, system, messages, tools, format) {
```

and inside its `body: JSON.stringify({ ... })`, add after `stream: false,`:

```javascript
      ...(format === "json" ? { format: "json" } : {}),
```

`viaOpenAiCompatible` — add the parameter to its signature and include OpenAI's field in the request body:

```javascript
      ...(format === "json" ? { response_format: { type: "json_object" } } : {}),
```

`viaClaude` — Anthropic has no response-format flag, so append the instruction to the system prompt. Add `format` to its signature and replace its `...(system ? { system } : {})` spread with:

```javascript
    ...(systemWithFormat(system, format) ? { system: systemWithFormat(system, format) } : {}),
```

and add this helper next to the other small helpers at the bottom of the file:

```javascript
/** Anthropic has no response_format flag — the instruction rides in the system prompt instead. */
const systemWithFormat = (system, format) =>
  format === "json" ? `${system || ""}\n\nReply with raw JSON only. No prose, no code fences.`.trim() : system;
```

- [ ] **Step 3: Verify no existing caller broke**

Run: `cd WebApp && npx vitest run`
Expected: PASS — every pre-existing suite still green (the parameter is optional and defaults to today's behaviour).

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/ai-gateway.mjs
git commit -m "feat(ai): optional format:json passthrough on chat() for schema-shaped replies

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Source column + bulk document creation

**Files:**
- Create: `WebApp/db/migrations/0021_bim_documents_source.sql`
- Modify: `WebApp/bridge/bimdocs-store.mjs` (append two exports)

**Interfaces:**
- Consumes: `sb`, `ensureProject`, `audit` from `cde-store.mjs`; `err`, `one`, `enc` already defined at the top of `bimdocs-store.mjs`.
- Produces:
  - `async createDocFromIngest(key, {doc_type, title, sections, source, actor}) → row` — `sections` is `[{heading, guidance, body}]`; the function assigns ids and the frozen phase-1 shape.
  - `async getSourceRef(key, docId) → {file_id, name, kind, pages, ingested_at} | null`

- [ ] **Step 1: Write the migration**

Create `WebApp/db/migrations/0021_bim_documents_source.sql`:

```sql
-- 0021: link an ingested document to the original client file it was extracted from.
-- Nullable jsonb, 1:1 with the document and never queried independently, so a column beats a table:
--   {file_id, name, kind, pages, ingested_at}
-- Hand-authored documents leave it null. sections[].bindings stays reserved for sub-project 3.
alter table bim_documents
  add column if not exists source jsonb;
```

- [ ] **Step 2: Apply it to the live database**

Apply the SQL above to the Supabase project (`autqqtwhxqrfjaztablm`) using the Supabase MCP `apply_migration` tool with name `bim_documents_source`.
Expected: `{"success": true}`.

- [ ] **Step 3: Add the store functions**

Append to `WebApp/bridge/bimdocs-store.mjs`:

```javascript
/**
 * Create a document with sections already populated — the ingestion commit. Phase 1's createDoc only
 * instantiates an EMPTY template, and a create-then-N×patchSection loop would spray N audit rows and
 * N stale-write round-trips for what is a single user action. One insert, one audit row.
 * `sections` is [{heading, guidance, body}]; ids and the frozen section shape are assigned here.
 */
export async function createDocFromIngest(key, { doc_type, title, sections, source, actor } = {}) {
  const proj = await ensureProject(key);
  if (!doc_type) throw err(400, "doc_type is required");
  if (!Array.isArray(sections) || !sections.length) throw err(400, "sections are required");
  const body = {
    project_id: proj.id,
    doc_type,
    title: title || `Ingested ${doc_type}`,
    status: "wip",
    created_by: actor || "web",
    source: source || null,
    sections: sections.map((s) => ({
      id: randomUUID(),
      heading: s.heading,
      guidance: s.guidance || "",
      body: s.body || "",
      state: "wip",
      owner: null,
      bindings: {}, // reserved for sub-project 3 — never populated by ingestion
    })),
  };
  const row = one(await sb("bim_documents", { method: "POST", body, prefer: "return=representation" }));
  await audit(proj.id, "bim_document", row.id, "ingested", actor || "web", null, {
    doc_type: row.doc_type,
    title: row.title,
    source_file: source?.name || null,
    sections_populated: body.sections.filter((s) => s.body.trim()).length,
    sections_total: body.sections.length,
  });
  return row;
}

/** The original uploaded file's descriptor for a document, or null when hand-authored. */
export async function getSourceRef(key, docId) {
  const doc = await getDoc(key, docId);
  return doc.source || null;
}
```

Add `randomUUID` to the existing `node:crypto` import at the top of the file:

```javascript
import { createHash, randomUUID } from "node:crypto";
```

- [ ] **Step 4: Verify the module still loads and existing tests pass**

Run: `cd WebApp && node --check bridge/bimdocs-store.mjs && npx vitest run`
Expected: no syntax errors; all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add WebApp/db/migrations/0021_bim_documents_source.sql WebApp/bridge/bimdocs-store.mjs
git commit -m "feat(bimdocs): source column (0021) + createDocFromIngest single-insert commit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ingestion orchestrator

**Files:**
- Create: `WebApp/bridge/bimdocs-ingest.mjs`

**Interfaces:**
- Consumes: `extractText` (Task 2), `chunkPages`/`buildMappingPrompt`/`parseProposal`/`mergeProposal` (Task 1), `chat` with `format` (Task 3), `loadTemplates` from `bimdocs-logic.mjs`.
- Produces:
  - `async ingestDocument(buffer, {filename, doc_type}) → {proposal: {sections, unassigned}, source: {file_id, name, kind, pages, ingested_at}, doc_type, title}`
  - `sourceDir() → string` (absolute path of the blob store)
  - `sourceFilePath(file_id) → string` (traversal-safe absolute path, or throws `{status:404}`)

- [ ] **Step 1: Write the implementation**

Create `WebApp/bridge/bimdocs-ingest.mjs`:

```javascript
// EIR/BEP ingestion orchestration: store the original -> extract text -> chunk -> map each chunk
// with the AI gateway -> one merged proposal. Writes NOTHING to the document tables; the browser
// reviews the proposal and commits it separately (bimdocs-store.createDocFromIngest).
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, sep, basename, extname } from "node:path";
import { homedir } from "node:os";
import { extractText } from "./doc-text.mjs";
import { chunkPages, buildMappingPrompt, parseProposal, mergeProposal } from "./ingest-logic.mjs";
import { loadTemplates } from "./bimdocs-logic.mjs";
import { chat } from "./ai-gateway.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });

/** Where original ingested files live. Plaintext on purpose: /cde/files holds client-side
 *  ciphertext the bridge cannot read, and ingestion must read the bytes. */
export function sourceDir() {
  const dir = process.env.SENTINEL_BIMDOCS
    || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Sentinel", "bimdocs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Traversal-safe path for a stored original. */
export function sourceFilePath(file_id) {
  const name = basename(String(file_id || ""));
  if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i.test(name)) throw err(404, "source not found");
  const path = join(sourceDir(), name);
  if (!resolve(path).startsWith(resolve(sourceDir()) + sep) || !existsSync(path)) throw err(404, "source not found");
  return path;
}

/**
 * Full propose pass. Sequential AI calls: a local 7B model on a laptop is the constraint, and a
 * parallel fan-out would just thrash it. One bad chunk never fails the run — it lands in
 * `unassigned` with reason "unparsed".
 */
export async function ingestDocument(buffer, { filename, doc_type } = {}) {
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);

  const { pages, kind } = await extractText(buffer, filename);

  // Store the original BEFORE the AI work: a 503 from an unreachable model must not cost the upload.
  const file_id = `${randomUUID()}${extname(String(filename || "")).toLowerCase()}`;
  writeFileSync(join(sourceDir(), file_id), Buffer.from(buffer));
  const source = { file_id, name: basename(String(filename || "document")), kind, pages: pages.length, ingested_at: new Date().toISOString() };

  const chunks = chunkPages(pages);
  const results = [];
  for (const chunk of chunks) {
    const { system, user } = buildMappingPrompt(tpl.sections, chunk);
    try {
      const { text } = await chat({ system, messages: [{ role: "user", content: user }], format: "json" });
      results.push({ chunk, ...parseProposal(text, tpl.sections) });
    } catch (e) {
      if (e?.status === 503 || e?.status === 400) throw e; // model unreachable / provider blocked: real failure
      results.push({ chunk, assignments: [], malformed: [], unparsed: true });
    }
  }

  return {
    proposal: mergeProposal(results, tpl.sections),
    source,
    doc_type,
    title: source.name.replace(/\.[^.]+$/, ""),
  };
}
```

- [ ] **Step 2: Verify the module loads**

Run: `cd WebApp && node --check bridge/bimdocs-ingest.mjs && node -e "import('./bridge/bimdocs-ingest.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: `ingestDocument,sourceDir,sourceFilePath`

- [ ] **Step 3: Commit**

```bash
git add WebApp/bridge/bimdocs-ingest.mjs
git commit -m "feat(bimdocs): ingestion orchestrator — store original, extract, chunk, AI map, merge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Routes

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs` (inside the existing `/bimdocs` block, lines ~987-1007)

**Interfaces:**
- Consumes: `ingestDocument`, `sourceFilePath` (Task 5); `createDocFromIngest`, `getSourceRef` (Task 4); `readRaw`, `send`, `MAX_UPLOAD`, `corsHeaders` (already in `bcf-service.mjs`).
- Produces three routes:
  - `POST /bimdocs/:key/ingest?name=<file>&doc_type=EIR` — raw bytes → `{proposal, source, doc_type, title}`
  - `POST /bimdocs/:key/ingest/commit` — JSON `{doc_type, title, sections, source}` → 201 `{id, ...}`
  - `GET /bimdocs/:key/:docId/source` — the original file bytes

- [ ] **Step 1: Add the routes**

In `WebApp/bridge/bcf-service.mjs`, inside the `if (url.pathname.startsWith("/bimdocs"))` block, insert these BEFORE the existing `if (p1 === "templates" ...)` line (the ingest upload must not go through `readBody`, which the block runs for POST):

```javascript
      // Ingest: raw document bytes -> AI mapping proposal. Writes nothing; /ingest/commit does.
      if (p2 === "ingest" && !p3 && req.method === "POST") {
        const len = Number(req.headers["content-length"] || 0);
        if (len > MAX_UPLOAD) return send(res, 413, { message: `File too large (${(len / 1048576).toFixed(1)} MB, max ${(MAX_UPLOAD / 1048576) | 0} MB)` });
        const raw = await readRaw(req);
        if (!raw.length) return send(res, 400, { message: "empty upload" });
        const ingest = await import("./bimdocs-ingest.mjs");
        const name = url.searchParams.get("name") || "document.pdf";
        const docType = url.searchParams.get("doc_type") || "EIR";
        return send(res, 200, await ingest.ingestDocument(raw, { filename: name, doc_type: docType }));
      }
      if (p2 === "ingest" && p3 === "commit" && req.method === "POST") {
        const b = await readBody(req);
        return send(res, 201, await bimdocs.createDocFromIngest(p1, { ...b, actor: b.actor || "web" }));
      }
      if (p3 === "source" && req.method === "GET") {
        const ref = await bimdocs.getSourceRef(p1, p2);
        if (!ref) return send(res, 404, { message: "this document has no original file" });
        const ingest = await import("./bimdocs-ingest.mjs");
        const { readFileSync } = await import("node:fs");
        const buf = readFileSync(ingest.sourceFilePath(ref.file_id));
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(ref.name)}"`,
          "Cache-Control": "no-cache",
          ...corsHeaders(res),
        });
        return res.end(buf);
      }
```

Then change the `body`/`actor` lines at the top of the block so the raw upload is not consumed as JSON:

```javascript
      const isRawUpload = p2 === "ingest" && !p3;
      const body = !isRawUpload && ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
      const actor = body.actor || "web";
```

- [ ] **Step 2: Verify syntax and route wiring**

Run: `cd WebApp && node --check bridge/bcf-service.mjs`
Expected: no output (valid).

- [ ] **Step 3: Restart the bridge and smoke the routes**

Run:
```bash
powershell -Command "Stop-ScheduledTask -TaskName SentinelBridge; Start-Sleep 2; Start-ScheduledTask -TaskName SentinelBridge; Start-Sleep 5"
cd WebApp && TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r') && printf 'Section 4 requires ISO 19650 naming.' > /tmp/eir.txt && curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" --data-binary @/tmp/eir.txt "http://localhost:4100/bimdocs/demo/ingest?name=eir.txt&doc_type=EIR" | head -c 400
```
Expected: JSON containing `"proposal"`, `"sections"`, and a `"source"` object with a `file_id`. (If the local model isn't running: a 503 whose message names Ollama — that is the correct, actionable failure, and Task 8 covers it.)

- [ ] **Step 4: Commit**

```bash
git add WebApp/bridge/bcf-service.mjs
git commit -m "feat(bimdocs): ingest, ingest/commit and source routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Documents panel — upload and review

**Files:**
- Modify: `WebApp/src/setups/docs-panel.ts` (bar in `showList`, plus a new `showIngestReview` view)

**Interfaces:**
- Consumes: the three routes from Task 6.
- Produces: no exports — UI only. `docsPanel()`'s signature is unchanged.

- [ ] **Step 1: Add the ingest button and file input to the list view**

In `showList()`, after `newBtn.onclick = showCreate;`, add:

```typescript
    const ingestBtn = btn("⇪ Ingest EIR/BEP");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.docx,.txt,.md";
    fileInput.style.display = "none";
    ingestBtn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      fileInput.value = "";
      if (f) await runIngest(f);
    };
    bar.append(title, ingestBtn, newBtn, fileInput);
```

and REPLACE the existing `bar.append(title, newBtn);` line (it is superseded by the line above).

- [ ] **Step 2: Add the ingest + review implementation**

Add these functions to `docsPanel()`, before `showList`:

```typescript
  type Fragment = { text: string; pages: number[]; confidence: number };
  type ProposedSection = { heading: string; guidance: string; body: string; fragments: Fragment[] };
  type Unassigned = { text: string; pages: number[]; suggested_heading: string | null; confidence: number; reason: string };
  type Proposal = { proposal: { sections: ProposedSection[]; unassigned: Unassigned[] }; source: Record<string, unknown>; doc_type: string; title: string };

  const pageRef = (pages: number[]) => (pages?.length ? `p.${pages.join(", ")}` : "");

  async function runIngest(file: File) {
    body.replaceChildren();
    const busy = document.createElement("div");
    busy.textContent = `Reading ${file.name} and mapping it to the template… (a local model can take a minute)`;
    busy.style.cssText = "color:#93c5fd;padding:1rem";
    body.append(busy);
    try {
      const docType = /bep/i.test(file.name) ? "BEP" : "EIR";
      const r = await bfetch(
        `${base}/bimdocs/${encodeURIComponent(pid())}/ingest?name=${encodeURIComponent(file.name)}&doc_type=${docType}`,
        { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await file.arrayBuffer() },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
      showIngestReview(j as Proposal);
    } catch (e) {
      body.replaceChildren();
      msg(`Ingestion failed: ${(e as Error).message}`, true);
      await showList();
    }
  }

  function showIngestReview(p: Proposal) {
    const sections = p.proposal.sections.map((s) => ({ ...s }));
    const unassigned = p.proposal.unassigned.map((u) => ({ ...u, target: u.suggested_heading || "" }));

    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Review ingestion — ${p.title}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    cancel.onclick = showList;
    const accept = btn("✓ Create document", true);
    bar.append(title, cancel, accept);

    body.replaceChildren();
    const intro = document.createElement("div");
    const mapped = sections.filter((s) => s.body.trim()).length;
    intro.innerHTML = `<div style="color:#9ca3af;padding:.2rem 0 .6rem">${mapped}/${sections.length} sections mapped · ${unassigned.length} passage(s) need a home. Edit anything before creating the document — nothing is saved yet.</div>`;
    body.append(intro);

    sections.forEach((s, i) => {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.5rem;background:#1b1b21";
      const cites = s.fragments.map((f) => pageRef(f.pages)).filter(Boolean).join(" · ");
      card.innerHTML =
        `<div style="padding:.45rem .6rem;border-bottom:1px solid #2a2a30;display:flex;gap:.5rem;align-items:center">` +
        `<span style="font:600 12px system-ui;color:#eee;flex:1">${esc(s.heading)}</span>` +
        (cites ? `<span style="color:#6b7280;font:10px ui-monospace,Consolas,monospace">${esc(cites)}</span>` : `<span style="color:#71717a;font-size:10px">empty</span>`) +
        `</div>`;
      const ta = document.createElement("textarea");
      ta.value = s.body;
      ta.style.cssText = "width:100%;min-height:5rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:0;border-radius:0 0 .4rem .4rem;padding:.5rem .6rem;font:12px ui-monospace,Consolas,monospace;resize:vertical";
      ta.oninput = () => { sections[i].body = ta.value; };
      card.append(ta);
      body.append(card);
    });

    if (unassigned.length) {
      const head = document.createElement("div");
      head.innerHTML = `<div style="font:600 12px system-ui;color:#eab308;margin:.8rem 0 .4rem">Unassigned passages — pick a section or leave as Discard</div>`;
      body.append(head);
      unassigned.forEach((u, i) => {
        const row = document.createElement("div");
        row.style.cssText = "border:1px solid #3f3f46;border-radius:.4rem;margin-bottom:.4rem;background:#141418;padding:.5rem .6rem";
        row.innerHTML =
          `<div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem">` +
          `<span style="color:#6b7280;font:10px ui-monospace,Consolas,monospace;flex:1">${esc(pageRef(u.pages))} · ${esc(u.reason)}</span></div>` +
          `<div style="color:#cbd5e1;font:12px ui-monospace,Consolas,monospace;white-space:pre-wrap;max-height:7rem;overflow:auto">${esc(u.text)}</div>`;
        const sel = document.createElement("select");
        sel.style.cssText = "margin-top:.4rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui;width:100%";
        sel.innerHTML = `<option value="">Discard</option>` + sections.map((s) => `<option value="${esc(s.heading)}"${s.heading === u.target ? " selected" : ""}>${esc(s.heading)}</option>`).join("");
        sel.onchange = () => { unassigned[i].target = sel.value; };
        row.append(sel);
        body.append(row);
      });
    }

    accept.onclick = async () => {
      accept.disabled = true;
      accept.textContent = "Creating…";
      // Fold each assigned passage into the end of its chosen section, in review order.
      for (const u of unassigned) {
        if (!u.target) continue;
        const s = sections.find((x) => x.heading === u.target);
        if (s) s.body = s.body ? `${s.body}\n\n${u.text}` : u.text;
      }
      try {
        const created = await api(`/${encodeURIComponent(pid())}/ingest/commit`, {
          method: "POST",
          body: JSON.stringify({
            doc_type: p.doc_type,
            title: p.title,
            source: p.source,
            sections: sections.map((s) => ({ heading: s.heading, guidance: s.guidance, body: s.body })),
            actor: await actor(),
          }),
        });
        await showEditor(created.id);
      } catch (e) {
        accept.disabled = false;
        accept.textContent = "✓ Create document";
        msg(`Couldn't create the document: ${(e as Error).message}`, true);
      }
    };
  }
```

- [ ] **Step 3: Build**

Run: `cd WebApp && npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add WebApp/src/setups/docs-panel.ts
git commit -m "feat(bimdocs): Documents panel ingest button + review-before-save screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Live verification

**Files:** none (verification only; fixes land in whichever file the failure names).

**Interfaces:** exercises everything from Tasks 1-7 end to end.

- [ ] **Step 1: Full test suite and build**

Run: `cd WebApp && npx vitest run && npm run build`
Expected: all suites PASS (including phase 1's 169), build clean.

- [ ] **Step 2: Restart the bridge**

Run: `powershell -Command "Stop-ScheduledTask -TaskName SentinelBridge; Start-Sleep 2; Start-ScheduledTask -TaskName SentinelBridge; Start-Sleep 5; (Get-NetTCPConnection -LocalPort 4100 -State Listen).OwningProcess"`
Expected: a PID printed (bridge listening).

- [ ] **Step 3: Confirm the local model is reachable**

Run: `curl -s http://localhost:11434/api/tags | head -c 200`
Expected: JSON listing pulled models. If this fails, start Ollama before continuing — Step 5's 503 check covers the opposite case deliberately.

- [ ] **Step 4: Happy path against a real document**

In the running web app (platform tab, project `demo`): **Documents → ⇪ Ingest EIR/BEP** → pick a real EIR PDF. Confirm:
- the review screen lists all 7 EIR sections, several with body text and `p.N` citations,
- unassigned passages (if any) each offer the section dropdown,
- **✓ Create document** opens the editor on a populated document.

Then verify the record:
```bash
cd WebApp && node -e "import('./bridge/bimdocs-store.mjs').then(async m => { const d = (await m.listDocs('demo'))[0]; console.log(d.id, d.doc_type, d.status); const full = await m.getDoc('demo', d.id); console.log('source:', JSON.stringify(full.source)); console.log('populated:', full.sections.filter(s => s.body.trim()).length + '/' + full.sections.length); console.log('bindings clean:', full.sections.every(s => Object.keys(s.bindings).length === 0)); })"
```
Expected: the new document, a non-null `source`, a populated-section count > 0, and `bindings clean: true`.

- [ ] **Step 5: Negative paths**

```bash
cd WebApp && TOKEN=$(grep -E '^BCF_TOKEN=' ../config/.env | cut -d= -f2 | tr -d '\r')
# .doc rejected with the save-as-.docx message
printf 'x' > /tmp/old.doc && curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" --data-binary @/tmp/old.doc "http://localhost:4100/bimdocs/demo/ingest?name=old.doc&doc_type=EIR"
# empty text rejected naming OCR
printf '   ' > /tmp/blank.txt && curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" --data-binary @/tmp/blank.txt "http://localhost:4100/bimdocs/demo/ingest?name=blank.txt&doc_type=EIR"
```
Expected: first → 400 mentioning `.docx`; second → 400 mentioning `OCR`.

Then stop Ollama and repeat the happy-path upload once.
Expected: 503 whose message names Ollama/the model — and the original file still stored (a retry must not re-upload).

- [ ] **Step 6: Source download**

```bash
cd WebApp && node -e "import('./bridge/bimdocs-store.mjs').then(async m => { const d = (await m.listDocs('demo'))[0]; console.log((await m.getSourceRef('demo', d.id))?.name); })"
```
Then in the browser, confirm `GET /bimdocs/demo/<docId>/source` downloads the original file.
Expected: the original filename, and a byte-identical download.

- [ ] **Step 7: Commit any fixes**

If Steps 1-6 surfaced defects, fix them and commit:
```bash
git add -A && git commit -m "fix(bimdocs): <what the live check surfaced>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
If everything passed first time, there is nothing to commit — say so explicitly rather than inventing a commit.

---

## Self-Review

**Spec coverage:** original kept+linked → Tasks 4 (column), 5 (blob write), 6 (download route). AI on the Copilot backend → Task 5 uses `chat()` defaults; Task 3 adds only the format seam. Review-before-save → Tasks 6 (propose/commit split) + 7 (review screen). Unassigned shown with dropdown → Tasks 1 (`mergeProposal.unassigned`) + 7 (`<select>`). Page provenance → Task 1 chunking + Task 7 `p.N` chips. `doc-text` / `ingest-logic` / `bimdocs-ingest` / routes / migration / panel — all present. Every spec error case appears in Task 8 Step 5 or the Task 2 tests.

**Placeholders:** none — every code step contains complete code, every command has expected output.

**Type consistency:** `{text, pages}` chunk shape is produced by `chunkPages` and consumed by `buildMappingPrompt`/`mergeProposal` identically; assignment fields (`section_heading`, `text`, `confidence`, `reason`) match across `parseProposal` → `mergeProposal` → the panel's `Unassigned` type; `source` (`{file_id, name, kind, pages, ingested_at}`) is written in Task 5, stored in Task 4, and read in Task 6; `createDocFromIngest` takes `sections: [{heading, guidance, body}]`, exactly what Task 7 posts.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-06-eir-ingestion.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
