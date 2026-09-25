# Phase 4b-2 — Layers, Guideline and Type Catalogue From the Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghost Builder, Photo Massing and Annotate Views build with the `layers@n`, `guideline@n` and `type_catalog@n` installed on the document's web project or its office, name them on every surface, never pre-tick a guess, never clone an unrelated wall type, and refuse or say "none" when nothing is installed — with no BDS file shipped beside the DLL, no machine-global catalogue and no Ghost standard setting left.

**Architecture:** `ArtefactClient.Resolve` gets a per-call timeout; a pure `GhostStandards` resolves the three kinds for one project in parallel and parses them with `LayerRulesetMatcher.FromBody` / `GuidelineMatcher.FromBodies` (a body a loader refuses is none naming the field). `LayerMapper` asks the installed standard before a per-project cache stamped with the layers sha, labels heuristics and survives a local-model failure; `GhostTypeCreator` reports a gap instead of cloning; Build Office System exports the catalogue instead of writing the machine file. The three commands read the key on the API thread and resolve off it.

**Tech Stack:** C# Revit add-in (net48 for 2024, net8 for 2025/26; WPF review window; `tools/*-check` net8 harnesses incl. the new `tools/ghost-standards-check`), Node bridge (vitest), TypeScript web (vite).

Spec: `docs/superpowers/specs/2026-09-25-standards-4b-design.md` (Decisions 2, 3, 5, 8, 9, 10 and "4b-2"). Branch: `feature/ghost-standards-from-project` from master (after 4b-1, 274ef6b).

## Global Constraints

- Execution order: Tasks 1, 2, 3, 4, 5, then the controller's Task 6. Where a task quotes text an earlier task changed, the amendments give that earlier task's replacement as the old text; the amendments override a task's code where they conflict.
- Add-in build (`dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false`, and 2025): green after Task 1 (0 errors; 6 warnings on 2024, 3 on 2025). Red from Task 2's commit until Task 4's.
- After Task 2 there are exactly 3 errors on each version: `Commands.GhostBuilder.cs(173,72)` CS0117 `LayerRulesetMatcher.Load`, `(173,26)` CS7036 `projectKey`, `(297,28)` CS7036 `standardsHeader`.
- After Task 3 there are exactly 6: those 3, plus CS0117 `GuidelineMatcher.Load` at `Commands.Annotate.cs(26,42)`, `Commands.GhostBuilder.cs(177,42)` and `Commands.Massing.cs(42,42)`.
- Task 4 is the first green build again, with the same warnings (2024: ChangesetExecutor 164, Commands.BcfIssues 322, Commands.GhostBuilder 220, GhostBuilderOrchestrator 112, RuleRegex 17 and 20; 2025: Commands.Annotate 76 and 88, Commands.BcfIssues 322). Task 5 touches no C#.
- Nobody pushes between Task 2's and Task 4's commits: CI builds the add-in on every push. Never deploy — Revit is open — so always pass `-p:DeployToRevit=false`.
- File ownership: Tasks 1–3 never edit `Commands.GhostBuilder.cs`, `Commands.Massing.cs`, `Commands.Annotate.cs`, `Commands.Datum.cs`, `App.cs`, `Engine/SettingsManager.cs`, `Sentinel.csproj`, `SentinelAddin/Resources/`, `GhostBuilder/ViewPlanner.cs` or the web tests. Task 2 owns `UI/GhostReviewWindow.cs` and `tools/ghost-p2-check`. Task 3 owns `ElementPlacementFactory.cs`, `GhostBuilder_ExtractionAndPlacement.cs` and the switch of guideline-check, annotate-check and wallpair-check to `FromBodies`. Task 4 only swaps those three harnesses' fixture paths and adds its own checks.
- Harness gates, exact totals: `dotnet run --project tools/ghost-standards-check` 16/16 (T1), 62/62 (T2), 124/124 (T3, T4), 125/125 (T5). ghost-p2-check 38/38 on master, 42/42 from T2. guideline-check 16/16 (master, T3), 17/17 from T4. annotate-check ALL PASS: 13 checks (master, T3), 16 from T4. wallpair-check 9/9 throughout and `-- sample` SAMPLE OK. artefact-cache-check 53/53 and gate-check 123/123 throughout. naming-check 37/37.
- Harness gates, by task: Tasks 2 and 3 gate on harnesses only (ghost-standards-check plus every harness they touch, all green); Task 4 gates on everything above plus both builds.
- Web gates: `cd WebApp && npm test` — 991 passed in 74 files for T1–T4, 992 in 74 after T5. The two files T4 repoints pass 110/110; artefact-store.test.mjs goes 96 → 97 in T5. `npx tsc --noEmit -p .` stays at 24 errors, none in a touched file.
- Revit threading: `ProjectContext.For(doc).Key` is read on the API thread; `GhostStandards.Load` runs off it (Ghost Builder in its existing Task.Run phase; Massing next to the vision call; Annotate via `Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult()`). Revit API and Extensible Storage only on the API thread. `ArtefactClient.Resolve` and `GhostStandards.Load` never throw. The per-call cap is 4 s, 20 s for type_catalog.
- Honesty, naming: every Ghost, Massing and Annotate surface names `kind@n · source · sha` (plus ` (cached HH:mm)` from the cache) or `none — <reason>`. A body a loader refuses is `none — <label> did not parse: <error>`, never a partial standard.
- Honesty, rows: only `standard` rows (exact or alias rows of the installed layers@n) are pre-ticked; `heuristic`, `llm`, `cache` and `unmapped` rows never are. With no type catalogue, the summary says types were checked against this document only. A missing catalogue sibling is a reported gap, never a clone of the first Basic wall.
- No silent default: no file chain, no built-in default, no Resources copy, no ghost_* setting.
- Office data only under `demo/` and `config/`. At Task 4's end, `git diff 274ef6b -- "SentinelAddin/*.cs" | grep "^+" | grep -E "BDS|AST_"` prints nothing. No .cs under SentinelAddin contains the literal `type-catalog.json` (ghost-standards-check asserts this).
- Machine independence: no harness or test reads %AppData%. ghost-standards-check points ArtefactCache.Root at a temp folder, and the export check writes to temp. The only read of `%AppData%\Sentinel\type-catalog.json` is Task 5 Step 3's one-time fixture creation.
- C# harnesses (net8 console, `dotnet run --project tools/<name>-check`) compile only pure add-in files, with no RevitAPI. The new `tools/ghost-standards-check` runs in CI's Revit-free step (Task 1).
- Commits: every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Windows: quote paths (they contain spaces). Scripts passed through a Bash heredoc stay backslash-free, or are written to a file first.
- Markdown tables: no `|` inside a cell, even in backticks.

---

### Task 1: Revit — `ArtefactClient.Resolve` takes a per-call cap (4 s by default, 20 s for a type catalogue); `GhostStandards` resolves layers, guideline and type catalogue together for one project, each labelled, none named; `tools/ghost-standards-check`

**Files:**
- Modify: `SentinelAddin/Coordination/ArtefactClient.cs` (usings :1-5; the class summary's last three lines, `Http` and both `Resolve` overloads :29-66)
- Create: `SentinelAddin/GhostBuilder/GhostStandards.cs`
- Create: `tools/ghost-standards-check/ghost-standards-check.csproj`, `tools/ghost-standards-check/Check.cs`
- Modify: `.github/workflows/ci.yml` (:38-45, the Revit-free checks step)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-standards-4b-design.md` decisions 5 and 10 and "4b-2 — layers, guideline, type catalogue in Revit"; `SentinelAddin/Coordination/ArtefactClient.cs:14-23` (`ResolvedArtefact`), `:68-112` (`Interpret`: 200 → bridge and a cache write; 304; 404 not_installed / no_project / unknown_kind; anything else → the cached copy labelled cached, else none), `:133-142` (`Fallback`; `None` is public since 4b-1); `SentinelAddin/Engine/ArtefactCache.cs:29-41` (`Root` is `internal static` — the harness points it at a temp folder; `PathFor`/`Safe`); `SentinelAddin/Engine/DeliveryContract.cs:104-116` (the 4b-1 pattern this task repeats: `Load(key)` is `FromResolved(ArtefactClient.Resolve(...))`; none stays none; a body the loader refuses is `ArtefactClient.None(kind, "<label> did not parse: <error>")`); `tools/artefact-cache-check/Check.cs:17-46` (the one-shot loopback bridge this harness generalises to N parallel requests) and `tools/artefact-cache-check/artefact-cache-check.csproj:14-17` (`ArtefactCache.cs` + `ArtefactClient.cs` + `BcfConfig.cs` compile on plain net8); `SentinelAddin/Coordination/BcfConfig.cs:21-36` (the public `Resolve` reads it; the harness drives the internal overload against its own bridge); the callers of `Resolve(key, kind)` that keep the 4 s default untouched — `Engine/CdeSyncGuard.cs:28`, `Engine/DeliveryContract.cs:106`, `Engine/IdsSpecFile.cs:12`, `Engine/RulesetStore.Revit.cs:18`, `Standards/StandardsBuilder.cs:333` (none uses `Resolve` as a method group, so the optional parameter breaks no call site); `tools/gate-check/gate-check.csproj` and `tools/artefact-cache-check/artefact-cache-check.csproj` (both compile `ArtefactClient.cs` and must stay green).

**Interfaces:**
- Consumes: `ResolvedArtefact { Kind, Ref, Source, Sha256, BodyJson, Origin /* bridge|cache|none */, Reason, NotInstalled, FetchedAt, Label }`, `ArtefactClient.None(string kind, string reason)`, `ArtefactClient.RefLabel(string? ref, string? source, string? sha256)`, `ArtefactCache.Root` (phase 4a / 4b-1, unchanged).
- Produces:
  - `public static ResolvedArtefact ArtefactClient.Resolve(string key, string kind, TimeSpan? timeout = null)` — the cap covers the whole GET, body included; `null` is `ArtefactClient.DefaultTimeout`. A call that runs out reads `none — bridge unreachable (timed out after <s> s)` (`4`, `20`, `0.5` — `0.#` invariant), or the cached copy labelled cached. Still blocking, still never throws.
  - `internal static ResolvedArtefact ArtefactClient.Resolve(string key, string kind, string serviceUrl, string token, TimeSpan? timeout = null)` — the harness's entry.
  - `public static readonly TimeSpan ArtefactClient.DefaultTimeout` = 4 s. The shared `HttpClient` has no cap of its own any more (`Timeout.InfiniteTimeSpan`); every call has its own `CancellationTokenSource(cap)`.
  - `public sealed class Sentinel.GhostBuilder.GhostStandards` (private constructor):
    - `public ResolvedArtefact LayersSource, GuidelineSource, CatalogSource;`
    - `public string Header => "Layers: " + LayersSource.Label + " · Guideline: " + GuidelineSource.Label + " · Type catalogue: " + CatalogSource.Label;`
    - `public static readonly TimeSpan CatalogTimeout` = 20 s.
    - `public static GhostStandards Load(string key, bool layers = true, bool guideline = true, bool catalog = true)` — BLOCKING (≤ 4 s; ≤ 20 s when the catalogue is asked for), never throws, no Revit API: the kinds asked for go out in parallel (`Task.WhenAll` of `Task.Run(resolve)`; `type_catalog` with `CatalogTimeout`, the others with the default); a kind not asked for is `ArtefactClient.None(kind, "not needed by this command")` and is never requested; a resolver that throws is `none — the <kind> could not be loaded (<message>)`. `key` is `ProjectContext.For(doc).Key`, read by the caller on the API thread (`""` → every kind "not bound — Sentinel ▸ Project Setup").
    - `internal static GhostStandards Load(Func<string, TimeSpan?, ResolvedArtefact> resolve, bool layers, bool guideline, bool catalog)` — the same through an injected resolver `(kind, timeout)`.
    - `internal static GhostStandards FromResolved(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog)` — the pure half of `Load`. In this task it only holds the three sources; Task 2 adds `Layers` (and the layers parse), Task 3 `Guideline` (and the guideline and catalogue parse).
  - `tools/ghost-standards-check` — net8.0 console, `static partial class Check`, so Tasks 2 and 3 add their sections as files of their own.

- [ ] **Step 1: Write the failing harness**

Create `tools/ghost-standards-check/ghost-standards-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the Ghost trio's standards (cohesion phase 4b-2): ArtefactClient's per-call cap and
       GhostStandards - layers@n, guideline@n and type_catalog@n resolved together for one project, each
       labelled, none named. It talks only to throwaway loopback "bridges" and points the cache root at a temp
       folder; nothing touches AppData or the running bridge. No Revit API; `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>ghost-standards-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\ArtefactClient.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\BcfConfig.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostStandards.cs" />
  </ItemGroup>
</Project>
```

Create `tools/ghost-standards-check/Check.cs`:

```csharp
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    // Bodies the bridge validators accept, so the loaders of later tasks read them as installed standards.
    const string LayersBody = "{\"standard\":\"Harness layers\",\"layers\":[{\"layer\":\"A-WALL\",\"category\":\"Walls\",\"family\":\"Wall_A\"}]}";
    const string CatalogBody = "{\"types\":[{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"Wall_A\"}],\"template\":{\"title\":\"Harness template\"}}";

    static int Main()
    {
        Console.WriteLine("GhostStandards — layers, guideline and type catalogue from the project, each named, none included\n");
        ArtefactCache.Root = Path.Combine(Path.GetTempPath(), "sentinel-ghost-standards-check-" + Guid.NewGuid().ToString("N"));
        try { Client(); Standards(); }
        finally { try { Directory.Delete(ArtefactCache.Root, true); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    static string Answer200(string kind, string body) =>
        $"{{\"kind\":\"{kind}\",\"version\":1,\"body\":{body},\"source\":\"office\",\"ref\":\"{kind}@1\",\"sha256\":\"{Sha}\",\"pointer_sha_mismatch\":false}}";
    static string NotInstalled(string key, string kind) =>
        $"{{\"message\":\"no {kind} artefact installed for {key} or its office\",\"reason\":\"not_installed\"}}";

    // A loopback "bridge": accepts `count` requests, answers each by its path after `delayMs`, all in parallel, and
    // hands back the request lines it saw. A client that already gave up is not an error.
    static (Task<string[]> Seen, string Url) Bridge(int count, Func<string, (int Status, string Body)> answer, int delayMs = 0)
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)l.LocalEndpoint).Port;
        var seen = new ConcurrentQueue<string>();
        async Task One(TcpClient c)
        {
            using (c)
            {
                var s = c.GetStream();
                var buf = new byte[8192];
                var got = new StringBuilder();
                while (!got.ToString().Contains("\r\n\r\n"))
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.Append(Encoding.ASCII.GetString(buf, 0, n));
                }
                var line = got.ToString().Split("\r\n")[0];
                seen.Enqueue(line);
                await Task.Delay(delayMs);
                var (status, body) = answer(line.Split(' ')[1]);
                var bytes = Encoding.UTF8.GetBytes(body);
                var head = $"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
                try { await s.WriteAsync(Encoding.ASCII.GetBytes(head).Concat(bytes).ToArray()); await s.FlushAsync(); }
                catch (IOException) { /* the client's cap ran out first */ }
            }
        }
        var t = Task.Run(async () =>
        {
            try
            {
                var calls = new List<Task>();
                for (int i = 0; i < count; i++) calls.Add(One(await l.AcceptTcpClientAsync()));
                await Task.WhenAll(calls);
                return seen.ToArray();
            }
            finally { l.Stop(); }
        });
        return (t.WaitAsync(TimeSpan.FromSeconds(30)), url); // a client that never connects fails the check instead of hanging it
    }

    static string DeadUrl()
    {
        var dead = new TcpListener(IPAddress.Loopback, 0);
        dead.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)dead.LocalEndpoint).Port;
        dead.Stop();
        return url;
    }

    // ── 1. ArtefactClient: every call carries its own cap ────────────────────────────────────────────────
    static void Client()
    {
        Ok(ArtefactClient.DefaultTimeout == TimeSpan.FromSeconds(4) && GhostStandards.CatalogTimeout == TimeSpan.FromSeconds(20), "4 s by default, 20 s for a type catalogue");

        // A bridge that takes 4.5 s to answer: past the old client-wide 4 s, well inside a catalogue's 20 s.
        var (slow, slowUrl) = Bridge(2, p => (200, Answer200(p.EndsWith("/type_catalog") ? "type_catalog" : "layers", p.EndsWith("/type_catalog") ? CatalogBody : LayersBody)), delayMs: 4500);
        var catalog = Task.Run(() => ArtefactClient.Resolve("slow-a", "type_catalog", slowUrl, "", GhostStandards.CatalogTimeout));
        var plain = Task.Run(() => ArtefactClient.Resolve("slow-b", "layers", slowUrl, ""));
        var cat = catalog.GetAwaiter().GetResult();
        var def = plain.GetAwaiter().GetResult();
        slow.GetAwaiter().GetResult();
        Ok(cat.Origin == "bridge" && cat.Label == "type_catalog@1 · office · 0123456789ab…", "a 20 s call outlives the old client-wide 4 s (the bridge took 4.5 s)");
        Ok(def.Origin == "none" && def.Label == "none — bridge unreachable (timed out after 4 s)", "a call with no cap of its own still stops at 4 s, and says so");

        // A bridge that accepts and never answers: the caller's cap, and the label says which.
        var silent = new TcpListener(IPAddress.Loopback, 0);
        silent.Start();
        var sw = Stopwatch.StartNew();
        var quiet = ArtefactClient.Resolve("quiet", "guideline", "http://127.0.0.1:" + ((IPEndPoint)silent.LocalEndpoint).Port, "", TimeSpan.FromMilliseconds(500));
        var took = sw.Elapsed;
        silent.Stop();
        Ok(quiet.Label == "none — bridge unreachable (timed out after 0.5 s)" && took < TimeSpan.FromSeconds(3), "0.5 s asked, under 3 s waited, and the label says 0.5 s");
    }

    // ── 2. GhostStandards: the kinds a command asks for, fetched together, each labelled ────────────────
    static void Standards()
    {
        // demo: layers and the catalogue on its office, no guideline anywhere
        var (seen, url) = Bridge(3, p => p switch
        {
            "/cde/demo/artefacts/layers" => (200, Answer200("layers", LayersBody)),
            "/cde/demo/artefacts/type_catalog" => (200, Answer200("type_catalog", CatalogBody)),
            "/cde/demo/artefacts/guideline" => (404, NotInstalled("demo", "guideline")),
            _ => (500, "{\"message\":\"unexpected " + p + "\"}"),
        });
        var s = GhostStandards.Load((kind, t) => ArtefactClient.Resolve("demo", kind, url, "", t), true, true, true);
        var lines = seen.GetAwaiter().GetResult().OrderBy(x => x, StringComparer.Ordinal).ToArray();
        Ok(lines.SequenceEqual(new[] { "GET /cde/demo/artefacts/guideline HTTP/1.1", "GET /cde/demo/artefacts/layers HTTP/1.1", "GET /cde/demo/artefacts/type_catalog HTTP/1.1" }),
           "one GET per kind the command needs");
        Ok(s.LayersSource is { Origin: "bridge", Ref: "layers@1", Source: "office" } && s.LayersSource.Label == "layers@1 · office · 0123456789ab…", "layers@1 from the office, labelled");
        Ok(s.GuidelineSource is { Origin: "none", NotInstalled: true } && s.GuidelineSource.Label == "none — not installed for demo or its office", "no guideline → none, named");
        Ok(s.CatalogSource.Label == "type_catalog@1 · office · 0123456789ab…", "type_catalog@1 from the office, labelled");
        Ok(s.Header == "Layers: layers@1 · office · 0123456789ab… · Guideline: none — not installed for demo or its office · Type catalogue: type_catalog@1 · office · 0123456789ab…",
           "the header names all three, none included");

        var dead = DeadUrl();
        var again = GhostStandards.Load((kind, t) => ArtefactClient.Resolve("demo", kind, dead, "", t), true, true, true);
        Ok(again.LayersSource.Origin == "cache" && again.LayersSource.Label.StartsWith("layers@1 · office · 0123456789ab… (cached ")
           && again.CatalogSource.Label.StartsWith("type_catalog@1 · office · 0123456789ab… (cached ")
           && again.GuidelineSource.Label.StartsWith("none — bridge unreachable"), "bridge stopped → the cached copies say cached; the guideline stays none");

        // The catalogue asks for 20 s, the others take the default; the three go out together, not one after another.
        var asked = new ConcurrentDictionary<string, TimeSpan?>();
        var met = new ConcurrentBag<bool>();
        using (var together = new Barrier(3))
            GhostStandards.Load((kind, t) => { asked[kind] = t; met.Add(together.SignalAndWait(TimeSpan.FromSeconds(5))); return ArtefactClient.None(kind, "fake"); }, true, true, true);
        Ok(asked.Count == 3 && asked["layers"] is null && asked["guideline"] is null && asked["type_catalog"] == TimeSpan.FromSeconds(20),
           "layers and guideline use the 4 s default, the catalogue asks for 20 s");
        Ok(met.Count == 3 && met.All(x => x), "the three are fetched in parallel");

        asked.Clear();
        var guideOnly = GhostStandards.Load((kind, t) => { asked[kind] = t; return ArtefactClient.None(kind, "fake"); }, false, true, false);
        Ok(asked.Keys.SequenceEqual(new[] { "guideline" }), "a command that needs the guideline only asks for the guideline only");
        Ok(guideOnly.LayersSource is { Kind: "layers", Origin: "none" } && guideOnly.LayersSource.Label == "none — not needed by this command"
           && guideOnly.CatalogSource is { Kind: "type_catalog" } && guideOnly.CatalogSource.Label == "none — not needed by this command",
           "a kind not asked for is none, and says why");

        var thrown = GhostStandards.Load((kind, t) => throw new InvalidOperationException("boom"), true, false, false);
        Ok(thrown.LayersSource.Label == "none — the layers could not be loaded (boom)", "a resolver that throws is none with the reason, never a crash");

        var unbound = GhostStandards.Load("");
        Ok(unbound.Header == "Layers: none — not bound — Sentinel ▸ Project Setup · Guideline: none — not bound — Sentinel ▸ Project Setup · Type catalogue: none — not bound — Sentinel ▸ Project Setup",
           "an unbound document asks nothing and reads not bound, three times");
    }
}
```

`LayersBody` and `CatalogBody` pass the bridge validators (`WebApp/bridge/artefact-store.mjs:141-152` layers, `:168-184` type_catalog), so the labels checked here stay as they are once Tasks 2 and 3 parse the bodies in `FromResolved`.

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/ghost-standards-check
```

Expected: the build fails before any check runs, with (printed twice by MSBuild):

```
CSC : error CS2001: Source file '…\tools\ghost-standards-check\..\..\SentinelAddin\GhostBuilder\GhostStandards.cs' could not be found.
The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `ArtefactClient` — every call carries its own cap**

In `SentinelAddin/Coordination/ArtefactClient.cs` replace lines 1-5:

```csharp
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
```

with:

```csharp
using System;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
```

Then replace lines 29-66 (master numbering), which today read:

```csharp
    /// cached copy labelled "cached", else none. Blocking (4 s cap) and never throws — callers run it OFF the Revit
    /// UI thread and hand the result back to the API thread.
    /// </summary>
    public static class ArtefactClient
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

        public static ResolvedArtefact Resolve(string key, string kind)
        {
            BcfConfig cfg;
            try { cfg = BcfConfig.Load(); }
            catch (Exception e) { return None(kind, "the bridge settings could not be read (" + e.Message + ")"); }
            return Resolve(key, kind, cfg.ServiceUrl, cfg.ServiceToken);
        }

        /// <summary>As <see cref="Resolve(string,string)"/> against an explicit bridge (the harness's fake one).</summary>
        internal static ResolvedArtefact Resolve(string key, string kind, string serviceUrl, string token)
        {
            key = (key ?? "").Trim();
            kind = (kind ?? "").Trim();
            if (key.Length == 0) return None(kind, "not bound — Sentinel ▸ Project Setup");
            var cached = ArtefactCache.Read(key, kind);
            try
            {
                using var msg = new HttpRequestMessage(HttpMethod.Get,
                    (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/artefacts/" + Uri.EscapeDataString(kind));
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (cached != null) msg.Headers.TryAddWithoutValidation("If-None-Match", ETagFor(cached.Ref, cached.Source, cached.Sha256));
                using var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
                var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return Interpret(key, kind, (int)resp.StatusCode, text, cached, DateTime.UtcNow);
            }
            catch (Exception e)
            {
                var why = e is TaskCanceledException or OperationCanceledException ? "timed out after 4 s" : (e.InnerException?.Message ?? e.Message);
                return Fallback(kind, cached, "bridge unreachable", why);
            }
        }
```

with:

```csharp
    /// cached copy labelled "cached", else none. Blocking — each call has its own cap, 4 s unless the caller passes
    /// one (a type catalogue passes 20 s) — and never throws: callers run it OFF the Revit UI thread and hand the
    /// result back to the API thread.
    /// </summary>
    public static class ArtefactClient
    {
        // No client-wide cap: every call carries its own (a CancellationTokenSource per call), so the catalogue's
        // 20 s never becomes every kind's, and a 4 s default never cuts the catalogue short.
        private static readonly HttpClient Http = new HttpClient { Timeout = System.Threading.Timeout.InfiniteTimeSpan };

        /// <summary>The cap on one artefact GET, body included, when the caller passes none.</summary>
        public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(4);

        public static ResolvedArtefact Resolve(string key, string kind, TimeSpan? timeout = null)
        {
            BcfConfig cfg;
            try { cfg = BcfConfig.Load(); }
            catch (Exception e) { return None(kind, "the bridge settings could not be read (" + e.Message + ")"); }
            return Resolve(key, kind, cfg.ServiceUrl, cfg.ServiceToken, timeout);
        }

        /// <summary>As <see cref="Resolve(string,string,TimeSpan?)"/> against an explicit bridge (the harness's fake one).</summary>
        internal static ResolvedArtefact Resolve(string key, string kind, string serviceUrl, string token, TimeSpan? timeout = null)
        {
            key = (key ?? "").Trim();
            kind = (kind ?? "").Trim();
            if (key.Length == 0) return None(kind, "not bound — Sentinel ▸ Project Setup");
            var cap = timeout ?? DefaultTimeout;
            var cached = ArtefactCache.Read(key, kind);
            try
            {
                // SendAsync buffers the body before it returns, under this token: the cap covers the whole read.
                using var cts = new CancellationTokenSource(cap);
                using var msg = new HttpRequestMessage(HttpMethod.Get,
                    (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/artefacts/" + Uri.EscapeDataString(kind));
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (cached != null) msg.Headers.TryAddWithoutValidation("If-None-Match", ETagFor(cached.Ref, cached.Source, cached.Sha256));
                using var resp = Http.SendAsync(msg, cts.Token).GetAwaiter().GetResult();
                var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return Interpret(key, kind, (int)resp.StatusCode, text, cached, DateTime.UtcNow);
            }
            catch (Exception e)
            {
                var why = e is OperationCanceledException
                    ? "timed out after " + cap.TotalSeconds.ToString("0.#", CultureInfo.InvariantCulture) + " s"
                    : (e.InnerException?.Message ?? e.Message);
                return Fallback(kind, cached, "bridge unreachable", why);
            }
        }
```

Notes: on net48 `HttpClient.Timeout` is itself implemented as `CancelAfter` on the request's linked token source, and `HttpClientHandler` aborts the web request when that token fires — so a per-call token caps the send and the buffered body read exactly as the old client-wide 4 s did, now per call. `Timeout` is spelled `System.Threading.Timeout` in the initializer because `Timeout` on the left is the `HttpClient` property. Neither `System.Globalization` nor `System.Threading` is among the net48 global usings (`Sentinel.csproj:68-70`). The harness runs on net8; the net48 path (Revit 2024) is exercised live on the B7 drill, where the pilot catalogue is fetched with the 20 s cap.

- [ ] **Step 4: `GhostStandards.cs` — the three kinds, fetched together, each labelled**

Create `SentinelAddin/GhostBuilder/GhostStandards.cs`:

```csharp
using System;
using System.Threading.Tasks;
using Sentinel.Coordination; // ArtefactClient, ResolvedArtefact

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The three office standards a Ghost build works with — layers@n, guideline@n and type_catalog@n — on the
    /// document's web project, else on its office (cohesion phase 4b-2), each with where it came from. Nothing comes
    /// from the machine or from beside the DLL: a kind not installed is none, and <see cref="Header"/> names all three
    /// either way. Pure but for <see cref="Load(string,bool,bool,bool)"/> (the bridge GETs), so
    /// tools/ghost-standards-check compiles it.
    /// </summary>
    public sealed class GhostStandards
    {
        /// <summary>A type catalogue is ~350 KB and its first fetch goes through the service URL (spec decision 5).</summary>
        public static readonly TimeSpan CatalogTimeout = TimeSpan.FromSeconds(20);

        public ResolvedArtefact LayersSource, GuidelineSource, CatalogSource;

        /// <summary>What the review window and every build summary are headed with: the three labels, none included.</summary>
        public string Header => "Layers: " + LayersSource.Label + " · Guideline: " + GuidelineSource.Label + " · Type catalogue: " + CatalogSource.Label;

        private GhostStandards(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog)
        {
            LayersSource = layers;
            GuidelineSource = guideline;
            CatalogSource = catalog;
        }

        /// <summary>The document's standards (<paramref name="key"/> read from ProjectContext on the API thread; "" is
        /// "not bound"). BLOCKING: the kinds asked for are fetched in parallel, ≤ 4 s each and ≤ 20 s for the
        /// catalogue — run it off the Revit UI thread. A kind the command does not ask for is none "not needed by this
        /// command". No Revit API; never throws.</summary>
        public static GhostStandards Load(string key, bool layers = true, bool guideline = true, bool catalog = true) =>
            Load((kind, timeout) => ArtefactClient.Resolve(key, kind, timeout), layers, guideline, catalog);

        /// <summary>As <see cref="Load(string,bool,bool,bool)"/> through <paramref name="resolve"/>(kind, timeout) — the
        /// harness's fake bridge.</summary>
        internal static GhostStandards Load(Func<string, TimeSpan?, ResolvedArtefact> resolve, bool layers, bool guideline, bool catalog)
        {
            Task<ResolvedArtefact> Get(bool wanted, string kind, TimeSpan? timeout) => wanted
                ? Task.Run(() =>
                {
                    try { return resolve(kind, timeout); }
                    catch (Exception ex) { return ArtefactClient.None(kind, $"the {kind} could not be loaded ({ex.Message})"); }
                })
                : Task.FromResult(ArtefactClient.None(kind, "not needed by this command"));
            var l = Get(layers, "layers", null);
            var g = Get(guideline, "guideline", null);
            var c = Get(catalog, "type_catalog", CatalogTimeout);
            Task.WhenAll(l, g, c).GetAwaiter().GetResult();
            return FromResolved(l.Result, g.Result, c.Result);
        }

        /// <summary>The three resolved kinds → what a build works with. The pure half of Load.</summary>
        internal static GhostStandards FromResolved(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog) =>
            new GhostStandards(layers, guideline, catalog);
    }
}
```

- [ ] **Step 5: GREEN — the harness, the two harnesses that compile `ArtefactClient.cs`, both add-in builds**

```bash
dotnet run --project tools/ghost-standards-check
```

Expected (about 10 s — the slow bridge waits 4.5 s on purpose):

```
GhostStandards — layers, guideline and type catalogue from the project, each named, none included

  PASS  4 s by default, 20 s for a type catalogue
  PASS  a 20 s call outlives the old client-wide 4 s (the bridge took 4.5 s)
  PASS  a call with no cap of its own still stops at 4 s, and says so
  PASS  0.5 s asked, under 3 s waited, and the label says 0.5 s
  PASS  one GET per kind the command needs
  PASS  layers@1 from the office, labelled
  PASS  no guideline → none, named
  PASS  type_catalog@1 from the office, labelled
  PASS  the header names all three, none included
  PASS  bridge stopped → the cached copies say cached; the guideline stays none
  PASS  layers and guideline use the 4 s default, the catalogue asks for 20 s
  PASS  the three are fetched in parallel
  PASS  a command that needs the guideline only asks for the guideline only
  PASS  a kind not asked for is none, and says why
  PASS  a resolver that throws is none with the reason, never a crash
  PASS  an unbound document asks nothing and reads not bound, three times

16/16 checks pass
```

```bash
dotnet run --project tools/artefact-cache-check
dotnet run --project tools/gate-check
```

Expected: `53/53 checks pass` and `123/123 checks pass`, both unchanged (they compile `ArtefactClient.cs`; the dead-port checks in `artefact-cache-check` fail on "connection refused", not on the cap).

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: both green — `0 Error(s)`, `6 Warning(s)` on 2024 and `3 Warning(s)` on 2025 (unchanged from master). `GhostStandards` has no caller yet; Task 4 calls it. (Verified on a scratch copy of 274ef6b on 2026-09-25: harness 16/16, artefact-cache-check 53/53, gate-check 123/123, both builds green with those warning counts.)

- [ ] **Step 6: CI runs the new harness**

In `.github/workflows/ci.yml` replace lines 38-45:

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate)
        if: matrix.revit == 2026
        run: |
          dotnet run --project tools/fixplace-check
          dotnet run --project tools/naming-check
          dotnet run --project tools/org-check
          dotnet run --project tools/snapshot-check
          dotnet run --project tools/gate-check
```

with:

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards)
        if: matrix.revit == 2026
        run: |
          dotnet run --project tools/fixplace-check
          dotnet run --project tools/naming-check
          dotnet run --project tools/org-check
          dotnet run --project tools/snapshot-check
          dotnet run --project tools/gate-check
          dotnet run --project tools/ghost-standards-check
```

(The harness talks only to loopback listeners it opens itself, and `GhostStandards.Load("")` answers "not bound" before any request, so it runs on the hosted runner.)

- [ ] **Step 7: Commit**

```bash
git add SentinelAddin/Coordination/ArtefactClient.cs SentinelAddin/GhostBuilder/GhostStandards.cs tools/ghost-standards-check/ghost-standards-check.csproj tools/ghost-standards-check/Check.cs .github/workflows/ci.yml
git commit -m "feat(revit): ArtefactClient.Resolve takes a per-call cap (4 s default; the shared HttpClient no longer caps every call at 4 s) and GhostStandards resolves layers, guideline and type_catalog together for one project — in parallel, the catalogue with 20 s, a kind not asked for named none, the header naming all three

tools/ghost-standards-check 16/16 (a 4.5 s bridge outlived by a 20 s call and cut at 4 s by a default one, the cap in the label, one GET per kind, the cached copies when the bridge stops, not-needed and not-bound nones); artefact-cache-check 53/53 and gate-check 123/123 unchanged; the add-in builds (2024, 2025). CI runs the new harness.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

No code change. Task 1 does not declare `GhostStandards.Guideline`; Task 3 adds it (see Task 3 amendment A). Task 1's `Standards()` checks depend on `CatalogBody` (`{"types":[...],"template":{"title":"Harness template"}}`) parsing under Task 3's loader. It does — verified: 124/124 after Task 3.

---

### Task 2: Revit — layers@n drives Ghost's mapping: `LayerRulesetMatcher.FromBody` by the bridge validator's rules, `HeuristicsOnly()` when none, guesses labelled `heuristic`; `LayerMapper` asks the installed standard before a per-project cache stamped with the layers sha, and a local-model failure keeps every deterministic row; the review pre-ticks standard rows only and is headed by the three labels

**Files:**
- Modify: `SentinelAddin/GhostBuilder/LayerRulesetMatcher.cs` (the whole file, :1-194 — replaced)
- Modify: `SentinelAddin/GhostBuilder/LayerMapper.cs` (the whole file, :1-224 — replaced)
- Modify: `SentinelAddin/GhostBuilder/GhostStandards.cs` (Task 1's file: the sources field line and `FromResolved`)
- Modify: `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs` (:30-31, the `Source` doc comment)
- Modify: `SentinelAddin/UI/GhostReviewWindow.cs` (:32, :42-50, :100-104, :125-130, :152, :163, :222)
- Create: `tools/ghost-standards-check/Layers.cs`
- Modify: `tools/ghost-standards-check/ghost-standards-check.csproj` and `tools/ghost-standards-check/Check.cs` (Task 1's files: one compile block, the `Main` call line)
- Modify: `tools/ghost-p2-check/ghost-p2-check.csproj` (:10-11, :24), `tools/ghost-p2-check/Check.cs` (:104-115, :126, :135, :165, :198-213)
- Modify: `demo/ghost-sample/README.md` (:48)
- Read for reference: spec decisions 2 ("layers none → only the ignore net, labelled heuristics and the local model, nothing pre-ticked"), 3, 4 (`layers` shape), 9 (tier order, per-key cache stamped with the layers sha, heuristics labelled, local-model failure keeps deterministic rows); `WebApp/bridge/artefact-store.mjs:57-62` (`filled`, `bad`; "Optional means absent or null") and `:141-152` (the layers validator this loader repeats: `standard`, `layers[]` of `{layer, category ∈ LAYER_CATEGORIES, family?, aliases?}`, `ignore?`); `WebApp/bridge/artefact-store.test.mjs:295-366` (the bridge's layers cases — the refusal messages below are the same paths without the `layers: ` prefix); `SentinelAddin/Engine/DeliveryContract.cs:120-145` (the 4b-1 C# message style, `Text`'s blank rule with U+FEFF); `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs:19-33` (`LayerMapping`; `Source` defaults to `"llm"`), `:98` (the seven categories); `SentinelAddin/Commands.GhostBuilder.cs:169-173, 239, 297, 303-330` (the only `LayerRulesetMatcher.Load` / `new LayerMapper` / `review.Load` call sites — Task 4 rewrites them); `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs:28, 34-45, 67-72` (takes an `ILayerMapper`; unchanged); `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs:327-351` and `ElementPlacementFactory.cs:98-116` (a row with no category is skipped with a warning at placement — why an unmapped row may be shown); `demo/bds-pilot/bds-layers.json` and `SentinelAddin/Resources/bds-layers.json` (both parse under the validator; Task 4 moves the Resources copy over the demo one); `config/base-standard/layers.json` (the seed — must parse).

**Interfaces:**
- Consumes: Task 1's `GhostStandards` (`FromResolved`, `LayersSource`, `Header`), `ArtefactClient.None/RefLabel`, `ArtefactCache.PathFor(key, kind)` and `ArtefactCache.Root`.
- Produces:
  - `public sealed class LayerRulesetMatcher` (private constructor):
    - `public static LayerRulesetMatcher? FromBody(string? json, out string? error)` — never throws; `null` + `error` on refusal (table below); unknown fields ignored (`enforce`, `extensions`, `params`, `disciplines`, `match`, `format` stay unread).
    - `public static LayerRulesetMatcher HeuristicsOnly()` — no rows, no ignore globs; the built-in ignore net (`0`, `DEFPOINTS`, the annotation tokens) and the AIA major/keyword heuristics stay.
    - `public string? Sha { get; set; }` — the layers@n sha, set by `GhostStandards`; null for `HeuristicsOnly()`.
    - `public bool HasStandard` — false for `HeuristicsOnly()`.
    - `public bool ShouldIgnore(string layer)` (unchanged).
    - `public LayerMapping? Match(string layer)` — exact row: `Source "standard"`, confidence 1, `Rationale "layers standard: <layer>"`; alias: `"standard"`, .95, `"layers standard: alias of <layer>"`; AIA major parse: `"heuristic"`, .7; keyword: `"heuristic"`, .75 (both `Rationale "heuristic: … — not a row of an installed layers standard"`); else null.
    - Deleted: `Load(string explicitPath)`, `CandidatePaths`, `BuiltInDefault()`, `StandardName`, the private `Ruleset` class and its `[JsonPropertyName]` attributes.
  - `LayerMapping.Source` ∈ `"standard" | "heuristic" | "llm" | "cache" | "unmapped"` (doc comment; the `"llm"` initializer stays).
  - `public LayerMapper(ILayerMapper llmFallback, LayerRulesetMatcher matcher, string projectKey)` — `matcher` required (`GhostStandards.Layers`); `projectKey` `""` = unbound, nothing remembered. Replaces `LayerMapper(ILayerMapper, string cachePath = null, LayerRulesetMatcher matcher = null)`; `DefaultCachePath()` deleted.
  - `public static string LayerMapper.CachePathFor(string key)` = `ArtefactCache.PathFor(key, "dwg_mappings")` → `%AppData%\Sentinel\cache\<key>\dwg_mappings.json`, file shape `{"key", "layers_sha" (the matcher's `Sha`, or "none"), "mappings": {LAYER: llm row}}`.
  - `LayerMapper.MapLayersAsync` tiers: ignore → `Match` "standard" → remembered (same key, same `layers_sha`; `Source "cache"`) → `Match` "heuristic" → the local model (`"llm"`, remembered). Any exception from the model except a cancellation of `ct` → the unknown layers come back `{CadLayer, Category null, Confidence 0, Source "unmapped", Rationale "not mapped — local model unreachable (<message>)"}` (`HttpRequestException`) or `"not mapped — local model failed (<message>)"` (anything else), every deterministic row kept, nothing remembered. Only `"llm"` rows are written to or read from the cache.
  - `GhostStandards.Layers` (`public LayerRulesetMatcher`, initialised to `HeuristicsOnly()`); `FromResolved` parses a non-none layers source: success → `Layers` with `Sha = source.Sha256`; refusal → `LayersSource = ArtefactClient.None("layers", "<label> did not parse: <error>")`, `Layers` stays `HeuristicsOnly()`.
  - `public void GhostReviewWindow.Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer, string targetLabel, string standardsHeader, double preTickAbove = 0.5)` — `standardsHeader` is required (Task 4 passes `GhostStandards.Header`) and shown under the window's bold line; `internal static string SourceNote(string? source)` (`""`, `"  · heuristic guess"`, `"  · local model"`, `"  · local model (remembered)"`, `"  · not mapped"`, else `"  · <source>"`/`"  · no source"`) replaces the row's `"  · LLM"`; `internal string StandardsLine` (the harness reads the header back). `PreTick` is unchanged — it already ticks `"standard"` only; heuristic rows stop pre-ticking because they are no longer labelled standard.

`FromBody` refusals (the `error` string, exactly):

| Body | `error` |
|---|---|
| `null`/empty/whitespace string | `the body is empty` |
| JSON `null` | `the body is null` |
| JSON array, string, number, bool | `the body must be a JSON object` |
| not JSON | the System.Text.Json parser's message |
| `standard` absent, not a string, or blank (whitespace or U+FEFF only) | `standard must be a non-empty string` |
| `layers` absent, not an array, or empty | `layers must be a non-empty array` |
| `layers[i]` not an object | `layers[<i>] must be an object` |
| `layers[i].layer` absent or blank | `layers[<i>].layer must be a non-empty string` |
| `layers[i].category` not exactly one of the seven (case-sensitive, as the bridge) | `layers[<i>].category must be ` followed by the seven names (below) |
| `layers[i].family` present, not null, not a string | `layers[<i>].family must be a string` |
| `layers[i].aliases` present, not null, not an array of strings | `layers[<i>].aliases must be an array of strings` |
| `ignore` present, not null, not an array of strings | `ignore must be an array of strings` |

The category refusal reads, in full: `layers[<i>].category must be Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture`.

- [ ] **Step 1: Write the failing checks**

Create `tools/ghost-standards-check/Layers.cs`:

```csharp
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    static string RepoRoot()
    {
        var r = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(r, "SentinelAddin")); i++) r = Path.GetFullPath(Path.Combine(r, ".."));
        return r;
    }

    // A complete layers@n body; each refusal below breaks exactly one thing in it.
    const string Good = "{\"standard\":\"Office layers v1\",\"enforce\":\"warn\",\"ignore\":[\"*-ANNO\",\"0\"]," +
        "\"layers\":[{\"layer\":\"A-WALL-EXT\",\"category\":\"Walls\",\"family\":\"Office_Wall_Ext\",\"aliases\":[\"WALL-EXT\"]}," +
        "{\"layer\":\"A-DOOR\",\"category\":\"Doors\"}]}";
    const string Categories = "Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture";

    // What the bridge hands over for an installed kind@1 (the harness never calls a bridge here).
    static ResolvedArtefact Installed(string kind, string body) => new()
    {
        Kind = kind, Ref = kind + "@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel(kind + "@1", "office", Sha),
    };
    static ResolvedArtefact NotNeeded(string kind) => ArtefactClient.None(kind, "not needed by this command");

    static void Refused(string body, string want, string name)
    {
        var m = LayerRulesetMatcher.FromBody(body, out var error);
        Ok(m is null && error == want, name + " → " + want);
        if (m is not null || error != want) Console.WriteLine("        got: " + (m is null ? error : "a matcher"));
    }

    // ── 3. layers@n: parsed by the bridge validator's rules; a row of it is the standard, a guess is a heuristic ─
    static void Layers()
    {
        Console.WriteLine("\nLayers — layers@n by the bridge validator's rules; only its rows are the standard\n");
        var root = RepoRoot();
        var m = LayerRulesetMatcher.FromBody(Good, out var error);
        Ok(m is { HasStandard: true, Sha: null } && error is null, "a complete body parses (the sha is GhostStandards' to set)");
        foreach (var f in Directory.EnumerateFiles(Path.Combine(root, "demo"), "*layers.json", SearchOption.AllDirectories)
                     .Append(Path.Combine(root, "config", "base-standard", "layers.json")))
            Ok(LayerRulesetMatcher.FromBody(File.ReadAllText(f), out var e) is { HasStandard: true }, $"{Path.GetRelativePath(root, f)} parses: it installs as layers@n{(e is null ? "" : " — " + e)}");
        Ok(LayerRulesetMatcher.FromBody(Good.Replace("\"Office_Wall_Ext\"", "null").Replace("[\"WALL-EXT\"]", "null").Replace("[\"*-ANNO\",\"0\"]", "null"), out _) is not null,
           "family, aliases and ignore may be null (optional = absent or null, as the bridge)");

        Refused("null", "the body is null", "JSON null");
        Refused("[]", "the body must be a JSON object", "an array");
        Refused("  ", "the body is empty", "an empty body");
        Ok(LayerRulesetMatcher.FromBody("{\"standard\":", out var jsonError) is null && jsonError is { Length: > 0 }, "broken JSON → none with the parser's message");
        Refused(Good.Replace("\"standard\":\"Office layers v1\",", ""), "standard must be a non-empty string", "no standard");
        Refused(Good.Replace("\"Office layers v1\"", "\" \""), "standard must be a non-empty string", "a blank standard");
        Refused("{\"standard\":\"S\",\"layers\":[]}", "layers must be a non-empty array", "no layer rows");
        Refused("{\"standard\":\"S\",\"layers\":{}}", "layers must be a non-empty array", "layers not an array");
        Refused(Good.Replace("{\"layer\":\"A-DOOR\",\"category\":\"Doors\"}", "\"A-DOOR\""), "layers[1] must be an object", "a row that is not an object");
        Refused(Good.Replace("\"layer\":\"A-DOOR\"", "\"layer\":\"\""), "layers[1].layer must be a non-empty string", "a blank layer");
        Refused(Good.Replace("\"Doors\"", "\"Stairs\""), "layers[1].category must be " + Categories, "a category Ghost cannot build");
        Refused(Good.Replace("\"Doors\"", "\"doors\""), "layers[1].category must be " + Categories, "a lower-case category (the bridge is case-sensitive)");
        Refused(Good.Replace("\"Office_Wall_Ext\"", "7"), "layers[0].family must be a string", "a family that is not text");
        Refused(Good.Replace("[\"WALL-EXT\"]", "\"WALL-EXT\""), "layers[0].aliases must be an array of strings", "aliases not an array");
        Refused(Good.Replace("[\"*-ANNO\",\"0\"]", "[0]"), "ignore must be an array of strings", "an ignore entry that is not text");

        // what each row says it is
        Ok(m!.Match("a-wall-ext ") is { Source: "standard", Category: "Walls", BdsFamily: "Office_Wall_Ext", Confidence: 1.0, CadLayer: "a-wall-ext " },
           "an exact row is the standard (1.0), case- and space-insensitive, on the DWG's own layer string");
        Ok(m.Match("WALL-EXT") is { Source: "standard", Confidence: 0.95, Rationale: "layers standard: alias of A-WALL-EXT" }, "an alias is the standard (.95) and says whose alias");
        Ok(m.Match("A-DOOR") is { Source: "standard", BdsFamily: "Generic Door" }, "a row without a family builds the generic family, still a row of the standard");
        Ok(m.Match("A-FLOR-PATT") is { Source: "heuristic", Category: "Floors", Confidence: 0.7 }, "an AIA major that is not a row is a heuristic guess (.7), never the standard");
        Ok(m.Match("EXT-PARTITION") is { Source: "heuristic", Category: "Walls" } kw && kw.Rationale.StartsWith("heuristic: "), "a keyword hit is a heuristic guess, and says so");
        Ok(m.Match("EXTERIOR-ENVELOPE") is null, "a layer nothing recognises is left for the local model");
        Ok(m.ShouldIgnore("A-ANNO") && m.ShouldIgnore("0") && m.ShouldIgnore("X-DIMS-1") && !m.ShouldIgnore("A-WALL-EXT"), "the standard's ignore globs and the built-in net both drop annotation");

        var h = LayerRulesetMatcher.HeuristicsOnly();
        Ok(h is { HasStandard: false, Sha: null } && h.Match("A-WALL-EXT") is { Source: "heuristic", Category: "Walls" } && h.ShouldIgnore("DEFPOINTS") && h.ShouldIgnore("A-ANNO-TEXT"),
           "no layers installed: the net and the guesses stay, every guess labelled heuristic");

        // what GhostStandards hands a build: the matcher with its sha, or heuristics and a none naming the field
        var ok = GhostStandards.FromResolved(Installed("layers", Good), NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(ok.Layers is { HasStandard: true, Sha: Sha } && ok.LayersSource.Label == "layers@1 · office · 0123456789ab…", "an installed layers@n maps, stamped with its sha, labelled");
        var bad = GhostStandards.FromResolved(Installed("layers", Good.Replace("\"Doors\"", "\"Stairs\"")), NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(bad.Layers is { HasStandard: false, Sha: null } && bad.LayersSource is { Kind: "layers", Origin: "none", Ref: null }
           && bad.LayersSource.Label == "none — layers@1 · office · 0123456789ab… did not parse: layers[1].category must be " + Categories,
           "a body the matcher cannot use is none naming the artefact and the field; heuristics map");
        var none = ArtefactClient.None("layers", "not installed for aster-tower or its office");
        var absent = GhostStandards.FromResolved(none, NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(!absent.Layers.HasStandard && ReferenceEquals(absent.LayersSource, none) && absent.Header.StartsWith("Layers: none — not installed for aster-tower or its office · "),
           "none stays none: heuristics only, and the header says so");
    }

    // The local model, faked: records what it was asked, answers "Walls" for each, or fails.
    sealed class FakeModel : ILayerMapper
    {
        public readonly List<string> Asked = new();
        public Exception? Fail;
        public Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            var layers = cadLayers.ToList();
            Asked.AddRange(layers);
            return Fail != null
                ? Task.FromException<MappingResult>(Fail)
                : Task.FromResult(new MappingResult { Mappings = layers.Select(l => new LayerMapping { CadLayer = l, Category = "Walls", BdsFamily = "Generic Wall", Confidence = 0.8 }).ToList() });
        }
    }

    // A remembered answer file as LayerMapper writes it, under `fileKey` and `sha`, at `key`'s path.
    static void WriteCache(string key, string fileKey, string sha, params (string Layer, string Category)[] rows)
    {
        var path = LayerMapper.CachePathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var mappings = string.Join(",", rows.Select(r => $"\"{r.Layer}\":{{\"cadLayer\":\"{r.Layer}\",\"category\":\"{r.Category}\",\"bdsFamily\":\"Generic\",\"confidence\":0.9,\"source\":\"llm\"}}"));
        File.WriteAllText(path, $"{{\"key\":\"{fileKey}\",\"layers_sha\":\"{sha}\",\"mappings\":{{{mappings}}}}}");
    }

    static Dictionary<string, LayerMapping> Run(LayerMapper mapper, params string[] layers) =>
        mapper.MapLayersAsync(layers).GetAwaiter().GetResult().Mappings.ToDictionary(r => r.CadLayer, StringComparer.Ordinal);

    // ── 4. LayerMapper: standard → remembered (this project, same sha) → heuristic → local model ───────────
    static void Mapper()
    {
        Console.WriteLine("\nLayerMapper — the installed standard first; a remembered guess never outranks it\n");
        var layers = LayerRulesetMatcher.FromBody(Good, out _)!;
        layers.Sha = Sha;
        Ok(LayerMapper.CachePathFor("demo") == Path.Combine(ArtefactCache.Root, "demo", "dwg_mappings.json"), "the cache is per project: <cache root>/<key>/dwg_mappings.json");

        // demo remembers, under this layers sha, a wrong guess for A-WALL-EXT and an answer for EXT-PARTITION.
        WriteCache("demo", "demo", Sha, ("A-WALL-EXT", "Floors"), ("EXT-PARTITION", "Furniture"));
        var model = new FakeModel();
        using (var mapper = new LayerMapper(model, layers, "demo"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "EXT-PARTITION", "A-FLOR-PATT", "A-ANNO", "S-FNDN", "EXTERIOR-ENVELOPE", "a-wall-ext");
            Ok(rows["A-WALL-EXT"] is { Source: "standard", Category: "Walls" }, "the installed standard answers before the cache (the remembered 'Floors' guess is not used)");
            Ok(rows["EXT-PARTITION"] is { Source: "cache", Category: "Furniture" }, "a remembered answer under the same layers sha comes before a heuristic guess, labelled cache");
            Ok(rows["A-FLOR-PATT"] is { Source: "heuristic", Category: "Floors" }, "a layer only a heuristic recognises is a heuristic row");
            Ok(!rows.ContainsKey("A-ANNO") && !rows.ContainsKey("a-wall-ext"), "an ignored layer is no row; a layer is mapped once, whatever its case");
            Ok(model.Asked.SequenceEqual(new[] { "S-FNDN", "EXTERIOR-ENVELOPE" }) && rows["S-FNDN"].Source == "llm" && rows["EXTERIOR-ENVELOPE"].Source == "llm",
               "only what no tier above recognised goes to the local model, labelled llm");
        }
        var saved = JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("demo"))).RootElement;
        var kept = saved.GetProperty("mappings").EnumerateObject().ToList();
        Ok(saved.GetProperty("key").GetString() == "demo" && saved.GetProperty("layers_sha").GetString() == Sha
           && kept.Any(p => p.Name == "S-FNDN") && kept.Any(p => p.Name == "EXTERIOR-ENVELOPE") && kept.All(p => p.Value.GetProperty("source").GetString() == "llm"),
           "the model's answers are remembered for demo, stamped with the layers sha; standard and heuristic rows are not cached");

        var other = LayerRulesetMatcher.FromBody(Good, out _)!;
        other.Sha = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
        var model2 = new FakeModel();
        using (var mapper = new LayerMapper(model2, other, "demo"))
        {
            var rows = Run(mapper, "EXT-PARTITION", "S-FNDN");
            Ok(rows["EXT-PARTITION"].Source == "heuristic" && model2.Asked.SequenceEqual(new[] { "S-FNDN" }), "answers remembered under another layers sha are not used");
        }

        WriteCache("demo2", "someone-else", Sha, ("S-FNDN", "Floors"));
        var model3 = new FakeModel();
        using (var mapper = new LayerMapper(model3, layers, "demo2"))
            Ok(Run(mapper, "S-FNDN")["S-FNDN"].Source == "llm" && model3.Asked.Count == 1, "a file that belongs to another key is not this project's memory");

        using (var mapper = new LayerMapper(new FakeModel(), layers, ""))
            Ok(Run(mapper, "S-FNDN")["S-FNDN"].Source == "llm" && !File.Exists(LayerMapper.CachePathFor("")), "an unbound document remembers nothing");

        using (var mapper = new LayerMapper(new FakeModel(), LayerRulesetMatcher.HeuristicsOnly(), "aster-tower"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "S-FNDN");
            Ok(rows.Values.All(r => r.Source != "standard") && rows["A-WALL-EXT"].Source == "heuristic", "no layers installed: no row is a standard row");
        }
        Ok(JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("aster-tower"))).RootElement.GetProperty("layers_sha").GetString() == "none",
           "…and the cache is stamped none, so an install later starts it afresh");

        var down = new FakeModel { Fail = new HttpRequestException("No connection could be made (localhost:11434)") };
        using (var mapper = new LayerMapper(down, layers, "down"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "A-FLOR-PATT", "EXTERIOR-ENVELOPE");
            Ok(rows["A-WALL-EXT"].Source == "standard" && rows["A-FLOR-PATT"].Source == "heuristic", "local model down: every deterministic row is kept");
            Ok(rows["EXTERIOR-ENVELOPE"] is { Source: "unmapped", Category: null, Confidence: 0, Rationale: "not mapped — local model unreachable (No connection could be made (localhost:11434))" },
               "…and the rest read 'not mapped — local model unreachable' instead of failing the run");
        }
        Ok(!File.Exists(LayerMapper.CachePathFor("down")), "an unmapped layer is never remembered: the model is asked again next run");

        using var esc = new CancellationTokenSource();
        esc.Cancel();
        using (var mapper = new LayerMapper(new FakeModel { Fail = new OperationCanceledException(esc.Token) }, layers, "esc"))
        {
            bool cancelled = false;
            try { mapper.MapLayersAsync(new[] { "EXTERIOR-ENVELOPE" }, esc.Token).GetAwaiter().GetResult(); }
            catch (OperationCanceledException) { cancelled = true; }
            Ok(cancelled, "ESC still cancels the run: a cancelled call is not 'unreachable'");
        }
    }
}
```

In `tools/ghost-standards-check/ghost-standards-check.csproj` (Task 1's file) replace:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostStandards.cs" />
```

with:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostStandards.cs" />
    <!-- the layers@n loader, the mapping tiers and the per-project cache -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GhostBuilder_Architecture.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LayerRulesetMatcher.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LayerMapper.cs" />
```

In `tools/ghost-standards-check/Check.cs` (Task 1's file) replace:

```csharp
        try { Client(); Standards(); }
```

with:

```csharp
        try { Client(); Standards(); Layers(); Mapper(); }
```

In `tools/ghost-p2-check/ghost-p2-check.csproj` replace lines 10-11:

```xml
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
```

with:

```xml
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <!-- ArtefactCache.cs (LayerMapper's per-project cache path) leans on the add-in's global usings. -->
    <ImplicitUsings>enable</ImplicitUsings>
```

and line 24:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LayerMapper.cs" />
```

with:

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\LayerMapper.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ArtefactCache.cs" />
```

(Without `ImplicitUsings` the harness fails on `ArtefactCache.cs(16,12): error CS0246: The type or namespace name 'DateTime' could not be found` — checked; with it, no new warning.)

In `tools/ghost-p2-check/Check.cs` replace lines 104-115:

```csharp
                new LayerMapping { CadLayer = "A-LLM-GUESS", Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.90, Source = "llm" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["A-WALL-EXT"] = 120, ["A-GUESS"] = 7, ["A-LLM-GUESS"] = 50, // A-EMPTY absent => zero geometry
        };

        MappingResult emitted = null;
        var w = new GhostReviewWindow();          // constructed, never shown
        w.BuildRequested += (m, _) => emitted = m;
        w.Load(proposal, counts, "Project.rvt");
```

with:

```csharp
                new LayerMapping { CadLayer = "A-LLM-GUESS", Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.90, Source = "llm" },
                // Cohesion 4b-2: a keyword guess is not a standard, however confident, and neither is a remembered answer.
                new LayerMapping { CadLayer = "EXT-PARTITION", Category = "Walls", BdsFamily = "Generic Wall", Confidence = 1.00, Source = "heuristic" },
                new LayerMapping { CadLayer = "S-FNDN", Category = "Floors", BdsFamily = "Generic Floor", Confidence = 0.95, Source = "cache" },
                new LayerMapping { CadLayer = "EXTERIOR-ENVELOPE", Confidence = 0, Source = "unmapped", Rationale = "not mapped — local model unreachable (x)" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["A-WALL-EXT"] = 120, ["A-GUESS"] = 7, ["A-LLM-GUESS"] = 50, // A-EMPTY absent => zero geometry
            ["EXT-PARTITION"] = 40, ["S-FNDN"] = 12, ["EXTERIOR-ENVELOPE"] = 14,
        };
        const string header = "Layers: layers@1 · office · 0123456789ab… · Guideline: none — not installed for demo or its office · Type catalogue: none — not installed for demo or its office";

        MappingResult emitted = null;
        var w = new GhostReviewWindow();          // constructed, never shown
        w.BuildRequested += (m, _) => emitted = m;
        w.Load(proposal, counts, "Project.rvt", header);
        Ok(w.StandardsLine == header, "the review is headed with the three standards it was made with, none included");
```

line 126:

```csharp
        Ok(!layers.Contains("A-LLM-GUESS"), "LLM-sourced row is never pre-ticked, even high-confidence with geometry");
```

with:

```csharp
        Ok(!layers.Contains("A-LLM-GUESS"), "LLM-sourced row is never pre-ticked, even high-confidence with geometry");
        Ok(!layers.Contains("EXT-PARTITION") && !layers.Contains("S-FNDN") && !layers.Contains("EXTERIOR-ENVELOPE"),
           "heuristic, remembered and unmapped rows are never pre-ticked, even at 1.0 with geometry");
```

line 135:

```csharp
        Ok(!GhostReviewWindow.PreTick(10, 1.0, null, 0.5), "null source does not pre-tick");
```

with:

```csharp
        Ok(!GhostReviewWindow.PreTick(10, 1.0, null, 0.5), "null source does not pre-tick");
        Ok(new[] { "heuristic", "cache", "unmapped" }.All(s => !GhostReviewWindow.PreTick(10, 1.0, s, 0.5)), "heuristic/cache/unmapped at 1.0 do not pre-tick");
        Ok(GhostReviewWindow.SourceNote("standard") == "" && GhostReviewWindow.SourceNote("heuristic") == "  · heuristic guess"
           && GhostReviewWindow.SourceNote("llm") == "  · local model" && GhostReviewWindow.SourceNote("cache") == "  · local model (remembered)"
           && GhostReviewWindow.SourceNote("unmapped") == "  · not mapped", "every row that is not the standard says what it is");
```

line 165:

```csharp
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>() }, counts, "Project.rvt");
```

with:

```csharp
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>() }, counts, "Project.rvt", header);
```

and lines 198-213 (the `--live` dry run's ruleset and mapper):

```csharp
        string cache = Path.Combine(Path.GetTempPath(), "ghost-live-check-cache.json");
        try { File.Delete(cache); } catch { }

        // Load the SHIPPED BDS ruleset explicitly. Without this the matcher finds no bds-layers.json next
        // to THIS tool's DLL and silently falls back to its built-in keyword heuristics — which resolve
        // "Generic Wall" at 0.70 instead of the standard's BDS_Wall_Ext at 1.00, making the dry run
        // unrepresentative of the add-in (whose deploy folder does carry Resources\bds-layers.json).
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "SentinelAddin", "Resources", "bds-layers.json"));
        Ok(File.Exists(ruleset), "the shipped BDS layer ruleset is on disk");

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, cachePath: cache,
                                           matcher: LayerRulesetMatcher.Load(ruleset));
```

with:

```csharp
        // The pilot's layers standard as bds-office installs it (layers@1). No project key: nothing is read from
        // or written to a layer cache, so every layer the standard does not know really reaches the model.
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "demo", "bds-pilot", "bds-layers.json"));
        var standard = LayerRulesetMatcher.FromBody(File.ReadAllText(ruleset), out string rulesetError);
        Ok(standard != null, $"the pilot's layers standard parses ({rulesetError ?? "demo/bds-pilot/bds-layers.json"})");
        if (standard == null) return;

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, standard, projectKey: "");
```

(That is the only place any harness read `SentinelAddin/Resources/bds-layers.json`; it now reads the demo copy, which Task 4 overwrites with the Resources copy — the one that ran — so Task 4 has nothing left to repoint in `ghost-p2-check`.)

- [ ] **Step 2: Run them — RED**

```bash
dotnet run --project tools/ghost-standards-check
dotnet run --project tools/ghost-p2-check
```

Expected: both builds fail; the errors are only in the harness files and only of these kinds (match the codes, not the line numbers): in `tools\ghost-standards-check\Layers.cs` — `CS0117: 'LayerRulesetMatcher' does not contain a definition for 'FromBody'` / `'HeuristicsOnly'`, `CS0117: 'LayerMapper' does not contain a definition for 'CachePathFor'`, `CS1061: 'GhostStandards' does not contain a definition for 'Layers'`, `CS1503: Argument 3: cannot convert from 'string' to 'Sentinel.GhostBuilder.LayerRulesetMatcher'`; in `tools\ghost-p2-check\Check.cs` — `CS1503: Argument 4: cannot convert from 'string' to 'double'` (the two `Load(..., header)` calls), `CS1061` (`StandardsLine`), `CS0117` (`SourceNote`, `LayerRulesetMatcher.FromBody`), `CS1739: The best overload for 'LayerMapper' does not have a parameter named 'projectKey'`.

- [ ] **Step 3: `LayerRulesetMatcher.cs` — `FromBody`, `HeuristicsOnly`, labelled guesses; no file chain, no built-in default**

Replace the whole of `SentinelAddin/GhostBuilder/LayerRulesetMatcher.cs` (:1-194), which today reads:

```csharp
#nullable disable
// P1 (GhostBuilder v2): deterministic-first layer mapping driven by the BDS DWG Layer Standard
// (bds-layers.json) instead of hardcoded heuristics. Mirrors WebApp/src/sentinel-core/layers.ts —
// whose test suite (layers.test.ts) is the CONFORMANCE REFERENCE for this port. Compliant layers map
// here with NO model call (confidence 1); only genuine gaps fall through to the local LLM. Pure C#,
// no Revit API, so it stays safe to run off the API thread like the LayerMapper that uses it.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class LayerRulesetMatcher
    {
        // ---- ruleset model (the subset of bds-layers.json this pass needs) ----
        private sealed class Ruleset
        {
            [JsonPropertyName("standard")] public string Standard { get; set; }
            [JsonPropertyName("enforce")]  public string Enforce  { get; set; } = "warn";
            [JsonPropertyName("ignore")]   public List<string> Ignore { get; set; } = new();
            [JsonPropertyName("layers")]   public List<LayerDef> Layers { get; set; } = new();
        }
        private sealed class LayerDef
        {
            [JsonPropertyName("layer")]    public string Layer { get; set; }
            [JsonPropertyName("category")] public string Category { get; set; }
            [JsonPropertyName("family")]   public string Family { get; set; }
            [JsonPropertyName("aliases")]  public List<string> Aliases { get; set; } = new();
        }

        private readonly Ruleset _rs;
        private readonly List<Regex> _ignoreGlobs;
        private readonly Dictionary<string, LayerDef> _byExact;
        private readonly Dictionary<string, LayerDef> _byAlias;

        public string StandardName => string.IsNullOrWhiteSpace(_rs?.Standard) ? "(built-in fallback)" : _rs.Standard;

        private LayerRulesetMatcher(Ruleset rs)
        {
            _rs = rs ?? new Ruleset();
            _ignoreGlobs = (_rs.Ignore ?? new List<string>()).Select(GlobToRegex).Where(r => r != null).ToList();
            _byExact = new Dictionary<string, LayerDef>(StringComparer.OrdinalIgnoreCase);
            _byAlias = new Dictionary<string, LayerDef>(StringComparer.OrdinalIgnoreCase);
            foreach (var l in _rs.Layers ?? new List<LayerDef>())
            {
                if (string.IsNullOrWhiteSpace(l?.Layer)) continue;
                _byExact[Norm(l.Layer)] = l;
                foreach (var a in l.Aliases ?? new List<string>())
                    if (!string.IsNullOrWhiteSpace(a)) _byAlias[Norm(a)] = l;
            }
        }

        /// <summary>Load from an explicit path, else %AppData%\Sentinel\bds-layers.json, else the
        /// Resources copy shipped beside the DLL, else a built-in default. Never throws.</summary>
        public static LayerRulesetMatcher Load(string explicitPath = null)
        {
            foreach (var path in CandidatePaths(explicitPath))
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                    {
                        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(path));
                        if (rs != null) return new LayerRulesetMatcher(rs);
                    }
                }
                catch { /* corrupt/unreadable -> try the next candidate */ }
            }
            return new LayerRulesetMatcher(BuiltInDefault());
        }

        private static IEnumerable<string> CandidatePaths(string explicitPath)
        {
            if (!string.IsNullOrWhiteSpace(explicitPath)) yield return explicitPath;
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                      "Sentinel", "bds-layers.json");
            var dll = Path.GetDirectoryName(typeof(LayerRulesetMatcher).Assembly.Location);
            if (!string.IsNullOrEmpty(dll)) yield return Path.Combine(dll, "Resources", "bds-layers.json");
        }

        // ---- public API (mirrors layers.ts, minus what placement doesn't consume) ----

        /// <summary>A non-model layer (annotation/system) that must never become geometry. The ruleset's
        /// ignore globs are UNIONed with a built-in token safety net, so this is never less aggressive
        /// than the pre-P1 hardcoded filter.</summary>
        public bool ShouldIgnore(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return true;
            string n = Norm(layer);
            foreach (var rx in _ignoreGlobs) if (rx.IsMatch(n)) return true;
            if (n == "0" || n == "DEFPOINTS") return true;
            foreach (var t in BuiltInIgnoreTokens) if (n.Contains(t)) return true;
            return false;
        }

        /// <summary>Deterministically map a layer to a LayerMapping, or null if it needs the model.
        /// Confidence: 1 exact · .95 alias · .7 standard-format parse · .75 keyword fallback.</summary>
        public LayerMapping Match(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return null;
            string n = Norm(layer);

            if (_byExact.TryGetValue(n, out var ex)) return Map(layer, ex.Category, ex.Family, 1.0);
            if (_byAlias.TryGetValue(n, out var al)) return Map(layer, al.Category, al.Family, 0.95);

            // standard-format parse: D-MAJR-MINR -> category
            var parts = n.Split('-');
            if (parts.Length >= 2 && parts[0].Length == 1 &&
                MajorCategory.TryGetValue(parts[1], out var cat) && cat != null && cat != "(extension)")
                return Map(layer, cat, GenericFamily(cat), 0.7);

            // keyword fallback (preserves the pre-P1 heuristics as a safety net)
            foreach (var rule in KeywordRules)
                if (n.Contains(rule.Token)) return Map(layer, rule.Category, rule.Family, 0.75);

            return null; // unknown -> hand to the LLM tier
        }

        // ---- internals ----
        private static LayerMapping Map(string layer, string category, string family, double conf) =>
            string.IsNullOrEmpty(category) || category == "(extension)"
                ? null
                : new LayerMapping
                {
                    CadLayer = layer,
                    Category = category,
                    BdsFamily = string.IsNullOrWhiteSpace(family) ? GenericFamily(category) : family,
                    Confidence = conf,
                };

        private static string Norm(string s) => (s ?? "").Trim().ToUpperInvariant();

        private static Regex GlobToRegex(string glob)
        {
            try
            {
                var rx = string.Join(".*", glob.ToUpperInvariant().Split('*').Select(Regex.Escape));
                return new Regex("^" + rx + "$", RegexOptions.CultureInvariant);
            }
            catch { return null; }
        }

        private static readonly Dictionary<string, string> MajorCategory = new(StringComparer.OrdinalIgnoreCase)
        {
            ["WALL"] = "Walls", ["DOOR"] = "Doors", ["WIND"] = "Windows", ["GLAZ"] = "Windows",
            ["FLOR"] = "Floors", ["SLAB"] = "Floors", ["CLNG"] = "Ceilings", ["COLS"] = "Columns",
            ["FURN"] = "Furniture", ["EQPM"] = "Furniture",
            ["BEAM"] = "(extension)", ["STRS"] = "(extension)", ["ROOF"] = "(extension)",
            ["DUCT"] = "(extension)", ["PIPE"] = "(extension)",
        };

        // Kept from the pre-P1 LayerMapper so a missing/partial ruleset is never worse than before.
        private static readonly (string Token, string Category, string Family)[] KeywordRules =
        {
            ("PARTITION", "Walls", "Generic Wall"), ("WALL", "Walls", "Generic Wall"),
            ("DOOR", "Doors", "Generic Door"),
            ("WINDOW", "Windows", "Generic Window"), ("GLAZ", "Windows", "Generic Window"), ("GLASS", "Windows", "Generic Window"),
            ("SLAB", "Floors", "Generic Floor"), ("FLOOR", "Floors", "Generic Floor"), ("FLOR", "Floors", "Generic Floor"),
            ("CEILING", "Ceilings", "Generic Ceiling"), ("CEIL", "Ceilings", "Generic Ceiling"), ("CLNG", "Ceilings", "Generic Ceiling"), ("RCP", "Ceilings", "Generic Ceiling"),
            ("COLUMN", "Columns", "Generic Column"), ("COL", "Columns", "Generic Column"),
            ("FURN", "Furniture", "Generic Furniture"), ("CASEWORK", "Furniture", "Generic Furniture"), ("EQUIP", "Furniture", "Generic Furniture"),
        };

        private static readonly string[] BuiltInIgnoreTokens =
        {
            "ANNO", "TEXT", "DIM", "NOTE", "TAG", "LEADER", "SYMBOL", "LEGEND",
            "TITLE", "REVCLOUD", "MATCHLINE", "GRID", "VIEWPORT", "VPORT", "WIPEOUT", "NPLT",
            "HATCH", "AREA",
        };

        private static string GenericFamily(string category) => category switch
        {
            "Walls" => "Generic Wall",
            "Doors" => "Generic Door",
            "Windows" => "Generic Window",
            "Floors" => "Generic Floor",
            "Ceilings" => "Generic Ceiling",
            "Columns" => "Generic Column",
            "Furniture" => "Generic Furniture",
            _ => "Generic Model",
        };

        private static Ruleset BuiltInDefault() => new Ruleset
        {
            Standard = "built-in fallback",
            Ignore = new List<string>(), // BuiltInIgnoreTokens covers the ignore net; KeywordRules cover mapping
            Layers = new List<LayerDef>(),
        };
    }
}
```

with:

```csharp
// Ghost Builder's deterministic layer mapping (P1), driven by the project's layers@n (cohesion phase 4b-2). Exact and
// alias rows mirror WebApp/src/sentinel-core/layers.ts, whose suite (layers.test.ts) is the conformance reference;
// extensions, params, requires, disciplines and enforce stay in the body unread (spec 4b "Out of scope"). The AIA
// discipline-major parse and the keyword list are generic heuristics kept as a safety net and labelled
// "heuristic" — never "standard", never pre-ticked. No file on the machine, beside the DLL or in code stands in
// for a standard: with none installed, HeuristicsOnly() maps. Pure C#, no Revit API, safe off the API thread like
// the LayerMapper that uses it.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class LayerRulesetMatcher
    {
        private sealed class LayerDef
        {
            public string Layer = "", Category = "";
            public string? Family;
        }

        private readonly List<Regex> _ignoreGlobs = new();
        private readonly Dictionary<string, LayerDef> _byExact = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, LayerDef> _byAlias = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>The sha256 of the layers@n body this matcher reads — GhostStandards sets it; null for
        /// <see cref="HeuristicsOnly"/>. LayerMapper stamps its per-project cache with it.</summary>
        public string? Sha { get; set; }

        /// <summary>False for <see cref="HeuristicsOnly"/>: nothing installed, so no row maps as "standard".</summary>
        public bool HasStandard => _byExact.Count > 0;

        private LayerRulesetMatcher() { }

        /// <summary>No layers@n for the project (or one that did not parse): the built-in ignore net and the labelled
        /// AIA heuristics only. Nothing it maps is a standard.</summary>
        public static LayerRulesetMatcher HeuristicsOnly() => new LayerRulesetMatcher();

        private static readonly string[] Categories = { "Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture" };

        /// <summary>A layers@n body (the raw artefact JSON) → the matcher, or null with <paramref name="error"/> naming the
        /// field ("layers[3].category must be Walls | …"), by the bridge validator's rules (spec 2026-09-25-standards-4b
        /// decision 4): standard non-empty; layers a non-empty array of {layer non-empty, category one of the seven,
        /// family? string, aliases? string[]}; ignore? string[]. Optional means absent or null. Unknown fields are
        /// ignored. Never throws.</summary>
        public static LayerRulesetMatcher? FromBody(string? json, out string? error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(json)) { error = "the body is empty"; return null; }
            try
            {
                using var doc = JsonDocument.Parse(json!);
                var b = doc.RootElement;
                if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
                if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                if (!b.TryGetProperty("standard", out var standard) || !Filled(standard)) throw Bad("standard", "must be a non-empty string");
                if (!b.TryGetProperty("layers", out var rows) || rows.ValueKind != JsonValueKind.Array || rows.GetArrayLength() == 0)
                    throw Bad("layers", "must be a non-empty array");

                var m = new LayerRulesetMatcher();
                int i = 0;
                foreach (var r in rows.EnumerateArray())
                {
                    var at = $"layers[{i++}]";
                    if (r.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                    if (!r.TryGetProperty("layer", out var layer) || !Filled(layer)) throw Bad(at + ".layer", "must be a non-empty string");
                    if (!r.TryGetProperty("category", out var category) || category.ValueKind != JsonValueKind.String || Array.IndexOf(Categories, category.GetString()) < 0)
                        throw Bad(at + ".category", "must be " + string.Join(" | ", Categories));
                    var family = Optional(r, "family");
                    if (family is { } f && f.ValueKind != JsonValueKind.String) throw Bad(at + ".family", "must be a string");
                    var aliases = Optional(r, "aliases");
                    if (aliases is { } a && !Strings(a)) throw Bad(at + ".aliases", "must be an array of strings");

                    var def = new LayerDef { Layer = layer.GetString()!, Category = category.GetString()!, Family = family?.GetString() };
                    m._byExact[Norm(def.Layer)] = def;
                    if (aliases is { } list)
                        foreach (var alias in list.EnumerateArray())
                            if (!string.IsNullOrWhiteSpace(alias.GetString())) m._byAlias[Norm(alias.GetString()!)] = def;
                }
                if (Optional(b, "ignore") is { } ignore)
                {
                    if (!Strings(ignore)) throw Bad("ignore", "must be an array of strings");
                    foreach (var glob in ignore.EnumerateArray())
                        if (GlobToRegex(glob.GetString()!) is { } rx) m._ignoreGlobs.Add(rx);
                }
                return m;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return null;
            }
        }

        // ---- public API (mirrors layers.ts, minus what placement doesn't consume) ----

        /// <summary>A non-model layer (annotation/system) that must never become geometry. The standard's ignore
        /// globs are UNIONed with a built-in token safety net, so this is never less aggressive than the pre-P1
        /// hardcoded filter — with or without a standard.</summary>
        public bool ShouldIgnore(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return true;
            string n = Norm(layer);
            foreach (var rx in _ignoreGlobs) if (rx.IsMatch(n)) return true;
            if (n == "0" || n == "DEFPOINTS") return true;
            foreach (var t in BuiltInIgnoreTokens) if (n.Contains(t)) return true;
            return false;
        }

        /// <summary>A layer → its mapping, or null when only the local model can say. Source "standard": the installed
        /// layers@n's exact row (confidence 1) or alias (.95). Source "heuristic": the AIA discipline-major parse (.7)
        /// or a keyword (.75) — a guess, labelled as one, never pre-ticked.</summary>
        public LayerMapping? Match(string layer)
        {
            if (string.IsNullOrWhiteSpace(layer)) return null;
            string n = Norm(layer);

            if (_byExact.TryGetValue(n, out var ex)) return Map(layer, ex.Category, ex.Family, 1.0, "standard", "layers standard: " + ex.Layer);
            if (_byAlias.TryGetValue(n, out var al)) return Map(layer, al.Category, al.Family, 0.95, "standard", "layers standard: alias of " + al.Layer);

            // D-MAJR-MINR parse -> category (generic AIA, not an office standard)
            var parts = n.Split('-');
            if (parts.Length >= 2 && parts[0].Length == 1 &&
                MajorCategory.TryGetValue(parts[1], out var cat) && cat != "(extension)")
                return Map(layer, cat, null, 0.7, "heuristic", $"heuristic: the AIA major '{parts[1]}' reads as {cat} — not a row of an installed layers standard");

            // keyword fallback (the pre-P1 heuristics, kept as a safety net)
            foreach (var rule in KeywordRules)
                if (n.Contains(rule.Token))
                    return Map(layer, rule.Category, rule.Family, 0.75, "heuristic", $"heuristic: the name contains '{rule.Token}' — not a row of an installed layers standard");

            return null; // unknown -> the local model
        }

        // ---- internals ----
        private static LayerMapping Map(string layer, string category, string? family, double conf, string source, string why) => new LayerMapping
        {
            CadLayer = layer,
            Category = category,
            BdsFamily = string.IsNullOrWhiteSpace(family) ? GenericFamily(category) : family,
            Confidence = conf,
            Source = source,
            Rationale = why,
        };

        private static string Norm(string s) => (s ?? "").Trim().ToUpperInvariant();

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException($"{path} {want}");

        // "Optional" means absent or null, as the bridge validator reads it.
        private static JsonElement? Optional(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v : (JsonElement?)null;

        private static bool Strings(JsonElement v) =>
            v.ValueKind == JsonValueKind.Array && v.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String);

        // Blank as the bridge's filled() reads it: char.IsWhiteSpace plus U+FEFF (DeliveryContract.Text's rule).
        private static bool Filled(JsonElement v) =>
            v.ValueKind == JsonValueKind.String && v.GetString()!.Any(ch => !char.IsWhiteSpace(ch) && ch != '﻿');

        private static Regex? GlobToRegex(string glob)
        {
            try
            {
                var rx = string.Join(".*", glob.ToUpperInvariant().Split('*').Select(Regex.Escape));
                return new Regex("^" + rx + "$", RegexOptions.CultureInvariant);
            }
            catch { return null; }
        }

        private static readonly Dictionary<string, string> MajorCategory = new(StringComparer.OrdinalIgnoreCase)
        {
            ["WALL"] = "Walls", ["DOOR"] = "Doors", ["WIND"] = "Windows", ["GLAZ"] = "Windows",
            ["FLOR"] = "Floors", ["SLAB"] = "Floors", ["CLNG"] = "Ceilings", ["COLS"] = "Columns",
            ["FURN"] = "Furniture", ["EQPM"] = "Furniture",
            ["BEAM"] = "(extension)", ["STRS"] = "(extension)", ["ROOF"] = "(extension)",
            ["DUCT"] = "(extension)", ["PIPE"] = "(extension)",
        };

        // Kept from the pre-P1 LayerMapper as a safety net; every hit is labelled heuristic.
        private static readonly (string Token, string Category, string Family)[] KeywordRules =
        {
            ("PARTITION", "Walls", "Generic Wall"), ("WALL", "Walls", "Generic Wall"),
            ("DOOR", "Doors", "Generic Door"),
            ("WINDOW", "Windows", "Generic Window"), ("GLAZ", "Windows", "Generic Window"), ("GLASS", "Windows", "Generic Window"),
            ("SLAB", "Floors", "Generic Floor"), ("FLOOR", "Floors", "Generic Floor"), ("FLOR", "Floors", "Generic Floor"),
            ("CEILING", "Ceilings", "Generic Ceiling"), ("CEIL", "Ceilings", "Generic Ceiling"), ("CLNG", "Ceilings", "Generic Ceiling"), ("RCP", "Ceilings", "Generic Ceiling"),
            ("COLUMN", "Columns", "Generic Column"), ("COL", "Columns", "Generic Column"),
            ("FURN", "Furniture", "Generic Furniture"), ("CASEWORK", "Furniture", "Generic Furniture"), ("EQUIP", "Furniture", "Generic Furniture"),
        };

        private static readonly string[] BuiltInIgnoreTokens =
        {
            "ANNO", "TEXT", "DIM", "NOTE", "TAG", "LEADER", "SYMBOL", "LEGEND",
            "TITLE", "REVCLOUD", "MATCHLINE", "GRID", "VIEWPORT", "VPORT", "WIPEOUT", "NPLT",
            "HATCH", "AREA",
        };

        private static string GenericFamily(string category) => category switch
        {
            "Walls" => "Generic Wall",
            "Doors" => "Generic Door",
            "Windows" => "Generic Window",
            "Floors" => "Generic Floor",
            "Ceilings" => "Generic Ceiling",
            "Columns" => "Generic Column",
            "Furniture" => "Generic Furniture",
            _ => "Generic Model",
        };
    }
}
```

Notes: the file drops `#nullable disable` (the new members are annotated; `LayerMapping` stays oblivious in its own file). `Map` no longer returns null — `FromBody` admits only the seven categories and the heuristics skip `(extension)` majors. The heuristic tables (`MajorCategory`, `KeywordRules`, `BuiltInIgnoreTokens`, `GenericFamily`) are generic AIA vocabulary, not office data, and stay byte-for-byte.

- [ ] **Step 4: `LayerMapping.Source` says what the five values are**

In `SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs` replace lines 30-31:

```csharp
        /// <summary>Which tier produced this mapping: "standard" (deterministic ruleset) or "llm".
        /// Cached rows from before this field exist deserialize as null - treat null as "llm".</summary>
```

with:

```csharp
        /// <summary>Which tier produced this mapping (LayerMapper): "standard" (a row or alias of the project's
        /// installed layers@n — the only source the review pre-ticks), "heuristic" (an AIA major or keyword guess),
        /// "llm" (the local model), "cache" (the local model's answer remembered for this project under the same
        /// layers sha) or "unmapped" (the local model could not be reached; Rationale says so).</summary>
```

- [ ] **Step 5: `LayerMapper.cs` — standard before the cache, the cache per project and per layers sha, a model failure kept honest**

Replace the whole of `SentinelAddin/GhostBuilder/LayerMapper.cs` (:1-224), which today reads:

```csharp
#nullable disable
// ponytail: nullable off to match the ported GhostBuilder module; annotate when hardening.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The seam every layer-name-to-family mapper implements. LocalGhostBuilder is the LLM-backed
    /// implementation; LayerMapper is a caching decorator over it. The orchestrator depends on this
    /// interface so the two compose without either knowing about the other.
    /// </summary>
    public interface ILayerMapper
    {
        Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default);
    }

    /// <summary>
    /// Resilience layer for "dirty" external DWGs whose layer names are unpredictable and
    /// non-standardised. It resolves each layer in three tiers, cheapest first:
    ///
    ///   1. PERSISTENT CACHE  — a JSON dictionary (%AppData%\Sentinel\dwg_mappings.json) of layers
    ///      resolved on a previous run. A DWG from the same source re-uses these for free.
    ///   2. BASE DICTIONARY   — built-in keyword heuristics (A-WALL/PARTITION -> Walls, etc.) that
    ///      cover standard AIA-style names without any model call.
    ///   3. LOCAL LLM         — ONLY the layers neither tier recognised are handed to the wrapped
    ///      ILayerMapper (LocalGhostBuilder -> Ollama). Whatever it returns is written back to the
    ///      cache, so each novel layer costs the model exactly once.
    ///
    /// Pure data + network + file I/O — no Revit API — so it stays safe to await off the API thread,
    /// exactly like the LocalGhostBuilder it wraps.
    /// </summary>
    public sealed class LayerMapper : ILayerMapper, IDisposable
    {
        private readonly ILayerMapper _llm;                       // tier 3: unknown layers only
        private readonly LayerRulesetMatcher _matcher;            // tier 0 (ignore) + tier 2 (map): standard-driven
        private readonly string _cachePath;                      // tier 1 backing file
        private readonly Dictionary<string, LayerMapping> _cache; // normalised layer -> mapping
        private bool _dirty;

        // On-disk shape: {"ruleset": "<standard name>", "mappings": {...}}. Stamped with the ruleset
        // that produced the Source=="standard" rows, so a ruleset swap doesn't keep pre-ticking the
        // old standard's mappings under the new one. LLM rows are ruleset-independent and survive.
        private sealed class CacheFile
        {
            [System.Text.Json.Serialization.JsonPropertyName("ruleset")]
            public string Ruleset { get; set; }
            [System.Text.Json.Serialization.JsonPropertyName("mappings")]
            public Dictionary<string, LayerMapping> Mappings { get; set; }
        }

        public LayerMapper(ILayerMapper llmFallback, string cachePath = null, LayerRulesetMatcher matcher = null)
        {
            _llm = llmFallback ?? throw new ArgumentNullException(nameof(llmFallback));
            _matcher = matcher ?? LayerRulesetMatcher.Load(); // P1: BDS DWG Layer Standard drives ignore + mapping
            _cachePath = cachePath ?? DefaultCachePath();
            _cache = LoadCache(_cachePath, _matcher.StandardName, out bool rulesetChanged);
            if (rulesetChanged) _dirty = true;

            // Self-heal: purge any previously-cached system/annotation layers (e.g. a stale
            // DEFPOINTS -> Walls written before the ignore-list existed) so the next save drops them.
            var stale = _cache.Keys.Where(_matcher.ShouldIgnore).ToList();
            foreach (string k in stale) _cache.Remove(k);
            if (stale.Count > 0) _dirty = true;
        }

        public static string DefaultCachePath() => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "dwg_mappings.json");

        public async Task<MappingResult> MapLayersAsync(
            IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            // Dedupe while preserving first-seen order; blank layer names are meaningless.
            var layers = (cadLayers ?? Enumerable.Empty<string>())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var resolved = new List<LayerMapping>();
            var unknown = new List<string>();

            foreach (string layer in layers)
            {
                // Tier 0: AutoCAD system / annotation layers are never model geometry — drop them
                // before any cache/dictionary/LLM work so they can't become walls, furniture, or
                // IFC noise, and never cost a model call.
                if (_matcher.ShouldIgnore(layer)) continue;

                string key = Normalize(layer);

                // Tier 1: previously resolved (by this or an earlier DWG from the same source).
                if (_cache.TryGetValue(key, out LayerMapping cached))
                {
                    resolved.Add(WithLayer(cached, layer));
                    continue;
                }

                // Tier 2: the BDS DWG Layer Standard (exact / alias / standard-format), with the old
                // keyword heuristics kept as a fallback inside the matcher.
                LayerMapping baseHit = _matcher.Match(layer);
                if (baseHit != null)
                {
                    baseHit.Source = "standard";
                    _cache[key] = baseHit;
                    _dirty = true;
                    resolved.Add(WithLayer(baseHit, layer));
                    continue;
                }

                // Tier 3 candidate: hand to the LLM below.
                unknown.Add(layer);
            }

            // One model round-trip for everything neither tier recognised.
            if (unknown.Count > 0)
            {
                MappingResult llmResult = await _llm.MapLayersAsync(unknown, ct).ConfigureAwait(false);
                foreach (LayerMapping m in llmResult?.Mappings ?? Enumerable.Empty<LayerMapping>())
                {
                    if (m == null || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                    m.Source = "llm";
                    _cache[Normalize(m.CadLayer)] = m;   // learn it for next time
                    _dirty = true;
                    resolved.Add(m);
                }
            }

            if (_dirty) SaveCache();
            return new MappingResult { Mappings = resolved };
        }

        // Tier 0 (ignore) + tier 2 (standard-driven mapping) now live in LayerRulesetMatcher, loaded from
        // the BDS DWG Layer Standard (bds-layers.json). See LayerRulesetMatcher.cs.

        // ---- cache persistence (tier 1) ----

        private static string Normalize(string layer) => layer.Trim().ToUpperInvariant();

        private static Dictionary<string, LayerMapping> LoadCache(string path, string currentRuleset, out bool rulesetChanged)
        {
            rulesetChanged = false;
            var dict = new Dictionary<string, LayerMapping>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (File.Exists(path))
                {
                    string json = File.ReadAllText(path);
                    var wrapped = JsonSerializer.Deserialize<CacheFile>(json);
                    Dictionary<string, LayerMapping> loaded;
                    bool hadStamp;
                    if (wrapped?.Mappings != null)
                    {
                        loaded = wrapped.Mappings;
                        hadStamp = string.Equals(wrapped.Ruleset, currentRuleset, StringComparison.Ordinal);
                    }
                    else
                    {
                        // Pre-stamp format: a bare {layer -> mapping} dictionary. No stamp = treat as
                        // mismatched so any previously-cached "standard" rows get dropped below.
                        loaded = JsonSerializer.Deserialize<Dictionary<string, LayerMapping>>(json);
                        hadStamp = false;
                    }
                    if (!hadStamp) rulesetChanged = true;

                    if (loaded != null)
                        foreach (var kv in loaded)
                        {
                            if (kv.Value == null) continue;
                            // Old cache rows predate Source; a missing key leaves the "llm" initializer,
                            // but guard an explicit JSON null too (System.Text.Json calls the setter for
                            // a present-but-null property, overwriting the default).
                            if (kv.Value.Source == null) kv.Value.Source = "llm";
                            // Ruleset swapped: drop stale deterministic rows. LLM rows are ruleset-
                            // independent (they're per-layer model guesses, not standard lookups) — keep them.
                            if (!hadStamp && string.Equals(kv.Value.Source, "standard", StringComparison.OrdinalIgnoreCase))
                                continue;
                            dict[kv.Key] = kv.Value;
                        }
                }
            }
            catch (Exception) { /* corrupt/unreadable cache -> start empty, it will be rebuilt */ }
            return dict;
        }

        private void SaveCache()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath));
                var wrapped = new CacheFile { Ruleset = _matcher.StandardName, Mappings = _cache };
                File.WriteAllText(_cachePath,
                    JsonSerializer.Serialize(wrapped, new JsonSerializerOptions { WriteIndented = true }));
                _dirty = false;
            }
            catch (Exception) { /* best-effort: a read-only cache dir must not fail the mapping run */ }
        }

        // A returned mapping must carry the DWG's ACTUAL layer string (case included) so the
        // placement engine's by-layer join lines up; the cached copy stays untouched.
        private static LayerMapping WithLayer(LayerMapping src, string layer) => new LayerMapping
        {
            CadLayer = layer,
            Category = src.Category,
            BdsFamily = src.BdsFamily,
            BdsFamilyType = src.BdsFamilyType,
            Confidence = src.Confidence,
            // P2: carry the proposal's document-derived fields; a cached row has none (enrichment runs
            // per-project, after mapping) but a matcher-supplied one may, and dropping them silently
            // would lose the build proposal's provenance.
            Params = src.Params,
            Rationale = src.Rationale,
            SourceDoc = src.SourceDoc,
            Source = src.Source,
        };

        public void Dispose() => (_llm as IDisposable)?.Dispose();
    }
}
```

with:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Sentinel.Engine; // ArtefactCache: the per-project cache folder

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The seam every layer-name-to-family mapper implements. LocalGhostBuilder is the LLM-backed
    /// implementation; LayerMapper is the tiered mapper in front of it. The orchestrator depends on this
    /// interface so the two compose without either knowing about the other.
    /// </summary>
    public interface ILayerMapper
    {
        Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default);
    }

    /// <summary>
    /// Maps each DWG layer through five tiers, the project's installed standard first (cohesion phase 4b-2, spec
    /// decision 9):
    ///
    ///   0. IGNORE     — system / annotation layers (the standard's ignore globs + the built-in net): never
    ///                   geometry, never a model call.
    ///   1. STANDARD   — the project's layers@n, exact row or alias: Source "standard", the only rows the review
    ///                   pre-ticks.
    ///   2. REMEMBERED — this project's earlier local-model answers (%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json),
    ///                   used only under the same layers sha: Source "cache". Another project's guess, or one made
    ///                   under another layers standard, never answers; an unbound document remembers nothing.
    ///   3. HEURISTIC  — the AIA discipline-major parse and the keyword list: Source "heuristic", a guess.
    ///   4. LOCAL LLM  — the layers nothing above recognised, in one call: Source "llm", remembered for next time.
    ///                   When the model cannot be reached, every row above is kept and these layers come back
    ///                   Source "unmapped" ("not mapped — local model unreachable (…)") instead of failing the run.
    ///
    /// Pure data + network + file I/O — no Revit API — so it stays safe to await off the API thread.
    /// </summary>
    public sealed class LayerMapper : ILayerMapper, IDisposable
    {
        private readonly ILayerMapper _llm;                         // tier 4: unknown layers only
        private readonly LayerRulesetMatcher _matcher;              // tiers 0, 1 and 3
        private readonly string _key;                               // the document's web project
        private readonly string? _cachePath;                        // null: unbound, nothing is remembered
        private readonly Dictionary<string, LayerMapping> _cache;   // tier 2: normalised layer -> the model's answer
        private bool _dirty;

        // On disk: {"key": "<project>", "layers_sha": "<sha of layers@n, or none>", "mappings": {LAYER: llm row}}.
        private sealed class CacheFile
        {
            [JsonPropertyName("key")] public string? Key { get; set; }
            [JsonPropertyName("layers_sha")] public string? LayersSha { get; set; }
            [JsonPropertyName("mappings")] public Dictionary<string, LayerMapping>? Mappings { get; set; }
        }

        /// <param name="llmFallback">The local model (LocalGhostBuilder).</param>
        /// <param name="matcher">The project's layers@n (GhostStandards.Layers, its Sha set), or
        /// LayerRulesetMatcher.HeuristicsOnly().</param>
        /// <param name="projectKey">The document's web project; "" (unbound) remembers nothing.</param>
        public LayerMapper(ILayerMapper llmFallback, LayerRulesetMatcher matcher, string projectKey)
        {
            _llm = llmFallback ?? throw new ArgumentNullException(nameof(llmFallback));
            _matcher = matcher ?? throw new ArgumentNullException(nameof(matcher));
            _key = (projectKey ?? "").Trim();
            _cachePath = _key.Length == 0 ? null : CachePathFor(_key);
            _cache = LoadCache(_cachePath, _key, Stamp);
        }

        /// <summary>%AppData%\Sentinel\cache\&lt;key&gt;\dwg_mappings.json — beside the project's artefact copies.</summary>
        public static string CachePathFor(string key) => ArtefactCache.PathFor(key, "dwg_mappings");

        // Remembered answers belong to one layers standard: another sha's are not used.
        private string Stamp => _matcher.Sha ?? "none";

        public async Task<MappingResult> MapLayersAsync(
            IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            // Dedupe while preserving first-seen order; blank layer names are meaningless.
            var layers = (cadLayers ?? Enumerable.Empty<string>())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var resolved = new List<LayerMapping>();
            var unknown = new List<string>();

            foreach (string layer in layers)
            {
                if (_matcher.ShouldIgnore(layer)) continue;                              // 0. never geometry
                LayerMapping? hit = _matcher.Match(layer);
                if (hit is { Source: "standard" }) { resolved.Add(hit); continue; }     // 1. the installed standard
                if (_cache.TryGetValue(Normalize(layer), out LayerMapping? earlier))      // 2. remembered, same sha
                {
                    resolved.Add(Remembered(earlier, layer));
                    continue;
                }
                if (hit != null) { resolved.Add(hit); continue; }                        // 3. heuristic
                unknown.Add(layer);                                                      // 4. the local model
            }

            // One model round-trip for everything no tier above recognised.
            if (unknown.Count > 0)
            {
                MappingResult? answer = null;
                string? failure = null;
                try { answer = await _llm.MapLayersAsync(unknown, ct).ConfigureAwait(false); }
                catch (Exception ex) when (!(ex is OperationCanceledException && ct.IsCancellationRequested)) // ESC still cancels
                {
                    failure = (ex is HttpRequestException ? "local model unreachable" : "local model failed") + " (" + ex.Message + ")";
                }
                if (failure != null)
                    resolved.AddRange(unknown.Select(u => new LayerMapping { CadLayer = u, Confidence = 0, Source = "unmapped", Rationale = "not mapped — " + failure }));
                foreach (LayerMapping m in answer?.Mappings ?? Enumerable.Empty<LayerMapping>())
                {
                    if (m == null || string.IsNullOrWhiteSpace(m.CadLayer)) continue;
                    m.Source = "llm";
                    _cache[Normalize(m.CadLayer)] = m;   // remembered for this project, under this layers sha
                    _dirty = true;
                    resolved.Add(m);
                }
            }

            if (_dirty) SaveCache();
            return new MappingResult { Mappings = resolved };
        }

        // ---- the per-project cache (tier 2) ----

        private static string Normalize(string layer) => layer.Trim().ToUpperInvariant();

        private static Dictionary<string, LayerMapping> LoadCache(string? path, string key, string stamp)
        {
            var dict = new Dictionary<string, LayerMapping>(StringComparer.OrdinalIgnoreCase);
            try
            {
                if (path == null || !File.Exists(path)) return dict;
                var file = JsonSerializer.Deserialize<CacheFile>(File.ReadAllText(path));
                // Another project's answers (two keys can share a folder once sanitised) or answers given under
                // another layers standard are not this run's.
                if (file?.Mappings == null || file.Key != key || file.LayersSha != stamp) return dict;
                foreach (var kv in file.Mappings)
                    if (kv.Value != null && kv.Value.Source == "llm") dict[kv.Key] = kv.Value;
            }
            catch (Exception) { /* corrupt/unreadable cache -> start empty; the next model answer rewrites it */ }
            return dict;
        }

        private void SaveCache()
        {
            if (_cachePath == null) return; // unbound: nothing is remembered
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
                File.WriteAllText(_cachePath, JsonSerializer.Serialize(
                    new CacheFile { Key = _key, LayersSha = Stamp, Mappings = _cache },
                    new JsonSerializerOptions { WriteIndented = true }));
                _dirty = false;
            }
            catch (Exception) { /* best-effort: a read-only cache dir must not fail the mapping run */ }
        }

        // A remembered answer on the DWG's ACTUAL layer string (the placement join is by layer), labelled "cache";
        // the stored copy stays untouched.
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
            Source = "cache",
        };

        public void Dispose() => (_llm as IDisposable)?.Dispose();
    }
}
```

Notes: the standard is asked first, so the cache never holds standard rows — it is the local model's memo only, and a heuristic is cheaper to recompute than to remember. The old self-heal purge of ignored keys goes: the ignore tier runs before the cache is consulted. The old machine file `%AppData%\Sentinel\dwg_mappings.json` is no longer read by anything (Task 6 renames it `.bak`). The file drops `#nullable disable` and its ponytail note.

- [ ] **Step 6: `GhostStandards` — the layers@n body parsed, or none naming the field**

In `SentinelAddin/GhostBuilder/GhostStandards.cs` (Task 1's file) replace:

```csharp
        public ResolvedArtefact LayersSource, GuidelineSource, CatalogSource;
```

with:

```csharp
        public ResolvedArtefact LayersSource, GuidelineSource, CatalogSource;

        /// <summary>The installed layers@n (its <see cref="LayerRulesetMatcher.Sha"/> set), or
        /// <see cref="LayerRulesetMatcher.HeuristicsOnly"/> when layers is none or did not parse.</summary>
        public LayerRulesetMatcher Layers = LayerRulesetMatcher.HeuristicsOnly();
```

and replace:

```csharp
        /// <summary>The three resolved kinds → what a build works with. The pure half of Load.</summary>
        internal static GhostStandards FromResolved(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog) =>
            new GhostStandards(layers, guideline, catalog);
```

with:

```csharp
        /// <summary>The three resolved kinds → what a build works with. The pure half of Load. A body a loader cannot
        /// use is none naming the artefact and the field — never a partial standard (DeliveryContract.FromResolved).</summary>
        internal static GhostStandards FromResolved(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog)
        {
            var s = new GhostStandards(layers, guideline, catalog);
            if (layers.Origin != "none")
            {
                var m = LayerRulesetMatcher.FromBody(layers.BodyJson, out var error);
                if (m is null) s.LayersSource = ArtefactClient.None("layers", $"{layers.Label} did not parse: {error}");
                else { m.Sha = layers.Sha256; s.Layers = m; }
            }
            return s;
        }
```

- [ ] **Step 7: `GhostReviewWindow` — the three labels on top, every row saying what it is, standard rows the only ones ticked**

In `SentinelAddin/UI/GhostReviewWindow.cs` replace line 32:

```csharp
    private readonly List<(CheckBox Box, LayerMapping Map)> _rows = new();
```

with:

```csharp
    private readonly List<(CheckBox Box, LayerMapping Map)> _rows = new();
    // The three standards the proposal was made with (GhostStandards.Header), none included.
    private readonly TextBlock _standards = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0) };
```

replace lines 42-50:

```csharp
    /// <summary>
    /// Whether a row starts ticked: deterministic ("standard") matches only, under the absurd-count cap,
    /// at or above the confidence floor. LLM-sourced rows and high-count rows never start ticked (Snowdon
    /// finding 2 — confident-but-wrong LLM rows arrived pre-ticked). Null/empty source is treated as NOT
    /// standard, mirroring Task 3's conservative posture.
    /// </summary>
    internal static bool PreTick(int n, double confidence, string source, double preTickAbove) =>
        n > 0 && n <= HighCountFlag && confidence >= preTickAbove &&
        string.Equals(source, "standard", StringComparison.OrdinalIgnoreCase);
```

with:

```csharp
    /// <summary>
    /// Whether a row starts ticked: rows of the project's installed layers standard ("standard") only, under the
    /// absurd-count cap, at or above the confidence floor. Heuristic guesses, local-model answers (fresh or
    /// remembered), unmapped layers and high-count rows never start ticked (Snowdon finding 2 — confident-but-wrong
    /// LLM rows arrived pre-ticked; cohesion 4b-2 — a keyword guess is not a standard). Null/empty source is NOT
    /// standard.
    /// </summary>
    internal static bool PreTick(int n, double confidence, string source, double preTickAbove) =>
        n > 0 && n <= HighCountFlag && confidence >= preTickAbove &&
        string.Equals(source, "standard", StringComparison.OrdinalIgnoreCase);

    /// <summary>What a row says after its element count when it is not a row of the installed standard.</summary>
    internal static string SourceNote(string? source) => source?.ToLowerInvariant() switch
    {
        "standard" => "",
        "heuristic" => "  · heuristic guess",
        "llm" => "  · local model",
        "cache" => "  · local model (remembered)",
        "unmapped" => "  · not mapped",
        _ => "  · " + (string.IsNullOrWhiteSpace(source) ? "no source" : source),
    };

    /// <summary>The standards line as shown (for the harness).</summary>
    internal string StandardsLine => _standards.Text;
```

replace lines 100-104:

```csharp
        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (header, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),
        })
```

with:

```csharp
        var top = new StackPanel();
        top.Children.Add(header);
        top.Children.Add(_standards);

        var root = new DockPanel { Margin = new Thickness(12) };
        foreach (var (el, dock) in new (UIElement, Dock)[]
        {
            (top, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),
        })
```

replace lines 125-130:

```csharp
    /// <param name="preTickAbove">Confidence at or above which a row starts ticked (low-confidence guesses
    /// are opt-in, exactly as in the standards review).</param>
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, double preTickAbove = 0.5) => Dispatcher.Invoke(() =>
    {
        _rows.Clear();
```

with:

```csharp
    /// <param name="standardsHeader">The three standards the proposal was made with (GhostStandards.Header):
    /// "Layers: … · Guideline: … · Type catalogue: …", none included. Shown under the title.</param>
    /// <param name="preTickAbove">Confidence at or above which a row starts ticked (low-confidence guesses
    /// are opt-in, exactly as in the standards review).</param>
    public void Load(MappingResult proposal, IReadOnlyDictionary<string, int> elementsPerLayer,
                     string targetLabel, string standardsHeader, double preTickAbove = 0.5) => Dispatcher.Invoke(() =>
    {
        _standards.Text = standardsHeader;
        _rows.Clear();
```

delete line 152:

```csharp
                bool isStandard = string.Equals(m.Source, "standard", StringComparison.OrdinalIgnoreCase);
```

replace line 163:

```csharp
                string suffix = (isStandard ? "" : "  · LLM") + (absurd ? "  ⚠ high count — likely annotation" : "");
```

with:

```csharp
                string suffix = SourceNote(m.Source) + (absurd ? "  ⚠ high count — likely annotation" : "");
```

and replace line 222:

```csharp
                       "Deterministic standard matches start ticked; LLM-proposed and high-count rows start unticked — review before building.";
```

with:

```csharp
                       "Only rows of the installed layers standard start ticked; heuristic, local-model, unmapped and high-count rows start unticked — review before building.";
```

- [ ] **Step 8: The ghost sample's cache line**

In `demo/ghost-sample/README.md` replace line 48:

```markdown
| `EXTERIOR-ENVELOPE` is interpreted sensibly | The spec-reading premise. Clear it from `%AppData%\Sentinel\dwg_mappings.json` first, or the cache answers and the model is never asked. |
```

with:

```markdown
| `EXTERIOR-ENVELOPE` is interpreted sensibly | The spec-reading premise. The model's answers are remembered per web project, under the installed layers standard's sha, in `%AppData%\Sentinel\cache\<key>\dwg_mappings.json` — clear that file first, or the remembered answer is used and the model is never asked. An unbound model remembers nothing. |
```

- [ ] **Step 9: GREEN — both harnesses; the add-in build is red until Task 4**

```bash
dotnet run --project tools/ghost-standards-check
dotnet run --project tools/ghost-p2-check
```

Expected (`ghost-standards-check`, about 10 s):

```
GhostStandards — layers, guideline and type catalogue from the project, each named, none included

  PASS  4 s by default, 20 s for a type catalogue
  PASS  a 20 s call outlives the old client-wide 4 s (the bridge took 4.5 s)
  PASS  a call with no cap of its own still stops at 4 s, and says so
  PASS  0.5 s asked, under 3 s waited, and the label says 0.5 s
  PASS  one GET per kind the command needs
  PASS  layers@1 from the office, labelled
  PASS  no guideline → none, named
  PASS  type_catalog@1 from the office, labelled
  PASS  the header names all three, none included
  PASS  bridge stopped → the cached copies say cached; the guideline stays none
  PASS  layers and guideline use the 4 s default, the catalogue asks for 20 s
  PASS  the three are fetched in parallel
  PASS  a command that needs the guideline only asks for the guideline only
  PASS  a kind not asked for is none, and says why
  PASS  a resolver that throws is none with the reason, never a crash
  PASS  an unbound document asks nothing and reads not bound, three times

Layers — layers@n by the bridge validator's rules; only its rows are the standard

  PASS  a complete body parses (the sha is GhostStandards' to set)
  PASS  demo\bds-pilot\bds-layers.json parses: it installs as layers@n
  PASS  config\base-standard\layers.json parses: it installs as layers@n
  PASS  family, aliases and ignore may be null (optional = absent or null, as the bridge)
  PASS  JSON null → the body is null
  PASS  an array → the body must be a JSON object
  PASS  an empty body → the body is empty
  PASS  broken JSON → none with the parser's message
  PASS  no standard → standard must be a non-empty string
  PASS  a blank standard → standard must be a non-empty string
  PASS  no layer rows → layers must be a non-empty array
  PASS  layers not an array → layers must be a non-empty array
  PASS  a row that is not an object → layers[1] must be an object
  PASS  a blank layer → layers[1].layer must be a non-empty string
  PASS  a category Ghost cannot build → layers[1].category must be Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture
  PASS  a lower-case category (the bridge is case-sensitive) → layers[1].category must be Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture
  PASS  a family that is not text → layers[0].family must be a string
  PASS  aliases not an array → layers[0].aliases must be an array of strings
  PASS  an ignore entry that is not text → ignore must be an array of strings
  PASS  an exact row is the standard (1.0), case- and space-insensitive, on the DWG's own layer string
  PASS  an alias is the standard (.95) and says whose alias
  PASS  a row without a family builds the generic family, still a row of the standard
  PASS  an AIA major that is not a row is a heuristic guess (.7), never the standard
  PASS  a keyword hit is a heuristic guess, and says so
  PASS  a layer nothing recognises is left for the local model
  PASS  the standard's ignore globs and the built-in net both drop annotation
  PASS  no layers installed: the net and the guesses stay, every guess labelled heuristic
  PASS  an installed layers@n maps, stamped with its sha, labelled
  PASS  a body the matcher cannot use is none naming the artefact and the field; heuristics map
  PASS  none stays none: heuristics only, and the header says so

LayerMapper — the installed standard first; a remembered guess never outranks it

  PASS  the cache is per project: <cache root>/<key>/dwg_mappings.json
  PASS  the installed standard answers before the cache (the remembered 'Floors' guess is not used)
  PASS  a remembered answer under the same layers sha comes before a heuristic guess, labelled cache
  PASS  a layer only a heuristic recognises is a heuristic row
  PASS  an ignored layer is no row; a layer is mapped once, whatever its case
  PASS  only what no tier above recognised goes to the local model, labelled llm
  PASS  the model's answers are remembered for demo, stamped with the layers sha; standard and heuristic rows are not cached
  PASS  answers remembered under another layers sha are not used
  PASS  a file that belongs to another key is not this project's memory
  PASS  an unbound document remembers nothing
  PASS  no layers installed: no row is a standard row
  PASS  …and the cache is stamped none, so an install later starts it afresh
  PASS  local model down: every deterministic row is kept
  PASS  …and the rest read 'not mapped — local model unreachable' instead of failing the run
  PASS  an unmapped layer is never remembered: the model is asked again next run
  PASS  ESC still cancels the run: a cancelled call is not 'unreachable'

62/62 checks pass
```

Expected (`ghost-p2-check`; the sample-folder line prints this checkout's absolute path):

```
GhostBuilder v2 offline checks

P2 — build-proposal contract
  PASS  match is case- and whitespace-insensitive
  PASS  param name/value carried
  PASS  provenance carried
  PASS  unmentioned layer left untouched
  PASS  hallucinated layer ignored
  PASS  blank name/value filtered
  PASS  empty params => no rationale-only noise
  PASS  malformed/empty input is a no-op, never a throw
  PASS  P1-shape mapping JSON still valid
  PASS  new fields survive JSON round-trip

P3 — review gate
  PASS  the review is headed with the three standards it was made with, none included
  PASS  loading a proposal emits nothing (no build without review)
  PASS  Build emits the approved proposal
  PASS  high-confidence layer with geometry is pre-ticked
  PASS  low-confidence layer is opt-in, not built by default
  PASS  layer with no geometry is never pre-ticked
  PASS  LLM-sourced row is never pre-ticked, even high-confidence with geometry
  PASS  heuristic, remembered and unmapped rows are never pre-ticked, even at 1.0 with geometry
  PASS  only ticked rows are emitted
  PASS  approved row keeps its document-derived params
  PASS  emits a new proposal, never the unreviewed one
  PASS  standard/1.0/10 pre-ticks
  PASS  llm/0.9/10 does not pre-tick
  PASS  standard/1.0/10000 (absurd count) does not pre-tick
  PASS  null source does not pre-tick
  PASS  heuristic/cache/unmapped at 1.0 do not pre-tick
  PASS  every row that is not the standard says what it is

Sample pair (demo/ghost-sample)
  PASS  sample folder exists (<repo>\demo\ghost-sample)
  PASS  sample-plan.dxf present
  PASS  sample-spec.pdf present
  PASS  GhostEvidence reads the sample folder (PDF parses in PdfPig)
  PASS  the spec PDF is cited as a source
  PASS  the fire rating the model must lift is in the evidence text
  PASS  the layer that rating applies to is in the evidence text
  PASS  the non-standard layer is explained in the evidence
  PASS  DXF carries layer A-WALL-EXT
  PASS  DXF carries layer A-WALL-INT
  PASS  DXF carries layer A-FLOR
  PASS  DXF carries layer A-DOOR
  PASS  DXF carries layer EXTERIOR-ENVELOPE
  PASS  DXF carries the two must-be-ignored layers
  PASS  empty proposal cannot be built

42/42 checks pass
```

```bash
dotnet run --project tools/artefact-cache-check
dotnet run --project tools/gate-check
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: `53/53` and `123/123` unchanged. Both add-in builds **red, exactly these 3 errors on each version** (warnings unchanged: 6 on 2024, 3 on 2025); every file this task touched compiles on net48 and net8:

```
SentinelAddin\Commands.GhostBuilder.cs(173,72): error CS0117: 'LayerRulesetMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.GhostBuilder.cs(173,26): error CS7036: There is no argument given that corresponds to the required parameter 'projectKey' of 'LayerMapper.LayerMapper(ILayerMapper, LayerRulesetMatcher, string)'
SentinelAddin\Commands.GhostBuilder.cs(297,28): error CS7036: There is no argument given that corresponds to the required parameter 'standardsHeader' of 'GhostReviewWindow.Load(MappingResult, IReadOnlyDictionary<string, int>, string, string, double)'
```

Do **not** fix them here: Task 4 rewrites `Commands.GhostBuilder.cs` (it quotes master's text). Do not push between this commit and Task 4's. (Verified on a scratch copy of 274ef6b + Task 1 on 2026-09-25: ghost-standards-check 62/62, ghost-p2-check 42/42, artefact-cache-check 53/53, gate-check 123/123, both builds with exactly these 3 errors.)

- [ ] **Step 10: Commit**

```bash
git add SentinelAddin/GhostBuilder/LayerRulesetMatcher.cs SentinelAddin/GhostBuilder/LayerMapper.cs SentinelAddin/GhostBuilder/GhostStandards.cs SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs SentinelAddin/UI/GhostReviewWindow.cs tools/ghost-standards-check/Layers.cs tools/ghost-standards-check/ghost-standards-check.csproj tools/ghost-standards-check/Check.cs tools/ghost-p2-check/ghost-p2-check.csproj tools/ghost-p2-check/Check.cs demo/ghost-sample/README.md
git commit -m "feat(revit): layers@n drives Ghost's layer mapping — LayerRulesetMatcher.FromBody by the bridge validator's rules (a body it cannot use is none naming the field), HeuristicsOnly() when none, AIA major and keyword guesses labelled heuristic; LayerMapper asks the installed standard before a per-project cache stamped with the layers sha (cache\\<key>\\dwg_mappings.json, the local model's answers only), and a local-model failure keeps every deterministic row and marks the rest not mapped; the review pre-ticks standard rows only, says what every other row is, and is headed by the three labels. The file chain (ghost_layer_ruleset_path, %AppData%, Resources), the built-in fallback and the machine-wide dwg_mappings.json are gone.

tools/ghost-standards-check 62/62 (FromBody refusals per field, the pilot and seed layers parse, tier order, per-key and per-sha cache, unbound remembers nothing, model down → unmapped, ESC still cancels); tools/ghost-p2-check 42/42 (heuristic/cache/unmapped never pre-ticked, the header, the live dry run reads demo/bds-pilot/bds-layers.json).
The add-in build is red until Task 4 rewires Commands.GhostBuilder.cs:173,297 (CS0117, 2 x CS7036).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

No code change. Task 2's `GhostReviewWindow` header (the `_standards` field and the required `standardsHeader` parameter of `Load`) is the only standards line in the review window. Task 4 must not add `SetStandards` (see Task 4 amendment E). Task 2's `tools/ghost-p2-check/Check.cs:198-213` replacement is the only repoint of ghost-p2-check; Task 4 drops its own (see Task 4 amendment B). Task 2's rewrite of `demo/ghost-sample/README.md:48` stands; Task 5 drops its line-48 edit (see Task 5 amendment A).

---

### Task 3: Revit — `guideline@n` and `type_catalog@n` from the project: `GuidelineMatcher.FromBodies` refuses what the bridge refuses, every wall-type gap names the catalogue in force, no clone of an unrelated wall, and Build Office System exports the catalogue instead of writing the machine file

**Files:**
- Modify: `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` (header :6-9; `CatalogEntry` + `CatalogDoc` :98-110; the class head through `ReadJson` :138-187 — `Load`, `Candidates` and `ReadJson` are deleted; `WithCatalogCheck` :276-297)
- Modify: `SentinelAddin/GhostBuilder/GhostStandards.cs` (Task 1's `ParseGuideline` stub — replaced; see Cross-task notes B1)
- Modify: `SentinelAddin/GhostBuilder/GhostTypeCreator.cs` (header :10-12; the first-Basic-wall fallback :52-59)
- Modify: `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (`_guideline` comment :36-39; `CreatedTypes` :84-86; `ResolveWallType` + the head of `PlaceWall` :121-201; the wall-type lookup :215-220; the placement return :235-238)
- Modify: `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`PlacementReport` tail :323-325; the report copy :388-390)
- Create: `SentinelAddin/Standards/TypeCatalogExport.cs`
- Modify: `SentinelAddin/Commands.Standards.cs` (`BuildOfficeSystemCommand.Execute` from :35 and `WriteTypeCatalog` :52-78 — replaced, `WriteTypeCatalog` deleted)
- Create: `tools/ghost-standards-check/GuidelineChecks.cs`; Modify: `tools/ghost-standards-check/ghost-standards-check.csproj` and `tools/ghost-standards-check/Check.cs` (Task 1's files — three Compile lines and one call line; see Cross-task notes B2)
- Modify (API only — the `SentinelAddin/Resources/bds-guideline.json` path stays until Task 4 moves the file): `tools/guideline-check/Check.cs` (:20-35, :64, :70-73), `tools/annotate-check/Check.cs` (:44-46), `tools/wallpair-check/SampleRun.cs` (:23-25)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-standards-4b-design.md` decisions 2 (guideline none → wall types from the layer mapping, named; type catalogue none → "types checked against this document only"), 3, 4 (the `guideline` and `type_catalog` shapes), 8 (the catalogue is read at placement, the open document decides presence, `GhostTypeCreator` reports the gap, Build Office System writes an export) and "4b-2" (Loaders, Build Office System); `WebApp/bridge/artefact-store.mjs:55-58` (`filled`, `bad(kind, path, want)` → `"<kind>: <path> <want>"` — the message style this port repeats without the kind prefix) and `:153-184` (the `guideline` and `type_catalog` validators this port repeats, rule for rule; "optional" = absent or null); `SentinelAddin/Engine/DeliveryContract.cs:55-116` (the 4b-1 `FromBody` / `FromResolved` pattern: never throws; a refused body is `ArtefactClient.None(kind, "<label> did not parse: <error>")`) and `:133-136` (the blank rule: `char.IsWhiteSpace` plus U+FEFF); `SentinelAddin/Coordination/ArtefactClient.cs:14-23` (`ResolvedArtefact`), `:119-124` (`RefLabel` → `"type_catalog@1 · office · 0123456789ab…"`), `:141-142` (`None`, public since 4b-1); `SentinelAddin/GhostBuilder/GhostTypeCreator.cs:180-186` (`NearestSibling` is null when no named sibling is in the document); `SentinelAddin/GhostBuilder/MassingBuilder.cs:92-101` (the massing mapping names no family, so with guideline none a massing wall is a gap → a named placeholder); `SentinelAddin/Standards/StandardsPack.cs:61-81, 159-169` (`TypeSpec` / `ViewTemplateSpec` JSON names: `system` bool, `width_mm`/`height_mm` `double?`); `WebApp/bridge/artefact-import.mjs:1-2, 59-64` (usage `<file.json> --project <key> --kind <kind>`; it `JSON.parse`s the file read as UTF-8 — `File.WriteAllText` writes no BOM); `SentinelAddin/Commands.Annotate.cs:26-28`, `SentinelAddin/Commands.GhostBuilder.cs:177-179`, `SentinelAddin/Commands.Massing.cs:42-44` (the three `GuidelineMatcher.Load` callers — Task 4 rewires them to `GhostStandards`; this task does not touch them).

**Interfaces:**
- Consumes (Task 1): `SentinelAddin/GhostBuilder/GhostStandards.cs` (namespace `Sentinel.GhostBuilder`) with the pinned fields and `Load`, whose resolved guideline and catalogue go through `internal static (GuidelineMatcher? Matcher, ResolvedArtefact Guideline, ResolvedArtefact Catalog) ParseGuideline(ResolvedArtefact guideline, ResolvedArtefact catalog)` — Task 1's stub returns `(null, guideline, catalog)` and `Load` assigns `(s.Guideline, s.GuidelineSource, s.CatalogSource)` from it; `tools/ghost-standards-check` (net8, `ImplicitUsings` + `Nullable` enable, compiles `GhostStandards.cs`, `GuidelineMatcher.cs`, `ArtefactClient.cs`, `BcfConfig.cs`, `ArtefactCache.cs`; `Check.cs` has `static void Ok(bool c, string n)`, `static string _root` = the repo root, and ends `Main` with `Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");`). From 4b-1: `ArtefactClient.None(string kind, string reason)`, `ArtefactClient.RefLabel(string? ref, string? source, string? sha256)`, `ResolvedArtefact { Kind, Ref, Source, Sha256, BodyJson, Origin, Label, … }`.
- Produces:
  - `public static GuidelineMatcher GuidelineMatcher.FromBodies(string guidelineJson, string catalogJson, out string guidelineError, out string catalogError)` — `guidelineJson`/`catalogJson` are raw artefact bodies; `null` = none installed (no error). Never throws; always returns a matcher. A body that fails the shape below is left out (`HasGuideline` / `HasCatalog` false) with its error; the other body is unaffected. (Declared with plain `string` because `GuidelineMatcher.cs` is `#nullable disable` — the pinned `string?` would be warning CS8632 there; callers see no difference.)
  - `public string GuidelineMatcher.CatalogLabel { get; set; }` (default `"type_catalog (unlabelled)"`; `GhostStandards` sets it to the catalogue's `ResolvedArtefact.Label`); `public string GuidelineMatcher.TemplateTitle` (the catalogue's `template.title`, or null); `public string GuidelineMatcher.Gap(string what, string why)` → `"gap: <what> — <why> (type_catalog: <CatalogLabel>)"`.
  - `GuidelineResolution.Why` for a type the catalogue lacks: `"\"<type>\" is not in <CatalogLabel>[ (template <title>)]. Available: a, b."` or `"… No comparable type in it — the office standard may need this type added."` (was "is not in this office's template").
  - `public sealed class CatalogTemplate { string Title ("title"); string Path ("path"); string ExtractedAt ("extracted_at") }`; `CatalogDoc.Template` (`"template"`) replaces `CatalogDoc.Source` (`"source"`, deleted).
  - Deleted: `GuidelineMatcher.Load(string, string)`, `Candidates`, `ReadJson` — no settings path, no `%AppData%\Sentinel\bds-guideline.json`, no `Resources\…`, no machine catalogue.
  - `GhostStandards.ParseGuideline` (filled in): returns a non-null matcher; a refused body → `ArtefactClient.None("guideline" | "type_catalog", "<label> did not parse: <error>")`; an installed artefact with no body → `"<label> did not parse: the body is empty"`; `Matcher.CatalogLabel` = the (possibly replaced) catalogue label.
  - `GhostTypeCreator.CreateWallType(...)`: when no name in `siblingNames` is a wall type in the document it returns null with `reason = "no sibling type in this document"` — never the first Basic wall.
  - `ElementPlacementFactory.WallsByGuideline`, `WallsByMapping`, `WallGaps` (public int fields) and the same three on `GhostPlacementEngine.PlacementReport`, copied by `GhostPlacementEngine.Place` — Task 4's build summaries read them.
  - `public static class Sentinel.Standards.TypeCatalogExport { string FileName(string templateTitle); string Json(string templateTitle, string templatePath, DateTimeOffset extractedAt, List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates); string Write(string exportsDir, string templateTitle, string templatePath, DateTimeOffset extractedAt, List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates); string Message(int count, string templateTitle, string path) }`.
  - Build Office System writes `%AppData%\Sentinel\exports\type-catalog-<safe title>.json` (`{template:{title,path,extracted_at}, count, types, view_templates}`) and never `%AppData%\Sentinel\type-catalog.json`; its dialog prints the path and `node bridge/artefact-import.mjs "<path>" --project <office> --kind type_catalog`; a failed write is said, not swallowed.

`FromBodies` refusals (the error string, exactly — the bridge's messages without the `guideline: ` / `type_catalog: ` prefix; `<i>`/`<j>` are array indexes):

| Body | error |
|---|---|
| empty or whitespace string | `the body is empty` |
| JSON `null` | `the body is null` |
| JSON array, string, number, bool | `the body must be a JSON object` |
| not JSON | the System.Text.Json parser's message |
| guideline: `standard` absent, not a string or blank | `standard must be a non-empty string` |
| guideline: `elements` absent, not an array or empty | `elements must be a non-empty array` |
| guideline: an element not an object | `elements[<i>] must be an object` |
| guideline: `category` absent or blank | `elements[<i>].category must be a non-empty string` |
| guideline: `rules` absent or not an array | `elements[<i>].rules must be an array` |
| guideline: a rule not an object | `elements[<i>].rules[<j>] must be an object` |
| guideline: `when` absent or not an object | `elements[<i>].rules[<j>].when must be an object` |
| guideline: `use` not an object, or `use.family` absent or blank | `elements[<i>].rules[<j>].use.family must be a non-empty string` |
| guideline: `default` present, not null, and not an object with a filled `family` | `elements[<i>].default.family must be a non-empty string` |
| guideline: `views` present, not null, not an array | `views must be an array` |
| guideline: `viewNaming` present, not null, not an object | `viewNaming must be an object` |
| guideline: a value the reader cannot type (e.g. `when.params` with a number) | the deserializer's message (the bridge does not check it; Revit cannot use it) |
| catalogue: `types` absent, not an array or empty | `types must be a non-empty array` |
| catalogue: more than 20 000 rows | `types must hold at most 20000 entries (has <n>)` |
| catalogue: a row not an object | `types[<i>] must be an object` |
| catalogue: `category` / `type` absent or blank | `types[<i>].category must be a non-empty string` (`.type` alike) |
| catalogue: `family` present, not null, not a string | `types[<i>].family must be a string` |
| catalogue: `system` present, not null, not a boolean | `types[<i>].system must be true or false` |
| catalogue: `width_mm` / `height_mm` present, not null, not a number | `types[<i>].width_mm must be a number or null` (`height_mm` alike) |
| catalogue: `template` present, not null, not an object (the harvest's old `source` string) | `template must be an object {title, path?, extracted_at?}` |
| catalogue: `template.title` absent or blank | `template.title must be a non-empty string` |
| catalogue: `template.path` / `template.extracted_at` present, not null, not a string | `template.path must be a string` (`extracted_at` alike) |
| catalogue: `view_templates` present, not null, not an array | `view_templates must be an array` |

How a wall is typed after this task (`ElementPlacementFactory.ResolveWallType`; the placement dialog shows the warnings and notes):

| Situation | Typed by (counter) | What the build says |
|---|---|---|
| guideline none (or no measured thickness), the mapping names a wall type | mapping (`WallsByMapping`) | nothing extra; Task 4's summary names the guideline none label |
| guideline none, the mapping names no wall type (Photo Massing always) | gap (`WallGaps`); massing places the template's default type | `gap: 200 mm wall on 'A-WALL-EXT' — guideline: none, and the layer mapping names no wall type (type_catalog: <label>)` |
| the guideline's type is in the document (or this build created it) | guideline (`WallsByGuideline`) | with no catalogue, once: `Wall types were not checked against a type catalogue (type_catalog: none — …) — only against this document.` |
| no catalogue, the type is not in the document | gap | `gap: <type> — not in this document; types checked against this document only (type_catalog: none — …)` |
| not in the catalogue, a catalogue sibling is in the document | guideline (created, listed under Created) | `+ <type> (from a 275 mm wall on '<layer>')` |
| not in the catalogue, no catalogue sibling in the document | gap — no clone | `gap: <type> — no sibling type in this document (type_catalog: <label>)` |
| not in the catalogue, no comparable type in it | gap | `"<type>" is not in <label> (template <title>). No comparable type in it — the office standard may need this type added.` |

- [ ] **Step 1: Write the failing harness**

Create `tools/ghost-standards-check/GuidelineChecks.cs`:

```csharp
using Sentinel.Coordination;
using Sentinel.GhostBuilder;
using Sentinel.Standards;

/// <summary>
/// Cohesion phase 4b-2, Task 3: guideline@n and type_catalog@n in Revit. GuidelineMatcher.FromBodies refuses what the
/// bridge validator refuses (artefact-store.mjs validateArtefact) and reads nothing from the machine; GhostStandards turns
/// a refused body into none naming the artefact and the field; every gap text names the catalogue in force; Build Office
/// System's export installs as type_catalog@n and is never the machine-global catalogue file.
/// </summary>
static class GuidelineChecks
{
    const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // A guideline and a catalogue that pass the bridge validator; each refusal below breaks exactly one thing in one.
    const string Guideline =
        "{\"standard\":\"Test Office Guideline\",\"elements\":[{\"category\":\"Walls\"," +
        "\"rules\":[{\"when\":{\"layer\":\"A-WALL-EXT\"},\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_EXT_{thickness} mm\"}}]," +
        "\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}}]," +
        "\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}],\"viewNaming\":{\"statusPrefixes\":{\"WIP_\":\"01_WIP\"}}}";
    const string Catalog =
        "{\"template\":{\"title\":\"Office_Template\",\"path\":\"C:\\\\t\\\\Office_Template.rte\",\"extracted_at\":\"2026-09-25T06:14:40+02:00\"}," +
        "\"types\":[{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\",\"system\":true,\"width_mm\":200,\"height_mm\":null}," +
        "{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_300 mm\"}],\"view_templates\":[]}";

    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Bodies();
        Guidelines();
        Catalogues();
        Fixtures(root);
        Sources();
        Gaps();
        Export(root);
    }

    static void GuidelineRefused(string body, string want, string name)
    {
        var m = GuidelineMatcher.FromBodies(body, Catalog, out var error, out var catalogError);
        _ok(!m.HasGuideline && m.HasCatalog && error == want && catalogError == null, "guideline: " + name + " → " + want);
        if (m.HasGuideline || error != want) Console.WriteLine("        got: " + (error ?? "a guideline"));
    }

    static void CatalogRefused(string body, string want, string name)
    {
        var m = GuidelineMatcher.FromBodies(Guideline, body, out var guidelineError, out var error);
        _ok(!m.HasCatalog && m.HasGuideline && error == want && guidelineError == null, "type_catalog: " + name + " → " + want);
        if (m.HasCatalog || error != want) Console.WriteLine("        got: " + (error ?? "a catalogue"));
    }

    // ── 1. both bodies read; nothing installed is no guideline and no catalogue, with no error and no file ──────────
    static void Bodies()
    {
        var m = GuidelineMatcher.FromBodies(Guideline, Catalog, out var ge, out var ce);
        _ok(m.HasGuideline && m.HasCatalog && ge == null && ce == null, "a guideline and a catalogue the bridge accepts are read");
        _ok(m.Standard == "Test Office Guideline" && m.TemplateTitle == "Office_Template" && m.Views?.Count == 1,
            "standard, views and the catalogue's template.title read as written");
        var r = m.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 199.6 });
        _ok(r.Type == "OFF_EXT_200 mm" && r.Confidence == 1.0 && r.Available == null, "a type the catalogue has resolves at confidence 1");

        var none = GuidelineMatcher.FromBodies(null, null, out var ng, out var nc);
        _ok(!none.HasGuideline && !none.HasCatalog && ng == null && nc == null && none.Standard == "(no guideline)",
            "nothing installed (null bodies) → no guideline, no catalogue, no error — no file is read instead");
        var uncheck = GuidelineMatcher.FromBodies(Guideline, null, out _, out _)
            .Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(uncheck.Type == "OFF_EXT_250 mm" && uncheck.Confidence == 1.0 && uncheck.Available == null,
            "no catalogue → the guideline's type is unchecked here (placement checks it against the document only)");
    }

    // ── 2. guideline@n refusals: the bridge validator's rules, the message without the kind prefix ─────────────────
    static void Guidelines()
    {
        GuidelineRefused("null", "the body is null", "JSON null");
        GuidelineRefused("[]", "the body must be a JSON object", "an array");
        GuidelineRefused("  ", "the body is empty", "an empty body");
        var broken = GuidelineMatcher.FromBodies("{\"standard\":", null, out var parseError, out _);
        _ok(!broken.HasGuideline && parseError is { Length: > 0 }, "guideline: broken JSON → none with the parser's message");
        GuidelineRefused(Guideline.Replace("\"standard\":\"Test Office Guideline\",", ""), "standard must be a non-empty string", "missing standard");
        GuidelineRefused(Guideline.Replace("\"Test Office Guideline\"", "\"  \""), "standard must be a non-empty string", "a blank standard");
        GuidelineRefused("{\"standard\":\"x\"}", "elements must be a non-empty array", "missing elements");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[]}", "elements must be a non-empty array", "empty elements");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[5]}", "elements[0] must be an object", "an element that is not an object");
        GuidelineRefused(Guideline.Replace("\"category\":\"Walls\"", "\"category\":\"\""), "elements[0].category must be a non-empty string", "a blank category");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\"}]}", "elements[0].rules must be an array", "an element without rules (Resolve dereferences them)");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\",\"rules\":[7]}]}", "elements[0].rules[0] must be an object", "a rule that is not an object");
        GuidelineRefused(Guideline.Replace("\"when\":{\"layer\":\"A-WALL-EXT\"},", ""), "elements[0].rules[0].when must be an object", "a rule without when");
        GuidelineRefused(Guideline.Replace("\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_EXT_{thickness} mm\"}", "\"use\":{\"typePattern\":\"OFF_EXT_{thickness} mm\"}"),
            "elements[0].rules[0].use.family must be a non-empty string", "a rule whose use names no family");
        GuidelineRefused(Guideline.Replace("\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}", "\"default\":{}"),
            "elements[0].default.family must be a non-empty string", "a default without a family");
        GuidelineRefused(Guideline.Replace("\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}]", "\"views\":{}"), "views must be an array", "views not an array");
        GuidelineRefused(Guideline.Replace("\"viewNaming\":{\"statusPrefixes\":{\"WIP_\":\"01_WIP\"}}", "\"viewNaming\":[]"), "viewNaming must be an object", "viewNaming not an object");
        var optional = GuidelineMatcher.FromBodies(Guideline.Replace("\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}", "\"default\":null")
            .Replace("\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}]", "\"views\":null"), null, out var optionalError, out _);
        _ok(optional.HasGuideline && optionalError == null, "guideline: default and views null read as absent, as the bridge reads them");
        var unreadable = GuidelineMatcher.FromBodies(Guideline.Replace("{\"layer\":\"A-WALL-EXT\"}", "{\"params\":{\"Fire Rating\":60}}"), null, out var readError, out _);
        _ok(!unreadable.HasGuideline && readError is { Length: > 0 },
            "guideline: a when.params value that is not text is none with the reader's message (the bridge does not check it)");
    }

    // ── 3. type_catalog@n refusals ─────────────────────────────────────────────────────────────────────────────────
    static void Catalogues()
    {
        CatalogRefused("null", "the body is null", "JSON null");
        CatalogRefused("[{\"category\":\"Walls\",\"type\":\"x\"}]", "the body must be a JSON object", "a bare types array (the TS reader's shape)");
        CatalogRefused("{\"template\":{\"title\":\"t\"}}", "types must be a non-empty array", "missing types");
        CatalogRefused("{\"types\":[]}", "types must be a non-empty array", "empty types");
        var many = "{\"types\":[" + string.Join(",", Enumerable.Repeat("{\"category\":\"Walls\",\"type\":\"x\"}", 20001)) + "]}";
        CatalogRefused(many, "types must hold at most 20000 entries (has 20001)", "more types than the bridge stores");
        CatalogRefused("{\"types\":[1]}", "types[0] must be an object", "a row that is not an object");
        CatalogRefused(Catalog.Replace("\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\"", "\"category\":\" \",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\""),
            "types[0].category must be a non-empty string", "a blank category");
        CatalogRefused(Catalog.Replace("\"type\":\"OFF_EXT_300 mm\"", "\"name\":\"OFF_EXT_300 mm\""), "types[1].type must be a non-empty string", "a row without a type");
        CatalogRefused(Catalog.Replace("\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_300 mm\"", "\"family\":5,\"type\":\"OFF_EXT_300 mm\""), "types[1].family must be a string", "a family that is not text");
        CatalogRefused(Catalog.Replace("\"system\":true", "\"system\":\"yes\""), "types[0].system must be true or false", "system as text");
        CatalogRefused(Catalog.Replace("\"width_mm\":200", "\"width_mm\":\"200\""), "types[0].width_mm must be a number or null", "width_mm as text");
        CatalogRefused(Catalog.Replace("\"height_mm\":null", "\"height_mm\":[]"), "types[0].height_mm must be a number or null", "height_mm an array");
        CatalogRefused("{\"template\":\"Office_Template\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}",
            "template must be an object {title, path?, extracted_at?}", "template as a string (the harvest's old source shape)");
        CatalogRefused("{\"template\":{},\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", "template.title must be a non-empty string", "a template without a title");
        CatalogRefused("{\"template\":{\"title\":\"t\",\"path\":5},\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", "template.path must be a string", "a template path that is not text");
        CatalogRefused(Catalog.Replace("\"view_templates\":[]", "\"view_templates\":{}"), "view_templates must be an array", "view_templates not an array");
        var old = GuidelineMatcher.FromBodies(null, "{\"source\":\"Office_Template\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", out _, out var oldError);
        _ok(old.HasCatalog && oldError == null && old.TemplateTitle == null,
            "type_catalog: a harvest's old top-level source is ignored, never read as the template");
    }

    // ── 4. the office fixtures in the repo parse: each installs as guideline@n / type_catalog@n ─────────────────────
    static void Fixtures(string root)
    {
        foreach (var (pattern, isGuideline) in new[] { ("*guideline*.json", true), ("*type-catalog*.json", false) })
            foreach (var dir in new[] { Path.Combine(root, "demo"), Path.Combine(root, "SentinelAddin", "Resources") }.Where(Directory.Exists))
                foreach (var f in Directory.EnumerateFiles(dir, pattern, SearchOption.AllDirectories).OrderBy(x => x, StringComparer.Ordinal))
                {
                    var body = File.ReadAllText(f);
                    string? e;
                    var m = isGuideline ? GuidelineMatcher.FromBodies(body, null, out e, out _) : GuidelineMatcher.FromBodies(null, body, out _, out e);
                    _ok((isGuideline ? m.HasGuideline : m.HasCatalog) && e is null,
                        $"{Path.GetRelativePath(root, f)} parses: it installs as {(isGuideline ? "guideline" : "type_catalog")}@n{(e is null ? "" : " — " + e)}");
                }
    }

    // ── 5. GhostStandards: an installed body comes with its label; a refused body is none naming the field ─────────
    static ResolvedArtefact Installed(string kind, string body) => new()
    {
        Kind = kind, Ref = kind + "@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel(kind + "@1", "office", Sha),
    };

    static void Sources()
    {
        var g = Installed("guideline", Guideline);
        var c = Installed("type_catalog", Catalog);
        var ok = GhostStandards.ParseGuideline(g, c);
        _ok(ok.Matcher is { HasGuideline: true, HasCatalog: true } && ReferenceEquals(ok.Guideline, g) && ReferenceEquals(ok.Catalog, c)
            && ok.Matcher.CatalogLabel == "type_catalog@1 · office · 0123456789ab…",
            "installed guideline@1 and type_catalog@1 → the matcher, both labels kept, the catalogue's label on the matcher");

        var badGuideline = GhostStandards.ParseGuideline(Installed("guideline", "{\"standard\":\"x\",\"elements\":[]}"), c);
        _ok(badGuideline.Matcher is { HasGuideline: false, HasCatalog: true } && badGuideline.Guideline is { Kind: "guideline", Origin: "none", Ref: null }
            && badGuideline.Guideline.Label == "none — guideline@1 · office · 0123456789ab… did not parse: elements must be a non-empty array",
            "a guideline body the matcher cannot use is none, naming the artefact and the field; the catalogue stays");

        var badCatalog = GhostStandards.ParseGuideline(g, Installed("type_catalog", "{\"template\":\"t\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}"));
        const string badLabel = "none — type_catalog@1 · office · 0123456789ab… did not parse: template must be an object {title, path?, extracted_at?}";
        _ok(badCatalog.Matcher is { HasGuideline: true, HasCatalog: false } && badCatalog.Catalog is { Kind: "type_catalog", Origin: "none" }
            && badCatalog.Catalog.Label == badLabel && badCatalog.Matcher.CatalogLabel == badLabel,
            "a catalogue body the matcher cannot use is none, and the gap text names that none");

        var noneG = ArtefactClient.None("guideline", "not installed for p-none or its office");
        var noneC = ArtefactClient.None("type_catalog", "not installed for p-none or its office");
        var none = GhostStandards.ParseGuideline(noneG, noneC);
        _ok(none.Matcher is { HasGuideline: false, HasCatalog: false } && ReferenceEquals(none.Guideline, noneG) && ReferenceEquals(none.Catalog, noneC)
            && none.Matcher.CatalogLabel == "none — not installed for p-none or its office",
            "none stays none, with the client's reason — no file, no shipped profile");

        var emptyBody = GhostStandards.ParseGuideline(Installed("guideline", null!), noneC);
        _ok(emptyBody.Guideline.Label == "none — guideline@1 · office · 0123456789ab… did not parse: the body is empty",
            "an installed artefact with no body is none (the body is empty), never 'no guideline' unexplained");
    }

    // ── 6. the gap text names the catalogue in force ────────────────────────────────────────────────────────────
    static void Gaps()
    {
        var m = GuidelineMatcher.FromBodies(Guideline, Catalog, out _, out _);
        m.CatalogLabel = "type_catalog@1 · office · 0123456789ab…";
        var gap = m.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(gap.Confidence == 0 && gap.Available != null && gap.Available.SequenceEqual(new[] { "OFF_EXT_200 mm", "OFF_EXT_300 mm" }),
            "a type the catalogue lacks drops to confidence 0 with the catalogue's siblings, smallest first");
        _ok(gap.Why == "\"OFF_EXT_250 mm\" is not in type_catalog@1 · office · 0123456789ab… (template Office_Template). Available: OFF_EXT_200 mm, OFF_EXT_300 mm.",
            "the gap names the catalogue's label and template, not 'this office's template'");
        _ok(m.Gap("OFF_EXT_250 mm", "no sibling type in this document")
            == "gap: OFF_EXT_250 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · 0123456789ab…)",
            "GhostTypeCreator's no-sibling gap reads: gap: <type> — no sibling type in this document (type_catalog: <label>)");
        var lone = GuidelineMatcher.FromBodies(Guideline, Catalog.Replace("OFF_EXT_200 mm", "OTHER_200 mm").Replace("OFF_EXT_300 mm", "OTHER_300 mm"), out _, out _);
        lone.CatalogLabel = "type_catalog@2 · project · 0123456789ab…";
        var noSibling = lone.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(noSibling.Why == "\"OFF_EXT_250 mm\" is not in type_catalog@2 · project · 0123456789ab… (template Office_Template). No comparable type in it — the office standard may need this type added.",
            "no comparable type: the gap still names the catalogue it checked");
    }

    // ── 7. Build Office System's export: a type_catalog@n body with template, in exports\, never type-catalog.json ──
    static void Export(string root)
    {
        _ok(TypeCatalogExport.FileName("Office_Template") == "type-catalog-Office_Template.json", "export name: type-catalog-<template>.json");
        _ok(TypeCatalogExport.FileName("Office Project (Template)") == "type-catalog-Office_Project_Template.json", "spaces and brackets become one '_' each run");
        _ok(TypeCatalogExport.FileName("a/b:c*?") == "type-catalog-a_b_c.json" && TypeCatalogExport.FileName("  ") == "type-catalog-untitled.json",
            "path characters never reach the file name; a blank title is 'untitled'");

        string tmp = Path.Combine(Path.GetTempPath(), "ghost-standards-check-" + Guid.NewGuid().ToString("N"));
        try
        {
            var types = new List<TypeSpec>
            {
                new() { Category = "Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200 },
                new() { Category = "Doors", Family = "Single-Flush", Type = "900 x 2100" },
            };
            var views = new List<ViewTemplateSpec> { new() { Name = "01_WIP_PLANS", ViewType = "FloorPlan" } };
            string path = TypeCatalogExport.Write(Path.Combine(tmp, "exports"), "Office Project (Template)", @"C:\t\Office.rte",
                                                  new DateTimeOffset(2026, 9, 25, 6, 14, 40, TimeSpan.FromHours(2)), types, views);
            _ok(path == Path.Combine(tmp, "exports", "type-catalog-Office_Project_Template.json") && File.Exists(path),
                "the export is written to <Sentinel>\\exports\\type-catalog-<template>.json");
            _ok(!File.Exists(Path.Combine(tmp, "type-catalog.json")) && !File.Exists(Path.Combine(tmp, "exports", "type-catalog.json")),
                "…and never to the machine-global type-catalog.json");

            string body = File.ReadAllText(path);
            using var d = System.Text.Json.JsonDocument.Parse(body);
            var t = d.RootElement.GetProperty("template");
            _ok(!d.RootElement.TryGetProperty("source", out _) && t.GetProperty("title").GetString() == "Office Project (Template)"
                && t.GetProperty("path").GetString() == @"C:\t\Office.rte" && t.GetProperty("extracted_at").GetString() == "2026-09-25T06:14:40.0000000+02:00",
                "template {title, path, extracted_at}; no top-level source (the PUT route would lift it off)");
            _ok(d.RootElement.GetProperty("count").GetInt32() == 2 && d.RootElement.GetProperty("types")[0].GetProperty("system").GetBoolean()
                && d.RootElement.GetProperty("types")[0].GetProperty("width_mm").GetDouble() == 200 && d.RootElement.GetProperty("types")[1].GetProperty("width_mm").ValueKind == System.Text.Json.JsonValueKind.Null
                && d.RootElement.GetProperty("view_templates").GetArrayLength() == 1,
                "types keep system, width_mm (null when absent); view_templates travel with them");
            var read = GuidelineMatcher.FromBodies(null, body, out _, out var readError);
            _ok(read.HasCatalog && readError == null && read.TemplateTitle == "Office Project (Template)",
                "the export parses as type_catalog@n — what the bridge will accept on install");

            string msg = TypeCatalogExport.Message(2, "Office Project (Template)", path);
            _ok(msg.Contains("(2 types from Office Project (Template)) → " + path)
                && msg.Contains("node bridge/artefact-import.mjs \"" + path + "\" --project <office> --kind type_catalog"),
                "the dialog names the path and the install command");
        }
        finally { try { Directory.Delete(tmp, true); } catch (IOException) { } }

        var readers = Directory.EnumerateFiles(Path.Combine(root, "SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar))
            .Where(f => File.ReadAllText(f).Contains("type-catalog.json")).Select(f => Path.GetRelativePath(root, f)).ToList();
        _ok(readers.Count == 0, "no add-in source names the machine-global type-catalog.json" + (readers.Count == 0 ? "" : " → " + string.Join(", ", readers)));
    }
}
```

In `tools/ghost-standards-check/ghost-standards-check.csproj` (Task 1's file), directly after the line

```xml
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GuidelineMatcher.cs" />
```

insert (skip any of the three a previous task already compiles — a duplicate Compile item is error CS2002):

```xml
    <!-- Task 3 (4b-2): Build Office System's type-catalogue export, and the pack types it serialises. -->
    <Compile Include="..\..\SentinelAddin\Standards\TypeCatalogExport.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\StandardsPack.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
```

In `tools/ghost-standards-check/Check.cs` (Task 1's file, after Task 2's additions), directly before the line

```csharp
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
```

insert:

```csharp
        GuidelineChecks.Run(_root, Ok);
```

- [ ] **Step 2: Run it — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/ghost-standards-check
```

Expected: the build fails with

```
error CS2001: Source file '…\tools\ghost-standards-check\..\..\SentinelAddin\Standards\TypeCatalogExport.cs' could not be found.
The build failed. Fix the build errors and run again.
```

(the export this task creates). Once that file exists, the remaining errors are all in `GuidelineChecks.cs`: CS0117 `'GuidelineMatcher' does not contain a definition for 'FromBodies'` and CS1061 `… 'CatalogLabel'` — match the kinds, not the line numbers.

- [ ] **Step 3: `GuidelineMatcher.cs` — bodies, not files**

Replace lines 6-9, which read:

```csharp
// PER-FIRM BY DESIGN. Nothing here knows about BDS. The guideline and the type catalogue are two swappable
// JSON files; another practice points the settings at their own and no code changes (decision D-03 — an
// office standard is config, not code). The shipped Resources copy is a reference profile, not a default
// anyone is stuck with.
```

with:

```csharp
// PER-FIRM BY DESIGN. Nothing here knows about any office. The guideline and the type catalogue are artefacts —
// guideline@n and type_catalog@n installed on the document's web project or its office (cohesion phase 4b) —
// resolved by GhostStandards and read here by FromBodies. Nothing ships beside the DLL and nothing is read from
// the machine: with none installed there is no guideline, and every surface that builds says so.
```

Replace lines 98-110, which read:

```csharp
    /// <summary>One row of the office's harvested type catalogue (type-catalog.json).</summary>
    public sealed class CatalogEntry
    {
        [JsonPropertyName("category")] public string Category { get; set; }
        [JsonPropertyName("family")]   public string Family { get; set; }
        [JsonPropertyName("type")]     public string Type { get; set; }
    }

    public sealed class CatalogDoc
    {
        [JsonPropertyName("source")] public string Source { get; set; }
        [JsonPropertyName("types")]  public List<CatalogEntry> Types { get; set; } = new List<CatalogEntry>();
    }
```

with:

```csharp
    /// <summary>One row of the office's harvested type catalogue (a type_catalog@n body's <c>types[]</c>).</summary>
    public sealed class CatalogEntry
    {
        [JsonPropertyName("category")] public string Category { get; set; }
        [JsonPropertyName("family")]   public string Family { get; set; }
        [JsonPropertyName("type")]     public string Type { get; set; }
    }

    /// <summary>The template a catalogue was harvested from (Build Office System's export).</summary>
    public sealed class CatalogTemplate
    {
        [JsonPropertyName("title")]        public string Title { get; set; }
        [JsonPropertyName("path")]         public string Path { get; set; }
        [JsonPropertyName("extracted_at")] public string ExtractedAt { get; set; }
    }

    public sealed class CatalogDoc
    {
        /// <summary><c>template</c>, never <c>source</c>: the bridge's PUT route lifts a top-level source into the
        /// artefact's pointer, and the catalogue would lose it (spec 2026-09-25-standards-4b decision 4).</summary>
        [JsonPropertyName("template")] public CatalogTemplate Template { get; set; }
        [JsonPropertyName("types")]    public List<CatalogEntry> Types { get; set; } = new List<CatalogEntry>();
    }
```

Replace lines 138-187 (the class head, `Load`, `Candidates`, `ReadJson`), which read:

```csharp
    public sealed class GuidelineMatcher
    {
        private readonly GuidelineDoc _doc;
        private readonly List<CatalogEntry> _catalog;

        public bool HasGuideline => _doc?.Elements != null && _doc.Elements.Count > 0;
        public bool HasCatalog => _catalog != null && _catalog.Count > 0;
        public string Standard => _doc?.Standard ?? "(no guideline)";
        public List<GuidelineViewStandard> Views => _doc?.Views;
        public GuidelineViewNaming ViewNaming => _doc?.ViewNaming;
        public GuidelineGraphics Graphics => _doc?.Graphics;

        private GuidelineMatcher(GuidelineDoc doc, List<CatalogEntry> catalog)
        {
            _doc = doc ?? new GuidelineDoc();
            _catalog = catalog ?? new List<CatalogEntry>();
        }

        /// <summary>Load from explicit paths, else %AppData%\Sentinel\, else the shipped Resources copy.
        /// Never throws — a missing or malformed guideline degrades to "no guideline", which leaves
        /// GhostBuilder exactly as it was before, rather than breaking a build.</summary>
        public static GuidelineMatcher Load(string guidelinePath = null, string catalogPath = null)
        {
            var doc = ReadJson<GuidelineDoc>(Candidates(guidelinePath, "bds-guideline.json"));
            var cat = ReadJson<CatalogDoc>(Candidates(catalogPath, "type-catalog.json"));
            return new GuidelineMatcher(doc, cat?.Types);
        }

        private static IEnumerable<string> Candidates(string explicitPath, string fileName)
        {
            if (!string.IsNullOrWhiteSpace(explicitPath)) yield return explicitPath;
            yield return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", fileName);
            string dll = Path.GetDirectoryName(typeof(GuidelineMatcher).Assembly.Location);
            if (!string.IsNullOrEmpty(dll)) yield return Path.Combine(dll, "Resources", fileName);
        }

        private static T ReadJson<T>(IEnumerable<string> paths) where T : class
        {
            foreach (string p in paths)
            {
                try
                {
                    if (!string.IsNullOrWhiteSpace(p) && File.Exists(p))
                        return JsonSerializer.Deserialize<T>(File.ReadAllText(p));
                }
                catch (Exception) { /* corrupt file — try the next candidate */ }
            }
            return null;
        }
```

with:

```csharp
    public sealed class GuidelineMatcher
    {
        private readonly GuidelineDoc _doc;
        private readonly List<CatalogEntry> _catalog;
        private readonly CatalogTemplate _template;

        public bool HasGuideline => _doc?.Elements != null && _doc.Elements.Count > 0;
        public bool HasCatalog => _catalog != null && _catalog.Count > 0;
        public string Standard => _doc?.Standard ?? "(no guideline)";
        public List<GuidelineViewStandard> Views => _doc?.Views;
        public GuidelineViewNaming ViewNaming => _doc?.ViewNaming;
        public GuidelineGraphics Graphics => _doc?.Graphics;

        /// <summary>What the catalogue check judges by: the type_catalog artefact's label ("type_catalog@1 · office ·
        /// 3f2a9c…", or "none — not installed for &lt;key&gt; or its office"). GhostStandards sets it; every gap text
        /// names it, so a reviewer sees WHICH catalogue called a type missing (F54).</summary>
        public string CatalogLabel { get; set; } = "type_catalog (unlabelled)";

        /// <summary>The template the catalogue was harvested from (its <c>template.title</c>), or null.</summary>
        public string TemplateTitle => _template?.Title;

        private GuidelineMatcher(GuidelineDoc doc, List<CatalogEntry> catalog, CatalogTemplate template)
        {
            _doc = doc ?? new GuidelineDoc();
            _catalog = catalog ?? new List<CatalogEntry>();
            _template = template;
        }

        /// <summary>
        /// The guideline@n and type_catalog@n bodies (the raw artefact JSON; null = none installed) → the matcher.
        /// Each body is checked by the bridge validator's rules (artefact-store.mjs validateArtefact; spec
        /// 2026-09-25-standards-4b decision 4) before it is read, and one that fails is left out with
        /// <paramref name="guidelineError"/> / <paramref name="catalogError"/> naming the field — never a partial
        /// standard, never a file on the machine or beside the DLL. Always returns a matcher (HasGuideline and
        /// HasCatalog say what it holds); never throws.
        /// </summary>
        public static GuidelineMatcher FromBodies(string guidelineJson, string catalogJson,
                                                  out string guidelineError, out string catalogError)
        {
            var doc = Read<GuidelineDoc>(guidelineJson, CheckGuideline, out guidelineError);
            var cat = Read<CatalogDoc>(catalogJson, CheckCatalog, out catalogError);
            return new GuidelineMatcher(doc, cat?.Types, cat?.Template);
        }

        /// <summary>How placement reports a wall it could not type: "gap: &lt;what&gt; — &lt;why&gt; (type_catalog:
        /// &lt;label&gt;)", naming the catalogue in force.</summary>
        public string Gap(string what, string why) => "gap: " + what + " — " + why + " (type_catalog: " + CatalogLabel + ")";

        // ---- reading a body --------------------------------------------------------------------------

        private const int MaxCatalogTypes = 20000; // = the bridge's MAX_CATALOG_TYPES (artefact-store.mjs)

        private static T Read<T>(string json, Action<JsonElement> check, out string error) where T : class
        {
            error = null;
            if (json == null) return null; // none installed: not an error
            try
            {
                if (string.IsNullOrWhiteSpace(json)) throw new InvalidDataException("the body is empty");
                using (var d = JsonDocument.Parse(json))
                {
                    var b = d.RootElement;
                    if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
                    if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");
                    check(b);
                }
                return JsonSerializer.Deserialize<T>(json);
            }
            catch (Exception ex) { error = ex.Message; return null; }
        }

        // guideline@n as the bridge validates it: what Resolve dereferences (elements[].rules[].when/use.family).
        private static void CheckGuideline(JsonElement b)
        {
            if (!Filled(b, "standard")) throw Bad("standard", "must be a non-empty string");
            if (!b.TryGetProperty("elements", out var els) || els.ValueKind != JsonValueKind.Array || els.GetArrayLength() == 0)
                throw Bad("elements", "must be a non-empty array");
            int i = 0;
            foreach (var e in els.EnumerateArray())
            {
                string at = "elements[" + i++ + "]";
                if (e.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                if (!Filled(e, "category")) throw Bad(at + ".category", "must be a non-empty string");
                if (!e.TryGetProperty("rules", out var rules) || rules.ValueKind != JsonValueKind.Array) throw Bad(at + ".rules", "must be an array");
                int j = 0;
                foreach (var r in rules.EnumerateArray())
                {
                    string rat = at + ".rules[" + j++ + "]";
                    if (r.ValueKind != JsonValueKind.Object) throw Bad(rat, "must be an object");
                    if (!r.TryGetProperty("when", out var w) || w.ValueKind != JsonValueKind.Object) throw Bad(rat + ".when", "must be an object");
                    if (!r.TryGetProperty("use", out var u) || u.ValueKind != JsonValueKind.Object || !Filled(u, "family"))
                        throw Bad(rat + ".use.family", "must be a non-empty string");
                }
                if (Present(e, "default", out var def) && !(def.ValueKind == JsonValueKind.Object && Filled(def, "family")))
                    throw Bad(at + ".default.family", "must be a non-empty string");
            }
            if (Present(b, "views", out var views) && views.ValueKind != JsonValueKind.Array) throw Bad("views", "must be an array");
            if (Present(b, "viewNaming", out var vn) && vn.ValueKind != JsonValueKind.Object) throw Bad("viewNaming", "must be an object");
        }

        // type_catalog@n as the bridge validates it (the office-snapshot row shape, template instead of source).
        private static void CheckCatalog(JsonElement b)
        {
            if (!b.TryGetProperty("types", out var types) || types.ValueKind != JsonValueKind.Array || types.GetArrayLength() == 0)
                throw Bad("types", "must be a non-empty array");
            if (types.GetArrayLength() > MaxCatalogTypes)
                throw Bad("types", "must hold at most " + MaxCatalogTypes + " entries (has " + types.GetArrayLength() + ")");
            int i = 0;
            foreach (var t in types.EnumerateArray())
            {
                string at = "types[" + i++ + "]";
                if (t.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                if (!Filled(t, "category")) throw Bad(at + ".category", "must be a non-empty string");
                if (!Filled(t, "type")) throw Bad(at + ".type", "must be a non-empty string");
                if (Present(t, "family", out var fam) && fam.ValueKind != JsonValueKind.String) throw Bad(at + ".family", "must be a string");
                if (Present(t, "system", out var sys) && sys.ValueKind != JsonValueKind.True && sys.ValueKind != JsonValueKind.False)
                    throw Bad(at + ".system", "must be true or false");
                if (Present(t, "width_mm", out var w) && w.ValueKind != JsonValueKind.Number) throw Bad(at + ".width_mm", "must be a number or null");
                if (Present(t, "height_mm", out var h) && h.ValueKind != JsonValueKind.Number) throw Bad(at + ".height_mm", "must be a number or null");
            }
            if (Present(b, "template", out var tpl))
            {
                if (tpl.ValueKind != JsonValueKind.Object) throw Bad("template", "must be an object {title, path?, extracted_at?}");
                if (!Filled(tpl, "title")) throw Bad("template.title", "must be a non-empty string");
                if (Present(tpl, "path", out var p) && p.ValueKind != JsonValueKind.String) throw Bad("template.path", "must be a string");
                if (Present(tpl, "extracted_at", out var x) && x.ValueKind != JsonValueKind.String) throw Bad("template.extracted_at", "must be a string");
            }
            if (Present(b, "view_templates", out var vt) && vt.ValueKind != JsonValueKind.Array) throw Bad("view_templates", "must be an array");
        }

        private static InvalidDataException Bad(string path, string want) => new InvalidDataException(path + " " + want);

        // Optional = absent or null, as the bridge reads it.
        private static bool Present(JsonElement o, string name, out JsonElement v) =>
            o.TryGetProperty(name, out v) && v.ValueKind != JsonValueKind.Null;

        // Blank as the bridge's filled() reads it: char.IsWhiteSpace plus U+FEFF (as DeliveryContract does).
        private static bool Filled(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String
            && v.GetString().Any(ch => !char.IsWhiteSpace(ch) && ch != '\uFEFF');
```

Replace lines 276-297 (`WithCatalogCheck` and its comment), which read:

```csharp
        /// <summary>
        /// Verify the answer against the office's own template. This is the guard that makes the original
        /// mistake impossible: a guideline written from a document named a type nobody had, and the
        /// builder would have provisioned an invented type on first run. A type the template lacks comes
        /// back at confidence 0 with the real alternatives listed, so the gate asks a human.
        /// </summary>
        private GuidelineResolution WithCatalogCheck(GuidelineResolution r, GuidelineInput input, string pattern)
        {
            if (!HasCatalog || string.IsNullOrWhiteSpace(r.Type)) return r;

            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type)
                                          && Norm(c.Category) == Norm(input.Category));
            if (present) return r;

            r.Available = pattern == null ? new List<string>() : PatternOptions(pattern, input.Category);
            r.Confidence = 0;
            r.Why = "\"" + r.Type + "\" is not in this office's template. " +
                    (r.Available.Count > 0
                        ? "Available: " + string.Join(", ", r.Available) + "."
                        : "No comparable type found — the office standard may need this type added.");
            return r;
        }
```

with:

```csharp
        /// <summary>
        /// Verify the answer against the installed type catalogue (type_catalog@n, the office template's
        /// harvest). This is the guard that makes the original mistake impossible: a guideline written from a
        /// document named a type nobody had, and the builder would have provisioned an invented type on first
        /// run. A type the catalogue lacks comes back at confidence 0 with the real alternatives listed and the
        /// catalogue named (<see cref="CatalogLabel"/>), so the gate asks a human. No catalogue → unchecked here;
        /// placement then checks the type against the open document only, and says so.
        /// </summary>
        private GuidelineResolution WithCatalogCheck(GuidelineResolution r, GuidelineInput input, string pattern)
        {
            if (!HasCatalog || string.IsNullOrWhiteSpace(r.Type)) return r;

            bool present = _catalog.Any(c => Norm(c.Type) == Norm(r.Type)
                                          && Norm(c.Category) == Norm(input.Category));
            if (present) return r;

            r.Available = pattern == null ? new List<string>() : PatternOptions(pattern, input.Category);
            r.Confidence = 0;
            r.Why = "\"" + r.Type + "\" is not in " + CatalogLabel +
                    (TemplateTitle == null ? "" : " (template " + TemplateTitle + ")") + ". " +
                    (r.Available.Count > 0
                        ? "Available: " + string.Join(", ", r.Available) + "."
                        : "No comparable type in it — the office standard may need this type added.");
            return r;
        }
```

`using System.IO;` stays (`InvalidDataException`); nothing in the file reads a file any more. Everything below `WithCatalogCheck` (`PatternOptions`, `ValidateAgainstCatalog`) is unchanged — the four C#/TS divergences are out of scope (spec "Out of scope").

- [ ] **Step 4: `GhostStandards.ParseGuideline` — the resolved bodies become the matcher, or none naming why**

In `SentinelAddin/GhostBuilder/GhostStandards.cs` replace Task 1's stub, which reads:

```csharp
    /// <summary>The guideline and catalogue as resolved → the matcher Ghost Builder, Photo Massing and Annotate build
    /// with. Task 3 reads the bodies (GuidelineMatcher.FromBodies); until then there is no matcher.</summary>
    internal static (GuidelineMatcher? Matcher, ResolvedArtefact Guideline, ResolvedArtefact Catalog) ParseGuideline(
        ResolvedArtefact guideline, ResolvedArtefact catalog) => (null, guideline, catalog);
```

with:

```csharp
    /// <summary>The guideline and catalogue as resolved → the matcher Ghost Builder, Photo Massing and Annotate build
    /// with — always one: with none installed it has no guideline and no catalogue. A body the matcher cannot use is none
    /// naming the artefact and the field ("guideline@1 · office · … did not parse: elements must be a non-empty array"),
    /// the DeliveryContract.FromResolved pattern: never a partial standard, never a file instead. The catalogue's label
    /// goes on the matcher, so every gap text names the catalogue in force. Pure; tools/ghost-standards-check drives it.</summary>
    internal static (GuidelineMatcher Matcher, ResolvedArtefact Guideline, ResolvedArtefact Catalog) ParseGuideline(
        ResolvedArtefact guideline, ResolvedArtefact catalog)
    {
        var m = GuidelineMatcher.FromBodies(guideline.Origin == "none" ? null : guideline.BodyJson ?? "",
                                            catalog.Origin == "none" ? null : catalog.BodyJson ?? "",
                                            out var guidelineError, out var catalogError);
        if (guidelineError != null) guideline = ArtefactClient.None("guideline", $"{guideline.Label} did not parse: {guidelineError}");
        if (catalogError != null) catalog = ArtefactClient.None("type_catalog", $"{catalog.Label} did not parse: {catalogError}");
        m.CatalogLabel = catalog.Label;
        return (m, guideline, catalog);
    }
```

- [ ] **Step 5: Build Office System exports the catalogue; nothing writes the machine file**

Create `SentinelAddin/Standards/TypeCatalogExport.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Standards;

/// <summary>
/// Build Office System's harvest as a type_catalog@n body (cohesion phase 4b-2): written to
/// %AppData%\Sentinel\exports\type-catalog-&lt;template&gt;.json for a lead to install on the office with
/// <c>artefact-import --kind type_catalog</c>. An EXPORT only — the add-in never reads it back (Revit reads the
/// catalogue installed on the document's project or its office), and it replaces the one machine-global catalogue
/// file every Build overwrote (F54). The template travels as <c>template</c>, never <c>source</c>: the bridge's PUT
/// route lifts a top-level source into the artefact's pointer and the catalogue would lose it. Pure — no Revit —
/// so tools/ghost-standards-check writes one and reads it back as the add-in would.
/// </summary>
public static class TypeCatalogExport
{
    /// <summary>"type-catalog-&lt;title&gt;.json": every run of characters other than letters, digits, '.', '_' and
    /// '-' becomes one '_' (spaces and brackets too, so the printed install command needs no escaping).</summary>
    public static string FileName(string templateTitle)
    {
        string safe = Regex.Replace(templateTitle ?? "", @"[^A-Za-z0-9._-]+", "_").Trim('_', '.');
        return "type-catalog-" + (safe.Length == 0 ? "untitled" : safe) + ".json";
    }

    /// <summary>The type_catalog@n body: template {title, path, extracted_at}, count, types, view_templates (the
    /// guideline's views section names view templates, so one harvest supplies both).</summary>
    public static string Json(string templateTitle, string templatePath, DateTimeOffset extractedAt,
                              List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates) =>
        JsonSerializer.Serialize(new
        {
            template = new { title = templateTitle, path = templatePath ?? "", extracted_at = extractedAt.ToString("o") },
            count = types.Count,
            types,
            view_templates = viewTemplates,
        }, new JsonSerializerOptions { WriteIndented = true });

    /// <summary>Write the export into <paramref name="exportsDir"/> (created when absent) and return its path.
    /// Throws on an I/O failure; the caller says so.</summary>
    public static string Write(string exportsDir, string templateTitle, string templatePath, DateTimeOffset extractedAt,
                               List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates)
    {
        Directory.CreateDirectory(exportsDir);
        string path = Path.Combine(exportsDir, FileName(templateTitle));
        File.WriteAllText(path, Json(templateTitle, templatePath, extractedAt, types, viewTemplates));
        return path;
    }

    /// <summary>What Build Office System says after the export: where it is and how to install it on the office.</summary>
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}\n\n" +
        "Install it on the office (from WebApp):\n" +
        $"node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog\n\n" +
        "<office> is the office's web project key. Ghost Builder and Photo Massing read the type catalogue " +
        "installed on the project or its office — never this file.";
}
```

In `SentinelAddin/Commands.Standards.cs` replace lines 35-79 (the rest of `BuildOfficeSystemCommand`: `Execute` from the extraction, and `WriteTypeCatalog`), which read:

```csharp
        // Read-only extraction, up front on the API thread.
        StandardsPack pack = GoldenModelExtractor.Extract(doc);

        // Write the TYPE CATALOGUE out unconditionally, before the review window opens. It is reference
        // material for authoring the Office Modelling Guideline — not something you tick and build — and
        // the review window only ever emits the ticked subset, so routing it through there would drop it.
        // One known path, overwritten each run, so "re-extract and re-read" is the whole workflow.
        string? catalogPath = WriteTypeCatalog(pack, doc);

        StandardsReview.Show(uiapp, pack, sourceLabel: doc.Title, buildTarget: doc.Title);
        if (catalogPath != null)
            TaskDialog.Show("Sentinel — Office System",
                $"Type catalogue exported ({pack.Provision.TypeCatalog.Count} types from this template):\n\n{catalogPath}\n\n" +
                "This is the list of families and types the Modelling Guideline is allowed to name.");
        return Result.Succeeded;
    }

    /// <summary>Write the harvested type catalogue to %AppData%/Sentinel/type-catalog.json. Never throws:
    /// a read-only or missing folder must not sink an otherwise-successful extraction.</summary>
    private static string? WriteTypeCatalog(StandardsPack pack, Document doc)
    {
        try
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel");
            System.IO.Directory.CreateDirectory(dir);
            string path = System.IO.Path.Combine(dir, "type-catalog.json");
            var payload = new
            {
                source = doc.Title,
                path = doc.PathName,
                extracted_at = DateTimeOffset.Now.ToString("o"),
                count = pack.Provision.TypeCatalog.Count,
                types = pack.Provision.TypeCatalog,
                // The guideline's view section names these; exporting them here means ONE run supplies
                // everything the guideline needs instead of two.
                view_templates = pack.Provision.ViewTemplates,
            };
            System.IO.File.WriteAllText(path, System.Text.Json.JsonSerializer.Serialize(
                payload, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            return path;
        }
        catch { return null; }
    }
}
```

with:

```csharp
        // Read-only extraction, up front on the API thread.
        StandardsPack pack = GoldenModelExtractor.Extract(doc);

        // Export the TYPE CATALOGUE before the review window opens: it is reference material, not something you
        // tick and build, and the window only ever emits the ticked subset. An EXPORT, not a machine file: Revit
        // reads the type_catalog@n installed on the document's project or its office and never reads this back
        // (cohesion phase 4b-2, F54); a lead installs it on the office with the command the dialog prints.
        string? catalogPath = null, exportError = null;
        try
        {
            catalogPath = TypeCatalogExport.Write(
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "exports"),
                doc.Title, doc.PathName, DateTimeOffset.Now, pack.Provision.TypeCatalog, pack.Provision.ViewTemplates);
        }
        catch (Exception ex) { exportError = ex.Message; } // a read-only folder must not sink the extraction

        StandardsReview.Show(uiapp, pack, sourceLabel: doc.Title, buildTarget: doc.Title);
        TaskDialog.Show("Sentinel — Office System", catalogPath != null
            ? TypeCatalogExport.Message(pack.Provision.TypeCatalog.Count, doc.Title, catalogPath)
            : "The type catalogue could not be exported: " + exportError);
        return Result.Succeeded;
    }
}
```

(`Path` is `System.IO.Path` — the file already has `using System.IO;` and `using Sentinel.Standards;`.)

- [ ] **Step 6: `GhostTypeCreator` — no catalogue sibling in the document is a gap, never the first Basic wall**

In `SentinelAddin/GhostBuilder/GhostTypeCreator.cs` replace lines 10-12, which read:

```csharp
// This keeps the guarantee intact: a created type is still a real BDS build-up, named to the office's own
// convention, not a Revit default. It is the office's standard extended by one size, which is what a
// modeller would do by hand.
```

with:

```csharp
// This keeps the guarantee intact: a created type is still a real build-up — a sibling the type catalogue lists
// AND this document has — named to the office's own convention, never a Revit default and never a clone of an
// unrelated wall (F43: another office's type names were cloned onto the first Basic wall). No such sibling → no
// type; the caller reports the gap. It is the office's standard extended by one size, which is what a modeller
// would do by hand.
```

and lines 52-59, which read:

```csharp
            // Clone the NEAREST-thickness sibling so the new type inherits the closest real build-up.
            WallType baseType = NearestSibling(walls, siblingNames, thicknessMm)
                                ?? walls.FirstOrDefault(w => w.Kind == WallKind.Basic);
            if (baseType == null)
            {
                reason = "no Basic wall type to clone from";
                return null;
            }
```

with:

```csharp
            // Clone the NEAREST-thickness sibling so the new type inherits the closest real build-up. Only a sibling
            // the catalogue lists and this document has: any other Basic wall under the guideline's name would be one
            // office's type name on another's build-up (F43), so no sibling is a reported gap, never a guess.
            WallType baseType = NearestSibling(walls, siblingNames, thicknessMm);
            if (baseType == null)
            {
                reason = "no sibling type in this document";
                return null;
            }
```

(`CreateFloorType` and `CreateColumnType` keep their fallbacks: they have no callers, and wiring the floor/column guideline rules is out of scope.)

- [ ] **Step 7: `ElementPlacementFactory` — who typed each wall, and gaps that name the catalogue**

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` replace lines 36-39, which read:

```csharp
        // Optional Office Modelling Guideline. When present, a wall's TYPE is chosen from the measured
        // thickness (GhostWallPairer) via the office's own catalogue, instead of the one-guess-per-layer
        // family the mapping supplies. Null = the pre-guideline behaviour, unchanged.
        private readonly GuidelineMatcher _guideline;
```

with:

```csharp
        // The Office Modelling Guideline and type catalogue in force (guideline@n, type_catalog@n — GhostStandards).
        // With a guideline, a wall's TYPE is chosen from the measured thickness (GhostWallPairer) and checked against
        // the catalogue, instead of the one-guess-per-layer family the mapping supplies. Guideline none (HasGuideline
        // false) or null = the mapping's family, the pre-guideline behaviour — counted as such (WallsByMapping).
        private readonly GuidelineMatcher _guideline;
```

Replace lines 84-86, which read:

```csharp
        /// <summary>Names of wall types this build created — surfaced in the report so a human sees the
        /// office standard was extended, not just that walls were placed.</summary>
        public readonly List<string> CreatedTypes = new List<string>();
```

with:

```csharp
        /// <summary>Names of wall types this build created — surfaced in the report so a human sees the
        /// office standard was extended, not just that walls were placed.</summary>
        public readonly List<string> CreatedTypes = new List<string>();

        /// <summary>Who typed each wall element — the build summary's three lines: the guideline; the layer mapping
        /// (guideline none, or no measured thickness); nobody — a gap reported as a warning, or a massing placeholder
        /// noted for retyping. A wall skipped for having no geometry is in none of them.</summary>
        public int WallsByGuideline, WallsByMapping, WallGaps;
```

Replace lines 121-201 (`ResolveWallType` and the head of `PlaceWall`), which read:

```csharp
        /// <summary>
        /// Choose the wall TYPE. If a guideline is loaded and the wall has a measured thickness, the
        /// office's own type wins over the mapping's single-guess family. A guideline GAP (a measured
        /// thickness the office template has no type for) returns null with a reviewer-facing reason —
        /// the wall is then skipped, never built with an invented type or snapped to the wrong size.
        /// </summary>
        private string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason)
        {
            gapReason = null;
            if (_guideline == null || !_guideline.HasGuideline || el.ThicknessMm <= 0)
                return map.BdsFamilyType ?? map.BdsFamily; // pre-guideline behaviour

            // Discipline is the layer's first token: A-WALL-EXT -> "A", S-WALL -> "S".
            string disc = (el.CadLayer ?? "").Split('-', '_').FirstOrDefault();
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
                Level = _level.Name,
            });

            // The catalogue check reads %AppData%\Sentinel\type-catalog.json, harvested from whatever model was
            // last used as the golden model — on the pilot's own template it said the pilot's type was missing
            // because the catalogue came from the Aster tower (simulation 3.9, F54). The OPEN document is the
            // truth: if it has the type, use it.
            if (res.Confidence <= 0 && !string.IsNullOrWhiteSpace(res.Type) && _wallTypes.ContainsKey(res.Type))
                return res.Type;

            if (res.Confidence <= 0)
            {
                // A gap is a "make it", not a "give up": clone the office's nearest real build-up and
                // resize it to the measured thickness, so the type is still a BDS assembly named to the
                // office convention. Only if creation genuinely can't proceed do we fall back to the gap.
                if (!string.IsNullOrWhiteSpace(res.Type) && res.Available != null && res.Available.Count > 0)
                {
                    var made = GhostTypeCreator.CreateWallType(
                        _doc, res.Type, el.ThicknessMm, res.Available, out string createReason);
                    if (made != null)
                    {
                        if (!_createdWallTypes.ContainsKey(made.Name))
                        {
                            _createdWallTypes[made.Name] = made;
                            CreatedTypes.Add($"{made.Name} (from a {el.ThicknessMm:0} mm wall on '{el.CadLayer}')");
                        }
                        return made.Name;
                    }
                    gapReason = $"{res.Why} Tried to create it and couldn't: {createReason}.";
                    return null;
                }
                gapReason = res.Why ?? $"No office type for a {el.ThicknessMm:0} mm wall on '{el.CadLayer}'.";
                return null;
            }
            return res.Type ?? map.BdsFamilyType ?? map.BdsFamily;
        }

        // ---- Walls: stable API 2021-2027, no #if ----
        private Outcome PlaceWall(GhostElement el, string wanted, LayerMapping map, out string warning)
        {
            warning = null;

            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason);
            if (gapReason != null && _placeholderTypes)
            {
                var ph = DefaultType(ElementTypeGroup.WallType, _wallTypes);
                if (ph != null)
                {
                    Notes.Add($"Placeholder wall type '{ph.Name}' used for {el.ThicknessMm:0} mm walls on '{el.CadLayer}' — {gapReason} Retype before issue.");
                    resolved = ph.Name; gapReason = null;
                    if (!_wallTypes.ContainsKey(ph.Name)) _createdWallTypes[ph.Name] = ph;
                }
            }
            if (gapReason != null)
            {
                warning = $"Wall on '{el.CadLayer}': {gapReason}";
                return Outcome.SkippedUnknownType;
            }
            wanted = resolved ?? wanted;
```

with:

```csharp
        /// <summary>
        /// Choose the wall TYPE and say who chose it (<paramref name="typedBy"/>: "guideline" | "mapping"). With a
        /// guideline and a measured thickness the office's own type wins over the mapping's single-guess family; with
        /// guideline none, or no measured thickness, it is the mapping's (the pre-guideline behaviour). The OPEN
        /// document decides presence (F54). A GAP — no type the office's standards stand behind — returns null with a
        /// reviewer-facing reason naming the type catalogue in force; the wall is then skipped (massing: placed on a
        /// named placeholder), never built with an invented type, an unrelated clone, or the wrong size.
        /// </summary>
        private string ResolveWallType(GhostElement el, LayerMapping map, out string gapReason, out string typedBy)
        {
            gapReason = null;
            typedBy = "mapping";
            bool guided = _guideline != null && _guideline.HasGuideline;
            if (!guided || el.ThicknessMm <= 0)
            {
                string mapped = map.BdsFamilyType ?? map.BdsFamily; // pre-guideline behaviour
                if (mapped == null)
                    gapReason = Gap($"{el.ThicknessMm:0} mm wall on '{el.CadLayer}'",
                        (guided ? "no measured thickness to choose a guideline type" : "guideline: none")
                        + ", and the layer mapping names no wall type");
                return mapped;
            }

            typedBy = "guideline";
            // Discipline is the layer's first token: A-WALL-EXT -> "A", S-WALL -> "S".
            string disc = (el.CadLayer ?? "").Split('-', '_').FirstOrDefault();
            var res = _guideline.Resolve(new GuidelineInput
            {
                Category = "Walls",
                Layer = el.CadLayer,
                Discipline = disc,
                ThicknessMm = el.ThicknessMm,
                Level = _level.Name,
            });

            if (!_guideline.HasCatalog)
                Notes.Add($"Wall types were not checked against a type catalogue (type_catalog: {_guideline.CatalogLabel}) — only against this document.");

            // The OPEN document is the truth (F54): if it has the type — or this build created it — use it, whatever
            // the catalogue says (on the pilot's own template, another office's catalogue once called it missing).
            if (!string.IsNullOrWhiteSpace(res.Type)
                && (_wallTypes.ContainsKey(res.Type) || _createdWallTypes.ContainsKey(res.Type)))
                return res.Type;

            if (!string.IsNullOrWhiteSpace(res.Type) && !_guideline.HasCatalog)
            {
                gapReason = Gap(res.Type, "not in this document; types checked against this document only");
                return null;
            }

            if (res.Confidence <= 0)
            {
                // A gap is a "make it", not a "give up": clone the nearest sibling the catalogue lists AND this
                // document has, resized to the measured thickness and named to the office convention. No such
                // sibling, or a resize that fails, is the gap — reported with the catalogue's label.
                if (!string.IsNullOrWhiteSpace(res.Type) && res.Available != null && res.Available.Count > 0)
                {
                    var made = GhostTypeCreator.CreateWallType(
                        _doc, res.Type, el.ThicknessMm, res.Available, out string createReason);
                    if (made != null)
                    {
                        if (!_createdWallTypes.ContainsKey(made.Name))
                        {
                            _createdWallTypes[made.Name] = made;
                            CreatedTypes.Add($"{made.Name} (from a {el.ThicknessMm:0} mm wall on '{el.CadLayer}')");
                        }
                        return made.Name;
                    }
                    gapReason = Gap(res.Type, createReason);
                    return null;
                }
                gapReason = res.Why ?? Gap($"{el.ThicknessMm:0} mm wall on '{el.CadLayer}'", "the guideline names no wall type for it");
                return null;
            }
            if (res.Type != null) return res.Type;
            typedBy = "mapping"; // a guideline rule with no type or pattern: the mapping's family, as before
            return map.BdsFamilyType ?? map.BdsFamily;
        }

        // A gap names the type catalogue in force (GuidelineMatcher.Gap); with no matcher at all there is none.
        private string Gap(string what, string why) =>
            _guideline?.Gap(what, why) ?? $"gap: {what} — {why} (type_catalog: not loaded)";

        // ---- Walls: stable API 2021-2027, no #if ----
        private Outcome PlaceWall(GhostElement el, string wanted, LayerMapping map, out string warning)
        {
            warning = null;

            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason, out string typedBy);
            if (gapReason != null && _placeholderTypes)
            {
                var ph = DefaultType(ElementTypeGroup.WallType, _wallTypes);
                if (ph != null)
                {
                    Notes.Add($"Placeholder wall type '{ph.Name}' used for {el.ThicknessMm:0} mm walls on '{el.CadLayer}' — {gapReason.TrimEnd('.')}. Retype before issue.");
                    resolved = ph.Name; gapReason = null;
                    typedBy = "placeholder";
                    WallGaps++; // placed, but typed by nobody: reported for retyping
                    if (!_wallTypes.ContainsKey(ph.Name)) _createdWallTypes[ph.Name] = ph;
                }
            }
            if (gapReason != null)
            {
                WallGaps++;
                warning = $"Wall on '{el.CadLayer}': {gapReason}";
                return Outcome.SkippedUnknownType;
            }
            wanted = resolved ?? wanted;
```

Replace lines 215-220, which read:

```csharp
            if (wanted == null
                || (!_wallTypes.TryGetValue(wanted, out WallType wt) && !_createdWallTypes.TryGetValue(wanted, out wt)))
            {
                warning = $"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }
```

with:

```csharp
            if (wanted == null
                || (!_wallTypes.TryGetValue(wanted, out WallType wt) && !_createdWallTypes.TryGetValue(wanted, out wt)))
            {
                WallGaps++;
                warning = $"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }
```

Replace lines 235-238, which read:

```csharp
                placed++;
            }
            return placed > 0 ? Outcome.Placed : Outcome.SkippedNoGeometry;
        }
```

with:

```csharp
                placed++;
            }
            if (placed == 0) return Outcome.SkippedNoGeometry;
            if (typedBy == "guideline") WallsByGuideline++;
            else if (typedBy == "mapping") WallsByMapping++;
            return Outcome.Placed;
        }
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` replace lines 323-325, which read:

```csharp
            /// <summary>Types this build created to fill a guideline gap (office standard extended by a size).</summary>
            public readonly List<string> CreatedTypes = new List<string>();
        }
```

with:

```csharp
            /// <summary>Types this build created to fill a guideline gap (office standard extended by a size).</summary>
            public readonly List<string> CreatedTypes = new List<string>();
            /// <summary>Wall elements typed by the guideline, by the layer mapping (guideline none, or no measured
            /// thickness), or left as a reported gap (skipped, or a massing placeholder) — ElementPlacementFactory's tallies.</summary>
            public int WallsByGuideline, WallsByMapping, WallGaps;
        }
```

and lines 388-390, which read:

```csharp
            report.CreatedTypes.AddRange(factory.CreatedTypes);

            return report;
```

with:

```csharp
            report.CreatedTypes.AddRange(factory.CreatedTypes);
            report.WallsByGuideline = factory.WallsByGuideline;
            report.WallsByMapping = factory.WallsByMapping;
            report.WallGaps = factory.WallGaps;

            return report;
```

Notes: the F54 rule is kept and widened — the open document's type wins at any confidence (before, only at confidence 0; at confidence > 0 the same type was returned anyway). A massing wall with guideline none used to reach `WallType '' not found` and be skipped; it is now a gap, so massing places the template's default type with the note naming `type_catalog: <label>` (the B7 "Photo Massing on Aster builds" row). `typedBy` is a local string, not a new type.

- [ ] **Step 8: keep `guideline-check`, `annotate-check` and `wallpair-check` compiling against `FromBodies`**

These three compile `GuidelineMatcher.cs`, and `Load` is gone. Only the API changes here; Task 4 moves `bds-guideline.json` to `demo/bds-pilot/` and swaps the path. Reading the files through `FromBodies` also makes them machine-independent: `Load("does-not-exist.json", …)` and `annotate-check`'s one-argument `Load` fell through to `%AppData%\Sentinel\type-catalog.json`.

In `tools/guideline-check/Check.cs` replace lines 20-35, which read:

```csharp
        // The REAL office files, loaded exactly as the add-in loads them.
        // Resolve from the SOURCE tree, not the working directory: `dotnet run --project` keeps the
        // shell's cwd, and a wrong path here silently falls through to the %AppData% copy — which is
        // how the first run "loaded a catalogue" while testing nothing.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !System.IO.Directory.Exists(System.IO.Path.Combine(root, "SentinelAddin")); i++)
            root = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, ".."));
        Console.WriteLine("  repo root: " + root);
        Console.WriteLine();

        var m = GuidelineMatcher.Load(
            System.IO.Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));

        Ok(m.HasGuideline, $"guideline loaded ({m.Standard})");
        Ok(m.HasCatalog, "type catalogue loaded");
```

with:

```csharp
        // The REAL office files, read as the add-in reads an installed guideline@n / type_catalog@n body
        // (GuidelineMatcher.FromBodies). Resolve from the SOURCE tree, not the working directory: `dotnet run
        // --project` keeps the shell's cwd. A wrong path throws here — there is no machine file to fall back to.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !System.IO.Directory.Exists(System.IO.Path.Combine(root, "SentinelAddin")); i++)
            root = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, ".."));
        Console.WriteLine("  repo root: " + root);
        Console.WriteLine();

        var m = GuidelineMatcher.FromBodies(
            System.IO.File.ReadAllText(System.IO.Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json")),
            System.IO.File.ReadAllText(System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json")),
            out string guidelineError, out string catalogError);
        m.CatalogLabel = "demo/bds-pilot/bds-type-catalog.json";

        Ok(m.HasGuideline, $"guideline loaded ({m.Standard})" + (guidelineError == null ? "" : " — " + guidelineError));
        Ok(m.HasCatalog, "type catalogue loaded" + (catalogError == null ? "" : " — " + catalogError));
```

Replace line 64, which reads:

```csharp
        Ok(gap.Why != null && gap.Why.Contains("not in this office's template"), "…and says why, in the reviewer's words");
```

with:

```csharp
        Ok(gap.Why != null && gap.Why.Contains("is not in demo/bds-pilot/bds-type-catalog.json"), "…and says why, naming the catalogue it checked");
```

Replace lines 70-73, which read:

```csharp
        // a missing guideline must degrade, not throw
        var none = GuidelineMatcher.Load("does-not-exist.json", "also-missing.json");
        Ok(!none.HasGuideline && none.Resolve(new GuidelineInput { Category = "Walls" }).Source == "none",
           "a missing/!swapped guideline degrades to 'no guideline' instead of throwing");
```

with:

```csharp
        // nothing installed must degrade, not throw — and never reach for a file on the machine
        var none = GuidelineMatcher.FromBodies(null, null, out string noneGuideline, out string noneCatalog);
        Ok(!none.HasGuideline && !none.HasCatalog && noneGuideline == null && noneCatalog == null
           && none.Resolve(new GuidelineInput { Category = "Walls" }).Source == "none",
           "no guideline installed → 'no guideline' (no error, no fallback file) instead of throwing");
```

In `tools/annotate-check/Check.cs` replace lines 44-46, which read:

```csharp
// the shipped BDS guideline parses with the new sections
var m = GuidelineMatcher.Load(Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"));
Check("BDS guideline loads", m.HasGuideline);
```

with:

```csharp
// the BDS pilot guideline parses with the new sections (read as an installed guideline@n body; no catalogue)
var m = GuidelineMatcher.FromBodies(File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json")),
                                    null, out string guidelineError, out _);
Check("BDS guideline loads" + (guidelineError == null ? "" : " — " + guidelineError), m.HasGuideline);
```

In `tools/wallpair-check/SampleRun.cs` replace lines 23-25, which read:

```csharp
        var g = GuidelineMatcher.Load(
            Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));
```

with:

```csharp
        var g = GuidelineMatcher.FromBodies(
            File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json")),
            File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json")),
            out _, out _);
        g.CatalogLabel = "demo/bds-pilot/bds-type-catalog.json";
```

- [ ] **Step 9: GREEN — the harnesses; the add-in build stays red until Task 4**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/ghost-standards-check
dotnet run --project tools/guideline-check
dotnet run --project tools/annotate-check
dotnet run --project tools/wallpair-check
dotnet run --project tools/wallpair-check -- sample
```

Expected (`ghost-standards-check`): Task 1's and Task 2's lines unchanged, then these 62, and a total 62 higher than after Task 2 (`N/N checks pass`):

```
  PASS  a guideline and a catalogue the bridge accepts are read
  PASS  standard, views and the catalogue's template.title read as written
  PASS  a type the catalogue has resolves at confidence 1
  PASS  nothing installed (null bodies) → no guideline, no catalogue, no error — no file is read instead
  PASS  no catalogue → the guideline's type is unchecked here (placement checks it against the document only)
  PASS  guideline: JSON null → the body is null
  PASS  guideline: an array → the body must be a JSON object
  PASS  guideline: an empty body → the body is empty
  PASS  guideline: broken JSON → none with the parser's message
  PASS  guideline: missing standard → standard must be a non-empty string
  PASS  guideline: a blank standard → standard must be a non-empty string
  PASS  guideline: missing elements → elements must be a non-empty array
  PASS  guideline: empty elements → elements must be a non-empty array
  PASS  guideline: an element that is not an object → elements[0] must be an object
  PASS  guideline: a blank category → elements[0].category must be a non-empty string
  PASS  guideline: an element without rules (Resolve dereferences them) → elements[0].rules must be an array
  PASS  guideline: a rule that is not an object → elements[0].rules[0] must be an object
  PASS  guideline: a rule without when → elements[0].rules[0].when must be an object
  PASS  guideline: a rule whose use names no family → elements[0].rules[0].use.family must be a non-empty string
  PASS  guideline: a default without a family → elements[0].default.family must be a non-empty string
  PASS  guideline: views not an array → views must be an array
  PASS  guideline: viewNaming not an object → viewNaming must be an object
  PASS  guideline: default and views null read as absent, as the bridge reads them
  PASS  guideline: a when.params value that is not text is none with the reader's message (the bridge does not check it)
  PASS  type_catalog: JSON null → the body is null
  PASS  type_catalog: a bare types array (the TS reader's shape) → the body must be a JSON object
  PASS  type_catalog: missing types → types must be a non-empty array
  PASS  type_catalog: empty types → types must be a non-empty array
  PASS  type_catalog: more types than the bridge stores → types must hold at most 20000 entries (has 20001)
  PASS  type_catalog: a row that is not an object → types[0] must be an object
  PASS  type_catalog: a blank category → types[0].category must be a non-empty string
  PASS  type_catalog: a row without a type → types[1].type must be a non-empty string
  PASS  type_catalog: a family that is not text → types[1].family must be a string
  PASS  type_catalog: system as text → types[0].system must be true or false
  PASS  type_catalog: width_mm as text → types[0].width_mm must be a number or null
  PASS  type_catalog: height_mm an array → types[0].height_mm must be a number or null
  PASS  type_catalog: template as a string (the harvest's old source shape) → template must be an object {title, path?, extracted_at?}
  PASS  type_catalog: a template without a title → template.title must be a non-empty string
  PASS  type_catalog: a template path that is not text → template.path must be a string
  PASS  type_catalog: view_templates not an array → view_templates must be an array
  PASS  type_catalog: a harvest's old top-level source is ignored, never read as the template
  PASS  SentinelAddin\Resources\bds-guideline.json parses: it installs as guideline@n
  PASS  demo\bds-pilot\bds-type-catalog.json parses: it installs as type_catalog@n
  PASS  installed guideline@1 and type_catalog@1 → the matcher, both labels kept, the catalogue's label on the matcher
  PASS  a guideline body the matcher cannot use is none, naming the artefact and the field; the catalogue stays
  PASS  a catalogue body the matcher cannot use is none, and the gap text names that none
  PASS  none stays none, with the client's reason — no file, no shipped profile
  PASS  an installed artefact with no body is none (the body is empty), never 'no guideline' unexplained
  PASS  a type the catalogue lacks drops to confidence 0 with the catalogue's siblings, smallest first
  PASS  the gap names the catalogue's label and template, not 'this office's template'
  PASS  GhostTypeCreator's no-sibling gap reads: gap: <type> — no sibling type in this document (type_catalog: <label>)
  PASS  no comparable type: the gap still names the catalogue it checked
  PASS  export name: type-catalog-<template>.json
  PASS  spaces and brackets become one '_' each run
  PASS  path characters never reach the file name; a blank title is 'untitled'
  PASS  the export is written to <Sentinel>\exports\type-catalog-<template>.json
  PASS  …and never to the machine-global type-catalog.json
  PASS  template {title, path, extracted_at}; no top-level source (the PUT route would lift it off)
  PASS  types keep system, width_mm (null when absent); view_templates travel with them
  PASS  the export parses as type_catalog@n — what the bridge will accept on install
  PASS  the dialog names the path and the install command
  PASS  no add-in source names the machine-global type-catalog.json
```

`guideline-check`:

```
GuidelineMatcher — C# port conformance (mirrors guideline-bds.test.ts)

  repo root: C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project

  PASS  guideline loaded (BDS Office Modelling Guideline v3)
  PASS  type catalogue loaded
  PASS  every name the guideline uses exists in the template
  PASS  external architectural 200 → CMU 200
  PASS  same layer, different measurement → different type
  PASS  structural wall layer (S-WALL) → concrete
  PASS  spec overrides the material, thickness untouched
  PASS  internal partitions default to gypsum
  PASS  a real DWG measurement (199.6) finds the 200 type
  PASS  no measurement → no type (a gap, not a default size)
  PASS  parameter name/value matching is case-insensitive
  PASS  a thickness with no matching type drops to confidence 0
  PASS  …and offers the real alternatives, smallest first
  PASS  …and says why, naming the catalogue it checked
  PASS  deterministic — 20 runs, one answer
  PASS  no guideline installed → 'no guideline' (no error, no fallback file) instead of throwing

16/16 checks pass
```

`annotate-check`:

```
PASS  2 plannable entries x 2 levels = 4
PASS  GA Plan Level 0 exists
PASS  name follows [STATUS]_[TYPE]_[LEVEL]
PASS  template carried
PASS  browser status resolved from statusPrefixes
PASS  sections skipped
PASS  no-prefix entries skipped
PASS  null views -> empty
PASS  no levels -> empty
PASS  BDS guideline loads
PASS  BDS views section deserialized
PASS  BDS GA Plan wipTemplate
PASS  BDS door tag family
ALL PASS
```

`wallpair-check`: `9/9 checks pass` (unchanged — it never touches the matcher). `wallpair-check -- sample`:

```
Sample run — real WallPairing + GuidelineMatcher on the double-line DXF

  guideline: BDS Office Modelling Guideline v3

  ✓ A-WALL-EXT   200 mm  →  BDS_EXT_ARC_CMU_200 mm
  ✓ A-WALL-EXT   200 mm  →  BDS_EXT_ARC_CMU_200 mm
  ✓ A-WALL-EXT   300 mm  →  BDS_EXT_ARC_CMU_300 mm
  ✓ A-WALL-EXT   200 mm  →  BDS_EXT_ARC_CMU_200 mm
  ⚠ A-WALL-EXT   275 mm  →  GAP: "BDS_EXT_ARC_CMU_275 mm" is not in demo/bds-pilot/bds-type-catalog.json. Available: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm, BDS_EXT_ARC_CMU_400 mm.
  ✓ A-WALL-INT   100 mm  →  BDS_INT_ARC_GYPS_100 mm
  ✓ S-WALL       250 mm  →  BDS_EXT_STR_CONC_250 mm

  6 walls resolve to a real BDS type · 1 reported as gaps (not invented)

SAMPLE OK — matches the designed expectation.
```

```bash
dotnet build tools/ghost-standards-check --no-incremental
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: the harness builds with 0 warnings. The add-in is **red**; this task adds exactly these 3 errors on both versions (warnings unchanged: 6 on 2024, 3 on 2025) — alongside any Task 2 left in `Commands.GhostBuilder.cs`, which Task 4 also removes:

```
SentinelAddin\Commands.Annotate.cs(26,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.GhostBuilder.cs(177,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.Massing.cs(42,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
```

No other file errors: `GuidelineMatcher.cs`, `GhostStandards.cs`, `GhostTypeCreator.cs`, `ElementPlacementFactory.cs`, `GhostBuilder_ExtractionAndPlacement.cs`, `TypeCatalogExport.cs` and `Commands.Standards.cs` compile on net48 and net8. Do **not** fix the three here — Task 4 rewrites those commands onto `GhostStandards` and quotes master's text. Do not push until Task 4's commit (CI builds the add-in on every push). (Verified on a scratch copy on 2026-09-25 — master plus an approximation of Task 1's `GhostStandards` stub and harness: the 62 checks pass, `guideline-check` 16/16, `annotate-check` ALL PASS, `wallpair-check` 9/9 and the sample OK, both add-in builds with exactly these 3 errors and warnings 6/3.)

- [ ] **Step 10: Commit**

```bash
git add SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/GhostBuilder/GhostStandards.cs SentinelAddin/GhostBuilder/GhostTypeCreator.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/Standards/TypeCatalogExport.cs SentinelAddin/Commands.Standards.cs tools/ghost-standards-check/GuidelineChecks.cs tools/ghost-standards-check/ghost-standards-check.csproj tools/ghost-standards-check/Check.cs tools/guideline-check/Check.cs tools/annotate-check/Check.cs tools/wallpair-check/SampleRun.cs
git commit -m "feat(revit): guideline@n and type_catalog@n from the project — GuidelineMatcher.FromBodies refuses what the bridge refuses and reads no file, a refused body is none naming the field, every wall-type gap names the catalogue in force, GhostTypeCreator reports a missing sibling instead of cloning the first Basic wall, the build counts walls typed by the guideline, the mapping or left as a gap; Build Office System exports %AppData%\\Sentinel\\exports\\type-catalog-<template>.json with template{} and prints the install command, never the machine-global catalogue

tools/ghost-standards-check +62 (FromBodies refusals per field, the none and did-not-parse labels, the gap texts, the export); guideline-check, annotate-check and wallpair-check read the fixtures through FromBodies and no longer fall through to %AppData%.
The add-in build is red until Task 4 rewires Commands.Annotate.cs:26, Commands.GhostBuilder.cs:177 and Commands.Massing.cs:42 (3 x CS0117 GuidelineMatcher.Load).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

A. Step 4 is replaced: Task 1 has no `ParseGuideline` stub. In `SentinelAddin/GhostBuilder/GhostStandards.cs`, as Task 2 left it, make two replacements.
(a) Replace
```
        public LayerRulesetMatcher Layers = LayerRulesetMatcher.HeuristicsOnly();
```
with
```
        public LayerRulesetMatcher Layers = LayerRulesetMatcher.HeuristicsOnly();

        /// <summary>The installed guideline@n and type_catalog@n as one matcher, never null: with none installed it has no
        /// guideline (HasGuideline false) and no catalogue (HasCatalog false). CatalogLabel names the catalogue in force.</summary>
        public GuidelineMatcher Guideline = GuidelineMatcher.FromBodies(null, null, out _, out _);
```
(b) Replace
```
                else { m.Sha = layers.Sha256; s.Layers = m; }
            }
            return s;
        }
```
with
```
                else { m.Sha = layers.Sha256; s.Layers = m; }
            }
            (s.Guideline, s.GuidelineSource, s.CatalogSource) = ParseGuideline(guideline, catalog);
            return s;
        }

        /// <summary>The guideline and catalogue as resolved -> the matcher Ghost Builder, Photo Massing and Annotate build
        /// with, always one: with none installed it has no guideline and no catalogue. A body the matcher cannot use is none
        /// naming the artefact and the field ("guideline@1 · office · … did not parse: elements must be a non-empty array"),
        /// the DeliveryContract.FromResolved pattern: never a partial standard, never a file instead. The catalogue's label
        /// goes on the matcher, so every gap text names the catalogue in force. Pure; tools/ghost-standards-check drives it.</summary>
        internal static (GuidelineMatcher Matcher, ResolvedArtefact Guideline, ResolvedArtefact Catalog) ParseGuideline(
            ResolvedArtefact guideline, ResolvedArtefact catalog)
        {
            var m = GuidelineMatcher.FromBodies(guideline.Origin == "none" ? null : guideline.BodyJson ?? "",
                                                catalog.Origin == "none" ? null : catalog.BodyJson ?? "",
                                                out var guidelineError, out var catalogError);
            if (guidelineError != null) guideline = ArtefactClient.None("guideline", $"{guideline.Label} did not parse: {guidelineError}");
            if (catalogError != null) catalog = ArtefactClient.None("type_catalog", $"{catalog.Label} did not parse: {catalogError}");
            m.CatalogLabel = catalog.Label;
            return (m, guideline, catalog);
        }
```
This introduces no new warnings on 2024 or 2025. A none, including "not needed by this command", is never parsed. `Guideline` is never null after `Load`.

B. Step 1, csproj: Task 1's harness does not compile `GuidelineMatcher.cs`, so the anchor line does not exist. In `tools/ghost-standards-check/ghost-standards-check.csproj`, insert directly after Task 2's line `    <Compile Include="..\..\SentinelAddin\GhostBuilder\LayerMapper.cs" />` these five lines:
```
    <!-- Task 3 (4b-2): the guideline and type-catalogue reader, Build Office System's export and the pack types it serialises. -->
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GuidelineMatcher.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\TypeCatalogExport.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\StandardsPack.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
```

C. Step 1, Check.cs: there is no `_root` in Task 1's `Check.cs`. The line inserted before `        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");` is `        GuidelineChecks.Run(RepoRoot(), Ok);` (`RepoRoot()` is in Task 2's `Layers.cs`).

D. Step 5, `TypeCatalogExport.Message`: use the spec's sentence. Its body becomes:
```
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}. " +
        $"Install it on the office: node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog.\n\n" +
        "Run it from WebApp; <office> is the office's web project key. Ghost Builder and Photo Massing read the type " +
        "catalogue installed on the project or its office — never this file.";
```
The harness check "the dialog names the path and the install command" still passes.

E. Step 9 expected output:
- `ghost-standards-check`: Task 1's and Task 2's 62 lines, then Task 3's 62 (no section header of their own), then `124/124 checks pass`.
- The harness builds with 0 warnings.
- The add-in build is red with exactly 6 errors on each version: Task 2's 3 (`Commands.GhostBuilder.cs(173,72)` CS0117, `(173,26)` CS7036, `(297,28)` CS7036) plus this task's 3 CS0117 (`Commands.Annotate.cs(26,42)`, `Commands.GhostBuilder.cs(177,42)`, `Commands.Massing.cs(42,42)`). Warnings stay 6 and 3.
- `guideline-check` 16/16, `annotate-check` ALL PASS (13 checks), `wallpair-check` 9/9 plus the sample OK — all verified with A–D applied.

F. Step 10's commit message line 3 becomes: "The add-in build is red until Task 4 (Task 2's 3 errors in Commands.GhostBuilder.cs plus this task's 3 x CS0117 GuidelineMatcher.Load in Commands.Annotate.cs:26, Commands.GhostBuilder.cs:177, Commands.Massing.cs:42)." and its harness count reads "tools/ghost-standards-check 124/124 (+62)".

---

### Task 4: Revit — Ghost Builder, Photo Massing and Annotate Views build with the project's `layers@n`, `guideline@n` and `type_catalog@n` and name them; Annotate refuses on none; the Ghost standard settings and the shipped BDS files are gone; the harnesses read `demo/bds-pilot/`

**Files:**
- Modify: `SentinelAddin/Commands.GhostBuilder.cs` (doc :16-24; phase 1 :163-201; review/placement callbacks :230-253; phase 2 head :255-259; review open :294-299; catches :301-314; release helpers + `Summarize` head :321-336)
- Modify: `SentinelAddin/Commands.Massing.cs` (doc :16-18; standards + orchestrator :41-70; `Summarize` head :98-102)
- Modify: `SentinelAddin/Commands.Annotate.cs` (usings :1-3; doc :12-15; resolve + refusal :25-36; no-plannable message :50; result :96-97)
- Modify: `SentinelAddin/Commands.Datum.cs` (:79, the "office layer standard" wording)
- Modify: `SentinelAddin/GhostBuilder/ViewPlanner.cs` (:54-57, `NothingToPlan`)
- Modify: `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` (counters :84-86; `PlaceWall` :183-200, :215-220, :237 — `ResolveWallType` :127-176 is Task 3's and is not touched here)
- Modify: `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` (`PlacementReport` :323-325; the factory → report copy :387-388)
- Modify: `SentinelAddin/UI/GhostReviewWindow.cs` (field :26-27; dock :103; `SetStandards` after :273)
- Modify: `SentinelAddin/App.cs` (tooltips :285, :289, :291, :293)
- Modify: `SentinelAddin/Engine/SettingsManager.cs` (:36-41, :46-52, :149-150, :157-167)
- Modify: `SentinelAddin/Sentinel.csproj` (:52-60)
- Move: `SentinelAddin/Resources/bds-guideline.json` → `demo/bds-pilot/bds-guideline.json`; `SentinelAddin/Resources/bds-layers.json` → `demo/bds-pilot/bds-layers.json` (replaces the older demo copy: the Resources copy is the one that ran — 13 more AIA ignore globs and more aliases, 5469bcc — and it passes the 4b-1 layers validator; `artefact-store.test.mjs:314` checks it once moved)
- Modify: `tools/guideline-check/Check.cs` (:20-35, :64, :70-73), `tools/annotate-check/Check.cs` (:44-46), `tools/wallpair-check/SampleRun.cs` (:23-25), `tools/ghost-p2-check/Check.cs` (:201-213)
- Modify: `WebApp/src/sentinel-core/guideline-bds.test.ts` (:8, :80), `WebApp/bridge/artefact-store.test.mjs` (:315, the 4b-1 seed line)
- Read, unchanged: `SentinelAddin/UI/SettingsDialog.xaml.cs:142-190` (never wrote the three `ghost_*` paths — nothing to remove; its machine save at :155-159 round-trips `SentinelSettings`, so the old keys drop out of `config.json` on the next machine-scope save); `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs:34-45` (the constructor only stores the document and a `GhostCadExtractor` that stores it too — safe to build off the API thread; `ExtractInputs` :56-64 stays on it) and :135-189 (`PlacePrepared` hands `_guideline` to `GhostPlacementEngine` at :175); `SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs:34` (`SetRequest(orchestrator, …)`); `SentinelAddin/Engine/ArtefactCache.cs:32` (`PathFor(key, kind)` = `%AppData%\Sentinel\cache\<key>\<kind>.json`, key sanitised); `SentinelAddin/Coordination/ArtefactClient.cs:139-142` (`None` → `Label` "none — <reason>"; an empty key answers "not bound — Sentinel ▸ Project Setup" before any request, :49); `SentinelAddin/Engine/ProjectContext.cs:44-45` (`For(doc)`, API thread); `SentinelAddin/Commands.IfcGate.cs:27-31` (the 4b-1 wait pattern `Task.Run(() => …Load(key)).GetAwaiter().GetResult()`); `SentinelAddin/GhostBuilder/MassingBuilder.cs:92-101` (the massing's mapping rows name no family, so with no guideline a wall has no type at all); `SentinelAddin/Sentinel.csproj:77-96` (DeployAddin copies `$(TargetDir)**\*.*` — a stale `bin\…\Resources\bds-*.json` would ship again).

**Interfaces:**
- Consumes (Task 1, pinned): `GhostStandards.Load(string key, bool layers = true, bool guideline = true, bool catalog = true)` — blocking, resolves in parallel, never throws, never leaves `Layers` or `Guideline` null (a none is `LayerRulesetMatcher.HeuristicsOnly()` / a `GuidelineMatcher` with `HasGuideline == false`); `GhostStandards.LayersSource`, `GuidelineSource`, `CatalogSource` (`ResolvedArtefact`: `Origin` bridge|cache|none, `Label`), `Layers`, `Guideline`, `Header` (`"Layers: " + … + " · Guideline: " + … + " · Type catalogue: " + …`). Namespace `Sentinel.GhostBuilder`.
- Consumes (Task 2): `LayerRulesetMatcher.FromBody(string? json, out string? error)`; `LayerRulesetMatcher.Load` deleted. **Not pinned:** `new LayerMapper(ILayerMapper llmFallback, string cachePath, LayerRulesetMatcher matcher)` with the named arguments `cachePath:` and `matcher:` kept from `LayerMapper.cs:57`, `matcher` required, the cache stamped with `matcher.Sha`, and `Dispose()` still only forwarding to the LLM (`LayerMapper.cs:222`). The caller passes the per-project path `ArtefactCache.PathFor(key, "dwg_mappings")` — exactly the spec's `%AppData%\Sentinel\cache\<key>\dwg_mappings.json`.
- Consumes (Task 3): `GuidelineMatcher.FromBodies(string? guidelineJson, string? catalogJson, out string? guidelineError, out string? catalogError)`; `GuidelineMatcher.CatalogLabel` (public, settable; the wall-gap `Why` contains it verbatim); `GuidelineMatcher.Load` deleted; `ResolveWallType` (:127-176) still reports a gap through its `gapReason` out-parameter.
- Produces:
  - `ElementPlacementFactory.WallsByGuideline, WallsByMapping, WallsPlaceholder, WallGaps` and the same four `int` fields on `GhostPlacementEngine.PlacementReport` (copied by the engine) — counted per drawn wall, as `Placed` is. Typed by the guideline = the guideline had the say (`HasGuideline` and a measured thickness, `ResolveWallType`'s own test at :130); a placeholder = a declared massing placeholder; a gap = skipped for want of a type (a guideline gap, or a type this document lacks).
  - Behaviour (massing only, `placeholderTypes: true`): a wall with no type from a guideline or the layer mapping — the no-guideline case, since the massing rows name no family — gets the declared placeholder type with the note "… — no type from a guideline or the layer mapping. Retype before issue." (master: skipped as `WallType '' not found`, every wall).
  - `public void GhostReviewWindow.SetStandards(string header)` — a wrapped line above the "Nothing has been built yet" header.
  - `public static string ViewPlanner.NothingToPlan(string guidelineLabel, bool installed, List<GuidelineViewStandard> views)` — null when there is something to plan.
  - `internal static string GhostBuilderCommand.WallsLine(GhostPlacementEngine.PlacementReport r, GhostStandards s)` and `internal static string GhostBuilderCommand.CatalogueNotChecked(GhostStandards s)`, shared with Photo Massing.
  - Deleted: `SentinelSettings.GhostLayerRulesetPath`, `GhostGuidelinePath`, `GhostTypeCatalogPath` and their machine → project merge (`SettingsManager.cs:164-166`); `System.Text.Json` ignores the old keys on read and nothing writes them; the `Resources\bds-layers.json` and `Resources\bds-guideline.json` content items.

Threading: Ghost Builder reads the key on the API thread (`ProjectContext.For`), extracts with a mapper-less orchestrator on it, and resolves `GhostStandards` in its existing `Task.Run` phase, where the mapper and the orchestrator are then built — every callback that touches them runs after the review window opens, which happens after that. Photo Massing starts the resolve beside the vision estimate and builds its orchestrator after both. Annotate has no background phase: it waits with the documented pattern `Task.Run(() => GhostStandards.Load(key, …)).GetAwaiter().GetResult()` (the guideline alone, 4 s cap), as the IFC Gate waits for its contract.

What each surface says (`<label>` is `ResolvedArtefact.Label`: `guideline@1 · office · 0123456789ab…`, + ` (cached HH:mm)`, or `none — <reason>`):

| Surface | Text |
|---|---|
| Ghost review window, above the proposal | `Layers: <label> · Guideline: <label> · Type catalogue: <label>` (`GhostStandards.Header`) |
| Ghost build summary, first lines | the same header; then, only when the catalogue is none, `Type catalogue not checked — type_catalog: <label>; types checked against this document only.`; a blank line; `Placed: N`; `Walls: …` |
| `Walls:` line (Ghost and Massing) | ` · `-joined, zero parts omitted: `N typed by the guideline`, `N typed by the layer mapping (guideline none — the pre-guideline behaviour)` or `(no measured thickness for the guideline to type)`, `N given a placeholder type (retype before issue)`, `N left as a reported gap (each named below)`; `Walls: none placed` when all are zero |
| Massing summary, first lines | `Guideline: <label> · Type catalogue: <label>`; the catalogue line as above; a blank line; `Placed: N`; `Walls: …` |
| Annotate, guideline none | `Guideline: none — not installed for <key> or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.` |
| Annotate, guideline without views | `Guideline: <label> has no views section. Nothing to plan — install a guideline@n with a views section on the project or its office.` |
| Annotate, no plannable entry | `Guideline: <label>` + newline + `Its views section has no plannable (FloorPlan/CeilingPlan) entries — nothing to create.` |
| Annotate result | first line `Guideline: <label>`, then `Created: …` as today |

Line numbers below are master's (274ef6b). Task 3 shifts `ElementPlacementFactory.cs` below :176 (it rewrites `ResolveWallType`), and each file's later edits sit below its earlier ones — match every edit by its quoted text, top to bottom.

- [ ] **Step 1: Repoint the harnesses and the two web tests at `demo/bds-pilot/`, with no machine file (RED)**

`tools/guideline-check/Check.cs` — the pilot's guideline and catalogue as artefact bodies; the gap text must name the catalogue it checked; nothing installed degrades to none; a guideline with no catalogue is not checked here (spec decision 2).

In `tools/guideline-check/Check.cs` replace lines 20-35:

```csharp
        // The REAL office files, loaded exactly as the add-in loads them.
        // Resolve from the SOURCE tree, not the working directory: `dotnet run --project` keeps the
        // shell's cwd, and a wrong path here silently falls through to the %AppData% copy — which is
        // how the first run "loaded a catalogue" while testing nothing.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !System.IO.Directory.Exists(System.IO.Path.Combine(root, "SentinelAddin")); i++)
            root = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, ".."));
        Console.WriteLine("  repo root: " + root);
        Console.WriteLine();

        var m = GuidelineMatcher.Load(
            System.IO.Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));

        Ok(m.HasGuideline, $"guideline loaded ({m.Standard})");
        Ok(m.HasCatalog, "type catalogue loaded");
```

with:

```csharp
        // The pilot's files as B7 installs them on its office (guideline@1, type_catalog@1), parsed by the loader the
        // add-in runs on an artefact body. Resolved from the SOURCE tree, not the working directory (`dotnet run
        // --project` keeps the shell's cwd); nothing here reads %AppData%, so every machine gets the same answers.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !System.IO.Directory.Exists(System.IO.Path.Combine(root, "SentinelAddin")); i++)
            root = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, ".."));
        Console.WriteLine("  repo root: " + root);
        Console.WriteLine();

        string guidelineJson = System.IO.File.ReadAllText(System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json"));
        string catalogJson = System.IO.File.ReadAllText(System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));
        var m = GuidelineMatcher.FromBodies(guidelineJson, catalogJson, out string guidelineError, out string catalogError);
        m.CatalogLabel = "type_catalog@1 · office · 0123456789ab…"; // what GhostStandards sets from the resolved artefact

        Ok(m.HasGuideline && guidelineError == null, $"guideline loaded ({m.Standard})" + (guidelineError == null ? "" : " — " + guidelineError));
        Ok(m.HasCatalog && catalogError == null, "type catalogue loaded" + (catalogError == null ? "" : " — " + catalogError));
```

In `tools/guideline-check/Check.cs` replace line 64:

```csharp
        Ok(gap.Why != null && gap.Why.Contains("not in this office's template"), "…and says why, in the reviewer's words");
```

with:

```csharp
        Ok(gap.Why != null && gap.Why.Contains(m.CatalogLabel), "…and says why, naming the catalogue it checked (type_catalog@n · source · sha)");
```

In `tools/guideline-check/Check.cs` replace lines 70-73:

```csharp
        // a missing guideline must degrade, not throw
        var none = GuidelineMatcher.Load("does-not-exist.json", "also-missing.json");
        Ok(!none.HasGuideline && none.Resolve(new GuidelineInput { Category = "Walls" }).Source == "none",
           "a missing/!swapped guideline degrades to 'no guideline' instead of throwing");
```

with:

```csharp
        // nothing installed: 'no guideline', never another office's file, never a throw
        var none = GuidelineMatcher.FromBodies(null, null, out _, out _);
        Ok(!none.HasGuideline && !none.HasCatalog && none.Resolve(new GuidelineInput { Category = "Walls" }).Source == "none",
           "no guideline and no catalogue degrade to 'none' instead of throwing");

        // a guideline with no catalogue: its type is not checked here — the open document decides (spec 4b decision 2)
        var noCatalog = GuidelineMatcher.FromBodies(guidelineJson, null, out _, out _);
        var unchecked275 = noCatalog.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 275 });
        Ok(noCatalog.HasGuideline && !noCatalog.HasCatalog && unchecked275.Type == "BDS_EXT_ARC_CMU_275 mm" && unchecked275.Available == null,
           "type catalogue none: the guideline's type is left for the open document to confirm, no alternatives invented");
```

`tools/annotate-check/Check.cs` — the refusal texts (the spec's words, pinned) and the pilot's guideline from `demo/bds-pilot/` (master read the Resources copy and, with no catalogue path, silently fell through to `%AppData%\Sentinel\type-catalog.json`):

In `tools/annotate-check/Check.cs` replace lines 44-46:

```csharp
// the shipped BDS guideline parses with the new sections
var m = GuidelineMatcher.Load(Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"));
Check("BDS guideline loads", m.HasGuideline);
```

with:

```csharp
// Annotate's refusal names the guideline in force (cohesion 4b-2): none, or one without views, plans nothing.
Check("none refuses in the spec's words",
    ViewPlanner.NothingToPlan("none — not installed for p-none or its office", false, null)
    == "Guideline: none — not installed for p-none or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline without views refuses, naming it",
    ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, new List<GuidelineViewStandard>())
    == "Guideline: guideline@1 · office · 0123456789ab… has no views section. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline with views plans", ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, views) == null);

// the pilot's guideline (demo/bds-pilot/, what B7 installs as the pilot office's guideline@1) parses with the new sections
var m = GuidelineMatcher.FromBodies(File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json")), null, out var guidelineError, out _);
Check("BDS guideline loads" + (guidelineError == null ? "" : " — " + guidelineError), m.HasGuideline);
```

`tools/wallpair-check/SampleRun.cs` (`dotnet run -- sample`):

In `tools/wallpair-check/SampleRun.cs` replace lines 23-25:

```csharp
        var g = GuidelineMatcher.Load(
            Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));
```

with:

```csharp
        // The pilot's guideline and catalogue from demo/bds-pilot/ (what B7 installs on its office), parsed as artefact
        // bodies — no machine file. The gap text names the catalogue it checked; here that is the fixture.
        var g = GuidelineMatcher.FromBodies(
            File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json")),
            File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json")), out _, out _);
        g.CatalogLabel = "demo/bds-pilot/bds-type-catalog.json";
```

`tools/ghost-p2-check/Check.cs` — the `--live` dry run (not run by default; it must still compile):

In `tools/ghost-p2-check/Check.cs` replace lines 201-213:

```csharp
        // Load the SHIPPED BDS ruleset explicitly. Without this the matcher finds no bds-layers.json next
        // to THIS tool's DLL and silently falls back to its built-in keyword heuristics — which resolve
        // "Generic Wall" at 0.70 instead of the standard's BDS_Wall_Ext at 1.00, making the dry run
        // unrepresentative of the add-in (whose deploy folder does carry Resources\bds-layers.json).
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "SentinelAddin", "Resources", "bds-layers.json"));
        Ok(File.Exists(ruleset), "the shipped BDS layer ruleset is on disk");

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, cachePath: cache,
                                           matcher: LayerRulesetMatcher.Load(ruleset));
```

with:

```csharp
        // The pilot's layer standard (demo/bds-pilot/bds-layers.json — what B7 installs as the pilot office's
        // layers@1), parsed as the add-in parses an artefact body. Without it the matcher is heuristics-only and
        // resolves "Generic Wall" at 0.70 (labelled heuristic) instead of the standard's BDS_Wall_Ext at 1.00,
        // making the dry run unrepresentative of a model bound to the pilot.
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "demo", "bds-pilot", "bds-layers.json"));
        Ok(File.Exists(ruleset), "the pilot's layer standard is on disk (demo/bds-pilot)");
        var layersStandard = LayerRulesetMatcher.FromBody(File.ReadAllText(ruleset), out string layersError);
        Ok(layersStandard != null, "the pilot's layer standard parses" + (layersError == null ? "" : " — " + layersError));
        if (layersStandard == null) return;

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, cachePath: cache, matcher: layersStandard);
```

`WebApp/src/sentinel-core/guideline-bds.test.ts`:

In `WebApp/src/sentinel-core/guideline-bds.test.ts` replace line 8:

```ts
const G: Guideline = JSON.parse(readFileSync("../SentinelAddin/Resources/bds-guideline.json", "utf8"));
```

with:

```ts
const G: Guideline = JSON.parse(readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8"));
```

In `WebApp/src/sentinel-core/guideline-bds.test.ts` replace line 80:

```ts
  const raw = JSON.parse(readFileSync("../SentinelAddin/Resources/bds-guideline.json", "utf8"));
```

with:

```ts
  const raw = JSON.parse(readFileSync("../demo/bds-pilot/bds-guideline.json", "utf8"));
```

`WebApp/bridge/artefact-store.test.mjs` (the 4b-1 seed test; line 314 already reads `demo/bds-pilot/bds-layers.json`, which Step 3 replaces with the copy that ran):

In `WebApp/bridge/artefact-store.test.mjs` replace line 315:

```js
    expect(validateArtefact("guideline", readRepoJson("SentinelAddin/Resources/bds-guideline.json"))).toBe(true);
```

with:

```js
    expect(validateArtefact("guideline", readRepoJson("demo/bds-pilot/bds-guideline.json"))).toBe(true);
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet run --project tools/guideline-check
dotnet run --project tools/annotate-check
dotnet run --project tools/wallpair-check -- sample
dotnet run --project tools/ghost-p2-check
cd WebApp && npx vitest run src/sentinel-core/guideline-bds.test.ts bridge/artefact-store.test.mjs; cd ..
```

Expected:
- `guideline-check`: `Unhandled exception. System.IO.FileNotFoundException: Could not find file '<repo>\demo\bds-pilot\bds-guideline.json'.`
- `annotate-check`: the build fails, only in `tools\annotate-check\Check.cs`, three times: `error CS0117: 'ViewPlanner' does not contain a definition for 'NothingToPlan'` (at :46, :49, :51 — match the errors, not the line numbers).
- `wallpair-check -- sample`: `Unhandled exception. System.IO.FileNotFoundException: Could not find file '<repo>\demo\bds-pilot\bds-guideline.json'.`
- `ghost-p2-check`: builds (the `--live` path now compiles against Task 2's `FromBody`) and passes as Task 2 left it (`38/38 checks pass` on master).
- vitest: `FAIL src/sentinel-core/guideline-bds.test.ts` (suite: `ENOENT: no such file or directory, open '…\demo\bds-pilot\bds-guideline.json'`) and `FAIL bridge/artefact-store.test.mjs > validateArtefact — contract, layers, guideline, type catalogue > accepts the seeds and the pilot's files as they will be installed` (same ENOENT); `Test Files 2 failed (2)`.

(Before Step 1 the three C# harnesses did not build at all — since Task 3's commit `GuidelineMatcher.Load` is gone — nor did `ghost-p2-check` since Task 2's — `LayerRulesetMatcher.Load` at Check.cs:213. Step 1 is where they build again; the RED above is what is left: the files have not moved and `NothingToPlan` does not exist.)

- [ ] **Step 3: The two BDS files move to `demo/bds-pilot/`; nothing office-specific ships beside the DLL**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git mv SentinelAddin/Resources/bds-guideline.json demo/bds-pilot/bds-guideline.json
git mv -f SentinelAddin/Resources/bds-layers.json demo/bds-pilot/bds-layers.json
rm -f SentinelAddin/bin/Release/2024/Resources/bds-guideline.json SentinelAddin/bin/Release/2024/Resources/bds-layers.json SentinelAddin/bin/Release/2025/Resources/bds-guideline.json SentinelAddin/bin/Release/2025/Resources/bds-layers.json
```

(The `rm` is of untracked build output: the build copies, never deletes, and `DeployAddin` ships everything under `$(TargetDir)` — without it Task 6's deploy would put the BDS files back beside the DLL. The already-deployed copies under `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\Resources\` are Task 6's.)

In `SentinelAddin/Sentinel.csproj` replace lines 52-60:

```xml
  <ItemGroup>
    <!-- Ribbon icons + the Ghost reference profiles, copied to output and deployed with the DLL. No ruleset
         ships: a document is judged by its web project's ruleset@n (the pilot's copy is seed data in demo/bds-pilot/). -->
    <Content Include="Resources\bds-layers.json" CopyToOutputDirectory="PreserveNewest" />
    <!-- Reference PROFILE, not a fixed standard (D-03). Another firm points ghost_guideline_path at
         their own file; this ships so the add-in works out of the box, not to lock anyone to BDS. -->
    <Content Include="Resources\bds-guideline.json" CopyToOutputDirectory="PreserveNewest" />
    <Content Include="Resources\*.png" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
```

with:

```xml
  <ItemGroup>
    <!-- Ribbon icons, copied to output and deployed with the DLL. No office standard ships: a document's ruleset,
         IDS, naming, contract, layers, guideline and type catalogue are its web project's artefacts (or its
         office's); the pilot's copies are seed data in demo/bds-pilot/. -->
    <Content Include="Resources\*.png" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
```

- [ ] **Step 4: `ViewPlanner.NothingToPlan` — Annotate's refusal, pure so the harness pins the spec's words**

In `SentinelAddin/GhostBuilder/ViewPlanner.cs` replace lines 54-57:

```csharp
            return outp;
        }
    }
}
```

with:

```csharp
            return outp;
        }

        /// <summary>Why Annotate has nothing to plan, or null when it has: the guideline is none — its label says why
        /// ("none — not installed for demo or its office") — or it has no views section. Annotate never plans another
        /// office's views in their place (cohesion 4b-2, F44).</summary>
        public static string NothingToPlan(string guidelineLabel, bool installed, List<GuidelineViewStandard> views)
        {
            const string install = " Nothing to plan — install a guideline@n with a views section on the project or its office.";
            if (!installed) return "Guideline: " + guidelineLabel + "." + install;
            if (views == null || views.Count == 0) return "Guideline: " + guidelineLabel + " has no views section." + install;
            return null;
        }
    }
}
```

- [ ] **Step 5: GREEN — the harnesses and the web tests**

```bash
dotnet run --project tools/guideline-check
dotnet run --project tools/annotate-check
dotnet run --project tools/wallpair-check
dotnet run --project tools/wallpair-check -- sample
dotnet run --project tools/ghost-p2-check
cd WebApp && npx vitest run src/sentinel-core/guideline-bds.test.ts bridge/artefact-store.test.mjs; cd ..
```

Expected `guideline-check`:

```
GuidelineMatcher — C# port conformance (mirrors guideline-bds.test.ts)

  repo root: <repo root>

  PASS  guideline loaded (BDS Office Modelling Guideline v3)
  PASS  type catalogue loaded
  PASS  every name the guideline uses exists in the template
  PASS  external architectural 200 → CMU 200
  PASS  same layer, different measurement → different type
  PASS  structural wall layer (S-WALL) → concrete
  PASS  spec overrides the material, thickness untouched
  PASS  internal partitions default to gypsum
  PASS  a real DWG measurement (199.6) finds the 200 type
  PASS  no measurement → no type (a gap, not a default size)
  PASS  parameter name/value matching is case-insensitive
  PASS  a thickness with no matching type drops to confidence 0
  PASS  …and offers the real alternatives, smallest first
  PASS  …and says why, naming the catalogue it checked (type_catalog@n · source · sha)
  PASS  deterministic — 20 runs, one answer
  PASS  no guideline and no catalogue degrade to 'none' instead of throwing
  PASS  type catalogue none: the guideline's type is left for the open document to confirm, no alternatives invented

17/17 checks pass
```

Expected `annotate-check`:

```
PASS  2 plannable entries x 2 levels = 4
PASS  GA Plan Level 0 exists
PASS  name follows [STATUS]_[TYPE]_[LEVEL]
PASS  template carried
PASS  browser status resolved from statusPrefixes
PASS  sections skipped
PASS  no-prefix entries skipped
PASS  null views -> empty
PASS  no levels -> empty
PASS  none refuses in the spec's words
PASS  a guideline without views refuses, naming it
PASS  a guideline with views plans
PASS  BDS guideline loads
PASS  BDS views section deserialized
PASS  BDS GA Plan wipTemplate
PASS  BDS door tag family
ALL PASS
```

Expected `wallpair-check`: `9/9 checks pass` (unchanged). `wallpair-check -- sample`: the six `✓` lines as on master (`BDS_EXT_ARC_CMU_200 mm` ×3, `…_300 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_EXT_STR_CONC_250 mm`), one `⚠ A-WALL-EXT   275 mm  →  GAP: …` line whose text is Task 3's gap wording and contains `demo/bds-pilot/bds-type-catalog.json` and `Available: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm, BDS_EXT_ARC_CMU_400 mm.`, then `6 walls resolve to a real BDS type · 1 reported as gaps (not invented)` and `SAMPLE OK — matches the designed expectation.` `ghost-p2-check`: unchanged from Step 2. vitest: `Test Files 2 passed (2)`, `Tests 110 passed (110)` on master's counts (14 + 96; plus whatever Tasks 1–3 added to these two files).

No harness reads a machine file:

```bash
git grep -n "SpecialFolder.ApplicationData" -- tools/guideline-check tools/annotate-check tools/wallpair-check tools/ghost-p2-check SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/GhostBuilder/ViewPlanner.cs SentinelAddin/GhostBuilder/WallPairing.cs SentinelAddin/GhostBuilder/GhostBuilder_Architecture.cs SentinelAddin/GhostBuilder/GhostEvidence.cs SentinelAddin/Standards/DocumentTextReader.cs SentinelAddin/GhostBuilder/LayerRulesetMatcher.cs SentinelAddin/GhostBuilder/LayerMapper.cs SentinelAddin/UI/GhostReviewWindow.cs
```

Expected: no output (exit 1) — every file those four harnesses compile. On master it lists `GuidelineMatcher.cs:170`, `LayerMapper.cs:73` and `LayerRulesetMatcher.cs:79`; a hit left in `LayerMapper.cs` means Task 2 kept the machine-wide cache path — stop and raise it.

- [ ] **Step 6: The add-in — what is red at the start of this step**

```bash
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
```

Expected — red since Task 2's commit, exactly these kinds (match the errors, not the line numbers; if Task 2 changed `LayerMapper`'s constructor, its error at `Commands.GhostBuilder.cs:173` is a CS1739/CS7036 instead):

```
SentinelAddin\Commands.Annotate.cs(26,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.GhostBuilder.cs(173,72): error CS0117: 'LayerRulesetMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.GhostBuilder.cs(177,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
SentinelAddin\Commands.Massing.cs(42,42): error CS0117: 'GuidelineMatcher' does not contain a definition for 'Load'
```

- [ ] **Step 7: The placement tally — what typed each wall**

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` replace lines 84-86:

```csharp
        /// <summary>Names of wall types this build created — surfaced in the report so a human sees the
        /// office standard was extended, not just that walls were placed.</summary>
        public readonly List<string> CreatedTypes = new List<string>();
```

with:

```csharp
        /// <summary>Names of wall types this build created — surfaced in the report so a human sees the
        /// office standard was extended, not just that walls were placed.</summary>
        public readonly List<string> CreatedTypes = new List<string>();

        /// <summary>Per placed wall: typed by the guideline, by the layer mapping, or a declared placeholder
        /// (massing); and walls skipped for want of a type (a guideline gap, or a type this document lacks).
        /// The engine copies them into its report; the build summary names them.</summary>
        public int WallsByGuideline, WallsByMapping, WallsPlaceholder, WallGaps;
```

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` replace lines 183-200:

```csharp
            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason);
            if (gapReason != null && _placeholderTypes)
            {
                var ph = DefaultType(ElementTypeGroup.WallType, _wallTypes);
                if (ph != null)
                {
                    Notes.Add($"Placeholder wall type '{ph.Name}' used for {el.ThicknessMm:0} mm walls on '{el.CadLayer}' — {gapReason} Retype before issue.");
                    resolved = ph.Name; gapReason = null;
                    if (!_wallTypes.ContainsKey(ph.Name)) _createdWallTypes[ph.Name] = ph;
                }
            }
            if (gapReason != null)
            {
                warning = $"Wall on '{el.CadLayer}': {gapReason}";
                return Outcome.SkippedUnknownType;
            }
```

with:

```csharp
            // The guideline decides the type from the measured thickness where it can; a gap is surfaced
            // and the wall skipped rather than mis-typed.
            string resolved = ResolveWallType(el, map, out string gapReason);
            // For the build summary: the guideline had the say (ResolveWallType's own test for leaving the
            // pre-guideline path); otherwise the layer mapping typed the wall.
            bool byGuideline = _guideline != null && _guideline.HasGuideline && el.ThicknessMm > 0;
            bool placeholder = false;
            // Massing: no office type — a guideline gap, or no guideline and nothing in the mapping (the massing's
            // rows name no family) — is a declared placeholder, never a silent skip of every wall.
            if ((gapReason != null || resolved == null) && _placeholderTypes)
            {
                var ph = DefaultType(ElementTypeGroup.WallType, _wallTypes);
                if (ph != null)
                {
                    string why = gapReason ?? "no type from a guideline or the layer mapping.";
                    Notes.Add($"Placeholder wall type '{ph.Name}' used for {el.ThicknessMm:0} mm walls on '{el.CadLayer}' — {why} Retype before issue.");
                    resolved = ph.Name; gapReason = null; placeholder = true;
                    if (!_wallTypes.ContainsKey(ph.Name)) _createdWallTypes[ph.Name] = ph;
                }
            }
            if (gapReason != null)
            {
                WallGaps++;
                warning = $"Wall on '{el.CadLayer}': {gapReason}";
                return Outcome.SkippedUnknownType;
            }
```

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` replace lines 215-220:

```csharp
            if (wanted == null
                || (!_wallTypes.TryGetValue(wanted, out WallType wt) && !_createdWallTypes.TryGetValue(wanted, out wt)))
            {
                warning = $"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }
```

with:

```csharp
            if (wanted == null
                || (!_wallTypes.TryGetValue(wanted, out WallType wt) && !_createdWallTypes.TryGetValue(wanted, out wt)))
            {
                WallGaps++;
                warning = $"WallType '{wanted}' not found (layer '{el.CadLayer}'); skipped.";
                return Outcome.SkippedUnknownType;
            }
```

In `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs` replace line 237:

```csharp
            return placed > 0 ? Outcome.Placed : Outcome.SkippedNoGeometry;
```

with:

```csharp
            if (placed == 0) return Outcome.SkippedNoGeometry;
            if (placeholder) WallsPlaceholder++; else if (byGuideline) WallsByGuideline++; else WallsByMapping++;
            return Outcome.Placed;
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` replace lines 323-325:

```csharp
            /// <summary>Types this build created to fill a guideline gap (office standard extended by a size).</summary>
            public readonly List<string> CreatedTypes = new List<string>();
        }
```

with:

```csharp
            /// <summary>Types this build created to fill a guideline gap (office standard extended by a size).</summary>
            public readonly List<string> CreatedTypes = new List<string>();
            /// <summary>Per placed wall, what typed it (the guideline, the layer mapping, a declared massing placeholder),
            /// and the walls skipped for want of a type — the build summary names them (cohesion 4b-2). Counted per
            /// drawn wall, as <see cref="Placed"/> is.</summary>
            public int WallsByGuideline, WallsByMapping, WallsPlaceholder, WallGaps;
        }
```

In `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs` replace lines 387-388:

```csharp
            report.Warnings.AddRange(factory.Notes);
            report.CreatedTypes.AddRange(factory.CreatedTypes);
```

with:

```csharp
            report.Warnings.AddRange(factory.Notes);
            report.CreatedTypes.AddRange(factory.CreatedTypes);
            report.WallsByGuideline = factory.WallsByGuideline;
            report.WallsByMapping = factory.WallsByMapping;
            report.WallsPlaceholder = factory.WallsPlaceholder;
            report.WallGaps = factory.WallGaps;
```

- [ ] **Step 8: The review window names its standards**

In `SentinelAddin/UI/GhostReviewWindow.cs` replace lines 26-27:

```csharp
    private readonly TextBlock _status;
    private readonly Button _build;
```

with:

```csharp
    private readonly TextBlock _status;
    private readonly Button _build;
    // "Layers: … · Guideline: … · Type catalogue: …" — what maps and types this proposal (cohesion 4b-2).
    private readonly TextBlock _standards = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 6) };
```

In `SentinelAddin/UI/GhostReviewWindow.cs` replace line 103:

```csharp
            (header, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),
```

with:

```csharp
            (_standards, Dock.Top), (header, Dock.Top), (_status, Dock.Bottom), (buttons, Dock.Bottom),
```

In `SentinelAddin/UI/GhostReviewWindow.cs` replace line 273:

```csharp
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
```

with:

```csharp
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);

    /// <summary>Name the standards this proposal was mapped by and will be typed by — GhostStandards.Header,
    /// "Layers: layers@1 · office · … · Guideline: … · Type catalogue: …", a none named as none. Call before Show().</summary>
    public void SetStandards(string header) => Dispatcher.Invoke(() => _standards.Text = header);
```

- [ ] **Step 9: Ghost Builder — the key on the API thread, the standards in the background phase, the mapper and orchestrator built after them, the labels in the header and the summary**

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 16-24:

```csharp
/// <summary>
/// Ghost Builder: pick a 2D DWG import, map its CAD layers to BDS families via the local LLM,
/// review the proposal, and build LOD 200 geometry — WITHOUT freezing the Revit UI.
///
/// Threading (this is the whole point of the command):
///   • Execute (API thread): resolve config, pick DWG, extract inputs (reads), show a modeless
///     progress window, then RETURN immediately so Revit's UI stays live.
///   • Task.Run (background): the LLM HTTP call only — the sole slow, Revit-API-free step.
///     Cancellable via the window's ESC / Cancel (CancellationToken).
```

with:

```csharp
/// <summary>
/// Ghost Builder: pick a 2D DWG import, map its CAD layers to office families by the layers@n installed on the
/// document's web project (or its office) — labelled heuristics and the local LLM for the rest — review the
/// proposal, and build LOD 200 geometry typed by the project's guideline@n and type_catalog@n — WITHOUT freezing
/// the Revit UI. Each standard is named (kind@n · source · sha) in the review header and the build summary; one
/// not installed is named as none, never filled from a file beside the add-in (cohesion phase 4b-2).
///
/// Threading (this is the whole point of the command):
///   • Execute (API thread): resolve config, read the project key, pick DWG, extract inputs (reads), show a
///     modeless progress window, then RETURN immediately so Revit's UI stays live.
///   • Task.Run (background): the standards GET and the LLM HTTP calls — the slow, Revit-API-free steps; the
///     mapper and orchestrator are built there once the standards are known.
///     Cancellable via the window's ESC / Cancel (CancellationToken).
```

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 163-201:

```csharp
        // 3. PHASE 1 — Revit API reads, on this (API) thread. Fast; safe to do inline.
        // Cache + base-dictionary layer for dirty external DWGs: known layers resolve locally, only
        // unrecognised ones reach Ollama (LocalGhostBuilder), and every result is remembered.
        // Ghost Builder v2 (P1): the BDS DWG Layer Standard (bds-layers.json) drives deterministic mapping;
        // the LOCAL model (settings.GhostModel, default qwen2.5) resolves only the unrecognised layers.
        // Cloud stays off — the drawing never leaves the machine.
        var rulesetPath = string.IsNullOrWhiteSpace(settings.GhostLayerRulesetPath) ? null : settings.GhostLayerRulesetPath;
        // P2 SENSE (slice 1): read supporting docs (PDF/specs) from the SCOPED folder → context for the model.
        var evidence = GhostEvidence.FromFolder(settings.GhostSourceFolder);
        var llm = new LocalGhostBuilder(schemaJson, settings.GhostModel, settings.OllamaUrl, evidence.Context);
        var mapper = new LayerMapper(llm, matcher: LayerRulesetMatcher.Load(rulesetPath));
        // The Office Modelling Guideline (per-firm, swappable): picks the wall TYPE from the measured
        // thickness against the office's own harvested catalogue. Absent → GhostBuilder behaves exactly
        // as before, so this is safe to always attempt.
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);
        // minConfidence 0: the P3 review window is the confidence gate now. It pre-ticks at 0.5 and shows
        // the score on every row, so a human has already adjudicated each layer by the time we place —
        // a second silent engine-side threshold would just drop layers the reviewer deliberately ticked.
        var orchestrator = new GhostBuilderOrchestrator(doc, mapper, minConfidence: 0, familyLibraryDir: libraryDir, guideline: guideline);
        GhostBuilderOrchestrator.Inputs inputs;
        try
        {
            inputs = orchestrator.ExtractInputs(cadLink);
        }
        catch (System.Exception ex)
        {
            mapper.Dispose();
            msg = $"{ex.GetType().Name}: {ex.Message}";
            return Result.Failed;
        }

        if (inputs.Layers.Count == 0)
        {
            mapper.Dispose();
            TaskDialog.Show("Sentinel — Ghost Builder", "No CAD layers found in the import; nothing to build.");
            return Result.Cancelled;
        }
```

with:

```csharp
        // 3. PHASE 1 — Revit API reads, on this (API) thread. Fast; safe to do inline.
        // The project key is read here (Extensible Storage); layers@n, guideline@n and type_catalog@n are fetched
        // in PHASE 2, off this thread, and the mapper and orchestrator are built there once they are known.
        // Mapping tiers: ignore → the project's layers@n → the per-project cache → labelled heuristics → the LOCAL
        // model (settings.GhostModel) for what is left. Cloud stays off — the drawing never leaves the machine.
        string key = ProjectContext.For(doc).Key; // "" when unbound: every standard then reads "none — not bound"
        // P2 SENSE (slice 1): read supporting docs (PDF/specs) from the SCOPED folder → context for the model.
        var evidence = GhostEvidence.FromFolder(settings.GhostSourceFolder);
        var llm = new LocalGhostBuilder(schemaJson, settings.GhostModel, settings.OllamaUrl, evidence.Context);
        GhostBuilderOrchestrator.Inputs inputs;
        try
        {
            // Extraction reads the import and needs no standard: a mapper-less orchestrator does it here.
            inputs = new GhostBuilderOrchestrator(doc, mapper: null).ExtractInputs(cadLink);
        }
        catch (System.Exception ex)
        {
            llm.Dispose();
            msg = $"{ex.GetType().Name}: {ex.Message}";
            return Result.Failed;
        }

        if (inputs.Layers.Count == 0)
        {
            llm.Dispose();
            TaskDialog.Show("Sentinel — Ghost Builder", "No CAD layers found in the import; nothing to build.");
            return Result.Cancelled;
        }

        // Set in PHASE 2 before the review window opens; the review and placement callbacks below only run after.
        LayerMapper? mapper = null;
        GhostBuilderOrchestrator? orchestrator = null;
        GhostStandards? standards = null;
        // Frees the local model's HttpClient (LayerMapper.Dispose forwards to the same LocalGhostBuilder).
        void Release() => ((System.IDisposable?)mapper ?? llm).Dispose();
```

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 230-253:

```csharp
        review.BuildRequested += (approved, levelId) =>
        {
            building = true;
            placementEvent.SetRequest(orchestrator, inputs, approved, levelId);
            externalEvent.Raise();
        };

        // Closing the review without building ends the run — nothing was written, so there is nothing
        // to report or undo. Disposing the mapper here is what releases its HttpClient.
        review.Closed += (_, __) => { if (!building) mapper.Dispose(); };

        placementEvent.Completed += (report, error) =>
        {
            // Back on the API thread. Marshal UI updates to the window's dispatcher.
            review.Dispatcher.Invoke(() =>
            {
                mapper.Dispose();
                review.Close();
                if (error != null)
                    TaskDialog.Show("Sentinel — Ghost Builder", "Placement failed: " + error.Message);
                else
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report));
            });
        };
```

with:

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

        placementEvent.Completed += (report, error) =>
        {
            // Back on the API thread. Marshal UI updates to the window's dispatcher.
            review.Dispatcher.Invoke(() =>
            {
                Release();
                review.Close();
                if (error != null)
                    TaskDialog.Show("Sentinel — Ghost Builder", "Placement failed: " + error.Message);
                else
                    TaskDialog.Show("Sentinel — Ghost Builder", Summarize(report, standards!));
            });
        };
```

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 255-259:

```csharp
        // 6. PHASE 2 — LLM mapping on a background thread. UI is free the moment we return below.
        _ = Task.Run(async () =>
        {
            try
            {
```

with:

```csharp
        // 6. PHASE 2 — the project's standards, then LLM mapping, on a background thread. UI is free the
        // moment we return below.
        _ = Task.Run(async () =>
        {
            try
            {
                // layers@n, guideline@n and type_catalog@n for this document's project (or its office), fetched in
                // parallel (the catalogue within 20 s). One not installed is none, named — never a shipped file.
                progress.SetStatus("Reading the project's layers, guideline and type catalogue…");
                var resolved = GhostStandards.Load(key);
                progress.Token.ThrowIfCancellationRequested();
                standards = resolved;
                // The per-project mapping cache (%AppData%\Sentinel\cache\<key>\dwg_mappings.json), stamped by the
                // mapper with the layers sha: another project's guess never outranks this project's layers@n.
                mapper = new LayerMapper(llm, cachePath: ArtefactCache.PathFor(key, "dwg_mappings"), matcher: resolved.Layers);
                // minConfidence 0: the P3 review window is the confidence gate now. It pre-ticks at 0.5 and shows
                // the score on every row, so a human has already adjudicated each layer by the time we place —
                // a second silent engine-side threshold would just drop layers the reviewer deliberately ticked.
                orchestrator = new GhostBuilderOrchestrator(doc, mapper, minConfidence: 0, familyLibraryDir: libraryDir,
                                                            guideline: resolved.Guideline);

```

(The existing `MappingResult mapping = await orchestrator.MapAsync(inputs, progress.Token)` at :274 is unchanged: inside this lambda the compiler's flow state has `orchestrator` non-null after the assignment above.)

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 294-299:

```csharp
                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    review.Load(mapping, perLayer, doc.Title);
                    review.Show();
                });
```

with:

```csharp
                progress.Dispatcher.Invoke(() =>
                {
                    progress.Close();
                    review.SetStandards(resolved.Header); // what maps and types this proposal, named before Build
                    review.Load(mapping, perLayer, doc.Title);
                    review.Show();
                });
```

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 301-314:

```csharp
            catch (System.OperationCanceledException)
            {
                CloseOnUi(progress, mapper); // ESC/Cancel: HTTP aborted cleanly
            }
            catch (System.Net.Http.HttpRequestException)
            {
                FailOnUi(progress, mapper,
                    $"Could not reach the local model at {settings.OllamaUrl}.\n\n" +
                    $"Start Ollama and pull the model (\"ollama pull {settings.GhostModel}\"), then try again.");
            }
            catch (System.Exception ex)
            {
                FailOnUi(progress, mapper, $"{ex.GetType().Name}: {ex.Message}");
            }
```

with:

```csharp
            catch (System.OperationCanceledException)
            {
                CloseOnUi(progress, Release); // ESC/Cancel: HTTP aborted cleanly
            }
            catch (System.Net.Http.HttpRequestException)
            {
                FailOnUi(progress, Release,
                    $"Could not reach the local model at {settings.OllamaUrl}.\n\n" +
                    $"Start Ollama and pull the model (\"ollama pull {settings.GhostModel}\"), then try again.");
            }
            catch (System.Exception ex)
            {
                FailOnUi(progress, Release, $"{ex.GetType().Name}: {ex.Message}");
            }
```

In `SentinelAddin/Commands.GhostBuilder.cs` replace lines 321-336:

```csharp
    private static void CloseOnUi(GhostBuilderProgressWindow w, LayerMapper mapper) =>
        w.Dispatcher.Invoke(() => { mapper.Dispose(); w.Close(); });

    private static void FailOnUi(GhostBuilderProgressWindow w, LayerMapper mapper, string message) =>
        w.Dispatcher.Invoke(() =>
        {
            mapper.Dispose();
            w.Close();
            TaskDialog.Show("Sentinel — Ghost Builder", message);
        });

    private static string Summarize(GhostPlacementEngine.PlacementReport r)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        lines.AppendLine($"Placed: {r.Placed}");
```

with:

```csharp
    private static void CloseOnUi(GhostBuilderProgressWindow w, System.Action release) =>
        w.Dispatcher.Invoke(() => { release(); w.Close(); });

    private static void FailOnUi(GhostBuilderProgressWindow w, System.Action release, string message) =>
        w.Dispatcher.Invoke(() =>
        {
            release();
            w.Close();
            TaskDialog.Show("Sentinel — Ghost Builder", message);
        });

    /// <summary>What typed the placed walls — the guideline, the layer mapping, a declared placeholder (massing) —
    /// and how many were left as a reported gap. Shared with Photo Massing.</summary>
    internal static string WallsLine(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        var parts = new List<string>();
        if (r.WallsByGuideline > 0) parts.Add($"{r.WallsByGuideline} typed by the guideline");
        if (r.WallsByMapping > 0)
            parts.Add($"{r.WallsByMapping} typed by the layer mapping " + (s.GuidelineSource.Origin == "none"
                ? "(guideline none — the pre-guideline behaviour)"
                : "(no measured thickness for the guideline to type)"));
        if (r.WallsPlaceholder > 0) parts.Add($"{r.WallsPlaceholder} given a placeholder type (retype before issue)");
        if (r.WallGaps > 0) parts.Add($"{r.WallGaps} left as a reported gap (each named below)");
        return "Walls: " + (parts.Count == 0 ? "none placed" : string.Join(" · ", parts));
    }

    /// <summary>Spec 4b decision 2: with no type catalogue the guideline's types are checked against the open
    /// document only — said, never passed. Shared with Photo Massing.</summary>
    internal static string CatalogueNotChecked(GhostStandards s) =>
        "Type catalogue not checked — type_catalog: " + s.CatalogSource.Label + "; types checked against this document only.";

    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var lines = new System.Text.StringBuilder();
        // What this build was mapped and typed by, first — the review window's header, repeated.
        lines.AppendLine(s.Header);
        if (s.CatalogSource.Origin == "none") lines.AppendLine(CatalogueNotChecked(s));
        lines.AppendLine();
        lines.AppendLine($"Placed: {r.Placed}");
        lines.AppendLine(WallsLine(r, s));
```

(The rest of `Summarize` — `Skipped …`, `Created N new type(s)`, `Warnings:` — is unchanged.)

- [ ] **Step 10: Photo Massing — guideline and type catalogue from the project, both named in its summary**

In `SentinelAddin/Commands.Massing.cs` replace lines 16-18:

```csharp
/// in the scoped folder, let the user CORRECT the numbers, then build it through the SAME governed
/// GhostBuilder placement + Office Modelling Guideline a DWG uses. The governed answer to the Geopogo demo:
/// the estimate is an explicit, reviewable input, not silent geometry that drifts.
```

with:

```csharp
/// in the scoped folder, let the user CORRECT the numbers, then build it through the SAME governed
/// GhostBuilder placement a DWG uses, typed by the guideline@n and type_catalog@n installed on the document's web
/// project (or its office) and named in the summary; with no guideline every wall is a declared placeholder.
/// The governed answer to the Geopogo demo: the estimate is an explicit, reviewable input, not silent geometry
/// that drifts.
```

In `SentinelAddin/Commands.Massing.cs` replace lines 41-70:

```csharp
        string libraryDir = string.IsNullOrWhiteSpace(settings.GhostFamilyLibraryDir) ? null : settings.GhostFamilyLibraryDir;
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);
        var orchestrator = new GhostBuilderOrchestrator(doc, mapper: null, minConfidence: 0,
                                                        familyLibraryDir: libraryDir, guideline: guideline,
                                                        placeholderTypes: true); // LOD 100: default types, declared

        var placementEvent = new MassingPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message : Summarize(report));
        });

        // Vision estimate on a background thread; the review window (API thread) drives the build.
        _ = Task.Run(async () =>
        {
            try
            {
                progress.SetStatus($"Reading the project images with the local vision model…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
```

with:

```csharp
        string libraryDir = string.IsNullOrWhiteSpace(settings.GhostFamilyLibraryDir) ? null : settings.GhostFamilyLibraryDir;
        // The project key is read here (Extensible Storage, API thread); the guideline and type catalogue it names are
        // fetched off this thread while the vision model reads the images. Massing reads no layer standard.
        string key = ProjectContext.For(doc).Key;
        GhostStandards standards = null; // set in the background before the review window can raise a build

        var placementEvent = new MassingPlacementEvent();
        var externalEvent = ExternalEvent.Create(placementEvent);

        var progress = new GhostBuilderProgressWindow();
        new System.Windows.Interop.WindowInteropHelper(progress) { Owner = c.Application.MainWindowHandle };

        placementEvent.Completed += (report, error) => progress.Dispatcher.Invoke(() =>
        {
            progress.Close();
            TaskDialog.Show("Sentinel — Massing",
                error != null ? "Build failed: " + error.Message : Summarize(report, standards));
        });

        // Vision estimate and the standards GET on background threads; the review window (API thread) drives the build.
        _ = Task.Run(async () =>
        {
            try
            {
                var fetch = Task.Run(() => GhostStandards.Load(key, layers: false)); // guideline@n + type_catalog@n
                progress.SetStatus($"Reading the project images with the local vision model…");
                using var reader = new MassingVisionReader(settings.GhostVisionModel, settings.OllamaUrl);
                MassingEstimate estimate = await reader.EstimateAsync(folder, ct: progress.Token).ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                progress.SetStatus("Reading the project's guideline and type catalogue…");
                standards = await fetch.ConfigureAwait(false);
                if (progress.Token.IsCancellationRequested) return;
                var orchestrator = new GhostBuilderOrchestrator(doc, mapper: null, minConfidence: 0,
                                                                familyLibraryDir: libraryDir, guideline: standards.Guideline,
                                                                placeholderTypes: true); // LOD 100: default types, declared
```

(The review block that follows — `review.BuildRequested += corrected => { … placementEvent.SetRequest(orchestrator, elements, mapping); … }` at :75-84 — is unchanged and now captures the local `orchestrator` built above.)

In `SentinelAddin/Commands.Massing.cs` replace lines 98-102:

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Placed: {r.Placed}");
```

with:

```csharp
    private static string Summarize(GhostPlacementEngine.PlacementReport r, GhostStandards s)
    {
        if (r is null) return "No report returned.";
        var sb = new System.Text.StringBuilder();
        // What typed this massing, first: the project's guideline and type catalogue, a none named as none.
        sb.AppendLine("Guideline: " + s.GuidelineSource.Label + " · Type catalogue: " + s.CatalogSource.Label);
        if (s.CatalogSource.Origin == "none") sb.AppendLine(GhostBuilderCommand.CatalogueNotChecked(s));
        sb.AppendLine();
        sb.AppendLine($"Placed: {r.Placed}");
        sb.AppendLine(GhostBuilderCommand.WallsLine(r, s));
```

- [ ] **Step 11: Annotate Views — the guideline from the project; none refuses, a guideline is named**

In `SentinelAddin/Commands.Annotate.cs` replace lines 1-3:

```csharp
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
```

with:

```csharp
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

In `SentinelAddin/Commands.Annotate.cs` replace lines 12-15:

```csharp
/// Annotate — step 3 of the datum → model → annotate chain. Creates the WIP plan views the
/// Office Modelling Guideline's `views` section prescribes: one per plannable entry per level,
/// named to the office structure, view template applied, routed into the office Project Browser
/// structure. Idempotent: a view whose name already exists is skipped, so re-running is safe.
```

with:

```csharp
/// Annotate — step 3 of the datum → model → annotate chain. Creates the WIP plan views the `views` section of
/// the guideline@n installed on the document's web project (or its office) prescribes: one per plannable entry
/// per level, named to the office structure, view template applied, routed into the office Project Browser
/// structure. Idempotent: a view whose name already exists is skipped, so re-running is safe. With no guideline
/// it refuses and names the none — it never plans another office's views (cohesion 4b-2, F44).
```

In `SentinelAddin/Commands.Annotate.cs` replace lines 25-36:

```csharp
        var settings = SettingsManager.Resolve(doc);
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);

        if (guideline.Views is null || guideline.Views.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate",
                "The guideline has no `views` section — nothing to create.\n" +
                $"Guideline: {guideline.Standard}");
            return Result.Cancelled;
        }
```

with:

```csharp
        // guideline@n for this document's project (or its office): the key is read here on the API thread, the GET
        // runs off it and the command waits (4 s cap), as Governed Publish waits on /propose.
        string key = ProjectContext.For(doc).Key;
        var standards = Task.Run(() => GhostStandards.Load(key, layers: false, catalog: false)).GetAwaiter().GetResult();
        var guideline = standards.Guideline;
        string guidelineLabel = standards.GuidelineSource.Label;

        var nothing = ViewPlanner.NothingToPlan(guidelineLabel, standards.GuidelineSource.Origin != "none", guideline.Views);
        if (nothing != null)
        {
            TaskDialog.Show("Sentinel — Annotate", nothing);
            return Result.Cancelled;
        }
```

In `SentinelAddin/Commands.Annotate.cs` replace line 50:

```csharp
            TaskDialog.Show("Sentinel — Annotate", "The guideline's views section has no plannable (FloorPlan/CeilingPlan) entries.");
```

with:

```csharp
            TaskDialog.Show("Sentinel — Annotate", $"Guideline: {guidelineLabel}\nIts views section has no plannable (FloorPlan/CeilingPlan) entries — nothing to create.");
```

In `SentinelAddin/Commands.Annotate.cs` replace lines 96-97:

```csharp
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Created: {created} view(s) across {levels.Count} level(s).");
```

with:

```csharp
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Guideline: {guidelineLabel}"); // what planned these views
        sb.AppendLine($"Created: {created} view(s) across {levels.Count} level(s).");
```

- [ ] **Step 12: The ribbon says where the standards come from; Datum stops claiming a layer standard it does not read**

In `SentinelAddin/App.cs` replace line 285:

```csharp
            "The datum -> model -> annotate chain: read the datum from the drawings, build LOD 200 geometry (from DWG or photos), then create the guideline's WIP views.");
```

with:

```csharp
            "The datum -> model -> annotate chain: read the datum from the drawings, build LOD 200 geometry (from DWG or photos), then create the WIP views of the guideline installed on this document's web project (or its office).");
```

In `SentinelAddin/App.cs` replace line 289:

```csharp
            "Build LOD 200 Revit geometry from a 2D DWG import: local LLM maps CAD layers to office families, then places walls and instances.");
```

with:

```csharp
            "Build LOD 200 Revit geometry from a 2D DWG import: CAD layers map by the layers standard installed on this document's web project (or its office) — labelled heuristics and the local LLM for the rest, never pre-ticked — then walls are typed by its guideline and type catalogue. Each is named with source and sha; one not installed reads none.");
```

In `SentinelAddin/App.cs` replace line 291:

```csharp
            "Estimate a building's massing from the project images (photos/renders/elevations) in the scoped folder, review and correct the numbers, then build it through the same governed placement + guideline.");
```

with:

```csharp
            "Estimate a building's massing from the project images (photos/renders/elevations) in the scoped folder, review and correct the numbers, then build it through the same governed placement, typed by the guideline and type catalogue installed on this document's web project (or its office) and named in the summary; with no guideline the walls get declared placeholder types.");
```

In `SentinelAddin/App.cs` replace line 293:

```csharp
            "Create the WIP plan views the guideline's `views` section prescribes: one per plannable entry per level, templated and routed into the office Project Browser structure. Idempotent.");
```

with:

```csharp
            "Create the WIP plan views prescribed by the `views` section of the guideline installed on this document's web project (or its office), named guideline@n with source and sha: one per plannable entry per level, templated and routed into the office Project Browser structure. Idempotent. No guideline installed = nothing to plan.");
```

In `SentinelAddin/Commands.Datum.cs` replace line 79:

```csharp
                "containing \"GRID\". Check the drawings are imported and drawn to the office layer standard.");
```

with:

```csharp
                "containing \"GRID\" — those two words, not the project's layers standard. Check the drawings are imported.");
```

- [ ] **Step 13: `SettingsManager` — the three standard paths and their machine merge are gone**

In `SentinelAddin/Engine/SettingsManager.cs` replace lines 36-41:

```csharp
    // Ghost Builder v2 (P1): local model + swappable DWG layer standard. LOCAL-by-default (privacy — the
    // office's drawings never leave the machine); cloud is an explicit opt-in and stays OFF unless enabled.
    [JsonPropertyName("ghost_model")] public string GhostModel { get; set; } = "qwen2.5:7b-instruct";          // local Ollama model for the unknown-layer gaps
    [JsonPropertyName("ollama_url")] public string OllamaUrl { get; set; } = "http://localhost:11434/api/generate";
    [JsonPropertyName("ghost_layer_ruleset_path")] public string GhostLayerRulesetPath { get; set; } = string.Empty; // empty -> %AppData%\Sentinel\bds-layers.json, then the shipped Resources copy
    [JsonPropertyName("ghost_cloud_opt_in")] public bool GhostCloudOptIn { get; set; } = false;                 // OFF: no drawing leaves the machine
```

with:

```csharp
    // Ghost Builder v2 (P1): the local model. LOCAL-by-default (privacy — the office's drawings never leave the
    // machine); cloud is an explicit opt-in and stays OFF unless enabled. The layer standard, the modelling guideline
    // and the type catalogue are not settings: they are the web project's layers@n, guideline@n and type_catalog@n
    // (cohesion 4b-2). An old payload's ghost_layer_ruleset_path, ghost_guideline_path and ghost_type_catalog_path
    // are ignored on read and dropped by the next save.
    [JsonPropertyName("ghost_model")] public string GhostModel { get; set; } = "qwen2.5:7b-instruct";          // local Ollama model for the unknown-layer gaps
    [JsonPropertyName("ollama_url")] public string OllamaUrl { get; set; } = "http://localhost:11434/api/generate";
    [JsonPropertyName("ghost_cloud_opt_in")] public bool GhostCloudOptIn { get; set; } = false;                 // OFF: no drawing leaves the machine
```

In `SentinelAddin/Engine/SettingsManager.cs` replace lines 46-52:

```csharp
    // The OFFICE MODELLING GUIDELINE and the TYPE CATALOGUE harvested from that office's template.
    // Both are per-firm by design (decision D-03: BDS is a reference profile, not a fixed standard) —
    // another practice points these at their own files and nothing in the code changes. Empty falls back
    // to %AppData%\Sentinel\ then the shipped Resources copy, exactly like the layer ruleset above.
    [JsonPropertyName("ghost_guideline_path")] public string GhostGuidelinePath { get; set; } = string.Empty;
    [JsonPropertyName("ghost_type_catalog_path")] public string GhostTypeCatalogPath { get; set; } = string.Empty;
    [JsonPropertyName("ghost_vision_model")] public string GhostVisionModel { get; set; } = "llava"; // local VLM for sketches/renders (llava = widely-supported arch)
```

with:

```csharp
    [JsonPropertyName("ghost_vision_model")] public string GhostVisionModel { get; set; } = "llava"; // local VLM for sketches/renders (llava = widely-supported arch)
```

In `SentinelAddin/Engine/SettingsManager.cs` replace lines 149-150:

```csharp
    /// <summary>Effective settings: document ES first, machine JSON fallback,
    /// empty settings when neither exists (engine then uses built-in chain).</summary>
```

with:

```csharp
    /// <summary>Effective settings: document ES first, machine JSON fallback,
    /// empty settings when neither exists.</summary>
```

In `SentinelAddin/Engine/SettingsManager.cs` replace lines 157-167:

```csharp
        // A project's document ES wins for its own fields, but the machine config still supplies the GHOST
        // operational defaults (source folder / family library / ruleset path) so they apply even in a project
        // that carries its own Sentinel ES — otherwise a per-project setup silently disables P2's doc folder.
        if (machine is not null)
        {
            if (string.IsNullOrWhiteSpace(project.GhostSourceFolder)) project.GhostSourceFolder = machine.GhostSourceFolder;
            if (string.IsNullOrWhiteSpace(project.GhostFamilyLibraryDir)) project.GhostFamilyLibraryDir = machine.GhostFamilyLibraryDir;
            if (string.IsNullOrWhiteSpace(project.GhostLayerRulesetPath)) project.GhostLayerRulesetPath = machine.GhostLayerRulesetPath;
            if (string.IsNullOrWhiteSpace(project.GhostGuidelinePath)) project.GhostGuidelinePath = machine.GhostGuidelinePath;
            if (string.IsNullOrWhiteSpace(project.GhostTypeCatalogPath)) project.GhostTypeCatalogPath = machine.GhostTypeCatalogPath;
        }
```

with:

```csharp
        // A project's document ES wins for its own fields, but the machine config still supplies the GHOST
        // operational defaults (source folder / family library) so they apply even in a project that carries its
        // own Sentinel ES — otherwise a per-project setup silently disables P2's doc folder. No office standard is
        // merged from the machine: layers, guideline and type catalogue come from the web project.
        if (machine is not null)
        {
            if (string.IsNullOrWhiteSpace(project.GhostSourceFolder)) project.GhostSourceFolder = machine.GhostSourceFolder;
            if (string.IsNullOrWhiteSpace(project.GhostFamilyLibraryDir)) project.GhostFamilyLibraryDir = machine.GhostFamilyLibraryDir;
        }
```

- [ ] **Step 14: GREEN — the add-in builds, every touched harness and the web suite pass, nothing reads the old paths**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false
dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false
```

Expected: both `Build succeeded`, `0 Error(s)` — the first green add-in build since Task 1. Warnings: master's (6 on 2024, 3 on 2025) plus any Tasks 1–3 introduced, none new in a file this task touched: on 2024 `Commands.GhostBuilder.cs(220,38)` CS0618 is master's `IdOf`; on 2025 `Commands.Annotate.cs(76,59)` and `(88,59)` CS8600 are master's :73/:85 moved down by the three new lines. (Verified on a scratch copy on 2026-09-25 against stand-ins for Tasks 1–3's pinned interfaces: 0 errors, 6 and 3 warnings.)

```bash
dotnet run --project tools/guideline-check
dotnet run --project tools/annotate-check
dotnet run --project tools/wallpair-check
dotnet run --project tools/wallpair-check -- sample
dotnet run --project tools/ghost-p2-check
dotnet run --project tools/ghost-standards-check
dotnet run --project tools/artefact-cache-check
cd WebApp && npm test && npx tsc --noEmit -p .; cd ..
```

Expected: the Step 5 outputs; `ghost-standards-check` and `artefact-cache-check` as Task 3 left them (this task changes no file they compile); `npm test` all green at Task 3's count (master: 991 passed, 74 files — this task adds no test, it repoints two); `tsc`: 24 errors, none in `guideline-bds.test.ts` or `artefact-store.test.mjs`.

```bash
git grep -n "GhostGuidelinePath\|GhostTypeCatalogPath\|GhostLayerRulesetPath\|Resources.bds-" -- SentinelAddin tools WebApp/src WebApp/bridge
git diff HEAD -- "SentinelAddin/*.cs" | grep "^+" | grep -E "BDS|AST_"
```

Expected: no output from either (exit 1): nothing reads the deleted settings or a shipped BDS file, and no office literal entered the add-in's code.

- [ ] **Step 15: Commit**

```bash
git add SentinelAddin/Commands.GhostBuilder.cs SentinelAddin/Commands.Massing.cs SentinelAddin/Commands.Annotate.cs SentinelAddin/Commands.Datum.cs SentinelAddin/App.cs SentinelAddin/Engine/SettingsManager.cs SentinelAddin/Sentinel.csproj SentinelAddin/GhostBuilder/ViewPlanner.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/UI/GhostReviewWindow.cs tools/guideline-check/Check.cs tools/annotate-check/Check.cs tools/wallpair-check/SampleRun.cs tools/ghost-p2-check/Check.cs WebApp/src/sentinel-core/guideline-bds.test.ts WebApp/bridge/artefact-store.test.mjs
git status --short
```

Expected `git status --short` (besides the untracked `.claude/`): the 17 files above as `M `, plus `R  SentinelAddin/Resources/bds-guideline.json -> demo/bds-pilot/bds-guideline.json`, `D  SentinelAddin/Resources/bds-layers.json`, `M  demo/bds-pilot/bds-layers.json`.

```bash
git commit -m "feat(revit): Ghost Builder, Photo Massing and Annotate Views build with the project's layers@n, guideline@n and type_catalog@n — resolved off the API thread, named in the review header and every summary (walls typed by the guideline, by the mapping, as a declared placeholder, or left as a reported gap); Annotate refuses on none; the ghost_* standard settings and the shipped Resources/bds-*.json are gone (moved to demo/bds-pilot/)

Harnesses read demo/bds-pilot/ and no machine file: guideline-check 17/17, annotate-check ALL PASS (16), wallpair-check 9/9 + sample OK, ghost-p2-check unchanged.
First green add-in build since Task 1 (2024 and 2025).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

A. Step 1, C# harnesses: Task 3 already moved guideline-check, annotate-check and wallpair-check to `FromBodies`, so master's text no longer exists. Keep each of Step 1's five new blocks as written, and use Task 3 Step 8's replacement text as the old text:
- guideline-check (a): replace Task 3's block beginning `        // The REAL office files, read as the add-in reads an installed guideline@n / type_catalog@n body` and ending `        Ok(m.HasCatalog, "type catalogue loaded" + (catalogError == null ? "" : " — " + catalogError));`.
- guideline-check (b): replace Task 3's line `        Ok(gap.Why != null && gap.Why.Contains("is not in demo/bds-pilot/bds-type-catalog.json"), "…and says why, naming the catalogue it checked");`.
- guideline-check (c): replace Task 3's block beginning `        // nothing installed must degrade, not throw — and never reach for a file on the machine` and ending `           "no guideline installed → 'no guideline' (no error, no fallback file) instead of throwing");`.
- annotate-check: replace Task 3's three lines beginning `// the BDS pilot guideline parses with the new sections (read as an installed guideline@n body; no catalogue)`.
- wallpair-check `SampleRun.cs`: replace Task 3's five lines beginning `        var g = GuidelineMatcher.FromBodies(` and ending `        g.CatalogLabel = "demo/bds-pilot/bds-type-catalog.json";`.
Verified: guideline-check 17/17, annotate-check ALL PASS (16 checks), wallpair-check 9/9 plus the sample OK.

B. Step 1: drop the `tools/ghost-p2-check/Check.cs:201-213` edit. Task 2 already replaced :198-213 to read `demo/bds-pilot/bds-layers.json` with `new LayerMapper(llm, standard, projectKey: "")`. Remove `tools/ghost-p2-check/Check.cs` from Files and from Step 15's `git add`.

C. Steps 2 and 5, expected output: `ghost-p2-check` reads `42/42 checks pass` (Task 2's total), not 38/38. Delete Step 2's parenthetical "(Before Step 1 the three C# harnesses did not build at all …)": after Task 3 they build and pass against `SentinelAddin/Resources/`. The RED after Step 1 is as listed: FileNotFound for `demo\bds-pilot\bds-guideline.json`, CS0117 `NothingToPlan` ×3, and the two vitest files failing.

D. Drop Step 7 entirely. Task 3 already added `WallsByGuideline`, `WallsByMapping` and `WallGaps` (a massing placeholder is counted in `WallGaps`), the `typedBy` tally in `PlaceWall` and the report copy. There is no `WallsPlaceholder`. Applying Step 7 duplicates fields (CS0102). Remove `ElementPlacementFactory.cs` and `GhostBuilder_ExtractionAndPlacement.cs` from Files and from Step 15's `git add`.

E. Drop Step 8 entirely. Task 2 already added the `_standards` TextBlock and the required `standardsHeader` parameter of `GhostReviewWindow.Load`; `SetStandards` would duplicate the field (CS0102). Remove `UI/GhostReviewWindow.cs` from Files and from Step 15's `git add`.

F. Step 9, phase-2 replacement: in the new text replace `                mapper = new LayerMapper(llm, cachePath: ArtefactCache.PathFor(key, "dwg_mappings"), matcher: resolved.Layers);` with `                mapper = new LayerMapper(llm, resolved.Layers, key);`. Task 2's constructor derives `%AppData%\Sentinel\cache\<key>\dwg_mappings.json` itself, and for an unbound document remembers nothing.

G. Step 9, review-open replacement: the new text's two lines
```
                    review.SetStandards(resolved.Header); // what maps and types this proposal, named before Build
                    review.Load(mapping, perLayer, doc.Title);
```
become one line:
```
                    review.Load(mapping, perLayer, doc.Title, resolved.Header); // the header names what maps and types this proposal
```

H. Step 9, `WallsLine`: in the new text, the two lines
```
        if (r.WallsPlaceholder > 0) parts.Add($"{r.WallsPlaceholder} given a placeholder type (retype before issue)");
        if (r.WallGaps > 0) parts.Add($"{r.WallGaps} left as a reported gap (each named below)");
```
become
```
        if (r.WallGaps > 0) parts.Add($"{r.WallGaps} left as a reported gap (each named below; a massing placeholder is noted for retyping)");
```
In the Interfaces section, `Produces` loses the four-counter line, and the "What each surface says" `Walls:` row drops the placeholder part.

I. Step 6 expected output: exactly 6 errors on each version — the three in `Commands.GhostBuilder.cs` from Task 2 (`(173,72)` CS0117, `(173,26)` CS7036 `projectKey`, `(297,28)` CS7036 `standardsHeader`) and the three CS0117 `GuidelineMatcher.Load` from Task 3.

J. Step 14 expected output:
- Both builds: 0 errors, with warnings exactly master's (verified: 2024 has 6, 2025 has 3; the 2025 Annotate CS8600 moves to lines 76 and 88).
- `ghost-standards-check` 124/124, its fixture line now `demo\bds-pilot\bds-guideline.json parses: it installs as guideline@n`.
- `artefact-cache-check` 53/53, `gate-check` 123/123.
- npm test 991 passed in 74 files; tsc 24 errors.
Step 15: `git status --short` shows the 13 remaining files as `M`, plus the R, D and M lines for the moved BDS files. In the commit message, "(walls typed by the guideline, by the mapping, as a declared placeholder, or left as a reported gap)" becomes "(walls typed by the guideline, by the mapping, or left as a reported gap)", and "ghost-p2-check unchanged" becomes "ghost-p2-check 42/42 unchanged".

K. Cross-task notes: Part C's "spec inconsistency" note is obsolete. With Task 3, a massing wall with guideline none is a gap whose placeholder note names `type_catalog@1 · office · …` (Aster's catalogue), provided Massing passes `standards.Guideline`, which Step 10 does.

---

### Task 5: Fixtures and docs — both type catalogues install as `type_catalog@n` (`template`, never a top-level `source`), Aster's harvest leaves the workstation for `demo/aster/aster-type-catalog.json`; INSTALL, the base standard, the layer standard, the pilot and Aster READMEs, Session B7 and the capability row say where layers, guideline and type catalogue come from

**Files:**
- Modify: `demo/bds-pilot/bds-type-catalog.json` (lines 1-3: the top-level `"source"` string and `"extracted_at"` become a `"template"` object; the other 342 KB are not touched — a line-level script, Step 3)
- Create: `demo/aster/aster-type-catalog.json` (from `%AppData%\Sentinel\type-catalog.json`: the `AST_Template` harvest of 2026-09-25 06:14, 1239 types, 40 view templates, top-level `source`, `path`, `extracted_at`, `count`, `types`, `view_templates`; lines 1-4 reshaped the same way, every later byte identical)
- Modify: `WebApp/bridge/artefact-store.test.mjs` (lines 316-318 as Task 4 leaves them — Task 4 changes line 315 only, the guideline path)
- Modify: `SentinelAddin/INSTALL.md` (lines 32-43)
- Modify: `config/base-standard/README.md` (lines 13-14 and 32-34)
- Modify: `docs/BDS_DWG_LAYER_STANDARD.md` (line 5, lines 117-120, lines 124-133)
- Modify: `demo/bds-pilot/README.md` (three rows and a paragraph after line 14)
- Modify: `demo/aster/README.md` (one row after line 20)
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B7` inserted before line 125 `## Session C — Validate panel (the referee's home turf)`, i.e. after the B6 table and its blank line 124)
- Modify: `docs/handbook/05-capability-status.md` (line 16's sentence about phase 4b-2; new row after line 16)
- Modify (found by the sweep, not in the spec's list): `docs/SENTINEL_HANDBOOK.md` (lines 102, 215, 225-227), `docs/CAPABILITY_MAP.md` (line 38), `demo/ghost-sample/README.md` (lines 37, 48)
- Read for reference: the spec's "Definition of done" (4b-2), Decisions 4, 8, 9, "4b-2 → Drill (Session B7)", "Pilot cut-over and the workstation", "Docs that change"; `WebApp/bridge/artefact-store.mjs:168-184` (the `type_catalog` validator: `types` non-empty, ≤ 20 000, `{category, type}` filled; `template` an object with a filled `title`, `path?`/`extracted_at?` strings; a top-level `source` is not refused by the validator — it is lost in transit); `WebApp/bridge/bcf-service.mjs:1104-1105` (the PUT route lifts a top-level `source` object and strips any top-level `source`) and `WebApp/bridge/artefact-import.mjs:28-31` (the CLI overwrites `source` with `{file, imported_at}` and prints `Installed on <key>: <kind>@<n> · project · <sha 12>… · by <actor>`); `SentinelAddin/Commands.Standards.cs:52-78` (the harvest's shape — `source`, `path`, `extracted_at`, `count`, `types`, `view_templates` — which Task 3 turns into the export with `template`); `docs/TESTING_PROTOCOL.md:85-124` (the B5 and B6 tables: `| Step | Pass criteria |`, no `|` inside a cell); `docs/handbook/05-capability-status.md:16` (the 4b-1 row); `demo/bds-pilot/samples/BDS-sample-plan.dxf` (layers `A-WALL-EXT`, `A-WALL-INT`, `A-DOOR`, `A-WIND`, `A-FLOR`, `A-COLS`, `EXTERIOR-ENVELOPE`, `A-ANNO-TEXT`; walls drawn as centrelines, no thickness); `demo/ghost-sample/make-wall-thickness-sample.py:12-18` (the 200/300/100/250 mm walls and the 275 mm gap wall); `SentinelAddin/Resources/bds-layers.json` (the 16 BDS rows, `A-COLS` and `A-WIND` among them); `demo/bds-pilot/bds-type-catalog.json` Walls (`BDS_EXT_ARC_CMU_100/200/300/400 mm` — the 275 mm wall's siblings); `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs:126-195` (guideline, gap and massing-placeholder paths) and `GhostTypeCreator.cs:53-54` (the first-Basic-wall clone Task 3 removes); `SentinelAddin/Commands.Annotate.cs:30-35` and the pinned strings of Tasks 1-4 that Session B7 quotes (`GhostStandards.Header`, the `ArtefactClient.None` labels, the Annotate refusal, the `GhostTypeCreator` gap, the Build Office System dialog, the `LayerMapping.Source` words and `not mapped — local model unreachable`).

**Interfaces:**
- Consumes: `validateArtefact(kind, body)` (`WebApp/bridge/artefact-store.mjs:84`, unchanged); `readRepoJson(rel)` (`WebApp/bridge/artefact-store.test.mjs:289`); the strings Tasks 1-4 pin, quoted verbatim in Session B7: `Layers: <label> · Guideline: <label> · Type catalogue: <label>`; `none — not installed for <key> or its office`; `none — not bound — Sentinel ▸ Project Setup`; `Guideline: none — not installed for <key> or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.`; `gap: <type> — no sibling type in this document (type_catalog: <label>)`; `Type catalogue exported (N types from <title>) → <path>. Install it on the office: node bridge/artefact-import.mjs <path> --project <office> --kind type_catalog.`; the row tiers `standard`, `heuristic`, `llm`, `cache`, `unmapped` and `not mapped — local model unreachable`; ` (cached HH:mm)`.
- Produces:
  - `demo/bds-pilot/bds-type-catalog.json` and `demo/aster/aster-type-catalog.json`, each a `type_catalog@n` body: top-level `template: {title, path?, extracted_at}` (the BDS harvest has no `path`), no top-level `source`, `count` equal to `types.length`; the rest of each file byte-identical to its harvest. The BDS `template.title` is `BDS_Project Number_Project Name (Template)` (1434 types, 32 view templates); the Aster one `AST_Template` (1239 types, 40 view templates).
  - A permanent test that both fixtures validate and carry `template` (`artefact-store.test.mjs`, one new case).
  - `## Session B7 — layers, guideline and type catalogue from the project` in `docs/TESTING_PROTOCOL.md`, which the controller's Task 6 runs; the capability row "Layers, guideline and type catalogue from the project" (🟩 Built; the ✅ flip belongs to Task 6).
- No C#, csproj or harness file changes: the add-in builds as Task 4 left it.

- [ ] **Step 1: Write the failing test — both fixtures install as they are**

In `WebApp/bridge/artefact-store.test.mjs`, lines 316-318 (Task 4 has already repointed line 315 to `demo/bds-pilot/bds-guideline.json`; these three lines are as on master):

```js
    const { source, ...harvest } = readRepoJson("demo/bds-pilot/bds-type-catalog.json");   // the harvest's source becomes template
    expect(validateArtefact("type_catalog", { ...harvest, template: { title: source } })).toBe(true);
  });
```

become:

```js
    expect(validateArtefact("type_catalog", readRepoJson("demo/bds-pilot/bds-type-catalog.json"))).toBe(true);
    expect(validateArtefact("type_catalog", readRepoJson("demo/aster/aster-type-catalog.json"))).toBe(true);
  });
  it("the type-catalogue fixtures carry the harvest's title under template, never a top-level source the install route strips", () => {
    for (const f of ["demo/bds-pilot/bds-type-catalog.json", "demo/aster/aster-type-catalog.json"]) {
      const c = readRepoJson(f);
      expect(c).not.toHaveProperty("source");
      expect(c.template.title).toEqual(expect.any(String));
      expect(c.types).toHaveLength(c.count);
    }
  });
```

- [ ] **Step 2: Run it — it fails**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: `Tests  2 failed | 95 passed (97)` (the counts assume Tasks 1-4 added no case to this file): "accepts the seeds and the pilot's files as they will be installed" fails with `ENOENT: no such file or directory, open '…\demo\aster\aster-type-catalog.json'`, and "the type-catalogue fixtures carry the harvest's title under template, …" fails with `expected { …(5) } to not have property "source"`.

- [ ] **Step 3: Reshape the BDS catalogue in place and write Aster's from the workstation harvest**

Run from the repo root (Git Bash; the heredoc is quoted, and the script holds no backslash):

```bash
node - <<'EOF'
// A Build Office System harvest becomes a type_catalog@n body: its top-level "source" (and "path", "extracted_at")
// move under "template" — the install route strips a top-level source (bcf-service.mjs:1104-1105). Line-level, so
// every other byte (System.Text.Json's escapes, the line endings) stays as the harvest wrote it. No backslash in
// this script on purpose: it survives any shell's quoting.
const fs = require("fs"), path = require("path");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
function reshape(from, to, want) {
  const lines = fs.readFileSync(from, "utf8").split(LF);
  const eol = lines[0].endsWith(CR) ? CR + LF : LF;
  const raw = (i, key) => { const l = lines[i].replace(CR, ""), p = '  "' + key + '": '; return l.startsWith(p) ? l.slice(p.length, -1) : null; };
  const title = raw(1, "source"), where = raw(2, "path"), at = raw(where === null ? 2 : 3, "extracted_at");
  if (lines[0].replace(CR, "") !== "{" || title === null || at === null) throw new Error(from + ": does not start with source, [path,] extracted_at (already reshaped?)");
  const head = ["{", '  "template": {', '    "title": ' + title + ",", ...(where === null ? [] : ['    "path": ' + where + ","]), '    "extracted_at": ' + at, "  },"];
  const out = head.join(eol) + eol + lines.slice(where === null ? 3 : 4).join(LF);
  const body = JSON.parse(out);
  if ("source" in body || body.template.title !== want.title || body.types.length !== want.count || body.count !== want.count)
    throw new Error(from + ": expected " + want.title + " with " + want.count + " types, got " + body.template.title + " with " + body.types.length);
  fs.writeFileSync(to, out);
  console.log(to + ": template " + JSON.stringify(body.template) + ", " + body.types.length + " types, " + body.view_templates.length + " view templates");
}
// The workstation's harvest — Aster's AST_Template, 2026-09-25 — is read once here and never again by anything.
const machine = ["type-catalog.json", "type-catalog.json.bak"].map((f) => path.join(process.env.APPDATA, "Sentinel", f)).find((f) => fs.existsSync(f));
reshape("demo/bds-pilot/bds-type-catalog.json", "demo/bds-pilot/bds-type-catalog.json", { title: "BDS_Project Number_Project Name (Template)", count: 1434 });
reshape(machine, "demo/aster/aster-type-catalog.json", { title: "AST_Template", count: 1239 });
EOF
```

Expected output, exactly:

```
demo/bds-pilot/bds-type-catalog.json: template {"title":"BDS_Project Number_Project Name (Template)","extracted_at":"2026-07-23T18:02:04.2218359+02:00"}, 1434 types, 32 view templates
demo/aster/aster-type-catalog.json: template {"title":"AST_Template","path":"C:\\Users\\yazan\\Desktop\\Sentinel Test Folder\\Demo\\aster\\AST_Template.rte","extracted_at":"2026-09-25T06:14:40.5392458+02:00"}, 1239 types, 40 view templates
```

The script refuses (throws, writes nothing for that file) if a file does not start with `source`, [`path`,] `extracted_at` — e.g. run twice — or if the workstation file is no longer the `AST_Template` harvest of 1239 types (a later Build Office System run on another template overwrote it). Then stop and restore the harvest from `%AppData%\Sentinel\type-catalog.json.bak` or from the Aster run's copy; never commit another template's catalogue as Aster's. The first lines of the new fixture read:

```
{
  "template": {
    "title": "AST_Template",
    "path": "C:\\Users\\yazan\\Desktop\\Sentinel Test Folder\\Demo\\aster\\AST_Template.rte",
    "extracted_at": "2026-09-25T06:14:40.5392458\u002B02:00"
  },
  "count": 1239,
```

(`\u002B` is System.Text.Json's escape for `+`, kept as the harvest wrote it.)

- [ ] **Step 4: Run it — it passes; the four bodies Session B7 installs validate; nothing else moved**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: `Tests  97 passed (97)` (one more than before this task).

Run (repo root):

```bash
cd WebApp && node --input-type=module -e "
import { validateArtefact } from './bridge/artefact-store.mjs';
import { readFileSync } from 'node:fs';
for (const [kind, f] of [['layers', 'bds-pilot/bds-layers.json'], ['guideline', 'bds-pilot/bds-guideline.json'], ['type_catalog', 'bds-pilot/bds-type-catalog.json'], ['type_catalog', 'aster/aster-type-catalog.json']])
  console.log(kind, f, validateArtefact(kind, JSON.parse(readFileSync('../demo/' + f, 'utf8'))));
"
```

Expected:

```
layers bds-pilot/bds-layers.json true
guideline bds-pilot/bds-guideline.json true
type_catalog bds-pilot/bds-type-catalog.json true
type_catalog aster/aster-type-catalog.json true
```

(`bds-layers.json` and `bds-guideline.json` are the copies Task 4 moved from `SentinelAddin/Resources/`.)

Run: `git diff --stat demo/bds-pilot/bds-type-catalog.json`
Expected: `1 file changed, 4 insertions(+), 2 deletions(-)`.

Run: `cmp <(tail -n +5 "$APPDATA/Sentinel/type-catalog.json") <(tail -n +7 demo/aster/aster-type-catalog.json) && echo identical`
Expected: `identical` (only the four head lines changed shape).

Run: `dotnet run --project tools/naming-check`, `dotnet run --project tools/guideline-check`, `dotnet run --project tools/wallpair-check`, `dotnet run --project tools/ghost-standards-check`
Expected: each ends `<n>/<n> checks pass` (`naming-check`: `37/37 checks pass`) — they read `demo/bds-pilot/bds-type-catalog.json`, whose `types` did not change.

Run: `cd WebApp && npm test`
Expected: `Test Files  74 passed (74)`, `Tests  992 passed (992)` (master 991 + this task's case, if Tasks 1-4 added no vitest case; otherwise one more than after Task 4).

- [ ] **Step 5: Commit the fixtures**

```bash
git add demo/bds-pilot/bds-type-catalog.json demo/aster/aster-type-catalog.json WebApp/bridge/artefact-store.test.mjs
git commit -m "test(fixtures): both type catalogues install as type_catalog@n — the harvest's title moves under template (the install route strips a top-level source); Aster's AST_Template harvest leaves the workstation for demo/aster/aster-type-catalog.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Master grep that Steps 6-13 must empty (repo root; `.` stands for the backslash — Git Bash mangles `\\` in the pattern and silently matches nothing):

`git grep -n -i -E 'Resources.bds-(guideline|layers)|AppData%.Sentinel.(bds-guideline|bds-layers|layers\.json|type-catalog\.json|dwg_mappings)|ghost_(layer_ruleset|guideline|type_catalog)_path|until phase 4b-2|it becomes an artefact .phase 4b-2|GhostBuilder loads|deterministic BDS-standard match|creating it if the template lacks it' -- '*.md' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`

hits today exactly: `SentinelAddin/INSTALL.md:41`, `config/base-standard/README.md:14`, `:33`, `demo/ghost-sample/README.md:48`, `docs/BDS_DWG_LAYER_STANDARD.md:133`, `docs/CAPABILITY_MAP.md:38`, `docs/SENTINEL_HANDBOOK.md:102`, `:225`, `:226`, `docs/handbook/05-capability-status.md:16`.

- [ ] **Step 6: `SentinelAddin/INSTALL.md`**

Current lines 32-43:

```markdown
- Standards are not files on the workstation. A model judges by the `ruleset@n`, `ids@n`, `naming@n` and
  `contract@n` (the IFC delivery contract) installed on its web project, or on that project's office: bind
  each model in Sentinel ▸ Project Setup. Install any of the seven kinds (`ruleset`, `ids`, `naming`,
  `contract`, `layers`, `guideline`, `type_catalog`) from the web (Project Settings ▸ Standards in force ▸
  Install JSON…, as a lead or owner; Packs; Documents) or with
  `node bridge/artefact-import.mjs <file> --project <key> --kind <kind>`; the bridge refuses a body its judge
  could not use. Seeds to start from: `config/base-standard/`. There is no `ruleset.json` or
  `delivery-contract.json` in `%AppData%` or `%ProgramData%` any more, and no bundled fallback: with no
  `contract@n` the IFC Delivery Gate certifies `NOT_CHECKED`, never a pass.
- Until phase 4b-2, Ghost Builder, Photo Massing and Annotate Views still read the DWG layer mapping, the
  modelling guideline and the type catalogue from this machine; a `layers@n`, `guideline@n` or
  `type_catalog@n` installed on a project is validated and listed, but Revit does not read it yet.
```

becomes:

```markdown
- Standards are not files on the workstation. A model judges and builds by the artefacts installed on its
  web project, or on that project's office: `ruleset@n`, `ids@n`, `naming@n`, `contract@n` (the IFC
  delivery contract) and, for Ghost Builder, Photo Massing and Annotate Views, `layers@n` (the DWG layer
  mapping), `guideline@n` (the modelling guideline) and `type_catalog@n` (the office template's types).
  Bind each model in Sentinel ▸ Project Setup. Install any of the seven kinds from the web (Project
  Settings ▸ Standards in force ▸ Install JSON…, as a lead or owner; Packs; Documents) or with
  `node bridge/artefact-import.mjs <file> --project <key> --kind <kind>`; the bridge refuses a body its judge
  could not use. Seeds to start from: `config/base-standard/`. No standard is read from `%AppData%`,
  `%ProgramData%` or beside the DLL any more (`ruleset.json`, `delivery-contract.json`, `type-catalog.json`,
  `bds-layers.json`, `bds-guideline.json`), and there is no bundled fallback: with no `contract@n` the IFC
  Delivery Gate certifies `NOT_CHECKED`, never a pass; with no `guideline@n` Annotate Views refuses, and
  Ghost Builder and Photo Massing build with every header and summary naming what is none
  ("none — not installed for <key> or its office").
- Ghost Builder maps a DWG layer by the installed `layers@n` before anything it remembers: only a layer the
  standard does not name reuses an earlier answer of the local model, kept per project at
  `%AppData%\Sentinel\cache\<key>\dwg_mappings.json` and stamped with the `layers@n` sha it was given
  under (an answer from another sha is not reused). The machine-wide
  `%AppData%\Sentinel\dwg_mappings.json` of earlier versions is not read. The settings
  `ghost_layer_ruleset_path`, `ghost_guideline_path` and `ghost_type_catalog_path` are ignored, and a
  `Resources\bds-*.json` an earlier deploy left beside the DLL is not read: delete it by hand (the build
  copies files forward, it never deletes them).
- Build Office System exports the template's type catalogue to
  `%AppData%\Sentinel\exports\type-catalog-<template title>.json` and names the command that installs it
  on the office (`--kind type_catalog`); the add-in never reads the export.
```

- [ ] **Step 7: `config/base-standard/README.md`**

Current lines 13-14:

```markdown
- **layers.json** — DWG layer → family/category mapping, read by the addin
  from `%AppData%\Sentinel\layers.json`.
```

becomes:

```markdown
- **layers.json** — DWG layer → category/family mapping (the Base AIA-style
  profile; the pilot's is `demo/bds-pilot/bds-layers.json`), installed as the
  project's (or office's) `layers` artefact; Ghost Builder reads it from there
  and names it `layers@n · source · sha`. Revit reads `standard`, `layers[]`
  (`layer`, `category`, `family`, `aliases`) and `ignore[]`; `enforce`,
  `extensions`, `params`, `disciplines`, `match` and `format` stay in the body,
  unread by Revit.
```

Current lines 32-34:

```markdown
6. Copy `layers.json` to `%AppData%\Sentinel\` on each workstation. It is still read from the machine until
   it becomes an artefact (phase 4b-2). The ruleset, IDS, naming standard and delivery contract are never
   copied to a workstation: Revit reads them from the project (or its office) like the web does.
```

becomes:

```markdown
6. Install the layers standard the same way:
   `node bridge/artefact-import.mjs config/<office>-standard/layers.json --project <key> --kind layers`.
   The office's modelling guideline (`--kind guideline`) and the type catalogue of its template have no
   seed here — they are the office's own. Build Office System exports the catalogue to
   `%AppData%\Sentinel\exports\type-catalog-<template title>.json` and names its install command
   (`--kind type_catalog`). With none installed, Ghost Builder, Photo Massing and Annotate Views say so
   ("none — not installed for <key> or its office"), and Annotate Views refuses. Nothing in this pack is
   copied to a workstation: Revit reads every standard from the project (or its office) like the web does.
```

(`config/base-standard/layers.json` itself is unchanged: it validates as `layers` today — `WebApp/bridge/artefact-store.test.mjs:313`.)

- [ ] **Step 8: `docs/BDS_DWG_LAYER_STANDARD.md` — where the standard comes from, the tiers, and `enforce` not applied by Revit**

Current line 5:

```markdown
> Like the naming and IDS rulesets, this is a **configurable reference, not a bible**. BDS is the pilot profile; a future office-agnostic **Base** profile just swaps the ruleset file (`demo/bds-pilot/bds-layers.json`). Enforcement is per-project: `reject` / `warn` / `off`.
```

becomes:

```markdown
> Like the naming and IDS rulesets, this is a **configurable reference, not a bible**. BDS is the pilot profile (`demo/bds-pilot/bds-layers.json`, installed on the office `bds-office` as `layers@1`); the office-agnostic **Base** profile is `config/base-standard/layers.json`. Swapping the standard means installing another `layers@n` on the project or its office. The file's `enforce` (`reject` / `warn` / `off`) is not applied by Revit — see *Compliance / enforcement*.
```

Current lines 117-120 (under `## How it feeds GhostBuilder (deterministic-first)`; the paragraph after them, "This is what keeps an autonomous build reliable …", stays):

```markdown
1. **SENSE** reads each DWG layer.
2. **Compliance check** (the layer gate): does the layer match the standard? Compliant layers get a **deterministic** category/family from this ruleset — no AI needed, confidence = 1.0.
3. **AI only for the gaps:** non-compliant or ambiguous layers are the only ones sent to the interpreter to *propose* a mapping (with a lower confidence) — and to **suggest the compliant rename**.
4. **Non-compliant DWGs** are flagged in the review with the offending layers and a proposed remap to the standard — so the office can fix the source, and the next run is deterministic.
```

becomes:

```markdown
1. **SENSE** reads each DWG layer.
2. **Ignore:** a layer matching the standard's `ignore` globs, or a built-in annotation token (`ANNO`, `TEXT`, `DIM`, `GRID`, …), never reaches the review.
3. **The installed standard:** an exact layer or an alias of the project's `layers@n` gets its category and family deterministically — no AI. These rows are `standard`, and they are the only rows the review pre-ticks.
4. **The project's cache:** an answer the local model gave before on this project, under the same `layers@n` sha (`%AppData%\Sentinel\cache\<key>\dwg_mappings.json`) — a `cache` row.
5. **Heuristics:** a `D-MAJR` parse (`A-WALL-…` → Walls) or a keyword (`WALL`, `DOOR`, …) proposes a generic family — a `heuristic` row, never pre-ticked. With no `layers@n` installed, every model layer is a heuristic or a model guess.
6. **The local model** proposes the rest — an `llm` row, never pre-ticked. If it cannot be reached, those layers read `unmapped` ("not mapped — local model unreachable") and every row above is kept.

The review window's header names the standard: `Layers: layers@n · source · sha`, or `Layers: none — not installed for <key> or its office`. The compliant-rename suggestion and the compliance verdict exist only in the TypeScript reference (`WebApp/src/sentinel-core/layers.ts`), which no tool runs yet.
```

Current lines 124-133:

```markdown
## Compliance / enforcement

Per project, in `bds-layers.json`:
- `reject` — a non-compliant layer blocks the build (strict offices).
- `warn` — build proceeds, non-compliant layers flagged (default — matches the "warn-first" posture).
- `off` — no layer checking (pure-AI mapping).

## The machine-readable ruleset

`demo/bds-pilot/bds-layers.json` is the source of truth GhostBuilder loads (mirrors `naming-ruleset.json` and `bds-ids.json`). Editing the standard = editing that file; no code change. Swap it for a `base-layers.json` to make Sentinel office-agnostic.
```

becomes:

```markdown
## Compliance / enforcement

The file carries `enforce`: `reject` (a non-compliant layer should block the build), `warn` (build and flag) or `off` (no layer checking). **Revit does not apply it:** Ghost Builder reads `standard`, `layers` and `ignore` only, maps every layer by the tiers above and leaves the decision to the reviewer's ticks. The TypeScript reference computes the verdict (`validateLayers`), but no tool calls it; until one does, `enforce` states an intent, it is not a gate.

## The machine-readable ruleset

`demo/bds-pilot/bds-layers.json` is the BDS standard as data. It reaches Ghost Builder only as an artefact: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers` (from `WebApp`) installs it on the office as `layers@n`, and every project attached to the office (`demo`) inherits it. Editing the standard = editing that file and installing it again (`layers@n+1`); no code change, and no copy on a workstation or beside the add-in. The office-agnostic profile is `config/base-standard/layers.json`.
```

- [ ] **Step 9: `demo/bds-pilot/README.md` — the three Ghost standards join the files table**

The end of line 14 (the `delivery-contract.json` row), the blank line 15 and the start of line 16:

```markdown
a project with no contract installed on it or its office reads the gate NOT CHECKED. |

The IFC model itself
```

becomes:

```markdown
a project with no contract installed on it or its office reads the gate NOT CHECKED. |
| `bds-layers.json` | Revit **Ghost Builder** layer mapping (the project's `layers@n`) | The BDS DWG layer standard (`docs/BDS_DWG_LAYER_STANDARD.md`): layer → category and `BDS_*` family, aliases, ignore globs. Installed on `bds-office` as `layers@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers` from `WebApp`); `demo` inherits it. Revit reads `standard`, `layers[]` and `ignore[]`; `enforce`, `extensions`, `params`, `disciplines`, `match` and `format` stay in the body, unread by Revit. |
| `bds-guideline.json` | Revit **Ghost Builder** and **Photo Massing** (wall types), **Annotate Views** (views, view naming) — the project's `guideline@n` | The BDS Office Modelling Guideline. Installed on `bds-office` as `guideline@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project bds-office --kind guideline` from `WebApp`); `demo` inherits it. |
| `bds-type-catalog.json` | the guideline's type check in **Ghost Builder** and **Photo Massing** (the project's `type_catalog@n`) | The 1,434 types and 32 view templates Build Office System harvested from the BDS template, the harvest's title under `template` (a top-level `source` would be stripped by the install route). Installed on `bds-office` as `type_catalog@1` (`node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project bds-office --kind type_catalog` from `WebApp`); `demo` inherits it. The open document still decides whether a type is present. |

None of these is copied to a workstation or shipped beside the add-in: a project with none installed on it or
its office reads `none — not installed for <key> or its office` in Ghost Builder, Photo Massing and Annotate
Views.

The IFC model itself
```

- [ ] **Step 10: `demo/aster/README.md` — the Aster catalogue joins the committed kit**

The end of line 20 (the `ruleset-AST.json` row):

```markdown
(not a machine file). | asserted free of `BDS` | 2.1 |
```

becomes:

```markdown
(not a machine file). | asserted free of `BDS` | 2.1 |
| `aster-type-catalog.json` | The type catalogue Build Office System harvested from `AST_Template` on 2026-09-25: 1,239 types and 40 view templates, the harvest's title, path and time under `template`. Install as `type_catalog@1` on the office with `node bridge/artefact-import.mjs ../demo/aster/aster-type-catalog.json --project aster-office --kind type_catalog` from `WebApp` (not a machine file). Aster has no layers, guideline or contract artefact on purpose: Ghost Builder, Photo Massing and Annotate Views read those as none. | `validateArtefact("type_catalog", …)` in `WebApp/bridge/artefact-store.test.mjs` | 3.9, B7 |
```

- [ ] **Step 11: Protocol — Session B7, inserted before line 125 (`## Session C — Validate panel (the referee's home turf)`)**

```markdown
## Session B7 — layers, guideline and type catalogue from the project

| Step | Pass criteria |
|---|---|
| Pilot cut-over (before deploy) | the managed bridge runs the branch; from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers`, `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project bds-office --kind guideline`, `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-type-catalog.json --project bds-office --kind type_catalog` and `node bridge/artefact-import.mjs ../demo/aster/aster-type-catalog.json --project aster-office --kind type_catalog` → each prints `Installed on <office>: <kind>@1 · project · <sha 12>… · by cli`; `GET /cde/demo/artefacts/layers`, `GET /cde/demo/artefacts/guideline` and `GET /cde/demo/artefacts/type_catalog` → 200 with `source: "office"` and `ref` `layers@1`, `guideline@1`, `type_catalog@1`, the catalogue's `body.template.title` `BDS_Project Number_Project Name (Template)` and 1434 `body.types`; `GET /cde/aster-tower/artefacts/type_catalog` → 200, `type_catalog@1`, `source: "office"`, `body.template.title` `AST_Template` and 1239 `body.types`; `GET /cde/aster-tower/artefacts/layers` and `GET /cde/aster-tower/artefacts/guideline` → 404 `reason: "not_installed"`; `GET /cde/aster-villa/artefacts/contract` still 404 `not_installed` |
| Deploy | Revit closed → in `%AppData%\Sentinel\`, `type-catalog.json` renamed `type-catalog.json.bak` and `dwg_mappings.json` renamed `dwg_mappings.json.bak` (never deleted); the keys `ghost_layer_ruleset_path`, `ghost_guideline_path` and `ghost_type_catalog_path` removed from `config.json`; `Resources\bds-guideline.json` and `Resources\bds-layers.json` deleted from `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\` and from `SentinelAddin\bin\Release\2024\` where present (the build copies files forward, it never deletes them); `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the deployed `Resources` folder holds no `bds-*.json`, and neither does `SentinelAddin/Resources/` on the branch |
| Harnesses (after the renames above) | from the repo root, with no `%AppData%\Sentinel\type-catalog.json` on the machine: `dotnet run --project tools/ghost-standards-check`, `dotnet run --project tools/guideline-check`, `dotnet run --project tools/wallpair-check` and `dotnet run --project tools/ghost-p2-check` each end `<n>/<n> checks pass`, and `dotnet run --project tools/annotate-check` ends `ALL PASS`; `cd WebApp && npx vitest run src/sentinel-core/guideline-bds.test.ts bridge/artefact-store.test.mjs` is green — no harness or test reads the workstation |
| Demo Tower — Ghost Builder review | the Demo Tower model (bound to `demo`), a plan view, `demo/bds-pilot/samples/BDS-sample-plan.dxf` imported (Insert ▸ Import CAD, millimetres, or picked from the Ghost source folder); Ollama running; no `%AppData%\Sentinel\cache\demo\dwg_mappings.json` yet; Sentinel ▸ Ghost Builder on the import → the review window's header reads `Layers: layers@1 · office · <sha 12>… · Guideline: guideline@1 · office · <sha 12>… · Type catalogue: type_catalog@1 · office · <sha 12>…` (the catalogue named on this first fetch, not a none from a timeout); `A-WALL-EXT`, `A-WALL-INT`, `A-DOOR`, `A-WIND`, `A-FLOR` and `A-COLS` are `standard` rows naming `BDS_*` families and start ticked; `EXTERIOR-ENVELOPE` is an `llm` row and starts unticked; `A-ANNO-TEXT` is not listed; nothing is built before Build |
| Demo Tower — Ghost Builder build | Cancel the review above (the sample plan's walls are centrelines with no thickness for the guideline to read); import `demo/ghost-sample/sample-wall-thickness.dxf` (walls drawn as two faces: 200, 300, 100, 250 and one 275 mm) and run Ghost Builder; Build with the ticks as they are → the summary repeats the header's three labels and says which walls `guideline@1` typed (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_300 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_EXT_STR_CONC_250 mm`, each placed where the model has the type, otherwise named as missing from this document); the 275 mm wall is either typed `BDS_EXT_ARC_CMU_275 mm`, created from the nearest CMU sibling the model has and listed under the created types, or — when the model has no CMU sibling — reported as `gap: BDS_EXT_ARC_CMU_275 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · <sha 12>…)`; no gap text says "this office's template"; one Ctrl+Z removes the whole build |
| Per-project mapping cache | after an Ollama-up run on Demo Tower: `%AppData%\Sentinel\cache\demo\dwg_mappings.json` exists, holds the `EXTERIOR-ENVELOPE` answer and is stamped with the 64-hex `sha256` that `GET /cde/demo/artefacts/layers` returns; `%AppData%\Sentinel\dwg_mappings.json` is not re-created; a second Ghost Builder run on the same import shows `EXTERIOR-ENVELOPE` as a `cache` row, unticked, and the six `standard` rows still `standard` (the installed standard answers before the cache) |
| Local model unreachable | quit Ollama; delete `%AppData%\Sentinel\cache\demo\dwg_mappings.json`; Ghost Builder on the same import → the review window still opens (the run does not fail on the model); the six `standard` rows are there and ticked; `EXTERIOR-ENVELOPE` is an `unmapped` row reading `not mapped — local model unreachable`, unticked; Cancel, start Ollama again |
| Aster Tower — Ghost Builder with no layers or guideline | the Aster Tower model (bound to `aster-tower`), the same DXF imported; count the types whose name starts `BDS_` (Project Browser ▸ search `BDS_`); Ghost Builder → header `Layers: none — not installed for aster-tower or its office · Guideline: none — not installed for aster-tower or its office · Type catalogue: type_catalog@1 · office · <sha 12>…`; the six `A-*` layers are `heuristic` rows with generic families (`Generic Wall`, `Generic Door`, …), none ticked; `EXTERIOR-ENVELOPE` is an `llm` row asked afresh — `demo`'s cache does not answer it — and `%AppData%\Sentinel\cache\aster-tower\dwg_mappings.json` is written; tick `A-WALL-EXT` and Build → the summary repeats the three labels and says the walls were typed by the mapping because the guideline is none (the pre-guideline behaviour); the `BDS_` type count is unchanged; one Ctrl+Z, close without saving |
| Annotate Views — Aster | Aster Tower → Sentinel ▸ Annotate Views refuses with exactly `Guideline: none — not installed for aster-tower or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.` and creates no view |
| Annotate Views — Demo | Demo Tower → the result names `guideline@1 · office · <sha 12>…` and creates the guideline's WIP views per level (a rerun counts them under "Skipped (already exist)" and creates none); a view template the model lacks is named in a warning, never invented |
| Photo Massing — Demo | Demo Tower, Project Setup ▸ Ghost source folder = a folder of the Seagram images (`demo/aster/photos/`, built locally per `demo/aster/README.md`), the vision model running → the summary names the guideline `guideline@1 · office · <sha 12>…` and the catalogue `type_catalog@1 · office · <sha 12>…`; one Ctrl+Z removes the build |
| Photo Massing — Aster | Aster Tower, the same folder → the summary names the guideline as `none — not installed for aster-tower or its office` and the catalogue as `type_catalog@1 · office · <sha 12>…`; the massing mapping names no wall type and the guideline is none, so the walls are placed with the document's default wall type, declared in the notes as a placeholder that names the none guideline — never typed `BDS_*`; the `BDS_` type count is unchanged; one Ctrl+Z, close without saving |
| Build Office System export | the Aster template (`AST_Template.rte`, bound to `aster-office`) → Sentinel ▸ Build Office System; close the review window without building → the dialog reads `Type catalogue exported (<n> types from AST_Template) → <path>. Install it on the office: node bridge/artefact-import.mjs <path> --project aster-office --kind type_catalog.`, `<path>` being `%AppData%\Sentinel\exports\type-catalog-AST_Template.json` (`<n>` is 1239 while the template is unchanged since the fixture's harvest); that file's top level has `template` with `title: "AST_Template"`, `path` and `extracted_at`, and no `source`; `%AppData%\Sentinel\type-catalog.json` is not re-created; from `WebApp`, `node bridge/artefact-import.mjs "<path>" --project b6-upload --kind type_catalog` → `Installed on b6-upload: type_catalog@1 · project · <sha 12>… · by cli` and `GET /cde/b6-upload/artefacts/type_catalog` → `body.template.title: "AST_Template"` (the install route kept the title) |
| Catalogue gap — the pilot's guideline in a document without its types | open the Aster Tower model detached from central (Detach and preserve worksets) and Save As `b7-gap.rvt` in a scratch folder; Project Setup ▸ Web project = `demo`; import `demo/ghost-sample/sample-wall-thickness.dxf`; Ghost Builder → the header names the three `· office` labels of `demo`; Build with the ticks as they are → the 275 mm wall on `A-WALL-EXT` is not built and the summary carries `gap: BDS_EXT_ARC_CMU_275 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · <sha 12>…)`; no type named `BDS_EXT_ARC_CMU_275 mm` exists afterwards (before phase 4b-2 the first Basic wall was cloned under that name; a `BDS_Wall_*` type provisioned for a ticked `standard` row is the installed `layers@1`'s own family name, not a shipped file); keep the copy for the next row |
| Catalogue gap — Aster's catalogue under the pilot's guideline | after the two rows above (`b6-upload` now carries Aster's harvest as `type_catalog@1`), from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-guideline.json --project b6-upload --kind guideline` → `Installed on b6-upload: guideline@1 · project · <sha 12>… · by cli`; in `b7-gap.rvt`, Project Setup ▸ Web project = `b6-upload`; Ghost Builder on the `sample-wall-thickness.dxf` import → header `Layers: none — not installed for b6-upload or its office · Guideline: guideline@1 · project · <sha 12>… · Type catalogue: type_catalog@1 · project · <sha 12>…`; tick the `A-WALL-EXT` row (a `heuristic` row) and Build → no `A-WALL-EXT` wall is built: each is a reported gap that names the guideline's type (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_275 mm`, `BDS_EXT_ARC_CMU_300 mm`) and `type_catalog@1 · project · <sha 12>…` — Aster's catalogue, which has no comparable type (simulation F43) — never "this office's template"; no `BDS_EXT_ARC_CMU_*` type is created; discard the copy |
| Unbound | a model with no web project in Project Setup, a DXF imported → Ghost Builder's header reads `Layers: none — not bound — Sentinel ▸ Project Setup · Guideline: none — not bound — Sentinel ▸ Project Setup · Type catalogue: none — not bound — Sentinel ▸ Project Setup`; Annotate Views refuses with `Guideline: none — not bound — Sentinel ▸ Project Setup. Nothing to plan — install a guideline@n with a views section on the project or its office.` |
| Bridge stopped | stop the managed bridge → Ghost Builder on Demo Tower names all three labels with ` (cached HH:mm)`, and Annotate Views names `guideline@1 · office · <sha 12>… (cached HH:mm)`; start the bridge again → the next run loses the suffix |
| Honesty | set `ghost_layer_ruleset_path` and `ghost_guideline_path` in `%AppData%\Sentinel\config.json` to `demo/bds-pilot/bds-layers.json` and `demo/bds-pilot/bds-guideline.json` (full paths) → Annotate Views on Aster Tower still refuses with the none label, and Ghost Builder on Aster Tower still reads `Layers: none — …` with `heuristic` rows; remove both keys again. No review row reads `standard` unless its layer (or an alias) is a row of the installed `layers@n`; no `heuristic`, `llm`, `cache` or `unmapped` row starts ticked; every Ghost Builder, Photo Massing and Annotate Views surface names `kind@n · source · sha` or the none reason |
```

(End the block with one blank line before `## Session C`. Every quoted string is one Tasks 1-4 pin; a row that cannot be run live is recorded **not run** with its reason in Task 6, never rewritten to pass.)

- [ ] **Step 12: Capability row — line 16's forward reference, then the new row after line 16**

In line 16 (the `Delivery contract from the project …` row, ✅), the fragment:

```markdown
Layers, guideline and type catalogue are still read from the workstation by Revit until phase 4b-2. Session B6
```

becomes:

```markdown
Layers, guideline and type catalogue: see the next row. Session B6
```

The end of line 16:

```markdown
Aster NOT CHECKED, unbound, cached; the web upload and Governed Publish on Aster not run live |
```

becomes:

```markdown
Aster NOT CHECKED, unbound, cached; the web upload and Governed Publish on Aster not run live |
| Layers, guideline and type catalogue from the project (`layers@n`, `guideline@n`, `type_catalog@n` read from the project → office by Ghost Builder, Photo Massing and Annotate Views; none named; no office file shipped with the add-in) | 🟩 Built | Ghost Builder, Photo Massing and Annotate Views resolve the standards they use from the document's web project or its office (off the API thread, in parallel; the type catalogue with a 20 s timeout) and name each as `kind@n · source · sha`: the Ghost review window's header and build summary read `Layers: … · Guideline: … · Type catalogue: …`, the Massing summary names the guideline and the catalogue, the Annotate result names the guideline. With none: Annotate refuses ("Guideline: none — not installed for <key> or its office. Nothing to plan — …"); Ghost and Massing build with the none labels — with no layers only the ignore net, labelled `heuristic` guesses and the local model map layers, nothing pre-ticked; with no guideline walls are typed by the mapping (the pre-guideline behaviour, named as such); with no catalogue types are checked against the open document only. Layer tiers: ignore → installed standard → per-project cache (`%AppData%\Sentinel\cache\<key>\dwg_mappings.json`, stamped with the `layers@n` sha) → heuristics → local model; only `standard` rows start ticked; an unreachable local model keeps the deterministic rows and marks the rest `unmapped`. A guideline type the document lacks is created only from a sibling the installed catalogue names and the document has; otherwise it is a reported gap naming `type_catalog@n · source · sha` — never a clone of the first Basic wall under another office's name. Deleted: `LayerRulesetMatcher.BuiltInDefault` and its file chain, `GuidelineMatcher`'s guideline and catalogue file chains, the settings `ghost_layer_ruleset_path`, `ghost_guideline_path`, `ghost_type_catalog_path`, and the `Resources\bds-guideline.json` / `Resources\bds-layers.json` content items (the BDS files live in `demo/bds-pilot/`). Build Office System exports `%AppData%\Sentinel\exports\type-catalog-<template title>.json` (`template: {title, path, extracted_at}`) and names the install command, never `%AppData%\Sentinel\type-catalog.json`. Layers `enforce` stays unapplied. Harnesses: `tools/ghost-standards-check`; `guideline-check`, `annotate-check`, `wallpair-check`, `ghost-p2-check` read `demo/` fixtures only. Moves to ✅ on the Session B7 drill |
```

- [ ] **Step 13: The sweep — handbook, capability map, ghost sample (each still sends a reader to a shipped or machine file)**

`docs/SENTINEL_HANDBOOK.md` line 102 (the Ghost Builder tool row), the fragment:

```markdown
and the **Office Modelling Guideline** picks the exact type (creating it if the template lacks it).
```

becomes:

```markdown
and the project's **Office Modelling Guideline** (`guideline@n`) picks the exact type (a type the document lacks is created from a sibling the installed type catalogue names, or reported as a gap).
```

`docs/SENTINEL_HANDBOOK.md` line 215 (the Standards lead row), the fragment:

```markdown
Project Setup, the Guideline + Layer standard files |
```

becomes:

```markdown
Project Setup, the guideline, layers and type-catalogue artefacts |
```

`docs/SENTINEL_HANDBOOK.md` lines 225-227 (§9 "Where the standards live"):

```markdown
| `SentinelAddin/Resources/bds-guideline.json` | **Office Modelling Guideline** — which family/type per element (layer + material + level), tags, view templates, view naming. |
| `SentinelAddin/Resources/bds-layers.json` | **DWG Layer Standard** — which CAD layer maps to which Revit category/family, aliases, what to ignore. |
| `demo/bds-pilot/bds-type-catalog.json` | The **type catalogue** harvested from the real template (1,434 types) — the guard that stops the tool inventing types the template lacks. |
```

becomes:

```markdown
| `guideline` artefact (pilot data at `demo/bds-pilot/bds-guideline.json`) | **Office Modelling Guideline** — which family/type per element (layer + material + level), tags, view templates, view naming. |
| `layers` artefact (pilot data at `demo/bds-pilot/bds-layers.json`; Base profile `config/base-standard/layers.json`) | **DWG Layer Standard** — which CAD layer maps to which Revit category/family, aliases, what to ignore. |
| `type_catalog` artefact (pilot data at `demo/bds-pilot/bds-type-catalog.json`) | The **type catalogue** harvested from the real template (1,434 types) — the guard that stops the tool inventing types the template lacks. Build Office System exports it; `artefact-import --kind type_catalog` installs it. |
```

`docs/CAPABILITY_MAP.md` line 38 (the GhostBuilder row), the fragment:

```markdown
DWG-layer extract → deterministic BDS-standard match (cache → `bds-layers.json` → local model for the remainder only)
```

becomes:

```markdown
DWG-layer extract → deterministic match by the project's installed `layers@n` (ignore → standard → per-project cache → labelled heuristics → local model for the remainder only)
```

`demo/ghost-sample/README.md` line 37:

```markdown
1. Open Revit, in a project **with at least one Level**.
```

becomes:

```markdown
1. Open Revit, in a project **with at least one Level**, bound in Project Setup to a web project that
   carries a `layers@n` (e.g. `demo`, which inherits `layers@1` from `bds-office`). On a project with no
   `layers@n` the `A-*` rows are labelled `heuristic` and start unticked.
```

`demo/ghost-sample/README.md` line 48, the fragment:

```markdown
Clear it from `%AppData%\Sentinel\dwg_mappings.json` first, or the cache answers and the model is never asked.
```

becomes:

```markdown
Clear it from the project's cache `%AppData%\Sentinel\cache\<key>\dwg_mappings.json` first, or the cache answers and the model is never asked.
```

- [ ] **Step 14: Verify**

Run (repo root): `git grep -n -i -E 'Resources.bds-(guideline|layers)|AppData%.Sentinel.(bds-guideline|bds-layers|layers\.json|type-catalog\.json|dwg_mappings)|ghost_(layer_ruleset|guideline|type_catalog)_path|until phase 4b-2|it becomes an artefact .phase 4b-2|GhostBuilder loads|deterministic BDS-standard match|creating it if the template lacks it' -- '*.md' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`
Expected: exactly these eight hits, each one a line that says the old file is not read or tells the tester to retire it: `SentinelAddin/INSTALL.md:49` (the machine-wide `dwg_mappings.json` is not read), `:50` (the three `ghost_*_path` settings are ignored), `docs/TESTING_PROTOCOL.md:130` (B7 Deploy: renames and deletions), `:131` (B7 Harnesses: no `type-catalog.json` on the machine), `:134` (B7 cache: the machine-wide cache is not re-created), `:141` (B7 export: `type-catalog.json` is not re-created), `:146` (B7 Honesty: the keys set on purpose, then removed), `docs/handbook/05-capability-status.md:17` (the new row names what was deleted). Any other hit is a doc still sending a Ghost standard to a workstation or beside the DLL.

Run: `awk -F'|' '/^## Session B7/,/^## Session C/ { if ($0 ~ /^\|/ && NF != 4) print NR": "NF" fields" }' docs/TESTING_PROTOCOL.md`
Expected: no output (every B7 row has exactly two cells — no `|` inside a cell).

Run: `awk '/^## Session B7/,/^## Session C/' docs/TESTING_PROTOCOL.md | grep -c '^| '`
Expected: `19` (the header row and 18 steps).

Run: `awk -F'|' 'NR==16 || NR==17 { print NR, NF }' docs/handbook/05-capability-status.md`
Expected: `16 5` and `17 5`.

Run: `grep -n "Session B7\|Layers, guideline and type catalogue from the project" docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md`
Expected: `docs/TESTING_PROTOCOL.md:125:## Session B7 — layers, guideline and type catalogue from the project` and `docs/handbook/05-capability-status.md:17:| Layers, guideline and type catalogue from the project (…`.

Run: `git diff --stat -- '*.md'`
Expected: `10 files changed, 91 insertions(+), 34 deletions(-)` (INSTALL, base-standard README, layer standard, pilot README, Aster README, protocol, capability status, handbook, capability map, ghost sample).

- [ ] **Step 15: Commit the docs**

```bash
git add SentinelAddin/INSTALL.md config/base-standard/README.md docs/BDS_DWG_LAYER_STANDARD.md demo/bds-pilot/README.md demo/aster/README.md docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/SENTINEL_HANDBOOK.md docs/CAPABILITY_MAP.md demo/ghost-sample/README.md
git commit -m "docs: layers, guideline and type catalogue from the project — Session B7 drill, capability row (Built), INSTALL / base standard / layer standard (enforce is not applied by Revit) / pilot and Aster READMEs / handbook / capability map / ghost sample with no workstation or bundled Ghost standard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The ✅ flip on the capability row ("Session B7 drill passed <date> (`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`)") and recording the drill belong to the controller's Task 6, not to this task.

**Amendments (controller, after the cross-check — override the task where they conflict):**

A. Step 13: drop the `demo/ghost-sample/README.md` line-48 edit. Task 2 Step 8 already rewrote that row with the per-project cache path. Files: `demo/ghost-sample/README.md` (line 37 only).

B. The master-grep paragraph before Step 6: at the start of Task 5 the grep hits exactly 9 lines — `SentinelAddin/INSTALL.md:41`, `config/base-standard/README.md:14`, `:33`, `docs/BDS_DWG_LAYER_STANDARD.md:133`, `docs/CAPABILITY_MAP.md:38`, `docs/SENTINEL_HANDBOOK.md:102`, `:225`, `:226`, `docs/handbook/05-capability-status.md:16`. `demo/ghost-sample/README.md:48` is gone since Task 2. Step 14's eight hits are unchanged; verified.

C. Step 14: `git diff --stat -- '*.md'` expects `10 files changed, 90 insertions(+), 33 deletions(-)` (verified).

D. Step 11, row `Build Office System export`: replace the fragment
`the dialog reads `Type catalogue exported (<n> types from AST_Template) → <path>. Install it on the office: node bridge/artefact-import.mjs <path> --project aster-office --kind type_catalog.`, `<path>` being`
with
`the dialog begins `Type catalogue exported (<n> types from AST_Template) → <path>. Install it on the office: node bridge/artefact-import.mjs "<path>" --project <office> --kind type_catalog.` (`<office>` is printed as is — the add-in cannot know the office key; for this template it is `aster-office`), `<path>` being`
Make the same change to the Interfaces "pinned strings" list and cross-task note 3: `"<path>"` in quotes and `<office>` literal.

E. Step 11, row `Demo Tower — Ghost Builder review`: before its final ` |`, append
`; in the review a row's tier shows after its element count — nothing for `standard`, `· heuristic guess` for `heuristic`, `· local model` for `llm`, `· local model (remembered)` for `cache`, `· not mapped` for `unmapped` — and its tooltip reads `Why: <rationale>``
The other B7 rows use the tier names (standard, heuristic, llm, cache, unmapped) through this legend.

F. Step 11, row `Local model unreachable`: replace
`EXTERIOR-ENVELOPE` is an `unmapped` row reading `not mapped — local model unreachable`, unticked
with
`EXTERIOR-ENVELOPE` is an `unmapped` row (`· not mapped`) whose tooltip reads `Why: not mapped — local model unreachable (<the HTTP error>)`, unticked
Task 2 appends the exception message in brackets. In cross-task note 4(d) and the Interfaces list, `not mapped — local model unreachable` is a prefix, not the whole string.

G. Step 11, row `Photo Massing — Aster`: replace
`so the walls are placed with the document's default wall type, declared in the notes as a placeholder that names the none guideline — never typed `BDS_*``
with
`so the walls are placed with the document's default wall type and the summary's warnings carry `Placeholder wall type '<default type>' used for <t> mm walls on '<layer>' — gap: <t> mm wall on '<layer>' — guideline: none, and the layer mapping names no wall type (type_catalog: type_catalog@1 · office · <sha 12>…). Retype before issue.` — Aster's own catalogue named in the gap text (spec definition of done) — and the `Walls:` line counts them as left as a reported gap; never typed `BDS_*``
Cross-task notes 5(c) and 5(d) are resolved by Task 3's code. Keep the two `b6-upload` catalogue-gap rows as extra evidence.

H. Step 11, row `Demo Tower — Ghost Builder build`: replace
`says which walls `guideline@1` typed (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_300 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_EXT_STR_CONC_250 mm`, each placed where the model has the type, otherwise named as missing from this document)`
with
`its `Walls:` line counts the walls typed by the guideline (`BDS_EXT_ARC_CMU_200 mm`, `BDS_EXT_ARC_CMU_300 mm`, `BDS_INT_ARC_GYPS_100 mm`, `BDS_EXT_STR_CONC_250 mm` where the model has the type) and those left as a reported gap (a type the model lacks is warned `WallType '<type>' not found (layer '<layer>'); skipped.`)`

I. Step 4: `ghost-standards-check` ends `125/125 checks pass` (+1: `demo\aster\aster-type-catalog.json parses: it installs as type_catalog@n`). `guideline-check` 17/17, `wallpair-check` 9/9, `naming-check` 37/37; `artefact-store.test.mjs` 97; npm test 992 in 74 files — all verified.

J. Step 3: write the node script to a file under the scratchpad and run `node <file>` from the repo root, instead of `node - <<'EOF'` (same content). Verified output is exactly as listed; `cmp` prints `identical`; the BDS diff is 4 insertions and 2 deletions.

K (controller). Privacy: the Aster fixture `demo/aster/aster-type-catalog.json` keeps `template.title` and `template.extracted_at` but **omits `template.path`** — the harvest's path names a workstation folder under the user's profile. Change the reshape script so the Aster template object is `{title, extracted_at}` (the BDS fixture keeps whatever its source already carries); if a later expected output or `cmp` line of this task depends on the path, adjust it to match. `path` is optional in the bridge validator and in `GuidelineMatcher`'s catalogue reader.

---

### Task 6: Pilot and Aster installs, deploy, drill and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch. Install from `WebApp`: `node bridge/artefact-import.mjs ../demo/bds-pilot/bds-layers.json --project bds-office --kind layers`, `… ../demo/bds-pilot/bds-guideline.json --project bds-office --kind guideline`, `… ../demo/bds-pilot/bds-type-catalog.json --project bds-office --kind type_catalog`, `… ../demo/aster/aster-type-catalog.json --project aster-office --kind type_catalog`. Confirm `GET /cde/demo/artefacts/{layers,guideline,type_catalog}` → 200 `· office`, `GET /cde/aster-tower/artefacts/type_catalog` → 200 `· office`, `GET /cde/aster-tower/artefacts/{layers,guideline}` → 404 `not_installed`.
- [ ] **Step 2:** With Revit closed: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; remove the stale deployed `%AppData%\Autodesk\Revit\Addins\2024\Sentinel\Resources\bds-guideline.json` and `bds-layers.json` (the build copies, never deletes); rename `%AppData%\Sentinel\type-catalog.json` and `dwg_mappings.json` to `*.bak` (never delete); clear the three `ghost_*_path` keys from `%AppData%\Sentinel\config.json` if present.
- [ ] **Step 3:** Run Session B7 (`docs/TESTING_PROTOCOL.md`) live on Demo Tower and Aster Tower (Ghost Builder review header and build summary, Annotate refusal on Aster and plan on Demo, Photo Massing on Aster with Aster's catalogue in the gap text, Build Office System export, the local model stopped, bridge stopped → cached labels). Drill exports and harvests go to a local scratch folder, never the office's Autodesk Forma folder. Record Session B7 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; every row not run live is marked **not run** with its reason.
- [ ] **Step 4:** Capability row → ✅; `cd WebApp && npm test`; harnesses green; normalise co-author trailers on the branch (UTF-8 msg filter); merge `--no-ff` into master; ledger line; memory file; `graphify update .`.
