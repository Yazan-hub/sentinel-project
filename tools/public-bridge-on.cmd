@echo off
rem Puts the Sentinel bridge (localhost:4100) on the internet so the PUBLISHED Sentinel app can reach it.
rem The That Open platform runs published apps in a sandbox that Chrome blocks from private addresses
rem (docs: memory note thatopen-sandbox-2026-09-24). Every bridge route except /health still needs a
rem Sentinel sign-in or the Revit token. Undo with public-bridge-off.cmd.

echo.
echo [1/3] Putting the bridge on the internet (Tailscale Funnel, port 4100)...
tailscale funnel --bg 4100
if errorlevel 1 goto failed

echo.
echo [2/3] Making this PC look up the bridge address publicly (not through Tailscale MagicDNS)...
tailscale set --accept-dns=false
if errorlevel 1 goto failed

echo.
echo [3/3] Result:
tailscale funnel status
echo.
echo Done. Go back to Claude and say: bridge is public
pause
exit /b 0

:failed
echo.
echo Something failed above. If Tailscale printed a link, open it, click Enable, then run this file again.
echo Otherwise copy the red text to Claude.
pause
exit /b 1
