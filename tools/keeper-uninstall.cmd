@echo off
rem Stops the Sentinel keeper from starting at sign-in. The bridge and the watcher it started keep running until you
rem close them or restart the PC; tools\bridge-start.cmd still works by hand.
schtasks /end /tn "Sentinel keeper" >nul 2>&1
schtasks /delete /tn "Sentinel keeper" /f
echo The keeper will no longer start at sign-in.
pause
