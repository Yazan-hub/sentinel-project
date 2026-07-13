using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;

namespace Sentinel.Updaters;

/// <summary>
/// 'Revit Doctor': global failure interception via the FailuresProcessing
/// application event (covers every transaction, no per-transaction
/// IFailuresPreprocessor registration needed) plus an IFailuresPreprocessor
/// implementation for Sentinel's own transactions. Suppresses benign,
/// auto-resolvable native warnings and logs each intervention to the panel
/// Doctor log + ROI tracker.
/// </summary>
public sealed class FailureInterceptor : IFailuresPreprocessor
{
    /// Warning ids Sentinel is allowed to auto-resolve. Conservative set:
    /// duplicate marks (delete warning only — never renumber silently) and
    /// off-axis lines (Revit's own resolution nudges to axis).
    private static readonly HashSet<string> AutoResolvable = new HashSet<string>
    {
        BuiltInFailures.GeneralFailures.DuplicateValue.Guid.ToString(),          // duplicate Mark
        BuiltInFailures.InaccurateFailures.InaccurateLine.Guid.ToString(),       // slightly off axis
        BuiltInFailures.OverlapFailures.DuplicateInstances.Guid.ToString(),      // identical instances
    };

    public static void Register(Autodesk.Revit.ApplicationServices.ControlledApplication app) =>
        app.FailuresProcessing += OnFailuresProcessing;

    public static void Unregister(Autodesk.Revit.ApplicationServices.ControlledApplication app) =>
        app.FailuresProcessing -= OnFailuresProcessing;

    private static void OnFailuresProcessing(object? sender, FailuresProcessingEventArgs e)
    {
        var result = Process(e.GetFailuresAccessor());
        if (result != FailureProcessingResult.Continue)
            e.SetProcessingResult(result);
    }

    /// IFailuresPreprocessor entry (Sentinel-owned transactions).
    public FailureProcessingResult PreprocessFailures(FailuresAccessor accessor) => Process(accessor);

    private static FailureProcessingResult Process(FailuresAccessor accessor)
    {
        bool resolvedAny = false;
        foreach (var failure in accessor.GetFailureMessages())
        {
            if (failure.GetSeverity() != FailureSeverity.Warning) continue; // never touch errors
            var id = failure.GetFailureDefinitionId()?.Guid.ToString();
            if (id is null || !AutoResolvable.Contains(id)) continue;

            string description = failure.GetDescriptionText() ?? "Native warning";
            try
            {
                if (failure.HasResolutions())
                {
                    accessor.ResolveFailure(failure);          // Revit's own fix (axis nudge etc.)
                    resolvedAny = true;
                    Log("Resolved: " + Trim(description));
                }
                else
                {
                    accessor.DeleteWarning(failure);           // benign: dismiss (duplicate mark)
                    Log("Suppressed: " + Trim(description));
                }
                Engine.RoiTracker.Log("doctor", Trim(description));
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException)
            {
                // Resolution unavailable in this context — leave for the user.
            }
        }
        return resolvedAny
            ? FailureProcessingResult.ProceedWithCommit       // re-run with fixes applied
            : FailureProcessingResult.Continue;
    }

    private static string Trim(string s) => s.Length > 120 ? s.Substring(0, 117) + "..." : s;

    private static void Log(string line) => App.PanelVm?.LogDoctor(line);
}
