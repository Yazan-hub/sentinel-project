using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>MA-8-11 (ANV-3): the office template file as a read-only source for view templates. <see cref="Doc"/> is the opened document;
/// <see cref="Opened"/> is true when this run opened it (and so must close it, unsaved); false when the person already had it open.</summary>
internal sealed class OfficeTemplateSource
{
    public Document Doc = null!;
    public string Sha256 = "", FileName = "", Title = "", Format = "";
    public bool Opened;
    public double Seconds;
}

/// <summary>
/// MA-8-11: opens the office template file the person picked, without touching it. The bytes are hashed first (FileShare.ReadWrite); a workshared
/// file is opened detached with every workset closed (S2: 3.2 s on the BDS template); the file is never saved here. A file already open in this
/// session is used as it is. A refusal returns null with words that end "nothing was created".
/// </summary>
internal static class OfficeTemplate
{
    public static OfficeTemplateSource? Open(Application app, Document active, string path, out string why)
    {
        why = "";
        string name = Path.GetFileName(path);
        if (!File.Exists(path)) { why = $"{name} is not there - nothing was created."; return null; }
        if (string.Equals(Path.GetFullPath(path), Path.GetFullPath(active.PathName ?? ""), StringComparison.OrdinalIgnoreCase))
        { why = "That is the model you are annotating - nothing was created."; return null; }

        string sha;
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var h = SHA256.Create();
            sha = BitConverter.ToString(h.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();
        }
        catch (IOException ex) { why = $"{name} is locked or unreadable ({ex.Message}) - nothing was created."; return null; }
        catch (UnauthorizedAccessException ex) { why = $"{name} is locked or unreadable ({ex.Message}) - nothing was created."; return null; }

        // A document the person already holds: used, never closed (it may hold their work). A linked copy is not it.
        foreach (Document d in app.Documents)
            if (!d.IsLinked && string.Equals(d.PathName, path, StringComparison.OrdinalIgnoreCase))
                return new OfficeTemplateSource { Doc = d, Sha256 = sha, FileName = name, Title = d.Title, Format = app.VersionNumber, Opened = false };

        BasicFileInfo info;
        try { info = BasicFileInfo.Extract(path); }
        catch (Exception ex) { why = $"Revit could not read {name} ({ex.Message}) - nothing was created."; return null; }
        if (int.TryParse(info.Format, out int saved) && int.TryParse(app.VersionNumber, out int running) && saved > running)
        { why = $"{name} was saved in Revit {saved}; this is Revit {running} - nothing was created."; return null; }

        var o = new OpenOptions();
        if (info.IsWorkshared)
        {
            o.DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets;
            o.SetOpenWorksetsConfiguration(new WorksetConfiguration(WorksetConfigurationOption.CloseAllWorksets));
        }
        var clock = Stopwatch.StartNew();
        try
        {
            var doc = app.OpenDocumentFile(ModelPathUtils.ConvertUserVisiblePathToModelPath(path), o);
            return new OfficeTemplateSource { Doc = doc, Sha256 = sha, FileName = name, Title = doc.Title, Format = info.Format, Opened = true, Seconds = clock.Elapsed.TotalSeconds };
        }
        catch (Exception ex) { why = $"Revit could not open {name} ({ex.Message}) - nothing was created."; return null; }
    }
}
