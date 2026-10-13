#nullable disable
// MA-8-12 (audit ANV-4, ANV-5; MH-VW-01): Annotate's sheets, tags and view count, pure - no Revit types, so tools/annotate-check drives
// it offline. For ONE level (a run's choice) a sheet row per FloorPlan/CeilingPlan entry that names a `sheetTemplate`: the sheet view
// "SH_<prefix>_<LEVEL>" (the WIP name with the SH_ status, judged by the project's View rules as ViewPlanner judges a WIP name), and a
// sheet whose number and name fill the guideline's `sheets` patterns ({level}, {use}, {prefix}, {n}; {n} is the entry's two-digit
// index among the sheet entries in guideline order, refused rows counted, so numbers stay put). The number is judged by Scan Now's own
// Sheet rules, as the view name is by its View rules (V5). A tag row for each category the entry's `tag` list names, from the
// guideline's graphics.tags - only the categories Sentinel can tag (amendment 10: Doors, Windows, Ceilings by IndependentTag; Rooms by
// NewRoomTag). Every row is a person's to tick, never pre-ticked (amendment 16). MH-VW-01 is the blueprint's count - printable plan
// views of the level on no sheet - minus the views on a WIP template (D12); the model health engine that would own it is not built.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    /// <summary>One sheet the run could make: its view, its sheet. Never pre-ticked.</summary>
    public sealed class PlannedSheet
    {
        public string Use { get; set; }
        public string ViewType { get; set; }
        /// <summary>The sheet view's name ("SH_FP_L01"); null when the row was refused before one could be built.</summary>
        public string ViewName { get; set; }
        public string Template { get; set; }
        public string BrowserStatus { get; set; }
        public string Number { get; set; }
        public string Name { get; set; }
        /// <summary>The entry's `tag` categories, in the guideline's order.</summary>
        public List<string> TagCategories { get; set; } = new List<string>();
        public string Refusal { get; set; }
        public bool PreTicked => false;
    }

    /// <summary>One tag set (a category in one sheet view). <see cref="SymbolId"/> is set by the command once it has found the tag type in the model.</summary>
    public sealed class PlannedTag
    {
        public string ViewName { get; set; }
        public string Category { get; set; }
        /// <summary>The BuiltInCategory names of the tagged elements and of the tag, "independent" or "room" - Enum.TryParse'd by the command.</summary>
        public string ElementBic { get; set; }
        public string TagBic { get; set; }
        public string How { get; set; }
        public string Family { get; set; }
        public string Type { get; set; }
        public bool OfficeAuthored { get; set; }
        public long SymbolId { get; set; }
        public string Refusal { get; set; }
        public bool PreTicked => false;
    }

    /// <summary>A plan view as MH-VW-01 reads it (the command fills it from the model).</summary>
    public sealed class ViewFact
    {
        public string Name;
        public string Level;
        public bool IsTemplate;
        public bool Printable;
        public bool OnSheet;
        /// <summary>The name of the view template it uses, else null.</summary>
        public string Template;
    }

    public sealed class MhVw01Result
    {
        public string Level;
        public int Count;
        /// <summary>At most <see cref="SheetPlanner.MaxNames"/>.</summary>
        public List<string> Names = new List<string>();
        public int WipExcepted;

        public string Line() =>
            $"MH-VW-01 on {Level}: {Count} printable plan view(s) of this level on no sheet ({WipExcepted} on a WIP template excepted) — counted by Annotate; "
            + "plans only (sections, elevations and 3D views have no level); the model health engine is not built (D12)";
    }

    /// <summary>What the preview shows for one level: its sheet rows, their tag rows and the lines above them.</summary>
    public sealed class SheetNode
    {
        public List<PlannedSheet> Sheets = new List<PlannedSheet>();
        public List<PlannedTag> Tags = new List<PlannedTag>();
        public List<string> Lines = new List<string>();
    }

    public static class SheetPlanner
    {
        public const int MaxNames = 20;
        public const string Status = "SH_";
        public const string TokenRefusal = "named by tokens — its sheet view needs sheet tokens the guideline does not have yet";
        public const string NoSheetsBlock = "the guideline has no sheets block — no sheets planned";
        public const string SheetNotMade = "its sheet view is not created this run";
        private static readonly HashSet<string> Plannable = new HashSet<string> { "FloorPlan", "CeilingPlan" };

        // The categories Sentinel tags (amendment 10: the BDS guideline names tags on sheet entries for these four only).
        private static readonly Dictionary<string, (string Element, string Tag, string How)> TagMap = new Dictionary<string, (string, string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            ["Doors"] = ("OST_Doors", "OST_DoorTags", "independent"),
            ["Windows"] = ("OST_Windows", "OST_WindowTags", "independent"),
            ["Ceilings"] = ("OST_Ceilings", "OST_CeilingTags", "independent"),
            ["Rooms"] = ("OST_Rooms", "OST_RoomTags", "room"),
        };

        // The entries that make a sheet row: a plan with a sheetTemplate that Sentinel can name (a prefix, or tokens - refused below).
        private static List<GuidelineViewStandard> Entries(IEnumerable<GuidelineViewStandard> views) =>
            (views ?? Enumerable.Empty<GuidelineViewStandard>()).Where(v => v != null && Plannable.Contains(v.ViewType ?? "") && !string.IsNullOrWhiteSpace(v.SheetTemplate)
                && (!string.IsNullOrWhiteSpace(v.NamePrefix) || (v.Tokens != null && v.Tokens.Count > 0))).ToList();

        private static bool TokenNamed(GuidelineViewStandard v) => v.Tokens != null && v.Tokens.Count > 0;

        /// <summary>The distinct sheet templates the rows SheetPlanner can create would use (amendment 7), in guideline order; none without a sheets block.</summary>
        public static List<string> Templates(IEnumerable<GuidelineViewStandard> views, GuidelineSheets sheets) =>
            sheets == null ? new List<string>() : Entries(views).Where(v => !TokenNamed(v)).Select(v => v.SheetTemplate).Distinct().ToList();

        /// <summary>One line when the guideline has sheet entries that are not per level (sections, elevations, 3D views); null when it has none.</summary>
        public static string NotPerLevel(IEnumerable<GuidelineViewStandard> views)
        {
            var other = (views ?? Enumerable.Empty<GuidelineViewStandard>()).Where(v => v != null && !string.IsNullOrWhiteSpace(v.SheetTemplate) && !Plannable.Contains(v.ViewType ?? "")).ToList();
            return other.Count == 0 ? null
                : $"{other.Count} sheet entr{(other.Count == 1 ? "y" : "ies")} ({string.Join(", ", other.Select(v => v.Use))}) are sections, elevations or 3D views - not per level, so no sheet row for them.";
        }

        private static string Fill(string pattern, string level, string use, string prefix, int n) =>
            pattern.Replace("{level}", level).Replace("{use}", use ?? "").Replace("{prefix}", prefix ?? "").Replace("{n}", n.ToString("00"));

        /// <summary>The sheet rows for <paramref name="level"/>: <paramref name="existingViewNames"/> and <paramref name="existingSheetNumbers"/> are what the model holds.
        /// Empty without a sheets block or a level.</summary>
        public static List<PlannedSheet> Plan(List<GuidelineViewStandard> views, GuidelineViewNaming naming, GuidelineSheets sheets, string level, Ruleset ruleset,
            ICollection<string> existingViewNames, ICollection<string> existingSheetNumbers)
        {
            var outp = new List<PlannedSheet>();
            if (views == null || sheets == null || string.IsNullOrWhiteSpace(level)) return outp;
            string browserStatus = null;
            naming?.StatusPrefixes?.TryGetValue(Status, out browserStatus);
            var viewRules = ViewPlanner.Rules(ruleset, RuleTarget.View);
            var sheetRules = ViewPlanner.Rules(ruleset, RuleTarget.Sheet);
            string org = ruleset?.Org;
            var viewNames = new Dictionary<string, string>(); // a view name -> the row that took it first
            var numbers = new Dictionary<string, string>();
            int n = 0;
            foreach (var v in Entries(views))
            {
                n++;
                var row = new PlannedSheet
                {
                    Use = v.Use, ViewType = v.ViewType, Template = v.SheetTemplate, BrowserStatus = browserStatus,
                    TagCategories = v.Tag ?? new List<string>(),
                    Number = Fill(sheets.Number, level, v.Use, v.NamePrefix, n), Name = Fill(sheets.Name, level, v.Use, v.NamePrefix, n),
                };
                string refusal = null, name = null;
                if (TokenNamed(v)) refusal = TokenRefusal;
                else
                {
                    refusal = ViewPlanner.NameOf(v, level, viewRules, org, out name, Status);
                    row.ViewName = name;
                    if (refusal == null && viewNames.TryGetValue(name, out var earlier)) refusal = "same name as " + earlier;
                    if (refusal == null && existingViewNames != null && existingViewNames.Contains(name)) refusal = ViewPlanner.Existing;
                    if (name != null && !viewNames.ContainsKey(name)) viewNames[name] = $"'{v.Use}'";
                }
                // The number: Revit's characters, Scan Now's Sheet rules, then a repeat or a number the model holds.
                string numberRefusal = Prohibited(row.Number, "sheet number");
                if (numberRefusal == null)
                {
                    var noOrg = sheetRules.FirstOrDefault(r => RuleRegex.NeedsOrg(r) && string.IsNullOrWhiteSpace(org));
                    numberRefusal = noOrg != null ? $"{noOrg.Id} needs an office code and ruleset.org is empty — the number cannot be judged; set the office code"
                        : ViewPlanner.Judge(sheetRules, org, row.Number);
                }
                if (numberRefusal == null && numbers.TryGetValue(row.Number, out var earlierNumber)) numberRefusal = "same number as " + earlierNumber;
                if (numberRefusal == null && existingSheetNumbers != null && existingSheetNumbers.Contains(row.Number)) numberRefusal = "a sheet in the model already holds this number";
                if (!numbers.ContainsKey(row.Number)) numbers[row.Number] = $"'{v.Use}'";
                row.Refusal = refusal ?? numberRefusal ?? Prohibited(row.Name, "sheet name");
                outp.Add(row);
            }
            return outp;
        }

        private static string Prohibited(string text, string what)
        {
            int bad = text.IndexOfAny(ViewPlanner.Prohibited.ToCharArray());
            return bad >= 0 ? $"'{text}' holds '{text[bad]}', which Revit does not allow in a {what}" : null;
        }

        /// <summary>The tag rows for the sheet rows that can be created: each category the entry's `tag` list names, set against graphics.tags. A category
        /// Sentinel does not tag, or one the guideline names no tag for, is a refused row with the words. The command finds the tag type in the model.</summary>
        public static List<PlannedTag> Tags(IEnumerable<PlannedSheet> sheets, GuidelineGraphics graphics)
        {
            var outp = new List<PlannedTag>();
            foreach (var s in sheets ?? Enumerable.Empty<PlannedSheet>())
            {
                if (s.Refusal != null) continue;
                foreach (var category in s.TagCategories.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    var t = new PlannedTag { ViewName = s.ViewName, Category = category.Trim() };
                    GuidelineTag named = null;
                    if (graphics?.Tags != null)
                        foreach (var kv in graphics.Tags)
                            if (string.Equals(kv.Key.Trim(), t.Category, StringComparison.OrdinalIgnoreCase)) { named = kv.Value; break; }
                    if (!TagMap.TryGetValue(t.Category, out var map)) t.Refusal = $"Sentinel does not tag {t.Category} yet";
                    else if (named == null || string.IsNullOrWhiteSpace(named.Family)) t.Refusal = $"the guideline names no tag for {t.Category} (graphics.tags)";
                    else { t.ElementBic = map.Element; t.TagBic = map.Tag; t.How = map.How; t.Family = named.Family.Trim(); t.Type = string.IsNullOrWhiteSpace(named.Type) ? null : named.Type.Trim(); t.OfficeAuthored = named.OfficeAuthored; }
                    outp.Add(t);
                }
            }
            return outp;
        }

        /// <summary>MH-VW-01 for <paramref name="level"/>: the plans of that level that are not templates, are printable and sit on no sheet, less those
        /// on a template in <paramref name="wipTemplates"/> (D12).</summary>
        public static MhVw01Result MhVw01(IEnumerable<ViewFact> views, string level, ISet<string> wipTemplates)
        {
            var open = (views ?? Enumerable.Empty<ViewFact>()).Where(v => v != null && !v.IsTemplate && v.Level == level && v.Printable && !v.OnSheet).ToList();
            var counted = open.Where(v => string.IsNullOrWhiteSpace(v.Template) || wipTemplates == null || !wipTemplates.Contains(v.Template)).ToList();
            return new MhVw01Result { Level = level, Count = counted.Count, Names = counted.Select(v => v.Name).Take(MaxNames).ToList(), WipExcepted = open.Count - counted.Count };
        }
    }
}
