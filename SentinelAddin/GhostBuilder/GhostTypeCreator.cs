#nullable disable
// Create a wall (or floor) TYPE the office template doesn't have yet, at a measured thickness.
//
// WHY. When the Office Modelling Guideline resolves a wall to a type that isn't in the model — a 275mm
// CMU wall when the template stocks 100/200/300/400 — the honest options were "skip" or "invent". The
// maintainer's call: neither. Duplicate the nearest sibling the office DID author and grow/shrink it to
// the exact thickness, so the new type inherits the office's real build-up (materials, finish layers,
// function) and differs only in the one dimension the drawing measured.
//
// This keeps the guarantee intact: a created type is still a real build-up — a sibling the type catalogue lists
// AND this document has — named to the office's own convention, never a Revit default and never a clone of an
// unrelated wall (F43: another office's type names were cloned onto the first Basic wall). No such sibling → no
// type; the caller reports the gap. It is the office's standard extended by one size, which is what a modeller
// would do by hand.
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
        /// <paramref name="siblingNames"/> (the guideline's `Available` list or the catalogue's siblings — real
        /// types of the same family) and resizing its core layer; a thickness of 0 (the name carries none) keeps
        /// the sibling's own. Returns the new type, or null with a reason if it can't be built — in which case the
        /// caller reports the gap, never an invented type. Caller owns the Transaction.
        /// </summary>
        public static WallType CreateWallType(
            Document doc, string newName, double thicknessMm, IEnumerable<string> siblingNames, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(newName)) { reason = "no name to create"; return null; }

            var walls = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().ToList();

            // Already there (a prior element on this run created it) — reuse, never duplicate a name.
            var present = walls.FirstOrDefault(w => string.Equals(w.Name, newName, StringComparison.OrdinalIgnoreCase));
            if (present != null) return present;

            // Clone the NEAREST-thickness sibling so the new type inherits the closest real build-up. Only a sibling
            // the catalogue lists and this document has: any other Basic wall under the guideline's name would be one
            // office's type name on another's build-up (F43), so no sibling is a reported gap, never a guess.
            WallType baseType = Nearest(walls, siblingNames, thicknessMm);
            if (baseType == null)
            {
                reason = "no sibling type in this document";
                return null;
            }

            WallType dup = null;
            try
            {
                dup = (WallType)baseType.Duplicate(newName);
                if (thicknessMm > 0 && !SetCoreThickness(dup, thicknessMm / FeetToMm, out reason))
                {
                    Discard(doc, dup); // don't leave a wrong-width type behind
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { reason = ex.Message; Discard(doc, dup); return null; }
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

            var floors = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().Where(f => !f.IsFoundationSlab).ToList();
            var present = floors.FirstOrDefault(f => string.Equals(f.Name, newName, StringComparison.OrdinalIgnoreCase));
            if (present != null) return present;

            // Only a sibling the catalogue lists and this document has — any other floor type under the wanted name
            // would be one office's name on another's build-up (F43); no sibling is a reported gap, never a guess.
            FloorType baseType = Nearest(floors, siblingNames, thicknessMm);
            if (baseType == null) { reason = "no sibling type in this document"; return null; }

            FloorType dup = null;
            try
            {
                dup = (FloorType)baseType.Duplicate(newName);
                // Only resize when we actually have a target thickness (from the name or a measurement).
                if (thicknessMm > 0 && !SetCoreThickness(dup, thicknessMm / FeetToMm, out reason))
                {
                    Discard(doc, dup);
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { reason = ex.Message; Discard(doc, dup); return null; }
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

            FamilySymbol dup = null;
            try
            {
                dup = (FamilySymbol)baseSym.Duplicate(newName);
                bool w = SetDimension(dup, widthMm / FeetToMm, "b", "Width", "Depth-Width");
                bool d = SetDimension(dup, depthMm / FeetToMm, "h", "Depth", "Height");
                if (!w || !d)
                {
                    Discard(doc, dup);
                    reason = "the column family exposes no editable width/depth parameter to set";
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { reason = ex.Message; Discard(doc, dup); return null; }
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

        /// <summary>The sibling this document holds whose own thickness is closest to the target — the best build-up
        /// to inherit. The choice is GuidelineMatcher.NearestSiblingInDocument (pure, harness-checked); this only finds
        /// the element it named. FloorType/WallType both inherit HostObjAttributes, so one helper serves both.</summary>
        private static T Nearest<T>(List<T> types, IEnumerable<string> siblingNames, double targetMm) where T : ElementType
        {
            string pick = GuidelineMatcher.NearestSiblingInDocument(siblingNames, types.Select(t => t.Name), targetMm);
            return pick == null ? null : types.First(t => string.Equals(t.Name, pick, StringComparison.OrdinalIgnoreCase));
        }

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

        // A clone that could not be finished is removed, whatever threw — the caller reports the gap, and the document
        // is never left holding a type under the standard's name with the wrong build-up or size.
        private static void Discard(Document doc, ElementType dup)
        {
            if (dup == null) return;
            try { doc.Delete(dup.Id); }
            catch (Autodesk.Revit.Exceptions.ApplicationException) { /* already gone, or the transaction is failing anyway */ }
        }

        // ---- pure size parsing (offline-testable; the Revit calls above are not) ----

        public static bool TryParseSection(string typeName, out double widthMm, out double depthMm)
            => TypeNameParse.TrySection(typeName, out widthMm, out depthMm);
    }
}
