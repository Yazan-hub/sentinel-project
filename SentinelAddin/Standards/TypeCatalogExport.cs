using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Standards;

/// <summary>
/// Build Office System's harvest as a type_catalog@n body (cohesion phase 4b-2): written to
/// %AppData%\Sentinel\exports\type-catalog-&lt;template&gt;.json for a lead to install on the office with
/// <c>artefact-import --kind type_catalog</c>. An EXPORT only — the add-in never reads it back (Revit reads the
/// catalogue installed on the document's project or its office), and it replaces the one machine-global catalogue
/// file every Build overwrote (F54). The template travels as <c>template</c>, never <c>source</c>: the bridge's PUT
/// route lifts a top-level source into the artefact's pointer and the catalogue would lose it. Pure — no Revit —
/// so tools/ghost-standards-check writes one and reads it back as the add-in would.
/// </summary>
public static class TypeCatalogExport
{
    /// <summary>"type-catalog-&lt;title&gt;.json": every run of characters other than letters, digits, '.', '_' and
    /// '-' becomes one '_' (spaces and brackets too, so the printed install command needs no escaping).</summary>
    public static string FileName(string templateTitle)
    {
        string safe = Regex.Replace(templateTitle ?? "", @"[^A-Za-z0-9._-]+", "_").Trim('_', '.');
        return "type-catalog-" + (safe.Length == 0 ? "untitled" : safe) + ".json";
    }

    /// <summary>The type_catalog@n body: template {title, path, extracted_at}, count, types, view_templates (the
    /// guideline's views section names view templates, so one harvest supplies both).</summary>
    public static string Json(string templateTitle, string templatePath, DateTimeOffset extractedAt,
                              List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates) =>
        JsonSerializer.Serialize(new
        {
            template = new { title = templateTitle, path = templatePath ?? "", extracted_at = extractedAt.ToString("o") },
            count = types.Count,
            types,
            view_templates = viewTemplates,
        }, new JsonSerializerOptions { WriteIndented = true });

    /// <summary>Write the export into <paramref name="exportsDir"/> (created when absent) and return its path.
    /// Throws on an I/O failure; the caller says so.</summary>
    public static string Write(string exportsDir, string templateTitle, string templatePath, DateTimeOffset extractedAt,
                               List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates)
    {
        Directory.CreateDirectory(exportsDir);
        string path = Path.Combine(exportsDir, FileName(templateTitle));
        File.WriteAllText(path, Json(templateTitle, templatePath, extractedAt, types, viewTemplates));
        return path;
    }

    /// <summary>What Build Office System says after the export: where it is and how to install it on the office.</summary>
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}. " +
        $"Install it on the office: node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog.\n\n" +
        "Run it from WebApp; <office> is the office's web project key. Ghost Builder and Photo Massing read the type " +
        "catalogue installed on the project or its office — never this file.";
}
