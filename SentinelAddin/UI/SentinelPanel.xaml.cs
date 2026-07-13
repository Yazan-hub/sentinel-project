using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
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

    private void OnFixClick(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.DataContext is ViolationRow row)
            _vm.RequestFix(row);
    }
}
