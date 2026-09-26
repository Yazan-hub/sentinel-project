#nullable disable
// Floor types are SYSTEM families (like walls) — they cannot be loaded from .rfa. So when a ticked mapping row names a
// floor type the document lacks, it is created exactly like GhostWallTypeProvisioner creates a wall type: a clone of the
// nearest sibling the installed type catalogue lists AND this document has (GhostTypeCreator.CreateFloorType), resized
// when the name carries a thickness. No such sibling is a reported gap naming the catalogue, never a clone of the first
// floor type (F43). Runs inside the caller's Transaction, BEFORE GhostPlacementEngine caches its types.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    public sealed class GhostFloorTypeProvisioner
    {
        private readonly Document _doc;
        private readonly GuidelineMatcher _guideline; // the catalogue in force; null = not loaded

        public GhostFloorTypeProvisioner(Document doc, GuidelineMatcher guideline)
        {
            _doc = doc;
            _guideline = guideline;
        }

        public sealed class ProvisionReport
        {
            public int Created;
            public int AlreadyPresent;
            /// <summary>Names not created — no catalogue sibling in this document, or a clone that failed (each in Warnings with its reason).</summary>
            public int Gaps;
            public readonly List<string> Warnings = new List<string>();
        }

        public ProvisionReport Provision(MappingResult mapping)
        {
            var report = new ProvisionReport();
            if (mapping?.Mappings == null) return report;

            var existing = new HashSet<string>(
                new FilteredElementCollector(_doc).OfClass(typeof(FloorType)).Cast<FloorType>().Select(f => f.Name),
                StringComparer.OrdinalIgnoreCase);

            var wanted = mapping.Mappings
                .Where(m => string.Equals(m.Category, "Floors", StringComparison.OrdinalIgnoreCase))
                .Select(m => m.BdsFamilyType ?? m.BdsFamily)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (string name in wanted)
            {
                if (existing.Contains(name)) { report.AlreadyPresent++; continue; }

                double mm = TypeNameParse.ThicknessMm(name);
                if (mm == double.MaxValue) mm = 0; // no thickness in the name: the sibling's own
                var siblings = _guideline?.CatalogSiblings("Floors", name) ?? new List<string>();
                if (GhostTypeCreator.CreateFloorType(_doc, name, mm, siblings, out string reason) != null)
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
