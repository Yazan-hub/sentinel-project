using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Read a model's exportable elements into the IDS-ready <c>ElementProperties</c> shape the referee core
/// expects (<c>{ identity:{Class,GlobalId,Name,Tag}, psets:[{name,rows:[{name,value}]}], quantities:[] }</c>).
/// This is the Revit side of the "propose" contract — the extracted elements are POSTed to
/// <c>/cde/:key/propose</c> and adjudicated against an IDS server-side by the SAME pure core the web app uses.
///
/// Read-only (no transaction) — safe to call on the API thread. Mirrors <see cref="IfcPreFlightScanner"/>'s
/// category sweep and locale-invariant parameter reads. The property mapping is deliberately FOCUSED on the
/// checks a BDS Stage-3 IDS makes (element Name, walls' IsExternal, doors' FireRating) — the canonical IFC
/// pset names the IDS references — and is easy to extend as the delivery contract grows. Extraction never
/// throws; a category the model doesn't use simply yields no rows.
/// </summary>
public static class GovernedElementExtractor
{
    public sealed class Row { public string name = ""; public string value = ""; }
    public sealed class Group { public string name = ""; public List<Row> rows = new(); }

    public sealed class Identity
    {
        public string? GlobalId { get; set; }
        public string? Name { get; set; }
        public string? Class { get; set; }
        public string? Tag { get; set; }
    }

    /// <summary>One proposed element, serialized straight into the propose payload's <c>elements[]</c>.</summary>
    public sealed class GovElement
    {
        public string modelId { get; set; } = "";
        public int localId { get; set; }
        public Identity identity { get; set; } = new();
        public List<Group> psets { get; set; } = new();
        public List<Group> quantities { get; set; } = new();
    }

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

    /// <summary>Extract every exportable element as an <see cref="GovElement"/>. Read-only.</summary>
    public static List<GovElement> Extract(Document doc, string modelId)
    {
        var outList = new List<GovElement>();
        var filter = new ElementMulticategoryFilter(ExportCategories);
        var elements = new FilteredElementCollector(doc)
            .WherePasses(filter)
            .WhereElementIsNotElementType()
            .ToElements();

        foreach (var e in elements)
        {
            var cls = IfcClassOf(e, doc);
            var el = new GovElement
            {
                modelId = modelId,
                localId = (int)e.Id.IdValue(),
                identity = new Identity
                {
                    GlobalId = GlobalIdOf(e),
                    Name = string.IsNullOrWhiteSpace(e.Name) ? null : e.Name,
                    Class = cls,
                    Tag = e.Id.IdValue().ToString(),
                },
            };
            AddCanonicalPsets(e, doc, cls, el);
            outList.Add(el);
        }
        return outList;
    }

    // Explicit IfcExportAs (instance, then type) wins; else the category default; else a generic proxy.
    private static string IfcClassOf(Element e, Document doc)
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

    // Emit ONLY the canonical psets a BDS Stage-3 IDS references, so pset-name matching is exact:
    //   IFCWALL → Pset_WallCommon.IsExternal   ·   IFCDOOR → Pset_DoorCommon.FireRating
    private static void AddCanonicalPsets(Element e, Document doc, string cls, GovElement el)
    {
        if (cls == "IFCWALL")
        {
            var isExternal = ReadIsExternal(e, doc);
            if (isExternal != null)
                el.psets.Add(new Group { name = "Pset_WallCommon", rows = { new Row { name = "IsExternal", value = isExternal } } });
        }
        else if (cls == "IFCDOOR")
        {
            var fire = ReadString(e, "FireRating") ?? ReadBip(e, BuiltInParameter.FIRE_RATING) ?? ReadTypeString(e, doc, "FireRating");
            if (fire != null)
                el.psets.Add(new Group { name = "Pset_DoorCommon", rows = { new Row { name = "FireRating", value = fire } } });
        }
    }

    // IsExternal as IFC expects it ("TRUE"/"FALSE"): an explicit yes/no "IsExternal" param wins; else infer
    // from the wall type's Function (Exterior ⇒ external). Null when neither is authored (⇒ IDS reports it missing).
    private static string? ReadIsExternal(Element e, Document doc)
    {
        var p = e.LookupParameter("IsExternal");
        if (p is { HasValue: true } && p.StorageType == StorageType.Integer)
            return p.AsInteger() == 1 ? "TRUE" : "FALSE";

        if (doc.GetElement(e.GetTypeId()) is { } type)
        {
            var fn = type.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
            if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer)
                return fn.AsInteger() == (int)WallFunction.Exterior ? "TRUE" : "FALSE";
        }
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

    private static string? ReadTypeString(Element e, Document doc, string name) =>
        doc.GetElement(e.GetTypeId()) is { } type ? ReadString(type, name) : null;

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
