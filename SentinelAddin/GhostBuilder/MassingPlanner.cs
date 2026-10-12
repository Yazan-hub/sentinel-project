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
        public string Source = "photo"; // "photo" | "assumed" | "user"
        public string Note;
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
            };
        }

        private static EstimatedValue Assumed(double value) =>
            new EstimatedValue { Value = value, Confidence = 0, Source = "assumed" };

        private static EstimatedValue Clamp(EstimatedValue v, (double lo, double hi) b, string unit = " mm")
        {
            var o = new EstimatedValue { Value = v.Value, Confidence = v.Confidence, Source = v.Source, Note = v.Note };
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
            m != null && new[] { m.FootprintWidthMm, m.FootprintDepthMm, m.Storeys, m.StoreyHeightMm }
                .Concat((m.Openings ?? new List<OpeningEstimate>()).Where(o => o != null).SelectMany(o => new[] { o.WidthMm, o.HeightMm }))
                .Any(v => v != null && v.Source == "photo");

        /// <summary>MAS-4: the review's status line when a filing ended with nothing filed — the reason is in the dialog just shown.</summary>
        public const string ReopenStatus = "Nothing was filed — the reason is in the message just shown. Your numbers are kept: put it right, then File for review again.";

        /// <summary>MAS-4 (review amendment C12): the review's status line when the filing could not start — the request threw, Revit did
        /// not take it, or (MA-6-6) a check before filing refused it. The window is reopened where the failure is seen.</summary>
        public static string NotStarted(string why) => $"The filing did not start ({why}). Your numbers are kept: put it right, then File for review again.";

        /// <summary>Fields a reviewer must confirm before building — anything `assumed` or below the bar.</summary>
        public static List<string> FieldsNeedingReview(MassingEstimate m)
        {
            var outp = new List<string>();
            void Check(string label, EstimatedValue v) { if (v.Source != "photo" || v.Confidence <= AssumedBelow) outp.Add(label); }
            Check("footprint width", m.FootprintWidthMm);
            Check("footprint depth", m.FootprintDepthMm);
            Check("storeys", m.Storeys);
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
        /// MaxElements, a mass over MaxMassMm, or a Building Story level between two of its storeys (the shell would cut it) is refused. Anonymous objects only: massing-check and ghost-p2-check compile this file alone (amendment 4).</summary>
        public static (object Body, string Refusal) Changeset(MassingEstimate m, IReadOnlyList<(string Name, double ElevationMm, bool IsStory)> levels, string actor)
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
                return (null, $"{named} {(one ? "is a Building Story" : "are Building Stories")} inside the massing (0 to {Mm(n * h)} mm) — Shell a Mass cuts a storey at every Building Story level: set the storey height to match {(one ? "it" : "them")}, or clear {(one ? "its" : "their")} Building Story");
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
            elements.Add(new
            {
                op = "create", kind = "mass",
                place = new
                {
                    Boundary = new List<double[]> { new[] { -W / 2, -D / 2 }, new[] { W / 2, -D / 2 }, new[] { W / 2, D / 2 }, new[] { -W / 2, D / 2 } },
                    BaseElevation = 0.0, TopElevation = n * h,
                },
                reason = $"Photo Massing: {size}, {n} storeys of {Mm(h)} mm — width {From(m.FootprintWidthMm)}, depth {From(m.FootprintDepthMm)}, storeys {From(m.Storeys)}, storey height {From(m.StoreyHeightMm)}",
                validate = new { identity = new { Class = "IFCBUILDINGELEMENTPROXY", Name = "Photo mass" } },
            });
            return (new { name = $"Photo Massing · {n} storeys · {size}", source = "photo", actor, elements }, null);
        }

        /// <summary>MA-6-6 (D12): the openings the estimate saw — counted on the receipt, never placed (a mass has no openings).</summary>
        public static string OpeningsSeen(MassingEstimate m)
        {
            var o = (m?.Openings ?? new List<OpeningEstimate>()).Where(x => x != null).ToList();
            return $"{o.Count(x => x.Kind == "door")} door(s), {o.Count(x => x.Kind == "window")} window(s) — not placed (D12)";
        }

        // MA-6-6 review fix: where a number came from, in words (the source codes are the estimate's, not the reviewer's).
        private static string From(EstimatedValue v) => v.Source == "photo" ? "from the photos" : v.Source == "user" ? "typed by the reviewer" : "assumed";
        private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
        private static string Metres(double mm) => (mm / 1000).ToString("0.0", CultureInfo.InvariantCulture);
    }
}
