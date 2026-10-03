#nullable disable
// MA-1a item 7 (audit XC-5's modelling subset, blueprint P1-9): the one ledger row each modelling command reports for a
// run — Datum, Ghost Builder, Photo Massing, Annotate, Apply Standard, auto-fix, fix-in-place and the Doctor. Pure — no
// Revit API, no HTTP — so tools/promote-check pins every body. Each is a POST /cde/:key/audit body {entity_type, actor,
// action, new_value}; the bridge allows the types (cde-store.mjs REVIT_REPORT_TYPES) and stamps a signed-in caller's
// verified identity over `actor`. One row per run, click or window — never one per element: a list holds at most
// MaxNames entries beside its true total (HealRecord's rule). A row carries counts, names of model things and file
// hashes; no file contents, no path, and no person but the actor.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder; // MA-2b: LodStateReport

namespace Sentinel.Coordination
{
    public static class CommandReports
    {
        /// <summary>Entries kept per list; the totals stay true.</summary>
        public const int MaxNames = 50;
        private const int MaxAction = 500; // the route's cap on an action (cde-store.mjs recordRevitReport)

        private static object Row(string type, string actor, string action, object value) => new
        {
            entity_type = type,
            actor,
            action = action.Length <= MaxAction ? action : action.Substring(0, MaxAction),
            new_value = value,
        };

        /// <summary>Datum from Drawings, after its transaction committed. <paramref name="sourceSha256"/> is the picked
        /// drawing's sha, null when the run read imports already in the model.</summary>
        public static object Datum(int levels, int grids, int notes, string sourceSha256, string actor) =>
            Row("datum", actor, $"Datum from Drawings created {levels} level(s) and {grids} grid(s)",
                new { levels_created = levels, grids_created = grids, notes, source_sha256 = sourceSha256, source = "revit" });

        /// <summary>One Ghost Builder build that was kept. <paramref name="skipped"/> is the elements skipped for no host,
        /// no geometry or a type not in the model; <paramref name="changesetIds"/> the changesets it filed.</summary>
        public static object GhostBuild(string drawing, string level, int placed, int removedByRevit, int wallGaps, int typeGaps, int skipped,
                                        int revitWarnings, int typesAdded, IReadOnlyList<string> changesetIds, string actor) =>
            Row("ghost_build", actor, $"Ghost Builder placed {placed} element(s) from {drawing} on {level}", new
            {
                drawing, level, placed, removed_by_revit = removedByRevit, wall_gaps = wallGaps, type_gaps = typeGaps, skipped,
                revit_warnings = revitWarnings, types_added = typesAdded,
                changesets = changesetIds.Take(MaxNames).ToArray(), changesets_total = changesetIds.Count, source = "revit",
            });

        /// <summary>One Photo Massing build that was kept. <paramref name="imagesSha256"/> is null when the build holds no
        /// number of the vision model's.</summary>
        public static object Massing(int placed, int removedByRevit, int wallGaps, int skipped, int revitWarnings, int typesAdded,
                                     string imagesSha256, string actor) =>
            Row("massing", actor, $"Photo Massing placed {placed} element(s)", new
            {
                placed, removed_by_revit = removedByRevit, wall_gaps = wallGaps, skipped, revit_warnings = revitWarnings,
                types_added = typesAdded, images_sha256 = imagesSha256, source = "revit",
            });

        public static object Annotate(int created, int skippedExisting, int warnings, int levels, string guideline, string actor) =>
            Row("annotate", actor, $"Annotate created {created} view(s) across {levels} level(s)",
                new { views_created = created, skipped_existing = skippedExisting, warnings, levels, guideline, source = "revit" });

        /// <summary>Apply Standard's model half (its ruleset install writes its own artefact row).</summary>
        public static object ApplyStandard(IReadOnlyList<string> created, IReadOnlyList<string> skipped, IReadOnlyList<string> failed, string actor) =>
            Row("apply_standard", actor, $"Apply Standard: {created.Count} created, {skipped.Count} skipped, {failed.Count} failed", new
            {
                created = created.Take(MaxNames).ToArray(), skipped = skipped.Take(MaxNames).ToArray(), failed = failed.Take(MaxNames).ToArray(),
                created_total = created.Count, skipped_total = skipped.Count, failed_total = failed.Count, source = "revit",
            });

        /// <summary>One click of Fix that Revit committed.</summary>
        public static object AutoFix(string ruleId, string category, string oldName, string newName, long elementId, string actor) =>
            Row("auto_fix", actor, $"Auto-fix {ruleId}: 1 {category} renamed",
                new { rule = ruleId, category, old_name = oldName, new_name = newName, element_id = elementId, source = "revit" });

        /// <summary>One fix-in-place Apply whose transaction committed.</summary>
        public static object FixInPlace(string requirement, string bcfGuid, int applied, int notWritten, string actor) =>
            Row("fix_in_place", actor, $"Fix-in-place {requirement}: {applied} value(s) written, {notWritten} not written",
                new { requirement, bcf_guid = bcfGuid, applied, not_written = notWritten, source = "revit" });

        /// <summary>MA-2b: the LOD state of one Promote run ("now", every run — the read-only one too) or of one applied Promote
        /// changeset ("after"): the line, the share, the stage map's project stage, and per level and class the counts with their
        /// reasons (each list at most MaxNames rows and MaxReasons reasons beside its true total). The bridge marks it claimed.</summary>
        public static object LodState(LodStateReport r, IReadOnlyList<string> changesetIds, string actor) =>
            Row("lod_state", actor, $"lod:state {r.When} · {r.Line}", new
            {
                when = r.When, stage = r.Stage, project_stage = r.ProjectStage, matrix = r.Matrix, matrix_sha256 = r.MatrixSha, ids = r.Ids, guideline = r.Guideline,
                line = r.Line, share = r.Share, total = r.Total, at = r.At, below = r.Below, blocked = r.Blocked, not_measured = r.NotMeasured,
                office_typed = r.OfficeTyped,
                rows =r.Rows.Take(MaxNames).Select(x => new
                {
                    level = x.Level, category = x.Category, total = x.Total, at = x.At, below = x.Below, blocked = x.Blocked, not_measured = x.NotMeasured,
                    reasons = x.Reasons.Take(MaxReasons).Select(kv => new { reason = kv.Key.Length <= 200 ? kv.Key : kv.Key.Substring(0, 199) + "…", count = kv.Value }).ToArray(),
                    reasons_total = x.Reasons.Count,
                }).ToArray(),
                rows_total = r.Rows.Count,
                not_run = r.NotRun.Take(MaxNames).ToArray(),
                changesets = (changesetIds ?? new string[0]).Take(MaxNames).ToArray(),
                source = "revit",
            });

        /// <summary>Reasons kept per LOD state row (a row's reasons can be one per element; the count stays true).</summary>
        public const int MaxReasons = 10;

        /// <summary>MA-2c (design §6.4): one Promote run's type gaps — the groups of held elements the office has no type for, each
        /// with its category, the type it wants or its size, the facts its rules read, its element count, labels and the catalogue's
        /// nearest types — and which catalogue and guideline judged. The bridge names each group, words the action and marks the row
        /// claimed (cde-store.mjs typeGapRow); the Holding Area lists the groups.</summary>
        public static object TypeGaps(IReadOnlyList<TypeGapGroup> groups, string catalog, string guideline, string actor) =>
            Row("type_gap", actor, $"type_gap:run · {groups.Count} group(s), {groups.Sum(g => g.Elements)} element(s)", new
            {
                groups = groups.Take(GhostBuilder.TypeGaps.MaxGroups).Select(g => new
                {
                    category = g.Category, want = g.Want, size = g.Size, key = g.Key, elements = g.Elements,
                    labels = g.Labels.ToArray(), nearest = g.Nearest.ToArray(),
                }).ToArray(),
                groups_total = groups.Count, catalog, guideline, source = "revit",
            });

        /// <summary>What the Doctor resolved in one window (DoctorBuffer), with Revit's own fix, in committed transactions.</summary>
        public static object Doctor(DoctorTally tally, string actor) =>
            Row("doctor", actor, $"Doctor: {tally.Resolved} warning(s) resolved with Revit's own fix in {tally.ByTransaction.Count} kind(s) of transaction", new
            {
                resolved = tally.Resolved,
                warnings = tally.ByWarning.OrderByDescending(kv => kv.Value).Take(MaxNames).Select(kv => new { text = kv.Key, count = kv.Value }).ToArray(),
                transactions = tally.ByTransaction.OrderByDescending(kv => kv.Value).Take(MaxNames).Select(kv => new { name = kv.Key, count = kv.Value }).ToArray(),
                element_ids = tally.ElementIds.ToArray(), element_ids_total = tally.ElementIdsTotal,
                window_seconds = DoctorBuffer.WindowSeconds, source = "revit",
            });
    }

    /// <summary>What the Doctor resolved for one project in one window.</summary>
    public sealed class DoctorTally
    {
        public int Resolved;
        public readonly Dictionary<string, int> ByWarning = new Dictionary<string, int>(StringComparer.Ordinal);
        public readonly Dictionary<string, int> ByTransaction = new Dictionary<string, int>(StringComparer.Ordinal);
        /// <summary>The first <see cref="CommandReports.MaxNames"/> distinct element ids, in the order seen.</summary>
        public readonly List<long> ElementIds = new List<long>();
        public int ElementIdsTotal => _ids.Count;
        private readonly HashSet<long> _ids = new HashSet<long>();

        internal void Add(string text, string transaction, IEnumerable<long> ids)
        {
            Resolved++;
            text = string.IsNullOrWhiteSpace(text) ? "Revit warning" : text.Trim();
            transaction = string.IsNullOrWhiteSpace(transaction) ? "(unnamed)" : transaction.Trim();
            ByWarning[text] = (ByWarning.TryGetValue(text, out int w) ? w : 0) + 1;
            ByTransaction[transaction] = (ByTransaction.TryGetValue(transaction, out int t) ? t : 0) + 1;
            foreach (long id in ids ?? new long[0])
                if (_ids.Add(id) && ElementIds.Count < CommandReports.MaxNames) ElementIds.Add(id);
        }
    }

    /// <summary>The Doctor's resolutions, gathered per project until they are taken: a busy minute of drafting is one row,
    /// not one per transaction, so the Doctor stays inside the report budget (20 per user a minute). Thread-safe: the API
    /// thread adds, the flush task takes.
    /// ponytail: a window still open when Revit closes is lost — the Doctor's row is missing, never wrong.</summary>
    public sealed class DoctorBuffer
    {
        public const int WindowSeconds = 60;
        private readonly object _gate = new object();
        private readonly Dictionary<string, DoctorTally> _open = new Dictionary<string, DoctorTally>(StringComparer.Ordinal);

        /// <summary>Count one resolution. True when it opens the project's window: the caller schedules one flush,
        /// <see cref="WindowSeconds"/> from now.</summary>
        public bool Add(string projectKey, string text, string transaction, IEnumerable<long> ids)
        {
            lock (_gate)
            {
                bool opens = !_open.TryGetValue(projectKey, out var tally);
                if (opens) _open[projectKey] = tally = new DoctorTally();
                tally.Add(text, transaction, ids);
                return opens;
            }
        }

        /// <summary>The project's window, closed; null when there is none.</summary>
        public DoctorTally Take(string projectKey)
        {
            lock (_gate)
            {
                if (!_open.TryGetValue(projectKey, out var tally)) return null;
                _open.Remove(projectKey);
                return tally;
            }
        }
    }
}
