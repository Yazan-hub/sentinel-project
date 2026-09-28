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
        try { Refusals(); Bodies(); Created(); Refused(); Lost(); Silent(); }
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
}
