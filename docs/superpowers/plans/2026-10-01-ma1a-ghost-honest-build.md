# MA-1a step 1 — Ghost Builder honest build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ghost Builder (DWG) and Photo Massing stop being able to lose or hide anything. The failure handler deletes or
resolves only elements this build created, rolls the build back rather than touch a user's element, and counts warnings
without erasing them. A row that names a missing family type becomes a gap; it never falls back to the first family loaded.
"Placed" is counted after the commit, from the ids that survived. The summary names what Revit deleted, the warnings it
kept, and every type and family the build added. The review gets a type drop-down per row with "(ignore)". Those choices
are remembered as `reviewer`, and the review lists the types the build will add before Build is pressed.

**Source of truth:** `docs/strategy/2026-09-30-model-automation-design.md` §2.4 "The order in MA-1" step 1 (`:260-261`) and
§7.2 MA-1 (1a) item 1 (`:1047`); audit row GHB-5 and the Ghost findings in `docs/strategy/2026-09-30-revit-addin-audit.md`
(`:907-919`, `:925`); [BP] P1-3 in `docs/strategy/2026-09-29-sentinel-blueprint.md` (`:1185`, "count warnings, don't erase
them"). Base: master `5562a69`. Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Architecture:** Every rule is a Revit-free decision function, proven offline by `tools/ghost-p2-check`:
- `GhostFailurePolicy`: which failure gets which action, and the summary text;
- `GhostTypePick`: the one family type a row names;
- the review's `Effective`/`TypesToCreate`.

Thin Revit adapters apply these functions: `GhostFailureHandler`, `ElementPlacementFactory`, `GhostBuilderOrchestrator` and the command's type read. The factory records each element it creates at its single choke point (`ApplyParams`). The orchestrator gives those ids to the handler before `Commit` and recounts survivors after it. The review emits copies stamped `Source = "reviewer"`, which `LayerMapper` remembers.

**Global constraints:**
- Branch `feature/ma1a-ghost-honest-build` from master. Merge `--no-ff` only after every task's checks pass. Push only under the standing push rule, and secret-scan the range first.
- Build both targets after every add-in task: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `-p:RevitVersion=2026`.
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record` (no `IsExternalInit`). Use the Edit tool for C# strings that contain escapes.
- No deploy, no Revit and no bridge while doing the tasks. The live drill is a separate session (last section).
- No new dependencies and no new check project. Extend `tools/ghost-p2-check` and `tools/ghost-standards-check`.
- Do not touch `ChangesetExecutor.cs`, `ProvenanceStamp.cs` or `UndoWatcher.cs`, the Ghost transaction's name or Undo shape, or `SentinelUndo`. Those belong to step 2.
- After each code task, run `graphify update .` (per `C:/Users/yazan/CLAUDE.md`). If `graphify` is not on PATH (it was not on 2026-10-01), say so and move on.
- Never print or commit secrets (`config/.env`, `WebApp/.npmrc`, tokens). Never commit a `.rvt`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are those of master `5562a69`. Earlier tasks shift them, so match the quoted text, not the number.
- Dry run (2026-10-01, planner): every code step below was applied in order to a `git archive` export of `5562a69` in a scratch folder. Both add-in builds gave `0 Error(s)` and no new warnings; `ghost-p2-check` ended `79/79` (18 + 9 + 10 new) and `ghost-standards-check` `143/143` (6 new). Nothing in the repo was changed by that run.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | At commit, Revit raises an error that names both a user's element and an element this build made | **A:** delete only this build's elements among the ids it names (failing ∪ additional, A5), keep the rest of the build, and name them in the summary ("Placed 9 (1 deleted by Revit: …)"). An error that names none of this build's elements rolls the whole build back, with the reason. **B:** roll the whole build back on any error that names a user's element | **A.** It is GHB-5's own wording. Neither option can delete, resolve or unjoin a user's element. B arrives anyway with step 2 (the executor is all-or-nothing) |
| F2 | A wall type the reviewer picks, against the office guideline | **A:** the reviewer's pick wins and is counted on its own line, "typed by the reviewer". **B:** Walls rows get no drop-down when a guideline is installed | **A.** Otherwise the drop-down does nothing for measured walls (`ElementPlacementFactory.cs:139-150`) |
| F3 | A remembered reviewer choice, against the office `layers@n` | **A:** the remembered choice comes after the installed standard. The standard still wins, and the choice beats remembered model answers, heuristics and the local model. **B:** the choice comes before the standard | **A.** A machine-local file never outranks the office standard; a standard row is fixed in `layers@n`. Ceiling: a pick on a standard row lasts one build |

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | Warnings are counted and left to Revit; Sentinel never erases one. Each distinct warning seen on any pass is counted once (keyed by its failure definition and the elements it names), less those that name an element of this build Revit removed at commit. `SetForcedModalHandling(false)` lets Revit show them without blocking. The global Doctor (`FailureInterceptor`) skips the Ghost transaction, matched by `FailuresAccessor.GetTransactionName()` | [BP] P1-3. UNSURE whether `DeleteWarning` also removes a warning from Review Warnings, so it is never called; drill S1-5 measures the change in the count. UNSURE whether Revit shows an unresolved warning again on the pass after `ProceedWithCommit`; the keyed count gives the same answer either way |
| E2 | "Ours" means elements created by placement: the five create sites, recorded at `ApplyParams`. Types cloned and families loaded by the build are not in it | Conservative. A failure that names only a new type is treated as foreign and rolls the build back; nothing unproven is ever deleted |
| E3 | Revit's resolution is applied only when every id in failing ∪ additional is ours, and only once per failure. A repeat deletes ours instead. After 20 passes the build rolls back | RevitAPI warns that a preprocessor must avoid infinite loops (`ResolveFailures` remarks) |
| E4 | Point families (doors, windows, columns, furniture) use `GhostTypePick`, inside the row's category only: exact (family, type); a family with no type named takes its only type; a type with no family named takes the only family that has it; anything else is a gap | The same zero / one / many rule as `ChangesetExecutor.CreateType` (D16), plus the family-only row that `layers@n` produces |
| E5 | Massing doors and windows use the document's default family type for the category, declared in a Note, as massing walls and floors already are. `DefaultType` loses its `?? cache.Values.FirstOrDefault()` | D16: never the model's first type. Without a placeholder, every massing opening would vanish |
| E6 | Reviewer rows start unticked (`PreTick` is unchanged). Choices are remembered when the review builds **or closes**: a drawing with only a layer to ignore (F45's section) has nothing to build. An unbound document remembers nothing, and a `layers@n` sha change drops the choices | The same lifetime as remembered model answers |
| E7 | The drop-down lists Basic wall types only | `ChangesetExecutor.ResolveWallType`'s rule, so a pick stays valid in step 2 |
| E8 | The Walls lines count Revit walls (a closed loop of 4 is 4), consistent with Placed | They were counted per CAD element |

## Review amendments (2026-10-01, BINDING — they override any task text they contradict)

Two adversarial reviews of this plan (workflow wf_02747bdd-4bd) found no path that touches a user's element or erases a
warning, and raised the points below. Each is part of the task named; its check is part of that task's check run. The
expected check totals in the tasks change accordingly — report the real totals.

- **A1 (Task 5 `Copy`, Task 6 `Remember`, important): remember the choice, never document values.** `Remember` stores a
  copy with `Params = null`, `SourceDoc = null` and `Rationale = "your earlier review"`, keeping only `CadLayer`,
  `Category`, `BdsFamily`, `BdsFamilyType`, `Confidence`, `Source` and `Ignore`. `MapLayersAsync` caches a **copy** of each
  local-model row (`_cache[...] = m.Copy()`), so `EnrichParamsAsync`'s in-place edits never reach disk. Checks (in
  `ghost-standards-check`): a remembered row that carried Params is saved without `params`; a local-model row whose
  Params are set after mapping is saved without `params`; a remembered row comes back with `Params == null`.
- **A2 (Task 5 `ItemsFor`/`Effective`, Task 6, important): a remembered choice can always be undone.** Every row always
  offers `as proposed: <family : type>` (an ignore row keeps its proposed `Category`/`BdsFamily`/`BdsFamilyType`, so the
  label exists); picking it on an ignored row returns the copy with `Ignore = false`. A row that came from memory also
  offers `(forget my choice)`, which makes `Remember` delete that cache key so the next run asks the heuristic or the
  model again. Change the `w2` check to prove an ignored row with no loaded types can be un-ignored, and add one check
  for forget.
- **A3 (Task 5 forecast, minor):** pass `hasLibrary` (`libraryDir != null`) into `Load` and on into `TypesToCreate`.
  Without a library a door/window/column/furniture family that is not loaded is listed as `not loaded, and no Ghost family
  library is set — the row will be skipped`, never as an addition. One assertion.
- **A4 (Task 2 Doctor exemption, minor):** the exemption is one static predicate (e.g. `GhostFailurePolicy.DoctorSkips(string
  transactionName)`) that `FailureInterceptor` calls, not an equality spread in place. Add a row to "What step 2 replaces":
  *the Doctor exemption must cover the executor's transaction for Ghost-sourced changesets (change the predicate), or P1-3
  regresses.*
- **A5 (Task 1, F1, minor): delete ours among failing ∪ additional.** `Decide`/`ToDelete` use (failing ∪ additional) ∩ ours:
  an error that names a user element as failing and one of ours as additional deletes ours (the likely "Can't keep elements
  joined" between a user wall and a new wall), and rolls back only when that intersection is empty. Change the `:243`
  check (`D(E,false,{900},{101})`) to expect `DeleteOurs` and add one check that `{900}`/`{}` rolls back. F1 A's wording
  becomes "deletes only this build's elements among the ids the error names". A user element is still never deleted,
  resolved or unjoined.
- **A6 (Task 2 Step 4, minor):** `NotBuiltLine` only for `TransactionStatus.RolledBack`. Any other non-Committed status
  (Pending included) reports `Revit has not finished the build (status X) — check the model before re-running` and does
  not recount.
- **A7 (Task 2 or 3, data safety): no write onto a user's type.** `ApplyParams`' type-parameter fallback
  (`ElementPlacementFactory.cs:465-479`) writes only to a type this build created (provisioned/cloned this run); any other
  type is left alone and the Note says `not applied to type "T" — it would change N existing instances`. Put the rule in
  a pure function with two checks (created type → write; existing type → not applied).
- **A8 (drill):** the community Revit MCP never writes (standing rule): S1-6(b)'s `send_code_to_revit` plant is
  removed. S1-6 runs as (a) only; when no build error names a user element, record "not seen live — the rule is proven
  offline by GhostFailurePolicy's checks". `analyze_model_statistics` (read-only) stays allowed for counts.

## What step 2 replaces — so nothing is built twice

| Built here (step 1) | In step 2 (Ghost files changesets; `ChangesetExecutor` places them) |
|---|---|
| `GhostFailureHandler` with the delete-ours policy on the Ghost transaction | Retired for placement, because the executor is all-or-nothing. If the executor gets a preprocessor, it reuses `GhostFailurePolicy.Decide`'s RollBack branch with `ours` = its `Applied` ids. It is independent of `GhostPlacementEngine` on purpose |
| `NewElements` recorded at `ApplyParams`; Placed recounted after commit | The executor's `Collect` → `Applied`. The survivor recount moves into the executor, which has none today (`ChangesetExecutor.cs:478-480`) |
| `GhostTypePick` in the factory | Ghost's reader resolves rows to exact (FamilyName, TypeName) before filing. `CreateType` may adopt the same pure rule |
| `PlacedLine`, `WarningsLine`, `NotBuiltLine` | Reused as they are for the changeset result text |
| Review drop-down, "(ignore)", `Source = "reviewer"`, `LayerMapper.Remember`, the forecast | **Kept** as the reader side. A reviewer row's (BdsFamily, BdsFamilyType) maps 1:1 to `PlaceDto.FamilyName` / `TypeName` (`Coordination/ChangesetClient.cs`) |
| The Doctor exemption, `GhostFailurePolicy.DoctorSkips(transactionName)` (A4) | The Doctor exemption must cover the executor's transaction for Ghost-sourced changesets (change the predicate), or P1-3 regresses |
| Provisioners and preloader inside the build transaction (unchanged; now named in the summary) | Step 2 decides where type creation lives (a planning stage before filing); the forecast is its seed |

These are **not** built here, because they need a changeset id or are other rows:
- the provenance stamp, the transaction name, `UndoWatcher`, `SentinelUndo` and ledger rows (step 2);
- DocPin on `GhostBuilderPlacementEvent`;
- hosted doors (GHB-1);
- level-to-level walls (GHB-2);
- the rest of the Doctor's scope (BG-3);
- `GhostTypeCreator` dead code;
- the preloader's noise for system families.

---

## Tasks (in order: data-loss first, UI last)

### Task 1 — The failure rule, offline

**Files:**
- Create `SentinelAddin/GhostBuilder/GhostFailurePolicy.cs`
- Create `tools/ghost-p2-check/Honest.cs`
- Modify `tools/ghost-p2-check/Check.cs` (`:18`, `:180-182`)
- Modify `tools/ghost-p2-check/ghost-p2-check.csproj` (`:28`)

**Interfaces:**
- Consumes: nothing.
- Produces (namespace `Sentinel.GhostBuilder`, `public static class GhostFailurePolicy`):
  - `enum Severity { Warning, Error, Corruption }`
  - `enum Act { Count, Resolve, DeleteOurs, RollBack }`
  - `const int MaxPasses = 20`
  - `static Act Decide(Severity severity, bool hasResolutions, IReadOnlyCollection<long> failing, IReadOnlyCollection<long> additional, ISet<long> ours, bool triedResolution = false)`
  - `static List<long> ToDelete(IEnumerable<long> failing, ISet<long> ours)`
  - `static string RollBackReason(string description, Severity severity, IReadOnlyCollection<long> foreign)`
  - `static string PlacedLine(int placed, IReadOnlyList<string> deleted)`
  - `static Dictionary<string, int> CountWarnings(IEnumerable<(string Key, string Text, IReadOnlyCollection<long> Ids)> seen, ISet<long> gone)`
  - `static string WarningsLine(IReadOnlyDictionary<string, int> warnings)` (null when there are none)
  - `static string NotBuiltLine(string reason)`

- [ ] **Step 1: Create `SentinelAddin/GhostBuilder/GhostFailurePolicy.cs`**

```csharp
#nullable disable
// MA-1a step 1 (GHB-5): what Ghost Builder's failure preprocessor may do with one Revit failure, decided over plain element
// ids — no Revit API, so ghost-p2-check proves it offline. A warning is counted and left to Revit, never erased ([BP] P1-3).
// An error is given Revit's own resolution only when every element it names (failing and additional) is one this build
// created, and only once; otherwise only this build's failing elements in it are deleted; an error that names none of them
// rolls the whole build back. A user's element is never deleted, resolved or unjoined by Sentinel.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public static class GhostFailurePolicy
    {
        public enum Severity { Warning, Error, Corruption }
        public enum Act { Count, Resolve, DeleteOurs, RollBack }

        /// <summary>Revit re-runs failure processing after every fix (ProceedWithCommit); past this many passes the build is
        /// rolled back rather than looped (RevitAPI: a preprocessor must avoid an infinite loop).</summary>
        public const int MaxPasses = 20;

        private static readonly long[] None = new long[0];

        /// <param name="triedResolution">This same failure (definition and failing ids) was given Revit's resolution on an
        /// earlier pass and came back.</param>
        public static Act Decide(Severity severity, bool hasResolutions, IReadOnlyCollection<long> failing,
                                 IReadOnlyCollection<long> additional, ISet<long> ours, bool triedResolution = false)
        {
            if (severity == Severity.Warning) return Act.Count;
            if (severity == Severity.Corruption) return Act.RollBack;
            failing ??= None;
            var named = failing.Concat(additional ?? None).ToList();
            if (hasResolutions && !triedResolution && named.Count > 0 && named.All(ours.Contains)) return Act.Resolve;
            return failing.Any(ours.Contains) ? Act.DeleteOurs : Act.RollBack;
        }

        /// <summary>The failing elements this build created — the only ids Sentinel ever deletes.</summary>
        public static List<long> ToDelete(IEnumerable<long> failing, ISet<long> ours) =>
            (failing ?? None).Where(ours.Contains).Distinct().ToList();

        /// <summary>Why the build was rolled back, naming the user's elements by id.</summary>
        public static string RollBackReason(string description, Severity severity, IReadOnlyCollection<long> foreign)
        {
            string what = string.IsNullOrWhiteSpace(description) ? "a Revit failure" : description.Trim();
            if (severity == Severity.Corruption) return what + " (Revit reports document corruption; the build is never committed through it)";
            return foreign == null || foreign.Count == 0
                ? what + " (Revit names no element, so Sentinel cannot tell it is this build's own)"
                : what + $" (it names element(s) {string.Join(", ", foreign)}, which this build did not create — Sentinel never deletes or resolves those)";
        }

        /// <summary>"Placed: 9", or "Placed: 9 (1 deleted by Revit: Walls on 'A-WALL' — Can't make Wall.)" — repeats collapsed.</summary>
        public static string PlacedLine(int placed, IReadOnlyList<string> deleted) =>
            deleted == null || deleted.Count == 0
                ? $"Placed: {placed}"
                : $"Placed: {placed} ({deleted.Count} deleted by Revit: " +
                  string.Join("; ", deleted.GroupBy(d => d).Select(g => g.Count() > 1 ? $"{g.Key} ×{g.Count()}" : g.Key)) + ")";

        /// <summary>The Revit warnings this build left in the model, counted by text. <paramref name="seen"/> is every warning
        /// the preprocessor saw, on every pass: Revit re-runs it after each fix (ProceedWithCommit) and may or may not show an
        /// unresolved warning again (UNSURE), so a warning counts once per Key (its failure definition and the elements it
        /// names). A warning that names an element of this build that is <paramref name="gone"/> after the commit went with
        /// that element, so it is not counted.</summary>
        public static Dictionary<string, int> CountWarnings(IEnumerable<(string Key, string Text, IReadOnlyCollection<long> Ids)> seen,
                                                            ISet<long> gone)
        {
            var counts = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var g in (seen ?? Enumerable.Empty<(string Key, string Text, IReadOnlyCollection<long> Ids)>()).GroupBy(w => w.Key))
            {
                var w = g.First();
                if (w.Ids != null && gone != null && w.Ids.Any(gone.Contains)) continue;
                string text = string.IsNullOrWhiteSpace(w.Text) ? "Revit warning" : w.Text.Trim();
                counts[text] = counts.TryGetValue(text, out int n) ? n + 1 : 1;
            }
            return counts;
        }

        /// <summary>The Revit warnings this build raised, counted by text — left in the model; null when there were none.</summary>
        public static string WarningsLine(IReadOnlyDictionary<string, int> warnings)
        {
            int total = warnings?.Values.Sum() ?? 0;
            if (total == 0) return null;
            return $"Revit warnings raised by this build: {total} — left in the model (Manage ▸ Review Warnings), never erased: " +
                   string.Join("; ", warnings.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal)
                                             .Select(kv => kv.Value > 1 ? $"{kv.Key} ×{kv.Value}" : kv.Key));
        }

        /// <summary>A build Revit rolled back: nothing exists, so this is the whole report.</summary>
        public static string NotBuiltLine(string reason) =>
            "Nothing was built — Revit rolled the build back, so the model is as it was before Build: " + reason;
    }
}
```

- [ ] **Step 2: Create `tools/ghost-p2-check/Honest.cs`**

```csharp
// MA-1a step 1 (GHB-5) — Ghost Builder's honest build, offline: the failure rule (GhostFailurePolicy), the family-type pick
// (GhostTypePick) and the review's type drop-down (GhostReviewWindow). All Revit-free; the Revit halves are drilled live.
using System.Windows.Controls;
using Sentinel.GhostBuilder;
using Sentinel.UI;

static partial class Check
{
    static void Honest()
    {
        Policy();
    }

    // ── the failure rule: a user's element is never deleted or resolved; warnings are counted, never erased ──
    static void Policy()
    {
        Console.WriteLine("\nMA-1a — Ghost's failure rule (GhostFailurePolicy)");
        var ours = new HashSet<long> { 101, 102, 103 };
        var W = GhostFailurePolicy.Severity.Warning;
        var E = GhostFailurePolicy.Severity.Error;
        GhostFailurePolicy.Act D(GhostFailurePolicy.Severity s, bool res, long[] failing, long[]? additional = null, bool tried = false) =>
            GhostFailurePolicy.Decide(s, res, failing, additional ?? Array.Empty<long>(), ours, tried);

        Ok(D(W, true, new long[] { 900 }) == GhostFailurePolicy.Act.Count && D(W, false, new long[] { 101 }) == GhostFailurePolicy.Act.Count,
           "a warning is counted, never erased or resolved — whoever's element it names");
        Ok(D(E, true, new long[] { 101 }, new long[] { 102 }) == GhostFailurePolicy.Act.Resolve,
           "an error naming only this build's elements takes Revit's own resolution");
        Ok(D(E, true, new long[] { 101 }, tried: true) == GhostFailurePolicy.Act.DeleteOurs,
           "…once: the same failure back after its resolution deletes this build's elements instead (no endless loop)");
        Ok(D(E, false, new long[] { 101, 102 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 102 }, ours).SequenceEqual(new long[] { 101, 102 }),
           "an error with no resolution naming only ours deletes them");
        Ok(D(E, true, new long[] { 101, 900 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 900, 101 }, ours).SequenceEqual(new long[] { 101 }),
           "an error naming the user's element 900 and ours 101: only 101 is deleted, and Revit's resolution is never applied");
        Ok(D(E, true, new long[] { 101 }, new long[] { 900 }) == GhostFailurePolicy.Act.DeleteOurs,
           "a user's element among the additional ids also keeps Revit's resolution away");
        Ok(D(E, true, new long[] { 900, 901 }) == GhostFailurePolicy.Act.RollBack
           && D(E, false, new long[] { 900 }, new long[] { 101 }) == GhostFailurePolicy.Act.RollBack,
           "an error whose failing elements are all the user's rolls the build back — nothing of theirs is deleted");
        Ok(D(E, true, new long[0]) == GhostFailurePolicy.Act.RollBack,
           "an error naming no element rolls back — never Revit's modal dialog, never a guess");
        Ok(D(GhostFailurePolicy.Severity.Corruption, true, new long[] { 101 }) == GhostFailurePolicy.Act.RollBack,
           "document corruption is never committed through");
        Ok(GhostFailurePolicy.RollBackReason("Can't keep elements joined.", E, new long[] { 900, 901 })
               == "Can't keep elements joined. (it names element(s) 900, 901, which this build did not create — Sentinel never deletes or resolves those)",
           "a rollback names the user's elements by id");
        Ok(GhostFailurePolicy.RollBackReason(null!, E, new long[0]) == "a Revit failure (Revit names no element, so Sentinel cannot tell it is this build's own)",
           "…and says so when Revit names none");

        Ok(GhostFailurePolicy.PlacedLine(9, new List<string>()) == "Placed: 9", "Placed alone when Revit removed nothing");
        Ok(GhostFailurePolicy.PlacedLine(9, new List<string> { "Walls on 'A-WALL' — Can't make Wall.", "Doors on 'A-DOOR' — X.", "Walls on 'A-WALL' — Can't make Wall." })
               == "Placed: 9 (3 deleted by Revit: Walls on 'A-WALL' — Can't make Wall. ×2; Doors on 'A-DOOR' — X.)",
           "Placed 9 (3 deleted by Revit: …) — each named with the failure that named it, repeats collapsed");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int>()) == null, "no Revit warning, no line");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int> { ["Highlighted walls overlap."] = 2, ["There are identical instances in the same place."] = 1 })
               == "Revit warnings raised by this build: 3 — left in the model (Manage ▸ Review Warnings), never erased: Highlighted walls overlap. ×2; There are identical instances in the same place.",
           "warnings are counted by text and said to be left in the model");
        var seen = new List<(string Key, string Text, IReadOnlyCollection<long> Ids)>
        {
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),   // the same warning, shown again on the next pass
            ("k2", "Highlighted walls overlap.", new long[] { 102, 103 }),
            ("k3", "There are identical instances in the same place.", new long[] { 103 }),
        };
        string Counted(ISet<long> gone) =>
            string.Join("; ", GhostFailurePolicy.CountWarnings(seen, gone).OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => $"{kv.Key}={kv.Value}"));
        Ok(Counted(new HashSet<long>()) == "Highlighted walls overlap.=2; There are identical instances in the same place.=1",
           "a warning seen on two passes counts once; two warnings with the same text count two");
        Ok(Counted(new HashSet<long> { 103 }) == "Highlighted walls overlap.=1",
           "a warning naming an element of this build that Revit removed is not counted — it went with the element");
        Ok(GhostFailurePolicy.NotBuiltLine("X (y)") == "Nothing was built — Revit rolled the build back, so the model is as it was before Build: X (y)",
           "a rolled-back build reads as nothing built");
    }
}
```

- [ ] **Step 3: Make `Check` partial and call `Honest()`.** In `tools/ghost-p2-check/Check.cs`:
  - replace `static class Check` (`:18`) with `static partial class Check`;
  - replace

```csharp
        Ok(emitted == null, "empty proposal cannot be built");

        if (Environment.GetCommandLineArgs().Contains("--live")) LiveDryRun().GetAwaiter().GetResult();
```

with

```csharp
        Ok(emitted == null, "empty proposal cannot be built");

        Honest(); // MA-1a step 1: failure rule, family-type pick, review drop-down (Honest.cs)

        if (Environment.GetCommandLineArgs().Contains("--live")) LiveDryRun().GetAwaiter().GetResult();
```

- [ ] **Step 4: Compile the new file into the check.** In `tools/ghost-p2-check/ghost-p2-check.csproj`, after `<Compile Include="..\..\SentinelAddin\UI\GhostReviewWindow.cs" />` add:

```xml
    <!-- MA-1a step 1 (GHB-5): the failure rule and the family-type pick — pure, no Revit API -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostFailurePolicy.cs" />
```

- [ ] **Step 5: Run the check.** `dotnet run --project tools/ghost-p2-check`. Expected: 18 new `PASS` lines under "MA-1a — Ghost's failure rule", and the last line `60/60 checks pass` (42 before; measured on master `5562a69`).
- [ ] **Step 6: Build the add-in (the new file is in its glob).** Run both builds from Global constraints. Expected for each: `Build succeeded.` with `0 Error(s)`.
- [ ] **Step 7: Commit.**

```bash
git checkout -b feature/ma1a-ghost-honest-build
git add SentinelAddin/GhostBuilder/GhostFailurePolicy.cs tools/ghost-p2-check/Honest.cs tools/ghost-p2-check/Check.cs tools/ghost-p2-check/ghost-p2-check.csproj
git commit -F - <<'EOF'
feat(ghost): GhostFailurePolicy — the failure rule over plain ids, proven offline (MA-1a GHB-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2 — The handler touches only this build's elements; Placed is counted after the commit

**Files:**
- Replace `SentinelAddin/GhostBuilder/GhostFailureHandler.cs` (all 61 lines)
- Modify `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (`:32`, `:135-189`)
- Modify `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (`:87`, `:273-275`, `:446-448`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`:318`, `:330`, `:385`, `:397`)
- Modify `SentinelAddin/Updaters/FailureInterceptor.cs` (`:42-44`)

**Interfaces:**
- Consumes:
  - Task 1's `GhostFailurePolicy`;
  - `Sentinel.Compat.IdValue(this ElementId) : long` and `Sentinel.Compat.ToElementId(this long) : ElementId` (`SentinelAddin/Compat.cs:12`, `:20`).
- Produces:
  - `GhostFailureHandler`: `readonly HashSet<long> Ours`, `readonly Dictionary<long, string> Why`, `readonly List<(string Key, string Text, IReadOnlyCollection<long> Ids)> SeenWarnings` and `string RolledBack { get; }`;
  - `GhostBuilderOrchestrator.TxName` (`public const string`, value `"Ghost Builder - LOD 200"`, unchanged);
  - `ElementPlacementFactory.NewElements : List<(ElementId Id, string What)>`;
  - `PlacementReport`: `NewElements`, `DeletedByRevit : List<string>`, `RevitWarnings : Dictionary<string, int>` and `RolledBack : string`;
  - `PlacementReport.Placed` now means the elements that exist after the commit.

- [ ] **Step 1: Replace `SentinelAddin/GhostBuilder/GhostFailureHandler.cs` entirely**

```csharp
#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Failure preprocessor for the one Ghost Builder transaction (DWG and Photo Massing; never registered globally). A bulk
    /// build from dirty CAD raises creation failures at commit ("Can't make Wall", "Can't keep elements joined"); left to Revit
    /// they block the user behind modal dialogs. MA-1a step 1 (GHB-5): the rule is GhostFailurePolicy's — Revit's resolution
    /// only for a failure that names nothing but this build's elements; otherwise only this build's failing elements are
    /// deleted; a failure naming none of them rolls the build back. A user's element is never deleted, resolved or unjoined.
    /// Warnings are counted and left to Revit, never erased ([BP] P1-3). Everything it did is kept for the build summary.
    /// </summary>
    public sealed class GhostFailureHandler : IFailuresPreprocessor
    {
        /// <summary>The ids of the elements this build created — filled by the orchestrator after placement and before Commit
        /// (the preprocessor runs at Commit).</summary>
        public readonly HashSet<long> Ours = new HashSet<long>();
        /// <summary>Each of ours an error named, with Revit's description of it (the last one wins).</summary>
        public readonly Dictionary<long, string> Why = new Dictionary<long, string>();
        /// <summary>Every warning seen, on every pass — (definition + named ids, text, named ids) — left in the model, never
        /// erased. The orchestrator counts them after the commit with GhostFailurePolicy.CountWarnings.</summary>
        public readonly List<(string Key, string Text, IReadOnlyCollection<long> Ids)> SeenWarnings =
            new List<(string Key, string Text, IReadOnlyCollection<long> Ids)>();
        /// <summary>Set when this handler rolled the build back: why, in words.</summary>
        public string RolledBack { get; private set; }

        private readonly HashSet<string> _resolved = new HashSet<string>(); // failures already given Revit's resolution once
        private int _passes;

        public FailureProcessingResult PreprocessFailures(FailuresAccessor accessor)
        {
            try
            {
                if (++_passes > GhostFailurePolicy.MaxPasses)
                    return RollBack($"Revit still raised failures after {GhostFailurePolicy.MaxPasses} passes");

                var delete = new HashSet<long>();
                bool resolved = false;
                foreach (FailureMessageAccessor f in accessor.GetFailureMessages())
                {
                    string text = f.GetDescriptionText() ?? "Revit failure";
                    var severity = Sev(f.GetSeverity());
                    var failing = Ids(f.GetFailingElementIds());
                    string key = f.GetFailureDefinitionId().Guid + "|" + string.Join(",", failing.OrderBy(i => i));
                    var act = GhostFailurePolicy.Decide(severity, f.HasResolutions(), failing,
                                                        Ids(f.GetAdditionalElementIds()), Ours, _resolved.Contains(key));
                    if (act == GhostFailurePolicy.Act.Count)
                    {
                        SeenWarnings.Add((key, text, failing)); // counted after the commit; Revit keeps the warning
                        continue;
                    }
                    if (act == GhostFailurePolicy.Act.RollBack)
                        return RollBack(GhostFailurePolicy.RollBackReason(text, severity, failing.Where(i => !Ours.Contains(i)).ToList()));

                    foreach (long id in failing.Where(Ours.Contains)) Why[id] = text;
                    if (act == GhostFailurePolicy.Act.Resolve)
                    {
                        _resolved.Add(key);
                        accessor.ResolveFailure(f);
                        resolved = true;
                    }
                    else delete.UnionWith(GhostFailurePolicy.ToDelete(failing, Ours));
                }

                if (delete.Count > 0) accessor.DeleteElements(delete.Select(i => i.ToElementId()).ToList());
                // ProceedWithCommit re-runs regeneration with the fixes applied and calls this again for what is left.
                return resolved || delete.Count > 0 ? FailureProcessingResult.ProceedWithCommit : FailureProcessingResult.Continue;
            }
            catch (Exception ex)
            {
                // A resolution or deletion Revit refuses: never push the build through half-handled — roll it back, say why.
                return RollBack($"Sentinel could not handle a Revit failure ({ex.GetType().Name}: {ex.Message})");
            }
        }

        private FailureProcessingResult RollBack(string why)
        {
            RolledBack ??= why;
            return FailureProcessingResult.ProceedWithRollBack;
        }

        private static GhostFailurePolicy.Severity Sev(FailureSeverity s) =>
            s == FailureSeverity.Error ? GhostFailurePolicy.Severity.Error
            : s == FailureSeverity.DocumentCorruption ? GhostFailurePolicy.Severity.Corruption
            : GhostFailurePolicy.Severity.Warning;

        private static List<long> Ids(ICollection<ElementId> ids) =>
            ids == null ? new List<long>() : ids.Select(i => i.IdValue()).ToList();
    }
}
```

- [ ] **Step 2: The factory records every element it creates.** In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs`, directly after `        public readonly List<string> CreatedTypes = new List<string>();` (`:87`) add:

```csharp

        /// <summary>Every element this build created, with what it is ("Walls on 'A-WALL-EXT'"): the failure handler's "ours"
        /// and the ids Placed is counted from after the commit (GhostBuilderOrchestrator). Filled at ApplyParams, which every
        /// create site calls with its new element.</summary>
        public readonly List<(ElementId Id, string What)> NewElements = new List<(ElementId Id, string What)>();
```

Replace the first statement of `ApplyParams`, which is `            if (e == null || map?.Params == null || map.Params.Count == 0) return;` (`:448`), with:

```csharp
            // Every create site (Wall.Create, NewFamilyInstance, Floor.Create/NewFloor, Ceiling.Create) passes its new element
            // here: record it as this build's (GHB-5 — the failure handler's "ours", and what Placed is counted from).
            if (e != null) NewElements.Add((e.Id, $"{map?.Category ?? "Element"} on '{map?.CadLayer}'"));
            if (e == null || map?.Params == null || map.Params.Count == 0) return;
```

Replace the wall tallies (`:273-275`)

```csharp
            if (typedBy == "guideline") WallsByGuideline++;
            else if (typedBy == "mapping") WallsByMapping++;
            else WallGaps++; // a massing placeholder: placed, but typed by nobody — reported for retyping
```

with (E8: Revit walls, not CAD elements)

```csharp
            if (typedBy == "guideline") WallsByGuideline += placed;
            else if (typedBy == "mapping") WallsByMapping += placed;
            else WallGaps += placed; // a massing placeholder: placed, but typed by nobody — reported for retyping
```

- [ ] **Step 3: The report carries ids and what Revit did.** In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`:
  - Replace `            public int Placed;` (`:318`) with:

```csharp
            /// <summary>This build's elements that exist AFTER the commit — counted by GhostBuilderOrchestrator from NewElements
            /// (GHB-5): never before the commit, never per CAD element (a closed loop of 4 walls is 4).</summary>
            public int Placed;
```

  - Replace `            public int TypeGaps;` (`:330`) with:

```csharp
            public int TypeGaps;
            /// <summary>Every element this build created, with what it is ("Walls on 'A-WALL-EXT'") — the failure handler's
            /// "ours" and the ids Placed is counted from.</summary>
            public readonly List<(ElementId Id, string What)> NewElements = new List<(ElementId Id, string What)>();
            /// <summary>This build's elements gone after the commit, each "what — the Revit failure that named it".</summary>
            public readonly List<string> DeletedByRevit = new List<string>();
            /// <summary>Revit warnings the build raised, counted by text — left in the model, never erased ([BP] P1-3).</summary>
            public readonly Dictionary<string, int> RevitWarnings = new Dictionary<string, int>();
            /// <summary>Set when Revit did not commit the build: why. Nothing exists then, and nothing else here is true.</summary>
            public string RolledBack;
```

  - Replace `                    case ElementPlacementFactory.Outcome.Placed:             report.Placed++; break;` (`:385`) with:

```csharp
                    // Outcome.Placed is not counted here: Placed is what exists after the commit (GhostBuilderOrchestrator).
```

  - After `            report.WallGaps = factory.WallGaps;` (`:397`) add:

```csharp
            report.NewElements.AddRange(factory.NewElements);
```

- [ ] **Step 4: The orchestrator wires the ids, checks the commit and recounts.** In `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs`:
  - After `        private readonly bool _placeholderTypes;      // massing: default types + a note instead of skipping` (`:32`) add:

```csharp

        /// <summary>The Ghost transaction's name (DWG and massing) — also how the global Doctor (FailureInterceptor) knows to
        /// leave this build's warnings alone ([BP] P1-3). Unchanged; step 2 renames it with the changeset.</summary>
        public const string TxName = "Ghost Builder - LOD 200";
```

  - Replace the method from `        public GhostPlacementEngine.PlacementReport PlacePrepared(` through its closing brace (`:135-189`; the doc comment above it stays) with:

```csharp
        public GhostPlacementEngine.PlacementReport PlacePrepared(
            System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null)
        {
            if (mapping?.Mappings == null || mapping.Mappings.Count == 0)
                return new GhostPlacementEngine.PlacementReport { Warnings = { "Nothing to build." } };

            using var t = new Transaction(_doc, TxName);
            t.Start();

            // MA-1a (GHB-5): the creation failures a bulk dirty-CAD build raises at commit are handled by GhostFailureHandler —
            // only THIS build's elements (handler.Ours, filled below just before Commit) are ever resolved or deleted; a failure
            // that names none of them rolls the build back; warnings are counted and left to Revit. Non-modal: the warnings
            // Revit keeps are shown the ordinary, dismissable way. Silent: no dialog after a rollback the handler chose.
            var handler = new GhostFailureHandler();
            FailureHandlingOptions fho = t.GetFailureHandlingOptions();
            fho.SetFailuresPreprocessor(handler);
            fho.SetClearAfterRollback(true);
            fho.SetForcedModalHandling(false);
            t.SetFailureHandlingOptions(fho);
            GhostPlacementEngine.PlacementReport report;
            try
            {
                // Load any mapped families missing from the doc, THEN regenerate, THEN build the
                // engine — the engine caches the doc's families/types/levels in its constructor,
                // so it must be created AFTER preload or the new families won't be in its cache.
                // Both loads and placement share this one transaction: a failure rolls back atomically.
                GhostFamilyPreloader.PreloadReport pre = null;
                if (_familyLibraryDir != null)
                {
                    pre = new GhostFamilyPreloader(_doc, _familyLibraryDir).Preload(mapping);
                    if (pre.Loaded > 0) _doc.Regenerate(); // make new symbols visible to the collector
                }

                // Wall and floor types are system families (not loadable) — a mapped type the doc lacks is created from
                // its catalogue sibling, or reported as a gap. Same transaction, before the engine caches types.
                var wallProv = new GhostWallTypeProvisioner(_doc, _guideline).Provision(mapping);
                if (wallProv.Created > 0) _doc.Regenerate();

                var floorProv = new GhostFloorTypeProvisioner(_doc, _guideline).Provision(mapping);
                if (floorProv.Created > 0) _doc.Regenerate();

                var engine = new GhostPlacementEngine(_doc, _minConfidence, _guideline, level, _placeholderTypes);
                report = engine.Place(mapping, elements);
                report.TypeGaps = wallProv.Gaps + floorProv.Gaps;
                report.Warnings.InsertRange(0, floorProv.Warnings);
                report.Warnings.InsertRange(0, wallProv.Warnings);
                if (pre != null) report.Warnings.InsertRange(0, pre.Warnings);

                foreach (var (id, _) in report.NewElements) handler.Ours.Add(id.IdValue());
                TransactionStatus status = t.Commit();
                // Failure processing can roll the build back WITHOUT throwing (ChangesetExecutor checks the same): then
                // nothing this transaction made exists — no element, type or family — and the report says only that.
                if (status != TransactionStatus.Committed)
                    return new GhostPlacementEngine.PlacementReport
                    { RolledBack = handler.RolledBack ?? $"Revit did not commit the build (transaction status {status})" };

                // Placed is what survived the commit, counted from this build's own ids; each one Revit removed is named
                // with the failure that named it, and a warning that named it went with it (not counted).
                var gone = new HashSet<long>();
                foreach (var (id, what) in report.NewElements)
                {
                    if (_doc.GetElement(id) != null) { report.Placed++; continue; }
                    gone.Add(id.IdValue());
                    report.DeletedByRevit.Add(what + " — " +
                        (handler.Why.TryGetValue(id.IdValue(), out string why) ? why : "removed by Revit at commit"));
                }
                foreach (var kv in GhostFailurePolicy.CountWarnings(handler.SeenWarnings, gone)) report.RevitWarnings[kv.Key] = kv.Value;
            }
            catch
            {
                if (t.HasStarted() && !t.HasEnded()) t.RollBack();
                throw;
            }

            return report;
        }
```

- [ ] **Step 5: The Doctor leaves Ghost's warnings alone (E1).** In `SentinelAddin/Updaters/FailureInterceptor.cs`, replace

```csharp
    private static FailureProcessingResult Process(FailuresAccessor accessor)
    {
        bool resolvedAny = false;
```

with

```csharp
    private static FailureProcessingResult Process(FailuresAccessor accessor)
    {
        // Ghost Builder counts its own warnings and leaves them in the model ([BP] P1-3, GHB-5): the Doctor does not erase them.
        if (accessor.GetTransactionName() == Sentinel.GhostBuilder.GhostBuilderOrchestrator.TxName) return FailureProcessingResult.Continue;
        bool resolvedAny = false;
```

- [ ] **Step 6: Build and re-run the check.** Run both builds; expect `0 Error(s)` for each. Run `dotnet run --project tools/ghost-p2-check`; expect `60/60 checks pass` (no new offline check: the wiring is proven by drill rows S1-3, S1-5 and S1-6).
- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostFailureHandler.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Updaters/FailureInterceptor.cs
git commit -F - <<'EOF'
fix(ghost): the failure handler touches only this build's elements; Placed counted after commit from surviving ids (MA-1a GHB-5)

An error naming a user's element deletes only this build's elements in it (or rolls the build back when it names none of
them); Revit's resolution only for failures naming nothing but this build's elements, once; warnings counted, never erased,
and skipped by the Doctor; the commit status is checked; Placed = this build's ids alive after the commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3 — No symbol fallback: the one loaded family type a row names, or a gap

**Files:**
- Create `SentinelAddin/GhostBuilder/GhostTypePick.cs`
- Modify `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (`:32`, `:42-49`, `:54`, `:64`, `:119`, `:220`, `:298-362`, `:389`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`:274`, `:294-297`, `:349-350`)
- Modify `tools/ghost-p2-check/Honest.cs` and `tools/ghost-p2-check/ghost-p2-check.csproj`

**Interfaces:**
- Consumes: the factory's `Notes`, `_placeholderTypes` and `_doc`; `public static BuiltInCategory Sentinel.Compat.ResolveCategoryKey(string englishKey)` (`SentinelAddin/Compat.cs`, INVALID when unknown — it replaces `FallbackSymbol`'s own category switch).
- Produces:
  - `public static int GhostTypePick.Pick(IReadOnlyList<(string Family, string Type)> loaded, string category, string family, string type, out string why)`, which returns an index or -1;
  - the new constructor `ElementPlacementFactory(Document doc, Level level, IReadOnlyDictionary<string, WallType> wallTypes, IReadOnlyDictionary<string, FloorType> floorTypes = null, IReadOnlyDictionary<string, ElementType> ceilingTypes = null, GuidelineMatcher guideline = null, bool placeholderTypes = false)`, with the `symbols` parameter removed;
  - `private Outcome PlaceFamilyInstance(GhostElement el, string category, LayerMapping map, out string warning)`.

- [ ] **Step 1: Create `SentinelAddin/GhostBuilder/GhostTypePick.cs`**

```csharp
#nullable disable
// MA-1a step 1: the one loaded family type a Ghost row names — exact, or a person (D16). Pure (family and type names), so
// ghost-p2-check proves it without Revit. The rule of ChangesetExecutor.CreateType (exact name, the family when given; none →
// a gap; more than one → a person decides) plus the row a layers@n standard produces: a family with no type names its ONLY
// type. Never the first one loaded — the fallback this replaces (ElementPlacementFactory.FallbackSymbol, audit GHB).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public static class GhostTypePick
    {
        /// <summary>The index in <paramref name="loaded"/> (one category's family types) of the one the row names, or -1 with
        /// <paramref name="why"/> in words. Names compare as Revit's do: case- and space-insensitive.</summary>
        public static int Pick(IReadOnlyList<(string Family, string Type)> loaded, string category, string family, string type, out string why)
        {
            why = null;
            bool f = !string.IsNullOrWhiteSpace(family), t = !string.IsNullOrWhiteSpace(type);
            if (!f && !t)
            {
                why = $"the layer mapping names no {category} family or type — Sentinel never takes the first one loaded; pick one in the review";
                return -1;
            }
            var hits = Enumerable.Range(0, loaded?.Count ?? 0)
                .Where(i => (!f || Same(loaded[i].Family, family)) && (!t || Same(loaded[i].Type, type)))
                .ToList();
            if (hits.Count == 1) return hits[0];
            string label = f && t ? $"{family} : {type}" : f ? family : type;
            if (hits.Count == 0)
                why = f && !t
                    ? $"{category} family \"{family}\" is not loaded in this model — load it or set the Ghost family library"
                    : $"{category} type \"{label}\" is not loaded in this model — load it or pick a loaded type in the review";
            else
                why = f && !t
                    ? $"{category} family \"{family}\" has {hits.Count} types — pick one in the review"
                    : $"{hits.Count} {category} types are named \"{label}\" — a person decides (pick one in the review)";
            return -1;
        }

        private static bool Same(string a, string b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
```

- [ ] **Step 2: Add the pick checks.** In `tools/ghost-p2-check/Honest.cs`, change the `Honest()` body to call both methods:

```csharp
    static void Honest()
    {
        Policy();
        TypePick();
    }
```

and append this method inside `static partial class Check`, after `Policy()`:

```csharp
    // ── the family-type pick: exact (category, family, type), or a gap a person resolves — never the first one loaded ──
    static void TypePick()
    {
        Console.WriteLine("\nMA-1a — the family type a row names (GhostTypePick)");
        var doors = new List<(string Family, string Type)>
        {
            ("Single-Flush", "0915 x 2134mm"), ("Single-Flush", "0864 x 2134mm"), ("Double-Glass", "0915 x 2134mm"), ("Bifold", "Standard"),
        };
        int P(string? family, string? type, out string? why) => GhostTypePick.Pick(doors, "Doors", family!, type!, out why);

        Ok(P("Single-Flush", "0864 x 2134mm", out _) == 1, "family and type → that one type");
        Ok(P(" single-flush ", "0864 X 2134MM", out _) == 1, "names compare as Revit's do: case- and space-insensitive");
        Ok(P(null, "0915 x 2134mm", out var shared) == -1 && shared == "2 Doors types are named \"0915 x 2134mm\" — a person decides (pick one in the review)",
           "a type name two families share is a person's call, never the first family's");
        Ok(P(null, "Standard", out _) == 3, "a type name only one family has → that type");
        Ok(P("Bifold", null, out _) == 3, "a family with no type named → its ONLY type");
        Ok(P("Single-Flush", null, out var many) == -1 && many == "Doors family \"Single-Flush\" has 2 types — pick one in the review",
           "a family with two types and none named → a gap, never its first type");
        Ok(P("Generic_Door", null, out var missing) == -1 && missing == "Doors family \"Generic_Door\" is not loaded in this model — load it or set the Ghost family library",
           "the base standard's Generic_Door, not loaded → a gap, never another door family (the old fallback)");
        Ok(P(null, null, out var nothing) == -1 && nothing == "the layer mapping names no Doors family or type — Sentinel never takes the first one loaded; pick one in the review",
           "a row that names nothing → a gap");
        Ok(GhostTypePick.Pick(new List<(string Family, string Type)>(), "Doors", "Single-Flush", "0864 x 2134mm", out var none) == -1
           && none == "Doors type \"Single-Flush : 0864 x 2134mm\" is not loaded in this model — load it or pick a loaded type in the review",
           "nothing loaded → a gap naming family and type");
    }
```

In `tools/ghost-p2-check/ghost-p2-check.csproj`, after the `GhostFailurePolicy.cs` line, add:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostTypePick.cs" />
```

- [ ] **Step 3: Remove the name-only symbol cache from the engine.** In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs`:
  - delete the line `        private readonly Dictionary<string, FamilySymbol> _symbols;` (`:274`);
  - delete the statement (`:294-297`) and the blank line after it:

```csharp
            _symbols = new FilteredElementCollector(doc)
                .OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>()
                .GroupBy(s => s.Name).ToDictionary(g => g.Key, g => g.First(),
                         StringComparer.OrdinalIgnoreCase);
```

  - replace the factory construction (`:349-350`)

```csharp
            var factory = new ElementPlacementFactory(
                _doc, _defaultLevel, _wallTypes, _symbols, _floorTypes, _ceilingTypes, _guideline, _placeholderTypes);
```

with

```csharp
            var factory = new ElementPlacementFactory(
                _doc, _defaultLevel, _wallTypes, _floorTypes, _ceilingTypes, _guideline, _placeholderTypes);
```

- [ ] **Step 4: The factory picks exactly, or skips.** In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs`:
  - delete `        private readonly IReadOnlyDictionary<string, FamilySymbol> _symbols;` (`:32`), the constructor parameter line `            IReadOnlyDictionary<string, FamilySymbol> symbols,` (`:54`), and `            _symbols = symbols ?? new Dictionary<string, FamilySymbol>();` (`:64`);
  - replace `:42-49`

```csharp
        // Massing is an LOD 100 estimate: when the office standard has no type for a wall or floor, place it
        // with the template's DEFAULT type and say so, rather than placing nothing (simulation 3.9, F43 —
        // every wall was skipped on a template without the pilot's type names). The DWG path keeps the
        // strict behaviour: a mis-typed wall there is a real defect, a placeholder box here is the point.
        private readonly bool _placeholderTypes;

        private T DefaultType<T>(ElementTypeGroup group, IReadOnlyDictionary<string, T> cache) where T : ElementType =>
            (_doc.GetElement(_doc.GetDefaultElementTypeId(group)) as T) ?? cache.Values.FirstOrDefault();
```

with

```csharp
        // Massing is an LOD 100 estimate: when the office standard has no type for a wall, floor, door or window, place it
        // with the template's DEFAULT type and say so, rather than placing nothing (simulation 3.9, F43 —
        // every wall was skipped on a template without the pilot's type names). The DWG path keeps the
        // strict behaviour: a mis-typed element there is a real defect, a placeholder box here is the point.
        private readonly bool _placeholderTypes;

        // The document's default type of a group (the template's), or null — never the model's first type (D16, MA-1a).
        private T DefaultType<T>(ElementTypeGroup group) where T : ElementType =>
            _doc.GetElement(_doc.GetDefaultElementTypeId(group)) as T;
```

  - replace `                    return PlaceFamilyInstance(el, wanted, map.Category, map, out warning);` (`:119`) with `                    return PlaceFamilyInstance(el, map.Category, map, out warning);`;
  - replace `                var ph = DefaultType(ElementTypeGroup.WallType, _wallTypes);` (`:220`) with `                var ph = DefaultType<WallType>(ElementTypeGroup.WallType);`;
  - replace `                ft = DefaultType(ElementTypeGroup.FloorType, _floorTypes);` (`:389`) with `                ft = DefaultType<FloorType>(ElementTypeGroup.FloorType);`;
  - replace everything from `        // ---- Point families (doors/windows/columns/furniture): stable API, no #if ----` (`:298`) through the closing brace of `FallbackSymbol` (`:362`) with:

```csharp
        // ---- Point families (doors/windows/columns/furniture): stable API, no #if ----
        private Outcome PlaceFamilyInstance(GhostElement el, string category, LayerMapping map, out string warning)
        {
            warning = null;

            // A block insert carries an insertion point directly; a symbol drawn as a closed outline
            // (e.g. a column square) carries a loop instead — use its centroid so it still places.
            XYZ pt = el.LocationPoint ?? Centroid(el.LocationLoop);
            if (pt == null) return Outcome.SkippedNoGeometry;

            // The ONE loaded (family, type) the row names, among this category's types only (GhostTypePick: exact, or a gap a
            // person resolves in the review) — never a symbol of another category that shares the type name, never the first
            // one loaded. Massing (LOD 100) alone may use the category's DEFAULT family type, declared in a Note like its walls.
            List<FamilySymbol> syms = SymbolsOf(category);
            int i = GhostTypePick.Pick(syms.Select(s => (s.FamilyName, s.Name)).ToList(), category, map.BdsFamily, map.BdsFamilyType, out string why);
            FamilySymbol sym = i >= 0 ? syms[i] : null;
            if (sym == null && _placeholderTypes)
            {
                sym = DefaultSymbol(category);
                if (sym != null)
                    Notes.Add($"Placeholder {category} type '{sym.FamilyName} : {sym.Name}' (the template's default) used on '{el.CadLayer}' — the massing names no {category} type. Retype before issue.");
            }
            if (sym == null)
            {
                warning = $"{category} on '{el.CadLayer}': {why}; skipped.";
                return Outcome.SkippedUnknownType;
            }

            if (!sym.IsActive) sym.Activate(); // inactive symbols throw on NewFamilyInstance
            ApplyParams(_doc.Create.NewFamilyInstance(pt, sym, _level, StructuralType.NonStructural), map);
            return Outcome.Placed;
        }

        private static XYZ Centroid(IList<Curve> loop)
        {
            if (loop == null || loop.Count == 0) return null;
            double x = 0, y = 0, z = 0; int n = 0;
            foreach (Curve c in loop)
            {
                if (c == null || !c.IsBound) continue;
                XYZ p = c.GetEndPoint(0);
                x += p.X; y += p.Y; z += p.Z; n++;
            }
            return n > 0 ? new XYZ(x / n, y / n, z / n) : null;
        }

        private readonly Dictionary<string, List<FamilySymbol>> _symbolsByCategory =
            new Dictionary<string, List<FamilySymbol>>(StringComparer.OrdinalIgnoreCase);

        // The loaded family types of one point-family category, read once per build (after the preloader ran). The
        // category key → BuiltInCategory map is Compat's (locale-safe), not a second switch.
        private List<FamilySymbol> SymbolsOf(string category)
        {
            string key = category ?? "";
            if (_symbolsByCategory.TryGetValue(key, out List<FamilySymbol> cached)) return cached;
            BuiltInCategory bic = Compat.ResolveCategoryKey(key);
            var syms = bic == BuiltInCategory.INVALID ? new List<FamilySymbol>()
                : new FilteredElementCollector(_doc).OfCategory(bic).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().ToList();
            _symbolsByCategory[key] = syms;
            return syms;
        }

        // Massing only: the category's default family type in this document (the template's), or null.
        private FamilySymbol DefaultSymbol(string category)
        {
            BuiltInCategory bic = Compat.ResolveCategoryKey(category ?? "");
            return bic == BuiltInCategory.INVALID ? null
                : _doc.GetElement(_doc.GetDefaultFamilyTypeId(new ElementId(bic))) as FamilySymbol;
        }
```

(The class comment at `:17-19` now holds true and stays as it is.)

- [ ] **Step 5: Run the check and the builds.** `dotnet run --project tools/ghost-p2-check` should print 9 new `PASS` lines and end `69/69 checks pass`. Both builds should report `0 Error(s)`. Then `grep -n "_symbols\b\|FallbackSymbol(\|cache.Values.FirstOrDefault" SentinelAddin/GhostBuilder/*.cs` should print nothing (on master it prints 9 lines).
- [ ] **Step 6: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostTypePick.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs tools/ghost-p2-check/Honest.cs tools/ghost-p2-check/ghost-p2-check.csproj
git commit -F - <<'EOF'
fix(ghost): no symbol fallback — the one loaded family type a row names, or a gap (MA-1a)

Symbols resolved per category by exact (family, type) via GhostTypePick; the name-only first-wins cache and
FallbackSymbol are gone; massing openings use the template's default type, declared; DefaultType never takes the first type.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4 — The summaries say what Revit did and what the build added

**Files:**
- Modify `SentinelAddin/GhostBuilder/GhostWallTypeProvisioner.cs` (`:36`, `:67`)
- Modify `SentinelAddin/GhostBuilder/GhostFloorTypeProvisioner.cs` (`:31`, `:58`)
- Modify `SentinelAddin/GhostBuilder/GhostFamilyPreloader.cs` (`:32`, `:82`)
- Modify `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs` (inside `PlacePrepared`, after the three `Warnings.InsertRange` lines)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (the `CreatedTypes` doc comment)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:367-398`)
- Modify `SentinelAddin/Commands.Massing.cs` (`:105-127`)

**Interfaces:**
- Consumes: Task 1's `PlacedLine`, `WarningsLine` and `NotBuiltLine`, and Task 2's report fields.
- Produces:
  - `GhostWallTypeProvisioner.ProvisionReport.CreatedNames : List<string>` and `GhostFloorTypeProvisioner.ProvisionReport.CreatedNames : List<string>`;
  - `GhostFamilyPreloader.PreloadReport.LoadedNames : List<string>`;
  - `PlacementReport.CreatedTypes` now also names provisioner types and preloaded families.

- [ ] **Step 1: The provisioners and the preloader name what they made.**
  - `GhostWallTypeProvisioner.cs`: after `            public readonly List<string> Warnings = new List<string>();` (`:36`) add `            public readonly List<string> CreatedNames = new List<string>();`. Then replace `                    report.Created++;` (`:67`) with:

```csharp
                    report.Created++;
                    report.CreatedNames.Add(name);
```

  - `GhostFloorTypeProvisioner.cs`: make the same two edits at `:31` and `:58`.
  - `GhostFamilyPreloader.cs`: after `            public readonly List<string> Warnings = new List<string>();` (`:32`) add `            public readonly List<string> LoadedNames = new List<string>();`. Then replace `                    report.Loaded++;` (`:82`) with:

```csharp
                    report.Loaded++;
                    report.LoadedNames.Add(loaded.Name);
```

- [ ] **Step 2: The orchestrator folds the names into the report.** In `PlacePrepared`, after `                if (pre != null) report.Warnings.InsertRange(0, pre.Warnings);` add:

```csharp
                // What this build added to the model's type library before placing — named, not just counted (GHB-5: the
                // review showed the forecast; this is what actually happened).
                report.CreatedTypes.InsertRange(0, floorProv.CreatedNames.Select(n => $"{n} (floor type the layer mapping names)"));
                report.CreatedTypes.InsertRange(0, wallProv.CreatedNames.Select(n => $"{n} (wall type the layer mapping names)"));
                if (pre != null) report.CreatedTypes.InsertRange(0, pre.LoadedNames.Select(n => $"family {n} (loaded from the Ghost family library)"));
```

In `GhostBuilder_ExtractionAndPlacement.cs`, replace `            /// <summary>Types this build created to fill a guideline gap (office standard extended by a size).</summary>` with `            /// <summary>Types and families this build added to the model: families loaded, wall and floor types the mapping names, guideline-gap sizes.</summary>`.

- [ ] **Step 3: Ghost summary.** In `SentinelAddin/Commands.GhostBuilder.cs`, replace the whole `Summarize` method (`:367-398`) with:

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        // What this build was mapped and typed by, first — the review window's header, repeated.
        lines.AppendLine(s.Header);
        if (s.CatalogSource.Origin == "none") lines.AppendLine(CatalogueNotChecked(s));
        lines.AppendLine();
        // Revit did not commit (the failure handler rolled back, or the commit failed): nothing exists, nothing else is true.
        if (r.RolledBack != null) return lines.AppendLine(GhostFailurePolicy.NotBuiltLine(r.RolledBack)).ToString();
        // GHB-5: Placed is what exists after the commit; what Revit removed is named with the failure that named it.
        lines.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
        lines.AppendLine(WallsLine(r, s));
        if (r.TypeGaps > 0) lines.AppendLine($"Types: {r.TypeGaps} named by the layer mapping not created (each named below with its reason)");
        if (r.SkippedLowConfidence > 0) lines.AppendLine($"Skipped (low confidence): {r.SkippedLowConfidence}");
        if (r.SkippedUnknownFamily > 0) lines.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
        if (r.SkippedNoGeometry > 0)    lines.AppendLine($"Skipped (no geometry): {r.SkippedNoGeometry}");
        var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
        if (revitWarnings != null) lines.AppendLine(revitWarnings);
        if (r.CreatedTypes.Count > 0)
        {
            // The office type library was extended — show it plainly; this is a deliberate change to the model's
            // type library, not a placement side-effect.
            lines.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
            foreach (var t in r.CreatedTypes) lines.AppendLine($"  + {t}");
        }
        if (r.Warnings.Count > 0)
        {
            // Collapse identical warnings (a dirty layer can skip tens of thousands of elements for
            // the same reason) into one line with a count, most frequent first — otherwise the dialog
            // is an unreadable wall of duplicates.
            lines.AppendLine().AppendLine("Warnings:");
            foreach (var g in r.Warnings.GroupBy(w => w).OrderByDescending(g => g.Count()))
                lines.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        return lines.ToString();
    }
```

- [ ] **Step 4: Massing summary.** In `SentinelAddin/Commands.Massing.cs`, replace the whole `Summarize` method (`:105-127`) with:

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
        sb.AppendLine();
        if (r.RolledBack != null) return sb.AppendLine(GhostFailurePolicy.NotBuiltLine(r.RolledBack)).ToString();
        sb.AppendLine(GhostFailurePolicy.PlacedLine(r.Placed, r.DeletedByRevit));
        sb.AppendLine(GhostBuilderCommand.WallsLine(r, s));
        if (r.SkippedUnknownFamily > 0) sb.AppendLine($"Skipped (type or family not in the model): {r.SkippedUnknownFamily}");
        var revitWarnings = GhostFailurePolicy.WarningsLine(r.RevitWarnings);
        if (revitWarnings != null) sb.AppendLine(revitWarnings);
        if (r.CreatedTypes.Count > 0)
        {
            sb.AppendLine().AppendLine($"Added {r.CreatedTypes.Count} type(s) or family(ies) to the model:");
            foreach (var t in r.CreatedTypes) sb.AppendLine($"  + {t}");
        }
        if (r.Warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Notes:");
            foreach (var g in r.Warnings.GroupBy(w => w).OrderByDescending(g => g.Count()))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        return sb.ToString();
    }
```

- [ ] **Step 5: Builds.** Both should report `0 Error(s)`. `dotnet run --project tools/ghost-p2-check` should still end `69/69 checks pass`.
- [ ] **Step 6: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostWallTypeProvisioner.cs SentinelAddin/GhostBuilder/GhostFloorTypeProvisioner.cs SentinelAddin/GhostBuilder/GhostFamilyPreloader.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/Commands.Massing.cs
git commit -F - <<'EOF'
feat(ghost): the build summary says what Revit did — deleted, warnings kept, rolled back, types added (MA-1a GHB-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5 — Review: a type drop-down per row, "(ignore)", copies out, and the types-to-be-added forecast

**Files:**
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs` (`:30-34`)
- Modify `SentinelAddin/UI/GhostReviewWindow.cs` (`:32`, `:56-67`, `:76`, `:113`, `:122-125`, `:150-157`, `:185-203`, `:231`, `:244-245`, `:257`, `:276-294`)
- Modify `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (`:89-92`, `:138`, the wall tallies)
- Modify `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (the `WallsBy…` field, after `report.WallsByMapping = …`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:228`, `:313`, `:350-360`, and a new `LoadedTypes`)
- Modify `tools/ghost-p2-check/Honest.cs`

**Interfaces:**
- Consumes: `LayerMapping` and `MappingResult`, plus the command's `doc`.
- Produces:
  - On `LayerMapping`: `bool Ignore { get; set; }` (JSON `ignore`) and `LayerMapping Copy()`.
  - On `GhostReviewWindow`:
    - `void LoadTypes(IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> byCategory)`;
    - `void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer, string targetLabel, string standardsHeader, double preTickAbove = 0.5, bool guided = false)`;
    - `IReadOnlyList<LayerMapping> Choices { get; }`;
    - `internal IReadOnlyList<(CheckBox Box, ComboBox Type, LayerMapping Map)> Rows`;
    - `internal string ForecastText`;
    - `internal static List<string> TypesToCreate(IReadOnlyList<LayerMapping> ticked, IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> loaded, bool guided)`.
  - `ElementPlacementFactory.WallsByReviewer` and `PlacementReport.WallsByReviewer`.
  - `private static Dictionary<string, IReadOnlyList<(string? Family, string Type)>> GhostBuilderCommand.LoadedTypes(Document doc)`.

- [ ] **Step 1: `LayerMapping` can be ignored and copied.** In `GhostBuilder_Architecture.cs`, replace

```csharp
        /// <summary>Which tier produced this mapping (LayerMapper): "standard" (a row or alias of the project's
        /// installed layers@n — the only source the review pre-ticks), "heuristic" (an AIA major or keyword guess),
        /// "llm" (the local model), "cache" (the local model's answer remembered for this project under the same
        /// layers sha) or "unmapped" (the local model could not be reached; Rationale says so).</summary>
        [JsonPropertyName("source")]        public string Source { get; set; } = "llm";
```

with

```csharp
        /// <summary>Which tier produced this mapping (LayerMapper): "standard" (a row or alias of the project's
        /// installed layers@n — the only source the review pre-ticks), "heuristic" (an AIA major or keyword guess),
        /// "llm" (the local model), "cache" (the local model's answer remembered for this project under the same
        /// layers sha), "reviewer" (a type the reviewer picked in the review, or "(ignore)" — GHB-5, remembered too)
        /// or "unmapped" (the local model could not be reached; Rationale says so).</summary>
        [JsonPropertyName("source")]        public string Source { get; set; } = "llm";

        /// <summary>The reviewer chose "(ignore)" (Source "reviewer"): this layer is never built, and the choice is remembered.</summary>
        [JsonPropertyName("ignore")]        public bool Ignore { get; set; }

        /// <summary>A copy the review may change without touching the mapper's own row (LayerMapper keeps its model answers by
        /// reference). Params is shared: nothing edits it after the proposal.</summary>
        public LayerMapping Copy() => (LayerMapping)MemberwiseClone();
```

- [ ] **Step 2: The review window.** In `SentinelAddin/UI/GhostReviewWindow.cs`:

  (a) Replace `    private readonly List<(CheckBox Box, LayerMapping Map)> _rows = new();` (`:32`) with:

```csharp
    private readonly List<(CheckBox Box, ComboBox Type, LayerMapping Map)> _rows = new();
    // GHB-5: the types loaded in the model per category (LoadTypes), what the ticked rows will add (the forecast), and whether
    // a guideline is installed (a measured wall may then get a type at Build that no row names).
    private IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> _types =
        new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>();
    private readonly TextBlock _forecast = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private bool _guided;

    /// <summary>The reviewer's choices — a loaded type picked, or "(ignore)" — ticked or not, as copies with Source "reviewer":
    /// what the command hands LayerMapper.Remember when the review builds or closes (GHB-5).</summary>
    public IReadOnlyList<LayerMapping> Choices =>
        _rows.Select(r => Effective(r.Map, r.Type.SelectedItem as TypeItem)).Where(m => m.Source == "reviewer").ToList();
```

  (b) In `SourceNote`, add a case after `        "cache" => "  · local model (remembered)",`:

```csharp
        "reviewer" => "  · your earlier review",
```

  (c) After `    internal string StandardsLine => _standards.Text;` add:

```csharp
    /// <summary>The rows and the forecast as shown (for the harness).</summary>
    internal IReadOnlyList<(CheckBox Box, ComboBox Type, LayerMapping Map)> Rows => _rows;
    internal string ForecastText => _forecast.Text;
```

  (d) After the `LevelChoice` class (its closing `    }` at `:76`) add:

```csharp

    // One entry of a row's type drop-down: the row as proposed, a type loaded in this model, or "(ignore)". A plain class (net48).
    private sealed class TypeItem
    {
        public TypeItem(string label, string? family, string? type, bool ignore = false, bool proposed = false)
        {
            Label = label; Family = family; Type = type; Ignore = ignore; Proposed = proposed;
        }
        public string Label { get; }
        public string? Family { get; }
        public string? Type { get; }
        public bool Ignore { get; }
        public bool Proposed { get; }
        public override string ToString() => Label;
    }
```

  (e) Replace `            Text = "Nothing has been built yet. Tick the layers to build, then Build.",` (`:113`) with `            Text = "Nothing has been built yet. Tick the layers to build — pick a type or (ignore) where the proposal is wrong — then Build.",`.

  (f) Replace `            (top, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),` (`:124`) with `            (top, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom), (_forecast, Dock.Bottom),`.

  (g) Replace the `Load` signature and its first statement (`:150-153`)

```csharp
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, string standardsHeader, double preTickAbove = 0.5) => Dispatcher.Invoke(() =>
    {
        _standards.Text = standardsHeader;
```

with

```csharp
    /// <param name="guided">A guideline is installed: the forecast says measured walls may get a type made at Build.</param>
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, string standardsHeader, double preTickAbove = 0.5, bool guided = false) => Dispatcher.Invoke(() =>
    {
        _guided = guided;
        _standards.Text = standardsHeader;
```

  (h) Replace the row-label block, from `                string type = m.BdsFamilyType ?? m.BdsFamily ?? "(no type)";` through `                line1.Children.Add(badge);` (`:185-203`), with:

```csharp
                // GHB-5: the type is a choice, not a label — as proposed, any type of this category loaded in the model, or
                // "(ignore)" (never built; remembered). A remembered ignore comes back selected, its box unticked and locked.
                var pick = new ComboBox
                {
                    MinWidth = 220, Margin = new Thickness(6, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                foreach (TypeItem item in ItemsFor(m)) pick.Items.Add(item);
                pick.SelectedIndex = m.Ignore ? pick.Items.Count - 1 : 0;
                void Lock()
                {
                    bool ignore = (pick.SelectedItem as TypeItem)?.Ignore == true;
                    if (ignore) cb.IsChecked = false;
                    cb.IsEnabled = !ignore;
                }
                Lock();
                pick.SelectionChanged += (_, __) => { Lock(); UpdateStatus(); };

                string suffix = SourceNote(m.Source) + (absurd ? "  ⚠ high count — likely annotation" : "");
                var name = new TextBlock
                {
                    Text = $"{m.CadLayer}  →",
                    Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                var count = new TextBlock
                {
                    Text = $"·   {n:N0} element(s){suffix}",
                    Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };
                var badge = new TextBlock
                {
                    Text = $"{Badge(m.Confidence)} {m.Confidence:0.0}",
                    Foreground = BadgeBrush(m.Confidence), VerticalAlignment = VerticalAlignment.Center,
                    FontWeight = FontWeights.Normal,
                };

                var line1 = new StackPanel { Orientation = Orientation.Horizontal };
                line1.Children.Add(cb);
                line1.Children.Add(name);
                line1.Children.Add(pick);
                line1.Children.Add(count);
                line1.Children.Add(badge);
```

  (i) Replace `                _rows.Add((cb, m));` (`:231`) with `                _rows.Add((cb, pick, m));`.

  (j) Replace the status sentence (`:244-245`)

```csharp
        _status.Text = $"{_rows.Count} layer(s), {totalElements:N0} element(s) proposed for '{targetLabel}'. " +
                       "Only rows of the installed layers standard start ticked; heuristic, local-model, unmapped and high-count rows start unticked — review before building.";
```

with

```csharp
        _status.Text = $"{_rows.Count} layer(s), {totalElements:N0} element(s) proposed for '{targetLabel}'. " +
                       "Only rows of the installed layers standard start ticked; heuristic, local-model, unmapped and high-count rows start unticked — review before building. " +
                       "A type you pick, or (ignore), is remembered for this project when you Build or close.";
```

  (k) After the closing `    });` of `LoadLevels` (`:257`) add:

```csharp

    /// <summary>The types loaded in the model, per mapping category — Walls (basic), Floors and Ceilings by name; Doors,
    /// Windows, Columns and Furniture as family : type — read on the API thread: what each row's drop-down offers. Call
    /// before Load.</summary>
    public void LoadTypes(IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> byCategory) =>
        _types = byCategory ?? new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>();

    // A row's drop-down: the row as proposed (absent for a remembered ignore), each loaded type of its category, "(ignore)".
    private List<TypeItem> ItemsFor(LayerMapping m)
    {
        var items = new List<TypeItem>();
        if (!m.Ignore) items.Add(new TypeItem("as proposed: " + TypeLabel(m.BdsFamily, m.BdsFamilyType), m.BdsFamily, m.BdsFamilyType, proposed: true));
        if (m.Category != null && _types.TryGetValue(m.Category, out var loaded))
            foreach (var (family, type) in loaded) items.Add(new TypeItem(TypeLabel(family, type), family, type));
        items.Add(new TypeItem("(ignore)", null, null, ignore: true));
        return items;
    }

    private static string TypeLabel(string? family, string? type) =>
        type == null ? family ?? "(no type)" : family == null ? type : family + " : " + type;

    /// <summary>The row that leaves the window — always a COPY (the mapper's rows, LayerMapper's cache among them, are never
    /// edited): as proposed, or the reviewer's pick (Source "reviewer", that family and type), or ignore (Source "reviewer",
    /// Ignore).</summary>
    private static LayerMapping Effective(LayerMapping m, TypeItem? pick)
    {
        var c = m.Copy();
        if (pick == null || pick.Proposed) return c;
        c.Source = "reviewer";
        c.Confidence = 1.0;
        c.Ignore = pick.Ignore;
        if (!pick.Ignore) { c.BdsFamily = pick.Family; c.BdsFamilyType = pick.Type; }
        c.Rationale = pick.Ignore ? "ignored by the reviewer" : "picked by the reviewer from the types loaded in this model";
        return c;
    }

    // The ticked rows as they would leave the window.
    private List<LayerMapping> Ticked() =>
        _rows.Where(r => r.Box.IsChecked == true).Select(r => Effective(r.Map, r.Type.SelectedItem as TypeItem)).ToList();

    /// <summary>GHB-5, before Build: what the ticked rows will add to the model's type library — a forecast from the rows and
    /// the types already loaded (the summary after Build lists what was added). A wall or floor type the model lacks is
    /// cloned from the type catalogue or reported as a gap (the provisioners); a door, window, column or furniture family it
    /// lacks is loaded from the Ghost family library when that holds the .rfa (the preloader); with a guideline, a measured
    /// wall the model has no type for is made at Build (known only once the walls are paired).</summary>
    internal static List<string> TypesToCreate(IReadOnlyList<LayerMapping> ticked,
        IReadOnlyDictionary<string, IReadOnlyList<(string? Family, string Type)>> loaded, bool guided)
    {
        var lines = new List<string>();
        foreach (LayerMapping m in ticked)
        {
            if (m.Category == null) continue;
            IReadOnlyList<(string? Family, string Type)> have =
                loaded.TryGetValue(m.Category, out var l) ? l : Array.Empty<(string? Family, string Type)>();
            if (m.Category is "Walls" or "Floors")
            {
                string? name = m.BdsFamilyType ?? m.BdsFamily;
                if (name != null && !have.Any(h => Same(h.Type, name)))
                    lines.Add($"{m.Category} type \"{name}\" (layer {m.CadLayer}) — cloned from the type catalogue, or reported as a gap");
            }
            else if (m.Category is "Doors" or "Windows" or "Columns" or "Furniture"
                     && m.BdsFamily != null && !have.Any(h => Same(h.Family, m.BdsFamily)))
                lines.Add($"{m.Category} family \"{m.BdsFamily}\" (layer {m.CadLayer}) — loaded from the Ghost family library if it holds {m.BdsFamily}.rfa, else skipped");
        }
        lines = lines.Distinct().ToList();
        if (guided && ticked.Any(m => m.Category == "Walls"))
            lines.Add("Walls typed by the guideline at a thickness the model lacks — made at Build, each listed in the summary");
        return lines;
    }

    private static bool Same(string? a, string? b) => string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
```

  (l) Replace `UpdateStatus` and `Build` (`:276-294`) with:

```csharp
    private void UpdateStatus()
    {
        var ticked = Ticked();
        _build.IsEnabled = ticked.Count > 0;
        _build.Content = ticked.Count > 0 ? $"Build {ticked.Count} ticked layer(s) ▶" : "Build ticked layers ▶";
        var adds = TypesToCreate(ticked, _types, _guided);
        _forecast.Text = adds.Count == 0
            ? "Types: this build adds no type or family to the model."
            : "Types this build will add to the model (forecast — the summary lists what was added):" + Environment.NewLine
              + string.Join(Environment.NewLine, adds.Select(a => "  + " + a));
    }

    /// <summary>Approve the ticked rows — what the Build button does. Public so the gate's rule
    /// ("only ticked rows leave this window", as copies with the reviewer's picks) is directly checkable without a live Revit.</summary>
    public void Build()
    {
        var ticked = Ticked();
        if (ticked.Count == 0) { _status.Text = "Nothing ticked — tick at least one layer first."; return; }

        _build.IsEnabled = false;              // one build per review; the window closes when it completes
        _status.Text = $"Building {ticked.Count} layer(s)…";
        long levelId = (_levelBox.SelectedItem as LevelChoice)?.Id ?? -1;
        BuildRequested?.Invoke(new MappingResult { Mappings = ticked }, levelId);
    }
```

- [ ] **Step 3: A reviewer's wall type wins (F2) and is counted on its own line.** In `ElementPlacementFactory.cs`:
  - replace `:89-92`

```csharp
        /// <summary>Who typed each wall element — the build summary's three lines: the guideline; the layer mapping
        /// (guideline none, or no measured thickness); nobody — a gap reported as a warning, or a massing placeholder
        /// noted for retyping. A wall skipped for having no geometry is in none of them.</summary>
        public int WallsByGuideline, WallsByMapping, WallGaps;
```

with

```csharp
        /// <summary>Who typed each wall (Revit walls; a skipped CAD wall counts one gap) — the build summary's lines: the
        /// guideline; the layer mapping (guideline none, or no measured thickness); the reviewer (a type picked in the review);
        /// nobody — a gap reported as a warning, or a massing placeholder noted for retyping. A wall skipped for having no
        /// geometry is in none of them.</summary>
        public int WallsByGuideline, WallsByMapping, WallsByReviewer, WallGaps;
```

  - in `ResolveWallType`, directly after its first two statements `            gapReason = null;` and `            typedBy = "mapping";` (`:137-138`; the same `typedBy = "mapping";` text recurs at `:202`, so anchor on both lines), add:

```csharp
            // GHB-5: a type the reviewer picked in the review is used as picked — over the guideline and the mapping — and
            // counted on its own summary line; a person chose it, so nothing re-decides it (founder decision F2).
            if (map.Source == "reviewer" && !string.IsNullOrWhiteSpace(map.BdsFamilyType ?? map.BdsFamily))
            {
                typedBy = "reviewer";
                return map.BdsFamilyType ?? map.BdsFamily;
            }
```

  - replace the tallies from Task 2

```csharp
            if (typedBy == "guideline") WallsByGuideline += placed;
            else if (typedBy == "mapping") WallsByMapping += placed;
            else WallGaps += placed; // a massing placeholder: placed, but typed by nobody — reported for retyping
```

with

```csharp
            if (typedBy == "guideline") WallsByGuideline += placed;
            else if (typedBy == "mapping") WallsByMapping += placed;
            else if (typedBy == "reviewer") WallsByReviewer += placed;
            else WallGaps += placed; // a massing placeholder: placed, but typed by nobody — reported for retyping
```

  In `GhostBuilder_ExtractionAndPlacement.cs`, replace (`:325-327`)

```csharp
            /// <summary>Wall elements typed by the guideline, by the layer mapping (guideline none, or no measured
            /// thickness), or left as a reported gap (skipped, or a massing placeholder) — ElementPlacementFactory's tallies.</summary>
            public int WallsByGuideline, WallsByMapping, WallGaps;
```

with

```csharp
            /// <summary>Walls typed by the guideline, by the layer mapping (guideline none, or no measured thickness), by the
            /// reviewer (a type picked in the review), or left as a reported gap (skipped, or a massing placeholder) —
            /// ElementPlacementFactory's tallies, taken before the commit.</summary>
            public int WallsByGuideline, WallsByMapping, WallsByReviewer, WallGaps;
```

  Then, after `            report.WallsByMapping = factory.WallsByMapping;`, add `            report.WallsByReviewer = factory.WallsByReviewer;`.

- [ ] **Step 4: The command feeds the drop-downs and says what typed the walls.** In `SentinelAddin/Commands.GhostBuilder.cs`:
  - replace `        if (levels.Count > 0) review.LoadLevels(levels, levels[0].Item2);` (`:228`) with:

```csharp
        if (levels.Count > 0) review.LoadLevels(levels, levels[0].Item2);
        review.LoadTypes(LoadedTypes(doc)); // GHB-5: what each row's type drop-down offers, read here on the API thread
```

  - replace `                    review.Load(mapping, perLayer, doc.Title, resolved.Header); // the header names what maps and types this proposal` (`:313`) with:

```csharp
                    review.Load(mapping, perLayer, doc.Title, resolved.Header, guided: resolved.Guideline.HasGuideline); // the header names what maps and types this proposal
```

  - in `WallsLine` (`:350-360`), directly before `        if (r.WallGaps > 0) parts.Add(`, add:

```csharp
        if (r.WallsByReviewer > 0) parts.Add($"{r.WallsByReviewer} typed by the reviewer (picked in the review)");
```

  - add this method directly before `    private static void CloseOnUi(`:

```csharp
    /// <summary>GHB-5: what each review row's type drop-down offers, read on the API thread as plain strings (the review
    /// window is Revit-free): basic wall, floor and ceiling types by name; door, window, column and furniture types as
    /// family : type. Basic walls only, as ChangesetExecutor resolves them, so a pick stays valid when Ghost moves onto it.</summary>
    private static Dictionary<string, IReadOnlyList<(string? Family, string Type)>> LoadedTypes(Document doc)
    {
        IReadOnlyList<(string? Family, string Type)> Names(IEnumerable<ElementType> types) => types
            .Select(t => (Family: t is FamilySymbol s ? s.FamilyName : null, Type: t.Name))
            .OrderBy(x => x.Family ?? "", System.StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.Type, System.StringComparer.OrdinalIgnoreCase)
            .ToList();
        IEnumerable<ElementType> Of(BuiltInCategory bic) =>
            new FilteredElementCollector(doc).OfCategory(bic).WhereElementIsElementType().Cast<ElementType>();
        return new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>(System.StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"] = Names(new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().Where(w => w.Kind == WallKind.Basic)),
            ["Floors"] = Names(new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>()),
            ["Ceilings"] = Names(Of(BuiltInCategory.OST_Ceilings)),
            ["Doors"] = Names(Of(BuiltInCategory.OST_Doors).OfType<FamilySymbol>()),
            ["Windows"] = Names(Of(BuiltInCategory.OST_Windows).OfType<FamilySymbol>()),
            ["Columns"] = Names(Of(BuiltInCategory.OST_Columns).OfType<FamilySymbol>()),
            ["Furniture"] = Names(Of(BuiltInCategory.OST_Furniture).OfType<FamilySymbol>()),
        };
    }
```

- [ ] **Step 5: The review checks.** In `tools/ghost-p2-check/Honest.cs`, make `Honest()` call `Policy(); TypePick(); ReviewChoices();` and append:

```csharp
    // ── the review: a type drop-down per row, "(ignore)", copies out, the forecast of what the build will add ──
    static void ReviewChoices()
    {
        Console.WriteLine("\nMA-1a — the review's type drop-down (GhostReviewWindow)");
        var proposal = new MappingResult
        {
            Mappings = new List<LayerMapping>
            {
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls",    BdsFamily = "BDS_Wall_Ext",    Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-DOOR",     Category = "Doors",    BdsFamily = "Generic_Door",    Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-FLOR",     Category = "Floors",   BdsFamily = "BDS_Floor",       Confidence = 1.0, Source = "standard" },
                new LayerMapping { CadLayer = "A-LEVEL",    Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 0.8, Source = "llm" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { ["A-WALL-EXT"] = 4, ["A-DOOR"] = 2, ["A-FLOR"] = 1, ["A-LEVEL"] = 3 };
        var loaded = new Dictionary<string, IReadOnlyList<(string? Family, string Type)>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Walls"]  = new List<(string? Family, string Type)> { (null, "Exterior - Brick on CMU"), (null, "Generic - 200mm") },
            ["Floors"] = new List<(string? Family, string Type)> { (null, "BDS_Floor") },
            ["Doors"]  = new List<(string? Family, string Type)> { ("Single-Flush", "0864 x 2134mm"), ("Single-Flush", "0915 x 2134mm") },
        };

        var w = new GhostReviewWindow();          // constructed, never shown
        MappingResult? emitted = null;
        w.BuildRequested += (m, _) => emitted = m;
        w.LoadTypes(loaded);
        w.Load(proposal, counts, "Scratch.rvt", "Layers: …", guided: true);
        (CheckBox Box, ComboBox Type, LayerMapping Map) Row(string layer) => w.Rows.First(r => r.Map.CadLayer == layer);
        void Choose(string layer, string label) { var t = Row(layer).Type; t.SelectedItem = t.Items.Cast<object>().First(i => i.ToString() == label); }

        Ok(Row("A-DOOR").Type.Items.Cast<object>().Select(i => i.ToString()).SequenceEqual(new[]
           { "as proposed: Generic_Door", "Single-Flush : 0864 x 2134mm", "Single-Flush : 0915 x 2134mm", "(ignore)" }),
           "a row offers: as proposed, every loaded type of its category (family : type), and (ignore)");
        Ok(w.ForecastText == string.Join(Environment.NewLine, new[]
           {
               "Types this build will add to the model (forecast — the summary lists what was added):",
               "  + Doors family \"Generic_Door\" (layer A-DOOR) — loaded from the Ghost family library if it holds Generic_Door.rfa, else skipped",
               "  + Walls type \"BDS_Wall_Ext\" (layer A-WALL-EXT) — cloned from the type catalogue, or reported as a gap",
               "  + Walls typed by the guideline at a thickness the model lacks — made at Build, each listed in the summary",
           }),
           "before Build, the review lists what the ticked rows will add (BDS_Floor is loaded: not listed)");

        Choose("A-DOOR", "Single-Flush : 0864 x 2134mm");
        Ok(!w.ForecastText.Contains("Generic_Door"), "picking a loaded door type takes Generic_Door off the forecast");
        Choose("A-FLOR", "(ignore)");
        Ok(Row("A-FLOR").Box.IsChecked == false && !Row("A-FLOR").Box.IsEnabled, "(ignore) unticks the row and locks its box");
        Choose("A-LEVEL", "(ignore)");
        w.Build();
        var built = emitted?.Mappings ?? new List<LayerMapping>();
        Ok(built.Select(m => m.CadLayer).SequenceEqual(new[] { "A-DOOR", "A-WALL-EXT" }), "Build emits the ticked rows only — never an ignored one");
        Ok(built.FirstOrDefault(m => m.CadLayer == "A-DOOR") is { Source: "reviewer", BdsFamily: "Single-Flush", BdsFamilyType: "0864 x 2134mm" },
           "a picked type leaves as the reviewer's: that family and type");
        Ok(built.All(b => proposal.Mappings.All(p => !ReferenceEquals(b, p)))
           && proposal.Mappings[1] is { Source: "standard", BdsFamily: "Generic_Door", BdsFamilyType: null },
           "every row leaves as a copy — the proposal (and the mapper's cached rows) are never edited");
        Ok(w.Choices.Select(c => $"{c.CadLayer}:{c.Source}:{c.Ignore}").SequenceEqual(new[] { "A-LEVEL:reviewer:True", "A-DOOR:reviewer:False", "A-FLOR:reviewer:True" }),
           "the reviewer's choices — a pick and two ignores, ticked or not — are what the command remembers");

        var w2 = new GhostReviewWindow();
        w2.LoadTypes(loaded);
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>
            { new LayerMapping { CadLayer = "A-LEVEL", Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 1.0, Source = "reviewer", Ignore = true } } },
            counts, "Scratch.rvt", "Layers: …");
        var lv = w2.Rows[0];
        Ok(lv.Type.SelectedItem?.ToString() == "(ignore)" && lv.Box.IsChecked == false && !lv.Box.IsEnabled,
           "a remembered ignore comes back as (ignore), unticked and locked — picking a type undoes it");
        Ok(GhostReviewWindow.SourceNote("reviewer") == "  · your earlier review" && !GhostReviewWindow.PreTick(10, 1.0, "reviewer", 0.5),
           "a remembered reviewer row says so and starts unticked, like every row that is not the standard");
    }
```

- [ ] **Step 6: Run the check and the builds.** `dotnet run --project tools/ghost-p2-check` should print 10 new `PASS` lines and end `79/79 checks pass`. The existing P3 review-gate checks stay green: rows are copies and keep their `Params`. `dotnet run --project tools/ghost-standards-check` should still end `137/137 checks pass`. Both add-in builds should report `0 Error(s)`.
- [ ] **Step 7: Commit.**

```bash
git add SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs SentinelAddin/UI/GhostReviewWindow.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Commands.GhostBuilder.cs tools/ghost-p2-check/Honest.cs
git commit -F - <<'EOF'
feat(ghost): review type drop-down + (ignore), copies out, types-to-be-added forecast; a reviewer's wall type wins (MA-1a GHB-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6 — Remember the reviewer's picks and ignores per project

**Files:**
- Modify `SentinelAddin/GhostBuilder/LayerMapper.cs` (`:32-34`, `:145`, `:165-178`, plus a new `Remember`)
- Modify `SentinelAddin/Commands.GhostBuilder.cs` (`:230-239`)
- Modify `tools/ghost-standards-check/Layers.cs` (append `ReviewerMemory`)
- Modify `tools/ghost-standards-check/Check.cs` (`:24`)

**Interfaces:**
- Consumes: Task 5's `LayerMapping.Ignore`, `LayerMapping.Copy()` and `GhostReviewWindow.Choices`.
- Produces: `public void LayerMapper.Remember(IEnumerable<LayerMapping>? choices)`.

- [ ] **Step 1: `LayerMapper` stores and returns reviewer rows (tier 2, F3 A).** In `SentinelAddin/GhostBuilder/LayerMapper.cs`:
  - replace the tier-2 lines of the class comment (`:32-34`)

```csharp
    ///   2. REMEMBERED — this project's earlier local-model answers (%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json),
    ///                   used only under the same layers sha: Source "cache". Another project's guess, or one made
    ///                   under another layers standard, never answers; an unbound document remembers nothing.
```

with

```csharp
    ///   2. REMEMBERED — this project's earlier local-model answers (%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json),
    ///                   used only under the same layers sha: Source "cache"; and the reviewer's own choices (a type
    ///                   picked in the review, or "(ignore)" — GHB-5): Source "reviewer". Another project's guess, or one
    ///                   made under another layers standard, never answers; an unbound document remembers nothing.
```

  - replace `                    if (kv.Value != null && kv.Value.Source == "llm") dict[kv.Key] = kv.Value;` (`:145`) with:

```csharp
                    if (kv.Value != null && (kv.Value.Source == "llm" || kv.Value.Source == "reviewer")) dict[kv.Key] = kv.Value;
```

  - replace `Remembered` (`:165-178`) with:

```csharp
        // A remembered row on the DWG's ACTUAL layer string (the placement join is by layer): the model's answer labelled
        // "cache", the reviewer's choice kept as "reviewer" (an ignore included); the stored copy stays untouched.
        private LayerMapping Remembered(LayerMapping src, string layer) => new LayerMapping
        {
            CadLayer = layer,
            Category = src.Category,
            BdsFamily = src.BdsFamily,
            BdsFamilyType = src.BdsFamilyType,
            Confidence = src.Confidence,
            Params = src.Params,
            Rationale = string.IsNullOrWhiteSpace(src.Rationale) ? "remembered: the local model's answer on an earlier run for " + _key : src.Rationale,
            SourceDoc = src.SourceDoc,
            Source = src.Source == "reviewer" ? "reviewer" : "cache",
            Ignore = src.Ignore,
        };

        /// <summary>GHB-5: keep the reviewer's choices — a type picked in the review, or "(ignore)" — for this project, under
        /// this layers sha, beside the model's remembered answers. They come back as "reviewer" rows (tier 2), after the
        /// installed standard: the office's layers@n still wins (F3). Rows of any other source are not remembered here;
        /// an unbound document remembers nothing.</summary>
        public void Remember(IEnumerable<LayerMapping>? choices)
        {
            foreach (LayerMapping m in choices ?? Enumerable.Empty<LayerMapping>())
            {
                if (m == null || m.Source != "reviewer" || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                _cache[Normalize(m.CadLayer)] = m.Copy();
                _dirty = true;
            }
            if (_dirty) SaveCache();
        }
```

- [ ] **Step 2: The command remembers on Build and on close (E6).** In `SentinelAddin/Commands.GhostBuilder.cs`, replace (`:230-239`)

```csharp
        review.BuildRequested += (approved, levelId) =>
        {
            building = true;
            placementEvent.SetRequest(orchestrator!, inputs, approved, levelId);
            externalEvent.Raise();
        };

        // Closing the review without building ends the run — nothing was written, so there is nothing
        // to report or undo. Releasing here is what frees the local model's HttpClient.
        review.Closed += (_, __) => { if (!building) Release(); };
```

with

```csharp
        review.BuildRequested += (approved, levelId) =>
        {
            building = true;
            mapper?.Remember(review.Choices); // GHB-5: the reviewer's picks and ignores, for this project's next run
            placementEvent.SetRequest(orchestrator!, inputs, approved, levelId);
            externalEvent.Raise();
        };

        // Closing the review without building ends the run — nothing was written, so there is nothing
        // to report or undo. The reviewer's choices are still remembered (an ignore on a drawing with nothing
        // else to build must stick — F45). Releasing here is what frees the local model's HttpClient.
        review.Closed += (_, __) =>
        {
            if (building) return;
            mapper?.Remember(review.Choices);
            Release();
        };
```

- [ ] **Step 3: The memory checks.** In `tools/ghost-standards-check/Check.cs`, replace `        try { Client(); Standards(); Layers(); Mapper(); }` (`:24`) with `        try { Client(); Standards(); Layers(); Mapper(); ReviewerMemory(); }`. In `tools/ghost-standards-check/Layers.cs`, append this method inside `static partial class Check`, after `Mapper()`:

```csharp
    // ── 5. GHB-5: what the reviewer chose is remembered as "reviewer" — after the installed standard, before any guess ──
    static void ReviewerMemory()
    {
        Console.WriteLine("\nLayerMapper — what the reviewer chose is remembered (GHB-5)\n");
        var layers = LayerRulesetMatcher.FromBody(Good, out _)!;
        layers.Sha = Sha;
        using (var mapper = new LayerMapper(new FakeModel(), layers, "rev"))
        {
            Run(mapper, "A-LEVEL", "EXT-PARTITION");
            mapper.Remember(new[]
            {
                new LayerMapping { CadLayer = "A-LEVEL", Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 1, Source = "reviewer", Ignore = true },
                new LayerMapping { CadLayer = "EXT-PARTITION", Category = "Walls", BdsFamilyType = "Generic - 200mm", Confidence = 1, Source = "reviewer" },
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls", BdsFamilyType = "Generic - 200mm", Confidence = 1, Source = "reviewer" },
                new LayerMapping { CadLayer = "S-FNDN", Category = "Floors", BdsFamily = "Generic Floor", Confidence = 1, Source = "llm" },
            });
        }
        var saved = JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("rev"))).RootElement.GetProperty("mappings");
        Ok(saved.GetProperty("A-LEVEL").GetProperty("source").GetString() == "reviewer" && saved.GetProperty("A-LEVEL").GetProperty("ignore").GetBoolean()
           && !saved.TryGetProperty("S-FNDN", out _),
           "Remember writes the reviewer's rows (an ignore included) to the project's cache file — and only the reviewer's");

        var model = new FakeModel();
        using (var mapper = new LayerMapper(model, layers, "rev"))
        {
            var rows = Run(mapper, "A-LEVEL", "EXT-PARTITION", "A-WALL-EXT", "S-FNDN");
            Ok(rows["A-LEVEL"] is { Source: "reviewer", Ignore: true, Category: "Ceilings" }, "an ignore comes back as the reviewer's ignore — it sticks (F45's A-LEVELS)");
            Ok(rows["EXT-PARTITION"] is { Source: "reviewer", BdsFamilyType: "Generic - 200mm" }, "a picked type comes back as the reviewer's, ahead of the heuristic guess");
            Ok(rows["A-WALL-EXT"].Source == "standard", "the installed standard still answers first: a remembered choice never outranks layers@n");
            Ok(model.Asked.SequenceEqual(new[] { "S-FNDN" }), "a remembered choice never goes to the local model; the rest still does");
        }
        using (var mapper = new LayerMapper(new FakeModel(), layers, ""))
            mapper.Remember(new[] { new LayerMapping { CadLayer = "A-LEVEL", Source = "reviewer", Ignore = true } });
        Ok(!File.Exists(LayerMapper.CachePathFor("")), "an unbound document remembers no choice");
    }
```

- [ ] **Step 4: Run the checks and the builds.**
  - `dotnet run --project tools/ghost-standards-check` should print 6 new `PASS` lines and end `143/143 checks pass`. The existing "only llm rows are cached" check for `demo` stays green, because nothing there calls `Remember`.
  - `dotnet run --project tools/ghost-p2-check` should still end `79/79 checks pass`.
  - Both add-in builds should report `0 Error(s)`.
- [ ] **Step 5: Commit.**

```bash
git add SentinelAddin/GhostBuilder/LayerMapper.cs SentinelAddin/Commands.GhostBuilder.cs tools/ghost-standards-check/Layers.cs tools/ghost-standards-check/Check.cs
git commit -F - <<'EOF'
feat(ghost): remember the reviewer's picks and ignores per project, after the installed standard (MA-1a GHB-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7 — Sample README, graph, merge

**Files:**
- Modify `demo/ghost-sample/README.md` (`:21`)

- [ ] **Step 1: Correct the A-DOOR row.** Replace

```markdown
| `A-DOOR` | 2 closed rectangles | The centroid path for point families. Skips honestly if the project has no door family loaded — that's a valid outcome, not a bug. |
```

with

```markdown
| `A-DOOR` | 2 closed rectangles | The centroid path for point families. Places only the ONE loaded door type the mapping or the review names (pick it in the row's drop-down); a family that is not loaded, or one with several types and none named, is skipped and named in the summary — never the first door family loaded (MA-1a). |
```

- [ ] **Step 2: Graph.** Run `graphify update .`. If it is not on PATH, record that in the merge message.
- [ ] **Step 3: Final checks.** `dotnet run --project tools/ghost-p2-check` should end `79/79 checks pass`, and `dotnet run --project tools/ghost-standards-check` should end `143/143 checks pass`. Both builds should report `0 Error(s)`.
- [ ] **Step 4: Commit and merge.**

```bash
git add demo/ghost-sample/README.md
git commit -F - <<'EOF'
docs(ghost): sample README — doors place only the loaded type a row names (MA-1a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git checkout master
git merge --no-ff feature/ma1a-ghost-honest-build -F - <<'EOF'
Merge feature/ma1a-ghost-honest-build: MA-1a step 1 — Ghost failure handler scoped to this build, no symbol fallback, Placed after commit, warnings counted not erased, review type drop-down + ignore remembered, types-to-be-added forecast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Live drill MA1a-S1 (Revit 2024, scratch model only)

**Set-up (once):**
- Close Revit, then run `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, which deploys. Record `git rev-parse --short HEAD`.
- Open Revit 2024. Start a new project from the office template and save it as `%USERPROFILE%\Documents\Sentinel drills\ma1a-s1-scratch.rvt`.
  - Never use aster-tower, Demo, a pilot file or any founder file.
  - Never discard the founder's unsaved work.
- In Project Setup, bind the scratch model to `demo`. It inherits `layers@1` from bds-office, so A-WALL-EXT, A-WALL-INT, A-FLOR and A-DOOR are standard rows.
- Settings:
  - Ghost source folder = `demo/ghost-sample`;
  - Ghost family library: empty;
  - Ollama running with `qwen2.5:7b-instruct`, so EXTERIOR-ENVELOPE and A-LEVEL become local-model rows.
- If the template has no door family with at least two types, load one (for example the Revit library's Single-Flush). Record its family and type names.
- Before each row, record two counts:
  - Manage ▸ Review Warnings;
  - elements per category (walls, floors, doors, ceilings), from a schedule or mcp-server-for-revit `analyze_model_statistics`.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| S1-1 Types listed before Build | Ghost Builder ▸ `sample-plan.dxf`. In the review, before Build, read the forecast block | Before anything is built, it lists each wall or floor type the ticked rows name that the template lacks, and the door family `BDS_Door`. If demo has a guideline, the guideline line is there too. After Build, the summary's "Added … to the model" names what was really added | the forecast and the summary, side by side (planned vs actual) |
| S1-2 Missing family type → a gap, never another family | Leave A-DOOR as proposed (`BDS_Door`, not loaded) and Build. If the template does contain `BDS_Door`, expect the gap `has N types — pick one in the review` instead, or `BDS_Door` placed when it has exactly one type | The door count is unchanged. The summary says `Skipped (type or family not in the model): 2` and warns `Doors on 'A-DOOR': Doors family "BDS_Door" is not loaded in this model — load it or set the Ghost family library; skipped.  (×2)`. No door of any family was placed | door count before and after |
| S1-3 Placed counts survivors after commit | Use the S1-2 build | `Placed` = elements after − elements before, over the categories built. `Placed` + the number "deleted by Revit" = the elements the build created. A closed loop of N edges counts N | the three numbers |
| S1-4 Type drop-down | Ctrl+Z the S1-2 build. Re-run on `sample-plan.dxf`, set A-DOOR to `<family> : <type>` from the set-up, and Build | The forecast drops `BDS_Door` once the type is picked. Exactly 2 doors are placed, both of that type. Placed counts them | each door's type |
| S1-5 Planted duplicate: the user's elements survive, warnings counted and kept | Keep S1-4's build; from now on it counts as "the user's". Record its wall and door ids. Re-run Ghost on the same DXF with the same picks and Build | Every recorded id still exists, with the same type and location. The summary shows `Revit warnings raised by this build: K — left in the model…` (overlapping walls, identical instances). Review Warnings after = before + K. The Doctor panel shows no `Suppressed:`/`Resolved:` line for this build. GHB-5's proof "a planted duplicate gives Placed 9 (1 deleted by Revit…)" no longer applies: under P1-3 a duplicate is a warning, counted and kept, and S1-6 proves the "deleted by Revit" text instead | K, the two Review Warnings counts, the Doctor lines |
| S1-6 A build error naming a user element | Read S1-5's build for an *error* (not a warning) that names one of S1-4's elements. Nothing is planted (A8) | **(a)** If S1-5 raised an *error* that names one of S1-4's elements: that element survives, and "deleted by Revit" names only second-build elements, with Revit's text. Else record: not seen live — proven offline by GhostFailurePolicy's checks | the error's text and the ids it names, or "not seen live" |
| S1-7 Ignore and type remembered as reviewer | **Ignore:** Ghost Builder ▸ `sample-section.dxf`. Set A-LEVEL (a local-model row) to `(ignore)` and Cancel. Re-run on the same DXF. **Type:** on `sample-plan.dxf`, set EXTERIOR-ENVELOPE (a local-model row) to a basic wall type and Build. Re-run | A-LEVEL comes back as `(ignore)`, unticked and locked. EXTERIOR-ENVELOPE comes back `as proposed: <type> · your earlier review`, and when built the summary counts it as "typed by the reviewer". `%AppData%\Sentinel\cache\demo\dwg_mappings.json` holds both rows with `"source": "reviewer"` (A-LEVEL with `"ignore": true`) | the JSON excerpt |
| S1-8 What Revit shows for the warnings it keeps | During S1-5 | Record what appears after the commit with `SetForcedModalHandling(false)`: a non-blocking warning box, or a modal dialog. Either is a pass if nothing was erased. A modal dialog is a follow-up for the founder | a screenshot |
| S1-9 Massing still places openings | Photo Massing on a scratch copy | Doors and windows land on the template's default types, each declared in a Note (`Placeholder Doors type '…' (the template's default) used on 'A-DOOR' … Retype before issue.`). Placed counts them | the Notes |

**S1-6 (b)** — removed by amendment A8 (no writes through the community Revit MCP).

---

## UNSURE Revit facts this drill settles

1. Whether a warning left in place by the preprocessor, from an ExternalEvent commit with `SetForcedModalHandling(false)`, shows a non-blocking box or a modal dialog in 2024 (S1-8).
2. Whether this build's warnings persist in Manage ▸ Review Warnings (`Document.GetWarnings()`) after the commit, measured as Review Warnings delta = K (S1-5). `DeleteWarning` is no longer called, so whether it would have removed them does not matter.
3. Which errors a dirty-CAD build raises at commit, and whether their failing or additional ids include pre-existing elements (audit `:912`: "plausible, not seen live") (S1-5, S1-6a).
4. Whether a default resolution can act beyond the failure's failing and additional ids. The rule resolves only when every one of those is the build's own (E3), so a breach would show as a user element changed in S1-5.
5. Which error, if any, a dirty-CAD build raises against a pre-existing wall (S1-6a); not planted (A8).
6. Whether deleting this build's failing ids clears an error that also names a user element, or whether Revit re-posts it. The handler then rolls back, which is safe (not planted — A8).
7. Whether `FailuresAccessor.GetTransactionName()` returns `Ghost Builder - LOD 200` inside the ExternalEvent, which the Doctor exemption needs (S1-5, Doctor lines).
8. Whether `Document.GetDefaultFamilyTypeId(OST_Doors / OST_Windows)` returns a type on the office template, for the massing placeholder (S1-9).
9. Unchanged here and noted for MA1b: whether the unhosted `NewFamilyInstance` places a door at all (audit §3.4.5, GHB-1).
10. Whether Revit shows an unresolved warning to the preprocessor again on the pass after `ProceedWithCommit`. `CountWarnings` dedupes by definition and named ids, so K is the same either way; S1-5's "Review Warnings after = before + K" is the proof. A mismatch there means a warning Revit re-evaluated away (over-count) and is a follow-up, not a data risk.
11. Whether `SetForcedModalHandling(false)` is honoured inside an ExternalEvent (S1-8 records what Revit shows).

## Risks

- **Fewer elements will be placed.** Doors, windows, columns and furniture rows that name a family which is not loaded, or a family with several types and none picked, now skip. Every base-standard `Generic_*` row is in this group. Earlier drill numbers (B7, SIM) are not comparable, and design drill MA1b's "Placed 9 (1 deleted by Revit)" wording needs re-reading against P1-3.
- **"Placed" changes meaning** in both the DWG and Massing dialogs: it now counts Revit elements after the commit, not CAD elements before it.
- **Revit's warning UI may now appear after Ghost builds**, because nothing erases warnings any more (S1-8).
- **A standard row that names a multi-type family needs a pick on every run** until `layers@n` names the type (F3 A).
- **One pass can both resolve and delete.** If the handler resolves one failure and deletes for another in the same pass and Revit refuses the combination, the handler catches it and rolls the whole build back, with the reason stated.
- **Only a live drill can prove the Revit-bound edits.** Placement has not run live since 2026-07-26 (audit `:903-905`).
- **The forecast's wall list is Basic walls only (E7).** A mapping that names a curtain or stacked wall type the model already has is forecast as "cloned … or reported as a gap", while the provisioner (all wall kinds) finds it present and builds it. The summary's "Added …" list is the truth after Build. Ceiling accepted; widen `LoadedTypes`' forecast input only if a pilot standard maps a curtain type.

## Out of scope (named, not built)

- `GhostFamilyPreloader` warns about system families (Walls/Floors rows, `:63-77`).
- The stale comment in `GhostBuilder_Architecture.cs:335-340`.
- `GhostTypeCreator.CreateColumnType` / `TryParseSection` are dead code.
- `GhostBuilderPlacementEvent` has no DocPin.
- Wall pairing still runs only at Build, so guideline-made sizes are listed after the build.
- The rest of BG-3 (the Doctor's scope).
- `ChangesetExecutor` has no post-commit survivor check (step 2).
- The provenance stamp, transaction rename, `SentinelUndo` and ledger rows (step 2).


## Drill result (2026-10-02)

Run as session MA1a-S1 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`: S1-1..S1-5, S1-7, S1-8 pass; S1-6 not seen live (warnings only); S1-9 not run (no building photos).
