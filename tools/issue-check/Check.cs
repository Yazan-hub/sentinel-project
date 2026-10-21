using System.Net;
using System.Text;
using System.Text.Json;
using Sentinel.Coordination;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    // ── a throwaway bridge on loopback: what it answers is set per case ──────────────────────────────────────
    static HttpListener _bridge = null!;
    static string _url = "";
    static int _topicStatus = 201, _vpStatus = 201;
    static bool _noGuid;
    static readonly List<(string Method, string Path, string Auth, string Body)> _seen = new();

    static void StartBridge()
    {
        var port = new Random().Next(43000, 44000);
        _url = $"http://127.0.0.1:{port}";
        _bridge = new HttpListener(); _bridge.Prefixes.Add(_url + "/"); _bridge.Start();
        _ = Task.Run(async () =>
        {
            while (_bridge.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await _bridge.GetContextAsync(); } catch { break; }
                var req = ctx.Request; string body; using (var r = new StreamReader(req.InputStream)) body = r.ReadToEnd();
                lock (_seen) _seen.Add((req.HttpMethod, req.Url!.AbsolutePath, req.Headers["Authorization"] ?? "", body));
                if (req.Url!.AbsolutePath == "/events") // SEC-6: one event for the live bearer, a 401 for any other
                {
                    var live = req.Headers["Authorization"] == "Bearer tok-live";
                    var said = Encoding.UTF8.GetBytes(live ? "data: {\"type\":\"topic\"}\n\n" : "{\"message\":\"missing bearer\"}");
                    ctx.Response.StatusCode = live ? 200 : 401; ctx.Response.ContentType = live ? "text/event-stream" : "application/json";
                    ctx.Response.OutputStream.Write(said, 0, said.Length); ctx.Response.Close();
                    continue;
                }
                var isVp = req.Url!.AbsolutePath.EndsWith("/viewpoints");
                var status = isVp ? _vpStatus : _topicStatus;
                var answer = status == 201
                    ? (isVp ? "{\"guid\":\"vp-1\"}" : _noGuid ? "{}" : "{\"guid\":\"topic-1\",\"title\":\"x\"}")
                    : status == 401 ? "{\"message\":\"missing bearer\"}"
                    : "{\"message\":\"a viewer writes nothing on aster-tower — nothing was saved\"}";
                var bytes = Encoding.UTF8.GetBytes(answer);
                ctx.Response.StatusCode = status; ctx.Response.ContentType = "application/json";
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length); ctx.Response.Close();
            }
        });
    }

    static IssueDraft Draft() => new()
    {
        Title = "  Door clashes with duct  ", Description = "Raised from Revit on 1 × Doors.", TopicType = "Clash", Priority = "High",
        AssignedTo = "mep@office.example", DueDate = new DateTime(2026, 10, 9, 15, 30, 0),
        IfcGuids = { "2O2Fr$t4X7Zf8NOew3FLOH", "2O2Fr$t4X7Zf8NOew3FLOH", "0K7w7JN6v0kxP4g5d2G4aE" },
        Camera = new PerspectiveCamera { ViewPoint = new Vec3 { X = 10, Y = 20, Z = 1.6 }, Direction = new Vec3 { X = 0, Y = 1, Z = 0 }, UpVector = new Vec3 { Z = 1 } },
        CameraNote = "camera from '{3D}'",
    };

    static int Main()
    {
        Console.WriteLine("Issues raised from Revit — IssueDraft + BcfSyncManager.CreateIssueAsync\n");
        StartBridge();
        try { Refusals(); Bodies(); Created(); PerCall(); Refused(); Lost(); Silent(); Live(); Hub(); Native(); }
        finally { try { _bridge.Stop(); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    static void Refusals()
    {
        var d = Draft(); d.IfcGuids.Clear();
        Ok(d.Refusal() == "Select the element(s) the issue is about first — nothing was sent.", "no selection → refused in words, like the web");
        d = Draft(); d.Title = "   ";
        Ok(d.Refusal() == "A title, please — nothing was sent.", "a blank title is refused");
        d = Draft(); d.Title = new string('x', 601);
        Ok(d.Refusal()!.StartsWith("A title is at most 600"), "a title past the bridge's 600 characters is refused before sending");
        d = Draft(); d.Priority = "Urgent";
        Ok(d.Refusal()!.StartsWith("Priority is one of Low, Normal, High, Critical"), "a priority outside the web's list is refused");
        Ok(Draft().Refusal() == null, "a complete draft passes");
    }

    static void Bodies()
    {
        using var t = JsonDocument.Parse(JsonSerializer.Serialize(Draft().TopicBody("model-7")));
        var r = t.RootElement;
        Ok(r.GetProperty("title").GetString() == "Door clashes with duct" && r.GetProperty("topic_type").GetString() == "Clash" && r.GetProperty("priority").GetString() == "High"
           && r.GetProperty("topic_status").GetString() == "Open" && r.GetProperty("model").GetString() == "model-7", "the topic body carries the web panel's fields, trimmed, Open, on the model");
        Ok(r.GetProperty("due_date").GetString() == "2026-10-09T00:00:00Z" && r.GetProperty("labels")[0].GetString() == "revit", "due date as an ISO day; labelled 'revit'");
        var noDue = Draft(); noDue.DueDate = null;
        using (var n = JsonDocument.Parse(JsonSerializer.Serialize(noDue.TopicBody("m")))) Ok(n.RootElement.GetProperty("due_date").ValueKind == JsonValueKind.Null, "no due date → null, not an empty string");
        using var v = JsonDocument.Parse(JsonSerializer.Serialize(Draft().ViewpointBody()));
        var sel = v.RootElement.GetProperty("components").GetProperty("selection");
        Ok(sel.GetArrayLength() == 2 && sel[0].GetProperty("ifc_guid").GetString() == "2O2Fr$t4X7Zf8NOew3FLOH", "the selection is the distinct GlobalIds as {ifc_guid}");
        var cam = v.RootElement.GetProperty("perspective_camera");
        Ok(cam.GetProperty("camera_view_point").GetProperty("x").GetDouble() == 10 && cam.GetProperty("field_of_view").GetDouble() == 60, "the camera serialises in BCF names (camera_view_point, field_of_view)");
        var flat = Draft(); flat.Camera = null;
        using (var f = JsonDocument.Parse(JsonSerializer.Serialize(flat.ViewpointBody()))) Ok(f.RootElement.GetProperty("perspective_camera").ValueKind == JsonValueKind.Null, "no 3D view → perspective_camera null, the selection still sent");
    }

    static async Task<IssueResult> Send(IssueDraft d, string? token = "tok-A")
    {
        using var sync = new BcfSyncManager(_url, "stale-token-from-window-open");
        return await sync.CreateIssueAsync("aster-tower", d, "model-7", token == null ? null : () => token);
    }

    static void Created()
    {
        _topicStatus = 201; _vpStatus = 201; _noGuid = false; lock (_seen) _seen.Clear();
        var d = Draft();
        var r = Send(d).GetAwaiter().GetResult();
        Ok(r.TopicStatus == 201 && r.TopicGuid == "topic-1" && r.ViewpointStatus == 201, "201 topic, then 201 viewpoint");
        lock (_seen)
        {
            Ok(_seen.Count == 2 && _seen[0].Path == "/bcf/3.0/projects/aster-tower/topics" && _seen[1].Path == "/bcf/3.0/projects/aster-tower/topics/topic-1/viewpoints", "the topic route, then the viewpoint under the returned guid");
            Ok(_seen.All(s => s.Auth == "Bearer tok-A"), "the bearer is read per call — not the token the window opened with");
        }
        Ok(r.Sentence(d, _url) == "Issue created: 'Door clashes with duct' · 2 element(s) linked · camera from '{3D}' — on the web board now.", "the created sentence: title, distinct elements, camera note");
    }

    // Fix-in-place's evidence comment and Resolved status read the bearer per call too (SI-1): never the window's token.
    static void PerCall()
    {
        _topicStatus = 201; lock (_seen) _seen.Clear();
        using var sync = new BcfSyncManager(_url, "stale-token-from-window-open");
        var c = sync.AddCommentAsync("aster-tower", "topic-1", "Fixed in Revit by lead@office.example", "lead@office.example", () => "tok-B").GetAwaiter().GetResult();
        var s = sync.SetStatusAsync("aster-tower", "topic-1", "Resolved", "unsigned — yazan", () => "").GetAwaiter().GetResult();
        var legacy = sync.AddCommentAsync("aster-tower", "topic-1", "x", "y").GetAwaiter().GetResult();
        lock (_seen) Ok(c == 201 && s == 201 && legacy == 201 && _seen.Select(x => x.Auth).SequenceEqual(new[] { "Bearer tok-B", "", "Bearer stale-token-from-window-open" }),
            "comment and status send the bearer read per call; an empty one sends no header, never the window's token; none given → the window's");
    }

    static void Refused()
    {
        _topicStatus = 401; _vpStatus = 201; lock (_seen) _seen.Clear();
        var d = Draft();
        var r = Send(d).GetAwaiter().GetResult();
        Ok(r.Sentence(d, _url) == "Not created — signed out — Sentinel ▸ Sign in — nothing was saved.", "401 → 'signed out — Sentinel ▸ Sign in', never 'bridge down'");
        lock (_seen) Ok(_seen.Count == 1, "…and no viewpoint is attempted");
        _topicStatus = 403;
        r = Send(d).GetAwaiter().GetResult();
        Ok(r.Sentence(d, _url) == "Not created — HTTP 403: a viewer writes nothing on aster-tower — nothing was saved.", "403 → the bridge's own words");
    }

    static void Lost()
    {
        _topicStatus = 201; _vpStatus = 413; _noGuid = false;
        var d = Draft();
        var r = Send(d).GetAwaiter().GetResult();
        Ok(r.TopicGuid == "topic-1" && r.Sentence(d, _url).StartsWith("Issue created: 'Door clashes with duct' — but its viewpoint was not saved (HTTP 413"), "a lost viewpoint is said: the issue points at no element");
        _vpStatus = 201; _noGuid = true;
        r = Send(d).GetAwaiter().GetResult();
        Ok(r.TopicGuid == null && r.Sentence(d, _url) == "Not created — HTTP 502: the bridge answered 201 without a topic guid — nothing was saved.", "201 without a guid is not called created");
        _noGuid = false;
    }

    static void Silent()
    {
        var d = Draft();
        using var sync = new BcfSyncManager("http://127.0.0.1:9", null);
        var r = sync.CreateIssueAsync("aster-tower", d, "m").GetAwaiter().GetResult();
        Ok(r.TopicStatus == 0 && r.Sentence(d, "http://127.0.0.1:9") == "Not created — the bridge did not answer at http://127.0.0.1:9 — nothing was saved.", "no answer → said as such, never a throw");
    }

    // SEC-6 (S20): the live stream reads its bearer at every connect — never the token the window opened with — and an answer
    // that is not a stream is said once (a 401 in the sign-in's words) and retried every 30 s, never swallowed.
    static void Live()
    {
        using var sync = new BcfSyncManager(_url, "stale-token-from-window-open");
        var said = new List<string>();
        lock (_seen) _seen.Clear();
        using (var cts = new CancellationTokenSource())
        {
            var changed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var loop = Task.Run(() => sync.StartLiveSyncAsync("aster-tower", () => changed.TrySetResult(true), () => "tok-live", w => { lock (said) said.Add(w); }, cts.Token));
            Ok(changed.Task.Wait(TimeSpan.FromSeconds(5)), "an event on the stream → the window refreshes");
            cts.Cancel();
            try { loop.Wait(TimeSpan.FromSeconds(5)); } catch { /* cancelled */ }
        }
        lock (_seen) Ok(_seen.Count >= 1 && _seen.All(s => s.Path == "/events" && s.Auth == "Bearer tok-live"),
            "the stream carries the bearer read at connect — not the token the window opened with");
        lock (_seen) _seen.Clear();
        using (var cts = new CancellationTokenSource())
        {
            var loop = Task.Run(() => sync.StartLiveSyncAsync("aster-tower", () => { }, () => null, w => { lock (said) said.Add(w); }, cts.Token));
            Thread.Sleep(3500); // a reconnect after 3 s would be a second request; a refused one waits 30 s
            cts.Cancel();
            try { loop.Wait(TimeSpan.FromSeconds(5)); } catch { /* cancelled */ }
        }
        lock (said) Ok(said.SequenceEqual(new[] { BcfSyncManager.LiveSignedOut }), "a 401 is said once, in the sign-in's words");
        lock (_seen) Ok(_seen.Count == 1 && _seen[0].Auth == "", "… with no bearer sent (none to read), and not asked again within 3 s");
        // review C13: signed in again → the next connect carries the bearer and the window says the sync resumed.
        said.Clear();
        BcfSyncManager.RefusedRetryMs = 300; // the check's own pace; 30 s in Revit
        try
        {
            using var cts = new CancellationTokenSource();
            var changed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            int asked = 0;
            var loop = Task.Run(() => sync.StartLiveSyncAsync("aster-tower", () => changed.TrySetResult(true),
                () => Interlocked.Increment(ref asked) == 1 ? null : "tok-live", w => { lock (said) said.Add(w); }, cts.Token));
            Ok(changed.Task.Wait(TimeSpan.FromSeconds(5)), "signed in again → the stream carries the new bearer at its next connect");
            cts.Cancel();
            try { loop.Wait(TimeSpan.FromSeconds(5)); } catch { /* cancelled */ }
        }
        finally { BcfSyncManager.RefusedRetryMs = 30000; }
        lock (said) Ok(said.SequenceEqual(new[] { BcfSyncManager.LiveSignedOut, BcfSyncManager.LiveResumed }),
            "a pause said, then the resumed line once the stream is back — never a stale paused line");
        // review C17: a sign-in that cannot be read at all (the config file unreadable) is said in words, never a silent 3 s retry.
        said.Clear();
        BcfSyncManager.RefusedRetryMs = 300;
        try
        {
            using var cts = new CancellationTokenSource();
            var changed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            int asked = 0;
            var loop = Task.Run(() => sync.StartLiveSyncAsync("aster-tower", () => changed.TrySetResult(true),
                () => Interlocked.Increment(ref asked) == 1 ? throw new InvalidOperationException("config") : "tok-live", w => { lock (said) said.Add(w); }, cts.Token));
            Ok(changed.Task.Wait(TimeSpan.FromSeconds(5)), "the sign-in readable again → the stream connects at its next try");
            cts.Cancel();
            try { loop.Wait(TimeSpan.FromSeconds(5)); } catch { /* cancelled */ }
        }
        finally { BcfSyncManager.RefusedRetryMs = 30000; }
        lock (said) Ok(said.SequenceEqual(new[] { BcfSyncManager.LiveSignInUnreadable(new InvalidOperationException("config")), BcfSyncManager.LiveResumed }),
            "a sign-in that could not be read is said once, naming the error's kind, then the resumed line");
        string cmd = File.ReadAllText(Path.Combine(Root(), "SentinelAddin", "Commands.BcfIssues.cs"));
        Ok(cmd.Contains("_ = Task.Run(() => sync.StartLiveSyncAsync(bcfKey, () =>")
           && cmd.Contains("() => { try { return BcfConfig.Load().ServiceToken; } catch (SessionException) { return null; } }, // SEC-6: read at every connect")
           && cmd.Contains("words => { try { window.SetStatus(words); } catch { /* window closed */ } },"),
           "BCF Issues runs live sync off Revit's thread, hands it the bearer to read at every connect, and shows its words in the window");
    }

    // ── SEC-7: the Issues window's three Revit actions go through the event hub (one ExternalEvent, one watch — SEC-6 review C9) ──
    static void Hub()
    {
        string cmd = File.ReadAllText(Path.Combine(Root(), "SentinelAddin", "Commands.BcfIssues.cs"));
        Ok(!cmd.Contains("ExternalEvent.Create(") && !cmd.Contains("externalEvent")
           && cmd.Contains("if (App.Events == null) { window.SetStatus(\"Sentinel's event hub is not running — restart Revit.\"); return; }")
           && cmd.Contains("App.Events.Enqueue(job, what);")
           && cmd.Contains("Apply(\"open the issue\", ua => { apply.RequestApply(vp); apply.Execute(ua); });")
           && cmd.Contains("window.IsolateAllRequested += () => Apply(\"isolate the issue elements\", ua => { apply.RequestIsolateAll(window.Topics); apply.Execute(ua); });")
           && cmd.Contains("window.IssuesForSelectionRequested += () => Apply(\"match the selection to issues\", ua => { apply.RequestIssuesForSelection(window.AllTopics); apply.Execute(ua); });"),
           "jump-to-issue, Isolate ALL and Issues-for-selection go through the event hub: each request is staged and run on Revit's thread as one labelled job, a raise Revit does not take is said and raised again, a missing hub is said in the window");
    }

    // ── Native issue tool (2026-10-21, no BIMcollab): snapshot on the viewpoint, quick edit PUTs only what changed, the list's
    // filters and sort, every status fetched for the window's own Closed filter ──
    static void Native()
    {
        var d = Draft(); d.Snapshot = "data:image/png;base64,iVBORw0KGgo=";
        using (var v = JsonDocument.Parse(JsonSerializer.Serialize(d.ViewpointBody())))
            Ok(v.RootElement.GetProperty("snapshot").GetString() == "data:image/png;base64,iVBORw0KGgo=", "the active view's snapshot rides on the viewpoint as a data URL");
        using (var v = JsonDocument.Parse(JsonSerializer.Serialize(Draft().ViewpointBody())))
            Ok(v.RootElement.GetProperty("snapshot").ValueKind == JsonValueKind.Null, "no snapshot → null, never a blank image");

        BcfTopic T(int nr, string title, string status, string prio, string who, string? due, string? modified = null) => new()
        { Nr = nr, Guid = "g" + nr, Title = title, Status = status, Priority = prio, AssignedTo = who, DueDate = due, ModifiedDate = modified ?? "2026-10-0" + nr + "T10:00:00Z", Labels = new() { "revit" } };
        var all = new[]
        {
            T(1, "Door clashes with duct", "Open", "High", "mep@office.example", "2026-11-01T00:00:00Z"),
            T(2, "Missing fire rating", "Closed", "Normal", "arch@office.example", null),
            T(3, "Wall type wrong", "Resolved", "Critical", "mep@office.example", "2026-10-20T00:00:00Z"),
            T(4, "IDS: WALL — LoadBearing (3 failing)", "In Progress", "Low", "", null),
        };
        var open = IssueList.Filter(all, "", IssueList.OpenIssues, "All types", "All priorities", null, "Nr", false);
        Ok(open.Select(t => t.Nr).SequenceEqual(new[] { 1, 3, 4 }), "'Open issues' = everything not Closed, Resolved included (the bridge's working set)");
        Ok(IssueList.Filter(all, "", "Closed", "All types", "All priorities", null, "Nr", false).Single().Nr == 2, "the Closed filter shows closed issues (BCF Manager's 'Closed issues')");
        Ok(IssueList.Filter(all, "duct", "All", "All types", "All priorities", null, "Nr", false).Single().Nr == 1, "search matches the title, case-insensitively");
        Ok(IssueList.Filter(all, "", "All", "All types", "All priorities", "mep@", "Nr", false).Select(t => t.Nr).SequenceEqual(new[] { 1, 3 }), "'Mine' keeps the issues assigned to the signed-in person");
        Ok(IssueList.Filter(all, "", "All", "All types", "Critical", null, "Nr", false).Single().Nr == 3, "a priority filter");
        Ok(IssueList.Filter(all, "", "All", "All types", "All priorities", null, "Priority", false).Select(t => t.Nr).SequenceEqual(new[] { 4, 2, 1, 3 }), "sort by priority runs Low → Critical, not alphabetically");
        Ok(IssueList.Filter(all, "", "All", "All types", "All priorities", null, "DueDay", false).Select(t => t.Nr).SequenceEqual(new[] { 3, 1, 2, 4 }), "sort by due date puts issues without a deadline last");
        Ok(IssueList.Filter(all, "", "All", "All types", "All priorities", null, "Title", true).First().Nr == 3, "a second click on the header sorts the other way");

        var t1 = all[0];
        var same = IssueList.Changes(t1, "Open", "High", " mep@office.example ", new DateTime(2026, 11, 1));
        Ok(same.Count == 0, "a quick edit that changes nothing sends nothing");
        var ch = IssueList.Changes(t1, "Resolved", "High", "lead@office.example", null);
        Ok(ch.Count == 3 && (string?)ch["topic_status"] == "Resolved" && (string?)ch["assigned_to"] == "lead@office.example" && ch.ContainsKey("due_date") && ch["due_date"] is null && !ch.ContainsKey("priority"),
            "only the changed fields go, in BCF names; a cleared deadline is an explicit null");
        var ch2 = IssueList.Changes(t1, "Open", "High", "mep@office.example", new DateTime(2026, 12, 24, 9, 0, 0));
        Ok(ch2.Count == 1 && (string?)ch2["due_date"] == "2026-12-24T00:00:00Z", "a new deadline is an ISO day at midnight UTC, like the web's");

        _topicStatus = 200; lock (_seen) _seen.Clear();
        using (var sync = new BcfSyncManager(_url, "stale"))
        {
            var s = sync.UpdateAsync("aster-tower", "topic-1", ch, "lead@office.example", () => "tok-C").GetAwaiter().GetResult();
            lock (_seen)
            {
                using var body = JsonDocument.Parse(_seen[0].Body);
                Ok(s == 200 && _seen[0].Method == "PUT" && _seen[0].Path == "/bcf/3.0/projects/aster-tower/topics/topic-1" && _seen[0].Auth == "Bearer tok-C"
                   && body.RootElement.GetProperty("topic_status").GetString() == "Resolved" && body.RootElement.GetProperty("author").GetString() == "lead@office.example"
                   && body.RootElement.GetProperty("due_date").ValueKind == JsonValueKind.Null,
                   "the quick edit is one PUT on the topic, the bearer read per call, the author named, the cleared deadline sent as null");
            }
            _topicStatus = 403;
            Ok(sync.UpdateAsync("aster-tower", "topic-1", ch, "viewer@office.example", () => "tok-C").GetAwaiter().GetResult() == 403, "a refusal comes back as its status for the window to word");
            _topicStatus = 201; lock (_seen) _seen.Clear();
            try { sync.FetchActiveAsync("aster-tower", "model-7", () => "tok-C", status: "all").GetAwaiter().GetResult(); } catch (JsonException) { /* the stub answers a topic, not a list */ }
            lock (_seen) Ok(_seen[0].Path == "/bcf/3.0/projects/aster-tower/topics" && _seen[0].Method == "GET", "the window fetches every status (?status=all) and filters closed ones itself");
        }
        string cmd = File.ReadAllText(Path.Combine(Root(), "SentinelAddin", "Commands.BcfIssues.cs"));
        Ok(cmd.Contains("window.SectionBoxRequested += topic => Apply(\"section-box the issue\", ua => { apply.RequestSectionBox(topic); apply.Execute(ua); });")
           && cmd.Contains("BcfExporter.ExportSnapshot(doc, png);") && cmd.Contains("status: \"all\""),
           "the section box goes through the event hub; the snapshot is Revit's own image export (no model write); every status is fetched");
    }

    /// <summary>The repository root: the first folder up from this check that holds SentinelAddin.</summary>
    static string Root()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d is not null && !Directory.Exists(Path.Combine(d.FullName, "SentinelAddin"))) d = d.Parent;
        return d?.FullName ?? throw new DirectoryNotFoundException("no SentinelAddin folder above " + AppContext.BaseDirectory);
    }
}
