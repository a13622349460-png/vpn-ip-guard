$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configFileName = "vpn-ip-guard.json"
$candidateDirectories = @(
    (Join-Path -Path $env:APPDATA -ChildPath "VPN IP Guard"),
    (Join-Path -Path $env:APPDATA -ChildPath "vpn-ip-guard"),
    (Join-Path -Path $env:APPDATA -ChildPath "Electron")
)

foreach ($directory in $candidateDirectories) {
    $configPath = Join-Path -Path $directory -ChildPath $configFileName
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        Remove-Item -LiteralPath $configPath -Force
    }
}

$message = [string]::Concat(
    [char]0x672C,
    [char]0x5730,
    [char]0x914D,
    [char]0x7F6E,
    [char]0x5DF2,
    [char]0x91CD,
    [char]0x7F6E,
    [char]0x3002
)
Write-Host $message
