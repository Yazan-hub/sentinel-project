using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    static string RepoRoot()
    {
        var r = AppContext.BaseDirectory;
        for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(r, "SentinelAddin")); i++) r = Path.GetFullPath(Path.Combine(r, ".."));
        return r;
    }

    // A complete layers@n body; each refusal below breaks exactly one thing in it.
    const string Good = "{\"standard\":\"Office layers v1\",\"enforce\":\"warn\",\"ignore\":[\"*-ANNO\",\"0\"]," +
        "\"layers\":[{\"layer\":\"A-WALL-EXT\",\"category\":\"Walls\",\"family\":\"Office_Wall_Ext\",\"aliases\":[\"WALL-EXT\"]}," +
        "{\"layer\":\"A-DOOR\",\"category\":\"Doors\"}]}";
    const string Categories = "Walls | Floors | Ceilings | Doors | Windows | Columns | Furniture";

    // What the bridge hands over for an installed kind@1 (the harness never calls a bridge here).
    static ResolvedArtefact Installed(string kind, string body) => new()
    {
        Kind = kind, Ref = kind + "@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = "bridge",
        Label = ArtefactClient.RefLabel(kind + "@1", "office", Sha),
    };
    static ResolvedArtefact NotNeeded(string kind) => ArtefactClient.None(kind, "not needed by this command");

    static void Refused(string body, string want, string name)
    {
        var m = LayerRulesetMatcher.FromBody(body, out var error);
        Ok(m is null && error == want, name + " → " + want);
        if (m is not null || error != want) Console.WriteLine("        got: " + (m is null ? error : "a matcher"));
    }

    // ── 3. layers@n: parsed by the bridge validator's rules; a row of it is the standard, a guess is a heuristic ─
    static void Layers()
    {
        Console.WriteLine("\nLayers — layers@n by the bridge validator's rules; only its rows are the standard\n");
        var root = RepoRoot();
        var m = LayerRulesetMatcher.FromBody(Good, out var error);
        Ok(m is { HasStandard: true, Sha: null } && error is null, "a complete body parses (the sha is GhostStandards' to set)");
        foreach (var f in Directory.EnumerateFiles(Path.Combine(root, "demo"), "*layers.json", SearchOption.AllDirectories)
                     .Append(Path.Combine(root, "config", "base-standard", "layers.json")))
            Ok(LayerRulesetMatcher.FromBody(File.ReadAllText(f), out var e) is { HasStandard: true }, $"{Path.GetRelativePath(root, f)} parses: it installs as layers@n{(e is null ? "" : " — " + e)}");
        Ok(LayerRulesetMatcher.FromBody(Good.Replace("\"Office_Wall_Ext\"", "null").Replace("[\"WALL-EXT\"]", "null").Replace("[\"*-ANNO\",\"0\"]", "null"), out _) is not null,
           "family, aliases and ignore may be null (optional = absent or null, as the bridge)");

        Refused("null", "the body is null", "JSON null");
        Refused("[]", "the body must be a JSON object", "an array");
        Refused("  ", "the body is empty", "an empty body");
        Ok(LayerRulesetMatcher.FromBody("{\"standard\":", out var jsonError) is null && jsonError is { Length: > 0 }, "broken JSON → none with the parser's message");
        Refused(Good.Replace("\"standard\":\"Office layers v1\",", ""), "standard must be a non-empty string", "no standard");
        Refused(Good.Replace("\"Office layers v1\"", "\" \""), "standard must be a non-empty string", "a blank standard");
        Refused("{\"standard\":\"S\",\"layers\":[]}", "layers must be a non-empty array", "no layer rows");
        Refused("{\"standard\":\"S\",\"layers\":{}}", "layers must be a non-empty array", "layers not an array");
        Refused(Good.Replace("{\"layer\":\"A-DOOR\",\"category\":\"Doors\"}", "\"A-DOOR\""), "layers[1] must be an object", "a row that is not an object");
        Refused(Good.Replace("\"layer\":\"A-DOOR\"", "\"layer\":\"\""), "layers[1].layer must be a non-empty string", "a blank layer");
        Refused(Good.Replace("\"Doors\"", "\"Stairs\""), "layers[1].category must be " + Categories, "a category Ghost cannot build");
        Refused(Good.Replace("\"Doors\"", "\"doors\""), "layers[1].category must be " + Categories, "a lower-case category (the bridge is case-sensitive)");
        Refused(Good.Replace("\"Office_Wall_Ext\"", "7"), "layers[0].family must be a string", "a family that is not text");
        Refused(Good.Replace("[\"WALL-EXT\"]", "\"WALL-EXT\""), "layers[0].aliases must be an array of strings", "aliases not an array");
        Refused(Good.Replace("[\"*-ANNO\",\"0\"]", "[0]"), "ignore must be an array of strings", "an ignore entry that is not text");

        // what each row says it is
        Ok(m!.Match("a-wall-ext ") is { Source: "standard", Category: "Walls", BdsFamily: "Office_Wall_Ext", Confidence: 1.0, CadLayer: "a-wall-ext " },
           "an exact row is the standard (1.0), case- and space-insensitive, on the DWG's own layer string");
        Ok(m.Match("WALL-EXT") is { Source: "standard", Confidence: 0.95, Rationale: "layers standard: alias of A-WALL-EXT" }, "an alias is the standard (.95) and says whose alias");
        Ok(m.Match("A-DOOR") is { Source: "standard", BdsFamily: "Generic Door" }, "a row without a family builds the generic family, still a row of the standard");
        Ok(m.Match("A-FLOR-PATT") is { Source: "heuristic", Category: "Floors", Confidence: 0.7 }, "an AIA major that is not a row is a heuristic guess (.7), never the standard");
        Ok(m.Match("EXT-PARTITION") is { Source: "heuristic", Category: "Walls" } kw && kw.Rationale.StartsWith("heuristic: "), "a keyword hit is a heuristic guess, and says so");
        Ok(m.Match("EXTERIOR-ENVELOPE") is null, "a layer nothing recognises is left for the local model");
        Ok(m.ShouldIgnore("A-ANNO") && m.ShouldIgnore("0") && m.ShouldIgnore("X-DIMS-1") && !m.ShouldIgnore("A-WALL-EXT"), "the standard's ignore globs and the built-in net both drop annotation");

        var h = LayerRulesetMatcher.HeuristicsOnly();
        Ok(h is { HasStandard: false, Sha: null } && h.Match("A-WALL-EXT") is { Source: "heuristic", Category: "Walls" } && h.ShouldIgnore("DEFPOINTS") && h.ShouldIgnore("A-ANNO-TEXT"),
           "no layers installed: the net and the guesses stay, every guess labelled heuristic");

        // what GhostStandards hands a build: the matcher with its sha, or heuristics and a none naming the field
        var ok = GhostStandards.FromResolved(Installed("layers", Good), NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(ok.Layers is { HasStandard: true, Sha: Sha } && ok.LayersSource.Label == "layers@1 · office · 0123456789ab…", "an installed layers@n maps, stamped with its sha, labelled");
        var bad = GhostStandards.FromResolved(Installed("layers", Good.Replace("\"Doors\"", "\"Stairs\"")), NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(bad.Layers is { HasStandard: false, Sha: null } && bad.LayersSource is { Kind: "layers", Origin: "none", Ref: null }
           && bad.LayersSource.Label == "none — layers@1 · office · 0123456789ab… did not parse: layers[1].category must be " + Categories,
           "a body the matcher cannot use is none naming the artefact and the field; heuristics map");
        var none = ArtefactClient.None("layers", "not installed for aster-tower or its office");
        var absent = GhostStandards.FromResolved(none, NotNeeded("guideline"), NotNeeded("type_catalog"));
        Ok(!absent.Layers.HasStandard && ReferenceEquals(absent.LayersSource, none) && absent.Header.StartsWith("Layers: none — not installed for aster-tower or its office · "),
           "none stays none: heuristics only, and the header says so");
    }

    // The local model, faked: records what it was asked, answers "Walls" for each, or fails.
    sealed class FakeModel : ILayerMapper
    {
        public readonly List<string> Asked = new();
        public Exception? Fail;
        public Task<MappingResult> MapLayersAsync(IEnumerable<string> cadLayers, CancellationToken ct = default)
        {
            var layers = cadLayers.ToList();
            Asked.AddRange(layers);
            return Fail != null
                ? Task.FromException<MappingResult>(Fail)
                : Task.FromResult(new MappingResult { Mappings = layers.Select(l => new LayerMapping { CadLayer = l, Category = "Walls", BdsFamily = "Generic Wall", Confidence = 0.8 }).ToList() });
        }
    }

    // A remembered answer file as LayerMapper writes it, under `fileKey` and `sha`, at `key`'s path.
    static void WriteCache(string key, string fileKey, string sha, params (string Layer, string Category)[] rows)
    {
        var path = LayerMapper.CachePathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var mappings = string.Join(",", rows.Select(r => $"\"{r.Layer}\":{{\"cadLayer\":\"{r.Layer}\",\"category\":\"{r.Category}\",\"bdsFamily\":\"Generic\",\"confidence\":0.9,\"source\":\"llm\"}}"));
        File.WriteAllText(path, $"{{\"key\":\"{fileKey}\",\"layers_sha\":\"{sha}\",\"mappings\":{{{mappings}}}}}");
    }

    static Dictionary<string, LayerMapping> Run(LayerMapper mapper, params string[] layers) =>
        mapper.MapLayersAsync(layers).GetAwaiter().GetResult().Mappings.ToDictionary(r => r.CadLayer, StringComparer.Ordinal);

    // ── 4. LayerMapper: standard → remembered (this project, same sha) → heuristic → local model ───────────
    static void Mapper()
    {
        Console.WriteLine("\nLayerMapper — the installed standard first; a remembered guess never outranks it\n");
        var layers = LayerRulesetMatcher.FromBody(Good, out _)!;
        layers.Sha = Sha;
        Ok(LayerMapper.CachePathFor("demo") == Path.Combine(ArtefactCache.Root, "demo", "dwg_mappings.json"), "the cache is per project: <cache root>/<key>/dwg_mappings.json");

        // demo remembers, under this layers sha, a wrong guess for A-WALL-EXT and an answer for EXT-PARTITION.
        WriteCache("demo", "demo", Sha, ("A-WALL-EXT", "Floors"), ("EXT-PARTITION", "Furniture"));
        var model = new FakeModel();
        using (var mapper = new LayerMapper(model, layers, "demo"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "EXT-PARTITION", "A-FLOR-PATT", "A-ANNO", "S-FNDN", "EXTERIOR-ENVELOPE", "a-wall-ext");
            Ok(rows["A-WALL-EXT"] is { Source: "standard", Category: "Walls" }, "the installed standard answers before the cache (the remembered 'Floors' guess is not used)");
            Ok(rows["EXT-PARTITION"] is { Source: "cache", Category: "Furniture" }, "a remembered answer under the same layers sha comes before a heuristic guess, labelled cache");
            Ok(rows["A-FLOR-PATT"] is { Source: "heuristic", Category: "Floors" }, "a layer only a heuristic recognises is a heuristic row");
            Ok(!rows.ContainsKey("A-ANNO") && !rows.ContainsKey("a-wall-ext"), "an ignored layer is no row; a layer is mapped once, whatever its case");
            Ok(model.Asked.SequenceEqual(new[] { "S-FNDN", "EXTERIOR-ENVELOPE" }) && rows["S-FNDN"].Source == "llm" && rows["EXTERIOR-ENVELOPE"].Source == "llm",
               "only what no tier above recognised goes to the local model, labelled llm");
        }
        var saved = JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("demo"))).RootElement;
        var kept = saved.GetProperty("mappings").EnumerateObject().ToList();
        Ok(saved.GetProperty("key").GetString() == "demo" && saved.GetProperty("layers_sha").GetString() == Sha
           && kept.Any(p => p.Name == "S-FNDN") && kept.Any(p => p.Name == "EXTERIOR-ENVELOPE") && kept.All(p => p.Value.GetProperty("source").GetString() == "llm"),
           "the model's answers are remembered for demo, stamped with the layers sha; standard and heuristic rows are not cached");

        var other = LayerRulesetMatcher.FromBody(Good, out _)!;
        other.Sha = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
        var model2 = new FakeModel();
        using (var mapper = new LayerMapper(model2, other, "demo"))
        {
            var rows = Run(mapper, "EXT-PARTITION", "S-FNDN");
            Ok(rows["EXT-PARTITION"].Source == "heuristic" && model2.Asked.SequenceEqual(new[] { "S-FNDN" }), "answers remembered under another layers sha are not used");
        }

        WriteCache("demo2", "someone-else", Sha, ("S-FNDN", "Floors"));
        var model3 = new FakeModel();
        using (var mapper = new LayerMapper(model3, layers, "demo2"))
            Ok(Run(mapper, "S-FNDN")["S-FNDN"].Source == "llm" && model3.Asked.Count == 1, "a file that belongs to another key is not this project's memory");

        using (var mapper = new LayerMapper(new FakeModel(), layers, ""))
            Ok(Run(mapper, "S-FNDN")["S-FNDN"].Source == "llm" && !File.Exists(LayerMapper.CachePathFor("")), "an unbound document remembers nothing");

        using (var mapper = new LayerMapper(new FakeModel(), LayerRulesetMatcher.HeuristicsOnly(), "aster-tower"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "S-FNDN");
            Ok(rows.Values.All(r => r.Source != "standard") && rows["A-WALL-EXT"].Source == "heuristic", "no layers installed: no row is a standard row");
        }
        Ok(JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("aster-tower"))).RootElement.GetProperty("layers_sha").GetString() == "none",
           "…and the cache is stamped none, so an install later starts it afresh");

        var down = new FakeModel { Fail = new HttpRequestException("No connection could be made (localhost:11434)") };
        using (var mapper = new LayerMapper(down, layers, "down"))
        {
            var rows = Run(mapper, "A-WALL-EXT", "A-FLOR-PATT", "EXTERIOR-ENVELOPE");
            Ok(rows["A-WALL-EXT"].Source == "standard" && rows["A-FLOR-PATT"].Source == "heuristic", "local model down: every deterministic row is kept");
            Ok(rows["EXTERIOR-ENVELOPE"] is { Source: "unmapped", Category: null, Confidence: 0, Rationale: "not mapped — local model unreachable (No connection could be made (localhost:11434))" },
               "…and the rest read 'not mapped — local model unreachable' instead of failing the run");
        }
        Ok(!File.Exists(LayerMapper.CachePathFor("down")), "an unmapped layer is never remembered: the model is asked again next run");

        using var esc = new CancellationTokenSource();
        esc.Cancel();
        using (var mapper = new LayerMapper(new FakeModel { Fail = new OperationCanceledException(esc.Token) }, layers, "esc"))
        {
            bool cancelled = false;
            try { mapper.MapLayersAsync(new[] { "EXTERIOR-ENVELOPE" }, esc.Token).GetAwaiter().GetResult(); }
            catch (OperationCanceledException) { cancelled = true; }
            Ok(cancelled, "ESC still cancels the run: a cancelled call is not 'unreachable'");
        }
    }

    // ── 5. GHB-5: what the reviewer chose is remembered as "reviewer" — after the installed standard, before any guess ──
    static void ReviewerMemory()
    {
        Console.WriteLine("\nLayerMapper — what the reviewer chose is remembered (GHB-5)\n");
        var layers = LayerRulesetMatcher.FromBody(Good, out _)!;
        layers.Sha = Sha;
        static bool NoValue(JsonElement row, string name) => !row.TryGetProperty(name, out var v) || v.ValueKind == JsonValueKind.Null;
        static List<ParamAssignment> Fr60() => new() { new ParamAssignment { Name = "Fire Rating", Value = "FR60" } };
        using (var mapper = new LayerMapper(new FakeModel(), layers, "rev"))
        {
            var first = Run(mapper, "A-LEVEL", "EXT-PARTITION", "EXTERIOR-ENVELOPE");
            first["EXTERIOR-ENVELOPE"].Params = Fr60(); // what EnrichParamsAsync does to the returned row, after mapping
            mapper.Remember(new[]
            {
                new LayerMapping { CadLayer = "A-LEVEL", Category = "Ceilings", BdsFamily = "Generic Ceiling", Confidence = 1, Source = "reviewer", Ignore = true },
                new LayerMapping { CadLayer = "EXT-PARTITION", Category = "Walls", BdsFamilyType = "Generic - 200mm", Confidence = 1, Source = "reviewer",
                                   Params = Fr60(), SourceDoc = "spec.pdf", Rationale = "picked by the reviewer from the types loaded in this model" },
                new LayerMapping { CadLayer = "A-WALL-EXT", Category = "Walls", BdsFamilyType = "Generic - 200mm", Confidence = 1, Source = "reviewer" },
                new LayerMapping { CadLayer = "S-FNDN", Category = "Floors", BdsFamily = "Generic Floor", Confidence = 1, Source = "llm" },
            });
        }
        var saved = JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("rev"))).RootElement.GetProperty("mappings");
        Ok(saved.GetProperty("A-LEVEL").GetProperty("source").GetString() == "reviewer" && saved.GetProperty("A-LEVEL").GetProperty("ignore").GetBoolean()
           && !saved.TryGetProperty("S-FNDN", out _),
           "Remember writes the reviewer's rows (an ignore included) to the project's cache file — and only the reviewer's");
        var ext = saved.GetProperty("EXT-PARTITION");
        Ok(NoValue(ext, "params") && NoValue(ext, "sourceDoc") && ext.GetProperty("rationale").GetString() == "your earlier review",
           "A1: a remembered choice that carried a document's params is saved without them — the choice only");
        var env = saved.GetProperty("EXTERIOR-ENVELOPE");
        Ok(env.GetProperty("source").GetString() == "llm" && NoValue(env, "params"),
           "A1: a local-model row given params after mapping is saved without them (the cache holds a copy)");

        var model = new FakeModel();
        using (var mapper = new LayerMapper(model, layers, "rev"))
        {
            var rows = Run(mapper, "A-LEVEL", "EXT-PARTITION", "A-WALL-EXT", "S-FNDN");
            Ok(rows["A-LEVEL"] is { Source: "reviewer", Ignore: true, Category: "Ceilings" }, "an ignore comes back as the reviewer's ignore — it sticks (F45's A-LEVELS)");
            Ok(rows["EXT-PARTITION"] is { Source: "reviewer", BdsFamilyType: "Generic - 200mm", Params: null },
               "a picked type comes back as the reviewer's, ahead of the heuristic guess — with no document values (A1)");
            Ok(rows["A-WALL-EXT"].Source == "standard", "the installed standard still answers first: a remembered choice never outranks layers@n");
            Ok(model.Asked.SequenceEqual(new[] { "S-FNDN" }), "a remembered choice never goes to the local model; the rest still does");
        }

        // A2: "(forget my choice)" deletes the remembered row; the next run asks the heuristic or the model again.
        using (var mapper = new LayerMapper(new FakeModel(), layers, "rev"))
            mapper.Remember(new[] { new LayerMapping { CadLayer = "A-LEVEL", Source = "reviewer", Ignore = true, Forget = true } });
        var forgot = JsonDocument.Parse(File.ReadAllText(LayerMapper.CachePathFor("rev"))).RootElement.GetProperty("mappings");
        using (var mapper = new LayerMapper(new FakeModel(), layers, "rev"))
            Ok(!forgot.TryGetProperty("A-LEVEL", out _) && forgot.TryGetProperty("EXT-PARTITION", out _)
               && Run(mapper, "A-LEVEL")["A-LEVEL"].Source != "reviewer",
               "A2: a forgotten choice is deleted from the cache (the others stay) and the layer is asked again");

        using (var mapper = new LayerMapper(new FakeModel(), layers, ""))
            mapper.Remember(new[] { new LayerMapping { CadLayer = "A-LEVEL", Source = "reviewer", Ignore = true } });
        Ok(!File.Exists(LayerMapper.CachePathFor("")), "an unbound document remembers no choice");
    }
}
