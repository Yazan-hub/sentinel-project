@echo off
rem Stops the Sentinel keeper from starting at sign-in: removes the scheduled task and the Startup shortcut, whichever
rem keeper-install.cmd made. The bridge and the watcher it started keep running until you close them or restart the PC;
rem tools\bridge-start.cmd still works by hand.
schtasks /end /tn "Sentinel keeper" >nul 2>&1
schtasks /delete /tn "Sentinel keeper" /f >nul 2>&1
powershell.exe -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup') + '\Sentinel keeper.lnk'); Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" | Where-Object { $_.CommandLine -like '*sentinel-keeper.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo The keeper will no longer start at sign-in, and the running one was stopped.
pause
