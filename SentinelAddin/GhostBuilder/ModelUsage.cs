#nullable disable
// MA-1a item 8: what one local model was asked in one run, counted at each Ollama round trip, for the run's build:run
// receipt. Pure — no HTTP: the reader calls Asked() before a request and Got(answer) with Ollama's reply. Tokens are
// Ollama's own prompt_eval_count and eval_count when a reply carries them; a reply without them leaves tokens unknown
// (null), never 0. Thread-safe: a reader may run on pool threads.
using System.Text.Json;

namespace Sentinel.GhostBuilder
{
    public sealed class ModelUsage
    {
        private readonly object _gate = new object();

        /// <summary>The model's tag as the reader was configured with it (Project Setup), e.g. "qwen2.5:7b-instruct".</summary>
        public string Model { get; }
        /// <summary>Requests sent.</summary>
        public int Calls { get; private set; }
        /// <summary>Requests that came back with a 2xx reply.</summary>
        public int Answered { get; private set; }
        /// <summary>The answers' token counts summed; null until an answer carried one.</summary>
        public long? PromptTokens { get; private set; }
        public long? OutputTokens { get; private set; }

        public ModelUsage(string model) { Model = model; }

        public void Asked() { lock (_gate) Calls++; }

        public void Got(JsonElement answer)
        {
            lock (_gate)
            {
                Answered++;
                if (Count(answer, "prompt_eval_count") is long p) PromptTokens = (PromptTokens ?? 0) + p;
                if (Count(answer, "eval_count") is long o) OutputTokens = (OutputTokens ?? 0) + o;
            }
        }

        private static long? Count(JsonElement o, string name) =>
            o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            && v.TryGetInt64(out long n) && n >= 0 ? n : (long?)null;
    }
}
