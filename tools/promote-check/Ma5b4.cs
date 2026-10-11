#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── MA-5b-4 (C13b): reshape — a placed wall moved to a revised drawing's line, kept as it stands when edited by hand since ──
    static void Ma5b4Checks()
    {
        Console.WriteLine("\nMA-5b-4 — reshape: the stale guard, the words, the wiring");
        double[] P(double x, double y) => new[] { x, y, 0.0 };
        Ok(PlacementGeometry.AsPlaced(47850, 0, 47850, 6000, P(47850, 0), P(47850, 6000), 2)
           && PlacementGeometry.AsPlaced(47851.5, 6000, 47850, 0.5, P(47850, 0), P(47850, 6000), 2)
           && PlacementGeometry.AsPlaced(47850, 0, 47850, 6500, P(47850, 0), P(47850, 6000), 2)   // review: a corner join stretched its end
           && !PlacementGeometry.AsPlaced(47853, 0, 47853, 6000, P(47850, 0), P(47850, 6000), 2)
           && !PlacementGeometry.AsPlaced(48350, 0, 48350, 6000, P(47850, 0), P(47850, 6000), 2)
           && !PlacementGeometry.AsPlaced(47850, 4000, 47850, 9000, P(47850, 0), P(47850, 6000), 2),
           "the stale guard: a wall still on its placed line (within 2 mm, either way round, ends free to move along it: Revit's joins) is as placed; one moved off it, or mostly off its extent, was moved by hand");
        var dto = JsonSerializer.Deserialize<ChangesetElementDto>("{\"op\":\"reshape\",\"kind\":\"wall\",\"target\":{\"unique_id\":\"u\",\"placed\":{\"start\":[47850,0,0],\"end\":[47850,6000,0]}}," +
                                                                "\"place\":{\"LocationCurve\":{\"start\":[47950,6000,0],\"end\":[47950,0,0]}}}");
        Ok(dto.Target.Placed.End[1] == 6000 && ChangesetTrust.ReshapeWords(dto) == "the wall placed on (47850, 0) → (47850, 6000): ends move 100 and 100 mm to the revised drawing's line (kept if edited by hand since it was placed)",
           "TargetDto reads target.placed; the row names the wall by its placed line (drill MA5b: two reshapes read alike) and says how far each end moves, pairing the ends the near way round");
        Ok(!ChangesetTrust.PreTick(new ChangesetDto { Source = "sentinel-drawing 0.2.0", Elements = new System.Collections.Generic.List<ChangesetElementDto> { dto } }, dto),
           "a reshape is never pre-ticked");

        string ex = Src("GhostBuilder", "ChangesetExecutor.cs"), rev = Src("Commands.ReviewChangesets.cs"), ev = Src("GhostBuilder", "ChangesetPlacementEvent.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int loop = At(ex, "foreach (var el in toPlace.Where(e => e.Op == \"reshape\"))"), rooms = At(ex, "var rooms = toPlace.Where(e => IsCreate(e) && e.Kind == \"room\")"), retype = At(ex, "foreach (var el in toPlace.Where(e => e.Op == \"retype\"))"),
            furniture = At(ex, "e.Kind is \"column\" or \"furniture\"");
        Ok(loop > furniture && furniture > 0 && rooms > loop && retype > rooms, "the executor reshapes after the walls and openings, BEFORE the rooms (a room sees the walls where they now stand), and before any retype");
        string body = ex.Substring(loop, rooms - loop);
        Ok(body.Split("result.Kept.Add(").Length == 5 && body.Contains("PlacementGeometry.AsPlaced(") && body.Contains("((LocationCurve)w.Location).Curve = Line.CreateBound(")
           && body.Contains("w.Pinned ? \"is pinned\"") && body.Contains("CheckoutStatus.OwnedByOtherUser") && body.Contains("var (s0, s1) = bx * (a1.X - a0.X) + by * (a1.Y - a0.Y) < 0 ? (c.End, c.Start) : (c.Start, c.End);")
           && ex.Contains("if (result.Applied.Count + result.Kept.Count != toPlace.Count)"),
           "…a wall gone, curved or moved since it was placed is KEPT with why (never a failure of the changeset); one as placed takes the new line; the guard counts the kept");
        Ok(ev.Contains("result.Kept.AddRange(res.Kept);") && rev.Contains(".Concat(oneKept).Distinct().ToList();") && rev.Contains("foreach (var (g, why) in res.Kept) (whys ??= new Dictionary<string, string>())[g] = why;")
           && rev.Contains("var kept = result.Kept.Count == 0 ? \"\" :"),
           "…reported as rejected with its reason (the changeset partially applied), the storey's kept gathered");
    }
}
