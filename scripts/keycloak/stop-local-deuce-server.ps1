[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deucePidPath = Join-Path `
    ([Environment]::GetFolderPath('LocalApplicationData')) `
    'Deuce\server\server.pid'
if (-not (Test-Path -LiteralPath $deucePidPath -PathType Leaf)) {
    Write-Output 'The local Deuce server PID file does not exist.'
    exit 0
}

$deuceProcessId = [int](Get-Content -Raw -LiteralPath $deucePidPath)
$deuceProcess = Get-CimInstance `
    -ClassName Win32_Process `
    -Filter "ProcessId = $deuceProcessId" `
    -ErrorAction SilentlyContinue
if (-not $deuceProcess) {
    Remove-Item -LiteralPath $deucePidPath -Force
    Write-Output 'The recorded local Deuce server is no longer running.'
    exit 0
}

if (
    $deuceProcess.Name -ne 'node.exe' -or
    $deuceProcess.CommandLine -notlike '*dist/index.js*'
) {
    throw "PID $deuceProcessId is not the expected local Deuce server."
}

Stop-Process -Id $deuceProcessId
Remove-Item -LiteralPath $deucePidPath -Force
Write-Output 'Local Deuce server stopped.'
