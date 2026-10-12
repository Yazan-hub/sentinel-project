#nullable disable
// MA-8-8: MEP Type Check's judge. Pure — no Revit API — so tools/promote-check runs it on the BDS catalogue. Each duct, pipe, cable tray
// and conduit is read as facts (family, type, system type) and judged against the installed type_catalog: the type, and for ducts and
// pipes the system type (the catalogue holds "Duct Systems" and "Piping Systems" rows). Read only: no size check (the office has no size
// list, D15) and no retype. A category with no systems rows says "not checkable", never a pass.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

namespace Sentinel.Engine
{
    /// <summary>One MEP element as Revit reads it. <see cref="Category"/> comes from a fixed map of the four BuiltInCategories
    /// (Compat.CategoryKeys has no MEP keys, so never Category.Name). <see cref="System"/> null with <see cref="SystemRead"/> true is "no
    /// system assigned"; <see cref="SystemFamily"/> is the system type's own FamilyName, passed to the catalogue as is.</summary>
    public sealed class MepFact
    {
        public long Id;
        public string Category, Family, Type, System, SystemFamily;
        public bool SystemRead;
    }

    public sealed class MepCategoryRow
    {
        public string Category, SystemNote;
        public int Checked, Matched, TypeNotOffice, SystemNotOffice, NoSystem;
        public int NotCheckable, SystemJudged, SystemUnread;   // no catalogue rows for the category; systems actually judged; system unreadable
    }

    public sealed class MepFinding
    {
        public string Category, Family, Type, System, Verdict;
        public int Count;
        public List<long> Ids = new List<long>();
    }

    public sealed class MepReport
    {
        public List<MepCategoryRow> Categories = new List<MepCategoryRow>();
        public List<MepFinding> Findings = new List<MepFinding>();   // unmatched groups, most elements first
        public int Checked => Categories.Sum(c => c.Checked);
        public int Matched => Categories.Sum(c => c.Matched);
        public int TypeNotOffice => Categories.Sum(c => c.TypeNotOffice);
        public int SystemNotOffice => Categories.Sum(c => c.SystemNotOffice);
        public int NoSystem => Categories.Sum(c => c.NoSystem);
        public int NotCheckable => Categories.Sum(c => c.NotCheckable);
        public int SystemJudged => Categories.Sum(c => c.SystemJudged);
        public int SystemUnread => Categories.Sum(c => c.SystemUnread);
        public int NoType;   // elements the command skipped because Revit gave no type (set by the caller)
        public int Unmatched => Checked - Matched - NotCheckable;

        /// <summary>The dialog's per-category lines.</summary>
        public IEnumerable<string> Lines() => Categories.Select(c => $"{c.Category} {c.Checked}: {c.SystemNote}");
    }

    public static class MepTypeCheck
    {
        public const string Wrong = "type not the office's", WrongSystem = "system not the office's", None = "no system";
        public const int IdsPerFinding = 20;

        /// <summary>The systems category the catalogue keeps for a category, and nothing for trays and conduits (Revit gives them none).</summary>
        private static readonly Dictionary<string, string> SystemsOf = new Dictionary<string, string> { ["Ducts"] = "Duct Systems", ["Pipes"] = "Piping Systems" };

        /// <summary>The words when there is nothing to check against (no catalogue); null when there is one.</summary>
        public static string NoCatalog(GuidelineMatcher m) =>
            m.HasCatalog ? null : $"No type catalogue installed ({m.CatalogLabel}) — nothing to check against; nothing was sent.";

        public static MepReport Run(IEnumerable<MepFact> facts, GuidelineMatcher m)
        {
            var r = new MepReport();
            var groups = new Dictionary<string, MepFinding>();
            foreach (var cat in facts.GroupBy(f => f.Category))
            {
                string systems = SystemsOf.TryGetValue(cat.Key, out var s) ? s : null;
                int rows = systems == null ? 0 : m.CatalogCount(systems);
                var row = new MepCategoryRow { Category = cat.Key };
                bool typeless = m.CatalogCount(cat.Key) == 0;   // no rows for this category: nothing to judge a type against
                row.SystemNote = typeless ? $"not checkable — the catalogue has no {cat.Key} rows"
                    : systems == null ? "type only — Revit gives a " + Singular(cat.Key) + " no system type"
                    : rows == 0 ? $"type only — system not checkable, the catalogue has no {systems} rows"
                    : $"system checked against {rows} {systems} rows";
                foreach (var f in cat)
                {
                    row.Checked++;
                    if (typeless) { row.NotCheckable++; continue; }
                    string verdict = null;
                    if (!m.CatalogHas(cat.Key, f.Family, f.Type)) { verdict = Wrong; row.TypeNotOffice++; }
                    else if (systems != null && rows > 0 && !f.SystemRead) row.SystemUnread++;
                    else if (systems != null && rows > 0)
                    {
                        row.SystemJudged++;
                        if (f.System == null) { verdict = None; row.NoSystem++; }
                        else if (!m.CatalogHas(systems, f.SystemFamily, f.System)) { verdict = WrongSystem; row.SystemNotOffice++; }
                    }
                    if (verdict == null) { row.Matched++; continue; }
                    string key = string.Join("|", cat.Key, f.Family, f.Type, verdict == Wrong ? null : f.System, verdict);   // a wrong type never had its system judged
                    if (!groups.TryGetValue(key, out var g))
                        groups[key] = g = new MepFinding { Category = cat.Key, Family = f.Family, Type = f.Type, System = verdict == Wrong ? null : f.System, Verdict = verdict };
                    g.Count++;
                    if (g.Ids.Count < IdsPerFinding) g.Ids.Add(f.Id);
                }
                if (row.SystemUnread > 0) row.SystemNote += $"; {row.SystemUnread} not judged (system unreadable)";
                r.Categories.Add(row);
            }
            r.Findings = groups.Values.OrderByDescending(g => g.Count).ThenBy(g => g.Category, StringComparer.Ordinal)
                .ThenBy(g => g.Type, StringComparer.Ordinal).ThenBy(g => g.System, StringComparer.Ordinal).ToList();
            return r;
        }

        private static string Singular(string category) => category == "Pipes" ? "pipe" : category == "Ducts" ? "duct" : category.ToLowerInvariant().TrimEnd('s');

        /// <summary>One finding as the dialog and the BCF description word it.</summary>
        public static string Line(MepFinding f) =>
            $"{f.Count} × {f.Category}: {f.Family} / {f.Type}" + (f.Verdict == Wrong ? "" : " — system " + (f.System ?? "(none)")) + " — " + f.Verdict;
    }
}
