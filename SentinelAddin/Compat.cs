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

    /// MA-8-14: the loaded Toposolid types named <paramref name="typeName"/> (case aside), matched by type name only; <paramref name="familyName"/> is accepted for the
    /// caller's label. None before Revit 2024. The caller says none / more than one in words; Sentinel creates no types.
    public static List<ElementType> TerrainTypes(Document doc, string? familyName, string typeName)
    {
#if REVIT2024_OR_GREATER
        return new FilteredElementCollector(doc).OfClass(typeof(ToposolidType)).Cast<ElementType>()
            .Where(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)) // MA-8-14 review: no FamilyName match - Toposolid is one system family and its FamilyName is localised
            .ToList();
#else
        return new List<ElementType>();
#endif
    }

    /// MA-8-14 review round 2: the rim points and the loop-vertex raise (review round 1) are not spiked - K-1c reads them back. false is the spike's proven route
    /// (lift, offset, CurveLoop) alone: a one-line revert if K-1c fails them (then TerrainPlanner.Shape's rim clause goes too).
    public static readonly bool TerrainRim = true;

    /// MA-8-14 (the spike, K-1b): the ground as one Toposolid. Created with the CurveLoop overload - an outer axis-aligned rectangle around the points and the
    /// footprint (+ 1 m), the inner loop the storey's footprint (the hole) - because the points-only overload spans the building. The points are lifted by -o and the
    /// Toposolid's Height Offset From Level is then set to o (o = the lowest point less the level, less 10 mm, never above 0: TerrainPlanner.OffsetMm): the type's thickness never limits the relief
    /// and no type is created. A point's z is the absolute model elevation (mm) in the Level.Elevation frame, moved to the internal z by the level's ProjectElevation less its Elevation (as the mass, Amendment 3). The caller's Transaction is the one Undo step.
    /// Review round 1: a loop vertex carries no point and would stay at the top face (the lowest point less 10 mm) - a trench round the building and a sunken rim - so rim
    /// points go in 50 mm inside each loop (TerrainPlanner.RimPoints) and every loop vertex is raised to its nearest ground point's z by the slab shape editor.
    public static Element CreateTerrain(Document doc, IReadOnlyList<double[]> pointsMm, IReadOnlyList<double[]> footprintMm, ElementId typeId, Level level)
    {
#if REVIT2024_OR_GREATER
        const double mm = 1.0 / 304.8;
        double dz = level.ProjectElevation - level.Elevation; // the Level.Elevation frame -> the internal z (a Survey Point base, or a moved base point, makes them differ)
        // review round 3: the arithmetic is TerrainPlanner's (pure, run on values by promote-check); o is clamped to 0 there - why is said on OffsetMm
        double o = Sentinel.GhostBuilder.TerrainPlanner.OffsetMm(pointsMm.Min(p => p[2]), level.Elevation * 304.8) * mm;
        var outerMm = Sentinel.GhostBuilder.TerrainPlanner.OuterRect(pointsMm, footprintMm, 1000);
        var ringMm = Sentinel.GhostBuilder.TerrainPlanner.AnticlockwiseRing(footprintMm); // the hole, anticlockwise like the outer loop
        double z = level.ProjectElevation;
        CurveLoop Loop(List<double[]> l) => CurveLoop.Create(Enumerable.Range(0, l.Count)
            .Select(i => (Curve)Line.CreateBound(new XYZ(l[i][0] * mm, l[i][1] * mm, z), new XYZ(l[(i + 1) % l.Count][0] * mm, l[(i + 1) % l.Count][1] * mm, z))).ToList());
        // review round 1: the rim - 50 mm inside the outer loop and 50 mm outside the hole, each at its nearest ground point's z
        var rim = !TerrainRim ? Enumerable.Empty<double[]>()
            : Sentinel.GhostBuilder.TerrainPlanner.RimPoints(outerMm, pointsMm, 50).Concat(Sentinel.GhostBuilder.TerrainPlanner.RimPoints(ringMm, pointsMm, -50));
        var lifted = pointsMm.Concat(rim).Select(p => new XYZ(p[0] * mm, p[1] * mm, p[2] * mm + dz - o)).ToList();
        var ts = Toposolid.Create(doc, new List<CurveLoop> { Loop(outerMm), Loop(ringMm) }, lifted, typeId, level.Id);
        var offset = ts.get_Parameter(BuiltInParameter.TOPOSOLID_HEIGHTABOVELEVEL_PARAM);
        if (offset == null || offset.IsReadOnly) throw new InvalidOperationException("this Toposolid has no settable Height Offset From Level — the ground cannot be put at its own height; nothing was placed");
        if (!offset.Set(o)) throw new InvalidOperationException($"the Toposolid's Height Offset From Level could not be set to {o * 304.8:0} mm — the ground would stand that far off the scan; nothing was placed");
        if (!TerrainRim) return ts;
        // review round 1: each loop vertex (no point on it) raised from the top face (level + o, internal) to its nearest ground point's z
        // review round 2: regenerated first (the spike read the editor's vertices only after a Regenerate), and fail closed - every loop corner is found, or nothing is placed
        doc.Regenerate();
        var editor = ts.GetSlabShapeEditor();
        double top = level.ProjectElevation + o;
        var loopVerts = editor.IsEnabled ? editor.SlabShapeVertices.Cast<SlabShapeVertex>().Where(v => v.VertexType != SlabShapeVertexType.Interior).ToList() : new List<SlabShapeVertex>();
        if (loopVerts.Count < outerMm.Count + ringMm.Count)
            throw new InvalidOperationException($"the Toposolid's loop corners could not be read ({loopVerts.Count} of {outerMm.Count + ringMm.Count}) — the ground at the building and the rim would stand at the lowest point; nothing was placed");
        foreach (var v in loopVerts)
            editor.ModifySubElement(v, Sentinel.GhostBuilder.TerrainPlanner.NearestZ(pointsMm, v.Position.X / mm, v.Position.Y / mm) * mm + dz - top);
        // final verification round 1: the raise's offset reference (the top face) is unspiked - every loop vertex is read back after a Regenerate and must stand within
        // 5 mm of its ground point, or the transaction rolls back (fail closed: if Revit measures the offset otherwise, K-1c sees this refusal, never a wall round the edge)
        doc.Regenerate();
        foreach (var v in ts.GetSlabShapeEditor().SlabShapeVertices.Cast<SlabShapeVertex>().Where(v => v.VertexType != SlabShapeVertexType.Interior))
        {
            double want = Sentinel.GhostBuilder.TerrainPlanner.NearestZ(pointsMm, v.Position.X / mm, v.Position.Y / mm) * mm + dz, off = (v.Position.Z - want) / mm;
            if (Math.Abs(off) > 5)
                throw new InvalidOperationException($"the Toposolid's edge at ({v.Position.X / mm:0}, {v.Position.Y / mm:0}) mm read back {off:0} mm off its ground point — Revit did not take the raise; nothing was placed");
        }
        return ts;
#else
        throw new NotSupportedException("a terrain is a Toposolid — Revit 2024 and later");
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
