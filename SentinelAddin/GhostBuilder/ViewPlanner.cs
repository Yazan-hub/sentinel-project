#nullable disable
// C# port of planViews in WebApp/src/sentinel-core/guideline.ts — view-plan.test.ts is the
// CONFORMANCE REFERENCE: same input, same output, exactly as GuidelineMatcher mirrors guideline.ts.
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    public sealed class PlannedView
    {
        public string Name { get; set; }
        public string Use { get; set; }
        public string ViewType { get; set; }
        public string LevelName { get; set; }
        public string Template { get; set; }
        public string BrowserStatus { get; set; }
    }

    public static class ViewPlanner
    {
        private static readonly HashSet<string> Plannable = new HashSet<string> { "FloorPlan", "CeilingPlan" };

        /// <summary>Deterministic WIP view plan: one view per plannable guideline entry per level.
        /// Name follows the office structure [STATUS]_[TYPE]_[LEVEL] (description omitted).
        /// GuidelineViewNaming.structure is documentation only for now — this format is fixed and
        /// does not read that field.</summary>
        public static List<PlannedView> Plan(
            List<GuidelineViewStandard> views, GuidelineViewNaming naming, List<string> levelNames)
        {
            var outp = new List<PlannedView>();
            if (views == null || naming == null || levelNames == null || levelNames.Count == 0) return outp;

            const string status = "WIP_";
            string browserStatus = null;
            naming.StatusPrefixes?.TryGetValue(status, out browserStatus);

            foreach (var v in views)
            {
                if (string.IsNullOrWhiteSpace(v?.NamePrefix) || !Plannable.Contains(v.ViewType ?? "")) continue;
                foreach (string level in levelNames)
                {
                    string levelToken = Regex.Replace(level.Trim().ToUpperInvariant(), @"\s+", "-");
                    outp.Add(new PlannedView
                    {
                        Name = status + v.NamePrefix + "_" + levelToken,
                        Use = v.Use,
                        ViewType = v.ViewType,
                        LevelName = level,
                        Template = v.WipTemplate,
                        BrowserStatus = browserStatus,
                    });
                }
            }
            return outp;
        }
    }
}
