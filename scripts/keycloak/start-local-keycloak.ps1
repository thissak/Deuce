[CmdletBinding()]
param(
    [string]$KeycloakRoot = 'C:\Tools\keycloak-26.7.0'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deuceProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deuceRealmSource = Join-Path `
    $deuceProjectRoot `
    'config\keycloak\deuce-local-realm.json'
$deuceRuntimeRoot = Join-Path `
    ([Environment]::GetFolderPath('LocalApplicationData')) `
    'Deuce\keycloak'
$deuceImportRoot = Join-Path $KeycloakRoot 'data\import'
$deucePidPath = Join-Path $deuceRuntimeRoot 'keycloak.pid'
$deuceStdoutPath = Join-Path $deuceRuntimeRoot 'keycloak.stdout.log'
$deuceStderrPath = Join-Path $deuceRuntimeRoot 'keycloak.stderr.log'
$deuceAdminSecretPath = Join-Path $deuceRuntimeRoot 'admin-password.dpapi'
$deuceAliceSecretPath = Join-Path $deuceRuntimeRoot 'alice-password.dpapi'
$deuceBobSecretPath = Join-Path $deuceRuntimeRoot 'bob-password.dpapi'
$deuceIssuer = 'http://127.0.0.1:8080/realms/deuce'
$deuceDiscoveryUrl = "$deuceIssuer/.well-known/openid-configuration"

$deuceUserIds = @{
    alice = '7ea9c83a-e8c8-4e9b-908b-a83aa9827b15'
    bob = '564b34aa-4046-46c7-a84f-9cabf38e88c4'
}

function Get-DeuceJavaHome {
    $deuceJdk = Get-ChildItem `
        -Directory `
        -Path 'C:\Program Files\Microsoft' `
        -Filter 'jdk-25*' `
        -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if (-not $deuceJdk) {
        throw 'Microsoft OpenJDK 25 is required.'
    }
    return $deuceJdk.FullName
}

function Get-DeuceLocalPassword {
    param([Parameter(Mandatory)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $deuceSecurePassword = Get-Content -Raw -LiteralPath $Path |
            ConvertTo-SecureString
    }
    else {
        $deuceRandomBytes = New-Object byte[] 18
        $deuceRandomNumberGenerator =
            [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $deuceRandomNumberGenerator.GetBytes($deuceRandomBytes)
        }
        finally {
            $deuceRandomNumberGenerator.Dispose()
        }
        $deucePlainPassword =
            [BitConverter]::ToString($deuceRandomBytes).
                Replace('-', '').ToLowerInvariant() + '!Aa1'
        $deuceSecurePassword = ConvertTo-SecureString `
            -String $deucePlainPassword `
            -AsPlainText `
            -Force
        $deuceProtectedPassword = ConvertFrom-SecureString $deuceSecurePassword
        [IO.File]::WriteAllText(
            $Path,
            $deuceProtectedPassword,
            [Text.UTF8Encoding]::new($false)
        )
    }

    $deucePasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $deuceSecurePassword
    )
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $deucePasswordPointer
        )
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($deucePasswordPointer)
    }
}

function Test-DeuceKeycloakReady {
    try {
        $deuceDiscovery = Invoke-RestMethod `
            -Uri $deuceDiscoveryUrl `
            -TimeoutSec 3
        return $deuceDiscovery.issuer -eq $deuceIssuer
    }
    catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $KeycloakRoot -PathType Container)) {
    throw "Keycloak was not found at $KeycloakRoot."
}
if (-not (Test-Path -LiteralPath $deuceRealmSource -PathType Leaf)) {
    throw "Realm import was not found at $deuceRealmSource."
}

New-Item -ItemType Directory -Force -Path $deuceRuntimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $deuceImportRoot | Out-Null
Copy-Item `
    -LiteralPath $deuceRealmSource `
    -Destination (Join-Path $deuceImportRoot 'deuce-realm.json') `
    -Force

$deuceAdminPassword = Get-DeuceLocalPassword -Path $deuceAdminSecretPath
$deuceAlicePassword = Get-DeuceLocalPassword -Path $deuceAliceSecretPath
$deuceBobPassword = Get-DeuceLocalPassword -Path $deuceBobSecretPath

if (-not (Test-DeuceKeycloakReady)) {
    $deuceJavaHome = Get-DeuceJavaHome
    $deucePreviousEnvironment = @{
        JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Process')
        KC_BOOTSTRAP_ADMIN_USERNAME = [Environment]::GetEnvironmentVariable(
            'KC_BOOTSTRAP_ADMIN_USERNAME',
            'Process'
        )
        KC_BOOTSTRAP_ADMIN_PASSWORD = [Environment]::GetEnvironmentVariable(
            'KC_BOOTSTRAP_ADMIN_PASSWORD',
            'Process'
        )
    }

    try {
        $env:JAVA_HOME = $deuceJavaHome
        $env:KC_BOOTSTRAP_ADMIN_USERNAME = 'deuce-local-admin'
        $env:KC_BOOTSTRAP_ADMIN_PASSWORD = $deuceAdminPassword

        $deuceKeycloakProcess = Start-Process `
            -FilePath (Join-Path $KeycloakRoot 'bin\kc.bat') `
            -ArgumentList @(
                'start-dev',
                '--http-host=127.0.0.1',
                '--http-port=8080',
                '--hostname=http://127.0.0.1:8080',
                '--hostname-strict=true',
                '--import-realm'
            ) `
            -WorkingDirectory $KeycloakRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $deuceStdoutPath `
            -RedirectStandardError $deuceStderrPath `
            -PassThru

        [IO.File]::WriteAllText(
            $deucePidPath,
            "$($deuceKeycloakProcess.Id)",
            [Text.UTF8Encoding]::new($false)
        )

        $deuceDeadline = (Get-Date).AddMinutes(2)
        while ((Get-Date) -lt $deuceDeadline) {
            if ($deuceKeycloakProcess.HasExited) {
                $deuceOutputTail = Get-Content `
                    -LiteralPath $deuceStdoutPath `
                    -Tail 30 `
                    -ErrorAction SilentlyContinue
                $deuceErrorTail = Get-Content `
                    -LiteralPath $deuceStderrPath `
                    -Tail 30 `
                    -ErrorAction SilentlyContinue
                throw (
                    "Keycloak stopped during startup.`n" +
                    $deuceOutputTail +
                    "`n" +
                    $deuceErrorTail
                )
            }
            if (Test-DeuceKeycloakReady) {
                break
            }
            Start-Sleep -Seconds 2
            $deuceKeycloakProcess.Refresh()
        }

        if (-not (Test-DeuceKeycloakReady)) {
            throw 'Keycloak did not become ready within two minutes.'
        }
    }
    finally {
        foreach ($deuceName in $deucePreviousEnvironment.Keys) {
            [Environment]::SetEnvironmentVariable(
                $deuceName,
                $deucePreviousEnvironment[$deuceName],
                'Process'
            )
        }
    }
}

$deuceAdminTokenResponse = Invoke-RestMethod `
    -Method Post `
    -Uri 'http://127.0.0.1:8080/realms/master/protocol/openid-connect/token' `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{
        client_id = 'admin-cli'
        grant_type = 'password'
        username = 'deuce-local-admin'
        password = $deuceAdminPassword
    }
$deuceAdminHeaders = @{
    Authorization = "Bearer $($deuceAdminTokenResponse.access_token)"
}

foreach ($deuceUser in @(
    @{
        Name = 'alice'
        Password = $deuceAlicePassword
        Email = 'alice@deuce.local'
        FirstName = 'Alice'
        LastName = 'Test'
    },
    @{
        Name = 'bob'
        Password = $deuceBobPassword
        Email = 'bob@deuce.local'
        FirstName = 'Bob'
        LastName = 'Test'
    }
)) {
    $deuceProfile = @{
        username = $deuceUser.Name
        enabled = $true
        email = $deuceUser.Email
        emailVerified = $true
        firstName = $deuceUser.FirstName
        lastName = $deuceUser.LastName
        requiredActions = @()
    } | ConvertTo-Json
    Invoke-RestMethod `
        -Method Put `
        -Uri (
            'http://127.0.0.1:8080/admin/realms/deuce/users/' +
            $deuceUserIds[$deuceUser.Name]
        ) `
        -Headers $deuceAdminHeaders `
        -ContentType 'application/json' `
        -Body $deuceProfile | Out-Null

    $deuceCredential = @{
        type = 'password'
        value = $deuceUser.Password
        temporary = $false
    } | ConvertTo-Json
    Invoke-RestMethod `
        -Method Put `
        -Uri (
            'http://127.0.0.1:8080/admin/realms/deuce/users/' +
            $deuceUserIds[$deuceUser.Name] +
            '/reset-password'
        ) `
        -Headers $deuceAdminHeaders `
        -ContentType 'application/json' `
        -Body $deuceCredential | Out-Null
}

$deuceClients = Invoke-RestMethod `
    -Uri 'http://127.0.0.1:8080/admin/realms/deuce/clients?clientId=deuce-windows' `
    -Headers $deuceAdminHeaders
if ($deuceClients.Count -ne 1 -or -not $deuceClients[0].publicClient) {
    throw 'The deuce-windows public client was not imported correctly.'
}

Write-Output "Keycloak is ready at $deuceIssuer."
Write-Output 'Local users alice and bob are ready.'
Write-Output 'Use copy-local-user-password.ps1 to copy a password without printing it.'
