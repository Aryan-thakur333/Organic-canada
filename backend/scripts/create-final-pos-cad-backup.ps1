param()

$ErrorActionPreference = "Stop"
$reviewPath = Join-Path $PSScriptRoot "..\reports\pos-pilot-cad-price-review.csv"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backupRoot = Join-Path $projectRoot "backups"
$rows = Import-Csv -LiteralPath $reviewPath
$approvedRows = @($rows | Where-Object { $_.approval_status -ceq "APPROVED" })
if ($approvedRows.Count -eq 0) {
  throw "Final CAD backup blocked: the merchant review contains zero exact APPROVED rows"
}

$databaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
if (-not $databaseUrl) {
  $envPath = Join-Path $PSScriptRoot "..\.env"
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($line) { $databaseUrl = $line.Substring("DATABASE_URL=".Length).Trim().Trim('"').Trim("'") }
}
if (-not $databaseUrl) { throw "DATABASE_URL is not configured" }

$pgDump = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
  $candidate = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
  if (Test-Path -LiteralPath $candidate) { $pgDump = $candidate }
}
if (-not $pgDump) { throw "pg_dump.exe was not found" }

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupRoot "before-final-pos-cad-apply-$stamp.backup"
$uri = [Uri]$databaseUrl
$credentials = $uri.UserInfo.Split(':', 2)
$databaseUser = [Uri]::UnescapeDataString($credentials[0])
$databasePassword = if ($credentials.Count -gt 1) { [Uri]::UnescapeDataString($credentials[1]) } else { "" }
$databaseName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
$databasePort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
try {
  $env:PGPASSWORD = $databasePassword
  & $pgDump --format=custom --file=$backupPath --host=$($uri.Host) --port=$databasePort --username=$databaseUser --dbname=$databaseName
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
$exists = Test-Path -LiteralPath $backupPath
$size = if ($exists) { (Get-Item -LiteralPath $backupPath).Length } else { 0 }
$headerValid = $false
if ($exists -and $size -ge 5) {
  $stream = [System.IO.File]::OpenRead($backupPath)
  try {
    $bytes = New-Object byte[] 5
    [void]$stream.Read($bytes, 0, 5)
    $headerValid = [System.Text.Encoding]::ASCII.GetString($bytes) -ceq "PGDMP"
  } finally { $stream.Dispose() }
}
$pgRestore = Join-Path (Split-Path -Parent $pgDump) "pg_restore.exe"
$configuredDatabaseMatch = $false
if ($exists -and (Test-Path -LiteralPath $pgRestore)) {
  $archiveList = & $pgRestore --list $backupPath
  $configuredDatabaseMatch = [bool]($archiveList | Where-Object { $_ -match ('^;\s+dbname:\s+' + [regex]::Escape($databaseName) + '\s*$') })
}
$valid = $exitCode -eq 0 -and $exists -and $size -gt 0 -and $headerValid -and $configuredDatabaseMatch
Write-Output "[FINAL_POS_CAD_BACKUP]"
[ordered]@{ backupPath = $backupPath; exists = $exists; sizeBytes = $size; headerValid = $headerValid; pgDumpExitCode = $exitCode; configuredDatabaseMatch = $configuredDatabaseMatch; valid = $valid } | ConvertTo-Json
if (-not $valid) { throw "Final CAD PostgreSQL backup validation failed" }
