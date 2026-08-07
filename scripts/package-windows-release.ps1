[CmdletBinding()]
param(
    [string]$Version = '1.0.0-build1',
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]*$') {
    throw 'Version may contain only letters, numbers, periods, and hyphens.'
}

$deuceProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deuceClientRoot = Join-Path $deuceProjectRoot 'apps\client'
$deuceReleaseRoot = Join-Path `
    $deuceClientRoot `
    'build\windows\x64\runner\Release'
$deuceDistributionRoot = Join-Path $deuceClientRoot 'build\distribution'
$deucePackageName = "Deuce-Windows-x64-$Version"
$deuceStageRoot = Join-Path $deuceDistributionRoot $deucePackageName
$deucePayloadRoot = Join-Path $deuceStageRoot 'Deuce'
$deuceZipPath = Join-Path $deuceDistributionRoot "$deucePackageName.zip"
$deuceChecksumPath = "$deuceZipPath.sha256"
$deuceReadmePath = Join-Path `
    $deuceProjectRoot `
    'config\distribution\windows\README.txt'

if (-not $SkipBuild) {
    Push-Location $deuceClientRoot
    try {
        $env:VCToolsVersion = '14.44.35207'
        & 'C:\Tools\flutter\bin\flutter.bat' build windows --release `
            '--build-name=1.0.0' `
            '--build-number=1' `
            '--dart-define=DEUCE_OIDC_ISSUER=https://ai-macmini.tail098c36.ts.net/keycloak/realms/deuce' `
            '--dart-define=DEUCE_OIDC_CLIENT_ID=deuce-windows' `
            '--dart-define=DEUCE_SERVER_URL=https://ai-macmini.tail098c36.ts.net'
        if ($LASTEXITCODE -ne 0) {
            throw 'The Windows release build failed.'
        }
    }
    finally {
        Pop-Location
    }
}

$deuceRequiredPaths = @(
    (Join-Path $deuceReleaseRoot 'deuce_client.exe'),
    (Join-Path $deuceReleaseRoot 'flutter_windows.dll'),
    (Join-Path $deuceReleaseRoot 'data\app.so'),
    (Join-Path $deuceReleaseRoot 'data\icudtl.dat'),
    $deuceReadmePath
)
foreach ($deuceRequiredPath in $deuceRequiredPaths) {
    if (-not (Test-Path -LiteralPath $deuceRequiredPath)) {
        throw "Required release file is missing: $deuceRequiredPath"
    }
}

New-Item -ItemType Directory -Force -Path $deuceDistributionRoot | Out-Null
$deuceResolvedDistributionRoot =
    (Resolve-Path -LiteralPath $deuceDistributionRoot).Path
foreach ($deuceGeneratedPath in @(
    $deuceStageRoot,
    $deuceZipPath,
    $deuceChecksumPath
)) {
    if (Test-Path -LiteralPath $deuceGeneratedPath) {
        $deuceResolvedGeneratedPath =
            (Resolve-Path -LiteralPath $deuceGeneratedPath).Path
        if (-not $deuceResolvedGeneratedPath.StartsWith(
            "$deuceResolvedDistributionRoot\",
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Refusing to remove a path outside the distribution root: $deuceGeneratedPath"
        }
        Remove-Item -LiteralPath $deuceResolvedGeneratedPath -Recurse -Force
    }
}

New-Item -ItemType Directory -Force -Path $deucePayloadRoot | Out-Null
Copy-Item `
    -Path (Join-Path $deuceReleaseRoot '*') `
    -Destination $deucePayloadRoot `
    -Recurse `
    -Force
Copy-Item `
    -LiteralPath $deuceReadmePath `
    -Destination (Join-Path $deucePayloadRoot 'README.txt') `
    -Force

Compress-Archive `
    -LiteralPath $deucePayloadRoot `
    -DestinationPath $deuceZipPath `
    -CompressionLevel Optimal

$deuceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $deuceZipPath
$deuceChecksumLine = "$($deuceHash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($deuceZipPath))`n"
[IO.File]::WriteAllText(
    $deuceChecksumPath,
    $deuceChecksumLine,
    [Text.UTF8Encoding]::new($false)
)

[PSCustomObject]@{
    Package = $deuceZipPath
    Checksum = $deuceChecksumPath
    Sha256 = $deuceHash.Hash.ToLowerInvariant()
}
