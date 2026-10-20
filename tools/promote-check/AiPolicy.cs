#nullable disable
using System.Net;
using System.Text;
using Sentinel.Commands;
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    const string LockedBody = "{\"policies\":{\"aster-tower\":{\"key\":\"aster-tower\",\"local_only\":true,\"redact\":true,"
        + "\"set_by\":{\"local_only\":\"office\",\"redact\":\"project\"},\"refs\":{\"project\":\"ai_policy@2\",\"office\":\"ai_policy@1\",\"office_key\":\"bds\"},"
        + "\"words\":\"AI stays on this network for aster-tower: the office's AI policy (ai_policy@1) allows no cloud AI.\"}}}";
    const string OpenBody = "{\"policies\":{\"demo\":{\"key\":\"demo\",\"local_only\":false,\"redact\":false,\"set_by\":{\"local_only\":null,\"redact\":null},"
        + "\"refs\":{\"project\":null,\"office\":null,\"office_key\":null},\"words\":\"No AI policy is set for demo.\"}}}";

    // ── AI privacy controls (spec 2026-10-20): the lock the bridge writes, and what the add-in does with a model off this PC ──
    static void AiPolicyChecks()
    {
        Console.WriteLine("\nAI privacy controls — the policy read, and the off-PC model refused when the project is locked");

        // Parse: a policy, or the words why it was not read - never a guess
        var locked = AiPolicy.Parse(LockedBody, "aster-tower");
        Ok(locked.Error == null && locked.LocalOnly && locked.Redact && locked.Words.StartsWith("AI stays on this network for aster-tower"),
           "a locked, redacted policy is read, with the bridge's sentence");
        var open = AiPolicy.Parse(OpenBody, "demo");
        Ok(open.Error == null && !open.LocalOnly && !open.Redact && open.Words == "No AI policy is set for demo.", "an open policy is read as open");
        Ok(AiPolicy.Parse(LockedBody, "ASTER-TOWER").LocalOnly, "the key is found in any case");
        Ok(AiPolicy.Parse(LockedBody.Replace("\"words\":\"AI stays on this network for aster-tower: the office's AI policy (ai_policy@1) allows no cloud AI.\"", "\"x\":1"), "aster-tower") is { Error: null, LocalOnly: true } nowords
           && nowords.Words == "AI stays on this network for aster-tower.", "a locked policy with no sentence still says it is locked");
        foreach (var (body, why) in new[]
        {
            ("{not json", "malformed JSON"), ("", "an empty body"), (null, "no body"), ("[]", "an array"), ("{}", "no policies"),
            ("{\"policies\":[]}", "policies that is not an object"), ("{\"policies\":{}}", "no policy for the key"),
            ("{\"policies\":{\"aster-tower\":5}}", "a policy that is not an object"),
            ("{\"policies\":{\"aster-tower\":{\"redact\":true}}}", "no local_only"),
            ("{\"policies\":{\"aster-tower\":{\"local_only\":\"yes\",\"redact\":true}}}", "a local_only that is not a boolean"),
            ("{\"policies\":{\"aster-tower\":{\"local_only\":true}}}", "no redact"),
            ("{\"policies\":{\"other\":{\"local_only\":true,\"redact\":true}}}", "another project's policy"),
        })
        {
            var r = AiPolicy.Parse(body, "aster-tower");
            Ok(r.Error is { Length: > 0 } && !r.LocalOnly && !r.Redact, "a reply that is not this project's policy is an error in words, not a policy: " + why);
        }

        // OffPcModelRefusal: the four rules
        string W = "AI stays on this network for aster-tower: the office's AI policy (ai_policy@1) allows no cloud AI.";
        Ok(AiPolicy.OffPcModelRefusal(true, W, null, "on this PC", "aster-tower") is null
           && AiPolicy.OffPcModelRefusal(false, null, "the bridge did not answer", "on this PC", "aster-tower") is null,
           "a model on this PC is never refused - locked, or the policy unread");
        Ok(AiPolicy.OffPcModelRefusal(true, W, null, "at models.example.com", "") is null
           && AiPolicy.OffPcModelRefusal(false, null, "the bridge did not answer", "at models.example.com", "  ") is null,
           "a model bound to no project has no policy: this PC's opt-in rules as today");
        var failClosed = AiPolicy.OffPcModelRefusal(false, null, "Bridge 403: You are not a member of this project.", "at models.example.com", "aster-tower");
        Ok(failClosed == "This model's project's AI policy was not read (Bridge 403: You are not a member of this project) — Sentinel uses a model off this PC only once the policy is read. "
                       + "This PC's own model still works. Nothing was read or sent.", "a policy that was not read refuses an off-PC model, in the agreed words (fail closed)");
        var lockedWords = AiPolicy.OffPcModelRefusal(true, W, null, "at models.example.com", "aster-tower");
        Ok(lockedWords == W + " Sentinel uses this PC's own model for aster-tower; \"Allow a model off this PC\" does not override it. Nothing was read or sent.",
           "a locked project refuses an off-PC model, with the bridge's words and the key");
        Ok(AiPolicy.OffPcModelRefusal(false, "No AI policy is set for demo.", null, "at models.example.com", "demo") is null, "an open policy lets the opted-in off-PC model through");
        Ok(AiPolicy.OffPcModelRefusal(true, W, "x", "at h", "k") == AiPolicy.OffPcModelRefusal(false, null, "x", "at h", "k"), "unread beats locked: the same fail-closed words");
        Ok(LocalOnly.Where("") == AiPolicy.OnThisPc && LocalOnly.Where("http://localhost:11434/api/generate") == AiPolicy.OnThisPc
           && AiPolicy.Applies(LocalOnly.Where("https://models.example.com/api"), "k") && !AiPolicy.Applies(LocalOnly.Where(""), "k") && !AiPolicy.Applies("at h", ""),
           "the policy is asked only for a model off this PC on a bound model (LocalOnly.Where's words)");

        // PC Settings' line
        Ok(AiPolicy.SettingsLine("", default, false) == "No Sentinel project is open — the office's AI policy applies once a model bound to a project is open."
           && AiPolicy.SettingsLine("  ", locked, true).StartsWith("No Sentinel project is open"), "no project open: said, whatever was read");
        Ok(AiPolicy.SettingsLine("aster-tower", locked, false) == locked.Words + " Names are masked in AI answers (CLIENT_…, PERSON_…).",
           "a redacting policy says names are masked");
        Ok(AiPolicy.SettingsLine("aster-tower", locked, true).EndsWith(" This lock overrides \"Allow a model off this PC\" for this project."),
           "a lock with the PC's opt-in ticked says the lock wins");
        Ok(AiPolicy.SettingsLine("demo", open, true) == "No AI policy is set for demo.", "an open policy adds nothing, ticked or not");
        Ok(AiPolicy.SettingsLine("aster-tower", (false, false, "", "the connection failed — No connection could be made."), false)
           == "AI policy not read — the connection failed — No connection could be made.", "an unread policy is said as not read, with the why");

        // the client, against a throwaway bridge on loopback
        var seen = new List<(string Query, string Auth)>();
        var port = FreePort();
        var http = new HttpListener(); http.Prefixes.Add($"http://127.0.0.1:{port}/"); http.Start();
        _ = Task.Run(async () =>
        {
            while (http.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await http.GetContextAsync(); } catch { break; }
                string q = ctx.Request.QueryString["project"] ?? "";
                lock (seen) seen.Add((ctx.Request.Url.PathAndQuery, ctx.Request.Headers["Authorization"] ?? ""));
                (int status, string body) = ctx.Request.HttpMethod != "GET" || ctx.Request.Url.AbsolutePath != "/ai/policy" ? (405, "{}")
                    : q == "aster-tower" ? (200, LockedBody) : q == "demo" ? (200, OpenBody)
                    : q == "gone" ? (404, "{\"message\":\"No project named gone.\"}") : q == "secret" ? (403, "{\"message\":\"You are not a member of secret.\"}")
                    : q == "weird key/&" ? (200, "{\"policies\":{\"weird key/&\":{\"local_only\":false,\"redact\":false,\"words\":\"ok\"}}}")
                    : (200, "<html>not json</html>");
                var bytes = Encoding.UTF8.GetBytes(body);
                ctx.Response.StatusCode = status; ctx.Response.ContentType = "application/json";
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length); ctx.Response.Close();
            }
        });
        try
        {
            var cfg = BcfConfig.Checked(new BcfConfig { ServiceUrl = $"http://127.0.0.1:{port}/", FileToken = "tok-1" });
            var a = AiPolicyClient.Fetch(cfg, "aster-tower");
            Ok(a.Error == null && a.LocalOnly && a.Redact && a.Words.Contains("allows no cloud AI"), "Fetch reads a locked project's policy from GET /ai/policy");
            Ok(AiPolicyClient.Fetch(cfg, "demo") is { Error: null, LocalOnly: false }, "Fetch reads an open project's policy");
            lock (seen) Ok(seen[0].Query == "/ai/policy?project=aster-tower" && seen[0].Auth == "Bearer tok-1", "the request is a GET with the project in the query and this PC's bearer");
            Ok(AiPolicyClient.Fetch(cfg, "weird key/&") is { Error: null, Words: "ok" }, "the key is escaped in the query");
            var forbidden = AiPolicyClient.Fetch(cfg, "secret");
            Ok(forbidden.Error == "Bridge 403: You are not a member of secret." && !forbidden.LocalOnly, "a refusal is the bridge's own words, not a policy");
            Ok(AiPolicyClient.Fetch(cfg, "gone").Error == "Bridge 404: No project named gone.", "an unknown project is the bridge's own words");
            Ok(AiPolicyClient.Fetch(cfg, "html").Error is { Length: > 0 } notJson && notJson.Contains("not an AI policy"), "a 200 that is not a policy is an error in words");
            var downPort = FreePort();
            var down = AiPolicyClient.Fetch(BcfConfig.Checked(new BcfConfig { ServiceUrl = $"http://127.0.0.1:{downPort}" }), "aster-tower");
            Ok(down.Error is { Length: > 0 } && down.Error.StartsWith("the connection failed") && !down.LocalOnly, "no bridge answering is an error in words (fail closed), not 'not locked'");
            int before; lock (seen) before = seen.Count;
            var refused = AiPolicyClient.Fetch(BcfConfig.Checked(new BcfConfig { ServiceUrl = "http://203.0.113.9:4100", FileToken = "tok-1" }), "aster-tower");
            Ok(refused.Error is { } r && r.Contains("not https and not on this PC"), "a bridge address Sentinel refuses is never asked (UrlRule), and says so");
            Ok(AiPolicyClient.Fetch(new BcfConfig { ServiceUrl = "http://203.0.113.9:4100" }, "aster-tower").Error is { Length: > 0 }, "…even when the config was not loaded through Checked");
            lock (seen) Ok(seen.Count == before, "the refused address sent nothing");
            // the whole decision a tool makes, through the bridge: locked + off-PC model = the lock's words
            var p = AiPolicyClient.Fetch(cfg, "aster-tower");
            Ok(AiPolicy.OffPcModelRefusal(p.LocalOnly, p.Words, p.Error, "at models.example.com", "aster-tower") is { } w && w.Contains("allows no cloud AI") && w.EndsWith("Nothing was read or sent."),
               "a locked project, an off-PC model: refused in the bridge's words");
            var o = AiPolicyClient.Fetch(cfg, "demo");
            Ok(AiPolicy.OffPcModelRefusal(o.LocalOnly, o.Words, o.Error, "at models.example.com", "demo") is null, "an open project, an off-PC model: allowed");
        }
        finally { http.Stop(); http.Close(); }

        // the wiring: every tool that can send to a model off this PC asks, after its own refusal and before anything is read or sent
        string ghost = Src("Commands.GhostBuilder.cs"), massing = Src("Commands.Massing.cs"), standards = Src("Commands.Standards.cs"), win = Src("Commands.PcSettings.cs"), client = Src("Coordination", "AiPolicyClient.cs");
        int gAsk = ghost.IndexOf("AiPolicyClient.Refusal(ProjectContext.For(doc).Key, LocalOnly.Where(settings.OllamaUrl))", StringComparison.Ordinal);
        Ok(gAsk > ghost.IndexOf("SettingsManager.ToolRefusal(settings, callsModel: true", StringComparison.Ordinal) && gAsk < ghost.IndexOf("File.ReadAllText(settings.GhostMappingSchemaPath)", StringComparison.Ordinal)
           && gAsk < ghost.IndexOf("new DwgPickWindow(", StringComparison.Ordinal) && ghost.Split("AiPolicyClient.").Length == 2,
           "Ghost Builder asks once, after its own refusal and before the schema, a folder or a drawing is read");
        int mAsk = massing.IndexOf("AiPolicyClient.Refusal(ctx.Key, LocalOnly.Where(settings.OllamaUrl))", StringComparison.Ordinal);
        Ok(mAsk > massing.IndexOf("SettingsManager.ToolRefusal(settings, callsModel: true", StringComparison.Ordinal) && mAsk < massing.IndexOf("EvidenceClient.FetchPack(", StringComparison.Ordinal)
           && massing.Split("AiPolicyClient.").Length == 2, "Photo Massing asks once, after its own refusal and before the pack or an image is read");
        int sAsk = standards.IndexOf("AiPolicyClient.Refusal(Sentinel.Engine.ProjectContext.For(doc).Key, extractor.Where)", StringComparison.Ordinal);
        Ok(sAsk > standards.IndexOf("new DocumentExtractor(", StringComparison.Ordinal) && sAsk < standards.IndexOf("StandardsReview.Create(uiapp);\n        window.Closed", StringComparison.Ordinal)
           && standards.Split("AiPolicyClient.").Length == 2 && Src("Standards", "DocumentExtractor.cs").Contains("public string Where => LocalOnly.Where(_url);"),
           "Standards ▸ Ingest documents asks once, before its window opens or any document is read or sent");
        Ok(win.Contains("new PcSettingsWindow(doc is null ? \"\" : ProjectContext.For(doc).Key)") && win.Contains("Heading(\"AI policy (this model's project)\")")
           && win.Contains("Task.Run(() => ReadPolicy(key))") && win.Split("AiPolicyClient.Fetch(").Length == 2
           && !win.Substring(win.IndexOf("Snapshot() => new()", StringComparison.Ordinal), win.IndexOf("BcfKeys = new()", StringComparison.Ordinal) - win.IndexOf("Snapshot() => new()", StringComparison.Ordinal)).Contains("olicy"),
           "PC Settings is given the open model's project, reads its policy off the UI thread once, and writes nothing about it");
        Ok(client.Contains("HttpMethod.Get") && !client.Contains("Post") && client.Contains("TimeSpan.FromSeconds(6)") && client.Contains("UrlRule.Refusal(cfg.ServiceUrl, \"bridge\")")
           && !client.Contains("http://") && !client.Contains("https://"),
           "the client is one GET with a 6 s timeout, behind UrlRule, with no address of its own");
    }

    static int FreePort()
    {
        var l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0); l.Start();
        int port = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop();
        return port;
    }
}
