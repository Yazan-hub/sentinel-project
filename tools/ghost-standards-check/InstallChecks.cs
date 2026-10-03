using Sentinel.Coordination;
using Sentinel.Standards;

/// <summary>MA-2a (BOS-3): Install on office from Revit — the pure words and reads (TypeCatalogExport.OfficeKeyFrom, InstallJson,
/// InstallLine, NotInstalledLine) and, by source scan, the window's button, the command's off-thread wiring and the bridge read.</summary>
static class InstallChecks
{
    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Console.WriteLine("\nMA-2a (BOS-3) — Install catalogue on office from Revit (TypeCatalogExport, GovernedNotify, StandardsReviewWindow)");
        const string project = "{\"key\":\"demo\",\"kind\":\"project\",\"office_key\":\"bds-office\",\"keys\":[\"demo\"]}";
        const string office = "{\"key\":\"bds-office\",\"kind\":\"office\",\"office_key\":null,\"keys\":[\"bds-office\",\"demo\"]}";
        const string orphan = "{\"key\":\"ma2a\",\"kind\":\"project\",\"office_key\":null,\"keys\":[\"ma2a\"]}";
        _ok(TypeCatalogExport.OfficeKeyFrom(project, "demo", out var e1) == "bds-office" && e1 == null, "a project's scope names its office: the catalogue goes there");
        _ok(TypeCatalogExport.OfficeKeyFrom(office, "bds-office", out var e2) == "bds-office" && e2 == null, "an office's own scope: the catalogue goes on the office itself");
        _ok(TypeCatalogExport.OfficeKeyFrom(orphan, "ma2a", out var e3) == null
            && e3 == "project ma2a belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)",
            "a project with no office is refused, in words — never installed on the project");
        _ok(TypeCatalogExport.OfficeKeyFrom("not json", "demo", out var e4) == null && e4 == "the bridge's answer to the scope read could not be read"
            && TypeCatalogExport.OfficeKeyFrom("{\"kind\":\"project\"}", "demo", out var e5) == null && e5!.StartsWith("project demo belongs to no office"),
            "an answer that is not the scope, or names no office, is refused in words");

        var types = new List<TypeSpec> { new() { Category = "Walls", Bic = "OST_Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200 } };
        string body = TypeCatalogExport.InstallJson("Office Project (Template)", new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.FromHours(2)), types, new List<ViewTemplateSpec>(), "Office Project (Template)");
        using (var d = System.Text.Json.JsonDocument.Parse(body))
        {
            var src = d.RootElement.GetProperty("source");
            _ok(src.GetProperty("tool").GetString() == "revit-build" && src.GetProperty("document").GetString() == "Office Project (Template)"
                && d.RootElement.GetProperty("template").GetProperty("title").GetString() == "Office Project (Template)" && d.RootElement.GetProperty("count").GetInt32() == 1,
                "the install body is the export plus a top-level source {tool: revit-build, document} — the PUT route lifts it into the pointer");
        }
        var read = Sentinel.GhostBuilder.GuidelineMatcher.FromBodies(null, body, out _, out var err);
        _ok(read.HasCatalog && err == null, "…and still parses as type_catalog@n (the source key is ignored by the readers)");
        _ok(TypeCatalogExport.InstallLine("bds-office", 2, "3f0737600a1b9c8d7e6f5a4b3c2d1e0f3f0737600a1b9c8d7e6f5a4b3c2d1e0f", 1434, "BDS_Project Number_Project Name (Template)")
            == "type_catalog@2 · office · 3f0737600a1b…: installed on bds-office — 1,434 types from BDS_Project Number_Project Name (Template). Ghost Builder, Promote and the bridge read it from here on; GET /cde/bds-office/artefacts/type_catalog answers the same sha.",
            "the window's line after an install: the artefact's label, the office, the count, where it is read from");
        _ok(TypeCatalogExport.NotInstalledLine("HTTP 403: this action requires the lead role (you are contributor)") == "Catalogue NOT installed: HTTP 403: this action requires the lead role (you are contributor)",
            "the window's line after a refusal carries the bridge's own words (the role sentence included)");
        _ok(TypeCatalogExport.Message(2, "T", "C:\\x.json").Contains("Install catalogue on office"), "the export dialog names the window's button as the other way to install");

        string Src(params string[] parts) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(parts).ToArray()));
        string window = Src("UI", "StandardsReviewWindow.cs");
        _ok(window.Contains("public event Action? InstallRequested;") && window.Contains("Btn(\"Install catalogue on office\", () => InstallRequested?.Invoke())"),
            "the review window has the button and raises the event");
        string cmd = Src("Commands.Standards.cs");
        int wire = cmd.IndexOf("window.InstallRequested += () =>", StringComparison.Ordinal);
        int enqueue = cmd.IndexOf("App.Events.Enqueue(_ =>", wire, StringComparison.Ordinal);
        // Review C22: signed out, GovernedNotify sends the machine's FileToken, which the bridge reads as `service` and lets past the
        // lead check; the office catalogue could be installed by anyone holding the shared token. The command refuses before any call.
        int signIn = cmd.IndexOf("if (!UserSession.IsSignedIn) { window.SetStatus(TypeCatalogExport.NotInstalledLine(\"sign in first", wire, StringComparison.Ordinal);
        _ok(signIn > wire && signIn < enqueue && TypeCatalogExport.NotInstalledLine("sign in first — installing on the office is a lead's own action, not the machine's")
            == "Catalogue NOT installed: sign in first — installing on the office is a lead's own action, not the machine's",
            "a signed-out Revit is refused in the window before the scope read: the machine credential is never the installer of an office catalogue (review C22)");
        int task = cmd.IndexOf("Task.Run(() =>", enqueue, StringComparison.Ordinal);
        int scope = cmd.IndexOf("GovernedNotify.ProjectScope(key)", task, StringComparison.Ordinal);
        int put = cmd.IndexOf("GovernedNotify.InstallArtefact(office, \"type_catalog\", TypeCatalogExport.InstallJson(", scope, StringComparison.Ordinal);
        _ok(wire > 0 && enqueue > wire && task > enqueue && scope > task && put > scope,
            "the command reads the key on the API thread (the event hub), then the scope read and the PUT run in Task.Run — no network call on Revit's thread");
        _ok(cmd.Contains("TypeCatalogExport.OfficeKeyFrom(scope.Json!, key, out var why)") && cmd.Contains("TypeCatalogExport.InstallLine(office, put.Version, put.Sha256, types.Count, title)"),
            "the office comes from the scope answer, and the window prints the install line or the refusal");
        string notify = Src("Coordination", "GovernedNotify.cs");
        _ok(notify.Contains("public static (string? Json, string? Error) ProjectScope(string projectKey)") && notify.Contains("\"/cde/projects/\" + Uri.EscapeDataString(projectKey.Trim()) + \"/scope\""),
            "GovernedNotify reads GET /cde/projects/:key/scope with the bridge's bearer, blocking, off the API thread");
    }
}
