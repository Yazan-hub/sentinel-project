# Phase 5b — Publishing Needs a Verdict (the Revit add-in) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `Publisher` behind Governed Publish, Auto-publish and the outbox: the container named from the central file, the whole model exported in the contract's schema, one `/propose` with `register` that judges, registers and stamps, and a sidecar `{project, container, version_id}` written before the IFC moves — so a Revit publish is a wip version with a verdict, or a named refusal, never a file the bridge has to guess a project for.

**Architecture:** Task 1 writes `Publisher.cs` and its pure lines (harness-checked, Revit-free); Tasks 2–3 route Governed Publish, Auto-publish and the pane through it and delete Quick Publish, the Auto-Publish toggle, the shell-command text, link publishing and the pre-5b bridge calls (`FileVersion`, `ModelPublished`, `RegisterVersionId`, `LiveVersion`); Tasks 4–5 make the outbox watcher sidecar-only (the pre-5b path removed) and bring the handbook, INSTALL, capability row and Session B10 in line. Revit API only on the API thread; no HTTP on the save/sync handlers; modal commands wait with `Task.Run(...).GetAwaiter().GetResult()`.

**Tech Stack:** C# add-in (Revit 2024/2025, `dotnet build SentinelAddin -c Release -p:RevitVersion=<n> -p:DeployToRevit=false` during the tasks), Revit-free harnesses under `tools/`, Node bridge (vitest).

Spec: `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` (5b, Decision 8). Branch: `feature/publish-one-path-revit` from master 41b7ad1 (+ this plan's commit).

**Follow-ups the cross-check found outside 5b's scope (not tasks here):** `registerFileVersion`'s `attach_geometry: true` opt-in (`cde-store.mjs:543-555`, pinned by `transition-guard.test.mjs:154-158`) keeps no caller after Task 4 — a three-file deletion for a later branch; phase 5c must drop the `RoiTrackerStub` Compile line from `tools/publish-check/publish-check.csproj` when it deletes `RoiTracker`; `docs/killer-features-vision.md:17` still names `PublishToPlatform` (a dated vision note); the F12 container name from a `.hKNTHU`/`.rvt` title is harness-covered and measured live only by B10's "One container, one row" row.

## Global Constraints

- (controller) Master is 41b7ad1 (phase 5a merged). The whole plan — parts A, B, C with the amendments — was applied task by task to `git archive 41b7ad1` at `scratchpad\p5bX` (commits `task1 as written`, `task1 amended`, `task2 amended`, `task3 amended`, `task4`, `task5`, `task3: Http field deleted`); every quoted old text in the three parts matched exactly once (the appliers `scratchpad\p5bX_apply.py`, `p5bX_t1_amend.py`, `p5bX_t5_apply.py`). The working tree is CRLF, the archive and the plan text LF: match text, not bytes.
- Execution order: Tasks 1, 2, 3, 4, 5, then the controller's Task 6 (deploy with Revit closed, restart the bridge AND the outbox watcher in the same step, Session B10, merge). Amendments override a task's text where they conflict. Task 1 = part A + Amendment 1; Tasks 2-3 = part B + Amendments 2-3; Task 4 = part C unchanged; Task 5 = part C + Amendment 5.
- Branch from 41b7ad1. Never deploy from a task: always `-p:DeployToRevit=false`. Nobody pushes before Task 5 is committed. No task touches the live database.
- Add-in build (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false`, and 2025): green after every task, 0 errors. 2024: 6 warnings — Commands.BcfIssues 322 (CS4014), Commands.GhostBuilder 220 (CS0618), Engine/RuleRegex 17 and 20 (CS8602), GhostBuilder/ChangesetExecutor 164 (CS0618), GhostBuilder/GhostBuilderOrchestrator 112 (CS0618). 2025: 3 — Commands.Annotate 76 and 88 (CS8600), Commands.BcfIssues 322 (CS4014). Master's sets, measured unchanged after Tasks 1, 2, 3 and the `Http` deletion. Tasks 4 and 5 touch no C#.
- Build state per task: T1 green (no caller moves), T2 green, T3 green, T4/T5 no C# — no red window anywhere. Part B's Tasks 2-3 as written do NOT compile against part A's Publisher (`Commands.GovernedPublish.cs(58,30): error CS1501: No overload for method 'Prepare' takes 4 arguments`; Task 3 would add `Publisher.AutoOn`): Amendments 2 and 3 replace the two files, measured green.
- Harness totals: `tools/publish-check` 101/101 from Task 1 (part A's text alone is 98/98; Amendment 1 adds three checks); unchanged throughout: fixplace-check 52/52, gate-check 123/123, event-check 44/44, artefact-cache-check 53/53 (compiles `GovernedQuery.cs` without `LiveVersion` after T3 — no edit needed), project-context-check 19/19, heal-check 9/9, ghost-standards-check 125/125, naming-check 37/37, naming-port-check 59/59, org-check 46/46, snapshot-check 21/21, ruleset-install-check 21/21, guideline-check 17/17, wallpair-check 9/9, ghost-p2-check 42/42, massing-check 13/13, typeparse-check 6/6, annotate-check ALL PASS, datum-check DATUM OK (all measured on the T3 tree).
- npm test (`cd WebApp && npm test`; without `config/.env` set dummy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` — otherwise `cde-store-actor.test.mjs` fails 6 with "CDE not configured"): master 1135 in 82 files; after T4 1134 in 82 (outbox-logic.test 17 → 16, propose-register 28; T4 RED = `11 failed | 33 passed (44)` on the two files, GREEN 44/44). tsc: 24 in the working tree; an archive copy shows 25 (`src/generated/fragments-worker` is untracked). T1-T3 and T5 change no web count.
- T4's watcher smoke (Step 6) runs equally well on an archive copy with `THATOPEN_API_KEY=t4 THATOPEN_PROJECT_ID=t4 SENTINEL_OUTBOX=<scratch>` — every line printed word for word (dry-run: three `would move … — pre-5b sidecar (no version_id)` / `— no sidecar`; `--once`: the three `⛔` lines, `unbound\` holding five files, `sent\` empty; `grep -c "pre-5b sidecar, no version_id" bridge/watch-outbox.mjs` → 0).
- CI: T1 renames the Revit-free step "... + ledger events + heal + publish)" and adds `dotnet run --project tools/publish-check`.
- File ownership, T1: `SentinelAddin/Engine/Publisher.cs` (new), `Coordination/ProposalResult.cs`, `Coordination/GovernedNotify.cs` (`Propose` only), `tools/publish-check/*` (new), `.github/workflows/ci.yml`. T2: `Commands.GovernedPublish.cs` (rewritten), `Engine/AutoPublish.cs` (`InFlight` only), `App.cs:309-310`. T3: `Engine/AutoPublish.cs` (rewritten), `App.cs` (:126-129, :252-253, :307-320), `Commands.AutoPublish.cs` and `Commands.PublishToPlatform.cs` (deleted), `Engine/PlatformExporter.cs`, `Engine/SettingsManager.cs`, `UI/SettingsDialog.xaml(.cs)`, `Coordination/GovernedNotify.cs` (summary, `ModelPublished`, `FileVersion`, `RegisterVersionId`, `Post`, the `Http` field), `Coordination/GovernedQuery.cs`, `UI/SentinelPanelViewModel.cs`, `UI/SentinelPanel.xaml`. T4: `WebApp/bridge/outbox-logic.mjs(.test)`, `watch-outbox.mjs`, `cde-store.mjs` (:1006, :1104), `propose-register.test.mjs`, `upload-ifc.mjs` (deleted), `package.json`, `thatopen-client.mjs`, `cli-args.mjs`, `docs/verdict-contract.md:77`. T5: `docs/TESTING_PROTOCOL.md`, `docs/handbook/05-capability-status.md`, `docs/SENTINEL_HANDBOOK.md`, `SENTINEL-USER-GUIDE.md`, `SentinelAddin/INSTALL.md`, `docs/testing/SIMULATION_ROOM.md`. Not touched by design: `docs/TESTING_PROTOCOL.md:188, :259` (B8/B9 records), `SIMULATION_ROOM_RUN_2026-09-22.md`, `docs/CAPABILITY_MAP.md`, `docs/killer-features-vision.md:17` (a vision note naming `PublishToPlatform`).
- Interfaces, as built (Tasks 2-3 and the docs use exactly these): `PublishPlan Publisher.Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null)` — never null, never throws for a failed export; `plan.Refusal`, `plan.GateFailed`, `plan.Ready`, `plan.OrgWarning`; `PublishOutcome Publisher.Judge(PublishPlan plan, string source = "Governed Publish")`; `StageResult Publisher.Stage(plan, outcome, outboxDir)`; `void Publisher.Discard(plan)`; `bool Publisher.AutoEnabled(ResolvedArtefact publish)`; `PublishLines.Dialog(plan[, outcome, stage])`, `PublishLines.Doctor(plan[, outcome, stage])`, `PublishLines.Policy(artefact)`; `ProposalResult.Version/VerdictAuditId/VerdictHash/Downgraded`, `ProposalResult.RequestBody(...)`, `RegisterRequest`; `GovernedNotify.Propose(..., RegisterRequest? register = null)`. The resolver is `(kind, timeout) → ResolvedArtefact`; both callers pass `(kind, t) => ArtefactClient.Resolve(key, kind, t)`.
- Threading: `Prepare` runs on the API thread (in the command; in a `RevitEventHub` job for auto) and waits there on `Task.Run` for the contract (≤ 4 s) and the gate row (≤ 6 s), as Governed Publish did on master; `Judge` runs on a `Task.Run` — the command waits with `.GetAwaiter().GetResult()`, auto continues with `ContinueWith(..., TaskScheduler.Default)` → `events.Enqueue(Stage + the Doctor line)`; the save/sync handler (`AutoPublish.Trigger`) returns after one Extensible Storage read and the policy GET goes on a task; its off line lands through `Dispatcher.BeginInvoke`; no Revit object crosses to a worker. `Stage` is file I/O only.
- Honesty: every surface prints the labels the bridge answered (`contract@n`/`ids@n`/`naming@n`/`publish@n · source · sha`, or the none reason); `ledger #<id> · receipt <16 hex>…` only through `LedgerLine.For` with an id and a 64-hex hash the bridge returned. The receipt decision: the pinned `Version: <container> <revision> · wip · ledger #<verdict_audit_id> · receipt …` and `Auto-published … · ledger #… · receipt …` print the stamp row (`LedgerResult.FromReceipt(VerdictAuditId, VerdictHash)`), which Task 4's bridge answers as `verdict_hash`; against a bridge without it the line reads `… · wip · not confirmed — the bridge returned no chain hash`, so the add-in may be deployed before or after the bridge. Part A's cross-task note "the Version: line carries no receipt" is withdrawn by Amendment 1. `✓ ACCEPTED` never prints on a `recorded` verdict; a reply without a version stages nothing and says `Version: not confirmed — <reason>`.
- Policy rule (part A, kept): `AutoEnabled` is true for any `Origin` but "none" whose body is `{auto: true}` — the bridge's answer or its cached copy, as every other artefact judges; the line then carries `(cached HH:mm)`. `{auto: false}`, none, cached-none and an unparseable body are off, with the reason.
- Deploy order (Task 6): Task 4's watcher files the master add-in's sidecar under `unbound\` ("pre-5b sidecar (no version_id): … Update the add-in and publish again."), so the add-in (Revit closed) and the bridge + watcher restart go in one step. B10 installs `publish@1` on `aster-tower` and `demo` as projects (not the office) and ends both on `publish@2 {auto: false}`.
- Temp files: Governed Publish exports under `%TEMP%\Sentinel\governed\<guid>\<ContainerName>`, auto under `%TEMP%\Sentinel\auto\<guid>\…`; `Prepare` discards on every refusal, `Stage` on every non-staged outcome; a failed move keeps the temp IFC and the dialog names it. `AutoPublish.InFlight` keeps Governed Publish from starting while an auto run is between Prepare and Stage.
- Literals: production code carries no BDS/AST literal; `tools/publish-check/Check.cs` uses `AST_ASTR26_Aster Tower.ifc` as fixture data, as `artefact-cache-check` and `heal-check` use `AST` today, and as the pin's own F12 example asks.
- Deleted names: after T3 `git grep -n -E "PublishToPlatform|ToggleAutoPublish|AutoPublish\.Enabled|ExportLinksToOutbox|IsOpenedForExport|PublishLinkedModels|FileVersion\(|ModelPublished|RegisterVersionId|LiveVersion|upload-ifc|bridge:upload" -- SentinelAddin tools` prints only `tools/publish-check/Check.cs:324` (the harness pinning that the word is gone); after T4 the same over `WebApp` prints only `setLiveVersion`/`registerFileVersion`/`soleLiveVersionId` (other identifiers), the `0031_probe.sql` comment and thatopen-client's "went in 5b" comment.
- Harness dependencies: `publish-check.csproj` compiles `..\gate-check\RoiTrackerStub.cs` and `FixPlan.cs` + `IdsIssueRef.cs` + `PsetMap.cs`; phase 5c must drop the stub line from `publish-check.csproj` when it deletes `RoiTracker`.
- Commits: every message ends with "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>".
- Windows: quote paths; scripts through a Bash heredoc stay backslash-free or go in a file (the Python amendment scripts hold `\"` and must be run from files). Markdown tables: no `|` inside a cell (B10: 19 lines × 3 pipes; the capability table 50 → 51 rows).

---

### Task 1: Revit — `Publisher` (the one publish path): `ContainerName` from the central file (F12), `Prepare` on the API thread, `Judge` off it with one `/propose` carrying `register`, `Stage` sidecar-before-move, `PublishLines` and the publish policy (pure); `GovernedNotify.Propose` takes `register`; `ProposalResult` reads `version`, `verdict_audit_id` and `downgraded`; `tools/publish-check` 98/98 in CI

(Every block below was applied, as written, to a `git archive` of master 41b7ad1 in `scratchpad\p5bA` and measured: Step 2 RED, Step 6 GREEN 98/98, both add-in builds 0 errors with master's warnings, the four sibling harnesses unchanged. No caller moves in this task — Governed Publish, Auto-Publish and their callers compile as on master until Tasks 2 and 3. The add-in build is green after this task: no red window.)

**Files:**
- Create: `SentinelAddin/Engine/Publisher.cs`
- Create: `tools/publish-check/publish-check.csproj`, `tools/publish-check/Check.cs`
- Modify: `SentinelAddin/Coordination/ProposalResult.cs` (:31-42 the last fields, the labels and the head of `Parse`; :96-105 the `Str`/`Scalar` helpers and the file's end)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (:131-161 `Propose`'s summary tail, signature and body building)
- Modify: `.github/workflows/ci.yml` (:38 the Revit-free step's name, :48 its last `dotnet run`)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md:26-28` (F12), `:56-59` (the 5b definition of done), `:72-77` (Decision 3: `register`, the reply's `version {id, container_id, revision, state}` and `verdict_audit_id`), `:78-80` (Decision 4: `downgraded`), `:89-93` (Decision 6: the sidecar `version_id`), `:97-106` (Decision 8), `:132-133` (Testing 5b); `SentinelAddin/Commands.GovernedPublish.cs:1-211` whole (the flow this Publisher replaces in Task 2: the contract wait :53, the temp export of the active view :57-60, the gate and its waited row :75-77, the org warning :88-92, the extraction :93, the first `/propose` :95, the outbox copy BEFORE the sidecar :143-146, `RegisterVersionId` :158, the stamp `/propose` :163, `LiveVersion` :169, the dialog :183-198, `SafeName` :203-208 — `GetFileNameWithoutExtension`, the F12 split's other half); `SentinelAddin/Engine/PlatformExporter.cs:27-34` (`OutboxDir`), `:53-75` (`ExportToOutbox`; :64-68 writes the sidecar first — the rule `Stage` keeps), `:84-102` (`WriteOutboxMeta`: the pre-5b sidecar `{project, docTitle, host}`), `:111-181` (`ExportLinksToOutbox`, Task 3's deletion), `:191-220` (`ExportToDir(doc, filterViewId, dir, ifcName, ifcSchema)` → `(State, path, bytes, error)`, never throws), `:236-246` (`Default3DView`), `:248-252` (`Sanitize`, private); `SentinelAddin/Coordination/GovernedNotify.cs:26`, `:32` (the 6 s and 120 s clients), `:36-43` (`Send`), `:46-48` (`KeyOf`, `NotBoundError`), `:58-62` (`Event`), `:66-73` (`ModelPublished`), `:81-91` (`FileVersion`), `:102-109` (`DeliveryGate` returns `LedgerResult`), `:135-175` (`Propose`), `:182-203` (`RegisterVersionId`, deleted in Task 3), `:296-316` (`Post` — calls `App.PanelVm`, so this file is never harness-compiled); `SentinelAddin/Coordination/ProposalResult.cs:1-105` whole (`Reached`, `Verdict`, `AuditId`/`ReceiptHash`, the `IdsLabel`/`NamingLabel` refLabels, `Str`/`Scalar`; `ElementFailure` is declared in `Coordination/FixPlan.cs:37`); `SentinelAddin/Coordination/LedgerResult.cs:52-55` (`FromReceipt`), `:156-177` (`LedgerLine.For`/`Sentence`); `SentinelAddin/Engine/GateLines.cs:23-28` (`Verdict`), `:32` (`PublishLine`), `:36-37` (`JudgedAlone`), `:70-75` (`PublishRejected`); `SentinelAddin/Engine/DeliveryContract.cs:104-108` (`Load(key)` → `(Contract, Source)`), `:111-116` (the internal `FromResolved`); `SentinelAddin/Engine/IfcDeliveryGate.cs:26-50` (`GateResult`: `Outcome` defaults to Fail, `FileSha256`, `FileSizeBytes`, `CertificatePath`), `:59-77` (`Validate(ifcPath, contract, source)` — no contract → NotChecked with the sha still recorded), `:177` (the certificate is `Path.ChangeExtension(ifc, ".sentinel-cert.json")`), `:199` (`RoiTracker.Log`, why the harness needs the stub); `SentinelAddin/Engine/GovernedElementExtractor.cs:42-50` (`Extract(Document doc, string modelId, string? org = null)` → `List<GovElement>`, read-only); `SentinelAddin/Engine/GovElement.cs` whole (Revit-free); `SentinelAddin/Engine/CdeSyncGuard.cs:37-46` (the central-path read `ContainerName(Document)` lifts: `GetWorksharingCentralModelPath` → `ConvertModelPathToUserVisiblePath`, guarded by `IsWorkshared`); `SentinelAddin/Engine/ProjectContext.cs:2-4`, `:42-46` (the `SENTINEL_CHECK` guard pattern); `SentinelAddin/Engine/AutoPublish.cs:1-89` whole (Task 3's starting point; untouched here); `SentinelAddin/App.cs:24-26` (`Engine`, `Events`, `OrgFor`), `Engine/RuleEngineHost.cs:22` (`SourceFor(doc)` → `ResolvedArtefact`, its `Label` is the org warning's ruleset name); `SentinelAddin/Coordination/ArtefactClient.cs:16-25` (`ResolvedArtefact`: `Origin` bridge | cache | none, `Label`), `:44-50` (`Resolve(key, kind, timeout?)`), `:84-89` (a 304 is `Origin` "bridge"), `:139-150` (a cache fallback is `Origin` "cache", label "… (cached HH:mm)"), `:154-155` (`None`, public); `tools/gate-check/gate-check.csproj` (the set of files the gate needs; the `RoiTrackerStub.cs` comment), `tools/gate-check/GateLinesCheck.cs:14-35` (how a `GateResult` fixture is built), `tools/event-check/event-check.csproj` (the `SENTINEL_CHECK` harness), `tools/event-check/Check.cs:9-17`, `:28-37` (the `Ok`/`Is`/`Main` pattern), `tools/fixplace-check/fixplace-check.csproj:10-14` (the files `ProposalResult.cs` needs: `GovElement`, `PsetMap`, `IdsIssueRef`, `FixPlan`); `.github/workflows/ci.yml:37-48`; bridge, read only: `WebApp/bridge/cde-store.mjs:986-1000` (`readRegister`: `register.name` must equal `container_name`, `size_bytes` a whole number, `sha256` 64 hex, never with `version_id`), `:1012-1032` (the 400s before any read), `:1065-1069` (`downgraded`), `:1093-1108` (`register` → `registerFileVersion(..., attach_geometry: false)` + `recordVersionVerdict`; the reply's `version {id, container_id, revision, state}` — the revision is `v{N+1}`, :569 — and `verdict_audit_id: stamp?.id ?? null`, no hash for it), `WebApp/bridge/outbox-logic.mjs:17-28` (`outboxDecision` reads `project` and `version_id` only; other sidecar keys are ignored), `WebApp/bridge/artefact-store.mjs:11`, `:185-190` (`KINDS` has `publish`; the body is exactly `{auto: boolean}`), `WebApp/bridge/propose-register.test.mjs:154-170` (the accepted reply's shape the harness fixture copies), `docs/verdict-contract.md:73-78` (the reply's `version` and `verdict_audit_id`).

**Interfaces:**
- Consumes: `DeliveryContract.Load(key)` / `FromResolved(src)`; `PlatformExporter.ExportToDir`, `Default3DView`; `IfcDeliveryGate.Validate`; `GovernedNotify.DeliveryGate` (waited on a `Task.Run`, ≤ 6 s), `GovernedNotify.Propose` (120 s client); `GovernedElementExtractor.Extract`; `ProjectContext.For` / `NotBound`; `App.OrgFor`, `App.Engine?.SourceFor(doc).Label` (the org warning's words, as today); `GateLines.Verdict`, `PublishLine`, `JudgedAlone`, `PublishRejected`; `LedgerLine.For`; `LedgerResult.FromReceipt` / `NotRecorded`; `ArtefactClient.None`, `ResolvedArtefact`.
- Produces (namespace `Sentinel.Engine`, file `Publisher.cs`; everything but `CentralPath`, `ContainerName(Document)`, `Prepare` and `Judge` compiles under `SENTINEL_CHECK`):
  - `public static string Publisher.ContainerName(string? centralUserVisiblePath, string? pathName, string? title)` — pure. The first non-blank of central path → path → title; the part after the last `\` or `/`, trimmed; `.rvt`, then `.rte`, then a trailing `.ifc` stripped once each, case-insensitively, and NOTHING else (`Tower v2.1` keeps its `.1`; the local `_yazan.hKNTHU` stays when there is no central, because it IS that file's name); `Path.GetInvalidFileNameChars()` → `_`; blank → `SentinelModel`; + `.ifc`. Aster: central `…\AST_ASTR26_Aster Tower.rvt` with local `…\AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt` → `AST_ASTR26_Aster Tower.ifc`.
  - `public static string? Publisher.CentralPath(Document doc)` — API thread; `IsWorkshared` and `GetWorksharingCentralModelPath()` → `ConvertModelPathToUserVisiblePath`, else null; never throws. `public static string Publisher.ContainerName(Document doc)` = `ContainerName(CentralPath(doc), doc.PathName, doc.Title)`.
  - `public sealed class PublishPlan { string Key, ContainerName, TempIfcPath; long SizeBytes; string Sha256; string? Refusal; string? OrgWarning; DeliveryContract? Contract; ResolvedArtefact ContractSource; IfcDeliveryGate.GateResult Gate; LedgerResult GateRow; IReadOnlyList<GovElement> Elements; bool GateFailed => Refusal is null && Gate.Outcome == Fail; bool Ready => Refusal is null && !GateFailed; }` — `SizeBytes`/`Sha256` are the gate's (`FileSizeBytes`/`FileSha256`, recorded even when NOT CHECKED); `Refusal` is set when the document is unbound (`ProjectContext.NotBound + "\n\nNothing was exported or published."`) or the export produced nothing (`"IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings."` / `"IFC export failed: <error>"`); `OrgWarning` is today's org-less ruleset text (Governed Publish :89-92), for Task 2's dialog and Task 3's Doctor log. `Gate` defaults to a `GateResult` nobody judged (Outcome Fail — `IfcDeliveryGate.cs:29`), so a hand-built plan must set it. No Revit object.
  - `public static PublishPlan Publisher.Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null)` — API thread. Key and name; the contract waited on a `Task.Run` (`DeliveryContract.Load(key)`, or `DeliveryContract.FromResolved(resolve("contract", null))` when a resolver is given — `(kind, timeout) → the project's artefact of that kind`, the shape Tasks 2-3 pass as `(kind, t) => ArtefactClient.Resolve(key, kind, t)`); the WHOLE model (`Default3DView`) exported to `tempDir\<guid>\<ContainerName>` in `contract?.IfcSchema ?? "IFC2X3"`; `IfcDeliveryGate.Validate`; the gate row waited on a `Task.Run` (`GovernedNotify.DeliveryGate(name, gate, key)`); a gate FAIL discards the temp IFC and returns (`GateFailed`); else `Elements = GovernedElementExtractor.Extract(doc, key)`. Unbound → `Refusal`, nothing exported. Never throws for a failed export (the plan says so); a resolver that throws faults the waited task.
  - `public sealed class PublishOutcome { ProposalResult Verdict; bool Reached, Accepted, Rejected, Publishable /* reached and not rejected */; ProposalResult.VersionInfo? Version; LedgerResult VerdictRow /* FromReceipt(AuditId, ReceiptHash) */; static PublishOutcome From(ProposalResult r); }`
  - `public static PublishOutcome Publisher.Judge(PublishPlan plan, string source = "Governed Publish")` — OFF the API thread: one `GovernedNotify.Propose(plan.Elements, versionId: null, actor: "Revit", projectKey: plan.Key, containerName: plan.ContainerName, source: source, register: new RegisterRequest { Name = plan.ContainerName, SizeBytes = plan.SizeBytes, Sha256 = plan.Sha256 })`. Never throws.
  - `public sealed class StageResult { bool Staged; string? OutboxPath, SidecarPath; string Reason; string? KeptIfcPath; }`
  - `public static StageResult Publisher.Stage(PublishPlan plan, PublishOutcome outcome, string outboxDir)` — pure over paths. `outcome.Publishable && outcome.Version != null`: `Directory.CreateDirectory(outboxDir)`; write `<outboxDir>\<ContainerName>.meta.json` = `{"project":<Key>,"container":<ContainerName>,"version_id":<Version.Id>}` FIRST; delete an older `<outboxDir>\<ContainerName>`; `File.Move` the temp IFC there; `Discard(plan)`. A sidecar that cannot be written moves nothing. Otherwise nothing is written, the temp IFC is discarded, `Reason` = `the bridge returned no verdict` / `the verdict is rejected` / `the bridge registered no version`. A write or move that throws: `Staged` false, `Reason` = `the IFC did not reach the upload outbox (<message>)`, `KeptIfcPath` = the temp IFC (kept), a written sidecar left in place (the watcher sweeps `.ifc` files only; the next stage of this container overwrites it).
  - `public static void Publisher.Discard(PublishPlan plan)` — deletes the temp IFC, `Gate.CertificatePath` and their folder when empty; best-effort.
  - `public static bool Publisher.AutoEnabled(ResolvedArtefact publish)` — the policy decision: `Origin != "none"` (the bridge's answer, or its cached copy when the bridge did not answer — as every other cached artefact judges) and the body's `auto` is JSON `true`. None, `auto: false` and a body that is not `{auto: boolean}` → false. `internal static bool? Publisher.PolicyAuto(string? body)` is the parser both it and `PublishLines.Policy` read.
  - `public static class PublishLines` — `GateRow(plan)` = `Gate row: ` + `LedgerLine.For(GateRow)`; `VerdictRow(outcome)` = `Verdict row: ` + `LedgerLine.For(VerdictRow)`; `Version(plan, outcome)` = `Version: <container> <revision> · <state> · ledger #<verdict_audit_id>`, or `… · stamp not confirmed — the bridge returned no verdict_audit_id`, or `Version: not confirmed — <reason>` (no version: `the bridge returned no verdict (<error>)` / `rejected — nothing was registered` / `the bridge registered no version`); `Ids(plan, outcome)` (today's IDS line; `IDS <label>: nothing in its scope — 0 in-scope element checks, so nothing was judged.` when downgraded; `IDS: none — no IDS installed for <key> or its office. The model was NOT judged.` when none); `Naming(outcome)` (today's); `Policy(artefact)` = `Auto-publish: on · <label>` / `Auto-publish: off — publish: <none label>` / `Auto-publish: off — <label>` (auto: false) / `Auto-publish: off — <label> did not parse: the body is not {auto: true} or {auto: false}`; `Dialog(plan, outcome = null, stage = null)` = with no outcome the refusal (not bound / no export as the plan states it, `GateLines.PublishRejected(gate) + "\n\n" + GateRow` on a gate FAIL, `""` when ready), with one the whole dialog after the referee (bridge not reached / rejected by checks or by name / accepted / recorded — the harness pins every text); `Doctor(plan, outcome = null, stage = null)` = Auto-Publish's one Doctor line (`Auto-published <container> v1 · wip · ledger #814`, `… — not judged: …` on recorded, `Auto-publish rejected — nothing uploaded — 3 of 40 element check(s) failed · <ids label> · ledger #813 · receipt …`, the gate FAIL, `Auto-publish: no verdict — nothing uploaded — <reason>`, `Auto-publish failed — nothing uploaded — <refusal>`, no version, the move failed).
- Produces (namespace `Sentinel.Coordination`, `ProposalResult.cs`): `ProposalResult.VersionInfo { string Id; string? ContainerId; string Revision, State; }`; fields `VersionInfo? Version` (from `version` with a non-empty `id`), `string? VerdictAuditId` (a number or a string, as text), `string? Downgraded`; `public static Dictionary<string, object?> ProposalResult.RequestBody(object elements, string? versionId, string actor, string? containerName, string? source, string? note, bool raiseBcf, string? failuresRequirement, RegisterRequest? register)` — the body `Propose` sends, `register` as `{name, size_bytes, sha256}` only when given; `public sealed class RegisterRequest { string Name; long SizeBytes; string Sha256; }`.
- `GovernedNotify.Propose(…, string? failuresRequirement = null, RegisterRequest? register = null)` — one optional parameter at the end; every existing caller (`Commands.BcfIssues.cs:204`, `:265`, `Commands.GovernedPublish.cs:95`, `:163`) compiles unchanged.
- `tools/publish-check` — net8 console under `SENTINEL_CHECK`; 98 checks.

- [ ] **Step 1: Write the failing harness**

Create `tools/publish-check/publish-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the one publish path (cohesion phase 5b, spec 2026-09-26 Decision 8): the container's name
       (the central file's, F12), the /propose body's register and the reply's version, the outbox staging order
       (the sidecar before the IFC, on a temp folder), every line Governed Publish and Auto-Publish print, and the
       publish@n policy decision. Compiles Publisher.cs's pure half under SENTINEL_CHECK (the Revit-typed Prepare and
       Judge are hidden) with the files it reads. No Revit API, no AppData, never the running bridge; `dotnet run`
       from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>publish-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
    <DefineConstants>$(DefineConstants);SENTINEL_CHECK</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\Publisher.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\GovElement.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ProjectContext.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\IfcDeliveryGate.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\DeliveryContract.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\GateLines.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\ArtefactClient.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\LedgerResult.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\ProposalResult.cs" />
    <!-- ProposalResult's ElementFailure lives in FixPlan.cs (fix-in-place), which reads PsetMap and IdsIssueRef. -->
    <Compile Include="..\..\SentinelAddin\Coordination\FixPlan.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\IdsIssueRef.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\PsetMap.cs" />
    <!-- IfcDeliveryGate logs a judged gate through RoiTracker; gate-check's stub keeps %AppData%\Sentinel\roi.json
         untouched (phase 5c deletes RoiTracker and the stub together: drop this line with them). -->
    <Compile Include="..\gate-check\RoiTrackerStub.cs" />
  </ItemGroup>
</Project>
```

Create `tools/publish-check/Check.cs`:

```csharp
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using static Sentinel.Engine.IfcDeliveryGate;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got.Replace("\n", "\\n") + "\n        want: " + want.Replace("\n", "\\n"));
    }

    const string FileSha = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef"; // the IFC the gate certified
    const string RowHash = "0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0"; // the proposal row's chain hash
    const string GateHash = "5c6d7e8f90112233445566778899aabbccddeeff00112233445566778899aabb"; // the gate row's chain hash
    const string CSha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";    // contract@1's sha
    const string ISha = "23bb57937fb0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aa";    // ids@4's sha
    const string NSha = "77e1d2c3b4a5968778695a4b3c2d1e0f0f1e2d3c4b5a69788796a5b4c3d2e1f0";    // naming@2's sha
    const string PSha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee";    // publish@1's sha
    const string Vid = "9d2c6e1a-5b3f-4c7d-8e9f-0a1b2c3d4e5f";
    const string Cid = "1d2c6e1a-5b3f-4c7d-8e9f-0a1b2c3d4e5f";
    const string Container = "AST_ASTR26_Aster Tower.ifc";
    const string Key = "aster-tower";

    // What /propose answers the Publisher (cde-store.mjs adjudicateProposal, 5a): accepted, registered as v1 wip,
    // stamped as row 814; the receipt is the proposal row's (813).
    const string Accepted = "{\"verdict\":\"accepted\",\"downgraded\":null,\"summary\":{\"in_scope\":40,\"passing\":40,\"failing\":0},\"failures\":[]," +
        "\"naming\":{\"ok\":true,\"failures\":[],\"enforce\":\"reject\"},\"naming_ref\":\"naming@2\",\"naming_source\":\"office\",\"naming_sha256\":\"" + NSha + "\"," +
        "\"warned\":false,\"ids_enforce\":\"reject\",\"ids_source\":\"office\",\"ids_ref\":\"ids@4\",\"ids_sha256\":\"" + ISha + "\",\"client_ids_ignored\":false," +
        "\"audit_id\":813,\"recorded_at\":\"2026-09-26T10:00:01+00:00\"," +
        "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"agent\":null," +
        "\"receipt\":{\"version\":\"sentinel-receipt/1\",\"audit_id\":813,\"ledger_hash\":\"" + RowHash + "\",\"prev_hash\":\"" + GateHash + "\"}}";
    const string VersionJson = "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814";

    static string Reply(string verdict, string? downgraded = null, int inScope = 40, int passing = 40, int failing = 0, bool version = true) =>
        Accepted.Replace("\"verdict\":\"accepted\",\"downgraded\":null", "\"verdict\":\"" + verdict + "\",\"downgraded\":" + (downgraded is null ? "null" : "\"" + downgraded + "\""))
                .Replace("\"in_scope\":40,\"passing\":40,\"failing\":0", "\"in_scope\":" + inScope + ",\"passing\":" + passing + ",\"failing\":" + failing)
                .Replace(VersionJson, version ? VersionJson : "\"version\":null,\"verdict_audit_id\":null");

    static int Main()
    {
        Console.WriteLine("Publisher — one publish path: the container's name, the /propose register and reply, the outbox order, the lines, the policy\n");
        Names();
        Wire();
        Outcomes();
        Staging();
        Lines();
        Policy();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. ContainerName: the central file's name, the same string everywhere (F12) ──────────────────────
    static void Names()
    {
        const string Central = @"C:\Projects\Aster\AST_ASTR26_Aster Tower.rvt";
        const string Local = @"C:\Users\yazan\Documents\AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt";
        const string LocalTitle = "AST_ASTR26_Aster Tower_yazan.hKNTHU";
        Is(Publisher.ContainerName(Central, Local, LocalTitle), Container, "a workshared model is named from its central file — the local's _yazan.hKNTHU is gone (F12)");
        Is(Publisher.ContainerName("BIM 360://Aster/Models/AST_ASTR26_Aster Tower.rvt", Local, LocalTitle), Container, "a cloud central path names it the same");
        Is(Publisher.ContainerName(null, Local, LocalTitle), "AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc", "no central: the document's own file name, .rvt stripped and nothing else");
        Is(Publisher.ContainerName("  ", "", LocalTitle), "AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc", "no central, no path: the title as it is (never GetFileNameWithoutExtension's '…_yazan')");
        Is(Publisher.ContainerName(null, "", "Villa.rvt"), "Villa.ifc", "a title carrying .rvt (Explorer shows extensions) is stripped");
        Is(Publisher.ContainerName(null, "", "Villa.RVT"), "Villa.ifc", "…case-insensitively");
        Is(Publisher.ContainerName(null, @"C:\t\Office Template.rte", "Office Template"), "Office Template.ifc", ".rte is stripped");
        Is(Publisher.ContainerName(null, @"C:\m\Tower v2.1.rvt", "Tower v2.1"), "Tower v2.1.ifc", "a dotted name keeps its dot: only .rvt, .rte and .ifc are extensions");
        Is(Publisher.ContainerName(null, "", "Model.ifc"), "Model.ifc", "a trailing .ifc is not doubled");
        Is(Publisher.ContainerName(null, @"C:\x\Model.ifc.rvt", "Model.ifc"), "Model.ifc", "a model opened from an IFC (Model.ifc.rvt) is Model.ifc");
        Is(Publisher.ContainerName(null, "/srv/models/Bridge.rvt", "Bridge"), "Bridge.ifc", "a forward-slash path splits too");
        Is(Publisher.ContainerName(Central, "", ""), Container, "the central wins with no path and no title");
        Is(Publisher.ContainerName(null, "", "A:B*C?"), "A_B_C_.ifc", "invalid file-name characters become _ (the SafeName Governed Publish used)");
        Is(Publisher.ContainerName(null, "", "   "), "SentinelModel.ifc", "a blank name is SentinelModel");
        Is(Publisher.ContainerName(null, "", ".rvt"), ".rvt.ifc", "a name that is only an extension is kept (nothing else to name it by)");
    }

    // ── 2. the wire: register in the /propose body; the reply's version, verdict_audit_id, downgraded ──
    static void Wire()
    {
        var reg = new RegisterRequest { Name = Container, SizeBytes = 5120000, Sha256 = FileSha };
        Is(JsonSerializer.Serialize(ProposalResult.RequestBody(new object[0], null, "Revit", Container, "Governed Publish", null, true, null, reg)),
           "{\"source\":\"Governed Publish\",\"actor\":\"Revit\",\"elements\":[],\"container_name\":\"" + Container + "\",\"register\":{\"name\":\"" + Container + "\",\"size_bytes\":5120000,\"sha256\":\"" + FileSha + "\"}}",
           "register goes as {name, size_bytes, sha256} beside container_name, with no version_id");
        Is(JsonSerializer.Serialize(ProposalResult.RequestBody(new object[0], "v1", "Revit", Container, null, "n", false, "REQ-1", null)),
           "{\"source\":\"Governed Publish\",\"actor\":\"Revit\",\"elements\":[],\"version_id\":\"v1\",\"container_name\":\"" + Container + "\",\"note\":\"n\",\"raise_bcf\":false,\"failures_requirement\":\"REQ-1\"}",
           "without register the body is the one every other caller sends today");

        var r = ProposalResult.Parse(Accepted);
        Ok(r.Reached && r.Verdict == "accepted" && r.Downgraded is null, "an accepted reply reads accepted, not downgraded");
        Ok(r.Version is { Id: Vid, ContainerId: Cid, Revision: "v1", State: "wip" }, "the reply's version {id, container_id, revision, state} is read");
        Is(r.VerdictAuditId ?? "null", "814", "verdict_audit_id (a number) reads as text");
        Is(ProposalResult.Parse(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":\"814\"")).VerdictAuditId ?? "null", "814", "…and as a string");
        Is(LedgerLine.For(LedgerResult.FromReceipt(r.AuditId, r.ReceiptHash)), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "audit_id and receipt.ledger_hash still read as the proposal row");
        var rec = ProposalResult.Parse(Reply("recorded", "nothing in scope", 0, 0, 0));
        Ok(rec.Verdict == "recorded" && rec.Downgraded == "nothing in scope" && rec.Version is { Revision: "v1" }, "recorded with downgraded 'nothing in scope' reads both, and its version");
        var rej = ProposalResult.Parse(Reply("rejected", null, 40, 37, 3, version: false));
        Ok(rej.Verdict == "rejected" && rej.Version is null && rej.VerdictAuditId is null && rej.Failing == 3, "a rejected reply: version null and verdict_audit_id null read as none");
        Ok(ProposalResult.Parse(Accepted.Replace("\"id\":\"" + Vid + "\",", "")).Version is null, "a version without an id is no version");
        Ok(ProposalResult.Parse("{\"verdict\":\"accepted\",\"summary\":{\"in_scope\":1,\"passing\":1,\"failing\":0},\"audit_id\":1}").Version is null, "a pre-5a reply (no version key) is no version");
    }

    // ── 3. PublishOutcome: what the answer allows ─────────────────────────────────────────────────────
    static PublishOutcome Outcome(string json) => PublishOutcome.From(ProposalResult.Parse(json));
    static readonly PublishOutcome Unreached = PublishOutcome.From(new ProposalResult { Error = "timed out after 120s (model may be very large)" });

    static void Outcomes()
    {
        var acc = Outcome(Accepted);
        Ok(acc.Reached && acc.Accepted && acc.Publishable && !acc.Rejected && acc.Version?.Id == Vid, "accepted → publishable, with its version");
        Is(LedgerLine.For(acc.VerdictRow), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "the verdict row is the proposal row's id and receipt hash");
        var rec = Outcome(Reply("recorded", "nothing in scope", 0, 0, 0));
        Ok(rec.Publishable && !rec.Accepted && !rec.Rejected && rec.Version is not null, "recorded → publishable (registered, badge recorded), not accepted");
        var rej = Outcome(Reply("rejected", null, 40, 37, 3, version: false));
        Ok(rej.Rejected && !rej.Publishable && !rej.Accepted && rej.Version is null, "rejected → not publishable, no version");
        Ok(!Unreached.Reached && !Unreached.Publishable && !Unreached.Rejected && !Unreached.Accepted && Unreached.Version is null, "not reached → nothing publishable, no version");
        Is(LedgerLine.For(Unreached.VerdictRow), "not confirmed — the bridge returned no chain hash", "not reached → no row confirmed");
        Ok(Outcome(Reply("accepted", null, 40, 40, 0, version: false)).Version is null, "accepted with no version in the reply → no version (Stage stages nothing)");
    }

    // ── 4. Stage: the sidecar before the IFC; nothing on a reject ──────────────────────────────────────
    static string _tmp = "";

    static PublishPlan Plan(string folder, string content = "ISO-10303-21;")
    {
        var dir = Path.Combine(_tmp, folder);
        Directory.CreateDirectory(dir);
        var ifc = Path.Combine(dir, Container);
        File.WriteAllText(ifc, content);
        File.WriteAllText(Path.ChangeExtension(ifc, ".sentinel-cert.json"), "{}"); // the certificate the gate wrote beside it
        var plan = new PublishPlan { Key = Key, ContainerName = Container, TempIfcPath = ifc, SizeBytes = content.Length, Sha256 = FileSha };
        plan.Gate.CertificatePath = Path.ChangeExtension(ifc, ".sentinel-cert.json");
        return plan;
    }

    static void Staging()
    {
        _tmp = Path.Combine(Path.GetTempPath(), "sentinel-publish-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tmp);
        var outbox = Path.Combine(_tmp, "outbox"); // does not exist yet: Stage creates it
        var sidecar = Path.Combine(outbox, Container + ".meta.json");
        var dst = Path.Combine(outbox, Container);
        try
        {
            var acc = Outcome(Accepted);
            var p1 = Plan("p1");
            var s1 = Publisher.Stage(p1, acc, outbox);
            Ok(s1.Staged && s1.OutboxPath == dst && File.ReadAllText(dst) == "ISO-10303-21;" && s1.SidecarPath == sidecar, "accepted: the IFC is in the outbox");
            Is(File.ReadAllText(sidecar), "{\"project\":\"" + Key + "\",\"container\":\"" + Container + "\",\"version_id\":\"" + Vid + "\"}",
               "the sidecar names the project, the container and the version the bridge registered — the watcher attaches by that id");
            Ok(!File.Exists(p1.TempIfcPath) && !File.Exists(p1.Gate.CertificatePath) && !Directory.Exists(Path.GetDirectoryName(p1.TempIfcPath)),
               "the temp IFC, its certificate and their folder are gone");

            // Order: a folder squatting on the destination makes the move fail. The sidecar is already written when
            // it does — the reverse order would leave no sidecar here.
            File.Delete(dst);
            File.Delete(sidecar);
            Directory.CreateDirectory(dst);
            var p2 = Plan("p2");
            var s2 = Publisher.Stage(p2, acc, outbox);
            Ok(!s2.Staged && s2.OutboxPath is null && s2.Reason.StartsWith("the IFC did not reach the upload outbox (") && s2.KeptIfcPath == p2.TempIfcPath,
               "a move that fails: not staged, the reason names it, the temp IFC is kept for the dialog");
            Ok(File.Exists(sidecar) && File.Exists(p2.TempIfcPath), "the sidecar was written BEFORE the move (it is there although the move failed)");
            Directory.Delete(dst);
            File.Delete(sidecar);
            Publisher.Discard(p2);

            // A folder squatting on the sidecar's path makes its write fail: then the IFC never moves.
            Directory.CreateDirectory(sidecar);
            var p2b = Plan("p2b");
            var s2b = Publisher.Stage(p2b, acc, outbox);
            Ok(!s2b.Staged && s2b.SidecarPath is null && s2b.Reason.StartsWith("the IFC did not reach the upload outbox (") && !File.Exists(dst) && File.Exists(p2b.TempIfcPath),
               "no sidecar → no IFC in the outbox (the watcher never sees an IFC without its sidecar)");
            Directory.Delete(sidecar);
            Publisher.Discard(p2b);

            // An older IFC of the same container still waiting in the outbox is replaced.
            File.WriteAllText(dst, "old");
            var p3 = Plan("p3", "new");
            Ok(Publisher.Stage(p3, acc, outbox).Staged && File.ReadAllText(dst) == "new", "an older outbox IFC of this container is replaced");
            File.Delete(dst);
            File.Delete(sidecar);

            foreach (var (name, o, reason) in new[]
            {
                ("rejected", Outcome(Reply("rejected", null, 40, 37, 3, version: false)), "the verdict is rejected"),
                ("not reached", Unreached, "the bridge returned no verdict"),
                ("accepted but no version", Outcome(Reply("accepted", null, 40, 40, 0, version: false)), "the bridge registered no version"),
                ("recorded but no version", Outcome(Reply("recorded", null, 0, 0, 0, version: false)), "the bridge registered no version"),
            })
            {
                var p = Plan("p-" + name.Replace(' ', '-'));
                var s = Publisher.Stage(p, o, outbox);
                Ok(!s.Staged && s.Reason == reason && s.SidecarPath is null && s.KeptIfcPath is null, name + ": nothing staged — " + reason);
                Ok(!File.Exists(sidecar) && !File.Exists(dst) && !File.Exists(p.TempIfcPath) && !Directory.Exists(Path.GetDirectoryName(p.TempIfcPath)),
                   name + ": no sidecar, no outbox IFC, the temp IFC discarded");
            }
        }
        finally { try { Directory.Delete(_tmp, true); } catch { } }
    }

    // ── 5. the lines: every outcome names what judged; the version only from the reply ────────────────
    static GateResult Gate(GateOutcome o, string schema = "IFC4")
    {
        var r = new GateResult
        {
            Outcome = o, ContractLabel = "contract@1 · office · 0123456789ab…", ContractRef = "contract@1", ContractSource = "office", ContractSha256 = CSha,
            ContractKey = "pilot-ifc4", IfcPath = @"C:\t\a.ifc", DetectedSchema = schema, FileSizeBytes = 5120000, TotalEntities = 40, FileSha256 = FileSha,
            CertificatePath = @"C:\t\a.sentinel-cert.json",
        };
        if (o == GateOutcome.Fail) r.Failures.Add("IFCCOLUMN: 0 found, contract requires ≥ 1.");
        return r;
    }

    static PublishPlan Ready(GateResult? gate = null) => new PublishPlan
    {
        Key = Key, ContainerName = Container, TempIfcPath = @"C:\t\a.ifc", SizeBytes = 5120000, Sha256 = FileSha,
        Gate = gate ?? Gate(GateOutcome.Pass), GateRow = LedgerResult.FromReceipt("812", GateHash),
    };

    static readonly StageResult Staged = new StageResult { Staged = true, OutboxPath = @"C:\o\a.ifc", SidecarPath = @"C:\o\a.ifc.meta.json" };
    static readonly StageResult NotStaged = new StageResult { Reason = "the bridge registered no version" };

    static void Lines()
    {
        const string GateLine = "Delivery gate: PASS · contract@1 · office · 0123456789ab… · Schema IFC4";
        const string GateRowLine = "Gate row: ledger #812 · receipt 5c6d7e8f90112233…";
        const string VerdictRowLine = "Verdict row: ledger #813 · receipt 0a1b2c3d4e5f6071…";
        const string Judged = "IDS ids@4 · office · 23bb57937fb0…: 40/40 in-scope element checks passed.\nNaming naming@2 · office · 77e1d2c3b4a5…: passed.\n";
        const string Rows = "\nSHA-256: 3f9a0c1d2e4b5f60…\n" + GateRowLine + "\n" + VerdictRowLine + "\n";
        const string VersionLine = "Version: " + Container + " v1 · wip · ledger #814";
        const string Queued = "Queued for upload — the outbox watcher attaches the geometry to this version.";
        var plan = Ready();
        var acc = Outcome(Accepted);

        // refusals, before the referee: Dialog with no outcome
        Is(PublishLines.Dialog(plan), "", "a ready plan has no refusal");
        var unbound = new PublishPlan { Refusal = ProjectContext.NotBound + "\n\nNothing was exported or published." };
        Is(PublishLines.Dialog(unbound), "This model is not bound to a web project — Sentinel ▸ Project Setup.\n\nNothing was exported or published.", "not bound: the one text, nothing exported");
        var noGeom = new PublishPlan { Key = Key, Refusal = "IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings." };
        Is(PublishLines.Dialog(noGeom), noGeom.Refusal!, "an empty export: the refusal as the plan states it");
        var failed = Ready(Gate(GateOutcome.Fail, "IFC2X3"));
        Ok(failed.GateFailed && !failed.Ready, "a gate FAIL is not ready");
        Is(PublishLines.Dialog(failed),
           "✕ REJECTED — delivery gate failed (not published)\n\nContract: contract@1 · office · 0123456789ab… · Schema: IFC2X3\n\nFAILURES:\n• IFCCOLUMN: 0 found, contract requires ≥ 1.\n\nFix the deliverable and run Governed Publish again.\n\n" + GateRowLine,
           "gate FAIL: GateLines.PublishRejected and the gate row, as before");
        var notChecked = Ready(new GateResult { Outcome = GateOutcome.NotChecked, ContractLabel = "none — not installed for aster-tower or its office", NotCheckedReason = "none — not installed for aster-tower or its office", DetectedSchema = "IFC2X3", FileSizeBytes = 5120000, FileSha256 = FileSha });
        Ok(!notChecked.GateFailed && notChecked.Ready, "a NOT CHECKED gate is not a fail: the referee is still asked");

        // the version line
        Is(PublishLines.Version(plan, acc), VersionLine, "the version from the reply: container, revision, state, the stamp's ledger id — no receipt, the bridge returns none for it");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":null"))),
           "Version: " + Container + " v1 · wip · stamp not confirmed — the bridge returned no verdict_audit_id", "a version with no verdict_audit_id: the stamp is not confirmed");
        Is(PublishLines.Version(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false))), "Version: not confirmed — the bridge registered no version", "no version in an accepted reply");
        Is(PublishLines.Version(plan, Outcome(Reply("rejected", null, 40, 37, 3, version: false))), "Version: not confirmed — rejected — nothing was registered", "no version on a reject");
        Is(PublishLines.Version(plan, Unreached), "Version: not confirmed — the bridge returned no verdict (timed out after 120s (model may be very large))", "no version when the bridge was not reached");

        // accepted
        Is(PublishLines.Dialog(plan, acc, Staged),
           "✓ ACCEPTED — published as v1 · wip\nProject: aster-tower\n\n" + Judged + GateLine + Rows + VersionLine + "\n\n" + Queued,
           "accepted and staged: what judged, both ledger rows, the version, the upload");
        var warned = Outcome(Accepted.Replace("\"failing\":0", "\"failing\":2").Replace("\"warned\":false,\"ids_enforce\":\"reject\"", "\"warned\":true,\"ids_enforce\":\"warn\""));
        Ok(PublishLines.Dialog(plan, warned, Staged).Contains("IDS ids@4 · office · 23bb57937fb0…: 40/40 in-scope element checks passed — 2 failure(s) kept as warnings (enforce: warn).\n"),
           "accepted with warnings names the IDS's enforce");
        Ok(PublishLines.Dialog(notChecked, acc, Staged).Contains("Delivery gate: NOT CHECKED — contract: none — not installed for aster-tower or its office\nThe IDS judged alone — the delivery gate was not checked (contract: none — not installed for aster-tower or its office).\n"),
           "accepted with no contract: NOT CHECKED and the IDS-judged-alone note (A3)");
        Is(PublishLines.Dialog(plan, acc, new StageResult { Reason = "the IFC did not reach the upload outbox (Access to the path is denied.)", SidecarPath = @"C:\o\a.ifc.meta.json", KeptIfcPath = @"C:\t\a.ifc" }),
           "✓ ACCEPTED — v1 · wip registered, NOT in the upload outbox\nProject: aster-tower\n\n" + Judged + GateLine + Rows + VersionLine + "\n\n" +
           "NOT in the upload outbox — the IFC did not reach the upload outbox (Access to the path is denied.). The IFC is kept at C:\\t\\a.ifc — run Governed Publish again.",
           "accepted, registered, but the move failed: never 'published', the reason and where the IFC is");
        Is(PublishLines.Dialog(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false)), NotStaged),
           "✓ ACCEPTED — no version registered\nProject: aster-tower\n\n" + Judged + GateLine + Rows +
           "Version: not confirmed — the bridge registered no version\n\n" +
           "Nothing was uploaded: there is no version to attach the geometry to — run Governed Publish again.",
           "accepted but the reply carries no version: no version claimed, nothing uploaded");

        // recorded: nothing in scope, and no IDS
        var down = Outcome(Reply("recorded", "nothing in scope", 0, 0, 0));
        Is(PublishLines.Dialog(plan, down, Staged),
           "Published — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)\nProject: aster-tower\n\n" +
           "IDS ids@4 · office · 23bb57937fb0…: nothing in its scope — 0 in-scope element checks, so nothing was judged.\n" +
           "Naming naming@2 · office · 77e1d2c3b4a5…: passed.\n" + GateLine + Rows + VersionLine + "\n\n" + Queued + "\n" +
           "No verdict badge: the IDS found nothing in its scope, so nothing was judged — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. Give the IDS something in its scope, or install one that covers this model, to judge the next one.",
           "recorded, nothing in scope: never ACCEPTED, names the IDS, says what publishing needs");
        var none = Outcome(Reply("recorded", null, 0, 0, 0).Replace("\"ids_source\":\"office\",\"ids_ref\":\"ids@4\",\"ids_sha256\":\"" + ISha + "\"", "\"ids_source\":\"none\",\"ids_ref\":null,\"ids_sha256\":null"));
        Is(PublishLines.Dialog(plan, none, Staged),
           "Published — not judged: no IDS installed for aster-tower or its office\nProject: aster-tower\n\n" +
           "IDS: none — no IDS installed for aster-tower or its office. The model was NOT judged.\n" +
           "Naming naming@2 · office · 77e1d2c3b4a5…: passed.\n" + GateLine + Rows + VersionLine + "\n\n" + Queued + "\n" +
           "No verdict badge: nothing was judged — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. Install an IDS on the project or its office to judge the next one.",
           "recorded, no IDS: the none reason, the install hint");
        Ok(PublishLines.Dialog(plan, Outcome(Reply("recorded", null, 0, 0, 0, version: false)), NotStaged).StartsWith("Recorded — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)\n"),
           "recorded with nothing staged never says Published");

        // rejected: element checks, then the name
        var rej = Outcome(Reply("rejected", null, 40, 37, 3, version: false).Replace("\"failures\":[]", "\"failures\":[{\"element\":\"1\",\"requirement\":\"Walls need FireRating\",\"reason\":\"FireRating missing\"}]").Replace("\"agent\":null", "\"agent\":null,\"bcf\":{\"raised\":1}"));
        Is(PublishLines.Dialog(plan, rej, NotStaged),
           "✕ REJECTED — 3 of 40 in-scope element check(s) failed (not published)\n\n" +
           GateLine + "\n" + GateRowLine + "\n" + VerdictRowLine + "\nNo version was registered and nothing was uploaded.\n\n" +
           "FAILURES:\n• Walls need FireRating: FireRating missing\n\n" +
           "1 BCF issue(s) opened on the failing elements — they're now in the web Issues panel and will live-sync into Revit. Fix them and run Governed Publish again.",
           "rejected: the failures, the rows, no version, no upload, the BCF note");
        var badName = Outcome(Reply("rejected", null, 40, 40, 0, version: false).Replace("\"naming\":{\"ok\":true,\"failures\":[],\"enforce\":\"reject\"}", "\"naming\":{\"ok\":false,\"failures\":[{\"reason\":\"field 2 must be the originator code\"}],\"enforce\":\"reject\"}"));
        Is(PublishLines.Dialog(plan, badName, NotStaged),
           "✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: " + Container + "\n\n" +
           GateLine + "\n" + GateRowLine + "\n" + VerdictRowLine + "\nNo version was registered and nothing was uploaded.\n\n" +
           "NAMING:\n• field 2 must be the originator code\n\n" +
           "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again.",
           "rejected by name: the name checked is the container's name");

        // not reached: no shell command, no manual upload
        var un = PublishLines.Dialog(plan, Unreached, NotStaged);
        Is(un, GateLine + "\n" + GateRowLine + "\n\n" +
               "The Sentinel bridge did not return a verdict — nothing was registered or uploaded, and no verdict row is confirmed.\n\n" +
               "Reason: timed out after 120s (model may be very large)\n\n" +
               "Start the bridge (npm run bcf:serve) and run Governed Publish again.",
           "bridge not reached: nothing registered or uploaded, the reason, run again");
        Ok(!un.Contains("upload-ifc") && !un.Contains("node "), "no shell command is printed any more");

        // Auto-Publish's one Doctor line
        Is(PublishLines.Doctor(plan, acc, Staged), "Auto-published " + Container + " v1 · wip · ledger #814", "auto, accepted: Auto-published <container> <revision> · wip · ledger #<verdict_audit_id>");
        Is(PublishLines.Doctor(plan, down, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)", "auto, recorded: says nothing was judged");
        Is(PublishLines.Doctor(plan, none, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 — not judged: no IDS installed for aster-tower or its office", "auto, recorded with no IDS");
        Is(PublishLines.Doctor(plan, rej, NotStaged), "Auto-publish rejected — nothing uploaded — 3 of 40 element check(s) failed · ids@4 · office · 23bb57937fb0… · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, rejected: nothing uploaded, the failures, what judged, the proposal row");
        Is(PublishLines.Doctor(plan, badName, NotStaged), "Auto-publish rejected — nothing uploaded — the model name " + Container + " failed naming naming@2 · office · 77e1d2c3b4a5… · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, rejected by name");
        Is(PublishLines.Doctor(failed), "Auto-publish rejected — nothing uploaded — delivery gate FAIL · contract@1 · office · 0123456789ab… · Schema IFC2X3 · 1 failure(s) · gate row: ledger #812 · receipt 5c6d7e8f90112233…", "auto, gate FAIL: nothing uploaded, the contract, the gate row");
        Is(PublishLines.Doctor(plan, Unreached, NotStaged), "Auto-publish: no verdict — nothing uploaded — timed out after 120s (model may be very large)", "auto, bridge not reached");
        Is(PublishLines.Doctor(noGeom), "Auto-publish failed — nothing uploaded — IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings.", "auto, empty export");
        Is(PublishLines.Doctor(plan, Outcome(Reply("accepted", null, 40, 40, 0, version: false)), NotStaged), "Auto-publish: verdict accepted but the bridge registered no version — nothing uploaded · ledger #813 · receipt 0a1b2c3d4e5f6071…", "auto, no version in the reply");
        Is(PublishLines.Doctor(plan, acc, new StageResult { Reason = "the IFC did not reach the upload outbox (x)", KeptIfcPath = @"C:\t\a.ifc" }), "Auto-publish: " + Container + " v1 · wip registered but NOT in the upload outbox — the IFC did not reach the upload outbox (x)", "auto, the move failed");
        Is(PublishLines.Doctor(plan), "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded", "auto, a Judge task that never answered");
    }

    // ── 6. the policy: publish@n {auto: true}, else off with the reason ────────────────────────────────
    static ResolvedArtefact Publish(string body, string origin) => new ResolvedArtefact
    {
        Kind = "publish", Ref = "publish@1", Source = "office", Sha256 = PSha, BodyJson = body, Origin = origin,
        Label = ArtefactClient.RefLabel("publish@1", "office", PSha) + (origin == "cache" ? " (cached 14:03)" : ""),
    };

    static void Policy()
    {
        var on = Publish("{\"auto\":true}", "bridge");
        Ok(Publisher.AutoEnabled(on), "publish@1 {auto: true} from the bridge → on");
        Is(PublishLines.Policy(on), "Auto-publish: on · publish@1 · office · 3f07a1b2c3d4…", "the pane's line names publish@n · source · sha");
        var off = Publish("{\"auto\":false}", "bridge");
        Ok(!Publisher.AutoEnabled(off), "{auto: false} → off");
        Is(PublishLines.Policy(off), "Auto-publish: off — publish@1 · office · 3f07a1b2c3d4…", "…and the line names the artefact that says so");
        var none = ArtefactClient.None("publish", "not installed for aster-tower or its office");
        Ok(!Publisher.AutoEnabled(none), "none installed → off");
        Is(PublishLines.Policy(none), "Auto-publish: off — publish: none — not installed for aster-tower or its office", "…with the none reason (the pane's line)");
        var cached = Publish("{\"auto\":true}", "cache");
        Ok(Publisher.AutoEnabled(cached), "a cached {auto: true} (the bridge unreachable now) → on, as every other cached artefact judges");
        Is(PublishLines.Policy(cached), "Auto-publish: on · publish@1 · office · 3f07a1b2c3d4… (cached 14:03)", "…and the line says it is the cached copy");
        foreach (var body in new[] { "{}", "{\"auto\":\"true\"}", "{\"auto\":1}", "[]", "null", "", "not json" })
        {
            var bad = Publish(body, "bridge");
            Ok(!Publisher.AutoEnabled(bad) && PublishLines.Policy(bad) == "Auto-publish: off — publish@1 · office · 3f07a1b2c3d4… did not parse: the body is not {auto: true} or {auto: false}",
               "a body that is not {auto: boolean} (" + (body.Length == 0 ? "empty" : body) + ") → off, did not parse");
        }
        var unreachable = ArtefactClient.None("publish", "bridge unreachable (No connection could be made)");
        Ok(!Publisher.AutoEnabled(unreachable) && PublishLines.Policy(unreachable) == "Auto-publish: off — publish: none — bridge unreachable (No connection could be made)",
           "no bridge and no cache → off, the reason");
    }
}
```

- [ ] **Step 2: Run it — RED**

Run (repo root, `cd "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project"`): `dotnet run --project tools/publish-check`

Expected: the build fails before any check runs (the harness names a file that does not exist yet):

```
CSC : error CS2001: Source file '…\tools\publish-check\..\..\SentinelAddin\Engine\Publisher.cs' could not be found. [C:\…\tools\publish-check\publish-check.csproj]

The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `ProposalResult` — the reply's version, the stamp's id, `downgraded`; the body builder and `RegisterRequest`**

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, lines 31-42):

```csharp
    public string? NamingRef, NamingSource, NamingSha256;
    /// "ids@4 · office · 23bb57937fb0…" or "none" — the bridge's refLabel, as every other surface prints it.
    public string IdsLabel => RefLabel(IdsRef, IdsSource, IdsSha256);
    public string NamingLabel => RefLabel(NamingRef, NamingSource, NamingSha256);

    public static ProposalResult Parse(string json)
    {
        var r = new ProposalResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        r.Reached = true;
        r.Verdict = Str(root, "verdict") ?? "recorded";
```

with:

```csharp
    public string? NamingRef, NamingSource, NamingSha256;
    // The version /propose registered and stamped when `register` was sent (cohesion phase 5a, spec Decision 3): null
    // on a rejected verdict, without `register`, or when the bridge answered without one. VerdictAuditId is the
    // verdict:<v> row's id (the bridge returns no hash for it); Downgraded is "nothing in scope" when an accepted
    // verdict with in_scope 0 was recorded instead.
    public VersionInfo? Version;
    public string? VerdictAuditId;
    public string? Downgraded;
    /// "ids@4 · office · 23bb57937fb0…" or "none" — the bridge's refLabel, as every other surface prints it.
    public string IdsLabel => RefLabel(IdsRef, IdsSource, IdsSha256);
    public string NamingLabel => RefLabel(NamingRef, NamingSource, NamingSha256);

    /// <summary>The reply's <c>version {id, container_id, revision, state}</c>.</summary>
    public sealed class VersionInfo
    {
        public string Id = "";
        public string? ContainerId;
        public string Revision = "";
        public string State = "";
    }

    /// <summary>The /propose body, as <c>GovernedNotify.Propose</c> serializes it. Pure, so tools/publish-check pins
    /// the wire shape: <paramref name="register"/> goes as <c>{name, size_bytes, sha256}</c> (the bridge requires
    /// name = container_name) and only when given; every other key as before.</summary>
    public static Dictionary<string, object?> RequestBody(object elements, string? versionId, string actor, string? containerName,
                                                          string? source, string? note, bool raiseBcf, string? failuresRequirement,
                                                          RegisterRequest? register)
    {
        var body = new Dictionary<string, object?>
        {
            ["source"] = source ?? "Governed Publish",
            ["actor"] = actor,
            ["elements"] = elements,
        };
        if (versionId != null) body["version_id"] = versionId;
        if (containerName != null) body["container_name"] = containerName; // ISO 19650 naming gate
        if (note != null) body["note"] = note;
        if (!raiseBcf) body["raise_bcf"] = false;
        // One requirement's failures only (fix-in-place): the bridge then returns up to 1000 of them
        // plus failures_total / failures_matched, so truncation is detected by count, not guessed.
        if (!string.IsNullOrWhiteSpace(failuresRequirement)) body["failures_requirement"] = failuresRequirement;
        if (register != null)
            body["register"] = new Dictionary<string, object?> { ["name"] = register.Name, ["size_bytes"] = register.SizeBytes, ["sha256"] = register.Sha256 };
        return body;
    }

    public static ProposalResult Parse(string json)
    {
        var r = new ProposalResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        r.Reached = true;
        r.Verdict = Str(root, "verdict") ?? "recorded";
        r.Downgraded = Str(root, "downgraded");
        if (root.TryGetProperty("version", out var ver) && ver.ValueKind == JsonValueKind.Object && Str(ver, "id") is { Length: > 0 } vid)
            r.Version = new VersionInfo { Id = vid, ContainerId = Str(ver, "container_id"), Revision = Str(ver, "revision") ?? "", State = Str(ver, "state") ?? "" };
        r.VerdictAuditId = Scalar(root, "verdict_audit_id");
```

Replace (in `SentinelAddin/Coordination/ProposalResult.cs`, lines 96-105 — the file's end):

```csharp
    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // A string or a number, as text (audit ids and element ids arrive as either).
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}
```

with:

```csharp
    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // A string or a number, as text (audit ids and element ids arrive as either).
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}

/// <summary>What /propose registers on an accepted or recorded verdict (spec 2026-09-26 Decision 3): the container the
/// naming standard judged (the bridge refuses a name other than container_name) and the bytes the gate certified.</summary>
public sealed class RegisterRequest
{
    public string Name = "";
    public long SizeBytes;
    public string Sha256 = "";
}
```

- [ ] **Step 4: `GovernedNotify.Propose` takes `register` and builds its body through `RequestBody`**

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 131-161):

```csharp
        /// a fix-in-place check or re-check must never open topics. <paramref name="source"/> and
        /// <paramref name="note"/> land on the audit row. Blocking (120s cap); never throws:
        /// <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
                                             string? failuresRequirement = null)
        {
            var r = new ProposalResult();
            var key = KeyOf(projectKey);
            if (key.Length == 0) { r.Error = NotBoundError; return r; }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/propose";
                var body = new Dictionary<string, object?>
                {
                    ["source"] = source ?? "Governed Publish",
                    ["actor"] = actor,
                    ["elements"] = elements,
                };
                if (versionId != null) body["version_id"] = versionId;
                if (containerName != null) body["container_name"] = containerName; // ISO 19650 naming gate
                if (note != null) body["note"] = note;
                if (!raiseBcf) body["raise_bcf"] = false;
                // One requirement's failures only (fix-in-place): the bridge then returns up to 1000 of them
                // plus failures_total / failures_matched, so truncation is detected by count, not guessed.
                if (!string.IsNullOrWhiteSpace(failuresRequirement)) body["failures_requirement"] = failuresRequirement;

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
```

with:

```csharp
        /// a fix-in-place check or re-check must never open topics. <paramref name="source"/> and
        /// <paramref name="note"/> land on the audit row. With <paramref name="register"/> (the Publisher: one
        /// adjudication per publish, spec 2026-09-26 Decision 3) the bridge registers the version on an accepted or
        /// recorded verdict and stamps it, answering <see cref="ProposalResult.Version"/> and
        /// <see cref="ProposalResult.VerdictAuditId"/>; a rejected verdict registers nothing. Blocking (120s cap);
        /// never throws: <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, string? versionId, string actor,
                                             string projectKey, string? containerName = null,
                                             string? source = null, string? note = null, bool raiseBcf = true,
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

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
```

(`using System.Collections.Generic;` at :2 stays: `NamingRenamed` still takes an `IEnumerable<object>`.)

- [ ] **Step 5: `Publisher.cs` — the name, the plan, the referee, the stage, the policy, the lines**

Create `SentinelAddin/Engine/Publisher.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Sentinel.Coordination;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
#endif

namespace Sentinel.Engine;

/// <summary>
/// The one publish path (cohesion phase 5b, spec 2026-09-26 Decision 8): a model leaves Revit for the web only through
/// here — Governed Publish with its dialog, Auto-Publish without one. <see cref="Prepare"/> runs on the API thread
/// (the container's name, the contract, the whole-model export, the gate and its ledger row, the extraction);
/// <see cref="Judge"/> runs OFF it (one /propose that judges, registers the version and stamps it);
/// <see cref="Stage"/> writes the sidecar naming that version FIRST and then moves the IFC into the outbox — a
/// rejected run stages nothing. Everything but Prepare and Judge is Revit-free: tools/publish-check compiles this
/// file under SENTINEL_CHECK.
/// </summary>
public static class Publisher
{
    /// <summary>
    /// The container's name — the same string for the outbox file, the sidecar, <c>container_name</c> and
    /// <c>register.name</c>, so nothing splits a container again (F12). The central model's file name for a workshared
    /// model (the local copy is "&lt;central&gt;_&lt;user&gt;.&lt;suffix&gt;"), else the document's own path, else its
    /// title; ".rvt"/".rte" and a trailing ".ifc" stripped and nothing else ("Tower v2.1" keeps its ".1"); invalid
    /// file-name characters become "_"; blank is "SentinelModel"; + ".ifc". Pure.
    /// </summary>
    public static string ContainerName(string? centralUserVisiblePath, string? pathName, string? title)
    {
        var pick = Given(centralUserVisiblePath) ?? Given(pathName) ?? (title ?? "");
        var name = pick.Substring(Math.Max(pick.LastIndexOf('\\'), pick.LastIndexOf('/')) + 1).Trim();
        name = Strip(Strip(Strip(name, ".rvt"), ".rte"), ".ifc");
        foreach (var ch in Path.GetInvalidFileNameChars()) name = name.Replace(ch, '_');
        return (string.IsNullOrWhiteSpace(name) ? "SentinelModel" : name) + ".ifc";
    }

    private static string? Given(string? s) => string.IsNullOrWhiteSpace(s) ? null : s!.Trim();

    private static string Strip(string name, string ext) =>
        name.Length > ext.Length && name.EndsWith(ext, StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - ext.Length) : name;

    /// <summary>The lead's policy (spec Decision 2: publish@n's body is exactly {auto: boolean}; none installed = off):
    /// auto runs only when the artefact in force — from the bridge, or its cached copy when the bridge did not answer,
    /// as every other artefact judges — says <c>auto: true</c>. None, <c>auto: false</c> and a body that does not parse
    /// are off; <see cref="PublishLines.Policy"/> says why. Pure.</summary>
    public static bool AutoEnabled(ResolvedArtefact publish) => publish.Origin != "none" && PolicyAuto(publish.BodyJson) == true;

    // The body's `auto`: true / false, or null when the body is not {auto: boolean}.
    internal static bool? PolicyAuto(string? body)
    {
        try
        {
            using var d = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "null" : body!);
            var r = d.RootElement;
            if (r.ValueKind != JsonValueKind.Object || !r.TryGetProperty("auto", out var a)) return null;
            return a.ValueKind switch { JsonValueKind.True => true, JsonValueKind.False => false, _ => (bool?)null };
        }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// On accepted or recorded with a registered version: the sidecar <c>{project, container, version_id}</c> is
    /// written FIRST, then the IFC moves into the outbox (the watcher attaches the geometry to that version by id, so
    /// it can never register a version of its own or attach to the wrong one); a sidecar that cannot be written moves
    /// nothing. Anything else — rejected, the bridge not reached, a reply with no version — stages nothing and discards
    /// the temp IFC. A move that fails keeps the temp IFC (the dialog names it) and the sidecar (the watcher sweeps .ifc
    /// files only; the next stage of this container overwrites it). Pure over paths; tools/publish-check pins the order.
    /// </summary>
    public static StageResult Stage(PublishPlan plan, PublishOutcome outcome, string outboxDir)
    {
        var r = new StageResult();
        if (!outcome.Publishable || outcome.Version is null)
        {
            r.Reason = !outcome.Reached ? "the bridge returned no verdict"
                     : outcome.Rejected ? "the verdict is rejected"
                     : "the bridge registered no version";
            Discard(plan);
            return r;
        }
        try
        {
            Directory.CreateDirectory(outboxDir);
            var sidecar = Path.Combine(outboxDir, plan.ContainerName + ".meta.json");
            File.WriteAllText(sidecar, JsonSerializer.Serialize(new { project = plan.Key, container = plan.ContainerName, version_id = outcome.Version.Id }));
            r.SidecarPath = sidecar;
            // ponytail: an older IFC of this container still waiting in the outbox is replaced under the new sidecar;
            // the watcher's stabilisation wait and the 15 s throttle keep that from mattering — a per-version file
            // name if it ever does.
            var dst = Path.Combine(outboxDir, plan.ContainerName);
            if (File.Exists(dst)) File.Delete(dst);
            File.Move(plan.TempIfcPath, dst);
            r.OutboxPath = dst;
            r.Staged = true;
            Discard(plan); // the certificate and the folder; the IFC has moved
        }
        catch (Exception e)
        {
            r.Reason = "the IFC did not reach the upload outbox (" + e.Message + ")";
            r.KeptIfcPath = File.Exists(plan.TempIfcPath) ? plan.TempIfcPath : null;
        }
        return r;
    }

    /// <summary>Delete the temp IFC, its certificate and their folder (when empty). Best-effort; never throws.</summary>
    public static void Discard(PublishPlan plan)
    {
        if (string.IsNullOrEmpty(plan.TempIfcPath)) return;
        try { File.Delete(plan.TempIfcPath); } catch { /* best-effort */ }
        try { if (plan.Gate.CertificatePath.Length > 0) File.Delete(plan.Gate.CertificatePath); } catch { /* best-effort */ }
        try
        {
            var dir = Path.GetDirectoryName(plan.TempIfcPath);
            if (dir != null && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir);
        }
        catch { /* best-effort */ }
    }

#if !SENTINEL_CHECK
    /// <summary>The central model's user-visible path for a workshared document, else null. API thread; never throws.</summary>
    public static string? CentralPath(Document doc)
    {
        try
        {
            return doc.IsWorkshared && doc.GetWorksharingCentralModelPath() is ModelPath mp
                ? ModelPathUtils.ConvertModelPathToUserVisiblePath(mp)
                : null;
        }
        catch { return null; }
    }

    /// <summary>The document's container name (<see cref="ContainerName(string?,string?,string?)"/>). API thread.</summary>
    public static string ContainerName(Document doc) => ContainerName(CentralPath(doc), doc.PathName, doc.Title);

    /// <summary>
    /// Everything the API thread must do before the referee is asked: the key and the name; the contract (off this
    /// thread and waited, ≤ 4 s, so the export uses the schema it asks for — <paramref name="resolve"/> is the
    /// project's artefact reader, <c>(kind, timeout) → ResolvedArtefact</c>, asked for "contract"; null means
    /// <see cref="DeliveryContract.Load"/>); the WHOLE model exported (<see cref="PlatformExporter.Default3DView"/>)
    /// into a folder of its own under <paramref name="tempDir"/> in <c>contract.IfcSchema ?? "IFC2X3"</c>; the gate and
    /// its ledger row (waited, ≤ 6 s, so the row lands before /propose); the elements read for the referee. An unbound
    /// document, a failed export or a gate FAIL leaves <see cref="PublishPlan.Ready"/> false with the temp IFC
    /// discarded: <see cref="PublishLines.Dialog(PublishPlan,PublishOutcome?,StageResult?)"/> says which. Revit API
    /// only here; the plan carries no Revit object.
    /// </summary>
    public static PublishPlan Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null)
    {
        var ctx = ProjectContext.For(doc);
        var plan = new PublishPlan { Key = ctx.Key, ContainerName = ContainerName(doc) };
        if (!ctx.IsBound) { plan.Refusal = ProjectContext.NotBound + "\n\nNothing was exported or published."; return plan; }
        var key = plan.Key;

        // 0) The delivery contract in force (project → office → none), resolved OFF this thread and waited, as
        //    Governed Publish did: the export below uses the schema it asks for.
        var (contract, source) = Task.Run(() => resolve is null ? DeliveryContract.Load(key) : DeliveryContract.FromResolved(resolve("contract", null))).GetAwaiter().GetResult();
        plan.Contract = contract;
        plan.ContractSource = source;

        // 1) The whole model, to a temp folder of this plan's own (two runs never share a file), NOT the outbox: only
        //    a judged, registered version reaches the outbox (Stage).
        var dir = Path.Combine(tempDir, Guid.NewGuid().ToString("N"));
        var (state, path, _, error) = PlatformExporter.ExportToDir(doc, PlatformExporter.Default3DView(doc), dir, plan.ContainerName, contract?.IfcSchema ?? "IFC2X3");
        plan.TempIfcPath = path;
        if (state != PlatformExporter.State.Ok)
        {
            plan.Refusal = state == PlatformExporter.State.MissingOrEmpty
                ? "IFC export contained no geometry — nothing to publish. Check the model's 3D view and the IFC mappings."
                : "IFC export failed: " + (error ?? state.ToString());
            Discard(plan);
            return plan;
        }

        // 2) The IFC Delivery Gate (contract@n above; none → NOT CHECKED, and the IDS still judges), and its row on the
        //    ledger, waited OFF this thread so it lands before /propose. A FAIL stops here; every line names it.
        plan.Gate = IfcDeliveryGate.Validate(path, contract, source);
        plan.SizeBytes = plan.Gate.FileSizeBytes;
        plan.Sha256 = plan.Gate.FileSha256;
        var gate = plan.Gate;
        var name = plan.ContainerName;
        plan.GateRow = Task.Run(() => GovernedNotify.DeliveryGate(name, gate, key)).GetAwaiter().GetResult();
        if (plan.GateFailed) { Discard(plan); return plan; }

        // 3) The elements the referee judges, read-only from the live model. Without an office code the Pset_<org>.*
        //    rows are dropped from the read table (PsetMap) and the referee reports them missing: the plan says so.
        if (string.IsNullOrWhiteSpace(App.OrgFor(doc)))
            plan.OrgWarning = "This document's ruleset (" + (App.Engine?.SourceFor(doc).Label ?? "none") + ") has no \"org\" code — " +
                "office property sets (Pset_<org>.*) were NOT read for this publish; the referee will report them " +
                "missing. Install a ruleset@n with an \"org\" on " + key + " or its office, then retry.";
        plan.Elements = GovernedElementExtractor.Extract(doc, key);
        return plan;
    }

    /// <summary>
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
#endif
}

/// <summary>What <see cref="Publisher.Prepare"/> gathered on the API thread — strings, the exported file, the gate
/// and the elements; never a Revit object, so <see cref="Publisher.Judge"/> can run on a pool thread.</summary>
public sealed class PublishPlan
{
    public string Key = "";
    public string ContainerName = "";
    public string TempIfcPath = "";
    public long SizeBytes;
    public string Sha256 = "";
    /// <summary>Why nothing was judged: not bound, or the export produced nothing. Null when the export landed.</summary>
    public string? Refusal;
    /// <summary>The org-less ruleset note (Pset_&lt;org&gt; rows not read), for the dialog; null when the org is set.</summary>
    public string? OrgWarning;
    public DeliveryContract? Contract;
    public ResolvedArtefact ContractSource = ArtefactClient.None("contract", "not loaded");
    public IfcDeliveryGate.GateResult Gate = new IfcDeliveryGate.GateResult();
    public LedgerResult GateRow = LedgerResult.NotRecorded("the gate did not run");
    public IReadOnlyList<GovElement> Elements = Array.Empty<GovElement>();
    /// <summary>The gate judged and failed (a NOT CHECKED gate is not a fail).</summary>
    public bool GateFailed => Refusal is null && Gate.Outcome == GateOutcome.Fail;
    /// <summary>The export landed and the gate did not fail: the referee may be asked.</summary>
    public bool Ready => Refusal is null && !GateFailed;
}

/// <summary>What one /propose came to, from the bridge's answer alone (<see cref="From"/>). Not reached: nothing
/// registered, no row confirmed. Rejected: one proposal row, nothing registered. Accepted or recorded: the version the
/// bridge registered and stamped — or none, when it answered without one.</summary>
public sealed class PublishOutcome
{
    public ProposalResult Verdict = new ProposalResult();
    public bool Reached => Verdict.Reached;
    public bool Accepted => Reached && Verdict.Verdict == "accepted";
    public bool Rejected => Reached && Verdict.Verdict == "rejected";
    /// <summary>Accepted or recorded: the bridge registers a version (spec Decision 3).</summary>
    public bool Publishable => Reached && !Rejected;
    public ProposalResult.VersionInfo? Version => Reached ? Verdict.Version : null;
    /// <summary>The proposal row as the bridge handed it back: audit_id and receipt.ledger_hash.</summary>
    public LedgerResult VerdictRow => LedgerResult.FromReceipt(Verdict.AuditId, Verdict.ReceiptHash);
    public static PublishOutcome From(ProposalResult r) => new PublishOutcome { Verdict = r };
}

/// <summary>What <see cref="Publisher.Stage"/> did. <see cref="Staged"/> only when the sidecar was written and the IFC
/// is in the outbox; otherwise <see cref="Reason"/> says why nothing waits for upload.</summary>
public sealed class StageResult
{
    public bool Staged;
    public string? OutboxPath;
    public string? SidecarPath;
    public string Reason = "";
    /// <summary>The temp IFC, when a failed move kept it (the version is registered; the geometry is not queued).</summary>
    public string? KeptIfcPath;
}

/// <summary>The words Governed Publish (a dialog) and Auto-Publish (one Doctor line) print, and the pane's policy line,
/// from the plan, the outcome and the stage alone — so tools/publish-check pins them. Every line names what judged (the
/// existing <see cref="GateLines"/> and <see cref="LedgerLine"/> words, the IDS and naming labels from the bridge's
/// answer); the version is claimed only from the reply; "receipt" appears only where the bridge returned the hash (the
/// proposal row — it returns none for the verdict row, so that line carries the id alone). Pure.</summary>
public static class PublishLines
{
    public static string GateRow(PublishPlan p) => "Gate row: " + LedgerLine.For(p.GateRow);
    public static string VerdictRow(PublishOutcome o) => "Verdict row: " + LedgerLine.For(o.VerdictRow);

    /// <summary>"Version: &lt;container&gt; v1 · wip · ledger #814" from the reply; with no verdict_audit_id "… · stamp
    /// not confirmed — …"; with no version "Version: not confirmed — &lt;reason&gt;".</summary>
    public static string Version(PublishPlan p, PublishOutcome o)
    {
        var v = o.Version;
        if (v is null) return "Version: not confirmed — " + NoVersion(o);
        var head = "Version: " + p.ContainerName + " " + v.Revision + " · " + v.State;
        return o.Verdict.VerdictAuditId is { Length: > 0 } id
            ? head + " · ledger #" + id
            : head + " · stamp not confirmed — the bridge returned no verdict_audit_id";
    }

    private static string NoVersion(PublishOutcome o) =>
        !o.Reached ? "the bridge returned no verdict" + (o.Verdict.Error is { Length: > 0 } e ? " (" + e + ")" : "")
        : o.Rejected ? "rejected — nothing was registered"
        : "the bridge registered no version";

    /// <summary>The IDS line, from the bridge's answer: what judged and what it found, or that nothing was judged.</summary>
    public static string Ids(PublishPlan p, PublishOutcome o)
    {
        var v = o.Verdict;
        if (v.IdsRef is null) return "IDS: none — no IDS installed for " + p.Key + " or its office. The model was NOT judged.";
        if (v.Downgraded is not null) return "IDS " + v.IdsLabel + ": nothing in its scope — 0 in-scope element checks, so nothing was judged.";
        return "IDS " + v.IdsLabel + ": " + v.Passing + "/" + v.InScope + " in-scope element checks passed" +
               (v.Warned ? " — " + v.Failing + " failure(s) kept as warnings (enforce: " + (v.IdsEnforce ?? "not reported") + ")." : ".");
    }

    public static string Naming(PublishOutcome o) =>
        o.Verdict.NamingRef is null
            ? "Naming: not judged — no naming standard installed."
            : "Naming " + o.Verdict.NamingLabel + ": " + (o.Verdict.NamingOk == false ? "failed (warn — recorded, not blocking)." : "passed.");

    /// <summary>The pane's fourth line and the Doctor's, from the publish@n in force: "Auto-publish: on · publish@1 ·
    /// office · 3f07a1b2c3d4…" (the label, "(cached HH:mm)" included when the cache answered), "Auto-publish: off —
    /// publish: none — not installed for &lt;key&gt; or its office" (any none, with its reason), "Auto-publish: off —
    /// &lt;label&gt;" (auto: false), or "… did not parse: …".</summary>
    public static string Policy(ResolvedArtefact publish)
    {
        if (publish.Origin == "none") return "Auto-publish: off — publish: " + publish.Label;
        return Publisher.PolicyAuto(publish.BodyJson) switch
        {
            true => "Auto-publish: on · " + publish.Label,
            false => "Auto-publish: off — " + publish.Label,
            _ => "Auto-publish: off — " + publish.Label + " did not parse: the body is not {auto: true} or {auto: false}",
        };
    }

    /// <summary>Governed Publish's one dialog. With no outcome (the plan was refused before the referee): the refusal
    /// — not bound, an export that produced nothing, or the gate FAILED (<see cref="GateLines.PublishRejected"/> and the
    /// gate row); "" for a ready plan. With an outcome: the bridge not reached, rejected, or accepted / recorded with
    /// the version and where the IFC is.</summary>
    public static string Dialog(PublishPlan p, PublishOutcome? o = null, StageResult? s = null)
    {
        if (o is null || s is null)
            return p.Refusal is not null ? p.Refusal
                 : p.GateFailed ? GateLines.PublishRejected(p.Gate) + "\n\n" + GateRow(p)
                 : "";
        var gateLine = GateLines.PublishLine(p.Gate, p.Key);
        if (!o.Reached)
            return gateLine + "\n" + GateRow(p) + "\n\n" +
                   "The Sentinel bridge did not return a verdict — nothing was registered or uploaded, and no verdict row is confirmed.\n\n" +
                   (o.Verdict.Error is { Length: > 0 } ? "Reason: " + o.Verdict.Error + "\n\n" : "") +
                   "Start the bridge (npm run bcf:serve) and run Governed Publish again.";
        var v = o.Verdict;
        if (o.Rejected)
        {
            var nameFailed = v.NamingOk == false;
            return (nameFailed
                       ? "✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: " + p.ContainerName + "\n\n"
                       : "✕ REJECTED — " + v.Failing + " of " + v.InScope + " in-scope element check(s) failed (not published)\n\n") +
                   gateLine + "\n" + GateRow(p) + "\n" + VerdictRow(o) + "\n" +
                   "No version was registered and nothing was uploaded.\n\n" +
                   (nameFailed ? "NAMING:\n• " + string.Join("\n• ", v.NamingFailures) + "\n\n" : "") +
                   (v.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", v.Failures) + "\n\n" : "") +
                   (v.BcfRaised > 0
                       ? v.BcfRaised + " BCF issue(s) opened on the failing elements — they're now in the web Issues panel and will live-sync into Revit. Fix them and run Governed Publish again."
                       : nameFailed
                           ? "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again."
                           : "Fix the failures and run Governed Publish again.");
        }
        // accepted, or recorded (no IDS, or nothing in its scope): registered, and in the outbox when Stage landed it
        var status = s.Staged && o.Version is { } sv ? "published as " + sv.Revision + " · " + sv.State
                   : o.Version is { } rv ? rv.Revision + " · " + rv.State + " registered, NOT in the upload outbox"
                   : "no version registered";
        var head = o.Accepted
            ? "✓ ACCEPTED — " + status
            : (s.Staged ? "Published" : "Recorded") + " — not judged: " + NotJudged(p, o);
        var upload = s.Staged ? "Queued for upload — the outbox watcher attaches the geometry to this version."
                   : o.Version is null ? "Nothing was uploaded: there is no version to attach the geometry to — run Governed Publish again."
                   : "NOT in the upload outbox — " + s.Reason + "." + (s.KeptIfcPath is null ? " The export is gone — run Governed Publish again." : " The IFC is kept at " + s.KeptIfcPath + " — run Governed Publish again.");
        return head + "\n" +
               "Project: " + p.Key + "\n\n" +
               Ids(p, o) + "\n" +
               Naming(o) + "\n" +
               gateLine + "\n" +
               (o.Accepted && p.Gate.Outcome == GateOutcome.NotChecked ? GateLines.JudgedAlone(p.Gate) + "\n" : "") +
               "SHA-256: " + p.Sha256.Substring(0, Math.Min(16, p.Sha256.Length)) + "…\n" +
               GateRow(p) + "\n" +
               VerdictRow(o) + "\n" +
               Version(p, o) + "\n\n" +
               upload +
               (o.Accepted ? "" : "\nNo verdict badge: " + (v.Downgraded is null ? "nothing was judged" : "the IDS found nothing in its scope, so nothing was judged") +
                   " — the verdict is \"recorded\", and publishing this version on the web needs the lead's reason. " +
                   (v.Downgraded is null ? "Install an IDS on the project or its office to judge the next one." : "Give the IDS something in its scope, or install one that covers this model, to judge the next one."));
    }

    private static string NotJudged(PublishPlan p, PublishOutcome o) =>
        o.Verdict.IdsRef is null ? "no IDS installed for " + p.Key + " or its office" : "nothing in the IDS's scope (" + o.Verdict.IdsLabel + ")";

    /// <summary>Auto-Publish's one Doctor line for the same outcomes: <paramref name="o"/> and <paramref name="s"/> are
    /// null when the plan was refused before the referee (not bound, no export, gate FAIL) or the judge never answered.</summary>
    public static string Doctor(PublishPlan p, PublishOutcome? o = null, StageResult? s = null)
    {
        if (p.Refusal is not null) return "Auto-publish failed — nothing uploaded — " + p.Refusal.Replace("\n", " ").Replace("  ", " ");
        if (p.GateFailed) return "Auto-publish rejected — nothing uploaded — delivery gate " + GateLines.Verdict(p.Gate, p.Key) + " · " + p.Gate.Failures.Count + " failure(s) · gate row: " + LedgerLine.For(p.GateRow);
        if (o is null || s is null) return "Auto-publish: no verdict — the publish stopped before the referee answered — nothing uploaded";
        var v = o.Verdict;
        if (!o.Reached) return "Auto-publish: no verdict — nothing uploaded — " + (v.Error is { Length: > 0 } ? v.Error : "the bridge returned no verdict");
        if (o.Rejected)
            return "Auto-publish rejected — nothing uploaded — " +
                   (v.NamingOk == false ? "the model name " + p.ContainerName + " failed naming " + v.NamingLabel : v.Failing + " of " + v.InScope + " element check(s) failed · " + v.IdsLabel) +
                   " · " + LedgerLine.For(o.VerdictRow);
        if (o.Version is null) return "Auto-publish: verdict " + v.Verdict + " but the bridge registered no version — nothing uploaded · " + LedgerLine.For(o.VerdictRow);
        var ver = o.Version;
        if (!s.Staged) return "Auto-publish: " + p.ContainerName + " " + ver.Revision + " · " + ver.State + " registered but NOT in the upload outbox — " + s.Reason;
        return "Auto-published " + p.ContainerName + " " + ver.Revision + " · " + ver.State +
               (v.VerdictAuditId is { Length: > 0 } id ? " · ledger #" + id : " · stamp not confirmed — the bridge returned no verdict_audit_id") +
               (o.Accepted ? "" : " — not judged: " + NotJudged(p, o));
    }
}
```

- [ ] **Step 6: Run it — GREEN**

Run (repo root): `dotnet run --project tools/publish-check`

Expected: 98 `PASS` lines (15 names, 11 wire, 7 outcomes, 15 staging, 34 lines, 16 policy), no `FAIL`, ending:

```
  PASS  a body that is not {auto: boolean} (not json) → off, did not parse
  PASS  no bridge and no cache → off, the reason

98/98 checks pass
```

The stage checks run on `%TEMP%\sentinel-publish-check-<guid>\` and delete it; nothing touches `%AppData%`. The harness runs on Windows (the CI step is the `windows-latest` add-in job): `Path.GetInvalidFileNameChars()` is the Windows set, and the `C:\…` fixtures split on `\`.

- [ ] **Step 7: CI runs the harness**

Replace (in `.github/workflows/ci.yml`, line 38):

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events + heal)
```

with:

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events + heal + publish)
```

Replace (in `.github/workflows/ci.yml`, line 48 — the step's last line):

```yaml
          dotnet run --project tools/event-check
```

with:

```yaml
          dotnet run --project tools/event-check
          dotnet run --project tools/publish-check
```

- [ ] **Step 8: Both builds and the harnesses that compile the files this task touched**

Run (repo root): `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and `dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false`

Expected: `0 Error(s)` on both. 2024: `6 Warning(s)` — Commands.BcfIssues 322 (CS4014), Commands.GhostBuilder 220 (CS0618), Engine/RuleRegex 17 and 20 (CS8602), GhostBuilder/ChangesetExecutor 164 (CS0618), GhostBuilder/GhostBuilderOrchestrator 112 (CS0618). 2025: `3 Warning(s)` — Commands.Annotate 76 and 88 (CS8600), Commands.BcfIssues 322 (CS4014). Master's sets; none in a file this task touched. `Publisher.cs` compiles on both targets with its Revit half in (`Sentinel.csproj` globs every `.cs`), unused until Tasks 2-3; the four existing `Propose` callers pass no `register` and are unchanged.

Run: `dotnet run --project tools/fixplace-check` → `52/52 checks pass` (it compiles `ProposalResult.cs`; the new members change nothing it pins); `dotnet run --project tools/gate-check` → `123/123 checks pass`; `dotnet run --project tools/event-check` → `44/44 checks pass`; `dotnet run --project tools/artefact-cache-check` → `53/53 checks pass`.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add SentinelAddin/Engine/Publisher.cs SentinelAddin/Coordination/ProposalResult.cs SentinelAddin/Coordination/GovernedNotify.cs tools/publish-check/publish-check.csproj tools/publish-check/Check.cs .github/workflows/ci.yml
git commit -m "feat(revit): Publisher — the one publish path: ContainerName from the central file (F12: the local's _yazan.hKNTHU is gone; only .rvt/.rte/.ifc are extensions), Prepare on the API thread (contract waited, the whole model in the contract's schema to a temp folder of its own, the gate and its row waited, the elements), Judge off it with one /propose carrying container_name and register {name, size_bytes, sha256}, Stage writing the sidecar {project, container, version_id} BEFORE the IFC moves into the outbox and nothing on a reject, AutoEnabled (publish@n {auto: true}, else off) and PublishLines naming what judged, the policy, and the version only from the reply (the verdict row's id alone: the bridge returns no hash for it); GovernedNotify.Propose takes register through the pure ProposalResult.RequestBody; ProposalResult reads version {id, container_id, revision, state}, verdict_audit_id and downgraded; tools/publish-check 98/98 in CI. No caller moves yet: Governed Publish and Auto-Publish are Tasks 2 and 3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

Apply part A's Task 1 as written, then these replacements (measured: `tools/publish-check` → `101/101 checks pass`, both builds green with master's warnings, fixplace 52/52, gate 123/123, event 44/44, artefact-cache 53/53).

**Interfaces:** in the `ProposalResult.cs` bullet add `string? VerdictHash` (the verdict row's chain hash, the reply's `verdict_hash` — Task 4's bridge; null before it). In the `PublishOutcome` bullet add `LedgerResult StampRow /* FromReceipt(Verdict.VerdictAuditId, Verdict.VerdictHash) */`. In the `PublishLines` bullet: `Version(plan, outcome)` = `Version: <container> <revision> · <state> · ` + `LedgerLine.For(StampRow)` → `… · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…`, or `… · wip · not confirmed — the bridge returned no chain hash` when `verdict_audit_id` or `verdict_hash` is missing; `Doctor` accepted/recorded = `Auto-published <container> v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…`.

**Step 3, `ProposalResult.cs`** — in the new text of the first replace, replace:

```csharp
    // on a rejected verdict, without `register`, or when the bridge answered without one. VerdictAuditId is the
    // verdict:<v> row's id (the bridge returns no hash for it); Downgraded is "nothing in scope" when an accepted
    // verdict with in_scope 0 was recorded instead.
    public VersionInfo? Version;
    public string? VerdictAuditId;
    public string? Downgraded;
```

with:

```csharp
    // on a rejected verdict, without `register`, or when the bridge answered without one. VerdictAuditId and
    // VerdictHash are the verdict:<v> row's id and chain hash (verdict_hash, answered by the 5b bridge; an older one
    // answers no hash and the stamp then reads not confirmed); Downgraded is "nothing in scope" when an accepted
    // verdict with in_scope 0 was recorded instead.
    public VersionInfo? Version;
    public string? VerdictAuditId;
    public string? VerdictHash;
    public string? Downgraded;
```

and replace:

```csharp
        r.VerdictAuditId = Scalar(root, "verdict_audit_id");
```

with:

```csharp
        r.VerdictAuditId = Scalar(root, "verdict_audit_id");
        r.VerdictHash = Str(root, "verdict_hash");
```

**Step 5, `Publisher.cs`** — replace:

```csharp
    /// <summary>The proposal row as the bridge handed it back: audit_id and receipt.ledger_hash.</summary>
    public LedgerResult VerdictRow => LedgerResult.FromReceipt(Verdict.AuditId, Verdict.ReceiptHash);
```

with:

```csharp
    /// <summary>The proposal row as the bridge handed it back: audit_id and receipt.ledger_hash.</summary>
    public LedgerResult VerdictRow => LedgerResult.FromReceipt(Verdict.AuditId, Verdict.ReceiptHash);
    /// <summary>The verdict:&lt;v&gt; row the bridge stamped on the registered version: verdict_audit_id and
    /// verdict_hash. Not confirmed when either is missing (a bridge before 5b answers no verdict_hash).</summary>
    public LedgerResult StampRow => LedgerResult.FromReceipt(Verdict.VerdictAuditId, Verdict.VerdictHash);
```

replace:

```csharp
/// answer); the version is claimed only from the reply; "receipt" appears only where the bridge returned the hash (the
/// proposal row — it returns none for the verdict row, so that line carries the id alone). Pure.</summary>
```

with:

```csharp
/// answer); the version is claimed only from the reply; "receipt" appears only with a hash the bridge returned (the
/// proposal row's receipt.ledger_hash, the stamp row's verdict_hash). Pure.</summary>
```

replace:

```csharp
    /// <summary>"Version: &lt;container&gt; v1 · wip · ledger #814" from the reply; with no verdict_audit_id "… · stamp
    /// not confirmed — …"; with no version "Version: not confirmed — &lt;reason&gt;".</summary>
    public static string Version(PublishPlan p, PublishOutcome o)
    {
        var v = o.Version;
        if (v is null) return "Version: not confirmed — " + NoVersion(o);
        var head = "Version: " + p.ContainerName + " " + v.Revision + " · " + v.State;
        return o.Verdict.VerdictAuditId is { Length: > 0 } id
            ? head + " · ledger #" + id
            : head + " · stamp not confirmed — the bridge returned no verdict_audit_id";
    }
```

with:

```csharp
    /// <summary>"Version: &lt;container&gt; v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…" from the reply — the
    /// stamp row through <see cref="LedgerLine"/>, so "… · wip · not confirmed — the bridge returned no chain hash"
    /// when verdict_audit_id or verdict_hash is missing; with no version "Version: not confirmed — &lt;reason&gt;".</summary>
    public static string Version(PublishPlan p, PublishOutcome o)
    {
        var v = o.Version;
        if (v is null) return "Version: not confirmed — " + NoVersion(o);
        return "Version: " + p.ContainerName + " " + v.Revision + " · " + v.State + " · " + LedgerLine.For(o.StampRow);
    }
```

and replace:

```csharp
        return "Auto-published " + p.ContainerName + " " + ver.Revision + " · " + ver.State +
               (v.VerdictAuditId is { Length: > 0 } id ? " · ledger #" + id : " · stamp not confirmed — the bridge returned no verdict_audit_id") +
               (o.Accepted ? "" : " — not judged: " + NotJudged(p, o));
```

with:

```csharp
        return "Auto-published " + p.ContainerName + " " + ver.Revision + " · " + ver.State + " · " + LedgerLine.For(o.StampRow) +
               (o.Accepted ? "" : " — not judged: " + NotJudged(p, o));
```

**Step 1, `tools/publish-check/Check.cs`** — replace:

```csharp
    const string GateHash = "5c6d7e8f90112233445566778899aabbccddeeff00112233445566778899aabb"; // the gate row's chain hash
```

with:

```csharp
    const string GateHash = "5c6d7e8f90112233445566778899aabbccddeeff00112233445566778899aabb"; // the gate row's chain hash
    const string StampHash = "6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d"; // the verdict:<v> row's (verdict_hash)
```

replace:

```csharp
    // What /propose answers the Publisher (cde-store.mjs adjudicateProposal, 5a): accepted, registered as v1 wip,
    // stamped as row 814; the receipt is the proposal row's (813).
```

with:

```csharp
    // What /propose answers the Publisher (cde-store.mjs adjudicateProposal, 5a + Task 4's verdict_hash): accepted,
    // registered as v1 wip, stamped as row 814 (its hash in verdict_hash); the receipt is the proposal row's (813).
```

replace:

```csharp
        "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"agent\":null," +
```

with:

```csharp
        "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"verdict_hash\":\"" + StampHash + "\",\"agent\":null," +
```

replace:

```csharp
    const string VersionJson = "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814";
```

with:

```csharp
    const string VersionJson = "\"version\":{\"id\":\"" + Vid + "\",\"container_id\":\"" + Cid + "\",\"revision\":\"v1\",\"state\":\"wip\"},\"verdict_audit_id\":814,\"verdict_hash\":\"" + StampHash + "\"";
```

replace:

```csharp
                .Replace(VersionJson, version ? VersionJson : "\"version\":null,\"verdict_audit_id\":null");
```

with:

```csharp
                .Replace(VersionJson, version ? VersionJson : "\"version\":null,\"verdict_audit_id\":null,\"verdict_hash\":null");
```

replace:

```csharp
        Is(ProposalResult.Parse(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":\"814\"")).VerdictAuditId ?? "null", "814", "…and as a string");
```

with:

```csharp
        Is(ProposalResult.Parse(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":\"814\"")).VerdictAuditId ?? "null", "814", "…and as a string");
        Is(r.VerdictHash ?? "null", StampHash, "verdict_hash (the stamp row's chain hash, Task 4's bridge) reads");
```

replace:

```csharp
        Ok(rej.Verdict == "rejected" && rej.Version is null && rej.VerdictAuditId is null && rej.Failing == 3, "a rejected reply: version null and verdict_audit_id null read as none");
```

with:

```csharp
        Ok(rej.Verdict == "rejected" && rej.Version is null && rej.VerdictAuditId is null && rej.VerdictHash is null && rej.Failing == 3, "a rejected reply: version null, verdict_audit_id and verdict_hash null read as none");
```

replace:

```csharp
        Is(LedgerLine.For(acc.VerdictRow), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "the verdict row is the proposal row's id and receipt hash");
```

with:

```csharp
        Is(LedgerLine.For(acc.VerdictRow), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "the verdict row is the proposal row's id and receipt hash");
        Is(LedgerLine.For(acc.StampRow), "ledger #814 · receipt 6e7f8091a2b3c4d5…", "the stamp row is verdict_audit_id and verdict_hash");
```

replace:

```csharp
        const string VersionLine = "Version: " + Container + " v1 · wip · ledger #814";
```

with:

```csharp
        const string VersionLine = "Version: " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…";
```

replace:

```csharp
        Is(PublishLines.Version(plan, acc), VersionLine, "the version from the reply: container, revision, state, the stamp's ledger id — no receipt, the bridge returns none for it");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":null"))),
           "Version: " + Container + " v1 · wip · stamp not confirmed — the bridge returned no verdict_audit_id", "a version with no verdict_audit_id: the stamp is not confirmed");
```

with:

```csharp
        Is(PublishLines.Version(plan, acc), VersionLine, "the version from the reply: container, revision, state, the stamp row's ledger id and receipt (verdict_audit_id + verdict_hash)");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_audit_id\":814", "\"verdict_audit_id\":null"))),
           "Version: " + Container + " v1 · wip · not confirmed — the bridge returned no chain hash", "a version with no verdict_audit_id: the stamp is not confirmed");
        Is(PublishLines.Version(plan, Outcome(Accepted.Replace("\"verdict_hash\":\"" + StampHash + "\"", "\"verdict_hash\":null"))),
           "Version: " + Container + " v1 · wip · not confirmed — the bridge returned no chain hash", "a bridge before Task 4 (no verdict_hash): the stamp is not confirmed — never a receipt without its hash");
```

and replace:

```csharp
        Is(PublishLines.Doctor(plan, acc, Staged), "Auto-published " + Container + " v1 · wip · ledger #814", "auto, accepted: Auto-published <container> <revision> · wip · ledger #<verdict_audit_id>");
        Is(PublishLines.Doctor(plan, down, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)", "auto, recorded: says nothing was judged");
        Is(PublishLines.Doctor(plan, none, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 — not judged: no IDS installed for aster-tower or its office", "auto, recorded with no IDS");
```

with:

```csharp
        Is(PublishLines.Doctor(plan, acc, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5…", "auto, accepted: Auto-published <container> <revision> · wip · the stamp row");
        Is(PublishLines.Doctor(plan, down, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5… — not judged: nothing in the IDS's scope (ids@4 · office · 23bb57937fb0…)", "auto, recorded: says nothing was judged");
        Is(PublishLines.Doctor(plan, none, Staged), "Auto-published " + Container + " v1 · wip · ledger #814 · receipt 6e7f8091a2b3c4d5… — not judged: no IDS installed for aster-tower or its office", "auto, recorded with no IDS");
```

**Step 6:** expected `101` PASS lines (15 names, 12 wire, 8 outcomes, 15 staging, 35 lines, 16 policy), ending `101/101 checks pass`. **Step 8:** unchanged (measured: both builds 0 errors, master's 6 and 3 warnings; fixplace 52/52, gate 123/123, event 44/44, artefact-cache 53/53). **Step 9:** in the commit message replace "the version only from the reply (the verdict row's id alone: the bridge returns no hash for it)" with "the version only from the reply (the stamp row through LedgerLine — ledger #<verdict_audit_id> · receipt <verdict_hash>…, not confirmed without either)" and "tools/publish-check 98/98" with "tools/publish-check 101/101". Part A's cross-task note "Pinned interface, amended — the `Version:` line carries no receipt" is withdrawn.

---

### Task 2: Revit — Governed Publish on `Publisher`: `Prepare` on the API thread, `Judge` waited for off it, `Stage` sidecar-first, one dialog from `PublishLines` naming the container, the revision and both ledger rows; the second `/propose`, `RegisterVersionId`, `LiveVersion`, the shell-command text and the active-view export are gone from the command

**Files:**
- Rewrite: `SentinelAddin/Commands.GovernedPublish.cs` (whole file, master :1-211 — the 3D-view guard :34-40, the contract `Task.Run` :53, the active-view export :57-69, the gate + its row :71-83, the org warning :88-92, the extraction :93, the first `/propose` :95, the unreachable dialog with the shell text :97-108, the reject dialog :114-135, the outbox copy :137-153, `RegisterVersionId` + the stamp `/propose` :155-167, `LiveVersion` :169, the accept dialog :183-198, `SafeName` :203-208)
- Modify: `SentinelAddin/Engine/AutoPublish.cs` (master :30, after `_busy` — one `InFlight` property on the pre-5b class; Task 3 rewrites the file and keeps it)
- Modify: `SentinelAddin/App.cs` (:309-310, the Governed Publish tooltip)
- Read for reference: spec `docs/superpowers/specs/2026-09-26-publish-one-path-design.md` Decisions 3 and 8 and the 5b definition of done; `SentinelAddin/Engine/Publisher.cs` as Task 1 leaves it (`PublishPlan`, `Prepare`, `Judge`, `Stage`, `PublishLines` — the names this task consumes are listed below and in the cross-task notes); `SentinelAddin/Coordination/ArtefactClient.cs:44-50` (`Resolve(string key, string kind, TimeSpan? timeout = null)` — three parameters, so the pinned `Func<string, TimeSpan?, ResolvedArtefact>` is a lambda closing over the key) and `:154-155` (`None`); `SentinelAddin/Coordination/ProposalResult.cs:12-34` (what `Judge` carries: `Reached`, `Verdict`, `AuditId`, `ReceiptHash`, the ids/naming labels — Task 1 adds `Version` and `VerdictAuditId`); `SentinelAddin/Coordination/LedgerResult.cs:156-178` (`LedgerLine.For`, the only words for a ledger row); `SentinelAddin/Engine/GateLines.cs:30-37` and `:68-75` (`PublishLine`, `JudgedAlone`, `PublishRejected` — the pieces `PublishLines` reuses); `SentinelAddin/Engine/PlatformExporter.cs:27-34` (`OutboxDir()`, the folder `Stage` moves into); `SentinelAddin/Engine/ProjectContext.cs:18` (`NotBound`) and `:44-45` (`For`: API thread); `SentinelAddin/App.cs:27` (`OrgFor`); `SentinelAddin/Commands.IfcGate.cs:110-124` (the `Task.Run(...).GetAwaiter().GetResult()` idiom of a modal wait); `SentinelAddin/Engine/AutoPublish.cs:28-30` (`_busy`, the single-flight flag `InFlight` reads).

**Interfaces:**
- Consumes (Task 1, `Sentinel.Engine`): `Publisher.Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact> resolve, out string? failure)` → `PublishPlan?` (null = nothing exported, `failure` says why: "IFC export contained no geometry — nothing to publish." or "IFC export failed: …"); the lambda is `(kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout)`; on the API thread it loads the contract (waited, ≤ 4 s), exports the WHOLE model (`PlatformExporter.Default3DView`) in `contract.IfcSchema ?? "IFC2X3"` to `tempDir\<ContainerName>`, runs the gate, waits for its ledger row (≤ 6 s) and extracts the elements. `Publisher.Judge(PublishPlan plan)` → `PublishOutcome`, OFF the API thread: one `GovernedNotify.Propose(...)` with `container_name` and `register {name, size_bytes, sha256}`; on a plan whose `Gate.Outcome` is `Fail` it makes NO `/propose` call and returns the gate-failed outcome (a gate FAIL stops before the IDS, as on master). `Publisher.Stage(PublishPlan plan, PublishOutcome outcome, string outboxDir)` → `StageResult`: accepted or recorded with a version id → the sidecar `{project, container, version_id}` is written FIRST, then the temp IFC moves to `outboxDir\<ContainerName>`; anything else (rejected, gate FAIL, not reached, no version in the reply) → the temp IFC is deleted and nothing is staged. `PublishLines.Dialog(PublishPlan plan, PublishOutcome outcome, StageResult stage)` → the whole dialog body: the existing `GateLines.PublishLine` / `JudgedAlone` / `PublishRejected` pieces, `Gate row: <LedgerLine>`, `Verdict row: <LedgerLine>` (from `AuditId` + `ReceiptHash`), `Version: <container> <revision> · wip · ledger #<verdict_audit_id> · receipt …` from the reply, `Published — not judged: nothing in the IDS's scope (<ids label>)` when downgraded, `… no IDS installed for <key> or its office` when ids is none, `Version: not confirmed — <reason>` when the reply has no version, and — the honesty rule — "The Sentinel bridge uploads the geometry." only when `stage.Staged`. `PublishPlan.Gate` is `IfcDeliveryGate.GateResult`, `PublishPlan.TempIfcPath` the temp file.
- Consumes (master): `ProjectContext.For` / `NotBound`, `App.OrgFor`, `App.Engine.SourceFor`, `ArtefactClient.Resolve`, `PlatformExporter.OutboxDir`.
- Produces:
  - `Sentinel.Engine.AutoPublish.InFlight` (`internal static bool`, `=> _busy`): true while an auto run is between its export and its outbox write. Governed Publish refuses to start meanwhile — both write `<tempDir>\<ContainerName>` and `outbox\<ContainerName>`.
  - `GovernedPublishCommand.Execute`: unbound → the `NotBound` dialog, `Result.Cancelled`, nothing exported; auto in flight → "Auto-publish is judging this model right now — its Doctor line lands when it finishes. Run Governed Publish after that." + "Nothing was exported.", `Result.Cancelled`; the org warning (unchanged words but "will NOT be read", since it now precedes the extraction); `Prepare` → null → `<failure>` + "Nothing was published.", `Result.Failed`; else `Judge` on `Task.Run(...).GetAwaiter().GetResult()`, `Stage` into `PlatformExporter.OutboxDir()`, ONE `TaskDialog` with `PublishLines.Dialog(plan, outcome, stage)`, `Result.Succeeded`. No 3D-view requirement (the whole model is exported), no second `/propose`, no `RegisterVersionId`, no `LiveVersion`, no shell text, no `SafeName` (the name is `Publisher.ContainerName`).
  - The ribbon tooltip for Governed Publish says what the tool does now (the whole model, one version named from the central file, both ledger rows).

- [ ] **Step 1: `InFlight` on the pre-5b `AutoPublish` (Task 3 keeps it)**

Replace (in `SentinelAddin/Engine/AutoPublish.cs`, line 30):

```csharp
    private static bool _busy;
```

with:

```csharp
    private static bool _busy;

    /// <summary>True while a run is between its export and its outbox write. Governed Publish refuses to start meanwhile:
    /// both write the same temp and outbox names.</summary>
    internal static bool InFlight => _busy;
```

- [ ] **Step 2: `Commands.GovernedPublish.cs` — three calls and one dialog**

Replace the whole of `SentinelAddin/Commands.GovernedPublish.cs` with:

```csharp
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.Commands;

/// <summary>
/// G1 — <b>Governed Publish</b>: the one publish path (cohesion phase 5b, spec Decision 8) with a dialog.
/// <see cref="Publisher.Prepare"/> on this thread — the whole model (the default 3D view) exported to a TEMP IFC in
/// the contract's schema, the delivery gate and its ledger row (waited for, ≤ 6 s), the elements extracted —
/// then <see cref="Publisher.Judge"/> waited for OFF this thread: one <c>POST /cde/:key/propose</c> that judges the
/// IDS and the name and, on accepted or recorded, registers the version and stamps its verdict (one proposal row,
/// one version, one verdict row; a gate FAIL never reaches it). Then <see cref="Publisher.Stage"/>: the sidecar
/// naming that version is written first, then the IFC moves into the outbox; a reject stages nothing. One dialog
/// from <see cref="PublishLines"/> names the container, the revision, both ledger rows and what judged. Auto-publish
/// runs the same three calls without the dialog, when the project's publish@n says so.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GovernedPublishCommand : IExternalCommand
{
    private const string Title = "Sentinel — Governed Publish";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        // The web project this document publishes into (Project Setup → Web project). None → nothing is exported.
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound + "\n\nNothing was exported or published.");
            return Result.Cancelled;
        }
        var projectKey = ctx.Key;

        // Auto-publish between its Prepare and its Stage writes the same temp and outbox names this command would.
        if (AutoPublish.InFlight)
        {
            TaskDialog.Show(Title, "Auto-publish is judging this model right now — its Doctor line lands when it finishes. " +
                                   "Run Governed Publish after that.\n\nNothing was exported.");
            return Result.Cancelled;
        }

        // Without an office code the Pset_<org>.* rows are dropped from the read table (PsetMap), so the referee sees
        // them as missing. Say so out loud — the verdict is still honest and still recorded.
        if (string.IsNullOrWhiteSpace(App.OrgFor(doc)))
            TaskDialog.Show(Title,
                "This document's ruleset (" + (App.Engine?.SourceFor(doc).Label ?? "none") + ") has no \"org\" code — " +
                "office property sets (Pset_<org>.*) will NOT be read for this publish; the referee will report them " +
                "missing. Install a ruleset@n with an \"org\" on " + projectKey + " or its office, then retry.");

        // 1) Prepare on this (API) thread: the contract, the whole-model export to TEMP (never the outbox — a reject
        //    must not leak a model into it), the gate and its ledger row, the extraction. Null = nothing exported.
        var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout), out var failure);
        if (plan is null)
        {
            TaskDialog.Show(Title, failure + "\n\nNothing was published.");
            return Result.Failed;
        }

        // 2) Judge OFF this thread and wait for it (the 120 s /propose): a modal command may block on the bridge; a
        //    save handler may not. 3) Stage: accepted or recorded → the sidecar {project, container, version_id},
        //    then the IFC into the outbox; anything else → the temp IFC is deleted and nothing is staged.
        var outcome = Task.Run(() => Publisher.Judge(plan)).GetAwaiter().GetResult();
        var stage = Publisher.Stage(plan, outcome, PlatformExporter.OutboxDir());
        TaskDialog.Show(Title, PublishLines.Dialog(plan, outcome, stage));
        return Result.Succeeded;
    }
}
```

- [ ] **Step 3: the tooltip says what the tool does now**

Replace (in `SentinelAddin/App.cs`, lines 309-310):

```csharp
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "One governed action: export the active view to IFC, run the delivery gate, adjudicate against the project IDS, record the verdict on the ledger, and publish + version ONLY if it passes. A fail is recorded and each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit).");
```

with:

```csharp
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "The one publish path: export the whole model to IFC in the contract's schema, run the delivery gate, adjudicate against the project IDS and naming, and — on accepted or recorded — register one version (the container is named from the central file) with its verdict on the ledger and stage the upload. A reject uploads nothing; each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit). The dialog names the version and both ledger rows.");
```

- [ ] **Step 4: Both builds, the harnesses, and the words that must be gone**

Run (repo root, each quoted path as is):

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `0 Error(s)` on both. 2024: `6 Warning(s)` — `Commands.BcfIssues.cs(322,31)` CS4014, `Commands.GhostBuilder.cs(220,38)` CS0618, `Engine\RuleRegex.cs(17,89)` and `(20,78)` CS8602, `GhostBuilder\ChangesetExecutor.cs(164,30)` CS0618, `GhostBuilder\GhostBuilderOrchestrator.cs(112,41)` CS0618 (master's set, measured on 41b7ad1). 2025: `3 Warning(s)` — `Commands.Annotate.cs(76,59)` and `(88,59)` CS8600, `Commands.BcfIssues.cs(322,31)` CS4014. No new warning: this task adds none.

Run: `dotnet run --project tools/publish-check` → the total Task 1 states (this task changes no harness-compiled file); `dotnet run --project tools/gate-check` → `123/123 checks pass`; `dotnet run --project tools/event-check` → `44/44 checks pass`.

Run (repo root):

```bash
git grep -n -E "upload-ifc|RegisterVersionId|LiveVersion|SafeName|ActiveView is not View3D|stamp the badge|Version badge" -- SentinelAddin/Commands.GovernedPublish.cs
```

Expected: nothing (master: 8 hits in that file). `RegisterVersionId`, `LiveVersion` and `upload-ifc.mjs` still exist elsewhere until Task 3 (`Commands.PublishToPlatform.cs`, `GovernedNotify.cs`, `GovernedQuery.cs`); the command is their last governed caller.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Engine/AutoPublish.cs SentinelAddin/App.cs
git commit -m "feat(revit): Governed Publish runs on Publisher — Prepare on the API thread (the whole model in the contract's schema to a temp IFC, the gate and its row waited for), Judge waited for off it (one /propose that registers the version with its verdict), Stage sidecar-first, one dialog from PublishLines naming the container, the revision and both ledger rows; the second /propose, RegisterVersionId, LiveVersion, the shell-command text, the 3D-view requirement and the active-view export are gone from the command; Governed Publish refuses to start while an auto run is in flight (AutoPublish.InFlight); the tooltip says what the tool does now

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

**Interfaces:** replace the "Consumes (Task 1, `Sentinel.Engine`)" bullet with: `Publisher.Prepare(Document doc, string tempDir, Func<string, TimeSpan?, ResolvedArtefact>? resolve = null)` → `PublishPlan` (never null, never throws for a failed export): on the API thread it loads the contract (waited, ≤ 4 s) through `resolve("contract", …)`, exports the WHOLE model (`PlatformExporter.Default3DView`) in `contract.IfcSchema ?? "IFC2X3"` to `tempDir\<guid>\<ContainerName>`, runs the gate, waits for its ledger row (≤ 6 s) and extracts the elements; `plan.Ready` is false when the document is unbound, the export produced nothing or failed (`plan.Refusal`) or the gate FAILED (`plan.GateFailed`) — the temp IFC is already discarded and `PublishLines.Dialog(plan)` is the whole refusal dialog (`GateLines.PublishRejected` + `Gate row: …` on a gate FAIL); `plan.OrgWarning` is today's org-less ruleset text (null when the org is set). `Publisher.Judge(plan)` → `PublishOutcome`, OFF the API thread: one `GovernedNotify.Propose(...)` with `container_name` and `register {name, size_bytes, sha256}`; never throws. `Publisher.Stage(plan, outcome, outboxDir)` → `StageResult`: accepted or recorded with a version id → the sidecar `{project, container, version_id}` FIRST, then the move; anything else → the temp IFC is deleted and nothing is staged. `PublishLines.Dialog(plan, outcome, stage)` → the whole dialog (Task 1's harness pins every text: `Version: <container> <revision> · wip · ledger #<verdict_audit_id> · receipt <16 hex>…` or `… · not confirmed — the bridge returned no chain hash`, `Published — not judged: …` on recorded, `Version: not confirmed — <reason>` with no version, `Queued for upload — the outbox watcher attaches the geometry to this version.` only when staged).

**Step 2:** replace the whole of `SentinelAddin/Commands.GovernedPublish.cs` with:

```csharp
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.Commands;

/// <summary>
/// G1 — <b>Governed Publish</b>: the one publish path (cohesion phase 5b, spec Decision 8) with a dialog.
/// <see cref="Publisher.Prepare"/> on this thread — the whole model (the default 3D view) exported to a TEMP IFC in
/// the contract's schema, the delivery gate and its ledger row (waited for, ≤ 6 s), the elements extracted —
/// then <see cref="Publisher.Judge"/> waited for OFF this thread: one <c>POST /cde/:key/propose</c> that judges the
/// IDS and the name and, on accepted or recorded, registers the version and stamps its verdict (one proposal row,
/// one version, one verdict row; a gate FAIL never reaches it). Then <see cref="Publisher.Stage"/>: the sidecar
/// naming that version is written first, then the IFC moves into the outbox; a reject stages nothing. One dialog
/// from <see cref="PublishLines"/> names the container, the revision, both ledger rows and what judged. Auto-publish
/// runs the same three calls without the dialog, when the project's publish@n says so.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GovernedPublishCommand : IExternalCommand
{
    private const string Title = "Sentinel — Governed Publish";

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;

        // The web project this document publishes into (Project Setup → Web project). None → nothing is exported.
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show(Title, ProjectContext.NotBound + "\n\nNothing was exported or published.");
            return Result.Cancelled;
        }
        var projectKey = ctx.Key;

        // Auto-publish between its Prepare and its Stage would write the same outbox name this command does.
        if (AutoPublish.InFlight)
        {
            TaskDialog.Show(Title, "Auto-publish is judging this model right now — its Doctor line lands when it finishes. " +
                                   "Run Governed Publish after that.\n\nNothing was exported.");
            return Result.Cancelled;
        }

        // 1) Prepare on this (API) thread: the contract, the whole-model export to TEMP (never the outbox — a reject
        //    must not leak a model into it), the gate and its ledger row, the extraction. Not Ready = refused before
        //    the referee (an export that produced nothing, or a gate FAIL): the dialog says which; the temp IFC is
        //    already discarded and nothing is staged.
        var plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(projectKey, kind, timeout));
        if (!plan.Ready)
        {
            TaskDialog.Show(Title, PublishLines.Dialog(plan));
            return plan.GateFailed ? Result.Succeeded : Result.Failed;
        }
        // Without an office code the Pset_<org>.* rows were dropped from the read table (PsetMap), so the referee
        // sees them as missing. Say so out loud — the verdict is still honest and still recorded.
        if (plan.OrgWarning is not null) TaskDialog.Show(Title, plan.OrgWarning);

        // 2) Judge OFF this thread and wait for it (the 120 s /propose): a modal command may block on the bridge; a
        //    save handler may not. 3) Stage: accepted or recorded → the sidecar {project, container, version_id},
        //    then the IFC into the outbox; anything else → the temp IFC is deleted and nothing is staged.
        var outcome = Task.Run(() => Publisher.Judge(plan)).GetAwaiter().GetResult();
        var stage = Publisher.Stage(plan, outcome, PlatformExporter.OutboxDir());
        TaskDialog.Show(Title, PublishLines.Dialog(plan, outcome, stage));
        return Result.Succeeded;
    }
}
```

**Produces:** the `GovernedPublishCommand.Execute` sentence becomes: unbound → the `NotBound` dialog, `Result.Cancelled`; auto in flight → the "Auto-publish is judging this model right now …" dialog, `Result.Cancelled`; `!plan.Ready` → one dialog `PublishLines.Dialog(plan)` (the refusal, or the gate-FAIL text with its row), `Result.Failed` for a refusal and `Result.Succeeded` for a judged gate FAIL (as on master); the org warning (`plan.OrgWarning`, "were NOT read", as on master) after `Prepare`; else `Judge` waited on `Task.Run`, `Stage`, ONE `TaskDialog` with `PublishLines.Dialog(plan, outcome, stage)`, `Result.Succeeded`.

**Step 4:** `dotnet run --project tools/publish-check` → `101/101 checks pass` (measured; both builds 0 errors with master's warnings; gate-check 123/123, event-check 44/44; the grep prints nothing). Step 1 (`InFlight`), Step 3 (the tooltip) and Step 5 are unchanged.

---

### Task 3: Revit — Auto-Publish on `Publisher` with no switch (the project's `publish@n {auto: true}` is the only on; a save on a project without it exports nothing and the Doctor log says why, once), the pane's strip names the policy, and Quick Publish, the toggle, linked-model publishing, `FileVersion` / `ModelPublished` / `RegisterVersionId` / `LiveVersion` and the outbox writers are deleted

**Files:**
- Rewrite: `SentinelAddin/Engine/AutoPublish.cs` (whole file: master :1-89 as Task 2 leaves it, with `InFlight` after :30)
- Delete: `SentinelAddin/Commands.AutoPublish.cs` (the toggle, :1-27), `SentinelAddin/Commands.PublishToPlatform.cs` (Quick Publish, :1-89)
- Modify: `SentinelAddin/App.cs` (:126-129 `OnDocumentOpened`'s link guard; :252-254 `OnSaved`'s comment; :307-320 the Publish panel — Task 2 changed :309-310, the line count is unchanged)
- Modify: `SentinelAddin/Engine/PlatformExporter.cs` (:9-26 the summary, `OpeningForExport`, `IsOpenedForExport`; :48-190 `ExportToOutbox`, `WriteOutboxMeta`, `ExportLinksToOutbox` and `ExportToDir`'s summary; :248-253 `Sanitize`)
- Modify: `SentinelAddin/Engine/SettingsManager.cs` (:27-31 `PublishLinkedModels`)
- Modify: `SentinelAddin/UI/SettingsDialog.xaml` (:41-43 the checkbox), `SentinelAddin/UI/SettingsDialog.xaml.cs` (:28-29, :147-148, :156-159, :180-182)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (master numbering; Task 1 edits `Propose` :135-175 and may shift what follows — match the text: :19-22 the class summary's `FileVersion` sentence; :64-92 `ModelPublished` + `FileVersion`; :177-204 `RegisterVersionId`; :294-316 `Post`)
- Modify: `SentinelAddin/Coordination/GovernedQuery.cs` (:10-16 the class summary; :34-84 `LiveInfo` + `LiveVersion`)
- Modify: `SentinelAddin/UI/SentinelPanelViewModel.cs` (:114-115 after `NextLine`; :123-147 `RefreshJourney`; :156-157 `ShowUnbound`'s clear; :172-173 `ShowLoading`'s clear)
- Modify: `SentinelAddin/UI/SentinelPanel.xaml` (:14, the strip's lines)
- Harness: `tools/artefact-cache-check` compiles `GovernedQuery.cs` (csproj :18-19) and its `Check.cs:58-93` uses `JourneyInfo` and `ScanRulesetLine` only — no edit; it is run to prove the file still compiles without `LiveVersion`. `tools/project-context-check/Check.cs:15` keeps `publish_linked_models` in its fixture: that is now "an old payload's key", which `ProjectContext.FromSettingsJson` never read — no edit.
- Read for reference: spec Decisions 2 and 8, Behaviour changes ("Auto-publish goes from on-for-everyone to off until a lead installs `publish@n {auto: true}`"; "Linked-model publishing stops until links can be judged"); `SentinelAddin/Engine/Publisher.cs` as Task 1 leaves it (`AutoOn`, `PublishLines.Policy`, `PublishLines.Doctor`); `SentinelAddin/Coordination/ArtefactClient.cs:44-50` (`Resolve(key, kind, timeout)`), `:111-117` (404 not_installed → `None(kind, "not installed for <key> or its office")`, `NotInstalled = true`) and `:154-155` (`None`); `SentinelAddin/RevitEventHub.cs:19-23` (`Enqueue` raises the ExternalEvent; the job runs on the API thread) and `:45-51` (a job's exception is logged, never thrown into Revit); `SentinelAddin/App.cs:141-166` (`ReloadSeq`: a `Dictionary<Document, …>` on the API thread, `doc.IsValidObject` and the rebound-meanwhile guard inside the job — the idioms this task repeats), `:196-239` (`OnSynchronized`: `Trigger` at :215; the `Task.Run(...).ContinueWith(t => ui.BeginInvoke(...))` idiom at :229-236) and `:244-250` (`RefreshJourney` hands the key and the ruleset source to the pane — unchanged: the pane does the extra GET); `SentinelAddin/UI/SentinelPanelViewModel.cs:94-99` (`LogDoctor` → `OnUi`), `:118-121` (`JourneySeq`), `:213-218` (`OnUi`: the pane's dispatcher); `SentinelAddin/UI/SentinelPanel.xaml.cs:33-37` (↻ → `App.RefreshJourney`, so the policy line refreshes with the journey); `SentinelAddin/Commands.IfcGate.cs:95-96` (the other `ExportToDir` caller — untouched); `SentinelAddin/Commands.PublishSheets.cs:7-11` and `Commands.PublishViews.cs:12-17` (images under `%AppData%\Sentinel\sheets|views\<model>\` — keyed by model name, not by the web project: what the pulldown's tooltip now says); `WebApp/bridge/watch-outbox.mjs:5-7` (the watcher reads the sidecar only: a sidecar with no `version_id` is the pre-5b path Task 4 removes — the reason `WriteOutboxMeta`, which writes `{project, docTitle}`, goes with the link exporter).

**Interfaces:**
- Consumes (Task 1, `Sentinel.Engine`): `Publisher.Prepare` / `Judge` / `Stage` as Task 2 states them; `Publisher.AutoOn(ResolvedArtefact policy)` → `bool`: true only for a bridge or cached body that is exactly `{auto: true}` (none, a not_installed none, a body without `auto`, `auto: false`, a body that does not parse → false); `PublishLines.Policy(ResolvedArtefact policy)` → "Auto-publish: on · publish@1 · office · 3f9a0c1d2e4b…" (the label, with " (cached HH:mm)" when it is) or "Auto-publish: off — publish: none — not installed for <key> or its office" / "Auto-publish: off — publish@1 · office · 3f9a… says auto: false" / "Auto-publish: off — publish: none — <the none reason>"; `PublishLines.Doctor(PublishPlan plan, PublishOutcome outcome, StageResult stage)` → one line: accepted/recorded and staged "Auto-published <container> <revision> · wip · ledger #<verdict_audit_id> · receipt <16 hex>…" (with "— not judged: nothing in the IDS's scope (<ids label>)" or "— not judged: no IDS installed for <key> or its office" on recorded), rejected "Auto-publish rejected — nothing uploaded — <n> failure(s) · IDS <label> · ledger #<audit_id> · receipt …", a gate FAIL "Auto-publish rejected — nothing uploaded — delivery gate FAIL · <n> failure(s) · <contract label> · gate row <LedgerLine>", not reached "Auto-publish: not judged — nothing uploaded — <reason>", staged with no version "Auto-published <container> — version not confirmed — <reason>" (never "ledger #" without an id and a hash).
- Consumes (master): `ProjectContext.For`, `ArtefactClient.Resolve` / `None`, `PlatformExporter.OutboxDir`, `RevitEventHub.Enqueue`, `SentinelPanelViewModel.LogDoctor`, `GovernedQuery.Journey` / `ScanRulesetLine`.
- Produces:
  - `Sentinel.Engine.AutoPublish` (static): `Trigger(Document? doc)` (API thread, from `App.OnSaved` / `App.OnSynchronized`, unchanged callers) — never blocks the handler: null, family, in-flight, no hub or no pane → return; one run per document per 15 s (`Dictionary<Document, DateTime>`, API thread only) → return; unbound → return (silent, as on master); else `Task.Run(() => ArtefactClient.Resolve(key, "publish"))` → off (`!Publisher.AutoOn`) → one Doctor line `PublishLines.Policy(policy)` per document per session through `BeginInvoke` on the pane's dispatcher, nothing exported; on → `App.Events.Enqueue(Run)`. `Run` (a hub job, API thread): closed, rebound or in flight meanwhile → return; `_busy = true`; `Publisher.Prepare` (a throw is caught: "Auto-publish: nothing exported — <message>"); null → the Doctor line "Auto-publish: nothing exported — <failure>"; else `Task.Run(() => Publisher.Judge(plan))` and, back through the hub, `Publisher.Stage(plan, outcome, PlatformExporter.OutboxDir())` and `LogDoctor(PublishLines.Doctor(plan, outcome, stage))`, `_busy = false` in a `finally`. `InFlight` (from Task 2) stays. No `Enabled`, no `LastStatus`, no inline `RunNow`.
  - `SentinelPanelViewModel.PublishLine` (string, bindable): the fourth strip line, `PublishLines.Policy(ArtefactClient.Resolve(projectKey, "publish"))`, read on a task beside the journey GET (`Task.WhenAll`, so a dead bridge costs 4 s, not 8), set on the pane's thread, cleared by `ShowUnbound`, `ShowLoading` and every refresh, and dropped when a newer refresh has started (`JourneySeq`). `RefreshJourney(string projectKey, ResolvedArtefact local)`'s signature is unchanged; `App.RefreshJourney` is unchanged.
  - The Publish pulldown holds Publish Sheets and Publish Views only; its tooltip and theirs say they are keyed by model name under `%AppData%`, outside the governed IFC path.
  - Gone: `PlatformExporter.ExportToOutbox`, `WriteOutboxMeta`, `ExportLinksToOutbox`, `IsOpenedForExport`, `Sanitize` (the outbox's only writer is `Publisher.Stage`, sidecar first); `SentinelSettings.PublishLinkedModels` (an old payload's `publish_linked_models` is ignored on read and dropped by the next save — `System.Text.Json` ignores unknown members) and the Project Setup checkbox; `GovernedNotify.FileVersion`, `ModelPublished`, `RegisterVersionId` and the fire-and-forget `Post`; `GovernedQuery.LiveInfo` / `LiveVersion`; `ToggleAutoPublishCommand`; `PublishToPlatformCommand`.

- [ ] **Step 1: `AutoPublish.cs` — the same three calls, no dialog, no switch**

Replace the whole of `SentinelAddin/Engine/AutoPublish.cs` with:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// Auto-publish on save and sync (cohesion phase 5b, spec Decisions 2 and 8): the same governed pipeline as
/// Governed Publish — <see cref="Publisher"/>: the whole model exported in the contract's schema, the delivery gate
/// and its ledger row, one /propose that registers the version with its verdict, the sidecar-first stage — run
/// without a dialog, and ONLY when the project's <c>publish@n</c> says <c>{auto: true}</c>. There is no switch in
/// Revit: none installed, a cached none, <c>auto: false</c> or a body that does not parse all mean off, and the
/// Doctor log says so once per document per session, naming the policy ("Auto-publish: off — publish: none — not
/// installed for &lt;key&gt; or its office"). A rejected run uploads nothing and logs its line; so does a gate FAIL.
///
/// Threading: the save/sync handler reads the key (Extensible Storage: API thread) and returns at once; the policy
/// GET (≤ 4 s) runs on a task; Prepare (export, gate, extraction — Revit API, plus the contract GET and the gate row,
/// ≤ 4 s + ≤ 6 s) runs in a later <see cref="RevitEventHub"/> job; Judge (the 120 s /propose) runs on a task; Stage
/// and the Doctor line land back through the hub. One run per document per 15 s, single-flighted: a save that
/// lands while a run is in flight is skipped, silently — a save is not the place for a dialog.
/// </summary>
public static class AutoPublish
{
    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(15);
    // API thread only: the handlers, the hub's jobs and the pane's dispatcher are all Revit's main thread.
    private static readonly Dictionary<Document, DateTime> LastRun = new();
    private static readonly HashSet<Document> SaidOff = new();
    private static bool _busy;

    /// <summary>True from Prepare to Stage of one run. Governed Publish refuses to start meanwhile: both would write
    /// the same temp and outbox names.</summary>
    internal static bool InFlight => _busy;

    /// <summary>Called from App.OnSaved / App.OnSynchronized (API thread). Never blocks: what can wait on the bridge
    /// runs on a task, what needs Revit runs in a later hub job.</summary>
    public static void Trigger(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || _busy || App.Events is not { } events || App.PanelVm is not { } vm) return;
        var now = DateTime.UtcNow;
        if (LastRun.TryGetValue(doc, out var last) && now - last < MinInterval) return;
        LastRun[doc] = now;
        Prune();
        var key = ProjectContext.For(doc).Key;
        if (key.Length == 0) return; // unbound: nothing to publish into

        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => ArtefactClient.Resolve(key, "publish")).ContinueWith(t =>
        {
            var policy = t.Status == TaskStatus.RanToCompletion ? t.Result
                : ArtefactClient.None("publish", "the policy read did not finish (" + (t.Exception?.GetBaseException().Message ?? "unknown") + ")");
            if (!Publisher.AutoOn(policy))
            {
                // Once per document per session: saves are frequent, the reason is not. On the pane's thread (BeginInvoke,
                // never Invoke from a worker), which is the API thread that owns SaidOff.
                ui.BeginInvoke(new Action(() =>
                {
                    if (doc.IsValidObject && SaidOff.Add(doc)) vm.LogDoctor(PublishLines.Policy(policy));
                }));
                return;
            }
            events.Enqueue(_ => Run(doc, key, events, vm));
        }, TaskScheduler.Default);
    }

    // A hub job (API thread): Prepare here, Judge on a task, Stage and the line back through the hub.
    private static void Run(Document doc, string key, RevitEventHub events, UI.SentinelPanelViewModel vm)
    {
        if (_busy || !doc.IsValidObject || ProjectContext.For(doc).Key != key) return; // in flight, closed or rebound meanwhile
        _busy = true;
        PublishPlan? plan;
        string? failure;
        try
        {
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "governed"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout), out failure);
        }
        catch (Exception ex) { plan = null; failure = ex.Message; } // never let a background export crash Revit
        if (plan is null)
        {
            _busy = false;
            vm.LogDoctor("Auto-publish: nothing exported — " + failure);
            return;
        }
        Task.Run(() => Publisher.Judge(plan)).ContinueWith(t => events.Enqueue(_ =>
        {
            try
            {
                if (t.Status != TaskStatus.RanToCompletion)
                {
                    TryDelete(plan.TempIfcPath);
                    vm.LogDoctor("Auto-publish: not judged — nothing uploaded — " + (t.Exception?.GetBaseException().Message ?? "the verdict call did not finish"));
                    return;
                }
                var stage = Publisher.Stage(plan, t.Result, PlatformExporter.OutboxDir());
                vm.LogDoctor(PublishLines.Doctor(plan, t.Result, stage));
            }
            finally { _busy = false; }
        }), TaskScheduler.Default);
    }

    // Closed documents leave the maps (API thread).
    private static void Prune()
    {
        foreach (var d in LastRun.Keys.Where(d => !d.IsValidObject).ToList()) { LastRun.Remove(d); SaidOff.Remove(d); }
    }

    private static void TryDelete(string path) { try { File.Delete(path); } catch { /* best-effort */ } }
}
```

(`Where`/`ToList` come from the net48 global `System.Linq` using in `Sentinel.csproj:66` and net8's implicit usings; `UI.SentinelPanelViewModel` resolves through the parent namespace `Sentinel`.)

- [ ] **Step 2: `App.cs` — no link guard, the save comment, the Publish pulldown**

Replace (in `SentinelAddin/App.cs`, lines 126-129):

```csharp
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        // A linked model Sentinel opens itself to export it is never loaded, scanned or judged.
        if (PlatformExporter.IsOpenedForExport(doc.PathName)) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
```

with:

```csharp
        if (e.Document is not { IsFamilyDocument: false } doc) return;
        SentinelUpdater.RegisterFor(doc, Engine!, PanelVm!);
```

Replace (in `SentinelAddin/App.cs`, lines 252-253):

```csharp
    // Local save (non-workshared, or a local save before sync) → push the latest model to the web.
    private static void OnSaved(object? sender, DocumentSavedEventArgs e)
```

with:

```csharp
    // Local save (non-workshared, or a local save before sync) → auto-publish, when the project's publish@n says so.
    private static void OnSaved(object? sender, DocumentSavedEventArgs e)
```

Replace (in `SentinelAddin/App.cs`, line 307):

```csharp
        // ── Publish — governed delivery (flagship) + ungoverned options ──────────────────────
```

with:

```csharp
        // ── Publish — the one governed path (auto-publish is the project's publish@n, not a button) + sheets and views ──
```

Replace (in `SentinelAddin/App.cs`, lines 311-320):

```csharp
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
            "Ungoverned publishing: quick publish, auto-publish on save, and sheet rendering. Prefer Governed Publish for delivery.");
        Sub(pub, "Sentinel_QuickPublish", "Quick Publish (ungoverned)", "Sentinel.Commands.PublishToPlatformCommand", "publish",
            "Export the active view to IFC into the Sentinel outbox; the Bridge uploads it to That Open Platform. No verdict — prefer Governed Publish.");
        Sub(pub, "Sentinel_AutoPublish", "Auto-Publish on save", "Sentinel.Commands.ToggleAutoPublishCommand", "autopublish",
            "Toggle push-on-save: when ON, every save/sync re-exports the model and the Bridge uploads it. Throttled; turn off for very large models.");
        Sub(pub, "Sentinel_PublishSheets", "Publish Sheets", "Sentinel.Commands.PublishSheetsCommand", "sheets",
            "Render all Revit sheets to PNG (sheets never survive IFC export). The Bridge serves them to the web app's Sheets tab.");
        Sub(pub, "Sentinel_PublishViews", "Publish Views", "Sentinel.Commands.PublishViewsCommand", "views",
            "Choose which views (plans, sections, elevations, 3D, drafting) to publish. Only checked views appear in the web app's Views tab.");
```

with:

```csharp
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
            "Sheets and views for the web app's Sheets and Views tabs — images keyed by model name under %AppData%, outside the governed IFC path (no version, no verdict). The model itself publishes only through Governed Publish, or on save when the project's publish@n says auto: true (the pane's strip names it).");
        Sub(pub, "Sentinel_PublishSheets", "Publish Sheets", "Sentinel.Commands.PublishSheetsCommand", "sheets",
            "Render all Revit sheets to PNG (sheets never survive IFC export). The Bridge serves them to the web app's Sheets tab. Keyed by model name under %AppData%, not by the web project — outside the governed IFC path.");
        Sub(pub, "Sentinel_PublishViews", "Publish Views", "Sentinel.Commands.PublishViewsCommand", "views",
            "Choose which views (plans, sections, elevations, 3D, drafting) to publish. Only checked views appear in the web app's Views tab. Keyed by model name under %AppData%, not by the web project — outside the governed IFC path.");
```

- [ ] **Step 3: the toggle and Quick Publish go**

```bash
git rm SentinelAddin/Commands.AutoPublish.cs SentinelAddin/Commands.PublishToPlatform.cs
```

(`Sentinel.csproj` globs `*.cs`; nothing else names the two classes — the ribbon items went in Step 2, and `Sentinel.addin` names only `Sentinel.App`.)

- [ ] **Step 4: `PlatformExporter.cs` — the export primitive stays, the outbox writers go**

Replace (in `SentinelAddin/Engine/PlatformExporter.cs`, lines 9-26):

```csharp
/// <summary>
/// The silent, reusable "export the model to the Sentinel outbox" step, shared by the manual
/// Publish-to-Platform command and the automatic push-on-save service (<see cref="AutoPublish"/>).
/// Writes an IFC into %AppData%\Sentinel\outbox, which the Node Bridge watches and uploads to That Open
/// Platform. No dialogs here — callers decide how (or whether) to surface the result, so the same code
/// path serves both an interactive command and a background save hook.
/// </summary>
public static class PlatformExporter
{
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    // Paths of the linked models this exporter is opening right now. Revit raises DocumentOpened inside
    // OpenDocumentFile, and App.OnDocumentOpened skips these: a link export never loads, scans or judges anything.
    // API thread only (OpenDocumentFile is), so no lock.
    private static readonly HashSet<string> OpeningForExport = new(StringComparer.OrdinalIgnoreCase);
    public static bool IsOpenedForExport(string? path) => !string.IsNullOrEmpty(path) && OpeningForExport.Contains(path!);

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
```

with:

```csharp
/// <summary>
/// The silent IFC export primitive (<see cref="ExportToDir"/>) behind <see cref="Publisher"/> (Governed Publish and
/// auto-publish) and the IFC Delivery Gate, plus the outbox the Bridge watches. Nothing here writes into the outbox:
/// since cohesion phase 5b the only writer is Publisher.Stage, after a verdict, sidecar first. No dialogs here —
/// callers decide how (or whether) to surface the result.
/// </summary>
public static class PlatformExporter
{
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
```

Delete (in `SentinelAddin/Engine/PlatformExporter.cs`) lines 48-182 — the three methods whose first and last lines are:

```csharp
    /// <summary>
    /// Export <paramref name="doc"/> to IFC in the outbox. When <paramref name="filterViewId"/> is a valid
```

through

```csharp
        Log($"links done: {done} exported, {skipped} skipped");
        return (done, skipped);
    }

```

— that is `ExportToOutbox` (:48-75), `WriteOutboxMeta` (:77-102) and `ExportLinksToOutbox` (:104-181) with the blank line after each. What remains between `Log` (:36-46) and `ExportToDir` is one blank line. Then replace (lines 183-190 on master):

```csharp
    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/>. This is the shared export
    /// primitive behind <see cref="ExportToOutbox"/>, the Governed Publish command and the IFC Delivery Gate. Governed
    /// Publish exports to a temp dir first so it can publish ONLY on a passing verdict.
    /// <paramref name="ifcSchema"/> is the delivery contract's <c>ifc_schema</c>: "IFC4" exports IFC4 Reference View,
    /// anything else exports IFC 2x3 CV2. The outbox, link and Auto/Quick Publish exports keep the IFC 2x3 default.
    /// Same view-filter + transaction idiom. Never throws; returns a result.
    /// </summary>
```

with:

```csharp
    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/>. This is the shared export
    /// primitive behind <see cref="Publisher"/> (which exports to a temp dir first, so it can stage ONLY on a verdict)
    /// and the IFC Delivery Gate. <paramref name="ifcSchema"/> is the delivery contract's <c>ifc_schema</c>: "IFC4"
    /// exports IFC4 Reference View, anything else exports IFC 2x3 CV2. Same view-filter + transaction idiom. Never
    /// throws; returns a result.
    /// </summary>
```

Replace (in `SentinelAddin/Engine/PlatformExporter.cs`, lines 245-253 on master — the file's tail):

```csharp
        return first;
    }

    private static string Sanitize(string s)
    {
        foreach (char ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }
}
```

with:

```csharp
        return first;
    }
}
```

(`Log` at :36-46 stays: `Publisher` may append to `publish.log`, and it is public. `OutboxDir`, `ExportToDir`, `Inspect` and `Default3DView` are unchanged.)

- [ ] **Step 5: the Project Setup checkbox goes with its setting**

Replace (in `SentinelAddin/Engine/SettingsManager.cs`, lines 27-31):

```csharp
    // Quick/Auto publish: also export each linked Revit model as its own IFC (Revit's ExportLinkedFiles).
    // Off by default — links multiply export time, and Governed Publish stays host-only (the gate
    // certifies one deliverable at a time).
    [JsonPropertyName("publish_linked_models")] public bool PublishLinkedModels { get; set; } = false;

```

with:

```csharp
    // Linked-model publishing was deleted in cohesion phase 5b: links are never judged, so they are not published. An
    // old payload's publish_linked_models is ignored on read and dropped by the next save.

```

Delete (in `SentinelAddin/UI/SettingsDialog.xaml`, lines 41-43):

```xml
            <CheckBox x:Name="LinkedModelsBox" FontSize="12" Margin="0,0,0,14"
                      Content="Include linked models when publishing (each link exports as its own IFC — Quick/Auto publish)"/>

```

Replace (in `SentinelAddin/UI/SettingsDialog.xaml.cs`, lines 28-29):

```csharp
        WebProjectBox.Text = ProjectContext.For(doc).Key;
        LinkedModelsBox.IsChecked = _current.PublishLinkedModels;
```

with:

```csharp
        WebProjectBox.Text = ProjectContext.For(doc).Key;
```

Replace (in `SentinelAddin/UI/SettingsDialog.xaml.cs`, lines 147-148):

```csharp
        var webProject = WebProjectKey();
        var linkedModels = LinkedModelsBox.IsChecked == true;
```

with:

```csharp
        var webProject = WebProjectKey();
```

Replace (in `SentinelAddin/UI/SettingsDialog.xaml.cs`, lines 157-159):

```csharp
            settings.GhostSourceFolder = ghostFolder;
            settings.PublishLinkedModels = linkedModels; // no WebProjectKey or ProjectCode: both are document facts
            SettingsManager.SaveToMachine(settings);
```

with:

```csharp
            settings.GhostSourceFolder = ghostFolder; // no WebProjectKey or ProjectCode: both are document facts
            SettingsManager.SaveToMachine(settings);
```

Replace (in `SentinelAddin/UI/SettingsDialog.xaml.cs`, lines 180-182):

```csharp
            settings.WebProjectKey = webProject;
            settings.PublishLinkedModels = linkedModels;
            using var t = new Transaction(doc, "Sentinel: Save project settings");
```

with:

```csharp
            settings.WebProjectKey = webProject;
            using var t = new Transaction(doc, "Sentinel: Save project settings");
```

- [ ] **Step 6: `GovernedNotify` — the version is registered by `/propose` alone**

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 19-22 — match the text; Task 1's `register` edit sits lower in the file):

```csharp
    /// then print <see cref="LedgerLine"/> on their own thread. Nothing here throws; only <see cref="FileVersion"/>'s
    /// not-bound Doctor line touches UI, on the caller's thread. The bridge comes from <see cref="BcfConfig"/>
    /// (ServiceUrl + ServiceToken); the project is ALWAYS the caller's document key (ProjectContext) — there is
    /// no machine default, and an empty key records nothing and says so.
```

with:

```csharp
    /// then print <see cref="LedgerLine"/> on their own thread. Nothing here throws and nothing here touches UI. The
    /// bridge comes from <see cref="BcfConfig"/> (ServiceUrl + ServiceToken); the project is ALWAYS the caller's
    /// document key (ProjectContext) — there is no machine default, and an empty key records nothing and says so.
    /// A version is registered only by <see cref="Propose"/>'s <c>register</c> (one call judges, registers and stamps).
```

Delete (in `SentinelAddin/Coordination/GovernedNotify.cs`, master lines 64-92, `ModelPublished` and `FileVersion` with the blank line after each):

```csharp
        /// <summary>Record a "model published from Revit" event on the ledger (AutoPublish continues on the task and
        /// logs the line).</summary>
        public static LedgerResult ModelPublished(string modelName, long bytes, string projectKey) =>
            Event("/audit", new
            {
                entity_type = "model",
                actor = "Revit",
                action = "Model published from Revit: " + modelName,
                new_value = new { model = modelName, kb = bytes / 1024, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);

        /// <summary>
        /// Register a Revit publish as a new version in the web app's file-version history (migration 0011,
        /// <c>POST /cde/:key/files</c>). The model's title is the file key, so repeated publishes append
        /// v1 → v2 → … and the newest becomes the live version — the same version timeline a web upload feeds.
        /// Fire-and-forget; a bridge without the CDE configured just no-ops (503).
        /// </summary>
        public static void FileVersion(string modelName, long bytes, string projectKey)
        {
            var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
            Post("/files", new
            {
                name,
                author = "Revit",
                size_bytes = bytes,
                notes = "published from Revit",
            }, projectKey);
        }

```

Delete (in `SentinelAddin/Coordination/GovernedNotify.cs`, master lines 177-204, `RegisterVersionId` with the blank line after it):

```csharp
        /// <summary>
        /// Register a Revit publish as a new file version and return its id (or null if unreachable) — the
        /// blocking counterpart to <see cref="FileVersion"/>, used by Governed Publish so it can stamp the
        /// verdict badge onto the exact version it just created. <c>POST /cde/:key/files</c> → the new version's id.
        /// </summary>
        public static string? RegisterVersionId(string modelName, long bytes, string author, string projectKey, string? notes = null)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return null;
            try
            {
                var name = modelName.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelName : modelName + ".ifc";
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/files";
                var body = new { name, author, size_bytes = bytes, notes = notes ?? "published from Revit (Governed Publish)" };
                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) return null;

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("version", out var ver) && ver.TryGetProperty("id", out var id))
                    return id.GetString();
            }
            catch { /* unreachable */ }
            return null;
        }

```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, master lines 291-318 — the file's tail: `Post`, whose only caller was `FileVersion`):

```csharp
            catch (Exception e) { return LedgerResult.NotRecorded("the scan report could not be written (" + e.Message + ")"); }
        }

        /// <summary>POST a governed event to <c>{ServiceUrl}/cde/{key}{path}</c>; fire-and-forget, never throws.
        /// An empty key posts nothing and says so in the Doctor log — never a silent "default".</summary>
        private static void Post(string path, object payload, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0)
            {
                App.PanelVm?.LogDoctor($"Not recorded on the web ({path.TrimStart('/')}): {NotBoundError}.");
                return;
            }
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + path;
                var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                var msg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                // observe the task's exception so a failed POST never surfaces as an unobserved exception
                _ = Http.SendAsync(msg).ContinueWith(t => { _ = t.Exception; msg.Dispose(); }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }
    }
}
```

with:

```csharp
            catch (Exception e) { return LedgerResult.NotRecorded("the scan report could not be written (" + e.Message + ")"); }
        }
    }
}
```

(`Http` at :26 stays — nothing else uses it after `Post` goes, but it is a private static field, so no warning; `GovHttp`, `Send`, `KeyOf` and `NotBoundError` are used by `Propose`, `OfficeSnapshot` and `InstallArtefact`.)

- [ ] **Step 7: `GovernedQuery` — no read of a version by name**

Replace (in `SentinelAddin/Coordination/GovernedQuery.cs`, lines 10-16):

```csharp
    /// <summary>
    /// Read side of the governed layer: a short, blocking GET the Revit UI can call to learn a model's current
    /// state in the web CDE before it acts (e.g. show "this model is at v3 · published" before a publish adds
    /// v4). The counterpart to the fire-and-forget <see cref="GovernedNotify"/>. NEVER throws — any failure
    /// (bridge down, CDE not configured, model not yet versioned) returns null and the caller just omits the
    /// governance line. Uses the same <see cref="BcfConfig"/>, so it's zero extra configuration.
    /// </summary>
```

with:

```csharp
    /// <summary>
    /// Read side of the governed layer: short, blocking GETs the Revit UI calls to learn what the web project says
    /// (the journey, the Federation Gate, the clash register). The counterpart to <see cref="GovernedNotify"/>.
    /// NEVER throws — any failure (bridge down, CDE not configured) returns null and the caller says so. Uses the
    /// same <see cref="BcfConfig"/>, so it's zero extra configuration. A publish's version comes back from
    /// /propose itself (ProposalResult.Version); nothing here reads it by name.
    /// </summary>
```

Delete (in `SentinelAddin/Coordination/GovernedQuery.cs`, lines 34-84, `LiveInfo` and `LiveVersion` with the blank line after each):

```csharp
        /// <summary>The live version of a model file in the web CDE, or null if unknown/unreachable.</summary>
        public sealed class LiveInfo
        {
            public string Revision = "";
            public string State = "";
            public int VersionCount;
        }

        /// <summary>
        /// Look up the live file version + ISO 19650 state for <paramref name="modelTitle"/> (matched to the
        /// same "&lt;title&gt;.ifc" key <see cref="GovernedNotify.FileVersion"/> writes). Blocking, ~4s cap,
        /// returns null on any problem, and for an empty (unbound) key.
        /// </summary>
        public static LiveInfo? LiveVersion(string modelTitle, string projectKey)
        {
            var key = (projectKey ?? "").Trim();
            if (key.Length == 0) return null;
            try
            {
                var cfg = BcfConfig.Load();
                var name = modelTitle.EndsWith(".ifc", StringComparison.OrdinalIgnoreCase) ? modelTitle : modelTitle + ".ifc";
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/files";
                var json = GetString(url, cfg.ServiceToken);

                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) return null;
                foreach (var file in doc.RootElement.EnumerateArray())
                {
                    if (!file.TryGetProperty("iso_name", out var iso) || !string.Equals(iso.GetString(), name, StringComparison.OrdinalIgnoreCase))
                        continue;
                    var count = file.TryGetProperty("version_count", out var vc) && vc.TryGetInt32(out var n) ? n : 0;
                    if (!file.TryGetProperty("versions", out var versions) || versions.ValueKind != JsonValueKind.Array) return null;
                    foreach (var v in versions.EnumerateArray())
                    {
                        if (v.TryGetProperty("is_live", out var live) && live.ValueKind == JsonValueKind.True)
                        {
                            return new LiveInfo
                            {
                                Revision = v.TryGetProperty("revision", out var r) ? r.GetString() ?? "" : "",
                                State = v.TryGetProperty("state", out var s) ? s.GetString() ?? "" : "",
                                VersionCount = count,
                            };
                        }
                    }
                    return null; // file exists but no live version
                }
                return null; // not versioned yet
            }
            catch { return null; } // never surface a read failure into Revit
        }

```

(`GetString` at :24-32 stays: `FederationStatus` and `ClashRegister` call it.)

- [ ] **Step 8: the pane's fourth line — the policy, read like the journey**

Replace (in `SentinelAddin/UI/SentinelPanelViewModel.cs`, lines 114-115):

```csharp
    private string _nextLine = "";
    public string NextLine { get => _nextLine; private set { _nextLine = value; OnChanged(); } }
```

with:

```csharp
    private string _nextLine = "";
    public string NextLine { get => _nextLine; private set { _nextLine = value; OnChanged(); } }
    private string _publishLine = "";
    /// "Auto-publish: on · publish@1 · office · 3f9a0c1d2e4b…" or "Auto-publish: off — publish: none — …": the
    /// project's publish@n, read like the journey and decided the way AutoPublish decides it (Publisher.AutoOn).
    public string PublishLine { get => _publishLine; private set { _publishLine = value; OnChanged(); } }
```

Replace (in `SentinelAddin/UI/SentinelPanelViewModel.cs`, lines 123-147):

```csharp
    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with what was read there: the
    /// document's web key and where the ruleset that judged the rows came from. The GET (up to 4 s) runs on a
    /// background task; the result is set back on the pane's thread. A newer refresh wins over a slower older
    /// one; a failure clears the strip and says so — never stale data.
    public void RefreshJourney(string projectKey, ResolvedArtefact local)
    {
        var seq = ++_journeySeq;
        OnUi(() =>
        {
            // Like the web strip: while loading, no line from the previous document or ruleset stays up.
            JourneyKey = $"Journey · {projectKey} — loading…";
            StandardsLine = NextLine = ScanRulesetLine = "";
        });
        // Same dispatcher OnUi uses: the pane's (WPF application) dispatcher when there is one.
        var ui = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => { var info = GovernedQuery.Journey(projectKey, out var why); return (info, why); }).ContinueWith(t => ui.BeginInvoke(new Action(() =>
        {
            if (seq != _journeySeq) return;
            var (j, why) = t.Status == TaskStatus.RanToCompletion ? t.Result : (null, t.Exception?.GetBaseException().Message);
            JourneyKey = j is null ? $"Journey · {projectKey}" : $"Journey · {j.Key} ({j.Kind})";
            StandardsLine = j?.StandardsLine ?? "";
            NextLine = j?.NextLine ?? $"Journey unavailable — {why ?? "the bridge did not answer for this project"}";
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(local, j);
        })));
    }
```

with:

```csharp
    /// Called on the Revit API thread (Revit's main thread, which owns this pane) with what was read there: the
    /// document's web key and where the ruleset that judged the rows came from. The two GETs (the journey and the
    /// project's publish@n, up to 4 s each, side by side) run on background tasks; the result is set back on the
    /// pane's thread. A newer refresh wins over a slower older one; a failure clears the strip and says so — never
    /// stale data.
    public void RefreshJourney(string projectKey, ResolvedArtefact local)
    {
        var seq = ++_journeySeq;
        OnUi(() =>
        {
            // Like the web strip: while loading, no line from the previous document or ruleset stays up.
            JourneyKey = $"Journey · {projectKey} — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
        });
        // Same dispatcher OnUi uses: the pane's (WPF application) dispatcher when there is one.
        var ui = Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        var journey = Task.Run(() => { var info = GovernedQuery.Journey(projectKey, out var why); return (info, why); });
        var policy = Task.Run(() => ArtefactClient.Resolve(projectKey, "publish"));
        Task.WhenAll(journey, policy).ContinueWith(_ => ui.BeginInvoke(new Action(() =>
        {
            if (seq != _journeySeq) return;
            var (j, why) = journey.Status == TaskStatus.RanToCompletion ? journey.Result : (null, journey.Exception?.GetBaseException().Message);
            JourneyKey = j is null ? $"Journey · {projectKey}" : $"Journey · {j.Key} ({j.Kind})";
            StandardsLine = j?.StandardsLine ?? "";
            NextLine = j?.NextLine ?? $"Journey unavailable — {why ?? "the bridge did not answer for this project"}";
            PublishLine = PublishLines.Policy(policy.Status == TaskStatus.RanToCompletion ? policy.Result
                : ArtefactClient.None("publish", "the policy read did not finish (" + (policy.Exception?.GetBaseException().Message ?? "unknown") + ")"));
            ScanRulesetLine = GovernedQuery.ScanRulesetLine(local, j);
        })));
    }
```

Replace (in `SentinelAddin/UI/SentinelPanelViewModel.cs`, lines 156-157):

```csharp
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = ScanRulesetLine = "";
```

with:

```csharp
            JourneyKey = "Journey — not bound — Sentinel ▸ Project Setup";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
```

Replace (in `SentinelAddin/UI/SentinelPanelViewModel.cs`, lines 172-173):

```csharp
            JourneyKey = "Journey — loading…";
            StandardsLine = NextLine = ScanRulesetLine = "";
```

with:

```csharp
            JourneyKey = "Journey — loading…";
            StandardsLine = NextLine = PublishLine = ScanRulesetLine = "";
```

Replace (in `SentinelAddin/UI/SentinelPanel.xaml`, line 14):

```xml
                    <TextBlock Text="{Binding NextLine}" FontSize="11" TextWrapping="Wrap"/>
```

with:

```xml
                    <TextBlock Text="{Binding NextLine}" FontSize="11" TextWrapping="Wrap"/>
                    <TextBlock Text="{Binding PublishLine}" FontSize="11" TextWrapping="Wrap"/>
```

- [ ] **Step 9: Both builds, the harnesses, and the names that must be gone**

Run:

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `0 Error(s)`; `6 Warning(s)` on 2024 and `3 Warning(s)` on 2025 — the same set as Task 2 (measured: these edits, with a stub of the pinned `Publisher`, build with exactly master's warnings on both targets).

Run: `dotnet run --project tools/artefact-cache-check` → `53/53 checks pass` (it compiles `GovernedQuery.cs` without `LiveVersion`); `dotnet run --project tools/gate-check` → `123/123 checks pass`; `dotnet run --project tools/event-check` → `44/44 checks pass`; `dotnet run --project tools/project-context-check` → `19/19 checks pass`; `dotnet run --project tools/publish-check` → the total Task 1 states.

Run (repo root):

```bash
git grep -n -E "upload-ifc|Quick Publish|ToggleAutoPublish|PublishToPlatformCommand|ExportLinksToOutbox|IsOpenedForExport|PublishLinkedModels|LinkedModelsBox|LiveVersion|RegisterVersionId|ModelPublished|FileVersion\(|AutoPublish\.Enabled|LastStatus|ExportToOutbox|WriteOutboxMeta" -- SentinelAddin tools
```

Expected: nothing (master: 45 hits). `FileVersion\(` with the paren excludes `IFCExportOptions.FileVersion =` in `PlatformExporter.ExportToDir`, which stays.

- [ ] **Step 10: Commit**

```bash
git add SentinelAddin/Engine/AutoPublish.cs SentinelAddin/App.cs SentinelAddin/Engine/PlatformExporter.cs SentinelAddin/Engine/SettingsManager.cs SentinelAddin/UI/SettingsDialog.xaml SentinelAddin/UI/SettingsDialog.xaml.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/UI/SentinelPanelViewModel.cs SentinelAddin/UI/SentinelPanel.xaml
git commit -m "feat(revit): auto-publish runs the one Publisher path with no switch — on save and sync the project's publish@n is read off-thread and only {auto: true} runs Prepare (a hub job), Judge (a task) and Stage (a hub job), never blocking the handler; a project without it exports nothing and the Doctor log names the policy once per document ('Auto-publish: off — publish: none — not installed for <key> or its office'); a rejected run uploads nothing and logs its line; the pane's strip gains 'Auto-publish: on · publish@1 · office · …' read beside the journey; deleted: the Auto-Publish toggle and Quick Publish with their ribbon items, linked-model publishing (ExportLinksToOutbox, IsOpenedForExport, PublishLinkedModels and the Project Setup checkbox), the pre-5b outbox writers (ExportToOutbox, WriteOutboxMeta), GovernedNotify.FileVersion/ModelPublished/RegisterVersionId/Post and GovernedQuery.LiveVersion; the Publish pulldown keeps Sheets and Views and says they are keyed by model name, outside the governed path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

**Interfaces:** replace the "Consumes (Task 1, `Sentinel.Engine`)" bullet with: `Publisher.Prepare` / `Judge(plan, "Auto-Publish")` / `Stage` / `Discard` as Amendment 2 states them; `Publisher.AutoEnabled(ResolvedArtefact policy)` → `bool`: true only for a bridge or cached body that is exactly `{auto: true}`; `PublishLines.Policy(policy)` → `Auto-publish: on · publish@1 · office · 3f07a1b2c3d4…` (the label, with ` (cached HH:mm)` when it is), `Auto-publish: off — publish: none — not installed for <key> or its office` (any none, with its reason), `Auto-publish: off — publish@1 · office · …` (auto: false), or `Auto-publish: off — <label> did not parse: the body is not {auto: true} or {auto: false}`; `PublishLines.Doctor(plan[, outcome, stage])` → one line, as Task 1's harness pins it: `Auto-published <container> <revision> · wip · ledger #<verdict_audit_id> · receipt <16 hex>…` (with ` — not judged: nothing in the IDS's scope (<ids label>)` or ` — not judged: no IDS installed for <key> or its office` on recorded), `Auto-publish rejected — nothing uploaded — <n> of <m> element check(s) failed · <ids label> · ledger #<audit_id> · receipt …` (or `… the model name <container> failed naming <naming label> · …`), `Auto-publish rejected — nothing uploaded — delivery gate FAIL · <contract label> · Schema <s> · <n> failure(s) · gate row: <LedgerLine>`, `Auto-publish: no verdict — nothing uploaded — <error>`, `Auto-publish failed — nothing uploaded — <refusal>`, `Auto-publish: verdict <v> but the bridge registered no version — nothing uploaded · <LedgerLine>`, `Auto-publish: <container> <revision> · wip registered but NOT in the upload outbox — <reason>`. In **Produces**, `Run`'s sentence: `Publisher.Prepare` (a throw is caught: "Auto-publish: nothing exported — <message>"); `!plan.Ready` → the Doctor line `PublishLines.Doctor(plan)` (the temp IFC already discarded); `plan.OrgWarning` → `Auto-publish: <the org-less text>`; else `Task.Run(() => Publisher.Judge(plan, "Auto-Publish"))` and, back through the hub, `Stage` + `PublishLines.Doctor(plan, outcome, stage)`, `_busy = false` in a `finally`; a faulted judge task → `Publisher.Discard(plan)` and `Auto-publish: no verdict — nothing uploaded — <message>`.

**Step 1:** replace the whole of `SentinelAddin/Engine/AutoPublish.cs` with:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// Auto-publish on save and sync (cohesion phase 5b, spec Decisions 2 and 8): the same governed pipeline as
/// Governed Publish — <see cref="Publisher"/>: the whole model exported in the contract's schema, the delivery gate
/// and its ledger row, one /propose that registers the version with its verdict, the sidecar-first stage — run
/// without a dialog, and ONLY when the project's <c>publish@n</c> says <c>{auto: true}</c>. There is no switch in
/// Revit: none installed, a cached none, <c>auto: false</c> or a body that does not parse all mean off, and the
/// Doctor log says so once per document per session, naming the policy ("Auto-publish: off — publish: none — not
/// installed for &lt;key&gt; or its office"). A rejected run uploads nothing and logs its line; so does a gate FAIL.
///
/// Threading: the save/sync handler reads the key (Extensible Storage: API thread) and returns at once; the policy
/// GET (≤ 4 s) runs on a task; Prepare (export, gate, extraction — Revit API, plus the contract GET and the gate row,
/// ≤ 4 s + ≤ 6 s) runs in a later <see cref="RevitEventHub"/> job; Judge (the 120 s /propose) runs on a task; Stage
/// and the Doctor line land back through the hub. One run per document per 15 s, single-flighted: a save that
/// lands while a run is in flight is skipped, silently — a save is not the place for a dialog.
/// </summary>
public static class AutoPublish
{
    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(15);
    // API thread only: the handlers, the hub's jobs and the pane's dispatcher are all Revit's main thread.
    private static readonly Dictionary<Document, DateTime> LastRun = new();
    private static readonly HashSet<Document> SaidOff = new();
    private static bool _busy;

    /// <summary>True from Prepare to Stage of one run. Governed Publish refuses to start meanwhile: both would write
    /// the same outbox name.</summary>
    internal static bool InFlight => _busy;

    /// <summary>Called from App.OnSaved / App.OnSynchronized (API thread). Never blocks: what can wait on the bridge
    /// runs on a task, what needs Revit runs in a later hub job.</summary>
    public static void Trigger(Document? doc)
    {
        if (doc is null || doc.IsFamilyDocument || _busy || App.Events is not { } events || App.PanelVm is not { } vm) return;
        var now = DateTime.UtcNow;
        if (LastRun.TryGetValue(doc, out var last) && now - last < MinInterval) return;
        LastRun[doc] = now;
        Prune();
        var key = ProjectContext.For(doc).Key;
        if (key.Length == 0) return; // unbound: nothing to publish into

        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        Task.Run(() => ArtefactClient.Resolve(key, "publish")).ContinueWith(t =>
        {
            var policy = t.Status == TaskStatus.RanToCompletion ? t.Result
                : ArtefactClient.None("publish", "the policy read did not finish (" + (t.Exception?.GetBaseException().Message ?? "unknown") + ")");
            if (!Publisher.AutoEnabled(policy))
            {
                // Once per document per session: saves are frequent, the reason is not. On the pane's thread (BeginInvoke,
                // never Invoke from a worker), which is the API thread that owns SaidOff.
                ui.BeginInvoke(new Action(() =>
                {
                    if (doc.IsValidObject && SaidOff.Add(doc)) vm.LogDoctor(PublishLines.Policy(policy));
                }));
                return;
            }
            events.Enqueue(_ => Run(doc, key, events, vm));
        }, TaskScheduler.Default);
    }

    // A hub job (API thread): Prepare here, Judge on a task, Stage and the line back through the hub.
    private static void Run(Document doc, string key, RevitEventHub events, UI.SentinelPanelViewModel vm)
    {
        if (_busy || !doc.IsValidObject || ProjectContext.For(doc).Key != key) return; // in flight, closed or rebound meanwhile
        _busy = true;
        PublishPlan plan;
        try
        {
            plan = Publisher.Prepare(doc, Path.Combine(Path.GetTempPath(), "Sentinel", "auto"),
                                     (kind, timeout) => ArtefactClient.Resolve(key, kind, timeout));
        }
        catch (Exception ex) // never let a background export crash Revit
        {
            _busy = false;
            vm.LogDoctor("Auto-publish: nothing exported — " + ex.Message);
            return;
        }
        if (!plan.Ready) // refused before the referee (no export, or a gate FAIL): the temp IFC is already discarded
        {
            _busy = false;
            vm.LogDoctor(PublishLines.Doctor(plan));
            return;
        }
        if (plan.OrgWarning is not null) vm.LogDoctor("Auto-publish: " + plan.OrgWarning);
        Task.Run(() => Publisher.Judge(plan, "Auto-Publish")).ContinueWith(t => events.Enqueue(_ =>
        {
            try
            {
                if (t.Status != TaskStatus.RanToCompletion) // Judge never throws; this guards the task itself
                {
                    Publisher.Discard(plan);
                    vm.LogDoctor("Auto-publish: no verdict — nothing uploaded — " + (t.Exception?.GetBaseException().Message ?? "the verdict call did not finish"));
                    return;
                }
                var stage = Publisher.Stage(plan, t.Result, PlatformExporter.OutboxDir());
                vm.LogDoctor(PublishLines.Doctor(plan, t.Result, stage));
            }
            finally { _busy = false; }
        }), TaskScheduler.Default);
    }

    // Closed documents leave the maps (API thread).
    private static void Prune()
    {
        foreach (var d in LastRun.Keys.Where(d => !d.IsValidObject).ToList()) { LastRun.Remove(d); SaidOff.Remove(d); }
    }
}
```

**Step 6, after the `Post` deletion** — also delete (in `SentinelAddin/Coordination/GovernedNotify.cs`, master line 26 and the blank line after it — `Post` was its only user, and a readonly field with an object initializer never trips CS0414, so the compiler would keep it silently):

```csharp
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };

```

and replace the parenthetical "(`Http` at :26 stays — nothing else uses it after `Post` goes, but it is a private static field, so no warning; `GovHttp`, `Send`, `KeyOf` and `NotBoundError` are used by `Propose`, `OfficeSnapshot` and `InstallArtefact`.)" with "(`GovHttp`, `Send`, `KeyOf` and `NotBoundError` stay: `Propose`, `OfficeSnapshot` and `InstallArtefact` use them; `Event` goes through `LedgerResult.Post`.)". Measured: both builds green with master's warnings after this deletion.

**Step 8:** in the new text of the first replace (`PublishLine`'s doc comment) replace "decided the way AutoPublish decides it (Publisher.AutoOn)." with "decided the way AutoPublish decides it (Publisher.AutoEnabled).".

**Step 9:** the harness line becomes: `artefact-cache-check` → `53/53`; `gate-check` → `123/123`; `event-check` → `44/44`; `project-context-check` → `19/19`; `publish-check` → `101/101`; `fixplace-check` → `52/52`. The grep's expected output is ONE line, not nothing: `tools/publish-check/Check.cs:324:        Ok(!un.Contains("upload-ifc") && !un.Contains("node "), "no shell command is printed any more");` (the harness pinning that the word is gone from the dialog; master: 45 hits).

**Step 10:** in the commit message, after "GovernedNotify.FileVersion/ModelPublished/RegisterVersionId/Post" insert " and its unused 6 s client". Steps 2-5 and 7 are unchanged.

---

### Task 4: Bridge — the outbox watcher takes only a sidecar `version_id`: a sidecar with a project but no `version_id` (the add-in before 5b) is filed under `outbox\unbound\` with the line `pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.`; `/propose` answers `verdict_hash` beside `verdict_audit_id` so Revit's `Version:` line can carry a receipt; `upload-ifc.mjs` and `bridge:upload` are deleted

**Files:**
- Modify: `WebApp/bridge/outbox-logic.mjs` (the whole file, 28 lines)
- Modify: `WebApp/bridge/outbox-logic.test.mjs` (:1-3 the header; :13-14 the imports; :22-44 the decision block; :56-57 the fake's by-name lookup; :119-126 the pre-5b describe)
- Modify: `WebApp/bridge/watch-outbox.mjs` (:1-8 the header; :44-72 `recordVersion`; :116-128 the decision and the unbound line; :143 and :149 the two call sites)
- Modify: `WebApp/bridge/cde-store.mjs` (:1006 the doc comment; :1104 the reply)
- Modify: `WebApp/bridge/propose-register.test.mjs` (:166, :189)
- Modify: `docs/verdict-contract.md` (:77)
- Delete: `WebApp/bridge/upload-ifc.mjs`
- Modify: `WebApp/package.json` (:12 `bridge:upload`); `WebApp/bridge/thatopen-client.mjs` (:2-3 the header comment); `WebApp/bridge/cli-args.mjs` (:3)
- Read for reference: spec Decision 6 (the pre-5b path "removed in 5b") and Decision 8 (`upload-ifc.mjs` and `bridge:upload` deleted); `WebApp/bridge/cde-store.mjs:543-555` (`registerFileVersion`'s by-name attach, reachable only with `attach_geometry: true` — after this task no caller passes it; it stays, pinned by `transition-guard.test.mjs:154-158`, see the cross-task notes), `:609` (`attachGeometry(key, versionId, platformItemId)` answers `{ container_id, iso_name, linked, version: { id, revision, platform_item_id, is_live }, audit_id }`), `:1093-1110` (`adjudicateProposal`'s `register` path: `recordVersionVerdict` returns the row it wrote, `return=representation`, so `stamp.hash` exists), `:1116-1127`; `WebApp/bridge/propose-register.test.mjs:63` and `:90` (the fake ledger gives every audit row `id`, `at` and a 64-char `hash`); `WebApp/bridge/watch-outbox.mjs:79-88` (`captureAfterRegister`, unchanged: it reads `reg.key`, `reg.version.id`, `reg.version.revision`, which `recordVersion`'s attach answer still carries), `:95-107` (`waitStable`), `:153-154` (the move to `sent\` and the sidecar unlink), `:162-170` (`sweep` lists files only, so `unbound\` and `sent\` are never swept), `:186-187` (the 15 s re-sweep — why an unbound IFC must leave the outbox); `WebApp/bridge/thatopen-client.mjs:19-41` (`getConfig` reads `config/.env` first, `createClient` makes no request — so the `--once` smoke below never calls the platform); `WebApp/bridge/load-env.mjs:13-27`; `SentinelAddin/Engine/PlatformExporter.cs:84-102` (the sidecar the add-in writes until Task 2: `{"project", "docTitle", "host"?}` — exactly the shape this task refuses); Task 1's `Publisher.Stage` (the sidecar `{project, container, version_id}` written before the move); `WebApp/bridge/start-watch.cmd:12`, `WebApp/start-watcher.cmd:3`, `WebApp/package.json:13` (`bridge:watch` — every launcher runs the watcher with no arguments; none changes); `WebApp/README.md` (names neither `upload-ifc` nor `bridge:upload` — checked); `.github/workflows/ci.yml:20` (`npm run test` — no CI step names the deleted script).

**Interfaces:**
- Consumes: `isUuid(v)` (cde-store.mjs:25); `attachGeometry(key, versionId, platformItemId)` (cde-store.mjs, 5a); `captureManifest` (manifest-store.mjs, unchanged).
- Produces:
  - `export function outboxDecision(sidecarText) → { action: "unbound", reason, advice } | { action: "attach", project, version_id }` — pure. `advice` is the sentence the watcher prints after `not uploaded, not registered.`: `Bind the model to a web project (Revit → Project Setup) and publish again.` for no sidecar (`no sidecar`), not JSON (`its sidecar is not JSON`), no project (`its sidecar names no project`) and a `version_id` that is not a uuid (`its sidecar's version_id is not a uuid (<json>)`); `Update the add-in and publish again.` with reason `pre-5b sidecar (no version_id)` when the sidecar names a project and has no `version_id` key (the add-in before 5b, with or without `host`). There is no `register` action any more.
  - The watcher's lines (stdout / stderr): unbound `[<ts>] ⛔ <name> → <outbox>\unbound\<ms>_<name> — <reason>: not uploaded, not registered. <advice>` (the four 5a reasons print byte-identically to B9's); dry-run `[<ts>] would move <name> to <outbox>\unbound — <reason>` and `[<ts>] would upload <name> → version <id> on <key>`; upload `[<ts>] uploading <name> → version <id> on <key> …`; attach `  📎 geometry attached to <iso_name> <revision> (version <id>, project <key>) · ledger #<id>`; a failure after the upload `  ⚠ geometry not attached to version <id> for <name> on <key>: <message> — platform item <item> is on no version`. `recordVersion(d, name, itemId)` — the `sizeBytes` argument is gone with the register path.
  - `POST /cde/:key/propose` reply: `verdict_hash` — the verdict row's own 64-hex chain hash when `register` or `version_id` stamped a version, else `null` (beside `verdict_audit_id`; the `receipt` stays the proposal row's). Task 1's `ProposalResult` parses it as `VerdictHash` so `PublishLines` can print `Version: … · ledger #<verdict_audit_id> · receipt <16 hex>…` under the honesty rule (a receipt only with a hash the bridge returned).
  - `npm run bridge:upload` no longer exists (`npm error Missing script: "bridge:upload"`); `WebApp/bridge/upload-ifc.mjs` is gone.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/outbox-logic.test.mjs` replace lines 1-3:

```js
// The outbox watcher (cohesion phase 5a, spec Decision 6): the sidecar alone decides — unbound, attach to the
// sidecar's version by id, or the pre-5b register path — and attachGeometry puts the platform item on that one
// version of that project, once. globalThis.fetch is a fake PostgREST; no network, no That Open.
```

with:

```js
// The outbox watcher (cohesion phase 5a, spec Decision 6; 5b removes the pre-5b register path): the sidecar alone
// decides — unbound, with the advice the watcher prints, or attach to the sidecar's version by id — and attachGeometry
// puts the platform item on that one version of that project, once. globalThis.fetch is a fake PostgREST; no network,
// no That Open.
```

Replace line 14:

```js
import { attachGeometry, registerFileVersion } from "./cde-store.mjs";
```

with:

```js
import { attachGeometry } from "./cde-store.mjs";
```

Replace lines 22-44 (the whole `outboxDecision` describe):

```js
describe("outboxDecision — the sidecar, and nothing else, says where an outbox IFC goes", () => {
  it.each([
    [null, "no sidecar"],
    ['{"project":', "its sidecar is not JSON"],
    ["null", "its sidecar names no project"],
    [side({}), "its sidecar names no project"],
    [side({ project: "  ", version_id: V }), "its sidecar names no project"],
    [side({ project: 7 }), "its sidecar names no project"],
    [side({ project: "aster-tower", version_id: "v3" }), 'its sidecar\'s version_id is not a uuid ("v3")'],
    [side({ project: "aster-tower", version_id: null }), "its sidecar's version_id is not a uuid (null)"],
  ])("%s → unbound: %s", (text, reason) => {
    expect(outboxDecision(text)).toEqual({ action: "unbound", reason });
  });

  it("a sidecar with a version_id attaches to that version on that project", () => {
    expect(outboxDecision(side({ project: " aster-tower ", container: "AST-ARC-M3-ZZ-0001.ifc", version_id: V }))).toEqual({ action: "attach", project: "aster-tower", version_id: V });
  });

  it("a pre-5b sidecar (no version_id key) registers by file name, with its host when it names one", () => {
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Aster Tower" }))).toEqual({ action: "register", project: "aster-tower", host: null });
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Link", host: " Tower.ifc " }))).toEqual({ action: "register", project: "aster-tower", host: "Tower.ifc" });
  });
});
```

with:

```js
const BIND = "Bind the model to a web project (Revit → Project Setup) and publish again.";

describe("outboxDecision — the sidecar, and nothing else, says where an outbox IFC goes", () => {
  it.each([
    [null, "no sidecar"],
    ['{"project":', "its sidecar is not JSON"],
    ["null", "its sidecar names no project"],
    [side({}), "its sidecar names no project"],
    [side({ project: "  ", version_id: V }), "its sidecar names no project"],
    [side({ project: 7 }), "its sidecar names no project"],
    [side({ project: "aster-tower", version_id: "v3" }), 'its sidecar\'s version_id is not a uuid ("v3")'],
    [side({ project: "aster-tower", version_id: null }), "its sidecar's version_id is not a uuid (null)"],
  ])("%s → unbound: %s — bind the model", (text, reason) => {
    expect(outboxDecision(text)).toEqual({ action: "unbound", reason, advice: BIND });
  });

  it("a sidecar with a version_id attaches to that version on that project", () => {
    expect(outboxDecision(side({ project: " aster-tower ", container: "AST-ARC-M3-ZZ-0001.ifc", version_id: V }))).toEqual({ action: "attach", project: "aster-tower", version_id: V });
  });

  it("a pre-5b sidecar (a project, no version_id key — the add-in that registered by file name) is unbound: update the add-in", () => {
    const legacy = { action: "unbound", reason: "pre-5b sidecar (no version_id)", advice: "Update the add-in and publish again." };
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Aster Tower" }))).toEqual(legacy);
    expect(outboxDecision(side({ project: "aster-tower", docTitle: "Link", host: " Tower.ifc " }))).toEqual(legacy);
  });
});
```

Delete lines 56-57 (the fake's `registerFileVersion` by-name lookup, dead once nothing registers by name):

```js
  if (path === "information_containers" && q.get("iso_name")) // registerFileVersion's by-name lookup
    return json([{ id: C, parent_id: null, container_versions: [{ id: V, revision: version.revision, is_live: true, platform_item_id: version.platform_item_id }] }]);
```

Delete lines 119-126 (the whole describe, and the blank line before it):

```js
describe("the pre-5b path — registerFileVersion with attach_geometry: true", () => {
  it("still attaches by name to the live version without geometry (the watcher spells the flag out)", async () => {
    version.revision = "v1";
    const r = await registerFileVersion("aster-tower", { name: "AST-ARC-M3-ZZ-0001.ifc", author: "outbox", size_bytes: 10, platform_item_id: "item-7", attach_geometry: true });
    expect(r).toMatchObject({ container_id: C, linked: true, version: { id: V, platform_item_id: "item-7" } });
    expect(writes().map((c) => [c.path, c.method])).toEqual([["container_versions", "PATCH"], ["audit_log", "POST"]]);
  });
});
```

(The by-name registration itself is still pinned by `transition-guard.test.mjs:154-158`; this file tests the watcher's paths, and the watcher no longer has that one.)

In `WebApp/bridge/propose-register.test.mjs` replace line 166:

```js
    expect(r).toMatchObject({ verdict: "accepted", audit_id: db.audit_log[0].id, verdict_audit_id: stamp.id });
```

with:

```js
    expect(r).toMatchObject({ verdict: "accepted", audit_id: db.audit_log[0].id, verdict_audit_id: stamp.id, verdict_hash: stamp.hash });
```

and line 189:

```js
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null });
```

with:

```js
    expect(r).toMatchObject({ verdict: "rejected", version: null, verdict_audit_id: null, verdict_hash: null });
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/outbox-logic.test.mjs bridge/propose-register.test.mjs
```

Expected:

```
 ❯ bridge/outbox-logic.test.mjs (16 tests | 9 failed)
 ❯ bridge/propose-register.test.mjs (28 tests | 2 failed)
 Test Files  2 failed (2)
      Tests  11 failed | 33 passed (44)
```

The eight `it.each` rows fail because master's decision has no `advice`; the pre-5b test fails because master answers `{ action: "register", project, host }`; the attach test and the six `attachGeometry` tests pass. In propose-register the accepted case fails on `verdict_hash` (master's reply has no such key, so `toMatchObject` sees `undefined`, not the stamp's hash) and the rejected case fails the same way against `null`.

- [ ] **Step 3: The decision and the reply — GREEN**

Replace the whole of `WebApp/bridge/outbox-logic.mjs` with:

```js
// The outbox watcher's one decision, pure (cohesion phase 5a, spec Decision 6; 5b removed the pre-5b register path):
// where an outbox IFC goes is read from its sidecar ("<name>.ifc.meta.json", written by Revit's Publisher) and
// nothing else. There is no fallback to the bridge's That Open project id: it is not a Sentinel key, so the old
// fallback uploaded a platform item and then failed to register it anywhere (watch-outbox.mjs, before 5a).
import { isUuid } from "./cde-store.mjs";

const BIND = "Bind the model to a web project (Revit → Project Setup) and publish again.";
const unbound = (reason, advice = BIND) => ({ action: "unbound", reason, advice });

/**
 * sidecarText: the sidecar's text, or null when there is none.
 * → { action: "unbound", reason, advice }     no upload, no registration: the watcher moves the IFC to outbox\unbound\
 *                                              and logs "<reason>: not uploaded, not registered. <advice>"
 *   { action: "attach", project, version_id }  upload, then attach the platform item to that version by id (Publisher
 *                                              registered and judged it through /propose before the IFC reached the
 *                                              outbox)
 * A sidecar with a project but no version_id key is the add-in before 5b, which registered a version by file name with
 * nothing judged: unbound, with the advice to update the add-in. A version_id that is present but not a uuid is
 * unbound too: a bad sidecar never registers anything.
 */
export function outboxDecision(sidecarText) {
  if (sidecarText == null) return unbound("no sidecar");
  let m;
  try { m = JSON.parse(sidecarText); } catch { return unbound("its sidecar is not JSON"); }
  const project = typeof m?.project === "string" ? m.project.trim() : "";
  if (!project) return unbound("its sidecar names no project");
  if (m.version_id === undefined) return unbound("pre-5b sidecar (no version_id)", "Update the add-in and publish again.");
  if (!isUuid(m.version_id)) return unbound(`its sidecar's version_id is not a uuid (${JSON.stringify(m.version_id)})`);
  return { action: "attach", project, version_id: m.version_id };
}
```

In `WebApp/bridge/cde-store.mjs` replace line 1006:

```js
 *  and return { verdict, downgraded, summary, failures, naming, ids_*, audit_id, version, verdict_audit_id, receipt }.
```

with:

```js
 *  and return { verdict, downgraded, summary, failures, naming, ids_*, audit_id, version, verdict_audit_id,
 *  verdict_hash, receipt } (verdict_hash: the verdict row's own chain hash, so Revit can print its receipt; null when
 *  nothing was stamped).
```

and line 1104:

```js
    version, verdict_audit_id: stamp?.id ?? null,
```

with:

```js
    version, verdict_audit_id: stamp?.id ?? null, verdict_hash: stamp?.hash ?? null,
```

Run:

```bash
npx vitest run bridge/outbox-logic.test.mjs bridge/propose-register.test.mjs
```

Expected:

```
 ✓ bridge/outbox-logic.test.mjs (16 tests)
 ✓ bridge/propose-register.test.mjs (28 tests)
 Test Files  2 passed (2)
      Tests  44 passed (44)
```

- [ ] **Step 4: The watcher — attach only**

In `WebApp/bridge/watch-outbox.mjs` replace lines 1-8:

```js
// Sentinel → That Open Platform bridge — outbox watcher.
//
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that Revit publishes into, and uploads each new IFC to
// That Open Platform via the shared, verified upload path. Where the geometry lands in the CDE is read from the IFC's
// sidecar (<name>.ifc.meta.json) and nothing else (spec Decision 6, outbox-logic.mjs): a sidecar version_id → attach
// the platform item to that version; a pre-5b sidecar with no version_id → register a version by file name; no
// sidecar, or one naming no project → the IFC moves to outbox\unbound\ with one log line, never uploaded or
// registered. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
```

with:

```js
// Sentinel → That Open Platform bridge — outbox watcher.
//
// Watches the Sentinel outbox (%APPDATA%\Sentinel\outbox) that Revit's Publisher stages into, and uploads each new IFC
// to That Open Platform via the shared, verified upload path. Where the geometry lands in the CDE is read from the
// IFC's sidecar (<name>.ifc.meta.json, {project, container, version_id}) and nothing else (spec Decision 6,
// outbox-logic.mjs): the platform item is attached to the sidecar's version by id — the version /propose registered
// and judged before the IFC reached the outbox. No sidecar, one naming no project, or one with no version_id (the
// add-in before 5b, which registered by file name) → the IFC moves to outbox\unbound\ with one log line, never
// uploaded or registered. Uploaded files are moved to outbox\sent\ so they are never re-uploaded.
```

Replace lines 44-72 (`recordVersion` and its doc comment):

```js
/**
 * Put an uploaded outbox file's geometry on its CDE version, as the sidecar decided (outboxDecision): "attach" → the
 * platform item goes on the sidecar's version by id (cde.attachGeometry — that version of that project, once);
 * "register" (a pre-5b sidecar with no version_id) → a version by the .ifc name, as before, with attach_geometry:
 * true spelled out (the by-name attach is opt-in since 5a; this path goes in 5b). Never throws: the upload has
 * already happened, so a failure logs one line naming the platform item that is on no version, and returns null.
 */
async function recordVersion(d, name, sizeBytes, itemId) {
  const orphan = `platform item ${itemId || "(none returned)"} is on no version`;
  try {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) { console.error(`  ⚠ CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY) — ${name}: ${orphan}`); return null; }
    if (d.action === "attach") {
      const r = await cde.attachGeometry(d.project, d.version_id, itemId);
      console.log(`  📎 geometry attached to ${r.iso_name} ${r.version.revision} (version ${r.version.id}, project ${d.project})${r.audit_id ? ` · ledger #${r.audit_id}` : " · ledger row not returned"}`);
      return { key: d.project, ...r };
    }
    const r = await cde.registerFileVersion(d.project, {
      name, author: "outbox", size_bytes: sizeBytes, platform_item_id: itemId || null, attach_geometry: true,
      parent_name: d.host, // linked model → nests under its host in the file tree
      notes: d.host ? `linked model of ${d.host} (outbox watcher)` : "uploaded via outbox watcher",
    });
    console.log(`  📚 versioned ${name} in the CDE (project ${d.project}${d.host ? `, link of ${d.host}` : ""}; pre-5b sidecar, no version_id: ${r.linked ? "attached by name to the live version without geometry" : "a new version"})`);
    return { key: d.project, ...r };
  } catch (e) {
    console.error(`  ⚠ ${d.action === "attach" ? `geometry not attached to version ${d.version_id}` : "version register failed"} for ${name} on ${d.project}: ${e?.message || e} — ${orphan}`);
    return null;
  }
}
```

with:

```js
/**
 * Put an uploaded outbox file's geometry on the version its sidecar names: the platform item goes on that version by
 * id (cde.attachGeometry — that version of that project, once). Never throws: the upload has already happened, so a
 * failure logs one line naming the platform item that is on no version, and returns null.
 */
async function recordVersion(d, name, itemId) {
  const orphan = `platform item ${itemId || "(none returned)"} is on no version`;
  try {
    const cde = await import("./cde-store.mjs");
    if (!cde.cdeConfigured()) { console.error(`  ⚠ CDE not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY) — ${name}: ${orphan}`); return null; }
    const r = await cde.attachGeometry(d.project, d.version_id, itemId);
    console.log(`  📎 geometry attached to ${r.iso_name} ${r.version.revision} (version ${r.version.id}, project ${d.project})${r.audit_id ? ` · ledger #${r.audit_id}` : " · ledger row not returned"}`);
    return { key: d.project, ...r };
  } catch (e) {
    console.error(`  ⚠ geometry not attached to version ${d.version_id} for ${name} on ${d.project}: ${e?.message || e} — ${orphan}`);
    return null;
  }
}
```

Replace lines 116-128 (in `handle`):

```js
    // Where this publish goes is the sidecar's to say, and nothing else's. Read it again once after 2 s when it is
    // missing or unreadable — Governed Publish copies the IFC in just before it writes the sidecar.
    let d = outboxDecision(await readSidecar(p));
    if (d.action === "unbound") { await new Promise((r) => setTimeout(r, 2000)); d = outboxDecision(await readSidecar(p)); }
    if (d.action === "unbound") {
      if (DRY) { console.log(`[${ts()}] would move ${name} to ${UNBOUND} — ${d.reason}`); return; }
      const parked = join(UNBOUND, `${Date.now()}_${name}`);
      await rename(p, parked);
      await rename(p + ".meta.json", parked + ".meta.json").catch(() => {}); // a sidecar naming no project goes with it
      console.log(`[${ts()}] ⛔ ${name} → ${parked} — ${d.reason}: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.`);
      return;
    }
    const target = d.action === "attach" ? `version ${d.version_id} on ${d.project}` : `${d.project} by file name (pre-5b sidecar, no version_id)`;
```

with:

```js
    // Where this publish goes is the sidecar's to say, and nothing else's. Read it again once after 2 s when it is
    // missing or unreadable — Publisher writes the sidecar before it moves the IFC in, so this only guards against a
    // sidecar still being written.
    let d = outboxDecision(await readSidecar(p));
    if (d.action === "unbound") { await new Promise((r) => setTimeout(r, 2000)); d = outboxDecision(await readSidecar(p)); }
    if (d.action === "unbound") {
      if (DRY) { console.log(`[${ts()}] would move ${name} to ${UNBOUND} — ${d.reason}`); return; }
      const parked = join(UNBOUND, `${Date.now()}_${name}`);
      await rename(p, parked);
      await rename(p + ".meta.json", parked + ".meta.json").catch(() => {}); // a sidecar naming no project, or a pre-5b one, goes with it
      console.log(`[${ts()}] ⛔ ${name} → ${parked} — ${d.reason}: not uploaded, not registered. ${d.advice}`);
      return;
    }
    const target = `version ${d.version_id} on ${d.project}`;
```

Replace both call sites (line 143, inside the frag `try`, and line 149, in its `catch`):

```js
      const reg = await recordVersion(d, name, size, result?.item?._id);
```

with (both):

```js
      const reg = await recordVersion(d, name, result?.item?._id);
```

(`size` is still printed by the `✅` line above each; only the register path used it.) Nothing else in the file changes: `captureAfterRegister` still gets `{ key, iso_name, version: { id, revision, … }, audit_id }` from the attach answer.

- [ ] **Step 5: Delete the one-shot uploader and the words that name it**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git rm -q WebApp/bridge/upload-ifc.mjs
```

In `WebApp/package.json` delete line 12:

```json
    "bridge:upload": "node bridge/upload-ifc.mjs",
```

(line 11 `"publish": …,` keeps its trailing comma; line 13 `"bridge:watch": …` follows it.)

In `WebApp/bridge/thatopen-client.mjs` replace lines 2-3:

```js
// Wraps the official @thatopen/services client so both the one-shot uploader (upload-ifc.mjs)
// and the outbox watcher (watch-outbox.mjs) use the exact same, verified upload path.
```

with:

```js
// Wraps the official @thatopen/services client so the outbox watcher (watch-outbox.mjs) and the bridge's own
// uploads (platform-publish.mjs) use the exact same, verified upload path. The one-shot uploader (upload-ifc.mjs)
// went in cohesion phase 5b: a model reaches the CDE only through /propose and the watcher.
```

In `WebApp/bridge/cli-args.mjs` replace line 3:

```js
// didn't — intake.mjs/artefact-import.mjs/upload-ifc.mjs each inline the same few lines. This gives
```

with:

```js
// didn't — intake.mjs and artefact-import.mjs each inline the same few lines. This gives
```

In `docs/verdict-contract.md` replace line 77:

```
adds `"version": { "id", "container_id", "revision", "state": "wip" }` and `"verdict_audit_id"`. A rejected verdict
```

with:

```
adds `"version": { "id", "container_id", "revision", "state": "wip" }`, `"verdict_audit_id"` and `"verdict_hash"` (that
verdict row's own chain hash, so Revit's `Version:` line can carry its receipt; both null when nothing was stamped). A rejected verdict
```

- [ ] **Step 6: Smoke the watcher on a scratch outbox — a pre-5b sidecar, a link's, and none**

Git Bash, in the working tree (not the archive: `getConfig` reads `config/.env` relative to the module, and the `--once` run below needs it or the two variables — either way it never calls the platform, because every file is unbound):

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
S="C:/Users/yazan/AppData/Local/Temp/claude/C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project/4ae86a3d-066f-4d31-a2e7-567560705d3d/scratchpad/t4-outbox"
rm -rf "$S" && mkdir -p "$S"
cp bridge/fixtures/fed-a.ifc "$S/t4-legacy.ifc"; echo '{"project":"aster-tower","docTitle":"Aster Tower"}' > "$S/t4-legacy.ifc.meta.json"
cp bridge/fixtures/fed-a.ifc "$S/t4-link.ifc"; echo '{"project":"aster-tower","docTitle":"Link","host":"t4-legacy.ifc"}' > "$S/t4-link.ifc.meta.json"
cp bridge/fixtures/fed-a.ifc "$S/t4-none.ifc"
OUT=$(cygpath -w "$S")
SENTINEL_OUTBOX="$OUT" node bridge/watch-outbox.mjs --once --dry-run
```

Expected (one line per IFC, in directory order; `<S>` is `$OUT`):

```
[<ts>] would move t4-legacy.ifc to <S>\unbound — pre-5b sidecar (no version_id)
[<ts>] would move t4-link.ifc to <S>\unbound — pre-5b sidecar (no version_id)
[<ts>] would move t4-none.ifc to <S>\unbound — no sidecar
[<ts>] --once sweep complete.
```

Nothing moved (`ls "$S"` still lists the three IFCs and two sidecars, no `unbound`). Then the real sweep:

```bash
THATOPEN_API_KEY=t4 THATOPEN_PROJECT_ID=t4 SENTINEL_OUTBOX="$OUT" node bridge/watch-outbox.mjs --once
ls "$S" "$S/unbound"
```

Expected:

```
[<ts>] ⛔ t4-legacy.ifc → <S>\unbound\<ms>_t4-legacy.ifc — pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.
[<ts>] ⛔ t4-link.ifc → <S>\unbound\<ms>_t4-link.ifc — pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.
[<ts>] ⛔ t4-none.ifc → <S>\unbound\<ms>_t4-none.ifc — no sidecar: not uploaded, not registered. Bind the model to a web project (Revit → Project Setup) and publish again.
[<ts>] --once sweep complete.
```

`ls` shows `$S` holding only `sent` and `unbound`, and `unbound` holding `<ms>_t4-legacy.ifc`, `<ms>_t4-legacy.ifc.meta.json`, `<ms>_t4-link.ifc`, `<ms>_t4-link.ifc.meta.json` and `<ms>_t4-none.ifc`. No `→ item`, no `📚 versioned`, no `by file name (pre-5b sidecar, no version_id)` upload target (the string is gone from the file: `grep -c "pre-5b sidecar, no version_id" bridge/watch-outbox.mjs` → `0`). The real `%AppData%\Sentinel\outbox` is untouched (`SENTINEL_OUTBOX`). Then `rm -rf "$S"`.

- [ ] **Step 7: The whole suite, tsc, and the missing script**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npm test 2>&1 | tail -6
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npm run bridge:upload; ls bridge/upload-ifc.mjs
```

Expected: `Test Files  82 passed (82)`, `Tests  1134 passed (1134)` (master's 1135 less the deleted pre-5b describe; outbox-logic 16, propose-register 28); `24` (the pre-existing tsc errors, unchanged); `npm error Missing script: "bridge:upload"` (npm 10's wording; an older npm prints `npm ERR! Missing script: "bridge:upload"`) and `ls: cannot access 'bridge/upload-ifc.mjs': No such file or directory`.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/outbox-logic.mjs WebApp/bridge/outbox-logic.test.mjs WebApp/bridge/watch-outbox.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/propose-register.test.mjs WebApp/package.json WebApp/bridge/thatopen-client.mjs WebApp/bridge/cli-args.mjs docs/verdict-contract.md
git commit -q -F - <<'EOF'
feat(bridge): the outbox watcher takes only a sidecar version_id — a sidecar with a project but no version_id (the add-in before 5b) is filed under outbox\unbound\ with 'pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.'; /propose answers verdict_hash beside verdict_audit_id; upload-ifc.mjs and bridge:upload deleted

Spec Decisions 6 and 8 (cohesion phase 5b). outboxDecision (pure) now answers unbound {reason, advice} or attach {project, version_id}; the register action and its by-name registration (attach_geometry: true from the watcher) are gone, so no publish reaches the CDE without the version /propose registered and judged. The four 5a unbound lines print byte-identically (their advice is the bind sentence); the pre-5b one names the add-in. recordVersion(d, name, itemId) attaches only. adjudicateProposal returns verdict_hash (the stamp row's chain hash; null when nothing was stamped) so the add-in's Version: line can print a receipt only with a hash the bridge returned. upload-ifc.mjs, the one-shot uploader the deleted shell-command text pointed to, and its bridge:upload script are removed; thatopen-client and cli-args no longer name it; the verdict contract names verdict_hash.

outbox-logic.test.mjs 16 (was 17: the pre-5b register test replaced by the unbound one, the by-name describe deleted); propose-register 28 (verdict_hash asserted on accept and on reject); dry-run and --once sweeps on a scratch outbox; npm test 1134 in 82 files; tsc 24.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: this task touches no C#; both add-in builds stay as Task 3 left them (green).

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

No amendment. Measured as written on the archive: RED `11 failed | 33 passed (44)` on the two files, GREEN 44/44 (outbox-logic 16, propose-register 28), `npm test` 1134 in 82, tsc unchanged (25 in an archive copy, 24 in the working tree), `npm run bridge:upload` → `npm error Missing script: "bridge:upload"`, `ls bridge/upload-ifc.mjs` → no such file, and Step 6's two sweeps print every line word for word (also valid on an archive copy with `THATOPEN_API_KEY=t4 THATOPEN_PROJECT_ID=t4`, which Step 6 may say instead of insisting on the working tree). `verdict_hash` is what Amendment 1's `ProposalResult.VerdictHash` reads.

---

### Task 5: Docs — Session B10 (one publish path) in the testing protocol, the capability row (🟩 Built), and every line the handbook, user guide, INSTALL and the simulation room say that 5b makes untrue

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (insert `## Session B10 — one publish path` between line 260, B9's Honesty row, and line 262, `## Session C`; Session D's rows :282-283)
- Modify: `docs/handbook/05-capability-status.md` (:18 one clause; :19 two clauses; a new row after :19)
- Modify: `docs/SENTINEL_HANDBOOK.md` (:86 the section heading; :88 Governed Publish; :89 Quick Publish deleted; :90 Auto-Publish; :91 Publish Sheets; :106; :164; :209)
- Modify: `SENTINEL-USER-GUIDE.md` (a bullet after :9)
- Modify: `SentinelAddin/INSTALL.md` (:36)
- Modify: `docs/testing/SIMULATION_ROOM.md` (:59, :86, :108-109 — the lines the critic listed; they are in the simulation-room plan, not in `SIMULATION_ROOM_RUN_2026-09-22.md`, whose :51-52, :95 and :107 are the 2026-09-22 run's record and stay)
- Not modified, checked: `docs/CAPABILITY_MAP.md` (names no Quick Publish; a source-verified 2026-07-20 snapshot — its :68-69 "version register" / "throttled push-on-save" describe that date); `docs/handbook/04-core-workflows.md`, `docs/PILOT_DEMO_RUNBOOK.md`, `README.md`, `WebApp/README.md` (name none of Quick Publish, the toggle, link publishing or `upload-ifc`); `docs/TESTING_PROTOCOL.md:191` (B8's Auto-Publish row), `:241`, `:251`, `:258`, `:259` (B9's `publish@1`, pre-5b sidecar, pre-5b add-in and no-sidecar rows) stay as those sessions' record — B10's preamble names them as superseded; `docs/TESTING_PROTOCOL.md:359-371` (the ledger: `Governed Publish loop | ✅ verified` stays).
- Read for reference: spec — the 5b definition of done, Decisions 2, 6, 8, Behaviour changes, Testing "5b"; the pinned texts Tasks 1-3 print (`Version: <container> <revision> · wip · ledger #<verdict_audit_id> · receipt …`, `Version: not confirmed — <reason>`, `Published — not judged: nothing in the IDS's scope (<ids label>)`, `Published — not judged: no IDS installed for <key> or its office`, the Doctor lines `Auto-publish: off — <publish label>`, `Auto-published <container> <revision> · ledger #…`, `Auto-publish rejected — nothing uploaded — <n> failure(s) · ledger #…`, the strip's `Auto-publish: on · publish@1 · office · <sha 12>…` / `Auto-publish: off — publish: none — not installed for <key> or its office`) and Task 4's watcher line; `SentinelAddin/Engine/GateLines.cs:23-32`, `:70-75` (`Delivery gate: NOT CHECKED — contract: none — not installed for <key> or its office`, `✕ REJECTED — delivery gate failed (not published)`), `SentinelAddin/Coordination/LedgerResult.cs:160-166` (`ledger #<id> · receipt <16 hex>…`, `not recorded — …`), `SentinelAddin/Coordination/ArtefactClient.cs:131-155` (the label `publish@1 · project · <sha 12>…`, `+ (cached HH:mm)` from the cache, `none — not installed for <key> or its office`), `SentinelAddin/Engine/ProjectContext.cs:18` (`This model is not bound to a web project — Sentinel ▸ Project Setup.`); `WebApp/bridge/artefact-store.mjs:270` (`GET /cde/:key/artefacts/publish` with none → 404 `no publish artefact installed for <key> or its office (PUT /cde/<key>/artefacts/publish)`), `WebApp/bridge/artefact-import.mjs:31`, `:60-67` (`Installed on <key>: publish@1 · project · <sha 12>… · by cli`; `--kind publish` is in `KINDS`); `docs/TESTING_PROTOCOL.md:149-171` and `:202-233` (B8's and B9's preambles: `| Step | Pass criteria |`, no `|` inside a cell, the shell block with `B`, `T` and `c`); `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:382-386` and `:417-422` ("Not run live" paragraphs; the "as measured" numbers: aster-tower's split containers `AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc` 3 versions and `…_yazan.ifc` 5 on 2026-09-26, from the phase-5 map); `docs/handbook/05-capability-status.md:1-8` (the status legend link; 🟩 Built until the drill, ✅ after).

**Interfaces:** none (docs). Every quoted Revit, Doctor, strip and watcher text is one Tasks 1-4 pin; a B10 row never promises what a task did not build.

- [ ] **Step 1: Session B10 in `docs/TESTING_PROTOCOL.md`**

After line 260 (B9's `| Honesty | … archive \`b9-client\` the same way |`) and its following blank line, before `## Session C — Validate panel (the referee's home turf)`, insert:

````markdown
## Session B10 — one publish path

A model reaches the web by one governed path: Governed Publish and auto-publish run one Publisher — the whole model exported in the contract's schema, the delivery gate, the IDS and the naming standard, one `/propose` that registers the version and stamps it; the container is named from the central file; auto-publish runs only when the lead's `publish@n` says `auto: true`, never blocks a save or a sync, and a rejected run uploads nothing; Quick Publish, the toggle, the shell text, link publishing and the watcher's registration by name are gone. The rows supersede B8's Auto-Publish row (`Auto-publish of <title>: …` is no longer printed), the last sentence of B9's `publish@1` row, B9's pre-5b sidecar and pre-5b add-in rows, and the Quick Publish mention in its no-sidecar row. The versions this session registers land on the pilot's real `aster-tower` (the spec's definition of done asks for it) and stay `wip`; Demo's gate fails, so nothing registers on `demo`. Shell for the bridge rows — Git Bash, the managed bridge and the managed outbox watcher up on the branch; `c` calls the bridge with its token:

```bash
cd WebApp
W=$(pwd -W)
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
mkdir -p /tmp/b10 && cd /tmp/b10
c() { curl -s -w " %{http_code}" -H "Authorization: Bearer $T" -H "Content-Type: application/json" "$@"; echo; }
echo '{"auto":true}' > publish-on.json
echo '{"auto":false}' > publish-off.json
c "$B/cde/aster-tower/audit?entity_type=proposal&limit=1"
c "$B/cde/aster-tower/files"
```

The first `c` prints the proposal `total` — call it `P`. The second lists aster-tower's containers: note the version counts of `AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc` and `AST_ASTR26_Aster Tower_yazan.ifc` (3 and 5 on 2026-09-26) and that no `AST_ASTR26_Aster Tower.ifc` exists yet. Read each `<…>` off a dialog, a log or a reply and keep it where a later row uses it.

| Step | Pass criteria |
|---|---|
| Deploy | Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; from the repo root `dotnet run --project tools/publish-check` ends `<n>/<n> checks pass` at the total Task 1 pins, and `tools/artefact-cache-check`, `tools/gate-check` and `tools/event-check` end at the totals Task 3 pins; the managed bridge and the managed outbox watcher restarted on the branch (Task 4 changed both); `cd "$W" && npm run bridge:upload` → `npm error Missing script: "bridge:upload"`; `ls "$W/bridge/upload-ifc.mjs"` → no such file |
| The ribbon | Sentinel tab ▸ Publish panel: **Governed Publish**, and a **Publish** pulldown holding only **Publish Sheets** and **Publish Views** (its tooltip says they are keyed by the model's name and outside the governed path); no Quick Publish, no Auto-Publish on save; Sentinel ▸ Project Setup has no "Include linked models when publishing" checkbox |
| Not bound | a document with no web project (New ▸ the Aster template, unsaved or saved anywhere) → Governed Publish → `This model is not bound to a web project — Sentinel ▸ Project Setup.` and `Nothing was exported or published.`; Ctrl+S → nothing exported (`ls "$APPDATA/Sentinel/outbox"` gains no file), no dialog, no Doctor line |
| The policy line, none installed | Aster Tower open (bound to `aster-tower`); `c "$B/cde/aster-tower/artefacts/publish"` → ` 404` `no publish artefact installed for aster-tower or its office (PUT /cde/aster-tower/artefacts/publish)` → the pane's Next strip has a fourth line, `Auto-publish: off — publish: none — not installed for aster-tower or its office` |
| A save with no policy | save Aster Tower → the save returns at once; nothing is exported (`ls "$APPDATA/Sentinel/outbox"` gains no file); the Doctor log gets `Auto-publish: off — publish: none — not installed for aster-tower or its office` once; save again → no second line (once per document per session); `c "$B/cde/aster-tower/files"` unchanged |
| Governed Publish — Aster Tower | a plan view active (no 3D view needed: the export is the whole model) → Governed Publish → one dialog whose heading is `✓ ACCEPTED` (the IDS accepted with something in scope), `Published — not judged: nothing in the IDS's scope (ids@<n> · <source> · <sha 12>…)` (nothing in the installed IDS's scope — the bridge's `recorded`, `downgraded`) or `Published — not judged: no IDS installed for aster-tower or its office` (none installed); then `Version: AST_ASTR26_Aster Tower.ifc <revision> · wip · ledger #<s> · receipt <16 hex>…`, the IDS and Naming lines naming `ids@<n> · <source> · <sha 12>…` / `naming@<n> · …` (or none), `Delivery gate: NOT CHECKED — contract: none — not installed for aster-tower or its office`, `Gate row: ledger #<g> · receipt <16 hex>…` and `Verdict row: ledger #<p> · receipt <16 hex>…`; no `Version badge`, no `immutable`, no shell command, no "active view" |
| One container, one row | `c "$B/cde/aster-tower/files"` → a new container `AST_ASTR26_Aster Tower.ifc` — the central file's name (the local is `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt`; F12 closed) — holding one version `<revision>` `wip`, `sha256` and `size_bytes` those of the exported IFC; `AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc` and `AST_ASTR26_Aster Tower_yazan.ifc` hold exactly the versions they held before (they are history); `c "$B/cde/aster-tower/audit?entity_type=proposal&limit=1"` → `total` P + 1 (one row for this publish, not two) and `rows[0].id` `<p>`; `V1=<the version's id>`; `c "$B/cde/aster-tower/audit?entity_id=$V1&action_prefix=verdict:"` → `total: 1`, `rows[0].id` `<s>`, `rows[0].hash` beginning with the Version line's 16 hex; `c "$B/cde/aster-tower/audit?entity_type=delivery_gate&limit=1"` → `<g>`; `<g>` below `<p>` below `<s>` |
| The watcher attaches by id | the managed watcher's log (`WebApp\watcher.log`, or the start-watch window) within about a minute: `uploading AST_ASTR26_Aster Tower.ifc → version <V1> on aster-tower …`, `→ item <I>`, `📎 geometry attached to AST_ASTR26_Aster Tower.ifc <revision> (version <V1>, project aster-tower) · ledger #<a>`, then the `🧭 manifest:` line; never `no sidecar` for it (the sidecar is written before the IFC moves in — `tools/publish-check` pins the order); `c "$B/cde/aster-tower/files"` → still one version in `AST_ASTR26_Aster Tower.ifc`, now with `platform_item_id` `<I>`, still `wip`; `c "$B/cde/aster-tower/manifests"` lists `$V1` `has_manifest: true`; `ls "$APPDATA/Sentinel/outbox/sent"` has `<ms>_AST_ASTR26_Aster Tower.ifc` |
| Governed Publish — Demo (gate FAIL) | Demo Tower (bound to `demo`; its `contract@1 · office` fails the export, 994 proxies, as in B8) → Governed Publish → `✕ REJECTED — delivery gate failed (not published)`, `Contract: contract@1 · office · <sha 12>… · Schema: IFC4`, the failures, `Gate row: ledger #<g2> · receipt <16 hex>…`; no `Version:` line; `ls "$APPDATA/Sentinel/outbox"` gains nothing (the temp IFC is deleted: `ls "$TEMP/Sentinel/governed"` holds no `.ifc`); `c "$B/cde/demo/files"` and `c "$B/cde/demo/audit?entity_type=proposal&limit=1"` unchanged |
| `publish@1 {auto: true}` | `node "$W/bridge/artefact-import.mjs" publish-on.json --project aster-tower --kind publish` → `Installed on aster-tower: publish@1 · project · <sha 12>… · by cli`; in Revit press the pane's ↻ (or activate another Aster view) → the fourth line reads `Auto-publish: on · publish@1 · project · <sha 12>…` (the same 12 hex) |
| A save with auto on | save Aster Tower → the save returns at once, no dialog; within a minute the Doctor log gets `Auto-published AST_ASTR26_Aster Tower.ifc <revision 2> · ledger #<s2> · receipt <16 hex>…` (accepted or recorded — the same pipeline as the dialog row, whole model, `IFC2X3` with no contract; nothing else is printed for it); `c "$B/cde/aster-tower/files"` → the same container, now two versions, the new one `<revision 2>` `wip` and live; `c "$B/cde/aster-tower/audit?entity_type=proposal&limit=1"` → `total` P + 2; the watcher attaches its geometry as above (`📎 geometry attached to AST_ASTR26_Aster Tower.ifc <revision 2> …`); save again within 15 s → nothing (the throttle) and no second Doctor line |
| Sync with Central with auto on | more than 15 s later, Synchronize with Central → the sync returns at once; the Doctor log gets the `Scan report: …` line as in B8 and one `Auto-published AST_ASTR26_Aster Tower.ifc <revision 3> · ledger #<s3> · receipt <16 hex>…`; the strip's `model` step still reads done; `c "$B/cde/aster-tower/files"` → three versions in the one container |
| A rejected auto run uploads nothing | `node "$W/bridge/artefact-import.mjs" publish-on.json --project demo --kind publish` → `Installed on demo: publish@1 · project · <sha 12>… · by cli`; Demo Tower open, its pane line `Auto-publish: on · publish@1 · project · <sha 12>…`; save → the Doctor log gets `Auto-publish rejected — nothing uploaded — delivery gate failed · ledger #<g3> · receipt <16 hex>…`; no dialog; `ls "$APPDATA/Sentinel/outbox"` gains nothing; `c "$B/cde/demo/files"` unchanged; `c "$B/cde/demo/audit?entity_type=delivery_gate&limit=1"` → `<g3>` (an IDS reject reads `Auto-publish rejected — nothing uploaded — <n> failure(s) · ledger #<p> · receipt <16 hex>…` and registers nothing either) |
| `publish@2 {auto: false}` | `node "$W/bridge/artefact-import.mjs" publish-off.json --project aster-tower --kind publish` → `Installed on aster-tower: publish@2 · project · <sha 12>… · by cli`; the pane's fourth line → `Auto-publish: off — publish@2 · project · <sha 12>…`; save Aster Tower → nothing exported, and the Doctor log gets `Auto-publish: off — publish@2 · project · <sha 12>…` once; the same for `demo` (`Installed on demo: publish@2 …`) — both pilots stay off |
| Bridge stopped | `serviceUrl` in `%AppData%\Sentinel\bcf-config.json` → `http://127.0.0.1:4100` (keep the Tailscale address), the managed bridge stopped → Governed Publish on Aster Tower → a dialog that says the bridge returned no verdict and nothing was published, with `Gate row: not recorded — the bridge did not answer` and no shell command in it; `ls "$APPDATA/Sentinel/outbox"` gains nothing; save → the Doctor log gets `Auto-publish: off — publish@2 · project · <sha 12>… (cached HH:mm)` (the policy from the cache, still off). Restore `bcf-config.json`, start the bridge |
| A pre-5b sidecar in the managed outbox | `cp "$W/bridge/fixtures/fed-a.ifc" "$APPDATA/Sentinel/outbox/B10-L.ifc"; echo '{"project":"aster-tower","docTitle":"Aster Tower"}' > "$APPDATA/Sentinel/outbox/B10-L.ifc.meta.json"` (the sidecar the add-in wrote until 5b) → within about 20 s the managed watcher's log has `⛔ B10-L.ifc → …\unbound\<ms>_B10-L.ifc — pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.` and no `→ item` for it; `ls "$APPDATA/Sentinel/outbox/unbound"` lists `<ms>_B10-L.ifc` and `<ms>_B10-L.ifc.meta.json`; `c "$B/cde/aster-tower/files"` unchanged (before 5b it was uploaded and registered by name) |
| Honesty | every dialog, Doctor line and the strip name what judged — `contract@n`, `ids@n`, `naming@n`, `publish@n`, each `· source · sha`, or the none reason; `✓ ACCEPTED` never appears with nothing in scope; `ledger #` appears only with an id the bridge returned and `receipt` only with its hash; no surface reads `Version badge`, `immutable`, `Quick Publish`, `Auto Publish` or `upload-ifc`; a save or sync never waits on the bridge; one publish is one proposal row, one version, one verdict row; the container is named from the central file, once; linked models are not exported (the outbox never gains a second IFC per publish). Then `rm -r /tmp/b10`; both pilots hold `publish@2 {auto: false}`; Demo's local is closed without saving (as in B8) |
````

Replace lines 282-283 (Session D):

```markdown
| Quick Publish | Uploads, clearly labelled ungoverned, no verdict row created |
| Auto-Publish on save | Toggle on → save twice fast → exactly one throttled upload; toggle off → nothing |
```

with:

```markdown
| Auto-publish on save | `publish@n {auto: true}` installed on the project or its office → save twice fast → exactly one throttled run, its Doctor line `Auto-published …` or `Auto-publish rejected — nothing uploaded — …`; `{auto: false}` or none installed → nothing exported and one `Auto-publish: off — …` line; the pane's strip names the policy |
```

- [ ] **Step 2: The capability rows in `docs/handbook/05-capability-status.md`**

In line 18 (the Ledger grafts row) replace the clause:

```
and says `Version badge: not confirmed — <reason>.` instead of promising the ✓ when the version or its stamp is not confirmed.
```

with:

```
and, since 5b, says `Version: not confirmed — <reason>` when the one `/propose` returned no version (the `Version badge` line is gone).
```

In line 19 (the 5a row) replace:

```
a sidecar without one (the add-in before 5b) → today's registration by name; manifests still captured.
```

with:

```
a sidecar without one (the add-in before 5b) → registration by name until 5b, which files it under `unbound\` too; manifests still captured.
```

and:

```
nothing reads it until 5b, so the Revit toggle still decides Auto-Publish.
```

with:

```
Revit reads it from 5b on (the next row); until then the Revit toggle decided Auto-Publish.
```

After line 19 insert the new row (one line; no `|` inside a cell):

```markdown
| One publish path (cohesion 5b: Revit's Publisher — Governed Publish and auto-publish on one governed pipeline; the container named from the central file; the lead's `publish@n` decides auto; Quick Publish, the toggle, the shell text and link publishing gone) | 🟩 Built | Governed Publish and auto-publish run one `Publisher` (`SentinelAddin/Engine/Publisher.cs`): the whole model (the default 3D view, never the active view) exported in the contract's schema (`IFC2X3` with none) to a temp file, the delivery gate with its row waited for, extraction on the API thread, then one `/propose` off it carrying `container_name` and `register {name, size_bytes, sha256}` — one proposal row, one version (`wip`), one verdict row; on accepted or recorded the sidecar `{project, container, version_id}` is written before the IFC moves into the outbox (`tools/publish-check` pins the order) and the watcher attaches the geometry to that version by id; on rejected nothing is staged and the temp IFC is deleted. The container is named from the central model's file (`ContainerName`: the local `AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt` with central `…\AST_ASTR26_Aster Tower.rvt` → `AST_ASTR26_Aster Tower.ifc`; F12 closed); the per-user containers of earlier publishes stay as history. The dialog says `Version: <container> <revision> · wip · ledger #<id> · receipt <16 hex>…` from the reply (`verdict_audit_id` and `verdict_hash`), or `Version: not confirmed — <reason>`; a verdict that measured nothing reads `Published — not judged: nothing in the IDS's scope (<ids label>)`, none installed `Published — not judged: no IDS installed for <key> or its office`; `Version badge` is gone. Auto-publish has no switch in Revit: on save and Sync with Central the add-in reads `publish@n` (project → office, cached like every artefact) off the API thread — `{auto: true}` runs the same pipeline with no dialog and one Doctor line (`Auto-published <container> <revision> · ledger #<id> · receipt <16 hex>…`, or `Auto-publish rejected — nothing uploaded — <n> failure(s) · …` / `… delivery gate failed · …`); anything else (none, cached none, `auto: false`, unparseable) exports nothing and logs `Auto-publish: off — <publish label>` once per document per session; the save never waits on the bridge; the 15 s throttle stays; the pane's strip has a fourth line, `Auto-publish: on · publish@1 · office · <sha 12>…` or `Auto-publish: off — publish: none — not installed for <key> or its office`. Deleted: Quick Publish and the toggle (ribbon items and commands), the shell-command text with `upload-ifc.mjs` and `bridge:upload`, linked-model publishing with its Project Setup checkbox and `IsOpenedForExport` (links were never judged; Publish Sheets and Publish Views stay, keyed by model name and outside the governed path), `FileVersion`, `ModelPublished`, `RegisterVersionId`, `LiveVersion`, and the watcher's registration by name (a sidecar with no `version_id` now goes to `outbox\unbound\` with `pre-5b sidecar (no version_id): not uploaded, not registered. Update the add-in and publish again.`). Behaviour change: auto-publish is off everywhere until a lead installs `publish@n {auto: true}`; linked models are not published. Session B10 not yet run (`docs/TESTING_PROTOCOL.md`) |
```

(Task 6 flips 🟩 Built to ✅ and replaces the last sentence with the drill's date, what ran and what did not.)

- [ ] **Step 3: `docs/SENTINEL_HANDBOOK.md`**

Replace line 86:

```markdown
### 3.3 Publish — governed delivery (the flagship) + ungoverned options
```

with:

```markdown
### 3.3 Publish — governed delivery (the flagship), by hand or on save
```

Replace line 88:

```markdown
| **Governed Publish** ⭐ | The flagship. **One action**: export the active view to IFC → run the delivery gate → adjudicate against the project IDS → record the verdict **on the ledger** → publish + version **only if it passes**. A fail is recorded and each failing requirement **auto-opens as a BCF issue**, live-synced to the web and back into Revit. The dialog names the gate row's and the verdict's ledger entries (`ledger #<id> · receipt <16 hex>…`), and says `Version badge: not confirmed — <reason>.` rather than promise the ✓ badge when the version or its stamp is not confirmed. The version is registered in WIP; Publish on the web (the CDE panel) takes it further only on an accepted verdict that measured something, judged by an IDS installed on the project or its office, or with a lead's reason the ledger records (migration 0031). | Every real deliverable. This is the referee. | Coordinator |
```

with:

```markdown
| **Governed Publish** ⭐ | The flagship. **One action**: export the whole model to IFC (the contract's schema) → run the delivery gate → adjudicate against the project IDS → record the verdict **on the ledger** → register + stage the version **only if it passes**. A fail is recorded and each failing requirement **auto-opens as a BCF issue**, live-synced to the web and back into Revit. One `/propose` judges, registers the version (in WIP, in a container named from the central model's file — one container per model, whatever the local copy is called) and stamps it; the dialog names the gate row, the verdict row and the version (`Version: <container> <revision> · wip · ledger #<id> · receipt <16 hex>…`, or `Version: not confirmed — <reason>`), and a verdict that measured nothing reads `Published — not judged: …`, never accepted. The IFC goes into the outbox with its version id in the sidecar, so the bridge attaches the geometry to that version. Publish on the web (the CDE panel) takes it further only on an accepted verdict that measured something, judged by an IDS installed on the project or its office, or with a lead's reason the ledger records (migration 0031). | Every real deliverable. This is the referee. | Coordinator |
```

Delete line 89:

```markdown
| **Publish → Quick Publish** | Ungoverned: export the active view to IFC into the outbox; the bridge uploads it. **No verdict**, so its version reaches Published only with a signed-in lead's reason. | Quick share of work-in-progress. | Modeller |
```

Replace line 90:

```markdown
| **Publish → Auto-Publish on save** | Toggle push-on-save: every save/sync re-exports + uploads. Throttled. Each publish's ledger line goes to the panel's Doctor log; the ledger post never holds up the save. | Turn on for a live-shared model; off for very large ones. | Modeller |
```

with:

```markdown
| **Auto-publish on save** (no button) | The lead's `publish@n` (`{auto: true}`, installed on the project or its office from Project Settings ▸ Standards in force) runs Governed Publish on every save and Sync with Central with no dialog — the same gate, IDS, naming and one `/propose`; a rejected run uploads nothing. One run per 15 s at most; the save never waits on the bridge. Each run's line goes to the panel's Doctor log (`Auto-published <container> <revision> · ledger #…`, `Auto-publish rejected — nothing uploaded — …`, or `Auto-publish: off — <publish label>` once per document), and the pane's strip names the policy (`Auto-publish: on · publish@1 · office · …` or `Auto-publish: off — publish: none — not installed for <key> or its office`). None installed = off. | A lead turns it on for a live-shared model; leaves it off for very large ones. | Lead (the policy), Modeller (the saves) |
```

Replace line 91:

```markdown
| **Publish → Publish Sheets** | Renders all Revit sheets to PNG (sheets don't survive IFC) and serves them to the web app's Sheets tab. | When reviewers need the actual drawings, not just the model. | Modeller |
```

with:

```markdown
| **Publish → Publish Sheets** | Renders all Revit sheets to PNG (sheets don't survive IFC) and serves them to the web app's Sheets tab. Publish Sheets and Publish Views are keyed by the model's name under `%AppData%`, outside the governed path. | When reviewers need the actual drawings, not just the model. | Modeller |
```

In line 106 replace:

```
on **sync** it re-scans, checks the central file name against the ISO 19650 / BDS convention, and refreshes the web copy; on **save** it can auto-publish.
```

with:

```
on **sync** it re-scans and checks the central file name against the ISO 19650 / BDS convention; on **save** and **sync** it auto-publishes through Governed Publish only when the lead's `publish@n` says `auto: true` (linked models are not published).
```

In line 164 replace:

```
`upload-ifc` / `watch-outbox` (the Revit outbox → cloud pipeline)
```

with:

```
`watch-outbox` (the Revit outbox → cloud pipeline: the geometry attached to the version Revit's `/propose` registered)
```

In line 209 replace:

```
Scan Now, Pre-Flight, Quick Publish; web: BIM Tools, Issues |
```

with:

```
Scan Now, Pre-Flight, Governed Publish; web: BIM Tools, Issues |
```

- [ ] **Step 4: `SENTINEL-USER-GUIDE.md`, `SentinelAddin/INSTALL.md`, `docs/testing/SIMULATION_ROOM.md`**

In `SENTINEL-USER-GUIDE.md` after line 9 (`- **Revit Doctor:** …`) insert:

```markdown
- **Auto-publish:** on every save and Sync to Central, when the lead's `publish@n` (`{"auto": true}`, installed on the document's web project or its office) says so, the model is exported whole, gated, judged and registered exactly as Governed Publish does, with no dialog; the Doctor strip says what happened (`Auto-published <container> <revision> · ledger #…`, `Auto-publish rejected — nothing uploaded — …`, or `Auto-publish: off — <publish label>`) and the panel's strip names the policy. There is no switch in Revit; none installed = off. Linked models are not published.
```

In `SentinelAddin/INSTALL.md` replace line 36:

```
  `publish@n` (`{"auto": true}` or `{"auto": false}`, the lead's auto-publish policy) is read from phase 5b on.
```

with:

```
  `publish@n` (`{"auto": true}` or `{"auto": false}`, the lead's auto-publish policy) decides whether a save or
  Sync with Central runs Governed Publish without a dialog — none installed = off; there is no switch in Revit.
```

In `docs/testing/SIMULATION_ROOM.md` replace line 59:

```markdown
| 3.6 | Publish Views / Publish Sheets / Quick Publish (ungoverned) / Auto-Publish on save | Revit | those four | web Project Files shows versions; ungoverned ones marked so |
```

with:

```markdown
| 3.6 | Publish Views / Publish Sheets; auto-publish on save with `publish@1 {auto: true}` installed on the project | Revit | those two, then a save | web Sheets and Views tabs show them; Project Files shows the auto-published version with its verdict, the Doctor strip its line |
```

Replace line 86:

```
IFC Pre-Flight · IFC Delivery Gate · Governed Publish · Quick Publish (ungoverned) · Auto-Publish on save · Publish Views ·
```

with:

```
IFC Pre-Flight · IFC Delivery Gate · Governed Publish · Publish Views ·
```

Replace lines 108-109:

```markdown
| Quick Publish (ungoverned) | 3.6 | | |
| Auto-Publish on save | 3.6 | | |
```

with:

```markdown
| Auto-publish on save (`publish@n`, no button) | 3.6 | | |
```

- [ ] **Step 5: Check the words are gone and the tables still parse**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
grep -n "Quick Publish\|Auto-Publish on save\|Version badge\|upload-ifc\|bridge:upload\|read from phase 5b on\|toggle still decides" docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md SentinelAddin/INSTALL.md docs/testing/SIMULATION_ROOM.md docs/handbook/05-capability-status.md
grep -n "Quick Publish\|Auto-Publish on save" docs/TESTING_PROTOCOL.md
awk -F'|' 'NR > 262 && NR < 302 && /^\|/ { print NR ": " NF - 1 " pipes" }' docs/TESTING_PROTOCOL.md
grep -c "^| " docs/handbook/05-capability-status.md
```

Expected: the first `grep` prints `docs/handbook/05-capability-status.md:18` (the clause "the `Version badge` line is gone") and `:20` (the new row, which records what went: "Deleted: Quick Publish …", "`Version badge` is gone", "`upload-ifc.mjs` and `bridge:upload`") — nothing from the handbook, the user guide, INSTALL or the simulation room (their new lines spell it `Auto-publish`, lower-case p); the second prints `259:` (B9's no-sidecar row, left as its record) and three B10 lines — the preamble ("Quick Publish, the toggle, the shell text …"), the "The ribbon" row ("no Quick Publish, no Auto-Publish on save") and the "Honesty" row — and no Session D line (its new row reads `Auto-publish on save`); the `awk` prints nineteen lines (the header, the separator and the seventeen rows) each ending `3 pipes` — no `|` inside a cell; the last count is master's plus one.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md SentinelAddin/INSTALL.md docs/testing/SIMULATION_ROOM.md
git commit -q -F - <<'EOF'
docs: one publish path — Session B10 (the ribbon without Quick Publish and the toggle, the strip's policy line, a save with no policy exporting nothing, Governed Publish on Aster registering one central-named container with one proposal row and the Version line, the watcher attaching by id, Demo's gate reject staging nothing, publish@1 auto on with a save and a sync, a rejected auto run uploading nothing, publish@2 off, the bridge stopped, a pre-5b sidecar filed unbound), the capability row (Built), the 5a and ledger-grafts rows' 5b clauses, the handbook's Publish rows and role matrix, the user guide's auto-publish line, INSTALL's publish@n line, the simulation room's tool list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Build state: no code; both add-in builds and the web suite stay as Task 4 left them.

**Amendments (controller, after the cross-check — override the task where they conflict):**

Apply part C's Task 5 as written (its three inserts — the B10 block before `## Session C — Validate panel (the referee's home turf)`, the capability row after the 5a row's `the pre-5b Revit row not run live |`, the user-guide bullet after the `- **Revit Doctor:**` line — and the `and:`/`with:` clause pair are hand edits), then in **Step 1's B10 block** replace:

```
save → the Doctor log gets `Auto-publish rejected — nothing uploaded — delivery gate failed · ledger #<g3> · receipt <16 hex>…`; no dialog;
```

with:

```
save → the Doctor log gets `Auto-publish rejected — nothing uploaded — delivery gate FAIL · contract@1 · office · <sha 12>… · Schema IFC4 · <n> failure(s) · gate row: ledger #<g3> · receipt <16 hex>…`; no dialog;
```

replace:

```
(an IDS reject reads `Auto-publish rejected — nothing uploaded — <n> failure(s) · ledger #<p> · receipt <16 hex>…` and registers nothing either)
```

with:

```
(an IDS reject reads `Auto-publish rejected — nothing uploaded — <n> of <m> element check(s) failed · ids@<n> · <source> · <sha 12>… · ledger #<p> · receipt <16 hex>…` and registers nothing either)
```

replace:

```
`dotnet run --project tools/publish-check` ends `<n>/<n> checks pass` at the total Task 1 pins, and `tools/artefact-cache-check`, `tools/gate-check` and `tools/event-check` end at the totals Task 3 pins;
```

with:

```
`dotnet run --project tools/publish-check` ends `101/101 checks pass`, `tools/artefact-cache-check` `53/53`, `tools/gate-check` `123/123` and `tools/event-check` `44/44`;
```

and replace:

```
(the temp IFC is deleted: `ls "$TEMP/Sentinel/governed"` holds no `.ifc`)
```

with:

```
(the temp IFC is deleted: `find "$TEMP/Sentinel/governed" -name '*.ifc'` prints nothing)
```

In **Step 2's new capability row** replace:

```
or `Auto-publish rejected — nothing uploaded — <n> failure(s) · …` / `… delivery gate failed · …`);
```

with:

```
or `Auto-publish rejected — nothing uploaded — <n> of <m> element check(s) failed · <ids label> · ledger #<id> · receipt <16 hex>…` / `… delivery gate FAIL · <contract label> · Schema <s> · <n> failure(s) · gate row: ledger #<id> · receipt <16 hex>…`);
```

Step 5's expectations hold unchanged after these (measured: the first grep prints `05-capability-status.md:18` and `:20`; the second prints `259:` and three B10 lines (264, 284, 299); the awk prints 19 lines each `3 pipes`; the capability count is 51, master's 50 plus one). Optional, not required: `docs/killer-features-vision.md:17` still names `PublishToPlatform` (a dated vision note).

(controller, from the cross-check's spec gaps) **Say what the auto path costs the UI.** The auto path's `Prepare` (the contract ≤ 4 s, the gate row ≤ 6 s, the whole-model export) runs inside a RevitEventHub job on the API thread — the save/sync handler never waits (Decision 8 holds), but Revit's UI can pause for up to ~10 s plus the export, at most once per document per 15 s, on a project with `publish@n {auto: true}`. B10's "A save with auto on" row states that the pause is expected and bounded, and the handbook's auto-publish paragraph says it in one sentence; neither presents it as instant.

---

### Task 6: Deploy, drill and merge (controller)

- [ ] **Step 1:** With Revit closed (the founder confirms), `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the managed bridge runs the branch; an outbox watcher on a scratch outbox if a row needs one (never `%AppData%\Sentinel\outbox`).
- [ ] **Step 2:** Run Session B10 (`docs/TESTING_PROTOCOL.md`) live on the Demo Tower / pilot models: Governed Publish end to end (the wip version with its verdict, the sidecar, the watcher's attach by id), the refusal texts, Auto-publish with `publish@1 {auto: true}` installed and with none, the pane line, the deleted commands absent from the ribbon. Record it in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; rows not run live are marked **not run** with the reason.
- [ ] **Step 3:** Capability row → ✅; every harness and `cd WebApp && npm test` green; normalise co-author trailers (UTF-8 msg filter); merge `--no-ff` into master; ledger; memory; `graphify update .`.
