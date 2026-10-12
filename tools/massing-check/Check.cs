#nullable disable
using System;
using System.Collections.Generic;
using System.IO;
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
        Ok(Levels(Body(new List<(string, double, bool)> { ("Level 0", 0, true), ("Ref 1", 3200, false), ("Ref 2", 4000, false) })).Count == 3,
           "a level that is not a Building Story is not reused (its storey's level is created) and is no storey of the shell: one between storeys is let be");
        // MA-6-6 review fix (MAS-1): a Building Story between two of the photo's storeys would be cut by the shell — refused in words.
        const string Cut = " inside the massing (0 to 9600 mm) — Shell a Mass cuts a storey at every Building Story level: set the storey height to match ";
        Ok(MassingPlanner.Changeset(m, new List<(string, double, bool)> { ("Level 1", 0, true), ("Level 2", 4000, true) }, "a")
              == (null, "Level 2 at 4000 mm is a Building Story" + Cut + "it, or clear its Building Story (Promote then holds what stands on it — it plans storey by storey)")
           && MassingPlanner.Changeset(m, new List<(string, double, bool)> { ("Level 0", 0, true), ("Level 1", 3202.1, true), ("Level 9", 9000, true), ("Top", 9600, true), ("Roof", 12000, true) }, "a")
              == (null, "Level 1 at 3202.1 mm, Level 9 at 9000 mm are Building Stories" + Cut + "them, or clear their Building Story (Promote then holds what stands on them — it plans storey by storey)"),
           "Revit's template (Level 1 at 0, Level 2 at 4000) under 3 storeys of 3200 is refused, naming Level 2 — the shell would cut an 800 mm storey; a story 2.1 mm off is named too, one at the top or above is not");
        var all = Levels(Body(new List<(string, double, bool)>()));
        Ok(all[0].GetProperty("reason").GetString() == "Photo Massing: the floor of storey 1 of 3 at 0 mm — no Building Story level there"
           && all[3].GetProperty("reason").GetString() == "Photo Massing: the top of the mass at 9600 mm — no Building Story level there",
           "each created level says its role: the floor of storey i+1 of n, or the top of the mass (review fix: no storey 0)");
        Ok(all.Select(NameOf).SequenceEqual(new[] { "Massing L00", "Massing L01", "Massing L02", "Massing L03" })
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
        Ok(mass.GetProperty("reason").GetString() == "Photo Massing: 12.0 × 8.0 m, 3 storeys of 3200 mm — width observed, depth assumed, storeys observed, storey height observed"
           && body.GetProperty("name").GetString() == "Photo Massing · 3 storeys · 12.0 × 8.0 m" && body.GetProperty("source").GetString() == "photo"
           && body.GetProperty("actor").GetString() == "a@example.test" && !els.Any(x => x.TryGetProperty("pretick", out _)),
           "the body: its name, source photo, the actor, the mass's reason naming where each number came from — and no pretick sent (a create never is)");
        Ok(els.Count == 3 && !els.Any(x => x.GetProperty("kind").GetString() is "door" or "window" or "opening" or "wall" or "floor")
           && MassingPlanner.OpeningsSeen(m) == "1 door(s), 2 window(s) — not placed (D12)" && MassingPlanner.OpeningsSeen(null) == "not read — v2 reads storeys, bays and proportions (C14)",
           "openings an estimate holds are counted for the receipt, never filed (D12); one that holds none says not read (v2); no wall, floor or opening is filed");
        var huge = MassingPlanner.Validate(new MassingEstimate { FootprintWidthMm = V(20000), FootprintDepthMm = V(20000), Storeys = V(200), StoreyHeightMm = V(3000), FacadesSeen = new List<string> { "front" } });
        var (none, why) = MassingPlanner.Changeset(huge, new List<(string, double, bool)>(), "a");
        var (fits, fitsWhy) = MassingPlanner.Changeset(huge, Enumerable.Range(0, 2).Select(i => ($"L{i}", i * 3000.0, true)).ToList(), "a");
        Ok(none == null && why == "201 levels and a mass are 202 elements — a changeset holds 200 elements: lower the storey count, or file the levels with Datum"
           && fits != null && fitsWhy == null,
           "200 storeys with no levels are refused in words (201 levels and the mass); with two of the levels there, 199 + 1 = 200 is filed");
        // MA-6-6 review fix: the bridge's mass height cap (MAX_MASS_MM, 1000000 mm), said by the planner before anything is filed.
        MassingEstimate Tower(int storeys) => MassingPlanner.Validate(new MassingEstimate { FootprintWidthMm = V(20000), FootprintDepthMm = V(20000), Storeys = V(storeys), StoreyHeightMm = V(8000), FacadesSeen = new List<string> { "front" } });
        var (tooTall, tallWhy) = MassingPlanner.Changeset(Tower(130), new List<(string, double, bool)>(), "a");
        var (atCap, capWhy) = MassingPlanner.Changeset(Tower(125), new List<(string, double, bool)>(), "a");
        Ok(tooTall == null && tallWhy == "130 storeys of 8000 mm are 1040000 mm — a mass is at most 1000000 mm high: lower the storey count or the storey height"
           && atCap != null && capWhy == null,
           "130 storeys of 8000 mm (132 elements, under the cap) are refused in the planner's words — the bridge would refuse the mass; 125 of 8000 (1000000 mm) is filed");

        // MA-6 batch-2 drill: one storey reads "1 storey".
        var oneJson = Body(new List<(string, double, bool)>(), Tower(1));
        Ok(oneJson.GetProperty("name").GetString() == "Photo Massing · 1 storey · 20.0 × 20.0 m"
           && oneJson.GetProperty("elements").EnumerateArray().Last().GetProperty("reason").GetString()!.StartsWith("Photo Massing: 20.0 × 20.0 m, 1 storey of 8000 mm — "),
           "one storey is \"1 storey\" in the changeset's name and the mass's reason (drill: \"1 storeys\")");


        // ---- MA-6-9 (C14): photo reading v2 — counts and a ratio from each photo, one known dimension, the lengths inferred ----
        ViewReading Vw(string photo, int n, bool full, double r, string view = "front") =>
            new ViewReading { Photo = photo, Storeys = n, FullHeight = full, HeightToWidth = r, Bays = 10, View = view };
        var fused = MassingPlanner.FromViews(new List<ViewReading>
        {
            Vw("a.jpg", 37, true, 3.2), Vw("b.jpg", 39, true, 3.0, "side"), Vw("c.jpg", 12, false, 3.4, "corner"), Vw("d.jpg", 41, true, 0),
            new ViewReading { Photo = "e.jpg", Error = "the model answered HTTP 500" },
        });
        Ok(fused.Storeys.Value == 39 && fused.Storeys.Lo == 37 && fused.Storeys.Hi == 41 && fused.Storeys.Views == 3 && fused.Storeys.Of == 5
           && fused.Storeys.Source == "photo" && fused.Storeys.Confidence == 1 && MassingPlanner.Hint(fused.Storeys) == "observed — 3 of 5 photos: 37–41",
           "FromViews: storeys = the median of the full-height counts [37, 39, 41] (the 12 of a not-full view and the failed photo left out), its range and the share within ±2");
        Ok(fused.HeightToWidth.Value == 3.1 && fused.HeightToWidth.Lo == 3.0 && fused.HeightToWidth.Hi == 3.2 && fused.HeightToWidth.Views == 2 && fused.HeightToWidth.Confidence == 1,
           "FromViews: a zero ratio is skipped, and the cropped view's 3.4 is left out like its count — the ratio is the median of the full-height 3.2 and 3.0");
        var cropped = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 38, true, 3.2), Vw("b.jpg", 38, true, 3.3), Vw("c.jpg", 20, false, 1.5), Vw("d.jpg", 20, false, 1.6) });
        MassingPlanner.Scale(cropped, 157000, null);
        Ok(Math.Abs(cropped.HeightToWidth.Value - 3.25) < 1e-9 && Math.Abs(cropped.FootprintWidthMm.Value - 157000 / 3.25) < 1e-6,
           "review fix: two cropped views at 1.5 and 1.6 do not drag the ratio down — the width is 157000 ÷ 3.25, not ÷ 2.35");
        Ok(fused.FootprintWidthMm.Source == "assumed" && fused.FootprintDepthMm.Source == "assumed" && fused.StoreyHeightMm.Source == "assumed"
           && fused.StoreyHeightMm.Note == MassingPlanner.NeedsKnown
           && fused.ViewLines.Count == 5 && fused.ViewLines[4] == "e.jpg: not read — the model answered HTTP 500" && fused.Notes.Split('\n').Length == 5,
           "FromViews: width, depth and storey height stay assumed and say to type one known dimension; one line per photo, a failed one with its reason");
        var allNot = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 20, false, 3.0), Vw("b.jpg", 24, false, 3.0) });
        var noneRead = MassingPlanner.FromViews(new List<ViewReading>());
        Ok(allNot.Storeys.Value == 22 && allNot.Storeys.Views == 2 && noneRead.Storeys.Source == "assumed" && double.IsNaN(noneRead.HeightToWidth.Value)
           && !MassingPlanner.HasModelValue(noneRead),
           "FromViews: with no full-height view all counts are used; with nothing read everything is assumed and names no images");

        // Scale: 36–40 storeys (median 38) and ratios 3.8–4.2 (median 4.0), 157000 mm known.
        MassingEstimate Seagram() => MassingPlanner.FromViews(new List<ViewReading>
            { Vw("1.jpg", 36, true, 3.8), Vw("2.jpg", 38, true, 4.0), Vw("3.jpg", 40, true, 4.2), Vw("4.jpg", 38, true, 4.0) });
        var sc = Seagram();
        Ok(MassingPlanner.Scale(sc, 157000, null) == null
           && Math.Abs(sc.StoreyHeightMm.Value - 4131.578947) < 0.001 && sc.StoreyHeightMm.Source == "inferred"
           && Math.Abs(sc.StoreyHeightMm.Lo.Value - 157000.0 / 40) < 1e-6 && Math.Abs(sc.StoreyHeightMm.Hi.Value - 157000.0 / 36) < 1e-6
           && sc.FootprintWidthMm.Value == 39250 && sc.FootprintWidthMm.Source == "inferred"
           && Math.Abs(sc.FootprintWidthMm.Lo.Value - 157000 / 4.2) < 1e-6 && Math.Abs(sc.FootprintWidthMm.Hi.Value - 157000 / 3.8) < 1e-6
           && sc.FootprintDepthMm.Value == 39250 && sc.FootprintDepthMm.Source == "assumed" && sc.FootprintDepthMm.Note == "depth not seen — a person confirms"
           && MassingPlanner.KnownWords(sc) == "height 157000 mm, given" && MassingPlanner.ScaleRefusal(sc) == null
           && MassingPlanner.Hint(sc.StoreyHeightMm) == "inferred — range 3925–4361.111 — 157000 mm ÷ 38 storeys",
           "Scale(157000) with 38 storeys: storey height 4131.6 inferred (range from the counts), width 157000 ÷ 4.0 = 39250 inferred (range from the ratios), depth = width, assumed");
        var byW = Seagram();
        Ok(MassingPlanner.Scale(byW, null, 39250) == null
           && Math.Abs(byW.StoreyHeightMm.Value - 4131.578947) < 0.001 && byW.StoreyHeightMm.Source == "inferred"
           && byW.FootprintWidthMm.Value == 39250 && byW.FootprintWidthMm.Source == "user" && byW.FootprintWidthMm.Confidence == 1
           && byW.FootprintDepthMm.Source == "assumed" && MassingPlanner.KnownWords(byW) == "width 39250 mm, given",
           "Scale from a given width: H = W × ratio, so the same storey height; the width is the reviewer's (given), the depth assumed");
        var bad = Seagram();
        Ok(MassingPlanner.Scale(bad, 1000, 2000) == "give exactly one known dimension — the building's height or a façade's width"
           && MassingPlanner.Scale(bad, null, null) != null && MassingPlanner.Scale(bad, -5, null) != null && bad.KnownField == null
           && MassingPlanner.Scale(fused, null, 20000) == null && MassingPlanner.Scale(noneRead, null, 20000) == "type the number of storeys first — the storey height comes from it"
           && MassingPlanner.Scale(noneRead, 20000, null) == "type the number of storeys first — the storey height comes from it",
           "Scale refuses none, two or a non-positive known dimension, and a count of nothing, in words — and changes nothing then");
        var noRatio = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 10, true, 0), Vw("b.jpg", 10, true, 0) });
        Ok(MassingPlanner.Scale(noRatio, null, 20000) == "the photos gave no height : width ratio — give the building's height instead"
           && MassingPlanner.Scale(noRatio, 31000, null) == null && noRatio.StoreyHeightMm.Value == 3100 && noRatio.FootprintWidthMm.Source == "assumed",
           "no ratio: a width cannot give the height; a height still gives the storey height and leaves the width assumed");

        // ScaleRefusal (R11): an inferred number outside Validate's bounds is said, never clamped.
        var three = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 300, true, 4.0) });
        MassingPlanner.Scale(three, 157000, null);
        Ok(MassingPlanner.ScaleRefusal(three) == "storey height inferred 523 mm (157000 mm ÷ 300 storeys) is outside 2100–8000 mm — check the count or the known dimension"
           && three.Storeys.Value == 300 && MassingPlanner.Validate(three).Storeys.Value == 200,
           "300 storeys over 157000 mm: refused in words (523 mm ÷ …) — FromViews keeps 300 where Validate would cap it to 200");
        var wide = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 40, true, 0.1) });
        MassingPlanner.Scale(wide, 100000, null);
        Ok(MassingPlanner.ScaleRefusal(wide) == "footprint width inferred 1000000 mm (100000 mm ÷ ratio 0.1) is outside 2000–500000 mm — check the ratio or the known dimension"
           && MassingPlanner.ScaleRefusal(Seagram()) == null && MassingPlanner.ScaleRefusal(null) == null,
           "an inferred width past the bound is refused in words; nothing given, nothing refused");

        // HasModelValue and the marks.
        var mixed = Seagram();
        MassingPlanner.Scale(mixed, 157000, null);
        foreach (var v in new[] { mixed.FootprintWidthMm, mixed.FootprintDepthMm, mixed.Storeys }) v.Source = "user";
        bool ratioStillTheirs = MassingPlanner.HasModelValue(mixed); // the ratio is still "photo"
        mixed.HeightToWidth.Source = "user";
        Ok(ratioStillTheirs && !MassingPlanner.HasModelValue(mixed) && mixed.StoreyHeightMm.Source == "inferred",
           "HasModelValue counts the photo-read count or ratio, not an inferred length: with both typed by the reviewer an inferred storey height names no images");
        var down = MassingPlanner.FromViews(new List<ViewReading> { new ViewReading { Photo = "a.jpg", Error = "down" } });
        down.Storeys.Value = 38; down.Storeys.Source = "user"; down.HeightToWidth.Value = 4; down.HeightToWidth.Source = "user";
        MassingPlanner.Scale(down, 157000, null);
        Ok(down.StoreyHeightMm.Source == "inferred" && down.FootprintWidthMm.Source == "inferred" && !MassingPlanner.HasModelValue(down),
           "review fix (E7): Ollama down, every number typed, Scale ▶ — the inferred lengths do not name the images");
        // Scale: a given width is range-checked (R11), a depth the reviewer typed is kept, no ratio leaves a width to type, an uncounted storey count is blank.
        var big = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 10, true, 0.1) }); MassingPlanner.Scale(big, null, 600000);
        var tiny = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 1, true, 3) }); MassingPlanner.Scale(tiny, null, 1500);
        Ok(MassingPlanner.ScaleRefusal(big) == "footprint width given 600000 mm is outside 2000–500000 mm — check the known dimension"
           && MassingPlanner.ScaleRefusal(tiny)!.StartsWith("footprint width given 1500 mm is outside"),
           "review fix (R11): a known width outside the footprint bounds is refused in words, not capped by Validate");
        var keep = Seagram(); keep.FootprintDepthMm.Value = 20000; keep.FootprintDepthMm.Source = "user";
        MassingPlanner.Scale(keep, 157000, null);
        Ok(keep.FootprintDepthMm.Value == 20000 && keep.FootprintDepthMm.Source == "user", "review fix: Scale keeps a depth the reviewer typed");
        var nr = MassingPlanner.FromViews(new List<ViewReading> { Vw("a.jpg", 10, true, 0, "aerial") });
        MassingPlanner.Scale(nr, 31000, null);
        Ok(MassingPlanner.ScaleRefusal(nr) == "no height : width ratio was read — type the footprint width" && nr.FootprintWidthMm.Note == "no height : width ratio was read — type the footprint width",
           "review fix: scaled from a height with no ratio, the 2 m placeholder width is not filed — the reviewer is told to type it");
        Ok(double.IsNaN(noneRead.Storeys.Value) && noneRead.Storeys.Source == "assumed", "review fix: an uncounted storey count is blank, so a typed 1 is the reviewer's");
        var marked = MassingPlanner.Validate(sc);
        Ok(marked.HeightToWidth.Value == 4.0 && marked.KnownField == "height" && marked.KnownMm == 157000 && marked.ViewLines.Count == 4
           && marked.FootprintWidthMm.Source == "inferred" && marked.FootprintWidthMm.Lo == sc.FootprintWidthMm.Lo && marked.Storeys.Views == 4,
           "Validate carries the ratio, the known dimension, the view lines and each value's spread through unchanged (amendment 14)");
        var (cs, csWhy) = MassingPlanner.Changeset(marked, new List<(string, double, bool)>(), "a@example.test");
        var csMass = JsonDocument.Parse(JsonSerializer.Serialize(cs)).RootElement.GetProperty("elements").EnumerateArray().Last();
        Ok(csWhy == null && csMass.GetProperty("reason").GetString() == "Photo Massing: 39.3 × 39.3 m, 38 storeys of 4131.6 mm — width inferred, depth assumed, storeys observed, storey height inferred",
           "the filed mass's reason names the marks: width inferred, depth assumed, storeys observed, storey height inferred");

        // Row P-1 (D17), the measured table: on the four Seagram photos no local model lands 38 ± 4. The rows are p1-views.json (p1_measure.json).
        var rows = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "p1-views.json"))).RootElement.EnumerateArray().ToList();
        MassingEstimate Model(string tag) => MassingPlanner.FromViews(rows.Where(r => r.GetProperty("model").GetString() == tag).Select(r =>
            r.TryGetProperty("error", out var err)
                ? new ViewReading { Photo = r.GetProperty("photo").GetString(), Error = err.GetString() }
                : new ViewReading
                {
                    Photo = r.GetProperty("photo").GetString(), Storeys = r.GetProperty("storeys").GetInt32(), FullHeight = r.GetProperty("full_height").GetBoolean(),
                    HeightToWidth = r.GetProperty("height_to_width").GetDouble(), View = r.GetProperty("view").GetString(),
                }).ToList());
        var llava = Model("llava:latest"); var qwen = Model("qwen3.6:latest"); var llama = Model("llama3.2-vision:latest");
        MassingPlanner.Scale(qwen, 157000, null);
        Ok(MassingPlanner.FieldsNeedingReview(llava).Contains("storeys") && llava.Storeys.Confidence == 1 && MassingPlanner.FieldsNeedingReview(Seagram()).Contains("storeys")
           && MassingPlanner.Hint(llava.Storeys, true).Contains("agreement between photos, not accuracy"),
           "review fix: a count every photo agrees on (llava 20 on all four, confidence 1) is still listed for review, its hint says agreement is not accuracy");
        Ok(llava.Storeys.Value == 20 && llava.Storeys.Lo == 20 && llava.Storeys.Hi == 20 && llava.Storeys.Views == 4
           && qwen.Storeys.Value == 50 && qwen.Storeys.Lo == 42 && qwen.Storeys.Hi == 52 && qwen.Storeys.Views == 3 && qwen.Storeys.Of == 4
           && Math.Abs(qwen.StoreyHeightMm.Value - 3140) < 1e-9 && MassingPlanner.ScaleRefusal(qwen) == null
           && llama.Storeys.Source == "assumed" && llama.ViewLines.All(l => l.Contains("not read")),
           "P-1 table pinned: llava reads 20 on all four photos, qwen3.6 reads 50 (42–52, 3 of 4 full height); llama3.2-vision answered HTTP 500 on all four");
        Ok(new[] { llava, qwen }.All(e => Math.Abs(e.Storeys.Value - 38) > 4),
           "P-1 (D17): every local model MISSES 38 ± 4 — recorded, not hidden; the review shows the spread and the mark, a person gives the height");

        // review list
        var review = MassingPlanner.FieldsNeedingReview(lowc);
        Ok(review.Contains("storey height"), "review list flags the low-confidence field");

        // Final review, MA-1a item 4 (E7): the images are a build's source only while it holds a number the vision model gave.
        bool before = MassingPlanner.HasModelValue(m);
        foreach (var v in new[] { m.FootprintWidthMm, m.FootprintDepthMm, m.Storeys, m.StoreyHeightMm }.Concat(m.Openings.SelectMany(o => new[] { o.WidthMm, o.HeightMm })))
            v.Source = "user"; // the reviewer replaced every number
        Ok(before && !MassingPlanner.HasModelValue(empty) && !MassingPlanner.HasModelValue(MassingPlanner.Validate(m)) && !MassingPlanner.HasModelValue(null),
           "an estimate the vision model gave nothing for (Ollama down), or one the reviewer replaced, names no images (MA-6-6: the receipt's images_sha256 is null then)");
        Ok(Body(new List<(string, double, bool)>()).GetProperty("elements").EnumerateArray().Last().GetProperty("reason").GetString()
              == "Photo Massing: 12.0 × 8.0 m, 3 storeys of 3200 mm — width given, depth given, storeys given, storey height given",
           "the mass's reason says in the marks where a number came from (review fix: not the source code \"user\"; MA-6-9: given)");

        // MAS-4, MA-6-6: the review's words when nothing was filed.
        Ok(MassingPlanner.ReopenStatus == "Nothing was filed — the reason is in the message just shown. Your numbers are kept: put it right, then File for review again."
           && MassingPlanner.NotStarted("no plan") == "The filing did not start (no plan). Your numbers are kept: put it right, then File for review again.",
           "MAS-4 (MA-6-6): a filing that did not start, or that the bridge did not take, keeps the numbers and says to file again");

        // MA-6-10 (MAS-3): the footprint pick - Chain, Placed, Area, and Changeset with a footprint.
        double[] P(double x, double y) => new[] { x, y };
        var L = new List<double[]> { P(0, 0), P(30000, 0), P(30000, 8000), P(18000, 8000), P(18000, 20000), P(0, 20000) };
        List<(double[] A, double[] B)> Segs(List<double[]> loop) => loop.Select((p, i) => (p, loop[(i + 1) % loop.Count])).ToList();
        var shuffled = Segs(L); shuffled.Reverse(); shuffled = shuffled.Select((s, i) => i % 2 == 0 ? (s.B, s.A) : s).ToList();
        shuffled = new[] { 3, 0, 5, 1, 4, 2 }.Select(i => shuffled[i]).ToList();
        var chained = MassingPlanner.Chain(shuffled, 1, out string cwhy);
        Ok(chained != null && cwhy == null && chained.Count == 6 && Math.Abs(MassingPlanner.Area(chained) - 456.0) < 1e-9,
           "Chain joins shuffled and reversed segments into one loop of 6 corners, 456.0 m2");
        var gapSegs = Segs(L); gapSegs[5] = (gapSegs[5].A, P(5, 0));
        Ok(MassingPlanner.Chain(gapSegs, 1, out string gwhy) == null && gwhy == "the lines do not close — a gap of 5 mm at (0, 0)",
           "Chain: a 5 mm gap is refused in words (" + gwhy + ")");
        var branchSegs = Segs(L); branchSegs.Add((P(0, 0), P(-5000, -5000)));
        Ok(MassingPlanner.Chain(branchSegs, 1, out string bwhy) == null && bwhy == "the lines branch at (0, 0) — pick one outline", "Chain: a branch is refused (" + bwhy + ")");
        Ok(MassingPlanner.Chain(Segs(L).Take(2).ToList(), 1, out string fwhy) == null && fwhy == "fewer than 3 edges", "Chain: 2 edges is refused");
        var two = Segs(new List<double[]> { P(0, 0), P(1000, 0), P(1000, 1000) }); two.AddRange(Segs(new List<double[]> { P(5000, 5000), P(6000, 5000), P(6000, 6000) }));
        Ok(MassingPlanner.Chain(two, 1, out string twhy) == null && twhy == "the lines make more than one outline — pick one outline", "Chain: two separate triangles are refused (" + twhy + ")");

        var rect = new List<double[]> { P(0, 0), P(4000, 0), P(4000, 2000), P(0, 2000) };
        var r90 = MassingPlanner.Placed(new Footprint { Loop = rect }, 90);
        Ok(r90 != null && Math.Abs(MassingPlanner.Area(r90) - 8.0) < 0.01
           && r90.Max(q => q[0]) - r90.Min(q => q[0]) == 2000 && r90.Max(q => q[1]) - r90.Min(q => q[1]) == 4000
           && (r90.Min(q => q[0]) + r90.Max(q => q[0])) / 2 == 2000 && (r90.Min(q => q[1]) + r90.Max(q => q[1])) / 2 == 1000,
           "Placed 90 degrees turns about the bounding-box centre: 2000 x 4000, same centre, area kept");
        var moved = MassingPlanner.Placed(new Footprint { Loop = L, At = P(100000, -50000) }, 30);
        Ok(moved != null && Math.Abs(MassingPlanner.Area(moved) - 456.0) < 0.01 && Math.Abs((moved.Min(q => q[0]) + moved.Max(q => q[0])) / 2 - 100000) < 1500,
           "Placed with a moved centre and a 30 degree turn keeps the area within 0.01 m2");
        var cw = new List<double[]> { P(0, 0), P(0, 2000), P(4000, 2000), P(4000, 0), P(4000, 0), P(2000, 0) };
        var ccw = MassingPlanner.Placed(new Footprint { Loop = cw }, 0);
        double shoelace = 0; if (ccw != null) for (int i = 0; i < ccw.Count; i++) { var q = ccw[(i + 1) % ccw.Count]; shoelace += ccw[i][0] * q[1] - q[0] * ccw[i][1]; }
        Ok(ccw != null && ccw.Count == 4 && shoelace > 0 && ccw[0][0] == 0 && ccw[0][1] == 0, "Placed drops a repeated and a straight-through point and returns counter-clockwise from the same first corner");

        var fp = new Footprint { Loop = L, From = "a closed CAD polyline on layer A-SITE", At = P(100000, 0) };
        var mf = MassingPlanner.Validate(new MassingEstimate { Storeys = V(3), StoreyHeightMm = V(3500), RotationDeg = 30, Footprint = fp, FacadesSeen = new List<string> { "front" } });
        Ok(mf.RotationDeg == 30 && mf.Footprint == fp, "Validate copies RotationDeg and the footprint");
        var cb = JsonDocument.Parse(JsonSerializer.Serialize(MassingPlanner.Changeset(mf, new List<(string, double, bool)>(), "a@example.test", fp).Body)).RootElement;
        var mfMass = cb.GetProperty("elements").EnumerateArray().Last();
        string mreason = mfMass.GetProperty("reason").GetString();
        Ok(mfMass.GetProperty("kind").GetString() == "mass" && mfMass.GetProperty("place").GetProperty("Boundary").GetArrayLength() == 6
           && mreason.Contains("footprint: a closed CAD polyline on layer A-SITE, 6 corners, 456.0 m² (the polyline: 456.0 m²), centre at (100000, 0) mm, turned 30°")
           && cb.GetProperty("name").GetString() == "Photo Massing · 3 storeys · footprint 456.0 m²"
           && !mfMass.TryGetProperty("LevelName", out _) && !mfMass.TryGetProperty("TypeName", out _) && cb.GetProperty("source").GetString() == "photo",
           "Changeset with a footprint: a 6-corner Boundary, the footprint reason, the footprint name, no LevelName or TypeName (" + mreason + ")");
        var plain = MassingPlanner.Changeset(m, new List<(string, double, bool)>(), "a@example.test");
        var at0 = JsonSerializer.Serialize(MassingPlanner.Changeset(m, new List<(string, double, bool)>(), "a@example.test", null).Body);
        Ok(at0 == JsonSerializer.Serialize(plain.Body) && at0.Contains("\"Boundary\":[[-6000,-4000],[6000,-4000],[6000,4000],[-6000,4000]]"),
           "without a footprint or a turn the changeset is unchanged: the W x D rectangle centred on the origin");
        var centred = MassingPlanner.Changeset(m, new List<(string, double, bool)>(), "a", new Footprint { At = P(5000, 7000), From = "x" }).Body;
        Ok(JsonSerializer.Serialize(centred).Contains("\"Boundary\":[[-1000,3000],[11000,3000],[11000,11000],[-1000,11000]]"), "choice 2: the photos' rectangle is centred on the picked point");
        var pickedStorey = new MassingEstimate { Storeys = V(3), StoreyHeightMm = V(3500), Footprint = fp, FootprintWidthMm = new EstimatedValue { Value = 2000, Source = "assumed" }, FootprintDepthMm = new EstimatedValue { Value = 2000, Source = "assumed" } };
        Ok(!MassingPlanner.FieldsNeedingReview(pickedStorey).Contains("footprint width") && MassingPlanner.Scale(pickedStorey, null, 12000) is { } w0 && w0.Contains("give the building's height"),
           "a picked footprint: width and depth are not asked of the reviewer, and a known width is refused");

        // MA-6-10 review fixes: the bridge's Boundary rules at pick time, the turned photo rectangle, the layer bound.
        var bow = new List<double[]> { P(0, 0), P(4000, 4000), P(4000, 0), P(0, 4000) };
        Ok(MassingPlanner.OutlineProblem(bow) is { } bowWhy && bowWhy.StartsWith("the outline crosses or touches itself"), "OutlineProblem: a bow-tie is refused in words");
        Ok(MassingPlanner.OutlineProblem(L) == null && MassingPlanner.OutlineProblem(rect) == null, "OutlineProblem: an L and a rectangle pass");
        var many = Enumerable.Range(0, 300).Select(i => P(50000 * Math.Cos(i * 2 * Math.PI / 300), 50000 * Math.Sin(i * 2 * Math.PI / 300))).ToList();
        Ok(MassingPlanner.OutlineProblem(many) == "the outline has 300 corners; a mass takes at most 256", "OutlineProblem: 300 corners is refused");
        Ok(MassingPlanner.OutlineProblem(new List<double[]> { P(0, 0), P(0.5, 0), P(4000, 3000) }) is { } shortWhy && shortWhy.Contains("shorter than 1 mm"), "OutlineProblem: an edge under 1 mm is refused");
        Ok(MassingPlanner.OutlineProblem(new List<double[]> { P(0, 0), P(4000, 0), P(4000, 4000), P(2000, 0), P(0, 4000) }) != null, "OutlineProblem: a corner touching an edge is refused");
        var bowM = MassingPlanner.Validate(new MassingEstimate { Storeys = V(3), StoreyHeightMm = V(3500), Footprint = new Footprint { Loop = bow, From = "x" }, FacadesSeen = new List<string> { "front" } });
        var bowC = MassingPlanner.Changeset(bowM, new List<(string, double, bool)>(), "a@example.test", bowM.Footprint);
        Ok(bowC.Body == null && bowC.Refusal.StartsWith("the footprint cannot be used: the outline crosses"), "Changeset refuses a self-crossing picked outline in words (" + bowC.Refusal + ")");
        var turned = JsonDocument.Parse(JsonSerializer.Serialize(MassingPlanner.Changeset(new MassingEstimate { Storeys = V(3), StoreyHeightMm = V(3500), RotationDeg = 30, FootprintWidthMm = V(12000), FootprintDepthMm = V(8000), FacadesSeen = new List<string> { "front" } }, new List<(string, double, bool)>(), "a@example.test").Body)).RootElement;
        var tMass = turned.GetProperty("elements").EnumerateArray().Last();
        var tb = tMass.GetProperty("place").GetProperty("Boundary").EnumerateArray().Select(e => new[] { e[0].GetDouble(), e[1].GetDouble() }).ToList();
        Ok(Math.Abs(MassingPlanner.Area(tb) - 96.0) < 0.01 && Math.Abs((tb.Min(q => q[0]) + tb.Max(q => q[0])) / 2) < 0.2
           && tMass.GetProperty("reason").GetString().Contains("centred on the model origin, turned 30°"),
           "a photo rectangle turned 30 degrees with no picked point: area kept, centred on the origin, said so");
        var lonely = JsonDocument.Parse(JsonSerializer.Serialize(MassingPlanner.Changeset(mf, new List<(string, double, bool)>(), "a@example.test", new Footprint { Loop = L, From = "x" }).Body)).RootElement;
        Ok(lonely.GetProperty("elements").EnumerateArray().Last().GetProperty("reason").GetString().Contains("centre at (15000, 10000) mm"), "a footprint with no picked point: the pivot is the outline's own centre");
        Ok(MassingPlanner.CadName("A\nB" + new string('x', 100)).Length == 64 && !MassingPlanner.CadName("A\nB").Contains('\n'), "a CAD layer name is one line, at most 64 characters");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
