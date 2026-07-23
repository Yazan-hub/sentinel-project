#nullable disable
// Read the model's DATUM — levels and grids — from the drawings, deterministically. A proper as-built
// modelling workflow builds the datum FIRST (levels from the sections/elevations, grids from the plan),
// then hosts every element to it. GhostBuilder used to skip this: walls got a default 10ft height and no
// grids. This is the missing foundation — real floor-to-floor heights and a real column grid, read from
// geometry the office already draws to its layer standard.
//
// PURE 2D — no Revit — so it's offline-testable; DatumBuilder (Revit) creates the Levels/Grids this finds.
// The heights come from LINE POSITIONS, not text: a BDS section is drawn to real mm scale, so a level
// line's Y-coordinate IS its elevation and a grid line's position IS the grid location. That sidesteps the
// unreliable business of reading imported-DWG text; names are auto-generated here and corrected in review.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    public sealed class DetectedLevel
    {
        public string Name;         // auto: "Level 0" (ground) … reviewable
        public double ElevationMm;  // the level line's height in the section, mm
    }

    public sealed class DetectedGrid
    {
        public string Name;         // auto: "1","2"… for vertical, "A","B"… for horizontal
        public double X1, Y1, X2, Y2;
        public bool Vertical;       // runs up the page (constant X) → numbered; else lettered
    }

    public static class DatumFromDrawing
    {
        /// <summary>
        /// Levels from the horizontal lines on a section's levels layer. Each distinct height (the line's Y,
        /// in mm) becomes a level; near-coincident lines merge (double-drawn datums). Sorted ground-up and
        /// named Level 0, 1, 2… — the reviewer renames to the office's own (Ground, L1, Roof).
        /// </summary>
        /// <param name="mergeTolMm">Heights within this are the same level (default 50 mm).</param>
        public static List<DetectedLevel> Levels(IEnumerable<Seg> sectionLines, double mergeTolMm = 50.0)
        {
            // Only near-horizontal lines are level datums; a section is full of vertical/diagonal linework.
            var ys = (sectionLines ?? Enumerable.Empty<Seg>())
                .Where(s => s.Length > 1e-6 && Math.Abs(s.Y2 - s.Y1) < Math.Abs(s.X2 - s.X1) * 0.02) // ~horizontal
                .Select(s => (s.Y1 + s.Y2) * 0.5)
                .OrderBy(y => y)
                .ToList();

            var merged = new List<double>();
            foreach (double y in ys)
                if (merged.Count == 0 || Math.Abs(y - merged[merged.Count - 1]) > mergeTolMm)
                    merged.Add(y);

            if (merged.Count == 0) return new List<DetectedLevel>();

            // Ground = the lowest level = 0; others measured up from it, so the model's datum is sensible
            // regardless of where the section happened to sit in the DWG.
            double ground = merged[0];
            return merged.Select((y, i) => new DetectedLevel
            {
                Name = i == 0 ? "Level 0" : "Level " + i,
                ElevationMm = Math.Round(y - ground, 1),
            }).ToList();
        }

        /// <summary>
        /// Grids from the lines on a plan's grid layer. Long lines are split into VERTICAL (constant X →
        /// numbered 1,2,3 left→right) and HORIZONTAL (constant Y → lettered A,B,C bottom→top), the standard
        /// convention. Near-parallel duplicates on the same axis-position merge. Reviewer can relabel.
        /// </summary>
        public static List<DetectedGrid> Grids(IEnumerable<Seg> planLines, double mergeTolMm = 100.0)
        {
            var lines = (planLines ?? Enumerable.Empty<Seg>()).Where(s => s.Length > 1e-6).ToList();

            var vertical = Dedupe(lines.Where(IsVertical).OrderBy(s => (s.X1 + s.X2) * 0.5),
                                  s => (s.X1 + s.X2) * 0.5, mergeTolMm);
            var horizontal = Dedupe(lines.Where(IsHorizontal).OrderBy(s => (s.Y1 + s.Y2) * 0.5),
                                    s => (s.Y1 + s.Y2) * 0.5, mergeTolMm);

            var grids = new List<DetectedGrid>();
            for (int i = 0; i < vertical.Count; i++)
                grids.Add(New(vertical[i], (i + 1).ToString(), true));       // 1, 2, 3…
            for (int i = 0; i < horizontal.Count; i++)
                grids.Add(New(horizontal[i], Letter(i), false));             // A, B, C…
            return grids;
        }

        private static bool IsVertical(Seg s)   => Math.Abs(s.X2 - s.X1) < Math.Abs(s.Y2 - s.Y1) * 0.02;
        private static bool IsHorizontal(Seg s) => Math.Abs(s.Y2 - s.Y1) < Math.Abs(s.X2 - s.X1) * 0.02;

        // Keep the LONGEST line at each axis-position (grid lines are long; a duplicate tick is short).
        private static List<Seg> Dedupe(IEnumerable<Seg> ordered, Func<Seg, double> axis, double tol)
        {
            var outp = new List<Seg>();
            foreach (var s in ordered)
            {
                if (outp.Count > 0 && Math.Abs(axis(s) - axis(outp[outp.Count - 1])) <= tol)
                {
                    if (s.Length > outp[outp.Count - 1].Length) outp[outp.Count - 1] = s; // prefer the longer
                    continue;
                }
                outp.Add(s);
            }
            return outp;
        }

        private static DetectedGrid New(Seg s, string name, bool vertical) => new DetectedGrid
        { Name = name, X1 = s.X1, Y1 = s.Y1, X2 = s.X2, Y2 = s.Y2, Vertical = vertical };

        // A, B, … Z, AA, AB … — spreadsheet-column style, so a big grid never runs out of names.
        private static string Letter(int i)
        {
            string s = "";
            for (int n = i; ; n = n / 26 - 1)
            {
                s = (char)('A' + n % 26) + s;
                if (n < 26) break;
            }
            return s;
        }
    }
}
