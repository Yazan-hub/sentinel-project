using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Sentinel.Commands;

/// <summary>
/// Ribbon toggle for push-on-save. Flips <see cref="Sentinel.Engine.AutoPublish.Enabled"/> and reports the
/// new state (plus the last sync result). Read-only — it changes no model data, just the auto-publish switch.
/// </summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class ToggleAutoPublishCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        Sentinel.Engine.AutoPublish.Enabled = !Sentinel.Engine.AutoPublish.Enabled;
        TaskDialog.Show("Sentinel — Auto Publish",
            Sentinel.Engine.AutoPublish.Enabled
                ? "Auto-publish is ON.\n\nEvery save and sync-to-central now re-exports the model to the Sentinel " +
                  "outbox; the Bridge uploads it to That Open Platform, so the web viewer stays in sync.\n\n" +
                  "Throttled to at most once every 15s. Turn off here for very large models.\n\n" +
                  "Last: " + Sentinel.Engine.AutoPublish.LastStatus
                : "Auto-publish is OFF.\n\nUse 'Publish to Platform' to push the model manually.\n\n" +
                  "Last: " + Sentinel.Engine.AutoPublish.LastStatus);
        return Result.Succeeded;
    }
}
