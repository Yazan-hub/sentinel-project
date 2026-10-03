# MA-2a — Layer-free guideline rules, the wider catalogue harvest, bridge typing (full contract 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three things change, the first slice of MA-2:
- **Rules without a layer.** A guideline rule may name no DWG layer and match on what the element *is*: its `Function` (the type's), its `Location` — inside or outside, read from the storey's own walls (the outer boundary) — and its `Material` (its build-up), as `when.params`, spelled the same in TS and C#. Promote passes them for every wall it plans, Ghost Builder for every wall it draws, and a one-type storey (every concept wall on one generic type, which MA-0 held whole because its Function told nothing) now types by location — while a wall whose location cannot be read goes to a person with that reason, never a guess. A lead writes such rules into the office guideline; the DRAFT DD file `demo/bds-pilot/bds-dd-layerfree-guideline.json` and the drill's Ghost guideline are the first two.
- **The wider harvest.** Build Office System's catalogue row keeps the type's `Function` (0 of 1,434 BDS rows carried it: the old read was `AsString()` on an Integer), its `Material` (its Material parameter, else its build-up's layers), the type parameters the LOD matrix will ask for, and — beside the category name — its `BuiltInCategory` (`bic`, BOS-5), so a catalogue harvested on a German Revit still answers for "Walls". A lead installs the catalogue on the office from the review window (BOS-3): one button, the PUT off the API thread, the bridge's role check, the window's words. A `type_catalog@1` installed before this reads exactly as it did.
- **Bridge typing — full contract 2.** `POST /changesets/:key` accepts a create or retype without `place.TypeName` when the project's `guideline@n` and `type_catalog@n` let the bridge type it: the element posts `facts {thickness_mm?, params?: {Function?, Location?, Material?, …}}`, the bridge resolves them with the same resolver the add-in mirrors, fills the type (and a door's or window's family) from the catalogue only, records who typed it and from what in `typing`, and otherwise answers 400 saying exactly what is missing. The trust rules of MA-1a item 8 stay; a bridge-typed element is never pre-ticked for that. The design's contract-2 example body is answered 201 with its facts (spec amendment S2 says what differs and why).

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` — MA-2 (`:1074-1099`), its "Rules without a layer" and "wider catalogue harvest" bullets (`:1081-1082`), the artefact table (`:273-274`), the operations table (`:321-324`), the outer-boundary sentence (`:336`), the contract-2 body and what the bridge adds (`:681-735`), bridge typing (`:1125`, listed under MA-4 and taken here — spec amendment S1). The audit's rows BOS-3 (`docs/strategy/2026-09-30-revit-addin-audit.md:812`) and BOS-5 (`:814`, `:1064`). The items-6–8 plan's amendment C33 (`docs/superpowers/plans/2026-10-02-ma1a-items6-8-placement-reports-receipts.md:129`): "a contract-2 post still needs place.TypeName until bridge typing lands (MA-2)" — this plan closes it. Base: master `bb363de`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:**

*One spelling, one fixture.* The matcher on both sides already supports a rule with no layer (`when.params` only); nothing in the resolver's logic changes. What changes is the INPUT: the readers pass `Function`, `Location` and `Material` as params, and the parity is pinned by data — `guideline-layerfree.test.ts` resolves 17 inputs through the TS resolver over the new DD file and writes `WebApp/src/sentinel-core/fixtures/guideline-layerfree-cases.json`; `tools/promote-check` reads the same file into the C# `GuidelineMatcher` and demands 17/17; `bridge/sentinel-core-bundle.test.mjs` resolves the same cases through the committed bundle `bridge/sentinel-core.mjs` and holds it to the TS source, so a bundle that was not rebuilt fails a test in the suite that runs on every commit. The values are spelled once: `Function` = the WallFunction enum NAME (`Exterior`, `Interior`, …; never the localized value string), `Location` = `Exterior` | `Interior` (the same two words as `Function`, so a lead reads one vocabulary; no reader in this plan passes a Location for a door — that is under Next, with bridge typing of doors), `Material` = the build-up's material names, finish layers first, joined ` / `. The fixture rows also carry `matched` (the conditions the winning rule stated), so the C# `Matched` is held to the TS `matched` by data too (review C9).

*The outer boundary (`WallLocation`, pure C#).* Inside or outside is read from the storey's own walls, whatever their types (an office type, a structural wall, a curtain wall enclose as a concept wall does). A wall is **Exterior** when exactly one of its two sides looks out — from a point just beyond that face (half the width plus 100 mm), a ray away from the wall or along it either way meets no other wall of the storey — while the other side is enclosed in all three directions; **Interior** when both sides are enclosed; otherwise **unknown with its reason** (both sides open: a free-standing wall or a storey whose walls do not close; fewer than three other walls; a curved wall; a wall under 500 mm). An unknown location is left out of the params, so a rule that needs it cannot fire, and the hold names why. Ceilings, stated: a wall facing a closed inner courtyard reads Interior; a ray that escapes through a gap in a wall drawn in pieces (GHB-6) reads that side as open. Promote feeds it the storey's walls and, as barriers, every other wall that crosses the storey's plane (a shell based on the ground floor and rising to the roof encloses the floors above it — review C1); Ghost Builder feeds it this build's drawn walls with the model's own walls at the build level as barriers (a fit-out drawing added to a model that already has its shell: C1); the bridge never computes a location — the poster supplies it as a fact.

*Promote.* `WallFact` gains the wall's line and material; the planner decides the one-type storey BEFORE the loop (it decides what each wall's rule may see): on one, `Function` is dropped (it is the template's default, and tells nothing) and `Location` carries the decision; on a mixed storey `Function` is still passed (it is a modelling decision there) with `Location` and `Material` beside it, and the rule file's order decides — unless the two disagree (a wall whose type says Exterior and whose sides both read enclosed: a courtyard wall, or a misread outline): then neither is passed and the wall is held with that sentence (review C2). The retype's reason names what the rule used (`Location Exterior, 200 mm → …`), through the matcher's new `Matched` (the TS resolver's `matched`, ported). A door hosted by a wall a Location rule settled reads its location from that rule (`RuleLocation`: each producing rule's `Function`, else its `Location`, one distinct value — review C6).

*Ghost Builder.* The typer gets one fact for each drawn wall — its Location from the outer boundary (this build's drawn walls, with the model's walls at the build level as barriers) — as `when.params`. The mapping's parameter values (P2) are the local model's reading of the project documents (`EnrichParamsAsync`); they are written to the wall as before and never pick its type (review C4). A rule stating more conditions is tried first, then document order: a layer rule listed first wins over a layer-free rule only when it states at least as many conditions (a layer rule and a one-param rule tie, and the lead's order decides; a two-param layer-free rule beats a layer rule — review C5); where no rule names the layer, the layer-free rules decide; with neither, the gap it was. The summary counts how many drawn walls read outside, inside and unknown.

*The bridge.* `changesets-typing.mjs` is pure: `checkFacts` keeps `facts {thickness_mm?, params?}` name for name or refuses in words; `makeTyper(standards, bundle)` returns the function `validateChangeset` calls for an element without `place.TypeName` — exact or a 400 (D16, as Promote): an office rule at confidence 1 whose type the catalogue holds, else a refusal naming what is missing (no guideline → "not checkable"; no catalogue; no rule for those facts; a `{thickness}` type with no thickness; a type the catalogue lacks, with the sizes it has; a category default, which is not an office rule). `changesets-store.proposeChangeset` reads `guideline@n` and `type_catalog@n` (project → office, each re-checked with the install validator) only when a post needs typing, builds the typer and passes it in; the validated element carries `facts` (a record), `typing` (`typed_by: "bridge"` with type, family, rule, matched, input, the two labels and shas — or `typed_by: "caller"`) and is never pre-ticked when the bridge typed it. The install validator refuses a rule whose `when` names no condition (it would match every element the bridge types) and accepts a row's `bic`. The add-in reads the stored body as any other changeset (`place.TypeName`); its DTO gains `typing`, and Review AI Proposals says "typed by the bridge from the facts posted (guideline@1 · office · …)" beside the accuracy.

*The harvest.* `GoldenModelExtractor` reads each type's Function as the Integer `FUNCTION_PARAM` and writes its enum name (`TypeHarvest.FunctionName`), a parameter by its storage type (text as it is, an element id as that element's name — a Material), and a system type's build-up materials where the type has no Material parameter (`NamingManagerService.LayerMaterials`, now shared). The row's `category` is the ENGLISH key its BuiltInCategory names (`Compat.CategoryKeyOf`, the same table `ResolveCategoryKey` binds by), `bic` is the enum name (`Compat.BicNameOf`, from the id on every Revit version — no 2023+ API), `category_local` the display name only when it differs; a shared parameter's bound categories are written as English keys too, so a German harvest binds every parameter on an English Revit. Both validators accept the two new keys and require nothing new, and both matchers also compare a row on its `bic` (`sameCategory` / `SameCategory`), so a `type_catalog@1` from before reads as it did and a German one answers for "Walls".

*BOS-3.* The review window gains **Install catalogue on office**: the command reads the document's key on the API thread (the event hub), then in `Task.Run` asks the bridge which office the project belongs to (`GET /cde/projects/:key/scope`, new `GovernedNotify.ProjectScope`) and PUTs `type_catalog` on THAT office through `GovernedNotify.InstallArtefact` — never on the project (a catalogue there would shadow the office's for that project alone). The bridge decides the role (lead on the office); the window prints the install line (`type_catalog@2 · office · <sha12>…: installed on <office> — N types from <title>`) or the bridge's own words (`Catalogue NOT installed: HTTP 403: this action requires the lead role (you are contributor)`). The file export and the printed CLI stay as the fallback.

**Tech stack:** the Revit add-in in C# (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8); the Node bridge (`WebApp/bridge/*.mjs`, vitest beside the code); `WebApp/bridge/sentinel-core.mjs`, a BUNDLE esbuild writes from `WebApp/src/sentinel-core/*.ts` (`npm run build:bridge-core`; the TS is the source, the bundle is committed too); the That Open web app's shared TS (`WebApp/src/sentinel-core/guideline.ts`); offline C# console checks (`tools/*-check`, `SENTINEL_CHECK`); a Python generator for the drill drawing (`demo/ghost-sample/make-sample.py`, no third-party library); the Supabase ledger (no migration).

**Global constraints:**
- Branch `feature/ma2a-layer-free-rules` from master `bb363de` (it holds this plan); merge `--no-ff` only after every task's checks pass **and the live drill MA2a is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - The add-in and the bridge spell the params the same, and one fixture proves it: `guideline-layerfree-cases.json` is written by the TS test and read by `promote-check` and by the bundle test; a new case lands on both sides together (both pin the count).
  - Nothing is guessed. An unknown Function, Location or Material is left out of the params and named in the reason; the bridge refuses a default (confidence 0.6) as well as a gap; Promote holds; Ghost reports a gap or falls to the layer rule or the mapping — never a type nobody decided.
  - No type is created by what this plan adds: Promote and the bridge choose catalogue types only (D16), and a type the catalogue lacks is a gap with the sizes it has. Ghost Builder's existing clone path (`GhostTypeCreator`, F43) is not touched and not widened.
  - The stamp and provenance rules of MA-1a stay: a stamp's facts come from the in-process placer, never from what the bridge returned; `typing` and `facts` are records the executor does not act on — it types by `place.TypeName` as for any changeset.
  - The trust rules of item 8 stay: the bridge sets `pretick`, `accuracy`, `claimed`, `typing`; a posted one is ignored and listed; `measured` is still dropped as not measured (no survey job backs it); a bridge-typed element gets no pre-tick for that alone, whatever its source.
  - No network call on Revit's API thread: the scope read and the catalogue PUT run in `Task.Run`, as the ruleset install does; the bridge typing adds nothing to the add-in's calls.
  - No new dependency, no migration, no new check project.
  - The bundle `WebApp/bridge/sentinel-core.mjs` is rebuilt by `npm run build:bridge-core` in the same commit as any TS change under `src/sentinel-core`, and `bridge/sentinel-core-bundle.test.mjs` fails on a stale one (Task 1 shows it failing, then passing).
  - A `type_catalog@1` installed before this plan keeps working: both validators require nothing new on a row (`bic`, `category_local` and the params are optional), both matchers still compare by name first, and the drill reads an old catalogue and a new one through the same code.
- After every add-in task, both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (`System`, `System.Collections.Generic` and `System.Linq` are global in the add-in's csproj for net48 too).
- No new check project: extend `tools/promote-check` (compiles `GuidelineMatcher`, the planners, `ChangesetClient`; gains `WallLocation.cs`), `tools/ghost-standards-check` (compiles `GuidelineMatcher`, `TypeCatalogExport`, `StandardsPack`, `ArtefactClient`; gains `TypeHarvest.cs`) and the bridge's vitest files. `guideline-check`, `annotate-check`, `wallpair-check` and `session-check` also compile files this plan edits and are run after the tasks that touch them.
- Checks: `dotnet run --project tools/<name>` from the repo root; vitest from `WebApp` with `npx vitest run <files>`; the bundle with `npm run build:bridge-core` from `WebApp`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by a source scan and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session (the section after the tasks). Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100.
- The community Revit MCP never writes. Only in the drill, and only its read-only calls: `get_current_view_elements`, `get_selected_elements`, `get_current_view_info`, `analyze_model_statistics`.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens); never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are master `bb363de`'s and shift as tasks land: match the quoted text, not the number. The source files are CRLF on disk, the docs hold a few odd bytes: use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs.

**Dry run (planner, 2026-10-03):** every code step below was applied in order, task by task, to a fresh `git archive` export of master `bb363de` in a scratch folder outside the repository (each "replace" matching its text exactly once, CRLF kept). Each "see it fail" step was run and failed as written; the generator was run where Task 4 says; the checks were run after each task. The steps were then applied once more, start to finish, to a second fresh export, with the fail and pass runs of every task repeated (the totals below are that run's). Last, a script read THIS document's own code blocks — the `Create` and replace steps as an implementer reads them (107 then; 111 after the review amendments below) — and applied them to a third fresh export, which came out byte for byte equal to the second. The code blocks in this plan are the exact text that was applied.
- Master's own totals, measured first: `promote-check` `476/476`; `ghost-standards-check` `147/147`; `guideline-check` `17/17`; `ghost-p2-check` `107/107`; `session-check` `47/47`; the bridge suite `Test Files  83 passed (83)`, `Tests  1679 passed | 1 skipped (1680)`; `npm test` (`vitest run`, every file) `136 passed`, `2115 passed | 1 skipped`.
- Task 1: the new TS test `1 failed | 5 passed` (the BOS-5 test: `CATEGORY_BIC` is not exported yet); after the code, the TS test `6 passed` and the bundle test `2 failed | 1 passed` — the committed bundle is stale (its `sameCategory` is missing, and the German row's case differs); after `npm run build:bridge-core`, `src/sentinel-core/guideline*` + the bundle test `Test Files  5 passed (5)`, `Tests  42 passed (42)` (`guideline.test` 13, `guideline-fixtures` 2, `guideline-layerfree` 6, `guideline-bds` 18, `sentinel-core-bundle` 3). `ghost-standards-check` `149/149` (the two new guideline files parse).
- Task 2: `promote-check` fails to compile (`CategoryBics`, `Matched` missing: 3 + 3 + … errors), then `496/496`; `guideline-check` `17/17`, `ghost-standards-check` `149/149`, `annotate-check` `ALL PASS`, `wallpair-check` `9/9`.
- Task 3: the five bridge files `9 failed | 247 passed (256)` (two files could not load: `changesets-typing.mjs` does not exist; `needsTyping` is not a function; the store's typed posts are the 400 they were; the two validator paths; the tool's description); then `Test Files  5 passed (5)`, `Tests  346 passed (346)` (`changesets-logic` 85, `changesets-typing` 5, `changesets-store` 34, `artefact-store` 190, `mcp-server` 32); the whole `bridge/` suite `Test Files  85 passed (85)`, `Tests  1705 passed | 1 skipped (1706)`.
- Task 4: `promote-check` fails to compile (`WallLocation.cs` could not be found), then `532/532`; `changesets-logic` `85 passed`; `session-check` `47/47`. The generator writes `sample-walls-ma2a.dxf` (1,728 bytes, 14 lines) and `sample-walls-ma2a-expected.json` (1,240 bytes).
- Task 5: `ghost-standards-check` fails to compile (`TypeHarvest.cs` could not be found), then `163/163`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)`.
- Task 6: `promote-check` `532/539` (the seven wiring lines `FAIL`), then `539/539`; both builds as above.
- Task 7: `ghost-standards-check` fails to compile (`OfficeKeyFrom`, `InstallJson`, `InstallLine`, `NotInstalledLine` missing), then `176/176`; both builds as above.
- Task 8: `ghost-p2-check` `107/107` (the sample folder's README grew by 7 bytes and still leaves the spec its room).
- Final tree: all 25 tracked check projects pass (`promote-check` `539/539`, `ghost-standards-check` `176/176`, `guideline-check` `17/17`, `ghost-p2-check` `107/107`, `session-check` `47/47`, `massing-check` `17/17`, `wallpair-check` `9/9`, `roi-check` `50/50`, `event-check` `44/44`, `heal-check` `9/9`, `gate-check` `219/219`, `publish-check` `124/124`, the rest as on master); the bridge suite `85 passed`, `1705 passed | 1 skipped`; `npm test` `139 passed`, `2147 passed | 1 skipped`; builds Revit 2024 `0 Error(s)`, `5 Warning(s)`; 2026 `0`, `3`; 2022 `0`, `3`; 2027 `0`, `5` — master's counts (2022 and 2027 are not required builds).

**Dry run after the review amendments (2026-10-03, the totals the tasks now state):** every code step of the amended plan was applied once more, in task order, to a fresh `git archive` export of this branch in the session's scratch folder, by a script that reads this document's `Create` and replace blocks as an implementer does (each replace matched exactly once; CRLF kept); the "see it fail" runs were made for Tasks 1–7 by applying each task's check files before its code. Measured: Task 1 `1 failed | 6 passed (7)`, then `7 passed (7)`, the stale bundle `2 failed | 1 passed (3)`, the rebuild `64.7kb`, then `Test Files 5 passed`, `Tests 43 passed (43)`; `ghost-standards-check` `149/149`. Task 2: `CategoryBics` ×3 and `Matched` ×10 missing, then `497/497` (the C5 two-param line), `guideline-check` `17/17`, `ghost-standards-check` `149/149`, `annotate-check` `ALL PASS`, `wallpair-check` `9/9`. Task 3: `9 failed | 247 passed (256)`, then `346 passed (346)`; `bridge/` `85 passed`, `1705 passed | 1 skipped`. Task 4: the generator's two files (1,728 and 1,240 bytes); `WallLocation.cs` could not be found, then `539/539` (the C1 and C2 checks and the RuleLocation cases: the planner's lines are 19 now); `session-check` `47/47`; `changesets-logic` `85 passed`. Task 5: `TypeHarvest.cs` could not be found, then `163/163`; builds 2024 `0 Error(s)`, `5 Warning(s)`, 2026 `0`, `3`. Task 6: `539/548` (nine wiring lines `FAIL`), then `548/548`; both builds as above. Task 7: the four `TypeCatalogExport` members missing (8 errors), then `176/176`; both builds as above. Task 8: every tracked `tools/*-check` project passes (25 in git — `tools/rvtinfo-check` is a 26th folder on this PC that git does not track, so an export has none; the counts above, `promote-check` `548/548`, `ghost-standards-check` `176/176`, `ghost-p2-check` `107/107`, `datum-check` `DATUM OK`, the rest as before); `npm test` `139 passed`, `2148 passed | 1 skipped (2149)`; builds 2024 `0`, `5`; 2026 `0`, `3`; 2022 `0`, `3`; 2027 `0`, `5`. This run found two things, both fixed in the plan before the totals above were taken: the C1 check's "room with no shell" case resolves to `BDS_EXT_ARC_CMU_100 mm`, which the check's document-type table did not hold (the planner held it as "not loaded"; the table now has it), and `GhostChangesetBuild` already declares `tolFt` in an enclosing scope (the barrier read's tolerance is `planeTolFt`). Not run: the drill section; the commit commands. Nothing in the repository was changed by the dry run.

The first dry run found five things the plan now carries. **The committed bundle is already stale on master**: a fresh `npm run build:bridge-core` differs from `bridge/sentinel-core.mjs` in 77 lines of the programme-CSV parser (a 4D change after commit `50f49ba` was not rebundled) — Task 1's rebuild carries that drift into its commit, and says so; the new bundle test is the check that was missing. The shared fixture `promote-body.json` changes in one string: a gap's reason now names the fact the rule used ("Function Exterior"), and because the planner clips an exception's reason at 300 characters the stored text moves by nine characters at its end — Task 4 replaces the whole string, exactly. The MA-1b wiring scan looked for `ResolveWallType(… typedBy)` with its closing bracket; the facts argument follows it now (Task 6 drops the bracket from the scan). A test of mine filed two retypes of one element (the bridge's own "a second retype" rule caught it: the second now has its own id). And the TS fixture holds 17 cases, not the 18 first written. Not run: every line of the drill section, which only Revit can run; the commit commands. Nothing in the repository was changed by the dry run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds option **A** of each. None needs an answer before the work starts. **F1 is the one to read first**: it says what "outside" means.

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | What "outside" means — how a wall's location is read | **A:** from the storey's own walls: a wall is outside when one of its two sides looks out (from a point just beyond that face, a line away from the wall or along it either way meets no other wall of the storey) and the other is enclosed; inside when both are enclosed; otherwise unknown, with the reason. **B:** from the storey's floor slabs: a point just beyond each face tested against the floor outlines | **A.** It needs nothing but the walls Promote already reads and the walls Ghost just drew, and works on a concept model with no floors. Ceilings, stated in the code: a wall facing a closed inner courtyard reads inside; a wall drawn in pieces (GHB-6) lets a line out through its gap; a curved wall is unknown. B is wrong wherever a slab overhangs its wall (a balcony) and asks for Revit's sketch API, which changed in 2022 |
| F2 | A storey where every concept wall is one generic type (MA-0 held all of them: "inside cannot be told from outside") | **A:** the type's Function is dropped there (it is the template's default and tells nothing) and the rules see the Location read from the boundary; a wall whose location cannot be read is still held, with that reason. **B:** keep holding the whole storey | **A.** It is what the design's §3.4 step 4 promised MA-2 would do. Ceiling: a free-standing wall outside the outline, or a storey whose walls do not close, still goes to a person — named, never guessed |
| F3 | A retype posted without `place.TypeName` (an agent naming an existing wall by its UniqueId) | **A:** the bridge types it from the `facts` the poster sends about that wall (its thickness, Function, Location, Material), as it types a create; it is never pre-ticked for that. At Apply the executor checks that the type is loaded in the model and — new here, review C3 — that a wall retype's target has the wall's own width (`Unsafe`, 0.5 mm): a claimed thickness that would move a face is refused in words. Nothing else about a wall is checked at Apply (`type_before` is null on a bridge-typed retype). **B:** a retype without a type stays a 400 | **A.** Without it the design's example body (a create and a retype) could never be answered 201. Ceiling: the facts are the poster's claim about an element the bridge cannot see; a same-width wrong claim (Interior said of an exterior wall) gives a wrong proposal that a person reads unticked |
| F4 | A guideline's category default (confidence 0.6) when the bridge types | **A:** refused — "only the Walls default of guideline@n would apply (confidence 0.6) — Sentinel types by an office rule only"; the poster sends the type or a lead writes a rule. **B:** accepted at 0.6 | **A.** Promote holds at anything under confidence 1 (D16); the bridge should not be the softer judge. Ceiling: a guideline written around its default (the pilot's Walls default is the gypsum pattern) types nothing on the bridge until a rule is written |
| F5 | The carrier of the thickness and the parameters a poster sends | **A:** a new element field `facts {thickness_mm?, params?}`, kept as a record; `measured` stays what item 8 made it — ignored and listed until a survey job the bridge ran backs it. **B:** read `measured.thickness_mm` as a claimed thickness | **A.** `measured` means "backed by a job"; reading it for typing would make the trust rule's words untrue. Ceiling: the design's body (`:681-705`) is answered 201 only with `facts` in place of `measured` (spec amendment S2) |
| F6 | Where "Install catalogue on office" installs | **A:** on the document's OFFICE (its project's `office_key`; an office document's own key) — a project with no office is refused in words. **B:** on the document's project when it has no office | **A.** A catalogue on a project shadows the office's for that project alone, and later office installs no longer reach it (the ruleset install already warns of this). Ceiling: a project outside any office cannot install from Revit; the CLI still can |
| F7 | How a harvested row names its category on a non-English Revit | **A:** `category` = the English key its BuiltInCategory names (the same table the bindings resolve by), `bic` = the enum name, `category_local` = the display name only when it differs; both matchers also compare a row on its `bic`. **B:** `category` = the display name, `bic` beside it, matchers compare on `bic` only | **A.** Every reader that compares by name keeps working, including the office-template count, and the German case is pinned on both sides. Ceiling: every built-in category gets its `bic` (stairs and railings too — both are in `CategoryKeys`); only a subcategory, an imported or a custom category (a positive id) has none, and a category outside `CategoryKeys` keeps its display name as `category` (review C8) |
| F8 | Which type parameters the harvest keeps | **A:** the seven it listed, read right: `Function` (the Integer, by its enum name), `Material` (its element's name, else the build-up's layers), `Fire Rating`, `Assembly Code`, `Type Mark`, `Keynote`, `Structural Material`. **B:** more (Width and Height are already their own fields) | **A.** Fire Rating and Material are what the office's rules key on; Assembly Code, Type Mark and Keynote are what the matrix's property rows will ask for; Function is what MA-2 needed. Ceiling: a rule on any other type parameter has nothing to match until it is added here |
| F9 | How a wall's `Material` is spelled | **A:** the build-up's material names, finish layers first, distinct, joined " / " ("Stone / Concrete Masonry Units"); a rule matches by substring (`Material: STONE`). **B:** the outermost finish layer's name only | **A.** A rule written as "STONE" or "GYPS" matches a build-up that names it anywhere; B would miss a stone face behind a plaster. Ceiling: "CMU" matches nothing in "Concrete Masonry Units" — a rule names the words the template uses |
| F10 | A layer rule and a layer-free rule that both match (Ghost Builder on a drawing) | **A:** the matcher's existing order — a rule stating more conditions is tried first, then document order; a layer counts one condition, so a layer rule and a one-param rule tie and the lead's order decides, and a layer-free rule on two params (Location + Material) beats a layer rule wherever it matches (review C5). The lead lists layer rules first, so a layer rule wins on its layer against one-param rules, and the layer-free rules decide where no layer rule exists. **B:** make a layer always count more | **A.** It needs no change on either side; the drill's Ghost guideline is written that way, and both fixtures pin the two-param case. Ceiling: a lead who lists a layer-free rule above a layer rule, or writes a two-param layer-free rule, gets the layer-free answer on that layer — the `why` and `matched` name the rule, so it is seen |

## Review amendments (2026-10-03, BINDING — they override any task text they contradict)

Two independent reviews — whether the code says only what it measured (code-honesty), and whether the plan and its drill can be run as written (exec-drill) — raised the points below. Each was checked against the code, the drill record or the design line it cites. Where it held, the plan was changed where the problem is: the tasks, checks, commands and drill rows in this document already carry the change, and this list says what moved and why. Where it did not hold, the plan was left alone (the returned list says where the code shows it). The spec amendments that follow were renumbered S1–S5 so this list keeps the C-numbers.

- **C1 (Task 4 `PromoteWallsPlanner`, Task 6 `GhostChangesetBuild`; `LayerFreePlanner` checks; drill P-4; E28 — critical).** The barrier list was the storey's own walls (`GroupBy(BaseLevel)`), so a shell based on the ground floor and rising to the roof enclosed nothing above it, and every room-closing partition on the first floor read one side open — `Location Exterior` at confidence 1, nothing held, nothing said. Promote now adds every wall whose vertical extent crosses the storey's plane (base ≤ plane + 1 mm < top, the planner's own `TopMm`); Ghost adds the model's walls whose bounding box spans the build level. Three checks pin it (a shell to the Roof, the room alone, a shell stopping at the plane) and P-4 runs it on the B35 model.
- **C2 (Task 4 planner; `LayerFreePlanner`; Architecture *Promote*; Risks; E29 — important).** On a mixed storey a wall whose type says Exterior and whose sides both read enclosed (the plan's own courtyard ceiling) was retyped to an internal type at confidence 1 by the file's order, with a template note as its only trace. Now, where Function (Exterior/Interior) and the Location read disagree, neither is passed and the wall is held: "Function Exterior but it reads inside (both sides enclosed — a courtyard, or a misread outline); a person decides" (and the other way round). Pinned on the O layout; where they agree, or the location is unknown, or the storey is one-type, nothing changes.
- **C3 (Task 6 `ChangesetExecutor.Unsafe`; F3; Risks; UNSURE 8; drill B-1, B-2, B-5; E30 — important, raised by both reviews).** F3 claimed "the executor's own checks (… a build-up that would move a face) still guard at Apply"; `Unsafe` began `if (kind == "wall") return null;` and `type_before` is null on a bridge-typed retype, so a claimed thickness was applied with no check and moved both faces — and B-1's body claimed 200 mm of a 100 mm partition. `Unsafe` now compares a wall retype's basic `WallType.Width` within 0.5 mm and refuses with the same "would move a face" sentence; F3 and the Risks say exactly what guards (the type loaded, the width) and what does not; B-1/B-2 post the partition's own 100 mm and B-5 posts the wrong claim and sees Apply refuse it. Scanned in `Ma2aWiring` (the executor compiles in no check project), proven in B-5.
- **C4 (Task 6 `GhostFacts`; E9; Architecture *Ghost Builder*; `Ma2aWiring` — important; closes C13 too).** The plan fed the mapping's `ParamAssignment`s to the rules as "the document's parameter assignments"; they are written only by `LocalGhostBuilder.MergeParams` from `EnrichParamsAsync` — the local model's best-effort reading of the documents (the installed `layers@n` rows carry none) — and would have picked the TYPE at confidence 1 under the guideline's name. Ghost now passes `Location` alone; the model's values are still written to the placed wall (`ApplyParams`) and are shown on the review row as before, and the scan refuses `facts[pa.Name]`. With no mapping value in the facts, the reviewer's minor point that a computed Location silently overwrote a mapping's `Location` (C13) has nothing left to overwrite.
- **C5 (F10; Architecture; Task 1 TS test; Task 2 `LayerFree.cs` — important).** "A layer rule listed first still wins on its layer" is true only at equal specificity: both matchers sort by how many conditions a rule states (a layer counts one), then by document order, so a layer-free rule on two params beats a layer rule wherever it matches. F10 and the Architecture now say the real rule, and one case on each side (a `{layer}` rule listed first losing to a later `{Location, Material}` rule) pins it so a lead who reads the fixture sees it. The matcher is unchanged.
- **C6 (Task 4 `GuidelineMatcher.RuleLocation`, `PromotePlanner.Swap`; `LayerFreePlanner` D2; E8 — important).** `RuleParam` returns one value only when every producing rule names the param, so the gypsum type — produced by `{Location: Interior, Material: GYPS}` AND `{Function: Interior}` — named no one Function and no one Location, and every door in the common gypsum partition would have gone to a person once the layer-free file was installed. `RuleLocation` reads each producing rule's Function, else its Location, skipping rules naming neither; the D2 check now expects the swap, and a true disagreement (Interior by Location, Exterior by Function) is still held in the same words.
- **C7 (Task 1 Interfaces; Task 5 `TypeHarvest`, `HarvestChecks` — minor).** The API enum member is `Coreshaft` (read by reflection on Revit 2024's RevitAPI.dll: Interior, Exterior, Foundation, Retaining, Soffit, Coreshaft); the plan wrote `CoreShaft` in three places while Promote's `Function.ToString()` writes the enum's spelling. One spelling now, and the comment names the API as its source.
- **C8 (F7; Task 5 `HarvestChecks`; drill H-1 — minor).** "A category Sentinel's table does not know (stairs, railings…) gets no `bic`" was false twice: `BicNameOf` names every defined `BuiltInCategory`, and both are in `CategoryKeys`. The ceiling now reads: every built-in category gets its `bic`; only a subcategory, an import or a custom category (a positive id) has none. The hand-built check row is a custom category, and H-1 looks for a row with no `bic` among those.
- **C9 (Task 1 fixture, bundle test; Task 2 `ResolverParityLayerFree` — minor).** `Matched` ↔ `matched` was pinned by three hand-written lines, not by the shared data. The fixture rows now carry `matched`, the C# parity compares it (null for none), and the bundle test checks it where a fixture has it.
- **C10 (Task 1 `guideline-layerfree.test.ts`, `guideline-fixtures.test.ts` — minor).** The bundle test reads two fixtures that two other test files rewrite in the same parallel vitest run (`vitest.config.ts` runs files in workers); a read between truncate and write would have been an empty file. Both generators write a temp name and `renameSync` it into place.
- **C11 (Architecture *One spelling, one fixture* — minor).** "`Location: EXT`/`INT` keeps matching the pilot's door rules" justified nothing: no reader in this plan passes a Location for a door. The real reason (one vocabulary with `Function`) is stated, and door Location facts stay under Next.
- **C12 (S4 — minor).** "The same words as the TS" overstated it: the bridge's install check is the strictest of three validators (it also refuses `{params: {}}` and a blank layer), the TS refuses only `when: {}`, the add-in neither. S4 says so plainly.
- **C13 (Task 6 `GhostFacts` — minor).** A computed `Location` silently overwrote a mapping param of the same name. Folded into C4: no mapping value is a fact any more, so there is nothing to overwrite.
- **C14 (drill set-up, P-1, P-2, B-1, B-2, bodies; UNSURE 1 — critical, exec-drill).** The rows described a model that no longer exists: since B33/B35 the seed walls are settled on BDS types (partitions `BDS_INT_ARC_GYPS_100 mm`, 100 mm, never `Generic - 200mm`), `GR-FFL` holds about 52 template walls, and P-2's one-type reset could never make `typed.Distinct().Count() == 1` there. The set-up states the model as it is, P-2 and the boundary proof run on `01-FFL` (the clean storey), P-1 reads the settled storey honestly, B-1 picks a partition as it is and posts its own 100 mm.
- **C15 (drill G-1 — important, exec-drill).** Ghost Builder acquires the drawing itself (`Commands.GhostBuilder.cs`: the folder's pick window, then its own import); the row's Insert ▸ Import CAD needed a file dialog that refuses typed names and would at best have been reused by name. The row now uses the pick window. `bds-layers.json` is not installed on `ma2a-ghost` (optional in the review): its standard rows would change which provisioner runs, and that is not what the row proves.
- **C16 (drill set-up "Record before the first row"; UNSURE 1; merge gate — important, exec-drill).** Inside/outside was never made observable wall by wall, and `GR-FFL`'s template walls were unnamed barriers. The set-up records each wall's id, type and expected reading through the read-only MCP before P-1, and names the template walls as barriers; the merge gate is judged on `01-FFL`; types are verified through the MCP filter, not Select by ID (unresponsive in MA1b, record `:1248`).
- **C17 (drill "Owed before the first row" — important, exec-drill).** Design `:1081`'s "a lead writes layer-free rules into the office guideline" is MA-2a's own spec text and was in no task, row or owed line. It is now owed by name, with the DRAFT file as the starting point.
- **C18 (drill table order, P-2/B-2 Record, "Owed", closing list; Task 8 Step 2 — minor, exec-drill).** The merge gate depended on an unstated row order (H-2 installs `type_catalog@2` for every row after it): one line states it. P-2 and B-2 record the wall-type count before and after Apply ("equal — no type created", design `:1093`). Design `:1098`'s aster-tower run is named as substituted by B-3 (d). The closing list says which leftovers stay and which are deleted. "All 25 check projects": there are 26 folders on this PC, but `tools/rvtinfo-check` is not tracked by git (an export has 25) — the step says both.
- **C19 (Task 3 `artefact-store.mjs` install validator; `artefact-store.test.mjs`; S4's comments — important, review after the landing).** The install check accepted a `when.params` value that was not a non-empty string: `Location: 5` installed, threw in the bridge typer (`TypeError`, a 500 with no words) and made the add-in's `GuidelineMatcher.FromBodies` read the whole guideline as "did not parse" — one bad value turned the project's guideline into none in Revit; `null` and `""` matched every element carrying the parameter on both sides. A `when.layer`/`level`/`discipline` present but blank (`null`, `""`) was a stated condition to `guideline.ts matches()` and a wildcard to the add-in's `Matches`. The validator now refuses both (`…when.params.<k> must be a non-empty string, name and value`; `…when.<f> is present but blank — leave it out or name it`); seven rows pin them, the blank-layer refusal S4 names included. The two code comments that still said the TS validator "says the same" (the sentence C12 struck) carry C12's words.
- **C20 (Task 3 `changesets-typing.mjs` `makeTyper`; its test — important, review after the landing).** The bridge typed a door or window from the rule's `use.family` and checked only the TYPE name in the catalogue's category (`resolveWithCatalog`'s `inCatalog`), so a `family : type` pair the catalogue does not hold as one row (`BDS_INT_2 PNL : BDS_INT_1 PNL_WOOD_1000 x 2100 mm` — the type lives under `BDS_INT_1 PNL`) was typed at confidence 1 and would have failed at Apply ("does not exist in this model") or placed the wrong pair; the plan's "from the catalogue only" and the add-in's `CatalogHas(category, family, type)` both say the pair. `makeTyper` now requires one catalogue row with that category, family and type after the confidence check, else a 400: `"<family> : <type>" (the rule …) is not one type in <catalogue> — the catalogue holds <type> under <families>; send place.TypeName, or name that family in the rule`. One test case holds the right pair typed and the wrong one refused.

## Amendments to the spec's words (BINDING — they override any task text they contradict; numbered S1–S5 so the review amendments above keep C1…)

- **S1 (bridge typing moves from MA-4 to MA-2a).** The design lists "the bridge calls `resolveWithCatalog`" under MA-4 (`:1125`); the orchestrator's scope puts it here, and the items-6–8 plan's C33 says a contract-2 post is a 400 "until bridge typing lands". Task 8 marks the design's bullet LANDED EARLY.
- **S2 (the design's example body, `:681-705`).** It is answered 201 **with `facts` in place of `measured` and 200 mm in place of 203 mm**: `measured` is ignored by item 8's trust rule (F5), and the design's own note (`:728`) says a 203 mm wall is a gap under the exact rule. The shared fixture `contract2-typed-body.json` is that body, and its test also shows the body as written is still a 400 that says "no facts". The design's wording (Task 8) says so.
- **S3 (a retype is typed from facts).** The design's retype carries only a UniqueId; the bridge has no model to read, so a retype without a type is typed from the `facts` the poster sends (F3), or stays the 400 it was.
- **S4 (an empty `when` is refused at install only).** The TS `validateGuideline` refused a rule whose `when` has no key at all; the bridge's install validator did not, and a layer-free rule with `params: {}` would have matched every element the bridge types. The bridge refuses it at install from now on, and its check is the strictest of the three (review C12): `when: {}`, `when: {params: {}}` and a blank `layer` are all refused with "names no condition (layer, level, discipline or params) — it would match every element; use default"; the TS `validateGuideline` still refuses only `when: {}` (its own words); the add-in's `CheckGuideline` refuses neither. The add-in's `CheckGuideline` is NOT changed: it reads installed bodies, and refusing one already installed would silently turn a project's guideline into none. The bridge re-validates a body before typing with it, so such a body reads "none — did not parse" there.
- **S5 (the invariant "no type is created" is about what this plan adds).** Ghost Builder's clone of a catalogue sibling for a measured size the model lacks (`GhostTypeCreator`, F43) is master's behaviour and is neither touched nor widened; the drill's Ghost row records whether it ran.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The matcher's logic is unchanged on both sides; the readers pass the params | "The matcher already supports them" (design `:1081`). A rule's `when.params` key is compared loosely on the name and by substring on the value, so `Location: EXT` in the pilot's door rules keeps matching `Exterior` |
| E2 | `GuidelineResolution.Matched` is added to C# (the TS `matched`): the conditions the winning rule stated, in its own spelling | Promote's reason names what the rule USED ("Location Exterior"), not everything that was offered; the old reasons ("Function Exterior, 200 mm → …") stay word for word where only Function matched, so `promote-body.json` changes only where a gap's words changed |
| E3 | `WallLocation`: sample points half the width + 100 mm beyond each face; three rays per side (away, along, along back); 1 mm tolerance; a ray along a wall's own line is stopped by that wall's end on the ray | 100 mm clears a wall's own face without reaching a neighbour's; the along rays settle corners and courtyards; the end-on-ray rule is what makes a free-standing partition in a corridor read inside (the concept layout's gap walls). Ceilings: F1 |
| E4 | Walls of every type and every Function stand in for the boundary; only basic walls are LOCATED | A curtain or structural wall encloses as a concept wall does; Promote holds non-basic walls anyway, and a curved wall is unknown by name |
| E5 | A one-type storey is decided before the loop, from the same walls as before (basic, ungrouped, not in an option, on a story; settled walls in, the office's other types out) | The pre-loop decision is what lets Function be dropped per wall. The hold's "besides the N on other office types" counts those walls the same way |
| E6 | On a one-type storey with MA-0's Function-only file the storey is still held whole — each reason now says "…has no rule for Location Exterior" or "…its location is unknown (…)" | Honest: the location was read, the file cannot use it. The old reason's phrase "inside cannot be told from outside" is kept, so the existing check that counts it still holds |
| E7 | `PromoteWallsPlanner.What(ps, matched)`: the facts the rule used, in words; every fact offered when no rule fired | A hold says what was on the table; a retype says what decided |
| E8 | `PromotePlanner.Swap` reads a host's `GuidelineMatcher.RuleLocation` — each producing rule's `Function`, else its `Location` (the same two words), one distinct value, rules naming neither skipped (review C6) | `RuleParam` reads "not named" as a disagreement, so a type the DD layer-free file produces from a Location+Material rule AND a Function rule (`BDS_INT_ARC_GYPS_{thickness}`) named no one Function and no one Location: every door in a gypsum partition would have gone to a person. The hold's words stay "do not name one Function or Location" for a true disagreement |
| E9 | Ghost's facts: `Location` only; the mapping's `ParamAssignment`s are the local model's reading of the documents (`EnrichParamsAsync`, best-effort) and are applied as parameters as before — never passed to the rules (review C4); the summary adds one line "outer boundary: N outside · M inside · K unknown" | A value a local model read from a spec would otherwise have picked the TYPE at confidence 1 under the guideline's name, with nothing saying where the Material came from. The line makes a drawing whose walls do not close visible |
| E10 | `facts {thickness_mm?, params?}`: at most 20 params, names ≤ 64 and values ≤ 256 one-line characters, thickness 0–10,000 mm; a stray key is a 400; an attach takes none | A fact the bridge did not read would be a fact the poster thinks it typed by. 10 m covers any wall; 20 params covers the matrix's rows |
| E11 | `typing` on every stored element: `{typed_by: "caller"}` or the bridge's full record `{typed_by: "bridge", type, family, rule, matched, input, guideline, guideline_sha256, catalog, catalog_sha256}` | "Marks who typed it" explicitly; the labels are the bridge's `refLabel`, so a reader sees WHICH guideline decided (F54's lesson). The add-in's `TypingDto` reads the first six; the shas are for the ledger |
| E12 | A bridge-typed element is never pre-ticked: `pretick: typed ? false : pretickOf(…)` | The facts are a claim; item 8's single-answer rule is for Promote's own plan, which typed before posting |
| E13 | `changesets-typing.mjs` is pure (the bundle and the resolved bodies are handed in); `validateChangeset` takes the typer as an option (`type`) and stays pure; the store builds the typer only when `needsTyping(body)` | 76 existing validator tests run as they were; a Ghost or Promote post (every element typed) reads no artefact; the resolver is the bundle the add-in's matcher mirrors |
| E14 | The store re-checks each resolved body with `validateArtefact`; one that fails is "none — <label> did not parse: <reason>" | `resolveContract` does the same; a guideline installed before a check existed is never typed with |
| E15 | The 400s name the artefact labels and the facts in words, and end with what to do ("send place.TypeName, or …") | Honesty in words — the aster-tower case ("no guideline — not checkable", design `:1098`) is one of them |
| E16 | `KIND_CATEGORY` maps wall … furniture to the guideline categories; a level or grid is never typed | The same list `PlacementPolicy.CategoriesOf` names; a column is the architectural Columns the executor places |
| E17 | The harvest reads Function as `get_Parameter(FUNCTION_PARAM)` (Integer → enum name through `TypeHarvest.FunctionName`), other parameters by storage type (String as is, ElementId as the element's name, Integer and Double left out) | `LookupParameter("Function").AsString()` is null on an Integer: that is why 0 of 1,434 rows had it. `InternalDefinition.BuiltInParameter` is not used (its API moved across versions) |
| E18 | `TypeHarvest.FunctionName` is its own table of Revit's six WallFunction values | The pure half has no Revit enum; the table is the API's documented values, and the drill reads one live (UNSURE 3) |
| E19 | `Compat.BicNameOf` casts the category id to `BuiltInCategory` and asks `Enum.IsDefined`; `Compat.CategoryKeyOf` reverses `CategoryKeys` | Works on 2021–2027 with no `#if` (the audit's 2023+ `Category.BuiltInCategory` is not needed: a built-in category's id is its negative enum value, which `MatchesCategoryKey` already relies on). A subcategory or custom category has a positive id and gets no `bic` |
| E20 | `bic` and `category_local` are written only when set (`JsonIgnore WhenWritingNull`); both validators accept `bic` as an optional string and ignore `category_local` | A `type_catalog@1` body and a new one pass the same validators; the TS `CatalogType` gains `bic?` only |
| E21 | `CategoryBics` (C#) and `CATEGORY_BIC` (TS) are the ten placement categories; `SameCategory` / `sameCategory` compare by name, then by `bic` | The fixture's German rows prove Walls and Doors on both sides; every catalogue read in the matcher goes through it (the type check, the options, `CatalogHas`, `CatalogOfSize`, the office-template count, `ValidateAgainstCatalog`) |
| E22 | `NamingManagerService.LayerMaterials` becomes `internal` and is shared; `TypeHarvest.MaterialLabel` joins | Reuse over a copy; the join is the pure, checked half |
| E23 | BOS-3 runs through the existing `GovernedNotify.InstallArtefact`, with the office key from a new `GovernedNotify.ProjectScope` (GET `/cde/projects/:key/scope`) and the pure `TypeCatalogExport.OfficeKeyFrom` | One PUT, the bridge's lead check (`putArtefact` → `requireMinRole(key, "lead")`), the 403's words surfaced as they are. The install body is the export plus `source {tool: revit-build, document}`, which the PUT route lifts into the pointer |
| E24 | The window's install line is `type_catalog@n · office · <sha12>…: installed on <office> — N types from <title>. … GET /cde/<office>/artefacts/type_catalog answers the same sha.` | The audit's proof line (BOS-3) in one sentence: the window shows the label, and the GET is named |
| E25 | `bridge/sentinel-core-bundle.test.mjs` compares the bundle with the TS source on every case of both shared fixtures and on the exported names | The only way a check "sees a stale bundle": the dry run found master's bundle already stale |
| E26 | `promote-body.json`'s one changed string is replaced whole (the clipped 300 characters) | The planner clips an exception's reason; a partial edit would leave the fixture a character off |
| E27 | The drill drawing `sample-walls-ma2a.dxf` draws every wall as two faces | A wall drawn as one line has no measured thickness, and Ghost's typer then takes the mapping, not the guideline (`ThicknessMm <= 0`); the MA-1a and MA-1b samples are single lines, so none of them can show a layer-free rule typing a wall |
| E28 | The barrier list of a storey is its own walls plus every wall whose vertical extent crosses the storey's plane — base elevation (`BaseLevel` + `BaseOffsetMm`) ≤ plane + 1 mm < top (`TopLevel` + `TopOffsetMm`, or base + `HeightMm`), the planner's own `TopMm`; Ghost reads the model's walls whose bounding box spans the build level's elevation (review C1) | `GroupBy(BaseLevel)` listed only the walls BASED on the storey: a shell based on the ground floor and rising to the roof was no barrier on the first floor, and every room-closing partition there read one side open — Exterior at confidence 1. The storey's own walls come first in the list, so a wall's index is unchanged |
| E29 | On a mixed storey a wall whose type's `Function` (Exterior/Interior) disagrees with the `Location` read is held: "Function Exterior but it reads inside (both sides enclosed — a courtyard, or a misread outline); a person decides" / "Function Interior but it reads outside (one side looks out of the storey's outline); a person decides" (review C2) | Passing both let the file's order decide, and the Location rule listed first retyped a courtyard wall (Function Exterior) to an internal type at confidence 1 with only a template note. Where they agree, or the location is unknown, or the storey is one-type, nothing changes |
| E30 | `ChangesetExecutor.Unsafe` checks a wall retype's width: a basic target `WallType.Width` more than 0.5 mm from the wall's is refused with "a retype would move a face; a person decides" (review C3) | `Unsafe` began `if (kind == "wall") return null;` and `type_before` is null on a bridge-typed retype, so a claimed thickness was applied with no check and moved both faces. Promote names a type at the wall's own width, so its retypes pass; the BDS CMU and GYPS rows carry their named width in the catalogue |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `demo/bds-pilot/bds-dd-layerfree-guideline.json` (new) | 1 | The DRAFT layer-free DD wall rules (Location, Material, then MA-0's Function) |
| `demo/ghost-sample/ma2a-ghost-guideline.json` (new) | 1 | The drill's Ghost guideline: a layer rule listed first, then Location rules |
| `WebApp/src/sentinel-core/guideline.ts` | 1 | `CatalogType.bic`, `CATEGORY_BIC`, `sameCategory` in the catalogue reads |
| `WebApp/src/sentinel-core/guideline-layerfree.test.ts` (new), `fixtures/guideline-layerfree-cases.json` (new, generated), `guideline-fixtures.test.ts` | 1 | The 17 shared cases (with `matched`), the German rows, the mixed file, the two-param case; both generators write their fixture whole (a temp file renamed into place) |
| `WebApp/bridge/sentinel-core-bundle.test.mjs` (new), `WebApp/bridge/sentinel-core.mjs` (rebuilt) | 1 | A stale bundle fails; the bundle |
| `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` | 2 | `CatalogEntry.Bic`, `Matched`, `CategoryBics`, `SameCategory`, the `bic` check |
| `tools/promote-check/LayerFree.cs` (new), `Check.cs` | 2 | The layer-free file, BOS-5, the parity read, the mixed file |
| `WebApp/bridge/changesets-typing.mjs` (new), `changesets-typing.test.mjs` (new) | 3 | `checkFacts`, `saidOf`, `makeTyper`, `KIND_CATEGORY`; the words of every 400 |
| `WebApp/bridge/changesets-logic.mjs`, `changesets-logic.test.mjs` | 3 | `facts`, the `type` option, `typing`, the pre-tick guard |
| `WebApp/bridge/changesets-store.mjs`, `changesets-store.test.mjs` | 3 | `needsTyping`, `typerFor`, the resolved standards, the audit's `typed` |
| `WebApp/bridge/artefact-store.mjs`, `artefact-store.test.mjs` | 3 | A row's `bic`; a rule with no condition refused at install |
| `WebApp/bridge/mcp-server.mjs`, `mcp-server.test.mjs` | 3 | The tool's description |
| `WebApp/bridge/fixtures/changeset-ops/contract2-typed-body.json` (new) | 3, 4 | The design's body with facts: posted and stored (vitest and promote-check) |
| `SentinelAddin/GhostBuilder/WallLocation.cs` (new) | 4 | Pure: the outer boundary — `Segment`, `Locate`, `Summary`, `RayMeets` |
| `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` | 4 | `WallFact.Line`, `Material`; the one-type pre-pass; the params; `What` |
| `SentinelAddin/GhostBuilder/PromotePlanner.cs`, `GuidelineMatcher.cs` | 4 | `Swap` reads a host rule's location through the new `RuleLocation` |
| `SentinelAddin/Coordination/ChangesetClient.cs` | 4 | `TypingDto`, `ChangesetTrust.Typing` |
| `demo/ghost-sample/make-sample.py`, `sample-walls-ma2a.dxf`, `sample-walls-ma2a-expected.json` (new, generated) | 4 | `--ma2a`: the drill drawing as two-face walls, and what each must read |
| `tools/promote-check/LayerFreePlanner.cs` (new), `Planner.cs`, `Check.cs`, `promote-check.csproj`; `WebApp/bridge/fixtures/changeset-ops/promote-body.json` | 4 | The boundary's checks, the planner's, the typed body's, the drawing's; the fixture's changed string |
| `SentinelAddin/Standards/TypeHarvest.cs` (new) | 5 | Pure: `FunctionName`, `MaterialLabel` |
| `SentinelAddin/Standards/StandardsPack.cs`, `GoldenModelExtractor.cs`, `SentinelAddin/Compat.cs`, `SentinelAddin/Workflow/NamingManagerService.cs` | 5 | `TypeSpec.Bic`, `CategoryLocal`; the reads; `CategoryKeyOf`, `BicNameOf`; the shared material read |
| `tools/ghost-standards-check/HarvestChecks.cs` (new), `Check.cs`, `ghost-standards-check.csproj` | 5 | The harvest's checks and source scans |
| `SentinelAddin/Commands.PromoteWalls.cs` | 6 | `Fact` reads the line and the material; `WallLine` |
| `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, `ElementPlacementFactory.cs`, `ChangesetExecutor.cs` | 6 | The drawn walls and the model's walls as barriers, `GhostFacts` (Location only), the summary line; the typer's `facts`; `Unsafe` checks a wall retype's width |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` | 6 | The typing line |
| `tools/promote-check/Ma2aWiring.cs` (new), `Ma1bWiring.cs`, `Check.cs` | 6 | The source scans |
| `SentinelAddin/Standards/TypeCatalogExport.cs` | 7 | `InstallJson`, `OfficeKeyFrom`, `InstallLine`, `NotInstalledLine`; the dialog's new sentence |
| `SentinelAddin/Coordination/GovernedNotify.cs` | 7 | `ProjectScope` |
| `SentinelAddin/UI/StandardsReviewWindow.cs`, `SentinelAddin/Commands.Standards.cs` | 7 | The button and the event; the off-thread install |
| `tools/ghost-standards-check/InstallChecks.cs` (new), `Check.cs` | 7 | BOS-3's checks and source scans |
| `docs/strategy/2026-09-30-model-automation-design.md`, `demo/bds-pilot/README.md`, `demo/ghost-sample/README.md` | 8 | The words |

---

## Tasks (in order: the TS spelling and the bundle test; the C# twin; the bridge; the pure C# boundary and planner; the harvest; the Revit-bound wiring; BOS-3; the words and the final checks. The merge follows the live drill)

How a code step is written: `Create` gives the whole new file. `In <file>, replace` gives the text to find and the text to put in its place; the text to find is in the file exactly once.

### Task 1 — TS: the layer-free rules pinned, a catalogue row answers by its BuiltInCategory, and a stale bundle fails a test

**Files:**
- Create `demo/bds-pilot/bds-dd-layerfree-guideline.json` — the DRAFT layer-free DD wall rules
- Create `demo/ghost-sample/ma2a-ghost-guideline.json` — the drill's Ghost guideline (a layer rule first, then Location rules)
- Create `WebApp/src/sentinel-core/guideline-layerfree.test.ts` — the shared cases; it writes `fixtures/guideline-layerfree-cases.json`
- Create `WebApp/bridge/sentinel-core-bundle.test.mjs` — the bundle against the source
- Modify `WebApp/src/sentinel-core/guideline.ts` — `CatalogType.bic`, `CATEGORY_BIC`, `sameCategory`
- Modify `WebApp/src/sentinel-core/guideline-fixtures.test.ts` — the fixture is written whole: a temp file renamed into place (review C10: the bundle test reads it from a parallel worker)
- Rebuild `WebApp/bridge/sentinel-core.mjs`

**Interfaces:** `CatalogType.bic?: string | null` — a row's BuiltInCategory as its enum name (`"OST_Walls"`). `CATEGORY_BIC: Record<string, string>` — the ten categories Sentinel places → their `OST_` names (the C# `GuidelineMatcher.CategoryBics` is the same list). `sameCategory(row, category): boolean` — by name (case and padding ignored), else by `bic` when the row carries one and the category is one of the ten; used wherever the resolver reads the catalogue. The params' spelling, fixed here for every reader: `Function` = `Exterior` | `Interior` | `Foundation` | `Retaining` | `Soffit` | `Coreshaft` (the enum's own spelling — `Autodesk.Revit.DB.WallFunction`, read by reflection on Revit 2024's RevitAPI.dll: review C7); `Location` = `Exterior` | `Interior`; `Material` = the build-up's material names joined ` / `.

- [ ] **Step 1: The two rule files and the failing tests.**

`Create` `demo/bds-pilot/bds-dd-layerfree-guideline.json`:

```json
{
  "standard": "BDS DD walls, layer-free v0 (MA-2a) — DRAFT",
  "office": "BDS",
  "stage": "DD",
  "status": "draft",
  "elements": [
    {
      "category": "Walls",
      "rules": [
        {
          "when": { "params": { "Location": "Exterior", "Material": "STONE" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_STONE_{thickness} mm" },
          "why": "DD (MA-2a): an outside wall whose build-up names stone is the office's stone-clad external wall at the wall type's width."
        },
        {
          "when": { "params": { "Location": "Interior", "Material": "GYPS" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_INT_ARC_GYPS_{thickness} mm" },
          "why": "DD (MA-2a): an inside wall whose build-up names gypsum is the office's gypsum partition at the wall type's width."
        },
        {
          "when": { "params": { "Location": "Exterior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_CMU_{thickness} mm" },
          "why": "DD (MA-2a): an outside wall — one side looks out of the storey's outline — is the office's external CMU at the wall type's width."
        },
        {
          "when": { "params": { "Location": "Interior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_INT_ARC_CMU_{thickness} mm" },
          "why": "DD (MA-2a): an inside wall — both sides within the storey's outline — is the office's internal CMU at the wall type's width."
        },
        {
          "when": { "params": { "Function": "Exterior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_CMU_{thickness} mm" },
          "why": "DD (MA-0): where the outer boundary cannot be read, a wall whose type's Function is Exterior is the external CMU at the wall type's width."
        },
        {
          "when": { "params": { "Function": "Interior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_INT_ARC_GYPS_{thickness} mm" },
          "why": "DD (MA-0): where the outer boundary cannot be read, a wall whose type's Function is Interior is the gypsum partition at the wall type's width."
        }
      ]
    }
  ]
}
```

`Create` `WebApp/src/sentinel-core/guideline-layerfree.test.ts`:

```ts
// MA-2a: the layer-free rules — Function, Location (inside or outside, from the outer boundary) and Material as when.params —
// resolved by the TS resolver over demo/bds-pilot/bds-dd-layerfree-guideline.json and the real BDS catalogue, and written to
// fixtures/guideline-layerfree-cases.json so the add-in's C# port (GuidelineMatcher, tools/promote-check ResolverParityLayerFree)
// and the bridge's bundle (bridge/sentinel-core-bundle.test.mjs) give the same family, type, source, confidence, options and
// matched conditions. A case may carry its own `catalog` rows (BOS-5: a row whose category is a localized name and whose `bic`
// is the BuiltInCategory); the others resolve against the BDS catalogue. Never `why`. Regenerated on every run and committed —
// written to a temp name and renamed into place, so a parallel vitest worker reading it never sees a half-written file.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolveWithCatalog, validateGuideline, validateAgainstCatalog, CATEGORY_BIC, type Guideline, type CatalogType, type ResolveInput } from "./guideline";

const OUT = "src/sentinel-core/fixtures/guideline-layerfree-cases.json";
const G: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-dd-layerfree-guideline.json", "utf8"));
const CATALOG: CatalogType[] = JSON.parse(readFileSync("../demo/bds-pilot/bds-type-catalog.json", "utf8")).types;

const wall = (params: Record<string, string>, thicknessMm?: number): ResolveInput =>
  (thicknessMm === undefined ? { category: "Walls", params } : { category: "Walls", params, thicknessMm });
// A catalogue harvested on a German Revit: the category is "Wände", the BuiltInCategory says OST_Walls (BOS-5).
const GERMAN: CatalogType[] = [
  { category: "Wände", bic: "OST_Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_200 mm", width_mm: 200 },
  { category: "Wände", bic: "OST_Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_300 mm", width_mm: 300 },
  { category: "Türen", bic: "OST_Doors", family: "BDS_INT_1 PNL", type: "BDS_INT_1 PNL_WOOD_1000 x 2100 mm", width_mm: null },
];
// The same rows from a harvest before BOS-5: the localized name alone, no bic — the catalogue cannot answer for "Walls".
const GERMAN_NO_BIC: CatalogType[] = GERMAN.map(({ bic: _b, ...c }) => c);

const INPUTS: { input: ResolveInput; catalog?: CatalogType[] }[] = [
  { input: wall({ Location: "Exterior" }, 200) }, { input: wall({ Location: "Interior" }, 200) }, { input: wall({ Location: "Interior" }, 100) },
  { input: wall({ Location: "Interior", Function: "Exterior" }, 100) },           // Location is listed first: it wins the tie
  { input: wall({ Function: "Exterior" }, 200) }, { input: wall({ Function: "Interior" }, 100) },
  { input: wall({ Location: "Exterior", Material: "Stone / Concrete Masonry Units" }, 50) },
  { input: wall({ Location: "Exterior", Material: "Stone" }, 200) },             // STONE_200 is not a BDS type: options
  { input: wall({ Location: "Interior", Material: "Gypsum Wall Board / Metal Stud" }, 100) },
  { input: wall({ Location: "Interior", Material: "Default Wall" }, 200) },      // a material no rule names: the Location rule
  { input: wall({ Location: "Interior" }, 125) },                                // the planted gap: CMU_125 is not a BDS type
  { input: wall({ Material: "Stone" }, 200) }, { input: wall({}, 200) }, { input: wall({ Location: "Exterior" }) }, // nothing guessed; no thickness, no type
  { input: wall({ Location: "Exterior" }, 200), catalog: GERMAN }, { input: wall({ Location: "Exterior" }, 200), catalog: GERMAN_NO_BIC },
  { input: wall({ Location: "Exterior" }, 150), catalog: GERMAN },               // bic also finds the options
];

const cases = INPUTS.map(({ input, catalog }) => {
  const r = resolveWithCatalog(G, input, catalog ?? CATALOG);
  return { input, ...(catalog ? { catalog } : {}), family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null, matched: r.matched ?? null };
});
const find = (pred: (c: (typeof cases)[number]) => boolean) => cases.find(pred)!;
const P = (c: (typeof cases)[number]) => c.input.params ?? {};

describe("guideline layer-free fixtures (MA-2a, TS ↔ C# ↔ bridge bundle)", () => {
  it("the rule file is a guideline every type of which the BDS catalogue has, with no layer on any rule", () => {
    expect(validateGuideline(G)).toEqual([]);
    expect(validateAgainstCatalog(G, CATALOG)).toEqual([]);
    expect(G.elements.flatMap((e) => e.rules).every((r) => r.when.layer === undefined && Object.keys(r.when.params ?? {}).length > 0)).toBe(true);
  });

  it("pins the answers Promote, Ghost Builder and the bridge depend on", () => {
    expect(cases).toHaveLength(17);
    expect(find((c) => P(c).Location === "Exterior" && c.input.thicknessMm === 200 && !c.catalog)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", source: "rule", confidence: 1 });
    expect(find((c) => P(c).Location === "Interior" && c.input.thicknessMm === 200 && !P(c).Material)).toMatchObject({ type: "BDS_INT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => P(c).Location === "Interior" && P(c).Function === "Exterior")).toMatchObject({ type: "BDS_INT_ARC_CMU_100 mm", confidence: 1 });
    expect(find((c) => P(c).Function === "Interior" && !P(c).Location)).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Stone / Concrete Masonry Units")).toMatchObject({ type: "BDS_EXT_ARC_STONE_50 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Stone" && P(c).Location === "Exterior")).toMatchObject({ type: "BDS_EXT_ARC_STONE_200 mm", confidence: 0, available: ["BDS_EXT_ARC_STONE_50 mm"] });
    expect(find((c) => P(c).Material === "Gypsum Wall Board / Metal Stud")).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1 });
    expect(find((c) => P(c).Material === "Default Wall")).toMatchObject({ type: "BDS_INT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => c.input.thicknessMm === 125)).toMatchObject({ confidence: 0, available: ["BDS_INT_ARC_CMU_100 mm", "BDS_INT_ARC_CMU_150 mm", "BDS_INT_ARC_CMU_200 mm", "BDS_INT_ARC_CMU_300 mm"] });
    expect(find((c) => P(c).Material === "Stone" && !P(c).Location)).toMatchObject({ source: "none", confidence: 0 });
    expect(find((c) => Object.keys(P(c)).length === 0)).toMatchObject({ source: "none" });
    expect(find((c) => c.input.thicknessMm === undefined)).toMatchObject({ source: "rule", confidence: 1, type: null });
  });

  it("BOS-5: a catalogue row answers for a guideline category by its BuiltInCategory, not only by its name", () => {
    expect(CATEGORY_BIC.Walls).toBe("OST_Walls");
    expect(find((c) => c.catalog === GERMAN && c.input.thicknessMm === 200)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 1 });
    expect(find((c) => c.catalog === GERMAN_NO_BIC)).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 0, available: [] });
    expect(find((c) => c.catalog === GERMAN && c.input.thicknessMm === 150)).toMatchObject({ confidence: 0, available: ["BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm"] });
    // The category is found through the bic: only the patterns these two rows cannot fill are reported, never "no types".
    expect(validateAgainstCatalog(G, GERMAN).filter((e) => !e.includes("pattern"))).toEqual([]);
    expect(validateAgainstCatalog(G, GERMAN_NO_BIC)).toEqual(['"Walls" — the template has no types in this category at all.']);
  });

  it("writes fixtures/guideline-layerfree-cases.json as [{ input, catalog?, family, type, source, confidence, available, matched }]", () => {
    mkdirSync("src/sentinel-core/fixtures", { recursive: true });
    writeFileSync(OUT + ".tmp", JSON.stringify(cases, null, 2) + "\n");
    renameSync(OUT + ".tmp", OUT); // atomic: bridge/sentinel-core-bundle.test.mjs reads this file in a parallel worker
    expect(JSON.parse(readFileSync(OUT, "utf8"))).toEqual(cases);
  });
});

// The drill's Ghost Builder guideline: a layer rule and layer-free rules in one Walls block (demo/ghost-sample/ma2a-ghost-guideline.json).
describe("a layer rule and layer-free rules together (drill MA2a's Ghost guideline)", () => {
  const M: Guideline = JSON.parse(readFileSync("../demo/ghost-sample/ma2a-ghost-guideline.json", "utf8"));
  it("is a guideline every type of which the BDS catalogue has", () => {
    expect(validateGuideline(M)).toEqual([]);
    expect(validateAgainstCatalog(M, CATALOG)).toEqual([]);
  });
  it("the layer rule, listed first, wins on its layer whatever the boundary says; a layer no rule names types by Location; neither is a gap", () => {
    const ext = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-EXT", discipline: "A", params: { Location: "Interior" }, thicknessMm: 200 }, CATALOG);
    expect(ext).toMatchObject({ type: "BDS_EXT_ARC_CMU_200 mm", confidence: 1, matched: ["layer"] });
    const inside = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-INT", discipline: "A", params: { Location: "Interior" }, thicknessMm: 100 }, CATALOG);
    expect(inside).toMatchObject({ type: "BDS_INT_ARC_CMU_100 mm", confidence: 1, matched: ["param:Location"] });
    const unknown = resolveWithCatalog(M, { category: "Walls", layer: "A-WALL-INT", discipline: "A", params: {}, thicknessMm: 100 }, CATALOG);
    expect(unknown).toMatchObject({ source: "none", confidence: 0 });
  });
  it("a layer-free rule on TWO params, listed last, is tried before the layer rule listed first: the matcher orders by how many conditions a rule states, a layer counting one", () => {
    const two = { when: { params: { Location: "Interior", Material: "GYPS" } }, use: { family: "Basic Wall", typePattern: "BDS_INT_ARC_GYPS_{thickness} mm" }, why: "two conditions" };
    const M2: Guideline = { ...M, elements: [{ ...M.elements[0], rules: [...M.elements[0].rules, two] }] };
    const r = resolveWithCatalog(M2, { category: "Walls", layer: "A-WALL-EXT", discipline: "A", params: { Location: "Interior", Material: "Gypsum Wall Board" }, thicknessMm: 100 }, CATALOG);
    expect(r).toMatchObject({ type: "BDS_INT_ARC_GYPS_100 mm", confidence: 1, matched: ["param:Location", "param:Material"] });
  });
});
```

In `WebApp/src/sentinel-core/guideline-fixtures.test.ts`, replace

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
```

with

```ts
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
```

In `WebApp/src/sentinel-core/guideline-fixtures.test.ts`, replace

```ts
    writeFileSync(OUT, JSON.stringify(cases, null, 2) + "\n");
```

with

```ts
    writeFileSync(OUT + ".tmp", JSON.stringify(cases, null, 2) + "\n");
    renameSync(OUT + ".tmp", OUT); // MA-2a: atomic — bridge/sentinel-core-bundle.test.mjs reads this file in a parallel worker
```

`Create` `demo/ghost-sample/ma2a-ghost-guideline.json`:

```json
{
  "standard": "MA-2a drill — a layer rule and layer-free rules in one guideline",
  "office": "BDS",
  "elements": [
    {
      "category": "Walls",
      "rules": [
        {
          "when": { "layer": "A-WALL-EXT" },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_CMU_{thickness} mm" },
          "why": "drill MA2a: the layer rule, listed first — a wall drawn on A-WALL-EXT is the external CMU at its measured thickness, whatever the boundary says."
        },
        {
          "when": { "params": { "Location": "Exterior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_EXT_ARC_CMU_{thickness} mm" },
          "why": "drill MA2a: a wall no layer rule names, open on one side, is the external CMU at its measured thickness."
        },
        {
          "when": { "params": { "Location": "Interior" } },
          "use": { "family": "Basic Wall", "typePattern": "BDS_INT_ARC_CMU_{thickness} mm" },
          "why": "drill MA2a: a wall no layer rule names, enclosed on both sides, is the internal CMU at its measured thickness."
        }
      ]
    }
  ]
}
```

`Create` `WebApp/bridge/sentinel-core-bundle.test.mjs`:

```js
// MA-2a: the bridge runs the resolver from bridge/sentinel-core.mjs, a BUNDLE esbuild writes from src/sentinel-core/*.ts
// (`npm run build:bridge-core`). The bundle is committed, so a TS change without a rebuild ships a bridge that types by the old
// rules. This test resolves every shared fixture case through the bundle and through the TS source, and holds them equal: a
// stale bundle fails here, in the suite that runs on every commit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as bundle from "./sentinel-core.mjs";
import * as source from "../src/sentinel-core/guideline";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FILES = [
  { cases: "../src/sentinel-core/fixtures/guideline-dd-cases.json", guideline: "../../demo/bds-pilot/bds-dd-elements-guideline.json" },
  { cases: "../src/sentinel-core/fixtures/guideline-layerfree-cases.json", guideline: "../../demo/bds-pilot/bds-dd-layerfree-guideline.json" },
];
const CATALOG = read("../../demo/bds-pilot/bds-type-catalog.json").types;
const pick = (r) => ({ family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null, matched: r.matched ?? null });

describe("bridge/sentinel-core.mjs is the build of src/sentinel-core (MA-2a)", () => {
  it("exports the resolver and the BOS-5 category ids the bridge types with", () => {
    for (const name of ["resolveWithCatalog", "resolveType", "validateGuideline", "validateAgainstCatalog", "sameCategory", "CATEGORY_BIC"])
      expect(typeof bundle[name], name).toBe(typeof source[name]);
    expect(bundle.CATEGORY_BIC).toEqual(source.CATEGORY_BIC);
  });

  for (const f of FILES) {
    it(`gives the fixture's answer on every case of ${f.cases.split("/").pop()} — rebuild the bundle when this fails`, () => {
      const G = read(f.guideline);
      const cases = read(f.cases);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        const cat = c.catalog ?? CATALOG;
        const got = pick(bundle.resolveWithCatalog(G, c.input, cat));
        expect(got, JSON.stringify(c.input)).toEqual(pick(source.resolveWithCatalog(G, c.input, cat)));
        expect(got, JSON.stringify(c.input)).toMatchObject({ family: c.family, type: c.type, source: c.source, confidence: c.confidence, available: c.available });
        if ("matched" in c) expect(got.matched, JSON.stringify(c.input)).toEqual(c.matched); // the layer-free fixture carries it
      }
    });
  }
});
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run src/sentinel-core/guideline-layerfree.test.ts`. Expect `1 failed | 6 passed (7)`: the BOS-5 test (`CATEGORY_BIC` is not exported, `sameCategory` does not exist — the German row answers for nothing). The other six pass: the matcher already resolves layer-free rules (the two-param case included), and the fixture test writes `src/sentinel-core/fixtures/guideline-layerfree-cases.json`.

- [ ] **Step 3: The source: a row's `bic`, and the comparison that reads it.**

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
/** One row of the template's harvested type catalogue (bds-type-catalog.json). */
export interface CatalogType {
  category: string;
  family: string;
  type: string;
  width_mm?: number | null;
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();
```

with

```ts
/** One row of the template's harvested type catalogue (bds-type-catalog.json). */
export interface CatalogType {
  category: string;
  family: string;
  type: string;
  width_mm?: number | null;
  /** MA-2a (BOS-5): the row's BuiltInCategory as its enum name ("OST_Walls"), written by Build Office System since MA-2a;
   *  absent on a type_catalog@1 harvested before it. A row matches a guideline category by name OR by this id. */
  bic?: string | null;
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

/** MA-2a (BOS-5): the BuiltInCategory of each category Sentinel places, as a harvested row's `bic` spells it. A catalogue
 *  harvested on a non-English Revit ("Wände", OST_Walls) still answers for "Walls". GuidelineMatcher.CategoryBics is the same
 *  list, name for name; the layer-free fixture holds both to it. */
export const CATEGORY_BIC: Record<string, string> = {
  Walls: "OST_Walls", Floors: "OST_Floors", Roofs: "OST_Roofs", Ceilings: "OST_Ceilings", Doors: "OST_Doors",
  Windows: "OST_Windows", Columns: "OST_Columns", Furniture: "OST_Furniture", Levels: "OST_Levels", Grids: "OST_Grids",
};

/** Does a catalogue row belong to `category`? By name (case and padding ignored), or by its BuiltInCategory when the row
 *  carries one and the category is one Sentinel places. Never by name alone across locales: "Wände" is not "Walls". */
export function sameCategory(c: CatalogType, category: string): boolean {
  if (norm(c.category) === norm(category)) return true;
  if (!c.bic) return false;
  const key = Object.keys(CATEGORY_BIC).find((k) => norm(k) === norm(category));
  return key !== undefined && CATEGORY_BIC[key] === c.bic;
}
```

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
  const inCatalog = catalog.some(
    (c) => norm(c.type) === norm(r.type) && norm(c.category) === norm(input.category),
  );
  if (inCatalog) return r;

  // Find the rule that produced this, so we can offer what its pattern COULD produce.
  const el = guideline.elements.find((e) => norm(e.category) === norm(input.category));
  const pattern = el?.rules.find((x) => x.use.typePattern && matches(x.when, input))?.use.typePattern;
  const options = pattern
    ? patternOptions(pattern, catalog.filter((c) => norm(c.category) === norm(input.category)))
    : [];
```

with

```ts
  const inCatalog = catalog.some(
    (c) => norm(c.type) === norm(r.type) && sameCategory(c, input.category),
  );
  if (inCatalog) return r;

  // Find the rule that produced this, so we can offer what its pattern COULD produce.
  const el = guideline.elements.find((e) => norm(e.category) === norm(input.category));
  const pattern = el?.rules.find((x) => x.use.typePattern && matches(x.when, input))?.use.typePattern;
  const options = pattern
    ? patternOptions(pattern, catalog.filter((c) => sameCategory(c, input.category)))
    : [];
```

In `WebApp/src/sentinel-core/guideline.ts`, replace

```ts
  for (const el of guideline.elements) {
    const inCat = catalog.filter((c) => norm(c.category) === norm(el.category));
```

with

```ts
  for (const el of guideline.elements) {
    const inCat = catalog.filter((c) => sameCategory(c, el.category));
```

- [ ] **Step 4: Run the source's test, then see the committed bundle fail.** From `WebApp`: `npx vitest run src/sentinel-core/guideline-layerfree.test.ts` — expect `7 passed (7)` (and the fixture rewritten with the German case at confidence 1). Then `npx vitest run bridge/sentinel-core-bundle.test.mjs` — expect `2 failed | 1 passed (3)`: "exports the resolver and the BOS-5 category ids" (`sameCategory` is `undefined` in the bundle) and "gives the fixture's answer on every case of guideline-layerfree-cases.json" (the German row). This is the stale bundle the suite could not see before.

- [ ] **Step 5: Rebuild the bundle, and see it pass.** From `WebApp`: `npm run build:bridge-core` (it prints `bridge\sentinel-core.mjs  64.7kb`). Then `npx vitest run src/sentinel-core/guideline bridge/sentinel-core-bundle.test.mjs`. Expect `Test Files  5 passed (5)` and `Tests  43 passed (43)` (`guideline.test` 13, `guideline-fixtures` 2, `guideline-layerfree` 7, `guideline-bds` 18, `sentinel-core-bundle` 3). The rebuilt bundle also carries a drift master already had: the programme-CSV parser of a 4D commit was never rebundled (77 lines); `git diff --stat WebApp/bridge/sentinel-core.mjs` shows it, and the commit message says so. From the repo root: `dotnet run --project tools/ghost-standards-check` — expect `149/149 checks pass` (its fixtures loop parses the two new guideline files as `guideline@n`).

- [ ] **Step 6: Commit.**

```bash
git add demo/bds-pilot/bds-dd-layerfree-guideline.json demo/ghost-sample/ma2a-ghost-guideline.json WebApp/src/sentinel-core/guideline.ts WebApp/src/sentinel-core/guideline-layerfree.test.ts WebApp/src/sentinel-core/guideline-fixtures.test.ts WebApp/src/sentinel-core/fixtures/guideline-layerfree-cases.json WebApp/bridge/sentinel-core-bundle.test.mjs WebApp/bridge/sentinel-core.mjs
git commit -F - <<'EOF'
feat(sentinel-core): layer-free rules pinned by a shared fixture; a catalogue row answers by its BuiltInCategory (BOS-5); a stale bridge bundle fails a test (MA-2a)

The bundle is rebuilt: it also carries the programme-CSV parser change of 50f49ba, which had not been rebundled.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 2 — C#: the matcher's twin — `Matched`, a row's BuiltInCategory, and the layer-free parity fixture read in promote-check

**Files:**
- Create `tools/promote-check/LayerFree.cs` — the layer-free file, the mixed file, BOS-5, the parity read
- Modify `tools/promote-check/Check.cs` — the call
- Modify `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` — `CatalogEntry.Bic`, `GuidelineResolution.Matched`, `CategoryBics`, `SameCategory`, `Matches` returns the hits, the `bic` check

**Interfaces:** `CatalogEntry.Bic` (string, null on an old row). `GuidelineResolution.Matched` — `List<string>`: `"layer"`, `"level"`, `"discipline"`, `"param:<key in the rule's spelling>"`; null for a default or none. `GuidelineMatcher.CategoryBics` (internal) — the ten placement categories → `OST_` names. `SameCategory(CatalogEntry, string)` (private) — by name, else by `bic`; every catalogue read in the matcher goes through it. `CheckCatalog` refuses `types[i].bic` that is not a string with `must be a string (a BuiltInCategory name)` — the bridge validator's words (Task 3).

- [ ] **Step 1: The failing checks.**

`Create` `tools/promote-check/LayerFree.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 23. MA-2a: layer-free rules (Function, Location, Material as when.params), the matcher's parity with the TS resolver
    //        on the shared layer-free fixture, and BOS-5: a catalogue row answers for a category by its BuiltInCategory ─────
    static GuidelineMatcher LayerFreeChecks()
    {
        Console.WriteLine("\nMA-2a — the layer-free rule file (demo/bds-pilot/bds-dd-layerfree-guideline.json) and the TS parity fixture");
        string text = File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json"));
        string catalog = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        var m3 = GuidelineMatcher.FromBodies(text, catalog, out var ge, out _);
        m3.CatalogLabel = "type_catalog@1 · ma2a · 0123456789ab…";
        Ok(m3.HasGuideline && ge == null && m3.IsDraft, "the layer-free file parses as guideline@n and is draft" + (ge == null ? "" : " — " + ge));
        var errs = m3.ValidateAgainstCatalog();
        Ok(errs.Count == 0, "every family and pattern it names is in the BDS catalogue" + (errs.Count > 0 ? " → " + string.Join(" | ", errs) : ""));
        var rules = JsonNode.Parse(text)["elements"].AsArray().SelectMany(e => e["rules"].AsArray()).ToList();
        Ok(rules.Count == 6 && rules.All(r => r["when"]["layer"] == null && r["when"]["params"].AsObject().Count > 0),
           "six rules, none with a layer, each on at least one param (Function, Location, Material)");

        GuidelineResolution R(Dictionary<string, string> ps, double? mm) => m3.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = mm });
        var both = R(new Dictionary<string, string> { ["Location"] = "Interior", ["Function"] = "Exterior" }, 100);
        Ok(both.Type == "BDS_INT_ARC_CMU_100 mm" && both.Matched != null && both.Matched.SequenceEqual(new[] { "param:Location" }),
           "Matched names the conditions the winning rule stated (param:Location), as the TS resolver's `matched` does — Location is listed first, so it wins the tie with Function");
        var stone = R(new Dictionary<string, string> { ["Location"] = "Exterior", ["Material"] = "Stone / Concrete Masonry Units" }, 50);
        Ok(stone.Type == "BDS_EXT_ARC_STONE_50 mm" && stone.Confidence == 1 && stone.Matched.SequenceEqual(new[] { "param:Location", "param:Material" }),
           "a rule on two params (Location + Material) is tried before one on one param, and Matched lists both");
        Ok(R(new Dictionary<string, string>(), 200).Source == "none" && R(new Dictionary<string, string> { ["Material"] = "Stone" }, 200).Source == "none",
           "no param, or a Material alone, matches no rule — nothing is guessed");
        var noMm = R(new Dictionary<string, string> { ["Location"] = "Exterior" }, null);
        Ok(noMm.Source == "rule" && noMm.Confidence == 1 && noMm.Type == null, "a rule that fires with no thickness names no type (the pattern is unfilled): the caller asks for a thickness");

        Console.WriteLine("\nBOS-5 — a catalogue row's BuiltInCategory (CatalogEntry.Bic, GuidelineMatcher.SameCategory)");
        const string german = "{\"types\":[{\"category\":\"Wände\",\"bic\":\"OST_Walls\",\"family\":\"Basic Wall\",\"type\":\"BDS_EXT_ARC_CMU_200 mm\",\"width_mm\":200}," +
                              "{\"category\":\"Wände\",\"bic\":\"OST_Walls\",\"family\":\"Basic Wall\",\"type\":\"BDS_EXT_ARC_CMU_300 mm\",\"width_mm\":300}," +
                              "{\"category\":\"Türen\",\"bic\":\"OST_Doors\",\"family\":\"BDS_INT_1 PNL\",\"type\":\"BDS_INT_1 PNL_WOOD_1000 x 2100 mm\"}]}";
        var de = GuidelineMatcher.FromBodies(text, german, out _, out var ce);
        Ok(de.HasCatalog && ce == null, "a catalogue whose rows carry bic parses" + (ce == null ? "" : " — " + ce));
        var deR = de.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 200 });
        Ok(deR.Type == "BDS_EXT_ARC_CMU_200 mm" && deR.Confidence == 1, "\"Walls\" finds the row filed under \"Wände\" by its bic: confidence 1");
        var deGap = de.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 150 });
        Ok(deGap.Confidence == 0 && deGap.Available.SequenceEqual(new[] { "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm" }), "…and the options of a gap through the bic too");
        Ok(de.CatalogHas("Walls", "Basic Wall", "BDS_EXT_ARC_CMU_200 mm") && de.CatalogHas("Doors", "BDS_INT_1 PNL", "BDS_INT_1 PNL_WOOD_1000 x 2100 mm") && !de.CatalogHas("Floors", "Floor", "x"),
           "CatalogHas by bic: Walls and Doors found, Floors not");
        var deDoc = new Dictionary<string, IReadOnlyList<(string Family, string Type)>>(StringComparer.Ordinal)
            { ["Walls"] = new List<(string, string)> { (null, "BDS_EXT_ARC_CMU_200 mm") } };
        Ok(de.OfficeTypesIn(deDoc) == (1, 2), "the office-template check counts a \"Wände\" row against the document's \"Walls\" (1 of 2)");
        var noBic = GuidelineMatcher.FromBodies(text, german.Replace(",\"bic\":\"OST_Walls\"", "").Replace(",\"bic\":\"OST_Doors\"", ""), out _, out _);
        Ok(noBic.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Location"] = "Exterior" }, ThicknessMm = 200 }).Confidence == 0
           && noBic.ValidateAgainstCatalog().SequenceEqual(new[] { "\"Walls\" — this office's template has no types in that category." }),
           "without a bic a localized name answers for nothing: a type_catalog@1 from before BOS-5 behaves as before");
        GuidelineMatcher.FromBodies(null, "{\"types\":[{\"category\":\"Walls\",\"type\":\"x\",\"bic\":5}]}", out _, out var badBic);
        Ok(badBic == "types[0].bic must be a string (a BuiltInCategory name)", "a bic that is not text is refused in the bridge validator's words");
        Ok(GuidelineMatcher.CategoryBics.Keys.OrderBy(k => k, StringComparer.Ordinal).SequenceEqual(GuidelineMatcher.PlacementCategories.OrderBy(k => k, StringComparer.Ordinal))
           && GuidelineMatcher.CategoryBics["Walls"] == "OST_Walls" && GuidelineMatcher.CategoryBics["Grids"] == "OST_Grids",
           "CategoryBics covers exactly the categories Sentinel places (the TS CATEGORY_BIC is the same list: the fixture's German rows prove Walls and Doors on both sides)");


        Console.WriteLine("\nMA-2a — the drill's Ghost guideline: a layer rule and layer-free rules in one block (demo/ghost-sample/ma2a-ghost-guideline.json)");
        var mixed = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "ghost-sample", "ma2a-ghost-guideline.json")), catalog, out var mge, out _);
        Ok(mixed.HasGuideline && mge == null && mixed.ValidateAgainstCatalog().Count == 0, "the drill's Ghost guideline parses and names only BDS types");
        GuidelineResolution GR(string layer, Dictionary<string, string> ps, double mm) =>
            mixed.Resolve(new GuidelineInput { Category = "Walls", Layer = layer, Discipline = "A", Params = ps, ThicknessMm = mm, Level = "GR-FFL" });
        var onLayer = GR("A-WALL-EXT", new Dictionary<string, string> { ["Location"] = "Interior" }, 200);
        Ok(onLayer.Type == "BDS_EXT_ARC_CMU_200 mm" && onLayer.Confidence == 1 && onLayer.Matched.SequenceEqual(new[] { "layer" }),
           "the layer rule, listed first, wins on its layer whatever the boundary says (the TS test pins the same)");
        var byLocation = GR("A-WALL-INT", new Dictionary<string, string> { ["Location"] = "Interior" }, 100);
        Ok(byLocation.Type == "BDS_INT_ARC_CMU_100 mm" && byLocation.Confidence == 1 && byLocation.Matched.SequenceEqual(new[] { "param:Location" }),
           "a layer no rule names types by Location");
        Ok(GR("A-WALL-INT", new Dictionary<string, string>(), 100).Source == "none", "…and with no Location read it is a gap, never the default (there is none)");
        // Review C5: the matcher orders by how many conditions a rule states (a layer counts one), then by document order — so a
        // layer-free rule on two params, listed LAST, is tried before the layer rule listed first. Pinned here and in the TS test.
        var twoNode = JsonNode.Parse(File.ReadAllText(Repo("demo", "ghost-sample", "ma2a-ghost-guideline.json")));
        twoNode["elements"][0]["rules"].AsArray().Add(JsonNode.Parse("{\"when\":{\"params\":{\"Location\":\"Interior\",\"Material\":\"GYPS\"}},\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"BDS_INT_ARC_GYPS_{thickness} mm\"},\"why\":\"two conditions\"}"));
        var two = GuidelineMatcher.FromBodies(twoNode.ToJsonString(), catalog, out _, out _);
        var twoR = two.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", Discipline = "A", ThicknessMm = 100,
                                                    Params = new Dictionary<string, string> { ["Location"] = "Interior", ["Material"] = "Gypsum Wall Board" } });
        Ok(twoR.Type == "BDS_INT_ARC_GYPS_100 mm" && twoR.Matched.SequenceEqual(new[] { "param:Location", "param:Material" }),
           "a layer-free rule on TWO params, listed last, beats the layer rule listed first on its own layer — the matcher orders by how many conditions a rule states (review C5; the TS test pins the same)");

        ResolverParityLayerFree(text, m3);
        return m3;
    }

    // The TS resolver's answers over the layer-free file (guideline-layerfree.test.ts writes them) against the C# port, on family,
    // type, source, confidence, options and the matched conditions (Matched ↔ matched, review C9) — never `why`. A case with its own
    // `catalog` rows resolves against those (BOS-5).
    static void ResolverParityLayerFree(string guidelineText, GuidelineMatcher m3)
    {
        var path = Repo("WebApp", "src", "sentinel-core", "fixtures", "guideline-layerfree-cases.json");
        var cases = JsonNode.Parse(File.ReadAllText(path)).AsArray();
        int same = 0;
        foreach (var c in cases)
        {
            var input = c["input"];
            var m = c["catalog"] == null ? m3
                : GuidelineMatcher.FromBodies(guidelineText, new JsonObject { ["types"] = JsonNode.Parse(c["catalog"].ToJsonString()) }.ToJsonString(), out _, out _);
            var r = m.Resolve(new GuidelineInput
            {
                Category = (string)input["category"],
                Params = input["params"]?.AsObject().ToDictionary(kv => kv.Key, kv => (string)kv.Value),
                ThicknessMm = (double?)input["thicknessMm"],
            });
            var want = c["available"]?.AsArray().Select(x => (string)x) ?? Enumerable.Empty<string>();
            var wantMatched = c["matched"]?.AsArray().Select(x => (string)x).ToList(); // null when the TS resolver matched nothing
            bool ok = r.Family == (string)c["family"] && r.Type == (string)c["type"] && r.Source == (string)c["source"]
                      && r.Confidence == (double)c["confidence"] && (r.Available ?? new List<string>()).SequenceEqual(want)
                      && (wantMatched == null ? r.Matched == null : r.Matched != null && r.Matched.SequenceEqual(wantMatched));
            if (ok) same++;
            else Console.WriteLine($"        differs: {input.ToJsonString()} → C# {r.Family} / {r.Type} / {r.Source} / {r.Confidence} / [{string.Join(", ", r.Available ?? new List<string>())}] / matched [{string.Join(", ", r.Matched ?? new List<string>())}]");
        }
        Ok(cases.Count == 17 && same == cases.Count, $"the C# matcher gives the TS resolver's answer on every shared layer-free case ({same}/{cases.Count})");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        Ma1bWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        Ma1bWiringChecks();
        LayerFreeChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

- [ ] **Step 2: Run it, and see it fail.** From the repo root: `dotnet run --project tools/promote-check`. Expect a compile failure: `'GuidelineMatcher' does not contain a definition for 'CategoryBics'` (three times) and `'GuidelineResolution' does not contain a definition for 'Matched'` (ten times).

- [ ] **Step 3: The matcher.**

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        /// <summary>A door's or window's harvested type Width and Height (mm); null when not harvested.</summary>
        [JsonPropertyName("width_mm")]  public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }
```

with

```csharp
        /// <summary>A door's or window's harvested type Width and Height (mm); null when not harvested.</summary>
        [JsonPropertyName("width_mm")]  public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
        /// <summary>MA-2a (BOS-5): the row's BuiltInCategory as its enum name ("OST_Walls"), written by Build Office System since
        /// MA-2a; null on a type_catalog@1 harvested before it. A row matches a category by name OR by this (SameCategory).</summary>
        [JsonPropertyName("bic")]       public string Bic { get; set; }
    }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        /// <summary>Set when the resolved type is NOT in the office's template — the review gate shows
        /// these so a human picks, instead of the builder inventing a type or snapping to a size.</summary>
        public List<string> Available { get; set; }
    }
```

with

```csharp
        /// <summary>Set when the resolved type is NOT in the office's template — the review gate shows
        /// these so a human picks, instead of the builder inventing a type or snapping to a size.</summary>
        public List<string> Available { get; set; }
        /// <summary>MA-2a: the conditions the winning rule stated, in the rule's own spelling — "layer", "level", "discipline",
        /// "param:Location" — as guideline.ts's <c>matched</c>; null for a default or none. Promote's reason names them.</summary>
        public List<string> Matched { get; set; }
    }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
                if (Present(t, "width_mm", out var w) && w.ValueKind != JsonValueKind.Number) throw Bad(at + ".width_mm", "must be a number or null");
                if (Present(t, "height_mm", out var h) && h.ValueKind != JsonValueKind.Number) throw Bad(at + ".height_mm", "must be a number or null");
            }
```

with

```csharp
                if (Present(t, "width_mm", out var w) && w.ValueKind != JsonValueKind.Number) throw Bad(at + ".width_mm", "must be a number or null");
                if (Present(t, "height_mm", out var h) && h.ValueKind != JsonValueKind.Number) throw Bad(at + ".height_mm", "must be a number or null");
                if (Present(t, "bic", out var bic) && bic.ValueKind != JsonValueKind.String) throw Bad(at + ".bic", "must be a string (a BuiltInCategory name)");
            }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        private static string Norm(string s) => (s ?? string.Empty).Trim().ToLowerInvariant();
        private static string Squash(string s) => Norm(s).Replace(" ", string.Empty);
```

with

```csharp
        private static string Norm(string s) => (s ?? string.Empty).Trim().ToLowerInvariant();
        private static string Squash(string s) => Norm(s).Replace(" ", string.Empty);

        /// <summary>MA-2a (BOS-5): the BuiltInCategory of each category Sentinel places (PlacementCategories), as a harvested row's
        /// <c>bic</c> spells it. guideline.ts's CATEGORY_BIC is the same list, name for name (the layer-free fixture holds both to it).</summary>
        internal static readonly IReadOnlyDictionary<string, string> CategoryBics = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Walls"] = "OST_Walls", ["Floors"] = "OST_Floors", ["Roofs"] = "OST_Roofs", ["Ceilings"] = "OST_Ceilings", ["Doors"] = "OST_Doors",
            ["Windows"] = "OST_Windows", ["Columns"] = "OST_Columns", ["Furniture"] = "OST_Furniture", ["Levels"] = "OST_Levels", ["Grids"] = "OST_Grids",
        };

        /// <summary>Does a catalogue row belong to <paramref name="category"/>? By name (case and padding ignored), or by its
        /// BuiltInCategory when the row carries one and the category is one Sentinel places — so a catalogue harvested on a
        /// non-English Revit ("Wände", OST_Walls) answers for "Walls". Never by name alone across locales.</summary>
        private static bool SameCategory(CatalogEntry c, string category)
        {
            if (Norm(c.Category) == Norm(category)) return true;
            if (string.IsNullOrEmpty(c.Bic)) return false;
            string key = CategoryBics.Keys.FirstOrDefault(k => Norm(k) == Norm(category));
            return key != null && CategoryBics[key] == c.Bic;
        }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
                if (!Matches(rule.When, input)) continue;
                return WithCatalogCheck(new GuidelineResolution
                {
                    Family = rule.Use?.Family,
                    Type = FillPattern(rule.Use, input),
                    Params = rule.Use?.Params ?? new Dictionary<string, object>(),
                    Source = "rule",
                    Confidence = 1.0,
                    Why = rule.Why,
                }, input, rule.Use?.TypePattern);
```

with

```csharp
                var hit = Matches(rule.When, input);
                if (hit == null) continue;
                return WithCatalogCheck(new GuidelineResolution
                {
                    Family = rule.Use?.Family,
                    Type = FillPattern(rule.Use, input),
                    Params = rule.Use?.Params ?? new Dictionary<string, object>(),
                    Source = "rule",
                    Confidence = 1.0,
                    Why = rule.Why,
                    Matched = hit,
                }, input, rule.Use?.TypePattern);
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        private static bool Matches(GuidelineWhen w, GuidelineInput input)
        {
            if (w == null) return false;
            if (w.Layer != null && Norm(w.Layer) != Norm(input.Layer)) return false;
            if (w.Level != null && Norm(w.Level) != Norm(input.Level)) return false;
            if (w.Discipline != null && Norm(w.Discipline) != Norm(input.Discipline)) return false;

            foreach (var kv in w.Params ?? new Dictionary<string, string>())
            {
                // Loose on the NAME (a spec says "Fire Rating" where the model says "FireRating") and
                // substring on the VALUE (so "FR60" matches "FR60 / REI60").
                string key = (input.Params ?? new Dictionary<string, string>()).Keys
                    .FirstOrDefault(n => Squash(n) == Squash(kv.Key));
                if (key == null) return false;
                if (!Norm(input.Params[key]).Contains(Norm(kv.Value))) return false;
            }
            return true;
        }
```

with

```csharp
        /// <summary>The conditions the rule stated and the input met ("layer", "level", "discipline", "param:&lt;key&gt;"), or null when
        /// one is not met — guideline.ts's matches(). A stated field must match; an unstated one is a wildcard.</summary>
        private static List<string> Matches(GuidelineWhen w, GuidelineInput input)
        {
            if (w == null) return null;
            var hit = new List<string>();
            if (w.Layer != null) { if (Norm(w.Layer) != Norm(input.Layer)) return null; hit.Add("layer"); }
            if (w.Level != null) { if (Norm(w.Level) != Norm(input.Level)) return null; hit.Add("level"); }
            if (w.Discipline != null) { if (Norm(w.Discipline) != Norm(input.Discipline)) return null; hit.Add("discipline"); }

            foreach (var kv in w.Params ?? new Dictionary<string, string>())
            {
                // Loose on the NAME (a spec says "Fire Rating" where the model says "FireRating") and
                // substring on the VALUE (so "FR60" matches "FR60 / REI60").
                string key = (input.Params ?? new Dictionary<string, string>()).Keys
                    .FirstOrDefault(n => Squash(n) == Squash(kv.Key));
                if (key == null) return null;
                if (!Norm(input.Params[key]).Contains(Norm(kv.Value))) return null;
                hit.Add("param:" + kv.Key);
            }
            return hit;
        }
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type)
                                          && Norm(c.Category) == Norm(input.Category));
```

with

```csharp
            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type) && SameCategory(c, input.Category));
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
            return _catalog
                .Where(c => Norm(c.Category) == Norm(category) && rx.IsMatch(c.Type ?? string.Empty))
```

with

```csharp
            return _catalog
                .Where(c => SameCategory(c, category) && rx.IsMatch(c.Type ?? string.Empty))
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => Norm(c.Category) == Norm(category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));
```

with

```csharp
        public bool CatalogHas(string category, string family, string type) =>
            _catalog.Any(c => SameCategory(c, category) && Norm(c.Family) == Norm(family) && Norm(c.Type) == Norm(type));
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
            var named = _catalog.Where(c => Norm(c.Category) == Norm(category) && TypeNameParse.TrySection(c.Type, out var w, out var h)
```

with

```csharp
            var named = _catalog.Where(c => SameCategory(c, category) && TypeNameParse.TrySection(c.Type, out var w, out var h)
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
                if (!HasRulesFor(c.Category)) continue;
                string key = documentTypes.Keys.FirstOrDefault(k => Norm(k) == Norm(c.Category));
```

with

```csharp
                // MA-2a (BOS-5): a row filed under a localized name counts for the English category its bic names.
                string cat = CategoryBics.Keys.FirstOrDefault(k => SameCategory(c, k)) ?? c.Category;
                if (!HasRulesFor(cat)) continue;
                string key = documentTypes.Keys.FirstOrDefault(k => SameCategory(c, k));
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
                var inCat = _catalog.Where(c => Norm(c.Category) == Norm(el.Category)).ToList();
```

with

```csharp
                var inCat = _catalog.Where(c => SameCategory(c, el.Category)).ToList();
```

- [ ] **Step 4: Run it, and see it pass.** From the repo root: `dotnet run --project tools/promote-check` — expect `497/497 checks pass` (master `476`; the new lines are under "MA-2a — the layer-free rule file", "BOS-5" and "the drill's Ghost guideline", the parity line reading `17/17`). Then the other projects that compile `GuidelineMatcher.cs`: `dotnet run --project tools/guideline-check` `17/17`; `tools/ghost-standards-check` `149/149`; `tools/annotate-check` `ALL PASS`; `tools/wallpair-check` `9/9`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GuidelineMatcher.cs tools/promote-check/LayerFree.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(matcher): Matched (the TS resolver's matched), a catalogue row's BuiltInCategory and SameCategory, the layer-free parity fixture read by promote-check (MA-2a, BOS-5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 3 — Bridge: full contract 2 — an element without `place.TypeName` is typed from the facts it posts, or refused in words

**Files:**
- Create `WebApp/bridge/changesets-typing.mjs` — `KIND_CATEGORY`, `FACTS_FIELDS`, `checkFacts`, `saidOf`, `makeTyper`
- Create `WebApp/bridge/changesets-typing.test.mjs` — the typer over the real bundle and the demo files
- Create `WebApp/bridge/fixtures/changeset-ops/contract2-typed-body.json` — the design's body with facts, posted and stored
- Modify `WebApp/bridge/changesets-logic.mjs`, `changesets-logic.test.mjs` — `facts`, the `type` option, `typing`, the pre-tick guard
- Modify `WebApp/bridge/changesets-store.mjs`, `changesets-store.test.mjs` — `needsTyping`, `typerFor`, `resolveArtefact` as a dep, the audit's `typed`
- Modify `WebApp/bridge/artefact-store.mjs`, `artefact-store.test.mjs` — a row's `bic`; a rule with no condition refused
- Modify `WebApp/bridge/mcp-server.mjs`, `mcp-server.test.mjs` — the tool's description

**Interfaces:** An element may carry `facts: { thickness_mm?: number (0 < n ≤ 10000), params?: { <name ≤ 64 chars>: <one-line text ≤ 256> } (≤ 20) }` — kept name for name, a stray key a 400, none on an attach. `validateChangeset(body, { member, type })`: with `type` — `(kind, facts, at) → { TypeName, FamilyName, typing }` or a 400 — a create or retype of a typed kind without `place.TypeName` is typed (`place.TypeName` filled; `place.FamilyName` from the rule for a door, window, column or furniture that names none); without `type` the 400s are as they were. Every stored element carries `typing`: `{ typed_by: "caller" }`, or `{ typed_by: "bridge", type, family, rule, matched, input: {category, params, thicknessMm?}, guideline, guideline_sha256, catalog, catalog_sha256 }`; a bridge-typed element has `pretick: false`. `makeTyper({ guideline: {body, label, sha256}, catalog: {…} }, bundle)`: the 400s, each beginning `elements[i]: a <kind> without place.TypeName is typed by the bridge from the project's guideline and type catalogue — ` and ending with what to do: no guideline (`not checkable`), no catalogue (`D16`), no rule for `<facts in words>`, only the category default (`confidence 0.6`), a `{thickness}` type with no thickness sent, a type not in the catalogue with the sizes it has. `needsTyping(body)` — a create or retype of a typed kind that names no `TypeName`. The install validator: `types[i].bic must be a string (a BuiltInCategory name)`; `elements[i].rules[j].when names no condition (layer, level, discipline or params) — it would match every element; use default`.

- [ ] **Step 1: The failing tests and the shared fixture.**

`Create` `WebApp/bridge/changesets-typing.test.mjs`:

```js
// MA-2a: the bridge's typer over the real bundle, the layer-free rule file and the BDS catalogue — the answers and, above
// all, the words of every refusal: a post the bridge cannot type is a 400 that says exactly what is missing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper, checkFacts, saidOf, KIND_CATEGORY, FACTS_FIELDS } from "./changesets-typing.mjs";
import { VOCABULARY } from "./changesets-logic.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const G = read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json");
const C = read("../../demo/bds-pilot/bds-type-catalog.json");
// The labels and shas the store would hand in (artefact-store refLabel); the shared fixture contract2-typed-body.json uses these.
export const STANDARDS = {
  guideline: { body: G, label: "guideline@1 · office · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: C, label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
};
const NONE = (kind) => ({ body: null, label: `none — not installed for ma2a or its office`, sha256: null, kind });
const type = makeTyper(STANDARDS, core);
const refused = (fn, re) => { try { fn(); throw new Error("no throw"); } catch (e) { expect(e.status).toBe(400); expect(e.message).toMatch(re); } };

describe("changesets-typing — the bridge types from the facts, or says what is missing (MA-2a)", () => {
  it("every typed kind has its guideline category; a level or grid has none", () => {
    for (const k of VOCABULARY.filter((k) => k !== "level" && k !== "grid")) expect(KIND_CATEGORY[k], k).toBeTruthy();
    expect(KIND_CATEGORY.level).toBeUndefined();
    expect(FACTS_FIELDS).toEqual(["thickness_mm", "params"]);
  });

  it("types a wall from Location and thickness: the exact catalogue type, the rule's words, who typed it, and which standards decided", () => {
    const t = type("wall", { thickness_mm: 200, params: { Location: "Exterior" } }, "elements[0]");
    expect(t.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm");
    expect(t.FamilyName).toBe("Basic Wall");
    expect(t.typing).toMatchObject({
      typed_by: "bridge", type: "BDS_EXT_ARC_CMU_200 mm", family: "Basic Wall", matched: ["param:Location"],
      input: { category: "Walls", params: { Location: "Exterior" }, thicknessMm: 200 },
      guideline: STANDARDS.guideline.label, guideline_sha256: "ab".repeat(32), catalog: STANDARDS.catalog.label, catalog_sha256: "cd".repeat(32),
    });
    expect(t.typing.rule).toMatch(/^DD \(MA-2a\): an outside wall/);
    // Material and Function as posted, nothing more: the rule on two params wins, and Function alone still answers.
    expect(type("wall", { thickness_mm: 50, params: { Location: "Exterior", Material: "Stone / CMU" } }, "e").TypeName).toBe("BDS_EXT_ARC_STONE_50 mm");
    expect(type("wall", { thickness_mm: 100, params: { Function: "Interior" } }, "e").TypeName).toBe("BDS_INT_ARC_GYPS_100 mm");
  });

  it("the 400s name what is missing, in order: the kind, the guideline, the catalogue, the rule, the thickness, the catalogue type", () => {
    const facts = { thickness_mm: 200, params: { Location: "Exterior" } };
    refused(() => type("level", facts, "elements[0]"), /^elements\[0\]: a level without place\.TypeName is typed by the bridge .* — a level is not typed$/);
    refused(() => makeTyper({ guideline: NONE("guideline"), catalog: STANDARDS.catalog }, core)("wall", facts, "elements[0]"),
      /no guideline is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable; send place\.TypeName, or install guideline@n$/);
    refused(() => makeTyper({ guideline: STANDARDS.guideline, catalog: NONE("type_catalog") }, core)("wall", facts, "elements[0]"),
      /no type catalogue is installed .* a type is chosen from the catalogue only \(D16\); send place\.TypeName, or install type_catalog@n$/);
    refused(() => type("wall", { thickness_mm: 200, params: { Material: "Stone" } }, "elements[2]"),
      /^elements\[2\]: .* no rule of guideline@1 · office · 0123456789ab… matches a wall with Material Stone, 200 mm; send place\.TypeName, or add a layer-free rule for it$/);
    refused(() => type("wall", null, "elements[3]"), /no rule of .* matches a wall with no facts; send/);
    refused(() => type("wall", { params: { Location: "Exterior" } }, "elements[4]"),
      /the rule of guideline@1 · office · 0123456789ab… for Location Exterior names its type with \{thickness\} and no thickness was sent; send place\.TypeName, or send facts\.thickness_mm$/);
    refused(() => type("wall", { thickness_mm: 125, params: { Location: "Interior" } }, "elements[5]"),
      /"BDS_INT_ARC_CMU_125 mm" \(the rule of guideline@1 · office · 0123456789ab… for Location Interior, 125 mm\) is not in type_catalog@1 · office · fedcba987654… — the catalogue has BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm; send place\.TypeName, or pick one of those$/);
    // A guideline whose Walls block has a default: the default is not an office rule.
    const withDefault = { ...G, elements: [{ ...G.elements[0], default: { family: "Basic Wall", type: "Generic - 200mm" } }] };
    refused(() => makeTyper({ guideline: { ...STANDARDS.guideline, body: withDefault }, catalog: STANDARDS.catalog }, core)("wall", { thickness_mm: 200 }, "elements[6]"),
      /only the Walls default of guideline@1 · office · 0123456789ab… would apply \(confidence 0\.6\) — Sentinel types by an office rule only; send place\.TypeName, or write a rule for 200 mm$/);
  });

  it("checkFacts keeps thickness_mm and params name for name and refuses what it cannot keep", () => {
    expect(checkFacts(undefined, "e")).toBeNull();
    expect(checkFacts({}, "e")).toEqual({});
    expect(checkFacts({ thickness_mm: 200, params: { Function: "Exterior", "Fire Rating": "FR60" } }, "e")).toEqual({ thickness_mm: 200, params: { Function: "Exterior", "Fire Rating": "FR60" } });
    refused(() => checkFacts([], "e"), /^e: facts must be an object \{thickness_mm\?, params\?\}$/);
    refused(() => checkFacts({ thickness_mm: 200, measured: true }, "e"), /^e: facts takes only thickness_mm and params \(got measured\)$/);
    for (const t of [0, -1, "200", NaN, 10001]) refused(() => checkFacts({ thickness_mm: t }, "e"), /facts\.thickness_mm must be a number of mm above 0 and at most 10000/);
    refused(() => checkFacts({ params: ["Exterior"] }, "e"), /facts\.params must be an object of parameter name: value/);
    refused(() => checkFacts({ params: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}`, "v"])) }, "e"), /facts\.params holds at most 20 parameters \(got 21\)/);
    refused(() => checkFacts({ params: { "": "x" } }, "e"), /a parameter name that is not one line of at most 64 characters/);
    refused(() => checkFacts({ params: { Location: 7 } }, "e"), /^e: facts\.params\.Location must be one line of text of at most 256 characters$/);
    refused(() => checkFacts({ params: { Location: "Ext\nerior" } }, "e"), /facts\.params\.Location must be one line/);
  });

  it("saidOf puts the facts in words", () => {
    expect(saidOf({ thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } })).toBe("Function Exterior, Location Exterior, 200 mm");
    expect(saidOf({ params: { Material: "Stone" } })).toBe("Material Stone");
    expect(saidOf(null)).toBe("no facts");
    expect(saidOf({})).toBe("no facts");
  });
});
```

`Create` `WebApp/bridge/fixtures/changeset-ops/contract2-typed-body.json`:

```json
{
  "what": "MA-2a, full contract 2: the design's example body (docs/strategy/2026-09-30-model-automation-design.md:681-705) with its facts, posted without place.TypeName and typed by the bridge from demo/bds-pilot/bds-dd-layerfree-guideline.json and bds-type-catalog.json (the labels are changesets-typing.test.mjs's STANDARDS). The design's 203 mm wall is a gap under the exact rule (its own line :728), so the wall here is 200 mm; `measured` is still ignored (item 8), so the facts travel as `facts`. vitest proves posted → stored; tools/promote-check reads `stored` into the add-in's DTOs.",
  "posted": {
    "name": "Aster L02 walls from scan",
    "contract": 2,
    "source": { "reader": "sentinel-survey 0.1", "job_id": "job-0042" },
    "elements": [
      {
        "op": "create", "kind": "wall", "cid": "scan-L02-wall-88",
        "place": { "LocationCurve": { "start": [0, 0, 0], "end": [8420, 0, 0] }, "BaseLevel": "L02", "TopLevel": "L03" },
        "facts": { "thickness_mm": 200, "params": { "Location": "Exterior" } },
        "evidence": ["ev-0001#slice-L02", "ev-0003#p1-r12", "ev-0007#crop-3"],
        "reason": "scan wall L02 #88",
        "validate": { "identity": { "Class": "IfcWall" } }
      },
      {
        "op": "retype", "kind": "wall",
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8" },
        "facts": { "thickness_mm": 100, "params": { "Location": "Interior", "Function": "Interior" } },
        "reason": "lod_matrix DD row IfcWall/internal needs an office type",
        "validate": { "identity": { "Class": "IfcWall" } }
      }
    ]
  },
  "stored": {
    "name": "Aster L02 walls from scan",
    "source": "sentinel-survey 0.1",
    "claimed": true,
    "contract": 2,
    "ignored": [
      { "field": "source.job_id", "why": "ignored: no survey job the bridge ran is named by it — the source is marked claimed" }
    ],
    "elements": [
      {
        "kind": "wall", "op": "create", "cid": "scan-L02-wall-88",
        "place": { "LocationCurve": { "start": [0, 0, 0], "end": [8420, 0, 0] }, "BaseLevel": "L02", "TopLevel": "L03", "TypeName": "BDS_EXT_ARC_CMU_200 mm" },
        "facts": { "thickness_mm": 200, "params": { "Location": "Exterior" } },
        "typing": {
          "typed_by": "bridge", "type": "BDS_EXT_ARC_CMU_200 mm", "family": "Basic Wall", "matched": ["param:Location"],
          "input": { "category": "Walls", "params": { "Location": "Exterior" }, "thicknessMm": 200 },
          "guideline": "guideline@1 · office · 0123456789ab…", "catalog": "type_catalog@1 · office · fedcba987654…"
        },
        "pretick": false, "accuracy": { "status": "not_measured" }
      },
      {
        "kind": "wall", "op": "retype",
        "target": { "unique_id": "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8", "type_before": null },
        "place": { "TypeName": "BDS_INT_ARC_CMU_100 mm" },
        "facts": { "thickness_mm": 100, "params": { "Location": "Interior", "Function": "Interior" } },
        "typing": { "typed_by": "bridge", "type": "BDS_INT_ARC_CMU_100 mm", "family": "Basic Wall", "matched": ["param:Location"] },
        "pretick": false, "accuracy": { "status": "not_measured" }
      }
    ]
  }
}
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
import {
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS, TRUST_FIELDS, ADDIN_SOURCES,
  validateChangeset, outlineProblem, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
} from "./changesets-logic.mjs";
```

with

```js
import {
  VOCABULARY, OPS, OP_KINDS, MAX_CHANGESET_ELEMENTS, TRUST_FIELDS, ADDIN_SOURCES,
  validateChangeset, outlineProblem, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures,
} from "./changesets-logic.mjs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
    expect(v.elements[0].proposal_guid).not.toBe("mine");
    for (const f of ["confidence", "typing", "claimed"]) expect(v.elements[0]).not.toHaveProperty(f);
  });
```

with

```js
    expect(v.elements[0].proposal_guid).not.toBe("mine");
    for (const f of ["confidence", "claimed"]) expect(v.elements[0]).not.toHaveProperty(f);
    // MA-2a: typing is the bridge's own record of who typed the element — the posted one above was ignored.
    expect(v.elements[0].typing).toEqual({ typed_by: "caller" });
  });
```

In `WebApp/bridge/changesets-logic.test.mjs`, replace

```js
  it("the add-in's sources are named, so the MCP tool can refuse to file as one", () => {
    expect(ADDIN_SOURCES).toEqual(["dwg", "promote"]);
    expect(TRUST_FIELDS).toEqual(["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"]);
  });
});
```

with

```js
  it("the add-in's sources are named, so the MCP tool can refuse to file as one", () => {
    expect(ADDIN_SOURCES).toEqual(["dwg", "promote"]);
    expect(TRUST_FIELDS).toEqual(["pretick", "accuracy", "confidence", "typing", "claimed", "proposal_guid"]);
  });
});

describe("validateChangeset — bridge typing (MA-2a, full contract 2)", () => {
  const UID = "5a1c2b3d-1111-2222-3333-444455556666-0004c3f8";
  // A typer as changesets-store builds one (changesets-typing makeTyper): here a stand-in that types by thickness alone.
  const typer = (kind, facts, at) => {
    if (!facts?.thickness_mm) throw Object.assign(new Error(`${at}: a ${kind} without place.TypeName is typed by the bridge — no thickness was sent`), { status: 400 });
    return { TypeName: `T${facts.thickness_mm}`, FamilyName: "Basic Wall", typing: { typed_by: "bridge", type: `T${facts.thickness_mm}`, family: "Basic Wall" } };
  };
  const untyped = (over = {}) => { const w = wall(over); delete w.place.TypeName; return w; };
  const FACTS = { thickness_mm: 200, params: { Function: "Exterior", Location: "Exterior" } };
  const retype = (place, facts, uid = UID) => ({ op: "retype", kind: "wall", target: { unique_id: uid, type_before: "T1" }, ...(facts ? { facts } : {}), place, validate: { identity: { Class: "IfcWall", Name: "W 1" } } });

  it("without a typer a create or retype without place.TypeName is the 400 it was", () => {
    status400(() => validateChangeset(CS([untyped({ facts: FACTS })])), /a wall needs place\.TypeName — Sentinel never takes the model's first type/);
    status400(() => validateChangeset(CS([retype({}, FACTS)])), /retype needs place\.TypeName/);
  });

  it("with a typer, a create without TypeName is typed: place.TypeName filled, typing says the bridge did it, the facts kept, no pre-tick, nothing ignored", () => {
    const v = validateChangeset(CS([untyped({ facts: FACTS })]), { type: typer });
    expect(v.elements[0].place.TypeName).toBe("T200");
    expect(v.elements[0].place).not.toHaveProperty("FamilyName"); // a wall takes no FamilyName
    expect(v.elements[0].typing).toEqual({ typed_by: "bridge", type: "T200", family: "Basic Wall" });
    expect(v.elements[0].facts).toEqual(FACTS);
    expect(v.elements[0].pretick).toBe(false);
    expect(v.ignored).toEqual([]);
  });

  it("an element that names its TypeName is the caller's: the typer is not asked, typing says so, facts ride along as a record", () => {
    const asked = [];
    const v = validateChangeset(CS([wall({ facts: FACTS })]), { type: (...a) => { asked.push(a); return typer(...a); } });
    expect(asked).toEqual([]);
    expect(v.elements[0]).toMatchObject({ place: { TypeName: "Generic - 200mm" }, typing: { typed_by: "caller" }, facts: FACTS });
    expect(validateChangeset(CS([wall()]), { type: typer }).elements[0]).not.toHaveProperty("facts");
  });

  it("the typer's refusal is the reply, with the element's index", () => {
    status400(() => validateChangeset(CS([wall(), untyped({ facts: { params: { Location: "Exterior" } } })]), { type: typer }),
      /^elements\[1\]: a wall without place\.TypeName is typed by the bridge — no thickness was sent$/);
  });

  it("a door typed by the bridge takes the rule's FamilyName too (a type name alone is not one type); one that names its family keeps it", () => {
    const door = (place) => ({ kind: "door", facts: { thickness_mm: 1 }, place: { LevelName: "L1", Location: [1, 2, 0], ...place }, validate: { identity: { Class: "IfcDoor", Name: "D" } } });
    const v = validateChangeset(CS([door({}), door({ FamilyName: "Mine" })]), { type: typer });
    expect(v.elements[0].place).toMatchObject({ TypeName: "T1", FamilyName: "Basic Wall" });
    expect(v.elements[1].place).toMatchObject({ TypeName: "T1", FamilyName: "Mine" });
    status400(() => validateChangeset(CS([{ ...door({}), place: { Location: [1, 2, 0] } }]), { type: typer }), /a door needs place\.LevelName/); // the other checks still run
  });

  it("a retype without TypeName is typed from its facts, and is never pre-ticked for that — even a signed-in Promote's", () => {
    const v = validateChangeset(CS([retype({}, FACTS), retype({ TypeName: "T2" }, null, UID.replace(/f8$/, "f9"))], { source: "promote" }), { member: true, type: typer });
    expect(v.elements[0]).toMatchObject({ place: { TypeName: "T200" }, typing: { typed_by: "bridge" }, pretick: false });
    expect(v.elements[1]).toMatchObject({ place: { TypeName: "T2" }, typing: { typed_by: "caller" }, pretick: true });
  });

  it("facts: the shape is checked, an attach takes none, and a stray key is a 400 — never dropped silently", () => {
    status400(() => validateChangeset(CS([wall({ facts: { thickness_mm: 200, measured: true } })])), /facts takes only thickness_mm and params \(got measured\)/);
    status400(() => validateChangeset(CS([wall({ facts: { thickness_mm: "200" } })])), /facts\.thickness_mm must be a number of mm above 0 and at most 10000/);
    status400(() => validateChangeset(CS([wall({ facts: { params: { Location: 7 } } })])), /facts\.params\.Location must be one line of text of at most 256 characters/);
    status400(() => validateChangeset(CS([{ op: "attach", kind: "wall", target: { unique_id: UID }, facts: FACTS, place: { BaseLevel: "L1", TopLevel: "L2" }, validate: { identity: { Class: "IfcWall" } } }])),
      /attach takes no facts — nothing is typed/);
    expect(validateChangeset(CS([wall({ facts: {} })])).elements[0].facts).toEqual({});
  });

  it("a posted typing is ignored and listed (set by the bridge), whichever way the element was typed", () => {
    const v = validateChangeset(CS([untyped({ facts: FACTS, typing: { typed_by: "me" } }), wall({ typing: { typed_by: "me" } })]), { type: typer });
    expect(v.ignored).toEqual([{ field: "elements[0].typing", why: "ignored: set by the bridge" }, { field: "elements[1].typing", why: "ignored: set by the bridge" }]);
    expect(v.elements.map((e) => e.typing.typed_by)).toEqual(["bridge", "caller"]);
  });

  it("the shared fixture: the design's contract-2 body, typed by the real resolver, is stored as the add-in reads it (tools/promote-check reads the same file)", () => {
    const fx = JSON.parse(readFileSync(new URL("./fixtures/changeset-ops/contract2-typed-body.json", import.meta.url), "utf8"));
    const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
    const standards = {
      guideline: { body: read("../../demo/bds-pilot/bds-dd-layerfree-guideline.json"), label: "guideline@1 · office · 0123456789ab…", sha256: "ab".repeat(32) },
      catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · office · fedcba987654…", sha256: "cd".repeat(32) },
    };
    const v = validateChangeset(fx.posted, { type: makeTyper(standards, core) });
    expect(v).toMatchObject(fx.stored);
    expect(v.elements[0].typing.rule).toMatch(/^DD \(MA-2a\): an outside wall/);
    expect(v.elements[1].typing.rule).toMatch(/^DD \(MA-2a\): an inside wall/);
    for (const e of v.elements) expect(e.typing).toMatchObject({ guideline_sha256: "ab".repeat(32), catalog_sha256: "cd".repeat(32) });
    // The body as the design wrote it — a `measured` block and no facts — is still refused, in words: 203 mm is a gap under the exact rule.
    const design = { ...fx.posted, elements: [{ ...fx.posted.elements[0], facts: undefined, measured: { thickness_mm: 203, height_mm: 3050 } }] };
    status400(() => validateChangeset(design, { type: makeTyper(standards, core) }), /no rule of guideline@1 · office · 0123456789ab… matches a wall with no facts/);
  });
});
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
const BODY = { name: "Core walls", source: "test-agent", elements: [wall(), wall()] };
```

with

```js
const BODY = { name: "Core walls", source: "test-agent", elements: [wall(), wall()] };
// MA-2a: a wall posted without place.TypeName, with the facts the bridge types it from.
const untypedWall = (facts = { thickness_mm: 200, params: { Location: "Exterior" } }) => {
  const w = wall(); delete w.place.TypeName; return { ...w, facts };
};
const readRepo = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8"));
const installed = (kind, body) => ({ body, source: "office", ref: `${kind}@1`, sha256: "ab".repeat(32), pointer_sha_mismatch: false });
const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
import { describe, it, expect, vi } from "vitest";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted } from "./changesets-store.mjs";
```

with

```js
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { proposeChangeset, getChangeset, reportResult, withdrawChangeset, listChangesets, reportReverted, needsTyping } from "./changesets-store.mjs";
```

In `WebApp/bridge/changesets-store.test.mjs`, replace

```js
describe("result + withdraw lifecycle", () => {
```

with

```js
describe("proposeChangeset — bridge typing (MA-2a, full contract 2)", () => {
  const standards = {
    guideline: readRepo("demo/bds-pilot/bds-dd-layerfree-guideline.json"),
    type_catalog: readRepo("demo/bds-pilot/bds-type-catalog.json"),
  };
  const resolving = (have) => vi.fn(async (key, kind) => (have[kind] ? installed(kind, have[kind]) : NONE));

  it("needsTyping: only a body with a typed kind that names no TypeName asks for the standards", () => {
    expect(needsTyping(BODY)).toBe(false);
    expect(needsTyping({ elements: [untypedWall()] })).toBe(true);
    expect(needsTyping({ elements: [{ kind: "level", place: { BaseElevation: 0 } }] })).toBe(false);
    expect(needsTyping({ elements: [{ op: "attach", kind: "wall", place: {} }] })).toBe(false);
    expect(needsTyping({ elements: [{ op: "retype", kind: "wall", place: {} }] })).toBe(true);
    expect(needsTyping({ elements: "nope" })).toBe(false);
  });

  it("a wall without place.TypeName is typed from the project's guideline and catalogue (resolved project → office) and stored typed, with who typed it", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    const cs = await proposeChangeset("ma2a", { name: "typed", source: "agent", contract: 2, elements: [untypedWall(), wall()] }, "agent", deps);
    expect(deps.resolveArtefact.mock.calls.map((c) => c.slice(0, 2))).toEqual([["ma2a", "guideline"], ["ma2a", "type_catalog"]]);
    expect(cs.elements[0].place.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm");
    expect(cs.elements[0].typing).toMatchObject({ typed_by: "bridge", type: "BDS_EXT_ARC_CMU_200 mm", family: "Basic Wall", matched: ["param:Location"],
      guideline: "guideline@1 · office · " + "ab".repeat(6) + "…", guideline_sha256: "ab".repeat(32), catalog: "type_catalog@1 · office · " + "ab".repeat(6) + "…" });
    expect(cs.elements[1].typing).toEqual({ typed_by: "caller" });
    expect(cs.elements[0].pretick).toBe(false);
    expect(deps.saved.get(cs.id).elements[0].place.TypeName).toBe("BDS_EXT_ARC_CMU_200 mm"); // stored as typed
    expect(deps.audit.mock.calls[0][6]).toMatchObject({ typed: 1 });
  });

  it("a body whose every element names its TypeName never reads the standards", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    await proposeChangeset("ma2a", BODY, "agent", deps);
    expect(deps.resolveArtefact).not.toHaveBeenCalled();
  });

  it("with no guideline installed the post is a 400 that says so (not checkable), and nothing is stored", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ type_catalog: standards.type_catalog }) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall()] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no guideline is installed for this project or its office \(none — not installed for ma2a or its office\): not checkable/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
  });

  it("a guideline the install validator no longer accepts is none, with its reason", async () => {
    const deps = baseDeps({ resolveArtefact: resolving({ guideline: { standard: "x", elements: [] }, type_catalog: standards.type_catalog }) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall()] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/\(none — guideline@1 · office · abababababab… did not parse: guideline: elements must be a non-empty array\): not checkable/) });
  });

  it("a wall no rule types is a 400 naming the facts it sent; a gap names the catalogue's sizes", async () => {
    const deps = baseDeps({ resolveArtefact: resolving(standards) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall({ thickness_mm: 200, params: { Material: "Stone" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no rule of guideline@1 · office · abababababab… matches a wall with Material Stone, 200 mm/) });
    await expect(proposeChangeset("ma2a", { name: "t", elements: [untypedWall({ thickness_mm: 125, params: { Location: "Interior" } })] }, "agent", deps))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/"BDS_INT_ARC_CMU_125 mm" .* is not in type_catalog@1 · office · abababababab… — the catalogue has BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm/) });
    expect(deps.docInsert).not.toHaveBeenCalled();
  });
});

describe("result + withdraw lifecycle", () => {
```

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js
    ["types[0].width_mm", withItem(catalog, "types", 0, { width_mm: "200" })],
```

with

```js
    ["types[0].width_mm", withItem(catalog, "types", 0, { width_mm: "200" })],
    ["types[0].bic", withItem(catalog, "types", 0, { bic: 5 })],
```

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js
    ["elements[0].default.family", withItem(guideline, "elements", 0, { default: { family: "" } })],
```

with

```js
    ["elements[0].default.family", withItem(guideline, "elements", 0, { default: { family: "" } })],
    // MA-2a: a rule with no condition would match every element the bridge types — refused at install, the strictest of the three
    // validators (review C12): guideline.ts validateGuideline refuses only `when: {}`, the add-in's CheckGuideline neither.
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ when: {}, use: { family: "Basic Wall" } }] })],
    ["elements[0].rules[0].when", withItem(guideline, "elements", 0, { rules: [{ when: { params: {} }, use: { family: "Basic Wall" } }] })],
```

In `WebApp/bridge/artefact-store.test.mjs`, replace

```js
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-elements-guideline.json"))).toBe(true);
```

with

```js
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-elements-guideline.json"))).toBe(true);
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-dd-layerfree-guideline.json"))).toBe(true); // MA-2a: layer-free rules install
    expect(validateArtefact("type_catalog", { ...catalog, types: [{ ...catalog.types[0], bic: "OST_Walls" }, { ...catalog.types[1], bic: null }] })).toBe(true); // BOS-5: a row's bic, or none
```

In `WebApp/bridge/mcp-server.test.mjs`, replace

```js
    expect(t.description).toMatch(/TypeName/);
    expect(t.description).toMatch(/FamilyName/);
```

with

```js
    expect(t.description).toMatch(/TypeName/);
    expect(t.description).toMatch(/FamilyName/);
    expect(t.description).toMatch(/facts \{thickness_mm\?, params\?/); // MA-2a: the bridge types from the facts
    expect(t.description).toMatch(/never measured, never guessed/);
    expect(t.description).toMatch(/400 naming what is missing/);
```

- [ ] **Step 2: Run it, and see it fail.** From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs bridge/changesets-typing.test.mjs bridge/changesets-store.test.mjs bridge/artefact-store.test.mjs bridge/mcp-server.test.mjs`. Expect `9 failed | 247 passed (256)` across `5 failed` files: `changesets-logic` and `changesets-typing` cannot load (`Failed to load url ./changesets-typing.mjs`); in `changesets-store` `needsTyping is not a function` and the four typed posts are still `a wall needs place.TypeName`; in `artefact-store` the `bic` row and the two empty-`when` rules are not refused; in `mcp-server` the description says nothing of `facts`.

- [ ] **Step 3: The typer, the validator, the store, the install validator, the tool.**

`Create` `WebApp/bridge/changesets-typing.mjs`:

```js
// MA-2a: bridge typing — full contract 2. An element posted without place.TypeName is typed here from the project's
// guideline@n and type_catalog@n (artefact-store resolveArtefact: project → office) and the FACTS the poster gave about it —
// its category (from its kind), its thickness and its parameters (Function, Location, Material, …) exactly as posted. The
// bridge measures nothing and reads no model: the facts are the poster's claim, kept on the element as a record.
//
// EXACT OR A 400 (D16, as Promote). The type is an office rule's answer at confidence 1 whose type the catalogue holds; anything
// else is a refusal that names what is missing — no guideline, no catalogue, no matching rule, a {thickness} type with no
// thickness sent, a type the catalogue lacks (with the sizes it has). A category default (confidence 0.6) is not an office
// rule and is refused too: nothing is guessed. The same resolver the add-in's GuidelineMatcher mirrors (sentinel-core.mjs, the
// bundle of src/sentinel-core; the shared layer-free fixture holds both to one answer) decides.
//
// Pure: the resolved bodies and the bundle are handed in, so changesets-logic.test.mjs and this module's own test run without
// a store. changesets-store builds the typer only when a post needs one.
const err = (status, message) => Object.assign(new Error(message), { status });
const text = (s, max) => typeof s === "string" && s.trim() !== "" && s.length <= max;
const CONTROL_CHAR = /[\u0000-\u001f]/;

/** The guideline category each typed changeset kind is resolved under (PlacementPolicy.CategoriesOf names the same ones). A
 *  level or grid is never typed. */
export const KIND_CATEGORY = { wall: "Walls", floor: "Floors", roof: "Roofs", ceiling: "Ceilings", door: "Doors", window: "Windows", column: "Columns", furniture: "Furniture" };
export const FACTS_FIELDS = ["thickness_mm", "params"];
export const MAX_FACT_PARAMS = 20;
export const MAX_THICKNESS_MM = 10000;

/** An element's `facts` as posted → { thickness_mm?, params? } kept name for name, or a 400 naming the fault; null when none
 *  was sent. A stray key is a 400, never dropped: a fact the bridge does not read would be a fact the poster thinks it typed by. */
export function checkFacts(f, at) {
  if (f == null) return null;
  if (typeof f !== "object" || Array.isArray(f)) throw err(400, `${at}: facts must be an object {thickness_mm?, params?}`);
  const extra = Object.keys(f).filter((k) => !FACTS_FIELDS.includes(k));
  if (extra.length) throw err(400, `${at}: facts takes only ${FACTS_FIELDS.join(" and ")} (got ${extra.join(", ")})`);
  const out = {};
  if (f.thickness_mm !== undefined) {
    if (!(typeof f.thickness_mm === "number" && Number.isFinite(f.thickness_mm) && f.thickness_mm > 0 && f.thickness_mm <= MAX_THICKNESS_MM))
      throw err(400, `${at}: facts.thickness_mm must be a number of mm above 0 and at most ${MAX_THICKNESS_MM}`);
    out.thickness_mm = f.thickness_mm;
  }
  if (f.params !== undefined) {
    if (!f.params || typeof f.params !== "object" || Array.isArray(f.params)) throw err(400, `${at}: facts.params must be an object of parameter name: value`);
    const keys = Object.keys(f.params);
    if (keys.length > MAX_FACT_PARAMS) throw err(400, `${at}: facts.params holds at most ${MAX_FACT_PARAMS} parameters (got ${keys.length})`);
    for (const k of keys) {
      if (!text(k, 64) || CONTROL_CHAR.test(k)) throw err(400, `${at}: facts.params has a parameter name that is not one line of at most 64 characters`);
      if (!text(f.params[k], 256) || CONTROL_CHAR.test(f.params[k])) throw err(400, `${at}: facts.params.${k.replace(CONTROL_CHAR, " ").slice(0, 64)} must be one line of text of at most 256 characters`);
    }
    out.params = { ...f.params };
  }
  return out;
}

/** The facts in words, for a refusal: "Function Exterior, Location Exterior, 200 mm"; "no facts" when none were sent. */
export function saidOf(facts) {
  const parts = Object.entries(facts?.params ?? {}).map(([k, v]) => `${k} ${v}`);
  if (facts?.thickness_mm !== undefined) parts.push(`${facts.thickness_mm} mm`);
  return parts.length ? parts.join(", ") : "no facts";
}

/**
 * The typer validateChangeset calls for an element without place.TypeName. `standards` = { guideline, catalog }, each
 * { body (null = none installed, or one that did not parse), label (artefact-store refLabel, or "none — <reason>"), sha256 };
 * `core` = the sentinel-core bundle. Returns (kind, facts, at) → { TypeName, FamilyName, typing }, or throws a 400 that says
 * exactly what is missing. `typing` is the bridge's record: who typed it, the type and family, the rule's own words, the
 * conditions it matched, the input it was given, and which guideline and catalogue decided (label and sha).
 */
export function makeTyper({ guideline: g, catalog: c }, core) {
  return (kind, facts, at) => {
    const category = KIND_CATEGORY[kind];
    const lead = `${at}: a ${kind} without place.TypeName is typed by the bridge from the project's guideline and type catalogue — `;
    const send = "; send place.TypeName, or ";
    if (!category) throw err(400, `${lead}a ${kind} is not typed`);
    if (!g.body) throw err(400, `${lead}no guideline is installed for this project or its office (${g.label}): not checkable${send}install guideline@n`);
    if (!c.body) throw err(400, `${lead}no type catalogue is installed for this project or its office (${c.label}): a type is chosen from the catalogue only (D16)${send}install type_catalog@n`);
    const input = { category, params: facts?.params ?? {}, ...(facts?.thickness_mm !== undefined ? { thicknessMm: facts.thickness_mm } : {}) };
    const r = core.resolveWithCatalog(g.body, input, c.body.types);
    const said = saidOf(facts);
    if (r.source === "none") throw err(400, `${lead}no rule of ${g.label} matches a ${kind} with ${said}${send}add a layer-free rule for it`);
    if (r.source === "default") throw err(400, `${lead}only the ${category} default of ${g.label} would apply (confidence 0.6) — Sentinel types by an office rule only${send}write a rule for ${said}`);
    if (!r.type) throw err(400, `${lead}the rule of ${g.label} for ${said} names its type with {thickness} and no thickness was sent${send}send facts.thickness_mm`);
    if (r.confidence < 1)
      throw err(400, `${lead}"${r.type}" (the rule of ${g.label} for ${said}) is not in ${c.label}` +
        (r.available?.length ? ` — the catalogue has ${r.available.join(", ")}` : " and the catalogue has no other size of it") + `${send}pick one of those`);
    return {
      TypeName: r.type, FamilyName: r.family,
      typing: {
        typed_by: "bridge", type: r.type, family: r.family, rule: r.why ?? null, matched: r.matched ?? [], input,
        guideline: g.label, guideline_sha256: g.sha256 ?? null, catalog: c.label, catalog_sha256: c.sha256 ?? null,
      },
    };
  };
}
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
import { randomUUID } from "node:crypto";
```

with

```js
import { randomUUID } from "node:crypto";
import { checkFacts } from "./changesets-typing.mjs";
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence"]; // what an element is rebuilt from
```

with

```js
// MA-2a: `facts` — the poster's thickness and parameters (Function, Location, Material, …), kept as a record and, on an element
// without place.TypeName, what the bridge types it from (changesets-typing).
const ELEMENT_FIELDS = ["kind", "op", "target", "reason", "validate", "place", "provenance", "cid", "evidence", "facts"]; // what an element is rebuilt from
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
 *  MA-1a item 8: each element also comes back with the bridge's pretick and accuracy, and the changeset with claimed
 *  and the list of what was ignored. */
export function validateChangeset(body, { member = false } = {}) {
```

with

```js
 *  MA-1a item 8: each element also comes back with the bridge's pretick and accuracy, and the changeset with claimed
 *  and the list of what was ignored.
 *  MA-2a (full contract 2): with `type` — the typer changesets-typing.makeTyper builds from the project's guideline and
 *  catalogue — a create or retype without place.TypeName is typed from its facts (TypeName, and FamilyName for a point kind,
 *  filled; `typing` says the bridge did it and from what), or refused in the typer's words; without one it is the 400 it was.
 *  Every element carries `typing` ({typed_by: "caller"} for one that named its type); a bridge-typed one is never pre-ticked. */
export function validateChangeset(body, { member = false, type = null } = {}) {
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
    let target = null;
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if (el.kind !== "level" && el.kind !== "grid" && !text(el.place.TypeName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
      if (POINT_KINDS.includes(el.kind) && !text(el.place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", ...POINT_KINDS].includes(el.kind) && !text(el.place.LevelName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.LevelName — Sentinel never picks its level`);
    } else {
```

with

```js
    // Review amendment C3: rebuilt from the names the add-in reads — a posted place.pretick or place.measured is not stored.
    const place = Object.fromEntries(Object.entries(isBlock(el.place) ? el.place : {}).filter(([k]) => PLACE_KEPT.includes(k)));
    // MA-2a: the poster's facts, checked and kept name for name; an attach types nothing, so it takes none.
    const facts = checkFacts(el.facts, at);
    if (facts && op === "attach") throw err(400, `${at}: attach takes no facts — nothing is typed`);
    let typed = null; // the bridge's typing of this element, when it had to type it
    const typeIt = () => {
      typed = type(el.kind, facts, at); // a 400 in the typer's words when it cannot
      place.TypeName = typed.TypeName;
      if (POINT_KINDS.includes(el.kind) && !text(place.FamilyName, 256) && text(typed.FamilyName, 256)) place.FamilyName = typed.FamilyName;
    };
    let target = null;
    if (op === "create") {
      checkPlace(el.kind, el.place, at);
      // After checkPlace, so a geometry error still reads as one. The Revit executor refuses an empty type too.
      if (el.kind !== "level" && el.kind !== "grid" && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: a ${el.kind} needs place.TypeName — Sentinel never takes the model's first type`);
        typeIt();
      }
      if (POINT_KINDS.includes(el.kind) && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.FamilyName — a type name alone is not one type`);
      if (["roof", "ceiling", ...POINT_KINDS].includes(el.kind) && !text(place.LevelName, 256))
        throw err(400, `${at}: a ${el.kind} needs place.LevelName — Sentinel never picks its level`);
    } else {
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      if (op === "retype" && !text(p.TypeName, 256)) throw err(400, `${at}: retype needs place.TypeName`);
      if (op === "retype" && (el.kind === "door" || el.kind === "window") && !text(p.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type`);
```

with

```js
      if (op === "retype" && !text(place.TypeName, 256)) {
        if (!type) throw err(400, `${at}: retype needs place.TypeName`);
        typeIt();
      }
      if (op === "retype" && (el.kind === "door" || el.kind === "window") && !text(place.FamilyName, 256))
        throw err(400, `${at}: a ${el.kind} retype needs place.FamilyName — a type name alone is not one type`);
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
    const entries = (list, where) => (list || []).map((x, j) => { nested(x, null, `${at}.validate.${where}[${j}]`); return untrusted(x); });
    const place = Object.fromEntries(Object.entries(isBlock(el.place) ? el.place : {}).filter(([k]) => PLACE_KEPT.includes(k)));
    // The curve too is rebuilt from the names the add-in reads (start, end, an arc's mid): a key inside it is listed, not stored.
```

with

```js
    const entries = (list, where) => (list || []).map((x, j) => { nested(x, null, `${at}.validate.${where}[${j}]`); return untrusted(x); });
    // The curve too is rebuilt from the names the add-in reads (start, end, an arc's mid): a key inside it is listed, not stored.
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      // Review amendment C3: rebuilt from the names the add-in reads — a posted place.pretick or place.measured is not stored.
      place,
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
```

with

```js
      place,
      ...(provenance ? { provenance } : {}), // MA-1a item 4: only when sent, so every other changeset reads as before
      // MA-2a: the poster's facts as a record, and the bridge's own account of who typed the element — its rule, its input,
      // and which guideline and catalogue decided — or "caller" for an element that named its type.
      ...(facts ? { facts } : {}),
      typing: typed ? typed.typing : { typed_by: "caller" },
```

In `WebApp/bridge/changesets-logic.mjs`, replace

```js
      // MA-1a item 8: the bridge's own trust decisions. No survey job exists yet, so nothing is measured.
      pretick: pretickOf(op, source, target, member),
```

with

```js
      // MA-1a item 8: the bridge's own trust decisions. No survey job exists yet, so nothing is measured. MA-2a: an element the
      // bridge typed from posted facts is never pre-ticked for that — the facts are the poster's claim.
      pretick: typed ? false : pretickOf(op, source, target, member),
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures } from "./changesets-logic.mjs";
import { resolveActor } from "./bridge-auth.mjs";
```

with

```js
import { validateChangeset, attachVerdicts, canWithdraw, deriveResultStatus, unattributedFailures } from "./changesets-logic.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { resolveArtefact, refLabel, validateArtefact } from "./artefact-store.mjs";
import { resolveActor } from "./bridge-auth.mjs";
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
});
```

with

```js
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || resolveArtefact,
});

/** MA-2a: does a posted body hold an element the bridge would have to type — a create or retype of a typed kind (not a level or
 *  grid, never an attach) that names no place.TypeName? Only then are the standards read. */
export const needsTyping = (body) => Array.isArray(body?.elements) && body.elements.some((e) => e && typeof e === "object"
  && (e.op ?? "create") !== "attach" && e.kind !== "level" && e.kind !== "grid"
  && !(e.place && typeof e.place === "object" && typeof e.place.TypeName === "string" && e.place.TypeName.trim() !== ""));

/** The typer for `key`: its guideline@n and type_catalog@n (project → office), each re-checked with the install validator — one
 *  installed before a check existed is none with its reason — and the bundle's resolver. The GET is the add-in's read too. */
async function typerFor(key, d) {
  const core = await import("./sentinel-core.mjs");
  const read = async (kind) => {
    const a = await d.resolveArtefact(key, kind);
    if (a.source === "none") return { body: null, label: `none — not installed for ${key} or its office`, sha256: null };
    try { validateArtefact(kind, a.body); } catch (e) { return { body: null, label: `none — ${refLabel(a)} did not parse: ${e.message}`, sha256: null }; }
    return { body: a.body, label: refLabel(a), sha256: a.sha256 };
  };
  const [guideline, catalog] = await Promise.all([read("guideline"), read("type_catalog")]);
  return makeTyper({ guideline, catalog }, core);
}
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
  const role = await d.myRole(key);
  const v = validateChangeset(body, { member: role != null && role !== "service" }); // 400/413 before any changeset is stored
```

with

```js
  const role = await d.myRole(key);
  // MA-2a (full contract 2): an element without place.TypeName is typed from the project's guideline@n and type_catalog@n by the
  // resolver the add-in's matcher mirrors, or refused in words; the standards are read only when a post needs them.
  const type = needsTyping(body) ? await typerFor(key, d) : null;
  const v = validateChangeset(body, { member: role != null && role !== "service", type }); // 400/413 before any changeset is stored
```

In `WebApp/bridge/changesets-store.mjs`, replace

```js
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source,
      claimed: v.claimed, ignored: v.ignored.length });
```

with

```js
    { name: v.name, source: v.source, elements: changeset.elements.length, exceptions: v.exceptions.length, verdict: adj.verdict, ids_source: adj.ids_source,
      claimed: v.claimed, ignored: v.ignored.length, typed: v.elements.filter((e) => e.typing?.typed_by === "bridge").length });
```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
      objects(kind, `${at}.rules`, e.rules, (r, rat) => {
        if (!isObj(r.when)) throw bad(kind, `${rat}.when`, "must be an object");
        if (!isObj(r.use) || !filled(r.use.family)) throw bad(kind, `${rat}.use.family`, "must be a non-empty string");
      });
```

with

```js
      objects(kind, `${at}.rules`, e.rules, (r, rat) => {
        if (!isObj(r.when)) throw bad(kind, `${rat}.when`, "must be an object");
        if (!isObj(r.use) || !filled(r.use.family)) throw bad(kind, `${rat}.use.family`, "must be a non-empty string");
        // MA-2a: a rule that states no condition would match every element the bridge types (guideline.ts validateGuideline says
        // the same). Refused at install only: the add-in reads an installed body as it is.
        if (!["layer", "level", "discipline"].some((f) => filled(r.when[f])) && !(isObj(r.when.params) && Object.keys(r.when.params).length))
          throw bad(kind, `${rat}.when`, "names no condition (layer, level, discipline or params) — it would match every element; use default");
      });
```

In `WebApp/bridge/artefact-store.mjs`, replace

```js
      for (const f of ["width_mm", "height_mm"]) if (t[f] != null && !Number.isFinite(t[f])) throw bad(kind, `${at}.${f}`, "must be a number or null");
    });
```

with

```js
      for (const f of ["width_mm", "height_mm"]) if (t[f] != null && !Number.isFinite(t[f])) throw bad(kind, `${at}.${f}`, "must be a number or null");
      // MA-2a (BOS-5): the row's BuiltInCategory, as Build Office System writes it since MA-2a; a type_catalog@1 without it still installs.
      if (t.bic != null && typeof t.bic !== "string") throw bad(kind, `${at}.bic`, "must be a string (a BuiltInCategory name)");
    });
```

In `WebApp/bridge/mcp-server.mjs`, replace

```js
Every kind but a level or grid also needs place.TypeName, the exact name of a type already loaded in the model — Sentinel never takes the model's first type, loads no families and creates no types — and may carry place.Mark;
```

with

```js
Every kind but a level or grid also needs place.TypeName, the exact name of a type already loaded in the model — Sentinel never takes the model's first type, loads no families and creates no types — or, on a project whose guideline and type catalogue are installed, leaves TypeName out and sends facts {thickness_mm?, params?: {Function?, Location?, Material?, …}}: the bridge then types the element by the office's layer-free rules from exactly those facts (never measured, never guessed), fills place.TypeName (and a door's or window's FamilyName) with a type the catalogue holds, records who typed it and from what in `typing`, and otherwise answers 400 naming what is missing (no guideline or catalogue installed, no rule for those facts, no thickness for a {thickness} type, a type the catalogue lacks and the sizes it has); an element the bridge typed is never pre-ticked. Any create may carry place.Mark;
```

In `WebApp/bridge/mcp-server.mjs`, replace

```js
to place.TypeName (a door or window also needs place.FamilyName: it keeps its host);
```

with

```js
to place.TypeName — or, with facts, to the type the bridge resolves (a door or window also needs place.FamilyName: it keeps its host);
```

- [ ] **Step 4: Run it, and see it pass.** From `WebApp`: the same five files. Expect `Test Files  5 passed (5)` and `Tests  346 passed (346)` (`changesets-logic` 85, nine more than master; `changesets-typing` 5; `changesets-store` 34, six more; `artefact-store` 190, three more; `mcp-server` 32). Then `npx vitest run bridge/` — expect `Test Files  85 passed (85)`, `Tests  1705 passed | 1 skipped (1706)` (master `83` files, `1679`).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/bridge/changesets-typing.mjs WebApp/bridge/changesets-typing.test.mjs WebApp/bridge/changesets-logic.mjs WebApp/bridge/changesets-logic.test.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs WebApp/bridge/fixtures/changeset-ops/contract2-typed-body.json
git commit -F - <<'EOF'
feat(bridge): full contract 2 - an element posted without place.TypeName is typed from its facts by the project's guideline and catalogue, or refused in words; typing says who typed it; a bridge-typed element is never pre-ticked (MA-2a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 4 — Pure C#: the outer boundary, Promote passes Function, Location and Material, the bridge-typed body read, the drill drawing

**Files:**
- Create `SentinelAddin/GhostBuilder/WallLocation.cs` — pure: `Segment`, `Locate`, `Summary`, `RayMeets`
- Modify `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs` — `WallFact.Line`, `WallFact.Material`; the one-type pre-pass; the params; the reasons; `What`
- Modify `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` — `RuleLocation` (review C6)
- Modify `SentinelAddin/GhostBuilder/PromotePlanner.cs` — `Swap` reads a host rule's location through `RuleLocation`
- Modify `SentinelAddin/Coordination/ChangesetClient.cs` — `TypingDto`, `ChangesetElementDto.Typing`, `ChangesetTrust.Typing`
- Modify `demo/ghost-sample/make-sample.py` — `--ma2a`; generated: `sample-walls-ma2a.dxf`, `sample-walls-ma2a-expected.json`
- Create `tools/promote-check/LayerFreePlanner.cs`; modify `Planner.cs`, `Check.cs`, `promote-check.csproj`; modify `WebApp/bridge/fixtures/changeset-ops/promote-body.json` (one string)

**Interfaces:** `WallLocation.Segment { X0, Y0, X1, Y1, WidthMm; Curved }` (mm, in plan). `WallLocation.Locate(walls, i, out why)` → `"Exterior"` | `"Interior"` | `null` with `why` in plain words (`both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it`; `a curved wall — its sides are not read (MA-2a reads straight walls)`; `only N other wall(s) on the storey — no outline to be inside or outside of`; `N mm long — too short to look out from (under 500 mm)`; `no location line was read`). Constants: `ClearMm` 100, `MinLengthMm` 500, `MinOthers` 3, `TolMm` 1. `WallLocation.Summary(ext, int, unk)` → `outer boundary: N outside · M inside · K unknown`. `WallFact.Line` (a `Segment`, null when none was read), `WallFact.Material` (the label, null when none). Promote's reason: `DD walls v0: <what the rule used>, <mm> mm → <type>`; the one-type hold: `every wall on <storey>[ besides the N on other office types] is "<type>" — inside cannot be told from outside: its Function tells nothing, and <standard> has no rule for Location <loc> | its location is unknown (<why>); a person decides`; no rule on a mixed storey: `no DD rule for <facts> in <standard>[ (location unknown: <why>)]`; a mixed storey's Function against its reading (C2): `Function Exterior but it reads inside (both sides enclosed — a courtyard, or a misread outline); a person decides` / `Function Interior but it reads outside (one side looks out of the storey's outline); a person decides`. The barrier list (C1, E28): the storey's walls first, then every other wall whose base ≤ the storey's elevation + 1 mm < its top. `GuidelineMatcher.RuleLocation(category, typeName)` (C6) → each producing rule's `Function`, else its `Location`; one distinct value or null. `TypingDto { TypedBy, Type, Family, Rule, Guideline, Catalog }`; `ChangesetTrust.Typing(el)` → `typed by the bridge from the facts posted (<guideline label>)` or null. `make-sample.py --ma2a` writes the drawing (seven walls as two faces each: four 200 mm on `A-WALL-EXT`, three 100 mm on `A-WALL-INT`, at origin (60000, 60000)) and the expected file (`walls[].location`: four `Exterior`, two `Interior`, one `null`).

- [ ] **Step 1: The failing checks, the fixture's changed string, and the generator.**

`Create` `tools/promote-check/LayerFreePlanner.cs`:

```csharp
#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 24. MA-2a: the outer boundary (WallLocation), Promote's layer-free params, the bridge-typed body as the add-in reads it,
    //        and the drill drawing's own numbers (make-sample.py --ma2a) ─────────────────────────────────────────────────────
    static WallLocation.Segment Seg(double x0, double y0, double x1, double y1, double w = 200, bool curved = false) =>
        new WallLocation.Segment { X0 = x0, Y0 = y0, X1 = x1, Y1 = y1, WidthMm = w, Curved = curved };

    // make-concept.py's layout: a 24 x 12 m outline of eight walls, ten partitions off the corridor, two free-standing gap walls in it.
    static List<WallLocation.Segment> Concept()
    {
        var s = new List<WallLocation.Segment>
        {
            Seg(0, 0, 12000, 0), Seg(12000, 0, 24000, 0), Seg(24000, 0, 24000, 6000), Seg(24000, 6000, 24000, 12000),
            Seg(24000, 12000, 12000, 12000), Seg(12000, 12000, 0, 12000), Seg(0, 12000, 0, 6000), Seg(0, 6000, 0, 0),
        };
        foreach (var x in new[] { 4000, 8000, 12000, 16000, 20000 }) { s.Add(Seg(x, 0, x, 4500, 100)); s.Add(Seg(x, 7500, x, 12000, 100)); }
        s.Add(Seg(2000, 6000, 6000, 6000, 125)); s.Add(Seg(18000, 6000, 22000, 6000, 125));
        return s;
    }

    static string Loc(IReadOnlyList<WallLocation.Segment> walls, int i) => WallLocation.Locate(walls, i, out _);
    static string Why(IReadOnlyList<WallLocation.Segment> walls, int i) { WallLocation.Locate(walls, i, out var why); return why; }

    static void WallLocationChecks()
    {
        Console.WriteLine("\nMA-2a — the outer boundary (WallLocation.Locate)");
        var c = Concept();
        Ok(Enumerable.Range(0, 8).All(i => Loc(c, i) == "Exterior"), "the concept layout: all eight outline walls read Exterior");
        Ok(Enumerable.Range(8, 10).All(i => Loc(c, i) == "Interior"), "…its ten partitions read Interior");
        Ok(Loc(c, 18) == "Interior" && Loc(c, 19) == "Interior", "…and the two free-standing gap walls in the corridor read Interior (a ray along a partition's line is stopped by it)");

        var free = Concept(); free.Add(Seg(30000, 0, 34000, 0));
        Ok(Loc(free, 20) == null && Why(free, 20) == "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it",
           "a wall standing outside the outline is unknown: both sides open, in words");
        Ok(Enumerable.Range(0, 8).All(i => Loc(free, i) == "Exterior"), "…and it does not change the outline walls' reading");

        var curved = Concept(); curved.Add(Seg(2000, 9000, 6000, 9000, 200, curved: true));
        Ok(Loc(curved, 20) == null && Why(curved, 20) == "a curved wall — its sides are not read (MA-2a reads straight walls)", "a curved wall is unknown, in words");
        var few = new List<WallLocation.Segment> { Seg(0, 0, 5000, 0), Seg(5000, 0, 5000, 5000), Seg(5000, 5000, 0, 5000) };
        Ok(Loc(few, 0) == null && Why(few, 0) == "only 2 other wall(s) on the storey — no outline to be inside or outside of", "fewer than three other walls: unknown, in words");
        var shortWall = Concept(); shortWall.Add(Seg(6000, 2000, 6300, 2000, 100));
        Ok(Loc(shortWall, 20) == null && Why(shortWall, 20) == "300 mm long — too short to look out from (under 500 mm)", "a wall under 500 mm is unknown, in words");
        var noLine = Concept(); noLine.Add(null);
        Ok(Loc(noLine, 20) == null && Why(noLine, 20) == "no location line was read" && Loc(noLine, 0) == "Exterior", "a wall with no line read is unknown and is no barrier");

        // An L: the two inner-corner walls are outside too (a convex hull would have called them inside).
        var l = new List<WallLocation.Segment> { Seg(0, 0, 12000, 0), Seg(12000, 0, 12000, 6000), Seg(12000, 6000, 6000, 6000), Seg(6000, 6000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0) };
        Ok(Enumerable.Range(0, 6).All(i => Loc(l, i) == "Exterior"), "an L-shaped outline: every wall reads Exterior, the inner corner's two included");
        // A U: the walls facing the open courtyard look out through its open side.
        var u = new List<WallLocation.Segment> { Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 12000, 12000), Seg(12000, 12000, 12000, 4000),
                                                 Seg(12000, 4000, 6000, 4000), Seg(6000, 4000, 6000, 12000), Seg(6000, 12000, 0, 12000), Seg(0, 12000, 0, 0) };
        Ok(Enumerable.Range(0, 8).All(i => Loc(u, i) == "Exterior"), "a U-shaped outline: the three courtyard walls read Exterior through the open side");
        // An O: a closed inner courtyard — its four walls read Interior (the stated ceiling: every direction meets a wall).
        var o = new List<WallLocation.Segment> { Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
                                                 Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000) };
        Ok(Enumerable.Range(0, 4).All(i => Loc(o, i) == "Exterior") && Enumerable.Range(4, 4).All(i => Loc(o, i) == "Interior"),
           "a closed courtyard's walls read Interior — the ceiling the file states, pinned so a change is seen");
        Ok(WallLocation.Summary(8, 12, 1) == "outer boundary: 8 outside · 12 inside · 1 unknown", "the summary line");
    }

    // The O layout again, for the planner's checks: a closed inner courtyard inside an 18 x 12 m outline.
    static List<WallLocation.Segment> Courtyard() => new List<WallLocation.Segment>
    {
        Seg(0, 0, 18000, 0), Seg(18000, 0, 18000, 12000), Seg(18000, 12000, 0, 12000), Seg(0, 12000, 0, 0),
        Seg(6000, 4000, 12000, 4000), Seg(12000, 4000, 12000, 8000), Seg(12000, 8000, 6000, 8000), Seg(6000, 8000, 6000, 4000),
    };

    // The layer-free rule file through Promote's planner: a one-type storey types by location, an unknown location goes to a person.
    static void PlannerLayerFreeChecks(GuidelineMatcher m, GuidelineMatcher m3)
    {
        Console.WriteLine("\nMA-2a — Promote passes Function, Location and Material (PromoteWallsPlanner with the layer-free file)");
        var docTypes = new Dictionary<string, string>(DocTypes, StringComparer.OrdinalIgnoreCase)
            { ["BDS_INT_ARC_CMU_200 mm"] = "Interior", ["BDS_INT_ARC_CMU_100 mm"] = "Interior", ["BDS_EXT_ARC_CMU_100 mm"] = "Exterior" };
        var layout = Concept(); layout.Add(Seg(30000, 0, 34000, 0));
        // Every wall Generic - 200mm, Function Exterior (the template's default): the one-type storey MA-0 held whole.
        var oneType = layout.Select((s, i) => W($"W{i + 1}", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var plan = PromoteWallsPlanner.Plan(oneType, Levels, docTypes, m3).Single();
        PromoteGhost G(StoreyPlan p, string label) => p.Ghosts.FirstOrDefault(g => g.Op == "retype" && g.Label == label);
        Ok(plan.OneType && plan.Ghosts.Count(g => g.Op == "retype") == 20 && plan.Held.Count == 1, $"a one-type storey of 21 walls: 20 retypes by location, 1 held ({plan.Held.Count})");
        Ok(Enumerable.Range(1, 8).All(n => G(plan, $"W{n}")?.TypeName == "BDS_EXT_ARC_CMU_200 mm") && G(plan, "W1").Reason == "DD walls v0: Location Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
           "the eight outline walls → BDS_EXT_ARC_CMU_200 mm, the reason naming what the rule used: Location Exterior, not the Function that told nothing");
        Ok(Enumerable.Range(9, 12).All(n => G(plan, $"W{n}")?.TypeName == "BDS_INT_ARC_CMU_200 mm"), "the twelve inside walls → BDS_INT_ARC_CMU_200 mm");
        Ok(plan.Held.Single().Label == "W21" && plan.Held.Single().Reason ==
           "every wall on Level 1 is \"Generic - 200mm\" — inside cannot be told from outside: its Function tells nothing, and its location is unknown (both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it); a person decides",
           "the wall outside the outline is held with the location's reason, never typed by the Function that told nothing");
        // The same storey with MA-0's Function-only file: location is known but the file has no rule for it — held, in words.
        var old = PromoteWallsPlanner.Plan(oneType, Levels, docTypes, m).Single();
        Ok(old.Ghosts.Count(g => g.Op == "retype") == 0 && old.Held.Count == 21
           && old.Held.First(h => h.Label == "W1").Reason == "every wall on Level 1 is \"Generic - 200mm\" — inside cannot be told from outside: its Function tells nothing, and BDS DD walls v0 (MA-0) has no rule for Location Exterior; a person decides",
           "with MA-0's Function-only file the one-type storey is still held whole, and each reason says the file has no rule for the location read");
        // A mixed storey: Function is a modelling decision and is passed; Location wins where it is read; Material refines.
        var mixed = new List<WallFact>
        {
            W("E1", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = layout[0]),
            W("I1", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = layout[8]),
            W("I2", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => { w.Line = layout[9]; w.Material = "Gypsum Wall Board / Metal Stud"; }),
            W("F1", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = layout[20]),
            W("N1", "Generic - 200mm", "Exterior", 200, top: "Level 2"),
        };
        var others = layout.Skip(1).Take(7).Select((s, i) => W($"O{i}", "BDS_EXT_STR_CONC_200 mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var mp = PromoteWallsPlanner.Plan(mixed.Concat(others).ToList(), Levels, docTypes, m3).Single();
        Ok(!mp.OneType && G(mp, "E1")?.Reason == "DD walls v0: Location Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm", "a mixed storey: an outline wall types by Location");
        Ok(G(mp, "I1")?.TypeName == "BDS_INT_ARC_CMU_100 mm" && G(mp, "I1").Reason == "DD walls v0: Location Interior, 100 mm → BDS_INT_ARC_CMU_100 mm",
           "an inside wall types by Location (the Location rule is listed before the Function rule)");
        Ok(G(mp, "I2")?.TypeName == "BDS_INT_ARC_GYPS_100 mm" && G(mp, "I2").Reason == "DD walls v0: Location Interior, Material Gypsum Wall Board / Metal Stud, 100 mm → BDS_INT_ARC_GYPS_100 mm",
           "a wall whose build-up names gypsum types by Location and Material, and the reason says both");
        Ok(G(mp, "F1")?.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm" && G(mp, "N1")?.Reason == "DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm",
           "a wall whose location is unknown, or whose line was not read, falls to the Function rule on a mixed storey — as MA-0 typed it");
        var none = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json")).Replace("\"Function\": \"Exterior\"", "\"Function\": \"Soffit\""),
                                               File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        var np = PromoteWallsPlanner.Plan(mixed.Take(4).Concat(others).ToList(), Levels, docTypes, none).Single();
        Ok(np.Held.Any(h => h.Label == "F1" && h.Reason == "no DD rule for Function Exterior in BDS DD walls, layer-free v0 (MA-2a) — DRAFT (location unknown: both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it)"),
           "with no rule for its Function either, the held reason names the facts passed and why the location is unknown");

        // Review C2: on a mixed storey a type's Function that disagrees with the reading is held, never outvoted by the file's order.
        // The O layout's courtyard walls carry Function Exterior (a courtyard wall is one) and read Interior; its east outline wall
        // is a Function-Interior type here and reads Exterior.
        var court = Courtyard();
        var cw = court.Select((s, i) => i == 1 ? W("C2", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = s)
                                               : W($"C{i + 1}", "Generic - 200mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        cw.Add(W("CI", "MA0 Interior - 100mm", "Interior", 100, top: "Level 2", set: w => w.Line = Seg(2000, 2000, 2000, 10000, 100)));
        var cp = PromoteWallsPlanner.Plan(cw, Levels, docTypes, m3).Single();
        Ok(!cp.OneType && cp.Ghosts.Count(g => g.Op == "retype") == 4 && G(cp, "C1")?.TypeName == "BDS_EXT_ARC_CMU_200 mm" && G(cp, "CI")?.TypeName == "BDS_INT_ARC_CMU_100 mm"
           && Enumerable.Range(5, 4).All(n => cp.Held.Any(h => h.Label == $"C{n}" && h.Reason == "Function Exterior but it reads inside (both sides enclosed — a courtyard, or a misread outline); a person decides")),
           "a mixed storey: the four courtyard walls (Function Exterior, reading Interior) are held in words, 0 retyped to an internal type; the outline and the partition, where both agree, retype (review C2)");
        Ok(cp.Held.Any(h => h.Label == "C2" && h.Reason == "Function Interior but it reads outside (one side looks out of the storey's outline); a person decides"),
           "…and an outline wall of a Function-Interior type is held the other way round");

        // Review C1: the storey's barriers are its own walls AND every wall that crosses its plane. A shell based on Level 1 rising to
        // the Roof encloses Level 2: a room of four partitions there reads Interior. The same room with no shell reads Exterior on
        // every wall (each has one side open) — the barrier list is what decides.
        var shell = Concept().Take(8).Select((s, i) => W($"S{i + 1}", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Roof", set: w => w.Line = s)).ToList();
        var roomSegs = new[] { Seg(8000, 4000, 16000, 4000, 100), Seg(16000, 4000, 16000, 8000, 100), Seg(16000, 8000, 8000, 8000, 100), Seg(8000, 8000, 8000, 4000, 100) };
        List<WallFact> Room() => roomSegs.Select((s, i) => W($"R{i + 1}", "MA0 Interior - 100mm", "Interior", 100, baseLevel: "Level 2", top: "Roof", set: w => w.Line = s)).ToList();
        var l2 = PromoteWallsPlanner.Plan(shell.Concat(Room()).ToList(), Levels, docTypes, m3).Single(p => p.Storey == "Level 2");
        Ok(l2.OneType && l2.Held.Count == 0 && l2.Ghosts.Count(g => g.Op == "retype") == 4
           && Enumerable.Range(1, 4).All(n => G(l2, $"R{n}")?.Reason == "DD walls v0: Location Interior, 100 mm → BDS_INT_ARC_CMU_100 mm"),
           "a shell based on Level 1 rising to the Roof is a barrier on Level 2: a room of four partitions there reads Interior, none Exterior (review C1)");
        var alone = PromoteWallsPlanner.Plan(Room(), Levels, docTypes, m3).Single();
        Ok(alone.Ghosts.Count(g => g.Op == "retype") == 4 && Enumerable.Range(1, 4).All(n => G(alone, $"R{n}")?.TypeName == "BDS_EXT_ARC_CMU_100 mm"),
           "…the same room with no shell reads Exterior on every wall — the barrier list is what decides");
        var low = Concept().Take(8).Select((s, i) => W($"L{i + 1}", "BDS_EXT_ARC_CMU_200 mm", "Exterior", 200, top: "Level 2", set: w => w.Line = s)).ToList();
        var l2low = PromoteWallsPlanner.Plan(low.Concat(Room()).ToList(), Levels, docTypes, m3).Single(p => p.Storey == "Level 2");
        Ok(Enumerable.Range(1, 4).All(n => G(l2low, $"R{n}")?.TypeName == "BDS_EXT_ARC_CMU_100 mm"), "…and a shell that stops AT Level 2 (top = the plane) is no barrier there");

        Console.WriteLine("\nMA-2a — a door's location from a host settled by a Location rule (PromotePlanner.Swap, GuidelineMatcher.RuleLocation)");
        string catalogText = File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json"));
        string layerFree = File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-layerfree-guideline.json"));
        var doorsG = JsonNode.Parse(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-elements-guideline.json"))).AsObject();
        var wallsBlock = doorsG["elements"].AsArray().First(e => (string)e["category"] == "Walls");
        wallsBlock["rules"] = JsonNode.Parse(layerFree)["elements"][0]["rules"].DeepClone();
        var md = GuidelineMatcher.FromBodies(doorsG.ToJsonString(), catalogText, out var dge, out _);
        Ok(dge == null && md.RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Function") == null && md.RuleParam("Walls", "BDS_INT_ARC_GYPS_100 mm", "Location") == null
           && md.RuleLocation("Walls", "BDS_INT_ARC_GYPS_100 mm") == "Interior" && md.RuleLocation("Walls", "BDS_INT_ARC_CMU_100 mm") == "Interior" && md.RuleLocation("Walls", "BDS_EXT_ARC_CMU_200 mm") == "Exterior",
           "the gypsum type is produced by a Location+Material rule and a Function rule: RuleParam names no one Function and no one Location, RuleLocation reads Function else Location per rule and names Interior (review C6)");
        var door = Dw("door", "D1", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, host: "BDS_INT_ARC_CMU_100 mm", hostFn: "Interior");
        var dp = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { door }, Levels, docTypes, V1Types(), md);
        Ok(dp.SelectMany(p => p.Ghosts).Any(g => g.Label == "D1" && g.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a door in a host the Location rule settled is swapped by that location");
        var inGyps = Dw("door", "D2", "M_Single-Flush", "MA1 1000 x 2100mm", 1000, 2100, host: "BDS_INT_ARC_GYPS_100 mm", hostFn: "Interior");
        var dp2 = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { inGyps }, Levels, docTypes, V1Types(), md);
        Ok(dp2.SelectMany(p => p.Ghosts).Any(g => g.Label == "D2" && g.TypeName == "BDS_INT_1 PNL_WOOD_1000 x 2100 mm"),
           "a door in the gypsum partition — the common case the DD file exists for — is swapped too (it was held under RuleParam)");
        // A true disagreement: the gypsum type produced by a Location Interior rule AND a Function Exterior rule — held, in words.
        wallsBlock["rules"] = JsonNode.Parse(layerFree.Replace("\"Function\": \"Interior\"", "\"Function\": \"Exterior\""))["elements"][0]["rules"].DeepClone();
        var mdx = GuidelineMatcher.FromBodies(doorsG.ToJsonString(), catalogText, out _, out _);
        var dp3 = PromotePlanner.Plan(new[] { "Doors" }, new List<WallFact>(), new[] { inGyps }, Levels, docTypes, V1Types(), mdx);
        Ok(mdx.RuleLocation("Walls", "BDS_INT_ARC_GYPS_100 mm") == null
           && dp3.SelectMany(p => p.Held).Any(h => h.Label == "D2" && h.Reason == "host BDS_INT_ARC_GYPS_100 mm: its DD rules do not name one Function or Location — a person decides"),
           "a host whose producing rules say Interior (Location) and Exterior (Function) names no one location: held, in words");
    }

    // The bridge-typed body as the add-in reads it (the `stored` half of the shared fixture vitest proves from `posted`).
    static void TypedBodyChecks()
    {
        Console.WriteLine("\nMA-2a — the bridge-typed changeset as the add-in reads it (contract2-typed-body.json)");
        string stored;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-typed-body.json"))))
            stored = fx.RootElement.GetProperty("stored").GetRawText();
        var cs = JsonSerializer.Deserialize<ChangesetDto>(stored);
        foreach (var e in cs.Elements) e.Verdict = new ElementVerdictDto { Status = "recorded" };
        Ok(cs.Elements[0].Place.TypeName == "BDS_EXT_ARC_CMU_200 mm" && cs.Elements[1].Place.TypeName == "BDS_INT_ARC_CMU_100 mm",
           "the executor reads the type the bridge filled into place.TypeName, as for any other changeset");
        Ok(cs.Elements[0].Typing?.TypedBy == "bridge" && cs.Elements[0].Typing.Type == "BDS_EXT_ARC_CMU_200 mm" && cs.Elements[0].Typing.Family == "Basic Wall"
           && cs.Elements[0].Typing.Guideline == "guideline@1 · office · 0123456789ab…",
           "typing reads who typed it, the type and family, and which guideline decided");
        Ok(ChangesetTrust.Typing(cs.Elements[0]) == "typed by the bridge from the facts posted (guideline@1 · office · 0123456789ab…)",
           "the review's words for a bridge-typed element");
        var caller = JsonSerializer.Deserialize<ChangesetElementDto>("{\"kind\":\"wall\",\"op\":\"create\",\"typing\":{\"typed_by\":\"caller\"}}");
        var older = JsonSerializer.Deserialize<ChangesetElementDto>("{\"kind\":\"wall\",\"op\":\"create\"}");
        Ok(ChangesetTrust.Typing(caller) == null && ChangesetTrust.Typing(older) == null, "a caller-typed element, or one from a bridge before MA-2a, adds no words");
        Ok(cs.Elements.All(e => !ChangesetTrust.PreTick(cs, e)), "neither element opens ticked: a create never, a bridge-typed retype not for that");
        string filed = JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall", Op = "retype" }, ChangesetClient.WriteJson);
        Ok(!filed.Contains("typing") && !filed.Contains("facts"), "an element the add-in files carries no typing (nulls are left out): the bridge's record is the bridge's");
    }

    // The drill drawing's own numbers (make-sample.py --ma2a): the script states each wall's location; WallLocation reads it again.
    static void WallSampleChecks()
    {
        Console.WriteLine("\nMA-2a drill data (demo/ghost-sample/sample-walls-ma2a-expected.json, make-sample.py --ma2a)");
        var path = Repo("demo", "ghost-sample", "sample-walls-ma2a-expected.json");
        Ok(File.Exists(path), "the expected results are written beside the drawing");
        if (!File.Exists(path)) return;
        var doc = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
        var walls = doc.GetProperty("walls").EnumerateArray().ToList();
        var segs = walls.Select(w => Seg(w.GetProperty("start")[0].GetDouble(), w.GetProperty("start")[1].GetDouble(),
                                        w.GetProperty("end")[0].GetDouble(), w.GetProperty("end")[1].GetDouble(), w.GetProperty("thickness_mm").GetDouble())).ToList();
        int agree = 0;
        for (int i = 0; i < segs.Count; i++)
        {
            string want = walls[i].GetProperty("location").ValueKind == JsonValueKind.Null ? null : walls[i].GetProperty("location").GetString();
            string got = Loc(segs, i);
            if (got == want) agree++; else Console.WriteLine($"        wall {i + 1} ({walls[i].GetProperty("layer").GetString()}): script says {want ?? "unknown"}, WallLocation says {got ?? "unknown"}");
        }
        Ok(walls.Count == 7 && agree == 7, $"the add-in's outer boundary reads each of the seven drawn walls as the script states ({agree}/{walls.Count}): four outside, two inside, one unknown");
        Ok(walls.Count(w => w.GetProperty("layer").GetString() == "A-WALL-EXT") == 4 && walls.Count(w => w.GetProperty("location").ValueKind == JsonValueKind.Null) == 1,
           "four walls on A-WALL-EXT (the layer rule's), three on A-WALL-INT (the layer-free rules'), one of them with no location");
        int Lines(string file) => File.ReadAllLines(Repo("demo", "ghost-sample", file)).Count(l => l == "LINE");
        Ok(File.Exists(Repo("demo", "ghost-sample", "sample-walls-ma2a.dxf")) && Lines("sample-walls-ma2a.dxf") == 14, "sample-walls-ma2a.dxf holds 14 lines: two faces for each of the seven walls");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        LayerFreeChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        var m3 = LayerFreeChecks();
        WallLocationChecks();
        PlannerLayerFreeChecks(m, m3);
        TypedBodyChecks();
        WallSampleChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/promote-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PlacementGeometry.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\PlacementGeometry.cs" />
    <!-- MA-2a: inside or outside from the storey's own walls (the outer boundary) -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\WallLocation.cs" />
```

In `WebApp/bridge/fixtures/changeset-ops/promote-body.json`, replace

```json
"reason": "gap: W 312321 (Generic - 125mm, Exterior) — \"BDS_EXT_ARC_CMU_125 mm\" is not in type_catalog@1 · ma0-bds · 0123456789ab… (template BDS_Project Number_Project Name (Template)). Available: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm, BDS_EXT_ARC_CMU_400 mm. (type_catalog: ty…"
```

with

```json
"reason": "gap: W 312321 (Generic - 125mm, Function Exterior) — \"BDS_EXT_ARC_CMU_125 mm\" is not in type_catalog@1 · ma0-bds · 0123456789ab… (template BDS_Project Number_Project Name (Template)). Available: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm, BDS_EXT_ARC_CMU_400 mm. (type_ca…"
```

In `tools/promote-check/Planner.cs`, replace

```csharp
        var g1 = H(l1, "G1", "gap: G1 (Generic - 125mm, Exterior)");
```

with

```csharp
        var g1 = H(l1, "G1", "gap: G1 (Generic - 125mm, Function Exterior)"); // MA-2a: the gap names the facts the rule used
```

In `tools/promote-check/Planner.cs`, replace

```csharp
        Ok(masked.Ghosts.Count == 0 && masked.Held.Count == 2 && masked.Held.All(h => h.Reason ==
           "every wall on Level 1 besides the 1 on other office types is \"Generic - 200mm\" — inside cannot be told from outside; a person decides"),
           "…but a template's office-typed wall does not mask a one-type storey");
```

with

```csharp
        Ok(masked.Ghosts.Count == 0 && masked.Held.Count == 2 && masked.Held.All(h => h.Reason ==
           "every wall on Level 1 besides the 1 on other office types is \"Generic - 200mm\" — inside cannot be told from outside: its Function tells nothing, and its location is unknown (no location line was read); a person decides"),
           "…but a template's office-typed wall does not mask a one-type storey (MA-2a: the reason says why the location is unknown)");
```

In `tools/promote-check/Planner.cs`, replace

```csharp
    static WallFact W(string label, string type, string function, double mm, string baseLevel = "Level 1", string top = null,
                      double baseOff = 0, double topOff = 0, bool basic = true, bool group = false, string stamp = null,
                      double height = 0, bool structural = false) => new WallFact
    {
        UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, TypeName = type, Function = function,
        WidthMm = mm, BaseLevel = baseLevel, TopLevel = top, BaseOffsetMm = baseOff, TopOffsetMm = topOff,
        IsBasic = basic, InGroup = group, Stamp = stamp, HeightMm = height, Structural = structural,
    };
```

with

```csharp
    static WallFact W(string label, string type, string function, double mm, string baseLevel = "Level 1", string top = null,
                      double baseOff = 0, double topOff = 0, bool basic = true, bool group = false, string stamp = null,
                      double height = 0, bool structural = false, Action<WallFact> set = null)
    {
        var w = new WallFact
        {
            UniqueId = $"5a1c7e2b-3f4d-4c8a-9b1e-2d3c4b5a6f70-{++_uid:x8}", Label = label, TypeName = type, Function = function,
            WidthMm = mm, BaseLevel = baseLevel, TopLevel = top, BaseOffsetMm = baseOff, TopOffsetMm = topOff,
            IsBasic = basic, InGroup = group, Stamp = stamp, HeightMm = height, Structural = structural,
        };
        set?.Invoke(w); // MA-2a: a wall's line (WallLocation.Segment) and material
        return w;
    }
```

In `demo/ghost-sample/make-sample.py`, replace

```python
WALL_LEN, WALL_THICK, DOOR_W, WIN_W = 4000.0, 200.0, 900.0, 1200.0
```

with

```python
WALL_LEN, WALL_THICK, DOOR_W, WIN_W = 4000.0, 200.0, 900.0, 1200.0

# MA-2a drill: walls drawn as TWO faces, so Ghost Builder measures each thickness and the guideline — not the layer mapping —
# types them. --ma2a writes sample-walls-ma2a.dxf: a 10 x 7 m box of 200 mm walls on A-WALL-EXT (a layer rule types them), a
# 100 mm partition on A-WALL-INT across it, a 100 mm free-standing partition inside the east room and one outside the box, both
# on A-WALL-INT (no layer rule: the layer-free Location rule types the inside one; the outside one, open on both sides, is a
# named gap). Far from the origin, clear of what the drill model holds. sample-walls-ma2a-expected.json states each wall's
# centreline, thickness and the location the outer boundary must read; tools/promote-check reads it again with the add-in's own
# WallLocation (two workings of one drawing), and drill MA2a compares Revit with both.
MA2A_ORIGIN = (60000.0, 60000.0)
MA2A_WALLS = [  # (layer, x1, y1, x2, y2, thickness, location) — centrelines, relative to MA2A_ORIGIN
    ("A-WALL-EXT", 0, 0, 10000, 0, 200, "Exterior"), ("A-WALL-EXT", 10000, 0, 10000, 7000, 200, "Exterior"),
    ("A-WALL-EXT", 10000, 7000, 0, 7000, 200, "Exterior"), ("A-WALL-EXT", 0, 7000, 0, 0, 200, "Exterior"),
    ("A-WALL-INT", 4000, 0, 4000, 7000, 100, "Interior"),       # the partition across the box
    ("A-WALL-INT", 6000, 3500, 8500, 3500, 100, "Interior"),    # free-standing inside the east room
    ("A-WALL-INT", 0, -3000, 4000, -3000, 100, None),           # free-standing outside the box: open on both sides — unknown
]
```

In `demo/ghost-sample/make-sample.py`, replace

```python


if __name__ == "__main__":
    if "--ma1b" in sys.argv:
        ma1b("--plant" in sys.argv)
        sys.exit(0)
```

with

```python


def ma2a():
    """Write sample-walls-ma2a.dxf (every wall as its two faces) and sample-walls-ma2a-expected.json."""
    def faces(x1, y1, x2, y2, t):   # the two faces of a wall drawn as a double line: the centreline offset ±t/2 along its normal
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        nx, ny = -dy / length * t / 2, dx / length * t / 2
        return [(x1 + nx, y1 + ny, x2 + nx, y2 + ny), (x1 - nx, y1 - ny, x2 - nx, y2 - ny)]

    ox, oy = MA2A_ORIGIN
    lines, walls = [], []
    for n, (layer, x1, y1, x2, y2, t, loc) in enumerate(MA2A_WALLS, 1):
        for fx1, fy1, fx2, fy2 in faces(x1, y1, x2, y2, t):
            lines.append((layer, round(ox + fx1, 3), round(oy + fy1, 3), round(ox + fx2, 3), round(oy + fy2, 3)))
        walls.append({"n": n, "layer": layer, "start": [ox + x1, oy + y1], "end": [ox + x2, oy + y2], "thickness_mm": t, "location": loc})
    path = os.path.join(HERE, "sample-walls-ma2a.dxf")
    with open(path, "w", newline="") as f:
        f.write(dxf([], (), ["A-WALL-EXT", "A-WALL-INT"], lines))
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
    expected = {
        "what": "make-sample.py --ma2a: each wall of sample-walls-ma2a.dxf (drawn as two faces), its centreline, thickness and the "
                "location the outer boundary must read (MA-2a). Millimetres. location null = unknown: a named gap, never a guess.",
        "drawing": "sample-walls-ma2a.dxf",
        "walls": walls,
    }
    json_path = os.path.join(HERE, "sample-walls-ma2a-expected.json")
    with open(json_path, "w", newline="\n") as f:
        f.write("{\n" + ",\n".join(f' "{k}": ' + ("[\n" + ",\n".join("  " + json.dumps(v) for v in value) + "\n ]" if isinstance(value, list) else json.dumps(value))
                                    for k, value in expected.items()) + "\n}\n")
    print(f"wrote {json_path}  ({os.path.getsize(json_path):,} bytes)")


if __name__ == "__main__":
    if "--ma2a" in sys.argv:
        ma2a()
        sys.exit(0)
    if "--ma1b" in sys.argv:
        ma1b("--plant" in sys.argv)
        sys.exit(0)
```

- [ ] **Step 2: Write the drill drawing, then run it, and see it fail.** From the repo root: `python demo/ghost-sample/make-sample.py --ma2a` — it prints `wrote …sample-walls-ma2a.dxf  (1,728 bytes)` and `wrote …sample-walls-ma2a-expected.json  (1,240 bytes)`. Then `dotnet run --project tools/promote-check`. Expect a compile failure: `Source file '…\SentinelAddin\GhostBuilder\WallLocation.cs' could not be found`.

- [ ] **Step 3: The boundary, the planner, the DTO.**

`Create` `SentinelAddin/GhostBuilder/WallLocation.cs`:

```csharp
#nullable disable
// MA-2a: inside or outside, read from the storey's own walls — the outer boundary as the cheapest honest reading sees it.
//
// WHAT "OUTSIDE" MEANS HERE. A wall is Exterior when exactly one of its two sides looks out: from a point just beyond that face,
// a ray away from the wall, or along the wall either way, meets no other wall of the storey — while the other side is enclosed
// in all three directions. It is Interior when both sides are enclosed. Anything else is UNKNOWN with its reason — both sides
// open (a free-standing wall, or a storey whose walls do not close), fewer than three other walls, a curved wall, a wall too
// short to look out from — and an unknown location is a named reason to a person, never a guess (the rule that needs it
// cannot fire). Walls stand in for the boundary whatever their type: an office type, a structural wall and a curtain wall
// enclose as well as a concept wall does; a curved wall's chord stands in for it as a barrier.
//
// CEILINGS, STATED. A wall facing a closed inner courtyard reads Interior (every direction meets a wall). A ray that escapes
// through an opening in a wall drawn in pieces (GHB-6) reads that side as open. A storey is its walls' base level, as Promote
// plans it. Pure 2D in millimetres, no Revit types: tools/promote-check drives it over the concept layout, an L, a U, an O and
// the drill drawing's own numbers; Promote (storey walls) and Ghost Builder (the walls of one build) feed it.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Sentinel.GhostBuilder
{
    public static class WallLocation
    {
        /// <summary>One wall of the storey in plan (mm): its location line (a curved wall's chord, flagged) and its width.</summary>
        public sealed class Segment
        {
            public double X0, Y0, X1, Y1, WidthMm;
            public bool Curved;
        }

        public const string Exterior = "Exterior", Interior = "Interior";
        /// <summary>The sample points sit this far beyond each face (half the width plus this).</summary>
        public const double ClearMm = 100;
        /// <summary>A wall shorter than this is not read: its middle is too near its ends to look out from.</summary>
        public const double MinLengthMm = 500;
        /// <summary>Fewer other walls than this is no outline to be inside or outside of.</summary>
        public const int MinOthers = 3;
        /// <summary>A ray meets a wall within this (mm); a sample point this close to another wall's line is on it.</summary>
        public const double TolMm = 1;

        /// <summary>"Exterior", "Interior", or null with <paramref name="why"/> (plain words, no guess) for wall <paramref name="i"/>
        /// among the storey's <paramref name="walls"/> (a null entry is a wall with no line read: it is skipped as a barrier).</summary>
        public static string Locate(IReadOnlyList<Segment> walls, int i, out string why)
        {
            why = null;
            var w = walls[i];
            if (w == null) { why = "no location line was read"; return null; }
            if (w.Curved) { why = "a curved wall — its sides are not read (MA-2a reads straight walls)"; return null; }
            int others = 0;
            for (int j = 0; j < walls.Count; j++) if (j != i && walls[j] != null) others++;
            if (others < MinOthers) { why = $"only {others} other wall(s) on the storey — no outline to be inside or outside of"; return null; }
            double dx = w.X1 - w.X0, dy = w.Y1 - w.Y0, len = Math.Sqrt(dx * dx + dy * dy);
            if (len < MinLengthMm) { why = $"{Mm(len)} mm long — too short to look out from (under {Mm(MinLengthMm)} mm)"; return null; }
            double ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
            double mx = (w.X0 + w.X1) / 2, my = (w.Y0 + w.Y1) / 2, off = Math.Max(0, w.WidthMm) / 2 + ClearMm;
            bool plusOpen = Open(walls, i, mx + nx * off, my + ny * off, nx, ny, ux, uy);
            bool minusOpen = Open(walls, i, mx - nx * off, my - ny * off, -nx, -ny, ux, uy);
            if (plusOpen != minusOpen) return Exterior;
            if (!plusOpen) return Interior;
            why = "both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it";
            return null;
        }

        /// <summary>The storey's walls as one line of a summary: how many read Exterior, Interior and unknown.</summary>
        public static string Summary(int exterior, int interior, int unknown) =>
            $"outer boundary: {exterior} outside · {interior} inside · {unknown} unknown";

        // A side is open when a ray from its sample point — away from the wall, or along the wall either way — meets no other wall.
        private static bool Open(IReadOnlyList<Segment> walls, int i, double px, double py, double ax, double ay, double ux, double uy) =>
            !Hits(walls, i, px, py, ax, ay) || !Hits(walls, i, px, py, ux, uy) || !Hits(walls, i, px, py, -ux, -uy);

        private static bool Hits(IReadOnlyList<Segment> walls, int i, double px, double py, double dx, double dy)
        {
            for (int j = 0; j < walls.Count; j++)
                if (j != i && walls[j] != null && RayMeets(px, py, dx, dy, walls[j])) return true;
            return false;
        }

        /// <summary>Does the ray p + t·d (t &gt; TolMm) meet the segment s, within TolMm? A proper crossing; or, parallel to it, an
        /// end of the segment on the ray (a ray running along a wall's line is stopped by that wall).</summary>
        internal static bool RayMeets(double px, double py, double dx, double dy, Segment s)
        {
            double ex = s.X1 - s.X0, ey = s.Y1 - s.Y0, rx = s.X0 - px, ry = s.Y0 - py;
            double den = dx * ey - dy * ex;
            double elen = Math.Sqrt(ex * ex + ey * ey);
            if (elen < 1e-9) return OnRay(px, py, dx, dy, s.X0, s.Y0);
            if (Math.Abs(den) < 1e-9 * elen) return OnRay(px, py, dx, dy, s.X0, s.Y0) || OnRay(px, py, dx, dy, s.X1, s.Y1);
            double t = (rx * ey - ry * ex) / den; // along the ray (d is a unit vector: mm)
            double u = (rx * dy - ry * dx) / den; // along the segment, 0 at its start, 1 at its end
            double slack = TolMm / elen;
            return t > TolMm && u >= -slack && u <= 1 + slack;
        }

        private static bool OnRay(double px, double py, double dx, double dy, double qx, double qy)
        {
            double vx = qx - px, vy = qy - py, t = vx * dx + vy * dy;
            return t > TolMm && Math.Abs(vx * dy - vy * dx) <= TolMm;
        }

        private static string Mm(double v) => v.ToString("0", CultureInfo.InvariantCulture);
    }
}
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        public bool IsBasic, InGroup, InOption;
        /// <summary>The wall's Structural usage (WALL_STRUCTURAL_SIGNIFICANT = 1).</summary>
        public bool Structural;
    }
```

with

```csharp
        public bool IsBasic, InGroup, InOption;
        /// <summary>The wall's Structural usage (WALL_STRUCTURAL_SIGNIFICANT = 1).</summary>
        public bool Structural;
        /// <summary>MA-2a: the wall's location line in plan (mm) as the outer boundary reads it — a curved wall's chord, flagged;
        /// null when none was read (the wall is then no barrier and its location is unknown).</summary>
        public WallLocation.Segment Line;
        /// <summary>MA-2a: the type's compound-layer materials, finish layers first, joined " / " ("Stone / Concrete Masonry
        /// Units"); null when the type has none. Passed to the rules as the param Material.</summary>
        public string Material;
    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                var p = new StoreyPlan { Storey = storey.Key, Stamped = storey.Count(w => ProvenanceStamp.SourceOf(w.Stamp) == "promote") };
                byName.TryGetValue(storey.Key, out var baseLevel);
                var next = baseLevel == null ? null : NextStory(levels, baseLevel.ElevationMm); // the executor's wall top too (MA-1a item 3)
                var retypes = new List<PromoteGhost>();
                var typed = new List<WallFact>(); // basic, ungrouped walls, settled included, office-typed not

                foreach (var w in storey)
                {
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });
```

with

```csharp
                var p = new StoreyPlan { Storey = storey.Key, Stamped = storey.Count(w => ProvenanceStamp.SourceOf(w.Stamp) == "promote") };
                byName.TryGetValue(storey.Key, out var baseLevel);
                var next = baseLevel == null ? null : NextStory(levels, baseLevel.ElevationMm); // the executor's wall top too (MA-1a item 3)
                var retypes = new List<PromoteGhost>();
                var ws = storey.ToList();
                // MA-2a: the storey's barriers as the outer boundary reads them — this storey's walls and every other wall that crosses
                // its plane (a shell based below and rising past it: review C1), whatever their types. The storey's own walls come
                // first, so a wall's index in ws is its index here; a wall with no line is no barrier.
                double plane = baseLevel?.ElevationMm ?? double.NaN;
                var segs = ws.Select(w => w.Line).ToList();
                if (!double.IsNaN(plane))
                    segs.AddRange(walls.Where(o => o.Line != null && !ws.Contains(o)
                                                   && Elev(o.BaseLevel) + o.BaseOffsetMm <= plane + TolMm && TopMm(o, Elev(o.BaseLevel)) > plane + TolMm)
                                       .Select(o => o.Line));
                // §3.4 step 4: when every concept wall on the storey shares one type, its Function is the template's default and
                // tells nothing — decided before the loop, because it decides what each wall's rule may see (MA-2a reads the
                // outer boundary instead; a wall whose location cannot be read goes to a person). Settled walls count (a storey a
                // first run half-promoted is not one-type); the office's other types do not (template samples would mask it).
                var eligible = ws.Where(w => w.IsBasic && !w.InGroup && !w.InOption && baseLevel != null && baseLevel.IsStory).ToList();
                bool OfficeOther(WallFact w) => !m.RuleProduces("Walls", w.TypeName) && office != null && (w.TypeName ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase);
                var typed = eligible.Where(w => !OfficeOther(w)).ToList(); // basic, ungrouped walls, settled included, office-typed not
                p.OneType = typed.Count >= 2 && typed.Select(w => w.TypeName ?? "").Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1;
                int officeOthers = eligible.Count(OfficeOther);
                var aside = officeOthers > 0 ? $" besides the {officeOthers} on other office types" : "";

                for (int k = 0; k < ws.Count; k++)
                {
                    var w = ws[k];
                    void Hold(string reason) => p.Held.Add(new PromoteHeld { UniqueId = w.UniqueId, Label = w.Label, Reason = reason });
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    bool typeOk = m.RuleProduces("Walls", w.TypeName);
                    if (!typeOk && office != null && (w.TypeName ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase)) { p.OfficeTyped++; continue; }
                    typed.Add(w);
                    if (!typeOk && w.Structural) { Hold("structural wall — Promote v0 does not retype or re-top structure; a person decides"); continue; }
```

with

```csharp
                    bool typeOk = m.RuleProduces("Walls", w.TypeName);
                    if (!typeOk && office != null && (w.TypeName ?? "").StartsWith(office, StringComparison.OrdinalIgnoreCase)) { p.OfficeTyped++; continue; }
                    if (!typeOk && w.Structural) { Hold("structural wall — Promote v0 does not retype or re-top structure; a person decides"); continue; }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                    else
                    {
                        var res = m.Resolve(new GuidelineInput
                        {
                            Category = "Walls",
                            Params = new Dictionary<string, string> { ["Function"] = w.Function ?? "" },
                            ThicknessMm = w.WidthMm,
                        });
                        if (res.Source == "rule" && res.Confidence == 1 && !string.IsNullOrWhiteSpace(res.Type))
                        {
                            if (string.Equals(res.Type, w.TypeName, StringComparison.OrdinalIgnoreCase)) typeOk = true;
                            else if (docBasicWallTypes == null || !docBasicWallTypes.TryGetValue(res.Type, out var fn))
                                Hold($"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types");
                            else
                            {
                                // The rule is the office's: proposed even when the template gave the target another Function.
                                var note = string.IsNullOrEmpty(fn) || string.Equals(fn, w.Function, StringComparison.OrdinalIgnoreCase)
                                    ? null : $"{res.Type} is Function {fn} in this model";
                                retypes.Add(new PromoteGhost
                                {
                                    Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                    Reason = $"DD walls v0: Function {w.Function}, {Mm(w.WidthMm, "0")} mm → {res.Type}" + (note == null ? "" : " — note: " + note),
                                    Note = note,
                                });
                            }
                        }
                        else if (res.Source == "rule")
                            Hold(m.Gap($"{w.Label} ({w.TypeName}, {w.Function})", res.Why));
                        else
                            Hold($"no DD rule for Function {w.Function} in {m.Standard}");
                    }
```

with

```csharp
                    else
                    {
                        // MA-2a: what the rules may see — the type's Function (not on a one-type storey: it tells nothing there), the
                        // wall's Location from the outer boundary when it can be read, its Material when the type has one. An
                        // unknown is left out, so a rule that needs it cannot fire: a reason to a person, never a guess.
                        string loc = WallLocation.Locate(segs, k, out string locWhy);
                        bool fnSaysSide = string.Equals(w.Function, WallLocation.Exterior, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(w.Function, WallLocation.Interior, StringComparison.OrdinalIgnoreCase);
                        if (!p.OneType && loc != null && fnSaysSide && !string.Equals(w.Function, loc, StringComparison.OrdinalIgnoreCase))
                        {
                            // Review C2: on a mixed storey the type's Function is a modelling decision; where the boundary reads the other
                            // way (a courtyard wall, a misread outline, a template's wrong Function) neither is passed — a person decides.
                            Hold($"Function {w.Function} but it reads " + (loc == WallLocation.Exterior
                                 ? "outside (one side looks out of the storey's outline)" : "inside (both sides enclosed — a courtyard, or a misread outline)") + "; a person decides");
                        }
                        else
                        {
                            var ps = new Dictionary<string, string>();
                            if (!p.OneType && !string.IsNullOrEmpty(w.Function)) ps["Function"] = w.Function;
                            if (loc != null) ps["Location"] = loc;
                            if (!string.IsNullOrWhiteSpace(w.Material)) ps["Material"] = w.Material;
                            var res = m.Resolve(new GuidelineInput { Category = "Walls", Params = ps, ThicknessMm = w.WidthMm });
                            string used = What(ps, res.Matched);
                            if (res.Source == "rule" && res.Confidence == 1 && !string.IsNullOrWhiteSpace(res.Type))
                            {
                                if (string.Equals(res.Type, w.TypeName, StringComparison.OrdinalIgnoreCase)) typeOk = true;
                                else if (docBasicWallTypes == null || !docBasicWallTypes.TryGetValue(res.Type, out var fn))
                                    Hold($"\"{res.Type}\" is in the catalogue but not loaded in this model — Sentinel creates no types");
                                else
                                {
                                    // The rule is the office's: proposed even when the template gave the target another Function.
                                    var note = string.IsNullOrEmpty(fn) || string.Equals(fn, w.Function, StringComparison.OrdinalIgnoreCase)
                                        ? null : $"{res.Type} is Function {fn} in this model";
                                    retypes.Add(new PromoteGhost
                                    {
                                        Op = "retype", UniqueId = w.UniqueId, Label = w.Label, TypeBefore = w.TypeName, TypeName = res.Type,
                                        Reason = $"DD walls v0: {used}, {Mm(w.WidthMm, "0")} mm → {res.Type}" + (note == null ? "" : " — note: " + note),
                                        Note = note,
                                    });
                                }
                            }
                            else if (res.Source == "rule")
                                Hold(m.Gap($"{w.Label} ({w.TypeName}, {used})", res.Why));
                            else if (p.OneType)
                                Hold($"every wall on {storey.Key}{aside} is \"{w.TypeName}\" — inside cannot be told from outside: its Function tells nothing, and " +
                                     (loc != null ? $"{m.Standard} has no rule for Location {loc}" : $"its location is unknown ({locWhy})") + "; a person decides");
                            else
                                Hold($"no DD rule for {used} in {m.Standard}" + (loc == null ? $" (location unknown: {locWhy})" : ""));
                        }
                    }
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
                p.Walls = storey.Count() - p.OfficeTyped;

                // §3.4 step 4: when every wall on the storey shares one type, inside cannot be told from outside — the
                // retypes go to a person (MA-2 reads the outer boundary). The attaches stay. Settled walls count (a storey a
                // first run half-promoted is not one-type); the office's other types do not (template samples would mask it).
                var aside = p.OfficeTyped > 0 ? $" besides the {p.OfficeTyped} on other office types" : "";
                p.OneType = typed.Count >= 2 && typed.Select(w => w.TypeName ?? "").Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1;
                if (p.OneType)
                    foreach (var g in retypes)
                        p.Held.Add(new PromoteHeld
                        {
                            UniqueId = g.UniqueId, Label = g.Label,
                            Reason = $"every wall on {storey.Key}{aside} is \"{g.TypeBefore}\" — inside cannot be told from outside; a person decides",
                        });
                else
                    p.Ghosts.InsertRange(0, retypes); // retypes first, then attaches: the executor runs them in that order too
                plans.Add(p);
```

with

```csharp
                p.Walls = ws.Count - p.OfficeTyped;
                p.Ghosts.InsertRange(0, retypes); // retypes first, then attaches: the executor runs them in that order too
                plans.Add(p);
```

In `SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs`, replace

```csharp
        private static string Mm(double v, string format) => v.ToString(format, CultureInfo.InvariantCulture);
    }
}
```

with

```csharp
        private static string Mm(double v, string format) => v.ToString(format, CultureInfo.InvariantCulture);

        /// <summary>MA-2a: the facts a rule used, in words — "Location Exterior, Material Stone" — from the params passed and the
        /// winning rule's Matched ("param:Location"); every param passed when none matched (a hold names what was offered).</summary>
        internal static string What(IReadOnlyDictionary<string, string> ps, IReadOnlyList<string> matched)
        {
            bool Used(string key) => matched != null && matched.Any(h => h.StartsWith("param:", StringComparison.Ordinal)
                                                                        && string.Equals(h.Substring(6).Replace(" ", ""), key.Replace(" ", ""), StringComparison.OrdinalIgnoreCase));
            var used = ps.Where(kv => Used(kv.Key)).ToList();
            var said = (used.Count > 0 ? used : ps.ToList()).Select(kv => kv.Key + " " + kv.Value);
            return ps.Count == 0 ? "no facts" : string.Join(", ", said);
        }
    }
}
```

In `SentinelAddin/GhostBuilder/GuidelineMatcher.cs`, replace

```csharp
            return values.Count == 1 ? values[0] : null; // a producing rule that does not name it is a disagreement
        }
```

with

```csharp
            return values.Count == 1 ? values[0] : null; // a producing rule that does not name it is a disagreement
        }

        /// <summary>MA-2a: a settled host's inside or outside — each producing rule's when.params Function, else its Location (the same
        /// two words), the one distinct value, or null when the rules disagree. A rule that names neither is skipped: the DD layer-free
        /// file produces one type from a Location+Material rule AND a Function rule, and RuleParam reads "not named" as a disagreement
        /// (review C6). Promote v1's Swap reads a door's location from it.</summary>
        public string RuleLocation(string category, string typeName)
        {
            var values = Producers(category, typeName)
                .Select(r => r.When?.Params?.FirstOrDefault(kv => Squash(kv.Key) == "function").Value
                          ?? r.When?.Params?.FirstOrDefault(kv => Squash(kv.Key) == "location").Value)
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            return values.Count == 1 ? values[0] : null;
        }
```

In `SentinelAddin/GhostBuilder/PromotePlanner.cs`, replace

```csharp
                if (m.RuleProduces("Walls", e.HostTypeName))
                {
                    loc = m.RuleParam("Walls", e.HostTypeName, "Function");
                    if (loc == null) return $"host {e.HostTypeName}: its DD rules do not name one Function — a person decides";
```

with

```csharp
                if (m.RuleProduces("Walls", e.HostTypeName))
                {
                    // MA-2a: a host settled by a layer-free rule names its Location (Exterior/Interior, the same words) — each producing
                    // rule's Function, else its Location (review C6: the gypsum type is produced by one rule of each).
                    loc = m.RuleLocation("Walls", e.HostTypeName);
                    if (loc == null) return $"host {e.HostTypeName}: its DD rules do not name one Function or Location — a person decides";
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    [JsonPropertyName("cid")] public string Cid { get; set; }
    [JsonPropertyName("evidence")] public List<string> Evidence { get; set; }
}
```

with

```csharp
    [JsonPropertyName("cid")] public string Cid { get; set; }
    [JsonPropertyName("evidence")] public List<string> Evidence { get; set; }
    /// <summary>MA-2a (full contract 2): the bridge's record of who typed the element — "bridge" (from the facts the poster sent, by
    /// the project's guideline and catalogue) or "caller"; null from a bridge before MA-2a and on an element the add-in files.
    /// Read only: the executor types by place.TypeName as for any changeset.</summary>
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
}

public sealed class TypingDto
{
    [JsonPropertyName("typed_by")] public string TypedBy { get; set; }
    [JsonPropertyName("type")] public string Type { get; set; }
    [JsonPropertyName("family")] public string Family { get; set; }
    [JsonPropertyName("rule")] public string Rule { get; set; }
    /// <summary>The bridge's refLabel of the guideline and catalogue that decided ("guideline@1 · office · 0123456789ab…").</summary>
    [JsonPropertyName("guideline")] public string Guideline { get; set; }
    [JsonPropertyName("catalog")] public string Catalog { get; set; }
}
```

In `SentinelAddin/Coordination/ChangesetClient.cs`, replace

```csharp
    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');
```

with

```csharp
    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');

    /// <summary>MA-2a: the review's words for an element the bridge typed — "typed by the bridge from the facts posted (guideline@1 ·
    /// office · …)"; null for one the caller typed, or from a bridge before MA-2a.</summary>
    public static string Typing(ChangesetElementDto el) =>
        el.Typing?.TypedBy == "bridge" ? "typed by the bridge from the facts posted (" + (el.Typing.Guideline ?? "guideline") + ")" : null;
```

- [ ] **Step 4: Run it, and see it pass.** From the repo root: `dotnet run --project tools/promote-check` — expect `539/539 checks pass` (497 + the boundary's 13, the planner's 19, the typed body's 6, the drawing's 4, and the two amended lines of `Planner.cs` passing as rewritten). Then `dotnet run --project tools/session-check` (it compiles `ChangesetClient.cs`) — `47/47`. From `WebApp`: `npx vitest run bridge/changesets-logic.test.mjs` — `85 passed` (the `promote-body` parity fixture still passes `validateChangeset` with its changed string).

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/WallLocation.cs SentinelAddin/GhostBuilder/PromoteWallsPlanner.cs SentinelAddin/GhostBuilder/PromotePlanner.cs SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/Coordination/ChangesetClient.cs demo/ghost-sample/make-sample.py demo/ghost-sample/sample-walls-ma2a.dxf demo/ghost-sample/sample-walls-ma2a-expected.json tools/promote-check/LayerFreePlanner.cs tools/promote-check/Planner.cs tools/promote-check/Check.cs tools/promote-check/promote-check.csproj WebApp/bridge/fixtures/changeset-ops/promote-body.json
git commit -F - <<'EOF'
feat(promote): the outer boundary (WallLocation: one side open = outside, both enclosed = inside, else unknown with its reason); Promote passes Function, Location and Material, types a one-type storey by location and holds an unknown; a door reads its host rule's Location; the add-in reads the bridge's typing; the MA-2a drill drawing (MA-2a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 5 — The wider harvest: Function and Material kept, the BuiltInCategory beside the category (BOS-5), and stored catalogues unchanged

**Files:**
- Create `SentinelAddin/Standards/TypeHarvest.cs` — pure: `FunctionName`, `MaterialLabel`
- Modify `SentinelAddin/Standards/StandardsPack.cs` — `TypeSpec.Bic`, `TypeSpec.CategoryLocal`
- Modify `SentinelAddin/Standards/GoldenModelExtractor.cs` — the reads
- Modify `SentinelAddin/Compat.cs` — `BicNameOf`, `CategoryKeyOf`
- Modify `SentinelAddin/Workflow/NamingManagerService.cs` — `LayerMaterials` shared
- Create `tools/ghost-standards-check/HarvestChecks.cs`; modify `Check.cs`, `ghost-standards-check.csproj`

**Interfaces:** `TypeHarvest.FunctionName(int)` → `Interior` (0), `Exterior` (1), `Foundation` (2), `Retaining` (3), `Soffit` (4), `Coreshaft` (5), else null — the enum's own spelling (`Autodesk.Revit.DB.WallFunction`; Promote's `wt.Function.ToString()` writes the same, review C7). `TypeHarvest.MaterialLabel(names)` → distinct names in order joined ` / `, or null. `TypeSpec.Bic` (`bic`, written when set), `TypeSpec.CategoryLocal` (`category_local`, written only when it differs from `Category`). `Compat.BicNameOf(Category)` → the enum name or null (a subcategory or custom category); `Compat.CategoryKeyOf(Category)` → the English key of `CategoryKeys` for that BuiltInCategory, else `Category.Name`. The harvest's row: `category` = `CategoryKeyOf`, `bic`, `category_local`, `params.Function` from `FUNCTION_PARAM` (Integer), `params.Material` from the Material parameter's element name else the build-up's layers, the other five parameters by storage type; a shared parameter's `categories` as English keys.

- [ ] **Step 1: The failing checks.**

`Create` `tools/ghost-standards-check/HarvestChecks.cs`:

```csharp
using Sentinel.Standards;

/// <summary>MA-2a: the wider harvest's pure half (TypeHarvest), the row shape it writes (TypeSpec with bic and the Function and
/// Material params), and — by source scan — the Revit-bound reads that fill it (GoldenModelExtractor, Compat).</summary>
static class HarvestChecks
{
    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Console.WriteLine("\nMA-2a — the wider harvest: Function, Material, BuiltInCategory (TypeHarvest, TypeSpec, GoldenModelExtractor)");
        _ok(TypeHarvest.FunctionName(0) == "Interior" && TypeHarvest.FunctionName(1) == "Exterior" && TypeHarvest.FunctionName(2) == "Foundation"
            && TypeHarvest.FunctionName(3) == "Retaining" && TypeHarvest.FunctionName(4) == "Soffit" && TypeHarvest.FunctionName(5) == "Coreshaft",
            "FunctionName: Revit's six WallFunction values by name, the enum's own spelling — Coreshaft, not CoreShaft (what a rule's `Function: Exterior` matches, and what Promote's Function.ToString() writes)");
        _ok(TypeHarvest.FunctionName(6) == null && TypeHarvest.FunctionName(-1) == null, "…and nothing for a value outside the enum");
        _ok(TypeHarvest.MaterialLabel(new[] { "Stone", "Concrete Masonry Units", "Stone", " ", null }) == "Stone / Concrete Masonry Units",
            "MaterialLabel: distinct names in the order given, joined ' / '; blanks dropped");
        _ok(TypeHarvest.MaterialLabel(new string?[0]) == null && TypeHarvest.MaterialLabel(null) == null, "…and null when there are none: no Material is written");

        // The row shape: bic and category_local travel when set and are left out when not, so a type_catalog@1 reader sees nothing new.
        var rows = new List<TypeSpec>
        {
            new() { Category = "Walls", Bic = "OST_Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200, Params = { ["Function"] = "Exterior", ["Material"] = "Stone / Concrete Masonry Units" } },
            new() { Category = "Walls", Bic = "OST_Walls", CategoryLocal = "Wände", Family = "Basic Wall", Type = "OFF_INT_100 mm", IsSystem = true, WidthMm = 100 },
            new() { Category = "Site Markers", Family = "Marker", Type = "S" }, // a custom category: a positive id, so BicNameOf gives null (review C8)
        };
        string body = TypeCatalogExport.Json("Office_Template", new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.FromHours(2)), rows, new List<ViewTemplateSpec>());
        using var d = System.Text.Json.JsonDocument.Parse(body);
        var t0 = d.RootElement.GetProperty("types")[0]; var t1 = d.RootElement.GetProperty("types")[1]; var t2 = d.RootElement.GetProperty("types")[2];
        _ok(t0.GetProperty("bic").GetString() == "OST_Walls" && !t0.TryGetProperty("category_local", out _)
            && t0.GetProperty("params").GetProperty("Function").GetString() == "Exterior" && t0.GetProperty("params").GetProperty("Material").GetString() == "Stone / Concrete Masonry Units",
            "a row carries bic and params.Function / params.Material; category_local is left out when the category is the English key");
        _ok(t1.GetProperty("category").GetString() == "Walls" && t1.GetProperty("category_local").GetString() == "Wände",
            "a row harvested on a non-English Revit: category is the English key its bic names, category_local keeps the display name");
        _ok(!t2.TryGetProperty("bic", out _) && !t2.TryGetProperty("category_local", out _),
            "a custom or imported category (a positive id: BicNameOf gives null; every built-in one, stairs and railings included, has its bic) carries no bic and no category_local — the row reads as before");
        var read = Sentinel.GhostBuilder.GuidelineMatcher.FromBodies(null, body, out _, out var err);
        _ok(read.HasCatalog && err == null && read.CatalogHas("Walls", "Basic Wall", "OFF_INT_100 mm"), "the export parses as type_catalog@n, and the add-in's matcher reads the German row for Walls through its bic");

        // The Revit-bound reads, by source scan (proven live in drill MA2a).
        string Src(params string[] parts) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(parts).ToArray()));
        string harvest = Src("Standards", "GoldenModelExtractor.cs");
        _ok(harvest.Contains("Category = Compat.CategoryKeyOf(cat),") && harvest.Contains("Bic = Compat.BicNameOf(cat),") && harvest.Contains("CategoryLocal = ") && !harvest.Contains("Category = category,"),
            "the harvest writes the category as the English key its BuiltInCategory names, the bic beside it, and the display name only when it differs (BOS-5)");
        _ok(harvest.Contains("t.get_Parameter(BuiltInParameter.FUNCTION_PARAM)") && harvest.Contains("TypeHarvest.FunctionName(fn.AsInteger())") && !harvest.Contains("\"Function\" };"),
            "a type's Function is read as the Integer FUNCTION_PARAM and written by its enum name — never LookupParameter(\"Function\").AsString(), which was null on every row");
        _ok(harvest.Contains("TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, t))") && harvest.Contains("case StorageType.ElementId:"),
            "a type's Material is its Material parameter's element name, else its build-up layers' materials; a parameter is read by its storage type");
        _ok(harvest.Contains("foreach (Category c in eb.Categories) categories.Add(Compat.CategoryKeyOf(c));"),
            "a shared parameter's bound categories are written as English keys too, so a German harvest binds every parameter on an English Revit (BOS-5)");
        string compat = Src("Compat.cs");
        _ok(compat.Contains("public static string CategoryKeyOf(Category category)") && compat.Contains("public static string? BicNameOf(Category category)")
            && compat.Contains("Enum.IsDefined(typeof(BuiltInCategory), bic)") && !compat.Contains("category.BuiltInCategory"),
            "Compat names a category's BuiltInCategory from its id on every Revit version (no 2023+ API), and gives the English key for the ones Sentinel knows");
        _ok(Src("Workflow", "NamingManagerService.cs").Contains("internal static List<string> LayerMaterials(Document doc, ElementType et)"),
            "LayerMaterials is shared with the harvest and Promote, not copied");
    }
}
```

In `tools/ghost-standards-check/Check.cs`, replace

```csharp
        GuidelineChecks.Run(RepoRoot(), Ok);
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        GuidelineChecks.Run(RepoRoot(), Ok);
        HarvestChecks.Run(RepoRoot(), Ok);
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/ghost-standards-check/ghost-standards-check.csproj`, replace

```xml
    <Compile Include="..\..\SentinelAddin\Standards\TypeCatalogExport.cs" />
```

with

```xml
    <Compile Include="..\..\SentinelAddin\Standards\TypeCatalogExport.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\TypeHarvest.cs" /> <!-- MA-2a: the harvest's words (Function names, the material label) -->
```

- [ ] **Step 2: Run it, and see it fail.** From the repo root: `dotnet run --project tools/ghost-standards-check`. Expect a compile failure: `Source file '…\SentinelAddin\Standards\TypeHarvest.cs' could not be found`.

- [ ] **Step 3: The pure half, the row, the reads.**

`Create` `SentinelAddin/Standards/TypeHarvest.cs`:

```csharp
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Standards;

/// <summary>
/// MA-2a: the pure half of Build Office System's wider harvest — the words a catalogue row carries for the layer-free rules,
/// spelled once for the add-in and read by the bridge as text. Pure (no Revit), so tools/ghost-standards-check pins them.
/// </summary>
public static class TypeHarvest
{
    /// <summary>Revit's WallFunction values (Interior 0 … Coreshaft 5), by name — the Function a wall, floor, door or window type
    /// carries (FUNCTION_PARAM, an Integer). Written as the enum NAME in the enum's own spelling (Autodesk.Revit.DB.WallFunction:
    /// Interior, Exterior, Foundation, Retaining, Soffit, Coreshaft — read by reflection on Revit 2024's RevitAPI.dll; Promote's
    /// wt.Function.ToString() writes the same), never the localized value string, so a rule written as `Function: Exterior` reads
    /// the same on a German Revit. Null for a value outside the enum: nothing is written.</summary>
    public static string? FunctionName(int value) => value switch
    {
        0 => "Interior", 1 => "Exterior", 2 => "Foundation", 3 => "Retaining", 4 => "Soffit", 5 => "Coreshaft", _ => null,
    };

    /// <summary>A type's build-up materials as one label — distinct names in the order given (finish layers first, as
    /// NamingManagerService.LayerMaterials lists them), joined " / ": "Stone / Concrete Masonry Units". Null when there are none,
    /// so no `Material` is written. A rule matches it by substring (`Material: STONE`).</summary>
    public static string? MaterialLabel(IEnumerable<string?>? names)
    {
        var list = (names ?? Enumerable.Empty<string?>()).Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n!.Trim()).Distinct().ToList();
        return list.Count == 0 ? null : string.Join(" / ", list);
    }
}
```

In `SentinelAddin/Standards/StandardsPack.cs`, replace

```csharp
    /// <summary>Revit category, e.g. "Walls", "Doors" — matches the GhostBuilder build categories.</summary>
    [JsonPropertyName("category")] public string Category { get; set; } = "";
```

with

```csharp
    /// <summary>Revit category, e.g. "Walls", "Doors" — matches the GhostBuilder build categories. MA-2a (BOS-5): the ENGLISH key
    /// when the type's BuiltInCategory is one Sentinel knows (Compat.CategoryKeyOf), so a harvest on a German Revit still says
    /// "Walls"; else the display name.</summary>
    [JsonPropertyName("category")] public string Category { get; set; } = "";
    /// <summary>MA-2a (BOS-5): the BuiltInCategory as its enum name ("OST_Walls"); null (and left out) when the category has none
    /// Revit defines. A reader compares on it where the name differs (GuidelineMatcher.SameCategory, guideline.ts sameCategory).</summary>
    [JsonPropertyName("bic")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Bic { get; set; }
    /// <summary>MA-2a (BOS-5): the category's display name on the Revit that harvested, only when it differs from Category.</summary>
    [JsonPropertyName("category_local")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? CategoryLocal { get; set; }
```

In `SentinelAddin/Standards/GoldenModelExtractor.cs`, replace

```csharp
    // Type parameters worth capturing when authoring rules. Deliberately a short list: the point is to
    // show what an office standard actually keys on, not to dump every parameter in the template.
    private static readonly string[] InterestingParams =
    { "Fire Rating", "Material", "Structural Material", "Assembly Code", "Type Mark", "Keynote", "Function" };
```

with

```csharp
    // Type parameters worth capturing when authoring rules. Deliberately a short list: the point is to
    // show what an office standard actually keys on, not to dump every parameter in the template.
    // MA-2a: Function is read apart (FUNCTION_PARAM, an Integer: its enum name); Material falls back to the build-up's layers.
    // Fire Rating and Material are what the office's rules key on; Assembly Code, Type Mark and Keynote are what the LOD
    // matrix's property rows will ask for; Structural Material is structure's material.
    private static readonly string[] InterestingParams =
    { "Fire Rating", "Material", "Structural Material", "Assembly Code", "Type Mark", "Keynote" };
```

In `SentinelAddin/Standards/GoldenModelExtractor.cs`, replace

```csharp
            // No category = a Revit-internal type (view types, project info, …). Not part of the
            // office's family library and only noise in the picker.
            string category;
            try { category = t.Category?.Name ?? ""; } catch { continue; }
            if (string.IsNullOrWhiteSpace(category)) continue;

            string family = SafeFamilyName(t);
            if (!seen.Add(category + "|" + family + "|" + t.Name)) continue;

            var spec = new TypeSpec
            {
                Category = category,
                Family = family,
                Type = t.Name,
                IsSystem = t is HostObjAttributes, // Wall/Floor/Ceiling/Roof — duplicated, not loaded
                WidthMm = Mm(t, BuiltInParameter.WALL_ATTR_WIDTH_PARAM)
                          ?? MmByName(t, "Width") ?? MmByName(t, "Thickness"),
                HeightMm = MmByName(t, "Height"),
            };
            foreach (string p in InterestingParams)
            {
                string? v = t.LookupParameter(p)?.AsString();
                if (!string.IsNullOrWhiteSpace(v)) spec.Params[p] = v!;
            }
            pack.Provision.TypeCatalog.Add(spec);
```

with

```csharp
            // No category = a Revit-internal type (view types, project info, …). Not part of the
            // office's family library and only noise in the picker.
            Category? cat;
            try { cat = t.Category; } catch { continue; }
            if (cat is null || string.IsNullOrWhiteSpace(cat.Name)) continue;
            // MA-2a (BOS-5): the row is keyed on the English key its BuiltInCategory names (the display name on a Revit whose
            // category Sentinel does not know), so the guideline's "Walls" finds it whatever language harvested it.
            string category = Compat.CategoryKeyOf(cat);

            string family = SafeFamilyName(t);
            if (!seen.Add(category + "|" + family + "|" + t.Name)) continue;

            var spec = new TypeSpec
            {
                Category = Compat.CategoryKeyOf(cat),
                Bic = Compat.BicNameOf(cat),
                CategoryLocal = string.Equals(cat.Name, category, StringComparison.Ordinal) ? null : cat.Name,
                Family = family,
                Type = t.Name,
                IsSystem = t is HostObjAttributes, // Wall/Floor/Ceiling/Roof — duplicated, not loaded
                WidthMm = Mm(t, BuiltInParameter.WALL_ATTR_WIDTH_PARAM)
                          ?? MmByName(t, "Width") ?? MmByName(t, "Thickness"),
                HeightMm = MmByName(t, "Height"),
            };
            foreach (string p in InterestingParams)
            {
                string? v = ParamText(doc, t.LookupParameter(p));
                if (!string.IsNullOrWhiteSpace(v)) spec.Params[p] = v!;
            }
            // MA-2a: the type's Function (walls, floors, doors, windows — whichever Revit gives it), by its enum name. The old
            // LookupParameter("Function").AsString() was null on an Integer parameter: 0 of 1,434 BDS rows carried it.
            var fn = t.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
            if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer && TypeHarvest.FunctionName(fn.AsInteger()) is string function)
                spec.Params["Function"] = function;
            // MA-2a: a system type's build-up materials, when the type has no Material parameter of its own.
            if (!spec.Params.ContainsKey("Material") && TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, t)) is string layers)
                spec.Params["Material"] = layers;
            pack.Provision.TypeCatalog.Add(spec);
```

In `SentinelAddin/Standards/GoldenModelExtractor.cs`, replace

```csharp
    private static string SafeFamilyName(ElementType t)
    {
        try { return t.FamilyName ?? ""; } catch { return ""; }
    }
```

with

```csharp
    private static string SafeFamilyName(ElementType t)
    {
        try { return t.FamilyName ?? ""; } catch { return ""; }
    }

    /// <summary>MA-2a: a type parameter's value as text, by its storage: text as it is; an element id as that element's name (a
    /// Material); an integer or a length is not a classification and is left out (Function is read apart, by its enum name).</summary>
    private static string? ParamText(Document doc, Parameter? p)
    {
        if (p is null || !p.HasValue) return null;
        switch (p.StorageType)
        {
            case StorageType.String: return p.AsString();
            case StorageType.ElementId:
                var id = p.AsElementId();
                return id is null || id == ElementId.InvalidElementId ? null : doc.GetElement(id)?.Name;
            default: return null;
        }
    }
```

In `SentinelAddin/Standards/GoldenModelExtractor.cs`, replace

```csharp
            if (binding is ElementBinding eb)
                foreach (Category c in eb.Categories) categories.Add(c.Name);
```

with

```csharp
            // MA-2a (BOS-5): the English key, so a German harvest's binding resolves on an English Revit (ResolveCategory binds BIC-first).
            if (binding is ElementBinding eb)
                foreach (Category c in eb.Categories) categories.Add(Compat.CategoryKeyOf(c));
```

In `SentinelAddin/Standards/GoldenModelExtractor.cs`, replace

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Standards;
```

with

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Workflow; // NamingManagerService.LayerMaterials (MA-2a: the build-up's materials)

namespace Sentinel.Standards;
```

In `SentinelAddin/Workflow/NamingManagerService.cs`, replace

```csharp
    private static List<string> LayerMaterials(Document doc, ElementType et)
```

with

```csharp
    /// <summary>A system type's compound-layer materials, finish layers first, distinct. MA-2a: shared with Build Office System's
    /// harvest (params.Material) and Promote's wall facts (the param Material), through TypeHarvest.MaterialLabel.</summary>
    internal static List<string> LayerMaterials(Document doc, ElementType et)
```

In `SentinelAddin/Compat.cs`, replace

```csharp
    /// English ruleset key -> locale-invariant BuiltInCategory (INVALID if unknown).
    public static BuiltInCategory ResolveCategoryKey(string englishKey) =>
        CategoryKeys.TryGetValue(englishKey, out var bic) ? bic : BuiltInCategory.INVALID;
```

with

```csharp
    /// English ruleset key -> locale-invariant BuiltInCategory (INVALID if unknown).
    public static BuiltInCategory ResolveCategoryKey(string englishKey) =>
        CategoryKeys.TryGetValue(englishKey, out var bic) ? bic : BuiltInCategory.INVALID;

    /// MA-2a (BOS-5): a category's BuiltInCategory as its enum name ("OST_Walls"), from its id on every Revit version (a built-in
    /// category's id is its negative enum value; no 2023+ API). Null for a category Revit does not define (a subcategory, an
    /// imported or custom one) — nothing is written for it.
    public static string? BicNameOf(Category category)
    {
        long id = category.Id.IdValue();
        if (id >= 0 || id < int.MinValue) return null;
        var bic = (BuiltInCategory)(int)id;
        return Enum.IsDefined(typeof(BuiltInCategory), bic) ? bic.ToString() : null;
    }

    /// MA-2a (BOS-5): the English key Sentinel's rules use for a category whose BuiltInCategory is one of CategoryKeys ("Walls" for
    /// OST_Walls, whatever the display language), else the category's display name — what a harvest writes as `category`.
    public static string CategoryKeyOf(Category category)
    {
        long id = category.Id.IdValue();
        foreach (var kv in CategoryKeys)
            if ((long)(int)kv.Value == id) return kv.Key;
        return category.Name;
    }
```

- [ ] **Step 4: Run it, and see it pass.** From the repo root: `dotnet run --project tools/ghost-standards-check` — expect `163/163 checks pass` (149 + the harvest's 14, source scans included). Both builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` → `0 Error(s)`, `5 Warning(s)`; the same with `-p:RevitVersion=2026` → `0 Error(s)`, `3 Warning(s)`.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Standards/TypeHarvest.cs SentinelAddin/Standards/StandardsPack.cs SentinelAddin/Standards/GoldenModelExtractor.cs SentinelAddin/Compat.cs SentinelAddin/Workflow/NamingManagerService.cs tools/ghost-standards-check/HarvestChecks.cs tools/ghost-standards-check/Check.cs tools/ghost-standards-check/ghost-standards-check.csproj
git commit -F - <<'EOF'
feat(harvest): Build Office System keeps each type's Function (by its enum name), its Material (the parameter's element, else the build-up's layers) and the matrix's type parameters, and writes the BuiltInCategory beside the category - the English key its id names, the display name kept apart (BOS-5); a type_catalog@1 reads as before (MA-2a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 6 — Revit-bound: Promote and Ghost Builder pass Function, Location and Material; the review names a bridge-typed element

**Files:**
- Create `tools/promote-check/Ma2aWiring.cs`; modify `Check.cs`, `Ma1bWiring.cs` (one scan line)
- Modify `SentinelAddin/Commands.PromoteWalls.cs` — `Fact` reads the line and the material; `WallLine`
- Modify `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` — `ResolveWallType(…, facts)`
- Modify `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` — the drawn walls and the model's walls as barriers, `GhostFacts` (Location only), the summary line
- Modify `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` — `Unsafe` checks a wall retype's width (review C3)
- Modify `SentinelAddin/UI/ChangesetReviewWindow.cs` — the typing line

**Interfaces:** `ElementPlacementFactory.ResolveWallType(el, map, out gap, out typedBy, Dictionary<string,string> facts = null)` — the facts become the matcher's `Params`. Ghost's facts for a wall: `Location` only, when `WallLocation` reads one from this build's drawn walls (each straight single run on a Walls row, its measured thickness as width) with the model's walls whose bounding box spans the build level's elevation appended as barriers (C1); the mapping's `ParamAssignment`s are applied to the placed wall as before and are not facts (C4). `ChangesetExecutor.Unsafe` for a wall: a basic target `WallType.Width` more than 0.5 mm from the current type's → `"<type>" is <n> mm thick, wall <uid> is <m> mm — a retype would move a face; a person decides`; else null as before. The summary gains `outer boundary: N outside · M inside · K unknown (this build's drawn walls; an unknown location types by its layer rule or the mapping, never by a guess).` Promote's `WallFact.Line` is the wall's location curve in mm (an arc's chord, flagged), its width the basic type's; `Material` the basic type's build-up label. Review AI Proposals adds `  ·  typed by the bridge from the facts posted (<label>)` to a bridge-typed row.

- [ ] **Step 1: The failing source scans.**

`Create` `tools/promote-check/Ma2aWiring.cs`:

```csharp
#nullable disable

static partial class Check
{
    // ── 25. MA-2a: the Revit-bound wiring, as a source scan (proven live in drill MA2a) ───────────────────────────────────────
    static void Ma2aWiringChecks()
    {
        Console.WriteLine("\nMA-2a wiring (source scan: Promote's facts, Ghost Builder's facts, the review's typing line)");
        string promote = Src("Commands.PromoteWalls.cs");
        Ok(promote.Contains("Line = WallLine(w),") && promote.Contains("private static WallLocation.Segment WallLine(Wall w)")
           && promote.Contains("Curved = !(c is Line)") && promote.Contains("WidthMm = basic ? wt.Width * FtToMm : 0"),
           "Promote reads each wall's location line in mm for the outer boundary — a curve's chord flagged, the basic type's width, none when the wall has no line");
        Ok(promote.Contains("Material = basic ? TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, wt)) : null,"),
           "Promote reads a basic wall type's build-up materials as the param Material, through the one shared reader");

        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs");
        Ok(ghost.Contains("drawn.Add(new WallLocation.Segment { X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm, WidthMm = el.ThicknessMm, Curved = !(c is Line) });"),
           "Ghost Builder lists this build's drawn walls in mm as the outer boundary reads them, each with its measured thickness");
        Ok(ghost.Contains("foreach (var mw in new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>())")
           && ghost.Contains("bb.Min.Z > planeFt + planeTolFt || bb.Max.Z <= planeFt + planeTolFt) continue;")
           && ghost.IndexOf("foreach (var mw in new FilteredElementCollector(doc)", StringComparison.Ordinal) > ghost.IndexOf("drawnAt[el] = drawn.Count;", StringComparison.Ordinal),
           "…and, after them (so a drawn wall's index holds), the model's own walls that cross the build level as barriers — a fit-out drawing in a model with its shell reads its partitions as inside (review C1)");
        Ok(ghost.Contains("string type = typer.ResolveWallType(el, map, out string gap, out string typedBy, GhostFacts(el));")
           && ghost.Contains("string loc = drawnAt.TryGetValue(el, out int at) ? WallLocation.Locate(drawn, at, out _) : null;")
           && ghost.Contains("if (loc != null) facts[\"Location\"] = loc;") && !ghost.Contains("facts[pa.Name]"),
           "each wall's rule sees its Location when the boundary reads one and nothing else — the mapping's parameter values (the local model's reading of the documents) never pick a type (review C4)");
        Ok(ghost.Contains("report.Warnings.Add(WallLocation.Summary(") && ghost.IndexOf("report.Warnings.Add(WallLocation.Summary(", StringComparison.Ordinal) > ghost.IndexOf("report.Warnings.AddRange(typer.Notes);", StringComparison.Ordinal),
           "the summary says how many walls read outside, inside and unknown, after the types are settled");
        string factory = Src("GhostBuilder", "ElementPlacementFactory.cs");
        Ok(factory.Contains("internal string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy, Dictionary<string, string> facts = null)")
           && factory.Contains("Params = facts,"),
           "the typer passes the facts to the matcher as when.params — the same names the bridge and Promote use");
        Ok(Src("UI", "ChangesetReviewWindow.cs").Contains("if (ChangesetTrust.Typing(el) is string typing) label.Text += \"  ·  \" + typing;"),
           "Review AI Proposals says when the bridge typed an element, beside its accuracy");
        string executor = Src("GhostBuilder", "ChangesetExecutor.cs");
        Ok(!executor.Contains("if (kind == \"wall\") return null;") && executor.Contains("cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt")
           && executor.Contains("mm — a retype would move a face; a person decides\";"),
           "the executor refuses a wall retype whose target width is not the wall's (a bridge-typed retype's thickness is the poster's claim) — and checks nothing else about a wall, as before (review C3)");
    }
}
```

In `tools/promote-check/Check.cs`, replace

```csharp
        WallSampleChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

with

```csharp
        WallSampleChecks();
        Ma2aWiringChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

In `tools/promote-check/Ma1bWiring.cs`, replace

```csharp
        Ok(wallRow > 0 && wallRow < planner.IndexOf("typer.ResolveWallType(el, map, out string gap, out string typedBy)", StringComparison.Ordinal),
```

with

```csharp
        Ok(wallRow > 0 && wallRow < planner.IndexOf("typer.ResolveWallType(el, map, out string gap, out string typedBy", StringComparison.Ordinal), // MA-2a adds the facts argument
```

- [ ] **Step 2: Run it, and see it fail.** From the repo root: `dotnet run --project tools/promote-check`. Expect `539/548 checks pass` — the nine new lines under "MA-2a wiring" `FAIL`.

- [ ] **Step 3: The wiring.**

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;
```

with

```csharp
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.Standards; // TypeHarvest (MA-2a: the build-up's material label)
using Sentinel.Workflow;  // NamingManagerService.LayerMaterials

namespace Sentinel.Commands;
```

In `SentinelAddin/Commands.PromoteWalls.cs`, replace

```csharp
            InGroup = w.GroupId != ElementId.InvalidElementId,
            InOption = w.DesignOption != null,
            Structural = w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)?.AsInteger() == 1,
            Stamp = ProvenanceStamp.Read(w),
        };
    }
```

with

```csharp
            InGroup = w.GroupId != ElementId.InvalidElementId,
            InOption = w.DesignOption != null,
            Structural = w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)?.AsInteger() == 1,
            Stamp = ProvenanceStamp.Read(w),
            // MA-2a: the facts the layer-free rules may see — the wall's line for the outer boundary (every wall, whatever its
            // type: it encloses), and a basic type's build-up materials.
            Line = WallLine(w),
            Material = basic ? TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, wt)) : null,
        };
    }

    /// <summary>MA-2a: the wall's location line in plan (mm) as WallLocation reads it — an arc's chord, flagged; null when the wall
    /// has no bound curve (it is then no barrier and its own location is unknown).</summary>
    private static WallLocation.Segment WallLine(Wall w)
    {
        var c = (w.Location as LocationCurve)?.Curve;
        if (c == null || !c.IsBound) return null;
        XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
        var wt = w.WallType;
        bool basic = wt?.Kind == WallKind.Basic && !w.IsStackedWallMember;
        return new WallLocation.Segment
        {
            X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm,
            WidthMm = basic ? wt.Width * FtToMm : 0,
            Curved = !(c is Line),
        };
    }
```

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs`, replace

```csharp
        internal string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy)
        {
```

with

```csharp
        internal string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy, Dictionary<string, string> facts = null)
        {
```

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs`, replace

```csharp
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
                Level = _level.Name,
            });
```

with

```csharp
            // MA-2a: the facts the layer-free rules may see — the wall's Location from this build's outer boundary (GhostFacts; the
            // mapping's parameter values are the local model's document reading and are never facts) — as when.params, the same
            // names Promote and the bridge use. A rule stating more conditions is tried first, then document order; where no rule
            // names the layer, these decide.
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
                Level = _level.Name,
                Params = facts,
            });
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    // Each wall's type: the reviewer's pick, else the guideline at the measured thickness (a size the model lacks
                    // is cloned here from its catalogue sibling), else the mapping — ElementPlacementFactory's rule, unchanged.
                    typer = new ElementPlacementFactory(doc, level, WallTypes(doc), guideline: r.Guideline);
                    foreach (var el in elements)
                    {
                        if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map) || !string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue;
                        // E17: a block on a Walls row is no wall — it has no run to file, so it would have been a bare SkippedNoGeometry.
                        if (el.Block != null) { NoteNested($"Walls on '{el.CadLayer}'", el); SetAside(el); continue; }
                        string type = typer.ResolveWallType(el, map, out string gap, out string typedBy);
```

with

```csharp
                    // MA-2a: the outer boundary of this build (mm), so a layer-free Location rule can type a wall no layer rule names —
                    // the drawn walls first (a drawn wall's index is its index here; its width is its measured thickness, 0 for one
                    // drawn as a single line: the sample points then sit 100 mm off its line; only straight single runs on Walls rows
                    // are read), then, as barriers only, the model's own walls that cross the build level (review C1: a fit-out
                    // drawing added to a model that already has its shell reads its partitions as inside).
                    var drawn = new List<WallLocation.Segment>();
                    var drawnAt = new Dictionary<GhostElement, int>();
                    foreach (var el in elements)
                    {
                        if (!byLayer.TryGetValue(el.CadLayer ?? "", out var wm) || !string.Equals(wm.Category, "Walls", StringComparison.OrdinalIgnoreCase) || el.Block != null) continue;
                        var c = el.LocationCurve;
                        if (c == null || !c.IsBound) continue;
                        XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
                        drawnAt[el] = drawn.Count;
                        drawn.Add(new WallLocation.Segment { X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm, WidthMm = el.ThicknessMm, Curved = !(c is Line) });
                    }
                    double planeFt = level.Elevation, planeTolFt = WallLocation.TolMm / FtToMm;
                    foreach (var mw in new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>())
                    {
                        var mc = (mw.Location as LocationCurve)?.Curve;
                        var bb = mw.get_BoundingBox(null);
                        if (mc == null || !mc.IsBound || bb == null || bb.Min.Z > planeFt + planeTolFt || bb.Max.Z <= planeFt + planeTolFt) continue;
                        XYZ ma = mc.GetEndPoint(0), mb = mc.GetEndPoint(1);
                        drawn.Add(new WallLocation.Segment
                        {
                            X0 = ma.X * FtToMm, Y0 = ma.Y * FtToMm, X1 = mb.X * FtToMm, Y1 = mb.Y * FtToMm,
                            WidthMm = mw.WallType?.Kind == WallKind.Basic ? mw.Width * FtToMm : 0, Curved = !(mc is Line),
                        });
                    }
                    int outside = 0, inside = 0, unknown = 0;
                    // The one fact a drawn wall's rule may see: its Location when the boundary reads one. The mapping's parameter values
                    // are the local model's reading of the documents (EnrichParamsAsync, best-effort): they are written to the wall as
                    // before (ApplyParams) and never pick its type (review C4). An unknown location is left out: a rule that needs it
                    // cannot fire.
                    Dictionary<string, string> GhostFacts(GhostElement el)
                    {
                        var facts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        string loc = drawnAt.TryGetValue(el, out int at) ? WallLocation.Locate(drawn, at, out _) : null;
                        if (loc != null) facts["Location"] = loc;
                        if (loc == WallLocation.Exterior) outside++; else if (loc == WallLocation.Interior) inside++; else unknown++;
                        return facts;
                    }

                    // Each wall's type: the reviewer's pick, else the guideline at the measured thickness (a size the model lacks
                    // is cloned here from its catalogue sibling), else the mapping — ElementPlacementFactory's rule, unchanged.
                    typer = new ElementPlacementFactory(doc, level, WallTypes(doc), guideline: r.Guideline);
                    foreach (var el in elements)
                    {
                        if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map) || !string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue;
                        // E17: a block on a Walls row is no wall — it has no run to file, so it would have been a bare SkippedNoGeometry.
                        if (el.Block != null) { NoteNested($"Walls on '{el.CadLayer}'", el); SetAside(el); continue; }
                        string type = typer.ResolveWallType(el, map, out string gap, out string typedBy, GhostFacts(el));
```

In `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`, replace

```csharp
    internal static string Unsafe(Element e, string kind, ElementType cur, ElementType nt)
    {
        if (kind == "wall") return null;
        string what = $"{kind} {e.UniqueId}";
```

with

```csharp
    internal static string Unsafe(Element e, string kind, ElementType cur, ElementType nt)
    {
        string what = $"{kind} {e.UniqueId}";
        if (kind == "wall")
        {
            // MA-2a (review C3): a wall retype never moves a face either. Promote names a type at the wall's own width, so its retypes
            // pass; a retype the bridge typed from a poster's facts (full contract 2) carries a CLAIMED thickness, and this is the one
            // check that sees it. Nothing else about a wall is checked here, as before (MA-0's holds are the planner's).
            if (cur is WallType cw && nt is WallType nw && cw.Kind == WallKind.Basic && nw.Kind == WallKind.Basic && Math.Abs(nw.Width - cw.Width) > TolFt)
                return $"\"{nt.Name}\" is {Mm(nw.Width / MmToFeet)} mm thick, {what} is {Mm(cw.Width / MmToFeet)} mm — a retype would move a face; a person decides";
            return null;
        }
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace

```csharp
                    report.CreatedTypes.AddRange(typer.CreatedTypes);
                    report.Warnings.AddRange(typer.Notes);
```

with

```csharp
                    report.CreatedTypes.AddRange(typer.CreatedTypes);
                    report.Warnings.AddRange(typer.Notes);
                    // MA-2a: what the outer boundary read of this build's walls — a count, so a drawing whose walls do not close is seen.
                    if (drawn.Count > 0) report.Warnings.Add(WallLocation.Summary(outside, inside, unknown) + " (this build's drawn walls; an unknown location types by its layer rule or the mapping, never by a guess).");
```

In `SentinelAddin/UI/ChangesetReviewWindow.cs`, replace

```csharp
            if (ChangesetTrust.Accuracy(el) is string accuracy) label.Text += "  ·  " + accuracy; // MA-1a item 8: "not measured"
```

with

```csharp
            if (ChangesetTrust.Accuracy(el) is string accuracy) label.Text += "  ·  " + accuracy; // MA-1a item 8: "not measured"
            if (ChangesetTrust.Typing(el) is string typing) label.Text += "  ·  " + typing; // MA-2a: the bridge typed it from posted facts
```

- [ ] **Step 4: Run it, and see it pass.** From the repo root: `dotnet run --project tools/promote-check` — expect `548/548 checks pass`. Both builds (`-p:RevitVersion=2024` and `2026`, each with `-p:DeployToRevit=false`): `0 Error(s)`; `5` and `3` warnings.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Commands.PromoteWalls.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/UI/ChangesetReviewWindow.cs tools/promote-check/Ma2aWiring.cs tools/promote-check/Ma1bWiring.cs tools/promote-check/Check.cs
git commit -F - <<'EOF'
feat(revit): Promote reads each wall's line and build-up material for the layer-free rules; Ghost Builder passes the Location read from this build's walls with the model's walls at the build level as barriers, and counts what the outer boundary read; the executor refuses a wall retype that would move a face; Review AI Proposals names a bridge-typed element (MA-2a)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 7 — BOS-3: Install catalogue on office from Revit — a lead's PUT off the API thread, the bridge's role check, the window's words

**Files:**
- Create `tools/ghost-standards-check/InstallChecks.cs`; modify `Check.cs`
- Modify `SentinelAddin/Standards/TypeCatalogExport.cs` — `InstallJson`, `OfficeKeyFrom`, `InstallLine`, `NotInstalledLine`; the dialog's sentence
- Modify `SentinelAddin/Coordination/GovernedNotify.cs` — `ProjectScope`
- Modify `SentinelAddin/UI/StandardsReviewWindow.cs` — the button and the event
- Modify `SentinelAddin/Commands.Standards.cs` — the off-thread install

**Interfaces:** `TypeCatalogExport.InstallJson(title, extractedAt, types, views, document)` — the export plus `source {tool: "revit-build", document}`. `TypeCatalogExport.OfficeKeyFrom(scopeJson, key, out error)` → an office's own key, a project's `office_key`, or null with `project <key> belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)` / `the bridge's answer to the scope read could not be read`. `TypeCatalogExport.InstallLine(office, version, sha, count, title)` → `type_catalog@<n> · office · <sha12>…: installed on <office> — <N> types from <title>. Ghost Builder, Promote and the bridge read it from here on; GET /cde/<office>/artefacts/type_catalog answers the same sha.` `TypeCatalogExport.NotInstalledLine(error)` → `Catalogue NOT installed: <error>`. `GovernedNotify.ProjectScope(key)` → `(Json, Error)`: GET `/cde/projects/<key>/scope`, blocking, 120 s, off the API thread. `StandardsReviewWindow.InstallRequested` (event) and the button `Install catalogue on office`.

- [ ] **Step 1: The failing checks.**

`Create` `tools/ghost-standards-check/InstallChecks.cs`:

```csharp
using Sentinel.Coordination;
using Sentinel.Standards;

/// <summary>MA-2a (BOS-3): Install on office from Revit — the pure words and reads (TypeCatalogExport.OfficeKeyFrom, InstallJson,
/// InstallLine, NotInstalledLine) and, by source scan, the window's button, the command's off-thread wiring and the bridge read.</summary>
static class InstallChecks
{
    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Console.WriteLine("\nMA-2a (BOS-3) — Install catalogue on office from Revit (TypeCatalogExport, GovernedNotify, StandardsReviewWindow)");
        const string project = "{\"key\":\"demo\",\"kind\":\"project\",\"office_key\":\"bds-office\",\"keys\":[\"demo\"]}";
        const string office = "{\"key\":\"bds-office\",\"kind\":\"office\",\"office_key\":null,\"keys\":[\"bds-office\",\"demo\"]}";
        const string orphan = "{\"key\":\"ma2a\",\"kind\":\"project\",\"office_key\":null,\"keys\":[\"ma2a\"]}";
        _ok(TypeCatalogExport.OfficeKeyFrom(project, "demo", out var e1) == "bds-office" && e1 == null, "a project's scope names its office: the catalogue goes there");
        _ok(TypeCatalogExport.OfficeKeyFrom(office, "bds-office", out var e2) == "bds-office" && e2 == null, "an office's own scope: the catalogue goes on the office itself");
        _ok(TypeCatalogExport.OfficeKeyFrom(orphan, "ma2a", out var e3) == null
            && e3 == "project ma2a belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)",
            "a project with no office is refused, in words — never installed on the project");
        _ok(TypeCatalogExport.OfficeKeyFrom("not json", "demo", out var e4) == null && e4 == "the bridge's answer to the scope read could not be read"
            && TypeCatalogExport.OfficeKeyFrom("{\"kind\":\"project\"}", "demo", out var e5) == null && e5!.StartsWith("project demo belongs to no office"),
            "an answer that is not the scope, or names no office, is refused in words");

        var types = new List<TypeSpec> { new() { Category = "Walls", Bic = "OST_Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200 } };
        string body = TypeCatalogExport.InstallJson("Office Project (Template)", new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.FromHours(2)), types, new List<ViewTemplateSpec>(), "Office Project (Template)");
        using (var d = System.Text.Json.JsonDocument.Parse(body))
        {
            var src = d.RootElement.GetProperty("source");
            _ok(src.GetProperty("tool").GetString() == "revit-build" && src.GetProperty("document").GetString() == "Office Project (Template)"
                && d.RootElement.GetProperty("template").GetProperty("title").GetString() == "Office Project (Template)" && d.RootElement.GetProperty("count").GetInt32() == 1,
                "the install body is the export plus a top-level source {tool: revit-build, document} — the PUT route lifts it into the pointer");
        }
        var read = Sentinel.GhostBuilder.GuidelineMatcher.FromBodies(null, body, out _, out var err);
        _ok(read.HasCatalog && err == null, "…and still parses as type_catalog@n (the source key is ignored by the readers)");
        _ok(TypeCatalogExport.InstallLine("bds-office", 2, "3f0737600a1b9c8d7e6f5a4b3c2d1e0f3f0737600a1b9c8d7e6f5a4b3c2d1e0f", 1434, "BDS_Project Number_Project Name (Template)")
            == "type_catalog@2 · office · 3f0737600a1b…: installed on bds-office — 1,434 types from BDS_Project Number_Project Name (Template). Ghost Builder, Promote and the bridge read it from here on; GET /cde/bds-office/artefacts/type_catalog answers the same sha.",
            "the window's line after an install: the artefact's label, the office, the count, where it is read from");
        _ok(TypeCatalogExport.NotInstalledLine("HTTP 403: this action requires the lead role (you are contributor)") == "Catalogue NOT installed: HTTP 403: this action requires the lead role (you are contributor)",
            "the window's line after a refusal carries the bridge's own words (the role sentence included)");
        _ok(TypeCatalogExport.Message(2, "T", "C:\\x.json").Contains("Install catalogue on office"), "the export dialog names the window's button as the other way to install");

        string Src(params string[] parts) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(parts).ToArray()));
        string window = Src("UI", "StandardsReviewWindow.cs");
        _ok(window.Contains("public event Action? InstallRequested;") && window.Contains("Btn(\"Install catalogue on office\", () => InstallRequested?.Invoke())"),
            "the review window has the button and raises the event");
        string cmd = Src("Commands.Standards.cs");
        int wire = cmd.IndexOf("window.InstallRequested += () =>", StringComparison.Ordinal);
        int enqueue = cmd.IndexOf("App.Events.Enqueue(_ =>", wire, StringComparison.Ordinal);
        int task = cmd.IndexOf("Task.Run(() =>", enqueue, StringComparison.Ordinal);
        int scope = cmd.IndexOf("GovernedNotify.ProjectScope(key)", task, StringComparison.Ordinal);
        int put = cmd.IndexOf("GovernedNotify.InstallArtefact(office, \"type_catalog\", TypeCatalogExport.InstallJson(", scope, StringComparison.Ordinal);
        _ok(wire > 0 && enqueue > wire && task > enqueue && scope > task && put > scope,
            "the command reads the key on the API thread (the event hub), then the scope read and the PUT run in Task.Run — no network call on Revit's thread");
        _ok(cmd.Contains("TypeCatalogExport.OfficeKeyFrom(scope.Json!, key, out var why)") && cmd.Contains("TypeCatalogExport.InstallLine(office, put.Version, put.Sha256, types.Count, title)"),
            "the office comes from the scope answer, and the window prints the install line or the refusal");
        string notify = Src("Coordination", "GovernedNotify.cs");
        _ok(notify.Contains("public static (string? Json, string? Error) ProjectScope(string projectKey)") && notify.Contains("\"/cde/projects/\" + Uri.EscapeDataString(projectKey.Trim()) + \"/scope\""),
            "GovernedNotify reads GET /cde/projects/:key/scope with the bridge's bearer, blocking, off the API thread");
    }
}
```

In `tools/ghost-standards-check/Check.cs`, replace

```csharp
        HarvestChecks.Run(RepoRoot(), Ok);
```

with

```csharp
        HarvestChecks.Run(RepoRoot(), Ok);
        InstallChecks.Run(RepoRoot(), Ok);
```

- [ ] **Step 2: Run it, and see it fail.** From the repo root: `dotnet run --project tools/ghost-standards-check`. Expect a compile failure: `'TypeCatalogExport' does not contain a definition for 'OfficeKeyFrom'` (five times), and for `InstallJson`, `InstallLine`, `NotInstalledLine`.

- [ ] **Step 3: The words, the read, the button, the wiring.**

In `SentinelAddin/Standards/TypeCatalogExport.cs`, replace

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Standards;
```

with

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ArtefactClient.RefLabel (MA-2a: the install line)

namespace Sentinel.Standards;
```

In `SentinelAddin/Standards/TypeCatalogExport.cs`, replace

```csharp
    /// <summary>What Build Office System says after the export: where it is and how to install it on the office.</summary>
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}. " +
        $"Install it on the office: node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog.\n\n" +
        "Run it from WebApp; <office> is the office's web project key. Ghost Builder and Photo Massing read the type " +
        "catalogue installed on the project or its office — never this file.";
}
```

with

```csharp
    /// <summary>What Build Office System says after the export: where it is and how to install it on the office.</summary>
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}. " +
        $"Install it on the office: node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog.\n\n" +
        "Run it from WebApp; <office> is the office's web project key. Ghost Builder and Photo Massing read the type " +
        "catalogue installed on the project or its office — never this file.\n\n" +
        "A lead installs it from the review window too: Install catalogue on office (MA-2a, BOS-3) — no command line.";

    /// <summary>MA-2a (BOS-3): the body Install on office PUTs — the export plus a top-level <c>source</c> {tool: revit-build,
    /// document}, which the bridge's PUT route lifts into the pointer's provenance (as the ruleset install's does).</summary>
    public static string InstallJson(string templateTitle, DateTimeOffset extractedAt, List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates, string document)
    {
        var body = JsonNode.Parse(Json(templateTitle, extractedAt, types, viewTemplates))!.AsObject();
        body["source"] = new JsonObject { ["tool"] = "revit-build", ["document"] = document };
        return body.ToJsonString();
    }

    /// <summary>MA-2a (BOS-3): the office a catalogue is installed on, read from GET /cde/projects/:key/scope's answer ({kind,
    /// office_key}): an office's own key, or a project's office — never the project itself (a catalogue installed on a project
    /// would shadow its office's for that project alone, and the office's later installs would no longer reach it). Null with
    /// <paramref name="error"/> otherwise.</summary>
    public static string? OfficeKeyFrom(string scopeJson, string key, out string? error)
    {
        error = null;
        string? kind = null, office = null;
        try
        {
            using var d = JsonDocument.Parse(scopeJson);
            if (d.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (d.RootElement.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String) kind = k.GetString();
                if (d.RootElement.TryGetProperty("office_key", out var o) && o.ValueKind == JsonValueKind.String) office = o.GetString();
            }
        }
        catch (JsonException) { error = "the bridge's answer to the scope read could not be read"; return null; }
        if (kind == "office") return key;
        if (!string.IsNullOrWhiteSpace(office)) return office;
        error = $"project {key} belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)";
        return null;
    }

    /// <summary>MA-2a (BOS-3): the window's line after an install — the artefact's label (the bridge's refLabel), the office, the count,
    /// and where it is read from, so the proof (GET answers the same sha) is one line away.</summary>
    public static string InstallLine(string officeKey, int version, string? sha256, int count, string templateTitle) =>
        $"{ArtefactClient.RefLabel("type_catalog@" + version, "office", sha256)}: installed on {officeKey} — {count:N0} types from {templateTitle}. " +
        $"Ghost Builder, Promote and the bridge read it from here on; GET /cde/{officeKey}/artefacts/type_catalog answers the same sha.";

    /// <summary>MA-2a (BOS-3): the window's line after a refusal — the bridge's own words (a 403 carries the role sentence).</summary>
    public static string NotInstalledLine(string error) => "Catalogue NOT installed: " + error;
}
```

In `SentinelAddin/Coordination/GovernedNotify.cs`, replace

```csharp
        // ponytail: throttle is per process, not per document — two models synced within 60 s post one scan;
```

with

```csharp
        /// <summary>
        /// MA-2a (BOS-3): <c>GET /cde/projects/{key}/scope</c> — the bridge's answer as JSON text ({kind, office_key, keys};
        /// TypeCatalogExport.OfficeKeyFrom reads the office out of it), or a reason. Blocking (120 s cap) — call it OFF the API
        /// thread. A signed-in caller must be a member of the project or its office (the bridge's D7); the machine token passes.
        /// </summary>
        public static (string? Json, string? Error) ProjectScope(string projectKey)
        {
            if (string.IsNullOrWhiteSpace(projectKey)) return (null, NotBoundError);
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/projects/" + Uri.EscapeDataString(projectKey.Trim()) + "/scope";
                var resp = Send(GovHttp, HttpMethod.Get, url, null, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (resp.IsSuccessStatusCode) return (json, null);
                try { using var d = JsonDocument.Parse(json); if (d.RootElement.TryGetProperty("message", out var m)) return (null, $"HTTP {(int)resp.StatusCode}: {m.GetString()}"); } catch { }
                return (null, "bridge returned HTTP " + (int)resp.StatusCode);
            }
            catch (Exception ex)
            {
                return (null, ex is TaskCanceledException or OperationCanceledException ? "timed out after 120s" : (ex.InnerException?.Message ?? ex.Message));
            }
        }

        // ponytail: throttle is per process, not per document — two models synced within 60 s post one scan;
```

In `SentinelAddin/UI/StandardsReviewWindow.cs`, replace

```csharp
    /// <summary>Fires when the user asks to send the FULL extracted pack (not the ticked subset) to Sentinel as the office snapshot.</summary>
    public event Action? SnapshotRequested;
```

with

```csharp
    /// <summary>Fires when the user asks to send the FULL extracted pack (not the ticked subset) to Sentinel as the office snapshot.</summary>
    public event Action? SnapshotRequested;
    /// <summary>MA-2a (BOS-3): fires when a lead asks to install the harvested type catalogue on the document's office as type_catalog@n+1.</summary>
    public event Action? InstallRequested;
```

In `SentinelAddin/UI/StandardsReviewWindow.cs`, replace

```csharp
        var snapshot = Btn("Send office snapshot to Sentinel", () => SnapshotRequested?.Invoke());
        var close = Btn("Close", Close);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        buttons.Children.Add(build);
        buttons.Children.Add(save);
        buttons.Children.Add(iso);
        buttons.Children.Add(snapshot);
        buttons.Children.Add(close);
```

with

```csharp
        var snapshot = Btn("Send office snapshot to Sentinel", () => SnapshotRequested?.Invoke());
        var install = Btn("Install catalogue on office", () => InstallRequested?.Invoke());
        var close = Btn("Close", Close);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        buttons.Children.Add(build);
        buttons.Children.Add(save);
        buttons.Children.Add(iso);
        buttons.Children.Add(snapshot);
        buttons.Children.Add(install);
        buttons.Children.Add(close);
```

In `SentinelAddin/Commands.Standards.cs`, replace

```csharp
                Task.Run(() =>
                {
                    var error = GovernedNotify.OfficeSnapshot(dto, key);
                    window.SetStatus(error is null
                        ? $"Office snapshot received by Sentinel — project {key}, ruleset {judged}. Open the web app → Documents → READINESS to see it measured."
                        : $"Snapshot NOT sent: {error}");
                });
            });
        };
        return window;
```

with

```csharp
                Task.Run(() =>
                {
                    var error = GovernedNotify.OfficeSnapshot(dto, key);
                    window.SetStatus(error is null
                        ? $"Office snapshot received by Sentinel — project {key}, ruleset {judged}. Open the web app → Documents → READINESS to see it measured."
                        : $"Snapshot NOT sent: {error}");
                });
            });
        };

        // MA-2a (BOS-3): a lead installs the harvested catalogue on the document's OFFICE from here — no CLI. The key is read on
        // the API thread through the event hub; the scope read and the PUT run off Revit's thread (GovernedNotify, 120 s each);
        // the bridge decides the role (lead on the office), and the window prints its words. Never on the project itself: a
        // catalogue there would shadow the office's for that project alone (TypeCatalogExport.OfficeKeyFrom).
        window.InstallRequested += () =>
        {
            var pack = window.Source;
            var src = pack.SourceModel;
            if (src is null || string.IsNullOrWhiteSpace(src.Title) || pack.Provision.TypeCatalog.Count == 0)
            {
                window.SetStatus(TypeCatalogExport.NotInstalledLine("this pack has no harvested catalogue — extract from a template first (Build Office System)"));
                return;
            }
            if (doc is null || App.Events is null) { window.SetStatus(TypeCatalogExport.NotInstalledLine("no open model to read the project from")); return; }
            string title = src.Title;
            var types = pack.Provision.TypeCatalog;
            var views = pack.Provision.ViewTemplates;
            window.SetStatus("Reading this model's project…");
            App.Events.Enqueue(_ =>
            {
                if (!doc.IsValidObject) { window.SetStatus(TypeCatalogExport.NotInstalledLine("the model this window was opened on is closed")); return; }
                var ctx = Sentinel.Engine.ProjectContext.For(doc);
                if (!ctx.IsBound) { window.SetStatus(TypeCatalogExport.NotInstalledLine(Sentinel.Engine.ProjectContext.NotBound)); return; }
                string key = ctx.Key;
                window.SetStatus($"Asking Sentinel which office {key} belongs to…");
                Task.Run(() =>
                {
                    var scope = GovernedNotify.ProjectScope(key);
                    if (scope.Error is not null) { window.SetStatus(TypeCatalogExport.NotInstalledLine(scope.Error)); return; }
                    var office = TypeCatalogExport.OfficeKeyFrom(scope.Json!, key, out var why);
                    if (office is null) { window.SetStatus(TypeCatalogExport.NotInstalledLine(why!)); return; }
                    window.SetStatus($"Installing type_catalog on {office} ({types.Count} types)…");
                    var put = GovernedNotify.InstallArtefact(office, "type_catalog", TypeCatalogExport.InstallJson(title, DateTimeOffset.Now, types, views, title), UserSession.Actor);
                    window.SetStatus(put.Error is null
                        ? TypeCatalogExport.InstallLine(office, put.Version, put.Sha256, types.Count, title)
                        : TypeCatalogExport.NotInstalledLine(put.Error));
                });
            });
        };
        return window;
```

- [ ] **Step 4: Run it, and see it pass.** From the repo root: `dotnet run --project tools/ghost-standards-check` — expect `176/176 checks pass` (163 + BOS-3's 13). Both builds (`2024`, `2026`, each `-p:DeployToRevit=false`): `0 Error(s)`; `5` and `3` warnings.

- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/Standards/TypeCatalogExport.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/UI/StandardsReviewWindow.cs SentinelAddin/Commands.Standards.cs tools/ghost-standards-check/InstallChecks.cs tools/ghost-standards-check/Check.cs
git commit -F - <<'EOF'
feat(standards): Install catalogue on office from the review window - the office from GET /cde/projects/:key/scope, the PUT through GovernedNotify.InstallArtefact off the API thread, the bridge's lead check, the window's line or the bridge's words (MA-2a, BOS-3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 8 — Words: the design doc, the two READMEs; the final checks

**Files:**
- Modify `docs/strategy/2026-09-30-model-automation-design.md` — the artefact table, the Retype row, §3.4 step 4, MA-2's two bullets, MA-4's bridge-typing bullet
- Modify `demo/bds-pilot/README.md` — a row for `bds-dd-layerfree-guideline.json`
- Modify `demo/ghost-sample/README.md` — the drill-files line names `--ma2a` (one line reworded: the README is evidence inside `ghost-p2-check`'s 6,000-character budget, as the MA-1b plan found)

- [ ] **Step 1: The words.** (Use the Edit tool: the docs hold a few odd bytes and are CRLF.)

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
BUILT. But every BDS type rule keys on a DWG layer. Promote and scan candidates have no layer, so today only the default would apply. MA-2 adds rules without a layer (the matcher already supports them) |
```

with

```markdown
BUILT. Rules without a layer since MA-2a (plan `docs/superpowers/plans/2026-10-03-ma2a-layer-free-rules-harvest-bridge-typing.md`): a rule may key on `Function`, `Location` (Exterior/Interior, from the storey's outer boundary) and `Material` in `when.params`; Promote, Ghost Builder and the bridge pass them; `demo/bds-pilot/bds-dd-layerfree-guideline.json` is the DRAFT DD file. The pilot's office guideline (`bds-guideline.json`) still keys every rule on a layer: a lead writes the layer-free ones |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
BUILT. Installing it still needs a CLI run (BOS-3). The harvest keeps no Function and few type parameters; MA-2 extends it |
```

with

```markdown
BUILT. Since MA-2a a row keeps the type's `Function` (its enum name), `Material` (its Material parameter, else its build-up's layers), the type parameters the matrix will ask for (Fire Rating, Assembly Code, Type Mark, Keynote, Structural Material) and its `bic` (BuiltInCategory, BOS-5: the category is the English key its id names, the display name in `category_local`); a lead installs it from Revit's review window (BOS-3: Install catalogue on office). A type_catalog@1 from before reads as it did |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
| 2 | Retype: generic → office type, by function, measured thickness, location and material. Needs rules without a layer and the Function kept in the catalogue harvest | `Element.ChangeTypeId` | C5 [MKT §6.3] | MA-0 (walls), MA-2 |
```

with

```markdown
| 2 | Retype: generic → office type, by function, measured thickness, location and material. Rules without a layer and the Function in the catalogue harvest landed in MA-2a; location is read from the storey's own walls (`WallLocation`: one side open = outside, both enclosed = inside, else unknown — a reason to a person) | `Element.ChangeTypeId` | C5 [MKT §6.3] | MA-0 (walls), MA-2a (location, material) |
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
Example: when every concept wall has the same generic type, the planner cannot tell inside from outside, so those walls go to a person until MA-2 reads the outer boundary.
```

with

```markdown
Example: when every concept wall has the same generic type, its Function tells nothing; since MA-2a the planner reads inside or outside from the storey's own walls (the outer boundary) and types by a Location rule — and a wall whose location cannot be read (both sides open, a curved wall, too few walls) goes to a person with that reason.
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - **Rules without a layer.** The matcher already supports them. The work is: the planner and the readers pass Function, location (inside or outside, from the outer boundary) and material as params; a lead writes layer-free rules into the office guideline; C# and TS parity tests cover them. Size S–M.
  - **A wider catalogue harvest.** Build Office System keeps each type's Function and the type parameters the matrix needs. BOS-3 (install the catalogue from Revit, no CLI) and BOS-5 (categories by BuiltInCategory, so non-English Revit still matches).
```

with

```markdown
  - **Rules without a layer.** LANDED in MA-2a (2026-10-03): Promote, Ghost Builder and the bridge pass Function, Location (from the outer boundary: `WallLocation`) and Material as params; the DRAFT layer-free DD file is `demo/bds-pilot/bds-dd-layerfree-guideline.json`; the C#/TS parity fixture is `WebApp/src/sentinel-core/fixtures/guideline-layerfree-cases.json`. A lead still writes the office guideline's own layer-free rules.
  - **A wider catalogue harvest.** LANDED in MA-2a: Function (enum name), Material, the matrix's type parameters, `bic` (BOS-5), Install catalogue on office from the review window (BOS-3).
```

In `docs/strategy/2026-09-30-model-automation-design.md`, replace

```markdown
  - Bridge typing: the bridge calls `resolveWithCatalog`, with the layer-free rules from MA-2 and C#/TS conformance tests.
```

with

```markdown
  - Bridge typing: LANDED EARLY in MA-2a (full contract 2) — an element posted without `place.TypeName` carries `facts {thickness_mm?, params?}` and the bridge calls `resolveWithCatalog` on the project's guideline@n and type_catalog@n, fills the type and records `typing`, or answers 400 naming what is missing; `measured` stays ignored until a survey job backs it (item 8); the shared fixture is `WebApp/bridge/fixtures/changeset-ops/contract2-typed-body.json`. The body at :681-705 is answered 201 with `facts` in place of `measured` and 200 mm (its 203 mm is a gap under the exact rule, :728).
```

In `demo/bds-pilot/README.md`, replace

```markdown
| `bds-lod-matrix-dd.json` |
```

with

```markdown
| `bds-dd-layerfree-guideline.json` | Revit **Promote (DD)**, **Ghost Builder** and the bridge's typing (MA-2a) — a `guideline@n` on the throwaway project `ma2a` only | **DRAFT**: the DD wall rules without a layer — `Location: Exterior` → `BDS_EXT_ARC_CMU_{thickness} mm`, `Location: Interior` → `BDS_INT_ARC_CMU_{thickness} mm`, with `Material: STONE` / `GYPS` refinements first and MA-0's `Function` rules last (where the outer boundary cannot be read on a mixed storey). Location is read from the storey's own walls (`WallLocation`), never guessed. `tools/promote-check` and `guideline-layerfree.test.ts` resolve it against the catalogue on both sides (`fixtures/guideline-layerfree-cases.json`); never on `bds-office`. |
| `bds-lod-matrix-dd.json` |
```

In `demo/ghost-sample/README.md`, replace

```markdown
`make-sample.py --step2` / `--plant` / `--ma1b` write the drill drawings (see the MA-1a step 2 and MA-1b plans).
```

with

```markdown
`make-sample.py --step2` / `--plant` / `--ma1b` / `--ma2a` write the drill drawings (MA-1a step 2, MA-1b, MA-2a plans).
```

- [ ] **Step 2: Run everything, and see it pass.** From the repo root, every check project — `for d in tools/*-check; do dotnet run --project $d; done` — all pass (25 tracked projects; `tools/rvtinfo-check` is a 26th folder on this PC that git does not track — run it too if it is there, and say so): `promote-check` `548/548`, `ghost-standards-check` `176/176`, `ghost-p2-check` `107/107` (the README still leaves the spec its room), `guideline-check` `17/17`, `session-check` `47/47`, `massing-check` `17/17`, `wallpair-check` `9/9`, `datum-check` `DATUM OK`, the others as on master. From `WebApp`: `npx vitest run bridge/` — `Test Files  85 passed (85)`, `Tests  1705 passed | 1 skipped (1706)`; `npm test` — `139 passed`, `2148 passed | 1 skipped (2149)`. Both builds with `-p:DeployToRevit=false`: Revit 2024 `0 Error(s)`, `5 Warning(s)`; Revit 2026 `0 Error(s)`, `3 Warning(s)` (2022 and 2027 also compile with `0 Error(s)`; they are not required). `git status` shows nothing but these commits: no `.rvt`, no `config/.env`, no `%AppData%` file.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md demo/bds-pilot/README.md demo/ghost-sample/README.md
git commit -F - <<'EOF'
docs: MA-2a landed - rules without a layer, the wider harvest with BOS-3 and BOS-5, bridge typing (full contract 2) - in the design doc and the demo READMEs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

## Live drill MA2a (Revit 2024, scratch copies only — on the branch, before the merge)

**Who does what.** The drill runner drives Revit by mouse. Two steps are the founder's, because they need a password: signing in (set-up) and signing out (closing list). If the founder is away, the drill runs in whichever state the PC is in, and the other state is recorded as **owed** — never as passed. The sign-in state found before the drill is recorded, and the closing list returns the PC to it. Whenever the session is, or will be, signed in, the account is first made a contributor of the scratch projects (set-up): a changeset write needs that role (MA-1b's C10), and the BOS-3 rows need the account on the OFFICE — first as a contributor (the refusal row), then as a lead (the install row).

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Signed in or signed out**: whichever of the two this session does not run is owed — for the actor on the ledger rows (B-1, H-2) and, signed out, for the contributor refusal H-3 (the machine credential passes as `service`, so it cannot be refused).
- **One row on Revit 2026 and one on Revit 2027**: the builds compile; the harvest's category-id cast and the Function read are proven live on 2024 only.
- **A non-English Revit** (BOS-5): no German Revit is on this PC. The German rows are pinned on both sides and the harvest's key derivation is a source scan; a German harvest applied on an English Revit is owed.
- **Floors, roofs, ceilings, doors and windows through the layer-free rules, live**: the drill installs no `lod_matrix`, so Promote runs walls only (MA-0's rule); a door reading its host rule's `Location` is proven offline (Task 4) and owed live.
- **A storey with a closed inner courtyard, and a wall drawn in pieces (GHB-6), under the boundary** (F1's ceilings): pinned offline, not drilled.
- **The MCP tool posting `facts`**: the tool forwards elements as given; the drill posts the bodies itself (B-1, B-3).
- **A survey-backed `measured`**: MA-4; `measured` is still ignored, and B-3 (e) shows it.
- **Ghost Builder's clone of a catalogue sibling** (S5): not provoked; recorded if G-1 shows a `CreatedTypes` line.
- **The office guideline's own layer-free rules** (design `:1081`: "a lead writes layer-free rules into the office guideline"): a lead's step on `bds-office`, in the template's own material words (UNSURE 7), with the DRAFT file `bds-dd-layerfree-guideline.json` as the starting point — owed; nothing in this plan installs a rule on a real office (review C17).
- **Design `:1098`'s plan-only run on aster-tower** ("no guideline@n — not checkable"): no founder model is opened. The bridge's "not checkable" is row B-3 (d) on `ma2a-orphan`; Promote's is MA-0's and unchanged (review C18).

The drill record ends with the list of owed rows, and each goes into the "owed" memory.

**Set-up (once):**
- **Build.** Close Revit. Run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys the branch's build into Revit 2024 (the closing list says what stays deployed). Record `git rev-parse --short HEAD` and the deployed DLL's sha256 (`certutil -hashfile "<the deployed Sentinel.dll>" SHA256`, lower case). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work.
- **The add-in's bridge settings.** Before the first switch, copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma2abak` beside it. The file holds the file token: never print it and never open it in a viewer.
- **The test bridge on 127.0.0.1:4101**, on the branch's code (it must type: Task 3). From `WebApp`:
  - Probe which settings `config/.env` holds (names only, never a value):

    ```bash
    node -e 'import("./bridge/load-env.mjs").then(m => { const e = m.loadEnv(); for (const k of ["BCF_PORT", "BCF_EVENT_POLL_MS", "BCF_BASE"]) console.log(k, k in e ? "is set in config/.env — the shell cannot override it" : "is not in config/.env — the shell value is used") })'
    ```

  - If `BCF_PORT` is set in `config/.env`: stop, and ask the founder — the test bridge cannot be moved to 4101 from the shell, and the drill does not edit `config/.env`.
  - Start it in the background, event poll off: `BCF_PORT=4101 BCF_EVENT_POLL_MS=0 node bridge/bcf-service.mjs`. Its banner names port 4101, and `curl -s http://127.0.0.1:4101/health` answers. The founder's 4100 bridge is not touched, and no write route of it is called.
  - **Every bridge call of this drill names `http://127.0.0.1:4101` itself.** Define this helper once in the drill's shell (it reads the token through `load-env.mjs` and prints the status and the reply; a path is given without its leading slash; a body starting with `@` is a file):

    ```bash
    b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
    ```

  - Point the add-in at the test bridge, with a script that prints nothing of the file: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The scratch web projects.** Nothing is installed on `demo`, `bds-office` or any real office. The machine credential is a platform admin for these calls (migration 0033, D3), so it may make an office and attach projects to it:
  - `b4101 POST cde/projects '{"key":"ma2a-office","kind":"office"}'` — the scratch office.
  - `b4101 POST cde/projects '{"key":"ma2a","office_key":"ma2a-office"}'` — the Promote and bridge rows' project; `b4101 POST cde/projects '{"key":"ma2a-ghost","office_key":"ma2a-office"}'` — the Ghost rows'; `b4101 POST cde/projects '{"key":"ma2a-orphan"}'` — no office (rows B-3 (d) and H-4).
  - On the OFFICE, so both projects inherit them (the bridge typing row B-1 proves the inheritance): `b4101 PUT "cde/ma2a-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-layerfree-guideline.json` and `b4101 PUT "cde/ma2a-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json` (the pilot's catalogue: no `bic` on any row — every row that reads it before H-2 is the proof that a type_catalog@1 from before still works). No `lod_matrix`: Promote runs walls only.
  - On `ma2a-ghost` alone: `b4101 PUT "cde/ma2a-ghost/artefacts/guideline?actor=drill" @../demo/ghost-sample/ma2a-ghost-guideline.json` (a layer rule listed first, then the Location rules; the catalogue comes from the office).
  - The proof: `b4101 GET cde/ma2a/artefacts/guideline` answers `"source":"office"`, `"ref":"guideline@1"` and the standard `BDS DD walls, layer-free v0 (MA-2a) — DRAFT`; `b4101 GET cde/ma2a-ghost/artefacts/guideline` answers `"source":"project"`; `b4101 GET cde/ma2a-orphan/artefacts/guideline` is a 404 `not_installed`.
  - **If the session is, or will be, signed in:** `b4101 POST cde/ma2a/members '{"email":"<the account e-mail>","role":"contributor"}'`, the same for `ma2a-ghost`, and for the office `b4101 POST cde/ma2a-office/members '{"email":"<the account e-mail>","role":"contributor"}'` — record the office reply's `user_id`: row H-2 raises it to lead with `b4101 PATCH "cde/ma2a-office/members/<user_id>" '{"role":"lead"}'`, after H-3 has run as a contributor. Signing in itself is the founder's step (Standards ▸ Sign in).
- **Scratch copies** (in `%USERPROFILE%\Documents\Sentinel drills`, each a copy on disk of `%USERPROFILE%\Documents\sentinel-scratch\ma1\ma1-src_detached.rvt`, the B35 model **as the drills left it** (review C14): the 24 × 12 m concept layout of eight outline walls, ten partitions and two gap walls per storey, placed from `demo/promote-sample/make-concept.py`'s coordinates — but since B33/B35 the 36 convertible seed walls are SETTLED on BDS types (the outline walls `BDS_EXT_ARC_CMU_200 mm`, the partitions `BDS_INT_ARC_GYPS_100 mm`, 100 mm wide — they were `MA0 Interior - 100mm`, never `Generic - 200mm`), only the four gap walls are still `Generic - 125mm`, and `GR-FFL` also holds about 52 of the template's own walls (B33 MA0-1: 72 walls on GR-FFL; B35-1: 24 retypes, 22 held, 32 office-typed there) while `01-FFL` holds the 20 seed walls alone (B35-1: `01-FFL 18 · 20 · 2 held`). The BDS types are loaded; 38 doors). **`01-FFL` is the clean storey**: the boundary proof and every "every wall" count run there. The file dialog refuses a typed name: copy the file on disk first, then open the copy. Never open aster-tower, Demo, a pilot file or any founder file.
  - `ma2a-promote.rvt` — bound to `ma2a` (Project Setup); rows P-1, P-3, B-1, B-2, B-3, B-4, B-5, H-5.
  - `ma2a-onetype.rvt` — bound to `ma2a`; rows P-2 and P-4, on `01-FFL`. Before P-2: in the `01-FFL` plan select every wall of the storey (drag a window over the whole outline, then Filter ▸ Walls only; the status bar counts 20 — if it counts more, another drill left walls there: record them and their types) and change their type to `Generic - 200mm` in the Type Selector; then draw one more `Generic - 200mm` wall on `01-FFL` well outside the outline (Wall tool, two clicks, about 6 m east of the east wall, 4 m long). Record the 21 walls' ids and types (the read-only `get_current_view_elements`). Before P-4: select the eight `GR-FFL` outline walls (the plan `GR-FFL`, Filter ▸ Walls, then Properties: Top Constraint `Up to level: MA0 Roof`, Top Offset 0) so the shell rises past `01-FFL`; record their ids.
  - `ma2a-ghost.rvt` — bound to `ma2a-ghost`; row G-1. Ghost source folder = `demo/ghost-sample`; Ollama running as in MA1a-S2 (the mapping tiers ask it; with no `layers@n` on `ma2a-ghost` the rows are heuristic — and the TYPE is the guideline's, which is the point).
  - `ma2a-harvest.rvt` — bound to `ma2a`; rows H-1, H-3, H-2 (in that order).
  - `ma2a-orphan.rvt` — bound to `ma2a-orphan`; rows B-3 (d) and H-4.
- **The types the rows depend on.** `BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_CMU_200 mm` and `BDS_INT_ARC_CMU_100 mm` must be loaded in the B35 model (MA1a-I68 recorded "Office template: 79 of 91 office type(s) present"). Check before P-1 with the Type Selector of a wall. If one is missing, make it by hand (Edit Type ▸ Duplicate from the nearest BDS CMU type ▸ rename, set its width) in the scratch copy, and record it: a person created it, Sentinel did not.
- **Record before the first row:** whether the session is signed in; the Phase of the `GR-FFL` plan (`New Construction`); the levels (`GR_SSL` −300, `GR-FFL` 0, `01_SSL` 3000, `01-FFL` 3300, `MA0 Roof` 6300); each storey's wall types as found (an earlier drill's Promote may have retyped some: a settled wall gets no retype, and the row says so). **Wall by wall, before P-1 (review C16):** on the `01-FFL` plan and on the `GR-FFL` plan, the read-only `get_current_view_elements` (Walls) lists each wall's ElementId and type; against `make-concept.py`'s coordinates write the expected reading beside each seed wall — the eight outline walls `Exterior`, the ten partitions and the two gap walls `Interior`, the drawn free wall `unknown` — and on `GR-FFL` list the template's own walls (ids, types) as the barriers they are, with no expected reading. The pass conditions below are judged against this list; a reading that differs is recorded wall by wall.
- **Before each row, record** the last row id of `b4101 GET "cde/ma2a/audit?limit=1"` (or the row's project).
- **Driving notes** (MA1a-I35, MA1a-I68, MA1b): Select by ID stopped answering in the MA1b session (record `:1248`) — verify a retyped wall's type through the read-only Revit MCP (`get_selected_elements` after a click, or `get_current_view_elements` filtered to Walls), not through Select by ID; `get_selected_elements` gives a selected wall's ElementId and UniqueId (B-1 needs a UniqueId). A contextual Modify tab appears only when the ribbon is not on Manage. Do not click in the drawing area with nothing in hand over a CAD import: a stray click picks it and Delete removes it. The Promote dialog's "Sent to a person" is its expanded text; the review window's rows carry the reason as a tooltip.
- **Run the rows in table order.** H-2 (the install of `type_catalog@2` on `ma2a-office`) comes after the last bridge row (B-4), so the pilot's catalogue without `bic` (`type_catalog@1`) drives every P, G and B row — the merge gate's last condition (review C18).

| Row | Steps | Pass when | Record |
|---|---|---|---|
| P-1 The layer-free rules read Promote's settled storey, and name the gap walls' location (UNSURE 1, 2) | On `ma2a-promote.rvt`, `GR-FFL` plan: Sentinel ▸ Promote (DD) ▸ **No** (a read-only run). Read the header and the plan | The header reads `Guideline: guideline@1 · office · …` with `DRAFT rules: install them on a throwaway project only.`, `type_catalog@1 · office · …`, and the office-template line. `GR-FFL` is a settled, mixed storey (review C14): its seed walls are on BDS types the layer-free file produces, so they get no retype row and `DD now` counts them (36 of the 40 seed walls over both storeys); the two gap walls (`Generic - 125mm`) are held `gap: W … (Generic - 125mm, Location Interior) — "BDS_INT_ARC_CMU_125 mm" is not in type_catalog@1 · office · … . Available: BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm.` — `Location Interior` is the boundary's reading of a free-standing corridor wall with the template's walls as barriers too; **no** wall says `inside cannot be told from outside`; the template's own walls' rows (retypes, holds, `Function … but it reads …` holds under C2) are recorded as they come, not judged. Then **Yes** and read the review: a template wall's retype reason reads `DD walls v0: Location …` or `Function …` as the rule used (tooltip). Close the review without applying (P-2 applies) | the header; the `GR-FFL` line; the gap walls' reasons word for word; the template walls' rows as they come; the `DD now` count |
| P-2 A one-type storey types by location; a wall whose location is unknown goes to a person (F2; UNSURE 1) | On `ma2a-onetype.rvt`, `01-FFL` plan (every `01-FFL` wall reset to `Generic - 200mm`, plus the one drawn outside the outline): Promote ▸ **No**, read; then Promote ▸ **Yes**, tick nothing more, Apply. Before Apply record the model's wall-type count (`analyze_model_statistics`, or the Type Selector's list length) | **No:** `01-FFL: 20 retype · … · 1 wall(s) sent to a person`. The held one is the outside wall, with exactly: `every wall on 01-FFL is "Generic - 200mm" — inside cannot be told from outside: its Function tells nothing, and its location is unknown (both sides look out to open plan — a free-standing wall, or the storey's walls do not close around it); a person decides`. **Yes:** the review's 20 retype rows read `… → BDS_EXT_ARC_CMU_200 mm` for the eight outline walls and `… → BDS_INT_ARC_CMU_200 mm` for the ten partitions and the two corridor gap walls (reason `DD walls v0: Location Exterior|Interior, 200 mm → …`), each matching the wall-by-wall list; signed in, the retypes open ticked (a Promote retype with the type the plan saw, from a member); signed out, unticked (tick them). After Apply: `Applied N element(s)`; through the MCP filter an outline wall's type is `BDS_EXT_ARC_CMU_200 mm`, a partition's `BDS_INT_ARC_CMU_200 mm`, the outside wall still `Generic - 200mm`. The wall-type count is unchanged ("equal — no type created", design `:1093`). One Undo entry | the No dialog's `01-FFL` line and the held reason word for word; the 20 types against the list; the Applied count; the type count before and after; the actor on the ledger row (`b4101 GET "cde/ma2a/audit?entity_type=changeset&limit=2"`) |
| P-4 A shell based below the storey is a barrier on it (review C1; E28) | On `ma2a-onetype.rvt`, after P-2 and one Undo (the 20 walls are `Generic - 200mm` again): set the eight `GR-FFL` outline walls' Top Constraint to `MA0 Roof` (set-up); then on the `01-FFL` plan Promote ▸ **No** | `01-FFL: 20 retype · … · 1 wall(s) sent to a person` as in P-2 — the `01-FFL` outline walls still read `Location Exterior` (the shell's faces coincide with theirs: a ray from just beyond the face meets nothing), the partitions and gap walls `Location Interior`, the outside wall unknown. Then, with the shell still raised, select the eight `01-FFL` outline walls and delete them (the shell below now stands for them; the ten partitions, the two gap walls and the drawn wall stay): Promote ▸ **No** reads `01-FFL: 12 retype · … · 1 wall(s) sent to a person` with every partition `Location Interior` — a storey of partitions inside a shell based below it reads inside, none `Exterior` (without C1 every room-closing partition would have read `Location Exterior`). Undo the deletion and the eight walls' top change. Close without applying | the two `01-FFL` lines; one partition's reason in each run |
| P-3 Where the location is unknown on a mixed storey, Function still decides — as MA-0 did | On `ma2a-promote.rvt`, `01-FFL` plan: draw one `Generic - 200mm` wall well outside the outline (about 6 m east, 4 m long). Promote ▸ **No**; read `01-FFL` | The new wall is NOT held and its row (Yes, then look; apply nothing) carries `DD walls v0: Function Exterior, 200 mm → BDS_EXT_ARC_CMU_200 mm` — the type's Function (record what the Type Properties say the Function of `Generic - 200mm` is in this model; if it is Interior, the reason says `Function Interior … → BDS_INT_ARC_GYPS_200 mm` and the row is a gap "not in the catalogue … Available: 50, 100" — record which); an outline wall of `01-FFL` still reads `Location Exterior`. Close without applying. Undo the drawn wall | the two reasons; the type's Function |
| G-1 Ghost Builder on a drawing: the layer rule where one exists, the layer-free rule where none does, a gap where neither (F10; UNSURE 5) | On `ma2a-ghost.rvt`, `GR-FFL` plan: Zoom to Fit; the ground around x 60000–70000, y 57000–67000 (mm) is clear (the B35 model lies within 0–24000; look with `get_current_view_elements`). Sentinel ▸ Ghost Builder; in its drawing pick window choose `sample-walls-ma2a.dxf` (the source folder `demo/ghost-sample` lists it; Ghost imports it itself — no Insert ▸ Import CAD, review C15). In the review **pick no type by hand** — leave each row's type as proposed; tick `A-WALL-EXT` and `A-WALL-INT`; build level `GR-FFL`; Build. The model's `GR-FFL` walls (0–24000) are barriers under C1 but lie 36 m from the drawing: they change no reading | The review lists `A-WALL-EXT` with `4 element(s)` and `A-WALL-INT` with `3 element(s)` (the faces are paired: 14 lines, 7 walls). The summary: `Placed: 6`; one wall skipped: `Wall on 'A-WALL-INT': gap: 100 mm wall on 'A-WALL-INT' — the guideline names no wall type for it (type_catalog: type_catalog@1 · office · …); skipped.` (the outside free wall: no layer rule for A-WALL-INT, and both its sides open); the line `outer boundary: 4 outside · 2 inside · 1 unknown (this build's drawn walls; …)`; `6 typed by the guideline` in the walls line. Select by id (the changeset's `result.applied`): the four `A-WALL-EXT` walls are `BDS_EXT_ARC_CMU_200 mm` (the layer rule, listed first — whatever the boundary read), the partition and the inside free wall `BDS_INT_ARC_CMU_100 mm` (the Location rule). `b4101 GET changesets/ma2a-ghost/<id>`: each wall's `provenance.rule` names the guideline. If a `CreatedTypes` line appears (`BDS_INT_ARC_CMU_100 mm` was not loaded and Ghost cloned a sibling), record it: master's path (S5), not this plan's. One Undo removes the build | the review's rows; the summary word for word; the six types; the gap's sentence; whether a type was cloned |
| B-1 A contract-2 post without `place.TypeName` is typed by the bridge: 201, the stored type, the reason (UNSURE 8, 11) | On `ma2a-promote.rvt` select one seed partition of `GR-FFL` as it is (`BDS_INT_ARC_GYPS_100 mm`, 100 mm wide — review C14) and read its UniqueId (`get_selected_elements`). Save body B-1 below with that UniqueId in the session's scratch folder (never in the repository). `b4101 POST changesets/ma2a @<file>`; time it | 201. `elements[0].place.TypeName` is `BDS_EXT_ARC_CMU_200 mm`; `elements[0].typing` is `typed_by: "bridge"`, `type`, `family: "Basic Wall"`, `matched: ["param:Location"]`, `input: {category: "Walls", params: {Location: "Exterior"}, thicknessMm: 200}`, `rule` beginning `DD (MA-2a): an outside wall`, `guideline: "guideline@1 · office · <sha12>…"`, `catalog: "type_catalog@1 · office · <sha12>…"` and both shas; `elements[1].place.TypeName` is `BDS_INT_ARC_CMU_100 mm` (the facts say 100 mm: the partition's own width), its typing `typed_by: "bridge"`, `matched: ["param:Location"]`; both `pretick: false`, both `accuracy.status: not_measured`; `claimed: true`; `ignored` is exactly `[{field: "source.job_id", …}]`; `elements[0].facts` is kept as posted. `b4101 GET "cde/ma2a/audit?limit=1"`: the `changeset_proposed` row's `new_value.typed` is 2. Under one second (record it) | the reply's two `typing` blocks; the audit row; the time |
| B-2 The bridge-typed changeset is applied in Revit as the chosen type; the review names who typed it (UNSURE 9) | Review AI Proposals on `ma2a-promote.rvt`: open B-1's changeset. Record the model's wall-type count first | Both rows carry `  ·  typed by the bridge from the facts posted (guideline@1 · office · …)` after `not measured`; both open unticked (a create never; a bridge-typed retype never). Tick both ▸ Apply: `Applied 2 element(s)`. Through the MCP filter: the new wall is `BDS_EXT_ARC_CMU_200 mm` on `GR-FFL` rising to `01-FFL`; the partition is now `BDS_INT_ARC_CMU_100 mm` — the same width, so its faces did not move (`Unsafe`, C3, let it through). The wall-type count is unchanged ("equal — no type created", design `:1093`). One Undo entry; `b4101 GET changesets/ma2a/<id>` reads `applied` | the two rows' text; the two types; the type count before and after; the status |
| B-5 A claimed thickness that would move a face is refused at Apply, in words (review C3; E30) | Post body B-5 (B-1's retype alone, `thickness_mm: 200` for the same 100 mm partition — a wrong claim; after B-2's Undo the partition is `BDS_INT_ARC_GYPS_100 mm` again) to `changesets/ma2a`; Review AI Proposals ▸ open it ▸ tick ▸ Apply | The post is 201 with `place.TypeName` `BDS_INT_ARC_CMU_200 mm` (the bridge cannot see the wall: it types the claim, unticked). Apply is refused, nothing changes in the model, and the message reads `"BDS_INT_ARC_CMU_200 mm" is 200 mm thick, wall <UniqueId> is 100 mm — a retype would move a face; a person decides`; the partition is still `BDS_INT_ARC_GYPS_100 mm` (MCP filter); `b4101 GET changesets/ma2a/<id>` shows the failure. Withdraw it: `b4101 POST changesets/ma2a/<id>/withdraw '{}'` | the refusal word for word; the partition's type; the changeset status |
| B-3 A post the bridge cannot type is a 400 that names what is missing; nothing is stored | Save bodies B-3 (a)–(e) below; post (a)–(c) and (e) to `changesets/ma2a`, (d) to `changesets/ma2a-orphan`. Count `b4101 GET changesets/ma2a` before and after | (a) 400 `elements[0]: a wall without place.TypeName is typed by the bridge from the project's guideline and type catalogue — no rule of guideline@1 · office · … matches a wall with Material Stone, 200 mm; send place.TypeName, or add a layer-free rule for it`. (b) 400 `… "BDS_INT_ARC_CMU_125 mm" (the rule of guideline@1 · office · … for Location Interior, 125 mm) is not in type_catalog@1 · office · … — the catalogue has BDS_INT_ARC_CMU_100 mm, BDS_INT_ARC_CMU_150 mm, BDS_INT_ARC_CMU_200 mm, BDS_INT_ARC_CMU_300 mm; send place.TypeName, or pick one of those`. (c) 400 `… the rule of guideline@1 · office · … for Location Exterior names its type with {thickness} and no thickness was sent; send place.TypeName, or send facts.thickness_mm`. (d) 400 `… no guideline is installed for this project or its office (none — not installed for ma2a-orphan or its office): not checkable; send place.TypeName, or install guideline@n`. (e) — the design's body as written, `measured` and no `facts` — 400 `… no rule of … matches a wall with no facts; …`. The changeset count is unchanged | the five replies word for word; the counts |
| B-4 The trust rules stay: a posted `typing` and `pretick` are ignored and listed; the bridge's own typing stands | Post body B-4 (B-1's typed wall with `typing: {typed_by: "me"}` and `pretick: true` on it) | 201; `ignored` lists `elements[0].pretick` and `elements[0].typing` as `ignored: set by the bridge`; the stored `typing.typed_by` is `bridge`; `pretick` false. Withdraw it: `b4101 POST changesets/ma2a/<id>/withdraw '{}'` | the `ignored` list; the typing |
| H-1 Build Office System's harvest writes Function, Material and the BuiltInCategory into the rows (UNSURE 3, 4, 7) | On `ma2a-harvest.rvt`: Sentinel ▸ Build Office System. Read the export dialog; open the export file it names (`%AppData%\Sentinel\exports\type-catalog-<title>.json`) with a node one-liner from `WebApp`: `node -e 'const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).types; const w = t.filter(x => x.category === "Walls" && x.family === "Basic Wall"); console.log("walls", w.length, "with Function", w.filter(x => x.params.Function).length, "with Material", w.filter(x => x.params.Material).length, "with bic", w.filter(x => x.bic === "OST_Walls").length); console.log("doors with Function", t.filter(x => x.category === "Doors" && x.params.Function).length, "rows with bic", t.filter(x => x.bic).length, "of", t.length, "category_local", t.filter(x => x.category_local).length); console.log(JSON.stringify(w.find(x => x.type === "Generic - 200mm")))' "<the export path>"` | The dialog ends `A lead installs it from the review window too: Install catalogue on office (MA-2a, BOS-3) — no command line.` Every Basic Wall row has `params.Function` (`Exterior` or `Interior` — the enum name, matching the type's Function in Type Properties: check `Generic - 200mm` and `MA0 Interior - 100mm` by hand) and `bic: "OST_Walls"`; the walls with a build-up have `params.Material` (record `Generic - 200mm`'s: expected the layer's material name, e.g. `Default Wall`); door rows have `params.Function` (`Interior`/`Exterior`); rows with `bic` ≥ the rows of known categories (every built-in category has one — `Stairs` and `Railings` rows carry `OST_Stairs` / `OST_StairsRailing`, review C8); `category_local` on 0 rows (English Revit). A row whose category is a subcategory, an import or a custom category (the model's ImportInstance type rows, or any row whose `category` is not a Revit built-in name — list them with `node -e 'const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).types; console.log([...new Set(t.filter(x => !x.bic).map(x => x.category))])' "<the export path>"`) has no `bic`; if the model has none such, record "none in this model" and the ceiling stays pinned offline | the counts; the `Generic - 200mm` row; one door row; the no-`bic` categories |
| H-3 A contributor is refused Install on office with the role sentence (signed in; else **owed**) | Signed in as a contributor of `ma2a-office` (set-up): in the same review window click **Install catalogue on office** | The status runs `Reading this model's project…` → `Asking Sentinel which office ma2a belongs to…` → `Catalogue NOT installed: HTTP 403: this action requires the lead role (you are contributor)`. `b4101 GET cde/ma2a-office/artefacts/type_catalog` still answers `version 1`. Signed out: the row is **owed** (the machine credential installs as `service`) | the status line; the version |
| H-2 Install on office from Revit (BOS-3) lands type_catalog@2 on the scratch office, and GET answers the same sha (UNSURE 6, 10) | Raise the account to lead: `b4101 PATCH "cde/ma2a-office/members/<user_id>" '{"role":"lead"}'` (signed out: skip; the machine credential installs). Click **Install catalogue on office** again | The status ends `type_catalog@2 · office · <sha12>…: installed on ma2a-office — <N> types from <title>. Ghost Builder, Promote and the bridge read it from here on; GET /cde/ma2a-office/artefacts/type_catalog answers the same sha.` `b4101 GET cde/ma2a-office/artefacts/type_catalog`: `version 2`, `sha256` beginning with the window's twelve characters, `body.types` with `bic` and `params.Function` as H-1 read them, `body.template.title` the model's title. `b4101 GET "cde/ma2a-office/audit?limit=1"`: `artefact_installed type_catalog@2`, `actor` the signed-in e-mail (signed out: the machine's label), `new_value.source` `{tool: "revit-build", document: "<title>"}`. No new artefact on `ma2a` itself (`b4101 GET cde/ma2a/artefacts` shows no own `type_catalog`) | the status line; the GET's version and sha; the audit row |
| H-4 A project with no office is refused: nothing is installed on it | On `ma2a-orphan.rvt` (bound to `ma2a-orphan`): Build Office System ▸ **Install catalogue on office** | `Catalogue NOT installed: project ma2a-orphan belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)`. `b4101 GET cde/ma2a-orphan/artefacts/type_catalog` is a 404 `not_installed` | the status line; the 404 |
| H-5 The add-in reads what Revit installed | On `ma2a-promote.rvt`: Promote ▸ **No** | The header now reads `type_catalog@2 · office · <sha12>…` (H-2's sha) and the office-template line counts against the B35 model's own harvest (expected every type present). Nothing else changes in the plan | the header's two lines |
| R-1 The parity check passes on the branch's HEAD | From the repo root: `dotnet run --project tools/promote-check`; from `WebApp`: `npx vitest run src/sentinel-core/guideline bridge/sentinel-core-bundle.test.mjs bridge/changesets-typing.test.mjs` | `548/548 checks pass` with the lines `the C# matcher gives the TS resolver's answer on every shared case (29/29)` and `…every shared layer-free case (17/17)`; vitest `6 files`, `48 passed` (43 + the typer's 5). The bundle test passes on the committed bundle | the two lines; the vitest total |

Bodies (saved as files in the session's scratch folder, never in the repository). B-1 — the design's example body with this model's values: the wall is 90 m north of the outline (B1-13's clear ground), on `GR-FFL` rising to `01-FFL`; the retype names the partition selected in the row:

```json
{ "name": "MA2a — a wall typed by the bridge, and a retype", "contract": 2,
  "source": { "reader": "sentinel-survey 0.1", "job_id": "job-0042" },
  "elements": [
    { "op": "create", "kind": "wall", "cid": "scan-GR-wall-88",
      "place": { "LocationCurve": { "start": [40000, 90000, 0], "end": [48420, 90000, 0] }, "BaseLevel": "GR-FFL", "TopLevel": "01-FFL" },
      "facts": { "thickness_mm": 200, "params": { "Location": "Exterior" } },
      "evidence": ["ev-0001#slice-GR", "ev-0003#p1-r12"],
      "reason": "scan wall GR #88",
      "validate": { "identity": { "Class": "IfcWall", "Name": "MA2a wall 88" } } },
    { "op": "retype", "kind": "wall",
      "target": { "unique_id": "<the partition's UniqueId>" },
      "facts": { "thickness_mm": 100, "params": { "Location": "Interior", "Function": "Interior" } },
      "reason": "DD: an inside concept partition needs an office type",
      "validate": { "identity": { "Class": "IfcWall", "Name": "MA2a partition" } } } ] }
```

B-3 (a)–(e): each is B-1's first element alone (the create), with its `facts` changed — (a) `{ "thickness_mm": 200, "params": { "Material": "Stone" } }`; (b) `{ "thickness_mm": 125, "params": { "Location": "Interior" } }`; (c) `{ "params": { "Location": "Exterior" } }`; (d) B-1's first element as it is, posted to `changesets/ma2a-orphan`; (e) the design's element as written: no `facts`, `"measured": { "thickness_mm": 203, "height_mm": 3050 }` in its place. B-4: B-1's first element with `"typing": { "typed_by": "me" }` and `"pretick": true` added to it. B-5: B-1's second element alone (the retype, the same UniqueId) with `"thickness_mm": 200` — a claim the wall does not bear.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as session MA2a, with gaps named F-MA2a-n, each fixed on the branch, and the list of **owed** rows at its end. Then:
- close Revit without saving the scratch copies;
- return the sign-in to the state found before the drill: if the PC was signed out then and was signed in for the drill, the founder signs out (Standards ▸ Sign out); if it was signed in then, it stays signed in;
- stop the test bridge on 4101;
- restore the add-in's bridge settings by copying `bcf-config.json.ma2abak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only) and delete the backup;
- say which add-in build is deployed in Revit 2024: the branch's, when the merge follows at once; master's again (`git checkout master`, the same `dotnet build`) when the drill failed or the merge waits;
- list what the drill left on the shared ledger: the scratch office `ma2a-office` with `guideline@1`, `type_catalog@1` and `type_catalog@2` (Revit's install), the projects `ma2a`, `ma2a-ghost` (with its own `guideline@1`) and `ma2a-orphan`, any membership added for the sign-in (and its role change), and the changesets, reports and audit rows of each row — left in place on purpose (scratch keys; nothing real was touched), as the earlier drills' scratch projects were;
- list what the drill left on this PC, outside the repository: the `ma2a`, `ma2a-ghost` and `ma2a-orphan` folders under `%AppData%\Sentinel\cache`, the export file `%AppData%\Sentinel\exports\type-catalog-<title>.json` (H-1), the five scratch copies in `Documents\Sentinel drills`, and the body files in the session's scratch folder — the cache folders and the body files are deleted (they hold scratch keys and the partition's UniqueId only); the export file and the scratch copies stay, named, as the drill's evidence.

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record;
- each F-MA2a-n fix is committed on the branch, and Task 8 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does — the boundary's reading, the planner, the harvest, the install — was deployed and its row run again live before the merge. A row whose fix was not run again is recorded as **owed**, not as passed;
- UNSURE 1 and 5 held (the `01-FFL` seed walls read inside and outside as the wall-by-wall list says — P-2 and P-4 on the clean storey; `GR-FFL`'s readings are recorded, with the template's walls as barriers, not judged; Ghost pairs the drawn faces). If the boundary misreads the `01-FFL` outline, `WallLocation` goes back to planning and nothing is merged;
- the pilot's catalogue without `bic` (type_catalog@1 on the scratch office) drove every P, G and B row — every row before H-2, in table order — as it did before this plan.

```bash
git checkout master
git merge --no-ff feature/ma2a-layer-free-rules -F - <<'EOF'
Merge feature/ma2a-layer-free-rules: MA-2a - rules without a layer: a guideline rule may match on Function, Location (inside or outside, read from the storey's own walls - one side open is outside, both enclosed inside, anything else unknown and a named reason to a person) and Material in when.params, spelled the same in TS and C# and pinned by one shared fixture; Promote passes them (a one-type storey types by location; an unknown location is held; a Function that disagrees with the reading is held; every wall crossing the storey's plane is a barrier), Ghost Builder passes the location of this build's walls with the model's walls at the build level as barriers (a rule stating more conditions is tried first, then the lead's order), the executor refuses a wall retype that would move a face, and the bridge types a changeset element posted without place.TypeName from the facts it sends (full contract 2: typing says who typed it, a bridge-typed element is never pre-ticked, a post it cannot type is a 400 that names what is missing, measured stays ignored). The wider harvest: Build Office System keeps each type's Function by its enum name, its Material, the matrix's type parameters and its BuiltInCategory beside the category (BOS-5; a type_catalog@1 reads as before), and a lead installs the catalogue on the office from the review window (BOS-3) off the API thread with the bridge's role check. The bridge bundle is rebuilt and a test now fails on a stale one (the bundle had carried a 4D parser drift since 50f49ba). Drill MA2a recorded. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment note:** the bridge first, then the add-in. An old bridge answers a post with `facts` and no `TypeName` with the 400 it always gave (`needs place.TypeName`) and lists `facts` as ignored — honest, nothing stored; a new bridge with an old add-in stores `typing` and `facts` that the old add-in's DTO does not read — also fine. Restarting the founder's bridge (`tools/bridge-start.cmd`) is the founder's step; the rebuilt bundle changes one more thing on that bridge — the 4D programme-CSV import now refuses bad rows per row, as its TS source has said since `50f49ba` (the committed bundle had not been rebuilt): named in the merge message, not drilled here. The add-in is deployed to each Revit version by its own build (`-p:RevitVersion=…`, without `DeployToRevit=false`), with Revit closed.

## UNSURE facts this drill settles

1. Do the B35 model's `01-FFL` seed walls read inside and outside from the outer boundary as the wall-by-wall list says (eight outline walls Exterior, ten partitions and two corridor gap walls Interior, the drawn free wall unknown) — the model's walls were placed from `make-concept.py`'s coordinates, with their corners meeting at the centrelines? (P-2, P-4; `01-FFL` holds the seed walls alone — `GR-FFL`'s 52 template walls are barriers whose readings are recorded, not judged.) Everything in `WallLocation` rests on it.
2. Are `BDS_EXT_ARC_CMU_200 mm`, `BDS_INT_ARC_CMU_200 mm` and `BDS_INT_ARC_CMU_100 mm` loaded in the B35 model? (P-1; the set-up says what to do if not.)
3. Does a type's `FUNCTION_PARAM` come out as the Integer whose value `TypeHarvest.FunctionName` names — a wall type whose Type Properties say Exterior writing `"Function": "Exterior"` — and does a door symbol give one too? (H-1.) The table is the API's documented values; this is the live read.
4. Does `(BuiltInCategory)(int)Category.Id.IdValue()` name `OST_Walls` and the other known categories for every harvested type on Revit 2024, and do subcategories and imports come out with no `bic`? (H-1.)
5. Does Ghost Builder pair each drawn wall's two faces into one wall with its measured thickness (4 on `A-WALL-EXT`, 3 on `A-WALL-INT`), so the guideline — not the mapping — types them? (G-1.)
6. Does `GET /cde/projects/:key/scope` answer the add-in's bearer for a signed-in member of the project (D7: a member of the project or of its office) and for the machine token; and does the office's lead check pass the lead and refuse the contributor in the sentence? (H-2, H-3.)
7. What are the B35 wall types' build-up material names — does `Generic - 200mm` carry a `Material` label at all, and does any BDS type's label hold a word a rule could key on (`Gypsum`, `Stone`)? (H-1.) It decides whether a Material rule can drive the pilot's template or a lead names other words.
8. Does the executor accept a bridge-typed retype whose `type_before` is null and whose target has the wall's own width, and change the partition's type (B-2) — and refuse one whose claimed thickness is not the wall's, with the `Unsafe` sentence (B-5)? For a wall that width is the only check at Apply besides the type being loaded (C3).
9. Does the review row's text with `typed by the bridge from the facts posted (…)` fit the row? (B-2.)
10. Does the add-in's install body's `source {tool, document}` land in the pointer's `source`, as the ruleset install's does? (H-2.)
11. How long is a typed post on 4101 — two artefact reads and a 1,434-row catalogue scan per untyped element? (B-1.) Only a run measures it.
12. Do Revit 2026 and 2027 run the same harvest reads? Only a run settles it (owed).

## Risks

- **The boundary is a reading with named ceilings (F1).** A wall facing a closed inner courtyard reads inside: on a one-type storey (Function dropped) it is retyped as an internal wall; on a mixed storey its Function Exterior disagrees and it is held (C2). A storey whose outline walls stop short (GHB-6's broken walls) lets a line out and reads its partitions "both sides open" — unknown, to a person. Each is a reading said in words, not a right answer; the ceiling is in the code's words and in E3.
- **A one-type storey drops Function (F2).** A storey of walls that truly are all one exterior type (a single-skin shed) is typed by location — which is right. A storey whose outline does not close is held wall by wall with the location's reason, where MA-0 held it with one sentence: more rows to a person, each saying why.
- **The bridge types a retype from a claim (F3).** A poster who says a wall is Interior and 100 mm gets an Interior 100 mm type proposed for it. At Apply the executor refuses a type the model lacks and (C3, E30) a wall type whose width is not the wall's — a claimed thickness that would move a face; nothing else about a wall is checked (`type_before` is null on a bridge-typed retype). The row opens unticked, but a person who ticks a same-width wrong claim without reading applies it.
- **A Material rule matches words, not materials (F9).** `Material: CMU` matches nothing in `Concrete Masonry Units`; a lead writes the template's own words. The drill reads what the template's words are (UNSURE 7).
- **The rebuilt bundle carries a drift this plan did not make.** The 4D programme-CSV parser on the bridge changes to its TS source's behaviour (refusals per row) with the first bridge restart after the merge; it is tested TS, but it was never live. Named in the merge message and the deployment note; not drilled.
- **An empty `when` is now refused at install (S4).** A guideline someone re-installs with such a rule is refused with the reason; the pilot's files have none. The add-in still reads one already installed.
- **The MA-0 Function-only file's wording changes on `ma0-bds`.** Its one-type holds now read "…has no rule for Location Exterior" — the same hold, more words. A reader of the old record sees the new phrase.
- **Promote passes Function on a mixed storey, and holds where the boundary reads the other way (C2).** A template whose Functions are wrong (B33's F2: `BDS_INT_ARC_GYPS_100 mm` is Function Exterior in the BDS template) sends more rows to a person than MA-0 did — each saying "Function Exterior but it reads inside …" — where MA-0 printed a template note and proposed. Where Function and Location agree, the Location rule listed first decides as before.
- **A typed post scans the catalogue once per untyped element.** 200 elements × 1,434 rows is cheap; a 20,000-row catalogue × 200 is 4 million string compares — still under a second in Node, not measured (UNSURE 11 measures the pilot's size).
- **BOS-3 with the machine credential installs as `service`.** Anyone holding the token installs, as the CLI already lets them; the signed-in path is the one with a lead check. The drill records the actor.
- **The German harvest is proven offline only.** The key derivation (`CategoryKeyOf`) and the bic comparison are pinned by rows and scans; no non-English Revit is on this PC.
- **Ghost's clone path is unchanged (S5).** A layer-free rule can name a size the model lacks; Ghost then clones a catalogue sibling as it did for a layer rule. The invariant "no type is created" is about what this plan adds; G-1 records whether the path ran.
- **`facts` rides on any create.** A poster may send `facts` beside a `TypeName`; they are kept as a record and type nothing. A reader could take them for a measurement: they are the poster's words, and `accuracy` still says `not_measured`.

## Next (out of scope here)

- The rest of MA-2: `lod_matrix`'s `stage_map` and `type_snap_mm` with `tools/lod-check`; the LOD state reader and its line in the pane, the Next strip and the web; `matrixToIds`; the Promote plan with `set_parameter`; type-gap groups in the Holding Area; one Undo per storey; DAT-3, ANV-1, ANV-2; gate G2.
- A lead's layer-free rules in the office guideline itself (`bds-guideline.json` still keys every rule on a layer), and Material rules in the words the BDS template uses (UNSURE 7).
- Bridge typing of doors and windows by `Size` and `HostFunction` facts (the DD elements file's rules), and the MCP tool sending `facts` (today it forwards elements as given).
- A closed inner courtyard read right (a ray that counts the walls it crosses), and the boundary over walls drawn in pieces once GHB-6 joins them.
- Floors, roofs and ceilings read through the boundary (a slab's location is its storey's, not inside or outside).
- A non-English Revit run of the harvest and of Ghost typing (BOS-5's proof line).
- Promote and Ghost on Revit 2026 and 2027, live.
- The 4D programme-CSV import, live on the rebuilt bundle.
