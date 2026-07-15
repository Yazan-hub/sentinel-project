@echo off
REM ============================================================
REM  Registers the Sentinel Bridge watcher to start on login by
REM  dropping a (minimized) shortcut to start-watch.cmd into the
REM  current user's Startup folder. Run once. To DISABLE, delete
REM  "Sentinel Bridge Watcher.lnk" from that Startup folder.
REM ============================================================
set "TARGET=%~dp0start-watch.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $sp=[Environment]::GetFolderPath('Startup'); $l=$w.CreateShortcut((Join-Path $sp 'Sentinel Bridge Watcher.lnk')); $l.TargetPath='%TARGET%'; $l.WorkingDirectory='%~dp0..'; $l.WindowStyle=7; $l.Description='Sentinel Bridge outbox watcher'; $l.Save(); Write-Host ('Installed: ' + (Join-Path $sp 'Sentinel Bridge Watcher.lnk'))"
echo.
echo To disable autostart later, delete the shortcut shown above.
pause
