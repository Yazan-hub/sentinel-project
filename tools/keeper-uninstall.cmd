@echo off
rem Stops the Sentinel keeper and stops it from starting at sign-in. The bridge and the watcher it started keep running
rem until you close them or restart the PC; tools\bridge-start.cmd still works by hand.
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Sentinel keeper" /f >nul 2>&1
rem An install from before 2026-11-17 made a scheduled task instead; remove it too if it is there.
schtasks /delete /tn "Sentinel keeper" /f >nul 2>&1
rem A Startup-folder shortcut was used for a while on 2026-11-17; remove it too if it is there.
powershell.exe -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup') + '\Sentinel keeper.lnk')"
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | Where-Object { $_.CommandLine -like '*sentinel-keeper.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo The keeper is stopped and will no longer start at sign-in.
pause
