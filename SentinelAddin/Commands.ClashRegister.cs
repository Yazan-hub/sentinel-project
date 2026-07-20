using System.Collections.Generic;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// Clash Register (read-only): shows the team-wide clash register recorded on the web
/// (Coordination → Clash → Run), so a Revit modeller sees the coordination picture — how many clashes are
/// open, their status lifecycle (raised → reviewed → approved → resolved) and the biggest by volume — without
/// leaving Revit. Read-only and best-effort: it never mutates the model and degrades to a clear message if the
/// bridge/CDE isn't reachable. The web side owns the clash lifecycle; this is the authoring-tool window into it.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class ClashRegisterCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var rows = Sentinel.Coordination.GovernedQuery.ClashRegister();

        if (rows is null)
        {
            TaskDialog.Show("Sentinel — Clash Register",
                "Couldn't reach the Sentinel bridge / CDE.\n\n" +
                "Start the bridge (WebApp: start.ps1 or npm run bcf:serve) and check the project id in " +
                "%AppData%\\Sentinel\\bcf-config.json.");
            return Result.Cancelled;
        }

        if (rows.Count == 0)
        {
            TaskDialog.Show("Sentinel — Clash Register",
                "No clashes recorded for this project yet.\n\n" +
                "Load 2+ models on the web (e.g. ARC + STR) and run Coordination → Clash → Run to populate the " +
                "team-wide register; it will then appear here.");
            return Result.Succeeded;
        }

        // Tally the status lifecycle and surface the biggest clashes by shared volume.
        var byStatus = new Dictionary<string, int>();
        foreach (var r in rows)
        {
            var key = string.IsNullOrEmpty(r.Status) ? "unknown" : r.Status;
            byStatus[key] = byStatus.TryGetValue(key, out var n) ? n + 1 : 1;
        }
        var order = new[] { "raised", "reviewed", "approved", "resolved" };
        var summary = string.Join("  ·  ",
            order.Where(byStatus.ContainsKey).Select(s => $"{byStatus[s]} {s}")
                 .Concat(byStatus.Keys.Where(k => !order.Contains(k)).Select(k => $"{byStatus[k]} {k}")));

        var sb = new StringBuilder();
        sb.AppendLine($"{rows.Count} clash(es) recorded for this project.");
        sb.AppendLine(summary);
        sb.AppendLine();
        sb.AppendLine("Biggest by shared volume:");
        foreach (var r in rows.OrderByDescending(r => r.Volume).Take(12))
        {
            var vol = r.Volume >= 0.01 ? $"{r.Volume:F2} m³" : $"{r.Volume:E1} m³";
            sb.AppendLine($"  • [{(string.IsNullOrEmpty(r.Status) ? "?" : r.Status)}] {r.Label}  —  {vol}");
        }

        TaskDialog.Show("Sentinel — Clash Register", sb.ToString());
        return Result.Succeeded;
    }
}
