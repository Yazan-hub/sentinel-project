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

        // MA-6-6: Photo Massing files a changeset — its changeset_applied row is the build's record, so the massing row is gone.

        /// <summary>Review C4: the views and datums an Annotate row names — the record B31 may leave (one view and one RCP for each
        /// of 100 storeys), beside their true totals.</summary>
        public const int MaxRecord = 200;

        /// <summary>MA-2e: one Annotate run, as read back from the model after its group (review C2, C4) — the views it holds, named
        /// (a view that failed was rolled back alone), on how many levels; the datums pinned, by id, and the read-back line; whether
        /// Revit kept the Undo group (B31: when not, this row is the record); the rows the plan refused (already in the model, or
        /// with a reason), the views no Project Browser parameter routed, and the guideline and the ruleset that planned and named them.</summary>
        public static object Annotate(IReadOnlyList<string> views, int levels, int skippedExisting, int refused, int failed, int unrouted,
                                      int pinnedLevels, int pinnedGrids, int warnings, int storyLevels, IReadOnlyList<long> pinnedIds,
                                      string pinnedNow, bool undoGroupKept, string guideline, string ruleset, string actor, AnnotateMore more = null)
        {
            var value = new Dictionary<string, object>
            {
                ["views_created"] = views.Count, ["views"] = views.Take(MaxRecord).ToArray(), ["skipped_existing"] = skippedExisting, ["refused"] = refused,
                ["failed"] = failed, ["unrouted"] = unrouted, ["pinned_levels"] = pinnedLevels, ["pinned_grids"] = pinnedGrids,
                ["pinned_ids"] = pinnedIds.Take(MaxRecord).ToArray(), ["pinned_now"] = pinnedNow, ["undo_group_kept"] = undoGroupKept,
                ["warnings"] = warnings, ["story_levels"] = storyLevels, ["guideline"] = guideline, ["ruleset"] = ruleset, ["source"] = "revit",
            };
            string action = $"Annotate created {views.Count} view(s) and pinned {pinnedLevels + pinnedGrids} datum(s) across {levels} level(s)";
            if (more != null && more.FileName != null)
            {
                // MA-8-11: what Revit holds after the group (the caller reads it back), never the workstation path (V2).
                value["template_file"] = new
                {
                    name = more.FileName, title = more.Title, sha256 = more.Sha256, format = more.Format,
                    opened = more.Opened ? "background" : "already open", seconds = Math.Round(more.Seconds, 1),
                    note = more.Opened ? null : "copied from the open document; sha256 is the file on disk and may not match unsaved edits",
                };
                value["templates_copied"] = more.Copied.Take(MaxRecord).ToArray();
                value["templates_not_copied"] = more.NotCopied.Take(MaxRecord).Select(n => new { name = n.Name, why = n.Why }).ToArray();
                if (more.Copied.Count > 0) action += $"; copied {more.Copied.Count} view template(s) from {more.FileName}";
            }
            if (more != null && more.Level != null)
            {
                // MA-8-12 (ANV-4, ANV-5, MH-VW-01): the sheets and tags the model holds after the group, for the one level the run chose.
                value["level"] = more.Level;
                value["sheets"] = more.Sheets.Take(MaxRecord).Select(s => new { number = s.Number, name = s.Name, view = s.View, viewport = s.Viewports }).ToArray();
                value["sheets_failed"] = more.SheetsFailed.Take(MaxRecord).Select(s => new { number = s.Number, why = s.Why }).ToArray();
                value["tags"] = more.Tags.Take(MaxRecord).Select(t => new { view = t.View, category = t.Category, tag = t.Tag, placed = t.Placed, skipped = t.Skipped, why = t.Why }).ToArray();
                value["tag_gaps"] = more.TagGaps.Take(MaxRecord).Select(g => new { category = g.Category, why = g.Why }).ToArray();
                if (more.Mh is { } mh)
                    value["mh_vw_01"] = new { level = mh.Level, count = mh.Count, views = mh.Views.ToArray(), wip_excepted = mh.WipExcepted, note = mh.Note };
                action += $"; {more.Sheets.Count} sheet(s) and {more.Tags.Sum(t => t.Placed)} tag(s) on {more.Level}" + (more.Mh is { } mhNow ? $"; MH-VW-01 {mhNow.Count} on {more.Level}" : "");
            }
            return Row("annotate", actor, action, value);
        }

        /// <summary>MA-8-11 (ANV-3): the office template file an Annotate run copied view templates from, and what it did with each name.</summary>
        public sealed class AnnotateMore
        {
            /// <summary>MA-8-12: the level the run made sheets and tags for; null when it chose none (the sheets, tags and MH-VW-01 fields are then left out).</summary>
            public string Level;
            /// <summary>The sheets present after the group, with their viewport count.</summary>
            public IReadOnlyList<(string Number, string Name, string View, int Viewports)> Sheets = new (string, string, string, int)[0];
            public IReadOnlyList<(string Number, string Why)> SheetsFailed = new (string, string)[0];
            /// <summary>Per sheet view and category: the tags the model holds after the group (Placed), those Revit refused (Skipped) and the first reason.</summary>
            public IReadOnlyList<(string View, string Category, string Tag, int Placed, int Skipped, string Why)> Tags = new (string, string, string, int, int, string)[0];
            public IReadOnlyList<(string Category, string Why)> TagGaps = new (string, string)[0];
            /// <summary>MH-VW-01 for the level (SheetPlanner.MhVw01): the count, up to 20 names, the views on a WIP template left out, and the line in words.</summary>
            public (string Level, int Count, IReadOnlyList<string> Views, int WipExcepted, string Note)? Mh;
            /// <summary>MA-8-11: null when no office template file was used.</summary>
            public string FileName, Title, Sha256, Format;
            public bool Opened;
            public double Seconds;
            /// <summary>The templates present in the model after the group that this run ticked and copied (amendment 6).</summary>
            public IReadOnlyList<string> Copied = new string[0];
            public IReadOnlyList<(string Name, string Why)> NotCopied = new (string, string)[0];
        }

        /// <summary>Apply Standard's model half (its ruleset install writes its own artefact row).</summary>
        public static object ApplyStandard(IReadOnlyList<string> created, IReadOnlyList<string> skipped, IReadOnlyList<string> failed, string actor) =>
            Row("apply_standard", actor, $"Apply Standard: {created.Count} created, {skipped.Count} skipped, {failed.Count} failed", new
            {
                created = created.Take(MaxNames).ToArray(), skipped = skipped.Take(MaxNames).ToArray(), failed = failed.Take(MaxNames).ToArray(),
                created_total = created.Count, skipped_total = skipped.Count, failed_total = failed.Count, source = "revit",
            });

        /// <summary>MA-8-8: one read-only MEP type check — per category the counts, and the unmatched groups (type, system, verdict, count,
        /// a few ids) beside their true total. Nothing reads the row; the bridge only stamps the verified actor.</summary>
        public static object MepCheck(Sentinel.Engine.MepReport r, string catalog, string actor) =>
            Row("mep_check", actor, $"mep_check:run · {r.Checked} checked, {r.Matched} matched, {r.TypeNotOffice} type and {r.SystemNotOffice} system not the office's (system judged on {r.SystemJudged})"
                + (r.NotCheckable > 0 ? $", {r.NotCheckable} not checkable" : "") + (r.NoType > 0 ? $", {r.NoType} without a type" : ""), new
            {
                catalog, no_type = r.NoType,
                not_read = "flex ducts and pipes, placeholders, fabrication parts, fittings and accessories",
                categories = r.Categories.Select(c => new
                {
                    category = c.Category, @checked = c.Checked, matched = c.Matched, type_not_office = c.TypeNotOffice,
                    system_not_office = c.SystemNotOffice, no_system = c.NoSystem, not_checkable = c.NotCheckable, system_judged = c.SystemJudged, system_unread = c.SystemUnread, system_note = c.SystemNote,
                }).ToArray(),
                findings = r.Findings.Take(MaxNames).Select(f => new
                {
                    category = f.Category, family = f.Family, type = f.Type, system = f.System, verdict = f.Verdict, count = f.Count, ids = f.Ids.ToArray(),
                }).ToArray(),
                findings_total = r.Findings.Count,
                source = "revit",
            });

        /// <summary>MA-8-7: one Promote run's foreign types - the elements whose type is not the office's, counted by bin, and the top groups (category,
        /// family, type, bin, count, a reason) beside their true total. Sent on every run, the read-only and the refused ones too. Nothing reads it.</summary>
        public static object ForeignTypes(ForeignReport r, string catalog, string actor) =>
            Row("foreign_types", actor, r.NotChecked != null ? $"foreign_types:run · not judged - {r.NotChecked}"
                : $"foreign_types:run · {r.Foreign} element(s) on {r.Types} type(s) not the office's", new
            {
                catalog,
                totals = new { settled = r.NSettled, retype = r.NRetype, gap = r.NGap, directshape = r.NDirectShape },
                rows = r.Rows.Where(x => x.Bin != ForeignReport.Settled).OrderByDescending(x => x.Count).ThenBy(x => x.Category, StringComparer.Ordinal).ThenBy(x => x.Type, StringComparer.Ordinal)
                    .Take(MaxNames).Select(x => new { category = x.Category, family = x.Family, type = x.Type, bin = x.Bin, count = x.Count, why = x.Why }).ToArray(),
                rows_total = r.Rows.Count(x => x.Bin != ForeignReport.Settled),
                not_checked = r.NotChecked,
                source = "revit",
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
