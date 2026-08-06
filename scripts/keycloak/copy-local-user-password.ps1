[CmdletBinding()]
param(
    [ValidateSet('alice', 'bob')]
    [string]$User = 'alice'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deuceSecretPath = Join-Path `
    ([Environment]::GetFolderPath('LocalApplicationData')) `
    "Deuce\keycloak\$User-password.dpapi"
if (-not (Test-Path -LiteralPath $deuceSecretPath -PathType Leaf)) {
    throw 'Start the local Keycloak environment first.'
}

$deuceSecurePassword = Get-Content -Raw -LiteralPath $deuceSecretPath |
    ConvertTo-SecureString
$deucePasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
    $deuceSecurePassword
)
try {
    $deucePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $deucePasswordPointer
    )
    Set-Clipboard -Value $deucePassword
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($deucePasswordPointer)
}

Write-Output "$User local password was copied to the clipboard."
