using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static string _root = "";

    static int Main()
    {
        Console.WriteLine("IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, and what a none reads\n");
        _root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(_root, "SentinelAddin")); i++) _root = Path.GetFullPath(Path.Combine(_root, ".."));
        Counts();
        Contracts();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. required entities count their IFC subtypes ────────────────────────────────────────────────────
    static void Counts()
    {
        var counts = new Dictionary<string, int> { ["IFCWALLSTANDARDCASE"] = 196, ["IFCSLAB"] = 14, ["IFCDOOR"] = 56, ["IFCBUILDINGELEMENTPROXY"] = 224 };
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 196, "IFCWALL counts IFCWALLSTANDARDCASE (Revit IFC2x3 export)");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "ifcwall") == 196, "case-insensitive entity name");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCSLAB") == 14, "an entity with no subtype rows keeps its own count");
        counts["IFCWALL"] = 3;
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCWALL") == 199, "supertype + subtype rows are summed");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCCOLUMN") == 0, "absent entity is 0, not an exception");
        Ok(IfcDeliveryGate.CountWithSubtypes(counts, "IFCBUILDINGELEMENTPROXY") == 224, "proxies are never folded into a real class");
    }

    // A complete contract body; each refusal below breaks exactly one thing in it.
    const string Good = "{\"schema_version\":1,\"contract_key\":\"gate-check\",\"ifc_schema\":\"IFC4\"," +
        "\"required_entities\":[{\"entity\":\"IFCWALL\",\"min_count\":1},{\"entity\":\"IFCDOOR\",\"min_count\":0}]," +
        "\"required_psets\":[\"Pset_WallCommon\"],\"required_properties\":[\"FireRating\"]," +
        "\"forbidden_entities\":[{\"entity\":\"IFCBUILDINGELEMENTPROXY\",\"max_count\":0,\"max_ratio\":0.2}]," +
        "\"require_georeference\":true}";
    const string Sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    static void Refused(string body, string want, string name)
    {
        var c = DeliveryContract.FromBody(body, out var error);
        Ok(c is null && error == want, name + " → " + want);
        if (c is not null || error != want) Console.WriteLine("        got: " + (c is null ? error : "a contract"));
    }

    // ── 2. FromBody: every field required, by the bridge validator's rules; a refusal names the field ─────
    static void Contracts()
    {
        var c = DeliveryContract.FromBody(Good, out var error);
        Ok(c is not null && error is null, "a complete body parses");
        Ok(c is { ContractKey: "gate-check", IfcSchema: "IFC4", RequireGeoreference: true, SchemaVersion: 1 }, "scalars read as written");
        Ok(c is not null && c.RequiredEntities.Count == 2 && c.RequiredEntities[0] is { Entity: "IFCWALL", MinCount: 1 } && c.RequiredEntities[1] is { Entity: "IFCDOOR", MinCount: 0 },
           "required_entities read in order, min_count 0 kept");
        Ok(c is not null && c.RequiredPsets.SequenceEqual(new[] { "Pset_WallCommon" }) && c.RequiredProperties.SequenceEqual(new[] { "FireRating" }), "psets and properties read");
        Ok(c is not null && c.ForbiddenEntities.Count == 1 && c.ForbiddenEntities[0] is { Entity: "IFCBUILDINGELEMENTPROXY", MaxCount: 0, MaxRatio: 0.2 },
           "forbidden_entities read (max_count 0 kept, not defaulted)");

        var seed = DeliveryContract.FromBody(File.ReadAllText(Path.Combine(_root, "config", "base-standard", "delivery-contract.json")), out var seedError);
        Ok(seed is { IfcSchema: "IFC2X3", RequireGeoreference: false } && seed.ForbiddenEntities[0].MaxCount == int.MaxValue && seedError is null,
           "the seed config/base-standard/delivery-contract.json parses (max_count 2147483647)");
        foreach (var f in Directory.EnumerateFiles(Path.Combine(_root, "demo"), "delivery-contract.json", SearchOption.AllDirectories))
            Ok(DeliveryContract.FromBody(File.ReadAllText(f), out var e) is not null, $"{Path.GetRelativePath(_root, f)} parses: it installs as contract@n{(e is null ? "" : " — " + e)}");

        Ok(DeliveryContract.FromBody(Good.Replace("\"schema_version\":1,", ""), out _) is { SchemaVersion: null }, "schema_version is the one optional field");
        Ok(DeliveryContract.FromBody(Good.Replace("\"schema_version\":1", "\"schema_version\":null"), out _) is { SchemaVersion: null }, "schema_version null reads as absent, as the bridge validator accepts it");
        var whole = DeliveryContract.FromBody(Good.Replace("\"min_count\":1}", "\"min_count\":1.0}"), out _);
        Ok(whole is not null && whole.RequiredEntities[0].MinCount == 1, "1.0 is the integer 1, as the bridge reads it (Number.isInteger)");
        Ok(DeliveryContract.FromBody(Good.Replace("\"require_georeference\":true", "\"require_georeference\":true,\"notes\":\"x\""), out _) is not null, "an unknown field is ignored");

        // not a contract at all
        Refused("null", "the body is null", "JSON null");
        Refused("[]", "the body must be a JSON object", "an array");
        Refused("\"IFC4\"", "the body must be a JSON object", "a string");
        Refused("  ", "the body is empty", "an empty body");
        Ok(DeliveryContract.FromBody("{\"contract_key\":", out var jsonError) is null && jsonError is { Length: > 0 }, "broken JSON → none with the parser's message");

        // a missing field is never filled
        foreach (var f in new[] { "contract_key", "ifc_schema", "required_entities", "required_psets", "required_properties", "forbidden_entities", "require_georeference" })
        {
            using var d = System.Text.Json.JsonDocument.Parse(Good);
            var without = "{" + string.Join(",", d.RootElement.EnumerateObject().Where(p => p.Name != f).Select(p => $"\"{p.Name}\":{p.Value.GetRawText()}")) + "}";
            Refused(without, f + " is missing", "missing " + f);
        }
        Refused(Good.Replace("{\"entity\":\"IFCWALL\",\"min_count\":1}", "{\"entity\":\"IFCWALL\"}"), "required_entities[0].min_count is missing", "missing min_count");
        Refused(Good.Replace("\"max_count\":0,", ""), "forbidden_entities[0].max_count is missing", "missing max_count");
        Refused(Good.Replace(",\"max_ratio\":0.2", ""), "forbidden_entities[0].max_ratio is missing", "missing max_ratio");

        // a field of the wrong shape
        Refused(Good.Replace("\"gate-check\"", "\"  \""), "contract_key must be a non-empty string", "a blank contract_key");
        Refused(Good.Replace("\"IFC4\"", "\"IFC4X3\""), "ifc_schema must be IFC2X3 | IFC4", "a schema the exporter cannot produce");
        Refused(Good.Replace("\"IFC4\"", "\"ifc4\""), "ifc_schema must be IFC2X3 | IFC4", "a lower-case schema (the bridge is case-sensitive)");
        Refused(Good.Replace("\"IFC4\"", "\"\""), "ifc_schema must be IFC2X3 | IFC4", "an empty schema (it used to skip the check)");
        Refused(Good.Replace("\"IFCWALL\"", "\"IfcWall\""), "required_entities[0].entity must match ^IFC[A-Z0-9_]+$", "a mixed-case entity");
        Refused(Good.Replace("\"IFCWALL\"", "\"IFCWALL\\n\""), "required_entities[0].entity must match ^IFC[A-Z0-9_]+$", "an entity with a trailing newline");
        Refused(Good.Replace("\"IFCBUILDINGELEMENTPROXY\"", "\"PROXY\""), "forbidden_entities[0].entity must match ^IFC[A-Z0-9_]+$", "a forbidden entity without the IFC prefix");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":-1}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a negative min_count");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":1.5}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a fractional min_count");
        Refused(Good.Replace("\"min_count\":1}", "\"min_count\":\"1\"}"), "required_entities[0].min_count must be an integer from 0 to 2147483647", "a min_count as text");
        Refused(Good.Replace("\"max_count\":0", "\"max_count\":2147483648"), "forbidden_entities[0].max_count must be an integer from 0 to 2147483647", "a max_count past int range");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":1.5"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio above 1");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":-0.1"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio below 0");
        Refused(Good.Replace("\"max_ratio\":0.2", "\"max_ratio\":null"), "forbidden_entities[0].max_ratio must be a number from 0 to 1", "max_ratio null");
        Refused(Good.Replace("[{\"entity\":\"IFCWALL\",\"min_count\":1},", "[\"IFCWALL\","), "required_entities[0] must be an object", "a required entity that is not an object");
        Refused(Good.Replace("[\"Pset_WallCommon\"]", "[\"\"]"), "required_psets[0] must be a non-empty string", "an empty pset name");
        Refused(Good.Replace("[\"FireRating\"]", "\"FireRating\""), "required_properties must be an array", "required_properties not an array");
        Refused(Good.Replace("\"require_georeference\":true", "\"require_georeference\":\"true\""), "require_georeference must be true or false", "require_georeference as text");
        Refused(Good.Replace("\"schema_version\":1", "\"schema_version\":1.5"), "schema_version must be an integer", "a fractional schema_version");

        // ── 3. what Load hands the gate: a contract with its source, or none with the reason ──────────────
        var ok = DeliveryContract.FromResolved(Installed(Good));
        Ok(ok.Contract is { IfcSchema: "IFC4" } && ok.Source.Label == "contract@1 · office · 0123456789ab…", "an installed contract comes with its label");
        var bad = DeliveryContract.FromResolved(Installed(Good.Replace("\"IFC4\"", "\"IFC5\"")));
        Ok(bad.Contract is null && bad.Source is { Kind: "contract", Origin: "none", Ref: null }
           && bad.Source.Label == "none — contract@1 · office · 0123456789ab… did not parse: ifc_schema must be IFC2X3 | IFC4",
           "a body the gate cannot use is none, naming the artefact and the field");
        var none = ArtefactClient.None("contract", "not installed for p-none or its office");
        var notInstalled = DeliveryContract.FromResolved(none);
        Ok(notInstalled.Contract is null && ReferenceEquals(notInstalled.Source, none) && none.Label == "none — not installed for p-none or its office",
           "none stays none, with the client's reason (ArtefactClient.None is public)");
        var unbound = DeliveryContract.Load("");
        Ok(unbound.Contract is null && unbound.Source.Label == "none — not bound — Sentinel ▸ Project Setup", "an unbound document asks nothing and reads not bound");
    }

    // contract@1 as the bridge hands it over (the harness never calls the bridge).
    static ResolvedArtefact Installed(string body) => new()
    {
        Kind = "contract", Ref = "contract@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel("contract@1", "office", Sha),
    };
}
