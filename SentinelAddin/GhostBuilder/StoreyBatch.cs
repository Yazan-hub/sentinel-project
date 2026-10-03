#nullable disable
// MA-2d (design §2.1 rule 5, §3.4 step 8): one Undo per storey. Promote files a storey of more than 200 ghosts as several changesets
// named "<title> · <storey> (i/n)" (PromoteWallsPlanner.Bodies). The review opens a storey's pending parts as ONE window (Merge), and the
// placement event applies them in ONE TransactionGroup named UndoName: one Undo entry, while each changeset keeps its own ledger row.
// The storey is read from the name the add-in wrote on a Promote changeset (founder decision F1 A: no bridge field). Pure
// (tools/promote-check, section 37).
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public static class StoreyBatch
{
    // Bodies' " (i/n)": the part and the number of parts of one storey (ASCII digits: \d would take any script's).
    private static readonly Regex Part = new Regex(@" \(([0-9]{1,4})/([0-9]{1,4})\)$", RegexOptions.CultureInvariant);

    /// <summary>The changeset's name without the " (i/n)" Bodies adds to a storey of several changesets; any other name as it is.</summary>
    public static string StoreyOf(string name)
    {
        var m = Part.Match(name ?? "");
        return m.Success ? name.Substring(0, m.Index) : name ?? "";
    }

    /// <summary>What is reviewed and applied with <paramref name="first"/>. A Promote changeset that is one part of a storey brings the
    /// storey's other parts in <paramref name="pending"/> — Promote's, the same storey, the same number of parts — in part order, when
    /// every part 1..n waits exactly once. Review C7: a part waiting twice (two Promote runs of one storey: nothing in a changeset names
    /// its run) or a part missing is never guessed at — <paramref name="first"/> is reviewed alone, and the review says so
    /// (ReviewChangesetsCommand.Open). Any other changeset (an agent's, a storey of one changeset) is reviewed alone.</summary>
    public static List<ChangesetDto> Of(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        var alone = new List<ChangesetDto> { first };
        var fm = Part.Match(first?.Name ?? "");
        if (first?.Source != "promote" || !fm.Success) return alone;
        string stem = StoreyOf(first.Name), n = fm.Groups[2].Value;
        var parts = (pending ?? Enumerable.Empty<ChangesetDto>()).Where(c => c != null && c.Id != first.Id).Concat(new[] { first })
            .Select(c => (Cs: c, M: Part.Match(c.Name ?? "")))
            .Where(x => x.Cs.Source == "promote" && x.M.Success && x.M.Groups[2].Value == n && StoreyOf(x.Cs.Name) == stem)
            .GroupBy(x => int.Parse(x.M.Groups[1].Value)).OrderBy(g => g.Key).ToList();
        return parts.Count == int.Parse(n) && parts.Select((g, i) => g.Key == i + 1 && g.Count() == 1).All(ok => ok)
            ? parts.Select(g => g.Single().Cs).ToList() : alone;
    }

    /// <summary>The one changeset the review window shows for a storey: every part's elements and held rows, named as the storey
    /// ("… · GR-FFL (2 changesets, one Undo)"), with the first part's id and trust fields (Promote's on every part). A batch of one is
    /// itself.</summary>
    public static ChangesetDto Merge(IReadOnlyList<ChangesetDto> batch)
    {
        if (batch.Count == 1) return batch[0];
        return new ChangesetDto
        {
            Id = batch[0].Id, Name = $"{StoreyOf(batch[0].Name)} ({batch.Count} changesets, one Undo)", Source = batch[0].Source,
            Claimed = batch[0].Claimed, Status = batch[0].Status, CreatedAt = batch[0].CreatedAt,
            Adjudication = new AdjudicationDto
            {
                Verdict = string.Join(" / ", batch.Select(c => c.Adjudication?.Verdict ?? "?").Distinct()),
                IdsSource = batch[0].Adjudication?.IdsSource,
                Unattributed = batch.SelectMany(c => c.Adjudication?.Unattributed ?? new List<JsonElement>()).ToList(),
            },
            Elements = batch.SelectMany(c => c.Elements ?? new List<ChangesetElementDto>()).ToList(),
            Exceptions = batch.SelectMany(c => c.Exceptions ?? new List<ExceptionRowDto>()).ToList(),
        };
    }

    /// <summary>The guids of <paramref name="guids"/> that are <paramref name="cs"/>'s own elements — a storey's ticks and unticks,
    /// split back to the changeset each is reported on.</summary>
    public static List<string> Own(ChangesetDto cs, IEnumerable<string> guids)
    {
        var mine = new HashSet<string>((cs.Elements ?? new List<ChangesetElementDto>()).Select(e => e.ProposalGuid));
        return (guids ?? Enumerable.Empty<string>()).Where(mine.Contains).ToList();
    }

    /// <summary>The Undo entry's name: the storey's, with the first part's id, as the executor names a changeset's own transaction
    /// (UndoWatcher.TxName — the undo watcher and GhostFailurePolicy.DoctorSkips key on it). A batch of one keeps the changeset's own.</summary>
    public static string UndoName(IReadOnlyList<ChangesetDto> batch) =>
        UndoWatcher.TxName(batch.Count == 1 ? batch[0].Name : StoreyOf(batch[0].Name), batch[0].Id);
}
