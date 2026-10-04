#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 48. MA-3b3: a decline carried forward — the add-in reads the stamp the bridge files (the shared fixture
    //        WebApp/bridge/fixtures/changeset-ops/ma3b3-carry.json, whose `changeset` vitest proves carryDeclines makes): the ghost
    //        opens unticked and locked as any decline, and every word names where the decline was made ───────────────────────────
    static void Ma3b3CarryChecks()
    {
        Console.WriteLine("\nMA-3b3 — a carried decline as Revit reads it");
        using var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3b3-carry.json")));
        ChangesetDto Read() => JsonSerializer.Deserialize<ChangesetDto>(fx.RootElement.GetProperty("changeset").GetRawText());
        var cs = Read();
        using var fa = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "ma3a-review.json")));
        var web = JsonSerializer.Deserialize<ChangesetDto>(fa.RootElement.GetProperty("after").GetRawText());
        ChangesetElementDto G(string g) => cs.Elements.Single(e => e.ProposalGuid == g);
        const string storey = "Promote (DD) · GR-FFL";

        Ok(G("n-1").Review.CarriedFrom is { Changeset: "cs-a", Name: storey, ProposalGuid: "a-1", Origin: "web" } && G("n-1").Review.Rev == 0
           && G("n-2").Review.CarriedFrom is { Changeset: "cs-a", ProposalGuid: "a-2", Origin: "revit" } && G("n-2").Review.Role == "contributor"
           && cs.Carry is { Carried: 2, NoReason: 1, Creates: 1, Unverified: 1 } && web.Carry == null && web.Elements[0].Review.CarriedFrom == null,
           "a carried review reads with where it came from, and the changeset with what was and was not carried; a changeset without either reads null");
        Ok(ChangesetTrust.DeclinedOnWeb(G("n-1")) && ChangesetTrust.DeclinedOnWeb(G("n-2")) && !ChangesetTrust.PreTick(cs, G("n-1")) && !ChangesetTrust.PreTick(cs, G("n-2"))
           && G("n-1").Pretick == true && ChangesetTrust.PreTick(cs, G("n-3")) && !ChangesetTrust.DeclinedOnWeb(G("n-3")),
           "a carried decline binds as any decline: never ticked, whatever its pre-tick; a ghost that was not carried keeps its own");

        Ok(ChangesetTrust.ReviewLine(G("n-1")) == "declined on the web by reviewer@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: wrong type: W 1 is a party wall · a lead may re-open it on the web desk"
           && ChangesetTrust.ReviewLine(G("n-2")) == "declined in Revit by modeller@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: W 2 is demolished in the next package · a lead may re-open it on the web desk",
           "a carried row says where the decline was made (the web, or Revit), by whom, in which changeset, and that the bridge carried it");
        var odd = Read().Elements[0];
        odd.Review.CarriedFrom.Origin = "a script";
        Ok(ChangesetTrust.ReviewLine(odd).StartsWith("declined before by reviewer@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: "),
           "an origin the add-in does not know is said as 'before', never guessed");

        Ok(ChangesetTrust.DeclinedHeader(cs) == "2 ghost(s) declined (2 carried here by the bridge from an earlier changeset) — shown unticked with the reason; they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). Apply reports them as rejected; the changeset stays proposed until Revit reports it. A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).",
           "the window's header counts the carried declines and says a decline is carried (MA-3a's C4 sentence is gone)");
        Ok(ChangesetTrust.DeclinedCount(cs.Elements) == "2 declined (2 carried)" && ChangesetTrust.DeclinedCount(web.Elements) == "2 declined on the web"
           && ChangesetTrust.DeclinedCount(new[] { G("n-3") }) == null
           && StoreyBatch.Line(new[] { cs }, new DateTime(2026, 10, 4, 15, 0, 0, DateTimeKind.Utc)).EndsWith(" · 2 declined (2 carried)"),
           "the picker's line and a group's header count the declines and say how many were carried — 'on the web' only when none was");

        Ok(ChangesetTrust.NotCarriedLine(cs) == "1 ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: the bridge cannot tell an unticked row from an element Revit removed or an Apply that rolled back. A reason in the group's box makes a decline carry.\n1 ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member (the machine credential, or a report from before this version) — not carried: proposed again, undecided.\n1 create(s) here are of the same kind, type and level as a create declined before on this project — a create names no existing element, so the bridge cannot tell whether it is the same one: proposed again, undecided."
           && ChangesetTrust.NotCarriedLine(web) == null && ChangesetTrust.NotCarriedLine(new ChangesetDto { Carry = new CarryDto { Carried = 3 } }) == null,
           "what the bridge could not carry is said — a rejection with no reason of its own, a reason no signed-in member reported (C1), a create like one declined before (C7) — and nothing is said when there is none");
        var second = Read(); second.Id = "cs-2"; second.Name = storey + " (2/2)"; cs.Name = storey + " (1/2)";
        var storeyOfTwo = StoreyBatch.Merge(new[] { cs, second });
        cs.Name = storey;
        Ok(storeyOfTwo.Carry is { Carried: 4, NoReason: 2, Creates: 2, Unverified: 2 } && ChangesetTrust.NotCarriedLine(storeyOfTwo).StartsWith("2 ghost(s) here were rejected in Revit before")
           && StoreyBatch.Merge(new[] { web, web }).Carry == null,
           "a storey's parts are counted together");

        var refused = ChangesetTrust.DeclinedTicked(new[] { cs }, new HashSet<string> { "n-2", "n-3" });
        Ok(refused != null && refused.StartsWith("1 ticked ghost(s) were declined after this window opened:\n")
           && refused.Contains("· retype wall \"W 2\" — declined in Revit by modeller@example.com (contributor) in \"Promote (DD) · GR-FFL\", carried here by the bridge: W 2 is demolished in the next package"),
           "Apply's re-check refuses a ticked carried decline with the same words, and never calls a Revit decline the web's (C8)");

        string window = Src("UI", "ChangesetReviewWindow.cs"), batch = Src("GhostBuilder", "StoreyBatch.cs"), client = Src("Coordination", "ChangesetClient.cs");
        Ok(window.Contains("if (ChangesetTrust.NotCarriedLine(_cs) is string notCarried)") && window.Contains("string declinedHere = ChangesetTrust.DeclinedCount(group);")
           && batch.Contains("ChangesetTrust.DeclinedCount(els) is { } declined") && !window.Contains("declined on the web\" : \"\")") && !batch.Contains("declined on the web\" : \"\")")
           && !client.Contains("a new Promote run proposes a declined ghost again, undecided")
           && window.Contains("carried to the next filing") && window.Contains("not for a row already declined (its reason stands)") && !window.Contains("the web's reason stands")
           && !client.Contains("were declined on the web after this window opened"),
           "the window says what was not carried, the group header and the picker line use the one count, no source says a declined ghost is proposed again undecided, and the reason box and Apply's refusal never call every decline the web's (C8, C10; source scan)");
    }
}
