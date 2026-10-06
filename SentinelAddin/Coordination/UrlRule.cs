using System;

namespace Sentinel.Coordination;

/// <summary>SEC-3/SEC-5: where a token, a sign-in or a ledger event may be sent — https, or http to this PC. One rule for
/// the bridge address (BcfConfig), the sign-in address (UserSession) and the ledger POST (LedgerResult). No Revit types:
/// tools/*-check harnesses compile it.</summary>
internal static class UrlRule
{
    /// <summary>null when a token or a sign-in may go to <paramref name="url"/> — https, or http to this PC (blank:
    /// nothing is sent); else the words.</summary>
    internal static string? Refusal(string? url, string what)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var u = url!.Trim();
        bool ok = Uri.TryCreate(u, UriKind.Absolute, out var uri)
                  && (uri.Scheme == Uri.UriSchemeHttps
                      || (uri.Scheme == Uri.UriSchemeHttp && (uri.IsLoopback || uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase))));
        return ok ? null
            : $"The {what} address \"{u}\" is not https and not on this PC — Sentinel sends a token or a sign-in to another PC over https only; "
              + "set an https address in %AppData%\\Sentinel\\bcf-config.json. Nothing was sent.";
    }
}
