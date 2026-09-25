using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ArtefactClient, ResolvedArtefact

namespace Sentinel.Engine;

/// <summary>
/// KF-1: the IFC delivery contract a deliverable is judged by — contract@n on the document's web project, else
/// on its office (cohesion phase 4b). A plain shape: the only way to get one is <see cref="FromBody"/>, which
/// requires every field exactly as the bridge validator does, so neither the Revit gate nor the Node gate fills
/// a default and both read the same contract the same way. There is no machine file and no built-in contract:
/// nothing installed is none, and the gate says NOT CHECKED. Pure but for <see cref="Load"/> (the bridge GET),
/// so tools/gate-check compiles it.
/// </summary>
public sealed class DeliveryContract
{
    public int? SchemaVersion { get; private set; }
    /// Display name only; what judged is the artefact's kind@n · source · sha.
    public string ContractKey { get; private set; } = "";
    /// IFC2X3 | IFC4 — what the exporter can produce.
    public string IfcSchema { get; private set; } = "";
    /// Entities that MUST appear at least min_count times in the deliverable (subtypes count).
    public List<EntityRequirement> RequiredEntities { get; } = new();
    /// Property sets that must exist somewhere in the file (by name).
    public List<string> RequiredPsets { get; } = new();
    /// Properties that must exist (searched as IFCPROPERTYSINGLEVALUE names).
    public List<string> RequiredProperties { get; } = new();
    /// Entities capped by count and by share of the building elements (e.g. the proxy dumping ground).
    public List<EntityLimit> ForbiddenEntities { get; } = new();
    /// A missing georeference (IFCSITE RefLatitude/RefLongitude, or an IFCMAPCONVERSION) is a warning.
    public bool RequireGeoreference { get; private set; }

    public sealed class EntityRequirement
    {
        public string Entity { get; set; } = "";
        public int MinCount { get; set; }
    }
    public sealed class EntityLimit
    {
        public string Entity { get; set; } = "";
        public int MaxCount { get; set; }
        public double MaxRatio { get; set; }
    }

    private DeliveryContract() { } // FromBody is the only way in: an empty contract would pass every file

    // \z, not $: .NET's $ also matches before a trailing newline, the bridge's JS $ does not.
    private static readonly Regex EntityName = new(@"^IFC[A-Z0-9_]+\z", RegexOptions.CultureInvariant);

    /// <summary>A contract@n body (the raw artefact JSON) → the contract, or null with <paramref name="error"/> naming
    /// the field ("required_entities[0].min_count must be an integer from 0 to 2147483647"). Every field is required,
    /// by the bridge validator's rules (spec 2026-09-25-standards-4b decision 4); unknown fields are ignored. Never
    /// throws.</summary>
    public static DeliveryContract? FromBody(string? json, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(json)) { error = "the body is empty"; return null; }
        try
        {
            using var doc = JsonDocument.Parse(json!);
            var b = doc.RootElement;
            if (b.ValueKind == JsonValueKind.Null) throw new InvalidDataException("the body is null");
            if (b.ValueKind != JsonValueKind.Object) throw new InvalidDataException("the body must be a JSON object");

            var c = new DeliveryContract { ContractKey = Text(Field(b, "contract_key", null), "contract_key") };
            var schema = Field(b, "ifc_schema", null);
            if (schema.ValueKind != JsonValueKind.String || schema.GetString() is not ("IFC2X3" or "IFC4"))
                throw Bad("ifc_schema", "must be IFC2X3 | IFC4");
            c.IfcSchema = schema.GetString()!;

            int i = 0;
            foreach (var e in Items(b, "required_entities"))
            {
                var at = Obj(e, $"required_entities[{i++}]");
                c.RequiredEntities.Add(new EntityRequirement { Entity = Entity(e, at), MinCount = Count(e, at, "min_count") });
            }
            c.RequiredPsets.AddRange(Names(b, "required_psets"));
            c.RequiredProperties.AddRange(Names(b, "required_properties"));
            i = 0;
            foreach (var e in Items(b, "forbidden_entities"))
            {
                var at = Obj(e, $"forbidden_entities[{i++}]");
                c.ForbiddenEntities.Add(new EntityLimit { Entity = Entity(e, at), MaxCount = Count(e, at, "max_count"), MaxRatio = Ratio(e, at) });
            }
            var geo = Field(b, "require_georeference", null);
            if (geo.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw Bad("require_georeference", "must be true or false");
            c.RequireGeoreference = geo.GetBoolean();

            if (b.TryGetProperty("schema_version", out var sv) && sv.ValueKind != JsonValueKind.Null) // the one optional field: absent or null, as the bridge
                c.SchemaVersion = Whole(sv, int.MinValue) ?? throw Bad("schema_version", "must be an integer");
            return c;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return null;
        }
    }

    /// <summary>The document's contract: contract@n on its project, else on its office, else none (an empty key is
    /// "not bound"). BLOCKING (the artefact GET, ≤ 4 s): run it off the Revit UI thread. No Revit API, never throws.
    /// A body that does not parse is none with the reason — never a partial contract.</summary>
    public static (DeliveryContract? Contract, ResolvedArtefact Source) Load(string key)
    {
        try { return FromResolved(ArtefactClient.Resolve(key, "contract")); }
        catch (Exception ex) { return (null, ArtefactClient.None("contract", "the contract could not be loaded (" + ex.Message + ")")); }
    }

    /// <summary>A resolved contract@n → the contract it carries, or none naming why. The pure half of <see cref="Load"/>.</summary>
    internal static (DeliveryContract? Contract, ResolvedArtefact Source) FromResolved(ResolvedArtefact src)
    {
        if (src.Origin == "none") return (null, src);
        var c = FromBody(src.BodyJson, out var error);
        return c is null ? (null, ArtefactClient.None("contract", $"{src.Label} did not parse: {error}")) : (c, src);
    }

    private static InvalidDataException Bad(string path, string want) => new($"{path} {want}");

    // A required member: absent is "missing", never a default.
    private static JsonElement Field(JsonElement o, string name, string? at) =>
        o.TryGetProperty(name, out var v) ? v : throw Bad(at is null ? name : at + "." + name, "is missing");

    private static string Obj(JsonElement e, string at) =>
        e.ValueKind == JsonValueKind.Object ? at : throw Bad(at, "must be an object");

    private static JsonElement.ArrayEnumerator Items(JsonElement o, string name)
    {
        var v = Field(o, name, null);
        return v.ValueKind == JsonValueKind.Array ? v.EnumerateArray() : throw Bad(name, "must be an array");
    }

    // Blank as the bridge's filled() reads it: char.IsWhiteSpace plus U+FEFF, which JS \s has and .NET does not (the
    // bridge adds U+0085 for the other direction).
    private static string Text(JsonElement v, string path) =>
        v.ValueKind == JsonValueKind.String && v.GetString()!.Any(ch => !char.IsWhiteSpace(ch) && ch != '﻿') ? v.GetString()! : throw Bad(path, "must be a non-empty string");

    private static List<string> Names(JsonElement o, string name)
    {
        var list = new List<string>();
        foreach (var v in Items(o, name)) list.Add(Text(v, $"{name}[{list.Count}]"));
        return list;
    }

    private static string Entity(JsonElement e, string at)
    {
        var v = Field(e, "entity", at);
        return v.ValueKind == JsonValueKind.String && EntityName.IsMatch(v.GetString()!) ? v.GetString()! : throw Bad(at + ".entity", "must match ^IFC[A-Z0-9_]+$");
    }

    private static int Count(JsonElement e, string at, string name) =>
        Whole(Field(e, name, at), 0) ?? throw Bad(at + "." + name, "must be an integer from 0 to 2147483647");

    private static double Ratio(JsonElement e, string at)
    {
        var v = Field(e, "max_ratio", at);
        return v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var r) && r >= 0 && r <= 1 ? r : throw Bad(at + ".max_ratio", "must be a number from 0 to 1");
    }

    // A JSON whole number as the bridge reads one (Number.isInteger: 1.0 is 1), within int range; else null.
    private static int? Whole(JsonElement v, int min) =>
        v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && d == Math.Floor(d) && d >= min && d <= int.MaxValue ? (int)d : null;
}
