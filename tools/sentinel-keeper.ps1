# Sentinel keeper: keeps the bridge (port 4100) and the outbox watcher running on this PC, and keeps the Tailscale
# Funnel answering, so a stopped bridge no longer means nobody can work (P0 run, 2026-10-23: the bridge stopped twice
# and the Funnel stayed down for hours). See docs/RELIABILITY.md.
#
# Every minute:
#   1. The bridge: http://127.0.0.1:4100/health. No bridge process -> start one at once. A bridge process that has not
#      answered for 3 checks in a row (a big IFC can block it for a while) -> stop it and start a fresh one.
#   2. The outbox watcher (bridge/watch-outbox.mjs): not running -> start it.
#   3. The public address (https://<this PC's Tailscale name>/health): 3 failures in a row while the bridge answers
#      locally -> "tailscale funnel reset" and "tailscale funnel --bg 4100", at most once every 15 minutes, and
#      always once after the keeper restarted the bridge.
# The bridge and the watcher run hidden; their output goes to %APPDATA%\Sentinel\logs (bridge.log, watcher.log), and
# what the keeper did goes to keeper.log there. A bridge you started yourself (tools\bridge-start.cmd) is left alone
# while it answers.
#
# Run once by hand:      powershell -ExecutionPolicy Bypass -File tools\sentinel-keeper.ps1 -Once
# Start it at sign-in:   tools\keeper-install.cmd      Stop it for good: tools\keeper-uninstall.cmd
param(
  [int]$Port = 4100,
  [int]$EverySeconds = 60,
  [switch]$Once
)

$ErrorActionPreference = "Continue"
$Repo = Split-Path -Parent $PSScriptRoot
$WebApp = Join-Path $Repo "WebApp"
$LogDir = Join-Path $env:APPDATA "Sentinel\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$KeeperLog = Join-Path $LogDir "keeper.log"

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  if ((Test-Path $KeeperLog) -and ((Get-Item $KeeperLog).Length -gt 5MB)) { Move-Item -Force $KeeperLog "$KeeperLog.1" }
  Add-Content -Path $KeeperLog -Value $line
  Write-Host $line
}

function Test-Health([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-NodeProcess([string]$ScriptName) {
  @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ScriptName*" })
}

function Start-HiddenNode([string]$Script, [string]$LogName) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { Write-Log "node is not on PATH - install Node.js LTS; nothing started"; return }
  $out = Join-Path $LogDir "$LogName.log"
  $err = Join-Path $LogDir "$LogName.err.log"
  foreach ($f in @($out, $err)) { if (Test-Path $f) { Move-Item -Force $f "$f.1" } }
  Start-Process -FilePath $node -ArgumentList $Script -WorkingDirectory $WebApp -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
}

function Get-PublicHealthUrl {
  try {
    $status = & tailscale status --json 2>$null | ConvertFrom-Json
    $name = "$($status.Self.DNSName)".TrimEnd(".")
    if ($name) { return "https://$name/health" }
  } catch { }
  return $null
}

function Reset-Funnel {
  Write-Log "refreshing the Tailscale Funnel for port $Port"
  & tailscale funnel reset 2>&1 | Out-Null
  & tailscale funnel --bg $Port 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log "the Funnel did not come back on (tailscale exit $LASTEXITCODE) - run tools\public-bridge-on.cmd" }
}

# One keeper per signed-in user.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\SentinelKeeper", [ref]$created)
if (-not $created) { Write-Host "Another Sentinel keeper is already running."; exit 0 }

$localUrl = "http://127.0.0.1:$Port/health"
$bridgeFails = 0
$publicFails = 0
$lastFunnel = [datetime]::MinValue
Write-Log "keeper started (repo $Repo, every $EverySeconds s)"

while ($true) {
  $refreshFunnel = $false

  # 1. The bridge.
  if (Test-Health $localUrl) {
    $bridgeFails = 0
  } else {
    $running = Get-NodeProcess "bcf-service.mjs"
    if ($running.Count -gt 0) { $bridgeFails++ }
    if ($running.Count -gt 0 -and $bridgeFails -ge 3) {
      Write-Log "the bridge process ($($running.ProcessId -join ', ')) has not answered for $bridgeFails checks - stopping it"
      $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
      Start-Sleep -Seconds 2
      $running = @()
    }
    if ($running.Count -eq 0) {
      Write-Log "the bridge is not running - starting it"
      Start-HiddenNode "bridge/bcf-service.mjs" "bridge"
      $up = $false
      for ($i = 0; $i -lt 30 -and -not $up; $i++) { Start-Sleep -Seconds 2; $up = Test-Health $localUrl }
      if ($up) { Write-Log "the bridge answers again"; $bridgeFails = 0; $refreshFunnel = $true }
      else { Write-Log "the bridge did not answer within a minute - see $LogDir\bridge.err.log" }
    }
  }

  # 2. The outbox watcher.
  if ((Get-NodeProcess "watch-outbox.mjs").Count -eq 0) {
    Write-Log "the outbox watcher is not running - starting it"
    Start-HiddenNode "bridge/watch-outbox.mjs" "watcher"
  }

  # 3. The public address.
  if (Test-Health $localUrl) {
    $publicUrl = Get-PublicHealthUrl
    if ($publicUrl) {
      if (Test-Health $publicUrl) { $publicFails = 0 } else { $publicFails++ }
      if ($publicFails -ge 3) { $refreshFunnel = $true }
    }
    if ($refreshFunnel -and ((Get-Date) - $lastFunnel).TotalMinutes -ge 15) {
      Reset-Funnel
      $lastFunnel = Get-Date
      $publicFails = 0
    }
  }

  if ($Once) { break }
  Start-Sleep -Seconds $EverySeconds
}

$mutex.ReleaseMutex()
