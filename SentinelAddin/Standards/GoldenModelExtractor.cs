using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Standards;

/// <summary>
/// Tier 0 of the ingestion pipeline (docs/standards-engine-spec.md §3): reverse-extract an
/// office standard straight from a "golden" model. Pure read-only Revit-API — no transaction,
/// no AI — so it's 100% accurate (confidence 1.0) and safe to run synchronously inside the
/// command's API-thread context before the review window opens.
///
/// MVP surface: user worksets + shared-parameter bindings. Browser org / view templates /
/// line-fill patterns follow in later slices.
/// </summary>
public static class GoldenModelExtractor
{
    public static StandardsPack Extract(Document doc)
    {
        string src = "golden-model:" + doc.Title;
        var pack = new StandardsPack
        {
            PackKey = Slug(doc.Title),
            CreatedAt = DateTimeOffset.Now.ToString("o"),
            SourceModel = new SourceModel { Title = doc.Title, Path = doc.PathName },
        };

        ExtractWorksets(doc, pack, src);
        ExtractSharedParameters(doc, pack, src);
        ExtractViewTemplates(doc, pack, src);
        ExtractBrowserOrganization(doc, pack, src);
        return pack;
    }

    private static void ExtractWorksets(Document doc, StandardsPack pack, string src)
    {
        if (!doc.IsWorkshared) return; // non-workshared golden model exposes no user worksets
        foreach (Workset ws in new FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset))
        {
            pack.Provision.Worksets.Add(new WorksetSpec
            {
                Name = ws.Name,
                Confidence = 1.0,
                Provenance = new Provenance { Source = src, Locator = "WorksetTable" },
            });
        }
    }

    private static void ExtractSharedParameters(Document doc, StandardsPack pack, string src)
    {
        // The binding map holds shared AND project parameters; keep only the shared ones by
        // cross-referencing the SharedParameterElements (which also carry the stable GUID).
        var shared = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (SharedParameterElement spe in new FilteredElementCollector(doc)
                     .OfClass(typeof(SharedParameterElement)).Cast<SharedParameterElement>())
        {
            shared[spe.Name] = spe.GuidValue; // last-wins on the rare duplicate name
        }
        if (shared.Count == 0) return;

        var it = doc.ParameterBindings.ForwardIterator();
        while (it.MoveNext())
        {
            if (it.Key is not Definition def) continue;
            if (!shared.TryGetValue(def.Name, out var guid)) continue; // shared params only

            var binding = it.Current as Binding;
            var categories = new List<string>();
            if (binding is ElementBinding eb)
                foreach (Category c in eb.Categories) categories.Add(c.Name);

            pack.Provision.SharedParameters.Add(new SharedParamSpec
            {
                Name = def.Name,
                Type = StandardsCompat.TypeToken(def),
                Binding = binding is InstanceBinding ? "instance" : "type",
                Categories = categories,
                Guid = guid.ToString(),
                Confidence = 1.0,
                Provenance = new Provenance { Source = src, Locator = "ParameterBindings" },
            });
        }
    }

    private static void ExtractViewTemplates(Document doc, StandardsPack pack, string src)
    {
        foreach (View v in new FilteredElementCollector(doc).OfClass(typeof(View)).Cast<View>())
        {
            if (!v.IsTemplate) continue;
            pack.Provision.ViewTemplates.Add(new ViewTemplateSpec
            {
                Name = v.Name,
                ViewType = v.ViewType.ToString(),
                DetailLevel = Try(() => v.DetailLevel.ToString()),
                Scale = Try(() => v.Scale, 0),
                Discipline = Try(() => v.Discipline.ToString()),
                SourceElementId = v.Id.IdValue(),
                Confidence = 1.0,
                Provenance = new Provenance { Source = src, Locator = "View.IsTemplate" },
            });
        }
    }

    private static void ExtractBrowserOrganization(Document doc, StandardsPack pack, string src)
    {
        void Add(string target, BrowserOrganization? org, string locator)
        {
            if (org is null || string.IsNullOrWhiteSpace(org.Name)) return;
            pack.Provision.BrowserOrganization.Add(new BrowserOrgSpec
            {
                Target = target,
                Name = org.Name,
                Confidence = 1.0,
                Provenance = new Provenance { Source = src, Locator = locator },
            });
        }
        try { Add("views", BrowserOrganization.GetCurrentBrowserOrganizationForViews(doc), "Views browser org"); } catch { }
        try { Add("sheets", BrowserOrganization.GetCurrentBrowserOrganizationForSheets(doc), "Sheets browser org"); } catch { }
    }

    // Some View properties throw for certain view kinds (e.g. Scale on a schedule) — read defensively.
    private static string? Try(Func<string> f) { try { return f(); } catch { return null; } }
    private static T Try<T>(Func<T> f, T fallback) { try { return f(); } catch { return fallback; } }

    /// Filesystem/JSON-safe key from the model title (e.g. "ACME Tower.rvt" -> "acme-tower").
    private static string Slug(string s)
    {
        var chars = (s ?? "office")
            .ToLowerInvariant()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
            .ToArray();
        var slug = new string(chars).Trim('-');
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        return string.IsNullOrWhiteSpace(slug) ? "office" : slug;
    }
}
