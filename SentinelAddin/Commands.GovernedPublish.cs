using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// G1 — the unified <b>Governed Publish</b>. One button that runs the whole differentiated seam in order:
/// export the active view → IFC, run the <see cref="Sentinel.Engine.IfcDeliveryGate">IFC Delivery Gate</see>
/// (the project's contract@n; none → NOT CHECKED and the IDS still judges), adjudicate the model against the
/// project's IDS via the referee API
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

        // The web project this document publishes into (Project Setup → Web project). None → nothing is exported.
        var ctx = Sentinel.Engine.ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.ProjectContext.NotBound + "\n\nNothing was exported or published.");
            return Result.Cancelled;
        }
        var projectKey = ctx.Key;

        // 0) The delivery contract in force (project → office → none), resolved OFF the API thread before the export so
        //    the export can use the schema it asks for. The command waits here as it waits on /propose below.
        var (contract, contractSource) = Task.Run(() => Sentinel.Engine.DeliveryContract.Load(projectKey)).GetAwaiter().GetResult();

        // 1) Export the active view to a TEMP IFC (not the outbox — we publish only on pass) in the contract's schema
        //    (IFC4 → IFC4 Reference View). With no contract it exports IFC 2x3 as before, and the gate below judges nothing.
        var tempDir = Path.Combine(Path.GetTempPath(), "Sentinel", "governed");
        var ifcName = SafeName(doc.Title) + ".ifc";
        var (state, tempPath, bytes, error) =
            Sentinel.Engine.PlatformExporter.ExportToDir(doc, doc.ActiveView.Id, tempDir, ifcName, contract?.IfcSchema ?? "IFC2X3");
        if (state != Sentinel.Engine.PlatformExporter.State.Ok)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                state == Sentinel.Engine.PlatformExporter.State.MissingOrEmpty
                    ? "IFC export contained no geometry — nothing to publish. Check the view and mappings."
                    : "IFC export failed: " + (error ?? state.ToString()));
            TryDelete(tempPath);
            return Result.Failed;
        }

        // 2) IFC Delivery Gate (the contract@n above) → certificate; record the verdict. A gate FAIL stops here. NOT
        //    CHECKED (no contract installed) continues to the IDS, and every dialog below says the gate was not checked.
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract, contractSource);
        Sentinel.Coordination.GovernedNotify.DeliveryGate(ifcName, gate, projectKey);
        if (gate.Outcome == Sentinel.Engine.GateOutcome.Fail)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.GateLines.PublishRejected(gate));
            TryDelete(tempPath);
            return Result.Succeeded;
        }

        // 3) Adjudicate the model against the project IDS (referee). Extract read-only from the live model.
        // Without an office code the Pset_<org>.* rows are dropped from the read table (PsetMap), so the
        // referee sees them as missing. Say so out loud — the verdict is still honest and still recorded.
        if (string.IsNullOrWhiteSpace(App.OrgFor(doc)))
            TaskDialog.Show("Sentinel — Governed Publish",
                "This document's ruleset (" + (App.Engine?.SourceFor(doc).Label ?? "none") + ") has no \"org\" code — " +
                "office property sets (Pset_<org>.*) were NOT read for this publish; the referee will report them " +
                "missing. Install a ruleset@n with an \"org\" on " + projectKey + " or its office, then retry.");
        var elements = Sentinel.Engine.GovernedElementExtractor.Extract(doc, projectKey);
        // No IDS is posted: the bridge judges by the project's ids@n (else its office's) and names it in the verdict.
        var verdict = Sentinel.Coordination.GovernedNotify.Propose(elements, versionId: null, actor: "Revit", containerName: ifcName, projectKey: projectKey);

        if (!verdict.Reached)
        {
            // Bridge/CDE unreachable. The gate did not fail (it passed, or was not checked; the line says which), so
            // let the modeller publish manually rather than lose work.
            TaskDialog.Show("Sentinel — Governed Publish",
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                "The Sentinel bridge could not be reached to adjudicate + record the verdict.\n\n" +
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
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                (nameFailed ? "NAMING:\n• " + string.Join("\n• ", verdict.NamingFailures) + "\n\n" : "") +
                (verdict.Failures.Count > 0 ? "FAILURES:\n• " + string.Join("\n• ", verdict.Failures) + "\n\n" : "") +
                (verdict.BcfRaised > 0
                    ? $"{verdict.BcfRaised} BCF issue(s) opened on the failing elements — they're now in the web " +
                      "Issues panel and will live-sync into Revit. Fix them and run Governed Publish again."
                    : nameFailed
                        ? "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again."
                        : "The rejection is recorded in the immutable audit trail. Fix the failures and retry."));
            TryDelete(tempPath);
            return Result.Succeeded;
        }

        // 4) ACCEPTED, or RECORDED (no IDS installed: nothing was judged): publish. Copy into the outbox for the
        //    bridge to upload, register the version, then stamp a real verdict onto that version (the web ✓ badge).
        var judged = verdict.Verdict != "recorded";
        try
        {
            var outboxPath = Path.Combine(Sentinel.Engine.PlatformExporter.OutboxDir(), ifcName);
            File.Copy(tempPath, outboxPath, overwrite: true);
            Sentinel.Engine.PlatformExporter.WriteOutboxMeta(ifcName, doc); // → the right web project
        }
        catch (Exception ex)
        {
            TaskDialog.Show("Sentinel — Governed Publish",
                "Verdict " + verdict.Verdict.ToUpperInvariant() + ", but copying the IFC into the upload outbox failed: " + ex.Message +
                "\n\nThe verdict is recorded; upload the file manually if needed.");
        }

        var versionId = Sentinel.Coordination.GovernedNotify.RegisterVersionId(doc.Title, bytes, "Revit", projectKey: projectKey);
        if (versionId != null && judged)
            Sentinel.Coordination.GovernedNotify.Propose(elements, versionId, actor: "Revit", containerName: ifcName, projectKey: projectKey); // stamp the badge

        var live = Sentinel.Coordination.GovernedQuery.LiveVersion(doc.Title, projectKey);
        var revLine = live is null ? "published as a new version" : $"published as {live.Revision} · {live.State}";
        // Every line names what judged, from the bridge's answer — never from a local file.
        var idsLine = judged
            ? $"IDS {verdict.IdsLabel}: {verdict.Passing}/{verdict.InScope} in-scope element checks passed" +
              (verdict.Warned ? $" — {verdict.Failing} failure(s) kept as warnings (enforce: {verdict.IdsEnforce ?? "not reported"})." : ".")
            : $"IDS: none — no IDS installed for {projectKey} or its office. The model was NOT judged.";
        var namingLine = verdict.NamingRef is null
            ? "Naming: not judged — no naming standard installed."
            : $"Naming {verdict.NamingLabel}: " + (verdict.NamingOk == false ? "failed (warn — recorded, not blocking)." : "passed.");

        TaskDialog.Show("Sentinel — Governed Publish",
            (judged ? $"✓ ACCEPTED — {revLine}\n" : $"Published — not judged: no IDS installed ({revLine})\n") +
            $"Project: {projectKey}\n\n" +
            idsLine + "\n" +
            namingLine + "\n" +
            Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n" +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n\n" +
            (judged
                ? "The Sentinel bridge uploads the geometry; the coordinator sees the new version with a ✓ verdict " +
                  "badge and the hash-chained audit entry behind it."
                : "The Sentinel bridge uploads the geometry. No verdict badge: nothing was judged — the audit entry " +
                  "records the publish as \"recorded\". Install an IDS on the project or its office to judge the next one."));
        TryDelete(tempPath);
        return Result.Succeeded;
    }

    private static string SafeName(string s)
    {
        s = Path.GetFileNameWithoutExtension(s);
        foreach (var ch in Path.GetInvalidFileNameChars()) s = s.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(s) ? "SentinelModel" : s;
    }

    private static void TryDelete(string path) { try { File.Delete(path); } catch { /* best-effort */ } }
}
