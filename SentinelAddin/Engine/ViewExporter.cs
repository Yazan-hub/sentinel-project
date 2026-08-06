using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Export a chosen set of Revit views (plans, sections, elevations, 3D, drafting, …) to PNG for the web
/// "Views" viewer, mirroring <see cref="SheetExporter"/>. Views selected in <see cref="Sentinel.UI.ViewPickWindow"/>
/// are rendered here; the files land in %AppData%\Sentinel\views\&lt;model&gt;\, which the Bridge serves to the
/// web app. Only the selected views are exported — the folder is wiped each run, so unchecking a view and
/// republishing removes it. No dialogs — callers surface the result.
/// </summary>
public static class ViewExporter
{
    /// <summary>Root the Bridge serves views from. One sub-folder per model (by document title).</summary>
    public static string ViewsRoot()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "views");
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// Render each selected view to a PNG and write a manifest + the selection (for next time the picker
    /// opens). Returns the number exported, the output folder, and an error message if the whole run
    /// failed. Never throws.
    /// </summary>
    public static (int count, string dir, string? error) ExportSelected(Document doc, IReadOnlyList<ElementId> viewIds)
    {
        string setName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title));
        string outDir = Path.Combine(ViewsRoot(), setName);

        try
        {
            // Fresh folder each run so unchecked/deleted views don't linger.
            if (Directory.Exists(outDir)) { try { Directory.Delete(outDir, true); } catch { /* best-effort */ } }
            Directory.CreateDirectory(outDir);

            var views = viewIds
                .Select(id => doc.GetElement(id) as View)
                .Where(v => v is not null)
                .Cast<View>()
                .OrderBy(v => v.ViewType.ToString(), StringComparer.OrdinalIgnoreCase)
                .ThenBy(v => v.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var entries = new List<string>();
            var selected = new List<string>();
            foreach (var view in views)
            {
                selected.Add(view.UniqueId);
                string? file = ExportOne(doc, view, outDir);
                if (file is null) continue;

                string level = view is ViewPlan vpl && vpl.GenLevel is { } lv ? lv.Name : "";
                entries.Add(
                    "{\"id\":" + JsonStr(view.UniqueId) +
                    ",\"name\":" + JsonStr(view.Name) +
                    ",\"type\":" + JsonStr(view.ViewType.ToString()) +
                    ",\"level\":" + JsonStr(level) +
                    ",\"file\":" + JsonStr(file) + "}");
            }

            string manifest =
                "{\"set\":" + JsonStr(setName) +
                ",\"title\":" + JsonStr(doc.Title) +
                ",\"project\":" + JsonStr(SettingsManager.WebProjectKeyFor(doc)) +
                ",\"exportedAt\":" + JsonStr(DateTime.Now.ToString("o")) +
                ",\"count\":" + entries.Count +
                ",\"views\":[" + string.Join(",", entries) + "]}";
            File.WriteAllText(Path.Combine(outDir, "manifest.json"), manifest, Encoding.UTF8);

            string selectionJson = "{\"selected\":[" + string.Join(",", selected.Select(JsonStr)) + "]}";
            File.WriteAllText(Path.Combine(outDir, "selection.json"), selectionJson, Encoding.UTF8);

            return (entries.Count, outDir, null);
        }
        catch (Exception ex)
        {
            return (0, outDir, ex.Message);
        }
    }

    /// <summary>Reads back the UniqueIds ticked on the last publish, so the picker can pre-tick them.</summary>
    public static HashSet<string> ReadLastSelection(Document doc)
    {
        try
        {
            string setName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title));
            string path = Path.Combine(ViewsRoot(), setName, "selection.json");
            if (!File.Exists(path)) return new HashSet<string>();
            using var jd = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            var ids = jd.RootElement.GetProperty("selected").EnumerateArray().Select(e => e.GetString() ?? "");
            return new HashSet<string>(ids);
        }
        catch
        {
            return new HashSet<string>();
        }
    }

    /// <summary>
    /// Render a single view. Revit decorates image filenames with the view name, so we export into a clean
    /// temp folder, then take the one PNG produced and copy it out under a predictable name (mirrors
    /// SheetExporter.ExportOne; views have no SheetNumber equivalent, so the type+name is the key).
    /// </summary>
    private static string? ExportOne(Document doc, View view, string outDir)
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
                PixelSize = 2400,
                FitDirection = FitDirectionType.Horizontal,
                FilePath = Path.Combine(tmp, "view"),
                HLRandWFViewsFileType = ImageFileType.PNG,
                ShadowViewsFileType = ImageFileType.PNG,
            };
            opts.SetViewsAndSheets(new List<ElementId> { view.Id });
            doc.ExportImage(opts);

            var produced = Directory.GetFiles(tmp, "*.png");
            if (produced.Length == 0) return null;

            string file = Sanitize(view.ViewType + "_" + view.Name) + ".png";
            File.Copy(produced[0], Path.Combine(outDir, file), true);
            return file;
        }
        catch
        {
            return null; // a single bad view must not abort the whole set
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
        return string.IsNullOrWhiteSpace(s) ? "View" : s;
    }
}
