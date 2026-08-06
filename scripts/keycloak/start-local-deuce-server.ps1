[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deuceProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deuceServerRoot = Join-Path $deuceProjectRoot 'apps\server'
$deuceRuntimeRoot = Join-Path `
    ([Environment]::GetFolderPath('LocalApplicationData')) `
    'Deuce\server'
$deucePidPath = Join-Path $deuceRuntimeRoot 'server.pid'
$deuceStdoutPath = Join-Path $deuceRuntimeRoot 'server.stdout.log'
$deuceStderrPath = Join-Path $deuceRuntimeRoot 'server.stderr.log'

if (Get-NetTCPConnection -State Listen -LocalPort 3210 -ErrorAction SilentlyContinue) {
    throw 'Port 3210 is already in use.'
}

$deuceRequiredEnvironment = @(
    'DEUCE_DATABASE_URL',
    'DEUCE_OIDC_ISSUER',
    'DEUCE_OIDC_AUDIENCE',
    'DEUCE_OIDC_JWKS_URL',
    'DEUCE_OIDC_LOGOUT_AUDIENCE',
    'DEUCE_OIDC_ACCESS_TOKEN_MAX_AGE_SECONDS'
)
foreach ($deuceName in $deuceRequiredEnvironment) {
    $deuceValue = [Environment]::GetEnvironmentVariable($deuceName, 'User')
    if (-not $deuceValue) {
        throw "$deuceName is not configured in the user environment."
    }
    [Environment]::SetEnvironmentVariable(
        $deuceName,
        $deuceValue,
        'Process'
    )
}
$env:HOST = '127.0.0.1'
$env:PORT = '3210'

Push-Location $deuceServerRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw 'The Deuce server build failed.'
    }

    New-Item -ItemType Directory -Force -Path $deuceRuntimeRoot | Out-Null
    $deuceNode = (Get-Command node.exe).Source
    $deuceServerProcess = Start-Process `
        -FilePath $deuceNode `
        -ArgumentList 'dist/index.js' `
        -WorkingDirectory $deuceServerRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $deuceStdoutPath `
        -RedirectStandardError $deuceStderrPath `
        -PassThru
    [IO.File]::WriteAllText(
        $deucePidPath,
        [string]$deuceServerProcess.Id,
        [Text.UTF8Encoding]::new($false)
    )

    $deuceDeadline = (Get-Date).AddSeconds(30)
    $deuceHealth = $null
    while ((Get-Date) -lt $deuceDeadline) {
        if ($deuceServerProcess.HasExited) {
            $deuceErrorTail = Get-Content `
                -LiteralPath $deuceStderrPath `
                -Tail 30 `
                -ErrorAction SilentlyContinue
            throw (
                "Deuce server stopped during startup.`n" +
                $deuceErrorTail
            )
        }
        try {
            $deuceHealth = Invoke-RestMethod `
                -Uri 'http://127.0.0.1:3210/health' `
                -TimeoutSec 2
        }
        catch {
            $deuceHealth = $null
        }
        if ($deuceHealth -and $deuceHealth.ok) {
            break
        }
        Start-Sleep -Milliseconds 500
        $deuceServerProcess.Refresh()
    }

    if (-not $deuceHealth -or -not $deuceHealth.ok) {
        throw 'Deuce server did not become healthy within 30 seconds.'
    }
    Write-Output 'Deuce server is ready at http://127.0.0.1:3210.'
}
finally {
    Pop-Location
}
