#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-5b-1: rooms from a drawing's labels — the overlay's cross, the place's Number, and the executor's room block (source pins) ──
    static void Ma5b1Checks()
    {
        Console.WriteLine("\nMA-5b-1 — rooms from the drawing: overlay, place, executor");
        var room = new ChangesetElementDto { Kind = "room", Op = "create", Place = new PlaceDto { Location = new double[] { 1000, 2000, 0 }, Name = "OFFICE", Number = "101" } };
        Ok(GhostOverlayGeometry.Segments(room, true, false).Count == 3 && GhostOverlayGeometry.Tris(room, true, false).Count == 0,
           "a room is drawn as its point's cross (a door's), with no face");
        var back = JsonSerializer.Deserialize<PlaceDto>("{\"LevelName\":\"L00\",\"Location\":[1,2,0],\"Name\":\"OFFICE\",\"Number\":\"101\"}");
        Ok(back.Number == "101" && back.Name == "OFFICE", "PlaceDto reads a room's Number and Name (the bridge's PLACE_KEPT, name for name)");

        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), win = Src("UI", "ChangesetReviewWindow.cs");
        int At(string what) => ex.IndexOf(what, StringComparison.Ordinal);
        int block = At("var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == \"room\")"), exists = At("doc.GetRoomAtPoint(pt, phase)"), create = At("doc.Create.NewRoom(level, new UV(pt.X, pt.Y))"),
            pair = At("made[i].IsPointInRoom(spots[j].pt)"), area = At("!(made[i].Area > 0)"), retype = At("// MA-0: retype before attach."), furniture = At("foreach (var el in toPlace.Where(e => e.Op == \"reshape\"))");
        Ok(block > furniture && furniture > 0 && exists > block && create > exists && pair > create && area > pair && retype > area,
           "the executor places rooms after every wall and point family: an existing room checked first, then NewRoom, then one area per room, then enclosed — before any retype");
        Ok(ex.Substring(block, retype - block).Split("throw new PlacementRefused(").Length == 8 && ex.Substring(block, retype - block).Contains("room.Name = el.Place.Name;"),
           "its refusals leave the changeset proposed (PlacementRefused: the person changes the ticks) — a room standing there, Revit's own failure or null, another phase, two in one area, not enclosed, an unticked wall through it; the room takes its drawn name");
        int through = At("made[i].IsPointInRoom(new XYZ((a[0] + b[0]) / 2 * MmToFeet");
        Ok(through > area && through < retype && ex.Contains("!tickedGuids.Contains(e.ProposalGuid)") && ex.Contains("string.Equals(w.Place.LevelName, spots[i].el.Place.LevelName"),
           "drill MA5b (F-MA5b-2): after enclosed, an unticked wall of the changeset on the room's level whose midpoint is in the placed room refuses it — walls already standing would close a larger area past it");
        Ok(ex.Contains("level.ProjectElevation + 1.0") && ex.Contains("BuiltInParameter.ROOM_PHASE_ID") && ex.Contains("Placement?.PhaseId != null ? doc.GetElement(Placement.PhaseId) as Phase : null"),
           "review: the probe in the model's internal frame; the room checked in the walls' phase, and refused when Revit puts it in another");
        Ok(win.Contains("if (p?.Name != null && p.Name != name) parts.Add(p.Name);"), "Revit's review row reads room: 101 · OFFICE · its level");
    }
}
