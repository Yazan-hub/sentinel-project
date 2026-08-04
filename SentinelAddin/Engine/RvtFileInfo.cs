using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// Reads a Revit file's saved version WITHOUT opening Revit, by scanning the
/// OLE container bytes for the BasicFileInfo version markers ("Format: 2023"
/// preferred, "Autodesk Revit 20xx" fallback). Pure — no Revit API, offline
/// tested by tools/rvtinfo-check. Never throws: unknown input => "".
/// ponytail: byte-scan instead of a CFB parser — the markers are UTF-16 text
/// in the first MB of every RVT/RFA since 2011; add a real CFB reader only
/// if a future format breaks this.
/// </summary>
public static class RvtFileInfo
{
    // net48's LangVersion lacks IsExternalInit (needed for `record`), so this is a plain class
    // (same shape as the brief's `sealed record Result(string SavedVersion, string Flavor)`).
    public sealed class Result
    {
        public Result(string savedVersion, string flavor) { SavedVersion = savedVersion; Flavor = flavor; }
        public string SavedVersion { get; }
        public string Flavor { get; }
    }

    private static readonly Regex FormatRx = new(@"Format:\s*(20\d\d)", RegexOptions.Compiled);
    private static readonly Regex BuildRx = new(@"Autodesk Revit (20\d\d)", RegexOptions.Compiled);

    public static Result Read(string path)
    {
        string flavor;
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".rvt": flavor = "Project"; break;
            case ".rfa": flavor = "Family"; break;
            case ".rte": flavor = "Template"; break;
            default: flavor = "Unknown"; break;
        }
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var len = (int)Math.Min(fs.Length, 4 * 1024 * 1024); // markers live early
            var buf = new byte[len];
            var read = 0;
            while (read < len) { var n = fs.Read(buf, read, len - read); if (n <= 0) break; read += n; }
            // Real BasicFileInfo text has been observed in both UTF-16LE (matches the fixture/spec) and
            // UTF-16BE (observed in real Snowdon sample RVTs) — try both rather than pick one.
            foreach (var enc in new[] { Encoding.Unicode, Encoding.BigEndianUnicode })
            {
                var text = enc.GetString(buf, 0, read);
                var m = FormatRx.Match(text);
                if (m.Success) return new Result(m.Groups[1].Value, flavor);
                m = BuildRx.Match(text);
                if (m.Success) return new Result(m.Groups[1].Value, flavor);
            }
            return new Result("", flavor);
        }
        catch { return new Result("", flavor); }
    }
}
