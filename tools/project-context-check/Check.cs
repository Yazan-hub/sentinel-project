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

        // ── 5. SEC-2: the tools' model endpoint, model names, schema, family library and cloud opt-in are this PC's ────────
        Console.WriteLine("\nSEC-2 — the local tools read this PC's settings; a model's own fields are checked before use");
        var inModel = new SentinelSettings
        {
            ProjectCode = "AST", GhostSourceFolder = @"D:\Projects\Aster\drawings",
            OllamaUrl = "http://203.0.113.9/api/generate", GhostModel = "m-from-model", GhostVisionModel = "v-from-model",
            GhostMappingSchemaPath = @"D:\elsewhere\schema.json", GhostFamilyLibraryDir = @"D:\elsewhere\families", GhostCloudOptIn = true,
        };
        var pc = new SentinelSettings
        {
            OllamaUrl = "http://127.0.0.1:11434/api/generate", GhostModel = "qwen-pc", GhostVisionModel = "llava-pc",
            GhostFamilyLibraryDir = @"C:\Office\families", GhostSourceFolder = @"C:\Office\drawings",
        };
        var m = SettingsManager.Merge(inModel, pc);
        Ok(m.OllamaUrl == pc.OllamaUrl && m.GhostModel == "qwen-pc" && m.GhostVisionModel == "llava-pc",
           "the model endpoint and the model names are this PC's, whatever a model holds");
        Ok(m.GhostMappingSchemaPath == "" && m.GhostFamilyLibraryDir == @"C:\Office\families" && !m.GhostCloudOptIn,
           "the mapping schema, the family library and the cloud opt-in are this PC's");
        Ok(m.ProjectCode == "AST" && m.GhostSourceFolder == @"D:\Projects\Aster\drawings" && m.SourceFolderFromModel,
           "a model keeps its project code and its source folder, marked as the model's");
        var none = SettingsManager.Merge(inModel, null);
        Ok(none.OllamaUrl == LocalOnly.DefaultModelUrl && none.GhostModel == new SentinelSettings().GhostModel && none.GhostMappingSchemaPath == ""
           && none.GhostFamilyLibraryDir == "" && !none.GhostCloudOptIn, "with no PC config the defaults stand, never the model's values");
        var blank = SettingsManager.Merge(new SentinelSettings { ProjectCode = "AST" }, pc);
        Ok(blank.GhostSourceFolder == @"C:\Office\drawings" && !blank.SourceFolderFromModel, "a blank source folder is the PC's, not the model's");
        Ok(!SettingsManager.Merge(null, pc).SourceFolderFromModel && SettingsManager.Merge(null, null).OllamaUrl == LocalOnly.DefaultModelUrl,
           "no model settings: the PC's, or the defaults");
        Ok(new SentinelSettings { GhostFamilyLibraryDir = @"D:\x", OllamaUrl = "http://203.0.113.9/" }.IsEmpty,
           "a model holding only PC-only fields reads as empty");

        var payload = SettingsManager.DocumentPayload(inModel);
        foreach (var k in SettingsManager.PcOnlyKeys) Ok(!payload.Contains("\"" + k + "\""), "a model never stores " + k);
        Ok(SettingsManager.PcOnlyKeys.Length == 6 && payload.Contains("\"project_code\": \"AST\"") && payload.Contains("\"ghost_source_folder\""),
           "a model still stores its own fields");
        Ok(ProjectContext.FromSettingsJson(SettingsManager.DocumentPayload(new SentinelSettings { WebProjectKey = "aster-tower" })).Key == "aster-tower",
           "the stored payload still binds the document");

        foreach (var u in new[] { "", "http://localhost:11434/api/generate", "http://127.0.0.1:11434/api/generate", "http://[::1]:11434/api/generate", "https://localhost/api" })
            Ok(LocalOnly.ModelUrlRefusal(u, cloudOptIn: false) is null, "a model endpoint on this PC is called: " + (u == "" ? "(the default)" : u));
        foreach (var u in new[] { "http://203.0.113.9:11434/api/generate", "http://localhost.example.com/api", "http://192.168.1.20:11434/api/generate",
                                  "ftp://localhost/x", "file:///C:/x", "not an address", "http://user:pw@localhost:11434/api/generate" })
            Ok(LocalOnly.ModelUrlRefusal(u, cloudOptIn: false) is { } why && why.Contains("Nothing was read or sent"), "refused in words: " + u);
        Ok(LocalOnly.ModelUrlRefusal("https://models.example.com/api", cloudOptIn: true) is null, "a host elsewhere only when this PC opts in");
        Ok(LocalOnly.ModelUrlRefusal("https://models.example.com/api", cloudOptIn: false)!.Contains("models.example.com"), "the refusal names the host");
        Ok(LocalOnly.ModelUrlRefusal("http://models.example.com/api", cloudOptIn: true) is { } plain && plain.Contains("https") && plain.Contains("Nothing was read or sent"),
           "a host elsewhere is called over https only, even when this PC opts in");
        Ok(LocalOnly.Where("") == "on this PC" && LocalOnly.Where("https://models.example.com/api") == "at models.example.com",
           "the progress text says where the model is");

        Ok(LocalOnly.FolderRefusal(@"D:\Projects\Aster\drawings", fromModel: true) is null && LocalOnly.FolderRefusal("", fromModel: true) is null,
           "a model's full local folder is read; no folder is nothing to refuse");
        foreach (var f in new[] { @"\\files\projects\aster", "//files/projects/aster", @"\\?\UNC\files\projects", @"\\?\C:\Projects", "file://files/projects" })
            Ok(LocalOnly.FolderRefusal(f, fromModel: true) is { } why && why.Contains("Nothing was read"), "a share or device folder a model names is refused: " + f);
        Ok(LocalOnly.FolderRefusal(@"\\files\projects\aster", fromModel: false) is null, "this PC's own config.json may name a share");
        foreach (var f in new[] { "drawings", @"\drawings", "C:drawings", "file:///C:/x" })
            Ok(LocalOnly.FolderRefusal(f, fromModel: false) is not null, "a folder that is not a full drive path is refused: " + f);

        string addinDir = @"C:\Users\u\AppData\Roaming\Autodesk\Revit\Addins\2024\Sentinel", schemas = @"C:\Users\u\AppData\Roaming\Sentinel\schemas";
        Ok(LocalOnly.SchemaRefusal(addinDir + @"\mapping.json", addinDir, schemas) is null && LocalOnly.SchemaRefusal(schemas + @"\bds.json", addinDir, schemas) is null,
           "a .json schema in the add-in's folder or Sentinel\\schemas is read");
        foreach (var p in new[] { schemas + @"\bcf-config.json", schemas + @"\config.json",
                                  schemas + @"\..\bcf-config.json", @"D:\elsewhere\schema.json", schemas + @"\notes.txt", schemas + @"x\a.json", @"\\host\share\schema.json" })
            Ok(LocalOnly.SchemaRefusal(p, addinDir, schemas) is { } why && why.Contains("Nothing was read"), "a schema elsewhere is refused: " + p);

        Ok(SettingsManager.ToolRefusal(new SentinelSettings { GhostSourceFolder = @"\\files\x", SourceFolderFromModel = true }, callsModel: false) is { } w && w.Contains(@"\\files\x"),
           "a tool refuses a share folder the model names, and names it");
        Ok(SettingsManager.ToolRefusal(new SentinelSettings { OllamaUrl = "http://203.0.113.9/api" }, callsModel: false) is null
           && SettingsManager.ToolRefusal(new SentinelSettings { OllamaUrl = "http://203.0.113.9/api" }, callsModel: true) is not null,
           "the endpoint stops a tool that calls the model, not Datum");
        Ok(SettingsManager.ToolRefusal(new SentinelSettings { GhostMappingSchemaPath = @"D:\x\schema.json" }, callsModel: true, addinDirForSchema: addinDir) is not null
           && SettingsManager.ToolRefusal(new SentinelSettings { GhostMappingSchemaPath = @"D:\x\schema.json" }, callsModel: true) is null,
           "the schema is checked where it is read (Ghost Builder)");
        Ok(SettingsManager.ToolRefusal(new SentinelSettings { GhostFamilyLibraryDir = "families" }, callsModel: false) is not null,
           "a family library that is not a full path is refused");
        Ok(SettingsManager.ToolRefusal(new SentinelSettings(), callsModel: true, addinDirForSchema: addinDir) is null, "the defaults pass");
        const string aster = @"D:\Projects\Aster\drawings", elsewhereHttps = "https://models.example.com/api";
        Ok(SettingsManager.ToolRefusal(new SentinelSettings { GhostSourceFolder = aster, SourceFolderFromModel = true, OllamaUrl = elsewhereHttps, GhostCloudOptIn = true },
               callsModel: true) is { } off && off.Contains(aster) && off.Contains("models.example.com") && off.Contains("Nothing was read or sent"),
           "files from a folder a model names go to a model on this PC only, in words");
        Ok(SettingsManager.ToolRefusal(new SentinelSettings { GhostSourceFolder = aster, SourceFolderFromModel = true }, callsModel: true) is null
           && SettingsManager.ToolRefusal(new SentinelSettings { GhostSourceFolder = aster, OllamaUrl = elsewhereHttps, GhostCloudOptIn = true }, callsModel: true) is null,
           "a folder a model names goes to the model on this PC; a folder this PC names may go to a host this PC opted in to");

        // the add-in's sources: one place reads those fields, every tool asks it first, every model client checks its endpoint
        string Src(string rel) => sources.First(s => s.Path == rel).Text;
        var sm = Src(Path.Combine("Engine", "SettingsManager.cs"));
        Ok(sm.Contains("public static SentinelSettings Resolve(Document? doc) => Merge(doc is not null ? LoadFromDocument(doc) : null, LoadFromMachine());"),
           "Resolve is Merge: a model's PC-only fields are never read");
        Ok(sm.Contains("entity.Set(FieldName, DocumentPayload(settings));"), "SaveToDocument stores the payload without the PC-only fields");
        var tools = sources.Where(s => s.Text.Contains("SettingsManager.Resolve(") && !s.Path.EndsWith("SettingsDialog.xaml.cs")).ToList();
        Ok(tools.Count == 3, "three tools resolve the settings: " + string.Join(", ", tools.Select(t => t.Path)));
        foreach (var t in tools)
        {
            int resolve = t.Text.IndexOf("SettingsManager.Resolve(", StringComparison.Ordinal);
            int ask = t.Text.IndexOf("SettingsManager.ToolRefusal(settings,", StringComparison.Ordinal);
            var use = Regex.Match(t.Text.Substring(resolve), @"settings\.(Ghost|Ollama)");
            Ok(ask > resolve && use.Success && ask < resolve + use.Index, t.Path + " asks ToolRefusal before it reads a setting");
        }
        var h5 = Hits(@"\.(OllamaUrl|GhostMappingSchemaPath|GhostFamilyLibraryDir|GhostCloudOptIn)\b")
            .Except(new[] { Path.Combine("Engine", "SettingsManager.cs"), "Commands.GhostBuilder.cs", "Commands.Massing.cs" }).ToArray();
        Ok(h5.Length == 0, "only the settings and the two model tools touch the PC-only fields" + (h5.Length > 0 ? ": " + string.Join(", ", h5) : ""));
        var h6 = Hits(@"\.GhostSourceFolder\b")
            .Except(new[] { Path.Combine("Engine", "SettingsManager.cs"), "Commands.GhostBuilder.cs", "Commands.Massing.cs", "Commands.Datum.cs",
                            Path.Combine("UI", "SettingsDialog.xaml.cs") }).ToArray();
        Ok(h6.Length == 0, "only the settings, Project Setup and the three tools touch the source folder" + (h6.Length > 0 ? ": " + string.Join(", ", h6) : ""));
        var dlg = Src(Path.Combine("UI", "SettingsDialog.xaml.cs"));
        Ok(dlg.Contains("if (!(_current.SourceFolderFromModel && ghostFolder == _current.GhostSourceFolder)) settings.GhostSourceFolder = ghostFolder;")
           && !dlg.Contains("settings.GhostSourceFolder = ghostFolder; // no WebProjectKey"),
           "Project Setup's machine save never turns the folder a model names into this PC's own");
        int projectSave = dlg.IndexOf("App.Events?.Enqueue(_doc, \"save the project settings\"", StringComparison.Ordinal);
        int folderAsk = dlg.IndexOf("LocalOnly.FolderRefusal(ghostFolder, fromModel: true) is { } notLocal", StringComparison.Ordinal);
        Ok(folderAsk > dlg.IndexOf("private void OnSave(", StringComparison.Ordinal) && folderAsk < projectSave,
           "Project Setup's project save refuses a folder the tools would refuse, in words, before it saves");
        var news = sources.SelectMany(s => Regex.Matches(s.Text, @"new (LocalGhostBuilder|LocalVisionReader|MassingVisionReader)\(([^;]*)").Select(x => (s.Path, Call: x.Value))).ToList();
        Ok(news.Count == 3 && news.All(n => n.Call.Contains("settings.GhostCloudOptIn")),
           "every model client is built with this PC's opt-in" + string.Concat(news.Where(n => !n.Call.Contains("settings.GhostCloudOptIn")).Select(n => " | " + n.Path)));
        foreach (var f in new[] { "GhostBuilder_Architecture.cs", "LocalVisionReader.cs", "MassingVisionReader.cs" })
        {
            var text = Src(Path.Combine("GhostBuilder", f));
            Ok(text.Contains("LocalOnly.ModelUrl(ollamaUrl, cloudOptIn)") && !text.Contains("? \"http://localhost:11434/api/generate\" : ollamaUrl")
               && text.Contains("new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })"),
               f + ": the constructor checks its endpoint and calls only that address (no unchecked fallback, no redirect followed)");
        }

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
