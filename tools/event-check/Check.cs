using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got + "\n        want: " + want);
    }

    const string Hash = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef";
    const string Hash2 = "0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0";
    // What POST /cde/:key/audit answers (recordAudit, return=representation) and what /propose answers.
    const string AuditRow = "{\"id\":812,\"project_id\":\"6f1c0000-0000-4000-8000-000000000001\",\"entity_type\":\"delivery_gate\",\"entity_id\":null," +
        "\"action\":\"IFC delivery gate PASS: a.ifc\",\"actor\":\"Revit\",\"old_value\":null,\"new_value\":{\"file\":\"a.ifc\"}," +
        "\"at\":\"2026-09-25T10:00:00+00:00\",\"prev_hash\":\"" + Hash2 + "\",\"hash\":\"" + Hash + "\"}";
    const string ProposeBody = "{\"verdict\":\"rejected\",\"summary\":{\"in_scope\":4,\"passing\":3,\"failing\":1},\"audit_id\":813," +
        "\"recorded_at\":\"2026-09-25T10:00:01+00:00\",\"receipt\":{\"version\":\"sentinel-receipt/1\",\"audit_id\":813,\"ledger_hash\":\"" + Hash2 + "\",\"prev_hash\":\"" + Hash + "\"}}";

    static int Main()
    {
        Console.WriteLine("LedgerResult + LedgerLine — what the ledger answered, in the one set of words\n");
        Responses();
        Exceptions();
        Lines();
        Posts();
        HubWatchRows();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. an HTTP answer → state → line ─────────────────────────────────────────────────────────────────
    static void Responses()
    {
        var row = LedgerResult.FromResponse(201, AuditRow);
        Ok(row.State == LedgerState.Recorded && row.Id == 812 && row.Hash == Hash, "201 with the audit row → Recorded, its id and hash");
        Is(LedgerLine.For(row), "ledger #812 · receipt 3f9a0c1d2e4b5f60…", "the line: ledger #id · receipt <16 hex>…");
        Is(LedgerLine.For(LedgerResult.FromResponse(200, ProposeBody)), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "200 /propose → audit_id and receipt.ledger_hash, never the prev_hash");
        Is(LedgerLine.For(LedgerResult.FromResponse(200, ProposeBody.Replace("\"audit_id\":813,\"recorded_at\"", "\"audit_id\":\"813\",\"recorded_at\""))),
           "ledger #813 · receipt 0a1b2c3d4e5f6071…", "an audit id sent as a string reads the same");

        const string NoHash = "not confirmed — the bridge returned no chain hash";
        Is(LedgerLine.For(LedgerResult.FromResponse(201, "{\"ok\":true,\"received_at\":\"2026-09-25T10:00:00Z\",\"violations\":3}")), NoHash,
           "201 from /office/scan (no row comes back) → not confirmed, no chain hash");
        var hashless = new[]
        {
            AuditRow.Replace("\"hash\":\"" + Hash + "\"", "\"hash\":null"),       // a hashless row; its prev_hash is not its hash
            AuditRow.Replace("\"hash\":\"" + Hash + "\"", "\"hash\":\"3f9a0c1d2e4b\""), // not 64 hex
            AuditRow.Replace("\"id\":812,", ""),                                   // no id
            AuditRow.Replace("\"id\":812,", "\"id\":0,"),                          // not a row id
            ProposeBody.Replace("\"receipt\":{", "\"receipt\":null,\"x\":{"),     // /propose with no receipt
            "", "not json",
        };
        Ok(hashless.All(b => LedgerLine.For(LedgerResult.FromResponse(201, b)) == NoHash), "2xx without an id and a 64-hex hash → not confirmed, every shape");

        Is(LedgerLine.For(LedgerResult.FromResponse(400, "{\"message\":\"entity_type must be a string\"}")), "not recorded — HTTP 400: entity_type must be a string", "400 → not recorded, with the bridge's message");
        Is(LedgerLine.For(LedgerResult.FromResponse(401, "{\"message\":\"Unauthorized\"}")), "not recorded — HTTP 401: signed out — Sentinel ▸ Sign in", "401 → not recorded, worded as signed out (H4)");
        Is(LedgerLine.For(LedgerResult.FromResponse(403, "{\"message\":\"Origin not allowed\"}")), "not recorded — HTTP 403: Origin not allowed", "403 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(404, "{\"message\":\"Project \\\"nope\\\" does not exist — create it in the web app (Projects → + New project) first.\"}")),
           "not recorded — HTTP 404: Project \"nope\" does not exist — create it in the web app (Projects → + New project) first.", "404 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(503, "{\"message\":\"CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.\"}")),
           "not recorded — HTTP 503: CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.", "503 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(500, "{\"message\":\"Internal error — see the bridge log.\"}")),
           "not confirmed — HTTP 500: Internal error — see the bridge log. (the entry may have landed)", "500 (masked; may follow the insert) → not confirmed");
        Is(LedgerLine.For(LedgerResult.FromResponse(502, "<html>Bad Gateway</html>")), "not confirmed — HTTP 502 (the entry may have landed)", "a proxy's 502 page → not confirmed, the status alone");
        Ok(new[] { 409, 413, 429, 504 }.All(s => LedgerResult.FromResponse(s, "{\"message\":\"x\"}").State == LedgerState.NotConfirmed),
           "only 400/401/403/404/503 read not recorded — 409, 413, 429, 504 stay not confirmed");
        var longMsg = new string('x', 300);
        Ok(LedgerLine.For(LedgerResult.FromResponse(400, "{\"message\":\"" + longMsg + "\"}")) == "not recorded — HTTP 400: " + new string('x', 200) + "…",
           "a long bridge message is clipped at 200 characters");
    }

    // ── 2. a transport failure → state → line ────────────────────────────────────────────────────────────
    static void Exceptions()
    {
        Is(LedgerLine.For(LedgerResult.FromException(new TaskCanceledException())), "not confirmed — timed out after 6 s (the entry may have landed)",
           "a timeout → not confirmed after the default 6 s, may have landed");
        Is(LedgerLine.For(LedgerResult.FromException(new OperationCanceledException(), TimeSpan.FromMilliseconds(500))),
           "not confirmed — timed out after 0.5 s (the entry may have landed)", "the line names the cap that ran out");
        const string NoAnswer = "not recorded — the bridge did not answer";
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new SocketException((int)SocketError.ConnectionRefused)))),
           NoAnswer, "connection refused (net8) → not recorded, the bridge did not answer");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed",
               new WebException("Unable to connect to the remote server", new SocketException((int)SocketError.ConnectionRefused), WebExceptionStatus.ConnectFailure, null)))),
           NoAnswer, "connection refused (net48: WebException ConnectFailure) → not recorded");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new SocketException((int)SocketError.HostNotFound)))),
           NoAnswer, "an unknown host → not recorded");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new IOException("The response ended prematurely.")))),
           "not confirmed — The response ended prematurely. (the entry may have landed)", "a reset after sending → not confirmed");
        Ok(LedgerResult.FromException(new HttpRequestException("send failed", new WebException("x", WebExceptionStatus.ReceiveFailure))).State == LedgerState.NotConfirmed,
           "net48 ReceiveFailure (after sending) → not confirmed");
    }

    // ── 3. the sentences, not bound, receipts from /propose ─────────────────────────────────────────────
    static void Lines()
    {
        var nb = LedgerResult.NotBound();
        Ok(nb.State == LedgerState.NotBound && LedgerLine.For(nb) == ProjectContext.NotBound, "not bound → ProjectContext.NotBound, word for word");
        Is(LedgerLine.Sentence(nb), "Not recorded on the web: This model is not bound to a web project — Sentinel ▸ Project Setup.",
           "not bound as a sentence: the IFC gate's words since 4a");
        Is(LedgerLine.Sentence(LedgerResult.FromResponse(201, AuditRow)), "Recorded: ledger #812 · receipt 3f9a0c1d2e4b5f60…", "Recorded: ledger #id · receipt …");
        Is(LedgerLine.Sentence(LedgerResult.NotRecorded("the bridge did not answer")), "Not recorded — the bridge did not answer", "Not recorded — the bridge did not answer");
        Is(LedgerLine.Sentence(LedgerResult.FromException(new TaskCanceledException())), "Not confirmed — timed out after 6 s (the entry may have landed)", "Not confirmed — timed out …");
        Ok(LedgerResult.FromReceipt("813", Hash2).State == LedgerState.Recorded
           && new (string?, string?)[] { (null, Hash2), ("813", null), ("x", Hash2), ("-1", Hash2), ("0", Hash2), ("813", "abc") }
               .All(p => LedgerLine.For(LedgerResult.FromReceipt(p.Item1, p.Item2)) == "not confirmed — the bridge returned no chain hash"),
           "a ProposalResult's AuditId + ReceiptHash → Recorded only with both");
    }

    // ── 4. the POST itself, against loopback "bridges" ─────────────────────────────────────────────────
    record Seen(string Line, string Auth, string ContentType, string Body);

    // Accepts one request, reads its head and body, answers (status, body) after delayMs; a client that gave up is not an error.
    static (Task<Seen> Seen, string Url) Bridge(int status, string body, int delayMs = 0)
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)l.LocalEndpoint).Port;
        var t = Task.Run(async () =>
        {
            try
            {
                using var c = await l.AcceptTcpClientAsync();
                var s = c.GetStream();
                var buf = new byte[65536];
                var got = new List<byte>();
                int headEnd;
                while ((headEnd = IndexOf(got, "\r\n\r\n")) < 0)
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.AddRange(buf.Take(n));
                }
                var head = Encoding.ASCII.GetString(got.Take(Math.Max(headEnd, 0)).ToArray()).Split("\r\n");
                string H(string name) => head.FirstOrDefault(h => h.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase))?.Substring(name.Length + 1).Trim() ?? "";
                var length = int.TryParse(H("Content-Length"), out var cl) ? cl : 0;
                while (got.Count < headEnd + 4 + length)
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.AddRange(buf.Take(n));
                }
                var seen = new Seen(head[0], H("Authorization"), H("Content-Type"), Encoding.UTF8.GetString(got.Skip(headEnd + 4).ToArray()));
                await Task.Delay(delayMs);
                var bytes = Encoding.UTF8.GetBytes(body);
                var reply = $"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
                try { await s.WriteAsync(Encoding.ASCII.GetBytes(reply).Concat(bytes).ToArray()); await s.FlushAsync(); }
                catch (IOException) { /* the client's cap ran out first */ }
                return seen;
            }
            finally { l.Stop(); }
        });
        return (t.WaitAsync(TimeSpan.FromSeconds(30)), url); // a client that never connects fails the check instead of hanging it
    }

    static int IndexOf(List<byte> b, string m)
    {
        var p = Encoding.ASCII.GetBytes(m);
        for (int i = 0; i + p.Length <= b.Count; i++) if (p.Select((x, j) => b[i + j] == x).All(x => x)) return i;
        return -1;
    }

    static string DeadUrl()
    {
        var dead = new TcpListener(IPAddress.Loopback, 0);
        dead.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)dead.LocalEndpoint).Port;
        dead.Stop();
        return url;
    }

    static void Posts()
    {
        Ok(LedgerResult.DefaultTimeout == TimeSpan.FromSeconds(6), "an event waits 6 s by default");
        var payload = new { entity_type = "delivery_gate", actor = "Revit", action = "IFC delivery gate PASS: a.ifc" };

        var (seen, url) = Bridge(201, AuditRow);
        var r = LedgerResult.Post(url + "/", "tok", " demo tower ", "/audit", payload, TimeSpan.FromSeconds(5));
        var s = seen.GetAwaiter().GetResult();
        Is(LedgerLine.For(r), "ledger #812 · receipt 3f9a0c1d2e4b5f60…", "a 201 row from a live POST → Recorded");
        Is(s.Line, "POST /cde/demo%20tower/audit HTTP/1.1", "POST /cde/<escaped, trimmed key>/audit");
        Ok(s.Auth == "Bearer tok" && s.ContentType.StartsWith("application/json"), "the bridge bearer and a JSON body are sent");
        Is(s.Body, "{\"entity_type\":\"delivery_gate\",\"actor\":\"Revit\",\"action\":\"IFC delivery gate PASS: a.ifc\"}", "the payload goes as it was built");

        var (seen2, url2) = Bridge(201, AuditRow);
        LedgerResult.Post(url2, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        Ok(seen2.GetAwaiter().GetResult().Auth == "", "no token → no Authorization header");

        // A payload that already has its wire shape (the scan report: snake_case, an explicit null) goes as a JsonElement.
        const string Wire = "{\"doc_title\":\"Tower A\",\"ruleset_ref\":null,\"violations\":[{\"rule_id\":\"N-01\",\"element_id\":7}]}";
        var (seen5, url5) = Bridge(201, "{\"ok\":true,\"received_at\":\"2026-09-25T10:00:00Z\",\"violations\":1}");
        using (var wire = System.Text.Json.JsonDocument.Parse(Wire))
            Is(LedgerLine.For(LedgerResult.Post(url5, "", "demo", "/office/scan", wire.RootElement, TimeSpan.FromSeconds(5))),
               "not confirmed — the bridge returned no chain hash", "a 201 from /office/scan → not confirmed, no chain hash");
        Is(seen5.GetAwaiter().GetResult().Body, Wire, "a JsonElement payload is sent exactly as it is");

        var (seen3, url3) = Bridge(500, "{\"message\":\"Internal error — see the bridge log.\"}");
        var r500 = LedgerResult.Post(url3, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        seen3.GetAwaiter().GetResult();
        var (seen4, url4) = Bridge(503, "{\"message\":\"CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.\"}");
        var r503 = LedgerResult.Post(url4, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        seen4.GetAwaiter().GetResult();
        Ok(r500.State == LedgerState.NotConfirmed && r503.State == LedgerState.NotRecorded, "a live 500 → not confirmed, a live 503 → not recorded");

        var sw = Stopwatch.StartNew();
        var down = LedgerResult.Post(DeadUrl(), "", "demo", "/audit", payload, TimeSpan.FromSeconds(10));
        Is(LedgerLine.Sentence(down), "Not recorded — the bridge did not answer", "bridge stopped → Not recorded — the bridge did not answer");
        Ok(sw.Elapsed < TimeSpan.FromSeconds(8), "a refused connection answers before the cap runs out");

        var unknown = LedgerResult.Post("https://sentinel-event-check.example.test", "", "demo", "/audit", payload, TimeSpan.FromSeconds(10));
        Is(LedgerLine.For(unknown), "not recorded — the bridge did not answer", "an unresolvable bridge host → not recorded");

        // SEC-5: the ledger POST carries the bearer — https, or http to this PC, as the bridge address itself (UrlRule).
        var plain = LedgerResult.Post("http://bridge.example.test", "tok", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        Is(LedgerLine.Sentence(plain), "Not recorded — The bridge address \"http://bridge.example.test\" is not https and not on this PC — Sentinel sends a token or a sign-in to another PC over https only; set an https address in %AppData%\\Sentinel\\bcf-config.json. Nothing was sent.",
           "SEC-5: a plain-http bridge on another PC → not recorded, in the URL rule's words, nothing sent");

        var silent = new TcpListener(IPAddress.Loopback, 0);
        silent.Start();
        sw.Restart();
        var quiet = LedgerResult.Post("http://127.0.0.1:" + ((IPEndPoint)silent.LocalEndpoint).Port, "", "demo", "/audit", payload, TimeSpan.FromMilliseconds(500));
        var took = sw.Elapsed;
        silent.Stop();
        Is(LedgerLine.For(quiet), "not confirmed — timed out after 0.5 s (the entry may have landed)", "a bridge that takes the request and never answers → not confirmed");
        Ok(took < TimeSpan.FromSeconds(3), "0.5 s asked, under 3 s waited");

        var watch = new TcpListener(IPAddress.Loopback, 0);
        watch.Start();
        var unbound = LedgerResult.Post("http://127.0.0.1:" + ((IPEndPoint)watch.LocalEndpoint).Port, "", "  ", "/audit", payload, TimeSpan.FromSeconds(5));
        Thread.Sleep(200);
        var asked = watch.Pending();
        watch.Stop();
        Ok(unbound.State == LedgerState.NotBound && !asked, "an empty key sends nothing and reads not bound");

        Is(LedgerLine.For(LedgerResult.Post("localhost:4100", "", "demo", "/audit", payload, TimeSpan.FromSeconds(5))),
           "not recorded — the bridge address is not an http(s) URL (localhost:4100)", "a bridge address that is not a URL → not recorded, nothing sent");
    }

    // ── 6. F-SEC5-1: the event hub's watch — a queued action that waits, or a running one that takes long, is said once ──────
    static void HubWatchRows()
    {
        Console.WriteLine("\nF-SEC5-1 — the event hub says a stalled queue, once per episode (HubWatch)");
        var t0 = new DateTime(2026, 10, 7, 10, 0, 0, DateTimeKind.Utc);
        var w = new Sentinel.HubWatch();
        Ok(w.Tick(t0, null, 0, null, null, out var again) is null && !again, "nothing queued, nothing running → nothing said, nothing raised");
        Ok(w.Tick(t0.AddSeconds(9), ("OnJourneyRefreshClick", t0), 1, null, t0, out again) is null && !again,
           "an action queued 9 s ago → nothing yet (Revit runs a raised event when it is idle)");
        Is(w.Tick(t0.AddSeconds(11), ("OnJourneyRefreshClick", t0), 2, null, t0.AddSeconds(8), out again) ?? "null",
           "A Sentinel action has waited 11 s for Revit: OnJourneyRefreshClick (2 queued; Revit was last idle 3 s ago) — raised again",
           "an action queued 11 s ago with nothing running → said, with the queue and when Revit was last idle");
        Ok(again, "… and raised again");
        Ok(w.Tick(t0.AddSeconds(16), ("OnJourneyRefreshClick", t0), 2, null, t0.AddSeconds(8), out again) is null && again,
           "the same wait at the next tick → raised again, not said twice (the Doctor log keeps 200 lines)");
        Is(w.Tick(t0.AddSeconds(31), ("ReloadRuleset", t0.AddSeconds(20)), 1, null, null, out again) ?? "null",
           "A Sentinel action has waited 11 s for Revit: ReloadRuleset (1 queued; Revit has not been idle this session) — raised again",
           "a new oldest action is a new episode, said again; no Idling seen yet is said in words");
        Ok(w.Tick(t0.AddSeconds(100), ("X", t0.AddSeconds(50)), 1, ("Governed Publish", t0.AddSeconds(50)), t0, out again) is null && !again,
           "an action running under 60 s → nothing said, nothing raised (Revit runs the queue after it)");
        Is(w.Tick(t0.AddSeconds(111), ("X", t0.AddSeconds(50)), 1, ("Governed Publish", t0.AddSeconds(50)), t0, out again) ?? "null",
           "A Sentinel action has been running for 61 s: Governed Publish — 1 more wait for it.", "an action running past 60 s → named, with what waits");
        Ok(!again && w.Tick(t0.AddSeconds(116), ("X", t0.AddSeconds(50)), 1, ("Governed Publish", t0.AddSeconds(50)), t0, out again) is null && !again,
           "… once, and never raised again while it runs");
        Ok(Sentinel.HubWatch.ShouldDrain(t0.AddSeconds(16), t0, false) && !Sentinel.HubWatch.ShouldDrain(t0.AddSeconds(14), t0, false)
           && !Sentinel.HubWatch.ShouldDrain(t0.AddSeconds(16), t0, true) && !Sentinel.HubWatch.ShouldDrain(t0.AddSeconds(16), null, false),
           "Revit's Idling runs the queue only past 15 s, with nothing running and something queued");
        Is(Sentinel.HubWatch.Drained(TimeSpan.FromSeconds(16.4), "OnJourneyRefreshClick", 2),
           "Revit's Idling ran 2 queued Sentinel action(s) — Revit had not run its external event for 16 s (first: OnJourneyRefreshClick).",
           "a drain by Idling is said");
    }
}
