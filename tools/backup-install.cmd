@echo off
rem Runs tools\sentinel-backup.ps1 every day at 21:10, and once now. Undo with:
rem   schtasks /delete /tn "Sentinel backup" /f
rem The backup goes to %USERPROFILE%\SentinelBackups. A folder that OneDrive or an external drive syncs is better:
rem edit the task's -Destination after it is created (Task Scheduler > Sentinel backup > Actions), or run the script
rem by hand with -Destination "D:\SentinelBackups". docs/RELIABILITY.md.
setlocal
set BACKUP=%~dp0sentinel-backup.ps1
if not exist "%BACKUP%" (
  echo Cannot find %BACKUP% - run this file from the tools folder of the Sentinel repository.
  exit /b 1
)
schtasks /create /tn "Sentinel backup" /sc daily /st 21:10 /rl limited /f /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%BACKUP%\""
if errorlevel 1 (
  echo The scheduled task was not created. Copy the red text above to Claude.
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BACKUP%"
echo.
echo The backup ran once now and will run every day at 21:10. Its log: %USERPROFILE%\SentinelBackups\backup.log
pause
