#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Commands;
using Sentinel.Engine;

static partial class Check
{
    // ── The founder's rule (2026-10-19): no per-PC setting needs a file edit — Standards ▸ PC Settings ──
    static void PcSettingsChecks()
    {
        Console.WriteLine("\nPC Settings — this PC's two files, from a window");
        var dir = Path.Combine(Path.GetTempPath(), "sentinel-pcsettings-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            // bcf-config.json: a legacy key, a key no window shows and a case variant survive; only what changed is written
            var bcfPath = Path.Combine(dir, "bcf-config.json");
            File.WriteAllText(bcfPath, "{\"ServiceUrl\":\"http://localhost:4100\",\"serviceToken\":\"tok-1\",\"projectId\":\"legacy\",\"office\":{\"a\":1},\"supabaseUrl\":\"https://x.supabase.co\"}");
            var bcf = PcSettings.Read(bcfPath, out var err);
            Ok(bcf != null && err == null && PcSettings.Text(bcf, "serviceUrl", "") == "http://localhost:4100",
               "a key is read in any case, as the add-in reads bcf-config.json");
            var text = PcSettings.Merged(bcf, new Dictionary<string, JsonNode> { ["serviceUrl"] = JsonValue.Create("http://127.0.0.1:4101") });
            var bak = PcSettings.Write(bcfPath, text, new DateTime(2026, 10, 19, 9, 30, 0));
            var back = JsonNode.Parse(File.ReadAllText(bcfPath)).AsObject();
            Ok(back["serviceUrl"]?.GetValue<string>() == "http://127.0.0.1:4101" && !back.ContainsKey("ServiceUrl"),
               "a changed key is written under its own spelling, the other case dropped");
            Ok(back["projectId"]?.GetValue<string>() == "legacy" && back["office"]?["a"]?.GetValue<int>() == 1
               && back["serviceToken"]?.GetValue<string>() == "tok-1" && back["supabaseUrl"]?.GetValue<string>() == "https://x.supabase.co",
               "every key the window does not change is kept, nested ones included");
            Ok(bak == bcfPath + ".bak-20261019-093000" && File.ReadAllText(bak).Contains("\"ServiceUrl\":\"http://localhost:4100\""),
               "the old file is backed up first, beside it, named by the time");
            var cfg = BcfConfig.Parse(File.ReadAllText(bcfPath));
            Ok(cfg.ServiceUrl == "http://127.0.0.1:4101" && cfg.FileToken == "tok-1", "the add-in's own reader reads the saved file");
            Ok(!File.Exists(bcfPath + ".tmp"), "no temporary file is left behind");

            // config.json: written from nothing (no backup), read by the add-in's reader, unknown keys kept on the next save
            var cfgPath = Path.Combine(dir, "config.json");
            var empty = PcSettings.Read(cfgPath, out err);
            Ok(empty != null && empty.Count == 0 && err == null, "no file reads as empty");
            Ok(PcSettings.Write(cfgPath, PcSettings.Merged(empty, new Dictionary<string, JsonNode>
                { ["ollama_url"] = JsonValue.Create("http://localhost:11434/api/generate"), ["ghost_cloud_opt_in"] = JsonValue.Create(true) }), DateTime.Now) == null,
               "a first save makes the file and no backup");
            File.WriteAllText(cfgPath, File.ReadAllText(cfgPath).TrimEnd().TrimEnd('}') + ",\"project_code\":\"BDS1\",\"future_key\":[1,2]}");
            var c2 = PcSettings.Read(cfgPath, out _);
            PcSettings.Write(cfgPath, PcSettings.Merged(c2, new Dictionary<string, JsonNode> { ["ghost_model"] = JsonValue.Create("qwen3:8b") }), DateTime.Now.AddSeconds(1));
            var s = JsonSerializer.Deserialize<SentinelSettings>(File.ReadAllText(cfgPath));
            var raw = JsonNode.Parse(File.ReadAllText(cfgPath)).AsObject();
            Ok(s.GhostModel == "qwen3:8b" && s.GhostCloudOptIn && s.ProjectCode == "BDS1" && raw["future_key"]?.AsArray().Count == 2,
               "config.json round-trips through the add-in's reader and keeps a key it does not know");
            Ok(PcSettings.Flag(c2, "ghost_cloud_opt_in") && !PcSettings.Flag(c2, "missing"), "a tick reads as the file's true");

            File.WriteAllText(cfgPath, "{ not json");
            Ok(PcSettings.Read(cfgPath, out err) == null && err.StartsWith("config.json did not read"), "a broken file is said, not guessed at");
        }
        finally { try { Directory.Delete(dir, true); } catch { } }

        // the save rules: the add-in's own (UrlRule, LocalOnly) and PR-1's
        string R(string url, bool token, string ollama = "", bool optIn = false, string supa = "") =>
            PcSettings.Refusal(url, supa, token, ollama, optIn, "", "", @"C:\addin", @"C:\schemas");
        Ok(R("http://localhost:4100", true) == null && R("http://127.0.0.1:4100", true) == null, "this PC's shared token with the bridge on this PC saves");
        Ok(R("https://pc.tailnet.ts.net", true) == PcSettings.TokenOffPc && R("https://pc.tailnet.ts.net", false) == null,
           "PR-1: the shared token is refused with a bridge off this PC; a signed-in PC may use one");
        Ok(R("", false)?.StartsWith("Type the bridge address") == true, "a blank bridge address is refused in words");
        var plain = R("http://bridge.example.test", false);
        Ok(plain != null && plain.Contains("PC Settings") && !plain.Contains("Nothing was"), "plain http elsewhere is refused in words that name this window, not a file");
        var cloud = R("http://localhost:4100", false, "https://ai.example/api/generate");
        Ok(cloud != null && cloud.Contains("Allow a model off this PC") && !cloud.Contains("config.json") && R("http://localhost:4100", false, "https://ai.example/api/generate", true) == null,
           "a model off this PC needs the opt-in tick, named as the window names it");
        Ok(R("http://localhost:4100", false, supa: "http://x.supabase.co") != null, "a plain-http sign-in address elsewhere is refused");

        // the Test buttons' pure parts
        Ok(PcSettings.TagsUrl("http://localhost:11434/api/generate") == "http://localhost:11434/api/tags"
           && PcSettings.TagsUrl("https://ai.example/ollama/api/generate") == "https://ai.example/ollama/api/tags",
           "Ollama's model list sits beside the generate address");
        var names = new[] { "qwen2.5:7b-instruct", "llava:latest" };
        Ok(PcSettings.Installed(names, "llava", "The photo model") == " The photo model llava is installed."
           && PcSettings.Installed(names, "qwen3:8b", "Ghost Builder's model").Contains("NOT installed") && PcSettings.Installed(names, "", "x") == "",
           "a model is said installed or not (a bare name matches :latest)");
        var closed = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0); closed.Start();
        var port = ((System.Net.IPEndPoint)closed.LocalEndpoint).Port; closed.Stop();
        Ok(PcSettings.TestBridge("http://127.0.0.1:" + port).StartsWith("✗ No bridge answers at http://127.0.0.1:" + port),
           "Test says in words that no bridge answers");
        Ok(PcSettings.TestBridge("http://bridge.example.test").StartsWith("✗ The bridge address"), "Test sends nothing to an address Sentinel refuses");

        // the wiring: the button, the window's save path, and no secret on screen or in a log
        var app = Src("App.cs"); var win = Src("Commands.PcSettings.cs");
        Ok(app.Contains("Sub(std, \"Sentinel_PcSettings\", \"PC Settings\", \"Sentinel.Commands.PcSettingsCommand\"")
           && app.IndexOf("Sentinel_PcSettings") > app.IndexOf("Sentinel_SignIn") && app.IndexOf("Sentinel_PcSettings") < app.IndexOf("Sentinel_BuildOfficeSystem"),
           "PC Settings sits under Standards, after Sign in");
        Ok(win.Contains("PcSettings.Write(SettingsManager.ConfigJsonPath, PcSettings.Merged(_cfg ?? new JsonObject(), cfgSet)")
           && win.Contains("PcSettings.Write(BcfConfig.FilePath, PcSettings.Merged(_bcf ?? new JsonObject(), bcfSet)")
           && win.Contains("if (_shown.TryGetValue(kv.Key, out var was) && was == kv.Value) continue;"),
           "Save writes only what changed, into the files the add-in reads, through the merge that keeps other keys");
        Ok(win.Contains("PasswordBox _token") && win.Contains("_anonKey = new()") && !win.Contains("LogDoctor") && !win.Contains("Debug.")
           && win.Split(new[] { ".Password" }, StringSplitOptions.None).Length - 1 == 7,
           "the token and the key sit in password boxes, are only written to the file, and nothing is logged");
        Ok(win.Contains("var test = read();\n            Task.Run(() => { try { return test(); }") && win.Contains("return () => PcSettings.TestBridge(u);")
           && win.Contains("return () => PcSettings.TestSignIn(u, k);") && win.Contains("return () => PcSettings.TestModel(u, o, m, v);"),
           "drill F-PCS-1: each Test reads the form on the UI thread, and only the call runs off it");
        Ok(win.Contains("PcSettings.Refusal(now[\"serviceUrl\"], now[\"supabaseUrl\"], keepsToken,"), "Save runs the rules first (PR-1 included)");
        var help = File.ReadAllText(Repo("SentinelAddin", "Resources", "help", "content.json"));
        Ok(help.Contains("\"Sentinel_PcSettings\": {") && File.Exists(Repo("SentinelAddin", "Resources", "help", "Sentinel_PcSettings.html")),
           "F1 opens a help page for PC Settings");
        var gb = Src("Commands.GhostBuilder.cs"); var lo = Src("Engine", "LocalOnly.cs");
        Ok(!gb.Contains("config.json, or clear it") && !lo.Contains("set ollama_url in"), "the tools' words send a person to PC Settings, not to a file");
    }
}
