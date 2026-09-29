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
    private readonly string? _org;   // the document's office code: {org} in a token def resolves to it, as in the scanner

    public string? FinalName { get; private set; }

    public FixReviewDialog(string elementName, string ruleId, Rule? rule, string? org, string suggestion)
    {
        _rule = rule;   // the rule that judged the row, from the document's own ruleset
        _org = org;
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
        string? why = null;
        bool ok = text.Length > 0 && Matches(text, out why);
        ExecuteBtn.IsEnabled = ok;
        ValidityText.Text = ok ? "✓ Matches the naming schema"
                               : why is not null ? "✕ " + why : "✕ Does not match the token pattern yet";
        ValidityText.Foreground = new System.Windows.Media.SolidColorBrush(
            ok ? System.Windows.Media.Color.FromRgb(0x2E, 0x7D, 0x4F)
               : System.Windows.Media.Color.FromRgb(0xB3, 0x35, 0x2F));
    }

    // The scanner's own pattern, with the document's office code. The dialog used its own copy without {org} and
    // refused names the scanner accepts, and passed anything when a def was malformed (audit BG-5).
    private bool Matches(string text, out string? why)
    {
        why = null;
        return _rule is null || RuleRegex.Matches(_rule, _org, text, out why);
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
