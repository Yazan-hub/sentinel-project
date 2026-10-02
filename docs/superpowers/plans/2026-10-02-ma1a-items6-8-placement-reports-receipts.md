# MA-1a items 6–8 — the placement block, the modelling commands' reports, the build:run receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three things change in what Sentinel places and in what it records:
- **Placed elements go where the office says (item 6).** `guideline@n` gains a `placement` block: a workset per category, and the phase. Every element Sentinel creates — from an agent's changeset, Promote, Ghost Builder, Datum or Photo Massing — goes to the workset its category names and to the phase of the view the person builds in. Sentinel never places into a design option: a build while an option is being edited is refused by name. And the **office-template check**: Ghost Builder, Photo Massing and Promote refuse a model that holds none of the office's types — "this model was not made from the office template" — and otherwise say how many it holds.
- **Each modelling command leaves a ledger row (item 7).** Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, ⚡ Fix (auto-fix), fix-in-place and the Doctor each report one row per run, with counts and the actor. The report is sent off Revit's API thread and never waited for: an unbound model or an unreachable bridge does not block or delay the command, and the pane's log says what the ledger answered. The ROI dashboard counts auto-fix, fix-in-place and Doctor rows.
- **Each reader run leaves a receipt, and the bridge sets the trust fields (item 8).** Ghost Builder, Photo Massing, Datum and Promote each post a `build:run` receipt stating only what the run knows. On `POST /changesets/:key` and on the MCP tool, `pretick`, `accuracy`, `confidence`, `typing`, `claimed` and `proposal_guid` in a posted body are ignored and listed back as "ignored: set by the bridge". An agent's element opens **unticked** in Review AI Proposals and reads **not measured**.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md`:
- §7.2 MA-1 (1a) items 6–8 (`:1052-1054`), with drill rows `:1066-1068`;
- §2.5, the rows "Worksets, phase, design options for placed elements" and "Start from the office template" (`:281-282`), and §6.7 "`guideline@n` gains a `placement` block" (`:862`);
- §6.6, the `build:run` row (`:827`), the command-reports row (`:835`) and the report volume rule (`:853`);
- §6.3 "Trust rules (the bridge enforces them)" and the pre-tick rule (`:732-754`), and rules 2, 3 and 6 of §1 (`:163-171`).

Also the audit's XC-5 (`docs/strategy/2026-09-30-revit-addin-audit.md:1048`) and the blueprint's P1-9 (`docs/strategy/2026-09-29-sentinel-blueprint.md:1191`). Base: master `f5b474f`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:**

*Item 6.* The block is a field of the guideline, validated in the same words by the bridge (`artefact-store.mjs`) and by the add-in's loader (`GuidelineMatcher.CheckGuideline`); one shared fixture proves the parity. Every lookup and every sentence is pure (`PlacementPolicy`). One Revit-bound writer (`PlacementApply`) reads the active design option, the model's worksets and the active view's phase, and writes two things on each created element: `ELEM_PARTITION_PARAM` and `CreatedPhaseId`. It is called inside each placer's own transaction, after its creates and before its stamp — the changeset executor (Ghost Builder, Review AI Proposals, Promote), `DatumBuilder.Build` and Photo Massing's `PlacePrepared` — so one Ctrl+Z takes the workset and the phase back with the element. The refusals (a design option being edited, a workset the model lacks, a guideline that could not be read) come before any transaction and before anything is filed. The summary's workset and phase counts are taken after the commit, from the elements still in the model. The office-template check is a count (`GuidelineMatcher.OfficeTypesIn`) of the catalogue's types in the guideline's categories against the model's types, which Ghost Builder already reads for its drop-downs.

*Item 7.* The bridge's Revit report route (`POST /cde/:key/audit`) allows eight more row types, under the limits it already has. The add-in's rows are pure builders (`CommandReports`). One poster, `GovernedNotify.Report`, sends a row on a pool thread and logs the ledger's answer in the pane; it never waits. Each command calls it once, after Revit committed. The Doctor's resolutions are gathered per project for one minute (`DoctorBuffer`) and reported as one row.

*Item 8.* `validateChangeset` (the bridge's pure half) sets `pretick` and `accuracy` on every element and `claimed` on the changeset, and returns the list of posted fields it did not keep; the store keeps that list on the changeset, so the 201 reply carries it. The bridge pre-ticks a Promote retype or attach only when a signed-in member filed it, never for the machine credential. The add-in's review reads the bridge's `pretick` (`ChangesetTrust`), and never pre-ticks a create whatever a bridge answers. A receipt is one more report row (`entity_type` `build`): the bridge words its action `build:run` and marks it `claimed` for every caller. The three Ollama callers count their round trips and Ollama's own token counts (`ModelUsage`); the receipt (`BuildReceipt`) is pure.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json); the Node bridge (`WebApp/bridge/*.mjs`, vitest beside the code); the web's TypeScript core (`WebApp/src/sentinel-core`, a type only); offline C# console checks (`tools/*-check`, net8, `SENTINEL_CHECK`); the Supabase ledger (`audit_log`, no migration).

**Global constraints:**
- Branch `feature/ma1a-items6-8` from master `f5b474f` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA1a-I68 is recorded** (review amendment C11); push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - Placement is all-or-nothing and the commit check stays: a changeset lands whole or not at all, and nothing is reported that Revit did not commit.
  - A stamp's facts come only from the in-process placer, never from what the bridge returned (review amendment C1 of the items 3–5 plan).
  - Nothing is erased silently. Every refusal says why, in plain words. Counts are honest: what a line says was counted.
  - One Undo entry per Sentinel action. The workset and phase writes are inside the placer's own transaction.
  - A ledger row is never invented for something that did not happen: a report or a receipt is posted only for what Revit committed or the bridge filed.
  - The bridge, not the caller, sets the trust fields.
  - No secret goes into a row. A report or a receipt carries no file contents, no path, no prompt and no model answer, and no personal data beyond the actor the bridge already records.
  - No network call of items 7 and 8 runs on Revit's API thread, and none is waited for.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`.
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (implicit usings are off for net48); use the Edit tool for C# strings that contain escapes.
- No new dependencies and no new check project: extend `tools/promote-check`, `tools/roi-check` and the bridge's vitest files. These check projects compile files this plan changes, and all must stay green: `annotate-check`, `guideline-check`, `ghost-standards-check` and `wallpair-check` (`GuidelineMatcher.cs`); `ghost-p2-check` and `ghost-standards-check` (`GhostBuilder_Architecture.cs`); `ghost-p2-check` (`DoctorPolicy.cs`); `session-check` (`ChangesetClient.cs`).
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run bridge/…`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan (the `heal-check` pattern) and proven in the drill.
- No Revit, no deploy and no bridge restart during the tasks; the live drill is a separate session (last section). Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `analyze_model_statistics`, `get_current_view_info`, `get_current_view_elements` and `get_selected_elements` (an element's id for Manage ▸ Select by ID, as MA1a-I35 read grid ids). Never a create, delete, operate, colour, tag or `send_code_to_revit` call.
- After each code task run `graphify update .` (per `C:/Users/yazan/CLAUDE.md`); if `graphify` is not on PATH, say so and move on.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are master `f5b474f`'s and shift as tasks land: match the quoted text, not the number. The files are CRLF on disk, and the Edit tool matches the text.

**Dry run (planner, 2026-10-02):** every code step below was applied in order, task by task, to a fresh `git archive` export of `f5b474f` in a scratch folder, and the checks were run after each task; each "see it fail" step was run and failed as written. The steps were then applied once more, start to finish, to a second fresh export. The code blocks in this plan are the exact text that was applied. Results on the final tree:
- Builds: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)` — master's counts. The Revit 2027 build (net10) also compiles with `0 Error(s)`; it is not one of the required builds.
- `promote-check`: `275` after Task 2, `285` after Task 3, `288` after Task 4, `313` after Task 6, `327` after Task 7, `350` after Task 10, `360/360` after Task 11 (master `231/231`).
- `roi-check` `50/50` (master `43`); `ghost-standards-check` `147/147` after Task 12 (master `146`).
- All 25 check projects pass on the final tree; the others as on master.
- The full `bridge/` suite: `Test Files  83 passed (83)`, `Tests  1668 passed | 1 skipped (1669)` (master `1630 passed | 1 skipped`).
- The drill's guideline and catalogues pass the bridge's `validateArtefact`.

The dry run found two things the plan now carries: `ghost-standards-check` also compiles `GhostBuilder_Architecture.cs` (Task 11 adds `ModelUsage.cs` to it), and a pane line logged from a pool thread needs the pane's own dispatcher (Task 7's `Report` takes one). Comments in the plan's prose, the commit messages and the drill were not part of it. Nothing in the repo was changed by it.

**After the review (2026-10-02):** the review amendments below changed code blocks in Tasks 1–4 and 7–12. The amended plan was then dry-run once: a script applied every Create, Append and replace step of Tasks 1–12, in order, to a fresh `git archive` export of this branch in a scratch folder. All 182 steps applied, each replace matching its text exactly once. On that tree:
- `promote-check` `384/384`; `roi-check` `50/50`; `ghost-standards-check` `147/147`; `guideline-check` `17/17`; `ghost-p2-check` `103/103`; `session-check` `47/47`; `wallpair-check` `9/9`; `heal-check` `9/9`; `event-check` `44/44`; `massing-check` `14/14`; `annotate-check` `ALL PASS`.
- The five bridge test files this plan changes: `381 passed` (`artefact-store` 186, `write-roles` 62, `changesets-logic` 73, `changesets-store` 28, `mcp-server` 32).
- Both builds `0 Error(s)`, with master's warning counts (Revit 2024: 5, Revit 2026: 3).
- The drill's guideline, catalogues and changeset bodies pass the amended validators, and the drill's inline scripts compile.

Not run after the amendments: the "see it fail" steps; the totals between tasks (`284` after Task 2, `301` after Task 3, `306` after Task 4, `331` after Task 6, `350` after Task 7, `374` after Task 10 — computed by hand from the checks each task adds; the last, `384`, was seen); the full `bridge/` suite (`1675 passed | 1 skipped` is master's 1630 plus the 45 new tests seen passing); `datum-check`; the Revit 2027 build; and every line of the drill section, which only Revit can run. Report the real totals. A total between tasks that differs is a count to explain in the task's report; a `FAIL` line is a failure. Nothing in the repo was changed by the dry run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds option **A** of each. None needs an answer before the work starts.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | Which commands put a new element on the office's workset and phase | **A:** every command that creates elements: an agent's changeset, Ghost Builder, Promote, Datum and Photo Massing. **B:** only those that place through the one executor (not Datum, not Photo Massing) | **A.** The design says "each placed element". Datum makes levels and grids, the elements an office most often keeps on their own workset. Ceiling: Datum and Review AI Proposals now read the project's guideline before they place, a wait of 4 s at most when the bridge does not answer (Annotate waits the same way) |
| F2 | The guideline names a workset this model does not have | **A:** nothing is placed, and the dialog names the workset: "Create it (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again". **B:** place on the active workset and say so. **C:** Sentinel creates the workset | **A.** It is the rule a named level already follows: a named thing that is missing is refused, never replaced. Apply Standard is the tool that creates worksets. Only the worksets this batch needs are asked for |
| F3 | A design option is being edited when the person builds or applies | **A:** nothing is placed, and the dialog names the option: "Switch to Main Model, then … again". **B:** ask "Place in option X / Go back", Go back first | **A.** The design says "never into a design option unless the person picks one". A cannot place into an option by mistake. Ceiling: under A a person cannot place into an option with Sentinel at all; B lifts that and is in Next. Drill row I6-5 records it |
| F4 | The model is not workshared, or the active view has no phase (a sheet, a legend) | **A:** build anyway; that part is skipped and the summary says so ("Worksets: not set — this model is not workshared …"). **B:** refuse to build | **A.** A blank project from a template is never workshared; with B the design's own drill ("blank project from the office template") could not build |
| F5 | When the office-template check stops a build | **A:** only when the model holds **none** of the office's types in the guideline's categories; otherwise it says "Office template: N of M office type(s) present". **B:** never stop, only say the count. **C:** stop under a share (say, fewer than half) | **A.** A real project loses types to Purge Unused, and a type the model lacks is already refused element by element. Zero is the one count that can only mean "not made from the template". The founder can set a share (C) once real counts are read: the drill records the first one on `ma0-bds` (row I8-3: the B35 model, made from the BDS template, against its `type_catalog@1`); a blank BDS-template project and aster-tower are still owed (UNSURE 8) |
| F6 | Which phase a new element gets | **A:** the phase of the view the person is in when they build or apply (`phase: "view"`). **B:** a phase the guideline names | **A.** The design says "in the view's phase". Ceiling: a build started from a sheet or a legend sets no phase, and says so. Whether a schedule answers a phase is settled in the drill (UNSURE 3) |
| F7 | The BDS pilot's guideline | **A:** left as it is (version 3, no placement block). The drill uses its own small guideline on a scratch project. **B:** add a placement block to it with the WS-01 workset names, as version 4 | **A.** The workset each category belongs on is the office's decision (BDS's BIM lead), not Sentinel's to guess. B is one file once they are confirmed |
| F8 | The ROI dashboard and the three fixes that now reach the ledger (auto-fix, fix-in-place, Doctor) | **A:** counted on their own line, not priced; the "Not counted" line no longer lists them. **B:** also priced | **A.** B needs the office's minutes per fix and a new `roi@n`: a number only the office can give |
| F9 | How a receipt names the version of the add-in that read the evidence | **A:** the sha256 of the add-in's own file: it names the exact build, and nobody has to remember to raise a number. **B:** give the add-in a version number and report that | **A.** The add-in has no version number today. Ceiling: a sha is not readable by eye; B can be added beside it |
| F10 | When a receipt is written | **A:** for a run whose result was kept: a Ghost or Massing build that was built, a Datum run that created something, a Promote run that filed changesets. **B:** for every reader run, also one the person cancels at the review | **A.** A receipt's gaps are known only once the build is planned, and a cancelled review changed nothing. Ceiling: a reader run that is cancelled leaves no row |
| F11 | An agent's element that passes the project's IDS | **A:** it opens **unticked** in Review AI Proposals; the person ticks it. **B:** it opens ticked, as today | **A.** It is the design's rule: "agent ghosts and drawing-only ghosts are never pre-ticked". This changes today's behaviour, and the drill row I8-1 shows it |
| F12 | How often the Doctor writes a row | **A:** one row per project per minute in which it resolved something. **B:** one row at each save or sync. **C:** one row per transaction | **A.** C would spend the 20-a-minute budget in a busy minute of drafting. B would report, at a later save, fixes made in a model that was closed without saving. Ceiling: a minute still open when Revit closes is lost — a missing row, never a wrong one |
| F13 | The licence of a local model's weights in a receipt | **A:** the receipt names the model and says its licence was **not read**. **B:** Sentinel asks Ollama for the model's licence text and its digest, and reports them | **A.** A hard-coded licence for a model tag would be a guess: a tag can point at different weights. B is a small step in Next; until then the design's licence rule (`:932`) is met for tools and stated as unmet for weights |
| F14 | Who earns the pre-tick of a Promote retype or attach (review amendment C2) | **A:** only a changeset a **signed-in member** filed. Filed with the machine credential — a signed-out PC, the MCP server, any script that holds the token — it opens unticked, whatever its `source` says. **B:** as before: by the source `promote`, whoever posts | **A.** "The bridge sets the trust fields, never the caller" (design `:165`): under B any holder of the token pre-ticks its own rows by writing `source: "promote"`. Ceiling: on a signed-out PC Promote's rows open unticked and "Tick suggested" ticks none — the person ticks by hand, or signs in (H4) |
| F15 | The project's guideline could not be read when a command is about to place (bridge unreachable and no cached copy, a body that does not parse, a signed-out session with no cached copy) (review amendment C7) | **A:** nothing is placed: "the project's guideline could not be read (…), so its placement block is unknown". **B:** place on the active workset and say `Placement: not checked — <why>` | **A.** It is F2's rule: the office may have named worksets, and a guess would put every element on the wrong one. Ceiling: in a bound model with no cached guideline, Datum, Ghost Builder, Photo Massing and Review AI Proposals do not place while the bridge is unreachable. With a cached copy they place by it; a model that is not bound, a project with no guideline installed, or a project the bridge does not have yet (C30), places as before |

## Review amendments (2026-10-02, BINDING — they override any task text they contradict)

Three independent reviews — code reality, trust and honesty, and whether the plan and its drill can be run as written — raised the points below. Each was checked against the code or the design line it cites. Where it held, the plan was changed where the problem is: the tasks, checks, commands and drill rows in this document already carry the change, and this list says what changed and why. Where two findings pulled apart, the one that keeps the invariants of Global constraints was taken, and the amendment says so. Report the real check totals (see "After the review" above).

- **C1 (Task 9 Step 5; drill I8-2 — critical): the MCP tool sends a source it controls.** A `source` given as contract 2's object (`{ reader: "promote" }`) passed the string-only guard and was stored as `promote`, so an agent's retype and attach rows came back pre-ticked. The handler now forwards the label only when it is text and not `dwg` or `promote`, else `agent`; the tests and the drill row cover the object and the list forms.
- **C2 (Task 9 Steps 3–4; F14; E11; drill I8-3, I8-6 — important): the machine credential earns no pre-tick.** `pretickOf` read only the caller's own `source` text, so any holder of the token set a trust field by writing `promote`. `proposeChangeset` now reads the caller's role, and a Promote retype or attach is pre-ticked only for a signed-in member's post. The cost is said in F14 and Risks: on a signed-out PC Promote's rows open unticked.
- **C3 (Task 9 Step 3 — important): nested fields are rebuilt and listed.** `place` was stored whole, so a posted `place.pretick` or `place.measured` stayed on the record, unlisted. A place is rebuilt from the `PlaceDto` names; every other key of `place`, `target` and `validate`, and a trust field inside `validate.identity`, is listed under `ignored` and not stored.
- **C4 (Tasks 9 and 10 — important): contract 2's `cid` and `evidence` are kept, and one shared fixture pins the stored shape.** The design asks for them (`:735`, `:1054`); the plan dropped them without asking the founder. They are kept as the caller's claim, checked for size and control characters; `measured` stays ignored until MA-4. `fixtures/changeset-ops/contract2-trust.json` is read by vitest and by `promote-check`, in place of the hand-written literal. The design's "`contract-parity.test.mjs`" names the delivery-gate file; the changeset parity lives in `fixtures/changeset-ops/`, as the earlier fixtures do.
- **C5 (Task 3 — important, with one minor): a workset write Revit refuses leaves the changeset proposed.** The throw landed in the executor's general catch, which Review AI Proposals reports to the ledger as declined — a proposal nobody declined, lost to this session's model state. `PlacementApply` throws `PlacementRefused`; the executor rolls back and answers `NotRun`; Ghost Builder abandons the build and withdraws what it filed; Datum says it in its own dialog, not as an external-command exception.
- **C6 (Tasks 2–3 — important; raised by two reviews): the workset and phase lines are counted after the commit.** The tally was filled inside the transaction, before the recount removed what Revit deleted at commit, so a line could say more than was placed. `PlacementApply` records what it wrote per element (`PlacementPolicy.Written`), and each placer builds its lines from the elements still in the model.
- **C7 (Tasks 2–4; F15; drill I7-7b — important): a guideline that could not be read is refused.** `GhostStandards.Load` never throws, so an unreachable bridge with no cached copy read as "no placement block", and the elements went to the active workset with a false reason. The four commands now refuse (`PlacementPolicy.UnreadRefusal`). Of the two ways the finding offered, refusing was taken: it is F2's rule — a named thing that cannot be found is refused, never replaced. F15 gives the founder the other.
- **C8 (Tasks 1–3; E1, E4 — important, with one minor): a block's category keys are checked, and the pre-check asks only for what a batch can use.** A misspelt key installed, and then left that category on the active workset with a false reason. Both validators refuse a key that is not one of the ten categories Sentinel places, or a category named twice. A column asks for `Columns` only (the executor takes `OST_Columns`); Photo Massing asks for the kinds of the layers it staged; Datum's over-ask is accepted and said in E4. One finding listed `Structural Columns` among the valid keys: it is left out, because no placer creates one, and a key nothing honours would read as honoured.
- **C9 (Task 7 Step 8 — important): Apply Standard reports only what Revit committed and kept.** `StandardsBuilder` added to `Created` before each commit and checked no status; `SentinelUndo.Run` ignored its group's status; "Ruleset: installing" counted as a creation. A step now keeps its lines only on a committed transaction, `Run` answers whether the group was kept, and the report is built from the model's creations only.
- **C10 (Task 3; E5; drill I6-5 — important): Ghost Builder and Photo Massing refuse a design option before they read anything.** Ghost refused only at Build — after its own kept DWG import, a transaction, and minutes of reading. Both commands now ask at the top; the build-time check stays, for an option entered while the review is open.
- **C11 (Global constraints; Task 12; the Merge section — important): the merge follows the drill.** Task 12 merged before the drill that proves item 6's Revit half, though UNSURE 4 can send F3 back to the founder. Task 12 ends at the drill data; the merge and the deployment note are a section of their own after the drill, as MA1a-I35 was done.
- **C12 (drill set-up; I6-8, I7-1, I7-7a, I8-4 — important): the Datum rows can create something.** The B35 model already holds the five grids of `sample-grids.dxf`, so those rows created nothing and their pass lines never appeared. Each Datum row first deletes grids in its scratch copy; `ma1a-i68-unbound.rvt` is made in the set-up; the expected count is written.
- **C13 (drill set-up; I6-2, I8-2 — important): every drill call names the test bridge itself.** `config/.env` wins over the shell's `BCF_BASE` in `artefact-import.mjs` and `mcp-server.mjs`, so the installs and the MCP post could have gone to the founder's 4100 bridge, and the plan's check could not tell. One helper (`b4101`) sends each call to `http://127.0.0.1:4101`; the test bridge's start command and I8-2's command are written out; a probe prints which names `config/.env` sets, never a value.
- **C14 (drill set-up; I7-1, I7-7c — important): the design's "signed-in actor, within the report budget" line is run, or owed.** Signed out, the report route applies no role check, no cap and no budget, so the default path proved none of them. Signing in is the founder's one step, with the membership call written; when the founder is away those clauses are recorded as owed, never as passed.
- **C15 (drill I7-3, I7-4, I7-5, I7-9 — important): no report call passes as "not run".** I7-3 follows B31-4's path, with a second Build that must write no row. I7-4 runs on `ma0-bds` with FN-01, as B32-3 did. I7-5 and I7-9 are named owed before the first row, and the record ends with the owed list.
- **C16 (Task 12 Step 1; drill I6-9, I8-3; UNSURE 2, 3, 8; F5 — important): three open facts get a row.** The drill guideline sends doors, columns and ceilings to a workset, and I6-9 places one of each; its second post puts a door in a wall of a later phase; I8-3 records the first real office-template count. A floor, a window, a roof, the blank-template project and aster-tower stay owed, and F5 says so.
- **C17 (Task 3 — minor; raised by two reviews): Photo Massing never takes another model's view.** `PlacementApply.Resolve` reads a view of another document as no view, and the Massing event checks `DocPin` before it builds. Both fixes were taken: the first protects every caller, the second says why in the person's words.
- **C18 (Task 3 — minor): the placement lines are not printed under "Warnings:".** `PlacementReport.Placement` and `DatumResult.Placement` carry them, and the summaries print them as lines of their own.
- **C19 (Task 7 Step 5; Task 11 Step 5; E7 — minor): Ghost Builder posts its report and its receipt only for a build that left an element in the model.** A kept build whose every element Revit removed at commit would have posted "placed 0".
- **C20 (Task 3 Step 5; Risks; Next — minor): the executor's comment says what `Unsafe` does.** It does not refuse a wall's retype in a design option. The comment says so, and the gap is in Risks and Next; it is not fixed here, because it predates the plan and changes MA-0's wall checks.
- **C21 (Task 7 Step 12 — minor): the Provenance reader does not claim a ledger row.** It says a bound run is reported since item 7, and that the pane's log said whether the ledger recorded it.
- **C22 (Task 7 Step 3; E16; Risks — minor): a 413 or a 429 on a report reads "not recorded".** The report route refuses both before it writes; `GovernedNotify.Report` words them so, for this poster only. A throttled row is lost, not retried, and Risks says so.
- **C23 (Task 7 Step 11 — minor): a Doctor resolution carries its project.** `Pending` is one list for every open model; a row now counts only resolutions seen in the model whose transaction committed.
- **C24 (Task 8 — minor, taken in part): one ROI row adds at most 100,000.** A forged row can no longer wrap the line. The finding's other half — a `reported_by_client` mark on every report row — is not taken: the reason is in this review's return, and in Risks "The report rows are a person's own report".
- **C25 (Task 2; F4, F6; UNSURE 3; drill I6-8 — minor): a schedule is not listed as a view with no phase.** The sentence names a sheet and a legend; the drill records what a schedule answers.
- **C26 (Global constraints; Tasks 1, 2 and 12 — minor): the check projects that compile `GuidelineMatcher.cs` are named right.** They are `annotate-check`, `guideline-check`, `ghost-standards-check` and `wallpair-check` — not `ghost-p2-check` — and `annotate-check` is in the baselines and the final checks.
- **C27 (Task 5 Step 2; the Deployment note; Risks — minor): what an old bridge answers is stated per caller.** A contributor gets 403, a lead or owner 400, and a signed-out PC's row is written, unmarked.
- **C28 (drill; Task 10 — minor): small steps show instead of describe.** The ROI dashboard is opened on both projects (I7-8). The closing list restores the bridge settings from a backup and compares hashes, signs out, stops the test bridge, names the deployed build and lists what was left on the shared ledger. No drill row writes to `demo`. The off-axis wall is made by a typed rotation. I7-1 reads the row I6-2 wrote. The community MCP's read-only calls are named. Task 10 Step 3 says "two replacements".
- **C29 (after the build — the review of items 6–8; E2; drill I6-9 — important, raised by two reviews): a workset or phase write that throws is a placement refusal too.** C5 covered only a workset write that answers false. A `Set` or a `CreatedPhaseId` write that throws went to the executor's general catch, and the changeset was reported as declined. `PlacementApply.Apply` now turns any exception of an element's workset and phase writes into `PlacementRefused` (`PlacementPolicy.WriteRefusal`, with the element and Revit's own words), so every placer rolls back and a changeset stays proposed. Not changed: a failure Revit raises at commit still ends as declined, as any Revit failure does — I6-9's second post records which of the two a door in a wall of a later phase gives.
- **C30 (F15; drill I7-7d — important): a project the bridge does not have yet is "no guideline", not "could not be read".** The bridge's 404 `no_project` is an answer: there is nothing to read. It was refused as unread, so Datum and Ghost Builder placed nothing in a bound model whose project row did not exist yet — and Ghost's first filing is what creates that row. `ResolvedArtefact.NoProject` is set where the answer is read, and the four commands pass it with `NotInstalled`. F15's ceiling already said such a project places as before. Ceiling: a mistyped key also places with no block, and the dialog says only the no-block line.
- **C31 (C6; C9 — minor): Datum's counts, and Apply Standard's ruleset line.** Datum's report row, receipt and dialog count its levels and grids after the commit, from what is still in the model, as its placement lines already did. When Revit does not keep Apply Standard's Undo group, only the model's lines are listed as failed: the ruleset install's line stays, because that install still runs on the bridge.
- **C32 (C3; E12 — minor): the ignored list reaches every level.** A wall's `LocationCurve` is rebuilt from `start`, `end` and `mid`; a trust field on a pset or quantity entry, on an exception row, or in `validate.identity` under another case (`Pretick`) is listed and not stored; a `source` that is not text or contract 2's object is listed. A listed field name is one line of at most 200 characters. A guideline's category key that carries a byte-order mark is refused by the bridge, as the add-in refuses it (one more case in the shared fixture).
- **C33 (the Merge section; the drill record — minor): item 8 is not full contract 2.** A contract-2 post still needs `place.TypeName` (the design's own example body, `:686-705`, is answered 400) until bridge typing lands (MA-2). The drill record and the merge message say so. Review AI Proposals' "still pending" sentence no longer ends "on that model": the wrong-model refusal names the model itself.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The block is `placement: { worksets: { <category>: <name> }, phase: "view" }`. An unknown key inside it is refused by both validators. No design-option field | The design-option rule is fixed, so a field could only weaken it. A category key must be one Sentinel places — `Walls`, `Floors`, `Roofs`, `Ceilings`, `Doors`, `Windows`, `Columns`, `Furniture`, `Levels`, `Grids` (case and padding ignored, one key per category); any other key is refused at install by both validators, so a misspelt key never installs (C8) |
| E2 | The workset is written with `ELEM_PARTITION_PARAM` on each created element, inside the placer's transaction. The active workset is never switched and no workset is created | It is undone with the element, and the person's active workset is not touched. A workset that cannot be set throws `PlacementRefused` inside the transaction: the batch rolls back with the reason, and a changeset stays proposed (`NotRun`) — it is this session's model state, not a verdict on the changeset (C5) |
| E3 | The element's category is matched to the block's key through `Compat.MatchesCategoryKey` (by `BuiltInCategory`), which gains `Levels` and `Grids` | Category names are localized in Revit; the block's keys are English |
| E4 | The pre-check asks for the worksets of the batch's **kinds** (`PlacementPolicy.CategoriesOf`); a column asks for `Columns` (the executor takes a column's type from `OST_Columns` only). Photo Massing asks for the kinds of the layers it staged. Datum asks for `Levels` and `Grids` by what the drawing holds, not by what will be new | A refusal must come before the transaction. Ceiling: a Datum run whose levels all exist already can still be refused for the Levels workset; accepted — the refusal names the workset (C8) |
| E5 | The executor refuses an active design option itself (`NotRun`: the changeset stays proposed). Ghost Builder, Datum and Massing ask the same question before they file or start | One sentence, one reader (`PlacementApply.DesignOptionRefusal`); Ghost must not file a changeset for a build that will not run. Ghost Builder and Photo Massing also ask at the top of the command, before a drawing is imported or an image is read (C10) |
| E6 | Review AI Proposals and Datum fetch `guideline@n` off the UI thread and wait (4 s at most), as Annotate does | Placement needs the block before it places. The report calls of item 7 are different: they are never waited for. A guideline that could not be read is refused, never read as "no block" (C7, F15) |
| E7 | A report is posted only when the model changed: a run that created nothing writes no row | "One row per action" and "never invented". A refused or rolled-back run is not an action on the model. Ghost Builder too: a kept build whose every element Revit removed at commit posts no report and no receipt (C19) |
| E8 | A Datum or Massing element's stamp still names no ledger row; the reader says its run is reported after placing | The row exists only after the commit; writing it back would be a second transaction and a second Undo entry (E5 of the items 3–5 plan) |
| E9 | Ghost Builder writes two rows per kept build beside its changesets' rows: `ghost_build` (the build's counts) and `build` (the reader's receipt) | The design's table lists both (`:827`, `:835`). They answer different questions: what was placed, and what read the drawing |
| E10 | The stored `source` stays a string. Contract 2's `{reader, job_id}` gives its reader; the `job_id` is listed as ignored | Deployed add-ins read `source` into a string; an object there would break reading the project's whole proposed list |
| E11 | Every changeset is `claimed: true`. `pretick` for a retype or attach needs the source `promote` **and a signed-in member as the caller**; a post with the machine credential is never pre-ticked (C2, F14) | The bridge cannot tell the add-in from another holder of the machine credential, so that credential earns no pre-tick. The MCP tool never files as `promote` or `dwg`, whatever shape its `source` argument has (C1). A signed-in contributor who posts `source: "promote"` directly still earns it: a verified person, named on the ledger. Closing that needs a plan the bridge can check (MA-2) — see Risks |
| E12 | A posted field the bridge does not read (`lod`, `won`, `conflicts`, …) is listed under `ignored` with "not a field this bridge keeps" — at the top of the body, on an element, and inside its `place`, `target`, `validate` and `validate.identity` (C3). `cid` and `evidence` are kept, as the caller's claim (C4) | Before, it was dropped without a word, and a `place` was stored whole. The list is capped at 200 entries, with a count of the rest |
| E13 | The add-in never pre-ticks a create, even if a bridge answers `pretick: true` | The rule then holds against a bridge that was not restarted, which has happened |
| E14 | The receipt reports `tokens` only when Ollama's reply carried `prompt_eval_count` or `eval_count`; otherwise `null` with a note. A deterministic run reports `model_calls: 0` | Only what the run can state. Whether Ollama sends the counts with a JSON-schema `format` is settled in the drill (UNSURE 10) |
| E15 | `GovernedNotify.Report` logs through the pane's dispatcher with `BeginInvoke`; the Doctor's flush, on a pool thread, hands over the dispatcher it captured on the API thread | A pool thread has no pane dispatcher of its own; an `Invoke` from a worker can wait on a thread that waits on it (`App.OnSynchronized`'s rule) |
| E16 | `LedgerResult` is not changed. `GovernedNotify.Report` itself words a 413 or a 429 as "not recorded" (C22) | The report route refuses both before it writes (`recordRevitReport`). Every other route's 413 and 429 still read "not confirmed" until each is checked (Next). A throttled report is lost, not retried (Risks) |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `WebApp/bridge/fixtures/guideline-placement/cases.json` (new) | 1, 2 | The placement block's accepted and refused cases, read by vitest and by `promote-check` |
| `WebApp/bridge/artefact-store.mjs` | 1 | The bridge's check of the block |
| `WebApp/src/sentinel-core/guideline.ts` | 1 | The block's type |
| `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` | 2 | `GuidelinePlacement`, the add-in's check of the block, `OfficeTypesIn` |
| `SentinelAddin/Engine/PlacementPolicy.cs` (new) | 2 | Pure: lookups, refusals and summary lines of item 6 |
| `SentinelAddin/GhostBuilder/PlacementApply.cs` (new) | 3 | Revit: the design option, the worksets, the phase; the one writer |
| `SentinelAddin/Compat.cs` | 3 | `Levels` and `Grids` as category keys |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` | 3 | The refusal, the `Placement` input, the call before the stamp |
| `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, `SentinelAddin/Commands.ReviewChangesets.cs` | 3 | Review AI Proposals and Promote: the block and the active view reach the executor |
| `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` | 3, 7, 11 | Ghost: the two refusals before filing; its report; its receipt |
| `SentinelAddin/Commands.Datum.cs`, `SentinelAddin/GhostBuilder/DatumBuilder.cs` | 3, 7, 11 | Datum: placement, the commit check, its report, its receipt |
| `SentinelAddin/Commands.Massing.cs`, `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` | 3, 4, 7, 11 | Massing: placement, the template check, its report, its receipt |
| `SentinelAddin/Commands.GhostBuilder.cs` | 3, 4, 11 | Ghost: the design-option refusal before the drawing is picked, the placement lines in the summary; the unread-guideline refusal and the template check; the reader's time and usage |
| `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` | 3 | `PlacementReport.Placement`: the placement lines, apart from the warnings |
| `SentinelAddin/Commands.PromoteWalls.cs` | 4, 11 | Promote: the template check; its receipt |
| `WebApp/bridge/cde-store.mjs`, `WebApp/bridge/bcf-service.mjs` | 5 | The report types, the receipt rule, the route's comment |
| `SentinelAddin/Coordination/CommandReports.cs` (new) | 6 | Pure: the eight report rows, `DoctorTally`, `DoctorBuffer` |
| `SentinelAddin/Coordination/GovernedNotify.cs` | 7 | `Report`: the one poster |
| `SentinelAddin/Commands.Annotate.cs`, `SentinelAddin/Commands.Standards.cs`, `SentinelAddin/Workflow/AutoFixExecution.cs`, `SentinelAddin/Commands.BcfIssues.cs`, `SentinelAddin/Updaters/FailureInterceptor.cs` | 7 | One report call each |
| `SentinelAddin/Standards/StandardsBuilder.cs`, `SentinelAddin/Engine/SentinelUndo.cs` | 7 | Apply Standard counts as created only what Revit committed and kept |
| `SentinelAddin/Updaters/DoctorPolicy.cs` | 7 | `Seen.Project`: the project a resolution belongs to |
| `SentinelAddin/Engine/ProvenanceStamp.cs` | 7 | The reader's words for an element with no ledger row of its own |
| `SentinelAddin/Engine/RoiReport.cs`, `SentinelAddin/UI/RoiDashboard.cs` | 8 | The three fix counts, the seventh line |
| `WebApp/bridge/changesets-logic.mjs`, `WebApp/bridge/changesets-store.mjs`, `WebApp/bridge/mcp-server.mjs` | 9 | The trust rules, the stored `ignored`, the MCP tool |
| `WebApp/bridge/fixtures/changeset-ops/contract2-trust.json` (new) | 9, 10 | One contract-2 post and what the bridge stores for it, read by vitest and by `promote-check` |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 10 | The trust fields as read; `ChangesetTrust` |
| `SentinelAddin/GhostBuilder/ModelUsage.cs` (new) | 10 | Pure: one model's calls, answers and tokens |
| `SentinelAddin/Coordination/BuildReceipt.cs` (new) | 10 | Pure: the receipt |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 11 | The review pre-ticks by the bridge; shows the claim and the accuracy |
| `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs`, `LocalVisionReader.cs`, `MassingVisionReader.cs` | 11 | Each Ollama caller counts its round trips |
| `tools/promote-check/PlacementBlock.cs`, `Reports.cs`, `Trust.cs` (new), `Check.cs`, `promote-check.csproj` | 2–4, 6, 7, 10, 11 | The offline checks |
| `tools/roi-check/Check.cs` | 8 | The ROI lines' pins |
| `tools/ghost-p2-check/ghost-p2-check.csproj`, `tools/ghost-standards-check/ghost-standards-check.csproj` | 11 | `ModelUsage.cs` added to their compile lists |
| `WebApp/bridge/*.test.mjs` (`artefact-store`, `write-roles`, `changesets-logic`, `changesets-store`, `mcp-server`) | 1, 5, 9 | The bridge's tests |
| `demo/ghost-sample/ma1a-i68-guideline.json`, `ma1a-i68-catalog-absent.json`, `ma1a-i68-catalog.json` (new) | 12 | The drill's data |

---

## Tasks (in order: item 6 — bridge, pure half, Revit half, template check; item 7 — bridge, pure half, the eight commands, ROI; item 8 — bridge, pure half, review and receipts; then the drill data. The merge follows the live drill)

### Task 1 — Bridge and web: the guideline's `placement` block (item 6)

**Files:**
- Create `WebApp/bridge/fixtures/guideline-placement/cases.json` (the parity cases; Task 2's C# check reads the same file)
- Modify `WebApp/bridge/artefact-store.test.mjs` (append)
- Modify `WebApp/bridge/artefact-store.mjs` (the `guideline` branch of `validateArtefact`, after the `viewNaming` line)
- Modify `WebApp/src/sentinel-core/guideline.ts` (the `Guideline` interface)

**Interfaces:** `guideline@n` may carry `placement: { worksets?: { <category>: <workset name> }, phase?: "view" }`. `validateArtefact("guideline", body)` accepts a body with no `placement`, with `placement: null` or with a well-formed block, and refuses anything else with `guideline: placement… <why>`. A key of `worksets` must be a category Sentinel places (case and padding ignored), named once: a misspelt key is refused at install, not found out at a build (review amendment C8). There is no design-option field: the rule "never into a design option" is fixed in the add-in (F3). The bridge and the web place nothing, so the TS side is a type only.

- [ ] **Step 0: Branch and baselines.** The branch `feature/ma1a-items6-8` already exists (it holds this plan): `git checkout feature/ma1a-items6-8`. Then record each check's master total, so later totals can be compared:
  - `dotnet run --project tools/promote-check`: expect `231/231 checks pass`;
  - `guideline-check` `17/17`, `ghost-standards-check` `146/146`, `ghost-p2-check` `103/103`, `session-check` `47/47`, `event-check` `44/44`, `heal-check` `9/9`, `roi-check` `43/43`, `massing-check` `14/14`, `wallpair-check` `9/9`, `annotate-check` `ALL PASS`, `datum-check` `DATUM OK`;
  - from `WebApp`, `npx vitest run bridge/`: expect `Test Files  83 passed (83)` and `Tests  1630 passed | 1 skipped (1631)`;
  - both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
- [ ] **Step 1: The parity cases.** One file, read by the bridge's test here and by `tools/promote-check` in Task 2. Each case is a `placement` value and the refusal it must earn (`null` = accepted). The bridge's message is `guideline: ` + the refusal; the add-in's is the refusal alone.

Create `WebApp/bridge/fixtures/guideline-placement/cases.json`:

```json
[
  { "name": "a workset per category and the view's phase", "placement": { "worksets": { "Walls": "ARC_Walls", "Levels": "Shared Levels and Grids" }, "phase": "view" }, "error": null },
  { "name": "worksets only", "placement": { "worksets": { "Walls": "ARC_Walls" } }, "error": null },
  { "name": "the phase only", "placement": { "phase": "view" }, "error": null },
  { "name": "an empty block", "placement": {}, "error": null },
  { "name": "null is no block", "placement": null, "error": null },
  { "name": "text instead of a block", "placement": "ARC_Walls", "error": "placement must be an object" },
  { "name": "a list instead of a block", "placement": [], "error": "placement must be an object" },
  { "name": "a field the block does not have", "placement": { "designOption": "Main Model" }, "error": "placement.designOption is not a placement field (worksets, phase)" },
  { "name": "worksets as a list", "placement": { "worksets": ["ARC_Walls"] }, "error": "placement.worksets must be an object of category: workset name" },
  { "name": "a category in another case, padded", "placement": { "worksets": { " walls ": "ARC_Walls" } }, "error": null },
  { "name": "a misspelt category", "placement": { "worksets": { "Wals": "ARC_Walls" } }, "error": "placement.worksets.Wals is not a category Sentinel places (Walls, Floors, Roofs, Ceilings, Doors, Windows, Columns, Furniture, Levels, Grids)" },
  { "name": "one category under two keys", "placement": { "worksets": { "Walls": "ARC_Walls", "walls": "ARC_Other" } }, "error": "placement.worksets.walls names the category Walls a second time" },
  { "name": "a workset name that is a number", "placement": { "worksets": { "Walls": 3 } }, "error": "placement.worksets.Walls must be a non-empty workset name" },
  { "name": "a blank workset name", "placement": { "worksets": { "Walls": "  " } }, "error": "placement.worksets.Walls must be a non-empty workset name" },
  { "name": "a named phase", "placement": { "phase": "New Construction" }, "error": "placement.phase must be \"view\" (the phase of the view the person builds in)" },
  { "name": "a phase that is a number", "placement": { "phase": 1 }, "error": "placement.phase must be \"view\" (the phase of the view the person builds in)" }
]
```

- [ ] **Step 2: The failing test.**

Append to `WebApp/bridge/artefact-store.test.mjs`:

```js
// MA-1a item 6: guideline@n's placement block — a workset per category and the phase. The cases are shared with the
// add-in's loader (tools/promote-check reads the same file), so both sides accept and refuse the same bodies in the same words.
describe("validateArtefact — a guideline's placement block (MA-1a item 6)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/guideline-placement/cases.json", import.meta.url), "utf8"));
  it("holds both kinds of case: accepted and refused", () => {
    expect(cases.filter((c) => c.error === null).length).toBeGreaterThan(0);
    expect(cases.filter((c) => c.error !== null).length).toBeGreaterThan(0);
  });
  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    const body = { ...guideline, placement: c.placement };
    if (c.error === null) expect(validateArtefact("guideline", body)).toBe(true);
    else expect(fails("guideline", body)).toMatchObject({ status: 400, message: `guideline: ${c.error}` });
  });
  it("a guideline with no placement block installs as before", () => {
    expect(validateArtefact("guideline", guideline)).toBe(true);
    expect(guideline).not.toHaveProperty("placement");
  });
});
```

- [ ] **Step 3: Run it, and see it fail.** From `WebApp`: `npx vitest run bridge/artefact-store.test.mjs`. Expect `10 failed`: the ten refused cases, each `expected true to match object { status: 400, … }` — today the validator lets any `placement` through unread. The six accepted cases and the two other tests pass.
- [ ] **Step 4: The check.**

In `WebApp/bridge/artefact-store.mjs`, replace

```js
    if (body.viewNaming != null && !isObj(body.viewNaming)) throw bad(kind, "viewNaming", "must be an object");
  }
```

with

```js
    if (body.viewNaming != null && !isObj(body.viewNaming)) throw bad(kind, "viewNaming", "must be an object");
    // MA-1a item 6: where a placed element goes — the workset its category names, and the phase. Optional; a block the
    // add-in could not read as written is a 400 here (GuidelineMatcher.CheckGuideline refuses the same, in the same words).
    // No design-option field: Sentinel never places into a design option, whatever a guideline says.
    if (body.placement != null) {
      const p = body.placement;
      if (!isObj(p)) throw bad(kind, "placement", "must be an object");
      const extra = Object.keys(p).find((k) => k !== "worksets" && k !== "phase");
      if (extra !== undefined) throw bad(kind, `placement.${extra}`, "is not a placement field (worksets, phase)");
      if (p.worksets != null) {
        if (!isObj(p.worksets)) throw bad(kind, "placement.worksets", "must be an object of category: workset name");
        // Review amendment C8: a key is a category Sentinel places (GuidelineMatcher.PlacementCategories, the same list),
        // named once — case and padding ignored. A misspelt key would install and then leave every element of that
        // category on the active workset.
        const categories = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Columns", "Furniture", "Levels", "Grids"];
        const named = new Set();
        for (const [category, name] of Object.entries(p.worksets)) {
          const canon = categories.find((c) => c.toLowerCase() === category.trim().toLowerCase());
          if (!canon) throw bad(kind, `placement.worksets.${category}`, `is not a category Sentinel places (${categories.join(", ")})`);
          if (named.has(canon)) throw bad(kind, `placement.worksets.${category}`, `names the category ${canon} a second time`);
          named.add(canon);
          if (!filled(name)) throw bad(kind, `placement.worksets.${category}`, "must be a non-empty workset name");
        }
      }
      if (p.phase != null && p.phase !== "view") throw bad(kind, "placement.phase", 'must be "view" (the phase of the view the person builds in)');
    }
  }
```

- [ ] **Step 5: The type.** The web and the bridge place nothing, so this is the shape only.

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
export interface Guideline {
  standard: string;
```

with

```ts
/** MA-1a item 6: where a placed element goes. `worksets` maps a category Sentinel places (Walls, Floors, Roofs, Ceilings,
 *  Doors, Windows, Columns, Furniture, Levels, Grids) to a workset name; `phase: "view"` puts each element in the phase of the view the person builds in. Read by
 *  the Revit add-in only (GuidelineMatcher.Placement); validated by the bridge (artefact-store.mjs). There is no
 *  design-option field: Sentinel never places into a design option. */
export interface GuidelinePlacement {
  worksets?: Record<string, string>;
  phase?: "view";
}

export interface Guideline {
  standard: string;
```

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
  viewNaming?: GuidelineViewNaming;
}

export interface Resolution {
```

with

```ts
  viewNaming?: GuidelineViewNaming;
  placement?: GuidelinePlacement;
}

export interface Resolution {
```

- [ ] **Step 6: Run.** From `WebApp`: `npx vitest run bridge/artefact-store.test.mjs`, expect `Tests  186 passed (186)` (master 168). `guideline.ts` gains two types and no logic, so `bridge/sentinel-core.mjs` (its bundle) is not rebuilt.
- [ ] **Step 7: Commit.**

```bash
git add WebApp/bridge/fixtures/guideline-placement/cases.json WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/src/sentinel-core/guideline.ts
git commit -F - <<'EOF'
feat(bridge): a guideline may carry a placement block — a workset per category and the phase — validated before it installs (MA-1a item 6)

placement: { worksets: { category: workset name }, phase: "view" }. Optional; a malformed block is a 400 naming the
field. The cases are a shared fixture the add-in's loader is checked against too. No design-option field.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2 — The pure half of item 6: the block as the add-in reads it, the placement words, the office-template count (offline)

**Files:**
- Create `tools/promote-check/PlacementBlock.cs`
- Modify `tools/promote-check/promote-check.csproj` and `tools/promote-check/Check.cs` (`Main`)
- Modify `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` (`GuidelineDoc`, `CheckGuideline`, two new members)
- Create `SentinelAddin/Engine/PlacementPolicy.cs`

**Interfaces:**
- `GuidelinePlacement { Dictionary<string,string> Worksets; string Phase; }` and `GuidelineMatcher.Placement` (null = the guideline has no block, or no guideline is installed).
- `GuidelineMatcher.PlacementCategories` — the ten categories a block may name a workset for (review amendment C8).
- `GuidelineMatcher.OfficeTypesIn(documentTypes) → (int Present, int Total)`: of the catalogue's types in the categories the guideline has rules for, how many the open model holds. `documentTypes` is what `GhostBuilderCommand.LoadedTypes` returns.
- `PlacementPolicy` (pure, `Sentinel.Engine`):
  - `CategoriesOf(kind) → string[]` — the guideline category a changeset kind lands in; `Kinds`; `KindOf(category) → string`;
  - `WorksetFor(block, category) → string` — the workset the block names, or null;
  - `MissingWorksets(block, kinds, modelWorksets) → List<string>`;
  - `DesignOptionRefusal(option, what)`, `MissingWorksetRefusal(names)`, `UnreadRefusal(origin, notInstalled, bound, why)` (C7);
  - `Written` (`Add(uniqueId, workset, unnamedCategory, phased)`, `Surviving(uniqueIds) → Tally`): what was written per element, counted only for the elements still in the model after the commit (C6);
  - `Tally` (`On(workset)`, `NoWorkset(category)`, `Phased`) and `Lines(block, workshared, tally, phaseName) → List<string>`;
  - `TemplateRefuses(present, total)`, `TemplateRefusal(total, catalogLabel)`, `TemplateLine(hasCatalog, present, total, catalogLabel)`.

`GuidelinePlacement` and `PlacementCategories` live in `GuidelineMatcher.cs`, so the other check projects that compile that file (`annotate-check`, `guideline-check`, `ghost-standards-check`, `wallpair-check`) need no new `<Compile>` line.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/PlacementBlock.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // A guideline and a catalogue that pass the bridge validator; each case adds one placement block to the guideline.
    const string PlacementGuideline =
        "{\"standard\":\"Placement check guideline\",\"elements\":[" +
        "{\"category\":\"Walls\",\"rules\":[],\"default\":{\"family\":\"Basic Wall\"}},{\"category\":\"Doors\",\"rules\":[]}]}";
    const string PlacementCatalog =
        "{\"types\":[{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\"}," +
        "{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_INT_100 mm\"}," +
        "{\"category\":\"Doors\",\"family\":\"OFF_Door\",\"type\":\"900 x 2100\"}," +
        "{\"category\":\"Furniture\",\"family\":\"OFF_Desk\",\"type\":\"1600\"}]}";

    static GuidelineMatcher WithPlacement(string placementJson, out string error)
    {
        var body = JsonNode.Parse(PlacementGuideline).AsObject();
        body["placement"] = placementJson == null ? null : JsonNode.Parse(placementJson);
        return GuidelineMatcher.FromBodies(body.ToJsonString(), PlacementCatalog, out error, out _);
    }

    // ── 14. MA-1a item 6: the placement block, its words, and the office-template count ─────────────────────────
    static void PlacementBlockChecks()
    {
        Console.WriteLine("\nMA-1a item 6 — the guideline's placement block (GuidelineMatcher, PlacementPolicy)");

        // The bridge's own cases (WebApp/bridge/fixtures/guideline-placement/cases.json, which vitest reads too): the add-in's
        // loader accepts and refuses the same bodies, in the same words.
        using (var cases = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "guideline-placement", "cases.json"))))
            foreach (var c in cases.RootElement.EnumerateArray())
            {
                var p = c.GetProperty("placement");
                string want = c.GetProperty("error").ValueKind == JsonValueKind.Null ? null : c.GetProperty("error").GetString();
                var m = WithPlacement(p.ValueKind == JsonValueKind.Null ? null : p.GetRawText(), out string error);
                Ok(error == want && m.HasGuideline == (want == null),
                   "parity with the bridge — " + c.GetProperty("name").GetString() + (want == null ? ": accepted" : ": refused, \"" + want + "\"") +
                   (error == want ? "" : " (the add-in said: " + (error ?? "accepted") + ")"));
            }

        var full = WithPlacement("{\"worksets\":{\"Walls\":\"ARC_Walls\",\"Doors\":\"ARC_Doors\",\"Levels\":\"Shared Levels and Grids\"},\"phase\":\"view\"}", out _);
        var block = full.Placement;
        Ok(block != null && block.Worksets.Count == 3 && block.Worksets["Walls"] == "ARC_Walls" && block.Phase == "view",
           "the block is read as written: three worksets and the view's phase");
        Ok(WithPlacement(null, out _).Placement == null && GuidelineMatcher.FromBodies(null, null, out _, out _).Placement == null,
           "no block, or no guideline at all, reads as null — never an empty block");

        Ok(PlacementPolicy.WorksetFor(block, "walls") == "ARC_Walls" && PlacementPolicy.WorksetFor(block, " Doors ") == "ARC_Doors",
           "a category finds its workset whatever its case or padding");
        Ok(PlacementPolicy.WorksetFor(block, "Furniture") == null && PlacementPolicy.WorksetFor(null, "Walls") == null,
           "a category the block does not name, or no block, gives no workset");
        Ok(PlacementPolicy.CategoriesOf("wall").SequenceEqual(new[] { "Walls" }) && PlacementPolicy.CategoriesOf("level").SequenceEqual(new[] { "Levels" })
           && PlacementPolicy.CategoriesOf("column").SequenceEqual(new[] { "Columns" }) && PlacementPolicy.CategoriesOf("stair").Length == 0,
           "each changeset kind names its guideline category — a column the architectural Columns the executor places, an unknown kind none");
        foreach (var kind in new[] { "wall", "floor", "level", "grid", "roof", "ceiling", "door", "window", "column", "furniture" })
            Ok(PlacementPolicy.CategoriesOf(kind).Length > 0, "the bridge's vocabulary is covered: " + kind);
        Ok(PlacementPolicy.Kinds.SelectMany(PlacementPolicy.CategoriesOf).OrderBy(c => c, StringComparer.Ordinal)
               .SequenceEqual(GuidelineMatcher.PlacementCategories.OrderBy(c => c, StringComparer.Ordinal)),
           "the categories a block may name are exactly the ones a kind lands in");
        Ok(PlacementPolicy.KindOf("Walls") == "wall" && PlacementPolicy.KindOf(" doors ") == "door" && PlacementPolicy.KindOf("Stairs") == null,
           "a category names its kind back, whatever its case or padding; one Sentinel does not place names none");

        var have = new[] { "Workset1", "arc_walls" };
        Ok(PlacementPolicy.MissingWorksets(block, new[] { "wall", "door", "furniture", "door" }, have).SequenceEqual(new[] { "ARC_Doors" }),
           "the batch needs ARC_Walls (in the model) and ARC_Doors (not): one missing workset, named once");
        Ok(PlacementPolicy.MissingWorksets(block, new[] { "wall", "furniture" }, have).Count == 0,
           "a workset the batch does not need is not asked for (Levels' is missing, and no level is placed)");
        Ok(PlacementPolicy.MissingWorksets(null, new[] { "wall" }, have).Count == 0, "no block: nothing is missing");

        Ok(PlacementPolicy.DesignOptionRefusal("Option 2", "apply the proposals") ==
           "Nothing was placed — design option \"Option 2\" is being edited, and Sentinel never places into a design option. " +
           "Switch to Main Model (Manage ▸ Design Options), then apply the proposals again.",
           "an active design option is refused by name, with the way out");
        Ok(PlacementPolicy.MissingWorksetRefusal(new[] { "ARC_Doors" }) ==
           "Nothing was placed — the guideline's placement block names a workset this model does not have: \"ARC_Doors\". " +
           "Create it (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another.",
           "one missing workset is refused by name");
        Ok(PlacementPolicy.MissingWorksetRefusal(new[] { "ARC_Doors", "ARC_Floors" }).StartsWith(
           "Nothing was placed — the guideline's placement block names 2 worksets this model does not have: \"ARC_Doors\", \"ARC_Floors\". Create them ("),
           "two missing worksets are both named");

        var tally = new PlacementPolicy.Tally();
        tally.On("ARC_Walls"); tally.On("ARC_Walls"); tally.On("ARC_Doors"); tally.NoWorkset("Furniture"); tally.NoWorkset("Furniture"); tally.Phased = 5;
        Ok(PlacementPolicy.Lines(null, true, new PlacementPolicy.Tally(), "New Construction").SequenceEqual(new[] { PlacementPolicy.NoBlock })
           && PlacementPolicy.NoBlock == "Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before.",
           "no block: one line that says today's behaviour holds");
        Ok(PlacementPolicy.Lines(block, true, tally, "New Construction").SequenceEqual(new[]
           {
               "Worksets: 1 on ARC_Doors · 2 on ARC_Walls · 2 left on the active workset (the guideline names no workset for Furniture).",
               "Phase: 5 element(s) set to \"New Construction\", the active view's phase (a level or a grid has no phase).",
           }), "worksets counted by name, the unnamed category said, the phase counted");
        Ok(PlacementPolicy.Lines(block, false, new PlacementPolicy.Tally(), null).SequenceEqual(new[]
           {
               "Worksets: not set — this model is not workshared, so it has no worksets (the guideline names 3).",
               "Phase: not set — the active view has no phase (a sheet, a legend); each element is in the phase Revit gave it.",
           }), "a model that is not workshared, in a view with no phase: both said, nothing claimed");
        var worksetsOnly = WithPlacement("{\"worksets\":{\"Walls\":\"ARC_Walls\"}}", out _).Placement;
        Ok(PlacementPolicy.Lines(worksetsOnly, true, new PlacementPolicy.Tally(), "New Construction")[1] ==
           "Phase: the guideline's placement block names none — each element is in the phase Revit gave it.",
           "a block with no phase leaves the phase alone, and says so");
        Ok(PlacementPolicy.Lines(WithPlacement("{\"phase\":\"view\"}", out _).Placement, true, new PlacementPolicy.Tally(), "Existing")[0] ==
           "Worksets: the guideline's placement block names none — each element is on the active workset.",
           "a block with no worksets leaves the workset alone, and says so");

        // Review amendment C6: the lines are counted from the elements still in the model after the commit.
        var written = new PlacementPolicy.Written();
        written.Add("u1", "ARC_Walls", null, true); written.Add("u2", "ARC_Walls", null, true); written.Add("u3", "ARC_Walls", null, true);
        written.Add("u4", null, "Furniture", false);
        Ok(PlacementPolicy.Lines(block, true, written.Surviving(new[] { "u1", "u3", "u4" }), "New Construction").SequenceEqual(new[]
           {
               "Worksets: 2 on ARC_Walls · 1 left on the active workset (the guideline names no workset for Furniture).",
               "Phase: 2 element(s) set to \"New Construction\", the active view's phase (a level or a grid has no phase).",
           }), "three walls set, one removed by Revit at commit: the lines say two — counted from what is still in the model");

        // Review amendment C7: a guideline that could not be read is not "no block".
        Ok(PlacementPolicy.UnreadRefusal("none", false, true, "bridge unreachable (timed out after 4 s)") ==
           "Nothing was placed — the project's guideline could not be read (bridge unreachable (timed out after 4 s)), so its placement block is unknown. " +
           "Try again once it can be read — Sentinel never places on a guess.",
           "a guideline that could not be read is refused with the reader's own reason");
        Ok(PlacementPolicy.UnreadRefusal("none", true, true, "not installed for demo or its office") == null
           && PlacementPolicy.UnreadRefusal("none", false, false, "not bound — Sentinel ▸ Project Setup") == null,
           "no guideline installed, or a model that is not bound, is no block — not a refusal");
        Ok(PlacementPolicy.UnreadRefusal("bridge", false, true, null) == null && PlacementPolicy.UnreadRefusal("cache", false, true, "bridge unreachable — cached 14:02") == null,
           "a guideline read from the bridge, or from its cached copy, is read: its block — or its lack of one — is known");

        // The office-template check: the catalogue's types in the guideline's categories (Walls, Doors — not Furniture).
        var docTypes = new Dictionary<string, IReadOnlyList<(string Family, string Type)>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"] = new List<(string, string)> { (null, "off_ext_200 mm"), (null, "Generic - 200mm") },
            ["Doors"] = new List<(string, string)> { ("Another Door", "900 x 2100") },
            ["Furniture"] = new List<(string, string)> { ("OFF_Desk", "1600") },
        };
        var (present, total) = full.OfficeTypesIn(docTypes);
        Ok(present == 1 && total == 3, "1 of 3 office types present: a wall type by name, not the door of another family, not a category the guideline has no rules for");
        var none = full.OfficeTypesIn(new Dictionary<string, IReadOnlyList<(string Family, string Type)>> { ["Walls"] = new List<(string, string)> { (null, "Generic - 200mm") } });
        Ok(none.Present == 0 && none.Total == 2, "a category the reader did not read is not counted against the model");
        Ok(PlacementPolicy.TemplateRefuses(0, 3) && !PlacementPolicy.TemplateRefuses(1, 3) && !PlacementPolicy.TemplateRefuses(0, 0),
           "the build is refused only when the model holds none of them — never when there is nothing to compare");
        Ok(PlacementPolicy.TemplateRefusal(3, "type_catalog@1 · office · 0123…") ==
           "Nothing was built — this model was not made from the office template: it holds none of the 3 office type(s) that type_catalog@1 · office · 0123… lists in the guideline's categories. " +
           "Start the project from the office template, then run this again — Sentinel never loads an unknown family.",
           "the refusal is the design's sentence, with the count and the catalogue");
        Ok(PlacementPolicy.TemplateLine(true, 1, 3, "type_catalog@1 · office · 0123…") == "Office template: 1 of 3 office type(s) present (type_catalog@1 · office · 0123…)."
           && PlacementPolicy.TemplateLine(true, 0, 0, "type_catalog@1") == "Office template: not checked — type_catalog@1 lists no type in a category the guideline has rules for."
           && PlacementPolicy.TemplateLine(false, 0, 0, "none — not installed for demo or its office") == "Office template: not checked — type_catalog: none — not installed for demo or its office.",
           "the count is said as counted; with nothing to compare it says not checked, never a pass");
    }
}
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Engine\BlockCheck.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Engine\BlockCheck.cs" />
    <!-- MA-1a item 6: the placement block's lookups and words, and the office-template count -->
    <Compile Include="..\..\SentinelAddin\Engine\PlacementPolicy.cs" />
```

In `tools/promote-check/Check.cs`, replace

```csharp
        BlockChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        BlockChecks();
        PlacementBlockChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect a build failure, not a check failure: `error CS2001: Source file '…\SentinelAddin\Engine\PlacementPolicy.cs' could not be found`. Nothing of item 6 exists in the add-in yet.
- [ ] **Step 3: The block in the guideline document.** In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, make four replacements. First, the document:

First, replace

```csharp
        [JsonPropertyName("viewNaming")] public GuidelineViewNaming ViewNaming { get; set; }
    }

    public sealed class GuidelineTag
```

with

```csharp
        [JsonPropertyName("viewNaming")] public GuidelineViewNaming ViewNaming { get; set; }
        /// <summary>MA-1a item 6: where a placed element goes; null when the guideline has no block.</summary>
        [JsonPropertyName("placement")]  public GuidelinePlacement Placement { get; set; }
    }

    /// <summary>MA-1a item 6: guideline@n's placement block. <c>worksets</c> maps a category (an <c>elements[].category</c>,
    /// or "Levels" / "Grids") to a workset name; <c>phase</c> is "view" (the phase of the view the person builds in) or
    /// absent. There is no design-option field: Sentinel never places into a design option (PlacementPolicy).</summary>
    public sealed class GuidelinePlacement
    {
        [JsonPropertyName("worksets")] public Dictionary<string, string> Worksets { get; set; }
        [JsonPropertyName("phase")]    public string Phase { get; set; }
    }

    public sealed class GuidelineTag
```

Second, replace

```csharp
        public GuidelineGraphics Graphics => _doc?.Graphics;
```

with

```csharp
        public GuidelineGraphics Graphics => _doc?.Graphics;
        /// <summary>MA-1a item 6: the guideline's placement block; null when it has none or no guideline is installed.</summary>
        public GuidelinePlacement Placement => _doc?.Placement;
```

Third, replace

```csharp
            if (Present(b, "viewNaming", out var vn) && vn.ValueKind != JsonValueKind.Object) throw Bad("viewNaming", "must be an object");
        }
```

with

```csharp
            if (Present(b, "viewNaming", out var vn) && vn.ValueKind != JsonValueKind.Object) throw Bad("viewNaming", "must be an object");
            // MA-1a item 6: the placement block, refused as the bridge refuses it (artefact-store.mjs), in the same words —
            // tools/promote-check runs both against WebApp/bridge/fixtures/guideline-placement/cases.json.
            if (Present(b, "placement", out var pl))
            {
                if (pl.ValueKind != JsonValueKind.Object) throw Bad("placement", "must be an object");
                foreach (var f in pl.EnumerateObject())
                    if (f.Name != "worksets" && f.Name != "phase") throw Bad("placement." + f.Name, "is not a placement field (worksets, phase)");
                if (Present(pl, "worksets", out var ws))
                {
                    if (ws.ValueKind != JsonValueKind.Object) throw Bad("placement.worksets", "must be an object of category: workset name");
                    // Review amendment C8: a key is a category Sentinel places, named once (case and padding ignored).
                    var named = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var w in ws.EnumerateObject())
                    {
                        string canon = GuidelineMatcher.PlacementCategories.FirstOrDefault(c => string.Equals(c, w.Name.Trim(), StringComparison.OrdinalIgnoreCase));
                        if (canon == null) throw Bad("placement.worksets." + w.Name, "is not a category Sentinel places (" + string.Join(", ", GuidelineMatcher.PlacementCategories) + ")");
                        if (!named.Add(canon)) throw Bad("placement.worksets." + w.Name, "names the category " + canon + " a second time");
                        if (w.Value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(w.Value.GetString()))
                            throw Bad("placement.worksets." + w.Name, "must be a non-empty workset name");
                    }
                }
                if (Present(pl, "phase", out var ph) && !(ph.ValueKind == JsonValueKind.String && ph.GetString() == "view"))
                    throw Bad("placement.phase", "must be \"view\" (the phase of the view the person builds in)");
            }
        }
```

Fourth, replace

```csharp
        /// <summary>Has the guideline an element block for the category?</summary>
        public bool HasRulesFor(string category) => _doc.Elements.Any(e => Norm(e.Category) == Norm(category));
```

with

```csharp
        /// <summary>Has the guideline an element block for the category?</summary>
        public bool HasRulesFor(string category) => _doc.Elements.Any(e => Norm(e.Category) == Norm(category));

        /// <summary>MA-1a item 6 (review amendment C8): the categories a placement block may name a workset for — the ones
        /// Sentinel places (every changeset kind lands in one: PlacementPolicy.CategoriesOf; tools/promote-check holds the
        /// two lists equal). The bridge's check carries the same list (artefact-store.mjs); the shared cases prove it.</summary>
        internal static readonly string[] PlacementCategories =
            { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Columns", "Furniture", "Levels", "Grids" };

        /// <summary>MA-1a item 6, the office-template check: of the catalogue's types in the categories the guideline has
        /// rules for, how many the open model holds. <paramref name="documentTypes"/> is the model's types by category as
        /// GhostBuilderCommand.LoadedTypes reads them; a category it did not read is not counted. A type matches by its name
        /// and, when the reader gives one, its family (a system type — a wall, a floor — has none). Total 0 = nothing to
        /// compare: no catalogue, or no category in common.</summary>
        public (int Present, int Total) OfficeTypesIn(IReadOnlyDictionary<string, IReadOnlyList<(string Family, string Type)>> documentTypes)
        {
            int present = 0, total = 0;
            foreach (var c in _catalog)
            {
                if (!HasRulesFor(c.Category)) continue;
                string key = documentTypes.Keys.FirstOrDefault(k => Norm(k) == Norm(c.Category));
                if (key == null) continue;
                total++;
                if (documentTypes[key].Any(t => Norm(t.Type) == Norm(c.Type) && (t.Family == null || Norm(t.Family) == Norm(c.Family)))) present++;
            }
            return (present, total);
        }
```

- [ ] **Step 4: The placement words.** One pure file: every lookup and every sentence of item 6, so the Revit half (Task 3) only reads the model and writes parameters.

Create `SentinelAddin/Engine/PlacementPolicy.cs`:

```csharp
#nullable disable
// MA-1a item 6: where a placed element goes, decided over plain values — no Revit API, so tools/promote-check proves it
// offline. guideline@n's placement block names a workset per category and the phase; Sentinel never places into a design
// option. Every refusal and every summary line of item 6 is worded here; PlacementApply (the Revit half) reads the model,
// writes the two parameters and records what it wrote per element (Written); the lines are counted after the commit,
// from the elements still in the model. The office-template check's words are here too: its count is
// GuidelineMatcher.OfficeTypesIn.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

namespace Sentinel.Engine
{
    public static class PlacementPolicy
    {
        /// <summary>The guideline category a changeset kind lands in (a column is an architectural Column: the executor
        /// takes its type from OST_Columns only). An unknown kind names none.</summary>
        public static string[] CategoriesOf(string kind)
        {
            switch (kind)
            {
                case "wall": return new[] { "Walls" };
                case "floor": return new[] { "Floors" };
                case "roof": return new[] { "Roofs" };
                case "ceiling": return new[] { "Ceilings" };
                case "door": return new[] { "Doors" };
                case "window": return new[] { "Windows" };
                case "column": return new[] { "Columns" };
                case "furniture": return new[] { "Furniture" };
                case "level": return new[] { "Levels" };
                case "grid": return new[] { "Grids" };
                default: return new string[0];
            }
        }

        /// <summary>The changeset kinds Sentinel places — the bridge's vocabulary (changesets-logic.mjs VOCABULARY).</summary>
        public static readonly string[] Kinds = { "wall", "floor", "roof", "ceiling", "door", "window", "column", "furniture", "level", "grid" };

        /// <summary>The kind that lands in a category (case and padding ignored); null for one Sentinel does not place.</summary>
        public static string KindOf(string category) =>
            Kinds.FirstOrDefault(k => CategoriesOf(k).Any(c => string.Equals(c, (category ?? "").Trim(), StringComparison.OrdinalIgnoreCase)));

        /// <summary>The workset the block names for a category (case and padding ignored); null when it names none.</summary>
        public static string WorksetFor(GuidelinePlacement block, string category)
        {
            if (block?.Worksets == null || category == null) return null;
            foreach (var kv in block.Worksets)
                if (string.Equals((kv.Key ?? "").Trim(), category.Trim(), StringComparison.OrdinalIgnoreCase)) return (kv.Value ?? "").Trim();
            return null;
        }

        /// <summary>The worksets a batch of these kinds needs that the model does not have, each once, by name. A workset the
        /// batch does not need is not asked for.</summary>
        public static List<string> MissingWorksets(GuidelinePlacement block, IEnumerable<string> kinds, IEnumerable<string> modelWorksets)
        {
            var have = new HashSet<string>(modelWorksets ?? new string[0], StringComparer.OrdinalIgnoreCase);
            return (kinds ?? new string[0]).SelectMany(CategoriesOf).Select(c => WorksetFor(block, c))
                .Where(n => !string.IsNullOrEmpty(n) && !have.Contains(n))
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n, StringComparer.Ordinal).ToList();
        }

        /// <summary>The refusal when a design option is being edited. <paramref name="what"/> is the action to repeat
        /// ("apply the proposals", "build").</summary>
        public static string DesignOptionRefusal(string option, string what) =>
            "Nothing was placed — design option \"" + option + "\" is being edited, and Sentinel never places into a design option. " +
            "Switch to Main Model (Manage ▸ Design Options), then " + what + " again.";

        public static string MissingWorksetRefusal(IReadOnlyList<string> names) =>
            "Nothing was placed — the guideline's placement block names " + (names.Count == 1 ? "a workset" : names.Count + " worksets") +
            " this model does not have: " + string.Join(", ", names.Select(n => "\"" + n + "\"")) + ". Create " + (names.Count == 1 ? "it" : "them") +
            " (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another.";

        /// <summary>Review amendment C7: null, or the refusal when the project's guideline could not be read — whether it
        /// has a placement block is then unknown, and a guess would put every element on the wrong workset. A guideline
        /// read from the bridge or from its cached copy is read. "None installed" (the bridge said so) and a model that is
        /// not bound are no block, not a refusal. <paramref name="why"/> is the reader's own reason ("bridge unreachable
        /// (…)", "guideline@3 · … did not parse: …").</summary>
        public static string UnreadRefusal(string origin, bool notInstalled, bool bound, string why) =>
            origin != "none" || notInstalled || !bound ? null
            : "Nothing was placed — the project's guideline could not be read (" + why + "), so its placement block is unknown. " +
              "Try again once it can be read — Sentinel never places on a guess.";

        /// <summary>What a placement run did: elements per workset, elements whose category the block names no workset
        /// for, and elements whose phase was set. Built by <see cref="Written.Surviving"/> after the commit, so it counts
        /// only what is still in the model.</summary>
        public sealed class Tally
        {
            public readonly Dictionary<string, int> OnWorkset = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            public readonly Dictionary<string, int> Unnamed = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            public int Phased;
            public void On(string workset) => OnWorkset[workset] = (OnWorkset.TryGetValue(workset, out int n) ? n : 0) + 1;
            public void NoWorkset(string category) => Unnamed[category] = (Unnamed.TryGetValue(category, out int n) ? n : 0) + 1;
        }

        /// <summary>Review amendment C6: what PlacementApply wrote, per element, inside the placer's transaction. The
        /// summary is counted from it after the commit, for the elements still in the model — an element Revit removed at
        /// commit is in no count (the GHB-5 rule).</summary>
        public sealed class Written
        {
            private readonly List<(string Id, string Workset, string Unnamed, bool Phased)> _set = new List<(string, string, string, bool)>();

            /// <summary>One created element: the workset it was put on (null: none), or the category the block names no
            /// workset for (null: the workset part did not run), and whether its phase was set.</summary>
            public void Add(string uniqueId, string workset, string unnamedCategory, bool phased) => _set.Add((uniqueId, workset, unnamedCategory, phased));

            public Tally Surviving(IEnumerable<string> uniqueIds)
            {
                var alive = new HashSet<string>(uniqueIds ?? new string[0], StringComparer.Ordinal);
                var tally = new Tally();
                foreach (var s in _set.Where(s => alive.Contains(s.Id)))
                {
                    if (s.Workset != null) tally.On(s.Workset);
                    else if (s.Unnamed != null) tally.NoWorkset(s.Unnamed);
                    if (s.Phased) tally.Phased++;
                }
                return tally;
            }
        }

        public const string NoBlock =
            "Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before.";

        /// <summary>The summary lines of one placement run: what was set, and what was not and why — never nothing.
        /// <paramref name="phaseName"/> is the active view's phase, null when the view has none.</summary>
        public static List<string> Lines(GuidelinePlacement block, bool workshared, Tally tally, string phaseName)
        {
            if (block == null) return new List<string> { NoBlock };
            var lines = new List<string>();
            int named = block.Worksets?.Count ?? 0;
            if (named == 0) lines.Add("Worksets: the guideline's placement block names none — each element is on the active workset.");
            else if (!workshared) lines.Add("Worksets: not set — this model is not workshared, so it has no worksets (the guideline names " + named + ").");
            else
            {
                var parts = tally.OnWorkset.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => kv.Value + " on " + kv.Key).ToList();
                if (tally.Unnamed.Count > 0)
                    parts.Add(tally.Unnamed.Values.Sum() + " left on the active workset (the guideline names no workset for " +
                              string.Join(", ", tally.Unnamed.Keys.OrderBy(k => k, StringComparer.Ordinal)) + ")");
                lines.Add("Worksets: " + (parts.Count == 0 ? "no element was created" : string.Join(" · ", parts)) + ".");
            }
            if (block.Phase == null) lines.Add("Phase: the guideline's placement block names none — each element is in the phase Revit gave it.");
            else if (phaseName == null) lines.Add("Phase: not set — the active view has no phase (a sheet, a legend); each element is in the phase Revit gave it.");
            else lines.Add("Phase: " + tally.Phased + " element(s) set to \"" + phaseName + "\", the active view's phase (a level or a grid has no phase).");
            return lines;
        }

        // ── the office-template check (the count is GuidelineMatcher.OfficeTypesIn) ──────────────────────────────

        /// <summary>The build is refused only when the model holds none of the office types there are to compare.</summary>
        public static bool TemplateRefuses(int present, int total) => total > 0 && present == 0;

        public static string TemplateRefusal(int total, string catalogLabel) =>
            "Nothing was built — this model was not made from the office template: it holds none of the " + total + " office type(s) that " +
            catalogLabel + " lists in the guideline's categories. Start the project from the office template, then run this again — Sentinel never loads an unknown family.";

        public static string TemplateLine(bool hasCatalog, int present, int total, string catalogLabel) =>
            !hasCatalog ? "Office template: not checked — type_catalog: " + catalogLabel + "."
            : total == 0 ? "Office template: not checked — " + catalogLabel + " lists no type in a category the guideline has rules for."
            : "Office template: " + present + " of " + total + " office type(s) present (" + catalogLabel + ").";
    }
}
```

- [ ] **Step 5: Run.**
  - `dotnet run --project tools/promote-check`: expect `284/284 checks pass` (master `231`; 53 new: 16 parity cases, 37 on the block, its words and the template count).
  - `guideline-check` `17/17`, `ghost-standards-check` `146/146`, `wallpair-check` `9/9`, `annotate-check` `ALL PASS`: unchanged — they compile `GuidelineMatcher.cs`.
  - Both builds: `0 Error(s)`.
- [ ] **Step 6: Commit.**

```bash
git add tools/promote-check/PlacementBlock.cs tools/promote-check/promote-check.csproj tools/promote-check/Check.cs SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/Engine/PlacementPolicy.cs
git commit -F - <<'EOF'
feat(engine): the add-in reads a guideline's placement block as the bridge validates it, and words every placement line (MA-1a item 6)

GuidelineMatcher.Placement and the same refusals as the bridge, proven on the shared cases. PlacementPolicy (pure):
the workset a category names, the worksets a batch needs and the model lacks, the design-option refusal, the summary
lines counted from the elements still in the model, the unread-guideline refusal, and the office-template check's
count and sentence. A block's category keys are checked against the categories Sentinel places. promote-check 284/284.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3 — The Revit half of item 6: one writer of workset and phase, called by every placer

**Files:**
- Modify `tools/promote-check/PlacementBlock.cs` and `tools/promote-check/Check.cs` (the wiring check, a source scan — `heal-check`'s pattern for Revit-bound code)
- Create `SentinelAddin/GhostBuilder/PlacementApply.cs`
- Modify `SentinelAddin/Compat.cs` (two category keys)
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (the result, one input, the refusal, the call before the stamp)
- Modify `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` and `SentinelAddin/Commands.ReviewChangesets.cs` (Review AI Proposals and Promote)
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, `SentinelAddin/Commands.GhostBuilder.cs` and `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (Ghost Builder: the build, the refusal before the drawing is picked, the report's `Placement` list)
- Modify `SentinelAddin/Commands.Datum.cs` and `SentinelAddin/GhostBuilder/DatumBuilder.cs` (Datum)
- Modify `SentinelAddin/Commands.Massing.cs` and `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (Photo Massing)

**Interfaces:**
- `PlacementApply.DesignOptionRefusal(Document doc, string what) → string` — null, or the refusal naming the design option being edited.
- `PlacementApply.Resolve(Document doc, GuidelinePlacement block, View view, IEnumerable<string> kinds, out string refusal) → PlacementPlan` — on the API thread, before any transaction. Null with `refusal` set when the batch needs a workset the model does not have. With no block it still returns a plan, whose lines say so. A view that belongs to another document is read as no view (C17).
- `PlacementApply.Apply(PlacementPlan plan, IEnumerable<Element> created)` — inside the placer's open transaction, after its creates and before its stamp. A workset it cannot set throws `PlacementRefused` (an `InvalidOperationException`): the placer's all-or-nothing rule rolls the batch back, and the executor answers `NotRun` — the changeset stays proposed, as for the other refusals of item 6 (review amendment C5).
- `PlacementPlan.Lines(survivingUniqueIds) → List<string>` — the summary lines (Task 2's `PlacementPolicy.Lines`), counted after the commit from the elements still in the model (C6).
- `PlacementPolicy.UnreadRefusal(…)` (Task 2) is asked by Review AI Proposals and Datum here, and by Ghost Builder and Photo Massing in Task 4, before `Resolve`: a guideline that could not be read is refused (C7).
- `GhostPlacementEngine.PlacementReport.Placement` and `DatumBuilder.DatumResult.Placement` — the placement lines of a build, apart from its warnings (C18).
- `ChangesetExecutor.Placement` (input, set by the in-process caller as `WallsBefore` and `Provenance` are) and `ExecutionResult.Placement` (the lines, set by `ChangesetPlacementEvent`).
- `ChangesetPlacementEvent.SetRequest(cs, ticked, doc, placement)`; `DatumBuilder.Build(detected, placing)`; `GhostBuilderOrchestrator.PlacePrepared(…, placing:)` and `GhostBuilderOrchestrator.Doc`; `MassingPlacementEvent.SetRequest(…, placement)`.

What each case does:

| Case | What happens | What the person reads |
|---|---|---|
| No guideline, or a guideline with no `placement` block | Today's behaviour: nothing is set | `Placement: no placement block (…) — each element is on the active workset and in the phase Revit gave it, as before.` |
| The model is not workshared | The workset part is skipped; the phase part still runs | `Worksets: not set — this model is not workshared, so it has no worksets (the guideline names N).` |
| A workset the batch needs is not in the model | Refused before any transaction and before anything is filed; the changeset stays proposed | `Nothing was placed — the guideline's placement block names a workset this model does not have: "ARC_Doors". Create it (…), then try again — …` |
| The block names no workset for a created element's category | The element stays on the active workset | `… · 2 left on the active workset (the guideline names no workset for Furniture).` |
| The active view has no phase | The phase is left alone | `Phase: not set — the active view has no phase (…)` |
| A design option is being edited | Refused before any transaction, with or without a guideline; a changeset stays proposed. Ghost Builder and Photo Massing refuse at the top of the command too, before a drawing is imported or an image is read | `Nothing was placed — design option "Option 2" is being edited, and Sentinel never places into a design option. Switch to Main Model (…), then … again.` |
| The project's guideline could not be read (bridge unreachable and no cached copy; a body that did not parse) | Refused before any transaction and before anything is filed; a changeset stays proposed. Never read as "no block" | `Nothing was placed — the project's guideline could not be read (…), so its placement block is unknown. Try again once it can be read — Sentinel never places on a guess.` |
| Revit refuses the workset write on an element (a workset owned by another user, a read-only parameter) | The transaction is rolled back whole; a changeset stays proposed (`NotRun`), never declined; Ghost Builder abandons the build and withdraws what it filed | `Nothing was placed — Revit would not put Walls <id> on workset "ARC_Walls" (…).` |
| Revit removed an element at commit | The lines count only what is still in the model | `Worksets: 2 on ARC_Walls …` beside `1 element(s) removed by Revit at commit` |

Retype and attach change no workset and no phase: only an element a changeset creates is placed.

- [ ] **Step 1: The failing check.** The executor and the two transactions outside it are Revit-bound; what can be checked offline is that each calls the one writer, in the right place, and that nothing else writes a workset or a phase.

In `tools/promote-check/PlacementBlock.cs`, replace

```csharp
           "the count is said as counted; with nothing to compare it says not checked, never a pass");
    }
}
```

with

```csharp
           "the count is said as counted; with nothing to compare it says not checked, never a pass");
    }

    static string Src(params string[] parts) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(parts).ToArray()));

    // ── 15. MA-1a item 6: every placer calls the one writer (a source scan: the callers are Revit-bound) ───────────
    static void PlacementWiringChecks()
    {
        Console.WriteLine("\nMA-1a item 6 — one writer of workset and phase, called by every placer (source scan)");
        string apply = Src("GhostBuilder", "PlacementApply.cs"), executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(apply.Contains("DesignOption.GetActiveDesignOptionId(doc)") && apply.Contains("BuiltInParameter.ELEM_PARTITION_PARAM") && apply.Contains("CreatedPhaseId = plan.PhaseId"),
           "PlacementApply reads the active design option and writes the workset and the phase");
        Ok(!apply.Contains("Workset.Create(") && !apply.Contains("SetActiveWorksetId"),
           "it never creates a workset and never switches the person's active workset");
        var others = Directory.EnumerateFiles(Repo("SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
            .Where(f => Path.GetFileName(f) != "PlacementApply.cs").Select(File.ReadAllText).ToList();
        Ok(others.Count > 100 && !others.Any(s => s.Contains("ELEM_PARTITION_PARAM") || s.Contains("CreatedPhaseId =")),
           "no other file of the add-in writes an element's workset or phase");
        int refusal = executor.IndexOf("PlacementApply.DesignOptionRefusal(doc,", StringComparison.Ordinal);
        int started = executor.IndexOf("using var t = new Transaction(doc, UndoWatcher.TxName(cs.Name, cs.Id));", StringComparison.Ordinal);
        int placed = executor.IndexOf("PlacementApply.Apply(Placement,", StringComparison.Ordinal);
        int stamped = executor.IndexOf("at = \"the provenance stamp\";", StringComparison.Ordinal);
        Ok(refusal > 0 && started > refusal, "the executor refuses an active design option before its transaction starts");
        Ok(placed > started && stamped > placed, "the executor places what it created inside its transaction, before the stamp and the commit");
        Ok(executor.Contains("NotRun = true, Error = inOption"), "a design-option refusal leaves the changeset proposed (NotRun), never declined");
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("PlacementApply.Resolve(doc, placement, app.ActiveUIDocument?.ActiveView,")
           && Src("Commands.ReviewChangesets.cs").Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement);"),
           "Review AI Proposals and Promote: the project's placement block and the active view reach the executor");
        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int ghostRefusal = ghost.IndexOf("PlacementApply.DesignOptionRefusal(doc,", StringComparison.Ordinal);
        int ghostResolve = ghost.IndexOf("PlacementApply.Resolve(doc, r.Guideline?.Placement, app.ActiveUIDocument?.ActiveView,", StringComparison.Ordinal);
        int ghostFiles = ghost.IndexOf("ChangesetClient.Propose(cfg, r.Key,", StringComparison.Ordinal);
        Ok(ghostRefusal > 0 && ghostResolve > ghostRefusal && ghostFiles > ghostResolve && ghost.Contains("Provenance = facts, Placement = placing }"),
           "Ghost Builder refuses a design option and a missing workset before it files anything, and hands its plan to the executor");
        Ok(Src("Commands.Datum.cs").Contains("PlacementApply.DesignOptionRefusal(doc,") && Src("GhostBuilder", "DatumBuilder.cs").Contains("PlacementApply.Apply(placing, made);"),
           "Datum from Drawings refuses a design option and places its levels and grids");
        Ok(Src("Commands.Massing.cs").Contains("PlacementApply.DesignOptionRefusal(orch.Doc,") && Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains("PlacementApply.Apply(placing,"),
           "Photo Massing refuses a design option and places its elements");

        // Review amendments C5, C6, C7, C10, C17.
        Ok(apply.Contains("class PlacementRefused : InvalidOperationException") && executor.Contains("catch (PlacementRefused ex)")
           && executor.Contains("NotRun = true, Error = ex.Message") && ghost.Contains("if (res.NotRun) return Abandon("),
           "a workset write Revit refuses leaves the changeset proposed (NotRun), never declined; Ghost Builder abandons and withdraws what it filed");
        Ok(apply.Contains("!view.Document.Equals(doc)") && Src("Commands.Massing.cs").Contains("DocPin.Check(app, orch.Doc, \"build the massing\")"),
           "a view of another model gives no phase, and Photo Massing builds only in the model it was started on");
        Ok(Src("GhostBuilder", "ChangesetPlacementEvent.cs").Contains("plan.Lines(result.Applied.Select(a => a.RevitUniqueId))")
           && ghost.Contains("placing.Lines(applied.Select(a => a.RevitUniqueId))")
           && Src("GhostBuilder", "DatumBuilder.cs").Contains("placing?.Lines(made.Where(e => e.IsValidObject).Select(e => e.UniqueId))")
           && Src("GhostBuilder", "GhostBuilderOrchestrator.cs").Contains("placing.Lines(report.NewElements.Where("),
           "every placer counts its workset and phase lines after the commit, from the elements still in the model");
        foreach (var file in new[] { "Commands.ReviewChangesets.cs", "Commands.Datum.cs" })
            Ok(Src(file).Contains("PlacementPolicy.UnreadRefusal("), file + ": a guideline that could not be read is refused, never read as no block");
        string ghostCmd = Src("Commands.GhostBuilder.cs"), massingCmd = Src("Commands.Massing.cs");
        int ghostOption = ghostCmd.IndexOf("PlacementApply.DesignOptionRefusal(doc, \"run Ghost Builder\")", StringComparison.Ordinal);
        Ok(ghostOption > 0 && ghostCmd.IndexOf("new DwgPickWindow(", StringComparison.Ordinal) > ghostOption,
           "Ghost Builder refuses a design option before a drawing is picked or imported");
        int massingOption = massingCmd.IndexOf("PlacementApply.DesignOptionRefusal(doc, \"run Photo Massing\")", StringComparison.Ordinal);
        Ok(massingOption > 0 && massingCmd.IndexOf("string folder = settings.GhostSourceFolder;", StringComparison.Ordinal) > massingOption,
           "Photo Massing refuses a design option before an image is read");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        PlacementBlockChecks();
```

with

```csharp
        PlacementBlockChecks();
        PlacementWiringChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`. Expect an unhandled `FileNotFoundException` naming `SentinelAddin\GhostBuilder\PlacementApply.cs`, after `284` passes: the writer does not exist.
- [ ] **Step 3: The one writer.**

Create `SentinelAddin/GhostBuilder/PlacementApply.cs`:

```csharp
#nullable disable
// MA-1a item 6, the Revit half: the one place Sentinel writes an element's workset and phase, and the one place it asks
// whether a design option is being edited. Every placer calls it — ChangesetExecutor (Ghost Builder, Review AI Proposals,
// Promote), DatumBuilder and Photo Massing's PlacePrepared — inside its own transaction, after its creates and before its
// stamp, so one Ctrl+Z removes the elements with their workset and phase. The decisions and every word are
// PlacementPolicy's (pure, tools/promote-check). It never creates a workset and never switches the active one.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    /// <summary>Review amendment C5: Revit refused a placement write on a created element (a workset owned by another
    /// user, a read-only parameter). It is this session's model state, not a verdict on the changeset: the placer rolls its
    /// transaction back, and the executor answers NotRun, so the changeset stays proposed — as for the other refusals of
    /// item 6.</summary>
    public sealed class PlacementRefused : InvalidOperationException
    {
        public PlacementRefused(string message) : base(message) { }
    }

    /// <summary>One placement run: the guideline's block (null = none), the model's user worksets, the active view's phase,
    /// and what was written on each element.</summary>
    public sealed class PlacementPlan
    {
        public GuidelinePlacement Block;
        public bool Workshared;
        /// <summary>The model's user worksets by name; null when the workset part does not run (no block, no workset
        /// named, or the model is not workshared).</summary>
        public Dictionary<string, int> WorksetIds;
        /// <summary>The active view's phase; null = the phase is left alone.</summary>
        public ElementId PhaseId;
        public string PhaseName;
        /// <summary>What Apply wrote, per element (review amendment C6).</summary>
        public readonly PlacementPolicy.Written Written = new PlacementPolicy.Written();

        /// <summary>The summary lines, counted from the elements still in the model: call it after the commit and the
        /// placer's own recount, with the UniqueIds of what survived. An element Revit removed at commit is in no count.</summary>
        public List<string> Lines(IEnumerable<string> survivingUniqueIds) =>
            PlacementPolicy.Lines(Block, Workshared, Written.Surviving(survivingUniqueIds), PhaseName);
    }

    public static class PlacementApply
    {
        /// <summary>Null, or the refusal when a design option is being edited: Sentinel never places into one, with or
        /// without a guideline. <paramref name="what"/> is the action to repeat.</summary>
        public static string DesignOptionRefusal(Document doc, string what)
        {
            var id = DesignOption.GetActiveDesignOptionId(doc);
            if (id == null || id == ElementId.InvalidElementId) return null;
            return PlacementPolicy.DesignOptionRefusal(doc.GetElement(id)?.Name ?? "(unnamed)", what);
        }

        /// <summary>Read what the block needs from the model, before any transaction: the user worksets (a workshared model
        /// only) and the active view's phase. Null with <paramref name="refusal"/> when a batch of these
        /// <paramref name="kinds"/> needs a workset the model does not have — a named thing that is missing is refused,
        /// never replaced. With no block the plan sets nothing and its Lines say so. A view of another document gives no
        /// phase (review amendment C17): two models from one template share phase ids, and this model's elements are never
        /// phased by another model's view.</summary>
        public static PlacementPlan Resolve(Document doc, GuidelinePlacement block, View view, IEnumerable<string> kinds, out string refusal)
        {
            refusal = null;
            if (view != null && !view.Document.Equals(doc)) view = null;
            var plan = new PlacementPlan { Block = block, Workshared = doc.IsWorkshared };
            if (block == null) return plan;
            if (doc.IsWorkshared && block.Worksets != null && block.Worksets.Count > 0)
            {
                var ids = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                foreach (Workset w in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset)) ids[w.Name] = w.Id.IntegerValue;
                var missing = PlacementPolicy.MissingWorksets(block, kinds, ids.Keys);
                if (missing.Count > 0) { refusal = PlacementPolicy.MissingWorksetRefusal(missing); return null; }
                plan.WorksetIds = ids;
            }
            if (block.Phase == "view" && view != null
                && doc.GetElement(view.get_Parameter(BuiltInParameter.VIEW_PHASE)?.AsElementId() ?? ElementId.InvalidElementId) is Phase phase)
            {
                plan.PhaseId = phase.Id;
                plan.PhaseName = phase.Name;
            }
            return plan;
        }

        /// <summary>Put each created element on the workset its category names and in the plan's phase. Inside the placer's
        /// open transaction. An element whose category the block names no workset for stays on the active workset (recorded);
        /// an element with no phase (a level, a grid) keeps none. A workset Revit will not set throws PlacementRefused: the
        /// placer rolls the whole batch back. What was written is recorded per element (plan.Written); the lines are counted
        /// from it after the commit.</summary>
        public static void Apply(PlacementPlan plan, IEnumerable<Element> created)
        {
            if (plan?.Block == null) return;
            foreach (var e in created)
            {
                if (e == null) continue;
                string workset = null, unnamed = null;
                if (plan.WorksetIds != null)
                {
                    // Locale-safe: the element's BuiltInCategory against the ten English category names a block may use
                    // (Compat), then the block's own key for that category, whatever its case or padding.
                    string category = GuidelineMatcher.PlacementCategories.FirstOrDefault(c => e.Category != null && e.Category.MatchesCategoryKey(c));
                    string name = PlacementPolicy.WorksetFor(plan.Block, category);
                    if (string.IsNullOrEmpty(name)) unnamed = e.Category?.Name ?? "no category";
                    else
                    {
                        var p = e.get_Parameter(BuiltInParameter.ELEM_PARTITION_PARAM);
                        if (!plan.WorksetIds.TryGetValue(name, out int id) || p == null || p.IsReadOnly || !p.Set(id))
                            throw new PlacementRefused($"Nothing was placed — Revit would not put {e.Category?.Name} {e.UniqueId} on workset \"{name}\" (the workset may be owned by another user, or not editable here).");
                        workset = name;
                    }
                }
                bool phased = plan.PhaseId != null && e.HasPhases() && e.ArePhasesModifiable();
                if (phased) e.CreatedPhaseId = plan.PhaseId;
                plan.Written.Add(e.UniqueId, workset, unnamed, phased);
            }
        }
    }
}
```

- [ ] **Step 4: Levels and grids as category keys.** `MatchesCategoryKey` compares by `BuiltInCategory` for the keys it knows and by the (localized) name otherwise; the block's `Levels` and `Grids` must not depend on Revit's language.

In `SentinelAddin/Compat.cs`, replace

```csharp
        ["Railings"] = BuiltInCategory.OST_StairsRailing,
```

with

```csharp
        ["Railings"] = BuiltInCategory.OST_StairsRailing,
        // MA-1a item 6: a guideline's placement block names a workset for these two.
        ["Levels"] = BuiltInCategory.OST_Levels,
        ["Grids"] = BuiltInCategory.OST_Grids,
```

- [ ] **Step 5: The executor.** In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, make five replacements. First, the result's lines:

First, replace

```csharp
        public string Block { get; set; }
    }
```

with

```csharp
        public string Block { get; set; }
        /// MA-1a item 6: what the placement block did to the created elements — worksets, phase — or why it did nothing;
        /// null when the changeset created nothing. Set by ChangesetPlacementEvent from the plan it resolved.
        public List<string> Placement { get; set; }
    }
```

Second, replace

```csharp
    public IReadOnlyDictionary<string, ProvenanceStamp.Facts> Provenance { get; set; }
```

with

```csharp
    public IReadOnlyDictionary<string, ProvenanceStamp.Facts> Provenance { get; set; }

    /// MA-1a item 6: where this changeset's created elements go — the workset each category names and the view's phase —
    /// resolved by the in-process caller on the API thread before Execute (PlacementApply.Resolve). Null = nothing is set
    /// (a changeset that creates nothing). A design option being edited is refused here whatever this holds.
    public PlacementPlan Placement { get; set; }
```

Third, replace

```csharp
        if (!toPlace.Any()) return result;

        string at = null; // the element being placed when something throws — the refusal names it
```

with

```csharp
        if (!toPlace.Any()) return result;
        // MA-1a item 6: never into a design option — refused before the transaction, for every source; the changeset stays
        // proposed (NotRun). A retype or an attach creates nothing, so it is not refused here. A retype of a floor, roof,
        // ceiling, door or window that is in an option is refused by Unsafe; a wall's is not (Unsafe keeps MA-0's checks
        // for walls — Promote's planner holds a wall in an option, an agent's changeset is not held: see Risks).
        if (toPlace.Any(IsCreate) && PlacementApply.DesignOptionRefusal(doc, "apply it") is { } inOption)
            return new ExecutionResult { NotRun = true, Error = inOption };

        string at = null; // the element being placed when something throws — the refusal names it
```

Fourth, replace

```csharp
            // The stamp: once per element, with every guid of this changeset that touched it, merged onto the element's
```

with

```csharp
            // MA-1a item 6: each element this changeset CREATED goes to the workset its category names and to the view's
            // phase — inside this transaction, so Ctrl+Z takes them back with the element. A retype or attach target keeps
            // its own workset and phase.
            at = "the placement block";
            PlacementApply.Apply(Placement, result.Applied.Where(a => IsCreate(toPlace.First(e => e.ProposalGuid == a.ProposalGuid)))
                                                  .Select(a => doc.GetElement(a.RevitUniqueId)));
            // The stamp: once per element, with every guid of this changeset that touched it, merged onto the element's
```

Fifth (review amendment C5), replace

```csharp
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            // Our own refusals already name the element; anything else (a Revit API or .NET exception) is named here, with
```

with

```csharp
        catch (PlacementRefused ex)
        {
            // MA-1a item 6 (review amendment C5): Revit refused a workset write — this session's model state, not a verdict
            // on the changeset. Rolled back whole; the changeset stays proposed (NotRun), like the other refusals of item 6.
            // An Error without NotRun would be reported to the ledger as declined, and could not be applied again.
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            return new ExecutionResult { NotRun = true, Error = ex.Message };
        }
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            // Our own refusals already name the element; anything else (a Revit API or .NET exception) is named here, with
```

- [ ] **Step 6: Review AI Proposals and Promote.** In `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`, make three replacements. First, the request carries the block:

First, replace

```csharp
    private Document _doc;   // the model the review window was opened on (XC-1)

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc) { _cs = cs; _ticked = ticked; _doc = doc; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc;
        _cs = null; _ticked = null; _doc = null;
```

with

```csharp
    private Document _doc;   // the model the review window was opened on (XC-1)
    private GuidelinePlacement _placement; // MA-1a item 6: the project's placement block, fetched by the caller; null = none

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked, Document doc, GuidelinePlacement placement = null)
    { _cs = cs; _ticked = ticked; _doc = doc; _placement = placement; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked; var doc = _doc; var placement = _placement;
        _cs = null; _ticked = null; _doc = null; _placement = null;
```

Second, replace

```csharp
            var before = BlockCheck.Before(doc, out var note);
            if (before == null)
            {
                result = new ChangesetExecutor().Execute(doc, cs, ticked);
                result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            }
            else result = RunChecked(doc, cs, ticked, before);
        }
```

with

```csharp
            // MA-1a item 6: what the ticked creates need from the model — the worksets the block names (a missing one is
            // refused here, before any transaction: the changeset stays proposed) and the active view's phase.
            var kinds = (cs.Elements ?? new List<ChangesetElementDto>())
                .Where(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")).Select(e => e.Kind).ToList();
            PlacementPlan plan = null;
            if (kinds.Count > 0)
            {
                plan = PlacementApply.Resolve(doc, placement, app.ActiveUIDocument?.ActiveView, kinds, out var noWorkset);
                if (plan == null)
                {
                    Raise(new ChangesetExecutor.ExecutionResult { Error = noWorkset, NotRun = true });
                    return;
                }
            }
            var before = BlockCheck.Before(doc, out var note);
            if (before == null)
            {
                result = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
                result.Block = note; // "not checked — the ruleset has not loaded yet", or null: no BLOCK rule can fire
            }
            else result = RunChecked(doc, cs, ticked, before, plan);
            // Said only for a changeset that was placed: a refused, rolled-back or unfinished one set nothing. Counted
            // from result.Applied — what the executor's recount left — so an element Revit removed at commit is in no line.
            if (plan != null && !result.NotRun && result.Error == null && result.NotFinished == null)
                result.Placement = plan.Lines(result.Applied.Select(a => a.RevitUniqueId));
        }
```

Third, replace

```csharp
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before)
    {
        using var group = new TransactionGroup(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        try
        {
            group.Start();
            // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
            group.IsFailureHandlingForcedModal = false;
            var result = new ChangesetExecutor().Execute(doc, cs, ticked);
```

with

```csharp
    private static ChangesetExecutor.ExecutionResult RunChecked(Document doc, ChangesetDto cs, HashSet<string> ticked, ScanReport before, PlacementPlan plan)
    {
        using var group = new TransactionGroup(doc, UndoWatcher.TxName(cs.Name, cs.Id));
        try
        {
            group.Start();
            // F-S2-1: a group forces modal failure handling on its inner transactions unless told not to.
            group.IsFailureHandlingForcedModal = false;
            var result = new ChangesetExecutor { Placement = plan }.Execute(doc, cs, ticked);
```

Then in `SentinelAddin/Commands.ReviewChangesets.cs`, make three replacements. Review AI Proposals already waits on the bridge here (the re-fetch and the role), so the guideline is fetched the same way — off this thread, waited for, 4 s at most (Annotate's pattern). First, add the using:

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace

```csharp
using System.Linq;
using Autodesk.Revit.Attributes;
```

with

```csharp
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

Second, replace

```csharp
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked), doc);
            evt.Raise();
```

with

```csharp
            // MA-1a item 6: the project's guideline, for its placement block — only when a ticked element is a create.
            // Fetched off this thread and waited for (4 s at most), as Annotate does. None installed is no block, and the
            // result says so. A guideline that could not be read is not "no block" (review amendment C7): nothing runs,
            // and the changeset stays proposed.
            GuidelinePlacement placement = null;
            if (fresh.Elements.Any(e => ticked.Contains(e.ProposalGuid) && (e.Op is null or "create")))
            {
                var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
                if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled,
                                                  !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                {
                    TaskDialog.Show("Sentinel — AI proposals", unread + "\n\nThe proposals are still pending — run Review AI Proposals again once the guideline can be read.");
                    return;
                }
                placement = standards.Guideline.Placement;
            }
            handler.Completed += onDone;
            handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement);
            evt.Raise();
```

Third, replace

```csharp
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : ""));
```

with

```csharp
                    (warnings != null ? "\n\n" + warnings : "") + (result.Block != null ? "\n\n" + result.Block : "") +
                    (result.Placement != null ? "\n\n" + string.Join("\n", result.Placement) : "")); // MA-1a item 6
```

- [ ] **Step 7: Ghost Builder.** In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, make five replacements. Both refusals come before anything is filed, so no changeset is left on the ledger for a build that did not run. First, the design option (the command asks the same question before the drawing is picked — the last part of this step; this one covers an option entered while the review is open):

First, replace

```csharp
            if (DocPin.Check(app, doc, "build from the drawing") is { } refusal) { report.NotBuilt = refusal; return report; }
```

with

```csharp
            if (DocPin.Check(app, doc, "build from the drawing") is { } refusal) { report.NotBuilt = refusal; return report; }
            // MA-1a item 6: never into a design option — said before anything is read, typed or filed.
            if (PlacementApply.DesignOptionRefusal(doc, "build") is { } inOption) { report.NotBuilt = inOption; return report; }
```

Second, replace

```csharp
                // ── 3. File: changesets of at most 200, hosts first (unbound: local changesets, no ledger) ───────────────────
```

with

```csharp
                // MA-1a item 6: the guideline's placement block against this model, before anything is filed — a workset the
                // plan needs and the model lacks abandons the build (nothing filed, the types step rolled back).
                var placing = PlacementApply.Resolve(doc, r.Guideline?.Placement, app.ActiveUIDocument?.ActiveView, plan.Select(p => p.Dto.Kind), out string noWorkset);
                if (placing == null) return Abandon(noWorkset + " The types step was rolled back too.");

                // ── 3. File: changesets of at most 200, hosts first (unbound: local changesets, no ledger) ───────────────────
```

Third, replace

```csharp
                    var res = new ChangesetExecutor { WallsBefore = wallsBefore, Provenance = facts }.Execute(doc, cs, new HashSet<string>(cs.Elements.Select(e => e.ProposalGuid)));
```

with

```csharp
                    var res = new ChangesetExecutor { WallsBefore = wallsBefore, Provenance = facts, Placement = placing }.Execute(doc, cs, new HashSet<string>(cs.Elements.Select(e => e.ProposalGuid)));
```

Fourth (review amendment C5), replace

```csharp
                    if (res.Error != null) return Decline(cs, res.Error);
```

with

```csharp
                    // MA-1a item 6 (review amendment C5): Revit refused a placement write — nothing is declined. The whole
                    // build is rolled back and what was filed is withdrawn, as for a refusal before filing.
                    if (res.NotRun) return Abandon(res.Error + " The build was rolled back, the types step too.");
                    if (res.Error != null) return Decline(cs, res.Error);
```

Fifth, replace

```csharp
                report.Placed = applied.Count;
                report.Stamped = applied.Count(a => ProvenanceStamp.SourceOf(ProvenanceStamp.Read(doc.GetElement(a.RevitUniqueId))) == GhostFiling.Source);
```

with

```csharp
                report.Placed = applied.Count;
                // MA-1a item 6: the worksets and the phase, or why nothing was set — counted from `applied`, what the
                // executor's recount left in the model. Its own list: a result of the build, not a warning.
                report.Placement.AddRange(placing.Lines(applied.Select(a => a.RevitUniqueId)));
                report.Stamped = applied.Count(a => ProvenanceStamp.SourceOf(ProvenanceStamp.Read(doc.GetElement(a.RevitUniqueId))) == GhostFiling.Source);
```

The report's own list (review amendment C18). In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`, replace

```csharp
            public readonly List<string> Warnings = new List<string>();
            /// <summary>Types and families this build added to the model: families loaded, wall and floor types the mapping names, guideline-gap sizes.</summary>
```

with

```csharp
            public readonly List<string> Warnings = new List<string>();
            /// <summary>MA-1a item 6: what the placement block did to this build's elements — worksets, phase — or why it did
            /// nothing. Its own list: a result of the build, printed apart from the warnings.</summary>
            public readonly List<string> Placement = new List<string>();
            /// <summary>Types and families this build added to the model: families loaded, wall and floor types the mapping names, guideline-gap sizes.</summary>
```

Then in `SentinelAddin/Commands.GhostBuilder.cs`, make two replacements. First, the design option is asked before a drawing is picked (review amendment C10): the import below is a transaction of its own, and would land in the option being edited. Replace

```csharp
        // 2. Acquire the DWG: folder-first (same GhostSourceFolder Datum reads), PickObject fallback.
```

with

```csharp
        // MA-1a item 6 (review amendment C10): never into a design option — said before a drawing is picked, imported or
        // read. The build asks again (GhostChangesetBuild), for an option entered while the review is open.
        if (PlacementApply.DesignOptionRefusal(doc, "run Ghost Builder") is { } inOption)
        {
            TaskDialog.Show("Sentinel — Ghost Builder", inOption);
            return Result.Cancelled;
        }

        // 2. Acquire the DWG: folder-first (same GhostSourceFolder Datum reads), PickObject fallback.
```

Second, the summary prints the placement lines as a result, before the warnings. Replace

```csharp
        if (r.Warnings.Count > 0)
        {
            // Collapse identical warnings (a dirty layer can skip tens of thousands of elements for
```

with

```csharp
        // MA-1a item 6: what the placement block did — a result of the build, not a warning.
        if (r.Placement.Count > 0)
        {
            lines.AppendLine();
            foreach (var p in r.Placement) lines.AppendLine(p);
        }
        if (r.Warnings.Count > 0)
        {
            // Collapse identical warnings (a dirty layer can skip tens of thousands of elements for
```

- [ ] **Step 8: Datum from Drawings.** Datum creates levels and grids in its own transaction (founder decision F7 of the items 3–5 plan). In `SentinelAddin/Commands.Datum.cs`, make three replacements. First, the using and the design option:

First, replace

```csharp
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
```

with

```csharp
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

Second, replace

```csharp
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        var builder = new DatumBuilder(doc);
```

with

```csharp
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        // MA-1a item 6: never into a design option — said before a drawing is picked.
        if (PlacementApply.DesignOptionRefusal(doc, "run Datum from Drawings") is { } inOption)
        {
            TaskDialog.Show("Sentinel — Datum", inOption);
            return Result.Cancelled;
        }

        var builder = new DatumBuilder(doc);
```

Third, replace

```csharp
        var result = builder.Build(detected);
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
```

with

```csharp
        // MA-1a item 6: the project's guideline, for its placement block (Annotate's pattern: fetched off this thread and
        // waited for, 4 s at most; an unbound model has none). A workset the block names for Levels or Grids that the
        // model lacks is refused before the transaction.
        string key = ProjectContext.For(doc).Key;
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
        // Review amendment C7: a guideline that could not be read is not "no block" — refused before anything is created.
        if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled,
                                          !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
        {
            TaskDialog.Show("Sentinel — Datum", unread);
            return Result.Cancelled;
        }
        var block = standards.Guideline.Placement;
        // Asked by what the drawing holds, not by what will be new (E4): a level that already exists is still asked for.
        var kinds = new[] { detected.Levels.Count > 0 ? "level" : null, detected.Grids.Count > 0 ? "grid" : null }.Where(k => k != null);
        var placing = PlacementApply.Resolve(doc, block, uidoc.ActiveView, kinds, out var noWorkset);
        if (placing == null)
        {
            TaskDialog.Show("Sentinel — Datum", noWorkset);
            return Result.Cancelled;
        }

        DatumBuilder.DatumResult result;
        try { result = builder.Build(detected, placing); }
        catch (PlacementRefused ex)
        {
            // Review amendment C5: Revit refused a workset write; Build rolled its transaction back. Said in Sentinel's
            // own dialog, not as an external-command exception.
            TaskDialog.Show("Sentinel — Datum", ex.Message);
            return Result.Cancelled;
        }
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
            "\n\n" + string.Join("\n", result.Placement) +
```

Then in `SentinelAddin/GhostBuilder/DatumBuilder.cs`, make three replacements. First, the result carries the placement lines: replace

```csharp
            public int LevelsCreated, GridsCreated;
```

with

```csharp
            public int LevelsCreated, GridsCreated;
            /// <summary>MA-1a item 6: the placement block's lines for what Build created, counted after its commit from the
            /// levels and grids still in the model; null when Build was given no plan.</summary>
            public List<string> Placement;
```

Second, in `SentinelAddin/GhostBuilder/DatumBuilder.cs`, replace

```csharp
        public DatumResult Build(DatumResult detected)
        {
```

with

```csharp
        /// <param name="placing">MA-1a item 6: where the new levels and grids go (PlacementApply.Resolve); null = nothing is set.</param>
        public DatumResult Build(DatumResult detected, PlacementPlan placing = null)
        {
            var made = new List<Element>(); // what this run created, for the placement block
```

Then replace

```csharp
                        detected.LevelsCreated++;
                        ProvenanceStamp.Write(level, null, "dwg", null, levelFacts);
                    }
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings) is Grid grid)
                    {
                        detected.GridsCreated++;
                        ProvenanceStamp.Write(grid, null, "dwg", null, gridFacts);
                    }
                t.Commit();
```

with

```csharp
                        detected.LevelsCreated++;
                        made.Add(level);
                        ProvenanceStamp.Write(level, null, "dwg", null, levelFacts);
                    }
                foreach (var g in detected.Grids)
                    if (CreateGrid(g, detected.Warnings) is Grid grid)
                    {
                        detected.GridsCreated++;
                        made.Add(grid);
                        ProvenanceStamp.Write(grid, null, "dwg", null, gridFacts);
                    }
                // MA-1a item 6: each new level and grid on the workset the guideline names — inside this transaction.
                PlacementApply.Apply(placing, made);
                t.Commit();
                // Counted after the commit, from the levels and grids still in the model (review amendment C6).
                detected.Placement = placing?.Lines(made.Where(e => e.IsValidObject).Select(e => e.UniqueId));
```

- [ ] **Step 9: Photo Massing.** Massing places through `PlacePrepared`, off the executor until MA-6 (step-2 F5). In `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`, make four replacements:

First, replace

```csharp
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null, string imagesSha256 = null)
        {
```

with

```csharp
        /// <param name="placing">MA-1a item 6: where the new elements go (PlacementApply.Resolve); null = nothing is set.</param>
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null, string imagesSha256 = null,
            PlacementPlan placing = null)
        {
```

Second, replace

```csharp
                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
                TransactionStatus status = t.Commit();
```

with

```csharp
                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
                // MA-1a item 6: each element this build made on the workset its category names and in the view's phase —
                // inside this transaction.
                PlacementApply.Apply(placing, report.NewElements.Select(n => _doc.GetElement(n.Id)));
                TransactionStatus status = t.Commit();
```

Third, replace

```csharp
                foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) report.RevitWarnings[kv.Key] = kv.Value;
            }
            catch
```

with

```csharp
                foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) report.RevitWarnings[kv.Key] = kv.Value;
                // MA-1a item 6: said once the build is committed, counted from this build's elements still in the model.
                if (placing != null)
                    report.Placement.AddRange(placing.Lines(report.NewElements.Where(n => _doc.GetElement(n.Id) != null).Select(n => _doc.GetElement(n.Id).UniqueId)));
            }
            catch
```

Fourth, expose the document: replace

```csharp
        private readonly Document _doc;
```

with

```csharp
        private readonly Document _doc;
        /// <summary>The model this orchestrator builds in (MA-1a item 6: Photo Massing's placement event reads it).</summary>
        public Document Doc => _doc;
```

Then in `SentinelAddin/Commands.Massing.cs`, make five replacements. The block rides with the request; the placement event refuses a model that is no longer the active one, a design option and a missing workset before the transaction (an exception here becomes the dialog's `Build failed: …`, as every other refusal of this event does). The command also refuses a design option before an image is read (review amendment C10), and its summary prints the placement lines apart from its notes (C18).

First, replace

```csharp
                        placementEvent.SetRequest(orchestrator, elements, mapping, MassingPlanner.HasModelValue(corrected) ? imagesSha : null);
```

with

```csharp
                        placementEvent.SetRequest(orchestrator, elements, mapping, MassingPlanner.HasModelValue(corrected) ? imagesSha : null,
                                                  standards.Guideline.Placement); // MA-1a item 6
```

Second, replace

```csharp
    private string _imagesSha; // MA-1a item 4: the images read, for the stamp

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, string imagesSha)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping; _imagesSha = imagesSha;
    }
```

with

```csharp
    private string _imagesSha; // MA-1a item 4: the images read, for the stamp
    private GuidelinePlacement _placement; // MA-1a item 6: the guideline's placement block; null = none

    public event Action<GhostPlacementEngine.PlacementReport, Exception> Completed;

    public void SetRequest(GhostBuilderOrchestrator orchestrator,
                           System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, string imagesSha,
                           GuidelinePlacement placement = null)
    {
        _orchestrator = orchestrator; _elements = elements; _mapping = mapping; _imagesSha = imagesSha; _placement = placement;
    }
```

Third, replace

```csharp
        var orch = _orchestrator; var els = _elements; var map = _mapping; var sha = _imagesSha;
        _orchestrator = null; _elements = null; _mapping = null; _imagesSha = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            Completed?.Invoke(orch.PlacePrepared(els, map, imagesSha256: sha), null);
        }
```

with

```csharp
        var orch = _orchestrator; var els = _elements; var map = _mapping; var sha = _imagesSha; var placement = _placement;
        _orchestrator = null; _elements = null; _mapping = null; _imagesSha = null; _placement = null;
        try
        {
            if (orch == null) throw new InvalidOperationException("No massing request staged.");
            // XC-1 (review amendment C17): the review window is modeless — build only while the model the command was
            // started on is the active one, so the active view (and its phase) is that model's.
            if (DocPin.Check(app, orch.Doc, "build the massing") is { } pinned) throw new InvalidOperationException(pinned);
            // MA-1a item 6: never into a design option, and never onto a workset the model does not have — both said
            // before the transaction.
            if (PlacementApply.DesignOptionRefusal(orch.Doc, "build the massing") is { } inOption) throw new InvalidOperationException(inOption);
            // Only the kinds of the layers this plan staged are asked for (review amendment C8): a massing with no
            // openings needs no Doors or Windows workset.
            var kinds = map?.Mappings == null || els == null ? new System.Collections.Generic.List<string>()
                : map.Mappings.Where(m => els.Any(e => e.CadLayer == m.CadLayer)).Select(m => PlacementPolicy.KindOf(m.Category))
                     .Where(k => k != null).Distinct().ToList();
            var placing = PlacementApply.Resolve(orch.Doc, placement, app.ActiveUIDocument?.ActiveView, kinds, out var noWorkset);
            if (placing == null) throw new InvalidOperationException(noWorkset);
            Completed?.Invoke(orch.PlacePrepared(els, map, imagesSha256: sha, placing: placing), null);
        }
```

Fourth (review amendment C10), replace

```csharp
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        var settings = SettingsManager.Resolve(doc);
        string folder = settings.GhostSourceFolder;
```

with

```csharp
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        // MA-1a item 6 (review amendment C10): never into a design option — said before an image is read. The placement
        // event asks again, for an option entered while the review is open.
        if (PlacementApply.DesignOptionRefusal(doc, "run Photo Massing") is { } inOption)
        {
            TaskDialog.Show("Sentinel — Massing", inOption);
            return Result.Cancelled;
        }

        var settings = SettingsManager.Resolve(doc);
        string folder = settings.GhostSourceFolder;
```

Fifth (review amendment C18), replace

```csharp
        if (r.Warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Notes:");
```

with

```csharp
        // MA-1a item 6: what the placement block did — a result of the build, not a note.
        if (r.Placement.Count > 0)
        {
            sb.AppendLine();
            foreach (var p in r.Placement) sb.AppendLine(p);
        }
        if (r.Warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Notes:");
```

- [ ] **Step 10: Run.**
  - Both builds: `0 Error(s)`, warnings as on master.
  - `dotnet run --project tools/promote-check`: expect `301/301 checks pass` (17 new, the wiring).
  - `ghost-p2-check` `103/103` and `session-check` `47/47`: unchanged.
- [ ] **Step 11: Commit.**

```bash
git add SentinelAddin/GhostBuilder/PlacementApply.cs SentinelAddin/Compat.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/Commands.Datum.cs SentinelAddin/GhostBuilder/DatumBuilder.cs SentinelAddin/Commands.Massing.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs tools/promote-check/PlacementBlock.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(executor): every element Sentinel creates goes to the workset its category names and the view's phase, and never into a design option (MA-1a item 6)

One writer (PlacementApply), called inside each placer's transaction before its stamp: the changeset executor (Ghost
Builder, Review AI Proposals, Promote), Datum and Photo Massing. A design option being edited, a workset the model
lacks and a guideline that could not be read are refused before any transaction and before anything is filed; a
workset write Revit refuses rolls the batch back and leaves the changeset proposed. No block, a model that is not
workshared and a view with no phase are said in the summary, whose counts are taken after the commit from the
elements still in the model. promote-check 301/301.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4 — The office-template check in Ghost Builder, Photo Massing and Promote (item 6)

**Files:**
- Modify `tools/promote-check/PlacementBlock.cs` (five wiring checks)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`LoadedTypes` becomes `internal`; the check after the standards load; the summary line)
- Modify `SentinelAddin/Commands.Massing.cs` (the same)
- Modify `SentinelAddin/Commands.PromoteWalls.cs` (the same, before planning)

**Interfaces:** each of the three commands that load the type catalogue counts the office types the open model holds (`GuidelineMatcher.OfficeTypesIn(GhostBuilderCommand.LoadedTypes(doc))`, Task 2) and:
- refuses with the design's sentence when the model holds none of them (`PlacementPolicy.TemplateRefuses`, founder decision F5);
- otherwise prints `Office template: N of M office type(s) present (type_catalog@n …).` in its summary or its header;
- with no catalogue installed, or no category to compare, prints `Office template: not checked — …`, never a pass.

Review AI Proposals loads no catalogue and already refuses a named type the model lacks, element by element; it gets no model-level check. The model's types are read on the API thread (`LoadedTypes`), the count runs wherever the standards land.

- [ ] **Step 1: The failing check.**

In `tools/promote-check/PlacementBlock.cs`, replace

```csharp
           "Photo Massing refuses a design option before an image is read");
    }
}
```

with

```csharp
           "Photo Massing refuses a design option before an image is read");

        // The office-template check: the three commands that load the catalogue count, refuse at none, and say the count.
        foreach (var (file, count) in new[]
        {
            ("Commands.GhostBuilder.cs", "resolved.Guideline.OfficeTypesIn(loadedTypes)"),
            ("Commands.Massing.cs", "standards.Guideline.OfficeTypesIn(loadedTypes)"),
            ("Commands.PromoteWalls.cs", "standards.Guideline.OfficeTypesIn(GhostBuilderCommand.LoadedTypes(doc))"),
        })
        {
            string src = Src(file);
            Ok(src.Contains(count) && src.Contains("PlacementPolicy.TemplateRefuses(officeHave, officeAll)")
               && src.Contains("PlacementPolicy.TemplateRefusal(officeAll,") && src.Contains("PlacementPolicy.TemplateLine("),
               file + ": counts the office types in the model, refuses when there are none, and says the count");
        }
        // Review amendment C7: the two commands that load the full standards refuse a guideline that could not be read.
        foreach (var file in new[] { "Commands.GhostBuilder.cs", "Commands.Massing.cs" })
            Ok(Src(file).Contains("PlacementPolicy.UnreadRefusal("), file + ": a guideline that could not be read is refused, never read as no block");
    }
}
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`: expect `301/306 checks pass` with five `FAIL` lines.
- [ ] **Step 3: Ghost Builder.** In `SentinelAddin/Commands.GhostBuilder.cs`, make five replacements. First, the model's types are read once, for the review's drop-downs and for the check:

First, replace

```csharp
        review.LoadTypes(LoadedTypes(doc)); // GHB-5: what each row's type drop-down offers, read here on the API thread
```

with

```csharp
        var loadedTypes = LoadedTypes(doc); // GHB-5: what each row's type drop-down offers, read here on the API thread
        review.LoadTypes(loadedTypes);
        string? templateLine = null; // MA-1a item 6: the office-template check's line, set in PHASE 2 for the summary
```

Second, replace

```csharp
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report, standards!));
```

with

```csharp
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report, standards!, templateLine));
```

Third, replace

```csharp
                standards = resolved;
                // The per-project mapping cache (%AppData%\Sentinel\cache\<key>\dwg_mappings.json), stamped by the
```

with

```csharp
                standards = resolved;
                // MA-1a item 6 (review amendment C7): a guideline that could not be read is not "no block" — nothing is
                // built on a guess about the office's worksets.
                if (PlacementPolicy.UnreadRefusal(resolved.GuidelineSource.Origin, resolved.GuidelineSource.NotInstalled,
                                                  !string.IsNullOrWhiteSpace(key), resolved.GuidelineSource.Reason) is { } unread)
                {
                    FailOnUi(progress, Release, unread);
                    return;
                }
                // MA-1a item 6, the office-template check: Build from Evidence runs only in a model whose types match the
                // installed catalogue. Refused when the model holds none of the office types (founder decision F5);
                // otherwise the count is said in the summary. The DWG import made above stays in the model, as it does
                // after every other refusal of this command.
                var (officeHave, officeAll) = resolved.Guideline.OfficeTypesIn(loadedTypes);
                if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
                {
                    FailOnUi(progress, Release, PlacementPolicy.TemplateRefusal(officeAll, resolved.CatalogSource.Label));
                    return;
                }
                templateLine = PlacementPolicy.TemplateLine(resolved.Guideline.HasCatalog, officeHave, officeAll, resolved.CatalogSource.Label);
                // The per-project mapping cache (%AppData%\Sentinel\cache\<key>\dwg_mappings.json), stamped by the
```

Fourth, replace (Photo Massing and Promote read the model's types the same way)

```csharp
    private static Dictionary<string, IReadOnlyList<(string? Family, string Type)>> LoadedTypes(Document doc)
```

with

```csharp
    internal static Dictionary<string, IReadOnlyList<(string? Family, string Type)>> LoadedTypes(Document doc)
```

Fifth, replace

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        // What this build was mapped and typed by, first — the review window's header, repeated.
        lines.AppendLine(s.Header);
        if (s.CatalogSource.Origin == "none") lines.AppendLine(CatalogueNotChecked(s));
```

with

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s, string? template = null)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        // What this build was mapped and typed by, first — the review window's header, repeated.
        lines.AppendLine(s.Header);
        if (s.CatalogSource.Origin == "none") lines.AppendLine(CatalogueNotChecked(s));
        if (template != null) lines.AppendLine(template); // MA-1a item 6: the office-template check
```

- [ ] **Step 4: Photo Massing.** In `SentinelAddin/Commands.Massing.cs`, make four replacements:

First, replace

```csharp
        GhostStandards standards = null; // set in the background before the review window can raise a build
```

with

```csharp
        GhostStandards standards = null; // set in the background before the review window can raise a build
        var loadedTypes = GhostBuilderCommand.LoadedTypes(doc); // MA-1a item 6: the model's types, read on the API thread
        string templateLine = null;                             // the office-template check's line, for the summary
```

Second, replace

```csharp
                error != null ? "Build failed: " + error.Message : Summarize(report, standards));
```

with

```csharp
                error != null ? "Build failed: " + error.Message : Summarize(report, standards, templateLine));
```

Third, replace

```csharp
                standards = await fetch.ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
```

with

```csharp
                standards = await fetch.ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                // MA-1a item 6 (review amendment C7): a guideline that could not be read is not "no block".
                if (PlacementPolicy.UnreadRefusal(standards.GuidelineSource.Origin, standards.GuidelineSource.NotInstalled,
                                                  !string.IsNullOrWhiteSpace(key), standards.GuidelineSource.Reason) is { } unread)
                {
                    progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show("Sentinel — Massing", unread); });
                    return;
                }
                // MA-1a item 6, the office-template check: refused when the model holds none of the office types.
                var (officeHave, officeAll) = standards.Guideline.OfficeTypesIn(loadedTypes);
                if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
                {
                    string refused = PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label);
                    progress.Dispatcher.Invoke(() => { progress.Close(); TaskDialog.Show("Sentinel — Massing", refused); });
                    return;
                }
                templateLine = PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);
```

Fourth, replace

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
```

with

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s, string template = null)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
        if (template != null) sb.AppendLine(template); // MA-1a item 6: the office-template check
```

- [ ] **Step 5: Promote.** In `SentinelAddin/Commands.PromoteWalls.cs`, make two replacements:

First, replace

```csharp
        var mxSource = mxTask.GetAwaiter().GetResult();
```

with

```csharp
        // MA-1a item 6, the office-template check: Promote retypes onto office types, so a model that holds none of them
        // was not made from the office template — said before anything is planned.
        var (officeHave, officeAll) = standards.Guideline.OfficeTypesIn(GhostBuilderCommand.LoadedTypes(doc));
        if (PlacementPolicy.TemplateRefuses(officeHave, officeAll))
        {
            TaskDialog.Show(Title, PlacementPolicy.TemplateRefusal(officeAll, standards.CatalogSource.Label));
            return Result.Cancelled;
        }
        var mxSource = mxTask.GetAwaiter().GetResult();
```

Second, replace

```csharp
        if (mx == null) notRun.Clear();
```

with

```csharp
        if (mx == null) notRun.Clear();
        header += "\n" + PlacementPolicy.TemplateLine(standards.Guideline.HasCatalog, officeHave, officeAll, standards.CatalogSource.Label);
```

- [ ] **Step 6: Run.** Both builds `0 Error(s)`; `dotnet run --project tools/promote-check`: expect `306/306 checks pass`.
- [ ] **Step 7: Commit.**

```bash
git add tools/promote-check/PlacementBlock.cs SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/Commands.Massing.cs SentinelAddin/Commands.PromoteWalls.cs
git commit -F - <<'EOF'
feat(ghost): the office-template check — Ghost Builder, Photo Massing and Promote refuse a model that holds none of the office types, and say the count otherwise (MA-1a item 6)

"this model was not made from the office template": refused when the open model holds none of the catalogue's types
in the guideline's categories; otherwise "Office template: N of M office type(s) present". With no catalogue it says
not checked. Both commands refuse a guideline that could not be read. promote-check 306/306.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5 — Bridge: the modelling commands' report types, and the `build:run` receipt row (items 7 and 8)

**Files:**
- Modify `WebApp/bridge/write-roles.test.mjs` (append)
- Modify `WebApp/bridge/cde-store.mjs` (`REVIT_REPORT_TYPES`, `recordNote`, a new `buildRunRow`)
- Modify `WebApp/bridge/bcf-service.mjs` (the route's comment only)

**Interfaces:** `POST /cde/:key/audit` (the Revit report route) accepts nine more `entity_type`s from a signed-in contributor or above, under the limits it already has (action 1–500 characters, `new_value` at most 256 KB, the shared `revit reports` budget of 20 per user and 60 in all per minute, actor = the verified identity):
- item 7: `datum`, `ghost_build`, `massing`, `annotate`, `apply_standard`, `auto_fix`, `fix_in_place`, `doctor` — one row per run, click or save, with counts;
- item 8: `build` — a reader's or planner's receipt. Whoever posts it, the bridge sets `action` to `build:run` and `new_value.claimed` to `true` (no bridge-run job backs a receipt until MA-4's survey jobs); a `new_value` that is not an object is a 400; an action starting `build:` under any other type is a 400.

No migration: `audit_log.entity_type` is plain text. No per-type validation of `new_value` (as for `naming` and `family_heal`): the shapes are pinned on the add-in's side (Tasks 6 and 10).

- [ ] **Step 1: The failing tests.**

Append to `WebApp/bridge/write-roles.test.mjs`:

```js
// MA-1a items 7 and 8: the Revit report route takes the modelling commands' reports (one row per run, counts and actor)
// and the build:run receipt, under the limits it already has. One bridge copy serves this whole file, so the report
// budget (20 per user a minute) is shared across these tests: the contributor posts 9, the owner 21.
describe("POST /cde/:key/audit — the modelling commands' reports and the build:run receipt (MA-1a items 7, 8)", () => {
  const A = "/cde/demo/audit";
  const TYPES = ["datum", "ghost_build", "massing", "annotate", "apply_standard", "auto_fix", "fix_in_place", "doctor"];

  it.each(TYPES)("a contributor's %s report lands as one row under the verified identity", async (type) => {
    const r = await call("POST", A, "contributor", { entity_type: type, actor: "Someone else", action: `${type}: 2 done`, new_value: { count: 2 } });
    expect(r.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor, a.new_value])).toEqual([[type, `${type}: 2 done`, "contributor@example.test", { count: 2 }]]);
  });

  it("a viewer reports nothing, a report past 256 KB is a 413, and a type not on the list is still refused", async () => {
    expect(await call("POST", A, "viewer", { entity_type: "datum", action: "x", new_value: {} }))
      .toEqual({ status: 403, body: { message: "a datum row is a contributor's or above (you are viewer) — nothing was saved" } });
    expect((await call("POST", A, "lead", { entity_type: "doctor", action: "big", new_value: { t: "x".repeat(300 * 1024) } })).status).toBe(413);
    expect((await call("POST", A, "lead", { entity_type: "clash_view", action: "x" })).status).toBe(400);
    expect(writes("audit_log")).toEqual([]);
  });

  it("a build row is a receipt: the bridge words the action build:run and marks it claimed, whoever posts it", async () => {
    const r = await call("POST", A, "contributor", { entity_type: "build", action: "anything", new_value: { reader: "ghost-builder", model_calls: 2, claimed: false } });
    expect(r.status).toBe(201);
    const m = await call("POST", A, "machine", { entity_type: "build", actor: "unsigned — drill", action: "build:run", new_value: { reader: "datum" } });
    expect(m.status).toBe(201);
    expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor, a.new_value])).toEqual([
      ["build", "build:run", "contributor@example.test", { reader: "ghost-builder", model_calls: 2, claimed: true }],
      ["build", "build:run", "unsigned — drill", { reader: "datum", claimed: true }],
    ]);
  });

  it("a receipt that is not an object, and a build: action under another type, are refused — nothing is saved", async () => {
    for (const who of ["contributor", "machine"]) {
      expect(await call("POST", A, who, { entity_type: "build", action: "build:run", new_value: "ran" }))
        .toEqual({ status: 400, body: { message: "a build row's new_value is the receipt, an object — nothing was saved" } });
      expect(await call("POST", A, who, { entity_type: "naming", action: "build:run", new_value: {} }))
        .toEqual({ status: 400, body: { message: 'build: rows are receipts (entity_type "build") — nothing was saved' } });
    }
    expect(writes("audit_log")).toEqual([]);
  });

  it("the reports share one budget: a user's 21st in a minute is a 429 and writes nothing", async () => {
    for (let i = 0; i < 20; i++) expect((await call("POST", A, "owner", { entity_type: "auto_fix", action: `fix ${i}`, new_value: {} })).status).toBe(201);
    expect(await call("POST", A, "owner", { entity_type: "doctor", action: "one too many", new_value: {} }))
      .toEqual({ status: 429, body: { message: "too many revit reports in a minute — nothing was saved; try again shortly" } });
    expect(writes("audit_log")).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run bridge/write-roles.test.mjs`. Expect `12 failed`. On master `recordNote` checks the role before the type (`cde-store.mjs:1075`), so who posts decides the answer: the eight contributor reports answer 403 `a note on the ledger is a lead's (you are contributor) — nothing was saved`; the owner's budget test answers 400 `a signed-in caller writes notes only …`; the receipt test, the refusal test and the first assertion of the viewer test fail on those two answers too (and the machine credential's `build` row is stored as posted, unworded and unmarked).
- [ ] **Step 3: The types and the receipt rule.** In `WebApp/bridge/cde-store.mjs`, make two replacements. First, the list:

First, replace

```js
const REVIT_REPORT_TYPES = ["naming", "family_heal"];

/** A signed-in contributor or above reports a Revit-side batch (naming, family_heal): entity_type from the list above,
 *  the new_value at most 256 KB (413), budgeted (429), actor the verified identity whatever the body claims. */
```

with

```js
const REVIT_REPORT_TYPES = ["naming", "family_heal",
  // MA-1a item 7 (audit XC-5's modelling subset, blueprint P1-9): one row per run of a modelling command — per build,
  // per click, per save — with counts and the actor; never one row per element.
  "datum", "ghost_build", "massing", "annotate", "apply_standard", "auto_fix", "fix_in_place", "doctor",
  // MA-1a item 8: a reader's or planner's run receipt (buildRunRow words its action build:run and marks it claimed).
  "build"];

/** MA-1a item 8: a build row is the add-in's own receipt of a reader or planner run. Whoever posts it — a signed-in
 *  contributor or the machine credential — the bridge words the action (build:run) and marks the receipt claimed: no
 *  bridge-run job backs it (survey jobs are MA-4), so nothing in it is verified. A receipt that is not an object is a 400. */
function buildRunRow(b) {
  const receipt = b.new_value;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt))
    throw Object.assign(new Error("a build row's new_value is the receipt, an object — nothing was saved"), { status: 400 });
  return { ...b, entity_type: "build", action: "build:run", new_value: { ...receipt, claimed: true } };
}

/** A signed-in contributor or above reports a Revit-side batch (the types above): entity_type from the list,
 *  the new_value at most 256 KB (413), budgeted (429), actor the verified identity whatever the body claims. */
```

Second, replace

```js
  const role = await myRole(key);
  if (role === "service") return recordAudit(key, b);
  const type = String(b.entity_type ?? "note").trim().toLowerCase();
  if (REVIT_REPORT_TYPES.includes(type)) return recordRevitReport(key, role, type, b);
```

with

```js
  const role = await myRole(key);
  const type = String(b.entity_type ?? "note").trim().toLowerCase();
  // MA-1a item 8: a receipt is worded and marked by the bridge for every caller, the machine credential included; and
  // build: actions belong to receipts, so no other row can pass for one.
  if (type === "build") b = buildRunRow(b);
  else if (String(b.action ?? "").trim().toLowerCase().startsWith("build:"))
    throw Object.assign(new Error('build: rows are receipts (entity_type "build") — nothing was saved'), { status: 400 });
  if (role === "service") return recordAudit(key, b);
  if (REVIT_REPORT_TYPES.includes(type)) return recordRevitReport(key, role, type, b);
```

- [ ] **Step 4: The route's comment.** So the route says what it takes.

In `WebApp/bridge/bcf-service.mjs`, replace

```js
      //   Sentinel's own → 400 (cde-store.mjs recordAudit). The machine credential writes any other row (Revit's naming
      //   and family_heal); a signed-in caller a lead's note only — {action, new_value?}, entity_type "note" — 403 / 400 /
      //   413 / 429 before anything is written (H0 D11, cde-store.mjs recordNote).
```

with

```js
      //   Sentinel's own → 400 (cde-store.mjs recordAudit). The machine credential writes any other row; a signed-in
      //   contributor a Revit report (REVIT_REPORT_TYPES: naming, family_heal, the modelling commands' reports of MA-1a
      //   item 7, and item 8's build receipt, which the bridge words build:run and marks claimed for every caller); a
      //   signed-in lead also a note — {action, new_value?}, entity_type "note". 403 / 400 / 413 / 429 before anything
      //   is written (H0 D11, cde-store.mjs recordNote).
```

- [ ] **Step 5: Run.** From `WebApp`: `npx vitest run bridge/write-roles.test.mjs bridge/ledger-write.test.mjs`, expect no failure, with 12 more tests than master in `write-roles.test.mjs`.
- [ ] **Step 6: Commit.**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/write-roles.test.mjs
git commit -F - <<'EOF'
feat(bridge): the Revit report route takes the modelling commands' reports and the build:run receipt (MA-1a items 7, 8)

datum, ghost_build, massing, annotate, apply_standard, auto_fix, fix_in_place and doctor: one row per run, under the
route's limits (contributor, 256 KB, 20 per user a minute, the verified actor). A build row is a receipt: the bridge
words its action build:run and marks it claimed for every caller.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6 — The pure half of item 7: one report row per command, and the Doctor's one-minute buffer (offline)

**Files:**
- Create `tools/promote-check/Reports.cs`
- Modify `tools/promote-check/promote-check.csproj` and `tools/promote-check/Check.cs` (`Main`)
- Create `SentinelAddin/Coordination/CommandReports.cs`

**Interfaces** (`Sentinel.Coordination`, no Revit API):
- `CommandReports.Datum(levels, grids, notes, sourceSha256, actor)`, `.GhostBuild(drawing, level, placed, removedByRevit, wallGaps, typeGaps, skipped, revitWarnings, typesAdded, changesetIds, actor)`, `.Massing(placed, removedByRevit, wallGaps, skipped, revitWarnings, typesAdded, imagesSha256, actor)`, `.Annotate(created, skippedExisting, warnings, levels, guideline, actor)`, `.ApplyStandard(created, skipped, failed, actor)`, `.AutoFix(ruleId, category, oldName, newName, elementId, actor)`, `.FixInPlace(requirement, bcfGuid, applied, notWritten, actor)`, `.Doctor(tally, actor)` — each returns the `POST /cde/:key/audit` body `{entity_type, actor, action, new_value}` for one run.
- `CommandReports.MaxNames = 50`: a list in a row holds at most 50 entries beside its true total (`HealRecord`'s rule). An action is clipped to the route's 500 characters.
- `DoctorTally` — what the Doctor resolved in one window: `Resolved`, `ByWarning`, `ByTransaction`, `ElementIds` (first 50), `ElementIdsTotal`.
- `DoctorBuffer` — thread-safe, keyed by project key: `Add(projectKey, text, transaction, ids) → bool` (true when this is the first resolution since the last `Take`: the caller schedules one flush) and `Take(projectKey) → DoctorTally` (null when there is nothing). `DoctorBuffer.WindowSeconds = 60`.

A row carries counts, names of model things (a drawing's file name, a level, a rule id, a view's old and new name) and file hashes. It carries no file contents, no path and no person but the actor.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/Reports.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;

static partial class Check
{
    static JsonElement Json(object payload) => JsonDocument.Parse(JsonSerializer.Serialize(payload)).RootElement.Clone();

    // ── 16. MA-1a item 7: one report row per run of a modelling command, and the Doctor's buffer ────────────────
    static void ReportChecks()
    {
        Console.WriteLine("\nMA-1a item 7 — the modelling commands' report rows (CommandReports, DoctorBuffer)");
        const string sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        // The whole body, once: what POST /cde/:key/audit receives (GovernedNotify serializes it the same way).
        Ok(JsonSerializer.Serialize(CommandReports.Datum(2, 5, 1, sha, "lead@office.example")) ==
           "{\"entity_type\":\"datum\",\"actor\":\"lead@office.example\",\"action\":\"Datum from Drawings created 2 level(s) and 5 grid(s)\"," +
           "\"new_value\":{\"levels_created\":2,\"grids_created\":5,\"notes\":1,\"source_sha256\":\"" + sha + "\",\"source\":\"revit\"}}",
           "a Datum run is one datum row: the counts, the drawing's sha, source revit");
        Ok(Json(CommandReports.Datum(0, 3, 0, null, "a")).GetProperty("new_value").GetProperty("source_sha256").ValueKind == JsonValueKind.Null,
           "a Datum run that read imports already in the model names no file: source_sha256 null, never a made-up sha");

        var ids = Enumerable.Range(1, 60).Select(i => "cs-" + i.ToString("00")).ToList();
        var ghost = Json(CommandReports.GhostBuild("plan-L01.dxf", "GR-FFL", 41, 1, 2, 0, 3, 7, 1, ids, "a@b.example"));
        var gv = ghost.GetProperty("new_value");
        Ok(ghost.GetProperty("entity_type").GetString() == "ghost_build" && ghost.GetProperty("action").GetString() == "Ghost Builder placed 41 element(s) from plan-L01.dxf on GR-FFL",
           "a Ghost build is one ghost_build row, worded with its count, drawing and level");
        Ok(gv.GetProperty("placed").GetInt32() == 41 && gv.GetProperty("removed_by_revit").GetInt32() == 1 && gv.GetProperty("wall_gaps").GetInt32() == 2
           && gv.GetProperty("type_gaps").GetInt32() == 0 && gv.GetProperty("skipped").GetInt32() == 3 && gv.GetProperty("revit_warnings").GetInt32() == 7
           && gv.GetProperty("types_added").GetInt32() == 1, "…with every count the summary shows: placed, removed by Revit, gaps, skipped, warnings, types added");
        Ok(gv.GetProperty("changesets").GetArrayLength() == 50 && gv.GetProperty("changesets_total").GetInt32() == 60 && CommandReports.MaxNames == 50,
           "60 changesets → the first 50 ids beside the true total");

        var massing = Json(CommandReports.Massing(12, 0, 4, 0, 2, 0, null, "a"));
        Ok(massing.GetProperty("entity_type").GetString() == "massing" && massing.GetProperty("action").GetString() == "Photo Massing placed 12 element(s)"
           && massing.GetProperty("new_value").GetProperty("wall_gaps").GetInt32() == 4 && massing.GetProperty("new_value").GetProperty("images_sha256").ValueKind == JsonValueKind.Null,
           "a Massing build is one massing row; no image sha when the numbers are the reviewer's");

        var annotate = Json(CommandReports.Annotate(6, 2, 1, 3, "guideline@3 · office · 0123…", "a"));
        Ok(annotate.GetProperty("entity_type").GetString() == "annotate" && annotate.GetProperty("action").GetString() == "Annotate created 6 view(s) across 3 level(s)"
           && annotate.GetProperty("new_value").GetProperty("skipped_existing").GetInt32() == 2 && annotate.GetProperty("new_value").GetProperty("guideline").GetString() == "guideline@3 · office · 0123…",
           "an Annotate run is one annotate row, naming the guideline that planned the views");

        var many = Enumerable.Range(1, 55).Select(i => "Workset: W" + i).ToList();
        var std = Json(CommandReports.ApplyStandard(many, new[] { "Line style: Hidden" }, new string[0], "a"));
        Ok(std.GetProperty("entity_type").GetString() == "apply_standard" && std.GetProperty("action").GetString() == "Apply Standard: 55 created, 1 skipped, 0 failed"
           && std.GetProperty("new_value").GetProperty("created").GetArrayLength() == 50 && std.GetProperty("new_value").GetProperty("created_total").GetInt32() == 55
           && std.GetProperty("new_value").GetProperty("skipped").GetArrayLength() == 1 && std.GetProperty("new_value").GetProperty("failed_total").GetInt32() == 0,
           "an Apply Standard run is one apply_standard row: each outcome capped at 50 names beside its total");

        var fix = Json(CommandReports.AutoFix("VP-01", "Views", "Level 1", "FP_L01_GA", 4711, "a"));
        Ok(fix.GetProperty("entity_type").GetString() == "auto_fix" && fix.GetProperty("action").GetString() == "Auto-fix VP-01: 1 Views renamed"
           && fix.GetProperty("new_value").GetProperty("old_name").GetString() == "Level 1" && fix.GetProperty("new_value").GetProperty("new_name").GetString() == "FP_L01_GA"
           && fix.GetProperty("new_value").GetProperty("element_id").GetInt64() == 4711, "one click of Fix is one auto_fix row: the rule, the old and the new name, the element");

        var inPlace = Json(CommandReports.FixInPlace("Pset_WallCommon.FireRating", "bcf-guid-1", 3, 1, "a"));
        Ok(inPlace.GetProperty("entity_type").GetString() == "fix_in_place" && inPlace.GetProperty("action").GetString() == "Fix-in-place Pset_WallCommon.FireRating: 3 value(s) written, 1 not written"
           && inPlace.GetProperty("new_value").GetProperty("bcf_guid").GetString() == "bcf-guid-1" && inPlace.GetProperty("new_value").GetProperty("applied").GetInt32() == 3
           && inPlace.GetProperty("new_value").GetProperty("not_written").GetInt32() == 1, "one fix-in-place Apply is one fix_in_place row: written and not written, the issue it answers");

        Ok(Json(CommandReports.GhostBuild(new string('d', 600), "L", 1, 0, 0, 0, 0, 0, 0, new string[0], "a")).GetProperty("action").GetString().Length == 500,
           "an action is clipped to the route's 500 characters");
        foreach (var row in new[] { ghost, massing, annotate, std, fix, inPlace })
            Ok(row.GetProperty("new_value").GetProperty("source").GetString() == "revit" && row.GetProperty("actor").GetString().Length > 0,
               row.GetProperty("entity_type").GetString() + ": names its actor and source revit");

        // The Doctor: resolutions gathered for one minute become one row.
        var buffer = new DoctorBuffer();
        Ok(buffer.Take("demo") == null, "nothing resolved: nothing to report");
        Ok(buffer.Add("demo", "Line is slightly off axis", "Wall", new long[] { 10, 11 }), "the first resolution of a window asks for one flush");
        Ok(!buffer.Add("demo", "Line is slightly off axis", "Wall", new long[] { 11, 12 }) && !buffer.Add("demo", "Line is slightly off axis", "Model Lines", new long[] { 13 }),
           "later ones in the same window join it — no second flush");
        Ok(buffer.Add("other", "Line is slightly off axis", "Wall", new long[] { 1 }), "another project has its own window");
        var tally = buffer.Take("demo");
        Ok(tally.Resolved == 3 && tally.ByWarning["Line is slightly off axis"] == 3 && tally.ByTransaction["Wall"] == 2 && tally.ByTransaction["Model Lines"] == 1
           && tally.ElementIdsTotal == 4 && tally.ElementIds.SequenceEqual(new long[] { 10, 11, 12, 13 }),
           "the window's tally: 3 resolutions, by warning and by transaction, 4 distinct elements");
        Ok(buffer.Take("demo") == null && buffer.Add("demo", "x", "y", null), "taking empties the window: the next resolution starts a new one");
        var doctor = Json(CommandReports.Doctor(tally, "a"));
        var dv = doctor.GetProperty("new_value");
        Ok(doctor.GetProperty("entity_type").GetString() == "doctor" && doctor.GetProperty("action").GetString() == "Doctor: 3 warning(s) resolved with Revit's own fix in 2 kind(s) of transaction"
           && dv.GetProperty("resolved").GetInt32() == 3 && dv.GetProperty("warnings")[0].GetProperty("text").GetString() == "Line is slightly off axis"
           && dv.GetProperty("warnings")[0].GetProperty("count").GetInt32() == 3 && dv.GetProperty("transactions").GetArrayLength() == 2
           && dv.GetProperty("element_ids").GetArrayLength() == 4 && dv.GetProperty("element_ids_total").GetInt32() == 4
           && dv.GetProperty("window_seconds").GetInt32() == 60 && DoctorBuffer.WindowSeconds == 60,
           "a window is one doctor row: the count, by warning, by transaction, the elements, the window's length");
        var wide = new DoctorBuffer();
        wide.Add("demo", "w", "t", Enumerable.Range(1, 70).Select(i => (long)i));
        var wideRow = Json(CommandReports.Doctor(wide.Take("demo"), "a")).GetProperty("new_value");
        Ok(wideRow.GetProperty("element_ids").GetArrayLength() == 50 && wideRow.GetProperty("element_ids_total").GetInt32() == 70, "70 elements → the first 50 ids beside the true total");
    }
}
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Engine\PlacementPolicy.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Engine\PlacementPolicy.cs" />
    <!-- MA-1a item 7: the modelling commands' report rows and the Doctor's one-minute buffer -->
    <Compile Include="..\..\SentinelAddin\Coordination\CommandReports.cs" />
```

In `tools/promote-check/Check.cs`, replace

```csharp
        PlacementWiringChecks();
```

with

```csharp
        PlacementWiringChecks();
        ReportChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`: expect the build failure `error CS2001: Source file '…\SentinelAddin\Coordination\CommandReports.cs' could not be found`.
- [ ] **Step 3: The rows and the buffer.**

Create `SentinelAddin/Coordination/CommandReports.cs`:

```csharp
#nullable disable
// MA-1a item 7 (audit XC-5's modelling subset, blueprint P1-9): the one ledger row each modelling command reports for a
// run — Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, auto-fix, fix-in-place and the Doctor. Pure — no
// Revit API, no HTTP — so tools/promote-check pins every body. Each is a POST /cde/:key/audit body {entity_type, actor,
// action, new_value}; the bridge allows the types (cde-store.mjs REVIT_REPORT_TYPES) and stamps a signed-in caller's
// verified identity over `actor`. One row per run, click or window — never one per element: a list holds at most
// MaxNames entries beside its true total (HealRecord's rule). A row carries counts, names of model things and file
// hashes; no file contents, no path, and no person but the actor.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Coordination
{
    public static class CommandReports
    {
        /// <summary>Entries kept per list; the totals stay true.</summary>
        public const int MaxNames = 50;
        private const int MaxAction = 500; // the route's cap on an action (cde-store.mjs recordRevitReport)

        private static object Row(string type, string actor, string action, object value) => new
        {
            entity_type = type,
            actor,
            action = action.Length <= MaxAction ? action : action.Substring(0, MaxAction),
            new_value = value,
        };

        /// <summary>Datum from Drawings, after its transaction committed. <paramref name="sourceSha256"/> is the picked
        /// drawing's sha, null when the run read imports already in the model.</summary>
        public static object Datum(int levels, int grids, int notes, string sourceSha256, string actor) =>
            Row("datum", actor, $"Datum from Drawings created {levels} level(s) and {grids} grid(s)",
                new { levels_created = levels, grids_created = grids, notes, source_sha256 = sourceSha256, source = "revit" });

        /// <summary>One Ghost Builder build that was kept. <paramref name="skipped"/> is the elements skipped for no host,
        /// no geometry or a type not in the model; <paramref name="changesetIds"/> the changesets it filed.</summary>
        public static object GhostBuild(string drawing, string level, int placed, int removedByRevit, int wallGaps, int typeGaps, int skipped,
                                        int revitWarnings, int typesAdded, IReadOnlyList<string> changesetIds, string actor) =>
            Row("ghost_build", actor, $"Ghost Builder placed {placed} element(s) from {drawing} on {level}", new
            {
                drawing, level, placed, removed_by_revit = removedByRevit, wall_gaps = wallGaps, type_gaps = typeGaps, skipped,
                revit_warnings = revitWarnings, types_added = typesAdded,
                changesets = changesetIds.Take(MaxNames).ToArray(), changesets_total = changesetIds.Count, source = "revit",
            });

        /// <summary>One Photo Massing build that was kept. <paramref name="imagesSha256"/> is null when the build holds no
        /// number of the vision model's.</summary>
        public static object Massing(int placed, int removedByRevit, int wallGaps, int skipped, int revitWarnings, int typesAdded,
                                     string imagesSha256, string actor) =>
            Row("massing", actor, $"Photo Massing placed {placed} element(s)", new
            {
                placed, removed_by_revit = removedByRevit, wall_gaps = wallGaps, skipped, revit_warnings = revitWarnings,
                types_added = typesAdded, images_sha256 = imagesSha256, source = "revit",
            });

        public static object Annotate(int created, int skippedExisting, int warnings, int levels, string guideline, string actor) =>
            Row("annotate", actor, $"Annotate created {created} view(s) across {levels} level(s)",
                new { views_created = created, skipped_existing = skippedExisting, warnings, levels, guideline, source = "revit" });

        /// <summary>Apply Standard's model half (its ruleset install writes its own artefact row).</summary>
        public static object ApplyStandard(IReadOnlyList<string> created, IReadOnlyList<string> skipped, IReadOnlyList<string> failed, string actor) =>
            Row("apply_standard", actor, $"Apply Standard: {created.Count} created, {skipped.Count} skipped, {failed.Count} failed", new
            {
                created = created.Take(MaxNames).ToArray(), skipped = skipped.Take(MaxNames).ToArray(), failed = failed.Take(MaxNames).ToArray(),
                created_total = created.Count, skipped_total = skipped.Count, failed_total = failed.Count, source = "revit",
            });

        /// <summary>One click of Fix that Revit committed.</summary>
        public static object AutoFix(string ruleId, string category, string oldName, string newName, long elementId, string actor) =>
            Row("auto_fix", actor, $"Auto-fix {ruleId}: 1 {category} renamed",
                new { rule = ruleId, category, old_name = oldName, new_name = newName, element_id = elementId, source = "revit" });

        /// <summary>One fix-in-place Apply whose transaction committed.</summary>
        public static object FixInPlace(string requirement, string bcfGuid, int applied, int notWritten, string actor) =>
            Row("fix_in_place", actor, $"Fix-in-place {requirement}: {applied} value(s) written, {notWritten} not written",
                new { requirement, bcf_guid = bcfGuid, applied, not_written = notWritten, source = "revit" });

        /// <summary>What the Doctor resolved in one window (DoctorBuffer), with Revit's own fix, in committed transactions.</summary>
        public static object Doctor(DoctorTally tally, string actor) =>
            Row("doctor", actor, $"Doctor: {tally.Resolved} warning(s) resolved with Revit's own fix in {tally.ByTransaction.Count} kind(s) of transaction", new
            {
                resolved = tally.Resolved,
                warnings = tally.ByWarning.OrderByDescending(kv => kv.Value).Take(MaxNames).Select(kv => new { text = kv.Key, count = kv.Value }).ToArray(),
                transactions = tally.ByTransaction.OrderByDescending(kv => kv.Value).Take(MaxNames).Select(kv => new { name = kv.Key, count = kv.Value }).ToArray(),
                element_ids = tally.ElementIds.ToArray(), element_ids_total = tally.ElementIdsTotal,
                window_seconds = DoctorBuffer.WindowSeconds, source = "revit",
            });
    }

    /// <summary>What the Doctor resolved for one project in one window.</summary>
    public sealed class DoctorTally
    {
        public int Resolved;
        public readonly Dictionary<string, int> ByWarning = new Dictionary<string, int>(StringComparer.Ordinal);
        public readonly Dictionary<string, int> ByTransaction = new Dictionary<string, int>(StringComparer.Ordinal);
        /// <summary>The first <see cref="CommandReports.MaxNames"/> distinct element ids, in the order seen.</summary>
        public readonly List<long> ElementIds = new List<long>();
        public int ElementIdsTotal => _ids.Count;
        private readonly HashSet<long> _ids = new HashSet<long>();

        internal void Add(string text, string transaction, IEnumerable<long> ids)
        {
            Resolved++;
            text = string.IsNullOrWhiteSpace(text) ? "Revit warning" : text.Trim();
            transaction = string.IsNullOrWhiteSpace(transaction) ? "(unnamed)" : transaction.Trim();
            ByWarning[text] = (ByWarning.TryGetValue(text, out int w) ? w : 0) + 1;
            ByTransaction[transaction] = (ByTransaction.TryGetValue(transaction, out int t) ? t : 0) + 1;
            foreach (long id in ids ?? new long[0])
                if (_ids.Add(id) && ElementIds.Count < CommandReports.MaxNames) ElementIds.Add(id);
        }
    }

    /// <summary>The Doctor's resolutions, gathered per project until they are taken: a busy minute of drafting is one row,
    /// not one per transaction, so the Doctor stays inside the report budget (20 per user a minute). Thread-safe: the API
    /// thread adds, the flush task takes.
    /// ponytail: a window still open when Revit closes is lost — the Doctor's row is missing, never wrong.</summary>
    public sealed class DoctorBuffer
    {
        public const int WindowSeconds = 60;
        private readonly object _gate = new object();
        private readonly Dictionary<string, DoctorTally> _open = new Dictionary<string, DoctorTally>(StringComparer.Ordinal);

        /// <summary>Count one resolution. True when it opens the project's window: the caller schedules one flush,
        /// <see cref="WindowSeconds"/> from now.</summary>
        public bool Add(string projectKey, string text, string transaction, IEnumerable<long> ids)
        {
            lock (_gate)
            {
                bool opens = !_open.TryGetValue(projectKey, out var tally);
                if (opens) _open[projectKey] = tally = new DoctorTally();
                tally.Add(text, transaction, ids);
                return opens;
            }
        }

        /// <summary>The project's window, closed; null when there is none.</summary>
        public DoctorTally Take(string projectKey)
        {
            lock (_gate)
            {
                if (!_open.TryGetValue(projectKey, out var tally)) return null;
                _open.Remove(projectKey);
                return tally;
            }
        }
    }
}
```

- [ ] **Step 4: Run.** `dotnet run --project tools/promote-check`: expect `331/331 checks pass` (25 new). Both builds `0 Error(s)`.
- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Reports.cs tools/promote-check/promote-check.csproj tools/promote-check/Check.cs SentinelAddin/Coordination/CommandReports.cs
git commit -F - <<'EOF'
feat(engine): one report row per run of a modelling command, and the Doctor's one-minute buffer (MA-1a item 7)

CommandReports (pure): the audit bodies for Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, auto-fix,
fix-in-place and the Doctor — counts and actor, lists capped at 50 beside their totals. DoctorBuffer gathers the
Doctor's resolutions per project for 60 s, so a busy minute is one row. promote-check 331/331.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7 — One report call in each of the eight commands (item 7)

**Files:**
- Modify `tools/promote-check/Reports.cs` and `tools/promote-check/Check.cs` (the wiring check, a source scan)
- Modify `SentinelAddin/Coordination/GovernedNotify.cs` (`Report`)
- Modify `SentinelAddin/GhostBuilder/DatumBuilder.cs` and `SentinelAddin/Commands.Datum.cs` (Datum; the commit is now checked)
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (Ghost Builder)
- Modify `SentinelAddin/Commands.Massing.cs` and `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (Photo Massing; a comment in the second)
- Modify `SentinelAddin/Commands.Annotate.cs` (Annotate; the commit is now checked)
- Modify `SentinelAddin/Commands.Standards.cs`, `SentinelAddin/Standards/StandardsBuilder.cs` and `SentinelAddin/Engine/SentinelUndo.cs` (Apply Standard's model half; a step counts as created only what Revit committed and kept — review amendment C9)
- Modify `SentinelAddin/Workflow/AutoFixExecution.cs` (auto-fix)
- Modify `SentinelAddin/Commands.BcfIssues.cs` (fix-in-place Apply)
- Modify `SentinelAddin/Updaters/FailureInterceptor.cs` and `SentinelAddin/Updaters/DoctorPolicy.cs` (the Doctor; a resolution carries its project — C23)
- Modify `SentinelAddin/Engine/ProvenanceStamp.cs` (the reader's words for a Datum or Massing element, and a comment)

**Interfaces:** `GovernedNotify.Report(string what, object payload, string projectKey, Dispatcher ui = null)` — returns at once. `ui` is the pane's dispatcher, given only by a caller that is not on Revit's API thread (the Doctor's flush). The POST runs on a pool thread (`Event`, 6 s cap); when it answers, one line goes to the pane's Doctor log through `BeginInvoke`: `<what> — Recorded: ledger #N · receipt …`, `<what> — Not recorded — <why>`, `<what> — Not confirmed — <why>`. A 413 or a 429 reads `Not recorded — HTTP 429: …`: the report route refuses both before it writes (review amendment C22). An unbound model sends nothing and logs `<what> — Not recorded on the web: This model is not bound …`. It never throws, never waits and never shows a dialog, so no command is blocked or delayed by the ledger.

When each command reports (never for something that did not happen):

| Command | Reports when | Row |
|---|---|---|
| Datum from Drawings | its transaction committed and it created at least one level or grid | `datum` |
| Ghost Builder | the build was kept (its Undo group assimilated) and at least one element is still in the model | `ghost_build`, beside its changesets' own rows |
| Photo Massing | the build committed and placed at least one element | `massing` |
| Annotate | its transaction committed and it created at least one view | `annotate` |
| Apply Standard | Revit kept the build's Undo group, and at least one model thing was created in a step Revit committed. The line "Ruleset: installing …" is not a creation and is not counted | `apply_standard` (the ruleset install keeps its own artefact row) |
| ⚡ Fix (auto-fix) | Revit committed the rename; one row per click | `auto_fix` |
| Fix-in-place Apply | at least one value was written; one row per Apply | `fix_in_place` |
| Doctor | Revit's own fix resolved a warning in a committed transaction; one row per project per minute (`DoctorBuffer`) | `doctor` |

A run that changed nothing, was rolled back or was refused writes no row. An Undo after the report is not tracked: the row says what was done (only changesets have `changeset_reverted`).

Three honesty fixes ride along, because a report must not claim a commit it did not see:
- Datum and Annotate checked no commit status and said "Created N" either way. Both now say `Nothing was created — Revit did not commit the transaction` and report nothing.
- Apply Standard added to its "created" list before each step's commit, checked no commit status, ignored the status of its Undo group, and counted the line "Ruleset: installing …" as a creation (review amendment C9). Now a step's lines count as created only when Revit committed the step; `SentinelUndo.Run` answers false when Revit did not keep the group; and the report is built from the model's creations only.

- [ ] **Step 1: The failing check.**

In `tools/promote-check/Reports.cs`, replace

```csharp
        Ok(wideRow.GetProperty("element_ids").GetArrayLength() == 50 && wideRow.GetProperty("element_ids_total").GetInt32() == 70, "70 elements → the first 50 ids beside the true total");
    }
}
```

with

```csharp
        Ok(wideRow.GetProperty("element_ids").GetArrayLength() == 50 && wideRow.GetProperty("element_ids_total").GetInt32() == 70, "70 elements → the first 50 ids beside the true total");
    }

    // ── 17. MA-1a item 7: each of the eight commands reports once, off the API thread (a source scan) ──────────────
    static void ReportWiringChecks()
    {
        Console.WriteLine("\nMA-1a item 7 — one report call in each command, never on the API thread (source scan)");
        string notify = Src("Coordination", "GovernedNotify.cs");
        int at = notify.IndexOf("public static void Report(string what, object payload, string projectKey, System.Windows.Threading.Dispatcher? ui = null)", StringComparison.Ordinal);
        string body = at < 0 ? "" : notify.Substring(at, notify.IndexOf("\n        }", at, StringComparison.Ordinal) - at);
        Ok(at > 0 && body.Contains("Task.Run(() => Event(\"/audit\", payload, key))") && body.Contains(".BeginInvoke("),
           "GovernedNotify.Report posts on a pool thread and logs to the pane through BeginInvoke");
        Ok(at > 0 && !body.Contains("GetAwaiter") && !body.Contains(".Wait(") && !body.Contains(".Result;") && !body.Contains("TaskDialog"),
           "…and never waits for the bridge or shows a dialog: no command is blocked or delayed by the ledger");
        Ok(body.Contains("LedgerResult.NotBound()"), "an unbound model sends nothing and says so in the pane log");
        foreach (var (file, call) in new[]
        {
            (new[] { "Commands.Datum.cs" }, "GovernedNotify.Report(\"Datum from Drawings\", CommandReports.Datum("),
            (new[] { "GhostBuilder", "GhostChangesetBuild.cs" }, "GovernedNotify.Report(\"Ghost Builder\", CommandReports.GhostBuild("),
            (new[] { "Commands.Massing.cs" }, "GovernedNotify.Report(\"Photo Massing\", CommandReports.Massing("),
            (new[] { "Commands.Annotate.cs" }, "GovernedNotify.Report(\"Annotate\", CommandReports.Annotate("),
            (new[] { "Commands.Standards.cs" }, "GovernedNotify.Report(\"Apply Standard\", CommandReports.ApplyStandard("),
            (new[] { "Workflow", "AutoFixExecution.cs" }, "GovernedNotify.Report(\"Auto-fix \" + ruleId, Sentinel.Coordination.CommandReports.AutoFix("),
            (new[] { "Commands.BcfIssues.cs" }, "GovernedNotify.Report(\"Fix-in-place\", CommandReports.FixInPlace("),
            (new[] { "Updaters", "FailureInterceptor.cs" }, "GovernedNotify.Report(\"Doctor\", Sentinel.Coordination.CommandReports.Doctor("),
        })
        {
            string src = Src(file);
            int first = src.IndexOf(call, StringComparison.Ordinal);
            Ok(first > 0 && src.IndexOf(call, first + 1, StringComparison.Ordinal) < 0, file[file.Length - 1] + ": one report call");
        }
        Ok(Src("GhostBuilder", "DatumBuilder.cs").Contains("detected.Committed = t.Commit() == TransactionStatus.Committed;")
           && Src("Commands.Datum.cs").Contains("if (!result.Committed)"),
           "Datum reports only a transaction Revit committed, and says so when it did not");
        Ok(Src("Commands.Annotate.cs").Contains("if (t.Commit() != TransactionStatus.Committed)"), "Annotate reports only a transaction Revit committed, and says so when it did not");
        string doctor = Src("Updaters", "FailureInterceptor.cs");
        Ok(doctor.Contains("Reported.Add(key, p.Text, p.Tx, p.Ids)") && doctor.Contains("Task.Delay(TimeSpan.FromSeconds(Sentinel.Coordination.DoctorBuffer.WindowSeconds))")
           && doctor.Contains("Reported.Take(key)"),
           "the Doctor gathers a minute's resolutions per project and reports them as one row");

        // Review amendments C9, C19, C22, C23.
        Ok(body.Contains("\"HTTP 413\"") && body.Contains("\"HTTP 429\"") && body.Contains("LedgerResult.NotRecorded("),
           "a report the route refused before writing (413, 429) reads \"not recorded\" in the pane, never \"may have landed\"");
        string ghostBuild = Src("GhostBuilder", "GhostChangesetBuild.cs");
        int gate = ghostBuild.IndexOf("if (report.Placed > 0)", StringComparison.Ordinal);
        Ok(gate > 0 && ghostBuild.IndexOf("GovernedNotify.Report(\"Ghost Builder\"", StringComparison.Ordinal) > gate,
           "Ghost Builder reports only a build that left an element in the model");
        string applyStandard = Src("Commands.Standards.cs");
        Ok(Src("Engine", "SentinelUndo.cs").Contains("keep = g.Assimilate() == TransactionStatus.Committed")
           && applyStandard.Contains("kept = Sentinel.Engine.SentinelUndo.Run(") && applyStandard.Contains("if (kept && modelCreated.Count > 0)")
           && applyStandard.Contains("!c.StartsWith(\"Ruleset:\", StringComparison.Ordinal)"),
           "Apply Standard reports only a build Revit kept, and only its model creations — never the ruleset install's line");
        string standardsBuilder = Src("Standards", "StandardsBuilder.cs");
        Ok(standardsBuilder.Contains("private static void Committed(Transaction t, BuildReport r, int from)") && !standardsBuilder.Contains("t.Commit();"),
           "each Apply Standard step counts as created only what Revit committed");
        Ok(doctor.Contains("Project = ProjectContext.For(doc).Key") && doctor.Contains("p.Project == key"),
           "a Doctor resolution is reported only under the project of the model it happened in");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        ReportChecks();
```

with

```csharp
        ReportChecks();
        ReportWiringChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`: expect `331/350 checks pass` with 19 `FAIL` lines — no command reports yet.
- [ ] **Step 3: The one poster.**

In `SentinelAddin/Coordination/GovernedNotify.cs`, replace

```csharp
        /// <summary>Record a Naming Manager batch on the ledger: one row for the batch (the window continues on the
```

with

```csharp
        /// <summary>
        /// MA-1a item 7: one modelling command's report row (a <see cref="CommandReports"/> body), sent and forgotten.
        /// Returns at once: the POST runs on a pool thread (<see cref="Event"/>, 6 s cap), and when the ledger has answered
        /// one line goes to the pane's Doctor log — "&lt;what&gt; — Recorded: ledger #812 · receipt …", "… — Not recorded — …",
        /// "… — Not confirmed — …". An unbound model sends nothing and says so in the same log. Never throws, never
        /// waits, never shows a dialog: no command is blocked or delayed by the ledger, and no network call is made on
        /// Revit's API thread. Callers report only what Revit committed. <paramref name="ui"/> is the pane's dispatcher
        /// when the caller is not on Revit's API thread.
        /// </summary>
        public static void Report(string what, object payload, string projectKey, System.Windows.Threading.Dispatcher? ui = null)
        {
            // The pane's thread: the caller's own when it is Revit's API thread (every command), else the one it hands over
            // (the Doctor's flush runs on a pool thread, where there is no pane dispatcher to find).
            ui = ui ?? System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
            // Review amendment C22: the report route answers 413 and 429 before it writes (cde-store.mjs recordRevitReport),
            // so for this poster they are "not recorded". LedgerResult's own wording — "the entry may have landed" — stays
            // for the routes nobody has checked. A refused report is lost, not retried.
            LedgerResult Refused(LedgerResult r) =>
                r.State == LedgerState.NotConfirmed && (r.Reason.StartsWith("HTTP 413", StringComparison.Ordinal) || r.Reason.StartsWith("HTTP 429", StringComparison.Ordinal))
                    ? LedgerResult.NotRecorded(r.Reason.Replace(" (the entry may have landed)", "")) : r;
            void Say(LedgerResult ledger) => ui.BeginInvoke(new Action(() =>
            {
                try { Sentinel.App.PanelVm?.LogDoctor(what + " — " + LedgerLine.Sentence(Refused(ledger))); } catch { /* the pane is gone */ }
            }));
            string key = KeyOf(projectKey);
            if (key.Length == 0) { Say(LedgerResult.NotBound()); return; }
            Task.Run(() => Event("/audit", payload, key)).ContinueWith(t => Say(t.Status == TaskStatus.RanToCompletion
                ? t.Result
                : LedgerResult.NotConfirmed(t.Exception?.GetBaseException().Message ?? "the report did not finish")), TaskScheduler.Default);
        }

        /// <summary>Record a Naming Manager batch on the ledger: one row for the batch (the window continues on the
```

- [ ] **Step 4: Datum from Drawings.** In `SentinelAddin/GhostBuilder/DatumBuilder.cs`, make three replacements — the result says whether Revit committed:

First, replace

```csharp
            public int LevelsCreated, GridsCreated;
```

with

```csharp
            public int LevelsCreated, GridsCreated;
            /// <summary>MA-1a item 7: Revit committed Build's transaction — only then do the two counts hold.</summary>
            public bool Committed;
```

Second, replace

```csharp
                PlacementApply.Apply(placing, made);
                t.Commit();
```

with

```csharp
                PlacementApply.Apply(placing, made);
                detected.Committed = t.Commit() == TransactionStatus.Committed;
```

Third, replace

```csharp
                // MA-1a item 4: each level and grid it creates carries the full stamp — source dwg, no changeset, no ledger row
                // until item 7 — inside this transaction, so Ctrl+Z removes it with them.
```

with

```csharp
                // MA-1a item 4: each level and grid it creates carries the full stamp — source dwg, no changeset, no ledger row
                // of its own (item 7: the command reports the run as one datum row, after the commit) — inside this
                // transaction, so Ctrl+Z removes it with them.
```

Then in `SentinelAddin/Commands.Datum.cs`, make two replacements:

In `SentinelAddin/Commands.Datum.cs`, replace

```csharp
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
```

with

```csharp
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
```

Then replace (the dialog that says what was created)

```csharp
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
```

with

```csharp
        if (!result.Committed)
        {
            TaskDialog.Show("Sentinel — Datum", "Nothing was created — Revit did not commit the transaction (an element it needs may be owned by another user). The model is as it was.");
            return Result.Failed;
        }
        // MA-1a item 7: one datum row for the run, sent off this thread; the pane's log says what the ledger answered.
        if (result.LevelsCreated + result.GridsCreated > 0)
            GovernedNotify.Report("Datum from Drawings", CommandReports.Datum(result.LevelsCreated, result.GridsCreated,
                result.Warnings.Distinct().Count(), result.SourceSha256, UserSession.Actor), key);
        TaskDialog.Show("Sentinel — Datum",
            $"Created {result.LevelsCreated} level(s) and {result.GridsCreated} grid(s), each stamped with where it came from (Model from Drawings ▸ 5 · Provenance reads it)." +
```

- [ ] **Step 5: Ghost Builder.** The build's own row, beside its changesets' rows; an unbound build sends nothing and the pane log says so. In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace



```csharp
                if (idsRejected > 0)
                    report.Warnings.Insert(0, $"IDS: {idsRejected} element(s) did not pass the project's IDS — built as reviewed in Ghost's review (founder decision F2); each verdict is on its changeset.");
                return report;
```

with

```csharp
                if (idsRejected > 0)
                    report.Warnings.Insert(0, $"IDS: {idsRejected} element(s) did not pass the project's IDS — built as reviewed in Ghost's review (founder decision F2); each verdict is on its changeset.");
                // MA-1a item 7: one ghost_build row for the build that was kept — the counts of the summary — sent off this
                // thread; the pane's log says what the ledger answered. Only when an element is still in the model (review
                // amendment C19): a build whose every element Revit removed at commit is not an action to report.
                if (report.Placed > 0)
                    GovernedNotify.Report("Ghost Builder", CommandReports.GhostBuild(r.Drawing, level.Name, report.Placed, report.DeletedByRevit.Count,
                        report.WallGaps, report.TypeGaps, report.SkippedNoHost + report.SkippedNoGeometry + report.SkippedUnknownFamily,
                        report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                return report;
```

- [ ] **Step 6: Photo Massing.** In `SentinelAddin/Commands.Massing.cs`, make four replacements. The stamp's sha is kept at command scope so the report names the same one:

First, replace

```csharp
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;
```

with

```csharp
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;
```

Second, replace

```csharp
        string templateLine = null;                             // the office-template check's line, for the summary
```

with

```csharp
        string templateLine = null;                             // the office-template check's line, for the summary
        string stampSha = null; // MA-1a item 7: the images' sha the build was stamped with (null: the numbers are the reviewer's)
```

Third, replace

```csharp
        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
```

with

```csharp
        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            // MA-1a item 7: one massing row for a build Revit committed, sent off this thread.
            if (error == null && report != null && report.RolledBack == null && report.NotFinished == null && report.Placed > 0)
                GovernedNotify.Report("Photo Massing", CommandReports.Massing(report.Placed, report.DeletedByRevit.Count, report.WallGaps,
                    report.SkippedUnknownFamily + report.SkippedNoGeometry, report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count,
                    stampSha, UserSession.Actor), key);
```

Fourth, replace

```csharp
                        placementEvent.SetRequest(orchestrator, elements, mapping, MassingPlanner.HasModelValue(corrected) ? imagesSha : null,
                                                  standards.Guideline.Placement); // MA-1a item 6
```

with

```csharp
                        stampSha = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;
                        placementEvent.SetRequest(orchestrator, elements, mapping, stampSha, standards.Guideline.Placement); // MA-1a item 6
```

And the comment the report makes stale: in `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`, replace

```csharp
                // MA-1a item 4: every element this build made carries the full stamp — source photo, no changeset, no ledger row until
                // item 7 — inside this transaction, so Ctrl+Z removes it with them. Its layers are the massing plan's own, not a drawing's.
```

with

```csharp
                // MA-1a item 4: every element this build made carries the full stamp — source photo, no changeset, no ledger row of
                // its own (item 7: the command reports the build as one massing row, after the commit) — inside this transaction,
                // so Ctrl+Z removes it with them. Its layers are the massing plan's own, not a drawing's.
```

- [ ] **Step 7: Annotate.** In `SentinelAddin/Commands.Annotate.cs`, make two replacements:

First, replace

```csharp
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
```

with

```csharp
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
```

Second, replace

```csharp
        t.Commit();

        var sb = new System.Text.StringBuilder();
```

with

```csharp
        if (t.Commit() != TransactionStatus.Committed)
        {
            TaskDialog.Show("Sentinel — Annotate", "Nothing was created — Revit did not commit the transaction (a view it needs may be owned by another user). The model is as it was.");
            return Result.Failed;
        }
        // MA-1a item 7: one annotate row for the run, sent off this thread; the pane's log says what the ledger answered.
        if (created > 0)
            GovernedNotify.Report("Annotate", CommandReports.Annotate(created, skippedExisting, warnings.Count, levels.Count, guidelineLabel, UserSession.Actor), key);

        var sb = new System.Text.StringBuilder();
```

- [ ] **Step 8: Apply Standard.** The model half; the ruleset install keeps its own artefact row. First the three honesty fixes of review amendment C9, then the report.

In `SentinelAddin/Engine/SentinelUndo.cs`, replace (`Run` answers whether Revit kept the group)

```csharp
        if (keep) g.Assimilate(); else RollBack(g, doc);
        return keep;
```

with

```csharp
        // MA-1a item 7 (review amendment C9): kept only when Revit assimilated the group — a caller that reports what the
        // action did must not report a group Revit did not keep.
        if (keep) keep = g.Assimilate() == TransactionStatus.Committed; else RollBack(g, doc);
        return keep;
```

In `SentinelAddin/Standards/StandardsBuilder.cs`, make six replacements: each of the four steps counts as created only what Revit committed. First (worksets), replace

```csharp
        using var t = new Transaction(doc, "Sentinel: Build worksets");
        t.Start();
```

with

```csharp
        using var t = new Transaction(doc, "Sentinel: Build worksets");
        t.Start();
        int from = r.Created.Count; // MA-1a item 7 (C9): this step's "created" lines hold only if Revit commits it
```

Second, replace

```csharp
            catch (Exception ex) { r.Failed.Add($"Workset '{w.Name}': {ex.Message}"); }
        }
        t.Commit();
    }
```

with

```csharp
            catch (Exception ex) { r.Failed.Add($"Workset '{w.Name}': {ex.Message}"); }
        }
        Committed(t, r, from);
    }

    /// MA-1a item 7 (review amendment C9): commit a step, and keep its "created" lines only when Revit committed it. When
    /// it did not, the lines the step added since <paramref name="from"/> move to Failed, each saying so — a report
    /// never claims a creation Revit did not commit.
    private static void Committed(Transaction t, BuildReport r, int from)
    {
        if (t.Commit() == TransactionStatus.Committed) return;
        foreach (var line in r.Created.Skip(from).ToList()) r.Failed.Add(line + ": Revit did not commit this step");
        r.Created.RemoveRange(from, r.Created.Count - from);
    }
```

Third (shared parameters), replace

```csharp
            using var t = new Transaction(doc, "Sentinel: Bind shared parameters");
            t.Start();
```

with

```csharp
            using var t = new Transaction(doc, "Sentinel: Bind shared parameters");
            t.Start();
            int from = r.Created.Count;
```

Fourth, replace

```csharp
                catch (Exception ex) { r.Failed.Add($"Param '{p.Name}': {ex.Message}"); }
            }
            t.Commit();
```

with

```csharp
                catch (Exception ex) { r.Failed.Add($"Param '{p.Name}': {ex.Message}"); }
            }
            Committed(t, r, from);
```

Fifth (view templates: the line is added after the commit, so a commit Revit refuses goes to the step's own `catch`), replace

```csharp
            t.Commit();
            r.Created.Add($"View templates: copied {copied.Count} from '{source.Title}'");
```

with

```csharp
            if (t.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit the copy");
            r.Created.Add($"View templates: copied {copied.Count} from '{source.Title}'");
```

Sixth (browser organization), replace

```csharp
            t.Commit();
            r.Created.Add($"Browser organization: copied {copied.Count} scheme(s) — activate via Project Browser ▸ right-click ▸ Browser Organization.");
```

with

```csharp
            if (t.Commit() != TransactionStatus.Committed) throw new InvalidOperationException("Revit did not commit the copy");
            r.Created.Add($"Browser organization: copied {copied.Count} scheme(s) — activate via Project Browser ▸ right-click ▸ Browser Organization.");
```

Then in `SentinelAddin/Commands.Standards.cs`, make two replacements. First, the build knows whether Revit kept it: replace

```csharp
        // XC-2: the whole build is one Undo entry; a throw rolls every step back.
        try
        {
            BuildReport built = new BuildReport();
            Sentinel.Engine.SentinelUndo.Run(doc, "Apply standard", () => { built = StandardsBuilder.Build(app, doc, pack); return true; });
            report = built;
```

with

```csharp
        // XC-2: the whole build is one Undo entry; a throw rolls every step back.
        bool kept = false; // MA-1a item 7 (review amendment C9): Revit kept the build's Undo group — only then is it reported
        try
        {
            BuildReport built = new BuildReport();
            kept = Sentinel.Engine.SentinelUndo.Run(doc, "Apply standard", () => { built = StandardsBuilder.Build(app, doc, pack); return true; });
            report = built;
            if (!kept)
            {
                // Revit did not keep the group: nothing of this build is in the model, and the dialog says so.
                report.Failed.AddRange(report.Created.Select(c => c + ": Revit did not keep the build's Undo group"));
                report.Created.Clear();
            }
```

Second, replace

```csharp
        Built?.Invoke(report); // ShowReport is a Dispatcher.Invoke: the model report is on screen when this returns
```

with

```csharp
        Built?.Invoke(report); // ShowReport is a Dispatcher.Invoke: the model report is on screen when this returns
        // MA-1a item 7: one apply_standard row for a build Revit kept that created something in the model, sent off this
        // thread. The model's creations only (review amendment C9): "Ruleset: installing …" is the bridge install's line —
        // nothing in the model — and that install writes its own artefact row.
        var modelCreated = report.Created.Where(c => !c.StartsWith("Ruleset:", StringComparison.Ordinal)).ToList();
        if (kept && modelCreated.Count > 0)
            GovernedNotify.Report("Apply Standard", CommandReports.ApplyStandard(modelCreated, report.Skipped, report.Failed, UserSession.Actor),
                                  Sentinel.Engine.ProjectContext.For(doc).Key);
```

- [ ] **Step 9: Auto-fix.** One row per click that Revit committed. In `SentinelAddin/Workflow/AutoFixExecution.cs`, replace



```csharp
                // "✓" only when Revit really committed the rename (it can roll back, e.g. an element another user owns).
                onDone?.Invoke(oldName, t.Commit() == TransactionStatus.Committed ? candidate : null);
```

with

```csharp
                // "✓" only when Revit really committed the rename (it can roll back, e.g. an element another user owns).
                string category = element.Category?.Name ?? element.GetType().Name;
                bool committed = t.Commit() == TransactionStatus.Committed;
                // MA-1a item 7 (P1-9): one auto_fix row for the committed rename, sent off this thread.
                if (committed)
                    Sentinel.Coordination.GovernedNotify.Report("Auto-fix " + ruleId, Sentinel.Coordination.CommandReports.AutoFix(
                        ruleId, category, oldName, candidate, elementId, Sentinel.Coordination.UserSession.Actor), ProjectContext.For(doc).Key);
                onDone?.Invoke(oldName, committed ? candidate : null);
```

- [ ] **Step 10: Fix-in-place.** One row per Apply that wrote at least one value (`FixInPlaceService.Apply` counts a row only when its transaction committed). In `SentinelAddin/Commands.BcfIssues.cs`, replace



```csharp
                        var done = outcomes.Count(o => o.Ok);
                        if (done > 0) applied = true;
```

with

```csharp
                        var done = outcomes.Count(o => o.Ok);
                        if (done > 0) applied = true;
                        // MA-1a item 7 (P1-9): one fix_in_place row for the Apply, sent off this thread. The re-check below
                        // files its own referee row.
                        if (done > 0)
                            GovernedNotify.Report("Fix-in-place", CommandReports.FixInPlace(req.Requirement, topic.Guid, done, outcomes.Count - done, UserSession.Actor), projectKey);
```

- [ ] **Step 11: The Doctor.** Only what Revit's own fix resolved in a committed transaction is reported — never a "Seen" line. The Doctor resolves only in a bound, opted-in document, so there is always a key. In `SentinelAddin/Updaters/DoctorPolicy.cs`, a resolution carries the project of the model it happened in (review amendment C23: `Pending` is one list for every open model, and a line of a rolled-back transaction can outlive it — a row must never report model A's resolution under model B's project). Replace

```csharp
            public string Tx, Key, Text;
```

with

```csharp
            public string Tx, Key, Text;
            /// <summary>MA-1a item 7: the project key of the model the failure was seen in ("" when not bound).</summary>
            public string Project;
```

In `SentinelAddin/Updaters/FailureInterceptor.cs`, make three replacements:

First, replace

```csharp
                Tx = tx, Text = failure.GetDescriptionText(), Ids = ids,
```

with

```csharp
                Tx = tx, Text = failure.GetDescriptionText(), Ids = ids,
                Project = ProjectContext.For(doc).Key, // MA-1a item 7: a resolution is reported under its own model's project only
```

Second, replace

```csharp
    private static readonly List<DoctorPolicy.Seen> Pending = new List<DoctorPolicy.Seen>();
```

with

```csharp
    private static readonly List<DoctorPolicy.Seen> Pending = new List<DoctorPolicy.Seen>();

    // MA-1a item 7 (P1-9): what Revit's own fix resolved, gathered per project for one minute and reported as one doctor row.
    private static readonly Sentinel.Coordination.DoctorBuffer Reported = new Sentinel.Coordination.DoctorBuffer();

    // API thread (DocumentChanged). The key and the actor are read here; the flush runs a minute later on a pool thread.
    private static void ReportResolved(Document doc, ICollection<string> committed)
    {
        string key = ProjectContext.For(doc).Key;
        // Only this model's own resolutions: Pending holds every open model's, and a transaction of the same name can
        // commit in another one.
        var resolved = Pending.Where(p => p.Resolved && p.Project == key && committed.Contains(p.Tx)).GroupBy(p => p.Tx + "|" + p.Key).Select(g => g.First()).ToList();
        if (resolved.Count == 0) return;
        string actor = Sentinel.Coordination.UserSession.Actor;
        var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher; // the pane's thread
        bool opens = false;
        foreach (var p in resolved) opens |= Reported.Add(key, p.Text, p.Tx, p.Ids);
        if (!opens) return; // a flush is already on its way for this project
        System.Threading.Tasks.Task.Delay(TimeSpan.FromSeconds(Sentinel.Coordination.DoctorBuffer.WindowSeconds)).ContinueWith(_ =>
        {
            if (Reported.Take(key) is { } tally)
                Sentinel.Coordination.GovernedNotify.Report("Doctor", Sentinel.Coordination.CommandReports.Doctor(tally, actor), key, ui);
        }, System.Threading.Tasks.TaskScheduler.Default);
    }
```

Third, replace

```csharp
            foreach (var (line, resolved) in DoctorPolicy.Lines(Pending, committed)) App.PanelVm?.LogDoctor(line, resolved);
```

with

```csharp
            foreach (var (line, resolved) in DoctorPolicy.Lines(Pending, committed)) App.PanelVm?.LogDoctor(line, resolved);
            ReportResolved(e.GetDocument(), committed);
```

- [ ] **Step 12: The reader's words.** A Datum or Massing element's stamp still names no ledger row (a row exists only after the commit, and a second transaction to write it back would be a second Undo entry — E5 of the items 3–5 plan). The reader says where a run is reported, without claiming a row exists: an element placed before item 7, in a model that is not bound, or whose report the ledger refused has none (review amendment C21). The words keep their opening, "none — not on a project ledger", which `StampV2Checks` pins. In `SentinelAddin/Engine/ProvenanceStamp.cs`, make two replacements:

First, replace

```csharp
"none — not on a project ledger (an unbound model's local changeset, Datum or Photo Massing)"
```

with

```csharp
"none — not on a project ledger row of its own (an unbound model's local changeset, Datum or Photo Massing; since MA-1a item 7 a bound run is reported as one datum or massing row — the pane's log said whether the ledger recorded it)"
```

Second, replace

```csharp
// null, no ledger row until item 7). layer and source_sha256 keep an earlier write's value when the latest writer has none
```

with

```csharp
// null, no ledger row of their own: item 7 reports each run as one row after its commit). layer and source_sha256 keep an earlier write's value when the latest writer has none
```

- [ ] **Step 13: Run.**
  - Both builds: `0 Error(s)`, warnings as on master.
  - `dotnet run --project tools/promote-check`: expect `350/350 checks pass` (19 new).
  - `ghost-p2-check` `103/103` (it compiles `DoctorPolicy.cs`, which gains one field), `heal-check` `9/9`, `event-check` `44/44`.
- [ ] **Step 14: Commit.**

```bash
git add SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/GhostBuilder/DatumBuilder.cs SentinelAddin/Commands.Datum.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/Commands.Massing.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/Commands.Annotate.cs SentinelAddin/Commands.Standards.cs SentinelAddin/Standards/StandardsBuilder.cs SentinelAddin/Engine/SentinelUndo.cs SentinelAddin/Workflow/AutoFixExecution.cs SentinelAddin/Commands.BcfIssues.cs SentinelAddin/Updaters/FailureInterceptor.cs SentinelAddin/Updaters/DoctorPolicy.cs SentinelAddin/Engine/ProvenanceStamp.cs tools/promote-check/Reports.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(ledger): Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, auto-fix, fix-in-place and the Doctor each report one ledger row per run (MA-1a item 7)

One call each to GovernedNotify.Report: sent off the API thread and never waited for; the pane's log says what the
ledger answered, or that the model is not bound. Only what Revit committed is reported — Datum and Annotate now check
their commit and say so when it failed; Apply Standard counts as created only what Revit committed and kept, and never
its ruleset install's line. The Doctor reports a minute's resolutions as one row, under its own model's project.
promote-check 350/350.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8 — The ROI dashboard counts auto-fix, fix-in-place and Doctor rows (item 7, P1-9's exit)

**Files:**
- Modify `tools/roi-check/Check.cs`
- Modify `SentinelAddin/Engine/RoiReport.cs` (`RoiCounts`, `RoiLines`)
- Modify `SentinelAddin/UI/RoiDashboard.cs` (`Read`)

**Interfaces:**
- `RoiCounts.AutoFixes` (the `auto_fix` rows: one per committed click), `.FixInPlaceValues` (the sum of `fix_in_place` rows' `new_value.applied`), `.DoctorResolutions` (the sum of `doctor` rows' `new_value.resolved`). A row's count is a whole number from 1 to 100,000; anything else adds nothing — the rows are a person's own report (any contributor can post one), and a forged 2,000,000,000 must not wrap the line (review amendment C24).
- `RoiCounts.WithFixes(autoFixRows, fixInPlaceRows, doctorRows, truncated) → RoiCounts` — adds the three counts to a `RoiCounts.From(…)`.
- `RoiLines.Lines` returns seven lines: the money line stays at index 4; index 5 is the new `Fixes on the ledger, not priced: …`; index 6 is `NotCounted`, which no longer lists auto-fix, doctor resolutions or fix-in-place.

The three counts are not priced: `roi@n` takes minutes for `delivery_gate`, `naming` and `family_heal` only (`ROI_KINDS`, `artefact-store.mjs`). Pricing them needs the office's minutes per fix and a new `roi@n` (founder decision F8, option B).

- [ ] **Step 1: The failing check.** In `tools/roi-check/Check.cs`, make five replacements. First, the pinned words:

First, replace

```csharp
    const string NotCounted = "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";
```

with

```csharp
    const string NotCounted = "Not counted: CDE intercepts, MEP voids, BCF export, clash views — they write no ledger row";
    // MA-1a item 7 (P1-9): the fixes that now write a ledger row are counted, on their own line, not priced.
    const string NoFixes = "Fixes on the ledger, not priced: 0 auto-fix(es) · 0 fix-in-place value(s) written · 0 Doctor resolution(s)";
    static readonly JsonElement[] AutoFixRows = Rows("[" +
        "{\"id\":840,\"entity_type\":\"auto_fix\",\"action\":\"Auto-fix VP-01: 1 Views renamed\",\"new_value\":{\"rule\":\"VP-01\",\"old_name\":\"Level 1\",\"new_name\":\"FP_L01\"}}," +
        "{\"id\":839,\"entity_type\":\"auto_fix\",\"action\":\"Auto-fix SH-01: 1 Sheets renamed\",\"new_value\":{\"rule\":\"SH-01\"}}" +
        "]");
    static readonly JsonElement[] FixInPlaceRows = Rows("[" +
        "{\"id\":850,\"entity_type\":\"fix_in_place\",\"action\":\"Fix-in-place FireRating: 3 value(s) written, 1 not written\",\"new_value\":{\"applied\":3,\"not_written\":1}}," +
        "{\"id\":849,\"entity_type\":\"fix_in_place\",\"action\":\"Fix-in-place LoadBearing: 4 value(s) written, 0 not written\",\"new_value\":{\"applied\":4,\"not_written\":0}}," +
        "{\"id\":848,\"entity_type\":\"fix_in_place\",\"action\":\"odd row\",\"new_value\":{\"applied\":\"2\"}}," +
        "{\"id\":847,\"entity_type\":\"fix_in_place\",\"action\":\"forged row\",\"new_value\":{\"applied\":2000000000}}" +
        "]");
    static readonly JsonElement[] DoctorRows = Rows("[" +
        "{\"id\":860,\"entity_type\":\"doctor\",\"action\":\"Doctor: 5 warning(s) resolved\",\"new_value\":{\"resolved\":5}}," +
        "{\"id\":859,\"entity_type\":\"doctor\",\"action\":\"odd row\",\"new_value\":null}" +
        "]");
```

Second, replace

```csharp
           "rows must be an array and healed_total a whole number ≥ 0: anything else adds nothing");
    }
```

with

```csharp
           "rows must be an array and healed_total a whole number ≥ 0: anything else adds nothing");

        // MA-1a item 7 (P1-9): the fixes that write a ledger row are counted from it.
        var f = RoiCounts.From(GateRows, NamingRows, HealRows, false).WithFixes(AutoFixRows, FixInPlaceRows, DoctorRows, false);
        Ok(f.AutoFixes == 2, "auto_fix: one row is one committed click");
        Ok(f.FixInPlaceValues == 7, "fix_in_place: applied summed; a row whose applied is not a whole number from 1 to 100,000 adds nothing — a forged 2,000,000,000 cannot wrap the line");
        Ok(f.DoctorResolutions == 5, "doctor: resolved summed; a row without new_value adds nothing");
        Ok(f.RowsRead == 20 && f.GateRuns == 3 && f.Renames == 5 && f.Heals == 7 && !f.Truncated, "the fix rows count as read (12 + 8); the first three counts are untouched");
        Ok(RoiCounts.From(NoRows, NoRows, NoRows, false).WithFixes(NoRows, NoRows, DoctorRows, true).Truncated, "a truncated fix kind is carried to the header");
    }
```

Third, replace

```csharp
        Ok(withMoney.Length == 6, "exactly six lines");
```

with

```csharp
        Ok(withMoney.Length == 7, "exactly seven lines");
```

Fourth, replace

```csharp
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4…\n" + NotCounted,
           "the six lines with roi@1 from the bridge");
```

with

```csharp
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4…\n" + NoFixes + "\n" + NotCounted,
           "the seven lines with roi@1 from the bridge");
        Is(RoiLines.Lines(Key, RoiCounts.From(GateRows, NamingRows, HealRows, false).WithFixes(AutoFixRows, FixInPlaceRows, DoctorRows, false), null, None)[5],
           "Fixes on the ledger, not priced: 2 auto-fix(es) · 7 fix-in-place value(s) written · 5 Doctor resolution(s)",
           "auto-fix, fix-in-place and Doctor rows are counted on their own line, never priced");
        Ok(!NotCounted.Contains("auto-fix") && !NotCounted.Contains("doctor") && !NotCounted.Contains("fix-in-place") && RoiLines.NotCounted == NotCounted,
           "the not-counted line lists none of them (P1-9)");
```

Fifth, replace

```csharp
           "Money: not shown — roi: none — not installed for aster-tower or its office\n" + NotCounted,
```

with

```csharp
           "Money: not shown — roi: none — not installed for aster-tower or its office\n" + NoFixes + "\n" + NotCounted,
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/roi-check`: expect a build failure, `error CS1061: 'RoiCounts' does not contain a definition for 'WithFixes'`.
- [ ] **Step 3: The counts and the lines.** In `SentinelAddin/Engine/RoiReport.cs`, make four replacements:

First, replace

```csharp
    /// <summary>Every row read, counted or not.</summary>
    public int RowsRead;
```

with

```csharp
    /// <summary>MA-1a item 7 (P1-9): auto_fix rows (one per committed click), the sum of fix_in_place rows' new_value.applied,
    /// and the sum of doctor rows' new_value.resolved. Counted, never priced (roi@n has no minutes for them).</summary>
    public int AutoFixes, FixInPlaceValues, DoctorResolutions;
    /// <summary>Every row read, counted or not.</summary>
    public int RowsRead;
```

Second, replace

```csharp
    // new_value.<name> of one audit row; Undefined when the row has no such field.
```

with

```csharp
    /// <summary>MA-1a item 7 (P1-9): add the fixes that write a ledger row — the same rule: only what the rows hold.</summary>
    public RoiCounts WithFixes(IEnumerable<JsonElement> autoFixRows, IEnumerable<JsonElement> fixInPlaceRows,
                               IEnumerable<JsonElement> doctorRows, bool truncated)
    {
        Truncated |= truncated;
        foreach (var r in autoFixRows) { RowsRead++; AutoFixes++; }
        foreach (var r in fixInPlaceRows) { RowsRead++; FixInPlaceValues += Whole(Value(r, "applied")); }
        foreach (var r in doctorRows) { RowsRead++; DoctorResolutions += Whole(Value(r, "resolved")); }
        return this;
    }

    // Review amendment C24: a row's count is a person's own report — a whole number from 1 to MaxPerRow, or nothing. No real
    // Apply or Doctor minute reaches the cap, and a forged row cannot wrap the sum.
    private const int MaxPerRow = 100000;
    private static int Whole(JsonElement v) => v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) && n > 0 && n <= MaxPerRow ? n : 0;

    // new_value.<name> of one audit row; Undefined when the row has no such field.
```

Third, replace

```csharp
        "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";

    /// <summary>Exactly six lines: the header (rows read, and whether the ledger holds more), the three counts (each
    /// priced when there is money and the roi sets minutes for it), the money line and <see cref="NotCounted"/>.</summary>
```

with

```csharp
        "Not counted: CDE intercepts, MEP voids, BCF export, clash views — they write no ledger row";

    /// <summary>Exactly seven lines: the header (rows read, and whether the ledger holds more), the three counts (each
    /// priced when there is money and the roi sets minutes for it), the money line, the fixes that write a ledger row
    /// since MA-1a item 7 (counted, not priced) and <see cref="NotCounted"/>.</summary>
```

Fourth, replace

```csharp
            : "Money: " + F2(m.Total) + " " + m.Currency + " at " + Num(m.HourlyRate) + " " + m.Currency + "/h · " + m.Label,
        NotCounted,
```

with

```csharp
            : "Money: " + F2(m.Total) + " " + m.Currency + " at " + Num(m.HourlyRate) + " " + m.Currency + "/h · " + m.Label,
        "Fixes on the ledger, not priced: " + c.AutoFixes + " auto-fix(es) · " + c.FixInPlaceValues + " fix-in-place value(s) written · " +
            c.DoctorResolutions + " Doctor resolution(s)",
        NotCounted,
```

- [ ] **Step 4: The dashboard reads the three kinds.** In `SentinelAddin/UI/RoiDashboard.cs`, replace



```csharp
        if (gate is null || naming is null || heal is null) return RoiLines.Unavailable(key, failure ?? "the bridge did not answer");
        var counts = RoiCounts.From(gate.Rows, naming.Rows, heal.Rows, gate.Truncated || naming.Truncated || heal.Truncated);
```

with

```csharp
        // MA-1a item 7 (P1-9): the fixes that write a ledger row — read the same way, counted, not priced.
        var autoFix = heal is null ? null : GovernedQuery.RoiRows(key, "auto_fix", out failure);
        var inPlace = autoFix is null ? null : GovernedQuery.RoiRows(key, "fix_in_place", out failure);
        var doctor = inPlace is null ? null : GovernedQuery.RoiRows(key, "doctor", out failure);
        if (gate is null || naming is null || heal is null || autoFix is null || inPlace is null || doctor is null)
            return RoiLines.Unavailable(key, failure ?? "the bridge did not answer");
        var counts = RoiCounts.From(gate.Rows, naming.Rows, heal.Rows, gate.Truncated || naming.Truncated || heal.Truncated)
            .WithFixes(autoFix.Rows, inPlace.Rows, doctor.Rows, autoFix.Truncated || inPlace.Truncated || doctor.Truncated);
```

- [ ] **Step 5: Run.** `dotnet run --project tools/roi-check`: expect `50/50 checks pass` (master `43`). Both builds `0 Error(s)`.
- [ ] **Step 6: Commit.**

```bash
git add tools/roi-check/Check.cs SentinelAddin/Engine/RoiReport.cs SentinelAddin/UI/RoiDashboard.cs
git commit -F - <<'EOF'
feat(roi): the ROI dashboard counts auto-fix, fix-in-place and Doctor rows from the ledger; its not-counted line no longer lists them (MA-1a item 7, P1-9)

A seventh line, "Fixes on the ledger, not priced": auto_fix rows, fix_in_place applied values and doctor resolutions,
read as the other kinds are. Not priced: roi@n has no minutes for them. roi-check 50/50.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9 — Bridge: contract 2's trust rules on `POST /changesets/:key` and on the MCP tool (item 8)

**Files:**
- Create `WebApp/bridge/fixtures/changeset-ops/contract2-trust.json` (one contract-2 post and what the bridge stores for it; Task 10's C# check reads the same file)
- Modify `WebApp/bridge/changesets-logic.test.mjs`, `WebApp/bridge/changesets-store.test.mjs`, `WebApp/bridge/mcp-server.test.mjs` (append)
- Modify `WebApp/bridge/changesets-logic.mjs` (constants, `validateChangeset`, a new `sourceOf`)
- Modify `WebApp/bridge/changesets-store.mjs` (`proposeChangeset`)
- Modify `WebApp/bridge/mcp-server.mjs` (the propose tool's description, schema and handler)

**Interfaces:**
- `TRUST_FIELDS = ["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"]` and `ADDIN_SOURCES = ["dwg", "promote"]`, exported from `changesets-logic.mjs`.
- `validateChangeset(body, { member })` returns, beside what it returns today (`member`: a signed-in member filed it — the store passes it; false when left out):
  - on every element `pretick` (a boolean the bridge decides) and `accuracy: { status: "not_measured" }`;
  - `claimed: true` — the source is the caller's claim: no bridge-run job backs a changeset until MA-4;
  - `ignored: [{ field, why }]` — every posted field the bridge did not keep, in the order met: a trust field (`why: "ignored: set by the bridge"`), a `measured` block or a `source.job_id` (no survey job backs it), and any other field the bridge does not read (`"ignored: not a field this bridge keeps"`). The same holds one level down (review amendment C3): a `place` is rebuilt from the names the add-in reads (`PlaceDto`), and every other key of `place`, `target`, `validate` — and a trust field or `measured` inside `validate.identity` — is listed as `elements[i].place.pretick` and so on, and not stored. At most 200 entries, then one entry counting the rest;
  - on an element, `cid` (one line, at most 256 characters) and `evidence` (at most 50 one-line texts) as sent: contract 2's reader id and evidence ids, kept as the caller's claim (review amendment C4; design `:735`);
  - `contract` only when the body sent one (1 or 2; anything else is a 400).
- `source` may be contract 2's object `{ reader, job_id }`: the stored `source` stays a string (the reader's name), because deployed add-ins read it into a string.
- The pre-tick rule, on the bridge: a `create` is never pre-ticked, whatever its source (an agent ghost and a drawing-only ghost are never pre-ticked); a `retype` or an `attach` is pre-ticked only as a single-answer Promote operation — source `promote`, a retype only with `target.type_before` — **and only when a signed-in member filed it** (review amendment C2, founder decision F14). `proposeChangeset` reads the caller's role (`myRole`): the machine credential (`service` — a signed-out PC, the MCP server, any script holding the token) is never pre-ticked, whatever its `source` says.
- `proposeChangeset` stores `claimed`, `ignored` (and `contract` when sent) on the changeset, so the 201 reply lists the ignored fields, and adds `claimed` and the ignored count to the `changeset_proposed` row.
- The MCP tool `sentinel_propose_changeset` says the rule in its description, forwards the `agent` block its schema already advertises, and never files as one of the add-in's sources: it sends a `source` it controls — the label when it is text and not `dwg` or `promote`, else `agent`. A `source` that is not text (contract 2's `{ reader }` object, a list) is never forwarded (review amendment C1).

Out of scope, and said in Next: `typing`, `confidence`, `lod`, `won`, `conflicts`, survey jobs and D19's bridge-side BLOCK mark. A posted one of them is listed under `ignored`, never invented. `measured` stays ignored until a survey job backs it (MA-4).

The design says contract 2's field changes are "listed in `contract-parity.test.mjs` next to the C# `ChangesetDto`" (`:674`). That file pins the delivery-gate contract only; the changeset contract's parity lives in `fixtures/changeset-ops/`, each file read by vitest and by `tools/promote-check`. This task adds one more there, so the stored shape of a contract-2 changeset is pinned on both sides by one file (review amendment C4).

- [ ] **Step 1: The failing tests.** One fixture and three appends. First, the shared fixture (review amendment C4): `posted` is what a contract-2 reader sends; `stored` is what the bridge keeps of it — every field the add-in's `ChangesetDto` reads, without the ids and the IDS verdict the bridge adds at filing.

Create `WebApp/bridge/fixtures/changeset-ops/contract2-trust.json`:

```json
{
  "posted": {
    "name": "Contract 2 — a surveyed wall and a retype",
    "contract": 2,
    "source": { "reader": "sentinel-survey 0.1", "job_id": "job-0042" },
    "elements": [
      { "kind": "wall", "cid": "scan-88", "evidence": ["ev-1", "ev-2"],
        "pretick": true, "accuracy": { "status": "within_tolerance" }, "measured": { "thickness_mm": 203 },
        "validate": { "identity": { "Class": "IfcWall", "Name": "W 1" } },
        "place": { "TypeName": "Generic - 200mm", "LevelName": "L1", "LocationCurve": { "start": [0, 0, 0], "end": [4000, 0, 0] }, "pretick": true } },
      { "kind": "wall", "op": "retype",
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "T1" },
        "validate": { "identity": { "Class": "IfcWall", "Name": "W 2" } },
        "place": { "TypeName": "T2" } }
    ]
  },
  "stored": {
    "name": "Contract 2 — a surveyed wall and a retype",
    "source": "sentinel-survey 0.1",
    "claimed": true,
    "contract": 2,
    "ignored": [
      { "field": "source.job_id", "why": "ignored: no survey job the bridge ran is named by it — the source is marked claimed" },
      { "field": "elements[0].pretick", "why": "ignored: set by the bridge" },
      { "field": "elements[0].accuracy", "why": "ignored: set by the bridge" },
      { "field": "elements[0].measured", "why": "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured" },
      { "field": "elements[0].place.pretick", "why": "ignored: set by the bridge" }
    ],
    "elements": [
      { "kind": "wall", "op": "create", "cid": "scan-88", "evidence": ["ev-1", "ev-2"],
        "pretick": false, "accuracy": { "status": "not_measured" },
        "place": { "TypeName": "Generic - 200mm", "LevelName": "L1", "LocationCurve": { "start": [0, 0, 0], "end": [4000, 0, 0] } } },
      { "kind": "wall", "op": "retype",
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": "T1" },
        "pretick": false, "accuracy": { "status": "not_measured" },
        "place": { "TypeName": "T2" } }
    ]
  }
}
```

Second, the validator's.

Append to `WebApp/bridge/changesets-logic.test.mjs`:

```js
// MA-1a item 8: contract 2's trust rules — the bridge, not the caller, sets the trust fields, and says what it ignored.
describe("validateChangeset — contract 2's trust rules (MA-1a item 8)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  const SET = "ignored: set by the bridge";
  const change = (op, place, target = { unique_id: UID }) => ({ op, kind: "wall", target, place, validate: { identity: { Class: "IfcWall", Name: "W 1" } } });

  it("the design's test: an agent post with pretick true and within_tolerance gives a ghost that is not pre-ticked and is not_measured", () => {
    const v = validateChangeset(CS([wall({ pretick: true, accuracy: { status: "within_tolerance" }, measured: { thickness_mm: 203 } })], { source: "agent", contract: 2 }));
    expect(v.elements[0].pretick).toBe(false);
    expect(v.elements[0].accuracy).toEqual({ status: "not_measured" });
    expect(v.elements[0]).not.toHaveProperty("measured");
    expect(v.claimed).toBe(true);
    expect(v.contract).toBe(2);
    expect(v.ignored).toEqual([
      { field: "elements[0].pretick", why: SET },
      { field: "elements[0].accuracy", why: SET },
      { field: "elements[0].measured", why: "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured" },
    ]);
  });

  it("each trust field is ignored and listed back, on the body and on an element", () => {
    const trust = { pretick: true, accuracy: { status: "within_tolerance" }, confidence: 0.99, typing: { by: "rule" }, claimed: false, proposal_guid: "mine" };
    const v = validateChangeset(CS([wall(trust)], trust));
    expect(v.ignored).toEqual([
      ...TRUST_FIELDS.map((f) => ({ field: f, why: SET })),
      ...TRUST_FIELDS.map((f) => ({ field: `elements[0].${f}`, why: SET })),
    ]);
    expect(v.claimed).toBe(true);
    expect(v.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(v.elements[0].proposal_guid).not.toBe("mine");
    for (const f of ["confidence", "typing", "claimed"]) expect(v.elements[0]).not.toHaveProperty(f);
  });

  it("a create is never pre-ticked, whatever its source; a Promote attach or a retype with the type the plan saw is — when a signed-in member filed it", () => {
    // Review amendment C2: the store passes { member: true } for a signed-in member; the machine credential earns no pre-tick.
    const MEMBER = { member: true };
    for (const source of ["agent", "dwg", "promote", "sentinel-survey 0.1"])
      expect(validateChangeset(CS([wall()], { source }), MEMBER).elements[0].pretick).toBe(false);
    const ops = [
      change("attach", { BaseLevel: "L1", TopLevel: "L2" }),
      change("retype", { TypeName: "T2" }, { unique_id: UID, type_before: "T1" }),
    ];
    expect(validateChangeset(CS(ops, { source: "promote" }), MEMBER).elements.map((e) => e.pretick)).toEqual([true, true]);
    expect(validateChangeset(CS(ops, { source: "promote" })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: { reader: " promote " } })).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS(ops, { source: "agent" }), MEMBER).elements.map((e) => e.pretick)).toEqual([false, false]);
    expect(validateChangeset(CS([change("retype", { TypeName: "T2" })], { source: "promote" }), MEMBER).elements[0].pretick).toBe(false);
  });

  it("contract 2's source object: the reader is the stored source, a job_id is ignored and listed — no survey job exists", () => {
    const v = validateChangeset(CS([wall()], { source: { reader: "sentinel-survey 0.1", job_id: "job-0042", host: "x" } }));
    expect(v.source).toBe("sentinel-survey 0.1");
    expect(v.claimed).toBe(true);
    expect(v.ignored).toEqual([
      { field: "source.job_id", why: "ignored: no survey job the bridge ran is named by it — the source is marked claimed" },
      { field: "source.host", why: "ignored: not a field this bridge keeps" },
    ]);
    expect(validateChangeset(CS([wall()], { source: { job_id: "job-1" } })).source).toBe("agent");
  });

  it("a field the bridge does not keep is listed, never dropped silently; a plain changeset has nothing ignored", () => {
    const v = validateChangeset(CS([wall({ lod: 300, won: true })], { conflicts: [] }));
    expect(v.ignored).toEqual([
      { field: "conflicts", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].lod", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].won", why: "ignored: not a field this bridge keeps" },
    ]);
    const plain = validateChangeset(CS([wall(), level()], { actor: "a", agent: { kind: "agent" }, exceptions: [] }));
    expect(plain.ignored).toEqual([]);
    expect(plain).not.toHaveProperty("contract");
  });

  it("contract is 1 or 2; the ignored list is capped at 200 entries and says how many more", () => {
    status400(() => validateChangeset(CS([wall()], { contract: 3 })), /contract must be 1 or 2/);
    status400(() => validateChangeset(CS([wall()], { contract: "2" })), /contract must be 1 or 2/);
    expect(validateChangeset(CS([wall()], { contract: 1 })).contract).toBe(1);
    const many = validateChangeset(CS(Array.from({ length: 120 }, () => wall({ pretick: true, confidence: 1 }))));
    expect(many.ignored).toHaveLength(201);
    expect(many.ignored[200]).toEqual({ field: "…", why: "40 more field(s) ignored the same way" });
  });

  it("contract 2's reader id and evidence ids are kept as sent — the caller's claim (review amendment C4)", () => {
    const v = validateChangeset(CS([wall({ cid: " scan-88 ", evidence: ["ev-1", " ev-2 "] }), wall()]));
    expect(v.elements[0]).toMatchObject({ cid: "scan-88", evidence: ["ev-1", "ev-2"] });
    expect(v.elements[1]).not.toHaveProperty("cid");
    expect(v.elements[1]).not.toHaveProperty("evidence");
    expect(v.ignored).toEqual([]);
    status400(() => validateChangeset(CS([wall({ cid: "x".repeat(257) })])), /cid must be one line of text of at most 256 characters/);
    status400(() => validateChangeset(CS([wall({ cid: "a\nb" })])), /cid must be one line of text/);
    status400(() => validateChangeset(CS([wall({ evidence: "ev-1" })])), /evidence must be a list of at most 50/);
    status400(() => validateChangeset(CS([wall({ evidence: Array.from({ length: 51 }, (_, i) => `ev-${i}`) })])), /evidence must be a list of at most 50/);
  });

  it("a trust field nested in place, target, validate or validate.identity is not stored, and is listed (review amendment C3)", () => {
    const NOT_MEASURED = "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured";
    const base = wall();
    const v = validateChangeset(CS([{
      ...base,
      place: { ...base.place, pretick: true, accuracy: { status: "within_tolerance" }, measured: { thickness_mm: 203 }, Colour: "red" },
      validate: { ...base.validate, measured: { thickness_mm: 203 }, identity: { ...base.validate.identity, pretick: true } },
    }]));
    expect(v.elements[0].place).toEqual(base.place);
    expect(v.elements[0].validate).not.toHaveProperty("measured");
    expect(v.elements[0].validate.identity).not.toHaveProperty("pretick");
    expect(v.elements[0].validate.identity).toMatchObject(base.validate.identity);
    expect(v.ignored).toEqual([
      { field: "elements[0].place.pretick", why: SET },
      { field: "elements[0].place.accuracy", why: SET },
      { field: "elements[0].place.measured", why: NOT_MEASURED },
      { field: "elements[0].place.Colour", why: "ignored: not a field this bridge keeps" },
      { field: "elements[0].validate.measured", why: NOT_MEASURED },
      { field: "elements[0].validate.identity.pretick", why: SET },
    ]);
    const t = validateChangeset(CS([change("retype", { TypeName: "T2" }, { unique_id: UID, type_before: "T1", pretick: true })], { source: "promote" }), { member: true });
    expect(t.elements[0].target).toEqual({ unique_id: UID, type_before: "T1" });
    expect(t.ignored).toEqual([{ field: "elements[0].target.pretick", why: SET }]);
  });

  it("the shared fixture: a contract-2 post is stored as the add-in reads it (tools/promote-check reads the same file)", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/contract2-trust.json", import.meta.url), "utf8"));
    const v = validateChangeset(fx.posted);
    expect(v).toMatchObject(fx.stored);
    expect(v.elements[0].place).not.toHaveProperty("pretick");
  });

  it("the add-in's sources are named, so the MCP tool can refuse to file as one", () => {
    expect(ADDIN_SOURCES).toEqual(["dwg", "promote"]);
    expect(TRUST_FIELDS).toEqual(["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"]);
  });
});
```

In the same file's import, replace

```js
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS,
```

with

```js
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS, TRUST_FIELDS, ADDIN_SOURCES,
```

Third, append to `WebApp/bridge/changesets-store.test.mjs`:

```js
// MA-1a item 8: the stored changeset — and so the 201 reply — carries the bridge's trust decisions and what it ignored.
describe("proposeChangeset — contract 2's trust rules (MA-1a item 8)", () => {
  it("an agent's pretick and accuracy are ignored: the reply lists them, the ghost is not pre-ticked and is not_measured", async () => {
    const deps = baseDeps();
    const posted = { name: "Agent walls", source: "agent", contract: 2, elements: [{ ...wall(), pretick: true, accuracy: { status: "within_tolerance" } }] };
    const cs = await proposeChangeset("demo", posted, "agent", deps);
    expect(cs.elements[0]).toMatchObject({ pretick: false, accuracy: { status: "not_measured" } });
    expect(cs.claimed).toBe(true);
    expect(cs.contract).toBe(2);
    expect(cs.ignored).toEqual([
      { field: "elements[0].pretick", why: "ignored: set by the bridge" },
      { field: "elements[0].accuracy", why: "ignored: set by the bridge" },
    ]);
    expect(deps.docInsert.mock.calls[0][3]).toMatchObject({ claimed: true, ignored: cs.ignored });
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ claimed: true, ignored: 2 });
  });

  it("a plain changeset is stored claimed, with nothing ignored and no contract field", async () => {
    const cs = await proposeChangeset("demo", BODY, "agent", baseDeps());
    expect(cs).toMatchObject({ claimed: true, ignored: [] });
    expect(cs).not.toHaveProperty("contract");
    expect(cs.elements.map((e) => e.pretick)).toEqual([false, false]);
  });

  it("a Promote attach is pre-ticked for a signed-in member's post — never for the machine credential (review amendment C2)", async () => {
    const body = { name: "Promote", source: "promote", elements: [{ op: "attach", kind: "wall", target: { unique_id: "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" },
      place: { BaseLevel: "L1", TopLevel: "L2" }, validate: { identity: { Class: "IfcWall", Name: "W 1" } } }] };
    const member = await proposeChangeset("demo", body, "lead@office.example", baseDeps({ myRole: async () => "contributor" }));
    expect(member.elements[0].pretick).toBe(true);
    const machine = await proposeChangeset("demo", body, "agent", baseDeps({ myRole: async () => "service" }));
    expect(machine.elements[0].pretick).toBe(false);
    expect(machine.claimed).toBe(true);
  });
});
```

Fourth, append to `WebApp/bridge/mcp-server.test.mjs`:

```js
// MA-1a item 8: the propose tool states the trust rule, forwards the claimed agent block, and never files as the add-in.
describe("sentinel_propose_changeset — contract 2's trust rules (MA-1a item 8)", () => {
  it("the description says what the bridge sets and what an agent's ghost is", () => {
    const t = TOOLS.find((x) => x.name === "sentinel_propose_changeset");
    expect(t.description).toMatch(/pretick, accuracy, confidence, typing, claimed and proposal_guid/);
    expect(t.description).toMatch(/ignored: set by the bridge/);
    expect(t.description).toMatch(/never pre-ticked/);
    expect(t.description).toMatch(/not_measured/);
    expect(t.inputSchema.properties.source.description).toMatch(/dwg and promote are the Revit add-in's/);
  });

  it("forwards the claimed agent block, and files as agent when the label is one of the add-in's sources", async () => {
    const sent = async (args) => {
      const fetch = vi.fn(async () => okJson({ id: "c1", status: "proposed" }));
      await callTool("sentinel_propose_changeset", { project: "demo", name: "N", elements: [{ kind: "level" }], ...args }, { fetch });
      return JSON.parse(fetch.mock.calls[0][1].body);
    };
    expect(await sent({ source: "my-agent", agent: { kind: "agent", model: "m" } })).toEqual({ name: "N", source: "my-agent", elements: [{ kind: "level" }], agent: { kind: "agent", model: "m" } });
    expect((await sent({ source: "promote" })).source).toBe("agent");
    expect((await sent({ source: " DWG " })).source).toBe("agent");
    // Review amendment C1: a source that is not text is never forwarded — the bridge reads contract 2's { reader } object,
    // and { reader: "promote" } would otherwise be stored as the source "promote".
    for (const source of [{ reader: "promote" }, { reader: " DWG " }, ["promote"], 7, null])
      expect((await sent({ source })).source).toBe("agent");
    expect(await sent({})).toEqual({ name: "N", source: "agent", elements: [{ kind: "level" }] });
  });
});
```

- [ ] **Step 2: Run them, and see them fail.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/mcp-server.test.mjs`. Expect `15 failed`: the ten validator tests (`v.ignored` is undefined, `pretick` is undefined, `contract: 3` does not throw, `cid` is not kept), the three store tests and the two MCP tests.
- [ ] **Step 3: The rules.** In `WebApp/bridge/changesets-logic.mjs`, make eight replacements. First, the names:

First, replace

```js
// Review amendment C1: no control character (a newline, a tab) in a provenance text — each is one line wherever it is shown.
const CONTROL_CHAR = /[\u0000-\u001f]/;
```

with

```js
// Review amendment C1: no control character (a newline, a tab) in a provenance text — each is one line wherever it is shown.
const CONTROL_CHAR = /[\u0000-\u001f]/;
// MA-1a item 8 (contract 2's trust rules): the fields the bridge sets itself. A posted one is ignored and listed back.
export const TRUST_FIELDS = ["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"];
/** The sources the Revit add-in files under (GhostFiling, PromoteWallsPlanner). The bridge cannot tell the add-in from
 *  another caller holding the same credential, so every changeset's source is a claim (claimed: true); the MCP tool never
 *  files as one of these. */
export const ADDIN_SOURCES = ["dwg", "promote"];
const BODY_FIELDS = ["name", "source", "elements", "exceptions", "actor", "agent", "contract"]; // what a posted body is read for
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence"]; // what an element is rebuilt from
// Review amendment C3: what an element's blocks are rebuilt from. PLACE_KEPT is the add-in's PlaceDto (ChangesetClient.cs),
// name for name; a key added to one must be added to the other, or it is listed under `ignored` and not kept.
const PLACE_KEPT = ["TypeName", "LevelName", "LocationCurve", "LocationLoop", "BaseElevation", "TopElevation", "Name", "BaseLevel", "TopLevel",
  "FamilyName", "Location", "SillHeight", "FlipFacing", "FlipHand", "Boundary", "BaseOffset", "Offset", "Mark", "Structural"];
const TARGET_KEPT = ["unique_id", "type_before"];
const VALIDATE_KEPT = ["identity", "psets", "quantities"];
const MAX_EVIDENCE = 50; // review amendment C4: contract 2's evidence ids on one element
const SET_BY_BRIDGE = "ignored: set by the bridge";
const NOT_KEPT = "ignored: not a field this bridge keeps";
const NOT_MEASURED = "ignored: no survey job the bridge ran backs it — accuracy.status is not_measured";
const NO_JOB = "ignored: no survey job the bridge ran is named by it — the source is marked claimed";
const MAX_IGNORED = 200;
```

Second, replace

```js
/** Validate + normalise a proposed changeset. Assigns proposal_guids (a posted one is ignored); a missing
```

with

```js
/** MA-1a item 8: the stored source, always a string (deployed add-ins read it into one). A string is kept as filed;
 *  contract 2's object {reader, job_id} gives its reader — the job_id is ignored and listed, because no survey job the
 *  bridge ran exists to name; anything else is "agent", as before. */
function sourceOf(s, note) {
  if (typeof s === "string" && s.trim()) return s.trim();
  if (s && typeof s === "object" && !Array.isArray(s)) {
    for (const k of Object.keys(s)) {
      if (k === "job_id") note("source.job_id", NO_JOB);
      else if (k !== "reader") note(`source.${k}`, NOT_KEPT);
    }
    if (text(s.reader, 256)) return s.reader.trim();
  }
  return "agent";
}

/** MA-1a item 8, the pre-tick rule as the bridge can judge it today: a create is never pre-ticked (an agent ghost and a
 *  drawing-only ghost never are, and no evidence-backed ghost exists before MA-4); a retype or an attach is pre-ticked
 *  only as a single-answer Promote operation — a retype only with the type the plan saw — and only when a signed-in
 *  member filed it (review amendment C2): the source is the caller's own text, so the machine credential, which the
 *  bridge cannot tell from any other holder of the token, earns no pre-tick by writing "promote". */
const pretickOf = (op, source, target, member) =>
  member === true && op !== "create" && source === "promote" && (op === "attach" || target?.type_before != null);

/** Validate + normalise a proposed changeset. Assigns proposal_guids (a posted one is ignored); a missing
```

Third, replace

```js
  const seen = new Set(); // (op, element) pairs: one ghost per change, so a wall can carry one retype and one attach
  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
```

with

```js
  // MA-1a item 8: the bridge, not the caller, sets the trust fields. Every posted field it does not keep is listed back
  // with the reason — a trust field, an unbacked measurement, or a field this bridge does not read — never dropped silently.
  const ignored = [];
  const note = (field, why) => ignored.push({ field, why });
  // Review amendment C3: the same one level down. `kept` = the names a block is rebuilt from; null = the block is kept
  // whole but for a trust field or a measurement (validate.identity: the IFC attributes adjudication reads).
  const nested = (block, kept, where) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return;
    for (const k of Object.keys(block)) {
      if (kept ? kept.includes(k) : !TRUST_FIELDS.includes(k) && k !== "measured") continue;
      note(`${where}.${k}`, TRUST_FIELDS.includes(k) ? SET_BY_BRIDGE : k === "measured" ? NOT_MEASURED : NOT_KEPT);
    }
  };
  for (const k of Object.keys(body)) {
    if (TRUST_FIELDS.includes(k)) note(k, SET_BY_BRIDGE);
    else if (!BODY_FIELDS.includes(k)) note(k, NOT_KEPT);
  }
  if (body.contract != null && body.contract !== 1 && body.contract !== 2) throw err(400, "contract must be 1 or 2");
  const source = sourceOf(body.source, note);

  const seen = new Set(); // (op, element) pairs: one ghost per change, so a wall can carry one retype and one attach
  const elements = body.elements.map((el, i) => {
    const at = `elements[${i}]`;
    if (!el || typeof el !== "object") throw err(400, `${at}: must be an object`);
    for (const k of Object.keys(el)) {
      if (TRUST_FIELDS.includes(k)) note(`${at}.${k}`, SET_BY_BRIDGE);
      else if (k === "measured") note(`${at}.${k}`, NOT_MEASURED);
      else if (!ELEMENT_FIELDS.includes(k)) note(`${at}.${k}`, NOT_KEPT);
    }
    nested(el.place, PLACE_KEPT, `${at}.place`);
    nested(el.target, TARGET_KEPT, `${at}.target`);
    nested(el.validate, VALIDATE_KEPT, `${at}.validate`);
    nested(el.validate?.identity, null, `${at}.validate.identity`);
```

Fourth, replace

```js
      place: { ...el.place },
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
    };
  });

  return {
    name, source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "agent",
    elements, exceptions: checkExceptions(body.exceptions),
  };
}
```

with

```js
      // Review amendment C3: rebuilt from the names the add-in reads — a posted place.pretick or place.measured is not stored.
      place: Object.fromEntries(Object.entries(el.place && typeof el.place === "object" ? el.place : {}).filter(([k]) => PLACE_KEPT.includes(k))),
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
      // Review amendment C4: contract 2's reader id and evidence ids, as sent — the caller's claim, like the source.
      ...(el.cid != null ? { cid: el.cid.trim() } : {}),
      ...(el.evidence != null ? { evidence: el.evidence.map((x) => x.trim()) } : {}),
      // MA-1a item 8: the bridge's own trust decisions. No survey job exists yet, so nothing is measured.
      pretick: pretickOf(op, source, target, member),
      accuracy: { status: "not_measured" },
    };
  });

  const more = ignored.length - MAX_IGNORED;
  return {
    name, source,
    elements, exceptions: checkExceptions(body.exceptions),
    // The source is the caller's claim until a bridge-run job backs a changeset (MA-4).
    claimed: true,
    ignored: more > 0 ? [...ignored.slice(0, MAX_IGNORED), { field: "…", why: `${more} more field(s) ignored the same way` }] : ignored,
    ...(body.contract != null ? { contract: body.contract } : {}),
  };
}
```

Fifth, replace

```js
 *  the changeset with its exceptions (the elements a planner sent to a person). The element is rebuilt field by field,
 *  so a field added to the shape must be added here too, or it is dropped without an error. */
```

with

```js
 *  the changeset with its exceptions (the elements a planner sent to a person). The element is rebuilt field by field,
 *  so a field added to the shape must be added here and to ELEMENT_FIELDS, or it is listed under `ignored` and not kept.
 *  MA-1a item 8: each element also comes back with the bridge's pretick and accuracy, and the changeset with claimed
 *  and the list of what was ignored. */
```

Sixth (review amendment C2), the caller's standing reaches the rule: replace

```js
export function validateChangeset(body) {
```

with

```js
export function validateChangeset(body, { member = false } = {}) {
```

Seventh (review amendment C3), a trust field is never an IFC attribute: replace

```js
    const identity = { ...validate.identity };
```

with

```js
    // The IFC attributes adjudication reads, kept whole — but never a trust field or a measurement (listed by `nested`).
    const identity = Object.fromEntries(Object.entries(validate.identity).filter(([k]) => !TRUST_FIELDS.includes(k) && k !== "measured"));
```

Eighth (review amendment C4), the reader's id and evidence ids are checked before they are kept: replace

```js
    const provenance = checkProvenance(el.provenance, op, at);
```

with

```js
    if (el.cid != null && (!text(el.cid, 256) || CONTROL_CHAR.test(el.cid)))
      throw err(400, `${at}: cid must be one line of text of at most 256 characters`);
    if (el.evidence != null && (!Array.isArray(el.evidence) || el.evidence.length > MAX_EVIDENCE || el.evidence.some((x) => !text(x, 256) || CONTROL_CHAR.test(x))))
      throw err(400, `${at}: evidence must be a list of at most ${MAX_EVIDENCE} one-line texts of at most 256 characters each`);
    const provenance = checkProvenance(el.provenance, op, at);
```

- [ ] **Step 4: Store it, so the reply lists it.** In `WebApp/bridge/changesets-store.mjs`, make four replacements. The first two give the rule the caller's role (review amendment C2):

First, replace

```js
  requireMinRole: deps.requireMinRole || members.requireMinRole,
```

with

```js
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  myRole: deps.myRole || members.myRole,
```

Second, replace

```js
  const v = validateChangeset(body);                      // 400/413 before any store call
```

with

```js
  // MA-1a item 8 (review amendment C2): a Promote retype or attach is pre-ticked only when a signed-in member filed it.
  // The machine credential ("service": a signed-out PC, the MCP server, any script that holds the token) earns none.
  const role = await d.myRole(key);
  const v = validateChangeset(body, { member: role != null && role !== "service" }); // 400/413 before any changeset is stored
```

Third, replace

```js
    exceptions: v.exceptions, // the walls a planner sent to a person — shown to the reviewer, never placed
    result: null,
  };
```

with

```js
    exceptions: v.exceptions, // the walls a planner sent to a person — shown to the reviewer, never placed
    // MA-1a item 8: the bridge's trust decisions — the source is a claim, and what was posted and not kept is listed with
    // its reason ("ignored: set by the bridge"), so the 201 reply and every later read say it.
    claimed: v.claimed, ignored: v.ignored, ...(v.contract != null ? { contract: v.contract } : {}),
    result: null,
  };
```

Fourth, replace

```js
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source });
```

with

```js
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source,
      claimed: v.claimed, ignored: v.ignored.length });
```

- [ ] **Step 5: The MCP tool.** In `WebApp/bridge/mcp-server.mjs`, make four replacements:

First, replace

```js
import { loadEnv } from "./load-env.mjs";
```

with

```js
import { loadEnv } from "./load-env.mjs";
import { ADDIN_SOURCES } from "./changesets-logic.mjs";
```

Second, in the `sentinel_propose_changeset` description, replace its last words

```js
one of each per element. An optional reason (≤500 characters) is shown to the reviewer.",
```

with

```js
one of each per element. An optional reason (≤500 characters) is shown to the reviewer. Trust: the bridge sets pretick, accuracy, confidence, typing, claimed and proposal_guid itself — a posted one is ignored and listed back in the reply's `ignored` as \"ignored: set by the bridge\", as is a `measured` block (no survey job backs it). An agent's element is never pre-ticked, and its accuracy is not_measured.",
```

Third, replace

```js
        source: { type: "string", description: "agent self-label" },
```

with

```js
        source: { type: "string", description: "agent self-label (a claim: recorded, never verified). dwg and promote are the Revit add-in's own sources — a changeset labelled with one is filed as \"agent\"." },
```

Fourth, replace

```js
    const r = await f(`${BASE}/changesets/${enc(project)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name: nm, source: args.source, elements: args.elements }) });
```

with

```js
    // MA-1a item 8: an agent never files as the Revit add-in (ADDIN_SOURCES), and its claimed provenance block — which
    // the schema has always advertised — goes with the changeset to the ledger. Review amendment C1: the tool sends a
    // source it controls — the label when it is text and not one of the add-in's, else "agent". A source that is not
    // text is never forwarded: the bridge reads contract 2's { reader } object, and callTool does not check its
    // arguments against the input schema, so { reader: "promote" } would otherwise be stored as "promote".
    const label = typeof args.source === "string" ? args.source.trim() : "";
    const source = !label || ADDIN_SOURCES.includes(label.toLowerCase()) ? "agent" : label;
    const r = await f(`${BASE}/changesets/${enc(project)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name: nm, source, elements: args.elements, agent: args.agent }) });
```

- [ ] **Step 6: Run.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-store.test.mjs bridge/mcp-server.test.mjs`, expect no failure and 15 more tests than master. Then the full suite, `npx vitest run bridge/`: expect `Test Files  83 passed (83)` and `Tests  1675 passed | 1 skipped (1676)` (master `1630`; 18 + 12 + 15 new).
- [ ] **Step 7: Commit.**

```bash
git add WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/changesets-store.test.mjs WebApp/bridge/mcp-server.test.mjs WebApp/bridge/fixtures/changeset-ops/contract2-trust.json
git commit -F - <<'EOF'
feat(bridge): the bridge, not the caller, sets a changeset's trust fields — a posted pretick or accuracy is ignored and listed back (MA-1a item 8)

Contract 2's trust rules on POST /changesets/:key and the MCP tool: pretick, accuracy, confidence, typing, claimed and
proposal_guid in a posted body are "ignored: set by the bridge"; a measured block counts only for a survey job the
bridge ran (none yet), so accuracy.status is not_measured and the source is marked claimed. A create is never
pre-ticked; a Promote retype or attach only when a signed-in member filed it. A place is rebuilt from the names the
add-in reads, and a nested trust field is listed too. The reader's cid and evidence ids are kept as claims. The MCP
tool never files as dwg or promote, whatever shape its source argument has.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 10 — The pure half of item 8 in the add-in: the bridge's trust fields as read, a model's usage, the receipt (offline)

**Files:**
- Create `tools/promote-check/Trust.cs`
- Modify `tools/promote-check/promote-check.csproj` and `tools/promote-check/Check.cs` (`Main`)
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` (five DTO fields, `AccuracyDto`, `ChangesetTrust`)
- Create `SentinelAddin/GhostBuilder/ModelUsage.cs`
- Create `SentinelAddin/Coordination/BuildReceipt.cs`

**Interfaces:**
- `ChangesetElementDto.Pretick` (`bool?`, null from a bridge before item 8), `ChangesetElementDto.Accuracy` (`AccuracyDto { Status }`), `ChangesetDto.Claimed` (`bool?`).
- `ChangesetElementDto.Cid` and `.Evidence` — contract 2's reader id and evidence ids, as the bridge kept them (review amendment C4). Read only: nothing in MA-1a acts on them.
- `ChangesetTrust.PreTick(cs, el) → bool` — a create is never pre-ticked; a retype or attach takes the bridge's `pretick`, and from an older bridge the rule the window had (source `promote`, a retype only with `type_before`).
- `ChangesetTrust.Accuracy(el) → string` (`"not measured"`, or null from an older bridge) and `ChangesetTrust.SourceLabel(cs) → string` (the source, marked as a claim when the bridge says so).
- `ModelUsage(model)` — one local model's calls in one run: `Asked()`, `Got(JsonElement answer)`, `Calls`, `Answered`, `PromptTokens`, `OutputTokens` (null until an answer carried a count). Thread-safe.
- `BuildReceipt.Facts { Seconds, Candidates, Models, Tools, Parameters }` and `BuildReceipt.Run(reader, addinSha256, facts, gaps, changesets, actor)` — the `POST /cde/:key/audit` body of one `build:run` receipt; `BuildReceipt.AddinSha256` — the sha256 of the add-in's own DLL (founder decision F9).

What a receipt states, and what it does not (it states only what the run knows):

| Field | Source | When it is not known |
|---|---|---|
| `reader` | the command: `ghost-builder`, `photo-massing`, `datum`, `promote` | — |
| `addin_sha256` | the sha256 of `Sentinel.dll` as loaded: it names the exact build (the add-in has no version number) | `null` when the file cannot be read |
| `tools[]` `{name, licence}` | a table of the code the readers run with: the Revit API (proprietary, Autodesk), Ollama (MIT, added when a model was called), PdfPig (Apache-2.0, added when a PDF was read) | a tool not in the table reads `unknown` |
| `weights[]` `{model, calls, licence, licence_note}` | the model tags from Project Setup, for each model that was called | `licence` is always `null` with `licence_note`: Sentinel does not ask Ollama for a model's licence yet (Next). Never a hard-coded weights licence |
| `parameters` | what the run was given: the drawing, the layers read, the standards' labels, the images read | — |
| `minutes`, `seconds` | a stopwatch around the reader or planner | — |
| `model_calls`, `model_calls_answered` | counted at each Ollama round trip | 0 for a deterministic run (Datum, Promote) |
| `tokens` `{prompt, output}` | Ollama's `prompt_eval_count` and `eval_count`, when an answer carried them | `null`, with `tokens_note` saying why |
| `candidates`, `gaps` | the elements read; the ones left without a type or sent to a person | — |
| `changesets[]`, `changesets_total` | the changesets the run filed (first 50) | empty for Datum and Massing: they file none |

The bridge adds `claimed: true` (Task 5). A receipt carries no file contents, no prompt, no model answer, no path and no person but the actor.

- [ ] **Step 1: The failing check.**

Create `tools/promote-check/Trust.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 18. MA-1a item 8: the bridge's trust fields as the add-in reads them, a model's usage, the receipt ───────
    static void TrustChecks()
    {
        Console.WriteLine("\nMA-1a item 8 — the bridge's trust fields, a model's usage and the build:run receipt");

        // A changeset as the bridge stores it since item 8 — the `stored` half of the shared fixture, which vitest proves
        // validateChangeset makes from its `posted` half (review amendment C4) — and one from a bridge before it.
        string stored;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-trust.json"))))
            stored = fx.RootElement.GetProperty("stored").GetRawText();
        var cs = JsonSerializer.Deserialize<ChangesetDto>(stored);
        cs.Elements[0].Verdict = new ElementVerdictDto { Status = "accepted" }; // the store attaches the referee's verdict at filing
        Ok(cs.Claimed == true && cs.Elements[0].Pretick == false && cs.Elements[0].Accuracy.Status == "not_measured",
           "the bridge's claimed, pretick and accuracy are read; its ignored list and contract do not break the read");
        Ok(cs.Elements[0].Cid == "scan-88" && cs.Elements[0].Evidence.SequenceEqual(new[] { "ev-1", "ev-2" })
           && cs.Elements[1].Cid == null && cs.Elements[1].Evidence == null,
           "contract 2's reader id and evidence ids are read as the bridge kept them; an element without them reads null");
        var older = JsonSerializer.Deserialize<ChangesetDto>("{\"id\":\"c0\",\"source\":\"promote\",\"elements\":[{\"proposal_guid\":\"g\",\"kind\":\"wall\",\"op\":\"attach\"}]}");
        Ok(older.Claimed == null && older.Elements[0].Pretick == null && older.Elements[0].Accuracy == null, "a changeset from a bridge before item 8 reads with none of them");

        ChangesetElementDto El(string op, bool? pretick, string typeBefore = null, string verdict = "accepted") => new ChangesetElementDto
        {
            Op = op, Kind = "wall", Pretick = pretick, Verdict = new ElementVerdictDto { Status = verdict },
            Target = op == "create" ? null : new TargetDto { UniqueId = "u", TypeBefore = typeBefore },
        };
        var agent = new ChangesetDto { Source = "agent" };
        var promote = new ChangesetDto { Source = "promote" };
        Ok(!ChangesetTrust.PreTick(agent, cs.Elements[0]), "the design's test: an agent's IDS-accepted create opens unticked");
        Ok(!ChangesetTrust.PreTick(agent, El("create", true)) && !ChangesetTrust.PreTick(agent, El(null, null)) && !ChangesetTrust.PreTick(promote, El("create", null)),
           "a create is never pre-ticked — not when a bridge says pretick true, not from an older bridge, not from any source");
        Ok(ChangesetTrust.PreTick(promote, El("retype", true, "T1")) && ChangesetTrust.PreTick(promote, El("attach", true)),
           "a retype or attach the bridge pre-ticked opens ticked");
        Ok(!ChangesetTrust.PreTick(promote, El("retype", false, "T1")) && !ChangesetTrust.PreTick(promote, El("attach", false)),
           "…and one the bridge did not pre-tick opens unticked, whatever the source says");
        Ok(ChangesetTrust.PreTick(promote, El("attach", null)) && ChangesetTrust.PreTick(promote, El("retype", null, "T1"))
           && !ChangesetTrust.PreTick(promote, El("retype", null)) && !ChangesetTrust.PreTick(agent, El("attach", null)),
           "from a bridge before item 8 the window's own rule holds: a Promote attach, a Promote retype with the type the plan saw");
        Ok(ChangesetTrust.Accuracy(cs.Elements[0]) == "not measured" && ChangesetTrust.Accuracy(older.Elements[0]) == null,
           "accuracy reads \"not measured\"; from an older bridge it reads nothing — never a pass");
        Ok(ChangesetTrust.SourceLabel(cs) == "sentinel-survey 0.1 (claimed — the bridge records who a changeset says it is from, and cannot verify it)"
           && ChangesetTrust.SourceLabel(older) == "promote", "the source is shown as a claim when the bridge marks it one");
        string filed = JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall", Op = "create" }, ChangesetClient.WriteJson);
        Ok(!filed.Contains("pretick") && !filed.Contains("accuracy") && !filed.Contains("cid") && !filed.Contains("evidence"),
           "an element the add-in files carries no trust field, reader id or evidence (nulls are left out), so nothing of its own is listed as ignored");

        // A model's usage: counted per round trip; tokens only when the answer carried them.
        JsonElement Answer(string json) => JsonDocument.Parse(json).RootElement.Clone();
        var usage = new ModelUsage("qwen2.5:7b-instruct");
        usage.Asked(); usage.Got(Answer("{\"response\":\"{}\",\"prompt_eval_count\":812,\"eval_count\":96,\"total_duration\":123}"));
        usage.Asked(); usage.Got(Answer("{\"response\":\"{}\",\"prompt_eval_count\":100,\"eval_count\":4}"));
        usage.Asked(); // a call that never answered (Ollama down, cancelled)
        Ok(usage.Model == "qwen2.5:7b-instruct" && usage.Calls == 3 && usage.Answered == 2 && usage.PromptTokens == 912 && usage.OutputTokens == 100,
           "3 calls, 2 answered, the token counts of the answers summed");
        var silent = new ModelUsage("llava");
        silent.Asked(); silent.Got(Answer("{\"response\":\"a plan\"}")); silent.Got(Answer("{\"response\":\"x\",\"eval_count\":\"7\"}"));
        Ok(silent.Answered == 2 && silent.PromptTokens == null && silent.OutputTokens == null, "an answer with no token count (or one that is not a number) leaves tokens unknown — null, never 0");

        // The receipt.
        var facts = new BuildReceipt.Facts { Seconds = 75.04, Candidates = 120 };
        facts.Models.Add(usage); facts.Models.Add(new ModelUsage("llava")); facts.Models.Add(null);
        facts.Tools.Add(BuildReceipt.PdfPig);
        facts.Parameters["drawing"] = "plan-L01.dxf";
        facts.Parameters["layers_read"] = 14;
        var row = Json(BuildReceipt.Run("ghost-builder", "ab" + new string('0', 62), facts, 2, new[] { "cs-1", "cs-2" }, "lead@office.example"));
        var v = row.GetProperty("new_value");
        Ok(row.GetProperty("entity_type").GetString() == "build" && row.GetProperty("action").GetString() == "build:run" && row.GetProperty("actor").GetString() == "lead@office.example",
           "a receipt is a build row with the action build:run");
        Ok(v.GetProperty("reader").GetString() == "ghost-builder" && v.GetProperty("addin_sha256").GetString().Length == 64
           && v.GetProperty("minutes").GetDouble() == 1.25 && v.GetProperty("seconds").GetDouble() == 75
           && v.GetProperty("candidates").GetInt32() == 120 && v.GetProperty("gaps").GetInt32() == 2,
           "the reader, the build of the add-in, the minutes, the candidates and the gaps");
        Ok(string.Join(" | ", v.GetProperty("tools").EnumerateArray().Select(t => t.GetProperty("name").GetString() + ": " + t.GetProperty("licence").GetString()))
           == "Autodesk Revit API: proprietary (Autodesk) | PdfPig: Apache-2.0 | Ollama: MIT",
           "each tool with its licence; Ollama is listed because a model was called");
        var weights = v.GetProperty("weights");
        Ok(weights.GetArrayLength() == 1 && weights[0].GetProperty("model").GetString() == "qwen2.5:7b-instruct" && weights[0].GetProperty("calls").GetInt32() == 3
           && weights[0].GetProperty("licence").ValueKind == JsonValueKind.Null && weights[0].GetProperty("licence_note").GetString() == BuildReceipt.WeightsNote
           && BuildReceipt.WeightsNote == "not read: Sentinel does not ask Ollama for a model's licence yet",
           "the weights that were called, their licence unknown and said so — a model that was never called is not listed");
        Ok(v.GetProperty("model_calls").GetInt32() == 3 && v.GetProperty("model_calls_answered").GetInt32() == 2
           && v.GetProperty("tokens").GetProperty("prompt").GetInt64() == 912 && v.GetProperty("tokens").GetProperty("output").GetInt64() == 100
           && v.GetProperty("tokens_note").ValueKind == JsonValueKind.Null, "model calls, answers and tokens as counted");
        Ok(v.GetProperty("parameters").GetProperty("drawing").GetString() == "plan-L01.dxf" && v.GetProperty("parameters").GetProperty("layers_read").GetInt32() == 14
           && v.GetProperty("changesets").GetArrayLength() == 2 && v.GetProperty("changesets_total").GetInt32() == 2 && v.GetProperty("source").GetString() == "revit",
           "the parameters as given, the changesets it filed");
        Ok(!v.TryGetProperty("claimed", out _), "the add-in does not mark its own receipt: claimed is the bridge's to set");

        var det = Json(BuildReceipt.Run("datum", null, new BuildReceipt.Facts { Seconds = 0.4, Candidates = 7 }, 0, new string[0], "a")).GetProperty("new_value");
        Ok(det.GetProperty("model_calls").GetInt32() == 0 && det.GetProperty("tokens").ValueKind == JsonValueKind.Null
           && det.GetProperty("tokens_note").GetString() == "no model was called: this run is deterministic" && det.GetProperty("weights").GetArrayLength() == 0
           && det.GetProperty("tools").GetArrayLength() == 1 && det.GetProperty("addin_sha256").ValueKind == JsonValueKind.Null
           && det.GetProperty("minutes").GetDouble() == 0.01 && det.GetProperty("seconds").GetDouble() == 0.4,
           "a deterministic run: no model, no weights, no tokens — said, not zero-filled; an unreadable DLL is null");
        var mute = new BuildReceipt.Facts();
        mute.Models.Add(silent);
        Ok(Json(BuildReceipt.Run("photo-massing", null, mute, 0, new string[0], "a")).GetProperty("new_value").GetProperty("tokens_note").GetString()
           == "the local model's answers carried no token counts", "a model that answered without counts: tokens null, with the reason");
        var odd = new BuildReceipt.Facts();
        odd.Tools.Add("Some Tool");
        Ok(Json(BuildReceipt.Run("datum", null, odd, 0, new string[0], "a")).GetProperty("new_value").GetProperty("tools")[1].GetProperty("licence").GetString() == "unknown",
           "a tool the table does not know reads unknown, never a guess");
        Ok(BuildReceipt.AddinSha256 != null && System.Text.RegularExpressions.Regex.IsMatch(BuildReceipt.AddinSha256, "^[0-9a-f]{64}$"),
           "the add-in's own sha256 is read from the loaded assembly (here: this check's)");
    }
}
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Coordination\CommandReports.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Coordination\CommandReports.cs" />
    <!-- MA-1a item 8: a local model's usage in one run, and the build:run receipt -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ModelUsage.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BuildReceipt.cs" />
```

In `tools/promote-check/Check.cs`, replace

```csharp
        ReportWiringChecks();
```

with

```csharp
        ReportWiringChecks();
        TrustChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`: expect the build failure `error CS2001: Source file '…\SentinelAddin\GhostBuilder\ModelUsage.cs' could not be found` (and the same for `BuildReceipt.cs`).
- [ ] **Step 3: The trust fields as read.** In `SentinelAddin/Coordination/ChangesetClient.cs`, make two replacements:

First, replace

```csharp
    [JsonPropertyName("provenance")] public ProvenanceDto Provenance { get; set; }
}
```

with

```csharp
    [JsonPropertyName("provenance")] public ProvenanceDto Provenance { get; set; }
    /// <summary>MA-1a item 8: the bridge's pre-tick decision; null from a bridge before item 8, and on an element the
    /// add-in files (nulls are left out of a request body). Never trusted for a create (ChangesetTrust.PreTick).</summary>
    [JsonPropertyName("pretick")] public bool? Pretick { get; set; }
    /// <summary>MA-1a item 8: the bridge's accuracy status — "not_measured" until a survey job backs a measurement (MA-4).</summary>
    [JsonPropertyName("accuracy")] public AccuracyDto Accuracy { get; set; }
    /// <summary>MA-1a item 8 (review amendment C4): contract 2's reader id and evidence ids — the caller's claim, kept by
    /// the bridge as sent. Read only: nothing in MA-1a acts on them. Null on an element the add-in files.</summary>
    [JsonPropertyName("cid")] public string Cid { get; set; }
    [JsonPropertyName("evidence")] public List<string> Evidence { get; set; }
}

public sealed class AccuracyDto
{
    [JsonPropertyName("status")] public string Status { get; set; }
}

/// <summary>MA-1a item 8: how the review reads the bridge's trust fields. Pure (tools/promote-check).</summary>
public static class ChangesetTrust
{
    /// <summary>What is ticked when the review opens (and by "Tick suggested"). A create is never pre-ticked: an agent
    /// ghost and a drawing-only ghost never are, and nothing is measured before MA-4 — held here too, whatever a bridge
    /// answers. A retype or attach takes the bridge's decision; from a bridge before item 8 (no pretick) the window's own
    /// rule holds: a Promote attach, and a Promote retype with the type the plan saw (DR-1). A person still clicks Apply.</summary>
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        if (el.Op is null or "create") return false;
        return el.Pretick ?? (cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null)));
    }

    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');

    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
    public static string SourceLabel(ChangesetDto cs) =>
        cs.Source + (cs.Claimed == true ? " (claimed — the bridge records who a changeset says it is from, and cannot verify it)" : "");
}
```

Second, replace

```csharp
    [JsonPropertyName("source")] public string Source { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; }
```

with

```csharp
    [JsonPropertyName("source")] public string Source { get; set; }
    /// <summary>MA-1a item 8: the bridge marks the source a claim (true on every changeset until a bridge-run job backs
    /// one, MA-4); null from a bridge before item 8.</summary>
    [JsonPropertyName("claimed")] public bool? Claimed { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; }
```

- [ ] **Step 4: A model's usage.**

Create `SentinelAddin/GhostBuilder/ModelUsage.cs`:

```csharp
#nullable disable
// MA-1a item 8: what one local model was asked in one run, counted at each Ollama round trip, for the run's build:run
// receipt. Pure — no HTTP: the reader calls Asked() before a request and Got(answer) with Ollama's reply. Tokens are
// Ollama's own prompt_eval_count and eval_count when a reply carries them; a reply without them leaves tokens unknown
// (null), never 0. Thread-safe: a reader may run on pool threads.
using System.Text.Json;

namespace Sentinel.GhostBuilder
{
    public sealed class ModelUsage
    {
        private readonly object _gate = new object();

        /// <summary>The model's tag as the reader was configured with it (Project Setup), e.g. "qwen2.5:7b-instruct".</summary>
        public string Model { get; }
        /// <summary>Requests sent.</summary>
        public int Calls { get; private set; }
        /// <summary>Requests that came back with a 2xx reply.</summary>
        public int Answered { get; private set; }
        /// <summary>The answers' token counts summed; null until an answer carried one.</summary>
        public long? PromptTokens { get; private set; }
        public long? OutputTokens { get; private set; }

        public ModelUsage(string model) { Model = model; }

        public void Asked() { lock (_gate) Calls++; }

        public void Got(JsonElement answer)
        {
            lock (_gate)
            {
                Answered++;
                if (Count(answer, "prompt_eval_count") is long p) PromptTokens = (PromptTokens ?? 0) + p;
                if (Count(answer, "eval_count") is long o) OutputTokens = (OutputTokens ?? 0) + o;
            }
        }

        private static long? Count(JsonElement o, string name) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            && v.TryGetInt64(out long n) && n >= 0 ? n : (long?)null;
    }
}
```

- [ ] **Step 5: The receipt.**

Create `SentinelAddin/Coordination/BuildReceipt.cs`:

```csharp
#nullable disable
// MA-1a item 8 (C12): the build:run receipt of one reader or planner run — Ghost Builder, Photo Massing, Datum, Promote —
// as a POST /cde/:key/audit body (entity_type build; the bridge words the action and marks it claimed). Pure — no Revit
// API, no HTTP — so tools/promote-check pins it. It states only what the run knows: a fact it cannot know is null with a
// note, never 0 and never a guess. It carries no file contents, no prompt, no model answer, no path, and no person but
// the actor.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Coordination
{
    public static class BuildReceipt
    {
        public const string RevitApi = "Autodesk Revit API", Ollama = "Ollama", PdfPig = "PdfPig";

        // The code the readers run with, and its licence. Weights are not here: a model's licence is the model's own, and
        // Sentinel does not read it from Ollama yet.
        private static readonly Dictionary<string, string> Licences = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [RevitApi] = "proprietary (Autodesk)",
            [Ollama] = "MIT",
            [PdfPig] = "Apache-2.0",
        };

        public const string WeightsNote = "not read: Sentinel does not ask Ollama for a model's licence yet";
        private const string NoModel = "no model was called: this run is deterministic";
        private const string NoTokens = "the local model's answers carried no token counts";

        private static readonly Lazy<string> Sha = new Lazy<string>(() =>
        {
            try { return ProvenanceStamp.FileSha256(typeof(BuildReceipt).Assembly.Location); }
            catch (Exception) { return null; }
        });

        /// <summary>The sha256 of the add-in's DLL as loaded — it names the exact build that read the evidence (the add-in
        /// has no version number); null when the file cannot be read.</summary>
        public static string AddinSha256 => Sha.Value;

        /// <summary>What a command gathered about its reader or planner run.</summary>
        public sealed class Facts
        {
            /// <summary>The reader's or planner's own time, by a stopwatch.</summary>
            public double Seconds;
            /// <summary>The elements the reader read or the planner judged.</summary>
            public int Candidates;
            /// <summary>The local models the run could call (a null entry is skipped); empty for a deterministic run.</summary>
            public readonly List<ModelUsage> Models = new List<ModelUsage>();
            /// <summary>The tools the run used, by the names above. Ollama is added by Run when a model was called.</summary>
            public readonly List<string> Tools = new List<string> { RevitApi };
            /// <summary>What the run was given: names, labels and counts — never a path, never file contents.</summary>
            public readonly Dictionary<string, object> Parameters = new Dictionary<string, object>();
        }

        public static object Run(string reader, string addinSha256, Facts facts, int gaps, IReadOnlyList<string> changesets, string actor)
        {
            var models = facts.Models.Where(m => m != null).ToList();
            int calls = models.Sum(m => m.Calls);
            bool counted = models.Any(m => m.PromptTokens.HasValue || m.OutputTokens.HasValue);
            var tools = facts.Tools.Concat(calls > 0 ? new[] { Ollama } : new string[0]).Distinct().ToList();
            return new
            {
                entity_type = "build",
                actor,
                action = "build:run",
                new_value = new
                {
                    reader,
                    addin_sha256 = addinSha256,
                    tools = tools.Select(t => new { name = t, licence = Licences.TryGetValue(t, out string l) ? l : "unknown" }).ToArray(),
                    weights = models.Where(m => m.Calls > 0)
                        .Select(m => new { model = m.Model, calls = m.Calls, licence = (string)null, licence_note = WeightsNote }).ToArray(),
                    parameters = facts.Parameters,
                    minutes = Math.Round(facts.Seconds / 60.0, 2),
                    seconds = Math.Round(facts.Seconds, 1),
                    model_calls = calls,
                    model_calls_answered = models.Sum(m => m.Answered),
                    tokens = counted ? (object)new { prompt = models.Sum(m => m.PromptTokens ?? 0), output = models.Sum(m => m.OutputTokens ?? 0) } : null,
                    tokens_note = counted ? null : calls == 0 ? NoModel : NoTokens,
                    candidates = facts.Candidates,
                    gaps,
                    changesets = changesets.Take(CommandReports.MaxNames).ToArray(),
                    changesets_total = changesets.Count,
                    source = "revit",
                },
            };
        }
    }
}
```

- [ ] **Step 6: Run.** `dotnet run --project tools/promote-check`: expect `374/374 checks pass` (24 new). `session-check` `47/47` (it compiles `ChangesetClient.cs`). Both builds `0 Error(s)`.
- [ ] **Step 7: Commit.**

```bash
git add tools/promote-check/Trust.cs tools/promote-check/promote-check.csproj tools/promote-check/Check.cs SentinelAddin/Coordination/ChangesetClient.cs SentinelAddin/GhostBuilder/ModelUsage.cs SentinelAddin/Coordination/BuildReceipt.cs
git commit -F - <<'EOF'
feat(engine): the add-in reads the bridge's trust fields, counts a local model's calls and tokens, and words the build:run receipt (MA-1a item 8)

ChangesetTrust: a create is never pre-ticked; a retype or attach takes the bridge's pretick. ModelUsage: calls,
answers and Ollama's own token counts, null when an answer carried none. BuildReceipt: reader, the add-in's sha256,
tool licences, weights with their licence unknown and said so, parameters, minutes, model calls, tokens, candidates,
gaps. The stored shape of a contract-2 changeset is read from the fixture the bridge's test proves. promote-check 374/374.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 11 — The review obeys the bridge's pre-tick; each reader and planner run posts its receipt (item 8)

**Files:**
- Modify `tools/promote-check/Trust.cs` and `tools/promote-check/Check.cs` (the wiring check, a source scan)
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs` (pre-tick, the source line, the accuracy on each row)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs`, `SentinelAddin/GhostBuilder/LocalVisionReader.cs`, `SentinelAddin/GhostBuilder/MassingVisionReader.cs` (each counts its Ollama round trips)
- Modify `tools/ghost-p2-check/ghost-p2-check.csproj` and `tools/ghost-standards-check/ghost-standards-check.csproj` (both compile `GhostBuilder_Architecture.cs`, which now needs `ModelUsage.cs`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` and `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (Ghost Builder's receipt)
- Modify `SentinelAddin/Commands.Massing.cs` (Photo Massing's receipt)
- Modify `SentinelAddin/Commands.Datum.cs` (Datum's receipt)
- Modify `SentinelAddin/Commands.PromoteWalls.cs` (Promote's receipt)

**Interfaces:**
- `LocalGhostBuilder.Usage`, `LocalVisionReader.Usage`, `MassingVisionReader.Usage` — each reader's `ModelUsage`.
- `GhostChangesetBuild.Request.Reader` — the `BuildReceipt.Facts` the command gathered; null = no receipt.
- Four receipt posts, each through `GovernedNotify.Report` (sent off the API thread, never waited for, said in the pane log), each beside the run's own report and under the same condition:

| Run | Reader | Posted when | `candidates` | `gaps` |
|---|---|---|---|---|
| Ghost Builder | `ghost-builder` | the build was kept and at least one element is still in the model | the drawing's elements read | wall gaps + type gaps |
| Photo Massing | `photo-massing` | the build committed and placed something | the massing plan's elements | wall gaps |
| Datum from Drawings | `datum` | its transaction committed and created something | levels + grids read | 0 (Datum types nothing) |
| Promote | `promote` | at least one changeset was filed | the elements the planner judged | the elements sent to a person |

A run whose result was not kept (a review that is closed, a build the person went back on, a read-only Promote) writes no receipt (founder decision F10).

- [ ] **Step 1: The failing check.**

In `tools/promote-check/Trust.cs`, replace

```csharp
           "the add-in's own sha256 is read from the loaded assembly (here: this check's)");
    }
}
```

with

```csharp
           "the add-in's own sha256 is read from the loaded assembly (here: this check's)");
    }

    // ── 19. MA-1a item 8: the review obeys the bridge, the readers count, each run posts its receipt (a source scan) ──
    static void TrustWiringChecks()
    {
        Console.WriteLine("\nMA-1a item 8 — the review window, the model counters and the receipt posts (source scan)");
        string window = Src("UI", "ChangesetReviewWindow.cs");
        Ok(window.Contains("IsChecked = ChangesetTrust.PreTick(_cs, el)") && window.Contains("r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El)")
           && !window.Contains("private static bool PreTick("),
           "Review AI Proposals pre-ticks by ChangesetTrust — the window keeps no rule of its own");
        Ok(window.Contains("ChangesetTrust.SourceLabel(_cs)") && window.Contains("ChangesetTrust.Accuracy(el)"),
           "…and shows the source as a claim and each element's accuracy");
        foreach (var file in new[] { "GhostBuilder_Architecture.cs", "LocalVisionReader.cs", "MassingVisionReader.cs" })
        {
            string src = Src("GhostBuilder", file);
            int asked = src.IndexOf("Usage.Asked();", StringComparison.Ordinal), post = src.IndexOf("_http.PostAsync(", StringComparison.Ordinal);
            Ok(asked > 0 && post > asked && src.Contains("Usage.Got(doc.RootElement);") && src.Contains("public ModelUsage Usage { get; }"),
               file + ": counts each Ollama round trip — asked before the request, answered with the reply");
        }
        foreach (var (file, post) in new[]
        {
            (new[] { "GhostBuilder", "GhostChangesetBuild.cs" }, "GovernedNotify.Report(\"Ghost Builder receipt\", BuildReceipt.Run(\"ghost-builder\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.Massing.cs" }, "GovernedNotify.Report(\"Photo Massing receipt\", BuildReceipt.Run(\"photo-massing\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.Datum.cs" }, "GovernedNotify.Report(\"Datum receipt\", BuildReceipt.Run(\"datum\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.PromoteWalls.cs" }, "GovernedNotify.Report(\"Promote receipt\", BuildReceipt.Run(\"promote\", BuildReceipt.AddinSha256,"),
        })
        {
            string src = Src(file);
            int first = src.IndexOf(post, StringComparison.Ordinal);
            Ok(first > 0 && src.IndexOf(post, first + 1, StringComparison.Ordinal) < 0, file[file.Length - 1] + ": one receipt post");
        }
        Ok(Src("Commands.GhostBuilder.cs").Contains("reader.Models.Add(llm.Usage);") && Src("Commands.GhostBuilder.cs").Contains("readerClock.Stop();"),
           "Ghost Builder's receipt holds its mapper's usage and its reader's own time");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        TrustChecks();
```

with

```csharp
        TrustChecks();
        TrustWiringChecks();
```

- [ ] **Step 2: Run it, and see it fail.** `dotnet run --project tools/promote-check`: expect `374/384 checks pass` with 10 `FAIL` lines.
- [ ] **Step 3: The review window.** In `SentinelAddin/UI/ChangesetReviewWindow.cs`, make five replacements. First, the source as a claim:

First, replace

```csharp
            Text = $"Proposed by {_cs.Source} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
```

with

```csharp
            Text = $"Proposed by {ChangesetTrust.SourceLabel(_cs)} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
```

Second, replace

```csharp
        all.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = PreTick(_cs, r.El); };
```

with

```csharp
        all.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El); };
```

Third, replace

```csharp
                IsChecked = PreTick(_cs, el), // the referee's verdict, or a Promote single-answer op
```

with

```csharp
                IsChecked = ChangesetTrust.PreTick(_cs, el), // MA-1a item 8: the bridge's pre-tick — never a create
```

Fourth, replace

```csharp
            if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
```

with

```csharp
            if (ChangesetTrust.Accuracy(el) is string accuracy) label.Text += "  ·  " + accuracy; // MA-1a item 8: "not measured"
            if (!string.IsNullOrWhiteSpace(el.Reason)) label.ToolTip = el.Reason;
```

Fifth, replace

```csharp
    /// <summary>What is ticked when the window opens (and by "Tick suggested"): a create the IDS accepted, and a Promote
    /// attach or retype — a retype only with the type the plan saw (type_before); a door swap too (DR-1, confirmed by the
    /// founder 2026-10-01: sized by the target's type name; its own Width is the leaf). An IDS verdict certifies nothing for a
    /// retype or attach (no property sets). MA-1 moves this decision to the bridge (§6.3); a person still clicks Apply.</summary>
    private static bool PreTick(ChangesetDto cs, ChangesetElementDto el) => el.Op is null or "create"
        ? el.Verdict?.Status == "accepted"
        : cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null));
```

with

```csharp
    // What is ticked when the window opens (and by "Tick suggested") is the bridge's decision since MA-1a item 8:
    // ChangesetTrust.PreTick (Coordination/ChangesetClient.cs). A create is never pre-ticked; a person still clicks Apply.
```

- [ ] **Step 4: The three readers count.** Each Ollama round trip is counted where it is made. In `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs`, make two replacements:

First, replace

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "qwen2.5:7b-instruct" : model;
```

with

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "qwen2.5:7b-instruct" : model;
            Usage = new ModelUsage(_model);
```

Second, replace

```csharp
            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(_ollamaUrl, body, ct).ConfigureAwait(false);
            resp.EnsureSuccessStatusCode();

            // Ollama wraps the model's text in { "response": "<json string>", ... }.
            using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
            return doc.RootElement.GetProperty("response").GetString()
                   ?? throw new InvalidOperationException("Empty LLM response.");
        }
```

with

```csharp
            Usage.Asked(); // MA-1a item 8: every round trip is counted, answered or not
            using var body = new StringContent(payload, Encoding.UTF8, "application/json");
            using HttpResponseMessage resp = await _http.PostAsync(_ollamaUrl, body, ct).ConfigureAwait(false);
            resp.EnsureSuccessStatusCode();

            // Ollama wraps the model's text in { "response": "<json string>", ... }.
            using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
            Usage.Got(doc.RootElement);
            return doc.RootElement.GetProperty("response").GetString()
                   ?? throw new InvalidOperationException("Empty LLM response.");
        }

        /// <summary>MA-1a item 8: this model's calls, answers and token counts in this run, for the build:run receipt.</summary>
        public ModelUsage Usage { get; }
```

`tools/ghost-p2-check` and `tools/ghost-standards-check` compile that file, so each needs the counter too. In `tools/ghost-p2-check/ghost-p2-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostBuilder_Architecture.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostBuilder_Architecture.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ModelUsage.cs" /> <!-- MA-1a item 8: LocalGhostBuilder.Usage -->
```

And in `tools/ghost-standards-check/ghost-standards-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostBuilder_Architecture.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostBuilder_Architecture.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ModelUsage.cs" /> <!-- MA-1a item 8: LocalGhostBuilder.Usage -->
```

In `SentinelAddin/GhostBuilder/LocalVisionReader.cs`, make two replacements. First, replace

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
```

with

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
            Usage = new ModelUsage(_model);
```

Second, replace

```csharp
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return string.Empty; // model not pulled / other -> skip gracefully
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                return doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() ?? string.Empty : string.Empty;
            }
            catch (OperationCanceledException) { throw; }
            catch { return string.Empty; } // vision is best-effort; never break the build
        }
```

with

```csharp
                Usage.Asked(); // MA-1a item 8: every round trip is counted, answered or not
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return string.Empty; // model not pulled / other -> skip gracefully
                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                Usage.Got(doc.RootElement);
                return doc.RootElement.TryGetProperty("response", out var r) ? r.GetString() ?? string.Empty : string.Empty;
            }
            catch (OperationCanceledException) { throw; }
            catch { return string.Empty; } // vision is best-effort; never break the build
        }

        /// <summary>MA-1a item 8: this model's calls, answers and token counts in this run, for the build:run receipt.</summary>
        public ModelUsage Usage { get; }
```

In `SentinelAddin/GhostBuilder/MassingVisionReader.cs`, make three replacements. First, replace

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
```

with

```csharp
            _model = string.IsNullOrWhiteSpace(model) ? "llava" : model;
            Usage = new ModelUsage(_model);
```

Second, replace

```csharp
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return MassingPlanner.Validate(new MassingEstimate());

                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
```

with

```csharp
                Usage.Asked(); // MA-1a item 8: every round trip is counted, answered or not
                using var body = new StringContent(payload, Encoding.UTF8, "application/json");
                using HttpResponseMessage resp = await _http.PostAsync(_url, body, ct).ConfigureAwait(false);
                if (!resp.IsSuccessStatusCode) return MassingPlanner.Validate(new MassingEstimate());

                using JsonDocument doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
                Usage.Got(doc.RootElement);
```

Third, add the property: replace

```csharp
        /// <summary>How many of the folder's images the vision model reads (the first ones Images lists).</summary>
        public const int MaxImages = 6;
```

with

```csharp
        /// <summary>MA-1a item 8: this model's calls, answers and token counts in this run, for the build:run receipt.</summary>
        public ModelUsage Usage { get; }

        /// <summary>How many of the folder's images the vision model reads (the first ones Images lists).</summary>
        public const int MaxImages = 6;
```

- [ ] **Step 5: Ghost Builder's receipt.** The command times its reader (the standards read, the sketch hints, the layer mapping, the parameter read — up to the review opening) and hands the facts to the build with the request. In `SentinelAddin/Commands.GhostBuilder.cs`, make seven replacements:

First, replace

```csharp
using Autodesk.Revit.UI.Selection;
using Sentinel.Engine;
```

with

```csharp
using Autodesk.Revit.UI.Selection;
using Sentinel.Coordination;
using Sentinel.Engine;
```

Second, replace

```csharp
        string? templateLine = null; // MA-1a item 6: the office-template check's line, set in PHASE 2 for the summary
```

with

```csharp
        string? templateLine = null; // MA-1a item 6: the office-template check's line, set in PHASE 2 for the summary
        // MA-1a item 8: the reader's own time and the sketch reader's usage, for the build:run receipt.
        var readerClock = new System.Diagnostics.Stopwatch();
        ModelUsage? visionUsage = null;
```

Third, replace

```csharp
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
```

with

```csharp
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
            // MA-1a item 8: what this run's reader did, for its build:run receipt — names, labels and counts only.
            var reader = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds, Candidates = inputs.Elements.Count };
            reader.Models.Add(llm.Usage);
            reader.Models.Add(visionUsage);
            if (evidence.Sources.Any(s => s.EndsWith(".pdf", System.StringComparison.OrdinalIgnoreCase))) reader.Tools.Add(BuildReceipt.PdfPig);
            reader.Parameters["drawing"] = drawing;
            reader.Parameters["layers_read"] = inputs.Layers.Count;
            reader.Parameters["layers_ticked"] = approved.Mappings?.Count ?? 0;
            reader.Parameters["evidence_docs"] = evidence.Sources.Count;
            reader.Parameters["layers_standard"] = standards!.LayersSource.Label;
            reader.Parameters["guideline"] = standards!.GuidelineSource.Label;
            reader.Parameters["type_catalogue"] = standards!.CatalogSource.Label;
```

Fourth, replace

```csharp
                ImportZFt = importZFt, SourceSha256 = sourceSha, GuidelineLabel = standards!.GuidelineSource.Label, LayersLabel = standards!.LayersSource.Label,
            });
```

with

```csharp
                ImportZFt = importZFt, SourceSha256 = sourceSha, GuidelineLabel = standards!.GuidelineSource.Label, LayersLabel = standards!.LayersSource.Label,
                Reader = reader,
            });
```

Fifth, replace

```csharp
            try
            {
                // layers@n, guideline@n and type_catalog@n for this document's project (or its office), fetched in
```

with

```csharp
            try
            {
                readerClock.Start(); // MA-1a item 8: stopped when the review opens
                // layers@n, guideline@n and type_catalog@n for this document's project (or its office), fetched in
```

Sixth, replace

```csharp
                    string hints = await vision.ReadFolderAsync(settings.GhostSourceFolder, ct: progress.Token).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(hints)) llm.AppendEvidence(hints);
                }
```

with

```csharp
                    string hints = await vision.ReadFolderAsync(settings.GhostSourceFolder, ct: progress.Token).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(hints)) llm.AppendEvidence(hints);
                    visionUsage = vision.Usage;
                }
```

Seventh, stop the clock when the reader is done: replace

```csharp
                    .ToDictionary(g => g.Key, g => g.Count(), System.StringComparer.OrdinalIgnoreCase);

                progress.Dispatcher.Invoke(() =>
```

with

```csharp
                    .ToDictionary(g => g.Key, g => g.Count(), System.StringComparer.OrdinalIgnoreCase);

                readerClock.Stop();
                progress.Dispatcher.Invoke(() =>
```

Then in `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, make two replacements:

First, replace

```csharp
            public string GuidelineLabel, LayersLabel;
        }
```

with

```csharp
            public string GuidelineLabel, LayersLabel;
            /// <summary>MA-1a item 8: what the command's reader did — its time, its model calls, what it was given — for the
            /// run's build:run receipt; null = no receipt.</summary>
            public BuildReceipt.Facts Reader;
        }
```

Second, replace

```csharp
                        report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                return report;
```

with

```csharp
                        report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                // MA-1a item 8: the reader's build:run receipt, for the same kept build — its gaps are the walls and types
                // this build left as a named gap. Under the report's own condition (review amendment C19): a build that
                // left no element in the model posts neither.
                if (r.Reader != null && report.Placed > 0)
                {
                    r.Reader.Parameters["level"] = level.Name;
                    GovernedNotify.Report("Ghost Builder receipt", BuildReceipt.Run("ghost-builder", BuildReceipt.AddinSha256, r.Reader,
                        report.WallGaps + report.TypeGaps, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                }
                return report;
```

- [ ] **Step 6: Photo Massing's receipt.** In `SentinelAddin/Commands.Massing.cs`, make four replacements:

First, replace

```csharp
        string stampSha = null; // MA-1a item 7: the images' sha the build was stamped with (null: the numbers are the reviewer's)
```

with

```csharp
        string stampSha = null; // MA-1a item 7: the images' sha the build was stamped with (null: the numbers are the reviewer's)
        // MA-1a item 8: the vision reader's time and usage, and the facts of the run that was built, for its receipt.
        var readerClock = new System.Diagnostics.Stopwatch();
        ModelUsage visionUsage = null;
        BuildReceipt.Facts receipt = null;
```

Second, replace

```csharp
                    stampSha, UserSession.Actor), key);
```

with

```csharp
                    stampSha, UserSession.Actor), key);
            if (error == null && report != null && report.RolledBack == null && report.NotFinished == null && report.Placed > 0 && receipt != null)
                GovernedNotify.Report("Photo Massing receipt", BuildReceipt.Run("photo-massing", BuildReceipt.AddinSha256, receipt, report.WallGaps, new string[0], UserSession.Actor), key);
```

Third, replace

```csharp
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
```

with

```csharp
                readerClock.Start();
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                readerClock.Stop();
                visionUsage = reader.Usage;
```

Fourth, replace

```csharp
                        stampSha = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;
```

with

```csharp
                        stampSha = MassingPlanner.HasModelValue(corrected) ? imagesSha : null;
                        receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds, Candidates = elements.Count };
                        receipt.Models.Add(visionUsage);
                        receipt.Parameters["images_read"] = Math.Min(MassingVisionReader.CountImages(folder), MassingVisionReader.MaxImages);
                        receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
                        receipt.Parameters["type_catalogue"] = standards.CatalogSource.Label;
```

- [ ] **Step 7: Datum's receipt.** A deterministic reader: no model, no tokens. In `SentinelAddin/Commands.Datum.cs`, make four replacements:

First, replace

```csharp
        DatumBuilder.DatumResult detected;
        if (haveFolder)
```

with

```csharp
        var readerClock = new System.Diagnostics.Stopwatch(); // MA-1a item 8: the read's own time, for the receipt
        DatumBuilder.DatumResult detected;
        if (haveFolder)
```

Second, replace

```csharp
            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
```

with

```csharp
            readerClock.Start();
            detected = builder.DetectFromFiles(new[] { pick.SelectedPath });
            readerClock.Stop();
```

Third, replace

```csharp
        else detected = builder.Detect();
```

with

```csharp
        else
        {
            readerClock.Start();
            detected = builder.Detect();
            readerClock.Stop();
        }
```

Fourth, replace

```csharp
                result.Warnings.Distinct().Count(), result.SourceSha256, UserSession.Actor), key);
```

with

```csharp
                result.Warnings.Distinct().Count(), result.SourceSha256, UserSession.Actor), key);
        if (result.LevelsCreated + result.GridsCreated > 0)
        {
            // MA-1a item 8: the reader's build:run receipt — deterministic, so no model and no tokens.
            var receipt = new BuildReceipt.Facts { Seconds = readerClock.Elapsed.TotalSeconds, Candidates = detected.Levels.Count + detected.Grids.Count };
            receipt.Parameters["level_layers"] = result.LevelLayers.OrderBy(l => l).ToArray();
            receipt.Parameters["grid_layers"] = result.GridLayers.OrderBy(l => l).ToArray();
            receipt.Parameters["source_sha256"] = result.SourceSha256;
            GovernedNotify.Report("Datum receipt", BuildReceipt.Run("datum", BuildReceipt.AddinSha256, receipt, 0, new string[0], UserSession.Actor), key);
        }
```

- [ ] **Step 8: Promote's receipt.** A deterministic planner; one receipt per run that filed something, naming its changesets. In `SentinelAddin/Commands.PromoteWalls.cs`, make four replacements:

First, replace

```csharp
        var plans = PromotePlanner.Plan(classes, walls, others, levels, docTypes, classTypes, standards.Guideline);
```

with

```csharp
        var plannerClock = System.Diagnostics.Stopwatch.StartNew(); // MA-1a item 8: the planner's own time, for the receipt
        var plans = PromotePlanner.Plan(classes, walls, others, levels, docTypes, classTypes, standards.Guideline);
```

Second, replace

```csharp
            catch (Exception ex) { return ex.Message; }
        });
        var actor = UserSession.Actor;
```

with

```csharp
            catch (Exception ex) { return ex.Message; }
        });
        plannerClock.Stop();
        var actor = UserSession.Actor;
```

Third, replace

```csharp
            if (cs == null) failed.Add(err);
            else first ??= cs;
        }
```

with

```csharp
            if (cs == null) failed.Add(err);
            else { first ??= cs; filedIds.Add(cs.Id); }
        }
        if (filedIds.Count > 0)
        {
            // MA-1a item 8: the planner's build:run receipt for the run that filed these changesets — deterministic, so no
            // model and no tokens; its gaps are the elements it sent to a person.
            var receipt = new BuildReceipt.Facts { Seconds = plannerClock.Elapsed.TotalSeconds, Candidates = (classes.Contains("Walls") ? walls.Count : 0) + others.Count };
            receipt.Parameters["classes"] = classes.ToArray();
            receipt.Parameters["guideline"] = standards.GuidelineSource.Label;
            receipt.Parameters["lod_matrix"] = mxSource.Label;
            GovernedNotify.Report("Promote receipt", BuildReceipt.Run("promote", BuildReceipt.AddinSha256, receipt,
                plans.SelectMany(p => p.Held).Select(h => h.UniqueId).Distinct().Count(), filedIds, actor), key);
        }
```

Fourth, declare the list the third replacement fills: replace

```csharp
        ChangesetDto first = null;
        var failed = new List<string>();
```

with

```csharp
        ChangesetDto first = null;
        var failed = new List<string>();
        var filedIds = new List<string>(); // MA-1a item 8: the changesets this run filed, for its receipt
```

- [ ] **Step 9: Run.**
  - Both builds: `0 Error(s)`, warnings as on master.
  - `dotnet run --project tools/promote-check`: expect `384/384 checks pass` (10 new).
  - `ghost-p2-check` `103/103` and `ghost-standards-check` `146/146` (each with `ModelUsage.cs` in its project), `session-check` `47/47`, `massing-check` `14/14`.
- [ ] **Step 10: Commit.**

```bash
git add SentinelAddin/UI/ChangesetReviewWindow.cs SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs SentinelAddin/GhostBuilder/LocalVisionReader.cs SentinelAddin/GhostBuilder/MassingVisionReader.cs tools/ghost-p2-check/ghost-p2-check.csproj tools/ghost-standards-check/ghost-standards-check.csproj SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/Commands.Massing.cs SentinelAddin/Commands.Datum.cs SentinelAddin/Commands.PromoteWalls.cs tools/promote-check/Trust.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(ghost): an agent's element opens unticked and "not measured" in Review AI Proposals, and each reader or planner run posts its build:run receipt (MA-1a item 8)

The review pre-ticks by the bridge's decision (never a create) and shows the source as a claim. Ghost Builder, Photo
Massing, Datum and Promote each post one receipt for a run whose result was kept or filed: reader, the add-in's
sha256, tool licences, minutes, model calls, tokens when Ollama gave them, candidates, gaps. promote-check 384/384.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 12 — Drill data, graph, final checks (the merge follows the live drill)

**Files:**
- Create `demo/ghost-sample/ma1a-i68-guideline.json` — the drill's guideline, with a placement block
- Create `demo/ghost-sample/ma1a-i68-catalog-absent.json` and `demo/ghost-sample/ma1a-i68-catalog.json` — the drill's two type catalogues

Ghost's evidence reads only `.pdf`, `.txt`, `.md` and `.csv` (`GhostEvidence.cs:30`), so these files do not change what a build from `demo/ghost-sample` reads. The pilot's own files in `demo/bds-pilot` are not touched (founder decision F7).

- [ ] **Step 1: The drill's guideline.** It types nothing (no rules), so the drill's rows are typed by hand in the review, as MA1a-S2 and MA1a-I35 did. Its one view standard gives Annotate a floor plan per level to create (drill row I7-2). Its placement block names a workset the drill creates (`MA1_Walls`, `MA1_Datum`), one it never creates (`MA1_Missing`, for floors), and none for furniture. Doors, columns and ceilings go to `MA1_Walls` too, so that row I6-9 can settle whether each of those kinds takes a workset write straight after its creation (UNSURE 2; review amendment C16).

Create `demo/ghost-sample/ma1a-i68-guideline.json`:

```json
{
  "standard": "MA-1a items 6-8 drill guideline",
  "office": "drill",
  "elements": [
    { "category": "Walls", "rules": [] },
    { "category": "Floors", "rules": [] },
    { "category": "Furniture", "rules": [] }
  ],
  "views": [
    { "use": "GA Plan", "viewType": "FloorPlan", "namePrefix": "MA1" }
  ],
  "viewNaming": { "statusPrefixes": { "WIP_": "MA1 drill" } },
  "placement": {
    "worksets": {
      "Walls": "MA1_Walls",
      "Doors": "MA1_Walls",
      "Columns": "MA1_Walls",
      "Ceilings": "MA1_Walls",
      "Levels": "MA1_Datum",
      "Grids": "MA1_Datum",
      "Floors": "MA1_Missing"
    },
    "phase": "view"
  }
}
```

- [ ] **Step 2: The drill's catalogues.** The first lists only types no model holds: installed as `type_catalog@1`, it makes the office-template check refuse. The second adds `Generic - 200mm`, which the B35 drill model holds (B33): installed as `type_catalog@2`, it makes the check count `1 of 3`.

Create `demo/ghost-sample/ma1a-i68-catalog-absent.json`:

```json
{
  "template": { "title": "MA-1a items 6-8 drill template (no model holds these)" },
  "types": [
    { "category": "Walls", "family": "Basic Wall", "type": "MA1 Office Wall 300" },
    { "category": "Walls", "family": "Basic Wall", "type": "MA1 Office Wall 150" }
  ]
}
```

Create `demo/ghost-sample/ma1a-i68-catalog.json`:

```json
{
  "template": { "title": "MA-1a items 6-8 drill template" },
  "types": [
    { "category": "Walls", "family": "Basic Wall", "type": "MA1 Office Wall 300" },
    { "category": "Walls", "family": "Basic Wall", "type": "MA1 Office Wall 150" },
    { "category": "Walls", "family": "Basic Wall", "type": "Generic - 200mm" }
  ]
}
```

- [ ] **Step 3: The bridge accepts them.** From `WebApp`, run

```bash
node -e 'import("./bridge/artefact-store.mjs").then(m => { const j = f => JSON.parse(require("fs").readFileSync("../demo/ghost-sample/" + f, "utf8")); m.validateArtefact("guideline", j("ma1a-i68-guideline.json")); m.validateArtefact("type_catalog", j("ma1a-i68-catalog-absent.json")); m.validateArtefact("type_catalog", j("ma1a-i68-catalog.json")); console.log("valid guideline and catalogues") })'
```

and expect `valid guideline and catalogues`. Do not install them now: the drill installs them on its scratch project.
- [ ] **Step 4: Graph.** Run `graphify update .`. If it is not on PATH, record that in the merge message.
- [ ] **Step 5: Final checks.**
  - `promote-check` `384/384`, `roi-check` `50/50`.
  - `ghost-standards-check` `147/147` (master `146`: it parses every guideline file under `demo/`, so it now proves the drill's guideline installs).
  - `guideline-check` `17/17`, `ghost-p2-check` `103/103`, `session-check` `47/47`, `event-check` `44/44`, `heal-check` `9/9`, `massing-check` `14/14`, `wallpair-check` `9/9`, `annotate-check` `ALL PASS` and `datum-check` `DATUM OK`: as on master.
  - From `WebApp`, `npx vitest run bridge/`: expect `Test Files  83 passed (83)` and `Tests  1675 passed | 1 skipped (1676)`.
  - Both builds: `0 Error(s)`, with Revit 2024 at `5 Warning(s)` and Revit 2026 at `3 Warning(s)`.
- [ ] **Step 6: Commit.** The merge is not part of this task: it follows the live drill (review amendment C11 — the section "Merge" after the drill).

```bash
git add demo/ghost-sample/ma1a-i68-guideline.json demo/ghost-sample/ma1a-i68-catalog-absent.json demo/ghost-sample/ma1a-i68-catalog.json
git commit -F - <<'EOF'
docs(drill): MA-1a items 6-8 drill data — a guideline with a placement block, and two type catalogues for the office-template check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

## Live drill MA1a-I68 (Revit 2024, scratch copies only — on the branch, before the merge)

**Who does what.** The drill runner drives Revit. Two steps are the founder's, because they need a password: signing in (set-up) and signing out (closing list). If the founder is away, the drill runs signed out, and every row that needs a signed-in person is recorded as **owed** — never as passed.

**Owed before the first row** (named up front, so "not run" is never read as a pass — review amendment C15):
- **I7-9 Photo Massing**: no folder of building photos is on this PC. Massing's report, receipt, placement lines and office-template check stay owed until a drill with photos. Its design-option refusal is drilled (I6-5).
- **I7-5 fix-in-place**: no scratch project of this drill holds an open IDS issue with a value Sentinel can write. Owed unless the runner has one (the row says what to do then).
- **The design's set-up line "Blank project from the office template"** (`:1059`): the drill uses copies of the B35 model. A blank BDS-template project is owed; it also gives UNSURE 8 its second count.
- **A two-user row** for a workset owned by another user (UNSURE 5), and **one row on Revit 2026 or 2027** (D14, UNSURE 15).
- **A floor, a window and a roof on a named workset** (UNSURE 2): I6-9 places a wall, a door, a column and a ceiling; the drill's guideline sends floors to a workset the model lacks (for I6-4) and names none for windows and roofs.
- **Signed in or signed out**: whichever of the two the session did not run is owed for I7-1's actor, I7-7(c)'s limit and I8-3's pre-tick.

- **Contract 2 in full** (C33): the drill posts only bodies that carry a `place.TypeName`. A contract-2 post without one is answered 400 until bridge typing lands (MA-2); the record says so, so item 8 is not read as full contract 2.

The drill record ends with the list of owed rows, and each goes into the "owed" memory.

**Set-up (once):**
- **Build.** Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys the branch's build into Revit 2024 (the closing list says what stays deployed). Record `git rev-parse --short HEAD` and the deployed DLL's sha256 (`certutil -hashfile "<the deployed Sentinel.dll>" SHA256`, lower case): row I8-4 compares a receipt with it. Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
- **The add-in's bridge settings.** Before the first switch, copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.i68bak` beside it. The file holds the file token: never print it and never open it in a viewer.
- **The test bridge on 127.0.0.1:4101.** From `WebApp`:
  - Probe which settings `config/.env` holds (it prints names only, never a value; `config/.env` wins over the shell in `bcf-service.mjs`, `artefact-import.mjs` and `mcp-server.mjs` — `load-env.mjs:9`):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop. The test bridge cannot be moved to 4101 from the shell, and the drill does not edit `config/.env`; ask the founder.
  - Start it in the background, as MA1a-I35 ran it (event poll off): `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself** (review amendment C13). `BCF_BASE` is never relied on: if `config/.env` sets it, `artefact-import.mjs` and the MCP server would write to the founder's 4100 bridge whatever the shell says. Define this helper once in the drill's shell (it reads the token through `load-env.mjs` and prints the reply only; a path is given without its leading slash, so Git Bash does not rewrite it):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

    Used as `b4101 GET "cde/ma1a-i68/audit?limit=1"`, `b4101 POST changesets/ma1a-i68 @<a body saved to a file in the session's scratch folder>`, `b4101 PUT "cde/ma1a-i68/artefacts/guideline?actor=drill" @../demo/ghost-sample/ma1a-i68-guideline.json`.
  - Point the add-in at the test bridge: set `serviceUrl` in `%AppData%\Sentinel\bcf-config.json` to `http://127.0.0.1:4101` with a script that prints nothing of the file — `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`. Row I7-7(b) uses the same line with another address.
- **Scratch copies** (in `%USERPROFILE%\Documents\Sentinel drills`, each a copy on disk of `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt`, the B35 model):
  - `ma1a-i68-central.rvt` — open it, enable worksharing (Collaborate ▸ Collaborate ▸ Within your network) and save: the copy becomes the central in place (MA1a-I35: the file dialog refuses a typed name). Create two worksets, `MA1_Walls` and `MA1_Datum` (Collaborate ▸ Worksets ▸ New). Do **not** create `MA1_Missing`. Leave `Workset1` active.
  - `ma1a-i68-plain.rvt` — not workshared.
  - `ma1a-i68-unbound.rvt` — not workshared, and not bound: open it, Sentinel ▸ Project Setup, clear the Web project box, save the setting. Record that the pane reads "not bound" (review amendment C12).
  - **The B35 model already holds the five grids of `sample-grids.dxf`** (MA1a-I35 row I4-3: Datum "created nothing … kept"). Each Datum row below first deletes grids in its scratch copy, so Datum has something to create (C12).
  - Never open aster-tower, Demo, a pilot file or any founder file.
- **The scratch web projects.** Nothing is installed on `demo` or on any office, and no row of this drill is written to `demo`.
  - `b4101 POST cde/projects '{"key":"ma1a-i68"}'` (as B33 created `ma0-bds`), then:
    - `b4101 PUT "cde/ma1a-i68/artefacts/guideline?actor=drill" @../demo/ghost-sample/ma1a-i68-guideline.json`
    - `b4101 PUT "cde/ma1a-i68/artefacts/type_catalog?actor=drill" @../demo/ghost-sample/ma1a-i68-catalog-absent.json` — this is `type_catalog@1`; row I6-2 installs `@2`.
    - `b4101 GET cde/ma1a-i68/artefacts/guideline` shows `guideline@1` with its `placement` block.
  - `b4101 POST cde/projects '{"key":"ma1a-i68-bare"}'` — a project with no guideline, for row I6-7. Nothing is installed on it.
  - `ma0-bds` (B33's scratch project: the BDS ruleset with FN-01, the DD rule file, `type_catalog@1`) is used by rows I7-4 and I8-3. Its rows are listed in the record.
- **Bindings and sign-in.**
  - Bind `ma1a-i68-central.rvt` to `ma1a-i68` (Project Setup). `ma1a-i68-plain.rvt` is bound in its own rows.
  - Ghost source folder = `demo/ghost-sample`; Ollama running as in MA1a-S2.
  - **Sign-in (the founder's step — review amendment C14).** The founder signs in (Standards ▸ Sign in). Before that, make the account a contributor of the two projects the drill writes to as a person: `b4101 POST cde/ma1a-i68/members '{"email":"<the account e-mail>","role":"contributor"}'` and the same for `ma0-bds`; record both replies (the memberships stay; say so in the record). Signed in, the design's drill line "with the signed-in actor, within the report budget" (`:1067`) is run: the role check, the 256 KB cap and the 20-a-minute budget are in force only for a signed-in person (`cde-store.mjs:1072`).
  - If the founder is away: stay signed out. The actor then reads `unsigned — <Windows user>`; I7-1's actor clause, I7-7(c)'s limit and I8-3's ticked rows are **owed**, and the record says so.
- **Record before the first row:**
  - the model's phases (Manage ▸ Phases) and the Phase of the `GR-FFL` floor plan (Properties ▸ Phasing ▸ Phase) — expected `New Construction`;
  - the active workset — expected `Workset1`;
  - a loaded `OneLevelBased` furniture type (MA1a-S2's desk), loading one if the model has none;
  - element counts per category, from `analyze_model_statistics` (read-only) or a schedule;
  - whether the session is signed in.
- **Before each row, record** the last row id of `b4101 GET "cde/ma1a-i68/audit?limit=1"`. Keep the pane's Doctor log open: every report row answers there.
- **An element's id** (for Manage ▸ Select by ID): the last eight hex digits of its UniqueId in a changeset's result, read as a number, or the community MCP's read-only `get_selected_elements` / `get_current_view_elements`.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| I6-1 The office-template check refuses | On `ma1a-i68-central.rvt` (with `type_catalog@1`), run Ghost Builder ▸ `sample-plan-step2.dxf`. Then run Promote | Ghost: `Nothing was built — this model was not made from the office template: it holds none of the 2 office type(s) that type_catalog@1 · project · … lists in the guideline's categories. Start the project from the office template, then run this again — Sentinel never loads an unknown family.` No review window opens; no changeset is filed (the audit's last id is unchanged). Promote: the same sentence. The DWG import Ghost made stays in the model | both dialogs; the audit id; whether the import is listed under Manage Links |
| I6-2 Workset and phase, and the template count | Install `type_catalog@2`: `b4101 PUT "cde/ma1a-i68/artefacts/type_catalog?actor=drill" @../demo/ghost-sample/ma1a-i68-catalog.json`. In the `GR-FFL` plan, run Ghost Builder ▸ `sample-plan-step2.dxf` again. Tick and type A-WALL-EXT and A-WALL-INT (`Generic - 200mm`) and A-FURN (the desk) by hand; build level GR-FFL; Build | The summary shows, as lines of their own (not under "Warnings:"):<br>• `Office template: 1 of 3 office type(s) present (type_catalog@2 · project · …).`;<br>• `Worksets: N on MA1_Walls · 2 left on the active workset (the guideline names no workset for Furniture).`, N = the walls still in the model;<br>• `Phase: K element(s) set to "New Construction", the active view's phase (a level or a grid has no phase).`<br>If Revit removed an element at commit, N and K do not count it. Pick a new wall: Properties ▸ Workset = `MA1_Walls`, Phase Created = `New Construction`. Pick a desk: Workset = `Workset1`. The active workset is still `Workset1` | the three lines; one wall's and one desk's workset and phase; the Revit warning counts beside MA1a-I35's (UNSURE 7) |
| I6-3 The view's phase, and one Undo | Ctrl+Z the Ghost build. Duplicate the `GR-FFL` plan and set the copy's Phase to `Existing`; stay in it. Post the wall body below (`b4101 POST changesets/ma1a-i68 @<file>`). Review AI Proposals ▸ tick the wall ▸ Apply. Then Ctrl+Z | `Applied 1 element(s) …`, then `Worksets: 1 on MA1_Walls.` and `Phase: 1 element(s) set to "Existing", the active view's phase …`. The wall: Workset `MA1_Walls`, Phase Created `Existing`. One Undo entry; Ctrl+Z removes the wall and posts one `changeset_reverted` row | the dialog; the wall's two properties; the audit rows (UNSURE 6) |
| I6-4 A workset the model lacks | Post the floor body below. Review AI Proposals ▸ tick ▸ Apply | `Nothing was placed — the guideline's placement block names a workset this model does not have: "MA1_Missing". Create it (Standards ▸ Apply Standard, or Collaborate ▸ Worksets), then try again — Sentinel never creates a workset while placing, and never picks another.` then `The proposals are still pending …`. No floor exists; `b4101 GET changesets/ma1a-i68/<id>` still says `proposed`; no `MA1_Missing` workset was created | the dialog; the changeset's status; the workset list |
| I6-5 A design option is being edited (F3) | Record the count of CAD imports (Manage ▸ Manage Links ▸ CAD Formats). Manage ▸ Design Options: add an option set, and edit `Option 1` (Edit Selected). Then, in the option: (a) post the wall body again (y + 2000) and Apply it in Review AI Proposals; (b) run Ghost Builder; (c) run Datum from Drawings; (d) run Photo Massing. Then finish editing the option (Main Model) and Apply the wall of (a) | (a) `Nothing was placed — design option "Option 1" is being edited, and Sentinel never places into a design option. Switch to Main Model (Manage ▸ Design Options), then apply it again.` and `The proposals are still pending …`. (b) The same sentence ending `then run Ghost Builder again.` — **before the drawing picker opens**; the count of CAD imports is unchanged and nothing is filed (the audit's last id is unchanged). (c) The sentence ending `then run Datum from Drawings again.`, before any drawing is picked. (d) The sentence ending `then run Photo Massing again.`, before any image is read. Back in Main Model the wall applies, on `MA1_Walls`. No element is in `Option 1` (select all in the option: 0) | the four dialogs; the CAD import count before and after; the audit ids; the option's element count (UNSURE 4, 17) |
| I6-6 A model that is not workshared (F4) | Open `ma1a-i68-plain.rvt`, bind it to `ma1a-i68`, post the wall body again (y + 4000), and Apply it from a plan whose Phase is `New Construction` | `Applied 1 element(s) …`, then `Worksets: not set — this model is not workshared, so it has no worksets (the guideline names 7).` and `Phase: 1 element(s) set to "New Construction", …` | the dialog; the wall's phase |
| I6-7 No placement block: today's behaviour, said | Bind `ma1a-i68-plain.rvt` to `ma1a-i68-bare` (record `b4101 GET cde/ma1a-i68-bare/artefacts/guideline` → 404 `not_installed`). Post the wall body (y + 6000) to `changesets/ma1a-i68-bare` and Apply it | `Applied 1 element(s) …`, then `Placement: no placement block (the project's guideline has none, or no guideline is installed) — each element is on the active workset and in the phase Revit gave it, as before.` Record the wall's Phase Created: it is what Revit gives an element made through the API (UNSURE 1) | the dialog; the wall's phase |
| I6-8 Datum's levels and grids | Back on `ma1a-i68-central.rvt` (Main Model), in the `GR-FFL` plan: select one grid ▸ right-click ▸ Select All Instances ▸ In Entire Project ▸ Delete (accept Revit's warning about dimensions). Run Datum from Drawings ▸ `sample-grids.dxf` ▸ Yes. Then open any schedule and run Datum ▸ `sample-grids.dxf` once more | First run: `Created 0 level(s) and 5 grid(s) …` (G = 5, the drawing's grids; record the count shown), then `Worksets: 5 on MA1_Datum.` and `Phase: 0 element(s) set to "New Construction", the active view's phase (a level or a grid has no phase).` Pick a new grid: Workset `MA1_Datum`. Second run, from the schedule: every grid is kept, `Created 0 level(s) and 0 grid(s)`, `Worksets: no element was created.`, and the Phase line shows whether a schedule answers a phase — `Phase: 0 element(s) set to "…"` or `Phase: not set — the active view has no phase (a sheet, a legend) …`; record which (UNSURE 3). No second `datum` row | both dialogs; a grid's workset; which Phase line the schedule gave |
| I6-9 A door, a column and a ceiling take the workset and the phase (UNSURE 2, 3) | In the `GR-FFL` plan (Phase `New Construction`): post the I6-9 body below (a wall, a door in it, a column, a ceiling) and Apply all four. Then switch to the `Existing`-phase plan of I6-3, post the second I6-9 body (one more door in that wall) and Apply it | First: `Applied 4 element(s) …`, `Worksets: 4 on MA1_Walls.`, `Phase: 4 element(s) set to "New Construction", …`; each element's Properties show Workset `MA1_Walls` and Phase Created `New Construction`. If Revit refuses the workset write on a kind, the dialog is `Nothing was placed — Revit would not put <category> <id> on workset "MA1_Walls" (…)` and `The proposals are still pending …` — the changeset is still `proposed` (never declined): record the kind as finding F-I68-n. Second: record Revit's answer for a door given an earlier phase than its wall — placed with Phase Created `Existing`, or `Transaction failed and was rolled back: …` with Revit's reason (then the changeset is declined, as for any Revit failure), or `Nothing was placed — Revit would not set the workset or the phase of Doors <id> (…). The model is as it was.` with `The proposals are still pending …` (C29: Revit threw at the write — the changeset is still `proposed`) | each element's workset and phase; the second dialog word for word |
| I7-1 `GET /audit` lists one row per action, with the signed-in actor | After I6-2 and I6-8 (nothing is built again: an Undo does not remove a report row): `b4101 GET "cde/ma1a-i68/audit?entity_type=ghost_build"`, then `…entity_type=datum` | One `ghost_build` row, for I6-2's build: action `Ghost Builder placed N element(s) from sample-plan-step2 on GR-FFL`; `new_value.placed`, `wall_gaps`, `skipped`, `revit_warnings`, `types_added` equal the summary's; `changesets` are the build's ids. One `datum` row: `Datum from Drawings created 0 level(s) and 5 grid(s)`. Signed in: each row's `actor` is the signed-in e-mail. Signed out: `unsigned — <Windows user>`, and the actor clause is **owed**. The pane's Doctor log holds `Ghost Builder — Recorded: ledger #N · receipt …` and `Datum from Drawings — Recorded: …`. The refused runs of I6-1, I6-4 and I6-5 left no report row | the rows; the pane's lines; the actor (UNSURE 11) |
| I7-2 Annotate | Run Annotate on `ma1a-i68-central.rvt` | `Created: 5 view(s) across 5 level(s).` (one `WIP_MA1_<level>` plan per level). `…audit?entity_type=annotate`: one row, `Annotate created 5 view(s) across 5 level(s)`, `guideline` = the label the dialog shows. Run it again: `Created: 0`, `Skipped (already exist): 5`, and **no** second row | the dialog; the row; the unchanged count on the second run |
| I7-3 Apply Standard | **Run it last of the central's rows** (its build installs a ruleset on `ma1a-i68`, which later rows must not meet). On `ma1a-i68-central.rvt`: Standards ▸ Build Office System ▸ tick the worksets ▸ Build (B31-4's path). Then Build again at once | First: the dialog's `C created, S skipped, F failed`; `…audit?entity_type=apply_standard`: one row, `Apply Standard: C′ created, S skipped, F failed`, where C′ counts the model's creations only — no `Ruleset: installing …` entry among `created` — with the names (at most 50 each) and the totals. Second Build: every workset exists, so nothing is created in the model; the dialog may still show `Ruleset: installing …`; **no** second `apply_standard` row | both dialogs; the row; the unchanged row count |
| I7-4 ⚡ Fix (auto-fix) | Bind `ma1a-i68-plain.rvt` to `ma0-bds` (the BDS ruleset; B32-3 fixed a family name there by FN-01). Record `b4101 GET "cde/ma0-bds/audit?entity_type=auto_fix"` (the count before). Scan Now, and on a family-name row (FN-01) click ⚡ Fix ▸ Execute. If the pane offers no ⚡ Fix row: **owed**, said | The family is renamed; one new `auto_fix` row on `ma0-bds`: `Auto-fix FN-01: 1 <category> renamed`, with `old_name`, `new_name` and the element id; the pane log holds `Auto-fix FN-01 — Recorded: …`. A click on a REQUEST rule (a proposal, no rename) writes no `auto_fix` row | the row; the pane's line; the count before and after |
| I7-5 Fix-in-place | **Owed unless** a scratch project holds an open IDS issue with a value Sentinel can write. If one does: BCF Issues ▸ the issue ▸ Fix in place ▸ tick one value ▸ Apply | `…audit?entity_type=fix_in_place`: one row, `Fix-in-place <requirement>: 1 value(s) written, 0 not written`, with the issue's guid. The re-check's own referee row is there too, as before | the row, or "owed" |
| I7-6 The Doctor drill | On `ma1a-i68-central.rvt`. An off-axis wall is made by rotation, not by the mouse: draw a wall 5000 mm long along X, then Modify ▸ Rotate about its start point with a typed angle of `0.034°` (3 mm over 5 m). (a) With the Doctor's axis fix **off** (Project Setup, the default), make one such wall. (b) Turn the axis fix **on** (Project Setup), then make three such walls within one minute. Wait 70 s. (c) Run a Ghost build that raises a warning | (a) Revit's "slightly off axis" warning stays (Manage ▸ Review Warnings lists it); the pane logs `Seen: … — left in the model`; no `doctor` row follows. (b) The pane logs `Sentinel resolved 1 in "…" with Revit's own fix …` three times; after the minute, **one** line `Doctor — Recorded: ledger #N …`; `…audit?entity_type=doctor`: **one** row, `Doctor: 3 warning(s) resolved with Revit's own fix in 1 kind(s) of transaction`, `resolved` 3, `window_seconds` 60, three element ids. The three walls are on axis. (c) The Doctor logs nothing for Sentinel's own build transaction (its warnings are counted in Ghost's summary) | the pane's lines; the row; the Review Warnings list; the angle that raised the warning (UNSURE 13) |
| I7-7 Not bound, not reachable, and the budget | (a) Open `ma1a-i68-unbound.rvt`, delete its grids as in I6-8, and run Datum ▸ `sample-grids.dxf`. (b) On the central, set `serviceUrl` to `http://127.0.0.1:4199` (nothing listens there), delete one of I6-8's grids and run Datum ▸ `sample-grids.dxf` again; set `serviceUrl` back to `http://127.0.0.1:4101`. (c) `b4101 GET "cde/ma1a-i68/audit?since=<the drill's start>&limit=1000"`: count the report rows per minute | (a) `Created 0 level(s) and 5 grid(s)`, then the no-block line (a model that is not bound has no guideline); the dialog opens as fast as before; the pane logs `Datum from Drawings — Not recorded on the web: This model is not bound …`, and the same for `Datum receipt`. (b) The dialog opens without a felt wait (a refused connection answers at once; record the wait). The guideline was read earlier in this session, so its cached copy places the grid: `Worksets: 1 on MA1_Datum.`; the pane then logs `Datum from Drawings — Not recorded — the bridge did not answer`, and the same for its receipt. If no cached copy exists, the dialog is `Nothing was placed — the project's guideline could not be read (bridge unreachable …), so its placement block is unknown. …` and no grid is created (F15) — record which of the two happened; the no-block line here is a failure. (c) No minute holds more than 20 report rows of one user, and no pane line reads `Not recorded — HTTP 429`. The limit is in force only for a signed-in person: signed out, (c) is **owed** | the pane's lines; the feel of (a) and (b); the busiest minute's count (UNSURE 12, 16) |
| I7-7d A project the bridge does not have yet (C30) | On a fresh copy of `ma1a-i68-unbound.rvt`, bind the model to a key the test bridge has no project for (`ma1a-i68-new`), delete its grids as in I6-8, and run Datum ▸ `sample-grids.dxf` | `Created 0 level(s) and 5 grid(s)` and the no-block line; never `Nothing was placed — the project's guideline could not be read` | the dialog word for word |
| I7-8 The ROI dashboard counts the fixes | Open the ROI dashboard twice: on `ma1a-i68-central.rvt` (`ma1a-i68`), and on `ma1a-i68-plain.rvt` bound to `ma0-bds` | Each: seven lines; the last `Not counted: CDE intercepts, MEP voids, BCF export, clash views — they write no ledger row`. The sixth on `ma1a-i68`: `Fixes on the ledger, not priced: 0 auto-fix(es) · F fix-in-place value(s) written · 3 Doctor resolution(s)` (F = 0 unless I7-5 ran there). The sixth on `ma0-bds`: `… A auto-fix(es) · …`, A = the count of `auto_fix` rows read after I7-4 | both windows' lines |
| I7-9 Photo Massing | **Owed** (no photos on this PC). With a folder of building photos: build a massing | `…audit?entity_type=massing`: one row, `Photo Massing placed N element(s)`; a `build` row with `reader` `photo-massing`; the summary's placement and office-template lines | "owed", or the rows |
| I8-1 An agent post with `pretick: true` and `within_tolerance` | Post the I8-1 body below (`b4101 POST changesets/ma1a-i68 @<file>`). Read the 201 reply. Then Review AI Proposals | The reply: `elements[0].pretick` is `false`; `elements[0].accuracy` is `{"status":"not_measured"}`; `claimed` is `true`; `ignored` lists `elements[0].pretick` and `elements[0].accuracy` with `ignored: set by the bridge`, `elements[0].measured` with `ignored: no survey job the bridge ran backs it — accuracy.status is not_measured`, and `elements[0].place.pretick` with `ignored: set by the bridge`; the stored `place` has no `pretick`. In the review: the header reads `Proposed by agent (claimed — the bridge records who a changeset says it is from, and cannot verify it) · adjudication: …`; the wall's row is **unticked** and ends `· not measured`; "Tick suggested" leaves it unticked. Ticked by hand, it applies | the reply; a screenshot of the review; the result |
| I8-2 The MCP tool never files as the add-in | From `WebApp`, run the I8-2 command below: it calls `sentinel_propose_changeset` twice — with `source: "promote"`, and with `source: { "reader": "promote" }` — through a `fetch` that sends every request to `http://127.0.0.1:4101` | Both stored changesets: `source` `agent`; `claimed` true; the wall's `pretick` false. Each `changeset_proposed` row carries `claimed: true` and `ignored: 0`. Decline both in Review AI Proposals afterwards | the two printed lines; the audit rows |
| I8-3 Promote's own operations, and the first real template count | Bind `ma1a-i68-plain.rvt` to `ma0-bds` (as in I7-4). Run Promote, file, and look at the review | The header holds `Office template: N of M office type(s) present (type_catalog@1 · …)`: record N and M — the first real count for founder decision F5 (UNSURE 8). Signed in: the attach rows, and the retype rows with a `type_before`, open **ticked** (the bridge's `pretick: true`). Signed out: they open **unticked** (F14: the machine credential earns no pre-tick), and "Tick suggested" ticks none. Record which case ran; the other is **owed**. The header marks the source as claimed. A `build` row with `reader` `promote` names the filed changesets, with `model_calls` 0 | the review; N and M; the receipt |
| I8-4 The receipts | After I6-2 and I6-8: `b4101 GET "cde/ma1a-i68/audit?entity_type=build"` | One row for I6-2's Ghost build: action `build:run`; `new_value.reader` `ghost-builder`; `claimed` `true`; `addin_sha256` = the deployed DLL's sha recorded at set-up; `minutes` and `seconds` above 0; `candidates` = the drawing's elements; `gaps` = the summary's wall and type gaps; `changesets` = the build's ids; `tools` hold the Revit API (and Ollama when `model_calls` > 0); each `weights` entry has `licence: null` with its note; `tokens` is either `{prompt, output}` or `null` with `tokens_note` — record which (UNSURE 10). One row for I6-8's Datum run: `reader` `datum`, `model_calls` 0, `tokens` null, `tokens_note` `no model was called: this run is deterministic`. No prompt, no file content and no path in either | both rows; which token case held |
| I8-5 A receipt cannot be forged or unmarked | `b4101 POST cde/ma1a-i68/audit '{"entity_type":"naming","action":"build:run","new_value":{}}'`, then `b4101 POST cde/ma1a-i68/audit '{"entity_type":"build","action":"x","new_value":{"reader":"fake","claimed":false}}'` | The first: 400 `build: rows are receipts (entity_type "build") — nothing was saved`. The second: 201, stored with action `build:run` and `claimed: true` — a receipt is always the caller's claim | both replies |
| I8-6 The machine credential earns no pre-tick by writing `promote` (C2) | Read the UniqueId of I6-9's wall from its changeset's result (`b4101 GET changesets/ma1a-i68/<id>`). Post the I8-6 body below with that id (`b4101` sends the machine credential). Open Review AI Proposals, look, and decline it | The reply: `source` `promote`, `claimed` `true`, `elements[0].pretick` **false**. In the review the attach row opens **unticked** | the reply; the review |

I6-3 wall body (`Generic - 200mm` is a basic wall type in the copy, per B33). Move the line 2000 mm in Y for each later post, so the walls do not overlap:

```json
{ "name": "MA1a item 6 — one wall", "source": "agent",
  "elements": [
    { "kind": "wall", "validate": { "identity": { "Class": "IfcWall", "Name": "I6 wall" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40000, 0, 0], "end": [44000, 0, 0] } } } ] }
```

I6-4 floor body (`TypeName` must be a floor type in the copy; record the one used):

```json
{ "name": "MA1a item 6 — one floor", "source": "agent",
  "elements": [
    { "kind": "floor", "validate": { "identity": { "Class": "IfcSlab", "Name": "I6 floor" } },
      "place": { "TypeName": "Generic 150mm", "LevelName": "GR-FFL", "LocationLoop": [[40000, 10000, 0], [44000, 10000, 0], [44000, 14000, 0], [40000, 14000, 0]] } } ] }
```

I6-9 bodies. Each `FamilyName` and `TypeName` must be loaded in the copy — the door's and the ceiling's are in the B35 model (its seed used them); load `M_Rectangular Column` from the Revit library if the model has no column family — and the ones used are recorded. First, the four kinds:

```json
{ "name": "MA1a item 6 — a wall, a door, a column, a ceiling", "source": "agent",
  "elements": [
    { "kind": "wall", "validate": { "identity": { "Class": "IfcWall", "Name": "I6-9 wall" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40000, 30000, 0], "end": [46000, 30000, 0] } } },
    { "kind": "door", "validate": { "identity": { "Class": "IfcDoor", "Name": "I6-9 door" } },
      "place": { "FamilyName": "Door-Interior-Single-Flush_Panel-Wood", "TypeName": "MA1 915 x 2134mm", "LevelName": "GR-FFL", "Location": [42000, 30000, 0] } },
    { "kind": "column", "validate": { "identity": { "Class": "IfcColumn", "Name": "I6-9 column" } },
      "place": { "FamilyName": "M_Rectangular Column", "TypeName": "610 x 610mm", "LevelName": "GR-FFL", "Location": [48000, 30000, 0] } },
    { "kind": "ceiling", "validate": { "identity": { "Class": "IfcCovering", "Name": "I6-9 ceiling" } },
      "place": { "TypeName": "Generic", "LevelName": "GR-FFL", "Boundary": [[40000, 32000], [44000, 32000], [44000, 36000], [40000, 36000]], "Offset": 2700 } } ] }
```

Second, one more door in that wall, applied from the `Existing`-phase plan:

```json
{ "name": "MA1a item 6 — a door in a wall of a later phase", "source": "agent",
  "elements": [
    { "kind": "door", "validate": { "identity": { "Class": "IfcDoor", "Name": "I6-9 door, Existing view" } },
      "place": { "FamilyName": "Door-Interior-Single-Flush_Panel-Wood", "TypeName": "MA1 915 x 2134mm", "LevelName": "GR-FFL", "Location": [44500, 30000, 0] } } ] }
```

I8-1 agent body:

```json
{ "name": "MA1a item 8 — an agent's wall", "contract": 2, "source": "agent",
  "elements": [
    { "kind": "wall", "pretick": true, "accuracy": { "status": "within_tolerance" }, "measured": { "thickness_mm": 203 },
      "validate": { "identity": { "Class": "IfcWall", "Name": "I8 wall" } },
      "place": { "TypeName": "Generic - 200mm", "LevelName": "GR-FFL", "LocationCurve": { "start": [40000, 20000, 0], "end": [44000, 20000, 0] }, "pretick": true } } ] }
```

I8-2 command (from `WebApp`; `callTool` takes its `fetch`, and this one sends every request to the test bridge whatever `BCF_BASE` says):

```bash
node -e 'import("./bridge/mcp-server.mjs").then(async m => { const to4101 = (u, o) => fetch(String(u).replace(/^https?:\/\/[^/]+/, "http://127.0.0.1:4101"), o); for (const source of ["promote", { reader: "promote" }]) { const r = await m.callTool("sentinel_propose_changeset", { project: "ma1a-i68", name: "I8-2 " + JSON.stringify(source), source, elements: [{ kind: "wall", validate: { identity: { Class: "IfcWall", Name: "I8-2 wall" } }, place: { TypeName: "Generic - 200mm", LevelName: "GR-FFL", LocationCurve: { start: [40000, 24000, 0], end: [44000, 24000, 0] } } }] }, { fetch: to4101 }); console.log(JSON.stringify(source), "->", r.source, "claimed", r.claimed, "pretick", r.elements.map(e => e.pretick)); } })'
```

I8-6 body (`unique_id` = the UniqueId of I6-9's wall; the two levels are the copy's own):

```json
{ "name": "MA1a item 8 — a direct post that says promote", "source": "promote",
  "elements": [
    { "kind": "wall", "op": "attach", "target": { "unique_id": "<the UniqueId of I6-9's wall>" },
      "validate": { "identity": { "Class": "IfcWall", "Name": "I8-6 attach" } },
      "place": { "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" } } ] }
```

One row on a newer Revit (design D14): if Revit 2026 or 2027 is used for a row, repeat I6-2 there on a fresh copy and record it; otherwise the 2026 row is owed (it is in the list above).

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA1a-I68, with gaps named F-I68-n, each fixed on the branch, and the list of **owed** rows at its end. Then (review amendment C28):
- close Revit without saving the scratch copies;
- the founder signs out (Standards ▸ Sign out), if the session was signed in;
- stop the test bridge on 4101;
- restore the add-in's bridge settings by copying `bcf-config.json.i68bak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only) and delete the backup;
- the Ghost source folder and the Doctor's axis fix are document settings of the scratch copies, which were not saved; say so;
- say which add-in build is deployed in Revit 2024: the branch's, when the merge follows at once; master's again (`git checkout master`, the same `dotnet build`) when the drill failed or the merge waits;
- list what the drill left on the shared ledger: the scratch projects `ma1a-i68` and `ma1a-i68-bare` (an installed artefact version cannot be taken back), the memberships added for the sign-in, and the rows written to `ma0-bds` (I7-4's `auto_fix`, I8-3's changesets and receipt).

## Merge (after the drill — review amendment C11)

MA1a-I35 was drilled on its branch and merged afterwards; this plan does the same. The Revit half of item 6 is proven only by the drill, and a drill answer can change the design (UNSURE 2, 3 and 4). Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-I68-n fix is committed on the branch, and Task 12 Step 5's checks were run again after the last fix;
- UNSURE 4 held (the design-option refusal works). If it did not, founder decision F3 goes back to the founder, and nothing is merged until it is answered.

```bash
git checkout master
git merge --no-ff feature/ma1a-items6-8 -F - <<'EOF'
Merge feature/ma1a-items6-8: MA-1a items 6-8 — the guideline's placement block (workset per category, the view's phase, never a design option) applied by every placer, and the office-template check; one ledger row per run of Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, auto-fix, fix-in-place and the Doctor, counted by the ROI dashboard; build:run receipts for each reader and planner run, and contract 2's trust rules (the bridge sets pretick, accuracy and claimed; a posted one is "ignored: set by the bridge"). Not full contract 2: a post still needs place.TypeName until bridge typing lands (MA-2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment note:** the bridge first, then the add-in. Restart the main bridge on the merged code before the new add-in is used against it. What a bridge still on the old code answers depends on who posts (on master `recordNote` checks the role before the type, `cde-store.mjs:1075`):
- a signed-in contributor's report or receipt: 403 `a note on the ledger is a lead's (you are contributor) — nothing was saved` (the pane says `Not recorded — HTTP 403 …`);
- a signed-in lead's or owner's: 400 `a signed-in caller writes notes only …`;
- a signed-out PC, with the file token: the row is **written**, as posted — a receipt without the bridge's `build:run` wording check and without its `claimed` mark.

No command is blocked in any of the three. An old bridge also stores changesets with no `pretick`: the new add-in is safe against it for the review — a create is never pre-ticked whichever bridge answers. Restarting the founder's bridge (`tools/bridge-start.cmd`) is the founder's step; a running bridge is not restarted by that script unless told to (its own hint says how).

## UNSURE facts this drill settles

1. What does Revit give an element created through the API when nothing is set: the active workset, and which phase — the active view's or the model's last? (I6-7, and the desks of I6-2.) It decides what "as before" means in the no-block line; the line makes no claim either way.
2. Is `ELEM_PARTITION_PARAM` writable on each kind straight after its creation, in the same transaction, on Revit 2024: a wall (I6-2), a level and a grid (I6-8), a hosted door, a column, a ceiling (I6-9)? A refusal reads `Nothing was placed — Revit would not put <category> <id> on workset "…" (…)`, rolls the batch back and leaves the changeset proposed. It matters: in a workshared office model an unwritable kind would refuse every batch that holds one. Not drilled, and owed: a floor (the drill's guideline sends floors to a workset the model lacks, for I6-4), a window and a roof.
3. Can `CreatedPhaseId` be set in the same transaction as the create, and do `HasPhases()` and `ArePhasesModifiable()` answer false for a level and a grid? (I6-2, I6-3, I6-8.) Does a schedule answer `VIEW_PHASE` — its Phasing group has a Phase — so that a run started from one sets that phase? (I6-8's second run records which Phase line appears; the "no phase" sentence names only a sheet and a legend.) And a door placed in a wall of a later phase than the view's: Revit is expected to raise an error, which rolls the changeset back with the reason (I6-9's second post records Revit's answer).
4. Does `DesignOption.GetActiveDesignOptionId` report the option while it is being edited, when the executor runs from an ExternalEvent? (I6-5.) If it answers "none", the row fails and names it: the refusal cannot be built on this call, founder decision F3 goes back to the founder, and nothing is merged until it is answered (the Merge section).
5. What happens when the named workset is owned by another user or is closed? Not drilled (one user). Expected: Revit refuses the parameter write — `PlacementRefused`: the batch rolls back and the changeset stays **proposed**, so it can be applied again once the workset is free (review amendment C5) — or raises a failure at commit, which rolls back and declines as any Revit failure does. Owed: record it when a two-user drill runs.
6. Does one Ctrl+Z still remove the element with its workset and phase writes, and does the undo watcher still post `changeset_reverted`? (I6-3.)
7. Do the two writes raise new Revit warnings (walls joined across worksets or phases)? (I6-2: the warning counts beside MA1a-I35's S2 and I3 rows.)
8. How many of the office's types does a real office project hold — a blank project from the BDS template, and aster-tower — against the BDS catalogue's 1,434? The drill reads the first real count: Promote's header on the B35 model bound to `ma0-bds`, against its `type_catalog@1` (I8-3). A blank BDS-template project and aster-tower are owed (no pilot file is opened here). It is the number founder decision F5 needs before a share (option C) can be chosen.
9. Does Ghost Builder place a hand-picked type when the guideline has an element block with no rules? (I6-2.) If its walls come out as gaps instead, add one rule to the drill's guideline in a scratch copy, install it as `guideline@2`, and record it.
10. Does Ollama's non-streaming `/api/generate` reply carry `prompt_eval_count` and `eval_count` when a JSON-schema `format` is set, for the text model and for llava? (I8-4.) Either answer is designed for: counts, or `null` with the note.
11. Does a pane line logged from a pool-thread continuation through `BeginInvoke` appear in the Doctor log while Revit is idle and while a dialog is open? (I7-1; the Doctor's flush in I7-6.)
12. Does a real session stay inside 20 reports a minute per user — a Ghost build (two rows), fast ⚡ Fix clicks, a Doctor flush? (I7-7c.) A 429 writes nothing and reads `Not recorded — HTTP 429: too many revit reports …` in the pane (E16); the row is lost, not retried. The limit is in force only for a signed-in person: signed out, this is owed.
13. Does Revit raise "Line is slightly off axis" for a wall 3 mm off over 5 m, and offer its resolution to a failures preprocessor? (I7-6.) If not, record the offset that does.
14. Does the add-in pick up `type_catalog@2` after `@1` in the same Revit session (the cache's `If-None-Match`)? (I6-2.) If it still reads `@1`, restart Revit and record it.
15. Do Revit 2026 and 2027 behave the same for the workset and phase writes? Only a run settles it (D14's row).
16. How do Datum and Review AI Proposals feel when the bridge does not answer — the guideline read waits up to 4 s before the block is known? (I7-7b.) If it is felt, the fix is a cached read first (Next).
17. Does `DesignOption.GetActiveDesignOptionId` answer the option being edited at the top of an external command too (Ghost Builder, Datum, Photo Massing), as well as inside an ExternalEvent? (I6-5 b–d: the refusal comes before the drawing picker, and no CAD import is added.)

## Risks

- **An agent's accepted element is no longer pre-ticked (F11).** A reviewer who relied on "Tick suggested" for an agent's creates now ticks them by hand. This is the design's rule, and the change is deliberate.
- **The source is a claim (E11).** The machine credential earns no pre-tick, whatever source it writes (C2), and the MCP tool never files as `promote` or `dwg` in any shape (C1). A signed-in contributor who posts directly with `source: "promote"` still has retype and attach rows pre-ticked: a verified person, named on the ledger, and a person still clicks Apply. Every changeset is marked `claimed`. Closing it needs a Promote plan the bridge can check (MA-2's `promote/plan` route).
- **Promote on a signed-out PC opens unticked (F14).** The price of the line above: the bridge cannot tell a signed-out add-in from any other holder of the file token. "Tick suggested" then ticks none; the person ticks by hand, or signs in.
- **No placing while the guideline cannot be read (F15).** In a bound model with no cached guideline, Datum, Ghost Builder, Photo Massing and Review AI Proposals refuse while the bridge is unreachable. With a cached copy they place by it.
- **A wall in a design option can still be retyped or attached by an agent's changeset.** `ChangesetExecutor.Unsafe` tests the design option for floors, roofs, ceilings, doors and windows, not for walls (MA-0's checks). Promote's planner holds such a wall; an agent's changeset is not held. It predates this plan, and item 6 covers created elements only. In Next.
- **The report rows are a person's own report.** A signed-in contributor can post a `datum` or `auto_fix` row with counts nobody witnessed: the work happened in Revit, so no bridge route can write the row from the act (`cde-store.mjs:1046`). The row carries the verified actor; the ROI line takes at most 100,000 from one row (C24).
- **Datum may ask for a workset it will not use (E4).** A run whose levels all exist already is still refused when the block's Levels workset is missing.
- **The machine credential skips the report limits.** A signed-out PC with the file token writes the new report types with no role check, no size cap and no budget, as it does `naming` and `family_heal` today (`recordNote`'s service path). A receipt is still worded and marked by the bridge. This predates the plan; H4 moved people to sign-in. A drill that runs signed out therefore does not exercise the limits: those rows are owed (I7-1, I7-7c).
- **Deploy order.** A bridge that was not restarted refuses a signed-in contributor's new report or receipt with a 403 and a lead's with a 400 (the pane says `Not recorded — HTTP 403 …` or `… 400 …`; nothing is blocked); from a signed-out PC it writes the row as posted, a receipt without the `claimed` mark. It stores changesets without `pretick`. The add-in still never pre-ticks a create (E13).
- **No placing into a design option (F3).** Under A, a person working in an option must switch to Main Model. Nothing else in Sentinel places into options either.
- **The office-template check stops only at zero (F5).** A model made from another template that happens to hold one office type passes with "1 of N". The count is on screen; the per-element type check still refuses each missing type.
- **A refused Ghost build leaves its DWG import.** The template check runs after the standards load, and the import is made before that (as for every other refusal of that command).
- **A phase conflict rolls a changeset back.** A door given an earlier phase than its host wall is expected to fail in Revit; the changeset is then declined with Revit's reason (UNSURE 3). Before, it would have been placed in Revit's default phase.
- **A wait before placing (E6).** Datum and Review AI Proposals read the guideline first; a bridge that does not answer costs up to 4 s there (UNSURE 16), and then the cached copy places — or, with none, the run is refused (F15). The reports and receipts never wait.
- **The Doctor's window (F12).** A minute still open when Revit closes is lost. Two open models bound to the same project share one window and one row. A resolution that the person then undoes stays in the row: the row says what the Doctor did.
- **An Undo after a report is not tracked.** Only changesets have `changeset_reverted`. A `datum`, `annotate`, `auto_fix` or `fix_in_place` row says what was done, not what remains.
- **A throttled report is lost.** A 413 or a 429 on a report reads `Not recorded — HTTP 429 …` in the pane (E16) and is not retried: a busy minute of ⚡ Fix clicks past the budget leaves rows unwritten, and the ROI line then undercounts by them. Retrying is in Next.
- **The ROI dashboard reads three more kinds.** Up to 15 more GETs on a large ledger; they are read one after the other (the dashboard's own `ponytail` note says when to parallelize).
- **Weights' licences are not read (F13).** The design's licence rule is met for tools and stated as unmet for weights in every receipt.
- **A receipt exists only for a kept run (F10).** A reader run the person cancels at the review leaves no row.
- **`Levels` and `Grids` are now category keys (E3).** A ruleset rule scoped to those two keys is matched by `BuiltInCategory` instead of by the localized name. On an English Revit nothing changes.
- **The `ignored` list is new in every reply (E12).** A client that compared the whole reply body sees two new fields (`claimed`, `ignored`) and two on each element (`pretick`, `accuracy`). The add-in and the MCP tool read by name.

## Next (out of scope here)

- MA-1b: GHB-1 (DWG door blocks hosted, rotated and snapped), MAS-4, and drill MA1b.
- Contract 2's other fields and operations: `typing`, `confidence`, `lod`, `won`, `conflicts`, `set_parameter`, `rehost`, `create_room` (MA-2 and later). Until then a posted one is listed under `ignored`. `cid` and `evidence` are kept from now; showing and using them is the web desk's (MA-3).
- Survey jobs (MA-4): `measured` backed by `source.job_id`, a status other than `not_measured`, and a receipt the bridge can verify (`claimed: false`).
- D19's bridge-side marks: warn before review, and never pre-tick a BLOCK breaker unless its `set_parameter` rows are in the batch. The bridge has no model facts to judge a BLOCK rule yet, and every create is already unticked.
- A source the bridge can verify (MA-2's `promote/plan`, or an add-in credential), so `claimed` can be false for Sentinel's own readers.
- Weights' licence and digest from Ollama (`/api/show`, `/api/tags`), and `tools/licence-check` (F13 B).
- Placing into a design option by the person's own pick (F3 B); a phase named by the guideline (F6 B); a share for the office-template check (F5 C).
- The pilot's placement block: `demo/bds-pilot/bds-guideline.json` version 4 with the WS-01 workset names, once the office confirms them (F7 B).
- Pricing the three fix counts: `ROI_KINDS`, `RoiMoney` and a new `roi@n` (F8 B).
- `LedgerResult`: a 413 and a 429 as "not recorded" on the other routes, once each route's refusals are checked (E16); and a retry for a throttled report.
- The design-option and group tests of `ChangesetExecutor.Unsafe` for walls too, so an agent's changeset cannot retype or attach a wall in an option.
- Datum's workset pre-check by what will be new, not by what the drawing holds (E4).
- The rest of XC-5: change requests, clash views, BCF export, IFC Pre-Flight, Sanitize, MEP voids, project binding.
- The BLOCK check for Datum (F8 of the items 3–5 plan, listed there "with item 7": it is its own step, not a report) and for Photo Massing (with MA-6).
- MA-6: Photo Massing onto the executor.
- A receipt for a reader run the person cancels (F10 B), and a cached guideline read before the bridge is asked (UNSURE 16).
- The Project Setup "Revit template path": still read by nothing.
- A ceiling height in the placement block: the items 3–5 plan listed it under item 6; the design's item 6 does not, and step 2's F7 rule (the drawing's Z) stays.
- `ChangesetExecutor.cs` is still in no check project. Its decisions are pure (`WallTop`, `ProvenanceStamp`, `BlockCheck`, `PlacementGeometry`, `PlacementPolicy`); its Revit half is drilled.
