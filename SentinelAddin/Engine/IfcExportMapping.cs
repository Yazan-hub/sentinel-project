using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// MA-8-6 (P1-11): the office's IFC export mapping — an <c>ifc_export@n</c> artefact the bridge validated at install
/// ({label, psets:[{name, level, classes, properties:[{name, type, revit_parameter?}]}], common_psets?}). <see cref="FromResolved"/>
/// reads it with the bridge's refusals in the bridge's words (WebApp/bridge/fixtures/ifc-export/cases.json is read by both);
/// <see cref="FileText"/> writes the Revit IFC exporter's user-defined property-set file from it, which
/// <see cref="PlatformExporter.ExportToDir"/> hands the exporter. The bridge serves no file. Pure: no Revit types, no I/O.
/// </summary>
public sealed class IfcExportMapping
{
    public sealed class Prop { public string Name = "", Type = "", RevitParameter = ""; }
    public sealed class Pset { public string Name = "", Level = "", Classes = ""; public List<Prop> Properties = new(); }

    public string Label = "";
    /// <summary>common_psets when the body states it (ExportIFCCommonPropertySets), else null — the exporter's own default stands.</summary>
    public bool? CommonPsets;
    public List<Pset> Psets = new();
    /// <summary>"ifc_export@2" and the installed body's sha256 (the <see cref="ResolvedArtefact"/>'s) — what the gate row names.</summary>
    public string Ref = "", Sha256 = "";
    /// <summary>Set when the copy read is the machine cache's (the bridge was not reached): when it was fetched, so the dialog keeps the "cached" marker.</summary>
    public DateTime? CachedAt;

    // \A…\z, not ^…$: .NET's $ also matches before a final newline, which the bridge's regexes (JS) do not.
    private static readonly Regex PsetName = new(@"\A[A-Za-z][A-Za-z0-9_]{0,63}\z");
    private static readonly Regex PropName = new(@"\A[A-Za-z][A-Za-z0-9_ ]{0,63}\z");
    private static readonly Regex IfcClass = new(@"\AIfc[A-Z][A-Za-z0-9]*\z");

    // The Revit 2027 exporter's data-type list (DefaultUserDefinedParameterSets.txt); WebApp/bridge/artefact-store.mjs IFC_EXPORT_TYPES is the same list.
    private static readonly HashSet<string> Types = new(("Acceleration AngularVelocity Area AreaDensity Boolean ClassificationReference ColorTemperature Count Currency " +
        "DynamicViscosity ElectricCurrent ElectricVoltage Energy ElectricalEfficacy Force Frequency HeatFluxDensity HeatingValue Identifier Illuminance Integer IonConcentration " +
        "IsothermalMoistureCapacity Label Length LinearForce LinearMoment LinearStiffness LinearVelocity Logical LuminousFlux LuminousIntensity Mass MassDensity MassFlowRate " +
        "MassPerLength ModulusOfElasticity MoistureDiffusivity MomentOfInertia NormalisedRatio Numeric PlanarForce PlaneAngle PositiveLength PositivePlaneAngle PositiveRatio Power " +
        "Pressure Ratio Real RotationalFrequency SoundPower SoundPressure SpecificHeatCapacity Text ThermalConductivity ThermalExpansionCoefficient ThermalResistance " +
        "ThermalTransmittance ThermodynamicTemperature Time Torque VaporPermeability Volume VolumetricFlowRate WarpingConstant").Split(' '), StringComparer.Ordinal);

    private static InvalidDataException Bad(string path, string want) => new($"{path} {want}");

    // Blank as the bridge's filled() reads it (the DeliveryContract.Text rule): char.IsWhiteSpace (U+0085 included) plus U+FEFF.
    private static bool Filled(string s) => s.Any(ch => !char.IsWhiteSpace(ch) && ch != '﻿');

    /// <summary>A resolved ifc_export@n → (the mapping, null); none installed → (null, null); a body the bridge would have refused →
    /// (null, "ifc_export@n · … did not parse: …"). The publish is refused on the last (an export without the office's psets would misstate the deliverable).
    /// "none" is "nothing installed" only when the bridge said so (NotInstalled / NoProject); a timeout, an unreachable or erroring bridge with no cache,
    /// or a 4100 that does not know the kind is not that answer — refused the same way, never read as "the office has none".</summary>
    public static (IfcExportMapping? Mapping, string? Error) FromResolved(ResolvedArtefact src)
    {
        if (src.Origin == "none")
            return src.NotInstalled || src.NoProject ? (null, null)
                 : (null, $"ifc_export could not be read ({src.Reason}) — the bridge did not confirm whether an export mapping is installed");
        var m = FromBody(src.BodyJson, out var error);
        if (m is null) return (null, $"{src.Label} did not parse: {error}");
        m.Ref = src.Ref ?? ""; m.Sha256 = src.Sha256 ?? ""; if (src.Origin == "cache") m.CachedAt = src.FetchedAt;
        return (m, null);
    }

    /// <summary>The body → the mapping, or null with the bridge's words in <paramref name="error"/> (what follows "ifc_export: ").</summary>
    public static IfcExportMapping? FromBody(string? json, out string? error)
    {
        error = null;
        try
        {
            using var doc = JsonDocument.Parse(json ?? "");
            var o = doc.RootElement;
            if (o.ValueKind != JsonValueKind.Object) throw Bad("body", "must be an object");
            foreach (var p in o.EnumerateObject())
                if (p.Name != "label" && p.Name != "psets" && p.Name != "common_psets")
                    throw Bad(p.Name, "is not an ifc_export field — the body is {label, psets, common_psets?}");
            var m = new IfcExportMapping();
            if (!o.TryGetProperty("label", out var lb) || lb.ValueKind != JsonValueKind.String || !Filled(lb.GetString()!) || lb.GetString()!.Length > 300) throw Bad("label", "must be 1 to 300 characters");
            m.Label = lb.GetString()!;
            if (o.TryGetProperty("common_psets", out var cp) && cp.ValueKind != JsonValueKind.Null)
                m.CommonPsets = cp.ValueKind is JsonValueKind.True or JsonValueKind.False ? cp.GetBoolean() : throw Bad("common_psets", "must be true or false");
            if (!o.TryGetProperty("psets", out var ps) || ps.ValueKind != JsonValueKind.Array || ps.GetArrayLength() is 0 or > 64) throw Bad("psets", "must be an array of 1 to 64 property sets");
            int i = 0;
            var setNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in ps.EnumerateArray())
            {
                var at = $"psets[{i++}]";
                if (s.ValueKind != JsonValueKind.Object) throw Bad(at, "must be an object");
                foreach (var p in s.EnumerateObject())
                    if (p.Name is not ("name" or "level" or "classes" or "properties"))
                        throw Bad($"{at}.{p.Name}", "is not a property-set field — a set is exactly {name, level, classes, properties}");
                var set = new Pset();
                if (!s.TryGetProperty("name", out var n) || n.ValueKind != JsonValueKind.String || !PsetName.IsMatch(n.GetString()!)) throw Bad(at + ".name", "must be letters, digits and _ only, starting with a letter, up to 64 characters");
                set.Name = n.GetString()!;
                if (!setNames.Add(set.Name)) throw Bad(at + ".name", "repeats another property set's name — each set name is used once (compared without case)");
                if (!s.TryGetProperty("level", out var lv) || lv.ValueKind != JsonValueKind.String || lv.GetString() is not ("instance" or "type")) throw Bad(at + ".level", "must be \"instance\" or \"type\"");
                set.Level = lv.GetString()!;
                if (!s.TryGetProperty("classes", out var cl) || cl.ValueKind != JsonValueKind.Array || cl.GetArrayLength() is 0 or > 32
                    || cl.EnumerateArray().Any(c => c.ValueKind != JsonValueKind.String || !IfcClass.IsMatch(c.GetString()!)))
                    throw Bad(at + ".classes", "must be 1 to 32 IFC classes in the exporter's spelling (IfcWall, not IFCWALL)");
                set.Classes = string.Join(",", cl.EnumerateArray().Select(c => c.GetString()));
                if (!s.TryGetProperty("properties", out var pr) || pr.ValueKind != JsonValueKind.Array || pr.GetArrayLength() is 0 or > 64) throw Bad(at + ".properties", "must be an array of 1 to 64 properties");
                int j = 0;
                var propNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var q in pr.EnumerateArray())
                {
                    var pat = $"{at}.properties[{j++}]";
                    if (q.ValueKind != JsonValueKind.Object) throw Bad(pat, "must be an object");
                    foreach (var p in q.EnumerateObject())
                        if (p.Name is not ("name" or "type" or "revit_parameter"))
                            throw Bad($"{pat}.{p.Name}", "is not a property field — a property is exactly {name, type, revit_parameter?}");
                    var prop = new Prop();
                    if (!q.TryGetProperty("name", out var pn) || pn.ValueKind != JsonValueKind.String || !PropName.IsMatch(pn.GetString()!)) throw Bad(pat + ".name", "must be letters, digits, _ and spaces only, starting with a letter, up to 64 characters");
                    prop.Name = pn.GetString()!;
                    if (!propNames.Add(prop.Name)) throw Bad(pat + ".name", "repeats another property in this set — each property name is used once per set (compared without case)");
                    if (!q.TryGetProperty("type", out var pt) || pt.ValueKind != JsonValueKind.String || !Types.Contains(pt.GetString()!)) throw Bad(pat + ".type", "must be a data type the Revit IFC exporter knows (Text, Label, Boolean, Integer, Real, Length …)");
                    prop.Type = pt.GetString()!;
                    if (q.TryGetProperty("revit_parameter", out var rp) && rp.ValueKind != JsonValueKind.Null)
                    {
                        // One line with no tab: the file is tab-separated, so either would add psets (injection).
                        if (rp.ValueKind != JsonValueKind.String || rp.GetString()!.Length is 0 or > 256 || rp.GetString()!.IndexOfAny(new[] { '\t', '\r', '\n' }) >= 0)
                            throw Bad(pat + ".revit_parameter", "must be one line of 1 to 256 characters with no tab or line break");
                        prop.RevitParameter = rp.GetString()!;
                    }
                    set.Properties.Add(prop);
                }
                m.Psets.Add(set);
            }
            return m;
        }
        catch (Exception e) when (e is InvalidDataException or JsonException)
        {
            error = e is JsonException ? "the body is not JSON (" + e.Message + ")" : e.Message;
            return null;
        }
    }

    /// <summary>The exporter's file: <c>PropertySet:&lt;TAB&gt;Name&lt;TAB&gt;I|T&lt;TAB&gt;IfcClass,IfcClass</c> and
    /// <c>&lt;TAB&gt;Prop&lt;TAB&gt;DataType[&lt;TAB&gt;RevitParam]</c>, CRLF, after two # header lines naming the artefact and its sha.</summary>
    public string FileText()
    {
        static string One(string s) => new string(s.Where(ch => ch >= ' ').ToArray()); // Ref and Sha come from the bridge; a header is one line whatever they hold
        var sb = new StringBuilder();
        sb.Append("# Sentinel IFC export mapping — written for this export from ").Append(One(Ref.Length > 0 ? Ref : "ifc_export")).Append("; edit the artefact, not this file.\r\n");
        sb.Append("# sha256 ").Append(One(Sha256)).Append("\r\n");
        foreach (var s in Psets)
        {
            sb.Append("PropertySet:\t").Append(s.Name).Append('\t').Append(s.Level == "type" ? 'T' : 'I').Append('\t').Append(s.Classes).Append("\r\n");
            foreach (var p in s.Properties)
                sb.Append('\t').Append(p.Name).Append('\t').Append(p.Type).Append(p.RevitParameter.Length > 0 ? "\t" + p.RevitParameter : "").Append("\r\n");
        }
        return sb.ToString();
    }

    // ── Standards & Build ▸ Standards ▸ IFC Export Mapping (batch 3 of the no-JSON work, spec 2026-10-19-standards-batch3-design.md) ──

    /// <summary>The window's data-type list: the common ones first, then the rest of the exporter's list in its order.</summary>
    public static readonly IReadOnlyList<string> TypeChoices = new[] { "Text", "Label", "Identifier", "Boolean", "Logical", "Integer", "Real", "Count", "Length", "Area", "Volume" }
        .Concat(Types.OrderBy(t => t, StringComparer.Ordinal)).Distinct().ToList();

    /// <summary>The IFC classes the window offers as ticks, in the exporter's spelling; any other is typed in the window's box.</summary>
    public static readonly IReadOnlyList<string> CommonClasses = new[] { "IfcWall", "IfcWallStandardCase", "IfcCurtainWall", "IfcSlab", "IfcRoof", "IfcCovering",
        "IfcDoor", "IfcWindow", "IfcColumn", "IfcBeam", "IfcMember", "IfcPlate", "IfcStair", "IfcRamp", "IfcRailing", "IfcFooting", "IfcSpace",
        "IfcFurnishingElement", "IfcBuildingElementProxy" };

    /// <summary>The body the bridge validates: exactly {label, psets, common_psets?} — the mapping is the whole body (the bridge admits no other key).</summary>
    public string ToJson()
    {
        var o = new System.Text.Json.Nodes.JsonObject { ["label"] = Label };
        var sets = new System.Text.Json.Nodes.JsonArray();
        foreach (var s in Psets)
        {
            var props = new System.Text.Json.Nodes.JsonArray();
            foreach (var p in s.Properties)
            {
                var q = new System.Text.Json.Nodes.JsonObject { ["name"] = p.Name, ["type"] = p.Type };
                if (p.RevitParameter.Length > 0) q["revit_parameter"] = p.RevitParameter;
                props.Add(q);
            }
            var classes = new System.Text.Json.Nodes.JsonArray();
            foreach (var c in s.Classes.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) classes.Add(c);
            sets.Add(new System.Text.Json.Nodes.JsonObject { ["name"] = s.Name, ["level"] = s.Level, ["classes"] = classes, ["properties"] = props });
        }
        o["psets"] = sets;
        if (CommonPsets is { } cp) o["common_psets"] = cp;
        return o.ToJsonString();
    }

    /// <summary>What the window would send, said in a person's words — or null. The window trims what was typed first; the
    /// bridge (and <see cref="FromBody"/>, its twin) stays the judge.</summary>
    public string? Problem()
    {
        if (!Filled(Label)) return "Name this mapping (for example: Client EIR 2026 property sets).";
        if (Label.Length > 300) return "The mapping's name is longer than 300 characters.";
        if (Psets.Count == 0) return "Add at least one property set.";
        if (Psets.Count > 64) return "A mapping holds at most 64 property sets.";
        var setNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < Psets.Count; i++)
        {
            var s = Psets[i];
            var what = s.Name.Length > 0 ? $"Property set “{s.Name}”" : $"Property set {i + 1}";
            if (s.Name.Length == 0) return $"{what} needs a name.";
            if (!PsetName.IsMatch(s.Name)) return $"{what}: a set name is letters, digits and _ only, starts with a letter and is at most 64 characters (no spaces).";
            if (!setNames.Add(s.Name)) return $"{what} is named twice — each set name is used once (capitals ignored).";
            if (s.Level is not ("instance" or "type")) return $"{what}: choose for each element or for its type.";
            var classes = s.Classes.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            if (classes.Length == 0) return $"{what}: tick at least one IFC class it applies to.";
            if (classes.Length > 32) return $"{what} applies to more than 32 IFC classes.";
            var odd = classes.FirstOrDefault(c => !IfcClass.IsMatch(c));
            if (odd != null) return $"{what}: “{odd}” is not an IFC class in the exporter's spelling — write it like IfcWall.";
            if (s.Properties.Count == 0) return $"{what} needs at least one property.";
            if (s.Properties.Count > 64) return $"{what} holds more than 64 properties.";
            var propNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int j = 0; j < s.Properties.Count; j++)
            {
                var p = s.Properties[j];
                var pw = p.Name.Length > 0 ? $"{what}, property “{p.Name}”" : $"{what}, property {j + 1}";
                if (p.Name.Length == 0) return $"{pw} needs a name.";
                if (!PropName.IsMatch(p.Name)) return $"{pw}: a property name is letters, digits, _ and spaces, starts with a letter and is at most 64 characters.";
                if (!propNames.Add(p.Name)) return $"{pw} is named twice in this set (capitals ignored).";
                if (!Types.Contains(p.Type)) return $"{pw}: choose its data type from the list.";
                if (p.RevitParameter.Length > 256 || p.RevitParameter.IndexOfAny(new[] { '\t', '\r', '\n' }) >= 0) return $"{pw}: the Revit parameter is one line of at most 256 characters.";
            }
        }
        return null;
    }

    /// <summary>The one-line description the dialog prints: "ifc_export@2 · 3f07a1b2c3d4… (2 property sets)".</summary>
    public string Describe() => (Ref.Length > 0 ? Ref : "ifc_export") + (Sha256.Length >= 12 ? " · " + Sha256.Substring(0, 12) + "…" : "") +
        (CachedAt is { } at ? $" (cached {at.ToLocalTime():HH:mm})" : "") +
        " (" + Psets.Count + " property set" + (Psets.Count == 1 ? "" : "s") + ")";
}
