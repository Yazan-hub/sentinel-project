# MA-3b6 — Promote's "File n changeset(s)?" counts the declines made before, and a storey whose every ghost was declined before is not filed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3b5 plan's "Next ▸ MA-3b6" (`docs/superpowers/plans/2026-10-05-ma3b5-promote-no-wait.md` ▸ Next; MA-3b3's F8 B, MA-3b5's S2), as one drillable slice: a **bridge preview route** `POST /changesets/:key/preview` that says what filing each of Promote's bodies would carry (MA-3b3's `carryDeclines`, in its one place — nothing stored, no ledger row, no adjudication); Promote reads it **off Revit's thread** after it has planned (a third DocPin hop: plan on Revit's thread → preview on a pool thread → the dialog back on Revit's thread in the model Promote started from); the dialog says how many ghosts were declined before and does **not file a storey whose every ghost was** (F8 B), naming it; a preview the bridge did not answer is said, and every storey is filed as before (F8 A).

**Architecture:** Bridge: `changesets-store.mjs` `previewChangesets(key, { bodies })` → `requireMinRole contributor`, `myRole`, one `docList`, then per body `validateChangeset` (the same 400/413 a filing gets) and `carryDeclines` → `{ previews: [{ name, elements, carried, no_reason, creates, unverified, all_carried }] }` in the bodies' order; the route beside the others in `bcf-service.mjs`. Add-in: `ChangesetClient.Preview` (a POST through the 8 s read client), `PropertyPlanner`'s words (pure, pinned by `tools/promote-check`), and `Commands.PromoteWalls.cs` `PlanAndFile` hands the guard to the preview hop; the dialog and the filing move into a local function that takes the preview.

**Tech Stack:** Node bridge (vitest), C# add-in (net48 2021–2024 / net8 2025–2026 / net10 2027), `tools/promote-check` (a console check project, `Ok(cond, words)` lines).

**Base:** `feature/ma3b6-preview-carried-declines` at master `449b2ab` (SEC-9 merged). Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `449b2ab`.

## Global Constraints

- House style: every refusal is a sentence in words with its status; comments name the slice ("MA-3b6") and the reason; tests pin exact words. No new dependency.
- Commit messages: `feat(bridge): MA-3b6 - …` / `feat(revit): MA-3b6 - …`, each with a blank line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit only on `feature/ma3b6-preview-carried-declines`.
- Never run a bare `node bridge/bcf-service.mjs` (it listens on the live port 4100). Never `npm install`, `npm publish`, `git push`. Never touch `config/.env`, `WebApp/.npmrc`. Never print a token or an e-mail.
- Every add-in build carries `-p:DeployToRevit=false`: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Warning\(s\)|Error\(s\)"` (0 errors; master's warning count).
- `tools/promote-check`: `dotnet run --project tools/promote-check 2>&1 | tail -3` ends `promote-check: N/N checks pass` (master: 808 before this slice).
- After a full `npx vitest run` in `WebApp`, restore `WebApp/bridge/fixtures/lod-matrix/ids-cases.json` if `git status --short` lists it (line endings only). The tree must end with only `.claude/` and `ab.html` untracked (pre-existing; never add them).

---

### Task 1 — Bridge: `POST /changesets/:key/preview`

**Files:**
- Modify: `WebApp/bridge/changesets-store.mjs` (after `proposeChangeset`, `:107-187`)
- Modify: `WebApp/bridge/bcf-service.mjs:1778-1788` (the changesets route block)
- Test: `WebApp/bridge/changesets-store.test.mjs` (the MA-3b3 describe at `:766` has `declinedInRevit(role)`, `STOREY()`, `retype(n)`, `rows(deps, action)`, `baseDeps` at `:20`), `WebApp/bridge/write-roles.test.mjs` (find its existing changesets viewer pin: `grep -n "changesets" bridge/write-roles.test.mjs`)

**Interfaces:**
- Produces: `previewChangesets(key, body, deps) → { previews: Array<{ name: string, elements: number, carried: number, no_reason: number, creates: number, unverified: number, all_carried: boolean }> }`; route `POST /changesets/:key/preview` → 200 that object; 400 `a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read`; 403 the role words; 503 `the project's earlier changesets could not be read (<why>) — nothing was previewed`; a body `validateChangeset` refuses answers its own 400/413 (as a filing would).

- [ ] **Step 1: the store function** — after `proposeChangeset`:

```js
/** MA-3b6 (MA-3b3 F8 B, MA-3b5 S2): what filing each body WOULD carry — MA-3b3's rule (carryDeclines) asked in its one place, nothing
 *  stored, no ledger row, no adjudication. Promote asks before its dialog: a storey whose every ghost was declined before is not filed.
 *  body: { bodies: [changeset body, …] } (Promote's storeys). A contributor's read (what filing needs); the earlier changesets read once;
 *  each body validated as a filing would be (its 400/413 are a filing's). Answers the previews in the bodies' order. */
export async function previewChangesets(key, body, deps) {
  const d = wire(deps);
  await d.requireMinRole(key, "contributor");
  const bodies = Array.isArray(body?.bodies) ? body.bodies : null;
  if (!bodies || bodies.length === 0 || bodies.length > 50) throw err(400, "a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read");
  const role = await d.myRole(key);
  const member = role != null && role !== "service";
  const proj = await d.ensureProject(key);
  let earlier;
  try { earlier = await d.docList(STORE, proj.id); }
  catch (e) { throw err(503, `the project's earlier changesets could not be read (${e.message}) — nothing was previewed`); }
  // The standards are read once, only when a body needs them (as a filing reads them).
  const type = bodies.some(needsTyping) ? await typerFor(key, d) : null;
  const cite = bodies.some(needsCiting) ? await citerFor(key, d) : null;
  return {
    previews: bodies.map((b) => {
      const v = validateChangeset(b, { member, type, cite });
      const carry = carryDeclines(v.elements, earlier);
      const ghosts = v.elements.length;
      return { name: v.name, elements: ghosts, carried: carry.carried.length, no_reason: carry.no_reason, creates: carry.creates, unverified: carry.unverified,
        all_carried: ghosts > 0 && carry.carried.length === ghosts };
    }),
  };
}
```
(`wire`, `err`, `STORE`, `needsTyping`, `needsCiting`, `typerFor`, `citerFor`, `validateChangeset`, `carryDeclines` are the module's own — check each is in scope at the top of the file before using it.)

- [ ] **Step 2: the route** — in `bcf-service.mjs`, after the `if (!p2 && req.method === "POST")` line (`:1779`):

```js
      // MA-3b6: what filing these bodies would carry (MA-3b3's rule in its one place) — a read: nothing stored, no ledger row.
      if (p2 === "preview" && !p3 && req.method === "POST") return send(res, 200, await ch.previewChangesets(key, body));
```

- [ ] **Step 3: tests** — in `changesets-store.test.mjs`, a new `describe("MA-3b6 — a preview of what a filing would carry (nothing stored)")` reusing the MA-3b3 helpers (import `previewChangesets`):
  - after `declinedInRevit()` (a contributor's report: W 1 declined with a reason, W 2 with none, W 3 applied): `previewChangesets("demo", { bodies: [STOREY()] }, "modeller", deps)` → `{ previews: [{ name: "Promote (DD) · GR-FFL", elements: 3, carried: 1, no_reason: 1, creates: 0, unverified: 0, all_carried: false }] }`; `deps.saved.size` unchanged; `deps.audit.mock.calls.length` unchanged; `deps.adjudicateProposal` not called again (count before/after).
  - a body of W 1 alone (`{ ...STOREY(), elements: [retype(1)] }`) → `all_carried: true`; two bodies in one call answer two previews in order.
  - after `declinedInRevit(null)` (the machine credential's report): `carried: 0, unverified: 1` (C1: a reason no signed-in member reported is not carried).
  - `{}` and `{ bodies: [] }` → rejects `{ status: 400, message: "a preview is { bodies: [1 to 50 changeset bodies] } — nothing was read" }`.
  - `docList` throwing `new Error("Supabase 500")` → rejects `{ status: 503, message: "the project's earlier changesets could not be read (Supabase 500) — nothing was previewed" }`.
  - a body with `name: ""` → rejects `{ status: 400 }` (the filing's own validation).
  In `write-roles.test.mjs`, beside the existing changesets viewer pin: `POST /changesets/demo/preview` as viewer with `{ bodies: [{ name: "x", elements: [] }] }` → `refused("contributor", "viewer")`.
  Run from `WebApp`: `npx vitest run bridge/changesets-store.test.mjs bridge/write-roles.test.mjs` — green.

- [ ] **Step 4: commit** — `feat(bridge): MA-3b6 - POST /changesets/:key/preview says what filing each body would carry (MA-3b3's rule in its one place): nothing stored, no ledger row; a contributor's read; the earlier changesets read once`

### Task 2 — Add-in: Promote asks the preview off Revit's thread, says it, and does not file a storey whose every ghost was declined before

**Files:**
- Modify: `SentinelAddin/Coordination/ChangesetClient.cs` (`Post` at the line `private static bool Post(BcfConfig cfg, string path, string payload, int expect, out string body, out string error)`; `ChangesetDto` at `:460`; `Propose` at `:609`)
- Modify: `SentinelAddin/GhostBuilder/PropertyPlanner.cs` (the MA-3b5 words region after `FileAll`, `:519-559`)
- Modify: `SentinelAddin/Commands.PromoteWalls.cs` (`PlanAndFile` `:99-300`: the dialog from `var dlg = new TaskDialog(Title)` at `:214` to the end of the method)
- Create: `tools/promote-check/Ma3b6.cs`; modify `tools/promote-check/Check.cs:77-78` (call the new section after `Ma3b5WiringChecks();`)

**Interfaces:**
- Consumes: Task 1's route and reply shape.
- Produces: `ChangesetClient.Preview(BcfConfig cfg, string projectKey, IReadOnlyList<object> bodies, out string error) → List<ChangesetPreviewDto>` (null with `error`); `PropertyPlanner.PromotePreviewing`, `PropertyPlanner.FileQuestion(int file, int skipped)`, `PropertyPlanner.CarriedLine(IReadOnlyList<ChangesetPreviewDto> pv)`, `PropertyPlanner.PreviewNotRead(string why)`, `PropertyPlanner.WithoutCarried(IReadOnlyList<object> bodies, IReadOnlyList<ChangesetPreviewDto> pv)`.

- [ ] **Step 1: the client.** Give `Post` an optional client: signature `private static bool Post(BcfConfig cfg, string path, string payload, int expect, out string body, out string error, HttpClient http = null)` and inside `Send(http ?? WriteHttp, …)`; the timeout in its catch: `(int)(http ?? WriteHttp).Timeout.TotalSeconds`. Beside `ChangesetDto` add:

```csharp
/// <summary>MA-3b6: one body's preview — what filing it would carry (POST /changesets/:key/preview).</summary>
public sealed class ChangesetPreviewDto
{
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("elements")] public int Elements { get; set; }
    [JsonPropertyName("carried")] public int Carried { get; set; }
    [JsonPropertyName("no_reason")] public int NoReason { get; set; }
    [JsonPropertyName("creates")] public int Creates { get; set; }
    [JsonPropertyName("unverified")] public int Unverified { get; set; }
    [JsonPropertyName("all_carried")] public bool AllCarried { get; set; }
}
```
(the `JsonPropertyName` attributes are what `ChangesetDto` uses — copy its `using`.) After `Propose`:

```csharp
    /// <summary>MA-3b6: what filing these bodies would carry (POST /changesets/:key/preview → 200 { previews }), in their order — a read
    /// through the 8 s client, off Revit's thread (Promote's preview hop). Null with the error (a bridge before MA-3b6 answers 404).</summary>
    public static List<ChangesetPreviewDto> Preview(BcfConfig cfg, string projectKey, IReadOnlyList<object> bodies, out string error)
    {
        if (!Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/preview", JsonSerializer.Serialize(new { bodies }, WriteJson), 200, out var resp, out error, ReadHttp)) return null;
        try { return JsonSerializer.Deserialize<PreviewReply>(resp)?.Previews ?? new List<ChangesetPreviewDto>(); }
        catch (Exception ex) { error = ex.Message; return null; }
    }
    private sealed class PreviewReply { [JsonPropertyName("previews")] public List<ChangesetPreviewDto> Previews { get; set; } }
```

- [ ] **Step 2: the words** — in `PropertyPlanner.cs`, after `Stalling`:

```csharp
        // ── MA-3b6: the declines made before, read before Promote's dialog — its words (pure) ──────────────────────────────────────────

        /// <summary>MA-3b6: the pane's Doctor line when Promote asks the bridge which ghosts were declined before.</summary>
        public const string PromotePreviewing = "Promote (DD): asking the bridge which ghosts were declined before (off Revit's thread) — the dialog opens by itself.";

        /// <summary>MA-3b6: the dialog's question — the storeys to file, and those not filed because every ghost in them was declined before.</summary>
        public static string FileQuestion(int file, int skipped) =>
            skipped == 0 ? $"File {file} changeset(s)?"
            : file == 0 ? "Nothing to file: every ghost Promote would propose was declined before."
            : $"File {file} of {file + skipped} changeset(s)? ({skipped} not filed — every ghost in them was declined before)";

        /// <summary>MA-3b6: the dialog's line on the declines made before — null when none and nothing is skipped.</summary>
        public static string CarriedLine(IReadOnlyList<ChangesetPreviewDto> pv)
        {
            if (pv == null || pv.Count == 0) return null;
            int carried = pv.Sum(p => p.Carried), noReason = pv.Sum(p => p.NoReason), unverified = pv.Sum(p => p.Unverified), creates = pv.Sum(p => p.Creates);
            var skipped = pv.Where(p => p.AllCarried).Select(p => p.Name).ToList();
            if (carried + noReason + unverified + creates == 0) return null;
            var s = $"Declined before (the bridge carries each decline onto its ghost, already declined, for the reviewer): {carried} ghost(s) in {pv.Count(p => p.Carried > 0)} storey(s)";
            if (noReason + unverified + creates > 0)
                s += $"; not carried: {noReason} declined in Revit with no reason, {unverified} with a reason no signed-in member reported, {creates} create(s) like one declined before";
            if (skipped.Count > 0)
                s += $"\n{skipped.Count} storey(s) not filed — every ghost in them was declined before: {string.Join("; ", skipped)}. Their rows sent to a person are listed only in this dialog; a lead re-opens a decline on the web desk to file them again.";
            return s;
        }

        /// <summary>MA-3b6: the preview the bridge did not answer — said, and every storey is filed as before (a ghost declined before is still filed already declined by the bridge).</summary>
        public static string PreviewNotRead(string why) =>
            $"Declined before: not read — {why}. Every storey is filed; a ghost declined before is still filed already declined by the bridge.";

        /// <summary>MA-3b6 (F8 B): the bodies to file — those whose preview does not say every ghost was declined before. A preview that does not
        /// match the bodies one to one (none, or another count) files every body.</summary>
        public static List<object> WithoutCarried(IReadOnlyList<object> bodies, IReadOnlyList<ChangesetPreviewDto> pv)
        {
            if (pv == null || pv.Count != bodies.Count) return bodies.ToList();
            return bodies.Where((b, i) => !pv[i].AllCarried).ToList();
        }
```
(`PropertyPlanner.cs` needs `using Sentinel.Coordination;` for `ChangesetPreviewDto` if it does not have it, and `System.Linq`.)

- [ ] **Step 3: the hop in `Commands.PromoteWalls.cs`.** In `PlanAndFile`, the code from `var dlg = new TaskDialog(Title)` (`:214`) to the method's end becomes the body of a local function `bool AskAndFile(List<ChangesetPreviewDto> pv, string pvErr)` declared at that point (it captures every local above it — `ui`, `doc`, `cfg`, `key`, `release`, `bodies`, the texts). Inside it, before `var dlg`:

```csharp
            // MA-3b6 (F8 B): the storeys to file — a storey whose every ghost was declined before is not filed; a preview not read files all.
            var toFile = PropertyPlanner.WithoutCarried(bodies, pv);
            var skipped = bodies.Count - toFile.Count;
            var declinedBefore = bodies.Count == 0 ? null : pv == null ? PropertyPlanner.PreviewNotRead(pvErr) : PropertyPlanner.CarriedLine(pv);
```
and change: `MainInstruction = bodies.Count == 0 ? "Nothing to file: …" : PropertyPlanner.FileQuestion(toFile.Count, skipped)`; append to `MainContent` right after `gapText`: `+ (declinedBefore != null ? "\n\n" + declinedBefore : "")`; `CommonButtons = toFile.Count == 0 ? Ok : Yes | No`; the No-text condition `bodies.Count > 0` becomes `toFile.Count > 0`; `if (toFile.Count == 0 || dlg.Show() != TaskDialogResult.Yes) return false;`. In the filing: `PromoteFiling(toFile.Count)`, `FileAll(toFile, …)`, `{failed.Count} of {toFile.Count} changeset(s)`, `PromoteFiled(filed.Count, toFile.Count)`. Everything else in the function unchanged.
  Then, where the dialog used to start, after the local function:

```csharp
        if (bodies.Count == 0) return AskAndFile(null, null); // nothing to preview: the dialog says there is nothing to file
        // MA-3b6: which ghosts were declined before — asked off Revit's thread, the dialog back on it in this model only (DocPin), as the
        // plan was. The guard is handed to the hop; a preview the bridge did not answer is said and every storey is filed (F8 A).
        App.PanelVm?.LogDoctor(PropertyPlanner.PromotePreviewing);
        Task.Run(() => { var pv = ChangesetClient.Preview(cfg, key, bodies, out var e); return (Pv: pv, Err: e); })
            .ContinueWith(t => App.Events.Enqueue(doc, "ask Promote (DD)", (u, d) =>
            {
                var handed = false;
                try
                {
                    if (ProjectContext.For(d).Key != key) { TaskDialog.Show(Title, $"This model's project changed while Promote read the bridge (was {key}) — nothing was filed. Run Promote (DD) again."); return; }
                    var (pv, e) = t.Status == TaskStatus.RanToCompletion ? t.Result : (null, t.Exception?.GetBaseException().Message ?? "the read did not finish");
                    handed = AskAndFile(pv, e);
                }
                finally { if (!handed) release(); }
            }, why => { release(); TaskDialog.Show(Title, why); }), TaskScheduler.Default);
        return true; // the guard is handed to the hop (Plan's finally releases nothing)
```
  `release` is `Plan`'s `Once` (idempotent). Build: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Warning\(s\)|Error\(s\)"` → 0 errors.

- [ ] **Step 4: `tools/promote-check/Ma3b6.cs`** (section 53, the shape of `Ma3b5.cs`): `static void Ma3b6WordChecks()` printing `"\nMA-3b6 — the declines made before: Promote's words and the storeys it does not file"`, then `Ok(...)` pins:
  - `FileQuestion(3, 0) == "File 3 changeset(s)?"`, `FileQuestion(2, 1) == "File 2 of 3 changeset(s)? (1 not filed — every ghost in them was declined before)"`, `FileQuestion(0, 2) == "Nothing to file: every ghost Promote would propose was declined before."`.
  - `CarriedLine(null) == null`; a list of two previews with every count 0 → null; `{Carried 1, NoReason 1}` + `{Carried 2, AllCarried true, Name "Promote (DD) · 01-FFL"}` → the exact two-line string (write it out from the code above with those numbers: `3 ghost(s) in 2 storey(s)`, `not carried: 1 declined in Revit with no reason, 0 with a reason no signed-in member reported, 0 create(s) like one declined before`, then the skipped line naming `Promote (DD) · 01-FFL`).
  - `PreviewNotRead("Bridge 404: changesets route not found")` == the exact words.
  - `WithoutCarried(bodies of 3, previews [false, true, false])` keeps bodies 0 and 2; with `null` or a 2-long preview list keeps all 3.
  - Wiring (a source scan, as `Ma3b5Wiring.cs` scans): `Commands.PromoteWalls.cs` contains `ChangesetClient.Preview(cfg, key, bodies, out var e)` inside a `Task.Run(`, `App.Events.Enqueue(doc, "ask Promote (DD)"`, `PropertyPlanner.FileAll(toFile`, `PropertyPlanner.FileQuestion(toFile.Count, skipped)`, and no longer `$"File {bodies.Count} changeset(s)?"`.
  Wire `Ma3b6WordChecks();` into `Check.cs` after `Ma3b5WiringChecks();`. Run `dotnet run --project tools/promote-check 2>&1 | tail -3` → `promote-check: N/N checks pass` with N = 808 + the new lines, no `FAIL`.

- [ ] **Step 5: commit** — `feat(revit): MA-3b6 - Promote asks the bridge which ghosts were declined before, off Revit's thread (a third DocPin hop), says it in its dialog, and does not file a storey whose every ghost was (F8 B); a preview not read is said and every storey is filed as before; promote-check 53`

### Task 3 — Final checks (nothing to commit)

From `WebApp`: `npx vitest run 2>&1 | tail -6` (all pass; restore `ids-cases.json` if listed). From the repo root: `dotnet run --project tools/promote-check 2>&1 | tail -2`; builds `-p:RevitVersion=2022`, `2024`, `2026`, `2027`, each `-p:DeployToRevit=false`, each `0 Error(s)`. Report the totals and `git log --oneline master..HEAD`.

## Live drill MA3b6 (the controller, after the build)

- B-1 the 4100 bridge and the test bridge 4101 restarted on the branch.
- D-1 on `sec8-smoke` through 4101 (the machine credential): propose a storey of two retypes, report it with both rejected and a reason each (the machine's report: C1 says its reasons are not carried), then preview the same body → `unverified: 2, carried: 0, all_carried: false`; preview `{}` → the 400 words. The carried path (a member's report) is pinned offline (Task 1's tests reuse MA-3b3's `declinedInRevit("contributor")`).
- R-1 Revit 2024, the branch's add-in: Promote on a scratch model bound to a project with a declined storey — **owed** (needs a signed-in member's decline on a planned storey: the founder's session).
- Merge `--no-ff`; the 4100 bridge restarted on master; the add-in built and deployed 2021–2027 (`DeployToRevit` default); no web change (no publish).

## Next (out of scope here)
- Ghost Builder's filing and `Abandon`'s withdrawals off the thread (MA-3b5 Next). The C1e dispatcher audit of the remaining `GovernedNotify` callers. A guard per project key: not planned.
