using System;
using System.Collections.Generic;
using System.IO;
using Sentinel.GhostBuilder;

int failed = 0;
void Check(string name, bool ok)
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failed++;
}

// Resolve the repo root from the SOURCE tree, not the working directory — same idiom as
// tools/guideline-check/Check.cs, so `dotnet run --project` works regardless of cwd.
string root = AppContext.BaseDirectory;
for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
    root = Path.GetFullPath(Path.Combine(root, ".."));

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

// Annotate's refusal names the guideline in force (cohesion 4b-2): none, or one without views, plans nothing.
Check("none refuses in the spec's words",
    ViewPlanner.NothingToPlan("none — not installed for p-none or its office", false, null)
    == "Guideline: none — not installed for p-none or its office. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline without views refuses, naming it",
    ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, new List<GuidelineViewStandard>())
    == "Guideline: guideline@1 · office · 0123456789ab… has no views section. Nothing to plan — install a guideline@n with a views section on the project or its office.");
Check("a guideline with views plans", ViewPlanner.NothingToPlan("guideline@1 · office · 0123456789ab…", true, views) == null);

// the pilot's guideline (demo/bds-pilot/, what B7 installs as the pilot office's guideline@1) parses with the new sections
var m = GuidelineMatcher.FromBodies(File.ReadAllText(Path.Combine(root, "demo", "bds-pilot", "bds-guideline.json")), null, out var guidelineError, out _);
Check("BDS guideline loads" + (guidelineError == null ? "" : " — " + guidelineError), m.HasGuideline);
Check("BDS views section deserialized", m.Views != null && m.Views.Count > 0);
Check("BDS GA Plan wipTemplate", m.Views?.Find(v => v.Use == "GA Plan")?.WipTemplate == "01.100_WIP_FLOOR_PLANS");
Check("BDS door tag family", m.Graphics?.Tags?["Doors"]?.Family == "BDS_Door Tag");

Console.WriteLine(failed == 0 ? "ALL PASS" : $"{failed} FAILED");
return failed == 0 ? 0 : 1;
