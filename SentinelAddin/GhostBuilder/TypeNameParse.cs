#nullable disable
// Pure parsers for the dimensions a BDS type name encodes — no Revit, so they're offline-testable, and
// GhostTypeCreator delegates to them. The office convention puts the size in the name (the audit
// confirmed the name's thickness matches the real Width on 32/32 conforming walls), so reading it back
// out is how a created type gets the right size and how the nearest sibling is chosen.
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public static class TypeNameParse
    {
        /// <summary>The trailing "&lt;n&gt; mm" a BDS type name encodes (BDS_EXT_ARC_CMU_200 mm → 200).
        /// double.MaxValue when the name carries no thickness, so "nearest by thickness" sorts it last.</summary>
        public static double ThicknessMm(string name)
        {
            var m = Regex.Match(name ?? "", @"(\d+(?:\.\d+)?)\s*mm\s*$", RegexOptions.IgnoreCase);
            return m.Success ? double.Parse(m.Groups[1].Value) : double.MaxValue;
        }

        /// <summary>Parse a "W x H mm" section (BDS_INT_STR_CONC_300 X 1500 mm → 300, 1500), in mm.
        /// False when the name has no W×H, so a caller can't create a column by section from it.</summary>
        public static bool TrySection(string name, out double widthMm, out double depthMm)
        {
            widthMm = depthMm = 0;
            var m = Regex.Match(name ?? "", @"(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*mm", RegexOptions.IgnoreCase);
            if (!m.Success) return false;
            widthMm = double.Parse(m.Groups[1].Value);
            depthMm = double.Parse(m.Groups[2].Value);
            return true;
        }
    }
}
