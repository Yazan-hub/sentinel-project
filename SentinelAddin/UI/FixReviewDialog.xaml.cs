using System.Text.RegularExpressions;
using System.Windows;
using Sentinel.Engine;

namespace Sentinel.UI;

/// <summary>
/// Human-in-the-loop gate for the Auto-Remediator: shows the current value and
/// an editable synthesized suggestion, live-validates the edit against the
/// rule's token schema, and only then routes to AutoFixExecution.
/// </summary>
public partial class FixReviewDialog : Window
{
    private readonly Rule? _rule;

    public string? FinalName { get; private set; }

    public FixReviewDialog(string elementName, string ruleId, string suggestion)
    {
        _rule = App.Engine?.Ruleset.Rules.FirstOrDefault(r => r.Id == ruleId);
        InitializeComponent();
        HeaderText.Text = "Review fix for '" + elementName + "'";
        RuleText.Text = _rule is null ? ruleId
            : ruleId + " · " + (_rule.DocRef ?? "") + " · pattern: " +
              string.Join(_rule.Separator, _rule.Tokens.Select(t => "[" + t + "]"));
        CurrentBox.Text = elementName;
        ProposedBox.Text = suggestion;
        Validate();
    }

    private void OnProposedChanged(object sender, RoutedEventArgs e) => Validate();

    private void Validate()
    {
        if (ExecuteBtn is null) return; // during InitializeComponent
        var text = ProposedBox.Text?.Trim() ?? "";
        bool ok = text.Length > 0 && Matches(text);
        ExecuteBtn.IsEnabled = ok;
        ValidityText.Text = ok ? "✓ Matches the naming schema"
                               : "✕ Does not match the token pattern yet";
        ValidityText.Foreground = new System.Windows.Media.SolidColorBrush(
            ok ? System.Windows.Media.Color.FromRgb(0x2E, 0x7D, 0x4F)
               : System.Windows.Media.Color.FromRgb(0xB3, 0x35, 0x2F));
    }

    private bool Matches(string text)
    {
        if (_rule is null || _rule.Tokens.Count == 0) return true;
        var parts = _rule.Tokens.Select(t =>
            _rule.TokenDefs.TryGetValue(t, out var def) ? "(?:" + def + ")" : @"[A-Za-z0-9\-]+");
        var pattern = "^" + string.Join(Regex.Escape(_rule.Separator), parts) + "$";
        try { return Regex.IsMatch(text, pattern); }
        catch (ArgumentException) { return true; } // malformed def: don't block the human
    }

    private void OnExecute(object sender, RoutedEventArgs e)
    {
        FinalName = ProposedBox.Text.Trim();
        DialogResult = true;
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
