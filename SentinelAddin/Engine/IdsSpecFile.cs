using System;
using System.IO;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// The project's installed IDS artefact that the bridge judges against. This file is only what Revit reports
/// in its dialog until cohesion phase 4; the bridge resolves project IDS first, then office, then client, then none.
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
