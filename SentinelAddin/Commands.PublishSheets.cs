using System;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;

namespace Sentinel.Commands;

/// <summary>
/// Publish the model's sheets. Sheets never survive IFC export, so each is rendered here: a PNG for the web "Sheets"
/// viewer and, from Revit 2022, a PDF — the drawing the MIDP plans (item 5, spec 2026-09-29 2d-sheets-midp). Each PDF is
/// proposed like a model: named &lt;sheet number&gt;.pdf and judged by the project's naming standard, registered as a wip
/// version carrying the sheet's revision, and checked against the MIDP — one proposal row per sheet on the ledger; a
/// refused name is held on the web, never renamed. Read-only in the model.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class PublishSheetsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — Publish Sheets", Sentinel.Engine.ProjectContext.NotBound);
            return Result.Cancelled;
        }

        var run = Sentinel.Engine.SheetExporter.ExportAll(doc);
        if (run.Error is not null)
        {
            msg = "Sheet export failed: " + run.Error;
            return Result.Failed;
        }
        if (run.Sheets.Count == 0)
        {
            TaskDialog.Show("Sentinel — Publish Sheets",
                "No sheets found to export.\n\nCreate sheets in Revit (View → Sheet), then try again.");
            return Result.Cancelled;
        }

        // ponytail: one blocking /propose per sheet on the API thread (~0.3 s each); a pool thread if sets grow large
        foreach (var s in run.Sheets.Where(s => s.Pdf != null))
        {
            var bytes = File.ReadAllBytes(Path.Combine(run.OutDir, s.Pdf!));
            s.ContainerName = s.Number + ".pdf";
            var r = GovernedNotify.Propose(Array.Empty<object>(), null, UserSession.Actor, ctx.Key, containerName: s.ContainerName,
                source: "Publish Sheets", raiseBcf: false,
                register: new RegisterRequest { Name = s.ContainerName, SizeBytes = bytes.Length, Sha256 = Sha256Hex(bytes), Revision = s.Revision });
            if (!r.Reached) { s.ProposalError = "not proposed — " + r.Error; continue; }
            s.Verdict = r.Verdict;
            s.VersionId = r.Version?.Id;
            s.VersionRevision = r.Version?.Revision;
            s.Midp = r.Midp;
            if (r.Verdict == "rejected")
                s.Refusal = (r.NamingFailures.Count > 0 ? string.Join("; ", r.NamingFailures) : string.Join("; ", r.Failures.Take(3)))
                            + (r.Held ? " — held on the web" : "");
        }
        Sentinel.Engine.SheetExporter.WriteManifest(doc, run);

        TaskDialog.Show("Sentinel — Publish Sheets", Summary(run));
        return Result.Succeeded;
    }

    /// <summary>One line per sheet — what was exported and what the CDE and the MIDP answered.</summary>
    private static string Summary(Sentinel.Engine.SheetRun run)
    {
        const int Max = 25;
        var sb = new StringBuilder();
        int shown = run.Sheets.Count(s => s.Png != null), registered = run.Sheets.Count(s => s.VersionId != null);
        sb.AppendLine($"{shown} of {run.Sheets.Count} sheet(s) exported · {registered} registered in the CDE.");
        sb.AppendLine();
        foreach (var s in run.Sheets.Take(Max))
        {
            string line =
                s.Png is null ? "not exported — " + s.NotExported
                : s.Pdf is null ? "image only (not proposed) — " + s.PdfMissing
                : s.ProposalError ?? (s.Verdict == "rejected" ? "refused — " + s.Refusal
                    : $"registered {s.VersionRevision ?? "?"} ({s.Verdict}) · {s.Midp ?? "the bridge said nothing of the MIDP"}");
            sb.AppendLine($"{s.Number}  {line}");
        }
        if (run.Sheets.Count > Max) sb.AppendLine($"… and {run.Sheets.Count - Max} more (all in the web's Sheets tab).");
        sb.AppendLine();
        sb.Append("Images, PDFs and the manifest: " + run.OutDir);
        return sb.ToString();
    }

    private static string Sha256Hex(byte[] bytes)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
}
