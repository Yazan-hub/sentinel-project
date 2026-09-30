using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.Standards;

/// <summary>
/// Tier-3 execution (docs/standards-engine-spec.md §5): materialize an approved <see cref="StandardsPack"/>
/// into the active model. MUST run on the API thread inside an ExternalEvent (see StandardsBuildEvent) —
/// it opens transactions. Idempotent: skip-if-exists on every item, so re-running only adds deltas.
///
/// It also stages the install of the document's project's next ruleset@n (the pack's worksets in WS-01 and
/// its naming rules, merged into the installed raw body); StandardsBuildEvent runs that GET/PUT off the API
/// thread, then the scanner reloads the new ruleset@n ("one array, two faces").
/// </summary>
public static class StandardsBuilder
{
    /// <summary><paramref name="doc"/> is the model the review window was opened on (XC-1) — never re-read from the
    /// active document here.</summary>
    public static BuildReport Build(UIApplication uiapp, Document doc, StandardsPack pack)
    {
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

    // ---------------- Enforcement loop: worksets + naming rules -> the project's ruleset@n+1 -> reload ----------------
    /// Captures what the install needs on the API thread (the document's project, the pack's worksets and naming
    /// rules) and stages the HTTP part in <see cref="BuildReport.RulesetJob"/>, which StandardsBuildEvent runs OFF
    /// the API thread after the model report is on screen.
    private static void PersistRuleUpdates(Document doc, StandardsPack pack, BuildReport r)
    {
        var worksets = pack.Provision.Worksets.Select(w => w.Name).Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.Ordinal).ToList();
        var naming = pack.Provision.NamingRules.Select(s => s.ToRule()).ToList();
        if (worksets.Count == 0 && naming.Count == 0) return;

        var ctx = ProjectContext.For(doc);
        if (!ctx.IsBound)
        {
            r.Skipped.Add("Ruleset: not installed — this model is not bound to a web project (Sentinel ▸ Project Setup), so there is no project to install it on");
            return;
        }
        string key = ctx.Key, title = doc.Title, packKey = pack.PackKey, packSemver = pack.Semver;
        r.Created.Add($"Ruleset: installing on {key} — the outcome follows under \"Ruleset install\"");
        r.RulesetJob = () => InstallRuleset(doc, key, title, packKey, packSemver, worksets, naming);
    }

    /// OFF the API thread. GET the installed raw ruleset (project → office), merge, and when the canonical form
    /// changed PUT ruleset@n+1 on the document's own project (actor UserSession.Actor, source revit-build);
    /// then reload + rescan on the API thread. Never throws; every outcome is a line for the review window.
    private static List<string> InstallRuleset(Document doc, string key, string title, string packKey, string packSemver,
        List<string> worksets, List<Rule> naming)
    {
        var lines = new List<string>();
        try
        {
            var cur = ArtefactClient.Resolve(key, "ruleset");
            if (cur.Origin == "cache")
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: the bridge did not answer ({cur.Label}). A cached copy is never the base of an install — the model was built; run Apply again when the bridge is up.");
                return lines;
            }
            bool nothingInstalled = cur.NotInstalled;
            if (cur.Origin == "none" && !nothingInstalled)
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: {cur.Label}");
                return lines;
            }
            string? baseBody = nothingInstalled ? null
                : cur.BodyJson ?? throw new InvalidOperationException($"the bridge answered {cur.Label} with no body");

            var m = RulesetMerge.Merge(baseBody, worksets, naming, packKey, packSemver);
            foreach (var l in m.Lines) lines.Add("Ruleset: " + l);
            if (!m.Changed)
            {
                lines.Add($"Ruleset: unchanged — {cur.Label} already carries these worksets and naming rules; nothing installed");
                return lines;
            }

            // The route lifts a top-level `source` object into the pointer's provenance (bcf-service.mjs PUT artefacts).
            var body = JsonNode.Parse(m.BodyJson)!.AsObject();
            body["source"] = new JsonObject { ["tool"] = "revit-build", ["pack"] = packKey, ["document"] = title };
            var put = GovernedNotify.InstallArtefact(key, "ruleset", body.ToJsonString(), UserSession.Actor);
            if (put.Error is not null)
            {
                lines.Add($"✗ Ruleset NOT installed on {key}: {put.Error}");
                return lines;
            }

            // Reload + rescan on the API thread so the pane judges by the ruleset@n just installed: App.ReloadRuleset
            // reads the key there, fetches off it, then sets the engine, rescans and refreshes the strip.
            App.Events?.Enqueue(_ =>
            {
                if (!doc.IsValidObject) return;
                App.ReloadRuleset(doc);
            });
            if (cur.Source == "office")
                lines.Add($"⚠ {key} now has its own ruleset: this stops {key} inheriting {cur.Label} from its office — later office installs no longer reach it");
            string sha = put.Sha256 is { Length: > 12 } s ? s.Substring(0, 12) + "…" : put.Sha256 ?? "";
            lines.Add($"Ruleset: installed ruleset@{put.Version} · project · {sha} on {key} ({m.Semver}); the scanner reloads it");
        }
        catch (Exception ex) { lines.Add($"✗ Ruleset install: {ex.Message}"); }
        return lines;
    }
}
