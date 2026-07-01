# kill-port-9000.ps1
# Safely stops the process using port 9000 without affecting unrelated processes.
# Run with: powershell -ExecutionPolicy Bypass -File scripts/kill-port-9000.ps1

$port = 9000
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connections) {
  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($owningPid in $pids) {
    try {
      $process = Get-Process -Id $owningPid -ErrorAction Stop
      Write-Host "Stopping process on port $($port): PID $owningPid ($($process.ProcessName))"
      Stop-Process -Id $owningPid -Force
      Write-Host "  -> Stopped."
    } catch {
      Write-Host "Could not stop PID $owningPid - $($_.Exception.Message)"
    }
  }
  Write-Host "Port $port cleared."
} else {
  Write-Host "No process found on port $port."
}
