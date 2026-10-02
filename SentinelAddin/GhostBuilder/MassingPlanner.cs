#nullable disable
// C# port of sentinel-core/massing.ts + massing-plan.ts — the estimate validator and the build-plan
// generator. massing.test.ts + massing-plan.test.ts are the CONFORMANCE REFERENCE, the same relationship
// GuidelineMatcher has to guideline.ts. Pure — no Revit — so it's offline-testable; MassingBuilder is the
// thin Revit layer that places the plan this produces.
//
// A photo estimate is WHAT the building is; this makes it WHERE every element goes, in millimetres, with
// no types — GhostBuilder's guideline chooses those. So a photo-massing goes through the same governed,
// audited placement as a DWG build, which is the whole point.
using System;
using System.Collections.Generic;
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

    // ---- plan ----------------------------------------------------------------------------------------
    public sealed class PlanWall
    {
        public double X1, Y1, X2, Y2;
        public double ThicknessMm, HeightMm, BaseElevationMm;
        public string Layer = "A-WALL-EXT";
    }

    public sealed class PlanFloor
    {
        public List<double[]> Loop = new List<double[]>(); // closed rectangle, [x,y] points
        public double BaseElevationMm;
        public string Layer = "A-FLOR";
    }

    public sealed class PlanOpening
    {
        public string Kind;
        public int WallIndex;
        public double OffsetMm, WidthMm, HeightMm, SillMm;
        public string Layer;
    }

    public sealed class MassingPlan
    {
        public List<PlanWall> Walls = new List<PlanWall>();
        public List<PlanFloor> Floors = new List<PlanFloor>();
        public List<PlanOpening> Openings = new List<PlanOpening>();
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

        /// <summary>The rule a Photo Massing element's stamp records: the vision model's estimate when the images are its source
        /// (<paramref name="fromImages"/>: their sha is stamped with it), else the reviewer's own numbers.</summary>
        public static string StampRule(string what, bool fromImages) =>
            $"Photo Massing: {what} of the massing plan, " + (fromImages
                ? "from the vision model's estimate as corrected in the review"
                : "from the numbers the reviewer confirmed in the review — no vision-model reading is recorded for them");

        /// <summary>MAS-4: whether a build's end closes the review. It closes when the build left something in the model
        /// (<paramref name="placed"/> &gt; 0), or when Revit has not finished the commit (<paramref name="notFinished"/>: it
        /// may still land, so a second Build must not be offered). A refusal before the transaction (<paramref name="failed"/>:
        /// the wrong model in front, a design option being edited, a workset the model lacks), a rollback, or a build that
        /// placed nothing leaves the review open with the reviewer's numbers — reading the images again takes time, and the
        /// corrections would be lost.</summary>
        public static bool BuildKept(bool failed, bool rolledBack, bool notFinished, int placed) =>
            !failed && !rolledBack && (notFinished || placed > 0);

        /// <summary>MAS-4: the review's status line when a build ended with nothing kept.</summary>
        public const string ReopenStatus = "Nothing was built — the reason is in the message just shown. Your numbers are kept: put it right, then Build again.";

        /// <summary>MAS-4 (review amendment C12): the review's status line when the build could not start — the request threw,
        /// or Revit did not accept it. Completed never fires then, so the window is reopened where the failure is seen.</summary>
        public static string NotStarted(string why) => $"The build did not start ({why}). Your numbers are kept: put it right, then Build again.";

        /// <summary>MAS-4: the summary's line for the selection made after a kept build. <paramref name="selected"/> is what
        /// Revit holds selected, read back after the selection was set (review amendment C11) — not the count asked for;
        /// <paramref name="placed"/> is how many placed elements were asked for. Both are said when they differ.</summary>
        public static string SelectedLine(int selected, int placed) => selected == placed
            ? $"Selected: {selected} element(s) — the massing just placed; the view zooms to them."
            : $"Selected: {selected} of the {placed} element(s) placed — Revit holds fewer selected than were placed; the view zooms to the massing.";

        /// <summary>MAS-4: the summary's line when Revit refused the selection or the zoom — the build stands.</summary>
        public static string NotSelectedLine(string why) => $"Selected: nothing — Revit would not select the new elements ({why}); the massing is placed.";

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

        /// <summary>Estimate → build plan. Mirrors planMassing: a centred rectangle, four perimeter walls +
        /// a floor per storey, front openings evenly spread on the ground front wall.</summary>
        public static MassingPlan Plan(MassingEstimate m, double defaultWallThicknessMm = 200,
                                       double originX = 0, double originY = 0)
        {
            double W = m.FootprintWidthMm.Value, D = m.FootprintDepthMm.Value;
            int storeys = Math.Max(1, (int)Math.Round(m.Storeys.Value));
            double h = m.StoreyHeightMm.Value;

            double x0 = originX - W / 2, x1 = originX + W / 2;
            double y0 = originY - D / 2, y1 = originY + D / 2;

            var plan = new MassingPlan();
            for (int s = 0; s < storeys; s++)
            {
                double baseEl = s * h;
                var edges = new[]
                {
                    new[] { x0, y0, x1, y0 }, // south (front)
                    new[] { x1, y0, x1, y1 }, // east
                    new[] { x1, y1, x0, y1 }, // north
                    new[] { x0, y1, x0, y0 }, // west
                };
                foreach (var e in edges)
                    plan.Walls.Add(new PlanWall
                    {
                        X1 = e[0], Y1 = e[1], X2 = e[2], Y2 = e[3],
                        ThicknessMm = defaultWallThicknessMm, HeightMm = h, BaseElevationMm = baseEl,
                        Layer = "A-WALL-EXT",
                    });
                plan.Floors.Add(new PlanFloor
                {
                    Loop = new List<double[]>
                    {
                        new[] { x0, y0 }, new[] { x1, y0 }, new[] { x1, y1 }, new[] { x0, y1 }, new[] { x0, y0 },
                    },
                    BaseElevationMm = baseEl,
                    Layer = "A-FLOR",
                });
            }

            var front = m.Openings.Where(o => o.Facade == "front" || m.FacadesSeen.Contains(o.Facade)).ToList();
            for (int i = 0; i < front.Count; i++)
            {
                var o = front[i];
                double frac = (double)(i + 1) / (front.Count + 1);
                plan.Openings.Add(new PlanOpening
                {
                    Kind = o.Kind,
                    WallIndex = 0,
                    OffsetMm = frac * W,
                    WidthMm = o.WidthMm.Value,
                    HeightMm = o.HeightMm.Value,
                    SillMm = o.Kind == "window" ? 900 : 0,
                    Layer = o.Kind == "window" ? "A-WIND" : "A-DOOR",
                });
            }
            return plan;
        }
    }
}
