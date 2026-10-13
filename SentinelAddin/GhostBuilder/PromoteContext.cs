#nullable disable
// MA-2b — what Promote's LOD state and its check before commit read: the standards, the lod_matrix and the DD stage IDS the
// bridge makes from it (matrixToIds, GET /cde/:key/artefacts/lod_matrix/ids). Fetch runs OFF the API thread (the callers wrap it
// in Task.Run — the Annotate pattern); the judging runs ON it, read-only (GovernedElementExtractor), inside the changeset's open
// TransactionGroup when it checks before commit, the way the BLOCK check runs.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder
{
    public sealed class PromoteContext
    {
        public GhostStandards Standards;
        /// <summary>The parsed lod_matrix@n, or null (none installed, or one that did not parse: <see cref="MxLabel"/> says which).</summary>
        public LodMatrix Mx;
        public string MxLabel;
        /// <summary>The sha256 of the matrix body read (null with no matrix): the lod_state row carries it (review C3).</summary>
        public string MxSha;
        /// <summary>The classes Promote runs, and why the others do not (LodMatrix.Classes).</summary>
        public List<string> Classes, NotRun = new List<string>();
        /// <summary>The DD stage IDS, or null with <see cref="IdsWhy"/> (no matrix, a refusal, the bridge unreachable).</summary>
        public StageIds Ids;
        public string IdsWhy;
        /// <summary>MA-2c: the clauses of the project's installed ids@n (project → office) a DD property's value may be cited from —
        /// none, with why, when it is not installed or does not parse.</summary>
        public Clauses Clauses;

        /// <summary>The reads side by side. Blocking (the guideline and catalogue have their own caps, the matrix, the DD IDS and the
        /// ids@n 4 s); never throws. Call it OFF the API thread: Task.Run(() => PromoteContext.Fetch(key)).</summary>
        public static PromoteContext Fetch(string key)
        {
            var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
            var idsTask = Task.Run(() => { var json = ArtefactClient.StageIds(key, out var why); return (json, why); });
            var clauseTask = Task.Run(() => ArtefactClient.Resolve(key, "ids"));
            var pc = new PromoteContext { Standards = GhostStandards.Load(key, layers: false) };
            var src = mxTask.GetAwaiter().GetResult();
            if (src.Origin != "none")
            {
                pc.Mx = LodMatrix.FromBody(src.BodyJson ?? "", out var err); // a body it cannot read is none, never a partial matrix
                if (err != null) src = ArtefactClient.None("lod_matrix", $"{src.Label} did not parse: {err}");
            }
            pc.MxLabel = src.Label;
            pc.MxSha = pc.Mx != null ? src.Sha256 : null;
            pc.Classes = LodMatrix.Classes(pc.Mx, pc.MxLabel, pc.Standards.Guideline, pc.NotRun);
            var (idsJson, idsWhy) = idsTask.GetAwaiter().GetResult();
            if (idsJson != null) pc.Ids = StageIds.FromReply(idsJson, out idsWhy);
            // Review: the IDS judges only when it was made from the matrix read — else the LOD state reads not measured and the
            // check before commit says not checked, with why.
            if (pc.Ids != null && StageIds.NotFrom(pc.Ids, pc.MxSha, pc.MxLabel) is string other) { pc.Ids = null; idsWhy = other; }
            pc.IdsWhy = idsWhy;
            var ids = clauseTask.GetAwaiter().GetResult();
            pc.Clauses = ids.Origin == "none" ? Clauses.None(ids.Label) : Clauses.FromIds(ids.BodyJson, ids.Label, out _);
            return pc;
        }

        /// <summary>Design §3.4 step 5, the check before commit: the DD IDS judged on every element this changeset applied, read as
        /// the IDS reads it, each against its own class's specification only. The lines of the elements that fail ("W 312 (Walls ·
        /// DD): missing Pset_WallCommon.FireRating"), the requirements Revit cannot read, and what was not judged at all (review C2):
        /// the matrix's properties matrixToIds could not place for an applied class, an element exported as another class, an
        /// element not found or not read — and how many elements were judged (review: "passed" is never said of none). MA-6-2: every
        /// source's changeset is checked, so a kind Promote has no class for is no longer a silent skip: a level, grid, room or opening
        /// — no DD class asks anything of it — is counted in OutOfScope (said, and "passed" still stands); any other (a column, a beam,
        /// furniture: the matrix could ask for it) is not judged, so "passed" is not said. API thread, read-only — safe inside the open
        /// TransactionGroup.</summary>
        public static (List<string> Fails, List<string> NotRead, List<string> NotJudged, List<string> OutOfScope, int Judged) JudgeApplied(Document doc, StageIds ids, IEnumerable<AppliedEntry> applied, IReadOnlyDictionary<string, string> kindOf)
        {
            var fails = new List<string>();
            var notRead = new List<string>();
            var notJudged = new List<string>();
            var outOfScope = new List<string>();
            var noClass = new List<string>();
            int judged = 0;
            string org = App.OrgFor(doc);
            foreach (var a in applied.GroupBy(x => x.RevitUniqueId).Select(g => g.First()))
            {
                if (!kindOf.TryGetValue(a.ProposalGuid, out var kind)) continue; // a set_parameter's type: judged on the elements retyped onto it
                if (!PromoteWallsPlanner.Classes.TryGetValue(kind ?? "wall", out var cls)) { (NoDdClass.Contains(kind) ? outOfScope : noClass).Add(kind); continue; }
                notJudged.AddRange(ids.Unmatched.Where(u => u.StartsWith(cls.Category + ": ", StringComparison.Ordinal)).Select(u => "not in the DD IDS: " + u));
                var spec = ids.For(cls.Category);
                if (spec == null) continue; // the matrix asks nothing of this class that the IDS could place (the rest is said above)
                if (doc.GetElement(a.RevitUniqueId) is not Element e) { notJudged.Add($"{cls.Word} {a.RevitUniqueId}: not found after Apply"); continue; }
                string label = cls.Word + " " + e.Id.IdValue();
                var g = GovernedElementExtractor.ExtractByIds(doc, doc.Title, new[] { e.Id }, org).FirstOrDefault();
                if (g == null) { notJudged.Add(label + ": the extractor read nothing"); continue; }
                var v = ids.Judge(g.identity.Class, StageIds.ValuesOf(g), org, spec);
                if (!v.InScope) { notJudged.Add($"{label} is exported as {g.identity.Class}, which the DD IDS for {cls.Category} ({spec.Entity}) does not judge"); continue; }
                judged++;
                if (StageIds.Line(label, spec.Name, v) is string line) fails.Add(line);
                notRead.AddRange(v.NotRead);
            }
            notJudged.AddRange(noClass.GroupBy(k => k, StringComparer.Ordinal).Select(g => PromoteWallsPlanner.Structure.ContainsKey(g.Key ?? "") // MA-8-7: said as it is - structure is not a matrix class (D-B3-3)
                ? $"{g.Count()} {g.Key}(s): structure is outside the LOD matrix - the DD IDS judges no structure"
                : $"{g.Count()} {g.Key}(s): the DD IDS made from the LOD matrix has no class for this kind yet"));
            return (fails, notRead, notJudged, outOfScope, judged);
        }

        /// <summary>MA-6-2: the kinds no DD class asks anything of — JudgeApplied counts them out of scope, never "not judged". MA-6-6: a mass
        /// too (its storeys are judged once Shell a Mass files them), so "not asked of 1 mass(es)" and "passed" still stands. MA-8-10: a stair too (the DD IDS
        /// asks nothing of IFCSTAIR; the as-built count has it out_of_scope).</summary>
        public static readonly HashSet<string> NoDdClass = new HashSet<string>(StringComparer.Ordinal) { "level", "grid", "room", "opening", "mass", "stair" };

        /// <summary>MA-6-2 (review amendment 5): the kinds read again as built — the ones GovernedElementExtractor gives an IFC class; the
        /// bridge counts every other kind under as_built.out_of_scope (changesets-store AS_BUILT_KINDS, the same list).</summary>
        public static readonly HashSet<string> AsBuiltKinds = new HashSet<string>(StringComparer.Ordinal) { "wall", "floor", "roof", "ceiling", "door", "window", "column", "beam" };

        /// <summary>MA-6-2 (design §4.6 step 3, D10): each applied element of <see cref="AsBuiltKinds"/> read again as the IDS reads it
        /// (GovernedElementExtractor — the read JudgeApplied judges), set on its entry's AsBuilt with the keys Sentinel has a reader for on its
        /// class (Readable, risk R4); the bridge judges them against the installed ids@n. A set_parameter's entry (a type) is not in
        /// <paramref name="kindOf"/>. API thread, read-only — safe inside the open group. Never throws: a read that fails leaves every
        /// AsBuilt null and answers the note's line; null when the read ran.</summary>
        public static string ReadAsBuilt(Document doc, IReadOnlyList<AppliedEntry> applied, IReadOnlyDictionary<string, string> kindOf)
        {
            try
            {
                string org = App.OrgFor(doc);
                var mine = applied.Where(a => a.RevitUniqueId != null && kindOf.TryGetValue(a.ProposalGuid, out var k) && AsBuiltKinds.Contains(k)).ToList();
                var ids = mine.Select(a => doc.GetElement(a.RevitUniqueId)?.Id).Where(id => id != null).Distinct().ToList();
                var read = GovernedElementExtractor.ExtractByIds(doc, doc.Title, ids, org).ToDictionary(g => g.localId);
                foreach (var a in mine)
                    if (read.TryGetValue(a.RevitElementId, out var g)) { a.AsBuilt = g; a.Readable = PsetMap.Readable(org, g.identity.Class); }
                return null;
            }
            catch (Exception ex)
            {
                foreach (var a in applied) { a.AsBuilt = null; a.Readable = null; }
                // MA-6-2 review: with no entry carrying as_built the bridge stores no result.as_built at all — said as it is
                return $"As built: not read — {ex.GetType().Name}: {ex.Message}. Nothing was judged: no as-built verdict is recorded for this Apply";
            }
        }

        /// <summary>Ask the person, modal, in the same API call (the group still open): true = place anyway. Closing is going back.</summary>
        public static bool PlaceAnyway(IReadOnlyList<string> fails, string matrix, string what)
        {
            var td = new TaskDialog("Sentinel — DD IDS check")
            {
                MainInstruction = StageIds.Headline(fails.Count, matrix, what.StartsWith("storey ", StringComparison.Ordinal) ? "This " + what : null),
                MainContent = string.Join("\n", StageIds.Tally(fails).Select(t => "• " + t)) + "\n\nEach element is named under See details." +
                              "\n\nThe DD IDS is made from the LOD matrix's properties (matrixToIds). A missing value is a gap at DD, not an error in the model.",
                // ponytail: 200 named lines, the tally above counts every one; a scrollable list if a real office's changeset outgrows it
                ExpandedContent = string.Join("\n", fails.Take(200)) + (fails.Count > 200 ? $"\n… and {fails.Count - 200} more (counted above)" : ""),
                AllowCancellation = true,
            };
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Go back", $"Nothing is placed: {what} is rolled back and the model stays as it was.");
            td.AddCommandLink(TaskDialogCommandLinkId.CommandLink2, "Place anyway", "The elements stay below DD in the LOD state until the values are filled.");
            td.DefaultButton = TaskDialogResult.CommandLink1;
            return td.Show() == TaskDialogResult.CommandLink2;
        }
    }
}
