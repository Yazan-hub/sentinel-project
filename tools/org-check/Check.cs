using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static bool Same(string[] a, params string[] b) => a.SequenceEqual(b);

    // Same wire options RulesetStore uses.
    static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    static int Main()
    {
        Console.WriteLine("OrgNames — the pilot's names come from data, never from code\n");

        // ── 1. org = "BDS" reproduces every literal the code used to carry ─────────────────────
        const string bds = "BDS";
        Ok(OrgNames.ViewStatus(bds) == "BDS_View Status", "ViewStatus");
        Ok(OrgNames.Discipline(bds) == "BDS_Discipline", "Discipline");
        Ok(OrgNames.VoidId(bds) == "BDS_Void_ID" && OrgNames.VoidStatus(bds) == "BDS_Void_Status", "MEP void tracking parameters");
        Ok(OrgNames.Description(bds) == "BDS_Description", "family gate shared parameter");
        Ok(OrgNames.Pset(bds) == "Pset_BDS", "IDS pset");
        Ok(Same(OrgNames.MainGroupParams(bds), "BDS_View Status", "View_Group", "BDS_Discipline", "View Group"), "ViewGenerator main-group candidates");
        Ok(Same(OrgNames.SubGroupParams(bds), "BDS_View Type", "BDS_Sub-Discipline", "View_SubGroup", "Sub Discipline"), "ViewGenerator sub-group candidates");
        Ok(Same(OrgNames.SubSubGroupParams(bds), "BDS_View Sub Type", "View_Detail_Group"), "ViewGenerator sub-sub-group candidates");
        Ok(Same(OrgNames.DisciplineParams(bds), "BDS_Discipline", "Discipline"), "extractor discipline candidates");
        Ok(Same(OrgNames.UValueParams(bds), "ThermalTransmittance", "U-Value", "Heat Transfer Coefficient (U)", "BDS_UValue"), "extractor U-value candidates");
        Ok(OrgNames.CentralFilePattern(bds) == @"^BDS_[A-Z0-9]{4,10}_[\w \-]+$", "CDE central-file regex text");
        Ok(Regex.IsMatch("BDS_BDS20268_Tower A", OrgNames.CentralFilePattern(bds)) && !Regex.IsMatch("XYZ_BDS20268_Tower A", OrgNames.CentralFilePattern(bds)),
           "CDE regex accepts the pilot's file, rejects another office's");
        Ok(OrgNames.CentralFileHint(bds) == "BDS_[ProjectCode]_[ProjectName]", "CDE message hint");
        Ok(OrgNames.GhostEventName(bds) == "BDS Ghost Builder - Placement", "Ghost Builder external-event name");

        // ── 2. no org: office entries drop out, nothing is invented ────────────────────────────
        Ok(!OrgNames.Configured("") && !OrgNames.Configured("  ") && !OrgNames.Configured(null), "Configured() rejects empty/blank");
        Ok(Same(OrgNames.MainGroupParams(""), "View_Group", "View Group"), "no org → only generic browser candidates remain");
        Ok(Same(OrgNames.DisciplineParams(""), "Discipline"), "no org → only the generic discipline name");
        Ok(OrgNames.GhostEventName("") == "Ghost Builder - Placement", "no org → un-prefixed event name");
        Ok(OrgNames.DocRef(null, "rtg") is null, "DocRef on a missing ruleset is null");

        // ── 3. the shipped ruleset.json, expanded exactly as RulesetStore does ─────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        string json = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Resources", "ruleset.json"));

        var rs = JsonSerializer.Deserialize<Ruleset>(json, JsonOpts)!;
        Ok(rs.Org == "BDS", "shipped ruleset carries org = BDS as data");
        var skipped = OrgNames.Apply(rs);
        Ok(skipped.Count == 0, "with org set, no rule is skipped");
        Ok(OrgNames.DocRef(rs, "rtg") == "BDS-RTG-001" && OrgNames.DocRef(rs, "bep") == "BDS-BEP-001", "doc_refs expand to the pilot's standards");
        Ok(OrgNames.DocRef(rs, "nope") is null, "unknown doc_ref key is null, not invented");
        Rule R(string id) => rs.Rules.First(r => r.Id == id);
        Ok(R("WS-01").MessageEn == "Workset '{name}' is not in the BDS 15-name whitelist." && R("WS-01").DocRef == "BDS-RTG-001 §3.1", "WS-01 message + doc_ref unchanged for the pilot");
        Ok(R("WS-01").MessageAr == "مجموعة العمل '{name}' غير مدرجة في قائمة BDS المعتمدة.", "WS-01 Arabic message unchanged");
        Ok(R("VP-01").ParameterName == "BDS_View Status" && R("VP-01").MessageEn == "View '{name}': 'BDS_View Status' is empty." && R("VP-01").DocRef == "BDS-RTG-001 §4.2", "VP-01 parameter + message unchanged");
        Ok(R("VN-01").DocRef == "BDS-RTG-001 §5" && R("SN-01").DocRef == "BDS-BIM-001 §4.1" && R("FN-01").DocRef == "BDS-RTG-001 §8.1", "VN/SN/FN doc_refs unchanged");
        Ok(R("FN-01").TokenDefs["ORG"] == "BDS" && R("FN-01").MessageEn == "Family '{name}' does not match BDS_[LOCATION]_[TYPE]_[VARIANT].", "FN-01 token def + message unchanged");
        var fn = R("FN-01");
        var fnRx = new Regex("^" + string.Join(Regex.Escape(fn.Separator), fn.Tokens.Select(t => $"(?:{fn.TokenDefs[t]})")) + "$");   // as RuleEngineHost compiles it
        Ok(fnRx.IsMatch("BDS_EXT_ARC_CMU_200 mm") && !fnRx.IsMatch("XYZ_EXT_ARC_CMU_200 mm"), "FN-01 compiled regex still accepts the pilot's family names only");

        // ── 4. regex-special org codes are escaped in token defs, verbatim elsewhere ───────────
        var odd = new Ruleset { Org = "A.B", Rules = { new Rule { Id = "X", TokenDefs = { ["ORG"] = "{org}" }, MessageEn = "{org}_x" } } };
        OrgNames.Apply(odd);
        Ok(odd.Rules[0].TokenDefs["ORG"] == @"A\.B" && odd.Rules[0].MessageEn == "A.B_x", "token def escaped, message verbatim");

        // ── 5. no org: {org}-dependent rules and doc_refs are removed and reported ─────────────
        var bare = JsonSerializer.Deserialize<Ruleset>(json, JsonOpts)!;
        bare.Org = "";
        var dropped = OrgNames.Apply(bare);
        Ok(Same(dropped.OrderBy(x => x).ToArray(), "FN-01", "SN-01", "VN-01", "VP-01", "WS-01"), "no org → every rule that cites the office is skipped and named");
        Ok(Same(bare.Rules.Select(r => r.Id).ToArray(), "LV-01", "GR-01"), "office-free rules survive");
        Ok(bare.DocRefs.Count == 0 && OrgNames.DocRef(bare, "rtg") is null, "no org → no office doc_refs");
        Ok(!bare.Rules.Any(r => r.TokenDefs.Values.Any(OrgNames.Uses) || OrgNames.Uses(r.ParameterName) || OrgNames.Uses(r.MessageEn)), "no unresolved {org} remains");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
