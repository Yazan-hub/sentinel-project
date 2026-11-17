@echo off
rem Starts the Sentinel keeper (tools\sentinel-keeper.ps1) every time you sign in to Windows, hidden, and starts it now.
rem It keeps the bridge, the outbox watcher and the Funnel up (docs/RELIABILITY.md). Undo with keeper-uninstall.cmd.
setlocal
set KEEPER=%~dp0sentinel-keeper.ps1
if not exist "%KEEPER%" (
  echo Cannot find %KEEPER% - run this file from the tools folder of the Sentinel repository.
  exit /b 1
)
schtasks /create /tn "Sentinel keeper" /sc onlogon /rl limited /f /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%KEEPER%\""
if errorlevel 1 (
  echo The scheduled task was not created. Copy the red text above to Claude.
  exit /b 1
)
schtasks /run /tn "Sentinel keeper"
echo.
echo The keeper runs now and at every sign-in. What it does is written to %APPDATA%\Sentinel\logs\keeper.log
echo Keep this PC from sleeping while others use Sentinel: Settings - System - Power - Sleep: Never (when plugged in).
pause
