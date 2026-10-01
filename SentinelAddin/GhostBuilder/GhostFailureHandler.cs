#nullable disable
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Failure preprocessor for the one Ghost Builder transaction (DWG and Photo Massing; never registered globally). A bulk
    /// build from dirty CAD raises creation failures at commit ("Can't make Wall", "Can't keep elements joined"); left to Revit
    /// they block the user behind modal dialogs. MA-1a step 1 (GHB-5): the rule is GhostFailurePolicy's — Revit's resolution
    /// only for a failure that names nothing but this build's elements; otherwise only this build's elements among the ids it
    /// names (failing and additional, A5) are deleted; a failure naming none of them rolls the build back. A user's element is
    /// never deleted, resolved or unjoined. Warnings are counted and left to Revit, never erased ([BP] P1-3). Everything it did
    /// is kept for the build summary.
    /// </summary>
    public sealed class GhostFailureHandler : IFailuresPreprocessor
    {
        /// <summary>The ids of the elements this build created — filled by the orchestrator after placement and before Commit
        /// (the preprocessor runs at Commit).</summary>
        public readonly HashSet<long> Ours = new HashSet<long>();
        /// <summary>Each of ours an error named, with Revit's description of it (the last one wins).</summary>
        public readonly Dictionary<long, string> Why = new Dictionary<long, string>();
        /// <summary>Every warning seen, on every pass — (definition + named ids, text, named ids) — left in the model, never
        /// erased. The orchestrator counts them after the commit with GhostFailurePolicy.CountWarnings.</summary>
        public readonly List<(string Key, string Text, IReadOnlyCollection<long> Ids)> SeenWarnings =
            new List<(string Key, string Text, IReadOnlyCollection<long> Ids)>();
        /// <summary>Set when this handler rolled the build back: why, in words.</summary>
        public string RolledBack { get; private set; }

        private readonly HashSet<string> _resolved = new HashSet<string>(); // failures already given Revit's resolution once
        private int _passes;

        public FailureProcessingResult PreprocessFailures(FailuresAccessor accessor)
        {
            try
            {
                if (++_passes > GhostFailurePolicy.MaxPasses)
                    return RollBack($"Revit still raised failures after {GhostFailurePolicy.MaxPasses} passes");

                var delete = new HashSet<long>();
                bool resolved = false;
                foreach (FailureMessageAccessor f in accessor.GetFailureMessages())
                {
                    string text = f.GetDescriptionText() ?? "Revit failure";
                    var severity = Sev(f.GetSeverity());
                    var failing = Ids(f.GetFailingElementIds());
                    var additional = Ids(f.GetAdditionalElementIds());
                    string key = f.GetFailureDefinitionId().Guid + "|" + string.Join(",", failing.OrderBy(i => i));
                    var act = GhostFailurePolicy.Decide(severity, f.HasResolutions(), failing, additional, Ours, _resolved.Contains(key));
                    if (act == GhostFailurePolicy.Act.Count)
                    {
                        SeenWarnings.Add((key, text, failing)); // counted after the commit; Revit keeps the warning
                        continue;
                    }
                    var named = failing.Concat(additional).Distinct().ToList();
                    if (act == GhostFailurePolicy.Act.RollBack)
                        return RollBack(GhostFailurePolicy.RollBackReason(text, severity, named.Where(i => !Ours.Contains(i)).ToList()));

                    foreach (long id in named.Where(Ours.Contains)) Why[id] = text;
                    if (act == GhostFailurePolicy.Act.Resolve)
                    {
                        _resolved.Add(key);
                        accessor.ResolveFailure(f);
                        resolved = true;
                    }
                    else delete.UnionWith(GhostFailurePolicy.ToDelete(failing, Ours, additional));
                }

                if (delete.Count > 0) accessor.DeleteElements(delete.Select(i => i.ToElementId()).ToList());
                // ProceedWithCommit re-runs regeneration with the fixes applied and calls this again for what is left.
                return resolved || delete.Count > 0 ? FailureProcessingResult.ProceedWithCommit : FailureProcessingResult.Continue;
            }
            catch (Exception ex)
            {
                // A resolution or deletion Revit refuses: never push the build through half-handled — roll it back, say why.
                return RollBack($"Sentinel could not handle a Revit failure ({ex.GetType().Name}: {ex.Message})");
            }
        }

        private FailureProcessingResult RollBack(string why)
        {
            RolledBack ??= why;
            return FailureProcessingResult.ProceedWithRollBack;
        }

        private static GhostFailurePolicy.Severity Sev(FailureSeverity s) =>
            s == FailureSeverity.Error ? GhostFailurePolicy.Severity.Error
            : s == FailureSeverity.DocumentCorruption ? GhostFailurePolicy.Severity.Corruption
            : GhostFailurePolicy.Severity.Warning;

        private static List<long> Ids(ICollection<ElementId> ids) =>
            ids == null ? new List<long>() : ids.Select(i => i.IdValue()).ToList();
    }
}
