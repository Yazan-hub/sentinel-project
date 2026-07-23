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

    // Categories the guideline can place. Kept in step with GhostBuilder's build categories — a type
    // harvested for a category GhostBuilder can't place would only be noise when authoring rules.
    private static readonly (BuiltInCategory Bic, string Name)[] CatalogCategories =
    {
        (BuiltInCategory.OST_Walls, "Walls"),
        (BuiltInCategory.OST_Floors, "Floors"),
        (BuiltInCategory.OST_Ceilings, "Ceilings"),
        (BuiltInCategory.OST_Doors, "Doors"),
        (BuiltInCategory.OST_Windows, "Windows"),
        (BuiltInCategory.OST_Columns, "Columns"),
        (BuiltInCategory.OST_StructuralColumns, "Columns"),
        (BuiltInCategory.OST_Furniture, "Furniture"),
        // Annotation families — the guideline's graphics section names TAGS, and without harvesting
        // them that section can only ever be invented, which is the failure mode this whole exercise
        // exists to prevent.
        (BuiltInCategory.OST_WallTags, "Tags:Walls"),
        (BuiltInCategory.OST_DoorTags, "Tags:Doors"),
        (BuiltInCategory.OST_WindowTags, "Tags:Windows"),
        (BuiltInCategory.OST_FloorTags, "Tags:Floors"),
        (BuiltInCategory.OST_CeilingTags, "Tags:Ceilings"),
        (BuiltInCategory.OST_StructuralColumnTags, "Tags:Columns"),
        (BuiltInCategory.OST_RoomTags, "Tags:Rooms"),
        (BuiltInCategory.OST_Dimensions, "Dimensions"),
        (BuiltInCategory.OST_TextNotes, "Text"),
    };

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

        foreach (var (bic, name) in CatalogCategories)
        {
            IEnumerable<ElementType> types;
            try
            {
                types = new FilteredElementCollector(doc)
                    .OfCategory(bic).WhereElementIsElementType().Cast<ElementType>();
            }
            catch { continue; } // a category absent from this template is not an error

            foreach (ElementType t in types)
            {
                // FamilyName is the system-family name for walls/floors/ceilings and the loaded family
                // name for everything else — which is exactly the distinction the guideline needs.
                string family = SafeFamilyName(t);
                string key = name + "|" + family + "|" + t.Name;
                if (!seen.Add(key)) continue; // Columns appears twice (arch + structural)

                var spec = new TypeSpec
                {
                    Category = name,
                    Family = family,
                    Type = t.Name,
                    IsSystem = t is HostObjAttributes, // Wall/Floor/Ceiling/Roof types
                    WidthMm = Mm(t, BuiltInParameter.CURVE_ELEM_LENGTH) ?? Mm(t, BuiltInParameter.WALL_ATTR_WIDTH_PARAM)
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
