#nullable disable
// Revert (2026-10-20, docs/superpowers/specs/2026-10-20-revert-and-persisted-design.md §A): a compensating change for an applied changeset, days
// later, across sessions and syncs — never Revit's Undo. Each applied row goes back only where the element still holds what the changeset set
// (its stamp names the changeset, and its value, type, line or top is the changeset's); any other is KEPT as it stands with why (the executor's
// Kept pattern), as is one a person holds (HeldBy) or the protection policy protects. A create is deleted only when deleting it takes nothing
// else (a probe delete, rolled back: its own tags and other creates of this revert are allowed). One transaction, all or nothing on errors
// (GhostFailureHandler), named for the undo watcher (UndoWatcher.RevertTxName). commit false is the preview: everything runs and is rolled back,
// so the window shows exactly what Revert would do. API thread. RevertPlan is the Revit-free half.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.GhostBuilder;

public static class ChangesetReverter
{
    private const double MmToFeet = 1.0 / 304.8;
    private const double TolFt = 0.5 * MmToFeet;

    public sealed class Outcome
    {
        public List<string> Reverted { get; } = new();
        public List<(string ProposalGuid, string Label, string Why)> Kept { get; } = new();
        /// <summary>Nothing changed: the revert threw or Revit rolled it back — said in Revit's words.</summary>
        public string Error { get; set; }
        public string Tx { get; set; }
        /// <summary>Human-error guards §3: each delete's re-created copy, by proposal — its UniqueId is new; the revert's saved check looks for it.</summary>
        public Dictionary<string, string> Recreated { get; } = new(StringComparer.Ordinal);
    }

    public static Outcome Run(Document doc, ChangesetDto cs, ProtectionRules rules, bool commit)
    {
        var o = new Outcome { Tx = UndoWatcher.RevertTxName(cs.Name, cs.Id) };
        var applied = RevertPlan.Applied(cs).GroupBy(a => a.ProposalGuid).ToDictionary(g => g.Key, g => g.First());
        var rows = (cs.Elements ?? new List<ChangesetElementDto>()).Where(e => applied.ContainsKey(e.ProposalGuid)).ToList();
        var org = App.OrgFor(doc);
        using var t = new Transaction(doc, o.Tx);
        t.Start();
        var handler = GhostFailureHandler.AllOrNothingOn(t);
        string at = null;
        try
        {
            void Keep(ChangesetElementDto el, string why) => o.Kept.Add((el.ProposalGuid, ChangesetTrust.GhostName(el), why));
            var creates = new List<(ChangesetElementDto El, Element E)>();
            foreach (var el in rows)
            {
                at = ChangesetTrust.GhostName(el);
                var a = applied[el.ProposalGuid];
                if (RevertPlan.NeverWhy(el, a) is string never) { Keep(el, never); continue; }
                // Human-error guards §3: a delete's copy is gone by design — it comes back as a copy of the element it duplicated, or is kept in words.
                if (el.Op == "delete") { if (Recreate(doc, cs, el, a, o, rules) is string no) Keep(el, no); else o.Reverted.Add(el.ProposalGuid); continue; }
                var e = doc.GetElement(a.RevitUniqueId);
                if (e == null) { Keep(el, "is no longer in this model — nothing to revert"); continue; }
                if (!ProvenanceStamp.Holds(ProvenanceStamp.Read(e), cs.Id, el.ProposalGuid))
                { Keep(el, "does not carry this changeset's stamp in this model — it was undone already, or this is another copy of the model"); continue; }
                if (ChangesetExecutor.HeldBy(doc, e) is string held) { Keep(el, held.Replace("run Promote again", "revert again") + " — kept as it stands"); continue; }
                if (ChangesetExecutor.ProtectionWhy(doc, e, rules ?? ProtectionRules.Default("not read")) is string prot)
                { Keep(el, prot + " — kept as it stands; a lead reverts it by hand or installs a looser protection policy"); continue; }
                var why = el.Op switch
                {
                    "set_parameter" => e is ElementType et ? FixInPlaceService.ClearOnType(doc, et, el.Parameter, el.To, org) : "is not a type",
                    "retype" => Retype(doc, el, e),
                    "attach" => Attach(doc, el, e, a.Before),
                    "reshape" => Reshape(el, e),
                    _ => AsCreated(el, e),
                };
                if (why != null) { Keep(el, why); continue; }
                if (el.Op is null or "create") creates.Add((el, e));
                else { ProvenanceStamp.WriteReverted(e, cs.Id, el.ProposalGuid); o.Reverted.Add(el.ProposalGuid); } // spec 2026-10-20 §4: its save is checked by this mark
            }

            // Creates: removed together, each only when removing it takes nothing but its tags and other creates of this revert — repeated until
            // no create drops out (a door kept keeps its wall).
            at = "the elements this changeset created";
            var go = creates.ToList();
            for (var changed = true; changed && go.Count > 0;)
            {
                changed = false;
                var ids = new HashSet<long>(go.Select(c => c.E.Id.IdValue()));
                foreach (var c in go.ToList())
                {
                    ICollection<ElementId> probe;
                    try { using (var st = new SubTransaction(doc)) { st.Start(); probe = doc.Delete(c.E.Id); st.RollBack(); } }
                    catch (Exception ex) { Keep(c.El, $"cannot be removed — Revit refused: {ex.Message}"); go.Remove(c); changed = true; continue; }
                    var others = probe.Where(id => !ids.Contains(id.IdValue()) && !(doc.GetElement(id) is IndependentTag or SpatialElementTag)).ToList();
                    if (others.Count == 0) continue;
                    Keep(c.El, $"removing it would also remove {others.Count} other element(s) (" +
                               string.Join(", ", others.Take(3).Select(id => doc.GetElement(id)?.Category?.Name ?? "an element with no category")) + (others.Count > 3 ? ", …" : "") +
                               ") — kept as it stands; a person decides");
                    go.Remove(c);
                    changed = true;
                }
            }
            if (go.Count > 0) doc.Delete(go.Select(c => c.E.Id).ToList());
            o.Reverted.AddRange(go.Select(c => c.El.ProposalGuid));
        }
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            o.Reverted.Clear();
            o.Error = $"{at}: {ex.Message} — nothing was reverted";
            return o;
        }
        if (!commit || o.Reverted.Count == 0) { t.RollBack(); return o; }
        if (t.Commit() != TransactionStatus.Committed)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            o.Reverted.Clear();
            o.Error = "Revit did not commit the revert" + (handler.RolledBack != null ? ": " + handler.RolledBack : "") + " — nothing was reverted";
        }
        return o;
    }

    /// <summary>Human-error guards §3: a deleted copy re-created — the element it duplicated copied in place (no move), the copy's own stored values
    /// written back, its own IfcGUID or none (never the kept element's: one GlobalId twice breaks FG-01), and a fresh stamp marked reverted. Null when
    /// done; the words when it cannot be exact: the copy is back already, or the element kept is gone, no longer where it was, held or protected, or
    /// copying it makes more than one element. Inside the revert's transaction; a value Revit refuses is left as the copy of the kept element holds it.</summary>
    private static string Recreate(Document doc, ChangesetDto cs, ChangesetElementDto el, RevertPlan.AppliedRow a, Outcome o, ProtectionRules rules)
    {
        if (doc.GetElement(a.RevitUniqueId ?? "") != null) return "the copy is in this model again (an Undo, or another copy of the model) — nothing to re-create";
        var keeper = doc.GetElement(a.Deleted.KeeperUniqueId);
        if (keeper == null) return "the element it duplicated is no longer in this model — Sentinel cannot re-create the copy exactly; a person decides";
        if (ChangesetExecutor.HeldBy(doc, keeper) is string held) return $"the element it duplicated {held} — a person decides";
        if (ChangesetExecutor.ProtectionWhy(doc, keeper, rules ?? ProtectionRules.Default("not read")) is string prot) return $"the element it duplicated {prot} — a lead re-creates it by hand";
        ICollection<ElementId> made;
        try { made = ElementTransformUtils.CopyElement(doc, keeper.Id, XYZ.Zero); }
        catch (Exception ex) { return $"Revit refused to copy the element it duplicated ({ex.Message}) — a person decides"; }
        // the copy Revit makes may bring its own sketch or nested parts (ChangesetExecutor.OwnPart): the one element of the kept element's type and category is the copy
        var mains = made.Select(doc.GetElement).Where(x => x != null && x.GetTypeId().Equals(keeper.GetTypeId()) && x.Category?.Id.IdValue() == keeper.Category?.Id.IdValue()).ToList();
        if (mains.Count != 1 || made.Any(id => !id.Equals(mains[0].Id) && !ChangesetExecutor.OwnPart(doc, mains[0], id)))
        {
            if (made.Count > 0) doc.Delete(made);
            return $"copying the element it duplicated makes {made.Count} elements, not one with its own parts — a person decides";
        }
        var e = mains[0];
        doc.Regenerate();
        if (ChangesetExecutor.DuplicateWhyNot(doc, e, keeper) is string notSame) { doc.Delete(e.Id); return $"the copy Revit made {notSame} — a person decides"; }
        foreach (var v in a.Deleted.Values ?? new List<ParamValueDto>())
        {
            var p = v.Id < 0 ? e.get_Parameter((BuiltInParameter)(int)v.Id) : e.Parameters.Cast<Parameter>().FirstOrDefault(x => x.Id.IdValue() == v.Id);
            if (p == null || p.IsReadOnly || p.StorageType.ToString() != v.Storage) continue;
            try
            {
                var inv = System.Globalization.CultureInfo.InvariantCulture;
                switch (p.StorageType)
                {
                    case StorageType.String: if (p.AsString() != v.Value) p.Set(v.Value ?? ""); break;
                    case StorageType.Integer: if (int.TryParse(v.Value, System.Globalization.NumberStyles.Integer, inv, out var n) && p.AsInteger() != n) p.Set(n); break;
                    case StorageType.Double: if (double.TryParse(v.Value, System.Globalization.NumberStyles.Float, inv, out var d) && p.AsDouble() != d) p.Set(d); break;
                    case StorageType.ElementId: if (long.TryParse(v.Value, System.Globalization.NumberStyles.Integer, inv, out var id) && p.AsElementId().IdValue() != id) p.Set(Compat.ToElementId(id)); break;
                }
            }
            catch (Exception) { /* ponytail: a value Revit refuses (one that only fits the old element) stays as copied; the row still goes back */ }
        }
        // the kept element's IfcGUID, copied with it, would be one GlobalId twice — the copy gets its own stored one back, else none (the exporter makes one)
        var guid = e.get_Parameter(BuiltInParameter.IFC_GUID);
        if (guid != null && !guid.IsReadOnly && !string.IsNullOrEmpty(guid.AsString()) && guid.AsString() == keeper.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString()) guid.Set("");
        ProvenanceStamp.WriteRecreated(e, cs.Id, cs.Source, el.ProposalGuid);
        o.Recreated[el.ProposalGuid] = e.UniqueId;
        return null;
    }

    private static string Retype(Document doc, ChangesetElementDto el, Element e)
    {
        if (string.IsNullOrEmpty(el.Target?.TypeBefore)) return "the type before the retype was not recorded — a person retypes it";
        var cur = doc.GetElement(e.GetTypeId()) as ElementType;
        if (cur == null) return "has no type Sentinel can read";
        var want = el.Place?.TypeName;
        var same = string.Equals(cur.Name, want, StringComparison.OrdinalIgnoreCase)
                   && (!(cur is FamilySymbol s) || string.IsNullOrEmpty(el.Place?.FamilyName) || string.Equals(s.FamilyName, el.Place.FamilyName, StringComparison.OrdinalIgnoreCase));
        if (!same) return $"is \"{ChangesetExecutor.TypeLabel(cur)}\" now, not the changeset's \"{want}\" — retyped since; kept as it stands";
        var back = e.GetValidTypes().Select(doc.GetElement).OfType<ElementType>()
                    .FirstOrDefault(x => string.Equals(ChangesetExecutor.TypeLabel(x), el.Target.TypeBefore, StringComparison.OrdinalIgnoreCase));
        if (back == null) return $"\"{el.Target.TypeBefore}\" is no longer in this model — load it, then revert again";
        if (ChangesetExecutor.Unsafe(e, el.Kind, cur, back) is string no) return no;
        if (back is FamilySymbol fs && !fs.IsActive) { fs.Activate(); doc.Regenerate(); }
        var host = (e as FamilyInstance)?.Host?.Id;
        var centre0 = el.Kind is "column" or "beam" ? Centre(e) : null;
        if (e.ChangeTypeId(back.Id) != ElementId.InvalidElementId) throw new InvalidOperationException($"Revit replaced the {el.Kind} on the retype back");
        if (host != null && !host.Equals((e as FamilyInstance)?.Host?.Id)) throw new InvalidOperationException($"{el.Kind} {e.UniqueId} lost its host on the retype back");
        if (centre0 != null)
        {
            doc.Regenerate();
            var centre1 = Centre(e);
            if (centre1 == null || (centre1 - centre0).GetLength() > TolFt)
                throw new InvalidOperationException($"{el.Kind} {e.UniqueId} would move on the retype back — the two families' origins differ; a person retypes it");
        }
        return null;
    }

    private static string Attach(Document doc, ChangesetElementDto el, Element e, AttachBeforeDto before)
    {
        if (!(e is Wall w)) return "is not a wall";
        var b = Level(doc, el.Place?.BaseLevel);
        var top = Level(doc, el.Place?.TopLevel);
        double Off(BuiltInParameter p) => w.get_Parameter(p)?.AsDouble() ?? 0;
        if (b == null || top == null || !b.Id.Equals(w.get_Parameter(BuiltInParameter.WALL_BASE_CONSTRAINT)?.AsElementId()) || Math.Abs(Off(BuiltInParameter.WALL_BASE_OFFSET)) > TolFt
            || !top.Id.Equals(w.get_Parameter(BuiltInParameter.WALL_HEIGHT_TYPE)?.AsElementId()) || Math.Abs(Off(BuiltInParameter.WALL_TOP_OFFSET)) > TolFt)
            return $"its base or top is no longer {el.Place?.BaseLevel} +0 to {el.Place?.TopLevel} +0 — changed since the attach; kept as it stands";
        if (before.TopLevel != null)
        {
            var was = Level(doc, before.TopLevel);
            if (was == null) return $"level {before.TopLevel}, its top before, is no longer in this model — a person resets it";
            Set(w, BuiltInParameter.WALL_HEIGHT_TYPE, p => p.Set(was.Id));
            Set(w, BuiltInParameter.WALL_TOP_OFFSET, p => p.Set((before.TopOffsetMm ?? 0) * MmToFeet));
        }
        else
        {
            if (!(before.HeightMm is double h && h > 0)) return "its height before the attach was not recorded — a person resets it";
            Set(w, BuiltInParameter.WALL_HEIGHT_TYPE, p => p.Set(ElementId.InvalidElementId));
            Set(w, BuiltInParameter.WALL_USER_HEIGHT_PARAM, p => p.Set(h * MmToFeet));
        }
        return null;
    }

    private static string Reshape(ChangesetElementDto el, Element e)
    {
        var c = el.Place?.LocationCurve;
        var was = el.Target?.Placed;
        if (c?.Start == null || c.End == null || was?.Start == null || was.End == null) return "the reshape holds no line to go back to";
        if (!(e is Wall w) || !((w.Location as LocationCurve)?.Curve is Line now)) return "is no longer a straight wall — edited by hand since; kept as it stands";
        XYZ a0 = now.GetEndPoint(0), a1 = now.GetEndPoint(1);
        if (!PlacementGeometry.AsPlaced(a0.X / MmToFeet, a0.Y / MmToFeet, a1.X / MmToFeet, a1.Y / MmToFeet, c.Start, c.End, ChangesetExecutor.ReshapeTolMm))
            return "was moved by hand since the reshape — kept as it stands; a person decides";
        // the old line runs the wall's own way (a line set end for end would turn the wall inside out — the executor's rule)
        double bx = was.End[0] - was.Start[0], by = was.End[1] - was.Start[1];
        var (s0, s1) = bx * (a1.X - a0.X) + by * (a1.Y - a0.Y) < 0 ? (was.End, was.Start) : (was.Start, was.End);
        ((LocationCurve)w.Location).Curve = Line.CreateBound(new XYZ(s0[0] * MmToFeet, s0[1] * MmToFeet, a0.Z), new XYZ(s1[0] * MmToFeet, s1[1] * MmToFeet, a0.Z));
        return null;
    }

    /// <summary>A create is "as created" when its type is the changeset's and it stands where it was placed. ponytail: a person's other edits (a
    /// parameter typed by hand) are not seen — the stamp, type and position are what Revert can prove.</summary>
    private static string AsCreated(ChangesetElementDto el, Element e)
    {
        var want = el.Place?.TypeName;
        if (!string.IsNullOrEmpty(want) && e.Document.GetElement(e.GetTypeId()) is ElementType cur && !string.Equals(cur.Name, want, StringComparison.OrdinalIgnoreCase))
            return $"is \"{ChangesetExecutor.TypeLabel(cur)}\" now, not \"{want}\" — retyped since it was placed; kept as it stands";
        var c = el.Place?.LocationCurve;
        if (c?.Start is { Length: >= 2 } && c.End is { Length: >= 2 } && e.Location is LocationCurve lc)
        {
            XYZ p0 = lc.Curve.GetEndPoint(0), p1 = lc.Curve.GetEndPoint(1);
            if (!PlacementGeometry.AsPlaced(p0.X / MmToFeet, p0.Y / MmToFeet, p1.X / MmToFeet, p1.Y / MmToFeet, c.Start, c.End, ChangesetExecutor.ReshapeTolMm))
                return "was moved by hand since it was placed — kept as it stands; a person decides";
        }
        if (el.Place?.Location is { Length: >= 2 } p && e.Location is LocationPoint lp
            && Math.Sqrt(Math.Pow(lp.Point.X / MmToFeet - p[0], 2) + Math.Pow(lp.Point.Y / MmToFeet - p[1], 2)) > ChangesetExecutor.ReshapeTolMm)
            return "was moved by hand since it was placed — kept as it stands; a person decides";
        return null;
    }

    private static Level Level(Document doc, string name) => string.IsNullOrEmpty(name) ? null
        : new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().FirstOrDefault(l => string.Equals(l.Name, name, StringComparison.OrdinalIgnoreCase));

    private static void Set(Element e, BuiltInParameter bip, Func<Parameter, bool> set)
    {
        var p = e.get_Parameter(bip);
        if (p == null || p.IsReadOnly || !set(p)) throw new InvalidOperationException($"Revit refused {bip} on {e.UniqueId}");
    }

    private static XYZ Centre(Element e) { var bb = e.get_BoundingBox(null); return bb == null ? null : (bb.Min + bb.Max) / 2; }
}
