using System.Net;
using System.Text;
using System.Text.Json;
using Sentinel.Commands;
using Sentinel.Coordination;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    // ── a throwaway Supabase auth on loopback ────────────────────────────────────────────────────────────────
    static HttpListener _auth = null!;
    static string _url = "";
    const string Anon = "anon-key-for-the-check";
    static int _expiresIn = 3600;
    static int _passwordCalls, _refreshCalls, _refusedRefreshes;
    static readonly HashSet<string> _spent = new();      // refresh tokens already used (single-use)
    static readonly HashSet<string> _live = new();       // refresh tokens that are currently valid
    static int _serial;
    static bool _refuseAll;

    static void StartAuth()
    {
        var port = new Random().Next(42000, 43000);
        _url = $"http://127.0.0.1:{port}/";
        _auth = new HttpListener(); _auth.Prefixes.Add(_url); _auth.Start();
        _ = Task.Run(async () =>
        {
            while (_auth.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await _auth.GetContextAsync(); } catch { break; }
                _ = Task.Run(() => Handle(ctx));
            }
        });
    }

    static void Handle(HttpListenerContext ctx)
    {
        var req = ctx.Request; var res = ctx.Response;
        string body; using (var r = new StreamReader(req.InputStream)) body = r.ReadToEnd();
        var grant = req.QueryString["grant_type"];
        string answer; int status = 200;
        if (req.Headers["apikey"] != Anon) { status = 401; answer = "{\"message\":\"No API key found in request\"}"; }
        else if (_refuseAll) { status = 400; answer = "{\"error\":\"invalid_grant\",\"error_description\":\"Invalid Refresh Token: Already Used\"}"; }
        else if (grant == "password")
        {
            Interlocked.Increment(ref _passwordCalls);
            using var jd = JsonDocument.Parse(body);
            var email = jd.RootElement.GetProperty("email").GetString(); var pw = jd.RootElement.GetProperty("password").GetString();
            if (email == "lead@office.example" && pw == "correct horse") { answer = Issue(email); }
            else { status = 400; answer = "{\"error\":\"invalid_grant\",\"error_description\":\"Invalid login credentials\"}"; }
        }
        else if (grant == "refresh_token")
        {
            Interlocked.Increment(ref _refreshCalls);
            using var jd = JsonDocument.Parse(body);
            var rt = jd.RootElement.GetProperty("refresh_token").GetString() ?? "";
            lock (_spent)
            {
                if (_spent.Contains(rt) || !_live.Contains(rt)) { Interlocked.Increment(ref _refusedRefreshes); status = 400; answer = "{\"error\":\"invalid_grant\",\"error_description\":\"Invalid Refresh Token: Already Used\"}"; }
                else { _spent.Add(rt); _live.Remove(rt); answer = Issue("lead@office.example"); }
            }
        }
        else { status = 400; answer = "{\"error\":\"unsupported_grant_type\"}"; }
        var bytes = Encoding.UTF8.GetBytes(answer);
        res.StatusCode = status; res.ContentType = "application/json"; res.ContentLength64 = bytes.Length;
        res.OutputStream.Write(bytes, 0, bytes.Length); res.Close();
    }

    static string Issue(string? email)
    {
        var n = Interlocked.Increment(ref _serial);
        var rt = "refresh-" + n; lock (_spent) _live.Add(rt);
        return JsonSerializer.Serialize(new { access_token = "access-" + n, refresh_token = rt, expires_in = _expiresIn, token_type = "bearer", user = new { email } });
    }

    static int Main()
    {
        Console.WriteLine("UserSession + BcfConfig.ServiceToken — the signed-in person's token in every Revit call (H4)\n");
        var file = Path.Combine(Path.GetTempPath(), "sentinel-session-check-" + Guid.NewGuid().ToString("N") + ".bin");
        Environment.SetEnvironmentVariable("SENTINEL_SESSION_FILE", file);
        StartAuth();
        try
        {
            SignInAndFile(file);
            ReuseThenRefresh();
            TwoRefreshesSpendOne(file);
            RefusedRefreshSignsOut(file);
            ConfigPrefersSession(file);
            Parse();
        }
        finally { try { _auth.Stop(); } catch { } try { File.Delete(file); } catch { } }
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. sign in: refusal in Supabase's words, success stores a file only this user can read ─────────────
    static void SignInAndFile(string file)
    {
        var bad = UserSession.SignIn(_url, Anon, "lead@office.example", "wrong");
        Ok(!bad.Ok && bad.Message == "Invalid login credentials", "a wrong password is refused in Supabase's words: " + bad.Message);
        Ok(!UserSession.IsSignedIn && !File.Exists(file), "a refused sign-in leaves no session and no file");
        var none = UserSession.SignIn("", "", "a@b", "x");
        Ok(!none.Ok && none.Message.Contains("supabaseUrl"), "no Supabase address: refused in words, no call made");
        var ok = UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        Ok(ok.Ok && ok.Message == "Signed in as lead@office.example", "the right password signs in: " + ok.Message);
        Ok(UserSession.Email == "lead@office.example", "Email names the person");
        Ok(File.Exists(file), "the session file exists");
        var raw = File.ReadAllBytes(file);
        Ok(!Encoding.UTF8.GetString(raw).Contains("refresh-") && !Encoding.UTF8.GetString(raw).Contains("access-"), "the file holds no plain token (DPAPI)");
        Ok(UserSession.AccessToken(_url, Anon) == "access-1", "AccessToken hands out the fresh token");
    }

    // ── 2. the token is reused until it nears expiry, then refreshed once ───────────────────────────────────
    static void ReuseThenRefresh()
    {
        int before = _refreshCalls;
        for (int i = 0; i < 5; i++) UserSession.AccessToken(_url, Anon);
        Ok(_refreshCalls == before, "a token with an hour left is reused, no refresh call");
        _expiresIn = 30; // the next issued token is already 'nearly expired'
        UserSession.SignOut();
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse"); // issues access-2 with 30 s left
        var t = UserSession.AccessToken(_url, Anon);
        Ok(t == "access-3" && _refreshCalls == before + 1, "a token with under a minute left is refreshed once: " + t);
        _expiresIn = 3600;
    }

    // ── 3. two Revit versions refreshing at once spend one refresh token ────────────────────────────────────
    static void TwoRefreshesSpendOne(string file)
    {
        _expiresIn = 30;
        UserSession.SignOut();
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        _expiresIn = 3600;
        int refreshesBefore = _refreshCalls, refusedBefore = _refusedRefreshes;
        // The second "Revit" is this same process after the in-memory session is thrown away: it re-reads the file
        // under the mutex and adopts the tokens the first refresh wrote instead of spending the old refresh token.
        var first = UserSession.AccessToken(_url, Anon);
        ForgetMemoryOnly();
        var second = UserSession.AccessToken(_url, Anon);
        Ok(first is not null && second == first, "the second instance adopts the first's refreshed tokens from the file: " + second);
        Ok(_refreshCalls == refreshesBefore + 1 && _refusedRefreshes == refusedBefore, "one refresh call, none refused");
    }

    static void ForgetMemoryOnly()
    {
        // Simulate another process: reset the private in-memory state through reflection, keep the file.
        var t = typeof(UserSession);
        t.GetField("_s", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.SetValue(null, null);
        t.GetField("_loaded", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.SetValue(null, false);
    }

    // ── 4. a refused refresh signs out; sign-out deletes the file ───────────────────────────────────────────
    static void RefusedRefreshSignsOut(string file)
    {
        _expiresIn = 30;
        UserSession.SignOut();
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        _expiresIn = 3600;
        _refuseAll = true;
        var t = UserSession.AccessToken(_url, Anon);
        _refuseAll = false;
        Ok(t is null && !UserSession.IsSignedIn && !File.Exists(file), "a refresh Supabase refuses signs the person out and deletes the file");
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        Ok(UserSession.IsSignedIn && File.Exists(file), "signed in again");
        UserSession.SignOut();
        Ok(!UserSession.IsSignedIn && !File.Exists(file) && UserSession.Email is null, "sign-out forgets the session and deletes the file");
    }

    // ── 5. BcfConfig.ServiceToken: the session first, the file's shared token otherwise ──────────────────────
    static void ConfigPrefersSession(string file)
    {
        var cfg = BcfConfig.Parse("{\"serviceUrl\":\"http://localhost:4100\",\"serviceToken\":\"shared-machine-token\",\"supabaseUrl\":\"" + _url.TrimEnd('/') + "\",\"supabaseAnonKey\":\"" + Anon + "\"}");
        Ok(cfg.ServiceToken == "shared-machine-token", "signed out: the file's shared token is sent");
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        Ok(cfg.ServiceToken.StartsWith("access-"), "signed in: the person's access token is sent instead: " + cfg.ServiceToken);
        var external = BcfConfig.Parse("{\"serviceUrl\":\"http://localhost:4100\",\"supabaseUrl\":\"" + _url.TrimEnd('/') + "\",\"supabaseAnonKey\":\"" + Anon + "\"}");
        Ok(external.ServiceToken.StartsWith("access-"), "an install with no shared token sends the person's token when signed in");
        UserSession.SignOut();
        Ok(external.ServiceToken == "", "…and no header at all when signed out (the bridge answers 401 → 'signed out')");
        var noAddress = BcfConfig.Parse("{\"serviceUrl\":\"http://localhost:4100\",\"serviceToken\":\"shared-machine-token\"}");
        UserSession.SignIn(_url, Anon, "lead@office.example", "correct horse");
        Ok(noAddress.ServiceToken == "shared-machine-token", "a config without a Supabase address never uses a session (the check tools' case)");
        UserSession.SignOut();
    }

    // ── 6. the two new fields parse; the legacy file still parses ───────────────────────────────────────────
    static void Parse()
    {
        var cfg = BcfConfig.Parse("{\"serviceUrl\":\"http://x\",\"projectId\":\"legacy\",\"serviceToken\":\"t\",\"supabaseUrl\":\"https://p.supabase.co\",\"supabaseAnonKey\":\"k\"}");
        Ok(cfg.SupabaseUrl == "https://p.supabase.co" && cfg.SupabaseAnonKey == "k" && cfg.FileToken == "t", "supabaseUrl and supabaseAnonKey parse beside the legacy fields");
        var legacy = BcfConfig.Parse("{\"serviceUrl\":\"http://x\",\"serviceToken\":\"t\"}");
        Ok(legacy.SupabaseUrl == "" && legacy.ServiceToken == "t", "a file without them parses and keeps the shared token");
    }
}
