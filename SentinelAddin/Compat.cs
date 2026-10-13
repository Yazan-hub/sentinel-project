using Autodesk.Revit.DB;

namespace Sentinel;

/// <summary>
/// Single home for every Revit 2021–2027 API difference. All version-specific
/// code lives HERE — the rest of the codebase stays version-agnostic.
/// </summary>
public static class Compat
{
    /// ElementId numeric value: .Value (long) is 2024+; .IntegerValue before.
    public static long IdValue(this ElementId id) =>
#if REVIT2024_OR_GREATER
        id.Value;
#else
        id.IntegerValue;
#endif

    /// ElementId construction from a stored long.
    public static ElementId ToElementId(this long value) =>
#if REVIT2024_OR_GREATER
        new ElementId(value);
#else
        new ElementId((int)value);
#endif

    // ---------------- Terrain (MA-8-14) ----------------
    // A Toposolid exists from Revit 2024. Every Toposolid, ToposolidType and OST_Toposolid token of the add-in lives here, under the guard: the rest of the code
    // asks TerrainSupported and calls these, so the 2021-2023 builds never name a type they do not have.

    /// MA-8-14: whether this Revit has the Toposolid (2024 and later).
    public static bool TerrainSupported =>
#if REVIT2024_OR_GREATER
        true;
#else
        false;
#endif

    /// MA-8-14: the loaded Toposolid types named <paramref name="typeName"/> (case aside; <paramref name="familyName"/> too when given - a ToposolidType's family is
    /// "Toposolid"). None before Revit 2024. The caller says none / more than one in words; Sentinel creates no types.
    public static List<ElementType> TerrainTypes(Document doc, string? familyName, string typeName)
    {
#if REVIT2024_OR_GREATER
        return new FilteredElementCollector(doc).OfClass(typeof(ToposolidType)).Cast<ElementType>()
            .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)
                        && (string.IsNullOrWhiteSpace(familyName) || string.Equals(t.FamilyName, familyName, StringComparison.OrdinalIgnoreCase)))
            .ToList();
#else
        return new List<ElementType>();
#endif
    }

    /// MA-8-14 (the spike, K-1b): the ground as one Toposolid. Created with the CurveLoop overload - an outer axis-aligned rectangle around the points and the
    /// footprint (+ 1 m), the inner loop the storey's footprint (the hole) - because the points-only overload spans the building. The points are lifted by -o and the
    /// Toposolid's Height Offset From Level is then set to o (o = the lowest point less the level, less 10 mm, never above 0): the type's thickness never limits the relief
    /// and no type is created. A point's z is the absolute model elevation (mm) at create. The caller's Transaction is the one Undo step.
    public static Element CreateTerrain(Document doc, IReadOnlyList<double[]> pointsMm, IReadOnlyList<double[]> footprintMm, ElementId typeId, Level level)
    {
#if REVIT2024_OR_GREATER
        const double mm = 1.0 / 304.8;
        double o = Math.Min(0, pointsMm.Min(p => p[2]) * mm - level.Elevation - 10 * mm);
        var lifted = pointsMm.Select(p => new XYZ(p[0] * mm, p[1] * mm, p[2] * mm - o)).ToList();
        double x0 = Math.Min(pointsMm.Min(p => p[0]), footprintMm.Min(p => p[0])) * mm - 1000 * mm, x1 = Math.Max(pointsMm.Max(p => p[0]), footprintMm.Max(p => p[0])) * mm + 1000 * mm;
        double y0 = Math.Min(pointsMm.Min(p => p[1]), footprintMm.Min(p => p[1])) * mm - 1000 * mm, y1 = Math.Max(pointsMm.Max(p => p[1]), footprintMm.Max(p => p[1])) * mm + 1000 * mm;
        double z = level.Elevation;
        var outer = CurveLoop.Create(new List<Curve>
        {
            Line.CreateBound(new XYZ(x0, y0, z), new XYZ(x1, y0, z)), Line.CreateBound(new XYZ(x1, y0, z), new XYZ(x1, y1, z)),
            Line.CreateBound(new XYZ(x1, y1, z), new XYZ(x0, y1, z)), Line.CreateBound(new XYZ(x0, y1, z), new XYZ(x0, y0, z)),
        });
        // the hole, anticlockwise like the outer loop (the bridge checks the footprint is one simple loop, not which way it turns)
        var ring = footprintMm.Select(p => new XYZ(p[0] * mm, p[1] * mm, z)).ToList();
        if (ring.Count > 3 && ring[0].DistanceTo(ring[ring.Count - 1]) < 1e-9) ring.RemoveAt(ring.Count - 1);
        double area2 = 0;
        for (int i = 0; i < ring.Count; i++) area2 += ring[i].X * ring[(i + 1) % ring.Count].Y - ring[(i + 1) % ring.Count].X * ring[i].Y;
        if (area2 < 0) ring.Reverse();
        var inner = CurveLoop.Create(Enumerable.Range(0, ring.Count).Select(i => (Curve)Line.CreateBound(ring[i], ring[(i + 1) % ring.Count])).ToList());
        var ts = Toposolid.Create(doc, new List<CurveLoop> { outer, inner }, lifted, typeId, level.Id);
        var offset = ts.get_Parameter(BuiltInParameter.TOPOSOLID_HEIGHTABOVELEVEL_PARAM);
        if (offset == null || offset.IsReadOnly) throw new InvalidOperationException("this Toposolid has no settable Height Offset From Level - the ground cannot be put at its own height; nothing was placed");
        offset.Set(o);
        return ts;
#else
        throw new NotSupportedException("a terrain is a Toposolid - Revit 2024 and later");
#endif
    }

    // ---------------- Localization resiliency ----------------
    // Ruleset JSON stores category scopes as ENGLISH keys; localized Revit
    // (German "Türen", French "Portes", ...) breaks Category.Name comparison.
    // Resolve through locale-invariant BuiltInCategory instead.
    private static readonly Dictionary<string, BuiltInCategory> CategoryKeys =
        new(StringComparer.OrdinalIgnoreCase)
    {
        ["Doors"] = BuiltInCategory.OST_Doors,
        ["Windows"] = BuiltInCategory.OST_Windows,
        ["Walls"] = BuiltInCategory.OST_Walls,
        ["Floors"] = BuiltInCategory.OST_Floors,
        ["Ceilings"] = BuiltInCategory.OST_Ceilings,
        ["Roofs"] = BuiltInCategory.OST_Roofs,
        ["Furniture"] = BuiltInCategory.OST_Furniture,
        ["Casework"] = BuiltInCategory.OST_Casework,
        ["Plumbing Fixtures"] = BuiltInCategory.OST_PlumbingFixtures,
        ["Specialty Equipment"] = BuiltInCategory.OST_SpecialityEquipment,
        ["Generic Models"] = BuiltInCategory.OST_GenericModel,
        ["Lighting Fixtures"] = BuiltInCategory.OST_LightingFixtures,
        ["Mechanical Equipment"] = BuiltInCategory.OST_MechanicalEquipment,
        ["Electrical Equipment"] = BuiltInCategory.OST_ElectricalEquipment,
        ["Electrical Fixtures"] = BuiltInCategory.OST_ElectricalFixtures,
        ["Structural Columns"] = BuiltInCategory.OST_StructuralColumns,
        ["Structural Framing"] = BuiltInCategory.OST_StructuralFraming,
        ["Structural Foundations"] = BuiltInCategory.OST_StructuralFoundation,
        ["Columns"] = BuiltInCategory.OST_Columns,
        ["Curtain Panels"] = BuiltInCategory.OST_CurtainWallPanels,
        ["Curtain Wall Mullions"] = BuiltInCategory.OST_CurtainWallMullions,
        ["Parking"] = BuiltInCategory.OST_Parking,
        ["Planting"] = BuiltInCategory.OST_Planting,
        ["Site"] = BuiltInCategory.OST_Site,
        ["Stairs"] = BuiltInCategory.OST_Stairs,
        ["Railings"] = BuiltInCategory.OST_StairsRailing,
        // MA-1a item 6: a guideline's placement block names a workset for these two.
        ["Levels"] = BuiltInCategory.OST_Levels,
        ["Grids"] = BuiltInCategory.OST_Grids,
    };

    /// English ruleset key -> locale-invariant BuiltInCategory (INVALID if unknown).
    public static BuiltInCategory ResolveCategoryKey(string englishKey) =>
        CategoryKeys.TryGetValue(englishKey, out var bic) ? bic : BuiltInCategory.INVALID;

    /// MA-2a (BOS-5): a category's BuiltInCategory as its enum name ("OST_Walls"), from its id on every Revit version (a built-in
    /// category's id is its negative enum value; no 2023+ API). Null for a category Revit does not define (a subcategory, an
    /// imported or custom one) — nothing is written for it.
    public static string? BicNameOf(Category category)
    {
        long id = category.Id.IdValue();
        if (id >= 0 || id < int.MinValue) return null;
        var bic = (BuiltInCategory)(int)id;
        return Enum.IsDefined(typeof(BuiltInCategory), bic) ? bic.ToString() : null;
    }

    /// MA-2a (BOS-5): the English key Sentinel's rules use for a category whose BuiltInCategory is one of CategoryKeys ("Walls" for
    /// OST_Walls, whatever the display language), else the category's display name — what a harvest writes as `category`.
    public static string CategoryKeyOf(Category category)
    {
        long id = category.Id.IdValue();
        foreach (var kv in CategoryKeys)
            if ((long)(int)kv.Value == id) return kv.Key;
        return category.Name;
    }

    /// Locale-safe test: does this category match an English ruleset key?
    /// Compares by BuiltInCategory id first; falls back to (localized) name so
    /// unmapped custom keys still behave as before on English installs.
    public static bool MatchesCategoryKey(this Category category, string englishKey)
    {
        var bic = ResolveCategoryKey(englishKey);
        if (bic != BuiltInCategory.INVALID)
            return category.Id.IdValue() == (long)(int)bic;
        return string.Equals(category.Name, englishKey, StringComparison.OrdinalIgnoreCase);
    }

    /// Locale-invariant type name for rule matching: prefers the ElementType
    /// name (stable, user-authored) over localized family/system names.
    public static string RuleTargetName(this Element element)
    {
        if (element is ElementType et) return et.Name;
        var doc = element.Document;
        var typeId = element.GetTypeId();
        if (typeId != ElementId.InvalidElementId && doc.GetElement(typeId) is ElementType t)
            return t.Name;
        return element.Name;
    }
}
