#nullable disable
// MA-2e (audit DAT-3, ANV-1, ANV-2): Annotate's plan, pure — no Revit types, so tools/annotate-check drives it offline.
// Rows are levels × the guideline's plannable view entries (FloorPlan, CeilingPlan; an entry with a namePrefix or tokens).
// A row's name is the entry's `tokens` in the order of the project's View rule (founder decision F1 A: a token is filled
// only from the entry, "{level}" by the level's name verbatim, and each value must pass its token's definition), or today's
// fixed WIP_<namePrefix>_<LEVEL>. Every name is judged as Scan Now judges it (RuleEngineHost.CheckName: exclusions, whitelist,
// RuleRegex) before anything is created, so a created view raises no View naming violation (closes F44). A row is refused,
// with the reason, when a token is missing, a value fails its definition, the name fails a View rule, holds a character Revit
// refuses in a view name, repeats an earlier row's name, or is already in the model. Pre-ticked (F2): a story level × the
// first FloorPlan entry and the first CeilingPlan entry; everything else is listed unticked — a person decides. The pin rows
// (DAT-3, F3 A) and the words of the preview and the result are here too. This is the only view planner: the TS planViews
// had no caller and was retired in MA-2e (F5).
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class PlannedView
    {
        /// <summary>Null when the row was refused before a name could be built (a token missing or failing).</summary>
        public string Name { get; set; }
        public string Use { get; set; }
        public string ViewType { get; set; }
        public string LevelName { get; set; }
        public bool IsStory { get; set; }
        public string Template { get; set; }
        /// <summary>Set by the command: the view template the entry names is in the model.</summary>
        public bool TemplateInModel { get; set; }
        public string BrowserStatus { get; set; }
        /// <summary>Ticked when the preview opens (F2); never on a refused row.</summary>
        public bool PreTicked { get; set; }
        /// <summary>Why the row cannot be created, in words; null when it can.</summary>
        public string Refusal { get; set; }
    }

    /// <summary>A level or a grid as the pin rows read it (DAT-3).</summary>
    public sealed class DatumFact
    {
        public long Id;
        /// <summary>"Level" or "Grid".</summary>
        public string Kind;
        public string Name;
        /// <summary>Levels only: LEVEL_IS_BUILDING_STORY, read (ChangesetExecutor.Stories), never set (DAT-2).</summary>
        public bool IsStory;
        public bool Pinned;
        /// <summary>Another user who owns it in a workshared model, else null (F7).</summary>
        public string OwnedBy;
        /// <summary>Changed or deleted in central since this copy loaded (F7, review C7): pinning it would fail the commit.</summary>
        public bool ChangedInCentral;
    }

    public sealed class PinRow
    {
        public long Id { get; set; }
        public string Label { get; set; }
        public bool PreTicked { get; set; }
        public string Refusal { get; set; }
    }

    public static class ViewPlanner
    {
        private static readonly HashSet<string> Plannable = new HashSet<string> { "FloorPlan", "CeilingPlan" };

        /// <summary>The characters Revit refuses in a view name (NamingUtils.IsValidName's list; the command asks Revit too, E3).</summary>
        public const string Prohibited = "\\:{}[]|;<>?`~";
        /// <summary>In an entry's token value: the level's name, verbatim (F1 A).</summary>
        public const string LevelToken = "{level}";
        public const string Existing = "already in the model (a view or a view template holds this name)";

        /// <summary>Annotate's rows: <paramref name="levels"/> (lowest first, as the command reads them) × the guideline's plannable
        /// entries, in the guideline's order. <paramref name="ruleset"/> is the one Scan Now judges the document by (null or none: the
        /// names are not checked, and an entry named by tokens is refused); <paramref name="existing"/> the names the model holds.</summary>
        public static List<PlannedView> Plan(List<GuidelineViewStandard> views, GuidelineViewNaming naming,
            IReadOnlyList<(string Name, bool IsStory)> levels, Ruleset ruleset, ICollection<string> existing)
        {
            var outp = new List<PlannedView>();
            if (views == null || levels == null || levels.Count == 0) return outp;

            const string status = "WIP_";
            string browserStatus = null;
            naming?.StatusPrefixes?.TryGetValue(status, out browserStatus);

            var rules = ViewRules(ruleset);
            var entries = views.Where(v => v != null && Plannable.Contains(v.ViewType ?? "")
                && (!string.IsNullOrWhiteSpace(v.NamePrefix) || (v.Tokens != null && v.Tokens.Count > 0))).ToList();
            // F2: the first FloorPlan entry and the first CeilingPlan entry, in the guideline's order.
            var first = new HashSet<GuidelineViewStandard>(entries.GroupBy(v => v.ViewType).Select(g => g.First()));
            var named = new Dictionary<string, string>(); // a name → the row that took it first: "'GA Plan' on GR-FFL" (E5)
            foreach (var (level, isStory) in levels)
                foreach (var v in entries)
                {
                    string refusal = NameOf(v, level, rules, ruleset?.Org, out string name);
                    if (refusal == null && named.TryGetValue(name, out var earlier)) refusal = "same name as " + earlier;
                    if (refusal == null && existing != null && existing.Contains(name)) refusal = Existing;
                    if (name != null && !named.ContainsKey(name)) named[name] = $"'{v.Use}' on {level}";
                    outp.Add(new PlannedView
                    {
                        Name = name, Use = v.Use, ViewType = v.ViewType, LevelName = level, IsStory = isStory,
                        Template = v.WipTemplate, BrowserStatus = browserStatus, Refusal = refusal,
                        PreTicked = refusal == null && isStory && first.Contains(v),
                    });
                }
            return outp;
        }

        // The name of one row, or why there is none / why it is refused.
        private static string NameOf(GuidelineViewStandard v, string level, List<Rule> rules, string org, out string name)
        {
            name = null;
            // Review C5: a rule that needs the office code cannot be judged without one (Scan Now leaves it unevaluated) — fail closed, said.
            var noOrg = rules.FirstOrDefault(r => RuleRegex.NeedsOrg(r) && string.IsNullOrWhiteSpace(org));
            if (noOrg != null) return $"{noOrg.Id} needs an office code and ruleset.org is empty — the name cannot be judged; set the office code";
            if (v.Tokens != null && v.Tokens.Count > 0)
            {
                // E2: the first View rule WITH tokens orders them (a whitelist-only rule only judges, review C5).
                var rule = rules.FirstOrDefault(r => r.Tokens.Count > 0);
                if (rule == null) return $"'{v.Use}' names its view by tokens, but no View rule with tokens is installed to order them";
                // Review C11: a token the rule does not have is refused, never dropped in silence.
                var extra = v.Tokens.Keys.FirstOrDefault(k => !rule.Tokens.Contains(k));
                if (extra != null) return $"'{v.Use}' gives {extra}, which {rule.Id} does not have (its tokens: {string.Join(", ", rule.Tokens)})";
                var parts = new List<string>();
                string tokenRefusal = null;
                foreach (var t in rule.Tokens)
                {
                    if (!v.Tokens.TryGetValue(t, out var raw) || string.IsNullOrWhiteSpace(raw))
                        return $"'{v.Use}' gives no {t} — {rule.Id} needs it; add it to the entry's tokens";
                    string value = raw.Replace(LevelToken, level);
                    if (tokenRefusal == null && rule.TokenDefs.TryGetValue(t, out var def) && !Accepts(def, org, value))
                        tokenRefusal = $"{t} '{value}' does not pass {def} ({rule.Id})"
                             + (raw.Contains(LevelToken) ? $" — the level's name is used as it is: rename the level, or give the entry another {t}" : "");
                    parts.Add(value);
                }
                name = string.Join(rule.Separator, parts);
                // Review C14: Scan Now passes a name its rule excludes or whitelists before it reads a token, so the planner does too.
                if (tokenRefusal != null && !Admits(rule, name)) { name = null; return tokenRefusal; }
            }
            else name = "WIP_" + v.NamePrefix + "_" + Regex.Replace(level.Trim().ToUpperInvariant(), @"\s+", "-");

            int bad = name.IndexOfAny(Prohibited.ToCharArray());
            if (bad >= 0) return $"'{name}' holds '{name[bad]}', which Revit does not allow in a view name";
            foreach (var r in rules)
                if (!Passes(r, org, name, out string error))
                    return error != null ? $"{r.Id}: {error}" : $"'{name}' does not pass {r.Id}: " + RuleRegex.TextWithOrg(r.MessageEn ?? "", org).Replace("{name}", name);
            return null;
        }

        // One token's value against its definition, anchored (NamingProposer's TokenSlot.Accepts).
        private static bool Accepts(string def, string org, string value)
        {
            try { return Regex.IsMatch(value, "^(?:" + RuleRegex.DefWithOrg(def, org) + ")$", RegexOptions.CultureInvariant); }
            catch (System.ArgumentException) { return false; } // a malformed definition fails closed (BG-5)
        }

        // Scan Now's own judgement (RuleEngineHost.CheckName): an excluded or whitelisted name passes; a whitelist-only rule
        // passes nothing else (review C5); else the rule's pattern.
        private static bool Passes(Rule r, string org, string name, out string error)
        {
            error = null;
            if (Admits(r, name)) return true;
            if (r.Tokens.Count == 0) return false;
            return RuleRegex.Matches(r, org, name, out error);
        }

        // An excluded or whitelisted name: Scan Now passes it whatever its tokens (RuleEngineHost.CheckName).
        private static bool Admits(Rule r, string name) =>
            (r.Exclusions ?? new List<string>()).Any(x => Regex.IsMatch(name, x)) || (r.Whitelist != null && r.Whitelist.Contains(name));

        // The View rules Scan Now judges a name by: with tokens, or with a whitelist (review C5); lists never null below.
        private static List<Rule> ViewRules(Ruleset ruleset) =>
            (ruleset?.Rules ?? new List<Rule>()).Where(r => r != null && r.Target == RuleTarget.View && r.Tokens != null && r.Whitelist != null
                && (r.Tokens.Count > 0 || r.Whitelist.Count > 0)).ToList();

        /// <summary>The preview's and the result's line on what judged the names (F4).</summary>
        public static string RuleLine(Ruleset ruleset, string rulesetLabel)
        {
            var ids = ViewRules(ruleset).Select(r => r.Id).ToList();
            return ids.Count > 0
                ? $"View names are checked against {string.Join(", ", ids)} (ruleset {rulesetLabel}) — Scan Now's own rule."
                : $"View names not checked: no View rule with tokens or a whitelist in the ruleset ({rulesetLabel}).";
        }

        /// <summary>DAT-3 (F3 A, F7): every unpinned level and grid. Story levels and grids are pre-ticked; a level that is not a
        /// Building Story is listed unticked; one another user owns, or one changed in central (review C7), is listed unticked with
        /// the reason. A pinned one is not listed.</summary>
        public static List<PinRow> Pins(IEnumerable<DatumFact> datums) =>
            (datums ?? Enumerable.Empty<DatumFact>()).Where(d => d != null && !d.Pinned).Select(d => new PinRow
            {
                Id = d.Id,
                Label = d.Kind == "Level" ? $"Level '{d.Name}'" + (d.IsStory ? "" : " (not a Building Story)") : $"Grid '{d.Name}'",
                Refusal = d.OwnedBy != null ? $"owned by {d.OwnedBy} in this workshared model — pin it once they relinquish it"
                        : d.ChangedInCentral ? "changed in central — reload latest, then pin it" : null,
                PreTicked = d.OwnedBy == null && !d.ChangedInCentral && (d.Kind != "Level" || d.IsStory),
            }).ToList();

        /// <summary>S3 (review C6): the substitute for MH-LNK-01 (not in code) — every level, as MH-LNK-01 would read them, and every
        /// grid, read from the model after the commit.</summary>
        public static string PinnedLine(int storiesPinned, int stories, int otherLevelsPinned, int otherLevels, int gridsPinned, int grids) =>
            $"Pinned now: {storiesPinned}/{stories} story level(s), {otherLevelsPinned}/{otherLevels} other level(s), {gridsPinned}/{grids} grid(s) (read from the model after the commit); links are not checked (MH-LNK-01 is not in code).";

        /// <summary>S1 (review C3): B31's exception to one Undo per action, in words, in every model — "may" is true in all of them.</summary>
        public static string UndoWords() =>
            "Revit may empty its Undo list after views are named (B31) — if Edit ▸ Undo does not list \"Sentinel: Annotate views\", the annotate ledger row is the record: it names the views and datums to delete or unpin by hand.";

        /// <summary>Why Annotate has nothing to plan, or null when it has: the guideline is none — its label says why
        /// ("none — not installed for demo or its office") — or it has no views section. Annotate never plans another
        /// office's views in their place (cohesion 4b-2, F44).</summary>
        public static string NothingToPlan(string guidelineLabel, bool installed, List<GuidelineViewStandard> views)
        {
            const string install = " Nothing to plan — install a guideline@n with a views section on the project or its office.";
            if (!installed) return "Guideline: " + guidelineLabel + "." + install;
            if (views == null || views.Count == 0) return "Guideline: " + guidelineLabel + " has no views section." + install;
            return null;
        }
    }
}
