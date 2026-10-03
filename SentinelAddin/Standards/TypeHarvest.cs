using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Standards;

/// <summary>
/// MA-2a: the pure half of Build Office System's wider harvest — the words a catalogue row carries for the layer-free rules,
/// spelled once for the add-in and read by the bridge as text. Pure (no Revit), so tools/ghost-standards-check pins them.
/// </summary>
public static class TypeHarvest
{
    /// <summary>Revit's WallFunction values (Interior 0 … Coreshaft 5), by name — the Function a wall, floor, door or window type
    /// carries (FUNCTION_PARAM, an Integer). Written as the enum NAME in the enum's own spelling (Autodesk.Revit.DB.WallFunction:
    /// Interior, Exterior, Foundation, Retaining, Soffit, Coreshaft — read by reflection on Revit 2024's RevitAPI.dll; Promote's
    /// wt.Function.ToString() writes the same), never the localized value string, so a rule written as `Function: Exterior` reads
    /// the same on a German Revit. Null for a value outside the enum: nothing is written.</summary>
    public static string? FunctionName(int value) => value switch
    {
        0 => "Interior", 1 => "Exterior", 2 => "Foundation", 3 => "Retaining", 4 => "Soffit", 5 => "Coreshaft", _ => null,
    };

    /// <summary>A type's build-up materials as one label — distinct names in the order given (finish layers first, as
    /// NamingManagerService.LayerMaterials lists them), joined " / ": "Stone / Concrete Masonry Units". Null when there are none,
    /// so no `Material` is written. A rule matches it by substring (`Material: STONE`).</summary>
    public static string? MaterialLabel(IEnumerable<string?>? names)
    {
        var list = (names ?? Enumerable.Empty<string?>()).Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n!.Trim()).Distinct().ToList();
        return list.Count == 0 ? null : string.Join(" / ", list);
    }
}
