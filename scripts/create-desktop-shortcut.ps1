$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$targetPath = Join-Path -Path $projectRoot -ChildPath "start-vpn-ip-guard.bat"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path -Path $desktopPath -ChildPath "VPN IP Guard.lnk"

if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
    throw "Startup batch file not found: $targetPath"
}

if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
}

$shell = New-Object -ComObject "WScript.Shell"
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "VPN IP Guard one-click launcher"
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
