# AI privacy controls (evaluation §4A1) — design

Date: 2026-10-20. Source: `docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md` §4A1 (points 2, 3 and 5).
Builds on slice A (the MCP answer is fenced as data, invisible characters stripped, local paths cut, bulk geometry withheld).

## The honest position

With a cloud model, zero leakage cannot be promised. What Sentinel can promise: send less (redaction), let an office lead
lock AI to this network (local-only), and show that the bridge and the add-in phone home to nobody (no-telemetry proof).

## 1. The switch: an `ai_policy` standard (no migration)

- A new artefact kind `ai_policy`, body exactly `{local_only: boolean, redact: boolean}`. It is installed like every
  standard: versioned `ai_policy@n`, sha'd, lead or owner only (`putArtefact` → `requireMinRole(key, "lead")`), and on
  the ledger. The `artefact_installed ai_policy@n` row carries the body, so the ledger says what was switched, by whom.
- It lives on an office (the office row) and/or on a project. **The effective policy ORs the two**: a project can add a
  switch, never take back the office's. A project's own `ai_policy@n` with `local_only: false` does not unlock an
  office lock.
- Screen: Project settings ▸ Standards in force ▸ ai_policy ▸ Edit… ("AI privacy"), two ticks. Opened on the office's
  row, it installs on the office. No JSON.
- `GET /ai/policy?project=k1,k2[&terms=1]` → `{policies: {k: {key, local_only, redact, set_by, refs, words, token,
  terms?}}}`. A member reads it (the caller's session decides membership); `terms` (the redaction list) only when asked.
  A requested key that is a project token (`PROJECT_XXXXX`) is resolved among the caller's projects.

## 2. Enforcement of "AI stays on this network: no cloud AI"

| Where | What happens with the lock on |
|---|---|
| `ai-gateway.mjs` `chat()` — the one seam for /ai/chat, Docs ▸ Draft and Docs ▸ Integrity | A cloud provider call must name its project; a locked project is a 403 in words, before anything is sent. Local (Ollama) still works. |
| `GET /ai/providers?project=k` | Cloud rows read unavailable with the lock's words (the web pickers show them). |
| MCP server (`toolResult`) | A tool about a locked project answers with the lock's words and no data: an MCP client such as Claude Desktop is a cloud model by definition. `sentinel_list_projects` leaves locked projects out and says how many. `sentinel_ask_app` is refused while any of the caller's projects is locked (its answer can name any project). A policy that is not read refuses (fail closed). |
| Revit add-in | Ghost Builder and Photo Massing with a model off this PC are refused for a locked project ("Allow a model off this PC" does not override the office); this PC's own model still works. PC Settings shows the open model's project's policy. |

## 3. Redaction ("names masked in AI answers")

- Terms Sentinel holds for a project: the project's name and key (`PROJECT_`), its owner and appointing party
  (`CLIENT_`), its address and location (`ADDRESS_`), and the members of the project and its office: e-mail and name
  (`PERSON_`). Any other e-mail address is replaced by `[e-mail]`.
- Tokens are `KIND_` + 8 base32 characters of HMAC-SHA256(bridge secret, kind + normalised text): the same name gets the
  same token in every answer, session and restart, and a token cannot be guessed back from a transcript.
- MCP: arguments are mapped back (a model may pass `PROJECT_7Q2MXK4D` as the project), the answer is masked after `guard`,
  errors too. AI gateway: a cloud prompt (system + messages) is masked; the reply is unmasked for the person reading it.
  Local AI is not masked: nothing leaves.
- Matching: case-insensitive, whole words, longest first. Terms under 3 characters are not masked.

## 4. No-telemetry proof

- Static (CI): every `http(s)://host` literal in the bridge (`WebApp/bridge/*.mjs`) and the add-in (`SentinelAddin/**/*.cs`)
  must be on an allow-list that names why (contacted: Supabase by config, That Open, the AI providers, this PC; named only:
  XML namespaces, links; web evidence sources a lead asks for, from `web-sources.mjs`). A new host fails the test.
  No telemetry SDK (Sentry, Application Insights, PostHog, …) in `package-lock.json` or any `.csproj`.
- Runtime (CI): a copy of the bridge is spawned with a preload that records every outgoing TCP connection and refuses
  any address it was not configured with. Supabase, That Open and Ollama point at local stubs; boot plus the AI and CDE
  routes are exercised; the test fails on any other connection.
- Write-up: `docs/security/no-telemetry.md`.

## Limits (said, not hidden)

- Only names Sentinel holds are masked. A name typed in free text that Sentinel has no record of goes through.
- The lock governs Sentinel's own AI paths. It cannot stop a person copying project data into another tool.
- A Claude Desktop session is cloud. For a locked project the supported AI path is the local gateway.
- The add-in's egress is proven statically (no Revit in CI); the bridge's both statically and at runtime.
- Revit: a model bound to no project (a blank file, a family) has no AI policy to read, so this PC's "Allow a model off this
  PC" alone decides — someone who imports a locked project's drawing into an unbound file can still send it off this PC. That
  is the "copying data elsewhere" limit; bound models of a locked project are refused. The check waits on the bridge on
  Revit's thread (6 s at most, plus a sign-in refresh), and refuses when the bridge does not answer.
- A person's name comes from their own account. Only a name of two words or more is masked (a one-word name could rewrite
  every answer of the office); their e-mail always is.
- The redaction list is cached for 60 s in the bridge: a member added, or a project renamed, is masked from the next minute.

## Review fixes (high-effort review, 2026-10-20)

- **H1** An MCP `project` that is not text (a list, an object) skipped the policy: every project tool now refuses it first.
- **H2** A project lead could leave the office (detach, or move to another office they lead) and so drop its lock. Leaving
  an office now needs a lead of that office, a platform admin or the machine credential: in the bridge (`updateProject`)
  and in the database (migration `0046_office_leave_guard.sql`, PGlite dry-run in `bridge/migration-0046.test.mjs`, live
  probe `probes/0046_probe.sql`). **Until 0046 is applied, a lead can still detach straight through the database API.**
- **M1** `GET /ai/policy?terms=1` (every name and e-mail of the project and its office) answers the machine credential only.
- **M2** The e-mail pattern is bounded (a megabyte of letters scanned in milliseconds, not minutes); terms over 200
  characters are dropped.
- **M4** One-word names are not terms; the token kind words are never terms; two keys that mask alike stay two keys; a
  JSON reply gets its names back JSON-escaped.
- **L1–L6** Unicode forms, soft hyphens, zero-width characters and typographic dashes and apostrophes are folded before
  matching; `system` is masked whatever its shape; the office's name and key, the project number and list-shaped owners
  are terms; tokens are 8 characters (40 bits); one project read per policy request and 8 GoTrue reads at a time;
  `sentinel_ask_app` refuses when the project list is not a list.
