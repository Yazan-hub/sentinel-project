#nullable disable
// MA-1a step 2 (design §2.4 step 2): Ghost Builder files its reviewed rows as changesets with source "dwg", and
// ChangesetExecutor places them — this is the pure half. The changeset element each Ghost row becomes (millimetres, absolute
// elevations, exact type names), the chunks the bridge's 200-element cap allows (hosts before what they host), the POST
// body, and the local changeset an unbound model runs through the same executor without a ledger. No Revit API, so
// tools/promote-check proves it offline against the bridge's fixture (ghost-dwg-body.json); the Revit half is
// GhostChangesetBuild.
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

        /// <summary>A wall's base and top in absolute mm, as the executor reads them: the CAD Z is the wall's offset from the
        /// build level (Ghost's rule since P1), and its height is CAD top − CAD base (10 ft when the drawing has none), at
        /// least ten times Revit's short-curve tolerance.</summary>
        public static (double Base, double Top) WallElevations(double levelMm, double cadBaseFt, double cadTopFt, double tolFt)
        {
            double b = levelMm + cadBaseFt * FtToMm;
            return (b, b + Math.Max(cadTopFt - cadBaseFt, tolFt * 10) * FtToMm);
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
                Mid = mid == null ? null : new[] { mid[0], mid[1], z },
            };
        }

        // Each element is named "<layer> #<n>" (n counts this build's elements of that layer) and says where it came from.
        private static ChangesetElementDto Create(string kind, string layer, int n, string typedBy, PlaceDto place) => new ChangesetElementDto
        {
            Kind = kind, Op = "create",
            Reason = Clip($"Ghost Builder: {kind} on layer {layer}" + (typedBy == null ? "" : $", typed by the {typedBy}"), 500),
            Validate = new ValidateDto { Identity = new IdentityDto { Class = Kinds.Values.First(k => k.Kind == kind).Ifc, Name = Clip($"{layer} #{n}", 256) } },
            Place = place,
        };

        /// <param name="typedBy">"guideline", "mapping" or "reviewer" (ElementPlacementFactory.ResolveWallType).</param>
        public static ChangesetElementDto Wall(string layer, int n, string typedBy, string typeName, string level, CurveDto run, double baseMm, double topMm) =>
            Create("wall", layer, n, typedBy, new PlaceDto { TypeName = typeName, LevelName = level, LocationCurve = run, BaseElevation = baseMm, TopElevation = topMm });

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
        /// hosted by the one wall under the point, a column or furniture stands unhosted.</summary>
        public static ChangesetElementDto Point(string kind, string layer, int n, string family, string typeName, string level,
                                                double x, double y, double levelMm) =>
            Create(kind, layer, n, null, new PlaceDto { FamilyName = family, TypeName = typeName, LevelName = level, Location = new[] { x, y, levelMm } });

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
