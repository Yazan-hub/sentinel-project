# Saves the Supabase session-pooler connection string as the user environment variable SENTINEL_BACKUP_DB_URL, which
# tools\sentinel-backup.ps1 reads for its database step. docs/RELIABILITY.md, step B2.
# What you paste is hidden and is never printed, logged or written to a file. A paste that fails a check is asked for
# again here, so it never lands at the normal PowerShell prompt (whose history file keeps every line).
#
# Run once per PC:  powershell -ExecutionPolicy Bypass -File tools\backup-set-db-url.ps1
Write-Host ""
Write-Host "Supabase dashboard > the project > Connect > Session pooler > copy the URI."
Write-Host "Replace [YOUR-PASSWORD] in it with the database password, then paste it here."
Write-Host "(Nothing shows while you type or paste - that is expected. Press Enter when done.)"
Write-Host ""
do {
  $secure = Read-Host -AsSecureString "Connection string"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $url = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

  $checks = [ordered]@{
    "starts with postgresql://"               = ($url -match '^postgres(ql)?://')
    "password filled in (no [YOUR-PASSWORD])" = ($url -notmatch 'YOUR-PASSWORD|\[|\]')
    "session pooler host, port 5432"          = ($url -match 'pooler\.supabase\.com:5432/')
    "user is postgres.<project ref>"          = ($url -match '://postgres\.[a-z0-9]+:')
  }
  $bad = $false
  foreach ($k in $checks.Keys) {
    if ($checks[$k]) { $mark = "ok  " } else { $mark = "FAIL"; $bad = $true }
    Write-Host ("  [{0}] {1}" -f $mark, $k)
  }
  if ($bad) {
    $url = $null
    Write-Host ""
    Write-Host "Not saved. Paste it again below (fix the line marked FAIL first). Ctrl+C to give up."
    Write-Host ""
  }
} while ($bad)
[Environment]::SetEnvironmentVariable("SENTINEL_BACKUP_DB_URL", $url, "User")
$url = $null
$len = ([Environment]::GetEnvironmentVariable("SENTINEL_BACKUP_DB_URL", "User")).Length
Write-Host ""
Write-Host ("Saved SENTINEL_BACKUP_DB_URL for this Windows user ({0} characters). Next: tools\sentinel-backup.ps1" -f $len)
