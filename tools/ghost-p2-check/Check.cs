// Offline checks for GhostBuilder v2:
//   • P2 — the build-proposal contract (LocalGhostBuilder.MergeParams + the LayerMapping JSON shape)
//   • P3 — the review gate (GhostReviewWindow emits ONLY ticked rows: the rule that stops an
//          unreviewed proposal reaching the model)
// Both source files are Revit-free, so they compile and run without Revit installed — exactly like
// LayerRulesetMatcher in the P1 verification.
#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Sentinel.GhostBuilder;
using Sentinel.UI;

static partial class Check
{
    static int _pass, _fail;

    static void Ok(bool cond, string name)
    {
        if (cond) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; Console.WriteLine("  FAIL  " + name); }
    }

    static MappingResult Sample() => new MappingResult
    {
        Mappings = new List<LayerMapping>
        {
            new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls",  BdsFamilyType = "EXT-200", Confidence = 1.0 },
            new LayerMapping { CadLayer = "A-DOOR",     Category = "Doors",  BdsFamily = "Generic Door", Confidence = 0.8 },
        }
    };

    static IEnumerable<System.Windows.DependencyObject> Descendants(System.Windows.DependencyObject root)
    {
        foreach (var child in System.Windows.LogicalTreeHelper.GetChildren(root).OfType<System.Windows.DependencyObject>())
        {
            yield return child;
            foreach (var d in Descendants(child)) yield return d;
        }
    }

    [STAThread] // WPF: the review gate is a Window, so the check must run on an STA thread.
    static int Main()
    {
        Console.WriteLine("GhostBuilder v2 offline checks\n");
        Console.WriteLine("P2 — build-proposal contract");

        // 1. Happy path: params + provenance land on the matching layer, case/whitespace insensitively.
        var m = Sample();
        LocalGhostBuilder.MergeParams(m, @"{""assignments"":[
            {""cadLayer"":"" a-wall-ext "",""params"":[{""name"":""Fire Rating"",""value"":""FR60""}],
             ""rationale"":""External walls shall be FR60."",""sourceDoc"":""spec.pdf""}]}");
        var wall = m.Mappings[0];
        Ok(wall.Params != null && wall.Params.Count == 1, "match is case- and whitespace-insensitive");
        Ok(wall.Params?[0].Name == "Fire Rating" && wall.Params?[0].Value == "FR60", "param name/value carried");
        Ok(wall.Rationale == "External walls shall be FR60." && wall.SourceDoc == "spec.pdf", "provenance carried");
        Ok(m.Mappings[1].Params == null, "unmentioned layer left untouched");

        // 2. A layer the model invented is dropped, not crashed on.
        m = Sample();
        LocalGhostBuilder.MergeParams(m, @"{""assignments"":[
            {""cadLayer"":""A-INVENTED"",""params"":[{""name"":""Mark"",""value"":""X""}]}]}");
        Ok(m.Mappings.All(x => x.Params == null), "hallucinated layer ignored");

        // 3. Blank / null names and values are filtered; an all-blank assignment writes nothing.
        m = Sample();
        LocalGhostBuilder.MergeParams(m, @"{""assignments"":[
            {""cadLayer"":""A-WALL-EXT"",""params"":[{""name"":"" "",""value"":""FR60""},{""name"":""Mark"",""value"":""""},
             {""name"":""Comments"",""value"":""ok""}]}]}");
        Ok(m.Mappings[0].Params?.Count == 1 && m.Mappings[0].Params[0].Name == "Comments", "blank name/value filtered");

        m = Sample();
        LocalGhostBuilder.MergeParams(m, @"{""assignments"":[
            {""cadLayer"":""A-WALL-EXT"",""params"":[],""rationale"":""nothing stated""}]}");
        Ok(m.Mappings[0].Params == null && m.Mappings[0].Rationale == null, "empty params => no rationale-only noise");

        // 4. Junk in, mapping out unchanged — parameters must never break a build.
        m = Sample();
        LocalGhostBuilder.MergeParams(m, "not json at all {{{");
        LocalGhostBuilder.MergeParams(m, @"{""assignments"":null}");
        LocalGhostBuilder.MergeParams(m, "");
        LocalGhostBuilder.MergeParams(null, @"{""assignments"":[]}");
        LocalGhostBuilder.MergeParams(new MappingResult(), @"{""assignments"":[{""cadLayer"":""x"",""params"":[]}]}");
        Ok(m.Mappings.All(x => x.Params == null), "malformed/empty input is a no-op, never a throw");

        // 5. The P1 shape (no params/rationale/sourceDoc) still deserializes — the contract is additive.
        var p1 = JsonSerializer.Deserialize<MappingResult>(
            @"{""mappings"":[{""cadLayer"":""A-WALL"",""category"":""Walls"",""bdsFamily"":""W"",""confidence"":0.9}]}");
        Ok(p1.Mappings.Count == 1 && p1.Mappings[0].Params == null, "P1-shape mapping JSON still valid");

        // 6. Round-trip through the persistent cache's serializer keeps the new fields.
        var round = JsonSerializer.Deserialize<LayerMapping>(JsonSerializer.Serialize(wall));
        Ok(round.Params?[0].Value == "FR60" && round.SourceDoc == "spec.pdf", "new fields survive JSON round-trip");

        // ---- P3: the review gate ----
        Console.WriteLine("\nP3 — review gate");

        var proposal = new MappingResult
        {
            Mappings = new List<LayerMapping>
            {
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls", BdsFamilyType = "EXT-200", Confidence = 0.95, Source = "standard",
                                   Params = new List<ParamAssignment> { new ParamAssignment { Name = "Fire Rating", Value = "FR60" } },
                                   Rationale = "External walls shall be FR60.", SourceDoc = "spec.pdf" },
                new LayerMapping { CadLayer = "A-GUESS",    Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.30, Source = "standard" },
                new LayerMapping { CadLayer = "A-EMPTY",    Category = "Doors", BdsFamily = "Generic Door", Confidence = 1.00, Source = "standard" },
                // Finding 7: an LLM-sourced row must never pre-tick, even at high confidence with geometry —
                // this is the canary that fails if the row-build site stops consulting Source.
                new LayerMapping { CadLayer = "A-LLM-GUESS", Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.90, Source = "llm" },
                // Cohesion 4b-2: a keyword guess is not a standard, however confident, and neither is a remembered answer.
                new LayerMapping { CadLayer = "EXT-PARTITION", Category = "Walls", BdsFamily = "Generic Wall", Confidence = 1.00, Source = "heuristic" },
                new LayerMapping { CadLayer = "S-FNDN", Category = "Floors", BdsFamily = "Generic Floor", Confidence = 0.95, Source = "cache" },
                new LayerMapping { CadLayer = "EXTERIOR-ENVELOPE", Confidence = 0, Source = "unmapped", Rationale = "not mapped — local model unreachable (x)" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["A-WALL-EXT"] = 120, ["A-GUESS"] = 7, ["A-LLM-GUESS"] = 50, // A-EMPTY absent => zero geometry
            ["EXT-PARTITION"] = 40, ["S-FNDN"] = 12, ["EXTERIOR-ENVELOPE"] = 14,
        };
        const string header = "Layers: layers@1 · office · 0123456789ab… · Guideline: none — not installed for demo or its office · Type catalogue: none — not installed for demo or its office";

        MappingResult emitted = null;
        var w = new GhostReviewWindow();          // constructed, never shown
        w.BuildRequested += (m, _) => emitted = m;
        w.Load(proposal, counts, "Project.rvt", header);
        Ok(w.StandardsLine == header, "the review is headed with the three standards it was made with, none included");

        // The gate's whole purpose: nothing is emitted until a human clicks Build.
        Ok(emitted == null, "loading a proposal emits nothing (no build without review)");

        w.Build();   // simulate the Build click with the default ticks
        Ok(emitted != null, "Build emits the approved proposal");
        var layers = emitted?.Mappings.Select(m => m.CadLayer).ToList() ?? new List<string>();
        Ok(layers.Contains("A-WALL-EXT"), "high-confidence layer with geometry is pre-ticked");
        Ok(!layers.Contains("A-GUESS"), "low-confidence layer is opt-in, not built by default");
        Ok(!layers.Contains("A-EMPTY"), "layer with no geometry is never pre-ticked");
        Ok(!layers.Contains("A-LLM-GUESS"), "LLM-sourced row is never pre-ticked, even high-confidence with geometry");
        Ok(!layers.Contains("EXT-PARTITION") && !layers.Contains("S-FNDN") && !layers.Contains("EXTERIOR-ENVELOPE"),
           "heuristic, remembered and unmapped rows are never pre-ticked, even at 1.0 with geometry");
        Ok(emitted?.Mappings.Count == 1, "only ticked rows are emitted");
        Ok(emitted?.Mappings[0].Params?[0].Value == "FR60", "approved row keeps its document-derived params");
        Ok(!ReferenceEquals(emitted, proposal), "emits a new proposal, never the unreviewed one");

        // Snowdon finding 2: LLM rows and absurd-count rows must never start ticked, even at high confidence.
        Ok(GhostReviewWindow.PreTick(10, 1.0, "standard", 0.5), "standard/1.0/10 pre-ticks");
        Ok(!GhostReviewWindow.PreTick(10, 0.9, "llm", 0.5), "llm/0.9/10 does not pre-tick");
        Ok(!GhostReviewWindow.PreTick(10000, 1.0, "standard", 0.5), "standard/1.0/10000 (absurd count) does not pre-tick");
        Ok(!GhostReviewWindow.PreTick(10, 1.0, null, 0.5), "null source does not pre-tick");
        Ok(new[] { "heuristic", "cache", "unmapped" }.All(s => !GhostReviewWindow.PreTick(10, 1.0, s, 0.5)), "heuristic/cache/unmapped at 1.0 do not pre-tick");
        Ok(GhostReviewWindow.SourceNote("standard") == "" && GhostReviewWindow.SourceNote("heuristic") == "  · heuristic guess"
           && GhostReviewWindow.SourceNote("llm") == "  · local model" && GhostReviewWindow.SourceNote("cache") == "  · local model (remembered)"
           && GhostReviewWindow.SourceNote("unmapped") == "  · not mapped", "every row that is not the standard says what it is");

        // ---- The shipped sample: does the real SENSE path actually read it? ----
        Console.WriteLine("\nSample pair (demo/ghost-sample)");

        string sampleDir = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..", "demo", "ghost-sample"));
        Ok(Directory.Exists(sampleDir), $"sample folder exists ({sampleDir})");
        Ok(File.Exists(Path.Combine(sampleDir, "sample-plan.dxf")), "sample-plan.dxf present");
        Ok(File.Exists(Path.Combine(sampleDir, "sample-spec.pdf")), "sample-spec.pdf present");

        // GhostEvidence.FromFolder is the exact call the command makes. If the hand-written PDF were
        // malformed, this would silently return Empty and the whole live test would be inconclusive.
        var ev = GhostEvidence.FromFolder(sampleDir);
        Ok(!ev.IsEmpty, "GhostEvidence reads the sample folder (PDF parses in PdfPig)");
        Ok(ev.Sources.Contains("sample-spec.pdf"), "the spec PDF is cited as a source");
        Ok(ev.Context.Contains("FR60"), "the fire rating the model must lift is in the evidence text");
        Ok(ev.Context.Contains("A-WALL-EXT"), "the layer that rating applies to is in the evidence text");
        Ok(ev.Context.Contains("EXTERIOR-ENVELOPE"), "the non-standard layer is explained in the evidence");
        // README.md is read first, into the same 6000-char budget: a longer README cuts the spec off (FD30 is its last line).
        Ok(ev.Context.Contains("FD30"), "the whole spec reaches the evidence (the folder's README leaves it room)");

        // The DXF must carry both the standard layers and the two that tier 0 has to drop.
        string dxf = File.ReadAllText(Path.Combine(sampleDir, "sample-plan.dxf"));
        foreach (string layer in new[] { "A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXTERIOR-ENVELOPE" })
            Ok(dxf.Contains(layer), $"DXF carries layer {layer}");
        Ok(dxf.Contains("A-ANNO") && dxf.Contains("DEFPOINTS"), "DXF carries the two must-be-ignored layers");

        // Empty proposal: nothing to build, and Build must stay a no-op rather than emit an empty run.
        emitted = null;
        var w2 = new GhostReviewWindow();
        w2.BuildRequested += (m, _) => emitted = m;
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>() }, counts, "Project.rvt", header);
        w2.Build();
        Ok(emitted == null, "empty proposal cannot be built");

        // MAS-4: Photo Massing's review — one filing per click (MA-6-6: Build became File for review); the command closes it once the
        // changeset is filed, or reopens it with the reason.
        // MA-6-9: File for review needs a known dimension — these windows are built from an estimate with the height given, then Scale ▶.
        static MassingReviewWindow Ready()
        {
            var e = MassingPlanner.FromViews(new List<ViewReading>
            {
                new ViewReading { Photo = "a.jpg", Storeys = 3, FullHeight = true, HeightToWidth = 1.5, View = "front" },
                new ViewReading { Photo = "b.jpg", Storeys = 3, FullHeight = true, HeightToWidth = 1.5, View = "side" },
            });
            e.KnownField = "height"; e.KnownMm = 10500;
            var w = new MassingReviewWindow(e);
            w.ScaleNow();
            return w;
        }
        int builds = 0;
        var massing = Ready(); // constructed, never shown
        massing.BuildRequested += _ => builds++;
        massing.Emit();
        massing.Emit(); // the second click of a double-click
        Ok(builds == 1 && !massing.CanBuild && massing.StatusText == "Filing the massing for review…",
           "MAS-4: a double-click on File for review files once — the button is disabled by the first click");
        massing.Reopen(MassingPlanner.ReopenStatus);
        Ok(massing.CanBuild && massing.StatusText == MassingPlanner.ReopenStatus, "MAS-4: a filing that filed nothing reopens the review, the reason on its status line");
        massing.Emit();
        Ok(builds == 2 && !massing.CanBuild, "MAS-4: after a reopen, File for review files once more");
        // Review amendment C12: a filing that never started (the subscriber threw) must not leave the button disabled for good.
        var failing = Ready();
        failing.BuildRequested += _ => throw new InvalidOperationException("no plan");
        bool threw = false;
        try { failing.Emit(); } catch (InvalidOperationException) { threw = true; }
        Ok(threw && failing.CanBuild && failing.StatusText == MassingPlanner.NotStarted("no plan"),
           "MAS-4: a filing that could not start reopens the review with the reason — File for review works again");
        // MA-6-9 (C14): no known dimension → nothing is filed, in the plan's words; Scale ▶ then File files the inferred numbers, marked.
        int filed = 0; MassingEstimate got = null;
        var noKnown = new MassingReviewWindow(MassingPlanner.FromViews(new List<ViewReading>
            { new ViewReading { Photo = "a.jpg", Storeys = 3, FullHeight = true, HeightToWidth = 1.5, View = "front" } }));
        noKnown.BuildRequested += e => { filed++; got = e; };
        noKnown.Emit();
        Ok(filed == 0 && noKnown.CanBuild && noKnown.StatusText == "type one known dimension — the building's height or a façade's width; the photos give counts and ratios only",
           "MA-6-9: File for review with no known dimension files nothing and says to type one");
        var ready = Ready();
        ready.BuildRequested += e => { filed++; got = e; };
        ready.Emit();
        Ok(filed == 1 && got != null && got.KnownField == "height" && got.KnownMm == 10500 && got.Storeys.Source == "photo" && got.HeightToWidth.Value == 1.5
           && got.StoreyHeightMm.Source == "inferred" && Math.Abs(got.StoreyHeightMm.Value - 3500) < 0.001
           && got.FootprintWidthMm.Source == "inferred" && Math.Abs(got.FootprintWidthMm.Value - 7000) < 0.001 && got.FootprintDepthMm.Source == "assumed",
           "MA-6-9: after Scale ▶ File for review files — the scaled numbers still inferred (Emit does not take them for the reviewer's), the ratio and the known dimension carried");
        var tooMany = MassingPlanner.FromViews(new List<ViewReading> { new ViewReading { Photo = "a.jpg", Storeys = 300, FullHeight = true, HeightToWidth = 4, View = "front" } });
        tooMany.KnownField = "height"; tooMany.KnownMm = 157000;
        var refusing = new MassingReviewWindow(tooMany);
        int refusedBuilds = 0; refusing.BuildRequested += _ => refusedBuilds++;
        refusing.ScaleNow();
        refusing.Emit();
        Ok(refusedBuilds == 0 && refusing.CanBuild && refusing.StatusText == "storey height inferred 523 mm (157000 mm ÷ 300 storeys) is outside 2100–8000 mm — check the count or the known dimension",
           "MA-6-9 (R11): an inferred storey height out of range is said on the status line and not filed — never clamped");
        // Review fixes: the lengths are filed only for the inputs Scale ▶ saw. Boxes in row order: storeys, ratio, known height, known width, ...
        static System.Windows.Controls.TextBox Box(MassingReviewWindow w, int i) => Descendants(w).OfType<System.Windows.Controls.TextBox>().ElementAt(i);
        int stale = 0;
        var typed = MassingPlanner.FromViews(new List<ViewReading> { new ViewReading { Photo = "a.jpg", Storeys = 3, FullHeight = true, HeightToWidth = 1.5, View = "front" } });
        var typedW = new MassingReviewWindow(typed); typedW.BuildRequested += _ => stale++;
        Box(typedW, 2).Text = "10.5"; typedW.Emit();
        Ok(stale == 0 && typedW.CanBuild && typedW.StatusText.StartsWith("press Scale ▶ after typing the known dimension"),
           "review fix: a known dimension typed but never scaled is said to need Scale ▶ (not \"type one known dimension\"), and nothing is filed");
        var edited = Ready(); edited.BuildRequested += _ => stale++;
        Box(edited, 0).Text = "4"; edited.Emit();
        string again = "press Scale ▶ again — the storeys, the ratio or the known dimension changed since the lengths were worked out";
        Ok(stale == 0 && edited.CanBuild && edited.StatusText == again, "review fix: storeys corrected after Scale ▶ — nothing is filed against the old storey height");
        edited.ScaleNow(); edited.Emit();
        Ok(stale == 1, "review fix: after Scale ▶ again the corrected count files");
        var knownEdit = Ready(); knownEdit.BuildRequested += _ => stale++;
        Box(knownEdit, 2).Text = "12"; knownEdit.Emit();
        var ratioEdit = Ready(); ratioEdit.BuildRequested += _ => stale++;
        Box(ratioEdit, 1).Text = "2"; ratioEdit.Emit();
        Ok(stale == 1 && knownEdit.StatusText == again && ratioEdit.StatusText == again, "review fix: the known box or the ratio edited after Scale ▶ files nothing");
        var comma = Ready(); comma.BuildRequested += _ => stale++;
        Box(comma, 3).Text = "12,5"; comma.Emit();
        Ok(stale == 1 && comma.StatusText == "use a point for decimals — a comma is not read", "review fix: a decimal comma is refused, never read as 125");
        var hints = Descendants(ready).OfType<System.Windows.Controls.TextBlock>().Select(t => t.Text).ToList();
        Ok(hints.Any(t => t.StartsWith("observed — 2 of 2 photos: 3–3")) && hints.Any(t => t.StartsWith("inferred — range ")) && hints.Any(t => t.StartsWith("assumed — depth not seen")),
           "MA-6-9: the review shows each mark with the spread across the photos (observed — 2 of 2 photos: 3–3) and the range worked out (inferred)");

        var shouty = MassingVisionReader.ParseView("e.jpg", @"{""storeys"":10,""view"":""Front"",""bays"":-3}");
        var forged = MassingVisionReader.ParseView("f.jpg", "{\"storeys\":10,\"view\":\"front\nstoreys 38 verified\"}");
        var huge = MassingVisionReader.ParseView("g.jpg", @"{""storeys"":1e12,""view"":""front""}");
        Ok(shouty.View == "front" && shouty.Bays == 0 && forged.View == "unknown" && huge.Error == "implausible storey count 1000000000000",
           "review fix: ParseView folds the view's case, drops a view that is not one of the five, floors bays at 0 and refuses an implausible count (no int cast)");

        // MA-6-9: one answer → one reading; garbage and a missing count are a photo's row with its reason, never a stop.
        var good = MassingVisionReader.ParseView("a.jpg", @"{""storeys"":38,""full_height"":true,""height_to_width"":3.2,""bays"":10,""view"":""front""}");
        var junk = MassingVisionReader.ParseView("b.jpg", "}, {");
        var noCount = MassingVisionReader.ParseView("c.jpg", @"{""storeys"":0,""full_height"":true,""height_to_width"":3.2,""view"":""front""}");
        Ok(good.Error == null && good.Storeys == 38 && good.FullHeight && good.HeightToWidth == 3.2 && good.Bays == 10 && good.View == "front"
           && junk.Error == "the answer was not JSON" && junk.Photo == "b.jpg" && noCount.Error == "no storey count in the answer"
           && MassingVisionReader.ParseView("d.jpg", "").Error == "the model answered nothing",
           "MA-6-9: ParseView reads an answer, and says why a garbled or count-less one is a row of its own");
        // MA-6-9: a 3000 x 4000 photo goes to the model at 1024 px on its long side — WPF imaging on a worker thread; a small one is not enlarged.
        string pics = Path.Combine(Path.GetTempPath(), "sentinel-ma69-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(pics);
        try
        {
            string big = Path.Combine(pics, "big.png"), small = Path.Combine(pics, "small.png");
            static void Png(string path, int w, int h)
            {
                var px = new byte[w * h * 3];
                for (int i = 0; i < px.Length; i++) px[i] = (byte)(i % 251);
                var enc = new System.Windows.Media.Imaging.PngBitmapEncoder();
                enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(System.Windows.Media.Imaging.BitmapSource.Create(w, h, 96, 96, System.Windows.Media.PixelFormats.Rgb24, null, px, w * 3)));
                using var fs = File.Create(path); enc.Save(fs);
            }
            Png(big, 3000, 4000); Png(small, 200, 100);
            (int w, int h) Size(byte[] jpg) { using var ms = new MemoryStream(jpg); var f = System.Windows.Media.Imaging.BitmapDecoder.Create(ms, System.Windows.Media.Imaging.BitmapCreateOptions.None, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad).Frames[0]; return (f.PixelWidth, f.PixelHeight); }
            var onWorker = Task.Run(() => (MassingVisionReader.Jpeg1024(big), MassingVisionReader.Jpeg1024(small))).GetAwaiter().GetResult();
            Ok(Size(onWorker.Item1) == (768, 1024) && Size(onWorker.Item2) == (200, 100) && onWorker.Item1.Length > 1000 && onWorker.Item1[0] == 0xFF && onWorker.Item1[1] == 0xD8,
               "MA-6-9: Jpeg1024 on a worker thread makes a 3000 x 4000 photo a JPEG 768 x 1024 and leaves a 200 x 100 one alone");
            string rot = Path.Combine(pics, "rot.jpg");
            { // a phone photo: 300 x 200 with EXIF orientation 6 (rotate 90) must reach the model as 200 x 300
                var src = System.Windows.Media.Imaging.BitmapSource.Create(300, 200, 96, 96, System.Windows.Media.PixelFormats.Rgb24, null, new byte[300 * 200 * 3], 300 * 3);
                var md = new System.Windows.Media.Imaging.BitmapMetadata("jpg");
                md.SetQuery("/app1/ifd/{ushort=274}", (ushort)6);
                var enc = new System.Windows.Media.Imaging.JpegBitmapEncoder();
                enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(src, null, md, null));
                using var fs = File.Create(rot); enc.Save(fs);
            }
            Ok(Size(MassingVisionReader.Jpeg1024(rot)) == (200, 300), "review fix: Jpeg1024 applies EXIF orientation 6 (300 x 200 → 200 x 300)");
            File.Delete(rot); // the folder reads below count photos
            // The reader itself, no model: a folder of photos and nothing to answer → every photo a row with its reason, never a throw.
            using var offline = new MassingVisionReader("llava", "http://127.0.0.1:1/api/generate");
            var seen = new List<string>();
            var est = offline.EstimateAsync(pics, progress: new Progress<string>(seen.Add)).GetAwaiter().GetResult();
            System.Threading.Thread.Sleep(200); // Progress<T> posts to the pool
            Ok(est.ViewLines.Count == 2 && est.ViewLines.All(l => l.Contains("not read")) && est.Storeys.Source == "assumed" && est.KnownField == null
               && offline.Usage.Calls == 2 && offline.Usage.Answered == 0 && seen.Contains("Reading photo 1 of 2…") && seen.Contains("Reading photo 2 of 2…"),
               "MA-6-9: with no model to answer, each photo is a row (counted as asked, not answered), the progress reads \"Reading photo i of n…\", and the estimate is all-assumed");
        }
        finally { try { Directory.Delete(pics, true); } catch { } }
        // SEC-3: the review is shown modeless (Commands.Massing) — its Cancel closes it on a click (IsCancel alone closes only a dialog).
        var shown = new MassingReviewWindow(MassingPlanner.Validate(new MassingEstimate()));
        shown.Show();
        var cancelButton = Descendants(shown).OfType<System.Windows.Controls.Button>().First(b => (b.Content as string) == "Cancel");
        cancelButton.RaiseEvent(new System.Windows.RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
        Ok(!shown.IsVisible, "SEC-3: Photo Massing's Cancel closes the review it shows modeless");
        // MA-6-6: the words say what the button does now — it files for review; nothing is placed until a person applies it.
        var words = new MassingReviewWindow(MassingPlanner.Validate(new MassingEstimate()));
        var texts = Descendants(words).OfType<System.Windows.Controls.TextBlock>().Select(t => t.Text).ToList();
        Ok(Descendants(words).OfType<System.Windows.Controls.Button>().Any(b => (b.Content as string) == "File for review ▶")
           && !Descendants(words).OfType<System.Windows.Controls.Button>().Any(b => (b.Content as string ?? "").Contains("Build"))
           && texts.Any(t => t.EndsWith("Nothing is filed until you press File for review; nothing is placed until a person applies it in Review AI Proposals."))
           && texts.Any(t => t.StartsWith("Type one known dimension, press Scale ▶, check the ") && t.EndsWith("amber field(s), then File for review.")) && words.Title == "Sentinel — Massing: review the estimate before filing",
           "MA-6-6: the review's button reads File for review, and its words say nothing is filed until it is pressed, nothing placed until a person applies it");
        if (shown.IsVisible) shown.Close();

        // SEC-2: every model client checks its endpoint in its constructor — a host off this PC only when this PC opted in.
        static bool Refused(Action make) { try { make(); return false; } catch (ArgumentException e) { return e.Message.Contains("Nothing was read or sent"); } }
        const string elsewhere = "http://203.0.113.9:11434/api/generate";
        Ok(Refused(() => new LocalGhostBuilder("", ollamaUrl: elsewhere).Dispose()), "SEC-2: LocalGhostBuilder refuses a model off this PC, in words");
        Ok(Refused(() => new LocalVisionReader("llava", elsewhere).Dispose()), "SEC-2: LocalVisionReader refuses it");
        Ok(Refused(() => new MassingVisionReader("llava", elsewhere).Dispose()), "SEC-2: MassingVisionReader refuses it");
        Ok(!Refused(() => { new LocalGhostBuilder("").Dispose(); new LocalVisionReader().Dispose(); new MassingVisionReader().Dispose(); })
           && !Refused(() => new MassingVisionReader("llava", "https://models.example.com/api", cloudOptIn: true).Dispose()),
           "SEC-2: this PC's model is called, and a host elsewhere when this PC opted in");

        Honest(); // MA-1a step 1: failure rule, family-type pick, review drop-down (Honest.cs)

        if (Environment.GetCommandLineArgs().Contains("--live")) LiveDryRun().GetAwaiter().GetResult();

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    /// <summary>
    /// `--live`: run the REAL mapping + parameter pipeline against the REAL local Ollama and the REAL
    /// scoped folder, using the sample DXF's layer list. Everything here except Revit placement and the
    /// window's own message loop is the same code the add-in runs, so this answers "will the Revit run
    /// produce a sensible proposal?" BEFORE anyone opens Revit.
    ///
    /// Opt-in because it needs Ollama up and takes real inference time; the default suite stays hermetic.
    /// It writes its layer cache to a TEMP path — polluting the real cache would defeat the next live run
    /// (a cached layer never reaches the model).
    /// </summary>
    static async Task LiveDryRun()
    {
        Console.WriteLine("\nLIVE dry run (real Ollama, real documents — no Revit)");

        string[] layers = { "A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR",
                            "EXTERIOR-ENVELOPE", "A-ANNO", "DEFPOINTS" };

        string folder = Environment.GetEnvironmentVariable("GHOST_SOURCE_FOLDER")
                        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "ghost-docs");
        var evidence = GhostEvidence.FromFolder(folder);
        Console.WriteLine($"  evidence: {(evidence.IsEmpty ? "NONE" : $"{evidence.Sources.Count} doc(s) — {string.Join(", ", evidence.Sources)}")}");
        Ok(!evidence.IsEmpty, "the configured scoped folder yields document context");

        // The pilot's layers standard as bds-office installs it (layers@1). No project key: nothing is read from
        // or written to a layer cache, so every layer the standard does not know really reaches the model.
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "demo", "bds-pilot", "bds-layers.json"));
        var standard = LayerRulesetMatcher.FromBody(File.ReadAllText(ruleset), out string rulesetError);
        Ok(standard != null, $"the pilot's layers standard parses ({rulesetError ?? "demo/bds-pilot/bds-layers.json"})");
        if (standard == null) return;

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, standard, projectKey: "");

        MappingResult result;
        try { result = await mapper.MapLayersAsync(layers); }
        catch (Exception ex) { Ok(false, $"mapping call failed: {ex.GetType().Name}: {ex.Message}"); return; }

        var byLayer = result.Mappings.ToDictionary(m => m.CadLayer, m => m, StringComparer.OrdinalIgnoreCase);
        Console.WriteLine("  --- proposal after mapping ---");
        foreach (var m in result.Mappings)
            Console.WriteLine($"    {m.CadLayer,-20} -> {m.Category,-10} {m.BdsFamilyType ?? m.BdsFamily,-22} conf {m.Confidence:0.00}");

        Ok(!byLayer.ContainsKey("A-ANNO") && !byLayer.ContainsKey("DEFPOINTS"),
           "tier 0 drops A-ANNO + DEFPOINTS before any model call");
        Ok(byLayer.TryGetValue("A-WALL-EXT", out var ext) && ext.Category == "Walls",
           "A-WALL-EXT resolves deterministically to Walls");
        Ok(ext != null && ext.Confidence >= 1.0 && (ext.BdsFamily ?? "").StartsWith("BDS_"),
           $"A-WALL-EXT came from the BDS standard, not the keyword fallback (got '{ext?.BdsFamily}' @ {ext?.Confidence:0.00})");
        Ok(byLayer.TryGetValue("A-FLOR", out var flr) && flr.Category == "Floors",
           "A-FLOR resolves deterministically to Floors");
        Ok(byLayer.ContainsKey("EXTERIOR-ENVELOPE"),
           "the non-standard layer came back from the local model at all");
        if (byLayer.TryGetValue("EXTERIOR-ENVELOPE", out var env))
            Ok(env.Category == "Walls",
               $"the model read the spec and called EXTERIOR-ENVELOPE a Wall (got '{env.Category}')");

        // The P2 payload: does the spec's FR60 actually come back attached to the external walls?
        try { await llm.EnrichParamsAsync(result); }
        catch (Exception ex) { Ok(false, $"parameter pass failed: {ex.GetType().Name}: {ex.Message}"); return; }

        Console.WriteLine("  --- parameters lifted from the documents ---");
        bool any = false;
        foreach (var m in result.Mappings.Where(m => m.Params is { Count: > 0 }))
        {
            any = true;
            Console.WriteLine($"    {m.CadLayer,-20} {string.Join(" · ", m.Params.Select(p => $"{p.Name} = {p.Value}"))}");
            if (!string.IsNullOrWhiteSpace(m.Rationale)) Console.WriteLine($"      why: {m.Rationale}");
        }
        if (!any) Console.WriteLine("    (none)");

        Ok(any, "the parameter pass returned at least one document-derived value");
        Ok(result.Mappings.All(m => m.Params == null ||
               m.Params.All(p => !new[] { "rationale", "why", "reason", "source", "sourcedoc", "note" }
                                  .Contains(p.Name.Trim().ToLowerInvariant()))),
           "no meta field leaked in as a Revit parameter name");
        var extParams = byLayer.TryGetValue("A-WALL-EXT", out var e2) ? e2.Params : null;
        Ok(extParams != null && extParams.Any(p => p.Value != null && p.Value.Contains("60")),
           "the external walls carry the spec's FR60 rating");
    }
}
