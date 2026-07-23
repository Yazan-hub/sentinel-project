#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string name)
    {
        if (c) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; Console.WriteLine("  FAIL  " + name); }
    }

    static int Main()
    {
        Console.WriteLine("GuidelineMatcher — C# port conformance (mirrors guideline-bds.test.ts)\n");

        // The REAL office files, loaded exactly as the add-in loads them.
        // Resolve from the SOURCE tree, not the working directory: `dotnet run --project` keeps the
        // shell's cwd, and a wrong path here silently falls through to the %AppData% copy — which is
        // how the first run "loaded a catalogue" while testing nothing.
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !System.IO.Directory.Exists(System.IO.Path.Combine(root, "SentinelAddin")); i++)
            root = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, ".."));
        Console.WriteLine("  repo root: " + root);
        Console.WriteLine();

        var m = GuidelineMatcher.Load(
            System.IO.Path.Combine(root, "SentinelAddin", "Resources", "bds-guideline.json"),
            System.IO.Path.Combine(root, "demo", "bds-pilot", "bds-type-catalog.json"));

        Ok(m.HasGuideline, $"guideline loaded ({m.Standard})");
        Ok(m.HasCatalog, "type catalogue loaded");

        var errs = m.ValidateAgainstCatalog();
        Ok(errs.Count == 0, "every name the guideline uses exists in the template"
            + (errs.Count > 0 ? " → " + string.Join(" | ", errs.Take(3)) : ""));

        string T(string layer, double? mm = null, string disc = null, Dictionary<string, string> p = null) =>
            m.Resolve(new GuidelineInput { Category = "Walls", Layer = layer, ThicknessMm = mm, Discipline = disc, Params = p }).Type;

        Ok(T("A-WALL-EXT", 200) == "BDS_EXT_ARC_CMU_200 mm", "external architectural 200 → CMU 200");
        Ok(T("A-WALL-EXT", 300) == "BDS_EXT_ARC_CMU_300 mm", "same layer, different measurement → different type");
        Ok(m.Resolve(new GuidelineInput { Category = "Walls", Layer = "S-WALL", ThicknessMm = 250 }).Type
            == "BDS_EXT_STR_CONC_250 mm", "structural wall layer (S-WALL) → concrete");
        Ok(T("A-WALL-EXT", 50, null, new Dictionary<string, string> { ["Material"] = "STONE" })
            == "BDS_EXT_ARC_STONE_50 mm", "spec overrides the material, thickness untouched");
        Ok(T("A-WALL-INT", 100) == "BDS_INT_ARC_GYPS_100 mm", "internal partitions default to gypsum");
        Ok(T("A-WALL-EXT", 199.6) == "BDS_EXT_ARC_CMU_200 mm", "a real DWG measurement (199.6) finds the 200 type");
        Ok(T("A-WALL-EXT") == null, "no measurement → no type (a gap, not a default size)");

        // loose parameter-name matching, as the TS does
        Ok(T("A-WALL-EXT", 50, null, new Dictionary<string, string> { ["material"] = "stone" })
            == "BDS_EXT_ARC_STONE_50 mm", "parameter name/value matching is case-insensitive");

        // the guard: a thickness the office template has no type for
        var gap = m.Resolve(new GuidelineInput { Category = "Walls", Layer = "A-WALL-EXT", ThicknessMm = 275 });
        Ok(gap.Confidence == 0, "a thickness with no matching type drops to confidence 0");
        Ok(gap.Available != null && gap.Available.SequenceEqual(new[]
           { "BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm" }),
           "…and offers the real alternatives, smallest first");
        Ok(gap.Why != null && gap.Why.Contains("not in this office's template"), "…and says why, in the reviewer's words");

        // determinism
        var runs = Enumerable.Range(0, 20).Select(_ => T("A-WALL-EXT", 200)).Distinct().Count();
        Ok(runs == 1, "deterministic — 20 runs, one answer");

        // a missing guideline must degrade, not throw
        var none = GuidelineMatcher.Load("does-not-exist.json", "also-missing.json");
        Ok(!none.HasGuideline && none.Resolve(new GuidelineInput { Category = "Walls" }).Source == "none",
           "a missing/!swapped guideline degrades to 'no guideline' instead of throwing");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
