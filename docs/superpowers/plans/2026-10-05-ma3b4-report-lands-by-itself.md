# MA-3b4 — A report is never lost, and it lands by itself Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3b plan's "Next ▸ MA-3b4 — nothing in modelling waits" (`docs/superpowers/plans/2026-10-04-ma3b-revit-review-no-wait.md`, its F2 and E8 rows), cut to its first drillable slice — the part that closes AI-2's proof ("the report lands later by itself", `docs/strategy/2026-09-30-revit-addin-audit.md:352`) and the last place a report can still be lost:
- **A waiting result is sent by itself when its model opens (founder decision F2 B).** On `DocumentOpened`, the results this PC applied in that model and the bridge has not taken (`%AppData%\Sentinel\unreported\<key>\`) go through the same stamp check on Revit's thread as Review AI Proposals (`Retry`) and are sent off it; what the bridge did is said in the pane's Doctor log, and in a dialog only when a person must act (G1). Never twice at once (the one-review guard: a picker or window open, a report in flight — then said, not sent), never for a linked or family document, never another model's records.
- **Ghost Builder writes the same record before its report and stops waiting.** Step 7 of `GhostChangesetBuild.Run` writes an `UnreportedResults` record per applied changeset, then reports through `ReportAll` on a pool thread (the undo watcher's Expect/Land, the 409-taken rule, the guard); its Decline path reports off the thread and withdraws what the bridge did not take (B4) there. `ReviewChangesetsCommand.Report` — the modal Retry/Cancel loop and its `LateDeclines` dialog — is deleted: it had no other caller. A cancelled Ghost report no longer leaves elements in the model with the changeset "proposed" and nothing on this PC to stop a second Apply.
- **A cheap leftover: the picker's closed-window gap** (MA-3b2b Risks): a round's words that reach a picker closed in between go to a dialog too, as the review window's do (`Say(words, gone)`).
- **Drill MA3b4** — short: two Revit rows on Revit 2024 (a Ghost build whose report fails, then the model reopened), one optional row.

**Source of truth:** the MA-3b plan's Next ▸ MA-3b4, its F2 row ("B: also by itself on `DocumentOpened` … it is MA-3b4") and E8 ("`Report` (with its dialog) stays for Ghost Builder … Ghost Builder's own waits are MA-3b4"); the MA-3b2b plan's Risks (the picker's closed-window gap) and Next; the MA-3b3 plan's C4 and Next (Promote's filing wait grows with the store read); `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ sessions MA3b … MA3b3 and G-1 (`sample-walls-ma2a.dxf`). Base: `feature/ma3b4-nothing-waits` at master `3ffdd40` (MA-3b3 merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight — one drillable slice; the dry run's diff: 12 files, 258 lines in, 86 out, of which the checks are 127 in):** the open-time send; Ghost Builder's record and report off the thread (both its applied and its declined path); `Report` deleted; the picker's gap. Left to **Next** with reasons: Promote's own waits (`Commands.PromoteWalls.cs:49`, `:61`, the filing at `:191`) — MA-3b5; Promote's dialog counting carried declines and a storey whose every ghost is carried; Ghost Builder's filing (`GhostChangesetBuild.cs:535`) and `Abandon`'s withdrawals (`:134`); a send on sync or on a timer (G4).

**Architecture:**

*Words (`Engine/UnreportedResults.cs`, pure; promote-check §49).* `OnOpening(title)` and `GhostHead` — the head of a Doctor line; `OpenHeld(n)` — a model opened while the guard is held; `Windowless(head, words)` — a round's words with what only a window offers replaced by what is left to run (Retry report → the next opening of this model or Review AI Proposals; "close this window and run Review AI Proposals again" → "run Review AI Proposals in this model"; a decline's "Retry report sends it again" → nothing offered) — MA-3b2b C14's rule as one table; `Failed(why)` — a round that did not finish; `GhostReporting`, `GhostDeclining`, `WithdrawnInstead` — Ghost Builder's ledger lines.

*Revit, the open-time send (`Commands.ReviewChangesets.cs`, `App.cs`; source scans §50; drill R-2).* `SendOnOpen(doc)`: a linked, family or unbound document → nothing; this model's records (`DocOf`, without case — MA-3b C4) → none: nothing; the guard held → the `OpenHeld` line and nothing sent; otherwise `Said(Retry(doc, cfg, mine), head, rep => rep.Act)`. `Said` is the windowless twin of the review window's `Send`: a continuation on `TaskScheduler.Default` that writes the Doctor line and queues a dialog when `ask` says so or the round faulted. `Reported.Act` (new) is set where a person must act: some but not all of a result's elements carry its stamp (`Verified`'s partial case), or the bridge refused for good a result whose elements are in the model (`Outcome`'s drop). `App.OnDocumentOpened` calls `SendOnOpen` inside a try/catch whose catch is said.

*Revit, Ghost Builder (`GhostBuilder/GhostChangesetBuild.cs`, `Commands.ReviewChangesets.cs`; source scans §51; drill R-1).* Step 7 builds each result with `ReviewChangesetsCommand.ResultOf` (now internal; `Doc = DocOf(doc)`, `Path = doc.PathName`, `Undo = {the group's name, the changeset's own}`), writes the applied ones (`UnreportedResults.Write`) and hands them to `ReportAll` — whose `Expect` runs here, on Revit's thread, right after `Assimilate` (MA-3b C8), and whose `Land` replaces the two `UndoWatcher.Remember` calls. `Decline` builds the declines (not written — MA-3b E4) and passes `ReportAll` a `more` that withdraws, on the pool thread, every filed changeset the bridge did not take (B4). The summary's ledger line says the report is under way and where its outcome is said. No transaction is added or moved: everything here runs after the TransactionGroup is assimilated or rolled back (XC-2 unchanged).

*Revit, the picker (`UI/ChangesetPickerWindow.cs`, `Commands.ReviewChangesets.cs`).* `SetEntries(entries, status, Action gone = null)`: when the picker is gone, the Doctor line and then `gone`. `Load` passes `lost` — a dialog of the round's words — when the round said anything.

No bridge, web, `package.json` or migration change; no new HTTP call (the open-time send and Ghost Builder use the existing `ReportResult`, `FetchOne`, `ReportReverted` and `Withdraw`).

**Tech Stack:** the C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF); the offline check `tools/promote-check` (it compiles `Engine/UnreportedResults.cs` and scans the Revit-bound sources).

## Global Constraints

- Branch `feature/ma3b4-nothing-waits` (it holds this plan, on `3ffdd40`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b4 is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **Network calls never wait on Revit's thread (AI-2).** No `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.ReviewChangesets.cs` (§43); every report of this slice goes through `ReportAll`'s `Task.Run`, and Ghost Builder's withdrawals of a declined build run in `Said`'s continuation on the pool thread.
  - **The record before the send.** A result with applied elements is written on this PC before its report leaves Revit's thread — the review's (unchanged) and now Ghost Builder's; it is deleted only when the bridge takes it, or refuses it for good (said).
  - **Claimed vs verified.** A waiting result is sent at open only after the model's stamps confirm its elements (`Retry` → `UnreportedResults.Verified`); a model that holds none of it asks the bridge first (`Gone`); another copy of the same central keeps it (`Elsewhere`).
  - **Words are said, never silent.** Every outcome of a round no window shows is in the pane's Doctor log; a dialog when a person must act (G1) or a result was not taken (G2); a guard that stops the open-time send is said; a throw in `SendOnOpen` is said.
  - **One review at a time.** The guard (`_holds`) is not held more often (`Count(review, "Hold();") == 3`, §43); the open-time send never runs while it is held.
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: this slice adds no model write; Ghost Builder's records and reports start after its group is assimilated or rolled back.
  - **Nothing MA-3a … MA-3b3 hold is loosened**: `review_rev` (Ghost Builder's results still carry the review_rev its filing reply carried — MA-3a C2), the 409-taken rule (C1), the stalled round (C6), Expect/Land (C8), `Elsewhere` (MA-3b2 C16), the late-decline words (now said by `ReportAll` for Ghost Builder too).
- After each add-in task, the build: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false`; Task 4 builds 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from the repo root, `dotnet run --project tools/promote-check`. No vitest file changes; a full vitest run is not needed (no bridge or web file changes).
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform.
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address (a drill record says "the founder's account" or `<account>`); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Line numbers are `3ffdd40`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-05).** A detached worktree of `feature/ma3b4-nothing-waits` at `3ffdd40` in the session's scratchpad (`scratchpad/ma3b4/dry`; removed afterwards — never the repository). A script read **this document** and applied every "Create … / In … , replace … with …" block of Tasks 1–3 in order (each replace matched its text exactly once, CRLF kept), each task's check step before its code step, and ran the named checks:
- Base, measured first: `promote-check` `779/779` (the brief's 695 is from before MA-3b; MA-3b3's final 769 + its §48's 10).
- Task 1: the build fails (`error CS0117: 'UnreportedResults' does not contain a definition for 'OnOpening'`, and the same for `Windowless`, `GhostHead`, `GhostReporting`, `GhostDeclining`, `WithdrawnInstead`, `OpenHeld`, `Failed`) → `786/786 checks pass` (779 + 7).
- Task 2: four `FAIL` lines, `786/790` → `790/790 checks pass`; build 2024 with `-p:DeployToRevit=false`: `0 Error(s)`, `5 Warning(s)`.
- Task 3: six `FAIL` lines (§41's one, §43's two, §51's three), `787/793` → `793/793 checks pass`; build 2024: `0 Error(s)`, `5 Warning(s)`.
- Task 4 (final, with its design-doc replace applied — it matched once): all 26 check projects — the 25 that count `2410/2410` (master 2396 + 14), `datum-check` `DATUM OK`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts. The diff: 12 files, 258 lines in, 86 out (`Report`'s 37 lines among them).
- Not run: the drill (Revit, the test bridge, the door) and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **G5 is not a default: it needs the founder's explicit words in chat.**

| # | Choice | Options | Default |
|---|---|---|---|
| G1 | What the open-time send says | **A:** the pane's Doctor log for every outcome, plus a dialog only when a person must act — some but not all of a result's elements carry its stamp, or the bridge refused for good a result whose elements are still in the model (`Reported.Act`). **B:** a dialog for every outcome. **C:** the Doctor log only | **A** — the person opened a model, not a review; a bridge that is down at every open would raise a dialog at every open under B, while C would leave a decision only a person can take in a log line |
| G2 | What Ghost Builder's report says, now that it no longer waits | **A:** the summary's ledger line says the report is under way; the pane's Doctor log says what the bridge took; a dialog when not every result was taken. **B:** the Doctor log only | **A** — the summary is read before the report lands; a result not taken is kept and blocks its review until sent, which the person should not learn from a log alone |
| G3 | The drill saves its scratch copy | **A:** saved — the copy in `Documents\Sentinel drills\ma3b4\`, never a pilot original — so it reopens bound, with Ghost Builder's stamped walls, and R-2 can prove the send. **B:** never saved; R-2 is owed | **A** — the "never saved" lesson protects the founder's own files; R-2 needs the elements and the binding to survive a reopen |
| G4 | A send on sync, on a timer, or for a linked model | **A:** not built. **B:** build them | **A** — the open-time send and Review AI Proposals cover AI-2's proof; a timer is a background writer to the ledger with no window (the MA-3b F2 reason) |
| G5 | The drill's Revit rows run on the branch build deployed to Revit 2024 | The founder's explicit OK in chat for this drill — one OK covers the deploy and the put-back — or R-1, R-2 and R-3 are **owed** | none — without the OK the slice is proven offline only (§49–§51) |

## Amendments to the brief's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the brief, item 3: "Promote's own network waits off Revit's thread").** Not in this slice: MA-3b5 (Next), with the reason. It is about freezing, not about losing a report; it reshapes a 180-line command across three thread hops and needs a re-entrance guard (today the frozen thread is what stops a second Promote from filing twice), DocPin across the wait, the `GovernedNotify` dispatcher fix for its receipt (MA-3b2b C1e), a rewrite of §38's literal and its own drill row with a slow-filing proxy.
- **S2 (the brief, item 4: "Promote's dialog counting carried declines").** Not in this slice (Next): it needs a second copy of `carryKey` in C# or a bridge preview route; best after MA-3b5, so its read is off the thread.
- **S3 (the brief, item 2: "its words said without a modal wait where the review's pattern allows").** The summary dialog stays (a person reading, not a network wait); the report's outcome is said after it, in the Doctor log and — when a result was not taken — in a dialog queued through the event hub (G2).
- **S4 (the scout, "the open-time send says … `PressRetry→RunReview`").** All of a window's offers are replaced, not only that one (`Windowless`, one table checked in §49): a round at open or from Ghost Builder has no Retry report and no window to close.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The open-time send reuses `Retry` and the `_holds` guard; no new guard | `Retry` is the stamp check AI-2 asks for; `ReportAll` holds the guard while the round is in flight, so a Review AI Proposals started meanwhile says Busy and a second open of another local waits. In memory (MA-3b E3): a Revit restart resets it, the records do not |
| E2 | `Reported.Act` — one flag set where `Verified` keeps a partial result and where `Outcome` drops a result with applied elements | The words already say what to do; the flag only decides the dialog (G1). Two lines, no new type |
| E3 | `Windowless` is one replacement table over the existing words | Every word function stays as the window says it (§42's literals hold); a new word that offers a window's button fails §49's sweep |
| E4 | Ghost Builder builds its records with the review's `ResultOf` and `DocOf` (made internal) | One record shape: `Retry`'s stamp check, `Elsewhere` and the picker's block read Ghost Builder's records unchanged (its elements are stamped by the executor) |
| E5 | Ghost Builder's declines are not written on this PC; one the bridge does not take is withdrawn instead, on the pool thread | MA-3b E4 (a decline changes nothing in the model) and Ghost Builder's B4. A changeset left proposed by both failing is named in the Doctor log and the dialog — the build was rolled back, so a later Apply duplicates nothing |
| E6 | `ReviewChangesetsCommand.Report` is deleted | Its only callers were Ghost Builder's two; its late-decline dialog is `ReportAll`'s words (`ChangesetTrust.LateDeclines`) |
| E7 | The open-time send is on `DocumentOpened` only (not `DocumentCreated`, not `ViewActivated`) | A new model holds no records; `ViewActivated` fires on every view switch. Once per open; Review AI Proposals stays the manual path |
| E8 | The picker's gap gets an optional `gone` action, not a second picker method | Six lines; the review window's `Say(words, gone)` is the pattern (MA-3b2b C13) |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `tools/promote-check/Ma3b4.cs` (new) | 1 | §49 — the words of a round no window shows (pure) |
| `tools/promote-check/Check.cs` | 1, 2, 3 | the new sections' calls |
| `SentinelAddin/Engine/UnreportedResults.cs` | 1 | `OnOpening`, `OpenHeld`, `GhostHead`, `Windowless`, `Failed`, `GhostReporting`, `GhostDeclining`, `WithdrawnInstead` |
| `tools/promote-check/Ma3b4Open.cs` (new) | 2 | §50 — the open-time send (source scans) |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 2, 3 | `Reported.Act`, `SendOnOpen`, `Said`; `DocOf` and `ResultOf` internal; `Report` deleted; the picker's `lost` |
| `SentinelAddin/App.cs` | 2 | `OnDocumentOpened` calls `SendOnOpen` |
| `tools/promote-check/Ma3b4Ghost.cs` (new) | 3 | §51 — Ghost Builder's record and report, the picker's gap (source scans) |
| `tools/promote-check/Ma3aReview.cs` | 3 | §41: `Report`'s literals replaced |
| `tools/promote-check/Ma3bDesk.cs` | 3 | §43: the picker's literals, one label |
| `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` | 3 | `Decline` and step 7 through `ReportAll`; the ledger lines |
| `SentinelAddin/UI/ChangesetPickerWindow.cs` | 3 | `SetEntries(…, Action gone = null)` |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | what was built |

---

## Tasks (in order: the words; the open-time send; Ghost Builder and the picker; the design doc and the final checks. The merge follows the live drill)

### Task 1 — Words: a round no window shows (pure, promote-check §49)

**Files:**
- Create: `tools/promote-check/Ma3b4.cs`
- Modify: `tools/promote-check/Check.cs` (the call list near `:72`)
- Modify: `SentinelAddin/Engine/UnreportedResults.cs` (after `DeleteOnce`, `:234`)

**Interfaces:**
- Produces: `UnreportedResults.OnOpening(string) → string`, `OpenHeld(int) → string`, `const GhostHead`, `Windowless(string head, string words) → string`, `Failed(string) → string`, `GhostReporting(string key, IList<string> ids, IList<string> unsaved) → string`, `GhostDeclining(int) → string`, `WithdrawnInstead(IList<string>, IList<string>) → string`.

- [ ] **Step 1: The failing check.** Create `tools/promote-check/Ma3b4.cs`:

```csharp
#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── 49. MA-3b4: the words of a round no window shows — a model opening (founder decision F2 B), Ghost Builder (pure) ───────────
    static void Ma3b4WordChecks()
    {
        Console.WriteLine("\nMA-3b4 — the words of a report no window shows");
        const string keptOpen = "\nThe result is kept on this PC and sent again by the next opening of this model or Review AI Proposals; this changeset is not opened for review until the bridge takes it, so nothing is applied twice.";
        const string down = "Bridge 503: {\"error\":\"drill MA3b4 proxy: the bridge is down (503)\"}";
        const string signIn = "Bridge 403: {\"message\":\"result requires the contributor role (you are viewer)\"}";
        var rec = new UnreportedResults.Record
        {
            Key = "ma3b4", ChangesetId = "c49", Name = "Ghost Builder: sample-walls-ma2a.dxf on GR-FFL", Doc = "C:\\drills\\ma3b4-a.rvt", Path = "",
            Applied = new List<AppliedEntry> { new AppliedEntry { ProposalGuid = "g1" }, new AppliedEntry { ProposalGuid = "g2" } },
        };
        var head = UnreportedResults.OnOpening("ma3b4-a");
        Ok(head == "Review AI Proposals (on opening \"ma3b4-a\"): "
           && UnreportedResults.Windowless(head, "\"Ghost Builder: sample-walls-ma2a.dxf on GR-FFL\": " + UnreportedResults.Outcome(down, 2).Words)
              == "Review AI Proposals (on opening \"ma3b4-a\"): \"Ghost Builder: sample-walls-ma2a.dxf on GR-FFL\": not reported: " + down + keptOpen,
           "a result the bridge did not take, said on opening: kept, sent again by the next opening or Review AI Proposals — never 'Retry report' with no window");
        Ok(UnreportedResults.Windowless("", UnreportedResults.Outcome(signIn, 2).Words)
           == "not reported: " + signIn + "\nSign in (Standards ▸ Sign in) as a contributor on this project, then run Review AI Proposals." + keptOpen,
           "a sign-in refusal names what is left to run (MA-3b2b review C14's rule)");
        Ok(UnreportedResults.Windowless("", UnreportedResults.Verified(rec, 1).Words).EndsWith("check the model (finish the Undo, or delete what is left), then run Review AI Proposals in this model.", StringComparison.Ordinal)
           && UnreportedResults.Windowless("", UnreportedResults.RevertPosted("Bridge 503: down")) == "NOT posted: Bridge 503: down\nThe record is kept on this PC; the next opening of this model or Review AI Proposals asks the bridge again."
           && UnreportedResults.Windowless(UnreportedResults.GhostHead, "\"x\": " + UnreportedResults.Outcome(null, 0).Words).EndsWith("\nNothing in the model changed.", StringComparison.Ordinal),
           "a partial stamp count asks for Review AI Proposals in this model, never 'close this window'; a revert not posted waits for the next opening; a decline no window holds is offered nothing");
        var all = new[]
        {
            UnreportedResults.Outcome(down, 2).Words, UnreportedResults.Outcome(signIn, 0).Words, UnreportedResults.Outcome("Bridge 404: gone", 2).Words,
            UnreportedResults.NotSent(2), UnreportedResults.NotSent(0), UnreportedResults.NotReRead("A task was canceled.", 2), UnreportedResults.Gone(rec, null, "Bridge 503: down").Words,
            UnreportedResults.RevertPosted("Bridge 503: down"), UnreportedResults.Verified(rec, 1).Words, UnreportedResults.Elsewhere(rec, "C:\\other.rvt"),
            UnreportedResults.UndoneInFlight(rec, "Bridge 503: down"),
        }.Select(w => UnreportedResults.Windowless(UnreportedResults.GhostHead, w)).ToList();
        Ok(all.All(w => w.StartsWith(UnreportedResults.GhostHead, StringComparison.Ordinal) && !w.Contains("Retry report") && !w.Contains("this window")),
           "no word of a round offers Retry report or 'this window' when no window shows it");
        Ok(UnreportedResults.GhostReporting("ma2a-ghost", new List<string> { "55f4929e", "7acd0c36" }, new List<string>())
              == "Ledger: reporting 2 changeset(s) to ma2a-ghost (source dwg: 55f4929e, 7acd0c36) off Revit's thread — the pane's Doctor log says what the bridge took. A result it does not take is kept on this PC and sent again by the next opening of this model or Review AI Proposals; that changeset is not opened for review until then, so nothing is applied twice. One Ctrl+Z undoes the whole build; changeset_reverted is posted for what the bridge holds."
           && UnreportedResults.GhostReporting("k", new List<string> { "55f4929e" }, new List<string> { "55f4929e" })
              .EndsWith($"\n⚠ The result of 55f4929e could not be saved on this PC ({UnreportedResults.Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again.", StringComparison.Ordinal),
           "AI-2: Ghost Builder's summary says its results are being reported, where the outcome is said, that one not taken is kept and never applied twice — and names a result that could not be saved");
        Ok(UnreportedResults.GhostDeclining(2) == "Ledger: reporting 2 changeset(s) as declined, with the reason, off Revit's thread — the pane's Doctor log says what the bridge took; one it does not take is withdrawn instead, and one that is neither is named there (still proposed: withdraw it on the web)."
           && UnreportedResults.WithdrawnInstead(new List<string> { "55f4929e" }, new List<string> { "7acd0c36" }) == "\n\nWithdrawn instead (the decline did not land): 55f4929e.\n\nStill proposed — neither declined nor withdrawn: 7acd0c36. Withdraw it on the web before anyone reviews it."
           && UnreportedResults.WithdrawnInstead(new List<string>(), new List<string>()) == "",
           "B4 kept: a rolled-back build's declines are reported off Revit's thread; one not taken is withdrawn instead, one neither is named");
        Ok(UnreportedResults.OpenHeld(2) == "2 result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open or a report is in flight. Once it is done, run Review AI Proposals in this model: it checks the model and sends them."
           && UnreportedResults.Failed(null).StartsWith("reporting failed — it did not finish\nWhat Revit applied is kept on this PC (" + UnreportedResults.Root + ")", StringComparison.Ordinal),
           "a guard that stops the open-time send is said, never a silent skip; a round that failed says nothing on this PC is lost");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b3CarryChecks();
```

with:

```csharp
        Ma3b3CarryChecks();
        Ma3b4WordChecks();
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check 2>&1 | grep -E "error CS|checks pass" | sort -u | head -5`
Expected: the build fails — `error CS0117: 'UnreportedResults' does not contain a definition for 'OnOpening'` (and the like for `Windowless`, `GhostHead`, `GhostReporting`, `GhostDeclining`, `WithdrawnInstead`, `OpenHeld`, `Failed`).

- [ ] **Step 3: The words.** In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
        public static string DeleteOnce(Record r) => $"If that model is gone, check the changeset's status on the bridge, then delete {PathFor(r.Key, r.ChangesetId)}.";
```

with:

```csharp
        public static string DeleteOnce(Record r) => $"If that model is gone, check the changeset's status on the bridge, then delete {PathFor(r.Key, r.ChangesetId)}.";

        /// <summary>MA-3b4 (founder decision F2 B): the head of the Doctor line when a model opens and its waiting results are checked and sent.</summary>
        public static string OnOpening(string title) => $"Review AI Proposals (on opening \"{title}\"): ";

        /// <summary>MA-3b4: a model opened while the one-review guard is held (a picker or a window open, a report in flight) — nothing sent, said.</summary>
        public static string OpenHeld(int n) =>
            $"{n} result(s) applied in this model wait on this PC for the bridge — not sent now: a review window is open or a report is in flight. Once it is done, run Review AI Proposals in this model: it checks the model and sends them.";

        /// <summary>MA-3b4 (G2): the head of Ghost Builder's Doctor line — its report runs after its summary is shown.</summary>
        public const string GhostHead = "Ghost Builder — the report to the bridge: ";

        // MA-3b4 (S4): what a window's words offer that no window can — MA-3b2b review C14's rule, for every offer: a round at a model's
        // opening or from Ghost Builder has no Retry report and no window to close.
        private static readonly (string Window, string None)[] NoWindow =
        {
            (PressRetry, RunReview),
            (DeclineKept, "Nothing in the model changed."),
            ("Retry report or the next Review AI Proposals", "the next opening of this model or Review AI Proposals"),
            ("then close this window and run Review AI Proposals again.", "then run Review AI Proposals in this model."),
        };

        /// <summary>MA-3b4: a round's words for the pane's Doctor log (and a dialog) when no window shows them.</summary>
        public static string Windowless(string head, string words) => NoWindow.Aggregate(head + (words ?? ""), (s, p) => s.Replace(p.Window, p.None));

        /// <summary>MA-3b4: a round that did not finish (its task faulted) — nothing on this PC is lost.</summary>
        public static string Failed(string why) =>
            $"reporting failed — {why ?? "it did not finish"}\nWhat Revit applied is kept on this PC ({Root}) and sent again by the next opening of this model or Review AI Proposals; a decline that did not land leaves its changeset proposed.";

        /// <summary>MA-3b4 (AI-2): Ghost Builder's ledger line — its results are written on this PC and reported off Revit's thread.</summary>
        public static string GhostReporting(string key, IList<string> ids, IList<string> unsaved) =>
            $"Ledger: reporting {ids.Count} changeset(s) to {key} (source dwg: {string.Join(", ", ids)}) off Revit's thread — the pane's Doctor log says what the bridge took. " +
            "A result it does not take is kept on this PC and sent again by the next opening of this model or Review AI Proposals; that changeset is not opened for review until then, so nothing is applied twice. " +
            "One Ctrl+Z undoes the whole build; changeset_reverted is posted for what the bridge holds." +
            (unsaved.Count == 0 ? "" : $"\n⚠ The result of {string.Join(", ", unsaved)} could not be saved on this PC ({Root}): if its report fails too, nothing on this PC remembers it — check the changeset's status on the bridge before reviewing it again.");

        /// <summary>MA-3b4: Ghost Builder's ledger line when the build rolled back — every filed changeset is reported declined off Revit's thread.</summary>
        public static string GhostDeclining(int n) =>
            $"Ledger: reporting {n} changeset(s) as declined, with the reason, off Revit's thread — the pane's Doctor log says what the bridge took; one it does not take is withdrawn instead, and one that is neither is named there (still proposed: withdraw it on the web).";

        /// <summary>MA-3b4 (B4): after Ghost Builder's declines — the changesets withdrawn instead, and those neither declined nor withdrawn.</summary>
        public static string WithdrawnInstead(IList<string> withdrawn, IList<string> kept) =>
            (withdrawn.Count == 0 ? "" : $"\n\nWithdrawn instead (the decline did not land): {string.Join(", ", withdrawn)}.") +
            (kept.Count == 0 ? "" : $"\n\nStill proposed — neither declined nor withdrawn: {string.Join(", ", kept)}. Withdraw it on the web before anyone reviews it.");
```

- [ ] **Step 4: See it pass.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: `786/786 checks pass` (779 + 7), no `FAIL` line.

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b4.cs tools/promote-check/Check.cs SentinelAddin/Engine/UnreportedResults.cs
git commit -m "feat(revit): MA-3b4 - the words of a report no window shows: a model's opening, the guard held, Ghost Builder's ledger lines, and a window's offers (Retry report, close this window) replaced by what is left to run (promote-check 49)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2 — Revit: a waiting result sent by itself when its model opens (F2 B; source scans §50)

**Files:**
- Create: `tools/promote-check/Ma3b4Open.cs`
- Modify: `tools/promote-check/Check.cs`
- Modify: `SentinelAddin/Commands.ReviewChangesets.cs` (`Reported` `:153-159`; `Retry`'s last branch `:179-183`; `ReportAll`'s drop `:255`; before `Open`'s summary `:265`)
- Modify: `SentinelAddin/App.cs` (`OnDocumentOpened` `:134-141`)

**Interfaces:**
- Consumes: Task 1's words; `Retry`, `ReportAll`, `DocOf`, `_holds` (MA-3b).
- Produces: `ReviewChangesetsCommand.SendOnOpen(Document)`, `ReviewChangesetsCommand.Said(Task<Reported>, string head, Func<Reported, bool> ask, Func<Reported, string> more = null)`, `Reported.Act`.

- [ ] **Step 1: The failing check.** Create `tools/promote-check/Ma3b4Open.cs`:

```csharp
#nullable disable

static partial class Check
{
    // ── 50. MA-3b4: a waiting result is sent by itself when its model opens (F2 B) — source scans (Revit-bound; drill MA3b4 R-2) ──────
    static void Ma3b4OpenChecks()
    {
        Console.WriteLine("\nMA-3b4 — a waiting result sent by itself when its model opens (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), app = Src("App.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int opened = At(app, "private static void OnDocumentOpened("), send = At(app, "try { Commands.ReviewChangesetsCommand.SendOnOpen(doc); }");
        Ok(opened > 0 && send > opened && send < At(app, "private static void OnDocumentCreated(") && Count(app, "SendOnOpen(") == 1
           && app.Contains("catch (Exception ex) { PanelVm?.LogDoctor($\"Review AI Proposals (on opening \\\"{doc.Title}\\\"): the results waiting on this PC were not checked"),
           "F2 B: every model that opens (DocumentOpened — never File ▸ New) has its waiting results checked and sent; a throw is said in the Doctor log");
        int on = At(review, "internal static void SendOnOpen(Document doc)");
        int skip = At(review, "if (doc == null || doc.IsFamilyDocument || doc.IsLinked) return;"), bound = At(review, "if (!ctx.IsBound) return;");
        int held = At(review, "if (Volatile.Read(ref _holds) > 0) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenHeld(mine.Count)); return; }");
        int retry = At(review, "Said(Retry(doc, BcfConfig.Load(), mine), head, rep => rep.Act);");
        Ok(on > 0 && skip > on && bound > skip && held > bound && retry > held
           && Count(review, ".Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();") == 2,
           "only this model's records (its central's or file's path, without case — review C4), never a linked or family document or an unbound model; never while a window is open or a report is in flight (the guard), said; the stamp check first (Retry, on Revit's thread)");
        int said = At(review, "internal static void Said(Task<Reported> sending, string head, Func<Reported, bool> ask, Func<Reported, string> more = null) => sending.ContinueWith(t =>");
        int dialog = At(review, "if (!done || ask(t.Result)) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));");
        Ok(said > 0 && dialog > said && At(review, "try { App.PanelVm?.LogDoctor(words); } catch { }") > dialog
           && review.Contains("var words = UnreportedResults.Windowless(head, done ? t.Result.Text + (more?.Invoke(t.Result) ?? \"\") : UnreportedResults.Failed(t.Exception?.GetBaseException().Message));")
           && review.IndexOf("}, TaskScheduler.Default);", said, StringComparison.Ordinal) > dialog,
           "G1: a round no window shows is said in the pane's Doctor log from a pool thread, in words made windowless; a dialog only when a person must act or the round failed");
        Ok(review.Contains("rep.Act = true; // MA-3b4 (G1)") && review.Contains("if (drop) { UnreportedResults.Delete(r.Key, r.ChangesetId); rep.Act |= r.Applied.Count > 0; } // MA-3b4 (G1)")
           && !review.Contains("GetAwaiter().GetResult()") && !review.Contains(".Wait(") && Count(review, "Hold();") == 3,
           "G1: a person must act when only some of a result's elements carry its stamp, or the bridge refused for good a result whose elements are in the model; nothing waits, and the guard is held no more often");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b4WordChecks();
```

with:

```csharp
        Ma3b4WordChecks();
        Ma3b4OpenChecks();
```

- [ ] **Step 2: See it fail.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: four `FAIL` lines (`F2 B: every model that opens …`, `only this model's records …`, `G1: a round no window shows …`, `G1: a person must act …`) and `786/790 checks pass`.

- [ ] **Step 3: The flag.** In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
        public readonly List<(UnreportedResults.Record R, string Reply)> Landed = new List<(UnreportedResults.Record R, string Reply)>();
        public string Text => string.Join("\n\n", Words);
```

with:

```csharp
        public readonly List<(UnreportedResults.Record R, string Reply)> Landed = new List<(UnreportedResults.Record R, string Reply)>();
        /// <summary>MA-3b4 (G1): a person must act — only some of a result's elements carry its stamp, or the bridge refused for good a
        /// result whose elements are in the model. A round no window shows (Said) then raises a dialog.</summary>
        public bool Act;
        public string Text => string.Join("\n\n", Words);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            else
            {
                rep.Words.Add(words);
                rep.Left.Add(r);
            }
```

with:

```csharp
            else
            {
                rep.Words.Add(words);
                rep.Left.Add(r);
                rep.Act = true; // MA-3b4 (G1): some of its elements carry the stamp — a person checks the model
            }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    if (drop) UnreportedResults.Delete(r.Key, r.ChangesetId);
                    else { rep.Left.Add(r); stalled = true; }
```

with:

```csharp
                    if (drop) { UnreportedResults.Delete(r.Key, r.ChangesetId); rep.Act |= r.Applied.Count > 0; } // MA-3b4 (G1): refused for good, its elements in the model
                    else { rep.Left.Add(r); stalled = true; }
```

- [ ] **Step 4: The send on open, and the words of a round no window shows.** In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    /// <summary>Promote's entry (MA-0): the review window on <paramref name="batch"/>.</summary>
```

with:

```csharp
    /// <summary>MA-3b4 (AI-2, founder decision F2 B): a model opened — the results this PC applied in it that the bridge has not taken are
    /// checked against its stamps here (DocumentOpened: Revit's thread — Retry) and sent off it; what the bridge did is said in the pane's
    /// Doctor log, and in a dialog only when a person must act (G1). Never while the guard is held (a picker or a review window open, a
    /// report in flight): said, and the next Review AI Proposals sends them. Nothing for a linked or family document, a model not bound, or
    /// another model's records (review C4's comparison).</summary>
    internal static void SendOnOpen(Document doc)
    {
        if (doc == null || doc.IsFamilyDocument || doc.IsLinked) return;
        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound) return;
        var here = DocOf(doc);
        var mine = UnreportedResults.ForKey(ctx.Key).Where(r => string.Equals(r.Doc, here, StringComparison.OrdinalIgnoreCase)).ToList();
        if (mine.Count == 0) return;
        var head = UnreportedResults.OnOpening(doc.Title);
        // E1: the guard, in memory — a picker or a window may hold this model's results already, or a report of them may be in flight.
        if (Volatile.Read(ref _holds) > 0) { App.PanelVm?.LogDoctor(head + UnreportedResults.OpenHeld(mine.Count)); return; }
        Said(Retry(doc, BcfConfig.Load(), mine), head, rep => rep.Act);
    }

    /// <summary>MA-3b4 (AI-2): a round of reports no window shows — a model opening (F2 B), Ghost Builder. On a pool thread:
    /// <paramref name="more"/> runs first (Ghost Builder's withdrawals), then the round's words, made windowless, go to the pane's Doctor
    /// log — and to a dialog when <paramref name="ask"/> says a person must act, or the round failed. Nothing here ends unobserved
    /// (MA-3b2b review C1).</summary>
    internal static void Said(Task<Reported> sending, string head, Func<Reported, bool> ask, Func<Reported, string> more = null) => sending.ContinueWith(t =>
    {
        try
        {
            var done = t.Status == TaskStatus.RanToCompletion;
            var words = UnreportedResults.Windowless(head, done ? t.Result.Text + (more?.Invoke(t.Result) ?? "") : UnreportedResults.Failed(t.Exception?.GetBaseException().Message));
            // MA-3b2b review C1: queued before the Doctor line, which stands on its own; no DocPin — a dialog changes nothing in the model.
            if (!done || ask(t.Result)) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));
            try { App.PanelVm?.LogDoctor(words); } catch { }
        }
        catch (Exception ex) { App.Events.Enqueue(_ => TaskDialog.Show(Title, $"The report's result could not be shown — {ex.GetType().Name}: {ex.Message}\nRun Review AI Proposals to see what the bridge holds.")); }
    }, TaskScheduler.Default);

    /// <summary>Promote's entry (MA-0): the review window on <paramref name="batch"/>.</summary>
```

In `SentinelAddin/App.cs`, replace:

```csharp
        ReloadRuleset(doc); // the baseline scan runs when the document's ruleset@n has landed
    }
```

with:

```csharp
        ReloadRuleset(doc); // the baseline scan runs when the document's ruleset@n has landed
        // MA-3b4 (AI-2, F2 B): the results this PC applied in this model that the bridge has not taken are sent by themselves — said in the
        // pane's Doctor log. A throw here sends nothing and removes nothing: every record stays on this PC, said.
        try { Commands.ReviewChangesetsCommand.SendOnOpen(doc); }
        catch (Exception ex) { PanelVm?.LogDoctor($"Review AI Proposals (on opening \"{doc.Title}\"): the results waiting on this PC were not checked — {ex.GetType().Name}: {ex.Message}. They are kept; run Review AI Proposals in this model to send them."); }
    }
```

- [ ] **Step 5: See it pass, and build.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"` → `790/790 checks pass`, no `FAIL` line. `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)| error "` → `0 Error(s)`, `5 Warning(s)` (master's count).

- [ ] **Step 6: Commit.**

```bash
git add tools/promote-check/Ma3b4Open.cs tools/promote-check/Check.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/App.cs
git commit -m "feat(revit): MA-3b4 - a waiting result is sent by itself when its model opens (founder decision F2 B): DocumentOpened checks the model's stamps (Retry) and sends this model's records off Revit's thread, said in the pane's Doctor log, a dialog only when a person must act (G1); never while a review window is open or a report is in flight (said); never a linked, family or unbound model (promote-check 50)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3 — Revit: Ghost Builder writes its result and never waits for its report; the picker's gap (source scans §51)

**Files:**
- Create: `tools/promote-check/Ma3b4Ghost.cs`
- Modify: `tools/promote-check/Check.cs`
- Modify: `tools/promote-check/Ma3aReview.cs` (§41, `:76-81`)
- Modify: `tools/promote-check/Ma3bDesk.cs` (§43: the label near `:214`, the picker's literals near `:247` and `:268`)
- Modify: `SentinelAddin/Commands.ReviewChangesets.cs` (`Load` `:116-127`; `DocOf` `:140`; `ResultOf` `:143`; `Report` `:593-629` deleted)
- Modify: `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs` (`Decline` `:142-168`; step 7 `:642-660`; the ledger line `:668-671`)
- Modify: `SentinelAddin/UI/ChangesetPickerWindow.cs` (`SetEntries` `:54-58`)

**Interfaces:**
- Consumes: Task 1's words; Task 2's `Said`; `ReportAll` (MA-3b).
- Produces: `ReviewChangesetsCommand.DocOf` and `ResultOf` internal; `ChangesetPickerWindow.SetEntries(entries, status, Action gone = null)`. Removes: `ReviewChangesetsCommand.Report`.

- [ ] **Step 1: The failing checks.** Create `tools/promote-check/Ma3b4Ghost.cs`:

```csharp
#nullable disable

static partial class Check
{
    // ── 51. MA-3b4: Ghost Builder writes its result before its report and never waits for it; the picker's closed-window gap — source
    //        scans (Revit-bound; drill MA3b4 R-1) ──────────────────────────────────────────────────────────────────────────────────
    static void Ma3b4GhostChecks()
    {
        Console.WriteLine("\nMA-3b4 — Ghost Builder does not wait for its report and keeps what the bridge did not take (source scans)");
        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs"), review = Src("Commands.ReviewChangesets.cs"), picker = Src("UI", "ChangesetPickerWindow.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int done = At(ghost, "done = true;");
        int write = At(ghost, "var unsaved = records.Where(x => x.Applied.Count > 0 && !UnreportedResults.Write(x)).Select(x => Short(x.ChangesetId)).ToList();");
        int send = At(ghost, "ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, records), UnreportedResults.GhostHead, rep => rep.Landed.Count < records.Count);");
        Ok(done > 0 && write > done && send > write
           && ghost.Contains("ReviewChangesetsCommand.DocOf(doc), new List<string> { undo, UndoWatcher.TxName(cs.Name, cs.Id) }, null);")
           && ghost.Contains("rec.Path = doc.PathName ?? \"\";")
           && !ghost.Contains("ReviewChangesetsCommand.Report(") && !ghost.Contains("UndoWatcher.Remember(") && !review.Contains("internal static bool Report("),
           "AI-2: Ghost Builder writes each applied result on this PC (the model, the file, its Undo names) before its report, which goes through ReportAll on a pool thread — remembered for the undo watcher once the bridge takes it; Report and its modal Retry are gone");
        int decline = At(ghost, "GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)");
        int declines = At(ghost, "ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, declines), UnreportedResults.GhostHead, rep => rep.Landed.Count < declines.Count, rep =>");
        int withdraw = At(ghost, "(ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _) ? withdrawn : kept).Add(Short(cs.Id));");
        Ok(decline > 0 && declines > decline && withdraw > declines && ghost.Contains("report.Ledger = UnreportedResults.GhostDeclining(declines.Count);")
           && ghost.Contains(": UnreportedResults.GhostReporting(r.Key, filed.Select(f => Short(f.Id)).ToList(), unsaved);"),
           "B4 kept: a build rolled back reports each changeset declined off Revit's thread, and one the bridge does not take is withdrawn instead, there; the summary says the report is under way and where its outcome is said");
        Ok(picker.Contains("public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status, Action gone = null)")
           && review.Contains("Action lost = rep.Words.Count == 0 ? null : () => App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));")
           && review.Contains("picker.SetEntries(rows, string.Join(\"\\n\\n\", said), lost);")
           && review.Contains(".Concat(said)), lost);"),
           "MA-3b2b's gap: a round's words that reach a picker closed in between go to a dialog too, not to the Doctor log alone");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b4OpenChecks();
```

with:

```csharp
        Ma3b4OpenChecks();
        Ma3b4GhostChecks();
```

In `tools/promote-check/Ma3aReview.cs`, replace:

```csharp
           && review.Contains("if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))")
           && review.Contains("if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show(\"Sentinel — AI proposals\", late);")
```

with:

```csharp
           && !review.Contains("internal static bool Report(") // MA-3b4: Report and its dialogs are gone — Ghost Builder reports through ReportAll too
           && review.Contains("(ChangesetTrust.LateDeclines(reply) is { } late ? \"\\n\" + late : \"\")")
```

In `tools/promote-check/Ma3aReview.cs`, replace:

```csharp
           && ghost.Contains("res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev))"),
```

with:

```csharp
           && ghost.Contains("res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev,"),
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           "AI-2: every report of the review — applied, declined, rolled back, sent again — goes through ReportAll on a pool thread; Report's retry dialog is Ghost Builder's alone");
```

with:

```csharp
           "AI-2: every report of the review — applied, declined, rolled back, sent again — goes through ReportAll on a pool thread (MA-3b4: Ghost Builder's too; Report's retry dialog is gone)");
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && picker.Contains("if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status))); return; }")
```

with:

```csharp
           && picker.Contains("if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status, gone))); return; }") // MA-3b4
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
        Ok(picker.Contains("Closed += (_, _) => _gone = true;") && picker.Contains("if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + status); return; }")
```

with:

```csharp
        Ok(picker.Contains("Closed += (_, _) => _gone = true;") && picker.Contains("if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor(\"Review AI Proposals: \" + status); gone?.Invoke(); return; }") // MA-3b4: and the caller's dialog
```

- [ ] **Step 2: See it fail.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"`
Expected: six `FAIL` lines — §41's `the result carries the review_rev Apply re-checked …`, §43's `AI-5: the picker lists every entry …` and `review C11: the words of a round the picker started …`, and §51's three — and `787/793 checks pass`.

- [ ] **Step 3: The review's helpers for Ghost Builder; `Report` deleted; the picker's `lost`.** In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static string DocOf(Document doc) => Publisher.CentralPath(doc) ?? (string.IsNullOrEmpty(doc.PathName) ? doc.Title : doc.PathName);
```

with:

```csharp
    // MA-3b4: Ghost Builder's records too (E4).
    internal static string DocOf(Document doc) => Publisher.CentralPath(doc) ?? (string.IsNullOrEmpty(doc.PathName) ? doc.Title : doc.PathName);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo,
```

with:

```csharp
    internal static UnreportedResults.Record ResultOf(string key, ChangesetDto cs, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, string doc, List<string> undo,
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    }

    /// <summary>True when the bridge recorded the result. Ghost Builder's (GhostChangesetBuild), with its retry dialog — the review window
    /// reports through ReportAll (MA-3b). MA-3a: <paramref name="reviewRev"/> is the changeset's review_rev Apply re-checked (Ghost Builder's applying build sends the review_rev its filing reply carried; a call that applies nothing sends none).</summary>
    internal static bool Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev = null)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, reviewRev, out var reply, out var err))
            {
                // MA-3a (Q2): a ghost declined on the web after Apply re-checked it was applied over the decline — recorded by the bridge; said.
                if (ChangesetTrust.LateDeclines(reply) is { } late) TaskDialog.Show("Sentinel — AI proposals", late);
                return true;
            }
            // Client errors (400 bad payload, 401/403 not signed in or not a contributor, 404, 409 already-resolved)
            // won't heal on retry with an identical payload — show once and stop instead of an unwinnable retry loop.
            if (err != null && new[] { "400", "401", "403", "404", "409" }.Any(code => err.StartsWith("Bridge " + code)))
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    $"The bridge refused the result (retrying cannot fix this):\n{err}" +
                    (err.StartsWith("Bridge 401") || err.StartsWith("Bridge 403") ? "\n\nSign in (Standards ▸ Sign in) as a contributor on this project." : "") +
                    (applied.Count > 0 ? "\n\nElements WERE changed in this model. Check the changeset's status in the bridge before any re-review." : ""));
                return false;
            }
            // When elements WERE created, cancelling leaves the bridge still saying "proposed" —
            // and a later review run would re-execute the same changeset, DUPLICATING the elements.
            // Say so explicitly; an unnamed hazard is a trap.
            var hazard = applied.Count > 0
                ? $"\n\nWARNING: {applied.Count} element(s) were ALREADY CREATED in this model. If you cancel, the bridge still lists this changeset as \"proposed\" — reviewing it again would create duplicates. Retry until the report succeeds, or have the agent withdraw the changeset before any re-review."
                : "";
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit.{hazard}\n\nRetry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return false;
        }
    }
```

with:

```csharp
    }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
```

with:

```csharp
            // MA-3b4 (MA-3b2b's gap): the picker may close while the list is read — the round's words then go to a dialog too, not the Doctor log alone.
            Action lost = rep.Words.Count == 0 ? null : () => App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));
            var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                picker.SetEntries(none, string.Join("\n\n", new[] { $"Couldn't reach the bridge:\n{fetchErr}" }.Concat(said)));
```

with:

```csharp
                picker.SetEntries(none, string.Join("\n\n", new[] { $"Couldn't reach the bridge:\n{fetchErr}" }.Concat(said)), lost);
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            picker.SetEntries(rows, string.Join("\n\n", said));
```

with:

```csharp
            picker.SetEntries(rows, string.Join("\n\n", said), lost);
```

In `SentinelAddin/UI/ChangesetPickerWindow.cs`, replace:

```csharp
    /// <summary>The entries — each one's line, why it cannot be opened (null when it can) and its changesets — and the status. Any thread.</summary>
    public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status))); return; }
        // Review C11: closed between the caller's Gone check and now — the words go to the Doctor log, never to a closed window.
        if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor("Review AI Proposals: " + status); return; }
```

with:

```csharp
    /// <summary>The entries — each one's line, why it cannot be opened (null when it can) and its changesets — and the status. Any thread.
    /// MA-3b4 (MA-3b2b's gap): <paramref name="gone"/> runs when the picker was closed in between — the caller's dialog.</summary>
    public void SetEntries(List<(string Line, string Blocked, List<ChangesetDto> Entry)> entries, string status, Action gone = null)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => SetEntries(entries, status, gone))); return; }
        // Review C11: closed between the caller's Gone check and now — the words go to the Doctor log, never to a closed window.
        if (_gone) { if (!string.IsNullOrEmpty(status)) App.PanelVm?.LogDoctor("Review AI Proposals: " + status); gone?.Invoke(); return; }
```

- [ ] **Step 4: Ghost Builder — the declined build.** In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace:

```csharp
            // A changeset failed in Revit: the whole build is rolled back, and every filed changeset is reported declined. B4: a
            // result the bridge does not take is withdrawn instead, and one that is neither is named — it is still proposed.
            GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)
            {
                SentinelUndo.RollBack(group, doc);
                int recorded = 0;
                var withdrawn = new List<string>();
                var kept = new List<string>();
                if (bound)
                    foreach (var cs in filed)
                    {
                        if (ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, new List<AppliedEntry>(), cs.Elements.Select(e => e.ProposalGuid).ToList(),
                                cs == failing ? $"Revit transaction failed — rolled back: {error}"
                                              : $"not applied — the Ghost build is all or nothing and {(failing == null ? "it" : "changeset " + Short(failing.Id))} failed: {error}"))
                        {
                            recorded++;
                            continue;
                        }
                        (ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _) ? withdrawn : kept).Add(Short(cs.Id));
                    }
                report.NotBuilt = GhostFailurePolicy.NotBuiltLine(error);
                report.Ledger = !bound ? noLedger
                    : $"Ledger: {recorded} of {filed.Count} changeset(s) reported as declined, with the reason" +
                      (withdrawn.Count > 0 ? $"; {string.Join(", ", withdrawn)} withdrawn instead (the result could not be reported)" : "") +
                      (kept.Count > 0 ? $"; {string.Join(", ", kept)} still proposed — withdraw it on the web" : "") + ".";
                return report;
            }
```

with:

```csharp
            // A changeset failed in Revit: the whole build is rolled back, and every filed changeset is reported declined. B4: a
            // result the bridge does not take is withdrawn instead, and one that is neither is named — it is still proposed.
            // MA-3b4 (AI-2): reported off Revit's thread (ReportAll; a decline is not written on this PC — E5), the withdrawals on the
            // same pool thread; what the bridge did is said in the pane's Doctor log, and in a dialog when one was not taken (G2).
            GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)
            {
                SentinelUndo.RollBack(group, doc);
                report.NotBuilt = GhostFailurePolicy.NotBuiltLine(error);
                if (!bound) { report.Ledger = noLedger; return report; }
                var declines = filed.Select(cs => ReviewChangesetsCommand.ResultOf(r.Key, cs, new List<AppliedEntry>(), cs.Elements.Select(e => e.ProposalGuid).ToList(),
                    cs == failing ? $"Revit transaction failed — rolled back: {error}"
                                  : $"not applied — the Ghost build is all or nothing and {(failing == null ? "it" : "changeset " + Short(failing.Id))} failed: {error}",
                    null, ReviewChangesetsCommand.DocOf(doc), null, null)).ToList();
                ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, declines), UnreportedResults.GhostHead, rep => rep.Landed.Count < declines.Count, rep =>
                {
                    var landed = new HashSet<string>(rep.Landed.Select(x => x.R.ChangesetId), StringComparer.Ordinal);
                    var withdrawn = new List<string>();
                    var kept = new List<string>();
                    foreach (var cs in filed.Where(f => !landed.Contains(f.Id)))
                        (ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _) ? withdrawn : kept).Add(Short(cs.Id));
                    return UnreportedResults.WithdrawnInstead(withdrawn, kept);
                });
                report.Ledger = UnreportedResults.GhostDeclining(declines.Count);
                return report;
            }
```

- [ ] **Step 5: Ghost Builder — the kept build.** In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace:

```csharp
                // ── 7. The ledger: each changeset's result, then the undo watcher (only for a result the bridge holds) ────────
                var unrecorded = new List<string>();
                for (int c = 0; c < filed.Count; c++)
                {
                    var cs = filed[c];
                    var res = results[c];
                    foreach (var g in res.Gone) report.DeletedByRevit.Add(planOf[g.ProposalGuid].What + " — removed by Revit at commit");
                    Count(res.Warnings);
                    if (!bound) continue;
                    var guids = res.Applied.Select(a => a.ProposalGuid).ToList();
                    // MA-3a (C2): the review_rev the filing reply carried (0) — a web decline that landed since is judged late, never unchecked.
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev))
                    {
                        unrecorded.Add(Short(cs.Id));
                        continue;
                    }
                    UndoWatcher.Remember(undo, r.Key, cs.Id, guids);                         // the Undo entry's name (the group's)
                    UndoWatcher.Remember(UndoWatcher.TxName(cs.Name, cs.Id), r.Key, cs.Id, guids); // and its own, whichever Revit reports
                }
```

with:

```csharp
                // ── 7. The ledger (MA-3b4, AI-2): each result written on this PC first, then reported off Revit's thread ─────────────
                //    ReportAll expects the Undo here, before the report leaves this thread (MA-3b C8), remembers it for the undo watcher
                //    once the bridge takes it — under the Undo entry's name and the changeset's own, whichever Revit reports — and keeps
                //    what it does not take: sent again when this model opens or by Review AI Proposals, never reviewed until then (G2).
                var records = new List<UnreportedResults.Record>();
                for (int c = 0; c < filed.Count; c++)
                {
                    var cs = filed[c];
                    var res = results[c];
                    foreach (var g in res.Gone) report.DeletedByRevit.Add(planOf[g.ProposalGuid].What + " — removed by Revit at commit");
                    Count(res.Warnings);
                    if (!bound) continue;
                    // MA-3a (C2): the review_rev the filing reply carried (0) — a web decline that landed since is judged late, never unchecked.
                    var rec = ReviewChangesetsCommand.ResultOf(r.Key, cs, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev,
                                                               ReviewChangesetsCommand.DocOf(doc), new List<string> { undo, UndoWatcher.TxName(cs.Name, cs.Id) }, null);
                    rec.Path = doc.PathName ?? ""; // MA-3b2 review C16: the file itself, beside Doc (a local's central)
                    records.Add(rec);
                }
                var unsaved = records.Where(x => x.Applied.Count > 0 && !UnreportedResults.Write(x)).Select(x => Short(x.ChangesetId)).ToList();
                if (records.Count > 0)
                    ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, records), UnreportedResults.GhostHead, rep => rep.Landed.Count < records.Count);
```

In `SentinelAddin/GhostBuilder/GhostChangesetBuild.cs`, replace:

```csharp
                report.Ledger = !bound ? localLedger
                    : $"Ledger: {filed.Count - unrecorded.Count} of {filed.Count} changeset(s) recorded on {r.Key} (source dwg: {string.Join(", ", filed.Select(f => Short(f.Id)))})" +
                      (unrecorded.Count == 0 ? " — one Ctrl+Z undoes the whole build and posts changeset_reverted."
                                             : $" — the result of {string.Join(", ", unrecorded)} was NOT recorded (see the message before this one); do not apply it again in Review AI Proposals.");
```

with:

```csharp
                report.Ledger = !bound ? localLedger
                    : UnreportedResults.GhostReporting(r.Key, filed.Select(f => Short(f.Id)).ToList(), unsaved);
```

- [ ] **Step 6: See it pass, and build.** `dotnet run --project tools/promote-check 2>&1 | grep -E "FAIL|checks pass"` → `793/793 checks pass`, no `FAIL` line. `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)| error "` → `0 Error(s)`, `5 Warning(s)`.

- [ ] **Step 7: Commit.**

```bash
git add tools/promote-check/Ma3b4Ghost.cs tools/promote-check/Check.cs tools/promote-check/Ma3aReview.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/GhostBuilder/GhostChangesetBuild.cs SentinelAddin/UI/ChangesetPickerWindow.cs
git commit -m "feat(revit): MA-3b4 - Ghost Builder writes each applied result on this PC before its report and no longer waits for it: ReportAll on a pool thread (the undo watcher's Expect/Land, the 409-taken rule, the guard), said in the Doctor log and a dialog when one was not taken (G2); a rolled-back build reports its declines off the thread and withdraws what the bridge did not take there (B4); Report and its modal Retry are gone; the picker's closed-window gap gets the dialog (promote-check 51)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify: `docs/strategy/2026-09-30-model-automation-design.md` (the end of the AI-2 line at `:1107`)

- [ ] **Step 1: The design doc says what was built.** In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
(at the next Review AI Proposals, or by Retry report — by itself on `DocumentOpened` is MA-3b4).
```

with:

```markdown
(at the next Review AI Proposals, or by Retry report) — and by itself when its model opens: BUILT on `feature/ma3b4-nothing-waits` (MA-3b4), drill MA3b4 pending — `DocumentOpened` checks the model's stamps and sends this model's waiting results off Revit's thread, said in the pane's Doctor log (a dialog only when a person must act); never while a review window is open or a report is in flight (said), never for a linked or family model. Ghost Builder writes the same record before its report and no longer waits for it (its modal Retry is gone; a rolled-back build's declines are reported off the thread, and one the bridge does not take is withdrawn). Promote's own waits (its reads and its filing) are MA-3b5.
```

- [ ] **Step 2: The final checks.** From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines — `promote-check: 793/793 checks pass`, the other 24 that count as on master (together with it `2410/2410`: master's 2396 + 14) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped. Then the builds, each with `-p:DeployToRevit=false`:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "%s: " $v; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)" | tr '\n' ' '; echo; done
```

Expected: 2022 `3 Warning(s) 0 Error(s)`, 2023 `3`/`0`, 2024 `5`/`0`, 2025 `1`/`0`, 2026 `1`/`0`, 2027 `3`/`0` — master's own counts.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b4 - the design doc says what was built (a waiting result sent by itself when its model opens; Ghost Builder's record and report off Revit's thread); drill MA3b4 pending" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Live drill MA3b4 (two Revit rows and one optional row, on Revit 2024 on the branch's build, against a test bridge behind a failing door — before the merge)

**The founder's OK first (G5).** The set-up deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it R-1, R-2 and R-3 are **owed** and the slice is proven offline only (§49–§51). The one OK covers the deploy and the put-back. The founder's 4100 bridge is **not** touched and not restarted: every row runs against the test bridge on `127.0.0.1:4102` behind the drill's door on `127.0.0.1:4101`.

**Who does what.** The runner drives Revit by mouse (or UI Automation's Invoke), Revit signed in (Standards ▸ Sign in — the founder's). **Focus-sensitive steps** — reading a dialog, the Ghost Builder window, the pane's Doctor log — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry**. The pane's lists virtualize (read them via `ScrollPattern`; the Doctor log is newest first). After "Load Once" on the unsigned add-in prompt, open the Sentinel tab through UI Automation if the ribbon ignores clicks (MA3b2b's note). The Revit MCP: only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 4).
- **Ghost Builder's Decline path live** (a build Revit rolls back): it needs a forced Revit failure; checked by source scans (§51) and by the shared `ReportAll`, which the review's decline paths have run live since MA-3b.
- **The open-time guard live** (a model opened while a review window is open or a report is in flight): it needs two models and a window held open across an open; checked by scan (§50) and words (§49).
- **The picker's closed-window gap live** (a timing gap: the picker closed while its list is read): scan only (§51).
- **An open-time send while signed out** (the machine credential: a 401/403 keeps the record, "Sign in … then run Review AI Proposals"): words checked offline (§49).
- **A partial stamp count at open** (G1's dialog): words checked offline (§49).
- **MA-3b3's owed rows** (a second account, a web-origin carry live) and the earlier ones stay owed; this drill does not carry them.

**Set-up (once; the deploy only after the founder's OK):**
- **The test bridge on 127.0.0.1:4102** — the preview server `bridge-4102` (`.claude/launch.json`; `node <scratchpad>/ma3b2b/bridge-4102.mjs`, `cwd` `WebApp`), two lines, written again if the file is gone: `process.env.BCF_PORT = "4102"; process.env.BCF_EVENT_POLL_MS = "0";` then `await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`. It runs this checkout's bridge code (unchanged by this slice).
- **The drill's door on 127.0.0.1:4101** — the preview server `ma3b4-door` (`node <scratchpad>/ma3b4/door.mjs`, port 4101); not in the repository:

  ```js
  // Drill MA3b4's door: 127.0.0.1:4101 -> the test bridge on 127.0.0.1:4102. With an empty file "fail" beside this script, the FIRST
  // POST .../result is answered 503 at once and never reaches the bridge (restart the door for another); everything else passes.
  import http from "node:http";
  import { existsSync } from "node:fs";
  let once = false;
  http.createServer((req, res) => {
    if (!once && req.method === "POST" && req.url.endsWith("/result") && existsSync(new URL("fail", import.meta.url))) {
      once = true;
      console.log(`failed ${req.url} with 503 - the bridge never saw it`);
      req.resume();
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "drill MA3b4 proxy: the bridge is down (503)" }));
      return;
    }
    const up = http.request({ host: "127.0.0.1", port: 4102, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end(`drill door: the test bridge on 4102 did not answer - ${e.message}`); });
    req.pipe(up);
  }).listen(4101, "127.0.0.1", () => console.log("drill door on 127.0.0.1:4101 -> 4102"));
  ```

  `<scratchpad>/ma3b4/fail` is an empty file, created before R-1. Every bridge call of the runner goes through MA3b2b's helper on 4101 (it masks e-mail addresses; the machine credential is read through `load-env.mjs`, never printed), from `WebApp`: `node <scratchpad>/ma3b2b/b4101.mjs <METHOD> <path> [body]`, written `b4101` below.
- **The project: `ma2a-ghost`** (drill G-1's scratch project on the shared store, its own layer-rule `guideline@1`; the founder's account a contributor there). Before R-1: `b4101 GET cde/ma2a-ghost/members` (the founder's account listed, masked; if it is not, `b4101 POST cde/ma2a-ghost/members` as MA3b2b's `setup.mjs` does); `b4101 GET "changesets/ma2a-ghost?status=proposed"` — record the ids already there (left untouched); `%AppData%\Sentinel\unreported\ma2a-ghost\` — record that it is absent or empty.
- **The add-in's bridge settings.** With Revit closed: copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b4bak` beside it (never print it, never open it in a viewer); point it at the door: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The deploy (after the founder's OK).** Record the deployed `Sentinel.dll`'s sha256 under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`); `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The scratch model (G3).** `Documents\Sentinel drills\ma3b4\ma3b4-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog ("Create New Local" unticked if the dialog offers it), bound with Sentinel ▸ Project Setup to `ma2a-ghost`, then **saved once** (Ctrl+S) — so R-2's reopen finds the binding, and the drill learns now how this copy saves (UNSURE 1). If Revit asks for Save As, it is saved as `ma3b4-a.rvt` in the same folder; whatever file is open after this save is the one R-1 and R-2 use, and the record names it. A floor plan of GR-FFL is the active view.

| Row | Steps | Pass when | Record |
|---|---|---|---|
| R-1 — Ghost Builder's report fails; nothing waits, nothing is lost | `<scratchpad>/ma3b4/fail` exists and the door was (re)started after it. Sentinel ▸ Ghost Builder ▸ `demo/ghost-sample/sample-walls-ma2a.dxf` (repo), no type picked, level GR-FFL ▸ **Build** (Revit in front). Read the summary; close it. Read the dialog that follows. Read the pane's Doctor log (newest line). List `%AppData%\Sentinel\unreported\ma2a-ghost\` (names only). `b4101 GET changesets/ma2a-ghost/<the id in the summary>` (status only). **Do not run Review AI Proposals in this model** — it would send the result at once (the picker's own Retry) and R-2 would prove nothing | The summary appears with **no** "The result could not be reported to the bridge … Retry?" dialog before it; its ledger line reads `Ledger: reporting 1 changeset(s) to ma2a-ghost (source dwg: <id>) off Revit's thread — the pane's Doctor log says what the bridge took. …` (G-1 filed one changeset; more if the build filed more); after it, a `Sentinel — AI proposals` dialog `Ghost Builder — the report to the bridge: "<name>": not reported: Bridge 503: {"error":"drill MA3b4 proxy: the bridge is down (503)"}` with `The result is kept on this PC and sent again by the next opening of this model or Review AI Proposals; …`; the same words newest in the Doctor log; the door's log `failed …/result with 503 - the bridge never saw it`; one `<id>.json` in `unreported\ma2a-ghost\`; the GET says `proposed`. **Fails, named:** a Retry dialog (the modal wait is back); no file (a lost report); a dialog or Doctor line offering "Retry report" (S4) | the summary's ledger line, the dialog, the Doctor line, the file name, the GET |
| R-2 — the report lands by itself when the model opens | Save the scratch copy (Ctrl+S — G3), close it (File ▸ Close), then open the same file again from Revit's Open dialog, as in the set-up (Revit in front). The door is not restarted: its one failure is spent. Read the pane's Doctor log. List `unreported\ma2a-ghost\`. `b4101 GET changesets/ma2a-ghost/<id>` (status, `result.applied` count). Then Sentinel ▸ Review AI Proposals: read the picker; close it | The Doctor log's newest line reads `Review AI Proposals (on opening "ma3b4-a"): "<name>": reported (ledger #<n>).` (the title as Revit gives it); **no** dialog (G1: nobody must act); the record file is gone; the GET says `applied` with the walls R-1's summary placed (6 in G-1); the picker does not list the Ghost changeset. **Fails, named:** nothing in the Doctor log (the send did not run, or its line is lost — UNSURE 3); a "not in this model as applied" line (the save did not keep the walls — G3/UNSURE 1); "another copy of the same model" (the file reopened is not the one R-1 wrote — UNSURE 1) | the Doctor line, the listing, the GET, the picker's status line |
| R-3 (optional) — a model closed without saving reports nothing as applied | Restart the door (the `fail` file still there). Copy the seed again as `ma3b4-b.rvt`, open, bind to `ma2a-ghost`, save once, then Ghost Builder as in R-1 (the 503 again; the record written). Close **without saving**; open `ma3b4-b.rvt` again. Read the Doctor log; list `unreported\ma2a-ghost\`; GET the new id | The Doctor line reads `Review AI Proposals (on opening "ma3b4-b"): "<name>": not in this model as applied (undone, the model was closed without saving, or a local that was never synchronised) — nothing reported; the bridge holds the changeset as proposed, so it opens for review again. This PC's record is removed.`; the file is gone; the GET says `proposed`. Then `b4101 POST changesets/ma2a-ghost/<id>/withdraw '{"actor":"drill-ma3b4"}'` → `200 withdrawn` | the Doctor line, the listing, the GET, the withdraw |

The rows run in the order R-1, R-2, R-3. If Ghost Builder filed another count or name than G-1's, the rows use what it filed and the record says so. If R-3 is not run, it is recorded **owed**.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b4 — a report never lost, landing by itself when its model opens, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b4-nothing-waits <sha>, Claude driving Revit 2024)`: the Setup paragraph (the test bridge on 4102 behind the door on 4101; the deploy on the founder's OK with the DLL sha before and after; settings at 127.0.0.1:4101; the project `ma2a-ghost` and what was pending there; the sign-in state; the scratch copies, saved — G3), the table `| Row | Result | Evidence |` with **pass**/fail/owed and the words quoted (never an address), plus ledger `#n`; then F-MA3b4-n findings each fixed on the branch with its check, the owed list and the closing list.

**Closing list:**
- close Revit (the scratch copies are drill files: saved or not, never committed);
- stop `ma3b4-door` and `bridge-4102`; remove their entries from `.claude/launch.json` if this drill added them; the founder's 4100 bridge and the `web-dev` preview are not touched; delete `<scratchpad>/ma3b4/fail`;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b4bak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed — **a deploy too: only under the founder's same explicit OK**: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. Without that OK, say so: the branch's add-in stays until the merge's deploy — safe: it reports through the same routes;
- list what the drill left on the shared ledger — on `ma2a-ghost`: R-1's changeset (applied), R-3's (withdrawn), their `ghost_build` and receipt rows — left in place on purpose (a scratch key);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma2a-ghost\` (empty; deleted), `%AppData%\Sentinel\cache\ma2a-ghost` (deleted: a scratch key), the scratch copies in `Documents\Sentinel drills\ma3b4\` (kept, named, as evidence; never committed), `<scratchpad>/ma3b4/` (`door.mjs`).

## Merge (after the drill)

Merge when all of these hold:
- R-1 and R-2 passed, or are named **owed** in the record — owed only because the founder gave no deploy OK; then the merge message says the open-time send and Ghost Builder's record are **built and proven offline only, not live**;
- each F-MA3b4-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit does was run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace ``BUILT on `feature/ma3b4-nothing-waits` (MA-3b4), drill MA3b4 pending`` with `LANDED in MA-3b4 (merge <date>), drill MA3b4: <passed rows; owed rows>` — `git commit -m "docs: MA-3b4 - drill MA3b4's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b4-nothing-waits -F - <<'EOF'
Merge feature/ma3b4-nothing-waits: MA-3b4 - a report is never lost, and it lands by itself (AI-2's proof): a waiting result is sent by itself when its model opens (founder decision F2 B) - DocumentOpened checks the model's stamps (Retry, on Revit's thread) and sends this model's records off it, said in the pane's Doctor log, a dialog only when a person must act (G1); never while a review window is open or a report is in flight (said), never a linked, family or unbound model, never another model's records. Ghost Builder writes each applied result on this PC before its report and reports through ReportAll on a pool thread (G2: the Doctor log, a dialog when one was not taken); a rolled-back build's declines are reported off the thread and the ones not taken withdrawn there (B4); ReviewChangesetsCommand.Report and its modal Retry are gone. The picker's closed-window gap gets the dialog. No bridge, web or migration change. Drill MA3b4 (Revit 2024, signed in, a saved scratch copy - G3): <rows and ledger numbers>. Owed: <owed rows>. promote-check 793, 26 checks 2410, builds 2022-2027 0 errors. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:**
1. **The bridge: nothing.** No bridge file changed; no restart, no Funnel toggle.
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses. Records written by an add-in from before this slice (the review's, since MA-3b) are read unchanged: the first open of their model after the deploy sends them.
3. **The web app: nothing** (no web change; 1.0.43 stays).

## UNSURE facts this drill settles

1. How the scratch copy saves (the B35 seed is a detached copy; if it is workshared, Ctrl+S on a central opened directly may ask for Save As or Synchronize) and whether the reopened file is the one R-1 wrote (`Doc` and `Path` must match: the central's path or the file's) — the set-up's first save, and R-2.
2. Whether `DocumentOpened` is raised for a linked model in Revit 2024 — moot: `IsLinked` returns before anything is read.
3. Whether a Doctor line written during `DocumentOpened` (its send lands a moment later, from a pool thread) is in the pane when the model is in front — R-2. The pane's log is one list (`PanelVm`), not per document.
4. How the door's 503 reads in Revit (`Bridge 503: {…}`, expected at once) — R-1.
5. Whether `ma2a-ghost`'s guideline, catalogue and the founder's membership still stand on the shared store, and whether Ghost Builder's mapping of the sample needs nothing new (G-1 ran it on 2026-09-28) — the set-up's GETs and R-1's summary.

## Risks (each a ceiling stated in words)

- **The open-time send reads stamps on Revit's thread as the model opens**: one `GetElement` per applied element of each waiting record — the same check Review AI Proposals runs; the send itself is off the thread. A model with many waiting results opens that much slower.
- **The guard is in memory** (MA-3b E3, E1 here): a model opened while a review window is open is not sent then — said; the next Review AI Proposals in it sends. A Revit restart resets the guard; the records stay.
- **A dialog at every open while a person has not acted** (G1): a partial stamp count, or a result the bridge refused for good with elements in the model, is said again at each open until the model is fixed and Review AI Proposals runs. By design: a person decides.
- **A Ghost changeset whose every element Revit removed at commit** (applied 0) is not written (as the review's); if its report fails it stays proposed with nothing in the model — said in the Doctor log and the dialog; a later Apply duplicates nothing.
- **Ghost Builder's declines live in memory** (E5): a Revit closed before `ReportAll` and the withdrawals finish leaves the changesets proposed — the build was rolled back, so a later Apply duplicates nothing; the summary's ledger line said the report was under way.
- **Ghost Builder's report is not cancellable from a window**: its words arrive in the Doctor log and a dialog after the summary; while it is in flight (up to 120 s on a slow bridge) Review AI Proposals says Busy.
- **A model opened by another add-in in the background** (`Application.OpenDocumentFile`) has its waiting results sent too — said in the Doctor log; its stamps decide, as for any open.
- **Ghost Builder's filing and `Abandon`'s withdrawals still wait on Revit's thread** (`GhostChangesetBuild.cs:535`, `:134`), and **Promote's reads and filing still wait** (`Commands.PromoteWalls.cs:49`, `:61`, `:191`; MA-3b3 C4: the filing wait grows with the store read): Next.

## Not settled (for the founder or the reviewer)

- G5 (the deploy OK) is the founder's alone; without it the drill is owed and the merge says so.
- Whether R-3 runs (optional; it costs a second Ghost build on a second copy).

## Next (out of scope here)

- **MA-3b5 — Promote's own waits off Revit's thread** (`Commands.PromoteWalls.cs:49` `FetchProposed`, `:61` `PromoteContext.Fetch`, the series of `Propose` at `:191`). Size M: a re-entrance guard of its own (today the frozen thread is what stops a second Promote from planning and filing twice), DocPin across the wait (`App.Events.Enqueue(doc, …)` for the plan and the dialog), the receipt sent from the enqueued job (`GovernedNotify`'s dispatcher, MA-3b2b C1e), `Open`'s `UIApplication` overload, §38's `Propose` literal rewritten, and a drill row with a slow-filing door mood. About freezing, not losing a report; bounded (8 s + about 4 s + one write per part) but growing with the bridge's store read (MA-3b3 E7/C4). If the founder feels it most, it is the next slice.
- **Promote's "File n changeset(s)?" counts carried declines, and a storey whose every ghost is carried is not filed** (MA-3b3 Next, F8 B): a second copy of `carryKey` in C# or a bridge preview route. Size M; after MA-3b5, so the read is already off the thread.
- **Ghost Builder's filing and `Abandon`'s withdrawals off the thread** (`GhostChangesetBuild.cs:535`, `:134`): the filing sits inside the open TransactionGroup, so it needs the build split into a "file" and a "place" event. Size M.
- **A send on sync or on a timer** (G4 B): not planned.
- Carried over: MA-3b3's ticked lock, a Revit decline with no reason carried, a declined create carried, `listChangesets` `status`/`limit`, `package-lock.json`'s version, the dispatcher audit (C1e), MA-3c (the ghost overlay) and MA-3d (web highlights); owed rows from MA-3a … MA-3b3 (a second account, a web-origin carry live, the opened desk report and Refresh live, MA3b2's Show on a create and a type edit, MA3b's R-5, Revit 2025–2027) and from MA2e.
