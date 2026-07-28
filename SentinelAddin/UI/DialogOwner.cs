using System;
using System.Windows;
using System.Windows.Interop;
using Autodesk.Revit.UI;
using Microsoft.Win32;

namespace Sentinel.UI;

/// <summary>
/// Anchors Sentinel WPF windows and Win32 file dialogs to Revit's main window so they open on
/// Revit's monitor, in front — instead of floating unowned (invisible on multi-monitor setups,
/// especially with a disabled primary display). Session C finding 7.
/// </summary>
public static class DialogOwner
{
    public static void Attach(Window w, ExternalCommandData c) => Attach(w, c.Application.MainWindowHandle);

    public static void Attach(Window w, UIApplication app) => Attach(w, app.MainWindowHandle);

    public static void Attach(Window w, IntPtr ownerHandle)
    {
        if (ownerHandle == IntPtr.Zero) return;
        new WindowInteropHelper(w) { Owner = ownerHandle };
        w.WindowStartupLocation = WindowStartupLocation.CenterOwner;
    }

    /// <summary>
    /// Shows a Microsoft.Win32 file dialog owned by Revit's main window. FileDialog.ShowDialog(Window)
    /// needs a WPF Window, not an HWND, so a zero-size invisible anchor window is created, parented to
    /// Revit via WindowInteropHelper, and closed immediately after.
    /// </summary>
    public static bool? ShowFileDialog(CommonDialog d, UIApplication app)
    {
        var handle = app.MainWindowHandle;
        if (handle == IntPtr.Zero) return d.ShowDialog();

        var anchor = new Window
        {
            Width = 0,
            Height = 0,
            WindowStyle = WindowStyle.None,
            ShowInTaskbar = false,
            ShowActivated = false,
            AllowsTransparency = true,
            Opacity = 0,
        };
        new WindowInteropHelper(anchor) { Owner = handle };
        try
        {
            anchor.Show();
            return d.ShowDialog(anchor);
        }
        finally
        {
            anchor.Close();
        }
    }
}
