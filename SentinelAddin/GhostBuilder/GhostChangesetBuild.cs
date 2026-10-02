#nullable disable
// MA-1a step 2 (design §2.4 step 2, §7.2 MA-1 (1a) item 2): Ghost Builder places through ChangesetExecutor — one placement
// path, one ledger row format, one provenance stamp, one undo watcher. Build plans the reviewed rows into changeset elements
// with exact names (GhostFiling), files them as changesets with source "dwg" (a model not bound to a web project runs the
// same executor on a local changeset, with no ledger), and runs them. Everything happens inside ONE TransactionGroup,
// assimilated into one Undo entry named as the first changeset's transaction, so the undo watcher posts changeset_reverted:
//   1. "Ghost Builder - types": the families and types the rows need — the preloader, the wall and floor provisioners and
//      the guideline's sizes cloned at the measured thickness (Ghost's own type stage; the executor creates none);
//   2. each changeset's executor transaction — all or nothing, the commit checked, every element stamped;
//   3. "Ghost Builder - parameters": the values the project's documents gave each layer (P2; A7: a type only if this
//      build added it).
// Before filing, the plan turns into named gaps whatever the executor would refuse by rule (a missing or ambiguous type, a
// placeholder name, a door with no single straight wall of this build under it, a family of the wrong kind or host, a run
// too short to be a wall), so one bad row is not a whole-build decline. The type rules are the executor's own (B7). Whatever
// Revit itself refuses still rolls the whole group back: nothing is left — no element, no type, no family. Every
// transaction of the build counts Revit's warnings and rolls back on any error (B1). API thread only
// (GhostBuilderPlacementEvent).
using System;
using System.Collections.Generic;
using System.Linq;
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
        }

        private const double FtToMm = 304.8;

        // One planned element: its changeset element, the reviewed row it came from, and what it is in words.
        private sealed class Planned
        {
            public ChangesetElementDto Dto;
            public LayerMapping Map;
            public string What;
        }

        // FAMILY_HOSTING_BEHAVIOR's values, as words (B5).
        private static readonly string[] HostedBy = { "unhosted", "wall-hosted", "floor-hosted", "ceiling-hosted", "roof-hosted", "face-hosted" };

        public static GhostPlacementEngine.PlacementReport Run(UIApplication app, Request r)
        {
            var report = new GhostPlacementEngine.PlacementReport();
            var doc = r.Doc;
            if (DocPin.Check(app, doc, "build from the drawing") is { } refusal) { report.NotBuilt = refusal; return report; }
            var rows = (r.Mapping?.Mappings ?? new List<LayerMapping>())
                .Where(m => m != null && !m.Ignore && !string.IsNullOrWhiteSpace(m.CadLayer)).ToList();
            if (rows.Count == 0) { report.NotBuilt = "Nothing was built — no layer was ticked."; return report; }
            var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
            if (levels.Count == 0) { report.NotBuilt = "Nothing was built — the model has no level."; return report; }
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
            var filed = new List<ChangesetDto>();
            bool executing = false, done = false;
            double tolFt = doc.Application.ShortCurveTolerance, levelMm = level.Elevation * FtToMm;
            const string localLedger = "Ledger: none — this model is not bound to a web project (Project Setup binds it); the build ran " +
                                       "through the changeset executor as a local changeset (source dwg, stamped), as one Undo step.";
            const string noLedger = "Ledger: none — this model is not bound to a web project; nothing was filed.";

            // B1: Revit's warnings from every transaction of the build, counted by text — left in the model, never erased.
            void Count(Dictionary<string, int> warnings)
            {
                foreach (var kv in warnings) report.RevitWarnings[kv.Key] = (report.RevitWarnings.TryGetValue(kv.Key, out int w) ? w : 0) + kv.Value;
            }
            string Unreported() => bound
                ? $"Ledger: {filed.Count} changeset(s) left proposed and unreported — check the model, then withdraw them on the web."
                : noLedger;

            using var group = new TransactionGroup(doc, "Ghost Builder");
            group.Start();

            // Nothing ran yet: roll the group back (the types too) and withdraw what was filed — no changeset is left for a
            // later review to apply.
            GhostPlacementEngine.PlacementReport Abandon(string line)
            {
                if (group.HasStarted() && !group.HasEnded()) group.RollBack();
                var kept = new List<string>();
                if (bound) foreach (var cs in filed) if (!ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _)) kept.Add(Short(cs.Id));
                report.NotBuilt = line;
                report.Ledger = kept.Count > 0
                    ? $"Ledger: changeset(s) {string.Join(", ", kept)} were filed and could not be withdrawn — withdraw them on the web before anyone reviews them."
                    : bound && filed.Count > 0 ? $"Ledger: the {filed.Count} changeset(s) already filed were withdrawn." : null;
                return report;
            }

            // A changeset failed in Revit: the whole build is rolled back, and every filed changeset is reported declined. B4: a
            // result the bridge does not take is withdrawn instead, and one that is neither is named — it is still proposed.
            GhostPlacementEngine.PlacementReport Decline(ChangesetDto failing, string error)
            {
                if (group.HasStarted() && !group.HasEnded()) group.RollBack();
                int recorded = 0;
                var withdrawn = new List<string>();
                var kept = new List<string>();
                if (bound)
                    foreach (var cs in filed)
                    {
                        if (ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, new List<AppliedEntry>(), cs.Elements.Select(e => e.ProposalGuid).ToList(),
                                cs == failing ? $"Revit transaction failed — rolled back: {error}"
                                              : $"not applied — the Ghost build is all or nothing and {(failing == null ? "it" : "changeset " + Short(failing.Id))} failed: {error}"))
                        {
                            recorded++;
                            continue;
                        }
                        (ChangesetClient.Withdraw(cfg, r.Key, cs.Id, out _) ? withdrawn : kept).Add(Short(cs.Id));
                    }
                report.NotBuilt = GhostFailurePolicy.NotBuiltLine(error);
                report.Ledger = !bound ? noLedger
                    : $"Ledger: {recorded} of {filed.Count} changeset(s) reported as declined, with the reason" +
                      (withdrawn.Count > 0 ? $"; {string.Join(", ", withdrawn)} withdrawn instead (the result could not be reported)" : "") +
                      (kept.Count > 0 ? $"; {string.Join(", ", kept)} still proposed — withdraw it on the web" : "") + ".";
                return report;
            }

            try
            {
                // ── 1. The families and types the reviewed rows need, before anything is filed (founder decision F4) ──────────
                var typesBefore = new HashSet<long>(new FilteredElementCollector(doc).WhereElementIsElementType().ToElementIds().Select(i => i.IdValue()));
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

                    // Each wall's type: the reviewer's pick, else the guideline at the measured thickness (a size the model lacks
                    // is cloned here from its catalogue sibling), else the mapping — ElementPlacementFactory's rule, unchanged.
                    typer = new ElementPlacementFactory(doc, level, WallTypes(doc), guideline: r.Guideline);
                    foreach (var el in elements)
                    {
                        if (!byLayer.TryGetValue(el.CadLayer ?? "", out var map) || !string.Equals(map.Category, "Walls", StringComparison.OrdinalIgnoreCase)) continue;
                        string type = typer.ResolveWallType(el, map, out string gap, out string typedBy);
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
                    if (t.Commit() != TransactionStatus.Committed)
                        return Abandon(GhostFailurePolicy.NotBuiltLine("Revit did not commit the types and families this build needs" +
                                                                       (fails.RolledBack != null ? ": " + fails.RolledBack : "")));
                    Count(GhostFailurePolicy.CountWarnings(fails.SeenWarnings, null));
                }

                // ── 2. What each reviewed element becomes — reads only; a refusal by rule is a named gap, never a filing ──────
                var plan = new List<Planned>();
                var straight = new List<(string Label, string Level, double X0, double Y0, double X1, double Y1)>(); // this build's straight walls (mm)
                var arcs = new List<Curve>();                                                                         // this build's curved walls (ft)
                var seq = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                int Next(string layer) => seq[layer] = seq.TryGetValue(layer, out int k) ? k + 1 : 1;

                foreach (var (el, map, type, typedBy) in walls)
                {
                    var (baseMm, topMm) = GhostFiling.WallElevations(levelMm, el.BaseElevation, el.TopElevation, tolFt);
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
                        plan.Add(new Planned { Map = map, What = $"Walls on '{el.CadLayer}'", Dto = GhostFiling.Wall(el.CadLayer, n, typedBy, type, level.Name, run, baseMm, topMm) });
                        if (m == null) straight.Add(($"{el.CadLayer} #{n} (this build)", level.Name, run.Start[0], run.Start[1], run.End[0], run.End[1]));
                        else arcs.Add(c);
                        filedRuns++;
                        if (typedBy == "guideline") report.WallsByGuideline++;
                        else if (typedBy == "reviewer") report.WallsByReviewer++;
                        else report.WallsByMapping++;
                    }
                    if (filedRuns == 0) report.SkippedNoGeometry++;
                }

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
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Floor(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm, p.Z * FtToMm }).ToList()) });
                        else
                        {
                            double offsetMm = corners[0].Z * FtToMm; // F7: the drawing's height above the build level
                            plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Ceiling(el.CadLayer, Next(el.CadLayer), name, level.Name,
                                corners.Select(p => new[] { p.X * FtToMm, p.Y * FtToMm }).ToList(), offsetMm) });
                            report.Warnings.Add($"Ceilings on '{el.CadLayer}' are placed {offsetMm:0} mm above {level.Name}, the drawing's height (founder decision F7) — set the ceiling height where the drawing gives none.");
                        }
                        continue;
                    }

                    // A door, window, column or furniture: the block's insertion point, or a drawn outline's centroid.
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
                    if (hosted && HostProblem(x, y) is string hostWhy)
                    {
                        report.SkippedNoHost++;
                        report.Warnings.Add($"{what}: {hostWhy} — not filed (snapping DWG door blocks onto walls is GHB-1, MA-1b).");
                        continue;
                    }
                    plan.Add(new Planned { Map = map, What = what, Dto = GhostFiling.Point(k.Kind, el.CadLayer, Next(el.CadLayer), sym.FamilyName, sym.Name, level.Name, x, y, levelMm) });
                }

                if (plan.Count == 0)
                    return Abandon("Nothing was built — no ticked row gave an element Sentinel can place (each reason is listed below); the types step was rolled back too.");

                // ── 3. File: changesets of at most 200, hosts first (unbound: local changesets, no ledger) ───────────────────
                var chunks = GhostFiling.Chunks(plan.Select(p => p.Dto).ToList());
                var byDto = plan.ToDictionary(p => p.Dto); // reference identity: the bridge answers element by element, in order
                for (int c = 0; c < chunks.Count; c++)
                {
                    string name = GhostFiling.Name(r.Drawing, level.Name, c, chunks.Count);
                    if (!bound) { filed.Add(GhostFiling.Local(name, chunks[c])); continue; }
                    var cs = ChangesetClient.Propose(cfg, r.Key, GhostFiling.Body(name, UserSession.Actor, chunks[c]), out string err);
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
                }
                var planOf = new Dictionary<string, Planned>(StringComparer.Ordinal);
                for (int c = 0; c < filed.Count; c++)
                    for (int j = 0; j < chunks[c].Count; j++) planOf[filed[c].Elements[j].ProposalGuid] = byDto[chunks[c][j]];
                int idsRejected = filed.Sum(cs => cs.Elements.Count(e => e.Verdict?.Status == "rejected"));

                // ── 4. Run: each changeset through the executor, in order; any failure declines the whole build ──────────────
                executing = true;
                var results = new List<ChangesetExecutor.ExecutionResult>();
                foreach (var cs in filed)
                {
                    var res = new ChangesetExecutor().Execute(doc, cs, new HashSet<string>(cs.Elements.Select(e => e.ProposalGuid)));
                    // ponytail: Pending inside the group — nothing is reported, and the group is disposed unfinished; the
                    // executor's all-or-nothing preprocessor answers every error, so Revit should never leave one pending.
                    if (res.NotFinished != null)
                    {
                        report.NotBuilt = res.NotFinished;
                        report.Ledger = Unreported();
                        return report;
                    }
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

                // ── 7. The ledger: each changeset's result, then the undo watcher (only for a result the bridge holds) ────────
                var unrecorded = new List<string>();
                for (int c = 0; c < filed.Count; c++)
                {
                    var cs = filed[c];
                    var res = results[c];
                    foreach (var g in res.Gone) report.DeletedByRevit.Add(planOf[g.ProposalGuid].What + " — removed by Revit at commit");
                    Count(res.Warnings);
                    if (!bound) continue;
                    var guids = res.Applied.Select(a => a.ProposalGuid).ToList();
                    if (!ReviewChangesetsCommand.Report(cfg, r.Key, cs.Id, res.Applied, res.Gone.Select(g => g.ProposalGuid).ToList(), Note(r, level, report)))
                    {
                        unrecorded.Add(Short(cs.Id));
                        continue;
                    }
                    UndoWatcher.Remember(undo, r.Key, cs.Id, guids);                         // the Undo entry's name (the group's)
                    UndoWatcher.Remember(UndoWatcher.TxName(cs.Name, cs.Id), r.Key, cs.Id, guids); // and its own, whichever Revit reports
                }
                report.Placed = applied.Count;
                report.Stamped = applied.Count(a => ProvenanceStamp.SourceOf(ProvenanceStamp.Read(doc.GetElement(a.RevitUniqueId))) == GhostFiling.Source);
                report.Ledger = !bound ? localLedger
                    : $"Ledger: {filed.Count - unrecorded.Count} of {filed.Count} changeset(s) recorded on {r.Key} (source dwg: {string.Join(", ", filed.Select(f => Short(f.Id)))})" +
                      (unrecorded.Count == 0 ? " — one Ctrl+Z undoes the whole build and posts changeset_reverted."
                                             : $" — the result of {string.Join(", ", unrecorded)} was NOT recorded (see the message before this one); do not apply it again in Review AI Proposals.");
                if (idsRejected > 0)
                    report.Warnings.Insert(0, $"IDS: {idsRejected} element(s) did not pass the project's IDS — built as reviewed in Ghost's review (founder decision F2); each verdict is on its changeset.");
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
        private static string Note(Request r, Level level, GhostPlacementEngine.PlacementReport report) =>
            $"Ghost Builder: {r.Drawing} on {level.Name}, as reviewed in Ghost's review" +
            (report.CreatedTypes.Count == 0 ? "" : "; types added with this build: " + string.Join("; ", report.CreatedTypes.Take(10)) +
                                                   (report.CreatedTypes.Count > 10 ? $" (+{report.CreatedTypes.Count - 10} more)" : ""));

        // Every wall type by name, as GhostPlacementEngine reads them for the typing rule.
        private static Dictionary<string, WallType> WallTypes(Document doc) =>
            new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
                .GroupBy(w => w.Name, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        private static string Short(string id) => (id ?? "").Substring(0, Math.Min(8, (id ?? "").Length));
    }
}
