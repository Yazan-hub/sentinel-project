using System;
using System.Linq;
using System.Collections.Generic;
using Sentinel.Engine;
using Sentinel.Coordination;

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

        Console.WriteLine("\nIdsIssueRef — the bridge title, inverted");
        var t = IdsIssueRef.TryParse(IdsIssueRef.TitleOf("Walls carry fire rating", "Pset_WallCommon.FireRating", 12));
        Ok(t != null && t.Spec == "Walls carry fire rating" && t.Pset == "Pset_WallCommon" && t.Prop == "FireRating" && t.Failing == 12 && !t.IsAttribute,
           "round-trips a property requirement");
        var a = IdsIssueRef.TryParse("IDS: All elements have a name — @Name (3 failing)");
        Ok(a != null && a.IsAttribute && a.Prop == "Name" && a.Pset == "", "parses an attribute requirement");
        var d = IdsIssueRef.TryParse("IDS: Fire — safety walls — Pset_WallCommon.FireRating (1 failing)");
        Ok(d != null && d.Spec == "Fire — safety walls" && d.Requirement == "Pset_WallCommon.FireRating", "an em-dash inside the spec name does not confuse the split");
        Ok(IdsIssueRef.TryParse("Clash: wall vs duct") == null && IdsIssueRef.TryParse("IDS: x — nodot (1 failing)") == null && IdsIssueRef.TryParse(null) == null,
           "hand-raised, malformed and null titles → null");

        Console.WriteLine("\nFixPlan.Patch");
        var req = t!;
        var el = new GovElement
        {
            modelId = "p", localId = 5, identity = new GovIdentity { GlobalId = "uid-5", Class = "IFCWALL", Name = "W" },
            psets = { new GovGroup { name = "Pset_WallCommon", rows = { new GovRow { name = "IsExternal", value = "TRUE" } } } },
        };
        var p1 = FixPlan.Patch(el, req, "REI60", "guid-A");
        Ok(p1.identity.GlobalId == "guid-A" && el.identity.GlobalId == "uid-5", "GlobalId becomes the issue GUID; the source is untouched");
        Ok(p1.psets.Single().rows.Count == 2
           && p1.psets.Single().rows.Any(r => r.name == "FireRating" && r.value == "REI60")
           && p1.psets.Single().rows.Any(r => r.name == "IsExternal" && r.value == "TRUE"), "adds the missing row, keeps the others");
        var p2 = FixPlan.Patch(p1, req, "REI120", "guid-A");
        Ok(p2.psets.Single().rows.Count == 2 && p2.psets.Single().rows.Single(r => r.name == "FireRating").value == "REI120", "replaces an existing row in place");
        var p3 = FixPlan.Patch(el, a!, "Wall-01", "guid-B");
        Ok(p3.identity.Name == "Wall-01" && p3.psets.Single().rows.Count == 1, "@Name patches identity, not psets");
        var p4 = FixPlan.Patch(new GovElement(), new IdsIssueRef { Spec = "s", Requirement = "Pset_SlabCommon.LoadBearing" }, "TRUE", "g");
        Ok(p4.psets.Single().name == "Pset_SlabCommon" && p4.psets.Single().rows.Single().value == "TRUE", "creates the pset when absent");
        Ok(FixPlan.NormalizeYesNo("yes") == "TRUE" && FixPlan.NormalizeYesNo(" No ") == "FALSE" && FixPlan.NormalizeYesNo("maybe") == null, "yes/no normalisation");

        Console.WriteLine("\nFixPlan.Fold");
        FixRow Inst(long id, string guid) => new() { Key = "i:" + id, TargetId = id, InstanceIds = { id }, IssueGuids = { guid } };
        var rows = new List<FixRow>
        {
            Inst(1, "g1"), Inst(2, "g2"),
            new FixRow { Key = "t:9", IsType = true, TargetId = 9, InstanceIds = { 3, 4 }, IssueGuids = { "g3", "g4" } },
        };
        var sent = new HashSet<string> { "i:1", "i:2", "t:9" };
        var guids = new[] { "g1", "g2", "g3", "g4" };
        const string R = "Pset_WallCommon.FireRating";
        var f1 = FixPlan.Fold(new[]
        {
            new ElementFailure { Element = "g2", Requirement = R, Reason = "missing" },
            new ElementFailure { Element = "g4", Requirement = R, Reason = "missing" },
            new ElementFailure { Element = "g1", Requirement = "@Name", Reason = "missing" },
        }, rows, sent, guids, R);
        Ok(rows[0].Verdict == FixVerdict.Pass && rows[1].Verdict == FixVerdict.Fail && rows[1].Reason == "missing", "instance rows: pass / fail with the referee's reason");
        Ok(rows[2].Verdict == FixVerdict.Fail && rows[2].Reason!.StartsWith("1 of 2 instance(s) still fail"), "a type row with a mixed outcome FAILS and names the count");
        Ok(!f1.AllPass && f1.Pass == 1 && f1.Fail == 2 && f1.OtherOpen == 1, "AllPass false; other-requirement failures counted, not folded");
        Ok(f1.PassGuids == 2, "PassGuids credits g1 and the passing instance of the mixed type row, not the row");
        var f2 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, sent, guids, R);
        Ok(f2.AllPass && rows.All(r => r.Verdict == FixVerdict.Pass), "no failures on this requirement → all pass");
        var f3 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, sent, new[] { "g1", "g2", "g3", "g4", "g5" }, R);
        Ok(!f3.AllPass && f3.Unresolved.SequenceEqual(new[] { "g5" }), "an issue GUID not in this model blocks AllPass and is named");
        foreach (var r in rows) r.Verdict = FixVerdict.Unchecked;
        var f4 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, new HashSet<string> { "i:1" }, guids, R);
        Ok(rows[0].Verdict == FixVerdict.Pass && rows[1].Verdict == FixVerdict.Unchecked && !f4.AllPass, "unsent rows stay Unchecked and block AllPass");
        var nf = new List<FixRow> { new FixRow { Key = "i:7", TargetId = 7, InstanceIds = { 7 }, IssueGuids = { "g7" }, Verdict = FixVerdict.NotFixable, NotFixableReason = "read-only parameter" } };
        var f5 = FixPlan.Fold(new[] { new ElementFailure { Element = "g7", Requirement = R, Reason = "missing" } }, nf, new HashSet<string> { "i:7" }, new[] { "g7" }, R);
        Ok(nf[0].Verdict == FixVerdict.NotFixable && nf[0].Reason == null && f5.Fail == 1 && !f5.AllPass,
           "a NotFixable row keeps its verdict and reason but its elements still count toward fail");

        Console.WriteLine("\nFixPlan.Conclusive — \"no failure returned\" is only evidence when everything was judged");
        Ok(FixPlan.Conclusive(30, 30, 3, out var w0) && w0 == "", "everything sent judged, short failure list → conclusive");
        Ok(!FixPlan.Conclusive(30, 28, 3, out var w1) && w1.Contains("2 out of scope"), "fewer in scope than sent → not conclusive, names the count");
        Ok(!FixPlan.Conclusive(30, 30, 200, out var w2) && w2.Contains("failure list truncated at 200"), "a failure list at the cap → not conclusive, names the truncation");

        Console.WriteLine("\nProposalResult.Parse — the bridge verdict, every failure kept");
        var many = string.Join(",", Enumerable.Range(0, 30).Select(i =>
            $"{{\"element\":\"g{i}\",\"specification\":\"s\",\"requirement\":\"Pset_WallCommon.FireRating\",\"reason\":\"missing\"}}"));
        var pr = ProposalResult.Parse("{\"verdict\":\"rejected\",\"summary\":{\"in_scope\":30,\"passing\":0,\"failing\":30},\"failures\":[" + many +
                                      "],\"audit_id\":4711,\"receipt\":{\"ledger_hash\":\"abc123\"},\"bcf\":{\"raised\":0,\"skipped\":1}}");
        Ok(pr.Reached && pr.Verdict == "rejected" && pr.InScope == 30 && pr.Failing == 30, "verdict + summary");
        Ok(pr.ElementFailures.Count == 30 && pr.ElementFailures[29].Element == "g29", "ALL element failures kept (not the 12-line dialog cap)");
        Ok(pr.Failures.Count == 12, "dialog list still capped at 12");
        Ok(pr.AuditId == "4711" && pr.ReceiptHash == "abc123", "audit id (numeric) and receipt hash");
        var pr2 = ProposalResult.Parse("{\"verdict\":\"recorded\",\"audit_id\":\"uuid-1\",\"failures\":[{\"element\":42,\"requirement\":\"@Name\",\"reason\":\"x\"}]}");
        Ok(pr2.AuditId == "uuid-1" && pr2.ElementFailures.Single().Element == "42" && pr2.ReceiptHash == null, "string audit id, numeric element, no receipt → null");
        Ok(ProposalResult.Parse("{}").Verdict == "recorded" && ProposalResult.Parse("{}").ElementFailures.Count == 0, "an empty object reads as recorded, nothing certified");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
