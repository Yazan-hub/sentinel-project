#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Sentinel.GhostBuilder;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static EstimatedValue V(double val, double conf = 0.8) => new EstimatedValue { Value = val, Confidence = conf, Source = "photo" };

    static int Main()
    {
        Console.WriteLine("MassingPlanner — C# port conformance (mirrors massing.test.ts) and the changeset Photo Massing files (MA-6-6)\n");

        // validator
        var clamped = MassingPlanner.Validate(new MassingEstimate { FootprintWidthMm = V(3, 0.6), FacadesSeen = new List<string>{"front"} });
        Ok(clamped.FootprintWidthMm.Value >= 2000 && clamped.FootprintWidthMm.Source == "assumed", "3mm building clamped to assumed");
        var tall = MassingPlanner.Validate(new MassingEstimate { Storeys = V(900, 0.5), FacadesSeen = new List<string>{"front"} });
        Ok(tall.Storeys.Value <= 200 && tall.Storeys.Source == "assumed", "90-storey house capped");
        var lowc = MassingPlanner.Validate(new MassingEstimate { StoreyHeightMm = V(3000, 0.2), FacadesSeen = new List<string>{"front"} });
        Ok(lowc.StoreyHeightMm.Source == "assumed", "low-confidence in-range field demoted to assumed");
        var empty = MassingPlanner.Validate(new MassingEstimate());
        Ok(empty.Storeys.Source == "assumed" && empty.Provenance == "photo", "empty estimate → all-assumed, no throw");

        // MA-6-6 (MAS-2 + MAS-1): the changeset — the missing Building Story levels and one mass, as the bridge reads it.
        var m = MassingPlanner.Validate(new MassingEstimate
        {
            FootprintWidthMm = V(12000), FootprintDepthMm = V(8000, 0.2), Storeys = V(3), StoreyHeightMm = V(3200),
            FacadesSeen = new List<string> { "front" },
            Openings = new List<OpeningEstimate>
            {
                new OpeningEstimate { Kind = "door",   WidthMm = V(1000), HeightMm = V(2100), Facade = "front" },
                new OpeningEstimate { Kind = "window", WidthMm = V(1500), HeightMm = V(1400), Facade = "front" },
                new OpeningEstimate { Kind = "window", WidthMm = V(1500), HeightMm = V(1400), Facade = "back" },
            },
        });
        JsonElement Body(IReadOnlyList<(string, double, bool)> lv, MassingEstimate e = null) =>
            JsonDocument.Parse(JsonSerializer.Serialize(MassingPlanner.Changeset(e ?? m, lv, "a@example.test").Body)).RootElement;
        string NameOf(JsonElement x) => x.GetProperty("validate").GetProperty("identity").GetProperty("Name").GetString();
        List<JsonElement> Levels(JsonElement body) => body.GetProperty("elements").EnumerateArray().Where(x => x.GetProperty("kind").GetString() == "level").ToList();
        var body = Body(new List<(string, double, bool)> { ("Level 0", 0, true), ("Level 1", 3201.9, true), ("Massing L02", 9000, false) });
        var els = body.GetProperty("elements").EnumerateArray().ToList();
        var made = Levels(body);
        Ok(made.Select(NameOf).SequenceEqual(new[] { "Massing L02 (2)", "Massing L03" })
           && made.Select(x => x.GetProperty("place").GetProperty("BaseElevation").GetDouble()).SequenceEqual(new[] { 6400.0, 9600.0 })
           && made.All(x => x.GetProperty("op").GetString() == "create" && x.GetProperty("validate").GetProperty("identity").GetProperty("Class").GetString() == "IFCBUILDINGSTOREY"),
           "3 storeys of 3200 over Building Stories at 0 and 3201.9 (within 2 mm): both reused; L02 and L03 created — L02 as \"Massing L02 (2)\", a level of that name being there");
        Ok(Levels(Body(new List<(string, double, bool)> { ("Level 0", 0, true), ("Level 1", 3202.1, true) })).Count == 3
           && Levels(Body(new List<(string, double, bool)> { ("Level 0", 0, true), ("Ref 1", 3200, false) })).Count == 3,
           "a level 2.1 mm off, or one that is not a Building Story, is not reused: its storey's level is created");
        Ok(Levels(Body(new List<(string, double, bool)>())).Select(NameOf).SequenceEqual(new[] { "Massing L00", "Massing L01", "Massing L02", "Massing L03" })
           && NameOf(Levels(Body(new List<(string, double, bool)> { ("massing l01", 50, false), ("Massing L01 (2)", 60, false) }))[1]) == "Massing L01 (3)",
           "no levels: L00 to L03 are created; a name taken in another case, and its \" (2)\", give \" (3)\" (a duplicate name would fail the changeset, D16)");
        var mass = els.Last();
        var b = mass.GetProperty("place").GetProperty("Boundary").EnumerateArray().Select(q => q.EnumerateArray().Select(v => v.GetDouble()).ToArray()).ToList();
        Ok(mass.GetProperty("kind").GetString() == "mass" && els.Count(x => x.GetProperty("kind").GetString() == "mass") == 1
           && b.Count == 4 && b[0].SequenceEqual(new[] { -6000.0, -4000 }) && b[2].SequenceEqual(new[] { 6000.0, 4000 })
           && mass.GetProperty("place").GetProperty("BaseElevation").GetDouble() == 0 && mass.GetProperty("place").GetProperty("TopElevation").GetDouble() == 9600
           && !mass.GetProperty("place").TryGetProperty("LevelName", out _) && !mass.GetProperty("place").TryGetProperty("TypeName", out _)
           && mass.GetProperty("validate").GetProperty("identity").GetProperty("Class").GetString() == "IFCBUILDINGELEMENTPROXY",
           "one mass: the 12000 x 8000 footprint centred on 0,0 from 0 to 9600 (the Level.Elevation frame), no level, no type, IFCBUILDINGELEMENTPROXY");
        Ok(mass.GetProperty("reason").GetString() == "Photo Massing: 12.0 × 8.0 m, 3 storeys of 3200 mm — width photo, depth assumed, storeys photo, storey height photo"
           && body.GetProperty("name").GetString() == "Photo Massing · 3 storeys · 12.0 × 8.0 m" && body.GetProperty("source").GetString() == "photo"
           && body.GetProperty("actor").GetString() == "a@example.test" && !els.Any(x => x.TryGetProperty("pretick", out _)),
           "the body: its name, source photo, the actor, the mass's reason naming where each number came from — and no pretick sent (a create never is)");
        Ok(els.Count == 3 && !els.Any(x => x.GetProperty("kind").GetString() is "door" or "window" or "opening" or "wall" or "floor")
           && MassingPlanner.OpeningsSeen(m) == "1 door(s), 2 window(s) — not placed (D12)" && MassingPlanner.OpeningsSeen(null) == "0 door(s), 0 window(s) — not placed (D12)",
           "the openings the photos showed are counted for the receipt, never filed (D12); no wall, floor or opening is filed");
        var huge = MassingPlanner.Validate(new MassingEstimate { FootprintWidthMm = V(20000), FootprintDepthMm = V(20000), Storeys = V(200), StoreyHeightMm = V(3000), FacadesSeen = new List<string> { "front" } });
        var (none, why) = MassingPlanner.Changeset(huge, new List<(string, double, bool)>(), "a");
        var (fits, fitsWhy) = MassingPlanner.Changeset(huge, Enumerable.Range(0, 2).Select(i => ($"L{i}", i * 3000.0, true)).ToList(), "a");
        Ok(none == null && why == "201 levels and a mass are 202 elements — a changeset holds 200 elements: lower the storey count, or file the levels with Datum"
           && fits != null && fitsWhy == null,
           "200 storeys with no levels are refused in words (201 levels and the mass); with two of the levels there, 199 + 1 = 200 is filed");

        // review list
        var review = MassingPlanner.FieldsNeedingReview(lowc);
        Ok(review.Contains("storey height"), "review list flags the low-confidence field");

        // Final review, MA-1a item 4 (E7): the images are a build's source only while it holds a number the vision model gave.
        bool before = MassingPlanner.HasModelValue(m);
        foreach (var v in new[] { m.FootprintWidthMm, m.FootprintDepthMm, m.Storeys, m.StoreyHeightMm }.Concat(m.Openings.SelectMany(o => new[] { o.WidthMm, o.HeightMm })))
            v.Source = "user"; // the reviewer replaced every number
        Ok(before && !MassingPlanner.HasModelValue(empty) && !MassingPlanner.HasModelValue(MassingPlanner.Validate(m)) && !MassingPlanner.HasModelValue(null),
           "an estimate the vision model gave nothing for (Ollama down), or one the reviewer replaced, names no images (MA-6-6: the receipt's images_sha256 is null then)");

        // MAS-4, MA-6-6: the review's words when nothing was filed.
        Ok(MassingPlanner.ReopenStatus == "Nothing was filed — the reason is in the message just shown. Your numbers are kept: put it right, then File for review again."
           && MassingPlanner.NotStarted("no plan") == "The filing did not start (no plan). Your numbers are kept: put it right, then File for review again.",
           "MAS-4 (MA-6-6): a filing that did not start, or that the bridge did not take, keeps the numbers and says to file again");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
