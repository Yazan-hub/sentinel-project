# Ledger grafts — design (cohesion phase 4c)

Status: approved 2026-09-25 (founder: "go", after the 4c map and the decisions below were presented). Source:
`docs/reviews/cohesion-review-2026-09-23.md` §5 ("Grafts … From the Ledger Spine") and §6 (phase 4 row: "Graft:
`Event()` on every tool (heal included), filtered audit read, public receipt verify"); findings F16 (heal names no
ledger row) and F35 (receipt verify needs a bearer). The code map is the 2026-09-25 4c mapping run (three readers and
a critic that re-read the load-bearing lines; live read-only SQL on the ledger). The review's line numbers are stale;
the ones below are current on master (62d9633).

## Facts this design rests on

- One table, `audit_log` (0001:75-88): `id` bigint identity, `project_id`, `entity_type`, `entity_id`, `action`,
  `actor`, `old_value`, `new_value`, `at`, `prev_hash`, `hash`. The hash chain is **global**, not per project: the
  BEFORE INSERT trigger takes the tip of the whole table under one advisory lock (0006_audit_chain_lock.sql:11-27);
  `hash = sha256(prev ‖ entity_type ‖ entity_id ‖ action ‖ actor ‖ old_value ‖ new_value ‖ at)` — `id` and
  `project_id` are not covered. Live: 787 rows, 0 recompute mismatches, 0 broken links. Nothing in the code recomputes
  the chain. The review's "hash-chained per-project ledger" is corrected here.
- `POST /cde/:key/audit` returns the inserted row with `id` and `hash` (`recordAudit`, return=representation,
  cde-store.mjs:599-617); `/propose` returns `audit_id` and a `receipt` (:913-921). Every other writer goes through
  `audit()` with return=minimal (:591-596) and returns nothing.
- The add-in's `GovernedNotify.Post` (GovernedNotify.cs:276-298) discards every response (:295): the IFC gate says
  "Sent … (not confirmed)", Naming Manager says nothing though its tooltip promises "Everything is audited"
  (App.cs:255), Governed Publish parses `AuditId`/`ReceiptHash` and never prints them, promises a "✓ verdict badge"
  even when `RegisterVersionId` returned null, and discards its stamp call's result (Commands.GovernedPublish.cs:144-168).
  Heal writes no ledger row at all (F16).
- `GET /cde/:key/audit` returns the newest 200 rows, unfiltered, no total (cde-store.mjs:586-589). On `demo` (286
  rows) the only governed verdict is the 243rd newest, so `ids.last_verdict` (check-registry.mjs:135-160, via :483)
  reports "No governed verdict has been recorded on this project yet" — false — and that feeds the readiness report.
- The receipt routes (bcf-service.mjs:1281-1306) sit behind the bearer gate (:523-536) and the CSRF origin gate
  (:510-514). `verifyReceipt` returns the full rebuilt receipt and value-bearing reasons (agent-provenance.mjs:82-96);
  the route resolves the project through `ensureProject`, which answers unknown keys differently and self-creates
  `default` (cde-store.mjs:88-98). Audit ids are sequential.

## Goal

Every ledger write a Revit tool makes is confirmed or honestly not confirmed in that tool's own words — "ledger #id ·
receipt <16 hex>…", "not confirmed — …", "not recorded — …"; the audit read has filters and a true total, so no check
answers from a 200-row window; anyone can check a receipt against the ledger without a token, learning a yes/no and
field names — never ledger values.

Definition of done: *the IFC gate on Demo Tower with the bridge up ends "Recorded: ledger #<id> · receipt <16 hex>…"
and with the bridge stopped "Not recorded — the bridge did not answer"; heal on a bound model prints its ledger line
and `GET /cde/<key>/audit?entity_type=family_heal` returns the row; `ids.last_verdict` on `demo` finds the verdict row;
`curl` without a bearer to `POST /receipt/aster-office/verify` with receipt 702's id and hash answers `matches: true`,
with the verdict flipped `matches: false, mismatched: ["verdict"]`, and with an unknown id the same bytes as with an
unknown key.*

## Decisions

1. **One result, one formatter.** `GovernedNotify.Event(path, payload, key, timeout)` returns
   `LedgerResult {State: Recorded | NotConfirmed | NotRecorded | NotBound, Id, Hash, Reason}`; `LedgerLine.For(result)`
   is the only text:
   - 201/200 with an integer `id` and a 64-hex `hash` → `ledger #<id> · receipt <hash[0..16]>…` (Recorded);
   - 2xx without both → `not confirmed — the bridge returned no chain hash`;
   - 400/401/403/404/503 (answered before any write) → `not recorded — HTTP <n>: <message>`; connection refused or
     DNS failure → `not recorded — the bridge did not answer`;
   - timeout, 5xx (a 500 may follow the insert; the bridge masks it, bcf-service.mjs:246-248) → `not confirmed — <reason>
     (the entry may have landed)`;
   - empty key → nothing sent, the existing NotBound text.
   The pure parts (status → state, the line) compile into a Revit-free `tools/event-check`. `Event()` never touches UI:
   no `LogDoctor`, no `Dispatcher.Invoke` inside it (a worker calling back into the waiting thread would deadlock); the
   caller logs on its own thread. Fix-in-place's two spellings ("audit <id>", Commands.BcfIssues.cs:223, :290-294) use
   the same formatter.
2. **Waiting, per call site.** Modal tools wait with the documented pattern `Task.Run(() => Event(...))
   .GetAwaiter().GetResult()` and the 6 s client: the IFC gate (both paths — command body and the export's
   ExternalEvent job), Governed Publish's gate row, heal. Naming Manager continues on the worker and sets its window
   status. `AutoPublish.ModelPublished` (save/sync) and `OfficeScan` (sync handler) never block: a continuation logs
   the line to the Doctor log on the UI dispatcher (BeginInvoke), and OfficeScan's continuation refreshes the journey
   after the 201 (removing the race App.cs:186-188 admits).
3. **Tools covered in 4c:** the four that already post through `/audit` (IFC gate, Governed Publish's gate row, Naming
   Manager, AutoPublish), Governed Publish's verdict (print the first proposal's `AuditId`/`ReceiptHash`; read
   `RegisterVersionId`'s null and the stamp call's result — when either fails, or the stamp's verdict differs from the
   first, the dialog says `version badge: not confirmed — <reason>` instead of promising the ✓; the gate row is posted
   and waited for **before** `/propose`, so it lands first), and **heal**: one `family_heal` row per run,
   `{scanned, clean, healed[], human[], failed[] (each capped at 50 names, with totals), shared_parameter_source,
   source: "revit"}`, the document and key captured at command time (`ProjectContext.For(doc)`; `ScanLoaded` takes that
   document instead of `ActiveUIDocument` at event time); `shared_parameter_source` names the file the heal injected
   from, or `"not named"`. Deferred and listed: `audit()` returning the row (six stores; which of up to three rows is a
   version's receipt), ledger rows for auto-fix, requests, fix-in-place Apply, MEP voids, the Ghost/Datum/Massing/
   Annotate builds, CDE-01, changesets, the Standards snapshot and ruleset install; the changeset report's 120 s block
   on the API thread.
4. **`GET /cde/:key/audit` → `{rows, total, limit, offset}`** always. Filters: `entity_type`, `action_prefix`
   (→ `like.<p>*`, `*` and `%` escaped), `entity_id` (UUID-checked; a comma list → `in.()`), `actor`, `since`/`until`
   (→ `at=gte.`/`at=lt.`), `limit` (default 200, clamped to 1000), `offset`. The total is exact: `Prefer: count=exact`
   and the `Content-Range` total (`sb()` gets a `{count: true}` option returning `{data, total}`; a 416 or `*/N` is
   `rows: []`); never a planned or estimated count. The five consumers change in the same commit:
   `cde-panel.ts:221`, `files-panel.ts:127` (filters by `entity_id`), `mcp-server.mjs:186`, `ai-tools.mjs:76`,
   `check-registry.mjs:483, :542`.
5. **Honest derived figures.** `ids.last_verdict` reads `entity_type=file_version&action_prefix=verdict:`;
   `midp.review` reads `entity_type=container_version&action_prefix=state:` for the published ids. When a check's read
   returns fewer rows than its total it is `not_checkable` naming "read N of M"; "No governed verdict has been
   recorded" is said only when the total is 0.
6. **Public verify** — the same `POST /receipt/:key/verify`:
   - With a valid bearer or member JWT: today's full reply, unchanged (MCP and `docs/verdict-contract.md` §5 stay true).
   - Anonymous: input `{audit_id: integer, ledger_hash: 64 hex}` plus optional `recorded_at`, `verdict`, `project` (or a
     whole receipt, from which only these are read; `version` optional). Malformed input → 400 before any DB call.
     Lookup with the service key only, ignoring any Authorization header: `projects?key=eq.<decoded key>` (never
     creates, never throws a key-specific error), then `audit_log?id=eq.N&project_id=eq.P`. `matches: true` needs id,
     hash and project to match and every supplied optional field to match; a supplied `verdict` that differs gives
     `matches: false`. Reply `{matches, checked[], mismatched[], not_checked[], note}` — field names only, never a ledger
     value; `note` is "matches the ledger's stored hash; the chain is not recomputed". Unknown key, unknown id, wrong
     project and wrong hash return one byte-identical `{matches: false, note: "no ledger entry on this key has that id
     and hash"}`. A hashless row → the same miss. Errors → a generic 500 message.
   - Transport: a pure `isPublicRoute(method, pathname)` exempts exactly `POST` and `OPTIONS` on
     `/receipt/:key/verify` from the CSRF gate and the bearer gate; `Access-Control-Allow-Origin: *` on that path only,
     no credentials. `GET /receipt/:key/:id` and every `/cde` route still need the bearer.
   - Limits: the public path caps the body at 8 KB (413) and a global in-process fixed window of 60 calls a minute
     (429); it logs method, path and outcome only, never the body.
   - Residual, documented: the global chain means a member of project A holds the hash of a neighbouring row of some
     other project, and with that project's key can confirm that row N on key B has this hash and, by trying the
     verdicts (`accepted`, then `rejected`: `matches` / `mismatched`), which verdict it records — nothing else
     (`recorded_at` is compared as an exact string, so it cannot be probed in practice). Removing it needs per-project
     chaining (a migration) — out of scope.
   - `public-client/sentinel-verify.mjs`: the badge shows a verdict only when `verdict` is in `checked` (or on a
     member's `{matches, reasons, ledger}` reply, whose `verifyReceipt` always compares it), otherwise "on
     the ledger — verdict not checked"; the text "Confirmed against the immutable ledger" becomes "matches the ledger's
     stored hash (chain not recomputed)". `cors-origin.mjs`'s "every route needs a bearer" comment and its test name
     the one exception.
7. **Wording everywhere:** "ledger", not "immutable audit trail", in the lines 4c touches; the chain is described as
   global in `docs/verdict-contract.md` and the handbook.

## Testing

Bridge (vitest): the audit route's filters, exact total, clamping and consumers; `ids.last_verdict` on a fixture where
the verdict is outside the newest 200; the public verify matrix (match; flipped verdict; unknown id vs unknown key
byte-identical; malformed 400; 8 KB 413; 60/min 429; no ledger value in any anonymous reply; bearer reply unchanged);
`isPublicRoute` and the gates (bridge-auth, cors-origin). Add-in: `tools/event-check` (status → state → line, including
timeout and 5xx as not confirmed and 400/404/503 as not recorded); both builds 2024/2025; existing harnesses green.
Drill **Session B8**: IFC gate on Demo with the bridge up / stopped; Governed Publish reject on Demo shows the proposal's
ledger line and the gate row's; Naming Manager status; heal on a bound model and its row via the filtered audit read;
`ids.last_verdict` on `demo`; the anonymous verify matrix with `curl` against receipt 702 on `aster-office`.

## Out of scope

A chain recompute in SQL; per-project chaining; `roi:assumption` events and a ledger-derived gate stage (phase 5);
the publish-path rework (a stamp-only route or registering before `/propose` — phase 5's `Publisher.cs`); a web receipt
viewer; per-IP rate limits (Funnel forwarding unverified); `audit()` returning rows and the ledger-silent tools listed
in Decision 3; `listModelRevisions`' own 200 cut (model_revisions, not audit_log).
