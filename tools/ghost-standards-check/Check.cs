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
        try { Client(); Standards(); Layers(); Mapper(); ReviewerMemory(); }
        finally { try { Directory.Delete(ArtefactCache.Root, true); } catch { } }
        GuidelineChecks.Run(RepoRoot(), Ok);
        HarvestChecks.Run(RepoRoot(), Ok);
        InstallChecks.Run(RepoRoot(), Ok);
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
