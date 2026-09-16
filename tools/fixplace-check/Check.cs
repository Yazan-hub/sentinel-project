using System;
using System.Linq;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("PsetMap — one table, office code as data\n");
        var xxx = PsetMap.Entries("XXX");
        var disc = xxx.FirstOrDefault(e => e.Key == "Pset_XXX.Discipline");
        Ok(disc != null && disc.Candidates.Select(c => c.Name).SequenceEqual(new[] { "XXX_Discipline", "Discipline" }),
           "org XXX yields Pset_XXX.Discipline ← XXX_Discipline, Discipline");
        Ok(!PsetMap.Entries("").Any(e => e.Pset.StartsWith("Pset_") && e.Prop == "Discipline"), "empty org yields no office pset entry");
        Ok(PsetMap.Entries("").Count == PsetMap.Entries("XXX").Count - 1, "empty org drops exactly the office entry");
        Ok(PsetMap.Find("XXX", "pset_wallcommon.firerating")?.Candidates.Any(c => c.Kind == ParamKind.BuiltIn && c.Name == "FIRE_RATING") == true,
           "Find is case-insensitive and FireRating falls back to the built-in");
        Ok(PsetMap.Find("XXX", "@Name")?.Candidates.Single().Kind == ParamKind.ElementName, "@Name maps to the element name");
        Ok(PsetMap.Find("XXX", "Pset_WallCommon.IsExternal")?.ValueKind == ValueKind.YesNo, "IsExternal is a yes/no value");
        Ok(PsetMap.Find("XXX", "Pset_WallCommon.IsExternal")?.Candidates.Last().Kind == ParamKind.WallFunction, "IsExternal falls back to the wall Function");
        foreach (var key in new[] { "Pset_WallCommon.IsExternal", "Pset_WallCommon.FireRating", "Pset_DoorCommon.FireRating", "Pset_WindowCommon.ThermalTransmittance" })
            Ok(PsetMap.Find("XXX", key) != null, "extractor requirement present: " + key);
        Ok(PsetMap.Find("XXX", "Pset_WindowCommon.ThermalTransmittance")!.Candidates.Any(c => c.Name == "XXX_UValue"), "office U-value alias derives from org");
        Ok(PsetMap.Find("XXX", "Pset_Nope.Thing") == null, "unknown requirement → null (caller says 'no mapping')");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
