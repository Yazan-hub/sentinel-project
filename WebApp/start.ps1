# Sentinel Platform - start the pilot backend (one command).
#   Right-click > Run with PowerShell, or:  ./start.ps1
# Leave this window open while you use the app. Ctrl+C to stop.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "  Sentinel Platform - pilot backend" -ForegroundColor Cyan
Write-Host "  ---------------------------------" -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  Node.js not found. Install the LTS from https://nodejs.org and re-run." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "  First run: installing dependencies (a minute or two)..." -ForegroundColor Yellow
  npm install
}

# Warn if the port is already taken (a service may already be running).
$inUse = Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue
if ($inUse) {
  Write-Host "  Port 4100 is already in use - a Sentinel service may already be running." -ForegroundColor Yellow
  Write-Host "  If the app cannot reach it, close the other window and re-run this." -ForegroundColor Yellow
  exit 0
}

Write-Host "  Starting the Sentinel service on http://localhost:4100" -ForegroundColor Green
Write-Host "  Now open the Sentinel app (That Open Platform) in your browser."
Write-Host "  Keep this window open. Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""
node bridge/bcf-service.mjs
