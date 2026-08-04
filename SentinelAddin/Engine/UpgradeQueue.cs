using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Engine;

/// <summary>One src->dest upgrade job and its outcome, filled in by the runner as it processes the queue.</summary>
public sealed class UpgradeJob
{
    [JsonPropertyName("src")] public string Src { get; set; } = "";
    [JsonPropertyName("dest")] public string Dest { get; set; } = "";
    [JsonPropertyName("ok")] public bool? Ok { get; set; }
    [JsonPropertyName("warnings")] public int Warnings { get; set; }
    [JsonPropertyName("ms")] public long Ms { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
}

/// <summary>A batch of upgrade jobs targeting one Revit version, written by the requester and picked
/// up by the per-version Sentinel queue runner (started by that version's Revit instance).</summary>
public sealed class UpgradeQueue
{
    [JsonPropertyName("target")] public string Target { get; set; } = "";
    [JsonPropertyName("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [JsonPropertyName("jobs")] public List<UpgradeJob> Jobs { get; set; } = new();
}

/// <summary>
/// Pure file-based handoff between the requesting Revit session and the target-version runner:
/// %AppData%\Sentinel\upgrade-queue.json (request) and upgrade-results.json (outcome).
/// A queue older than 1h is presumed abandoned/from a prior crash — rather than silently letting
/// a stale batch run against whatever Revit starts next, it's renamed out of the way and refused.
/// </summary>
public static class UpgradeQueueStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private static readonly TimeSpan StaleAfter = TimeSpan.FromHours(1);

    private static string Dir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel");

    public static string QueuePath => Path.Combine(Dir, "upgrade-queue.json");
    public static string ResultsPath => Path.Combine(Dir, "upgrade-results.json");
    private static string StaleQueuePath => Path.Combine(Dir, "upgrade-queue.stale.json");
    private static string BadQueuePath => Path.Combine(Dir, "upgrade-queue.bad.json");

    public static void SaveQueue(UpgradeQueue q)
    {
        Directory.CreateDirectory(Dir);
        File.WriteAllText(QueuePath, JsonSerializer.Serialize(q, JsonOpts));
    }

    /// Returns null when no queue file exists, it targets a different version, or it's stale
    /// (> 1h old — renamed to upgrade-queue.stale.json so a leftover batch can never re-trigger).
    public static UpgradeQueue? LoadQueueFor(string version)
    {
        if (!File.Exists(QueuePath)) return null;
        UpgradeQueue? q;
        try
        {
            q = JsonSerializer.Deserialize<UpgradeQueue>(File.ReadAllText(QueuePath), JsonOpts);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            Console.WriteLine($"Sentinel: corrupt upgrade queue ({ex.Message}) — setting aside, not running.");
            try
            {
                File.Copy(QueuePath, BadQueuePath, overwrite: true);
                File.Delete(QueuePath);
            }
            catch { /* best-effort; corrupt file staying in place still blocks a re-read next time */ }
            return null;
        }
        if (q is null) return null;

        if (DateTimeOffset.Now - q.CreatedAt > StaleAfter)
        {
            Console.WriteLine($"Sentinel: stale upgrade queue (created {q.CreatedAt:u}) — renaming aside, not running.");
            File.Copy(QueuePath, StaleQueuePath, overwrite: true);
            File.Delete(QueuePath);
            return null;
        }

        return q.Target == version ? q : null;
    }

    public static void SaveResults(UpgradeQueue q, bool done)
    {
        Directory.CreateDirectory(Dir);
        var payload = new { target = q.Target, done, jobs = q.Jobs };
        File.WriteAllText(ResultsPath, JsonSerializer.Serialize(payload, JsonOpts));
    }

    public static (bool done, List<UpgradeJob> jobs)? LoadResults()
    {
        if (!File.Exists(ResultsPath)) return null;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(ResultsPath));
            var root = doc.RootElement;
            var done = root.GetProperty("done").GetBoolean();
            var jobs = JsonSerializer.Deserialize<List<UpgradeJob>>(root.GetProperty("jobs").GetRawText(), JsonOpts) ?? new();
            return (done, jobs);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Sentinel: corrupt upgrade results ({ex.Message}) — ignoring.");
            return null;
        }
    }
}
