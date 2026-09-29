using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>One sheet of a run: what was exported, and — once Publish Sheets proposed it — what the bridge answered.</summary>
public sealed class SheetOut
{
    public string Id = "", Number = "", Name = "", ViewportsJson = "[]";
    public string? Png, Pdf, Revision;
    public string? NotExported;                     // why the sheet has no image (nothing else is done with it)
    public string? PdfMissing;                      // why the sheet has no PDF (it is shown, never proposed)
    // What /propose answered (item 5 Phase A, spec 2026-09-29 2d-sheets-midp), when it was asked.
    public string? ContainerName, Verdict, VersionId, VersionRevision, Midp, Refusal, ProposalError;
}

/// <summary>A run of <see cref="SheetExporter.ExportAll"/>.</summary>
public sealed class SheetRun
{
    public string SetName = "", OutDir = "";
    public string? Error;                           // the whole run failed
    public List<SheetOut> Sheets = new();
}

/// <summary>
/// Export Revit sheets for the web "Sheets" viewer and, from Revit 2022, as the drawings the MIDP plans. Sheets are
/// Revit-proprietary presentation (titleblock + viewports + annotations) and do NOT survive IFC export — so they are
/// rendered here: one high-resolution PNG per <see cref="ViewSheet"/> for the viewer, one PDF per sheet as the
/// deliverable, and a manifest.json in %AppData%\Sentinel\sheets\&lt;model&gt;\, which the Bridge serves to the web app.
/// A sheet that fails is named with its reason, never dropped silently. No dialogs — callers surface the result.
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
    /// Render every printable sheet in <paramref name="doc"/> to a PNG (and a PDF from Revit 2022). The manifest is
    /// written by <see cref="WriteManifest"/>, once the caller has proposed the sheets. Never throws.
    /// </summary>
    public static SheetRun ExportAll(Document doc)
    {
        var run = new SheetRun { SetName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title)) };
        run.OutDir = Path.Combine(SheetsRoot(), run.SetName);
        try
        {
            // Fresh folder each run so deleted/renamed sheets don't linger.
            if (Directory.Exists(run.OutDir)) { try { Directory.Delete(run.OutDir, true); } catch { /* best-effort */ } }
            Directory.CreateDirectory(run.OutDir);

            var sheets = new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet)).Cast<ViewSheet>()
                .Where(s => !s.IsPlaceholder)
                .OrderBy(s => s.SheetNumber, StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (var sheet in sheets)
            {
                var o = new SheetOut { Id = sheet.Id.ToString(), Number = sheet.SheetNumber, Name = sheet.Name, Revision = RevisionOf(sheet) };
                o.Png = ExportPng(doc, sheet, run.OutDir, out o.NotExported);
                if (o.Png is null) { run.Sheets.Add(o); continue; }
                o.ViewportsJson = ViewportsJson(doc, sheet);
#if REVIT2022_OR_GREATER
                o.Pdf = ExportPdf(doc, sheet, run.OutDir, out o.PdfMissing);
#else
                o.PdfMissing = "PDF export needs Revit 2022 or later";
#endif
                run.Sheets.Add(o);
            }
        }
        catch (Exception ex)
        {
            run.Error = ex.Message;
        }
        return run;
    }

    /// <summary>The manifest the Bridge serves: every exported sheet, with what its proposal answered.</summary>
    public static void WriteManifest(Document doc, SheetRun run)
    {
        var entries = run.Sheets.Where(s => s.Png != null).Select(s =>
            "{\"id\":" + JsonStr(s.Id) +
            ",\"number\":" + JsonStr(s.Number) +
            ",\"name\":" + JsonStr(s.Name) +
            ",\"file\":" + JsonStr(s.Png) +
            Opt("pdf", s.Pdf) + Opt("revision", s.Revision) + Opt("container_name", s.ContainerName) +
            Opt("verdict", s.Verdict) + Opt("version_id", s.VersionId) + Opt("midp", s.Midp) + Opt("refusal", s.Refusal) +
            Opt("proposal_error", s.ProposalError ?? (s.PdfMissing is null ? null : "not proposed — " + s.PdfMissing)) +
            ",\"viewports\":" + s.ViewportsJson + "}").ToList();

        string manifest =
            "{\"set\":" + JsonStr(run.SetName) +
            ",\"title\":" + JsonStr(doc.Title) +
            ",\"project\":" + JsonStr(ProjectContext.For(doc).Key) +
            ",\"exportedAt\":" + JsonStr(DateTime.Now.ToString("o")) +
            ",\"count\":" + entries.Count +
            ",\"sheets\":[" + string.Join(",", entries) + "]}";
        File.WriteAllText(Path.Combine(run.OutDir, "manifest.json"), manifest, Encoding.UTF8);
    }

    /// <summary>The sheet's current revision (P01, C02 …) as its parameter reads, when it has one the bridge accepts
    /// (1–16 characters); else null — the version is then numbered by the CDE.</summary>
    private static string? RevisionOf(ViewSheet sheet)
    {
        string? r = sheet.get_Parameter(BuiltInParameter.SHEET_CURRENT_REVISION)?.AsString()?.Trim();
        return string.IsNullOrEmpty(r) || r!.Length > 16 ? null : r;
    }

    /// <summary>
    /// Render a single sheet. Revit decorates image filenames with the view name, so we export into a clean
    /// temp folder, then take the one PNG produced and copy it out under a predictable &lt;number&gt;.png.
    /// </summary>
    private static string? ExportPng(Document doc, ViewSheet sheet, string outDir, out string? why)
    {
        why = null;
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
            if (produced.Length == 0) { why = "Revit wrote no image for it"; return null; }

            string file = Sanitize(sheet.SheetNumber) + ".png";
            File.Copy(produced[0], Path.Combine(outDir, file), true);
            return file;
        }
        catch (Exception ex)
        {
            why = ex.Message; // a single bad sheet must not abort the whole set — it is named in the result
            return null;
        }
        finally
        {
            try { Directory.Delete(tmp, true); } catch { /* best-effort */ }
        }
    }

#if REVIT2022_OR_GREATER
    /// <summary>One PDF of the sheet, named &lt;number&gt;.pdf — the deliverable proposed to the CDE.</summary>
    private static string? ExportPdf(Document doc, ViewSheet sheet, string outDir, out string? why)
    {
        why = null;
        try
        {
            string baseName = Sanitize(sheet.SheetNumber);
            var opts = new PDFExportOptions { Combine = true, FileName = baseName };
            if (!doc.Export(outDir, new List<ElementId> { sheet.Id }, opts)) { why = "Revit did not export the PDF"; return null; }
            string file = baseName + ".pdf";
            if (!File.Exists(Path.Combine(outDir, file))) { why = "Revit wrote no " + file; return null; }
            return file;
        }
        catch (Exception ex)
        {
            why = "the PDF was not exported: " + ex.Message;
            return null;
        }
    }
#endif

    /// <summary>
    /// Per-viewport metadata for the web "click a drawing → isolate its level in 3D" link. Each viewport
    /// carries its view name/type, the associated level (for plan views, via GenLevel — the coordinate-free
    /// key the web matches against IfcBuildingStorey names), and its rectangle on the sheet as fractions
    /// [0..1] of the titleblock extent (so the web can overlay a hotspot regardless of image scale).
    /// </summary>
    private static string ViewportsJson(Document doc, ViewSheet sheet)
    {
        // Titleblock bbox = the sheet rectangle, in sheet coordinates — the basis for the 0..1 fractions.
        var tb = new FilteredElementCollector(doc, sheet.Id)
            .OfCategory(BuiltInCategory.OST_TitleBlocks).WhereElementIsNotElementType().FirstElement();
        var tbb = tb?.get_BoundingBox(sheet);
        if (tbb is null) return "[]"; // no titleblock → can't place hotspots; sheet still shows as an image

        double w = tbb.Max.X - tbb.Min.X, h = tbb.Max.Y - tbb.Min.Y;
        if (w <= 1e-9 || h <= 1e-9) return "[]";

        var items = new List<string>();
        foreach (var vpId in sheet.GetAllViewports())
        {
            if (doc.GetElement(vpId) is not Viewport vp) continue;
            if (doc.GetElement(vp.ViewId) is not View view) continue;

            var ol = vp.GetBoxOutline();
            XYZ mn = ol.MinimumPoint, mx = ol.MaximumPoint;
            double fx = Clamp01((mn.X - tbb.Min.X) / w);
            double fw = Clamp01((mx.X - mn.X) / w);
            double fy = Clamp01((tbb.Max.Y - mx.Y) / h); // invert Y: sheet is bottom-up, images are top-down
            double fh = Clamp01((mx.Y - mn.Y) / h);

            string level = view is ViewPlan vpl && vpl.GenLevel is { } lv ? lv.Name : "";

            items.Add(
                "{\"view\":" + JsonStr(view.Name) +
                ",\"type\":" + JsonStr(view.ViewType.ToString()) +
                ",\"level\":" + JsonStr(level) +
                ",\"fx\":" + Num(fx) + ",\"fy\":" + Num(fy) +
                ",\"fw\":" + Num(fw) + ",\"fh\":" + Num(fh) + "}");
        }
        return "[" + string.Join(",", items) + "]";
    }

    private static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;
    private static string Num(double v) => v.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
    private static string Opt(string key, string? value) => value is null ? "" : ",\"" + key + "\":" + JsonStr(value);

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
