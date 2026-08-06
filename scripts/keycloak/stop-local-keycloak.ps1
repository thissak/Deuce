[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deucePidPath = Join-Path `
    ([Environment]::GetFolderPath('LocalApplicationData')) `
    'Deuce\keycloak\keycloak.pid'
if (-not (Test-Path -LiteralPath $deucePidPath -PathType Leaf)) {
    Write-Output 'The local Keycloak PID file does not exist.'
    exit 0
}

$deuceProcessId = [int](Get-Content -Raw -LiteralPath $deucePidPath)
$deuceProcess = Get-CimInstance `
    -ClassName Win32_Process `
    -Filter "ProcessId = $deuceProcessId" `
    -ErrorAction SilentlyContinue
if (-not $deuceProcess) {
    Remove-Item -LiteralPath $deucePidPath -Force
    Write-Output 'The recorded local Keycloak process is no longer running.'
    exit 0
}

if ($deuceProcess.CommandLine -notlike '*keycloak-26.7.0*') {
    throw "PID $deuceProcessId is not the expected local Keycloak process."
}

& taskkill.exe /PID $deuceProcessId /T | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not stop local Keycloak PID $deuceProcessId."
}
Remove-Item -LiteralPath $deucePidPath -Force
Write-Output 'Local Keycloak stopped.'
