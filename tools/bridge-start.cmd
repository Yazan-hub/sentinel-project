@echo off
rem Starts the Sentinel bridge on this PC in its own window, and then refreshes the Tailscale Funnel so the published
rem app can reach it again. If a bridge already answers on port 4100 it asks whether to restart it: a running bridge
rem keeps the code it was started with, so new code needs a restart (Y stops that bridge, whichever window runs it,
rem and starts a fresh one; N, or no answer in 30 seconds, leaves it running).
rem The published app and Revit reach the bridge through the Funnel address; closing the bridge's window stops the bridge.
rem To have it start at every sign-in: put a shortcut to this file in the Startup folder (Win+R, shell:startup).
rem Why the refresh: after a bridge restart Tailscale's public relay has twice kept refusing the secure connection
rem ("Can't reach the bridge" in the app) until the Funnel was switched off and on (2026-09-28, 2026-10-02). The refresh
rem only re-registers the Funnel for port 4100; it leaves MagicDNS (accept-dns) as public-bridge-on.cmd set it.
setlocal
set PORT=4100
set HEALTH=%TEMP%\sentinel-bridge-health.txt
call :health
if not "%CODE%"=="200" goto start
echo The Sentinel bridge is already running on port %PORT%. It still runs the code it was started with.
choice /c YN /n /t 30 /d N /m "Restart it now to load new code? Y = restart, N = leave it running (N after 30 seconds): "
if errorlevel 2 goto funnel
call :stopbridge
if errorlevel 1 exit /b 1

:start
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
echo Refreshing the Tailscale Funnel for the bridge (port %PORT%)...
call tailscale funnel reset
call tailscale funnel --bg %PORT%
if errorlevel 1 (
  echo The Funnel did not come back on. Run tools\public-bridge-on.cmd and copy any red text to Claude.
  exit /b 1
)
call tailscale funnel status
echo The bridge is up and the Funnel is refreshed. If the app still says "Can't reach the bridge", close Chrome fully and reopen it.
exit /b 0

:nobridge
echo The bridge did not answer on port %PORT% within a minute - the Funnel was not touched. Look at the "Sentinel bridge" window.
exit /b 1

rem Stops the process that listens on the port (the bridge may run in any window: the 2026-10-02 one was a terminal tab
rem named "npm run bcf:serve", not "Sentinel bridge"), then waits until the port stops answering.
:stopbridge
set BPID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set BPID=%%p
if not defined BPID (
  echo Could not find the process that listens on port %PORT% - nothing was stopped. Close the bridge's window by hand, then run this file again.
  exit /b 1
)
echo Stopping the running bridge (process %BPID%)...
taskkill /pid %BPID% /f >nul
set TRIES=0
:stopwait
set /a TRIES+=1
call :health
if not "%CODE%"=="200" exit /b 0
if %TRIES% GEQ 10 (
  echo The old bridge still answers on port %PORT% - nothing was started. Close its window by hand, then run this file again.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto stopwait

:health
curl -s -o nul -w "%%{http_code}" --max-time 3 http://127.0.0.1:%PORT%/health > "%HEALTH%" 2>nul
set CODE=
set /p CODE=<"%HEALTH%"
exit /b 0
