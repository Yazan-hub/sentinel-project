#nullable disable
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 52. MA-3b5: Promote reads and files off Revit's thread — the words of its wait and its stall rule (pure); its wiring is
    //        section 52b (Ma3b5Wiring.cs, source scans; drill MA3b5) ──────────────────────────────────────────────────────────────
    static void Ma3b5WordChecks()
    {
        Console.WriteLine("\nMA-3b5 — Promote's wait: its words and its stall rule");
        const string noAnswer = "the bridge did not answer within 120 s";
        var sent = new List<string>();
        // Review C16: no queue — a Stalling that never stalls posts the third body and fails this check, never crashes the run.
        var post = PropertyPlanner.Stalling((body, retry) => { sent.Add((string)body); return sent.Count == 1 ? null : noAnswer; });
        var got = new[] { "GR-FFL", "01-FFL", "MA0 Roof" }.Select(b => post(b, false)).ToList();
        Ok(sent.SequenceEqual(new[] { "GR-FFL", "01-FFL" }) && got[0] == null && got[1] == noAnswer
           && got[2] == "not sent: an earlier filing of this run failed without a refusal from the bridge (the bridge did not answer within 120 s) — run Promote (DD) again once it answers", // C5
           "F4: after the first filing the bridge did not answer, the rest are not sent — Promote's guard waits one write timeout, never one per storey");
        var asked = new List<string>();
        var refusing = PropertyPlanner.Stalling((body, retry) => { asked.Add((string)body + (retry ? " again" : "")); return "Bridge 400: {\"error\":\"set_parameter: the source is not confirmed\"}"; });
        refusing("GR-FFL", false); refusing("GR-FFL", true); refusing("01-FFL", false);
        Ok(asked.SequenceEqual(new[] { "GR-FFL", "GR-FFL again", "01-FFL" }),
           "F4: a refusal (Bridge 4xx — FileAll's set_parameter retry among them) stalls nothing: the bridge answered");
        int calls = 0;
        object Body(string name) => new { name, elements = new[] { new { op = "retype" } }, exceptions = new object[0] };
        var run = PropertyPlanner.FileAll(new[] { Body("GR-FFL"), Body("01-FFL"), Body("MA0 Roof") }, PropertyPlanner.Stalling((body, retry) => ++calls == 1 ? null : noAnswer));
        Ok(calls == 2 && run.Failed.Count == 2 && run.Failed[0] == noAnswer && run.Failed[1].StartsWith("not sent: an earlier filing of this run", StringComparison.Ordinal),
           "F4 through FileAll: the third storey is never sent, and Promote's not-filed dialog counts it with why");
        Ok(PropertyPlanner.PromoteFiling(3) == "Promote (DD): filing 3 changeset(s) off Revit's thread — Revit stays usable, and the review opens by itself in this model once the bridge has answered. Until then, Review AI Proposals and a second Promote say they wait."
           && PropertyPlanner.PromoteReading.StartsWith("Promote (DD): reading the bridge", StringComparison.Ordinal) && PropertyPlanner.PromoteReading.Contains("Revit stays usable")
           && PropertyPlanner.PromoteFiled(2, 3) == "Promote (DD): 2 of 3 changeset(s) filed (confirmed by the bridge) — the filing is done." // C14
           && PropertyPlanner.PromoteReading.EndsWith("Until its dialog closes — or, after Yes, its filing is done — Review AI Proposals and a second Promote say they wait.", StringComparison.Ordinal) // C13
           && UnreportedResults.OpenHeld(1).Contains("a review window is open, a report is in flight, or Promote (DD) is reading or filing"),
           "the pane's Doctor log says when Promote reads, files and is done — Revit stays usable meanwhile; a model opened while Promote files says why its results wait (F3)");
        const string refusal = "Sentinel did not open the review of the changesets Promote filed: switch back to ma3b5-a — nothing was changed.";
        Ok(PropertyPlanner.PromoteNotOpened(refusal, 3, "ma3b5-a") == refusal + "\n\n3 changeset(s) Promote filed wait for review — in \"ma3b5-a\", run Review AI Proposals (or Promote (DD): it opens a Promote storey waiting for review before it plans again)."
           && PropertyPlanner.PromoteStopped("JsonException: bad", false) == "Promote's filing stopped — JsonException: bad\nWhat the bridge took before it stopped waits for review: run Promote (DD) again — it opens a Promote storey waiting for review before it plans again."
           && PropertyPlanner.PromoteStopped("JsonException: bad", true) == "Promote's filing stopped — JsonException: bad\nWhat the bridge took before it stopped waits for review — it opens by itself while this model is in front.", // C6
           "H5: a model switched or closed before the review opened is said with what was filed and where to review it — never opened in the wrong model; a filing that throws is said, and its words follow whether its review opens (C6)");
    }
}
