#nullable disable
// MA-6-4 Shell a Mass (C6, design §3.3 row 8) — the pure planner. ShellReader cuts the mass at each Building Story level and reads one
// straight-edged loop 10 mm above and 10 mm below each storey's levels; this plans, storey by storey, a typed wall on each edge of the
// bottom loop (base level to the next, inset by half its type's width so its exterior face lies on the mass face), a floor on the loop
// and one flat roof on the top face — ordinary create ghosts, filed as source promote (D2, D3). A storey that leans, whose section is not
// one loop, or one of whose elements the rules cannot type exactly is held whole, with why. No Revit types: tools/promote-check drives it.
//
// EXACT OR A PERSON (D3, D16). A type is the DD rule's exact answer at confidence 1, in the catalogue and loaded in this model. A mass has
// no thickness, so a {thickness} rule cannot answer: the office writes an exact-type rule under the same when.
//
// MA-6-5 FACADES (D4). With curtain, each wall's facts also carry its Facade (N/E/S/W, against True North), so a facade rule
// ({when: {level, params: {Facade}}}) may answer a curtain wall type: it is filed on the mass face (inset 0, its panels centred there).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Sentinel.GhostBuilder
{
    /// <summary>MA-6-4: what ShellReader read of one mass, on the API thread.</summary>
    public sealed class ShellFacts
    {
        public string MassUid, MassLabel;
        /// <summary>The storey levels the mass spans, lowest first: name and Level.Elevation (mm) — the executor's frame.</summary>
        public List<(string Name, double ElevationMm)> Levels = new List<(string, double)>();
        /// <summary>Storeys[i] = Levels[i]→Levels[i+1]: its section 10 mm above the bottom level and 10 mm below the top one (mm, plan), or
        /// why it was not read (Why ≠ null).</summary>
        public List<(List<double[]> Bottom, List<double[]> Top, string Why)> Storeys = new List<(List<double[]>, List<double[]>, string)>();
        /// <summary>How far the mass rises above the top level and reaches below the lowest (mm; about 0 when it ends at the level).</summary>
        public double RiseMm, BelowMm;
        /// <summary>The model's wall types by name (case-insensitive, a basic one first, as ResolveWallType picks): its kind and a basic one's width.</summary>
        public Dictionary<string, (string Kind, double WidthMm)> WallTypes = new Dictionary<string, (string, double)>(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> FloorTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase), RoofTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        /// <summary>MA-6-5: the project's True North angle (degrees, ProjectPosition.Angle) — each wall's Facade (N/E/S/W) is read against it.</summary>
        public double TrueNorthDeg;
    }

    public sealed class ShellPlan
    {
        /// <summary>The storeys filed: the bottom level's name and its walls and floor, as posted.</summary>
        public List<(string Storey, List<object> Elements)> Storeys = new List<(string, List<object>)>();
        /// <summary>The flat roof as posted, or null (held).</summary>
        public object Roof;
        /// <summary>What goes to a person: a storey, the roof, a step in the outline, the mass below the lowest level.</summary>
        public List<(string Name, string Reason)> Held = new List<(string, string)>();
        /// <summary>The elements filed.</summary>
        public int Count;
        /// <summary>The dialog's line per storey and the roof's.</summary>
        public List<string> Lines = new List<string>();
    }

    public static class ShellPlanner
    {
        /// <summary>The changeset's name starts with it (the review tells a shell from Promote by it).</summary>
        public const string Title = "Shell (DD)";
        /// <summary>The bridge's MAX_CHANGESET_ELEMENTS (changesets-logic.mjs).</summary>
        public const int MaxElements = 200;
        public const string Leans = "the mass leans in this storey — a person decides";
        public const string Thickness = "the rule names its type with {thickness} — a mass has no thickness; write an exact-type rule";
        /// <summary>ShellReader cuts each storey this far inside its two levels (mm).</summary>
        internal const double CutMm = 10;
        private const double TolMm = 2, MinWallMm = 10;

        /// <param name="curtain">MA-6-5: walls carry their Facade, and a curtain answer is filed (inset 0); off, 6-4's basic walls only.</param>
        public static ShellPlan Plan(ShellFacts f, GuidelineMatcher m, bool curtain = false)
        {
            var p = new ShellPlan();
            int n = f.Storeys.Count;
            if (n == 0 || f.Levels.Count != n + 1)
            {
                const string none = "the mass spans no storey — two Building Story levels must meet it; add them (Datum) or a person decides";
                p.Held.Add(("storeys", none));
                p.Lines.Add("Storeys: held — " + none);
                return p;
            }
            if (f.BelowMm > TolMm)
                p.Held.Add(($"below {f.Levels[0].Name}", $"the mass reaches {Mm(f.BelowMm)} mm below {f.Levels[0].Name} — no level there; add one (Datum) or a person decides"));
            bool roofAtTop = f.RiseMm <= TolMm;
            var filed = new bool[n];
            for (int i = 0; i < n; i++)
            {
                string a = f.Levels[i].Name, b = f.Levels[i + 1].Name;
                double z = f.Levels[i].ElevationMm, gap = f.Levels[i + 1].ElevationMm - z;
                var whys = new List<string>();
                var bottom = Clean(f.Storeys[i].Bottom);
                var walls = new List<object>();
                object floor = null;
                // MA-6-4 review: two levels within the reader's two cuts are no storey — its cuts cross, and the executor refuses a 0 mm wall.
                if (gap <= 2 * CutMm) whys.Add($"{a} and {b} are {Mm(gap)} mm apart — not a storey; a person decides");
                else if (f.Storeys[i].Why != null) whys.Add(f.Storeys[i].Why);
                else if (!Same(bottom, f.Storeys[i].Top)) whys.Add(Leans);
                // MA-6 amendment 5: no (i/n) parts — walls in a second part would read the first part's as existing and not join them. The
                // storey's walls and floor only (the amendment's count); a roof that does not fit with them is held on its own, below.
                else if (bottom.Count + 1 > MaxElements)
                    whys.Add($"{bottom.Count} walls and a floor are {bottom.Count + 1} elements — more than one changeset holds; a person decides");
                else
                {
                    // One untypable element holds its whole storey (a partial storey leaves gaps), with every reason.
                    // MA-6-5: with curtain, each wall's facts carry its Facade too — the side its edge faces against True North.
                    var wallFacts = Enumerable.Range(0, bottom.Count).Select(k => curtain
                        ? new Dictionary<string, string> { ["Location"] = "Exterior", ["Facade"] = Facade(bottom[k], bottom[(k + 1) % bottom.Count], f.TrueNorthDeg) }
                        : new Dictionary<string, string> { ["Location"] = "Exterior" }).ToList();
                    string Basic(string type) => !f.WallTypes.TryGetValue(type, out var wt) ? NotLoaded(type)
                        : wt.Kind == "Basic" || curtain && wt.Kind == "Curtain" ? null
                        : $"\"{type}\" is a {wt.Kind.ToLowerInvariant()} wall type — Sentinel places basic " + (curtain ? "and curtain walls only" : "walls only");
                    var types = new List<(string Type, string Used)>();
                    for (int k = 0; k < bottom.Count; k++)
                    {
                        var t = TypeOf(m, "Walls", a, wallFacts[k], Basic, out var why, out var used);
                        types.Add((t, used));
                        if (why != null) whys.Add("walls: " + why);
                    }
                    var floorFacts = new Dictionary<string, string> { ["Function"] = "Interior" };
                    var ft = TypeOf(m, "Floors", a, floorFacts, t => f.FloorTypes.Contains(t) ? null : NotLoaded(t), out var floorWhy, out var floorUsed);
                    if (floorWhy != null) whys.Add("floor: " + floorWhy);
                    // D3: each wall's centreline inset by half its type's width, mitred at the corners — its exterior face on the mass face.
                    // MA-6-5 (D4): a curtain wall's line is the mass face itself (inset 0), its panels centred there.
                    var inset = whys.Count == 0 ? types.Select(t => f.WallTypes[t.Type].Kind == "Curtain" ? 0 : f.WallTypes[t.Type].WidthMm / 2).ToList() : null;
                    var line = inset == null ? null : Inset(bottom, inset);
                    if (line != null) whys.AddRange(InsetFaults(bottom, line));
                    if (whys.Count == 0)
                    {
                        for (int k = 0; k < bottom.Count; k++)
                        {
                            var s = line[k]; var e = line[(k + 1) % bottom.Count];
                            walls.Add(new
                            {
                                op = "create", kind = "wall",
                                place = new { BaseLevel = a, TopLevel = b, TypeName = types[k].Type, LocationCurve = new { start = new[] { s[0], s[1], z }, end = new[] { e[0], e[1], z } } },
                                facts = new { @params = wallFacts[k] },
                                reason = Clip($"Shell of {f.MassLabel} · {a}→{b} · rule {types[k].Used} → {types[k].Type}, inset {Mm(inset[k])} mm", 500),
                                validate = new { identity = new { Class = "IFCWALL", Name = $"Shell {a} W{k + 1}" } },
                            });
                        }
                        floor = new
                        {
                            op = "create", kind = "floor",
                            place = new { LevelName = a, TypeName = ft, LocationLoop = bottom.Select(q => new[] { q[0], q[1], z }).ToList() },
                            facts = new { @params = floorFacts },
                            reason = Clip($"Shell of {f.MassLabel} · floor on {a} · rule {floorUsed} → {ft}", 500),
                            validate = new { identity = new { Class = "IFCSLAB", Name = $"Shell {a} floor" } },
                        };
                    }
                }
                if (whys.Count > 0)
                {
                    var reason = string.Join("; ", whys.Distinct());
                    p.Held.Add(($"{a} storey", reason));
                    p.Lines.Add($"{a}→{b}: held — {reason}");
                    continue;
                }
                filed[i] = true;
                p.Storeys.Add((a, walls.Append(floor).ToList()));
                p.Count += walls.Count + 1;
                p.Lines.Add($"{a}→{b}: {walls.Count} walls · floor · filed");
            }
            // A step above a filed storey: its top is not the next storey's bottom (read), whatever became of that storey — never a silent
            // gap. MA-6-4 review: in or out (a terrace or an overhang's underside), said in words true both ways. ponytail: no containment
            // test to tell which; add one if a person needs "steps in" said apart.
            for (int i = 0; i + 1 < n; i++)
                if (filed[i] && f.Storeys[i + 1].Bottom != null && !Same(f.Storeys[i].Top, f.Storeys[i + 1].Bottom))
                    p.Held.Add(($"{f.Levels[i + 1].Name} step", $"the mass changes outline at {f.Levels[i + 1].Name} (a step in or out) — what covers the difference is not shelled; a person decides"));

            // The roof: on the top level, over the top storey's top face — only at the mass top and only with the top storey filed.
            string top = f.Levels[n].Name, roofHeld;
            if (!roofAtTop) roofHeld = $"the mass rises {Mm(f.RiseMm)} mm above {top} — no level there; add one (Datum) or a person decides";
            else if (!filed[n - 1]) roofHeld = $"its storey {f.Levels[n - 1].Name}→{top} is held — a person decides";
            // MA-6-4 review: the roof files with the top storey (Bodies) — a top storey of exactly MaxElements leaves it no room.
            else if (p.Storeys[p.Storeys.Count - 1].Elements.Count + 1 > MaxElements)
                roofHeld = $"the roof does not fit the top storey's changeset ({MaxElements} elements) — a person decides";
            else
            {
                var roofFacts = new Dictionary<string, string> { ["Family"] = "Basic Roof" };
                var rt = TypeOf(m, "Roofs", top, roofFacts, t => f.RoofTypes.Contains(t) ? null : NotLoaded(t), out roofHeld, out var roofUsed);
                if (roofHeld == null)
                {
                    p.Roof = new
                    {
                        op = "create", kind = "roof",
                        place = new { LevelName = top, TypeName = rt, Boundary = Clean(f.Storeys[n - 1].Top).Select(q => new[] { q[0], q[1] }).ToList(), BaseOffset = 0.0 },
                        facts = new { @params = roofFacts },
                        reason = Clip($"Shell of {f.MassLabel} · flat roof on {top} · rule {roofUsed} → {rt}", 500),
                        validate = new { identity = new { Class = "IFCROOF", Name = $"Shell {top} roof" } },
                    };
                    p.Count++;
                    p.Lines.Add($"Roof on {top}: filed");
                    return p;
                }
            }
            p.Held.Add(("roof", roofHeld));
            p.Lines.Add($"Roof: held — {roofHeld}");
            return p;
        }

        // The DD rule's exact answer for these facts, in the catalogue and loaded in this model (loaded(type) = why not, or null) — else null
        // and why. `used` names the facts the rule matched ("Location Exterior").
        private static string TypeOf(GuidelineMatcher m, string category, string level, Dictionary<string, string> ps, Func<string, string> loaded, out string why, out string used)
        {
            var r = m.Resolve(new GuidelineInput { Category = category, Level = level, Params = ps });
            used = PromoteWallsPlanner.What(ps, r.Matched);
            why = r.Source != "rule" ? $"no DD rule for {used} in {m.Standard}" + (r.Source == "default" ? " (its default is not an exact answer)" : "")
                : string.IsNullOrWhiteSpace(r.Type) ? Thickness
                : r.Confidence != 1 ? m.Gap($"{category} on {level} ({used})", r.Why)
                : loaded(r.Type);
            return why == null ? r.Type : null;
        }

        private static string NotLoaded(string type) => $"\"{type}\" is in the catalogue but not loaded in this model — Sentinel creates no types";

        /// <summary>The POST /changesets/:key bodies (D2, R13): every element in one changeset when the shell has at most
        /// <paramref name="max"/> — one review, one Undo; else one per storey, the roof with the top storey. Source promote, never a
        /// pre-tick (the bridge pre-ticks no create). The held rows ride on the first body, named by the mass; with nothing to file there
        /// is no body, and they are said in the dialog only.</summary>
        public static List<object> Bodies(ShellPlan p, ShellFacts f, string actor, int max = MaxElements)
        {
            var bodies = new List<object>();
            if (p.Count == 0) return bodies;
            var held = p.Held.Select(h => (object)new { unique_id = f.MassUid, name = Clip(h.Name, 256), reason = Clip(h.Reason, 300) }).ToList();
            string name = $"{Title} · {f.MassLabel}";
            var roof = p.Roof == null ? new List<object>() : new List<object> { p.Roof };
            if (p.Count <= max)
            {
                bodies.Add(new { name, source = "promote", actor, elements = p.Storeys.SelectMany(s => s.Elements).Concat(roof).ToList(), exceptions = held.Count == 0 ? null : held });
                return bodies;
            }
            for (int i = 0; i < p.Storeys.Count; i++)
                bodies.Add(new
                {
                    name = $"{name} · {p.Storeys[i].Storey}", source = "promote", actor,
                    elements = p.Storeys[i].Elements.Concat(i == p.Storeys.Count - 1 ? roof : new List<object>()).ToList(),
                    exceptions = i == 0 && held.Count > 0 ? held : null,
                });
            return bodies;
        }

        /// <summary>A loop as the planner reads it (mm, plan): a closing point and repeats dropped, a vertex within 0.01 mm of the line
        /// through its neighbours merged, clockwise (D3: the exterior then faces out).</summary>
        internal static List<double[]> Clean(List<double[]> loop)
        {
            var pts = (loop ?? new List<double[]>()).Where(q => q != null && q.Length >= 2).Select(q => new[] { q[0], q[1] }).ToList();
            for (int i = pts.Count - 1; i > 0; i--) if (Dist(pts[i], pts[i - 1]) <= 0.01) pts.RemoveAt(i);
            if (pts.Count > 1 && Dist(pts[0], pts[pts.Count - 1]) <= 0.01) pts.RemoveAt(pts.Count - 1);
            for (bool merged = true; merged && pts.Count > 3;)
            {
                merged = false;
                for (int i = 0; i < pts.Count && !merged; i++)
                {
                    double[] a = pts[(i + pts.Count - 1) % pts.Count], b = pts[i], c = pts[(i + 1) % pts.Count];
                    double dx = c[0] - a[0], dy = c[1] - a[1], len2 = dx * dx + dy * dy;
                    if (len2 < 1e-12) continue;
                    double off = Math.Abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0])) / Math.Sqrt(len2), t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / len2;
                    if (off <= 0.01 && t > 0 && t < 1) { pts.RemoveAt(i); merged = true; }
                }
            }
            double area2 = 0;
            for (int i = 0; i < pts.Count; i++) { var q = pts[i]; var r = pts[(i + 1) % pts.Count]; area2 += q[0] * r[1] - r[0] * q[1]; }
            if (area2 > 0) pts.Reverse(); // counter-clockwise (shoelace) → clockwise
            return pts;
        }

        /// <summary>MA-6-5: the side the edge a→b of a clockwise loop faces, as a compass letter. Its exterior normal is its left normal
        /// (-dy, dx); turned by True North (counter-clockwise positive, as ProjectPosition.Angle reads — drill C-1 checks the sign; if south
        /// lands on the wrong face, negate it here), its bearing clockwise from north is N [315, 45), E [45, 135), S [135, 225) or
        /// W [225, 315): half-open, so 45° is E (rounded to 1e-6°, so a rotation's float noise never moves a tie).</summary>
        internal static string Facade(double[] a, double[] b, double trueNorthDeg)
        {
            double nx = a[1] - b[1], ny = b[0] - a[0], t = trueNorthDeg * Math.PI / 180;
            double x = nx * Math.Cos(t) - ny * Math.Sin(t), y = nx * Math.Sin(t) + ny * Math.Cos(t);
            double deg = Math.Round((Math.Atan2(x, y) * 180 / Math.PI + 360) % 360, 6) % 360;
            return deg >= 315 || deg < 45 ? "N" : deg < 135 ? "E" : deg < 225 ? "S" : "W";
        }

        /// <summary>S-2: the same loop — as many vertices after Clean, each within <paramref name="tolMm"/> of one of the other's, both ways
        /// (MA-6-4 review: two close vertices of one loop never both match one of the other's and leave one of its vertices untested).</summary>
        internal static bool Same(List<double[]> a, List<double[]> b, double tolMm = TolMm)
        {
            a = Clean(a); b = Clean(b);
            return a.Count >= 3 && a.Count == b.Count && a.All(q => b.Any(r => Dist(q, r) <= tolMm)) && b.All(r => a.Any(q => Dist(q, r) <= tolMm));
        }

        /// <summary>MA-6-4 review: why an inset loop cannot be walled, or none — an edge that came back reversed or under 10 mm (shorter than
        /// its corners' insets need: its wall would face inward, or Wall.Create throws and the executor declines the whole changeset), else two
        /// walls that meet or cross (the mass narrower there than its walls). ponytail: walls back to back (a neck between one and two wall
        /// widths) are not caught — their centrelines stay apart; a width-aware test that spares a short edge's corners if it matters.</summary>
        internal static List<string> InsetFaults(List<double[]> cw, List<double[]> line)
        {
            int n = cw.Count;
            var why = new List<string>();
            for (int k = 0; k < n; k++)
            {
                double[] a = cw[k], b = cw[(k + 1) % n], s = line[k], e = line[(k + 1) % n];
                if ((e[0] - s[0]) * (b[0] - a[0]) + (e[1] - s[1]) * (b[1] - a[1]) <= 0 || Dist(s, e) < MinWallMm)
                    why.Add($"edge {k + 1} ({Mm(Dist(a, b))} mm) is shorter than its walls' corners need — a person decides");
            }
            for (int j = 0; j < n && why.Count == 0; j++)
                for (int k = j + 2; k < n && why.Count == 0; k++)
                    if ((k + 1) % n != j && SegDist(line[j], line[(j + 1) % n], line[k], line[(k + 1) % n]) < MinWallMm)
                        why.Add($"the walls on edges {j + 1} and {k + 1} meet or cross — the mass is narrower there than its walls; a person decides");
            return why;
        }

        private static double SegDist(double[] p, double[] q, double[] r, double[] s)
        {
            static double Cross(double[] o, double[] a, double[] b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
            if (Cross(p, q, r) * Cross(p, q, s) < 0 && Cross(r, s, p) * Cross(r, s, q) < 0) return 0; // they cross
            static double To(double[] x, double[] a, double[] b)
            {
                double dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
                double t = len2 < 1e-12 ? 0 : Math.Max(0, Math.Min(1, ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / len2));
                return Dist(x, new[] { a[0] + t * dx, a[1] + t * dy });
            }
            return Math.Min(Math.Min(To(p, r, s), To(q, r, s)), Math.Min(To(r, p, q), To(s, p, q)));
        }

        /// <summary>D3: a clockwise loop's edges each moved to their right (the inside) by their own offset, consecutive lines met at their
        /// intersection (mitred): vertex i is where edge i-1 and edge i meet.</summary>
        internal static List<double[]> Inset(List<double[]> cw, IReadOnlyList<double> offsetsMm)
        {
            int n = cw.Count;
            (double[] P, double[] D) Edge(int i)
            {
                double[] a = cw[i], b = cw[(i + 1) % n];
                double dx = b[0] - a[0], dy = b[1] - a[1], len = Math.Sqrt(dx * dx + dy * dy), o = offsetsMm[i];
                dx /= len; dy /= len;
                return (new[] { a[0] + dy * o, a[1] - dx * o }, new[] { dx, dy });
            }
            var pts = new List<double[]>();
            for (int i = 0; i < n; i++)
            {
                var (p1, d1) = Edge((i + n - 1) % n);
                var (p2, d2) = Edge(i);
                double den = d1[0] * d2[1] - d1[1] * d2[0];
                if (Math.Abs(den) < 1e-12) { pts.Add(p2); continue; } // parallel neighbours: Clean merges them, so only a hairpin lands here
                double t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
                pts.Add(new[] { p1[0] + d1[0] * t, p1[1] + d1[1] * t });
            }
            return pts;
        }

        private static double Dist(double[] a, double[] b) => Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
        private static string Mm(double v) => v.ToString("0.#", CultureInfo.InvariantCulture);
        private static string Clip(string s, int max) => s == null || s.Length <= max ? s : s.Substring(0, max - 1) + "…";
    }
}
