# EIR/BEP ingestion — design

**Roadmap sub-project 2 of 6.** Depends on sub-project 1 (BIM Documents module, merged `8ca0b94`).
Feeds sub-project 3 (enforcement wiring), which fills the `sections[].bindings` field this design
leaves untouched.

## Context

A client issues an EIR as a PDF or Word document. Today a BIM manager reads it and retypes its
requirements into Sentinel's structured EIR document by hand — slow, and the retyping silently
drops requirements. Phase 1 gave us the structured document (template-instantiated `bim_documents`
rows with per-section state, ownership and append-only published versions); this phase gets a real
client document *into* that structure without hand-transcription, while keeping the original
retrievable as evidence.

The outcome: upload an EIR → see a mapping proposal (which passage lands in which template section,
with page citations and confidence) → accept/correct it → a populated, editable EIR document exists,
linked to the original file.

**Not in scope:** enforcement/`bindings` (sub-project 3), MIDP/TIDP tracking (4), AI drafting of
missing sections (5), MCP document tools (6). Ingestion proposes mappings of text that is already
in the client's document; it never writes content the document doesn't contain.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Original file | Kept and linked to the structured document | Golden-thread posture — the structured copy is the working artifact, the client's original stays retrievable to check what extraction missed |
| AI backend | The Copilot's existing `ai-gateway` (`local` default; cloud only where already opted in via `SENTINEL_AI_CLOUD=1`) | Local-first privacy for confidential client documents, zero new configuration |
| Review | Review-before-save (Ghost Builder pattern) | Nothing AI-derived reaches the document or the audit trail unreviewed |
| Low-confidence text | Shown in the review list with a section dropdown | Never silently dropped, never blindly dumped |

## Architecture

Stateless propose-then-commit. Two calls, no server-side draft state between them:

```
Documents panel                    bridge                          Supabase
  │ upload EIR.pdf ──────────────▶ POST /bimdocs/:key/ingest
  │                                  ├ readRaw + size cap
  │                                  ├ extract text (unpdf | mammoth)
  │                                  ├ page-marked chunking
  │                                  ├ ai-gateway.chat(JSON-constrained)
  │ ◀──── proposal JSON ────────────┘  (nothing written)
  │ review: accept / edit / reassign
  │ commit ─────────────────────▶ POST /bimdocs/:key/ingest/commit ──▶ 1 insert
  │                                  └ store original blob + link          + audit
```

The proposal exists only in the browser between the two calls. An abandoned review leaves nothing
behind — no draft documents, no orphan rows.

### Components

**`WebApp/bridge/doc-text.mjs`** (new, pure-ish) — `extractText(buffer, filename) → {pages: [{page, text}], kind}`.
`.pdf` via `unpdf`, `.docx` via `mammoth` (raw text), `.txt`/`.md` read directly. Both parsers are
lazy-imported inside the branch (the `/ifc` route's precedent) so the bridge boots without them.
Unsupported extension → `err(400, …)`. `.doc` (pre-2007 binary) is explicitly unsupported with a
message telling the user to save as `.docx`.

**`WebApp/bridge/ingest-logic.mjs`** (new, pure, unit-tested) — no I/O, no network:
- `chunkPages(pages, budget = 6000) → [{text, pages: [n…]}]` — accumulates pages up to a character
  budget, injecting `[page N]` markers, mirroring `DocumentExtractor.cs:206-220` (a proven shape:
  the LLM can cite pages, so every proposal carries provenance).
- `buildMappingPrompt(templateSections, chunk) → {system, user}` — asks for one JSON object per
  chunk: `{assignments: [{section_heading, text, confidence, reason}]}`.
- `parseProposal(raw, templateSections) → {assignments, malformed}` — defensive JSON extraction
  (fenced-block tolerant), drops assignments naming unknown headings into `malformed` rather than
  inventing sections.
- `mergeProposal(chunkResults, templateSections) → proposal` — groups assignments by section,
  concatenates in document order, preserves `pages` + `confidence` per fragment; anything unassigned
  or below `LOW_CONFIDENCE = 0.5` is collected into `proposal.unassigned[]` (each with its text,
  pages and the AI's best guess, if any).

**`WebApp/bridge/bimdocs-store.mjs`** (extend) — `createDocFromIngest(key, {doc_type, title, sections, source, actor})`:
one insert of a fully-populated document (phase 1's `createDoc` only instantiates empty templates,
and a create-then-N×patchSection loop would spray N audit rows and N stale-write round-trips for a
single user action). Sections keep the phase-1 shape exactly, `bindings: {}` untouched. Audits once
as `bim_document/ingested` with `{source_file, sections_populated, unassigned_count}`.

**Routes** (`bcf-service.mjs`, inside the existing `/bimdocs` block):
- `POST /bimdocs/:key/ingest?name=<file>&doc_type=EIR` — raw bytes, `Content-Type: application/octet-stream`,
  content-length 413 pre-check against `MAX_UPLOAD`, `readRaw`, empty → 400. Returns the proposal
  **and** the stored `source` descriptor (the blob is written at upload time so the commit call
  doesn't re-upload the file).
- `POST /bimdocs/:key/ingest/commit` — JSON `{doc_type, title, sections, source}` → the new store
  function → 201 `{id}`.
- AI unavailable (no local model, cloud not opted in) → 503 with the actionable message, following
  the `/ifc` route's `getConfig()` idiom.

**Original-file storage** — plaintext bytes under `%AppData%/Sentinel/bimdocs/<uuid>.<ext>`, served
back by `GET /bimdocs/:key/:docId/source` (regex-constrained id, `basename()` traversal guard, both
copied from `GET /cde/files/:id`). Deliberately *not* the existing `/cde/files` route: that stores
client-side AES-GCM ciphertext the bridge cannot read, and ingestion must read the bytes.

**Migration `0021_bim_documents_source.sql`** — `alter table bim_documents add column if not exists
source jsonb` holding `{file_id, name, kind, pages, ingested_at}`. A nullable jsonb column, not a
new table: it is 1:1 with the document and never queried independently. `bindings` stays reserved
for sub-project 3 — this design does not squat on it.

**`ai-gateway.chat()`** (extend) — optional `format` passthrough: Ollama takes `format: "json"`
natively, the OpenAI-compatible providers take `response_format: {type: "json_object"}`, Anthropic
gets the instruction in the system prompt. Additive and default-off, so every existing caller is
unaffected. This is what makes schema-shaped decoding reliable rather than hopeful, and sub-project 5
needs the same seam.

**`WebApp/src/setups/docs-panel.ts`** (extend) — an `Ingest EIR/BEP` button beside `+ New document`,
a hidden file input (`.pdf,.docx,.txt,.md`), and a review view: per template section, the proposed
body (editable textarea) with its page citations and a confidence chip; then the unassigned list,
each row with text, pages and a section dropdown (including "discard"). Accept → commit → the editor
opens on the new document. The panel already handles `bfetch` auth and 409s; this follows its idioms.

## Data flow

1. User picks a file → `POST …/ingest` with raw bytes.
2. Bridge stores the blob, extracts text, chunks it, and runs one AI call per chunk (sequential —
   a local 7B model on a laptop is the constraint, not the bridge).
3. Each response is parsed defensively and merged into one proposal keyed by template section.
4. Panel renders the proposal for review; user edits, reassigns, or discards.
5. Accept → `POST …/ingest/commit` → one insert, one audit row, document opens in the editor.

## Error handling

- Unsupported/corrupt file → 400 with the specific reason (`.doc` → "save as .docx").
- Zero extractable text (scanned PDF with no text layer) → 400 naming OCR as the missing capability,
  rather than a confusing empty proposal.
- AI unreachable/not configured → 503, actionable message; the blob is still stored so a retry
  doesn't re-upload.
- Malformed AI JSON for a chunk → that chunk's text goes to `unassigned` with `reason: "unparsed"`;
  one bad chunk never fails the whole ingestion.
- Oversized file → 413 before reading the body.
- Commit against a `published`/`archived` document is impossible by construction — commit always
  creates a new document.

## Testing

Unit (vitest, alongside the existing `bimdocs-logic.test.mjs`):
- `chunkPages` — budget boundaries, page-marker placement, single oversized page.
- `parseProposal` — clean JSON, fenced JSON, trailing prose, unknown heading → `malformed`, garbage → empty.
- `mergeProposal` — section grouping and document order, confidence threshold routing to `unassigned`,
  multi-chunk sections concatenating in order.
- `doc-text` — `.txt`/`.md` paths and the unsupported-extension error (PDF/DOCX parsing is the
  library's contract, exercised in the live check below rather than mocked).

Live end-to-end (the phase-1 pattern): upload a real EIR PDF against the running bridge, confirm the
proposal cites plausible pages, commit, and verify the document opens populated with the original
retrievable via the `source` link and exactly one `ingested` audit row.

## Verification

1. `npm test` (vitest) green including the new suites; `npm run build` clean.
2. Live: bridge restarted, `POST /bimdocs/demo/ingest` with a real EIR PDF → proposal JSON with
   per-section page citations; commit → document visible in the Documents tab, populated, editable,
   `source` downloadable, one audit row.
3. Negative paths checked live: a `.doc` file (400), a scanned image-only PDF (400 naming OCR), and
   ingestion with the local model stopped (503).
