namespace Sentinel.Engine;

/// The harness's RoiTracker: IfcDeliveryGate.Validate logs every judged gate as an intervention, and the real
/// tracker appends to %AppData%\Sentinel\roi.json — a harness run would add "time saved" on this machine.
/// This one records the lines so the harness can check which outcomes log.
public static class RoiTracker
{
    public static readonly List<string> Logged = new();
    public static void Log(string kind, string detail) => Logged.Add(kind + " " + detail);
}
