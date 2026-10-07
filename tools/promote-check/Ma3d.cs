#nullable disable
using System.Text.Json;
using System.Text.Json.Nodes;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-3d: a Promote ghost carries its element's IFC GlobalId (the web desk highlights it in the loaded model by it) ──
    static void Ma3dChecks()
    {
        Console.WriteLine("\nMA-3d — a Promote ghost carries its element's IFC GlobalId");
        const string Guid22 = "2O2Fr$t4X7Zf8NOew3FLKI";
        JsonNode Target(string guid, string op)
        {
            var g = op == "set_parameter"
                ? new PromoteGhost { Op = op, Kind = "wall", UniqueId = "T1", IfcGuid = guid, TypeName = "T", Parameter = "Pset_WallCommon.FireRating", To = "FD30", Reason = "r", Label = "type T" }
                : new PromoteGhost { Op = op, UniqueId = "U1", IfcGuid = guid, TypeBefore = "A", TypeName = "B", BaseLevel = "L1", TopLevel = "L2", Reason = "r", Label = "W 1" };
            var plan = new StoreyPlan { Storey = "Level 1" };
            plan.Ghosts.Add(g);
            var body = JsonSerializer.SerializeToNode(PromoteWallsPlanner.Bodies(new List<StoreyPlan> { plan }, "yazan").First(), ChangesetClient.WriteJson);
            return body["elements"][0]["target"];
        }
        foreach (var op in new[] { "retype", "attach", "set_parameter" })
            Ok((string)Target(Guid22, op)["ifc_guid"] == Guid22 && ((JsonObject)Target(null, op)).ContainsKey("ifc_guid") == false,
               $"MA-3d: a {op} body's target carries ifc_guid when the ghost has one, and has no ifc_guid key when it has none");

        string promote = Src("Commands.PromoteWalls.cs"), pp = Src("GhostBuilder", "PromotePlanner.cs"), pw = Src("GhostBuilder", "PromoteWallsPlanner.cs");
        int Count(string s, string what) => (s.Length - s.Replace(what, "").Length) / what.Length;
        Ok(promote.Contains("private static string IfcGuidOf(Document doc, Element e)") && promote.Contains("IfcGuid = IfcGuidOf(doc, w)") && promote.Contains("IfcGuid = IfcGuidOf(doc, e)")
           && Count(pp, "IfcGuid = e.IfcGuid") == 2 && pw.Contains("IfcGuid = w.IfcGuid") && Count(pw, "ifc_guid = g.IfcGuid") == 2,
           "MA-3d wiring: the facts read the GlobalId on the API thread, every ghost copies it, both bodies send it");
    }
}
