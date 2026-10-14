#nullable disable
// MA-7-14: Photo Massing's two reads of the evidence pack - the pack (which photos), and one photo's blurred copy (its bytes). Both are GETs the machine
// credential may make (a read; the unblurred original and the marking stay a signed-in person's). Built, sent and read on a pool thread like every
// request here (MA-2d). Kept apart from ChangesetClient, whose request counts tools/promote-check pins.
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig

namespace Sentinel.Coordination;

internal static class EvidenceClient
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };

    private static string Url(BcfConfig cfg, string projectKey, string packId, string tail = "") =>
        $"{cfg.ServiceUrl.TrimEnd('/')}/cde/{Uri.EscapeDataString(projectKey)}/evidence/{Uri.EscapeDataString(packId)}{tail}";

    private static (HttpResponseMessage Resp, byte[] Body) Get(BcfConfig cfg, string url) =>
        Task.Run(async () =>
        {
            var msg = new HttpRequestMessage(HttpMethod.Get, url);
            var token = cfg.ServiceToken; // read here: a sign-in refresh is a network call
            if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = await Http.SendAsync(msg).ConfigureAwait(false);
            return (resp, await resp.Content.ReadAsByteArrayAsync().ConfigureAwait(false));
        }).GetAwaiter().GetResult();

    /// <summary>GET /cde/:key/evidence/:pack - the pack as JSON (PackPhotos.Usable decides which photos Photo Massing may read). Null with <paramref name="error"/>.</summary>
    public static string FetchPack(BcfConfig cfg, string projectKey, string packId, out string error)
    {
        error = null;
        try
        {
            var (resp, body) = Get(cfg, Url(cfg, projectKey, packId));
            string text = Encoding.UTF8.GetString(body);
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, text); return null; }
            return text;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)Http.Timeout.TotalSeconds); return null; }
    }

    /// <summary>GET …/items/:id/view - a photo's blurred copy. The caller checks the bytes against the copy's sha256 (PackPhotos.IsCopy).</summary>
    public static byte[] FetchCopy(BcfConfig cfg, string projectKey, string packId, string itemId, out string error)
    {
        error = null;
        try
        {
            var (resp, body) = Get(cfg, Url(cfg, projectKey, packId, $"/items/{Uri.EscapeDataString(itemId)}/view"));
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, Encoding.UTF8.GetString(body)); return null; }
            return body;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)Http.Timeout.TotalSeconds); return null; }
    }
}
