using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Export Revit sheets to PNG for the web "Sheets" viewer. Sheets are Revit-proprietary presentation
/// (titleblock + viewports + annotations) and do NOT survive IFC export — so the only way to view them on
/// the web is to render them here, in the plugin, and push the images. Each <see cref="ViewSheet"/> becomes
/// one high-resolution PNG plus a manifest.json; the files land in %AppData%\Sentinel\sheets\&lt;model&gt;\,
/// which the Bridge serves to the web app. No dialogs — callers surface the result.
/// </summary>
public static class SheetExporter
{
    /// <summary>Root the Bridge serves sheets from. One sub-folder per model (by document title).</summary>
    public static string SheetsRoot()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "sheets");
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// Render every printable sheet in <paramref name="doc"/> to a PNG and write a manifest. Returns the
    /// number exported, the output folder, and an error message if the whole run failed. Never throws.
    /// </summary>
    public static (int count, string dir, string? error) ExportAll(Document doc)
    {
        string setName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title));
        string outDir = Path.Combine(SheetsRoot(), setName);

        try
        {
            // Fresh folder each run so deleted/renamed sheets don't linger.
            if (Directory.Exists(outDir)) { try { Directory.Delete(outDir, true); } catch { /* best-effort */ } }
            Directory.CreateDirectory(outDir);

            var sheets = new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet)).Cast<ViewSheet>()
                .Where(s => !s.IsPlaceholder)
                .OrderBy(s => s.SheetNumber, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var entries = new List<string>();
            foreach (var sheet in sheets)
            {
                string? file = ExportOne(doc, sheet, outDir);
                if (file is null) continue;
                entries.Add(
                    "{\"id\":" + JsonStr(sheet.Id.ToString()) +
                    ",\"number\":" + JsonStr(sheet.SheetNumber) +
                    ",\"name\":" + JsonStr(sheet.Name) +
                    ",\"file\":" + JsonStr(file) + "}");
            }

            string manifest =
                "{\"set\":" + JsonStr(setName) +
                ",\"title\":" + JsonStr(doc.Title) +
                ",\"exportedAt\":" + JsonStr(DateTime.Now.ToString("o")) +
                ",\"count\":" + entries.Count +
                ",\"sheets\":[" + string.Join(",", entries) + "]}";
            File.WriteAllText(Path.Combine(outDir, "manifest.json"), manifest, Encoding.UTF8);

            return (entries.Count, outDir, null);
        }
        catch (Exception ex)
        {
            return (0, outDir, ex.Message);
        }
    }

    /// <summary>
    /// Render a single sheet. Revit decorates image filenames with the view name, so we export into a clean
    /// temp folder, then take the one PNG produced and copy it out under a predictable &lt;number&gt;.png.
    /// </summary>
    private static string? ExportOne(Document doc, ViewSheet sheet, string outDir)
    {
        string tmp = Path.Combine(outDir, "_tmp");
        try
        {
            if (Directory.Exists(tmp)) Directory.Delete(tmp, true);
            Directory.CreateDirectory(tmp);

            var opts = new ImageExportOptions
            {
                ExportRange = ExportRange.SetOfViews,
                ZoomType = ZoomFitType.FitToPage,
                PixelSize = 2400,                 // ~2400px on the fit axis — crisp at zoom, still small
                FitDirection = FitDirectionType.Horizontal,
                FilePath = Path.Combine(tmp, "sheet"),
                HLRandWFViewsFileType = ImageFileType.PNG,
                ShadowViewsFileType = ImageFileType.PNG,
            };
            opts.SetViewsAndSheets(new List<ElementId> { sheet.Id });
            doc.ExportImage(opts);

            var produced = Directory.GetFiles(tmp, "*.png");
            if (produced.Length == 0) return null;

            string file = Sanitize(sheet.SheetNumber) + ".png";
            File.Copy(produced[0], Path.Combine(outDir, file), true);
            return file;
        }
        catch
        {
            return null; // a single bad sheet must not abort the whole set
        }
        finally
        {
            try { Directory.Delete(tmp, true); } catch { /* best-effort */ }
        }
    }

    private static string JsonStr(string? s)
    {
        s ??= "";
        var sb = new StringBuilder(s.Length + 2).Append('"');
        foreach (char ch in s)
        {
            switch (ch)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch < ' ') sb.Append("\\u").Append(((int)ch).ToString("x4"));
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.Append('"').ToString();
    }

    private static string Sanitize(string s)
    {
        foreach (char ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "Sheet" : s;
    }
}
