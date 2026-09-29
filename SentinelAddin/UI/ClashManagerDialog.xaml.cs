using System.Windows;
using Autodesk.Revit.UI;
using Sentinel.Engine;

namespace Sentinel.UI;

public partial class ClashManagerDialog : Window
{
    private readonly List<ClashManager.ClashItem> _clashes;
    private readonly Autodesk.Revit.DB.Document _doc;   // the model the clashes were found in (XC-1)

    public ClashManagerDialog(Autodesk.Revit.DB.Document doc, List<ClashManager.ClashItem> clashes, string? federationLine = null)
    {
        _doc = doc;
        _clashes = clashes;
        InitializeComponent();
        Grid.ItemsSource = clashes;
        SubHeader.Text = clashes.Count + " clash(es) — " +
            clashes.Count(c => c.Grade == ClashManager.Severity.Hard) + " hard, " +
            clashes.Count(c => c.Grade == ClashManager.Severity.Medium) + " medium, " +
            clashes.Count(c => c.Grade == ClashManager.Severity.Soft) + " soft";
        if (!string.IsNullOrWhiteSpace(federationLine)) SubHeader.Text += "   ·   " + federationLine;
    }

    private List<ClashManager.ClashItem> SelectedOrAll() =>
        Grid.SelectedItems.Count > 0
            ? Grid.SelectedItems.Cast<ClashManager.ClashItem>().ToList()
            : _clashes;

    private void OnShow(object sender, RoutedEventArgs e)
    {
        if (Grid.SelectedItem is ClashManager.ClashItem c)
            App.Events?.SelectAndShow(_doc, c.HostId);
    }

    private void OnCreateView(object sender, RoutedEventArgs e)
    {
        var selection = SelectedOrAll();
        App.Events?.Enqueue(_doc, "create the clash view", (uiapp, doc) =>
        {
            var view = ViewGenerator.CreateClashView(doc, selection);
            if (view is not null)
            {
                var uidoc = uiapp.ActiveUIDocument!;
                uidoc.RequestViewChange(view);
                uidoc.RefreshActiveView();   // force Project Browser redraw (fix #3)
                Autodesk.Revit.UI.TaskDialog.Show("Sentinel — Clash View",
                    "Created '" + view.Name + "'.\nCheck the Doctor log in the panel if it did not land under 05_COORDINATION & QA/QC.");
            }
        });
    }

    private void OnExportBcf(object sender, RoutedEventArgs e)
    {
        var selection = SelectedOrAll();
        var dlg = new Microsoft.Win32.SaveFileDialog
        {
            Title = "Choose BCF output folder (file name is auto-generated)",
            FileName = "SelectFolder",
            Filter = "Folder selection|*.this",
        };
        if (dlg.ShowDialog(this) != true) return;
        var outDir = System.IO.Path.GetDirectoryName(dlg.FileName)!;

        App.Events?.Enqueue(_doc, "export the BCF", (uiapp, doc) =>
        {
            var issue = new BcfExporter.BcfIssue
            {
                Title = "MEP clashes (" + selection.Count + ")",
                Type = "Clash",
                Status = "Active",
                Author = doc.Application.Username,
                Description = string.Join("\n", selection.Take(25).Select(c =>
                    "[" + c.Grade + "] " + c.OtherName + " (" + c.LinkName + ") vs " +
                    c.HostName + " @ " + c.LocationText)),
            };
            foreach (var id in selection.Select(c => c.HostId).Distinct().Take(100))
                issue.Components.Add(id.ToElementId());
            try
            {
                var file = BcfExporter.Export(uiapp, issue, outDir);
                TaskDialog.Show("Sentinel — BCF Export", "✓ Exported:\n" + file);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Sentinel — BCF Export", "Export failed: " + ex.Message);
            }
        });
    }
}
