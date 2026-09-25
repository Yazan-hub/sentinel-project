using System.Text.RegularExpressions;
using Sentinel.Commands;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("ProjectContext — a document's web project comes from the document, or it is not bound\n");

        // ── 1. the settings JSON the document stores (SettingsManager.SaveToDocument writes it indented) ──
        var saved = "{\n  \"master_ruleset_path\": \"\",\n  \"project_code\": \"AST\",\n  \"web_project_key\": \"aster-tower\",\n  \"publish_linked_models\": false\n}";
        var c = ProjectContext.FromSettingsJson(saved);
        Ok(c.IsBound && c.Key == "aster-tower", "a stored key binds the document");
        Ok(ProjectContext.FromSettingsJson("{\"web_project_key\":\"  demo \"}").Key == "demo", "the key is trimmed");

        // ── 2. everything else is unbound — never "default", never a guess ───────────────────────────────
        foreach (var (json, why) in new (string?, string)[]
        {
            (null, "no settings stored"),
            ("", "empty settings string"),
            ("{}", "settings without the key"),
            ("{\"web_project_key\":\"\"}", "empty key"),
            ("{\"web_project_key\":\"   \"}", "blank key"),
            ("{\"web_project_key\":42}", "non-string key"),
            ("{\"WebProjectKey\":\"demo\"}", "the C# property name is not the stored name"),
            ("[\"demo\"]", "not an object"),
            ("{not json", "corrupt settings"),
        })
        {
            var u = ProjectContext.FromSettingsJson(json);
            Ok(!u.IsBound && u.Key == "", "unbound: " + why);
        }
        Ok(ProjectContext.NotBound.Contains("Project Setup"), "the not-bound message points to Project Setup");

        // ── 3. bcf-config.json is no longer a key source; an old file with projectId still loads ─────────
        var cfg = BcfConfig.Parse("{\"serviceUrl\":\"http://localhost:4100\",\"projectId\":\"default\",\"modelId\":\"\",\"serviceToken\":\"t0k\"}");
        Ok(cfg.ServiceUrl == "http://localhost:4100" && cfg.ServiceToken == "t0k", "legacy bcf-config with projectId still parses (field ignored)");
        Ok(typeof(BcfConfig).GetProperty("ProjectId") is null, "BcfConfig has no ProjectId");

        // ── 4. no fallback left in the add-in sources ─────────────────────────────────────────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 8 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        var addin = Path.Combine(root, "SentinelAddin");
        var sources = Directory.EnumerateFiles(addin, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar)
                     && !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar))
            .Select(f => (Path: Path.GetRelativePath(addin, f), Text: File.ReadAllText(f))).ToList();
        Ok(sources.Count > 50, $"scanned {sources.Count} add-in sources");
        string[] Hits(string pattern) => sources.Where(s => Regex.IsMatch(s.Text, pattern)).Select(s => s.Path).ToArray();
        var h1 = Hits(@"\bWebProjectKeyFor\b");
        Ok(h1.Length == 0, "no WebProjectKeyFor call left" + (h1.Length > 0 ? ": " + string.Join(", ", h1) : ""));
        var h2 = Hits(@"\.ProjectId\b");
        Ok(h2.Length == 0, "no .ProjectId read left" + (h2.Length > 0 ? ": " + string.Join(", ", h2) : ""));
        var h3 = Hits(@"Env\(""THATOPEN_PROJECT_ID""");
        Ok(h3.Length == 0, "no THATOPEN_PROJECT_ID fallback" + (h3.Length > 0 ? ": " + string.Join(", ", h3) : ""));
        var h4 = Hits(@"\.WebProjectKey\b").Where(p => !p.EndsWith("SettingsDialog.xaml.cs")).ToArray();
        Ok(h4.Length == 0, "only Project Setup touches SentinelSettings.WebProjectKey" + (h4.Length > 0 ? ": " + string.Join(", ", h4) : ""));

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
