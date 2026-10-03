#nullable disable
static partial class Check
{
    // ── 38. MA-2d: no network call on Revit's API thread — every request ChangesetClient sends runs on a pool thread (source scan: the
    //        client compiles here, but its HTTP is never called offline) ─────────────────────────────────────────────────────────────
    static void Ma2dThreadChecks()
    {
        Console.WriteLine("\nMA-2d — network calls off the API thread (source scans)");
        string Src(params string[] p) => File.ReadAllText(Repo(new[] { "SentinelAddin" }.Concat(p).ToArray()));
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        string client = Src("Coordination", "ChangesetClient.cs"), promote = Src("Commands.PromoteWalls.cs");
        int send = client.IndexOf("Task.Run(async () =>", StringComparison.Ordinal);
        int make = client.IndexOf("var msg = make();", StringComparison.Ordinal);
        Ok(Count(client, ".SendAsync(") == 1 && send > 0 && make > send && client.IndexOf("await http.SendAsync(msg).ConfigureAwait(false);", StringComparison.Ordinal) > make
           && Count(client, "Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken))") == 3
           && client.Contains("(resp, body) = Send(WriteHttp, () => Req(HttpMethod.Post, $\"{cfg.ServiceUrl.TrimEnd('/')}{path}\", cfg.ServiceToken, payload));")
           // Review C1: the token (a sign-in refresh is a network call) is read where the request is built — inside Send's pool thread.
           && Count(client, "cfg.ServiceToken") == Count(client, "() => Req(") && Count(client, "() => Req(") == 4
           && !client.Contains("Send(ReadHttp, Req(") && !client.Contains("Send(WriteHttp, msg)")
           && !client.Contains("ReadAsStringAsync().GetAwaiter()"),
           "ChangesetClient builds (its token too), sends and reads every request on a pool thread — FetchProposed, FetchOne, MyRole and Post (Propose, ReportResult, Withdraw, ReportReverted): one place for Promote, the review, Ghost Builder and the undo watcher");
        Ok(promote.Contains("var cs = ChangesetClient.Propose(cfg, key, body, out err);") && !promote.Contains("retry ? Task.Run("),
           "Promote's first Propose is off the API thread too: C22's wrap of the retry is now the client's, for both");
    }
}
