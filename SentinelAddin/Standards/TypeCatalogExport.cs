using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ArtefactClient.RefLabel (MA-2a: the install line)

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

    /// <summary>The type_catalog@n body: template {title, extracted_at}, count, types, view_templates (the
    /// guideline's views section names view templates, so one harvest supplies both).</summary>
    /// No template path: it names a workstation folder, and the body goes to the office's shared store when installed.
    public static string Json(string templateTitle, DateTimeOffset extractedAt,
                              List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates) =>
        JsonSerializer.Serialize(new
        {
            template = new { title = templateTitle, extracted_at = extractedAt.ToString("o") },
            count = types.Count,
            types,
            view_templates = viewTemplates,
        }, new JsonSerializerOptions { WriteIndented = true });

    /// <summary>Write the export into <paramref name="exportsDir"/> (created when absent) and return its path.
    /// Throws on an I/O failure; the caller says so.</summary>
    public static string Write(string exportsDir, string templateTitle, DateTimeOffset extractedAt,
                               List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates)
    {
        Directory.CreateDirectory(exportsDir);
        string path = Path.Combine(exportsDir, FileName(templateTitle));
        File.WriteAllText(path, Json(templateTitle, extractedAt, types, viewTemplates));
        return path;
    }

    /// <summary>What Build Office System says after the export: where it is and how to install it on the office.</summary>
    public static string Message(int count, string templateTitle, string path) =>
        $"Type catalogue exported ({count} types from {templateTitle}) → {path}. " +
        $"Install it on the office: node bridge/artefact-import.mjs \"{path}\" --project <office> --kind type_catalog.\n\n" +
        "Run it from WebApp; <office> is the office's web project key. Ghost Builder and Photo Massing read the type " +
        "catalogue installed on the project or its office — never this file.\n\n" +
        "A lead installs it from the review window too: Install catalogue on office (MA-2a, BOS-3) — no command line.";

    /// <summary>MA-2a (BOS-3): the body Install on office PUTs — the export plus a top-level <c>source</c> {tool: revit-build,
    /// document}, which the bridge's PUT route lifts into the pointer's provenance (as the ruleset install's does).</summary>
    public static string InstallJson(string templateTitle, DateTimeOffset extractedAt, List<TypeSpec> types, List<ViewTemplateSpec> viewTemplates, string document)
    {
        var body = JsonNode.Parse(Json(templateTitle, extractedAt, types, viewTemplates))!.AsObject();
        body["source"] = new JsonObject { ["tool"] = "revit-build", ["document"] = document };
        return body.ToJsonString();
    }

    /// <summary>MA-2a (BOS-3): the office a catalogue is installed on, read from GET /cde/projects/:key/scope's answer ({kind,
    /// office_key}): an office's own key, or a project's office — never the project itself (a catalogue installed on a project
    /// would shadow its office's for that project alone, and the office's later installs would no longer reach it). Null with
    /// <paramref name="error"/> otherwise.</summary>
    public static string? OfficeKeyFrom(string scopeJson, string key, out string? error)
    {
        error = null;
        string? kind = null, office = null;
        try
        {
            using var d = JsonDocument.Parse(scopeJson);
            if (d.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (d.RootElement.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String) kind = k.GetString();
                if (d.RootElement.TryGetProperty("office_key", out var o) && o.ValueKind == JsonValueKind.String) office = o.GetString();
            }
        }
        catch (JsonException) { error = "the bridge's answer to the scope read could not be read"; return null; }
        if (kind == "office") return key;
        if (!string.IsNullOrWhiteSpace(office)) return office;
        error = $"project {key} belongs to no office — link it to an office in the web app first (a catalogue installed on a project would shadow its office's, for that project alone)";
        return null;
    }

    /// <summary>MA-2a (BOS-3): the window's line after an install — the artefact's label (the bridge's refLabel), the office, the count,
    /// and where it is read from, so the proof (GET answers the same sha) is one line away.</summary>
    public static string InstallLine(string officeKey, int version, string? sha256, int count, string templateTitle) =>
        $"{ArtefactClient.RefLabel("type_catalog@" + version, "office", sha256)}: installed on {officeKey} — {count:N0} types from {templateTitle}. " +
        $"Ghost Builder, Promote and the bridge read it from here on; GET /cde/{officeKey}/artefacts/type_catalog answers the same sha.";

    /// <summary>MA-2a (BOS-3): the window's line after a refusal — the bridge's own words (a 403 carries the role sentence).</summary>
    public static string NotInstalledLine(string error) => "Catalogue NOT installed: " + error;
}
