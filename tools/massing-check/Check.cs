#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static EstimatedValue V(double val, double conf = 0.8) => new EstimatedValue { Value = val, Confidence = conf, Source = "photo" };

    static int Main()
    {
        Console.WriteLine("MassingPlanner — C# port conformance (mirrors massing*.test.ts)\n");

        // validator
        var clamped = MassingPlanner.Validate(new MassingEstimate { FootprintWidthMm = V(3, 0.6), FacadesSeen = new List<string>{"front"} });
        Ok(clamped.FootprintWidthMm.Value >= 2000 && clamped.FootprintWidthMm.Source == "assumed", "3mm building clamped to assumed");
        var tall = MassingPlanner.Validate(new MassingEstimate { Storeys = V(900, 0.5), FacadesSeen = new List<string>{"front"} });
        Ok(tall.Storeys.Value <= 200 && tall.Storeys.Source == "assumed", "90-storey house capped");
        var lowc = MassingPlanner.Validate(new MassingEstimate { StoreyHeightMm = V(3000, 0.2), FacadesSeen = new List<string>{"front"} });
        Ok(lowc.StoreyHeightMm.Source == "assumed", "low-confidence in-range field demoted to assumed");
        var empty = MassingPlanner.Validate(new MassingEstimate());
        Ok(empty.Storeys.Source == "assumed" && empty.Provenance == "photo", "empty estimate → all-assumed, no throw");

        // plan
        var m = MassingPlanner.Validate(new MassingEstimate
        {
            FootprintWidthMm = V(12000), FootprintDepthMm = V(8000), Storeys = V(3), StoreyHeightMm = V(3200),
            FacadesSeen = new List<string> { "front" },
            Openings = new List<OpeningEstimate>
            {
                new OpeningEstimate { Kind = "door",   WidthMm = V(1000), HeightMm = V(2100), Facade = "front" },
                new OpeningEstimate { Kind = "window", WidthMm = V(1500), HeightMm = V(1400), Facade = "front" },
            },
        });
        var plan = MassingPlanner.Plan(m);
        Ok(plan.Walls.Count == 12 && plan.Floors.Count == 3, "4 walls/storey × 3 storeys, 3 floors");
        Ok(plan.Walls[0].X1 == -6000 && plan.Walls[0].X2 == 6000, "footprint centred, 12m wide");
        Ok(plan.Walls[4].BaseElevationMm == 3200 && plan.Walls[8].BaseElevationMm == 6400, "storeys stack by height");
        Ok(plan.Walls.All(w => w.ThicknessMm == 200 && w.Layer == "A-WALL-EXT"), "default thickness, external layer");
        Ok(plan.Openings.Count == 2 && plan.Openings.All(o => o.WallIndex == 0), "front openings on the ground front wall");
        Ok(Math.Abs(plan.Openings[0].OffsetMm - 4000) < 1 && Math.Abs(plan.Openings[1].OffsetMm - 8000) < 1, "openings evenly spread (1/3, 2/3)");
        Ok(plan.Openings.First(o => o.Kind == "window").SillMm > 0 && plan.Openings.First(o => o.Kind == "door").SillMm == 0, "window has a sill, door does not");

        // unseen façade not mirrored
        var back = MassingPlanner.Validate(new MassingEstimate
        {
            FootprintWidthMm = V(12000), FootprintDepthMm = V(8000), Storeys = V(1), StoreyHeightMm = V(3000),
            FacadesSeen = new List<string> { "front" },
            Openings = new List<OpeningEstimate> { new OpeningEstimate { Kind = "window", WidthMm = V(1500), HeightMm = V(1400), Facade = "back" } },
        });
        Ok(MassingPlanner.Plan(back).Openings.Count == 0, "an unseen-façade opening is not placed on the front");

        // review list
        var review = MassingPlanner.FieldsNeedingReview(lowc);
        Ok(review.Contains("storey height"), "review list flags the low-confidence field");

        // Final review, MA-1a item 4 (E7): the images are a build's source only while it holds a number the vision model gave.
        bool before = MassingPlanner.HasModelValue(m);
        foreach (var v in new[] { m.FootprintWidthMm, m.FootprintDepthMm, m.Storeys, m.StoreyHeightMm }.Concat(m.Openings.SelectMany(o => new[] { o.WidthMm, o.HeightMm })))
            v.Source = "user"; // the reviewer replaced every number
        Ok(before && !MassingPlanner.HasModelValue(empty) && !MassingPlanner.HasModelValue(MassingPlanner.Validate(m)) && !MassingPlanner.HasModelValue(null)
           && MassingPlanner.StampRule("Walls on 'A-WALL-EXT'", true).EndsWith("from the vision model's estimate as corrected in the review")
           && MassingPlanner.StampRule("Walls on 'A-WALL-EXT'", false).Contains("the numbers the reviewer confirmed") && !MassingPlanner.StampRule("x", false).Contains("estimate"),
           "an estimate the vision model gave nothing for (Ollama down), or one the reviewer replaced, names no images: its stamp's rule says the numbers are the reviewer's");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
