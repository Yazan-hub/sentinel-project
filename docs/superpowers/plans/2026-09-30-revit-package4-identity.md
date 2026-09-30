# Revit package 4 — the person's name on every write — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person's session survives a network blip and is never swapped for the PC's shared token (SI-1); the Revit IFC Delivery Gate's ledger row is recorded under the signed-in person (GATE-E1, H5); every write names one identity — the signed-in e-mail, else `unsigned — <Windows user>`, never "Revit" — and the change-request coordinator is a lead or owner of the web project (XC-4).

**Architecture:** `UserSession` gets a four-state refresh rule (token / transient failure / refusal / no session) that throws `SessionException` instead of returning null while a session exists, and one pure actor helper (`UserSession.Actor`, `UserSession.ActorFor`). The coordinator decision is a pure `ChangesetClient.CoordinatorFrom` over the existing `ChangesetClient.MyRole` (GET `/cde/{key}/members/me`). The bridge's `recordDeliveryGate` takes the same contributor-or-above check as `recordRevitReport`, with its own write budget.

**Tech Stack:** C# (net48 for Revit 2024, net8 for 2025/2026), WPF; `tools/*-check` console checks (net8); bridge Node ESM + vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-revit-addin-safe-honest-design.md` ("Package 4"). Audit rows SI-1, GATE-E1, XC-4 in `docs/strategy/2026-09-30-revit-addin-audit.md`. Line numbers were read on master `3cb1dd8` and drift as tasks land; the file, member and method names are authoritative. Package 3 is not built yet; the only file both touch is `Engine/Publisher.cs` (one line here) — whichever lands second rebases.

## Decisions this plan makes (the founder can overturn any in one line)

- **D1 — GATE-E1 opens the gate route for all three sources, not only `check`.** `Publisher.Prepare` posts its gate row through the same route (`Engine/Publisher.cs:190`, source `revit`/`auto-publish`, `publish: true`), so a check-only opening leaves every signed-in Governed Publish with "Gate row: not recorded — HTTP 403". A contributor already gets the same trust from `/propose` (`couldRegister`: their refused publish is held).
- **D2 — The machine credential is not a coordinator.** `myRole` answers `"service"` for a signed-out PC using the shared token; a verdict must name a person, so signed out → read-only "signed out — sign in as a lead or owner".
- **D3 — A refused refresh fails the call that met it** ("signed out — Supabase refused the session (…)") and signs out; later calls run signed out (the PC's token, actor `unsigned — <user>`). Only a transient failure keeps the session.
- **D4 — Transient means:** no answer, a timeout, HTTP 5xx, 408, 429, or a 2xx without tokens. Today every non-2xx signs the person out (`UserSession.cs:134`), so a Supabase 503 logs everyone out.
- **D5 — ⚡ Fix and change-request verdicts write no ledger row today** (only the in-model `RequestStore` audit). B34 checks them in the model; their ledger rows are XC-5 / CR-3, out of scope per the spec.
- **D6 — One drill knob:** `SENTINEL_SESSION_REFRESH_WITHIN` (seconds, 60–3500, default 60) so B34 can reach "near token expiry" without waiting an hour.

## Global Constraints

- Builds for Revit **2024 (net48), 2025, 2026** with `-p:DeployToRevit=false`; no `string.Contains(char)`; C# edits with escapes go through the Edit tool.
- Never start or drive Revit, never deploy the add-in, never run/restart/deploy a bridge (vitest only), no calls to the live bridge, Supabase or any network service. Never read `config/.env`, `WebApp/.npmrc`, tokens or `%APPDATA%\Sentinel` / `%LOCALAPPDATA%\Sentinel\session.bin`.
- `UserSession.Actor` never touches the network: it runs inside DMU `Execute` and on the API thread.
- Honesty: a call that could not be sent under the person's session says so in words; nothing grants coordinator on a failure.
- No new dependencies. Branch `feature/revit-package4`; `--no-ff` merge; secret-scan before push. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File structure

| File | Change |
|---|---|
| `SentinelAddin/Coordination/UserSession.cs` | SI-1 state machine, `SessionException`, lock-free `Email`, `Actor`/`ActorFor`, drill knob |
| `SentinelAddin/Coordination/BcfConfig.cs` | Doc only: `ServiceToken` may throw `SessionException` |
| `SentinelAddin/Coordination/GovernedNotify.cs` | `Event` returns not-recorded on `SessionException`; `DeliveryGate` sends `actor`; doc |
| `SentinelAddin/Coordination/ArtefactClient.cs` | `Resolve` serves the cache on `SessionException` |
| `SentinelAddin/Coordination/GovernedQuery.cs` | `FederationStatus`, `ClashRegister` say the session words |
| `SentinelAddin/Commands.BcfIssues.cs` | Guarded token at window open, token inside the New Issue task, actor at use |
| `SentinelAddin/Coordination/ChangesetClient.cs` | `CoordinatorFrom`; actor in `ReportResult`, `ReportReverted` |
| `SentinelAddin/Workflow/RequestManager.cs`, `Commands.Workflow.cs`, `UI/RequestsWindow.xaml.cs` | Coordinator from the web project; actor |
| Actor sites (Task 3 table) | `UserSession.Actor` |
| `WebApp/bridge/cde-store.mjs`, `bcf-service.mjs` (comment) | GATE-E1 role check + budget |
| `WebApp/bridge/cde-store-hold.test.mjs`, `write-roles.test.mjs` | GATE-E1 cases |
| `tools/session-check/*`, `tools/heal-check/Check.cs`, `.github/workflows/ci.yml` | Offline pins; session-check joins CI |

---

### Task 0: Branch and test wiring

- [ ] `git switch -c feature/revit-package4` from master.
- [ ] For the WebApp tests in a worktree, a directory **junction** (never a copy; never delete it or anything through it):
  `cmd /c mklink /J "<worktree>\WebApp\node_modules" "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\WebApp\node_modules"`
- [ ] Baseline green: `dotnet run --project tools/session-check` → `22/22 checks pass`.

### Task 1: SI-1 — no silent fallback

**The state machine** (`UserSession.AccessToken`, called by every `BcfConfig.ServiceToken` read):

| State when the call starts | Supabase | This call | Memory and file after | Next call |
|---|---|---|---|---|
| No Supabase address in the config | — | `null` → the file token (as today; the check tools rely on it) | unchanged | same |
| No session (no file, or unreadable) | — | `null` → the file token, else no header | — | same |
| Session, > `MinLeftSeconds` left | not called | the session's token | unchanged | same |
| Session near expiry; another Revit already refreshed | not called | the file's fresh token | adopted | — |
| Session near expiry | 2xx with tokens | the new token | saved | — |
| Session near expiry | 4xx except 408/429 (**refused**) | throws `SessionException("signed out — Supabase refused the session (<words>) — Standards ▸ Sign in")` | `_s = null`, file deleted | signed out: file token, actor `unsigned — <user>` |
| Session near expiry | no answer, timeout, 5xx, 408, 429, 2xx without tokens (**transient**) | throws `SessionException("session not refreshed — retrying (<reason>)")` | **kept** (memory and file) | retries the refresh |

`Email` (and so `Actor`) keeps naming the person through a transient failure: it reads memory only.

**Files:** `Coordination/UserSession.cs`, `Coordination/BcfConfig.cs`, `Coordination/GovernedNotify.cs`, `Coordination/ArtefactClient.cs`, `Coordination/GovernedQuery.cs`, `Commands.BcfIssues.cs`, `tools/session-check/Check.cs`

- [ ] **1.1 Red.** In `tools/session-check/Check.cs`:
  - fake Supabase: `static bool _unavailable;` and in `Handle`, right after the apikey branch: `else if (_unavailable) { status = 503; answer = "{\"message\":\"upstream unavailable\"}"; }`
  - helper: `static Exception? Throws(Func<object?> f) { try { f(); return null; } catch (Exception e) { return e; } }`
  - case 4 (`RefusedRefreshSignsOut`): replace `var t = UserSession.AccessToken(_url, Anon); _refuseAll = false; Ok(t is null && …, "a refresh Supabase refuses signs the person out and deletes the file");` with
    ```csharp
    var e = Throws(() => UserSession.AccessToken(_url, Anon));
    _refuseAll = false;
    Ok(e is SessionException && e.Message.StartsWith("signed out — ") && !UserSession.IsSignedIn && !File.Exists(file),
       "a refused refresh fails that call in words, signs out and deletes the file: " + e?.Message);
    Ok(UserSession.AccessToken(_url, Anon) is null, "…and the next call runs signed out");
    ```
  - new case 7, called from `Main` after `RefusedRefreshSignsOut(file)`:
    ```csharp
    // ── 7. SI-1: a refresh that fails without a refusal keeps the session and fails the call in words ─────
    static void TransientKeepsSession(string file)
    {
        _expiresIn = 30;
        UserSession.SignOut();
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        _expiresIn = 3600;
        const string Dead = "http://127.0.0.1:1/"; // nothing listens: never answered
        var e = Throws(() => UserSession.AccessToken(Dead, Anon));
        Ok(e is SessionException && e.Message.StartsWith("session not refreshed — retrying"), "no answer: the call fails in words: " + e?.Message);
        Ok(UserSession.IsSignedIn && UserSession.Email == "lead@office.example" && File.Exists(file), "…the session and its file are kept");
        var cfg = BcfConfig.Parse("{\"serviceToken\":\"shared-machine-token\",\"supabaseUrl\":\"" + Dead + "\",\"supabaseAnonKey\":\"" + Anon + "\"}");
        Ok(Throws(() => cfg.ServiceToken) is SessionException, "while the session exists, ServiceToken never falls back to the shared token");
        _unavailable = true;
        Ok(Throws(() => UserSession.AccessToken(_url, Anon)) is SessionException && UserSession.IsSignedIn, "a Supabase 503 is not a refusal: the session is kept");
        _unavailable = false;
        int refused = _refusedRefreshes;
        var t = UserSession.AccessToken(_url, Anon);
        Ok(t is not null && t.StartsWith("access-") && _refusedRefreshes == refused, "the next call retries with the kept refresh token: " + t);
        UserSession.SignOut();
    }
    ```
  - `dotnet run --project tools/session-check` → build error (`SessionException` missing).
- [ ] **1.2 Implement `UserSession.cs`.**
  - After the class (same file, same namespace):
    ```csharp
    /// <summary>SI-1: the signed-in session could not be used for this call — the refresh failed (the session is kept,
    /// the next call retries) or Supabase refused it (signed out). The call is not sent: never under the PC's token.</summary>
    public sealed class SessionException : Exception { public SessionException(string message) : base(message) { } }
    ```
  - Fields: `private static volatile Stored? _s;` `private static volatile bool _loaded;`; `LoadOnce` assigns `_s = Load();` **before** `_loaded = true;`.
  - `public const string NotRefreshed = "session not refreshed — retrying";`
  - Drill knob (D6), replacing `private const int MinLeftSeconds = 60;`:
    ```csharp
    // B34's knob: refresh this many seconds before expiry (60–3500; default 60) so a drill reaches "near expiry" at once.
    private static readonly int MinLeftSeconds =
        int.TryParse(Environment.GetEnvironmentVariable("SENTINEL_SESSION_REFRESH_WITHIN"), out var w) && w >= 60 && w <= 3500 ? w : 60;
    ```
  - `Email` never waits on a refresh (a refresh holds `Gate` for up to 18 s; `Actor` runs in DMU `Execute`):
    `public static string? Email { get { if (!_loaded) lock (Gate) LoadOnce(); return _s?.Email; } }`
  - `AccessToken`: XML doc says it returns a token, `null` (no address / no session), or throws `SessionException`; body unchanged; `Refresh` now returns `string` (never null).
  - `Refresh`, after the adopt-from-disk line:
    ```csharp
    var refreshToken = onDisk?.RefreshToken ?? _s?.RefreshToken;
    if (string.IsNullOrEmpty(refreshToken)) { Forget(); throw new SessionException("signed out — the stored session has no refresh token — Standards ▸ Sign in"); }
    var r = Token(supabaseUrl, anonKey, "refresh_token", JsonSerializer.Serialize(new { refresh_token = refreshToken }));
    if (r.Session is null)
    {
        if (r.Refused) { Forget(); throw new SessionException("signed out — Supabase refused the session (" + r.Error + ") — Standards ▸ Sign in"); }
        throw new SessionException(NotRefreshed + " (" + r.Error + ")"); // SI-1: memory and file kept; the next call retries
    }
    ```
    `// ponytail: no backoff — during an outage each call waits up to 8 s for Supabase; add one if B34 shows it hurts.`
  - `Token`: refused only when Supabase said no (D4):
    `var code = (int)resp.StatusCode; if (!resp.IsSuccessStatusCode) return (null, SupabaseWords(text, code), code >= 400 && code < 500 && code != 408 && code != 429);`
    and "Supabase answered without tokens" returns `Refused = false`.
- [ ] **1.3 Every `ServiceToken` reader fails in words, never crashes.** (`rg -n "\.ServiceToken" SentinelAddin --glob "*.cs"` lists them; these are outside a `try` or drop the message.)
  - `BcfConfig.ServiceToken` doc: "…throws `SessionException` while a session exists but cannot be used (SI-1); never the file token then."
  - `GovernedNotify.Event`:
    ```csharp
    var cfg = BcfConfig.Load(); // never throws: the file, else the environment, else localhost
    string token;
    try { token = cfg.ServiceToken; }
    catch (SessionException e) { return LedgerResult.NotRecorded(e.Message); } // SI-1: never the PC's token instead
    return LedgerResult.Post(cfg.ServiceUrl, token, projectKey, path, payload, timeout ?? LedgerResult.DefaultTimeout);
    ```
  - `ArtefactClient.Resolve(key, kind, timeout)`: read `cfg.ServiceToken` inside the `try`; add `catch (SessionException e) { return Fallback(kind, ArtefactCache.Read((key ?? "").Trim(), (kind ?? "").Trim()), e.Message, null); }` before the settings catch (a cached copy is labelled "session not refreshed — retrying (…) — cached HH:mm"; no bridge call is made).
  - `Commands.BcfIssues.cs` (`new BcfSyncManager(cfg.ServiceUrl, cfg.ServiceToken)`, `:93`): `string token; try { token = cfg.ServiceToken; } catch (SessionException e) { TaskDialog.Show("Sentinel — BCF Issues", e.Message); return Result.Cancelled; }` then `new BcfSyncManager(cfg.ServiceUrl, token)`.
  - `Commands.BcfIssues.cs` (New Issue, `:182`): `Task.Run(() => { var token = BcfConfig.Load().ServiceToken; return sync.CreateIssueAsync(bcfKey, draft, cfg.ModelId, () => token); })` — a `SessionException` faults the task and the existing continuation prints "Not created — session not refreshed — retrying (…)".
  - `GovernedQuery.FederationStatus`: add `catch (SessionException e) { return "Federation Gate: " + e.Message; }` before `catch { return null; }`; `GovernedQuery.ClashRegister`: add `catch (SessionException e) { failure = e.Message; return null; }` before its `catch { return null; }`.
  - Already inside a `try` that keeps `e.Message` (no change): `ChangesetClient` (all calls), `GovernedNotify.Send` callers, `GovernedQuery.Journey` and the ROI reads, `SettingsDialog.LoadWebProjects`. The pane shows the words through `Journey`: "Journey unavailable — session not refreshed — retrying (…)".
- [ ] **1.4 Verify.** `dotnet run --project tools/session-check` → all pass (22 + the new rows); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and `-p:RevitVersion=2026`; the checks that compile `UserSession.cs` still pass: artefact-cache-check, gate-check, ghost-standards-check, project-context-check, promote-check, publish-check, roi-check.
- [ ] Commit `feat(addin): SI-1 — a refresh that fails without a refusal keeps the session and fails the call in words; never the PC's token while signed in`.

### Task 2: XC-4 — the coordinator is a lead or owner of the web project

(Before the actor task: it deletes `IsCoordinator`, whose `doc.Application.Username` Task 3's source scan would flag.)

**Files:** `Coordination/ChangesetClient.cs`, `Workflow/RequestManager.cs`, `Commands.Workflow.cs`, `UI/RequestsWindow.xaml.cs`, `tools/session-check/*`

- [ ] **2.1 Red.** `tools/session-check/session-check.csproj`: add `<Compile Include="..\..\SentinelAddin\Coordination\ChangesetClient.cs" />` and extend the header comment (SI-1, XC-4). Case 8, called from `Main`:
  ```csharp
  // ── 8. XC-4: the coordinator role comes from the web project; nothing grants on a failure ──────────────
  static void Coordinator()
  {
      Ok(ChangesetClient.CoordinatorFrom("aster-tower", "owner", null).Coordinator && ChangesetClient.CoordinatorFrom("aster-tower", "lead", null).Coordinator, "lead and owner approve");
      foreach (var role in new[] { "contributor", "viewer", "", "service" })
          Ok(!ChangesetClient.CoordinatorFrom("aster-tower", role, null).Coordinator, $"'{role}' is read-only: " + ChangesetClient.CoordinatorFrom("aster-tower", role, null).Why);
      var down = ChangesetClient.CoordinatorFrom("aster-tower", null, "session not refreshed — retrying (Supabase not reached)");
      Ok(!down.Coordinator && down.Why.Contains("session not refreshed"), "role unread (offline, bridge down, session): read-only, and says why");
      Ok(!ChangesetClient.CoordinatorFrom("", null, null).Coordinator, "an unbound model is read-only");
  }
  ```
- [ ] **2.2 Pure decision** in `ChangesetClient`, below `MyRole`:
  ```csharp
  /// <summary>XC-4: whether this person may approve or reject change requests on <paramref name="key"/> — a signed-in
  /// lead or owner of the web project (<paramref name="role"/>/<paramref name="error"/> are <see cref="MyRole"/>'s
  /// answer). Every other answer, and every failure to read one, is read-only with the reason; nothing grants on a failure.</summary>
  public static (bool Coordinator, string Why) CoordinatorFrom(string key, string role, string error)
  {
      if (string.IsNullOrWhiteSpace(key)) return (false, "this model is not bound to a web project (Sentinel ▸ Project Setup)");
      if (role == null) return (false, $"your role on {key} could not be read ({error})");
      if (role is "lead" or "owner") return (true, $"{role} on {key}");
      if (role == "service") return (false, $"signed out — sign in (Standards ▸ Sign in) as a lead or owner of {key} to approve or reject");
      if (role.Length == 0) return (false, $"you are not a member of {key}");
      return (false, $"you are {role} on {key} — approving or rejecting needs lead or owner");
  }
  ```
- [ ] **2.3 Revit side.** In `RequestManager.cs` delete `Settings`, `SettingsPath` and `IsCoordinator` (`:20-41`) and the usings only they used (`System.IO`, `System.Text.Json`); add `using Sentinel.Commands; using Sentinel.Coordination; using Sentinel.Engine;` and:
  ```csharp
  /// XC-4: the coordinator role comes from the web project (GET /cde/{key}/members/me), never a file on this PC.
  /// ponytail: blocking on the command's thread (≤ 8 s + a session refresh), as Review AI Proposals asks its role; an
  /// async read if B34 shows the freeze.
  public static (bool Coordinator, string Why) CoordinatorRole(Document doc)
  {
      var ctx = ProjectContext.For(doc);
      if (!ctx.IsBound) return ChangesetClient.CoordinatorFrom("", null, null);
      var role = ChangesetClient.MyRole(BcfConfig.Load(), ctx.Key, out var error);
      return ChangesetClient.CoordinatorFrom(ctx.Key, role, error);
  }
  ```
  `Commands.Workflow.cs` `ShowRequestsCommand`: `var (coordinator, why) = RequestManager.CoordinatorRole(doc);` → `new Sentinel.UI.RequestsWindow(doc, coordinator, why)`. `SetupWorkflowCommand`: `var (coordinator, why) = RequestManager.CoordinatorRole(doc); if (!coordinator) { TaskDialog.Show("Sentinel", "Only a lead or owner of the web project can run project setup — " + why + "."); return Result.Cancelled; }`.
  `RequestsWindow(Document doc, bool isCoordinator, string why)`: read-only sub-header `$"{Rows.Count} pending — read-only: {why}"` (replaces "(you are not listed as a coordinator)").
- [ ] **2.4 Verify.** session-check passes; `rg -n "IsCoordinator|settings\.json" SentinelAddin` → nothing; build 2024 + 2026; promote-check passes (it compiles `ChangesetClient.cs`).
- [ ] Commit `feat(addin): XC-4 — Change Requests approve/reject for a lead or owner of the web project; everyone else, and an unread role, read-only in words`.

### Task 3: XC-4 — one actor string

**Files:** `Coordination/UserSession.cs` and every site in the table; `tools/session-check/Check.cs`; `tools/heal-check/Check.cs`

- [ ] **3.1 Red.** In `tools/session-check/Check.cs` add `using System.Text.RegularExpressions;` and case 9, called last from `Main`:
  ```csharp
  // ── 9. XC-4: one actor string; no write names "Revit"; no coordinator list on this PC ─────────────────
  static void Identity()
  {
      Ok(UserSession.ActorFor("lead@office.example", "yazan") == "lead@office.example", "signed in: the e-mail");
      Ok(UserSession.ActorFor(null, "yazan") == "unsigned — yazan", "signed out: unsigned — <Windows user>");
      Ok(UserSession.ActorFor(" ", "") == "unsigned — unknown", "no e-mail, no Windows user: never Revit");
      UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
      Ok(UserSession.Actor == "lead@office.example", "Actor reads the session");
      UserSession.SignOut();
      Ok(UserSession.Actor == "unsigned — " + Environment.UserName, "after sign-out: " + UserSession.Actor);
      // the add-in's sources (the scan of tools/project-context-check)
      string root = AppContext.BaseDirectory;
      for (int i = 0; i < 8 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++) root = Path.GetFullPath(Path.Combine(root, ".."));
      var addin = Path.Combine(root, "SentinelAddin");
      var sources = Directory.EnumerateFiles(addin, "*.cs", SearchOption.AllDirectories)
          .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
          .Select(f => (Path: Path.GetRelativePath(addin, f), Text: File.ReadAllText(f))).ToList();
      string[] Hits(string pattern) => sources.Where(s => Regex.IsMatch(s.Text, pattern)).Select(s => s.Path).ToArray();
      var who = Hits(@"Application\.Username|Environment\.UserName").Where(p => p != "App.cs" && !p.EndsWith("UserSession.cs")).ToArray();
      Ok(who.Length == 0, "only UserSession names the Windows user (App.cs compares workset owners)" + (who.Length > 0 ? ": " + string.Join(", ", who) : ""));
      var revit = Hits(@"actor:\s*""Revit""|""Revit"",\s*ctx\.Key|creation_author\s*=\s*""Revit""|""revit:""\s*\+");
      Ok(revit.Length == 0, "no write labels its actor Revit" + (revit.Length > 0 ? ": " + string.Join(", ", revit) : ""));
      Ok(Hits(@"\bIsCoordinator\b").Length == 0, "no coordinator list on this PC (settings.json) is read");
  }
  ```
  Run → build error (`Actor`/`ActorFor` missing).
- [ ] **3.2 Helper** in `UserSession` (below `IsSignedIn`):
  ```csharp
  /// <summary>XC-4: the one actor string every write carries — the signed-in e-mail, else "unsigned — &lt;Windows user&gt;".
  /// Memory only, never the network: safe inside DMU Execute and on Revit's API thread.</summary>
  public static string Actor => ActorFor(Email, Environment.UserName);

  /// <summary>Pure: the e-mail when there is one, else "unsigned — " + the Windows user ("unknown" when blank).</summary>
  public static string ActorFor(string? email, string? windowsUser) =>
      !string.IsNullOrWhiteSpace(email) ? email!.Trim()
      : "unsigned — " + (string.IsNullOrWhiteSpace(windowsUser) ? "unknown" : windowsUser!.Trim());
  ```
- [ ] **3.3 Sites** (add `using Sentinel.Coordination;` where missing):

  | Where (master line) | Today | Change |
  |---|---|---|
  | `Workflow/RequestManager.cs` `CreatePending` (`:97`), `CreateProposal` (`:126`) | `RequestedBy = doc.Application.Username` | `UserSession.Actor` (the audit's `Actor = req.RequestedBy` follows) |
  | `Workflow/RequestManager.cs` `Resolve` (`:146`) | `var user = doc.Application.Username;` | `var user = UserSession.Actor;` |
  | `Workflow/AutoFixExecution.cs:97`, `:105` | `doc.Application.Username` | `UserSession.Actor`; `VerdictBy = "Sentinel.AutoFix"` stays (it names the mechanism) |
  | `Coordination/FixInPlaceService.cs` `Apply` (`:262`) | `doc.Application.Username` | `UserSession.Actor` |
  | `Workflow/NamingManagerService.cs` `Apply` (`:158`) | `doc.Application.Username` | `UserSession.Actor` (in-model rows and the naming ledger row) |
  | `Commands.BcfIssues.cs:163` | `var user = doc.Application.Username;` (read once, when the window opens) | `string User() => UserSession.Actor;` and `user` → `User()` at its five uses (the two `Propose` calls, the evidence text, `AddCommentAsync`, `SetStatusAsync`) |
  | `Coordination/IssueDraft.cs:54`, `Commands.BcfIssues.cs` `CaptureIssue` | `creation_author = "Revit"` | field `public string Author = "";`, `creation_author = Author`; `CaptureIssue` sets `draft.Author = UserSession.Actor;` |
  | `UI/ClashManagerDialog.xaml.cs:72`, `Commands.Phase2.cs:141` | BCF `Author = doc.Application.Username` | `UserSession.Actor` |
  | `Engine/Publisher.cs` `Judge` (`:221`) | `actor: "Revit"` | `actor: UserSession.Actor` |
  | `Commands.PublishSheets.cs:50` | `"Revit"` | `UserSession.Actor` |
  | `Workflow/HealRecord.cs` `Payload` (`:22-27`), `Commands.Phase2.cs:220` | `actor = "revit:" + user`; caller passes `Environment.UserName` | `actor = user` (doc: "the actor, UserSession.Actor"); caller passes `Sentinel.Coordination.UserSession.Actor` |
  | `Standards/StandardsBuilder.cs` `InstallRuleset` (`:360`, doc `:326`) | `"revit:" + Environment.UserName` | `UserSession.Actor`; the doc says so |
  | `Coordination/ChangesetClient.cs` `ReportResult`, `ReportReverted` | `actor = Environment.UserName` | `actor = UserSession.Actor` |
  | `Commands.PromoteWalls.cs:73` | `Environment.UserName` | `UserSession.Actor` |
  | `Coordination/GovernedNotify.cs` `DeliveryGate` | no actor → the bridge writes "Revit" | `var value = Sentinel.Engine.GateLines.AuditValue(fileName, gate, source, publish); value["actor"] = UserSession.Actor; return Event("/delivery-gate", value, projectKey);` — the route reads it and never keeps it in the row's value; a signed-in row is the verified identity whatever it says |
  | `UI/SignInDialog.xaml.cs:36` | "…the ledger records \"Revit\", not you." | "…the ledger records \"" + UserSession.Actor + "\", not you." |
  | `App.cs:283` | workset `Owner` vs `doc.Application.Username` | **unchanged** — Revit's own user name, not an actor |

- [ ] **3.4** `tools/heal-check/Check.cs:19-20`: pass `"lead@office.example"` instead of `"tester"` and expect `\"actor\":\"lead@office.example\"`.
- [ ] **3.5 Verify.** session-check and heal-check pass; `rg -n "Application\.Username|Environment\.UserName|\"Revit\"|\"revit:\" \+" SentinelAddin --glob "*.cs"` → only `App.cs` (workset owner) and `UserSession.cs`; build 2024 + 2026; promote-check, publish-check, issue-check pass.
- [ ] Commit `feat(addin): XC-4 — one actor on every write: the signed-in e-mail, else "unsigned — <Windows user>", never "Revit"`.

### Task 4: GATE-E1 (H5) — the gate row for a signed-in contributor

**Files:** `WebApp/bridge/cde-store.mjs`, `WebApp/bridge/bcf-service.mjs` (comment), `WebApp/bridge/cde-store-hold.test.mjs`, `WebApp/bridge/write-roles.test.mjs`, `SentinelAddin/Coordination/GovernedNotify.cs` (doc)

- [ ] **4.1 Red — unit** (`cde-store-hold.test.mjs:115-122`). Title → `"recordDeliveryGate — Revit's gate row: the machine credential or a signed-in contributor or above (GATE-E1)"`; replace the "a signed-in caller (%s) is refused" test with:
  ```js
  it.each(["viewer", null])("a signed-in %s is refused before any store read or validation", async (role) => {
    state.role = role;
    const message = `a delivery_gate row is a contributor's or above (you are ${role || "not a member"}) — nothing was saved`;
    await expect(recordDeliveryGate("aster-tower", gate)).rejects.toMatchObject({ status: 403, message });
    await expect(recordDeliveryGate("aster-tower", { ...gate, file: "x.rvt" })).rejects.toMatchObject({ status: 403, message }); // the role first: no probing the validator
    expect(calls).toHaveLength(0);
  });

  it.each(["owner", "lead", "contributor"])("a signed-in %s's gate row is written, and a publish FAIL is held", async (role) => {
    state.role = role;
    expect(await recordDeliveryGate("aster-tower", gate)).toEqual({ id: 901, hash: "901".padStart(64, "0"), hold: { id: 902, hash: "902".padStart(64, "0") } });
    expect(db.audit_log.map((x) => x.entity_type)).toEqual(["delivery_gate", "hold"]);
  });
  ```
  Update the file's header comment ("the machine-only delivery-gate route" → "the delivery-gate route").
- [ ] **4.2 Red — end to end** (`write-roles.test.mjs`, a new `describe` right after `"POST /cde/:key/audit (cde-6, D11)…"`, where `recordRevitReport` is covered):
  ```js
  describe("POST /cde/:key/delivery-gate (GATE-E1, H5): Revit's gate row under the signed-in person", () => {
    const G = "/cde/demo/delivery-gate";
    const check = { file: "Demo.ifc", result: "pass", passed: true, failures: [], source: "check", publish: false };
    const failPublish = { ...check, result: "fail", passed: false, failures: ["IFCPROJECT: 0 found, contract requires ≥ 1."], source: "revit", publish: true };

    it("a signed-in contributor's check row is recorded under their verified identity, whatever the body claims", async () => {
      const r = await call("POST", G, "contributor", { ...check, actor: "Revit" });
      expect(r).toMatchObject({ status: 201, body: { id: 1, hash: "ab".repeat(32), hold: null } });
      expect(db.audit_log.map((a) => [a.entity_type, a.action, a.actor])).toEqual([["delivery_gate", "IFC delivery gate PASS: Demo.ifc", "contributor@example.test"]]);
    });

    it("a lead's publish FAIL: the gate row and its hold, both by the lead", async () => {
      expect((await call("POST", G, "lead", failPublish)).status).toBe(201);
      expect(db.audit_log.map((a) => [a.entity_type, a.actor])).toEqual([["delivery_gate", "lead@example.test"], ["hold", "lead@example.test"]]);
    });

    it("a viewer is a 403 in words and nothing reaches the ledger", async () => {
      expect(await call("POST", G, "viewer", check))
        .toEqual({ status: 403, body: { message: "a delivery_gate row is a contributor's or above (you are viewer) — nothing was saved" } });
      expect(writes("audit_log")).toEqual([]);
    });

    it("the machine credential writes as before, keeping the actor Revit sent", async () => {
      expect((await call("POST", G, "machine", { ...check, actor: "unsigned — tester" })).status).toBe(201);
      expect(db.audit_log[0]).toMatchObject({ entity_type: "delivery_gate", actor: "unsigned — tester" });
    });

    it("a user's gate rows are budgeted: the 21st in a minute is a 429 and writes nothing", async () => {
      for (let i = 0; i < 20; i++) expect((await call("POST", G, "owner", check)).status).toBe(201);
      expect(await call("POST", G, "owner", check))
        .toEqual({ status: 429, body: { message: "too many gate rows in a minute — nothing was saved; try again shortly" } });
      expect(writes("audit_log")).toHaveLength(20);
    });
  });
  ```
  (The owner posts no other gate row in this file, and the file's gate rows stay under the shared 60 a minute.) From `WebApp`: `npx vitest run bridge/cde-store-hold.test.mjs bridge/write-roles.test.mjs` → the new cases fail with the machine-only 403.
- [ ] **4.3 Implement** `recordDeliveryGate` (`cde-store.mjs:1172-1174`) — the same check and words as `recordRevitReport`, its own budget, the order role → validation → budget → write:
  ```js
  export async function recordDeliveryGate(key, b = {}) {
    const { myRole, ROLE_RANK } = await import("./members-store.mjs");
    const role = await myRole(key);
    if (role !== "service" && (ROLE_RANK[role] || 0) < ROLE_RANK.contributor)
      throw Object.assign(new Error(`a delivery_gate row is a contributor's or above (you are ${role || "not a member"}) — nothing was saved`), { status: 403 });
    const g = readDeliveryGate(b);
    takeWriteBudget("gate rows", { perUser: 20, all: 60 }); // the machine credential (no signed-in user) is not budgeted
    const proj = await ensureProject(key);
    // …unchanged: audit() puts a signed-in caller's verified identity before the claimed actor (resolveActor)
  ```
  Rewrite the comments that say the route is the machine credential's only: the `recordDeliveryGate` doc (`:1166-1171`), the reserved-rows doc (`:994-996`; the open audit route still refuses `delivery_gate`), `bcf-service.mjs:1326-1329`, and `GovernedNotify.DeliveryGate`'s XML doc ("the machine credential, or a signed-in contributor or above under their verified identity (GATE-E1)").
- [ ] **4.4 Verify.** The two files pass; then `npm run test` in `WebApp` (the whole suite; the `/audit` "a gate row is a 400" case in `write-roles.test.mjs` stays green).
- [ ] Commit `feat(bridge): GATE-E1 (H5) — a signed-in contributor's gate row, under their verified identity, with its own write budget; the dialog ends "Recorded: ledger #<id>"`.

### Task 5: Verify, document, hand over

- [ ] Builds: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false`, the same for 2025 and 2026 — no new warnings.
- [ ] Checks: `dotnet run --project tools/<name>` for session-check, heal-check, issue-check, project-context-check, artefact-cache-check, and the CI list (fixplace, naming, org, snapshot, gate, ghost-standards, heal, event, publish, roi, docpin, guideline, promote) — each ends "N/N checks pass".
- [ ] `.github/workflows/ci.yml`: add `dotnet run --project tools/session-check` to the Revit-free step and "session" to its name.
- [ ] WebApp: `npm run test` green. Report that the `node_modules` junction exists; leave it.
- [ ] Spec: an "As built (package 4)" note under Package 4 — D1–D6 and the known limits: `BcfSyncManager` keeps the token it got when BCF Issues opened (list, comment and status calls go 401 after an hour — reopen the window); no retry backoff; ⚡ Fix and verdicts have no ledger row (XC-5 / CR-3).
- [ ] `graphify update .`; adversarial review of the branch diff (the route opening; every `ServiceToken` reader; `Actor` on the DMU path); fix confirmed findings. Merge `--no-ff`, secret-scan and push are the orchestrator's or the founder's.

### Task 6: Live drill B34 (Revit 2024 — the founder signed in; not run by the implementer)

**Setup.** Revit closed → deploy the merged build (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024`) → `setx SENTINEL_SESSION_REFRESH_WITHIN 3500` (for row 6) → start Revit, open the aster-tower local, bridge up, Standards ▸ Sign in as the founder (owner). In-model actors are read by Claude with the Revit MCP (reflection on `Sentinel.Workflow.RequestStore.GetAudit(doc)`, last entries); ledger actors with
`select id, at, entity_type, action, actor from audit_log where project_id = (select id from projects where key = 'aster-tower') order by id desc limit 12;`

| # | Do | Pass when — in the model | Pass when — on the ledger |
|---|---|---|---|
| 1 | ⚡ Fix on a WARN naming row | `autofix.applied` actor = the e-mail | no row by design (D5) |
| 2 | ⚡ Fix on a REQUEST row (VN-01) → Change Requests → Approve | the window opens enabled; the row reads "by <e-mail>"; `request.proposed` and `request.approved` by the e-mail | no row by design (D5) |
| 3 | BCF Issues (opened fresh) → an IDS issue → Fix in place → Apply | `fix.applied` by the e-mail; the topic's comment "Fixed in Revit by <e-mail>" | the re-check proposal row's actor = the e-mail |
| 4 | IFC Delivery Gate on an exported aster IFC | — | the dialog ends "Recorded: ledger #<id> · receipt …"; the delivery_gate row's actor = the e-mail (B15 got HTTP 403) |
| 5 | Governed Publish | — | "Gate row: ledger #…" recorded; the proposal row (and a FAIL's hold) by the e-mail |
| 6 | Signed in ≥ 2 min (knob set) → Wi-Fi off → IFC Delivery Gate → pane ↻ → Change Requests → ⚡ Fix → Wi-Fi on → IFC Delivery Gate | the gate dialog ends "Not recorded — session not refreshed — retrying (…)"; the pane's Next line "Journey unavailable — session not refreshed — retrying (…)"; Change Requests read-only "your role on aster-tower could not be read (session not refreshed …)"; the ⚡ Fix lands by the e-mail | after Wi-Fi on: "Recorded: ledger #…", actor = the e-mail; no row written while signed in reads "Revit" or "unsigned" |
| 7 | Sign out → ⚡ Fix → IFC Delivery Gate → Change Requests | ⚡ Fix by "unsigned — <Windows user>"; Change Requests read-only "signed out — sign in … as a lead or owner of aster-tower …" | the gate row recorded under the PC's token, actor "unsigned — <Windows user>" |
| 8 | Sign in as the second account (a contributor on aster-tower) → Change Requests → IFC Delivery Gate | Change Requests read-only "you are contributor on aster-tower — approving or rejecting needs lead or owner" | the gate row recorded, actor = the second account's e-mail |

**After.** `reg delete HKCU\Environment /v SENTINEL_SESSION_REFRESH_WITHIN /f`, restart Revit, sign in as the founder again. Record the rows in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` under "Session B34 — package 4" (the spec's number; the MA0 session used B33).
