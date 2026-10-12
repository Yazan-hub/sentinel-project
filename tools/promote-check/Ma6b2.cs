#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.Engine;

static partial class Check
{
    // ── MA-6-2: verified agent writes — the as-built re-read on the result (AppliedEntry.as_built, .readable) and its wiring ──
    static void Ma6b2Checks()
    {
        Console.WriteLine("\nMA-6-2 — verified agent writes: the as-built re-read and the check before commit for every source");
        var fx = JsonNode.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "as-built-result.json")));
        string org = fx["org"].GetValue<string>();
        var read = fx["applied"].AsArray().Where(a => a["as_built"] != null).ToList();
        // The fixture's entries are what Revit sends: each as_built is a GovElement, written back key for key, and its readable list is
        // PsetMap's for its class (the bridge's "not read" rests on it — risk R4).
        bool Same(JsonNode a)
        {
            var g = JsonSerializer.Deserialize<GovElement>(a["as_built"].ToJsonString());
            var entry = new AppliedEntry { ProposalGuid = "g", RevitElementId = a["revit_element_id"].GetValue<long>(), RevitUniqueId = a["revit_unique_id"].GetValue<string>(),
                                           AsBuilt = g, Readable = PsetMap.Readable(org, g.identity.Class) };
            var sent = JsonNode.Parse(ChangesetClient.ResultBody(new List<AppliedEntry> { entry }, new List<string>(), null, null, null))["applied"][0];
            return JsonNode.DeepEquals(sent["as_built"], a["as_built"]) && JsonNode.DeepEquals(sent["readable"], a["readable"]);
        }
        Ok(read.Count == 3 && read.All(Same),
           "the fixture's as_built entries are GovElement's JSON, sent as they are, and each readable list is PsetMap.Readable for the element's class");
        var wall = PsetMap.Readable("", "IFCWALL");
        Ok(wall.Contains("Pset_WallCommon.FireRating") && wall.Contains("Pset_WallCommon.IsExternal") && !wall.Contains("Pset_WallCommon.LoadBearing")
           && !wall.Contains("Pset_DoorCommon.FireRating") && PsetMap.Readable("BDS", "IFCDOOR").Contains("Pset_BDS.Discipline"),
           "risk R4: a wall's readable keys are the ones Sentinel reads (FireRating, IsExternal — not LoadBearing, no door's): an ids@n requirement outside them is \"not read\" on the bridge, never a failure");
        var plain = new AppliedEntry { ProposalGuid = "g1", RevitElementId = 901, RevitUniqueId = "u1" };
        Ok(ChangesetClient.ResultBody(new List<AppliedEntry> { plain }, new List<string>(), null, null, null).Contains("\"applied\":[{\"proposal_guid\":\"g1\",\"revit_element_id\":901,\"revit_unique_id\":\"u1\"}]"),
           "an entry with no as-built read writes neither key: every other result body stays byte-identical");

        string review = Src("Commands.ReviewChangesets.cs"), place = Src("GhostBuilder", "ChangesetPlacementEvent.cs"), ctx = Src("GhostBuilder", "PromoteContext.cs");
        string ex = Src("GhostBuilder", "ChangesetExecutor.cs");
        string store = File.ReadAllText(Repo("WebApp", "bridge", "changesets-store.mjs"));
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        Ok(review.Contains("var promote = await Task.Run(() => PromoteContext.Fetch(key));") && !review.Contains("fresh[0].Source == \"promote\" ? await Task.Run(() => PromoteContext.Fetch(key))")
           && review.Contains("if (promote != null && result.Applied.Count > 0)") && review.Contains("handler.SetRequest(fresh, new HashSet<string>(ticked), doc, placement, promote);"),
           "D11: the DD IDS context is fetched for every source's Apply (an agent's, a survey's, a drawing's), so the check before commit and the LOD state after run for each (amendment 10: drill row R-1)");
        int asBuilt = At(place, "var asBuilt = PromoteContext.ReadAsBuilt(doc, result.Applied, kindOf);");
        Ok(asBuilt > At(place, "BlockCheck.PlaceAnyway(doc, added, what, before.RulesetRef)") && asBuilt > At(place, "PromoteContext.JudgeApplied(doc, ids, result.Applied, kindOf)")
           && asBuilt < At(place, "group.Assimilate()") && place.Contains("result.Ids = asBuilt == null ? idsLine : idsLine == null ? asBuilt : idsLine + \"\\n\" + asBuilt;")
           && ctx.Contains("var read = GovernedElementExtractor.ExtractByIds(doc, doc.Title, ids, org).ToDictionary(g => g.localId);")
           && ctx.Contains("a.AsBuilt = g; a.Readable = PsetMap.Readable(org, g.identity.Class);")
           && ctx.Contains("foreach (var a in applied) { a.AsBuilt = null; a.Readable = null; }"),
           "Revit re-reads what it applied inside the open group, once nothing can go back (after the DD IDS and the BLOCK check), with the IDS's own reader; a read that fails is said on the note and never stops the Apply");
        string Kinds(string s, string from, char end) { int i = At(s, from); return i < 0 ? "" : string.Concat(s.Substring(i + from.Length, s.IndexOf(end, i + from.Length) - i - from.Length).Where(c => char.IsLetter(c) || c == ',')); }
        string addin = Kinds(ctx, "public static readonly HashSet<string> AsBuiltKinds = new HashSet<string>(StringComparer.Ordinal) {", '}');
        Ok(addin == "wall,floor,roof,ceiling,door,window,column,beam" && addin == Kinds(store, "export const AS_BUILT_KINDS = [", ']'),
           "the kinds Revit re-reads are the kinds the bridge judges (amendment 5) — every other kind is the bridge's out_of_scope");
        int created = At(ex, "var lvl = Level.Create(doc, (el.Place?.BaseElevation ?? 0) * MmToFeet);");
        Ok(created > 0 && ex.Substring(ex.IndexOf('\n', created) + 1).TrimStart().StartsWith("lvl.get_Parameter(BuiltInParameter.LEVEL_IS_BUILDING_STORY)?.Set(1);", StringComparison.Ordinal),
           "a level a changeset creates is a Building Story (DatumBuilder's set), so Stories(doc) and the LOD state count it");
    }
}
