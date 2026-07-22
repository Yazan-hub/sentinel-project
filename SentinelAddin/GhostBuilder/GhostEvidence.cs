#nullable disable
// P2 SENSE (slice 1): read supporting documents from a SCOPED local folder (PDF / txt / md / csv) into a
// compact text "evidence" blob that enriches the model's layer interpretation — e.g. a spec's "FR60 external
// walls" helps categorise an ambiguous layer. Reads ONLY within the configured folder (path-scoped); never
// touches the rest of the disk, never the network. Local + offline (DocumentTextReader / PdfPig). No Revit
// API, so it's safe to run off the API thread. Images (sketches/renders) are P2 slice 2 (local vision).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Sentinel.Standards;

namespace Sentinel.GhostBuilder
{
    public sealed class GhostEvidence
    {
        public string Context { get; }
        public IReadOnlyList<string> Sources { get; }
        public bool IsEmpty => string.IsNullOrWhiteSpace(Context);

        private GhostEvidence(string context, List<string> sources)
        {
            Context = context ?? string.Empty;
            Sources = sources ?? new List<string>();
        }

        public static readonly GhostEvidence Empty = new GhostEvidence(string.Empty, new List<string>());

        private static readonly string[] TextExtensions = { ".pdf", ".txt", ".md", ".csv" };

        /// <summary>Read PDFs/text from the scoped folder (and its subfolders) into a bounded context blob.
        /// Never throws; returns Empty on a missing/blank folder or any read failure.</summary>
        public static GhostEvidence FromFolder(string folder, int maxChars = 6000)
        {
            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return Empty;

            string root;
            IEnumerable<string> files;
            try
            {
                root = Path.GetFullPath(folder);
                files = Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories);
            }
            catch { return Empty; }

            var sb = new StringBuilder();
            var sources = new List<string>();

            foreach (var file in files)
            {
                if (sb.Length >= maxChars) break;
                string ext = Path.GetExtension(file).ToLowerInvariant();
                if (Array.IndexOf(TextExtensions, ext) < 0) continue;

                // Path-scope guard: only files that actually resolve inside the configured folder.
                try { if (!Path.GetFullPath(file).StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue; }
                catch { continue; }

                try
                {
                    var pages = DocumentTextReader.Read(file);
                    string text = string.Join("\n", pages.Select(p => p.Text)).Trim();
                    if (text.Length == 0) continue;

                    sources.Add(Path.GetFileName(file));
                    sb.Append('[').Append(Path.GetFileName(file)).Append("]\n");
                    int remaining = maxChars - sb.Length;
                    sb.Append(remaining > 0 && text.Length > remaining ? text.Substring(0, remaining) : text);
                    sb.Append("\n\n");
                }
                catch { /* skip an unreadable/locked file */ }
            }

            return sources.Count == 0 ? Empty : new GhostEvidence(sb.ToString().Trim(), sources);
        }
    }
}
