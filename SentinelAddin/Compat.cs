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
    };

    /// English ruleset key -> locale-invariant BuiltInCategory (INVALID if unknown).
    public static BuiltInCategory ResolveCategoryKey(string englishKey) =>
        CategoryKeys.TryGetValue(englishKey, out var bic) ? bic : BuiltInCategory.INVALID;

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
