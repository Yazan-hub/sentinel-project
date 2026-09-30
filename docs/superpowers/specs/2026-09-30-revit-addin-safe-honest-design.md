# Revit add-in: safe and honest first (Approach A) — design

**Status.** Approved by the founder on 2026-09-30 ("Yes, start building"). BLOCK decision: **a BLOCK rule stops the sync, not the edit.**
**Source.** Every id below is a row in `docs/strategy/2026-09-30-revit-addin-audit.md`, with its evidence (file:line) there. The headline bugs were re-checked in code on 2026-09-30.
**Goal.** The tools people already use act on the right model, give the right answer, publish the whole model without freezing Revit, and name the person on every write. Nothing new to demo; every change removes a wrong-model or wrong-answer risk.

## Global constraints

- The add-in must build for Revit **2024, 2025 and 2026** (`dotnet build -p:RevitVersion=YYYY`, the locally verified set). Any Revit API used must exist in **2021**, or be guarded in `Compat.cs`, so 2021–2023 and 2027 are not broken.
- Revit API calls run only on the API thread: commands, `IUpdater.Execute`, Revit events, or `RevitEventHub` / `ExternalEvent` jobs. No new `ExternalEvent` per window.
- Pure logic (no Revit types) gets a check in `tools/*-check` — the existing console-harness pattern that links the add-in's source files. Each package is then proven live in **Revit 2024** in one drill session, recorded in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as **B31–B34**.
- Honesty: never an unmeasured pass; a result says what it covers; "not checked" is said as such. Wording stays plain and short.
- No new NuGet or npm dependencies.
- Branch per package, `--no-ff` merge, secret-scan before push (the repo is public).

## Package 1 — Right model, one undo

**XC-1 · Pin every job to its document.** `RevitEventHub` gains `Enqueue(Document doc, string what, Action<UIApplication, Document> job)`. When the event runs it checks `doc.IsValidObject` and that `uiapp.ActiveUIDocument?.Document` `.Equals(doc)`. If either fails it runs nothing and says, in the pane's Doctor log and in a TaskDialog, "Sentinel did not <what>: switch back to <doc.Title>" (or "<title> was closed"). The job receives the pinned `Document`, never re-reads `ActiveUIDocument`. The document is captured when the action starts (row published, button clicked, window opened). Callers moved onto it: pane Select and ⚡ Fix, change-request Show and Reset, BCF zoom, AI placement, clash view and export, Sanitize, MEP Openings (both passes), Apply Standard, Project Setup save. The pure decision (`valid`, `isActive`, `title` → run | refuse text) lives in a static helper with a check.

**XC-2 · One undo per Sentinel action.** A helper `SentinelUndo.Run(Document doc, string name, Func<bool> body)`: opens a `TransactionGroup("Sentinel: " + name)`; the body's own transactions run inside it; `true` → `Assimilate()`, `false` → `RollBack()`, exception → `RollBack()` then rethrow to the caller's existing handler. Used where one Sentinel action makes several transactions today: Apply Standard, BCF zoom (view + camera), change-request Show and Reset, MEP confirm, Heal. A group never spans two ExternalEvent calls.
*As built (package 1):* for Apply Standard, the BCF viewpoint, the change-request preview and the BCF snapshot (rolled back — no entry). MEP Openings keeps two entries: reconcile and place are two user-separated steps, and one group cannot span two ExternalEvent runs. Heal is left as is: whether `LoadFamily` may run inside a `TransactionGroup` is unverified, and Heal already pins its document.

**BG-1 · Updater lifecycle per document.** Register the DMU updater's triggers on `DocumentCreated` as well as `DocumentOpened`. Keep the registration state and the name snapshots in a dictionary keyed by the `Document` (looked up with `.Equals`, pruned on `DocumentClosing`, where `RemoveDocumentTriggers` is called). Re-snapshot names after `DocumentSaved` and `DocumentSavedAs`, so a request made after a first save carries the real old name.
*As built:* keying the snapshots by the `Document` itself makes a re-snapshot after Save / Save As unnecessary — the key no longer changes. The IFC Delivery Gate still finds its model by path or title; it moves onto `DocPin` in package 3, where its export changes anyway.

**Proof (B31).** Demo + aster-tower open: start each pinned action on Demo, switch to aster before it runs → refused with "switch back to Demo", aster's Undo list unchanged. Apply Standard, a BCF zoom and a change-request Show each leave exactly one "Sentinel: …" Undo entry; Cancel leaves none (Heal and MEP Openings are out of XC-2 for this package — see the as-built note). A close cancelled by another add-in leaves the model watched. File ▸ New project shows a live row after a non-compliant rename. Close and reopen aster in one session, then a request-mode rename creates a Pending request with the real old name.

## Package 2 — Right answers

**Typed parameter reads (SCAN-E1, the read part).** One helper reads a parameter by `StorageType` (String → `AsString`, Integer → `AsInteger`, Double → `AsDouble`, ElementId → `AsElementId`, else `AsValueString`), instance first then type — the rule `GovernedElementExtractor.ReadEntry` already follows. `RuleEngineHost.CheckParameter`, the DMU path and IFC Pre-Flight use it. A Yes/No set to "No" and a number set to 0 are filled values. Out of this pass: the new `categories` field and the multi-category scan.

**PRE-E2 · IFC-02 checks real required properties.** The required parameter names come from the ruleset's parameter rules and, when installed, the contract's required properties mapped through `PsetMap` — not `{org}_View Status`. A parameter that is missing from the element is flagged as well as one that is empty.

**BG-5 · One naming pattern.** The ⚡ Fix dialog validates with `RuleRegex.For(rule, org)`, the scanner's own pattern, and fails closed on a malformed rule with a message. The de-duplicated final name is checked against the same pattern and shown before Execute.

**BG-4 · ⚡ Fix respects REQUEST mode.** On a REQUEST row, ⚡ Fix files a Pending change request with the proposed name through `RequestManager`; the element is unchanged until a coordinator approves. WARN rows rename as today.

**BLOCK stops the sync (founder decision; replaces SCAN-E3's edit-time failure).** `App` handles `DocumentSynchronizingWithCentral`. It runs the document's full scan; if any BLOCK-mode violations exist it calls `Cancel()` and shows one TaskDialog: "Sync stopped: N BLOCK violations (rules …). The Sentinel pane lists them; fix them and sync again. Your work is safe — save locally." The pane shows those rows first. BLOCK rows get ⚡ Fix (through BG-5/BG-4 rules). No override in this pass; a coordinator changes the rule's mode on the web. The wrong updater comment ("enforced by failure-posting at sync time") is replaced by the truth. The same handler is the one place later sync checks go (package 3 adds CDE-01).

**GATE-E5 · Say what PASS covers.** The Revit gate dialog reads "contract PASS — IDS not checked here (Governed Publish judges ids@n)".

**CLM-4 · BCF export GUIDs and camera.** `BcfExporter` writes IFC GUIDs with `BcfApplyEvent.ToIfcGuid` (not the hex fallback) and camera points through `ActiveProjectLocation.GetTotalTransform()`, as `CaptureIssue` does. MEP Openings' export shares it.

**SCORE-E1 + Doctor header · Honest labels.** The pane figure is "Rule pass rate", the scorecard figure "Weighted rule score", pre-flight's "IFC mapping coverage"; the scorecard prints both rule figures with a one-line formula each. The Doctor header counts only lines that record an auto-resolved warning, not every log line.

*As built (package 2, after its adversarial review, 23 findings fixed):*
- PRE-E2: IFC-02 takes its required names from the delivery contract only (mapped per IFC class through `PsetMap.ForRequired`); the ruleset's parameter rules check views, which are not IFC elements, so they join when rules gain `categories`. Required property sets, unmapped names and no contract are Monitor "not checked" notes that the result dialog lists apart. The element's class reads Revit's built-in "Export to IFC As" first. The pane figure is labelled **IFC readiness** (not "IFC mapping coverage": it counts IFC-02 rows too).
- BG-5: the de-duplicated final name is not shown before Execute; instead the fix (and a proposal) is de-duplicated and re-checked against the rule, and writes nothing if it no longer passes. Proposals get the same guards; Approve on a name taken since then leaves the proposal pending with the reason.
- BLOCK at sync: only violations the syncing user can fix stop the sync (elements another user owns are listed, not blocking); rules with no BLOCK mode skip the pre-sync scan; a "rule not evaluated" note (empty office code) is Monitor, never a BLOCK; the post-sync pipeline (rescan, CDE-01, auto-publish, office scan) runs only after a sync that succeeded.
- CLM-4: `ProjectLocation.GetTotalTransform()` maps shared → internal, so the BCF writers (export and CaptureIssue) now use its Inverse and the reader uses it directly — the old code was inverted in all three places, which a Revit→Revit round trip hid. Owed: a live check on a model with a moved survey point and true north.
- Scorecard formula wording: "checks passed ÷ checks run".
- Second review (8 findings): Reject keeps a compliant hand rename; a BLOCK on an element changed in central, or on a workset another user holds, does not block (the dialog names Reload Latest); Approve/Reject failures show in the Change Requests window; each proposal failure says its reason; Pre-Flight with no contract never claims the gate will check.
- Known limit: an issue raised from Revit BEFORE this change stored its camera with the old (inverted) transform; on a model whose project location is not identity its camera opens in the wrong place — re-capture or re-post such a viewpoint.

**Proof (B32).** On aster: a filled Yes/No and a 0 number are not flagged; a required property stripped from 5 doors gives exactly 5 IFC-02 rows. ⚡ Fix on a compliant proposal shows "✓ Matches" and lands; on a REQUEST rule it files a Pending request. A BLOCK rule with one violation stops the sync with the dialog; after ⚡ Fix the sync runs. A clash exported to .bcfzip selects the element in the web Issues with the same camera. Each percentage carries its own name.

## Package 2b — Delivery gate coverage per class (GATE-E2)

Required property sets and properties are judged **per element class**: "FireRating 118/120 IFCDOOR". Values held on the type count (`IFCRELDEFINESBYTYPE` → the type's `HasPropertySets`). PASS requires full coverage unless the contract sets `min_coverage` (0–1) for that requirement; the contract parser accepts the optional field and defaults it to 1.0. The same change lands in all three copies with parity cases: `SentinelAddin/Engine/IfcDeliveryGate.cs` (checked in `tools/gate-check`), `WebApp/bridge/delivery-gate.mjs` (+ test) and `CloudComponents/delivery-gate/src/main.js` (+ test, published as 1.0.6). Moving the two platform automations to 1.0.6 is the founder's action.
aster-tower may FAIL after this; if it does, that is the true answer and is reported as such.

**Proof.** 1 of N walls with FireRating → FAIL "1/N" in all three; all filled → PASS; the Node and C# verdicts match on the fixture set.

## Package 3 — Publish that exports everything and does not freeze

**GP-2 · Whole-model export, clean document.** `PlatformExporter` stops setting `FilterViewId` (no filter = the whole model). The export's transaction is rolled back after `Document.Export`, so no Undo entry is left and `IsModified` is unchanged by the publish.

**GP-3 · CDE-01 before the sync.** The sync handler from package 2 also runs the container-name judge (`CdeSyncGuard.Decide`) against the cached naming@n: reject mode → `Cancel()` with the failing field named; warn mode → "Sync anyway / Cancel". The org-pattern short-circuit is removed so CDE-01 and the bridge's /propose give the same verdict.

**GP-1 · Progress and Cancel.** A progress window on its own STA thread shows the stages (export, gate, referee, register). `Application.ProgressChanged` feeds it and carries Cancel; whether the IFC exporter reports progress and honours Cancel is measured, and the drill records the result either way. The referee wait (up to 120 s) runs off Revit's UI thread with a `CancellationToken`; Revit stays usable. Auto-Publish announces "exporting…" in the pane before it starts.

**Proof (B33).** On the aster local (only `{3D - user}` views, one with a section box), the manifest element count equals the exportable model element count; after a publish `IsModified` is false and Undo shows no publish entry. CDE-01 names "AST_ASTR26_Aster Tower" as failing naming@1 before the sync, and Cancel leaves no new central history entry. The progress window shows at least 3 updates; the Cancel result is recorded.

## Package 4 — The person's name on every write

**SI-1 · No silent fallback.** A refresh that fails without being refused keeps the stored session and retries on the next call. While a session file exists, a call never falls back to the PC's shared token; it fails with "session not refreshed — retrying", shown in the pane.

**GATE-E1 (H5) · Gate rows for signed-in users.** The Revit gate row is recorded under the signed-in person (the bridge accepts a signed-in contributor's gate "check" row, as `recordRevitReport` already does for naming and family_heal). The dialog ends "Recorded: ledger #<id>".

**XC-4 · One identity.** In-model audits and evidence text use the signed-in e-mail when a session exists; signed-out writes read "unsigned — <Windows user>", never "Revit". The coordinator role comes from the web project (lead and above), not from `settings.json`.

**Proof (B34).** Signed in: ⚡ Fix, a change-request approve, a Fix-in-place Apply, a gate run and a Governed Publish all name the e-mail, in the model and on the ledger (SQL read of `audit_log`). Network blocked near token expiry, then restored: the next write still names the e-mail. Signed out: writes read "unsigned — <user>". A contributor sees Change Requests read-only.

## Order and dependencies

1 → 2 → 2b → 3 → 4. Package 3's GP-3 reuses package 2's sync handler. XC-1 lands first because the ⚡ Fix and request changes in package 2 run through it. One implementation plan per package, written just before that package is built.

## Out of scope (next)

A ledger row for every model-changing action (XC-5, with blueprint P1-9); network off the UI thread outside the publish path (XC-3); the pane redesign (Approach B); the power tools (Approach C); parameter rules with categories (rest of SCAN-E1). Founder decisions still owed: SCORE-E2 vs "HealthScorecard v1 untouched", the clash direction (ROADMAP.md:53), the code-signing certificate, and "Annotate Views" rename or extend.

## Risks

- A full scan inside `DocumentSynchronizingWithCentral` adds time to every sync; measured on aster in B32 (budget 15 s, the updater's own full-scan budget).
- A whole-model export (GP-2) and per-class coverage (GATE-E2) can turn today's PASS verdicts into FAIL. That is the honest outcome; the drills record it.
- Whether Revit's IFC exporter honours `ProgressChanged` Cancel is unknown until measured.
- Package 4 needs the founder signed in during the drill.
