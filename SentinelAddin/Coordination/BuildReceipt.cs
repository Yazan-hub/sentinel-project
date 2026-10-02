#nullable disable
// MA-1a item 8 (C12): the build:run receipt of one reader or planner run — Ghost Builder, Photo Massing, Datum, Promote —
// as a POST /cde/:key/audit body (entity_type build; the bridge words the action and marks it claimed). Pure — no Revit
// API, no HTTP — so tools/promote-check pins it. It states only what the run knows: a fact it cannot know is null with a
// note, never 0 and never a guess. It carries no file contents, no prompt, no model answer, no path, and no person but
// the actor.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

namespace Sentinel.Coordination
{
    public static class BuildReceipt
    {
        public const string RevitApi = "Autodesk Revit API", Ollama = "Ollama", PdfPig = "PdfPig";

        // The code the readers run with, and its licence. Weights are not here: a model's licence is the model's own, and
        // Sentinel does not read it from Ollama yet.
        private static readonly Dictionary<string, string> Licences = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [RevitApi] = "proprietary (Autodesk)",
            [Ollama] = "MIT",
            [PdfPig] = "Apache-2.0",
        };

        public const string WeightsNote = "not read: Sentinel does not ask Ollama for a model's licence yet";
        private const string NoModel = "no model was called: this run is deterministic";
        private const string NoTokens = "the local model's answers carried no token counts";

        private static readonly Lazy<string> Sha = new Lazy<string>(() =>
        {
            try { return ProvenanceStamp.FileSha256(typeof(BuildReceipt).Assembly.Location); }
            catch (Exception) { return null; }
        });

        /// <summary>The sha256 of the add-in's DLL as loaded — it names the exact build that read the evidence (the add-in
        /// has no version number); null when the file cannot be read.</summary>
        public static string AddinSha256 => Sha.Value;

        /// <summary>What a command gathered about its reader or planner run.</summary>
        public sealed class Facts
        {
            /// <summary>The reader's or planner's own time, by a stopwatch.</summary>
            public double Seconds;
            /// <summary>The elements the reader read or the planner judged.</summary>
            public int Candidates;
            /// <summary>The local models the run could call (a null entry is skipped); empty for a deterministic run.</summary>
            public readonly List<ModelUsage> Models = new List<ModelUsage>();
            /// <summary>The tools the run used, by the names above. Ollama is added by Run when a model was called.</summary>
            public readonly List<string> Tools = new List<string> { RevitApi };
            /// <summary>What the run was given: names, labels and counts — never a path, never file contents.</summary>
            public readonly Dictionary<string, object> Parameters = new Dictionary<string, object>();
        }

        public static object Run(string reader, string addinSha256, Facts facts, int gaps, IReadOnlyList<string> changesets, string actor)
        {
            var models = facts.Models.Where(m => m != null).ToList();
            int calls = models.Sum(m => m.Calls);
            bool counted = models.Any(m => m.PromptTokens.HasValue || m.OutputTokens.HasValue);
            var tools = facts.Tools.Concat(calls > 0 ? new[] { Ollama } : new string[0]).Distinct().ToList();
            return new
            {
                entity_type = "build",
                actor,
                action = "build:run",
                new_value = new
                {
                    reader,
                    addin_sha256 = addinSha256,
                    tools = tools.Select(t => new { name = t, licence = Licences.TryGetValue(t, out string l) ? l : "unknown" }).ToArray(),
                    weights = models.Where(m => m.Calls > 0)
                        .Select(m => new { model = m.Model, calls = m.Calls, licence = (string)null, licence_note = WeightsNote }).ToArray(),
                    parameters = facts.Parameters,
                    minutes = Math.Round(facts.Seconds / 60.0, 2),
                    seconds = Math.Round(facts.Seconds, 1),
                    model_calls = calls,
                    model_calls_answered = models.Sum(m => m.Answered),
                    tokens = counted ? (object)new { prompt = models.Sum(m => m.PromptTokens ?? 0), output = models.Sum(m => m.OutputTokens ?? 0) } : null,
                    tokens_note = counted ? null : calls == 0 ? NoModel : NoTokens,
                    candidates = facts.Candidates,
                    gaps,
                    changesets = changesets.Take(CommandReports.MaxNames).ToArray(),
                    changesets_total = changesets.Count,
                    source = "revit",
                },
            };
        }
    }
}
