using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Engine;
using Sentinel.Workflow;

namespace Sentinel.Coordination;

/// <summary>
/// The Revit half of fix-in-place: resolve an issue's elements and the parameter each fix lands on, extract
/// them for the referee, and write ticked values in ONE transaction with a per-row outcome. Every method
/// runs on the API thread (call from <c>App.Events.Enqueue</c>); nothing here touches the network.
/// Sentinel never adds a parameter or invents a home for a value — a missing parameter is "not fixable here".
/// </summary>
public static class FixInPlaceService
{
    public sealed class Plan
    {
        public List<FixRow> Rows = new();
        public List<string> Unresolved = new();          // issue GUIDs not in this model
        public Dictionary<long, string> GuidOf = new();  // instance id → issue GUID
    }

    public sealed class RowOutcome { public FixRow Row = null!; public bool Ok; public string Message = ""; }

    public static Plan BuildPlan(Document doc, IdsIssueRef req, IReadOnlyList<string> issueGuids, string? org)
    {
        var plan = new Plan();
        var wanted = new HashSet<string>(issueGuids.Where(g => !string.IsNullOrWhiteSpace(g)), StringComparer.Ordinal);
        var map = BcfApplyEvent.MapByIfcGuid(doc, wanted);
        plan.Unresolved = wanted.Where(g => !map.ContainsKey(g)).ToList();
        var entry = PsetMap.Find(org, req.Requirement);
        var typeRows = new Dictionary<long, FixRow>();

        foreach (var kv in map)
        {
            var guid = kv.Key;
            var id = kv.Value;
            if (doc.GetElement(id) is not { } e) continue;
            plan.GuidOf[id.IdValue()] = guid;

            var t = Resolve(e, doc, entry, req);
            var targetId = t.Elem.Id.IdValue();
            if (t.IsType && typeRows.TryGetValue(targetId, out var existing))
            {
                existing.InstanceIds.Add(id.IdValue());
                existing.IssueGuids.Add(guid);
                continue;
            }
            var row = new FixRow
            {
                Key = (t.IsType ? "t:" : "i:") + targetId,
                IsType = t.IsType, TargetId = targetId,
                InstanceIds = { id.IdValue() }, IssueGuids = { guid },
                Label = LabelOf(e, doc),
                ParamName = t.ParamName, ResolvedVia = t.Via, BuiltIn = t.BuiltIn, ValueKind = t.ValueKind,
                Current = t.Current, Writable = t.Writable, NotFixableReason = t.Reason,
                Verdict = t.Writable ? FixVerdict.Unchecked : FixVerdict.NotFixable, Reason = t.Reason,
                Ticked = t.Writable,
            };
            if (t.IsType) typeRows[targetId] = row;
            plan.Rows.Add(row);
        }

        // Type rows: how many OTHER instances of that type exist in the model — the blast radius, on screen.
        foreach (var row in plan.Rows.Where(r => r.IsType))
        {
            var typeId = row.TargetId.ToElementId();
            var total = new FilteredElementCollector(doc).WhereElementIsNotElementType().Count(x => x.GetTypeId() == typeId);
            row.OtherInstanceCount = Math.Max(0, total - row.InstanceIds.Count);
        }
        return plan;
    }

    private sealed class Target
    {
        public Element Elem = null!;       // the instance, or the TYPE the parameter lives on
        public bool IsType;
        public string ParamName = "", Via = "", BuiltIn = "", Current = "";
        public ValueKind ValueKind;
        public bool Writable;
        public string? Reason;
    }

    /// First candidate that exists and is writable — instance first, then type. The storage must fit the
    /// value kind (text → String, yes/no → Integer); a unit-bearing number is refused rather than mis-set.
    private static Target Resolve(Element e, Document doc, PsetEntry? entry, IdsIssueRef req)
    {
        var t = new Target { Elem = e, ValueKind = entry?.ValueKind ?? ValueKind.Text };
        if (entry == null)
        {
            t.Reason = $"no parameter mapping for {req.Requirement} — Sentinel does not know where this value lives";
            return t;
        }
        t.Current = GovernedElementExtractor.ReadEntry(e, doc, entry) ?? "";
        var type = doc.GetElement(e.GetTypeId());
        string? whyNot = null;

        foreach (var c in entry.Candidates)
        {
            if (c.Kind == ParamKind.ElementName)
            {
                t.Reason = "an instance's Name comes from its type — rename the type with the Naming Manager";
                return t;
            }
            if (c.Kind == ParamKind.WallFunction)
            {
                var fn = type?.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
                if (fn == null || fn.IsReadOnly) continue;
                t.Elem = type!; t.IsType = true; t.ParamName = fn.Definition.Name; t.BuiltIn = "FUNCTION_PARAM";
                t.Via = "wall type Function (Exterior = TRUE)"; t.ValueKind = ValueKind.YesNo; t.Writable = true;
                return t;
            }

            // Instance first, then type (net48/2023 rejects a tuple-array foreach here — two explicit passes).
            Parameter? pInst = c.Kind == ParamKind.Lookup
                ? e.LookupParameter(c.Name)
                : Enum.TryParse<BuiltInParameter>(c.Name, out var bipInst) ? e.get_Parameter(bipInst) : null;
            if (pInst != null)
            {
                if (pInst.IsReadOnly) { whyNot ??= $"{pInst.Definition.Name} is read-only on the instance"; }
                else if (!StorageFits(pInst, entry.ValueKind, out var whyInst)) { whyNot ??= whyInst; }
                else
                {
                    t.Elem = e; t.IsType = false; t.ParamName = pInst.Definition.Name;
                    t.BuiltIn = c.Kind == ParamKind.BuiltIn ? c.Name : "";
                    t.Via = "instance parameter"; t.Writable = true;
                    return t;
                }
            }
            if (type != null)
            {
                Parameter? pType = c.Kind == ParamKind.Lookup
                    ? type.LookupParameter(c.Name)
                    : Enum.TryParse<BuiltInParameter>(c.Name, out var bipType) ? type.get_Parameter(bipType) : null;
                if (pType != null)
                {
                    if (pType.IsReadOnly) { whyNot ??= $"{pType.Definition.Name} is read-only on the type"; }
                    else if (!StorageFits(pType, entry.ValueKind, out var whyType)) { whyNot ??= whyType; }
                    else
                    {
                        t.Elem = type; t.IsType = true; t.ParamName = pType.Definition.Name;
                        t.BuiltIn = c.Kind == ParamKind.BuiltIn ? c.Name : "";
                        t.Via = "type parameter"; t.Writable = true;
                        return t;
                    }
                }
            }
        }
        var names = string.Join(" / ", entry.Candidates.Where(c => c.Name.Length > 0).Select(c => c.Name));
        t.Reason = whyNot ?? $"no parameter for {req.Requirement} on the element or its type ({names}) — add it before fixing here";
        return t;
    }

    private static bool StorageFits(Parameter p, ValueKind kind, out string why)
    {
        why = "";
        switch (kind)
        {
            case ValueKind.YesNo when p.StorageType == StorageType.Integer: return true;
            case ValueKind.Text when p.StorageType == StorageType.String: return true;
            case ValueKind.Number when p.StorageType == StorageType.String: return true;
            case ValueKind.Number when p.StorageType == StorageType.Double:
                why = $"{p.Definition.Name} is a unit-bearing number — set it in Revit's properties; fix-in-place writes text and yes/no only";
                return false;
            default:
                why = $"{p.Definition.Name} is stored as {p.StorageType}, not as {kind}";
                return false;
        }
    }

    private static string LabelOf(Element e, Document doc)
    {
        var type = doc.GetElement(e.GetTypeId()) as ElementType;
        var fam = type?.FamilyName;
        return $"{e.Category?.Name ?? "?"} · {(string.IsNullOrEmpty(fam) ? "" : fam + ": ")}{e.Name} · {e.Id.IdValue()}";
    }

    /// <summary>The rows' instances as the referee sees them NOW, each identity.GlobalId set to the issue GUID
    /// so the referee's per-element echo matches the topic. Type rows expand to their instances.</summary>
    public static List<GovElement> Extract(Document doc, string modelId, Plan plan, IEnumerable<FixRow> rows, string? org)
    {
        var ids = rows.SelectMany(r => r.InstanceIds).Distinct().Select(i => i.ToElementId()).ToList();
        var els = GovernedElementExtractor.ExtractByIds(doc, modelId, ids, org);
        foreach (var el in els)
            if (plan.GuidOf.TryGetValue(el.localId, out var g)) el.identity.GlobalId = g;
        return els;
    }

    /// <summary>The dry run's payload: the rows' instances with each proposed value patched in. Nothing is written.</summary>
    public static List<GovElement> ExtractPatched(Document doc, string modelId, Plan plan, IEnumerable<FixRow> rows, IdsIssueRef req, string? org)
    {
        var list = rows.ToList();
        var rowOf = new Dictionary<long, FixRow>();
        foreach (var r in list) foreach (var i in r.InstanceIds) rowOf[i] = r;
        return Extract(doc, modelId, plan, list, org)
            .Select(el => FixPlan.Patch(el, req, rowOf[el.localId].Proposed.Trim(), el.identity.GlobalId ?? ""))
            .ToList();
    }

    /// <summary>ONE transaction; each write independent; every row gets its own outcome. Successes are audited
    /// to the model's request store (Approved, VerdictNote names the BCF guid) + ROI. If the transaction does
    /// not commit, every "done" becomes "nothing was written" — the outcome list never overstates.</summary>
    public static List<RowOutcome> Apply(Document doc, IEnumerable<FixRow> rows, IdsIssueRef req, string bcfGuid)
    {
        var outcomes = new List<RowOutcome>();
        var user = doc.Application.Username;
        using var t = new Transaction(doc, $"Sentinel: fix-in-place {req.Requirement}");
        t.Start();
        foreach (var row in rows)
        {
            var o = new RowOutcome { Row = row };
            outcomes.Add(o);
            try
            {
                if (!row.Writable) { o.Message = row.NotFixableReason ?? "not fixable here"; continue; }
                var holder = doc.GetElement(row.TargetId.ToElementId());
                if (holder == null) { o.Message = "element no longer exists"; continue; }
                Parameter? p = row.BuiltIn.Length > 0 && Enum.TryParse<BuiltInParameter>(row.BuiltIn, out var bip)
                    ? holder.get_Parameter(bip)
                    : holder.LookupParameter(row.ParamName);
                if (p == null || p.IsReadOnly) { o.Message = $"{row.ParamName} is no longer writable"; continue; }

                var value = row.Proposed.Trim();
                if (value.Length == 0) { o.Message = "no value entered"; continue; }
                bool set;
                if (row.ValueKind == ValueKind.YesNo)
                {
                    var yn = FixPlan.NormalizeYesNo(value);
                    if (yn == null) { o.Message = $"'{value}' is not a yes/no value"; continue; }
                    set = row.BuiltIn == "FUNCTION_PARAM"
                        ? p.Set((int)(yn == "TRUE" ? WallFunction.Exterior : WallFunction.Interior))
                        : p.Set(yn == "TRUE" ? 1 : 0);
                    value = yn;
                }
                else set = p.Set(value);
                if (!set) { o.Message = "Revit refused the value"; continue; }

                RequestStore.Upsert(doc, new ChangeRequest
                {
                    RuleId = req.Requirement, ElementId = row.TargetId,
                    ElementCategory = holder.Category?.Name ?? holder.GetType().Name,
                    OldValue = row.Current, NewValue = value, RequestedBy = user,
                    Status = RequestStatus.Approved, VerdictBy = user, VerdictAt = DateTimeOffset.Now,
                    VerdictNote = $"fix-in-place · BCF {bcfGuid}",
                }, new AuditEntry
                {
                    Actor = user, Action = "fix.applied",
                    Detail = $"{req.Requirement}: '{row.Current}' -> '{value}' ({row.ScopeText})",
                });
                row.Current = value;
                o.Ok = true; o.Message = "done";
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { o.Message = "Revit refused: " + ex.Message; }
        }
        if (t.Commit() != TransactionStatus.Committed)
        {
            foreach (var o in outcomes.Where(x => x.Ok)) { o.Ok = false; o.Message = "transaction did not commit — nothing was written"; }
            return outcomes;
        }
        foreach (var o in outcomes.Where(x => x.Ok))
            RoiTracker.Log("fix", $"{req.Requirement}: '{o.Row.Current}' via {o.Row.ResolvedVia} (BCF {bcfGuid})");
        return outcomes;
    }
}
