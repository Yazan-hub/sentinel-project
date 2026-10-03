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

        /// <summary>The three reads side by side. Blocking (the guideline and catalogue have their own caps, the matrix and the IDS
        /// 4 s); never throws. Call it OFF the API thread: Task.Run(() => PromoteContext.Fetch(key)).</summary>
        public static PromoteContext Fetch(string key)
        {
            var mxTask = Task.Run(() => ArtefactClient.Resolve(key, "lod_matrix"));
            var idsTask = Task.Run(() => { var json = ArtefactClient.StageIds(key, out var why); return (json, why); });
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
            return pc;
        }

        /// <summary>Design §3.4 step 5, the check before commit: the DD IDS judged on every element this changeset applied, read as
        /// the IDS reads it, each against its own class's specification only. The lines of the elements that fail ("W 312 (Walls ·
        /// DD): missing Pset_WallCommon.FireRating"), the requirements Revit cannot read, and what was not judged at all (review C2):
        /// the matrix's properties matrixToIds could not place for an applied class, an element exported as another class, an
        /// element not found or not read — and how many elements were judged (review: "passed" is never said of none). API thread,
        /// read-only — safe inside the open TransactionGroup.</summary>
        public static (List<string> Fails, List<string> NotRead, List<string> NotJudged, int Judged) JudgeApplied(Document doc, StageIds ids, IEnumerable<AppliedEntry> applied, IReadOnlyDictionary<string, string> kindOf)
        {
            var fails = new List<string>();
            var notRead = new List<string>();
            var notJudged = new List<string>();
            int judged = 0;
            string org = App.OrgFor(doc);
            foreach (var a in applied.GroupBy(x => x.RevitUniqueId).Select(g => g.First()))
            {
                if (!kindOf.TryGetValue(a.ProposalGuid, out var kind) || !PromoteWallsPlanner.Classes.TryGetValue(kind ?? "wall", out var cls)) continue;
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
            return (fails, notRead, notJudged, judged);
        }

        /// <summary>Ask the person, modal, in the same API call (the group still open): true = place anyway. Closing is going back.</summary>
        public static bool PlaceAnyway(IReadOnlyList<string> fails, string matrix, string what)
        {
            var td = new TaskDialog("Sentinel — DD IDS check")
            {
                MainInstruction = StageIds.Headline(fails.Count, matrix),
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
