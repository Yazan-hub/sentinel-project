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
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls", BdsFamilyType = "EXT-200", Confidence = 0.95, Source = "standard",
                                   Params = new List<ParamAssignment> { new ParamAssignment { Name = "Fire Rating", Value = "FR60" } },
                                   Rationale = "External walls shall be FR60.", SourceDoc = "spec.pdf" },
                new LayerMapping { CadLayer = "A-GUESS",    Category = "Walls", BdsFamilyType = "INT-100", Confidence = 0.30, Source = "standard" },
                new LayerMapping { CadLayer = "A-EMPTY",    Category = "Doors", BdsFamily = "Generic Door", Confidence = 1.00, Source = "standard" },
            }
        };
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["A-WALL-EXT"] = 120, ["A-GUESS"] = 7, // A-EMPTY absent => zero geometry
        };

        MappingResult emitted = null;
        var w = new GhostReviewWindow();          // constructed, never shown
        w.BuildRequested += (m, _) => emitted = m;
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

        // Snowdon finding 2: LLM rows and absurd-count rows must never start ticked, even at high confidence.
        Ok(GhostReviewWindow.PreTick(10, 1.0, "standard", 0.5), "standard/1.0/10 pre-ticks");
        Ok(!GhostReviewWindow.PreTick(10, 0.9, "llm", 0.5), "llm/0.9/10 does not pre-tick");
        Ok(!GhostReviewWindow.PreTick(10000, 1.0, "standard", 0.5), "standard/1.0/10000 (absurd count) does not pre-tick");
        Ok(!GhostReviewWindow.PreTick(10, 1.0, null, 0.5), "null source does not pre-tick");

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

        // The DXF must carry both the standard layers and the two that tier 0 has to drop.
        string dxf = File.ReadAllText(Path.Combine(sampleDir, "sample-plan.dxf"));
        foreach (string layer in new[] { "A-WALL-EXT", "A-WALL-INT", "A-FLOR", "A-DOOR", "EXTERIOR-ENVELOPE" })
            Ok(dxf.Contains(layer), $"DXF carries layer {layer}");
        Ok(dxf.Contains("A-ANNO") && dxf.Contains("DEFPOINTS"), "DXF carries the two must-be-ignored layers");

        // Empty proposal: nothing to build, and Build must stay a no-op rather than emit an empty run.
        emitted = null;
        var w2 = new GhostReviewWindow();
        w2.BuildRequested += (m, _) => emitted = m;
        w2.Load(new MappingResult { Mappings = new List<LayerMapping>() }, counts, "Project.rvt");
        w2.Build();
        Ok(emitted == null, "empty proposal cannot be built");

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

        string cache = Path.Combine(Path.GetTempPath(), "ghost-live-check-cache.json");
        try { File.Delete(cache); } catch { }

        // Load the SHIPPED BDS ruleset explicitly. Without this the matcher finds no bds-layers.json next
        // to THIS tool's DLL and silently falls back to its built-in keyword heuristics — which resolve
        // "Generic Wall" at 0.70 instead of the standard's BDS_Wall_Ext at 1.00, making the dry run
        // unrepresentative of the add-in (whose deploy folder does carry Resources\bds-layers.json).
        string ruleset = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "SentinelAddin", "Resources", "bds-layers.json"));
        Ok(File.Exists(ruleset), "the shipped BDS layer ruleset is on disk");

        var llm = new LocalGhostBuilder(schemaJson: "", model: "qwen2.5:7b-instruct",
                                        ollamaUrl: "http://localhost:11434/api/generate",
                                        evidence: evidence.Context);
        using var mapper = new LayerMapper(llm, cachePath: cache,
                                           matcher: LayerRulesetMatcher.Load(ruleset));

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
