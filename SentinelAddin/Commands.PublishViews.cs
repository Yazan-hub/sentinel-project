using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.UI;

namespace Sentinel.Commands;

/// <summary>
/// Choose which Revit views (plans, sections, elevations, 3D, drafting, …) to publish to the web app's
/// Views tab, then render only the checked ones to PNG. Views never survive IFC export, so this pushes
/// them directly: images + manifest into %AppData%\Sentinel\views\&lt;model&gt;\, which the Bridge serves
/// to the web app. Read-only — it exports images, changing no model data.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class PublishViewsCommand : IExternalCommand
{
    // Mirrors RuleEngineHost's view-target filter: exclude Revit-generated/internal view types.
    private static bool IsUserView(View v) => v.ViewType switch
    {
        ViewType.Internal or ViewType.ProjectBrowser or ViewType.SystemBrowser
            or ViewType.Undefined or ViewType.DrawingSheet or ViewType.Legend => false,
        _ => true,
    };

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is not { } doc) return Result.Cancelled;
        if (!ProjectContext.For(doc).IsBound)
        {
            TaskDialog.Show("Sentinel — Publish Views", ProjectContext.NotBound);
            return Result.Cancelled;
        }

        var candidates = new FilteredElementCollector(doc)
            .OfClass(typeof(View)).Cast<View>()
            .Where(v => !v.IsTemplate && IsUserView(v))
            .ToList();

        if (candidates.Count == 0)
        {
            TaskDialog.Show("Sentinel — Publish Views", "No publishable views found in this project.");
            return Result.Cancelled;
        }

        var preSelected = ViewExporter.ReadLastSelection(doc);
        var picker = new ViewPickWindow(candidates, preSelected);
        DialogOwner.Attach(picker, c);
        if (picker.ShowDialog() != true) return Result.Cancelled;

        IReadOnlyList<ElementId> picked = picker.SelectedViewIds;
        if (picked.Count == 0)
        {
            TaskDialog.Show("Sentinel — Publish Views", "Nothing selected — nothing published.");
            return Result.Cancelled;
        }

        var (count, dir, error) = ViewExporter.ExportSelected(doc, picked);

        if (error is not null)
        {
            msg = "View export failed: " + error;
            return Result.Failed;
        }

        TaskDialog.Show("Sentinel — Publish Views",
            $"Published {count} view(s) to:\n{dir}\n\n" +
            "The Sentinel Bridge serves these to the web app's BIM Tools → Views tab. " +
            "Make sure the Bridge is running, then open Views and refresh.");
        return Result.Succeeded;
    }
}
