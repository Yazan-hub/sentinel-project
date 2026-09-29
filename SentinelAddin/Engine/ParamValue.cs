using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>SCAN-E1 (read part): whether a parameter holds a value, by its storage type. AsString() returns null for
/// Integer/Double/ElementId storage, so a filled number or a Yes/No set to "No" read as EMPTY and was flagged
/// (audit 2026-09-30). Instance first, then the element's type — the order GovernedElementExtractor.ReadEntry uses.</summary>
public static class ParamValue
{
    public static bool IsFilled(Parameter? p) => p is { HasValue: true } && p.StorageType switch
    {
        StorageType.String => !string.IsNullOrWhiteSpace(p.AsString()),
        StorageType.Integer or StorageType.Double => true,
        StorageType.ElementId => p.AsElementId() != ElementId.InvalidElementId,
        _ => false,
    };

    public static bool Filled(Element e, string name) =>
        IsFilled(e.LookupParameter(name))
        || (e.Document.GetElement(e.GetTypeId()) is { } type && IsFilled(type.LookupParameter(name)));
}
