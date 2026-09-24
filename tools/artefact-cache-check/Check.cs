using System.Net;
using System.Net.Sockets;
using System.Text;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    const string Sha = "fb8f9baefa9f0123456789abcdef0123456789abcdef0123456789abcdef0123";
    const string Body = "{\"standard_key\":\"AST\",\"semver\":\"1.0.0\",\"org\":\"AST\",\"rules\":[]}";
    static string Answer200(string source = "office", string sha = Sha) =>
        $"{{\"kind\":\"ruleset\",\"version\":1,\"body\":{Body},\"source\":\"{source}\",\"ref\":\"ruleset@1\",\"sha256\":\"{sha}\",\"pointer_sha_mismatch\":false}}";

    // One-shot loopback "bridge": answers one request with `response`, returns what it received.
    static (Task<string> Request, string Url) Serve(int status, string reason, string body)
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)l.LocalEndpoint).Port;
        var bytes = Encoding.UTF8.GetBytes(body);
        var head = $"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
        var t = Task.Run(async () =>
        {
            try
            {
                using var c = await l.AcceptTcpClientAsync();
                var s = c.GetStream();
                var buf = new byte[8192];
                var got = new StringBuilder();
                while (!got.ToString().Contains("\r\n\r\n"))
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.Append(Encoding.ASCII.GetString(buf, 0, n));
                }
                await s.WriteAsync(Encoding.ASCII.GetBytes(head).Concat(bytes).ToArray());
                await s.FlushAsync();
                return got.ToString();
            }
            finally { l.Stop(); }
        });
        return (t, url);
    }

    static int Main()
    {
        Console.WriteLine("ArtefactCache + ArtefactClient — Revit reads the project's standards and says where they came from\n");
        ArtefactCache.Root = Path.Combine(Path.GetTempPath(), "sentinel-artefact-cache-check-" + Guid.NewGuid().ToString("N"));
        try { Run(); ScanLine(); }
        finally { try { Directory.Delete(ArtefactCache.Root, true); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 5. the pane's scan line: the document's own ruleset@n against what the journey says is in force now ──
    static void ScanLine()
    {
        Console.WriteLine("\nScan line (Next strip) — which ruleset judged the rows, and whether it is still the project's\n");
        static ResolvedArtefact A(string? r, string? src, string? sha, string label) => new() { Kind = "ruleset", Ref = r, Source = src, Sha256 = sha, Label = label, Origin = r is null ? "none" : "bridge" };
        static GovernedQuery.JourneyInfo J(string? r, string src, string? sha, string label) => new() { RulesetRef = r, RulesetSource = src, RulesetSha256 = sha, RulesetLabel = label };
        var aster = A("ruleset@1", "office", "fb8f9baefa9f0011", "ruleset@1 · office · fb8f9baefa9f…");
        var cached = A("ruleset@1", "office", "fb8f9baefa9f0011", "ruleset@1 · office · fb8f9baefa9f… (cached 14:02)");
        var none = RulesetStore.NoneSource("not installed for aster-villa or its office");
        var jAster = J("ruleset@1", "office", "fb8f9baefa9f0011", "ruleset@1 · office · fb8f9baefa9f…");
        var jNew = J("ruleset@2", "project", "aa11", "ruleset@2 · project · aa11…");
        var jMoved = J("ruleset@1", "project", "fb8f9baefa9f0011", "ruleset@1 · project · fb8f9baefa9f…");
        var jNone = J(null, "none", null, "none");
        var jBad = J(null, "none", null, "unavailable — timeout");
        string L(ResolvedArtefact l, GovernedQuery.JourneyInfo? j) => GovernedQuery.ScanRulesetLine(l, j);

        Ok(L(aster, jAster) == "Judged by ruleset@1 · office · fb8f9baefa9f…", "same ref, source and sha → just the label");
        Ok(L(cached, jAster) == "Judged by ruleset@1 · office · fb8f9baefa9f… (cached 14:02)", "a cached copy says cached");
        Ok(L(aster, jNew) == "Judged by ruleset@1 · office · fb8f9baefa9f… — the project now has ruleset@2 · project · aa11… (Scan Now reloads)", "a newer ruleset@n on the project → says so, Scan Now reloads");
        Ok(L(none, jNone) == "Judged by none — not installed for aster-villa or its office — nothing is scored", "none, and none installed → nothing is scored");
        Ok(L(none, jAster) == "Judged by none — not installed for aster-villa or its office — the project now has ruleset@1 · office · fb8f9baefa9f… (Scan Now reloads)", "none here, installed since → says so");
        Ok(L(aster, jBad) == "Judged by ruleset@1 · office · fb8f9baefa9f… — the project's ruleset is unavailable — timeout", "a failed journey read is not 'nothing installed'");
        Ok(L(aster, null) == "Judged by ruleset@1 · office · fb8f9baefa9f… — the project's ruleset now is unknown (journey unavailable)", "no journey → unknown, not a match");
        Ok(L(aster, jMoved).EndsWith("— the project now has ruleset@1 · project · fb8f9baefa9f… (Scan Now reloads)"), "office → project at the same @n and sha is a change (source is part of 'same')");
        Ok(L(aster, jNone) == "Judged by ruleset@1 · office · fb8f9baefa9f… — but the project now has no ruleset installed (Scan Now reloads)", "judged by one, none installed now → says so");

        // A none source never produces a score string: not on the scan line, not in the scorecard headline.
        var lines = new[] { jAster, jNew, jMoved, jNone, jBad, null }.Select(j => L(none, j)).ToList();
        var report = new ScanReport("Aster Villa", DateTimeOffset.Now, 3, 0, new List<Violation>()) { Ruleset = RulesetStore.None(), NotScored = none.Label };
        var headline = HealthScorecard.Build(report).Headline;
        Ok(lines.All(l => !l.Contains('%')) && headline.StartsWith("Not scored — none — not installed for aster-villa or its office")
           && !headline.Contains('%') && !headline.Contains("(A)") && report.RulesetRef is null && report.RulesetSha256 is null,
           "a none source never produces a score, a grade or a ruleset ref");
        var (rs0, src0, note0) = RulesetStore.Load("");
        Ok(rs0.Rules.Count == 0 && src0.Origin == "none" && src0.Label == "none — not bound — Sentinel ▸ Project Setup" && note0 is null, "Load(\"\") → none, not bound, nothing asked");
    }

    static void Run()
    {
        // ── 1. the cache: path, round trip, provenance, never another key's copy ─────────────────────────
        Ok(ArtefactCache.PathFor("aster-tower", "ruleset") == Path.Combine(ArtefactCache.Root, "aster-tower", "ruleset.json"), "cache path = <root>/<key>/<kind>.json");
        foreach (var bad in new[] { "..", ".", "", "a/../../x", "a\\b", "c:d" })
        {
            var p = Path.GetFullPath(ArtefactCache.PathFor(bad, "ruleset"));
            Ok(p.StartsWith(Path.GetFullPath(ArtefactCache.Root) + Path.DirectorySeparatorChar) && Path.GetDirectoryName(p) != Path.GetFullPath(ArtefactCache.Root),
               $"key '{bad}' stays one folder inside the cache root");
        }
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "empty cache reads as a miss");
        var at = new DateTime(2026, 9, 25, 7, 5, 0, DateTimeKind.Utc);
        ArtefactCache.Write("aster-tower", "ruleset", new CachedArtefact { Kind = "ruleset", Ref = "ruleset@1", Source = "office", Sha256 = Sha, BodyJson = Body, FetchedAt = at });
        var back = ArtefactCache.Read("aster-tower", "ruleset");
        Ok(back is { Ref: "ruleset@1", Source: "office", Sha256: Sha } && back.FetchedAt == at && back.FetchedAt.Kind == DateTimeKind.Utc, "write → read keeps ref, source, sha and the UTC time");
        Ok(back != null && System.Text.Json.JsonDocument.Parse(back.BodyJson).RootElement.GetProperty("standard_key").GetString() == "AST", "the body survives as JSON");
        Ok(ArtefactCache.Read("aster-tower", "ids") is null && ArtefactCache.Read("aster-villa", "ruleset") is null, "another kind or key is a miss");
        // "a:b" and "a_b" share a folder once sanitised; the stored key keeps them apart.
        ArtefactCache.Write("a:b", "ruleset", new CachedArtefact { Kind = "ruleset", Ref = "ruleset@2", Source = "project", Sha256 = Sha, BodyJson = Body, FetchedAt = at });
        Ok(ArtefactCache.PathFor("a:b", "ruleset") == ArtefactCache.PathFor("a_b", "ruleset") && ArtefactCache.Read("a_b", "ruleset") is null && ArtefactCache.Read("a:b", "ruleset") is not null,
           "a key never reads another key's copy, even when their folders collide");
        Directory.CreateDirectory(Path.GetDirectoryName(ArtefactCache.PathFor("k", "naming"))!);
        File.WriteAllText(ArtefactCache.PathFor("k", "naming"), "{\"key\":\"k\",\"kind\":\"naming\",\"ref\":\"naming@1\",\"body\":{}}");
        Ok(ArtefactCache.Read("k", "naming") is null, "a copy without source/sha is a miss (it could not be labelled)");
        File.WriteAllText(ArtefactCache.PathFor("k", "ids"), "{not json");
        Ok(ArtefactCache.Read("k", "ids") is null, "a corrupt copy is a miss, not a throw");
        ArtefactCache.Clear("aster-tower", "ruleset");
        ArtefactCache.Clear("never-written", "ruleset");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "clear removes the copy; clearing nothing does not throw");

        // ── 2. the wire strings ──────────────────────────────────────────────────────────────────────────
        Ok(ArtefactClient.ETagFor("ruleset@1", "office", Sha) == "\"ruleset@1:office:" + Sha + "\"", "ETag = \"<ref>:<source>:<sha256>\" with quotes");
        Ok(ArtefactClient.RefLabel("ruleset@1", "office", Sha) == "ruleset@1 · office · fb8f9baefa9f…", "refLabel port matches the bridge's");
        Ok(ArtefactClient.RefLabel(null, null, null) == "none" && ArtefactClient.RefLabel("ids@4", "project", "23bb") == "ids@4 · project · 23bb…", "refLabel edge cases as the bridge");

        // ── 3. every bridge answer (Interpret) ───────────────────────────────────────────────────────────
        var now = new DateTime(2026, 9, 25, 8, 30, 0, DateTimeKind.Utc);
        var ok = ArtefactClient.Interpret("aster-tower", "ruleset", 200, Answer200(), null, now);
        Ok(ok.Origin == "bridge" && ok.Label == "ruleset@1 · office · fb8f9baefa9f…" && ok.Reason is null && ok.FetchedAt == now, "200 → bridge, labelled like the web");
        Ok(ok.BodyJson != null && ok.BodyJson.Contains("\"standard_key\":\"AST\""), "200 → the body is handed on");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is { Sha256: Sha }, "200 → the cache holds it");

        var cached = ArtefactCache.Read("aster-tower", "ruleset")!;
        var same = ArtefactClient.Interpret("aster-tower", "ruleset", 304, "", cached, now.AddHours(1));
        Ok(same.Origin == "bridge" && same.Label == "ruleset@1 · office · fb8f9baefa9f…" && same.BodyJson == cached.BodyJson, "304 → the cached copy, confirmed current (not labelled cached)");
        Ok(ArtefactCache.Read("aster-tower", "ruleset")!.FetchedAt == now.AddHours(1), "304 → the confirmation time is recorded");
        Ok(ArtefactClient.Interpret("x", "ruleset", 304, "", null, now) is { Origin: "none" }, "304 with no cached copy → none, never a guess");

        var down = ArtefactClient.Interpret("aster-tower", "ruleset", 503, "{\"message\":\"CDE not configured\"}", ArtefactCache.Read("aster-tower", "ruleset"), now);
        var hhmm = now.AddHours(1).ToLocalTime().ToString("HH:mm");
        Ok(down.Origin == "cache" && down.Label == $"ruleset@1 · office · fb8f9baefa9f… (cached {hhmm})" && down.Reason!.Contains("HTTP 503"), "other status + cache → cached, and says so");
        var down2 = ArtefactClient.Interpret("aster-villa", "ruleset", 403, "{\"message\":\"Not authorized\"}", null, now);
        Ok(down2.Origin == "none" && down2.Label == "none — the bridge answered HTTP 403 (Not authorized)", "other status, no cache → none with the bridge's words");
        var junk = ArtefactClient.Interpret("aster-villa", "ruleset", 200, "{\"ref\":\"ruleset@1\"}", null, now);
        Ok(junk.Origin == "none" && junk.Label.StartsWith("none — the bridge answered 200 without"), "a 200 without provenance is not trusted");

        var gone = ArtefactClient.Interpret("aster-tower", "ruleset", 404, "{\"message\":\"no ruleset artefact installed for aster-tower or its office\",\"reason\":\"not_installed\"}", cached, now);
        Ok(gone.Origin == "none" && gone.Label == "none — not installed for aster-tower or its office", "404 not_installed → none");
        Ok(ArtefactCache.Read("aster-tower", "ruleset") is null, "404 not_installed → the stale copy is cleared");
        ArtefactCache.Write("ghost", "ids", new CachedArtefact { Kind = "ids", Ref = "ids@1", Source = "project", Sha256 = Sha, BodyJson = "{}", FetchedAt = now });
        var noProj = ArtefactClient.Interpret("ghost", "ids", 404, "{\"message\":\"unknown project\",\"reason\":\"no_project\"}", ArtefactCache.Read("ghost", "ids"), now);
        Ok(noProj.Label == "none — no project ghost on the bridge" && ArtefactCache.Read("ghost", "ids") is null, "404 no_project → none, copy cleared");
        Ok(ArtefactClient.Interpret("k", "banana", 404, "{\"reason\":\"unknown_kind\"}", null, now).Label == "none — the bridge does not know the kind 'banana'", "404 unknown_kind → none");
        Ok(ArtefactClient.Interpret("k", "ruleset", 404, "<html>", null, now).Label == "none — the bridge answered HTTP 404", "a 404 without a reason is not read as 'not installed'");

        // ── 4. the real round trip: GET, bearer, If-None-Match from the cache, 304, then no bridge at all ────
        var (req1, url1) = Serve(200, "OK", Answer200());
        var r1 = ArtefactClient.Resolve("aster-tower", "ruleset", url1, "t0k");
        var sent1 = req1.GetAwaiter().GetResult();
        Ok(sent1.StartsWith("GET /cde/aster-tower/artefacts/ruleset HTTP/1.1"), "GET /cde/<key>/artefacts/<kind>");
        Ok(sent1.Contains("Authorization: Bearer t0k"), "bearer from the service token");
        Ok(!sent1.Contains("If-None-Match"), "no cached copy → no If-None-Match");
        Ok(r1.Origin == "bridge" && r1.Label == "ruleset@1 · office · fb8f9baefa9f…", "live 200 → bridge");

        var (req2, url2) = Serve(304, "Not Modified", "");
        var r2 = ArtefactClient.Resolve("aster-tower", "ruleset", url2, "");
        var sent2 = req2.GetAwaiter().GetResult();
        Ok(sent2.Contains("If-None-Match: \"ruleset@1:office:" + Sha + "\""), "cached copy → If-None-Match = its ETag");
        Ok(!sent2.Contains("Authorization:"), "no token → no Authorization header");
        Ok(r2.Origin == "bridge" && r2.BodyJson == r1.BodyJson, "live 304 → the cached body");

        var dead = new TcpListener(IPAddress.Loopback, 0);
        dead.Start();
        var deadUrl = "http://127.0.0.1:" + ((IPEndPoint)dead.LocalEndpoint).Port;
        dead.Stop();
        var r3 = ArtefactClient.Resolve("aster-tower", "ruleset", deadUrl, "");
        Ok(r3.Origin == "cache" && r3.Label.StartsWith("ruleset@1 · office · fb8f9baefa9f… (cached ") && r3.Reason!.StartsWith("bridge unreachable — cached "), "no bridge + cache → cached, labelled");
        var r4 = ArtefactClient.Resolve("aster-villa", "ruleset", deadUrl, "");
        Ok(r4.Origin == "none" && r4.Label.StartsWith("none — bridge unreachable"), "no bridge, no cache → none");
        var r5 = ArtefactClient.Resolve("  ", "ruleset", deadUrl, "");
        Ok(r5.Origin == "none" && r5.Label == "none — not bound — Sentinel ▸ Project Setup", "no key → none, nothing asked");
    }
}
