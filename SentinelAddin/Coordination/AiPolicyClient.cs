// AI privacy controls (spec 2026-10-20): the one read of a project's AI policy — GET /ai/policy?project=key, a member's read. Built, sent and read
// on a pool thread like every request here (MA-2d); a short timeout, because a tool waits on it before it reads or sends anything. The answer is
// AiPolicy.Parse's (a policy, or the words why it was not read); nothing is stored. Kept apart from ChangesetClient, whose request counts
// tools/promote-check pins.
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig
using Sentinel.Engine;

namespace Sentinel.Coordination;

internal static class AiPolicyClient
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };

    /// <summary>The project's policy, or <c>Error</c> in words (bridge address refused, bridge not reached, a refusal such as "not a member", a reply
    /// that is not a policy). Never throws.</summary>
    public static (bool LocalOnly, bool Redact, string Words, string? Error) Fetch(BcfConfig cfg, string key)
    {
        if ((cfg.Refusal ?? UrlRule.Refusal(cfg.ServiceUrl, "bridge")) is { } refused) return (false, false, "", refused); // SEC-3: no token goes to that address
        try
        {
            var (resp, text) = Task.Run(async () =>
            {
                var msg = new HttpRequestMessage(HttpMethod.Get, $"{cfg.ServiceUrl.TrimEnd('/')}/ai/policy?project={Uri.EscapeDataString(key)}");
                var token = cfg.ServiceToken; // read here: a sign-in refresh is a network call
                if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var r = await Http.SendAsync(msg).ConfigureAwait(false);
                return (r, Encoding.UTF8.GetString(await r.Content.ReadAsByteArrayAsync().ConfigureAwait(false)));
            }).GetAwaiter().GetResult();
            return resp.IsSuccessStatusCode
                ? AiPolicy.Parse(text, key)
                : (false, false, "", ChangesetTrust.Refusal((int)resp.StatusCode, text));
        }
        catch (Exception ex) { return (false, false, "", ChangesetTrust.BridgeWords(ex, (int)Http.Timeout.TotalSeconds)); }
    }

    /// <summary>What a tool asks before it uses a model <paramref name="modelWhere"/> (<see cref="LocalOnly.Where"/>) for project <paramref name="key"/>:
    /// null, or the words that refuse it. A model on this PC, or a model bound to no project, never reaches the bridge.</summary>
    public static string? Refusal(string key, string modelWhere)
    {
        if (!AiPolicy.Applies(modelWhere, key)) return null;
        var p = Fetch(BcfConfig.Load(), key);
        return AiPolicy.OffPcModelRefusal(p.LocalOnly, p.Words, p.Error, modelWhere, key);
    }
}
