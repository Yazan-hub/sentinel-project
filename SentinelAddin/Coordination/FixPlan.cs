using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Engine;

namespace Sentinel.Coordination;

public enum FixVerdict { Unchecked, Pass, Fail, NotFixable }

/// <summary>One row of the fix-in-place grid: an instance, or a TYPE covering several instances on the issue.</summary>
public sealed class FixRow
{
    public string Key = "";                  // "i:<elementId>" or "t:<typeId>" — stable across check/apply
    public bool IsType;
    public long TargetId;                    // the element (instance row) or the type (type row) that is written
    public List<long> InstanceIds = new();   // instances on the issue this row covers (one for an instance row)
    public List<string> IssueGuids = new();  // their topic GUIDs, same order as InstanceIds
    public int OtherInstanceCount;           // type rows: instances in the model NOT on the issue that change too
    public string Label = "";                // "Walls · Basic Wall: XXX_EXT_ARC_CMU_200 mm · 123456"
    public string ParamName = "";
    public string ResolvedVia = "";          // "instance parameter" / "type parameter" / "wall Function" / …
    public string BuiltIn = "";              // BuiltInParameter enum name when resolved via a built-in ("" = by name)
    public ValueKind ValueKind = ValueKind.Text;
    public string Current = "";
    public string Proposed = "";
    public bool Writable;
    public string? NotFixableReason;
    public FixVerdict Verdict = FixVerdict.Unchecked;
    public string? Reason;
    public bool Ticked;

    public string ScopeText => IsType
        ? $"TYPE — {InstanceIds.Count} instance(s) on this issue; {OtherInstanceCount} other(s) in the model change too"
        : "instance";
}

public sealed class ElementFailure { public string Element = ""; public string Requirement = ""; public string Reason = ""; }

public sealed class FoldResult
{
    public bool AllPass;
    public int Pass, Fail;
    public int PassGuids;                    // issue GUIDs credited as passing (a type row can pass some, fail others)
    public List<string> Unresolved = new();  // issue GUIDs no row covers — not in this model
    public int OtherOpen;                    // failures on OTHER requirements: a footnote, never folded in
}

/// <summary>Pure payload logic for fix-in-place: patch a proposed value in, fold a referee response back.</summary>
public static class FixPlan
{
    /// "yes"/"no"/"true"/"false"/"1"/"0" → "TRUE"/"FALSE"; anything else null (never coerced).
    public static string? NormalizeYesNo(string? s) => (s ?? "").Trim().ToUpperInvariant() switch
    {
        "TRUE" or "YES" or "Y" or "1" => "TRUE",
        "FALSE" or "NO" or "N" or "0" => "FALSE",
        _ => null,
    };

    /// A deep copy of <paramref name="el"/> with the requirement's value replaced by <paramref name="proposed"/>
    /// (inserted when absent) and identity.GlobalId set to the topic's GUID, so the referee's per-element echo
    /// matches the issue rather than whatever GlobalId the extractor computed.
    public static GovElement Patch(GovElement el, IdsIssueRef req, string proposed, string issueGuid)
    {
        static List<GovGroup> Copy(List<GovGroup> groups) => groups
            .Select(g => new GovGroup { name = g.name, rows = g.rows.Select(r => new GovRow { name = r.name, value = r.value }).ToList() })
            .ToList();
        var copy = new GovElement
        {
            modelId = el.modelId, localId = el.localId,
            identity = new GovIdentity { GlobalId = issueGuid, Name = el.identity.Name, Class = el.identity.Class, Tag = el.identity.Tag },
            psets = Copy(el.psets), quantities = Copy(el.quantities),
        };
        if (req.IsAttribute)
        {
            if (req.Prop.Equals("Name", StringComparison.OrdinalIgnoreCase)) copy.identity.Name = proposed;
            return copy;
        }
        var group = copy.psets.Find(g => string.Equals(g.name, req.Pset, StringComparison.OrdinalIgnoreCase));
        if (group == null) { group = new GovGroup { name = req.Pset }; copy.psets.Add(group); }
        var row = group.rows.Find(r => string.Equals(r.name, req.Prop, StringComparison.OrdinalIgnoreCase));
        if (row == null) group.rows.Add(new GovRow { name = req.Prop, value = proposed });
        else row.value = proposed;
        return copy;
    }

    /// Fold a referee response onto the rows that were SENT (by Key); unsent rows are left as they are.
    /// AllPass needs every issue GUID covered by a sent row that passed — an unresolved GUID, an unsent row,
    /// or one failing instance of a type row is a no.
    public static FoldResult Fold(IReadOnlyList<ElementFailure> failures, IReadOnlyList<FixRow> allRows,
                                  ISet<string> sentKeys, IReadOnlyList<string> issueGuids, string requirement)
    {
        var res = new FoldResult();
        var failing = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var f in failures)
        {
            if (string.Equals(f.Requirement, requirement, StringComparison.OrdinalIgnoreCase))
            {
                if (!failing.ContainsKey(f.Element)) failing[f.Element] = f.Reason;
            }
            else res.OtherOpen++;
        }

        var passGuids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in allRows)
        {
            if (!sentKeys.Contains(row.Key)) continue;
            // A row the planner already judged unfixable keeps its verdict and reason — its elements are real
            // and the referee's word on them still counts, but "not fixable here" must not be painted over.
            bool keep = row.Verdict == FixVerdict.NotFixable;
            var bad = row.IssueGuids.Where(failing.ContainsKey).ToList();
            if (bad.Count == 0)
            {
                if (!keep) { row.Verdict = FixVerdict.Pass; row.Reason = null; }
                res.Pass++;
                foreach (var g in row.IssueGuids) passGuids.Add(g);
            }
            else
            {
                res.Fail++;
                if (!keep)
                {
                    row.Verdict = FixVerdict.Fail;
                    row.Reason = row.IsType && bad.Count < row.IssueGuids.Count
                        ? $"{bad.Count} of {row.IssueGuids.Count} instance(s) still fail — {failing[bad[0]]}"
                        : failing[bad[0]];
                }
                foreach (var g in row.IssueGuids.Except(bad)) passGuids.Add(g);
            }
        }

        var covered = new HashSet<string>(allRows.SelectMany(r => r.IssueGuids), StringComparer.Ordinal);
        res.Unresolved = issueGuids.Where(g => !covered.Contains(g)).ToList();
        res.PassGuids = passGuids.Count;
        res.AllPass = issueGuids.Count > 0 && issueGuids.All(passGuids.Contains);
        return res;
    }

    /// The bridge truncates its failure list, and judges only what is in scope — so "no failure came back"
    /// is only evidence of passing when everything sent was judged and the list was not cut off. Returns
    /// false (with the reason) whenever the response cannot be read as a verdict on every element sent.
    public const int FailureCap = 200;

    public static bool Conclusive(int sent, int inScope, int failureCount, out string reason)
    {
        var parts = new List<string>();
        if (inScope < sent) parts.Add($"{sent - inScope} out of scope");
        if (failureCount >= FailureCap) parts.Add($"failure list truncated at {FailureCap}");
        reason = string.Join(" / ", parts);
        return parts.Count == 0;
    }
}
