using System;

namespace Sentinel.UI;

/// <summary>The one rule of the Live Coordination pane's layout that XAML cannot say: how tall the journey box may be.
/// No Revit dependency — tools/pane-layout-check compiles this file and lays the pane out with it.</summary>
public static class PaneLayout
{
    /// <summary>DIP kept below the journey for the score, the Doctor opened and a few rule rows (the review of the
    /// narrow-dock fix measured 520 for at least one whole row at 480 DIP high with the Doctor open).</summary>
    public const double KeepBelowJourney = 520;

    /// <summary>The journey box never shrinks below four lines.</summary>
    public const double JourneyMin = 60;

    /// <summary>The journey box's cap in a pane this tall: a tall dock shows the whole journey (as before the fix), a short
    /// one keeps the rule grid's rows and scrolls the journey.</summary>
    public static double JourneyCap(double paneHeight) => Math.Max(JourneyMin, paneHeight - KeepBelowJourney);
}
