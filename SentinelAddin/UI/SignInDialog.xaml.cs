using System.Windows;
using System.Windows.Input;
using Sentinel.Commands;
using Sentinel.Coordination;

namespace Sentinel.UI;

/// <summary>
/// Sign in to Sentinel from Revit (H4, spec 2026-09-28 Decision 5): e-mail + password → a Supabase session that every
/// governed call then sends instead of the machine token (BcfConfig.ServiceToken). The password is handed to
/// UserSession once and never kept. Sign out forgets the session on this PC only. The Supabase address comes from
/// bcf-config.json (supabaseUrl, supabaseAnonKey); without it the dialog says so instead of trying.
/// </summary>
public partial class SignInDialog : Window
{
    private readonly BcfConfig _cfg = BcfConfig.Load();

    public SignInDialog()
    {
        InitializeComponent();
        Refresh(null);
        if (string.IsNullOrWhiteSpace(_cfg.SupabaseUrl) || string.IsNullOrWhiteSpace(_cfg.SupabaseAnonKey))
        {
            StatusText.Text = "No sign-in address and key on this PC — set them in Sentinel ▸ More ▸ PC Settings, then sign in.";
            SignInButton.IsEnabled = false;
        }
        WhereText.Text = string.IsNullOrWhiteSpace(_cfg.SupabaseUrl) ? "" : "Signs in at " + _cfg.SupabaseUrl + " · Sentinel service " + _cfg.ServiceUrl;
        if (_cfg.Refusal is { } refused) StatusText.Text = refused; // SEC-3: the service address no token is sent to
    }

    private void Refresh(string? status)
    {
        var who = UserSession.Email;
        WhoText.Text = who is null
            ? (string.IsNullOrWhiteSpace(_cfg.FileToken)
                ? "Signed out — Revit cannot send anything to Sentinel until you sign in."
                : "Signed out — this PC's shared access is used, and History records \"" + UserSession.Actor + "\", not you.")
            : "Signed in as " + who + " — History records your e-mail.";
        Form.Visibility = who is null ? Visibility.Visible : Visibility.Collapsed;
        SignInButton.Visibility = who is null ? Visibility.Visible : Visibility.Collapsed;
        SignOutButton.Visibility = who is null ? Visibility.Collapsed : Visibility.Visible;
        StatusText.Text = status ?? "";
    }

    private void OnSignIn(object sender, RoutedEventArgs e)
    {
        var email = EmailBox.Text.Trim();
        var password = PasswordBox.Password;
        if (email.Length == 0 || password.Length == 0) { StatusText.Text = "E-mail and password, please."; return; }
        SignInButton.IsEnabled = false;
        StatusText.Text = "Signing in…";
        var (ok, message) = UserSession.SignIn(_cfg.SupabaseUrl, _cfg.SupabaseAnonKey, email, password); // blocking, ≤ 8 s
        PasswordBox.Password = "";
        SignInButton.IsEnabled = true;
        Refresh(ok ? null : message);
    }

    private void OnSignOut(object sender, RoutedEventArgs e) { UserSession.SignOut(); Refresh(null); }
    private void OnClose(object sender, RoutedEventArgs e) => Close();
    private void OnPasswordKeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) OnSignIn(sender, e); }
}
