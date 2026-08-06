param(
  [ValidateRange(1, 65535)]
  [int]$Port = 9000
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Get-PortListeners {
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

$listeners = Get-PortListeners
if ($listeners.Count -eq 0) {
  Write-Host "No listener found on port $Port."
  exit 0
}

$ownedProcessIds = [System.Collections.Generic.HashSet[int]]::new()
foreach ($connection in $listeners) {
  $ownerPid = [int]$connection.OwningProcess
  if ($ownerPid -le 0) {
    Write-Error "Refusing to stop invalid owner PID $ownerPid on port $Port."
    exit 1
  }

  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid"
  } catch {
    Write-Error "Could not inspect PID $ownerPid on port $Port."
    exit 1
  }

  if (-not $processInfo) {
    Write-Error "Could not resolve PID $ownerPid on port $Port."
    exit 1
  }

  $commandLine = [string]$processInfo.CommandLine
  $normalizedCommand = $commandLine.ToLowerInvariant()
  $normalizedRoot = $projectRoot.ToLowerInvariant()
  $isStableProjectProcess = $normalizedCommand.Contains($normalizedRoot) -and (
    $normalizedCommand -match 'scripts[\\/]+start-stable\.js' -or
    $normalizedCommand -match '@medusajs[\\/]+cli[\\/]+cli\.js.+\bstart\b' -or
    $normalizedCommand -match 'npm(?:-cli\.js|\.cmd)?.+admin:stable'
  )

  if (-not $isStableProjectProcess) {
    Write-Error "Refusing to stop unrelated PID $ownerPid on port $Port."
    exit 1
  }

  [void]$ownedProcessIds.Add($ownerPid)
}

if ($ownedProcessIds.Count -eq 0) {
  Write-Error "No confirmed project process owns port $Port."
  exit 1
}

foreach ($ownerPid in $ownedProcessIds) {
  try {
    Stop-Process -Id $ownerPid -Force -ErrorAction Stop
  } catch {
    Write-Error "Failed to stop confirmed project PID $ownerPid on port $Port."
    exit 1
  }
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if ((Get-PortListeners).Count -eq 0) {
    Write-Host "Port $Port is free after stopping confirmed project process(es)."
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Write-Error "Confirmed project process stop did not free port $Port."
exit 1
