#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Sentinel.Coordination;

namespace Sentinel.Engine
{
    /// <summary>
    /// The founder's rule (2026-10-19): no per-PC setting needs a file edit. Standards ▸ PC Settings reads and writes this PC's two
    /// files — %AppData%\Sentinel\config.json (the local AI and Ghost Builder) and bcf-config.json (the bridge and the sign-in) — and
    /// this is its Revit-free half: a file read as a JSON object; a save that sets only the keys that changed (every other key is
    /// kept; another spelling of the same key is dropped) after a backup of the old file; the save rules; the Test buttons' words.
    /// Secrets are never part of any text it returns. tools/promote-check proves it.
    /// </summary>
    public static class PcSettings
    {
        private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };
        private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

        /// <summary>The file as a JSON object: empty when there is none; null, with the words, when it does not read as one.</summary>
        public static JsonObject? Read(string path, out string? error)
        {
            error = null;
            try
            {
                if (!File.Exists(path)) return new JsonObject();
                return JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? throw new JsonException("not a JSON object");
            }
            catch (Exception e) { error = $"{Path.GetFileName(path)} did not read ({e.Message})"; return null; }
        }

        /// <summary>The key's text: its exact spelling first, else any case (bcf-config.json reads case-insensitively).</summary>
        public static string Text(JsonObject o, string key, string fallback) =>
            Find(o, key) is JsonValue v && v.TryGetValue<string>(out var s) ? s : fallback;

        public static bool Flag(JsonObject o, string key) => Find(o, key) is JsonValue v && v.TryGetValue<bool>(out var b) && b;

        private static JsonNode? Find(JsonObject o, string key) =>
            o.FirstOrDefault(p => p.Key == key).Value
            ?? o.FirstOrDefault(p => string.Equals(p.Key, key, StringComparison.OrdinalIgnoreCase)).Value;

        /// <summary>The file's new text: <paramref name="old"/> with each of <paramref name="set"/> under its own spelling (the same key
        /// in another case is removed), every other key as it was; indented.</summary>
        public static string Merged(JsonObject old, IReadOnlyDictionary<string, JsonNode?> set)
        {
            var o = (JsonObject)old.DeepClone();
            foreach (var kv in set)
            {
                foreach (var k in o.Select(p => p.Key).Where(k => string.Equals(k, kv.Key, StringComparison.OrdinalIgnoreCase)).ToList()) o.Remove(k);
                o[kv.Key] = kv.Value?.DeepClone();
            }
            return o.ToJsonString(Indented);
        }

        /// <summary>Writes <paramref name="text"/> to <paramref name="path"/> through a temporary file, the old file copied first to
        /// path + ".bak-yyyyMMdd-HHmmss". The backup's path, or null when there was no old file.</summary>
        public static string? Write(string path, string text, DateTime now)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            string? bak = null;
            if (File.Exists(path)) { bak = path + ".bak-" + now.ToString("yyyyMMdd-HHmmss"); File.Copy(path, bak, true); }
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, text);
            if (File.Exists(path)) File.Replace(tmp, path, null); else File.Move(tmp, path);
            return bak;
        }

        /// <summary>A loopback address, or the name localhost in any case.</summary>
        public static bool OnThisPc(string? url) =>
            Uri.TryCreate((url ?? "").Trim(), UriKind.Absolute, out var u) && (u.IsLoopback || u.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase));

        public const string TokenOffPc =
            "This PC's shared token works only with the bridge on this PC (PR-1), and Sentinel never sends it to another one. "
            + "Use the bridge address on this PC (http://localhost:4100), or tick \"Remove it\" and sign in instead.";

        /// <summary>Null when the form may be saved; else the words. The add-in's own rules (UrlRule, LocalOnly), and PR-1: this PC's
        /// shared token (the machine credential) goes only to the bridge on this PC.</summary>
        public static string? Refusal(string serviceUrl, string supabaseUrl, bool keepsMachineToken,
                                      string ollamaUrl, bool cloudOptIn, string familyDir, string schemaPath, string addinDir, string schemasDir)
        {
            if (string.IsNullOrWhiteSpace(serviceUrl)) return "Type the bridge address — on this PC it is http://localhost:4100.";
            var why = UrlRule.Refusal(serviceUrl, "bridge") ?? UrlRule.Refusal(supabaseUrl, "sign-in")
                      ?? (keepsMachineToken && !OnThisPc(serviceUrl) ? TokenOffPc : null)
                      ?? LocalOnly.ModelUrlRefusal(ollamaUrl, cloudOptIn)
                      ?? LocalOnly.FolderRefusal(familyDir, fromModel: false)
                      ?? LocalOnly.SchemaRefusal(schemaPath, addinDir, schemasDir);
            return why is null ? null : Plain(why);
        }

        /// <summary>A refusal's words without its "nothing was sent" ending, for a form that sends nothing.</summary>
        public static string Plain(string why) => why.Replace(" Nothing was read or sent.", "").Replace(" Nothing was sent.", "");

        /// <summary>Ollama's model list beside the generate address: http://h:11434/api/generate → http://h:11434/api/tags.</summary>
        public static string TagsUrl(string modelUrl)
        {
            var u = new Uri(modelUrl.Trim());
            var path = u.AbsolutePath;
            var at = path.IndexOf("/api/", StringComparison.OrdinalIgnoreCase);
            return u.GetLeftPart(UriPartial.Authority) + (at >= 0 ? path.Substring(0, at) : "") + "/api/tags";
        }

        /// <summary>"is installed" words for one model name against Ollama's list (a bare name matches name:latest).</summary>
        public static string Installed(IEnumerable<string> names, string model, string what)
        {
            if (string.IsNullOrWhiteSpace(model)) return "";
            var m = model.Trim();
            bool has = names.Any(n => string.Equals(n, m, StringComparison.OrdinalIgnoreCase) || string.Equals(n, m + ":latest", StringComparison.OrdinalIgnoreCase));
            return has ? $" {what} {m} is installed." : $" {what} {m} is NOT installed on it.";
        }

        // ── the Test buttons: blocking, run off the UI thread; each answers in words and never shows a token ──

        public static string TestBridge(string serviceUrl)
        {
            var u = (serviceUrl ?? "").Trim().TrimEnd('/');
            if (u.Length == 0) return "✗ No bridge address.";
            if (UrlRule.Refusal(u, "bridge") is { } why) return "✗ " + Plain(why);
            try
            {
                using var r = Http.GetAsync(u + "/health").GetAwaiter().GetResult();
                return r.IsSuccessStatusCode
                    ? $"✓ The bridge at {u} answers."
                    : $"✗ {u} answered {(int)r.StatusCode} {r.ReasonPhrase} — it is not a Sentinel bridge, or the bridge is not working.";
            }
            catch (Exception e) { return $"✗ No bridge answers at {u} ({Inner(e)}). Is the bridge running?"; }
        }

        public static string TestModel(string ollamaUrl, bool cloudOptIn, string model, string visionModel)
        {
            if (LocalOnly.ModelUrlRefusal(ollamaUrl, cloudOptIn) is { } why) return "✗ " + Plain(why);
            var url = LocalOnly.ModelUrl(ollamaUrl, cloudOptIn);
            var where = LocalOnly.Where(url);
            try
            {
                using var r = Http.GetAsync(TagsUrl(url)).GetAwaiter().GetResult();
                if (!r.IsSuccessStatusCode) return $"✗ The local AI {where} answered {(int)r.StatusCode} {r.ReasonPhrase} — is it Ollama?";
                using var d = JsonDocument.Parse(r.Content.ReadAsStringAsync().GetAwaiter().GetResult());
                var names = d.RootElement.TryGetProperty("models", out var ms) && ms.ValueKind == JsonValueKind.Array
                    ? ms.EnumerateArray().Select(x => x.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "").ToList()
                    : new List<string>();
                return $"✓ Ollama answers {where}." + Installed(names, model, "Ghost Builder's model") + Installed(names, visionModel, "The photo model");
            }
            catch (Exception e) { return $"✗ No local AI answers {where} ({Inner(e)}). Is Ollama running?"; }
        }

        public static string TestSignIn(string supabaseUrl, string anonKey)
        {
            if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(anonKey))
                return "✗ This PC has no sign-in address or key — fill both and Save, then Standards ▸ Sign in.";
            if (UrlRule.Refusal(supabaseUrl, "sign-in") is { } why) return "✗ " + Plain(why);
            if (UserSession.Email is not { } who) return "Signed out — Standards ▸ Sign in to act under your own name.";
            string? token;
            try { token = UserSession.AccessToken(supabaseUrl.Trim(), anonKey.Trim()); }
            catch (SessionException e) { return $"✗ The sign-in for {who} could not be used: {e.Message}"; }
            if (token is null) return "Signed out — Standards ▸ Sign in to act under your own name.";
            try
            {
                using var msg = new HttpRequestMessage(HttpMethod.Get, supabaseUrl.Trim().TrimEnd('/') + "/auth/v1/user");
                msg.Headers.Add("apikey", anonKey.Trim());
                msg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                using var r = Http.SendAsync(msg).GetAwaiter().GetResult();
                var code = (int)r.StatusCode;
                return r.IsSuccessStatusCode ? $"✓ Signed in as {who}; the sign-in is valid."
                    : code == 401 || code == 403 ? $"✗ The sign-in for {who} is no longer accepted — Standards ▸ Sign in again."
                    : $"✗ The sign-in address answered {code} {r.ReasonPhrase}.";
            }
            catch (Exception e) { return $"✗ The sign-in address does not answer ({Inner(e)})."; }
        }

        private static string Inner(Exception e)
        {
            while (e.InnerException != null) e = e.InnerException;
            return e is TaskCanceledException ? "no answer in 5 s" : e.Message;
        }
    }
}
