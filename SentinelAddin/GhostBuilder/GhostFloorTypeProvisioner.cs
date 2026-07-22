#nullable disable
// Floor types are SYSTEM families (like walls) — they cannot be loaded from .rfa. So when a mapping names a
// floor type the doc lacks, duplicate a base FloorType and rename it, exactly like GhostWallTypeProvisioner.
// Runs inside the caller's Transaction, BEFORE GhostPlacementEngine caches its types.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    public sealed class GhostFloorTypeProvisioner
    {
        private readonly Document _doc;
        public GhostFloorTypeProvisioner(Document doc) => _doc = doc;

        public sealed class ProvisionReport
        {
            public int Created;
            public int AlreadyPresent;
            public readonly List<string> Warnings = new List<string>();
        }

        public ProvisionReport Provision(MappingResult mapping)
        {
            var report = new ProvisionReport();
            if (mapping?.Mappings == null) return report;

            var existing = new HashSet<string>(
                new FilteredElementCollector(_doc).OfClass(typeof(FloorType)).Cast<FloorType>().Select(f => f.Name),
                StringComparer.OrdinalIgnoreCase);

            FloorType baseType = new FilteredElementCollector(_doc)
                .OfClass(typeof(FloorType)).Cast<FloorType>().FirstOrDefault();

            if (baseType == null)
            {
                report.Warnings.Add("No FloorType in document to duplicate from; floor provisioning skipped.");
                return report;
            }

            var wanted = mapping.Mappings
                .Where(m => string.Equals(m.Category, "Floors", StringComparison.OrdinalIgnoreCase))
                .Select(m => m.BdsFamilyType ?? m.BdsFamily)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (string name in wanted)
            {
                if (existing.Contains(name)) { report.AlreadyPresent++; continue; }

                try
                {
                    if (baseType.Duplicate(name) is FloorType)
                    {
                        report.Created++;
                        existing.Add(name); // don't re-create if two mappings share a name
                    }
                    else
                    {
                        report.Warnings.Add($"Duplicate returned non-FloorType for '{name}'; skipped.");
                    }
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not create floor type '{name}': {ex.Message}");
                }
            }

            return report;
        }
    }
}
