using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Tier-3 execution (docs/standards-engine-spec.md §5): materialize an approved <see cref="StandardsPack"/>
/// into the active model. MUST run on the API thread inside an ExternalEvent (see StandardsBuildEvent) —
/// it opens transactions. Idempotent: skip-if-exists on every item, so re-running only adds deltas.
///
/// On success it also merges the built worksets into the effective ruleset's WS rule and reloads the
/// engine, so the scanner immediately enforces the standard just provisioned ("one array, two faces").
/// </summary>
public static class StandardsBuilder
{
    public static BuildReport Build(UIApplication uiapp, StandardsPack pack)
    {
        var doc = uiapp.ActiveUIDocument.Document;
        var app = uiapp.Application;
        var report = new BuildReport();

        BuildWorksets(doc, pack, report);
        BuildSharedParameters(doc, app, pack, report);
        BuildViewTemplates(uiapp, doc, pack, report);
        BuildBrowserOrganization(uiapp, doc, pack, report);
        PersistRuleUpdates(doc, pack, report);

        return report;
    }

    // ---------------- Worksets ----------------
    private static void BuildWorksets(Document doc, StandardsPack pack, BuildReport r)
    {
        if (pack.Provision.Worksets.Count == 0) return;

        // Decision #4: on a non-workshared model we refuse (worksets need worksharing) and report why.
        if (!doc.IsWorkshared)
        {
            foreach (var w in pack.Provision.Worksets)
                r.Skipped.Add($"Workset '{w.Name}' — model is not workshared. Enable worksharing, then re-run.");
            return;
        }

        var existing = new HashSet<string>(new FilteredWorksetCollector(doc)
            .OfKind(WorksetKind.UserWorkset).Select(w => w.Name), StringComparer.Ordinal);

        using var t = new Transaction(doc, "Sentinel: Build worksets");
        t.Start();
        foreach (var w in pack.Provision.Worksets)
        {
            if (existing.Contains(w.Name)) { r.Skipped.Add($"Workset '{w.Name}' (exists)"); continue; }
            try
            {
                Workset.Create(doc, w.Name);
                existing.Add(w.Name);
                r.Created.Add($"Workset '{w.Name}'");
            }
            catch (Exception ex) { r.Failed.Add($"Workset '{w.Name}': {ex.Message}"); }
        }
        t.Commit();
    }

    // ---------------- Shared parameters ----------------
    private static void BuildSharedParameters(Document doc, Application app, StandardsPack pack, BuildReport r)
    {
        if (pack.Provision.SharedParameters.Count == 0) return;

        // The shared-parameter file is an APPLICATION-level setting; borrow it, then restore.
        string? previousFile = null;
        try { previousFile = app.SharedParametersFilename; } catch { /* not set */ }

        try
        {
            DefinitionFile? defFile = EnsureSharedFile(app, pack);
            if (defFile is null)
            {
                foreach (var p in pack.Provision.SharedParameters)
                    r.Failed.Add($"Param '{p.Name}': could not open a shared-parameter file");
                return;
            }

            using var t = new Transaction(doc, "Sentinel: Bind shared parameters");
            t.Start();
            foreach (var p in pack.Provision.SharedParameters)
            {
                try { BindOne(doc, app, defFile, p, r); }
                catch (Exception ex) { r.Failed.Add($"Param '{p.Name}': {ex.Message}"); }
            }
            t.Commit();
        }
        finally
        {
            try { if (!string.IsNullOrEmpty(previousFile)) app.SharedParametersFilename = previousFile; }
            catch { /* best-effort restore */ }
        }
    }

    private static void BindOne(Document doc, Application app, DefinitionFile defFile, SharedParamSpec p, BuildReport r)
    {
        Definition? def = GetOrCreateDefinition(defFile, p);
        if (def is null) { r.Failed.Add($"Param '{p.Name}': could not create definition"); return; }

        if (doc.ParameterBindings.Contains(def)) { r.Skipped.Add($"Param '{p.Name}' (already bound)"); return; }

        var catSet = app.Create.NewCategorySet();
        int added = 0;
        foreach (var name in p.Categories)
        {
            var cat = ResolveCategory(doc, name);
            if (cat is not null && cat.AllowsBoundParameters) { catSet.Insert(cat); added++; }
        }
        if (added == 0) { r.Skipped.Add($"Param '{p.Name}' (no bindable categories in this model)"); return; }

        Binding binding = string.Equals(p.Binding, "type", StringComparison.OrdinalIgnoreCase)
            ? app.Create.NewTypeBinding(catSet)
            : app.Create.NewInstanceBinding(catSet);

        // 2-arg Insert (no group) is version-stable across 2021–2027 — sidesteps the
        // BuiltInParameterGroup→GroupTypeId split; the param lands in the default group.
        if (doc.ParameterBindings.Insert(def, binding))
            r.Created.Add($"Param '{p.Name}' → {added} categor{(added == 1 ? "y" : "ies")} ({p.Binding})");
        else
            r.Failed.Add($"Param '{p.Name}': binding insert rejected");
    }

    private static DefinitionFile? EnsureSharedFile(Application app, StandardsPack pack)
    {
        // Reuse the model's existing shared file if one is already configured and present.
        try
        {
            string current = app.SharedParametersFilename;
            if (!string.IsNullOrWhiteSpace(current) && File.Exists(current))
            {
                var existing = app.OpenSharedParameterFile();
                if (existing is not null) return existing;
            }
        }
        catch { /* fall through and create ours */ }

        string dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "shared");
        Directory.CreateDirectory(dir);
        string path = Path.Combine(dir, pack.PackKey + ".txt");
        if (!File.Exists(path)) File.WriteAllText(path, EmptySharedParamFile);

        app.SharedParametersFilename = path;
        return app.OpenSharedParameterFile();
    }

    // A valid (empty) Revit shared-parameter file so OpenSharedParameterFile() never returns null.
    private const string EmptySharedParamFile =
        "# This is a Revit shared parameter file.\n" +
        "# Do not edit manually.\n" +
        "*META\tVERSION\tMINVERSION\n" +
        "META\t2\t1\n" +
        "*GROUP\tID\tNAME\n" +
        "*PARAM\tGUID\tNAME\tDATATYPE\tDATACATEGORY\tGROUP\tVISIBLE\tDESCRIPTION\tUSERMODIFIABLE\tHIDEWHENNOVALUE\n";

    private static Definition? GetOrCreateDefinition(DefinitionFile file, SharedParamSpec p)
    {
        DefinitionGroup group = file.Groups.get_Item(p.Group) ?? file.Groups.Create(p.Group);
        Definition? existing = group.Definitions.get_Item(p.Name);
        if (existing is not null) return existing;

        var opts = StandardsCompat.NewDefinitionOptions(p.Name, p.Type);
        if (!string.IsNullOrWhiteSpace(p.Guid) && Guid.TryParse(p.Guid, out var g)) opts.GUID = g;
        return group.Definitions.Create(opts);
    }

    private static Category? ResolveCategory(Document doc, string key)
    {
        // Locale-invariant first (English ruleset key -> BuiltInCategory), then by (localized) name.
        var bic = Compat.ResolveCategoryKey(key);
        if (bic != BuiltInCategory.INVALID)
        {
            try { var c = Category.GetCategory(doc, bic); if (c is not null) return c; } catch { }
        }
        foreach (Category c in doc.Settings.Categories)
            if (string.Equals(c.Name, key, StringComparison.OrdinalIgnoreCase)) return c;
        return null;
    }

    // ---------------- View templates (cross-document transfer) ----------------
    private static void BuildViewTemplates(UIApplication uiapp, Document dest, StandardsPack pack, BuildReport r)
    {
        var specs = pack.Provision.ViewTemplates;
        if (specs.Count == 0) return;

        var existing = new HashSet<string>(new FilteredElementCollector(dest).OfClass(typeof(View))
            .Cast<View>().Where(v => v.IsTemplate).Select(v => v.Name), StringComparer.Ordinal);

        // Names still needed after skipping any already present in the target.
        var needed = new HashSet<string>(StringComparer.Ordinal);
        foreach (var s in specs)
        {
            if (existing.Contains(s.Name)) r.Skipped.Add($"View template '{s.Name}' (exists)");
            else needed.Add(s.Name);
        }
        if (needed.Count == 0) return;

        var source = FindSourceDoc(uiapp, dest, pack.SourceModel);
        if (source is null)
        {
            foreach (var n in needed)
                r.Skipped.Add($"View template '{n}' — open the golden model '{pack.SourceModel?.Title}' to transfer it (Revit can't author templates from a saved pack).");
            return;
        }

        var ids = new List<ElementId>();
        foreach (View v in new FilteredElementCollector(source).OfClass(typeof(View)).Cast<View>())
            if (v.IsTemplate && needed.Contains(v.Name)) ids.Add(v.Id);
        if (ids.Count == 0) return;

        try
        {
            using var t = new Transaction(dest, "Sentinel: Copy view templates");
            t.Start();
            var opts = new CopyPasteOptions();
            opts.SetDuplicateTypeNamesHandler(new UseDestinationTypes());
            var copied = ElementTransformUtils.CopyElements(source, ids, dest, Transform.Identity, opts);
            t.Commit();
            r.Created.Add($"View templates: copied {copied.Count} from '{source.Title}'");
        }
        catch (Exception ex) { r.Failed.Add($"View templates: {ex.Message}"); }
    }

    // ---------------- Browser organization (cross-document transfer, best-effort) ----------------
    private static void BuildBrowserOrganization(UIApplication uiapp, Document dest, StandardsPack pack, BuildReport r)
    {
        var specs = pack.Provision.BrowserOrganization;
        if (specs.Count == 0) return;

        var existing = new HashSet<string>(new FilteredElementCollector(dest).OfClass(typeof(BrowserOrganization))
            .Cast<BrowserOrganization>().Select(o => o.Name), StringComparer.Ordinal);

        var needed = new HashSet<string>(StringComparer.Ordinal);
        foreach (var s in specs)
        {
            if (string.IsNullOrWhiteSpace(s.Name)) continue;
            if (existing.Contains(s.Name)) r.Skipped.Add($"Browser organization '{s.Name}' (exists)");
            else needed.Add(s.Name);
        }
        if (needed.Count == 0) return;

        var source = FindSourceDoc(uiapp, dest, pack.SourceModel);
        if (source is null)
        {
            foreach (var n in needed)
                r.Skipped.Add($"Browser organization '{n}' — open the golden model to transfer it (or use Manage ▸ Transfer Project Standards).");
            return;
        }

        var ids = new FilteredElementCollector(source).OfClass(typeof(BrowserOrganization))
            .Cast<BrowserOrganization>().Where(o => needed.Contains(o.Name)).Select(o => o.Id).ToList();
        if (ids.Count == 0) return;

        try
        {
            using var t = new Transaction(dest, "Sentinel: Copy browser organization");
            t.Start();
            var opts = new CopyPasteOptions();
            opts.SetDuplicateTypeNamesHandler(new UseDestinationTypes());
            var copied = ElementTransformUtils.CopyElements(source, ids, dest, Transform.Identity, opts);
            t.Commit();
            r.Created.Add($"Browser organization: copied {copied.Count} scheme(s) — activate via Project Browser ▸ right-click ▸ Browser Organization.");
        }
        catch (Exception ex) { r.Failed.Add($"Browser organization: {ex.Message} (fallback: Manage ▸ Transfer Project Standards)."); }
    }

    /// Locate the open golden model (by path, then title) to copy transfer-only items from.
    /// Excludes the destination itself and linked models.
    private static Document? FindSourceDoc(UIApplication uiapp, Document dest, SourceModel? sm)
    {
        if (sm is null) return null;
        foreach (Document d in uiapp.Application.Documents)
        {
            if (d.IsLinked || d.Equals(dest)) continue;
            if (!string.IsNullOrEmpty(sm.Path) && string.Equals(d.PathName, sm.Path, StringComparison.OrdinalIgnoreCase)) return d;
            if (string.Equals(d.Title, sm.Title, StringComparison.OrdinalIgnoreCase)) return d;
        }
        return null;
    }

    /// Keep the target's existing types when a copied element's dependent type name collides.
    private sealed class UseDestinationTypes : IDuplicateTypeNamesHandler
    {
        public DuplicateTypeAction OnDuplicateTypeNamesFound(DuplicateTypeNamesHandlerArgs args)
            => DuplicateTypeAction.UseDestinationTypes;
    }

    // ---------------- Enforcement loop: worksets + naming rules -> ruleset -> reload scanner ----------------
    private static void PersistRuleUpdates(Document doc, StandardsPack pack, BuildReport r)
    {
        bool hasWorksets = pack.Provision.Worksets.Count > 0;
        bool hasNaming = pack.Provision.NamingRules.Count > 0;
        if (!hasWorksets && !hasNaming) return;

        try
        {
            var rs = RulesetStore.LoadEffective(doc);

            if (hasWorksets)
            {
                var built = pack.Provision.Worksets.Select(w => w.Name).Distinct().ToList();

                var wsRule = rs.Rules.FirstOrDefault(x => x.Target == RuleTarget.Workset);
                if (wsRule is null)
                {
                    wsRule = new Rule
                    {
                        Id = "WS-01",
                        Target = RuleTarget.Workset,
                        Mode = EnforcementMode.Warn,
                        MessageEn = "Workset '{name}' is not in the office standard.",
                        DocRef = pack.PackKey,
                    };
                    rs.Rules.Add(wsRule);
                }
                // Union so an existing house standard isn't clobbered — the built worksets are added.
                wsRule.Whitelist = wsRule.Whitelist.Union(built, StringComparer.Ordinal).Distinct().ToList();
                r.Created.Add($"Ruleset: WS-01 now enforces {built.Count} workset(s)");
            }

            if (hasNaming)
            {
                foreach (var spec in pack.Provision.NamingRules)
                {
                    Rule rule = spec.ToRule();
                    // Replace an existing rule with the same id (idempotent re-runs), else append.
                    int idx = rs.Rules.FindIndex(x => string.Equals(x.Id, rule.Id, StringComparison.Ordinal));
                    if (idx >= 0) rs.Rules[idx] = rule; else rs.Rules.Add(rule);
                    r.Created.Add($"Ruleset: naming rule {rule.Id} [{rule.Target}] {string.Join(rule.Separator, rule.Tokens)}");
                }
            }

            // Same wire format RulesetStore reads (snake_case enums), written to the user cache.
            var opts = new JsonSerializerOptions
            {
                WriteIndented = true,
                Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
            };
            Directory.CreateDirectory(Path.GetDirectoryName(RulesetStore.UserCachePath)!);
            File.WriteAllText(RulesetStore.UserCachePath, JsonSerializer.Serialize(rs, opts));

            // Reload + rescan so the panel reflects the standard we just built.
            App.Engine?.ReloadRuleset(doc);
            var report = App.Engine?.ScanFull(doc);
            if (report is not null) App.PanelVm?.PublishReport(report);

            r.Created.Add("Ruleset: scanner reloaded");
        }
        catch (Exception ex) { r.Failed.Add($"Ruleset persist: {ex.Message}"); }
    }
}
