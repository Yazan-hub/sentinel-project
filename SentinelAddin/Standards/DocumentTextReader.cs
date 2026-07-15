using System;
using System.Collections.Generic;
using System.IO;
using UglyToad.PdfPig;

namespace Sentinel.Standards;

/// <summary>
/// Tier-2 step 1 (docs/standards-engine-spec.md §2): pull plain text out of an office-standards
/// document, page by page, so the LLM extractor can cite the page each item came from. PDFs go
/// through PdfPig (pure-managed); text/markdown/CSV are read directly as a single page. Pure file
/// I/O — no Revit API, no network — so it's safe to run off the API thread.
/// </summary>
public static class DocumentTextReader
{
    public sealed class DocPage
    {
        public int Number { get; set; }
        public string Text { get; set; } = string.Empty;
    }

    public static IReadOnlyList<DocPage> Read(string path)
    {
        string ext = Path.GetExtension(path).ToLowerInvariant();
        return ext == ".pdf" ? ReadPdf(path) : ReadText(path);
    }

    /// True for source labels: PDFs are cited as "pdf:", everything else as "doc:".
    public static bool IsPdf(string path) =>
        string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase);

    private static List<DocPage> ReadText(string path) =>
        new() { new DocPage { Number = 1, Text = File.ReadAllText(path) } };

    private static List<DocPage> ReadPdf(string path)
    {
        var pages = new List<DocPage>();
        using var pdf = PdfDocument.Open(path);
        foreach (var page in pdf.GetPages())
            pages.Add(new DocPage { Number = page.Number, Text = page.Text ?? string.Empty });
        return pages;
    }
}
