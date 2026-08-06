[CmdletBinding()]
param(
    [ValidateSet('alice', 'bob')]
    [string]$User = 'alice'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deuceProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deuceClientRoot = Join-Path $deuceProjectRoot 'apps\client'
$deuceClientPath = Join-Path `
    $deuceClientRoot `
    'build\windows\x64\runner\Release\deuce_client.exe'

foreach ($deuceUrl in @(
    'http://127.0.0.1:8080/realms/deuce/.well-known/openid-configuration',
    'http://127.0.0.1:3210/health'
)) {
    try {
        Invoke-RestMethod -Uri $deuceUrl -TimeoutSec 3 | Out-Null
    }
    catch {
        throw "Required local service is unavailable: $deuceUrl"
    }
}

Push-Location $deuceClientRoot
try {
    $env:VCToolsVersion = '14.44.35207'
    & 'C:\Tools\flutter\bin\flutter.bat' build windows --release `
        '--dart-define=DEUCE_OIDC_ISSUER=http://127.0.0.1:8080/realms/deuce' `
        '--dart-define=DEUCE_OIDC_CLIENT_ID=deuce-windows' `
        '--dart-define=DEUCE_SERVER_URL=http://127.0.0.1:3210'
    if ($LASTEXITCODE -ne 0) {
        throw 'The Windows client build failed.'
    }
}
finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot 'copy-local-user-password.ps1') -User $User
Start-Process -FilePath $deuceClientPath | Out-Null
Write-Output (
    "The Windows app is running. Username: $User; password: clipboard."
)
