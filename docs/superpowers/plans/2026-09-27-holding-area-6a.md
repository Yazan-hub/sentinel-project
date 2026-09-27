# Phase 6a — The Holding Area — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A file the referee refuses is not lost: every refusal of a registering file by installed standards is a reserved `hold:` ledger row the bridge writes itself, listed in Versions ▸ On hold with its stage, failures and ledger line until a corrected file is registered under the same name or a lead dismisses it — and the web upload is judged before anything is stored.

**Architecture:** Task 1 lays the ledger foundation on the bridge (reserved `hold:`, entity types `hold` and `delivery_gate`, `writeHold`, the machine-only `POST /cde/:key/delivery-gate`, `adjudicateProposal`'s file fields, `gate_row_id`, stage and hold conditions, intake's gate row id and gate-FAIL hold); Task 2 derives the held list (`holding-logic.mjs`) and adds `GET /cde/:key/holding` and the lead's dismissal; Task 3 sends the web Versions upload through intake and adds "On hold (n)"; Task 4 moves Revit's gate row to the new route and prints the held line; Task 5 brings the protocol (Session B12), the capability row and the handbook in line. No migration; held files keep no bytes.

**Tech Stack:** Node bridge (vitest), TypeScript web (vite), C# add-in (Revit 2024/2025, `-p:DeployToRevit=false` during the tasks), Revit-free harnesses under `tools/`.

**Follow-ups the cross-check found outside 6a (not tasks here):** the intake CLI prints no `hold` line (one `line("hold", …)` by the receipt rule); intake has no role check, so a viewer's accepted intake still registers (6a gates only the hold); a machine-credential dismissal with no actor is stamped `web`; `readHolding` pages by offset, so a hold written between two pages is read twice (ponytail-marked; page by id); a naming hold's note shows on the web only, not in the Revit dialog.

Spec: `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md` (6a, Decisions 1–9). Branch: `feature/holding-area` from master c7dcbf6 (+ this plan's commit).

## Global Constraints

GLOBAL CONSTRAINTS — phase 6a (the Holding Area), measured by the cross-checker on scratchpad\p6aX (git archive of master c7dcbf6; WebApp\node_modules junctioned; WebApp\.env, config\.env and the untracked WebApp\src\generated copied, so tsc counts equal the working tree's)

EXECUTION ORDER: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → the controller's Task 6 (deploy the bridge and the add-in together with Revit closed, drill B12, merge).
- Task 2 must follow Task 1: its quoted current text is text Task 1 inserted into cde-store.mjs and bcf-service.mjs.
- Task 3 consumes Tasks 1-2's routes.
- Task 4 compiles on its own but needs Task 1's bridge at runtime.
- Task 5 is docs only.
Branch: feature/holding-area. No migration. Nothing touches the live database, the managed bridge on :4100, %AppData%\Sentinel or a running Revit (the builds use -p:DeployToRevit=false).

BUILD STATE PER TASK (measured; the RED/GREEN counts are the ones the plan states):
- master: npm test 1187 tests in 86 files; npx tsc --noEmit -p . gives 24 errors. Harnesses: publish-check 101, gate-check 121, event-check 44, fixplace-check 52, artefact-cache-check 53, roi-check 43, ghost-standards-check 135, naming-check 37, org-check 46, snapshot-check 21, heal-check 9, project-context-check 19. Add-in builds: 2024 0 errors / 6 warnings, 2025 0 errors / 3 warnings.
- Task 1: RED is "51 failed | 56 passed (107)" over the 4 files; GREEN 107/107 (intake-logic 15, ledger-write 21, cde-store-hold 43, propose-register 28). Suite 1237 tests in 87 files; tsc 24; node --check clean.
- Task 2: RED is both new files failing to load (holding-logic.mjs missing); GREEN 19/19 (holding-logic 8, cde-store-holding 11). Suite 1256 tests in 89 files; tsc 24.
- Task 3 (with the amendments): RED is holding.test.ts failing to load; GREEN 15/15. Suite 1271 tests in 90 files. tsc 23: files-panel.ts(109,57) leaves with sha256Hex, and there are no errors in files-panel.ts, holding.ts or holding.test.ts. `grep -rn "/ifc?" src` finds only model-panel.ts:669 (the modeller bake, out of scope).
- Task 4: RED is gate-check with 7 compile errors and publish-check with 11, exactly as listed in the plan.
  - GREEN: gate-check 122/122, publish-check 112/112.
  - Both builds give 0 errors with master's warning sets (2024: 6, 2025: 3).
  - The other ten harnesses are unchanged: event-check 44, fixplace-check 52, artefact-cache-check 53, roi-check 43, ghost-standards-check 135, naming-check 37, org-check 46, snapshot-check 21, heal-check 9, project-context-check 19.
  - `git grep AuditAction -- SentinelAddin tools` prints nothing. npm and tsc stay at 1271/90 and 23.
- Task 5: B12 sits between B11 and Session C, as 28 table lines (header, separator, 26 rows), every row two cells. The five files stay CRLF. No code changes.

Pre-existing, unrelated: on a CRLF checkout, canonical-fixture.test.mjs rewrites WebApp/bridge/fixtures/canonical-cases.json. Run `git checkout` on that file before every commit.

FILE OWNERSHIP:
- Task 1: WebApp/bridge/cde-store.mjs, intake-logic.mjs and bcf-service.mjs; the tests ledger-write.test.mjs, propose-register.test.mjs and intake-logic.test.mjs; the new cde-store-hold.test.mjs.
- Task 2: the new holding-logic.mjs, holding-logic.test.mjs and cde-store-holding.test.mjs; cde-store.mjs and bcf-service.mjs again (after Task 1).
- Task 3: the new WebApp/src/setups/holding.ts and holding.test.ts; files-panel.ts.
- Task 4: SentinelAddin/Engine/GateLines.cs, Publisher.cs and AutoPublish.cs; Coordination/GovernedNotify.cs, LedgerResult.cs and ProposalResult.cs; Commands.GovernedPublish.cs and Commands.IfcGate.cs; tools/gate-check/GateLinesCheck.cs, tools/publish-check/Check.cs and publish-check.csproj.
- Task 5: docs/TESTING_PROTOCOL.md, docs/handbook/05-capability-status.md, docs/SENTINEL_HANDBOOK.md, SENTINEL-USER-GUIDE.md, docs/verdict-contract.md.
No two tasks run in parallel on the same file.

INTERFACES AS BUILT:
- The open audit route. RESERVED_ACTIONS = verdict:, gate:, roi:, state:, hold:. RESERVED_TYPES = stage_gate, hold, delivery_gate. The refusal is a 400 "<hold: | hold | delivery_gate> rows are written by Sentinel, not through this route" (case and surrounding spaces ignored). naming and family_heal rows stay open.
- writeHold(proj, {stage, container_name, sha256, size_bytes, verdict, failures, source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref, actor}) writes audit(proj.id, "hold", <container uuid | null>, "hold:<stage> <name>", actor, null, new_value) and returns the stored row or null.
  - new_value also carries failures_total, the count before the cut.
  - failures: the first 50, each {requirement, detail}. A gate line becomes {requirement "delivery gate", detail <line>}; an IDS failure becomes detail "<element>: <reason>"; a naming failure becomes requirement "naming <field>" or "naming (field count)".
- couldRegister(key): true when myRole is "service" or the caller ranks contributor or above.
- POST /cde/:key/delivery-gate (recordDeliveryGate). It is the machine credential only; anything else is a 403 "the delivery-gate route is for Sentinel's machine credential", before any read.
  - It validates 14 keys: file (/\.ifc$/i), result, passed (must agree with result), contract, contract_ref, contract_source, contract_sha256, schema, entities, failures (≤ 200, strings or {requirement, detail}), sha256, size_bytes, source ("revit" | "auto-publish" | "check"), publish. publish true with source check is a 400. Unknown keys are dropped. actor is optional, default "Revit".
  - It writes the row "IFC delivery gate PASS|FAIL|NOT CHECKED: <file>" with the validated body (the full list) as its value.
  - passed false with publish true also writes hold:gate.
  - Reply: 201 {id, hash, hold: {id, hash} | null}, with no receipt key.
- adjudicateProposal(key, b, opts = {}): opts.intake = {source, sha256, size_bytes, gate_row_id} comes only from runIntake.
  - The proposal row gains container_name, sha256 and size_bytes (from register, or from b.container_name plus opts.intake), and gate_row_id when it is a positive integer.
  - A rejected verdict is held only when all three conditions hold: register or opts.intake is present; ids_source and naming_source are not "client"; couldRegister is true.
  - stage: naming when the naming judge rejected under enforce reject, else ids.
  - source: intake web → web; any other intake → intake; "Governed Publish" → revit; "Auto-Publish" → auto-publish; otherwise intake.
  - The reply gains hold: {id, hash} | {id: null, hash: null} | null.
- runIntake: the audit adapter returns the gate row. A gate FAIL calls deps.writeHold, which is null unless couldRegister. Every reply carries hold. A naming refusal answers stage "naming" (on master it answered "ids").
- GET /cde/:key/holding answers 200 {items, cleared_recent}; a failed read is a 502 "not read — the hold rows or the file list could not be read (the bridge log has the cause)".
  - Each item: {container_name, stage, verdict, failures, failures_total, source, actor, at, ledger {id, hash}, refusals, naming_note?}. NAMING_NOTE reads "the corrected file carries a new name — a lead dismisses this entry once it is registered".
  - cleared_recent holds the last 20 entries {container_name, by: "recorded" | "unjudged" | <verdict>, version_id, at, label}.
- POST /cde/:key/holding/dismiss: requireMinRole lead (a 403 otherwise).
  - 400 "container_name is required — the held file's name".
  - 400 "reason is required — a lead's dismissal says why, in at most 500 characters".
  - 409 "<name> is not on hold on <key>".
  - Writes hold:dismissed <name> with {container_name, reason} and replies 201 {id, hash}.
- Web:
  - uploadThroughIntake posts once, to <base>/cde/<key>/intake?name&source=web&revision=v{N+1}&note=uploaded%20via%20web%20by%20<who>. It never touches /ifc or /files.
  - intakeLine on a rejection: "Not uploaded — <the delivery gate|the naming standard|the IDS> refused <name> (<n> failure(s)) · On hold · <ledgerLine(hold)>", or "· not on hold — the bridge returned no hold row" when the bridge returned none.
  - "On hold (n)" is built like "Archived (n)". The Dismiss… reason is typed inline (never window.prompt). A list that was not read shows "On hold: not read — <why>", never an empty list.
- Revit:
  - GateLines.AuditValue(file, r, source, publish) is the route body. RouteFailures = 200 (past it, the first 199 plus "… and <n> more — the certificate lists every one"). AuditAction is deleted.
  - GovernedNotify.DeliveryGate(file, gate, key, source, publish) posts to Event("/delivery-gate").
  - Propose(…, gateRowId) and RequestBody(…, register, gateRowId) send "gate_row_id" only when it is > 0.
  - Replies: ProposalResult.Held/HoldId/HoldHash; LedgerResult.Hold.
  - Publisher.Prepare(doc, tempDir, resolve, source = "revit"). The contract-pair local is renamed to contractSource (CS0136). Governed Publish passes "revit", AutoPublish passes "auto-publish", the IFC Gate command sends "check" with publish false.
  - PublishOutcome.HoldRow. PublishLines.Held(hold) = "Held on the web: Versions ▸ On hold · " + LedgerLine.For(hold); it appears in the Dialog and the Doctor lines only when the bridge returned a hold.

HONESTY (verified):
- A hold is written only under the three conditions, and the tests cover each negative: a plain proposal, a viewer, a non-member, a client IDS, a client naming standard, and intake fields sent in the HTTP body.
- A rejected file uploads nothing: intake uploads only after an accepted or recorded verdict, and the web has no /ifc path.
- "ledger #id · receipt <16 hex>…" appears only with an id and a 64-hex hash: stage-gate.ts's ledgerLine on the web, LedgerLine.For in Revit. Otherwise the line reads "not confirmed — the bridge returned no chain hash".
- A failed read is never "none on hold".
- No BDS or AST literal in added production code (0 hits).
- THREADING: Prepare stays on the API thread and waits for the gate row with Task.Run(...).GetAwaiter().GetResult(). Judge's HTTP runs off the API thread.
- DEPLOY TOGETHER: an add-in from before 6a gets a 400 "delivery_gate rows are written by Sentinel, not through this route" and prints its not-recorded line. The 6a add-in on master's bridge gets a 404 "CDE route not found".

---

### Task 1: Bridge — the ledger foundation: `hold:`, entity_types `hold` and `delivery_gate` refused by the open audit route; `writeHold`; the machine-only `POST /cde/:key/delivery-gate` (the full failure list on the gate row, `hold:gate` on a FAIL from a publish); `adjudicateProposal` names the file on its proposal row (`container_name`, `sha256`, `size_bytes`, `gate_row_id`) and holds a refusal (`hold:naming` | `hold:ids`) only for a registering file judged by installed standards from a caller who could register it; intake's audit adapter returns the gate row, `runIntake` passes it and the file into the referee's internal `opts.intake` and holds a gate FAIL; the tests

(Every block below was applied, as written, to a `git archive` of master c7dcbf6 in `scratchpad\p6aA` (commit `task1`, every quoted current text matched exactly once) and measured: Step 2 RED `51 failed | 56 passed (107)` over the four test files, Step 8 GREEN 107/107 (intake-logic 13 → 15, ledger-write 16 → 21, cde-store-hold 43 new, propose-register 28), the whole suite 1237 in 87 files (master 1187 in 86), `node --check` clean on the three modules, `npx tsc --noEmit -p .` 25 on the archive (24 in the working tree — the untracked `src/generated/fragments-worker`), unchanged: no TS, no C#. Behaviour that changes with this task, by design: a signed-in member's or an old add-in's `POST /cde/:key/audit` with entity_type `delivery_gate` is a 400 (the add-in and the bridge deploy together, Task 6); a rejected `/propose … register` from a caller who could register writes one more row, the hold; an intake refused by the naming judge answers `stage: "naming"` (was `"ids"`).)

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (`RESERVED_ACTIONS` and `recordAudit`; the Holding Area's writers inserted after `recordAudit` — `holdFailure`, `writeHold`, `couldRegister`, `readDeliveryGate`, `recordDeliveryGate`; `adjudicateProposal`'s doc comment, signature, proposal row, hold and reply)
- Modify: `WebApp/bridge/intake-logic.mjs` (`runIntake`: the gate row's id, the gate-FAIL hold, the referee's third argument, the refusing stage)
- Modify: `WebApp/bridge/bcf-service.mjs` (the `POST /cde/:key/audit` comment; the delivery-gate route after the stage-gate route; the `/propose` comment; the `/intake` deps)
- Modify: `WebApp/bridge/ledger-write.test.mjs`, `WebApp/bridge/propose-register.test.mjs`, `WebApp/bridge/intake-logic.test.mjs`
- Create: `WebApp/bridge/cde-store-hold.test.mjs`
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md` Decisions 4-6 and the 6a definition of done; `WebApp/bridge/cde-store.mjs:748-756` (`audit()` returns the stored row or null; the actor goes through `resolveActor`), `:758-788` (`RESERVED_ACTIONS`, `recordAudit`), `:1035-1047` (`readRegister`: `register` is validated before any read — the name registered is `container_name`), `:1060-1158` (`adjudicateProposal`: the client-IDS and client-naming 400s for `version_id`/`register`, `namingProv.naming_source`, `idsEnforce`, the local `audit` = the proposal row, "a rejected verdict registers nothing"), `:209-221` (`runStageGate`: members-store imported lazily — it imports cde-store); `WebApp/bridge/members-store.mjs:13` (`ROLE_RANK`), `:126-134` (`myRole`: `"service"` with no JWT and no read; a signed-in member's role; null for a signed-in non-member — under forwarding `ensureProject` answers a non-member 403 first); `WebApp/bridge/intake-logic.mjs:33-61` (the gate, its row, the FAIL return, the referee call, the rejected branch); `WebApp/bridge/bcf-service.mjs:1104-1119` (the audit and stage-gate routes), `:1129-1139` (`/propose`: the reply is `adjudicateProposal`'s, so `hold` reaches Revit unchanged), `:1191-1229` (`/intake` and its deps), `:1316-1321` (the block's catch: `e.status` or a scrubbed 500); `SentinelAddin/Coordination/GovernedNotify.cs:71-78` and `SentinelAddin/Engine/GateLines.cs:88-107` (the gate row Revit posts today: the action words `IFC delivery gate PASS | FAIL | NOT CHECKED: <file>` and `AuditValue`'s fields, `failures` a count); `SentinelAddin/Engine/Publisher.cs:180-186, 215-218` (the gate row's file is `plan.ContainerName`; `Judge`'s source is `"Governed Publish"` or `"Auto-Publish"`); `WebApp/bridge/delivery-gate.mjs:139-158` (intake's gate failures are strings); `WebApp/src/sentinel-core/ids.ts:98-112, 164` (an IDS failure is `{element, specification, requirement, reason}`), `naming.ts:51-56, 75` (a naming failure is `{field, value?, reason}`, `field "*"` for the field count).

**Interfaces:**
- Produces (`cde-store.mjs`): `RESERVED_ACTIONS` = `["verdict:", "gate:", "roi:", "state:", "hold:"]`; `RESERVED_TYPES` = `["stage_gate", "hold", "delivery_gate"]`; `recordAudit` refuses either (case and surrounding spaces ignored) with `"<hold: | hold | delivery_gate> rows are written by Sentinel, not through this route"`, a 400 before any read.
- `export async function writeHold(proj, {stage, container_name, sha256, size_bytes, verdict, failures, source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref, actor})` → the stored row of `audit(proj.id, "hold", <the container's uuid when a container of that name is on the project, else null>, "hold:<stage> <container_name>", actor, null, new_value)`, null when no row came back. `new_value = {container_name, sha256, size_bytes, stage, verdict, failures, failures_total, source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref}` — `failures` the first 50, each `{requirement, detail}` (a gate line → `{requirement: "delivery gate", detail: <line>}`; an IDS failure → `{requirement, detail: "<element>: <reason>"}`; a naming failure → `{requirement: "naming <field>" | "naming (field count)", detail: <reason>}`; `{requirement, detail}` kept); `failures_total` the count before the cut.
- `export async function couldRegister(key)` → `myRole(key)` is `"service"` or ranks contributor or above.
- `export function readDeliveryGate(b)` (pure) and `export async function recordDeliveryGate(key, b)` → 403 `"the delivery-gate route is for Sentinel's machine credential"` unless `myRole(key) === "service"` (before any read or validation); 400s: `file must be the IFC file's name, ending .ifc` · `result must be pass, fail or not_checked` · `passed must be true for pass, false for fail and null for not_checked` · `<contract|contract_ref|contract_source|schema> must be a string or null` · `<contract_sha256|sha256> must be 64 hex characters or null` · `<entities|size_bytes> must be a whole number or null` · `failures must be a list of at most 200 lines, each a string or {requirement, detail}` · `source must be revit, auto-publish or check` · `publish must be true or false` · `publish is true only for revit or auto-publish — the IFC Gate command checks a file, it publishes nothing`. A nullable field left out is null; a key not listed is dropped; `actor` optional (a non-blank string, else `"Revit"`). Writes `audit(proj.id, "delivery_gate", null, "IFC delivery gate PASS|FAIL|NOT CHECKED: <file>", actor, null, <the validated body, the full failure list>)`; when `passed === false` and `publish === true` also `writeHold({stage: "gate", container_name: file, sha256, size_bytes, verdict: "rejected", failures, source, gate_row_id: <the gate row's id>, proposal_row_id: null, contract_ref, ids_ref: null, naming_ref: null, actor})`. → `{id, hash, hold: {id, hash} | null}`.
- `export async function adjudicateProposal(key, b = {}, opts = {})` — `opts.intake = {source, sha256, size_bytes, gate_row_id}` is intake's own, never read from `b`. The proposal row's `new_value` gains `container_name`, `sha256`, `size_bytes` (from `register`, or from `b.container_name` + `opts.intake`) and `gate_row_id` (`opts.intake.gate_row_id`, else `b.gate_row_id`, each only when a positive integer). On `verdict === "rejected"` it writes one hold row when (a) the request carries `register` or `opts.intake`, (b) `ids_source !== "client"` and `naming_source !== "client"`, (c) `couldRegister(key)`; `stage` = `"naming"` when the naming judge rejected under enforce reject, else `"ids"`; `failures` = the naming failures (when it refused) then the IDS failures (when the IDS refused under enforce reject); `source` = intake's `"web"` → `"web"`, any other intake source → `"intake"`, else `b.source` `"Governed Publish"` → `"revit"`, `"Auto-Publish"` → `"auto-publish"`, else `"intake"`; `proposal_row_id` the proposal row's id; `ids_ref`, `naming_ref` the refs that judged; `contract_ref` null; `actor` the trusted actor. The reply gains `hold: {id, hash} | null` (`{id: null, hash: null}` = a hold was written and the ledger returned no row; null = nothing held).
- Produces (`intake-logic.mjs`): `deps.audit(key, message, actor, value)` returns the stored gate row; `deps.adjudicate(key, body, {intake: {source, sha256, size_bytes, gate_row_id}})`; `deps.writeHold(key, fields)` → the stored row, `{}` when written with no row back, null when not written; the reply always carries `hold` (null unless held); a gate FAIL calls `deps.writeHold` with `{stage: "gate", container_name: name, sha256, size_bytes: gate.size, verdict: "rejected", failures: gate.failures, source: "web" | "intake", gate_row_id, proposal_row_id: null, contract_ref, ids_ref: null, naming_ref: null, actor}`; a rejected verdict answers `stage: "naming"` when `result.naming` is `{ok: false, enforce: "reject"}`, else `"ids"`, and `hold: result.hold ?? null`. Intake's own gate row is unchanged (`failures` stays a count).
- Produces (`bcf-service.mjs`): `POST /cde/:key/delivery-gate` → 201 `recordDeliveryGate`'s reply (403/400/404 through the block's catch); the `/intake` wiring: `adjudicate` passes `opts`, `audit` returns the row, `writeHold` = `couldRegister(key) ? (writeHold(ensureProject(key), h) ?? {}) : null`.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
// The ledger's writers (cohesion phase 5a, spec Decision 7): audit() returns the row the ledger stored, and the open
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate).
```

with

```js
// The ledger's writers (cohesion phase 5a, spec Decision 7): audit() returns the row the ledger stored, and the open
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate; since phase 6a
// hold:, hold and delivery_gate).
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
    [{ entity_type: " Stage_Gate ", action: "recorded" }, "stage_gate rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
```

with

```js
    [{ entity_type: " Stage_Gate ", action: "recorded" }, "stage_gate rows are written by Sentinel, not through this route"],
    // The Holding Area (phase 6a): a hold is the bridge's own row, and Revit's gate row goes through the machine-only route.
    [{ entity_type: "event", action: "hold:ids Tower.ifc" }, "hold: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: " HOLD:dismissed Tower.ifc" }, "hold: rows are written by Sentinel, not through this route"],
    [{ entity_type: "hold", action: "recorded" }, "hold rows are written by Sentinel, not through this route"],
    [{ entity_type: " Hold ", action: "recorded" }, "hold rows are written by Sentinel, not through this route"],
    [{ entity_type: "delivery_gate", action: "IFC delivery gate PASS: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
    [{ entity_type: " Delivery_Gate", action: "IFC delivery gate FAIL: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
```

In `WebApp/bridge/ledger-write.test.mjs`, replace

```js
    ["ids_validation", "Issue raised: Pset_WallCommon.FireRating"],
    ["delivery_gate", "IFC delivery gate PASS: tower.ifc"],
    ["naming", "Naming Manager renamed 3 item(s) in Revit"],
```

with

```js
    ["ids_validation", "Issue raised: Pset_WallCommon.FireRating"],
    ["naming", "Naming Manager renamed 3 item(s) in Revit"],
```

In `WebApp/bridge/propose-register.test.mjs`, replace

```js
  it("rejected registers nothing", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: BAD, container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null, verdict_hash: null });
    expect(actions()).toEqual(["Proposal rejected from revit"]);
```

with

```js
  it("rejected registers nothing — the refusal is held instead (phase 6a): one hold row names the file", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "revit", elements: BAD, container_name: NAME, register });
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null, verdict_hash: null, hold: { id: db.audit_log[1].id, hash: db.audit_log[1].hash } });
    expect(actions()).toEqual(["Proposal rejected from revit", `hold:ids ${NAME}`]);
```

(That file mocks no role: with no JWT `myRole` answers `"service"` without a read, so the machine caller's refusal is held.)

In `WebApp/bridge/intake-logic.test.mjs`, replace

```js
function stubs({ gatePass = true, contract = "office", verdict = "accepted", uploadFails = false, warned = false, inScope = 1 } = {}) {
```

with

```js
function stubs({ gatePass = true, contract = "office", verdict = "accepted", uploadFails = false, warned = false, inScope = 1, namingRefused = false, held = { id: 701, hash: "71".repeat(32) } } = {}) {
```

In `WebApp/bridge/intake-logic.test.mjs`, replace

```js
    adjudicate: rec("adjudicate", { verdict: downgraded ? "recorded" : verdict, downgraded, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1, in_scope: verdict === "recorded" ? 0 : inScope }, failures, naming: { ok: true }, warned, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", ids_enforce: idsEnforce, audit_id: 901, receipt: { ledger_hash: "h" } }),
```

with

```js
    adjudicate: rec("adjudicate", { verdict: downgraded ? "recorded" : verdict, downgraded, summary: { ids: verdict === "recorded" ? null : "Aster IDS", elements: 1, in_scope: verdict === "recorded" ? 0 : inScope }, failures, naming: namingRefused ? { ok: false, enforce: "reject", failures: [{ field: "*", reason: "expected 11 fields, got 1" }] } : { ok: true }, warned, ids_source: verdict === "recorded" ? "none" : "project", ids_ref: verdict === "recorded" ? null : "ids@1", ids_enforce: idsEnforce, audit_id: 901, receipt: { ledger_hash: "h" }, hold: verdict === "rejected" ? { id: 902, hash: "92".repeat(32) } : null }),
```

In `WebApp/bridge/intake-logic.test.mjs`, replace

```js
    recordVersionVerdict: rec("recordVersionVerdict", undefined),
    audit: rec("audit", undefined),
```

with

```js
    recordVersionVerdict: rec("recordVersionVerdict", undefined),
    // The wiring's audit adapter returns the stored row (phase 6a); writeHold the hold row, or null when nothing was held.
    audit: rec("audit", { id: 700, hash: "70".repeat(32) }),
    writeHold: rec("writeHold", held),
```

In `WebApp/bridge/intake-logic.test.mjs`, replace

```js
  it("stops at the delivery gate: audit row, no adjudication, no version", async () => {
    const d = stubs({ gatePass: false });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", published: false, sha256: "ab".repeat(32) });
    expect(r.gate.failures).toHaveLength(1);
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe("IFC delivery gate FAIL: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
  });
  it("rejected by the IDS: gate PASS audited, BCF raised, no version", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "ids", published: false, ids_source: "project", ids_ref: "ids@1" });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf"]);
    const adjBody = d.calls.find((c) => c[0] === "adjudicate")[2];
    expect(adjBody).toMatchObject({ source: "astra", actor: "agent:astra", container_name: input.name });
    expect(adjBody.elements).toHaveLength(1);
  });
```

with

```js
  it("stops at the delivery gate: audit row, the refusal held, no adjudication, no version", async () => {
    const d = stubs({ gatePass: false });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", published: false, sha256: "ab".repeat(32), hold: { id: 701, hash: "71".repeat(32) } });
    expect(r.gate.failures).toHaveLength(1);
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "writeHold"]);
    expect(d.calls.find((c) => c[0] === "audit")[2]).toBe("IFC delivery gate FAIL: ASTR26-AST-ZZ-XX-M3-A-0001.ifc");
    expect(d.calls.find((c) => c[0] === "writeHold").slice(1)).toEqual(["aster-tower", {
      stage: "gate", container_name: input.name, sha256: "ab".repeat(32), size_bytes: 13, verdict: "rejected", failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."],
      source: "intake", gate_row_id: 700, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, actor: "agent:astra",
    }]);
  });
  it("a web upload's gate FAIL is held as web; a caller who could not register it holds nothing (hold null)", async () => {
    const d = stubs({ gatePass: false });
    await runIntake(d, { ...input, source: "web" });
    expect(d.calls.find((c) => c[0] === "writeHold")[2]).toMatchObject({ source: "web" });
    const r = await runIntake(stubs({ gatePass: false, held: null }), input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "gate", hold: null });
    const noRow = await runIntake(stubs({ gatePass: false, held: {} }), input);
    expect(noRow.hold).toEqual({ id: null, hash: null });
  });
  it("rejected by the IDS: gate PASS audited, BCF raised, no version; the referee gets intake's own argument and its hold is the reply's", async () => {
    const d = stubs({ verdict: "rejected" });
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "ids", published: false, ids_source: "project", ids_ref: "ids@1", hold: { id: 902, hash: "92".repeat(32) } });
    expect(r.bcf).toEqual({ raised: 1 });
    expect(names(d)).toEqual(["loadContract", "checkDelivery", "audit", "extractElements", "adjudicate", "raiseBcf"]);
    const [, , adjBody, adjOpts] = d.calls.find((c) => c[0] === "adjudicate");
    expect(adjBody).toMatchObject({ source: "astra", actor: "agent:astra", container_name: input.name });
    expect(adjBody).not.toHaveProperty("intake");
    expect(adjBody.elements).toHaveLength(1);
    expect(adjOpts).toEqual({ intake: { source: "astra", sha256: "ab".repeat(32), size_bytes: 13, gate_row_id: 700 } });
  });
  it("rejected by the naming judge: stage naming", async () => {
    const r = await runIntake(stubs({ verdict: "rejected", namingRefused: true }), input);
    expect(r).toMatchObject({ verdict: "rejected", stage: "naming", hold: { id: 902 } });
  });
```

In `WebApp/bridge/intake-logic.test.mjs`, replace

```js
    const d = stubs();
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true });
    expect(r.version).toMatchObject({
```

with

```js
    const d = stubs();
    const r = await runIntake(d, input);
    expect(r).toMatchObject({ verdict: "accepted", stage: "published", published: true, hold: null });
    expect(r.version).toMatchObject({
```

Create `WebApp/bridge/cde-store-hold.test.mjs`:

```js
// The Holding Area's writers (phase 6a, spec 2026-09-27 Decisions 4-6): writeHold; the machine-only delivery-gate route
// (recordDeliveryGate); and the hold adjudicateProposal writes for a refused registering file — only when the request
// registers (register, or intake's internal argument), the standards that judged are the installed ones, and the caller
// could register the file. globalThis.fetch is a fake PostgREST over in-memory tables; the caller's role and the installed
// IDS and naming standard are set per test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { role: "service", ids: null, naming: null };
});
vi.mock("./members-store.mjs", async (orig) => ({ ...(await orig()), myRole: vi.fn(async () => state.role) }));
// resolveIdsSpec's order, as artefact-store has it: installed (state.ids) → the caller's → none. The naming standard is
// the office's naming@2 when state.naming is set, else none.
vi.mock("./artefact-store.mjs", async (orig) => ({
  ...(await orig()),
  resolveIdsSpec: vi.fn(async (_key, body = {}) => (state.ids
    ? { spec: state.ids, source: "project", ref: "ids@1", sha256: "1d".repeat(32), client_ids_ignored: body.ids != null }
    : body.ids
      ? { spec: body.ids, source: "client", ref: null, sha256: "c1".repeat(32), client_ids_ignored: false }
      : { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false })),
  resolveArtefact: vi.fn(async (_key, kind) => (kind === "naming" && state.naming
    ? { body: state.naming, source: "office", ref: "naming@2", sha256: "2a".repeat(32) }
    : { body: null, source: "none", ref: null, sha256: null })),
}));

import { adjudicateProposal, writeHold, recordDeliveryGate } from "./cde-store.mjs";

const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "cccccccc-0000-4000-8000-000000000001";
const NAME = "ASTR26-AST.ifc";                                  // passes NAMING below
const BAD_NAME = "Tower.ifc";                                   // one field, not two
const SHA = "ab".repeat(32);
const IDS = { title: "Aster IDS", specifications: [{ name: "Doors carry a FireRating", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" }] } }] };
const NAMING = { title: "Test naming", separator: "-", strip_extensions: [".ifc"], enforce: "reject", fields: [{ key: "project", label: "Project", enum: ["ASTR26"] }, { key: "originator", label: "Originator", pattern: "[A-Z]{3}" }] };
const door = (rows) => ({ identity: { Class: "IFCDOOR", GlobalId: "d1" }, psets: [{ name: "Pset_DoorCommon", rows }], quantities: [] });
const GOOD = [door([{ name: "FireRating", value: "60" }])];
const BAD = [door([])];
const register = (name = NAME) => ({ name, size_bytes: 1234, sha256: SHA });

let db, calls, nextId;
function seed() {
  db = {
    projects: [{ id: P1, key: "aster-tower" }],
    information_containers: [{ id: C1, project_id: P1, iso_name: "Registered.ifc", parent_id: null }],
    container_versions: [],
    audit_log: [],
  };
  calls = [];
  nextId = 900;
}
// PostgREST as the store uses it: eq. filters, the embeds registerFileVersion asks for, PATCH, and POST with or without
// return=representation (audit_log rows get an id, a time and a hash, as the chain trigger would).
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ method, table, body });
  const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
  const hit = (r) => eqs.every(([k, v]) => String(r[k]) === v.slice(3));
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
  if (method === "GET") {
    const select = u.searchParams.get("select") || "";
    return json(db[table].filter(hit).map((r) => (select.includes("container_versions(") ? { ...r, container_versions: db.container_versions.filter((v) => v.container_id === r.id) } : { ...r })));
  }
  if (method === "PATCH") {
    for (const r of db[table].filter(hit)) Object.assign(r, body);
    return new Response(null, { status: 204 });
  }
  const row = table === "audit_log"
    ? { ...body, id: ++nextId, at: new Date(Date.UTC(2026, 8, 27, 0, 0, nextId - 900)).toISOString(), hash: String(nextId).padStart(64, "0") }
    : { ...body, id: crypto.randomUUID() };
  db[table].push(row);
  return /return=representation/.test(init.headers?.Prefer || "") ? json([row], 201) : new Response("", { status: 201 });
}

const realFetch = globalThis.fetch;
beforeEach(() => { seed(); state.role = "service"; state.ids = IDS; state.naming = null; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
afterEach(() => { globalThis.fetch = realFetch; });
const rows = (prefix) => db.audit_log.filter((r) => r.action.startsWith(prefix));

describe("writeHold — one reserved row naming the refused file", () => {
  it("entity_id is the container when the name is registered, else null; failures become {requirement, detail}, the first 50, with the total", async () => {
    const failures = [
      "IFCPROJECT: 0 found, contract requires ≥ 1.",
      { element: "d1", specification: "Doors", requirement: "Pset_DoorCommon.FireRating", reason: "REQUIRED but missing" },
      { field: "originator", value: "x", reason: "'x' is not a valid Originator" },
      { field: "*", reason: "expected 2 '-'-separated fields (Project-Originator), got 1" },
      { requirement: "IfcBuildingStorey", detail: "0 found" },
      ...Array.from({ length: 55 }, (_, i) => `line ${i}`),
    ];
    const held = await writeHold({ id: P1 }, { stage: "gate", container_name: " Registered.ifc ", sha256: SHA, size_bytes: 1234, verdict: "rejected", failures, source: "revit", gate_row_id: 812, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, actor: "Revit" });
    expect(held).toMatchObject({ id: 901, hash: "901".padStart(64, "0"), entity_type: "hold", entity_id: C1, action: "hold:gate Registered.ifc", actor: "Revit" });
    expect(held.new_value).toMatchObject({ container_name: "Registered.ifc", sha256: SHA, size_bytes: 1234, stage: "gate", verdict: "rejected", source: "revit", gate_row_id: 812, proposal_row_id: null, contract_ref: "contract@1", ids_ref: null, naming_ref: null, failures_total: 60 });
    expect(held.new_value.failures).toHaveLength(50);
    expect(held.new_value.failures.slice(0, 5)).toEqual([
      { requirement: "delivery gate", detail: "IFCPROJECT: 0 found, contract requires ≥ 1." },
      { requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" },
      { requirement: "naming originator", detail: "'x' is not a valid Originator" },
      { requirement: "naming (field count)", detail: "expected 2 '-'-separated fields (Project-Originator), got 1" },
      { requirement: "IfcBuildingStorey", detail: "0 found" },
    ]);
    const unregistered = await writeHold({ id: P1 }, { stage: "ids", container_name: "New.ifc", verdict: "rejected", failures: [], source: "intake", actor: "cli" });
    expect(unregistered).toMatchObject({ entity_id: null, action: "hold:ids New.ifc", new_value: { sha256: null, size_bytes: null, failures: [], failures_total: 0, gate_row_id: null } });
  });
});

describe("recordDeliveryGate — Revit's gate row, open only to the machine credential", () => {
  const gate = { file: NAME, result: "fail", passed: false, contract: "parity-ifc4", contract_ref: "contract@1", contract_source: "office", contract_sha256: "CD".repeat(32), schema: "IFC4", entities: 40, failures: ["IFCPROJECT: 0 found, contract requires ≥ 1.", { requirement: "Pset_WallCommon", detail: "Required property set 'Pset_WallCommon' not found in the file." }], sha256: SHA, size_bytes: 1234, source: "revit", publish: true };

  it.each(["owner", "lead", "contributor", "viewer", null])("a signed-in caller (%s) is refused before any read or validation", async (role) => {
    state.role = role;
    await expect(recordDeliveryGate("aster-tower", gate)).rejects.toMatchObject({ status: 403, message: "the delivery-gate route is for Sentinel's machine credential" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ file: "tower.rvt" }, "file must be the IFC file's name, ending .ifc"],
    [{ file: ".ifc" }, "file must be the IFC file's name, ending .ifc"],
    [{ result: "ok" }, "result must be pass, fail or not_checked"],
    [{ passed: true }, "passed must be true for pass, false for fail and null for not_checked"],
    [{ result: "not_checked" }, "passed must be true for pass, false for fail and null for not_checked"],
    [{ contract_ref: 1 }, "contract_ref must be a string or null"],
    [{ sha256: "abc" }, "sha256 must be 64 hex characters or null"],
    [{ size_bytes: "1234" }, "size_bytes must be a whole number or null"],
    [{ entities: -1 }, "entities must be a whole number or null"],
    [{ failures: [5] }, "failures must be a list of at most 200 lines, each a string or {requirement, detail}"],
    [{ failures: Array.from({ length: 201 }, () => "x") }, "failures must be a list of at most 200 lines, each a string or {requirement, detail}"],
    [{ source: "cli" }, "source must be revit, auto-publish or check"],
    [{ publish: "yes" }, "publish must be true or false"],
    [{ source: "check" }, "publish is true only for revit or auto-publish — the IFC Gate command checks a file, it publishes nothing"],
  ])("%j is a 400 before any read or row", async (over, message) => {
    await expect(recordDeliveryGate("aster-tower", { ...gate, ...over })).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it("a FAIL from a publish: one delivery_gate row with Revit's words and the full failure list, and a hold:gate row naming it", async () => {
    const r = await recordDeliveryGate("aster-tower", gate);
    expect(db.audit_log.map((x) => [x.entity_type, x.action, x.actor])).toEqual([
      ["delivery_gate", `IFC delivery gate FAIL: ${NAME}`, "Revit"],
      ["hold", `hold:gate ${NAME}`, "Revit"],
    ]);
    expect(db.audit_log[0].new_value).toEqual({ ...gate, contract_sha256: "cd".repeat(32) });
    expect(db.audit_log[1].new_value).toMatchObject({ container_name: NAME, stage: "gate", verdict: "rejected", source: "revit", sha256: SHA, size_bytes: 1234, gate_row_id: 901, proposal_row_id: null, contract_ref: "contract@1", failures_total: 2,
      failures: [{ requirement: "delivery gate", detail: "IFCPROJECT: 0 found, contract requires ≥ 1." }, { requirement: "Pset_WallCommon", detail: "Required property set 'Pset_WallCommon' not found in the file." }] });
    expect(r).toEqual({ id: 901, hash: "901".padStart(64, "0"), hold: { id: 902, hash: "902".padStart(64, "0") } });
  });

  it.each([
    ["a FAIL from the IFC Gate command (check, publish false)", { source: "check", publish: false }],
    ["a FAIL from a publish that says publish false", { publish: false }],
    ["a PASS", { result: "pass", passed: true, failures: [] }],
    ["a NOT CHECKED gate", { result: "not_checked", passed: null, contract: null, contract_ref: null, contract_source: null, contract_sha256: null, entities: null, failures: [] }],
  ])("%s writes its gate row and holds nothing", async (_what, over) => {
    const r = await recordDeliveryGate("aster-tower", { ...gate, ...over });
    expect(db.audit_log.map((x) => x.entity_type)).toEqual(["delivery_gate"]);
    expect(r).toEqual({ id: 901, hash: "901".padStart(64, "0"), hold: null });
  });

  it("a left-out nullable field is null, a key it does not know is not kept, and the actor is the claim, else Revit", async () => {
    const { contract: _c, schema: _s, ...rest } = gate;
    await recordDeliveryGate("aster-tower", { ...rest, result: "pass", passed: true, failures: [], extra: "dropped", actor: "Auto-Publish" });
    expect(db.audit_log[0]).toMatchObject({ action: `IFC delivery gate PASS: ${NAME}`, actor: "Auto-Publish" });
    expect(db.audit_log[0].new_value).toMatchObject({ contract: null, schema: null });
    expect(db.audit_log[0].new_value).not.toHaveProperty("extra");
  });

  it("a ledger that returns no row is {id: null, hash: null} for the gate and the hold — never a made-up id", async () => {
    globalThis.fetch = vi.fn(async (url, init = {}) => ((init.method || "GET") === "POST" ? new Response("", { status: 201 }) : fakeRest(url, init)));
    expect(await recordDeliveryGate("aster-tower", gate)).toEqual({ id: null, hash: null, hold: { id: null, hash: null } });
  });
});

describe("adjudicateProposal — the proposal row names the file; a refusal is held only for a registering file judged by installed standards from a caller who could register it", () => {
  it("register: the proposal row carries container_name, sha256, size_bytes and gate_row_id; an accepted verdict holds nothing", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: NAME, register: register(), gate_row_id: 812 });
    expect(db.audit_log[0].new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 1234, gate_row_id: 812 });
    expect(r).toMatchObject({ verdict: "accepted", hold: null });
    expect(rows("hold:")).toHaveLength(0);
  });

  it.each([["a string", "812"], ["zero", 0], ["a fraction", 8.5], ["negative", -3]])("a gate_row_id that is not a positive integer (%s) is not recorded", async (_what, id) => {
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: NAME, register: register(), gate_row_id: id });
    expect(db.audit_log[0].new_value).not.toHaveProperty("gate_row_id");
  });

  it("an IDS refusal from Governed Publish is held: hold:ids, source revit, the IDS failures, the proposal and gate rows named; nothing registered", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", actor: "Revit", elements: BAD, container_name: NAME, register: register(), gate_row_id: 812 });
    const [proposal, hold] = db.audit_log;
    expect(hold).toMatchObject({ entity_type: "hold", entity_id: null, action: `hold:ids ${NAME}`, actor: "Revit" });
    expect(hold.new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 1234, stage: "ids", verdict: "rejected", source: "revit", gate_row_id: 812, proposal_row_id: proposal.id, contract_ref: null, ids_ref: "ids@1", naming_ref: null, failures_total: 1,
      failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }] });
    expect(r).toMatchObject({ verdict: "rejected", version: null, hold: { id: hold.id, hash: hold.hash } });
    expect(db.container_versions).toHaveLength(0);
  });

  it("the naming judge's refusal is stage naming (Auto-Publish → auto-publish); its failures come first, then the IDS's", async () => {
    state.naming = NAMING;
    const r = await adjudicateProposal("aster-tower", { source: "Auto-Publish", elements: BAD, container_name: BAD_NAME, register: register(BAD_NAME) });
    const hold = rows("hold:")[0];
    expect(hold).toMatchObject({ action: `hold:naming ${BAD_NAME}`, new_value: { stage: "naming", source: "auto-publish", naming_ref: "naming@2", ids_ref: "ids@1", failures_total: 2 } });
    expect(hold.new_value.failures.map((f) => f.requirement)).toEqual(["naming (field count)", "Pset_DoorCommon.FireRating"]);
    expect(r.hold).toEqual({ id: hold.id, hash: hold.hash });
  });

  it("a naming refusal alone (the IDS passed) holds the naming failures only", async () => {
    state.naming = NAMING;
    await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: GOOD, container_name: BAD_NAME, register: register(BAD_NAME) });
    expect(rows("hold:")[0].new_value).toMatchObject({ stage: "naming", failures_total: 1, failures: [{ requirement: "naming (field count)" }] });
  });

  it("intake's internal argument names the file and holds it as web (source web) or intake (any other source)", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "web", actor: "web", elements: BAD, container_name: NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 77, gate_row_id: 700 } });
    expect(db.audit_log[0].new_value).toMatchObject({ container_name: NAME, sha256: SHA, size_bytes: 77, gate_row_id: 700 });
    expect(rows("hold:")[0].new_value).toMatchObject({ stage: "ids", source: "web", gate_row_id: 700, sha256: SHA, size_bytes: 77 });
    expect(r.hold).toEqual({ id: rows("hold:")[0].id, hash: rows("hold:")[0].hash });
    await adjudicateProposal("aster-tower", { source: "astra", elements: BAD, container_name: NAME }, { intake: { source: "astra", sha256: SHA, size_bytes: 77, gate_row_id: 701 } });
    expect(rows("hold:")[1].new_value).toMatchObject({ source: "intake", gate_row_id: 701 });
  });

  it("the same fields in the HTTP body are not intake's argument: no file fields, no hold", async () => {
    const r = await adjudicateProposal("aster-tower", { source: "web", elements: BAD, container_name: NAME, intake: { source: "web", sha256: SHA, size_bytes: 77, gate_row_id: 700 } });
    expect(db.audit_log[0].new_value).not.toHaveProperty("sha256");
    expect(db.audit_log[0].new_value).not.toHaveProperty("gate_row_id");
    expect(r.hold).toBeNull();
    expect(rows("hold:")).toHaveLength(0);
  });

  it("a contributor's refusal is held — a contributor could register the file", async () => {
    state.role = "contributor";
    const r = await adjudicateProposal("aster-tower", { source: "Governed Publish", elements: BAD, container_name: NAME, register: register() });
    expect(r.hold).toEqual({ id: rows("hold:")[0].id, hash: rows("hold:")[0].hash });
  });

  it.each([
    ["a plain proposal (nothing registers)", () => [{ source: "Governed Publish", elements: BAD, container_name: NAME }]],
    ["a viewer's register", () => { state.role = "viewer"; return [{ source: "Governed Publish", elements: BAD, container_name: NAME, register: register() }]; }],
    ["a signed-in non-member's register", () => { state.role = null; return [{ source: "Governed Publish", elements: BAD, container_name: NAME, register: register() }]; }],
    ["a client IDS judging an intake", () => { state.ids = null; return [{ source: "web", ids: IDS, elements: BAD, container_name: NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 1, gate_row_id: null } }]; }],
    ["a client naming ruleset judging an intake", () => [{ source: "web", naming: NAMING, elements: GOOD, container_name: BAD_NAME }, { intake: { source: "web", sha256: SHA, size_bytes: 1, gate_row_id: null } }]],
  ])("%s: rejected, its proposal row written, and no hold", async (_what, setup) => {
    const r = await adjudicateProposal("aster-tower", ...setup());
    expect(r).toMatchObject({ verdict: "rejected", hold: null });
    expect(db.audit_log[0].action).toMatch(/^Proposal rejected/);
    expect(rows("hold:")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests — RED**

```
cd WebApp && npx vitest run bridge/cde-store-hold.test.mjs bridge/ledger-write.test.mjs bridge/propose-register.test.mjs bridge/intake-logic.test.mjs
```

(Without `config/.env`, prefix `SUPABASE_URL=https://fixture.supabase.co SUPABASE_SERVICE_KEY=x SUPABASE_ANON_KEY=x` — the same note as every 5a-5c run; the four files fake `fetch` and never reach the network, and pass with or without the anon key.) Expected: 39 of cde-store-hold's 43 fail (`writeHold is not a function`, `recordDeliveryGate is not a function`, no file fields on the proposal row, `hold` undefined in the reply — the four "not a positive integer" cases pass on master, which records no `gate_row_id` at all), the six new ledger-write rows fail (the route still writes them), five intake-logic tests fail (`hold` absent, no `writeHold` call, no third argument, stage `ids` for a naming refusal) and the propose-register hold test fails:

```
 Test Files  4 failed (4)
      Tests  51 failed | 56 passed (107)
```

- [ ] **Step 3: `cde-store.mjs` — the reserved rows**

In `WebApp/bridge/cde-store.mjs`, replace

```js
/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate) and ROI (`roi:`). The open audit route may not write them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:"];

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). A reserved
 *  row (an action starting with one of RESERVED_ACTIONS, or entity_type stage_gate; case and surrounding spaces
 *  ignored) is a 400 before any read. */
export async function recordAudit(key, b) {
  const type = String(b.entity_type ?? "").trim().toLowerCase();
  const action = String(b.action ?? "").trim().toLowerCase();
  const reserved = type === "stage_gate" ? "stage_gate" : RESERVED_ACTIONS.find((p) => action.startsWith(p));
```

with

```js
/** Ledger rows Sentinel writes itself and then reads as fact (spec Decision 7): cde_transition's `state:` rows and
 *  recordVersionVerdict's `verdict:` stamps (the transition guard and ids.last_verdict read them), the stage gate
 *  (`gate:`, entity_type stage_gate), ROI (`roi:`) and the Holding Area (`hold:`, entity_type hold — phase 6a). The
 *  delivery gate's rows (entity_type delivery_gate) are written by intake and by POST /cde/:key/delivery-gate, open only
 *  to the machine credential (spec 2026-09-27 Decision 5). The open audit route may not write any of them. */
const RESERVED_ACTIONS = ["verdict:", "gate:", "roi:", "state:", "hold:"];
const RESERVED_TYPES = ["stage_gate", "hold", "delivery_gate"];

/** Record an audit event by project KEY (golden thread) — the DB trigger hash-chains it (tamper-evident). A reserved
 *  row (an action starting with one of RESERVED_ACTIONS, or an entity_type in RESERVED_TYPES; case and surrounding
 *  spaces ignored) is a 400 before any read. */
export async function recordAudit(key, b) {
  const type = String(b.entity_type ?? "").trim().toLowerCase();
  const action = String(b.action ?? "").trim().toLowerCase();
  const reserved = RESERVED_TYPES.includes(type) ? type : RESERVED_ACTIONS.find((p) => action.startsWith(p));
```

- [ ] **Step 4: `cde-store.mjs` — the Holding Area's writers (`writeHold`, `couldRegister`, the delivery-gate route's store half)**

In `WebApp/bridge/cde-store.mjs`, replace (the end of `recordAudit` and the first words of the next section's banner)

```js
    service: true, // audit_log bypasses RLS by design
  }))[0];
}

// ── Element snapshots (revision tracking) — migration 0005
```

with

```js
    service: true, // audit_log bypasses RLS by design
  }))[0];
}

// ── The Holding Area's writers (phase 6a, spec 2026-09-27 Decisions 4-6). A held file keeps no bytes: a hold is one
// reserved ledger row naming the refused file, the stage that refused it and its failures. What is on hold is derived
// from these rows (readHolding), never stored.

/** One hold failure {requirement, detail} from any judge's failure: a delivery-gate line (a string), an IDS failure
 *  {element, requirement, reason}, a naming failure {field, reason}, or one that is already {requirement, detail}. */
function holdFailure(f) {
  if (typeof f === "string") return { requirement: "delivery gate", detail: f };
  if (f?.requirement === undefined && f?.field !== undefined) return { requirement: f.field === "*" ? "naming (field count)" : `naming ${f.field}`, detail: String(f.reason ?? "") };
  const detail = f?.detail ?? (f?.element ? `${f.element}: ${f?.reason ?? ""}` : f?.reason);
  return { requirement: String(f?.requirement ?? ""), detail: String(detail ?? "") };
}

/** Write one hold row: entity_type hold, entity_id the container's uuid when a container of that name exists on the
 *  project (else null), action "hold:<stage> <container_name>", new_value {container_name, sha256, size_bytes, stage,
 *  verdict, failures (the first 50, each {requirement, detail}), failures_total, source, gate_row_id, proposal_row_id,
 *  contract_ref, ids_ref, naming_ref}. The callers decide whether a refusal is held (adjudicateProposal, the
 *  delivery-gate route, intake); this only writes it. Returns the stored row (audit()), null when none came back. */
export async function writeHold(proj, { stage, container_name, sha256, size_bytes, verdict, failures, source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref, actor }) {
  const name = String(container_name ?? "").trim();
  const found = await sb(`information_containers?project_id=eq.${proj.id}&iso_name=eq.${encodeURIComponent(name)}&select=id`);
  const all = Array.isArray(failures) ? failures : [];
  return audit(proj.id, "hold", Array.isArray(found) ? found[0]?.id ?? null : null, `hold:${stage} ${name}`, actor, null, {
    container_name: name, sha256: sha256 ?? null, size_bytes: size_bytes ?? null, stage, verdict: verdict ?? "rejected",
    failures: all.slice(0, 50).map(holdFailure), failures_total: all.length, source,
    gate_row_id: gate_row_id ?? null, proposal_row_id: proposal_row_id ?? null,
    contract_ref: contract_ref ?? null, ids_ref: ids_ref ?? null, naming_ref: naming_ref ?? null,
  });
}

/** Whether the caller could register a file on `key` (spec Decision 4's third condition): the machine credential, or a
 *  signed-in member ranked contributor or above. A viewer's or a non-member's refusal is not held. */
export async function couldRegister(key) {
  const { myRole, ROLE_RANK } = await import("./members-store.mjs");
  const role = await myRole(key);
  return role === "service" || (ROLE_RANK[role] || 0) >= ROLE_RANK.contributor;
}

const GATE_PASSED = { pass: true, fail: false, not_checked: null };           // result → passed; null is not checked
const GATE_WORDS = { pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }; // the words Revit's gate row always used
const GATE_SOURCES = ["revit", "auto-publish", "check"];

/** POST /cde/:key/delivery-gate's body → the delivery_gate row's new_value, or a 400 naming the field (spec 2026-09-27
 *  Decision 5). Pure. A nullable field left out is null; a key not listed is not kept. passed must agree with result;
 *  failures: at most 200, each a line (a string) or {requirement, detail}; publish is true only from a publish. */
export function readDeliveryGate(b = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const v = (k) => (b[k] === undefined ? null : b[k]);
  const file = typeof b.file === "string" ? b.file.trim() : "";
  if (!/^.+\.ifc$/i.test(file)) throw bad("file must be the IFC file's name, ending .ifc");
  if (!Object.keys(GATE_PASSED).includes(b.result)) throw bad("result must be pass, fail or not_checked");
  if (v("passed") !== GATE_PASSED[b.result]) throw bad("passed must be true for pass, false for fail and null for not_checked");
  for (const k of ["contract", "contract_ref", "contract_source", "schema"]) if (v(k) !== null && typeof b[k] !== "string") throw bad(`${k} must be a string or null`);
  for (const k of ["contract_sha256", "sha256"]) if (v(k) !== null && !(typeof b[k] === "string" && /^[0-9a-f]{64}$/i.test(b[k]))) throw bad(`${k} must be 64 hex characters or null`);
  for (const k of ["entities", "size_bytes"]) if (v(k) !== null && !(Number.isSafeInteger(b[k]) && b[k] >= 0)) throw bad(`${k} must be a whole number or null`);
  const failures = v("failures") ?? [];
  const line = (f) => typeof f === "string" || (!!f && typeof f === "object" && typeof f.requirement === "string" && typeof f.detail === "string");
  if (!Array.isArray(failures) || failures.length > 200 || !failures.every(line)) throw bad("failures must be a list of at most 200 lines, each a string or {requirement, detail}");
  if (!GATE_SOURCES.includes(b.source)) throw bad("source must be revit, auto-publish or check");
  if (typeof b.publish !== "boolean") throw bad("publish must be true or false");
  if (b.publish && b.source === "check") throw bad("publish is true only for revit or auto-publish — the IFC Gate command checks a file, it publishes nothing");
  return {
    file, result: b.result, passed: GATE_PASSED[b.result], contract: v("contract"), contract_ref: v("contract_ref"),
    contract_source: v("contract_source"), contract_sha256: v("contract_sha256")?.toLowerCase() ?? null, schema: v("schema"),
    entities: v("entities"), failures, sha256: v("sha256")?.toLowerCase() ?? null, size_bytes: v("size_bytes"), source: b.source, publish: b.publish,
  };
}

/** POST /cde/:key/delivery-gate (spec 2026-09-27 Decision 5): Revit's gate result, written by the bridge. Open only to
 *  the machine credential — a signed-in caller is a 403 before the body is validated, so no member can post a gate row
 *  (the open audit route refuses entity_type delivery_gate). One delivery_gate row, "IFC delivery gate PASS | FAIL |
 *  NOT CHECKED: <file>", new_value the validated body with the full failure list; a FAIL from a publish is also held
 *  (hold:gate). The gate is Revit's attestation: the bridge never sees Revit's bytes. → {id, hash, hold: {id, hash} |
 *  null}, each id and hash the stored row's (null when none came back — never a made-up id). */
export async function recordDeliveryGate(key, b = {}) {
  const { myRole } = await import("./members-store.mjs");
  if ((await myRole(key)) !== "service") throw Object.assign(new Error("the delivery-gate route is for Sentinel's machine credential"), { status: 403 });
  const g = readDeliveryGate(b);
  const proj = await ensureProject(key);
  const actor = typeof b.actor === "string" && b.actor.trim() ? b.actor.trim() : "Revit";
  const row = await audit(proj.id, "delivery_gate", null, `IFC delivery gate ${GATE_WORDS[g.result]}: ${g.file}`, actor, null, g);
  let hold = null;
  if (g.passed === false && g.publish) {
    const h = await writeHold(proj, {
      stage: "gate", container_name: g.file, sha256: g.sha256, size_bytes: g.size_bytes, verdict: "rejected", failures: g.failures,
      source: g.source, gate_row_id: row?.id ?? null, proposal_row_id: null, contract_ref: g.contract_ref, ids_ref: null, naming_ref: null, actor,
    });
    hold = { id: h?.id ?? null, hash: h?.hash ?? null };
  }
  return { id: row?.id ?? null, hash: row?.hash ?? null, hold };
}

// ── Element snapshots (revision tracking) — migration 0005
```

- [ ] **Step 5: `cde-store.mjs` — `adjudicateProposal` names the file and holds a refusal**

In `WebApp/bridge/cde-store.mjs`, replace

```js
 *  together with version_id or register is a 400: only what is installed on the project or its office stamps. Every
 *  400 comes before any ledger row. */
export async function adjudicateProposal(key, b = {}) {
  const reg = readRegister(b);
```

with

```js
 *  together with version_id or register is a 400: only what is installed on the project or its office stamps. Every
 *  400 comes before any ledger row.
 *  The Holding Area (phase 6a, spec 2026-09-27 Decisions 4 and 6): the proposal row names the file it judged —
 *  container_name, sha256 and size_bytes from register or from intake's `opts.intake` {source, sha256, size_bytes,
 *  gate_row_id} (a second parameter: no HTTP body can set it) — and gate_row_id (intake's, else b.gate_row_id when a
 *  positive integer). A rejected verdict on such a file is held — one hold:naming (the naming judge rejected) or hold:ids
 *  row — only when the IDS and the naming standard that judged are the installed ones and the caller could register the
 *  file (couldRegister). The reply's `hold` is {id, hash} of that row, or null when nothing was held. */
export async function adjudicateProposal(key, b = {}, opts = {}) {
  const reg = readRegister(b);
  const intake = opts.intake && typeof opts.intake === "object" ? opts.intake : null;
  const file = reg ? { container_name: reg.name, sha256: reg.sha256, size_bytes: reg.size_bytes }
    : intake && b.container_name ? { container_name: b.container_name, sha256: intake.sha256 ?? null, size_bytes: intake.size_bytes ?? null } : null;
  const gateRowId = [intake?.gate_row_id, b.gate_row_id].find((n) => Number.isSafeInteger(n) && n > 0) ?? null;
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
      new_value: { source: b.source ?? null, verdict, ...(downgraded ? { downgraded } : {}), summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ...namingProv, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}) },
```

with

```js
      new_value: { source: b.source ?? null, verdict, ...(downgraded ? { downgraded } : {}), summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ...namingProv, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}), ...(file || {}), ...(gateRowId ? { gate_row_id: gateRowId } : {}) },
```

In `WebApp/bridge/cde-store.mjs`, replace

```js
  } else if (b.version_id) stamp = await recordVersionVerdict(key, b.version_id, judged, trustedActor);
  return {
```

with

```js
  } else if (b.version_id) stamp = await recordVersionVerdict(key, b.version_id, judged, trustedActor);
  // A refusal of a registering file, judged by the installed standards, for a caller who could register it, is held
  // (spec 2026-09-27 Decision 4). The stage is the naming judge's when it rejected the name, else the IDS's; the
  // failures are the ones that refused. Any other refusal writes its proposal row and no hold.
  let hold = null;
  if (verdict === "rejected" && file && idsSource !== "client" && namingProv.naming_source !== "client" && (await couldRegister(key))) {
    const namingRefused = !!naming && !naming.ok && naming.enforce === "reject";
    const idsRefused = adj.verdict === "rejected" && idsEnforce === "reject";
    const row = await writeHold(proj, {
      stage: namingRefused ? "naming" : "ids", ...file, verdict,
      failures: [...(namingRefused ? naming.failures || [] : []), ...(idsRefused ? failures : [])],
      source: intake ? (intake.source === "web" ? "web" : "intake") : b.source === "Governed Publish" ? "revit" : b.source === "Auto-Publish" ? "auto-publish" : "intake",
      gate_row_id: gateRowId, proposal_row_id: audit?.id ?? null, contract_ref: null, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref, actor: trustedActor,
    });
    hold = { id: row?.id ?? null, hash: row?.hash ?? null };
  }
  return {
```

(`audit` here is `adjudicateProposal`'s own local — the proposal row — as the lines above it use it; `writeHold` calls the module's `audit()`.)

In `WebApp/bridge/cde-store.mjs`, replace

```js
    version, verdict_audit_id: stamp?.id ?? null, verdict_hash: stamp?.hash ?? null,
    agent,
```

with

```js
    version, verdict_audit_id: stamp?.id ?? null, verdict_hash: stamp?.hash ?? null, hold,
    agent,
```

- [ ] **Step 6: `intake-logic.mjs` — the gate row's id, the gate-FAIL hold, intake's own argument to the referee, the refusing stage**

In `WebApp/bridge/intake-logic.mjs`, replace

```js
  // deps.audit is 4-arg here: (key, message, actor, value) — entity_type/entity_id are the wiring
  // adapter's job (see task-5-brief.md), not this module's; the real cde.audit takes 7 args.
  await deps.audit(key, `IFC delivery gate ${{ pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }[gate.result]}: ${name}`, actor, gateRow);
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, ids_enforce: null, warned: false, audit_id: null, receipt: null, published: false };
  if (gate.result === "fail") return { ...base, verdict: "rejected", stage: "gate" };

  // G1 + G3 — the referee: naming gate on the container name, IDS on the extracted elements.
  const extracted = await deps.extractElements(bytes);
  const result = await deps.adjudicate(key, { source, actor, agent, elements: extracted.elements, container_name: name, note });
```

with

```js
  // deps.audit is 4-arg here: (key, message, actor, value) — entity_type/entity_id are the wiring
  // adapter's job (see task-5-brief.md), not this module's; the real cde.audit takes 7 args. It returns the row the
  // ledger stored (null when none came back): its id links the proposal row and the hold to this gate row (phase 6a).
  const gateRec = await deps.audit(key, `IFC delivery gate ${{ pass: "PASS", fail: "FAIL", not_checked: "NOT CHECKED" }[gate.result]}: ${name}`, actor, gateRow);
  const gateRowId = gateRec?.id ?? null;
  const base = { gate, sha256: gate.sha256, size: gate.size, naming: null, summary: null, failures: [], ids_source: null, ids_ref: null, ids_enforce: null, warned: false, audit_id: null, receipt: null, published: false, hold: null };
  if (gate.result === "fail") {
    // A refused file is held (spec 2026-09-27 Decision 4) — a ledger row, never the bytes. deps.writeHold writes the
    // hold:gate row only when the caller could register the file and answers the stored row ({} when none came back),
    // or null when it wrote nothing.
    const h = await deps.writeHold(key, {
      stage: "gate", container_name: name, sha256: gate.sha256, size_bytes: gate.size, verdict: "rejected", failures: gate.failures,
      source: source === "web" ? "web" : "intake", gate_row_id: gateRowId, proposal_row_id: null, contract_ref: gate.contract_ref ?? null, ids_ref: null, naming_ref: null, actor,
    });
    return { ...base, verdict: "rejected", stage: "gate", hold: h ? { id: h.id ?? null, hash: h.hash ?? null } : null };
  }

  // G1 + G3 — the referee: naming gate on the container name, IDS on the extracted elements. The third argument is
  // intake's own (the file's source, sha256, size and gate row): the referee names the file on the proposal row and
  // holds a refusal of it (adjudicateProposal's opts.intake — no HTTP body reaches it).
  const extracted = await deps.extractElements(bytes);
  const result = await deps.adjudicate(key, { source, actor, agent, elements: extracted.elements, container_name: name, note },
    { intake: { source, sha256: gate.sha256, size_bytes: gate.size, gate_row_id: gateRowId } });
```

In `WebApp/bridge/intake-logic.mjs`, replace

```js
  if (result.verdict === "rejected") {
    const out = { ...judged, verdict: "rejected", stage: "ids" };
```

with

```js
  if (result.verdict === "rejected") {
    // The stage that refused: the naming judge when it rejected the name, else the IDS — as the referee decided for the
    // hold row it wrote (result.hold, null when nothing was held).
    const namingRefused = result.naming?.ok === false && result.naming?.enforce === "reject";
    const out = { ...judged, verdict: "rejected", stage: namingRefused ? "naming" : "ids", hold: result.hold ?? null };
```

- [ ] **Step 7: `bcf-service.mjs` — the delivery-gate route, the comments, the `/intake` wiring**

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi: and state: actions and stage_gate rows are Sentinel's own → 400 (cde-store.mjs recordAudit).
```

with

```js
      // POST /cde/:key/audit {entity_type, action, actor?, entity_id?, old_value?, new_value?} → 201 the stored row.
      //   verdict:, gate:, roi:, state: and hold: actions and stage_gate, hold and delivery_gate rows are Sentinel's own
      //   → 400 (cde-store.mjs recordAudit).
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
        return send(res, 200, await cde.runStageGate(p1, b.stage, b.actor));
      }
```

with

```js
        return send(res, 200, await cde.runStageGate(p1, b.stage, b.actor));
      }
      // Revit's delivery gate (phase 6a, spec 2026-09-27 Decision 5): POST /cde/:key/delivery-gate {file, result, passed,
      //   contract, contract_ref, contract_source, contract_sha256, schema, entities, failures[], sha256, size_bytes,
      //   source: revit|auto-publish|check, publish} → 201 {id, hash, hold: {id, hash} | null}. The machine credential
      //   only (a signed-in caller is a 403); a bad field a 400; a FAIL with publish true is also held (hold:gate).
      if (p2 === "delivery-gate" && !p3 && req.method === "POST") return send(res, 201, await cde.recordDeliveryGate(p1, (await readBody(req)) || {}));
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      //   version_id? | register?: {name, size_bytes, sha256}, raise_bcf? }
      //   → { verdict: accepted|rejected|recorded, downgraded, summary, failures[], audit_id, version, verdict_audit_id, bcf? }.
```

with

```js
      //   version_id? | register?: {name, size_bytes, sha256}, gate_row_id?, raise_bcf? }
      //   → { verdict: accepted|rejected|recorded, downgraded, summary, failures[], audit_id, version, verdict_audit_id, hold, bcf? }.
      //   hold: a rejected register from a caller who could register it, judged by the installed standards, is held
      //   (hold:naming | hold:ids) — {id, hash} of that row, else null (phase 6a).
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
          adjudicate: (key, body) => cde.adjudicateProposal(key, body),
```

with

```js
          adjudicate: (key, body, opts) => cde.adjudicateProposal(key, body, opts),
```

In `WebApp/bridge/bcf-service.mjs`, replace

```js
          audit: async (key, action, actor, value) => { const proj = await cde.ensureProject(key); await cde.audit(proj.id, "delivery_gate", null, action, actor, null, value); },
        };
```

with

```js
          audit: async (key, action, actor, value) => { const proj = await cde.ensureProject(key); return cde.audit(proj.id, "delivery_gate", null, action, actor, null, value); },
          // A gate FAIL is held only when the caller could register the file (spec 2026-09-27 Decision 4): the stored
          // row, {} when the ledger returned none, null when nothing was written.
          writeHold: async (key, h) => ((await cde.couldRegister(key)) ? ((await cde.writeHold(await cde.ensureProject(key), h)) ?? {}) : null),
        };
```

- [ ] **Step 8: Run the tests — GREEN; the whole suite; the modules parse**

```
cd WebApp && npx vitest run bridge/cde-store-hold.test.mjs bridge/ledger-write.test.mjs bridge/propose-register.test.mjs bridge/intake-logic.test.mjs
```

Expected:

```
 ✓ bridge/intake-logic.test.mjs (15 tests)
 ✓ bridge/ledger-write.test.mjs (21 tests)
 ✓ bridge/cde-store-hold.test.mjs (43 tests)
 ✓ bridge/propose-register.test.mjs (28 tests)
 Test Files  4 passed (4)
      Tests  107 passed (107)
```

Then `cd WebApp && npm test` → `Test Files 87 passed (87)`, `Tests 1237 passed (1237)` (master: 1187 in 86); `node --check bridge/cde-store.mjs`, `node --check bridge/intake-logic.mjs` and `node --check bridge/bcf-service.mjs` print nothing; `npx tsc --noEmit -p .` → 24 errors, as on master (no TS changed). No pilot literal in the added production lines: `git diff -U0 -- WebApp/bridge/cde-store.mjs WebApp/bridge/intake-logic.mjs WebApp/bridge/bcf-service.mjs | grep -E "^\+" | grep -cE "\bBDS\b|\bAST\b"` → `0`.

- [ ] **Step 9: Commit**

```
git add WebApp/bridge/cde-store.mjs WebApp/bridge/intake-logic.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/ledger-write.test.mjs WebApp/bridge/propose-register.test.mjs WebApp/bridge/intake-logic.test.mjs WebApp/bridge/cde-store-hold.test.mjs
git commit -m "feat(bridge): the Holding Area's ledger foundation — hold: and entity_types hold and delivery_gate refused by the open audit route; writeHold (one reserved hold row naming the refused file, the stage, every failure as {requirement, detail}); POST /cde/:key/delivery-gate open only to the machine credential (the full failure list on the gate row, hold:gate on a FAIL from a publish); adjudicateProposal names the file on its proposal row (container_name, sha256, size_bytes, gate_row_id) and holds a refusal (hold:naming | hold:ids) only for a registering file judged by installed standards from a caller who could register it; intake passes its gate row id and the file through the internal opts.intake and holds a gate FAIL (phase 6a, spec Decisions 4-6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

No change. Applied as written to p6aX and measured. Step 2 RED: `Test Files  4 failed (4)`, `Tests  51 failed | 56 passed (107)`. Step 8 GREEN: 107/107. Whole suite: 1237 tests in 87 files. tsc 24. node --check clean on all three modules. Keep the note: on a CRLF checkout, run `git checkout WebApp/bridge/fixtures/canonical-cases.json` before the commit.

---

### Task 2: Bridge — the held list, derived: `holding-logic.mjs` (pure: `heldItems`, `clearedRecent`, `clearedLabel`, `NAMING_NOTE`), `readHolding` (every hold row paged to the project's total, the files and each version's newest verdict; a failed read is `not read — …`, never an empty list) and `GET /cde/:key/holding`; `dismissHold` (lead, reason required, only a held name) and `POST /cde/:key/holding/dismiss`; the tests

(Every block below was applied, as written, on top of Task 1 in `scratchpad\p6aA` (commit `task2`, every quoted current text matched exactly once) and measured: Step 2 RED = both new test files fail to load (`Failed to load url ./holding-logic.mjs`), Step 6 GREEN 19/19 (holding-logic 8, cde-store-holding 11), Step 7 the whole suite 1256 in 89 files, `node --check` clean, tsc unchanged. No TS, no C#.)

**Files:**
- Create: `WebApp/bridge/holding-logic.mjs`, `WebApp/bridge/holding-logic.test.mjs`, `WebApp/bridge/cde-store-holding.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (`readHolding` and `dismissHold` inserted after Task 1's `recordDeliveryGate`)
- Modify: `WebApp/bridge/bcf-service.mjs` (the two holding routes after Task 1's delivery-gate route)
- Read for reference: spec Decisions 7-8; `WebApp/bridge/cde-store.mjs:699-746` (`AUDIT_MAX` = 1000, `auditQuery`, `listAudit` → `{rows, total}` newest first, `total` exact — the paging reads to it), `:468-481` (`listFiles` → `[{iso_name, versions: [{id, created_at, …}]}]`, no verdicts), `:1190-1198` (`listVersionVerdictRows` → `[{id, version_id, verdict}]` newest first — the first per version is its newest verdict), `:87-109` (`ensureProject`: a non-member's 403, an unknown key's 404 — `readHolding` keeps both); `WebApp/bridge/members-store.mjs:137-142` (`requireMinRole`: the machine credential passes, a signed-in member below lead is `403 "this action requires the lead role (you are <role>)"`); `WebApp/bridge/cde-store-gate.test.mjs:14-19` (the `requireMinRole` mock the new test copies); `WebApp/bridge/bcf-service.mjs:240-249` (`send` scrubs only a 500 — the 502's message is written by the store, and carries no PostgREST text).

**Interfaces:**
- Produces (`holding-logic.mjs`, pure): `NAMING_NOTE` = `"the corrected file carries a new name — a lead dismisses this entry once it is registered"`; `clearedLabel(verdict)` → `"cleared by a registration that was not judged (recorded)"` | `"cleared by a registration with no verdict (registered outside the referee)"` (null) | `"cleared by a registration whose verdict is <v>"`; `heldItems(holdRows, dismissRows, versionsByName)` → `[{container_name, stage, verdict, failures, failures_total, source, actor, at, ledger: {id, hash}, refusals, naming_note?}]`, newest refusal first — one per container name whose newest refusal row (`hold:gate | hold:naming | hold:ids <name>`) is newer than its newest registered version and its newest `hold:dismissed <name>` row; `refusals` counts the refusals since the item opened (repeats collapse); `naming_note` on a naming-stage item; `clearedRecent(holdRows, dismissRows, versionsByName)` → the last 20 clearances by a registration whose verdict is not `accepted`, newest first, `[{container_name, by: "recorded" | "unjudged" | <verdict>, version_id, at, label}]`. `versionsByName` = `{<name>: [{id, created_at, verdict | null}]}`; rows of the other kind are ignored (the whole hold list may be passed as both); ledger rows are ordered by `at` then `id`, a version after a ledger row of the same instant.
- Produces (`cde-store.mjs`): `export async function readHolding(key)` → `{items, cleared_recent}`; a read that fails without a status → `502 "not read — the hold rows or the file list could not be read (the bridge log has the cause)"` (the cause logged, never sent); a 401/403/404 keeps its own status and words. `export async function dismissHold(key, {container_name, reason, actor?})` → `requireMinRole(key, "lead")` (403 before any read) → 400 `container_name is required — the held file's name` · `reason is required — a lead's dismissal says why, in at most 500 characters` (both trimmed) → 409 `<name> is not on hold on <key>` → `audit(proj.id, "hold", null, "hold:dismissed <name>", actor || "web", null, {container_name, reason})` → `{id, hash}` (null each when no row came back).
- Produces (`bcf-service.mjs`): `GET /cde/:key/holding` → 200 `readHolding`; `POST /cde/:key/holding/dismiss` → 201 `dismissHold` (403/400/409/502 through the block's catch).

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/holding-logic.test.mjs`:

```js
// The held list, derived (phase 6a, spec 2026-09-27 Decision 7): pure over the hold rows, the dismissal rows and the
// registered versions — open, repeats collapsed, cleared by a later registration (one not accepted is listed with its
// label), cleared by a dismissal, a naming hold that says why the corrected file does not clear it.
import { describe, it, expect } from "vitest";
import { heldItems, clearedRecent, clearedLabel, NAMING_NOTE } from "./holding-logic.mjs";

const at = (min) => `2026-09-27T10:${String(min).padStart(2, "0")}:00+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const refusal = (id, min, stage, name = "Tower.ifc", over = {}) => ({
  id, at: at(min), hash: hash(id), actor: "Revit", action: `hold:${stage} ${name}`,
  new_value: { container_name: name, stage, verdict: "rejected", failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }], failures_total: 1, source: "revit", ...over },
});
const dismissal = (id, min, name = "Tower.ifc") => ({ id, at: at(min), hash: hash(id), actor: "lead@example.test", action: `hold:dismissed ${name}`, new_value: { container_name: name, reason: "superseded by the split model" } });
const version = (id, min, verdict) => ({ id, created_at: at(min), verdict });

describe("heldItems — one item per container name whose newest refusal is newer than its newest registration and dismissal", () => {
  it("a refusal nothing followed is held: its stage, failures, source, actor, time and ledger row", () => {
    expect(heldItems([refusal(901, 1, "ids")], [], {})).toEqual([{
      container_name: "Tower.ifc", stage: "ids", verdict: "rejected", failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }], failures_total: 1,
      source: "revit", actor: "Revit", at: at(1), ledger: { id: 901, hash: hash(901) }, refusals: 1,
    }]);
  });

  it("repeats (auto-publish) collapse into one item: the newest refusal shown, the refusals since it opened counted", () => {
    const rows = [refusal(901, 1, "gate", "Tower.ifc", { source: "auto-publish" }), refusal(905, 5, "ids", "Tower.ifc", { source: "auto-publish" }), refusal(909, 9, "ids", "Tower.ifc", { source: "auto-publish" })];
    expect(heldItems(rows, [], {})).toMatchObject([{ stage: "ids", source: "auto-publish", ledger: { id: 909 }, refusals: 3 }]);
  });

  it("a later registration clears it, whatever its verdict; an earlier one does not; a refusal after a clearance opens a new item counted from 1", () => {
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, "accepted")] })).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, "recorded")] })).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, null)] })).toEqual([]);
    expect(heldItems([refusal(905, 5, "ids")], [], { "Tower.ifc": [version("v1", 1, "accepted")] })).toMatchObject([{ refusals: 1 }]);
    const rows = [refusal(901, 1, "ids"), refusal(902, 2, "ids"), refusal(906, 6, "gate")];
    expect(heldItems(rows, [], { "Tower.ifc": [version("v3", 3, "accepted")] })).toMatchObject([{ stage: "gate", ledger: { id: 906 }, refusals: 1 }]);
  });

  it("a lead's dismissal clears it; a refusal after the dismissal opens a new item", () => {
    expect(heldItems([refusal(901, 1, "ids")], [dismissal(902, 2)], {})).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids"), refusal(903, 3, "ids")], [dismissal(902, 2)], {})).toMatchObject([{ ledger: { id: 903 }, refusals: 1 }]);
  });

  it("a naming-stage item says the corrected file carries a new name — a lead dismisses it", () => {
    const [item] = heldItems([refusal(901, 1, "naming", "tower final.ifc")], [], { "ASTR26-AST.ifc": [version("v1", 2, "accepted")] });
    expect(item).toMatchObject({ container_name: "tower final.ifc", stage: "naming", naming_note: NAMING_NOTE });
    expect(NAMING_NOTE).toBe("the corrected file carries a new name — a lead dismisses this entry once it is registered");
  });

  it("names are separate, newest refusal first; other rows are ignored, so the whole hold list may be passed twice; an old row's stage comes from its action", () => {
    const all = [refusal(901, 1, "ids", "A.ifc"), refusal(902, 2, "gate", "B.ifc"), dismissal(903, 3, "C.ifc"), { id: 904, at: at(4), hash: hash(904), actor: "x", action: "hold:ids D.ifc", new_value: { container_name: "D.ifc" } }];
    expect(heldItems(all, all, {}).map((i) => [i.container_name, i.stage, i.failures_total])).toEqual([["D.ifc", "ids", 0], ["B.ifc", "gate", 1], ["A.ifc", "ids", 1]]);
  });
});

describe("clearedRecent — a clearance by a registration that was not accepted is listed and labelled", () => {
  it("recorded and verdict-less registrations that cleared an item are listed, newest first, with their label; accepted ones and dismissals are not", () => {
    const rows = [refusal(901, 1, "ids", "A.ifc"), refusal(902, 1, "ids", "B.ifc"), refusal(903, 1, "ids", "C.ifc"), refusal(904, 1, "ids", "D.ifc")];
    const versions = { "A.ifc": [version("va", 2, "recorded")], "B.ifc": [version("vb", 3, null)], "C.ifc": [version("vc", 4, "accepted")] };
    expect(clearedRecent(rows, [dismissal(905, 5, "D.ifc")], versions)).toEqual([
      { container_name: "B.ifc", by: "unjudged", version_id: "vb", at: at(3), label: "cleared by a registration with no verdict (registered outside the referee)" },
      { container_name: "A.ifc", by: "recorded", version_id: "va", at: at(2), label: "cleared by a registration that was not judged (recorded)" },
    ]);
    expect(clearedLabel("rejected")).toBe("cleared by a registration whose verdict is rejected");
  });

  it("a registration that cleared nothing is not listed; the list keeps the last 20", () => {
    expect(clearedRecent([refusal(901, 5, "ids")], [], { "Tower.ifc": [version("v1", 1, "recorded")] })).toEqual([]);
    const rows = Array.from({ length: 25 }, (_, i) => refusal(900 + i, 0, "ids", `F${i}.ifc`));
    const versions = Object.fromEntries(rows.map((_, i) => [`F${i}.ifc`, [version(`v${i}`, i + 1, "recorded")]]));
    const list = clearedRecent(rows, [], versions);
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ container_name: "F24.ifc" });
  });
});
```

Create `WebApp/bridge/cde-store-holding.test.mjs`:

```js
// GET /cde/:key/holding and POST /cde/:key/holding/dismiss (phase 6a, spec 2026-09-27 Decisions 7-8): readHolding reads
// every hold row (paged to the project's total), the files and their versions' newest verdicts, and derives the list; a
// failed read is "not read — …", never an empty list. dismissHold is lead-only, needs a reason, and dismisses only a
// held name. globalThis.fetch is a fake PostgREST over in-memory tables; the caller's role is set per test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
  return { role: "lead" };
});
vi.mock("./members-store.mjs", async (orig) => ({
  ...(await orig()),
  requireMinRole: vi.fn(async (_key, min) => {
    if (!["lead", "owner", "service"].includes(state.role)) throw Object.assign(new Error(`this action requires the ${min} role (you are ${state.role})`), { status: 403 });
  }),
}));

import { readHolding, dismissHold } from "./cde-store.mjs";
import { NAMING_NOTE } from "./holding-logic.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const C = "cccccccc-0000-4000-8000-000000000001";
const at = (min) => `2026-09-27T10:${String(min).padStart(2, "0")}:00+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const hold = (id, min, stage, name = "Tower.ifc") => ({ id, at: at(min), hash: hash(id), project_id: P, entity_type: "hold", entity_id: null, action: `hold:${stage} ${name}`, actor: "Revit", new_value: { container_name: name, stage, verdict: "rejected", failures: [], failures_total: 0, source: "revit" } });
const verdictRow = (id, versionId, verdict) => ({ id, at: at(0), hash: hash(id), project_id: P, entity_type: "file_version", entity_id: versionId, action: `verdict:${verdict}`, actor: "Revit", new_value: {} });

let db, calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  state.role = "lead";
  db = { projects: [{ id: P, key: "aster-tower" }], information_containers: [], container_versions: [], audit_log: [] };
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ table, method, query: u.search, body });
    const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers });
    const q = (k) => u.searchParams.get(k);
    if (table === "projects") return json(db.projects.filter((p) => p.key === q("key")?.replace(/^eq\./, "")));
    if (table === "information_containers")
      return json(db.information_containers.map((c) => ({ ...c, container_versions: db.container_versions.filter((v) => v.container_id === c.id) })));
    if (table === "audit_log" && method === "GET") {
      const like = q("action")?.replace(/^like\./, "").replace(/\*$/, "");
      const all = db.audit_log.filter((r) => r.entity_type === q("entity_type")?.replace(/^eq\./, "") && (!like || r.action.startsWith(like))).sort((a, b) => b.id - a.id);
      const offset = Number(q("offset") || 0), limit = Number(q("limit") || all.length);
      const page = all.slice(offset, offset + limit);
      return json(page, 200, { "content-range": page.length ? `${offset}-${offset + page.length - 1}/${all.length}` : `*/${all.length}` });
    }
    if (table === "audit_log" && method === "POST") {
      const row = { id: 950 + db.audit_log.length, at: at(50), hash: hash(950 + db.audit_log.length), ...body };
      db.audit_log.push(row);
      return json([row], 201);
    }
    return json([]);
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("readHolding — derived from every hold row and the registered versions", () => {
  it("pages the hold rows to the project's total and collapses the repeats", async () => {
    for (let i = 0; i < 1001; i++) db.audit_log.push(hold(1 + i, 1, "ids"));
    const r = await readHolding("aster-tower");
    expect(r.items).toMatchObject([{ container_name: "Tower.ifc", stage: "ids", refusals: 1001 }]);
    expect(calls.filter((c) => c.table === "audit_log" && /entity_type=eq\.hold/.test(c.query)).map((c) => new URLSearchParams(c.query).get("offset"))).toEqual(["0", "1000"]);
  });

  it("a registration after the refusal clears it; a recorded one is listed with its label, by the version's newest verdict", async () => {
    db.audit_log.push(hold(901, 1, "ids", "Tower.ifc"), hold(902, 1, "gate", "Annex.ifc"), hold(903, 1, "naming", "old name.ifc"), verdictRow(904, "v-annex", "recorded"), verdictRow(905, "v-tower", "rejected"), verdictRow(906, "v-tower", "accepted"));
    db.information_containers.push({ id: C, iso_name: "Tower.ifc" }, { id: "c2", iso_name: "Annex.ifc" });
    db.container_versions.push({ id: "v-tower", container_id: C, created_at: at(2) }, { id: "v-annex", container_id: "c2", created_at: at(3) });
    const r = await readHolding("aster-tower");
    expect(r.items).toEqual([expect.objectContaining({ container_name: "old name.ifc", stage: "naming", naming_note: NAMING_NOTE, ledger: { id: 903, hash: hash(903) } })]);
    expect(r.cleared_recent).toEqual([{ container_name: "Annex.ifc", by: "recorded", version_id: "v-annex", at: at(3), label: "cleared by a registration that was not judged (recorded)" }]);
  });

  it("a read that fails is a 502 'not read — …', never an empty list; an unknown key stays a 404", async () => {
    const f = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init = {}) => (String(url).includes("audit_log") ? new Response("{\"code\":\"XX000\"}", { status: 500 }) : f(url, init)));
    await expect(readHolding("aster-tower")).rejects.toMatchObject({ status: 502, message: "not read — the hold rows or the file list could not be read (the bridge log has the cause)" });
    globalThis.fetch = f;
    await expect(readHolding("nowhere")).rejects.toMatchObject({ status: 404 });
  });
});

describe("dismissHold — a lead clears a held item with a reason on the ledger", () => {
  it("a contributor is refused before any read", async () => {
    state.role = "contributor";
    await expect(dismissHold("aster-tower", { container_name: "Tower.ifc", reason: "split" })).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ reason: "split" }, "container_name is required — the held file's name"],
    [{ container_name: "  ", reason: "split" }, "container_name is required — the held file's name"],
    [{ container_name: "Tower.ifc" }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
    [{ container_name: "Tower.ifc", reason: "   " }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
    [{ container_name: "Tower.ifc", reason: "x".repeat(501) }, "reason is required — a lead's dismissal says why, in at most 500 characters"],
  ])("%j is a 400 before any read", async (body, message) => {
    await expect(dismissHold("aster-tower", body)).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it("a name that is not on hold is a 409 and nothing is written", async () => {
    await expect(dismissHold("aster-tower", { container_name: "Tower.ifc", reason: "split" })).rejects.toMatchObject({ status: 409, message: "Tower.ifc is not on hold on aster-tower" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("a held name: one hold:dismissed row with the reason, its id and hash in the reply, and the item is gone; the refusal row stays", async () => {
    db.audit_log.push(hold(901, 1, "naming", "tower final.ifc"));
    const r = await dismissHold("aster-tower", { container_name: " tower final.ifc ", reason: " registered as ASTR26-AST.ifc ", actor: "lead@example.test" });
    const row = db.audit_log.at(-1);
    expect(row).toMatchObject({ project_id: P, entity_type: "hold", entity_id: null, action: "hold:dismissed tower final.ifc", actor: "lead@example.test", new_value: { container_name: "tower final.ifc", reason: "registered as ASTR26-AST.ifc" } });
    expect(r).toEqual({ id: row.id, hash: row.hash });
    expect((await readHolding("aster-tower")).items).toEqual([]);
    expect(db.audit_log.map((x) => x.action)).toEqual(["hold:naming tower final.ifc", "hold:dismissed tower final.ifc"]);
  });
});
```

- [ ] **Step 2: Run the tests — RED**

```
cd WebApp && npx vitest run bridge/holding-logic.test.mjs bridge/cde-store-holding.test.mjs
```

Expected: both files fail to load — `Error: Failed to load url ./holding-logic.mjs (resolved id: ./holding-logic.mjs) … Does the file exist?` (the store test imports `NAMING_NOTE` from it):

```
 Test Files  2 failed (2)
      Tests  no tests
```

- [ ] **Step 3: Create `WebApp/bridge/holding-logic.mjs`**

```js
// The Holding Area (phase 6a, spec 2026-09-27 Decision 7): what is on hold is derived from the ledger, never stored.
// Pure: the refusal rows (hold:gate | hold:naming | hold:ids), the dismissal rows (hold:dismissed) and the registered
// versions of each container name go in; the held items, and the recent clearances by a registration nobody judged as
// accepted, come out. One timeline per name: a refusal opens an item (or repeats into it), a dismissal or a registration
// of that name closes it — whatever verdict the registration carries; a registration that was not accepted says so.

export const NAMING_NOTE = "the corrected file carries a new name — a lead dismisses this entry once it is registered";
const REFUSAL = /^hold:(gate|naming|ids) /;
const DISMISSAL = "hold:dismissed ";
const LAST = Number.MAX_SAFE_INTEGER;   // a version sorts after a ledger row of the same instant: it clears what came before

/** How a registration that was not accepted cleared an item: the words the Holding Area prints for it. */
export const clearedLabel = (verdict) => (verdict === "recorded"
  ? "cleared by a registration that was not judged (recorded)"
  : verdict ? `cleared by a registration whose verdict is ${verdict}` : "cleared by a registration with no verdict (registered outside the referee)");

/** holdRows / dismissRows: audit rows {id, at, hash, actor, action, new_value}; versionsByName: {<container name>:
 *  [{id, created_at, verdict}]} (verdict: the version's newest verdict word, or null). Rows of the other kind are
 *  ignored, so the whole hold list may be passed as both. */
function walk(holdRows, dismissRows, versionsByName) {
  const lines = new Map();
  const add = (name, e) => { if (!lines.has(name)) lines.set(name, []); lines.get(name).push(e); };
  const nameOf = (r) => String(r?.new_value?.container_name ?? "");
  for (const r of holdRows || []) if (REFUSAL.test(String(r.action))) add(nameOf(r), { t: Date.parse(r.at), id: r.id, row: r });
  for (const r of dismissRows || []) if (String(r.action).startsWith(DISMISSAL)) add(nameOf(r), { t: Date.parse(r.at), id: r.id, dismissed: true });
  for (const [name, list] of lines) for (const v of versionsByName?.[name] || []) list.push({ t: Date.parse(v.created_at), id: LAST, version: v });
  const items = [], cleared = [];
  for (const [name, list] of lines) {
    list.sort((a, b) => a.t - b.t || a.id - b.id);
    let open = null;
    for (const e of list) {
      if (e.row) { open = { row: e.row, refusals: (open?.refusals ?? 0) + 1 }; continue; }
      if (open && e.version && e.version.verdict !== "accepted")
        cleared.push({ container_name: name, by: e.version.verdict ?? "unjudged", version_id: e.version.id, at: e.version.created_at, label: clearedLabel(e.version.verdict) });
      open = null;
    }
    if (open) {
      const r = open.row, v = r.new_value || {};
      const stage = v.stage ?? REFUSAL.exec(String(r.action))[1];
      items.push({
        container_name: name, stage, verdict: v.verdict ?? "rejected",
        failures: Array.isArray(v.failures) ? v.failures : [],
        failures_total: Number.isInteger(v.failures_total) ? v.failures_total : Array.isArray(v.failures) ? v.failures.length : 0,
        source: v.source ?? null, actor: r.actor ?? null, at: r.at, ledger: { id: r.id ?? null, hash: r.hash ?? null },
        refusals: open.refusals, ...(stage === "naming" ? { naming_note: NAMING_NOTE } : {}),
      });
    }
  }
  const newest = (a, b) => Date.parse(b.at) - Date.parse(a.at);
  return { items: items.sort(newest), cleared: cleared.sort(newest) };
}

/** The held items, newest refusal first: one per container name whose newest refusal row is newer than both its newest
 *  registered version and its newest dismissal — {container_name, stage, verdict, failures, failures_total, source,
 *  actor, at, ledger: {id, hash}, refusals (since the item opened; repeats collapse into one item), naming_note on a
 *  naming-stage item}. */
export const heldItems = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).items;

/** The last 20 clearances by a registration that was not accepted, newest first: {container_name, by: "recorded" |
 *  "unjudged" | <the verdict>, version_id, at, label}. A clearance by an accepted registration or a dismissal is not
 *  listed: the version's verdict and the dismissal row say it. */
export const clearedRecent = (holdRows, dismissRows, versionsByName) => walk(holdRows, dismissRows, versionsByName).cleared.slice(0, 20);
```

- [ ] **Step 4: `cde-store.mjs` — `readHolding` and `dismissHold`**

In `WebApp/bridge/cde-store.mjs`, replace (the end of Task 1's `recordDeliveryGate` and the next section's banner)

```js
  return { id: row?.id ?? null, hash: row?.hash ?? null, hold };
}

// ── Element snapshots (revision tracking) — migration 0005
```

with

```js
  return { id: row?.id ?? null, hash: row?.hash ?? null, hold };
}

/** GET /cde/:key/holding (spec 2026-09-27 Decision 7): the held list, derived — {items, cleared_recent} from
 *  holding-logic.mjs over every hold row (entity_type hold, paged through listAudit to the project's total), the
 *  project's files and their versions (listFiles) and each version's newest verdict (listVersionVerdictRows). A read
 *  that fails is a 502 "not read — …", never an empty list; a non-member's 403 and an unknown key's 404 stay theirs. */
export async function readHolding(key) {
  const { heldItems, clearedRecent } = await import("./holding-logic.mjs");
  let rows = [], files, verdicts;
  try {
    // ponytail: offset paging, newest first — a hold written between two pages is read twice (one refusal counted
    // twice); page by id (id=lt.<last id>) if a project ever writes holds that fast.
    for (;;) {
      const page = await listAudit(key, { entity_type: "hold", limit: AUDIT_MAX, offset: rows.length });
      rows = rows.concat(page.rows);
      if (!page.rows.length || rows.length >= page.total) break;
    }
    [files, verdicts] = await Promise.all([listFiles(key), listVersionVerdictRows(key)]);
  } catch (e) {
    if (e?.status) throw e;
    console.error(`[holding] ${key}: ${e?.message || e}`);
    throw Object.assign(new Error("not read — the hold rows or the file list could not be read (the bridge log has the cause)"), { status: 502 });
  }
  const verdictOf = new Map();
  for (const r of verdicts) if (!verdictOf.has(r.version_id)) verdictOf.set(r.version_id, r.verdict); // newest first
  const versionsByName = {};
  for (const f of files) (versionsByName[f.iso_name] ||= []).push(...f.versions.map((v) => ({ id: v.id, created_at: v.created_at, verdict: verdictOf.get(v.id) ?? null })));
  return { items: heldItems(rows, rows, versionsByName), cleared_recent: clearedRecent(rows, rows, versionsByName) };
}

/** POST /cde/:key/holding/dismiss {container_name, reason} (spec 2026-09-27 Decision 8): a lead clears a held item —
 *  lead or owner, the machine credential passes (requireMinRole); a reason is required (≤ 500); only a name that is on
 *  hold (409 otherwise). One hold:dismissed row, new_value {container_name, reason}; the refusal rows stay. → {id,
 *  hash} of that row (null when none came back). */
export async function dismissHold(key, b = {}) {
  const { requireMinRole } = await import("./members-store.mjs");
  await requireMinRole(key, "lead");
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const name = typeof b.container_name === "string" ? b.container_name.trim() : "";
  if (!name) throw bad("container_name is required — the held file's name");
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason || reason.length > 500) throw bad("reason is required — a lead's dismissal says why, in at most 500 characters");
  if (!(await readHolding(key)).items.some((i) => i.container_name === name)) throw Object.assign(new Error(`${name} is not on hold on ${key}`), { status: 409 });
  const proj = await ensureProject(key);
  const row = await audit(proj.id, "hold", null, `hold:dismissed ${name}`, b.actor || "web", null, { container_name: name, reason });
  return { id: row?.id ?? null, hash: row?.hash ?? null };
}

// ── Element snapshots (revision tracking) — migration 0005
```

- [ ] **Step 5: `bcf-service.mjs` — the two holding routes**

In `WebApp/bridge/bcf-service.mjs`, replace (Task 1's line)

```js
      if (p2 === "delivery-gate" && !p3 && req.method === "POST") return send(res, 201, await cde.recordDeliveryGate(p1, (await readBody(req)) || {}));
```

with

```js
      if (p2 === "delivery-gate" && !p3 && req.method === "POST") return send(res, 201, await cde.recordDeliveryGate(p1, (await readBody(req)) || {}));
      // The Holding Area (phase 6a, spec 2026-09-27 Decisions 7-8): GET /cde/:key/holding → 200 {items, cleared_recent},
      //   derived from the hold rows and the registered versions; a read that fails is a 502 "not read — …", never an
      //   empty list. POST /cde/:key/holding/dismiss {container_name, reason} → 201 {id, hash}: lead only (403), a reason
      //   required (400), a name on hold (409) — one hold:dismissed row (cde-store.mjs readHolding, dismissHold).
      if (p2 === "holding" && !p3 && req.method === "GET") return send(res, 200, await cde.readHolding(p1));
      if (p2 === "holding" && p3 === "dismiss" && !p4 && req.method === "POST") return send(res, 201, await cde.dismissHold(p1, (await readBody(req)) || {}));
```

- [ ] **Step 6: Run the tests — GREEN**

```
cd WebApp && npx vitest run bridge/holding-logic.test.mjs bridge/cde-store-holding.test.mjs
```

Expected:

```
 ✓ bridge/holding-logic.test.mjs (8 tests)
 ✓ bridge/cde-store-holding.test.mjs (11 tests)
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

- [ ] **Step 7: The whole suite, tsc, the modules parse**

`cd WebApp && npm test` → `Test Files 89 passed (89)`, `Tests 1256 passed (1256)` (after Task 1: 1237 in 87; master 1187 in 86). `node --check bridge/holding-logic.mjs`, `node --check bridge/cde-store.mjs`, `node --check bridge/bcf-service.mjs` print nothing. `npx tsc --noEmit -p .` → 24 errors, as on master. No pilot literal added: `git diff -U0 -- WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs | grep -E "^\+" | grep -cE "\bBDS\b|\bAST\b"` → `0`, and `grep -cE "\bBDS\b|\bAST\b" bridge/holding-logic.mjs` → `0`.

- [ ] **Step 8: Commit**

```
git add WebApp/bridge/holding-logic.mjs WebApp/bridge/holding-logic.test.mjs WebApp/bridge/cde-store-holding.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(bridge): the held list, derived — holding-logic.mjs (pure: one item per name whose newest refusal is newer than its newest registration and dismissal, repeats collapsed with their count, a naming hold that says why a corrected file does not clear it, the last 20 clearances by a registration that was not accepted with their label); GET /cde/:key/holding (every hold row paged to the total, the files and their newest verdicts; a failed read is 'not read — …', never an empty list); POST /cde/:key/holding/dismiss (lead, a reason, only a held name; one hold:dismissed row) (phase 6a, spec Decisions 7-8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

No change. Applied as written on top of Task 1 and measured. RED: both new files fail to load. GREEN: 19/19. Whole suite: 1256 tests in 89 files. tsc 24. Beyond the pin, and accepted: cleared_recent also lists `unjudged` and re-stamp clearances, each with a `label`; dismissHold answers 409 for a name that is not on hold. Tasks 3 and 5 are amended to consume both.

---

### Task 3: Web — the Versions upload goes through Governed Intake (`POST /cde/:key/intake?name=…&source=web&revision=v{N+1}&note=uploaded via web by <who>` — judged before anything is stored: accepted or recorded is uploaded and registered with its verdict, rejected uploads nothing and is held) and an "On hold (n)" section built like "Archived (n)" (`GET /cde/:key/holding`: each item's stage, failures, the refusal's `ledger #id · receipt …`, the resubmit action per source, a lead's inline "Dismiss…"; a list that was not read says `not read — …`); `holding.ts` with its test

(Every block below was applied, as written, to a `git archive` of master c7dcbf6 at `scratchpad\p6aB` (WebApp, docs, config, demo, tools and SentinelAddin extracted — CRLF like the working tree — with the working tree's `node_modules` junctioned in; the applier `scratchpad\p6aB_t3_pairs.py` + `p6aB_apply_multi.py`, every quoted old text matched exactly once) and measured: Step 1 RED `Test Files  1 failed (1)` (the module missing), GREEN `Tests  15 passed (15)`; after Step 2 the type checker prints 24 errors on the archive — the working tree's set less `files-panel.ts(109,57)` (it went with `sha256Hex`) plus the archive-only `src/main.ts: Cannot find module './generated/fragments-worker'` (untracked, generated by `npm run build`) — so **23 in the working tree**, none in `files-panel.ts`, `holding.ts` or `holding.test.ts`; the whole suite `Test Files  87 passed (87)`, `Tests  1202 passed (1202)` (master 1187 in 86, measured on the same archive; the archive run needs `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` set to any value for `bridge/cde-store-actor.test.mjs`, which the working tree's `config/.env` provides). These are Task-3-alone numbers; in execution order the suite is Task 2's total plus 15 in one more file. No bridge file is touched: this task consumes Tasks 1-2 exactly as pinned. The test environment is `node` (no DOM), so, as `stage-gate.ts` and `cde-transition.ts` did, the bridge calls and every line the panel prints live in a DOM-free module with a mocked-`bfetch` test, and `files-panel.ts` only renders them.)

**Files:**
- Create: `WebApp/src/setups/holding.ts`, `WebApp/src/setups/holding.test.ts`
- Modify: `WebApp/src/setups/files-panel.ts` (twelve replacements: the header comment, the imports, the Holding Area state, `sha256Hex` deleted, `load()` (the role asked first, the holding read, the status line), `render()` (no early return without files; the section appended and wired), `heldSection`/`heldCard`/`dismissHeld` added before `fileCard`, `uploadNewVersion` replaced whole, `gateUpload` storing the role, the init's `gateUpload` call and `onActiveProjectChange`)
- Not modified, checked: `WebApp/src/setups/model-panel.ts:660-695` (the modeller bake still posts to `/ifc` — unjudged, out of scope, spec Decision 3; after this task `grep -rn "/ifc?" src --include=*.ts` finds only it, `:669`); `WebApp/bridge/bcf-service.mjs:944-953` (`POST /ifc` stays for the bake); `WebApp/src/main.ts:253`, `:263` (`filesPanel` docked as the project space's "Project Files" tab — unchanged); `WebApp/src/setups/stage-gate.ts` (`ledgerLine` reused as is); `WebApp/src/setups/my-role.ts` (`canGovernRole` reused as is); `WebApp/src/setups/guide-panel.ts` (no Versions or upload topic).
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md:25-28` (the unjudged Versions upload), `:67-72` (the 6a definition of done), `:85-109` (Decisions 2-4), `:126-143` (Decisions 7-9), `:198-200`, `:211-217`; `WebApp/src/setups/files-panel.ts:1-549` whole on master (`whoami` :71-73, `status` :90, `api` :92-97, `sha256Hex` :107-112 — its only caller is the upload, and it is the working tree's one `files-panel.ts` type error, `(109,57) TS2345`; `load` :114-148; `render` :168-227 — the early return :169-172, the Archived toggle :176-181; `fileCard` :229; `uploadNewVersion` :503-529 — `/ifc` then `/files`, and its status line was overwritten by `load()`'s; `gateUpload` :534-540; the init :541-547); `WebApp/src/setups/stage-gate.ts:31-39` (`ledgerLine`: `ledger #<id> · receipt <16 hex>…` only with an integer id and a lowercase 64-hex hash, else `not confirmed — the bridge returned no chain hash`); `WebApp/src/setups/stage-gate.test.ts:1-10` and `cde-transition.test.ts:1-20` (the mocked-`bfetch` pattern); `WebApp/src/setups/my-role.ts:7-21` (`myRole` fails closed to `viewer`; `canEditRole`, `canGovernRole` — `service` passes both); `WebApp/src/setups/bridge-fetch.ts:18-29`; `WebApp/bridge/bcf-service.mjs:1188-1230` (the intake route: `name`, `source`, `actor`, `revision`, `note`, `raise_bcf` arrive as query parameters, the body is the raw bytes; no role check; the reply is `runIntake`'s plus `manifest`), `:251-253` (CORS allows `Content-Type` and `Authorization`); `WebApp/bridge/intake-logic.mjs:10-92` (`actor` falls back to `source`; the reply's `stage` is `gate` for a gate FAIL, `ids` for every refusal after the gate — a naming reject included — `published` or `upload_failed`; `note` says what judged; the platform upload runs only after an accepted or recorded verdict); `WebApp/bridge/cde-store.mjs:1026-1030` (`judgeContainerName`: `{ok, failures, enforce}` or null), `:1110` (a naming reject is `!naming.ok && naming.enforce === "reject"`), `:1151-1156` (`audit_id`, `receipt` — the proposal row), `WebApp/bridge/agent-provenance.mjs:59-75` (`buildReceipt`: `ledger_hash` is the row's own hash); `WebApp/bridge/artefact-store.mjs:305-306` (the none label `none — not installed for <key> or its office`); `WebApp/bridge/bridge-auth.mjs:20-39` (the actor is the JWT's e-mail when signed in); `WebApp/vitest.config.ts` (`environment: "node"`, `src/**/*.test.ts`); `WebApp/tsconfig.json` (`include: ["src"]` — tests are type-checked).

**Interfaces:**
- Consumes (Tasks 1-2, as pinned): `POST /cde/:key/intake?…` → `runIntake`'s reply plus `hold: {id, hash} | null`; `GET /cde/:key/holding` → 200 `{items: [{container_name, stage: "gate" | "naming" | "ids", verdict, failures: [{requirement, detail}], source: "revit" | "auto-publish" | "web" | "intake", actor, at, ledger: {id, hash}, refusals, naming_note?}], cleared_recent: [{container_name, by: "recorded", version_id, at}]}`, a failed read 502 `{message: "not read — <reason>"}`; `POST /cde/:key/holding/dismiss {container_name, reason}` → 201 `{id, hash}`, below lead 403 `this action requires the lead role (you are <role>)`, a blank reason 400.
- Produces (`WebApp/src/setups/holding.ts`):
  - types `HoldStage`, `HoldSource`, `LedgerRef {id, hash}`, `HeldItem`, `ClearedItem`, `Holding {items, cleared_recent}`, `IntakeReply` (the fields read);
  - `uploadThroughIntake(baseUrl, key, file: Blob, {name, revision, who}) → Promise<IntakeReply>` — one POST, `…/cde/<key>/intake?name=<enc>&source=web&revision=<enc>&note=uploaded%20via%20web%20by%20<enc who>`, `Content-Type: application/x-step`, the body the File itself; never `/ifc` or `/files`; a non-2xx throws the bridge's `message`, else `HTTP <status>`;
  - `intakeLine(name, reply) → string` — accepted: `Uploaded <name> <revision> — accepted (<ids_ref>: <passing>/<in_scope> passed)[ · <note>] · <ledgerLine(proposal row)>`; recorded: `Uploaded <name> <revision> — recorded, not judged[ · <note>] · <ledgerLine>`; `upload_failed`: `Judged <verdict>, not uploaded — <error>. Nothing was registered · <ledgerLine>`; rejected: `Not uploaded — <the delivery gate | the naming standard | the IDS> refused <name> (<n> failure(s)) · On hold · <ledgerLine(hold)>`, or `· not on hold — the bridge returned no hold row` when the bridge returned none. The judge is the gate when `stage` is `gate`, else the naming standard when `naming.ok === false` under `enforce: "reject"` (the bridge's own rule), else the IDS; `<n>` counts that judge's failures;
  - `readHolding(baseUrl, key) → Promise<Holding>` — throws `not read — <the bridge's message | HTTP <status> | the transport error | the bridge answered without a list>` (a message already starting `not read — ` is kept as is);
  - `dismissHold(baseUrl, key, containerName, reason) → Promise<LedgerRef>` — the reason trimmed; blank → throws `a dismissal needs a reason — the ledger records it` and sends nothing; a refusal throws the bridge's words;
  - `resubmitFor(source)` → `{upload: true, text: "Upload the corrected file"}` for `web` and `intake`; `{upload: false, text: "Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again."}` for `revit`; `{upload: false, text: "Fix the model in Revit and save — auto-publish judges it again (or run Governed Publish)."}` for `auto-publish`;
  - `STAGE_WORDS` (`delivery gate`, `naming standard`, `IDS`), `SOURCE_WORDS` (`Governed Publish`, `auto-publish`, `web upload`, `intake`), `CLEARED_BY_RECORDED = "cleared by a registration that was not judged (recorded)"`.
- Produces (`WebApp/src/setups/files-panel.ts`): **＋ Upload version** (contributor and up, as today) → `Judging <name> — nothing is stored unless the referee accepts or records it…` → `uploadThroughIntake` → the panel reloads, then the status line is `intakeLine(…)` (set after the reload, so it stays); a rejection opens the section. Every load asks the role, reads `GET /cde/:key/holding` and ends its status line `· <k> on hold.` or `· on hold: not read — <why>.` Below the files (and the Archived toggle), when anything is held or recently cleared: `▸ On hold (<k>)` (amber, collapsed by default, like Archived) → one card per item — the name, `refused by the <STAGE_WORDS>`, `<SOURCE_WORDS> · <actor> · <when>[ · refused <n> times since it went on hold]`, each failure `✗ <requirement> — <detail>`, the `naming_note` in amber, `ledgerLine(item.ledger)`, the resubmit action (**Upload the corrected file** opens the picker for a contributor and up — `a contributor or above uploads the corrected file` otherwise — or the Revit text), and for a lead, owner or the machine path **Dismiss…** → an inline field (max 500) with **Dismiss with this reason** and **Cancel** (never `window.prompt`) → `✓ Dismissed <name> from On hold · <ledgerLine(row)>` or `Not dismissed — <why>`; then one line per recent clearance `✓ <name> — cleared by a registration that was not judged (recorded) · <when>`. A failed read renders `On hold: not read — <why>` in place of the section, never an empty one. A project with no file yet still shows its held files.

- [ ] **Step 1: `holding.ts` and its test (the test first, RED = one failed file)**

Create `WebApp/src/setups/holding.test.ts`:

```ts
// The Versions upload goes through Governed Intake and the Holding Area is read, never assumed: an accepted or recorded
// file is uploaded and registered by the bridge, a rejected one uploads nothing and is held; a list that was not read
// says so; a lead's dismissal carries a reason; a ledger line names a row only with an id and a 64-hex hash.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { uploadThroughIntake, intakeLine, readHolding, dismissHold, resubmitFor, type IntakeReply, type Holding } from "./holding";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "6e7f8091a2b3c4d5".padEnd(64, "0");
const HOLD = "a1b2c3d4e5f60718".padEnd(64, "9");
const reply = (over: Partial<IntakeReply> = {}): IntakeReply => ({
  verdict: "accepted", stage: "published", gate: { failures: [] }, naming: null, failures: [],
  summary: { in_scope: 3, passing: 3 }, ids_ref: "ids@1", audit_id: 812, receipt: { ledger_hash: HASH },
  version: { revision: "v2" }, hold: null, ...over,
});
const rejected = (over: Partial<IntakeReply>): IntakeReply =>
  reply({ verdict: "rejected", stage: "ids", version: null, hold: { id: 915, hash: HOLD }, ...over });

describe("uploadThroughIntake — POST /cde/:key/intake", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the file once, to intake only, with the name, source=web, the next revision and who uploaded it", async () => {
    bfetch.mockResolvedValue(res(200, reply()));
    const file = new Blob(["ISO-10303-21;"]);
    expect(await uploadThroughIntake("http://b/", "aster-tower", file, { name: "B12-W.ifc", revision: "v2", who: "lead@example.com" })).toEqual(reply());
    expect(bfetch).toHaveBeenCalledTimes(1);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/aster-tower/intake?name=B12-W.ifc&source=web&revision=v2&note=uploaded%20via%20web%20by%20lead%40example.com");
    expect(bfetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: file });
  });

  it("a refusal before any judgement throws the bridge's words; one without words names the status", async () => {
    bfetch.mockResolvedValue(res(400, { message: "name must be the container's ISO name ending in .ifc" }));
    await expect(uploadThroughIntake("http://b", "k", new Blob(["x"]), { name: "a.txt", revision: "v1", who: "web" })).rejects.toThrow("name must be the container's ISO name ending in .ifc");
    bfetch.mockResolvedValue(res(502, null));
    await expect(uploadThroughIntake("http://b", "k", new Blob(["x"]), { name: "a.ifc", revision: "v1", who: "web" })).rejects.toThrow("HTTP 502");
  });
});

describe("intakeLine — what the upload did", () => {
  it("accepted: uploaded and registered, the IDS that judged, the proposal row", () => {
    expect(intakeLine("B12-W.ifc", reply())).toBe("Uploaded B12-W.ifc v2 — accepted (ids@1: 3/3 passed) · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });

  it("recorded: says it was not judged and carries the bridge's note", () => {
    const r = reply({ verdict: "recorded", ids_ref: null, version: { revision: "v1" }, note: "No contract and no IDS installed for b12-hold or its office — nothing was judged." });
    expect(intakeLine("B12-R.ifc", r)).toBe("Uploaded B12-R.ifc v1 — recorded, not judged · No contract and no IDS installed for b12-hold or its office — nothing was judged. · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });

  it("a gate FAIL uploads nothing and is held, with the hold row's line", () => {
    const r = rejected({ stage: "gate", gate: { failures: ["Schema IFC2X3 — the contract asks IFC4", "Proxy ratio 12% — the cap is 5%"] }, audit_id: null, receipt: null });
    expect(intakeLine("B12-G.ifc", r)).toBe("Not uploaded — the delivery gate refused B12-G.ifc (2 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("a naming reject is the naming standard's (rejected under enforce reject), even though intake's stage says ids", () => {
    const r = rejected({ naming: { ok: false, enforce: "reject", failures: [{ field: "*", reason: "expected 11 '-'-separated fields" }] }, failures: [{}, {}] });
    expect(intakeLine("B12-N.ifc", r)).toBe("Not uploaded — the naming standard refused B12-N.ifc (1 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("an IDS reject names the IDS and counts its failures; a naming warning does not make it a naming refusal", () => {
    const r = rejected({ naming: { ok: false, enforce: "warn", failures: [{}] }, failures: [{}, {}, {}, {}] });
    expect(intakeLine("B12-W.ifc", r)).toBe("Not uploaded — the IDS refused B12-W.ifc (4 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("a refusal the bridge did not hold says so; a hold row without a chain hash is not confirmed", () => {
    expect(intakeLine("B12-W.ifc", rejected({ failures: [{}], hold: null }))).toBe("Not uploaded — the IDS refused B12-W.ifc (1 failure(s)) · not on hold — the bridge returned no hold row");
    expect(intakeLine("B12-W.ifc", rejected({ failures: [{}], hold: { id: 915, hash: null } }))).toBe("Not uploaded — the IDS refused B12-W.ifc (1 failure(s)) · On hold · not confirmed — the bridge returned no chain hash");
  });

  it("an upload that failed after the verdict: judged, not uploaded, nothing registered", () => {
    expect(intakeLine("B12-W.ifc", reply({ stage: "upload_failed", version: null, error: "platform upload HTTP 503" })))
      .toBe("Judged accepted, not uploaded — platform upload HTTP 503. Nothing was registered · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });
});

describe("readHolding — GET /cde/:key/holding", () => {
  beforeEach(() => bfetch.mockReset());

  it("returns the held items and the recent clearances as the bridge sent them", async () => {
    const h: Holding = {
      items: [{ container_name: "B12-W.ifc", stage: "ids", verdict: "rejected", failures: [{ requirement: "Doors carry a FireRating", detail: "Pset_DoorCommon.FireRating missing" }],
        source: "web", actor: "lead@example.com", at: "2026-09-27T10:00:00Z", ledger: { id: 915, hash: HOLD }, refusals: 2 }],
      cleared_recent: [{ container_name: "B12-G.ifc", by: "recorded", version_id: "v-1", at: "2026-09-27T11:00:00Z" }],
    };
    bfetch.mockResolvedValue(res(200, h));
    expect(await readHolding("http://b/", "b12-hold")).toEqual(h);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding");
  });

  it("a failed read is 'not read — …', never an empty list — the bridge's 502, a status without words, a transport failure, a reply without a list", async () => {
    bfetch.mockResolvedValue(res(502, { message: "not read — the ledger did not answer" }));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — the ledger did not answer$/);
    bfetch.mockResolvedValue(res(500, null));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — HTTP 500$/);
    bfetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — Failed to fetch$/);
    bfetch.mockResolvedValue(res(200, { rows: [] }));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — the bridge answered without a list$/);
  });
});

describe("dismissHold — POST /cde/:key/holding/dismiss", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the name and the trimmed reason and returns the hold:dismissed row", async () => {
    bfetch.mockResolvedValue(res(201, { id: 930, hash: HOLD }));
    expect(await dismissHold("http://b", "b12-hold", "B12-N.ifc", "  renamed and registered as BDS20268-…  ")).toEqual({ id: 930, hash: HOLD });
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding/dismiss", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ container_name: "B12-N.ifc", reason: "renamed and registered as BDS20268-…" });
  });

  it("a blank reason is never sent", async () => {
    await expect(dismissHold("http://b", "k", "B12-N.ifc", "   ")).rejects.toThrow("a dismissal needs a reason — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("a role below lead is refused with the bridge's words", async () => {
    bfetch.mockResolvedValue(res(403, { message: "this action requires the lead role (you are contributor)" }));
    await expect(dismissHold("http://b", "k", "B12-N.ifc", "why")).rejects.toThrow("this action requires the lead role (you are contributor)");
  });
});

describe("resubmitFor — how a held file is sent again", () => {
  it("web and intake: the picker, through intake; Revit and auto-publish: the model in Revit", () => {
    expect(resubmitFor("web")).toEqual({ upload: true, text: "Upload the corrected file" });
    expect(resubmitFor("intake")).toEqual({ upload: true, text: "Upload the corrected file" });
    expect(resubmitFor("revit")).toEqual({ upload: false, text: "Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again." });
    expect(resubmitFor("auto-publish")).toEqual({ upload: false, text: "Fix the model in Revit and save — auto-publish judges it again (or run Governed Publish)." });
  });
});
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/holding.test.ts 2>&1 | grep -E "FAIL|Error|Test Files|Tests"
```

Expected (RED): `FAIL  src/setups/holding.test.ts [ src/setups/holding.test.ts ]`, `Error: Failed to load url ./holding (resolved id: ./holding) in …/src/setups/holding.test.ts. Does the file exist?`, `Test Files  1 failed (1)`, `Tests  no tests`.

Create `WebApp/src/setups/holding.ts`:

```ts
// holding — the Versions panel's side of the Holding Area (phase 6a, spec 2026-09-27 Decisions 2, 3, 7-9). The upload
// goes through Governed Intake (POST /cde/:key/intake, source=web), so a file is judged — delivery gate, naming, IDS —
// before anything is stored: accepted or recorded is uploaded and registered by the bridge, rejected uploads nothing
// and is held. The held list is GET /cde/:key/holding; a lead dismisses an entry with a reason (POST
// /cde/:key/holding/dismiss). A list that was not read says "not read — …", never that nothing is held; a ledger line
// names a row only with an id and a 64-hex hash from the bridge (stage-gate.ts's ledgerLine).
import { bfetch } from "./bridge-fetch";
import { ledgerLine } from "./stage-gate";

export type HoldStage = "gate" | "naming" | "ids";
export type HoldSource = "revit" | "auto-publish" | "web" | "intake";
export interface LedgerRef { id: number | null; hash: string | null; }
export interface HeldItem {
  container_name: string; stage: HoldStage; verdict: string;
  failures: { requirement: string; detail: string }[];
  source: HoldSource; actor: string | null; at: string; ledger: LedgerRef; refusals: number; naming_note?: string;
}
export interface ClearedItem { container_name: string; by: "recorded"; version_id: string; at: string; }
export interface Holding { items: HeldItem[]; cleared_recent: ClearedItem[]; }

/** The fields of the intake reply the panel reads (bridge/intake-logic.mjs runIntake, plus 6a's `hold`). */
export interface IntakeReply {
  verdict: "accepted" | "rejected" | "recorded";
  stage: "gate" | "ids" | "published" | "upload_failed";
  gate?: { failures?: unknown[] } | null;
  naming?: { ok: boolean; enforce?: string; failures?: unknown[] } | null;
  failures?: unknown[];
  summary?: { in_scope?: number; passing?: number } | null;
  ids_ref?: string | null;
  audit_id?: number | null;
  receipt?: { ledger_hash?: string | null } | null;
  note?: string;
  error?: string;
  version?: { revision?: string | null } | null;
  hold?: LedgerRef | null;
}

export const STAGE_WORDS: Record<HoldStage, string> = { gate: "delivery gate", naming: "naming standard", ids: "IDS" };
export const SOURCE_WORDS: Record<HoldSource, string> = { revit: "Governed Publish", "auto-publish": "auto-publish", web: "web upload", intake: "intake" };
export const CLEARED_BY_RECORDED = "cleared by a registration that was not judged (recorded)";

const at = (baseUrl: string, key: string, path: string) => `${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/${path}`;

/** POST the file to /cde/:key/intake?name&source=web&revision&note — the only door a web upload takes (no /ifc, no
 *  /files). The bridge judges first and uploads and registers only an accepted or recorded file. A refusal before any
 *  judgement (a 4xx or 5xx) throws the bridge's words. */
export async function uploadThroughIntake(baseUrl: string, key: string, file: Blob, o: { name: string; revision: string; who: string }): Promise<IntakeReply> {
  const q = [["name", o.name], ["source", "web"], ["revision", o.revision], ["note", `uploaded via web by ${o.who}`]]
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("&");
  const r = await bfetch(`${at(baseUrl, key, "intake")}?${q}`, { method: "POST", headers: { "Content-Type": "application/x-step" }, body: file });
  const j = (await r.json().catch(() => null)) as (IntakeReply & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return j;
}

/** Which judge refused, in the panel's words: the gate; else the naming standard when it rejected under enforce reject
 *  (the bridge's own rule, cde-store adjudicateProposal); else the IDS. */
function refusedBy(r: IntakeReply): { words: string; failures: unknown[] } {
  if (r.stage === "gate") return { words: "the delivery gate", failures: r.gate?.failures ?? [] };
  if (r.naming?.ok === false && r.naming.enforce === "reject") return { words: "the naming standard", failures: r.naming.failures ?? [] };
  return { words: "the IDS", failures: r.failures ?? [] };
}

/** The status line after an upload: what judged it, whether anything was stored, and the ledger row that says so. */
export function intakeLine(name: string, r: IntakeReply): string {
  if (r.verdict === "rejected") {
    const by = refusedBy(r);
    const held = r.hold ? `On hold · ${ledgerLine(r.hold)}` : "not on hold — the bridge returned no hold row";
    return `Not uploaded — ${by.words} refused ${name} (${by.failures.length} failure(s)) · ${held}`;
  }
  const row = ledgerLine({ id: r.audit_id ?? null, hash: r.receipt?.ledger_hash ?? null });
  if (r.stage === "upload_failed") return `Judged ${r.verdict}, not uploaded — ${r.error ?? "the platform upload failed"}. Nothing was registered · ${row}`;
  const judged = r.verdict === "accepted" ? `accepted (${r.ids_ref ?? "IDS"}: ${r.summary?.passing ?? 0}/${r.summary?.in_scope ?? 0} passed)` : "recorded, not judged";
  return `Uploaded ${name}${r.version?.revision ? " " + r.version.revision : ""} — ${judged}${r.note ? " · " + r.note : ""} · ${row}`;
}

/** GET /cde/:key/holding → {items, cleared_recent}. Any failure throws "not read — <why>": the panel prints it and
 *  never shows an empty list for a list it did not read. */
export async function readHolding(baseUrl: string, key: string): Promise<Holding> {
  let r: Response;
  try { r = await bfetch(at(baseUrl, key, "holding")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (Holding & { message?: string }) | null;
  if (!r.ok || !j || !Array.isArray(j.items)) {
    const why = !r.ok || !j ? j?.message || `HTTP ${r.status}` : "the bridge answered without a list";
    throw new Error(why.startsWith("not read — ") ? why : `not read — ${why}`);
  }
  return { items: j.items, cleared_recent: Array.isArray(j.cleared_recent) ? j.cleared_recent : [] };
}

/** POST /cde/:key/holding/dismiss {container_name, reason} → the hold:dismissed row {id, hash}. A blank reason is
 *  never sent; a refusal (a role below lead is a 403) throws the bridge's words. */
export async function dismissHold(baseUrl: string, key: string, containerName: string, reason: string): Promise<LedgerRef> {
  const why = reason.trim();
  if (!why) throw new Error("a dismissal needs a reason — the ledger records it");
  const r = await bfetch(at(baseUrl, key, "holding/dismiss"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ container_name: containerName, reason: why }),
  });
  const j = (await r.json().catch(() => null)) as (LedgerRef & { message?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return { id: j.id ?? null, hash: j.hash ?? null };
}

/** How a held file is sent again. Nothing is kept (Decision 2), so the corrected file comes from its source: the web
 *  picker (through intake) for a web or intake refusal, the model in Revit for Governed Publish and auto-publish. */
export function resubmitFor(source: HoldSource): { upload: boolean; text: string } {
  if (source === "revit") return { upload: false, text: "Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again." };
  if (source === "auto-publish") return { upload: false, text: "Fix the model in Revit and save — auto-publish judges it again (or run Governed Publish)." };
  return { upload: true, text: "Upload the corrected file" };
}
```

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run src/setups/holding.test.ts 2>&1 | grep -E "Test Files|Tests"
```

Expected (GREEN): `Test Files  1 passed (1)`, `Tests  15 passed (15)`.

- [ ] **Step 2: The Versions panel — `WebApp/src/setups/files-panel.ts`**

(1) The header comment's Actions line — in `WebApp/src/setups/files-panel.ts` replace:

```ts
 * Actions: upload a new version (browser → bridge /ifc → platform, then register the version), set any version
 * live, and compare any two versions' take-off (cost / carbon / element count) from their stored element
 * snapshots — reusing the verified sentinel-core diff. Plain-DOM, iframe-safe; needs the bridge + CDE.
```

with:

```ts
 * Actions: upload a new version (browser → bridge /cde/:key/intake: judged first — delivery gate, naming, IDS — then
 * uploaded and registered only when accepted or recorded; a refused file uploads nothing and is listed under
 * "On hold (n)" until a corrected file is registered under its name or a lead dismisses it), set any version live,
 * and compare any two versions' take-off (cost / carbon / element count) from their stored element snapshots —
 * reusing the verified sentinel-core diff. Plain-DOM, iframe-safe; needs the bridge + CDE.
```

(2) The imports — in `WebApp/src/setups/files-panel.ts` replace:

```ts
import { myRole, canEditRole } from "./my-role";
```

with:

```ts
import { myRole, canEditRole, canGovernRole } from "./my-role";
import { ledgerLine } from "./stage-gate";
import { uploadThroughIntake, intakeLine, readHolding, dismissHold, resubmitFor, STAGE_WORDS, SOURCE_WORDS, CLEARED_BY_RECORDED, type Holding, type HeldItem } from "./holding";
```

(3) The Holding Area state, after `showArchived` — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  let showArchived = false; // files whose every version is 'archived' hide behind a toggle (Forma-style)
```

with:

```ts
  let showArchived = false; // files whose every version is 'archived' hide behind a toggle (Forma-style)
  // The Holding Area (phase 6a): the refusals on hold, read on every load. `holdError` is set when that read failed —
  // the section then says "not read — …", never that nothing is held. `dismissing` = the held item whose inline
  // reason input is open (window.prompt is blocked in the platform iframe); `role` is asked on every load.
  let holding: Holding = { items: [], cleared_recent: [] };
  let holdError: string | null = null;
  let showHeld = false;
  let dismissing: number | null = null;
  let role = "viewer";
```

(4) `sha256Hex` goes (its only caller was the `/ifc` upload; the working tree's one `files-panel.ts` type error goes with it) and `load()` asks the role first — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
    try {
      const buf = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
    } catch { return null; }
  }

  async function load() {
    if (cmp.a || cmp.b) { cmp.a = cmp.b = cmp.fileId = undefined; el("fv-compare").style.display = "none"; }
    el("fv-proj").textContent = pid();
    status("Loading…");
    try {
```

with:

```ts
  async function load() {
    if (cmp.a || cmp.b) { cmp.a = cmp.b = cmp.fileId = undefined; el("fv-compare").style.display = "none"; }
    el("fv-proj").textContent = pid();
    status("Loading…");
    const asked = gateUpload();
    try {
```

(5) `load()` reads the Holding Area before rendering and counts it in the status line — in `WebApp/src/setups/files-panel.ts` replace:

```ts
        } catch (e) { historyGap = `History unavailable — ${(e as Error).message}.`; }
      }
      render();
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s).${historyGap ? " " + historyGap : ""}`);
```

with:

```ts
        } catch (e) { historyGap = `History unavailable — ${(e as Error).message}.`; }
      }
      // The Holding Area (spec 2026-09-27 Decision 7) is its own read: a failure there is said, never "none on hold".
      dismissing = null;
      try { holding = await readHolding(base, pid()); holdError = null; }
      catch (e) { holding = { items: [], cleared_recent: [] }; holdError = (e as Error).message; }
      await asked;
      render();
      const held = holdError ? `on hold: ${holdError}` : `${holding.items.length} on hold`;
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s) · ${held}.${historyGap ? " " + historyGap : ""}`);
```

(6) `render()` no longer returns early without files — a project whose only uploads were refused still shows its held files — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  function render() {
    if (!files.length) {
      el("fv-body").innerHTML = '<div style="color:#71717a;padding:1rem 0;text-align:center">No versioned files yet.<br><span style="font-size:11px">Upload an IFC to start a version history.</span></div>';
      return;
    }
    const active = files.filter((f) => !isArchivedFile(f));
    const archived = files.filter(isArchivedFile);
    let html = treeBlocks(active);
```

with:

```ts
  function render() {
    // A project whose only uploads were refused has no file yet but has files on hold: the section renders either way.
    const active = files.filter((f) => !isArchivedFile(f));
    const archived = files.filter(isArchivedFile);
    let html = files.length ? treeBlocks(active)
      : '<div style="color:#71717a;padding:1rem 0;text-align:center">No versioned files yet.<br><span style="font-size:11px">Upload an IFC to start a version history.</span></div>';
```

(7) `render()` appends the section and wires its buttons — in `WebApp/src/setups/files-panel.ts` replace:

```ts
    el("fv-body").innerHTML = html;
    root.querySelector("#fv-arch-toggle")?.addEventListener("click", () => { showArchived = !showArchived; render(); });
```

with:

```ts
    html += heldSection();
    el("fv-body").innerHTML = html;
    root.querySelector("#fv-arch-toggle")?.addEventListener("click", () => { showArchived = !showArchived; render(); });
    root.querySelector("#fv-held-toggle")?.addEventListener("click", () => { showHeld = !showHeld; render(); });
    root.querySelectorAll<HTMLElement>("[data-hresubmit]").forEach((n) =>
      n.addEventListener("click", () => (el("fv-file") as HTMLInputElement).click()));
    root.querySelectorAll<HTMLElement>("[data-hdismiss]").forEach((n) =>
      n.addEventListener("click", () => { dismissing = Number(n.dataset.hdismiss); render(); (root.querySelector("#fv-dismiss-input") as HTMLInputElement | null)?.focus(); }));
    root.querySelectorAll<HTMLElement>("[data-hcancel]").forEach((n) =>
      n.addEventListener("click", () => { dismissing = null; render(); }));
    root.querySelectorAll<HTMLElement>("[data-hdismissok]").forEach((n) =>
      n.addEventListener("click", () => void dismissHeld(Number(n.dataset.hdismissok))));
```

(8) `heldSection`, `heldCard` and `dismissHeld`, before `fileCard` — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  function fileCard(f: FileRec, isLink = false): string {
```

with:

```ts
  // "On hold (n)" — built like "Archived (n)": the files the referee refused on this project (GET /cde/:key/holding),
  // each with its stage, every failure, the refusal's ledger line and how to send it again (spec Decisions 7-9).
  function heldSection(): string {
    if (holdError) return `<div style="color:#fbbf24;font-size:11px;padding:.4rem .2rem">On hold: ${esc(holdError)}</div>`;
    const { items, cleared_recent } = holding;
    if (!items.length && !cleared_recent.length) return "";
    const toggle = `<button id="fv-held-toggle" style="border:none;background:transparent;color:#f59e0b;font:11px system-ui;cursor:pointer;padding:.4rem .2rem">${showHeld ? "▾" : "▸"} On hold (${items.length})</button>`;
    if (!showHeld) return toggle;
    return toggle + items.map(heldCard).join("") +
      cleared_recent.map((c) => `<div style="color:#71717a;font-size:11px;padding:.15rem .2rem">✓ ${esc(c.container_name)} — ${CLEARED_BY_RECORDED} · ${when(c.at)}</div>`).join("");
  }

  function heldCard(h: HeldItem, i: number): string {
    const act = "border:1px solid #2c2c34;background:#1f1f27;color:#cbd5e1;border-radius:.25rem;padding:.15rem .45rem;font:600 11px system-ui;cursor:pointer";
    const again = resubmitFor(h.source);
    const resubmit = !again.upload ? `<span style="color:#9ca3af">${esc(again.text)}</span>`
      : canEditRole(role) ? `<button data-hresubmit="${i}" style="${act};color:#c4b5fd" title="Pick the corrected file — it is judged before anything is stored">${again.text}</button>`
      : '<span style="color:#71717a">a contributor or above uploads the corrected file</span>';
    const dismiss = !canGovernRole(role) ? ""
      : dismissing === i
        ? `<input id="fv-dismiss-input" maxlength="500" placeholder="Why dismiss it? The ledger records the reason." style="flex:1;min-width:10rem;background:#111;color:#eee;border:1px solid #f59e0b;border-radius:.25rem;padding:.2rem .4rem;font:12px system-ui"/>` +
          `<button data-hdismissok="${i}" style="${act};color:#fbbf24">Dismiss with this reason</button><button data-hcancel="${i}" style="${act}">Cancel</button>`
        : `<button data-hdismiss="${i}" style="${act}">Dismiss…</button>`;
    return `<div style="margin-bottom:.45rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid #4a3a12;border-radius:.4rem;font-size:12px">` +
      `<div style="display:flex;gap:.5rem;align-items:baseline"><span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.container_name)}</span>` +
      `<span style="color:#f59e0b;font-size:10.5px">refused by the ${esc(STAGE_WORDS[h.stage] ?? h.stage)}</span></div>` +
      `<div style="color:#9ca3af;font-size:11px">${esc(SOURCE_WORDS[h.source] ?? h.source)} · ${esc(h.actor || "—")} · ${when(h.at)}${h.refusals > 1 ? ` · refused ${h.refusals} times since it went on hold` : ""}</div>` +
      (h.failures || []).map((f) => `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">✗ ${esc(f.requirement)} — ${esc(f.detail)}</div>`).join("") +
      (h.naming_note ? `<div style="color:#fbbf24;font-size:11px">${esc(h.naming_note)}</div>` : "") +
      `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace">${ledgerLine(h.ledger)}</div>` +
      `<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-top:.3rem">${resubmit}<span style="flex:1"></span>${dismiss}</div></div>`;
  }

  async function dismissHeld(i: number) {
    const h = holding.items[i];
    if (!h) return;
    const reason = (root.querySelector("#fv-dismiss-input") as HTMLInputElement | null)?.value ?? "";
    try {
      const row = await dismissHold(base, pid(), h.container_name, reason);
      await load();
      status(`✓ Dismissed ${h.container_name} from On hold · ${ledgerLine(row)}`);
    } catch (e) { status(`Not dismissed — ${(e as Error).message}`); }
  }

  function fileCard(f: FileRec, isLink = false): string {
```

(9) The upload goes through intake — replace the whole of `uploadNewVersion` (its comment included) — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  // ── upload a new version: browser → bridge /ifc (→ platform) → register the version ──
  async function uploadNewVersion(file: File) {
    status(`Uploading ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = file.name;
      const existing = files.find((f) => f.iso_name === name);
      const nextTag = `v${(existing?.version_count ?? 0) + 1}`;
      const url = `${base}/ifc?name=${encodeURIComponent(name)}&version=${encodeURIComponent(nextTag)}&projectId=${encodeURIComponent(pid())}`;
      const resp = await bfetch(url, { method: "POST", headers: { "Content-Type": "application/x-step" }, body: bytes });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        status(resp.status === 503 ? `Bridge not configured for upload: ${j.message}` : `Upload failed (${resp.status}): ${j.message || "see bridge console"}`);
        return;
      }
      const sha = await sha256Hex(bytes);
      const who = await whoami();
      await api(`${encodeURIComponent(pid())}/files`, "POST", {
        name, author: who, size_bytes: j.bytes ?? bytes.length, sha256: sha,
        platform_item_id: j.itemId ?? null, notes: `uploaded ${j.format || "ifc"} via web by ${who}`,
      });
      status(`Uploaded ${name} (${nextTag}) ✓ — now the live version.`);
      await load();
    } catch (e) {
      status(`Upload failed: ${esc((e as Error).message)}. Is the bridge running?`);
    }
  }
```

with:

```ts
  // ── upload a new version through Governed Intake: judged (gate, naming, IDS) before anything is stored — accepted or
  //    recorded is uploaded to the platform and registered with its verdict; rejected uploads nothing and is held ──
  async function uploadNewVersion(file: File) {
    status(`Judging ${file.name} — nothing is stored unless the referee accepts or records it…`);
    try {
      const existing = files.find((f) => f.iso_name === file.name);
      const revision = `v${(existing?.version_count ?? 0) + 1}`;
      const r = await uploadThroughIntake(base, pid(), file, { name: file.name, revision, who: await whoami() });
      if (r.verdict === "rejected") showHeld = true;
      await load();
      status(intakeLine(file.name, r));
    } catch (e) {
      status(`Not uploaded — ${(e as Error).message}`);
    }
  }
```

(10) `gateUpload` stores the role (`Dismiss…` reads it) — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  // Upload is a write: contributor and up. Re-asked on every load so a demotion takes effect on reload.
  const gateUpload = async () => {
    const role = await myRole(base, pid());
```

with:

```ts
  // Upload is a write: contributor and up; Dismiss… on a held file is a lead's. Re-asked on every load (load() calls
  // it) so a demotion takes effect on reload.
  const gateUpload = async () => {
    role = await myRole(base, pid());
```

(11) The init no longer calls `gateUpload` itself — `load()` does, on every load — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  void gateUpload();
  (el("fv-file") as HTMLInputElement).addEventListener("change", (ev) => {
```

with:

```ts
  (el("fv-file") as HTMLInputElement).addEventListener("change", (ev) => {
```

(12) `onActiveProjectChange` reloads once — in `WebApp/src/setups/files-panel.ts` replace:

```ts
  onActiveProjectChange(() => { void gateUpload(); load(); });
```

with:

```ts
  onActiveProjectChange(() => void load());
```

- [ ] **Step 3: Check**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx tsc --noEmit -p . 2>&1 | grep "files-panel\|holding"
npx vitest run 2>&1 | grep -E "Test Files|Tests"
grep -n "sha256Hex\|/ifc?\|nextTag\|prompt(" src/setups/files-panel.ts
grep -n "uploadThroughIntake\|readHolding\|dismissHold\|intakeLine" src/setups/files-panel.ts
grep -rn "/ifc?" src --include=*.ts
```

Expected (measured): `23` (master's 24 less `files-panel.ts(109,57)`, which went with `sha256Hex`; 24 on an archive copy, whose extra is the untracked `src/generated/fragments-worker`); the second command prints nothing; `Test Files  87 passed (87)`, `Tests  1202 passed (1202)` on master's tree (in execution order: Task 2's total plus 15, in one more file); the fourth prints nothing (no `/ifc` upload, no client-side hash, no browser prompt in the panel); the fifth prints five lines — the import (`:9`), `load`'s `readHolding` (`:149`), `dismissHeld`'s `dismissHold` (`:287`), `uploadNewVersion`'s `uploadThroughIntake` (`:574`) and `intakeLine` (`:577`); the sixth prints only `src/setups/model-panel.ts:669` (the modeller bake, out of scope).

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/src/setups/holding.ts WebApp/src/setups/holding.test.ts WebApp/src/setups/files-panel.ts
git commit -q -F - <<'EOF'
feat(web): the Versions upload goes through Governed Intake — POST /cde/:key/intake?name&source=web&revision=v{N+1}&note=uploaded via web by <who>, judged (delivery gate, naming, IDS) before anything is stored: accepted or recorded is uploaded and registered with its verdict, rejected uploads nothing and is held ('Not uploaded — <the delivery gate | the naming standard | the IDS> refused <name> (<n> failure(s)) · On hold · ledger #<id> · receipt <16 hex>…'); /ifc + /files and the client-side sha256Hex are gone from the panel (the bake keeps /ifc); 'On hold (n)', built like 'Archived (n)', lists GET /cde/:key/holding — stage, every failure, the refusal's ledger line, 'Upload the corrected file' (web, intake) or the Revit instruction (Governed Publish, auto-publish), a lead's inline 'Dismiss…' with a reason (POST /cde/:key/holding/dismiss; never window.prompt), and 'cleared by a registration that was not judged (recorded)'; a list not read says 'not read — …', never none; the upload's status line is set after the reload so it stays; holding.ts (the calls and the lines, DOM-free) with holding.test.ts 15. 1202 tests in 87 files, tsc 23 (master's 24 less files-panel.ts's, gone with sha256Hex)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: no C#; both add-in builds and the harnesses stay as Task 2 left them; the web suite 1202 in 87 files (Task 3 alone on master's tree; in execution order Task 2's total plus 15 in one more file), tsc 23.

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

Seven replacements.

A3.1: the web must print the label the bridge sends. Task 2's `cleared_recent` carries `by: "recorded" | "unjudged" | <verdict>` and `label`. Printing the recorded wording for a verdict-less registration would be false.
- In Step 1's `holding.ts` block, replace `export interface ClearedItem { container_name: string; by: "recorded"; version_id: string; at: string; }` with `export interface ClearedItem { container_name: string; by: string; version_id: string; at: string; label?: string; }`.
- In Step 2 (8)'s `heldSection` block, replace `✓ ${esc(c.container_name)} — ${CLEARED_BY_RECORDED} · ${when(c.at)}</div>`).join("");` with `✓ ${esc(c.container_name)} — ${esc(c.label || CLEARED_BY_RECORDED)} · ${when(c.at)}</div>`).join("");`.

A3.2: Task 1 now answers intake's naming refusal with stage "naming".
- In `holding.ts`, replace `  stage: "gate" | "ids" | "published" | "upload_failed";` with `  stage: "gate" | "naming" | "ids" | "published" | "upload_failed";`.
- In `holding.test.ts`, replace
```
  it("a naming reject is the naming standard's (rejected under enforce reject), even though intake's stage says ids", () => {
    const r = rejected({ naming:
```
with
```
  it("a naming reject is the naming standard's (rejected under enforce reject) — intake's stage naming", () => {
    const r = rejected({ stage: "naming", naming:
```
(The test count stays 15.)

A3.3: a list cut at 50 must not read as complete.
- In `holding.ts`, replace
```
  failures: { requirement: string; detail: string }[];
  source: HoldSource; actor: string | null; at: string; ledger: LedgerRef; refusals: number; naming_note?: string;
```
with
```
  failures: { requirement: string; detail: string }[]; failures_total?: number;
  source: HoldSource; actor: string | null; at: string; ledger: LedgerRef; refusals: number; naming_note?: string;
```
- In Step 2 (8)'s `heldCard`, replace
```
      (h.failures || []).map((f) => `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">✗ ${esc(f.requirement)} — ${esc(f.detail)}</div>`).join("") +
```
with
```
      (h.failures || []).map((f) => `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">✗ ${esc(f.requirement)} — ${esc(f.detail)}</div>`).join("") +
      ((h.failures_total ?? 0) > (h.failures || []).length ? `<div style="color:#fca5a5;font-size:11px;padding-left:.6rem">… and ${(h.failures_total ?? 0) - (h.failures || []).length} more (the ledger row keeps the first 50)</div>` : "") +
```

A3.4: the Interfaces' Consumes line.
- Replace `cleared_recent: [{container_name, by: "recorded", version_id, at}]}`, a failed read 502` with `cleared_recent: [{container_name, by: "recorded" | "unjudged" | <verdict>, version_id, at, label}]}` (each item also carries `failures_total`), a failed read 502`.

A3.5: execution-order totals in Step 3's Expected.
- Replace ``Test Files  87 passed (87)`, `Tests  1202 passed (1202)` on master's tree (in execution order: Task 2's total plus 15, in one more file)`` with ``Test Files  90 passed (90)`, `Tests  1271 passed (1271)` (after Task 2's 1256 in 89)``.
- Replace ``dismissHeld`'s `dismissHold` (`:287`), `uploadNewVersion`'s `uploadThroughIntake` (`:574`) and `intakeLine` (`:577`)`` with ``dismissHeld`'s `dismissHold` (`:288`), `uploadNewVersion`'s `uploadThroughIntake` (`:575`) and `intakeLine` (`:578`)``. Those are the numbers measured after A3.3's added line.

A3.6: the commit message.
- Replace `holding.ts (the calls and the lines, DOM-free) with holding.test.ts 15. 1202 tests in 87 files, tsc 23` with `holding.ts (the calls and the lines, DOM-free) with holding.test.ts 15; a clearance prints the bridge's label; a list cut at 50 says how many more. 1271 tests in 90 files, tsc 23`.

A3.7: the Build state line.
- Replace `the web suite 1202 in 87 files (Task 3 alone on master's tree; in execution order Task 2's total plus 15 in one more file), tsc 23.` with `the web suite 1271 in 90 files, tsc 23 (master's 24 less files-panel.ts(109,57), gone with sha256Hex).`

Measured with A3.1-A3.7 applied: holding.test.ts 15/15, suite 1271 in 90, tsc 23, no error in files-panel.ts or holding*.

---

### Task 4: Revit — the gate row moves to `POST /cde/:key/delivery-gate` (the machine credential's route: every failure, `size_bytes`, `source`, `publish`); `Publisher.Prepare` takes the caller's source; `Judge`'s `/propose` names its gate row (`gate_row_id`); the hold row both replies return is read (`ProposalResult.Held`, `LedgerResult.Hold`) and printed — `Held on the web: Versions ▸ On hold · ledger #<id> · receipt <16 hex>…` — in the rejection dialog and the auto-publish Doctor line; `tools/gate-check` 122/122, `tools/publish-check` 112/112

(Every block below was applied, as written, to a `git archive` of master c7dcbf6 (`SentinelAddin`, `tools`, `.github`, `config`, `demo`, `WebApp/bridge/fixtures`) in `scratchpad\p6aC2` — the applier `scratchpad\p6aC_apply.py`, every quoted current text matched exactly once, CRLF kept — and measured: Step 2 RED, neither harness builds (gate-check 7 compile errors, publish-check 11, listed below); Step 6 GREEN gate-check `122/122` (master 121: the `AuditAction` check goes, the 200-failure cap and the never-read file come) and publish-check `112/112` (master 101: 6 wire checks, 5 line checks); Step 8 both add-in builds 0 errors with master's warning sets (2024: 6, 2025: 3) at `-p:DeployToRevit=false`, and event-check 44/44, fixplace-check 52/52, artefact-cache-check 53/53, roi-check 43/43, ghost-standards-check 135/135, naming-check 37/37, org-check 46/46, snapshot-check 21/21, heal-check 9/9, project-context-check 19/19 — unchanged. No web file is touched: `npm test` and `tsc` keep Tasks 1-3's numbers. Nothing here reads the live bridge, `%AppData%\Sentinel` or Revit. The working tree is CRLF: every edit quotes text, never line numbers (the Edit tool keeps CRLF). This add-in needs Task 1's bridge: against master's, `POST /cde/<key>/delivery-gate` falls to the CDE block's `404 CDE route not found` (`WebApp/bridge/bcf-service.mjs:1315`), so the gate row reads `not recorded — HTTP 404: CDE route not found` and nothing is held; a PASS or NOT CHECKED model is still judged (a gate row that did not land never stopped a publish) — Task 6 deploys the add-in and the bridge together with Revit closed.)

**Files:**
- Modify: `SentinelAddin/Engine/GateLines.cs` (:77-109 — `AuditAction` goes; `AuditValue` becomes the route's body and takes `source` and `publish`)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (:62-78 `DeliveryGate`; :94-119 `Propose`'s doc, signature and `RequestBody` call)
- Modify: `SentinelAddin/Coordination/LedgerResult.cs` (:36-44 the fields and the constructor; :57-75 `FromResponse`)
- Modify: `SentinelAddin/Coordination/ProposalResult.cs` (:39-40 the reply fields; :54-59 and :74-76 `RequestBody`; :90 `Parse`)
- Modify: `SentinelAddin/Engine/Publisher.cs` (:144-149 `Prepare`'s doc and signature; :158-160 the contract pair; :182-187 the gate and its row; :207-218 `Judge`; :238 `PublishPlan.GateRow`; :262 `PublishOutcome`; :281-286 `PublishLines`' doc and its row helpers; :341 and :356-357 `Dialog`; :400 and :407 `Doctor`)
- Modify: `SentinelAddin/Engine/AutoPublish.cs` (:92-93 the `Prepare` call)
- Modify: `SentinelAddin/Commands.GovernedPublish.cs` (:52-53 the `Prepare` call)
- Modify: `SentinelAddin/Commands.IfcGate.cs` (:116-120 the gate row in `Certify`)
- Modify: `tools/gate-check/GateLinesCheck.cs` (:100-131, section 5), `tools/publish-check/Check.cs` (:23 the constants; :89 and :103 in `Wire`; :337 the end of `Lines`), `tools/publish-check/publish-check.csproj` (:2-7 the header comment)
- Not touched, checked: `SentinelAddin/Engine/IfcDeliveryGate.cs` (the certificate beside the IFC keeps every failure; a missing file leaves `FileSha256` "" — `AuditValue` then sends null); `SentinelAddin/Engine/RoiReport.cs` (the ROI dashboard counts `new_value.passed` only — the failure list changes nothing there; roi-check 43/43); `SentinelAddin/Coordination/LedgerResult.cs`'s `LedgerLine` (the only words for a row, the held line included); `.github/workflows/ci.yml` (gate-check and publish-check already run); `WebApp/*`.
- Read for reference: spec `docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md:96-125` (Decisions 4-6: who writes a hold, the gate route, the rows naming each other), `:138-143` (Decision 9: the Revit line), `:198-201` (6a behaviour changes: the add-in and the bridge deploy together), `:211-219` (Testing 6a: publish-check pins the gate route body, the Prepare source and the held line); `WebApp/bridge/cde-store.mjs:748-755` (`audit()` returns the stored row `{id, hash, …}` or null), `:761-770` (`RESERVED_ACTIONS` and `recordAudit`'s refusal — Task 1 adds `hold:` and entity_types `hold` and `delivery_gate`, so the open `/audit` route Revit used is closed to gate rows); `WebApp/bridge/members-store.mjs:126-133` (`myRole` → `"service"` for the `BCF_TOKEN` caller, which is Revit's `BcfConfig.ServiceToken`); `WebApp/bridge/intake-logic.mjs:13` (intake's `.ifc` test is case-insensitive), `:37-40` (intake's own gate row still carries a failure count — Task 1's); `WebApp/bridge/bcf-service.mjs:996-1003` (the CDE block), `:1315` (its 404 fallback); `SentinelAddin/Coordination/LedgerResult.cs:50-78` (`FromReceipt` — Recorded only with an id > 0 and a 64-hex hash; `FromResponse` — a body with a `receipt` key is read as a /propose body), `:98-118` (`Post`, what `GovernedNotify.Event` calls: ≤ 6 s, never throws), `:160-166` (`LedgerLine.For`); `SentinelAddin/Engine/IfcDeliveryGate.cs:59-66` (a missing file fails with no sha and no size), `:170-174` (`Seal` hashes the file); `SentinelAddin/Commands.GovernedPublish.cs:52-58` and `:66` (Prepare on the API thread, the modal wait for Judge); `SentinelAddin/Engine/AutoPublish.cs:85-123` (Prepare in a hub job, Judge on a task, the Doctor line back through the hub); `tools/publish-check/Check.cs:7-14` (`Ok`/`Is`), `:39-42` (`Reply(…)`), `:207-226` (`Gate`, `Ready`, `NotStaged` — reused); `docs/superpowers/plans/2026-09-26-publish-one-path-5c.md` Task 4 (the build and harness measurement this task repeats).

**Interfaces:**
- Consumes (Task 1's bridge): `POST /cde/:key/delivery-gate` → `201 {id, hash, hold: {id, hash} | null}` for the machine credential, the row's value = the body; `403 {message: "the delivery-gate route is for Sentinel's machine credential"}` to a signed-in caller; 400 on a body it refuses. `POST /cde/:key/propose` reads `gate_row_id` when a positive integer and answers `hold: {id, hash} | null`; the hold's source is `revit` for `source: "Governed Publish"`, `auto-publish` for `"Auto-Publish"` (what `Judge` already sends).
- Produces (namespace `Sentinel.Engine`, `GateLines.cs` — harness-compiled by gate-check and publish-check):
  - `public const int RouteFailures = 200`.
  - `public static Dictionary<string, object?> AuditValue(string file, GateResult r, string source, bool publish)` — keys in this order: `file`, `result` ("pass" | "fail" | "not_checked"), `passed` (true | false | null), `contract` (the display key; null when not checked), `contract_ref`, `contract_source`, `contract_sha256` (null when none), `schema` (null when not detected), `entities` (null when not checked), `failures` (the strings themselves; past 200, the first 199 and `… and <n> more — the certificate lists every one`), `sha256` and `size_bytes` (null when the file was never read, i.e. `FileSha256` is not 64 characters), `source` ("revit" | "auto-publish" | "check"), `publish`. No `action`, `entity_type` or `actor`: the route words and stamps the row. `AuditAction` is deleted.
- Produces (namespace `Sentinel.Coordination`):
  - `GovernedNotify.DeliveryGate(string fileName, GateResult gate, string projectKey, string source, bool publish)` → `Event("/delivery-gate", GateLines.AuditValue(fileName, gate, source, publish), projectKey)`: BLOCKING ≤ 6 s, never throws, an empty key sends nothing (`NotBound`).
  - `GovernedNotify.Propose(…, RegisterRequest? register = null, long? gateRowId = null)`; `ProposalResult.RequestBody(…, RegisterRequest? register, long? gateRowId = null)` adds `"gate_row_id": <number>` after `register`, only when `gateRowId > 0`. Every other caller (BCF issues, fix-in-place) sends what it sent.
  - `ProposalResult.Held` (the reply's `hold` is an object), `HoldId`, `HoldHash` (as the reply gives them; null when missing).
  - `LedgerResult.Hold` (`LedgerResult?`) — a 2xx body's `hold` object through `FromReceipt`; null when the body has none, `hold: null`, or the status is not 2xx.
- Produces (namespace `Sentinel.Engine`, `Publisher.cs`):
  - `Publisher.Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null, string source = "revit")` — Governed Publish passes `"revit"`, `AutoPublish` `"auto-publish"` (the default exists only because `resolve` is optional before it); the gate row goes with `publish: true`; the contract pair is now `(contract, contractSource)` — the parameter would otherwise shadow it (CS0136, measured).
  - `Publisher.Judge` sends `gateRowId: plan.GateRow.Id` — non-null only when the gate row came back Recorded (id and 64-hex hash).
  - `PublishPlan.GateRow.Hold` — the hold:gate row on a FAIL, "carried on the plan".
  - `PublishOutcome.HoldRow` (`LedgerResult?`) = `Reached && Verdict.Held ? LedgerResult.FromReceipt(Verdict.HoldId, Verdict.HoldHash) : null`.
  - `PublishLines.Held(LedgerResult hold)` = `"Held on the web: Versions ▸ On hold · " + LedgerLine.For(hold)`. `Dialog`: a gate FAIL gains `"\n" + Held(p.GateRow.Hold)` after its gate row; a rejection gains `Held(o.HoldRow) + "\n"` right after `No version was registered and nothing was uploaded.`; `Doctor`: a gate FAIL and a rejection end with `" · " + Held(…)`. With no hold from the bridge every line is master's, word for word (the unchanged exact-string checks prove it).
- The IFC Delivery Gate command: `GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey, "check", publish: false)` — a check holds nothing; its dialog still ends with `LedgerLine.Sentence(ledger)`.
- Threading unchanged: `Prepare` runs on the API thread and waits for the gate row with `Task.Run(…).GetAwaiter().GetResult()`; `Judge`'s `/propose` runs off it (Governed Publish waits the same way; AutoPublish continues on a task and posts the Doctor line through the hub); `Certify` waits as before. No HTTP on the API thread, no Revit API off it.

- [ ] **Step 1: Write the failing harness checks**

The gate row's value is pinned in gate-check (section 5 is replaced: the `AuditAction` check goes with the method — the bridge words the row now — and the body gains its list, size, source and publish). Replace (in `tools/gate-check/GateLinesCheck.cs`, the whole of section 5 — the last lines of `Run` before its closing braces):

```csharp
        // ── 5. the audit row: the Node intake gate row's shape, passed nullable ────────────────────────────────
        ok(GateLines.AuditAction("a.ifc", pass) == "IFC delivery gate PASS: a.ifc"
           && GateLines.AuditAction("a.ifc", fail) == "IFC delivery gate FAIL: a.ifc"
           && GateLines.AuditAction("a.ifc", none) == "IFC delivery gate NOT CHECKED: a.ifc",
           "audit action: PASS | FAIL | NOT CHECKED");
        ok(string.Join(",", GateLines.AuditValue("a.ifc", pass).Keys) ==
           "file,result,passed,contract,contract_ref,contract_source,contract_sha256,schema,entities,failures,sha256,source",
           "audit value: the intake gate row's fields, in order");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", pass))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "pass" && e.GetProperty("passed").ValueKind == JsonValueKind.True
               && e.GetProperty("contract").GetString() == "pilot-ifc4" && e.GetProperty("contract_ref").GetString() == "contract@1"
               && e.GetProperty("contract_source").GetString() == "office" && e.GetProperty("contract_sha256").GetString() == Sha
               && e.GetProperty("schema").GetString() == "IFC4" && e.GetProperty("entities").GetInt32() == 40
               && e.GetProperty("failures").GetInt32() == 0 && e.GetProperty("source").GetString() == "revit",
               "audit value: PASS carries result, passed true and the contract's ref · source · sha");
        }
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", fail))))
            ok(j.RootElement.GetProperty("result").GetString() == "fail" && j.RootElement.GetProperty("passed").ValueKind == JsonValueKind.False
               && j.RootElement.GetProperty("failures").GetInt32() == 2,
               "audit value: FAIL carries passed false and the failure count");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", none))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "not_checked" && e.GetProperty("passed").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract").ValueKind == JsonValueKind.Null && e.GetProperty("contract_ref").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract_source").ValueKind == JsonValueKind.Null && e.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null
               && e.GetProperty("entities").ValueKind == JsonValueKind.Null && e.GetProperty("failures").GetInt32() == 0
               && e.GetProperty("sha256").GetString() == string.Concat(Enumerable.Repeat("cd", 32)),
               "audit value: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha");
        }
```

with:

```csharp
        // ── 5. the delivery-gate route's body (6a): the gate row's fields, passed nullable, every failure ─────────
        //    The bridge words the row ("IFC delivery gate PASS | FAIL | NOT CHECKED: <file>") itself: Revit sends no action.
        ok(string.Join(",", GateLines.AuditValue("a.ifc", pass, "revit", true).Keys) ==
           "file,result,passed,contract,contract_ref,contract_source,contract_sha256,schema,entities,failures,sha256,size_bytes,source,publish",
           "route body: the gate row's fields, in order, then size_bytes, source and publish");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", pass, "revit", true))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "pass" && e.GetProperty("passed").ValueKind == JsonValueKind.True
               && e.GetProperty("contract").GetString() == "pilot-ifc4" && e.GetProperty("contract_ref").GetString() == "contract@1"
               && e.GetProperty("contract_source").GetString() == "office" && e.GetProperty("contract_sha256").GetString() == Sha
               && e.GetProperty("schema").GetString() == "IFC4" && e.GetProperty("entities").GetInt32() == 40
               && e.GetProperty("failures").GetArrayLength() == 0 && e.GetProperty("size_bytes").GetInt64() == 1048576
               && e.GetProperty("source").GetString() == "revit" && e.GetProperty("publish").ValueKind == JsonValueKind.True,
               "route body: PASS carries passed true, the contract's ref · source · sha, no failure, the size, the source and publish");
        }
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", fail, "auto-publish", true))))
            ok(j.RootElement.GetProperty("result").GetString() == "fail" && j.RootElement.GetProperty("passed").ValueKind == JsonValueKind.False
               && string.Join(" | ", j.RootElement.GetProperty("failures").EnumerateArray().Select(f => f.GetString())) ==
                  "Schema mismatch: contract requires IFC4, file is IFC2X3. | IFCCOLUMN: 0 found, contract requires ≥ 1."
               && j.RootElement.GetProperty("source").GetString() == "auto-publish",
               "route body: FAIL carries passed false and every failure itself — no longer a count");
        using (var j = JsonDocument.Parse(JsonSerializer.Serialize(GateLines.AuditValue("a.ifc", none, "check", false))))
        {
            var e = j.RootElement;
            ok(e.GetProperty("result").GetString() == "not_checked" && e.GetProperty("passed").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract").ValueKind == JsonValueKind.Null && e.GetProperty("contract_ref").ValueKind == JsonValueKind.Null
               && e.GetProperty("contract_source").ValueKind == JsonValueKind.Null && e.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null
               && e.GetProperty("entities").ValueKind == JsonValueKind.Null && e.GetProperty("failures").GetArrayLength() == 0
               && e.GetProperty("sha256").GetString() == string.Concat(Enumerable.Repeat("cd", 32))
               && e.GetProperty("source").GetString() == "check" && e.GetProperty("publish").ValueKind == JsonValueKind.False,
               "route body: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha; the IFC gate's own check publishes nothing");
        }
        var flood = Judged(GateOutcome.Fail, "IFC4", Enumerable.Range(1, 250).Select(i => "failure " + i).ToArray());
        var sent = (List<string>)GateLines.AuditValue("a.ifc", flood, "revit", true)["failures"]!;
        ok(sent.Count == GateLines.RouteFailures && sent[0] == "failure 1" && sent[198] == "failure 199"
           && sent[199] == "… and 51 more — the certificate lists every one",
           "route body: past 200 failures, the first 199 and one line counting the rest (the route refuses a longer list)");
        var unread = GateLines.AuditValue("gone.ifc", missing, "check", false);
        ok(unread["sha256"] is null && unread["size_bytes"] is null && unread["schema"] is null,
           "route body: a file that was never read sends sha256, size_bytes and schema null — never an empty hash");
```

(`missing` is section 3's `GateResult` for `C:\gone.ifc` — never read, so its `FileSha256` and `DetectedSchema` are empty; `List<string>` and `Select` come from the harness's `ImplicitUsings`.)

The route body, `gate_row_id`, the two replies' `hold` and the held lines are pinned in publish-check. Replace (in `tools/publish-check/Check.cs`, the fixtures' constants):

```csharp
    const string PSha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee";    // publish@1's sha
```

with:

```csharp
    const string PSha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee";    // publish@1's sha
    const string HoldHash = "7a8b9c0d1e2f30415263748596a7b8c9d0e1f20314253647586970a1b2c3d4e5"; // a hold:<stage> row's (the /propose reply's hold)
    const string GateHoldHash = "8c9d0e1f20314253647586970a1b2c3d4e5f60718293a4b5c6d7e8f901122334"; // the hold:gate row's (the delivery-gate reply's hold)
```

Replace (in `tools/publish-check/Check.cs`, `Wire`):

```csharp
           "without register the body is the one every other caller sends today");
```

with:

```csharp
           "without register the body is the one every other caller sends today");
        Is(JsonSerializer.Serialize(ProposalResult.RequestBody(new object[0], null, "Revit", Container, "Auto-Publish", null, true, null, reg, 812)),
           "{\"source\":\"Auto-Publish\",\"actor\":\"Revit\",\"elements\":[],\"container_name\":\"" + Container + "\",\"register\":{\"name\":\"" + Container + "\",\"size_bytes\":5120000,\"sha256\":\"" + FileSha + "\"},\"gate_row_id\":812}",
           "the Publisher's /propose names its recorded gate row: gate_row_id after register (6a)");
```

Replace (in `tools/publish-check/Check.cs`, the end of `Wire`):

```csharp
        Ok(ProposalResult.Parse("{\"verdict\":\"accepted\",\"summary\":{\"in_scope\":1,\"passing\":1,\"failing\":0},\"audit_id\":1}").Version is null, "a pre-5a reply (no version key) is no version");
```

with:

```csharp
        Ok(ProposalResult.Parse("{\"verdict\":\"accepted\",\"summary\":{\"in_scope\":1,\"passing\":1,\"failing\":0},\"audit_id\":1}").Version is null, "a pre-5a reply (no version key) is no version");

        // 6a: the hold row the bridge wrote for a refusal — in the /propose reply, and in the delivery-gate route's
        var held = ProposalResult.Parse(Reply("rejected", null, 40, 37, 3, version: false).Replace("\"agent\":null", "\"agent\":null,\"hold\":{\"id\":815,\"hash\":\"" + HoldHash + "\"}"));
        Ok(held.Held && held.HoldId == "815" && held.HoldHash == HoldHash, "a rejected reply's hold {id, hash} is read");
        Ok(!ProposalResult.Parse(Reply("rejected", null, 40, 37, 3, version: false).Replace("\"agent\":null", "\"agent\":null,\"hold\":null")).Held && !rej.Held,
           "hold null, or no hold key (a bridge before 6a), is no hold");
        var gateReply = LedgerResult.FromResponse(201, "{\"id\":812,\"hash\":\"" + GateHash + "\",\"hold\":{\"id\":816,\"hash\":\"" + GateHoldHash + "\"}}");
        Ok(gateReply is { State: LedgerState.Recorded, Id: 812 } && gateReply.Hold is { State: LedgerState.Recorded, Id: 816 } && gateReply.Hold.Hash == GateHoldHash,
           "the delivery-gate route's 201 {id, hash, hold}: the gate row, and its hold row as Hold");
        Ok(LedgerResult.FromResponse(201, "{\"id\":812,\"hash\":\"" + GateHash + "\",\"hold\":null}").Hold is null && LedgerResult.FromResponse(403, "{\"message\":\"the delivery-gate route is for Sentinel's machine credential\"}").Hold is null,
           "hold null, or a refused write, carries no hold");
        Is(JsonSerializer.Serialize(GateLines.AuditValue(Container, Gate(GateOutcome.Fail, "IFC2X3"), "auto-publish", true)),
           "{\"file\":\"" + Container + "\",\"result\":\"fail\",\"passed\":false,\"contract\":\"pilot-ifc4\",\"contract_ref\":\"contract@1\",\"contract_source\":\"office\",\"contract_sha256\":\"" + CSha + "\"," +
           "\"schema\":\"IFC2X3\",\"entities\":40,\"failures\":[\"IFCCOLUMN: 0 found, contract requires \\u2265 1.\"],\"sha256\":\"" + FileSha + "\",\"size_bytes\":5120000,\"source\":\"auto-publish\",\"publish\":true}",
           "Prepare's gate row body for /cde/:key/delivery-gate: the gate, every failure, sha256 and size_bytes, the caller's source, publish true");
```

(`System.Text.Json`'s default encoder writes `≥` as `\u2265` — the wire is ASCII; the bridge reads it back as `≥`.)

Replace (in `tools/publish-check/Check.cs`, the end of `Lines`):

```csharp
        Is(PublishLines.Doctor(plan), "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded", "auto, a Judge task that never answered");
```

with:

```csharp
        Is(PublishLines.Doctor(plan), "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded", "auto, a Judge task that never answered");

        // held on the web (6a): only when the bridge returned the hold row it wrote; its words are LedgerLine's
        const string HeldLine = "Held on the web: Versions ▸ On hold · ledger #815 · receipt 7a8b9c0d1e2f3041…";
        const string GateHeldLine = "Held on the web: Versions ▸ On hold · ledger #816 · receipt 8c9d0e1f20314253…";
        var heldName = Outcome(Reply("rejected", null, 40, 40, 0, version: false)
            .Replace("\"naming\":{\"ok\":true,\"failures\":[],\"enforce\":\"reject\"}", "\"naming\":{\"ok\":false,\"failures\":[{\"reason\":\"field 2 must be the originator code\"}],\"enforce\":\"reject\"}")
            .Replace("\"agent\":null", "\"agent\":null,\"hold\":{\"id\":815,\"hash\":\"" + HoldHash + "\"}"));
        Is(PublishLines.Dialog(plan, heldName, NotStaged),
           "✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: " + Container + "\n\n" +
           GateLine + "\n" + GateRowLine + "\n" + VerdictRowLine + "\nNo version was registered and nothing was uploaded.\n" + HeldLine + "\n\n" +
           "NAMING:\n• field 2 must be the originator code\n\n" +
           "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again.",
           "rejected and held: the hold row's line under 'nothing was uploaded'");
        var heldUnconfirmed = Outcome(Reply("rejected", null, 40, 37, 3, version: false).Replace("\"agent\":null", "\"agent\":null,\"hold\":{\"id\":null,\"hash\":null}"));
        Ok(PublishLines.Dialog(plan, heldUnconfirmed, NotStaged).Contains("\nNo version was registered and nothing was uploaded.\nHeld on the web: Versions ▸ On hold · not confirmed — the bridge returned no chain hash\n\n"),
           "a hold returned without its id and hash reads not confirmed — never a receipt without its hash");
        Is(PublishLines.Doctor(plan, heldName, NotStaged),
           "Auto-publish rejected — nothing uploaded — the model name " + Container + " failed naming naming@2 · office · 77e1d2c3b4a5… · ledger #813 · receipt 0a1b2c3d4e5f6071… · " + HeldLine,
           "auto, rejected and held: the Doctor line ends with the hold row's line");
        var failedHeld = Ready(Gate(GateOutcome.Fail, "IFC2X3"));
        failedHeld.GateRow = LedgerResult.FromResponse(201, "{\"id\":812,\"hash\":\"" + GateHash + "\",\"hold\":{\"id\":816,\"hash\":\"" + GateHoldHash + "\"}}");
        Is(PublishLines.Dialog(failedHeld), PublishLines.Dialog(failed) + "\n" + GateHeldLine, "gate FAIL and held: the gate dialog ends with the hold:gate row's line after the gate row");
        Is(PublishLines.Doctor(failedHeld), PublishLines.Doctor(failed) + " · " + GateHeldLine, "auto, gate FAIL and held: the Doctor line ends with it");
```

Replace (in `tools/publish-check/publish-check.csproj`, the header comment):

```xml
       (the sidecar before the IFC, on a temp folder), every line Governed Publish and Auto-Publish print, and the
       publish@n policy decision. Compiles Publisher.cs's pure half under SENTINEL_CHECK (the Revit-typed Prepare and
```

with:

```xml
       (the sidecar before the IFC, on a temp folder), every line Governed Publish and Auto-Publish print, the
       publish@n policy decision, and (phase 6a) the delivery-gate route's body, gate_row_id on /propose, the hold row
       both replies return and the "Held on the web" lines. Compiles Publisher.cs's pure half under SENTINEL_CHECK (the Revit-typed Prepare and
```

- [ ] **Step 2: Run them — RED**

Run (repo root):

```bash
dotnet run --project tools/gate-check
dotnet run --project tools/publish-check
```

Expected: neither builds (the compiler's errors, the repo path and the trailing `[…csproj]` elided) —

```
tools\gate-check\GateLinesCheck.cs(102,39): error CS1501: No overload for method 'AuditValue' takes 4 arguments
tools\gate-check\GateLinesCheck.cs(105,78): error CS1501: No overload for method 'AuditValue' takes 4 arguments
tools\gate-check\GateLinesCheck.cs(116,78): error CS1501: No overload for method 'AuditValue' takes 4 arguments
tools\gate-check\GateLinesCheck.cs(122,78): error CS1501: No overload for method 'AuditValue' takes 4 arguments
tools\gate-check\GateLinesCheck.cs(134,44): error CS1501: No overload for method 'AuditValue' takes 4 arguments
tools\gate-check\GateLinesCheck.cs(135,36): error CS0117: 'GateLines' does not contain a definition for 'RouteFailures'
tools\gate-check\GateLinesCheck.cs(138,32): error CS1501: No overload for method 'AuditValue' takes 4 arguments
```

```
tools\publish-check\Check.cs(92,52): error CS1501: No overload for method 'RequestBody' takes 10 arguments
tools\publish-check\Check.cs(112,17): error CS1061: 'ProposalResult' does not contain a definition for 'Held' …
tools\publish-check\Check.cs(112,30): error CS1061: 'ProposalResult' does not contain a definition for 'HoldId' …
tools\publish-check\Check.cs(112,54): error CS1061: 'ProposalResult' does not contain a definition for 'HoldHash' …
tools\publish-check\Check.cs(113,144): error CS1061: 'ProposalResult' does not contain a definition for 'Held' …
tools\publish-check\Check.cs(113,157): error CS1061: 'ProposalResult' does not contain a definition for 'Held' …
tools\publish-check\Check.cs(116,79): error CS1061: 'LedgerResult' does not contain a definition for 'Hold' …
tools\publish-check\Check.cs(116,141): error CS1061: 'LedgerResult' does not contain a definition for 'Hold' …
tools\publish-check\Check.cs(118,103): error CS1061: 'LedgerResult' does not contain a definition for 'Hold' …
tools\publish-check\Check.cs(118,232): error CS1061: 'LedgerResult' does not contain a definition for 'Hold' …
tools\publish-check\Check.cs(120,47): error CS1501: No overload for method 'AuditValue' takes 4 arguments
```

(measured word for word on the scratch copy; the `…` stands for the compiler's "and no accessible extension method … (are you missing a using directive or an assembly reference?)").

- [ ] **Step 3: `GateLines.AuditValue` — the route's body; `AuditAction` goes**

Replace (in `SentinelAddin/Engine/GateLines.cs`):

```csharp
    /// <summary>The audit row's action: "IFC delivery gate PASS | FAIL | NOT CHECKED: &lt;file&gt;". This is the
    /// same message intake writes.</summary>
    public static string AuditAction(string file, GateResult r) =>
        "IFC delivery gate " + (r.Outcome switch { GateOutcome.Pass => "PASS", GateOutcome.Fail => "FAIL", _ => "NOT CHECKED" }) +
        ": " + file;

    /// <summary>The audit row's value, with the Node intake gate row's fields:
    /// <list type="bullet">
    /// <item>result: "pass" | "fail" | "not_checked"</item>
    /// <item>passed: true | false | null. Null means not checked, never a pass or a fail.</item>
    /// <item>the contract's display key and its ref · source · sha, all null when none</item>
    /// <item>entities: null when not checked</item>
    /// <item>the failure count, the file's sha256, and source "revit"</item>
    /// </list></summary>
    public static Dictionary<string, object?> AuditValue(string file, GateResult r)
    {
        var judged = r.Outcome != GateOutcome.NotChecked;
        return new Dictionary<string, object?>
        {
            ["file"] = file,
            ["result"] = r.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" },
            ["passed"] = judged ? r.Outcome == GateOutcome.Pass : (bool?)null,
            ["contract"] = judged ? r.ContractKey : null,
            ["contract_ref"] = r.ContractRef,
            ["contract_source"] = r.ContractSource,
            ["contract_sha256"] = r.ContractSha256,
            ["schema"] = r.DetectedSchema,
            ["entities"] = judged ? r.TotalEntities : (int?)null,
            ["failures"] = r.Failures.Count,
            ["sha256"] = r.FileSha256,
            ["source"] = "revit",
        };
    }
```

with:

```csharp
    /// <summary>The most failures the delivery-gate route takes in one row (it refuses a longer list).</summary>
    public const int RouteFailures = 200;

    /// <summary>The body of <c>POST /cde/:key/delivery-gate</c> (spec 2026-09-27 Decision 5), which the bridge stores
    /// as the delivery_gate row's value — it words the row "IFC delivery gate PASS | FAIL | NOT CHECKED: &lt;file&gt;"
    /// itself, as intake's:
    /// <list type="bullet">
    /// <item>result: "pass" | "fail" | "not_checked"</item>
    /// <item>passed: true | false | null. Null means not checked, never a pass or a fail.</item>
    /// <item>the contract's display key and its ref · source · sha, all null when none; schema null when not detected</item>
    /// <item>entities: null when not checked</item>
    /// <item>failures: the list itself — past <see cref="RouteFailures"/>, the first 199 and one line counting the rest
    /// (the certificate beside the IFC keeps every one)</item>
    /// <item>sha256 and size_bytes of the certified file, both null when it was never read</item>
    /// <item>source: "revit" (Governed Publish), "auto-publish" or "check" (the IFC Delivery Gate command); publish:
    /// true when a publish is judging the file — the bridge then holds a FAIL on the web (Versions ▸ On hold)</item>
    /// </list></summary>
    public static Dictionary<string, object?> AuditValue(string file, GateResult r, string source, bool publish)
    {
        var judged = r.Outcome != GateOutcome.NotChecked;
        var read = r.FileSha256.Length == 64; // IfcDeliveryGate.Seal hashed the file: its bytes were read
        var failures = r.Failures.Count <= RouteFailures
            ? r.Failures.ToList()
            : r.Failures.Take(RouteFailures - 1)
                        .Concat(new[] { "… and " + (r.Failures.Count - RouteFailures + 1) + " more — the certificate lists every one" }).ToList();
        return new Dictionary<string, object?>
        {
            ["file"] = file,
            ["result"] = r.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" },
            ["passed"] = judged ? r.Outcome == GateOutcome.Pass : (bool?)null,
            ["contract"] = judged ? r.ContractKey : null,
            ["contract_ref"] = r.ContractRef,
            ["contract_source"] = r.ContractSource,
            ["contract_sha256"] = r.ContractSha256,
            ["schema"] = r.DetectedSchema.Length > 0 ? r.DetectedSchema : null,
            ["entities"] = judged ? r.TotalEntities : (int?)null,
            ["failures"] = failures,
            ["sha256"] = read ? r.FileSha256 : null,
            ["size_bytes"] = read ? r.FileSizeBytes : (long?)null,
            ["source"] = source,
            ["publish"] = publish,
        };
    }
```

(`ToList`, `Take` and `Concat` come from the file's `using System.Linq;`. The certificate `IfcDeliveryGate.Seal` writes keeps every failure — the cap only keeps the row inside what the route accepts; the gate dialogs still print from the `GateResult`.)

- [ ] **Step 4: `LedgerResult.Hold`; `ProposalResult`'s hold and `gate_row_id`**

Replace (in `SentinelAddin/Coordination/LedgerResult.cs`, the fields and the constructor):

```csharp
    public readonly string Reason;

    private LedgerResult(LedgerState state, string reason, long? id = null, string? hash = null)
    {
        State = state;
        Reason = reason;
        Id = id;
        Hash = hash;
    }
```

with:

```csharp
    public readonly string Reason;
    /// <summary>The hold row the same write produced — the delivery-gate route's reply <c>hold {id, hash}</c> for a FAIL
    /// judged in a publish (spec 2026-09-27 Decision 5), through <see cref="FromReceipt"/>; null when the bridge returned
    /// none (a pass, a check, a refused or unreached write, a bridge before 6a).</summary>
    public readonly LedgerResult? Hold;

    private LedgerResult(LedgerState state, string reason, long? id = null, string? hash = null, LedgerResult? hold = null)
    {
        State = state;
        Reason = reason;
        Id = id;
        Hash = hash;
        Hold = hold;
    }
```

Replace (in `SentinelAddin/Coordination/LedgerResult.cs`, `FromResponse` — its doc's last line down to the 2xx return):

```csharp
    /// before any write → not recorded "HTTP n: message". Any other status → not confirmed.</summary>
    public static LedgerResult FromResponse(int status, string? body)
    {
        string? message = null, id = null, hash = null;
        try
        {
            using var d = JsonDocument.Parse(body ?? "");
            var root = d.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                message = Str(root, "message");
                if (root.TryGetProperty("receipt", out var receipt)) { id = Scalar(root, "audit_id"); hash = Str(receipt, "ledger_hash"); }
                else { id = Scalar(root, "id"); hash = Str(root, "hash"); }
            }
        }
        catch (JsonException) { /* not JSON (a proxy's page, an empty body): the status alone speaks */ }
        if (status >= 200 && status < 300) return FromReceipt(id, hash);
```

with:

```csharp
    /// before any write → not recorded "HTTP n: message". Any other status → not confirmed. A 2xx body's
    /// <c>hold {id, hash}</c> (the delivery-gate route's, phase 6a) is carried as <see cref="Hold"/>.</summary>
    public static LedgerResult FromResponse(int status, string? body)
    {
        string? message = null, id = null, hash = null;
        LedgerResult? hold = null;
        try
        {
            using var d = JsonDocument.Parse(body ?? "");
            var root = d.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                message = Str(root, "message");
                if (root.TryGetProperty("receipt", out var receipt)) { id = Scalar(root, "audit_id"); hash = Str(receipt, "ledger_hash"); }
                else { id = Scalar(root, "id"); hash = Str(root, "hash"); }
                if (root.TryGetProperty("hold", out var h) && h.ValueKind == JsonValueKind.Object) hold = FromReceipt(Scalar(h, "id"), Str(h, "hash"));
            }
        }
        catch (JsonException) { /* not JSON (a proxy's page, an empty body): the status alone speaks */ }
        if (status >= 200 && status < 300)
        {
            var row = FromReceipt(id, hash);
            return hold is null ? row : new LedgerResult(row.State, row.Reason, row.Id, row.Hash, hold);
        }
```

(The rest of `FromResponse` — the non-2xx wording — is unchanged: a 403 from the route reads `not recorded — HTTP 403: the delivery-gate route is for Sentinel's machine credential`, and carries no hold.)

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, the reply fields):

```csharp
    public string? VerdictHash;
    public string? Downgraded;
```

with:

```csharp
    public string? VerdictHash;
    public string? Downgraded;
    // The hold:<stage> row the bridge wrote for this refusal (spec 2026-09-27 Decision 4): the reply's hold {id, hash}.
    // Held is false when the reply's hold is null or absent — a refusal the bridge does not hold (no register, a client
    // standard, a caller who could not register) or a bridge before 6a; HoldId / HoldHash stay null when it omits them.
    public bool Held;
    public string? HoldId, HoldHash;
```

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, `RequestBody`'s doc end and signature):

```csharp
    /// name = container_name) and only when given; every other key as before.</summary>
    public static Dictionary<string, object?> RequestBody(object elements, string? versionId, string actor, string? containerName,
                                                          string? source, string? note, bool raiseBcf, string? failuresRequirement,
                                                          RegisterRequest? register)
```

with:

```csharp
    /// name = container_name) and only when given; <paramref name="gateRowId"/> as <c>gate_row_id</c> only when it is a
    /// ledger id (the Publisher's recorded gate row, phase 6a); every other key as before.</summary>
    public static Dictionary<string, object?> RequestBody(object elements, string? versionId, string actor, string? containerName,
                                                          string? source, string? note, bool raiseBcf, string? failuresRequirement,
                                                          RegisterRequest? register, long? gateRowId = null)
```

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, the end of `RequestBody`):

```csharp
            body["register"] = new Dictionary<string, object?> { ["name"] = register.Name, ["size_bytes"] = register.SizeBytes, ["sha256"] = register.Sha256 };
        return body;
```

with:

```csharp
            body["register"] = new Dictionary<string, object?> { ["name"] = register.Name, ["size_bytes"] = register.SizeBytes, ["sha256"] = register.Sha256 };
        if (gateRowId is > 0) body["gate_row_id"] = gateRowId.Value;
        return body;
```

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, `Parse`):

```csharp
        r.VerdictHash = Str(root, "verdict_hash");
```

with:

```csharp
        r.VerdictHash = Str(root, "verdict_hash");
        if (root.TryGetProperty("hold", out var hd) && hd.ValueKind == JsonValueKind.Object) { r.Held = true; r.HoldId = Scalar(hd, "id"); r.HoldHash = Str(hd, "hash"); }
```

- [ ] **Step 5: `Publisher` — Prepare's source, `gate_row_id` from Judge, the hold rows, the held lines**

Replace (in `SentinelAddin/Engine/Publisher.cs`, `Prepare`'s doc end and signature):

```csharp
    /// its ledger row (waited, ≤ 6 s, so the row lands before /propose); the elements read for the referee. An unbound
    /// document, a failed export, a gate FAIL or a throw after the export leaves <see cref="PublishPlan.Ready"/> false with the temp IFC
    /// discarded: <see cref="PublishLines.Dialog(PublishPlan,PublishOutcome?,StageResult?)"/> says which. Revit API
    /// only here; the plan carries no Revit object.
    /// </summary>
    public static PublishPlan Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null)
```

with:

```csharp
    /// its ledger row (waited, ≤ 6 s, so the row lands before /propose) — posted to <c>/cde/:key/delivery-gate</c> with
    /// <paramref name="source"/> ("revit" from Governed Publish, "auto-publish" from Auto-Publish) and publish true, so
    /// the bridge holds a FAIL on the web and <see cref="PublishPlan.GateRow"/>'s <see cref="LedgerResult.Hold"/> names
    /// that hold row; the elements read for the referee. An unbound
    /// document, a failed export, a gate FAIL or a throw after the export leaves <see cref="PublishPlan.Ready"/> false with the temp IFC
    /// discarded: <see cref="PublishLines.Dialog(PublishPlan,PublishOutcome?,StageResult?)"/> says which. Revit API
    /// only here; the plan carries no Revit object.
    /// </summary>
    public static PublishPlan Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null, string source = "revit")
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, step 0 of `Prepare` — the contract pair is renamed so the new parameter does not shadow it):

```csharp
        var (contract, source) = Task.Run(() => resolve is null ? DeliveryContract.Load(key) : DeliveryContract.FromResolved(resolve("contract", null))).GetAwaiter().GetResult();
        plan.Contract = contract;
        plan.ContractSource = source;
```

with:

```csharp
        var (contract, contractSource) = Task.Run(() => resolve is null ? DeliveryContract.Load(key) : DeliveryContract.FromResolved(resolve("contract", null))).GetAwaiter().GetResult();
        plan.Contract = contract;
        plan.ContractSource = contractSource;
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, step 2 of `Prepare`):

```csharp
            plan.Gate = IfcDeliveryGate.Validate(path, contract, source);
            plan.SizeBytes = plan.Gate.FileSizeBytes;
            plan.Sha256 = plan.Gate.FileSha256;
            var gate = plan.Gate;
            var name = plan.ContainerName;
            plan.GateRow = Task.Run(() => GovernedNotify.DeliveryGate(name, gate, key)).GetAwaiter().GetResult();
```

with:

```csharp
            plan.Gate = IfcDeliveryGate.Validate(path, contract, contractSource);
            plan.SizeBytes = plan.Gate.FileSizeBytes;
            plan.Sha256 = plan.Gate.FileSha256;
            var gate = plan.Gate;
            var name = plan.ContainerName;
            plan.GateRow = Task.Run(() => GovernedNotify.DeliveryGate(name, gate, key, source, publish: true)).GetAwaiter().GetResult();
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `Judge` and its doc, from the doc's first line after `/// <summary>`):

```csharp
    /// The one referee call, OFF the API thread (the plan holds no Revit object): <c>POST /cde/:key/propose</c> with
    /// the elements, <c>container_name</c> and <c>register {name, size_bytes, sha256}</c> — the bridge judges by the
    /// project's ids@n and naming@n, writes one proposal row, and on accepted or recorded registers the version (wip,
    /// no geometry) and stamps the verdict on it; a rejected verdict registers nothing. Blocking (120 s cap); never
    /// throws — an unreached bridge is <see cref="PublishOutcome.Reached"/> false. <paramref name="source"/> is the
    /// proposal row's "from": "Governed Publish", or "Auto-Publish".
    /// </summary>
    public static PublishOutcome Judge(PublishPlan plan, string source = "Governed Publish") =>
        PublishOutcome.From(GovernedNotify.Propose(plan.Elements, versionId: null, actor: "Revit", projectKey: plan.Key,
            containerName: plan.ContainerName, source: source,
            register: new RegisterRequest { Name = plan.ContainerName, SizeBytes = plan.SizeBytes, Sha256 = plan.Sha256 }));
```

with:

```csharp
    /// The one referee call, OFF the API thread (the plan holds no Revit object): <c>POST /cde/:key/propose</c> with
    /// the elements, <c>container_name</c>, <c>register {name, size_bytes, sha256}</c> and <c>gate_row_id</c> (the gate
    /// row's ledger id, when it was recorded) — the bridge judges by the project's ids@n and naming@n, writes one
    /// proposal row naming the file and its gate row, and on accepted or recorded registers the version (wip, no
    /// geometry) and stamps the verdict on it; a rejected verdict registers nothing and, judged by installed standards,
    /// is held on the web (<see cref="PublishOutcome.HoldRow"/>). Blocking (120 s cap); never throws — an unreached
    /// bridge is <see cref="PublishOutcome.Reached"/> false. <paramref name="source"/> is the proposal row's "from":
    /// "Governed Publish", or "Auto-Publish" (the bridge's hold names them revit and auto-publish).
    /// </summary>
    public static PublishOutcome Judge(PublishPlan plan, string source = "Governed Publish") =>
        PublishOutcome.From(GovernedNotify.Propose(plan.Elements, versionId: null, actor: "Revit", projectKey: plan.Key,
            containerName: plan.ContainerName, source: source,
            register: new RegisterRequest { Name = plan.ContainerName, SizeBytes = plan.SizeBytes, Sha256 = plan.Sha256 },
            gateRowId: plan.GateRow.Id));
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `PublishPlan`):

```csharp
    public LedgerResult GateRow = LedgerResult.NotRecorded("the gate did not run");
```

with:

```csharp
    /// <summary>The gate row as the bridge answered; on a FAIL its <see cref="LedgerResult.Hold"/> is the hold:gate row.</summary>
    public LedgerResult GateRow = LedgerResult.NotRecorded("the gate did not run");
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `PublishOutcome`):

```csharp
    public LedgerResult StampRow => LedgerResult.FromReceipt(Verdict.VerdictAuditId, Verdict.VerdictHash);
```

with:

```csharp
    public LedgerResult StampRow => LedgerResult.FromReceipt(Verdict.VerdictAuditId, Verdict.VerdictHash);
    /// <summary>The hold:&lt;stage&gt; row the bridge wrote for a refused registration (the reply's hold {id, hash});
    /// null when it returned none; not confirmed when the hold came back without its id or hash.</summary>
    public LedgerResult? HoldRow => Reached && Verdict.Held ? LedgerResult.FromReceipt(Verdict.HoldId, Verdict.HoldHash) : null;
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, the end of `PublishLines`' doc comment):

```csharp
/// answer); the version is claimed only from the reply; "receipt" appears only with a hash the bridge returned (the
/// proposal row's receipt.ledger_hash, the stamp row's verdict_hash). Pure.</summary>
```

with:

```csharp
/// answer); the version is claimed only from the reply; "receipt" appears only with a hash the bridge returned (the
/// proposal row's receipt.ledger_hash, the stamp row's verdict_hash, a hold row's hash); "Held on the web" only when
/// the bridge returned the hold row it wrote. Pure.</summary>
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `PublishLines`' row helpers):

```csharp
    public static string VerdictRow(PublishOutcome o) => "Verdict row: " + LedgerLine.For(o.VerdictRow);
```

with:

```csharp
    public static string VerdictRow(PublishOutcome o) => "Verdict row: " + LedgerLine.For(o.VerdictRow);

    /// <summary>"Held on the web: Versions ▸ On hold · ledger #815 · receipt 7a8b9c0d1e2f3041…" (spec 2026-09-27 Decision
    /// 9) — printed only when the bridge returned the hold row it wrote for this refusal (the /propose reply's hold, or
    /// the delivery-gate route's for a gate FAIL); the ledger words are <see cref="LedgerLine"/>'s.</summary>
    public static string Held(LedgerResult hold) => "Held on the web: Versions ▸ On hold · " + LedgerLine.For(hold);
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `Dialog`'s refusal branch):

```csharp
                 : p.GateFailed ? GateLines.PublishRejected(p.Gate) + "\n\n" + GateRow(p)
```

with:

```csharp
                 : p.GateFailed ? GateLines.PublishRejected(p.Gate) + "\n\n" + GateRow(p) + (p.GateRow.Hold is { } gateHold ? "\n" + Held(gateHold) : "")
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `Dialog`'s rejection):

```csharp
                   gateLine + "\n" + GateRow(p) + "\n" + VerdictRow(o) + "\n" +
                   "No version was registered and nothing was uploaded.\n\n" +
```

with:

```csharp
                   gateLine + "\n" + GateRow(p) + "\n" + VerdictRow(o) + "\n" +
                   "No version was registered and nothing was uploaded.\n" +
                   (o.HoldRow is { } hold ? Held(hold) + "\n" : "") + "\n" +
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, `Doctor`'s gate FAIL):

```csharp
        if (p.GateFailed) return "Auto-publish rejected — nothing uploaded — delivery gate " + GateLines.Verdict(p.Gate, p.Key) + " · " + p.Gate.Failures.Count + " failure(s) · gate row: " + LedgerLine.For(p.GateRow);
```

with:

```csharp
        if (p.GateFailed) return "Auto-publish rejected — nothing uploaded — delivery gate " + GateLines.Verdict(p.Gate, p.Key) + " · " + p.Gate.Failures.Count + " failure(s) · gate row: " + LedgerLine.For(p.GateRow) +
                                 (p.GateRow.Hold is { } gateHold ? " · " + Held(gateHold) : "");
```

Replace (in `SentinelAddin/Engine/Publisher.cs`, the end of `Doctor`'s rejection):

```csharp
                   " · " + LedgerLine.For(o.VerdictRow);
```

with:

```csharp
                   " · " + LedgerLine.For(o.VerdictRow) + (o.HoldRow is { } hold ? " · " + Held(hold) : "");
```

(`Prepare` and `Judge` sit under `#if !SENTINEL_CHECK`: the harness compiles the rest. `Prepare` does not compile against `GovernedNotify` until Step 7 — the add-in builds run at Step 8.)

- [ ] **Step 6: Run the harnesses — GREEN**

Run (repo root):

```bash
dotnet run --project tools/gate-check
dotnet run --project tools/publish-check
```

Expected: `122/122 checks pass` (master 121: section 5 went from 5 checks to 6 — the `AuditAction` check gone; the route body's keys, PASS, FAIL, NOT CHECKED, the 200-failure cap and the never-read file), its new lines:

```
  PASS  route body: the gate row's fields, in order, then size_bytes, source and publish
  PASS  route body: PASS carries passed true, the contract's ref · source · sha, no failure, the size, the source and publish
  PASS  route body: FAIL carries passed false and every failure itself — no longer a count
  PASS  route body: NOT CHECKED carries passed null, no contract, no entity count — but the file's sha; the IFC gate's own check publishes nothing
  PASS  route body: past 200 failures, the first 199 and one line counting the rest (the route refuses a longer list)
  PASS  route body: a file that was never read sends sha256, size_bytes and schema null — never an empty hash
```

and `112/112 checks pass` (master 101), its new lines:

```
  PASS  the Publisher's /propose names its recorded gate row: gate_row_id after register (6a)
  PASS  a rejected reply's hold {id, hash} is read
  PASS  hold null, or no hold key (a bridge before 6a), is no hold
  PASS  the delivery-gate route's 201 {id, hash, hold}: the gate row, and its hold row as Hold
  PASS  hold null, or a refused write, carries no hold
  PASS  Prepare's gate row body for /cde/:key/delivery-gate: the gate, every failure, sha256 and size_bytes, the caller's source, publish true
  PASS  rejected and held: the hold row's line under 'nothing was uploaded'
  PASS  a hold returned without its id and hash reads not confirmed — never a receipt without its hash
  PASS  auto, rejected and held: the Doctor line ends with the hold row's line
  PASS  gate FAIL and held: the gate dialog ends with the hold:gate row's line after the gate row
  PASS  auto, gate FAIL and held: the Doctor line ends with it
```

Every master check of both harnesses still passes unchanged — the dialogs and Doctor lines without a hold are master's, word for word.

- [ ] **Step 7: `GovernedNotify.DeliveryGate` on the route; `Propose`'s `gateRowId`; the three callers**

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`):

```csharp
        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) on the ledger. The web CDE timeline then shows the
        /// certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The row names
        /// the contract that judged (contract_ref · contract_source · contract_sha256), all null when none was
        /// installed. <c>passed</c> is null when nothing was judged; every reader treats null as not checked, never as
        /// a pass or a fail. The row is <see cref="Sentinel.Engine.GateLines.AuditValue"/>, which has the Node intake
        /// gate row's shape and is pinned by tools/gate-check. <c>sha256</c> ties it to the exact bytes certified.
        /// The IFC gate and Governed Publish wait for the answer and print its line.
        /// </summary>
        public static LedgerResult DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey) =>
            Event("/audit", new
            {
                entity_type = "delivery_gate",
                actor = "Revit",
                action = Sentinel.Engine.GateLines.AuditAction(fileName, gate),
                new_value = Sentinel.Engine.GateLines.AuditValue(fileName, gate),
            }, projectKey);
```

with:

```csharp
        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) on the ledger through <c>POST /cde/:key/delivery-gate</c> (spec
        /// 2026-09-27 Decision 5), the route only the machine credential may call — the open audit route refuses
        /// entity_type delivery_gate since 6a, so no signed-in member can forge a gate row. The web CDE timeline then
        /// shows the certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The
        /// bridge words the row itself and stores <see cref="Sentinel.Engine.GateLines.AuditValue"/> as its value (pinned
        /// by tools/gate-check and tools/publish-check): the contract that judged (all null when none), <c>passed</c>
        /// null when nothing was judged, every failure, and the file's sha256 and size. <paramref name="source"/> is
        /// "revit" (Governed Publish), "auto-publish" or "check" (the IFC Delivery Gate command); with
        /// <paramref name="publish"/> a FAIL is also held on the web and the reply's hold row comes back as
        /// <see cref="LedgerResult.Hold"/>. The IFC gate and the Publisher wait for the answer and print its line.
        /// </summary>
        public static LedgerResult DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey,
                                                string source, bool publish) =>
            Event("/delivery-gate", Sentinel.Engine.GateLines.AuditValue(fileName, gate, source, publish), projectKey);
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, the end of `Propose`'s doc):

```csharp
        /// <see cref="ProposalResult.VerdictAuditId"/>; a rejected verdict registers nothing. Blocking (120s cap);
        /// never throws: <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
```

with:

```csharp
        /// <see cref="ProposalResult.VerdictAuditId"/>; a rejected verdict registers nothing, and the bridge answers the
        /// hold row it wrote for it, if any (<see cref="ProposalResult.Held"/>). <paramref name="gateRowId"/> (the
        /// Publisher: its gate row's ledger id) lets the proposal row name the gate row it follows. Blocking (120s cap);
        /// never throws: <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, the end of `Propose`'s signature down to its body):

```csharp
                                             string? failuresRequirement = null, RegisterRequest? register = null)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
                var body = ProposalResult.RequestBody(elements, versionId, actor, containerName, source, note, raiseBcf, failuresRequirement, register);
```

with:

```csharp
                                             string? failuresRequirement = null, RegisterRequest? register = null,
                                             long? gateRowId = null)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
                var body = ProposalResult.RequestBody(elements, versionId, actor, containerName, source, note, raiseBcf, failuresRequirement, register, gateRowId);
```

Replace (in `SentinelAddin/Engine/AutoPublish.cs`, `Run`):

```csharp
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "auto"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout));
```

with:

```csharp
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "auto"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout), "auto-publish");
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`):

```csharp
        var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout));
```

with:

```csharp
        var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout), "revit");
```

Replace (in `SentinelAddin/Commands.IfcGate.cs`, `Certify`):

```csharp
        // Record the gate verdict and the contract that judged on the document's web project ledger and wait for the
        // answer OFF this thread (≤ 6 s) — both callers are API contexts: the command body and the export's event job.
        // The dialog ends with what the ledger answered: "Recorded: ledger #<id> · receipt <16 hex>…", not confirmed,
        // not recorded, or — unbound — nothing sent.
        var ledger = Task.Run(() => Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey)).GetAwaiter().GetResult();
```

with:

```csharp
        // Record the gate verdict and the contract that judged on the document's web project ledger (POST
        // /cde/:key/delivery-gate, source "check", publish false: a check holds nothing on the web) and wait for the
        // answer OFF this thread (≤ 6 s) — both callers are API contexts: the command body and the export's event job.
        // The dialog ends with what the ledger answered: "Recorded: ledger #<id> · receipt <16 hex>…", not confirmed,
        // not recorded, or — unbound — nothing sent.
        var ledger = Task.Run(() => Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey, "check", publish: false)).GetAwaiter().GetResult();
```

(`Commands.BcfIssues.cs`'s two `GovernedNotify.Propose` calls use named arguments and send no gate row: unchanged. Fix-in-place does not call `Propose`.)

- [ ] **Step 8: Both builds, every harness, the deleted name**

Run (repo root):

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `0 Error(s)` on both. 2024: `6 Warning(s)` — `Commands.BcfIssues.cs(322,31)` CS4014, `Commands.GhostBuilder.cs(220,38)` CS0618, `Engine\RuleRegex.cs(17,89)` and `(20,78)` CS8602, `GhostBuilder\ChangesetExecutor.cs(164,30)` CS0618, `GhostBuilder\GhostBuilderOrchestrator.cs(112,41)` CS0618. 2025: `3 Warning(s)` — `Commands.Annotate.cs(76,59)` and `(88,59)` CS8600, `Commands.BcfIssues.cs(322,31)` CS4014. Master's sets (measured on c7dcbf6 before and after this task); no new warning. Revit may be running: `-p:DeployToRevit=false` never touches its Addins folder.

Run:

```bash
dotnet run --project tools/publish-check
dotnet run --project tools/gate-check
dotnet run --project tools/event-check
dotnet run --project tools/fixplace-check
dotnet run --project tools/artefact-cache-check
dotnet run --project tools/roi-check
dotnet run --project tools/ghost-standards-check
dotnet run --project tools/naming-check
dotnet run --project tools/org-check
dotnet run --project tools/snapshot-check
dotnet run --project tools/heal-check
dotnet run --project tools/project-context-check
```

Expected: `112/112`; `122/122`; `44/44` (it compiles `LedgerResult.cs`); `52/52` (it compiles `ProposalResult.cs`); `53/53`; `43/43`; `135/135`; `37/37`; `46/46`; `21/21`; `9/9`; `19/19`.

Run:

```bash
git grep -n "AuditAction" -- SentinelAddin tools
```

Expected: nothing (master: 5 hits — `GateLines.cs`, `GovernedNotify.cs`, and three in `GateLinesCheck.cs`).

- [ ] **Step 9: Commit**

```bash
git add SentinelAddin/Engine/GateLines.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Coordination/LedgerResult.cs SentinelAddin/Coordination/ProposalResult.cs SentinelAddin/Engine/Publisher.cs SentinelAddin/Engine/AutoPublish.cs SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Commands.IfcGate.cs tools/gate-check/GateLinesCheck.cs tools/publish-check/Check.cs tools/publish-check/publish-check.csproj
git commit -m "feat(revit): the gate row goes to POST /cde/:key/delivery-gate — the machine credential's route — with every failure (≤ 200), size_bytes, the caller's source (revit | auto-publish | check) and publish (true from the Publisher, false from the IFC Gate); Publisher.Prepare takes the source; Judge's /propose carries gate_row_id when the gate row was recorded; the hold row both replies return is read (ProposalResult.Held, LedgerResult.Hold) and Governed Publish's rejection dialog and the auto-publish Doctor line print 'Held on the web: Versions ▸ On hold · ledger #id · receipt …' only when the bridge returned it; GateLines.AuditAction deleted (the bridge words the row); gate-check 122/122, publish-check 112/112 (cohesion phase 6a, spec 2026-09-27 Decisions 4-6 and 9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

No change. Applied as written after Tasks 1-3 and measured.
- RED: gate-check has the 7 compile errors and publish-check the 11, exactly as listed.
- GREEN: gate-check 122/122, publish-check 112/112.
- Both add-in builds (-p:DeployToRevit=false): 0 errors; 2024 has 6 warnings and 2025 has 3, the same warnings as master.
- event-check 44, fixplace-check 52, artefact-cache-check 53, roi-check 43, ghost-standards-check 135, naming-check 37, org-check 46, snapshot-check 21, heal-check 9, project-context-check 19.
- `git grep AuditAction -- SentinelAddin tools` prints nothing.
- The only other open-route writer in the add-in is Commands.Phase2.cs's family_heal row, which is still accepted. No web or bridge code posts delivery_gate rows to /audit.
- Threading is unchanged: Prepare stays on the API thread and waits for the gate row with Task.Run(...).GetAwaiter().GetResult(); Judge runs off it.

(controller) **Name the tab the user sees.** The web tab that holds the Versions panel is labelled `Project Files` (`WebApp/src/main.ts`), so every surface prints `Project Files ▸ On hold`, never `Versions ▸ On hold`: in Task 4 the held line is `Held on the web: Project Files ▸ On hold · ` + `LedgerLine.For(hold)` (change the one string and the publish-check pins that quote it — the total stays 112/112), and in Task 5 every quote of that line and every instruction naming the list says `Project Files ▸ On hold` (the section's own heading in the panel stays `On hold (n)`).

---

### Task 5: Docs — Session B12 (the Holding Area) in the testing protocol, the Holding Area capability row (🟩 Built, naming what moves it to ✅), and every line the handbook, the user guide and the verdict contract say that 6a makes untrue (the web upload path, the gate row's route, the reserved rows, the held list)

(Every block below was applied, as written, to the same archive `scratchpad\p6aB` (the applier `scratchpad\p6aB_t5_pairs.py` + `p6aB_apply_multi.py`; every quoted old text matched exactly once, the files stayed CRLF) and checked: B12 sits between B11 and Session C with 26 rows, every row exactly two cells (no `|` inside a cell); the setup block was run in a scratch folder against the working tree — it writes the twelve `.json` files and the three corrected `.ifc`s — and its fixtures were judged by the bridge's own `sentinel-core.mjs` and `ifc-extract.mjs`: `ids.json` rejects `minimal.ifc` (four failures, three of three elements failing) and accepts the corrected copy (three of three), `elements-draft.json` rejected with four failures, `elements-fixed.json` accepted six of six; `bds-naming-ruleset.json` (a valid `naming` artefact) rejects `B12-N.ifc` with `expected 11 '-'-separated fields (…), got 2` and accepts `BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc`. No code changes; the builds, the harnesses and the suite stay as Task 4 left them.)

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (`## Session B12 — the Holding Area` inserted before `## Session C — Validate panel (the referee's home turf)`, after B11's Honesty row and its blank line)
- Modify: `docs/handbook/05-capability-status.md` (the Holding Area row inserted before `| One-button Revit command + governance ribbon |`; the Governed Intake row's last cell, the 5a row's reserved-rows sentence and its behaviour change, the File versioning row)
- Modify: `docs/SENTINEL_HANDBOOK.md` (the lifecycle diagram's fail branch; the IFC Delivery Gate, Governed Publish and Auto-publish rows; the Projects row's Project Files; the `/cde/*` and `/ifc` rows; §7's point 2)
- Modify: `SENTINEL-USER-GUIDE.md` (the Auto-publish bullet; the IFC Delivery Gate row)
- Modify: `docs/verdict-contract.md` (§1's request gains `gate_row_id`; §2's reply gains `hold`; the audit route's reserved list; a paragraph "A refusal is held, not kept" before `## 3. Provenance is claimed, never verified`)
- Not modified, checked: `docs/TESTING_PROTOCOL.md:257` (B9's `A web upload never lands on a judged version` — B12's preamble says it is superseded; B9 stays the record of its drill); `docs/handbook/07-decisions.md` (the spec is the decision record for 6a; no D-15 here); `docs/PILOT_DEMO_RUNBOOK.md`, `docs/testing/SIMULATION_ROOM.md`, `WebApp/README.md` (name neither the Versions upload nor a gate row's route); `docs/CAPABILITY_MAP.md` (a dated snapshot).
- Read for reference: spec `:67-72` (the 6a definition of done), `:83-143` (Decisions 1-9), `:196-200` (the 6a behaviour changes), `:209-220` (Testing 6a); the strings Tasks 1-4 pin — `hold: rows are written by Sentinel, not through this route`, `hold rows …`, `delivery_gate rows …` (Task 1), `the delivery-gate route is for Sentinel's machine credential` and the gate route's `201 {id, hash, hold}` with action `IFC delivery gate PASS | FAIL | NOT CHECKED: <file>` (Task 1), `hold:<stage> <container_name>` and its `new_value` (Task 1), `/propose`'s and intake's `hold` (Task 1), `GET /cde/:key/holding`'s `{items, cleared_recent}`, `naming_note` `the corrected file carries a new name — a lead dismisses this entry once it is registered`, the 502 `not read — <reason>`, `hold:dismissed <container_name>` (Task 2), the web's lines (Task 3, above), `Held on the web: Versions ▸ On hold · ` + `LedgerLine.For(hold)` (Task 4); `docs/TESTING_PROTOCOL.md:203-233` and `:263-362` (B9, B10 and B11: `| Step | Pass criteria |`, no `|` inside a cell, the shell block with `W`, `B`, `T` and `c`); `:287-298` (B10's Revit dialog and Doctor lines, and `publish@1`/`publish@2` on `demo`); `WebApp/bridge/intake.mjs:26-45` (the CLI's `line()` — labels padded to 14, `REJECTED (<stage>)`, `ledger audit #<id> · receipt <16 hex>…`, exit 2 on a rejection); `WebApp/bridge/fixtures/minimal.ifc`; `demo/bds-pilot/ids.json`, `elements-draft.json`, `elements-fixed.json`, `bds-naming-ruleset.json`; `SentinelAddin/Engine/GateLines.cs:69-110` (the gate dialog, action and row shape); `docs/handbook/05-capability-status.md:1-8`, `:10`, `:19`, `:22-23`, `:37`; `docs/SENTINEL_HANDBOOK.md:41`, `:79`, `:88-89`, `:115`, `:156`, `:160`, `:196`; `SENTINEL-USER-GUIDE.md:10`, `:27`; `docs/verdict-contract.md:36`, `:60-62`, `:90-92`, `:104-108`.

**Interfaces:** none (docs). Every quoted bridge, web and Revit text is one Tasks 1-4 pin; a B12 row never promises what a task did not build. Where a task's exact words are not pinned (the gate route's 400 for a bad `result`, the dismiss route's 400, publish-check's new total and any harness total Task 4 moves), the row says `<Task n's words>` / `at the total Task n's commit states` and the controller pastes them before the drill (Cross-task notes).

- [ ] **Step 1: Session B12 in `docs/TESTING_PROTOCOL.md`**

(1) Session B12, inserted before Session C (B11's Honesty row and its blank line stay above it) — in `docs/TESTING_PROTOCOL.md` replace:

````markdown
## Session C — Validate panel (the referee's home turf)
````

with:

````markdown
## Session B12 — the Holding Area

A file the referee refuses is not lost: it is held on its project — Project Files ▸ On hold (the Versions panel), with the stage that refused it, every failure and the refusal's `ledger #id · receipt …` — until a corrected file is registered under the same name or a lead dismisses it with a reason; nothing of a refused file is stored (no bytes, no platform item, no version). The web Versions upload goes through Governed Intake (`POST /cde/:key/intake?source=web`), judged before anything is stored; Revit's delivery-gate row goes through `POST /cde/:key/delivery-gate`, open only to Sentinel's machine credential; the open audit route refuses `hold:` actions and `hold` and `delivery_gate` rows. A hold is written only for a refusal of a file that was to be registered (`/propose` with `register`, intake, Governed Publish, auto-publish), judged by the standards installed on the project or its office, for a caller who could register it (the machine credential, or a signed-in contributor or above). These rows supersede B9's `A web upload never lands on a judged version` row (the Versions upload no longer posts to `/ifc`), and every earlier row whose `delivery_gate` row went through `POST /cde/:key/audit` now reads it from the gate route. The add-in and the bridge deploy together: an add-in from before 6a gets a 400 on the open route and prints its `not recorded — …` line. The bridge and web rows run on a test project; the Revit rows on the pilots (Demo's gate FAIL and Aster Tower's naming reject, each dismissed by the end). Shell for the bridge rows — Git Bash, the managed bridge up on the branch; `c` calls the bridge with its token, the machine credential; `cj` calls it as you, signed in, once the gate-route row sets `J`:

```bash
cd WebApp
W=$(pwd -W)
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
SHA=$(printf b12 | sha256sum | cut -c1-64)
mkdir -p /tmp/b12/fixed && cd /tmp/b12
c() { curl -s -w " %{http_code}" -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$@"; echo; }
cj() { curl -s -w " %{http_code}" -H "Authorization: Bearer $J" -H "Content-Type: application/json" "$@"; echo; }
cp "$W/bridge/fixtures/minimal.ifc" B12-W.ifc
cp "$W/bridge/fixtures/minimal.ifc" B12-I.ifc
sed -e "s/'Wall-1'/'ARC-Wall-1'/; s/'Slab-1'/'STR-Slab-1'/; s/'Door-1'/'ARC-Door-1'/; s/'Reference'/'FireRating'/" "$W/bridge/fixtures/minimal.ifc" > fixed/B12-W.ifc
cp fixed/B12-W.ifc fixed/B12-I.ifc
cp fixed/B12-W.ifc fixed/BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc
echo '{"auto":true}' > publish-on.json
echo '{"auto":false}' > publish-off.json
node -e "
const fs = require('fs'), [W, sha] = process.argv.slice(1);
const el = (f) => JSON.parse(fs.readFileSync(W + '/../demo/bds-pilot/' + f + '.json', 'utf8'));
const put = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const reg = (name) => ({ name, size_bytes: 2456, sha256: sha });
const two = ['Schema IFC2X3 - the contract asks IFC4', { requirement: 'Proxy ratio', detail: '12% proxies, the cap is 5%' }];
const gate = (file, result, passed, failures, source, publish) => ({ file, result, passed, contract: 'b12-contract', contract_ref: 'contract@1', contract_source: 'project', contract_sha256: sha, schema: 'IFC4', entities: 42, failures, sha256: sha, size_bytes: 2456, source, publish });
put('gate-check.json', gate('B12-C.ifc', 'fail', false, two, 'check', false));
put('gate-fail.json', gate('B12-G.ifc', 'fail', false, two, 'revit', true));
put('gate-pass.json', gate('B12-S.ifc', 'pass', true, [], 'revit', true));
put('gate-bad.json', gate('B12-G.ifc', 'maybe', false, two, 'revit', true));
put('forge-gate.json', { entity_type: ' Delivery_Gate ', action: 'IFC delivery gate PASS: B12-X.ifc', actor: 'b12', new_value: { file: 'B12-X.ifc', result: 'pass', passed: true } });
put('reject-p.json', { source: 'b12', elements: el('elements-draft'), container_name: 'B12-P.ifc', register: reg('B12-P.ifc'), raise_bcf: false });
put('plain-p.json', { source: 'b12', elements: el('elements-draft'), container_name: 'B12-Q.ifc', raise_bcf: false });
put('recorded-g.json', { source: 'b12', elements: [], container_name: 'B12-G.ifc', register: reg('B12-G.ifc') });
put('accept-i.json', { source: 'b12', elements: el('elements-fixed'), container_name: 'B12-I.ifc', register: reg('B12-I.ifc') });
put('accept-w.json', { source: 'b12', elements: el('elements-fixed'), container_name: 'B12-W.ifc', register: reg('B12-W.ifc') });
" "$W" "$SHA"
ls . fixed
```

`ls` lists `B12-I.ifc`, `B12-W.ifc` (copies of `minimal.ifc`: the `ids@1` below rejects them, four failures, three of three elements failing), twelve `.json` files and `fixed/` with `B12-I.ifc`, `B12-W.ifc` and `BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc` (the same model with `ARC-`/`STR-` names and the door's `FireRating`: accepted, three of three; the last name follows `bds-naming-ruleset.json`). Read each `<…>` off a reply, a dialog or a log and keep it where a later row uses it.

| Step | Pass criteria |
|---|---|
| Deploy | Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; from the repo root `dotnet run --project tools/publish-check` ends `<n>/<n> checks pass` at the total Task 4's commit states (master 101), and `tools/gate-check`, `tools/event-check`, `tools/artefact-cache-check`, `tools/roi-check` and `tools/ghost-standards-check` end at theirs (master 121, 44, 53, 43, 135); `cd "$W" && npm test` ends green at the total Task 3's commit states (Task 3 alone on master's tree: `Test Files  87 passed (87)`, `Tests  1202 passed (1202)`) and `npx tsc --noEmit -p .` prints 23 errors (master's 24 less `files-panel.ts`'s, which went with `sha256Hex`); the managed bridge restarted on the branch (the outbox watcher is untouched by 6a); the web app served from the branch |
| Test project | create `b12-hold` in the web (Projects → + New project), no office, you its owner; `node "$W/bridge/artefact-import.mjs" "$W/../demo/bds-pilot/ids.json" --project b12-hold --kind ids` → `Installed on b12-hold: ids@1 · project · <sha 12>… · by cli`; `c "$B/cde/b12-hold/holding"` → ` 200` `{"items":[],"cleared_recent":[]}` |
| The audit route refuses the reserved rows | `c -X POST "$B/cde/b12-hold/audit" -d '{"entity_type":"event","action":"hold:gate B12-X.ifc","actor":"b12"}'` → ` 400` `hold: rows are written by Sentinel, not through this route`; `-d '{"entity_type":"event","action":"  HOLD:dismissed B12-X.ifc","actor":"b12"}'` → the same 400 (case and surrounding spaces ignored); `-d '{"entity_type":"hold","action":"b12 note","actor":"b12"}'` → ` 400` `hold rows are written by Sentinel, not through this route`; `-d @forge-gate.json` (entity_type ` Delivery_Gate `) → ` 400` `delivery_gate rows are written by Sentinel, not through this route`; `-d '{"entity_type":"event","action":"b12 note","actor":"b12"}'` → ` 201`; `c "$B/cde/b12-hold/audit?entity_type=hold"` and `c "$B/cde/b12-hold/audit?entity_type=delivery_gate"` → `total: 0` each |
| The gate route refuses a signed-in member | signed in to the web app as the owner of `b12-hold`: DevTools ▸ Network ▸ any bridge request (e.g. `members/me`) ▸ its `authorization: Bearer …` request header → `J=<the token after Bearer>` (your own session, valid about an hour); `cj -X POST "$B/cde/b12-hold/delivery-gate" -d @gate-fail.json` → ` 403` `the delivery-gate route is for Sentinel's machine credential` (the owner too: only the machine credential passes); `cj -X POST "$B/cde/b12-hold/audit" -d @forge-gate.json` → ` 400` `delivery_gate rows are written by Sentinel, not through this route`; `c "$B/cde/b12-hold/audit?entity_type=delivery_gate"` → `total: 0`; then `unset J` |
| The gate route validates | `c -X POST "$B/cde/b12-hold/delivery-gate" -d @gate-bad.json` (`result: "maybe"`) → ` 400` (Task 1's words for `result`); `c "$B/cde/b12-hold/audit?entity_type=delivery_gate"` → `total: 0` (a refusal writes nothing) |
| A check holds nothing | `c -X POST "$B/cde/b12-hold/delivery-gate" -d @gate-check.json` → ` 201` with `id` `<gc>`, a 64-hex `hash` and `hold: null`; `c "$B/cde/b12-hold/audit?entity_type=delivery_gate&limit=1"` → `rows[0].id` `<gc>`, `action` `IFC delivery gate FAIL: B12-C.ifc`, `new_value.failures` both failures as sent (a list, not a count), `new_value.source` `check`, `new_value.publish` false, `new_value.size_bytes` `2456`, `rows[0].hash` the reply's; `c "$B/cde/b12-hold/holding"` → `items: []` (a check is not a publish) |
| A publish FAIL is held | `c -X POST "$B/cde/b12-hold/delivery-gate" -d @gate-fail.json` → ` 201` with `id` `<gg>` and `hold` `{id: <hg>, hash: <64 hex>}`; `…/audit?entity_type=delivery_gate&limit=1` → `<gg>`, `IFC delivery gate FAIL: B12-G.ifc`, `new_value.source` `revit`, `new_value.publish` true; `c "$B/cde/b12-hold/audit?entity_type=hold&limit=1"` → `rows[0].id` `<hg>`, `action` `hold:gate B12-G.ifc`, `entity_id` null (no container of that name yet), `new_value` with `container_name` `B12-G.ifc`, `stage` `gate`, `source` `revit`, `gate_row_id` `<gg>`, `sha256` `$SHA`, `size_bytes` `2456` and two `failures`, each with `requirement` and `detail`; `c "$B/cde/b12-hold/holding"` → one item — `container_name` `B12-G.ifc`, `stage` `gate`, `source` `revit`, `refusals` `1`, `ledger` `{id: <hg>, hash}` with the hold row's hash |
| A publish PASS is not held | `c -X POST "$B/cde/b12-hold/delivery-gate" -d @gate-pass.json` → ` 201`, `hold: null`; `…/holding` → still the one `B12-G.ifc` item |
| `/propose` with `register` — held; a plain one — not | `c -X POST "$B/cde/b12-hold/propose" -d @reject-p.json` → ` 200`, `verdict: "rejected"`, no `version`, `audit_id` `<pp>`, `hold` `{id: <hp>, hash}`; `c "$B/cde/b12-hold/audit?entity_type=proposal&limit=1"` → `<pp>` whose `new_value` has `container_name` `B12-P.ifc`, `sha256` `$SHA` and `size_bytes` `2456` (no `gate_row_id` value: none was sent); `…/audit?entity_type=hold&limit=1` → `<hp>`, `hold:ids B12-P.ifc`, `new_value.source` `intake` (a `/propose` source that is not Revit's), `proposal_row_id` `<pp>`, `ids_ref` `ids@1`, four failures; the same POST again → another `hold`, `<hp2>`, and `…/holding` → one `B12-P.ifc` item with `refusals: 2` and `ledger.id` `<hp2>` (repeats collapse); `c -X POST "$B/cde/b12-hold/propose" -d @plain-p.json` (no `register`) → `verdict: "rejected"`, `hold: null`, and `…/holding` has no `B12-Q.ifc` |
| A registration clears — a recorded one is labelled | `c -X POST "$B/cde/b12-hold/propose" -d @recorded-g.json` → `verdict: "recorded"`, `downgraded: "nothing in scope"`, a `version` with `id` `<vg>`, `hold: null`; `c "$B/cde/b12-hold/holding"` → no `B12-G.ifc` item, and `cleared_recent` holds `{"container_name":"B12-G.ifc","by":"recorded","version_id":"<vg>","at":…}`; the version keeps its verdict (`c "$B/cde/b12-hold/audit?entity_id=<vg>&action_prefix=verdict:"` → `total: 1`, `verdict:recorded`) |
| Intake CLI — an IDS reject is held | `node "$W/bridge/intake.mjs" B12-I.ifc --project b12-hold --source cli --no-bcf; echo "exit $?"` → `verdict        REJECTED (ids)`, the gate line `NOT CHECKED · none — not installed for b12-hold or its office …`, `failures       4`, `ledger         audit #<pi> · receipt <16 hex>…`, `exit 2`; `c "$B/cde/b12-hold/audit?entity_type=delivery_gate&limit=1"` → `<gi>`, `IFC delivery gate NOT CHECKED: B12-I.ifc`; `…/audit?entity_type=proposal&limit=1` → `<pi>` whose `new_value` has `container_name` `B12-I.ifc`, `sha256` equal to `sha256sum B12-I.ifc`, `size_bytes` equal to `wc -c < B12-I.ifc`, and `gate_row_id` `<gi>`; `…/audit?entity_type=hold&limit=1` → `hold:ids B12-I.ifc`, `actor` `cli`, `new_value.source` `intake`, `gate_row_id` `<gi>`, `proposal_row_id` `<pi>`, `ids_ref` `ids@1`, four failures; `c "$B/cde/b12-hold/files"` → no `B12-I.ifc` (nothing registered, nothing uploaded) |
| Intake CLI — the corrected file clears it | `node "$W/bridge/intake.mjs" fixed/B12-I.ifc --project b12-hold --source cli --no-bcf` → `ACCEPTED (published)` with a `version        v1 · …` line; `c "$B/cde/b12-hold/holding"` → no `B12-I.ifc` item, and none in `cleared_recent` (an accepted registration clears silently; its version carries `verdict:accepted`). If the platform refuses the 2.5 KB file (`ACCEPTED (upload_failed)` with an `error` line), nothing was registered and the item stays: note it, and clear it with a judged registration that needs no platform — `c -X POST "$B/cde/b12-hold/propose" -d @accept-i.json` → `verdict: "accepted"`, a `version`, and no `B12-I.ifc` item |
| Web — On hold (n) | signed in as the owner of `b12-hold`, Projects ▸ `b12-hold` ▸ Project Files → the status line ends `· 1 on hold.`; below the files, `▸ On hold (1)` → click → one card: `B12-P.ifc`, `refused by the IDS`, `intake · b12 · <when> · refused 2 times since it went on hold`, four `✗ <requirement> — <detail>` lines, `ledger #<hp2> · receipt <16 hex>…` (the hold row's first 16 hex), **Upload the corrected file** and **Dismiss…**; under it `✓ B12-G.ifc — cleared by a registration that was not judged (recorded) · <when>`; in the files, `B12-G.ifc` `v1` carries `◦ recorded` |
| Web — an upload the IDS refuses | **＋ Upload version** → `B12-W.ifc` from the folder `cygpath -w /tmp/b12` prints → the status reads `Judging B12-W.ifc — nothing is stored unless the referee accepts or records it…`, then `Not uploaded — the IDS refused B12-W.ifc (4 failure(s)) · On hold · ledger #<hw> · receipt <16 hex>…`; the section opens as `▾ On hold (2)` with a `B12-W.ifc` card — `refused by the IDS`, `web upload · <your e-mail> · <when>`, its four failures, the same ledger line, **Upload the corrected file**; the files list has no `B12-W.ifc`; DevTools ▸ Network shows one POST for it, `intake?name=B12-W.ifc&source=web&revision=v1&note=uploaded%20via%20web%20by%20<your e-mail, @ as %40>`, and no `/ifc` or `/files` POST — its response `verdict: "rejected"`, `published: false`, no `version`, `hold.id` `<hw>`; `c "$B/cde/b12-hold/audit?entity_type=hold&limit=1"` → `<hw>`, `hold:ids B12-W.ifc`, `actor` your e-mail (the JWT's), `new_value.source` `web`; `c "$B/cde/b12-hold/files"` → no `B12-W.ifc` (intake uploads to the platform only after an accepted or recorded verdict — `intake-logic.test.mjs` pins the order) |
| Web — the corrected file clears it | on the `B12-W.ifc` card **Upload the corrected file** → the picker → `fixed/B12-W.ifc` → `Uploaded B12-W.ifc v1 — accepted (ids@1: 3/3 passed) · The IDS judged alone — the delivery gate was not checked (contract: none — not installed for b12-hold or its office). · ledger #<pw> · receipt <16 hex>…`; the section is back to `▾ On hold (1)` (`B12-P.ifc`); the files list shows `B12-W.ifc` `v1` `wip` `✓ accepted` with **Open 3D** enabled (its platform item); `c "$B/cde/b12-hold/holding"` → no `B12-W.ifc` item. If the platform refuses the file, the line reads `Judged accepted, not uploaded — <error>. Nothing was registered · ledger #<pw> · receipt <16 hex>…` and the item stays: note it and clear it as the CLI row does, with `accept-w.json` |
| Web — a list not read says so | DevTools ▸ Network ▸ right-click the `holding` request ▸ **Block request URL**, then ↻ in the panel → the section reads `On hold: not read — Failed to fetch` and the status line ends `· on hold: not read — Failed to fetch.` — never `On hold (0)` and never no section; untick the block (Network request blocking), ↻ → `▸ On hold (1)` |
| Naming — held, and not cleared by the renamed file | `node "$W/bridge/artefact-import.mjs" "$W/../demo/bds-pilot/bds-naming-ruleset.json" --project b12-hold --kind naming` → `Installed on b12-hold: naming@1 · project · <sha 12>… · by cli`; `node "$W/bridge/intake.mjs" fixed/B12-I.ifc --project b12-hold --name B12-N.ifc --source cli --no-bcf` → `REJECTED` (the stage word is intake's, `ids` for any refusal after the gate) with `naming         ✗ expected 11 '-'-separated fields (Project-Originator-Document Type-Sub-Type-Discipline-Zone-Venue-Level-Number-Suitability-Revision), got 2` and `failures       0` (the IDS accepted the model); `c "$B/cde/b12-hold/audit?entity_type=hold&limit=1"` → `hold:naming B12-N.ifc` (the stage is the naming judge's), `new_value.naming_ref` `naming@1`; `c "$B/cde/b12-hold/holding"` → a `B12-N.ifc` item, `stage` `naming`, `naming_note` `the corrected file carries a new name — a lead dismisses this entry once it is registered`; `node "$W/bridge/intake.mjs" fixed/BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc --project b12-hold --source cli --no-bcf` → `ACCEPTED` (`published`, or `upload_failed` as above — either way) and `…/holding` still lists `B12-N.ifc` (the corrected file carries another name) |
| Web — a lead's dismissal | Project Files on `b12-hold`, ↻, `▸ On hold (2)` → the `B12-N.ifc` card: `refused by the naming standard`, `intake · cli · <when>`, its failure, the note `the corrected file carries a new name — a lead dismisses this entry once it is registered`; **Dismiss…** → an inline field (no browser prompt) with **Dismiss with this reason** and **Cancel**; **Dismiss with this reason** with the field blank → `Not dismissed — a dismissal needs a reason — the ledger records it` and no `dismiss` request in Network; type `b12 drill: registered as BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03.ifc` → **Dismiss with this reason** → `✓ Dismissed B12-N.ifc from On hold · ledger #<d> · receipt <16 hex>…`, the card gone, `On hold (1)`; `c "$B/cde/b12-hold/audit?entity_type=hold&limit=1"` → `<d>`, `hold:dismissed B12-N.ifc`, `actor` your e-mail, `new_value` `{container_name: "B12-N.ifc", reason: "b12 drill: …"}`, `hash` beginning with the line's 16 hex; `c "$B/cde/b12-hold/audit?entity_type=hold&action_prefix=hold:naming"` → `total: 1` (the refusal stays on the ledger) |
| Web — below lead, and a viewer | run only where a second account holds a membership on `b12-hold` (Project Settings ▸ Members): as a contributor, the `B12-P.ifc` card shows **Upload the corrected file** and no **Dismiss…**, and `curl -s -w " %{http_code}" -X POST "$B/cde/b12-hold/holding/dismiss" -H "Authorization: Bearer <that session's token>" -H "Content-Type: application/json" -d '{"container_name":"B12-P.ifc","reason":"b12"}'` → ` 403` `this action requires the lead role (you are contributor)`; as a viewer, **＋ Upload version** is hidden, and `curl -s -X POST "$B/cde/b12-hold/intake?name=B12-V.ifc&source=web" -H "Authorization: Bearer <the viewer's token>" -H "Content-Type: application/octet-stream" --data-binary @B12-W.ifc` → `verdict: "rejected"`, `hold: null`, and `…/holding` has no `B12-V.ifc` (a caller who could not register it writes no hold). Else mark not run — Tasks 1 and 2's vitest pin both |
| The dismiss route | `c -X POST "$B/cde/b12-hold/holding/dismiss" -d '{"container_name":"B12-P.ifc","reason":"   "}'` → ` 400` (Task 2's words: a reason is required); `-d '{"container_name":"B12-P.ifc"}'` → the same 400; a 501-character reason (`-d "{\"container_name\":\"B12-P.ifc\",\"reason\":\"$(printf 'x%.0s' $(seq 501))\"}"`) → ` 400`; `-d '{"container_name":"B12-P.ifc","reason":"b12 drill: superseded"}'` → ` 201` with `id` and a 64-hex `hash` (the machine credential passes the lead check, as on every lead-only route); `c "$B/cde/b12-hold/holding"` → `items: []` |
| Revit — the IFC Gate is a check | Demo Tower open (bound to `demo`; its `contract@1 · office` fails the export, as in B6), a 3D view → IFC Delivery Gate → "Export active view to IFC, then certify" → the FAIL dialog ends `Recorded: ledger #<gc2> · receipt <16 hex>…`; `c "$B/cde/demo/audit?entity_type=delivery_gate&limit=1"` → `<gc2>`, `IFC delivery gate FAIL: <the dialog's file>`, `new_value.source` `check`, `new_value.publish` false, `new_value.failures` the dialog's failures as a list (not a count), `new_value.size_bytes` the IFC's size; `c "$B/cde/demo/holding"` → `items: []` |
| Revit — Governed Publish: a gate FAIL is held | Governed Publish on Demo Tower → `✕ REJECTED — delivery gate failed (not published)`, the contract and the failures, `Gate row: ledger #<g2> · receipt <16 hex>…` and `Held on the web: Versions ▸ On hold · ledger #<h2> · receipt <16 hex>…`; no `Version:` line; `c "$B/cde/demo/audit?entity_type=delivery_gate&limit=1"` → `<g2>`, `new_value.source` `revit`, `new_value.publish` true; `c "$B/cde/demo/audit?entity_type=hold&limit=1"` → `<h2>`, `hold:gate <the container name>`, `new_value.gate_row_id` `<g2>`, `new_value.source` `revit`, up to 50 failures; `c "$B/cde/demo/holding"` → one item, `stage` `gate`, `source` `revit`, `ledger.id` `<h2>`; `c "$B/cde/demo/audit?entity_type=proposal&limit=1"` unchanged (a gate FAIL proposes nothing); `ls "$APPDATA/Sentinel/outbox"` gains nothing |
| Revit — auto-publish: the Doctor line | `node "$W/bridge/artefact-import.mjs" publish-on.json --project demo --kind publish` → `Installed on demo: publish@<n> · project · <sha 12>… · by cli` (`<n>` 3 after B10); switch to another open document and back until the pane reads `Auto-publish: on · publish@<n> · project · <sha 12>…`; save Demo Tower → the Doctor log's `Auto-publish rejected — nothing uploaded — delivery gate FAIL · … · gate row: ledger #<g3> · receipt <16 hex>…` line carries `Held on the web: Versions ▸ On hold · ledger #<h3> · receipt <16 hex>…`; `c "$B/cde/demo/holding"` → still one item for that container, now `refusals: 2`, `source: "auto-publish"`, `ledger.id` `<h3>` (repeats collapse); then `node "$W/bridge/artefact-import.mjs" publish-off.json --project demo --kind publish` → `publish@<n+1>`, and the pane reads `Auto-publish: off — publish@<n+1> · project · <sha 12>…` |
| Revit — Governed Publish: a naming reject is held | Aster Tower open (bound to `aster-tower`) → Governed Publish → the dialog B10 found: `✕ REJECTED — model name does not follow the ISO 19650 convention (not published)`, `Name checked: AST_ASTR26_Aster Tower.ifc`, `Gate row: ledger #<g4> · …`, `Verdict row: ledger #<p4> · …`, `No version was registered and nothing was uploaded.` and `Held on the web: Versions ▸ On hold · ledger #<h4> · receipt <16 hex>…`; `c "$B/cde/aster-tower/audit?entity_type=delivery_gate&limit=1"` → `<g4>`, `IFC delivery gate NOT CHECKED: AST_ASTR26_Aster Tower.ifc`, `new_value.publish` true; `…/audit?entity_type=proposal&limit=1` → `<p4>` whose `new_value` has `container_name` `AST_ASTR26_Aster Tower.ifc`, `gate_row_id` `<g4>`, and `sha256` and `size_bytes` equal to the gate row's; `…/audit?entity_type=hold&limit=1` → `<h4>`, `hold:naming AST_ASTR26_Aster Tower.ifc`, `entity_id` that container's id (`c "$B/cde/aster-tower/files"`), `new_value.source` `revit`, `naming_ref` `naming@1`, `gate_row_id` `<g4>`, `proposal_row_id` `<p4>`. If the dialog reads `✓ ACCEPTED` or `Published — not judged: …` instead, the naming standard no longer refuses the pilot's name: a version was registered and nothing is held — note it and mark this row and the next not run (Task 4's publish-check pins the line) |
| Web — the pilot's hold, dismissed | Projects ▸ `aster-tower` ▸ Project Files → `▸ On hold (1)` → `AST_ASTR26_Aster Tower.ifc`, `refused by the naming standard`, `Governed Publish · <actor> · <when>`, its failure, the naming note, `ledger #<h4> · receipt <16 hex>…` (the dialog's 16 hex), `Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again.` and **Dismiss…** → reason `b12 drill: the pilot's central name predates the office naming standard` → `✓ Dismissed AST_ASTR26_Aster Tower.ifc from On hold · ledger #<d4> · receipt <16 hex>…`; `c "$B/cde/aster-tower/holding"` → `items: []` |
| Honesty | a refused file is never on the platform or registered (no refused name gains a version; the intake POST is the only request a web upload makes); each hold is one `hold:<stage> <name>` row the bridge wrote, for a registering refusal judged by installed standards and a caller who could register it; `ledger #` and `receipt` appear only with the row's id and 64-hex hash (else `not confirmed — the bridge returned no chain hash`); a list that was not read says `not read — …`, never none; the open audit route writes no `hold:`, `hold` or `delivery_gate` row, and no signed-in member posts a gate row; a dismissal needs a reason and leaves the refusal rows on the ledger. Then: Projects ▸ `demo` ▸ Project Files ▸ On hold ▸ the Demo item ▸ **Dismiss…** `b12 drill: Demo's export fails its contract by design` → `✓ Dismissed …`; `rm -r /tmp/b12`; archive `b12-hold` (Project Settings ▸ Danger zone ▸ Archive); both pilots hold `publish@<n> {auto: false}`; Demo's local is closed without saving (as in B8) |

## Session C — Validate panel (the referee's home turf)
````

- [ ] **Step 2: The capability rows in `docs/handbook/05-capability-status.md`**

(1) The Governed Intake row's last cell — in `docs/handbook/05-capability-status.md` replace:

````markdown
Route `POST /cde/:key/intake`, CLI `bridge/intake.mjs` |
````

with:

````markdown
Route `POST /cde/:key/intake`, CLI `bridge/intake.mjs`, and since 6a the web Versions upload (`source=web`, judged before anything is stored — see the Holding Area row) |
````

(2) The 5a row: the audit route's reserved rows — in `docs/handbook/05-capability-status.md` replace:

````markdown
`audit()` returns the row it wrote; `POST /cde/:key/audit` refuses `stage_gate` rows and actions starting `verdict:`, `gate:`, `roi:` or `state:` (400).
````

with:

````markdown
`audit()` returns the row it wrote; `POST /cde/:key/audit` refuses `stage_gate` rows and actions starting `verdict:`, `gate:`, `roi:` or `state:` (400; since 6a also `hold:` actions and `hold` and `delivery_gate` rows — the Holding Area row).
````

(3) The 5a row: its behaviour change — in `docs/handbook/05-capability-status.md` replace:

````markdown
Behaviour change: web-uploaded versions carry no verdict (38 wip ones live on 2026-09-26), so publishing one needs a lead's reason;
````

with:

````markdown
Behaviour change: web-uploaded versions carry no verdict (38 wip ones live on 2026-09-26), so publishing one needs a lead's reason (since 6a a web upload goes through Governed Intake and is registered only with its verdict);
````

(4) The Holding Area row, inserted before the One-button row (one line; no `|` inside a cell) — in `docs/handbook/05-capability-status.md` replace:

````markdown
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
````

with:

````markdown
| Holding Area (cohesion 6a: a refused file is held — one `hold` ledger row, no bytes — and listed on its project under Project Files ▸ On hold with its stage, failures and ledger line until a corrected file is registered under its name or a lead dismisses it with a reason; the web Versions upload judged through Governed Intake before anything is stored; Revit's gate row through a route only the machine credential passes; `hold:`, `hold` and `delivery_gate` refused by the open audit route) | 🟩 Built | A refusal of a file that was to be registered — `/propose` with `register`, Governed Intake (the CLI and, since 6a, the web Versions upload: `POST /cde/:key/intake?name=…&source=web&revision=v{N+1}&note=uploaded via web by <who>`, so a refused file is never on the platform), Governed Publish and auto-publish — is written by the bridge as one `hold:<stage> <container_name>` row (`gate` for a delivery-gate FAIL, else `naming` when the naming standard rejected, else `ids`; entity_id the container's uuid when it exists) whose `new_value` names the file (`container_name`, `sha256`, `size_bytes`), up to 50 failures (`{requirement, detail}`), the `source` (`revit`, `auto-publish`, `web`, `intake`) and the rows it follows (`gate_row_id`, `proposal_row_id`), with `contract_ref`, `ids_ref` and `naming_ref` — only when the standards that judged are the ones installed on the project or its office and the caller could register the file (the machine credential, or a signed-in contributor and up); a viewer's refusal and a plain proposal's write none. `/propose` and intake answer `hold: {id, hash}` or null; the proposal row names its file and `gate_row_id`. `GET /cde/:key/holding` (`holding-logic.mjs`, pure) derives the list — one item per name whose newest refusal is newer than both its newest registered version and its newest `hold:dismissed`, carrying that refusal's stage, failures, source, actor, time and `ledger {id, hash}`, the `refusals` since it opened (auto-publish repeats collapse into one item) and, for a naming item, `the corrected file carries a new name — a lead dismisses this entry once it is registered`; a registration clears an item whatever its verdict, and one by a `recorded` registration is listed under `cleared_recent` as `cleared by a registration that was not judged (recorded)`; a failed read is a 502 `not read — <reason>`. `POST /cde/:key/holding/dismiss {container_name, reason}` (lead; the machine credential passes; a non-blank reason of at most 500 characters) writes `hold:dismissed <container_name>` and changes nothing else. The web's `On hold (n)` (built like `Archived (n)`) shows each item's stage (`refused by the delivery gate` / `naming standard` / `IDS`), every failure, `ledger #<id> · receipt <16 hex>…`, **Upload the corrected file** (web and intake: the picker, through intake) or the Revit instruction (Governed Publish, auto-publish), and **Dismiss…** with an inline reason for a lead; an upload's status reads `Uploaded <name> <rev> — accepted (ids@n: p/s passed) · …` (or `recorded, not judged`) or `Not uploaded — <the delivery gate, the naming standard or the IDS> refused <name> (<n> failure(s)) · On hold · ledger #<id> · receipt <16 hex>…`; a list not read reads `On hold: not read — <why>`, never nothing. Revit posts its gate row to `POST /cde/:key/delivery-gate` (403 `the delivery-gate route is for Sentinel's machine credential` to every signed-in caller) with every failure, `size_bytes`, `source` (`revit`, `auto-publish`, or `check` from the IFC Gate, which holds nothing) and `publish` — a FAIL with `publish: true` writes `hold:gate` — sends `gate_row_id` on `/propose`, and the rejection dialog and the auto-publish Doctor line carry `Held on the web: Versions ▸ On hold · ledger #<id> · receipt <16 hex>…` when the bridge wrote the hold. `POST /cde/:key/audit` refuses `hold:` actions and `hold` and `delivery_gate` rows (400). Behaviour change: a web upload is judged before it is stored — a refused one is neither on the platform nor registered (before 6a it was registered with no verdict); a signed-in member can no longer post a gate row (a `BCF_TOKEN` holder still can: a gate row is Revit's attestation, the bridge never sees Revit's bytes); the add-in and the bridge deploy together (an add-in from before 6a gets a 400 and prints `not recorded — …`). The modeller bake and the encrypted attach still post to `/ifc`, unjudged. Tests: the bridge's vitest (the derivation, the hold writers and their three conditions, the gate route, the dismiss route, the reserved refusals), `holding.test.ts` (15: the upload through intake, its status line, the read, the dismissal), `tools/publish-check` (the gate body, Prepare's source, the held line). Moves to ✅ on the Session B12 drill: an intake CLI IDS reject, a web upload reject and a Revit naming reject each on hold with its ledger line, a corrected file clearing one, a recorded registration labelled, a lead's dismissal with its reason, the gate route's 403 to a signed-in owner, the forged rows refused (`docs/TESTING_PROTOCOL.md`) |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
````

(5) The File versioning row — in `docs/handbook/05-capability-status.md` replace:

````markdown
| File versioning (history / upload / set-live / compare) | 🟩 Built | Versions panel; snapshot auto-link |
````

with:

````markdown
| File versioning (history / upload / set-live / compare) | 🟩 Built | Versions panel (Project Files); snapshot auto-link; since 6a the upload goes through Governed Intake — judged before anything is stored — and a refused file is listed under On hold (the Holding Area row) |
````

(Task 6 flips 🟩 Built to ✅ and replaces the row's last sentence with the drill's date, what ran and what did not.)

- [ ] **Step 3: `docs/SENTINEL_HANDBOOK.md`**

(1) The lifecycle diagram's fail branch — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
(fail) auto-opens BCF issues
````

with:

````markdown
(fail) BCF issues + On hold
````

(2) The IFC Delivery Gate row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
or says the row was not recorded or is not confirmed, and why. | At a formal deliverable. | Coordinator |
````

with:

````markdown
or says the row was not recorded or is not confirmed, and why. The row goes to the bridge's machine-only gate route with every failure listed, as a check (`source: check`): the IFC Gate holds nothing. | At a formal deliverable. | Coordinator |
````

(3) The Governed Publish row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
live-synced to the web and back into Revit.
````

with:

````markdown
live-synced to the web and back into Revit. A refused model is **held on the web** — Project Files ▸ On hold, with its stage, every failure and the refusal's ledger line — until a corrected model is registered under the same name or a lead dismisses it with a reason; the dialog says `Held on the web: Versions ▸ On hold · ledger #<id> · receipt <16 hex>…` when the bridge wrote the hold. The gate row goes to the bridge's machine-only route (`POST /cde/:key/delivery-gate`) with every failure listed, so the add-in and the bridge deploy together.
````

(4) The Auto-publish row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
a rejected run uploads nothing.
````

with:

````markdown
a rejected run uploads nothing and is held on the web like a rejected Governed Publish (its Doctor line carries `Held on the web: Versions ▸ On hold · ledger #…`).
````

(5) The Projects row's Project Files — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
never passed), Project Files, Settings. | Everyone |
````

with:

````markdown
never passed), **Project Files** (the Versions panel: each model's versions with their verdict badges; **＋ Upload version** sends the file through Governed Intake — the delivery gate, the naming standard and the IDS judge it before anything is stored, so a refused file is never on the platform; **On hold (n)** lists each refused file with its stage, failures, ledger line and how to send it again, and a lead's **Dismiss…** with a reason), Settings. | Everyone |
````

(6) The `/cde/*` row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
gate (the stage gate, measured on the bridge and recorded). The ISO 19650 heart. |
````

with:

````markdown
gate (the stage gate, measured on the bridge and recorded), intake (Governed Intake — the CLI and the web Versions upload), holding (the refused files on hold, and a lead's dismissal), delivery-gate (Revit's gate row — the machine credential only). The ISO 19650 heart. |
````

(7) The `/ifc` row — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
IFC upload/fetch, and IFC→fragments conversion for the viewer. |
````

with:

````markdown
IFC upload/fetch for the modeller bake (unjudged), and IFC→fragments conversion for the viewer. The Versions upload goes through `/cde/:key/intake` instead. |
````

(8) §7, point 2 — in `docs/SENTINEL_HANDBOOK.md` replace:

````markdown
A pass versions; a fail is recorded and each failing requirement becomes a BCF issue.
````

with:

````markdown
A pass versions; a fail is recorded, each failing requirement becomes a BCF issue, and the refused file is held on its project (Project Files ▸ On hold) until a corrected file is registered under its name or a lead dismisses it.
````

- [ ] **Step 4: `SENTINEL-USER-GUIDE.md`**

(1) The Auto-publish bullet — in `SENTINEL-USER-GUIDE.md` replace:

````markdown
There is no switch in Revit; none installed = off. Linked models are not published.
````

with:

````markdown
There is no switch in Revit; none installed = off. Linked models are not published. A rejected run — like a rejected Governed Publish — is held on the web (Project Files ▸ On hold, with its stage, failures and ledger line) until a corrected model is registered under the same name or a lead dismisses it; the Doctor line (the dialog, for Governed Publish) then carries `Held on the web: Versions ▸ On hold · ledger #<id> · receipt <16 hex>…`.
````

(2) The IFC Delivery Gate row — in `SENTINEL-USER-GUIDE.md` replace:

````markdown
after a timeout or a server error; an unbound model sends nothing. |
````

with:

````markdown
after a timeout or a server error; an unbound model sends nothing. The row goes to the bridge's machine-only gate route (`POST /cde/<key>/delivery-gate`, every failure listed, `source: check` — a check holds nothing); an add-in from before phase 6a gets `Not recorded — …` from a 6a bridge, so the two deploy together. |
````

- [ ] **Step 5: `docs/verdict-contract.md`**

(1) §1: the request's `gate_row_id` — in `docs/verdict-contract.md` replace:

````markdown
  "register": { "name": "PRJ-BDS-XX-XX-M3-A-0001.ifc", "size_bytes": 5120000, "sha256": "…" }   // optional, §2; name = container_name
````

with:

````markdown
  "register": { "name": "PRJ-BDS-XX-XX-M3-A-0001.ifc", "size_bytes": 5120000, "sha256": "…" },  // optional, §2; name = container_name
  "gate_row_id": 811                  // optional: the ledger id of the delivery_gate row this file came through (Revit's Publisher sends it)
````

(2) §2: the reply's `hold` — in `docs/verdict-contract.md` replace:

````markdown
  "audit_id": 412,
  "agent": { "claimed": true, … } | null,
````

with:

````markdown
  "audit_id": 412,
  "hold": { "id": 413, "hash": "…" } | null,   // a rejected register held on the project — see "A refusal is held, not kept"
  "agent": { "claimed": true, … } | null,
````

(3) The audit route's reserved list — in `docs/verdict-contract.md` replace:

````markdown
every new version starts in `wip`, and `POST /cde/:project/audit` refuses `verdict:`, `state:`, `gate:` and `roi:`
actions and `stage_gate` rows: Sentinel alone writes those.
````

with:

````markdown
every new version starts in `wip`, and `POST /cde/:project/audit` refuses `verdict:`, `state:`, `gate:`, `roi:` and
`hold:` actions and `stage_gate`, `hold` and `delivery_gate` rows: Sentinel alone writes those.
````

(4) The paragraph "A refusal is held, not kept", before §3 — in `docs/verdict-contract.md` replace:

````markdown
## 3. Provenance is claimed, never verified
````

with:

````markdown
**A refusal is held, not kept.** A rejected file that was to be registered — `/propose` with `register`, Governed
Intake (the CLI, and the web Versions upload, which goes through `POST /cde/:project/intake?source=web` and is judged
before anything is stored), Revit's Governed Publish and auto-publish — is recorded as held: one `hold` row,
`hold:<stage> <container_name>` (`gate` for a delivery-gate FAIL, else `naming` when the naming standard rejected, else
`ids`), whose `new_value` carries `container_name`, `sha256`, `size_bytes`, `stage`, `verdict`, up to 50 `failures`
(`{requirement, detail}`), `source` (`revit`, `auto-publish`, `web` or `intake`), `gate_row_id`, `proposal_row_id`,
`contract_ref`, `ids_ref` and `naming_ref`. The bridge writes it only for a refusal judged by the standards installed on
the project or its office, for a caller who could register the file (the machine credential, or a signed-in
contributor or above), and the reply names it (`"hold": {"id", "hash"}`, else null). No bytes are kept: the corrected
file is sent again from its source. `GET /cde/:project/holding` derives the list — one item per container name whose
newest refusal is newer than both its newest registered version and its newest `hold:dismissed` row —
`{"items": [{container_name, stage, verdict, failures, source, actor, at, ledger: {id, hash}, refusals, naming_note?}],
"cleared_recent": [...]}`; a registration clears an item whatever its verdict, one by a `recorded` registration is
listed in `cleared_recent` ("cleared by a registration that was not judged (recorded)"), and a naming-stage item does
not clear by name — the corrected file has another — and says so. A lead dismisses an item with
`POST /cde/:project/holding/dismiss { "container_name", "reason" }` (`hold:dismissed <container_name>`, the reason on the
ledger; the refusal rows stay). A failed read is a 502 `not read — <reason>`, never an empty list. Revit's delivery-gate
row goes through `POST /cde/:project/delivery-gate` — refused (403) to every signed-in caller, open to Sentinel's
machine credential — with the full failure list, `size_bytes`, `source` (`revit`, `auto-publish` or `check`) and
`publish`; a FAIL with `publish: true` also writes the `hold:gate` row, and the reply is `{id, hash, hold}`. The proposal
row names its file (`container_name`, `sha256`, `size_bytes`) and the gate row it followed (`gate_row_id`). A gate row
stays Revit's attestation — the bridge never sees Revit's bytes — and a holder of the machine credential can still
post one.

## 3. Provenance is claimed, never verified
````

- [ ] **Step 6: Check**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
grep -n "^## Session B1[12]\|^## Session C " docs/TESTING_PROTOCOL.md
awk '/^## Session B12/,/^## Session C /' docs/TESTING_PROTOCOL.md | grep -c "^| "
awk '/^## Session B12/,/^## Session C /' docs/TESTING_PROTOCOL.md | grep "^| " | awk -F'|' 'NF!=4' | wc -l
grep -c "Held on the web: Versions ▸ On hold" SENTINEL-USER-GUIDE.md docs/SENTINEL_HANDBOOK.md docs/handbook/05-capability-status.md docs/TESTING_PROTOCOL.md
grep -n "^| Holding Area\|^| One-button" docs/handbook/05-capability-status.md | cut -c1-40
grep -c "hold:" docs/verdict-contract.md
file docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md | grep -c CRLF
```

Expected (measured on the archive): `303:## Session B11 …`, `363:## Session B12 — the Holding Area`, `435:## Session C — Validate panel (the referee's home turf)`; `28` (the header, the separator and 26 rows); `0` (every row two cells); `SENTINEL-USER-GUIDE.md:1`, `docs/SENTINEL_HANDBOOK.md:2`, `docs/handbook/05-capability-status.md:1`, `docs/TESTING_PROTOCOL.md:3`; `23:| Holding Area (cohesion 6a: …` then `24:| One-button Revit command …`; `5`; `5` (all five still CRLF).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/verdict-contract.md
git commit -q -F - <<'EOF'
docs: phase 6a — Session B12 (the Holding Area: the reserved rows refused, the gate route's 403 to a signed-in owner and 201 to the machine credential with and without publish, /propose and intake holds and their conditions, a recorded clearance labelled, an intake CLI IDS reject and its corrected file, the web upload refused and cleared, a list not read, a naming hold and a lead's dismissal, the Revit gate check, gate FAIL, auto-publish and naming holds with 'Held on the web: Versions ▸ On hold · ledger #…'); the Holding Area capability row (🟩 Built, moves to ✅ on B12); the handbook, the user guide and the verdict contract on the web upload through intake, the machine-only gate route, the hold:/hold/delivery_gate refusals and the held list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: unchanged from Task 4.

**Amendments (controller, after the cross-check — override the task where they conflict):**

Five replacements, all inside Step 1's B12 block. Each old text occurs once in the plan and once in the applied doc. After them, B12 still has 26 rows, each exactly two cells.

A5.1 (the gate route validates):
- Replace ``(`result: "maybe"`) → ` 400` (Task 1's words for `result`)`` with ``(`result: "maybe"`) → ` 400` `result must be pass, fail or not_checked` ``.

A5.2 (the dismiss route):
- Replace ``→ ` 400` (Task 2's words: a reason is required)`` with ``→ ` 400` `reason is required — a lead's dismissal says why, in at most 500 characters` ``.

A5.3 (Naming, held): Task 1 makes intake's stage "naming", and the CLI prints `REJECTED (<stage>)`.
- Replace ``→ `REJECTED` (the stage word is intake's, `ids` for any refusal after the gate) with`` with ``→ `verdict        REJECTED (naming)` (intake's stage is the naming judge's since Task 1) with``.

A5.4 (Deploy, the measured totals):
- Replace ``ends `<n>/<n> checks pass` at the total Task 4's commit states (master 101), and `tools/gate-check`, `tools/event-check`, `tools/artefact-cache-check`, `tools/roi-check` and `tools/ghost-standards-check` end at theirs (master 121, 44, 53, 43, 135); `cd "$W" && npm test` ends green at the total Task 3's commit states (Task 3 alone on master's tree: `Test Files  87 passed (87)`, `Tests  1202 passed (1202)`)``
- with ``ends `112/112 checks pass` (master 101), and `tools/gate-check`, `tools/event-check`, `tools/artefact-cache-check`, `tools/roi-check` and `tools/ghost-standards-check` end `122/122`, `44/44`, `53/53`, `43/43` and `135/135` (gate-check master 121); `cd "$W" && npm test` ends `Test Files  90 passed (90)`, `Tests  1271 passed (1271)` ``.

A5.5 (a recorded clearance is labelled; Task 2's entry carries its label):
- Replace ``cleared_recent` holds `{"container_name":"B12-G.ifc","by":"recorded","version_id":"<vg>","at":…}` `` with ``cleared_recent` holds `{"container_name":"B12-G.ifc","by":"recorded","version_id":"<vg>","at":…,"label":"cleared by a registration that was not judged (recorded)"}` ``.

Part B's cross-task notes 1, 3 and 8 are settled by A3.5-A3.7 and A5.1-A5.5. Note 3 is superseded: the CLI prints `REJECTED (naming)`. No other text in Task 5 changes. Its checks (Step 6) were measured as written: B12 at lines 363-435, 28 table lines, every row two cells, and the "Held on the web" counts 1/2/1/3.

(controller) **Name the tab the user sees.** The web tab that holds the Versions panel is labelled `Project Files` (`WebApp/src/main.ts`), so every surface prints `Project Files ▸ On hold`, never `Versions ▸ On hold`: in Task 4 the held line is `Held on the web: Project Files ▸ On hold · ` + `LedgerLine.For(hold)` (change the one string and the publish-check pins that quote it — the total stays 112/112), and in Task 5 every quote of that line and every instruction naming the list says `Project Files ▸ On hold` (the section's own heading in the panel stays `On hold (n)`).

---

### Task 6: Deploy, drill and merge (controller)

- [ ] **Step 1:** The bridge and the add-in deploy together (spec Decision 5): the managed bridge restarted on the branch; with Revit closed (the founder confirms), `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys.
- [ ] **Step 2:** Run Session B12 (`docs/TESTING_PROTOCOL.md`) live: the reserved refusals and the gate route by curl, intake CLI rejects on hold, a dismissal, a corrected file clearing an item, a Revit naming reject on hold with the dialog line, the web upload rows where a rendered platform tab exists. Record it in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; rows not run live are marked **not run** with the reason.
- [ ] **Step 3:** Capability row → ✅; every harness and `cd WebApp && npm test` green; normalise co-author trailers; merge `--no-ff` into master; ledger; memory; `python -m graphify update .`.
