<#
.SYNOPSIS
  Helper script to install a local development/open-source certificate into the CurrentUser Trusted Root store,
  preventing Windows SmartScreen warnings for unsigned or self-built NetMask binaries.
.USAGE
  powershell -ExecutionPolicy Bypass -File .\scripts\trust-cert.ps1 -CertPath .\dist\netmask.cer
#>

param(
  [Parameter(Mandatory=$false)]
  [string]$CertPath = ""
)

Write-Host "NetMask SmartScreen & Certificate Helper" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor DarkGray

if ([string]::IsNullOrWhiteSpace($CertPath)) {
  Write-Host "Why Windows shows 'Unknown Publisher':" -ForegroundColor Yellow
  Write-Host "Windows Defender SmartScreen flags any newly released executable that has not yet"
  Write-Host "accumulated community download reputation, or does not carry an expensive ($300+/yr) EV Code Signing certificate.`n"
  
  Write-Host "For Open Source Builds:" -ForegroundColor White
  Write-Host "1. To run without warnings: Click 'More info' -> 'Run anyway' in the SmartScreen prompt." -ForegroundColor Green
  Write-Host "2. Or unblock the downloaded file: Unblock-File -Path .\NetMask-Setup-*.exe" -ForegroundColor Green
  Write-Host "3. Official automated signed releases are built via SignPath.io for open-source projects." -ForegroundColor Green
  exit 0
}

if (-not (Test-Path $CertPath)) {
  Write-Error "Certificate file not found: $CertPath"
  exit 1
}

try {
  Import-Certificate -FilePath $CertPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  Write-Host "Successfully trusted certificate in CurrentUser\Root store." -ForegroundColor Green
} catch {
  Write-Error "Failed to install certificate: $_"
  exit 1
}
