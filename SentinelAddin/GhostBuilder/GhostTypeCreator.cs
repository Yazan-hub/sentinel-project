#nullable disable
// Create a wall (or floor) TYPE the office template doesn't have yet, at a measured thickness.
//
// WHY. When the Office Modelling Guideline resolves a wall to a type that isn't in the model — a 275mm
// CMU wall when the template stocks 100/200/300/400 — the honest options were "skip" or "invent". The
// maintainer's call: neither. Duplicate the nearest sibling the office DID author and grow/shrink it to
// the exact thickness, so the new type inherits the office's real build-up (materials, finish layers,
// function) and differs only in the one dimension the drawing measured.
//
// This keeps the guarantee intact: a created type is still a real BDS build-up, named to the office's own
// convention, not a Revit default. It is the office's standard extended by one size, which is what a
// modeller would do by hand.
//
// System families only (walls, floors — CompoundStructure). Loadable families (doors, windows, columns)
// create a "type" by a different mechanism (duplicate + set the family's size parameters) and are a
// separate step; a gap there still reports rather than inventing.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    public static class GhostTypeCreator
    {
        private const double FeetToMm = 304.8;

        /// <summary>
        /// Create <paramref name="newName"/> at <paramref name="thicknessMm"/> by cloning the nearest of
        /// <paramref name="siblingNames"/> (the guideline's `Available` list — real types of the same
        /// family) and resizing its core layer. Returns the new type, or null with a reason if it can't be
        /// built — in which case the caller falls back to reporting the gap, never to an invented type.
        /// Caller owns the Transaction.
        /// </summary>
        public static WallType CreateWallType(
            Document doc, string newName, double thicknessMm, IEnumerable<string> siblingNames, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(newName) || thicknessMm <= 0)
            {
                reason = "no name or thickness to create from";
                return null;
            }

            var walls = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().ToList();

            // Already there (a prior element on this run created it) — reuse, never duplicate a name.
            var present = walls.FirstOrDefault(w => string.Equals(w.Name, newName, StringComparison.OrdinalIgnoreCase));
            if (present != null) return present;

            // Clone the NEAREST-thickness sibling so the new type inherits the closest real build-up.
            WallType baseType = NearestSibling(walls, siblingNames, thicknessMm)
                                ?? walls.FirstOrDefault(w => w.Kind == WallKind.Basic);
            if (baseType == null)
            {
                reason = "no Basic wall type to clone from";
                return null;
            }

            try
            {
                var dup = (WallType)baseType.Duplicate(newName);
                if (!SetCoreThickness(dup, thicknessMm / FeetToMm, out reason))
                {
                    doc.Delete(dup.Id); // don't leave a wrong-width type behind
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = ex.Message; return null; }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { reason = ex.Message; return null; }
        }

        /// <summary>
        /// Floors are system families too — same CompoundStructure mechanism as walls. A floor "gap" is
        /// rarer than a wall's: a plan carries no slab thickness (that's a section property), so the
        /// guideline names floor types explicitly and validateAgainstCatalog keeps them real. This exists
        /// for the blank-model case, and for when a named type does carry a thickness in its name.
        /// </summary>
        public static FloorType CreateFloorType(
            Document doc, string newName, double thicknessMm, IEnumerable<string> siblingNames, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(newName)) { reason = "no name to create"; return null; }

            var floors = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
            var present = floors.FirstOrDefault(f => string.Equals(f.Name, newName, StringComparison.OrdinalIgnoreCase));
            if (present != null) return present;

            // Clone the nearest-thickness sibling; else any floor type.
            FloorType baseType = NearestByName(floors, siblingNames, thicknessMm) ?? floors.FirstOrDefault();
            if (baseType == null) { reason = "no floor type to clone from"; return null; }

            try
            {
                var dup = (FloorType)baseType.Duplicate(newName);
                // Only resize when we actually have a target thickness (from the name or a measurement).
                if (thicknessMm > 0 && !SetCoreThickness(dup, thicknessMm / FeetToMm, out reason))
                {
                    doc.Delete(dup.Id);
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = ex.Message; return null; }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { reason = ex.Message; return null; }
        }

        /// <summary>
        /// Columns are LOADABLE families, so a new "type" is a duplicated FamilySymbol with its section
        /// dimensions set — not a compound structure. A column IS measurable from its drawn rectangle
        /// (unlike a floor), so width×depth can come from the drawing. Requires the family to already be
        /// in the model (loaded); a gap on an absent family still reports rather than inventing.
        /// </summary>
        public static FamilySymbol CreateColumnType(
            Document doc, string newName, double widthMm, double depthMm, IEnumerable<string> siblingNames, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(newName) || widthMm <= 0 || depthMm <= 0)
            {
                reason = "no name or section size to create from";
                return null;
            }

            var cols = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_StructuralColumns).OfClass(typeof(FamilySymbol))
                .Cast<FamilySymbol>().ToList();
            var present = cols.FirstOrDefault(s => string.Equals(s.Name, newName, StringComparison.OrdinalIgnoreCase));
            if (present != null) return present;

            // Prefer duplicating a sibling type of the SAME family named in the guideline; else any column.
            var names = new HashSet<string>(siblingNames ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            FamilySymbol baseSym = cols.FirstOrDefault(s => names.Contains(s.Name)) ?? cols.FirstOrDefault();
            if (baseSym == null) { reason = "no structural column family loaded to duplicate"; return null; }

            try
            {
                var dup = (FamilySymbol)baseSym.Duplicate(newName);
                bool w = SetDimension(dup, widthMm / FeetToMm, "b", "Width", "Depth-Width");
                bool d = SetDimension(dup, depthMm / FeetToMm, "h", "Depth", "Height");
                if (!w || !d)
                {
                    doc.Delete(dup.Id);
                    reason = "the column family exposes no editable width/depth parameter to set";
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = ex.Message; return null; }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { reason = ex.Message; return null; }
        }

        // Set the first writable dimension parameter found among the given names. Column families disagree
        // on naming (b/h vs Width/Depth), so try each; return false only if NONE took.
        private static bool SetDimension(FamilySymbol sym, double valueFt, params string[] names)
        {
            foreach (string n in names)
            {
                Parameter p = sym.LookupParameter(n);
                if (p != null && !p.IsReadOnly && p.StorageType == StorageType.Double)
                {
                    try { p.Set(valueFt); return true; }
                    catch (Autodesk.Revit.Exceptions.ArgumentException) { /* wrong param — keep trying */ }
                }
            }
            return false;
        }

        // FloorType/WallType both inherit HostObjAttributes; the nearest-sibling logic is identical.
        private static FloorType NearestByName(List<FloorType> types, IEnumerable<string> siblingNames, double targetMm)
        {
            var names = new HashSet<string>(siblingNames ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            var cand = types.Where(t => names.Contains(t.Name)).ToList();
            if (cand.Count == 0) return null;
            return cand.OrderBy(t => Math.Abs(ThicknessFromName(t.Name) - targetMm)).First();
        }

        /// <summary>The sibling whose own thickness is closest to the target — best build-up to inherit.</summary>
        private static WallType NearestSibling(List<WallType> walls, IEnumerable<string> siblingNames, double targetMm)
        {
            var names = new HashSet<string>(siblingNames ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            var candidates = walls.Where(w => names.Contains(w.Name)).ToList();
            if (candidates.Count == 0) return null;
            return candidates.OrderBy(w => Math.Abs(ThicknessFromName(w.Name) - targetMm)).First();
        }

        // The trailing "<n> mm" in a BDS type name — the office convention encodes thickness there, and
        // the audit confirmed it matches the real Width on every conforming type.
        // (thickness parsing moved to the pure TypeNameParse; kept as a thin alias for callers)
        private static double ThicknessFromName(string name) => TypeNameParse.ThicknessMm(name);

        /// <summary>
        /// Resize a system-family type (wall OR floor — both inherit HostObjAttributes) to a total
        /// thickness by adjusting its CORE (widest) layer, so finish layers are preserved and only the
        /// structural thickness changes — exactly how a modeller edits a build-up. A single-layer type
        /// just becomes the target thickness.
        /// </summary>
        private static bool SetCoreThickness(HostObjAttributes ht, double targetFt, out string reason)
        {
            reason = null;
            CompoundStructure cs = ht.GetCompoundStructure();
            if (cs == null)
            {
                reason = "type has no compound structure to resize";
                return false;
            }

            IList<CompoundStructureLayer> layers = cs.GetLayers();
            if (layers.Count == 0) { reason = "type has no layers"; return false; }

            double currentFt = cs.GetWidth();
            // Widest layer = the structural core (membranes have width 0 and can't be resized anyway).
            int core = 0; double maxW = -1;
            for (int i = 0; i < layers.Count; i++)
                if (layers[i].Width > maxW) { maxW = layers[i].Width; core = i; }

            double newCoreFt = layers[core].Width + (targetFt - currentFt);
            if (newCoreFt <= 0) newCoreFt = targetFt; // delta would zero the core → make it a single target-width layer

            try
            {
                cs.SetLayerWidth(core, newCoreFt);
                ht.SetCompoundStructure(cs);
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = "could not set core width: " + ex.Message; return false; }

            // Confirm we actually hit the target (Revit rounds/validates) — within 0.5 mm.
            double achievedMm = ht.GetCompoundStructure().GetWidth() * FeetToMm;
            if (Math.Abs(achievedMm - targetFt * FeetToMm) > 0.5)
            {
                reason = $"resize landed at {achievedMm:0} mm, not {targetFt * FeetToMm:0} mm";
                return false;
            }
            return true;
        }

        // ---- pure size parsing (offline-testable; the Revit calls above are not) ----

        public static bool TryParseSection(string typeName, out double widthMm, out double depthMm)
            => TypeNameParse.TrySection(typeName, out widthMm, out depthMm);
    }
}
