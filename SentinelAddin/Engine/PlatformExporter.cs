using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// The silent, reusable "export the model to the Sentinel outbox" step, shared by the manual
/// Publish-to-Platform command and the automatic push-on-save service (<see cref="AutoPublish"/>).
/// Writes an IFC into %AppData%\Sentinel\outbox, which the Node Bridge watches and uploads to That Open
/// Platform. No dialogs here — callers decide how (or whether) to surface the result, so the same code
/// path serves both an interactive command and a background save hook.
/// </summary>
public static class PlatformExporter
{
    public enum State { Ok, MissingOrEmpty, Locked, Failed }

    /// <summary>The outbox the Bridge watches. Persistent (NOT %TEMP%) so files survive until uploaded.</summary>
    public static string OutboxDir()
    {
        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sentinel", "outbox");
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>Append a line to %AppData%\Sentinel\publish.log — the publish path's diagnostic trail.</summary>
    public static void Log(string line)
    {
        try
        {
            string path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "publish.log");
            File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {line}\r\n");
        }
        catch { /* logging must never break a publish */ }
    }

    /// <summary>
    /// Export <paramref name="doc"/> to IFC in the outbox. When <paramref name="filterViewId"/> is a valid
    /// GEOMETRY view, only that view's content is exported; a sheet/schedule/legend active view is swapped
    /// for the default 3D view (a cover sheet once produced a 6 KB "model"). Never throws — returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToOutbox(
        Document doc, ElementId? filterViewId = null)
    {
        // Sheets (and schedules etc.) export a near-empty IFC — swap any non-geometry view for default 3D.
        if (filterViewId is { } fv && doc.GetElement(fv) is View fview &&
            (fview is ViewSheet || fview.ViewType is ViewType.DrawingSheet or ViewType.Schedule
             or ViewType.Legend or ViewType.DraftingView))
        {
            filterViewId = Default3DView(doc);
        }

        string ifcName = Sanitize(Path.GetFileNameWithoutExtension(doc.Title)) + ".ifc";
        // Sidecar FIRST: the outbox watcher can win the race on a large export (it saw a 150 MB IFC
        // stabilize before a post-export sidecar write landed) and then register the version under
        // the wrong project. Written before the IFC exists, the association can never be missed.
        WriteOutboxMeta(ifcName, doc);
        var result = ExportToDir(doc, filterViewId, OutboxDir(), ifcName);
        if (result.state != State.Ok)
        {
            try { File.Delete(Path.Combine(OutboxDir(), ifcName + ".meta.json")); } catch { /* best-effort */ }
        }
        return result;
    }

    /// <summary>
    /// Sidecar next to an outbox IFC telling the Bridge which web project the file belongs to
    /// (the ACC-style association) — and, for a linked model, which HOST file it nests under in the
    /// web file tree. The watcher reads it, uses it for the Supabase-side registration, and deletes
    /// it with the IFC. Best-effort — a missing sidecar just means the bridge's default project.
    /// </summary>
    public static void WriteOutboxMeta(string ifcName, Document doc, string? hostIfcName = null)
    {
        try
        {
            var key = SettingsManager.WebProjectKeyFor(doc);
            var json = "{\"project\":" + System.Text.Json.JsonSerializer.Serialize(key) +
                       ",\"docTitle\":" + System.Text.Json.JsonSerializer.Serialize(doc.Title) +
                       (hostIfcName is null ? "" : ",\"host\":" + System.Text.Json.JsonSerializer.Serialize(hostIfcName)) + "}";
            File.WriteAllText(Path.Combine(OutboxDir(), ifcName + ".meta.json"), json);
        }
        catch { /* association is best-effort; the upload itself must never fail on this */ }
    }

    /// <summary>
    /// Export each LOADED linked model as its own IFC into the outbox, tagged with the host file so the
    /// web app nests them under the main model. Revit refuses to export a linked (read-only) document
    /// ("no open transaction") AND refuses to open a file that is currently loaded as a link — so each
    /// link is UNLOADED, opened as a real document, exported, closed, and RELOADED. Never throws —
    /// returns (exported, skipped) counts for the caller's dialog; every step lands in publish.log.
    /// </summary>
    public static (int exported, int skipped) ExportLinksToOutbox(Document hostDoc, string hostIfcName)
    {
        int done = 0, skipped = 0;
        var app = hostDoc.Application;
        var seenTypes = new HashSet<ElementId>();
        var instances = new FilteredElementCollector(hostDoc)
            .OfClass(typeof(RevitLinkInstance)).Cast<RevitLinkInstance>().ToList();
        Log($"links: {instances.Count} RevitLinkInstance(s) in {hostDoc.Title}");

        foreach (var li in instances)
        {
            var typeId = li.GetTypeId();
            if (!seenTypes.Add(typeId)) continue;                       // one export per link, not per instance
            if (hostDoc.GetElement(typeId) is not RevitLinkType lt) { skipped++; continue; }

            Document? ldoc = null;
            try { ldoc = li.GetLinkDocument(); }
            catch (Exception ex) { Log($"link {li.Name}: GetLinkDocument threw: {ex.Message}"); }
            if (ldoc is null) { Log($"link {li.Name}: no document (unloaded) — skipped"); skipped++; continue; }

            string title = ldoc.Title;
            string lpath = ldoc.PathName;
            string linkIfc = Sanitize(Path.GetFileNameWithoutExtension(title)) + ".ifc";
            if (string.IsNullOrEmpty(lpath) || !File.Exists(lpath))
            {
                Log($"link {title}: file path unavailable ('{lpath}') — skipped (cloud/BIM360 link?)");
                skipped++;
                continue;
            }

            WriteOutboxMeta(linkIfc, hostDoc, hostIfcName);             // sidecar first (same race rule as the host)
            bool ok = false;
            try
            {
                // Unload frees the file (Revit won't open a model that's loaded as a link), export from a
                // REAL document, then reload so the host looks untouched.
                lt.Unload(null);
                var opened = app.OpenDocumentFile(lpath);
                try
                {
                    var r = ExportToDir(opened, Default3DView(opened), OutboxDir(), linkIfc);
                    ok = r.state == State.Ok;
                    Log($"link {title}: unload+open export → {r.state}{(r.error is null ? "" : " (" + r.error + ")")}");
                }
                finally
                {
                    try { opened.Close(false); } catch (Exception cex) { Log($"link {title}: close failed: {cex.Message}"); }
                }
            }
            catch (Exception ex) { Log($"link {title}: unload/open threw: {ex.Message}"); }
            finally
            {
                try { lt.Reload(); }
                catch (Exception rex) { Log($"link {title}: RELOAD FAILED: {rex.Message} — reload manually via Manage Links"); }
            }

            if (ok) done++;
            else
            {
                skipped++;
                try { File.Delete(Path.Combine(OutboxDir(), linkIfc + ".meta.json")); } catch { /* best-effort */ }
            }
        }
        Log($"links done: {done} exported, {skipped} skipped");
        return (done, skipped);
    }

    /// <summary>
    /// Export <paramref name="doc"/> to <paramref name="dir"/>/<paramref name="ifcName"/> — the shared export
    /// primitive behind <see cref="ExportToOutbox"/> and the Governed Publish command (which exports to a temp
    /// dir first so it can publish ONLY on a passing verdict). Same view-filter + transaction idiom; never
    /// throws — returns a result.
    /// </summary>
    public static (State state, string path, long bytes, string? error) ExportToDir(
        Document doc, ElementId? filterViewId, string dir, string ifcName)
    {
        Directory.CreateDirectory(dir);
        string ifcPath = Path.Combine(dir, ifcName);

        try
        {
            var opts = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC2x3CV2,
                ExportBaseQuantities = true,
            };
            if (filterViewId is { } vid && vid != ElementId.InvalidElementId)
                opts.FilterViewId = vid;

            // Transaction wrapper mirrors the IFC Delivery Gate / manual Publish pattern (proven path).
            using var t = new Transaction(doc, "Sentinel: IFC export");
            t.Start();
            doc.Export(dir, ifcName, opts);
            t.Commit();
        }
        catch (Exception ex)
        {
            return (State.Failed, ifcPath, 0, ex.Message);
        }

        return Inspect(ifcPath);
    }

    /// <summary>Export must exist, be non-empty (0 KB == no geometry), and be readable (not locked).</summary>
    private static (State, string, long, string?) Inspect(string path)
    {
        var fi = new FileInfo(path);
        if (!fi.Exists || fi.Length == 0) return (State.MissingOrEmpty, path, 0, null);
        try { using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read); }
        catch (IOException) { return (State.Locked, path, fi.Length, null); }
        return (State.Ok, path, fi.Length, null);
    }

    /// <summary>
    /// The default 3D view for a whole-model export: the built-in "{3D}" if present, else the first
    /// non-template <see cref="View3D"/>, else null (which exports the entire model unfiltered).
    /// </summary>
    public static ElementId? Default3DView(Document doc)
    {
        ElementId? first = null;
        foreach (var v in new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>())
        {
            if (v.IsTemplate) continue;
            first ??= v.Id;
            if (v.Name == "{3D}") return v.Id;
        }
        return first;
    }

    private static string Sanitize(string s)
    {
        foreach (char ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }
}
