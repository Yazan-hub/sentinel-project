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
                if (!SetTotalWidth(dup, thicknessMm / FeetToMm, out reason))
                {
                    doc.Delete(dup.Id); // don't leave a wrong-width type behind
                    return null;
                }
                return dup;
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = ex.Message; return null; }
            catch (Autodesk.Revit.Exceptions.InvalidOperationException ex) { reason = ex.Message; return null; }
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
        private static double ThicknessFromName(string name)
        {
            var m = Regex.Match(name ?? "", @"(\d+)\s*mm\s*$", RegexOptions.IgnoreCase);
            return m.Success ? double.Parse(m.Groups[1].Value) : double.MaxValue;
        }

        /// <summary>
        /// Resize a wall type to a total width by adjusting its CORE (widest) layer, so finish layers are
        /// preserved and only the structural thickness changes — exactly how a modeller edits a build-up.
        /// A single-layer wall just becomes the target width.
        /// </summary>
        private static bool SetTotalWidth(WallType wt, double targetFt, out string reason)
        {
            reason = null;
            CompoundStructure cs = wt.GetCompoundStructure();
            if (cs == null)
            {
                reason = "wall type has no compound structure to resize";
                return false;
            }

            IList<CompoundStructureLayer> layers = cs.GetLayers();
            if (layers.Count == 0) { reason = "wall type has no layers"; return false; }

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
                wt.SetCompoundStructure(cs);
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException ex) { reason = "could not set core width: " + ex.Message; return false; }

            // Confirm we actually hit the target (Revit rounds/validates) — within 0.5 mm.
            double achievedMm = wt.GetCompoundStructure().GetWidth() * FeetToMm;
            if (Math.Abs(achievedMm - targetFt * FeetToMm) > 0.5)
            {
                reason = $"resize landed at {achievedMm:0} mm, not {targetFt * FeetToMm:0} mm";
                return false;
            }
            return true;
        }
    }
}
