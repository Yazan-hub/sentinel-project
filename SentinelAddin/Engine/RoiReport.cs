using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using Sentinel.Coordination; // ResolvedArtefact

namespace Sentinel.Engine;

/// <summary>
/// What the project's ledger counted (cohesion phase 5c, spec Decision 9): delivery gate runs, naming renames and
/// family heals, read from the rows the bridge returned — never a machine file, never a count the ledger does not
/// hold. Pure: no Revit, no HTTP; tools/roi-check pins it.
/// </summary>
public sealed class RoiCounts
{
    /// <summary>delivery_gate rows whose new_value.passed is true or false. Null (not checked) is not a run.</summary>
    public int GateRuns;
    /// <summary>The sum of naming rows' new_value.rows.length (one row per Naming Manager batch).</summary>
    public int Renames;
    /// <summary>The sum of family_heal rows' new_value.healed_total.</summary>
    public int Heals;
    /// <summary>Every row read, counted or not.</summary>
    public int RowsRead;
    /// <summary>True when the bridge holds more rows of a kind than were read (the newest were).</summary>
    public bool Truncated;

    public static RoiCounts From(IEnumerable<JsonElement> deliveryGateRows, IEnumerable<JsonElement> namingRows,
                                 IEnumerable<JsonElement> familyHealRows, bool truncated)
    {
        var c = new RoiCounts { Truncated = truncated };
        foreach (var r in deliveryGateRows)
        {
            c.RowsRead++;
            var passed = Value(r, "passed");
            if (passed.ValueKind == JsonValueKind.True || passed.ValueKind == JsonValueKind.False) c.GateRuns++;
        }
        foreach (var r in namingRows)
        {
            c.RowsRead++;
            var rows = Value(r, "rows");
            if (rows.ValueKind == JsonValueKind.Array) c.Renames += rows.GetArrayLength();
        }
        foreach (var r in familyHealRows)
        {
            c.RowsRead++;
            var healed = Value(r, "healed_total");
            if (healed.ValueKind == JsonValueKind.Number && healed.TryGetInt32(out var n) && n > 0) c.Heals += n;
        }
        return c;
    }

    // new_value.<name> of one audit row; Undefined when the row has no such field.
    private static JsonElement Value(JsonElement row, string name) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty("new_value", out var v) && v.ValueKind == JsonValueKind.Object
            && v.TryGetProperty(name, out var f) ? f : default;
}

/// <summary>
/// The counts priced by the project's roi@n (else its office's): minutes per intervention kind × count / 60 × the
/// hourly rate. Null — no money at all — unless the artefact is installed (bridge or cached copy) and its body is
/// {currency, hourly_rate, minutes: {delivery_gate?, naming?, family_heal?}}. <see cref="Label"/> is the artefact's
/// label as every judge prints it: "roi@1 · office · 3f07a1b2c3d4…", + " (cached HH:mm)" when the bridge did not confirm it.
/// </summary>
public sealed class RoiMoney
{
    public string Currency = "";
    public double HourlyRate;
    /// <summary>Minutes per intervention, null when the body sets none for that kind (then it is not priced).</summary>
    public double? GateMinutes, NamingMinutes, HealMinutes;
    public double Gate, Naming, Heal, Total;
    public string Label = "";

    public static RoiMoney? From(RoiCounts counts, ResolvedArtefact roi)
    {
        if (roi.Origin == "none" || string.IsNullOrWhiteSpace(roi.BodyJson)) return null;
        try
        {
            using var d = JsonDocument.Parse(roi.BodyJson!);
            var b = d.RootElement;
            if (b.ValueKind != JsonValueKind.Object) return null;
            if (!b.TryGetProperty("currency", out var cur) || cur.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(cur.GetString())) return null;
            if (!b.TryGetProperty("hourly_rate", out var rate) || rate.ValueKind != JsonValueKind.Number || !rate.TryGetDouble(out var r) || !(r > 0) || double.IsInfinity(r)) return null;
            if (!b.TryGetProperty("minutes", out var mins) || mins.ValueKind != JsonValueKind.Object) return null;
            double? Min(string kind)
            {
                if (!mins.TryGetProperty(kind, out var m)) return null;
                return m.ValueKind == JsonValueKind.Number && m.TryGetDouble(out var v) && v >= 0 && !double.IsInfinity(v) ? v : throw new FormatException(kind);
            }
            var money = new RoiMoney
            {
                Currency = cur.GetString()!.Trim(), HourlyRate = r, Label = roi.Label,
                GateMinutes = Min("delivery_gate"), NamingMinutes = Min("naming"), HealMinutes = Min("family_heal"),
            };
            money.Gate = Amount(money.GateMinutes, counts.GateRuns, r);
            money.Naming = Amount(money.NamingMinutes, counts.Renames, r);
            money.Heal = Amount(money.HealMinutes, counts.Heals, r);
            money.Total = money.Gate + money.Naming + money.Heal;
            return money;
        }
        catch (Exception) { return null; } // not JSON, or a minutes value that is not a number ≥ 0: no money, the line says so
    }

    private static double Amount(double? minutes, int count, double rate) => minutes is null ? 0 : minutes.Value * count / 60.0 * rate;
}

/// <summary>The words the ROI dashboard prints. Every number is a ledger count or that count priced by a named roi@n;
/// what writes no ledger row is listed as not counted.</summary>
public static class RoiLines
{
    public const string NotCounted =
        "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";

    /// <summary>Exactly six lines: the header (rows read, and whether the ledger holds more), the three counts (each
    /// priced when there is money and the roi sets minutes for it), the money line and <see cref="NotCounted"/>.</summary>
    public static string[] Lines(string key, RoiCounts c, RoiMoney? m, ResolvedArtefact roi) => new[]
    {
        "ROI · " + key + " · counted from the ledger (" + c.RowsRead + " rows read" + (c.Truncated ? ", the newest only — the ledger holds more" : "") + ")",
        "Delivery gate runs: " + c.GateRuns + Priced(m, m?.GateMinutes, m?.Gate),
        "Naming renames: " + c.Renames + Priced(m, m?.NamingMinutes, m?.Naming),
        "Family heals: " + c.Heals + Priced(m, m?.HealMinutes, m?.Heal),
        m is null
            ? (roi.Origin == "none"
                ? "Money: not shown — roi: " + roi.Label
                : "Money: not shown — " + roi.Label + " did not parse: the body is not {currency, hourly_rate, minutes}")
            : "Money: " + F2(m.Total) + " " + m.Currency + " at " + Num(m.HourlyRate) + " " + m.Currency + "/h · " + m.Label,
        NotCounted,
    };

    /// <summary>An unbound document: nothing is read.</summary>
    public static string[] NotBound() => new[]
    {
        "ROI · not bound — Sentinel ▸ Project Setup",
        "Nothing was read: this document has no web project, so it has no ledger to count.",
    };

    /// <summary>The bridge could not be read: nothing is counted (a failed read is never "0").</summary>
    public static string[] Unavailable(string key, string failure) => new[]
    {
        "ROI · " + key + " · not counted — the ledger could not be read (" + failure + ")",
    };

    private static string Priced(RoiMoney? m, double? minutes, double? amount) =>
        m is null ? ""
        : minutes is null ? " · not priced — the roi sets no minutes for it"
        : " · " + Num(minutes.Value) + " min each · " + F2(amount!.Value) + " " + m.Currency;

    private static string F2(double v) => v.ToString("F2", CultureInfo.InvariantCulture);
    private static string Num(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
