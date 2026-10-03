using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

int failed = 0, total = 0;
void Check(string name, bool ok)
{
    total++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}");
    if (!ok) failed++;
}

// Resolve the repo root from the SOURCE tree, not the working directory — same idiom as
// tools/guideline-check/Check.cs, so `dotnet run --project` works regardless of cwd.
string root = AppContext.BaseDirectory;
for (int i = 0; i < 6 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
    root = Path.GetFullPath(Path.Combine(root, ".."));

// The two View rules on the data, read as RulesetStore reads a ruleset@n body (snake_case enums, any case).
var rsOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) } };
Ruleset Rs(params string[] path) => JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(new[] { root }.Concat(path).ToArray())), rsOpts);
var bdsRules = Rs("demo", "bds-pilot", "ruleset.json");
var astRules = Rs("demo", "aster", "ruleset-AST.json");
var none = new Ruleset();

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
var two = new List<(string, bool)> { ("Level 0", true), ("Level 1", true) };

var plans = ViewPlanner.Plan(views, naming, two, none, null);
Check("2 plannable entries x 2 levels = 4", plans.Count == 4);
var ga0 = plans.Find(p => p.Use == "GA Plan" && p.LevelName == "Level 0");
Check("GA Plan Level 0 exists", ga0 != null);
Check("name follows [STATUS]_[TYPE]_[LEVEL]", ga0?.Name == "WIP_FP_LEVEL-0");
Check("template carried", ga0?.Template == "01.100_WIP_FLOOR_PLANS");
Check("browser status resolved from statusPrefixes", ga0?.BrowserStatus == "01_WIP_VIEWS");
Check("sections skipped", !plans.Exists(p => p.Use == "Section"));
Check("no-prefix entries skipped", !plans.Exists(p => p.Use == "Coordination"));
Check("null views -> empty", ViewPlanner.Plan(null, naming, two, none, null).Count == 0);
Check("no levels -> empty", ViewPlanner.Plan(views, naming, new List<(string, bool)>(), none, null).Count == 0);

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

// ── MA-2e (ANV-2, F2): story levels × the first FloorPlan and CeilingPlan entries pre-ticked; the rest listed ──
var bdsLevels = new List<(string, bool)> { ("GR-FFL", true), ("01-FFL", true), ("Roof", false) };
var bds = ViewPlanner.Plan(m.Views, m.ViewNaming, bdsLevels, bdsRules, new HashSet<string>());
Check("BDS: 7 plannable entries x 3 levels = 21 rows (Structural Plan and Model Management have no namePrefix or tokens)", bds.Count == 21);
Check("only story levels x GA Plan and RCP are pre-ticked",
    bds.Where(p => p.PreTicked).Select(p => p.Name).SequenceEqual(new[] { "WIP_FP_GR-FFL", "WIP_RCP_GR-FFL", "WIP_FP_01-FFL", "WIP_RCP_01-FFL" }));
Check("a level that is not a Building Story is listed, not pre-ticked, refused only for the duplicate name",
    bds.Where(p => p.LevelName == "Roof").All(p => !p.PreTicked && !p.IsStory && (p.Refusal == null) == (p.Use != "Presentation Plan (no colour)")));
var pp2 = bds.Find(p => p.Use == "Presentation Plan (no colour)" && p.LevelName == "GR-FFL");
Check("K5: the second PP entry is refused by name, not skipped in silence", pp2?.Refusal == "same name as 'Presentation Plan' on GR-FFL" && !pp2.PreTicked);
Check("every other BDS name passes VN-01 as it is (Scan Now's rule)", bds.Count(p => p.Refusal != null) == 3);
Check("the rule line names VN-01 and the ruleset",
    ViewPlanner.RuleLine(bdsRules, "ruleset@1 · office · ab12…") == "View names are checked against VN-01 (ruleset ruleset@1 · office · ab12…) — Scan Now's own rule.");
var again = ViewPlanner.Plan(m.Views, m.ViewNaming, bdsLevels, bdsRules, new HashSet<string> { "WIP_FP_GR-FFL" });
Check("a name a view or a template already holds is listed as such, unticked",
    again[0].Refusal == ViewPlanner.Existing && !again[0].PreTicked && again.Count(p => p.PreTicked) == 3);

// ANV-2's acceptance: a ':' in the prefix is reported and skipped, and the rest are still created
var colon = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", ViewType = "FloorPlan", NamePrefix = "F:P" },
    new() { Use = "RCP", ViewType = "CeilingPlan", NamePrefix = "RCP" },
};
var cp = ViewPlanner.Plan(colon, naming, two, bdsRules, null);
Check("ANV-2: a ':' in the prefix is reported and that row refused", cp[0].Refusal == "'WIP_F:P_LEVEL-0' holds ':', which Revit does not allow in a view name" && !cp[0].PreTicked);
Check("...and the rest are still planned and pre-ticked", cp.Count(p => p.PreTicked) == 2 && cp.Where(p => p.Use == "RCP").All(p => p.PreTicked));

// ANV-1 (F1 A): the View rule's tokens, from the entry and the level, never a guess
var tokened = new List<GuidelineViewStandard>
{
    new() { Use = "GA Plan", ViewType = "FloorPlan", NamePrefix = "FP", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } },
    new() { Use = "RCP", ViewType = "CeilingPlan", NamePrefix = "RCP", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "RCP", ["DESC"] = "Ceiling" } },
};
var ast = ViewPlanner.Plan(tokened, naming, new List<(string, bool)> { ("L1 - Architectural", true), ("L01", true) }, astRules, null);
Check("ANV-1: the name is the View rule's tokens in its order, from the entry and the level",
    ast.Find(p => p.LevelName == "L01" && p.Use == "GA Plan")?.Name == "ARC_L01_PLAN_GA" && ast.Find(p => p.LevelName == "L01" && p.Use == "RCP")?.Name == "ARC_L01_RCP_Ceiling");
Check("...both pass VN-01 and are pre-ticked", ast.Where(p => p.LevelName == "L01").All(p => p.Refusal == null && p.PreTicked));
Check("F44: a level name that fails LEVEL is refused by name, never mapped by a guess",
    ast.Find(p => p.LevelName == "L1 - Architectural" && p.Use == "GA Plan")?.Refusal
    == @"LEVEL 'L1 - Architectural' does not pass L\d{2}|LRF|XX (VN-01) — the level's name is used as it is: rename the level, or give the entry another LEVEL");
var l01 = new List<(string, bool)> { ("L01", true) };
var noDisc = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
Check("a token the entry does not give is refused by name",
    ViewPlanner.Plan(noDisc, naming, l01, astRules, null)[0].Refusal == "'GA Plan' gives no DISC — VN-01 needs it; add it to the entry's tokens");
var fp = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "FP", ["DESC"] = "GA" } } };
Check("a value that fails its token's definition is refused, naming the definition",
    ViewPlanner.Plan(fp, naming, l01, astRules, null)[0].Refusal == "TYPE 'FP' does not pass PLAN|RCP|SEC|ELEV|DET|3D|SCH (VN-01)");
var fixedAst = ViewPlanner.Plan(views, naming, l01, astRules, null);
Check("F44: a fixed WIP_ name the project's View rule refuses is never created",
    fixedAst[0].Refusal == "'WIP_FP_L01' does not pass VN-01: View 'WIP_FP_L01' does not match [DISCIPLINE]_[LEVEL]_[TYPE]_[DESCRIPTION]." && !fixedAst.Any(p => p.PreTicked));
Check("no View rule: a fixed name is planned and the line says it is not checked",
    ViewPlanner.Plan(views, naming, two, none, null).Count(p => p.PreTicked) == 4
    && ViewPlanner.RuleLine(none, "none — not installed for p-none or its office") == "View names not checked: no View rule with tokens or a whitelist in the ruleset (none — not installed for p-none or its office).");
Check("no View rule: an entry named by tokens is refused, since nothing orders them",
    ViewPlanner.Plan(tokened, naming, two, none, null).All(p => p.Refusal == "'" + p.Use + "' names its view by tokens, but no View rule with tokens is installed to order them"));
var flat = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "XX", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
var fl = ViewPlanner.Plan(flat, naming, new List<(string, bool)> { ("L01", true), ("L02", true) }, astRules, null);
Check("E5: an entry without {level} names every level alike: the second row is refused, not created twice", fl[0].Refusal == null && fl[1].Refusal == "same name as 'GA Plan' on L01");
var parsed = JsonSerializer.Deserialize<GuidelineViewStandard>("{\"use\":\"GA Plan\",\"viewType\":\"FloorPlan\",\"tokens\":{\"DISC\":\"ARC\",\"LEVEL\":\"{level}\"}}");
Check("a guideline view entry's tokens deserialize", parsed.Tokens?["LEVEL"] == "{level}" && parsed.Tokens.Count == 2);

// ── review C5: Scan Now's CheckName, whole — a whitelist-only View rule, an exclusion, a rule that needs the office code ──
var wl = new Ruleset { Rules = { new Rule { Id = "VN-WL", Target = RuleTarget.View, Whitelist = { "GA-PLAN" }, MessageEn = "View '{name}' is not on the list." } } };
Check("C5: a whitelist-only View rule refuses a name it does not list, as Scan Now would flag it",
    ViewPlanner.Plan(views, naming, l01, wl, null)[0].Refusal == "'WIP_FP_L01' does not pass VN-WL: View 'WIP_FP_L01' is not on the list.");
var excluded = Rs("demo", "aster", "ruleset-AST.json");
excluded.Rules.First(r => r.Id == "VN-01").Exclusions.Add("^WIP_");
Check("C5: an excluded name passes although the pattern fails (Scan Now skips it)", ViewPlanner.Plan(views, naming, l01, excluded, null)[0].Refusal == null);
var orgRule = new Ruleset { Rules = { new Rule { Id = "VN-ORG", Target = RuleTarget.View, Tokens = { "ORG", "LEVEL" }, TokenDefs = { ["ORG"] = "{org}", ["LEVEL"] = @"L\d{2}" } } } };
Check("C5: a rule that needs the office code, with ruleset.org empty, refuses in words (fails closed, never a literal {org})",
    ViewPlanner.Plan(views, naming, l01, orgRule, null).All(p => p.Refusal == "VN-ORG needs an office code and ruleset.org is empty — the name cannot be judged; set the office code"));
var extraTok = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISCIPLINE"] = "ARC", ["DISC"] = "ARC", ["LEVEL"] = "{level}", ["TYPE"] = "PLAN", ["DESC"] = "GA" } } };
Check("C11: a token the View rule does not have is refused by name, never dropped in silence",
    ViewPlanner.Plan(extraTok, naming, l01, astRules, null)[0].Refusal == "'GA Plan' gives DISCIPLINE, which VN-01 does not have (its tokens: DISC, LEVEL, TYPE, DESC)");

// ── MA-2e (DAT-3, F3 A, F7): the pin rows, the read-back and the B31 words ──
var pinRows = ViewPlanner.Pins(new[]
{
    new DatumFact { Id = 1, Kind = "Level", Name = "GR-FFL", IsStory = true },
    new DatumFact { Id = 2, Kind = "Level", Name = "01-FFL", IsStory = true, Pinned = true },
    new DatumFact { Id = 3, Kind = "Level", Name = "Roof", IsStory = false },
    new DatumFact { Id = 4, Kind = "Grid", Name = "A" },
    new DatumFact { Id = 5, Kind = "Grid", Name = "B", OwnedBy = "anna" },
    new DatumFact { Id = 6, Kind = "Grid", Name = "C", ChangedInCentral = true },
});
Check("DAT-3: every unpinned level and grid is listed; one already pinned is not", pinRows.Select(p => p.Id).SequenceEqual(new long[] { 1, 3, 4, 5, 6 }));
Check("...story levels and grids pre-ticked; a level that is not a story listed unticked",
    pinRows.Where(p => p.PreTicked).Select(p => p.Id).SequenceEqual(new long[] { 1, 4 }) && pinRows[1].Label == "Level 'Roof' (not a Building Story)" && pinRows[2].Label == "Grid 'A'");
Check("F7 (review C7): a datum another user owns, or one changed in central, is listed unticked with the reason",
    pinRows[3].Refusal == "owned by anna in this workshared model — pin it once they relinquish it" && !pinRows[3].PreTicked
    && pinRows[4].Refusal == "changed in central — reload latest, then pin it" && !pinRows[4].PreTicked);
Check("S3 (review C6): the MH-LNK-01 substitute reads every level and grid from the model and says links are not checked",
    ViewPlanner.PinnedLine(2, 2, 0, 1, 3, 4) == "Pinned now: 2/2 story level(s), 0/1 other level(s), 3/4 grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).");
Check("S1 (review C3): the B31 words, in every model",
    ViewPlanner.UndoWords() == "Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list \"Sentinel: Annotate views\", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.");

// ── MA-2e: Annotate's wiring, by source scan (Revit-bound; proven in drill MA2e) ──
string Src(params string[] p) => File.ReadAllText(Path.Combine(new[] { root, "SentinelAddin" }.Concat(p).ToArray()));
int CountOf(string s, string what) { int n = 0; for (int i = s.IndexOf(what); i >= 0; i = s.IndexOf(what, i + what.Length)) n++; return n; }
var ann = Src("Commands.Annotate.cs");
var annN = ann.Replace("\r\n", "\n"); // a guard is pinned with the return that follows it (review C12)
int run = ann.IndexOf("SentinelUndo.Run(doc, \"Annotate views\"");
int shown = ann.IndexOf("pick.ShowDialog() != true");
int pinLoop = ann.IndexOf("foreach (var pin in pick.Pins)");
Check("XC-2/S1: Annotate writes inside one SentinelUndo group, and its one Transaction is inside it",
    run > 0 && CountOf(ann, "new Transaction(") == 1 && ann.IndexOf("new Transaction(") > run);
Check("ANV-2: each view in its own SubTransaction, rolled back alone on a throw, Revit asked for the name",
    ann.Contains("using var st = new SubTransaction(doc);") && ann.Contains("if (st.HasStarted() && !st.HasEnded()) st.RollBack();") && ann.Contains("NamingUtils.IsValidName(p.Name)"));
Check("F6: the model's default plan and ceiling plan view types, never the first one found",
    ann.Contains("GetDefaultElementTypeId(ElementTypeGroup.ViewTypeFloorPlan)") && ann.Contains("GetDefaultElementTypeId(ElementTypeGroup.ViewTypeCeilingPlan)") && !ann.Contains("OfClass(typeof(ViewFamilyType))"));
Check("DAT-3: only ticked pins are pinned; Building Story is read through the one projection, never set (DAT-2)",
    CountOf(ann, ".Pinned = true") == 1 && pinLoop > run && pinLoop < ann.IndexOf(".Pinned = true") && ann.Contains("ChangesetExecutor.Stories(doc)") && !ann.Contains("LEVEL_IS_BUILDING_STORY"));
int loaded = ann.IndexOf("!engine.Has(doc)");
Check("F4 (review C1): the ruleset is Scan Now's cached one — no network call — and 'not loaded yet' refuses before the plan, never read as none",
    ann.Contains("engine.RulesetFor(doc)") && !ann.Contains("RulesetStore.Load(") && !ann.Contains("RulesetStore.None()")
    && loaded > 0 && loaded < ann.IndexOf("ViewPlanner.Plan(")
    && annN.Contains("then Annotate again. Nothing was created.\");\n            return Result.Cancelled;"));
Check("a person decides: the preview opens before anything is written, and Cancel writes nothing",
    shown > 0 && shown < run && ann.Contains("if (pick.ShowDialog() != true) return Result.Cancelled;"));
Check("the result counts the views it could not route, reads the pins back and says B31 in words, in the preview and the result (review C3: every model)",
    ann.Contains("ViewGenerator.SetFirstMatch(view, routeParams, p.BrowserStatus)") && ann.Contains("if (!routed) unrouted++;")
    && ann.Contains("ViewPlanner.PinnedLine(") && CountOf(ann, "ViewPlanner.UndoWords()") == 2);
int nothingAt = ann.IndexOf("ViewPlanner.NothingToPlan(");
Check("review C10: with no guideline (or no views section) Annotate refuses before any preview opens (the 4b-2 guard, AST-1 retired)",
    nothingAt > 0 && nothingAt < ann.IndexOf("new AnnotatePreviewWindow(") && annN.Contains("TaskDialog.Show(Title, nothing);\n            return Result.Cancelled;"));
Check("F3: Datum's result names Annotate as the next step", Src("Commands.Datum.cs").Contains("Next: 3 · Annotate Views"));

Console.WriteLine($"{total - failed}/{total} checks pass");
Console.WriteLine(failed == 0 ? "ALL PASS" : $"{failed} FAILED");
return failed == 0 ? 0 : 1;
