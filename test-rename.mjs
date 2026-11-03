import { execSync } from 'child_process'

const target = 'iPhone'
const newName = 'My Test Wi-Fi'

const psScript = `
$target = '${target.replace(/'/g, "''")}';
$newName = '${newName.replace(/'/g, "''")}';
$base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles';
$renamed = $false;
Get-ChildItem -Path $base -ErrorAction SilentlyContinue | ForEach-Object {
  $p = (Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue).ProfileName;
  if ($_.PSChildName -eq $target -or $p -eq $target) {
    $renamed = $true;
  }
};
Write-Host "Tested search logic. Found: $renamed";
`.trim()

const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`).toString()
console.log('Result:', out.trim())

