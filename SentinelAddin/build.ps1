# ============================================================
# Sentinel - build & install for every Revit version you have.
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\build.ps1
# Requires: .NET SDK 8+  (winget install Microsoft.DotNet.SDK.8)
# ============================================================
$ErrorActionPreference = 'Stop'

$addinsRoot = Join-Path $env:APPDATA 'Autodesk\Revit\Addins'
$targets = 2021..2027 | Where-Object { Test-Path (Join-Path $addinsRoot "$_") }

if (-not $targets) {
    Write-Host "No Revit Addins folders found under $addinsRoot" -ForegroundColor Yellow
    Write-Host "Building all versions 2021-2027 without deploy instead."
    $targets = 2021..2027
    $deploy = 'false'
}
else {
    Write-Host "Installed Revit versions detected: $($targets -join ', ')" -ForegroundColor Cyan
    $deploy = 'true'
}

$revitProcess = Get-Process -Name Revit -ErrorAction SilentlyContinue
if ($revitProcess) {
    Write-Host "Revit is running; skipping deployment to avoid locked add-in files." -ForegroundColor Yellow
    $deploy = 'false'
}

$failed = @()
foreach ($v in $targets) {
    Write-Host ""
    Write-Host "=== Building Sentinel for Revit $v ===" -ForegroundColor Green
    dotnet build .\Sentinel.csproj -c Release -p:RevitVersion=$v -p:DeployToRevit=$deploy
    if ($LASTEXITCODE -ne 0) { $failed += $v }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host ("FAILED versions: " + ($failed -join ', ')) -ForegroundColor Red
    exit 1
}

Write-Host "All builds succeeded." -ForegroundColor Green
if ($deploy -eq 'true') {
    Write-Host ("Installed to: " + $addinsRoot + "\\{version}. Restart Revit and accept the load prompt.")
}
