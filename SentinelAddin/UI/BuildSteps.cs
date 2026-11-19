#nullable disable
// UX slice 7 (docs/ux/2026-11-17-simplification-map.md, the Build row): the Build window's steps, in order, and the command
// each button runs. Pure (no Revit), so tools/build-flow-check compiles this same table and checks that every button names a
// command class the ribbon registers. BuildCommand creates the named class and calls its Execute: nothing is copied.
namespace Sentinel.UI;

public sealed class BuildStep
{
    public string Number, Title, Text;
    /// <summary>Each button: its label and the command class (in Sentinel.Commands) it runs.</summary>
    public (string Label, string Command)[] Buttons;
}

public static class BuildSteps
{
    public static readonly BuildStep[] All =
    {
        new() { Number = "1", Title = "Levels and grids",
            Text = "Reads the levels from an imported section and the grids from an imported plan, and creates them. You tick what is created.",
            Buttons = new[] { ("Levels and grids", "DatumFromDrawingsCommand") } },
        new() { Number = "2", Title = "Model from drawings",
            Text = "Ghost Builder builds walls, floors, doors and windows from an imported 2D plan drawing. You review them before anything is placed.",
            Buttons = new[] { ("Ghost Builder", "GhostBuilderCommand") } },
        new() { Number = "3", Title = "Massing from photos",
            Text = "Reads storeys and proportions from the project's photos and proposes a mass. Shell a Mass then turns a mass into walls, floors and a roof, one storey at a time.",
            Buttons = new[] { ("Photo Massing", "MassingFromImagesCommand"), ("Shell a Mass", "ShellMassCommand") } },
        new() { Number = "4", Title = "Annotate views",
            Text = "Creates the plan views the office guideline lists and pins the levels and grids. You tick what is made.",
            Buttons = new[] { ("Annotate Views", "AnnotateViewsCommand") } },
        new() { Number = "5", Title = "Promote to DD",
            Text = "Changes walls, floors, roofs, ceilings, doors and windows to the office's design-development types. Proposed first; a person applies them in Fix.",
            Buttons = new[] { ("Promote (DD)", "PromoteWallsCommand") } },
    };

    public static readonly BuildStep WhereFrom = new()
    {
        Title = "Where did this come from?",
        Text = "Select an element, then Provenance: what Sentinel placed it from, by which rule, who approved it and when.",
        Buttons = new[] { ("Provenance", "ProvenanceCommand") },
    };
}
