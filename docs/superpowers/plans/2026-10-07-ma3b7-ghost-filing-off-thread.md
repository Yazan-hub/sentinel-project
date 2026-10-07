# MA-3b7 — Ghost Builder files and withdraws off Revit's thread: a dry run proves the types and plans, the filing runs on a pool thread, the build places in a second event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3b5 plan's "Next ▸ Ghost Builder's filing and `Abandon`'s withdrawals off the thread" (`docs/superpowers/plans/2026-10-05-ma3b5-promote-no-wait.md` ▸ Next; XC-3 "network off Revit's UI thread, everywhere", `docs/strategy/2026-09-30-revit-addin-audit.md:1027`), as one slice: Ghost Builder's `Run` (`SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`) today files its changesets (`ChangesetClient.Propose`, up to 120 s each) and withdraws them (`Abandon`, `ChangesetClient.Withdraw`) **on Revit's thread inside the open TransactionGroup** — Revit is frozen for the whole filing. After this slice: **event A** (Revit's thread) proves the types and plans the build inside a TransactionGroup it then **rolls back** (a dry run: nothing is left in the model), and hands the bodies to a **pool thread** that files them; **event B** (Revit's thread, in the model the build started from — DocPin) redoes the types step inside the build's one TransactionGroup, runs the executor, writes the parameters, asks the BLOCK check and assimilates **one Undo entry, as today**. Every withdrawal (a filing that failed, a model switched or closed, a placement Revit refused) runs on a pool thread and is said in the pane's Doctor log and in the dialog. Nothing a person sees changes except that Revit answers during the filing, and the words that say so.

**Why this shape (binding):** the plan needs the types (the loaded families' symbols, the cloned wall types) — so the types step must run before the filing; a TransactionGroup cannot outlive its ExternalEvent call and a filing must not hold one open; and the build must stay **one Undo entry** (the undo watcher posts `changeset_reverted` under its name). So the types step runs twice: once in A (proved, then rolled back with the group — founder decision F4's intent, "the types before anything is filed", kept), once in B (kept, inside the build's group). It is deterministic (the preloader, the provisioners, the typer's clones), so B's types are A's.

**Architecture:** `GhostChangesetBuild` gains a `Prepared` class (what A learned: the level, the rows' mapping, the paired elements, the `Planned` list in filing order, the chunks and their bodies, the report so far with A's warnings, type gaps and `CreatedTypes`, the `bound` flag and the key) and three entry points: `Prepare(app, r) → Prepared` (A: today's checks, step 1, step 2, the placement resolve, the chunks; its own group started and **always** rolled back before it returns — a refusal fills `Prepared.Report.NotBuilt` and B never runs), `File(prepared) → Filed` (pool: today's step 3 loop; a failure withdraws what was filed, on the same thread, and returns the `NotFiled` words), and `Place(app, doc, prepared, filed) → PlacementReport` (B: a new group, step 1 again with the report lines **not** collected a second time, steps 4–7 as today). `GhostBuilderPlacementEvent.Execute` becomes the controller: A, then `Task.Run(File)`, then `App.Events.Enqueue(doc, "place the Ghost Builder build", (u, d) => Completed(Place(u, d, prep, filed)), why => …)`; `Completed` fires from B, or from the pool thread when the filing failed or DocPin refused (the command's handler already marshals through `review.Dispatcher.Invoke`).

**Tech Stack:** C# add-in (net48 2021–2024 / net8 2025–2026 / net10 2027), `tools/promote-check` (`Ok(cond, words)` pins, source scans with `Src(...)`, `Contains`, `At`, `Count`).

**Base:** `feature/ma3b7-ghost-filing-off-thread` at master `b014377` (MA-3b6 merged). Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `b014377`.

## Global Constraints

- House style: every refusal is a sentence in words; comments name the slice ("MA-3b7") and the reason; words are pinned in `tools/promote-check`. No new dependency. No bridge, web or migration change.
- Commit messages: `feat(revit): MA-3b7 - …`, each with a blank line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit only on `feature/ma3b7-ghost-filing-off-thread`.
- Every add-in build carries `-p:DeployToRevit=false`: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Warning\(s\)|Error\(s\)"` (0 errors; 5 warnings on master for 2024).
- `tools/promote-check`: `dotnet run --project tools/promote-check 2>&1 | tail -3` ends `promote-check: N/N checks pass` (master: 827). Existing pins that scan `GhostChangesetBuild.cs` by exact text (`Ma2aWiring.cs:16-27`, `Ma1bWiring.cs:50`, `Ma3aReview.cs:69-82`, `Ma3b4Ghost.cs:10-35`, `Filing.cs:135`) must keep passing: keep those source lines byte for byte where they move (they may move into another method; `At(...)` order pins within one file still hold if the relative order is kept — read each pin before moving code). A pin that genuinely cannot hold (a line the slice deletes on purpose) is updated with a one-line comment saying why — list each in the report.
- Never print a token or an e-mail. Never run Revit.

---

### Task 1 — `GhostChangesetBuild`: `Prepare` (the dry run), `File` (the pool thread) and `Place` (the build)

**Files:**
- Modify: `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (`Run` `:76-700`; `Planned` `:66-71`; the file header `:1-32`)
- Modify: `SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs` (`Execute` `:28-43`)
- Modify: `SentinelAddin/GhostBuilder/GhostFailurePolicy.cs` (new words beside `NotFiledLine` `:145`)
- Read first: `SentinelAddin/Commands.GhostBuilder.cs:262-330` (the `BuildRequested` handler and `placementEvent.Completed` handler — unchanged by this task, but `Completed` may now fire from a pool thread: confirm its handler only touches `review.Dispatcher.Invoke(...)`, and that `Release()` is thread-safe; if not, marshal `Completed` through `App.Events.Enqueue(_ => …)`), `SentinelAddin/RevitEventHub.cs:65` (`Enqueue(Document doc, string what, Action<UIApplication, Document> job, Action<string> onRefused)`), `SentinelAddin/Commands.PromoteWalls.cs:60-66` and `:230-300` (MA-3b5's hop and filing on a pool thread — the pattern), `SentinelAddin/Engine/UnreportedResults.cs:287` (`WithdrawEach`), `SentinelAddin/GhostBuilder/GhostFiling.cs:175-200` (`Chunks`, `Name`, `Body`, `Local`, `LostRotation`).

**Interfaces (produces):**
```csharp
public sealed class Prepared
{
    public Request R; public Document Doc; public Level Level; public double LevelMm;
    public MappingResult Mapping; public List<GhostElement> Elements;          // paired, as Run has them
    public List<Planned> Plan; public List<List<ChangesetElementDto>> Chunks;   // Planned is made public (or internal) for this
    public List<object> Bodies;                                                 // GhostFiling.Body(name, actor, chunk) per chunk, or null when !Bound
    public List<string> Names;                                                  // GhostFiling.Name(...) per chunk
    public bool Bound; public BcfConfig Cfg; public GhostPlacementEngine.PlacementReport Report; // A's warnings, gaps, CreatedTypes
    public bool Refused => Report.NotBuilt != null;                              // A refused: B never runs
}
public sealed class Filed { public List<ChangesetDto> Changesets; public string NotFiled; public string Ledger; } // NotFiled null = all filed
public static Prepared Prepare(UIApplication app, Request r);
public static Filed File(Prepared p);                                           // pool thread; never throws (a throw is a NotFiled line)
public static GhostPlacementEngine.PlacementReport Place(UIApplication app, Document doc, Prepared p, Filed filed); // Revit's thread, DocPin's model
public static GhostPlacementEngine.PlacementReport NotPlaced(Prepared p, Filed filed, string why);                 // DocPin refused the build
```

- [ ] **Step 1: `Prepare`.** Move `Run`'s code from its start to the end of step 3's preparation into `Prepare`: the checks (`DocPin.Check`, `DesignOptionRefusal`, rows, levels, level), `mapping`, `byLayer`, `elements`, `bound`/`cfg`, the group `Ghost Builder` started with `IsFailureHandlingForcedModal = false`, **step 1** (types — as today, lines `:177-294`, the report lines collected), **step 2** (the plan, `:296-519`), the `plan.Count == 0` refusal, the placement resolve (`:521-523`; keep `placing` out of `Prepared` — B resolves it again on its own view), then `Chunks`, `Names` and `Bodies`. `blockBefore` is **not** read here (it is B's: the model's BLOCK rows just before the build). `Prepare`'s local `Abandon(line)` is: `SentinelUndo.RollBack(group, doc); p.Report.NotBuilt = line; return p;` (nothing was filed yet — no withdrawals). **Every path out of `Prepare` rolls the group back** (the success path too: `SentinelUndo.RollBack(group, doc)` after the chunks are built — the dry run leaves nothing), so the types' `CreatedTypes` lines in `p.Report` describe what B will create. Add one comment line above the group: `// MA-3b7: a dry run — the types proved and the build planned inside a group that is rolled back before the filing (a group cannot wait for the bridge); event B creates the types again, inside the build's own Undo.` The `catch (Exception ex) when (!done)` becomes `Prepare`'s `catch (Exception ex)` → `Abandon(GhostFailurePolicy.NotBuiltLine($"{ex.GetType().Name}: {ex.Message}"))`.

- [ ] **Step 2: `File`.** Today's step 3 loop (`:526-548`) on `p.Bodies`/`p.Chunks`/`p.Names`, verbatim in behaviour: `!p.Bound` → `GhostFiling.Local(name, chunk)` per chunk, no network; else `ChangesetClient.Propose(p.Cfg, p.R.Key, p.Bodies[c], out err)`; a reply with another element count, a `LostRotation`, or a null reply ends the loop with today's words (`GhostFailurePolicy.NotFiledLine(...)` with the sign-in and `maybeFiled` clauses) and **withdraws what was filed on this thread**: `UnreportedResults.WithdrawEach(filed.Select(f => (f.Id, Short(f.Id))), id => ChangesetClient.Withdraw(p.Cfg, p.R.Key, id, out var why) ? null : why ?? "no answer")` → its text goes into `Filed.Ledger` as `"Ledger: the N changeset(s) already filed were withdrawn."` when every one was, else `UnreportedResults.WithdrawnInstead`'s words (it names those still proposed). `File` never throws: wrap in `try/catch` → `NotFiled = GhostFailurePolicy.NotFiledLine($"{ex.GetType().Name}: {ex.Message}")` plus the same withdrawals.

- [ ] **Step 3: `Place`.** DocPin is the hub's (the `Enqueue(doc, …)` overload refuses before the job runs). Inside `Place`: `blockBefore = BlockCheck.Before(doc, out blockNote)`, a new `TransactionGroup(doc, "Ghost Builder")` with `IsFailureHandlingForcedModal = false`, `typesBefore` and `wallsBefore` read now, **step 1 again** — factor step 1 into `private static (ElementPlacementFactory Typer, List<(GhostElement El, LayerMapping Map, string Type, string TypedBy)> Walls, string RolledBack) TypesStep(Document doc, Request r, MappingResult mapping, List<GhostElement> elements, Dictionary<string, LayerMapping> byLayer, Level level, GhostPlacementEngine.PlacementReport report)` used by both `Prepare` and `Place`; `Place` passes a **throwaway** report (`new GhostPlacementEngine.PlacementReport()`) so A's warnings, gaps and `CreatedTypes` are not written twice, and copies only that report's `RevitWarnings` counts into the real one (`Count`). A `RolledBack` answer (the types transaction did not commit) → `Abandon(...)` with today's words. Then `placing = PlacementApply.Resolve(doc, p.R.Guideline?.Placement, app.ActiveUIDocument?.ActiveView, p.Plan.Select(x => x.Dto.Kind), out noWorkset)` (null → `Abandon`), `planOf` from `filed.Changesets` and `p.Chunks` as today (`:549-558`), `facts`, then **steps 4, 5, 5b, 6 and 7 verbatim** (`:561-690`) on `p.Report` (the report A filled, continued). `Place`'s `Abandon(line)`: `SentinelUndo.RollBack(group, doc); report.NotBuilt = line;` and the withdrawals **off this thread** when `p.Bound && filed.Changesets.Count > 0`: `report.Ledger = GhostFailurePolicy.WithdrawingLine(filed.Changesets.Count)` (new words, Step 5) and `Task.Run(() => App.PanelVm?.LogDoctor(UnreportedResults.GhostHead + "withdrawn after the build rolled back — " + UnreportedResults.WithdrawEach(...)))`. `Decline` stays as today (its reports and withdrawals already run on a pool thread through `ReportAll`). The `catch (Exception ex) when (!done)` stays in `Place` (`executing ? Decline(null, why) : Abandon(...)`). `NotPlaced(p, filed, why)`: `p.Report.NotBuilt = GhostFailurePolicy.NotPlacedLine(why)`; the filed changesets withdrawn — read `RevitEventHub.cs:65-110` to learn which thread calls `onRefused`: on Revit's thread wrap the withdrawals in `Task.Run` and set `Ledger = WithdrawingLine(n)`; off it, run them inline and set `Ledger` from `WithdrawEach`'s words; returns `p.Report`.

- [ ] **Step 4: the controller — `GhostBuilderPlacementEvent.Execute`:**
```csharp
        public void Execute(UIApplication app)
        {
            var request = _request;
            _request = null;
            try
            {
                if (request == null) throw new InvalidOperationException("No request staged. Call SetRequest() before Raise().");
                // MA-3b7 (XC-3): the dry run on Revit's thread; the filing on a pool thread (Revit answers meanwhile); the build back on
                // Revit's thread in the model it started from (DocPin) — a model switched or closed is said, what was filed is withdrawn.
                var prep = GhostChangesetBuild.Prepare(app, request);
                if (prep.Refused) { Completed?.Invoke(prep.Report, null); return; }
                var doc = prep.Doc;
                App.PanelVm?.LogDoctor(GhostFailurePolicy.FilingLine(prep.Bound ? prep.Bodies.Count : 0, prep.Bound));
                Task.Run(() => GhostChangesetBuild.File(prep)).ContinueWith(t =>
                {
                    var filed = t.Status == TaskStatus.RanToCompletion ? t.Result
                        : new GhostChangesetBuild.Filed { Changesets = new List<ChangesetDto>(), NotFiled = GhostFailurePolicy.NotFiledLine(t.Exception?.GetBaseException().Message ?? "the filing did not finish") };
                    if (filed.NotFiled != null)
                    {
                        prep.Report.NotBuilt = filed.NotFiled; prep.Report.Ledger = filed.Ledger;
                        Completed?.Invoke(prep.Report, null); // from the pool thread: the command's handler marshals to its window
                        return;
                    }
                    App.Events.Enqueue(doc, "place the Ghost Builder build", (u, d) => Completed?.Invoke(GhostChangesetBuild.Place(u, d, prep, filed), null),
                        why => Completed?.Invoke(GhostChangesetBuild.NotPlaced(prep, filed, why), null));
                }, TaskScheduler.Default);
            }
            catch (Exception ex) { Completed?.Invoke(null, ex); }
        }
```

- [ ] **Step 5: the words** — in `GhostFailurePolicy.cs` beside `NotFiledLine`:
```csharp
        /// <summary>MA-3b7: the pane's Doctor line when the dry run is done and the filing starts off Revit's thread.</summary>
        public static string FilingLine(int n, bool bound) => bound
            ? $"Ghost Builder: the types proved and the build planned; filing {n} changeset(s) off Revit's thread — Revit stays usable, and the build places by itself in this model once the bridge has answered."
            : "Ghost Builder: the types proved and the build planned; this model is not bound to a web project, so nothing is filed — the build places by itself.";
        /// <summary>MA-3b7 (DocPin): the model was switched or closed while Ghost Builder filed — nothing was placed.</summary>
        public static string NotPlacedLine(string why) => $"Nothing was built — {why}. The build was planned for the model it started from and places only there; run Build again in that model.";
        /// <summary>MA-3b7: the withdrawals after a build rolled back run off Revit's thread — the Doctor log says what the bridge answered.</summary>
        public static string WithdrawingLine(int n) => $"Ledger: withdrawing the {n} changeset(s) already filed, off Revit's thread — the pane's Doctor log says what the bridge answered (one it did not answer is named there: withdraw it on the web before anyone reviews it).";
```
Update the file header comment of `GhostChangesetBuild.cs` (`:5-6` "Everything happens inside ONE TransactionGroup…") with two lines saying the dry run, the pool-thread filing and that the build itself is still one group and one Undo.

- [ ] **Step 6: build** `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Warning\(s\)|Error\(s\)"` → 0 errors; `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"` → read each FAIL against the Global Constraints rule and fix the source (or, for a line this slice deletes on purpose, the pin with a comment).

- [ ] **Step 7: commit** — `feat(revit): MA-3b7 - Ghost Builder files and withdraws off Revit's thread: a dry run proves the types and plans the build (its group rolled back), the filing runs on a pool thread, the build places in a second event in the model it started from (DocPin) as one Undo entry; a filing that failed, a model switched or closed, or a placement Revit refused withdraws what was filed off the thread and says so`

### Task 2 — `tools/promote-check/Ma3b7.cs` (section 54)

**Files:** create `tools/promote-check/Ma3b7.cs`; modify `tools/promote-check/Check.cs` (call `Ma3b7Checks();` after `Ma3b6WordChecks();`).

- [ ] Pins (`Ok(...)`), in the shape of `Ma3b5Wiring.cs`:
  - words: `FilingLine(3, true)`, `FilingLine(0, false)`, `NotPlacedLine("the model in front is \"other.rvt\", not \"ma.rvt\"")`, `WithdrawingLine(2)` — each the exact string from Task 1 Step 5.
  - wiring, `ghost = Src("GhostBuilder", "GhostChangesetBuild.cs")`, `ev = Src("GhostBuilder", "GhostBuilderExternalEvent.cs")`: `ghost` contains `public static Prepared Prepare(UIApplication app, Request r)`, `public static Filed File(Prepared p)`, `public static GhostPlacementEngine.PlacementReport Place(UIApplication app, Document doc, Prepared p, Filed filed)`; `ChangesetClient.Propose(` appears in `ghost` exactly once and that index is after `At(ghost, "public static Filed File(")` and before `At(ghost, "public static GhostPlacementEngine.PlacementReport Place(")` (the filing lives in `File` alone); `Count(ghost, "new TransactionGroup(doc, \"Ghost Builder\")") == 2` (A's dry run and B's build); `ghost` no longer contains `public static GhostPlacementEngine.PlacementReport Run(`; `ev` contains `Task.Run(() => GhostChangesetBuild.File(prep))`, `App.Events.Enqueue(doc, "place the Ghost Builder build"`, and `GhostChangesetBuild.NotPlaced(prep, filed, why)`; no `ChangesetClient.Withdraw(` sits between `Place`'s `group.Start();` and its `group.Assimilate()` (pin the two indices and that every `Withdraw(` index in `ghost` is outside that span).
  - Run `dotnet run --project tools/promote-check 2>&1 | tail -2` → `N/N checks pass`, N = 827 + your lines − any pin this slice retired.

- [ ] Commit — `feat(revit): MA-3b7 - promote-check 54: the Ghost build's words, and the filing and withdrawals live off Revit's thread`

### Task 3 — Final checks (nothing to commit)
`dotnet run --project tools/promote-check 2>&1 | tail -2`; builds `-p:RevitVersion=2022`, `2024`, `2026`, `2027`, each `-p:DeployToRevit=false`, each `0 Error(s)`; the other check projects that scan the Ghost build: `dotnet run --project tools/ghost-p2-check 2>&1 | tail -1` and `dotnet run --project tools/ghost-standards-check 2>&1 | tail -1` (both must still pass). `git status --short` shows only `.claude/` and `ab.html`. Report the totals and `git log --oneline master..HEAD`.

## Live drill MA3b7 (the controller, after the build)

- R-1 Revit 2024, the branch's add-in, a scratch copy of a model holding a DWG import (`Documents\Sentinel drills\ma1a-i5-scratch.rvt` if it still holds one), bound to a scratch project, signed in: Build ticked layers → the Doctor log shows the FilingLine, Revit answers during the filing (a 4101 door holding the first filing, as drill MA3b4's), the build places by itself, one Undo entry, the report dialog as before. **Owed unless a scratch model with an import is at hand** (a DWG file dialog cannot be driven by Claude).
- R-2 the filing refused (the bridge stopped): the dialog says the NotFiledLine and the Ledger says what was withdrawn; nothing placed. **Owed with R-1.**
- Merge `--no-ff` only after R-1 passes, or on the founder's word; deploy 2021–2027 after the merge.

## Next (out of scope here)
- The C1e dispatcher audit of the remaining `GovernedNotify` callers (size S). MA-3c (the ghost overlay). A guard per project key: not planned.
