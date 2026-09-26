#nullable disable
// ponytail: nullable off for the ported GhostBuilder module; annotate + remove when hardening.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Wall types are SYSTEM families — they cannot be loaded from .rfa like component families. So when a ticked
    /// mapping row names a wall type the document lacks, the type is created the one way GhostTypeCreator creates one:
    /// a clone of the nearest sibling the installed type catalogue lists AND this document has, resized when the name
    /// carries a thickness. No such sibling — the catalogue is none, does not name the type, or the document holds none
    /// of its family — is a reported gap naming the catalogue, never a clone of an unrelated wall (F43: another office's
    /// names were once cloned onto the first Basic wall). Must run inside a Transaction on the API thread, BEFORE
    /// GhostPlacementEngine is constructed (the engine caches wall types in its ctor, so new types must exist first).
    /// </summary>
    public sealed class GhostWallTypeProvisioner
    {
        private readonly Document _doc;
        private readonly GuidelineMatcher _guideline; // the catalogue in force; null = not loaded

        public GhostWallTypeProvisioner(Document doc, GuidelineMatcher guideline)
        {
            _doc = doc;
            _guideline = guideline;
        }

        public sealed class ProvisionReport
        {
            public int Created;
            public int AlreadyPresent;
            /// <summary>Names not created: no sibling from the type catalogue in this document (each in Warnings).</summary>
            public int Gaps;
            public readonly List<string> Warnings = new List<string>();
        }

        /// <summary>Creates each missing "Walls" mapping name from its catalogue sibling, or reports the gap. Caller
        /// owns the Transaction.</summary>
        public ProvisionReport Provision(MappingResult mapping)
        {
            var report = new ProvisionReport();
            if (mapping?.Mappings == null) return report;

            var existing = new HashSet<string>(
                new FilteredElementCollector(_doc).OfClass(typeof(WallType))
                    .Cast<WallType>().Select(w => w.Name),
                StringComparer.OrdinalIgnoreCase);

            // Distinct wall-type names the mapping needs (prefer bdsFamilyType, fall back to bdsFamily).
            var wanted = mapping.Mappings
                .Where(m => string.Equals(m.Category, "Walls", StringComparison.OrdinalIgnoreCase))
                .Select(m => m.BdsFamilyType ?? m.BdsFamily)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (string name in wanted)
            {
                if (existing.Contains(name)) { report.AlreadyPresent++; continue; }

                double mm = TypeNameParse.ThicknessMm(name);
                if (mm == double.MaxValue) mm = 0; // no thickness in the name: the sibling's own
                var siblings = _guideline?.CatalogSiblings("Walls", name) ?? new List<string>();
                if (GhostTypeCreator.CreateWallType(_doc, name, mm, siblings, out string reason) != null)
                {
                    report.Created++;
                    existing.Add(name); // don't re-create if two mappings share a name
                    continue;
                }
                report.Gaps++;
                report.Warnings.Add(_guideline?.Gap(name, reason) ?? $"gap: {name} — {reason} (type_catalog: not loaded)");
            }

            return report;
        }
    }
}
