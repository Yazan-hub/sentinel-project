using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("IfcDeliveryGate — required entities count their IFC subtypes\n");
        var counts = new Dictionary<string, int> { ["IFCWALLSTANDARDCASE"] = 196, ["IFCSLAB"] = 14, ["IFCDOOR"] = 56, ["IFCBUILDINGELEMENTPROXY"] = 224 };
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 196, "IFCWALL counts IFCWALLSTANDARDCASE (Revit IFC2x3 export)");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "ifcwall") == 196, "case-insensitive entity name");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCSLAB") == 14, "an entity with no subtype rows keeps its own count");
        counts["IFCWALL"] = 3;
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 199, "supertype + subtype rows are summed");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCCOLUMN") == 0, "absent entity is 0, not an exception");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCBUILDINGELEMENTPROXY") == 224, "proxies are never folded into a real class");
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
