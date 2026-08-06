# AI drafting + integrity analysis — design

**Roadmap sub-project 5 of 6.** Depends on 1 (BIM Documents, `8ca0b94`), 2 (ingestion, `5f4cefb`),
3 (enforcement, `0a20a84`) and 4 (MIDP tracker, `6dbfbb4`). Uses the existing AI gateway
(`ai-gateway.mjs`) and the ingest module's error discipline.

## Context

A BEP author staring at an empty "Volume strategy" section gets no help today, and nothing reads a
finished document against what the project actually enforces. Phase 5 adds both — with the LLM kept
in the same box every prior phase kept it in: **the model proposes prose; deterministic code decides
what is true and what gets saved.**

Two capabilities:

1. **Per-section drafting** — a "Draft with AI" action on a section writes a proposed body grounded
   in real project data. Nothing is saved: the proposal lands in the existing section editor and the
   user saves (or discards) through the existing `patchSection` path.
2. **Integrity analysis** — on demand, the AI reads the whole document against the project's
   configured reality and reports where the TEXT disagrees with the FACTS: the BEP promises a check
   that doesn't exist, names a naming convention that differs from the active ruleset, lists
   deliverables absent from the MIDP. Findings are **transient** — rendered, never stored — and
   labelled as AI suggestions, never compliance facts.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Drafting scope | Per-section, not whole-document | Reviewable unit; matches the section editing flow; local-7B-friendly |
| Integrity scope | Doc vs project reality | The differentiator — Sentinel owns both the document and the enforcement config; internal-consistency-only is commodity |
| Findings storage | Transient, never stored | Same posture as the compliance report: derived on demand, cannot go stale, no dismiss machinery; AI output never masquerades as a compliance record |
| Where the AI runs | Bridge module via `chat()` from `ai-gateway.mjs` | Keys and provider config live in the bridge; frontend copilot engine stays deterministic |
| Grounding | Assembled deterministically in code, handed to the prompt | The model never queries anything itself; what it saw is exactly what the code gave it — testable and auditable |

### The anti-hallucination gate (load-bearing)

The integrity prompt contains a numbered list of grounded facts. Every finding the model returns must
carry a `fact` index referencing one of them. **A finding citing no fact, an unknown index, or a
section_id not in the document is dropped in code before the response leaves the bridge** — with a
`dropped` count reported honestly in the response so the UI can say "N findings discarded (uncited)".
The model cannot introduce a "fact" of its own into the report. This is the same honesty rule as
phases 3-4 (never claim what wasn't measured), applied to generative output.

## Architecture

```
grounding pack (deterministic, code-built)
  project meta · active naming ruleset · deliverables summary (phase 4)
  registered checks + section bindings · latest compliance results · sibling headings
        │
        ├─► draftSection(key, docId, sectionId)  ─► { proposal (text), grounding_used }
        │        └─ chat({format:"json"})             UI drops into editor → user saves via patchSection
        │
        └─► integrityReport(key, docId)          ─► { findings[], dropped, generated_at, provider }
                 └─ chat({format:"json"}) per doc     UI renders transient report, stores nothing
```

### Components

**`WebApp/bridge/bimdocs-ai-logic.mjs`** (new, pure, unit-tested — no I/O, no AI)

- `buildGrounding(project, ruleset, checks, deliverableSummary, doc)` → the numbered fact list plus
  a compact context block. Deterministic; unit tests pin exactly what the model is shown.
- `buildDraftPrompt(grounding, doc, section)` → `{system, user}`. Instructs: write ONLY this
  section's body, in the document's language, using only supplied facts; return
  `{"body": "..."}` JSON; no invented project specifics (names, dates, tools not in the grounding).
- `buildIntegrityPrompt(grounding, doc)` → `{system, user}`. Instructs: compare each section's text
  against the numbered facts; return `{"findings":[{section_id, fact, claim, reality, severity}]}`
  where `fact` is the index of the contradicted fact; report nothing that no fact contradicts.
- `parseDraft(text)` → `{body}` or `{unparsed:true}` — tolerant of markdown fences, same posture as
  ingest's `parseProposal`.
- `parseFindings(text, doc, factCount)` → `{findings, dropped}` — the gate: validates section_ids
  against the doc, `fact` indices against range, severity against `["high","medium","low"]`
  (defaulting unknown to `"low"`), truncates strings, drops everything uncited.

**`WebApp/bridge/bimdocs-ai.mjs`** (new, thin I/O composition)

- `draftSection(key, docId, sectionId, {provider, model})` — loads doc via `getDoc`, rejects
  `published`/`archived` docs (409 — same rule as `patchSection`; drafting into an immutable doc is
  pointless) and unknown sections (404); assembles grounding from `mergeMeta`,
  `projectNamingRuleset`, `listChecks`, `deliverableStatus` (summary only), `complianceReport`
  (bound sections only, reusing its cap); calls `chat({provider, model, system, messages, format:"json"})`;
  returns `{proposal, grounding_used, provider, model}`. **Writes nothing, audits nothing.**
- `integrityReport(key, docId, {provider, model})` — same grounding + full section texts in ONE
  call (a BEP is a few thousand words; chunking like ingest only if over a cap —
  `MAX_INTEGRITY_CHARS`, default 60k, 413 above it); returns
  `{findings, dropped, generated_at, provider, model}`. **Writes nothing.**
- Error discipline copied from `bimdocs-ingest.mjs`: gateway 503 (provider down) and 400 propagate
  as-is; recognized model-failure statuses surface as `{unparsed:true}` → 502 "model returned
  unusable output", never fabricated content.

**Routes** (`bcf-service.mjs`, inside the existing `/bimdocs` block):
- `POST /bimdocs/:key/docs/:docId/sections/:sectionId/draft` — body `{provider?, model?}`.
- `POST /bimdocs/:key/docs/:docId/integrity` — body `{provider?, model?}`. POST (not GET) because
  it triggers paid/slow AI work, mirroring `/ingest`.

**UI** (`docs-panel.ts`):
- Section editor gains **Draft with AI** (visible when doc is editable): calls the route with the
  panel's provider/model selection (reuse the copilot panel's `/ai/providers` picker pattern or a
  minimal provider select), shows a spinner, drops the returned body into the editor textarea marked
  "AI draft — review before saving". Saving is the EXISTING save button → `patchSection`. Discard =
  don't save.
- Document view gains **Check integrity**: renders findings grouped by section — severity chip,
  the claim (quoted from the doc), the reality (the grounded fact) — under a banner
  "AI analysis — suggestions, not compliance facts", plus "N uncited findings discarded" when
  `dropped > 0` and provider/model + timestamp. All server-derived strings via `.textContent`
  (XSS discipline). Nothing persisted; leaving the view discards it.

## Data flow

1. Draft: click → route → grounding assembled → one `chat()` call → proposal into editor → user
   edits/saves via `patchSection` (audit happens there, as a normal section edit).
2. Integrity: click → route → grounding + doc text → one `chat()` call → `parseFindings` gate →
   transient render.
3. Nothing in either flow writes to the DB or audit log; the only write path remains the existing
   human save.

## Error handling

- Provider down → 503 with the gateway's "Is Ollama running?" message, shown in the panel.
- Cloud provider not enabled → the gateway's existing `blockedReason` surfaces as its error.
- Model returns unparseable JSON → 502 "model returned unusable output — try again or switch model";
  never a silent empty result.
- Every finding dropped by the gate → the report renders honestly: "0 findings (N discarded as
  uncited)" — distinct from "0 findings, document consistent".
- Published/archived doc: draft → 409; integrity → allowed (reading an immutable doc is fine).
- Unknown project/doc/section → 404 via existing paths.
- Empty document (no section bodies) → integrity returns `{findings:[], note:"document has no
  content to analyse"}` without calling the AI — an honest not-checkable, not a vacuous pass.

## Testing

Unit (the logic module is where the meaning lives):
- `buildGrounding`: numbered facts stable and deterministic for a fixed input; deliverables summary
  included; no fact invented when a source is absent (missing ruleset → no naming fact, NOT a
  placeholder fact).
- `buildDraftPrompt` / `buildIntegrityPrompt`: contain the instruction lines the gate depends on;
  include the section/doc text; JSON shape stated.
- `parseDraft`: clean JSON, fenced JSON, garbage → `{unparsed:true}`.
- `parseFindings` (the gate, exhaustively): valid finding kept; missing/unknown `fact` dropped and
  counted; unknown `section_id` dropped; out-of-range index dropped; unknown severity → "low";
  non-array → `{unparsed:true}`; strings truncated.
- Store composition: published doc → 409 on draft; empty doc → no AI call (mock `chat` throws if
  invoked, assert it is not).

Live: draft a real section on `demo` with Ollama (proposal returned, nothing written — audit count
unchanged); integrity on a doc seeded with a deliberate contradiction (e.g. body claims a naming
convention differing from the active ruleset) → finding cites the right fact; read-only proof
(audit count identical across runs); provider-down path returns 503 when Ollama is stopped.

## Verification

1. `npx vitest run` and `npm run build` clean.
2. Live checks above, with real output pasted.
3. Read-only proof: audit row count/newest id unchanged across a draft call and two integrity runs.
4. XSS audit of the new UI surfaces (findings text is model output — hostile by definition).
