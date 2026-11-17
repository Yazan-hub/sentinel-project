@echo off
rem Starts the Sentinel keeper (tools\sentinel-keeper.ps1) every time you sign in to Windows, hidden, and starts it now.
rem It keeps the bridge, the outbox watcher and the Funnel up (docs/RELIABILITY.md). Undo with keeper-uninstall.cmd.
rem It uses a shortcut in your Startup folder, which needs no administrator. A scheduled task "at sign-in" was tried
rem first and dropped: Windows refuses it without an administrator terminal (2026-11-17, "Access is denied").
setlocal
set KEEPER=%~dp0sentinel-keeper.ps1
set ARGS=-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%KEEPER%"
if not exist "%KEEPER%" (
  echo Cannot find %KEEPER% - run this file from the tools folder of the Sentinel repository.
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s = New-Object -ComObject WScript.Shell; $l = $s.CreateShortcut([Environment]::GetFolderPath('Startup') + '\Sentinel keeper.lnk'); $l.TargetPath = 'powershell.exe'; $l.Arguments = $env:ARGS; $l.WindowStyle = 7; $l.Save()"
if errorlevel 1 (
  echo The Startup shortcut was not created. Copy the red text above to Claude.
  exit /b 1
)
start "" /min powershell.exe %ARGS%
echo The keeper is in your Startup folder ("Sentinel keeper"): it runs now and at every sign-in.
echo What it does is written to %APPDATA%\Sentinel\logs\keeper.log
echo Keep this PC from sleeping while others use Sentinel: Settings - System - Power - Sleep: Never (when plugged in).
pause
