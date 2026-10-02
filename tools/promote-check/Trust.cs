#nullable disable
using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 18. MA-1a item 8: the bridge's trust fields as the add-in reads them, a model's usage, the receipt ───────
    static void TrustChecks()
    {
        Console.WriteLine("\nMA-1a item 8 — the bridge's trust fields, a model's usage and the build:run receipt");

        // A changeset as the bridge stores it since item 8 — the `stored` half of the shared fixture, which vitest proves
        // validateChangeset makes from its `posted` half (review amendment C4) — and one from a bridge before it.
        string stored;
        using (var fx = JsonDocument.Parse(File.ReadAllText(Repo("WebApp", "bridge", "fixtures", "changeset-ops", "contract2-trust.json"))))
            stored = fx.RootElement.GetProperty("stored").GetRawText();
        var cs = JsonSerializer.Deserialize<ChangesetDto>(stored);
        cs.Elements[0].Verdict = new ElementVerdictDto { Status = "accepted" }; // the store attaches the referee's verdict at filing
        Ok(cs.Claimed == true && cs.Elements[0].Pretick == false && cs.Elements[0].Accuracy.Status == "not_measured",
           "the bridge's claimed, pretick and accuracy are read; its ignored list and contract do not break the read");
        Ok(cs.Elements[0].Cid == "scan-88" && cs.Elements[0].Evidence.SequenceEqual(new[] { "ev-1", "ev-2" })
           && cs.Elements[1].Cid == null && cs.Elements[1].Evidence == null,
           "contract 2's reader id and evidence ids are read as the bridge kept them; an element without them reads null");
        var older = JsonSerializer.Deserialize<ChangesetDto>("{\"id\":\"c0\",\"source\":\"promote\",\"elements\":[{\"proposal_guid\":\"g\",\"kind\":\"wall\",\"op\":\"attach\"}]}");
        Ok(older.Claimed == null && older.Elements[0].Pretick == null && older.Elements[0].Accuracy == null, "a changeset from a bridge before item 8 reads with none of them");

        ChangesetElementDto El(string op, bool? pretick, string typeBefore = null, string verdict = "accepted") => new ChangesetElementDto
        {
            Op = op, Kind = "wall", Pretick = pretick, Verdict = new ElementVerdictDto { Status = verdict },
            Target = op == "create" ? null : new TargetDto { UniqueId = "u", TypeBefore = typeBefore },
        };
        var agent = new ChangesetDto { Source = "agent" };
        var promote = new ChangesetDto { Source = "promote" };
        Ok(!ChangesetTrust.PreTick(agent, cs.Elements[0]), "the design's test: an agent's IDS-accepted create opens unticked");
        Ok(!ChangesetTrust.PreTick(agent, El("create", true)) && !ChangesetTrust.PreTick(agent, El(null, null)) && !ChangesetTrust.PreTick(promote, El("create", null)),
           "a create is never pre-ticked — not when a bridge says pretick true, not from an older bridge, not from any source");
        Ok(ChangesetTrust.PreTick(promote, El("retype", true, "T1")) && ChangesetTrust.PreTick(promote, El("attach", true)),
           "a retype or attach the bridge pre-ticked opens ticked");
        Ok(!ChangesetTrust.PreTick(promote, El("retype", false, "T1")) && !ChangesetTrust.PreTick(promote, El("attach", false)),
           "…and one the bridge did not pre-tick opens unticked, whatever the source says");
        Ok(ChangesetTrust.PreTick(promote, El("attach", null)) && ChangesetTrust.PreTick(promote, El("retype", null, "T1"))
           && !ChangesetTrust.PreTick(promote, El("retype", null)) && !ChangesetTrust.PreTick(agent, El("attach", null)),
           "from a bridge before item 8 the window's own rule holds: a Promote attach, a Promote retype with the type the plan saw");
        Ok(ChangesetTrust.Accuracy(cs.Elements[0]) == "not measured" && ChangesetTrust.Accuracy(older.Elements[0]) == null,
           "accuracy reads \"not measured\"; from an older bridge it reads nothing — never a pass");
        Ok(ChangesetTrust.SourceLabel(cs) == "sentinel-survey 0.1 (claimed — the bridge records who a changeset says it is from, and cannot verify it)"
           && ChangesetTrust.SourceLabel(older) == "promote", "the source is shown as a claim when the bridge marks it one");
        string filed = JsonSerializer.Serialize(new ChangesetElementDto { Kind = "wall", Op = "create" }, ChangesetClient.WriteJson);
        Ok(!filed.Contains("pretick") && !filed.Contains("accuracy") && !filed.Contains("cid") && !filed.Contains("evidence"),
           "an element the add-in files carries no trust field, reader id or evidence (nulls are left out), so nothing of its own is listed as ignored");

        // A model's usage: counted per round trip; tokens only when the answer carried them.
        JsonElement Answer(string json) => JsonDocument.Parse(json).RootElement.Clone();
        var usage = new ModelUsage("qwen2.5:7b-instruct");
        usage.Asked(); usage.Got(Answer("{\"response\":\"{}\",\"prompt_eval_count\":812,\"eval_count\":96,\"total_duration\":123}"));
        usage.Asked(); usage.Got(Answer("{\"response\":\"{}\",\"prompt_eval_count\":100,\"eval_count\":4}"));
        usage.Asked(); // a call that never answered (Ollama down, cancelled)
        Ok(usage.Model == "qwen2.5:7b-instruct" && usage.Calls == 3 && usage.Answered == 2 && usage.PromptTokens == 912 && usage.OutputTokens == 100,
           "3 calls, 2 answered, the token counts of the answers summed");
        var silent = new ModelUsage("llava");
        silent.Asked(); silent.Got(Answer("{\"response\":\"a plan\"}")); silent.Got(Answer("{\"response\":\"x\",\"eval_count\":\"7\"}"));
        Ok(silent.Answered == 2 && silent.PromptTokens == null && silent.OutputTokens == null, "an answer with no token count (or one that is not a number) leaves tokens unknown — null, never 0");

        // The receipt.
        var facts = new BuildReceipt.Facts { Seconds = 75.04, Candidates = 120 };
        facts.Models.Add(usage); facts.Models.Add(new ModelUsage("llava")); facts.Models.Add(null);
        facts.Tools.Add(BuildReceipt.PdfPig);
        facts.Parameters["drawing"] = "plan-L01.dxf";
        facts.Parameters["layers_read"] = 14;
        var row = Json(BuildReceipt.Run("ghost-builder", "ab" + new string('0', 62), facts, 2, new[] { "cs-1", "cs-2" }, "lead@office.example"));
        var v = row.GetProperty("new_value");
        Ok(row.GetProperty("entity_type").GetString() == "build" && row.GetProperty("action").GetString() == "build:run" && row.GetProperty("actor").GetString() == "lead@office.example",
           "a receipt is a build row with the action build:run");
        Ok(v.GetProperty("reader").GetString() == "ghost-builder" && v.GetProperty("addin_sha256").GetString().Length == 64
           && v.GetProperty("minutes").GetDouble() == 1.25 && v.GetProperty("seconds").GetDouble() == 75
           && v.GetProperty("candidates").GetInt32() == 120 && v.GetProperty("gaps").GetInt32() == 2,
           "the reader, the build of the add-in, the minutes, the candidates and the gaps");
        Ok(string.Join(" | ", v.GetProperty("tools").EnumerateArray().Select(t => t.GetProperty("name").GetString() + ": " + t.GetProperty("licence").GetString()))
           == "Autodesk Revit API: proprietary (Autodesk) | PdfPig: Apache-2.0 | Ollama: MIT",
           "each tool with its licence; Ollama is listed because a model was called");
        var weights = v.GetProperty("weights");
        Ok(weights.GetArrayLength() == 1 && weights[0].GetProperty("model").GetString() == "qwen2.5:7b-instruct" && weights[0].GetProperty("calls").GetInt32() == 3
           && weights[0].GetProperty("licence").ValueKind == JsonValueKind.Null && weights[0].GetProperty("licence_note").GetString() == BuildReceipt.WeightsNote
           && BuildReceipt.WeightsNote == "not read: Sentinel does not ask Ollama for a model's licence yet",
           "the weights that were called, their licence unknown and said so — a model that was never called is not listed");
        Ok(v.GetProperty("model_calls").GetInt32() == 3 && v.GetProperty("model_calls_answered").GetInt32() == 2
           && v.GetProperty("tokens").GetProperty("prompt").GetInt64() == 912 && v.GetProperty("tokens").GetProperty("output").GetInt64() == 100
           && v.GetProperty("tokens_note").ValueKind == JsonValueKind.Null, "model calls, answers and tokens as counted");
        Ok(v.GetProperty("parameters").GetProperty("drawing").GetString() == "plan-L01.dxf" && v.GetProperty("parameters").GetProperty("layers_read").GetInt32() == 14
           && v.GetProperty("changesets").GetArrayLength() == 2 && v.GetProperty("changesets_total").GetInt32() == 2 && v.GetProperty("source").GetString() == "revit",
           "the parameters as given, the changesets it filed");
        Ok(!v.TryGetProperty("claimed", out _), "the add-in does not mark its own receipt: claimed is the bridge's to set");

        var det = Json(BuildReceipt.Run("datum", null, new BuildReceipt.Facts { Seconds = 0.4, Candidates = 7 }, 0, new string[0], "a")).GetProperty("new_value");
        Ok(det.GetProperty("model_calls").GetInt32() == 0 && det.GetProperty("tokens").ValueKind == JsonValueKind.Null
           && det.GetProperty("tokens_note").GetString() == "no model was called: this run is deterministic" && det.GetProperty("weights").GetArrayLength() == 0
           && det.GetProperty("tools").GetArrayLength() == 1 && det.GetProperty("addin_sha256").ValueKind == JsonValueKind.Null
           && det.GetProperty("minutes").GetDouble() == 0.01 && det.GetProperty("seconds").GetDouble() == 0.4,
           "a deterministic run: no model, no weights, no tokens — said, not zero-filled; an unreadable DLL is null");
        var mute = new BuildReceipt.Facts();
        mute.Models.Add(silent);
        Ok(Json(BuildReceipt.Run("photo-massing", null, mute, 0, new string[0], "a")).GetProperty("new_value").GetProperty("tokens_note").GetString()
           == "the local model's answers carried no token counts", "a model that answered without counts: tokens null, with the reason");
        var odd = new BuildReceipt.Facts();
        odd.Tools.Add("Some Tool");
        Ok(Json(BuildReceipt.Run("datum", null, odd, 0, new string[0], "a")).GetProperty("new_value").GetProperty("tools")[1].GetProperty("licence").GetString() == "unknown",
           "a tool the table does not know reads unknown, never a guess");
        Ok(BuildReceipt.AddinSha256 != null && System.Text.RegularExpressions.Regex.IsMatch(BuildReceipt.AddinSha256, "^[0-9a-f]{64}$"),
           "the add-in's own sha256 is read from the loaded assembly (here: this check's)");
    }

    // ── 19. MA-1a item 8: the review obeys the bridge, the readers count, each run posts its receipt (a source scan) ──
    static void TrustWiringChecks()
    {
        Console.WriteLine("\nMA-1a item 8 — the review window, the model counters and the receipt posts (source scan)");
        string window = Src("UI", "ChangesetReviewWindow.cs");
        Ok(window.Contains("IsChecked = ChangesetTrust.PreTick(_cs, el)") && window.Contains("r.Box.IsChecked = ChangesetTrust.PreTick(_cs, r.El)")
           && !window.Contains("private static bool PreTick("),
           "Review AI Proposals pre-ticks by ChangesetTrust — the window keeps no rule of its own");
        Ok(window.Contains("ChangesetTrust.SourceLabel(_cs)") && window.Contains("ChangesetTrust.Accuracy(el)"),
           "…and shows the source as a claim and each element's accuracy");
        foreach (var file in new[] { "GhostBuilder_Architecture.cs", "LocalVisionReader.cs", "MassingVisionReader.cs" })
        {
            string src = Src("GhostBuilder", file);
            int asked = src.IndexOf("Usage.Asked();", StringComparison.Ordinal), post = src.IndexOf("_http.PostAsync(", StringComparison.Ordinal);
            Ok(asked > 0 && post > asked && src.Contains("Usage.Got(doc.RootElement);") && src.Contains("public ModelUsage Usage { get; }"),
               file + ": counts each Ollama round trip — asked before the request, answered with the reply");
        }
        foreach (var (file, post) in new[]
        {
            (new[] { "GhostBuilder", "GhostChangesetBuild.cs" }, "GovernedNotify.Report(\"Ghost Builder receipt\", BuildReceipt.Run(\"ghost-builder\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.Massing.cs" }, "GovernedNotify.Report(\"Photo Massing receipt\", BuildReceipt.Run(\"photo-massing\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.Datum.cs" }, "GovernedNotify.Report(\"Datum receipt\", BuildReceipt.Run(\"datum\", BuildReceipt.AddinSha256,"),
            (new[] { "Commands.PromoteWalls.cs" }, "GovernedNotify.Report(\"Promote receipt\", BuildReceipt.Run(\"promote\", BuildReceipt.AddinSha256,"),
        })
        {
            string src = Src(file);
            int first = src.IndexOf(post, StringComparison.Ordinal);
            Ok(first > 0 && src.IndexOf(post, first + 1, StringComparison.Ordinal) < 0, file[file.Length - 1] + ": one receipt post");
        }
        Ok(Src("Commands.GhostBuilder.cs").Contains("reader.Models.Add(llm.Usage);") && Src("Commands.GhostBuilder.cs").Contains("readerClock.Stop();"),
           "Ghost Builder's receipt holds its mapper's usage and its reader's own time");
    }
}
