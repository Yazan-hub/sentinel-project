using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Sentinel.Coordination; // ResolvedArtefact

namespace Sentinel.Engine;

/// <summary>What the gate concluded. NotChecked = no contract to judge by: never a pass, never a fail.</summary>
public enum GateOutcome { Pass, Fail, NotChecked }

/// <summary>
/// KF-1 validator: "CI/CD for IFC". Parses the exported IFC (STEP text scan —
/// dependency-free, portable logic) and diffs it against the project's contract@n.
/// Emits a signed certificate (SHA-256 of the file + verdict + findings + the
/// contract's kind@n · source · sha) stored next to the IFC; a failed gate means
/// the file should not reach the CDE, and with no contract the certificate says
/// NOT_CHECKED. Pure C# — the Node port is WebApp/bridge/delivery-gate.mjs, and
/// tools/gate-check runs the shared contract-parity fixture that its test runs.
/// </summary>
public static class IfcDeliveryGate
{
    public sealed class GateResult
    {
        /// Fail until judged: a result nobody judged is never a pass.
        public GateOutcome Outcome { get; set; } = GateOutcome.Fail;
        public bool Passed => Outcome == GateOutcome.Pass;
        /// What judged, as every surface prints it: "contract@1 · office · 0123456789ab…", or
        /// "none — not installed for &lt;key&gt; or its office".
        public string ContractLabel { get; set; } = string.Empty;
        public string? ContractRef { get; set; }
        public string? ContractSource { get; set; }
        public string? ContractSha256 { get; set; }
        /// Why nothing was judged (the none label); set only when Outcome is NotChecked.
        public string? NotCheckedReason { get; set; }
        public string IfcPath { get; set; } = string.Empty;
        public string FileSha256 { get; set; } = string.Empty;
        public string ContractKey { get; set; } = string.Empty;
        public string DetectedSchema { get; set; } = string.Empty;
        public long FileSizeBytes { get; set; }
        public int TotalEntities { get; set; }
        public List<string> Failures { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();
        public Dictionary<string, int> EntityCounts { get; } = new Dictionary<string, int>();
        public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
        public string CertificatePath { get; set; } = string.Empty;
    }

    private static readonly Regex EntityRx = new(
        @"^#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex SchemaRx = new(@"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'", RegexOptions.CultureInvariant);

    /// <summary>Judge <paramref name="ifcPath"/> by <paramref name="contract"/>, naming <paramref name="source"/> (the
    /// pair DeliveryContract.Load returns). With no contract the outcome is NotChecked: the file's size, sha and schema
    /// are recorded and a NOT_CHECKED certificate is written, but no entity is read and nothing passes.</summary>
    public static GateResult Validate(string ifcPath, DeliveryContract? contract, ResolvedArtefact source)
    {
        var r = new GateResult
        {
            IfcPath = ifcPath, ContractKey = contract?.ContractKey ?? string.Empty, ContractLabel = source.Label,
            ContractRef = source.Ref, ContractSource = source.Source, ContractSha256 = source.Sha256,
        };
        if (!File.Exists(ifcPath)) { r.Failures.Add("IFC file not found."); return r; }

        var fi = new FileInfo(ifcPath);
        r.FileSizeBytes = fi.Length;

        if (contract is null)
        {
            r.Outcome = GateOutcome.NotChecked;
            r.NotCheckedReason = source.Label;
            r.DetectedSchema = ReadSchema(ifcPath);
            return Seal(r);
        }

        var psets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var props = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        bool sawGeoref = false;

        // Single streaming pass — handles multi-hundred-MB deliverables.
        using (var reader = new StreamReader(ifcPath, Encoding.UTF8, true, 1 << 16))
        {
            string? line;
            while ((line = reader.ReadLine()) is not null)
            {
                if (r.DetectedSchema.Length == 0 && line.Contains("FILE_SCHEMA"))
                {
                    var m = SchemaRx.Match(line);
                    if (m.Success) r.DetectedSchema = m.Groups[1].Value.ToUpperInvariant();
                }

                var em = EntityRx.Match(line);
                if (!em.Success) continue;
                var entity = em.Groups[1].Value;
                r.TotalEntities++;
                r.EntityCounts.TryGetValue(entity, out var n);
                r.EntityCounts[entity] = n + 1;

                if (entity == "IFCPROPERTYSET")
                {
                    var nm = Regex.Match(line, @"IFCPROPERTYSET\s*\(\s*'[^']*'\s*,\s*#?\d*\s*,?\s*'([^']+)'");
                    // Standard form: IFCPROPERTYSET('guid',#owner,'Name',...)
                    var nm2 = Regex.Match(line, @"IFCPROPERTYSET\s*\([^,]+,[^,]+,\s*'([^']+)'");
                    if (nm2.Success) psets.Add(nm2.Groups[1].Value);
                    else if (nm.Success) psets.Add(nm.Groups[1].Value);
                }
                else if (entity == "IFCPROPERTYSINGLEVALUE")
                {
                    var pm = Regex.Match(line, @"IFCPROPERTYSINGLEVALUE\s*\(\s*'([^']+)'");
                    if (pm.Success) props.Add(pm.Groups[1].Value);
                }
                else if (entity == "IFCSITE")
                {
                    // RefLatitude present = 6th arg onward not $  (cheap check:
                    // a parenthesised latitude tuple appears in the line)
                    if (Regex.IsMatch(line, @"\(\s*-?\d+\s*,\s*-?\d+\s*,\s*-?\d+")) sawGeoref = true;
                }
                // IFC4 georeferencing: a map conversion is a georeference even when IFCSITE carries no lat/long
                // (the Node gate's rule, delivery-gate.mjs: the same contract gives the same verdict in both).
                else if (entity == "IFCMAPCONVERSION") sawGeoref = true;
            }
        }

        // ---- Contract checks ----
        if (contract.IfcSchema.Length > 0 && r.DetectedSchema.Length > 0 &&
            !r.DetectedSchema.StartsWith(contract.IfcSchema, StringComparison.OrdinalIgnoreCase))
            r.Failures.Add($"Schema mismatch: contract requires {contract.IfcSchema}, file is {r.DetectedSchema}.");

        foreach (var req in contract.RequiredEntities)
        {
            int count = CountWithSubtypes(r.EntityCounts, req.Entity);
            if (count < req.MinCount)
                r.Failures.Add($"{req.Entity}: {count} found, contract requires ≥ {req.MinCount}.");
        }

        int buildingElements = r.EntityCounts
            .Where(kv => kv.Key.StartsWith("IFC") && IsBuildingElement(kv.Key))
            .Sum(kv => kv.Value);
        foreach (var lim in contract.ForbiddenEntities)
        {
            r.EntityCounts.TryGetValue(lim.Entity.ToUpperInvariant(), out var count);
            if (count > lim.MaxCount)
                r.Failures.Add($"{lim.Entity}: {count} exceeds max {lim.MaxCount}.");
            else if (buildingElements > 0 && (double)count / buildingElements > lim.MaxRatio)
                r.Failures.Add($"{lim.Entity}: {count}/{buildingElements} building elements " +
                               $"({100.0 * count / buildingElements:F0}%) exceeds {lim.MaxRatio:P0} — semantics are being lost to proxies.");
        }

        foreach (var pset in contract.RequiredPsets)
            if (!psets.Contains(pset))
                r.Failures.Add($"Required property set '{pset}' not found in the file.");

        foreach (var prop in contract.RequiredProperties)
            if (!props.Contains(prop))
                r.Failures.Add($"Required property '{prop}' not found in the file.");

        if (contract.RequireGeoreference && !sawGeoref)
            r.Warnings.Add("No georeference detected on IFCSITE (RefLatitude/RefLongitude).");

        if (r.TotalEntities == 0) r.Failures.Add("No IFC entities parsed — file may be corrupt or IFCZIP (not yet supported).");

        r.Outcome = r.Failures.Count == 0 ? GateOutcome.Pass : GateOutcome.Fail;
        return Seal(r);
    }

    // ---- Signed certificate: the file's sha, the verdict and what judged it, for every outcome ----
    private static GateResult Seal(GateResult r)
    {
        using (var sha = SHA256.Create())
        using (var fs = File.OpenRead(r.IfcPath))
            r.FileSha256 = BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();

        bool judged = r.Outcome != GateOutcome.NotChecked;
        r.CertificatePath = Path.ChangeExtension(r.IfcPath, ".sentinel-cert.json");
        File.WriteAllText(r.CertificatePath, JsonSerializer.Serialize(new
        {
            schema_version = 2,
            certificate = r.Outcome switch { GateOutcome.Pass => "PASS", GateOutcome.Fail => "FAIL", _ => "NOT_CHECKED" },
            contract_key = judged ? r.ContractKey : null,
            contract_ref = r.ContractRef,
            contract_source = r.ContractSource,
            contract_sha256 = r.ContractSha256,
            contract_label = r.ContractLabel,
            not_checked_reason = r.NotCheckedReason,
            ifc_file = Path.GetFileName(r.IfcPath),
            sha256 = r.FileSha256,
            ifc_schema = r.DetectedSchema,
            entities = judged ? r.TotalEntities : (int?)null, // not counted is not "0 entities"
            failures = r.Failures,
            warnings = r.Warnings,
            issued_at = r.At,
            issued_by = "Sentinel IFC Delivery Gate",
        }, new JsonSerializerOptions { WriteIndented = true }));

        // ROI counts interventions; a gate that judged nothing saved nobody any time.
        if (judged) RoiTracker.Log("cde", "IFC gate " + (r.Passed ? "PASS" : "FAIL") + ": " + Path.GetFileName(r.IfcPath));
        return r;
    }

    // The header's FILE_SCHEMA, reading no further than DATA; (a not-checked file's entities are never read).
    private static string ReadSchema(string ifcPath)
    {
        using var reader = new StreamReader(ifcPath, Encoding.UTF8, true, 1 << 16);
        string? line;
        while ((line = reader.ReadLine()) is not null && !line.StartsWith("DATA;"))
        {
            var m = SchemaRx.Match(line);
            if (m.Success) return m.Groups[1].Value.ToUpperInvariant();
        }
        return string.Empty;
    }

    /// <summary>IFC subtypes that satisfy a contract's required entity. Revit's IFC2x3 export writes every
    /// basic wall as IFCWALLSTANDARDCASE, so a contract asking for IFCWALL saw 0 walls in a 196-wall model
    /// (found live in the simulation room). The subtype IS the supertype for a "≥ N" requirement.</summary>
    private static readonly Dictionary<string, string[]> Subtypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["IFCWALL"]   = new[] { "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE" },
        ["IFCSLAB"]   = new[] { "IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE" },
        ["IFCBEAM"]   = new[] { "IFCBEAMSTANDARDCASE" },
        ["IFCCOLUMN"] = new[] { "IFCCOLUMNSTANDARDCASE" },
        ["IFCDOOR"]   = new[] { "IFCDOORSTANDARDCASE" },
        ["IFCWINDOW"] = new[] { "IFCWINDOWSTANDARDCASE" },
        ["IFCMEMBER"] = new[] { "IFCMEMBERSTANDARDCASE" },
        ["IFCPLATE"]  = new[] { "IFCPLATESTANDARDCASE" },
    };

    internal static int CountWithSubtypes(IReadOnlyDictionary<string, int> counts, string entity)
    {
        string key = entity.ToUpperInvariant();
        counts.TryGetValue(key, out int n);
        if (Subtypes.TryGetValue(key, out var subs))
            foreach (var sub in subs) if (counts.TryGetValue(sub, out int m)) n += m;
        return n;
    }

    private static bool IsBuildingElement(string entity) => entity switch
    {
        "IFCWALL" or "IFCWALLSTANDARDCASE" or "IFCSLAB" or "IFCDOOR" or "IFCWINDOW"
        or "IFCBEAM" or "IFCCOLUMN" or "IFCROOF" or "IFCSTAIR" or "IFCSTAIRFLIGHT"
        or "IFCRAILING" or "IFCCURTAINWALL" or "IFCPLATE" or "IFCMEMBER"
        or "IFCCOVERING" or "IFCFOOTING" or "IFCBUILDINGELEMENTPROXY" => true,
        _ => false,
    };
}
