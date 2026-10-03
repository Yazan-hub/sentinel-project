using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Workflow; // NamingManagerService.LayerMaterials (MA-2a: the build-up's materials)

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
    // MA-2a: Function is read apart (FUNCTION_PARAM, an Integer: its enum name); Material falls back to the build-up's layers.
    // Fire Rating and Material are what the office's rules key on; Assembly Code, Type Mark and Keynote are what the LOD
    // matrix's property rows will ask for; Structural Material is structure's material.
    private static readonly string[] InterestingParams =
    { "Fire Rating", "Material", "Structural Material", "Assembly Code", "Type Mark", "Keynote" };

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
            Category? cat;
            try { cat = t.Category; } catch { continue; }
            if (cat is null || string.IsNullOrWhiteSpace(cat.Name)) continue;
            // MA-2a (BOS-5): the row is keyed on the English key its BuiltInCategory names (the display name on a Revit whose
            // category Sentinel does not know), so the guideline's "Walls" finds it whatever language harvested it.
            string category = Compat.CategoryKeyOf(cat);

            string family = SafeFamilyName(t);
            if (!seen.Add(category + "|" + family + "|" + t.Name)) continue;

            var spec = new TypeSpec
            {
                Category = Compat.CategoryKeyOf(cat),
                Bic = Compat.BicNameOf(cat),
                CategoryLocal = string.Equals(cat.Name, category, StringComparison.Ordinal) ? null : cat.Name,
                Family = family,
                Type = t.Name,
                IsSystem = t is HostObjAttributes, // Wall/Floor/Ceiling/Roof — duplicated, not loaded
                WidthMm = Mm(t, BuiltInParameter.WALL_ATTR_WIDTH_PARAM)
                          ?? MmByName(t, "Width") ?? MmByName(t, "Thickness"),
                HeightMm = MmByName(t, "Height"),
            };
            foreach (string p in InterestingParams)
            {
                string? v = ParamText(doc, t.LookupParameter(p));
                if (!string.IsNullOrWhiteSpace(v)) spec.Params[p] = v!;
            }
            // MA-2a: the type's Function (walls, floors, doors, windows — whichever Revit gives it), by its enum name. The old
            // LookupParameter("Function").AsString() was null on an Integer parameter: 0 of 1,434 BDS rows carried it.
            var fn = t.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
            if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer && TypeHarvest.FunctionName(fn.AsInteger()) is string function)
                spec.Params["Function"] = function;
            // MA-2a: a system type's build-up materials, when the type has no Material parameter of its own.
            if (!spec.Params.ContainsKey("Material") && TypeHarvest.MaterialLabel(NamingManagerService.LayerMaterials(doc, t)) is string layers)
                spec.Params["Material"] = layers;
            pack.Provision.TypeCatalog.Add(spec);
        }

        pack.Provision.TypeCatalog.Sort((a, b) =>
            string.CompareOrdinal(a.Category + a.Family + a.Type, b.Category + b.Family + b.Type));
    }

    private static string SafeFamilyName(ElementType t)
    {
        try { return t.FamilyName ?? ""; } catch { return ""; }
    }

    /// <summary>MA-2a: a type parameter's value as text, by its storage: text as it is; an element id as that element's name (a
    /// Material); an integer or a length is not a classification and is left out (Function is read apart, by its enum name).</summary>
    private static string? ParamText(Document doc, Parameter? p)
    {
        if (p is null || !p.HasValue) return null;
        switch (p.StorageType)
        {
            case StorageType.String: return p.AsString();
            case StorageType.ElementId:
                var id = p.AsElementId();
                return id is null || id == ElementId.InvalidElementId ? null : doc.GetElement(id)?.Name;
            default: return null;
        }
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
            // MA-2a (BOS-5): the English key, so a German harvest's binding resolves on an English Revit (ResolveCategory binds BIC-first).
            if (binding is ElementBinding eb)
                foreach (Category c in eb.Categories) categories.Add(Compat.CategoryKeyOf(c));

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
