param(
    [Parameter(Mandatory=$true)][string]$DesktopPath,
    [Parameter(Mandatory=$true)][string]$TargetPath
)
$ErrorActionPreference = 'Stop'
$target = (Resolve-Path -LiteralPath $TargetPath).Path
$desktop = (Resolve-Path -LiteralPath $DesktopPath).Path
if ([IO.Path]::GetFileName($target) -ine 'netmask.exe') { throw 'Choose the installed NetMask executable.' }
if ((Get-Item -LiteralPath $target).VersionInfo.ProductName -notmatch 'NetMask') { throw 'The selected executable is not NetMask.' }
$targetDirectory = Split-Path -Parent $target
if (Test-Path -LiteralPath (Join-Path $targetDirectory 'resources\app.asar')) { throw 'Choose the installed Tauri copy of NetMask.' }
$sourceIcon = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\src-tauri\icons\icon.ico')).Path
$iconHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceIcon).Hash.Substring(0, 10).ToLowerInvariant()
$icon = Join-Path $targetDirectory ('netmask-brand-' + $iconHash + '.ico')
$shortcutPath = Join-Path $desktop 'NetMask.lnk'
$backupDirectory = Join-Path $PSScriptRoot '..\.tmp\shortcut-backup'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
if (Test-Path -LiteralPath $shortcutPath) { Copy-Item -LiteralPath $shortcutPath -Destination (Join-Path $backupDirectory ('NetMask-' + [Guid]::NewGuid().ToString('N') + '.lnk')) }
Copy-Item -LiteralPath $sourceIcon -Destination $icon -Force
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = Split-Path -Parent $target
$shortcut.Arguments = ''
$shortcut.Description = 'NetMask - local network names and diagnostics'
$shortcut.IconLocation = "$icon,0"
$shortcut.Save()
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class NetMaskShellRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr first, IntPtr second); }'
[NetMaskShellRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
$verified = $shell.CreateShortcut($shortcutPath)
if ($verified.TargetPath -ine $target -or $verified.IconLocation -ine "$icon,0") { throw 'Shortcut verification failed.' }
[PSCustomObject]@{ Shortcut=$shortcutPath; Target=$verified.TargetPath; Icon=$verified.IconLocation } | ConvertTo-Json
