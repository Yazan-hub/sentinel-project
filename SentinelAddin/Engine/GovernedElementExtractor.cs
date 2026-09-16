using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Read a model's exportable elements into the IDS-ready <see cref="GovElement"/> shape the referee core
/// expects. This is the Revit side of the "propose" contract — the extracted elements are POSTed to
/// <c>/cde/:key/propose</c> and adjudicated against an IDS server-side by the SAME pure core the web app uses.
///
/// Read-only (no transaction) — safe to call on the API thread. The property mapping lives in
/// <see cref="PsetMap"/> — ONE table shared with the fix-in-place writer, so a value is written exactly where
/// it is read. The office code comes from the effective ruleset (<c>Ruleset.Org</c>) unless a caller passes
/// one. Extraction never throws; a category the model doesn't use simply yields no rows.
/// </summary>
public static class GovernedElementExtractor
{
    // Revit category → canonical IFC class (the subset that materially matters in a coordination deliverable).
    // Mirrors the exporter's default mapping; an explicit "IfcExportAs" on the element/type overrides it.
    private static readonly (BuiltInCategory cat, string ifc)[] CategoryToIfc =
    {
        (BuiltInCategory.OST_Walls, "IFCWALL"),
        (BuiltInCategory.OST_Floors, "IFCSLAB"),
        (BuiltInCategory.OST_Roofs, "IFCROOF"),
        (BuiltInCategory.OST_Ceilings, "IFCCOVERING"),
        (BuiltInCategory.OST_Doors, "IFCDOOR"),
        (BuiltInCategory.OST_Windows, "IFCWINDOW"),
        (BuiltInCategory.OST_Stairs, "IFCSTAIR"),
        (BuiltInCategory.OST_StructuralColumns, "IFCCOLUMN"),
        (BuiltInCategory.OST_Columns, "IFCCOLUMN"),
        (BuiltInCategory.OST_StructuralFraming, "IFCBEAM"),
        (BuiltInCategory.OST_StructuralFoundation, "IFCFOOTING"),
    };

    private static readonly BuiltInCategory[] ExportCategories = CategoryToIfc.Select(x => x.cat).ToArray();

    private static string OrgOrConfigured(string? org) => org ?? App.Engine?.Ruleset.Org ?? "";

    /// <summary>Extract every exportable element. Read-only.</summary>
    public static List<GovElement> Extract(Document doc, string modelId, string? org = null)
    {
        var o = OrgOrConfigured(org);
        var elements = new FilteredElementCollector(doc)
            .WherePasses(new ElementMulticategoryFilter(ExportCategories))
            .WhereElementIsNotElementType()
            .ToElements();
        return elements.Select(e => ToGovElement(e, doc, modelId, o)).ToList();
    }

    /// <summary>Extract exactly these elements (the fix-in-place check / re-check). Ids that no longer
    /// resolve are skipped — the caller compares what came back against what it asked for.</summary>
    public static List<GovElement> ExtractByIds(Document doc, string modelId, IEnumerable<ElementId> ids, string? org = null)
    {
        var o = OrgOrConfigured(org);
        var result = new List<GovElement>();
        foreach (var id in ids)
            if (doc.GetElement(id) is { } e) result.Add(ToGovElement(e, doc, modelId, o));
        return result;
    }

    private static GovElement ToGovElement(Element e, Document doc, string modelId, string org)
    {
        var cls = IfcClassOf(e, doc);
        var el = new GovElement
        {
            modelId = modelId,
            localId = e.Id.IdValue(),
            identity = new GovIdentity
            {
                GlobalId = GlobalIdOf(e),
                Name = string.IsNullOrWhiteSpace(e.Name) ? null : e.Name,
                Class = cls,
                Tag = e.Id.IdValue().ToString(),
            },
        };
        AddCanonicalPsets(e, doc, cls, el, org);
        return el;
    }

    // Explicit IfcExportAs (instance, then type) wins; else the category default; else a generic proxy.
    internal static string IfcClassOf(Element e, Document doc)
    {
        var explicitAs = FirstNonEmpty(e, "IfcExportAs")
            ?? (doc.GetElement(e.GetTypeId()) is { } et ? FirstNonEmpty(et, "IfcExportAs") : null);
        if (!string.IsNullOrWhiteSpace(explicitAs))
            return explicitAs!.Trim().ToUpperInvariant();

        long catId = e.Category?.Id.IdValue() ?? 0;
        foreach (var (cat, ifc) in CategoryToIfc)
            if ((long)(int)cat == catId) return ifc;
        return "IFCBUILDINGELEMENTPROXY";
    }

    // The IFC GlobalId Revit writes at export (BuiltInParameter.IFC_GUID) when present, else the stable
    // UniqueId — the IDS checks GlobalId presence/uniqueness, both satisfy it.
    private static string GlobalIdOf(Element e)
    {
        var g = e.get_Parameter(BuiltInParameter.IFC_GUID);
        if (g is { HasValue: true } && g.AsString() is { Length: > 0 } s) return s;
        return e.UniqueId;
    }

    // Walk the shared table: every pset entry whose IFC class applies, first candidate with a value wins.
    private static void AddCanonicalPsets(Element e, Document doc, string cls, GovElement el, string org)
    {
        foreach (var entry in PsetMap.Entries(org))
        {
            if (entry.Pset.Length == 0) continue;                                  // attributes live in identity
            if (entry.Classes.Length > 0 && Array.IndexOf(entry.Classes, cls) < 0) continue;
            var value = ReadEntry(e, doc, entry);
            if (value == null) continue;
            var group = el.psets.Find(g => g.name == entry.Pset);
            if (group == null) { group = new GovGroup { name = entry.Pset }; el.psets.Add(group); }
            group.rows.Add(new GovRow { name = entry.Prop, value = value });
        }
    }

    /// <summary>Lookups first — instance pass, then type pass, the order the inline reads always used —
    /// then the built-in / wall-function candidates in table order. Null when nothing is authored (⇒ the
    /// IDS reports it missing). Used by the fix-in-place writer to show the current value too.</summary>
    internal static string? ReadEntry(Element e, Document doc, PsetEntry entry)
    {
        var lookups = entry.Candidates.Where(c => c.Kind == ParamKind.Lookup).Select(c => c.Name).ToArray();
        if (lookups.Length > 0)
        {
            var v = entry.ValueKind == ValueKind.YesNo ? ReadYesNoInstOrType(e, doc, lookups) : ReadInstOrType(e, doc, lookups);
            if (v != null) return v;
        }
        foreach (var c in entry.Candidates)
        {
            if (c.Kind == ParamKind.BuiltIn && Enum.TryParse<BuiltInParameter>(c.Name, out var bip))
            {
                var b = ReadBip(e, bip);
                if (b != null) return b;
            }
            else if (c.Kind == ParamKind.WallFunction)
            {
                var w = ReadWallFunction(e, doc);
                if (w != null) return w;
            }
        }
        return null;
    }

    // First non-empty value among the named parameters — instance first, then the element's type.
    private static string? ReadInstOrType(Element e, Document doc, params string[] names)
    {
        foreach (var n in names) { var v = ReadString(e, n); if (v != null) return v; }
        if (doc.GetElement(e.GetTypeId()) is { } type)
            foreach (var n in names) { var v = ReadString(type, n); if (v != null) return v; }
        return null;
    }

    // A yes/no parameter as IFC expects it ("TRUE"/"FALSE"): instance first, then type.
    private static string? ReadYesNoInstOrType(Element e, Document doc, params string[] names)
    {
        foreach (var n in names) { var v = ReadYesNo(e, n); if (v != null) return v; }
        if (doc.GetElement(e.GetTypeId()) is { } type)
            foreach (var n in names) { var v = ReadYesNo(type, n); if (v != null) return v; }
        return null;
    }

    private static string? ReadYesNo(Element e, string name)
    {
        var p = e.LookupParameter(name);
        if (p is { HasValue: true } && p.StorageType == StorageType.Integer) return p.AsInteger() == 1 ? "TRUE" : "FALSE";
        return null;
    }

    // Infer IsExternal from the wall type's Function (Exterior ⇒ external). Null when not a wall / not set.
    private static string? ReadWallFunction(Element e, Document doc)
    {
        if (doc.GetElement(e.GetTypeId()) is not { } type) return null;
        var fn = type.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
        if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer)
            return fn.AsInteger() == (int)WallFunction.Exterior ? "TRUE" : "FALSE";
        return null;
    }

    private static string? ReadString(Element e, string name)
    {
        var p = e.LookupParameter(name);
        if (p is { HasValue: true })
        {
            var v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
            if (!string.IsNullOrWhiteSpace(v)) return v;
        }
        return null;
    }

    private static string? ReadBip(Element e, BuiltInParameter bip)
    {
        var p = e.get_Parameter(bip);
        if (p is { HasValue: true })
        {
            var v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
            if (!string.IsNullOrWhiteSpace(v)) return v;
        }
        return null;
    }

    private static string? FirstNonEmpty(Element e, string name)
    {
        var p = e.LookupParameter(name);
        return p is { HasValue: true } && !string.IsNullOrWhiteSpace(p.AsString()) ? p.AsString() : null;
    }
}
