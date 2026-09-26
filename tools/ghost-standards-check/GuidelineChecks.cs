using Sentinel.Coordination;
using Sentinel.GhostBuilder;
using Sentinel.Standards;

/// <summary>
/// Cohesion phase 4b-2, Task 3: guideline@n and type_catalog@n in Revit. GuidelineMatcher.FromBodies refuses what the
/// bridge validator refuses (artefact-store.mjs validateArtefact) and reads nothing from the machine; GhostStandards turns
/// a refused body into none naming the artefact and the field; every gap text names the catalogue in force; Build Office
/// System's export installs as type_catalog@n and is never the machine-global catalogue file.
/// </summary>
static class GuidelineChecks
{
    const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // A guideline and a catalogue that pass the bridge validator; each refusal below breaks exactly one thing in one.
    const string Guideline =
        "{\"standard\":\"Test Office Guideline\",\"elements\":[{\"category\":\"Walls\"," +
        "\"rules\":[{\"when\":{\"layer\":\"A-WALL-EXT\"},\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_EXT_{thickness} mm\"}}]," +
        "\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}}]," +
        "\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}],\"viewNaming\":{\"statusPrefixes\":{\"WIP_\":\"01_WIP\"}}}";
    const string Catalog =
        "{\"template\":{\"title\":\"Office_Template\",\"path\":\"C:\\\\t\\\\Office_Template.rte\",\"extracted_at\":\"2026-09-25T06:14:40+02:00\"}," +
        "\"types\":[{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\",\"system\":true,\"width_mm\":200,\"height_mm\":null}," +
        "{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_300 mm\"}],\"view_templates\":[]}";

    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Bodies();
        Guidelines();
        Catalogues();
        Fixtures(root);
        Sources();
        Gaps();
        Export(root);
    }

    static void GuidelineRefused(string body, string want, string name)
    {
        var m = GuidelineMatcher.FromBodies(body, Catalog, out var error, out var catalogError);
        _ok(!m.HasGuideline && m.HasCatalog && error == want && catalogError == null, "guideline: " + name + " → " + want);
        if (m.HasGuideline || error != want) Console.WriteLine("        got: " + (error ?? "a guideline"));
    }

    static void CatalogRefused(string body, string want, string name)
    {
        var m = GuidelineMatcher.FromBodies(Guideline, body, out var guidelineError, out var error);
        _ok(!m.HasCatalog && m.HasGuideline && error == want && guidelineError == null, "type_catalog: " + name + " → " + want);
        if (m.HasCatalog || error != want) Console.WriteLine("        got: " + (error ?? "a catalogue"));
    }

    // ── 1. both bodies read; nothing installed is no guideline and no catalogue, with no error and no file ──────────
    static void Bodies()
    {
        var m = GuidelineMatcher.FromBodies(Guideline, Catalog, out var ge, out var ce);
        _ok(m.HasGuideline && m.HasCatalog && ge == null && ce == null, "a guideline and a catalogue the bridge accepts are read");
        _ok(m.Standard == "Test Office Guideline" && m.TemplateTitle == "Office_Template" && m.Views?.Count == 1,
            "standard, views and the catalogue's template.title read as written");
        var r = m.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 199.6 });
        _ok(r.Type == "OFF_EXT_200 mm" && r.Confidence == 1.0 && r.Available == null, "a type the catalogue has resolves at confidence 1");

        var none = GuidelineMatcher.FromBodies(null, null, out var ng, out var nc);
        _ok(!none.HasGuideline && !none.HasCatalog && ng == null && nc == null && none.Standard == "(no guideline)",
            "nothing installed (null bodies) → no guideline, no catalogue, no error — no file is read instead");
        var uncheck = GuidelineMatcher.FromBodies(Guideline, null, out _, out _)
            .Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(uncheck.Type == "OFF_EXT_250 mm" && uncheck.Confidence == 1.0 && uncheck.Available == null,
            "no catalogue → the guideline's type is unchecked here (placement checks it against the document only)");
    }

    // ── 2. guideline@n refusals: the bridge validator's rules, the message without the kind prefix ─────────────────
    static void Guidelines()
    {
        GuidelineRefused("null", "the body is null", "JSON null");
        GuidelineRefused("[]", "the body must be a JSON object", "an array");
        GuidelineRefused("  ", "the body is empty", "an empty body");
        var broken = GuidelineMatcher.FromBodies("{\"standard\":", null, out var parseError, out _);
        _ok(!broken.HasGuideline && parseError is { Length: > 0 }, "guideline: broken JSON → none with the parser's message");
        GuidelineRefused(Guideline.Replace("\"standard\":\"Test Office Guideline\",", ""), "standard must be a non-empty string", "missing standard");
        GuidelineRefused(Guideline.Replace("\"Test Office Guideline\"", "\"  \""), "standard must be a non-empty string", "a blank standard");
        GuidelineRefused("{\"standard\":\"x\"}", "elements must be a non-empty array", "missing elements");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[]}", "elements must be a non-empty array", "empty elements");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[5]}", "elements[0] must be an object", "an element that is not an object");
        GuidelineRefused(Guideline.Replace("\"category\":\"Walls\"", "\"category\":\"\""), "elements[0].category must be a non-empty string", "a blank category");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\"}]}", "elements[0].rules must be an array", "an element without rules (Resolve dereferences them)");
        GuidelineRefused("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\",\"rules\":[7]}]}", "elements[0].rules[0] must be an object", "a rule that is not an object");
        GuidelineRefused(Guideline.Replace("\"when\":{\"layer\":\"A-WALL-EXT\"},", ""), "elements[0].rules[0].when must be an object", "a rule without when");
        GuidelineRefused(Guideline.Replace("\"use\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_EXT_{thickness} mm\"}", "\"use\":{\"typePattern\":\"OFF_EXT_{thickness} mm\"}"),
            "elements[0].rules[0].use.family must be a non-empty string", "a rule whose use names no family");
        GuidelineRefused(Guideline.Replace("\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}", "\"default\":{}"),
            "elements[0].default.family must be a non-empty string", "a default without a family");
        GuidelineRefused(Guideline.Replace("\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}]", "\"views\":{}"), "views must be an array", "views not an array");
        GuidelineRefused(Guideline.Replace("\"viewNaming\":{\"statusPrefixes\":{\"WIP_\":\"01_WIP\"}}", "\"viewNaming\":[]"), "viewNaming must be an object", "viewNaming not an object");
        var optional = GuidelineMatcher.FromBodies(Guideline.Replace("\"default\":{\"family\":\"Basic Wall\",\"typePattern\":\"OFF_INT_{thickness} mm\"}", "\"default\":null")
            .Replace("\"views\":[{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"namePrefix\":\"FP\"}]", "\"views\":null"), null, out var optionalError, out _);
        _ok(optional.HasGuideline && optionalError == null, "guideline: default and views null read as absent, as the bridge reads them");
        var unreadable = GuidelineMatcher.FromBodies(Guideline.Replace("{\"layer\":\"A-WALL-EXT\"}", "{\"params\":{\"Fire Rating\":60}}"), null, out var readError, out _);
        _ok(!unreadable.HasGuideline && readError is { Length: > 0 },
            "guideline: a when.params value that is not text is none with the reader's message (the bridge does not check it)");
    }

    // ── 3. type_catalog@n refusals ─────────────────────────────────────────────────────────────────────────────────
    static void Catalogues()
    {
        CatalogRefused("null", "the body is null", "JSON null");
        CatalogRefused("[{\"category\":\"Walls\",\"type\":\"x\"}]", "the body must be a JSON object", "a bare types array (the TS reader's shape)");
        CatalogRefused("{\"template\":{\"title\":\"t\"}}", "types must be a non-empty array", "missing types");
        CatalogRefused("{\"types\":[]}", "types must be a non-empty array", "empty types");
        var many = "{\"types\":[" + string.Join(",", Enumerable.Repeat("{\"category\":\"Walls\",\"type\":\"x\"}", 20001)) + "]}";
        CatalogRefused(many, "types must hold at most 20000 entries (has 20001)", "more types than the bridge stores");
        CatalogRefused("{\"types\":[1]}", "types[0] must be an object", "a row that is not an object");
        CatalogRefused(Catalog.Replace("\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\"", "\"category\":\" \",\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_200 mm\""),
            "types[0].category must be a non-empty string", "a blank category");
        CatalogRefused(Catalog.Replace("\"type\":\"OFF_EXT_300 mm\"", "\"name\":\"OFF_EXT_300 mm\""), "types[1].type must be a non-empty string", "a row without a type");
        CatalogRefused(Catalog.Replace("\"family\":\"Basic Wall\",\"type\":\"OFF_EXT_300 mm\"", "\"family\":5,\"type\":\"OFF_EXT_300 mm\""), "types[1].family must be a string", "a family that is not text");
        CatalogRefused(Catalog.Replace("\"system\":true", "\"system\":\"yes\""), "types[0].system must be true or false", "system as text");
        CatalogRefused(Catalog.Replace("\"width_mm\":200", "\"width_mm\":\"200\""), "types[0].width_mm must be a number or null", "width_mm as text");
        CatalogRefused(Catalog.Replace("\"height_mm\":null", "\"height_mm\":[]"), "types[0].height_mm must be a number or null", "height_mm an array");
        CatalogRefused("{\"template\":\"Office_Template\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}",
            "template must be an object {title, path?, extracted_at?}", "template as a string (the harvest's old source shape)");
        CatalogRefused("{\"template\":{},\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", "template.title must be a non-empty string", "a template without a title");
        CatalogRefused("{\"template\":{\"title\":\"t\",\"path\":5},\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", "template.path must be a string", "a template path that is not text");
        CatalogRefused(Catalog.Replace("\"view_templates\":[]", "\"view_templates\":{}"), "view_templates must be an array", "view_templates not an array");
        var old = GuidelineMatcher.FromBodies(null, "{\"source\":\"Office_Template\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}", out _, out var oldError);
        _ok(old.HasCatalog && oldError == null && old.TemplateTitle == null,
            "type_catalog: a harvest's old top-level source is ignored, never read as the template");
    }

    // ── 4. the office fixtures in the repo parse: each installs as guideline@n / type_catalog@n ─────────────────────
    static void Fixtures(string root)
    {
        foreach (var (pattern, isGuideline) in new[] { ("*guideline*.json", true), ("*type-catalog*.json", false) })
            foreach (var dir in new[] { Path.Combine(root, "demo"), Path.Combine(root, "SentinelAddin", "Resources") }.Where(Directory.Exists))
                foreach (var f in Directory.EnumerateFiles(dir, pattern, SearchOption.AllDirectories).OrderBy(x => x, StringComparer.Ordinal))
                {
                    var body = File.ReadAllText(f);
                    string? e;
                    var m = isGuideline ? GuidelineMatcher.FromBodies(body, null, out e, out _) : GuidelineMatcher.FromBodies(null, body, out _, out e);
                    _ok((isGuideline ? m.HasGuideline : m.HasCatalog) && e is null,
                        $"{Path.GetRelativePath(root, f)} parses: it installs as {(isGuideline ? "guideline" : "type_catalog")}@n{(e is null ? "" : " — " + e)}");
                }
    }

    // ── 5. GhostStandards: an installed body comes with its label; a refused body is none naming the field ─────────
    static ResolvedArtefact Installed(string kind, string body) => new()
    {
        Kind = kind, Ref = kind + "@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel(kind + "@1", "office", Sha),
    };

    static void Sources()
    {
        var g = Installed("guideline", Guideline);
        var c = Installed("type_catalog", Catalog);
        var ok = GhostStandards.ParseGuideline(g, c);
        _ok(ok.Matcher is { HasGuideline: true, HasCatalog: true } && ReferenceEquals(ok.Guideline, g) && ReferenceEquals(ok.Catalog, c)
            && ok.Matcher.CatalogLabel == "type_catalog@1 · office · 0123456789ab…",
            "installed guideline@1 and type_catalog@1 → the matcher, both labels kept, the catalogue's label on the matcher");

        var badGuideline = GhostStandards.ParseGuideline(Installed("guideline", "{\"standard\":\"x\",\"elements\":[]}"), c);
        _ok(badGuideline.Matcher is { HasGuideline: false, HasCatalog: true } && badGuideline.Guideline is { Kind: "guideline", Origin: "none", Ref: null }
            && badGuideline.Guideline.Label == "none — guideline@1 · office · 0123456789ab… did not parse: elements must be a non-empty array",
            "a guideline body the matcher cannot use is none, naming the artefact and the field; the catalogue stays");

        var badCatalog = GhostStandards.ParseGuideline(g, Installed("type_catalog", "{\"template\":\"t\",\"types\":[{\"category\":\"Walls\",\"type\":\"x\"}]}"));
        const string badLabel = "none — type_catalog@1 · office · 0123456789ab… did not parse: template must be an object {title, path?, extracted_at?}";
        _ok(badCatalog.Matcher is { HasGuideline: true, HasCatalog: false } && badCatalog.Catalog is { Kind: "type_catalog", Origin: "none" }
            && badCatalog.Catalog.Label == badLabel && badCatalog.Matcher.CatalogLabel == badLabel,
            "a catalogue body the matcher cannot use is none, and the gap text names that none");

        var noneG = ArtefactClient.None("guideline", "not installed for p-none or its office");
        var noneC = ArtefactClient.None("type_catalog", "not installed for p-none or its office");
        var none = GhostStandards.ParseGuideline(noneG, noneC);
        _ok(none.Matcher is { HasGuideline: false, HasCatalog: false } && ReferenceEquals(none.Guideline, noneG) && ReferenceEquals(none.Catalog, noneC)
            && none.Matcher.CatalogLabel == "none — not installed for p-none or its office",
            "none stays none, with the client's reason — no file, no shipped profile");

        var emptyBody = GhostStandards.ParseGuideline(Installed("guideline", null!), noneC);
        _ok(emptyBody.Guideline.Label == "none — guideline@1 · office · 0123456789ab… did not parse: the body is empty",
            "an installed artefact with no body is none (the body is empty), never 'no guideline' unexplained");
    }

    // ── 6. the gap text names the catalogue in force ────────────────────────────────────────────────────────────
    static void Gaps()
    {
        var m = GuidelineMatcher.FromBodies(Guideline, Catalog, out _, out _);
        m.CatalogLabel = "type_catalog@1 · office · 0123456789ab…";
        var gap = m.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(gap.Confidence == 0 && gap.Available != null && gap.Available.SequenceEqual(new[] { "OFF_EXT_200 mm", "OFF_EXT_300 mm" }),
            "a type the catalogue lacks drops to confidence 0 with the catalogue's siblings, smallest first");
        _ok(gap.Why == "\"OFF_EXT_250 mm\" is not in type_catalog@1 · office · 0123456789ab… (template Office_Template). Available: OFF_EXT_200 mm, OFF_EXT_300 mm.",
            "the gap names the catalogue's label and template, not 'this office's template'");
        _ok(m.Gap("OFF_EXT_250 mm", "no sibling type in this document")
            == "gap: OFF_EXT_250 mm — no sibling type in this document (type_catalog: type_catalog@1 · office · 0123456789ab…)",
            "GhostTypeCreator's no-sibling gap reads: gap: <type> — no sibling type in this document (type_catalog: <label>)");
        var lone = GuidelineMatcher.FromBodies(Guideline, Catalog.Replace("OFF_EXT_200 mm", "OTHER_200 mm").Replace("OFF_EXT_300 mm", "OTHER_300 mm"), out _, out _);
        lone.CatalogLabel = "type_catalog@2 · project · 0123456789ab…";
        var noSibling = lone.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 250 });
        _ok(noSibling.Why == "\"OFF_EXT_250 mm\" is not in type_catalog@2 · project · 0123456789ab… (template Office_Template). No comparable type in it — the office standard may need this type added.",
            "no comparable type: the gap still names the catalogue it checked");

        // The provisioners' decision (F43): a type the catalogue names is cloned from a sibling of its catalogue family
        // that this document holds; a name the catalogue lacks, or a catalogue of none, has no sibling — a gap, never a clone.
        _ok(m.CatalogSiblings("Walls", "OFF_EXT_200 mm").SequenceEqual(new[] { "OFF_EXT_300 mm" }),
            "CatalogSiblings: the catalogue's other sizes of the name's stem — what Available lists for a guideline gap");
        _ok(m.CatalogSiblings("Walls", "OFF_EXT_250 mm").SequenceEqual(new[] { "OFF_EXT_200 mm", "OFF_EXT_300 mm" }),
            "CatalogSiblings: a size the catalogue lacks still has its stem's siblings, smallest first (the standard extended by one size)");
        _ok(m.CatalogSiblings("Walls", "off_ext_300 MM").SequenceEqual(new[] { "OFF_EXT_200 mm" }),
            "CatalogSiblings: the name compares case-insensitively; the catalogue's spelling is returned");
        var mates = GuidelineMatcher.FromBodies(Guideline,
            Catalog.Replace("],\"view_templates\"", ",{\"category\":\"Walls\",\"family\":\"Basic Wall\",\"type\":\"OFF_INT_250 mm\"}],\"view_templates\""),
            out _, out var mateError);
        _ok(mateError == null && mates.CatalogSiblings("Walls", "OFF_EXT_200 mm").SequenceEqual(new[] { "OFF_EXT_300 mm" }),
            "CatalogSiblings: another stem of the same Revit family (OFF_INT_250 mm, Basic Wall) is not a sibling — no build-up renamed as another type");
        _ok(m.CatalogSiblings("Walls", "Basic Wall").Count == 0 && m.CatalogSiblings("Walls", "OTHER_250 mm").Count == 0
            && m.CatalogSiblings("Floors", "OFF_EXT_200 mm").Count == 0,
            "CatalogSiblings: a name with no thickness, a stem the catalogue lacks, or another category has no siblings");
        _ok(TypeNameParse.ThicknessPattern("OFF_EXT_200 mm") == "OFF_EXT_{thickness} mm" && TypeNameParse.ThicknessPattern("OFF_EXT_200mm") == "OFF_EXT_{thickness}mm"
            && TypeNameParse.ThicknessPattern("Basic Wall") == null && TypeNameParse.ThicknessPattern(null) == null,
            "ThicknessPattern: the trailing thickness becomes {thickness}; no thickness → null");
        var uncatalogued = GuidelineMatcher.FromBodies(Guideline, null, out _, out _);
        _ok(!uncatalogued.HasCatalog && uncatalogued.CatalogSiblings("Walls", "OFF_EXT_200 mm").Count == 0,
            "CatalogSiblings: type_catalog none names no sibling — nothing to clone");
        var sibs = new[] { "OFF_EXT_200 mm", "OFF_EXT_300 mm" };
        _ok(GuidelineMatcher.NearestSiblingInDocument(sibs, new[] { "OFF_EXT_200 mm", "OFF_EXT_300 mm" }, 280) == "OFF_EXT_300 mm"
            && GuidelineMatcher.NearestSiblingInDocument(sibs, new[] { "off_ext_200 mm", "Generic - 200mm" }, 280) == "OFF_EXT_200 mm",
            "NearestSiblingInDocument: the nearest thickness among the siblings this document holds, case-insensitively");
        _ok(GuidelineMatcher.NearestSiblingInDocument(sibs, new[] { "OFF_EXT_300 mm", "OFF_EXT_200 mm" }, 0) == "OFF_EXT_200 mm",
            "NearestSiblingInDocument: a name with no thickness (0) takes the thinnest sibling as it is");
        _ok(GuidelineMatcher.NearestSiblingInDocument(sibs, new[] { "Generic - 200mm", "Basic Wall" }, 280) == null
            && GuidelineMatcher.NearestSiblingInDocument(new string[0], new[] { "OFF_EXT_200 mm" }, 280) == null
            && GuidelineMatcher.NearestSiblingInDocument(null, null, 280) == null,
            "NearestSiblingInDocument: no sibling in the document, no siblings, or nothing at all → null: the caller's gap, never the first Basic wall");
    }

    // ── 7. Build Office System's export: a type_catalog@n body with template, in exports\, never type-catalog.json ──
    static void Export(string root)
    {
        _ok(TypeCatalogExport.FileName("Office_Template") == "type-catalog-Office_Template.json", "export name: type-catalog-<template>.json");
        _ok(TypeCatalogExport.FileName("Office Project (Template)") == "type-catalog-Office_Project_Template.json", "spaces and brackets become one '_' each run");
        _ok(TypeCatalogExport.FileName("a/b:c*?") == "type-catalog-a_b_c.json" && TypeCatalogExport.FileName("  ") == "type-catalog-untitled.json",
            "path characters never reach the file name; a blank title is 'untitled'");

        string tmp = Path.Combine(Path.GetTempPath(), "ghost-standards-check-" + Guid.NewGuid().ToString("N"));
        try
        {
            var types = new List<TypeSpec>
            {
                new() { Category = "Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200 },
                new() { Category = "Doors", Family = "Single-Flush", Type = "900 x 2100" },
            };
            var views = new List<ViewTemplateSpec> { new() { Name = "01_WIP_PLANS", ViewType = "FloorPlan" } };
            string path = TypeCatalogExport.Write(Path.Combine(tmp, "exports"), "Office Project (Template)",
                                                  new DateTimeOffset(2026, 9, 25, 6, 14, 40, TimeSpan.FromHours(2)), types, views);
            _ok(path == Path.Combine(tmp, "exports", "type-catalog-Office_Project_Template.json") && File.Exists(path),
                "the export is written to <Sentinel>\\exports\\type-catalog-<template>.json");
            _ok(!File.Exists(Path.Combine(tmp, "type-catalog.json")) && !File.Exists(Path.Combine(tmp, "exports", "type-catalog.json")),
                "…and never to the machine-global type-catalog.json");

            string body = File.ReadAllText(path);
            using var d = System.Text.Json.JsonDocument.Parse(body);
            var t = d.RootElement.GetProperty("template");
            _ok(!d.RootElement.TryGetProperty("source", out _) && t.GetProperty("title").GetString() == "Office Project (Template)"
                && !t.TryGetProperty("path", out _) && t.GetProperty("extracted_at").GetString() == "2026-09-25T06:14:40.0000000+02:00",
                "template {title, extracted_at} with no workstation path; no top-level source (the PUT route would lift it off)");
            _ok(d.RootElement.GetProperty("count").GetInt32() == 2 && d.RootElement.GetProperty("types")[0].GetProperty("system").GetBoolean()
                && d.RootElement.GetProperty("types")[0].GetProperty("width_mm").GetDouble() == 200 && d.RootElement.GetProperty("types")[1].GetProperty("width_mm").ValueKind == System.Text.Json.JsonValueKind.Null
                && d.RootElement.GetProperty("view_templates").GetArrayLength() == 1,
                "types keep system, width_mm (null when absent); view_templates travel with them");
            var read = GuidelineMatcher.FromBodies(null, body, out _, out var readError);
            _ok(read.HasCatalog && readError == null && read.TemplateTitle == "Office Project (Template)",
                "the export parses as type_catalog@n — what the bridge will accept on install");

            string msg = TypeCatalogExport.Message(2, "Office Project (Template)", path);
            _ok(msg.Contains("(2 types from Office Project (Template)) → " + path)
                && msg.Contains("node bridge/artefact-import.mjs \"" + path + "\" --project <office> --kind type_catalog"),
                "the dialog names the path and the install command");
        }
        finally { try { Directory.Delete(tmp, true); } catch (IOException) { } }

        var readers = Directory.EnumerateFiles(Path.Combine(root, "SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar) && !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar))
            .Where(f => File.ReadAllText(f).Contains("type-catalog.json")).Select(f => Path.GetRelativePath(root, f)).ToList();
        _ok(readers.Count == 0, "no add-in source names the machine-global type-catalog.json" + (readers.Count == 0 ? "" : " → " + string.Join(", ", readers)));
    }
}
