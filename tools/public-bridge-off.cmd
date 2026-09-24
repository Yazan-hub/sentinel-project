@echo off
rem Undo public-bridge-on.cmd: the bridge goes back to tailnet-only and this PC uses Tailscale MagicDNS again.
rem The published Sentinel app can then no longer reach the bridge (the local-app copy still can).

echo.
echo [1/3] Taking the bridge off the internet...
tailscale funnel reset
echo.
echo [2/3] Sharing it on the tailnet only, as before...
tailscale serve --bg 4100
echo.
echo [3/3] Turning Tailscale MagicDNS back on for this PC...
tailscale set --accept-dns=true
echo.
tailscale serve status
echo.
echo Done.
pause
