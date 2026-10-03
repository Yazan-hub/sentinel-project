#nullable disable
// MA-1a step 2 (design §2.4 step 2): Ghost Builder files its reviewed rows as changesets with source "dwg", and
// ChangesetExecutor places them — this is the pure half. The changeset element each Ghost row becomes (millimetres, absolute
// elevations, exact type names), the chunks the bridge's 200-element cap allows (hosts before what they host), the POST
// body, and the local changeset an unbound model runs through the same executor without a ledger. No Revit API, so
// tools/promote-check proves it offline against the bridge's fixture (ghost-dwg-body.json); the Revit half is
// GhostChangesetBuild.
// MA-1a item 3 (GHB-2): a wall is filed with its base only — the drawing's Z read from the import's own Z — and the executor
// gives it its top (the next Building Story). Item 4: each element carries its provenance: the layer here, the rule and the
// drawing's sha from the planner. The bridge keeps it as the filed record; the stamp takes the same facts from the planner
// in process (ChangesetExecutor.Provenance), never from what the bridge returns (review amendment C1).
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    public static class GhostFiling
    {
        /// <summary>The changeset source of a DWG build (the bridge stores it; the executor stamps it on every element).</summary>
        public const string Source = "dwg";
        /// <summary>The bridge's MAX_CHANGESET_ELEMENTS (changesets-logic.mjs): a larger body is a 413.</summary>
        public const int MaxElements = 200;
        private const double FtToMm = 304.8;

        /// <summary>A Ghost row's category → the changeset kind and the IFC class it is adjudicated as. A category not here
        /// is not filed (the summary says so).</summary>
        public static readonly IReadOnlyDictionary<string, (string Kind, string Ifc)> Kinds =
            new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
            {
                ["Walls"] = ("wall", "IfcWall"), ["Floors"] = ("floor", "IfcSlab"), ["Ceilings"] = ("ceiling", "IfcCovering"),
                ["Doors"] = ("door", "IfcDoor"), ["Windows"] = ("window", "IfcWindow"),
                ["Columns"] = ("column", "IfcColumn"), ["Furniture"] = ("furniture", "IfcFurniture"),
            };

        private static readonly HashSet<string> Synthetic = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Generic Wall", "Generic Door", "Generic Window", "Generic Floor", "Generic Ceiling", "Generic Column", "Generic Furniture",
            "Generic Model",
        };

        /// <summary>The words added to a gap when the row's name is one of the placeholders the layer standard's matcher or the
        /// local model's normaliser writes ("Generic Door", …) — no model has them; empty otherwise.</summary>
        public static string SyntheticHint(string name) =>
            name != null && Synthetic.Contains(name.Trim())
                ? $" — \"{name.Trim()}\" is a placeholder the layer mapping wrote, not a type in this model; pick a loaded type in the review"
                : "";

        /// <summary>MA-1a item 3 (GHB-2): a DWG wall's base in absolute mm — the build level plus its drawing Z measured from the
        /// import's own Z (<paramref name="importZFt"/>, ImportInstance.GetTotalTransform().Origin.Z). The extractor reads the
        /// drawing in model coordinates, so a plan imported in a raised level's view carries that level's elevation in every Z;
        /// adding it to the build level again put Level 3 walls at +18 m (audit GHB-2). The top is the executor's.</summary>
        public static double WallBase(double levelMm, double cadZFt, double importZFt) => levelMm + (cadZFt - importZFt) * FtToMm;

        /// <summary>Final review, MA-1a item 3: a wall the drawing puts below the build level takes the build level itself as its
        /// next Building Story (<paramref name="topLevel"/>, WallTop's answer) — a stub as high as the gap, or a wall too short
        /// for Revit, which would decline the whole build. Ghost's planner names it a gap with these words; null otherwise.</summary>
        public static string BelowLevelGap(string level, double levelMm, double baseMm, string topLevel) =>
            topLevel != null && string.Equals(topLevel, level, StringComparison.Ordinal)
                ? $"the drawing puts this wall {levelMm - baseMm:0.#} mm below {level}, so the next Building Story above it is {level} itself — a stub, not a wall"
                : null;

        /// <summary>Review amendment C8: the level Ghost's review opens on — the drawing's own: the level at the import's
        /// elevation (within 1 mm; the nearest), else the active plan view's level, else the lowest. The lowest alone was
        /// GR_SSL (−300) on the BDS template, where the next-story rule gives 300 mm walls. The person can still pick any.</summary>
        /// <param name="levels">The model's levels, lowest first; not empty.</param>
        /// <param name="activeViewLevel">The active view's level when it is a plan view, else null.</param>
        public static long DefaultLevel(IReadOnlyList<(long Id, double ElevationMm)> levels, double importZMm, long? activeViewLevel)
        {
            var at = levels.Where(l => Math.Abs(l.ElevationMm - importZMm) <= 1).OrderBy(l => Math.Abs(l.ElevationMm - importZMm)).ToList();
            if (at.Count > 0) return at[0].Id;
            return activeViewLevel is long a && levels.Any(l => l.Id == a) ? a : levels[0].Id;
        }

        /// <summary>One wall run, flat at <paramref name="z"/> (mm): a line from <paramref name="a"/> to <paramref name="b"/>
        /// ([x,y] mm), or an arc through <paramref name="mid"/> — null when its ends, flattened, are closer than
        /// <paramref name="tolMm"/> (a near-vertical or degenerate CAD segment, which Wall.Create refuses).</summary>
        public static CurveDto Run(double[] a, double[] b, double[] mid, double z, double tolMm)
        {
            if (Math.Sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) < tolMm) return null;
            return new CurveDto
            {
                Start = new[] { a[0], a[1], z }, End = new[] { b[0], b[1], z },
                Mid = mid == null || ArcSag(a, b, mid) < 1 ? null : new[] { mid[0], mid[1], z }, // < 1 mm off the chord: straight
            };
        }

        /// How far (mm, in plan) an arc's mid point sits off the chord a→b — the bridge's arcSag, same 1 mm rule.
        internal static double ArcSag(double[] a, double[] b, double[] m)
        {
            double dx = b[0] - a[0], dy = b[1] - a[1], chord = Math.Sqrt(dx * dx + dy * dy);
            return chord == 0 ? 0 : Math.Abs(dx * (m[1] - a[1]) - dy * (m[0] - a[0])) / chord;
        }

        // Each element is named "<layer> #<n>" (n counts this build's elements of that layer) and says where it came from.
        private static ChangesetElementDto Create(string kind, string layer, int n, string typedBy, PlaceDto place) => new ChangesetElementDto
        {
            Kind = kind, Op = "create",
            Reason = Clip($"Ghost Builder: {kind} on layer {layer}" + (typedBy == null ? "" : $", typed by the {typedBy}"), 500),
            Validate = new ValidateDto { Identity = new IdentityDto { Class = Kinds.Values.First(k => k.Kind == kind).Ifc, Name = Clip($"{layer} #{n}", 256) } },
            Place = place,
            Provenance = new ProvenanceDto { Layer = Clip(layer, 256) }, // MA-1a item 4: the planner adds the rule and the drawing's sha
        };

        /// <summary>MA-1a item 4: the stamp's rule for a Ghost element, in words — what typed it: the guideline (its artefact
        /// label), the reviewer's pick in Ghost's review, or the layer mapping and its tier (with the layers standard when the
        /// tier is the standard).</summary>
        /// <param name="typedBy">A wall's ElementPlacementFactory.ResolveWallType answer; null for any other kind.</param>
        /// <param name="mappingSource">LayerMapping.Source: standard, heuristic, llm, cache or reviewer.</param>
        public static string Rule(string typedBy, string mappingSource, string guideline, string layers) => Clip(
            typedBy == "guideline" ? $"type by the guideline ({guideline})"
            : typedBy == "reviewer" || mappingSource == "reviewer" ? "type picked by the reviewer in Ghost's review"
            : $"type by the layer mapping ({mappingSource ?? "unknown"}" + (mappingSource == "standard" ? $": {layers}" : "") + ")", 500);

        /// <param name="typedBy">"guideline", "mapping" or "reviewer" (ElementPlacementFactory.ResolveWallType).</param>
        /// <param name="baseMm">Absolute (<see cref="WallBase"/>). No TopElevation: the executor tops the wall (MA-1a item 3).</param>
        public static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm) =>
            Create("wall", layer, n, typedBy, new PlaceDto { TypeName = typeName, LevelName = level, LocationCurve = run, BaseElevation = baseMm });

        /// <param name="loopMm">The outline's corners [x,y,z] mm, as drawn (the executor closes the loop).</param>
        public static ChangesetElementDto Floor(string layer, int n, string typeName, string level, IReadOnlyList<double[]> loopMm) =>
            Create("floor", layer, n, null, new PlaceDto
            {
                TypeName = typeName, LevelName = level, LocationLoop = loopMm.Select(p => new[] { p[0], p[1], p[2] }).ToArray(),
            });

        /// <param name="offsetMm">Its height above the level (the bridge requires one; founder decision F7: the drawing's).</param>
        public static ChangesetElementDto Ceiling(string layer, int n, string typeName, string level, IReadOnlyList<double[]> outlineMm, double offsetMm) =>
            Create("ceiling", layer, n, null, new PlaceDto
            {
                TypeName = typeName, LevelName = level, Boundary = outlineMm.Select(p => new[] { p[0], p[1] }).ToArray(), Offset = offsetMm,
            });

        /// <summary>A door, window, column or furniture at (x, y) on its level (z = the level's elevation): a door or window is
        /// hosted by the one wall under the point, a column or furniture stands unhosted. MA-1b (GHB-1): a door or window read
        /// from a drawn block carries the block's direction (<paramref name="rotationDeg"/>, PlacementGeometry.Frame's) and,
        /// only when it is, that it is mirrored; a drawn outline's carries neither.</summary>
        public static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level,
                                                double x, double y, double levelMm, double? rotationDeg = null, bool mirrored = false) =>
            Create(kind, layer, n, null, new PlaceDto
            {
                FamilyName = family, TypeName = typeName, LevelName = level, Location = new[] { x, y, levelMm },
                Rotation = rotationDeg, Mirrored = rotationDeg != null && mirrored ? true : (bool?)null,
            });

        /// <summary>MA-1b (GHB-1): whether the bridge's answer lost a block's direction — an element sent with place.Rotation
        /// that came back without it, with another angle, or with another Mirrored. A bridge still on the code before MA-1b
        /// drops both fields ("ignored: not a field this bridge keeps"), and the executor, which places what the bridge
        /// returned, would place every such door unturned. Ghost's planner refuses the build instead.</summary>
        public static bool LostRotation(IReadOnlyList<ChangesetElementDto> sent, IReadOnlyList<ChangesetElementDto> kept) =>
            Enumerable.Range(0, Math.Min(sent.Count, kept.Count)).Any(i => sent[i].Place?.Rotation is double r
                && !(kept[i].Place?.Rotation is double k && Math.Abs(k - r) < 1e-6 && (kept[i].Place.Mirrored == true) == (sent[i].Place.Mirrored == true)));

        /// <summary>B2 (founder decision F9 A): why a DWG door or window at (x, y) mm on <paramref name="level"/> is not filed, or
        /// null. The executor's host rule (PlacementGeometry.Host: the one straight wall under the point) over the model's walls
        /// AND this build's, so an ambiguity is still seen — but only a wall this build creates may host it: Ghost touches only
        /// its own elements.</summary>
        public static string HostGap(IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> modelWalls,
                                     IReadOnlyList<(string Label, string Level, double X0, double Y0, double X1, double Y1)> buildWalls,
                                     string level, double x, double y)
        {
            var all = modelWalls.Concat(buildWalls).ToList();
            int i = PlacementGeometry.Host(all, level, x, y, out string why);
            return i < 0 ? why
                 : i < modelWalls.Count ? $"a wall already in the model ({all[i].Label}) lies under the point — a Ghost door or window is hosted only in a wall this build creates"
                 : null;
        }

        private static bool IsPoint(string kind) => kind == "door" || kind == "window" || kind == "column" || kind == "furniture";

        /// <summary>The elements, at most <paramref name="max"/> per changeset: every wall, floor and ceiling before any door,
        /// window, column or furniture, each in the order planned — the chunks run in this order inside one Undo, so an
        /// opening's host already exists when its chunk runs (the executor looks for hosts among all the model's walls).</summary>
        public static List<List<ChangesetElementDto>> Chunks(IReadOnlyList<ChangesetElementDto> els, int max = MaxElements)
        {
            var ordered = els.Where(e => !IsPoint(e.Kind)).Concat(els.Where(e => IsPoint(e.Kind))).ToList();
            var chunks = new List<List<ChangesetElementDto>>();
            for (int i = 0; i < ordered.Count; i += max) chunks.Add(ordered.Skip(i).Take(max).ToList());
            return chunks;
        }

        /// <summary>"Ghost Builder · plan · Level 1", with "(2/3)" when the build is several changesets.</summary>
        public static string Name(string drawing, string level, int i, int n) =>
            $"Ghost Builder · {(string.IsNullOrWhiteSpace(drawing) ? "drawing" : drawing.Trim())} · {level}" + (n > 1 ? $" ({i + 1}/{n})" : "");

        /// <summary>The POST /changesets/:key body (serialised with ChangesetClient.WriteJson: nulls left out).</summary>
        public static object Body(string name, string actor, IReadOnlyList<ChangesetElementDto> els) =>
            new { name, source = Source, actor, elements = els };

        /// <summary>An unbound model's changeset: the same elements with local guids and id, never filed — the executor runs it
        /// and stamps it as source dwg; no ledger row exists.</summary>
        public static ChangesetDto Local(string name, IReadOnlyList<ChangesetElementDto> els)
        {
            var cs = new ChangesetDto { Id = Guid.NewGuid().ToString(), Name = name, Source = Source, Status = "local" };
            foreach (var e in els)
            {
                e.ProposalGuid = Guid.NewGuid().ToString();
                cs.Elements.Add(e);
            }
            return cs;
        }

        private static string Clip(string s, int max) => s == null || s.Length <= max ? s : s.Substring(0, max - 1) + "…";
    }
}
