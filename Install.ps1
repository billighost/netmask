$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$src  = Split-Path -Parent $PSCommandPath
$dest = Join-Path $env:ProgramFiles 'NetMask'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$unpacked = Join-Path $src 'dist\win-unpacked'
if (Test-Path $unpacked) {
  Copy-Item (Join-Path $unpacked '*') $dest -Recurse -Force
} else {
  # Fallback: copy dev root
  Copy-Item (Join-Path $src '*') $dest -Recurse -Force
}
Copy-Item (Join-Path $src 'resources\netmask.ico') $dest -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $src 'Uninstall.ps1') $dest -Force

function New-AppShortcut($path) {
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
  $exePath = Join-Path $dest 'NetMask.exe'
  if (Test-Path $exePath) {
    $s.TargetPath = $exePath
    $s.Arguments = ""
  } else {
    $s.TargetPath = 'node.exe'
    $s.Arguments = "`"$dest\scripts\run.js`""
  }
  $s.WorkingDirectory = $dest
  $ico = Join-Path $dest 'resources\netmask.ico'
  if (-not (Test-Path $ico)) { $ico = Join-Path $dest 'netmask.ico' }
  $s.IconLocation = $ico
  $s.Description = 'NetMask - rename how Windows displays your Wi-Fi networks'
  $s.Save()
  $b = [IO.File]::ReadAllBytes($path); $b[0x15] = $b[0x15] -bor 0x20; [IO.File]::WriteAllBytes($path, $b)  # always run as administrator
}
New-AppShortcut (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'NetMask.lnk')
New-AppShortcut (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'NetMask.lnk')

$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\NetMask'
New-Item -Path $k -Force | Out-Null
$vals = @{
  DisplayName='NetMask';
  DisplayVersion='2.0.0';
  Publisher='NetMask';
  InstallLocation=$dest;
  DisplayIcon=(Join-Path $dest 'resources\netmask.ico');
  UninstallString="powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\Uninstall.ps1`""
}
foreach ($n in $vals.Keys) { Set-ItemProperty -Path $k -Name $n -Value $vals[$n] }
Set-ItemProperty -Path $k -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $k -Name NoRepair -Value 1 -Type DWord

Write-Host "`nNetMask v2.0 installed. Look for it on your desktop and in the Start menu." -ForegroundColor Cyan
Read-Host 'Press Enter to close'
