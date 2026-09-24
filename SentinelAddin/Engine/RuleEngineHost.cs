using System.Diagnostics;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// Evaluates a document against ITS ruleset (one per open document — its web project's ruleset@n, or none)
/// as a full scan or a set of changed elements (DMU delta). Pure Revit-API reads; never opens transactions —
/// safe inside IUpdater.Execute and event handlers. The per-document map is touched on the API thread only.
/// </summary>
public sealed class RuleEngineHost
{
    private readonly Dictionary<Document, (Ruleset Ruleset, ResolvedArtefact Source)> _byDoc = new();
    private readonly Dictionary<Rule, Regex> _compiled = new(); // keyed by the rule object: two documents' "VN-01" differ

    /// The ruleset that judges this document; none until its ruleset@n has been resolved (App.ReloadRuleset).
    public Ruleset RulesetFor(Document doc) => Entry(doc).Ruleset;

    /// Where that ruleset came from: ref · source · sha, cached, or none with the reason.
    public ResolvedArtefact SourceFor(Document doc) => Entry(doc).Source;

    public void Set(Document doc, (Ruleset Ruleset, ResolvedArtefact Source) entry)
    {
        _byDoc[doc] = entry;
        _compiled.Clear();   // token regexes may have changed
    }

    // ponytail: dropped on DocumentClosing; a close another add-in cancels leaves the document on none until
    // the next Scan Now / Project Setup save reloads it.
    public void Forget(Document doc) => _byDoc.Remove(doc);

    private (Ruleset Ruleset, ResolvedArtefact Source) Entry(Document doc) =>
        _byDoc.TryGetValue(doc, out var e) ? e : (RulesetStore.None(), RulesetStore.NoneSource("not loaded yet — Scan Now loads it"));

    private Regex CompiledPattern(Rule r, string org)
    {
        if (_compiled.TryGetValue(r, out var rx)) return rx;
        return _compiled[r] = RuleRegex.For(r, org);
    }

    private static bool IsExcluded(Rule r, string name) =>
        r.Exclusions.Any(x => Regex.IsMatch(name, x));

    // ---------------- Full scan ----------------
    public ScanReport ScanFull(Document doc)
    {
        var (rs, src) = Entry(doc);
        var sw = Stopwatch.StartNew();
        var violations = new List<Violation>();
        int checkedCount = 0;

        foreach (var rule in rs.Rules)
        {
            // A rule that references the office code cannot be evaluated without one — say so once, per
            // rule, instead of scanning with a pattern that matches nothing (which would read as "all clean").
            if (RuleRegex.NeedsOrg(rule) && string.IsNullOrWhiteSpace(rs.Org))
            {
                // Built directly, not via Make: the rule's own MessageEn would substitute this text into
                // "{name}" and read as "Family '(ruleset.org is empty…)' does not match…".
                violations.Add(new Violation(rule.Id, rule.Mode, -1, "(ruleset.org is empty — rule not evaluated)",
                    $"Rule {rule.Id} needs an office code — ruleset.org is empty; not evaluated", null, rule.DocRef));
                continue;
            }
            switch (rule.Target)
            {
                case RuleTarget.Workset:  checkedCount += ScanWorksets(doc, rule, rs.Org, violations); break;
                case RuleTarget.View:     checkedCount += ScanElements<View>(doc, rule, rs.Org, violations, v => !v.IsTemplate && IsUserView(v)); break;
                case RuleTarget.Sheet:    checkedCount += ScanElements<ViewSheet>(doc, rule, rs.Org, violations, _ => true, s => s.SheetNumber); break;
                case RuleTarget.Family:   checkedCount += ScanFamilies(doc, rule, rs.Org, violations); break;
                case RuleTarget.Type:     checkedCount += ScanTypes(doc, rule, rs.Org, violations); break;
                case RuleTarget.Level:    checkedCount += ScanElements<Level>(doc, rule, rs.Org, violations, _ => true); break;
                case RuleTarget.Grid:     checkedCount += ScanElements<Grid>(doc, rule, rs.Org, violations, _ => true); break;
                case RuleTarget.Parameter: checkedCount += ScanParameter(doc, rule, rs.Org, violations); break;
            }
        }
        sw.Stop();
        var report = new ScanReport(doc.Title, DateTimeOffset.Now, sw.ElapsedMilliseconds, checkedCount, violations) { Ruleset = rs };
        if (rs.Rules.Count == 0)
            // Nothing judged: no score, no grade, and the bridge gets no ruleset ref (office.model_health not_checkable).
            report.NotScored = src.Origin == "none" ? src.Label : src.Label + " — no rule left to evaluate (see the Doctor log)";
        else
        {
            report.RulesetRef = src.Ref;
            report.RulesetSha256 = src.Sha256;
        }
        return report;
    }

    // ---------------- Delta scan (DMU) ----------------
    public IReadOnlyList<Violation> ScanElements(Document doc, IEnumerable<ElementId> ids)
    {
        var rs = RulesetFor(doc);
        var violations = new List<Violation>();
        foreach (var id in ids)
        {
            if (doc.GetElement(id) is not Element e) continue;
            foreach (var rule in rs.Rules)
                EvaluateSingle(e, rule, rs.Org, violations);
        }
        return violations;
    }

    private void EvaluateSingle(Element e, Rule rule, string org, List<Violation> sink)
    {
        switch (rule.Target)
        {
            case RuleTarget.View when e is View v && !v.IsTemplate && IsUserView(v):
                CheckName(v, v.Name, rule, org, sink);
                break;
            case RuleTarget.Sheet when e is ViewSheet s:
                CheckName(s, s.SheetNumber, rule, org, sink);
                break;
            case RuleTarget.Level when e is Level l:
                CheckName(l, l.Name, rule, org, sink);
                break;
            case RuleTarget.Grid when e is Grid g:
                CheckName(g, g.Name, rule, org, sink);
                break;
            case RuleTarget.Parameter when e is View pv && !pv.IsTemplate && IsUserView(pv):
                CheckParameter(pv, rule, org, sink);
                break;
        }
    }

    // ---------------- Per-target scanners ----------------
    private int ScanElements<T>(Document doc, Rule rule, string org, List<Violation> sink,
        Func<T, bool> filter, Func<T, string>? nameSelector = null) where T : Element
    {
        int n = 0;
        foreach (T e in new FilteredElementCollector(doc).OfClass(typeof(T)).Cast<T>())
        {
            if (!filter(e)) continue;
            n++;
            CheckName(e, nameSelector?.Invoke(e) ?? e.Name, rule, org, sink);
        }
        return n;
    }

    private static int ScanWorksets(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (!doc.IsWorkshared) return 0;
        int n = 0;
        var present = new HashSet<string>();
        foreach (Workset ws in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset))
        {
            n++; present.Add(ws.Name);
            if (!rule.Whitelist.Contains(ws.Name))
                sink.Add(Make(rule, org, -1, ws.Name));
        }
        foreach (var missing in rule.Whitelist.Where(w => !present.Contains(w)))
            sink.Add(Make(rule, org, -1, $"(missing) {missing}"));
        return n;
    }

    private int ScanFamilies(Document doc, Rule rule, string org, List<Violation> sink)
    {
        int n = 0;
        foreach (Family f in new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>())
        {
            var cat = f.FamilyCategory;
            if (cat is null || cat.CategoryType != CategoryType.Model) continue;
            // Module 1 amendment: scope to configured categories only.
            // Locale-safe: English ruleset keys resolve via BuiltInCategory,
            // so German/French/Arabic Revit installs behave identically.
            if (rule.Categories.Count > 0 && !rule.Categories.Any(cat.MatchesCategoryKey)) continue;
            n++;
            CheckName(f, f.Name, rule, org, sink);
        }
        return n;
    }

    // Type names (system families included). Locale-safe category scope like ScanFamilies. Not wired to
    // the DMU delta — scan-on-demand and the Naming Manager are the path for types.
    private int ScanTypes(Document doc, Rule rule, string org, List<Violation> sink)
    {
        int n = 0;
        foreach (ElementType et in new FilteredElementCollector(doc).WhereElementIsElementType().OfType<ElementType>())
        {
            var cat = et.Category;
            if (cat is null) continue;
            if (rule.Categories.Count > 0 && !rule.Categories.Any(cat.MatchesCategoryKey)) continue;
            n++;
            CheckName(et, et.Name, rule, org, sink);
        }
        return n;
    }

    private static int ScanParameter(Document doc, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return 0;
        int n = 0;
        foreach (View v in new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>())
        {
            if (v.IsTemplate || !IsUserView(v) || IsExcluded(rule, v.Name)) continue;
            n++;
            CheckParameter(v, rule, org, sink);
        }
        return n;
    }

    // ---------------- Checks ----------------
    private void CheckName(Element e, string name, Rule rule, string org, List<Violation> sink)
    {
        if (IsExcluded(rule, name)) return;
        if (rule.Whitelist.Contains(name)) return;
        if (rule.Tokens.Count > 0 && CompiledPattern(rule, org).IsMatch(name)) return;
        if (rule.Tokens.Count == 0 && rule.Whitelist.Count == 0) return; // nothing to check
        sink.Add(Make(rule, org, e.Id.IdValue(), name));
    }

    private static void CheckParameter(Element e, Rule rule, string org, List<Violation> sink)
    {
        var p = e.LookupParameter(rule.ParameterName!);
        if (p is null || !p.HasValue || string.IsNullOrWhiteSpace(p.AsString()))
            sink.Add(Make(rule, org, e.Id.IdValue(), e.Name));
    }

    private static Violation Make(Rule r, string org, long id, string name) =>
        new(r.Id, r.Mode, id, name,
            RuleRegex.TextWithOrg(r.MessageEn.Replace("{name}", name), org),
            r.MessageAr is null ? null : RuleRegex.TextWithOrg(r.MessageAr.Replace("{name}", name), org),
            r.DocRef);

    /// Module 1 amendment: exclude Revit-generated view types globally.
    private static bool IsUserView(View v) => v.ViewType switch
    {
        ViewType.Internal or ViewType.ProjectBrowser or ViewType.SystemBrowser
            or ViewType.Undefined or ViewType.DrawingSheet or ViewType.Legend => false,
        _ => true,
    };
}
