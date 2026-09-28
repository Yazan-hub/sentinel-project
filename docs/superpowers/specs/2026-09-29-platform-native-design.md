# Roadmap item 3 — platform-native: the platform gate's verdicts on Sentinel's ledger, ISO states on the platform copy

Status: design written 2026-09-29 on the founder's "do everything on your own … continue the roadmap". The map it rests
on (four readers, one synthesis) is the workflow run `wf_ffb5eee8-f2b`; the platform facts below were confirmed live and
read-only the same day with the bridge's own platform token.

## Invariant (the hackathon, Sun 2026-10-04)

Nothing changes in `CloudComponents/delivery-gate`, and the two platform automations ("Sentinel gate — new file",
"Sentinel gate — new version"; both `Extension = ifc`; component 1.0.3) are left alone. Part A only READS the platform.
Part B writes only onto `.frag` items and ships switched off (`SENTINEL_PLATFORM_STATE` unset) until its drill passes
after the deadline. Neither part can start, stop or change a gate run.

## Confirmed facts (2026-09-29, read-only, the bridge token)

- `listFolders({ projectId })` on the Welcome Project answers (4 folders): the token reads the project. The bridge's
  startup check passes a bare string (`listFolders(cfg.projectId)`), which the SDK ignores — fixed here.
- `listExecutions(componentId, projectId)` returns the gate's 9 runs, newest first, each with `_id`, `createdAt`,
  `completedAt`, `toolVersion`, `result` (`SUCCESS` for a pass, `WARNING` for refused / not checked), `resultMessage`,
  and more. Two older runs also carry a `creatingToken` field: a row copies named fields only, never the record.
- `getExecution(id)` adds `messages[]` (`{content, createdAt}`), among them `Reading <name> <tag>…`.
- The 1.0.0 run's `resultMessage` reads `… the version labels were refused: Cannot PUT /a…` — the shape that carried an
  `accessToken` query parameter: every message is scrubbed before it reaches the append-only ledger.
- A `.frag` version's metadata map already holds a key of the platform's own (`{sourceIfcId: …}`):
  `updateFileVersionMetadata` replaces the whole map, so a label is read, merged, written.
- Exactly one Sentinel project links the Welcome Project (`metadata.settings.platform_project_id`): `aster-tower`.
  No `platform_gate` row exists; no unique index yet.

## Part A — each platform gate run becomes one ledger row

- **Source:** the platform's run record (`listExecutions`, then `getExecution` for its messages), not the report file
  or the labels: the platform writes the record itself (a report file is writable by any project writer), a run that
  failed before writing anything still has one, and its `_id` is a natural key.
- **Writer:** `bridge/platform-gate-ledger.mjs`. Pure parts: result from the message's first words (`Passed —` pass,
  `Refused —` fail, `Not checked —` not_checked, `Gate did not run —` did_not_run, `Skipped —` skipped, anything else
  did_not_run — never a pass), the `Reading <name> <tag>` parser, the scrub (`accessToken=…`, bearer JWTs), the row.
  `syncPlatformGate(deps)` reads the finished runs (a `result` set), resolves the ONE non-archived Sentinel project
  linked to the platform project (none or two: writes nothing and says why), drops runs already on the ledger, and
  writes the rest oldest first. Runs as a CLI (`node bridge/platform-gate-ledger.mjs --once | --watch`) — the way
  `watch-outbox.mjs` runs beside the bridge, so the bridge need not restart — and inside the bridge when
  `THATOPEN_GATE_COMPONENT_ID` is set (every 60 s, never overlapping).
- **Exactly one row per run:** migration 0036, a partial unique index on `audit_log ((new_value->>'execution_id'))
  where entity_type = 'platform_gate'`; a duplicate insert is 23505 (the chain trigger's statement rolls back, the chain
  tip never moves), which the writer counts as "already recorded". A row without an execution id is refused.
- **The row:** `entity_type platform_gate`, `entity_id null`, `actor "platform gate"`, `action "platform gate
  <PASS|FAIL|NOT CHECKED|DID NOT RUN|SKIPPED>: <name> <tag>"`, `new_value {execution_id, platform_project_id,
  component {id, version}, result, platform_result, message (scrubbed, ≤ 2000), file {name, version_tag} | null,
  ran_at, finished_at}`. A new type — not `delivery_gate`, which ROI counts and proposals cite. `at` is when Sentinel
  recorded it; `ran_at` is when the platform ran it (the first sync records the earlier runs, honestly dated).
- **Reserved:** `platform_gate` joins the open audit route's reserved types (a 400 before any write).
- **Web:** the Platform deliveries strip's card adds `· ledger #<id>` when a row's `execution_id` is the card's run,
  `· not on this project's ledger yet` when none, `· ledger not read — <why>` when the read failed.

## Part B — a version's ISO 19650 state on its platform copy (switched off until its drill)

- **Where:** version metadata on `container_versions.platform_item_id` (the `.frag` on every normal path):
  `sentinel_state` (wip | shared | published | archived) and `sentinel_state_row` (the ledger id of that version's
  newest `state:` row). Not the delivered `.ifc` (its id is not stored, and the gate replaces its whole map on every
  run); not folders (per item, and a moved IFC may leave the component's listing); not platform archive.
- **How:** `listVersions` (exactly one version, else skip with a reason), `getFile` (an `.ifc` is skipped), read the
  map, merge, `updateFileVersionMetadata`; skip when the existing `sentinel_state_row` is already ≥ ours (a late write
  never regresses the label).
- **Hook:** after `cde_transition` succeeds in `transition()` and after `review_decide` succeeds in `reviewDecide()`,
  `void mirrorState(version_id)` — never awaited, never an error of the transition. A refused transition never mirrors.
  A failed platform write is one log line naming the version, the item and the platform's words; the label stays as it
  was, and names the ledger row it copies, so a stale label can be told from the ledger.
- **Cannot re-trigger the gate:** both automations filter `Extension = ifc`; a `.frag` metadata write is not an IFC.

## Tests

Bridge: the pure functions (every component message shape, the scrub on the 1.0.0 shape, the Reading parser); sync with
a fake client and a fake ledger (one row per finished run oldest first; a second tick writes nothing; a fresh process
with the rows present writes nothing; an unfinished run waits; 23505 counts as recorded; zero, two or an archived link
write nothing; a platform throw writes nothing); the reserved type; the mirror (no item, an `.ifc`, two versions, a
throwing PUT, flag off → no platform call; a transition still answers when the mirror rejects or hangs). Web: the card
footer. DB: `probes/0036_probe.sql` (structure, then a duplicate insert refused, rolled back).

## Drill (B24)

Now: 0036 applied and probed; `node bridge/platform-gate-ledger.mjs --once` writes one row per finished run (9 today)
on aster-tower, oldest first, the chain verifying; a second run writes 0. After the deadline: the bridge restart (the
reserved type, the in-bridge poller, part B) with the founder's Funnel toggle; a failing IFC through That Open's CDE
gives one FAIL row within a minute; part B on a scratch `.frag` version: wip → shared labels it, the gate's run count
unchanged.
