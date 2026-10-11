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
        int block = At("var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == \"room\")"), exists = At("doc.GetRoomAtPoint(pt)"), create = At("doc.Create.NewRoom(level, new UV(pt.X, pt.Y))"),
            pair = At("made[i].IsPointInRoom(spots[j].pt)"), area = At("!(made[i].Area > 0)"), retype = At("// MA-0: retype before attach."), furniture = At("e.Kind is \"column\" or \"furniture\"");
        Ok(block > furniture && furniture > 0 && exists > block && create > exists && pair > create && area > pair && retype > area,
           "the executor places rooms after every wall and point family: an existing room checked first, then NewRoom, then one area per room, then enclosed — before any retype");
        Ok(ex.Substring(block, retype - block).Split("throw new PlacementRefused(").Length == 4 && ex.Substring(block, retype - block).Contains("room.Name = el.Place.Name;"),
           "its three refusals leave the changeset proposed (PlacementRefused: the person changes the ticks); the room takes its drawn name");
        Ok(win.Contains("if (p?.Name != null && p.Name != name) parts.Add(p.Name);"), "Revit's review row reads room: 101 · OFFICE · its level");
    }
}
