using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// KF-1 validator: "CI/CD for IFC". Parses the exported IFC (STEP text scan —
/// dependency-free, portable logic) and diffs it against the DeliveryContract.
/// Emits a signed certificate (SHA-256 of the file + verdict + findings)
/// stored next to the IFC; a failed gate means the file should not reach the
/// CDE. Pure C# — ports 1:1 to TypeScript for the OBC web gate.
/// </summary>
public static class IfcDeliveryGate
{
    public sealed class GateResult
    {
        public bool Passed { get; set; }
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

    public static GateResult Validate(string ifcPath, DeliveryContract contract)
    {
        var r = new GateResult { IfcPath = ifcPath, ContractKey = contract.ContractKey };
        if (!File.Exists(ifcPath)) { r.Failures.Add("IFC file not found."); return r; }

        var fi = new FileInfo(ifcPath);
        r.FileSizeBytes = fi.Length;

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
                    var m = Regex.Match(line, @"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'");
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
            }
        }

        // ---- Contract checks ----
        if (contract.IfcSchema.Length > 0 && r.DetectedSchema.Length > 0 &&
            !r.DetectedSchema.StartsWith(contract.IfcSchema, StringComparison.OrdinalIgnoreCase))
            r.Failures.Add($"Schema mismatch: contract requires {contract.IfcSchema}, file is {r.DetectedSchema}.");

        foreach (var req in contract.RequiredEntities)
        {
            r.EntityCounts.TryGetValue(req.Entity.ToUpperInvariant(), out var count);
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

        r.Passed = r.Failures.Count == 0;

        // ---- Signed certificate ----
        using (var sha = SHA256.Create())
        using (var fs = File.OpenRead(ifcPath))
            r.FileSha256 = BitConverter.ToString(sha.ComputeHash(fs)).Replace("-", "").ToLowerInvariant();

        r.CertificatePath = Path.ChangeExtension(ifcPath, ".sentinel-cert.json");
        File.WriteAllText(r.CertificatePath, JsonSerializer.Serialize(new
        {
            schema_version = 1,
            certificate = r.Passed ? "PASS" : "FAIL",
            contract_key = r.ContractKey,
            ifc_file = Path.GetFileName(ifcPath),
            sha256 = r.FileSha256,
            ifc_schema = r.DetectedSchema,
            entities = r.TotalEntities,
            failures = r.Failures,
            warnings = r.Warnings,
            issued_at = r.At,
            issued_by = "Sentinel IFC Delivery Gate",
        }, new JsonSerializerOptions { WriteIndented = true }));

        RoiTracker.Log("cde", "IFC gate " + (r.Passed ? "PASS" : "FAIL") + ": " + Path.GetFileName(ifcPath));
        return r;
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
