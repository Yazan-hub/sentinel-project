using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>
/// BIM ROI time-tracker: append-only local log of every automated Sentinel
/// intervention (auto-fix, doctor resolution, CDE intercept, family
/// sanitation, MEP void placement). Persisted at %AppData%\Sentinel\roi.json;
/// Phase 3 syncs it to the backend for cross-project rollups.
/// </summary>
public static class RoiTracker
{
    public sealed class RoiEntry
    {
        [JsonPropertyName("at")] public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
        [JsonPropertyName("kind")] public string Kind { get; set; } = string.Empty; // autofix|doctor|cde|family|mepvoid
        [JsonPropertyName("detail")] public string Detail { get; set; } = string.Empty;
    }

    /// Assumption agreed for the business case: each automated intervention
    /// saves ~5 minutes of coordinator/modeller time.
    public const double MinutesSavedPerFix = 5.0;
    /// Blended hourly rate for the financial view; adjust per office.
    public const double HourlyRateUsd = 35.0;

    private static readonly object Gate = new object();
    private static List<RoiEntry>? _cache;

    public static string LogPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Sentinel", "roi.json");

    public static void Log(string kind, string detail)
    {
        lock (Gate)
        {
            var all = LoadAll();
            all.Add(new RoiEntry { Kind = kind, Detail = detail });
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
                File.WriteAllText(LogPath, JsonSerializer.Serialize(all));
                _cache = all;
            }
            catch (IOException) { /* concurrent Revit sessions: skip one beat */ }
        }
    }

    public static List<RoiEntry> LoadAll()
    {
        if (_cache is not null) return _cache;
        try
        {
            if (File.Exists(LogPath))
                return _cache = JsonSerializer.Deserialize<List<RoiEntry>>(File.ReadAllText(LogPath))
                                ?? new List<RoiEntry>();
        }
        catch (Exception) { }
        return _cache = new List<RoiEntry>();
    }

    public sealed class RoiSummary
    {
        public int TotalInterventions { get; set; }
        public double HoursSaved { get; set; }
        public double ValueUsd { get; set; }
        public Dictionary<string, int> ByKind { get; } = new Dictionary<string, int>();
        public int Last30Days { get; set; }
    }

    public static RoiSummary Summarize()
    {
        var all = LoadAll();
        var s = new RoiSummary { TotalInterventions = all.Count };
        s.HoursSaved = Math.Round(all.Count * MinutesSavedPerFix / 60.0, 1);
        s.ValueUsd = Math.Round(s.HoursSaved * HourlyRateUsd, 0);
        var cutoff = DateTimeOffset.Now.AddDays(-30);
        foreach (var e in all)
        {
            s.ByKind.TryGetValue(e.Kind, out var n);
            s.ByKind[e.Kind] = n + 1;
            if (e.At >= cutoff) s.Last30Days++;
        }
        return s;
    }
}
