# test-all.ps1
#
# Root-level PowerShell script to run the eatsie-project quality gate.
# Runs backend and frontend type checks, builds, tests, and database integrity audits.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "          EATSIE FULL PROJECT QUALITY GATE RUNNER         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$results = [ordered]@{
    "Backend TypeScript"  = "PENDING"
    "Backend Unit"        = "PENDING"
    "Backend Integration" = "PENDING"
    "Database Audit"      = "PENDING"
    "Frontend Unit"       = "PENDING"
    "Frontend Lint"       = "PENDING"
    "Frontend Build"      = "PENDING"
    "Backend Build"       = "PENDING"
    "Price Anomalies"     = "PENDING"
    "Historical Repair"   = "PENDING"
}

$script:anyFailed = $false

function Run-CommandInDir {
    param (
        [Parameter(Mandatory = $true)]
        [string]$dir,

        [Parameter(Mandatory = $true)]
        [string]$command,

        [Parameter(Mandatory = $true)]
        [string]$argsList,

        [Parameter(Mandatory = $true)]
        [string]$key
    )

    Write-Host ""
    Write-Host (
        "--- Running {0}: {1} {2} in {3} ---" -f `
        $key,
        $command,
        $argsList,
        $dir
    ) -ForegroundColor Yellow

    Push-Location $dir

    try {
        $process = Start-Process `
            -FilePath $command `
            -ArgumentList $argsList `
            -NoNewWindow `
            -PassThru `
            -Wait

        if ($process.ExitCode -eq 0) {

            $script:results[$key] = "PASS"

            Write-Host (
                "[PASS] {0} completed successfully." -f $key
            ) -ForegroundColor Green

        }
        else {

            $script:results[$key] = "FAIL"
            $script:anyFailed = $true

            Write-Host (
                "[FAIL] {0} failed with exit code {1}." -f `
                $key,
                $process.ExitCode
            ) -ForegroundColor Red
        }
    }
    catch {

        $script:results[$key] = "FAIL"
        $script:anyFailed = $true

        Write-Host (
            "[FAIL] {0} encountered an execution error: {1}" -f `
            $key,
            $_.Exception.Message
        ) -ForegroundColor Red
    }
    finally {

        Pop-Location

        Write-Host ""
    }
}

# ==========================================================
# 1. Backend TypeScript
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npx.cmd" `
    -argsList "tsc --noEmit --pretty false" `
    -key "Backend TypeScript"


# ==========================================================
# 2. Backend Unit Tests
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npm.cmd" `
    -argsList "run test" `
    -key "Backend Unit"


# ==========================================================
# 3. Backend Integration Tests
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npm.cmd" `
    -argsList "run test:integration:http" `
    -key "Backend Integration"


# ==========================================================
# 4. Database Integrity Audit
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npm.cmd" `
    -argsList "run audit:db-integrity" `
    -key "Database Audit"


# ==========================================================
# 5. Frontend Unit Tests
# ==========================================================

Run-CommandInDir `
    -dir "frontend" `
    -command "npm.cmd" `
    -argsList "run test -- --run" `
    -key "Frontend Unit"


# ==========================================================
# 6. Frontend Lint
# ==========================================================

Run-CommandInDir `
    -dir "frontend" `
    -command "npm.cmd" `
    -argsList "run lint" `
    -key "Frontend Lint"


# ==========================================================
# 7. Frontend Production Build
# ==========================================================

Run-CommandInDir `
    -dir "frontend" `
    -command "npm.cmd" `
    -argsList "run build" `
    -key "Frontend Build"


# ==========================================================
# 8. Backend Production Build
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npm.cmd" `
    -argsList "run build" `
    -key "Backend Build"


# ==========================================================
# 9. Price Anomaly Report
# READ-ONLY
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npx.cmd" `
    -argsList "medusa exec src/scripts/report-storefront-price-anomalies.ts" `
    -key "Price Anomalies"


# ==========================================================
# 10. Historical Price Repair
# DRY-RUN ONLY
#
# IMPORTANT:
# DO NOT add --apply here.
# Full test suite must never automatically mutate prices.
# ==========================================================

Run-CommandInDir `
    -dir "backend" `
    -command "npx.cmd" `
    -argsList "medusa exec src/scripts/fix-confirmed-storefront-prices.ts" `
    -key "Historical Repair"


# ==========================================================
# FINAL SUMMARY
# ==========================================================

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "              QUALITY GATE RESULTS SUMMARY               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($key in $results.Keys) {

    $status = $results[$key]
    $color = "White"

    if ($status -eq "PASS") {
        $color = "Green"
    }
    elseif ($status -eq "FAIL") {
        $color = "Red"
    }

    Write-Host (
        "{0} : " -f $key.PadRight(25)
    ) -NoNewline

    Write-Host $status -ForegroundColor $color
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan

if ($script:anyFailed) {

    Write-Host " OVERALL STATUS: FAIL" -ForegroundColor Red
    Write-Host " One or more quality checks failed." -ForegroundColor Red
    Write-Host " Review the failing section above and fix it before continuing." -ForegroundColor Red

    Write-Host "==========================================================" -ForegroundColor Cyan

    exit 1
}
else {

    Write-Host " OVERALL STATUS: PASS" -ForegroundColor Green
    Write-Host " All configured terminal quality checks passed successfully!" -ForegroundColor Green

    Write-Host "==========================================================" -ForegroundColor Cyan

    exit 0
}