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
        ExtractTypeCatalog(doc, pack);
        return pack;
    }

    // Type parameters worth capturing when authoring rules. Deliberately a short list: the point is to
    // show what an office standard actually keys on, not to dump every parameter in the template.
    private static readonly string[] InterestingParams =
    { "Fire Rating", "Material", "Structural Material", "Assembly Code", "Type Mark", "Keynote", "Function" };

    /// <summary>
    /// Harvest every placeable TYPE in the template — the vocabulary the Office Modelling Guideline is
    /// allowed to use. Read-only, no transaction.
    ///
    /// This closes a real hole: the guideline previously had to be written from a document or from
    /// memory, so it named types like "BDS_Wall_Ext_200_FR60" that do not exist in the template, and
    /// GhostBuilder would provision an invented type on first build. Harvesting means a rule can only
    /// ever point at something real.
    /// </summary>
    private static void ExtractTypeCatalog(Document doc, StandardsPack pack)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // EVERY element type in the template, not a hand-picked list. The first version harvested only
        // the categories GhostBuilder can place, which quietly excluded most of the family library —
        // stairs, railings, roofs, casework, generic models, section marks, title blocks. An office
        // standard covers the whole library, so the catalogue must too; deciding what the guideline
        // USES is a separate question from recording what the template HAS.
        foreach (ElementType t in new FilteredElementCollector(doc)
                     .WhereElementIsElementType().Cast<ElementType>())
        {
            // No category = a Revit-internal type (view types, project info, …). Not part of the
            // office's family library and only noise in the picker.
            string category;
            try { category = t.Category?.Name ?? ""; } catch { continue; }
            if (string.IsNullOrWhiteSpace(category)) continue;

            string family = SafeFamilyName(t);
            if (!seen.Add(category + "|" + family + "|" + t.Name)) continue;

            var spec = new TypeSpec
            {
                Category = category,
                Family = family,
                Type = t.Name,
                IsSystem = t is HostObjAttributes, // Wall/Floor/Ceiling/Roof — duplicated, not loaded
                WidthMm = Mm(t, BuiltInParameter.WALL_ATTR_WIDTH_PARAM)
                          ?? MmByName(t, "Width") ?? MmByName(t, "Thickness"),
                HeightMm = MmByName(t, "Height"),
            };
            foreach (string p in InterestingParams)
            {
                string? v = t.LookupParameter(p)?.AsString();
                if (!string.IsNullOrWhiteSpace(v)) spec.Params[p] = v!;
            }
            pack.Provision.TypeCatalog.Add(spec);
        }

        pack.Provision.TypeCatalog.Sort((a, b) =>
            string.CompareOrdinal(a.Category + a.Family + a.Type, b.Category + b.Family + b.Type));
    }

    private static string SafeFamilyName(ElementType t)
    {
        try { return t.FamilyName ?? ""; } catch { return ""; }
    }

    /// <summary>A length parameter in MILLIMETRES. Revit stores internally in feet; the guideline and
    /// the BDS type names are both in mm, so convert once here rather than at every reader.</summary>
    private static double? Mm(ElementType t, BuiltInParameter bip)
    {
        Parameter p = t.get_Parameter(bip);
        return p != null && p.StorageType == StorageType.Double ? Round(p.AsDouble() * 304.8) : (double?)null;
    }

    private static double? MmByName(ElementType t, string name)
    {
        Parameter p = t.LookupParameter(name);
        return p != null && p.StorageType == StorageType.Double ? Round(p.AsDouble() * 304.8) : (double?)null;
    }

    private static double Round(double v) => Math.Round(v, 1);

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
