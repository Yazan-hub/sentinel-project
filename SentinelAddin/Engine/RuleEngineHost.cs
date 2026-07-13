using System.Diagnostics;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Evaluates the effective ruleset against a document (full scan) or a set of
/// changed elements (DMU delta). Pure Revit-API reads; never opens transactions —
/// safe inside IUpdater.Execute and event handlers.
/// </summary>
public sealed class RuleEngineHost(Ruleset ruleset)
{
    public Ruleset Ruleset { get; private set; } = ruleset;

    /// Re-resolve the ruleset after Project Setup changes the configured
    /// master path (doc = null -> machine-level resolution only).
    public void ReloadRuleset(Autodesk.Revit.DB.Document? doc)
    {
        Ruleset = RulesetStore.LoadEffective(doc);
        _compiled.Clear();   // token regexes may have changed
    }

    private readonly Dictionary<string, Regex> _compiled = [];

    private Regex CompiledPattern(Rule r)
    {
        if (_compiled.TryGetValue(r.Id, out var rx)) return rx;
        // Tokens -> anchored regex: each token resolves through token_defs,
        // joined by the separator. Unknown tokens match a safe default.
        var parts = r.Tokens.Select(t =>
            r.TokenDefs.TryGetValue(t, out var def) ? $"(?:{def})" : @"[A-Za-z0-9\-]+");
        rx = new Regex($"^{string.Join(Regex.Escape(r.Separator), parts)}$",
                       RegexOptions.Compiled | RegexOptions.CultureInvariant);
        return _compiled[r.Id] = rx;
    }

    private bool IsExcluded(Rule r, string name) =>
        r.Exclusions.Any(x => Regex.IsMatch(name, x));

    // ---------------- Full scan ----------------
    public ScanReport ScanFull(Document doc)
    {
        var sw = Stopwatch.StartNew();
        var violations = new List<Violation>();
        int checkedCount = 0;

        foreach (var rule in Ruleset.Rules)
        {
            switch (rule.Target)
            {
                case RuleTarget.Workset:  checkedCount += ScanWorksets(doc, rule, violations); break;
                case RuleTarget.View:     checkedCount += ScanElements<View>(doc, rule, violations, v => !v.IsTemplate && IsUserView(v)); break;
                case RuleTarget.Sheet:    checkedCount += ScanElements<ViewSheet>(doc, rule, violations, _ => true, s => s.SheetNumber); break;
                case RuleTarget.Family:   checkedCount += ScanFamilies(doc, rule, violations); break;
                case RuleTarget.Level:    checkedCount += ScanElements<Level>(doc, rule, violations, _ => true); break;
                case RuleTarget.Grid:     checkedCount += ScanElements<Grid>(doc, rule, violations, _ => true); break;
                case RuleTarget.Parameter: checkedCount += ScanParameter(doc, rule, violations); break;
            }
        }
        sw.Stop();
        return new ScanReport(doc.Title, DateTimeOffset.Now, sw.ElapsedMilliseconds, checkedCount, violations);
    }

    // ---------------- Delta scan (DMU) ----------------
    public IReadOnlyList<Violation> ScanElements(Document doc, IEnumerable<ElementId> ids)
    {
        var violations = new List<Violation>();
        foreach (var id in ids)
        {
            if (doc.GetElement(id) is not Element e) continue;
            foreach (var rule in Ruleset.Rules)
                EvaluateSingle(e, rule, violations);
        }
        return violations;
    }

    private void EvaluateSingle(Element e, Rule rule, List<Violation> sink)
    {
        switch (rule.Target)
        {
            case RuleTarget.View when e is View v && !v.IsTemplate && IsUserView(v):
                CheckName(v, v.Name, rule, sink);
                break;
            case RuleTarget.Sheet when e is ViewSheet s:
                CheckName(s, s.SheetNumber, rule, sink);
                break;
            case RuleTarget.Level when e is Level l:
                CheckName(l, l.Name, rule, sink);
                break;
            case RuleTarget.Grid when e is Grid g:
                CheckName(g, g.Name, rule, sink);
                break;
            case RuleTarget.Parameter when e is View pv && !pv.IsTemplate && IsUserView(pv):
                CheckParameter(pv, rule, sink);
                break;
        }
    }

    // ---------------- Per-target scanners ----------------
    private int ScanElements<T>(Document doc, Rule rule, List<Violation> sink,
        Func<T, bool> filter, Func<T, string>? nameSelector = null) where T : Element
    {
        int n = 0;
        foreach (T e in new FilteredElementCollector(doc).OfClass(typeof(T)).Cast<T>())
        {
            if (!filter(e)) continue;
            n++;
            CheckName(e, nameSelector?.Invoke(e) ?? e.Name, rule, sink);
        }
        return n;
    }

    private int ScanWorksets(Document doc, Rule rule, List<Violation> sink)
    {
        if (!doc.IsWorkshared) return 0;
        int n = 0;
        var present = new HashSet<string>();
        foreach (Workset ws in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset))
        {
            n++; present.Add(ws.Name);
            if (!rule.Whitelist.Contains(ws.Name))
                sink.Add(Make(rule, -1, ws.Name));
        }
        foreach (var missing in rule.Whitelist.Where(w => !present.Contains(w)))
            sink.Add(Make(rule, -1, $"(missing) {missing}"));
        return n;
    }

    private int ScanFamilies(Document doc, Rule rule, List<Violation> sink)
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
            CheckName(f, f.Name, rule, sink);
        }
        return n;
    }

    private int ScanParameter(Document doc, Rule rule, List<Violation> sink)
    {
        if (rule.ParameterName is null) return 0;
        int n = 0;
        foreach (View v in new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>())
        {
            if (v.IsTemplate || !IsUserView(v) || IsExcluded(rule, v.Name)) continue;
            n++;
            CheckParameter(v, rule, sink);
        }
        return n;
    }

    // ---------------- Checks ----------------
    private void CheckName(Element e, string name, Rule rule, List<Violation> sink)
    {
        if (IsExcluded(rule, name)) return;
        if (rule.Whitelist.Contains(name)) return;
        if (rule.Tokens.Count > 0 && CompiledPattern(rule).IsMatch(name)) return;
        if (rule.Tokens.Count == 0 && rule.Whitelist.Count == 0) return; // nothing to check
        sink.Add(Make(rule, e.Id.IdValue(), name));
    }

    private void CheckParameter(Element e, Rule rule, List<Violation> sink)
    {
        var p = e.LookupParameter(rule.ParameterName!);
        if (p is null || !p.HasValue || string.IsNullOrWhiteSpace(p.AsString()))
            sink.Add(Make(rule, e.Id.IdValue(), e.Name));
    }

    private static Violation Make(Rule r, long id, string name) =>
        new(r.Id, r.Mode, id, name,
            r.MessageEn.Replace("{name}", name),
            r.MessageAr?.Replace("{name}", name),
            r.DocRef);

    /// Module 1 amendment: exclude Revit-generated view types globally.
    private static bool IsUserView(View v) => v.ViewType switch
    {
        ViewType.Internal or ViewType.ProjectBrowser or ViewType.SystemBrowser
            or ViewType.Undefined or ViewType.DrawingSheet or ViewType.Legend => false,
        _ => true,
    };
}
