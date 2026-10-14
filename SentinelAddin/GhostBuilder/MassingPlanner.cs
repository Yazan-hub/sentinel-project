#nullable disable
// C# port of sentinel-core/massing.ts — the estimate validator; massing.test.ts is its CONFORMANCE REFERENCE, the same relationship
// GuidelineMatcher has to guideline.ts. Pure — no Revit — so it's offline-testable (tools/massing-check).
//
// MA-6-6 (MAS-2 + MAS-1): a photo estimate is WHAT the building is; Changeset makes it one reviewed changeset — the Building Story
// levels the massing needs that the model lacks, and one untyped mass between them (a DirectShape in Mass at Apply). Its walls,
// floors and roof come from Shell a Mass (MA-6-4), one storey per level; the old wall, floor and opening placement path is gone (R12).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    // ---- estimate ------------------------------------------------------------------------------------
    public sealed class EstimatedValue
    {
        public double Value;
        public double Confidence;
        public string Source = "photo"; // "photo" | "assumed" | "user" | "inferred" (MA-6-9: worked out from a known dimension)
        public string Note;
        // MA-6-9 (C#-only: massing.ts and its cases are unchanged, R12): the spread across the photos — Views of Of photos gave a value in Lo..Hi.
        public double? Lo, Hi;
        public int Views, Of;
    }

    /// <summary>MA-6-9 (C14): what the vision model read from ONE photo — counts and a ratio, never a length.</summary>
    public sealed class ViewReading
    {
        public string Photo;
        public int Storeys;
        public bool FullHeight;
        public double HeightToWidth;
        public int Bays;
        public string View = "unknown";
        public string Error; // a view the model could not read is a row with its reason, never a stop
    }

    public sealed class OpeningEstimate
    {
        public string Kind = "door";    // "door" | "window"
        public EstimatedValue WidthMm = new EstimatedValue();
        public EstimatedValue HeightMm = new EstimatedValue();
        public string Facade = "front";
    }

    public sealed class MassingEstimate
    {
        public EstimatedValue FootprintWidthMm = new EstimatedValue();
        public EstimatedValue FootprintDepthMm = new EstimatedValue();
        public EstimatedValue Storeys = new EstimatedValue();
        public EstimatedValue StoreyHeightMm = new EstimatedValue();
        public List<OpeningEstimate> Openings = new List<OpeningEstimate>();
        public List<string> FacadesSeen = new List<string>();
        public string Notes;
        public string Provenance = "photo";
        // MA-6-9: the photos' height : width ratio (null when nothing read one), the one dimension a person gave
        // (KnownField "height" | "width", KnownMm) and one line per photo read. C#-only, like Lo/Hi.
        public EstimatedValue HeightToWidth;
        public string KnownField;
        public double KnownMm;
        public List<string> ViewLines = new List<string>();
        // MA-6-10 (C#-only): the turn the reviewer gave (degrees, counter-clockwise) and the footprint picked in Revit, if any.
        public double RotationDeg;
        public Footprint Footprint;
    }

    /// <summary>MA-6-10 (MAS-3): where the mass stands. Loop = a picked outline in model mm (null: the photos' W x D rectangle), At = where its
    /// centre goes (null: where it lies / the origin), From = the pick in words.</summary>
    public sealed class Footprint
    {
        public List<double[]> Loop;
        public double[] At;
        public string From;
    }

    public static class MassingPlanner
    {
        public const double AssumedBelow = 0.35;

        // LOD-100 sanity bounds (mm) — mirror massing.ts BOUNDS exactly.
        private static readonly (double lo, double hi) FootprintW = (2000, 500000);
        private static readonly (double lo, double hi) FootprintD = (2000, 500000);
        private static readonly (double lo, double hi) Storeys = (1, 200);
        private static readonly (double lo, double hi) StoreyH = (2100, 8000);
        private static readonly (double lo, double hi) OpeningW = (300, 20000);
        private static readonly (double lo, double hi) OpeningH = (300, 12000);

        /// <summary>Clamp to plausibility and demote low-confidence/out-of-range fields to `assumed`.
        /// Mirrors validateMassing — never throws; a garbage estimate becomes an all-assumed one.</summary>
        public static MassingEstimate Validate(MassingEstimate raw)
        {
            raw = raw ?? new MassingEstimate();
            var seen = (raw.FacadesSeen ?? new List<string>()).Select(s => (s ?? "").ToLowerInvariant()).ToList();

            var openings = new List<OpeningEstimate>();
            foreach (var o in raw.Openings ?? new List<OpeningEstimate>())
            {
                string facade = (o?.Facade ?? "front").ToLowerInvariant();
                var w = Clamp(o?.WidthMm ?? Assumed(OpeningW.lo), OpeningW);
                var h = Clamp(o?.HeightMm ?? Assumed(OpeningH.lo), OpeningH);
                if (!seen.Contains(facade))
                {
                    w.Source = h.Source = "assumed";
                    w.Note = h.Note = $"on the '{facade}' façade, which the photo did not show";
                }
                openings.Add(new OpeningEstimate
                {
                    Kind = o?.Kind == "window" ? "window" : "door",
                    WidthMm = w, HeightMm = h, Facade = facade,
                });
            }

            return new MassingEstimate
            {
                FootprintWidthMm = Clamp(raw.FootprintWidthMm ?? Assumed(FootprintW.lo), FootprintW),
                FootprintDepthMm = Clamp(raw.FootprintDepthMm ?? Assumed(FootprintD.lo), FootprintD),
                Storeys = Clamp(raw.Storeys ?? Assumed(1), Storeys, unit: ""),
                StoreyHeightMm = Clamp(raw.StoreyHeightMm ?? Assumed(3000), StoreyH),
                Openings = openings,
                FacadesSeen = seen,
                Notes = raw.Notes,
                Provenance = "photo",
                // MA-6-9 (amendment 14): the fields Validate does not judge ride through unchanged.
                HeightToWidth = raw.HeightToWidth == null ? null : Copy(raw.HeightToWidth),
                KnownField = raw.KnownField, KnownMm = raw.KnownMm,
                ViewLines = new List<string>(raw.ViewLines ?? new List<string>()),
                RotationDeg = raw.RotationDeg, Footprint = raw.Footprint, // MA-6-10 (amendment 14)
            };
        }

        private static EstimatedValue Copy(EstimatedValue v) =>
            new EstimatedValue { Value = v.Value, Confidence = v.Confidence, Source = v.Source, Note = v.Note, Lo = v.Lo, Hi = v.Hi, Views = v.Views, Of = v.Of };

        private static EstimatedValue Assumed(double value, string note = null) =>
            new EstimatedValue { Value = value, Confidence = 0, Source = "assumed", Note = note };

        private static EstimatedValue Clamp(EstimatedValue v, (double lo, double hi) b, string unit = " mm")
        {
            var o = Copy(v);
            if (double.IsNaN(o.Value) || double.IsInfinity(o.Value))
                return new EstimatedValue { Value = b.lo, Confidence = 0, Source = "assumed", Note = "no usable value — assumed" };
            if (o.Value < b.lo) { o.Value = b.lo; o.Note = $"raised to the {b.lo}{unit} minimum"; o.Source = "assumed"; o.Confidence = Math.Min(o.Confidence, 0.3); }
            if (o.Value > b.hi) { o.Value = b.hi; o.Note = $"capped at the {b.hi}{unit} maximum"; o.Source = "assumed"; o.Confidence = Math.Min(o.Confidence, 0.3); }
            if (o.Source == "photo" && o.Confidence <= AssumedBelow)
            {
                o.Source = "assumed";
                o.Note = o.Note ?? "low confidence — treat as an assumption to confirm";
            }
            return o;
        }

        /// <summary>Final review, MA-1a item 4 (E7): does the estimate still hold a number the vision model gave (source "photo")?
        /// When Ollama is down, answers badly, or the reviewer replaced every number, it holds none: the build then came from
        /// the review alone, and its stamp must not name the images as its source.</summary>
        public static bool HasModelValue(MassingEstimate m) =>
            m != null && new[] { m.FootprintWidthMm, m.FootprintDepthMm, m.Storeys, m.StoreyHeightMm, m.HeightToWidth }
                .Concat((m.Openings ?? new List<OpeningEstimate>()).Where(o => o != null).SelectMany(o => new[] { o.WidthMm, o.HeightMm }))
                .Any(v => v != null && v.Source == "photo"); // MA-6-9: an inferred number is worked out from Storeys / HeightToWidth (listed here) and the typed dimension — it adds no image of its own

        /// <summary>MAS-4: the review's status line when a filing ended with nothing filed — the reason is in the dialog just shown.</summary>
        public const string ReopenStatus = "Nothing was filed — the reason is in the message just shown. Your numbers are kept: put it right, then File for review again.";

        /// <summary>MAS-4 (review amendment C12): the review's status line when the filing could not start — the request threw, Revit did
        /// not take it, or (MA-6-6) a check before filing refused it. The window is reopened where the failure is seen.</summary>
        public static string NotStarted(string why) => $"The filing did not start ({why}). Your numbers are kept: put it right, then File for review again.";

        private const string KnownWanted = "type one known dimension — the building's height or a façade's width; the photos give counts and ratios only";
        /// <summary>MA-6-9: the review's words when File for review is pressed before a known dimension is given.</summary>
        public const string NeedsKnown = KnownWanted;

        private static double Median(List<double> xs)
        {
            xs.Sort();
            int n = xs.Count;
            return n % 2 == 1 ? xs[n / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
        }

        // The spread of the values a photo set gave: the median, its range, how many gave one, and the share near the median.
        private static EstimatedValue Spread(List<double> xs, int photos, Func<double, double, bool> near)
        {
            double med = Median(new List<double>(xs));
            return new EstimatedValue
            {
                Value = med, Source = "photo", Lo = xs.Min(), Hi = xs.Max(), Views = xs.Count, Of = photos,
                Confidence = xs.Count(x => near(x, med)) / (double)xs.Count,
            };
        }

        /// <summary>MA-6-9 (C14): the photos' readings as ONE estimate. Storeys = the median count of the full-height views (else of all
        /// counts), its range, confidence = the share within ±2; HeightToWidth likewise over the front, side and corner ratios above zero (full-height views first; share within ±15 %).
        /// A count's confidence is how far the photos AGREE, not how right it is: the review always asks a person to confirm it. Width, depth and storey height stay assumed until a person gives one known dimension (Scale). Not
        /// validated: a count of 300 must reach ScaleRefusal, not be capped to 200 first.</summary>
        public static MassingEstimate FromViews(IReadOnlyList<ViewReading> views)
        {
            var vs = (views ?? new List<ViewReading>()).Where(v => v != null).ToList();
            var counted = vs.Where(v => v.Error == null && v.Storeys > 0).ToList();
            var use = counted.Where(v => v.FullHeight).ToList();
            if (use.Count == 0) use = counted;
            var m = new MassingEstimate
            {
                FootprintWidthMm = Assumed(FootprintW.lo, KnownWanted),
                FootprintDepthMm = Assumed(FootprintD.lo, KnownWanted),
                Storeys = Assumed(double.NaN, "no photo gave a storey count"), // blank, so any typed count (even 1) is the reviewer's
                StoreyHeightMm = Assumed(3000, KnownWanted),
                HeightToWidth = Assumed(double.NaN, "no photo gave a usable height : width ratio"),
                FacadesSeen = vs.Where(v => v.Error == null && v.View != "unknown" && v.View != "aerial").Select(v => v.View).Distinct().ToList(),
            };
            if (use.Count > 0)
            {
                m.Storeys = Spread(use.Select(v => (double)v.Storeys).ToList(), vs.Count, (x, med) => Math.Abs(x - med) <= 2);
                m.Storeys.Value = Math.Round(m.Storeys.Value, MidpointRounding.AwayFromZero);
            }
            var seenRatio = vs.Where(v => v.Error == null && v.HeightToWidth > 0 && !double.IsInfinity(v.HeightToWidth) && (v.View == "front" || v.View == "side" || v.View == "corner")).ToList();
            // The ratio is the VISIBLE height over the width: a cropped view reads low, so full-height views come first (as for the count).
            var ratios = (seenRatio.Any(v => v.FullHeight) ? seenRatio.Where(v => v.FullHeight) : seenRatio).Select(v => v.HeightToWidth).ToList();
            if (ratios.Count > 0) m.HeightToWidth = Spread(ratios, vs.Count, (x, med) => Math.Abs(x - med) <= 0.15 * med);
            m.ViewLines = vs.Select(ViewLine).ToList();
            m.Notes = m.ViewLines.Count == 0 ? null : string.Join("\n", m.ViewLines);
            return m;
        }

        private static string ViewLine(ViewReading v) => v.Error != null
            ? $"{v.Photo}: not read — {v.Error}"
            : $"{v.Photo}: {v.Storeys} storeys{(v.FullHeight ? "" : " (not full height)")}, height : width {v.HeightToWidth.ToString("0.##", CultureInfo.InvariantCulture)}, {v.Bays} bays, {v.View}";

        /// <summary>MA-6-9: the known dimension in words for the receipt, or null when none was given.</summary>
        public static string KnownWords(MassingEstimate m) => m?.KnownField == null ? null : $"{m.KnownField} {Mm(m.KnownMm)} mm, given";

        private const string NoRatioWidth = "no height : width ratio was read — type the footprint width";

        private static bool Usable(EstimatedValue r) => r != null && r.Value > 0 && !double.IsInfinity(r.Value);

        /// <summary>MA-6-9: exactly ONE known dimension (mm) turns the photos' counts and ratio into lengths. From the height H: the storey
        /// height H ÷ storeys and the width H ÷ ratio are inferred (Lo/Hi from the count's and the ratio's spread). From the width W: H = W ×
        /// ratio. Depth = width, assumed — the photos did not show it. Mutates m's values in place (the review's boxes are keyed by them).
        /// Returns null, or why nothing was changed.</summary>
        public static string Scale(MassingEstimate m, double? heightMm, double? widthMm)
        {
            if (heightMm.HasValue == widthMm.HasValue) return "give exactly one known dimension — the building's height or a façade's width";
            bool picked = m.Footprint?.Loop != null; // MA-6-10: the outline is the footprint - only the height is worked out
            if (picked && widthMm.HasValue) return "the footprint is picked — give the building's height instead";
            double known = heightMm ?? widthMm.Value;
            if (!(known > 0) || double.IsInfinity(known)) return "the known dimension must be a number above zero";
            double n = Math.Round(m.Storeys.Value);
            if (!(n >= 1) || m.Storeys.Source == "assumed") return "type the number of storeys first — the storey height comes from it";
            var r = m.HeightToWidth;
            if (widthMm.HasValue && !Usable(r)) return "the photos gave no height : width ratio — give the building's height instead";
            double H = heightMm ?? known * r.Value;
            m.KnownField = heightMm.HasValue ? "height" : "width";
            m.KnownMm = known;

            var h = m.StoreyHeightMm;
            h.Value = H / n; h.Confidence = m.Storeys.Confidence; h.Source = "inferred";
            h.Lo = H / (m.Storeys.Hi ?? n); h.Hi = H / (m.Storeys.Lo ?? n); h.Views = h.Of = 0;
            h.Note = $"{Mm0(H)} mm ÷ {Mm0(n)} storeys";

            if (picked) return null;
            var w = m.FootprintWidthMm;
            if (widthMm.HasValue)
            {
                w.Value = known; w.Confidence = 1; w.Source = "user"; w.Lo = w.Hi = null; w.Views = w.Of = 0; w.Note = "given by the reviewer";
            }
            else if (Usable(r))
            {
                w.Value = H / r.Value; w.Confidence = r.Confidence; w.Source = "inferred";
                w.Lo = H / (r.Hi ?? r.Value); w.Hi = H / (r.Lo ?? r.Value); w.Views = w.Of = 0;
                w.Note = $"{Mm0(H)} mm ÷ ratio {r.Value.ToString("0.##", CultureInfo.InvariantCulture)}";
            }
            else
            {
                // no ratio: the width stays the placeholder, assumed, and says so (ScaleRefusal holds the filing until a person types it)
                w.Note = m.FootprintDepthMm.Note = NoRatioWidth;
                return null;
            }
            var d = m.FootprintDepthMm;
            if (d.Source == "user") return null; // a depth the reviewer typed is theirs
            d.Value = w.Value; d.Confidence = 0; d.Source = "assumed"; d.Lo = d.Hi = null; d.Views = d.Of = 0;
            d.Note = "depth not seen — a person confirms";
            return null;
        }

        /// <summary>MA-6-9 (R11): an inferred value outside Validate's bounds is refused in words — never silently clamped to a plausible
        /// number. Null when nothing inferred is out of range (or no dimension was given).</summary>
        public static string ScaleRefusal(MassingEstimate m)
        {
            if (m?.KnownField == null) return null;
            double n = Math.Round(m.Storeys.Value), r = m.HeightToWidth?.Value ?? double.NaN;
            double H = m.KnownField == "height" ? m.KnownMm : m.KnownMm * r;
            var h = m.StoreyHeightMm; var w = m.FootprintWidthMm;
            if (h.Source == "inferred" && (h.Value < StoreyH.lo || h.Value > StoreyH.hi))
                return $"storey height inferred {Mm0(h.Value)} mm ({Mm0(H)} mm ÷ {Mm0(n)} storeys) is outside {Mm0(StoreyH.lo)}–{Mm0(StoreyH.hi)} mm — check the count or the known dimension";
            if (m.Footprint?.Loop != null) // MA-6-10: no width or depth to judge
                return n < Storeys.lo || n > Storeys.hi ? $"{Mm0(n)} storeys is outside {Mm0(Storeys.lo)}–{Mm0(Storeys.hi)} — check the count" : null;
            if (w.Source == "inferred" && (w.Value < FootprintW.lo || w.Value > FootprintW.hi))
                return $"footprint width inferred {Mm0(w.Value)} mm ({Mm0(H)} mm ÷ ratio {r.ToString("0.##", CultureInfo.InvariantCulture)}) is outside {Mm0(FootprintW.lo)}–{Mm0(FootprintW.hi)} mm — check the ratio or the known dimension";
            if (m.KnownField == "width" && (w.Value < FootprintW.lo || w.Value > FootprintW.hi))
                return $"footprint width given {Mm0(w.Value)} mm is outside {Mm0(FootprintW.lo)}–{Mm0(FootprintW.hi)} mm — check the known dimension";
            var d = m.FootprintDepthMm;
            if (m.KnownField == "width" && d.Source == "assumed" && (d.Value < FootprintD.lo || d.Value > FootprintD.hi))
                return $"footprint depth {Mm0(d.Value)} mm (copied from the width) is outside {Mm0(FootprintD.lo)}–{Mm0(FootprintD.hi)} mm — check the known dimension";
            if (m.KnownField == "height" && w.Source == "assumed")
                return NoRatioWidth;
            if (n < Storeys.lo || n > Storeys.hi)
                return $"{Mm0(n)} storeys is outside {Mm0(Storeys.lo)}–{Mm0(Storeys.hi)} — check the count";
            return null;
        }

        /// <summary>MA-6-9: the review's hint for a value — its mark, the spread across the photos or the range worked out, and its note.</summary>
        public static string Hint(EstimatedValue v, bool agreementOnly = false)
        {
            string num(double x) => x.ToString("0.###", CultureInfo.InvariantCulture);
            string s = Mark(v);
            if (v.Lo is double lo && v.Hi is double hi)
                s += v.Of > 0 ? $" — {v.Views} of {v.Of} photos: {num(lo)}–{num(hi)}" : $" — range {num(lo)}–{num(hi)}";
            if (agreementOnly && v.Of > 0) s += $" · {v.Confidence:0.0} agreement between photos, not accuracy — check the count";
            if (!string.IsNullOrEmpty(v.Note)) s += " — " + v.Note;
            return s;
        }

        /// <summary>Fields a reviewer must confirm before building — anything `assumed` or below the bar.</summary>
        public static List<string> FieldsNeedingReview(MassingEstimate m)
        {
            var outp = new List<string>();
            void Check(string label, EstimatedValue v) { if (v.Source != "photo" || v.Confidence <= AssumedBelow) outp.Add(label); }
            if (m.Footprint?.Loop == null) // MA-6-10: a picked outline has no width or depth to confirm
            {
                Check("footprint width", m.FootprintWidthMm);
                Check("footprint depth", m.FootprintDepthMm);
            }
            if (m.Storeys.Source == "photo") outp.Add("storeys"); // MA-6-9: photos agreeing is not a count being right (P-1, D17)
            else Check("storeys", m.Storeys);
            Check("storey height", m.StoreyHeightMm);
            for (int i = 0; i < m.Openings.Count; i++)
                Check($"opening {i + 1} ({m.Openings[i].Kind} on {m.Openings[i].Facade})", m.Openings[i].WidthMm);
            return outp;
        }

        /// <summary>MA-6-6: a changeset holds at most this many elements (the bridge's MAX_CHANGESET_ELEMENTS).</summary>
        public const int MaxElements = 200;
        /// <summary>MA-6-6: a level within this many mm of a storey's elevation is that storey's level.</summary>
        public const double LevelTolMm = 2;
        /// <summary>MA-6-6 review fix: a mass is at most this many mm high (the bridge's MAX_MASS_MM).</summary>
        public const double MaxMassMm = 1000000;

        /// <summary>MA-6-6 (MAS-2 + MAS-1): the reviewed estimate as ONE changeset body (POST /changesets/:key), or null and why in words.
        /// n = round(Storeys) storeys of StoreyHeightMm give the elevations e(i) = i·h, i = 0…n (the old plan's frame: Level.Elevation mm).
        /// Each e(i) reuses a Building Story level of <paramref name="levels"/> (read on the API thread when the person files: Name,
        /// Level.Elevation mm, IsStory) within ±LevelTolMm; otherwise it is a level create named "Massing Lii" — " (2)", " (3)"… while
        /// any level holds the name, case aside (a duplicate name fails the changeset, D16). Then one mass: the W × D rectangle centred on
        /// 0,0 from e(0) to e(n), in the same frame (amendment 3). Source photo, never a pre-tick (the bridge pre-ticks no create). Over
        /// MaxElements, a mass over MaxMassMm, or a Building Story level between two of its storeys (the shell would cut it) is refused. MA-7-14: the mass carries <paramref name="evidence"/> - the pack photos it was read from (PackPhotos.Evidence), which the bridge checks. Anonymous objects only: massing-check and ghost-p2-check compile this file alone (amendment 4).</summary>
        public static (object Body, string Refusal) Changeset(MassingEstimate m, IReadOnlyList<(string Name, double ElevationMm, bool IsStory)> levels, string actor, Footprint fp = null, IReadOnlyList<string> evidence = null)
        {
            double W = m.FootprintWidthMm.Value, D = m.FootprintDepthMm.Value, h = m.StoreyHeightMm.Value;
            int n = Math.Max(1, (int)Math.Round(m.Storeys.Value));
            // MA-6-6 review fix: the bridge's mass height cap (MAX_MASS_MM), said in the planner's words before anything is filed.
            if (n * h > MaxMassMm)
                return (null, $"{n} storeys of {Mm(h)} mm are {Mm(n * h)} mm — a mass is at most {Mm(MaxMassMm)} mm high: lower the storey count or the storey height");
            var have = levels ?? new List<(string Name, double ElevationMm, bool IsStory)>();
            // MA-6-6 review fix (MAS-1): Shell a Mass cuts a storey at EVERY Building Story level inside the mass (ShellReader), so one between
            // two of the photo's storeys would add a storey the photos do not have (Level 2 at 4000 under 3200 mm storeys: an 800 mm sliver).
            var between = have.Where(l => l.IsStory && l.ElevationMm > LevelTolMm && l.ElevationMm < n * h - LevelTolMm
                                          && !Enumerable.Range(0, n + 1).Any(i => Math.Abs(l.ElevationMm - i * h) <= LevelTolMm)).ToList();
            if (between.Count > 0)
            {
                bool one = between.Count == 1;
                string named = string.Join(", ", between.Take(3).Select(l => $"{l.Name} at {Mm(l.ElevationMm)} mm")) + (between.Count > 3 ? $" and {between.Count - 3} more" : "");
                // MA-6 batch-2 drill: clearing Building Story has a cost - Promote holds what stands on a level that is not a storey.
                return (null, $"{named} {(one ? "is a Building Story" : "are Building Stories")} inside the massing (0 to {Mm(n * h)} mm) — Shell a Mass cuts a storey at every Building Story level: set the storey height to match {(one ? "it" : "them")}, or clear {(one ? "its" : "their")} Building Story (Promote then holds what stands on {(one ? "it" : "them")} — it plans storey by storey)");
            }
            var taken = new HashSet<string>(have.Select(l => l.Name ?? ""), StringComparer.OrdinalIgnoreCase);
            var elements = new List<object>();
            for (int i = 0; i <= n; i++)
            {
                double e = i * h;
                if (have.Any(l => l.IsStory && Math.Abs(l.ElevationMm - e) <= LevelTolMm)) continue;
                string name = $"Massing L{i:00}";
                for (int k = 2; taken.Contains(name); k++) name = $"Massing L{i:00} ({k})";
                taken.Add(name);
                elements.Add(new
                {
                    op = "create", kind = "level",
                    place = new { BaseElevation = e },
                    reason = (i < n ? $"Photo Massing: the floor of storey {i + 1} of {n}" : "Photo Massing: the top of the mass") + $" at {Mm(e)} mm — no Building Story level there",
                    validate = new { identity = new { Class = "IFCBUILDINGSTOREY", Name = name } },
                });
            }
            if (elements.Count + 1 > MaxElements)
                return (null, $"{elements.Count} levels and a mass are {elements.Count + 1} elements — a changeset holds {MaxElements} elements: lower the storey count, or file the levels with Datum");
            string size = $"{Metres(W)} × {Metres(D)} m";
            List<double[]> boundary = new List<double[]> { new[] { -W / 2, -D / 2 }, new[] { W / 2, -D / 2 }, new[] { W / 2, D / 2 }, new[] { -W / 2, D / 2 } };
            string where = "";
            // MA-6-10 (MAS-3): a picked outline, or a turn / a point for the photos' rectangle, is placed by Placed; with neither the output is as before.
            if (fp != null || m.RotationDeg != 0)
            {
                var src = fp?.Loop ?? boundary;
                var placed = Placed(new Footprint { Loop = src, At = fp?.At }, m.RotationDeg);
                if (placed == null) return (null, "the footprint has fewer than 3 corners once its repeated and straight-through points are dropped — check the outline");
                if (OutlineProblem(placed) is { } bad) return (null, "the footprint cannot be used: " + bad);
                boundary = placed;
                // the pivot: where the outline's bounding-box centre was put (the point picked, else where it lay)
                double cx = fp?.At?[0] ?? (src.Min(q => q[0]) + src.Max(q => q[0])) / 2, cy = fp?.At?[1] ?? (src.Min(q => q[1]) + src.Max(q => q[1])) / 2;
                where = (fp?.Loop == null && fp?.At == null ? "centred on the model origin" : $"centre at ({Mm(cx)}, {Mm(cy)}) mm") + (m.RotationDeg != 0 ? $", turned {Mm(m.RotationDeg)}°" : "");
                if (fp?.Loop != null)
                {
                    string a = Area(placed).ToString("0.0", CultureInfo.InvariantCulture);
                    size = $"footprint {a} m²";
                    where = $"footprint: {fp.From}, {placed.Count} corners, {a} m² (the polyline: {Area(fp.Loop).ToString("0.0", CultureInfo.InvariantCulture)} m²), " + where;
                }
            }
            bool picked = fp?.Loop != null;
            elements.Add(new
            {
                op = "create", kind = "mass",
                place = new { Boundary = boundary, BaseElevation = 0.0, TopElevation = n * h },
                reason = picked
                    ? $"Photo Massing: {where}; {StoreyCount(n)} of {Mm(h)} mm — storeys {From(m.Storeys)}, storey height {From(m.StoreyHeightMm)}"
                    : $"Photo Massing: {size}, {StoreyCount(n)} of {Mm(h)} mm — width {From(m.FootprintWidthMm)}, depth {From(m.FootprintDepthMm)}, storeys {From(m.Storeys)}, storey height {From(m.StoreyHeightMm)}" + (where == "" ? "" : "; " + where),
                validate = new { identity = new { Class = "IFCBUILDINGELEMENTPROXY", Name = "Photo mass" } },
                evidence, // MA-7-14
            });
            return (new { name = $"Photo Massing · {StoreyCount(n)} · {size}", source = "photo", actor, elements }, null);
        }

        // ---- MA-6-10 (MAS-3): footprint pick, pure -------------------------------------------------------------------------------
        /// <summary>One closed loop of every segment (model mm), or null and why: fewer than 3 edges, a branch, a gap, or more than one outline.
        /// Endpoints within <paramref name="tolMm"/> are one corner.</summary>
        public static List<double[]> Chain(IReadOnlyList<(double[] A, double[] B)> segs, double tolMm, out string why)
        {
            why = null;
            var list = (segs ?? new List<(double[] A, double[] B)>()).Where(s => Math.Sqrt(Math.Pow(s.A[0] - s.B[0], 2) + Math.Pow(s.A[1] - s.B[1], 2)) > tolMm).ToList();
            if (list.Count < 3) { why = "fewer than 3 edges"; return null; }
            var nodes = new List<double[]>();
            int Node(double[] p)
            {
                for (int i = 0; i < nodes.Count; i++) if (Math.Sqrt(Math.Pow(nodes[i][0] - p[0], 2) + Math.Pow(nodes[i][1] - p[1], 2)) <= tolMm) return i;
                nodes.Add(new[] { p[0], p[1] });
                return nodes.Count - 1;
            }
            var ends = list.Select(s => (a: Node(s.A), b: Node(s.B))).ToList();
            var deg = new int[nodes.Count];
            foreach (var e in ends) { deg[e.a]++; deg[e.b]++; }
            string at(int i) => $"({Mm(nodes[i][0])}, {Mm(nodes[i][1])})";
            for (int i = 0; i < deg.Length; i++)
                if (deg[i] > 2) { why = $"the lines branch at {at(i)} — pick one outline"; return null; }
            var open = Enumerable.Range(0, deg.Length).Where(i => deg[i] == 1).ToList();
            if (open.Count > 0)
            {
                int i = open[0];
                double gap = open.Count > 1 ? open.Skip(1).Min(j => Math.Sqrt(Math.Pow(nodes[i][0] - nodes[j][0], 2) + Math.Pow(nodes[i][1] - nodes[j][1], 2))) : double.NaN;
                why = $"the lines do not close — a gap of {(double.IsNaN(gap) ? "unknown" : Mm(gap))} mm at {at(i)}";
                return null;
            }
            // every corner has two edges: walk from the first edge; a walk that returns to the start before using every edge = more than one outline
            var loop = new List<double[]>();
            var used = new bool[ends.Count];
            int cur = ends[0].a, k = 0;
            while (k < ends.Count)
            {
                int e = Enumerable.Range(0, ends.Count).First(x => !used[x] && (ends[x].a == cur || ends[x].b == cur));
                used[e] = true; loop.Add(nodes[cur]);
                cur = ends[e].a == cur ? ends[e].b : ends[e].a;
                k++;
                if (cur == ends[0].a && k < ends.Count) { why = "the lines make more than one outline — pick one outline"; return null; }
            }
            return loop;
        }

        /// <summary>MA-6-10 review: the bridge's mass Boundary rules (changesets-logic.mjs outlineProblem) in the planner's words, so a bad outline
        /// is refused before the vision run, not at File: more than 256 corners, an edge under 1 mm, a loop that crosses or touches itself.
        /// ponytail: O(n^2) pair test, fine at 256 corners.</summary>
        public static string OutlineProblem(IList<double[]> p)
        {
            int n = p.Count;
            if (n > 256) return $"the outline has {n} corners; a mass takes at most 256";
            for (int i = 0; i < n; i++)
            {
                var a = p[i]; var b = p[(i + 1) % n];
                if (Math.Sqrt(Math.Pow(b[0] - a[0], 2) + Math.Pow(b[1] - a[1], 2)) < 1) return $"the outline has an edge shorter than 1 mm at ({Mm(a[0])}, {Mm(a[1])})";
            }
            for (int i = 0; i < n; i++)
                for (int j = i + 2; j < n; j++)
                    if (!(i == 0 && j == n - 1) && Meet(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]))
                        return $"the outline crosses or touches itself near ({Mm(p[j][0])}, {Mm(p[j][1])})";
            return null;
        }

        /// <summary>MA-6-10 review: a CAD layer name is untrusted text - one line, at most 64 characters.</summary>
        public static string CadName(string s)
        {
            s = new string((s ?? "").Where(ch => !char.IsControl(ch)).ToArray()).Trim();
            return s.Length > 64 ? s.Substring(0, 63) + "…" : s;
        }

        private static double Cross(double[] o, double[] a, double[] b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        private static bool OnSeg(double[] a, double[] b, double[] p) => Math.Min(a[0], b[0]) <= p[0] && p[0] <= Math.Max(a[0], b[0]) && Math.Min(a[1], b[1]) <= p[1] && p[1] <= Math.Max(a[1], b[1]);
        /// <summary>Two segments share a point (crossing, touching or overlapping).</summary>
        private static bool Meet(double[] a, double[] b, double[] c, double[] d)
        {
            double d1 = Cross(a, b, c), d2 = Cross(a, b, d), d3 = Cross(c, d, a), d4 = Cross(c, d, b);
            if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
            return (d1 == 0 && OnSeg(a, b, c)) || (d2 == 0 && OnSeg(a, b, d)) || (d3 == 0 && OnSeg(c, d, a)) || (d4 == 0 && OnSeg(c, d, b));
        }

        private static double Signed(IList<double[]> p)
        {
            double a = 0;
            for (int i = 0; i < p.Count; i++) { var q = p[(i + 1) % p.Count]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
            return a / 2;
        }

        /// <summary>The loop's area in m2 (mm in).</summary>
        public static double Area(IList<double[]> loop) => Math.Abs(Signed(loop)) / 1e6;

        /// <summary>The footprint turned by <paramref name="rotDeg"/> (counter-clockwise) about its bounding-box centre, the centre then moved to At when
        /// given: counter-clockwise, repeats and straight-through points dropped, 0.1 mm. Null when fewer than 3 corners remain.</summary>
        public static List<double[]> Placed(Footprint fp, double rotDeg)
        {
            var p = fp.Loop;
            double cx = (p.Min(v => v[0]) + p.Max(v => v[0])) / 2, cy = (p.Min(v => v[1]) + p.Max(v => v[1])) / 2;
            double ox = fp.At?[0] ?? cx, oy = fp.At?[1] ?? cy, a = rotDeg * Math.PI / 180, c = Math.Cos(a), s = Math.Sin(a);
            var q = p.Select(v => new[] { Math.Round(ox + c * (v[0] - cx) - s * (v[1] - cy), 1), Math.Round(oy + s * (v[0] - cx) + c * (v[1] - cy), 1) }).ToList();
            for (bool changed = true; changed && q.Count >= 3;)
            {
                changed = false;
                for (int i = 0; i < q.Count && q.Count >= 3; i++)
                {
                    var prev = q[(i + q.Count - 1) % q.Count]; var cur = q[i]; var next = q[(i + 1) % q.Count];
                    double len = Math.Sqrt(Math.Pow(next[0] - prev[0], 2) + Math.Pow(next[1] - prev[1], 2));
                    double cross = (cur[0] - prev[0]) * (next[1] - prev[1]) - (cur[1] - prev[1]) * (next[0] - prev[0]);
                    bool same = Math.Abs(cur[0] - prev[0]) < 0.05 && Math.Abs(cur[1] - prev[1]) < 0.05;
                    bool straight = len > 0 && Math.Abs(cross) / len < 0.05 && (cur[0] - prev[0]) * (next[0] - cur[0]) + (cur[1] - prev[1]) * (next[1] - cur[1]) > 0;
                    if (same || straight) { q.RemoveAt(i); i--; changed = true; }
                }
            }
            if (q.Count < 3) return null;
            if (Signed(q) < 0) { var first = q[0]; q.RemoveAt(0); q.Reverse(); q.Insert(0, first); }
            return q;
        }

        // MA-6 batch-2 drill: "1 storey", not "1 storeys".
        private static string StoreyCount(int n) => n == 1 ? "1 storey" : $"{n} storeys";

        /// <summary>MA-6-6 (D12): the openings the estimate saw — counted on the receipt, never placed (a mass has no openings).</summary>
        public static string OpeningsSeen(MassingEstimate m)
        {
            var o = (m?.Openings ?? new List<OpeningEstimate>()).Where(x => x != null).ToList();
            if (o.Count == 0) return "not read — v2 reads storeys, bays and proportions (C14)"; // MA-6-9 (D12): the photo reader asks for no openings
            return $"{o.Count(x => x.Kind == "door")} door(s), {o.Count(x => x.Kind == "window")} window(s) — not placed (D12)";
        }

        /// <summary>MA-6-9: where a number came from, in the review's four words — the source codes stay photo, user, inferred, assumed.</summary>
        public static string Mark(EstimatedValue v) => v.Source == "photo" ? "observed" : v.Source == "user" ? "given" : v.Source == "inferred" ? "inferred" : "assumed";
        // MA-6-6 review fix: where a number came from, in words (the source codes are the estimate's, not the reviewer's). MA-6-9: the marks.
        private static string From(EstimatedValue v) => Mark(v);
        private static string Mm0(double v) => Math.Round(v).ToString("0", CultureInfo.InvariantCulture);
        private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
        private static string Metres(double mm) => (mm / 1000).ToString("0.0", CultureInfo.InvariantCulture);
    }
}
