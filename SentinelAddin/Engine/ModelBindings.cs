using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
#endif

namespace Sentinel.Engine;

/// <summary>
/// SEC-4 (S28): the models this PC has confirmed for a web project. A model names its web project in its own settings
/// (<see cref="ProjectContext"/>), and a model travels between offices and PCs; auto-publish and the sync's scan post send nothing for
/// a key this PC has not confirmed for that model (founder decision Q-a) — Project Setup ▸ Save confirms it. Reads, the
/// strip and a Governed Publish the person starts are unchanged. A model is its path, lower-cased (the central model's
/// path when workshared, Q-c): a copy or a Save As asks again. Kept in its own file, never in config.json, so a machine
/// save of Project Setup cannot drop it.
/// </summary>
public static class ModelBindings
{
    public sealed class Entry
    {
        [JsonPropertyName("model")] public string Model { get; set; } = "";
        [JsonPropertyName("key")] public string Key { get; set; } = "";
    }

    public static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "bound-models.json");

    public static string Normalize(string? path) => (path ?? "").Trim().ToLowerInvariant();

    /// <summary>The confirmations in <paramref name="file"/>; none when it is missing or unreadable (fails closed).</summary>
    public static List<Entry> Read(string file)
    {
        try { return File.Exists(file) ? JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(file)) ?? new List<Entry>() : new List<Entry>(); }
        catch (Exception) { return new List<Entry>(); }
    }

    public static void Write(string file, List<Entry> entries)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file, JsonSerializer.Serialize(entries, new JsonSerializerOptions { WriteIndented = true }));
    }

    public static bool IsConfirmed(IEnumerable<Entry> entries, string model, string key)
    {
        var m = Normalize(model);
        var k = (key ?? "").Trim();
        return m.Length > 0 && k.Length > 0 && entries.Any(e => Normalize(e.Model) == m && (e.Key ?? "").Trim() == k);
    }

    /// <summary>The list with <paramref name="model"/> confirmed for <paramref name="key"/> (its old key dropped); a blank key
    /// removes its confirmation.</summary>
    public static List<Entry> With(IEnumerable<Entry> entries, string model, string key)
    {
        var m = Normalize(model);
        var list = entries.Where(e => Normalize(e.Model) != m).ToList();
        var k = (key ?? "").Trim();
        if (m.Length > 0 && k.Length > 0) list.Add(new Entry { Model = m, Key = k });
        return list;
    }

    public static void Confirm(string model, string key) => Write(FilePath, With(Read(FilePath), model, key));

    /// <summary>The Doctor line when a model names a key this PC has not confirmed for it.</summary>
    public static string NotConfirmed(string what, string key) =>
        what + ": nothing sent — this model names web project \"" + key + "\", which this PC has not confirmed for it. "
        + "Sentinel ▸ Project Setup ▸ Save confirms it (a copy or a Save As of a model asks again).";

    /// <summary>The pane's line while the open model's key is not confirmed on this PC (it stands where the publish line does).</summary>
    public static string PausedLine(string key) =>
        "Auto-publish and scan posts paused on this PC — Project Setup ▸ Save confirms web project " + (key ?? "").Trim();

    /// <summary>Project Setup's note above Save, at project scope: what the save confirms.</summary>
    public static string SaveNote(string? key) =>
        "Saving confirms that this model, on this PC, publishes into " + (string.IsNullOrWhiteSpace(key) ? "the web project above" : key!.Trim()) + ".";

    private static readonly Dictionary<string, string> Said = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>True the first time <paramref name="line"/> is said for the document <paramref name="doc"/> (its path, else its
    /// title; API thread only): a Doctor line for an unconfirmed key is said once per document and key, not on every sync.</summary>
    public static bool FirstTime(string doc, string line)
    {
        if (Said.TryGetValue(doc ?? "", out var said) && said == line) return false;
        Said[doc ?? ""] = line;
        return true;
    }

#if !SENTINEL_CHECK
    /// <summary>The model's identity: the central model's path when workshared, else its own path; "" when it has no file.</summary>
    public static string IdentityOf(Document doc)
    {
        if (doc.IsWorkshared)
        {
            try
            {
                var central = doc.GetWorksharingCentralModelPath();
                if (central is not null) return Normalize(ModelPathUtils.ConvertModelPathToUserVisiblePath(central));
            }
            catch (Exception) { /* no central path: the model's own */ }
        }
        return Normalize(doc.PathName);
    }

    public static bool ConfirmedFor(Document doc, string key) => IsConfirmed(Read(FilePath), IdentityOf(doc), key);
#endif
}
