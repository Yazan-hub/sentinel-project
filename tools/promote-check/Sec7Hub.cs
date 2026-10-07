#nullable disable
static partial class Check
{
    // ── SEC-7: every Sentinel window's Revit action goes through the event hub — one ExternalEvent, one watch (SEC-6 review C9) ──
    static void Sec7HubChecks()
    {
        Console.WriteLine("\nSEC-7 — every Sentinel window's Revit action goes through the event hub");
        var sep = Path.DirectorySeparatorChar;
        var makers = Directory.EnumerateFiles(Repo("SentinelAddin"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains(sep + "bin" + sep) && !f.Contains(sep + "obj" + sep))
            .Where(f => File.ReadAllText(f).Contains("ExternalEvent.Create("))
            .Select(Path.GetFileName).OrderBy(n => n).ToList();
        Ok(makers.Count == 1 && makers[0] == "RevitEventHub.cs",
           "the event hub owns the add-in's one ExternalEvent — no other add-in source makes one (found: " + string.Join(", ", makers) + ")");
        string ghost = Src("Commands.GhostBuilder.cs"), massing = Src("Commands.Massing.cs"), review = Src("Commands.ReviewChangesets.cs");
        Ok(ghost.Contains("App.Events!.Enqueue(ua => placementEvent.Execute(ua), \"place the Ghost Builder build\");") && !ghost.Contains(".Raise()") && !ghost.Contains("externalEvent"),
           "Ghost Builder's Build goes through the hub — a request Revit does not take at once is said and raised again, never dropped unsaid");
        Ok(massing.Contains("if (App.Events is null) { review.Reopen(MassingPlanner.NotStarted(\"Sentinel's event hub is not running — restart Revit\")); return; }")
           && massing.Contains("App.Events.Enqueue(ua => placementEvent.Execute(ua), \"place the massing build\");")
           && !massing.Contains("externalEvent") && !massing.Contains("Revit did not accept the build request"),
           "Photo Massing's Build goes through the hub; a Pending answer no longer reopens the review (the request is held, not lost); a missing hub is said in the review");
        Ok(review.Contains("App.Events.Enqueue(ua => handler.Execute(ua), \"apply the proposals\");") && !review.Contains("evt.Raise()") && !review.Contains("Revit did not take the request"),
           "Review AI Proposals' Apply goes through the hub — Apply stays pressed until Completed, whatever Revit answered the raise");
    }
}
