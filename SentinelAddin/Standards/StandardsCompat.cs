using Autodesk.Revit.DB;

namespace Sentinel.Standards;

/// <summary>
/// Standards-Engine slice of the Revit 2021–2027 API split (companion to <see cref="Sentinel.Compat"/>).
/// The shared-parameter data-type system changed at 2022 (ParameterType enum → ForgeTypeId/SpecTypeId);
/// every version-specific line lives here so the extractor/builder stay version-agnostic.
/// </summary>
internal static class StandardsCompat
{
    /// <summary>Create the options for a shared-parameter definition, using the type system of the target Revit.</summary>
    public static ExternalDefinitionCreationOptions NewDefinitionOptions(string name, string typeToken) =>
#if REVIT2022_OR_GREATER
        new(name, SpecFor(typeToken));
#else
        new(name, ParamTypeFor(typeToken));
#endif

#if REVIT2022_OR_GREATER
    // Compare ForgeTypeIds by their stable string id (ForgeTypeId does not overload ==).
    private static bool Is(ForgeTypeId a, ForgeTypeId b) => a.TypeId == b.TypeId;

    private static ForgeTypeId SpecFor(string t) => t switch
    {
        "Length"  => SpecTypeId.Length,
        "Number"  => SpecTypeId.Number,
        "Integer" => SpecTypeId.Int.Integer,
        "YesNo"   => SpecTypeId.Boolean.YesNo,
        "Area"    => SpecTypeId.Area,
        "Volume"  => SpecTypeId.Volume,
        "Angle"   => SpecTypeId.Angle,
        _         => SpecTypeId.String.Text,
    };

    /// <summary>Read a bound definition's data type back into the simplified token used by the pack.</summary>
    public static string TypeToken(Definition def)
    {
        var dt = def.GetDataType();
        if (Is(dt, SpecTypeId.Length)) return "Length";
        if (Is(dt, SpecTypeId.Number)) return "Number";
        if (Is(dt, SpecTypeId.Int.Integer)) return "Integer";
        if (Is(dt, SpecTypeId.Boolean.YesNo)) return "YesNo";
        if (Is(dt, SpecTypeId.Area)) return "Area";
        if (Is(dt, SpecTypeId.Volume)) return "Volume";
        if (Is(dt, SpecTypeId.Angle)) return "Angle";
        return "Text";
    }
#else
    private static ParameterType ParamTypeFor(string t) => t switch
    {
        "Length"  => ParameterType.Length,
        "Number"  => ParameterType.Number,
        "Integer" => ParameterType.Integer,
        "YesNo"   => ParameterType.YesNo,
        "Area"    => ParameterType.Area,
        "Volume"  => ParameterType.Volume,
        "Angle"   => ParameterType.Angle,
        _         => ParameterType.Text,
    };

    public static string TypeToken(Definition def) => def.ParameterType switch
    {
        ParameterType.Length  => "Length",
        ParameterType.Number  => "Number",
        ParameterType.Integer => "Integer",
        ParameterType.YesNo   => "YesNo",
        ParameterType.Area    => "Area",
        ParameterType.Volume  => "Volume",
        ParameterType.Angle   => "Angle",
        _                     => "Text",
    };
#endif
}
