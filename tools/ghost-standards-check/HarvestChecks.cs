using Sentinel.Standards;

/// <summary>MA-2a: the wider harvest's pure half (TypeHarvest), the row shape it writes (TypeSpec with bic and the Function and
/// Material params), and — by source scan — the Revit-bound reads that fill it (GoldenModelExtractor, Compat).</summary>
static class HarvestChecks
{
    static Action<bool, string> _ok = (_, _) => { };

    public static void Run(string root, Action<bool, string> ok)
    {
        _ok = ok;
        Console.WriteLine("\nMA-2a — the wider harvest: Function, Material, BuiltInCategory (TypeHarvest, TypeSpec, GoldenModelExtractor)");
        _ok(TypeHarvest.FunctionName(0) == "Interior" && TypeHarvest.FunctionName(1) == "Exterior" && TypeHarvest.FunctionName(2) == "Foundation"
            && TypeHarvest.FunctionName(3) == "Retaining" && TypeHarvest.FunctionName(4) == "Soffit" && TypeHarvest.FunctionName(5) == "Coreshaft",
            "FunctionName: Revit's six WallFunction values by name, the enum's own spelling — Coreshaft, not CoreShaft (what a rule's `Function: Exterior` matches, and what Promote's Function.ToString() writes)");
        _ok(TypeHarvest.FunctionName(6) == null && TypeHarvest.FunctionName(-1) == null, "…and nothing for a value outside the enum");
        _ok(TypeHarvest.MaterialLabel(new[] { "Stone", "Concrete Masonry Units", "Stone", " ", null }) == "Stone / Concrete Masonry Units",
            "MaterialLabel: distinct names in the order given, joined ' / '; blanks dropped");
        _ok(TypeHarvest.MaterialLabel(new string?[0]) == null && TypeHarvest.MaterialLabel(null) == null, "…and null when there are none: no Material is written");

        // The row shape: bic and category_local travel when set and are left out when not, so a type_catalog@1 reader sees nothing new.
        var rows = new List<TypeSpec>
        {
            new() { Category = "Walls", Bic = "OST_Walls", Family = "Basic Wall", Type = "OFF_EXT_200 mm", IsSystem = true, WidthMm = 200, Params = { ["Function"] = "Exterior", ["Material"] = "Stone / Concrete Masonry Units" } },
            new() { Category = "Walls", Bic = "OST_Walls", CategoryLocal = "Wände", Family = "Basic Wall", Type = "OFF_INT_100 mm", IsSystem = true, WidthMm = 100 },
            new() { Category = "Site Markers", Family = "Marker", Type = "S" }, // a custom category: a positive id, so BicNameOf gives null (review C8)
        };
        string body = TypeCatalogExport.Json("Office_Template", new DateTimeOffset(2026, 10, 3, 9, 0, 0, TimeSpan.FromHours(2)), rows, new List<ViewTemplateSpec>());
        using var d = System.Text.Json.JsonDocument.Parse(body);
        var t0 = d.RootElement.GetProperty("types")[0]; var t1 = d.RootElement.GetProperty("types")[1]; var t2 = d.RootElement.GetProperty("types")[2];
        _ok(t0.GetProperty("bic").GetString() == "OST_Walls" && !t0.TryGetProperty("category_local", out _)
            && t0.GetProperty("params").GetProperty("Function").GetString() == "Exterior" && t0.GetProperty("params").GetProperty("Material").GetString() == "Stone / Concrete Masonry Units",
            "a row carries bic and params.Function / params.Material; category_local is left out when the category is the English key");
        _ok(t1.GetProperty("category").GetString() == "Walls" && t1.GetProperty("category_local").GetString() == "Wände",
            "a row harvested on a non-English Revit: category is the English key its bic names, category_local keeps the display name");
        _ok(!t2.TryGetProperty("bic", out _) && !t2.TryGetProperty("category_local", out _),
            "a custom or imported category (a positive id: BicNameOf gives null; every built-in one, stairs and railings included, has its bic) carries no bic and no category_local — the row reads as before");
        var read = Sentinel.GhostBuilder.GuidelineMatcher.FromBodies(null, body, out _, out var err);
        _ok(read.HasCatalog && err == null && read.CatalogHas("Walls", "Basic Wall", "OFF_INT_100 mm"), "the export parses as type_catalog@n, and the add-in's matcher reads the German row for Walls through its bic");

        // The Revit-bound reads, by source scan (proven live in drill MA2a).
        string Src(params string[] parts) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(parts).ToArray()));
        string harvest = Src("Standards", "GoldenModelExtractor.cs");
        _ok(harvest.Contains("Category = Compat.CategoryKeyOf(cat),") && harvest.Contains("Bic = Compat.BicNameOf(cat),") && harvest.Contains("CategoryLocal = ") && !harvest.Contains("Category = category,"),
            "the harvest writes the category as the English key its BuiltInCategory names, the bic beside it, and the display name only when it differs (BOS-5)");
        _ok(harvest.Contains("t.get_Parameter(BuiltInParameter.FUNCTION_PARAM)") && harvest.Contains("TypeHarvest.FunctionName(fn.AsInteger())") && !harvest.Contains("\"Function\" };"),
            "a type's Function is read as the Integer FUNCTION_PARAM and written by its enum name — never LookupParameter(\"Function\").AsString(), which was null on every row");
        _ok(harvest.Contains("TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, t))") && harvest.Contains("case StorageType.ElementId:"),
            "a type's Material is its Material parameter's element name, else its build-up layers' materials; a parameter is read by its storage type");
        _ok(harvest.Contains("foreach (Category c in eb.Categories) categories.Add(Compat.CategoryKeyOf(c));"),
            "a shared parameter's bound categories are written as English keys too, so a German harvest binds every parameter on an English Revit (BOS-5)");
        string compat = Src("Compat.cs");
        _ok(compat.Contains("public static string CategoryKeyOf(Category category)") && compat.Contains("public static string? BicNameOf(Category category)")
            && compat.Contains("Enum.IsDefined(typeof(BuiltInCategory), bic)") && !compat.Contains("category.BuiltInCategory"),
            "Compat names a category's BuiltInCategory from its id on every Revit version (no 2023+ API), and gives the English key for the ones Sentinel knows");
        _ok(Src("Workflow", "NamingManagerService.cs").Contains("internal static List<string> LayerMaterials(Document doc, ElementType et)"),
            "LayerMaterials is shared with the harvest and Promote, not copied");
    }
}
