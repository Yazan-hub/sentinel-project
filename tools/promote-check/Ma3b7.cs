#nullable disable
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 54. MA-3b7: Ghost Builder files and withdraws off Revit's thread — its words (pure) and its wiring (source scans; drill MA3b7) ──
    static void Ma3b7Checks()
    {
        Console.WriteLine("\nMA-3b7 — Ghost Builder files and withdraws off Revit's thread");
        Ok(GhostFailurePolicy.FilingLine(3, true) == "Ghost Builder: the types proved and the build planned; filing 3 changeset(s) off Revit's thread — Revit stays usable, and the build places by itself in this model once the bridge has answered."
           && GhostFailurePolicy.FilingLine(0, false) == "Ghost Builder: the types proved and the build planned; this model is not bound to a web project, so nothing is filed — the build places by itself.",
           "the Doctor line says the filing runs off Revit's thread, or that an unbound model files nothing");
        Ok(GhostFailurePolicy.NotPlacedLine("the model in front is \"other.rvt\", not \"ma.rvt\"") == "Nothing was built — the model in front is \"other.rvt\", not \"ma.rvt\". The build was planned for the model it started from and places only there; run Build again in that model.",
           "DocPin: a build whose model was switched or closed says nothing was built and where to run it again");
        Ok(GhostFailurePolicy.WithdrawingLine(2) == "Ledger: withdrawing the 2 changeset(s) already filed, off Revit's thread — the pane's Doctor log says what the bridge answered (one it did not answer is named there: withdraw it on the web before anyone reviews it).",
           "a rolled-back build says its filed changesets are withdrawn off Revit's thread and where the answer is");
        string ghost = Src("GhostBuilder", "GhostChangesetBuild.cs"), ev = Src("GhostBuilder", "GhostBuilderExternalEvent.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        int Count(string s, string what) { int n = 0, i = 0; while ((i = s.IndexOf(what, i, StringComparison.Ordinal)) >= 0) { n++; i += what.Length; } return n; }
        int file = At(ghost, "public static Filed File("), place = At(ghost, "public static GhostPlacementEngine.PlacementReport Place("), propose = At(ghost, "ChangesetClient.Propose(");
        Ok(ghost.Contains("public static Prepared Prepare(UIApplication app, Request r)") && ghost.Contains("public static Filed File(Prepared p)")
           && ghost.Contains("public static GhostPlacementEngine.PlacementReport Place(UIApplication app, Document doc, Prepared p, Filed filed)")
           && Count(ghost, "ChangesetClient.Propose(") == 1 && propose > file && file > 0 && propose < place
           && Count(ghost, "new TransactionGroup(doc, \"Ghost Builder\")") == 2 && !ghost.Contains("public static GhostPlacementEngine.PlacementReport Run("),
           "MA-3b7: the dry run (A), the pool-thread filing and the build (B) are three entry points; the filing lives in File alone and the build has its own group");
        Ok(ev.Contains("Task.Run(() => GhostChangesetBuild.File(prep))") && ev.Contains("App.Events.Enqueue(doc, \"place the Ghost Builder build\"")
           && ev.Contains("GhostChangesetBuild.NotPlaced(prep, filed, why)"),
           "MA-3b7: the controller files on a pool thread and places in a second event in the model it started from; a refusal says nothing was placed");
        // Place delegates to Build, which holds the build's group
        int build = At(ghost, "private static GhostPlacementEngine.PlacementReport Build(");
        int start = ghost.IndexOf("group.Start();", build, StringComparison.Ordinal), end = ghost.IndexOf("group.Assimilate()", start, StringComparison.Ordinal);
        bool outside = true; for (int i = 0; (i = ghost.IndexOf("Withdraw(", i, StringComparison.Ordinal)) >= 0; i++) if (i > start && i < end) outside = false;
        Ok(start > 0 && end > start && outside, "MA-3b7: no withdrawal sits inside the build's open group (they run off Revit's thread)");
    }
}
