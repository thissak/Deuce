$ErrorActionPreference = 'Stop'

$deuceRoot = Split-Path -Parent $PSScriptRoot
$deuceServerRoot = Join-Path $deuceRoot 'apps\server'
$deuceClientRoot = Join-Path $deuceRoot 'apps\client'
$deucePort = 3211

if (Get-NetTCPConnection -LocalPort $deucePort -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $deucePort is already in use."
}

$deuceDatabaseUrl = [Environment]::GetEnvironmentVariable(
    'DEUCE_TEST_DATABASE_URL',
    'User'
)
if (-not $deuceDatabaseUrl) {
    throw 'DEUCE_TEST_DATABASE_URL is not configured.'
}

$deuceRequiredOidcVariables = @(
    'DEUCE_OIDC_ISSUER',
    'DEUCE_OIDC_AUDIENCE',
    'DEUCE_OIDC_JWKS_URL',
    'DEUCE_OIDC_LOGOUT_AUDIENCE'
)
$deuceOidcEnvironment = @{}
foreach ($deuceVariableName in $deuceRequiredOidcVariables) {
    $deuceValue = [Environment]::GetEnvironmentVariable(
        $deuceVariableName,
        'Process'
    )
    if (-not $deuceValue) {
        $deuceValue = [Environment]::GetEnvironmentVariable(
            $deuceVariableName,
            'User'
        )
    }
    if (-not $deuceValue) {
        throw "$deuceVariableName is not configured."
    }
    $deuceOidcEnvironment[$deuceVariableName] = $deuceValue
}

$deuceAliceAccessToken = [Environment]::GetEnvironmentVariable(
    'DEUCE_LIVE_ACCESS_TOKEN_ALICE',
    'Process'
)
$deuceBobAccessToken = [Environment]::GetEnvironmentVariable(
    'DEUCE_LIVE_ACCESS_TOKEN_BOB',
    'Process'
)
if (-not $deuceAliceAccessToken -or -not $deuceBobAccessToken) {
    throw 'Both DEUCE_LIVE_ACCESS_TOKEN_ALICE and DEUCE_LIVE_ACCESS_TOKEN_BOB are required.'
}

$deuceNode = (Get-Command node).Source
$deuceTsx = Join-Path $deuceServerRoot 'node_modules\tsx\dist\cli.mjs'
$deuceLogRoot = Join-Path $env:TEMP (
    'deuce-live-' + [Guid]::NewGuid().ToString('N')
)
New-Item -ItemType Directory -Path $deuceLogRoot | Out-Null
$deuceDefinesFile = Join-Path $deuceLogRoot 'dart-defines.json'
$deuceDartDefines = @{
    DEUCE_LIVE_SERVER_URL = "http://127.0.0.1:$deucePort"
    DEUCE_LIVE_ACCESS_TOKEN_ALICE = $deuceAliceAccessToken
    DEUCE_LIVE_ACCESS_TOKEN_BOB = $deuceBobAccessToken
} | ConvertTo-Json
[System.IO.File]::WriteAllText(
    $deuceDefinesFile,
    $deuceDartDefines,
    [System.Text.UTF8Encoding]::new($false)
)

$deucePreviousEnvironment = @{
    DEUCE_DATABASE_URL = [Environment]::GetEnvironmentVariable(
        'DEUCE_DATABASE_URL',
        'Process'
    )
    HOST = [Environment]::GetEnvironmentVariable('HOST', 'Process')
    PORT = [Environment]::GetEnvironmentVariable('PORT', 'Process')
}
foreach ($deuceVariableName in $deuceRequiredOidcVariables) {
    $deucePreviousEnvironment[$deuceVariableName] =
        [Environment]::GetEnvironmentVariable($deuceVariableName, 'Process')
}
$deuceServer = $null

try {
    $env:DEUCE_DATABASE_URL = $deuceDatabaseUrl
    $env:HOST = '127.0.0.1'
    $env:PORT = "$deucePort"
    foreach ($deuceVariableName in $deuceRequiredOidcVariables) {
        [Environment]::SetEnvironmentVariable(
            $deuceVariableName,
            $deuceOidcEnvironment[$deuceVariableName],
            'Process'
        )
    }

    $deuceServer = Start-Process `
        -FilePath $deuceNode `
        -ArgumentList @($deuceTsx, 'src\index.ts') `
        -WorkingDirectory $deuceServerRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $deuceLogRoot 'stdout.log') `
        -RedirectStandardError (Join-Path $deuceLogRoot 'stderr.log') `
        -PassThru

    $deuceReady = $false
    for ($deuceAttempt = 0; $deuceAttempt -lt 50; $deuceAttempt += 1) {
        try {
            $deuceHealth = Invoke-RestMethod `
                -Uri "http://127.0.0.1:$deucePort/health" `
                -TimeoutSec 1
            if ($deuceHealth.ok) {
                $deuceReady = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 100
        }
    }

    if (-not $deuceReady) {
        Get-Content -Raw -ErrorAction SilentlyContinue `
            (Join-Path $deuceLogRoot 'stderr.log')
        throw 'Live test server did not become ready.'
    }

    Push-Location $deuceClientRoot
    try {
        & 'C:\Tools\flutter\bin\flutter.bat' test `
            'test\live_chat_controller_test.dart' `
            "--dart-define-from-file=$deuceDefinesFile"
        if ($LASTEXITCODE -ne 0) {
            throw 'Flutter live integration test failed.'
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($deuceServer) {
        $deuceRunningProcess = Get-Process `
            -Id $deuceServer.Id `
            -ErrorAction SilentlyContinue
        if ($deuceRunningProcess) {
            Stop-Process -Id $deuceServer.Id -Force
        }
    }

    foreach ($deuceVariableName in $deucePreviousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $deuceVariableName,
            $deucePreviousEnvironment[$deuceVariableName],
            'Process'
        )
    }

    if (Test-Path -LiteralPath $deuceDefinesFile) {
        Remove-Item -LiteralPath $deuceDefinesFile -Force
    }
}
