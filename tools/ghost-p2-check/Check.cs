// Offline conformance check for the P2 build-proposal contract (LocalGhostBuilder.MergeParams + the
// LayerMapping JSON shape). Compiled in isolation on net8 — GhostBuilder_Architecture.cs has no Revit
// dependency, exactly like LayerRulesetMatcher in the P1 verification.
#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Sentinel.GhostBuilder;

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

    static int Main()
    {
        Console.WriteLine("P2 build-proposal contract check\n");

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

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
