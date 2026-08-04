# Datum → Ghost Builder → Annotate Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn three disconnected tools (Datum from Drawings, Ghost Builder, and a new Annotate command) into one continuous folder-driven workflow: datum → model on a chosen level → guideline-driven plan views.

**Architecture:** Ghost Builder learns to (a) read DWGs from the same `GhostSourceFolder` Datum already uses, and (b) build on a user-picked Level (chosen in the existing review window) instead of always the lowest. A new pure `ViewPlanner` module consumes the guideline's currently-dead `views`/`viewNaming` sections to plan WIP floor/ceiling plan views per level; a new `AnnotateCommand` creates them. Every pure module follows the existing mirror discipline: TS in `WebApp/src/sentinel-core` + C# port + `tools/*-check` runner.

**Tech Stack:** C# (Revit add-in, multi-target net48/net8.0-windows), TypeScript (vitest), System.Text.Json, WPF (code-built windows, no XAML for new UI).

## Global Constraints

- The add-in multi-targets: `net48` (Revit ≤2024) and `net8.0-windows` (Revit 2025/2026). New code must compile on **both** — no net8-only APIs without `#if !NET48` guards.
- Pure modules (`ViewPlanner`, extensions to `GuidelineMatcher`) must have **zero `Autodesk.Revit` usings** so `tools/*-check` projects can compile them standalone on net8.0.
- Guideline JSON files are per-firm config (decision D-03): no BDS-specific values hardcoded in C#/TS — everything reads from the JSON.
- Missing/malformed guideline sections must degrade to no-op, never throw (matches `GuidelineMatcher.Load` posture).
- Revit API writes only on the API thread (Execute / ExternalEvent), never `Task.Run`.
- Build check: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` must stay green after each task.
- Commit after every task, message style: `feat(chain): …` / `fix(setup): …`.

---

### Task 1: Fix the settings-wipe bug and add the Ghost source folder to Project Setup

Today `SettingsDialog.OnSave` constructs a **new** `SentinelSettings` with only 3 fields, so saving Project Setup silently wipes every `Ghost*` field the user hand-edited into config.json. Fix that, and surface `GhostSourceFolder` in the dialog (Datum's error text already tells users to set it there, but no field exists).

**Files:**
- Modify: `SentinelAddin/UI/SettingsDialog.xaml` (add folder row)
- Modify: `SentinelAddin/UI/SettingsDialog.xaml.cs` (preserve-then-mutate; folder browse)

**Interfaces:**
- Consumes: `SettingsManager.Resolve(doc)`, `SettingsManager.SaveToMachine/SaveToDocument` (unchanged).
- Produces: `SentinelSettings.GhostSourceFolder` reliably editable from the UI; **no field of `SentinelSettings` is ever dropped by a save**.

- [ ] **Step 1: Add the folder row to the XAML**

In `SettingsDialog.xaml`, insert after the Project code `TextBox` (before the Save-scope `Border`):

```xml
<TextBlock Text="Ghost source folder (DWGs, specs, sketches — drives Datum &amp; Ghost Builder)"
           FontSize="11" Foreground="#667"/>
<DockPanel Margin="0,4,0,16">
    <Button DockPanel.Dock="Right" Content="Browse…" Width="80" Height="28"
            Margin="6,0,0,0" Click="OnBrowseGhostFolder"/>
    <TextBox x:Name="GhostFolderBox" Height="28" FontSize="12" Padding="6,4"
             VerticalContentAlignment="Center"/>
</DockPanel>
```

- [ ] **Step 2: Preserve existing settings on save + wire the folder field**

In `SettingsDialog.xaml.cs`: keep the resolved settings as a field and mutate it instead of newing one up.

```csharp
public partial class SettingsDialog : Window
{
    private readonly SentinelSettings _current;

    public SettingsDialog(Document? doc)
    {
        InitializeComponent();
        _current = SettingsManager.Resolve(doc);
        RulesetPathBox.Text = _current.MasterRulesetPath;
        TemplatePathBox.Text = _current.RevitTemplatePath;
        ProjectCodeBox.Text = _current.ProjectCode;
        GhostFolderBox.Text = _current.GhostSourceFolder;
        if (doc is null)
        {
            ScopeProject.IsEnabled = false;
            ScopeMachine.IsChecked = true;
        }
    }

    private void OnBrowseGhostFolder(object sender, RoutedEventArgs e)
    {
#if NET48
        // net48 WPF has no folder dialog; the TextBox accepts a pasted path.
        MessageBox.Show(this, "Paste the folder path into the box (network drives and ACC Desktop Connector paths work).",
            "Sentinel", MessageBoxButton.OK, MessageBoxImage.Information);
#else
        var dlg = new OpenFolderDialog { Title = "Select the Ghost source folder" };
        if (dlg.ShowDialog(this) == true) GhostFolderBox.Text = dlg.FolderName;
#endif
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        // Mutate the RESOLVED settings so fields this dialog doesn't show survive the save.
        _current.MasterRulesetPath = RulesetPathBox.Text.Trim();
        _current.RevitTemplatePath = TemplatePathBox.Text.Trim();
        _current.ProjectCode = ProjectCodeBox.Text.Trim().ToUpperInvariant();
        _current.GhostSourceFolder = GhostFolderBox.Text.Trim();
        var settings = _current;
        // …rest of OnSave unchanged (uses `settings` exactly as before)…
```

Keep the remainder of `OnSave` byte-identical (machine save / ES save via `App.Events`).

- [ ] **Step 3: Build both targets**

Run: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024`
Expected: both succeed, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/UI/SettingsDialog.xaml SentinelAddin/UI/SettingsDialog.xaml.cs
git commit -m "fix(setup): Project Setup no longer wipes Ghost settings; Ghost source folder editable in the dialog"
```

---

### Task 2: Thread a chosen Level through Ghost placement

Placement hardcodes the lowest level (`GhostPlacementEngine` ctor collects `OrderBy(Elevation).First()`). Make the level a parameter, defaulting to that same lowest-level behaviour, and feed the level *name* into `GuidelineInput.Level` so guideline `"level"` conditions can finally fire.

**Files:**
- Modify: `SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs:280,308` (engine ctor)
- Modify: `SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs:76,100,140` (`Place`/`PlacePrepared` level param)
- Modify: `SentinelAddin/GhostBuilder/ElementPlacementFactory.cs:124` (populate `GuidelineInput.Level`)

**Interfaces:**
- Produces: `GhostPlacementEngine(Document doc, double minConfidence = 0.5, GuidelineMatcher guideline = null, Level level = null)`; `orchestrator.Place(Inputs inputs, MappingResult mapping, Level level = null)`; `orchestrator.PlacePrepared(List<GhostElement> elements, MappingResult mapping, Level level = null)`. `null` level ⇒ lowest level (current behaviour, used by the massing path untouched).

- [ ] **Step 1: Engine ctor takes an optional Level**

In `GhostBuilder_ExtractionAndPlacement.cs`, change the ctor signature and the `_defaultLevel` assignment:

```csharp
public GhostPlacementEngine(Document doc, double minConfidence = 0.5,
                            GuidelineMatcher guideline = null, Level level = null)
```

and where `_defaultLevel` is assigned (currently `:308`):

```csharp
_defaultLevel = level ?? new FilteredElementCollector(doc).OfClass(typeof(Level))
    .Cast<Level>().OrderBy(l => l.Elevation).FirstOrDefault();
```

- [ ] **Step 2: Orchestrator forwards the level**

In `GhostBuilderOrchestrator.cs`:

```csharp
public GhostPlacementEngine.PlacementReport Place(Inputs inputs, MappingResult mapping, Level level = null)
{
    // …existing guards unchanged…
    var elements = GhostWallPairer.PairWalls(inputs.Elements, mapping);
    return PlacePrepared(elements, mapping, level);
}

public GhostPlacementEngine.PlacementReport PlacePrepared(
    System.Collections.Generic.List<GhostElement> elements, MappingResult mapping, Level level = null)
```

and inside `PlacePrepared`, the engine construction becomes:

```csharp
var engine = new GhostPlacementEngine(_doc, _minConfidence, _guideline, level);
```

- [ ] **Step 3: Populate `GuidelineInput.Level`**

In `ElementPlacementFactory.ResolveWallType` (the `_guideline.Resolve(new GuidelineInput {...})` call at `:124`), add:

```csharp
Level = _level.Name,
```

- [ ] **Step 4: Build both targets**

Run: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `-p:RevitVersion=2024`
Expected: both succeed (default args keep all existing callers — massing included — compiling unchanged).

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/GhostBuilder/GhostBuilder_ExtractionAndPlacement.cs SentinelAddin/GhostBuilder/GhostBuilderOrchestrator.cs SentinelAddin/GhostBuilder/ElementPlacementFactory.cs
git commit -m "feat(chain): placement level is a parameter; guideline level conditions now receive the level name"
```

---

### Task 3: Level picker in the Ghost review window

The reviewer picks the build level in the window they already approve layers in. The window stays Revit-free: it receives `(name, id)` pairs and emits the chosen id.

**Files:**
- Modify: `SentinelAddin/UI/GhostReviewWindow.cs`
- Modify: `SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs`
- Modify: `SentinelAddin/Commands.GhostBuilder.cs`

**Interfaces:**
- Produces: `GhostReviewWindow.LoadLevels(IReadOnlyList<(string Name, long Id)> levels, long defaultId)`; `BuildRequested` becomes `event Action<MappingResult, long>` (second arg = chosen level ElementId value, `-1` = "use default"); `GhostBuilderPlacementEvent.SetRequest(orchestrator, inputs, mapping, long levelId)`.

- [ ] **Step 1: Add the ComboBox to the review window**

In `GhostReviewWindow.cs`:

```csharp
private readonly ComboBox _levelBox = new()
{
    MinWidth = 160, Margin = new Thickness(6, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center,
};

/// <summary>Fires with the ticked layers + the chosen level's ElementId value (-1 = default).</summary>
public event Action<MappingResult, long>? BuildRequested;

private sealed record LevelChoice(string Name, long Id) { public override string ToString() => Name; }

/// <summary>Populate the build-level choices. Call before Show().</summary>
public void LoadLevels(IReadOnlyList<(string Name, long Id)> levels, long defaultId) => Dispatcher.Invoke(() =>
{
    _levelBox.Items.Clear();
    foreach (var (name, id) in levels) _levelBox.Items.Add(new LevelChoice(name, id));
    _levelBox.SelectedIndex = Math.Max(0,
        levels.ToList().FindIndex(l => l.Id == defaultId));
});
```

In the constructor, put the picker on the buttons row (before `_build`):

```csharp
buttons.Children.Add(new TextBlock
{
    Text = "Build on level:", VerticalAlignment = VerticalAlignment.Center,
});
buttons.Children.Add(_levelBox);
buttons.Children.Add(_build);
buttons.Children.Add(cancel);
```

and in `Build()`, replace the invoke line:

```csharp
long levelId = (_levelBox.SelectedItem as LevelChoice)?.Id ?? -1;
BuildRequested?.Invoke(new MappingResult { Mappings = ticked }, levelId);
```

- [ ] **Step 2: Placement event carries the level id and resolves it on the API thread**

In `GhostBuilderExternalEvent.cs`:

```csharp
private long _levelId = -1;

public void SetRequest(GhostBuilderOrchestrator orchestrator,
                       GhostBuilderOrchestrator.Inputs inputs, MappingResult mapping, long levelId = -1)
{
    _orchestrator = orchestrator;
    _inputs = inputs;
    _mapping = mapping;
    _levelId = levelId;
}
```

and in `Execute`, snapshot `_levelId` alongside the others (`var levelId = _levelId; _levelId = -1;`), then:

```csharp
Autodesk.Revit.DB.Level level = null;
if (levelId >= 0)
    level = app.ActiveUIDocument?.Document?.GetElement(
        new Autodesk.Revit.DB.ElementId(levelId)) as Autodesk.Revit.DB.Level;
var report = orchestrator.Place(inputs, mapping, level);
```

(`ElementId(long)` exists from Revit 2024, so it compiles on net48 too. A deleted/invalid id yields `null` → default-level behaviour, never a crash.)

- [ ] **Step 3: Command supplies the levels**

In `Commands.GhostBuilder.cs`, after `review` is constructed (step 5b region), collect and load levels, and update the handler signature:

```csharp
var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
    .OrderBy(l => l.Elevation)
    .Select(l => (l.Name, l.Id.Value))
    .ToList();
if (levels.Count > 0) review.LoadLevels(levels, levels[0].Item2);

review.BuildRequested += (approved, levelId) =>
{
    building = true;
    placementEvent.SetRequest(orchestrator, inputs, approved, levelId);
    externalEvent.Raise();
};
```

**net48 note:** on Revit 2024 `ElementId.Value` doesn't exist (`IntegerValue` int does). Use a small helper in the command:

```csharp
#if NET48
        static long IdOf(Level l) => l.Id.IntegerValue;
#else
        static long IdOf(Level l) => l.Id.Value;
#endif
```

and `.Select(l => (l.Name, IdOf(l)))`.

- [ ] **Step 4: Build both targets**

Run: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `-p:RevitVersion=2024`
Expected: both succeed. (The massing command uses `PlacePrepared` directly and does not subscribe to `BuildRequested`; if it *does* subscribe to a `GhostReviewWindow`, update its lambda to the two-arg signature the same way — grep `BuildRequested +=` to confirm all subscribers.)

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/UI/GhostReviewWindow.cs SentinelAddin/GhostBuilder/GhostBuilderExternalEvent.cs SentinelAddin/Commands.GhostBuilder.cs
git commit -m "feat(chain): reviewer picks the build level in the Ghost review window"
```

---

### Task 4: Ghost Builder reads DWGs from the project folder

Datum reads `GhostSourceFolder`; Ghost makes you hand-import + `PickObject`. Give Ghost the same folder-first behaviour: if the folder has DWGs, offer them in a list; picking one imports it (kept, visible, origin-to-origin — same options as Datum) and the run continues on the resulting `ImportInstance`. `PickObject` stays as the fallback and as the explicit "Pick from model…" choice.

**Files:**
- Create: `SentinelAddin/UI/DwgPickWindow.cs`
- Modify: `SentinelAddin/Commands.GhostBuilder.cs` (step 2 region, `:63-76`)

**Interfaces:**
- Produces: `DwgPickWindow(IReadOnlyList<string> files)` modal dialog; `string? SelectedPath` (null = user chose "Pick from model…" or cancelled; `PickFromModel` bool distinguishes).

- [ ] **Step 1: The pick window (code-built, mirrors GhostReviewWindow idiom)**

Create `SentinelAddin/UI/DwgPickWindow.cs`:

```csharp
using System.Collections.Generic;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace Sentinel.UI;

/// <summary>Choose which DWG plan from the project folder to build from — or fall back to
/// picking an import already in the model. Modal; ShowDialog() == true means a choice was made.</summary>
public sealed class DwgPickWindow : Window
{
    private readonly ListBox _list;

    public string? SelectedPath { get; private set; }
    public bool PickFromModel { get; private set; }

    public DwgPickWindow(IReadOnlyList<string> files)
    {
        Title = "Sentinel — Ghost Builder: choose a drawing";
        Width = 520; Height = 380; MinWidth = 380;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _list = new ListBox { Margin = new Thickness(0, 6, 0, 6) };
        foreach (var f in files) _list.Items.Add(new ListBoxItem { Content = Path.GetFileName(f), Tag = f });
        if (_list.Items.Count > 0) _list.SelectedIndex = 0;
        _list.MouseDoubleClick += (_, __) => Accept();

        var build = new Button { Content = "Use selected drawing ▶", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        build.Click += (_, __) => Accept();
        var model = new Button { Content = "Pick from model…", Padding = new Thickness(10, 5, 10, 5), Margin = new Thickness(0, 0, 6, 0) };
        model.Click += (_, __) => { PickFromModel = true; DialogResult = true; Close(); };
        var cancel = new Button { Content = "Cancel", Padding = new Thickness(10, 5, 10, 5), IsCancel = true };

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(build); buttons.Children.Add(model); buttons.Children.Add(cancel);

        var header = new TextBlock
        {
            Text = "Drawings found in the project's Ghost source folder. The chosen one is imported origin-to-origin and kept in the model.",
            TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.Bold,
        };

        var root = new DockPanel { Margin = new Thickness(12) };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(header); root.Children.Add(buttons); root.Children.Add(_list);
        Content = root;
    }

    private void Accept()
    {
        SelectedPath = (_list.SelectedItem as ListBoxItem)?.Tag as string;
        if (SelectedPath == null) return;
        DialogResult = true;
        Close();
    }
}
```

- [ ] **Step 2: Command uses folder-first acquisition**

In `Commands.GhostBuilder.cs`, replace the whole "2. Pick a DWG import" block (`:63-76`) with:

```csharp
// 2. Acquire the DWG: folder-first (same GhostSourceFolder Datum reads), PickObject fallback.
ImportInstance? cadLink = null;
var folderDwgs = Directory.Exists(settings.GhostSourceFolder ?? "")
    ? Directory.EnumerateFiles(settings.GhostSourceFolder, "*.*")
        .Where(f => f.EndsWith(".dwg", System.StringComparison.OrdinalIgnoreCase)
                 || f.EndsWith(".dxf", System.StringComparison.OrdinalIgnoreCase))
        .OrderBy(f => f).ToList()
    : new List<string>();

bool pickFromModel = folderDwgs.Count == 0;
if (folderDwgs.Count > 0)
{
    var pick = new DwgPickWindow(folderDwgs);
    new System.Windows.Interop.WindowInteropHelper(pick) { Owner = c.Application.MainWindowHandle };
    if (pick.ShowDialog() != true) return Result.Cancelled;
    pickFromModel = pick.PickFromModel;

    if (!pickFromModel && pick.SelectedPath is { } dwgPath)
    {
        // Import KEPT in the model (unlike Datum's rolled-back scratch read) so the user
        // sees what was built from, and re-runs can re-pick it from the model.
        using var t = new Transaction(doc, "Sentinel — import DWG plan");
        t.Start();
        var opts = new DWGImportOptions
        {
            Placement = ImportPlacement.Origin,   // aligns with Datum's origin-to-origin read
            ThisViewOnly = false,
            ColorMode = ImportColorMode.Preserved,
        };
        if (doc.Import(dwgPath, opts, uidoc.ActiveView, out ElementId impId))
            cadLink = doc.GetElement(impId) as ImportInstance;
        if (cadLink is null)
        {
            t.RollBack();
            TaskDialog.Show("Sentinel — Ghost Builder", $"Could not import:\n{dwgPath}");
            return Result.Failed;
        }
        t.Commit();
    }
}

if (pickFromModel)
{
    try
    {
        var picked = uidoc.Selection.PickObject(
            ObjectType.Element, new CadImportFilter(),
            "Select a 2D CAD (DWG) import to build from.");
        cadLink = doc.GetElement(picked.ElementId) as ImportInstance;
    }
    catch (Autodesk.Revit.Exceptions.OperationCanceledException)
    {
        return Result.Cancelled;
    }
}
if (cadLink is null) return Result.Cancelled;
```

Add `using System.Collections.Generic;` and `using System.Linq;` to the file's usings if not already present (`System.Linq` is used at `:193` via fully-qualified `GroupBy` — check and add).

- [ ] **Step 3: Build both targets**

Run: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `-p:RevitVersion=2024`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/UI/DwgPickWindow.cs SentinelAddin/Commands.GhostBuilder.cs
git commit -m "feat(chain): Ghost Builder reads DWGs from the project folder, PickObject stays as fallback"
```

---

### Task 5: TS first — `planViews` in sentinel-core (the rule, written once)

Per the mirror discipline, the view-planning rule is authored in TS with tests, then ported to C# (Task 6). This also fixes the type drift: `guideline.ts` declares `tags?: Record<string,string>` / `template?: string` but the JSON actually has tag objects and `wipTemplate`/`sheetTemplate`/`viewType`/`namePrefix`.

**Files:**
- Modify: `WebApp/src/sentinel-core/guideline.ts` (types at `:59-82`, new `planViews`)
- Modify: `WebApp/src/sentinel-core/guideline-bds.test.ts` (fix drifted assertions at `:86-112`)
- Create: `WebApp/src/sentinel-core/view-plan.test.ts`

**Interfaces:**
- Produces:
```ts
export interface GuidelineTag { family: string; type?: string; officeAuthored?: boolean }
export interface GuidelineGraphics { tags?: Record<string, GuidelineTag>; dimensionStyle?: string | null; textStyle?: string | null }
export interface GuidelineViewStandard { use: string; wipTemplate?: string; sheetTemplate?: string; viewType: string; namePrefix?: string; tag?: string[] }
export interface GuidelineViewNaming { structure?: string; source?: string; statusPrefixes?: Record<string, string> }
export interface PlannedView { name: string; use: string; viewType: string; levelName: string; template?: string; browserStatus?: string }
export function planViews(views: GuidelineViewStandard[] | undefined, naming: GuidelineViewNaming | undefined, levelNames: string[]): PlannedView[]
```

- [ ] **Step 1: Write the failing test**

Create `WebApp/src/sentinel-core/view-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planViews, type GuidelineViewStandard, type GuidelineViewNaming } from "./guideline";

const views: GuidelineViewStandard[] = [
  { use: "GA Plan", wipTemplate: "01.100_WIP_FLOOR_PLANS", sheetTemplate: "02.100_SHEET_FLOOR_PLANS", viewType: "FloorPlan", namePrefix: "FP", tag: ["Doors", "Windows", "Rooms"] },
  { use: "RCP", wipTemplate: "01.100_WIP_RCP", viewType: "CeilingPlan", namePrefix: "RCP" },
  { use: "Section", wipTemplate: "01.100_WIP_SECTIONS", viewType: "Section", namePrefix: "SEC" },
  { use: "Coordination", viewType: "FloorPlan" }, // no namePrefix -> not plannable
];
const naming: GuidelineViewNaming = {
  structure: "[STATUS]_[TYPE]_[LEVEL]_[DESCRIPTION]",
  statusPrefixes: { "WIP_": "01_WIP_VIEWS", "SH_": "02_SHEET_VIEWS" },
};

describe("planViews", () => {
  it("plans one WIP view per plan-type entry per level, named to the office structure", () => {
    const plans = planViews(views, naming, ["Level 0", "Level 1"]);
    // 2 plannable entries (GA Plan, RCP) x 2 levels
    expect(plans).toHaveLength(4);
    const ga0 = plans.find(p => p.use === "GA Plan" && p.levelName === "Level 0")!;
    expect(ga0.name).toBe("WIP_FP_LEVEL-0");
    expect(ga0.template).toBe("01.100_WIP_FLOOR_PLANS");
    expect(ga0.viewType).toBe("FloorPlan");
    expect(ga0.browserStatus).toBe("01_WIP_VIEWS");
  });

  it("skips Section/ThreeD entries and entries without a namePrefix", () => {
    const plans = planViews(views, naming, ["Level 0"]);
    expect(plans.some(p => p.use === "Section")).toBe(false);
    expect(plans.some(p => p.use === "Coordination")).toBe(false);
  });

  it("degrades to empty on missing input", () => {
    expect(planViews(undefined, naming, ["Level 0"])).toEqual([]);
    expect(planViews(views, undefined, [])).toEqual([]);
  });

  it("is deterministic: same input, same output order (by view entry, then level)", () => {
    const a = planViews(views, naming, ["Level 1", "Level 0"]);
    const b = planViews(views, naming, ["Level 1", "Level 0"]);
    expect(a).toEqual(b);
    expect(a[0].use).toBe("GA Plan");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd WebApp && npx vitest run src/sentinel-core/view-plan.test.ts`
Expected: FAIL — `planViews` is not exported.

- [ ] **Step 3: Implement in guideline.ts**

Replace the drifted type declarations (`:59-82`) with the interfaces from the Produces block above, keep/extend the `GuidelineDoc` interface so it carries `graphics?: GuidelineGraphics; views?: GuidelineViewStandard[]; viewNaming?: GuidelineViewNaming;`, and add:

```ts
const PLANNABLE = new Set(["FloorPlan", "CeilingPlan"]);

/** Deterministic WIP view plan: one view per plannable guideline entry per level.
 *  Name follows the office structure [STATUS]_[TYPE]_[LEVEL] (description omitted). */
export function planViews(
  views: GuidelineViewStandard[] | undefined,
  naming: GuidelineViewNaming | undefined,
  levelNames: string[],
): PlannedView[] {
  if (!views || !naming || levelNames.length === 0) return [];
  const status = "WIP_";
  const browserStatus = naming.statusPrefixes?.[status];
  const out: PlannedView[] = [];
  for (const v of views) {
    if (!v.namePrefix || !PLANNABLE.has(v.viewType)) continue;
    for (const level of levelNames) {
      const levelToken = level.trim().toUpperCase().replace(/\s+/g, "-");
      out.push({
        name: `${status}${v.namePrefix}_${levelToken}`,
        use: v.use,
        viewType: v.viewType,
        levelName: level,
        template: v.wipTemplate,
        browserStatus,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Fix the drifted assertions in guideline-bds.test.ts**

Update the graphics/views assertions (`:86-112`) to the real shapes, e.g. `expect(g.graphics?.tags?.["Doors"]?.family).toBe("BDS_Door Tag")` and `expect(g.views?.find(v => v.use === "GA Plan")?.wipTemplate).toBe("01.100_WIP_FLOOR_PLANS")` — read the current assertions and convert each to the object form; delete none.

- [ ] **Step 5: Run the full sentinel-core suite**

Run: `cd WebApp && npx vitest run src/sentinel-core`
Expected: all pass, including the two touched files.

- [ ] **Step 6: Commit**

```bash
git add WebApp/src/sentinel-core/guideline.ts WebApp/src/sentinel-core/view-plan.test.ts WebApp/src/sentinel-core/guideline-bds.test.ts
git commit -m "feat(chain): planViews in sentinel-core — the guideline views section becomes executable; fix type drift"
```

---

### Task 6: C# mirror — `ViewPlanner` + guideline doc extensions + `tools/annotate-check`

**Files:**
- Modify: `SentinelAddin/GhostBuilder/GuidelineMatcher.cs` (doc classes + accessors)
- Create: `SentinelAddin/GhostBuilder/ViewPlanner.cs` (pure, no Revit usings)
- Create: `tools/annotate-check/annotate-check.csproj`
- Create: `tools/annotate-check/Check.cs`

**Interfaces:**
- Produces (C#, must give the same answers as the TS for the same input — the TS tests are the conformance reference):
```csharp
// in GuidelineMatcher.cs, alongside the existing doc classes:
public sealed class GuidelineTag { [JsonPropertyName("family")] public string Family; [JsonPropertyName("type")] public string Type; [JsonPropertyName("officeAuthored")] public bool OfficeAuthored; }
public sealed class GuidelineGraphics { [JsonPropertyName("tags")] public Dictionary<string, GuidelineTag> Tags; }
public sealed class GuidelineViewStandard { [JsonPropertyName("use")] public string Use; [JsonPropertyName("wipTemplate")] public string WipTemplate; [JsonPropertyName("sheetTemplate")] public string SheetTemplate; [JsonPropertyName("viewType")] public string ViewType; [JsonPropertyName("namePrefix")] public string NamePrefix; [JsonPropertyName("tag")] public List<string> Tag; }
public sealed class GuidelineViewNaming { [JsonPropertyName("structure")] public string Structure; [JsonPropertyName("statusPrefixes")] public Dictionary<string, string> StatusPrefixes; }
// GuidelineDoc gains: Graphics, Views, ViewNaming (same JsonPropertyNames)
// GuidelineMatcher gains passthroughs: public List<GuidelineViewStandard> Views => _doc?.Views; public GuidelineViewNaming ViewNaming => _doc?.ViewNaming; public GuidelineGraphics Graphics => _doc?.Graphics;

// ViewPlanner.cs:
public sealed class PlannedView { public string Name; public string Use; public string ViewType; public string LevelName; public string Template; public string BrowserStatus; }
public static class ViewPlanner
{
    public static List<PlannedView> Plan(List<GuidelineViewStandard> views, GuidelineViewNaming naming, List<string> levelNames);
}
```

Note the doc classes use public **fields** here for brevity — match the existing file's style, which uses `{ get; set; }` properties; write them as properties.

- [ ] **Step 1: Write the failing check**

Create `tools/annotate-check/annotate-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <AssemblyName>annotate-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\GhostBuilder\GuidelineMatcher.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\ViewPlanner.cs" />
  </ItemGroup>
</Project>
```

Create `tools/annotate-check/Check.cs` (same idiom as `tools/guideline-check`):

```csharp
using Sentinel.GhostBuilder;

int failed = 0;
void Check(string name, bool ok)
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failed++;
}

var views = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", WipTemplate = "01.100_WIP_FLOOR_PLANS", ViewType = "FloorPlan", NamePrefix = "FP" },
    new() { Use = "RCP", WipTemplate = "01.100_WIP_RCP", ViewType = "CeilingPlan", NamePrefix = "RCP" },
    new() { Use = "Section", WipTemplate = "01.100_WIP_SECTIONS", ViewType = "Section", NamePrefix = "SEC" },
    new() { Use = "Coordination", ViewType = "FloorPlan" },
};
var naming = new GuidelineViewNaming
{
    Structure = "[STATUS]_[TYPE]_[LEVEL]_[DESCRIPTION]",
    StatusPrefixes = new() { ["WIP_"] = "01_WIP_VIEWS", ["SH_"] = "02_SHEET_VIEWS" },
};

var plans = ViewPlanner.Plan(views, naming, new List<string> { "Level 0", "Level 1" });
Check("2 plannable entries x 2 levels = 4", plans.Count == 4);
var ga0 = plans.Find(p => p.Use == "GA Plan" && p.LevelName == "Level 0");
Check("GA Plan Level 0 exists", ga0 != null);
Check("name follows [STATUS]_[TYPE]_[LEVEL]", ga0?.Name == "WIP_FP_LEVEL-0");
Check("template carried", ga0?.Template == "01.100_WIP_FLOOR_PLANS");
Check("browser status resolved from statusPrefixes", ga0?.BrowserStatus == "01_WIP_VIEWS");
Check("sections skipped", !plans.Exists(p => p.Use == "Section"));
Check("no-prefix entries skipped", !plans.Exists(p => p.Use == "Coordination"));
Check("null views -> empty", ViewPlanner.Plan(null, naming, new List<string> { "Level 0" }).Count == 0);
Check("no levels -> empty", ViewPlanner.Plan(views, naming, new List<string>()).Count == 0);

// the shipped BDS guideline parses with the new sections
var m = GuidelineMatcher.Load(Path.Combine("..", "..", "SentinelAddin", "Resources", "bds-guideline.json"));
Check("BDS guideline loads", m.HasGuideline);
Check("BDS views section deserialized", m.Views != null && m.Views.Count > 0);
Check("BDS GA Plan wipTemplate", m.Views?.Find(v => v.Use == "GA Plan")?.WipTemplate == "01.100_WIP_FLOOR_PLANS");
Check("BDS door tag family", m.Graphics?.Tags?["Doors"]?.Family == "BDS_Door Tag");

Console.WriteLine(failed == 0 ? "ALL PASS" : $"{failed} FAILED");
return failed == 0 ? 0 : 1;
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet run --project tools/annotate-check`
Expected: compile error — `ViewPlanner` / `GuidelineViewStandard` do not exist.

- [ ] **Step 3: Implement**

In `GuidelineMatcher.cs`, add the four doc classes (as `{ get; set; }` properties with the `JsonPropertyName` attributes from the Produces block), extend `GuidelineDoc`:

```csharp
[JsonPropertyName("graphics")]   public GuidelineGraphics Graphics { get; set; }
[JsonPropertyName("views")]      public List<GuidelineViewStandard> Views { get; set; }
[JsonPropertyName("viewNaming")] public GuidelineViewNaming ViewNaming { get; set; }
```

and add the three passthroughs on `GuidelineMatcher`:

```csharp
public List<GuidelineViewStandard> Views => _doc?.Views;
public GuidelineViewNaming ViewNaming => _doc?.ViewNaming;
public GuidelineGraphics Graphics => _doc?.Graphics;
```

Create `SentinelAddin/GhostBuilder/ViewPlanner.cs` (port of the TS — no Revit usings):

```csharp
#nullable disable
// C# port of planViews in WebApp/src/sentinel-core/guideline.ts — view-plan.test.ts is the
// CONFORMANCE REFERENCE: same input, same output, exactly as GuidelineMatcher mirrors guideline.ts.
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class PlannedView
    {
        public string Name { get; set; }
        public string Use { get; set; }
        public string ViewType { get; set; }
        public string LevelName { get; set; }
        public string Template { get; set; }
        public string BrowserStatus { get; set; }
    }

    public static class ViewPlanner
    {
        private static readonly HashSet<string> Plannable = new HashSet<string> { "FloorPlan", "CeilingPlan" };

        /// <summary>Deterministic WIP view plan: one view per plannable guideline entry per level.
        /// Name follows the office structure [STATUS]_[TYPE]_[LEVEL] (description omitted).</summary>
        public static List<PlannedView> Plan(
            List<GuidelineViewStandard> views, GuidelineViewNaming naming, List<string> levelNames)
        {
            var outp = new List<PlannedView>();
            if (views == null || naming == null || levelNames == null || levelNames.Count == 0) return outp;

            const string status = "WIP_";
            string browserStatus = null;
            naming.StatusPrefixes?.TryGetValue(status, out browserStatus);

            foreach (var v in views)
            {
                if (string.IsNullOrWhiteSpace(v?.NamePrefix) || !Plannable.Contains(v.ViewType ?? "")) continue;
                foreach (string level in levelNames)
                {
                    string levelToken = Regex.Replace(level.Trim().ToUpperInvariant(), @"\s+", "-");
                    outp.Add(new PlannedView
                    {
                        Name = status + v.NamePrefix + "_" + levelToken,
                        Use = v.Use,
                        ViewType = v.ViewType,
                        LevelName = level,
                        Template = v.WipTemplate,
                        BrowserStatus = browserStatus,
                    });
                }
            }
            return outp;
        }
    }
}
```

- [ ] **Step 4: Run the check + full builds**

Run: `dotnet run --project tools/annotate-check`
Expected: `ALL PASS`, exit 0. (If the BDS-guideline path check fails on cwd, run from repo root — the other check projects assume repo-root cwd; match whatever `tools/guideline-check/Check.cs` does for its path and copy that idiom.)
Then: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `-p:RevitVersion=2024` — both green.
Also: `dotnet run --project tools/guideline-check` — still `ALL PASS` (GuidelineDoc changed; its check compiles the same file).

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/GhostBuilder/GuidelineMatcher.cs SentinelAddin/GhostBuilder/ViewPlanner.cs tools/annotate-check/
git commit -m "feat(chain): ViewPlanner C# mirror + guideline graphics/views/viewNaming deserialization + annotate-check"
```

---

### Task 7: The Annotate command + ribbon chain

Creates the planned WIP views in Revit: one plan view per level per plannable guideline entry, template applied by name, routed into the office Project Browser structure with the same candidate-parameter idiom as the clash view. Then groups the chain on the ribbon.

**Files:**
- Create: `SentinelAddin/Commands.Annotate.cs`
- Modify: `SentinelAddin/Engine/ViewGenerator.cs:98` (make `SetFirstMatch` internal)
- Modify: `SentinelAddin/App.cs:216-234` (ribbon)

**Interfaces:**
- Consumes: `GuidelineMatcher.Load(...).Views/.ViewNaming` (Task 6), `ViewPlanner.Plan(...)` (Task 6), `ViewGenerator.SetFirstMatch` + its candidate arrays.
- Produces: `Sentinel.Commands.AnnotateViewsCommand : IExternalCommand`, ribbon button "Annotate Views".

- [ ] **Step 1: Expose the browser-routing helper**

In `ViewGenerator.cs`, change `private static bool SetFirstMatch` to `internal static bool SetFirstMatch`, and the three candidate arrays (`MainGroupParams`, `SubGroupParams`, `SubSubGroupParams`) from `private` to `internal`.

- [ ] **Step 2: The command**

Create `SentinelAddin/Commands.Annotate.cs`:

```csharp
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Commands;

/// <summary>
/// Annotate — step 3 of the datum → model → annotate chain. Creates the WIP plan views the
/// Office Modelling Guideline's `views` section prescribes: one per plannable entry per level,
/// named to the office structure, view template applied, routed into the office Project Browser
/// structure. Idempotent: a view whose name already exists is skipped, so re-running is safe.
/// </summary>
[Transaction(TransactionMode.Manual)]
public sealed class AnnotateViewsCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;

        var settings = SettingsManager.Resolve(doc);
        var guideline = GuidelineMatcher.Load(
            string.IsNullOrWhiteSpace(settings.GhostGuidelinePath) ? null : settings.GhostGuidelinePath,
            string.IsNullOrWhiteSpace(settings.GhostTypeCatalogPath) ? null : settings.GhostTypeCatalogPath);

        if (guideline.Views is null || guideline.Views.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate",
                "The guideline has no `views` section — nothing to create.\n" +
                $"Guideline: {guideline.Standard}");
            return Result.Cancelled;
        }

        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
            .OrderBy(l => l.Elevation).ToList();
        if (levels.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate", "No Levels in the model — run Datum from Drawings first.");
            return Result.Cancelled;
        }

        var plans = ViewPlanner.Plan(guideline.Views, guideline.ViewNaming,
            levels.Select(l => l.Name).ToList());
        if (plans.Count == 0)
        {
            TaskDialog.Show("Sentinel — Annotate", "The guideline's views section has no plannable (FloorPlan/CeilingPlan) entries.");
            return Result.Cancelled;
        }

        // Caches: existing view names (idempotency), templates by name, VFTs, levels by name.
        var allViews = new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>().ToList();
        var taken = new HashSet<string>(allViews.Where(v => !v.IsTemplate).Select(v => v.Name));
        var templates = allViews.Where(v => v.IsTemplate)
            .GroupBy(v => v.Name).ToDictionary(g => g.Key, g => g.First());
        var vfts = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>().ToList();
        var levelByName = levels.GroupBy(l => l.Name).ToDictionary(g => g.Key, g => g.First());

        int created = 0, skippedExisting = 0;
        var warnings = new List<string>();

        using var t = new Transaction(doc, "Sentinel — Annotate: guideline views");
        t.Start();
        foreach (var p in plans)
        {
            if (taken.Contains(p.Name)) { skippedExisting++; continue; }
            if (!levelByName.TryGetValue(p.LevelName, out Level level)) continue;

            var family = p.ViewType == "CeilingPlan" ? ViewFamily.CeilingPlan : ViewFamily.FloorPlan;
            var vft = vfts.FirstOrDefault(v => v.ViewFamily == family);
            if (vft is null) { warnings.Add($"No {family} view family type in this model — skipped '{p.Name}'."); continue; }

            var view = ViewPlan.Create(doc, vft.Id, level.Id);
            view.Name = p.Name;
            taken.Add(p.Name);

            if (!string.IsNullOrWhiteSpace(p.Template))
            {
                if (templates.TryGetValue(p.Template, out View tpl)) view.ViewTemplateId = tpl.Id;
                else warnings.Add($"View template '{p.Template}' not in this model — '{p.Name}' created without it.");
            }

            if (!string.IsNullOrWhiteSpace(p.BrowserStatus))
                ViewGenerator.SetFirstMatch(view, ViewGenerator.MainGroupParams, p.BrowserStatus);

            created++;
        }
        t.Commit();

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Created: {created} view(s) across {levels.Count} level(s).");
        if (skippedExisting > 0) sb.AppendLine($"Skipped (already exist): {skippedExisting}");
        if (warnings.Count > 0)
        {
            sb.AppendLine().AppendLine("Warnings:");
            foreach (var g in warnings.GroupBy(w => w))
                sb.AppendLine(g.Count() > 1 ? $"  • {g.Key}  (×{g.Count()})" : $"  • {g.Key}");
        }
        TaskDialog.Show("Sentinel — Annotate", sb.ToString());
        return Result.Succeeded;
    }
}
```

- [ ] **Step 3: Ribbon — the chain becomes one pulldown**

In `App.cs` `BuildRibbon`, replace the four standalone buttons on Standards & Build (`:227-233`, Datum / Ghost Builder / Photo Massing / ROI) with a grouped chain pulldown + ROI, using the existing `Pull`/`Sub` helpers (mirror the exact `Pull`/`Sub` call shapes used by the "Standards" pulldown at `:217-225` — same argument order, same icon-name convention):

```csharp
var chain = Pull(standardsPanel, "Sentinel_Chain", "Model from\nDrawings", "ghost");
Sub(chain, "Sentinel_Datum", "1 · Datum from Drawings", typeof(Sentinel.Commands.DatumFromDrawingsCommand), "ghost");
Sub(chain, "Sentinel_Ghost", "2 · Ghost Builder", typeof(Sentinel.Commands.GhostBuilderCommand), "ghost");
Sub(chain, "Sentinel_Massing", "2b · Photo Massing", typeof(Sentinel.Commands.MassingFromImagesCommand), "ghost");
Sub(chain, "Sentinel_Annotate", "3 · Annotate Views", typeof(Sentinel.Commands.AnnotateViewsCommand), "ghost");
Push(standardsPanel, "Sentinel_Roi", "ROI\nDashboard", typeof(Sentinel.Commands.RoiDashboardCommand), "roi");
```

Keep the existing button *names* (`Sentinel_Datum` etc.) so any user keyboard shortcuts survive. Adapt to the helpers' actual signatures (read them at `App.cs:252-267` first — the snippet above shows intent, the helper signatures in the file are authoritative).

- [ ] **Step 4: Build both targets**

Run: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026` and `-p:RevitVersion=2024`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/Commands.Annotate.cs SentinelAddin/Engine/ViewGenerator.cs SentinelAddin/App.cs
git commit -m "feat(chain): Annotate Views command — guideline views section becomes real views; ribbon chain 1-2-3"
```

---

### Task 8: Live verification checklist + status doc update

No unit test reaches Revit. This task is the manual live run that has caught every real bug so far (per the Gemini round-2 lesson: "unit tests were green while the real model still broke it").

**Files:**
- Modify: `docs/handbook/05-capability-status.md`

- [ ] **Step 1: Live run in Revit 2026 (or 2024), fresh model from the office template**

1. **Project Setup** → set Ghost source folder to `demo/bds-pilot/cad-template` (or a real project folder with a section DWG + plan DWG). Save to machine scope. Re-open the dialog: **all previously-set Ghost paths still present** (the Task 1 fix).
2. **1 · Datum from Drawings** → levels + grids created from the folder's DWGs.
3. **2 · Ghost Builder** → the DWG pick list appears (no manual import needed); pick the plan; in the review window the **Build on level** dropdown lists the levels Datum just created; pick a non-lowest level; Build. Verify in a section view: walls sit on the chosen level.
4. **3 · Annotate Views** → WIP plan views created per level, named `WIP_FP_<LEVEL>` etc.; where the office template holds the named view templates, they are applied; views land in the office browser structure (or the warning names the missing parameter).
5. Re-run Annotate → "Skipped (already exist)" equals the previous created count; nothing duplicated.

- [ ] **Step 2: Record the outcome honestly**

In `docs/handbook/05-capability-status.md`, "The differentiated seam" table, add:

```markdown
| Datum → Ghost → Annotate chain (folder-driven, level-aware, guideline views) | ✅ Verified *or* 🟩 Built | Live run <date>, Revit <version> — or: compiles clean, awaiting live run |
```

Use the tag the run actually earned. If the run surfaced bugs, fix them before tagging, and note anything parked.

- [ ] **Step 3: Commit**

```bash
git add docs/handbook/05-capability-status.md
git commit -m "docs: record datum->ghost->annotate chain status after live run"
```

---

## Deliberately out of scope (parked, not forgotten)

- **Tagging** (`graphics.tags` + per-view `tag` lists): net-new `IndependentTag.Create` work — next plan, now trivially plannable since `PlannedView`/`GuidelineTag` exist.
- **Sheet views** (`sheetTemplate`, `SH_` prefix): same `planViews` mechanism with `status = "SH_"` + sheet creation — follow-up.
- **Sections / 3D view entries**: need placement geometry decisions (where does the section line go?) — follow-up.
- **Auto-matching DWG→level in Datum**: rejected in design (fragile filename conventions); the review-window picker covers it.
