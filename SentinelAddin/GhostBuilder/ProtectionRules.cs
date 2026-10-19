#nullable disable
// Roadmap item 1, slice B (2026-10-19): what no changeset may edit in Revit — the project's protection@n (project → office), or the built-in
// default when none is installed or none could be read, so protection never silently switches off. ChangesetExecutor keeps a row that edits
// an existing protected element as it stands and says why; new elements are not held. Revit-free: promote-check links this file.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class ProtectionRules
    {
        /// <summary>BuiltInCategory names (OST_Levels …) whose existing elements no changeset edits.</summary>
        public HashSet<string> Categories = new HashSet<string>(StringComparer.Ordinal);
        /// <summary>Workset names or patterns (* matches any run of characters, case ignored).</summary>
        public List<string> Worksets = new List<string>();
        /// <summary>Walls and floors whose Structural box is ticked.</summary>
        public bool StructuralHosts;
        /// <summary>Named in every refusal: "protection@2 (office)", or the built-in default and why it applies.</summary>
        public string Label = "";

        public static ProtectionRules Default(string why = null) => new ProtectionRules
        {
            Categories = new HashSet<string>(new[] { "OST_Grids", "OST_Levels", "OST_StructuralColumns", "OST_StructuralFraming",
                "OST_StructuralFoundation", "OST_ProjectBasePoint", "OST_SharedBasePoint" }, StringComparer.Ordinal),
            Worksets = new List<string> { "*Shared Levels and Grids*" },
            StructuralHosts = true,
            Label = "the built-in protection policy" + (why == null ? "" : " (" + why + ")"),
        };

        /// <summary>The installed policy's body, or the default when there is none (<paramref name="bodyJson"/> null) or it does not read —
        /// the bridge validates every install, so a body that fails here was changed on the way; failing closed is the safe reading.</summary>
        public static ProtectionRules From(string bodyJson, string label)
        {
            if (bodyJson == null) return Default("none installed");
            try
            {
                using (var d = JsonDocument.Parse(bodyJson))
                {
                    var r = d.RootElement;
                    var rules = new ProtectionRules { Label = label ?? "protection" };
                    foreach (var c in r.GetProperty("categories").EnumerateArray()) rules.Categories.Add(c.GetString() ?? throw new FormatException("a category is not text"));
                    foreach (var w in r.GetProperty("worksets").EnumerateArray()) rules.Worksets.Add(w.GetString() ?? throw new FormatException("a workset is not text"));
                    rules.StructuralHosts = r.GetProperty("structural_hosts").GetBoolean();
                    return rules;
                }
            }
            catch (Exception e) { return Default((label ?? "protection") + " did not read: " + e.Message); }
        }

        /// <summary>Why an element may not be edited, in words — or null. <paramref name="category"/> is the BuiltInCategory name,
        /// <paramref name="categoryName"/> Revit's own (Levels), <paramref name="workset"/> null when the model is not workshared.</summary>
        public string Why(string category, string categoryName, string workset, bool structural)
        {
            if (category != null && Categories.Contains(category)) return $"{categoryName ?? category} are protected by {Label}";
            var hit = workset == null ? null : Worksets.FirstOrDefault(p => Glob(p, workset));
            if (hit != null) return $"is on workset \"{workset}\", protected by {Label} ({hit})";
            return StructuralHosts && structural ? $"is structural, protected by {Label}" : null;
        }

        public static bool Glob(string pattern, string name) =>
            Regex.IsMatch(name ?? "", "^" + Regex.Escape(pattern ?? "").Replace("\\*", ".*") + "$", RegexOptions.IgnoreCase | RegexOptions.Singleline);
    }
}
