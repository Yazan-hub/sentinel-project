# Sentinel backup: copies what only this PC holds, and dumps the database, to a folder you choose.
# See docs/RELIABILITY.md for what is backed up, what is not, and how to restore.
#
#   1. Files the bridge keeps on this PC: %APPDATA%\Sentinel (cde-files, bimdocs, evidence, sheets, views, outbox, jobs).
#      Copied with robocopy into <Destination>\files: new and changed files only, never deleting anything there,
#      so a file deleted on the PC is still in the backup. The logs folder is skipped.
#   2. The database (projects, documents, the ledger): pg_dump into <Destination>\db\sentinel-<date>.dump, the newest
#      <Keep> dumps kept. Needs PostgreSQL's pg_dump (version 17 or later) on PATH and the connection string in the
#      user environment variable SENTINEL_BACKUP_DB_URL (Supabase dashboard > Connect > Session pooler; it holds the
#      database password, so it is never written into this repository or into the backup folder). Without either,
#      the database step is skipped and the reason is said.
#   Not backed up: WebApp\config\.env (keys; keep them in your password manager) and Revit models (they live where
#   you keep them).
#
# Run by hand:     powershell -ExecutionPolicy Bypass -File tools\sentinel-backup.ps1
# Every day:       tools\backup-install.cmd
param(
  [string]$Destination = (Join-Path $env:USERPROFILE "SentinelBackups"),
  [int]$Keep = 14
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$log = Join-Path $Destination "backup.log"
function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $log -Value $line
  Write-Host $line
}
$ok = $true

# 1. Files on this PC.
$source = Join-Path $env:APPDATA "Sentinel"
if (Test-Path $source) {
  $files = Join-Path $Destination "files"
  robocopy $source $files /E /XD logs /R:1 /W:2 /NP /NFL /NDL /NJH /LOG+:"$log" | Out-Null
  # robocopy: 0 to 7 are success codes (copied, nothing to copy, extra files at the destination); 8 and up failed.
  if ($LASTEXITCODE -ge 8) { Write-Log "files: robocopy failed (exit $LASTEXITCODE) - see the lines above in this log"; $ok = $false }
  else { Write-Log "files: $source copied to $files (robocopy exit $LASTEXITCODE)" }
} else {
  Write-Log "files: $source does not exist on this PC - nothing to copy"
}

# 2. The database.
$dbUrl = [Environment]::GetEnvironmentVariable("SENTINEL_BACKUP_DB_URL", "User")
$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $dbUrl) {
  Write-Log "database: skipped - set SENTINEL_BACKUP_DB_URL once (docs/RELIABILITY.md, step B2)"
  $ok = $false
} elseif (-not $pgDump) {
  Write-Log "database: skipped - pg_dump is not on PATH (docs/RELIABILITY.md, step B1)"
  $ok = $false
} else {
  $dbDir = Join-Path $Destination "db"
  New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
  $dump = Join-Path $dbDir "sentinel-$stamp.dump"
  & $pgDump --dbname=$dbUrl --format=custom --no-owner --no-privileges --file=$dump 2>> $log
  if ($LASTEXITCODE -eq 0 -and (Test-Path $dump) -and (Get-Item $dump).Length -gt 0) {
    Write-Log ("database: dumped to {0} ({1:N1} MB)" -f $dump, ((Get-Item $dump).Length / 1MB))
    Get-ChildItem $dbDir -Filter "sentinel-*.dump" | Sort-Object Name -Descending | Select-Object -Skip $Keep |
      ForEach-Object { Remove-Item $_.FullName; Write-Log "database: removed the old dump $($_.Name) (keeping $Keep)" }
  } else {
    Write-Log "database: pg_dump failed (exit $LASTEXITCODE) - see the lines above in this log"
    if (Test-Path $dump) { Remove-Item $dump }
    $ok = $false
  }
}

if ($ok) { Write-Log "backup finished: everything copied" } else { Write-Log "backup finished with a step skipped or failed - read the lines above" }
