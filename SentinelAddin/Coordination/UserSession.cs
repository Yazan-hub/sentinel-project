using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

namespace Sentinel.Coordination;

/// <summary>
/// The signed-in person's Sentinel (Supabase) session inside Revit (spec 2026-09-28 revit-sign-in, Decision 2). One
/// static session per process: <see cref="SignIn"/> exchanges e-mail + password for tokens at
/// <c>{supabaseUrl}/auth/v1/token</c>, <see cref="AccessToken"/> hands out a token with at least a minute left
/// (refreshing on demand), <see cref="SignOut"/> forgets it locally — nothing is revoked at Supabase, so the web and
/// other PCs stay signed in. The refresh token is kept DPAPI-encrypted for the Windows user at
/// <c>%LOCALAPPDATA%\Sentinel\session.bin</c> (override: SENTINEL_SESSION_FILE), so a sign-in survives a Revit
/// restart and never lands in Roaming. Supabase refresh tokens are single-use: a refresh runs under a named mutex and
/// re-reads the file first, so two Revit versions open at once never spend the same one. No Revit types: the
/// session-check tool compiles this file.
/// </summary>
public static class UserSession
{
    // B34's knob: refresh this many seconds before expiry (60–3500; default 60) so a drill reaches "near expiry" at once.
    private static readonly int MinLeftSeconds =
        int.TryParse(Environment.GetEnvironmentVariable("SENTINEL_SESSION_REFRESH_WITHIN"), out var w) && w >= 60 && w <= 3500 ? w : 60;
    private static readonly object Gate = new();
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };
    private static volatile Stored? _s;      // the session in memory (null = signed out)
    private static volatile bool _loaded;    // the file has been read once this process

    /// <summary>SI-1: what a call says when the session is kept but its refresh failed; the next call retries.</summary>
    public const string NotRefreshed = "session not refreshed — retrying";

    private sealed class Stored
    {
        [JsonPropertyName("email")] public string Email { get; set; } = "";
        [JsonPropertyName("access_token")] public string AccessToken { get; set; } = "";
        [JsonPropertyName("refresh_token")] public string RefreshToken { get; set; } = "";
        [JsonPropertyName("expires_at")] public long ExpiresAt { get; set; } // unix seconds
    }

    public static string SessionPath =>
        Environment.GetEnvironmentVariable("SENTINEL_SESSION_FILE") is { Length: > 0 } p ? p
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sentinel", "session.bin");

    /// <summary>Who is signed in (e-mail), or null. Reads the file once; never touches the network and never waits on
    /// a refresh (one holds the lock for up to 18 s; <see cref="Actor"/> runs inside DMU Execute). A session kept
    /// through a failed refresh still names its person.</summary>
    public static string? Email { get { if (!_loaded) lock (Gate) LoadOnce(); return _s?.Email; } }

    public static bool IsSignedIn => Email is not null;

    /// <summary>XC-4: the one actor string every write carries — the signed-in e-mail, else "unsigned — &lt;Windows user&gt;".
    /// Memory only, never the network: safe inside DMU Execute and on Revit's API thread.</summary>
    public static string Actor => ActorFor(Email, Environment.UserName);

    /// <summary>Pure: the e-mail when there is one, else "unsigned — " + the Windows user ("unknown" when blank).</summary>
    public static string ActorFor(string? email, string? windowsUser) =>
        !string.IsNullOrWhiteSpace(email) ? email!.Trim()
        : "unsigned — " + (string.IsNullOrWhiteSpace(windowsUser) ? "unknown" : windowsUser!.Trim());

    /// <summary>
    /// Sign in with e-mail and password. Returns (ok, message): the message is Supabase's own words on a refusal
    /// ("Invalid login credentials") or a transport failure, never a guess. The password is used once and dropped.
    /// </summary>
    public static (bool Ok, string Message) SignIn(string supabaseUrl, string anonKey, string email, string password)
    {
        if (string.IsNullOrWhiteSpace(supabaseUrl) || string.IsNullOrWhiteSpace(anonKey))
            return (false, "no Supabase address in bcf-config.json (supabaseUrl, supabaseAnonKey)");
        var body = JsonSerializer.Serialize(new { email = email.Trim(), password });
        var r = Token(supabaseUrl, anonKey, "password", body);
        if (r.Session is null) return (false, r.Error);
        lock (Gate) { _s = r.Session; _loaded = true; Save(_s); }
        return (true, "Signed in as " + r.Session.Email);
    }

    /// <summary>Forget the session on this PC: memory and the file. Nothing is revoked at Supabase.</summary>
    public static void SignOut()
    {
        lock (Gate)
        {
            _s = null; _loaded = true;
            try { File.Delete(SessionPath); } catch { /* nothing to forget */ }
        }
    }

    /// <summary>
    /// A bearer with at least a minute left, refreshed on demand; null when there is no Supabase address or no
    /// session (the file's token rules). While a session exists it never returns null (SI-1): a refresh Supabase
    /// refused signs out and throws <see cref="SessionException"/> ("signed out — …"; later calls run signed out),
    /// and a refresh that failed any other way (no answer, 5xx, 408, 429) keeps the session and throws
    /// "<see cref="NotRefreshed"/> (…)" — the next call retries. Never the PC's token instead.
    /// ponytail: the refresh is a blocking HTTP call (8 s cap) on the caller's thread; a background refresh loop is
    /// the upgrade if a UI-thread caller ever stalls.
    /// </summary>
    public static string? AccessToken(string supabaseUrl, string anonKey)
    {
        if (string.IsNullOrWhiteSpace(supabaseUrl)) return null; // no address, no session: the file's token rules
        lock (Gate)
        {
            LoadOnce();
            if (_s is null) return null;
            if (SecondsLeft(_s) > MinLeftSeconds) return _s.AccessToken;
            return Refresh(supabaseUrl, anonKey);
        }
    }

    // ── refresh under the cross-process mutex ─────────────────────────────────────────────────────────────────
    private static string Refresh(string supabaseUrl, string anonKey)
    {
        using var mutex = new Mutex(false, @"Local\Sentinel.UserSession");
        bool held = false;
        try { held = mutex.WaitOne(TimeSpan.FromSeconds(10)); } catch (AbandonedMutexException) { held = true; }
        try
        {
            // Another Revit may have refreshed while we waited: adopt its tokens instead of spending ours twice.
            var onDisk = Load();
            if (onDisk is not null && SecondsLeft(onDisk) > MinLeftSeconds) { _s = onDisk; return _s.AccessToken; }
            var refreshToken = onDisk?.RefreshToken ?? _s?.RefreshToken;
            if (string.IsNullOrEmpty(refreshToken)) { Forget(); throw new SessionException("signed out — the stored session has no refresh token — Standards ▸ Sign in"); }
            // ponytail: no backoff — during an outage each call waits up to 8 s for Supabase; add one if B34 shows it hurts.
            var r = Token(supabaseUrl, anonKey, "refresh_token", JsonSerializer.Serialize(new { refresh_token = refreshToken }));
            if (r.Session is null)
            {
                if (r.Refused) { Forget(); throw new SessionException("signed out — Supabase refused the session (" + r.Error + ") — Standards ▸ Sign in"); }
                throw new SessionException(NotRefreshed + " (" + r.Error + ")"); // SI-1: memory and file kept; the next call retries
            }
            _s = r.Session; Save(_s);
            return _s.AccessToken;
        }
        finally { if (held) { try { mutex.ReleaseMutex(); } catch { /* not ours */ } } }
    }

    private static void Forget() { _s = null; try { File.Delete(SessionPath); } catch { /* gone */ } }

    private static long SecondsLeft(Stored s) => s.ExpiresAt - DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    // ── the Supabase auth call ────────────────────────────────────────────────────────────────────────────────
    private static (Stored? Session, string Error, bool Refused) Token(string supabaseUrl, string anonKey, string grant, string body)
    {
        try
        {
            using var msg = new HttpRequestMessage(HttpMethod.Post, supabaseUrl.TrimEnd('/') + "/auth/v1/token?grant_type=" + grant)
            { Content = new StringContent(body, Encoding.UTF8, "application/json") };
            msg.Headers.Add("apikey", anonKey);
            msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", anonKey);
            using var resp = Http.SendAsync(msg).GetAwaiter().GetResult();
            var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            // Refused only when Supabase said no (a 4xx); a 5xx, 408 or 429 is a failure to answer — the session is kept.
            var code = (int)resp.StatusCode;
            if (!resp.IsSuccessStatusCode) return (null, SupabaseWords(text, code), code >= 400 && code < 500 && code != 408 && code != 429);
            using var jd = JsonDocument.Parse(text);
            var root = jd.RootElement;
            var access = root.GetProperty("access_token").GetString() ?? "";
            var refresh = root.GetProperty("refresh_token").GetString() ?? "";
            var expiresIn = root.TryGetProperty("expires_in", out var e) ? e.GetInt64() : 3600;
            var email = root.TryGetProperty("user", out var u) && u.TryGetProperty("email", out var em) ? em.GetString() ?? "" : "";
            if (access.Length == 0 || refresh.Length == 0) return (null, "Supabase answered without tokens", false);
            return (new Stored { Email = email, AccessToken = access, RefreshToken = refresh, ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + expiresIn }, "", false);
        }
        catch (Exception ex) { return (null, "Supabase not reached: " + ex.Message, false); }
    }

    /// <summary>Supabase's own words: error_description, msg or error; else "HTTP n".</summary>
    private static string SupabaseWords(string text, int status)
    {
        try
        {
            using var jd = JsonDocument.Parse(text);
            foreach (var k in new[] { "error_description", "msg", "message", "error" })
                if (jd.RootElement.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } w) return w;
        }
        catch { /* not JSON */ }
        return "HTTP " + status;
    }

    // ── the DPAPI file ────────────────────────────────────────────────────────────────────────────────────────
    private static void LoadOnce() { if (_loaded) return; _s = Load(); _loaded = true; } // _s before _loaded: Email reads without the lock

    private static Stored? Load()
    {
        try
        {
            if (!File.Exists(SessionPath)) return null;
            var plain = ProtectedData.Unprotect(File.ReadAllBytes(SessionPath), null, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<Stored>(Encoding.UTF8.GetString(plain));
        }
        catch { return null; } // another user's file, a corrupt file: no session
    }

    private static void Save(Stored s)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SessionPath)!);
            var plain = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(s));
            File.WriteAllBytes(SessionPath, ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser));
        }
        catch { /* a session that could not be kept lasts this process only */ }
    }
}

/// <summary>SI-1: the signed-in session could not be used for this call — the refresh failed (the session is kept,
/// the next call retries) or Supabase refused it (signed out). The call is not sent: never under the PC's token.</summary>
public sealed class SessionException : Exception { public SessionException(string message) : base(message) { } }
