# Revit pulls its standards from the project — design (cohesion phase 4a)

Status: approved 2026-09-24 (founder: "continue with phase 4a", after the phase-4 split and the 4a decisions were
presented, including the `bds-office` cut-over). Source: `docs/reviews/cohesion-review-2026-09-23.md` §5–6 (phase 4
row), seams D2 (Revit half), D4 (ruleset/IDS half), D5 (paths 1–2); findings F26, F54 (product remainder). The
phase-4 code map this design rests on is the 2026-09-24 mapping run (five readers + critic); every file:line below
was read there. Phase 4b (delivery contract, guideline, layers, type catalogue as artefacts) and 4c (ledger grafts:
`Event()` on every tool, filtered audit read, public receipt verify) are separate designs.

## Goal

A Revit document judges by the standards installed on its web project (or that project's office), exactly as the
bridge and the web do — one `ruleset@n`, one `ids@n`, one `naming@n` — and says so. No machine file, no pilot
fallback, no machine-wide project key. When nothing is installed the add-in says "not installed for <key> or its
office" and never scores, passes or publishes under a green heading.

Definition of done: *on `aster-tower` the Revit pane's scan line reads "judged by ruleset@1 · office · fb8f9baefa9f…"
and its rows quote the Aster rules (AST, not BDS); on `aster-villa` with no project ruleset the same; on a document
bound to nothing the pane says "not bound — Sentinel ▸ Project Setup" and scores nothing; the Demo Tower (pilot)
still scans by BDS 1.5.0, now as `ruleset@1 · office` from `bds-office`.*

## Decisions (as presented and accepted)

1. **Cache per project on the machine, not in the model file.** `%AppData%\Sentinel\cache\<key>\<kind>.json` holding
   `{kind, ref, source, sha256, body, fetched_at}`. Extensible Storage writes on open dirty the file and fight for
   ownership in a workshared central (review §7, mapping risk). The cache is a copy with provenance, always labelled
   "cached", never a source for another key.
2. **The bridge adds ETags, and its 404 says why.** `GET /cde/:key/artefacts/:kind` sends `ETag: "<ref>:<source>:<sha256>"`
   (source inside, so a move from office to project is a change) and answers `If-None-Match` with 304. A 404 body
   carries `reason: "not_installed" | "no_project" | "unknown_kind"`.
3. **One ruleset per open document.** `RuleEngineHost` keeps a ruleset per document (keyed by `Document`), looked up
   by scan, sync, the Rule Set window and the journey strip. Documents Sentinel opens itself (linked-model export in
   `PlatformExporter`) are skipped by `OnDocumentOpened`.
4. **No standard installed means no score.** A `none` ruleset scans nothing and the pane shows "No ruleset installed
   for <key> or its office" with no percentage and no grade; the scan report posted to the bridge carries
   `ruleset_ref` and `ruleset_sha256` (null when none), and `office.model_health` is `not_checkable` when the latest
   scan has no ruleset ref. Governed Publish gets its own heading for a verdict that judged nothing ("Published — not
   judged: no IDS installed").
5. **Build and Apply install `ruleset@n+1` on the document's own project.** They start from the stored raw artefact
   body (never the org-expanded in-memory ruleset), merge worksets and naming rules, bump the patch semver, skip the
   install when the canonical sha is unchanged, and warn when the document's project currently inherits the office's
   ruleset ("this stops aster-tower inheriting ruleset@1 from aster-office").
6. **The central-file naming check (CDE-01) judges by `naming@n`.** A small C# port of the container-name validator
   (fields, separator, strip_extensions, pattern/enum/placeholders), cross-checked against the TS validator on shared
   fixtures. No naming installed → CDE-01 reports "no naming standard installed" once, not a violation.
7. **Project Setup binds a document only when asked.** The web project key lives only in the document (Extensible
   Storage `web_project_key`); Project Setup fills its box from the document, never from the machine default; the
   machine-scope save no longer writes a key. `bcf-config.json` loses `projectId` as a key source (the field is
   ignored if present). An unbound document gets "not bound — Sentinel ▸ Project Setup", never "default".
8. **Installs from Revit are recorded as coming from Revit and the named Windows user** (`actor: "revit:<user>"`,
   pointer `source: {tool:"revit-build", pack, document}`). A real per-user identity for Revit installs goes to the
   backlog (the add-in authenticates with the shared service token).
9. **The artefact store becomes writable by the bridge only.** Migration `0030_artefact_store_service_only.sql`
   excludes `store = 'artefact'` from the authenticated insert/update/delete policies on `bridge_docs` (reads stay
   member-scoped). Applied by the founder or an approved call.
10. **The web rule engine expands `{org}`** exactly as the add-in's `OrgNames.Apply` does, so one `ruleset@n` with
    placeholders judges identically on both surfaces (phase 3 left the web comparing the literal `{org}`).

## Design

### 1. One project context — `SentinelAddin/Engine/ProjectContext.cs`

`ProjectContext.For(Document? doc) → ProjectContext { string Key; bool IsBound; }` reads only the document's
`web_project_key` (`SettingsManager.LoadFromDocument`). API thread only (it reads Extensible Storage). Replaces
`SettingsManager.WebProjectKeyFor` (14 call sites, deleted) and every `cfg.ProjectId` fallback:
`GovernedNotify.KeyOf` (the key becomes a required argument; `Post` no-ops on an empty key and says why),
`GovernedQuery` (:52, :95, :157, and `ClashRegister(projectKey)` at :267-273), `Commands.IfcGate` (captures the key
at command time and passes it to `GovernedNotify.DeliveryGate`), `Commands.ClashRegister` (document key, Project Setup
hint instead of the bcf-config hint). `BcfConfig.ProjectId` and its `THATOPEN_PROJECT_ID`/"default" fallback are
removed as a key source. `PlatformExporter` writes no sidecar for an unbound document.

### 2. Artefacts in Revit — `SentinelAddin/Coordination/ArtefactClient.cs` + `Engine/ArtefactCache.cs`

`ArtefactClient.Resolve(string key, string kind) → ResolvedArtefact { Kind, Ref, Source, Sha256, BodyJson,
Origin: "bridge" | "cache" | "none", Reason }`. GET with `If-None-Match` from the cache; 200 → write the cache; 304 →
use the cache; 404 `not_installed` → clear the cache, `none`; 404 `no_project` → `none` with "no project <key> on
the bridge"; transport failure → the cache if present (`Origin: "cache"`, "bridge unreachable — cached <time>") else
`none`. Never throws. `ArtefactCache` is pure file I/O over `%AppData%\Sentinel\cache\<key>\<kind>.json` (key
sanitised) and is unit-checked in a `tools/artefact-cache-check` harness. Fetches on `DocumentOpened` run off the UI
thread through the existing external-event path; the ruleset reload and rescan land on the API thread.

Bridge (`WebApp/bridge/bcf-service.mjs` artefacts route + `send()`): ETag and 304 as decided; 404 reasons from
`resolveArtefact` (not installed) versus `ensureProject` (no project) versus the kind check.

### 3. The ruleset — `RulesetStore`, `RuleEngineHost`, the pane

`RulesetStore.LoadFor(Document doc) → (Ruleset rs, ResolvedArtefact src)`: `ArtefactClient.Resolve(key, "ruleset")`
→ deserialise the body into the C# `Ruleset` (field names already match, verified by running the bridge validator on
the add-in's ruleset) → `OrgNames.Apply` on a copy → or the explicit `none` ruleset (`StandardKey = "none"`, no
rules). Deleted: `MasterRulesetPath` (setting, dialog box and Browse button), the `%AppData%`/`%ProgramData%`/bundled
file chain and the embedded `Resources/ruleset.json` (moved to `demo/bds-pilot/` as seed data, the three tools checks
repointed). `RuleEngineHost` holds `Dictionary<Document, (Ruleset, ResolvedArtefact)>`; `ScanFull`, `OnSynchronized`,
the Rule Set window and `App.RefreshJourney` read the entry for their document. The pane: `none` → the "No ruleset
installed" line and no score; a cached ruleset → "judged by ruleset@n · source · sha (cached <time>)". The journey
scan line compares sha (`ScanRulesetLine` now takes the local ref/sha). `ScanReportDto` gains `ruleset_ref`,
`ruleset_sha256`; bridge `office-store.validateScan` keeps them; `office-checks` `classifyModelHealth` is
`not_checkable` ("the latest scan names no ruleset") when absent or `none`.

### 4. The IDS and Governed Publish

`IdsSpecFile` becomes a thin wrapper over `ArtefactClient.Resolve(key, "ids")` used for display only. Governed Publish
and fix-in-place stop posting `body.ids` (the bridge resolves project → office itself). `ProposalResult` parses
`ids_source`, `ids_ref`, `ids_sha256`, `naming_ref`, `naming_source`, `warned`, `ids_enforce`. The Governed Publish
dialog builds its IDS line from the response (`ids@n · source · sha12…`) and uses a separate heading for a `recorded`
verdict. The BCF Issues banner says "No IDS installed for <key> or its office" when the artefact resolves to none.

### 5. Naming in Revit — `SentinelAddin/Engine/ContainerNameJudge.cs`

A pure port of the web's container-name validation over a `naming@n` body. CDE-01 (`CdeSyncGuard`) calls it with the
document's resolved naming; the ISO regex is deleted; `ProjectCode` comes from the document only. A
`tools/naming-port-check` harness runs the port over shared fixtures (`WebApp/src/sentinel-core/fixtures/naming-cases.json`,
generated from the TS validator's own outcomes) and fails on any disagreement.

### 6. Build and Apply write the project's ruleset

`StandardsBuilder.PersistRuleUpdates` → GET the raw `ruleset` body (project → office), merge WS-01 and pack naming
rules into the raw body, bump the patch semver, compute the canonical sha (the bridge's `canonical()` rule, ported),
skip when unchanged, else `PUT /cde/<key>/artefacts/ruleset?actor=revit:<user>` with `source`. The result dialog
names the new `ruleset@n` and warns on a fork from the office. The office snapshot reads the ruleset at click time and
sends `ruleset.ref` and `ruleset.sha256`.

### 7. Rule Set window

Header = the document's `refLabel` (or "none — not installed for <key> or its office"); the "office master + project
overlay (effective set)" subheader and the ribbon tooltip claim are deleted; it shows the active document's ruleset.

### 8. Web `{org}` expansion

`WebApp/src/sentinel-core/org-names.ts`, a port of `OrgNames.Apply` (expand `{org}` in doc refs, token defs
(regex-escaped), parameter names, messages and doc refs; drop rules that need an org when none is set, and return
their ids). `activeRuleset` applies it to the artefact body; a test runs it over the Aster `ruleset@1` shape.

### 9. Pilot cut-over (controller, before the add-in is deployed)

Create `bds-office` (kind office); install on it `ruleset@1` (from `%AppData%\Sentinel\ruleset.json`, BDS 1.5.0),
`ids@1` (from `%AppData%\Sentinel\ids.json`), `naming@1` (from `demo/bds-pilot/bds-naming-ruleset.json`); attach `demo`
(`office_key = bds-office`). Bind the Demo Tower model to `demo` in Project Setup (Revit). Verify
`GET /cde/demo/journey` names the three `· office` refs before deploying.

## Honesty

Every Revit surface that judges names `kind@n · source · sha`; a cached artefact says cached; `none` never scores,
passes, or publishes under a green heading; an unbound document is never silently "default". Statuses unchanged.

## Testing

- Bridge: artefacts route ETag/304 and 404 reasons (bcf-service route test or a store-level test); `validateScan`
  keeps the ruleset ref; `classifyModelHealth` not_checkable without it; migration 0030 read in review.
- Web: `org-names.test.ts` (expansion, removal, regex escaping), `activeRuleset` applies it.
- Add-in (tools harnesses, net8.0, compile the pure files): `artefact-cache-check`, `naming-port-check` (shared
  fixtures), `project-context-check` (the pure key-reading helper), existing `org-check`/`snapshot-check`/
  `naming-check` repointed and green. `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false`
  and 2025.
- Live drill (Session B5 in `docs/TESTING_PROTOCOL.md`): pilot cut-over; Revit closed → deploy; Aster Tower pane
  judged by `ruleset@1 · office` with Aster rows; Demo Tower judged by BDS as `ruleset@1 · office` from `bds-office`;
  an unbound document says so; Build Office System on the Aster template installs `ruleset@2` with a fork warning
  where applicable; bridge stopped → "cached" labels.

## Out of scope

Contract, guideline, layers, type catalogue (4b); ledger grafts (4c); publish policy and the outbox watcher key (5);
the coordinator list (`RequestManager` settings.json); shared-parameter GUIDs in packs; per-user identity for Revit
installs; the `default` self-heal on the bridge (kept; nothing in the add-in sends it any more).
