using System;
using System.IO;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// The project IDS spec (JSON IdsSpec) the referee adjudicates against, beside the delivery contract in
/// <c>%AppData%\Sentinel</c>. Absent ⇒ null (the model is recorded, not judged). The bridge's
/// <c>SENTINEL_IDS</c> override still wins over whatever the client sends.
/// </summary>
public static class IdsSpecFile
{
    public static string Path => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "ids.json");

    public static JsonElement? Load()
    {
        try
        {
            if (!File.Exists(Path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(Path));
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }
}
