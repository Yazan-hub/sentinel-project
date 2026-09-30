#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string name)
    {
        if (c) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; Console.WriteLine("  FAIL  " + name); }
    }

    static string _root;
    static string Repo(params string[] parts) => Path.Combine(new[] { _root }.Concat(parts).ToArray());

    static int Main()
    {
        Console.WriteLine("MA-0 Promote walls v0 — offline check\n");
        // Found from the SOURCE tree (guideline-check's way): `dotnet run --project` keeps the shell's cwd.
        _root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(_root, "SentinelAddin")); i++)
            _root = Path.GetFullPath(Path.Combine(_root, ".."));
        Console.WriteLine("  repo root: " + _root + "\n");

        var m = RuleFile();
        Planner(m);
        ConceptOnly(m);
        Parity(m);
        StampAndUndo();
        var m2 = DdElementsFile();
        Classes(m2);
        ParityV1(m2);
        Matrix(m, m2);
        PlacementChecks();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. the DD wall rule file, resolved by the production matcher against the real BDS catalogue ─────────────
    static GuidelineMatcher RuleFile()
    {
        Console.WriteLine("Rule file (demo/bds-pilot/bds-dd-walls-guideline.json)");
        var m = GuidelineMatcher.FromBodies(File.ReadAllText(Repo("demo", "bds-pilot", "bds-dd-walls-guideline.json")),
                                            File.ReadAllText(Repo("demo", "bds-pilot", "bds-type-catalog.json")),
                                            out var ge, out var ce);
        m.CatalogLabel = "type_catalog@1 · ma0-bds · 0123456789ab…";
        Ok(m.HasGuideline && ge == null, "the rule file parses as guideline@n" + (ge == null ? "" : " — " + ge));
        Ok(m.HasCatalog && ce == null, "the BDS type catalogue parses" + (ce == null ? "" : " — " + ce));
        var errs = m.ValidateAgainstCatalog();
        Ok(errs.Count == 0, "every family and pattern it names is in the catalogue" + (errs.Count > 0 ? " → " + string.Join(" | ", errs) : ""));

        GuidelineResolution R(string function, double mm) =>
            m.Resolve(new GuidelineInput { Category = "Walls", Params = new Dictionary<string, string> { ["Function"] = function }, ThicknessMm = mm });

        foreach (var n in new[] { 100, 200, 300, 400 })
        {
            var r = R("Exterior", n);
            Ok(r.Type == $"BDS_EXT_ARC_CMU_{n} mm" && r.Source == "rule" && r.Confidence == 1,
               $"Exterior {n} → BDS_EXT_ARC_CMU_{n} mm (rule, confidence 1)");
        }
        var e150 = R("Exterior", 150);
        Ok(e150.Confidence == 0 && e150.Available != null && e150.Available.SequenceEqual(new[]
            { "BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm" }),
           "Exterior 150 → confidence 0, the four CMU sizes listed");
        Ok(R("Interior", 50).Type == "BDS_INT_ARC_GYPS_50 mm" && R("Interior", 50).Confidence == 1, "Interior 50 → BDS_INT_ARC_GYPS_50 mm");
        Ok(R("Interior", 100).Type == "BDS_INT_ARC_GYPS_100 mm" && R("Interior", 100).Confidence == 1, "Interior 100 → BDS_INT_ARC_GYPS_100 mm");
        Ok(R("Interior", 200).Confidence == 0, "Interior 200 → confidence 0 (no GYPS 200 in the catalogue)");
        Ok(R("Foundation", 200).Source == "none", "Foundation → source none (no DD rule, no default)");
        Ok(!(R("Interior", 200).Type ?? "").Contains("EXT") && !(R("Interior", 100).Type ?? "").Contains("EXT"),
           "an Exterior rule never answers an Interior input");
        return m;
    }
}
