using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace BadranDesignStudio.Sentinel
{
    /// <summary>
    /// Wall types are SYSTEM families — they cannot be loaded from .rfa like component families.
    /// So when the LLM maps a "Walls" layer to a wall type the doc doesn't have, we duplicate an
    /// existing base wall type and rename it to the wanted name. Must run inside a Transaction on
    /// the API thread, BEFORE GhostPlacementEngine is constructed (the engine caches wall types in
    /// its ctor, so new types must exist first).
    /// </summary>
    public sealed class GhostWallTypeProvisioner
    {
        private readonly Document _doc;

        public GhostWallTypeProvisioner(Document doc) => _doc = doc;

        public sealed class ProvisionReport
        {
            public int Created;
            public int AlreadyPresent;
            public readonly List<string> Warnings = new List<string>();
        }

        /// <summary>
        /// Duplicates a base wall type for each missing "Walls" mapping. Caller owns the Transaction.
        /// The new type is a geometric clone of the base (same width/layers) under the mapped name —
        /// good enough for LOD 200 massing; real assemblies get authored later.
        /// </summary>
        public ProvisionReport Provision(MappingResult mapping)
        {
            var report = new ProvisionReport();
            if (mapping?.Mappings == null) return report;

            var existing = new HashSet<string>(
                new FilteredElementCollector(_doc).OfClass(typeof(WallType))
                    .Cast<WallType>().Select(w => w.Name),
                StringComparer.OrdinalIgnoreCase);

            // A basic (non-curtain, non-stacked) wall type to clone from.
            WallType baseType = new FilteredElementCollector(_doc)
                .OfClass(typeof(WallType)).Cast<WallType>()
                .FirstOrDefault(w => w.Kind == WallKind.Basic);

            if (baseType == null)
            {
                report.Warnings.Add("No Basic WallType in document to duplicate from; wall provisioning skipped.");
                return report;
            }

            // Distinct wall-type names the mapping needs (prefer bdsFamilyType, fall back to bdsFamily).
            var wanted = mapping.Mappings
                .Where(m => string.Equals(m.Category, "Walls", StringComparison.OrdinalIgnoreCase))
                .Select(m => m.BdsFamilyType ?? m.BdsFamily)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (string name in wanted)
            {
                if (existing.Contains(name)) { report.AlreadyPresent++; continue; }

                try
                {
                    // Duplicate returns the new ElementType; throws if the name is already taken
                    // (guarded above) or invalid.
                    var created = baseType.Duplicate(name) as WallType;
                    if (created != null)
                    {
                        report.Created++;
                        existing.Add(name); // don't re-create if two mappings share a name
                    }
                    else
                    {
                        report.Warnings.Add($"Duplicate returned non-WallType for '{name}'; skipped.");
                    }
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not create wall type '{name}': {ex.Message}");
                }
            }

            return report;
        }
    }
}
