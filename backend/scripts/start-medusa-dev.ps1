<#
.SYNOPSIS
    Safe development launcher for the Eatsie / Organic Canada Medusa v2 backend.

.DESCRIPTION
    Validates environment, checks port 9000, detects stale Medusa processes,
    optionally removes .medusa build output, starts npm run dev, and waits for
    health readiness.

    STABLE ADMIN URL IS ALWAYS: http://localhost:9000/app
    Do NOT use ephemeral Vite HMR ports. Hard-reload the Admin page after restart.

.PARAMETER Clean
    When specified, removes the .medusa directory (generated build output) before
    starting. Never touches source files, database, reports, node_modules, or .env.

.PARAMETER Port
    Backend port (default: 9000).

.EXAMPLE
    .\scripts\start-medusa-dev.ps1
    .\scripts\start-medusa-dev.ps1 -Clean

.NOTES
    TypeScript: npx.cmd tsc --noEmit --pretty false
    Build:      npm.cmd run build
    Dev:        npm.cmd run dev        <- this script runs this
    Stable:     npm.cmd start          <- medusa start (no HMR)
    Health:     http://localhost:9000/health
#>

[CmdletBinding()]
param(
    [switch]$Clean,
    [int]$Port = 9000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

# ── Config ────────────────────────────────────────────────────────────────────

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MedusaBuildDir = Join-Path $ProjectRoot ".medusa"
$DotEnvPath    = Join-Path $ProjectRoot ".env"
$PackageJson   = Join-Path $ProjectRoot "package.json"
$NodeModules   = Join-Path $ProjectRoot "node_modules"
$ReportsDir    = Join-Path $ProjectRoot "reports"

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Header([string]$text) {
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Step([string]$text) {
    Write-Host "  ▶  $text" -ForegroundColor White
}

function Write-OK([string]$text) {
    Write-Host "  ✅  $text" -ForegroundColor Green
}

function Write-Warn([string]$text) {
    Write-Host "  ⚠️   $text" -ForegroundColor Yellow
}

function Write-Fail([string]$text) {
    Write-Host "  ❌  $text" -ForegroundColor Red
}

# ── Guard: must be run from project context ───────────────────────────────────

function Assert-ProjectDirectory {
    if (-not (Test-Path $PackageJson)) {
        Write-Fail "package.json not found at: $ProjectRoot"
        Write-Fail "Run this script from the backend directory or its scripts subdirectory."
        exit 1
    }
    $pkg = Get-Content $PackageJson | ConvertFrom-Json
    if ($pkg.name -ne "backend") {
        Write-Fail "package.json name is '$($pkg.name)' — expected 'backend'. Wrong project directory?"
        exit 1
    }
    Write-OK "Project root confirmed: $ProjectRoot"
}

# ── Guard: node_modules ───────────────────────────────────────────────────────

function Assert-NodeModules {
    if (-not (Test-Path $NodeModules)) {
        Write-Fail "node_modules not found. Run:  npm install"
        exit 1
    }
    Write-OK "node_modules present"
}

# ── Guard: .env ───────────────────────────────────────────────────────────────

function Assert-DotEnv {
    if (-not (Test-Path $DotEnvPath)) {
        Write-Fail ".env file not found at: $DotEnvPath"
        Write-Fail "Copy .env.template and fill in the required values."
        exit 1
    }
    Write-OK ".env file found"
}

# ── Port check ────────────────────────────────────────────────────────────────

function Get-PortOwner([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return $null }

    $owners = @()
    foreach ($conn in $conns) {
        $owningPid = $conn.OwningProcess
        try {
            $proc = Get-Process -Id $owningPid -ErrorAction Stop
            $cmdLine = ""
            try {
                $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
                if ($wmi) { $cmdLine = $wmi.CommandLine }
            } catch { }
            $owners += [PSCustomObject]@{
                Pid       = $owningPid
                Name      = $proc.ProcessName
                CmdLine   = $cmdLine
                IsNode    = ($proc.ProcessName -match "node")
                IsMedusa  = ($cmdLine -match "medusa" -or $cmdLine -match "start-dev")
            }
        } catch {
            $owners += [PSCustomObject]@{
                Pid = $owningPid; Name = "unknown"; CmdLine = ""; IsNode = $false; IsMedusa = $false
            }
        }
    }
    return $owners
}

function Assert-PortAvailable([int]$port) {
    $owners = Get-PortOwner $port
    if (-not $owners) {
        Write-OK "Port $port is available"
        return
    }

    Write-Header "PORT $port IS IN USE"
    foreach ($owner in $owners) {
        Write-Warn "PID $($owner.Pid) — $($owner.Name)"
        if ($owner.CmdLine) {
            Write-Host "       CmdLine: $($owner.CmdLine.Substring(0, [Math]::Min(120, $owner.CmdLine.Length)))" -ForegroundColor Gray
        }
    }

    # Determine if all owners are Medusa / Node project processes
    $allAreMedusa = ($owners | Where-Object { -not $_.IsNode }).Count -eq 0

    if ($allAreMedusa) {
        Write-Warn "The occupying process appears to be a Medusa/Node process."
        Write-Host ""
        Write-Host "  OPTIONS:" -ForegroundColor Yellow
        Write-Host "    1. Stop it manually: npm.cmd run kill:9000" -ForegroundColor Yellow
        Write-Host "    2. Or run:           Stop-Process -Id $($owners[0].Pid) -Force" -ForegroundColor Yellow
        Write-Host "    3. Then re-run this script." -ForegroundColor Yellow
    } else {
        Write-Warn "The occupying process is NOT a Medusa/Node process."
        Write-Host "  This script will NOT kill unrelated processes." -ForegroundColor Red
        Write-Host "  Identify and stop PID $($owners[0].Pid) ($($owners[0].Name)) manually." -ForegroundColor Red
    }

    Write-Host ""
    Write-Fail "Cannot start: port $port is occupied. Resolve the conflict and retry."
    exit 1
}

# ── Clean build output ────────────────────────────────────────────────────────

function Invoke-Clean {
    if (Test-Path $MedusaBuildDir) {
        Write-Step "Removing generated .medusa directory..."
        Remove-Item -Recurse -Force $MedusaBuildDir
        Write-OK ".medusa removed"
    } else {
        Write-OK ".medusa directory does not exist — nothing to clean"
    }

    # Safety check: never delete these
    foreach ($protected in @($DotEnvPath, $ReportsDir, $NodeModules)) {
        if (-not (Test-Path $protected)) { continue }
        Write-OK "Protected path preserved: $protected"
    }
}

# ── Wait for health ───────────────────────────────────────────────────────────

function Wait-ForHealth([int]$port, [int]$timeoutSeconds = 90) {
    $url = "http://localhost:$port/health"
    Write-Step "Waiting for $url (timeout: ${timeoutSeconds}s)..."
    $elapsed = 0
    $interval = 3
    while ($elapsed -lt $timeoutSeconds) {
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-OK "Health check passed (${elapsed}s elapsed)"
                return $true
            }
        } catch {
            Write-Host "    ... waiting ($($elapsed)s/$($timeoutSeconds)s)" -ForegroundColor Gray
        }
    }
    Write-Warn "Health check timed out after ${timeoutSeconds}s. The server may still be starting."
    return $false
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Header "EATSIE MEDUSA v2 — DEVELOPMENT LAUNCHER"

Write-Step "Project root: $ProjectRoot"
Write-Step "Mode: DEVELOPMENT (medusa develop — hot reload)"
Write-Step "Stable Admin URL: http://localhost:$Port/app"
Write-Host ""
Write-Host "  ℹ️  VITE HMR NOTE:" -ForegroundColor Cyan
Write-Host "     Medusa Admin uses an ephemeral Vite port for HMR during development." -ForegroundColor Cyan
Write-Host "     Always use http://localhost:$Port/app — never the ephemeral port." -ForegroundColor Cyan
Write-Host "     If connection is lost, hard-reload: Ctrl+Shift+R on that URL." -ForegroundColor Cyan
Write-Host ""

Assert-ProjectDirectory
Assert-NodeModules
Assert-DotEnv
Assert-PortAvailable $Port

if ($Clean) {
    Write-Header "CLEAN MODE"
    Invoke-Clean
}

Write-Header "STARTING MEDUSA DEV SERVER"
Write-Step "Running: npm.cmd run dev"
Write-Host ""

Set-Location $ProjectRoot

# Start the dev process and stream output
& npm.cmd run dev

# If npm exits, surface the exit code
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Fail "Medusa dev process exited with code $exitCode"
    exit $exitCode
}
