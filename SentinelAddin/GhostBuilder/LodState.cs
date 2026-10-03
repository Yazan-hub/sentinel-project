#nullable disable
// MA-2b — the LOD state reader and the stage IDS judge, pure (no Revit API, no HTTP), so tools/promote-check drives both.
//
// AN ELEMENT'S LOD STATE (design §3.2) is the highest matrix stage whose rules it passes; Promote checks the DD stage only,
// so an element is AT DD, BELOW DD (the rules it fails give the reasons), BLOCKED (held for a reason Promote cannot act on:
// a group, a design option, structure, not a basic wall, not on a Building Story, not editable) or NOT MEASURED (a rule
// whose fact Sentinel cannot read — a property with no Revit reader, the stage IDS not read, an element exported as another
// IFC class). Nothing is guessed: a stage is passed only when every one of its rules was read and met. The facts are the
// ones Promote already read (its plan's per-element verdicts, StoreyPlan.Lod) and the stage IDS judged on the elements the
// rules pass; the counts go to Promote's header, one lod_state ledger row (CommandReports.LodState), and from the ledger to
// the pane, the Next strip and the stage gate.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    /// <summary>One element as Promote's plan judged it against the matrix's DD rules (StoreyPlan.Lod): RulesOk = its type and
    /// top (doors and windows: type and host) are DD; Blocked = held whole for a reason Promote cannot act on. An element on the
    /// office's other types is not a fact (it is left out of the count, as Promote leaves it out of "DD now").</summary>
    public sealed class LodFact
    {
        public string UniqueId, Category;
        public bool RulesOk, Blocked;
    }

    /// <summary>MA-2b (design §3.4 step 5): the DD stage IDS the bridge makes from the lod_matrix (matrixToIds, GET
    /// /cde/:key/artefacts/lod_matrix/ids), judged on what Revit reads. A required property passes when its pset row is present
    /// and not empty (sentinel-core validateElement); it is MISSING when Sentinel reads it and it is absent; it is NOT READ —
    /// never passed, never failed — when Sentinel has no reader for it on that IFC class (PsetMap). tools/promote-check holds
    /// Judge to validateElement on WebApp/bridge/fixtures/lod-matrix/ids-cases.json.</summary>
    public sealed class StageIds
    {
        public sealed class Spec { public string Name, Entity; public List<string> Required = new List<string>(); }
        public sealed class Verdict
        {
            public string Class;
            public bool InScope;
            /// <summary>Every requirement that did not pass, in the IDS's order (validateElement's failures).</summary>
            public List<string> Failed = new List<string>();
            public List<string> Missing = new List<string>(), NotRead = new List<string>();
        }

        public string Title, Matrix;
        public List<Spec> Specs = new List<Spec>();
        /// <summary>The matrix's properties matrixToIds could not place, as "Floors: Combustible — no standard property set …".</summary>
        public List<string> Unmatched = new List<string>();

        /// <summary>The route's reply {matrix, ids, unmatched} → the IDS, or null with <paramref name="error"/>. Never throws.</summary>
        public static StageIds FromReply(string json, out string error)
        {
            error = null;
            try
            {
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    var r = d.RootElement;
                    var s = FromIds(r.GetProperty("ids"));
                    s.Matrix = r.TryGetProperty("matrix", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
                    if (r.TryGetProperty("unmatched", out var u) && u.ValueKind == JsonValueKind.Array)
                        s.Unmatched = u.EnumerateArray().Select(x => $"{x.GetProperty("category").GetString()}: {x.GetProperty("property").GetString()} — {x.GetProperty("reason").GetString()}").ToList();
                    return s;
                }
            }
            catch (Exception ex) { error = "the DD IDS reply could not be read (" + ex.Message + ")"; return null; }
        }

        /// <summary>An IDS in the JSON spec shape → its specifications' entities and required "Pset.Prop" keys.</summary>
        public static StageIds FromIds(JsonElement ids)
        {
            var s = new StageIds { Title = ids.TryGetProperty("title", out var t) ? t.GetString() : null };
            foreach (var spec in ids.GetProperty("specifications").EnumerateArray())
            {
                var one = new Spec { Name = spec.GetProperty("name").GetString(), Entity = spec.GetProperty("applicability").GetProperty("entity").GetString() };
                foreach (var p in spec.GetProperty("requirements").GetProperty("properties").EnumerateArray())
                    if (p.GetProperty("cardinality").GetString() == "required") one.Required.Add(p.GetProperty("pset").GetString() + "." + p.GetProperty("name").GetString());
                s.Specs.Add(one);
            }
            return s;
        }

        /// <summary>The specification of a lod_matrix category (matrixToIds names it "&lt;Category&gt; · DD"), or null.</summary>
        public Spec For(string category) => Specs.FirstOrDefault(x => x.Name == category + " · DD");

        /// <summary>One element, as GovernedElementExtractor read it: its IFC class and its "Pset.Prop" values. With
        /// <paramref name="only"/> — the LOD state and the check before commit pass the element's own class's specification — that
        /// one alone, so another class's specification never stands for it (a door exported as IFCWINDOW is out of scope, not judged
        /// as a window); without it, every specification whose entity matches, as validateElement (the parity check).</summary>
        public Verdict Judge(string ifcClass, IReadOnlyDictionary<string, string> values, string org, Spec only = null)
        {
            var v = new Verdict { Class = ifcClass };
            var entries = PsetMap.Entries(org);
            foreach (var spec in (only != null ? new List<Spec> { only } : Specs).Where(x => Regex.IsMatch(ifcClass ?? "", x.Entity ?? "", RegexOptions.IgnoreCase)))
            {
                v.InScope = true;
                foreach (var key in spec.Required)
                {
                    bool read = entries.Any(e => string.Equals(e.Key, key, StringComparison.OrdinalIgnoreCase)
                                                 && (e.Classes.Length == 0 || e.Classes.Contains(ifcClass, StringComparer.OrdinalIgnoreCase)));
                    if (values != null && values.TryGetValue(key, out var val) && !string.IsNullOrEmpty(val)) continue;
                    v.Failed.Add(key);
                    (read ? v.Missing : v.NotRead).Add(key);
                }
            }
            return v;
        }

        /// <summary>An extracted element's values, "Pset.Prop" → value (the first row of a name, case ignored).</summary>
        public static Dictionary<string, string> ValuesOf(GovElement e)
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var g in e?.psets ?? new List<GovGroup>())
                foreach (var r in g.rows ?? new List<GovRow>())
                    if (!d.ContainsKey(g.name + "." + r.name)) d[g.name + "." + r.name] = r.value;
            return d;
        }
    }

    /// <summary>One level and one class: its elements by LOD state, the reasons with their counts (most first).</summary>
    public sealed class LodClassRow
    {
        public string Level, Category;
        public int Total, At, Below, Blocked, NotMeasured;
        public List<KeyValuePair<string, int>> Reasons = new List<KeyValuePair<string, int>>();
    }

    public sealed class LodStateReport
    {
        /// <summary>"now" (Promote's header, step 2) or "after" (a Promote changeset applied, step 10).</summary>
        public string When = "now";
        /// <summary>The matrix stage checked and the project stage the matrix's stage_map ties it to (D18).</summary>
        public string Stage = "DD", ProjectStage;
        /// <summary>The labels of what judged: the lod_matrix, the DD IDS (or why it was not read), the guideline.</summary>
        public string Matrix, Ids, Guideline;
        /// <summary>The sha256 of the lod_matrix body that judged (the bridge's, ResolvedArtefact.Sha256): the gate and the journey
        /// read the row only while that matrix is still the one in force.</summary>
        public string MatrixSha;
        public List<LodClassRow> Rows = new List<LodClassRow>();
        /// <summary>The classes not measured at all, with the reason (Promote did not run them: LodMatrix.Classes).</summary>
        public List<string> NotRun = new List<string>();

        public int Total => Rows.Sum(r => r.Total);
        public int At => Rows.Sum(r => r.At);
        public int Below => Rows.Sum(r => r.Below);
        public int Blocked => Rows.Sum(r => r.Blocked);
        public int NotMeasured => Rows.Sum(r => r.NotMeasured);
        /// <summary>The classes the matrix has a DD row for that Promote did not run (every NotRun reason but "no DD row"): the
        /// share never stands for classes it did not count.</summary>
        public List<string> Unmeasured => NotRun.Where(n => !n.EndsWith(": no DD row in the LOD matrix", StringComparison.Ordinal)).ToList();
        /// <summary>The share at DD, whole percent rounded down; null — not measured, never 0 — when nothing was counted, or when a
        /// class the matrix asks for was not run (<see cref="Unmeasured"/>).</summary>
        public int? Share => Total == 0 || Unmeasured.Count > 0 ? (int?)null : At * 100 / Total;

        /// <summary>The one line the pane, the Next strip and the web print: "DD → design: 38 of 264 at DD (14%) · 212 below · 14
        /// blocked · 0 not measured" (+ " · Floors, Roofs not measured").</summary>
        public string Line =>
            $"{Stage} → {ProjectStage}: {At} of {Total} at {Stage}" + (Share is int s ? $" ({s}%)" : "") +
            $" · {Below} below · {Blocked} blocked · {NotMeasured} not measured" +
            (NotRun.Count > 0 ? " · " + string.Join(", ", NotRun.Select(n => n.Split(':')[0])) + " not measured" : "");

        /// <summary>Per level and class: "Level 3 · Walls: 38 at DD, 212 below, 14 blocked, 0 not measured (in a group ×10; …)".</summary>
        public List<string> LevelLines(int reasons = 2) => Rows.Select(r =>
            $"{r.Level} · {r.Category}: {r.At} at {Stage}, {r.Below} below, {r.Blocked} blocked, {r.NotMeasured} not measured" +
            (r.Reasons.Count == 0 ? "" : " (" + string.Join("; ", r.Reasons.Take(reasons).Select(kv => kv.Key + " ×" + kv.Value.ToString(CultureInfo.InvariantCulture)))
                                         + (r.Reasons.Count > reasons ? "; …" : "") + ")")).ToList();
    }

    public static class LodState
    {
        /// <summary>Promote's plans → the LOD state per level and class. <paramref name="mx"/> is the parsed matrix (its stage map
        /// and each class's properties); <paramref name="ids"/> the DD IDS, or null with <paramref name="idsWhy"/> saying why it was
        /// not read; <paramref name="props"/> the IDS verdict of each element whose DD rules pass (the elements read).</summary>
        public static LodStateReport Read(IReadOnlyList<StoreyPlan> plans, LodMatrix mx, StageIds ids, string idsWhy,
                                          IReadOnlyDictionary<string, StageIds.Verdict> props, IEnumerable<string> notRun)
        {
            var r = new LodStateReport { ProjectStage = mx.StageMap["DD"], NotRun = (notRun ?? Enumerable.Empty<string>()).ToList() };
            foreach (var p in plans)
                foreach (var cat in LodMatrix.Order)
                {
                    var facts = p.Lod.Where(f => f.Category == cat).ToList();
                    if (facts.Count == 0) continue;
                    var row = new LodClassRow { Level = p.Storey, Category = cat, Total = facts.Count };
                    var reasons = new Dictionary<string, int>(StringComparer.Ordinal);
                    void Why(string reason) => reasons[reason] = reasons.TryGetValue(reason, out var n) ? n + 1 : 1;
                    var asks = mx.Properties.TryGetValue(cat, out var ps) ? ps : new List<string>();
                    var unmatched = ids?.Unmatched.Where(u => u.StartsWith(cat + ": ", StringComparison.Ordinal)).ToList() ?? new List<string>();
                    foreach (var f in facts)
                    {
                        var held = p.Held.Where(h => h.UniqueId == f.UniqueId).Select(h => h.Reason).ToList();
                        if (f.Blocked) { row.Blocked++; held.Take(1).ToList().ForEach(Why); continue; }
                        if (!f.RulesOk)
                        {
                            row.Below++;
                            held.ForEach(Why);
                            var ghosts = held.Count > 0 ? new List<PromoteGhost>() : p.Ghosts.Where(x => x.UniqueId == f.UniqueId).ToList();
                            foreach (var g in ghosts)
                                Why(g.Op == "attach" ? "top not at the next story — Promote proposes an attach" : "not on a DD type — Promote proposes a retype");
                            // Below with nothing held and nothing proposed: a settled door or window no wall hosts (Plan1 counts it out
                            // of "DD now" and proposes nothing) — never a count with no reason.
                            if (held.Count == 0 && ghosts.Count == 0)
                                Why(cat == "Doors" || cat == "Windows" ? "on a DD type, but no wall hosts it — Promote does not rehost; a person decides"
                                                                       : "below DD, and Promote proposes nothing for it — a person decides");
                            continue;
                        }
                        if (asks.Count == 0) { row.At++; continue; }
                        if (ids == null) { row.NotMeasured++; Why("the DD IDS was not read: " + idsWhy); continue; }
                        var spec = ids.For(cat);
                        props.TryGetValue(f.UniqueId, out var v);
                        if (spec == null && unmatched.Count == 0)
                        {   // the matrix asks, the IDS has nothing for the class: never at DD on rules alone
                            row.NotMeasured++;
                            Why($"the DD IDS names no {cat} specification — the matrix asks {string.Join(", ", asks)}");
                        }
                        else if (spec != null && (v == null || !v.InScope))
                        {
                            row.NotMeasured++;
                            Why(v == null ? "its properties were not read" : $"exported as {v.Class}, which the DD IDS for {cat} ({spec.Entity}) does not judge");
                        }
                        else if (v != null && v.Missing.Count > 0) { row.Below++; v.Missing.ForEach(m => Why("missing " + m)); }
                        else if (v != null && v.NotRead.Count > 0) { row.NotMeasured++; v.NotRead.ForEach(m => Why("no Revit reader for " + m)); }
                        else if (unmatched.Count > 0) { row.NotMeasured++; unmatched.ForEach(u => Why("not in the DD IDS: " + u.Substring(cat.Length + 2))); }
                        else row.At++;
                    }
                    row.Reasons = reasons.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).ToList();
                    r.Rows.Add(row);
                }
            return r;
        }
    }
}
