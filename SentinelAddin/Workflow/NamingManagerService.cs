using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Standards;

namespace Sentinel.Workflow;

public sealed class NamingRow
{
    public long ElementId;
    public bool IsType;                 // ElementType (types) vs Family
    public string RuleId = "";
    public string Category = "";
    public string FamilyName = "";
    public string Current = "";
    public string Proposed = "";        // editable; pre-filled from the proposer when it had a name
    public NameVerdict Verdict;
    public string Note = "";
    public int Instances;
    public bool Ticked;
    /// <summary>NeedsHuman type rows: the slots a person completes (NamingProposer.Skeleton) and the rule's anchored
    /// regex, so the window can assemble and check a name live.</summary>
    public List<Sentinel.Standards.TokenSlot>? Slots;
    public System.Text.RegularExpressions.Regex? Schema;
    public string Separator = "_";
}

/// <summary>Revit half of the Naming Manager: rows with the context the proposer needs, and the audited
/// rename. Both run on the API thread (App.Events.Enqueue).</summary>
public static class NamingManagerService
{
    private const double FeetToMm = 304.8;

    public static List<NamingRow> BuildRows(Document doc, Ruleset rs)
    {
        var rows = new List<NamingRow>();
        var org = rs.Org;

        // Instance counts per type id, one pass.
        var instancesOfType = new Dictionary<long, int>();
        foreach (var e in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            var tid = e.GetTypeId();
            if (tid == ElementId.InvalidElementId) continue;
            instancesOfType[tid.IdValue()] = instancesOfType.TryGetValue(tid.IdValue(), out var n) ? n + 1 : 1;
        }

        foreach (var rule in rs.Rules.Where(r => r.Target is RuleTarget.Type or RuleTarget.Family && r.Tokens.Count > 0))
        {
            if (rule.Target == RuleTarget.Type)
            {
                var types = new FilteredElementCollector(doc).WhereElementIsElementType().OfType<ElementType>()
                    .Where(et => et.Category is { } c && (rule.Categories.Count == 0 || rule.Categories.Any(c.MatchesCategoryKey)))
                    .ToList();
                foreach (var fam in types.GroupBy(et => et.Category!.Id.IdValue() + "|" + SafeFamilyName(et)))
                {
                    var existing = new HashSet<string>(fam.Select(et => et.Name), StringComparer.Ordinal);
                    var siblings = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var et in fam)
                    {
                        var ctx = new NamingContext
                        {
                            Category = et.Category!.Name, FamilyName = SafeFamilyName(et), IsSystem = et is not FamilySymbol,
                            WidthMm = et is WallType wt ? wt.Width * FeetToMm : null,
                            ExistingNamesInFamily = existing, SiblingProposals = siblings,
                        };
                        var p = NamingProposer.Propose(et.Name, rule, org, ctx);
                        if (p.Verdict == NameVerdict.Proposed) siblings.Add(p.Name!);
                        rows.Add(new NamingRow
                        {
                            ElementId = et.Id.IdValue(), IsType = true, RuleId = rule.Id, Category = ctx.Category, FamilyName = ctx.FamilyName,
                            Current = et.Name, Proposed = p.Verdict is NameVerdict.Proposed or NameVerdict.Blocked ? p.Name ?? "" : "",
                            Verdict = p.Verdict, Note = string.Join("; ", p.Notes),
                            Instances = instancesOfType.TryGetValue(et.Id.IdValue(), out var n) ? n : 0,
                            Slots = p.Slots, Schema = p.Slots != null ? RuleRegex.For(rule, org) : null, Separator = rule.Separator,
                        });
                    }
                }
            }
            else
            {
                var fams = new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>()
                    .Where(f => f.FamilyCategory is { CategoryType: CategoryType.Model } c && (rule.Categories.Count == 0 || rule.Categories.Any(c.MatchesCategoryKey)))
                    .ToList();
                foreach (var byCat in fams.GroupBy(f => f.FamilyCategory!.Id.IdValue()))
                {
                    var existing = new HashSet<string>(byCat.Select(f => f.Name), StringComparer.Ordinal);
                    var siblings = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var f in byCat)
                    {
                        var ctx = new NamingContext { Category = f.FamilyCategory!.Name, FamilyName = f.Name, ExistingNamesInFamily = existing, SiblingProposals = siblings };
                        var p = NamingProposer.Propose(f.Name, rule, org, ctx);
                        if (p.Verdict == NameVerdict.Proposed) siblings.Add(p.Name!);
                        rows.Add(new NamingRow
                        {
                            ElementId = f.Id.IdValue(), IsType = false, RuleId = rule.Id, Category = ctx.Category, FamilyName = f.Name,
                            Current = f.Name, Proposed = p.Verdict is NameVerdict.Proposed or NameVerdict.Blocked ? p.Name ?? "" : "",
                            Verdict = p.Verdict, Note = string.Join("; ", p.Notes),
                            Instances = f.GetFamilySymbolIds().Sum(id => instancesOfType.TryGetValue(id.IdValue(), out var n) ? n : 0),
                            Slots = p.Slots, Schema = p.Slots != null ? RuleRegex.For(rule, org) : null, Separator = rule.Separator,
                        });
                    }
                }
            }
        }
        return rows;
    }

    private static string SafeFamilyName(ElementType t) { try { return t.FamilyName ?? ""; } catch { return ""; } }

    /// <summary>ONE transaction; per row: re-validate against the rule, re-check uniqueness LIVE, rename;
    /// each success collected for one batched audit-store write, then one ledger row for the batch, posted on a task:
    /// <paramref name="ledger"/> (null when nothing was renamed) — the window continues on it and shows the line.</summary>
    public static List<(NamingRow Row, bool Ok, string Message)> Apply(Document doc, IEnumerable<NamingRow> rows, Ruleset rs, string? projectKey,
                                                                    out Task<LedgerResult>? ledger)
    {
        ledger = null;
        var results = new List<(NamingRow, bool, string)>();
        var user = doc.Application.Username;
        var list = rows.ToList();
        var audits = new List<(ChangeRequest Request, AuditEntry Audit)>();
        var renamedMap = new Dictionary<NamingRow, string>();
        using var t = new Transaction(doc, $"Sentinel: Naming Manager ({list.Count})");
        t.Start();
        foreach (var row in list)
        {
            var proposed = (row.Proposed ?? "").Trim();
            var rule = rs.Rules.FirstOrDefault(r => r.Id == row.RuleId);
            if (rule == null) { results.Add((row, false, "refused: rule no longer in the ruleset")); continue; }
            if (proposed.Length == 0) { results.Add((row, false, "refused: no name entered")); continue; }
            if (!RuleRegex.For(rule, rs.Org).IsMatch(proposed)) { results.Add((row, false, "refused: does not match the schema")); continue; }
            var el = doc.GetElement(row.ElementId.ToElementId());
            if (el == null) { results.Add((row, false, "element no longer exists")); continue; }
            if (proposed == el.Name) { results.Add((row, true, "already named so")); continue; }
            if (TakenLive(doc, el, proposed)) { results.Add((row, false, $"refused: '{proposed}' is now taken in this family")); continue; }
            try
            {
                el.Name = proposed;
                RequestManager.UpdateSnapshot(doc, row.ElementId, proposed);
                audits.Add((new ChangeRequest
                {
                    RuleId = row.RuleId, ElementId = row.ElementId, ElementCategory = row.Category,
                    OldValue = row.Current, NewValue = proposed, RequestedBy = user,
                    Status = RequestStatus.Approved, VerdictBy = user, VerdictAt = DateTimeOffset.Now, VerdictNote = "Naming Manager",
                }, new AuditEntry { Actor = user, Action = "naming.renamed", Detail = $"{row.RuleId}: '{row.Current}' -> '{proposed}'" }));
                renamedMap[row] = proposed;
                results.Add((row, true, "renamed"));
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { results.Add((row, false, "Revit refused: " + ex.Message)); }
        }

        // One load + one save for the whole batch. If the store cannot take it, nothing is written at all.
        try { RequestStore.UpsertMany(doc, audits); }
        catch (Exception ex)
        {
            if (!t.HasEnded()) t.RollBack();
            return results.Select(r => r.Item2
                ? (r.Item1, false, "not renamed: audit store failed — " + ex.Message)
                : r).ToList();
        }

        if (t.Commit() != TransactionStatus.Committed)
            return results.Select(r => r.Item2 ? (r.Item1, false, "transaction did not commit — nothing was renamed") : r).ToList();

        var done = results.Where(r => r.Item2 && r.Item3 == "renamed").ToList();
        if (done.Count > 0)
        {
            // Built here, on the API thread; posted off it (≤ 6 s), so the rename never waits on the bridge.
            var ledgerRows = done.Select(r => (object)new { id = r.Item1.ElementId, from = r.Item1.Current, to = renamedMap[r.Item1], rule = r.Item1.RuleId }).ToList();
            var key = projectKey ?? "";
            ledger = Task.Run(() => GovernedNotify.NamingRenamed(ledgerRows, user, key));
        }
        return results;
    }

    // Uniqueness at write time, within the same family (types) or category (families).
    private static bool TakenLive(Document doc, Element el, string name)
    {
        if (el is ElementType et)
            return new FilteredElementCollector(doc).WhereElementIsElementType().OfType<ElementType>()
                .Any(x => x.Id != et.Id && x.Category?.Id == et.Category?.Id && SafeFamilyName(x) == SafeFamilyName(et) && x.Name == name);
        if (el is Family f)
            return new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>()
                .Any(x => x.Id != f.Id && x.FamilyCategory?.Id == f.FamilyCategory?.Id && x.Name == name);
        return false;
    }
}
