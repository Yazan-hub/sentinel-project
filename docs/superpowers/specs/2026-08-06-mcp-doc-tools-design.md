# MCP doc tools — design

**Roadmap sub-project 6 of 6 (final).** Depends on phases 1-5 (all merged). Extends the existing
`WebApp/bridge/mcp-server.mjs` — no bridge changes.

## Context

The MCP server exposes three tools (list projects, IDS propose, audit trail). An external agent can
adjudicate elements but cannot see the document-governance layer phases 1-5 built: BEP/EIR documents,
their compliance against registered checks, the MIDP deliverables status, or the AI integrity
analysis. Phase 6 closes that: six read-only tools, each a thin passthrough to an existing bridge
route.

## Decision

**Read-only.** An agent can inspect and reason about governance but never mutate it. Writes would
bypass the web UI's review-before-save posture; "LLM proposes, code disposes" applies to MCP callers
too. Every tool maps to a route that phases 3-5 already proved writes nothing.

One tool per surface (not consolidated mode-switch tools): MCP clients render per-tool descriptions,
and six well-named tools describe themselves to agents better than one tool with a `mode` argument.

## Tools

| Tool | Bridge route | Args | Notes |
|---|---|---|---|
| `sentinel_list_documents` | `GET /bimdocs/:project` | `project` | id, title, doc_type, status per doc |
| `sentinel_get_document` | `GET /bimdocs/:project/:docId` | `project`, `document`, `section?` | full doc; with `section` (id or exact heading) returns only that section |
| `sentinel_compliance_report` | `GET /bimdocs/:project/:docId/compliance` | `project`, `document` | deterministic check results per bound section |
| `sentinel_deliverables_status` | `GET /deliverables/:project/status` | `project` | derived plan-vs-actual (delivered/late/in_wip/overdue/pending/unscheduled) |
| `sentinel_list_checks` | `GET /bimdocs/checks` | — | registered + planned checks, so an agent knows what is checkable vs honestly not |
| `sentinel_doc_integrity` | `POST /bimdocs/:project/:docId/integrity` | `project`, `document`, `provider?`, `model?` | read-only in effect; description warns it runs an AI analysis that may take minutes on a local model and requires the AI provider to be up |

Descriptions carry the governance framing (mirroring the existing tools' style): compliance results
are deterministic facts; integrity findings are AI suggestions gated to cited facts, never
compliance facts — the description states that distinction so an agent does not conflate the two.

## Architecture

`mcp-server.mjs` gains six `TOOLS` entries and six `callTool` branches in the file's existing idiom
(`fetch` + `authHeaders`, `bridge <status>: <text>` errors). For testability, `TOOLS` and `callTool`
become exports and the readline wiring is guarded by `import.meta.url` main-module detection —
behavior when run as a server is unchanged, but a test can import `callTool` and inject a fake
`fetch` (module-level `deps` default, same seam pattern as `bimdocs-ai.mjs`).

`sentinel_get_document`'s `section` filter runs in the MCP server (find by id, else exact heading
match) — the bridge route returns the whole doc; the filter just keeps a big BEP from flooding an
agent's context when it wants one section.

## Error handling

- Missing required arg → thrown `"<arg> is required"` (existing pattern), surfaced as `isError` text.
- Bridge non-OK → `"bridge <status>: <body>"` — 404 unknown project/doc, 503 AI provider down, 502
  model failure all pass through with their real messages.
- `section` matching nothing → error listing the available section ids/headings (agent-recoverable).
- Large lists: `sentinel_audit`-style truncation is not needed — docs and reports are bounded; the
  deliverables status returns whole (a plan is human-scale).

## Testing

Unit (new `mcp-server.test.mjs`): `TOOLS` schema sanity (six new names present, required fields
listed); `callTool` per tool with injected fake fetch — correct URL/method/headers/body, arg
validation errors, bridge-error mapping, the `section` filter (by id, by heading, no-match error
listing sections). No test spawns a process or touches the network.

Live: scripted stdin JSON-RPC session against the running bridge — `tools/list` shows 9 tools;
`sentinel_list_documents` + `sentinel_get_document` (with and without `section`) on `demo`;
`sentinel_compliance_report`; `sentinel_deliverables_status`; `sentinel_list_checks` shows
`midp.milestones` under checks; `sentinel_doc_integrity` returns gated findings (Ollama up) —
plus read-only proof: audit count unchanged across the session.

## Verification

1. `npx vitest run` clean (baseline 355 + new).
2. Live session above with real output pasted.
3. Existing three tools still work (regression: `initialize`, `tools/list`, one `sentinel_audit` call).
