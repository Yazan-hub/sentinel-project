@echo off
rem Starts the Sentinel bridge on this PC in its own window - unless one already answers on port 4100.
rem The published app and Revit reach it through the Funnel address; closing that window stops the bridge.
rem To have it start at every sign-in: put a shortcut to this file in the Startup folder (Win+R, shell:startup).
curl -s -o nul -w "%%{http_code}" --max-time 3 http://127.0.0.1:4100/health > "%TEMP%\sentinel-bridge-health.txt" 2>nul
set CODE=
set /p CODE=<"%TEMP%\sentinel-bridge-health.txt"
if "%CODE%"=="200" (
  echo The Sentinel bridge is already running on port 4100 - nothing started.
  exit /b 0
)
cd /d "%~dp0..\WebApp"
start "Sentinel bridge" cmd /k npm run bcf:serve
echo The Sentinel bridge is starting in its own window ("Sentinel bridge").
