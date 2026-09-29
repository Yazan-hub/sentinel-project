# Roadmap item 4 — SDK 0.16.1, "Ask Sentinel" over the platform channel, notifications

Status: written 2026-09-29 on the founder's "forget the deadline and fix everything". The ground was mapped by workflow
`wf_164498a7-744` (the 0.16.1 package read-only, every Sentinel call site, the channel and notification APIs).

## Phase 1 — the SDK (done, merged 3651f62)

`@thatopen/services` pinned at `0.16.1` (exact) in `WebApp/package.json`; the bridge and the web app share that install.
Every call keeps its name, signature and auth. The one behaviour change: retries only on network errors, 429 and 5xx,
with backoff and `Retry-After` (0.3.11 retried everything at once). Tests, types, the build, the bridge's platform reads,
the bridge restart and the local app all passed on it. The cloud component keeps its own `^0.3.11` (the platform
injects the client at run time) until it is republished.

## Phase 2 — "Ask Sentinel" (read-only, over the platform's external channel)

**Who answers:** the open, signed-in Sentinel tab (published or local app), through `client.channel.external()` of
0.16.1. It answers with that tab's own sessions: the platform context for platform reads, the Sentinel session for the
ledger through the bridge (so the person's row-level access scopes every answer).

**Who asks:** a tool holding the same platform account's API token — the bridge's CLI `node bridge/ask-sentinel.mjs`
and one MCP tool, `sentinel_ask_app`. A token reaches only that account's tabs of that app in that project.

**Two read-only commands:**
- `sentinel.status` → `{app_version, platform_project_id, sentinel_project, signed_in, bridge: "reachable" | "not
  reachable — <why>"}` — presence only, never a verdict.
- `sentinel.deliveries {name?, limit ≤ 20}` → per IFC: `name`, `version_tag`, `platform` (the card headline, labelled
  the platform's hint), `failures` (≤ 10 lines + how many more), `run` (execution id), `ledger` (exactly `ledger #N`,
  `not on this project's ledger yet`, or `ledger not read — <why>`, from `ledgerLine()`), and when a row is cited its
  `ledger_result` and `agrees` (the platform's hint and the ledger row's `result` — when they disagree the answer says
  both, never picks one).

**Honesty:** no write commands (a command's `kind` is set by the sender and not checked; anyone with the token can send
any command to an open tab). A signed-out tab or an unreachable bridge answers `ledger not read — …`, never a verdict.
The asker keeps the first reply per request id (several open tabs each reply). An ack of `delivered: 0` is said in
words: Sentinel is not open (and joined) in that platform project under this account — not answered; the MCP tool's
description points the model to `sentinel_audit` (`entity_type=platform_gate`) instead, which answers from the bridge
without the app. Every error passes through the scrub (the token rides in the socket URL).

**Reuse and fixes:** the board's ledger reader moves into `readGateLedger(base, key)` (platform-deliveries-panel.ts)
used by the board and the channel. `readDeliveries` accepts a report only when the download answered ok and the JSON
is the gate's report kind (today a 429 body is parsed as a report and the card says "Running"); a failed labels read
is `not read — <why>`, never "Running"; an optional name filter keeps one ask to 1 + ≤ 2 platform reads.
`GateLedgerRow` carries `result`. `main.ts`: the channel joins right after `client.setup` (as the 0.16.1 app template
does), and `getProjectData` is raced against 20 s so a stalled read never holds the app.

## Phase 3 — publish and drill (B26)

Publish 1.0.31. The published tab joins from its opaque origin (the platform page owns the socket and relays it — to
be proven live, recorded as a drill row, not claimed): the CLI with the app id asks `sentinel.deliveries`,
`delivered ≥ 1`, every item cites a ledger row or says it is not on the ledger; sign out → `ledger not read`; close
the tab → `delivered 0`.

## Phase 4 — notifications

A refused platform gate run notifies from the platform itself (bell and optional email) to each member who follows the
two "Sentinel gate" automations — 4a is a setting on the platform, no code; 4b, only if leads should opt in from inside
Sentinel: a "Notify me of refused deliveries" toggle on the Platform deliveries header using
`subscribeToAutomation`/`unsubscribeFromAutomation` with the viewer's session, the automations' hook ids kept in the
linked project's settings. Review steps, holds, issues and state changes stay in Sentinel's own surfaces (the platform
has no custom notification types).

## Fixes found on the way (in this item)

- `bridge/platform-publish.mjs`: the raw-IFC fallback catches only a conversion error (today an upload error triggers a
  second, mislabelled upload).
- `CloudComponents/delivery-gate` (republished as 1.0.4; the automations re-pointed): the version labels are read,
  merged and written (today the whole map is replaced, which can erase the platform's own keys);
  `getFile(id, {showVersions: true})` (the option was misnamed `includeVersions`); the report download checks `ok`.
