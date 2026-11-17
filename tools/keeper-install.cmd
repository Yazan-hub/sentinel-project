@echo off
rem Starts the Sentinel keeper (tools\sentinel-keeper.ps1) every time you sign in to Windows, hidden, and starts it now.
rem It keeps the bridge, the outbox watcher and the Funnel up (docs/RELIABILITY.md). Undo with keeper-uninstall.cmd.
rem The sign-in start is this account's Run entry, which needs no administrator: a scheduled task "at log on" is refused
rem without one ("ERROR: Access is denied", 2026-11-17). The keeper runs one copy at a time, so starting it twice is safe.
setlocal
set KEEPER=%~dp0sentinel-keeper.ps1
if not exist "%KEEPER%" (
  echo Cannot find %KEEPER% - run this file from the tools folder of the Sentinel repository.
  exit /b 1
)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Sentinel keeper" /t REG_SZ /f /d "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%KEEPER%\""
if errorlevel 1 (
  echo The keeper was not set to start at sign-in. Copy the red text above to Claude.
  exit /b 1
)
start "Sentinel keeper" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%KEEPER%"
echo.
echo The keeper runs now and at every sign-in. What it does is written to %APPDATA%\Sentinel\logs\keeper.log
echo Keep this PC from sleeping while others use Sentinel: Settings - System - Power - Sleep: Never (when plugged in).
pause
