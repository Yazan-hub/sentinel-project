using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using Autodesk.Revit.UI;

namespace Sentinel.UI;

public partial class SentinelPanel : UserControl, IDockablePaneProvider
{
    private readonly SentinelPanelViewModel _vm;

    public SentinelPanel(SentinelPanelViewModel vm)
    {
        _vm = vm;
        DataContext = vm;
        InitializeComponent();
        // Revit resizes the pane with its dock: the journey gets what the score, the Doctor and the rule rows do not need
        SizeChanged += (_, e) => Journey.MaxHeight = PaneLayout.JourneyCap(e.NewSize.Height);
    }

    public void SetupDockablePane(DockablePaneProviderData data)
    {
        data.FrameworkElement = this;
        data.InitialState = new DockablePaneState
        {
            DockPosition = DockPosition.Right,
        };
    }

    private void OnRowDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (Grid.SelectedItem is ViolationRow row) _vm.RequestSelect(row);
    }

    /// ↻ on the Next strip: the key and the ruleset are read on the Revit API thread through the same
    /// ExternalEvent hub Select uses; the GET itself runs off-thread inside RefreshJourney.
    private void OnJourneyRefreshClick(object sender, RoutedEventArgs e)
        => App.Events?.Enqueue(uiapp => App.RefreshJourney(uiapp.ActiveUIDocument?.Document));

    private void OnFixClick(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is ViolationRow row)
        {
            // Dockable panes are hosted inside Revit's main window's own HWND tree — grab that
            // handle so the review dialog opens owned (Session C finding 7: unowned dialogs go
            // invisible on multi-monitor setups).
            var owner = (PresentationSource.FromVisual(this) as HwndSource)?.Handle ?? System.IntPtr.Zero;
            _vm.RequestFix(row, owner);
        }
    }
}
