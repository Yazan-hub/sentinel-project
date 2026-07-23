#nullable disable
using System;
using Sentinel.GhostBuilder;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("TypeNameParse — the size a BDS type name encodes\n");
        Ok(TypeNameParse.ThicknessMm("BDS_EXT_ARC_CMU_200 mm") == 200, "wall thickness from name");
        Ok(TypeNameParse.ThicknessMm("BDS_FND_STR_CONC-RAFT_2500 mm") == 2500, "handles a hyphenated material");
        Ok(TypeNameParse.ThicknessMm("Basic Wall") == double.MaxValue, "no thickness → MaxValue (sorts last)");

        Ok(TypeNameParse.TrySection("BDS_INT_STR_CONC_300 X 1500 mm", out var w, out var d) && w == 300 && d == 1500,
           "column W x H from name (300 X 1500)");
        Ok(TypeNameParse.TrySection("BDS_INT_STR_CONC_600 X 600 mm", out var w2, out var d2) && w2 == 600 && d2 == 600,
           "square column (600 X 600)");
        Ok(!TypeNameParse.TrySection("BDS_EXT_ARC_CMU_200 mm", out _, out _),
           "a single-thickness wall name is NOT a W x H section");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
