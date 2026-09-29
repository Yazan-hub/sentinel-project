using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Engine;

public enum ParamKind { Lookup, BuiltIn, WallFunction, ElementName }
public enum ValueKind { Text, YesNo, Number }

public sealed class ParamCandidate
{
    public ParamKind Kind;
    public string Name;   // Lookup: the parameter name · BuiltIn: the BuiltInParameter enum name · else ""
    public bool InstanceOnly;  // read/write this lookup on the INSTANCE only — never fall through to the type
    public ParamCandidate(ParamKind kind, string name = "", bool instanceOnly = false)
    { Kind = kind; Name = name; InstanceOnly = instanceOnly; }
}

public sealed class PsetEntry
{
    public string Pset = "";                       // "" ⇒ an attribute (@Prop)
    public string Prop = "";
    public string Key => Pset.Length == 0 ? "@" + Prop : Pset + "." + Prop;
    public string[] Classes = Array.Empty<string>(); // IFC classes this is read/written for; empty = all
    public List<ParamCandidate> Candidates = new();
    public ValueKind ValueKind = ValueKind.Text;
}

/// <summary>
/// ONE table for READ (GovernedElementExtractor) and WRITE (FixInPlaceService): a value is written exactly
/// where the referee reads it. The office-specific rows derive from <paramref name="org"/> (Ruleset.Org);
/// an empty org DROPS them rather than guessing a prefix. Revit-free — the Revit half resolves candidates
/// against real parameters.
/// </summary>
public static class PsetMap
{
    public static IReadOnlyList<PsetEntry> Entries(string? org)
    {
        var o = (org ?? "").Trim();
        var list = new List<PsetEntry>();
        if (o.Length > 0)
            list.Add(new PsetEntry
            {
                Pset = "Pset_" + o, Prop = "Discipline",
                Candidates = { new(ParamKind.Lookup, o + "_Discipline"), new(ParamKind.Lookup, "Discipline") },
            });
        list.Add(new PsetEntry
        {
            Pset = "Pset_WallCommon", Prop = "IsExternal", Classes = new[] { "IFCWALL" }, ValueKind = ValueKind.YesNo,
            // IsExternal is read on the instance only, then the wall type's Function — the pre-table order.
            Candidates = { new(ParamKind.Lookup, "IsExternal", instanceOnly: true), new(ParamKind.WallFunction) },
        });
        list.Add(new PsetEntry
        {
            Pset = "Pset_WallCommon", Prop = "FireRating", Classes = new[] { "IFCWALL" },
            Candidates = { new(ParamKind.Lookup, "FireRating"), new(ParamKind.BuiltIn, "FIRE_RATING") },
        });
        list.Add(new PsetEntry
        {
            Pset = "Pset_DoorCommon", Prop = "FireRating", Classes = new[] { "IFCDOOR" },
            // A door's rating is the type's DOOR_FIRE_RATING ("Fire Rating" under Identity Data). FIRE_RATING
            // stays as a fallback for templates that map it, but it comes AFTER the door-specific one.
            Candidates = { new(ParamKind.Lookup, "FireRating"), new(ParamKind.BuiltIn, "DOOR_FIRE_RATING"), new(ParamKind.BuiltIn, "FIRE_RATING") },
        });
        var u = new PsetEntry
        {
            Pset = "Pset_WindowCommon", Prop = "ThermalTransmittance", Classes = new[] { "IFCWINDOW" }, ValueKind = ValueKind.Number,
            Candidates =
            {
                new(ParamKind.Lookup, "ThermalTransmittance"), new(ParamKind.Lookup, "U-Value"),
                new(ParamKind.Lookup, "Heat Transfer Coefficient (U)"),
            },
        };
        if (o.Length > 0) u.Candidates.Add(new(ParamKind.Lookup, o + "_UValue"));
        list.Add(u);
        list.Add(new PsetEntry { Prop = "Name", Candidates = { new(ParamKind.ElementName) } });
        return list;
    }

    public static PsetEntry? Find(string? org, string requirementKey) =>
        Entries(org).FirstOrDefault(e => string.Equals(e.Key, (requirementKey ?? "").Trim(), StringComparison.OrdinalIgnoreCase));

    /// PRE-E2: the contract's required property names ("FireRating" or "Pset_DoorCommon.FireRating") → the Revit reads
    /// Sentinel knows for them (one bare name can map to several classes; each entry once), plus the names it has no
    /// mapping for — the caller reports those as not checked, never as passed.
    public static (IReadOnlyList<PsetEntry> Mapped, IReadOnlyList<string> Unmapped) ForRequired(string? org, IEnumerable<string> names)
    {
        var entries = Entries(org);
        var mapped = new List<PsetEntry>();
        var unmapped = new List<string>();
        foreach (var n in names.Select(x => (x ?? "").Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var hits = n.IndexOf('.') >= 0   // net48 has no string.Contains(char)
                ? entries.Where(e => string.Equals(e.Key, n, StringComparison.OrdinalIgnoreCase)).ToList()
                : entries.Where(e => e.Pset.Length > 0 && string.Equals(e.Prop, n, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0) unmapped.Add(n);
            else mapped.AddRange(hits.Where(h => !mapped.Contains(h)));
        }
        return (mapped, unmapped);
    }
}
