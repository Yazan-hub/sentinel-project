@echo off
REM ============================================
REM  Sentinel - one-click build & install
REM  Requires: .NET SDK (winget install Microsoft.DotNet.SDK.8)
REM  Usage:  install.bat [RevitVersion]
REM     install.bat        -> builds & deploys for Revit 2026 (default)
REM     install.bat 2024   -> builds & deploys for Revit 2024
REM  Deploys to %AppData%\Autodesk\Revit\Addins\<version>\ automatically.
REM ============================================
cd /d "%~dp0"

set "REVIT_VERSION=%~1"
if "%REVIT_VERSION%"=="" set "REVIT_VERSION=2026"

where dotnet >nul 2>nul
if errorlevel 1 (
    echo [ERROR] .NET SDK not found. Install it with:
    echo    winget install Microsoft.DotNet.SDK.8
    pause & exit /b 1
)

echo Building Sentinel for Revit %REVIT_VERSION%...
dotnet build Sentinel.csproj -c Release -p:RevitVersion=%REVIT_VERSION% -p:DeployToRevit=true
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed - copy the errors above back to Claude.
    pause & exit /b 1
)

echo.
echo [OK] Sentinel built and deployed to %AppData%\Autodesk\Revit\Addins\%REVIT_VERSION%
echo Restart Revit, accept the add-in load prompt, and look for the "Sentinel" ribbon tab.
pause
