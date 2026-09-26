# Publish on one path, ROI and the stage gate from the ledger — design (cohesion phase 5)

Status: approved 2026-09-26 (founder: "go", after the phase-5 map, the three-build split, the roadmap deviation and the
behaviour changes below were presented). Source: `docs/reviews/cohesion-review-2026-09-23.md` §3 (seams D5 path 4, D8,
D9), §5 (grafts: `roi:assumption`, ledger-derived gate), §6 (phase 5 row); findings F12, F39, F50
(`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`); the 4c deferrals (two `/propose` per accept, `audit()` returning no
row, the API-thread 120 s calls). The code map is the 2026-09-26 phase-5 mapping run (three readers, a critic that
verified ten claims by reading the lines, four live read-only SELECTs).

## Facts this design rests on

- **D8, the ungated default.** Auto-Publish is `public static bool Enabled = true` — one switch per Revit process, not
  saved, on at every start (`Engine/AutoPublish.cs:23`), fired on every save and sync (`App.cs:215, 253-254`); it
  exports the whole model in IFC2X3 and registers a version with no gate, IDS or naming (`AutoPublish.cs:49-88`). Quick
  Publish (`Commands.PublishToPlatform.cs`) is ungated and prints a shell command (`:83-85`; a second copy at
  `Commands.GovernedPublish.cs:105-106`). The outbox watcher (`WebApp/bridge/watch-outbox.mjs`) takes the key from the
  sidecar, else falls back to the That Open project id (`:50`, `:123`), and registers versions with no check.
- **D9, publishing without a verdict.** `cde_transition` checks the state machine and a lead role only
  (`db/migrations/0004_auth_rls.sql:61-95`); `cv_update` lets a contributor PATCH `state` directly (`0004:154-156`);
  `registerFileVersion` takes `state` from the body (`cde-store.mjs:573`).
- **Verdicts that measured nothing, or someone else's.** An installed IDS with `elements: []` answers accepted with
  `in_scope 0` (`src/sentinel-core/ids.ts:168`); `adjudicateProposal` passes it through (`cde-store.mjs:929-987`) and never
  checks that `version_id` belongs to the key's project (`:977`) — any member can stamp `verdict:accepted` on any
  version. Governed Publish prints "✓ ACCEPTED" with nothing in scope (`Commands.GovernedPublish.cs:184`); intake
  special-cases it (`intake-logic.mjs:66-67`) but stamps the raw verdict (`:86`).
- **F12 and a live naming split.** Revit registers the raw `doc.Title` (`GovernedNotify.cs:188`) while the exporter strips
  one suffix (`Commands.GovernedPublish.cs:203-208`): live, aster-tower has `AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc`
  (3 versions, no geometry) and `…_yazan.ifc` (5 versions with geometry); demo the same. The `_yazan` is the local file.
- **Two adjudications per accept** (live: proposal rows #654 and #657 for one publish); `RegisterVersionId` and the stamp
  block the API thread on the 120 s client (`GovernedPublish.cs:158-167`).
- **Geometry by name.** `registerFileVersion` attaches a platform item to the live version without geometry by name
  (`cde-store.mjs:548-555`); web uploads send `platform_item_id` without `attach_geometry:false`
  (`files-panel.ts:520-523`), so a web upload can land on a Revit-judged version.
- **F39.** ROI is `%AppData%\Sentinel\roi.json` with compiled constants (`Engine/RoiTracker.cs:24-33`), machine-wide.
- **F50.** The stage gate is posted by the browser (`project-shell.ts:141`); `recordGate` trusts the body's status
  (`cde-store.mjs:171`); the four count metrics default to 0 (`check-registry.mjs:468-469`) — "No open issues" is a
  pass on no data. `GateMetrics` counts are non-nullable (`gates.ts:21-24`).
- `audit()` writes with PostgREST's default return=minimal (`cde-store.mjs:644-649`); `POST /cde/:key/audit` accepts any
  `entity_type`/`action` (`:651-669`), so `verdict:`, `gate:`, `roi:` and `state:` rows can be forged through it.

## Goal

A model reaches the web by one governed path: judged (gate → IDS → naming) in one call that registers the version and
stamps its verdict; auto-publish runs that same path only when the project's lead turned it on; a version is published
only with an accepted verdict that measured something, or a signed-in lead's recorded reason. ROI and the project stage
are read from the ledger, not a machine file or a browser snapshot.

Definition of done:
- *5a:* with migration 0031 applied, `cde_transition` refuses shared→published for a version whose latest verdict is not
  an accepted one with `in_scope > 0` ("… needs the lead's reason"); a signed-in lead's reason publishes it and the
  `state:` row records verdict, verdict_audit_id and override; a direct `state` PATCH is refused; `/propose` with an
  empty element list on an installed IDS answers `recorded`, and with another project's `version_id` a 400;
  `/propose` with `register` answers `version {id, revision, state: "wip"}` and one proposal row; the watcher moves an
  IFC with no sidecar project to `outbox\unbound\` and attaches geometry to the sidecar's `version_id`;
  `POST /cde/:key/audit` with `action: "verdict:accepted"` is a 400; installing `publish@1 {auto: true}` works from the web.
- *5b:* Governed Publish on Aster Tower registers **one** container named from the central file, one proposal row, and
  prints the version and both ledger lines; with `publish` not installed a save exports nothing and the pane says why;
  with `publish@1 {auto: true}` a save runs the same pipeline without a dialog and a rejected run uploads nothing; Quick
  Publish, the toggle and the shell text are gone.
- *5c:* the ROI dashboard shows counts read from the ledger and, with `roi@1` installed, money naming `roi@1 · source ·
  sha`; without it counts and no money; the Dashboard's gate is run by the bridge and the stage is the newest
  `gate:pass` ledger row; an unmeasured count is not a pass.

## Decisions

1. **Three builds, in order 5a → 5b, with 5c after 5a** (5c may run alongside 5b). Each has its own plan, branch, drill
   and merge.
2. **The publish policy is an artefact kind `publish`**, body exactly `{auto: boolean}` (a roadmap amendment: the
   review named `projects.metadata.publish`). It reuses the lead-only PUT, the `artefact_installed publish@n` ledger row,
   project → office inheritance, ETag/304 and Revit's cache, so every surface names `publish@n · source · sha`. None
   installed = auto off. Governed Publish is always allowed on a bound document — the policy governs only auto.
3. **One adjudication per publish.** `POST /cde/:key/propose` takes an optional `register: {name, size_bytes, sha256}`.
   When the final verdict is accepted or recorded the bridge registers the version (`registerFileVersion`,
   `attach_geometry: false`, state `wip`) and stamps `verdict:<v>` on it (`recordVersionVerdict`) with the same result —
   one proposal row, one registration, one verdict row; the reply adds `version {id, container_id, revision, state}` and
   `verdict_audit_id`. A rejected verdict registers nothing. `RegisterVersionId`, the stamp `/propose` and the inline
   `LiveVersion` go in 5b.
4. **Nothing in scope is `recorded`**, decided once in `adjudicateProposal` (accepted with `summary.in_scope === 0` →
   `recorded`, with the reason in the proposal row); intake's special case is deleted. **A `version_id` must belong to
   the key's project** (400 otherwise); the AI tools strip `version_id` and any override.
5. **The transition guard is SQL (migration 0031, founder-approved before apply)**: `cde_transition(p_version,
   p_new_state, p_actor, p_note, p_override)` (the 4-arg overload dropped); shared→published needs the latest
   `verdict:accepted` with `in_scope > 0` on the same project, else `p_override` (non-blank) from a signed-in lead
   (`auth.uid()` not null — the service key, Revit, `BCF_TOKEN` and the AI tools can never override); archived→published
   (restore) through the function; the `state:` row carries `verdict`, `verdict_audit_id`, `override`; a trigger makes
   `state` change only through the function and every new version start in `wip`. The bridge maps the refusal to 409;
   `registerFileVersion` ignores `b.state`; `unarchiveFile` calls the function. The web Publish button, on 409, asks the
   lead for the reason and retries with `override`.
6. **The watcher uses the sidecar only**: no fallback to the platform project id; an IFC with no sidecar or no project
   moves to `outbox\unbound\` with one log line (no upload, no registration); a sidecar `version_id` attaches the
   geometry to that version by id (PATCH `platform_item_id`); a sidecar without one (the pre-5b add-in) keeps today's
   registration with `attach_geometry: true`, removed in 5b. `attach_geometry` defaults to false for every other caller.
   `captureManifest` is kept.
7. **The ledger is not forgeable through the audit route and every writer returns its row**: `audit()` sends
   `Prefer: return=representation` and returns the row; `POST /cde/:key/audit` refuses `entity_type: "stage_gate"` and
   actions starting `verdict:`, `gate:`, `roi:`, `state:` (400).
8. **One Publisher (5b)**, `SentinelAddin/Engine/Publisher.cs`: `ContainerName` (pure: the central file's name for a
   workshared model, else the document's path; extension stripped, sanitized, `.ifc`); the export is the whole model
   (`Default3DView`) in `contract.IfcSchema ?? IFC2X3`; gate → IDS (extraction on the API thread, the HTTP off it) →
   one `/propose` with `register`; on accepted/recorded the sidecar `{project, container, version_id}` is written before
   the IFC moves into the outbox. Governed Publish = Publisher + its dialog (modal wait); auto = Publisher without a
   dialog on save/sync, only when `publish@n` says `auto: true`, never blocking the save/sync handler (continuations,
   BeginInvoke), a rejected run uploads nothing and logs its line. Deleted: Quick Publish, the toggle, the shell text,
   linked-model publishing with its Project Setup checkbox and `IsOpenedForExport`, `FileVersion`, `ModelPublished`,
   `RegisterVersionId`, `LiveVersion`, `upload-ifc.mjs` and `bridge:upload`. The pane's strip names the policy:
   `Auto-publish: on · publish@1 · office · …` or `Auto-publish: off — publish: none — not installed for <key> or its office`.
9. **ROI (5c) is an artefact kind `roi`** `{currency, hourly_rate, minutes: {delivery_gate?, naming?, family_heal?},
   basis?}` and counts from the ledger only: gate runs (`delivery_gate` with `passed` not null), renames (`naming` rows'
   `rows.length`), heals (`family_heal.healed_total`), read through the filtered audit route per project. Every other
   intervention is listed "not counted: writes no ledger row". Without `roi@n`: counts, no money. `RoiTracker`, `roi.json`
   and their harness stub go.
10. **The stage gate (5c)**, in two steps: (1) `GateMetrics` counts nullable, `?? 0` deleted — an unposted count is
    `not_checkable`, never a pass; (2) a lead-only `POST /cde/:key/gate {stage}` that measures its own inputs on the
    bridge and writes a `stage_gate` row (`gate:pass <stage>` / `gate:hold <stage>`, `new_value.checks`); the project's
    stage is the newest `gate:pass` row; `recordGate`, `stage` in `mergeMeta` and `POST /projects/:pid/gate` are removed;
    checks with no server source (health, compliance, COBie) stay `not_checkable` — no project advances past a stage
    whose gate needs them, and the Dashboard says why.

## Behaviour changes (accepted)

Auto-publish goes from on-for-everyone to off until a lead installs `publish@n {auto: true}`. Web-uploaded versions
carry no verdict (38 live wip versions): publishing them needs a lead's reason; a bridge without the Supabase anon key
forwards no user, so it cannot override. Linked-model publishing stops until links can be judged. The existing split
containers stay as history; the first publish after 5b starts one central-named container per model. Stage advances
through the bridge gate stall where a check has no server source.

## Testing

5a: migration drill on a branch-free transaction (apply 0031, probe each refusal, roll back where possible — apply only
with founder approval); vitest for `/propose` (downgrade, cross-project 400, `register`), the watcher (unbound folder,
attach by id, legacy path), the audit route's reserved prefixes, `audit()` returning rows, the `publish` validator, the
web Publish override prompt; Session B9 live. 5b: `tools/publish-check` (ContainerName incl. `.rvt`-in-Title and
central paths, the policy decision, the sidecar-before-move order), both builds; Session B10 in Revit. 5c: vitest for the
ROI counts and the gate route; the Revit ROI dashboard harness; Session B11.

## Out of scope

Sheets and Views publishing (keyed by model name under `%AppData%`); the watcher's single That Open platform project;
web uploads moving to `/intake`; ledger rows for the tools 4c deferred (auto-fix, requests, MEP voids, the Ghost chain,
CDE-01, changesets) — ROI lists them as not counted; per-project hash chaining; renaming or merging the existing split
containers.
