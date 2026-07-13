@echo off
REM ============================================
REM  Sentinel - one-click build & install
REM  Requires: .NET 8 SDK (winget install Microsoft.DotNet.SDK.8)
REM  Builds the add-in and deploys it to
REM  %AppData%\Autodesk\Revit\Addins\2026 automatically.
REM ============================================
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [ERROR] .NET SDK not found. Install it with:
    echo    winget install Microsoft.DotNet.SDK.8
    pause & exit /b 1
)

echo Building Sentinel...
dotnet build Sentinel.csproj -c Release
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed - copy the errors above back to Claude.
    pause & exit /b 1
)

echo.
echo [OK] Sentinel built and deployed to %AppData%\Autodesk\Revit\Addins\2026
echo Restart Revit, accept the add-in load prompt, and look for the "Sentinel" ribbon tab.
pause
