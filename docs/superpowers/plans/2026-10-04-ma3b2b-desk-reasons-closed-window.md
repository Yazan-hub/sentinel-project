# MA-3b2b — Revit's decline reasons on the web desk, a closed window's result in a dialog, and a lost-reply decline taken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first entry of the MA-3b2 plan's "Next" (`docs/superpowers/plans/2026-10-04-ma3b2-decline-reasons-zoom.md` ▸ Next ▸ MA-3b2b) and the two items drill MA3b2 left, as one drillable slice:
- **Revit's decline reasons on the web review desk.** Under the proposed list, a section **"Recently decided in Revit"**: the newest 10 changesets Revit reported (applied, partially applied, declined), each with who reported it, when, the reviewer's note, its ledger row (`ledger #n`), and every ghost the result did not apply with Revit's reason (`result.reasons`) and the web's (`declined_on_web`) — or the words that it has none. Text only (`textContent`), never HTML (MA-3b2 review C13). A second read beside the proposed one; the desk's ↻ Refresh re-reads both.
- **F-MA3b2-1 fixed.** With the review window closed while a report is out, the report's words reach a TaskDialog. The root cause is **not verified** (it needs Revit); three candidates are closed in one place each, and the drill's row says whether the dialog now shows.
- **A Decline all whose reply was lost is taken, not "refused".** On Retry report the bridge answers 409; the changeset is re-read, and a stored result that is declined with the same rejected ghosts and the same note is this decline, landed earlier.
- **Drill MA3b2b** — short: two web rows (W-1, W-2) on the founder's local app, two Revit rows (R-1, R-2) on Revit 2024 behind the drill proxy.

**Source of truth:** `docs/superpowers/plans/2026-10-04-ma3b2-decline-reasons-zoom.md` ▸ Next ▸ MA-3b2b, its review amendments C13 and "Not changed"; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` ▸ `## Session MA3b2` (F-MA3b2-1; what the drill left on the ledger under key `ma3b2`); `docs/strategy/2026-09-30-revit-addin-audit.md` — AI-2 (`:352`), AI-5 (`:355`). Base: `feature/ma3b2b-desk-reasons` at master `e411406` (MA-3b2 merged). Repo root: `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.

**Scope (tight — one drillable slice, about 240 lines with its checks):** the three items above. All three fit; nothing is split off. Left to **Next** with reasons: a bridge `status` list and `limit` (only if the desk's read proves heavy), `changeset_reverted` on a decided row, the ledger panel printing reasons, a reason box per row, MA-3b3, MA-3b4, MA-3c/d.

**Architecture:**

*Pure (add-in, promote-check §46).* `UnreportedResults.AlreadyTaken(record, fresh)` gains the decline case: a record that applied nothing is taken when `fresh.Status == "declined"`, the stored `result.rejected` set-equals the record's, and the stored `result.note` equals the record's note trimmed (the bridge stores it trimmed, or null). `ReportAll` re-reads on every 409, no longer only for a result with applied ghosts.

*Revit (scans §47; the drill).* `RevitEventHub` keeps Revit's dispatcher (it is made in `App.OnStartup`, on Revit's thread) and raises its `ExternalEvent` on it whoever enqueues; a raise Revit did not take is said in the Doctor log. `ReviewChangesetsCommand.Tell` and the picker's `Load` show a closed window's result through the plain `Enqueue(Action<UIApplication>)` — no DocPin, so no refusal to swallow. `Send`'s continuation catches a summary that throws and says it, with each result's own words.

*Web (vitest; the drill).* `review-desk.ts`: `readDecided` (one `GET /changesets/:key`, kept: the reported ones, newest report first), `readLedger` (one `GET /cde/:key/audit` by changeset id → the `changeset_applied` row ids), pure `decidedView` and `decidedCount`, and a `recent(decided, ledger)` block appended to the desk's body in all three of its endings. **No bridge change** (founder decision F1 A): the 4100 bridge the founder restarted needs nothing more.

**Tech Stack:** C# add-in (`SentinelAddin/`: net48 for Revit 2021–2024, net8 for 2025–2026, net10 for 2027; System.Text.Json 8; WPF); the offline check `tools/promote-check`; the web app (TypeScript, That Open, vitest 2). The Node bridge is read, not changed.

## Global Constraints

- Branch `feature/ma3b2b-desk-reasons` (it holds this plan, on `e411406`); merge `--no-ff` into master only after every task's checks pass **and the live drill MA3b2b is recorded**; push only under the standing push rule, after a secret scan of the range.
- **What must stay true** (a task that would break one of these stops and says so):
  - **No network call on Revit's API thread, and no wait for one in the review**: no `GetAwaiter().GetResult()` and no `.Wait(` in `Commands.ReviewChangesets.cs` (§43 scans it). No new HTTP call in the add-in: the 409 re-read is the existing `FetchOne`, on the pool thread it already runs on.
  - **Nothing MA-3b and MA-3b2 hold is loosened**: the record before the send, one Apply per window, the guard (`Hold();` three times, `Release();` three times), `window.Say(` three times in the command, `UnreportedResults.Delete(` three times.
  - **Words are said, never silent.** A closed window's result reaches the Doctor log *and* a dialog; a raise Revit did not take is said; a summary that throws is said; a ledger row the desk could not read is said on each report (`ledger row not read — …`), never hidden and never a made-up id.
  - **Never a guess.** A 409 is "already taken" only when the stored result is this one (same ghosts, same note); anything else stays "the bridge refused it". The desk says `no reason given for this ghost` rather than inventing one.
  - **Claimed vs verified.** The desk's ledger id comes from the ledger read (the audit route), not from the changeset doc (it holds none).
  - **Text, never HTML (C13).** `review-desk.ts` contains no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`; every new node is made by the panel's `el()` (it sets `textContent`).
  - **Every Revit write stays inside one TransactionGroup per Sentinel action (XC-2)**: this slice writes nothing to the model (a dialog; a queue).
  - **No bridge change, no new database table, no migration.**
- After the add-in task, the builds: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false` for 2022–2027. **Every build of the add-in in the tasks carries `-p:DeployToRevit=false`.**
- net48 rules: no `string.Contains(char)`, no `^1` index, no `record`; a new file names its own `using`s (net48 has only `System`, `System.Collections.Generic`, `System.Linq` as global usings).
- Checks: from `WebApp`, `npx vitest run <files>`; from the repo root, `dotnet run --project tools/promote-check`. A full vitest run rewrites `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` with LF only: when `git diff --ignore-all-space --stat` on it is empty, `git checkout -- WebApp/bridge/fixtures/lod-matrix/ids-cases.json`.
- Each task writes its check first and sees it fail, then the code, then sees it pass. Revit-bound wiring is checked by source scans and proven in the drill.
- No Revit, no deploy and no bridge start during the tasks; the live drill is a separate session. Never run `tools/bridge-start.cmd`, `tools/public-bridge-on.cmd`, `tools/public-bridge-off.cmd` or a `tailscale` command; never call a write route of the founder's bridge on port 4100; never publish to the That Open platform (the publish is the founder's, after the merge).
- `graphify` is not on PATH on this PC: do not try it; the merge message says so.
- Never print or commit secrets (`WebApp/config/.env`, `WebApp/.env`, `WebApp/.npmrc`, `BCF_TOKEN`, `THATOPEN_API_KEY`, `%AppData%/Sentinel/bcf-config.json`); never print the founder's e-mail address (the desk shows `reported_by` on screen — a record of a web row says "the founder's account", never the address); never commit a `.rvt`. The repository is PUBLIC.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Line numbers are `e411406`'s and shift as tasks land: match the quoted text, not the number. The repository checks out with CRLF (`core.autocrlf true`): use the Edit tool, which matches the text and keeps the file's line endings; never `sed -i`; `grep -a` on docs. A new file may be written with LF (git normalises it).

**Dry run (planner, 2026-10-04).** A detached worktree of `feature/ma3b2b-desk-reasons` at `e411406` in the session's scratchpad (`scratchpad/ma3b2b/dry`, `WebApp/node_modules` linked in as a junction; removed afterwards — never the repository). The brief asked for Tasks 1–2; **all four tasks' code** was applied, in order, **from this document's code blocks** (a script holds each block once; it applied them — each replace matched its text exactly once — and wrote them into this plan), each "see it fail" run before its code and each "see it pass" run after. The totals in the steps are those runs':
- Base, measured first: `promote-check` `756/756` (the brief said 695/695 — that was before MA-3b's and MA-3b2's reviews); `src/setups/review-desk.test.ts` `1 passed (1)` file, `10 passed (10)`.
- Task 1: `758/760 checks pass` (2 of §46's 4 fail on the old code) → `760/760 checks pass`.
- Task 2: `758/763 checks pass` (5 fail: the two rewritten lines of §43 and §47's three) → `763/763 checks pass`; `session-check` `47/47`, `docpin-check` `4/4`; builds with `-p:DeployToRevit=false`: 2022 `0 Error(s)` `3 Warning(s)`, 2023 `0`/`3`, 2024 `0`/`5`, 2025 `0`/`1`, 2026 `0`/`1`, 2027 `0`/`3` — master's own counts.
- Task 3: `7 failed | 10 passed (17)` (`TypeError: decidedView is not a function`, and the like) → `1 passed (1)` file, `17 passed (17)`; `npx tsc --noEmit -p .` names no error in `review-desk.ts` or its test (master's 17 errors are elsewhere and unchanged).
- Task 4 (final): the full `npx vitest run` `143 passed (143)` files, `2332 passed | 1 skipped (2333)` (master 2325 + 7); `ids-cases.json` rewritten LF-only with no other change and restored; all 26 check projects: the 25 that count `2380/2380` (master 2373 + 7), `datum-check` `DATUM OK`.
- The drill's proxy script (set-up), on ports 4111 → a stand-in on 4112 with `SLOW_MS=1500`: a plain `POST …/result` passed at once; with `lose`, a GET passed, the first `POST …/result` reached the stand-in and its reply was dropped (curl exit 52, the proxy logged it), the second passed; with `slow`, a GET passed at once, the first `POST …/result` took 1.5 s, the second passed at once.
- Not run: the drill (Revit, the founder's local app) and the tasks' commit commands.

---

## Founder decisions (each has a recommended default, used unless the founder says otherwise)

The plan builds the default of each. None needs an answer before the work starts. **F5 is not a default: it needs the founder's explicit words in chat.**

| # | Choice | Options | Default |
|---|---|---|---|
| F1 | How the desk reads decided changesets and their ledger rows | **A:** no bridge change — one `GET /changesets/:key` (every status; the desk keeps the reported ones) and one `GET /cde/:key/audit` for the rows. **B:** the bridge's list takes a `status` list and a `limit` (one line, one vitest) — another bridge restart. **C:** the bridge stores the ledger id on the changeset (a second write after the audit row; reverses MA-3b's "on the reply only") | **A** — the 4100 bridge the founder already restarted serves the web rows as it is; the ceiling (the whole list is read to show ten) is said in the code and in Risks, and B is in Next for when it bites |
| F2 | How many reports the section shows | **A:** the newest 10, and a line saying so when there are more ("The newest 10 of 14 reports — the older ones are on the ledger."). **B:** all. **C:** paged | **A** — the desk is for what was just decided; the ledger holds the rest |
| F3 | A closed window's result when another model is in front (or its model is closed) | **A:** the dialog shows anyway, in whichever model is in front — its words name the changeset. **B:** keep the DocPin refusal and show it with the words | **A** — a dialog changes nothing in the model; the refusal was the hole (it was swallowed, so nothing showed) |
| F4 | When a decline's 409 is "already taken" | **A:** the changeset is `declined` and its stored result rejects the same ghosts with the same note. **B:** also the same reporter | **A** — the stored reporter is the bridge's resolved actor, the record holds none; B would read a true landing as "refused". Ceiling: another person's decline of the same ghosts with the same note reads as this one — the changeset is declined either way, nothing is lost |
| F5 | The Revit rows of the drill (R-1, R-2) need the branch build deployed to Revit 2024 | The founder's explicit OK in chat for this drill — or the rows are **owed** | none — without the OK only the web rows run |

## Amendments to the brief's words (BINDING — they override any task text they contradict; numbered S1…, so a review's amendments take C1…)

- **S1 (the scout, "three parallel status reads").** One read with no status, filtered on the desk (F1 A): the bridge's list reads every changeset of the project for any status anyway (`changesets-store.mjs listChangesets` filters after `docList`), so three reads would fetch the same rows three times.
- **S2 (the entry, "and the ledger id").** The stored changeset holds no ledger id (`changesets-store.mjs`: "on the reply only, never on the stored doc"). The desk reads it from the ledger (`GET /cde/:key/audit?entity_type=changeset&action_prefix=changeset_applied&entity_id=<ids>`); a report with no row found says `no ledger row found for it`, and a read that failed says `ledger row not read — <why>` on each report.
- **S3 (the entry, "each rejected ghost's reason").** `result.rejected` also holds ghosts Revit removed at commit and every ghost of a rolled-back Apply — not only the reviewer's declines. The desk calls them **not applied**, and a ghost with neither a Revit reason nor a web decline says `no reason given for this ghost` (the note above it may say why).
- **S4 (the brief, "find the root cause").** Not found offline — it cannot be: the hub is Revit-bound. The plan states three candidates and one observation gap (UNSURE 1), closes each candidate, and binds the drill's R-1 to say what the Doctor log holds. The fix is claimed until R-1 passes.
- **S5 (the brief, "adjust the MA-3b C1 check accordingly").** §42's C1 assertion still holds as written (its record rejects nothing); only its words change. The decline's cases are the new §46.
- **S6 (the scout, "`onRefused` shows the words anyway, or the plain Enqueue").** The plain `Enqueue(Action<UIApplication>)` (F3 A) — fewer words on screen, no second path.

## Engineering decisions (taken here; a reviewer may challenge them)

| # | Decision | Why / ceiling |
|---|---|---|
| E1 | The hub raises on the dispatcher it was made on (`Dispatcher.CurrentDispatcher` in a field initialiser; `App.OnStartup` makes the hub on Revit's thread) | One place, every caller (`Commands.BcfIssues`, `NamingManager`, `Standards`, the review). A caller already on Revit's thread raises at once, as before |
| E2 | A `Denied`/`TimedOut` raise is logged, not retried | The job stays in the queue; the next accepted raise drains it. Ceiling: with no later raise it waits — said in the Doctor log |
| E3 | `Load` loses its `Document doc` parameter | Its only use was the DocPin of the dialog |
| E4 | The note is compared trimmed by .NET, the bridge trimmed by JavaScript | They differ on a few rare characters (a leading U+FEFF): such a note reads "refused", as every decline did before this slice |
| E5 | `decidedView` takes the ledger as `number \| null \| Error` | Three different truths, three different words (S2) |
| E6 | Each report is a closed `<details>` whose summary is the head line | Native; a storey's 48 rows do not flood the desk |
| E7 | `readLedger` asks with `limit=1000` and keeps rows whose action is exactly `changeset_applied` | A result is written once, so one row per changeset; the prefix filter is the route's, the exact test is the desk's |
| E8 | The time is the stored ISO time cut to minutes, with `UTC` | Pure and testable; no locale |

---

## File map

| File | Task | What it holds |
|---|---|---|
| `tools/promote-check/Ma3b2b.cs` (new) | 1, 2 | §46 (the decline's 409, pure) and §47 (the hub, the dialog, the summary — scans) |
| `tools/promote-check/Check.cs` | 1, 2 | the two new sections' calls |
| `tools/promote-check/Ma3bDesk.cs` | 1, 2 | §42's C1 words; §43's two lines that quote the dialog |
| `SentinelAddin/Engine/UnreportedResults.cs` | 1 | `AlreadyTaken`'s decline case |
| `SentinelAddin/Commands.ReviewChangesets.cs` | 1, 2 | the 409 re-read for every result; the dialog without DocPin; the summary's catch |
| `SentinelAddin/RevitEventHub.cs` | 2 | the raise on Revit's thread, its result said |
| `WebApp/src/setups/review-desk.test.ts` | 3 | the decided section's words, reads and scans |
| `WebApp/src/setups/review-desk.ts` | 3 | `readDecided`, `readLedger`, `decidedView`, `decidedCount`, `recent` |
| `WebApp/package.json` | 3 | `1.0.41` → `1.0.42` |
| `docs/strategy/2026-09-30-model-automation-design.md` | 4 | what was built |

---

## Tasks (in order: the pure piece; the Revit wiring; the web desk; the words and the final checks. The merge follows the live drill)

### Task 1 — Pure: a decline the bridge already holds is taken

**Files:**
- Create: `tools/promote-check/Ma3b2b.cs`
- Modify: `tools/promote-check/Check.cs`, `tools/promote-check/Ma3bDesk.cs` (the C1 check's words, `:131`)
- Modify: `SentinelAddin/Engine/UnreportedResults.cs` (`AlreadyTaken`, `:149–162`), `SentinelAddin/Commands.ReviewChangesets.cs` (`:223–226`)

**Interfaces:**
- Consumes: `UnreportedResults.Record` (`Applied`, `Rejected`, `Note`, `Name`), `ChangesetDto` (`Status`, `Result` — a `JsonElement?`), `UnreportedResults.StoredReply(ChangesetDto)`, `ChangesetTrust.ReasonsLine(string reply, int sent)`.
- Produces: `public static string AlreadyTaken(Record r, ChangesetDto fresh)` — unchanged signature; now also non-null for a record with no applied ghost when the stored changeset is `declined` with the same rejected set and note. Task 2 adds §47 to the file this task creates.

- [ ] **Step 1: Write the failing check.**

Create `tools/promote-check/Ma3b2b.cs`:

```csharp
#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── 46. MA-3b2b: a decline the bridge already holds is taken, not refused — a Decline all (or a rolled-back Apply) whose reply
    //        was lost and is sent again by Retry report (pure, and the one line that asks) ─────────────────────────────────────────
    static void Ma3b2bDeclineChecks()
    {
        Console.WriteLine("\nMA-3b2b — a decline the bridge already holds is taken, not refused");
        UnreportedResults.Record Decline(string note, params string[] rejected) =>
            new UnreportedResults.Record { Key = "k", ChangesetId = "c", Name = "Promote (DD) · GR-FFL", Rejected = rejected.ToList(), Note = note };
        ChangesetDto Stored(string status, string result) => JsonSerializer.Deserialize<ChangesetDto>($"{{\"id\":\"c\",\"status\":\"{status}\",\"result\":{result}}}");
        const string held = "{\"applied\":[],\"rejected\":[\"b\",\"a\"],\"note\":\"not this package\",\"reasons\":{\"a\":\"stays as it is\"}}";
        const string taken = "\"Promote (DD) · GR-FFL\": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.";

        Ok(UnreportedResults.AlreadyTaken(Decline(" not this package ", "a", "b"), Stored("declined", held)) == taken
           && UnreportedResults.AlreadyTaken(Decline(null, "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"],\"note\":null}")) == taken
           && UnreportedResults.AlreadyTaken(Decline("", "a"), Stored("declined", "{\"applied\":[],\"rejected\":[\"a\"]}")) == taken,
           "a decline whose stored result rejects the same ghosts with the same note (trimmed; none is none) is this decline, landed earlier — taken, said");
        Ok(UnreportedResults.AlreadyTaken(Decline("another reason", "a", "b"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b", "c"), Stored("declined", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("proposed", "null")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("withdrawn", "null")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("partially_applied", held)) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), Stored("declined", "{\"applied\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package"), Stored("declined", "{\"applied\":[],\"rejected\":[],\"note\":\"not this package\"}")) == null
           && UnreportedResults.AlreadyTaken(Decline("not this package", "a", "b"), null) == null,
           "another note, another set of ghosts, a changeset still proposed, withdrawn or partly applied, a stored result with no rejected list, or a record that rejects nothing is not this decline — the 409 stands");
        Ok(ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", held)), 1) == "\n1 decline reason(s) recorded with it."
           && ChangesetTrust.ReasonsLine(UnreportedResults.StoredReply(Stored("declined", held)), 2).StartsWith("\n⚠ 2 decline reason(s) were sent and the bridge kept 1", StringComparison.Ordinal),
           "the reasons of a decline taken earlier are counted from the stored result (C15) — the reasons are not compared, so fewer kept than sent is said");
        string review = Src("Commands.ReviewChangesets.cs");
        Ok(review.Contains("if (!landed && err != null && err.StartsWith(\"Bridge 409\", StringComparison.Ordinal))") && !review.Contains("!landed && r.Applied.Count > 0 && err != null")
           && UnreportedResults.Outcome("Bridge 409: {\"message\":\"changeset is declined — a result can be reported exactly once, from proposed\"}", 0).Words.StartsWith("the bridge refused it", StringComparison.Ordinal),
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2WiringChecks();
```

with:

```csharp
        Ma3b2WiringChecks();
        Ma3b2bDeclineChecks();
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
"review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result, or no applied ghost, is not");
```

with:

```csharp
"review C1: a result the bridge already holds with exactly the record's applied ghosts is taken (said); a proposed, withdrawn or different result is not, nor a record that applied and rejected nothing (a decline: MA-3b2b, section 46)");
```

- [ ] **Step 2: See it fail.** From the repo root: `dotnet run --project tools/promote-check`

Expected: `758/760 checks pass` — two FAIL lines: `a decline whose stored result rejects the same ghosts with the same note …` and `every 409 — a decline's too — is re-read before it is called refused …`.

- [ ] **Step 3: The code.**

In `SentinelAddin/Engine/UnreportedResults.cs`, replace:

```csharp
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if ((r?.Applied?.Count ?? 0) == 0 || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res || !res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid))
                ? $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here."
                : null;
        }
```

with:

```csharp
        /// timeout, Revit closed mid-report, or the audit row threw after the doc was written). Null otherwise — then the 409 stands.
        /// MA-3b2b: a result that applied nothing (Decline all, a rolled-back Apply) is taken when the changeset is declined and its stored
        /// result rejects exactly the record's ghosts with the record's note (the bridge stores it trimmed; none is none). Ceiling: another
        /// person's decline of the same ghosts with the same note reads as this one — nothing is lost, the changeset is declined either
        /// way; who reported it is not compared (the stored actor is the bridge's resolved one). The reasons are not compared: the caller
        /// counts the stored ones (StoredReply), so fewer kept than sent is said.</summary>
        public static string AlreadyTaken(Record r, ChangesetDto fresh)
        {
            if (r == null || fresh?.Status == null || fresh.Status == "proposed") return null;
            if (fresh.Result is not { ValueKind: JsonValueKind.Object } res) return null;
            string taken = $"\"{r.Name}\": the bridge had already taken it (its reply did not reach Revit) — {fresh.Status}; the bridge named no ledger row for it here.";
            if ((r.Applied?.Count ?? 0) == 0)
            {
                if (fresh.Status != "declined" || (r.Rejected?.Count ?? 0) == 0 || !res.TryGetProperty("rejected", out var rej) || rej.ValueKind != JsonValueKind.Array) return null;
                var declined = new HashSet<string>(rej.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()), StringComparer.Ordinal);
                string note = res.TryGetProperty("note", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : "";
                return declined.SetEquals(r.Rejected) && string.Equals(note, (r.Note ?? "").Trim(), StringComparison.Ordinal) ? taken : null;
            }
            if (!res.TryGetProperty("applied", out var a) || a.ValueKind != JsonValueKind.Array) return null;
            var took = new HashSet<string>(a.EnumerateArray()
                .Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("proposal_guid", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                .Where(g => g != null), StringComparer.Ordinal);
            return took.SetEquals(r.Applied.Select(x => x.ProposalGuid)) ? taken : null;
        }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    string taken = null, unread = null;
                    if (!landed && r.Applied.Count > 0 && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal))
```

with:

```csharp
                    // exactly these ghosts is this result, landed earlier (re-read here, on this pool thread; FetchOne is an existing request).
                    // MA-3b2b: a decline too (it applied nothing) — one the bridge holds with the same rejected ghosts and note is taken.
                    string taken = null, unread = null;
                    if (!landed && err != null && err.StartsWith("Bridge 409", StringComparison.Ordinal))
```

What follows without another edit (read it, do not change it): a taken decline goes down the landed branch — `UnreportedResults.Delete` on a record that was never written is a no-op, `rep.Landed` counts it (so `Declined {n} of …` and the rolled-back path's `Reported as declined: …` count it), `ReasonsLine` counts the stored reasons (C15), and `UndoWatcher.Land` with no applied guid posts nothing. A 409 that cannot be re-read keeps the decline in the window (`NotReRead(unread, 0)` ends with `Retry report sends it again.`).

- [ ] **Step 4: See it pass.** `dotnet run --project tools/promote-check` → `760/760 checks pass`.

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b2b.cs tools/promote-check/Check.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/Engine/UnreportedResults.cs SentinelAddin/Commands.ReviewChangesets.cs
git commit -m "fix(addin): MA-3b2b - a decline the bridge already holds is taken, not refused: a 409 on a result that applied nothing is re-read, and a declined changeset whose stored result rejects the same ghosts with the same note is this decline, landed earlier (its reply was lost)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2 — Revit: a closed window's result reaches a dialog (F-MA3b2-1)

**What is known, and what is not.** In drill MA3b2 (Z-4) the window was closed while a 95-second report was out; the report landed (ledger #1813, #1814), the words reached the Doctor log (by the code: the log line is written before the dialog is queued), and no TaskDialog was seen. Nothing more was recorded. The candidates, none verified:

1. **The raise came from a pool thread.** `Tell` runs in `Send`'s continuation (`TaskScheduler.Default`). `RevitEventHub.Enqueue` called `_event.Raise()` right there and ignored its result. Every other hub caller raises from Revit's or a window's thread; the review's own Apply marshals its raise on purpose (`:500`, "ExternalEvent.Raise from the window's thread (Revit's), as every modeless window here raises it"). `Tell` (`:315`) and the picker's `Load` (`:112`) were the only pool-thread raises — and the only jobs that did not show.
2. **The refusal was swallowed.** The dialog was queued with a DocPin and an empty refusal callback (`_ => { }`): with another model in front, or this one closed, nothing showed. In Z-4 the model was probably in front, so this is a real hole but likely not Z-4's cause.
3. **The summary threw.** `Send`'s `words(t.Result)` runs unguarded; an exception there ends the continuation unobserved — no dialog, and no Doctor line either (which Z-4's record does not contradict: its "the Doctor log has the words" is read from the code, not from the screen).
4. *(An observation gap, not a cause.)* Revit was in the background for part of Z-4, and its owned windows hide from UI Automation there (MA3a's lesson): a dialog that did show may not have been seen.

This task closes 1–3; drill row R-1 runs with Revit in front (4) and reads the Doctor log.

**Files:**
- Modify: `tools/promote-check/Ma3b2b.cs` (§47), `tools/promote-check/Check.cs`, `tools/promote-check/Ma3bDesk.cs` (`:271`, `:288`)
- Modify: `SentinelAddin/RevitEventHub.cs` (`:1–23`), `SentinelAddin/Commands.ReviewChangesets.cs` (`:93`, `:97`, `:112`, `:315`, `:327–328`)

**Interfaces:**
- Consumes: `App.Events` (`RevitEventHub`), `App.PanelVm?.LogDoctor(string)`, `ExternalEvent.Raise()` → `ExternalEventRequest`.
- Produces: `RevitEventHub.Enqueue(Action<UIApplication>)` — same signature, callable from any thread; `Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away)` (no `Document`).

- [ ] **Step 1: Write the failing checks.**

In `tools/promote-check/Ma3b2b.cs`, replace:

```csharp
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }
}
```

with:

```csharp
           "every 409 — a decline's too — is re-read before it is called refused; a 409 that is not this result still reads \"the bridge refused it\"");
    }

    // ── 47. MA-3b2b (F-MA3b2-1): the words of a report whose window is closed reach a dialog (source scans — Revit-bound; drill
    //        MA3b2b's row R-1 runs them) ─────────────────────────────────────────────────────────────────────────────────────────
    static void Ma3b2bWiringChecks()
    {
        Console.WriteLine("\nMA-3b2b — a closed window's result is said in a dialog (source scans)");
        string review = Src("Commands.ReviewChangesets.cs"), hub = Src("RevitEventHub.cs");
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        Ok(hub.Contains("using System.Windows.Threading;") && hub.Contains("private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;")
           && hub.Contains("if (_ui.CheckAccess()) Raise();") && hub.Contains("else _ui.BeginInvoke(new Action(Raise));")
           && Count(hub, "_event.Raise()") == 1 && hub.Contains("var raised = _event.Raise();")
           && hub.Contains("if (raised != ExternalEventRequest.Denied && raised != ExternalEventRequest.TimedOut) return;")
           && hub.Contains("App.PanelVm?.LogDoctor($\"Revit did not take a Sentinel action ({raised}) — it stays queued and runs with the next one.\");"),
           "the event hub raises on Revit's own thread whoever enqueues (a report's continuation is a pool thread), and a raise Revit did not take is said in the Doctor log");
        Ok(review.Contains("if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));")
           && review.Contains("App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));")
           && !review.Contains("_ => { }") && !review.Contains("\"say the review's result\""),
           "a closed window's or picker's result is shown in whichever model is in front — a dialog changes nothing, so no DocPin refusal is there to be swallowed");
        Ok(review.Contains("try { said = words(t.Result); }")
           && review.Contains("catch (Exception ex) { said = $\"The report's summary could not be built — {ex.GetType().Name}: {ex.Message}\"; }")
           && review.Contains("Tell(said + (t.Result.Words.Count > 0 ? \"\\n\\n\" + t.Result.Text : \"\"));") && !review.Contains("Tell(words(t.Result)"),
           "a summary that throws is said, with each result's own words after it — the continuation never ends without words");
    }
}
```

In `tools/promote-check/Check.cs`, replace:

```csharp
        Ma3b2bDeclineChecks();
```

with:

```csharp
        Ma3b2bDeclineChecks();
        Ma3b2bWiringChecks();
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, words), _ => { });") && Count(review, "window.Say(") == 3
```

with:

```csharp
           && review.Contains("if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));") && Count(review, "window.Say(") == 3 // MA-3b2b: no DocPin, no swallowed refusal
```

In `tools/promote-check/Ma3bDesk.cs`, replace:

```csharp
           && review.Contains("if (picker.Gone)") && review.Contains("App.Events.Enqueue(doc, \"say the review's result\", (_, _) => TaskDialog.Show(Title, rep.Text), _ => { });")
```

with:

```csharp
           && review.Contains("if (picker.Gone)") && review.Contains("App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text));") // MA-3b2b
```

- [ ] **Step 2: See them fail.** `dotnet run --project tools/promote-check`

Expected: `758/763 checks pass` — five FAIL lines: §43's `review C2, M3: …` and `review C11: …` (their quoted lines changed), and §47's three.

- [ ] **Step 3: The code.**

In `SentinelAddin/RevitEventHub.cs`, replace:

```csharp
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
```

with:

```csharp
using System.Windows.Threading;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
```

In `SentinelAddin/RevitEventHub.cs`, replace:

```csharp
    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        _event.Raise();
    }
```

with:

```csharp
    // MA-3b2b (F-MA3b2-1): Revit's own thread — the hub is made in App.OnStartup, on it.
    private readonly Dispatcher _ui = Dispatcher.CurrentDispatcher;

    public RevitEventHub() => _event = ExternalEvent.Create(this);

    public void Enqueue(Action<UIApplication> action)
    {
        lock (_lock) _work.Enqueue(action);
        // MA-3b2b (F-MA3b2-1): a report's continuation enqueues from a pool thread — the only callers that did, and the one job that
        // did not show (drill MA3b2, Z-4). Every raise now happens on Revit's thread, as every modeless window here raises.
        if (_ui.CheckAccess()) Raise();
        else _ui.BeginInvoke(new Action(Raise));
    }

    private void Raise()
    {
        var raised = _event.Raise();
        if (raised != ExternalEventRequest.Denied && raised != ExternalEventRequest.TimedOut) return;
        // Said, never silent: the job is still in the queue and runs when Revit takes a later raise.
        try { App.PanelVm?.LogDoctor($"Revit did not take a Sentinel action ({raised}) — it stays queued and runs with the next one."); }
        catch { /* the pane itself is gone */ }
    }
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away, Document doc) => Task.Run(async () =>
```

with:

```csharp
    private static void Load(ChangesetPickerWindow picker, BcfConfig cfg, string key, Task<Reported> retried, string away) => Task.Run(async () =>
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
string.Join("\n", away.Select(r => $"\"{r.Name}\" in {r.Doc}. {UnreportedResults.DeleteOnce(r)}")), doc);
```

with:

```csharp
string.Join("\n", away.Select(r => $"\"{r.Name}\" in {r.Doc}. {UnreportedResults.DeleteOnce(r)}")));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
                    App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, rep.Text), _ => { });
```

with:

```csharp
                    App.Events.Enqueue(_ => TaskDialog.Show(Title, rep.Text)); // MA-3b2b: no DocPin — see Tell
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            if (!interim) App.Events.Enqueue(doc, "say the review's result", (_, _) => TaskDialog.Show(Title, words), _ => { });
```

with:

```csharp
            // MA-3b2b (F-MA3b2-1): a dialog changes nothing in the model, so it needs no DocPin — whose refusal (another model in front,
            // this one closed) was swallowed here, and the result never shown. Said in whichever model is in front.
            if (!interim) App.Events.Enqueue(_ => TaskDialog.Show(Title, words));
```

In `SentinelAddin/Commands.ReviewChangesets.cs`, replace:

```csharp
            left = t.Result.Left;
            Tell(words(t.Result) + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
```

with:

```csharp
            left = t.Result.Left;
            // MA-3b2b (F-MA3b2-1): a summary that throws would end this continuation unobserved, with no words at all — said instead,
            // with each result's own words (its ledger row, what is kept) after it.
            string said;
            try { said = words(t.Result); }
            catch (Exception ex) { said = $"The report's summary could not be built — {ex.GetType().Name}: {ex.Message}"; }
            Tell(said + (t.Result.Words.Count > 0 ? "\n\n" + t.Result.Text : ""));
```

- [ ] **Step 4: See them pass, and the builds.** `dotnet run --project tools/promote-check` → `763/763 checks pass`. `dotnet run --project tools/session-check` → `47/47 checks pass`. Then, each with `-p:DeployToRevit=false`:

```bash
for v in 2022 2023 2024 2025 2026 2027; do printf "$v: "; dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=$v -p:DeployToRevit=false 2>&1 | grep -E "Warning\(s\)|Error\(s\)|error CS" | sort -u | tr '\n' ' '; echo; done
```

Expected: `0 Error(s)` six times; warnings 2022 `3`, 2023 `3`, 2024 `5`, 2025 `1`, 2026 `1`, 2027 `3` (master's counts).

- [ ] **Step 5: Commit.**

```bash
git add tools/promote-check/Ma3b2b.cs tools/promote-check/Check.cs tools/promote-check/Ma3bDesk.cs SentinelAddin/RevitEventHub.cs SentinelAddin/Commands.ReviewChangesets.cs
git commit -m "fix(addin): MA-3b2b - a closed window's result reaches a dialog (F-MA3b2-1): the event hub raises on Revit's own thread whoever enqueues (a report's continuation is a pool thread) and says a raise Revit did not take; the result's dialog needs no DocPin, so no refusal is swallowed; a summary that throws is said with each result's own words. Root cause claimed, not verified - drill MA3b2b R-1" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3 — Web: "Recently decided in Revit" on the review desk

**Files:**
- Modify: `WebApp/src/setups/review-desk.test.ts` (the import at `:11`; a new `describe` before the Refresh scan at `:103`)
- Modify: `WebApp/src/setups/review-desk.ts` (the header comment; `PendingChangeset` at `:21`; `readPending` at `:80–88`; the panel: `recent` after `let seq = 0;`, `show()` at `:169–175` and its end)
- Modify: `WebApp/package.json:3`

**Interfaces:**
- Consumes: `bfetch(url)` (`./bridge-fetch`, mocked in the test), `ghostLine(el)`, the panel's `el(tag, text, css)` (it sets `textContent`), the fixture `bridge/fixtures/changeset-ops/ma3a-review.json` (`after`, `revit_reasons.result`, `revit_reasons.stored`). The bridge, unchanged: `GET /changesets/:key` → the changesets, each with `result` (`applied[]`, `rejected[]`, `note`, `reported_at`, `reported_by`, `declined_on_web[]`, `reasons?`); `GET /cde/:key/audit?…` → `{ rows: [{ id, entity_id, action, … }], total }`.
- Produces: `export interface DeskResult`, `export interface DecidedView { head: string; note: string | null; declined: { line: string; why: string[] }[] }`, `export const DECIDED_MAX = 10`, `export async function readDecided(base: string, key: string): Promise<PendingChangeset[]>`, `export async function readLedger(base: string, key: string, ids: string[]): Promise<Map<string, number>>`, `export const decidedCount: (n: number) => string`, `export function decidedView(cs: PendingChangeset, ledger: number | null | Error): DecidedView`; `readPending` keeps its signature.

- [ ] **Step 1: Write the failing tests.**

In `WebApp/src/setups/review-desk.test.ts`, replace:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset } from "./review-desk";
```

with:

```ts
import { storeyOf, groupDesk, ghostLine, reviewWords, canDecide, canReopen, readPending, postReview, postReopen, rowWords, postsFor, type PendingChangeset,
  readDecided, readLedger, decidedView, decidedCount, DECIDED_MAX } from "./review-desk";
```

In `WebApp/src/setups/review-desk.test.ts`, replace:

```ts
describe("↻ Refresh re-reads the desk without reloading the site (source scan: no DOM here)", () => {
```

with:

```ts
describe("recently decided in Revit (MA-3b2b)", () => {
  const rr = fx.revit_reasons;
  const reported = (id: string, status: string, reported_at: string): PendingChangeset => ({
    ...after, id, status,
    result: {
      applied: rr.result.applied, rejected: rr.result.rejected, note: rr.result.note, reported_at, reported_by: "modeller@example.com",
      declined_on_web: [
        { proposal_guid: "g-1", by: "reviewer@example.com", role: "contributor", reason: "wrong type: W 1 is a party wall" },
        { proposal_guid: "g-4", by: "reviewer@example.com", role: "contributor", reason: "no fire strategy issued yet" },
      ],
      reasons: rr.stored,
    },
  });
  const A = "0b0f6c1e-8a59-4d0a-9d6e-3f1f2a6c7e11", B = "7c2d9a40-11aa-4e0b-8a77-5d3e9f0c2b22";
  const cs = reported(A, "partially_applied", "2026-10-04T13:44:10.123Z");
  beforeEach(() => { bfetch.mockReset(); });

  it("a reported changeset in words: who, when, the counts, the ledger row, the note, and each ghost not applied with Revit's reason and the web's", () => {
    const v = decidedView(cs, 1811);
    expect(v.head).toBe("Promote (DD) · GR-FFL — partially applied in Revit by modeller@example.com · 2026-10-04 13:44 UTC · 1 applied, 3 not applied · ledger #1811");
    expect(v.note).toBe("GR-FFL reviewed in Revit");
    expect(v.declined).toEqual([
      { line: "W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: a party wall, as the web desk said", "web, reviewer@example.com (contributor): wrong type: W 1 is a party wall"] },
      { line: "W 2 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm", why: ["Revit: W 2 is demolished in the next package"] },
      { line: 'Basic Wall : BDS_EXT_ARC_CMU_200 mm · FireRating "" → "60 min" (a type edit: it reaches every element of the type)', why: ["web, reviewer@example.com (contributor): no fire strategy issued yet"] },
    ]);
  });

  it("claimed vs verified: a ledger row that was not found or not read is said, never a made-up id; a ghost with no reason says so", () => {
    expect(decidedView(cs, null).head).toMatch(/ · no ledger row found for it$/);
    expect(decidedView(cs, new Error("not read — HTTP 500")).head).toMatch(/ · ledger row not read — HTTP 500$/);
    const bare = decidedView({ ...cs, status: "declined", result: { ...cs.result!, applied: [], rejected: ["g-2", "constructor"], note: null, reported_at: "", declined_on_web: undefined, reasons: undefined } }, 7);
    expect(bare.head).toBe("Promote (DD) · GR-FFL — declined in Revit by modeller@example.com · an unknown time · 0 applied, 2 not applied · ledger #7");
    expect(bare.note).toBeNull();
    expect(bare.declined).toEqual([{ line: "W 1 · GR-FFL → top 01-FFL", why: ["no reason given for this ghost"] }, { line: "constructor", why: ["no reason given for this ghost"] }]);
  });

  it("C13: a reason is text — markup typed in Revit comes back as the same characters, for textContent", () => {
    const v = decidedView({ ...cs, result: { ...cs.result!, reasons: { "g-3": '<b onclick="x()">not this</b>' } } }, 1);
    expect(v.declined[1].why).toEqual(['Revit: <b onclick="x()">not this</b>']);
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });

  it("the heading says how many reports are shown", () => {
    expect(DECIDED_MAX).toBe(10);
    expect(decidedCount(3)).toBe("3 report(s), newest first.");
    expect(decidedCount(14)).toBe("The newest 10 of 14 reports — the older ones are on the ledger.");
  });

  it("readDecided reads every changeset and keeps the reported ones, newest report first; a failure is 'not read — …'", async () => {
    const older = reported(B, "declined", "2026-10-04T09:00:00.000Z");
    bfetch.mockResolvedValueOnce(res(200, [after, older, { ...after, id: "w", status: "withdrawn" }, cs]));
    expect((await readDecided("http://b/", "demo")).map((c) => c.id)).toEqual([A, B]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/changesets/demo");
    bfetch.mockResolvedValueOnce(res(403, { message: "not a member" }));
    await expect(readDecided("http://b", "demo")).rejects.toThrow("not read — not a member");
  });

  it("readLedger asks the ledger for the reports' rows by changeset id; none asked is no read; a failure is 'not read — …'", async () => {
    expect((await readLedger("http://b", "demo", [])).size).toBe(0);
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValueOnce(res(200, { rows: [{ id: 1813, entity_id: B, action: "changeset_applied" }, { id: 1811, entity_id: A, action: "changeset_applied" }], total: 2 }));
    expect([...(await readLedger("http://b/", "demo key", [A, B]))]).toEqual([[B, 1813], [A, 1811]]);
    expect(bfetch.mock.calls[0][0]).toBe(`http://b/cde/demo%20key/audit?entity_type=changeset&action_prefix=changeset_applied&entity_id=${A},${B}&limit=1000`);
    bfetch.mockResolvedValueOnce(res(400, { message: "entity_id must be a uuid or a comma list of uuids" }));
    await expect(readLedger("http://b", "demo", ["x"])).rejects.toThrow("not read — entity_id must be a uuid or a comma list of uuids");
    bfetch.mockResolvedValueOnce(res(200, { total: 0 }));
    await expect(readLedger("http://b", "demo", [A])).rejects.toThrow("not read — the bridge answered without rows");
  });

  it("the desk reads the decided list beside the proposed one, Refresh re-reads both, and the section shows when nothing waits (source scan)", () => {
    const src = readFileSync(new URL("./review-desk.ts", import.meta.url), "utf8");
    expect(src).toContain("const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);");
    expect(src).toContain('if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), recent(decided, ledger)); return; }');
    expect(src).toContain('if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), recent(decided, ledger)); return; }');
    expect(src.split("recent(decided, ledger)").length - 1).toBe(3);
  });
});

describe("↻ Refresh re-reads the desk without reloading the site (source scan: no DOM here)", () => {
```

- [ ] **Step 2: See them fail.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts`

Expected: `7 failed | 10 passed (17)` — `TypeError: decidedView is not a function` (and `readDecided`, `readLedger`, `decidedCount`; the scan's missing lines).

- [ ] **Step 3: The code, and the version.**

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; }
```

with:

```ts
/** What Revit reported on a changeset (bridge reportResult). `reasons` — Revit's reason per ghost — is there only when one was sent. */
export interface DeskResult {
  applied: { proposal_guid: string }[]; rejected: string[]; note: string | null; reported_at: string; reported_by: string;
  declined_on_web?: { proposal_guid: string; by: string; role: string; reason: string }[];
  reasons?: Record<string, string>;
}
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; result?: DeskResult | null; }
export interface DecidedView { head: string; note: string | null; declined: { line: string; why: string[] }[]; }
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export async function readPending(base: string, key: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(at(base, key, "?status=proposed")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}
```

with:

```ts
async function readList(url: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(url); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export const readPending = (base: string, key: string): Promise<PendingChangeset[]> => readList(at(base, key, "?status=proposed"));

// ── MA-3b2b: recently decided in Revit — what Revit reported, with its reason per ghost. Read-only; every string here is rendered
//    with textContent (a reason is free text typed in Revit — MA-3b2 review C13). ──

/** How many reports the desk shows, newest first; decidedCount says when there are more. */
export const DECIDED_MAX = 10;
const DECIDED: Record<string, string> = { applied: "applied", partially_applied: "partially applied", declined: "declined" };

/** GET /changesets/:key — every changeset (the bridge's list takes one status or none); kept: the ones Revit reported, newest report
 *  first. Any failure throws "not read — <why>". ponytail: the whole list is read to show ten; a bridge `status` list + `limit` when a
 *  project's list grows heavy (Next). */
export async function readDecided(base: string, key: string): Promise<PendingChangeset[]> {
  return (await readList(at(base, key)))
    .filter((c) => c.status in DECIDED && !!c.result)
    .sort((a, b) => (a.result!.reported_at < b.result!.reported_at ? 1 : a.result!.reported_at > b.result!.reported_at ? -1 : 0));
}

/** The ledger rows of the reports (the stored changeset holds no row id): GET /cde/:key/audit by changeset id → changeset id → row id.
 *  No id asked is no read. Any failure throws "not read — <why>" — the desk then says the row was not read, never a made-up id. */
export async function readLedger(base: string, key: string, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  let r: Response;
  try { r = await bfetch(`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=changeset_applied&entity_id=${ids.map(encodeURIComponent).join(",")}&limit=1000`); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { rows?: { id: number; entity_id: string; action: string }[]; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.rows)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without rows" : `HTTP ${r.status}`)}`);
  return new Map(j.rows.filter((x) => x.action === "changeset_applied").map((x) => [x.entity_id, x.id]));
}

/** "3 report(s), newest first." — or that only the newest DECIDED_MAX are shown. */
export const decidedCount = (n: number): string =>
  n > DECIDED_MAX ? `The newest ${DECIDED_MAX} of ${n} reports — the older ones are on the ledger.` : `${n} report(s), newest first.`;

/** One reported changeset in words. `ledger`: its row id; null when the ledger read found none; the Error of a read that failed.
 *  Each ghost the result did not apply carries Revit's reason (result.reasons) and the web's (declined_on_web) — or says it has none. */
export function decidedView(cs: PendingChangeset, ledger: number | null | Error): DecidedView {
  const r = cs.result!;
  const at = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(r.reported_at ?? "") ? `${r.reported_at.slice(0, 10)} ${r.reported_at.slice(11, 16)} UTC` : "an unknown time";
  const row = ledger instanceof Error ? `ledger row ${ledger.message}` : ledger != null ? `ledger #${ledger}` : "no ledger row found for it";
  const byGuid = new Map((cs.elements ?? []).map((e) => [e.proposal_guid, e]));
  const web = new Map((r.declined_on_web ?? []).map((d) => [d.proposal_guid, d]));
  const revit = (g: string): string | null => (r.reasons && Object.prototype.hasOwnProperty.call(r.reasons, g) ? r.reasons[g] : null);
  return {
    head: `${cs.name} — ${DECIDED[cs.status] ?? cs.status} in Revit by ${r.reported_by} · ${at} · ${r.applied.length} applied, ${r.rejected.length} not applied · ${row}`,
    note: r.note ?? null,
    declined: r.rejected.map((g) => {
      const el = byGuid.get(g), w = web.get(g), why: string[] = [];
      if (revit(g)) why.push(`Revit: ${revit(g)}`);
      if (w) why.push(`web, ${w.by} (${w.role}): ${w.reason}`);
      return { line: el ? ghostLine(el) : g, why: why.length ? why : ["no reason given for this ghost"] };
    }),
  };
}
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
  let seq = 0;

  const decide = async
```

with:

```ts
  let seq = 0;

  // MA-3b2b: what Revit reported, under the proposed list. Every node is made by el() — textContent, never markup (C13).
  const recent = (decided: PendingChangeset[] | Error, ledger: Map<string, number> | Error): HTMLElement => {
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Recently decided in Revit", "font-weight:600"));
    if (decided instanceof Error) { box.append(el("div", `Reports ${decided.message}`, "color:#fca5a5")); return box; }
    if (!decided.length) { box.append(el("div", "Revit has reported no changeset on this project.", "color:#8b93a1")); return box; }
    box.append(el("div", decidedCount(decided.length), "color:#8b93a1"));
    for (const cs of decided.slice(0, DECIDED_MAX)) {
      const v = decidedView(cs, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null);
      const one = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      one.append(el("summary", v.head, "cursor:pointer"));
      one.append(el("div", v.note ? `Note: ${v.note}` : "No note.", "margin:.3rem 0;color:#8b93a1"));
      if (v.declined.length) one.append(el("div", `Not applied (${v.declined.length}):`, "margin:.3rem 0 .1rem;color:#8b93a1"));
      for (const g of v.declined) {
        const row = el("div", "", "padding:.15rem 0");
        row.append(el("div", g.line), ...g.why.map((w) => el("div", w, "color:#fca5a5")));
        one.append(row);
      }
      box.append(one);
    }
    return box;
  };

  const decide = async
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
    const [role, pending] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
```

with:

```ts
    const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
    // MA-3b2b: the ledger rows of the reports shown — a read of its own, so a ledger that cannot be read is said on each report.
    const ledger = decided instanceof Error ? new Map<string, number>() : await readLedger(base, key, decided.slice(0, DECIDED_MAX).map((c) => c.id)).catch((e: Error) => e);
    if (mine !== seq) return;
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5")); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project.")); return; }
```

with:

```ts
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), recent(decided, ledger)); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), recent(decided, ledger)); return; }
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
      body.append(box);
    }
  }
  onActiveProjectChange(() => void show());
```

with:

```ts
      body.append(box);
    }
    body.append(recent(decided, ledger));
  }
  onActiveProjectChange(() => void show());
```

In `WebApp/src/setups/review-desk.ts`, replace:

```ts
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
```

with:

```ts
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
// MA-3b2b: under it, "Recently decided in Revit" — the changesets Revit reported (a second read beside the proposed one), each with
// who, when, the note, its ledger row and every ghost it did not apply with Revit's reason (result.reasons) and the web's.
```

In `WebApp/package.json`, replace:

```json
  "version": "1.0.41",
```

with:

```json
  "version": "1.0.42",
```

- [ ] **Step 4: See them pass.** From `WebApp`: `npx vitest run src/setups/review-desk.test.ts` → `1 passed (1)` file, `17 passed (17)`. Then `npx tsc --noEmit -p . 2>&1 | grep -c review-desk` → `0` (master's own errors, in `main.ts` and `sentinel-core`, are not this task's).

- [ ] **Step 5: Commit.**

```bash
git add WebApp/src/setups/review-desk.ts WebApp/src/setups/review-desk.test.ts WebApp/package.json
git commit -m "feat(web): MA-3b2b - the review desk lists what Revit reported (Recently decided in Revit): the newest 10 changesets applied, partially applied or declined, each with who, when, the note, its ledger row (read from the ledger, said when not read) and every ghost not applied with Revit's reason and the web's - as text, never HTML; a second read beside the proposed list, re-read by Refresh; no bridge change; 1.0.42" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4 — Words: the design doc; the final checks

**Files:**
- Modify: `docs/strategy/2026-09-30-model-automation-design.md` (the end of the line at `:1106`)

- [ ] **Step 1: The design doc says what was built.**

In `docs/strategy/2026-09-30-model-automation-design.md`, replace:

```markdown
Revit's reasons on the web desk are MA-3b2b.
```

with:

```markdown
Revit's reasons on the web desk: BUILT on `feature/ma3b2b-desk-reasons` (MA-3b2b), drill MA3b2b pending — the desk's "Recently decided in Revit" lists the newest 10 changesets Revit reported (applied, partially applied, declined) with who, when, the note, the ledger row and each ghost not applied with Revit's reason and the web's, as text; a closed window's result reaches a dialog (the event hub raises on Revit's thread; no swallowed refusal); a Decline all whose reply was lost is taken on Retry report, not called refused.
```

- [ ] **Step 2: The final checks.** From `WebApp`: `npx vitest run` → `143 passed (143)` files, `2332 passed | 1 skipped (2333)`; restore `ids-cases.json` (Global Constraints). From the repo root, every check project:

```bash
for d in tools/*-check; do ls $d/*.csproj >/dev/null 2>&1 || continue; printf "%s: " $(basename $d); dotnet run --project $d 2>&1 | grep -E "checks? pass|DATUM OK" | tail -1; done
```

Expected: 26 lines — `promote-check: 763/763`, `session-check: 47/47`, the other 23 as on master (together `2380/2380`) — and `datum-check: DATUM OK`. `tools/rvtinfo-check` has no project and is skipped.

- [ ] **Step 3: Commit.**

```bash
git add docs/strategy/2026-09-30-model-automation-design.md
git commit -m "docs: MA-3b2b - the design doc says what was built (Revit's reasons on the web desk, a closed window's result in a dialog, a lost-reply decline taken); drill MA3b2b pending" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Live drill MA3b2b (two web rows on the founder's local app; two Revit rows on Revit 2024 behind the drill proxy — on the branch, before the merge)

**The founder's OK first (F5).** The Revit rows' set-up deploys the branch's add-in into Revit 2024. That needs the founder's explicit OK in chat for this drill; without it R-1 and R-2 are **owed**, W-2's second half is owed with them, and only W-1 and W-2's first half run. The web rows need no deploy and no publish: the founder's local app (`web-dev`, port 4000, this checkout on the branch) against the 4100 bridge as it runs — **no bridge restart** (no bridge file changed).

**Who does what.** The web rows are read on the founder's signed-in local app — the founder's, or the runner reading that tab (the runner types no password and signs nobody in). The record never quotes the address the desk shows as "by": it says "the founder's account". The Revit rows: the runner drives Revit by mouse (or UI Automation's Invoke), Revit signed in (Standards ▸ Sign in — the founder's). **Focus-sensitive steps** — reading the review window, closing it, reading a TaskDialog — happen while Revit is in front, or are the founder's: a script cannot take focus from Chrome, and Revit's owned windows hide from UI Automation while Revit is in the background (a hidden window looked closed in MA3a — and may be why Z-4 saw no dialog). TaskDialog buttons have no UIA Invoke (`WindowPattern.Close` works). Revit's Undo list opens at its dropdown (`133,10`): read it, **never click an entry**. The pane's grid virtualizes (read it through `ScrollPattern`). Opening and closing Revit for the drill is authorized; never discard the founder's unsaved work; never open an app that is already running — switch to its window. Open the scratch copy from Revit's Open dialog; never save it.

**The Revit MCP in this drill:** only its read-only calls, never while a Revit command, a TaskDialog or a Sentinel window is open.

**Owed before the first row** (named up front, so "not run" is never read as a pass):
- **Revit 2025/2026/2027**: not run (tight scope); the code is the same on net8/net10 and builds there (Task 2).
- **The published app**: not run — the publish is the founder's, after the merge; the rows run on the local app.
- **A closed window's result with another model in front, or its model closed** (F3 A), **a raise Revit refuses** (`Denied`/`TimedOut`), **a summary that throws**, **a closed picker's result**: checked by scan (§47), not provoked.
- **A rolled-back Apply whose reply was lost**, **a 409 that is another person's decline** (the ceiling of F4): checked offline (§46), not provoked.
- **A project with more than 10 reports**, **a ledger read that fails**, **a viewer's desk**: checked offline (vitest), not provoked — unless the founder's own project shows one, then it is recorded.
- **MA3b2's owed rows** (Show on a create and on a type edit, the tab refusal, MA3b's R-5) stay owed; this drill does not carry them.
- **Which candidate was Z-4's cause** stays unsettled even if R-1 passes (S4): the row proves the dialog shows with the fix, not why it did not without it.

**Set-up for the web rows:** the `web-dev` preview (port 4000) from this checkout on the branch; the founder signed in there; the 4100 bridge running (not touched). Nothing else.

**Set-up for the Revit rows (once, after the founder's OK):**
- **Build.** Close Revit. Record the deployed `Sentinel.dll` under `%AppData%\Autodesk\Revit\Addins\2024` (`certutil -hashfile "<that Sentinel.dll>" SHA256`). `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (it deploys the branch's build); record `git rev-parse --short HEAD` and the new DLL's sha256.
- **The add-in's bridge settings.** Copy `%AppData%\Sentinel\bcf-config.json` to `bcf-config.json.ma3b2bbak` beside it (never print it, never open it in a viewer); point it at the drill's port: `node -e 'const fs = require("fs"), f = process.env.APPDATA + "/Sentinel/bcf-config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.serviceUrl = process.argv[1]; fs.writeFileSync(f, JSON.stringify(c, null, 2)); console.log("serviceUrl set")' http://127.0.0.1:4101`.
- **The test bridge on 127.0.0.1:4102, behind the drill proxy on 4101.** Two preview servers, added to `.claude/launch.json` beside `bridge-test` and removed in the closing list:
  - `ma3b2b-bridge` — `node <scratchpad>/ma3b2b/bridge-4102.mjs`, `cwd` `WebApp`, port 4102; the file is three lines: `process.env.BCF_PORT = "4102"; process.env.BCF_EVENT_POLL_MS = "0"; await import("file:///C:/Users/yazan/Claude/Projects/Co%20BIM%20Assistant/sentinel-project/WebApp/bridge/bcf-service.mjs");`. Its banner names port 4102.
  - `ma3b2b-proxy` — `node <scratchpad>/ma3b2b/proxy.mjs`, port 4101. The planner left the file there; if it is gone, write it again:

    ```js
    // Drill MA3b2b's door: 127.0.0.1:4101 -> the test bridge on 127.0.0.1:4102. An empty file beside this script sets its mood, for the
    // FIRST POST .../result it sees (restart the proxy for another): "slow" delays the bridge's answer by 95 s (the bridge has taken the
    // result; Revit still waits); "lose" drops the answer (the bridge has taken the result; Revit never hears).
    import http from "node:http";
    import { existsSync } from "node:fs";
    const mood = (m) => existsSync(new URL(m, import.meta.url));
    const SLOW_MS = Number(process.env.SLOW_MS || 95000), PORT = Number(process.env.PROXY_PORT || 4101), UP = Number(process.env.UP_PORT || 4102);
    let once = false;
    http.createServer((req, res) => {
      const first = !once && req.method === "POST" && req.url.endsWith("/result") && (mood("slow") || mood("lose"));
      const lose = first && mood("lose");
      if (first) once = true;
      const up = http.request({ host: "127.0.0.1", port: UP, method: req.method, path: req.url, headers: req.headers }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          if (lose) { console.log(`lost the reply to ${req.url} - the bridge answered ${r.statusCode}`); res.destroy(); return; }
          setTimeout(() => { res.writeHead(r.statusCode, r.headers); res.end(Buffer.concat(chunks)); }, first ? SLOW_MS : 0);
        });
      });
      up.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end(`drill proxy: the test bridge on ${UP} did not answer - ${e.message}`); });
      req.pipe(up);
    }).listen(PORT, "127.0.0.1", () => console.log(`drill proxy on 127.0.0.1:${PORT} -> ${UP}`));
    ```

    A mood is an empty file beside it: `touch <scratchpad>/ma3b2b/slow` / `rm …/slow`, the same for `lose`. Neither exists at the start.
  - `curl -s http://127.0.0.1:4101/health` answers through the proxy. The founder's 4100 bridge is not touched. Every bridge call of the runner names `http://127.0.0.1:4101` through the helper (the machine credential, read through `load-env.mjs`, never printed), from `WebApp`:

  ```bash
  b4101() { node -e 'import("./bridge/load-env.mjs").then(async m => { const [method, path, body] = process.argv.slice(1); const r = await fetch("http://127.0.0.1:4101/" + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (m.loadEnv().BCF_TOKEN || process.env.BCF_TOKEN || "") }, ...(body ? { body: body.startsWith("@") ? require("fs").readFileSync(body.slice(1), "utf8") : body } : {}) }); console.log(r.status, await r.text()) })' "$@"; }
  ```

- **The scratch web projects** (fresh keys — `ma3b2`'s storeys are decided): `b4101 POST cde/projects '{"key":"ma3b2b-office","kind":"office"}'`, `b4101 POST cde/projects '{"key":"ma3b2b","office_key":"ma3b2b-office"}'`; on the office: `b4101 PUT "cde/ma3b2b-office/artefacts/guideline?actor=drill" @../demo/bds-pilot/bds-dd-elements-guideline.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/type_catalog?actor=drill" @../demo/bds-pilot/bds-type-catalog.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/lod_matrix?actor=drill" @../demo/bds-pilot/bds-lod-matrix-dd-ma2b.json`, `b4101 PUT "cde/ma3b2b-office/artefacts/ruleset?actor=drill" @../demo/bds-pilot/ruleset.json` (each 201). The founder's membership (the e-mail never reaches a command line, a log or the record): the founder writes `{"email":"<their account>","role":"contributor"}` to `<scratchpad>/ma3b2b/member.json`; the runner sends `b4101 POST cde/ma3b2b/members @<scratchpad>/ma3b2b/member.json | grep -oE '^[0-9]+|"user_id":"[^"]*"'` (the status and the `user_id` only) and deletes the file.
- **The scratch model**: `Documents\Sentinel drills\ma3b2b\ma3b2b-a.rvt`, a copy of `Documents\sentinel-scratch\ma1\ma1-src_detached.rvt` (the B35 seed), opened from Revit's Open dialog, bound with Sentinel ▸ Project Setup to `ma3b2b`, never saved. A floor plan of GR-FFL is the active view.
- **Promote once**: Sentinel ▸ Promote (DD) → **Yes**; close the review window it opens with ×. Record what it filed (drill MA3b2: GR-FFL 48 ghosts — `retype wall (24)` first — 01-FFL 40, MA0 Roof 1).

| Row | Steps | Pass when | Record |
|---|---|---|---|
| W-1 — the section, on what drill MA3b2 left | On the local app (`http://localhost:4000`), signed in, project `ma3b2` (the founder is a contributor there), the **Review** tab. Read the desk from top to bottom; open the report of `Promote (DD) · GR-FFL` | Above: the proposed list still shows `Promote (DD) · MA0 Roof` (1 ghost). Under it **Recently decided in Revit**, `2 report(s), newest first.`: first `Promote (DD) · 01-FFL — applied in Revit by <the founder's account> · 2026-10-04 <hh:mm> UTC · 40 applied, 0 not applied · ledger #1813`; then `Promote (DD) · GR-FFL — partially applied in Revit by <the founder's account> · 2026-10-04 <hh:mm> UTC · 24 applied, 24 not applied · ledger #1811`. Opened, GR-FFL shows its note (or `No note.`), `Not applied (24):`, and under each of the 24 rows `Revit: drill MA3b2: these stay as they are until the slab is set`. If the founder is not signed in or not a member, the desk says so in words and the row is **owed**, not failed | Both head lines (the account not quoted), the note line, the count of rows carrying the reason, two rows quoted; a screenshot |
| R-1 — F-MA3b2-1 | (After the Revit set-up.) `touch <scratchpad>/ma3b2b/slow`. Review AI Proposals ▸ GR-FFL ▸ **Review**. On `retype wall`: **Untick group**; put `<b>drill MA3b2b</b> stays as modelled` in its reason box (the founder types it, or UIA `ValuePattern.SetValue`); press **Apply … ticked in Revit**; at the DD IDS dialog, **Place anyway**; note the time. When the window reads `Reporting to the bridge…`, close it with ×. **Keep Revit in front and touch nothing** (no mouse over Revit, no key) until a dialog shows or 120 s have passed since Place anyway. Read the dialog whole; close it (`WindowPattern.Close`); note the time. Read the pane's Doctor log (its newest lines). `rm …/slow`. `b4101 GET changesets/ma3b2b/<GR-FFL id>` | A TaskDialog titled `Sentinel — AI proposals` shows **by itself**, 90–115 s after Place anyway: `Applied <a> element(s) from "Promote (DD) · GR-FFL".` … `"Promote (DD) · GR-FFL": reported (ledger #<n>).` and `<k> decline reason(s) recorded with it.` The Doctor log holds `Review AI Proposals: Applied <a> element(s) …` and **neither** `Revit did not take a Sentinel action` **nor** `A Sentinel action failed and was skipped`. GET: `partially_applied`, `result.reasons` `<k>` entries. **If no dialog shows by 120 s**: click Revit's title bar once and wait 10 s — a dialog that shows only then is a **fail** (finding F-MA3b2b-1: the raise on Revit's thread is not enough while Revit sits idle), recorded with which of the three Doctor lines are there | The dialog's text; the two times; the Doctor log's newest five lines; `<a>`, `<k>`, the ledger id; whether a click was needed |
| R-2 — a decline whose reply was lost | Stop and start the `ma3b2b-proxy` preview (its "first result" is spent). `touch <scratchpad>/ma3b2b/lose`. Review AI Proposals ▸ 01-FFL ▸ **Review**. On each group, **Untick group** (the button reads `Decline all (needs a reason)`); put `drill MA3b2b: the reply is lost` in the note; press it. Read the window. `rm …/lose`. `b4101 GET changesets/ma3b2b/<01-FFL id>` (status only). Press **Retry report**; read the window. `b4101 GET "cde/ma3b2b/audit?entity_type=changeset&action_prefix=changeset_applied&limit=3"` | After the press: `Declined 0 of 1 changeset(s) — nothing in the model changed.` (then Promote's own lines) and `"Promote (DD) · 01-FFL": not reported: <the connection's words>` ending `Nothing in the model changed; Retry report sends it again.`; the proxy's log says `lost the reply to …/result - the bridge answered 200`; GET: `"status":"declined"`. After Retry report: `Sent again: 1 of 1 result(s) reported.` and `"Promote (DD) · 01-FFL": the bridge had already taken it (its reply did not reach Revit) — declined; the bridge named no ledger row for it here.` — **never** `the bridge refused it`. The audit read shows **one** `changeset_applied` row for that changeset. (If Promote filed 01-FFL in several parts, the counts follow what it filed and only the first part's reply is lost.) | The window's text both times (UNSURE 4: the connection's words, whole); the proxy's log line; the status; the audit row's id |
| W-2 — Refresh, and text as text | On the local app, the Review tab, switch the project to `ma3b2b` (or, with the Revit rows owed: stay on `ma3b2`). Note the count line. Press **↻ Refresh**. Read the section; open the GR-FFL report | Refresh re-reads the section without reloading the site (the "Reading…" line shows, the section comes back). With the Revit rows run: `2 report(s), newest first.` — `Promote (DD) · 01-FFL — declined in Revit … 0 applied, 40 not applied · ledger #<m>` with `Note: drill MA3b2b: the reply is lost`, then GR-FFL `partially applied … · ledger #<n>` (R-1's `<n>`); each of GR-FFL's unticked rows reads, as characters, `Revit: <b>drill MA3b2b</b> stays as modelled` — the angle brackets visible, nothing bold. With the Revit rows owed: the count line and both reports of W-1 come back unchanged, and the `<b>` half is **owed** (checked offline, vitest) | The count line before and after; the head lines; one reason row quoted with its brackets; a screenshot |

The rows run in the order W-1, R-1, R-2, W-2. If Promote filed other names or counts than drill MA3b2's, the rows use what it filed and the record says so.

Record the drill in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` as `## Session MA3b2b — Revit's reasons on the web desk, a closed window's result in a dialog, a lost-reply decline taken, live (<date> ~hh:mm → hh:mm local, branch feature/ma3b2b-desk-reasons <sha>, Claude driving Revit 2024, the founder's local app)`: the Setup paragraph (the local app and the 4100 bridge as they ran; for the Revit rows: the deploy on the founder's OK with the DLL sha before and after, settings at 127.0.0.1:4101, the proxy and the bridge on 4102, the scratch office and project, the membership, the sign-in state, the scratch copy, not saved), the table `| Row | Result | Evidence |` with **pass**/fail/owed and the words quoted (never the founder's address), plus ledger `#n`; then F-MA3b2b-n findings each fixed on the branch ("fix(drill MA3b2b): …" with its check) and their shas, and the **owed** rows at its end.

**Closing list:**
- close Revit without saving the scratch copy;
- stop `ma3b2b-proxy` and `ma3b2b-bridge`; delete the `slow` and `lose` files if either is left; remove the two entries from `.claude/launch.json`; the founder's 4100 bridge and the `web-dev` preview are not touched;
- restore the add-in's bridge settings: copy `bcf-config.json.ma3b2bbak` back over `bcf-config.json`, compare the two files' sha256 (`certutil -hashfile`, the hashes only), delete the backup;
- put master's add-in back, with Revit closed — **a deploy too: only under the founder's same explicit OK**: from a master checkout, `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`, and record the deployed DLL's sha256 beside the hash recorded before. Without that OK, say so: the branch's add-in stays until the merge's deploy — safe: it differs from master's only in this slice's three fixes;
- list what the drill left on the shared ledger — the scratch office `ma3b2b-office` (four artefacts), the project `ma3b2b`, the membership, the changesets (GR-FFL partially applied, 01-FFL declined, MA0 Roof proposed) and their rows — left in place on purpose (scratch keys);
- list what the drill left on this PC outside the repository: `%AppData%\Sentinel\unreported\ma3b2b\` (deleted with its files, if any), `%AppData%\Sentinel\cache\ma3b2b*` (deleted: scratch keys only), the scratch copy in `Documents\Sentinel drills\ma3b2b\` (kept, named, as evidence; never committed), `<scratchpad>/ma3b2b/` (the proxy and the bridge script; not the repository).

## Merge (after the drill)

Merge when all of these hold:
- every drill row passed, or is named **owed** in the record — **W-1 is never owed at the merge** (it needs no deploy: without it nothing proves live that the desk shows a reason typed in Revit); R-1 and R-2 may be owed only because the founder gave no deploy OK — then the merge message says F-MA3b2-1's fix is **built, not proven**;
- each F-MA3b2b-n fix is committed on the branch with its check, and Task 4 Step 2's checks were run again after the last fix;
- a fix that changes what Revit or the desk does was run again live before the merge; a row whose fix was not run again is **owed**, not passed.

**The design doc says what the drill proved**, committed on the branch before the merge: replace ``BUILT on `feature/ma3b2b-desk-reasons` (MA-3b2b), drill MA3b2b pending`` with `LANDED in MA-3b2b (merge <date>), drill MA3b2b: <passed rows; owed rows>` — `git commit -m "docs: MA-3b2b - drill MA3b2b's result"` (with the trailer).

```bash
git checkout master
git merge --no-ff feature/ma3b2b-desk-reasons -F - <<'EOF'
Merge feature/ma3b2b-desk-reasons: MA-3b2b - Revit's decline reasons on the web review desk (Recently decided in Revit: the newest 10 changesets Revit reported, each with who, when, the note, its ledger row read from the ledger and every ghost not applied with Revit's reason and the web's - as text, never HTML; a second read beside the proposed list, re-read by Refresh; no bridge change; web 1.0.42, the publish is the founder's), F-MA3b2-1 (a closed window's result reaches a dialog: the event hub raises on Revit's own thread whoever enqueues and says a raise Revit did not take; the dialog needs no DocPin; a summary that throws is said), and a Decline all whose reply was lost is taken on Retry report, not called refused (the stored result declined with the same ghosts and note). Drill MA3b2b: <the result and the owed rows>. graphify is not on PATH on this PC: the graph was not updated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Push only under the standing push rule, after a secret scan of the range.

**Deployment, in this order:**
1. **The bridge: nothing.** No bridge file changed; the 4100 bridge is not restarted for this slice.
2. **The add-in**, with Revit closed: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024` (without `DeployToRevit=false`), and the same for each other Revit version the founder uses.
3. **The web app — the founder's publish** (`npm run publish` from `WebApp`, version 1.0.42). Until then the published desk (1.0.41) shows no decided section; nothing else differs. Either order with step 2 works: the desk reads what any add-in since MA-3b2 reported.

## UNSURE facts this drill settles

1. **Whether the dialog shows with the fix** — and, if R-1 fails, which of three Doctor lines is there (the words; `Revit did not take a Sentinel action …`; `A Sentinel action failed and was skipped …`). Whether a raise posted to Revit's dispatcher runs while Revit sits untouched in front is the claim under test (candidate 1); R-1 keeps Revit in front so candidate 4 (a dialog UI Automation could not see) is out of the way.
2. Whether `GET /cde/:key/audit` answers a signed-in contributor (the route itself asks no role; the database's row policies decide) — W-1's `ledger #1811`. A desk that says `ledger row not read — …` there is a finding (then F1 C, or a role on the route).
3. Whether `GET /changesets/:key` with no status answers the signed-in desk as the proposed read does (same route, same store call) — W-1.
4. The words net48 gives when the proxy drops a reply mid-request (expected through `ChangesetTrust.BridgeWords`: `the connection failed — <the socket's sentence>`) — R-2 records them whole.
5. Whether a reason with `<` and `>` survives the reason box, the bridge's one-line rule and the ledger unchanged — R-1's GET and W-2.
6. What note drill MA3b2's GR-FFL result carries (an IDS line from "Place anyway", or none) — W-1 records the line.

## Risks (each a ceiling stated in words)

- **F-MA3b2-1's cause is claimed, not verified** (S4). If R-1 fails, the hub's raise is not the cause (or not the whole of it), and the Doctor log's three lines say where to look next; the words are still in the Doctor log, as before.
- **The desk reads the project's whole changeset list to show ten** (F1 A; twice per Refresh — once filtered by the bridge, once not). Ceiling: a project with hundreds of changesets pays for it on every Refresh; then the bridge's `status` list and `limit` (Next).
- **A report's ledger row is found by its changeset id among `changeset_applied` rows**: a changeset whose id is not a uuid (none the bridge makes) makes the ledger read a 400 — said on every report, the section still shows.
- **The reporter's address is on screen** for every member who can open the desk (it is on the ledger row already). Not new data; a new place.
- **A dialog for a closed window now shows over whichever model is in front** (F3 A) — its words name the changeset, not the model.
- **Another person's decline of the same ghosts with the same note reads as "already taken"** (F4 A) — the changeset is declined either way.
- **A note with a character .NET and JavaScript trim differently reads "refused"** (E4) — today's words, nothing lost.
- **The hub's change reaches every Sentinel action that goes through it** (BCF issues, Naming Manager, Standards, Show): each already raises from Revit's or a window's thread, where the new code calls `Raise()` directly as before. A caller on another thread now raises a moment later (posted), never earlier.
- **`changeset_reverted` is not shown**: a report undone in Revit (drill MA3b2's 01-FFL, #1814) still reads "applied" on the desk — the ledger says the rest (Next).

## Not settled (for the founder or the reviewer)

- **Which candidate caused Z-4's missing dialog** — settled only if someone runs R-1's steps on master's build first (a second deploy; not planned).
- **F5** — the deploy OK for R-1 and R-2.
- **Whether W-1 should run on the founder's own project instead of the scratch key `ma3b2`** — either works; `ma3b2` has known data.
- **The brief's base total** (`promote-check 695/695`) is stale: the measured base is `756/756`.

## Next (out of scope here)

- **The bridge's list takes a `status` list and a `limit`** (F1 B), or **the ledger id on the stored changeset** (F1 C): when the desk's two whole-list reads prove heavy, or the ledger read is refused to a role that reads the desk. One line and one vitest for B; a bridge restart. Size S.
- **`changeset_reverted` on a decided row**: "undone in Revit" beside a report whose Undo was posted (a third filter on the same audit read). Size S.
- **The ledger panel prints a `changeset_applied` row's reasons** (`cde-panel.ts renderAudit` prints the action only). Size S.
- **A reason box per row** (MA-3b2 F1 B): when reviewers ask; no contract change.
- **MA-3b3 — the Revit "ticked" lock and the carried decline** (Revit + bridge + web desk): as in the MA-3b plan's Next. Size M–L.
- **MA-3b4 — nothing in modelling waits**: a waiting result sent by itself on `DocumentOpened`; Ghost Builder writes the same record before its report and stops waiting; Promote's reads (`Commands.PromoteWalls.cs:49`, `:61`) and its filing (`:191`) off the thread.
- **MA-3c — the ghost overlay** and **MA-3d — web highlights and the proposal model**: as in the MA-3a plan's Next.
- Owed rows carried: MA3b2's Show on a create and on a type edit, and the tab refusal; MA3b's R-5; Revit 2025–2027 for the review (MA-3a, MA-3b, MA-3b2, MA-3b2b); MA3a's D-4 second account and a late decline applied over; and from MA2e — Revit 2025–2027 for Annotate, the signed-out actor, a view that throws in its SubTransaction, an owned or out-of-date datum, a non-story level, pinning in a workshared copy.
