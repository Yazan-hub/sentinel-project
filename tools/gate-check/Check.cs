using System.Security.Cryptography;
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static string _root = "", _tmp = "";

    static int Main()
    {
        Console.WriteLine("IfcDeliveryGate + DeliveryContract — subtype counts, the contract@n shape, NOT CHECKED, the certificate, Node parity\n");
        _root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(_root, "SentinelAddin")); i++) _root = Path.GetFullPath(Path.Combine(_root, ".."));
        _tmp = Path.Combine(Path.GetTempPath(), "sentinel-gate-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tmp); // the gate writes a certificate beside each IFC: never into the repo
        try
        {
            Counts();
            Contracts();
            Gate();
            Parity();
        }
        finally { try { Directory.Delete(_tmp, true); } catch { } }
        GateLinesCheck.Run(Ok);
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

    static string WithCoverage(string json) => Good.Replace("\"require_georeference\":true", "\"require_georeference\":true,\"min_coverage\":" + json);

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
        Ok(c is { MinCoverage: 1.0 }, "min_coverage is optional: absent is 1 (every element)");
        Ok(DeliveryContract.FromBody(WithCoverage("0.5"), out _) is { MinCoverage: 0.5 }, "min_coverage 0.5 reads as written");
        Ok(DeliveryContract.FromBody(WithCoverage("null"), out _) is { MinCoverage: 1.0 }, "min_coverage null reads as absent, as the bridge validator accepts it");
        Ok(DeliveryContract.FromBody(WithCoverage("0"), out _) is { MinCoverage: 0.0 }, "min_coverage 0 is kept, not defaulted");

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
        foreach (var cov in new[] { "1.5", "-0.1", "\"0.5\"", "true" })
            Refused(WithCoverage(cov), "min_coverage must be a number from 0 to 1", "min_coverage " + cov);
        // One blank set and one int range with the bridge's validateArtefact (artefact-store.test.mjs pins the Node side).
        Refused(Good.Replace("\"gate-check\"", "\"\\u0085\""), "contract_key must be a non-empty string", "a NEL-only contract_key (blank on both sides)");
        Refused(Good.Replace("\"gate-check\"", "\"\\uFEFF\""), "contract_key must be a non-empty string", "a BOM-only contract_key (blank on both sides)");
        Refused(Good.Replace("\"schema_version\":1", "\"schema_version\":2147483648"), "schema_version must be an integer", "a schema_version past int range");

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

    // A small IFC4 file that meets Good: an IFCSITE with no lat/long, a wall, a door, Pset_WallCommon with FireRating on
    // the wall (GATE-E2 judges per class, so the pset is related to it), and (optionally) an IFCMAPCONVERSION — 8
    // entities with it, 7 without.
    static string Ifc(bool mapConversion) => string.Join("\n", new[]
    {
        "ISO-10303-21;", "HEADER;",
        "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
        "FILE_NAME('gate.ifc','2026-09-25T00:00:00',(''),(''),'gate-check','','');",
        "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
        "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,$);",
        "#2=IFCSITE('1YvctVUKr0kugbFTf53O9L',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);",
        "#3=IFCWALL('2YvctVUKr0kugbFTf53O9L',$,'W1',$,$,$,$,$,.STANDARD.);",
        "#4=IFCDOOR('3YvctVUKr0kugbFTf53O9L',$,'D1',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);",
        "#5=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);",
        "#6=IFCPROPERTYSET('4YvctVUKr0kugbFTf53O9L',$,'Pset_WallCommon',$,(#5));",
        Rel,
    }.Concat(mapConversion ? new[] { "#8=IFCMAPCONVERSION(#9,#10,0.,0.,0.,1.,0.,$);" } : Array.Empty<string>())
     .Concat(new[] { "ENDSEC;", "END-ISO-10303-21;" }));

    const string Rel = "#7=IFCRELDEFINESBYPROPERTIES('5YvctVUKr0kugbFTf53O9L',$,$,$,(#3),#6);";
    static string Cov(IfcDeliveryGate.CoverageLine c) => $"{c.Requirement} {c.Entity} {c.Covered}/{c.Total}";

    static string WriteTmp(string name, string text) { var p = Path.Combine(_tmp, name); File.WriteAllText(p, text); return p; }
    static JsonElement Cert(IfcDeliveryGate.GateResult g) => JsonDocument.Parse(File.ReadAllText(g.CertificatePath)).RootElement;

    // ── 4. the gate: PASS / FAIL name what judged; no contract is NOT CHECKED, never a pass ──────────────
    static void Gate()
    {
        var contract = DeliveryContract.FromBody(Good, out _)!;
        var src = Installed(Good);

        var pass = IfcDeliveryGate.Validate(WriteTmp("pass.ifc", Ifc(true)), contract, src);
        Ok(pass.Outcome == GateOutcome.Pass && pass.Passed && pass.Failures.Count == 0 && pass.TotalEntities == 8, "a file that meets contract@1 passes");
        Ok(pass is { ContractLabel: "contract@1 · office · 0123456789ab…", ContractRef: "contract@1", ContractSource: "office", ContractSha256: Sha, NotCheckedReason: null },
           "the result names what judged it");
        var pc = Cert(pass);
        Ok(pc.GetProperty("certificate").GetString() == "PASS" && pc.GetProperty("contract_ref").GetString() == "contract@1"
           && pc.GetProperty("contract_source").GetString() == "office" && pc.GetProperty("contract_sha256").GetString() == Sha
           && pc.GetProperty("contract_label").GetString() == "contract@1 · office · 0123456789ab…"
           && pc.GetProperty("contract_key").GetString() == "gate-check" && pc.GetProperty("entities").GetInt32() == 8
           && pc.GetProperty("sha256").GetString() == pass.FileSha256,
           "the PASS certificate carries contract_ref, contract_source, contract_sha256 and contract_label");

        // ── GATE-E2: coverage per class ──
        Ok(string.Join(" | ", pass.Coverage.Select(Cov)) == "Pset_WallCommon IFCWALL 1/1 | FireRating IFCWALL 1/1"
           && pass.Coverage[0].Kind == "pset" && pass.Coverage[1].Kind == "property",
           "the result records each requirement's coverage per class");
        var pcov = pc.GetProperty("coverage");
        Ok(pcov.GetArrayLength() == 2 && pcov[1].GetProperty("requirement").GetString() == "FireRating" && pcov[1].GetProperty("entity").GetString() == "IFCWALL"
           && pcov[1].GetProperty("covered").GetInt32() == 1 && pcov[1].GetProperty("total").GetInt32() == 1,
           "the certificate carries the coverage");
        var orphan = IfcDeliveryGate.Validate(WriteTmp("orphan.ifc", Ifc(true).Replace(Rel + "\n", "")), contract, src);
        var orphanWant = new[] { "Required property set 'Pset_WallCommon': 0/1 IFCWALL (0%) — below 100%.", "Required property 'FireRating' not found in the file." };
        Ok(orphan.Failures.SequenceEqual(orphanWant),
           "a pset related to no element no longer passes: Pset_WallCommon 0/1 IFCWALL, and a FireRating no class carries is not found");
        if (!orphan.Failures.SequenceEqual(orphanWant)) Console.WriteLine("        got: " + string.Join(" | ", orphan.Failures));
        var line = "#5=IFCPROPERTYSINGLEVALUE('Fire, ''Rating''',$,IFCLABEL('a(b)'),$);";
        Ok(IfcDeliveryGate.StepArgs(line, line.IndexOf('(') + 1).SequenceEqual(new[] { "'Fire, ''Rating'''", "$", "IFCLABEL('a(b)')", "$" }),
           "STEP arguments: a comma or quote inside a string and nested parentheses stay in one argument");
        Ok(IfcDeliveryGate.Valued("IFCLABEL('REI 60')") && IfcDeliveryGate.Valued("IFCBOOLEAN(.F.)") && IfcDeliveryGate.Valued("IFCREAL(0.)")
           && !IfcDeliveryGate.Valued("$") && !IfcDeliveryGate.Valued("IFCLABEL('')") && !IfcDeliveryGate.Valued(""),
           "a NominalValue is a value unless it is $ or empty");
        // The min in a coverage failure is RoundHalfEven, never P0 (net48, Revit 2024, rounds halves away from zero):
        // it must print what net8's P0 and the Node gate print, on every ratio.
        var p0 = new System.Globalization.NumberFormatInfo { PercentPositivePattern = 1 };
        var sweep = Enumerable.Range(0, 10001).Select(i => i / 10000.0).Concat(new[] { 0.125, 0.625, 0.025, 0.015, 0.005 })
            .Where(x => IfcDeliveryGate.RoundHalfEven(x, 100) + "%" != x.ToString("P0", p0)).ToList();
        Ok(sweep.Count == 0 && IfcDeliveryGate.RoundHalfEven(0.125, 100) == 12 && IfcDeliveryGate.RoundHalfEven(0.625, 100) == 62,
           "RoundHalfEven prints what net8's P0 prints over a 0.0001 sweep of 0..1; 0.125 → 12, 0.625 → 62 (net48's P0 says 13, 63)");
        if (sweep.Count > 0) Console.WriteLine("        differs at: " + string.Join(", ", sweep.Take(5)));
        var stray = IfcDeliveryGate.Validate(WriteTmp("stray.ifc", Ifc(true).Replace("'W1'", "'W1'-0\"'")), contract, src);
        Ok(stray.EntityCounts.GetValueOrDefault("IFCDOOR") == 1 && stray.Coverage.Select(Cov).SequenceEqual(pass.Coverage.Select(Cov)),
           "a stray quote in one record never swallows the records after it (a wrapped record joins only up to the next #n=)");

        Ok(pass.Warnings.Count == 0, "an IFCMAPCONVERSION georeferences the file although IFCSITE has no lat/long (the Node gate's rule)");
        var noGeo = IfcDeliveryGate.Validate(WriteTmp("nogeo.ifc", Ifc(false)), contract, src);
        Ok(noGeo.Passed && noGeo.Warnings.SequenceEqual(new[] { "No georeference detected on IFCSITE (RefLatitude/RefLongitude)." }),
           "without it the same file warns — and a warning never fails");

        var ifc2x3 = DeliveryContract.FromBody(Good.Replace("\"IFC4\"", "\"IFC2X3\""), out _)!;
        var fail = IfcDeliveryGate.Validate(WriteTmp("fail.ifc", Ifc(true)), ifc2x3, src);
        Ok(fail.Outcome == GateOutcome.Fail && !fail.Passed && fail.Failures.SequenceEqual(new[] { "Schema mismatch: contract requires IFC2X3, file is IFC4." }),
           "a schema mismatch fails");
        Ok(Cert(fail).GetProperty("certificate").GetString() == "FAIL", "the FAIL certificate says FAIL");

        var none = ArtefactClient.None("contract", "not installed for p-none or its office");
        var path = WriteTmp("none.ifc", Ifc(true));
        var bytes = File.ReadAllBytes(path);
        var nc = IfcDeliveryGate.Validate(path, null, none);
        Ok(nc.Outcome == GateOutcome.NotChecked && !nc.Passed, "no contract → NOT CHECKED, never a pass");
        Ok(nc.NotCheckedReason == "none — not installed for p-none or its office" && nc.ContractLabel == nc.NotCheckedReason && nc.ContractRef is null && nc.ContractSha256 is null,
           "NOT CHECKED names why: the none label");
        Ok(nc.TotalEntities == 0 && nc.EntityCounts.Count == 0 && nc.Failures.Count == 0 && nc.Warnings.Count == 0, "no entity is read, nothing is judged");
        Ok(nc.DetectedSchema == "IFC4" && nc.FileSizeBytes == bytes.Length && nc.FileSha256 == Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
           "the schema, size and sha are still recorded");
        var ncc = Cert(nc);
        Ok(ncc.GetProperty("certificate").GetString() == "NOT_CHECKED"
           && ncc.GetProperty("contract_label").GetString() == "none — not installed for p-none or its office"
           && ncc.GetProperty("not_checked_reason").GetString() == "none — not installed for p-none or its office"
           && ncc.GetProperty("contract_ref").ValueKind == JsonValueKind.Null && ncc.GetProperty("contract_source").ValueKind == JsonValueKind.Null
           && ncc.GetProperty("contract_sha256").ValueKind == JsonValueKind.Null && ncc.GetProperty("contract_key").ValueKind == JsonValueKind.Null
           && ncc.GetProperty("entities").ValueKind == JsonValueKind.Null && ncc.GetProperty("sha256").GetString() == nc.FileSha256,
           "the NOT_CHECKED certificate names the none, no contract and no entity count, and still the file's sha");

        var unusable = DeliveryContract.FromResolved(Installed("{}"));
        var nu = IfcDeliveryGate.Validate(WriteTmp("unusable.ifc", Ifc(true)), unusable.Contract, unusable.Source);
        Ok(nu.Outcome == GateOutcome.NotChecked && nu.NotCheckedReason == "none — contract@1 · office · 0123456789ab… did not parse: contract_key is missing",
           "an installed body the gate cannot use is NOT CHECKED, naming the artefact and the field");

        var missing = IfcDeliveryGate.Validate(Path.Combine(_tmp, "absent.ifc"), contract, src);
        Ok(missing.Outcome == GateOutcome.Fail && missing.Failures.SequenceEqual(new[] { "IFC file not found." }) && missing.CertificatePath.Length == 0,
           "a missing file fails, with no certificate");
        Ok(!new IfcDeliveryGate.GateResult().Passed, "a result nobody judged is not a pass");
    }

    // ── 5. the shared contract-parity fixture: the Node gate's test runs the same cases (Task 2) ──────────
    static void Parity()
    {
        var dir = Path.Combine(_root, "WebApp", "bridge", "fixtures", "contract-parity");
        var casesPath = Path.Combine(dir, "cases.json");
        Ok(File.Exists(casesPath), "the parity fixture exists (WebApp/bridge/fixtures/contract-parity/cases.json)");
        if (!File.Exists(casesPath)) return;
        using var fx = JsonDocument.Parse(File.ReadAllText(casesPath));
        var src = Installed("{}"); // the label only; the contract comes from the case
        int n = 0;
        bool mapConversion = false, schemaMismatch = false;
        int coverageCases = 0;
        foreach (var c in fx.RootElement.EnumerateArray())
        {
            n++;
            var name = c.GetProperty("name").GetString();
            var ifcName = c.GetProperty("ifc").GetString()!;
            var contract = DeliveryContract.FromBody(c.GetProperty("contract").GetRawText(), out var error);
            Ok(contract is not null, $"{name}: the case's contract parses in C#" + (error is null ? "" : " — " + error));
            if (contract is null) continue;
            var copy = Path.Combine(_tmp, $"parity-{n}-{ifcName}");
            File.Copy(Path.Combine(dir, ifcName), copy); // the certificate lands beside the copy, not in the fixture folder
            var g = IfcDeliveryGate.Validate(copy, contract, src);
            var expect = c.GetProperty("expect");
            string want = expect.GetProperty("result").GetString()!;
            int wantFailures = expect.GetProperty("failures").GetInt32();
            string got = g.Outcome switch { GateOutcome.Pass => "pass", GateOutcome.Fail => "fail", _ => "not_checked" };
            Ok(got == want && g.Failures.Count == wantFailures, $"{name}: {want} with {wantFailures} failure(s), as the Node gate");
            if (got != want || g.Failures.Count != wantFailures) Console.WriteLine("        got: " + got + " — " + string.Join(" | ", g.Failures));
            if (expect.TryGetProperty("warnings", out var w)) Ok(g.Warnings.Count == w.GetInt32(), $"{name}: {w.GetInt32()} warning(s), as the Node gate");
            // GATE-E2 cases pin the words and the coverage per class, which contract-parity.test.mjs checks the same way.
            if (c.TryGetProperty("failure_texts", out var ft))
            {
                var wantTexts = ft.EnumerateArray().Select(e => e.GetString()!).ToList();
                Ok(g.Failures.SequenceEqual(wantTexts), $"{name}: the failures word for word, as the Node gate");
                if (!g.Failures.SequenceEqual(wantTexts)) Console.WriteLine("        got: " + string.Join(" | ", g.Failures));
            }
            if (c.TryGetProperty("coverage", out var cv))
            {
                var wantCov = cv.EnumerateArray().Select(e => e.GetString()!).ToList();
                Ok(g.Coverage.Select(Cov).SequenceEqual(wantCov), $"{name}: coverage per class, as the Node gate");
                if (!g.Coverage.Select(Cov).SequenceEqual(wantCov)) Console.WriteLine("        got: " + string.Join(" | ", g.Coverage.Select(Cov)));
                coverageCases++;
            }

            var text = File.ReadAllText(copy);
            if (want == "pass" && contract.RequireGeoreference && text.Contains("IFCMAPCONVERSION("))
            {
                // "IFCMAPCONVERSION-only": without the map conversion the same file must lack a georeference.
                var stripped = string.Join("\n", text.Split('\n').Where(l => !l.Contains("IFCMAPCONVERSION(")));
                var bare = IfcDeliveryGate.Validate(WriteTmp($"parity-{n}-bare.ifc", stripped), contract, src);
                bool alone = g.Warnings.Count == 0 && bare.Warnings.Contains("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");
                Ok(alone, $"{name}: the IFCMAPCONVERSION alone georeferences the file (no warning; stripped of it, the warning)");
                mapConversion |= alone;
            }
            if (want == "fail" && g.Failures.Any(f => f.StartsWith("Schema mismatch:"))) schemaMismatch = true;
        }
        Ok(n >= 3, $"the fixture carries {n} case(s) (at least 3)");
        Ok(mapConversion, "the fixture has an IFCMAPCONVERSION-only georeferenced case under require_georeference");
        Ok(schemaMismatch, "the fixture has a schema-mismatch case that fails");
        Ok(coverageCases >= 14, $"the fixture pins coverage per class in {coverageCases} case(s) (GATE-E2: at least 14)");
    }

    // contract@1 as the bridge hands it over (the harness never calls the bridge).
    static ResolvedArtefact Installed(string body) => new()
    {
        Kind = "contract", Ref = "contract@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel("contract@1", "office", Sha),
    };
}
