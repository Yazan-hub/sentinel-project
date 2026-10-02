@echo off
rem Starts the Sentinel bridge on this PC in its own window - unless one already answers on port 4100 - and then
rem refreshes the Tailscale Funnel so the published app can reach it again.
rem The published app and Revit reach the bridge through the Funnel address; closing that window stops the bridge.
rem To have it start at every sign-in: put a shortcut to this file in the Startup folder (Win+R, shell:startup).
rem Why the refresh: after a bridge restart Tailscale's public relay has twice kept refusing the secure connection
rem ("Can't reach the bridge" in the app) until the Funnel was switched off and on (2026-09-28, 2026-10-02). The refresh
rem only re-registers the Funnel for port 4100; it leaves MagicDNS (accept-dns) as public-bridge-on.cmd set it.
setlocal
set HEALTH=%TEMP%\sentinel-bridge-health.txt
call :health
if "%CODE%"=="200" (
  echo The Sentinel bridge is already running on port 4100 - nothing started.
  goto funnel
)
cd /d "%~dp0..\WebApp"
start "Sentinel bridge" cmd /k npm run bcf:serve
echo The Sentinel bridge is starting in its own window ("Sentinel bridge").

rem Wait up to about a minute for it to answer before refreshing the Funnel.
set TRIES=0
:wait
set /a TRIES+=1
call :health
if "%CODE%"=="200" goto funnel
if %TRIES% GEQ 30 goto nobridge
timeout /t 2 /nobreak >nul
goto wait

:funnel
echo.
echo Refreshing the Tailscale Funnel for the bridge (port 4100)...
call tailscale funnel reset
call tailscale funnel --bg 4100
if errorlevel 1 (
  echo The Funnel did not come back on. Run tools\public-bridge-on.cmd and copy any red text to Claude.
  exit /b 1
)
call tailscale funnel status
echo The bridge is up and the Funnel is refreshed. If the app still says "Can't reach the bridge", close Chrome fully and reopen it.
exit /b 0

:nobridge
echo The bridge did not answer on port 4100 within a minute - the Funnel was not touched. Look at the "Sentinel bridge" window.
exit /b 1

:health
curl -s -o nul -w "%%{http_code}" --max-time 3 http://127.0.0.1:4100/health > "%HEALTH%" 2>nul
set CODE=
set /p CODE=<"%HEALTH%"
exit /b 0
