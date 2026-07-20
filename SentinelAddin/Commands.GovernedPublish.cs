using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// G1 — the unified <b>Governed Publish</b>. One button that runs the whole differentiated seam in order:
/// export the active view → IFC, run the <see cref="Sentinel.Engine.IfcDeliveryGate">IFC Delivery Gate</see>
/// (contract check), adjudicate the model against the project's IDS via the referee API
/// (<c>POST /cde/:key/propose</c>), record the verdict to the immutable audit chain, and <b>publish + version
/// ONLY on a passing verdict</b>. A fail is recorded (and each failing requirement auto-opens as a BCF issue
/// that live-syncs to the web + back into Revit) but is not published.
///
/// This is thin orchestration over already-proven parts — the three standalone commands (IFC Delivery Gate,
/// Publish to Platform, and the web IDS panel) still exist for power users; this makes the demo path one
/// action with one clear verdict. Exports to a TEMP file first so a reject never leaks a model into the
/// upload outbox. Blocking bridge calls are short-capped and degrade gracefully when the bridge is down.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class GovernedPublishCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        // The gate + exporter certify what the active view shows — require a 3D view (same rule as IFC Gate).
        if (doc.ActiveView is not View3D)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                "Open a 3D view first — Governed Publish certifies and publishes what that view shows.");
            return Result.Cancelled;
        }

        // 1) Export the active view to a TEMP IFC (not the outbox — we publish only on pass).
        var tempDir = Path.Combine(Path.GetTempPath(), "Sentinel", "governed");
        var ifcName = SafeName(doc.Title) + ".ifc";
        var (state, tempPath, bytes, error) =
            Sentinel.Engine.PlatformExporter.ExportToDir(doc, doc.ActiveView.Id, tempDir, ifcName);
        if (state != Sentinel.Engine.PlatformExporter.State.Ok)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                state == Sentinel.Engine.PlatformExporter.State.MissingOrEmpty
                    ? "IFC export contained no geometry — nothing to publish. Check the view and mappings."
                    : "IFC export failed: " + (error ?? state.ToString()));
            TryDelete(tempPath);
            return Result.Failed;
        }

        // 2) IFC Delivery Gate (contract check) → signed cert; record the verdict. A gate FAIL stops here.
        var contract = Sentinel.Engine.DeliveryContract.LoadOrDefault();
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract);
        Sentinel.Coordination.GovernedNotify.DeliveryGate(
            ifcName, gate.Passed, gate.ContractKey, gate.DetectedSchema,
            gate.TotalEntities, gate.Failures.Count, gate.FileSha256);
        if (!gate.Passed)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                "✕ REJECTED — delivery gate failed (not published)\n\n" +
                "Contract: " + gate.ContractKey + " · Schema: " + gate.DetectedSchema + "\n\n" +
                "FAILURES:\n• " + string.Join("\n• ", gate.Failures.Take(12)) + "\n\n" +
                "Fix the deliverable and run Governed Publish again.");
            TryDelete(tempPath);
            return Result.Succeeded;
        }

        // 3) Adjudicate the model against the project IDS (referee). Extract read-only from the live model.
        var cfg = BcfConfig.Load();
        var elements = Sentinel.Engine.GovernedElementExtractor.Extract(doc, cfg.ProjectId);
        var ids = LoadIdsSpec(); // null ⇒ no IDS configured → verdict "recorded" (gate-only publish)
        var verdict = Sentinel.Coordination.GovernedNotify.Propose(elements, ids, versionId: null, actor: "Revit", containerName: ifcName);

        if (!verdict.Reached)
        {
            // Bridge/CDE unreachable — the gate passed, so let the modeller publish manually rather than lose work.
            TaskDialog.Show("Sentinel — Governed Publish",
                "Delivery gate PASSED, but the Sentinel bridge could not be reached to adjudicate + record the " +
                "verdict.\n\n" +
                (verdict.Error is { Length: > 0 } ? "Reason: " + verdict.Error + "\n\n" : "") +
                "Start the bridge (npm run bcf:serve) and retry, or publish manually:\n\n" +
                $"    cd WebApp\n    node bridge/upload-ifc.mjs \"{tempPath}\"");
            return Result.Succeeded;
        }

        if (verdict.Verdict == "rejected")
        {
            var nameFailed = verdict.NamingOk == false;
            var head = nameFailed
                ? $"✕ REJECTED — model name does not follow the ISO 19650 convention (not published)\n\nName checked: {ifcName}\n\n"
                : $"✕ REJECTED — {verdict.Failing} of {verdict.InScope} in-scope element check(s) failed (not published)\n\n";
            TaskDialog.Show("Sentinel — Governed Publish",
                head +
                (nameFailed ? "NAMING:\n• " + string.Join("\n• ", verdict.NamingFailures) + "\n\n" : "") +
                (verdict.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", verdict.Failures) + "\n\n" : "") +
                (verdict.BcfRaised > 0
                    ? $"{verdict.BcfRaised} BCF issue(s) opened on the failing elements — they're now in the web " +
                      "Issues panel and will live-sync into Revit. Fix them and run Governed Publish again."
                    : nameFailed
                        ? "Rename the Revit model to the BDS ISO 19650 form and run Governed Publish again."
                        : "The rejection is recorded in the immutable audit trail. Fix the failures and retry."));
            TryDelete(tempPath);
            return Result.Succeeded;
        }

        // 4) ACCEPTED (or "recorded" = no IDS): publish. Copy into the outbox for the bridge to upload,
        //    register the version, then stamp the verdict onto that version (the web ✓ badge).
        try
        {
            var outboxPath = Path.Combine(Sentinel.Engine.PlatformExporter.OutboxDir(), ifcName);
            File.Copy(tempPath, outboxPath, overwrite: true);
        }
        catch (Exception ex)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                "Verdict ACCEPTED, but copying the IFC into the upload outbox failed: " + ex.Message +
                "\n\nThe verdict is recorded; upload the file manually if needed.");
        }

        var versionId = Sentinel.Coordination.GovernedNotify.RegisterVersionId(doc.Title, bytes, "Revit");
        if (versionId != null && ids != null)
            Sentinel.Coordination.GovernedNotify.Propose(elements, ids, versionId, actor: "Revit", containerName: ifcName); // stamp the badge

        var live = Sentinel.Coordination.GovernedQuery.LiveVersion(doc.Title);
        var revLine = live is null ? "published as a new version" : $"published as {live.Revision} · {live.State}";
        var idsLine = ids == null
            ? "No project IDS configured — published on the delivery-gate pass alone."
            : $"IDS: {verdict.Passing}/{verdict.InScope} in-scope element checks passed.";

        TaskDialog.Show("Sentinel — Governed Publish",
            $"✓ ACCEPTED — {revLine}\n\n" +
            idsLine + "\n" +
            "Delivery gate: PASS · Schema " + gate.DetectedSchema + "\n" +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n\n" +
            "The Sentinel bridge uploads the geometry; the coordinator sees the new version with a ✓ verdict " +
            "badge and the hash-chained audit entry behind it.");
        TryDelete(tempPath);
        return Result.Succeeded;
    }

    // The project IDS spec (JSON IdsSpec) the referee adjudicates against, alongside the delivery contract in
    // %AppData%\Sentinel. Absent ⇒ null (the model is recorded, not judged — a gate-only publish).
    private static JsonElement? LoadIdsSpec()
    {
        try
        {
            var path = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Sentinel", "ids.json");
            if (!File.Exists(path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }

    private static string SafeName(string s)
    {
        s = Path.GetFileNameWithoutExtension(s);
        foreach (var ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }

    private static void TryDelete(string path) { try { File.Delete(path); } catch { /* best-effort */ } }
}
