using System.Globalization;
using System.IO;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>A standard as last answered by the bridge, with its provenance. Always labelled "cached" when used
/// without the bridge's confirmation; never a source for another key.</summary>
public sealed class CachedArtefact
{
    public string Kind = "";
    public string Ref = "";
    public string Source = "";
    public string Sha256 = "";
    public string BodyJson = "";
    public DateTime FetchedAt; // UTC
}

/// <summary>
/// The machine-side artefact cache (cohesion phase 4a, decision 1): <c>%AppData%\Sentinel\cache\&lt;key&gt;\&lt;kind&gt;.json</c>
/// holding <c>{key, kind, ref, source, sha256, body, fetched_at}</c>. Not in the model file (Extensible Storage writes on
/// open dirty the document and fight for ownership in a workshared central). Pure file I/O — no Revit or HTTP types,
/// so tools/artefact-cache-check compiles it. Never throws: an unreadable or foreign file is a miss, a failed write
/// is a miss next time.
/// </summary>
public static class ArtefactCache
{
    /// <summary>Cache root. The harness points it at a temp folder; nothing else sets it.</summary>
    internal static string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "cache");

    public static string PathFor(string key, string kind) => Path.Combine(Root, Safe(key), Safe(kind) + ".json");

    // A path segment from a key/kind: invalid file-name characters become '_', and "", "." and ".." cannot
    // climb out of the root. Two keys that sanitise alike cannot read each other's copy: Read checks the stored key.
    private static string Safe(string? s)
    {
        var bad = Path.GetInvalidFileNameChars();
        var t = new string((s ?? "").Trim().Select(ch => bad.Contains(ch) ? '_' : ch).ToArray());
        return t.Trim('.').Length == 0 ? "_" + t.Replace('.', '_') : t;
    }

    public static CachedArtefact? Read(string key, string kind)
    {
        try
        {
            var path = PathFor(key, kind);
            if (!File.Exists(path)) return null;
            using var d = JsonDocument.Parse(File.ReadAllText(path));
            var r = d.RootElement;
            string? S(string n) => r.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            if (S("key") != (key ?? "").Trim() || S("kind") != (kind ?? "").Trim()) return null; // another key's copy
            var a = new CachedArtefact
            {
                Kind = S("kind")!,
                Ref = S("ref") ?? "",
                Source = S("source") ?? "",
                Sha256 = S("sha256") ?? "",
                BodyJson = r.TryGetProperty("body", out var b) && b.ValueKind == JsonValueKind.Object ? b.GetRawText() : "",
                FetchedAt = DateTime.TryParse(S("fetched_at"), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var t)
                    ? t.ToUniversalTime() : DateTime.MinValue,
            };
            // A copy without provenance is no copy: it could not be labelled honestly.
            return a.Ref.Length == 0 || a.Source.Length == 0 || a.Sha256.Length == 0 || a.BodyJson.Length == 0 ? null : a;
        }
        catch (Exception) { return null; }
    }

    public static void Write(string key, string kind, CachedArtefact a)
    {
        try
        {
            var path = PathFor(key, kind);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var body = JsonDocument.Parse(a.BodyJson);
            var json = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["key"] = (key ?? "").Trim(),
                ["kind"] = (kind ?? "").Trim(),
                ["ref"] = a.Ref,
                ["source"] = a.Source,
                ["sha256"] = a.Sha256,
                ["fetched_at"] = a.FetchedAt.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture),
                ["body"] = body.RootElement,
            });
            // ponytail: plain overwrite, no temp-file swap; a torn write reads back as a miss (Read catches), which is safe
            File.WriteAllText(path, json);
        }
        catch (Exception) { /* a cache that cannot be written is a miss next time */ }
    }

    public static void Clear(string key, string kind)
    {
        try { File.Delete(PathFor(key, kind)); } catch (Exception) { /* nothing to clear */ }
    }
}
