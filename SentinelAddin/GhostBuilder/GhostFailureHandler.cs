using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// Failure preprocessor scoped to the bulk Ghost Builder transaction. Unlike the conservative
    /// global <see cref="Sentinel.Updaters.FailureInterceptor"/> (which never touches errors), a
    /// batch LOD-200 build from dirty CAD inevitably produces creation failures — "Can't make Wall"
    /// and "Can't keep elements joined" — that Revit raises at commit/regeneration as ERROR severity.
    /// Left to the default handler they block the user behind dozens of modal "cannot be ignored"
    /// dialogs, and a single Cancel rolls back the ENTIRE build.
    ///
    /// Here we auto-resolve them: apply Revit's own default resolution (delete the un-makeable
    /// instance / unjoin), or delete the offending elements when there is none, so the commit
    /// completes silently. Scope is deliberately this one transaction — never registered globally.
    /// </summary>
    public sealed class GhostFailureHandler : IFailuresPreprocessor
    {
        public FailureProcessingResult PreprocessFailures(FailuresAccessor accessor)
        {
            bool changed = false;

            foreach (FailureMessageAccessor failure in accessor.GetFailureMessages())
            {
                FailureSeverity severity = failure.GetSeverity();

                if (severity == FailureSeverity.Warning)
                {
                    accessor.DeleteWarning(failure); // benign noise in a bulk gen — dismiss
                    changed = true;
                    continue;
                }

                if (severity != FailureSeverity.Error) continue;

                if (failure.HasResolutions())
                {
                    accessor.ResolveFailure(failure); // default resolution: delete instance / unjoin
                    changed = true;
                }
                else
                {
                    // No offered resolution: delete the failing elements so the commit can proceed
                    // instead of rolling the whole build back.
                    ICollection<ElementId> ids = failure.GetFailingElementIds();
                    if (ids != null && ids.Count > 0)
                    {
                        accessor.DeleteElements(ids.ToList());
                        changed = true;
                    }
                }
            }

            // ProceedWithCommit re-runs regeneration with the fixes applied (and re-invokes this
            // preprocessor if resolving one failure surfaced another).
            return changed ? FailureProcessingResult.ProceedWithCommit : FailureProcessingResult.Continue;
        }
    }
}
