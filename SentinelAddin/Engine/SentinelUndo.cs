using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>XC-2: one Sentinel action = one Undo entry named "Sentinel: …". The action's own transactions run inside a
/// TransactionGroup: kept → Assimilate (one entry), declined → RollBack (none), a throw → RollBack and rethrow to the
/// caller's own handler. A preview (graphics shown only while Sentinel works) always rolls back. A group lives inside
/// one API-thread call — never across two ExternalEvent runs.</summary>
public static class SentinelUndo
{
    public static bool Run(Document doc, string name, Func<bool> body)
    {
        using var g = new TransactionGroup(doc, "Sentinel: " + name);
        g.Start();
        bool keep;
        try { keep = body(); }
        catch { RollBack(g, doc); throw; }
        // MA-1a item 7 (review amendment C9): kept only when Revit assimilated the group — a caller that reports what the
        // action did must not report a group Revit did not keep.
        if (keep) keep = g.Assimilate() == TransactionStatus.Committed; else RollBack(g, doc);
        return keep;
    }

    /// <summary>Rolls an open group back and lets the pane drop the rows of the elements that went with it
    /// (SentinelUpdater.DropGone: Revit names no element for a rolled-back group). A group that is not open is left alone.</summary>
    public static void RollBack(TransactionGroup g, Document doc)
    {
        if (!g.HasStarted() || g.HasEnded()) return;
        g.RollBack();
        Sentinel.Updaters.SentinelUpdater.DropGone(doc);
    }

    public static void Preview(Document doc, string name, Action body)
    {
        using var g = new TransactionGroup(doc, "Sentinel: " + name);
        g.Start();
        try { body(); }
        finally { RollBack(g, doc); }
    }
}
