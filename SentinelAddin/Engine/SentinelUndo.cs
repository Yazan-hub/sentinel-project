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
        catch { if (g.HasStarted()) g.RollBack(); throw; }
        if (keep) g.Assimilate(); else g.RollBack();
        return keep;
    }

    public static void Preview(Document doc, string name, Action body)
    {
        using var g = new TransactionGroup(doc, "Sentinel: " + name);
        g.Start();
        try { body(); }
        finally { if (g.HasStarted()) g.RollBack(); }
    }
}
