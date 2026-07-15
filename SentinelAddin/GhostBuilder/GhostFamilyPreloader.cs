#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Loads BDS .rfa families from a library folder into the project so that families the
    /// LLM maps to actually exist before placement. Only loads what the mapping asks for and
    /// what isn't already in the doc. Must run inside a Transaction on the Revit API thread.
    /// </summary>
    public sealed class GhostFamilyPreloader
    {
        private readonly Document _doc;
        private readonly string _libraryDir;

        public GhostFamilyPreloader(Document doc, string libraryDir)
        {
            _doc = doc;
            _libraryDir = libraryDir;
        }

        public sealed class PreloadReport
        {
            public int Loaded;
            public int AlreadyPresent;
            public int NotFoundInLibrary;
            public readonly List<string> Warnings = new List<string>();
        }

        /// <summary>
        /// Loads the families named by the mapping. Caller owns the Transaction.
        /// Matches library files by filename == bdsFamily (case-insensitive, ".rfa" optional).
        /// </summary>
        public PreloadReport Preload(MappingResult mapping)
        {
            var report = new PreloadReport();

            if (mapping?.Mappings == null) return report;

            if (!Directory.Exists(_libraryDir))
            {
                report.Warnings.Add($"Family library '{_libraryDir}' not found; skipped preload.");
                return report;
            }

            // What family names does the doc already have?
            var present = new HashSet<string>(
                new FilteredElementCollector(_doc).OfClass(typeof(Family))
                    .Cast<Family>().Select(f => f.Name),
                StringComparer.OrdinalIgnoreCase);

            // Index library .rfa files by base filename for O(1) lookup.
            var libFiles = Directory.EnumerateFiles(_libraryDir, "*.rfa", SearchOption.AllDirectories)
                .GroupBy(Path.GetFileNameWithoutExtension, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            // Distinct family names the mapping actually needs.
            var wanted = mapping.Mappings
                .Select(m => m.BdsFamily)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (string familyName in wanted)
            {
                if (present.Contains(familyName)) { report.AlreadyPresent++; continue; }

                if (!libFiles.TryGetValue(familyName, out string path))
                {
                    report.NotFoundInLibrary++;
                    report.Warnings.Add($"Family '{familyName}' not in library; placement will skip it.");
                    continue;
                }

                // Document.LoadFamily is native and idempotent; returns false if nothing loaded.
                if (_doc.LoadFamily(path, out Family loaded) && loaded != null)
                {
                    report.Loaded++;
                    present.Add(loaded.Name); // avoid reloading a family that shares a file
                }
                else
                {
                    report.Warnings.Add($"LoadFamily failed for '{path}'.");
                }
            }

            return report;
        }
    }
}
