#nullable disable
// MA-1a step 2 (design §2.4 step 2, §7.2 MA-1 (1a) item 2): Ghost Builder places through ChangesetExecutor — one placement
// path, one ledger row format, one provenance stamp, one undo watcher. Build plans the reviewed rows into changeset elements
// with exact names (GhostFiling), files them as changesets with source "dwg" (a model not bound to a web project runs the
// same executor on a local changeset, with no ledger), and runs them. MA-3b7 (XC-3): a dry run first on Revit's thread (the types
// proved and the plan made inside a group rolled back), the filing on a pool thread, then the build in a second event in the
// model it started from (DocPin). The build itself happens inside ONE TransactionGroup,
// assimilated into one Undo entry named as the first changeset's transaction, so the undo watcher posts changeset_reverted:
//   1. "Ghost Builder - types": the families and types the rows need — the preloader, the wall and floor provisioners and
//      the guideline's sizes cloned at the measured thickness (Ghost's own type stage; the executor creates none);
//   2. each changeset's executor transaction — all or nothing, the commit checked, every element stamped;
//   3. "Ghost Builder - parameters": the values the project's documents gave each layer (P2; A7: a type only if this
//      build added it).
// Before filing, the plan turns into named gaps whatever the executor would refuse by rule (a missing or ambiguous type, a
// placeholder name, a door or window with no single straight wall of this build within half its thickness (MA-1b, GHB-1: a
// block is read with its angle, moved onto its wall's line and filed with place.Rotation), a family of the wrong kind or host, a run
// too short to be a wall, a wall with no Building Story above it and no storey below — MA-1a item 3), so one bad row is not
// a whole-build decline. The type rules are the executor's own (B7). Whatever
// Revit itself refuses still rolls the whole group back: nothing is left — no element, no type, no family. Every
// transaction of the build counts Revit's warnings and rolls back on any error (B1). API thread only
// (GhostBuilderPlacementEvent).
// MA-1a item 5: when the ruleset has a BLOCK rule, the build is scanned before step 1 and again after step 3 (the documents'
// values included), with the group still open; if it adds BLOCK rows the person is asked "This batch will block your sync: N
// element(s)" — Go back abandons the build (nothing placed, filed changesets withdrawn) and the review stays open.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Commands;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public static class GhostChangesetBuild
    {
        public sealed class Request
        {
            public Document Doc;
            public List<GhostElement> Elements;
            /// <summary>The ticked rows, as the review emitted them (copies with the reviewer's picks).</summary>
            public MappingResult Mapping;
            /// <summary>The review's level; -1 or a level no longer in the model = the lowest level, said in the summary.</summary>
            public long LevelId = -1;
            public GuidelineMatcher Guideline;
            /// <summary>The Ghost family library, or null (no preload).</summary>
            public string LibraryDir;
            /// <summary>The web project's key; "" = not bound — the executor runs a local changeset and nothing is filed.</summary>
            public string Key = "";
            /// <summary>The drawing's name, for the changeset names.</summary>
            public string Drawing;
            /// <summary>MA-1a item 3: the DWG import's own Z (ft) — the drawing's Z is read from it (GhostFiling.WallBase).</summary>
            public double ImportZFt;
            /// <summary>MA-1a item 4: the drawing file's sha256 when this run imported it; null when the import was already in the
            /// model (it may be older than the file — GHB-3) or was picked from the model (no file).</summary>
            public string SourceSha256;
            /// <summary>MA-1a item 4: the guideline and layers standards as the review header names them (artefact labels).</summary>
            public string GuidelineLabel, LayersLabel;
            /// <summary>MA-1a item 8: what the command's reader did — its time, its model calls, what it was given — for the
            /// run's build:run receipt; null = no receipt.</summary>
            public BuildReceipt.Facts Reader;
        }

        private const double FtToMm = 304.8;

        // One planned element: its changeset element, the reviewed row it came from, and what it is in words. MA-3b7: public —
        // event A's plan rides to event B in Prepared.
        public sealed class Planned
        {
            public ChangesetElementDto Dto;
            public LayerMapping Map;
            public string What;
        }

        // FAMILY_HOSTING_BEHAVIOR's values, as words (B5).
        private static readonly string[] HostedBy = { "unhosted", "wall-hosted", "floor-hosted", "ceiling-hosted", "roof-hosted", "face-hosted" };

        /// <summary>MA-3b7: what event A (the dry run) learned — the plan in filing order, its chunks, names and bodies, and the report
        /// so far (A's warnings, gaps and CreatedTypes, which describe what event B creates again).</summary>
        public sealed class Prepared
        {
            public Request R; public Document Doc; public Level Level; public double LevelMm;
            public MappingResult Mapping; public List<GhostElement> Elements; public Dictionary<string, LayerMapping> ByLayer;
            public List<Planned> Plan; public List<List<ChangesetElementDto>> Chunks;
            /// <summary>GhostFiling.Body per chunk, or null when the model is not bound.</summary>
            public List<object> Bodies;
            public List<string> Names;
            public bool Bound; internal BcfConfig Cfg; public GhostPlacementEngine.PlacementReport Report; // Cfg internal: BcfConfig is internal
            /// <summary>A refused: event B never runs.</summary>
            public bool Refused => Report.NotBuilt != null;
        }

        /// <summary>MA-3b7: what the pool thread filed. NotFiled null = every chunk filed; else its words, and Ledger says what was withdrawn.</summary>
        public sealed class Filed { public List<ChangesetDto> Changesets; public string NotFiled; public string Ledger; }

        private const string localLedger = "Ledger: none — this model is not bound to a web project (Project Setup binds it); the build ran " +
                                           "through the changeset executor as a local changeset (source dwg, stamped), as one Undo step.";
        private const string noLedger = "Ledger: none — this model is not bound to a web project; nothing was filed.";

        /// <summary>MA-3b7 event A (Revit's thread): the checks, the types proved and the build planned — inside a group that is ALWAYS
        /// rolled back before this returns (a dry run: nothing is left in the model). A refusal fills Report.NotBuilt.</summary>
        public static Prepared Prepare(UIApplication app, Request r)
        {
            var report = new GhostPlacementEngine.PlacementReport();
            var prep = new Prepared { R = r, Report = report };
            var doc = r.Doc;
            prep.Doc = doc;
            if (DocPin.Check(app, doc, "build from the drawing") is { } refusal) { report.NotBuilt = refusal; return prep; }
            // MA-1a item 6: never into a design option — said before anything is read, typed or filed.
            if (PlacementApply.DesignOptionRefusal(doc, "build") is { } inOption) { report.NotBuilt = inOption; return prep; }
            var rows = (r.Mapping?.Mappings ?? new List<LayerMapping>())
                .Where(m => m != null && !m.Ignore && !string.IsNullOrWhiteSpace(m.CadLayer)).ToList();
            if (rows.Count == 0) { report.NotBuilt = "Nothing was built — no layer was ticked."; return prep; }
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
            if (levels.Count == 0) { report.NotBuilt = "Nothing was built — the model has no level."; return prep; }
            var level = r.LevelId >= 0 ? doc.GetElement(r.LevelId.ToElementId()) as Level : null;
            if (level == null)
            {
                if (r.LevelId >= 0) report.Warnings.Add($"Chosen level no longer exists — built on {levels[0].Name} instead.");
                level = levels[0];
            }

            var mapping = new MappingResult { Mappings = rows };
            var byLayer = rows.GroupBy(m => m.CadLayer, StringComparer.OrdinalIgnoreCase)
                              .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase); // the first row wins, as before
            // The drawn faces of each wall become one centreline with its measured thickness (unchanged from the old Build).
            var elements = GhostWallPairer.PairWalls(r.Elements, mapping);
            bool bound = !string.IsNullOrEmpty(r.Key);
            var cfg = bound ? BcfConfig.Load() : null;
            double tolFt = doc.Application.ShortCurveTolerance, levelMm = level.Elevation * FtToMm;
            prep.Level = level; prep.LevelMm = levelMm; prep.Mapping = mapping; prep.ByLayer = byLayer; prep.Elements = elements;
            prep.Bound = bound; prep.Cfg = cfg;

            // MA-3b7: a dry run — the types proved and the build planned inside a group that is rolled back before the filing (a group cannot wait for the bridge); event B creates the types again, inside the build's own Undo.
            using var group = new TransactionGroup(doc, "Ghost Builder");
            group.Start();
            // F-S2-1: a TransactionGroup can force modal failure handling on every transaction finished inside it, whatever that
            // transaction's own options say (TransactionGroup.IsFailureHandlingForcedModal; its default is undocumented — drill
            // MA1a-S2's blocking "N Warnings" OK/Cancel dialog says it was on). Off, each inner transaction's
            // SetForcedModalHandling(false) holds: the warnings Revit keeps show in its non-blocking box, as step 1's did (S1-8).
            // No error reaches a dialog — the all-or-nothing preprocessor rolls each one back first, so no inner commit is left
            // Pending inside the group.
            group.IsFailureHandlingForcedModal = false;

            // Nothing was filed yet (MA-3b7: the filing follows the dry run): roll the group back, the types too — nothing to withdraw.
            Prepared Abandon(string line)
            {
                SentinelUndo.RollBack(group, doc);
                report.NotBuilt = line;
                return prep;
            }

            try
            {
                // ── 1. The families and types the reviewed rows need, before anything is filed (founder decision F4) ──────────
                // MA-1b (E17, review amendment C2): block inserts on a row that is not Doors or Windows, per layer — not placed.
                // Declared before the walls are typed: a block on a Walls row is set aside there too (review 2026-10-03), never
                // a silent SkippedNoGeometry.
                var otherBlocks = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                void SetAside(GhostElement el) => otherBlocks[el.CadLayer] = otherBlocks.TryGetValue(el.CadLayer, out int soFar) ? soFar + 1 : 1;
                string DrawnAs(GhostElement el) => el.Block == null ? ""
                    : $"block{(string.IsNullOrWhiteSpace(el.Block.Name) ? "" : " " + el.Block.Name.Trim())}{(el.LocationPoint == null ? "" : $" at ({el.LocationPoint.X * FtToMm:0}, {el.LocationPoint.Y * FtToMm:0})")}: ";
                // Review amendment C5: a block that holds blocks (a bound xref, a "doors" group) is ONE point here — said on every
                // ticked row (review 2026-10-03), not only on a Doors or Windows row.
                void NoteNested(string what, GhostElement el)
                {
                    if (el.Block?.Nested > 0)
                        report.Warnings.Add($"{what}: {DrawnAs(el)}it holds {el.Block.Nested} block(s) inside it — read as ONE block, not as {el.Block.Nested} doors or windows.");
                }
                var types = TypesStep(doc, r, mapping, elements, byLayer, level, report, NoteNested, SetAside);
                if (types.RolledBack != null) return Abandon(types.RolledBack);
                var typer = types.Typer;
                var walls = types.Walls;
                // B7: the executor's own type rules for the floors and ceilings below (TypesStep asks them for the walls).
                var resolvable = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                string Refusal(string key, Action check)
                {
                    if (resolvable.Contains(key)) return null;
                    try { check(); resolvable.Add(key); return null; }
                    catch (InvalidOperationException ex) { return ex.Message; }
                }

                // ── 2. What each reviewed element becomes — reads only; a refusal by rule is a named gap, never a filing ──────
                var plan = new List<Planned>();
                var straight = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>(); // this build's straight walls (mm)
                // MA-1b (GHB-1): half of each one's thickness (mm), index for index with `straight` — half its TYPE's width: what
                // the wall will be, also for a wall drawn as one line (no measured thickness).
                var halves = new List<double>();
                // MA-1b (F4 B): the doors and windows already planned, by kind and moved point — a second block within 1 mm of
                // one is a duplicate in the drawing, named and not filed (Revit refuses two identical doors at one point).
                var hostedAt = new List<(string Kind, double X, double Y, string What)>();
                var widths = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                var arcs = new List<Curve>();                                                                         // this build's curved walls (ft)
                var seq = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                int Next(string layer) => seq[layer] = seq.TryGetValue(layer, out int k) ? k + 1 : 1;
                // MA-1a item 4: what the stamp records beyond the layer (GhostFiling) — the rule that typed it and the drawing's sha.
                ChangesetElementDto Prov(ChangesetElementDto dto, LayerMapping map, string typedBy)
                {
                    dto.Provenance.Rule = GhostFiling.Rule(typedBy, map.Source, r.GuidelineLabel, r.LayersLabel);
                    dto.Provenance.SourceSha256 = r.SourceSha256;
                    return dto;
                }

                // MA-1a item 3 (GHB-2): each wall's top is the executor's next-story rule, checked here, so a wall it would refuse is a
                // named gap, never a whole-build decline; one line per answer says where the walls go. C6: the executor's own
                // reading of the model's levels.
                var stories = ChangesetExecutor.Stories(doc);
                var tops = new HashSet<string>();
                foreach (var (el, map, type, typedBy) in walls)
                {
                    double baseMm = GhostFiling.WallBase(levelMm, el.BaseElevation, r.ImportZFt);
                    var top = PromoteWallsPlanner.WallTop(stories, baseMm, level.Name, out string topWhy);
                    if (top == null)
                    {
                        report.WallGaps++;
                        report.Warnings.Add($"Walls on '{el.CadLayer}': {topWhy}; skipped.");
                        continue;
                    }
                    // Final review: a wall drawn below the build level would rise only to the build level itself — a named gap,
                    // said once per layer and distance, never filed (a stub, or a height Revit refuses, which declines the build).
                    if (GhostFiling.BelowLevelGap(level.Name, levelMm, baseMm, top.Value.TopLevel) is string below)
                    {
                        report.WallGaps++;
                        tops.Add($"Walls on '{el.CadLayer}': {below}; skipped.");
                        continue;
                    }
                    tops.Add(top.Value.TopLevel != null
                        ? $"Walls on {level.Name} rise to {top.Value.TopLevel}, the next Building Story above; their tops are attached to it (GHB-2)."
                        : $"Walls on {level.Name}: no Building Story above — unconnected, {top.Value.TopMm - baseMm:0} mm high, the storey below's height (founder decision F2).");
                    var runs = el.LocationCurve != null && el.LocationCurve.IsBound ? new List<Curve> { el.LocationCurve }
                             : (el.LocationLoop ?? new List<Curve>()).Where(c => c != null && c.IsBound).ToList();
                    int filedRuns = 0;
                    foreach (var c in runs)
                    {
                        if (!(c is Line) && !(c is Arc)) continue;
                        XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1), m = c is Arc ? c.Evaluate(0.5, true) : null;
                        var run = GhostFiling.Run(new[] { a.X * FtToMm, a.Y * FtToMm }, new[] { b.X * FtToMm, b.Y * FtToMm },
                                                  m == null ? null : new[] { m.X * FtToMm, m.Y * FtToMm }, baseMm, tolFt * FtToMm);
                        if (run == null) continue;
                        int n = Next(el.CadLayer);
                        plan.Add(new Planned { Map = map, What = $"Walls on '{el.CadLayer}'", Dto = Prov(GhostFiling.Wall(el.CadLayer, n, typedBy, type, level.Name, run, baseMm), map, typedBy) });
                        if (m == null)
                        {
                            straight.Add(($"{el.CadLayer} #{n} (this build)", level.Name, run.Start[0], run.Start[1], run.End[0], run.End[1]));
                            if (!widths.TryGetValue(type, out double width)) widths[type] = width = ChangesetExecutor.ResolveWallType(doc, type).Width * FtToMm;
                            halves.Add(width / 2);
                        }
                        else arcs.Add(c);
                        filedRuns++;
                        if (typedBy == "guideline") report.WallsByGuideline++;
                        else if (typedBy == "reviewer") report.WallsByReviewer++;
                        else report.WallsByMapping++;
                    }
                    if (filedRuns == 0) report.SkippedNoGeometry++;
                }
                report.Warnings.AddRange(tops);

                // The executor's own host rule, checked before filing: the one straight basic wall under the point, among the
                // model's and this build's — and no curved, curtain or stacked wall passing it. B2 (F9 A): only a wall this
                // build creates may host; one already in the model under the point is a named gap.
                var (_, odd, docLines) = ChangesetExecutor.HostWalls(doc);
                string HostProblem(double x, double y)
                {
                    var near = ChangesetExecutor.OddNear(odd, level.Id, x, y);
                    if (near != null) return $"a curved, curtain or stacked wall (wall {near.Id.IdValue()}) passes the point — Sentinel hosts a door or window in one straight basic wall only";
                    if (arcs.Any(c => c.Distance(new XYZ(x / FtToMm, y / FtToMm, c.GetEndPoint(0).Z)) <= PlacementGeometry.HostTolMm / FtToMm))
                        return "a curved wall of this build passes the point — Sentinel hosts a door or window in one straight basic wall only";
                    return GhostFiling.HostGap(docLines, straight, level.Name, x, y);
                }

                foreach (var el in elements)
                {
                    if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map)) continue; // a layer nobody ticked
                    if (string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue; // planned above
                    if (!GhostFiling.Kinds.TryGetValue(map.Category ?? "", out var k))
                    {
                        report.Warnings.Add($"Category '{map.Category}' (layer '{el.CadLayer}') not handled at LOD 200; skipped.");
                        continue;
                    }
                    string what = $"{map.Category} on '{el.CadLayer}'";
                    NoteNested(what, el);
                    // MA-1b (E17, review amendment C2): a block on a row that is not Doors or Windows is not placed — the middle
                    // of what it draws along its X axis is no family's origin, and its angle would be lost. Counted per layer and
                    // named after the loop. Before MA-1b such a block gave no element where it stands: nothing placed is lost.
                    if (el.Block != null && k.Kind != "door" && k.Kind != "window")
                    {
                        SetAside(el);
                        continue;
                    }
                    if (k.Kind == "floor" || k.Kind == "ceiling")
                    {
                        string slab = k.Kind == "floor" ? "Floor" : "Ceiling";
#if !REVIT2022_OR_GREATER
                        if (k.Kind == "ceiling")
                        {
                            report.Warnings.Add($"Ceiling creation is not supported by the Revit 2021 API (layer '{el.CadLayer}'); skipped.");
                            continue;
                        }
#endif
                        if (!ElementPlacementFactory.TryBuildClosedLoop(el, out CurveLoop loop))
                        {
                            report.SkippedNoGeometry++;
                            report.Warnings.Add($"{slab} on layer '{el.CadLayer}' skipped: its CAD geometry is not a closed polyline, so no boundary loop could be formed.");
                            continue;
                        }
                        string name = map.BdsFamilyType ?? map.BdsFamily;
                        string why = k.Kind == "floor"
                            ? Refusal("floor|" + name, () => ChangesetExecutor.ResolveFloorType(doc, name))
                            : Refusal("ceiling|" + name, () => ChangesetExecutor.CreateType(doc, BuiltInCategory.OST_Ceilings, "ceiling", null, name));
                        if (why != null)
                        {
                            report.SkippedUnknownFamily++;
                            report.Warnings.Add($"{slab} on '{el.CadLayer}': {why}{GhostFiling.SyntheticHint(name)}; skipped.");
                            continue;
                        }
                        var corners = loop.Select(c => c.GetEndPoint(0)).ToList();
                        if (k.Kind == "floor")
                            plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Floor(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm, p.Z * FtToMm }).ToList()), map, null) });
                        else
                        {
                            // F7: the drawing's height above the build level — measured from the import's own Z (MA-1a item 3), as walls are.
                            double offsetMm = (corners[0].Z - r.ImportZFt) * FtToMm;
                            plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Ceiling(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm }).ToList(), offsetMm), map, null) });
                            report.Warnings.Add($"Ceilings on '{el.CadLayer}' are placed {offsetMm:0} mm above {level.Name}, the drawing's height (founder decision F7) — set the ceiling height where the drawing gives none.");
                        }
                        continue;
                    }

                    // A door or window: the middle of what its block draws (MA-1b), or a drawn outline's centroid. A column or
                    // furniture: a drawn outline's centroid (its blocks were set aside above).
                    XYZ pt = el.LocationPoint ?? ElementPlacementFactory.Centroid(el.LocationLoop);
                    if (pt == null) { report.SkippedNoGeometry++; continue; }
                    var syms = typer.SymbolsOf(map.Category); // B7: the factory's one reading of a category's loaded types
                    int i = GhostTypePick.Pick(syms.Select(s => (s.FamilyName, s.Name)).ToList(), map.Category, map.BdsFamily, map.BdsFamilyType, out string pickWhy);
                    if (i < 0)
                    {
                        report.SkippedUnknownFamily++;
                        report.Warnings.Add($"{what}: {pickWhy}{GhostFiling.SyntheticHint(map.BdsFamily)}; skipped.");
                        continue;
                    }
                    var sym = syms[i];
                    bool hosted = k.Kind == "door" || k.Kind == "window";
                    var placement = sym.Family.FamilyPlacementType;
                    // E12: a door or window sits in the wall under it; furniture stands on its level; a column stands on its
                    // level too, and Revit's column families are two-level based (base and top level). B5: a door or window
                    // family must be hosted by a WALL — a roof-, floor- or ceiling-hosted window (a skylight) is a gap.
                    // ponytail: an unreadable FAMILY_HOSTING_BEHAVIOR passes on the placement type alone; the executor's
                    // did-it-go-into-the-wall check then declines the build, named. Make it a gap if the drill sees one.
                    int? hostBy = hosted ? sym.Family.get_Parameter(BuiltInParameter.FAMILY_HOSTING_BEHAVIOR)?.AsInteger() : null;
                    bool fits = hosted ? placement == FamilyPlacementType.OneLevelBasedHosted && (hostBy == null || hostBy == 1)
                              : placement == FamilyPlacementType.OneLevelBased || (k.Kind == "column" && placement == FamilyPlacementType.TwoLevelsBased);
                    if (!fits)
                    {
                        string family = hostBy is int hb && hb != 1 ? (hb >= 0 && hb < HostedBy.Length ? HostedBy[hb] : "not wall-hosted") : placement.ToString();
                        report.SkippedUnknownFamily++;
                        report.Warnings.Add($"{what}: \"{sym.FamilyName} : {sym.Name}\" is a {family} family — Sentinel places a {k.Kind} " +
                                            (hosted ? "in the one wall under its point" : "unhosted on its level") + "; pick another type in the review; skipped.");
                        continue;
                    }
                    double x = pt.X * FtToMm, y = pt.Y * FtToMm;
                    if (hosted)
                    {
                        // MA-1b (GHB-1): the one straight wall of this build within half its thickness of the point — for a block,
                        // the one along the block's axis — and the point moved onto that wall's line. Then the executor's own
                        // host rule at the moved point (B2, F9 A), so whatever it would refuse is a named gap here, never a
                        // whole-build decline, and never a free-standing door.
                        string drawnAs = DrawnAs(el); // the nested-block note (C5) was said above, before the E17 set-aside
                        var snap= PlacementGeometry.Snap(straight, halves, level.Name, x, y, el.Block?.RotationDeg, out string hostWhy);
                        if (snap != null)
                        {
                            (x, y) = (snap.Value.X, snap.Value.Y);
                            hostWhy = HostProblem(x, y);
                        }
                        if (hostWhy != null)
                        {
                            report.SkippedNoHost++;
                            if (PlacementGeometry.IsBrokenWall(hostWhy)) report.SkippedBrokenWall++; // F8: counted on its own line too
                            report.Warnings.Add($"{what}: {drawnAs}{hostWhy} — not filed.");
                            continue;
                        }
                        // F4 B (drill B1-10: Revit's answer to two identical doors at one point is an error that rolls the
                        // whole build back) — the second one is named as a duplicate and not filed; nothing in the model is touched.
                        string first = hostedAt.Where(h => h.Kind == k.Kind && Math.Abs(h.X - x) <= 1 && Math.Abs(h.Y - y) <= 1).Select(h => h.What).FirstOrDefault();
                        if (first != null)
                        {
                            report.SkippedDuplicate++;
                            report.Warnings.Add($"{what}: {drawnAs}a second {k.Kind} block at the same point as {first} ({x:0}, {y:0} mm) — a duplicate in the drawing; " +
                                                $"not filed (Revit refuses two identical {k.Kind}s at one point and would roll the whole build back). Remove it in the drawing if it is not meant.");
                            continue;
                        }
                        hostedAt.Add((k.Kind, x, y, what));
                    }
                    plan.Add(new Planned { Map = map, What = what, Dto = Prov(GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm,
                        hosted ? el.Block?.RotationDeg : null, el.Block?.Mirrored == true), map, null) });
                }

                foreach (var kv in otherBlocks)
                {
                    report.SkippedBlocks += kv.Value;
                    report.Warnings.Add($"{kv.Value} block(s) on '{kv.Key}' not placed: Sentinel places door and window blocks only — a block on any other row is not read yet (its angle would be lost).");
                }
                if (plan.Count == 0)
                    return Abandon("Nothing was built — no ticked row gave an element Sentinel can place (each reason is listed below); the types step was rolled back too.");

                // MA-1a item 6: the guideline's placement block against this model, before anything is filed — a workset the
                // plan needs and the model lacks abandons the build (nothing filed, the types step rolled back).
                var placing = PlacementApply.Resolve(doc, r.Guideline?.Placement, app.ActiveUIDocument?.ActiveView, plan.Select(p => p.Dto.Kind), out string noWorkset);
                if (placing == null) return Abandon(noWorkset + " The types step was rolled back too.");

                // ── 3. What the pool thread files (MA-3b7: File): changesets of at most 200, hosts first ─────────────────────────────
                var chunks = GhostFiling.Chunks(plan.Select(x => x.Dto).ToList());
                var names = new List<string>();
                for (int c = 0; c < chunks.Count; c++) names.Add(GhostFiling.Name(r.Drawing, level.Name, c, chunks.Count));
                prep.Plan = plan; prep.Chunks = chunks; prep.Names = names;
                prep.Bodies = bound ? names.Select((name, c) => GhostFiling.Body(name, UserSession.Actor, chunks[c])).ToList() : null;
                // The dry run leaves nothing: the types step is rolled back with the group; event B makes it again and counts its own
                // warnings (A's would be counted twice).
                SentinelUndo.RollBack(group, doc);
                report.RevitWarnings.Clear();
                return prep;
            }
            catch (Exception ex)
            {
                return Abandon(GhostFailurePolicy.NotBuiltLine($"{ex.GetType().Name}: {ex.Message}"));
            }
        }

        // MA-3b7: step 1 — the families and types the reviewed rows need (founder decision F4), and each wall's type. Run twice: by the
        // dry run (Prepare, its report the build's) and by the build itself (Place, a throwaway report — nothing said twice).
        // RolledBack: the words when Revit did not commit the types transaction.
        private static (ElementPlacementFactory Typer, List<(GhostElement El, LayerMapping Map, string Type, string TypedBy)> Walls, string RolledBack) TypesStep(
            Document doc, Request r, MappingResult mapping, List<GhostElement> elements, Dictionary<string, LayerMapping> byLayer, Level level,
            GhostPlacementEngine.PlacementReport report, Action<string, GhostElement> NoteNested, Action<GhostElement> SetAside)
        {
        // B1: Revit's warnings from every transaction of the build, counted by text — left in the model, never erased.
        void Count(Dictionary<string, int> warnings)
        {
            foreach (var kv in warnings) report.RevitWarnings[kv.Key] = (report.RevitWarnings.TryGetValue(kv.Key, out int w) ? w : 0) + kv.Value;
        }
            var walls = new List<(GhostElement El, LayerMapping Map, string Type, string TypedBy)>();
            // B7: the executor's own type rules, its refusal text the gap — a type it resolves stays resolvable (no type is
            // removed during a build), so each is asked once.
            var resolvable = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string Refusal(string key, Action check)
            {
                if (resolvable.Contains(key)) return null;
                try { check(); resolvable.Add(key); return null; }
                catch (InvalidOperationException ex) { return ex.Message; }
            }
            ElementPlacementFactory typer;
            using (var t = new Transaction(doc, GhostFailurePolicy.TypesTxName))
            {
                t.Start();
                var fails = GhostFailureHandler.AllOrNothingOn(t); // B1
                if (r.LibraryDir != null)
                {
                    var pre = new GhostFamilyPreloader(doc, r.LibraryDir).Preload(mapping);
                    if (pre.Loaded > 0) doc.Regenerate();
                    report.Warnings.AddRange(pre.Warnings);
                    report.CreatedTypes.AddRange(pre.LoadedNames.Select(n => $"family {n} (loaded from the Ghost family library)"));
                }
                var wallProv = new GhostWallTypeProvisioner(doc, r.Guideline).Provision(mapping);
                if (wallProv.Created > 0) doc.Regenerate();
                var floorProv = new GhostFloorTypeProvisioner(doc, r.Guideline).Provision(mapping);
                if (floorProv.Created > 0) doc.Regenerate();
                report.TypeGaps = wallProv.Gaps + floorProv.Gaps;
                report.Warnings.AddRange(wallProv.Warnings);
                report.Warnings.AddRange(floorProv.Warnings);
                report.CreatedTypes.AddRange(wallProv.CreatedNames.Select(n => $"{n} (wall type the layer mapping names)"));
                report.CreatedTypes.AddRange(floorProv.CreatedNames.Select(n => $"{n} (floor type the layer mapping names)"));

                // MA-2a: the outer boundary of this build (mm), so a layer-free Location rule can type a wall no layer rule names —
                // the drawn walls first (a drawn wall's index is its index here; its width is its measured thickness, 0 for one
                // drawn as a single line: the sample points then sit 100 mm off its line; only straight single runs on Walls rows
                // are read), then, as barriers only, the model's own walls that cross the build level (review C1: a fit-out
                // drawing added to a model that already has its shell reads its partitions as inside).
                var drawn = new List<WallLocation.Segment>();
                var drawnAt = new Dictionary<GhostElement, int>();
                foreach (var el in elements)
                {
                    if (!byLayer.TryGetValue(el.CadLayer ?? "", out var wm) || !string.Equals(wm.Category, "Walls", StringComparison.OrdinalIgnoreCase) || el.Block != null) continue;
                    var c = el.LocationCurve;
                    if (c == null || !c.IsBound) continue;
                    XYZ a = c.GetEndPoint(0), b = c.GetEndPoint(1);
                    drawnAt[el] = drawn.Count;
                    drawn.Add(new WallLocation.Segment { X0 = a.X * FtToMm, Y0 = a.Y * FtToMm, X1 = b.X * FtToMm, Y1 = b.Y * FtToMm, WidthMm = el.ThicknessMm, Curved = !(c is Line) });
                }
                double planeFt = level.Elevation, planeTolFt = WallLocation.TolMm / FtToMm;
                foreach (var mw in new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>())
                {
                    var mc = (mw.Location as LocationCurve)?.Curve;
                    var bb = mw.get_BoundingBox(null);
                    if (mc == null || !mc.IsBound || bb == null || bb.Min.Z > planeFt + planeTolFt || bb.Max.Z <= planeFt + planeTolFt) continue;
                    XYZ ma = mc.GetEndPoint(0), mb = mc.GetEndPoint(1);
                    drawn.Add(new WallLocation.Segment
                    {
                        X0 = ma.X * FtToMm, Y0 = ma.Y * FtToMm, X1 = mb.X * FtToMm, Y1 = mb.Y * FtToMm,
                        WidthMm = mw.WallType?.Kind == WallKind.Basic ? mw.Width * FtToMm : 0, Curved = !(mc is Line),
                    });
                }
                int outside = 0, inside = 0, unknown = 0;
                // The one fact a drawn wall's rule may see: its Location when the boundary reads one. The mapping's parameter values
                // are the local model's reading of the documents (EnrichParamsAsync, best-effort): they are written to the wall as
                // before (ApplyParams) and never pick its type (review C4). An unknown location is left out: a rule that needs it
                // cannot fire.
                Dictionary<string, string> GhostFacts(GhostElement el)
                {
                    var facts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    string loc = drawnAt.TryGetValue(el, out int at) ? WallLocation.Locate(drawn, at, out _) : null;
                    if (loc != null) facts["Location"] = loc;
                    if (loc == WallLocation.Exterior) outside++; else if (loc == WallLocation.Interior) inside++; else unknown++;
                    return facts;
                }

                // Each wall's type: the reviewer's pick, else the guideline at the measured thickness (a size the model lacks
                // is cloned here from its catalogue sibling), else the mapping — ElementPlacementFactory's rule, unchanged.
                typer = new ElementPlacementFactory(doc, level, WallTypes(doc), guideline: r.Guideline);
                foreach (var el in elements)
                {
                    if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map) || !string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue;
                    // E17: a block on a Walls row is no wall — it has no run to file, so it would have been a bare SkippedNoGeometry.
                    if (el.Block != null) { NoteNested($"Walls on '{el.CadLayer}'", el); SetAside(el); continue; }
                    string type = typer.ResolveWallType(el, map, out string gap, out string typedBy, GhostFacts(el));
                    if (gap == null && Refusal("wall|" + type, () => ChangesetExecutor.ResolveWallType(doc, type)) is string no)
                        gap = no + GhostFiling.SyntheticHint(type);
                    if (gap != null)
                    {
                        report.WallGaps++;
                        report.SkippedUnknownFamily++;
                        report.Warnings.Add($"Wall on '{el.CadLayer}': {gap.TrimEnd('.')}; skipped.");
                        continue;
                    }
                    walls.Add((el, map, type, typedBy));
                }
                report.CreatedTypes.AddRange(typer.CreatedTypes);
                report.Warnings.AddRange(typer.Notes);
                // MA-2a: what the outer boundary read of this build's walls — a count, so a drawing whose walls do not close is seen.
                if (drawn.Count > 0) report.Warnings.Add(WallLocation.Summary(outside, inside, unknown) + " (this build's drawn walls; an unknown location types by its layer rule or the mapping, never by a guess).");
                if (t.Commit() != TransactionStatus.Committed)
                    return (typer, walls, GhostFailurePolicy.NotBuiltLine("Revit did not commit the types and families this build needs" +
                                                                   (fails.RolledBack != null ? ": " + fails.RolledBack : "")));
                Count(GhostFailurePolicy.CountWarnings(fails.SeenWarnings, null));
            }
            return (typer, walls, null);
        }

        /// <summary>MA-3b7 (XC-3): the filing, on a pool thread — Revit answers meanwhile. A failure withdraws what was filed, on this
        /// thread, and returns the words; never throws.</summary>
        public static Filed File(Prepared p)
        {
            var r = p.R;
            var cfg = p.Cfg;
            bool bound = p.Bound;
            var chunks = p.Chunks;
            var filed = new List<ChangesetDto>();
            Filed Abandon(string line) => new Filed { Changesets = filed, NotFiled = line, Ledger = p.Bound && filed.Count > 0 ? WithdrawAll(p, filed) : null };
            try
            {
                for (int c = 0; c < chunks.Count; c++)
                {
                    string name = p.Names[c];
                    if (!bound) { filed.Add(GhostFiling.Local(name, chunks[c])); continue; }
                    var cs = ChangesetClient.Propose(cfg, r.Key, p.Bodies[c], out string err);
                    if (cs == null || cs.Elements.Count != chunks[c].Count)
                    {
                        if (cs != null) filed.Add(cs); // filed, but not as sent: withdraw it with the rest
                        bool signIn = err != null && (err.StartsWith("Bridge 401") || err.StartsWith("Bridge 403"));
                        // B4: only a 4xx says the bridge stored nothing; a timeout, a 5xx or an unreadable answer may have filed it.
                        bool maybeFiled = cs == null && !(err != null && err.StartsWith("Bridge 4"));
                        return Abandon(GhostFailurePolicy.NotFiledLine((err ?? "the bridge answered with a different number of elements") +
                                                                        (signIn ? " — sign in (Standards ▸ Sign in) as a contributor on this project" : "") +
                                                                        (maybeFiled ? $" — changeset \"{name}\" may exist on the bridge anyway: check {r.Key} on the web and withdraw it" : "")));
                    }
                    filed.Add(cs);
                    // MA-1b (GHB-1): the bridge must have kept each block's angle — the executor places what it returned.
                    if (GhostFiling.LostRotation(chunks[c], cs.Elements))
                        return Abandon(GhostFailurePolicy.NotFiledLine("the bridge did not keep the door and window blocks' angle (place.Rotation) — it runs a build " +
                                                                        "older than this add-in. Restart the bridge on the current build, then build again"));
                }
                return new Filed { Changesets = filed };
            }
            catch (Exception ex)
            {
                return Abandon(GhostFailurePolicy.NotFiledLine($"{ex.GetType().Name}: {ex.Message}"));
            }
        }

        // MA-3b7: every filed changeset withdrawn, on the calling thread (never Revit's) — WithdrawEach stops after the first the
        // bridge did not answer (one 120 s wait at most, review C10) and names those still proposed.
        private static string WithdrawAll(Prepared p, List<ChangesetDto> filed)
        {
            int gone = 0;
            string words = UnreportedResults.WithdrawEach(filed.Select(f => (f.Id, Short(f.Id))),
                id => { if (ChangesetClient.Withdraw(p.Cfg, p.R.Key, id, out var why)) { gone++; return null; } return why ?? "no answer"; });
            return gone == filed.Count ? $"Ledger: the {filed.Count} changeset(s) already filed were withdrawn." : "Ledger: " + words.Trim();
        }

        /// <summary>MA-3b7 event B (Revit's thread, DocPin's model): the types step again and the build, inside ONE TransactionGroup
        /// assimilated as one Undo entry, as before.</summary>
        public static GhostPlacementEngine.PlacementReport Place(UIApplication app, Document doc, Prepared p, Filed filed) => Build(app, doc, p, filed.Changesets);

        /// <summary>MA-3b7 (DocPin): the model was switched or closed while Ghost Builder filed — nothing placed; what was filed is
        /// withdrawn off Revit's thread (the hub calls onRefused on it).</summary>
        public static GhostPlacementEngine.PlacementReport NotPlaced(Prepared p, Filed filed, string why)
        {
            p.Report.NotBuilt = GhostFailurePolicy.NotPlacedLine(why);
            if (p.Bound && filed.Changesets.Count > 0)
            {
                p.Report.Ledger = GhostFailurePolicy.WithdrawingLine(filed.Changesets.Count);
                Task.Run(() => App.PanelVm?.LogDoctor(UnreportedResults.GhostHead + "withdrawn, nothing was placed — " + WithdrawAll(p, filed.Changesets)));
            }
            return p.Report;
        }

        private static GhostPlacementEngine.PlacementReport Build(UIApplication app, Document doc, Prepared prep, List<ChangesetDto> filed)
        {
            var r = prep.R;
            var report = prep.Report;
            var level = prep.Level;
            var cfg = prep.Cfg;
            bool bound = prep.Bound;
            bool executing = false, done = false;

            // B1: Revit's warnings from every transaction of the build, counted by text — left in the model, never erased.
            void Count(Dictionary<string, int> warnings)
            {
                foreach (var kv in warnings) report.RevitWarnings[kv.Key] = (report.RevitWarnings.TryGetValue(kv.Key, out int w) ? w : 0) + kv.Value;
            }
            string Unreported() => bound
                ? $"Ledger: {filed.Count} changeset(s) left proposed and unreported — check the model, then withdraw them on the web."
                : noLedger;

            using var group = new TransactionGroup(doc, "Ghost Builder");

            // Nothing ran yet: roll the group back (the types too). MA-3b7: what was filed is withdrawn off Revit's thread — the pane's
            // Doctor log says what the bridge answered; no changeset is left for a later review to apply.
            GhostPlacementEngine.PlacementReport Abandon(string line)
            {
                SentinelUndo.RollBack(group, doc);
                report.NotBuilt = line;
                report.Ledger = null;
                if (bound && filed.Count > 0)
                {
                    report.Ledger = GhostFailurePolicy.WithdrawingLine(filed.Count);
                    Task.Run(() => App.PanelVm?.LogDoctor(UnreportedResults.GhostHead + "withdrawn after the build rolled back — " + WithdrawAll(prep, filed)));
                }
                return report;
            }

            // A changeset failed in Revit: the whole build is rolled back, and every filed changeset is reported declined. B4: a
            // result the bridge does not take is withdrawn instead, and one that is neither is named — it is still proposed.
            // MA-3b4 (AI-2): reported off Revit's thread (ReportAll; a decline is not written on this PC — E5), the withdrawals on the
            // same pool thread inside the round, under the guard (review C3); what the bridge did is said in the pane's Doctor log, and in a
            // dialog when one was not taken (G2).
            GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)
            {
                SentinelUndo.RollBack(group, doc);
                report.NotBuilt = GhostFailurePolicy.NotBuiltLine(error);
                if (!bound) { report.Ledger = noLedger; return report; }
                var declines = filed.Select(cs => ReviewChangesetsCommand.ResultOf(r.Key, cs, new List<AppliedEntry>(), cs.Elements.Select(e => e.ProposalGuid).ToList(),
                    cs == failing ? $"Revit transaction failed — rolled back: {error}"
                                  : $"not applied — the Ghost build is all or nothing and {(failing == null ? "it" : "changeset " + Short(failing.Id))} failed: {error}",
                    null, ReviewChangesetsCommand.DocOf(doc), null, null)).ToList();
                ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, declines, after: rep =>
                {
                    var landed = new HashSet<string>(rep.Landed.Select(x => x.R.ChangesetId), StringComparer.Ordinal);
                    // Review C10: one 120 s wait at most — WithdrawEach stops after the first the bridge did not answer.
                    return UnreportedResults.WithdrawEach(filed.Where(f => !landed.Contains(f.Id)).Select(f => (f.Id, Short(f.Id))),
                        id => ChangesetClient.Withdraw(cfg, r.Key, id, out var why) ? null : why ?? "no answer");
                }), UnreportedResults.GhostHead, rep => rep.Landed.Count < declines.Count);
                report.Ledger = UnreportedResults.GhostDeclining(declines.Count);
                return report;
            }

            group.Start();
            // F-S2-1: a TransactionGroup can force modal failure handling on every transaction finished inside it, whatever that
            // transaction's own options say (TransactionGroup.IsFailureHandlingForcedModal; its default is undocumented — drill
            // MA1a-S2's blocking "N Warnings" OK/Cancel dialog says it was on). Off, each inner transaction's
            // SetForcedModalHandling(false) holds: the warnings Revit keeps show in its non-blocking box, as step 1's did (S1-8).
            // No error reaches a dialog — the all-or-nothing preprocessor rolls each one back first, so no inner commit is left
            // Pending inside the group.
            group.IsFailureHandlingForcedModal = false;

            ScanReport blockBefore = null; // MA-1a item 5: the BLOCK rows before the build; null = nothing can block it
            string blockNote = null, blockLine = null;
            try
            {
                blockBefore = BlockCheck.Before(doc, out blockNote);
                // ── 1. The types again (MA-3b7): the dry run proved them and rolled them back; made here inside the build's Undo —
                //    a throwaway report: A's warnings, gaps and created types are not said twice; only Revit's warnings are counted.
                var typesBefore = new HashSet<long>(new FilteredElementCollector(doc).WhereElementIsElementType().ToElementIds().Select(i => i.IdValue()));
                // F-S2-2: the walls already in the model — a wall of this build never joins one; its own walls join each other,
                // across its changesets too.
                var wallsBefore = new HashSet<long>(new FilteredElementCollector(doc).OfClass(typeof(Wall)).ToElementIds().Select(i => i.IdValue()));
                var again = new GhostPlacementEngine.PlacementReport();
                var types = TypesStep(doc, r, prep.Mapping, prep.Elements, prep.ByLayer, level, again, (_, __) => { }, _ => { });
                if (types.RolledBack != null) return Abandon(types.RolledBack);
                Count(again.RevitWarnings);
                var placing = PlacementApply.Resolve(doc, r.Guideline?.Placement, app.ActiveUIDocument?.ActiveView, prep.Plan.Select(x => x.Dto.Kind), out string noWorkset);
                if (placing == null) return Abandon(noWorkset + " The types step was rolled back too.");
                var chunks = prep.Chunks;
                var byDto = prep.Plan.ToDictionary(x => x.Dto); // reference identity: the bridge answers element by element, in order
                var planOf = new Dictionary<string, Planned>(StringComparer.Ordinal);
                for (int c = 0; c < filed.Count; c++)
                    for (int j = 0; j < chunks[c].Count; j++) planOf[filed[c].Elements[j].ProposalGuid] = byDto[chunks[c][j]];
                int idsRejected = filed.Sum(cs => cs.Elements.Count(e => e.Verdict?.Status == "rejected"));
                // MA-1a item 4 (review amendment C1): each element's layer, rule and drawing sha for its stamp, from THIS build's own
                // plan by proposal_guid — the executor never reads the provenance a changeset came back from the bridge with.
                var facts = planOf.ToDictionary(kv => kv.Key, kv => new ProvenanceStamp.Facts
                {
                    Layer = kv.Value.Dto.Provenance.Layer, Rule = kv.Value.Dto.Provenance.Rule, SourceSha256 = kv.Value.Dto.Provenance.SourceSha256,
                }, StringComparer.Ordinal);

                // ── 4. Run: each changeset through the executor, in order; any failure declines the whole build ──────────────
                executing = true;
                var results = new List<ChangesetExecutor.ExecutionResult>();
                foreach (var cs in filed)
                {
                    var res = new ChangesetExecutor { WallsBefore = wallsBefore, Provenance = facts, Placement = placing }.Execute(doc, cs, new HashSet<string>(cs.Elements.Select(e => e.ProposalGuid)));
                    // ponytail: Pending inside the group — nothing is reported, and the group is disposed unfinished; the
                    // executor's all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                    if (res.NotFinished != null)
                    {
                        report.NotBuilt = res.NotFinished;
                        report.Ledger = Unreported();
                        return report;
                    }
                    // MA-1a item 6 (review amendment C5): Revit refused a placement write — nothing is declined. The whole
                    // build is rolled back and what was filed is withdrawn, as for a refusal before filing.
                    if (res.NotRun) return Abandon(res.Error + " The build was rolled back, the types step too.");
                    if (res.Error != null) return Decline(cs, res.Error);
                    results.Add(res);
                }

                // ── 5. The documents' values on what was placed (P2, A7), inside the same Undo ─────────────────────────────────
                var applied = results.SelectMany(x => x.Applied).ToList();
                var placed = applied.Select(a => (a, e: doc.GetElement(a.RevitUniqueId))).Where(x => x.e != null).ToList();
                if (placed.Any(x => planOf[x.a.ProposalGuid].Map.Params?.Count > 0))
                    using (var t = new Transaction(doc, GhostFailurePolicy.ParamsTxName))
                    {
                        t.Start();
                        var fails = GhostFailureHandler.AllOrNothingOn(t); // B1
                        var writer = new ElementPlacementFactory(doc, level, null) { TypesBefore = typesBefore };
                        foreach (var (a, e) in placed) writer.NewElements.Add((e.Id, planOf[a.ProposalGuid].What)); // A7: this build's own instances
                        foreach (var (a, e) in placed)
                            if (planOf[a.ProposalGuid].Map.Params?.Count > 0) writer.ApplyParams(e, planOf[a.ProposalGuid].Map);
                        if (t.Commit() != TransactionStatus.Committed)
                            report.Warnings.Add("The documents' values (P2) were not written — Revit did not commit them" +
                                                (fails.RolledBack != null ? $" ({fails.RolledBack})" : "") + "; the elements stand as placed.");
                        else
                        {
                            report.Warnings.AddRange(writer.Notes); // what was set — true only once committed
                            Count(GhostFailurePolicy.CountWarnings(fails.SeenWarnings, null));
                        }
                    }

                // ── 5b. MA-1a item 5: the BLOCK check — what this build adds, judged as a sync judges it, before the Undo is kept ──
                if (blockBefore != null)
                {
                    var added = BlockCheck.AddedSince(doc, blockBefore);
                    if (added.Count > 0)
                    {
                        if (!BlockCheck.PlaceAnyway(doc, added, "the whole build", blockBefore.RulesetRef))
                        {
                            // Go back: nothing placed, the filed changesets withdrawn; the review stays open for another Build.
                            var back = Abandon(BlockCheck.WentBack(added));
                            back.WentBack = true;
                            return back;
                        }
                        blockLine = BlockCheck.PlacedAnyway(added, doc.IsWorkshared);
                        report.Warnings.Insert(0, blockLine);
                    }
                }
                else if (blockNote != null)
                {
                    blockLine = blockNote;
                    report.Warnings.Add(blockNote);
                }

                // ── 6. One Undo entry, named as the first changeset's transaction ───────────────────────────────────────────
                string undo = UndoWatcher.TxName(filed[0].Name, filed[0].Id);
                group.SetName(undo);
                if (group.Assimilate() != TransactionStatus.Committed)
                {
                    if (group.GetStatus() == TransactionStatus.RolledBack)
                        return Decline(null, "Revit did not keep the build's Undo group (status RolledBack)");
                    report.NotBuilt = GhostFailurePolicy.NotFinishedLine(group.GetStatus().ToString());
                    report.Ledger = Unreported();
                    return report;
                }
                done = true;

                // ── 7. The ledger (MA-3b4, AI-2): each result written on this PC first, then reported off Revit's thread ─────────────
                //    ReportAll expects the Undo here, before the report leaves this thread (MA-3b C8), remembers it for the undo watcher
                //    once the bridge takes it — under the Undo entry's name and the changeset's own, whichever Revit reports — and keeps
                //    what it does not take: sent again when this model opens or by Review AI Proposals, never reviewed until then (G2).
                var records = new List<UnreportedResults.Record>();
                for (int c = 0; c < filed.Count; c++)
                {
                    var cs = filed[c];
                    var res = results[c];
                    foreach (var g in res.Gone) report.DeletedByRevit.Add(planOf[g.ProposalGuid].What + " — removed by Revit at commit");
                    Count(res.Warnings);
                    if (!bound) continue;
                    // MA-3a (C2): the review_rev the filing reply carried (0) — a web decline that landed since is judged late, never unchecked.
                    var rec = ReviewChangesetsCommand.ResultOf(r.Key, cs, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report, blockLine), cs.ReviewRev,
                                                               ReviewChangesetsCommand.DocOf(doc), new List<string> { undo, UndoWatcher.TxName(cs.Name, cs.Id) }, null);
                    rec.Path = doc.PathName ?? ""; // MA-3b2 review C16: the file itself, beside Doc (a local's central)
                    records.Add(rec);
                }
                // Review C7: every result, one whose elements Revit all removed at commit too — no window holds it, so this record is
                // what keeps its changeset closed until the bridge takes it (Retry's stamp check: 0 of 0 found sends it).
                var unsaved = records.Where(x => !UnreportedResults.Write(x)).ToList();
                // Review C8: one whose save failed and whose report did not land is said NOT kept (the round's own words say "kept").
                if (records.Count > 0)
                    ReviewChangesetsCommand.Said(ReviewChangesetsCommand.ReportAll(cfg, records, after: rep => UnreportedResults.NotKept(unsaved.Where(u => !rep.Landed.Any(l => l.R == u)).Select(u => Short(u.ChangesetId)).ToList())),
                                                 UnreportedResults.GhostHead, rep => rep.Act || rep.Landed.Count < records.Count); // review C2: a late decline asks too
                report.Placed = applied.Count;
                // MA-1a item 6: the worksets and the phase, or why nothing was set — counted from `applied`, what the
                // executor's recount left in the model. Its own list: a result of the build, not a warning.
                report.Placement.AddRange(placing.Lines(doc, applied.Select(a => a.RevitUniqueId)));
                // MA-1b (GHB-1): how the doors and windows placed from blocks sit against their blocks — what the executor
                // measured after each commit, never what was planned.
                report.Placement.AddRange(PlacementGeometry.TurnLines(results.SelectMany(x => x.Turned).ToList()));
                report.Stamped = applied.Count(a => ProvenanceStamp.SourceOf(ProvenanceStamp.Read(doc.GetElement(a.RevitUniqueId))) == GhostFiling.Source);
                report.Ledger = !bound ? localLedger
                    : UnreportedResults.GhostReporting(r.Key, filed.Select(f => Short(f.Id)).ToList(), unsaved.Select(u => Short(u.ChangesetId)).ToList());
                if (idsRejected > 0)
                    report.Warnings.Insert(0, $"IDS: {idsRejected} element(s) did not pass the project's IDS — built as reviewed in Ghost's review (founder decision F2); each verdict is on its changeset.");
                // MA-1a item 7: one ghost_build row for the build that was kept — the counts of the summary — sent off this
                // thread; the pane's log says what the ledger answered. Only when an element is still in the model (review
                // amendment C19): a build whose every element Revit removed at commit is not an action to report.
                if (report.Placed > 0)
                    GovernedNotify.Report("Ghost Builder", CommandReports.GhostBuild(r.Drawing, level.Name, report.Placed, report.DeletedByRevit.Count,
                        report.WallGaps, report.TypeGaps, report.SkippedNoHost + report.SkippedDuplicate + report.SkippedNoGeometry + report.SkippedUnknownFamily + report.SkippedBlocks,
                        report.RevitWarnings.Values.Sum(), report.CreatedTypes.Count, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                // MA-1a item 8: the reader's build:run receipt, for the same kept build — its gaps are the walls and types
                // this build left as a named gap. Under the report's own condition (review amendment C19): a build that
                // left no element in the model posts neither.
                if (r.Reader != null && report.Placed > 0)
                {
                    r.Reader.Parameters["level"] = level.Name;
                    GovernedNotify.Report("Ghost Builder receipt", BuildReceipt.Run("ghost-builder", BuildReceipt.AddinSha256, r.Reader,
                        report.WallGaps + report.TypeGaps, bound ? filed.Select(f => f.Id).ToList() : new List<string>(), UserSession.Actor), r.Key);
                }
                return report;
            }
            catch (Exception ex) when (!done)
            {
                string why = $"{ex.GetType().Name}: {ex.Message}";
                return executing ? Decline(null, why) : Abandon(GhostFailurePolicy.NotBuiltLine(why));
            }
        }

        // The ledger note on each changeset's result: what was built from, and the types this build added (not elements of
        // any changeset, so named here).
        // MA-1a item 5: the BLOCK check's line (placed anyway, or not checked) rides on the note too.
        private static string Note(Request r, Level level, GhostPlacementEngine.PlacementReport report, string block) =>
            $"Ghost Builder: {r.Drawing} on {level.Name}, as reviewed in Ghost's review" + (block == null ? "" : "; " + block) +
            (report.CreatedTypes.Count == 0 ? "" : "; types added with this build: " + string.Join("; ", report.CreatedTypes.Take(10)) +
                                                   (report.CreatedTypes.Count > 10 ? $" (+{report.CreatedTypes.Count - 10} more)" : ""));

        // Every wall type by name, as GhostPlacementEngine reads them for the typing rule.
        private static Dictionary<string, WallType> WallTypes(Document doc) =>
            new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
                .GroupBy(w => w.Name, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        private static string Short(string id) => (id ?? "").Substring(0, Math.Min(8, (id ?? "").Length));
    }
}
