$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$dest = Join-Path $env:ProgramFiles 'NetMask'
$data = Join-Path $env:ProgramData 'NetMask'
$bkTxt   = Join-Path $data 'names.txt'
$bkJson  = Join-Path $data 'names.json'

$hasRenamed = (Test-Path $bkTxt) -or (Test-Path $bkJson)
if ($hasRenamed) {
  $a = Read-Host 'Some network names were changed. Restore the original names first? (Y/n)'
  if ($a -ne 'n' -and $a -ne 'N') {
    $base = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles'
    if (Test-Path $bkJson) {
      try {
        $json = Get-Content $bkJson -Raw | ConvertFrom-Json
        foreach ($p in $json.PSObject.Properties) {
          Set-ItemProperty -Path (Join-Path $base $p.Name) -Name ProfileName -Value $p.Value
        }
      } catch {}
    }
    if (Test-Path $bkTxt) {
      foreach ($line in Get-Content $bkTxt -Encoding Unicode) {
        $i = $line.IndexOf('|'); if ($i -lt 1) { continue }
        Set-ItemProperty -Path (Join-Path $base $line.Substring(0,$i)) -Name ProfileName -Value $line.Substring($i+1).Trim()
      }
    }
  }
}
Remove-Item (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'NetMask.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'NetMask.lnk') -Force
Remove-Item 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\NetMask' -Recurse -Force
Remove-Item $data -Recurse -Force
Start-Process cmd -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$dest`"" -WindowStyle Hidden
Write-Host 'NetMask has been removed.' -ForegroundColor Cyan
Start-Sleep 2
