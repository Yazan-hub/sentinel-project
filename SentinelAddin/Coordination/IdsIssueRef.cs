using System;
using System.Text.RegularExpressions;

namespace Sentinel.Coordination;

/// <summary>
/// The inverse of the bridge's referee-raised topic title — <c>IDS: &lt;spec&gt; — &lt;requirement&gt; (N failing)</c>,
/// built by <c>groupFailuresForBcf</c> where requirement is <c>Pset.Prop</c> or <c>@Attr</c>. Anything that does
/// not parse is not a referee issue and gets no Fix button. Revit-free.
/// </summary>
public sealed class IdsIssueRef
{
    public string Spec = "";
    public string Requirement = "";
    public int Failing;

    public bool IsAttribute => Requirement.StartsWith("@", StringComparison.Ordinal);
    public string Pset => IsAttribute ? "" : Requirement.Substring(0, Requirement.LastIndexOf('.'));
    public string Prop => IsAttribute ? Requirement.Substring(1) : Requirement.Substring(Requirement.LastIndexOf('.') + 1);

    // Lazy spec, then the em-dash the bridge writes, then a space-free requirement, then the count.
    private static readonly Regex Rx = new(@"^IDS:\s*(.+?)\s*—\s*(\S+)\s*\((\d+) failing\)\s*$", RegexOptions.CultureInvariant);

    public static IdsIssueRef? TryParse(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var m = Rx.Match(title!.Trim());
        if (!m.Success) return null;
        var req = m.Groups[2].Value;
        var wellFormed = req.StartsWith("@", StringComparison.Ordinal)
            ? req.Length > 1
            : req.IndexOf('.') > 0 && req.LastIndexOf('.') < req.Length - 1;
        if (!wellFormed) return null;
        return new IdsIssueRef { Spec = m.Groups[1].Value, Requirement = req, Failing = int.Parse(m.Groups[3].Value) };
    }

    /// The bridge's exact format — for the round-trip check.
    public static string TitleOf(string spec, string requirement, int failing) => $"IDS: {spec} — {requirement} ({failing} failing)";
}
