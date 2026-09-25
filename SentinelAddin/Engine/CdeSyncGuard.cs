using System.Collections.Concurrent;
using System.IO;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// CDE Sync Guard (CDE-01): judges the central file name by the project's naming@n — the standard the bridge's
/// /propose applies — when a sync completes. Revit's API cannot veto a sync (DocumentSynchronizedWithCentral is
/// a post-event and the Synchronizing pre-event is not cancellable), so the guard reports loudly instead of
/// blocking. The naming@n is resolved OFF Revit's thread (Prefetch, at open and after each sync) and only read
/// here; the decision itself is pure (CdeSyncGuard.Judge.cs, pinned by tools/naming-port-check).
/// </summary>
public static partial class CdeSyncGuard
{
    // ponytail: one entry per web project key for the session; a Prefetch that has not landed reads as
    // "not fetched yet" and the next sync retries.
    private static readonly ConcurrentDictionary<string, ResolvedArtefact> Naming = new(StringComparer.Ordinal);

    /// <summary>Resolve the project's naming@n on a background task, for the next sync. Unbound → no-op. Never throws.</summary>
    public static void Prefetch(ProjectContext ctx)
    {
        if (!ctx.IsBound) return;
        string key = ctx.Key;
        Task.Run(() => Naming[key] = ArtefactClient.Resolve(key, "naming"));
    }

    /// <summary>The naming@n last resolved for this document's project; null when unbound or not fetched yet.</summary>
    public static ResolvedArtefact? LastNaming(ProjectContext ctx) =>
        ctx.IsBound && Naming.TryGetValue(ctx.Key, out var n) ? n : null;

    /// <summary>Called from App.OnSynchronized (API thread) with the document's context and
    /// <see cref="LastNaming"/>. Returns the row for the panel, or null when compliant or not workshared.</summary>
    public static Violation? Check(DocumentSynchronizedWithCentralEventArgs e, ProjectContext ctx, ResolvedArtefact? naming)
    {
        var doc = e.Document;
        if (doc is null || !doc.IsWorkshared) return null;

        string fileName = Path.GetFileNameWithoutExtension(
            doc.GetWorksharingCentralModelPath() is ModelPath mp
                ? ModelPathUtils.ConvertModelPathToUserVisiblePath(mp)
                : doc.PathName);
        if (string.IsNullOrEmpty(fileName)) fileName = doc.Title;

        string label = !ctx.IsBound ? "not bound — Sentinel ▸ Project Setup"
            : naming is null ? "naming@n not fetched from the bridge yet — CDE-01 checks from the next sync"
            : naming.Label;
        // The project code comes from the document (Project Setup) only, never the machine config.
        return Decide(fileName, SettingsManager.LoadFromDocument(doc)?.ProjectCode, App.OrgFor(doc), naming?.BodyJson, label);
    }
}
