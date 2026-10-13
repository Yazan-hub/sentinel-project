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
var wlTok = new Ruleset { Rules = { new Rule { Id = "VN-WT", Target = RuleTarget.View, Tokens = { "DISC", "LEVEL" }, TokenDefs = { ["LEVEL"] = @"L\d{2}" }, Whitelist = { "ARC_Level 1" } } } };
var discLevel = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", Tokens = new() { ["DISC"] = "ARC", ["LEVEL"] = "{level}" } } };
var wt = ViewPlanner.Plan(discLevel, naming, new List<(string, bool)> { ("Level 1", true), ("Level 2", true) }, wlTok, null);
Check("C14: a whitelisted name whose token value fails its definition is creatable, as Scan Now passes it; an unlisted one keeps the token's words",
    wt[0].Name == "ARC_Level 1" && wt[0].Refusal == null && wt[0].PreTicked
    && wt[1].Refusal == @"LEVEL 'Level 2' does not pass L\d{2} (VN-WT) — the level's name is used as it is: rename the level, or give the entry another LEVEL");

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
Check("F4 (review C1, C16): the ruleset is Scan Now's cached one — no network call — and 'not loaded yet' refuses before the guideline's GET and the plan, never read as none",
    ann.Contains("engine.RulesetFor(doc)") && !ann.Contains("RulesetStore.Load(") && !ann.Contains("RulesetStore.None()")
    && loaded > 0 && loaded < ann.IndexOf("ViewPlanner.Plan(") && loaded < ann.IndexOf("GhostStandards.Load(")
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

// ── MA-8-11 (ANV-3): templates from the office file — the pure half, then the wiring by source scan (Revit-bound; drill C-1) ──
{
    var rowsT = new List<PlannedView>
    {
        new() { Name = "a", Template = "T_FLOOR" }, new() { Name = "b", Template = "T_FLOOR" }, new() { Name = "c", Template = "T_RCP" },
        new() { Name = "d", Template = "T_HAVE" }, new() { Name = "e", Template = "T_REFUSED", Refusal = "x" }, new() { Name = "f", Template = " " }, new() { Name = "g" },
    };
    var miss = ViewPlanner.Missing(rowsT, new HashSet<string> { "T_HAVE" });
    Check("MA-8-11: Missing = the distinct templates the creatable rows name that the model lacks (not a refused row's, not a blank)", miss.SequenceEqual(new[] { "T_FLOOR", "T_RCP" }));
    Check("MA-8-11: nothing missing when all are present", ViewPlanner.Missing(rowsT, new HashSet<string> { "T_HAVE", "T_FLOOR", "T_RCP" }).Count == 0 && ViewPlanner.Missing(null, null).Count == 0);
    var tr = ViewPlanner.TemplateRows(new[] { "T_FLOOR", "T_RCP", "T_SEC", "T_VIEW" }, new Dictionary<string, string> { ["T_FLOOR"] = "FloorPlan", ["T_SEC"] = "Section", ["T_VIEW"] = "FloorPlan" },
        "office.rte", new HashSet<string> { "T_VIEW" });
    Check("MA-8-11: a template in the file as a plan template has no refusal", tr[0].Refusal == null);
    Check("MA-8-11: not in the file either -> its views are created without it", tr[1].Refusal == "not in office.rte either — its views are created without it");
    Check("MA-8-11: a Section template cannot be used by a plan", tr[2].Refusal == "in office.rte as a Section template — a plan view cannot use it");
    Check("MA-8-11: a view in this model already holds the name", tr[3].Refusal == "a view in this model already holds the name");
    Check("MA-8-11 (amendment 16): nothing is pre-ticked", tr.All(r => !r.PreTicked));
    var line = ViewPlanner.TemplateFileLine("office.rte", "0123456789abcdef", "BDS_Other", "BDS_Project", "2024", 3.24, true);
    Check("MA-8-11: the file line names the file, 12 sha characters, the title, the format, the seconds and warns on a title mismatch",
        line.Contains("office.rte (sha256 0123456789ab…;") && line.Contains("title 'BDS_Other'") && line.Contains("WARNING: not the catalogue's 'BDS_Project'") && line.Contains("saved in Revit 2024") && line.Contains("3.2 s") && line.EndsWith("It is never saved."));
    Check("...no warning when the titles agree; 'already open' when it was",
        !ViewPlanner.TemplateFileLine("o.rte", "ab", "T", "t", "2024", 0, false).Contains("WARNING") && ViewPlanner.TemplateFileLine("o.rte", "ab", "T", "t", "2024", 0, false).Contains("already open in this session"));

    var off = Src("Engine", "OfficeTemplate.cs");
    int pickAt = ann.IndexOf("OfficeTemplate.Open(");
    int copyAt = ann.IndexOf("ElementTransformUtils.CopyElements(");
    int finAt = ann.LastIndexOf("finally");
    Check("MA-8-11: the file is picked and opened before the preview, and a refusal is a dialog and Cancelled with nothing written",
        pickAt > 0 && pickAt < ann.IndexOf("new AnnotatePreviewWindow(") && annN.Contains("TaskDialog.Show(Title, why); return Result.Cancelled;"));
    Check("MA-8-11: one Close(false), in a finally, and only for a document this run opened",
        CountOf(ann, ".Close(false)") == 1 && finAt > ann.IndexOf("TaskDialog.Show(Title, sb.ToString())") && ann.IndexOf(".Close(false)") > finAt && ann.Contains("try { if (src != null && src.Opened) src.Doc.Close(false); }") && ann.Contains("could not be closed in the background"));
    Check("MA-8-11: the office file is never saved - no Save( / SaveAs( in either file",
        !off.Contains(".Save(") && !off.Contains("SaveAs(") && !ann.Contains(".Save(") && !ann.Contains("SaveAs(") && !ann.Contains("SaveAsOptions"));
    int detach = off.IndexOf("DetachFromCentralOption"), shared = off.IndexOf("if (info.IsWorkshared)");
    Check("MA-8-11: detached only when workshared, with every workset closed", shared > 0 && detach > shared && off.Contains("WorksetConfigurationOption.CloseAllWorksets") && CountOf(off, "DetachFromCentralOption") == 2);
    Check("MA-8-11: an already-open document is used (not linked) and flagged not-opened; the hash is read with FileShare.ReadWrite",
        off.Contains("!d.IsLinked && Same(path, d.PathName)") && off.Contains("ReferenceEquals(d, doc)") && off.Contains("Opened = !held") && off.Contains("catch (Exception) { return string.Equals(a, b") && off.Contains("Opened = false") && off.Contains("FileShare.ReadWrite"));
    Check("MA-8-11: the copy is a SubTransaction inside the one Transaction, after the group starts and before the views loop, with UseDestinationTypes; a renamed copy rolls back",
        copyAt > run && copyAt < ann.IndexOf("foreach (var p in pick.Views)") && copyAt > ann.IndexOf("new Transaction(") && ann.Contains("new StandardsBuilder.UseDestinationTypes()")
        && ann.Contains("Revit renamed it to") && CountOf(ann, "new Transaction(") == 1);
    Check("MA-8-11 (amendment 5): templates count in the guard, the keep and the nothing-created exit",
        ann.Contains("pick.Views.Count + pick.Pins.Count + pick.Templates.Count + pick.Sheets.Count + pick.Tags.Count == 0")
        && ann.Contains("committed && created.Count + claimedPins + copiedNames.Count + sheetsMade.Count + tagRuns.Sum(r => r.Placed) > 0")
        && ann.Contains("present.Count + pinnedNow.Count + templatesNow.Count + sheetsNow.Count + tagsNow.Sum(t => t.Placed) == 0"));
    Check("MA-8-11 (review): a template no ticked view uses is not copied; IsValidViewTemplate guards the assignment; the undo line counts templates",
        ann.Contains("no ticked view or sheet uses it") && ann.Contains("view.IsValidViewTemplate(") && ann.Contains("{templatesNow.Count} view template(s) are in the model") && ann.Contains("tplUsed"));
    Check("MA-8-11 (review): a detached title matches the catalogue's", !ViewPlanner.TemplateFileLine("o.rte", "ab", "T_detached", "T", "2024", 0, true).Contains("WARNING"));
    Check("MA-8-11 (amendment 6): the row's copied names are read back from the model, and the path is never sent",
        ann.Contains("v.IsTemplate && copiedNames.Contains(v.Name)") && ann.Contains("Copied = templatesNow") && ann.Contains("FileName = src.FileName") && off.Contains("string name = Path.GetFileName(path);") && off.Contains("FileName = name"));
}

// ── MA-8-12 (ANV-4 sheets, ANV-5 tags, MH-VW-01): the pure half, then the wiring by source scan (Revit-bound; drill C-2, C-3) ──
{
    var bdsSheets = new GuidelineSheets { TitleBlock = "BDS_Sheet : A1", Number = "A-{level}-{n}", Name = "{use} — {level}" };
    var noNames = new HashSet<string>();
    var sp = SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, "L01", none, noNames, noNames);
    Check("MA-8-12: BDS has 7 plan entries with a sheet template (Section and 3D entries make no row)", sp.Count == 7 && !sp.Exists(s => s.Use == "Section" || s.Use == "3D View"));
    Check("MA-8-12: the sheet view is SH_<prefix>_<LEVEL>, routed by the SH_ status, on the sheet template",
        sp[0].ViewName == "SH_FP_L01" && sp[0].BrowserStatus == "02_SHEET_VIEWS" && sp[0].Template == "02.100_SHEET_FLOOR_PLANS" && sp[5].ViewName == "SH_RCP_L01" && sp[5].ViewType == "CeilingPlan");
    Check("MA-8-12: the number and name fill the patterns; {n} is the entry's index among the sheet entries",
        sp[0].Number == "A-L01-01" && sp[0].Name == "GA Plan — L01" && sp[5].Number == "A-L01-06" && sp[6].Number == "A-L01-07" && sp[6].Name == "Enlarged Drawing — L01");
    Check("MA-8-12 (amendment 11): the second PP entry collides on name and is refused, yet keeps its index so the numbers after it stay put",
        sp[2].Refusal == "same name as 'Presentation Plan'" && sp[3].Number == "A-L01-04" && sp.Count(s => s.Refusal != null) == 1);
    Check("MA-8-12 (amendment 16): no sheet row is pre-ticked", sp.All(s => !s.PreTicked));
    var held = SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, "L01", none, new HashSet<string> { "SH_FP_L01" }, new HashSet<string> { "A-L01-02" });
    Check("MA-8-12: a view name or a sheet number the model holds is refused, in words",
        held[0].Refusal == ViewPlanner.Existing && held[1].Refusal == "a sheet in the model already holds this number" && held.Count(s => s.Refusal != null) == 3);
    var same = SheetPlanner.Plan(m.Views, m.ViewNaming, new GuidelineSheets { TitleBlock = "F : T", Number = "A-{level}", Name = "{prefix}-{n}" }, "L01", none, noNames, noNames);
    Check("MA-8-12: a number every row fills alike is taken by the first row only", same[0].Refusal == null && same[1].Refusal == "same number as 'GA Plan'" && same[0].Name == "FP-01");
    var colonNo = SheetPlanner.Plan(m.Views, m.ViewNaming, new GuidelineSheets { TitleBlock = "F : T", Number = "A:{level}-{n}", Name = "{use}" }, "L01", none, noNames, noNames);
    Check("MA-8-12: a character Revit refuses in a number is refused in words", colonNo[0].Refusal == "'A:L01-01' holds ':', which Revit does not allow in a sheet number");
    var pipe = SheetPlanner.Plan(m.Views, m.ViewNaming, new GuidelineSheets { TitleBlock = "F : T", Number = "{level}-{n}", Name = "{use}|{level}" }, "L01", none, noNames, noNames);
    Check("MA-8-12: ...and in a name", pipe[0].Refusal == "'GA Plan|L01' holds '|', which Revit does not allow in a sheet name");
    var sheetRule = new Ruleset { Rules = { new Rule { Id = "SN-WL", Target = RuleTarget.Sheet, Whitelist = { "A-L01-01" }, MessageEn = "Sheet '{name}' is not on the list." } } };
    var judged = SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, "L01", sheetRule, noNames, noNames);
    Check("MA-8-12 (V5): the number is judged by Scan Now's Sheet rule - a listed number passes, another is refused with the rule's words",
        judged[0].Refusal == null && judged[1].Refusal == "'A-L01-02' does not pass SN-WL: Sheet 'A-L01-02' is not on the list.");
    var bdsJudged = SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, "L01", bdsRules, noNames, noNames);
    Check("MA-8-12: BDS's own sheet rule (SN-01, ten tokens) refuses the pattern's number, naming the rule - the guideline's pattern is the office's to fix",
        bdsJudged[0].Refusal != null && bdsJudged[0].Refusal.Contains("SN-01") && bdsJudged[0].ViewName == "SH_FP_L01");
    var orgSheet = new Ruleset { Rules = { new Rule { Id = "SN-ORG", Target = RuleTarget.Sheet, Tokens = { "ORG", "N" }, TokenDefs = { ["ORG"] = "{org}" } } } };
    Check("MA-8-12: a Sheet rule that needs the office code, with ruleset.org empty, refuses in words (fails closed)",
        SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, "L01", orgSheet, noNames, noNames)[0].Refusal == "SN-ORG needs an office code and ruleset.org is empty — the number cannot be judged; set the office code");
    var tokenEntry = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", SheetTemplate = "T", Tokens = new() { ["DISC"] = "ARC" } },
        new() { Use = "Section", ViewType = "Section", SheetTemplate = "S", NamePrefix = "SEC" }, new() { Use = "No sheet", ViewType = "FloorPlan", NamePrefix = "NS" } };
    var tk = SheetPlanner.Plan(tokenEntry, naming, bdsSheets, "L01", astRules, noNames, noNames);
    Check("MA-8-12: a token-named entry is refused in words (ponytail); a Section entry and an entry with no sheet template make no row",
        tk.Count == 1 && tk[0].Refusal == "named by tokens — its sheet view needs sheet tokens the guideline does not have yet" && tk[0].ViewName == null);
    Check("MA-8-12: one line says the Section and 3D entries are not per level, naming them",
        SheetPlanner.NotPerLevel(m.Views) == "5 sheet entries (Elevation, Section, Enlarged Section, Typical Detail, 3D View) are sections, elevations or 3D views - not per level, so no sheet row for them."
        && SheetPlanner.NotPerLevel(views) == null);
    Check("MA-8-12: no sheets block, no level or no views plan nothing",
        SheetPlanner.Plan(m.Views, m.ViewNaming, null, "L01", none, noNames, noNames).Count == 0 && SheetPlanner.Plan(m.Views, m.ViewNaming, bdsSheets, " ", none, noNames, noNames).Count == 0
        && SheetPlanner.Plan(null, m.ViewNaming, bdsSheets, "L01", none, noNames, noNames).Count == 0);

    // amendment 7: the copy list takes the sheet templates of the entries SheetPlanner would plan, not every sheet entry
    var tpls = SheetPlanner.Templates(m.Views, bdsSheets);
    Check("MA-8-12 (amendment 7): the sheet templates are the 7 plan entries', not the Section or 3D ones", tpls.Count == 7 && tpls[0] == "02.100_SHEET_FLOOR_PLANS" && !tpls.Any(t => t.Contains("SECTIONS") || t.Contains("3D")) && SheetPlanner.Templates(m.Views, null).Count == 0);
    Check("MA-8-12: Missing adds the sheet templates the model lacks to the rows' (after them), with no sheets block it is as before",
        ViewPlanner.Missing(new List<PlannedView> { new() { Name = "a", Template = "W" } }, new HashSet<string> { "02.100_SHEET_FLOOR_PLANS" }, tpls).SequenceEqual(new[] { "W" }.Concat(tpls.Skip(1)))
        && ViewPlanner.Missing(new List<PlannedView> { new() { Name = "a", Template = "W" } }, new HashSet<string>(), null).SequenceEqual(new[] { "W" }));

    // the tag rows
    var tags = SheetPlanner.Tags(sp, m.Graphics);
    var doors = tags.Find(t => t.ViewName == "SH_FP_L01" && t.Category == "Doors");
    var rooms = tags.Find(t => t.ViewName == "SH_FP_L01" && t.Category == "Rooms");
    var ceilings = tags.Find(t => t.Category == "Ceilings");
    Check("MA-8-12: a tag row for each category of each creatable sheet entry (GA 3, PP 1, Area 1, RCP 1, Enlarged 3); the refused sheet has none", tags.Count == 9 && !tags.Any(t => t.ViewName == null));
    Check("MA-8-12: Doors is an IndependentTag on the guideline's own tag", doors.ElementBic == "OST_Doors" && doors.TagBic == "OST_DoorTags" && doors.How == "independent" && doors.Family == "BDS_Door Tag" && doors.Type == "BDS_Door Tag" && doors.OfficeAuthored && doors.Refusal == null);
    Check("MA-8-12 (amendment 13): Rooms go through NewRoomTag, not IndependentTag", rooms.How == "room" && rooms.ElementBic == "OST_Rooms" && rooms.TagBic == "OST_RoomTags" && rooms.Type == "Number, Number, Area_1-100");
    Check("MA-8-12: a tag that names a family and no type carries no type (the command asks the model), and is not the office's", ceilings.Family == "M_Ceiling Tag w Height" && ceilings.Type == null && !ceilings.OfficeAuthored && ceilings.TagBic == "OST_CeilingTags");
    Check("MA-8-12 (amendment 16): no tag row is pre-ticked", tags.All(t => !t.PreTicked));
    var gapEntry = new List<GuidelineViewStandard> { new() { Use = "GA Plan", ViewType = "FloorPlan", SheetTemplate = "T", NamePrefix = "FP", Tag = new() { "Walls", "Doors", "Curtain Walls", "doors", " Windows " } } };
    var gapTags = SheetPlanner.Tags(SheetPlanner.Plan(gapEntry, naming, bdsSheets, "L01", none, noNames, noNames), new GuidelineGraphics { Tags = new() { ["Walls"] = new GuidelineTag { Family = "M_Wall Tag" }, ["Windows"] = new GuidelineTag { Family = "W Tag", Type = " 8mm " } } });
    Check("MA-8-12 (amendment 10): a category Sentinel does not tag gets a refusal in words, so does one the guideline names no tag for; a repeat is one row",
        gapTags.Count == 4 && gapTags[0].Refusal == "Sentinel does not tag Walls yet" && gapTags[1].Refusal == "the guideline names no tag for Doors (graphics.tags)"
        && gapTags[2].Refusal == "Sentinel does not tag Curtain Walls yet" && gapTags[3].Refusal == null && gapTags[3].Type == "8mm" && gapTags[3].Category == "Windows");
    Check("MA-8-12: no graphics block at all is a gap, not a crash", SheetPlanner.Tags(sp, null).All(t => t.Refusal != null));

    // MH-VW-01
    var wipSet = new HashSet<string> { "WIP_T" };
    var facts = new List<ViewFact>
    {
        new() { Name = "open1", Level = "L01", Printable = true }, new() { Name = "open2", Level = "L01", Printable = true, Template = "OTHER_T" },
        new() { Name = "wip", Level = "L01", Printable = true, Template = "WIP_T" }, new() { Name = "onsheet", Level = "L01", Printable = true, OnSheet = true },
        new() { Name = "tpl", Level = "L01", Printable = true, IsTemplate = true }, new() { Name = "unprintable", Level = "L01", Printable = false },
        new() { Name = "other level", Level = "L02", Printable = true }, new() { Name = "no level", Level = null, Printable = true },
    };
    var mh = SheetPlanner.MhVw01(facts, "L01", wipSet);
    Check("MA-8-12 (C-3): MH-VW-01 counts the printable plans of the level on no sheet, less those on a WIP template - another level, templates, views on sheets, unprintable and WIP views are left out",
        mh.Count == 2 && mh.Names.SequenceEqual(new[] { "open1", "open2" }) && mh.WipExcepted == 1);
    Check("MA-8-12: the line names the level, the count, the WIP exception, that Annotate counts it and that the health engine is not built",
        mh.Line() == "MH-VW-01 on L01: 2 printable plan view(s) of this level on no sheet (1 on a WIP template excepted) — counted by Annotate; plans only (sections, elevations and 3D views have no level); the model health engine is not built (D12)");
    Check("MA-8-12: nothing left over reads 0, and the names stop at 20",
        SheetPlanner.MhVw01(new List<ViewFact>(), "L01", wipSet).Count == 0
        && SheetPlanner.MhVw01(Enumerable.Range(0, 30).Select(i => new ViewFact { Name = "v" + i, Level = "L01", Printable = true }), "L01", null).Names.Count == 20
        && SheetPlanner.MhVw01(Enumerable.Range(0, 30).Select(i => new ViewFact { Name = "v" + i, Level = "L01", Printable = true }), "L01", null).Count == 30);

    // the guideline's sheets block, through the add-in's CheckGuideline, against the bridge's cases
    using (var cases = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "WebApp", "bridge", "fixtures", "guideline-sheets", "cases.json"))))
        foreach (var c in cases.RootElement.EnumerateArray())
        {
            var body = System.Text.Json.Nodes.JsonNode.Parse("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\",\"rules\":[]}]}").AsObject();
            var sh = c.GetProperty("sheets");
            body["sheets"] = sh.ValueKind == JsonValueKind.Null ? null : System.Text.Json.Nodes.JsonNode.Parse(sh.GetRawText());
            var gm = GuidelineMatcher.FromBodies(body.ToJsonString(), null, out string sheetsError, out _);
            string want = c.GetProperty("error").ValueKind == JsonValueKind.Null ? null : c.GetProperty("error").GetString();
            Check("MA-8-12: parity with the bridge - " + c.GetProperty("name").GetString() + (want == null ? ": accepted" : ": refused") + (sheetsError == want ? "" : " (the add-in said: " + (sheetsError ?? "accepted") + ")"),
                sheetsError == want && gm.HasGuideline == (want == null));
        }
    var withBlock = GuidelineMatcher.FromBodies("{\"standard\":\"x\",\"elements\":[{\"category\":\"Walls\",\"rules\":[]}],\"sheets\":{\"titleBlock\":\"BDS_Sheet : A1\",\"number\":\"A-{level}-{n}\",\"name\":\"{use}\"}}", null, out _, out _);
    Check("MA-8-12: the block is read as written; no block reads null", withBlock.Sheets?.TitleBlock == "BDS_Sheet : A1" && withBlock.Sheets.Number == "A-{level}-{n}" && m.Sheets == null);

    // wiring
    var win = Src("UI", "AnnotatePreviewWindow.cs");
    int canAdd = ann.IndexOf("Viewport.CanAddViewToSheet("), vpCreate = ann.IndexOf("Viewport.Create(");
    int sheetLoop = ann.IndexOf("foreach (var sp in pick.Sheets)"), tagLoop = ann.IndexOf("foreach (var tg in pick.Tags)");
    Check("MA-8-12: CanAddViewToSheet is asked before Viewport.Create, the sheet is made on the title block, and the sheet and tag rows come before the pins, inside the one group",
        canAdd > 0 && canAdd < vpCreate && ann.Contains("ViewSheet.Create(doc, tb.Id)") && ann.Contains("if (!tb.IsActive) tb.Activate();")
        && sheetLoop > run && sheetLoop < tagLoop && tagLoop < pinLoop && CountOf(ann, "new Transaction(") == 1 && CountOf(ann, "ViewPlanner.UndoWords()") == 2);
    Check("MA-8-12 (amendment 9): the model is regenerated between the sheets and the tags; each sheet and each tag set is its own SubTransaction, rolled back alone",
        ann.IndexOf("if (sheetViews.Count > 0) doc.Regenerate();") > sheetLoop && ann.IndexOf("if (sheetViews.Count > 0) doc.Regenerate();") < tagLoop && CountOf(ann, "using var st = new SubTransaction(doc);") == 4);
    Check("MA-8-12 (amendment 13): Rooms use NewRoomTag then ChangeTypeId, IndependentTag.Create is the other path and names no room category, and a tag row waits for its sheet view",
        ann.Contains("doc.Create.NewRoomTag(new LinkElementId(room.Id)") && ann.Contains("tag.ChangeTypeId(symId)") && CountOf(ann, "IndependentTag.Create(") == 1 && !ann.Contains("OST_Rooms")
        && ann.Contains("SheetPlanner.SheetNotMade") && !ann.Contains("NewAreaTag") && !ann.Contains("NewSpaceTag"));
    Check("MA-8-12 (amendment 5): sheet views stay out of `created`; sheets and tags count in the guard, the keep and the nothing-created exit",
        ann.Contains("sheetViews[sp.ViewName] = view.Id;") && !ann.Contains("created.Add(sp.") && ann.Contains("pick.Sheets.Count + pick.Tags.Count == 0") && ann.Contains("sheetsMade.Count + tagRuns.Sum(r => r.Placed) > 0")
        && ann.Contains("sheetsNow.Count + tagsNow.Sum(t => t.Placed) == 0"));
    int group = ann.IndexOf("kept = SentinelUndo.Run(doc, \"Annotate views\""), readBack = ann.IndexOf("var sheetsNow = new List<");
    Check("MA-8-12: the sheets, viewports and tags are read back after the group, and MH-VW-01 is read from the model after it too, beside the ledger row",
        readBack > group && ann.IndexOf("SheetPlanner.MhVw01(facts, pick.SheetLevel, wipTemplates)") > readBack && ann.Contains("v.CanBePrinted") && ann.Contains("OfClass(typeof(Viewport))")
        && ann.Contains("tagsNow.Add((r.View, r.Category, r.Tag, held, r.Skipped, r.Why))") && ann.Contains("more.Mh = (mh.Level, mh.Count, mh.Names, mh.WipExcepted, mh.Line());") && ann.Contains("mh.Line()"));
    Check("MA-8-12: one level per run, none by default, chosen in the preview; the title block and every tag type are looked up in the model (Sentinel loads no families) and a miss refuses the row in words",
        win.Contains("combo.SelectedIndex = 0;") && win.Contains("(none this run)") && win.Contains("Sheets and tags for:") && win.Contains("a tag row waits for its sheet row to be ticked")
        && ann.Contains("Sentinel loads no families") && ann.Contains("not which of its {ofFamily.Count} types") && ann.Contains("is not a Title Blocks row of the office type catalogue"));
    Check("MA-8-12 review fixes: rooms are read model-wide by level, a zero says why, skips are not called Revit refusals, the unrouted count waits for the commit, sheet rows get the F6 view-type check, the catalogue is read before the preview",
        ann.Contains("rm.Area > 0 && rm.LevelId == view.GenLevel?.Id") && ann.Contains("the sheet view shows no {tg.Category} (its template or view range hides them)")
        && ann.Contains("no placed room (Area > 0) on {pick.SheetLevel} in the model") && ann.Contains("skipped (Sentinel's checks or Revit refused)") && !ann.Contains("refused by Revit\"")
        && ann.IndexOf("if (!sheetRouted) unrouted++;") > ann.IndexOf("Revit did not commit this sheet") && ann.Contains("viewType[s.ViewType] == ElementId.InvalidElementId")
        && ann.IndexOf("var cat = Task.Run(") > 0 && ann.IndexOf("sheetsFor = level =>") > ann.LastIndexOf("var cat = Task.Run(") && !ann.Contains("tbChecked"));
    Check("MA-8-12: the guideline without a sheets block says so in the preview's words, and plans no sheet", ann.Contains("if (guideline.Sheets == null) words.Add(SheetPlanner.NoSheetsBlock);") && SheetPlanner.NoSheetsBlock == "the guideline has no sheets block — no sheets planned");
}

Console.WriteLine($"{total - failed}/{total} checks pass");
Console.WriteLine(failed == 0 ? "ALL PASS" : $"{failed} FAILED");
return failed == 0 ? 0 : 1;
