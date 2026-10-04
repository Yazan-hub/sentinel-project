#nullable disable
// MA-2d (design §2.1 rule 5, §3.4 step 8): one Undo per storey. Promote files a storey of more than 200 ghosts as several changesets
// named "<title> · <storey> (i/n)" (PromoteWallsPlanner.Bodies). The review opens a storey's pending parts as ONE window (Merge), and the
// placement event applies them in ONE TransactionGroup named UndoName: one Undo entry, while each changeset keeps its own ledger row.
// The storey is read from the name the add-in wrote on a Promote changeset (founder decision F1 A: no bridge field). Pure but for C13's session set
// (tools/promote-check, section 37).
using System;
using System.Collections.Generic;
using System.Globalization;
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
        // MA-3b review M1: the picker's Entries call this on a pool thread while Promote may call it on Revit's — Mixed is one set.
        lock (Mixed) return OfLocked(pending, first);
    }

    private static List<ChangesetDto> OfLocked(IEnumerable<ChangesetDto> pending, ChangesetDto first)
    {
        var alone = new List<ChangesetDto> { first };
        var fm = Part.Match(first?.Name ?? "");
        if (first?.Source != "promote" || !fm.Success || Mixed.Contains(first.Id)) return alone;
        string stem = StoreyOf(first.Name), n = fm.Groups[2].Value;
        var parts = (pending ?? Enumerable.Empty<ChangesetDto>()).Where(c => c != null && c.Id != first.Id && !Mixed.Contains(c.Id)).Concat(new[] { first })
            .Select(c => (Cs: c, M: Part.Match(c.Name ?? "")))
            .Where(x => x.Cs.Source == "promote" && x.M.Success && x.M.Groups[2].Value == n && StoreyOf(x.Cs.Name) == stem)
            .GroupBy(x => int.Parse(x.M.Groups[1].Value)).OrderBy(g => g.Key).ToList();
        if (parts.Count == int.Parse(n) && parts.Select((g, i) => g.Key == i + 1 && g.Count() == 1).All(ok => ok))
            return parts.Select(g => g.Single().Cs).ToList();
        // Review C13: once a part is reviewed alone, the leftovers of two runs (A1, B1, A2 → B1, A2) can look like one storey. Every
        // part pending now is never batched again. ponytail: this session only (another PC, or Revit restarted between, can still
        // batch such leftovers); a run id in the name (a founder's choice: it changes the name F1 A shows) or a bridge batch field closes it.
        foreach (var x in parts.SelectMany(g => g)) Mixed.Add(x.Cs.Id);
        return alone;
    }

    /// <summary>MA-3b (AI-5): every pending changeset as the review picker lists it — in <paramref name="pending"/>'s order (FIFO), a
    /// Promote storey's parts as ONE entry (Of's rule: a part Of reviews alone is an entry of its own).</summary>
    public static List<List<ChangesetDto>> Entries(IReadOnlyList<ChangesetDto> pending)
    {
        var taken = new HashSet<string>();
        var entries = new List<List<ChangesetDto>>();
        foreach (var cs in pending ?? new List<ChangesetDto>())
        {
            if (cs?.Id == null || taken.Contains(cs.Id)) continue;
            var entry = Of(pending, cs);
            foreach (var x in entry) taken.Add(x.Id);
            entries.Add(entry);
        }
        return entries;
    }

    /// <summary>MA-3b (AI-5): an entry's line in the picker — its name, source, age, its ghosts by the referee's verdict, and the web's
    /// declines.</summary>
    public static string Line(IReadOnlyList<ChangesetDto> entry, DateTime nowUtc)
    {
        var cs = Merge(entry);
        var els = cs.Elements ?? new List<ChangesetElementDto>();
        int V(string status) => els.Count(e => (e.Verdict?.Status ?? "recorded") == status);
        int declined = els.Count(ChangesetTrust.DeclinedOnWeb);
        return $"{cs.Name} — {cs.Source}{(cs.Claimed == true ? " (claimed)" : "")} · {Age(cs.CreatedAt, nowUtc)} · {els.Count} ghost(s): {V("accepted")} accepted, {V("rejected")} rejected, {V("recorded")} recorded" +
               (declined > 0 ? $" · {declined} declined on the web" : "");
    }

    /// <summary>"just now", "12 min ago", "3 h ago", "2 d ago" — the bridge's created_at read as UTC; "age unknown" when it is not a time.</summary>
    public static string Age(string createdAt, DateTime nowUtc)
    {
        if (!DateTime.TryParse(createdAt, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var at)) return "age unknown";
        var min = (nowUtc - at).TotalMinutes;
        return min < 1 ? "just now" : min < 60 ? $"{(int)min} min ago" : min < 48 * 60 ? $"{(int)(min / 60)} h ago" : $"{(int)(min / 1440)} d ago";
    }

    // Review C13: the ids of Promote parts that were pending when their storey had a part waiting twice or missing.
    private static readonly HashSet<string> Mixed = new HashSet<string>();

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
