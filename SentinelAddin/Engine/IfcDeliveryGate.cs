using System;
using System.Collections.Generic;
using System.Globalization;
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
/// NOT_CHECKED. Required psets and properties are judged per class (GATE-E2):
/// "FireRating 118/120 IFCDOOR", values on the element's type count, and a class below
/// the contract's min_coverage fails. Pure C# — the Node port is WebApp/bridge/delivery-gate.mjs, and
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
        /// Every class each required pset or property applies to, with how many of its elements carry it (GATE-E2);
        /// a class below the contract's min_coverage is also a failure.
        public List<CoverageLine> Coverage { get; } = new List<CoverageLine>();
        public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
        public string CertificatePath { get; set; } = string.Empty;
    }

    /// <summary>One class's coverage of one requirement: "FireRating · IFCDOOR 118/120". Kind is "pset" or "property".</summary>
    public sealed class CoverageLine
    {
        public string Requirement { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public string Entity { get; set; } = string.Empty;
        public int Covered { get; set; }
        public int Total { get; set; }
    }

    private static readonly Regex EntityRx = new(
        @"^#(\d+)\s*=\s*(IFC[A-Z0-9]+)\s*\(", RegexOptions.Compiled | RegexOptions.CultureInvariant);
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

        var ix = new CoverageIndex(contract.RequiredProperties);
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
                var entity = string.Intern(em.Groups[2].Value); // ~1 000 class names, kept per element below
                r.TotalEntities++;
                r.EntityCounts.TryGetValue(entity, out var n);
                r.EntityCounts[entity] = n + 1;
                if (long.TryParse(em.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var id))
                    ix.Read(id, entity, line, em.Length);

                if (entity == "IFCSITE")
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

        // GATE-E2: judged per class, not "present somewhere"; a requirement no class carries is not found.
        var elements = ix.Elements();
        foreach (var pset in contract.RequiredPsets)
            if (!Judge(r, elements, pset, true, contract.MinCoverage))
                r.Failures.Add($"Required property set '{pset}' not found in the file.");

        foreach (var prop in contract.RequiredProperties)
            if (!Judge(r, elements, prop, false, contract.MinCoverage))
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
            coverage = r.Coverage.Select(c => new { requirement = c.Requirement, kind = c.Kind, entity = c.Entity, covered = c.Covered, total = c.Total }),
            issued_at = r.At,
            issued_by = "Sentinel IFC Delivery Gate",
        }, new JsonSerializerOptions { WriteIndented = true }));
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

    // ---- GATE-E2: required psets and properties judged per class (delivery-gate.mjs mirrors every rule below) ----

    private static readonly Regex CommonPset = new(@"^Pset_(.+)Common\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex RefRx = new(@"#([0-9]+)", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex TypedValue = new(@"^IFC[A-Z0-9_]*\((.*)\)\z", RegexOptions.Singleline | RegexOptions.CultureInvariant);
    private static readonly NumberFormatInfo PercentFormat = new() { PercentPositivePattern = 1, PercentNegativePattern = 1 }; // "100%" on every culture

    /// <summary>Judge one required pset or property class by class: add a coverage line for each class it applies to
    /// and a failure for each class below <paramref name="min"/>. A property ("FireRating", or "Pset_DoorCommon.FireRating")
    /// applies to each building-element class where at least one element carries it at all; "Pset_XCommon" to IFCX and its
    /// subtypes; any other pset to each class where it appears. An element covers it when the pset is on it or on its
    /// type (a property: with a value — $ or '' is none). False when it applies to no class: the caller says "not found".</summary>
    private static bool Judge(GateResult r, List<(string Class, List<Pset> Psets)> elements, string req, bool isPset, double min)
    {
        string want = req.ToLowerInvariant();
        var (pset, prop) = isPset ? ("", want) : Parts(req);
        // 0 = not carried, 1 = carried with no value, 2 = covered; an element counts its best pset.
        int Has(Pset p) => isPset ? (p.Name == want ? 2 : 0)
            : (pset.Length > 0 && p.Name != pset) || !p.Props.TryGetValue(prop, out var valued) ? 0 : valued ? 2 : 1;

        var carried = new Dictionary<string, int>();
        var covered = new Dictionary<string, int>();
        foreach (var (cls, psets) in elements)
        {
            int best = 0;
            foreach (var p in psets) best = Math.Max(best, Has(p));
            if (best > 0) carried[cls] = carried.TryGetValue(cls, out var c) ? c + 1 : 1;
            if (best == 2) covered[cls] = covered.TryGetValue(cls, out var v) ? v + 1 : 1;
        }

        var common = isPset ? CommonPset.Match(req) : Match.Empty;
        string target = common.Success ? "IFC" + common.Groups[1].Value.ToUpperInvariant() : "";
        var classes = (common.Success
                ? r.EntityCounts.Keys.Where(k => k == target || (Subtypes.TryGetValue(target, out var subs) && subs.Contains(k)))
                : carried.Keys.Where(k => isPset || IsBuildingElement(k)))
            .OrderBy(k => k, StringComparer.Ordinal).ToList();
        if (classes.Count == 0) return false;

        foreach (var cls in classes)
        {
            covered.TryGetValue(cls, out int n);
            int total = r.EntityCounts[cls];
            r.Coverage.Add(new CoverageLine { Requirement = req, Kind = isPset ? "pset" : "property", Entity = cls, Covered = n, Total = total });
            if ((double)n / total < min)
                r.Failures.Add($"{(isPset ? "Required property set" : "Required property")} '{req}': {n}/{total} {cls} " +
                               $"({(100.0 * n / total).ToString("F0", CultureInfo.InvariantCulture)}%) — below {min.ToString("P0", PercentFormat)}.");
        }
        return true;
    }

    /// <summary>A property set as an element carries it: its name and its single values' names → whether the value is set (lower case).</summary>
    private sealed class Pset
    {
        public readonly string Name;
        public readonly Dictionary<string, bool> Props = new();
        public Pset(string name) { Name = name; }
    }

    /// <summary>A required property as lower-case (pset, property): "Pset_DoorCommon.FireRating" → ("pset_doorcommon",
    /// "firerating"); "FireRating" → ("", "firerating").</summary>
    private static (string Pset, string Prop) Parts(string req)
    {
        string want = req.ToLowerInvariant();
        int dot = want.IndexOf('.');
        return dot > 0 && dot < want.Length - 1 ? (want.Substring(0, dot), want.Substring(dot + 1)) : ("", want);
    }

    /// <summary>What coverage needs, read line by line: each object's psets (IFCRELDEFINESBYPROPERTIES), its types
    /// (IFCRELDEFINESBYTYPE), each type's HasPropertySets, each pset's single values the contract names, and each rooted
    /// entity's class. No geometry and no other property is kept, so a multi-hundred-MB file stays small in memory.</summary>
    private sealed class CoverageIndex
    {
        private readonly HashSet<string> _wanted;                          // the property names the contract asks for
        private readonly Dictionary<string, string> _names = new();       // one string per pset name
        private readonly Dictionary<long, string> _classOf = new();
        private readonly Dictionary<long, (string Name, List<long> Props)> _psets = new();
        private readonly Dictionary<long, (string Name, bool Valued)> _props = new();
        private readonly Dictionary<long, List<long>> _own = new();       // object → its psets
        private readonly Dictionary<long, List<long>> _types = new();     // object → its types
        private readonly Dictionary<long, List<long>> _typePsets = new(); // type → HasPropertySets

        public CoverageIndex(IEnumerable<string> requiredProperties) =>
            _wanted = new HashSet<string>(requiredProperties.Select(p => Parts(p).Prop), StringComparer.Ordinal);

        /// <param name="argsAt">Where the arguments start: just after the entity's opening parenthesis.</param>
        public void Read(long id, string entity, string line, int argsAt)
        {
            switch (entity)
            {
                case "IFCPROPERTYSINGLEVALUE":
                {
                    var a = StepArgs(line, argsAt); // ('Name', Description, NominalValue, Unit)
                    if (a.Count > 0 && _wanted.TryGetValue(Unquote(a[0]).ToLowerInvariant(), out var name))
                        _props[id] = (name, a.Count > 2 && Valued(a[2]));
                    return;
                }
                case "IFCPROPERTYSET":
                {
                    var a = StepArgs(line, argsAt); // (GlobalId, OwnerHistory, 'Name', Description, (HasProperties))
                    if (a.Count <= 4) return;
                    var name = Unquote(a[2]).ToLowerInvariant();
                    if (!_names.TryGetValue(name, out var pooled)) _names[name] = pooled = name;
                    _psets[id] = (pooled, Refs(a[4]));
                    return;
                }
                case "IFCRELDEFINESBYPROPERTIES":
                case "IFCRELDEFINESBYTYPE":
                {
                    var a = StepArgs(line, argsAt); // (GlobalId, OwnerHistory, Name, Description, (RelatedObjects), Relating…)
                    if (a.Count < 6) return;
                    var map = entity == "IFCRELDEFINESBYTYPE" ? _types : _own;
                    var defs = Refs(a[5]);
                    foreach (var obj in Refs(a[4]))
                    {
                        if (!map.TryGetValue(obj, out var list)) map[obj] = list = new List<long>();
                        list.AddRange(defs);
                    }
                    return;
                }
            }
            // A rooted entity (its GlobalId first) is an object or a type: only those carry psets.
            if (argsAt >= line.Length || line[argsAt] != '\'' || entity.StartsWith("IFCREL", StringComparison.Ordinal)) return;
            _classOf[id] = entity;
            if (entity.EndsWith("TYPE", StringComparison.Ordinal) || entity.EndsWith("STYLE", StringComparison.Ordinal))
            {
                var a = StepArgs(line, argsAt); // IfcTypeObject: (GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence, (HasPropertySets), …)
                if (a.Count > 5) _typePsets[id] = Refs(a[5]);
            }
        }

        /// <summary>Every object that carries a pset, its own or its type's: its class and those psets.</summary>
        public List<(string Class, List<Pset> Psets)> Elements()
        {
            var built = new Dictionary<long, Pset?>();
            Pset? PsetOf(long id)
            {
                if (built.TryGetValue(id, out var p)) return p;
                if (_psets.TryGetValue(id, out var def))
                {
                    p = new Pset(def.Name);
                    foreach (var pid in def.Props)
                        if (_props.TryGetValue(pid, out var v))
                            p.Props[v.Name] = (p.Props.TryGetValue(v.Name, out var had) && had) || v.Valued;
                }
                return built[id] = p;
            }
            void AddAll(List<Pset> to, List<long> ids) { foreach (var id in ids) if (PsetOf(id) is { } p) to.Add(p); }

            var list = new List<(string, List<Pset>)>();
            foreach (var obj in _own.Keys.Union(_types.Keys))
            {
                if (!_classOf.TryGetValue(obj, out var cls)) continue;
                var psets = new List<Pset>();
                if (_own.TryGetValue(obj, out var own)) AddAll(psets, own);
                if (_types.TryGetValue(obj, out var types))
                    foreach (var t in types)
                        if (_typePsets.TryGetValue(t, out var held)) AddAll(psets, held);
                list.Add((cls, psets));
            }
            return list;
        }
    }

    /// <summary>The top-level arguments of one STEP entity line, from just after its opening parenthesis:
    /// <c>'a,b',$,(#1,#2),IFCLABEL('x'));</c> → <c>'a,b'</c> · <c>$</c> · <c>(#1,#2)</c> · <c>IFCLABEL('x')</c>.
    /// Strings ('' inside one) and nesting are respected; an unterminated line gives what was read.</summary>
    internal static List<string> StepArgs(string line, int start)
    {
        var args = new List<string>();
        int depth = 0, from = start;
        bool quoted = false;
        for (int i = start; i < line.Length; i++)
        {
            char ch = line[i];
            if (quoted)
            {
                if (ch == '\'') { if (i + 1 < line.Length && line[i + 1] == '\'') i++; else quoted = false; }
                continue;
            }
            if (ch == '\'') quoted = true;
            else if (ch == '(') depth++;
            else if (ch == ')')
            {
                if (depth == 0) { args.Add(line.Substring(from, i - from).Trim()); return args; }
                depth--;
            }
            else if (ch == ',' && depth == 0) { args.Add(line.Substring(from, i - from).Trim()); from = i + 1; }
        }
        return args;
    }

    private static List<long> Refs(string arg)
    {
        var ids = new List<long>();
        foreach (Match m in RefRx.Matches(arg))
            if (long.TryParse(m.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var id)) ids.Add(id);
        return ids;
    }

    private static string Unquote(string arg) =>
        arg.Length >= 2 && arg[0] == '\'' && arg[arg.Length - 1] == '\'' ? arg.Substring(1, arg.Length - 2).Replace("''", "'") : arg;

    /// <summary>A NominalValue holds something unless it is $ or empty: IFCLABEL('') is no value.</summary>
    internal static bool Valued(string arg)
    {
        var m = TypedValue.Match(arg);
        var inner = (m.Success ? m.Groups[1].Value : arg).Trim();
        return inner.Length > 0 && inner != "$" && inner != "''";
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
