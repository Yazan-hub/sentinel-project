@echo off
rem Starts the Sentinel keeper (tools\sentinel-keeper.ps1) every time you sign in to Windows, hidden, and starts it now.
rem It keeps the bridge, the outbox watcher and the Funnel up (docs/RELIABILITY.md). Undo with keeper-uninstall.cmd.
rem A scheduled task "at sign-in" needs an administrator terminal (2026-11-17: "ERROR: Access is denied." otherwise).
rem Without one, the keeper is put in your Startup folder instead, which needs no administrator.
setlocal
set KEEPER=%~dp0sentinel-keeper.ps1
set ARGS=-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%KEEPER%"
if not exist "%KEEPER%" (
  echo Cannot find %KEEPER% - run this file from the tools folder of the Sentinel repository.
  exit /b 1
)
schtasks /create /tn "Sentinel keeper" /sc onlogon /rl limited /f /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%KEEPER%\"" >nul 2>&1
if errorlevel 1 goto startup
schtasks /run /tn "Sentinel keeper" >nul
echo The keeper is a scheduled task "Sentinel keeper": it runs now and at every sign-in.
goto done

:startup
echo No administrator rights for a scheduled task - putting the keeper in your Startup folder instead.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s = New-Object -ComObject WScript.Shell; $l = $s.CreateShortcut([Environment]::GetFolderPath('Startup') + '\Sentinel keeper.lnk'); $l.TargetPath = 'powershell.exe'; $l.Arguments = $env:ARGS; $l.WindowStyle = 7; $l.Save()"
if errorlevel 1 (
  echo The Startup shortcut was not created. Copy the red text above to Claude.
  exit /b 1
)
start "" /min powershell.exe %ARGS%
echo The keeper is in your Startup folder ("Sentinel keeper"): it runs now and at every sign-in.

:done
echo What it does is written to %APPDATA%\Sentinel\logs\keeper.log
echo Keep this PC from sleeping while others use Sentinel: Settings - System - Power - Sleep: Never (when plugged in).
pause
