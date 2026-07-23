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

// Stub for the seam that lives in LayerMapper.cs (Revit-free, but pulls in the ruleset matcher).
namespace Sentinel.GhostBuilder
{
    public interface ILayerMapper
    {
        Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default);
    }
}

static class Check
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
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls", BdsFamilyType = "EXT-200", Confidence = 0.95,
                                   Params = new List<ParamAssignment> { new ParamAssignment { Name = "Fire Rating", Value = "FR60" } },
                                   Rationale = "External walls shall be FR60.", SourceDoc = "spec.pdf" },
                new LayerMapping { CadLayer = "A-GUESS",    Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.30 },
                new LayerMapping { CadLayer = "A-EMPTY",    Category = "Doors", BdsFamily = "Generic Door", Confidence = 1.00 },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["A-WALL-EXT"] = 120, ["A-GUESS"] = 7, // A-EMPTY absent => zero geometry
        };

        MappingResult emitted = null;
        var w = new GhostReviewWindow();          // constructed, never shown
        w.BuildRequested += m => emitted = m;
        w.Load(proposal, counts, "Project.rvt");

        // The gate's whole purpose: nothing is emitted until a human clicks Build.
        Ok(emitted == null, "loading a proposal emits nothing (no build without review)");

        w.Build();   // simulate the Build click with the default ticks
        Ok(emitted != null, "Build emits the approved proposal");
        var layers = emitted?.Mappings.Select(m => m.CadLayer).ToList() ?? new List<string>();
        Ok(layers.Contains("A-WALL-EXT"), "high-confidence layer with geometry is pre-ticked");
        Ok(!layers.Contains("A-GUESS"), "low-confidence layer is opt-in, not built by default");
        Ok(!layers.Contains("A-EMPTY"), "layer with no geometry is never pre-ticked");
        Ok(emitted?.Mappings.Count == 1, "only ticked rows are emitted");
        Ok(emitted?.Mappings[0].Params?[0].Value == "FR60", "approved row keeps its document-derived params");
        Ok(!ReferenceEquals(emitted, proposal), "emits a new proposal, never the unreviewed one");

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
        Ok(ev.Context.Contains("EXT-ENVELOPE-2HR"), "the non-standard layer is explained in the evidence");

        // The DXF must carry both the standard layers and the two that tier 0 has to drop.
        string dxf = File.ReadAllText(Path.Combine(sampleDir, "sample-plan.dxf"));
        foreach (string layer in new[] { "A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXT-ENVELOPE-2HR" })
            Ok(dxf.Contains(layer), $"DXF carries layer {layer}");
        Ok(dxf.Contains("A-ANNO") && dxf.Contains("DEFPOINTS"), "DXF carries the two must-be-ignored layers");

        // Empty proposal: nothing to build, and Build must stay a no-op rather than emit an empty run.
        emitted = null;
        var w2 = new GhostReviewWindow();
        w2.BuildRequested += m => emitted = m;
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>() }, counts, "Project.rvt");
        w2.Build();
        Ok(emitted == null, "empty proposal cannot be built");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
