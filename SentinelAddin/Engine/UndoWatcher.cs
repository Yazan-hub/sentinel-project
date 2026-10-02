#nullable disable
// MA-0 undo watcher v0 (design §6.4, AI-3): when a person undoes or redoes a Sentinel changeset transaction, one
// changeset_reverted ledger row lists its guids. The changeset's transaction name carries its id, and the registry is
// filled only after the result was reported, so a hit is always a changeset the bridge knows was applied. Only
// Undo/Redo count — deletions from Reload Latest or another user's sync never do. The registry lives in memory:
// Revit clears Undo when a model reopens anyway. The matcher is pure (tools/promote-check); SENTINEL_CHECK hides the
// Revit half. The handler makes no API writes and no blocking HTTP call on Revit's thread.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
#if !SENTINEL_CHECK
using System.Threading.Tasks;
using Autodesk.Revit.DB.Events;
using Sentinel.Commands;
using Sentinel.Coordination;
#endif

namespace Sentinel.Engine
{
    public static class UndoWatcher
    {
        public sealed class Entry
        {
            public string Key, ChangesetId;
            public List<string> Guids;
        }

        // MA-1a step 2: one Undo name may cover several changesets — a Ghost build over 200 elements is several changesets run
        // inside one TransactionGroup, assimilated into one Undo entry named as the first changeset.
        private static readonly ConcurrentDictionary<string, List<Entry>> Registry = new ConcurrentDictionary<string, List<Entry>>(StringComparer.Ordinal);

        /// <summary>The executor's transaction name — what Revit's Undo list shows and GetTransactionNames returns.</summary>
        public static string TxName(string name, string id) =>
            $"Sentinel AI changeset: {name} [{(id ?? "").Substring(0, Math.Min(8, (id ?? "").Length))}]";

        /// <summary>Remember a changeset whose result the bridge accepted, under the Undo name that removes it. Remembering the
        /// same changeset again under the same name replaces it; another changeset under that name is added beside it.</summary>
        public static void Remember(string tx, string key, string changesetId, IEnumerable<string> guids)
        {
            var list = (guids ?? Enumerable.Empty<string>()).Where(g => !string.IsNullOrEmpty(g)).Distinct().ToList();
            if (string.IsNullOrEmpty(tx) || list.Count == 0) return;
            var entry = new Entry { Key = key, ChangesetId = changesetId, Guids = list };
            Registry.AddOrUpdate(tx, _ => new List<Entry> { entry },
                (_, old) => old.Where(o => o.ChangesetId != changesetId).Concat(new[] { entry }).ToList());
        }

        /// <summary>The remembered changesets among <paramref name="names"/>, each once (a Ghost build is remembered under its
        /// Undo entry's name and under each changeset's own transaction name, whichever Revit reports); unknown names are
        /// ignored.</summary>
        public static List<Entry> Hits(IEnumerable<string> names) =>
            (names ?? Enumerable.Empty<string>()).Distinct(StringComparer.Ordinal)
                .SelectMany(n => Registry.TryGetValue(n, out var es) ? es : new List<Entry>())
                .GroupBy(e => e.ChangesetId ?? "", StringComparer.Ordinal).Select(g => g.First()).ToList();

        /// <summary>"undo", "redo", or null (any other operation is not a revert).</summary>
        public static string OpOf(bool undone, bool redone) => undone ? "undo" : redone ? "redo" : null;

#if !SENTINEL_CHECK
        /// <summary>DocumentChanged handler (App.OnStartup subscribes it).</summary>
        public static void OnChanged(object sender, DocumentChangedEventArgs e)
        {
            try
            {
                var op = OpOf(e.Operation == UndoOperation.TransactionUndone, e.Operation == UndoOperation.TransactionRedone);
                if (op == null || Registry.IsEmpty) return;
                foreach (var hit in Hits(e.GetTransactionNames()))
                {
                    var h = hit;
                    Task.Run(() =>
                    {
                        var ok = ChangesetClient.ReportReverted(BcfConfig.Load(), h.Key, h.ChangesetId, h.Guids, op, out var error);
                        App.PanelVm?.LogDoctor(ok
                            ? $"Undo watcher: {op} of changeset {Short(h.ChangesetId)} — changeset_reverted row posted ({h.Guids.Count} guid(s))"
                            : $"Undo watcher: {op} of changeset {Short(h.ChangesetId)} — changeset_reverted row NOT posted: {error}");
                    });
                }
            }
            catch (Exception ex) { App.PanelVm?.LogDoctor("Undo watcher failed: " + ex.Message); }
        }

        private static string Short(string id) => (id ?? "").Substring(0, Math.Min(8, (id ?? "").Length));
#endif
    }
}
