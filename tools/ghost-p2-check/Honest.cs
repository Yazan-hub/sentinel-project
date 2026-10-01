// MA-1a step 1 (GHB-5) — Ghost Builder's honest build, offline: the failure rule (GhostFailurePolicy), the family-type pick
// (GhostTypePick) and the review's type drop-down (GhostReviewWindow). All Revit-free; the Revit halves are drilled live.
using System.Windows.Controls;
using Sentinel.GhostBuilder;
using Sentinel.UI;

static partial class Check
{
    static void Honest()
    {
        Policy();
    }

    // ── the failure rule: a user's element is never deleted or resolved; warnings are counted, never erased ──
    static void Policy()
    {
        Console.WriteLine("\nMA-1a — Ghost's failure rule (GhostFailurePolicy)");
        var ours = new HashSet<long> { 101, 102, 103 };
        var W = GhostFailurePolicy.Severity.Warning;
        var E = GhostFailurePolicy.Severity.Error;
        GhostFailurePolicy.Act D(GhostFailurePolicy.Severity s, bool res, long[] failing, long[]? additional = null, bool tried = false) =>
            GhostFailurePolicy.Decide(s, res, failing, additional ?? Array.Empty<long>(), ours, tried);

        Ok(D(W, true, new long[] { 900 }) == GhostFailurePolicy.Act.Count && D(W, false, new long[] { 101 }) == GhostFailurePolicy.Act.Count,
           "a warning is counted, never erased or resolved — whoever's element it names");
        Ok(D(E, true, new long[] { 101 }, new long[] { 102 }) == GhostFailurePolicy.Act.Resolve,
           "an error naming only this build's elements takes Revit's own resolution");
        Ok(D(E, true, new long[] { 101 }, tried: true) == GhostFailurePolicy.Act.DeleteOurs,
           "…once: the same failure back after its resolution deletes this build's elements instead (no endless loop)");
        Ok(D(E, false, new long[] { 101, 102 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 102 }, ours).SequenceEqual(new long[] { 101, 102 }),
           "an error with no resolution naming only ours deletes them");
        Ok(D(E, true, new long[] { 101, 900 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 101, 900, 101 }, ours).SequenceEqual(new long[] { 101 }),
           "an error naming the user's element 900 and ours 101: only 101 is deleted, and Revit's resolution is never applied");
        Ok(D(E, true, new long[] { 101 }, new long[] { 900 }) == GhostFailurePolicy.Act.DeleteOurs,
           "a user's element among the additional ids also keeps Revit's resolution away");
        Ok(D(E, true, new long[] { 900, 901 }) == GhostFailurePolicy.Act.RollBack
           && D(E, false, new long[] { 900 }) == GhostFailurePolicy.Act.RollBack,
           "an error naming only the user's elements rolls the build back — nothing of theirs is deleted");
        // A5: (failing ∪ additional) ∩ ours — a user's wall failing with a new wall as additional ("Can't keep elements joined").
        Ok(D(E, false, new long[] { 900 }, new long[] { 101 }) == GhostFailurePolicy.Act.DeleteOurs
           && GhostFailurePolicy.ToDelete(new long[] { 900 }, ours, new long[] { 101, 900 }).SequenceEqual(new long[] { 101 }),
           "a user's element failing with ours among the additional ids: only ours (101) is deleted, never 900");
        Ok(D(E, true, new long[0]) == GhostFailurePolicy.Act.RollBack,
           "an error naming no element rolls back — never Revit's modal dialog, never a guess");
        Ok(D(GhostFailurePolicy.Severity.Corruption, true, new long[] { 101 }) == GhostFailurePolicy.Act.RollBack,
           "document corruption is never committed through");
        Ok(GhostFailurePolicy.RollBackReason("Can't keep elements joined.", E, new long[] { 900, 901 })
               == "Can't keep elements joined. (it names element(s) 900, 901, which this build did not create — Sentinel never deletes or resolves those)",
           "a rollback names the user's elements by id");
        Ok(GhostFailurePolicy.RollBackReason(null!, E, new long[0]) == "a Revit failure (Revit names no element, so Sentinel cannot tell it is this build's own)",
           "…and says so when Revit names none");

        Ok(GhostFailurePolicy.PlacedLine(9, new List<string>()) == "Placed: 9", "Placed alone when Revit removed nothing");
        Ok(GhostFailurePolicy.PlacedLine(9, new List<string> { "Walls on 'A-WALL' — Can't make Wall.", "Doors on 'A-DOOR' — X.", "Walls on 'A-WALL' — Can't make Wall." })
               == "Placed: 9 (3 deleted by Revit: Walls on 'A-WALL' — Can't make Wall. ×2; Doors on 'A-DOOR' — X.)",
           "Placed 9 (3 deleted by Revit: …) — each named with the failure that named it, repeats collapsed");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int>()) == null, "no Revit warning, no line");
        Ok(GhostFailurePolicy.WarningsLine(new Dictionary<string, int> { ["Highlighted walls overlap."] = 2, ["There are identical instances in the same place."] = 1 })
               == "Revit warnings raised by this build: 3 — left in the model (Manage ▸ Review Warnings), never erased: Highlighted walls overlap. ×2; There are identical instances in the same place.",
           "warnings are counted by text and said to be left in the model");
        var seen = new List<(string Key, string Text, IReadOnlyCollection<long> Ids)>
        {
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),
            ("k1", "Highlighted walls overlap.", new long[] { 101, 900 }),   // the same warning, shown again on the next pass
            ("k2", "Highlighted walls overlap.", new long[] { 102, 103 }),
            ("k3", "There are identical instances in the same place.", new long[] { 103 }),
        };
        string Counted(ISet<long> gone) =>
            string.Join("; ", GhostFailurePolicy.CountWarnings(seen, gone).OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => $"{kv.Key}={kv.Value}"));
        Ok(Counted(new HashSet<long>()) == "Highlighted walls overlap.=2; There are identical instances in the same place.=1",
           "a warning seen on two passes counts once; two warnings with the same text count two");
        Ok(Counted(new HashSet<long> { 103 }) == "Highlighted walls overlap.=1",
           "a warning naming an element of this build that Revit removed is not counted — it went with the element");
        Ok(GhostFailurePolicy.NotBuiltLine("X (y)") == "Nothing was built — Revit rolled the build back, so the model is as it was before Build: X (y)",
           "a rolled-back build reads as nothing built");
        Ok(GhostFailurePolicy.NotFinishedLine("Pending") == "Revit has not finished the build (status Pending) — check the model before re-running",
           "A6: a build Revit has not finished (Pending) reads as not finished — never as nothing built, never recounted");
        Ok(GhostFailurePolicy.DoctorSkips("Ghost Builder - LOD 200") && !GhostFailurePolicy.DoctorSkips("Sentinel: Fix") && !GhostFailurePolicy.DoctorSkips(null!),
           "A4: the Doctor skips the Ghost transaction only — it never erases a warning Ghost counts");
        Ok(GhostFailurePolicy.TypeParamBlocked(true, "Ghost 275mm", 0) == null,
           "A7: a type this build added takes the type parameter");
        Ok(GhostFailurePolicy.TypeParamBlocked(false, "Generic - 200mm", 3) == "not applied to type \"Generic - 200mm\" — it would change 3 existing instance(s)"
           && GhostFailurePolicy.TypeParamBlocked(false, "Generic - 200mm", 0) == "not applied to type \"Generic - 200mm\" — it is the model's own type, not one this build added",
           "A7: a type the model already had is never written — the Note says how many existing instances it would change");
    }
}
